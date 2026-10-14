import { abrirItem } from '../core/navegacao.js';
import type { AlvoDeLink } from './markdown.js';

/**
 * [[Título]] nos cartões: liga a um card do Kanban ou a uma checklist do To-do
 * pelo título (sem diferença de maiúsculas e acentos). Lido dos arquivos na
 * hora em que a prévia abre — os dois são locais e pequenos.
 */

function chave(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export async function carregarResolvedor(): Promise<(titulo: string) => AlvoDeLink | null> {
  const [kanban, todo] = await Promise.all([window.irisAPI.kanban.getBoard(), window.irisAPI.todo.getFile()]);
  const cards = new Map((kanban.ok ? kanban.data.cards : []).map((c) => [chave(c.title), c.id]));
  const listas = new Map((todo.ok ? todo.data.checklists.filter((l) => !l.arquivada) : []).map((l) => [chave(l.titulo), l.id]));
  return (titulo) => {
    const k = chave(titulo);
    const card = cards.get(k);
    if (card) return { tipo: 'Card', abrir: () => abrirItem({ modulo: 'kanban', id: card }) };
    const lista = listas.get(k);
    if (lista) return { tipo: 'Checklist', abrir: () => abrirItem({ modulo: 'todo', id: lista }) };
    return null;
  };
}
