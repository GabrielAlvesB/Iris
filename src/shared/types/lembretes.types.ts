import type { AlvoBusca } from './busca.types';

/**
 * Lembretes do sistema (notificações nativas) para o que a tela Hoje mostra:
 * postagens com horário, prazos do dia e rotinas com hora. Só funcionam com o
 * Iris aberto — por isso a opção da bandeja existe (fechar a janela sem sair).
 */

export interface ConfigLembretes {
  ativo: boolean;
  postagens: { ativo: boolean; /** Minutos antes do horário marcado. */ antecedenciaMin: number };
  /** Um resumo por dia, no horário escolhido: prazos de hoje e atrasados. */
  prazos: { ativo: boolean; hora: string };
  rotinas: { ativo: boolean };
  /** Segunda de manhã: "a revisão da semana passada está pronta" (no horário dos prazos). */
  revisaoSemanal: { ativo: boolean };
  naoPerturbe: { ativo: boolean; de: string; ate: string };
}

export interface LembretesFile {
  schemaVersion: number;
  config: ConfigLembretes;
  /**
   * O que já foi avisado: chave → ISO de quando. Fechar e abrir o app não
   * repete aviso; entradas com mais de 7 dias saem.
   */
  avisados: Record<string, string>;
}

export const ANTECEDENCIAS_POSTAGEM = [5, 10, 15, 30, 60] as const;

export function configLembretesPadrao(): ConfigLembretes {
  return {
    ativo: true,
    postagens: { ativo: true, antecedenciaMin: 15 },
    prazos: { ativo: true, hora: '09:00' },
    rotinas: { ativo: true },
    revisaoSemanal: { ativo: true },
    naoPerturbe: { ativo: false, de: '22:00', ate: '07:00' },
  };
}

export interface EstadoLembretes {
  config: ConfigLembretes;
  /** false = o sistema não mostra notificações (alguns Linux sem servidor de notificações). */
  suportado: boolean;
}

/** O clique na notificação: o item, ou a tela Hoje / a revisão. */
export interface AberturaLembrete {
  alvo?: AlvoBusca;
  tela?: 'hoje' | 'semana';
}
