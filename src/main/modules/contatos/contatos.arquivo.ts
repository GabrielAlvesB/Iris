import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import { formatarDocumento, formatarTelefone, lerEndereco } from '../../../shared/types/brasil';
import {
  CORES_ETAPA,
  SITUACOES_CONTRATO,
  TIPOS_INTERACAO,
  TIPOS_REDE_CONTATO,
  TIPOS_TELEFONE,
  type ContatoBase,
  type ContatosFile,
  type Contrato,
  type EmpresaCrm,
  type EtapaFunil,
  type Interacao,
  type ModeloContrato,
  type MudancaSituacao,
  type Pessoa,
  type ProximoContato,
  type RedeContato,
  type RefContato,
  type SituacaoContrato,
  type Telefone,
  type TipoEtapa,
  type TipoInteracao,
} from '../../../shared/types/contatos.types';
import {
  CRITERIOS_PONTUACAO,
  PORTA_PADRAO,
  normalizarUrlNuvem,
  regrasPadrao,
  type CanalLead,
  type EntradaLead,
  type ExtraLead,
  type LeadsConfig,
  type PeriodoLeads,
  type RegrasPontuacao,
  type RelatorioLeads,
} from '../../../shared/types/leads.types';
import { pontuar } from '../../../shared/types/leads.pontuacao';

/**
 * Leitura e gravação de contatos.json. Tudo que entra — do disco, da tela ou
 * de um backup — passa por estas funções: o resto do módulo confia nelas.
 */

export const FILE_NAME = 'contatos.json';
/** v2: leads por API (Pessoa.entrada, leadsConfig, relatoriosLeads) e o tipo de histórico `formulario`. */
export const SCHEMA_VERSION = 2;

export function nowIso(): string {
  return new Date().toISOString();
}

