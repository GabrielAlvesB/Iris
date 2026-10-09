import type { ContatosFile, EtapaFunil, Pessoa, RefContato, TipoEtapa } from './contatos.types';
import { origemDoLead, type EntradaLead, type FaixaLead, type PeriodoLeads } from './leads.types.js';
import { emailProfissional } from './leads.pontuacao.js';

/**
 * As contas dos leads: o Painel, o Relatório em PDF e as frases de "O que
 * está acontecendo" leem tudo daqui, para os três nunca discordarem.
 *
 * Datas são "AAAA-MM-DD" e "AAAA-MM-DDTHH:mm" locais e a aritmética é feita
 * como se fossem UTC (Date.UTC): só diferenças e dias da semana interessam, e
 * assim o resultado não depende do fuso da máquina.
 */

export interface LeadInfo {
  pessoa: Pessoa;
  ref: RefContato;
  entrada: EntradaLead;
  etapaId: string;
  etapaNome: string;
  etapaTipo: TipoEtapa;
  /** Primeira conversa registrada à mão depois da chegada (os registros automáticos não contam). */
  primeiroContatoEm?: string;
  minutosAtePrimeiro?: number;
  convertido: boolean;
  perdido: boolean;
}

// ---------- Datas ----------

/** Minutos desde 1970 de um "AAAA-MM-DD[THH:mm]" local, tratado como relógio de parede. */
export function minutosDe(local: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(local);
  if (!m) return 0;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)) / 60_000;
}

/** 0 = domingo. */
export function diaDaSemana(local: string): number {
  return new Date(minutosDe(local.slice(0, 10)) * 60_000).getUTCDay();
}

export function horaDoDia(local: string): number {
  return Number(local.slice(11, 13)) || 0;
}

