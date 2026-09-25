import { randomUUID } from 'node:crypto';
import {
  isPrioridade,
  type AtualizarPostagemComum,
  type CampoExtra,
  type CatalogoPostagens,
  type EtapaComum,
  type EventoPostagem,
  type PostagemBase,
  type Publicacao,
} from '../../../shared/types/postagens.types';

/**
 * Regras que todo tipo de postagem segue do mesmo jeito: etapas com efeito
 * (publicar carimba, arquivar lembra de onde saiu), ordem contínua por etapa,
 * histórico curto, validação de tags/redes contra o catálogo. Cada service de
 * tipo (vídeos, imagens) só cuida dos próprios campos.
 */

/** Histórico por postagem: o bastante para rastrear o caminho, sem inchar o arquivo. */
export const MAX_EVENTOS = 50;

export const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const HORA_REGEX = /^\d{2}:\d{2}$/;

export function nowIso(): string {
  return new Date().toISOString();
}

export function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

export function listaDeStrings(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
}

export function naoNulo<T>(valor: T | null): valor is T {
  return valor !== null;
}

/** Nome aparado e obrigatório; valor livre. Nomes repetidos ficam (a planilha pode ter). */
export function limparExtras(raw: unknown): CampoExtra[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is CampoExtra => Boolean(c) && typeof c.nome === 'string' && typeof c.valor === 'string')
    .map((c) => ({ nome: c.nome.trim(), valor: c.valor }))
    .filter((c) => c.nome !== '');
}

export function scoreValido(valor: unknown): number | undefined {
  return typeof valor === 'number' && valor >= 0 && valor <= 100 ? valor : undefined;
}

type StatusDef<S extends string> = { readonly id: S; readonly rotulo: string };

/**
 * Momento (ms, hora local) em que a postagem está marcada para sair. Sem
 * horário, vale o fim do dia. Ano antes de 2000 é digitação pela metade no
 * campo de data, não uma agenda.
 */
export function momentoDaAgenda(item: { dataAgendada?: string; horaAgendada?: string }): number | null {
  if (!item.dataAgendada || !DATA_REGEX.test(item.dataAgendada)) return null;
  if (Number(item.dataAgendada.slice(0, 4)) < 2000) return null;
  const hora = item.horaAgendada && HORA_REGEX.test(item.horaAgendada) ? item.horaAgendada : '23:59';
  // Sem "Z": o Date lê como hora local, que é como o usuário marcou.
  const momento = new Date(`${item.dataAgendada}T${hora}:00`).getTime();
  return Number.isNaN(momento) ? null : momento;
}

/**
 * Lê os campos comuns de uma postagem crua, descartando o que não vale: data
 * fora do formato, tag ou rede apagada (um id fantasma), publicação de rede
 * que a postagem não usa mais. Devolve null se não houver título.
 */
export function migrarBase<S extends string>(
  raw: unknown,
  catalogo: { tagIds: Set<string>; redeIds: Set<string> },
  isStatus: (v: unknown) => v is S,
  statusPadrao: S,
): PostagemBase<S> | null {
  const c = (raw ?? {}) as Partial<PostagemBase<S>>;
  const titulo = texto(c.titulo).trim();
  if (!titulo) return null;
  const timestamp = texto(c.createdAt) || nowIso();

  const redeIds = listaDeStrings(c.redeIds).filter((id) => catalogo.redeIds.has(id));
  const publicacoes: Publicacao[] = Array.isArray(c.publicacoes)
    ? c.publicacoes
        .filter((p): p is Publicacao => Boolean(p) && typeof p.redeId === 'string' && catalogo.redeIds.has(p.redeId))
        .map((p) => ({ redeId: p.redeId, url: typeof p.url === 'string' && p.url ? p.url : undefined }))
    : [];

  const historico: EventoPostagem[] = Array.isArray(c.historico)
    ? c.historico.filter((e): e is EventoPostagem => Boolean(e) && typeof e.em === 'string' && typeof e.tipo === 'string')
    : [];

  return {
    id: typeof c.id === 'string' ? c.id : randomUUID(),
    seq: typeof c.seq === 'number' && c.seq > 0 ? c.seq : 0,
    titulo,
    dataAgendada: typeof c.dataAgendada === 'string' && DATA_REGEX.test(c.dataAgendada) ? c.dataAgendada : undefined,
    horaAgendada: typeof c.horaAgendada === 'string' && HORA_REGEX.test(c.horaAgendada) ? c.horaAgendada : undefined,
    status: isStatus(c.status) ? c.status : statusPadrao,
    prioridade: isPrioridade(c.prioridade) ? c.prioridade : undefined,
    score: scoreValido(c.score),
    order: typeof c.order === 'number' ? c.order : 0,
    tagIds: listaDeStrings(c.tagIds).filter((id) => catalogo.tagIds.has(id)),
    redeIds,
    publicacoes,
    notas: texto(c.notas),
    camposExtras: limparExtras(c.camposExtras),
    recursoIds: listaDeStrings(c.recursoIds),
    publicadoEm: typeof c.publicadoEm === 'string' ? c.publicadoEm : undefined,
    statusAntesDeArquivar: isStatus(c.statusAntesDeArquivar) ? c.statusAntesDeArquivar : undefined,
    motivoArquivamento:
      c.motivoArquivamento === 'cancelado' || c.motivoArquivamento === 'arquivado' ? c.motivoArquivamento : undefined,
    historico: historico.slice(-MAX_EVENTOS),
    createdAt: timestamp,
    updatedAt: texto(c.updatedAt) || timestamp,
  };
}

