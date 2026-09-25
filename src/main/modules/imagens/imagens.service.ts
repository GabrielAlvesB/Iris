import { readStore, writeStore } from '../../storage/jsonStore';
import * as videosService from '../videos/videos.service';
import {
  aplicarCriacaoComum,
  aplicarEdicaoComum,
  conjuntosDoCatalogo,
  criarEtapas,
  garantirSeq,
  migrarBase,
  naoNulo,
  nowIso,
  registrarEdicao,
  texto,
} from '../postagens/postagens.comum';
import {
  IMAGEM_STATUS,
  MAX_SLIDES,
  isFormatoImagem,
  isImagemStatus,
  type ArquivarImagemInput,
  type AtualizarImagemInput,
  type CriarImagemInput,
  type Imagem,
  type ImagemStatus,
  type ImagensFile,
  type MoverImagemInput,
} from '../../../shared/types/imagens.types';
import { hashtagsDoTexto } from '../../../shared/types/videos.conversao';

/**
 * Publicações de imagem. Tags e redes vêm do catálogo de postagens (guardado
 * em videos.json); ids que sumiram de lá são descartados na leitura.
 */

const FILE_NAME = 'imagens.json';
const SCHEMA_VERSION = 1;

const etapas = criarEtapas<ImagemStatus, Imagem>(IMAGEM_STATUS);
const { rotuloStatus, registrar, renumerar } = etapas;

function createDefaultFile(): ImagensFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), seqAtual: 0, imagens: [] };
}

function slidesValidos(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 2 && valor <= MAX_SLIDES ? valor : undefined;
}

function migrateImagem(raw: unknown, catalogo: { tagIds: Set<string>; redeIds: Set<string> }): Imagem | null {
  const base = migrarBase(raw, catalogo, isImagemStatus, 'ideia');
  if (!base) return null;
  const c = (raw ?? {}) as Partial<Imagem>;
  const formato = isFormatoImagem(c.formato) ? c.formato : 'quadrado';
  const legenda = texto(c.legenda);
  return {
    ...base,
    formato,
    quantidadeSlides: formato === 'carrossel' ? slidesValidos(c.quantidadeSlides) : undefined,
    briefing: texto(c.briefing),
    textoNaArte: texto(c.textoNaArte),
    legenda,
    // Derivado: as #hashtags escritas na legenda. Se a regra mudar, o arquivo se alinha sozinho.
    hashtags: hashtagsDoTexto(legenda),
    textoAlternativo: texto(c.textoAlternativo),
    cta: texto(c.cta),
    link: texto(c.link),
    creditos: texto(c.creditos),
  };
}

function migrateImagensFile(raw: unknown): ImagensFile {
  const c = (raw ?? {}) as Partial<ImagensFile>;
  const catalogo = conjuntosDoCatalogo(videosService.getCatalogo());
  const imagens = Array.isArray(c.imagens) ? c.imagens.map((i) => migrateImagem(i, catalogo)).filter(naoNulo) : [];
  const seqAtual = garantirSeq(imagens, typeof c.seqAtual === 'number' ? c.seqAtual : 0);
  renumerar(imagens);
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: c.updatedAt ?? nowIso(),
    seqAtual,
    imagens,
  };
}

function loadFile(): ImagensFile {
  return readStore(FILE_NAME, createDefaultFile, migrateImagensFile);
}

