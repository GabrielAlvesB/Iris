import type { EstadoAtualizacao } from '../../shared/types/atualizacao.types.js';
import { openAvisoModal, openConfirmModal } from '../ui/modal.js';
import { svg } from '../ui/pagina.js';
import { abrirAjustes } from './navegacao.js';

/**
 * Estado da atualização do app, vivo durante toda a sessão (não é um módulo:
 * o aviso na barra lateral aparece em qualquer tela). O main verifica o
 * GitHub sozinho e empurra 'atualizacao:estado'; aqui só guardamos e desenhamos.
 */

export const ICONE_ATUALIZACAO = '<path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/>';

type Ouvinte = (estado: EstadoAtualizacao) => void;

let estado: EstadoAtualizacao | null = null;
const ouvintes = new Set<Ouvinte>();
let aviso: HTMLButtonElement | null = null;

function mudou(novo: EstadoAtualizacao): void {
  estado = novo;
  desenharAviso();
  ouvintes.forEach((cb) => cb(novo));
}

export function getEstadoAtualizacao(): EstadoAtualizacao | null {
  return estado;
}

/** Para a seção de Ajustes acompanhar o progresso. Devolve o cancelamento. */
export function onAtualizacao(cb: Ouvinte): () => void {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

/** Chamado uma vez no bootstrap; a assinatura dura a vida da janela. */
export function iniciarAtualizacao(): void {
  window.irisAPI.events.on('atualizacao:estado', mudou);
  void window.irisAPI.atualizacao.getEstado().then((r) => {
    if (r.ok) mudou(r.data);
  });
}

export async function verificarAgora(): Promise<void> {
  const r = await window.irisAPI.atualizacao.verificar();
  if (!r.ok) throw new Error(r.error);
}

export async function abrirPaginaDaRelease(): Promise<void> {
  const r = await window.irisAPI.atualizacao.abrirPagina();
  if (!r.ok) throw new Error(r.error);
}

/** Confirma, baixa e instala. O app fecha e volta aberto na versão nova. */
export async function atualizarAgora(): Promise<void> {
  const nova = estado?.nova;
  if (!nova) return;
  const ok = await openConfirmModal({
    title: `Atualizar para a versão ${nova.versao}`,
    message:
      'O Iris vai baixar a versão nova e, quando terminar, fechar sozinho para instalar e abrir de novo. ' +
      'Seus dados não são tocados — ficam na pasta de dados, fora da instalação.',
    confirmText: 'Baixar e instalar',
    danger: false,
  });
  if (!ok) return;
  const r = await window.irisAPI.atualizacao.atualizar();
  if (!r.ok) await openAvisoModal('Não deu para atualizar', r.error, { erro: true });
}

function textoDoAviso(e: EstadoAtualizacao): string | null {
  if (e.situacao === 'disponivel' && e.nova) return `Versão ${e.nova.versao} disponível`;
  if (e.situacao === 'baixando') return `Baixando ${Math.round((e.progresso ?? 0) * 100)}%`;
  if (e.situacao === 'instalando') return 'Instalando…';
  if (e.situacao === 'erro' && e.nova) return 'Atualização com erro';
  return null;
}

/** Botão acima do rodapé da barra lateral; só existe quando há o que fazer. */
function desenharAviso(): void {
  const texto = estado ? textoDoAviso(estado) : null;
  if (!texto) {
    aviso?.remove();
    aviso = null;
    return;
  }
  if (!aviso) {
    const rodape = document.querySelector('#sidebar .sidebar-footer');
    if (!rodape) return;
    aviso = document.createElement('button');
    aviso.type = 'button';
    aviso.className = 'sidebar-atualizacao';
    aviso.addEventListener('click', () => abrirAjustes('atualizacoes'));
    rodape.before(aviso);
  }
  aviso.classList.toggle('is-erro', estado?.situacao === 'erro');
  aviso.title = `${texto} — abrir Atualizações`;
  aviso.innerHTML = svg(ICONE_ATUALIZACAO, 15, 2);
  const rotulo = document.createElement('span');
  rotulo.className = 'sidebar-atualizacao-texto';
  rotulo.textContent = texto;
  aviso.appendChild(rotulo);
  aviso.style.setProperty('--progresso', String(estado?.situacao === 'baixando' ? (estado.progresso ?? 0) : 0));
}
