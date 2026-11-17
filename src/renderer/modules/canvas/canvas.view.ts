import {
  CORES_CANVAS,
  ESTILO_PADRAO,
  FORMAS_DE_CAIXA,
  type CanvasFile,
  type CorCanvas,
  type EstiloForma,
  type FormaCanvas,
  type QuadroCanvas,
} from '../../../shared/types/canvas.types.js';
import { comAtalho, ligarAtalhos } from '../../core/atalhos.js';
import { abrirTutorial, consumirItemPendente } from '../../core/navegacao.js';
import { abrirMenu } from '../../ui/menu.js';
import { mensagemDeErro, openAvisoModal, openConfirmModal, promptText } from '../../ui/modal.js';
import { svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { criarPalco, type Ferramenta, type Palco } from './canvas.palco.js';
import * as canvasState from './canvas.state.js';

/**
 * Canvas — a lousa infinita. A tela é o palco inteiro, com as peças flutuando por
 * cima (como no tldraw): o quadro e as ações no topo, as ferramentas embaixo, o
 * estilo à direita e o zoom no canto.
 */

const I = {
  selecionar: '<path d="M4 3l7.5 18 2.4-7.6L21.5 11z"/>',
  mao: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  desenho: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  borracha: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  seta: '<path d="M5 19 19 5"/><path d="M9 5h10v10"/>',
  linha: '<path d="M5 19 19 5"/>',
  retangulo: '<rect x="3" y="5" width="18" height="14" rx="2"/>',
  elipse: '<ellipse cx="12" cy="12" rx="9.5" ry="7.5"/>',
  losango: '<path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/>',
  triangulo: '<path d="M12 3.5 21.5 20h-19z"/>',
  texto: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  nota: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2z"/><path d="M14 21v-5a2 2 0 0 1 2-2h5"/>',
  desfazer: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  refazer: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/>',
  menos: '<path d="M5 12h14"/>',
  mais: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  ajustar: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  exportar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  baixo: '<path d="m6 9 6 6 6-6"/>',
  quadro: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
  duplicar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  lixeira: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  editar: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  frente: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  tras: '<rect x="3" y="3" width="13" height="13" rx="2"/><path d="M20 8v11a1 1 0 0 1-1 1H8"/>',
  ajuda: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  pontaInicio: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  pontaFim: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
} as const;

const FERRAMENTAS: ReadonlyArray<{ id: Ferramenta; rotulo: string; atalho: string }> = [
  { id: 'selecionar', rotulo: 'Selecionar', atalho: 'canvas.selecionar' },
  { id: 'mao', rotulo: 'Mão', atalho: 'canvas.mao' },
  { id: 'desenho', rotulo: 'Desenho à mão', atalho: 'canvas.desenho' },
  { id: 'borracha', rotulo: 'Borracha', atalho: 'canvas.borracha' },
  { id: 'seta', rotulo: 'Seta', atalho: 'canvas.seta' },
  { id: 'texto', rotulo: 'Texto', atalho: 'canvas.texto' },
  { id: 'nota', rotulo: 'Nota', atalho: 'canvas.nota' },
  { id: 'retangulo', rotulo: 'Retângulo', atalho: 'canvas.retangulo' },
  { id: 'elipse', rotulo: 'Elipse', atalho: 'canvas.elipse' },
  { id: 'losango', rotulo: 'Losango', atalho: 'canvas.losango' },
  { id: 'triangulo', rotulo: 'Triângulo', atalho: '' },
  { id: 'linha', rotulo: 'Linha', atalho: 'canvas.linha' },
];

const NOME_COR: Record<CorCanvas, string> = {
  tinta: 'Preto',
  cinza: 'Cinza',
  vermelho: 'Vermelho',
  laranja: 'Laranja',
  amarelo: 'Amarelo',
  verde: 'Verde',
  azul: 'Azul',
  violeta: 'Violeta',
  rosa: 'Rosa',
};

const CHAVE_ESTILO = 'iris.canvas.estilo';

let raiz: HTMLElement | null = null;
let palco: Palco | null = null;
let quadroAberto: string | null = null;
let desligarAtalhos: (() => void) | null = null;
let estilo: EstiloForma = lerEstilo();
let selecaoAtual: FormaCanvas[] = [];
let ferramentaAtual: Ferramenta = 'selecionar';

function lerEstilo(): EstiloForma {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_ESTILO) ?? 'null') as Partial<EstiloForma> | null;
    return { ...ESTILO_PADRAO, ...(salvo ?? {}) };
  } catch {
    return { ...ESTILO_PADRAO };
  }
}

