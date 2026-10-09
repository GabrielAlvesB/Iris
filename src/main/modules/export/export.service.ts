import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import * as kanbanService from '../kanban/kanban.service';
import * as quadroService from '../quadro/quadro.service';
import * as sheetsService from '../sheets/sheets.service';
import * as linksService from '../links/links.service';
import * as pensamentosService from '../pensamentos/pensamentos.service';
import * as todoService from '../todo/todo.service';
import * as iaService from '../ia/ia.service';
import * as exploradorService from '../explorador/explorador.service';
import * as servidoresService from '../servidores/servidores.service';
import * as n8nService from '../n8n/n8n.service';
import * as githubService from '../github/github.service';
import * as ajustesService from '../ajustes/ajustes.service';
import * as copyService from '../copy/copy.service';
import * as videosService from '../videos/videos.service';
import * as imagensService from '../imagens/imagens.service';
import * as relatoriosService from '../relatorios/relatorios.service';
import * as roteirosService from '../roteiros/roteiros.service';
import * as trafegoService from '../trafego/trafego.service';
import * as contatosService from '../contatos/contatos.service';
import * as whatsappService from '../whatsapp/whatsapp.service';
import { aguardarEscritas } from '../../storage/jsonStore';
import { reaplicarAgendamentos } from '../../core/backgroundServices';
import {
  EXPORTAVEIS,
  isModuloExportavel,
  type ChaveBundle,
  type CopiaDeSeguranca,
  type ExportBundle,
  type ModuloExportavel,
  type PreviaImportacao,
  type ResultadoImportacao,
  type ResumoExportavel,
} from '../../../shared/types/export.types';

const SCHEMA_VERSION = 2;

/**
 * Deliberadamente FORA do backup: secrets.json.
 *
 * São credenciais, e no Windows o safeStorage as cifra com DPAPI atrelado ao
 * usuário do SO — o valor nem seria decifrável em outra máquina. Por isso
 * servidores.json guarda só host/porta/usuário/caminho da chave, e n8n.json só
 * a baseUrl: as credenciais ficam no cofre, referenciadas por chave.
 */

const LEITORES: Record<ChaveBundle, () => Promise<unknown>> = {
  kanban: () => kanbanService.getFullFile(),
  quadro: () => quadroService.getFullFile(),
  sheets: () => sheetsService.getFullFile(),
  links: () => linksService.getFullFile(),
  pensamentos: () => pensamentosService.getFullFile(),
  explorador: () => exploradorService.getFullFile(),
  servidores: () => servidoresService.getFullFile(),
  n8n: () => n8nService.getFullFile(),
  github: () => githubService.getFullFile(),
  ajustes: () => ajustesService.getFullFile(),
  copy: () => copyService.getFullFile(),
  videos: () => videosService.getFullFile(),
  imagens: () => imagensService.getFullFile(),
  relatorios: () => relatoriosService.getFullFile(),
  roteiros: () => roteirosService.getFullFile(),
  trafego: () => trafegoService.getFullFile(),
  todo: () => todoService.getFullFile(),
  ia: () => iaService.getFullFile(),
  contatos: () => contatosService.getFullFile(),
  whatsapp: () => whatsappService.getFullFile(),
};

/** Cada `replaceFile` passa pela `migrate` do service: o que vem do arquivo nunca vai cru para o disco. */
const GRAVADORES: Record<ChaveBundle, (dados: unknown) => Promise<unknown>> = {
  kanban: (d) => kanbanService.replaceFile(d),
  quadro: (d) => quadroService.replaceFile(d),
  sheets: (d) => sheetsService.replaceFile(d),
  links: (d) => linksService.replaceFile(d),
  pensamentos: (d) => pensamentosService.replaceFile(d),
  explorador: (d) => exploradorService.replaceFile(d),
  servidores: (d) => servidoresService.replaceFile(d),
  n8n: (d) => n8nService.replaceFile(d),
  github: (d) => githubService.replaceFile(d),
  ajustes: (d) => ajustesService.replaceFile(d),
  copy: (d) => copyService.replaceFile(d),
  videos: (d) => videosService.replaceFile(d),
  imagens: (d) => imagensService.replaceFile(d),
  relatorios: (d) => relatoriosService.replaceFile(d),
  roteiros: (d) => roteirosService.replaceFile(d),
  trafego: (d) => trafegoService.replaceFile(d),
  todo: (d) => todoService.replaceFile(d),
  ia: (d) => iaService.replaceFile(d),
  contatos: (d) => contatosService.replaceFile(d),
  whatsapp: (d) => whatsappService.replaceFile(d),
};

