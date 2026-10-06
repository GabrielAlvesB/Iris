import type { TagPostagem } from '../../../shared/types/postagens.types.js';
import type { ContextoTexto } from '../../../shared/types/ia.types.js';
import {
  FORMATOS_ROTEIRO,
  STATUS_ROTEIRO,
  TIPOS_CENA,
  type CenaRoteiro,
  type FormatoRoteiro,
  type Roteiro,
  type StatusRoteiro,
  type TipoCena,
} from '../../../shared/types/roteiros.types.js';
import { formatarTempo, markdownDasCenas, ppmDe, tempoDaCena } from '../../../shared/types/roteiros.conversao.js';
import type { Tom } from '../../ui/pagina.js';
import { ordenarTags } from '../postagens/postagens.ui.js';
import * as videosState from '../postagens/videos/videos.state.js';

/**
 * Peças comuns do Estúdio de roteiro: o contexto que as partes recebem, os
 * ícones, os rótulos e o material que vai para a IA.
 */

export type ModoEscrita = 'cartoes' | 'av' | 'livre';
export type AbaEsquerda = 'estrutura' | 'briefing' | 'pesquisa';
export type AbaDireita = 'previa' | 'ia' | 'revisao' | 'verificacao';

/** O que cada parte do Estúdio recebe para ler e mexer no roteiro aberto. */
export interface CtxEstudio {
  /** O rascunho em edição (mutável). */
  r: Roteiro;
  /** Texto digitado: salva com atraso e atualiza tempos, linha do tempo e prévia, sem redesenhar os campos. */
  digitou(): void;
  /** Estrutura mudou (cena nova, ordem, tipo, IA aplicou): salva e redesenha centro, índice, linha do tempo e prévia. */
  mudouEstrutura(): void;
  /** Leva o centro até a cena e a destaca. */
  irParaCena(cenaId: string): void;
  /** Guarda as cenas atuais como versão antes de a IA trocar conteúdo. */
  versaoAntes(rotulo: string): Promise<void>;
  falhou(erro: unknown): void;
  abrirAba(aba: AbaDireita): void;
  /** Abre outro roteiro no Estúdio (a adaptação recém-criada). */
  abrirRoteiro(roteiroId: string): void;
}

export const ICONES = {
  roteiro: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M13 13h3"/><path d="M13 17h3"/>',
  mais: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  voltar: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
  xis: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  lixeira: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  duplicar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  lista: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="m3 6 1 1 2-2"/><path d="m3 12 1 1 2-2"/><path d="m3 18 1 1 2-2"/>',
  cima: '<path d="m18 15-6-6-6 6"/>',
  baixo: '<path d="m6 9 6 6 6-6"/>',
  alca: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  teleprompter: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M6 9h8"/><path d="M6 12h12"/>',
  versoes: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  exportar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  cartoes: '<rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="18" height="7" rx="1.5"/>',
  av: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/><path d="M3 9h18"/>',
  livre: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/>',
  olho: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  lupa: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  mais3: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  adaptar: '<path d="M4 7h11l-3-3"/><path d="M20 17H9l3 3"/>',
  estrela: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
} as const;

export const TOM_DO_STATUS: Record<StatusRoteiro, Tom> = {
  rascunho: 'neutro',
  revisao: 'atencao',
  aprovado: 'ok',
  reprovado: 'erro',
};

export function rotuloStatus(status: StatusRoteiro): string {
  return STATUS_ROTEIRO.find((s) => s.id === status)?.rotulo ?? status;
}

export function rotuloFormato(formato: FormatoRoteiro): string {
  return FORMATOS_ROTEIRO.find((f) => f.id === formato)?.rotulo ?? formato;
}

export function tipoDe(tipo: TipoCena): (typeof TIPOS_CENA)[number] {
  return TIPOS_CENA.find((t) => t.id === tipo) ?? TIPOS_CENA[2];
}

export function novaCena(tipo: TipoCena, titulo: string = tipoDe(tipo).rotulo): CenaRoteiro {
  return { id: crypto.randomUUID(), tipo, titulo, fala: '', visual: '', textoTela: '', notas: '' };
}

/** Empresas primeiro, depois as tags (catálogo único de Postagens). */
export function catalogoTags(): TagPostagem[] {
  return ordenarTags(videosState.getCurrentState()?.tags ?? []);
}

export function nomesTags(tagIds: string[]): string[] {
  return tagIds.map((id) => catalogoTags().find((t) => t.id === id)?.nome).filter((n): n is string => Boolean(n));
}

export function tempoCena(r: Roteiro, cena: CenaRoteiro): number {
  return tempoDaCena(cena, ppmDe(r));
}

/** "0:42" ou "0:42 / 0:45" (com o alvo da cena). */
export function textoTempoCena(r: Roteiro, cena: CenaRoteiro): string {
  const t = formatarTempo(tempoCena(r, cena));
  return cena.duracaoAlvoSeg ? `${t} / ${formatarTempo(cena.duracaoAlvoSeg)}` : t;
}

/** Textarea que cresce com o conteúdo (até `max` px; depois rola). */
export function autoCrescer(area: HTMLTextAreaElement, max = 900): void {
  const ajustar = (): void => {
    area.style.height = 'auto';
    area.style.height = `${Math.min(max, area.scrollHeight + 2)}px`;
  };
  area.addEventListener('input', ajustar);
  requestAnimationFrame(ajustar);
}

/** Briefing em texto, para o pedido à IA. */
export function briefingEmTexto(r: Roteiro): string {
  const b = r.briefing;
  return [
    b.tema && `Tema: ${b.tema}`,
    b.publico && `Público: ${b.publico}`,
    b.tom && `Tom: ${b.tom}`,
    b.objetivo && `Objetivo: ${b.objetivo}`,
    b.pontosChave && `Pontos-chave:\n${b.pontosChave}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Pesquisa e fontes, para a IA usar como base. */
export function pesquisaEmTexto(r: Roteiro): string {
  const fontes = r.pesquisa.fontes.map((f) => `- ${[f.titulo, f.url, f.nota].filter((x) => x.trim()).join(' — ')}`);
  return [r.pesquisa.notas.trim() && `Notas de pesquisa:\n${r.pesquisa.notas.trim()}`, fontes.length ? `Fontes:\n${fontes.join('\n')}` : '']
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Contexto de todo pedido do Estúdio: ficha, briefing, pesquisa e o roteiro
 * atual em markdown (a IA escreve em cima do que já existe).
 */
export function contextoIa(r: Roteiro, extra: Partial<ContextoTexto> = {}, comRoteiro = true): ContextoTexto {
  const roteiro = comRoteiro && r.cenas.some((c) => c.fala.trim() || c.visual.trim()) ? `Roteiro atual:\n${markdownDasCenas({ titulo: r.titulo, cenas: r.cenas })}` : '';
  return {
    area: 'Estúdio de roteiro',
    titulo: r.titulo,
    formato: rotuloFormato(r.formato),
    duracao: r.briefing.duracaoAlvoSeg ? formatarTempo(r.briefing.duracaoAlvoSeg) : undefined,
    briefing: briefingEmTexto(r),
    observacoes: r.observacoes,
    tags: nomesTags(r.tagIds),
    referencia: [pesquisaEmTexto(r), roteiro].filter(Boolean).join('\n\n'),
    ...extra,
  };
}

// ---------- Leitura tolerante do JSON da IA ----------

export function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function lista(v: unknown, chave: string): unknown[] {
  if (Array.isArray(v)) return v;
  const o = (v ?? {}) as Record<string, unknown>;
  return Array.isArray(o[chave]) ? (o[chave] as unknown[]) : [];
}
