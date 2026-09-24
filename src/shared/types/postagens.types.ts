import type { BaseEntity } from './common.types';

/**
 * Tipos de postagem. Cada tipo tem arquivo de dados, service e painel
 * próprios; o que é comum a todos (etapas por fase, prioridade, agenda, redes,
 * tags, links publicados, histórico) mora aqui.
 *
 * Adicionar um tipo = uma entrada aqui + o adaptador em
 * renderer/modules/postagens/postagens.tipos.ts (um Record cobrado pelo compilador).
 */
export const TIPOS_POSTAGEM = [
  { id: 'video', rotulo: 'Vídeos', singular: 'Vídeo' },
  { id: 'imagem', rotulo: 'Imagens', singular: 'Imagem' },
] as const;

export type TipoPostagem = (typeof TIPOS_POSTAGEM)[number]['id'];

export function isTipoPostagem(valor: unknown): valor is TipoPostagem {
  return typeof valor === 'string' && TIPOS_POSTAGEM.some((t) => t.id === valor);
}

export function rotuloTipo(tipo: TipoPostagem, singular = false): string {
  const t = TIPOS_POSTAGEM.find((x) => x.id === tipo);
  return t ? (singular ? t.singular : t.rotulo) : tipo;
}

/** Referência a uma postagem de qualquer tipo. */
export interface RefPostagem {
  tipo: TipoPostagem;
  id: string;
}

/**
 * Fases que agrupam as etapas de todos os tipos na pipeline. Cada tipo tem as
 * próprias etapas (vídeo grava e edita; imagem cria e revisa), mas todas caem
 * numa destas fases, e "pronto", "agendado", "publicado" e "arquivado" existem
 * em todos com o mesmo efeito.
 */
export type FasePostagem = 'pre' | 'producao' | 'distribuicao' | 'fora';

export const FASES_POSTAGEM: Array<{ id: Exclude<FasePostagem, 'fora'>; rotulo: string }> = [
  { id: 'pre', rotulo: 'Pré-produção' },
  { id: 'producao', rotulo: 'Produção' },
  { id: 'distribuicao', rotulo: 'Distribuição' },
];

export interface EtapaPostagem<S extends string = string> {
  id: S;
  rotulo: string;
  fase: FasePostagem;
}

/** Etapas que todo tipo precisa ter, porque têm efeito (carimbo, arquivar/restaurar). */
export type EtapaComum = 'ideia' | 'pronto' | 'agendado' | 'publicado' | 'arquivado';

export type MotivoArquivamento = 'cancelado' | 'arquivado';

export const PRIORIDADES = [
  { id: 'alta', rotulo: 'Alta' },
  { id: 'media', rotulo: 'Média' },
  { id: 'baixa', rotulo: 'Baixa' },
] as const;

/** Ausente = sem prioridade, o caso comum; o card só ganha selo quando há. */
export type Prioridade = (typeof PRIORIDADES)[number]['id'];

export function isPrioridade(valor: unknown): valor is Prioridade {
  return typeof valor === 'string' && PRIORIDADES.some((p) => p.id === valor);
}

export interface TagPostagem {
  id: string;
  nome: string;
  /** Cor em hex (#rrggbb). A tag sempre aparece com o nome, nunca só a cor. */
  cor: string;
}

/**
 * Redes com logo embutido no app. `dicas` são os nomes e apelidos com que a
 * rede aparece escrita em planilhas ("Insta", "Reels", "YT"…); a ordem importa:
 * Shorts vem antes de YouTube para "YouTube Shorts" não virar YouTube.
 */
