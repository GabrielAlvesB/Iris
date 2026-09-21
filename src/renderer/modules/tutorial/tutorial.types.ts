import type { GuiaId } from '../../core/navegacao.js';

export type { GuiaId };

export interface BlocoTexto {
  tipo: 'texto';
  texto: string;
}

export interface BlocoComando {
  tipo: 'comando';
  comando: string;
  legenda?: string;
}

export interface BlocoLista {
  tipo: 'lista';
  itens: string[];
}

export interface BlocoAviso {
  tipo: 'aviso';
  nivel: 'info' | 'atencao';
  texto: string;
}

export interface BlocoLink {
  tipo: 'link';
  url: string;
  rotulo: string;
}

export type Bloco = BlocoTexto | BlocoComando | BlocoLista | BlocoAviso | BlocoLink;

/** ok = já resolvido, pendente = falta fazer, desconhecido = não deu para checar. */
export type EstadoPasso = 'ok' | 'pendente' | 'desconhecido' | 'manual';

export interface Passo {
  id: string;
  titulo: string;
  blocos: Bloco[];
  /**
   * Consulta o estado real do app. Ausente = passo informativo, sem checagem.
   * Nunca deve lançar: erro vira 'desconhecido' em vez de acusar pendência falsa.
   */
  verificar?: () => Promise<boolean>;
}

export interface Guia {
  id: GuiaId;
  titulo: string;
  resumo: string;
  passos: Passo[];
}
