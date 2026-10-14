import * as kanbanService from '../kanban/kanban.service';
import * as todoService from '../todo/todo.service';
import * as quadroService from '../quadro/quadro.service';
import * as videosService from '../videos/videos.service';
import * as imagensService from '../imagens/imagens.service';
import { hojeLocal } from '../../../shared/types/brasil';
import { VIDEO_STATUS } from '../../../shared/types/videos.types';
import { IMAGEM_STATUS } from '../../../shared/types/imagens.types';
import type { KanbanPriority } from '../../../shared/types/kanban.types';
import { DIAS_A_FRENTE, type ConcluirItemDiaInput, type DiaHoje, type ItemDia } from '../../../shared/types/hoje.types';
import { calcularRevisao, diaLocal as diaLocalRevisao, segundaDaSemana, type FontesRevisao, type RevisaoSemana } from '../../../shared/types/revisao.types';

/**
 * A tela Hoje, montada na hora a partir dos arquivos de cada módulo. Todas as
 * datas são locais ("AAAA-MM-DD" como relógio de parede): comparar texto com
 * texto evita o `new Date('2026-10-03')` que, em UTC, cai no dia anterior.
 */

/** "AAAA-MM-DD" + n dias, montado à mão (setDate lida com a virada de mês). */
function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number];
  const data = new Date(a, m - 1, d);
  data.setDate(data.getDate() + n);
  return hojeLocal(data);
}

function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(a, m - 1, d).getDay();
}

/** O começo "AAAA-MM-DD" de um prazo que pode vir com hora. */
function dia(valor: string | undefined): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(valor ?? '');
  return m ? m[1]! : '';
}

/** Instante ISO → dia local (o `publicadoEm` é gravado em UTC). */
function diaLocalDe(isoInstante: string | undefined): string {
  if (!isoInstante) return '';
  const t = Date.parse(isoInstante);
  return Number.isNaN(t) ? '' : hojeLocal(new Date(t));
}

const PRIORIDADE_KANBAN: Record<KanbanPriority, ItemDia['prioridade']> = { high: 'alta', medium: 'media', low: 'baixa' };
const PESO: Record<NonNullable<ItemDia['prioridade']>, number> = { alta: 0, media: 1, baixa: 2 };

function ordenar(a: ItemDia, b: ItemDia): number {
  // Com hora primeiro (na ordem do relógio), depois por prioridade e nome.
  if (a.data !== b.data) return a.data.localeCompare(b.data);
  if (a.hora && b.hora && a.hora !== b.hora) return a.hora.localeCompare(b.hora);
  if (a.hora && !b.hora) return -1;
  if (!a.hora && b.hora) return 1;
  const pa = a.prioridade ? PESO[a.prioridade] : 3;
  const pb = b.prioridade ? PESO[b.prioridade] : 3;
  return pa - pb || a.titulo.localeCompare(b.titulo, 'pt-BR');
}

