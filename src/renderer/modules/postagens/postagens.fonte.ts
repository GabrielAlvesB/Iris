import type { EtapaPostagem, PostagemBase, TipoPostagem } from '../../../shared/types/postagens.types.js';
import type { VideosFile } from '../../../shared/types/videos.types.js';

/**
 * O que as telas genéricas de Postagens (pipeline, agenda, calendário,
 * métricas) precisam saber de um tipo. Cada tipo monta a sua Fonte a partir
 * do próprio state; as telas não importam nada específico de vídeo ou imagem.
 */

export type Postagem = PostagemBase<string>;

/** Tags, redes e preferências de exibição: moram em videos.json e valem para todos os tipos. */
export type Catalogo = Pick<VideosFile, 'tags' | 'redes' | 'preferencias'>;

export interface NovaPostagemOpcoes {
  status?: string;
  dataAgendada?: string;
  horaAgendada?: string;
}

/** Pedaços do card da pipeline que um tipo pode complementar. */
export interface PartesCard {
  /** Na linha de cima, depois de seq, prioridade e score. */
  topo: HTMLElement;
  /** Logo abaixo do título. */
  aposTitulo: HTMLElement;
  /** Contadores do rodapé (materiais já vem; o tipo põe os seus). */
  metas: HTMLElement;
}

/** Filtro que só um tipo tem (ex.: planilha de origem dos vídeos). */
export interface FiltroExtra {
  controles(redesenhar: () => void): HTMLElement[];
  passa(item: Postagem): boolean;
  ativo(): boolean;
  limpar(): void;
  /** Faixa de aviso sob a barra (ex.: "mostrando a importação de…"). */
  aviso?(): string | null;
}

/** O que um botão do cabeçalho de um tipo pode pedir à tela. */
export interface ControleTela {
  redesenhar(): void;
  /** Vai para a pipeline, mostrando (ou não) os arquivados. */
  irParaPipeline(mostrarArquivados: boolean): void;
}

export interface Fonte {
  tipo: TipoPostagem;
  /** "Vídeos" */
  rotulo: string;
  /** "Vídeo" */
  singular: string;
  /** "Novo vídeo" / "Nova imagem" */
  novoRotulo: string;
  icone: string;
  etapas: readonly EtapaPostagem[];
  itens: Postagem[];
  catalogo: Catalogo;

  /** Texto extra onde a busca procura, além de título, notas, extras e tags. */
  textoBusca(item: Postagem): string;
  criarRapido(titulo: string, status: string): Promise<unknown>;
  mover(id: string, status: string, indice: number): Promise<unknown>;
  /** Data '' e hora '' limpam. */
  agendar(id: string, data: string, hora: string): Promise<unknown>;
  definirScore(id: string, score: number): Promise<unknown>;
  abrir(id: string): void;
  painelAbertoPara(): string | null;
  abrirNovo(opcoes: NovaPostagemOpcoes): void;

  /** Complementos do card próprios do tipo (origem da planilha, formato da arte…). */
  decorarCard?(item: Postagem, partes: PartesCard): void;
  /** Linha extra no title das entradas do calendário. */
  dicaExtra?(item: Postagem): string | null;
  filtroExtra?: FiltroExtra;
  /** Subtítulo do cabeçalho quando este tipo está aberto. */
  subtitulo?(): string;
  /** Botões a mais no cabeçalho (antes dos comuns). */
  acoesCabecalho?(tela: ControleTela): HTMLElement[];
  /** Texto do estado vazio, depois de "crie aqui". */
  dicaVazio: string;
}

export function rotuloEtapa(fonte: Pick<Fonte, 'etapas'>, status: string): string {
  return fonte.etapas.find((s) => s.id === status)?.rotulo ?? status;
}

export function faseDe(fonte: Pick<Fonte, 'etapas'>, status: string): string {
  return fonte.etapas.find((s) => s.id === status)?.fase ?? 'pre';
}
