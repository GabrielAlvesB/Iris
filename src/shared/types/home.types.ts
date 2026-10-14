import type { AlvoBusca } from './busca.types';
import type { RefContato } from './contatos.types';
import type { FaixaLead } from './leads.types';

/**
 * O que a Home mostra além do dia: o "pulso" dos outros módulos (constância,
 * caixa de entrada, uma ideia do banco, uma lembrança, roteiros) e a sugestão
 * do dia escrita pela IA. Como o dia, o pulso é montado na hora a partir dos
 * arquivos de cada módulo; só a sugestão é guardada (home.json), para não
 * pedir à IA de novo a cada abertura.
 */

/** Onde um item da Home leva: um alvo da busca, a ficha de um lead ou o banco de ideias. */
export type AlvoHome = { tipo: 'busca'; alvo: AlvoBusca } | { tipo: 'lead'; ref: RefContato } | { tipo: 'ideias' };

export interface DiaAtividade {
  /** AAAA-MM-DD local. */
  dia: string;
  /** Publicações + cards concluídos + itens de checklist marcados + rotinas feitas. */
  n: number;
}

export interface PulsoHome {
  hoje: string;
  /** As últimas SEMANAS_ATIVIDADE semanas, de segunda a domingo, até hoje (dias futuros da semana não entram). */
  atividade: DiaAtividade[];
  /** Dias seguidos com alguma atividade, terminando hoje (ou ontem, se hoje ainda está vazio). */
  sequencia: number;
  /** Minutos de foco do Pomodoro com fim hoje. */
  focoHoje: number;
  leads: Array<{ ref: RefContato; nome: string; faixa: FaixaLead; recebidoEm: string; interesse: string }>;
  leadsNaoVistos: number;
  contatar: Array<{ ref: RefContato; nome: string; data: string; nota: string }>;
  whatsappNaoLidas: number;
  ideiasPendentes: number;
  /** Uma ideia pendente sorteada pelo dia (e pela semente do botão "Outra"). */
  ideia?: { id: string; titulo: string; notas: string; criadaEm: string };
  /** Um pensamento de mais de uma semana, sorteado do mesmo jeito. */
  lembranca?: { id: string; texto: string; criadoEm: string; cor: string };
  roteiros: Array<{ id: string; titulo: string; status: 'rascunho' | 'revisao'; atualizadoEm: string }>;
  roteirosEmRevisao: number;
  roteirosRascunho: number;
}

export const SEMANAS_ATIVIDADE = 16;

export interface SugestaoItem {
  /** Uma ação, no imperativo. */
  titulo: string;
  /** O fato do material que justifica. */
  porque: string;
  alvo?: AlvoHome;
}

export interface SugestaoHome {
  /** sem-ia: nenhuma IA de texto configurada; nova: ainda não gerada hoje; erro: a de hoje falhou. */
  estado: 'sem-ia' | 'nova' | 'pronta' | 'erro';
  dia: string;
  /** A mensagem para o dia: calorosa, pelo apelido, apoiada em fatos reais do material. */
  mensagem?: string;
  sugestoes?: SugestaoItem[];
  geradoEm?: string;
  /** "Claude · claude-sonnet-…": quem escreveu. */
  quem?: string;
  erro?: string;
}