/** Tudo o que tem data, de todos os módulos, já com "feito" resolvido para o dia `hoje`. */
async function coletar(hoje: string): Promise<ItemDia[]> {
  const itens: ItemDia[] = [];

  try {
    const board = await kanbanService.getBoard();
    const colunas = [...board.columns].sort((a, b) => a.order - b.order);
    const ultima = colunas[colunas.length - 1]?.id;
    const nome = new Map(colunas.map((c) => [c.id, c.title]));
    board.cards.forEach((c) => {
      const data = dia(c.dueDate);
      if (!data) return;
      itens.push({
        chave: `card:${c.id}`,
        tipo: 'card',
        id: c.id,
        titulo: c.title,
        detalhe: nome.get(c.columnId) ?? 'Kanban',
        data,
        feito: c.columnId === ultima,
        prioridade: c.priority ? PRIORIDADE_KANBAN[c.priority] : undefined,
        podeConcluir: colunas.length > 1,
        alvo: { modulo: 'kanban', id: c.id },
      });
    });
  } catch (erro) {
    console.error('[hoje] kanban', erro);
  }

  try {
    const file = await todoService.getFile();
    file.checklists
      .filter((l) => !l.arquivada)
      .forEach((l) => {
        const data = dia(l.prazo);
        if (!data) return;
        const feitos = l.itens.filter((i) => i.feito).length;
        itens.push({
          chave: `checklist:${l.id}`,
          tipo: 'checklist',
          id: l.id,
          titulo: l.titulo,
          detalhe: l.itens.length ? `${feitos} de ${l.itens.length} itens` : 'sem itens',
          data,
          feito: l.itens.length > 0 && feitos === l.itens.length,
          prioridade: l.prioridade,
          podeConcluir: false,
          alvo: { modulo: 'todo', id: l.id },
        });
      });
  } catch (erro) {
    console.error('[hoje] todo', erro);
  }

  try {
    const [videos, imagens] = await Promise.all([videosService.getFile(), imagensService.getFile()]);
    const etapaVideo = new Map<string, string>(VIDEO_STATUS.map((s) => [s.id, s.rotulo]));
    const etapaImagem = new Map<string, string>(IMAGEM_STATUS.map((s) => [s.id, s.rotulo]));
    const juntar = (
      lista: Array<{ id: string; titulo: string; status: string; dataAgendada?: string; horaAgendada?: string; publicadoEm?: string; prioridade?: ItemDia['prioridade'] }>,
      tipo: 'video' | 'imagem',
    ): void => {
      lista.forEach((p) => {
        if (p.status === 'arquivado') return;
        // Publicada sem data marcada conta no dia em que saiu.
        const data = dia(p.dataAgendada) || (p.status === 'publicado' ? diaLocalDe(p.publicadoEm) : '');
        if (!data) return;
        const etapa = (tipo === 'video' ? etapaVideo : etapaImagem).get(p.status) ?? p.status;
        itens.push({
          chave: `postagem:${p.id}`,
          tipo: 'postagem',
          id: p.id,
          titulo: p.titulo || (tipo === 'video' ? 'Vídeo sem título' : 'Imagem sem título'),
          detalhe: `${tipo === 'video' ? 'Vídeo' : 'Imagem'} · ${etapa}`,
          data,
          hora: p.horaAgendada || undefined,
          feito: p.status === 'publicado',
          prioridade: p.prioridade,
          podeConcluir: false,
          alvo: { modulo: 'postagens', tipo, id: p.id },
        });
      });
    };
    juntar(videos.videos, 'video');
    juntar(imagens.imagens, 'imagem');
  } catch (erro) {
    console.error('[hoje] postagens', erro);
  }

  try {
    const quadro = await quadroService.getState();
    const rotinas = quadro.blocks.filter((b) => b.type === 'rotina' && b.routineDays?.length);
    // Uma rotina aparece em cada dia da janela em que está marcada para acontecer.
    for (let n = 0; n <= DIAS_A_FRENTE; n++) {
      const data = somarDias(hoje, n);
      const semana = diaDaSemana(data);
      rotinas
        .filter((b) => b.routineDays!.includes(semana))
        .forEach((b) => {
          const streak = b.streakCount ?? 0;
          itens.push({
            chave: `rotina:${b.id}:${data}`,
            tipo: 'rotina',
            id: b.id,
            titulo: b.title || 'Rotina',
            detalhe: streak ? `Quadro · 🔥 ${streak} dia${streak === 1 ? '' : 's'}` : 'Quadro',
            data,
            hora: b.routineTime || undefined,
            feito: b.rotinaFeitaEm === data,
            podeConcluir: n === 0,
            alvo: { modulo: 'quadro', id: b.id },
          });
        });
    }
  } catch (erro) {
    console.error('[hoje] quadro', erro);
  }

  return itens;
}

export async function getDia(): Promise<DiaHoje> {
  const hoje = hojeLocal();
  const ultimo = somarDias(hoje, DIAS_A_FRENTE);
  const itens = (await coletar(hoje)).sort(ordenar);
  const proximos = Array.from({ length: DIAS_A_FRENTE }, (_, i) => somarDias(hoje, i + 1)).map((data) => ({
    data,
    itens: itens.filter((i) => i.data === data && !i.feito),
  }));
  return {
    hoje,
    // Rotina não "atrasa": a de ontem simplesmente não foi feita.
    atrasados: itens.filter((i) => i.data < hoje && !i.feito && i.tipo !== 'rotina'),
    doDia: itens.filter((i) => i.data === hoje && !i.feito),
    feitos: itens.filter((i) => i.data === hoje && i.feito),
    proximos: proximos.filter((d) => d.data <= ultimo),
  };
}

