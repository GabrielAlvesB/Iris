import { contarPalavras, formatarTempo, ppmDe } from '../../../shared/types/roteiros.conversao.js';
import type { Roteiro } from '../../../shared/types/roteiros.types.js';
import { empilharCamada } from '../../ui/modal.js';
import { svg } from '../../ui/pagina.js';
import { ICONES, tipoDe } from './roteiros.comum.js';

/**
 * Teleprompter de tela cheia: só a fala, letra grande, rolando na velocidade
 * de leitura do roteiro (palavras por minuto). Atalhos: Espaço pausa, ↑↓
 * velocidade, ←→ tamanho da letra, M espelha, Home volta ao começo, Esc sai.
 */

const TAMANHOS = [28, 34, 40, 48, 56, 66, 78];
const CHAVE = 'iris.roteiros.teleprompter';

interface Preferencias {
  tamanho: number;
  espelhar: boolean;
  /** Multiplicador sobre o ritmo do roteiro (1 = o ppm do briefing/formato). */
  ritmo: number;
}

function lerPreferencias(): Preferencias {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<Preferencias>;
    return {
      tamanho: typeof p.tamanho === 'number' ? Math.min(TAMANHOS.length - 1, Math.max(0, p.tamanho)) : 3,
      espelhar: p.espelhar === true,
      ritmo: typeof p.ritmo === 'number' && p.ritmo >= 0.4 && p.ritmo <= 2.5 ? p.ritmo : 1,
    };
  } catch {
    return { tamanho: 3, espelhar: false, ritmo: 1 };
  }
}

function lembrar(p: Preferencias): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    // Sem armazenamento local, as escolhas valem só até fechar.
  }
}