export function texto(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Texto longo (observações, histórico, contrato): mantém quebras de linha internas. */
export function textoLongo(v: unknown, max = 50_000): string {
  return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '';
}

function dataIso(v: unknown): string | undefined {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 1900 ? v : undefined;
}

/** "AAAA-MM-DDTHH:mm", hora local. Sem hora válida, meio-dia (não cai em outro dia em fuso nenhum). */
export function dataHoraLocal(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(v);
  if (!m || Number(m[1]!.slice(0, 4)) < 1900) return undefined;
  return `${m[1]}T${m[2] ?? '12:00'}`;
}

export function agoraLocal(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function listaDeTexto(v: unknown, max = 20, tamanho = 200): string[] {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<string>();
  return v
    .map((x) => texto(x, tamanho))
    .filter((x) => x && !vistos.has(x.toLowerCase()) && vistos.add(x.toLowerCase()))
    .slice(0, max);
}

function idValido(v: unknown): string {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : randomUUID();
}

export function isRef(v: unknown): v is RefContato {
  const r = v as Partial<RefContato> | null;
  return Boolean(r && (r.tipo === 'pessoa' || r.tipo === 'empresa') && typeof r.id === 'string' && r.id);
}

// ---------- Etapas ----------

export function etapasPadrao(): EtapaFunil[] {
  return [
    { id: 'lead', nome: 'Lead', cor: '#9498a3', tipo: 'aberta' },
    { id: 'conversa', nome: 'Em conversa', cor: '#3b82f6', tipo: 'aberta' },
    { id: 'proposta', nome: 'Proposta', cor: '#f59e0b', tipo: 'aberta' },
    { id: 'cliente', nome: 'Cliente', cor: '#22c55e', tipo: 'ganha' },
    { id: 'perdido', nome: 'Perdido', cor: '#ef4444', tipo: 'perdida' },
  ];
}

function migrateEtapa(raw: unknown): EtapaFunil | null {
  const c = (raw ?? {}) as Partial<EtapaFunil>;
  const nome = texto(c.nome, 40);
  if (!nome) return null;
  const tipo: TipoEtapa = c.tipo === 'ganha' || c.tipo === 'perdida' ? c.tipo : 'aberta';
  return {
    id: idValido(c.id),
    nome,
    cor: typeof c.cor === 'string' && /^#[0-9a-f]{6}$/i.test(c.cor) ? c.cor : CORES_ETAPA[0],
    tipo,
  };
}

// ---------- Contatos ----------

function migrateTelefone(raw: unknown): Telefone | null {
  const c = (raw ?? {}) as Partial<Telefone>;
  const numero = formatarTelefone(texto(c.numero, 30));
  if (!numero) return null;
  return { numero, tipo: TIPOS_TELEFONE.some((t) => t.id === c.tipo) ? (c.tipo as Telefone['tipo']) : 'celular' };
}

function migrateRede(raw: unknown): RedeContato | null {
  const c = (raw ?? {}) as Partial<RedeContato>;
  const valor = texto(c.valor, 300);
  if (!valor) return null;
  return { tipo: TIPOS_REDE_CONTATO.some((t) => t.id === c.tipo) ? (c.tipo as RedeContato['tipo']) : 'outro', valor };
}

function migrateProximo(raw: unknown): ProximoContato | undefined {
  const c = (raw ?? {}) as Partial<ProximoContato>;
  const data = dataIso(c.data);
  return data ? { data, nota: texto(c.nota, 300) } : undefined;
}

function migrateBase(c: Partial<ContatoBase>, etapas: Set<string>, etapaPadrao: string): ContatoBase {
  const agora = nowIso();
  const valor = typeof c.valorEstimado === 'number' && Number.isFinite(c.valorEstimado) && c.valorEstimado >= 0 ? Math.round(c.valorEstimado * 100) / 100 : undefined;
  const proximo = migrateProximo(c.proximoContato);
  return {
    id: idValido(c.id),
    createdAt: typeof c.createdAt === 'string' ? c.createdAt : agora,
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : agora,
    etapaId: typeof c.etapaId === 'string' && etapas.has(c.etapaId) ? c.etapaId : etapaPadrao,
    ordem: typeof c.ordem === 'number' && Number.isFinite(c.ordem) ? c.ordem : 0,
    emails: listaDeTexto(c.emails, 10),
    telefones: Array.isArray(c.telefones) ? c.telefones.map(migrateTelefone).filter((t): t is Telefone => t !== null).slice(0, 10) : [],
    endereco: lerEndereco(c.endereco),
    redes: Array.isArray(c.redes) ? c.redes.map(migrateRede).filter((r): r is RedeContato => r !== null).slice(0, 10) : [],
    origem: texto(c.origem, 80),
    tags: listaDeTexto(c.tags, 20, 40),
    ...(valor !== undefined ? { valorEstimado: valor } : {}),
    observacoes: textoLongo(c.observacoes, 20_000),
    ...(proximo ? { proximoContato: proximo } : {}),
    arquivado: c.arquivado === true,
    ...(c.naoEnviarWhatsapp === true ? { naoEnviarWhatsapp: true } : {}),
  };
}

// ---------- Leads ----------

function migrateExtras(raw: unknown): ExtraLead[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (x ?? {}) as Partial<ExtraLead>)
    .map((x) => ({ nome: texto(x.nome, 60), valor: textoLongo(x.valor, 1000) }))
    .filter((x) => x.nome && x.valor)
    .slice(0, 30);
}

/**
 * A chegada de um lead. Pontos, faixa e motivos são recalculados aqui, com as
 * regras atuais: mudar um peso repontua todo mundo sem passo extra, e um
 * arquivo antigo se alinha sozinho se a regra mudar.
 */
export function migrateEntrada(raw: unknown, regras: RegrasPontuacao): EntradaLead | undefined {
  const c = (raw ?? {}) as Partial<EntradaLead>;
  const recebidoEm = dataHoraLocal(c.recebidoEm);
  if (!recebidoEm) return undefined;
  const utm = (c.utm ?? {}) as Partial<EntradaLead['utm']>;
  const enviado = (c.enviado ?? {}) as Partial<EntradaLead['enviado']>;
  const base = {
    recebidoEm,
    canal: (c.canal === 'nuvem' ? 'nuvem' : 'local') as CanalLead,
    formulario: texto(c.formulario, 120),
    pagina: texto(c.pagina, 500),
    utm: {
      source: texto(utm.source, 120),
      medium: texto(utm.medium, 120),
      campaign: texto(utm.campaign, 160),
      term: texto(utm.term, 160),
      content: texto(utm.content, 160),
    },
    mensagem: textoLongo(c.mensagem, 5000),
    interesse: texto(c.interesse, 200),
    extras: migrateExtras(c.extras),
    enviado: {
      nome: texto(enviado.nome, 160),
      email: texto(enviado.email, 254).toLowerCase(),
      telefone: texto(enviado.telefone, 40),
      empresa: texto(enviado.empresa, 160),
      cnpj: texto(enviado.cnpj, 24),
    },
  };
  const ultimo = dataHoraLocal(c.ultimoEnvioEm);
  return {
    ...base,
    ...pontuar(base, regras),
    visto: c.visto === true,
    retornos: typeof c.retornos === 'number' && Number.isFinite(c.retornos) && c.retornos > 0 ? Math.floor(c.retornos) : 0,
    ...(ultimo ? { ultimoEnvioEm: ultimo } : {}),
  };
}

function inteiro(v: unknown, min: number, max: number, padrao: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : padrao;
}

export function migrateRegras(raw: unknown): RegrasPontuacao {
  const c = (raw ?? {}) as Partial<RegrasPontuacao>;
  const padrao = regrasPadrao();
  const pesosLidos = (c.pesos ?? {}) as Partial<RegrasPontuacao['pesos']>;
  const pesos = { ...padrao.pesos };
  CRITERIOS_PONTUACAO.forEach((k) => (pesos[k.id] = inteiro(pesosLidos[k.id], -100, 100, k.padrao)));
  const quente = inteiro(c.quente, 1, 100, padrao.quente);
  const morno = inteiro(c.morno, 0, 99, padrao.morno);
  // Faixas cruzadas (morno acima de quente) deixariam "quente" inalcançável: voltam ao padrão.
  const [q, m] = morno < quente ? [quente, morno] : [padrao.quente, padrao.morno];
  return { pesos, quente: q, morno: m, valiosos: listaDeTexto(c.valiosos, 30, 200) };
}

export function migrateLeadsConfig(raw: unknown): LeadsConfig {
  const c = (raw ?? {}) as Partial<LeadsConfig>;
  const servidor = (c.servidor ?? {}) as Partial<LeadsConfig['servidor']>;
  const nuvem = (c.nuvem ?? {}) as Partial<LeadsConfig['nuvem']>;
  const ids = Array.isArray(c.idsRecebidos) ? c.idsRecebidos.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 120) : [];
  return {
    servidor: { ativo: servidor.ativo === true, porta: inteiro(servidor.porta, 1024, 65535, PORTA_PADRAO), rede: servidor.rede === true },
    nuvem: { ativo: nuvem.ativo === true, url: normalizarUrlNuvem(texto(nuvem.url, 300)) },
    chaveFormulario: typeof c.chaveFormulario === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(c.chaveFormulario) ? c.chaveFormulario : '',
    regras: migrateRegras(c.regras),
    notificar: c.notificar !== false,
    idsRecebidos: ids.slice(-300),
  };
}

