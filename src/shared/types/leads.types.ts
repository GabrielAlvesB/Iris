import { cnpjValido, formatarDocumento, formatarTelefone, soDigitos } from './brasil.js';

/**
 * Leads que chegam por API: um formulário de site (ou o n8n, ou um Zapier)
 * manda nome, e-mail e telefone, e o Iris cria a pessoa no CRM.
 *
 * Puro e sem electron/node: o main valida com isto o que chega pelos dois
 * caminhos (servidor local e caixa na nuvem) e a aba API desenha a tabela de
 * campos a partir do mesmo catálogo — a documentação não descola da regra.
 */

// ---------- O contrato: campos de POST /v1/leads ----------

export type GrupoCampoApi = 'contato' | 'empresa' | 'conteudo' | 'origem';

export interface CampoApi {
  nome: string;
  obrigatorio: boolean;
  grupo: GrupoCampoApi;
  descricao: string;
  exemplo: string;
}

export const CAMPOS_API: readonly CampoApi[] = [
  { nome: 'nome', obrigatorio: true, grupo: 'contato', descricao: 'Nome de quem preencheu', exemplo: 'Maria Souza' },
  { nome: 'email', obrigatorio: true, grupo: 'contato', descricao: 'E-mail para resposta', exemplo: 'maria@empresa.com.br' },
  { nome: 'telefone', obrigatorio: true, grupo: 'contato', descricao: 'Com DDD; aceita qualquer formatação', exemplo: '(11) 98765-4321' },
  { nome: 'empresa', obrigatorio: false, grupo: 'empresa', descricao: 'Nome da empresa — liga ou cria a empresa no CRM', exemplo: 'Padaria Central' },
  { nome: 'cnpj', obrigatorio: false, grupo: 'empresa', descricao: 'Com ou sem pontuação', exemplo: '12.345.678/0001-95' },
  { nome: 'mensagem', obrigatorio: false, grupo: 'conteudo', descricao: 'O que a pessoa escreveu — vira o primeiro registro do histórico', exemplo: 'Quero um orçamento para…' },
  { nome: 'interesse', obrigatorio: false, grupo: 'conteudo', descricao: 'Produto ou serviço escolhido numa lista', exemplo: 'Gestão de redes' },
  { nome: 'formulario', obrigatorio: false, grupo: 'origem', descricao: 'Nome do formulário, para separar os de cada página', exemplo: 'Contato da home' },
  { nome: 'pagina', obrigatorio: false, grupo: 'origem', descricao: 'Endereço da página onde estava o formulário', exemplo: 'https://seusite.com.br/servicos' },
  { nome: 'utm_source', obrigatorio: false, grupo: 'origem', descricao: 'De onde veio (instagram, google…)', exemplo: 'instagram' },
  { nome: 'utm_medium', obrigatorio: false, grupo: 'origem', descricao: 'Tipo de tráfego (cpc, organic, email…)', exemplo: 'cpc' },
  { nome: 'utm_campaign', obrigatorio: false, grupo: 'origem', descricao: 'Nome da campanha', exemplo: 'lancamento-outubro' },
  { nome: 'utm_term', obrigatorio: false, grupo: 'origem', descricao: 'Palavra-chave do anúncio', exemplo: 'agencia de marketing' },
  { nome: 'utm_content', obrigatorio: false, grupo: 'origem', descricao: 'Qual anúncio ou criativo', exemplo: 'video-depoimento' },
];

/** Campo oculto que pessoa nenhuma vê nem preenche: veio preenchido, é robô. */
export const CAMPO_ISCA = '_site';
/** A chave do formulário pode vir num campo oculto (para o <form> sem JavaScript). */
export const CAMPO_CHAVE = '_chave';
/** Para onde mandar o navegador depois de um <form> comum (senão ele mostra o JSON). */
export const CAMPO_REDIRECIONAR = '_redirecionar';
export const CABECALHO_CHAVE = 'X-Iris-Chave';