/** Garante seq único e crescente mesmo se o arquivo veio editado à mão. Devolve o novo seqAtual. */
export function garantirSeq(itens: Array<{ seq: number; createdAt: string }>, seqAtual: number): number {
  let atual = seqAtual;
  const usados = new Set<number>();
  itens
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((item) => {
      if (item.seq <= 0 || usados.has(item.seq)) item.seq = ++atual;
      usados.add(item.seq);
      atual = Math.max(atual, item.seq);
    });
  return atual;
}

export function conjuntosDoCatalogo(catalogo: CatalogoPostagens): { tagIds: Set<string>; redeIds: Set<string> } {
  return { tagIds: new Set(catalogo.tags.map((t) => t.id)), redeIds: new Set(catalogo.redes.map((r) => r.id)) };
}

/**
 * Operações de etapa de um tipo, amarradas à lista de etapas dele. Todos os
 * tipos têm ideia/pronto/agendado/publicado/arquivado, por isso o S estende
 * EtapaComum: arquivar e restaurar funcionam igual para qualquer um.
 */
export function criarEtapas<S extends string, P extends PostagemBase<S>>(etapas: readonly StatusDef<S>[]) {
  type Status = S | EtapaComum;

  function rotuloStatus(status: string): string {
    return etapas.find((s) => s.id === status)?.rotulo ?? status;
  }

  function registrar(item: P, evento: Omit<EventoPostagem, 'em'>): void {
    item.historico.push({ em: nowIso(), ...evento });
    if (item.historico.length > MAX_EVENTOS) item.historico.splice(0, item.historico.length - MAX_EVENTOS);
  }

  /** `order` contínuo dentro de cada etapa, na ordem atual do array. */
  function renumerar(itens: P[]): void {
    etapas.forEach((status) => {
      itens
        .filter((v) => v.status === status.id)
        .sort((a, b) => a.order - b.order)
        .forEach((v, indice) => {
          v.order = indice;
        });
    });
  }

  /** Aplica os efeitos de entrar numa etapa: carimbo de publicação, fim do arquivamento. */
  function aplicarStatus(item: P, novo: S): void {
    const anterior = item.status;
    if (anterior === novo) return;
    item.status = novo;
    if ((novo as Status) === 'publicado' && !item.publicadoEm) item.publicadoEm = nowIso();
    if ((novo as Status) !== 'publicado' && (anterior as Status) === 'publicado') item.publicadoEm = undefined;
    if ((novo as Status) !== 'arquivado') {
      item.statusAntesDeArquivar = undefined;
      item.motivoArquivamento = undefined;
    }
    registrar(item, { tipo: 'status', de: rotuloStatus(anterior), para: rotuloStatus(novo) });
  }

  /**
   * Onde uma postagem entra ao chegar numa etapa: no fim, menos em "publicado",
   * que é lida como linha do tempo — a mais recente fica no topo. O -1 vira 0
   * no renumerar, empurrando as outras para baixo.
   */
  function ordemAoEntrar(itens: P[], status: S): number {
    return (status as Status) === 'publicado' ? -1 : itens.filter((v) => v.status === status).length;
  }

  /** Muda de etapa pelo painel (vai para o fim da etapa nova; em publicado, para o topo). */
  function trocarStatus(itens: P[], item: P, novo: S): void {
    if (novo === item.status) return;
    if ((novo as Status) === 'arquivado') {
      item.statusAntesDeArquivar = item.status;
      item.motivoArquivamento = item.motivoArquivamento ?? 'arquivado';
    }
    item.order = ordemAoEntrar(itens, novo);
    aplicarStatus(item, novo);
    renumerar(itens);
  }

  /** Arrastar na pipeline: etapa e posição. */
  function mover(itens: P[], item: P, status: S, indice: number): void {
    if ((status as Status) === 'arquivado' && (item.status as Status) !== 'arquivado') {
      item.statusAntesDeArquivar = item.status;
      item.motivoArquivamento = 'arquivado';
    }
    const destino = itens.filter((v) => v.status === status && v.id !== item.id).sort((a, b) => a.order - b.order);
    // Chegando em publicado vai para o topo, onde quer que tenha sido solto;
    // reordenar dentro de publicado continua livre.
    const chegando = (status as Status) === 'publicado' && item.status !== status;
    const i = chegando ? 0 : Math.max(0, Math.min(indice, destino.length));
    destino.splice(i, 0, item);
    aplicarStatus(item, status);
    destino.forEach((v, n) => {
      v.order = n;
    });
    renumerar(itens);
    item.updatedAt = nowIso();
  }

  function arquivar(itens: P[], item: P, motivo: 'cancelado' | 'arquivado'): void {
    if ((item.status as Status) !== 'arquivado') {
      item.statusAntesDeArquivar = item.status;
      item.order = itens.filter((v) => (v.status as Status) === 'arquivado').length;
      aplicarStatus(item, 'arquivado' as S);
    }
    item.motivoArquivamento = motivo;
    registrar(item, { tipo: 'arquivado', detalhe: motivo });
    renumerar(itens);
    item.updatedAt = nowIso();
  }

  /** Devolve à etapa de onde saiu. Retorna false se não estava arquivada. */
  function restaurar(itens: P[], item: P): boolean {
    if ((item.status as Status) !== 'arquivado') return false;
    const destino = item.statusAntesDeArquivar ?? ('ideia' as S);
    item.order = ordemAoEntrar(itens, destino);
    aplicarStatus(item, destino);
    registrar(item, { tipo: 'restaurado', para: rotuloStatus(destino) });
    renumerar(itens);
    item.updatedAt = nowIso();
    return true;
  }

  /**
   * Agendar é marcar data e hora: a postagem vai para "agendado" sozinha, de
   * qualquer etapa anterior. Só vale para um momento no futuro — o campo de
   * data dispara "change" a cada dígito do ano (0002, 0020…), e um passado
   * de passagem não pode mandar a postagem para a fila de publicação. Tirar a
   * data de uma agendada devolve para "pronto".
   */
  function seguirAgenda(itens: P[], item: P): void {
    const status = item.status as Status;
    if (status === 'publicado' || status === 'arquivado') return;
    if (status === 'agendado') {
      if (!item.dataAgendada) trocarStatus(itens, item, 'pronto' as S);
      return;
    }
    const momento = item.horaAgendada ? momentoDaAgenda(item) : null;
    if (momento !== null && momento > Date.now()) trocarStatus(itens, item, 'agendado' as S);
  }

  /**
   * Agendadas cujo momento já chegou vão para "publicado". A data de
   * publicação é a da agenda, não a de agora: com o app fechado no horário,
   * a postagem saiu quando estava marcada, não quando o app abriu.
   * Devolve quantas mudaram.
   */
  function publicarVencidas(itens: P[], agora = Date.now()): number {
    const vencidas = itens
      .map((item) => ({ item, momento: (item.status as Status) === 'agendado' ? momentoDaAgenda(item) : null }))
      .filter((v): v is { item: P; momento: number } => v.momento !== null && v.momento <= agora)
      .sort((a, b) => a.momento - b.momento);
    vencidas.forEach(({ item, momento }) => {
      trocarStatus(itens, item, 'publicado' as S);
      item.publicadoEm = new Date(momento).toISOString();
      const evento = item.historico[item.historico.length - 1];
      if (evento?.tipo === 'status') evento.detalhe = 'automático, no horário agendado';
      item.updatedAt = nowIso();
    });
    return vencidas.length;
  }

  /** Esqueleto de uma postagem nova no fim da etapa. */
  function nova(itens: P[], seq: number, titulo: string, status: S): PostagemBase<S> {
    const timestamp = nowIso();
    return {
      id: randomUUID(),
      seq,
      titulo,
      status,
      order: ordemAoEntrar(itens, status),
      tagIds: [],
      redeIds: [],
      publicacoes: [],
      notas: '',
      camposExtras: [],
      recursoIds: [],
      publicadoEm: (status as Status) === 'publicado' ? timestamp : undefined,
      historico: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  return { rotuloStatus, registrar, renumerar, aplicarStatus, trocarStatus, mover, arquivar, restaurar, seguirAgenda, publicarVencidas, nova };
}

/**
 * Aplica os campos comuns de uma edição. Devolve os nomes dos campos que
 * mudaram, para o histórico. Status fica de fora: cada service chama
 * `trocarStatus` depois, porque mexe na ordem de todos.
 */
export function aplicarEdicaoComum<S extends string>(
  item: PostagemBase<S>,
  input: AtualizarPostagemComum<S>,
  catalogo: CatalogoPostagens,
  registrarEvento: (evento: Omit<EventoPostagem, 'em'>) => void,
): string[] {
  const alterados: string[] = [];

  if (input.titulo !== undefined) {
    const titulo = input.titulo.trim();
    if (!titulo) throw new Error('O título não pode ficar vazio.');
    if (titulo !== item.titulo) alterados.push('título');
    item.titulo = titulo;
  }
  if (input.dataAgendada !== undefined) {
    const data = DATA_REGEX.test(input.dataAgendada) ? input.dataAgendada : undefined;
    if (data !== item.dataAgendada) alterados.push('data');
    item.dataAgendada = data;
  }
  if (input.horaAgendada !== undefined) {
    const hora = HORA_REGEX.test(input.horaAgendada) ? input.horaAgendada : undefined;
    if (hora !== item.horaAgendada) alterados.push('horário');
    item.horaAgendada = hora;
  }
  if (input.tagIds !== undefined) {
    const validos = new Set(catalogo.tags.map((t) => t.id));
    item.tagIds = [...new Set(input.tagIds)].filter((id) => validos.has(id));
  }
  if (input.redeIds !== undefined) {
    const validos = new Set(catalogo.redes.map((r) => r.id));
    item.redeIds = [...new Set(input.redeIds)].filter((id) => validos.has(id));
  }
  if (input.publicacoes !== undefined) {
    item.publicacoes = input.publicacoes
      .filter((p) => item.redeIds.includes(p.redeId))
      .map((p) => ({ redeId: p.redeId, url: p.url?.trim() || undefined }));
  }
  if (input.notas !== undefined) item.notas = input.notas;
  if (input.score !== undefined) {
    const novo = typeof input.score === 'number' && input.score >= 0 && input.score <= 100 ? Math.round(input.score * 10) / 10 : undefined;
    if (novo !== item.score) registrarEvento({ tipo: 'editado', detalhe: `score: ${item.score ?? '—'} → ${novo ?? '—'}` });
    item.score = novo;
  }
  if (input.prioridade !== undefined) {
    const prioridade = isPrioridade(input.prioridade) ? input.prioridade : undefined;
    if (prioridade !== item.prioridade) alterados.push('prioridade');
    item.prioridade = prioridade;
  }
  if (input.camposExtras !== undefined) {
    const extras = limparExtras(input.camposExtras);
    if (JSON.stringify(extras) !== JSON.stringify(item.camposExtras)) alterados.push('campos extras');
    item.camposExtras = extras;
  }
  if (input.recursoIds !== undefined) item.recursoIds = [...new Set(input.recursoIds)];
  return alterados;
}

/**
 * Edição de texto é salva a cada pausa na digitação; um evento por campo
 * alterado, agrupado com o anterior se recente, mantém o histórico legível.
 */
export function registrarEdicao(
  historico: EventoPostagem[],
  alterados: string[],
  registrarEvento: (evento: Omit<EventoPostagem, 'em'>) => void,
): void {
  if (alterados.length === 0) return;
  const ultimo = historico[historico.length - 1];
  const recente = ultimo && ultimo.tipo === 'editado' && Date.now() - Date.parse(ultimo.em) < 10 * 60_000;
  if (recente && ultimo) {
    const campos = new Set([...(ultimo.detalhe ?? '').split(', ').filter(Boolean), ...alterados]);
    ultimo.detalhe = [...campos].join(', ');
    ultimo.em = nowIso();
  } else {
    registrarEvento({ tipo: 'editado', detalhe: alterados.join(', ') });
  }
}

/** Dados iniciais comuns na criação: prioridade, score, agenda e marcações válidas. */
export function aplicarCriacaoComum<S extends string>(
  item: PostagemBase<S>,
  input: { prioridade?: unknown; score?: unknown; dataAgendada?: string; horaAgendada?: string; tagIds?: string[]; redeIds?: string[] },
  catalogo: CatalogoPostagens,
): void {
  if (isPrioridade(input.prioridade)) item.prioridade = input.prioridade;
  const score = scoreValido(input.score);
  if (score !== undefined) item.score = score;
  if (input.dataAgendada && DATA_REGEX.test(input.dataAgendada)) item.dataAgendada = input.dataAgendada;
  if (input.horaAgendada && HORA_REGEX.test(input.horaAgendada)) item.horaAgendada = input.horaAgendada;
  const { tagIds, redeIds } = conjuntosDoCatalogo(catalogo);
  item.tagIds = [...new Set(input.tagIds ?? [])].filter((id) => tagIds.has(id));
  item.redeIds = [...new Set(input.redeIds ?? [])].filter((id) => redeIds.has(id));
}