function migratePeriodo(raw: unknown): PeriodoLeads {
  const c = (raw ?? {}) as Partial<PeriodoLeads>;
  const tipo = c.tipo === '7' || c.tipo === '30' || c.tipo === '90' || c.tipo === 'mes' || c.tipo === 'personalizado' ? c.tipo : '30';
  return { tipo, de: dataIso(c.de) ?? '', ate: dataIso(c.ate) ?? '' };
}

export function migrateRelatorioLeads(raw: unknown): RelatorioLeads | null {
  const c = (raw ?? {}) as Partial<RelatorioLeads>;
  const secoes = (c.secoes ?? {}) as Partial<RelatorioLeads['secoes']>;
  const agora = nowIso();
  return {
    id: idValido(c.id),
    titulo: texto(c.titulo, 160) || 'Relatório de leads',
    periodo: migratePeriodo(c.periodo),
    secoes: { resumo: secoes.resumo !== false, origens: secoes.origens !== false, horarios: secoes.horarios !== false, lista: secoes.lista !== false },
    comentarios: textoLongo(c.comentarios, 20_000),
    criadoEm: typeof c.criadoEm === 'string' ? c.criadoEm : agora,
    // Arquivos de antes só guardavam ao exportar: o exportadoEm serve de data de atualização.
    atualizadoEm: typeof c.atualizadoEm === 'string' ? c.atualizadoEm : typeof c.exportadoEm === 'string' ? c.exportadoEm : agora,
    ...(typeof c.exportadoEm === 'string' ? { exportadoEm: c.exportadoEm } : {}),
  };
}

// ---------- Pessoas ----------

