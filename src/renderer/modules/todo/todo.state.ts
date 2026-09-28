import type { IpcResult } from '../../../shared/types/common.types';
import type {
  AdicionarItensInput,
  ArquivarChecklistInput,
  AtualizarChecklistInput,
  AtualizarItemInput,
  CriarChecklistInput,
  EnviarAoKanbanInput,
  MarcarTodosInput,
  RemoverItemInput,
  ReordenarItensInput,
  TodoFile,
} from '../../../shared/types/todo.types';

type Listener = (state: TodoFile) => void;

let state: TodoFile | null = null;
let listener: Listener | null = null;

function unwrap(result: IpcResult<TodoFile>): TodoFile {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: TodoFile): void {
  state = next;
  listener?.(state);
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function offStateChange(): void {
  listener = null;
}

export function getCurrentState(): TodoFile | null {
  return state;
}

export async function load(): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.todo.getFile()));
}

/** Devolve o id da checklist criada, para a tela levar o foco até ela. */
export async function criarChecklist(input: CriarChecklistInput): Promise<string | null> {
  const antes = new Set((state?.checklists ?? []).map((l) => l.id));
  const next = unwrap(await window.irisAPI.todo.criarChecklist(input));
  const nova = next.checklists.find((l) => !antes.has(l.id));
  applyAndNotify(next);
  return nova?.id ?? null;
}

export async function atualizarChecklist(input: AtualizarChecklistInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.todo.atualizarChecklist(input)));
}

export async function excluirChecklist(checklistId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.todo.excluirChecklist(checklistId)));
}

export async function duplicarChecklist(checklistId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.todo.duplicarChecklist(checklistId)));
}

export async function arquivarChecklist(input: ArquivarChecklistInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.todo.arquivarChecklist(input)));
}

export async function reordenarChecklists(checklistIds: string[]): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.todo.reordenarChecklists(checklistIds)));
}

export async function adicionarItens(input: AdicionarItensInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.todo.adicionarItens(input)));
}

export async function atualizarItem(input: AtualizarItemInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.todo.atualizarItem(input)));
}

export async function removerItem(input: RemoverItemInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.todo.removerItem(input)));
}

export async function reordenarItens(input: ReordenarItensInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.todo.reordenarItens(input)));
}

export async function marcarTodos(input: MarcarTodosInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.todo.marcarTodos(input)));
}

export async function limparConcluidos(checklistId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.todo.limparConcluidos(checklistId)));
}

export async function enviarAoKanban(input: EnviarAoKanbanInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.todo.enviarAoKanban(input)));
}
