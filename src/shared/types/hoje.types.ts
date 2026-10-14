import type { AlvoBusca } from './busca.types';

/**
 * Tela Hoje: o que é do dia, juntado de vários módulos — cards do Kanban e
 * checklists do To-do com prazo, postagens agendadas e as rotinas do Quadro.
 * Nada disso é guardado à parte: o main monta a cada leitura a partir dos
 * arquivos de cada módulo, então a tela nunca discorda deles.
 */

export type TipoItemDia = 'card' | 'checklist' | 'postagem' | 'rotina';

export interface ItemDia {
  /** "card:<id>" — único entre tipos, para a tela acompanhar o item entre redesenhos. */
  chave: string;
  tipo: TipoItemDia;
  id: string;
  titulo: string;
  /** Onde está e em que pé: "A Fazer", "Vídeo · Agendado", "2 de 5 itens". */
  detalhe: string;
  /** AAAA-MM-DD (local) do prazo, da postagem ou do dia da rotina. */
  data: string;
  /** HH:mm, quando há (postagem e rotina). */
  hora?: string;
  feito: boolean;
  prioridade?: 'alta' | 'media' | 'baixa';
  /** Card e rotina se concluem dali mesmo; checklist e postagem abrem no módulo. */
  podeConcluir: boolean;
  alvo: AlvoBusca;
}

export interface DiaHoje {
  /** AAAA-MM-DD local do dia montado. */
  hoje: string;
  /** Prazo ou data antes de hoje e ainda não feito. */
  atrasados: ItemDia[];
  doDia: ItemDia[];
  /** Concluídos hoje (saem da lista principal, como em todo o app). */
  feitos: ItemDia[];
  /** Os próximos dias, cada um com o que ainda vai acontecer. */
  proximos: Array<{ data: string; itens: ItemDia[] }>;
}

export interface ConcluirItemDiaInput {
  tipo: TipoItemDia;
  id: string;
  /** false desfaz (rotina desmarcada, card de volta à primeira coluna). */
  feito: boolean;
}

/** Quantos dias depois de hoje entram em "Próximos dias". */
export const DIAS_A_FRENTE = 3;
