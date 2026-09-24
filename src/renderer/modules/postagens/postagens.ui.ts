import {
  PRIORIDADES,
  type Prioridade,
  type RedeSocial,
  type TagPostagem,
} from '../../../shared/types/postagens.types.js';
import { VIDEO_STATUS } from '../../../shared/types/videos.types.js';
import { buildSelo, svg, type Tom } from '../../ui/pagina.js';
import { buildLogoRede } from './postagens.logos.js';
import { faixaDoScore, hashtagsDoTexto } from '../../../shared/types/videos.conversao.js';
import type { Catalogo, Postagem } from './postagens.fonte.js';

/**
 * Peças visuais das postagens (de qualquer tipo) reusadas pela pipeline,
 * agenda, calendário, painéis, relatórios e pelo envio do Sheets.
 */

export const ICONES_POSTAGEM = {
  video: '<rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3"/>',
  imagem: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  postagens: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  planilha: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 3v18"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tag: '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/>',
  hashtag: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>',
  clipe: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  arquivo: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  mais: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  historico: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  lixeira: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  bandeira: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  paleta: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1.1 0-.8.7-1.5 1.5-1.5H16a6 6 0 0 0 6-6c0-4.9-4.5-8.8-10-8.8z"/>',
  exibicao: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  relatorio: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
} as const;

/** Nome antigo, de quando só havia vídeos. */
export const ICONES_VIDEO = ICONES_POSTAGEM;

/** Rótulo de uma etapa. Sem a lista do tipo, usa a dos vídeos (as etapas comuns têm o mesmo nome). */
export function rotuloStatus(status: string, etapas: ReadonlyArray<{ id: string; rotulo: string }> = VIDEO_STATUS): string {
  return etapas.find((s) => s.id === status)?.rotulo ?? status;
}