const TODOS: ModuloExportavel[] = EXPORTAVEIS.map((e) => e.id);

function chavesDe(escopo: readonly ModuloExportavel[]): ChaveBundle[] {
  return EXPORTAVEIS.filter((e) => escopo.includes(e.id)).flatMap((e) => e.chaves);
}

export async function buildExportBundle(escopo: readonly ModuloExportavel[] = TODOS): Promise<ExportBundle> {
  const chaves = chavesDe(escopo);
  const dados = await Promise.all(chaves.map(async (c) => [c, await LEITORES[c]()] as const));
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    escopo: [...escopo],
    ...Object.fromEntries(dados),
  } as ExportBundle;
}

export function ehTudo(escopo: readonly ModuloExportavel[]): boolean {
  return TODOS.every((m) => escopo.includes(m));
}

// ---------- Resumo ("34 cards em 2 quadros") ----------

function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function campo(obj: unknown, nome: string): unknown {
  return obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[nome] : undefined;
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/**
 * Lê o arquivo cru, defensivo de propósito: serve tanto para os dados atuais
 * quanto para um arquivo de importação ainda não migrado.
 */
function resumir(id: ModuloExportavel, b: ExportBundle): ResumoExportavel {
  const r = (partes: Array<[number, string, string]>, vazio?: boolean): ResumoExportavel => {
    const texto = partes.filter(([n]) => n > 0).map(([n, um, varios]) => plural(n, um, varios));
    return { id, resumo: texto.length ? texto.join(' · ') : 'vazio', vazio: vazio ?? !texto.length };
  };
  switch (id) {
    case 'contatos': {
      const pessoas = lista(campo(b.contatos, 'pessoas'));
      const empresas = lista(campo(b.contatos, 'empresas'));
      return r([
        [pessoas.length, 'pessoa', 'pessoas'],
        [empresas.length, 'empresa', 'empresas'],
        [lista(campo(b.contatos, 'contratos')).length, 'contrato', 'contratos'],
      ]);
    }
    case 'whatsapp': {
      const mensagens = lista(campo(b.whatsapp, 'mensagens'));
      const conversas = new Set(mensagens.map((m) => String(campo(m, 'numero') ?? '')));
      return r([
        [mensagens.length, 'mensagem', 'mensagens'],
        [conversas.size, 'conversa', 'conversas'],
        [lista(campo(b.whatsapp, 'modelos')).length, 'modelo', 'modelos'],
      ]);
    }
    case 'kanban': {
      const boards = lista(campo(b.kanban, 'boards'));
      return r([[boards.reduce<number>((n, q) => n + lista(campo(q, 'cards')).length, 0), 'card', 'cards']]);
    }
    case 'todo': {
      const cl = lista(campo(b.todo, 'checklists'));
      return r([[cl.length, 'checklist', 'checklists'], [cl.reduce<number>((n, c) => n + lista(campo(c, 'itens')).length, 0), 'item', 'itens']]);
    }
    case 'postagens': {
      const tags = lista(campo(b.videos, 'tags'));
      return r([
        [lista(campo(b.videos, 'videos')).length, 'vídeo', 'vídeos'],
        [lista(campo(b.imagens, 'imagens')).length, 'imagem', 'imagens'],
        [tags.filter((t) => campo(t, 'empresa') === true).length, 'empresa', 'empresas'],
      ]);
    }
    case 'relatorios':
      return r([[lista(campo(b.relatorios, 'relatorios')).length, 'relatório', 'relatórios']]);
    case 'roteiros':
      return r([[lista(campo(b.roteiros, 'roteiros')).length, 'roteiro', 'roteiros']]);
    case 'sheets':
      return r([[lista(campo(b.sheets, 'tables')).length, 'tabela', 'tabelas']]);
    case 'biblioteca':
      return r([[lista(campo(b.explorador, 'raizes')).length, 'pasta', 'pastas'], [lista(campo(b.explorador, 'recursos')).length, 'arquivo', 'arquivos']]);
    case 'quadro':
      return r([[lista(campo(b.quadro, 'blocks')).length, 'bloco', 'blocos']]);
    case 'copy':
      return r([[lista(campo(b.copy, 'snippets')).length, 'texto', 'textos']]);
    case 'pensamentos':
      return r([[lista(campo(b.pensamentos, 'pensamentos')).length, 'post-it', 'post-its']]);
    case 'links':
      return r([[lista(campo(b.links, 'links')).length, 'link', 'links']]);
    case 'servidores':
      return r([[lista(campo(b.servidores, 'servidores')).length, 'servidor', 'servidores']]);
    case 'n8n': {
      const url = campo(b.n8n, 'baseUrl');
      return { id, resumo: typeof url === 'string' && url ? url : 'sem endereço', vazio: !(typeof url === 'string' && url) };
    }
    case 'github':
      return r([[lista(campo(b.github, 'pastas')).length, 'pasta de projetos', 'pastas de projetos']]);
    case 'trafego':
      return r([[lista(campo(b.trafego, 'contas')).length, 'conta', 'contas'], [lista(campo(b.trafego, 'campanhas')).length, 'campanha', 'campanhas']]);
    case 'ia': {
      const p = campo(b.ia, 'provedores');
      const n = p && typeof p === 'object' ? Object.values(p).filter((x) => campo(x, 'modeloTexto') || campo(x, 'modeloImagem') || campo(x, 'ativo')).length : 0;
      return { id, resumo: n ? plural(n, 'provedor ajustado', 'provedores ajustados') : 'sem ajustes', vazio: !n };
    }
    case 'ajustes':
      return { id, resumo: 'preferências e assinatura', vazio: false };
  }
}

export async function resumoAtual(): Promise<ResumoExportavel[]> {
  const b = await buildExportBundle();
  return EXPORTAVEIS.map((e) => resumir(e.id, b));
}

// ---------- Importação em dois passos ----------

/** O arquivo escolhido fica só aqui: o renderer nunca manda caminho de volta. */
let pendente: { bundle: ExportBundle; escopo: ModuloExportavel[] } | null = null;

/** Escopo declarado ou, em backup antigo, inferido pelas chaves presentes. */
function escopoDoArquivo(b: ExportBundle): ModuloExportavel[] {
  const presente = (m: ModuloExportavel): boolean => {
    const d = EXPORTAVEIS.find((e) => e.id === m)!;
    // Postagens basta ter os vídeos (onde mora o catálogo); imagens vêm se houver.
    return m === 'postagens' ? b.videos !== undefined : d.chaves.every((c) => b[c] !== undefined);
  };
  const declarado = Array.isArray(b.escopo) ? b.escopo.filter(isModuloExportavel) : TODOS;
  return declarado.filter(presente);
}

export function prepararImportacao(raw: unknown): PreviaImportacao {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Este arquivo não é um backup do Iris.');
  const bundle = raw as ExportBundle;
  const escopo = escopoDoArquivo(bundle);
  if (!escopo.length) throw new Error('Este arquivo não traz dados de nenhum módulo do Iris.');
  pendente = { bundle, escopo };
  return {
    exportadoEm: typeof bundle.exportedAt === 'string' ? bundle.exportedAt : '',
    completo: !Array.isArray(bundle.escopo) || ehTudo(bundle.escopo),
    modulos: escopo.map((m) => resumir(m, bundle)),
  };
}

export function cancelarImportacao(): void {
  pendente = null;
}

function pastaDeCopias(): string {
  const dir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function carimbo(): string {
  // Hora local no nome: é o que o usuário reconhece ao abrir a pasta.
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const PREFIXO_COPIA = 'antes-de-importar-';
const MAX_COPIAS = 10;

/** Só as mais recentes de cada tipo: uma cópia de backup completo pode ter megabytes. */
function podar(prefixo: string): void {
  fs.readdirSync(pastaDeCopias())
    .filter((n) => n.startsWith(prefixo) && n.endsWith('.json'))
    .sort()
    .reverse()
    .slice(MAX_COPIAS)
    .forEach((n) => fs.rmSync(path.join(pastaDeCopias(), n), { force: true }));
}

async function gravarCopia(prefixo: string, modulos: ModuloExportavel[]): Promise<string> {
  const bundle = await buildExportBundle(modulos);
  const arquivo = path.join(pastaDeCopias(), `${prefixo}${carimbo()}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(bundle, null, 2), 'utf-8');
  podar(prefixo);
  return arquivo;
}

async function gravarModulos(bundle: ExportBundle, modulos: ModuloExportavel[]): Promise<void> {
  const chaves = chavesDe(modulos).filter((c) => bundle[c] !== undefined);
  // Depois dos vídeos, de propósito: as imagens validam tags e redes contra o
  // catálogo que mora em videos.json, que precisa já ser o do arquivo.
  await Promise.all(chaves.filter((c) => c !== 'imagens').map((c) => GRAVADORES[c](bundle[c])));
  if (chaves.includes('imagens')) await GRAVADORES.imagens(bundle.imagens);
  await aguardarEscritas();
  // Pastas monitoradas e agendamentos dependem do que acabou de ser gravado.
  if (modulos.includes('biblioteca')) {
    exploradorService.pararWatchers();
    exploradorService.iniciarWatchers();
  }
  reaplicarAgendamentos();
}

export async function aplicarImportacao(pedidos: unknown): Promise<ResultadoImportacao> {
  if (!pendente) throw new Error('Escolha o arquivo de novo — a importação anterior expirou.');
  const lista = Array.isArray(pedidos) ? pedidos.filter(isModuloExportavel) : [];
  const modulos = pendente.escopo.filter((m) => lista.includes(m));
  if (!modulos.length) throw new Error('Marque pelo menos um módulo para importar.');
  const { bundle } = pendente;
  const copiaAntes = await gravarCopia(PREFIXO_COPIA, modulos);
  await gravarModulos(bundle, modulos);
  pendente = null;
  return { modulos, copiaAntes };
}

function lerCopia(arquivo: string): CopiaDeSeguranca | null {
  try {
    const b = JSON.parse(fs.readFileSync(arquivo, 'utf-8')) as ExportBundle;
    return { arquivo: path.basename(arquivo), criadaEm: b.exportedAt, modulos: escopoDoArquivo(b) };
  } catch {
    return null;
  }
}

export function ultimaCopia(): CopiaDeSeguranca | null {
  const dir = pastaDeCopias();
  const nome = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(PREFIXO_COPIA) && n.endsWith('.json'))
    .sort()
    .pop();
  return nome ? lerCopia(path.join(dir, nome)) : null;
}

/**
 * Volta os módulos ao que eram antes da última importação. O estado de agora
 * também ganha cópia (com outro prefixo): desfazer não pode ser uma perda.
 */
export async function desfazerUltimaImportacao(): Promise<ModuloExportavel[]> {
  const copia = ultimaCopia();
  if (!copia) throw new Error('Não há importação para desfazer.');
  const arquivo = path.join(pastaDeCopias(), copia.arquivo);
  const bundle = JSON.parse(fs.readFileSync(arquivo, 'utf-8')) as ExportBundle;
  await gravarCopia('antes-de-desfazer-', copia.modulos);
  await gravarModulos(bundle, copia.modulos);
  // Consumida: o próximo "Desfazer" seria refazer a importação, o que confunde.
  fs.renameSync(arquivo, path.join(path.dirname(arquivo), copia.arquivo.replace(PREFIXO_COPIA, 'desfeita-')));
  podar('desfeita-');
  return copia.modulos;
}

export function abrirPastaDeCopias(): string {
  return pastaDeCopias();
}
