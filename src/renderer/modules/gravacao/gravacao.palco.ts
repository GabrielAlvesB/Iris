import {
  PPM_PADRAO_PALCO,
  falasPorPessoa,
  formatarRelogio,
  palavraNoInstante,
  tempoDasPalavras,
  type CenaGravacao,
  type IdPessoa,
  type SessaoGravacao,
} from '../../../shared/types/gravacao.types.js';
import { empilharCamada, estaNoTopo } from '../../ui/modal.js';
import { svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { agoraCerto } from './gravacao.relogio.js';
import { bipeClaquete, bipeContagem, prepararSom } from './gravacao.som.js';

/**
 * Palco: tela cheia e escura (como o teleprompter dos Roteiros — por isso as
 * cores literais). A câmera grava; aqui ficam a contagem, a claquete (flash +
 * bipe de 1 kHz no mesmo instante), o cronômetro e o roteiro.
 *
 * **Nada do que acontece aqui é guardado**: nem take, nem marca, nem duração.
 * O usuário pediu só gravar e ler — o palco é um teleprompter com contagem.
 *
 * O texto anda de dois jeitos, à escolha (localStorage `iris.gravacao.modo`):
 * - **Automático**: palavra por palavra, no ritmo escolhido (+ e − mudam as
 *   palavras por minuto); no fim da cena passa sozinho para a próxima.
 * - **Manual**: frase por frase, nas setas. Nada anda sozinho.
 * Nos dois, ↑/↓ voltam e avançam uma frase e clicar numa palavra leva até ela.
 *
 * Sozinho, Espaço conta 3-2-1 na hora. A dois, o início é o horário do
 * convite, contado pela hora conferida (agoraCerto): os dois Iris chegam ao
 * zero juntos sem falar um com o outro. Teclas próprias em ATALHOS_FIXOS.
 */

const CONTAGEM_MS = 3000;
/** Passou do horário há mais que isto: não dá mais para começar junto. */
const TOLERANCIA_ATRASO_MS = 1500;
/** Respiro no fim da cena antes de passar para a próxima. */
const FOLGA_FIM_CENA_S = 1.2;
const RITMO_MIN = 0.4;
const RITMO_MAX = 2.5;
const CHAVE_RITMO = 'iris.gravacao.ritmo';
const CHAVE_MODO = 'iris.gravacao.modo';
/** Passo do + e do −, em palavras por minuto. */
const PASSO_PPM = 10;

type ModoTexto = 'auto' | 'manual';
/** Altura (fração da área de texto) em que a palavra da vez fica. */
const ALTURA_LEITURA = 0.38;

const COR_PESSOA: Record<IdPessoa, string> = { A: '#7cc4ff', B: '#ffb86b' };

const ICONES = {
  xis: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  esquerda: '<path d="m15 18-6-6 6-6"/>',
  direita: '<path d="m9 18 6-6-6-6"/>',
  pessoas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
};

export interface OpcoesPalco {
  sessao: SessaoGravacao;
  fechou(sessao: SessaoGravacao): void;
  /** Só quem convidou, numa gravação a dois: combinar o próximo take (abre o convite). */
  proximoJunto?(): Promise<number | null>;
}

export interface ControlePalco {
  /** Um convite novo (outro take) chegou: conta até ele. */
  agendar(em: number): void;
  readonly aberto: boolean;
  readonly sessaoId: string;
}

function lerModo(): ModoTexto {
  try {
    return localStorage.getItem(CHAVE_MODO) === 'manual' ? 'manual' : 'auto';
  } catch {
    return 'auto';
  }
}

function lerRitmo(): number {
  try {
    const n = Number(localStorage.getItem(CHAVE_RITMO));
    return n >= RITMO_MIN && n <= RITMO_MAX ? n : 1;
  } catch {
    return 1;
  }
}

function gravarRitmo(n: number): void {
  try {
    localStorage.setItem(CHAVE_RITMO, String(n));
  } catch {
    // Sem armazenamento local, o ritmo vale só até fechar.
  }
}

export function abrirPalco(op: OpcoesPalco): ControlePalco {
  const sessao = op.sessao;
  const cenas: CenaGravacao[] = sessao.roteiro?.cenas ?? [];
  const ppm = sessao.roteiro?.ppm ?? PPM_PADRAO_PALCO;
  const conjunta = sessao.conjunta;
  let indice = 0;
  let espelhado = false;
  let ritmo = lerRitmo();
  let modo: ModoTexto = lerModo();
  /** Depois do bipe, até parar. Só existe aqui: nada disto é gravado. */
  let gravando = false;
  /** Quanto durou a última vez (só para mostrar no topo até a próxima). */
  let ultimaDuracaoMs = 0;
  /** performance.now() do bipe. */
  let inicioPerf = 0;
  /** Instante (hora certa) até o qual a contagem corre; null = parado. */
  let alvo: number | null = null;
  let quadro = 0;
  let ultimoQuadro = 0;
  let fechado = false;
  let numeroMostrado = 0;

  // A cena em palavras: os nós, quando cada uma começa e onde está o marcador.
  let palavras: HTMLElement[] = [];
  let inicios: number[] = [];
  let fimCena = 0;
  /** Índice da primeira palavra de cada frase: é o passo das setas. */
  let frases: number[] = [];
  /** No manual, a frase da vez. */
  let fraseAtual = 0;
  /** Segundos de fala dentro da cena (no automático, anda no ritmo escolhido). */
  let cursor = 0;
  let indiceAceso = -2;
  let fimDaCenaDesde: number | null = null;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto = ''): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto) e.textContent = texto;
    return e;
  };

  // ---------- DOM ----------

  const raiz = el('div', 'gv-palco modal-overlay');
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-label', 'Palco de gravação');
  raiz.classList.toggle('sem-roteiro', !cenas.length);

  // Topo: título e parceiro à esquerda, situação no meio, relógio à direita.
  const topo = el('header', 'gv-p-topo');
  const ident = el('div', 'gv-p-ident');
  ident.appendChild(el('h2', 'gv-p-titulo', sessao.titulo));
  if (conjunta) {
    const quem = el('span', 'gv-p-parceiro');
    quem.innerHTML = svg(ICONES.pessoas, 13, 2);
    quem.append(`com ${conjunta.parceiro}${cenas.length ? ` · você é ${conjunta.euSou}` : ''}`);
    ident.appendChild(quem);
  }
  const situacao = el('div', 'gv-p-situacao');
  situacao.setAttribute('aria-live', 'polite');
  const relogio = el('div', 'gv-p-relogio', '00:00');
  topo.append(ident, situacao, relogio);

  // Centro: a cena do roteiro ou, sem roteiro, o cronômetro grande.
  const centro = el('main', 'gv-p-centro');
  const cabCena = el('div', 'gv-p-cena-cab');
  const btnAnterior = el('button', 'gv-p-nav');
  btnAnterior.type = 'button';
  btnAnterior.innerHTML = svg(ICONES.esquerda, 18, 2);
  btnAnterior.setAttribute('aria-label', 'Cena anterior (←)');
  const nomeCena = el('div', 'gv-p-cena-nome');
  const btnProxima = el('button', 'gv-p-nav');
  btnProxima.type = 'button';
  btnProxima.innerHTML = svg(ICONES.direita, 18, 2);
  btnProxima.setAttribute('aria-label', 'Próxima cena (→)');
  btnAnterior.addEventListener('click', () => trocarCena(-1));
  btnProxima.addEventListener('click', () => trocarCena(1));
  cabCena.append(btnAnterior, nomeCena, btnProxima);
  // Fio de progresso da cena: anda com o marcador.
  const progresso = el('div', 'gv-p-progresso');
  const progressoCheio = el('span', '');
  progresso.appendChild(progressoCheio);
  const rolagem = el('div', 'gv-p-rolagem');
  const fala = el('div', 'gv-p-fala');
  rolagem.appendChild(fala);
  // Como o texto anda: o modo e, no automático, a velocidade. Tudo com botão e com tecla.
  const controles = el('div', 'gv-p-controles');
  const btnModoAuto = el('button', 'gv-p-modo', 'Automático');
  const btnModoManual = el('button', 'gv-p-modo', 'Nas setas');
  btnModoAuto.type = 'button';
  btnModoManual.type = 'button';
  btnModoAuto.title = 'O texto anda sozinho, no ritmo escolhido (A alterna)';
  btnModoManual.title = 'Você passa frase por frase com as setas (A alterna)';
  btnModoAuto.addEventListener('click', () => definirModo('auto'));
  btnModoManual.addEventListener('click', () => definirModo('manual'));
  const modos = el('div', 'gv-p-modos');
  modos.setAttribute('role', 'group');
  modos.setAttribute('aria-label', 'Como o texto anda');
  modos.append(btnModoAuto, btnModoManual);
  const velocidade = el('div', 'gv-p-velocidade');
  const btnMenos = el('button', 'gv-p-passo', '−');
  const btnMais = el('button', 'gv-p-passo', '+');
  btnMenos.type = 'button';
  btnMais.type = 'button';
  btnMenos.setAttribute('aria-label', 'Mais devagar (tecla −)');
  btnMais.setAttribute('aria-label', 'Mais rápido (tecla +)');
  btnMenos.addEventListener('click', () => mudarRitmo(-PASSO_PPM));
  btnMais.addEventListener('click', () => mudarRitmo(PASSO_PPM));
  const ritmoEl = el('span', 'gv-p-ritmo');
  velocidade.append(btnMenos, ritmoEl, btnMais);
  const dicaTexto = el('span', 'gv-p-dica-texto');
  controles.append(modos, velocidade, dicaTexto);
  // Com o foco num destes botões, o Espaço "clicaria" nele em vez de começar a gravar.
  [btnModoAuto, btnModoManual, btnMenos, btnMais].forEach((b) => b.addEventListener('click', () => b.blur()));
  const grande = el('div', 'gv-p-grande');
  const grandeRelogio = el('div', 'gv-p-grande-relogio', '00:00');
  const grandeDica = el('div', 'gv-p-grande-dica');
  grande.append(grandeRelogio, grandeDica);
  if (cenas.length) centro.append(cabCena, progresso, rolagem, controles);
  else centro.appendChild(grande);

  // Clicar numa palavra leva o marcador até ela: é como se acerta quem falou mais rápido ou mais devagar.
  fala.addEventListener('click', (ev) => {
    const alvoPalavra = (ev.target as HTMLElement).closest<HTMLElement>('.gv-p-palavra');
    if (!alvoPalavra) return;
    const i = Number(alvoPalavra.dataset.i);
    if (!Number.isFinite(i)) return;
    irParaPalavra(i);
  });

  // Barra de baixo: gravar no meio, marcas à esquerda, ferramentas à direita.
  const barra = el('footer', 'gv-p-barra');
  const botao = (rotulo: string, tecla: string, acao: () => void, classe = ''): HTMLButtonElement => {
    const b = el('button', `gv-p-btn ${classe}`.trim());
    b.type = 'button';
    b.appendChild(el('span', '', rotulo));
    if (tecla) b.appendChild(el('kbd', '', tecla));
    b.addEventListener('click', () => {
      acao();
      // Com o foco no botão, o Espaço "clicaria" de novo nele.
      b.blur();
    });
    return b;
  };
  const btnGravar = botao('Começar', 'Espaço', () => alternar(), 'is-gravar');
  // À esquerda fica vazio de propósito: o botão de gravar continua no meio da barra.
  const grupoMarcas = el('div', 'gv-p-grupo');
  const ferramentas = el('div', 'gv-p-grupo');
  const sair = el('button', 'gv-p-btn is-sair');
  sair.type = 'button';
  sair.innerHTML = svg(ICONES.xis, 14, 2);
  sair.append(' Sair');
  sair.title = 'Esc';
  sair.addEventListener('click', () => fechar());
  ferramentas.append(
    botao('Claquete', 'C', () => claquete()),
    botao('Espelhar', 'M', () => alternarEspelho()),
    sair,
  );
  const btnJunto = op.proximoJunto ? botao('Próximo take junto', '', () => void combinarProximo(), 'is-junto') : null;
  const meio = el('div', 'gv-p-grupo is-meio');
  meio.append(...(btnJunto ? [btnJunto] : []), btnGravar);
  barra.append(grupoMarcas, meio, ferramentas);

  const contagem = el('div', 'gv-p-contagem');
  const contagemRotulo = el('div', 'gv-p-contagem-rotulo');
  const contagemNumero = el('div', 'gv-p-contagem-numero');
  const contagemSub = el('div', 'gv-p-contagem-sub');
  contagem.append(contagemRotulo, contagemNumero, contagemSub);
  const flash = el('div', 'gv-p-flash');

  raiz.append(topo, centro, barra, contagem, flash);

  // ---------- A cena, palavra por palavra ----------

  function desenharCena(): void {
    const cena = cenas[indice];
    if (!cena) return;
    nomeCena.replaceChildren(el('span', 'gv-p-cena-n', `Cena ${indice + 1} de ${cenas.length}`), el('strong', '', cena.titulo));
    btnAnterior.disabled = indice <= 0;
    btnProxima.disabled = indice >= cenas.length - 1;
    fala.replaceChildren();
    palavras = [];
    const texto = cena.texto.trim();
    if (!texto) fala.appendChild(el('p', 'gv-p-vazio', 'Esta cena não tem fala.'));
    for (const trecho of falasPorPessoa(texto, sessao.pessoas)) {
      const bloco = el('div', 'gv-p-trecho');
      if (trecho.pessoa) {
        bloco.classList.add('is-pessoa');
        bloco.style.setProperty('--gv-pessoa', COR_PESSOA[trecho.pessoa]);
        // A dois, a fala do outro fica apagada: cada um lê a sua.
        if (conjunta && trecho.pessoa !== conjunta.euSou) bloco.classList.add('is-outro');
        bloco.appendChild(el('span', 'gv-p-quem', sessao.pessoas.find((p) => p.id === trecho.pessoa)?.nome ?? trecho.pessoa));
      }
      trecho.texto
        .split('\n')
        .map((p) => p.replace(/\*\*|__|`/g, '').trim())
        .filter(Boolean)
        .forEach((linha) => {
          const p = el('p', '');
          linha
            .split(/\s+/)
            .filter(Boolean)
            .forEach((palavra, k) => {
              if (k) p.append(' ');
              const span = el('span', 'gv-p-palavra', palavra);
              span.dataset.i = String(palavras.length);
              palavras.push(span);
              p.appendChild(span);
            });
          bloco.appendChild(p);
        });
      fala.appendChild(bloco);
    }
    fala.appendChild(el('div', 'gv-p-folga'));
    ({ inicios, fim: fimCena } = tempoDasPalavras(
      palavras.map((p) => p.textContent ?? ''),
      ppm,
    ));
    // Uma frase acaba no ponto (. ! ? …) ou no fim do parágrafo. Dois-pontos e ponto e vírgula não cortam: picavam demais.
    frases = [];
    palavras.forEach((p, k) => {
      const anterior = palavras[k - 1];
      if (!anterior || anterior.parentElement !== p.parentElement || /[.!?…]["')\]»]*$/.test(anterior.textContent ?? '')) frases.push(k);
    });
    fraseAtual = 0;
    cursor = 0;
    indiceAceso = -2;
    fimDaCenaDesde = null;
    rolagem.scrollTop = 0;
    acender(true);
    desenharControles();
  }

  /** A frase que contém a palavra `i`. */
  function fraseDaPalavra(i: number): number {
    let f = 0;
    for (let k = 0; k < frases.length; k += 1) if (frases[k]! <= i) f = k;
    return f;
  }

  /** O texto está "vivo" (com palavra acesa): no manual sempre; no automático, depois do bipe. */
  function ativo(): boolean {
    return modo === 'manual' || gravando;
  }

  /**
   * Marca dita / da vez / por vir. No automático, pela palavra do cursor; no
   * manual, pela frase inteira. Só mexe nas palavras que mudaram (a cena pode ter
   * centenas): o quadro de animação chama isto 60× por segundo.
   */
  function acender(forcar = false): void {
    if (modo === 'manual') {
      const de = frases[fraseAtual] ?? 0;
      const ate = (frases[fraseAtual + 1] ?? palavras.length) - 1;
      progressoCheio.style.width = `${frases.length ? ((fraseAtual + 1) / frases.length) * 100 : 0}%`;
      if (de === indiceAceso && !forcar) return;
      palavras.forEach((p, k) => {
        p.classList.toggle('is-dita', k < de);
        p.classList.toggle('is-agora', k >= de && k <= ate);
      });
      indiceAceso = de;
      return;
    }
    const i = gravando ? palavraNoInstante(inicios, cursor) : -1;
    progressoCheio.style.width = `${fimCena ? Math.min(100, (cursor / fimCena) * 100) : 0}%`;
    if (i === indiceAceso && !forcar) return;
    const de = Math.max(0, Math.min(i, indiceAceso));
    const ate = forcar ? palavras.length - 1 : Math.max(i, indiceAceso);
    for (let k = forcar ? 0 : de; k <= ate && k < palavras.length; k += 1) {
      const p = palavras[k]!;
      p.classList.toggle('is-dita', gravando && k < i);
      p.classList.toggle('is-agora', gravando && k === i);
    }
    indiceAceso = i;
  }

  /** A palavra da vez fica na altura de leitura; a rolagem chega lá suave, sem pulos. */
  function acompanhar(dt: number): void {
    const atual = palavras[Math.max(0, indiceAceso)];
    if (!atual || !ativo()) return;
    const alvoTopo = atual.offsetTop - rolagem.clientHeight * ALTURA_LEITURA;
    const diferenca = alvoTopo - rolagem.scrollTop;
    if (Math.abs(diferenca) < 1) return;
    // Aproxima uma fração por quadro: rápido quando longe, macio quando perto.
    rolagem.scrollTop += diferenca * Math.min(1, dt * 6);
  }

  function irParaPalavra(i: number): void {
    fraseAtual = fraseDaPalavra(i);
    cursor = inicios[i] ?? 0;
    fimDaCenaDesde = null;
    acender(true);
  }

  /**
   * Uma frase para frente ou para trás. No manual é o único jeito de o texto
   * andar; no automático, acerta quem falou mais rápido ou mais devagar. Passou
   * da última frase: próxima cena (e da primeira, a anterior).
   */
  function passarFrase(delta: number): void {
    if (!palavras.length) return;
    const atual = modo === 'manual' ? fraseAtual : fraseDaPalavra(Math.max(0, palavraNoInstante(inicios, cursor)));
    const nova = atual + delta;
    if (nova >= frases.length) {
      if (indice < cenas.length - 1) trocarCena(1);
      return;
    }
    if (nova < 0) {
      if (indice > 0) {
        trocarCena(-1);
        // Voltando, chega-se ao fim da cena anterior, não ao começo.
        irParaPalavra(frases[frases.length - 1] ?? 0);
      }
      return;
    }
    irParaPalavra(frases[nova]!);
  }

  function desenharControles(): void {
    btnModoAuto.classList.toggle('is-ativo', modo === 'auto');
    btnModoManual.classList.toggle('is-ativo', modo === 'manual');
    btnModoAuto.setAttribute('aria-pressed', String(modo === 'auto'));
    btnModoManual.setAttribute('aria-pressed', String(modo === 'manual'));
    velocidade.hidden = modo !== 'auto';
    ritmoEl.textContent = `${Math.round(ppm * ritmo)} palavras/min`;
    dicaTexto.textContent =
      modo === 'auto'
        ? '+ e − mudam a velocidade · ↑ ↓ pulam uma frase · clique numa palavra para ir até ela'
        : '↓ ou → passa a frase · ↑ ou ← volta · nada anda sozinho';
    rolagem.classList.toggle('is-manual', modo === 'manual');
  }

  /** `delta` em palavras por minuto: é o número que o usuário vê. */
  function mudarRitmo(delta: number): void {
    const alvoPpm = Math.round((ppm * ritmo + delta) / PASSO_PPM) * PASSO_PPM;
    ritmo = Math.min(RITMO_MAX, Math.max(RITMO_MIN, alvoPpm / ppm));
    gravarRitmo(ritmo);
    desenharControles();
  }

  function definirModo(novo: ModoTexto): void {
    if (novo === modo) return;
    // O lugar no texto acompanha a troca: quem estava na frase 5 continua nela.
    if (novo === 'manual') fraseAtual = fraseDaPalavra(Math.max(0, palavraNoInstante(inicios, cursor)));
    else cursor = inicios[frases[fraseAtual] ?? 0] ?? 0;
    modo = novo;
    try {
      localStorage.setItem(CHAVE_MODO, modo);
    } catch {
      // Sem armazenamento local, a escolha vale só até fechar.
    }
    indiceAceso = -2;
    fimDaCenaDesde = null;
    desenharControles();
    desenharEstado();
  }

  // ---------- Estado ----------

  function desenharEstado(): void {
    raiz.classList.toggle('is-gravando', gravando);
    rolagem.classList.toggle('is-correndo', ativo());
    let textoSituacao: string;
    let dica: string;
    if (gravando) {
      textoSituacao = 'Gravando';
      dica = 'Espaço para parar';
    } else if (alvo !== null) {
      textoSituacao = conjunta ? `Começa junto com ${conjunta.parceiro}` : 'Contando';
      dica = conjunta ? '' : 'Espaço cancela';
    } else {
      textoSituacao = ultimaDuracaoMs ? `Parado · ${formatarRelogio(ultimaDuracaoMs)}` : 'Pronto';
      dica = !conjunta
        ? ultimaDuracaoMs
          ? 'Espaço grava de novo'
          : 'Espaço para começar'
        : op.proximoJunto
          ? '"Próximo take junto" combina o início'
          : `Espere o convite de ${conjunta.parceiro}`;
    }
    // Convidado parado: o próximo passo é de quem convidou — a situação diz isso, não só "Pronto".
    if (conjunta && !op.proximoJunto && !gravando && alvo === null) textoSituacao = `Esperando o convite de ${conjunta.parceiro}`;
    situacao.textContent = textoSituacao;
    situacao.classList.toggle('is-gravando', gravando);
    grandeDica.textContent = dica;
    const parado = !gravando && alvo === null;
    btnGravar.firstElementChild!.textContent = gravando ? 'Parar' : alvo !== null ? 'Cancelar' : 'Começar';
    // A dois só existe "Parar": começar e cancelar são do horário combinado, que é dos dois.
    btnGravar.hidden = Boolean(conjunta) && !gravando;
    if (btnJunto) btnJunto.hidden = !parado;
    acender(true);
  }

  // ---------- Relógio e contagem ----------

  function passo(agoraPerf: number): void {
    if (fechado) return;
    if (alvo !== null) tiqueContagem();
    const dt = ultimoQuadro ? Math.min(0.25, (agoraPerf - ultimoQuadro) / 1000) : 0;
    ultimoQuadro = agoraPerf;
    if (gravando) {
      const t = formatarRelogio(agoraPerf - inicioPerf);
      relogio.textContent = t;
      grandeRelogio.textContent = t;
    }
    if (palavras.length && ativo()) {
      // No manual o cursor não anda: só as setas passam o texto.
      if (modo === 'auto') {
        cursor += dt * ritmo;
        acender();
        // Cena terminou: um respiro e passa para a próxima.
        if (cursor >= fimCena) {
          fimDaCenaDesde ??= agoraPerf;
          if (agoraPerf - fimDaCenaDesde > FOLGA_FIM_CENA_S * 1000 && indice < cenas.length - 1) trocarCena(1);
        }
      }
      acompanhar(dt);
    }
    quadro = requestAnimationFrame(passo);
  }

  /** Conta pela hora certa (não por setTimeout): a dois, os dois chegam ao zero juntos. */
  function tiqueContagem(): void {
    if (alvo === null) return;
    const falta = alvo - agoraCerto();
    if (falta <= 0) {
      const em = alvo;
      alvo = null;
      raiz.classList.remove('is-contando');
      if (-falta > TOLERANCIA_ATRASO_MS) {
        // O PC travou ou dormiu no meio: começar agora já não estaria junto.
        mostrarToast('O horário combinado passou sem a contagem terminar. Combine outro início.');
        desenharEstado();
        return;
      }
      claquete();
      comecar(em);
      return;
    }
    raiz.classList.add('is-contando');
    if (falta > CONTAGEM_MS + 400) {
      contagem.classList.add('is-longe');
      contagemRotulo.textContent = 'Começa em';
      contagemNumero.textContent = formatarRelogio(falta + 999);
      contagemSub.textContent = conjunta ? `junto com ${conjunta.parceiro} · já deixe a câmera gravando` : 'já deixe a câmera gravando';
      numeroMostrado = 0;
    } else {
      contagem.classList.remove('is-longe');
      contagemRotulo.textContent = '';
      contagemSub.textContent = 'fale depois do bipe';
      const n = Math.ceil(falta / 1000);
      if (n !== numeroMostrado) {
        numeroMostrado = n;
        contagemNumero.textContent = String(n);
        bipeContagem();
      }
    }
  }

  function agendar(em: number): void {
    if (fechado || gravando) return;
    prepararSom();
    alvo = em;
    numeroMostrado = 0;
    desenharEstado();
  }

  function cancelarContagem(): void {
    alvo = null;
    raiz.classList.remove('is-contando');
    desenharEstado();
  }

  // ---------- Ações ----------

  function claquete(): void {
    bipeClaquete();
    flash.classList.remove('is-ativo');
    // Força o reinício da animação quando a claquete se repete.
    void flash.offsetWidth;
    flash.classList.add('is-ativo');
  }

  function comecar(em: number): void {
    gravando = true;
    // O relógio parte do bipe, mesmo que este quadro tenha chegado uns ms depois.
    inicioPerf = performance.now() - Math.max(0, agoraCerto() - em);
    // No automático o texto recomeça do alto da cena; no manual fica onde o usuário o deixou.
    if (modo === 'auto') {
      cursor = 0;
      fimDaCenaDesde = null;
      rolagem.scrollTop = 0;
    }
    if (conjunta?.proximoInicio) delete conjunta.proximoInicio;
    desenharEstado();
  }

  function parar(): void {
    if (!gravando) return;
    ultimaDuracaoMs = Math.round(performance.now() - inicioPerf);
    gravando = false;
    desenharEstado();
  }

  function alternar(): void {
    if (gravando) parar();
    else if (alvo !== null) {
      // A dois o horário é dos dois: cancelar aqui deixaria o outro gravando sozinho.
      if (!conjunta) cancelarContagem();
    } else if (!conjunta) agendar(agoraCerto() + CONTAGEM_MS);
  }

  function trocarCena(delta: number): void {
    const novo = indice + delta;
    if (novo < 0 || novo >= cenas.length) return;
    indice = novo;
    desenharCena();
  }

  function alternarEspelho(): void {
    espelhado = !espelhado;
    rolagem.classList.toggle('is-espelhado', espelhado);
  }

  async function combinarProximo(): Promise<void> {
    if (!op.proximoJunto || gravando || alvo !== null) return;
    const em = await op.proximoJunto();
    if (em) agendar(em);
  }

  // ---------- Teclado ----------

  function aoTeclar(e: KeyboardEvent): void {
    // Um prompt aberto por cima (nota, convite) recebe as teclas, não o palco.
    if (!estaNoTopo(raiz) || e.ctrlKey || e.altKey || e.metaKey) return;
    const manual = modo === 'manual';
    const acoes: Record<string, () => void> = {
      ' ': alternar,
      a: () => definirModo(manual ? 'auto' : 'manual'),
      c: () => claquete(),
      m: alternarEspelho,
      // ↑ e ↓ passam frase nos dois modos. ← e → trocam de cena no automático;
      // no manual também passam frase (quem passa texto pensa em "próximo", como num slide).
      arrowdown: () => passarFrase(1),
      arrowup: () => passarFrase(-1),
      arrowright: () => (manual ? passarFrase(1) : trocarCena(1)),
      arrowleft: () => (manual ? passarFrase(-1) : trocarCena(-1)),
      pagedown: () => trocarCena(1),
      pageup: () => trocarCena(-1),
      '+': () => mudarRitmo(PASSO_PPM),
      '=': () => mudarRitmo(PASSO_PPM),
      '-': () => mudarRitmo(-PASSO_PPM),
    };
    const acao = acoes[e.key.toLowerCase()];
    if (!acao) return;
    e.preventDefault();
    acao();
  }

  // ---------- Abrir e fechar ----------

  const desempilhar = empilharCamada(raiz, () => fechar());

  function fechar(): void {
    if (fechado) return;
    gravando = false;
    fechado = true;
    cancelAnimationFrame(quadro);
    desempilhar();
    document.removeEventListener('keydown', aoTeclar, true);
    raiz.remove();
    op.fechou(sessao);
  }

  document.addEventListener('keydown', aoTeclar, true);
  document.body.appendChild(raiz);
  if (cenas.length) desenharCena();
  desenharEstado();
  quadro = requestAnimationFrame(passo);
  // Convite com horário ainda por vir: o palco já abre contando.
  const proximo = conjunta?.proximoInicio;
  if (proximo && proximo > agoraCerto() - TOLERANCIA_ATRASO_MS) agendar(proximo);

  return {
    agendar,
    sessaoId: sessao.id,
    get aberto() {
      return !fechado;
    },
  };
}