export const LIMITE_EXTRAS = 30;
export const LIMITE_BYTES = 32 * 1024;
export const LIMITE_POR_MINUTO = 20;
export const PORTA_PADRAO = 4747;

/**
 * Nomes que formulários prontos (Elementor, RD, Typeform via n8n) costumam
 * usar: aceitar sem exigir que a pessoa renomeie cada campo.
 */
const APELIDOS: Record<string, string> = {
  name: 'nome',
  nome_completo: 'nome',
  'e-mail': 'email',
  mail: 'email',
  phone: 'telefone',
  celular: 'telefone',
  whatsapp: 'telefone',
  fone: 'telefone',
  tel: 'telefone',
  company: 'empresa',
  message: 'mensagem',
  msg: 'mensagem',
  form: 'formulario',
  form_name: 'formulario',
  page: 'pagina',
  url: 'pagina',
};

const NOMES_CONHECIDOS = new Set(CAMPOS_API.map((c) => c.nome));

// ---------- O que fica gravado na pessoa ----------

export type CanalLead = 'nuvem' | 'local';
export type FaixaLead = 'quente' | 'morno' | 'frio';

export const FAIXAS_LEAD: ReadonlyArray<{ id: FaixaLead; rotulo: string }> = [
  { id: 'quente', rotulo: 'Quente' },
  { id: 'morno', rotulo: 'Morno' },
  { id: 'frio', rotulo: 'Frio' },
];

export interface UtmLead {
  source: string;
  medium: string;
  campaign: string;
  term: string;
  content: string;
}

export interface ExtraLead {
  nome: string;
  valor: string;
}

/** O que a pessoa mandou, como mandou — a pontuação é refeita a partir disto. */
export interface EnviadoLead {
  nome: string;
  email: string;
  telefone: string;
  empresa: string;
  cnpj: string;
}

/**
 * Como um lead chegou. Fica na Pessoa (`Pessoa.entrada`): o lead é uma pessoa
 * do CRM desde o primeiro segundo, só que com esta ficha de chegada.
 */
export interface EntradaLead {
  /** "AAAA-MM-DDTHH:mm", hora local — a mesma régua do histórico. */
  recebidoEm: string;
  canal: CanalLead;
  formulario: string;
  pagina: string;
  utm: UtmLead;
  mensagem: string;
  interesse: string;
  extras: ExtraLead[];
  enviado: EnviadoLead;
  pontos: number;
  faixa: FaixaLead;
  /** "+25 informou CNPJ" — a conta à vista na ficha. */
  motivos: string[];
  visto: boolean;
  /** Quantas vezes a mesma pessoa mandou o formulário de novo. */
  retornos: number;
  ultimoEnvioEm?: string;
}

// ---------- Configuração (contatos.json › leadsConfig) ----------

export const CRITERIOS_PONTUACAO = [
  { id: 'base', rotulo: 'Nome, e-mail e telefone válidos', motivo: 'enviou nome, e-mail e telefone', padrao: 20 },
  { id: 'empresa', rotulo: 'Informou empresa ou CNPJ', motivo: 'informou empresa ou CNPJ', padrao: 25 },
  { id: 'cnpjValido', rotulo: 'CNPJ com dígitos que conferem', motivo: 'CNPJ válido', padrao: 5 },
  { id: 'emailProfissional', rotulo: 'E-mail profissional (não é Gmail, Hotmail…)', motivo: 'e-mail profissional', padrao: 20 },
  { id: 'mensagem', rotulo: 'Escreveu mensagem ou escolheu interesse', motivo: 'escreveu mensagem ou interesse', padrao: 15 },
  { id: 'mensagemLonga', rotulo: 'Mensagem com mais de 80 caracteres', motivo: 'mensagem detalhada', padrao: 5 },
  { id: 'pago', rotulo: 'Veio de anúncio ou campanha (UTM)', motivo: 'veio de anúncio ou campanha', padrao: 15 },
  { id: 'valioso', rotulo: 'Página ou formulário marcado como valioso', motivo: 'página ou formulário valioso', padrao: 10 },
] as const;

