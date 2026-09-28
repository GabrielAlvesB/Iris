import {
  descritorDe,
  type Capacidade,
  type IaConfig,
  type PedidoTexto,
  type RespostaTexto,
  type TarefaIa,
} from '../../shared/types/ia.types.js';

/**
 * Estado da IA vivo na sessão inteira (não é um módulo): Postagens, Roteiros,
 * Ajustes e o Estúdio leem a mesma config, e as tarefas de imagem seguem
 * rodando mesmo fora do Estúdio.
 */

let config: IaConfig | null = null;
const tarefas = new Map<string, TarefaIa>();
const ouvintesTarefa = new Set<(tarefa: TarefaIa) => void>();
let escutando = false;

function unwrap<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

export async function carregarConfigIa(forcar = false): Promise<IaConfig> {
  if (config && !forcar) return config;
  config = unwrap(await window.irisAPI.ia.getConfig());
  return config;
}

/** Ajustes chama ao salvar, para as outras telas verem a mudança sem recarregar. */
export function definirConfigIa(nova: IaConfig): void {
  config = nova;
}

/** Há algum provedor configurado que faz isso? */
export function iaPode(c: IaConfig, capacidade: Capacidade): boolean {
  return c.provedores.some((p) => p.configurado && descritorDe(p.id).capacidades.includes(capacidade));
}

export async function gerarTextoIa(pedido: PedidoTexto): Promise<RespostaTexto> {
  return unwrap(await window.irisAPI.ia.gerarTexto(pedido));
}

// ---------- Tarefas de imagem ----------

function escutar(): void {
  if (escutando) return;
  escutando = true;
  window.irisAPI.events.on('ia:tarefa', (tarefa) => {
    tarefas.set(tarefa.id, tarefa);
    ouvintesTarefa.forEach((cb) => cb(tarefa));
  });
}

/** Assina as mudanças de tarefa. Devolve o cancelamento. */
export function onTarefaIa(cb: (tarefa: TarefaIa) => void): () => void {
  escutar();
  ouvintesTarefa.add(cb);
  return () => ouvintesTarefa.delete(cb);
}

export async function listarTarefasIa(): Promise<TarefaIa[]> {
  escutar();
  const lista = unwrap(await window.irisAPI.ia.listarTarefas());
  lista.forEach((t) => tarefas.set(t.id, t));
  return lista;
}

/** Espera uma tarefa terminar (pronta, erro ou cancelada). */
export function aguardarTarefaIa(tarefaId: string): Promise<TarefaIa> {
  const atual = tarefas.get(tarefaId);
  if (atual && atual.situacao !== 'gerando') return Promise.resolve(atual);
  return new Promise((resolve) => {
    const parar = onTarefaIa((t) => {
      if (t.id !== tarefaId || t.situacao === 'gerando') return;
      parar();
      resolve(t);
    });
  });
}
