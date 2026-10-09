import type { KanbanFile } from './kanban.types';
import type { QuadroFile } from './quadro.types';
import type { SheetsFile } from './sheets.types';
import type { LinksFile } from './links.types';
import type { PensamentosFile } from './pensamentos.types';
import type { ExploradorFile } from './explorador.types';
import type { ServidoresFile } from './servidores.types';
import type { N8nFile } from './n8n.types';
import type { GithubFile } from './github.types';
import type { AjustesFile } from './ajustes.types';
import type { CopyFile } from './copy.types';
import type { VideosFile } from './videos.types';
import type { ImagensFile } from './imagens.types';
import type { RelatoriosFile } from './relatorios.types';
import type { RoteirosFile } from './roteiros.types';
import type { TrafegoFile } from './trafego.types';
import type { TodoFile } from './todo.types';
import type { ContatosFile } from './contatos.types';
import type { WhatsappFile } from './whatsapp.types';
import type { ModuloId } from './modulos.types';

/**
 * Um formato só para o backup completo e para o arquivo de um módulo: o que
 * muda é o `escopo`. Todos os módulos são opcionais — um arquivo do Kanban
 * traz só `kanban`, e um backup antigo, sem `escopo`, é lido pelas chaves.
 */
export interface ExportBundle {
  schemaVersion: number;
  exportedAt: string;
  /** O que o arquivo contém. Ausente nos backups de antes da exportação por módulo. */
  escopo?: ModuloExportavel[];
  kanban?: KanbanFile;
  quadro?: QuadroFile;
  sheets?: SheetsFile;
  links?: LinksFile;
  pensamentos?: PensamentosFile;
  explorador?: ExploradorFile;
  servidores?: ServidoresFile;
  n8n?: N8nFile;
  github?: GithubFile;
  ajustes?: AjustesFile;
  copy?: CopyFile;
  /** Chave mantida com o nome antigo: é o arquivo dos vídeos e do catálogo de postagens. */
  videos?: VideosFile;
  imagens?: ImagensFile;
  relatorios?: RelatoriosFile;
  roteiros?: RoteirosFile;
  trafego?: TrafegoFile;
  todo?: TodoFile;
  contatos?: ContatosFile;
  /** Conversas, modelos e envios do WhatsApp; as credenciais ficam no cofre, fora do backup. */
  whatsapp?: WhatsappFile;
  /** Config das IAs, sem as chaves (ficam no cofre, fora do backup). */
  ia?: unknown;
  /** @deprecated O módulo Arquivos virou Explorador. Só existe em backups antigos. */
  arquivos?: unknown;
}

/** Chaves de dados do bundle (sem os metadados). */
export type ChaveBundle = Exclude<keyof ExportBundle, 'schemaVersion' | 'exportedAt' | 'escopo' | 'arquivos'>;

export type ModuloExportavel =
  | 'contatos'
  | 'whatsapp'
  | 'kanban'
  | 'todo'
  | 'postagens'
  | 'relatorios'
  | 'roteiros'
  | 'sheets'
  | 'biblioteca'
  | 'quadro'
  | 'copy'
  | 'pensamentos'
  | 'links'
  | 'servidores'
  | 'n8n'
  | 'github'
  | 'trafego'
  | 'ia'
  | 'ajustes';

export interface DescritorExportavel {
  id: ModuloExportavel;
  rotulo: string;
  /** Módulo da barra lateral (ícone); a IA não tem um, usa o do Estúdio. */
  modulo: ModuloId;
  /** Arquivos que vão juntos. Postagens leva vídeos E imagens: o catálogo de tags mora nos vídeos. */
  chaves: ChaveBundle[];
  /** Tem versão em planilha para ler fora do Iris. */
  planilha: boolean;
  /** Aviso mostrado na importação, quando há algo que o usuário precisa saber. */
  observacao?: string;
}

