import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import * as sheetsService from '../sheets/sheets.service';
import {
  aplicarCriacaoComum,
  aplicarEdicaoComum,
  criarEtapas,
  garantirSeq,
  listaDeStrings,
  migrarBase,
  naoNulo,
  nowIso,
  registrarEdicao,
  texto,
} from '../postagens/postagens.comum';
import type { CatalogoPostagens } from '../../../shared/types/postagens.types';
import {
  CAMPOS_VIDEO,
  VIDEO_STATUS,
  REDES_CONHECIDAS,
  isLogoRede,
  isVideoStatus,
  type ArquivarVideoInput,
  type AtualizarVideoInput,
  type CampoVideo,
  type CriarVideoInput,
  type ImportacaoRegistro,
  type ImportarDeSheetsInput,
  type ImportarDeSheetsResult,
  type MapeamentoColunas,
  type MapeamentoSheets,
  type MoverVideoInput,
  type OrigemSheets,
  type PreferenciasVideos,
  type RedeSocial,
  type SalvarRedeInput,
  type SalvarTagInput,
  type Video,
  type VideoStatus,
  type VideoTag,
  type VideosFile,
} from '../../../shared/types/videos.types';
import {
  acharRede,
  dividirLista,
  extrairHashtags,
  inferirLogo,
  normalizar,
  parseScore,
  parseData,
  parseHora,
  resolverStatus,
} from '../../../shared/types/videos.conversao';

const FILE_NAME = 'videos.json';
const SCHEMA_VERSION = 2;

const MAX_IMPORTACOES = 100;

const COR_REGEX = /^#[0-9a-f]{6}$/i;

const PALETA_TAGS = ['#a78bfa', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#fb7185', '#2dd4bf', '#c084fc'];

function tagsPadrao(): VideoTag[] {
  return [
    { id: randomUUID(), nome: 'Hora de Codar', cor: '#a78bfa' },
    { id: randomUUID(), nome: 'Grupo', cor: '#38bdf8' },
    { id: randomUUID(), nome: 'Tutorial', cor: '#34d399' },
    { id: randomUUID(), nome: 'Divulgação', cor: '#fbbf24' },
    { id: randomUUID(), nome: 'Shorts', cor: '#f472b6' },
  ];
}

function redeConhecida(logo: RedeSocial['logo'] & string, id: string = randomUUID()): RedeSocial {
  const conhecida = REDES_CONHECIDAS.find((r) => r.id === logo)!;
  return { id, nome: conhecida.nome, sigla: conhecida.sigla, cor: conhecida.cor, logo };
}

/**
 * Redes que entraram no padrão na versão 2 do arquivo. O id é fixo (não
 * aleatório) porque, até o arquivo ser gravado de novo, cada leitura repete a
 * migração — um id novo a cada leitura invalidaria a escolha feita na tela.
 */
const REDES_V2 = ['facebook', 'linkedin', 'kwai'] as const;

function redesPadrao(): RedeSocial[] {
  return [
    ...(['instagram', 'youtube-shorts', 'tiktok', 'youtube'] as const).map((logo) => redeConhecida(logo)),
    ...REDES_V2.map((logo) => redeConhecida(logo, `rede-${logo}`)),
  ];
}

/** Arquivo anterior à v2 ganha as redes novas do padrão, se ainda não tiver (pelo logo). */
function acrescentarRedesV2(redes: RedeSocial[]): void {
  REDES_V2.forEach((logo) => {
    if (!redes.some((r) => r.logo === logo)) redes.push(redeConhecida(logo, `rede-${logo}`));
  });
}

function preferenciasPadrao(): PreferenciasVideos {
  return {
    tituloDoCard: { tipo: 'titulo' },
    mostrarTags: true,
    mostrarRedes: true,
    mostrarExtras: true,
    mostrarOrigem: true,
    mostrarScore: true,
    inicioDaSemana: 0,
    calendarioPorRede: false,
    posicaoPainel: 'centro',
  };
}

function createDefaultFile(): VideosFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    seqAtual: 0,
    videos: [],
    tags: tagsPadrao(),
    redes: redesPadrao(),
    importacoes: [],
    mapeamentos: [],
    preferencias: preferenciasPadrao(),
  };
}

