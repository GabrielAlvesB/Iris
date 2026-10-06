import * as tutorialState from './tutorial.state.js';
import type { TutorialViewState } from './tutorial.state.js';
import { GUIAS } from './tutorial.content.js';
import type { Bloco, EstadoPasso, Guia, GrupoGuia, Passo } from './tutorial.types.js';
import { ICONES, buildBotao, buildBusca, buildCabecalho, buildSelo, buildVazio, focarBusca, svg } from '../../ui/pagina.js';
import { ICONE_DO_MODULO } from '../../core/sidebar.js';
import { abrirAjustes, abrirModulo } from '../../core/navegacao.js';
import { CATEGORIAS, MODULOS } from '../../../shared/types/modulos.types.js';

/**
 * Tutorial em três telas dentro da mesma moldura: o Início (o mapa de tudo),
 * um guia aberto e os resultados da busca. O índice à esquerda é fixo nas
 * três, para ninguém se perder ao pular de um guia para outro.
 */

const ICONE_DICA = ICONE_DO_MODULO.pensamentos;
const ICONE_SETA = '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';
const ICONE_VOLTA = '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>';
const ICONE_INICIO = '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>';
const ICONE_RELOGIO = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
const ICONE_PASSOS = '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>';

const ROTULO_DO_GRUPO: Record<GrupoGuia, string> = {
  comecar: 'Comece aqui',
  conectar: 'Conexões',
  dia: 'Dia a dia',
  ...(Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.rotulo])) as Record<(typeof CATEGORIAS)[number]['id'], string>),
  app: 'O app',
};

/** Ordem dos grupos no índice e no Início. 'sistema' fica vazio: seus guias são as conexões. */
const ORDEM_GRUPOS: GrupoGuia[] = ['comecar', 'conectar', 'dia', 'conteudo', 'arquivos', 'trafego', 'app'];

const DESCRICAO_DO_GRUPO: Partial<Record<GrupoGuia, string>> = {
  conectar: 'Passo a passo para ligar o Iris a outros serviços. As marcas de feito vêm da sua configuração real.',
  dia: 'Tarefas e checklists do dia a dia.',
  conteudo: 'Da pauta à publicação, e do resultado ao relatório.',
  arquivos: 'Materiais, ideias e atalhos à mão.',
  trafego: 'Anúncios e o retorno de cada campanha.',
  app: 'O que vale para o app inteiro.',
};

function iconeDoGuia(guia: Guia): string {
  return guia.icone ?? (guia.modulo ? ICONE_DO_MODULO[guia.modulo] : ICONES.tutorial);
}

function estadoDoPasso(state: TutorialViewState, passo: Passo): EstadoPasso {
  return state.estados[passo.id] ?? (passo.verificar ? 'desconhecido' : 'manual');
}

/**
 * Passos verificáveis e obrigatórios (as alternativas não contam). Só as
 * conexões têm progresso: num guia de área, "0 de 1" fazia a leitura parecer
 * uma configuração por fazer — lá o selo fica só no próprio passo.
 */
function progresso(state: TutorialViewState, guia: Guia): { feitos: number; total: number } {
  if (guia.grupo !== 'conectar') return { feitos: 0, total: 0 };
  const contam = guia.passos.filter((p) => p.verificar && !p.opcional);
  return { feitos: contam.filter((p) => state.estados[p.id] === 'ok').length, total: contam.length };
}

function textoDoBloco(bloco: Bloco): string {
  switch (bloco.tipo) {
    case 'texto':
    case 'aviso':
      return bloco.texto;
    case 'lista':
      return bloco.itens.join(' ');
    case 'comando':
      return `${bloco.comando} ${bloco.legenda ?? ''}`;
    case 'atalhos':
      return bloco.itens.map((i) => `${i.teclas.join(' ')} ${i.texto}`).join(' ');
    case 'link':
    case 'abrir':
      return bloco.rotulo;
  }
}