/**
 * Concluir dali mesmo: o card vai para a última coluna do Kanban (o "feito" do
 * quadro) e a rotina é marcada no dia. Desfazer: o card volta à primeira coluna.
 */
export async function concluir(input: ConcluirItemDiaInput): Promise<DiaHoje> {
  if (input.tipo === 'card') {
    const board = await kanbanService.getBoard();
    const colunas = [...board.columns].sort((a, b) => a.order - b.order);
    const destino = input.feito ? colunas[colunas.length - 1] : colunas[0];
    if (!destino) throw new Error('O Kanban não tem colunas.');
    if (!board.cards.some((c) => c.id === input.id)) throw new Error('Esse card não existe mais.');
    await kanbanService.moveCard({ cardId: input.id, toColumnId: destino.id, toIndex: 0 });
  } else if (input.tipo === 'rotina') {
    await quadroService.marcarRotina({ blockId: input.id, data: hojeLocal(), feita: input.feito });
  } else {
    throw new Error('Esse item se conclui no próprio módulo.');
  }
  return getDia();
}

// ---------- Revisão da semana ----------

/** Lê os módulos e entrega para as contas puras (revisao.types.ts). `inicio` = qualquer dia da semana pedida. */
export async function getSemana(inicio?: unknown): Promise<RevisaoSemana> {
  const hoje = hojeLocal();
  const pedido = typeof inicio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(inicio) ? inicio : hoje;
  const segunda = segundaDaSemana(pedido);
  const [board, todo, videos, imagens, quadro] = await Promise.all([
    kanbanService.getBoard(),
    todoService.getFile(),
    videosService.getFile(),
    imagensService.getFile(),
    quadroService.getState(),
  ]);
  const redes = new Map(videos.redes.map((r) => [r.id, r.nome]));
  // Publicada conta no dia marcado (a mesma regra das Métricas); sem data, no dia em que saiu.
  const diaDaPublicacao = (p: { dataAgendada?: string; publicadoEm?: string }): string => dia(p.dataAgendada) || diaLocalRevisao(p.publicadoEm);
  const fontes: FontesRevisao = {
    hoje,
    cards: board.cards.map((c) => ({ id: c.id, titulo: c.title, prazo: c.dueDate, concluidoEm: c.concluidoEm, tempo: c.tempo })),
    checklists: todo.checklists.map((l) => {
      const concluida = l.itens.length > 0 && l.itens.every((i) => i.feito);
      // Concluída quando o último item foi marcado.
      const ultima = concluida ? l.itens.map((i) => i.feitoEm ?? '').sort().pop() : undefined;
      return { id: l.id, titulo: l.titulo, prazo: l.prazo, concluidaEm: ultima || undefined, tempo: l.tempo };
    }),
    publicadas: [
      ...videos.videos.filter((v) => v.status === 'publicado').map((v) => ({ id: v.id, tipo: 'video' as const, titulo: v.titulo, dia: diaDaPublicacao(v), redes: v.redeIds.map((id) => redes.get(id) ?? '').filter(Boolean) })),
      ...imagens.imagens.filter((i) => i.status === 'publicado').map((i) => ({ id: i.id, tipo: 'imagem' as const, titulo: i.titulo, dia: diaDaPublicacao(i), redes: i.redeIds.map((id) => redes.get(id) ?? '').filter(Boolean) })),
    ],
    agendadas: [...videos.videos, ...imagens.imagens].filter((p) => p.status !== 'publicado' && p.status !== 'arquivado').map((p) => dia(p.dataAgendada)).filter(Boolean),
    rotinas: quadro.blocks
      .filter((b) => b.type === 'rotina' && b.routineDays?.length)
      .map((b) => ({ id: b.id, titulo: b.title || 'Rotina', dias: b.routineDays ?? [], feitasEm: b.feitasEm ?? (b.rotinaFeitaEm ? [b.rotinaFeitaEm] : []) })),
  };
  return calcularRevisao(fontes, segunda);
}
