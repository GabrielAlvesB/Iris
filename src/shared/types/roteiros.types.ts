import type { BaseEntity } from './common.types';

/**
 * Roteiros: o texto de um conteúdo antes de ele existir. Passa por rascunho →
 * revisão → aprovado (ou reprovado, que volta a rascunho quando editado) e,
 * aprovado, vira um card no Kanban para ser produzido.
 *
 * Desde a v2, o roteiro é uma lista de **cenas** (fonte única): cartões,
 * duas colunas e texto livre editam as mesmas cenas, e o markdown é gerado e
 * lido por roteiros.conversao.ts — usado também pelo main (migração, card do
 * Kanban).
 *
 * Tags são as do catálogo único de Postagens, guardadas por id.
 */

export const STATUS_ROTEIRO = [
  { id: 'rascunho', rotulo: 'Rascunho' },
  { id: 'revisao', rotulo: 'Em revisão' },
  { id: 'aprovado', rotulo: 'Aprovado' },
  { id: 'reprovado', rotulo: 'Reprovado' },
] as const;

export type StatusRoteiro = (typeof STATUS_ROTEIRO)[number]['id'];

export function isStatusRoteiro(v: unknown): v is StatusRoteiro {
  return typeof v === 'string' && STATUS_ROTEIRO.some((s) => s.id === v);
}

/** `ppm`: palavras faladas por minuto típicas do formato (base da estimativa de tempo). */
export const FORMATOS_ROTEIRO = [
  { id: 'reels', rotulo: 'Reels / vídeo curto', ppm: 170 },
  { id: 'youtube', rotulo: 'YouTube', ppm: 150 },
  { id: 'carrossel', rotulo: 'Carrossel', ppm: 150 },
  { id: 'live', rotulo: 'Live / aula', ppm: 140 },
  { id: 'outro', rotulo: 'Outro', ppm: 150 },
] as const;

export type FormatoRoteiro = (typeof FORMATOS_ROTEIRO)[number]['id'];

export function isFormatoRoteiro(v: unknown): v is FormatoRoteiro {
  return typeof v === 'string' && FORMATOS_ROTEIRO.some((f) => f.id === v);
}

/** Tipos de cena: dão cor na linha do tempo e orientam a IA. */
export const TIPOS_CENA = [
  { id: 'gancho', rotulo: 'Gancho', cor: '#f97316', dica: 'Os primeiros segundos: o que faz parar de rolar.' },
  { id: 'abertura', rotulo: 'Abertura', cor: '#a78bfa', dica: 'Apresenta o assunto e promete o que vem.' },
  { id: 'secao', rotulo: 'Seção', cor: '#3b82f6', dica: 'Um bloco do conteúdo principal.' },
  { id: 'demonstracao', rotulo: 'Demonstração', cor: '#14b8a6', dica: 'Mostrando na prática: tela, produto, passo a passo.' },
  { id: 'cta', rotulo: 'CTA', cor: '#22c55e', dica: 'A chamada: seguir, comentar, clicar.' },
  { id: 'encerramento', rotulo: 'Encerramento', cor: '#9498a3', dica: 'Fecha a ideia e se despede.' },
] as const;

export type TipoCena = (typeof TIPOS_CENA)[number]['id'];

export function isTipoCena(v: unknown): v is TipoCena {
  return typeof v === 'string' && TIPOS_CENA.some((t) => t.id === v);
}

export interface CenaRoteiro {
  id: string;
  tipo: TipoCena;
  titulo: string;
  /** O que se fala (aceita **negrito**). Só isto conta para o tempo. */
  fala: string;
  /** O que se vê: cena, B-roll, enquadramento. */
  visual: string;
  /** Letreiro / texto na tela. */
  textoTela: string;
  notas: string;
  /** Tempo pretendido da cena, em segundos (do "[0:00 - 0:45]"). */
  duracaoAlvoSeg?: number;
}

export interface FonteRoteiro {
  id: string;
  titulo: string;
  url: string;
  nota: string;
}

export interface BriefingRoteiro {
  tema: string;
  publico: string;
  tom: string;
  objetivo: string;
  pontosChave: string;
  /** Duração alvo do vídeo inteiro, em segundos. */
  duracaoAlvoSeg?: number;
  /** Ausente = o do formato. */
  palavrasPorMinuto?: number;
}