function migratePreferencias(raw: unknown): PreferenciasVideos {
  const padrao = preferenciasPadrao();
  const c = (raw ?? {}) as Partial<PreferenciasVideos>;
  const titulo = c.tituloDoCard;
  return {
    tituloDoCard:
      titulo && titulo.tipo === 'extra' && typeof titulo.nome === 'string' && titulo.nome.trim()
        ? { tipo: 'extra', nome: titulo.nome.trim() }
        : padrao.tituloDoCard,
    mostrarTags: typeof c.mostrarTags === 'boolean' ? c.mostrarTags : padrao.mostrarTags,
    mostrarRedes: typeof c.mostrarRedes === 'boolean' ? c.mostrarRedes : padrao.mostrarRedes,
    mostrarExtras: typeof c.mostrarExtras === 'boolean' ? c.mostrarExtras : padrao.mostrarExtras,
    mostrarOrigem: typeof c.mostrarOrigem === 'boolean' ? c.mostrarOrigem : padrao.mostrarOrigem,
    mostrarScore: typeof c.mostrarScore === 'boolean' ? c.mostrarScore : padrao.mostrarScore,
    inicioDaSemana: c.inicioDaSemana === 1 ? 1 : 0,
    calendarioPorRede: typeof c.calendarioPorRede === 'boolean' ? c.calendarioPorRede : padrao.calendarioPorRede,
    posicaoPainel: c.posicaoPainel === 'direita' || c.posicaoPainel === 'esquerda' ? c.posicaoPainel : 'centro',
  };
}

// ---------- Migração defensiva ----------

function cor(valor: unknown, fallback: string): string {
  return typeof valor === 'string' && COR_REGEX.test(valor) ? valor : fallback;
}

function migrateTag(raw: unknown, indice: number): VideoTag | null {
  const c = (raw ?? {}) as Partial<VideoTag>;
  const nome = texto(c.nome).trim();
  if (!nome) return null;
  return {
    id: typeof c.id === 'string' ? c.id : randomUUID(),
    nome,
    cor: cor(c.cor, PALETA_TAGS[indice % PALETA_TAGS.length]!),
  };
}

/** Cores com que a primeira versão semeava as redes, antes de existirem logos. */
const CORES_SEMENTE_ANTIGAS = ['#e1306c', '#ff3d3d', '#25f4ee', '#ff6b6b'];

function migrateRede(raw: unknown): RedeSocial | null {
  const c = (raw ?? {}) as Partial<RedeSocial>;
  const nome = texto(c.nome).trim();
  if (!nome) return null;
  // Redes criadas antes dos logos ganham o seu pelo nome, sem o usuário fazer
  // nada — e, se ainda estavam com a cor-semente antiga, a cor da marca.
  const logo = isLogoRede(c.logo) ? c.logo : inferirLogo(nome);
  const corAtual = cor(c.cor, '#9498a3');
  const marca = !isLogoRede(c.logo) && CORES_SEMENTE_ANTIGAS.includes(corAtual.toLowerCase())
    ? REDES_CONHECIDAS.find((r) => r.id === logo)?.cor
    : undefined;
  return {
    id: typeof c.id === 'string' ? c.id : randomUUID(),
    nome,
    sigla: siglaDe(texto(c.sigla) || nome),
    cor: marca ?? corAtual,
    logo,
  };
}

function migrateOrigem(raw: unknown): OrigemSheets | undefined {
  const c = (raw ?? {}) as Partial<OrigemSheets>;
  if (typeof c.tabelaId !== 'string' || typeof c.linhaId !== 'string') return undefined;
  const dados: Record<string, string> = {};
  if (c.dadosOriginais && typeof c.dadosOriginais === 'object') {
    Object.entries(c.dadosOriginais).forEach(([chave, valor]) => {
      if (typeof valor === 'string') dados[chave] = valor;
    });
  }
  return {
    tabelaId: c.tabelaId,
    tabelaNome: texto(c.tabelaNome) || 'Planilha',
    arquivoNome: typeof c.arquivoNome === 'string' ? c.arquivoNome : undefined,
    abaNome: typeof c.abaNome === 'string' ? c.abaNome : undefined,
    linhaId: c.linhaId,
    importacaoId: texto(c.importacaoId),
    importadoEm: texto(c.importadoEm) || nowIso(),
    dadosOriginais: dados,
    colunasExtras: Array.isArray(c.colunasExtras) ? listaDeStrings(c.colunasExtras) : undefined,
  };
}

