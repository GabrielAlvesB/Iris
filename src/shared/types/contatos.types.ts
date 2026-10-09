import type { BaseEntity } from './common.types';
import type { Endereco } from './brasil';
import type { EntradaLead, LeadsConfig, RelatorioLeads } from './leads.types';

/**
 * Contatos: o CRM do Iris. Pessoas e empresas são cadastros separados (uma
 * pessoa pode pertencer a uma empresa do próprio CRM), com histórico de
 * interações, funil de etapas e contratos gerados a partir de modelos.
 *
 * Nada aqui se liga às "empresas" de Postagens: lá empresa é uma tag de
 * conteúdo; aqui é um cliente com CNPJ, endereço e contrato.
 */

export type TipoContato = 'pessoa' | 'empresa';

/** Aponta um contato sem saber de que lista ele vem. */
export interface RefContato {
  tipo: TipoContato;
  id: string;
}

export const TIPOS_TELEFONE = [
  { id: 'celular', rotulo: 'Celular' },
  { id: 'whatsapp', rotulo: 'WhatsApp' },
  { id: 'fixo', rotulo: 'Fixo' },
] as const;
export type TipoTelefone = (typeof TIPOS_TELEFONE)[number]['id'];

export interface Telefone {
  numero: string;
  tipo: TipoTelefone;
}

export const TIPOS_REDE_CONTATO = [
  { id: 'instagram', rotulo: 'Instagram' },
  { id: 'linkedin', rotulo: 'LinkedIn' },
  { id: 'site', rotulo: 'Site' },
  { id: 'outro', rotulo: 'Outro' },
] as const;
export type TipoRedeContato = (typeof TIPOS_REDE_CONTATO)[number]['id'];

export interface RedeContato {
  tipo: TipoRedeContato;
  valor: string;
}

/** O lembrete que faz o CRM ser usado: quando falar de novo e sobre o quê. */
export interface ProximoContato {
  /** AAAA-MM-DD, data local. */
  data: string;
  nota: string;
}

/** O que pessoa e empresa têm em comum. */
export interface ContatoBase extends BaseEntity {
  etapaId: string;
  /** Posição no funil, dentro da etapa. */
  ordem: number;
  emails: string[];
  telefones: Telefone[];
  endereco: Endereco;
  redes: RedeContato[];
  /** De onde veio: "Indicação", "Instagram"… texto livre, com sugestões dos já usados. */
  origem: string;
  tags: string[];
  /** Quanto este contato vale (proposta, contrato em vista). Soma por etapa no funil. */
  valorEstimado?: number;
  observacoes: string;
  proximoContato?: ProximoContato;
  arquivado: boolean;
  /** Pediu para não receber mensagens: o WhatsApp do Iris recusa enviar (individual e para vários). */
  naoEnviarWhatsapp?: boolean;
}

export interface Pessoa extends ContatoBase {
  nome: string;
  apelido: string;
  cpf: string;
  rg: string;
  /** AAAA-MM-DD */
  nascimento?: string;
  /** Empresa do CRM em que trabalha. */
  empresaId?: string;
  cargo: string;
  /** Só de quem chegou pelo formulário (API de leads): como, quando e com que pontuação. */
  entrada?: EntradaLead;
}

export interface EmpresaCrm extends ContatoBase {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string;
  segmento: string;
}

export const TIPOS_INTERACAO = [
  { id: 'nota', rotulo: 'Nota' },
  { id: 'ligacao', rotulo: 'Ligação' },
  { id: 'reuniao', rotulo: 'Reunião' },
  { id: 'email', rotulo: 'E-mail' },
  { id: 'whatsapp', rotulo: 'WhatsApp' },
] as const;

/**
 * `evento` (etapa mudou, contrato gerado), `formulario` (o que a pessoa
 * escreveu ao enviar o formulário) e `whatsapp-iris` (um por dia: as mensagens
 * que o Iris mandou — conta como contato feito) são escritos pelo app; o
 * usuário não escolhe nem edita.
 */
export type TipoInteracao = (typeof TIPOS_INTERACAO)[number]['id'] | 'evento' | 'formulario' | 'whatsapp-iris';

/** Os que o app escreve sozinho: não se registram nem se editam pela tela. */
export const INTERACOES_DO_APP: ReadonlySet<string> = new Set(['evento', 'formulario', 'whatsapp-iris']);

export interface Interacao {
  id: string;
  contato: RefContato;
  tipo: TipoInteracao;
  /** AAAA-MM-DDTHH:mm, hora local — dá para registrar algo que aconteceu antes. */
  data: string;
  texto: string;
  criadoEm: string;
}

/** `ganha` e `perdida` fecham o relacionamento; os indicadores contam por elas. */
export type TipoEtapa = 'aberta' | 'ganha' | 'perdida';

export interface EtapaFunil {
  id: string;
  nome: string;
  /** Hex, das cores do funil. */
  cor: string;
  tipo: TipoEtapa;
}

