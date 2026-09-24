import type { ModuloId } from './modulos.types';

/** Nome de módulo que o app pode abrir ao iniciar — qualquer um do catálogo. */
export type ModuloInicial = ModuloId;

export const FORMATOS_ASSINATURA = [
  { id: 'simples', rotulo: 'Simples', descricao: 'Nome e linhas alinhados à esquerda' },
  { id: 'com-linha', rotulo: 'Com linha', descricao: 'Linha para assinar acima do nome' },
  { id: 'centralizada', rotulo: 'Centralizada', descricao: 'Bloco centralizado no fim da página' },
] as const;

export type FormatoAssinatura = (typeof FORMATOS_ASSINATURA)[number]['id'];

export function isFormatoAssinatura(v: unknown): v is FormatoAssinatura {
  return typeof v === 'string' && FORMATOS_ASSINATURA.some((f) => f.id === v);
}

/**
 * Identificação no fim dos relatórios em PDF. Fica nos Ajustes, não no código
 * que gera o documento: trocar nome, texto ou formato não exige mexer nele.
 */
export interface AssinaturaRelatorio {
  /** Vazio = relatórios saem sem assinatura. */
  nome: string;
  /** Linhas abaixo do nome (ex.: "Direitos reservados", "Tech"). */
  linhas: string[];
  formato: FormatoAssinatura;
  /** Data de emissão junto da assinatura. */
  mostrarData: boolean;
}

export interface AjustesFile {
  schemaVersion: number;
  updatedAt: string;
  moduloInicial: ModuloInicial;
  assinatura: AssinaturaRelatorio;
}

export interface AjustesInfo {
  moduloInicial: ModuloInicial;
  /**
   * false quando o SO não oferece cofre de credenciais — a UI avisa que
   * API key e passphrase ficariam em texto puro.
   */
  criptografiaDisponivel: boolean;
  assinatura: AssinaturaRelatorio;
}