function migrateVideo(raw: unknown, catalogo: { tagIds: Set<string>; redeIds: Set<string> }): Video | null {
  const base = migrarBase(raw, catalogo, isVideoStatus, 'ideia');
  if (!base) return null;
  const c = (raw ?? {}) as Partial<Video>;
  const video: Video = {
    ...base,
    descricao: texto(c.descricao),
    // Recalculado na leitura: se a regra de hashtags mudar, o arquivo se alinha sozinho.
    hashtags: extrairHashtags(listaDeStrings(c.hashtags).join(' ')),
    origem: migrateOrigem(c.origem),
  };
  promoverScoreExtra(video);
  return video;
}

/** Nomes de informação extra que, com número válido, viram o campo score. */
const NOMES_SCORE = ['score editorial', 'score', 'pontuacao', 'pontos', 'nota final'];

/**
 * Prioridade de uma informação extra para virar o score: nome exato da lista
 * (na ordem dela, "Score Editorial" primeiro) e, depois, qualquer nome que
 * contenha "score" (ex.: "Score Editorial Final"). -1 = não é score.
 */
function pesoDoNomeScore(nome: string): number {
  const alvo = normalizar(nome);
  const exato = NOMES_SCORE.indexOf(alvo);
  if (exato >= 0) return exato;
  return alvo.includes('score') ? NOMES_SCORE.length : -1;
}

/**
 * Vídeos importados antes do campo score existir guardaram a coluna como
 * informação extra. Na leitura, ela vira o score de verdade e sai da lista —
 * assim os relatórios contam esses vídeos sem precisar reimportar.
 */
function promoverScoreExtra(video: Video): void {
  if (video.score !== undefined) return;
  let indice = -1;
  let melhor = Infinity;
  video.camposExtras.forEach((c, i) => {
    const peso = pesoDoNomeScore(c.nome);
    if (peso >= 0 && peso < melhor && parseScore(c.valor) !== undefined) {
      melhor = peso;
      indice = i;
    }
  });
  if (indice < 0) return;
  video.score = parseScore(video.camposExtras[indice]!.valor);
  video.camposExtras.splice(indice, 1);
}

function migrateMapeamento(raw: unknown): MapeamentoSheets | null {
  const c = (raw ?? {}) as Partial<MapeamentoSheets>;
  if (typeof c.tabelaId !== 'string' || !c.campos || typeof c.campos !== 'object') return null;
  return {
    tabelaId: c.tabelaId,
    campos: limparMapeamento(c.campos),
    extrasIgnorados: listaDeStrings(c.extrasIgnorados),
    atualizadoEm: texto(c.atualizadoEm) || nowIso(),
  };
}

function migrateImportacao(raw: unknown): ImportacaoRegistro | null {
  const c = (raw ?? {}) as Partial<ImportacaoRegistro>;
  if (typeof c.id !== 'string' || typeof c.em !== 'string') return null;
  return {
    id: c.id,
    em: c.em,
    tabelaNome: texto(c.tabelaNome) || 'Planilha',
    arquivoNome: typeof c.arquivoNome === 'string' ? c.arquivoNome : undefined,
    abaNome: typeof c.abaNome === 'string' ? c.abaNome : undefined,
    quantidade: typeof c.quantidade === 'number' ? c.quantidade : 0,
    pulados: typeof c.pulados === 'number' ? c.pulados : 0,
    videoIds: listaDeStrings(c.videoIds),
  };
}

