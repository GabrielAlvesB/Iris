import type { Unsubscribe } from '../../shared/types/events.types';

/**
 * Agrupa as assinaturas de push de um módulo.
 *
 * O contextBridge não devolve a identidade do listener, então quem cancela é a
 * closure criada no preload. Juntar tudo aqui, com attach/detach idempotentes,
 * torna assinatura duplicada estruturalmente impossível quando o usuário
 * entra e sai do módulo várias vezes.
 */
export interface PushBinding {
  attach(): void;
  detach(): void;
  readonly ativo: boolean;
}

type Assinante = () => Unsubscribe;

export function createPushBinding(assinantes: Assinante[]): PushBinding {
  let ativos: Unsubscribe[] = [];

  return {
    attach(): void {
      if (ativos.length > 0) return;
      ativos = assinantes.map((assinar) => assinar());
    },
    detach(): void {
      ativos.forEach((cancelar) => cancelar());
      ativos = [];
    },
    get ativo(): boolean {
      return ativos.length > 0;
    },
  };
}
