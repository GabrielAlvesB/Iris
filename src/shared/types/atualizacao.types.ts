/**
 * Atualização do app pelas Releases do GitHub. Compilado pelos dois lados
 * (vai no evento push): só JSON puro.
 */

export type SituacaoAtualizacao =
  | 'ocioso'
  | 'verificando'
  | 'em-dia'
  | 'disponivel'
  | 'baixando'
  | 'instalando'
  | 'erro';

/**
 * Só a instalação feita pelo instalador (NSIS) consegue se substituir sozinha.
 * O .zip portátil e o `npm run dev` só avisam e abrem a página da release.
 */
export type ModoAtualizacao = 'instalado' | 'portatil' | 'desenvolvimento';

export interface NovaVersao {
  versao: string;
  /** Texto da release no GitHub (markdown cru; mostrado como texto). */
  notas: string;
  publicadaEm: string;
  paginaUrl: string;
  /** Bytes do instalador, quando a release tem um. */
  tamanho?: number;
}

export interface EstadoAtualizacao {
  versaoAtual: string;
  situacao: SituacaoAtualizacao;
  modo: ModoAtualizacao;
  nova?: NovaVersao;
  /** 0 a 1, durante o download. */
  progresso?: number;
  erro?: string;
  verificadoEm?: string;
}

/** "0.1.10" > "0.1.9": compara número a número, ignorando o "v" da tag. */
export function versaoMaior(a: string, b: string): boolean {
  const partes = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = partes(a);
  const pb = partes(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diferenca = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diferenca !== 0) return diferenca > 0;
  }
  return false;
}