function migrateVideosFile(raw: unknown): VideosFile {
  const c = (raw ?? {}) as Partial<VideosFile>;
  // Arquivo sem as listas (primeira versão ou corrompido) recebe as sementes.
  const tags = Array.isArray(c.tags) ? c.tags.map(migrateTag).filter(naoNulo) : tagsPadrao();
  const redes = Array.isArray(c.redes) ? c.redes.map(migrateRede).filter(naoNulo) : redesPadrao();
  // Só uma vez: depois de gravado na v2, uma rede excluída pelo usuário não volta.
  if (Array.isArray(c.redes) && (typeof c.schemaVersion !== 'number' || c.schemaVersion < 2)) acrescentarRedesV2(redes);
  const catalogo = { tagIds: new Set(tags.map((t) => t.id)), redeIds: new Set(redes.map((r) => r.id)) };

  const videos = Array.isArray(c.videos) ? c.videos.map((v) => migrateVideo(v, catalogo)).filter(naoNulo) : [];
  const seqAtual = garantirSeq(videos, typeof c.seqAtual === 'number' ? c.seqAtual : 0);
  etapas.renumerar(videos);

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: c.updatedAt ?? nowIso(),
    seqAtual,
    videos,
    tags,
    redes,
    importacoes: Array.isArray(c.importacoes) ? c.importacoes.map(migrateImportacao).filter(naoNulo) : [],
    mapeamentos: Array.isArray(c.mapeamentos) ? c.mapeamentos.map(migrateMapeamento).filter(naoNulo) : [],
    preferencias: migratePreferencias(c.preferencias),
  };
}

function loadFile(): VideosFile {
  return readStore(FILE_NAME, createDefaultFile, migrateVideosFile);
}

