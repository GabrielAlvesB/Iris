import type { DispositivoNuvem } from '../../../../shared/types/nuvem.types';

/**
 * O que um banco precisa saber fazer para o Iris sincronizar com ele. Um
 * adaptador por serviço (o molde das IAs e do WhatsApp); o motor não conhece
 * Supabase nem SQL.
 *
 * Todo método lança `Error` com mensagem em português: o motor a guarda como o
 * último erro e a tela mostra.
 */

export interface LinhaEnvio {
  arquivo: string;
  colecao: string;
  id: string;
  /** null = excluído. */
  dados: unknown | null;
  esquema: number;
  atualizadoEm: string;
}

export interface LinhaRemota extends LinhaEnvio {
  rev: number;
  dispositivo: string;
}

export interface AdaptadorNuvem {
  /** Versão das tabelas no banco; null = conectou, mas elas ainda não existem. */
  versaoDoEsquema(): Promise<number | null>;
  /** Registros vivos do espaço. */
  contar(espaco: string): Promise<number>;
  enviar(espaco: string, dispositivo: string, linhas: LinhaEnvio[]): Promise<void>;
  /** Em ordem de `rev`, a partir de `desdeRev` (exclusivo), no máximo `limite`. */
  buscar(espaco: string, desdeRev: number, limite: number): Promise<LinhaRemota[]>;
  marcarPresenca(espaco: string, dispositivo: { id: string; nome: string; versao: string }): Promise<void>;
  dispositivos(espaco: string): Promise<DispositivoNuvem[]>;
}

/** Lote de envio: poucas linhas grandes ou muitas pequenas, sempre abaixo de ~400 KB. */
export const MAX_LINHAS_POR_ENVIO = 100;
export const MAX_BYTES_POR_ENVIO = 400_000;
export const LINHAS_POR_BUSCA = 200;
