import type { EntradaHistorico } from '../../shared/types/historico.types';
import type {} from '../../shared/types/preload-api.types';
import { mostrarToast } from '../ui/toast.js';
import { openAvisoModal } from '../ui/modal.js';
import { comModuloFechado } from './navegacao.js';
import { aplicarAcento, aplicarIntensidade } from './tema.js';
import { acentoDoDestaque } from '../../shared/types/cor.js';

/**
 * Desfazer no app inteiro. Vivo a sessão toda: toda exclusão feita pela tela
 * ganha um aviso com "Desfazer", em qualquer módulo, sem cada um precisar
 * implementar o seu. Alt+Z (atalhos.globais.ts) e Ajustes › Histórico
 * passam pelo mesmo `desfazer`.
 */

let iniciado = false;
/** Avisos de exclusão na tela: qualquer desfazer mexe na lista e o "Desfazer" deles deixa de valer. */
const avisosAbertos = new Set<() => void>();

export function textoDaEntrada(e: EntradaHistorico): string {
  return e.detalhe ? `${e.rotulo} · “${e.detalhe}”` : e.rotulo;
}

export function iniciarHistorico(): void {
  if (iniciado) return;
  iniciado = true;
  window.irisAPI.events.on('historico:mudou', ({ motivo, entrada }) => {
    if (motivo === 'desfeita' || motivo === 'limpo') {
      avisosAbertos.forEach((fechar) => fechar());
      avisosAbertos.clear();
      return;
    }
    if (motivo !== 'nova' || !entrada || entrada.tipo !== 'exclusao') return;
    const fechar = mostrarToast(textoDaEntrada(entrada), [{ rotulo: 'Desfazer', fazer: () => void desfazer(entrada.id) }]);
    avisosAbertos.add(fechar);
    setTimeout(() => avisosAbertos.delete(fechar), 8000);
  });
}

async function executar(pedir: () => ReturnType<typeof window.irisAPI.historico.desfazerUltima>): Promise<EntradaHistorico | null> {
  try {
    const r = await comModuloFechado(pedir);
    if (!r.ok) throw new Error(r.error);
    // A cor de destaque é estilo no <html>, não uma tela que remonta: repinta à mão.
    if (r.data.arquivo === 'ajustes.json') {
      const a = await window.irisAPI.ajustes.getAjustes();
      if (a.ok) {
        aplicarAcento(acentoDoDestaque(a.data.destaque));
        aplicarIntensidade(a.data.intensidade);
      }
    }
    mostrarToast(`Desfeito: ${textoDaEntrada(r.data)} (${r.data.modulo})`, [], 5000);
    return r.data;
  } catch (erro) {
    void openAvisoModal('Não deu para desfazer', erro instanceof Error ? erro.message : String(erro), { erro: true });
    return null;
  }
}

export function desfazer(id: string): Promise<EntradaHistorico | null> {
  return executar(() => window.irisAPI.historico.desfazer(id));
}

export function desfazerUltima(): Promise<EntradaHistorico | null> {
  return executar(() => window.irisAPI.historico.desfazerUltima());
}