/** Data local de hoje em YYYY-MM-DD (toISOString daria o dia UTC). */
export function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const data = new Date(a!, m! - 1, d! + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function formatarDataCurta(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const data = new Date(a!, m! - 1, d!);
  return `${DIAS[data.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

export function formatarDataLonga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a!, m! - 1, d!).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

/** YYYY-MM-DD em dd/mm/aaaa. */
export function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Encerrada = não precisa mais de atenção de agenda. */
export function encerrado(item: Pick<Postagem, 'status'>): boolean {
  return item.status === 'publicado' || item.status === 'arquivado';
}

export function atrasado(item: Pick<Postagem, 'status' | 'dataAgendada'>, hoje = hojeIso()): boolean {
  return !encerrado(item) && Boolean(item.dataAgendada) && item.dataAgendada! < hoje;
}

/** Situação de agenda que merece selo no card, ou null se está tudo em ordem. */
export function alertaDeAgenda(item: Pick<Postagem, 'status' | 'dataAgendada' | 'redeIds'>): { texto: string; tom: Tom } | null {
  if (atrasado(item)) return { texto: 'atrasado', tom: 'erro' };
  if (item.status === 'agendado' && !item.dataAgendada) return { texto: 'sem data', tom: 'atencao' };
  if (item.status === 'agendado' && item.redeIds.length === 0) return { texto: 'sem rede', tom: 'atencao' };
  return null;
}

export function buildTagChip(tag: TagPostagem, opcoes: { ativo?: boolean; compacto?: boolean } = {}): HTMLElement {
  const chip = document.createElement('span');
  chip.className = `vd-tag${opcoes.compacto ? ' is-compacto' : ''}${opcoes.ativo === false ? ' is-inativo' : ''}`;
  chip.style.setProperty('--cor', tag.cor);
  chip.textContent = tag.nome;
  return chip;
}

/**
 * Badge de rede: o logo (ou a sigla, para rede sem logo conhecido), com o nome
 * ao lado quando há espaço. Sem nome, o nome fica no title e no aria-label.
 */
export function buildRedeBadge(rede: RedeSocial, opcoes: { comNome?: boolean; ativo?: boolean } = {}): HTMLElement {
  const badge = document.createElement('span');
  badge.className = `vd-rede${opcoes.comNome ? ' is-com-nome' : ''}${opcoes.ativo === false ? ' is-inativo' : ''}`;
  badge.style.setProperty('--cor', rede.cor);
  badge.title = rede.nome;
  badge.appendChild(buildLogoRede(rede, opcoes.comNome ? 20 : 18));

  if (opcoes.comNome) {
    const nome = document.createElement('span');
    nome.className = 'vd-rede-nome';
    nome.textContent = rede.nome;
    badge.appendChild(nome);
  }
  return badge;
}

export function tagsDe(catalogo: Pick<Catalogo, 'tags'>, item: Pick<Postagem, 'tagIds'>): TagPostagem[] {
  return item.tagIds.map((id) => catalogo.tags.find((t) => t.id === id)).filter((t): t is TagPostagem => Boolean(t));
}

export function redesDe(catalogo: Pick<Catalogo, 'redes'>, item: Pick<Postagem, 'redeIds'>): RedeSocial[] {
  return item.redeIds.map((id) => catalogo.redes.find((r) => r.id === id)).filter((r): r is RedeSocial => Boolean(r));
}

/** Nomes antigos, de quando só havia vídeos. */
export const tagsDoVideo = tagsDe;
export const redesDoVideo = redesDe;

/** Texto + hashtags, pronto para colar na rede. */
export function legendaCompleta(item: { descricao: string; hashtags: string[] }): string {
  // Hashtag que já está escrita no texto (a legenda de uma imagem, por exemplo)
  // não se repete no fim.
  const escritas = new Set(hashtagsDoTexto(item.descricao));
  const faltando = item.hashtags.filter((h) => !escritas.has(h)).map((h) => `#${h}`).join(' ');
  return [item.descricao.trim(), faltando].filter(Boolean).join('\n\n');
}

export function buildSeloAgenda(item: Pick<Postagem, 'status' | 'dataAgendada' | 'redeIds'>): HTMLElement | null {
  const alerta = alertaDeAgenda(item);
  return alerta ? buildSelo(alerta.texto, alerta.tom) : null;
}

export function rotuloPrioridade(prioridade: Prioridade): string {
  return PRIORIDADES.find((p) => p.id === prioridade)?.rotulo ?? prioridade;
}

/** Selo de prioridade: bandeira + texto, a cor só reforça. */
export function buildPrioridade(prioridade: Prioridade, compacto = false): HTMLElement {
  const selo = document.createElement('span');
  selo.className = `vd-prio is-${prioridade}${compacto ? ' is-compacto' : ''}`;
  selo.title = `Prioridade ${rotuloPrioridade(prioridade).toLowerCase()}`;
  selo.innerHTML = svg(ICONES_POSTAGEM.bandeira, 11, 2.2);
  if (!compacto) selo.append(rotuloPrioridade(prioridade));
  return selo;
}

/** Título que o card mostra, conforme a preferência de exibição. */
export function tituloExibido(catalogo: Pick<Catalogo, 'preferencias'>, item: Pick<Postagem, 'titulo' | 'camposExtras'>): string {
  const escolha = catalogo.preferencias.tituloDoCard;
  if (escolha.tipo === 'extra') {
    const valor = item.camposExtras.find((c) => c.nome === escolha.nome)?.valor.trim();
    if (valor) return valor;
  }
  return item.titulo;
}

/** Selo do score: o número escrito, a faixa no title; a cor da faixa só reforça. */
export function buildScore(score: number, compacto = false): HTMLElement {
  const faixa = faixaDoScore(score);
  const selo = document.createElement('span');
  selo.className = `vd-score is-${faixa.id}${compacto ? ' is-compacto' : ''}`;
  selo.title = `Score ${score.toLocaleString('pt-BR')} · ${faixa.rotulo}`;
  selo.setAttribute('aria-label', selo.title);
  const valor = document.createElement('b');
  valor.textContent = score.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  selo.appendChild(valor);
  if (!compacto) selo.append(faixa.rotulo);
  return selo;
}