export function migratePessoa(raw: unknown, etapas: Set<string>, etapaPadrao: string, regras: RegrasPontuacao = regrasPadrao()): Pessoa | null {
  const c = (raw ?? {}) as Partial<Pessoa>;
  const nome = texto(c.nome, 160);
  if (!nome) return null;
  const nascimento = dataIso(c.nascimento);
  const entrada = c.entrada ? migrateEntrada(c.entrada, regras) : undefined;
  return {
    ...migrateBase(c, etapas, etapaPadrao),
    nome,
    apelido: texto(c.apelido, 80),
    cpf: formatarDocumento(texto(c.cpf, 24)),
    rg: texto(c.rg, 30),
    ...(nascimento ? { nascimento } : {}),
    ...(typeof c.empresaId === 'string' && c.empresaId ? { empresaId: c.empresaId } : {}),
    cargo: texto(c.cargo, 80),
    ...(entrada ? { entrada } : {}),
  };
}

export function migrateEmpresa(raw: unknown, etapas: Set<string>, etapaPadrao: string): EmpresaCrm | null {
  const c = (raw ?? {}) as Partial<EmpresaCrm>;
  const razaoSocial = texto(c.razaoSocial, 200);
  const nomeFantasia = texto(c.nomeFantasia, 160);
  // Sem razão social, o nome fantasia faz as vezes: ninguém fica sem nome.
  if (!razaoSocial && !nomeFantasia) return null;
  return {
    ...migrateBase(c, etapas, etapaPadrao),
    razaoSocial: razaoSocial || nomeFantasia,
    nomeFantasia,
    cnpj: formatarDocumento(texto(c.cnpj, 24)),
    inscricaoEstadual: texto(c.inscricaoEstadual, 30),
    segmento: texto(c.segmento, 80),
  };
}

// ---------- Histórico ----------

const TIPOS_INTERACAO_VALIDOS = new Set<string>([...TIPOS_INTERACAO.map((t) => t.id), 'evento', 'formulario', 'whatsapp-iris']);

export function migrateInteracao(raw: unknown): Interacao | null {
  const c = (raw ?? {}) as Partial<Interacao>;
  const txt = textoLongo(c.texto, 20_000);
  const data = dataHoraLocal(c.data);
  if (!txt || !data || !isRef(c.contato)) return null;
  return {
    id: idValido(c.id),
    contato: { tipo: c.contato.tipo, id: c.contato.id },
    tipo: TIPOS_INTERACAO_VALIDOS.has(c.tipo as string) ? (c.tipo as TipoInteracao) : 'nota',
    data,
    texto: txt,
    criadoEm: typeof c.criadoEm === 'string' ? c.criadoEm : nowIso(),
  };
}

// ---------- Contratos ----------

export function migrateModelo(raw: unknown): ModeloContrato | null {
  const c = (raw ?? {}) as Partial<ModeloContrato>;
  const nome = texto(c.nome, 120);
  if (!nome) return null;
  const agora = nowIso();
  return {
    id: idValido(c.id),
    nome,
    // Modelos de antes do campo entram sem ocasião: nada a inventar.
    quandoUsar: texto(c.quandoUsar, 160),
    corpo: textoLongo(c.corpo),
    criadoEm: typeof c.criadoEm === 'string' ? c.criadoEm : agora,
    atualizadoEm: typeof c.atualizadoEm === 'string' ? c.atualizadoEm : agora,
  };
}

function isSituacao(v: unknown): v is SituacaoContrato {
  return SITUACOES_CONTRATO.some((s) => s.id === v);
}

function migrateCampos(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const saida: Record<string, string> = {};
  Object.entries(raw as Record<string, unknown>)
    .slice(0, 60)
    .forEach(([k, v]) => {
      if (/^[a-z0-9_]{1,60}$/.test(k)) saida[k] = texto(v, 500);
    });
  return saida;
}

