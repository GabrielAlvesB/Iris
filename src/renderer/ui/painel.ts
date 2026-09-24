import { empilharCamada, estaNoTopo } from './modal.js';
import { svg } from './pagina.js';

/**
 * Casca do painel de detalhes (postagens, cartões do Kanban): o mesmo desenho
 * dos modais, em três posições. Centralizado vira um modal (fundo escuro,
 * clique fora fecha); nas laterais convive com a tela, que continua clicável.
 *
 * O painel vive no document.body, fora do viewRoot, então sobrevive aos
 * redesenhos da tela de onde foi aberto.
 */

export type PosicaoPainel = 'esquerda' | 'centro' | 'direita';

export function isPosicaoPainel(v: unknown): v is PosicaoPainel {
  return v === 'esquerda' || v === 'centro' || v === 'direita';
}

const POSICOES: Array<{ id: PosicaoPainel; rotulo: string; icone: string }> = [
  { id: 'esquerda', rotulo: 'Abrir à esquerda', icone: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M5 8h2"/><path d="M5 11h2"/>' },
  { id: 'centro', rotulo: 'Abrir centralizado', icone: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="7" y="8" width="10" height="8" rx="1"/>' },
  { id: 'direita', rotulo: 'Abrir à direita', icone: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/><path d="M17 8h2"/><path d="M17 11h2"/>' },
];

export interface PainelOpcoes {
  /** Path SVG do selo do cabeçalho. */
  icone: string;
  /** Rótulo curto acima do selo de estado (ex.: "Vídeo #12"). */
  rotulo: string;
  ariaLabel: string;
  posicao: PosicaoPainel;
  /** Chamado quando o usuário escolhe outra posição (para lembrar a preferência). */
  aoMudarPosicao?: (posicao: PosicaoPainel) => void;
  /** Chamado uma vez, por qualquer caminho de fechamento. */
  aoFechar?: () => void;
  /** Painel mais estreito, para conteúdo curto. */
  compacto?: boolean;
}

export interface PainelHandle {
  painel: HTMLElement;
  /** Ao lado do rótulo: selo de estado. */
  estado: HTMLElement;
  /** Texto "Salvo / Salvando…". */
  salvo: HTMLElement;
  corpo: HTMLElement;
  /** Seções: uma coluna nas laterais, duas no centro. */
  grade: HTMLElement;
  rodape: HTMLElement;
  fechar(): void;
  marcarSalvando(): void;
  marcarSalvo(): void;
  marcarErro(erro: unknown): void;
}

export function abrirPainel(opcoes: PainelOpcoes): PainelHandle {
  const painel = document.createElement('aside');
  painel.className = `painel${opcoes.compacto ? ' is-compacto' : ''}`;
  painel.setAttribute('aria-label', opcoes.ariaLabel);

  let fundo: HTMLElement | null = null;
  let fechado = false;
  let desempilhar = (): void => undefined;

  const cabecalho = document.createElement('header');
  cabecalho.className = 'painel-cabecalho';
  const icone = document.createElement('span');
  icone.className = 'modal-custom-icone';
  icone.innerHTML = svg(opcoes.icone, 18, 1.9);
  const identidade = document.createElement('div');
  identidade.className = 'painel-identidade';
  const rotulo = document.createElement('span');
  rotulo.className = 'painel-rotulo';
  rotulo.textContent = opcoes.rotulo;
  const estado = document.createElement('span');
  estado.className = 'painel-estado';
  identidade.append(rotulo, estado);
  const salvo = document.createElement('span');
  salvo.className = 'painel-salvo';
  salvo.textContent = 'Esc para fechar';

  const seletor = document.createElement('div');
  seletor.className = 'painel-posicao';
  seletor.setAttribute('role', 'group');
  seletor.setAttribute('aria-label', 'Posição do painel');

  const fecharBtn = document.createElement('button');
  fecharBtn.type = 'button';
  fecharBtn.className = 'modal-custom-fechar';
  fecharBtn.setAttribute('aria-label', 'Fechar painel');
  fecharBtn.innerHTML = svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 16, 1.9);

  const corpo = document.createElement('div');
  corpo.className = 'painel-corpo';
  const grade = document.createElement('div');
  grade.className = 'painel-grade';
  const rodape = document.createElement('footer');
  rodape.className = 'painel-rodape modal-custom-rodape';

  function fechar(): void {
    if (fechado) return;
    fechado = true;
    desempilhar();
    painel.remove();
    fundo?.remove();
    fundo = null;
    opcoes.aoFechar?.();
  }

  function aplicarPosicao(posicao: PosicaoPainel): void {
    POSICOES.forEach((p) => painel.classList.toggle(`is-${p.id}`, p.id === posicao));
    seletor.querySelectorAll<HTMLElement>('button').forEach((b) => {
      const ativo = b.dataset.posicao === posicao;
      b.classList.toggle('is-ativo', ativo);
      b.setAttribute('aria-pressed', String(ativo));
    });
    if (posicao === 'centro' && !fundo) {
      fundo = document.createElement('div');
      fundo.className = 'painel-fundo';
      fundo.addEventListener('mousedown', () => {
        if (estaNoTopo(painel)) fechar();
      });
      painel.before(fundo);
    } else if (posicao !== 'centro' && fundo) {
      fundo.remove();
      fundo = null;
    }
  }

  POSICOES.forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.posicao = p.id;
    btn.title = p.rotulo;
    btn.setAttribute('aria-label', p.rotulo);
    btn.innerHTML = svg(p.icone, 14, 1.9);
    btn.addEventListener('click', () => {
      aplicarPosicao(p.id);
      opcoes.aoMudarPosicao?.(p.id);
    });
    seletor.appendChild(btn);
  });

  fecharBtn.addEventListener('click', fechar);
  cabecalho.append(icone, identidade, salvo, seletor, fecharBtn);
  corpo.appendChild(grade);
  painel.append(cabecalho, corpo, rodape);
  document.body.appendChild(painel);
  aplicarPosicao(opcoes.posicao);
  desempilhar = empilharCamada(painel, fechar);

  return {
    painel,
    estado,
    salvo,
    corpo,
    grade,
    rodape,
    fechar,
    marcarSalvando: () => {
      salvo.textContent = 'Salvando…';
      salvo.classList.remove('is-erro');
    },
    marcarSalvo: () => {
      salvo.textContent = 'Salvo';
      salvo.classList.remove('is-erro');
    },
    marcarErro: (erro) => {
      salvo.textContent = erro instanceof Error ? erro.message : String(erro);
      salvo.classList.add('is-erro');
    },
  };
}

const POSICAO_STORAGE_KEY = 'iris.painel.posicao';

/** Posição lembrada por tela, para painéis que não têm onde guardar a preferência. */
export function lerPosicaoLembrada(chave: string, padrao: PosicaoPainel = 'direita'): PosicaoPainel {
  try {
    const raw = localStorage.getItem(`${POSICAO_STORAGE_KEY}.${chave}`);
    return isPosicaoPainel(raw) ? raw : padrao;
  } catch {
    return padrao;
  }
}

export function lembrarPosicao(chave: string, posicao: PosicaoPainel): void {
  try {
    localStorage.setItem(`${POSICAO_STORAGE_KEY}.${chave}`, posicao);
  } catch {
    // Sem armazenamento local, a posição só não é lembrada.
  }
}