export type CriterioId = (typeof CRITERIOS_PONTUACAO)[number]['id'];

export interface RegrasPontuacao {
  pesos: Record<CriterioId, number>;
  /** A partir de quantos pontos é quente. */
  quente: number;
  /** A partir de quantos pontos é morno (abaixo, frio). */
  morno: number;
  /** Trechos de endereço de página ou nomes de formulário que valem mais. */
  valiosos: string[];
}

export interface LeadsConfig {
  servidor: { ativo: boolean; porta: number; rede: boolean };
  nuvem: { ativo: boolean; url: string };
  /** Pública: vai no HTML do formulário e só serve para enviar. */
  chaveFormulario: string;
  regras: RegrasPontuacao;
  notificar: boolean;
  /**
   * Ids da caixa na nuvem já importados (os últimos 300). Se a confirmação
   * falhar no meio, a próxima busca traz de novo — e isto impede o duplicado.
   */
  idsRecebidos: string[];
}

export function regrasPadrao(): RegrasPontuacao {
  const pesos = {} as Record<CriterioId, number>;
  CRITERIOS_PONTUACAO.forEach((c) => (pesos[c.id] = c.padrao));
  return { pesos, quente: 70, morno: 40, valiosos: [] };
}

// ---------- Relatórios de leads (só a configuração; os números são recalculados) ----------

export type PeriodoRapido = '7' | '30' | '90' | 'mes';

export interface PeriodoLeads {
  tipo: PeriodoRapido | 'personalizado';
  /** AAAA-MM-DD, só no personalizado. */
  de: string;
  ate: string;
}

export interface SecoesRelatorioLeads {
  resumo: boolean;
  origens: boolean;
  horarios: boolean;
  lista: boolean;
}

export interface RelatorioLeads {
  id: string;
  titulo: string;
  periodo: PeriodoLeads;
  secoes: SecoesRelatorioLeads;
  comentarios: string;
  criadoEm: string;
  atualizadoEm: string;
  /** Última vez que virou PDF; ausente = salvo sem exportar ainda. */
  exportadoEm?: string;
}

// ---------- Status (main → tela; nunca leva a chave do Iris) ----------

export interface EstadoServidorLocal {
  ativo: boolean;
  ouvindo: boolean;
  endereco: string;
  /** Com "aceitar da rede local": o endereço que os outros aparelhos da casa usam. */
  enderecoRede?: string;
  erro?: string;
}

export interface EstadoBusca {
  em: string;
  ok: boolean;
  mensagem: string;
  importados: number;
}

export interface StatusLeads {
  servidor: EstadoServidorLocal;
  nuvem: { ativo: boolean; url: string; temChaveIris: boolean; finalChaveIris: string; ultimaBusca?: EstadoBusca };
  notificacoesSuportadas: boolean;
}

export interface ResultadoTeste {
  ok: boolean;
  mensagem: string;
  detalhes: string[];
  /** Status HTTP e corpo da resposta, para a tela mostrar "o que voltou". */
  status?: number;
  corpo?: string;
}

// ---------- Validação ----------

export interface LeadValido {
  enviado: EnviadoLead;
  mensagem: string;
  interesse: string;
  formulario: string;
  pagina: string;
  utm: UtmLead;
  extras: ExtraLead[];
}

export type ResultadoValidacao =
  | { ok: true; lead: LeadValido }
  /** Robô (isca preenchida): quem chamou responde 201 e descarta em silêncio. */
  | { ok: false; isca: true }
  | { ok: false; isca: false; erros: Record<string, string> };

function textoDe(v: unknown, max: number): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) return textoDe(v[0], max);
  return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '';
}

const EMAIL_VALIDO = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

export function emailValido(email: string): boolean {
  return email.length <= 254 && EMAIL_VALIDO.test(email);
}

/** 10 ou 11 dígitos (DDD + número) ou um internacional de até 15. */
export function telefoneValido(tel: string): boolean {
  const d = soDigitos(tel);
  return d.length >= 10 && d.length <= 15;
}

