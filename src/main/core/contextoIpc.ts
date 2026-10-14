import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Qual canal de IPC está sendo atendido agora. `registerAllIpcHandlers` roda
 * cada handler dentro deste contexto, e ele segue por todo `await` que o handler
 * fizer — assim o jsonStore sabe, sem nenhum service mudar, se uma gravação veio
 * de uma ação do usuário (tem canal) ou de uma tarefa de fundo (não tem).
 */
export interface ContextoIpc {
  canal: string;
}

export const contextoIpc = new AsyncLocalStorage<ContextoIpc>();