export const REDES_CONHECIDAS = [
  { id: 'instagram', nome: 'Instagram', sigla: 'IG', cor: '#e1306c', dicas: ['instagram', 'insta', 'ig', 'reels', 'reel'] },
  { id: 'youtube-shorts', nome: 'YouTube Shorts', sigla: 'YTS', cor: '#ff0033', dicas: ['youtube shorts', 'yt shorts', 'shorts', 'yts'] },
  { id: 'youtube', nome: 'YouTube', sigla: 'YT', cor: '#ff0000', dicas: ['youtube', 'yt', 'you tube'] },
  { id: 'tiktok', nome: 'TikTok', sigla: 'TT', cor: '#111111', dicas: ['tiktok', 'tik tok', 'tt'] },
  { id: 'facebook', nome: 'Facebook', sigla: 'FB', cor: '#1877f2', dicas: ['facebook', 'face', 'fb', 'facebook reels'] },
  { id: 'kwai', nome: 'Kwai', sigla: 'KW', cor: '#ff7a00', dicas: ['kwai', 'kw'] },
  { id: 'linkedin', nome: 'LinkedIn', sigla: 'IN', cor: '#0a66c2', dicas: ['linkedin', 'linked in', 'lkd'] },
  { id: 'x', nome: 'X (Twitter)', sigla: 'X', cor: '#1d1d1f', dicas: ['x', 'twitter', 'x twitter', 'x (twitter)'] },
  { id: 'threads', nome: 'Threads', sigla: 'TH', cor: '#262626', dicas: ['threads'] },
  { id: 'pinterest', nome: 'Pinterest', sigla: 'PIN', cor: '#e60023', dicas: ['pinterest', 'pin'] },
  { id: 'snapchat', nome: 'Snapchat', sigla: 'SC', cor: '#fffc00', dicas: ['snapchat', 'snap', 'spotlight'] },
  { id: 'twitch', nome: 'Twitch', sigla: 'TW', cor: '#9146ff', dicas: ['twitch'] },
  { id: 'vimeo', nome: 'Vimeo', sigla: 'VM', cor: '#1ab7ea', dicas: ['vimeo'] },
] as const;

export type LogoRede = (typeof REDES_CONHECIDAS)[number]['id'];

export function isLogoRede(valor: unknown): valor is LogoRede {
  return typeof valor === 'string' && REDES_CONHECIDAS.some((r) => r.id === valor);
}

export interface RedeSocial {
  id: string;
  nome: string;
  /** 2–3 letras mostradas quando a rede não tem logo conhecido. */
  sigla: string;
  cor: string;
  /** Logo embutido; ausente para redes que o app não conhece. */
  logo?: LogoRede;
}

/** Tags e redes são um catálogo único, compartilhado por todos os tipos. */
export interface CatalogoPostagens {
  tags: TagPostagem[];
  redes: RedeSocial[];
}

/**
 * Informação livre que não é campo nativo (ex.: "Minuto", "Gancho", "CTA").
 * Vem de colunas da planilha ou é criada à mão no painel.
 */
export interface CampoExtra {
  nome: string;
  valor: string;
}

export interface Publicacao {
  redeId: string;
  url?: string;
}

export type EventoPostagemTipo = 'criado' | 'importado' | 'status' | 'editado' | 'arquivado' | 'restaurado';

export interface EventoPostagem {
  em: string;
  tipo: EventoPostagemTipo;
  de?: string;
  para?: string;
  detalhe?: string;
}

/** Campos que toda postagem tem, qualquer que seja o tipo. */
export interface PostagemBase<S extends string> extends BaseEntity {
  /** Número curto e estável para citar a postagem (#12), por tipo. */
  seq: number;
  titulo: string;
  /** YYYY-MM-DD */
  dataAgendada?: string;
  /** HH:mm */
  horaAgendada?: string;
  status: S;
  prioridade?: Prioridade;
  /** Nota de 0 a 100 dada pelo usuário. */
  score?: number;
  order: number;
  tagIds: string[];
  redeIds: string[];
  publicacoes: Publicacao[];
  notas: string;
  camposExtras: CampoExtra[];
  /** Ids de recursos da Biblioteca (explorador.json). Órfãos são ignorados na tela. */
  recursoIds: string[];
  publicadoEm?: string;
  statusAntesDeArquivar?: S;
  motivoArquivamento?: MotivoArquivamento;
  historico: EventoPostagem[];
}

/**
 * Campos editáveis comuns a todos os tipos. String vazia em data/hora limpa o
 * valor — `undefined` não é confiável depois do structured clone do IPC.
 */
export interface AtualizarPostagemComum<S extends string> {
  titulo?: string;
  dataAgendada?: string;
  horaAgendada?: string;
  status?: S;
  /** '' remove a prioridade. */
  prioridade?: Prioridade | '';
  /** null limpa o score. */
  score?: number | null;
  tagIds?: string[];
  redeIds?: string[];
  publicacoes?: Publicacao[];
  notas?: string;
  camposExtras?: CampoExtra[];
  recursoIds?: string[];
}

export interface CriarPostagemComum<S extends string> {
  titulo: string;
  status?: S;
  prioridade?: Prioridade;
  score?: number;
  /** YYYY-MM-DD */
  dataAgendada?: string;
  /** HH:mm */
  horaAgendada?: string;
  tagIds?: string[];
  redeIds?: string[];
}
