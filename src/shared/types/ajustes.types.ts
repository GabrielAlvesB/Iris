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

/**
 * Cores de destaque prontas: matiz (h) e croma (c) do OKLCH no tema escuro; o
 * claro escurece e satura a mesma cor (base.css). Violeta é a cor de sempre.
 * Na ordem da roda de cores, para a fileira de amostras não parecer aleatória.
 */
export const CORES_DESTAQUE = [
  { id: 'violeta', rotulo: 'Violeta', h: 292, c: 0.16 },
  { id: 'azul', rotulo: 'Azul', h: 258, c: 0.15 },
  { id: 'ciano', rotulo: 'Ciano', h: 215, c: 0.13 },
  { id: 'verde', rotulo: 'Verde', h: 150, c: 0.16 },
  { id: 'lima', rotulo: 'Lima', h: 128, c: 0.17 },
  { id: 'ambar', rotulo: 'Âmbar', h: 75, c: 0.15 },
  { id: 'laranja', rotulo: 'Laranja', h: 48, c: 0.17 },
  { id: 'vermelho', rotulo: 'Vermelho', h: 25, c: 0.18 },
  { id: 'rosa', rotulo: 'Rosa', h: 350, c: 0.17 },
] as const;

/**
 * Quanto a cor de destaque toma conta do app (base.css, `data-intensidade` no
 * <html>): saturação do acento, o tom que tinge fundo e bordas e o brilho.
 * Vibrante é o padrão desde a 0.4; Sutil fica perto do visual antigo.
 */
export const INTENSIDADES = [
  { id: 'sutil', rotulo: 'Sutil', descricao: 'A cor só nos detalhes, fundo quase neutro' },
  { id: 'vibrante', rotulo: 'Vibrante', descricao: 'A cor no app inteiro, com gradiente e brilho' },
  { id: 'intensa', rotulo: 'Intensa', descricao: 'Saturada ao máximo, fundo bem tingido' },
] as const;

export type Intensidade = (typeof INTENSIDADES)[number]['id'];

export function isIntensidade(v: unknown): v is Intensidade {
  return typeof v === 'string' && INTENSIDADES.some((i) => i.id === v);
}

export type CorDestaqueId = (typeof CORES_DESTAQUE)[number]['id'];

export function isCorDestaqueId(v: unknown): v is CorDestaqueId {
  return typeof v === 'string' && CORES_DESTAQUE.some((c) => c.id === v);
}

/** Uma das prontas, ou "livre" com a cor escolhida no seletor (#rrggbb). */
export interface Destaque {
  id: CorDestaqueId | 'livre';
  hex?: string;
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
  /** v6. Ausente no arquivo antigo = violeta, a cor de antes. */
  destaque: Destaque;
  /** v7. Fechar a janela deixa o Iris na bandeja do sistema (desligado por padrão). */
  bandeja: boolean;
  /** v8. Como a Home chama o usuário ("Boa tarde, Gabi"). Vazio = só a saudação. */
  apelido: string;
  /** v9. Quanto a cor de destaque toma conta do app. Ausente no arquivo antigo = vibrante. */
  intensidade: Intensidade;
}

/** Cabe numa saudação de uma linha. */
export const MAX_APELIDO = 40;

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
  destaque: Destaque;
  bandeja: boolean;
  apelido: string;
  intensidade: Intensidade;
}