function chaveNormalizada(k: string): string {
  const n = k
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]+/g, '_');
  return APELIDOS[n] ?? APELIDOS[k.trim().toLowerCase()] ?? n;
}

/**
 * A validação de verdade, igual para o servidor local e para o que vem da
 * nuvem (a do Worker é só uma barreira). As mensagens vão para quem chamou a
 * API, campo a campo, e em português.
 */
export function validarLead(raw: unknown): ResultadoValidacao {
  const entrada = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const campos: Record<string, unknown> = {};
  const extras: ExtraLead[] = [];
  Object.entries(entrada).forEach(([k, v]) => {
    const nome = chaveNormalizada(k);
    if (NOMES_CONHECIDOS.has(nome)) {
      if (campos[nome] === undefined || campos[nome] === '') campos[nome] = v;
      return;
    }
    if (nome === CAMPO_ISCA || nome === CAMPO_CHAVE || nome === CAMPO_REDIRECIONAR) {
      campos[nome] = v;
      return;
    }
    const valor = textoDe(v, 1000);
    const rotulo = k.trim().slice(0, 60);
    if (valor && rotulo && !rotulo.startsWith('_') && extras.length < LIMITE_EXTRAS) extras.push({ nome: rotulo, valor });
  });

  if (textoDe(campos[CAMPO_ISCA], 200)) return { ok: false, isca: true };

  const erros: Record<string, string> = {};
  const nome = textoDe(campos.nome, 160);
  const email = textoDe(campos.email, 254).toLowerCase();
  const telefone = textoDe(campos.telefone, 40);
  if (!nome) erros.nome = 'Informe o nome.';
  else if (nome.length < 2) erros.nome = 'Nome curto demais.';
  if (!email) erros.email = 'Informe o e-mail.';
  else if (!emailValido(email)) erros.email = 'E-mail inválido.';
  if (!telefone) erros.telefone = 'Informe o telefone.';
  else if (!telefoneValido(telefone)) erros.telefone = 'Telefone inválido — use DDD + número.';
  if (Object.keys(erros).length) return { ok: false, isca: false, erros };

  const cnpj = textoDe(campos.cnpj, 24);
  return {
    ok: true,
    lead: {
      enviado: {
        nome,
        email,
        telefone: formatarTelefone(telefone),
        empresa: textoDe(campos.empresa, 160),
        cnpj: cnpj ? formatarDocumento(cnpj) : '',
      },
      mensagem: textoDe(campos.mensagem, 5000),
      interesse: textoDe(campos.interesse, 200),
      formulario: textoDe(campos.formulario, 120),
      pagina: textoDe(campos.pagina, 500),
      utm: {
        source: textoDe(campos.utm_source, 120),
        medium: textoDe(campos.utm_medium, 120),
        campaign: textoDe(campos.utm_campaign, 160),
        term: textoDe(campos.utm_term, 160),
        content: textoDe(campos.utm_content, 160),
      },
      extras,
    },
  };
}

export function cnpjInformadoValido(cnpj: string): boolean {
  return Boolean(cnpj) && cnpjValido(cnpj);
}

/** Telefone comparável: só dígitos, sem o 55 do país na frente. */
export function telefoneComparavel(tel: string): string {
  const d = soDigitos(tel);
  return d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
}

/** "instagram (cpc)", "Contato da home", "Direto": como a origem de um lead aparece em listas e gráficos. */
export function origemDoLead(e: Pick<EntradaLead, 'utm' | 'formulario'>): string {
  if (e.utm.source) return e.utm.medium ? `${e.utm.source} (${e.utm.medium})` : e.utm.source;
  if (e.utm.campaign) return `Campanha ${e.utm.campaign}`;
  return e.formulario || 'Direto';
}

/** Endereço base: sem barra no fim e sem /v1/leads (quem cola o endereço inteiro também acerta). */
export function normalizarUrlNuvem(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1(\/leads)?$/i, '')
    .replace(/\/+$/, '');
}