/** Minutos de leitura a ~200 palavras por minuto; nunca menos de 1. */
function minutosDeLeitura(guia: Guia): number {
  const texto = [guia.resumo, ...guia.passos.flatMap((p) => [p.titulo, ...p.blocos.map(textoDoBloco)])].join(' ');
  return Math.max(1, Math.round(texto.split(/\s+/).length / 200));
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function icone(path: string, classe: string, tamanho = 18): HTMLElement {
  const span = el('span', classe);
  span.innerHTML = svg(path, tamanho);
  return span;
}

// ---------- Blocos ----------

function buildBloco(bloco: Bloco): HTMLElement {
  switch (bloco.tipo) {
    case 'comando': {
      const wrap = el('div', 'tut-comando');
      const linha = el('div', 'tut-comando-linha');
      linha.append(el('span', 'tut-comando-prompt', '$'), el('code', undefined, bloco.comando));
      const copiar = el('button', 'tut-copiar');
      copiar.type = 'button';
      copiar.title = 'Copiar comando';
      const rotular = (copiado: boolean): void => {
        copiar.classList.toggle('is-copiado', copiado);
        copiar.innerHTML = svg(copiado ? ICONES.check : ICONES.copiar, 13, copiado ? 2.4 : 1.8);
        copiar.appendChild(el('span', undefined, copiado ? 'Copiado' : 'Copiar'));
      };
      rotular(false);
      copiar.addEventListener('click', () => {
        window.irisAPI.system.copyToClipboard(bloco.comando);
        rotular(true);
        setTimeout(() => rotular(false), 1400);
      });
      linha.appendChild(copiar);
      wrap.appendChild(linha);
      if (bloco.legenda) wrap.appendChild(el('span', 'tut-comando-legenda', bloco.legenda));
      return wrap;
    }
    case 'lista': {
      const lista = el(bloco.numerada ? 'ol' : 'ul', `tut-lista${bloco.numerada ? ' is-numerada' : ''}`);
      bloco.itens.forEach((item) => lista.appendChild(el('li', undefined, item)));
      return lista;
    }
    case 'aviso': {
      const aviso = el('div', `tut-aviso is-${bloco.nivel}`);
      const marca = bloco.nivel === 'atencao' ? ICONES.alerta : bloco.nivel === 'dica' ? ICONE_DICA : ICONES.info;
      aviso.appendChild(icone(marca, 'tut-aviso-icone', 15));
      const corpo = el('div', 'tut-aviso-corpo');
      corpo.append(el('strong', undefined, bloco.nivel === 'atencao' ? 'Atenção' : bloco.nivel === 'dica' ? 'Dica' : 'Bom saber'), el('span', undefined, bloco.texto));
      aviso.appendChild(corpo);
      return aviso;
    }
    case 'link': {
      const link = el('button', 'tut-acao');
      link.type = 'button';
      link.innerHTML = svg(ICONES.externo, 13);
      link.appendChild(el('span', undefined, bloco.rotulo));
      link.addEventListener('click', () => window.irisAPI.system.openExternalLink(bloco.url));
      return link;
    }
    case 'abrir': {
      const botao = el('button', 'tut-acao is-interna');
      botao.type = 'button';
      botao.appendChild(el('span', undefined, bloco.rotulo));
      botao.insertAdjacentHTML('beforeend', svg(ICONE_SETA, 13, 2));
      botao.addEventListener('click', () => {
        if (bloco.ajustes) abrirAjustes(bloco.ajustes);
        else if (bloco.modulo) abrirModulo(bloco.modulo);
      });
      return botao;
    }
    case 'atalhos': {
      const lista = el('div', 'tut-atalhos');
      bloco.itens.forEach((item) => {
        const linha = el('div', 'tut-atalho');
        const teclas = el('span', 'tut-teclas');
        item.teclas.forEach((t, i) => {
          if (i > 0) teclas.appendChild(el('span', 'tut-mais', '+'));
          teclas.appendChild(el('kbd', undefined, t));
        });
        linha.append(teclas, el('span', 'tut-atalho-texto', item.texto));
        lista.appendChild(linha);
      });
      return lista;
    }
    case 'texto':
      return el('p', 'tut-texto', bloco.texto);
  }
}

// ---------- Índice lateral ----------

function buildItemIndice(state: TutorialViewState, guia: Guia): HTMLElement {
  const item = el('button', `tut-indice-item${state.guiaAtivo === guia.id && !state.busca ? ' is-ativo' : ''}`);
  item.type = 'button';
  item.appendChild(icone(iconeDoGuia(guia), 'tut-indice-icone', 15));
  item.appendChild(el('span', 'tut-indice-nome', guia.titulo));
  const { feitos, total } = progresso(state, guia);
  if (total > 0) {
    const completo = feitos === total;
    const marca = el('span', `tut-indice-marca${completo ? ' is-ok' : ''}`);
    if (completo) {
      marca.innerHTML = svg(ICONES.check, 11, 2.8);
      marca.title = 'Tudo configurado';
    } else {
      marca.textContent = `${feitos}/${total}`;
      marca.title = `${feitos} de ${total} passos configurados`;
    }
    item.appendChild(marca);
  }
  item.addEventListener('click', () => tutorialState.abrirGuia(guia.id));
  return item;
}

function buildIndice(state: TutorialViewState): HTMLElement {
  const nav = el('nav', 'tut-indice');
  nav.setAttribute('aria-label', 'Guias do tutorial');

  const inicio = el('button', `tut-indice-item is-inicio${state.guiaAtivo === null && !state.busca ? ' is-ativo' : ''}`);
  inicio.type = 'button';
  inicio.append(icone(ICONE_INICIO, 'tut-indice-icone', 15), el('span', 'tut-indice-nome', 'Início'));
  inicio.addEventListener('click', () => tutorialState.irParaInicio());
  nav.appendChild(inicio);

  ORDEM_GRUPOS.forEach((grupo) => {
    const guias = GUIAS.filter((g) => g.grupo === grupo);
    if (!guias.length) return;
    nav.appendChild(el('span', 'tut-indice-grupo', ROTULO_DO_GRUPO[grupo]));
    guias.forEach((g) => nav.appendChild(buildItemIndice(state, g)));
  });
  return nav;
}

// ---------- Início ----------

function buildAnel(feitos: number, total: number): HTMLElement {
  const fracao = total > 0 ? feitos / total : 0;
  const raio = 30;
  const circ = 2 * Math.PI * raio;
  const anel = el('div', `tut-anel${total > 0 && feitos === total ? ' is-completo' : ''}`);
  anel.setAttribute('role', 'img');
  anel.setAttribute('aria-label', `${feitos} de ${total} passos de conexão configurados`);
  anel.innerHTML = `<svg viewBox="0 0 72 72" width="88" height="88" aria-hidden="true"><circle class="tut-anel-fundo" cx="36" cy="36" r="${raio}"/><circle class="tut-anel-valor" cx="36" cy="36" r="${raio}" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - fracao)}"/></svg>`;
  const centro = el('div', 'tut-anel-centro');
  centro.append(el('strong', undefined, `${Math.round(fracao * 100)}%`), el('span', undefined, 'conexões'));
  anel.appendChild(centro);
  return anel;
}

function buildHero(state: TutorialViewState): HTMLElement {
  const hero = el('section', 'tut-hero');
  const textos = el('div', 'tut-hero-textos');
  textos.append(
    el('span', 'tut-sobretitulo', 'Central de ajuda'),
    el('h2', 'tut-hero-titulo', 'Aprenda o Iris no seu ritmo'),
    el(
      'p',
      'tut-hero-texto',
      'Um guia curto para cada área do app, com o caminho do primeiro uso e os atalhos que fazem diferença. Nos guias de conexão, o Iris confere sozinho o que você já configurou.',
    ),
  );
  const acoes = el('div', 'tut-hero-acoes');
  const comecar = buildBotao('Primeiros passos', { icone: ICONE_SETA, variante: 'primario' });
  comecar.addEventListener('click', () => tutorialState.abrirGuia('comecar'));
  const contagem = el('span', 'tut-hero-contagem', `${GUIAS.length} guias · ${GUIAS.reduce((n, g) => n + g.passos.length, 0)} passos`);
  acoes.append(comecar, contagem);
  textos.appendChild(acoes);
  hero.appendChild(textos);

  const conexoes = GUIAS.filter((g) => g.grupo === 'conectar');
  const soma = conexoes.reduce(
    (acc, g) => {
      const p = progresso(state, g);
      return { feitos: acc.feitos + p.feitos, total: acc.total + p.total };
    },
    { feitos: 0, total: 0 },
  );
  const lado = el('div', 'tut-hero-lado');
  lado.appendChild(buildAnel(soma.feitos, soma.total));
  lado.appendChild(
    el(
      'span',
      'tut-hero-lado-texto',
      state.conferindo && !Object.keys(state.estados).length ? 'Conferindo…' : `${soma.feitos} de ${soma.total} passos de conexão prontos`,
    ),
  );
  hero.appendChild(lado);
  return hero;
}

function buildCartaoGuia(state: TutorialViewState, guia: Guia): HTMLElement {
  const cartao = el('button', `tut-cartao${guia.grupo === 'conectar' ? ' is-conexao' : ''}`);
  cartao.type = 'button';
  cartao.addEventListener('click', () => tutorialState.abrirGuia(guia.id));

  const topo = el('div', 'tut-cartao-topo');
  topo.appendChild(icone(iconeDoGuia(guia), 'tut-cartao-icone', 18));
  if (state.vistos.includes(guia.id)) {
    const lido = el('span', 'tut-cartao-lido');
    lido.innerHTML = svg(ICONES.check, 10, 2.8);
    lido.appendChild(el('span', undefined, 'lido'));
    topo.appendChild(lido);
  }
  cartao.appendChild(topo);
  cartao.append(el('span', 'tut-cartao-titulo', guia.titulo), el('span', 'tut-cartao-chamada', guia.chamada));

  const { feitos, total } = progresso(state, guia);
  if (total > 0) {
    const completo = feitos === total;
    const barra = el('div', 'tut-barra');
    barra.setAttribute('role', 'progressbar');
    barra.setAttribute('aria-valuemin', '0');
    barra.setAttribute('aria-valuemax', String(total));
    barra.setAttribute('aria-valuenow', String(feitos));
    const preenchido = el('div', `tut-barra-valor${completo ? ' is-completo' : ''}`);
    preenchido.style.width = `${Math.round((feitos / total) * 100)}%`;
    barra.appendChild(preenchido);
    const rodape = el('div', 'tut-cartao-rodape');
    rodape.append(barra, completo ? buildSelo('configurado', 'ok') : el('span', 'tut-cartao-meta', `${feitos} de ${total}`));
    cartao.appendChild(rodape);
  } else {
    cartao.appendChild(el('span', 'tut-cartao-meta', `${guia.passos.length} ${guia.passos.length === 1 ? 'passo' : 'passos'} · ${minutosDeLeitura(guia)} min`));
  }
  return cartao;
}

function buildInicio(state: TutorialViewState): HTMLElement {
  const pagina = el('div', 'tut-pagina tut-inicio');
  pagina.appendChild(buildHero(state));

  ORDEM_GRUPOS.filter((g) => g !== 'comecar').forEach((grupo) => {
    const guias = GUIAS.filter((g) => g.grupo === grupo);
    if (!guias.length) return;
    const secao = el('section', 'tut-secao');
    const cab = el('header', 'tut-secao-cab');
    cab.appendChild(el('h3', undefined, ROTULO_DO_GRUPO[grupo]));
    const descricao = DESCRICAO_DO_GRUPO[grupo];
    if (descricao) cab.appendChild(el('p', undefined, descricao));
    secao.appendChild(cab);
    const grade = el('div', `tut-grade${grupo === 'conectar' ? ' is-conexoes' : ''}`);
    guias.forEach((g) => grade.appendChild(buildCartaoGuia(state, g)));
    secao.appendChild(grade);
    pagina.appendChild(secao);
  });
  return pagina;
}

// ---------- Guia ----------

function seloDoPasso(passo: Passo, estado: EstadoPasso): HTMLElement | null {
  if (estado === 'ok') return buildSelo(passo.opcional ? 'configurado' : 'feito', 'ok');
  if (estado === 'pendente') return passo.opcional ? buildSelo('opcional', 'neutro') : buildSelo('pendente', 'atencao');
  if (estado === 'desconhecido' && passo.verificar) return buildSelo('não verificado', 'neutro');
  return null;
}

function buildPasso(state: TutorialViewState, passo: Passo, indice: number): HTMLElement {
  const estado = estadoDoPasso(state, passo);
  const item = el('section', `tut-passo is-${estado}${passo.opcional ? ' is-opcional' : ''}`);
  item.id = `tut-passo-${passo.id}`;

  const marca = el('div', 'tut-passo-marca');
  if (estado === 'ok') marca.innerHTML = svg(ICONES.check, 14, 2.6);
  else marca.textContent = String(indice + 1);
  item.appendChild(marca);

  const cartao = el('div', 'tut-passo-cartao');
  const cab = el('header', 'tut-passo-cab');
  cab.appendChild(el('h3', undefined, passo.titulo));
  const selo = seloDoPasso(passo, estado);
  if (selo) cab.appendChild(selo);
  cartao.appendChild(cab);

  const conteudo = el('div', 'tut-passo-conteudo');
  passo.blocos.forEach((b) => conteudo.appendChild(buildBloco(b)));
  cartao.appendChild(conteudo);
  item.appendChild(cartao);
  return item;
}

function rotuloDoModulo(guia: Guia): string | null {
  if (!guia.modulo) return null;
  return MODULOS.find((m) => m.id === guia.modulo)?.rotulo ?? null;
}

function buildCabecalhoGuia(state: TutorialViewState, guia: Guia): HTMLElement {
  const cab = el('header', 'tut-guia-cab');

  const trilha = el('div', 'tut-trilha');
  const voltar = el('button', 'tut-trilha-link');
  voltar.type = 'button';
  voltar.innerHTML = svg(ICONE_VOLTA, 13, 2);
  voltar.appendChild(el('span', undefined, 'Início'));
  voltar.addEventListener('click', () => tutorialState.irParaInicio());
  trilha.append(voltar, el('span', 'tut-trilha-sep', '/'), el('span', undefined, ROTULO_DO_GRUPO[guia.grupo]));
  cab.appendChild(trilha);

  const linha = el('div', 'tut-guia-linha');
  linha.appendChild(icone(iconeDoGuia(guia), 'tut-guia-icone', 24));
  const textos = el('div', 'tut-guia-textos');
  textos.append(el('h2', undefined, guia.titulo), el('p', undefined, guia.resumo));

  const meta = el('div', 'tut-guia-meta');
  const passos = el('span', 'tut-meta');
  passos.innerHTML = svg(ICONE_PASSOS, 13);
  passos.appendChild(el('span', undefined, `${guia.passos.length} ${guia.passos.length === 1 ? 'passo' : 'passos'}`));
  const tempo = el('span', 'tut-meta');
  tempo.innerHTML = svg(ICONE_RELOGIO, 13);
  tempo.appendChild(el('span', undefined, `${minutosDeLeitura(guia)} min de leitura`));
  meta.append(passos, tempo);
  const { feitos, total } = progresso(state, guia);
  if (total > 0) meta.appendChild(feitos === total ? buildSelo('tudo configurado', 'ok') : buildSelo(`${feitos} de ${total} configurados`, 'atencao'));
  textos.appendChild(meta);
  linha.appendChild(textos);

  const nomeModulo = rotuloDoModulo(guia);
  if (nomeModulo && guia.modulo) {
    const modulo = guia.modulo;
    const abrir = buildBotao(`Abrir ${nomeModulo}`, { icone: ICONE_SETA, variante: 'secundario' });
    abrir.classList.add('tut-guia-abrir');
    abrir.addEventListener('click', () => abrirModulo(modulo));
    linha.appendChild(abrir);
  }
  cab.appendChild(linha);

  if (total > 0) {
    const barra = el('div', 'tut-barra is-grande');
    const valor = el('div', `tut-barra-valor${feitos === total ? ' is-completo' : ''}`);
    valor.style.width = `${Math.round((feitos / total) * 100)}%`;
    barra.appendChild(valor);
    cab.appendChild(barra);
  }
  return cab;
}

function buildNesteGuia(state: TutorialViewState, guia: Guia, principal: () => HTMLElement | null): HTMLElement {
  const aside = el('aside', 'tut-neste');
  aside.appendChild(el('span', 'tut-neste-titulo', 'Neste guia'));
  guia.passos.forEach((passo, i) => {
    const estado = estadoDoPasso(state, passo);
    const item = el('button', `tut-neste-item is-${estado}`);
    item.type = 'button';
    item.append(el('span', 'tut-neste-num', estado === 'ok' ? '✓' : String(i + 1)), el('span', undefined, passo.titulo));
    item.addEventListener('click', () => rolarAte(principal(), passo.id));
    aside.appendChild(item);
  });
  return aside;
}

function buildVizinho(guia: Guia | undefined, sentido: 'anterior' | 'proximo'): HTMLElement {
  if (!guia) return el('span');
  const botao = el('button', `tut-vizinho is-${sentido}`);
  botao.type = 'button';
  const textos = el('span', 'tut-vizinho-textos');
  textos.append(el('span', 'tut-vizinho-rotulo', sentido === 'anterior' ? 'Anterior' : 'Próximo'), el('span', 'tut-vizinho-nome', guia.titulo));
  const seta = icone(sentido === 'anterior' ? ICONE_VOLTA : ICONE_SETA, 'tut-vizinho-seta', 16);
  if (sentido === 'anterior') botao.append(seta, textos);
  else botao.append(textos, seta);
  botao.addEventListener('click', () => tutorialState.abrirGuia(guia.id));
  return botao;
}

function buildGuia(state: TutorialViewState, guia: Guia, principal: () => HTMLElement | null): HTMLElement {
  const pagina = el('div', 'tut-pagina tut-guia');
  pagina.appendChild(buildCabecalhoGuia(state, guia));

  const grade = el('div', 'tut-guia-grade');
  const passos = el('div', 'tut-passos');
  guia.passos.forEach((p, i) => passos.appendChild(buildPasso(state, p, i)));
  grade.appendChild(passos);
  if (guia.passos.length > 1) grade.appendChild(buildNesteGuia(state, guia, principal));
  pagina.appendChild(grade);

  const i = GUIAS.indexOf(guia);
  const vizinhos = el('nav', 'tut-vizinhos');
  vizinhos.setAttribute('aria-label', 'Outros guias');
  vizinhos.append(buildVizinho(GUIAS[i - 1], 'anterior'), buildVizinho(GUIAS[i + 1], 'proximo'));
  pagina.appendChild(vizinhos);
  return pagina;
}

// ---------- Busca ----------

interface Resultado {
  guia: Guia;
  passo?: Passo;
  trecho: string;
}

/** Recorte de ~140 caracteres em volta do termo, para o resultado mostrar o porquê. */
function trechoEmVolta(texto: string, termo: string): string {
  const i = normalizar(texto).indexOf(termo);
  if (i < 0) return texto.length > 140 ? `${texto.slice(0, 140)}…` : texto;
  const inicio = Math.max(0, i - 50);
  const fim = Math.min(texto.length, i + termo.length + 90);
  return `${inicio > 0 ? '…' : ''}${texto.slice(inicio, fim)}${fim < texto.length ? '…' : ''}`;
}

function buscarNosGuias(busca: string): Resultado[] {
  const termo = normalizar(busca.trim());
  if (!termo) return [];
  const resultados: Resultado[] = [];
  GUIAS.forEach((guia) => {
    const cabeca = `${guia.titulo} ${guia.chamada} ${guia.resumo}`;
    if (normalizar(cabeca).includes(termo)) resultados.push({ guia, trecho: trechoEmVolta(`${guia.chamada} ${guia.resumo}`, termo) });
    guia.passos.forEach((passo) => {
      const corpo = passo.blocos.map(textoDoBloco).join(' ');
      if (normalizar(`${passo.titulo} ${corpo}`).includes(termo)) resultados.push({ guia, passo, trecho: trechoEmVolta(corpo, termo) });
    });
  });
  return resultados.slice(0, 40);
}

/** Pinta o termo no trecho sem innerHTML: o texto vem do conteúdo, mas a regra da casa é textContent. */
function comDestaque(texto: string, busca: string): HTMLElement {
  const p = el('p', 'tut-resultado-trecho');
  const termo = normalizar(busca.trim());
  const base = normalizar(texto);
  let cursor = 0;
  let i = base.indexOf(termo, cursor);
  while (termo && i >= 0) {
    p.appendChild(document.createTextNode(texto.slice(cursor, i)));
    p.appendChild(el('mark', undefined, texto.slice(i, i + termo.length)));
    cursor = i + termo.length;
    i = base.indexOf(termo, cursor);
  }
  p.appendChild(document.createTextNode(texto.slice(cursor)));
  return p;
}

function buildResultados(state: TutorialViewState): HTMLElement {
  const pagina = el('div', 'tut-pagina tut-busca');
  const resultados = buscarNosGuias(state.busca);
  const cab = el('header', 'tut-secao-cab');
  cab.appendChild(el('h3', undefined, resultados.length ? `${resultados.length === 40 ? '40+' : resultados.length} resultado${resultados.length === 1 ? '' : 's'} para “${state.busca.trim()}”` : 'Nada encontrado'));
  pagina.appendChild(cab);

  if (!resultados.length) {
    const inicio = buildBotao('Ver todos os guias', { icone: ICONE_INICIO, variante: 'secundario' });
    inicio.addEventListener('click', () => tutorialState.irParaInicio());
    pagina.appendChild(buildVazio(ICONES.tutorial, 'Nenhum guia fala disso', 'Tente uma palavra mais curta ou o nome da área (ex.: “agenda”, “backup”, “score”).', inicio));
    return pagina;
  }

  const lista = el('div', 'tut-resultados');
  resultados.forEach((r) => {
    const item = el('button', 'tut-resultado');
    item.type = 'button';
    item.appendChild(icone(iconeDoGuia(r.guia), 'tut-resultado-icone', 15));
    const textos = el('div', 'tut-resultado-textos');
    const titulo = el('div', 'tut-resultado-titulo');
    titulo.appendChild(el('span', 'tut-resultado-guia', r.guia.titulo));
    if (r.passo) titulo.append(el('span', 'tut-trilha-sep', '›'), el('span', undefined, r.passo.titulo));
    textos.append(titulo, comDestaque(r.trecho, state.busca));
    item.appendChild(textos);
    item.addEventListener('click', () => tutorialState.abrirGuia(r.guia.id, r.passo?.id ?? null));
    lista.appendChild(item);
  });
  pagina.appendChild(lista);
  return pagina;
}

// ---------- Moldura ----------

function rolarAte(principal: HTMLElement | null, passoId: string): void {
  const alvo = principal?.querySelector<HTMLElement>(`#tut-passo-${CSS.escape(passoId)}`);
  if (!principal || !alvo) return;
  principal.scrollTo({ top: alvo.offsetTop - 12, behavior: 'smooth' });
  alvo.classList.remove('is-destacado');
  // Força o reflow para a animação recomeçar mesmo clicando duas vezes no mesmo passo.
  void alvo.offsetWidth;
  alvo.classList.add('is-destacado');
}

/** O que está na tela: muda quando o usuário navega, não quando a verificação termina. */
let telaDesenhada = '';

export function render(container: HTMLElement, state: TutorialViewState): void {
  // Redesenha tudo a cada mudança; o que o usuário estava fazendo (digitar na
  // busca, ler no meio do guia) precisa sobreviver a isso.
  const buscaFocada = Boolean(document.activeElement?.closest('.tut-view .pg-busca'));
  const tela = state.busca.trim() ? `busca:${state.busca}` : `guia:${state.guiaAtivo ?? ''}`;
  const mesmaTela = tela === telaDesenhada;
  const rolagemPrincipal = mesmaTela ? (container.querySelector('.tut-principal')?.scrollTop ?? 0) : 0;
  const rolagemIndice = container.querySelector('.tut-indice')?.scrollTop ?? 0;
  telaDesenhada = tela;

  container.replaceChildren();
  const view = el('div', 'pg-view tut-view');

  const busca = buildBusca(state.busca, 'Buscar nos guias…', (v) => tutorialState.buscar(v));
  busca.classList.add('tut-campo-busca');
  const reconferir = buildBotao(state.conferindo ? 'Conferindo…' : 'Reconferir', { icone: ICONES.atualizar, variante: 'fantasma' });
  reconferir.title = 'Verificar de novo o que já está configurado';
  reconferir.disabled = state.conferindo;
  if (state.conferindo) reconferir.classList.add('is-girando');
  reconferir.addEventListener('click', () => void tutorialState.conferir());

  view.appendChild(
    buildCabecalho({
      icone: ICONES.tutorial,
      titulo: 'Tutorial',
      subtitulo: 'Um guia para cada área do Iris — e a conferência do que já está configurado.',
      acoes: [busca, reconferir],
    }),
  );

  const corpo = el('div', 'tut-corpo');
  const indice = buildIndice(state);
  const principal = el('main', 'tut-principal');
  const guia = state.guiaAtivo ? GUIAS.find((g) => g.id === state.guiaAtivo) : undefined;

  if (state.busca.trim()) principal.appendChild(buildResultados(state));
  else if (guia) principal.appendChild(buildGuia(state, guia, () => principal));
  else principal.appendChild(buildInicio(state));
  if (!mesmaTela) principal.firstElementChild?.classList.add('is-entrando');

  corpo.append(indice, principal);
  view.appendChild(corpo);
  container.appendChild(view);

  indice.scrollTop = rolagemIndice;
  principal.scrollTop = rolagemPrincipal;
  if (buscaFocada) focarBusca(container);

  if (state.passoAlvo && guia) {
    const alvo = state.passoAlvo;
    tutorialState.consumirPassoAlvo();
    requestAnimationFrame(() => rolarAte(principal, alvo));
  }
}

export function destroy(): void {
  // Ao voltar ao módulo, começa do topo da tela que estiver aberta.
  telaDesenhada = '';
}
