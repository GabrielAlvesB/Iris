import type {
  AtualizarPostagemComum,
  CriarPostagemComum,
  EventoPostagem,
  LogoRede,
  MotivoArquivamento,
  PostagemBase,
  RedeSocial,
  TagPostagem,
} from './postagens.types.js';

// O que é comum a todos os tipos de postagem mora em postagens.types; os nomes
// antigos continuam exportados daqui para quem já os usava.
export { PRIORIDADES, REDES_CONHECIDAS, isLogoRede, isPrioridade, FASES_POSTAGEM as VIDEO_FASES } from './postagens.types.js';
export type { CampoExtra, LogoRede, MotivoArquivamento, Prioridade, Publicacao, RedeSocial } from './postagens.types.js';
export type VideoTag = TagPostagem;
export type VideoEvento = EventoPostagem;
export type VideoEventoTipo = EventoPostagem['tipo'];

/**
 * Etapas fixas da pipeline de conteúdo. Não são colunas editáveis como no
 * Kanban porque têm semântica: "agendado" exige data, "publicado" carimba a
 * data de publicação, "arquivado" guarda de onde o vídeo saiu para poder voltar.
 */
export const VIDEO_STATUS = [
  { id: 'ideia', rotulo: 'Ideias', fase: 'pre' },
  { id: 'roteiro', rotulo: 'Roteiro', fase: 'pre' },
  { id: 'gravacao', rotulo: 'Gravação', fase: 'producao' },
  { id: 'edicao', rotulo: 'Edição', fase: 'producao' },
  { id: 'pronto', rotulo: 'Pronto', fase: 'distribuicao' },
  { id: 'agendado', rotulo: 'Agendado', fase: 'distribuicao' },
  { id: 'publicado', rotulo: 'Publicado', fase: 'distribuicao' },
  { id: 'arquivado', rotulo: 'Arquivado', fase: 'fora' },
] as const;

export type VideoStatus = (typeof VIDEO_STATUS)[number]['id'];
export type VideoFase = (typeof VIDEO_STATUS)[number]['fase'];

export function isVideoStatus(valor: unknown): valor is VideoStatus {
  return typeof valor === 'string' && VIDEO_STATUS.some((s) => s.id === valor);
}

/**
 * Cópia dos dados de uma linha do Sheets no momento da importação. Nada aqui
 * aponta para a planilha viva: se a tabela for apagada ou editada depois, o
 * vídeo continua exatamente como foi importado.
 */
export interface OrigemSheets {
  tabelaId: string;
  tabelaNome: string;
  arquivoNome?: string;
  abaNome?: string;
  linhaId: string;
  importacaoId: string;
  importadoEm: string;
  /** Rótulo da coluna → valor, a linha inteira como texto. */
  dadosOriginais: Record<string, string>;
  /**
   * Colunas escolhidas como campos extras no envio. Ausente em importações
   * anteriores aos campos extras — só essas oferecem "trazer colunas".
   */
  colunasExtras?: string[];
}

export interface Video extends PostagemBase<VideoStatus> {
  descricao: string;
  hashtags: string[];
  origem?: OrigemSheets;
}

export const CAMPOS_VIDEO = [
  { id: 'titulo', rotulo: 'Título', dicas: ['titulo', 'título', 'title', 'nome', 'tema', 'assunto'] },
  { id: 'descricao', rotulo: 'Descrição', dicas: ['descricao', 'descrição', 'description', 'legenda', 'texto', 'copy'] },
  { id: 'hashtags', rotulo: 'Hashtags', dicas: ['hashtags', 'hashtag', 'tags de post'] },
  { id: 'data', rotulo: 'Data', dicas: ['data', 'date', 'dia', 'data de publicação', 'agendamento'] },
  { id: 'hora', rotulo: 'Horário', dicas: ['hora', 'horario', 'horário', 'time'] },
  { id: 'tags', rotulo: 'Tags', dicas: ['tags', 'tag', 'categoria', 'categorias', 'tipo', 'quadro'] },
  { id: 'redes', rotulo: 'Redes sociais', dicas: ['redes', 'rede', 'plataforma', 'plataformas', 'canal', 'canais'] },
  { id: 'status', rotulo: 'Status', dicas: ['status', 'etapa', 'situação', 'situacao'] },
  { id: 'prioridade', rotulo: 'Prioridade', dicas: ['prioridade', 'priority', 'urgência', 'urgencia'] },
  // "nota" sozinha fica com Notas (texto); score só pelos nomes inequívocos.
  // "Score Editorial" é o nome usado nas planilhas de conteúdo: vem primeiro.
  { id: 'score', rotulo: 'Score', dicas: ['score editorial', 'score', 'pontuação', 'pontuacao', 'pontos', 'nota final', 'nota score'] },
  { id: 'notas', rotulo: 'Notas', dicas: ['notas', 'nota', 'observação', 'observacao', 'obs', 'roteiro'] },
] as const;