async function saveFile(file: VideosFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

// ---------- Utilitários ----------

function siglaDe(nome: string): string {
  const limpo = nome.trim();
  if (limpo.length <= 3) return limpo.toUpperCase();
  const iniciais = limpo
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('');
  return (iniciais.length >= 2 ? iniciais : limpo.slice(0, 2)).slice(0, 3).toUpperCase();
}

function limparMapeamento(campos: MapeamentoColunas): MapeamentoColunas {
  const limpo: MapeamentoColunas = {};
  CAMPOS_VIDEO.forEach((campo) => {
    const coluna = campos[campo.id];
    if (typeof coluna === 'string' && coluna) limpo[campo.id] = coluna;
  });
  return limpo;
}

const etapas = criarEtapas<VideoStatus, Video>(VIDEO_STATUS);
const { rotuloStatus, registrar, renumerar } = etapas;

function encontrar(file: VideosFile, videoId: string): Video {
  const video = file.videos.find((v) => v.id === videoId);
  if (!video) throw new Error('Vídeo não encontrado — ele pode ter sido excluído.');
  return video;
}

function novoVideo(file: VideosFile, titulo: string, status: VideoStatus): Video {
  file.seqAtual += 1;
  return { ...etapas.nova(file.videos, file.seqAtual, titulo, status), descricao: '', hashtags: [] };
}

// ---------- API do service ----------

export async function getFile(): Promise<VideosFile> {
  return loadFile();
}

export async function getFullFile(): Promise<VideosFile> {
  return loadFile();
}

/** Tags e redes: um catálogo só, usado por todos os tipos de postagem. */
export function getCatalogo(): CatalogoPostagens {
  const file = loadFile();
  return { tags: file.tags, redes: file.redes };
}

export async function replaceFile(file: VideosFile): Promise<VideosFile> {
  await saveFile(file);
  return file;
}

export async function criarVideo(input: CriarVideoInput): Promise<VideosFile> {
  const titulo = input.titulo.trim();
  if (!titulo) throw new Error('Dê um título ao vídeo.');
  const status = isVideoStatus(input.status) ? input.status : 'ideia';

  const file = loadFile();
  const video = novoVideo(file, titulo, status);
  aplicarCriacaoComum(video, input, file);
  registrar(video, { tipo: 'criado', para: rotuloStatus(status) });
  file.videos.push(video);

  await saveFile(file);
  return file;
}

export async function atualizarVideo(input: AtualizarVideoInput): Promise<VideosFile> {
  const file = loadFile();
  const video = encontrar(file, input.videoId);
  const alterados = aplicarEdicaoComum(video, input, file, (e) => registrar(video, e));

  if (input.descricao !== undefined && input.descricao !== video.descricao) {
    video.descricao = input.descricao;
    alterados.push('descrição');
  }
  if (input.hashtags !== undefined) {
    const hashtags = extrairHashtags(input.hashtags.join(' '));
    if (hashtags.join(' ') !== video.hashtags.join(' ')) alterados.push('hashtags');
    video.hashtags = hashtags;
  }
  if (input.status !== undefined && isVideoStatus(input.status)) etapas.trocarStatus(file.videos, video, input.status);

  registrarEdicao(video.historico, alterados, (e) => registrar(video, e));
  video.updatedAt = nowIso();
  await saveFile(file);
  return file;
}

export async function moverVideo(input: MoverVideoInput): Promise<VideosFile> {
  if (!isVideoStatus(input.status)) throw new Error('Etapa inválida.');
  const file = loadFile();
  etapas.mover(file.videos, encontrar(file, input.videoId), input.status, input.indice);
  await saveFile(file);
  return file;
}

export async function arquivarVideo(input: ArquivarVideoInput): Promise<VideosFile> {
  const file = loadFile();
  etapas.arquivar(file.videos, encontrar(file, input.videoId), input.motivo === 'cancelado' ? 'cancelado' : 'arquivado');
  await saveFile(file);
  return file;
}

export async function restaurarVideo(videoId: string): Promise<VideosFile> {
  const file = loadFile();
  if (etapas.restaurar(file.videos, encontrar(file, videoId))) await saveFile(file);
  return file;
}

export async function excluirVideo(videoId: string): Promise<VideosFile> {
  const file = loadFile();
  file.videos = file.videos.filter((v) => v.id !== videoId);
  renumerar(file.videos);
  await saveFile(file);
  return file;
}

export async function salvarPreferencias(preferencias: PreferenciasVideos): Promise<VideosFile> {
  const file = loadFile();
  file.preferencias = migratePreferencias(preferencias);
  await saveFile(file);
  return file;
}

export async function salvarTag(input: SalvarTagInput): Promise<VideosFile> {
  const nome = input.nome.trim();
  if (!nome) throw new Error('A tag precisa de um nome.');
  const file = loadFile();
  const duplicada = file.tags.find((t) => normalizar(t.nome) === normalizar(nome) && t.id !== input.id);
  if (duplicada) throw new Error(`Já existe a tag "${duplicada.nome}".`);

  const existente = input.id ? file.tags.find((t) => t.id === input.id) : undefined;
  if (existente) {
    existente.nome = nome;
    existente.cor = cor(input.cor, existente.cor);
  } else {
    file.tags.push({ id: randomUUID(), nome, cor: cor(input.cor, PALETA_TAGS[file.tags.length % PALETA_TAGS.length]!) });
  }

  await saveFile(file);
  return file;
}

export async function excluirTag(tagId: string): Promise<VideosFile> {
  const file = loadFile();
  file.tags = file.tags.filter((t) => t.id !== tagId);
  file.videos.forEach((v) => {
    v.tagIds = v.tagIds.filter((id) => id !== tagId);
  });
  await saveFile(file);
  return file;
}

export async function salvarRede(input: SalvarRedeInput): Promise<VideosFile> {
  const nome = input.nome.trim();
  if (!nome) throw new Error('A rede precisa de um nome.');
  const file = loadFile();
  const duplicada = file.redes.find((r) => normalizar(r.nome) === normalizar(nome) && r.id !== input.id);
  if (duplicada) throw new Error(`Já existe a rede "${duplicada.nome}".`);

  const sigla = siglaDe(input.sigla.trim() || nome);
  // '' tira o logo de propósito; ausente deduz pelo nome.
  const logo = input.logo === '' ? undefined : isLogoRede(input.logo) ? input.logo : undefined;
  const existente = input.id ? file.redes.find((r) => r.id === input.id) : undefined;
  if (existente) {
    existente.nome = nome;
    existente.sigla = sigla;
    existente.cor = cor(input.cor, existente.cor);
    if (input.logo !== undefined) existente.logo = logo;
  } else {
    const deduzido = input.logo === undefined ? inferirLogo(nome) : logo;
    const padrao = REDES_CONHECIDAS.find((r) => r.id === deduzido);
    file.redes.push({ id: randomUUID(), nome, sigla, cor: cor(input.cor, padrao?.cor ?? '#9498a3'), logo: deduzido });
  }

  await saveFile(file);
  return file;
}

export async function excluirRede(redeId: string): Promise<VideosFile> {
  const file = loadFile();
  file.redes = file.redes.filter((r) => r.id !== redeId);
  file.videos.forEach((v) => {
    v.redeIds = v.redeIds.filter((id) => id !== redeId);
    v.publicacoes = v.publicacoes.filter((p) => p.redeId !== redeId);
  });
  await saveFile(file);
  return file;
}

// ---------- Importação do Sheets ----------

/** Ids das linhas de uma tabela que já viraram vídeo, para o selo "na pipeline". */
export async function listarLinhasImportadas(tabelaId: string): Promise<string[]> {
  const file = loadFile();
  return file.videos.filter((v) => v.origem?.tabelaId === tabelaId).map((v) => v.origem!.linhaId);
}

function resolverPorNome<T extends { id: string; nome: string }>(lista: T[], nomes: string[]): { ids: string[]; faltando: string[] } {
  const ids: string[] = [];
  const faltando: string[] = [];
  nomes.forEach((nome) => {
    const chave = normalizar(nome);
    const achado = lista.find((item) => normalizar(item.nome) === chave);
    if (achado) ids.push(achado.id);
    else faltando.push(nome);
  });
  return { ids, faltando };
}

/**
 * Copia as linhas escolhidas do Sheets para vídeos. O main lê a linha direto do
 * sheets.json em vez de confiar no que o renderer mandou, e grava uma cópia
 * integral: a pipeline não pode depender da planilha continuar existindo.
 */
export async function importarDeSheets(input: ImportarDeSheetsInput): Promise<ImportarDeSheetsResult> {
  const mapeamento = limparMapeamento(input.mapeamento);
  if (!mapeamento.titulo) throw new Error('Escolha qual coluna vira o título do vídeo.');
  if (!isVideoStatus(input.statusInicial)) throw new Error('Etapa inicial inválida.');

  const sheets = await sheetsService.getFile();
  const tabela = sheets.tables.find((t) => t.id === input.tabelaId);
  if (!tabela) throw new Error('A tabela não existe mais no Sheets.');

  const colunasValidas = new Set(tabela.columns.map((c) => c.id));
  const mapeadas = new Set(Object.values(mapeamento));
  // Só colunas que existem agora e não viraram campo nativo: se o usuário
  // tirou a coluna da planilha antes de enviar, ela simplesmente não vai.
  const colunasExtras = tabela.columns.filter(
    (c) => input.colunasExtras.includes(c.id) && !mapeadas.has(c.id),
  );
  const faltandoColuna = Object.values(mapeamento).find((colunaId) => colunaId && !colunasValidas.has(colunaId));
  if (faltandoColuna) throw new Error('Uma das colunas mapeadas foi removida da tabela. Revise o mapeamento.');

  const file = loadFile();
  const jaImportadas = new Set(
    file.videos.filter((v) => v.origem?.tabelaId === tabela.id).map((v) => v.origem!.linhaId),
  );
  const pedidas = new Set(input.linhaIds);
  const linhas = tabela.rows.filter((r) => pedidas.has(r.id));

  const tagsExtras = input.tagIdsExtras.filter((id) => file.tags.some((t) => t.id === id));
  const redesExtras = input.redeIdsExtras.filter((id) => file.redes.some((r) => r.id === id));
  const valor = (cells: Record<string, string>, campo: CampoVideo): string => {
    const colunaId = mapeamento[campo];
    return colunaId ? (cells[colunaId] ?? '').trim() : '';
  };

  const importacaoId = randomUUID();
  const importadoEm = nowIso();
  const criados: Video[] = [];
  let pulados = 0;

  linhas.forEach((linha) => {
    const titulo = valor(linha.cells, 'titulo');
    if (!titulo || (!input.duplicar && jaImportadas.has(linha.id))) {
      pulados += 1;
      return;
    }

    const status = resolverStatus(valor(linha.cells, 'status')) ?? input.statusInicial;
    const video = novoVideo(file, titulo, status);
    video.descricao = valor(linha.cells, 'descricao');
    video.hashtags = extrairHashtags(valor(linha.cells, 'hashtags'));
    video.dataAgendada = parseData(valor(linha.cells, 'data'));
    video.horaAgendada = parseHora(valor(linha.cells, 'hora'));
    video.notas = valor(linha.cells, 'notas');
    const scoreEscrito = valor(linha.cells, 'score');
    video.score = parseScore(scoreEscrito);
    video.camposExtras = colunasExtras
      .map((c) => ({ nome: c.label, valor: (linha.cells[c.id] ?? '').trim() }))
      .filter((c) => c.valor !== '');

    // Tag escrita na planilha que ainda não existe é criada: o usuário marcou
    // a linha com ela de propósito, perder essa informação seria pior.
    const nomesTags = dividirLista(valor(linha.cells, 'tags'));
    const tags = resolverPorNome(file.tags, nomesTags);
    tags.faltando.forEach((nome) => {
      const nova = { id: randomUUID(), nome, cor: PALETA_TAGS[file.tags.length % PALETA_TAGS.length]! };
      file.tags.push(nova);
      tags.ids.push(nova.id);
    });
    video.tagIds = [...new Set([...tags.ids, ...tagsExtras])];

    // Rede desconhecida não é criada (evita "Insta" e "Instagram" duplicados);
    // o nome fica visível nos dados originais para o usuário decidir.
    const escritas = dividirLista(valor(linha.cells, 'redes'));
    const redes = { ids: [] as string[], faltando: [] as string[] };
    escritas.forEach((nome) => {
      const achada = acharRede(file.redes, nome);
      if (achada) redes.ids.push(achada.id);
      else redes.faltando.push(nome);
    });
    video.redeIds = [...new Set([...redes.ids, ...redesExtras])];

    const dadosOriginais: Record<string, string> = {};
    tabela.columns.forEach((coluna) => {
      const conteudo = linha.cells[coluna.id] ?? '';
      if (conteudo !== '') dadosOriginais[coluna.label] = conteudo;
    });

    video.origem = {
      tabelaId: tabela.id,
      tabelaNome: tabela.name,
      arquivoNome: tabela.sourceFileName,
      abaNome: tabela.sourceSheetName,
      linhaId: linha.id,
      importacaoId,
      importadoEm,
      dadosOriginais,
      colunasExtras: colunasExtras.map((c) => c.label),
    };
    registrar(video, { tipo: 'importado', detalhe: `${tabela.name}${tabela.sourceFileName ? ` · ${tabela.sourceFileName}` : ''}` });
    if (scoreEscrito && video.score === undefined) {
      registrar(video, { tipo: 'editado', detalhe: `score não reconhecido: "${scoreEscrito}"` });
    }
    if (redes.faltando.length > 0) {
      registrar(video, { tipo: 'editado', detalhe: `redes não reconhecidas: ${redes.faltando.join(', ')}` });
    }

    file.videos.push(video);
    criados.push(video);
  });

  const registro: MapeamentoSheets = {
    tabelaId: tabela.id,
    campos: mapeamento,
    extrasIgnorados: tabela.columns
      .filter((c) => !mapeadas.has(c.id) && !input.colunasExtras.includes(c.id))
      .map((c) => c.id),
    atualizadoEm: importadoEm,
  };
  file.mapeamentos = [...file.mapeamentos.filter((m) => m.tabelaId !== tabela.id), registro];

  if (criados.length > 0) {
    file.importacoes.unshift({
      id: importacaoId,
      em: importadoEm,
      tabelaNome: tabela.name,
      arquivoNome: tabela.sourceFileName,
      abaNome: tabela.sourceSheetName,
      quantidade: criados.length,
      pulados,
      videoIds: criados.map((v) => v.id),
    });
    file.importacoes = file.importacoes.slice(0, MAX_IMPORTACOES);
  }

  renumerar(file.videos);
  await saveFile(file);
  return { file, criados: criados.length, pulados };
}