/** Catálogo único: a tela de Backup, a exportação e a importação derivam daqui. */
export const EXPORTAVEIS: readonly DescritorExportavel[] = [
  {
    id: 'contatos',
    rotulo: 'Contatos',
    modulo: 'contatos',
    chaves: ['contatos'],
    planilha: true,
    observacao: 'Tem dados pessoais (CPF, endereço, telefone): guarde o arquivo com o mesmo cuidado que os cadastros.',
  },
  {
    id: 'whatsapp',
    rotulo: 'WhatsApp',
    modulo: 'whatsapp',
    chaves: ['whatsapp'],
    planilha: true,
    observacao: 'Tem as conversas com os contatos. Token e apikeys não vão no arquivo; as conversas só se ligam aos contatos se Contatos for junto (ou já estiver aqui).',
  },
  { id: 'kanban', rotulo: 'Kanban', modulo: 'kanban', chaves: ['kanban'], planilha: true },
  { id: 'todo', rotulo: 'To-do', modulo: 'todo', chaves: ['todo'], planilha: true },
  {
    id: 'postagens',
    rotulo: 'Postagens',
    modulo: 'postagens',
    chaves: ['videos', 'imagens'],
    planilha: true,
    observacao: 'Inclui empresas, tags, redes e escalas de score — que também são usadas por Relatórios e Roteiros.',
  },
  { id: 'relatorios', rotulo: 'Relatórios', modulo: 'relatorios', chaves: ['relatorios'], planilha: false },
  { id: 'roteiros', rotulo: 'Roteiros', modulo: 'roteiros', chaves: ['roteiros'], planilha: true },
  { id: 'sheets', rotulo: 'Sheets', modulo: 'sheets', chaves: ['sheets'], planilha: false },
  {
    id: 'biblioteca',
    rotulo: 'Biblioteca',
    modulo: 'explorador',
    chaves: ['explorador'],
    planilha: false,
    observacao: 'Guarda só a organização (coleções, tags, notas): os arquivos precisam estar nas mesmas pastas deste computador.',
  },
  { id: 'quadro', rotulo: 'Quadro', modulo: 'quadro', chaves: ['quadro'], planilha: false },
  { id: 'copy', rotulo: 'Copy', modulo: 'copy', chaves: ['copy'], planilha: false },
  { id: 'pensamentos', rotulo: 'Pensamentos', modulo: 'pensamentos', chaves: ['pensamentos'], planilha: false },
  { id: 'links', rotulo: 'Links rápidos', modulo: 'links', chaves: ['links'], planilha: false },
  { id: 'servidores', rotulo: 'Servidores', modulo: 'servidores', chaves: ['servidores'], planilha: false, observacao: 'Senhas de chave SSH não vão no arquivo.' },
  { id: 'n8n', rotulo: 'n8n', modulo: 'n8n', chaves: ['n8n'], planilha: false, observacao: 'A API key não vai no arquivo.' },
  { id: 'github', rotulo: 'GitHub', modulo: 'github', chaves: ['github'], planilha: false, observacao: 'O token não vai no arquivo.' },
  { id: 'trafego', rotulo: 'Tráfego pago', modulo: 'trafego', chaves: ['trafego'], planilha: true },
  { id: 'ia', rotulo: 'Inteligência artificial', modulo: 'ia', chaves: ['ia'], planilha: false, observacao: 'Só os modelos e padrões — as chaves de IA não vão no arquivo.' },
  { id: 'ajustes', rotulo: 'Ajustes', modulo: 'ajustes', chaves: ['ajustes'], planilha: false },
];

export function isModuloExportavel(valor: unknown): valor is ModuloExportavel {
  return typeof valor === 'string' && EXPORTAVEIS.some((e) => e.id === valor);
}

export type FormatoExportacao = 'json' | 'xlsx';

/** O que a tela de Backup mostra de cada módulo: "34 cards em 1 quadro". */
export interface ResumoExportavel {
  id: ModuloExportavel;
  resumo: string;
  vazio: boolean;
}

/** Lido o arquivo de importação: o que ele traz, antes de substituir qualquer coisa. */
export interface PreviaImportacao {
  exportadoEm: string;
  /** Backup completo (de qualquer versão) ou arquivo de alguns módulos. */
  completo: boolean;
  modulos: ResumoExportavel[];
}

export interface ResultadoImportacao {
  modulos: ModuloExportavel[];
  /** Cópia feita antes de substituir: "Desfazer" restaura dela. */
  copiaAntes: string;
}

export interface CopiaDeSeguranca {
  arquivo: string;
  criadaEm: string;
  modulos: ModuloExportavel[];
}

export type FileOpResult = { canceled: true } | { canceled: false; filePath: string };