export type CampoVideo = (typeof CAMPOS_VIDEO)[number]['id'];

/** Coluna do Sheets (id) usada para cada campo. */
export type MapeamentoColunas = Partial<Record<CampoVideo, string>>;

export interface MapeamentoSheets {
  tabelaId: string;
  campos: MapeamentoColunas;
  /**
   * Colunas que o usuário desmarcou como campo extra. Guardamos as recusadas,
   * não as aceitas, para uma coluna nova na planilha já vir marcada.
   */
  extrasIgnorados: string[];
  atualizadoEm: string;
}

export interface ImportacaoRegistro {
  id: string;
  em: string;
  tabelaNome: string;
  arquivoNome?: string;
  abaNome?: string;
  quantidade: number;
  pulados: number;
  videoIds: string[];
}

/**
 * O que aparece como título nos cards e no calendário: o título do vídeo ou
 * uma informação extra (pelo nome do campo, ex.: "Tema"). Vídeo sem aquele
 * campo cai de volta no título.
 */
export type TituloDoCard = { tipo: 'titulo' } | { tipo: 'extra'; nome: string };

export interface PreferenciasVideos {
  tituloDoCard: TituloDoCard;
  /** Mostrar no card da pipeline. */
  mostrarTags: boolean;
  mostrarRedes: boolean;
  mostrarExtras: boolean;
  /** Linha "conteudo.xlsx › Setembro" nos vídeos importados do Sheets. */
  mostrarOrigem: boolean;
  /** Selo com o score no card e no calendário. */
  mostrarScore: boolean;
  /** Primeiro dia da semana no calendário: 0 = domingo, 1 = segunda. */
  inicioDaSemana: 0 | 1;
  /** Calendário: uma linha por vídeo ou uma por rede em que ele sai. */
  calendarioPorRede: boolean;
  /** Onde o painel de edição do vídeo abre. */
  posicaoPainel: PosicaoPainel;
}

export type PosicaoPainel = 'centro' | 'direita' | 'esquerda';

export interface VideosFile {
  schemaVersion: number;
  updatedAt: string;
  seqAtual: number;
  videos: Video[];
  tags: VideoTag[];
  redes: RedeSocial[];
  importacoes: ImportacaoRegistro[];
  mapeamentos: MapeamentoSheets[];
  preferencias: PreferenciasVideos;
}

export type CriarVideoInput = CriarPostagemComum<VideoStatus>;

/**
 * Campos editáveis pelo painel. String vazia em data/hora limpa o valor —
 * `undefined` não é confiável depois do structured clone do IPC.
 */
export interface AtualizarVideoInput extends AtualizarPostagemComum<VideoStatus> {
  videoId: string;
  descricao?: string;
  hashtags?: string[];
}

export interface MoverVideoInput {
  videoId: string;
  status: VideoStatus;
  indice: number;
}

export interface ArquivarVideoInput {
  videoId: string;
  motivo: MotivoArquivamento;
}

export interface SalvarTagInput {
  id?: string;
  nome: string;
  cor: string;
}

export interface SalvarRedeInput {
  id?: string;
  nome: string;
  sigla: string;
  cor: string;
  /** '' = sem logo; ausente = deduz pelo nome. */
  logo?: LogoRede | '';
}

export interface ImportarDeSheetsInput {
  tabelaId: string;
  linhaIds: string[];
  mapeamento: MapeamentoColunas;
  /** Colunas não mapeadas que viram campos extras do vídeo. */
  colunasExtras: string[];
  statusInicial: VideoStatus;
  tagIdsExtras: string[];
  redeIdsExtras: string[];
  /** Reimporta linhas que já viraram vídeo antes. */
  duplicar: boolean;
}

export interface ImportarDeSheetsResult {
  file: VideosFile;
  criados: number;
  pulados: number;
}