async function saveFile(file: ImagensFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

function encontrar(file: ImagensFile, imagemId: string): Imagem {
  const imagem = file.imagens.find((i) => i.id === imagemId);
  if (!imagem) throw new Error('Publicação não encontrada — ela pode ter sido excluída.');
  return imagem;
}

// ---------- API do service ----------

export async function getFile(): Promise<ImagensFile> {
  return loadFile();
}

export async function getFullFile(): Promise<ImagensFile> {
  return loadFile();
}

export async function replaceFile(file: ImagensFile): Promise<ImagensFile> {
  // Passa pela migração: um backup de outra versão entra já normalizado.
  const normalizado = migrateImagensFile(file);
  await saveFile(normalizado);
  return normalizado;
}

export async function criarImagem(input: CriarImagemInput): Promise<ImagensFile> {
  const titulo = input.titulo.trim();
  if (!titulo) throw new Error('Dê um nome à publicação.');
  const status = isImagemStatus(input.status) ? input.status : 'ideia';

  const file = loadFile();
  file.seqAtual += 1;
  const imagem: Imagem = {
    ...etapas.nova(file.imagens, file.seqAtual, titulo, status),
    formato: isFormatoImagem(input.formato) ? input.formato : 'quadrado',
    briefing: '',
    textoNaArte: '',
    legenda: '',
    hashtags: [],
    textoAlternativo: '',
    cta: '',
    link: '',
    creditos: '',
  };
  aplicarCriacaoComum(imagem, input, videosService.getCatalogo());
  registrar(imagem, { tipo: 'criado', para: rotuloStatus(status) });
  file.imagens.push(imagem);
  renumerar(file.imagens);
  etapas.seguirAgenda(file.imagens, imagem);

  await saveFile(file);
  return file;
}

const CAMPOS_TEXTO = [
  ['briefing', 'briefing'],
  ['textoNaArte', 'texto na arte'],
  ['textoAlternativo', 'texto alternativo'],
  ['cta', 'CTA'],
  ['link', 'link'],
  ['creditos', 'créditos'],
] as const;

export async function atualizarImagem(input: AtualizarImagemInput): Promise<ImagensFile> {
  const file = loadFile();
  const imagem = encontrar(file, input.imagemId);
  const alterados = aplicarEdicaoComum(imagem, input, videosService.getCatalogo(), (e) => registrar(imagem, e));

  if (input.formato !== undefined && isFormatoImagem(input.formato) && input.formato !== imagem.formato) {
    imagem.formato = input.formato;
    if (input.formato !== 'carrossel') imagem.quantidadeSlides = undefined;
    alterados.push('formato');
  }
  if (input.quantidadeSlides !== undefined) {
    imagem.quantidadeSlides = imagem.formato === 'carrossel' ? slidesValidos(input.quantidadeSlides) : undefined;
  }
  CAMPOS_TEXTO.forEach(([campo, rotulo]) => {
    const valor = input[campo];
    if (valor !== undefined && valor !== imagem[campo]) {
      imagem[campo] = valor;
      alterados.push(rotulo);
    }
  });
  if (input.legenda !== undefined && input.legenda !== imagem.legenda) {
    imagem.legenda = input.legenda;
    imagem.hashtags = hashtagsDoTexto(input.legenda);
    alterados.push('legenda');
  }
  if (input.status !== undefined && isImagemStatus(input.status)) {
    etapas.trocarStatus(file.imagens, imagem, input.status);
  } else if (alterados.includes('data') || alterados.includes('horário')) {
    // Etapa escolhida à mão na mesma edição vence; senão a agenda decide.
    etapas.seguirAgenda(file.imagens, imagem);
  }

  registrarEdicao(imagem.historico, alterados, (e) => registrar(imagem, e));
  imagem.updatedAt = nowIso();
  await saveFile(file);
  return file;
}

export async function moverImagem(input: MoverImagemInput): Promise<ImagensFile> {
  if (!isImagemStatus(input.status)) throw new Error('Etapa inválida.');
  const file = loadFile();
  etapas.mover(file.imagens, encontrar(file, input.imagemId), input.status, input.indice);
  await saveFile(file);
  return file;
}

export async function arquivarImagem(input: ArquivarImagemInput): Promise<ImagensFile> {
  const file = loadFile();
  etapas.arquivar(file.imagens, encontrar(file, input.imagemId), input.motivo === 'cancelado' ? 'cancelado' : 'arquivado');
  await saveFile(file);
  return file;
}

export async function restaurarImagem(imagemId: string): Promise<ImagensFile> {
  const file = loadFile();
  if (etapas.restaurar(file.imagens, encontrar(file, imagemId))) await saveFile(file);
  return file;
}

export async function excluirImagem(imagemId: string): Promise<ImagensFile> {
  const file = loadFile();
  file.imagens = file.imagens.filter((i) => i.id !== imagemId);
  renumerar(file.imagens);
  await saveFile(file);
  return file;
}

/** Chamado pela tarefa de fundo: publica as agendadas cujo horário chegou. */
export async function publicarAgendadasVencidas(): Promise<number> {
  const file = loadFile();
  const publicadas = etapas.publicarVencidas(file.imagens);
  if (publicadas > 0) await saveFile(file);
  return publicadas;
}
