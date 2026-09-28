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
  /** Versão sendo baixada/instalada — pode não ser a `nova` (instalação manual de outra versão). */
  versaoAlvo?: string;
  /** 0 a 1, durante o download. */
  progresso?: number;
  erro?: string;
  /** O repositório não tem release publicada: "em dia" só porque não há com o que comparar. */
  semReleases?: boolean;
  verificadoEm?: string;
}

/** Onde uma versão fica em relação à que está rodando. */
export type RelacaoVersao = 'mais-nova' | 'atual' | 'anterior';

/** Uma release do GitHub, para a lista "Escolher versão". */
export interface VersaoPublicada {
  versao: string;
  publicadaEm: string;
  notas: string;
  paginaUrl: string;
  tamanho?: number;
  preRelease: boolean;
  /** Tem instalador e latest.yml: dá para instalar pelo app. */
  instalavel: boolean;
  relacao: RelacaoVersao;
}

/** Instalador escolhido no disco. O caminho fica só no main. */
export interface InstaladorLocal {
  nome: string;
  versao?: string;
  tamanho: number;
  /** Havia um latest.yml ao lado e o SHA-512 bateu. */
  conferido: boolean;
  relacao?: RelacaoVersao;
}

export function relacaoCom(versao: string, atual: string): RelacaoVersao {
  if (versaoMaior(versao, atual)) return 'mais-nova';
  if (versaoMaior(atual, versao)) return 'anterior';
  return 'atual';
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
