import type { EmpresaCrm, Pessoa, RefContato } from '../../../shared/types/contatos.types.js';
import type { CtxContatos } from './contatos.casco.js';
import * as contatosState from './contatos.state.js';

/**
 * O rascunho da ficha aberta: os campos editam no lugar e salvam na pausa da
 * digitação, sem redesenhar (o foco não cai). Ações que mudam a estrutura —
 * etapa, empresa, próximo contato, histórico — descarregam o pendente antes e
 * redesenham a ficha inteira.
 *
 * Mora à parte para as partes da ficha (dados, lateral, histórico, conversa)
 * escreverem no mesmo rascunho.
 */

const ESPERA_SALVAR_MS = 700;

export type Rascunho = (Partial<Pessoa> & Partial<EmpresaCrm>) & { id: string };

let rascunho: Rascunho = { id: '' };
let tipoAtual: 'pessoa' | 'empresa' = 'pessoa';
let timer: ReturnType<typeof setTimeout> | null = null;
let pendente = false;
let indicador: HTMLElement | null = null;

export function rascunhoAtual(): Rascunho {
  return rascunho;
}

/**
 * Refeito só ao trocar de contato ou quando nada está pendente: um redesenho
 * no meio da digitação não pode desfazer o que ainda não salvou.
 */
export function prepararRascunho(c: Pessoa | EmpresaCrm, ref: RefContato): void {
  if (rascunho.id !== c.id || !pendente) {
    rascunho = structuredClone(c) as Rascunho;
    tipoAtual = ref.tipo;
  }
}

/** O "Salvando… / Salvo" do topo; cada redesenho entrega o elemento novo. */
export function ligarIndicador(el: HTMLElement): void {
  indicador = el;
  el.textContent = pendente ? 'Salvando…' : '';
}

function mostrar(texto: string, tom: '' | 'ok' | 'erro' = ''): void {
  if (!indicador) return;
  indicador.textContent = texto;
  indicador.dataset.tom = tom;
}

export function agendar(): void {
  pendente = true;
  mostrar('Salvando…');
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void descarregarFicha(), ESPERA_SALVAR_MS);
}

/** Grava o que foi digitado e ainda não foi salvo. Chamado antes de qualquer ação que redesenha. */
export async function descarregarFicha(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!pendente || !rascunho.id) return;
  pendente = false;
  try {
    await contatosState.salvarSilencioso(tipoAtual, structuredClone(rascunho));
    mostrar('Salvo', 'ok');
  } catch (e) {
    mostrar('Não salvou', 'erro');
    throw e;
  }
}

/** Esquece o pendente sem gravar (o contato vai ser excluído). */
export function descartarPendente(): void {
  pendente = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Muda já e redesenha: etapa, empresa, próximo contato, "não enviar WhatsApp". */
export async function salvarERedesenhar(ctx: CtxContatos, mudanca: Partial<Pessoa> | Partial<EmpresaCrm>): Promise<void> {
  try {
    Object.assign(rascunho, mudanca);
    descartarPendente();
    const dados = structuredClone(rascunho);
    if (tipoAtual === 'pessoa') await contatosState.salvarPessoa(dados as Partial<Pessoa>);
    else await contatosState.salvarEmpresa(dados as Partial<EmpresaCrm>);
  } catch (e) {
    ctx.falhou(e);
  }
}
