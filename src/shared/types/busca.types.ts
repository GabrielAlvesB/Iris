import type { RefContato } from './contatos.types';
import type { TipoPostagem } from './postagens.types';

/**
 * Busca global (Ctrl+K / Ctrl+P): o main lê os arquivos e devolve uma lista
 * compacta, uma linha por coisa encontrável. A paleta filtra em memória — a
 * lista é pedida uma vez a cada abertura, não a cada tecla.
 */

export type TipoItemBusca =
  | 'Card'
  | 'Checklist'
  | 'Bloco'
  | 'Post-it'
  | 'Arquivo'
  | 'Postagem'
  | 'Linha'
  | 'Roteiro'
  | 'Link'
  | 'Texto'
  | 'Contato';

/** Para onde o resultado leva. O renderer resolve cada um em navegacao.ts. */
export type AlvoBusca =
  | { modulo: 'kanban'; id: string }
  | { modulo: 'todo'; id: string }
  | { modulo: 'quadro'; id: string }
  | { modulo: 'pensamentos'; id: string }
  | { modulo: 'explorador'; id: string }
  | { modulo: 'roteiros'; id: string }
  | { modulo: 'copy'; id: string }
  | { modulo: 'sheets'; id: string; tabelaId: string }
  | { modulo: 'postagens'; id: string; tipo: TipoPostagem }
  | { modulo: 'contatos'; ref: RefContato }
  | { modulo: 'links'; url: string };

export interface ItemBusca {
  tipo: TipoItemBusca;
  rotulo: string;
  /** Onde está e em que pé ("A Fazer · vence 14/10", "Tabela Agenda"). */
  detalhe: string;
  /** O resto do texto do item, só para casar com a busca (cortado num tamanho razoável). */
  termos: string;
  alvo: AlvoBusca;
}