export function somarDiasIso(iso: string, dias: number): string {
  const d = new Date(minutosDe(iso.slice(0, 10)) * 60_000 + dias * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function diasEntreIso(de: string, ate: string): number {
  return Math.round((minutosDe(ate.slice(0, 10)) - minutosDe(de.slice(0, 10))) / 1440);
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export const NOMES_DIA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;
const NOMES_DIA_LONGO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'] as const;
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] as const;

/** "35 min", "5 h", "2 d 4 h". */
export function formatarDuracao(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const resto = m % 60;
    return resto && h < 10 ? `${h} h ${resto} min` : `${Math.round(m / 60)} h`;
  }
  const d = Math.floor(m / 1440);
  const h = Math.round((m % 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}

function dataCurta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

// ---------- Período ----------

export interface Intervalo {
  /** AAAA-MM-DD, os dois inclusivos. */
  de: string;
  ate: string;
  rotulo: string;
}

export function intervaloDe(p: PeriodoLeads, hoje: string): Intervalo {
  if (p.tipo === 'mes') {
    const [a, m] = hoje.split('-').map(Number);
    return { de: `${hoje.slice(0, 7)}-01`, ate: hoje, rotulo: `${NOMES_MES[m! - 1]} de ${a}` };
  }
  if (p.tipo === 'personalizado' && /^\d{4}-\d{2}-\d{2}$/.test(p.de) && /^\d{4}-\d{2}-\d{2}$/.test(p.ate)) {
    const [de, ate] = p.de <= p.ate ? [p.de, p.ate] : [p.ate, p.de];
    return { de, ate, rotulo: `${dataCurta(de)} a ${dataCurta(ate)}` };
  }
  const dias = p.tipo === '7' ? 7 : p.tipo === '90' ? 90 : 30;
  return { de: somarDiasIso(hoje, -(dias - 1)), ate: hoje, rotulo: `Últimos ${dias} dias` };
}

/**
 * O período de comparação. No "mês", os mesmos dias do mês anterior (1 a 8
 * de setembro contra 1 a 8 de outubro); nos outros, o mesmo tamanho logo antes.
 */
export function intervaloAnterior(p: PeriodoLeads, atual: Intervalo): Intervalo {
  if (p.tipo === 'mes') {
    const [a, m] = atual.de.split('-').map(Number);
    const anoAnt = m === 1 ? a! - 1 : a!;
    const mesAnt = m === 1 ? 12 : m! - 1;
    const dias = Math.min(diasEntreIso(atual.de, atual.ate) + 1, diasNoMes(anoAnt, mesAnt));
    const de = `${anoAnt}-${String(mesAnt).padStart(2, '0')}-01`;
    return { de, ate: somarDiasIso(de, dias - 1), rotulo: `${NOMES_MES[mesAnt - 1]} de ${anoAnt}` };
  }
  const dias = diasEntreIso(atual.de, atual.ate) + 1;
  const ate = somarDiasIso(atual.de, -1);
  const de = somarDiasIso(ate, -(dias - 1));
  return { de, ate, rotulo: `${dataCurta(de)} a ${dataCurta(ate)}` };
}

export function dentro(local: string, i: Pick<Intervalo, 'de' | 'ate'>): boolean {
  const dia = local.slice(0, 10);
  return dia >= i.de && dia <= i.ate;
}

// ---------- Leads do arquivo ----------

const AUTOMATICOS = new Set(['evento', 'formulario']);

export function leadsDoArquivo(file: Pick<ContatosFile, 'pessoas' | 'interacoes' | 'etapas'>): LeadInfo[] {
  const etapas = new Map(file.etapas.map((e) => [e.id, e]));
  const conversas = new Map<string, string[]>();
  file.interacoes.forEach((i) => {
    if (i.contato.tipo !== 'pessoa' || AUTOMATICOS.has(i.tipo)) return;
    const lista = conversas.get(i.contato.id) ?? [];
    lista.push(i.data);
    conversas.set(i.contato.id, lista);
  });
  return file.pessoas
    .filter((p): p is Pessoa & { entrada: EntradaLead } => Boolean(p.entrada))
    .map((p) => {
      const etapa: EtapaFunil | undefined = etapas.get(p.etapaId);
      const primeiro = (conversas.get(p.id) ?? []).filter((d) => d >= p.entrada.recebidoEm).sort()[0];
      return {
        pessoa: p,
        ref: { tipo: 'pessoa' as const, id: p.id },
        entrada: p.entrada,
        etapaId: p.etapaId,
        etapaNome: etapa?.nome ?? 'Sem etapa',
        etapaTipo: etapa?.tipo ?? 'aberta',
        ...(primeiro ? { primeiroContatoEm: primeiro, minutosAtePrimeiro: Math.max(0, minutosDe(primeiro) - minutosDe(p.entrada.recebidoEm)) } : {}),
        convertido: etapa?.tipo === 'ganha',
        perdido: etapa?.tipo === 'perdida',
      };
    })
    .sort((a, b) => b.entrada.recebidoEm.localeCompare(a.entrada.recebidoEm));
}

export function noIntervalo(leads: LeadInfo[], i: Pick<Intervalo, 'de' | 'ate'>): LeadInfo[] {
  return leads.filter((l) => dentro(l.entrada.recebidoEm, i));
}

/** Sem resposta: chegou há mais de 24 h, ninguém registrou conversa e o funil ainda está aberto. */
export function semResposta(leads: LeadInfo[], agoraLocal: string, horas = 24): LeadInfo[] {
  const agora = minutosDe(agoraLocal);
  return leads.filter((l) => l.etapaTipo === 'aberta' && !l.primeiroContatoEm && agora - minutosDe(l.entrada.recebidoEm) > horas * 60);
}

// ---------- Resumo ----------

export interface ResumoLeads {
  total: number;
  anterior: number;
  /** Em %, contra o período anterior; undefined quando o anterior foi zero. */
  variacao?: number;
  quentes: number;
  mornos: number;
  frios: number;
  pctQuentes?: number;
  convertidos: number;
  perdidos: number;
  conversao?: number;
  respondidos: number;
  tempoMedioMin?: number;
}

export function pct(parte: number, total: number): number | undefined {
  return total > 0 ? (parte / total) * 100 : undefined;
}

export function resumir(atual: LeadInfo[], anterior: LeadInfo[]): ResumoLeads {
  const conta = (f: FaixaLead): number => atual.filter((l) => l.entrada.faixa === f).length;
  const respondidos = atual.filter((l) => l.minutosAtePrimeiro !== undefined);
  const convertidos = atual.filter((l) => l.convertido).length;
  return {
    total: atual.length,
    anterior: anterior.length,
    ...(anterior.length ? { variacao: ((atual.length - anterior.length) / anterior.length) * 100 } : {}),
    quentes: conta('quente'),
    mornos: conta('morno'),
    frios: conta('frio'),
    ...(atual.length ? { pctQuentes: pct(conta('quente'), atual.length) } : {}),
    convertidos,
    perdidos: atual.filter((l) => l.perdido).length,
    ...(atual.length ? { conversao: pct(convertidos, atual.length) } : {}),
    respondidos: respondidos.length,
    ...(respondidos.length ? { tempoMedioMin: respondidos.reduce((s, l) => s + l.minutosAtePrimeiro!, 0) / respondidos.length } : {}),
  };
}

// ---------- Distribuições ----------

export interface DiaLeads {
  dia: string;
  quente: number;
  morno: number;
  frio: number;
}

export function porDia(leads: LeadInfo[], i: Intervalo): DiaLeads[] {
  const dias: DiaLeads[] = [];
  const total = diasEntreIso(i.de, i.ate) + 1;
  for (let n = 0; n < total; n += 1) dias.push({ dia: somarDiasIso(i.de, n), quente: 0, morno: 0, frio: 0 });
  const indice = new Map(dias.map((d, n) => [d.dia, n]));
  leads.forEach((l) => {
    const n = indice.get(l.entrada.recebidoEm.slice(0, 10));
    if (n !== undefined) dias[n]![l.entrada.faixa] += 1;
  });
  return dias;
}

export function porHora(leads: LeadInfo[]): number[] {
  const horas = new Array<number>(24).fill(0);
  leads.forEach((l) => (horas[horaDoDia(l.entrada.recebidoEm)]! += 1));
  return horas;
}

/** Índice 0 = domingo, como getDay(). */
export function porDiaDaSemana(leads: LeadInfo[]): number[] {
  const dias = new Array<number>(7).fill(0);
  leads.forEach((l) => (dias[diaDaSemana(l.entrada.recebidoEm)]! += 1));
  return dias;
}

export interface OrigemLeads {
  origem: string;
  total: number;
  quentes: number;
  convertidos: number;
  conversao?: number;
}

export function porOrigem(leads: LeadInfo[]): OrigemLeads[] {
  const mapa = new Map<string, OrigemLeads>();
  leads.forEach((l) => {
    const nome = origemDoLead(l.entrada);
    const o = mapa.get(nome) ?? { origem: nome, total: 0, quentes: 0, convertidos: 0 };
    o.total += 1;
    if (l.entrada.faixa === 'quente') o.quentes += 1;
    if (l.convertido) o.convertidos += 1;
    mapa.set(nome, o);
  });
  return [...mapa.values()]
    .map((o) => ({ ...o, conversao: pct(o.convertidos, o.total) }))
    .sort((a, b) => b.total - a.total || b.convertidos - a.convertidos || a.origem.localeCompare(b.origem, 'pt-BR'));
}

export interface EtapaLeads {
  etapa: EtapaFunil;
  total: number;
}

export function porEtapa(leads: LeadInfo[], etapas: EtapaFunil[]): EtapaLeads[] {
  return etapas.map((etapa) => ({ etapa, total: leads.filter((l) => l.etapaId === etapa.id).length }));
}

/** As duas horas seguidas com mais chegadas (ex.: 10h–12h). */
export function melhorJanela(horas: number[]): { de: number; ate: number; total: number } {
  let melhor = { de: 0, ate: 2, total: -1 };
  for (let h = 0; h < 24; h += 1) {
    const total = horas[h]! + (horas[h + 1] ?? 0);
    if (total > melhor.total) melhor = { de: h, ate: Math.min(24, h + 2), total };
  }
  return melhor;
}

// ---------- "O que está acontecendo" ----------

export interface FraseLeads {
  texto: string;
  tom: 'atencao' | 'ok' | 'neutro';
  /** Leads citados na frase, para a tela virar link. */
  refs?: RefContato[];
}

function num(n: number, casas = 0): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function plural(n: number, um: string, varios: string): string {
  return `${num(n)} ${n === 1 ? um : varios}`;
}

/**
 * Frases feitas só de fatos calculados: contagem, porcentagem, comparação.
 * Nenhuma opinião ("está ótimo", "invista mais") — a leitura é de quem olha.
 * Amostras pequenas não viram frase: 1 de 2 não é tendência.
 */
export function frasesDosLeads(todos: LeadInfo[], atual: LeadInfo[], anterior: LeadInfo[], agoraLocal: string): FraseLeads[] {
  const frases: FraseLeads[] = [];

  const parados = semResposta(todos, agoraLocal);
  const quentesParados = parados.filter((l) => l.entrada.faixa === 'quente');
  if (quentesParados.length) {
    frases.push({
      texto: `${plural(quentesParados.length, 'lead quente está', 'leads quentes estão')} sem resposta há mais de 24 h.`,
      tom: 'atencao',
      refs: quentesParados.map((l) => l.ref),
    });
  }
  const outrosParados = parados.filter((l) => l.entrada.faixa !== 'quente');
  if (outrosParados.length) {
    frases.push({
      texto: `${plural(outrosParados.length, quentesParados.length ? 'outro lead está' : 'lead está', quentesParados.length ? 'outros leads estão' : 'leads estão')} sem resposta há mais de 24 h.`,
      tom: 'atencao',
      refs: outrosParados.map((l) => l.ref),
    });
  }

  if (atual.length || anterior.length) {
    if (anterior.length) {
      const v = ((atual.length - anterior.length) / anterior.length) * 100;
      const comparacao = v === 0 ? 'o mesmo número' : `${num(Math.abs(v))}% ${v > 0 ? 'a mais' : 'a menos'}`;
      frases.push({ texto: `Chegaram ${plural(atual.length, 'lead', 'leads')} no período — ${comparacao} que no período anterior (${num(anterior.length)}).`, tom: 'neutro' });
    } else {
      frases.push({ texto: `Chegaram ${plural(atual.length, 'lead', 'leads')} no período; no período anterior, nenhum.`, tom: 'neutro' });
    }
  }

  if (atual.length >= 5) {
    const dias = porDiaDaSemana(atual);
    const maior = dias.reduce((m, n, i) => (n > dias[m]! ? i : m), 0);
    const janela = melhorJanela(porHora(atual));
    frases.push({
      texto: `${NOMES_DIA_LONGO[maior]!.replace(/^./, (c) => c.toUpperCase())} é o dia com mais chegadas (${num(dias[maior]!)} de ${num(atual.length)}); o horário com mais leads é entre ${janela.de}h e ${janela.ate}h (${num(janela.total)} de ${num(atual.length)}).`,
      tom: 'neutro',
    });
  }

  const origens = porOrigem(atual).filter((o) => o.total >= 2);
  const comConversao = origens.filter((o) => o.convertidos > 0).sort((a, b) => (b.conversao ?? 0) - (a.conversao ?? 0) || b.total - a.total);
  const melhor = comConversao[0];
  if (melhor) {
    const unica = origens.length === 1;
    frases.push({
      // "Entre as de 2 ou mais": uma origem com 1 lead convertido teria 100% e não diz nada.
      texto: `${melhor.origem}: ${plural(melhor.total, 'lead', 'leads')}, ${plural(melhor.convertidos, 'virou cliente', 'viraram clientes')} (${num(melhor.conversao ?? 0)}%)${unica ? '.' : ' — a maior conversão entre as origens com 2 leads ou mais.'}`,
      tom: 'ok',
    });
  }

  const profissionais = atual.filter((l) => emailProfissional(l.entrada.enviado.email));
  const pessoais = atual.filter((l) => !emailProfissional(l.entrada.enviado.email));
  if (profissionais.length >= 3 && pessoais.length >= 3) {
    const a = profissionais.filter((l) => l.convertido).length;
    const b = pessoais.filter((l) => l.convertido).length;
    if (a + b > 0) {
      frases.push({
        texto: `Leads com e-mail profissional converteram ${num(pct(a, profissionais.length)!)}% (${num(a)} de ${num(profissionais.length)}); os demais, ${num(pct(b, pessoais.length)!)}% (${num(b)} de ${num(pessoais.length)}).`,
        tom: 'neutro',
      });
    }
  }

  const quentes = atual.filter((l) => l.entrada.faixa === 'quente');
  const frios = atual.filter((l) => l.entrada.faixa === 'frio');
  if (quentes.length >= 3 && frios.length >= 3) {
    const a = quentes.filter((l) => l.convertido).length;
    const b = frios.filter((l) => l.convertido).length;
    if (a + b > 0) {
      frases.push({
        texto: `Quentes converteram ${num(pct(a, quentes.length)!)}% (${num(a)} de ${num(quentes.length)}); frios, ${num(pct(b, frios.length)!)}% (${num(b)} de ${num(frios.length)}).`,
        tom: 'neutro',
      });
    }
  }

  const respondidos = atual.filter((l) => l.minutosAtePrimeiro !== undefined);
  if (respondidos.length >= 2) {
    const media = respondidos.reduce((s, l) => s + l.minutosAtePrimeiro!, 0) / respondidos.length;
    frases.push({ texto: `Em média, o primeiro contato saiu ${formatarDuracao(media)} depois da chegada (${plural(respondidos.length, 'lead respondido', 'leads respondidos')}).`, tom: 'neutro' });
  }

  return frases;
}
