import { hojeLocal } from '../../../shared/types/brasil.js';
import {
  nomeDoContato,
  refDe,
  refIgual,
  type ContatosFile,
  type EmpresaCrm,
  type EtapaFunil,
  type Interacao,
  type Pessoa,
  type RefContato,
  type SituacaoContrato,
  SITUACOES_CONTRATO,
} from '../../../shared/types/contatos.types.js';
import { FAIXAS_LEAD, type FaixaLead } from '../../../shared/types/leads.types.js';
import { buildSelo, svg, type Tom } from '../../ui/pagina.js';

/**
 * Peças visuais e leituras do CRM usadas por mais de uma tela (lista, ficha,
 * funil, contratos). Nada aqui grava: só desenha e calcula.
 */

export const ICONES_CONTATO = {
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  empresa: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01"/><path d="M15 9h.01"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M10 21v-4h4v4"/>',
  funil: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
  contrato: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15c1.5-1.5 2.5-1.5 3 0s1.5 1.5 3 0"/>',
  modelo: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/>',
  email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  telefone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  whatsapp: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 10c.5 2 2.5 4 5 5l1.5-1.5 2 1-1 2c-3.5 0-8.5-5-8.5-8.5l2-1 1 2z"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>',
  voltar: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  mais: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  lixeira: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  arquivo: '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  mais3: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  editar: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  etapas: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h6"/>',
  // Leads por API
  caixa: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  painel: '<path d="M3 3v18h18"/><path d="M7 16v-4"/><path d="M12 16V8"/><path d="M17 16v-7"/>',
  relatorio: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 18v-3"/><path d="M12 18v-6"/><path d="M16 18v-4"/>',
  api: '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
  nuvem: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>',
  servidor: '<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01"/><path d="M6 17h.01"/>',
  chave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  olho: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  descartar: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alvo: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  sino2: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/><path d="M22 8c0-2.3-.8-4.3-2-6"/>',
  raio: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
} as const;

/** Ícone + texto por faixa: a temperatura nunca é dita só pela cor. */
const ICONE_DA_FAIXA: Record<FaixaLead, string> = {
  quente: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  morno: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
  frio: '<path d="M2 12h20"/><path d="M12 2v20"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/>',
};

export function rotuloDaFaixa(f: FaixaLead): string {
  return FAIXAS_LEAD.find((x) => x.id === f)?.rotulo ?? f;
}

/** "Quente · 85": a pontuação de um lead. */
export function buildSeloFaixa(faixa: FaixaLead, pontos?: number): HTMLElement {
  const selo = el('span', `ld-faixa-lead is-${faixa}`);
  selo.innerHTML = svg(ICONE_DA_FAIXA[faixa], 12, 2.2);
  selo.appendChild(el('span', undefined, pontos === undefined ? rotuloDaFaixa(faixa) : `${rotuloDaFaixa(faixa)} · ${pontos}`));
  return selo;
}

export const ICONE_DO_TIPO_INTERACAO: Record<string, string> = {
  nota: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  ligacao: ICONES_CONTATO.telefone,
  reuniao: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  email: ICONES_CONTATO.email,
  whatsapp: ICONES_CONTATO.whatsapp,
  evento: '<circle cx="12" cy="12" r="3"/>',
  formulario: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10"/><path d="M7 12h10"/><path d="M7 16h4"/>',
  'whatsapp-iris': ICONES_CONTATO.whatsapp,
};

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// ---------- Avatar ----------

/** Cores do avatar: legíveis com texto escuro por cima, no tema escuro e no PDF. */
const CORES_AVATAR = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#fb923c', '#a3e635'];

/** A mesma pessoa tem sempre a mesma cor: vem do nome, não da ordem na lista. */
export function corDoNome(nome: string): string {
  let h = 0;
  for (const ch of nome.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CORES_AVATAR[h % CORES_AVATAR.length]!;
}

export function iniciais(nome: string): string {
  const partes = nome
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((p) => p && !/^(de|da|do|das|dos|e|ltda|me|eireli|s\.?a\.?)$/i.test(p));
  if (!partes.length) return '?';
  const primeira = partes[0]![0]!;
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0]! : '';
  return (primeira + ultima).toUpperCase();
}

export function buildAvatar(c: Pessoa | EmpresaCrm, tamanho: 'p' | 'm' | 'g' = 'm'): HTMLElement {
  const nome = nomeDoContato(c);
  const a = el('span', `ct-avatar is-${tamanho}${'razaoSocial' in c ? ' is-empresa' : ''}`, iniciais(nome));
  a.style.setProperty('--c', corDoNome(nome));
  a.setAttribute('aria-hidden', 'true');
  return a;
}

// ---------- Etapa ----------

/** Selo de etapa: bolinha da cor + nome (nunca só a cor). */
export function buildSeloEtapa(etapa: EtapaFunil | undefined): HTMLElement {
  const selo = el('span', `ct-etapa is-${etapa?.tipo ?? 'aberta'}`);
  selo.style.setProperty('--c', etapa?.cor ?? '#9498a3');
  selo.append(el('span', 'ct-etapa-ponto'), el('span', undefined, etapa?.nome ?? 'Sem etapa'));
  return selo;
}

export function etapaDe(file: ContatosFile, id: string): EtapaFunil | undefined {
  return file.etapas.find((e) => e.id === id);
}

