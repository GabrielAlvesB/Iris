import { IMAGEM_STATUS, type Imagem } from '../../../shared/types/imagens.types.js';
import { PRIORIDADES, type CampoExtra, type TipoPostagem } from '../../../shared/types/postagens.types.js';
import {
  AREAS_IMAGEM,
  formatarTempo,
  type MarcacaoImagem,
  type MarcacaoVideo,
  type SnapshotPostagem,
} from '../../../shared/types/relatorios.types.js';
import { VIDEO_STATUS, type Video, type VideosFile } from '../../../shared/types/videos.types.js';
import { descreverOrigem } from '../../../shared/types/videos.conversao.js';
import { abrirPostagem } from '../../core/navegacao.js';
import { descreverFormato } from '../postagens/imagens/imagens.ui.js';
import * as imagensState from '../postagens/imagens/imagens.state.js';
import { ICONES_POSTAGEM, redesDe, rotuloStatus, tagsDe } from '../postagens/postagens.ui.js';
import * as videosState from '../postagens/videos/videos.state.js';

/**
 * O que o módulo Relatórios precisa de cada tipo de postagem: a lista para
 * escolher, a cópia dos dados que vai para o documento e como descrever onde
 * uma marcação aponta. Record por TipoPostagem: um tipo novo não compila até
 * ganhar a sua entrada aqui.
 */

export interface OpcaoPostagem {
  id: string;
  seq: number;
  titulo: string;
  status: string;
  etapa: string;
  dataAgendada?: string;
  arquivada: boolean;
}

export interface AdaptadorRelatorio {
  rotulo: string;
  singular: string;
  /** "vídeo", "imagem" — no meio de frase. */
  nome: string;
  icone: string;
  listar(): OpcaoPostagem[];
  /** Cópia atual dos dados; null se a postagem não existe mais. */
  snapshot(id: string): SnapshotPostagem | null;
  abrir(id: string): void;
}

function agora(): string {
  return new Date().toISOString();
}

function dado(nome: string, valor: string | undefined): CampoExtra[] {
  const limpo = valor?.trim();
  return limpo ? [{ nome, valor: limpo }] : [];
}

function rotuloPrioridade(id: string | undefined): string | undefined {
  return id ? PRIORIDADES.find((p) => p.id === id)?.rotulo : undefined;
}

/** O que é comum a qualquer tipo: título, etapa, agenda, redes, tags, prioridade, score. */
function snapshotBase(
  catalogo: VideosFile,
  item: Video | Imagem,
  etapas: ReadonlyArray<{ id: string; rotulo: string }>,
  dados: CampoExtra[],
): SnapshotPostagem {
  const links = item.publicacoes
    .filter((p) => p.url)
    .map((p) => ({ nome: `Link · ${catalogo.redes.find((r) => r.id === p.redeId)?.nome ?? 'rede'}`, valor: p.url! }));
  return {
    titulo: item.titulo,
    seq: item.seq,
    etapa: rotuloStatus(item.status, etapas),
    dataAgendada: item.dataAgendada,
    horaAgendada: item.horaAgendada,
    redes: redesDe(catalogo, item).map((r) => r.nome),
    tags: tagsDe(catalogo, item).map((t) => t.nome),
    prioridade: rotuloPrioridade(item.prioridade),
    score: item.score,
    dados: [...dados, ...links, ...item.camposExtras.filter((c) => c.valor.trim())],
    capturadoEm: agora(),
  };
}

export const ADAPTADORES: Record<TipoPostagem, AdaptadorRelatorio> = {
  video: {
    rotulo: 'Vídeos',
    singular: 'Vídeo',
    nome: 'vídeo',
    icone: ICONES_POSTAGEM.video,
    listar: () =>
      (videosState.getCurrentState()?.videos ?? []).map((v) => ({
        id: v.id,
        seq: v.seq,
        titulo: v.titulo,
        status: v.status,
        etapa: rotuloStatus(v.status, VIDEO_STATUS),
        dataAgendada: v.dataAgendada,
        arquivada: v.status === 'arquivado',
      })),
    snapshot: (id) => {
      const file = videosState.getCurrentState();
      const v = file?.videos.find((x) => x.id === id);
      if (!file || !v) return null;
      return snapshotBase(file, v, VIDEO_STATUS, [
        ...dado('Descrição', v.descricao),
        ...dado('Hashtags', v.hashtags.map((h) => `#${h}`).join(' ')),
        ...dado('Origem', v.origem ? descreverOrigem(v.origem) : undefined),
      ]);
    },
    abrir: (id) => abrirPostagem({ tipo: 'video', id, arquivados: true }),
  },
  imagem: {
    rotulo: 'Imagens',
    singular: 'Imagem',
    nome: 'imagem',
    icone: ICONES_POSTAGEM.imagem,
    listar: () =>
      (imagensState.getCurrentState()?.imagens ?? []).map((i) => ({
        id: i.id,
        seq: i.seq,
        titulo: i.titulo,
        status: i.status,
        etapa: rotuloStatus(i.status, IMAGEM_STATUS),
        dataAgendada: i.dataAgendada,
        arquivada: i.status === 'arquivado',
      })),
    snapshot: (id) => {
      const catalogo = videosState.getCurrentState();
      const i = imagensState.getCurrentState()?.imagens.find((x) => x.id === id);
      if (!catalogo || !i) return null;
      return snapshotBase(catalogo, i, IMAGEM_STATUS, [
        ...dado('Formato', descreverFormato(i)),
        ...dado('Briefing', i.briefing),
        ...dado('Texto na arte', i.textoNaArte),
        ...dado('Legenda', i.legenda),
        ...dado('CTA', i.cta),
        ...dado('Link de destino', i.link),
        ...dado('Texto alternativo', i.textoAlternativo),
        ...dado('Créditos', i.creditos),
      ]);
    },
    abrir: (id) => abrirPostagem({ tipo: 'imagem', id, arquivados: true }),
  },
};

/** Garante os states de postagens carregados (vídeos primeiro: o catálogo mora lá). */
export async function carregarPostagens(): Promise<void> {
  if (!videosState.getCurrentState()) await videosState.load();
  if (!imagensState.getCurrentState()) await imagensState.load();
}

export function localMarcacaoVideo(m: Pick<MarcacaoVideo, 'tempo' | 'tempoFim'>): string {
  return m.tempoFim !== undefined ? `${formatarTempo(m.tempo)}–${formatarTempo(m.tempoFim)}` : formatarTempo(m.tempo);
}

export function localMarcacaoImagem(m: Pick<MarcacaoImagem, 'slide' | 'area'>): string {
  const area = AREAS_IMAGEM.find((a) => a.id === m.area)?.rotulo ?? m.area;
  return m.slide ? `Peça ${m.slide} · ${area}` : area;
}
