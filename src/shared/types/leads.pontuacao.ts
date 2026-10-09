import {
  CRITERIOS_PONTUACAO,
  cnpjInformadoValido,
  emailValido,
  telefoneValido,
  type CriterioId,
  type EntradaLead,
  type FaixaLead,
  type RegrasPontuacao,
} from './leads.types.js';

/**
 * "Vale a pena?" — a pontuação automática de um lead, de 0 a 100. Pura e
 * usada pelos dois lados: o main grava o resultado na chegada (e refaz tudo
 * quando as regras mudam); a tela mostra os motivos, que são a própria conta.
 */

/** Provedores de e-mail pessoal: quem escreve de um domínio próprio costuma ser empresa. */
export const DOMINIOS_PESSOAIS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.com.br',
  'outlook.com',
  'outlook.com.br',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.com.br',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'bol.com.br',
  'uol.com.br',
  'terra.com.br',
  'ig.com.br',
  'globo.com',
  'globomail.com',
  'r7.com',
  'zipmail.com.br',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
]);

export function emailProfissional(email: string): boolean {
  const dominio = email.split('@')[1]?.toLowerCase().trim() ?? '';
  return Boolean(dominio) && emailValido(email) && !DOMINIOS_PESSOAIS.has(dominio);
}

/** Palavra inteira: "paid_social" e "facebook-ads" contam; "leads" não. */
const MEIOS_PAGOS = /(^|[^a-z])(cpc|ppc|cpm|cpv|paid|pago|ads?|display|banner|retargeting|remarketing)([^a-z]|$)/i;

export function origemPaga(utm: EntradaLead['utm']): boolean {
  return MEIOS_PAGOS.test(utm.medium.trim()) || Boolean(utm.campaign.trim());
}

function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Um trecho de "valiosos" casa com o endereço da página ou com o nome do formulário. */
export function ehValioso(e: Pick<EntradaLead, 'pagina' | 'formulario'>, valiosos: string[]): boolean {
  const pagina = normalizar(e.pagina);
  const formulario = normalizar(e.formulario);
  return valiosos.some((v) => {
    const t = normalizar(v);
    return Boolean(t) && ((pagina && pagina.includes(t)) || (formulario && formulario === t) || (formulario && formulario.includes(t)));
  });
}

export function faixaDe(pontos: number, regras: Pick<RegrasPontuacao, 'quente' | 'morno'>): FaixaLead {
  if (pontos >= regras.quente) return 'quente';
  if (pontos >= regras.morno) return 'morno';
  return 'frio';
}

export interface Pontuacao {
  pontos: number;
  faixa: FaixaLead;
  motivos: string[];
}

export type DadosPontuaveis = Pick<EntradaLead, 'enviado' | 'mensagem' | 'interesse' | 'utm' | 'pagina' | 'formulario'>;

/** Quais critérios um lead cumpre, na ordem do catálogo. */
export function criteriosCumpridos(e: DadosPontuaveis, valiosos: string[]): CriterioId[] {
  const { enviado } = e;
  const texto = `${e.mensagem} ${e.interesse}`.trim();
  const cumpre: Record<CriterioId, boolean> = {
    base: Boolean(enviado.nome) && emailValido(enviado.email) && telefoneValido(enviado.telefone),
    empresa: Boolean(enviado.empresa.trim() || enviado.cnpj.trim()),
    cnpjValido: cnpjInformadoValido(enviado.cnpj),
    emailProfissional: emailProfissional(enviado.email),
    mensagem: Boolean(texto),
    mensagemLonga: e.mensagem.trim().length > 80,
    pago: origemPaga(e.utm),
    valioso: ehValioso(e, valiosos),
  };
  return CRITERIOS_PONTUACAO.map((c) => c.id).filter((id) => cumpre[id]);
}

export function pontuar(e: DadosPontuaveis, regras: RegrasPontuacao): Pontuacao {
  let soma = 0;
  const motivos: string[] = [];
  criteriosCumpridos(e, regras.valiosos).forEach((id) => {
    const peso = regras.pesos[id] ?? 0;
    if (!peso) return;
    soma += peso;
    const criterio = CRITERIOS_PONTUACAO.find((c) => c.id === id)!;
    motivos.push(`${peso > 0 ? '+' : ''}${peso} ${criterio.motivo}`);
  });
  const pontos = Math.max(0, Math.min(100, Math.round(soma)));
  return { pontos, faixa: faixaDe(pontos, regras), motivos };
}

/** Soma máxima possível com os pesos atuais — a tela avisa quando passa de 100 (o teto corta). */
export function somaMaxima(regras: RegrasPontuacao): number {
  return CRITERIOS_PONTUACAO.reduce((s, c) => s + Math.max(0, regras.pesos[c.id] ?? 0), 0);
}