const TOM_SITUACAO: Record<SituacaoContrato, Tom> = { rascunho: 'neutro', enviado: 'atencao', assinado: 'ok', cancelado: 'erro' };

export function buildSeloSituacao(s: SituacaoContrato): HTMLElement {
  return buildSelo(SITUACOES_CONTRATO.find((x) => x.id === s)?.rotulo ?? s, TOM_SITUACAO[s]);
}

// ---------- Leituras ----------

export interface ItemContato {
  ref: RefContato;
  c: Pessoa | EmpresaCrm;
}

export function todosOsContatos(file: ContatosFile): ItemContato[] {
  return [...file.pessoas, ...file.empresas].map((c) => ({ ref: refDe(c), c }));
}

export function interacoesDe(file: ContatosFile, ref: RefContato): Interacao[] {
  return file.interacoes.filter((i) => refIgual(i.contato, ref)).sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
}

/**
 * Último contato de verdade: os registros automáticos (etapa, contrato) e o
 * envio do formulário não contam — um lead novo não pode parecer já respondido.
 */
export function ultimoContato(file: ContatosFile, ref: RefContato): Interacao | undefined {
  return interacoesDe(file, ref).find((i) => i.tipo !== 'evento' && i.tipo !== 'formulario');
}

export type SituacaoProximo = 'atrasado' | 'hoje' | 'futuro';

export function situacaoDoProximo(data: string, hoje = hojeLocal()): SituacaoProximo {
  return data < hoje ? 'atrasado' : data === hoje ? 'hoje' : 'futuro';
}

/** Quem tem próximo contato hoje ou atrasado, do mais atrasado ao de hoje. Arquivados não entram. */
export function paraContatar(file: ContatosFile): ItemContato[] {
  const hoje = hojeLocal();
  return todosOsContatos(file)
    .filter(({ c }) => !c.arquivado && c.proximoContato && c.proximoContato.data <= hoje)
    .sort((a, b) => a.c.proximoContato!.data.localeCompare(b.c.proximoContato!.data));
}

function diasEntre(deIso: string, ateIso: string): number {
  const [a1, m1, d1] = deIso.slice(0, 10).split('-').map(Number);
  const [a2, m2, d2] = ateIso.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(a2!, m2! - 1, d2!) - Date.UTC(a1!, m1! - 1, d1!)) / 86_400_000);
}

/** "hoje", "ontem", "há 3 dias", "amanhã", "em 5 dias", "12/03/2025" — para datas locais "AAAA-MM-DD…". */
export function quandoFoi(data: string, hoje = hojeLocal()): string {
  const d = diasEntre(hoje, data);
  if (d === 0) return 'hoje';
  if (d === -1) return 'ontem';
  if (d === 1) return 'amanhã';
  if (d < 0 && d > -45) return `há ${-d} dias`;
  if (d > 0 && d < 45) return `em ${d} dias`;
  const [a, m, dia] = data.slice(0, 10).split('-');
  return `${dia}/${m}/${a}`;
}

/** "14:30" de "AAAA-MM-DDTHH:mm". */
export function horaDe(data: string): string {
  return data.slice(11, 16);
}

/** "AAAA-MM-DDTHH:mm" de agora, no relógio local. */
export function agoraLocal(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${hojeLocal(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "hoje 14:32", "ontem 09:10", "há 3 dias · 10:05" — o horário em que um lead chegou. */
export function quandoChegou(local: string): string {
  const dia = quandoFoi(local.slice(0, 10));
  return `${dia}${dia === 'hoje' || dia === 'ontem' ? ' ' : ' · '}${horaDe(local)}`;
}

export function buildIcone(path: string, classe: string, tamanho = 16): HTMLElement {
  const s = el('span', classe);
  s.innerHTML = svg(path, tamanho);
  return s;
}

/** Linha "Cargo · Empresa" de uma pessoa, ou "Segmento · CNPJ" de uma empresa. */
export function subtituloDo(file: ContatosFile, c: Pessoa | EmpresaCrm): string {
  if ('razaoSocial' in c) return [c.segmento, c.nomeFantasia && c.razaoSocial !== c.nomeFantasia ? c.razaoSocial : ''].filter(Boolean).join(' · ');
  const empresa = c.empresaId ? file.empresas.find((e) => e.id === c.empresaId) : undefined;
  return [c.cargo, empresa ? nomeDoContato(empresa) : ''].filter(Boolean).join(' · ');
}

/** Busca sem acento e sem diferenciar maiúsculas, em nome, e-mail, telefone, documento e tags. */
export function casaBusca(c: Pessoa | EmpresaCrm, busca: string): boolean {
  const n = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = n(busca.trim());
  if (!q) return true;
  const digitos = q.replace(/\D/g, '');
  const campos = [
    nomeDoContato(c),
    'razaoSocial' in c ? c.razaoSocial : c.apelido,
    ...c.emails,
    ...c.tags,
    'razaoSocial' in c ? c.segmento : c.cargo,
  ];
  if (campos.some((t) => n(t).includes(q))) return true;
  if (digitos.length >= 3) {
    const docs = ['razaoSocial' in c ? c.cnpj : c.cpf, ...c.telefones.map((t) => t.numero)];
    return docs.some((d) => d.replace(/\D/g, '').includes(digitos));
  }
  return false;
}
