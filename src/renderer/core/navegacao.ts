/**
 * Ponte de navegação entre módulos.
 *
 * O app.ts importa todos os módulos, então um módulo não pode importar o
 * app.ts de volta sem criar ciclo. Este arquivo não importa nada: o app.ts
 * registra como atender, e quem quiser navegar apenas pede. (O import abaixo é
 * só de tipo e some na compilação.)
 */

import type { ModuloId } from '../../shared/types/modulos.types.js';
import type { TipoPostagem } from '../../shared/types/postagens.types.js';

/** Guias do Tutorial: os de conexão (com verificação) e um por área do app. */
export type GuiaId =
  | 'comecar'
  | 'ia'
  | 'n8n'
  | 'servidores'
  | 'github'
  | 'kanban'
  | 'todo'
  | 'postagens'
  | 'estudio'
  | 'relatorios'
  | 'roteiros'
  | 'sheets'
  | 'biblioteca'
  | 'quadro'
  | 'copy'
  | 'pensamentos'
  | 'links'
  | 'trafego'
  | 'ajustes';

type Atendente = (modulo: string) => void;

let atendente: Atendente | null = null;
let guiaPendente: GuiaId | null = null;
const ouvintes = new Set<(guia: GuiaId) => void>();

export function registrarAtendente(fn: Atendente): void {
  atendente = fn;
}

/** Troca para outro módulo, como se o usuário clicasse na sidebar. */
export function abrirModulo(modulo: ModuloId): void {
  atendente?.(modulo);
}

/** Abre a aba Tutorial já no guia pedido. */
export function abrirTutorial(guia: GuiaId): void {
  guiaPendente = guia;
  atendente?.('tutorial');
  // switchModule sai cedo quando o módulo já está aberto; avisar os ouvintes
  // cobre o caso de clicar "?" estando dentro do próprio tutorial.
  ouvintes.forEach((ouvir) => ouvir(guia));
}

/** Consumido uma vez pelo mount do tutorial; depois volta a null. */
export function consumirGuiaPendente(): GuiaId | null {
  const guia = guiaPendente;
  guiaPendente = null;
  return guia;
}

export function onGuiaSolicitado(cb: (guia: GuiaId) => void): () => void {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

// ---------- Postagens: abrir já num tipo (e numa postagem) ----------

export interface PedidoPostagem {
  tipo: TipoPostagem;
  /** Abre o painel desta postagem depois de carregar. */
  id?: string;
  /** Mostra os arquivados (a postagem pedida pode estar lá). */
  arquivados?: boolean;
}

let pedidoPostagem: PedidoPostagem | null = null;
const ouvintesPostagem = new Set<(pedido: PedidoPostagem) => void>();

/** Abre Postagens no tipo pedido — usado pela Biblioteca, pelo Sheets e pelos Relatórios. */
export function abrirPostagem(pedido: PedidoPostagem): void {
  pedidoPostagem = pedido;
  atendente?.('postagens');
  // Com Postagens já aberto, o switch não remonta: os ouvintes cobrem esse caso.
  ouvintesPostagem.forEach((ouvir) => ouvir(pedido));
}

/** Consumido pela tela de Postagens; depois volta a null. */
export function consumirPedidoPostagem(): PedidoPostagem | null {
  const pedido = pedidoPostagem;
  pedidoPostagem = null;
  return pedido;
}

export function onPostagemSolicitada(cb: (pedido: PedidoPostagem) => void): () => void {
  ouvintesPostagem.add(cb);
  return () => ouvintesPostagem.delete(cb);
}

// ---------- Ajustes: abrir já numa seção ----------

/**
 * Seções de Ajustes que dá para abrir direto (busca rápida, Tutorial). Mesmos
 * ids e rótulos do índice de ajustes.view.ts, que mora num módulo carregado
 * sob demanda — por isso a lista curta fica aqui, sem importar a tela.
 */
export const SECOES_AJUSTES: ReadonlyArray<{ id: string; rotulo: string; termos: string }> = [
  { id: 'ia', rotulo: 'Inteligência artificial', termos: 'ia chave openai claude gemini ollama groq modelo' },
  { id: 'empresas', rotulo: 'Empresas e tags', termos: 'cliente marca tag rede' },
  { id: 'escalas', rotulo: 'Escalas de score', termos: 'score nota faixa meta' },
  { id: 'horarios', rotulo: 'Horários padrão', termos: 'agenda hora publicar' },
  { id: 'n8n', rotulo: 'n8n', termos: 'automação api key' },
  { id: 'github', rotulo: 'GitHub', termos: 'token repositório' },
  { id: 'credenciais', rotulo: 'Segurança', termos: 'cofre senha credencial' },
  { id: 'preferencias', rotulo: 'Preferências', termos: 'módulo inicial barra lateral fixar' },
  { id: 'relatorios', rotulo: 'Relatórios (assinatura)', termos: 'assinatura pdf' },
  { id: 'atualizacoes', rotulo: 'Atualizações', termos: 'versão instalar update' },
  { id: 'backup', rotulo: 'Backup', termos: 'exportar importar json planilha restaurar' },
];

let secaoAjustesPendente: string | null = null;
const ouvintesAjustes = new Set<() => void>();

/** Abre Ajustes na seção pedida (ex.: 'relatorios', de onde vem a assinatura). */
export function abrirAjustes(secao: string): void {
  secaoAjustesPendente = secao;
  atendente?.('ajustes');
  // Com Ajustes já aberto o switch não remonta: o ouvinte redesenha na seção.
  ouvintesAjustes.forEach((ouvir) => ouvir());
}

export function onSecaoAjustesSolicitada(cb: () => void): () => void {
  ouvintesAjustes.add(cb);
  return () => ouvintesAjustes.delete(cb);
}

export function consumirSecaoAjustes(): string | null {
  const secao = secaoAjustesPendente;
  secaoAjustesPendente = null;
  return secao;
}