export function migrateContrato(raw: unknown): Contrato | null {
  const c = (raw ?? {}) as Partial<Contrato>;
  if (!isRef(c.contato)) return null;
  const agora = nowIso();
  const situacao = isSituacao(c.situacao) ? c.situacao : 'rascunho';
  const historico: MudancaSituacao[] = Array.isArray(c.historico)
    ? c.historico
        .map((h) => (h ?? {}) as Partial<MudancaSituacao>)
        .filter((h): h is MudancaSituacao => isSituacao(h.situacao) && typeof h.em === 'string')
        .map((h) => ({ situacao: h.situacao, em: h.em }))
        .slice(-50)
    : [];
  return {
    id: idValido(c.id),
    contato: { tipo: c.contato.tipo, id: c.contato.id },
    contatoNome: texto(c.contatoNome, 200) || 'Contato',
    ...(typeof c.modeloId === 'string' && c.modeloId ? { modeloId: c.modeloId } : {}),
    modeloNome: texto(c.modeloNome, 120),
    titulo: texto(c.titulo, 160) || 'Contrato',
    corpo: textoLongo(c.corpo),
    campos: migrateCampos(c.campos),
    situacao,
    historico: historico.length ? historico : [{ situacao, em: typeof c.criadoEm === 'string' ? c.criadoEm : agora }],
    criadoEm: typeof c.criadoEm === 'string' ? c.criadoEm : agora,
    atualizadoEm: typeof c.atualizadoEm === 'string' ? c.atualizadoEm : agora,
  };
}

// ---------- Arquivo ----------

function createDefaultFile(): ContatosFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    pessoas: [],
    empresas: [],
    interacoes: [],
    etapas: etapasPadrao(),
    modelos: [],
    contratos: [],
    leadsConfig: migrateLeadsConfig({}),
    relatoriosLeads: [],
  };
}

function semDuplicar<T extends { id: string }>(lista: T[]): T[] {
  const vistos = new Set<string>();
  return lista.filter((x) => !vistos.has(x.id) && vistos.add(x.id));
}

export function migrate(raw: unknown): ContatosFile {
  const c = (raw ?? {}) as Partial<ContatosFile>;
  const lidas = Array.isArray(c.etapas) ? semDuplicar(c.etapas.map(migrateEtapa).filter((e): e is EtapaFunil => e !== null)) : [];
  // Funil sem etapa não tem onde pôr ninguém: volta às sementes.
  const etapas = lidas.length ? lidas : etapasPadrao();
  const ids = new Set(etapas.map((e) => e.id));
  const primeira = etapas[0]!.id;

  const empresas = Array.isArray(c.empresas) ? semDuplicar(c.empresas.map((e) => migrateEmpresa(e, ids, primeira)).filter((e): e is EmpresaCrm => e !== null)) : [];
  const idsEmpresas = new Set(empresas.map((e) => e.id));
  // Antes das pessoas: a pontuação de cada lead é refeita com as regras atuais.
  const leadsConfig = migrateLeadsConfig(c.leadsConfig);
  const pessoas = Array.isArray(c.pessoas)
    ? semDuplicar(c.pessoas.map((p) => migratePessoa(p, ids, primeira, leadsConfig.regras)).filter((p): p is Pessoa => p !== null))
    : [];
  // Empresa que sumiu (backup parcial, arquivo mexido) não deixa a pessoa apontando para o nada.
  pessoas.forEach((p) => {
    if (p.empresaId && !idsEmpresas.has(p.empresaId)) delete p.empresaId;
  });

  const existe = (r: RefContato): boolean => (r.tipo === 'pessoa' ? pessoas.some((p) => p.id === r.id) : idsEmpresas.has(r.id));
  const interacoes = Array.isArray(c.interacoes)
    ? semDuplicar(c.interacoes.map(migrateInteracao).filter((i): i is Interacao => i !== null && existe(i.contato)))
    : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : nowIso(),
    pessoas,
    empresas,
    interacoes,
    etapas,
    modelos: Array.isArray(c.modelos) ? semDuplicar(c.modelos.map(migrateModelo).filter((m): m is ModeloContrato => m !== null)) : [],
    // Contrato de contato excluído continua: ele guarda o nome por extenso.
    contratos: Array.isArray(c.contratos) ? semDuplicar(c.contratos.map(migrateContrato).filter((x): x is Contrato => x !== null)) : [],
    leadsConfig,
    relatoriosLeads: Array.isArray(c.relatoriosLeads)
      ? semDuplicar(c.relatoriosLeads.map(migrateRelatorioLeads).filter((r): r is RelatorioLeads => r !== null)).slice(-100)
      : [],
  };
}

export function loadFile(): ContatosFile {
  return readStore(FILE_NAME, createDefaultFile, migrate);
}

export async function saveFile(file: ContatosFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}
