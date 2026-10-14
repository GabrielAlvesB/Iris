import { app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { aguardarEscritas, aoGravar, type GravacaoObservada } from '../../storage/jsonStore';
import { getDataFilePath } from '../../storage/paths';
import { broadcast } from '../../core/broadcast';
import * as exportService from '../export/export.service';
import { diferenca, rotular } from './historico.rotulos';
import {
  MAX_ENTRADAS_HISTORICO,
  type EntradaHistorico,
  type MotivoHistorico,
} from '../../../shared/types/historico.types';

/**
 * Histórico de alterações para desfazer sem precisar do backup.
 *
 * Não mexe em service nenhum: o jsonStore avisa toda gravação feita dentro de
 * um handler de IPC (ver contextoIpc) com o conteúdo de antes. Cada entrada é o
 * índice em historico/historico.json + o conteúdo anterior em historico/<id>.json.
 * Gravado à mão (não pelo jsonStore): o índice não é dado do usuário e não pode
 * entrar no próprio histórico.
 */

const SCHEMA_VERSION = 1;
/** Mais que isto somado nos conteúdos guardados, as entradas mais antigas saem. */
const LIMITE_BYTES = 150 * 1024 * 1024;
/** Gravações seguidas da mesma edição (o salvar-na-pausa da digitação) viram uma entrada. */
const JUNTAR_MS = 60_000;

/**
 * Fica de fora o que não se desfaz direito: mensagem do WhatsApp já saiu,
 * importação e backup têm o próprio desfazer, e o próprio desfazer não se registra.
 */
const CANAIS_IGNORADOS = /^(historico|export|backup|atualizacao|whatsapp):/;
/** Leitura que regrava o arquivo (migração no primeiro getFile) não é ação do usuário. */
const METODOS_DE_LEITURA = /^(get|listar|ler|carregar|buscar|indice|resumo|status|previa|testar|verificar)/i;

interface IndiceHistorico {
  schemaVersion: number;
  entradas: EntradaHistorico[];
}

function pasta(): string {
  const dir = path.join(app.getPath('userData'), 'historico');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function caminhoIndice(): string {
  return path.join(pasta(), 'historico.json');
}

function caminhoConteudo(id: string): string {
  return path.join(pasta(), `${id}.json`);
}

function gravarAtomico(destino: string, conteudo: string): void {
  fs.writeFileSync(`${destino}.tmp`, conteudo, 'utf-8');
  fs.renameSync(`${destino}.tmp`, destino);
}

function migrarEntrada(raw: unknown): EntradaHistorico | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
  if (!texto(r.id) || !texto(r.arquivo)) return null;
  const tipo = ['criacao', 'edicao', 'exclusao', 'desfazer'].includes(texto(r.tipo)) ? (r.tipo as EntradaHistorico['tipo']) : 'edicao';
  return {
    id: texto(r.id),
    arquivo: texto(r.arquivo),
    modulo: texto(r.modulo),
    tipo,
    rotulo: texto(r.rotulo) || 'Alteração',
    detalhe: texto(r.detalhe),
    criadaEm: texto(r.criadaEm),
    atualizadaEm: texto(r.atualizadaEm) || texto(r.criadaEm),
    tamanho: typeof r.tamanho === 'number' ? r.tamanho : 0,
  };
}

/** Lido a cada uso: é pequeno, e assim nunca diverge do disco. Ilegível = começa vazio. */
function lerIndice(): IndiceHistorico {
  try {
    const raw = JSON.parse(fs.readFileSync(caminhoIndice(), 'utf-8')) as { entradas?: unknown };
    const entradas = Array.isArray(raw.entradas) ? raw.entradas.map(migrarEntrada).filter((e): e is EntradaHistorico => !!e) : [];
    // Entrada sem o conteúdo guardado não desfaz nada: sai da lista.
    return { schemaVersion: SCHEMA_VERSION, entradas: entradas.filter((e) => fs.existsSync(caminhoConteudo(e.id))) };
  } catch {
    return { schemaVersion: SCHEMA_VERSION, entradas: [] };
  }
}

/** Mais recente primeiro. Poda por quantidade e por tamanho, e apaga os conteúdos órfãos. */
function gravarIndice(indice: IndiceHistorico): void {
  let total = 0;
  const ficam: EntradaHistorico[] = [];
  for (const e of indice.entradas) {
    if (ficam.length >= MAX_ENTRADAS_HISTORICO) break;
    if (ficam.length && total + e.tamanho > LIMITE_BYTES) break;
    total += e.tamanho;
    ficam.push(e);
  }
  gravarAtomico(caminhoIndice(), JSON.stringify({ schemaVersion: SCHEMA_VERSION, entradas: ficam }, null, 2));
  const vivos = new Set(ficam.map((e) => `${e.id}.json`));
  for (const nome of fs.readdirSync(pasta())) {
    if (nome !== 'historico.json' && nome.endsWith('.json') && !vivos.has(nome)) fs.rmSync(path.join(pasta(), nome), { force: true });
  }
}

function avisar(motivo: MotivoHistorico, entrada: EntradaHistorico | null): void {
  broadcast('historico:mudou', { motivo, entrada });
}

function registrar(g: GravacaoObservada): void {
  if (CANAIS_IGNORADOS.test(g.canal)) return;
  const metodo = g.canal.split(':')[1] ?? '';
  if (METODOS_DE_LEITURA.test(metodo)) return;
  const chave = exportService.chaveDoArquivo(g.arquivo);
  // Só o que tem caminho de volta pela migrate (os arquivos do backup).
  if (!chave || g.arquivo === 'whatsapp.json') return;

  const { tipo, detalhe } = diferenca(g.canal, g.antes, g.depois);
  const agora = new Date().toISOString();
  const indice = lerIndice();
  const ultima = indice.entradas[0];

  if (
    tipo === 'edicao' &&
    ultima &&
    ultima.tipo === 'edicao' &&
    ultima.arquivo === g.arquivo &&
    ultima.rotulo === rotular(g.canal, tipo) &&
    (!detalhe || !ultima.detalhe || ultima.detalhe === detalhe) &&
    Date.now() - Date.parse(ultima.atualizadaEm) < JUNTAR_MS
  ) {
    // Mesma edição continuando: o "antes" que vale é o primeiro, já guardado.
    ultima.atualizadaEm = agora;
    if (!ultima.detalhe) ultima.detalhe = detalhe;
    gravarIndice(indice);
    avisar('atualizada', ultima);
    return;
  }

  const entrada: EntradaHistorico = {
    id: `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
    arquivo: g.arquivo,
    modulo: exportService.rotuloDaChave(chave),
    tipo,
    rotulo: rotular(g.canal, tipo),
    detalhe,
    criadaEm: agora,
    atualizadaEm: agora,
    tamanho: Buffer.byteLength(g.antes, 'utf-8'),
  };
  gravarAtomico(caminhoConteudo(entrada.id), g.antes);
  // Ação nova depois de um desfazer: o "Refazer" daquele arquivo perde o sentido (como em todo editor).
  indice.entradas = [entrada, ...indice.entradas.filter((e) => !(e.tipo === 'desfazer' && e.arquivo === g.arquivo))];
  gravarIndice(indice);
  avisar('nova', entrada);
}

export function iniciarHistorico(): void {
  aoGravar(registrar);
}

export function listar(): EntradaHistorico[] {
  return lerIndice().entradas;
}

/**
 * Volta o arquivo da entrada ao que era antes dela. As alterações posteriores
 * no mesmo arquivo vão junto (o conteúdo de antes não as tem) e saem da lista.
 * O estado de agora vira uma entrada "Desfeito: …": desfazer o desfazer refaz.
 */
export async function desfazer(id: unknown): Promise<EntradaHistorico> {
  const indice = lerIndice();
  const posicao = indice.entradas.findIndex((e) => e.id === id);
  const alvo = indice.entradas[posicao];
  if (!alvo) throw new Error('Essa alteração não está mais no histórico.');
  const chave = exportService.chaveDoArquivo(alvo.arquivo);
  if (!chave) throw new Error('Esse arquivo não pode ser restaurado.');

  let anterior: unknown;
  try {
    anterior = JSON.parse(fs.readFileSync(caminhoConteudo(alvo.id), 'utf-8'));
  } catch {
    throw new Error('O conteúdo guardado dessa alteração não pôde ser lido.');
  }

  // O que está no disco agora, com qualquer gravação pendente já feita.
  await aguardarEscritas();
  const atual = fs.readFileSync(getDataFilePath(alvo.arquivo), 'utf-8');

  await exportService.restaurarChave(chave, anterior);

  const agora = new Date().toISOString();
  // Refazer (desfazer um "Desfeito: X") devolve a alteração X à lista como ela era.
  const refez = alvo.tipo === 'desfazer';
  const refazer: EntradaHistorico = {
    id: `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
    arquivo: alvo.arquivo,
    modulo: alvo.modulo,
    tipo: refez ? 'edicao' : 'desfazer',
    rotulo: refez ? alvo.rotulo.replace(/^Desfeito: /, '') : `Desfeito: ${alvo.rotulo}`,
    detalhe: alvo.detalhe,
    criadaEm: agora,
    atualizadaEm: agora,
    tamanho: Buffer.byteLength(atual, 'utf-8'),
  };
  gravarAtomico(caminhoConteudo(refazer.id), atual);
  // Sai a desfeita e as mais novas do mesmo arquivo; as de outros arquivos ficam.
  const restantes = indice.entradas.filter((e, i) => !(e.arquivo === alvo.arquivo && i <= posicao));
  gravarIndice({ schemaVersion: SCHEMA_VERSION, entradas: [refazer, ...restantes] });
  avisar('desfeita', alvo);
  return alvo;
}

/**
 * Alt+Z repetido anda para trás: pula as entradas "Desfeito: …" (que
 * refariam o que acabou de ser desfeito). Refazer é pela lista do Histórico.
 */
export async function desfazerUltima(): Promise<EntradaHistorico> {
  const ultima = lerIndice().entradas.find((e) => e.tipo !== 'desfazer');
  if (!ultima) throw new Error('Não há nada para desfazer.');
  return desfazer(ultima.id);
}

export function limpar(): void {
  gravarIndice({ schemaVersion: SCHEMA_VERSION, entradas: [] });
  avisar('limpo', null);
}
