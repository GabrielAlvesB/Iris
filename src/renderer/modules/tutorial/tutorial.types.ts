import type { GuiaId } from '../../core/navegacao.js';
import type { CategoriaId, ModuloId } from '../../../shared/types/modulos.types.js';

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
  /** Numerada quando a ordem importa (um caminho a seguir); senão, marcadores. */
  numerada?: boolean;
}

export interface BlocoAviso {
  tipo: 'aviso';
  /** dica = atalho ou jeito mais rápido; info = contexto; atencao = onde as pessoas tropeçam. */
  nivel: 'dica' | 'info' | 'atencao';
  texto: string;
}

export interface BlocoLink {
  tipo: 'link';
  url: string;
  rotulo: string;
}

export interface BlocoAtalhos {
  tipo: 'atalhos';
  itens: Array<{ teclas: string[]; texto: string }>;
}

/** Botão que leva direto à tela de que o passo fala. */
export interface BlocoAbrir {
  tipo: 'abrir';
  rotulo: string;
  modulo?: ModuloId;
  /** Seção de Ajustes (ex.: 'ia', 'backup'). */
  ajustes?: string;
}

export type Bloco = BlocoTexto | BlocoComando | BlocoLista | BlocoAviso | BlocoLink | BlocoAtalhos | BlocoAbrir;

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
  /**
   * Alternativa entre outras (cada provedor de IA): mostra "configurado" quando
   * está, mas não conta no progresso — ninguém precisa configurar os cinco.
   */
  opcional?: boolean;
}

/** Onde o guia aparece no Início; segue as categorias da barra lateral. */
export type GrupoGuia = 'comecar' | 'conectar' | 'dia' | CategoriaId | 'app';

export interface Guia {
  id: GuiaId;
  titulo: string;
  /** Uma linha para o cartão do Início. */
  chamada: string;
  resumo: string;
  grupo: GrupoGuia;
  /** Módulo de que o guia fala: dá o ícone e o botão "Abrir". */
  modulo?: ModuloId;
  /** Ícone próprio quando o guia não é de um módulo. */
  icone?: string;
  passos: Passo[];
}
