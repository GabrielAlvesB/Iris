import type { GithubSnapshot } from './github.types';
import type { N8nSnapshot } from './n8n.types';
import type { ServidoresFile, SshSaidaChunk } from './servidores.types';

/**
 * Eventos empurrados do processo principal para o renderer.
 *
 * Este arquivo é compilado pelos DOIS tsconfigs, então não pode importar
 * 'electron', 'node:*' nem 'ssh2'. Todo payload precisa sobreviver ao
 * structured clone do IPC — só JSON puro, sem Date, Buffer, Map ou Set.
 */
export type IrisEvent =
  | { topic: 'explorador:mudou'; payload: { raizId: string; pastasAfetadas: string[] } }
  | { topic: 'servidores:estado'; payload: ServidoresFile }
  | { topic: 'servidores:saida'; payload: SshSaidaChunk }
  | { topic: 'n8n:snapshot'; payload: N8nSnapshot }
  | { topic: 'github:snapshot'; payload: GithubSnapshot }
  | { topic: 'app:erro'; payload: { escopo: string; mensagem: string } };

export type IrisEventTopic = IrisEvent['topic'];

export type IrisEventPayload<T extends IrisEventTopic> = Extract<IrisEvent, { topic: T }>['payload'];

export type Unsubscribe = () => void;
