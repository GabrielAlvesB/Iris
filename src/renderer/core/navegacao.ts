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
import type { RefContato } from '../../shared/types/contatos.types.js';

/** Guias do Tutorial: os de conexão (com verificação) e um por área do app. */
export type GuiaId =
  | 'comecar'
  | 'ia'
  | 'n8n'
  | 'servidores'
  | 'github'
  | 'kanban'
  | 'todo'
  | 'contatos'
  | 'leads'
  | 'relatorios-leads'
  | 'api-leads'
  | 'whatsapp'
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
  | 'atalhos'
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

// ---------- Módulo atual e histórico (Alt+← / Alt+→) ----------

let atual: ModuloId | null = null;
const anteriores: ModuloId[] = [];
const seguintes: ModuloId[] = [];
let navegandoNoHistorico = false;
const MAX_HISTORICO = 30;

/** Chamado pelo app.ts a cada troca de módulo. */
export function registrarVisita(modulo: ModuloId): void {
  if (modulo === atual) {
    navegandoNoHistorico = false;
    return;
  }
  if (!navegandoNoHistorico) {
    if (atual) anteriores.push(atual);
    if (anteriores.length > MAX_HISTORICO) anteriores.shift();
    seguintes.length = 0;
  }
  navegandoNoHistorico = false;
  atual = modulo;
}

/** O módulo na tela agora (os atalhos de um módulo só valem nele). */
export function moduloAtual(): ModuloId | null {
  return atual;
}

export function voltarModulo(): void {
  const destino = anteriores.pop();
  if (!destino) return;
  if (atual) seguintes.push(atual);
  navegandoNoHistorico = true;
  abrirModulo(destino);
}