export function abrirTeleprompter(r: Roteiro): void {
  const pref = lerPreferencias();
  const cenas = r.cenas.filter((c) => c.fala.trim());
  const ppm = ppmDe(r);
  const palavras = cenas.reduce((n, c) => n + contarPalavras(c.fala), 0);

  const raiz = document.createElement('div');
  raiz.className = 'rte-tp modal-overlay';
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-label', 'Teleprompter');

  const palco = document.createElement('div');
  palco.className = 'rte-tp-palco';
  const texto = document.createElement('div');
  texto.className = 'rte-tp-texto';
  if (!cenas.length) texto.appendChild(Object.assign(document.createElement('p'), { textContent: 'Nenhuma fala escrita ainda.' }));
  cenas.forEach((c) => {
    texto.appendChild(Object.assign(document.createElement('p'), { className: 'rte-tp-marca', textContent: `${tipoDe(c.tipo).rotulo} · ${c.titulo}` }));
    c.fala
      .split(/\n{2,}/)
      .map((p) => p.replace(/\*\*|__|`/g, '').trim())
      .filter(Boolean)
      .forEach((p) => texto.appendChild(Object.assign(document.createElement('p'), { textContent: p })));
  });
  // Espaço no fim para a última linha chegar ao meio da tela.
  texto.appendChild(Object.assign(document.createElement('div'), { className: 'rte-tp-folga' }));
  palco.appendChild(texto);
  const guia = document.createElement('div');
  guia.className = 'rte-tp-guia';
  palco.appendChild(guia);

  const barra = document.createElement('div');
  barra.className = 'rte-tp-barra';
  const estado = Object.assign(document.createElement('span'), { className: 'rte-tp-estado' });
  const restante = Object.assign(document.createElement('span'), { className: 'rte-tp-restante' });
  const botao = (rotulo: string, titulo: string, acao: () => void, icone?: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rte-tp-btn';
    if (icone) b.innerHTML = svg(icone, 15, 2);
    b.append(rotulo);
    b.title = titulo;
    b.addEventListener('click', acao);
    return b;
  };
  const tocarBtn = botao('Iniciar', 'Espaço', () => alternar());
  barra.append(
    tocarBtn,
    botao('−', 'Mais devagar (↓)', () => mudarRitmo(-0.1)),
    estado,
    botao('+', 'Mais rápido (↑)', () => mudarRitmo(0.1)),
    botao('A−', 'Letra menor (←)', () => mudarTamanho(-1)),
    botao('A+', 'Letra maior (→)', () => mudarTamanho(1)),
    botao('Espelhar', 'Para vidro de teleprompter (M)', () => {
      pref.espelhar = !pref.espelhar;
      aplicar();
    }),
    botao('Início', 'Voltar ao começo (Home)', () => {
      palco.scrollTop = 0;
    }),
    restante,
    botao('Sair', 'Esc', () => fechar(), ICONES.xis),
  );
  raiz.append(palco, barra);

  let tocando = false;
  let ultimo = 0;
  let quadro = 0;
  let resto = 0;
  let contagem: ReturnType<typeof setTimeout> | null = null;

  /**
   * Pixels por segundo: a altura do texto dividida pelo tempo de leitura dele
   * no ritmo escolhido — assim a rolagem acompanha o ppm, qualquer que seja o
   * tamanho da letra.
   */
  const velocidade = (): number => {
    const altura = Math.max(1, texto.scrollHeight - palco.clientHeight * 0.5);
    const segundos = Math.max(5, (palavras / (ppm * pref.ritmo)) * 60);
    return altura / segundos;
  };

  const aplicar = (): void => {
    texto.style.fontSize = `${TAMANHOS[pref.tamanho]}px`;
    palco.classList.toggle('is-espelhado', pref.espelhar);
    estado.textContent = `${Math.round(ppm * pref.ritmo)} ppm`;
    lembrar(pref);
    atualizarRestante();
  };

  const atualizarRestante = (): void => {
    const total = Math.max(1, texto.scrollHeight - palco.clientHeight * 0.5);
    const fracao = Math.min(1, palco.scrollTop / total);
    const segundos = (1 - fracao) * (palavras / (ppm * pref.ritmo)) * 60;
    restante.textContent = `${formatarTempo(segundos)} restantes`;
  };

  const passo = (agora: number): void => {
    if (!tocando) return;
    const dt = ultimo ? (agora - ultimo) / 1000 : 0;
    ultimo = agora;
    // scrollTop só anda em pixels inteiros: o resto acumula para não travar devagar.
    resto += velocidade() * dt;
    const inteiro = Math.floor(resto);
    if (inteiro) {
      palco.scrollTop += inteiro;
      resto -= inteiro;
    }
    atualizarRestante();
    if (palco.scrollTop + palco.clientHeight >= palco.scrollHeight - 2) {
      parar();
      return;
    }
    quadro = requestAnimationFrame(passo);
  };

  const parar = (): void => {
    tocando = false;
    cancelAnimationFrame(quadro);
    if (contagem) clearTimeout(contagem);
    contagem = null;
    raiz.classList.remove('is-contando');
    tocarBtn.lastChild!.textContent = 'Continuar';
  };

  const iniciar = (): void => {
    // Contagem 3-2-1 antes de começar a rolar.
    let n = 3;
    raiz.classList.add('is-contando');
    raiz.dataset.contagem = String(n);
    tocarBtn.lastChild!.textContent = 'Pausar';
    const tique = (): void => {
      n -= 1;
      if (n > 0) {
        raiz.dataset.contagem = String(n);
        contagem = setTimeout(tique, 700);
        return;
      }
      contagem = null;
      raiz.classList.remove('is-contando');
      tocando = true;
      ultimo = 0;
      quadro = requestAnimationFrame(passo);
    };
    contagem = setTimeout(tique, 700);
  };

  const alternar = (): void => {
    if (tocando || contagem) parar();
    else iniciar();
  };

  const mudarRitmo = (delta: number): void => {
    pref.ritmo = Math.min(2.5, Math.max(0.4, Math.round((pref.ritmo + delta) * 10) / 10));
    aplicar();
  };
  const mudarTamanho = (delta: number): void => {
    pref.tamanho = Math.min(TAMANHOS.length - 1, Math.max(0, pref.tamanho + delta));
    aplicar();
  };

  const teclas = (e: KeyboardEvent): void => {
    if (e.key === ' ') {
      e.preventDefault();
      alternar();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      mudarRitmo(0.1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      mudarRitmo(-0.1);
    } else if (e.key === 'ArrowRight') mudarTamanho(1);
    else if (e.key === 'ArrowLeft') mudarTamanho(-1);
    else if (e.key.toLowerCase() === 'm') {
      pref.espelhar = !pref.espelhar;
      aplicar();
    } else if (e.key === 'Home') palco.scrollTop = 0;
  };

  let desempilhar = (): void => undefined;
  const fechar = (): void => {
    parar();
    document.removeEventListener('keydown', teclas);
    desempilhar();
    raiz.remove();
  };
  palco.addEventListener('scroll', atualizarRestante);
  document.addEventListener('keydown', teclas);
  desempilhar = empilharCamada(raiz, fechar);
  document.body.appendChild(raiz);
  aplicar();
  tocarBtn.focus();
}
