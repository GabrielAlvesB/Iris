/**
 * Histórico de alterações: cada entrada guarda o conteúdo de um arquivo de dados
 * ANTES de uma ação do usuário. Desfazer = voltar o arquivo àquele conteúdo.
 * Só ações vindas da tela entram; o que as tarefas de fundo gravam (leads,
 * WhatsApp, agenda automática) fica de fora.
 */

export type TipoEntradaHistorico = 'criacao' | 'edicao' | 'exclusao' | 'desfazer';

export interface EntradaHistorico {
  id: string;
  /** Nome do arquivo de dados (ex.: "kanban.json"). */
  arquivo: string;
  /** Rótulo do módulo, como no Backup ("Kanban", "Postagens"). */
  modulo: string;
  tipo: TipoEntradaHistorico;
  /** "Card excluído", "Checklist editada"… */
  rotulo: string;
  /** Nome do item, quando dá para saber ("Roteiro do vídeo X"); vazio se não. */
  detalhe: string;
  criadaEm: string;
  /** Edições seguidas da mesma coisa viram uma entrada só: aqui fica a última. */
  atualizadaEm: string;
  /** Tamanho do conteúdo guardado, em bytes. */
  tamanho: number;
}

export type MotivoHistorico = 'nova' | 'atualizada' | 'desfeita' | 'limpo';

export interface MudancaHistorico {
  motivo: MotivoHistorico;
  /** A entrada nova/atualizada, ou a que acabou de ser desfeita. */
  entrada: EntradaHistorico | null;
}

/** Quantas entradas o histórico guarda (as mais antigas saem primeiro). */
export const MAX_ENTRADAS_HISTORICO = 50;
