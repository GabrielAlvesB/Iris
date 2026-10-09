import type { ModuloId } from './modulos.types';
import type { Endereco } from './brasil';

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

/**
 * Quem usa o Iris: a outra parte dos contratos e o cabeçalho dos documentos.
 * Um cadastro só, em Ajustes — contrato, ficha e (no futuro) propostas leem daqui.
 */
export interface PerfilUsuario {
  tipo: 'pf' | 'pj';
  /** Nome completo (pessoa física) ou razão social (empresa). */
  nome: string;
  nomeFantasia: string;
  /** CPF ou CNPJ, já formatado. */
  documento: string;
  /** Empresa: quem assina por ela. */
  representante: string;
  representanteCpf: string;
  email: string;
  telefone: string;
  endereco: Endereco;
  /** Foro dos contratos, ex.: "São Paulo/SP". Vazio = a cidade do endereço. */
  cidadeForo: string;
}

/**
 * Aparência do app. 'sistema' segue o claro/escuro do Windows. O escuro é o
 * padrão: foi o único tema até a 0.2.0.
 */
export const TEMAS = [
  { id: 'escuro', rotulo: 'Escuro', descricao: 'O padrão do Iris' },
  { id: 'claro', rotulo: 'Claro', descricao: 'Fundo branco, para ambientes iluminados' },
  { id: 'sistema', rotulo: 'Igual ao Windows', descricao: 'Troca sozinho quando o Windows troca' },
] as const;

export type Tema = (typeof TEMAS)[number]['id'];

export function isTema(v: unknown): v is Tema {
  return typeof v === 'string' && TEMAS.some((t) => t.id === v);
}

export interface AjustesFile {
  schemaVersion: number;
  updatedAt: string;
  moduloInicial: ModuloInicial;
  assinatura: AssinaturaRelatorio;
  perfil: PerfilUsuario;
  /**
   * Só os atalhos que o usuário trocou: id da ação → combinação ('' = sem
   * atalho). O padrão de cada ação mora no código (atalhos.catalogo.ts), então
   * mudar um padrão numa versão nova alcança quem nunca mexeu nele.
   */
  atalhos: Record<string, string>;
  tema: Tema;
}

export interface AjustesInfo {
  moduloInicial: ModuloInicial;
  /**
   * false quando o SO não oferece cofre de credenciais — a UI avisa que
   * API key e passphrase ficariam em texto puro.
   */
  criptografiaDisponivel: boolean;
  assinatura: AssinaturaRelatorio;
  perfil: PerfilUsuario;
  atalhos: Record<string, string>;
  tema: Tema;
}