function guardarEstilo(): void {
  try {
    localStorage.setItem(CHAVE_ESTILO, JSON.stringify(estilo));
  } catch {
    // sem armazenamento: o estilo só não é lembrado
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function botaoIcone(icone: string, titulo: string, fazer: () => void, classe = 'cv-icone'): HTMLButtonElement {
  const b = el('button', classe);
  b.type = 'button';
  b.title = titulo;
  b.setAttribute('aria-label', titulo);
  b.innerHTML = svg(icone, 18, 1.8);
  b.addEventListener('click', fazer);
  return b;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

// ---------- Ciclo de vida ----------

export function montar(viewRoot: HTMLElement): void {
  raiz = viewRoot;
  canvasState.onStateChange((file) => desenhar(file));
  desligarAtalhos = ligarAtalhos({
    ...Object.fromEntries(FERRAMENTAS.filter((f) => f.atalho).map((f) => [f.atalho, () => palco?.usarFerramenta(f.id)])),
    'canvas.ajustar': () => palco?.ajustar(),
    'canvas.novoQuadro': () => void novoQuadro(),
  });
  void canvasState.load().catch(falhou);
}

export function destroy(): void {
  desligarAtalhos?.();
  desligarAtalhos = null;
  palco?.destruir();
  palco = null;
  quadroAberto = null;
  canvasState.offStateChange();
  raiz = null;
}

// ---------- Quadros ----------

function quadroAtivo(file: CanvasFile): QuadroCanvas {
  return file.quadros.find((q) => q.id === file.quadroAtivoId) ?? file.quadros[0]!;
}

async function novoQuadro(): Promise<void> {
  const nome = await promptText('Novo quadro', 'Nome do quadro', '', { icone: I.quadro });
  if (nome === null) return;
  palco?.descarregar();
  await canvasState.criarQuadro(nome || 'Sem nome').catch(falhou);
}

function abrirMenuQuadros(ancora: HTMLElement, file: CanvasFile): void {
  const atual = quadroAtivo(file);
  abrirMenu(
    ancora,
    [
      { rotulo: 'Quadros', nota: true },
      ...file.quadros.map((q) => ({
        rotulo: `${q.nome}${q.formas.length ? ` · ${q.formas.length}` : ''}`,
        marcado: q.id === atual.id,
        fazer: () => {
          if (q.id === atual.id) return;
          palco?.descarregar();
          void canvasState.escolherQuadro(q.id).catch(falhou);
        },
      })),
      'separador',
      { rotulo: 'Novo quadro', icone: I.mais, fazer: () => void novoQuadro() },
      {
        rotulo: 'Renomear',
        icone: I.editar,
        fazer: async () => {
          const nome = await promptText('Renomear quadro', 'Nome do quadro', atual.nome, { icone: I.quadro });
          if (nome) {
            palco?.descarregar();
            await canvasState.renomearQuadro(atual.id, nome).catch(falhou);
          }
        },
      },
      {
        rotulo: 'Duplicar',
        icone: I.duplicar,
        fazer: () => {
          palco?.descarregar();
          // Espera o salvamento em curso: a cópia sai do arquivo.
          setTimeout(() => void canvasState.duplicarQuadro(atual.id).catch(falhou), 150);
        },
      },
      {
        rotulo: 'Excluir quadro',
        icone: I.lixeira,
        perigo: true,
        fazer: async () => {
          const ok = await openConfirmModal({
            title: `Excluir "${atual.nome}"?`,
            message: `${atual.formas.length ? `As ${atual.formas.length} formas dele vão junto. ` : ''}Dá para desfazer com Alt+Z logo depois.`,
            confirmText: 'Excluir',
          });
          if (ok) await canvasState.excluirQuadro(atual.id).catch(falhou);
        },
      },
    ],
    { alinhar: 'esquerda' },
  );
}

// ---------- Exportar ----------

async function exportar(formato: 'png' | 'svg', nome: string): Promise<void> {
  if (!palco) return;
  try {
    const dados = await palco.exportar(formato);
    if (!dados) {
      mostrarToast('O quadro está vazio — nada para exportar.');
      return;
    }
    const r = await window.irisAPI.canvas.exportarImagem({ formato, nomeSugerido: nome, dados });
    if (!r.ok) throw new Error(r.error);
    const caminho = r.data;
    if (caminho) {
      mostrarToast(`Imagem salva (${formato.toUpperCase()}).`, [{ rotulo: 'Mostrar na pasta', fazer: () => void window.irisAPI.canvas.mostrarExportado(caminho) }]);
    }
  } catch (erro) {
    falhou(erro);
  }
}

// ---------- Painel de estilo ----------

function grupo(titulo: string, conteudo: HTMLElement): HTMLElement {
  const g = el('div', 'cv-estilo-grupo');
  g.append(el('span', 'cv-estilo-titulo', titulo), conteudo);
  return g;
}

function opcoesEm<T extends string>(opcoes: Array<{ id: T; rotulo: string; icone: string }>, atual: T | null, escolher: (v: T) => void): HTMLElement {
  const linha = el('div', 'cv-estilo-opcoes');
  opcoes.forEach((o) => {
    const b = el('button', `cv-estilo-opcao${o.id === atual ? ' is-ativa' : ''}`);
    b.type = 'button';
    b.title = o.rotulo;
    b.setAttribute('aria-label', o.rotulo);
    b.setAttribute('aria-pressed', String(o.id === atual));
    b.innerHTML = o.icone;
    b.addEventListener('click', () => escolher(o.id));
    linha.appendChild(b);
  });
  return linha;
}

/** O valor comum da seleção (ou o estilo atual); null quando a seleção mistura. */
function valorComum<K extends keyof EstiloForma>(chave: K): EstiloForma[K] | null {
  if (!selecaoAtual.length) return estilo[chave];
  const primeiro = selecaoAtual[0]!.estilo[chave];
  return selecaoAtual.every((f) => f.estilo[chave] === primeiro) ? primeiro : null;
}

function mudarEstilo(parcial: Partial<EstiloForma>): void {
  estilo = { ...estilo, ...parcial };
  guardarEstilo();
  palco?.aplicarEstilo(parcial);
  desenharEstilo();
}

function desenharEstilo(): void {
  const painel = raiz?.querySelector<HTMLElement>('.cv-estilo');
  if (!painel) return;
  const mostrar = selecaoAtual.length > 0 || !['selecionar', 'mao', 'borracha'].includes(ferramentaAtual);
  painel.hidden = !mostrar;
  if (!mostrar) return;
  painel.replaceChildren();

  const cores = el('div', 'cv-cores');
  const corAtual = valorComum('cor');
  CORES_CANVAS.forEach((c) => {
    const b = el('button', `cv-cor${c === corAtual ? ' is-ativa' : ''}`);
    b.type = 'button';
    b.title = NOME_COR[c];
    b.setAttribute('aria-label', NOME_COR[c]);
    b.setAttribute('aria-pressed', String(c === corAtual));
    b.style.setProperty('--c', `var(--cv-${c})`);
    b.addEventListener('click', () => mudarEstilo({ cor: c }));
    cores.appendChild(b);
  });
  painel.appendChild(cores);

  const tipos = new Set(selecaoAtual.map((f) => f.tipo));
  const ehCaixa = selecaoAtual.length ? selecaoAtual.some((f) => ['retangulo', 'elipse', 'losango', 'triangulo'].includes(f.tipo)) : ['retangulo', 'elipse', 'losango', 'triangulo'].includes(ferramentaAtual);
  const temTraco = selecaoAtual.length ? selecaoAtual.some((f) => f.tipo !== 'texto' && f.tipo !== 'nota') : !['texto', 'nota'].includes(ferramentaAtual);
  const temTexto = selecaoAtual.length ? selecaoAtual.some((f) => FORMAS_DE_CAIXA.includes(f.tipo)) : ['texto', 'nota', 'retangulo', 'elipse', 'losango', 'triangulo'].includes(ferramentaAtual);

  if (ehCaixa) {
    painel.appendChild(
      grupo(
        'Preenchimento',
        opcoesEm(
          [
            { id: 'nenhum', rotulo: 'Sem preenchimento', icone: '<span class="cv-amostra is-vazio"></span>' },
            { id: 'suave', rotulo: 'Suave', icone: '<span class="cv-amostra is-suave"></span>' },
            { id: 'solido', rotulo: 'Sólido', icone: '<span class="cv-amostra is-solido"></span>' },
          ],
          valorComum('preenchimento'),
          (v) => mudarEstilo({ preenchimento: v }),
        ),
      ),
    );
  }
  if (temTraco) {
    painel.appendChild(
      grupo(
        'Traço',
        opcoesEm(
          [
            { id: 'fino', rotulo: 'Fino', icone: svg('<path d="M5 12h14"/>', 18, 1.5) },
            { id: 'medio', rotulo: 'Médio', icone: svg('<path d="M5 12h14"/>', 18, 3) },
            { id: 'grosso', rotulo: 'Grosso', icone: svg('<path d="M5 12h14"/>', 18, 5) },
          ],
          valorComum('traco'),
          (v) => mudarEstilo({ traco: v }),
        ),
      ),
    );
    if (!(tipos.size === 1 && tipos.has('desenho')) && ferramentaAtual !== 'desenho') {
      painel.appendChild(
        grupo(
          'Linha',
          opcoesEm(
            [
              { id: 'solido', rotulo: 'Contínua', icone: svg('<path d="M4 12h16"/>', 18, 2.2) },
              { id: 'tracejado', rotulo: 'Tracejada', icone: svg('<path d="M4 12h4"/><path d="M10 12h4"/><path d="M16 12h4"/>', 18, 2.2) },
              { id: 'pontilhado', rotulo: 'Pontilhada', icone: svg('<path d="M5 12h.01"/><path d="M9.5 12h.01"/><path d="M14.5 12h.01"/><path d="M19 12h.01"/>', 18, 3) },
            ],
            valorComum('tracejado'),
            (v) => mudarEstilo({ tracejado: v }),
          ),
        ),
      );
    }
  }
  if (temTexto) {
    painel.appendChild(
      grupo(
        'Texto',
        opcoesEm(
          [
            { id: 'p', rotulo: 'Pequeno', icone: '<span class="cv-letra is-p">A</span>' },
            { id: 'm', rotulo: 'Médio', icone: '<span class="cv-letra is-m">A</span>' },
            { id: 'g', rotulo: 'Grande', icone: '<span class="cv-letra is-g">A</span>' },
            { id: 'gg', rotulo: 'Enorme', icone: '<span class="cv-letra is-gg">A</span>' },
          ],
          valorComum('tamanhoTexto'),
          (v) => mudarEstilo({ tamanhoTexto: v }),
        ),
      ),
    );
  }
  const setas = selecaoAtual.filter((f) => f.tipo === 'seta');
  if (setas.length) {
    const pontas = el('div', 'cv-estilo-opcoes');
    const ini = setas.every((f) => f.pontaInicio);
    const fim = setas.every((f) => f.pontaFim !== false);
    [
      { rotulo: 'Ponta no começo', icone: I.pontaInicio, ativa: ini, qual: 'inicio' as const },
      { rotulo: 'Ponta no fim', icone: I.pontaFim, ativa: fim, qual: 'fim' as const },
    ].forEach((p) => {
      const b = el('button', `cv-estilo-opcao${p.ativa ? ' is-ativa' : ''}`);
      b.type = 'button';
      b.title = p.rotulo;
      b.setAttribute('aria-pressed', String(p.ativa));
      b.innerHTML = svg(p.icone, 18, 2);
      b.addEventListener('click', () => palco?.alternarPonta(p.qual));
      pontas.appendChild(b);
    });
    painel.appendChild(grupo('Pontas', pontas));
  }

  if (selecaoAtual.length) {
    const acoes = el('div', 'cv-estilo-opcoes is-acoes');
    acoes.append(
      botaoIcone(I.frente, 'Trazer para frente ( ] )', () => palco?.ordem('frente'), 'cv-estilo-opcao'),
      botaoIcone(I.tras, 'Mandar para trás ( [ )', () => palco?.ordem('tras'), 'cv-estilo-opcao'),
      botaoIcone(I.duplicar, 'Duplicar (Ctrl+D)', () => palco?.duplicarSelecao(), 'cv-estilo-opcao'),
      botaoIcone(I.lixeira, 'Apagar (Delete)', () => palco?.apagarSelecao(), 'cv-estilo-opcao is-perigo'),
    );
    painel.appendChild(grupo(selecaoAtual.length === 1 ? 'Forma' : `${selecaoAtual.length} formas`, acoes));
  }
}

// ---------- Tela ----------

function desenhar(file: CanvasFile): void {
  if (!raiz) return;
  const quadro = quadroAtivo(file);

  // O mesmo quadro já aberto: só o topo muda (nome, lista) — o palco segue com o gesto.
  if (palco && quadroAberto === quadro.id && raiz.querySelector('.cv-view')) {
    const nome = raiz.querySelector<HTMLElement>('.cv-quadro-nome');
    if (nome) nome.textContent = quadro.nome;
    return;
  }

  palco?.destruir();
  quadroAberto = quadro.id;
  const view = el('div', 'cv-view');

  palco = criarPalco({
    quadro,
    estilo,
    aoSalvar: (q) => void canvasState.salvarQuadro(q).catch(falhou),
    aoViewport: (v) => void canvasState.salvarViewport(quadro.id, v).catch(() => undefined),
    aoMudarSelecao: (formas) => {
      selecaoAtual = formas;
      desenharEstilo();
    },
    aoMudarFerramenta: (f) => {
      ferramentaAtual = f;
      view.querySelectorAll<HTMLElement>('.cv-ferramenta').forEach((b) => {
        const ativa = b.dataset.ferramenta === f;
        b.classList.toggle('is-ativa', ativa);
        b.setAttribute('aria-pressed', String(ativa));
      });
      desenharEstilo();
    },
    aoMudarVista: (zoom) => {
      const pct = view.querySelector<HTMLElement>('.cv-zoom-pct');
      if (pct) pct.textContent = `${Math.round(zoom * 100)}%`;
    },
    aoMudarHistorico: (podeDesfazer, podeRefazer) => {
      const d = view.querySelector<HTMLButtonElement>('[data-acao="desfazer"]');
      const r = view.querySelector<HTMLButtonElement>('[data-acao="refazer"]');
      if (d) d.disabled = !podeDesfazer;
      if (r) r.disabled = !podeRefazer;
      view.classList.toggle('is-vazio', !quadroTemFormas());
    },
  });
  view.appendChild(palco.el);

  // Topo à esquerda: o quadro.
  const topoEsq = el('div', 'cv-flutua cv-topo-esq');
  const seletor = el('button', 'cv-quadro');
  seletor.type = 'button';
  seletor.innerHTML = svg(I.quadro, 16, 1.8);
  seletor.append(el('span', 'cv-quadro-nome', quadro.nome), Object.assign(el('span', 'cv-quadro-seta'), { innerHTML: svg(I.baixo, 14, 2) }));
  seletor.title = 'Trocar de quadro, criar, renomear…';
  seletor.addEventListener('click', () => {
    const f = canvasState.getCurrentState();
    if (f) abrirMenuQuadros(seletor, f);
  });
  topoEsq.appendChild(seletor);
  view.appendChild(topoEsq);

  // Topo à direita: desfazer, exportar, ajuda.
  const topoDir = el('div', 'cv-flutua cv-topo-dir');
  const desfazer = botaoIcone(I.desfazer, 'Desfazer (Ctrl+Z)', () => palco?.desfazer());
  desfazer.dataset.acao = 'desfazer';
  const refazer = botaoIcone(I.refazer, 'Refazer (Ctrl+Shift+Z)', () => palco?.refazer());
  refazer.dataset.acao = 'refazer';
  const exportarBtn = botaoIcone(I.exportar, 'Exportar imagem', () =>
    abrirMenu(exportarBtn, [
      { rotulo: palco?.temSelecao() ? 'Exportar a seleção' : 'Exportar o quadro', nota: true },
      { rotulo: 'Imagem PNG', icone: I.exportar, fazer: () => void exportar('png', quadro.nome) },
      { rotulo: 'Vetor SVG', icone: I.exportar, fazer: () => void exportar('svg', quadro.nome) },
    ]),
  );
  topoDir.append(desfazer, refazer, el('span', 'cv-separador'), exportarBtn, botaoIcone(I.ajuda, 'Como usar o Canvas', () => abrirTutorial('canvas')));
  view.appendChild(topoDir);

  // Ferramentas embaixo.
  const barra = el('div', 'cv-flutua cv-ferramentas');
  barra.setAttribute('role', 'toolbar');
  barra.setAttribute('aria-label', 'Ferramentas');
  FERRAMENTAS.forEach((f, i) => {
    if (i === 4 || i === 7) barra.appendChild(el('span', 'cv-separador'));
    const b = el('button', `cv-ferramenta${f.id === ferramentaAtual ? ' is-ativa' : ''}`);
    b.type = 'button';
    b.dataset.ferramenta = f.id;
    b.title = f.atalho ? comAtalho(f.rotulo, f.atalho) : f.rotulo;
    b.setAttribute('aria-label', f.rotulo);
    b.setAttribute('aria-pressed', String(f.id === ferramentaAtual));
    b.innerHTML = svg(I[f.id], 19, 1.8);
    b.addEventListener('click', () => {
      palco?.usarFerramenta(f.id);
      palco?.el.focus({ preventScroll: true });
    });
    barra.appendChild(b);
  });
  view.appendChild(barra);

  // Zoom no canto.
  const zoom = el('div', 'cv-flutua cv-zoom');
  const pct = el('button', 'cv-zoom-pct', '100%');
  pct.type = 'button';
  pct.title = 'Voltar para 100%';
  pct.addEventListener('click', () => palco?.zoomPara(1));
  zoom.append(botaoIcone(I.menos, 'Diminuir', () => palco?.zoomRelativo(1 / 1.25)), pct, botaoIcone(I.mais, 'Aumentar', () => palco?.zoomRelativo(1.25)), botaoIcone(I.ajustar, comAtalho('Ver tudo', 'canvas.ajustar'), () => palco?.ajustar()));
  view.appendChild(zoom);

  // Estilo à direita.
  const estiloPainel = el('div', 'cv-flutua cv-estilo');
  estiloPainel.hidden = true;
  view.appendChild(estiloPainel);

  // Dica do quadro vazio.
  const dica = el('div', 'cv-dica');
  dica.append(el('strong', undefined, 'Quadro em branco'), el('span', undefined, 'Escolha uma ferramenta embaixo — ou dê dois cliques para escrever.'));
  view.appendChild(dica);

  raiz.replaceChildren(view);
  selecaoAtual = [];
  view.classList.toggle('is-vazio', quadro.formas.length === 0);
  palco.usarFerramenta(ferramentaAtual === 'mao' || ferramentaAtual === 'desenho' ? ferramentaAtual : 'selecionar');

  // Busca global: abre o quadro certo e vai até a forma.
  const pedido = consumirItemPendente('canvas', (p) => file.quadros.some((q) => q.id === p.dentro));
  if (pedido && pedido.dentro && pedido.dentro !== quadro.id) {
    void canvasState.escolherQuadro(pedido.dentro).then(() => {
      requestAnimationFrame(() => palco?.focarForma(pedido.id));
    }).catch(falhou);
    return;
  }
  requestAnimationFrame(() => {
    if (pedido) palco?.focarForma(pedido.id);
    else if (quadro.viewport.x === 0 && quadro.viewport.y === 0 && quadro.viewport.zoom === 1) palco?.ajustar();
    palco?.el.focus({ preventScroll: true });
  });
}

function quadroTemFormas(): boolean {
  return Boolean(raiz?.querySelector('.cv-formas > *'));
}
