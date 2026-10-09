import type { EstadoAtualizacao } from './atualizacao.types';
import type { RefContato } from './contatos.types';
import type { GithubSnapshot } from './github.types';
import type { TarefaIa } from './ia.types';
import type { N8nSnapshot } from './n8n.types';
import type { TipoPostagem } from './postagens.types';
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
  /** Agendadas publicadas sozinhas no horário: o renderer relê o arquivo do tipo. */
  | { topic: 'postagens:mudou'; payload: { tipo: TipoPostagem } }
  | { topic: 'atualizacao:estado'; payload: EstadoAtualizacao }
  /** Geração de imagem em andamento, pronta, com erro ou cancelada. */
  | { topic: 'ia:tarefa'; payload: TarefaIa }
  /**
   * Leads chegaram (servidor local ou caixa na nuvem) ou a busca mudou de
   * estado: Contatos relê o arquivo e o selo da barra lateral se ajusta.
   */
  | { topic: 'contatos:mudou'; payload: { novos: number; naoVistos: number } }
  /** Clique na notificação de lead novo: abrir a ficha (sem ref, a caixa de leads). */
  | { topic: 'contatos:abrir'; payload: { ref?: RefContato } }
  /** Mensagem chegou, status mudou, envio terminou: a conversa e o selo de não lidas se atualizam. */
  | { topic: 'whatsapp:mudou'; payload: { naoLidas: number; contato?: RefContato } }
  /** Clique na notificação de mensagem: abrir a conversa (sem ref, o número em "Sem cadastro"). */
  | { topic: 'whatsapp:abrir'; payload: { ref?: RefContato; numero?: string } }
  | { topic: 'app:erro'; payload: { escopo: string; mensagem: string } };

export type IrisEventTopic = IrisEvent['topic'];

export type IrisEventPayload<T extends IrisEventTopic> = Extract<IrisEvent, { topic: T }>['payload'];

export type Unsubscribe = () => void;