export interface PesquisaRoteiro {
  notas: string;
  fontes: FonteRoteiro[];
}

export type OrigemVersao = 'manual' | 'ia' | 'restaurada';

/** Uma fotografia das cenas — automática antes de toda troca feita pela IA. */
export interface VersaoRoteiro {
  id: string;
  em: string;
  rotulo: string;
  origem: OrigemVersao;
  titulo: string;
  cenas: CenaRoteiro[];
}

export interface CriterioRevisao {
  nome: string;
  /** 0 a 10. */
  nota: number;
  comentario: string;
}

export interface ApontamentoRevisao {
  id: string;
  cenaId?: string;
  trecho: string;
  problema: string;
  sugestao: string;
}

/** A última leitura crítica da IA, guardada para não precisar pedir de novo. */
export interface RevisaoIaRoteiro {
  em: string;
  notaGeral: number;
  resumo: string;
  criterios: CriterioRevisao[];
  apontamentos: ApontamentoRevisao[];
}

export interface ItemChecklist {
  id: string;
  texto: string;
  feito: boolean;
}

export interface EventoRoteiro {
  em: string;
  status: StatusRoteiro;
  comentario: string;
}

export interface Roteiro extends BaseEntity {
  seq: number;
  titulo: string;
  tagIds: string[];
  formato: FormatoRoteiro;
  briefing: BriefingRoteiro;
  cenas: CenaRoteiro[];
  pesquisa: PesquisaRoteiro;
  observacoes: string;
  checklist: ItemChecklist[];
  status: StatusRoteiro;
  /** Do mais antigo ao mais novo. */
  historico: EventoRoteiro[];
  /** Da mais nova à mais antiga; no máximo MAX_VERSOES. */
  versoes: VersaoRoteiro[];
  revisaoIa?: RevisaoIaRoteiro;
  /** Roteiro de origem, quando este é uma adaptação de formato. */
  adaptadoDe?: string;
  /** Card criado na aprovação; some se o card for apagado no Kanban. */
  kanbanCardId?: string;
  /**
   * O texto markdown da v1, guardado intacto na migração para cenas — se algo
   * não foi lido como devia, o original ainda está aqui (Versões › Texto original).
   */
  textoLegado?: string;
}

export const MAX_VERSOES = 30;

export interface RoteirosFile {
  schemaVersion: number;
  updatedAt: string;
  seqAtual: number;
  roteiros: Roteiro[];
  /** Itens com que todo roteiro novo nasce na verificação. */
  checklistPadrao: string[];
}

export interface CriarRoteiroInput {
  titulo: string;
  formato?: FormatoRoteiro;
  tagIds?: string[];
  cenas?: CenaRoteiro[];
  briefing?: Partial<BriefingRoteiro>;
  pesquisa?: PesquisaRoteiro;
  /** Roteiro colado/aberto em markdown: vira cenas no main. */
  texto?: string;
}

/** Campos editáveis; status muda só por `mudarStatus`/`aprovar`. */
export type AtualizarRoteiroInput = { roteiroId: string } & Partial<
  Pick<Roteiro, 'titulo' | 'tagIds' | 'formato' | 'briefing' | 'cenas' | 'pesquisa' | 'observacoes' | 'checklist' | 'revisaoIa'>
>;

export interface MudarStatusRoteiroInput {
  roteiroId: string;
  status: Exclude<StatusRoteiro, 'aprovado'>;
  comentario?: string;
}

export interface AprovarRoteiroInput {
  roteiroId: string;
  comentario?: string;
}

export interface SalvarVersaoInput {
  roteiroId: string;
  rotulo: string;
  origem: OrigemVersao;
}

export interface RestaurarVersaoInput {
  roteiroId: string;
  versaoId: string;
}

/** Roteiro novo a partir de outro, em outro formato (o original não muda). */
export interface CriarAdaptacaoInput {
  roteiroId: string;
  formato: FormatoRoteiro;
  titulo: string;
  cenas: CenaRoteiro[];
  duracaoAlvoSeg?: number;
}

export interface CriarAdaptacaoResult {
  file: RoteirosFile;
  roteiroId: string;
}