export const CORES_ETAPA = ['#9498a3', '#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#ef4444', '#14b8a6', '#ec4899'] as const;

export interface ModeloContrato {
  id: string;
  nome: string;
  /** Para que ocasião serve (ex.: "Serviço mensal — clientes PJ"). Ajuda a escolher no Novo contrato. */
  quandoUsar: string;
  /** Texto com campos entre chaves: {nome}, {cpf}, {valor}. Ver contratos.campos.ts. */
  corpo: string;
  criadoEm: string;
  atualizadoEm: string;
}

export const SITUACOES_CONTRATO = [
  { id: 'rascunho', rotulo: 'Rascunho' },
  { id: 'enviado', rotulo: 'Enviado' },
  { id: 'assinado', rotulo: 'Assinado' },
  { id: 'cancelado', rotulo: 'Cancelado' },
] as const;
export type SituacaoContrato = (typeof SITUACOES_CONTRATO)[number]['id'];

export interface MudancaSituacao {
  situacao: SituacaoContrato;
  em: string;
}

/**
 * Um contrato gerado. Guarda uma cópia do texto final: editar o modelo depois
 * não muda contrato nenhum (a mesma ideia do snapshot dos Relatórios). O nome
 * do contato também é cópia — excluir o contato não apaga o contrato.
 */
export interface Contrato {
  id: string;
  contato: RefContato;
  contatoNome: string;
  modeloId?: string;
  modeloNome: string;
  titulo: string;
  corpo: string;
  /** Valores digitados nos campos que não vêm do cadastro ({valor}, {prazo}…). */
  campos: Record<string, string>;
  situacao: SituacaoContrato;
  historico: MudancaSituacao[];
  criadoEm: string;
  atualizadoEm: string;
}

export interface ContatosFile {
  schemaVersion: number;
  updatedAt: string;
  pessoas: Pessoa[];
  empresas: EmpresaCrm[];
  interacoes: Interacao[];
  etapas: EtapaFunil[];
  modelos: ModeloContrato[];
  contratos: Contrato[];
  /** API de leads: servidor local, caixa na nuvem, pontuação, avisos. A chave do Iris fica no cofre. */
  leadsConfig: LeadsConfig;
  /** Relatórios de leads já exportados: só a configuração — os números são sempre recalculados. */
  relatoriosLeads: RelatorioLeads[];
}

// ---------- Entradas ----------

export interface MoverNoFunilInput {
  contato: RefContato;
  etapaId: string;
  /** A coluna de destino inteira, na ordem nova (inclui o contato movido). */
  ordem: RefContato[];
}

export interface RegistrarInteracaoInput {
  contato: RefContato;
  tipo: TipoInteracao;
  data: string;
  texto: string;
}

export interface EditarInteracaoInput {
  id: string;
  tipo?: TipoInteracao;
  data?: string;
  texto?: string;
}

export interface SalvarModeloInput {
  id?: string;
  nome: string;
  quandoUsar?: string;
  corpo: string;
}

export interface CriarContratoInput {
  contato: RefContato;
  modeloId?: string;
  titulo: string;
  /** Já preenchido (e talvez ajustado) na tela; a prévia e o gravado são o mesmo texto. */
  corpo: string;
  campos: Record<string, string>;
}

export interface AtualizarContratoInput {
  id: string;
  titulo?: string;
  corpo?: string;
  situacao?: SituacaoContrato;
}

export interface ExportarDocumentoInput {
  /** Nome sugerido no diálogo, sem extensão. */
  nomeArquivo: string;
  /** Texto do rodapé de cada página. */
  rodape: string;
  /** Título do diálogo de salvar. */
  titulo: string;
}

export interface DescartarLeadInput {
  pessoaId: string;
  motivo: string;
}

/** Tudo opcional: o que vier é mesclado sobre a configuração salva. */
export interface SalvarLeadsConfigInput {
  servidor?: Partial<LeadsConfig['servidor']>;
  nuvem?: Partial<LeadsConfig['nuvem']>;
  regras?: Partial<LeadsConfig['regras']>;
  notificar?: boolean;
}

// ---------- Leitura ----------

export function refIgual(a: RefContato, b: RefContato): boolean {
  return a.tipo === b.tipo && a.id === b.id;
}

export function nomeDoContato(c: Pessoa | EmpresaCrm): string {
  return 'razaoSocial' in c ? c.nomeFantasia || c.razaoSocial : c.nome;
}

export function ehPessoa(c: Pessoa | EmpresaCrm): c is Pessoa {
  return !('razaoSocial' in c);
}

export function acharContato(file: Pick<ContatosFile, 'pessoas' | 'empresas'>, ref: RefContato): Pessoa | EmpresaCrm | undefined {
  return ref.tipo === 'pessoa' ? file.pessoas.find((p) => p.id === ref.id) : file.empresas.find((e) => e.id === ref.id);
}

export function refDe(c: Pessoa | EmpresaCrm): RefContato {
  return { tipo: ehPessoa(c) ? 'pessoa' : 'empresa', id: c.id };
}