export function avancarModulo(): void {
  const destino = seguintes.pop();
  if (!destino) return;
  if (atual) anteriores.push(atual);
  navegandoNoHistorico = true;
  abrirModulo(destino);
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

// ---------- Contatos: abrir já na ficha de alguém ----------

let contatoPendente: RefContato | null = null;
const ouvintesContato = new Set<(ref: RefContato) => void>();

/** As abas da ficha de um contato. */
export type AbaFicha = 'geral' | 'conversa' | 'historico' | 'contratos';

let abaFichaPendente: AbaFicha | null = null;

/** Abre Contatos na ficha pedida — usado pela busca rápida (Ctrl+P), pela notificação do WhatsApp e por outros módulos. */
export function abrirContato(ref: RefContato, aba?: AbaFicha): void {
  if (aba) abaFichaPendente = aba;
  contatoPendente = ref;
  atendente?.('contatos');
  // Com Contatos já aberto o switch não remonta: os ouvintes cobrem esse caso.
  ouvintesContato.forEach((ouvir) => ouvir(ref));
}

export function consumirContatoPendente(): RefContato | null {
  const ref = contatoPendente;
  contatoPendente = null;
  return ref;
}

export function onContatoSolicitado(cb: (ref: RefContato) => void): () => void {
  ouvintesContato.add(cb);
  return () => ouvintesContato.delete(cb);
}

/** A aba pedida para a próxima ficha aberta (a ficha consome ao desenhar). */
export function consumirAbaFicha(): AbaFicha | null {
  const aba = abaFichaPendente;
  abaFichaPendente = null;
  return aba;
}

/** A conversa do WhatsApp de um contato: a ficha dele em Contatos, já na aba Conversa. */
export function abrirConversaWa(ref: RefContato): void {
  abrirContato(ref, 'conversa');
}

// ---------- WhatsApp: abrir já numa seção ----------

export type SecaoWhatsapp = 'conversas' | 'envios' | 'modelos' | 'conexao';

let secaoWaPendente: SecaoWhatsapp | null = null;
const ouvintesSecaoWa = new Set<(secao: SecaoWhatsapp) => void>();

export function abrirWhatsapp(secao: SecaoWhatsapp = 'conversas'): void {
  secaoWaPendente = secao;
  atendente?.('whatsapp');
  ouvintesSecaoWa.forEach((ouvir) => ouvir(secao));
}

export function consumirSecaoWhatsapp(): SecaoWhatsapp | null {
  const secao = secaoWaPendente;
  secaoWaPendente = null;
  return secao;
}

export function onSecaoWhatsappSolicitada(cb: (secao: SecaoWhatsapp) => void): () => void {
  ouvintesSecaoWa.add(cb);
  return () => ouvintesSecaoWa.delete(cb);
}

// ---------- Leads: abrir já na ficha de um lead ----------

let leadPendente: RefContato | null = null;
const ouvintesLead = new Set<(ref: RefContato) => void>();

/** Abre o módulo Leads na ficha pedida — o clique na notificação do Windows. */
export function abrirLead(ref: RefContato): void {
  leadPendente = ref;
  atendente?.('leads');
  ouvintesLead.forEach((ouvir) => ouvir(ref));
}

export function consumirLeadPendente(): RefContato | null {
  const ref = leadPendente;
  leadPendente = null;
  return ref;
}

export function onLeadSolicitado(cb: (ref: RefContato) => void): () => void {
  ouvintesLead.add(cb);
  return () => ouvintesLead.delete(cb);
}

// ---------- API e n8n: abrir já numa seção ----------

export type SecaoApiLeads = 'geral' | 'nuvem' | 'local' | 'n8n' | 'site' | 'chaves' | 'pontuacao' | 'avisos';

let secaoApiPendente: SecaoApiLeads | null = null;
const ouvintesSecaoApi = new Set<(secao: SecaoApiLeads) => void>();

/** Ex.: "Ajustar a pontuação" na ficha de um lead. */
export function abrirApiLeads(secao: SecaoApiLeads = 'geral'): void {
  secaoApiPendente = secao;
  atendente?.('api-leads');
  ouvintesSecaoApi.forEach((ouvir) => ouvir(secao));
}

export function consumirSecaoApiLeads(): SecaoApiLeads | null {
  const secao = secaoApiPendente;
  secaoApiPendente = null;
  return secao;
}

export function onSecaoApiLeadsSolicitada(cb: (secao: SecaoApiLeads) => void): () => void {
  ouvintesSecaoApi.add(cb);
  return () => ouvintesSecaoApi.delete(cb);
}

// ---------- Ajustes: abrir já numa seção ----------

/**
 * Seções de Ajustes que dá para abrir direto (busca rápida, Tutorial). Mesmos
 * ids e rótulos do índice de ajustes.view.ts, que mora num módulo carregado
 * sob demanda — por isso a lista curta fica aqui, sem importar a tela.
 */
export const SECOES_AJUSTES: ReadonlyArray<{ id: string; rotulo: string; termos: string }> = [
  { id: 'perfil', rotulo: 'Seus dados', termos: 'perfil cpf cnpj endereço contratante contrato meus dados' },
  { id: 'ia', rotulo: 'Inteligência artificial', termos: 'ia chave openai claude gemini ollama groq modelo' },
  { id: 'empresas', rotulo: 'Empresas e tags', termos: 'cliente marca tag rede' },
  { id: 'escalas', rotulo: 'Escalas de score', termos: 'score nota faixa meta' },
  { id: 'horarios', rotulo: 'Horários padrão', termos: 'agenda hora publicar' },
  { id: 'n8n', rotulo: 'n8n', termos: 'automação api key' },
  { id: 'github', rotulo: 'GitHub', termos: 'token repositório' },
  { id: 'credenciais', rotulo: 'Segurança', termos: 'cofre senha credencial' },
  { id: 'aparencia', rotulo: 'Aparência', termos: 'tema claro escuro branco dark light cor modo noturno' },
  { id: 'preferencias', rotulo: 'Preferências', termos: 'módulo inicial barra lateral fixar' },
  { id: 'atalhos', rotulo: 'Atalhos de teclado', termos: 'teclado tecla atalho ctrl trocar' },
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
