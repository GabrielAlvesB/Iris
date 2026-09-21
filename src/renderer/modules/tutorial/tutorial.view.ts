import * as tutorialState from './tutorial.state.js';
import type { TutorialViewState } from './tutorial.state.js';
import { GUIAS } from './tutorial.content.js';
import type { Bloco, EstadoPasso, Guia, GuiaId, Passo } from './tutorial.types.js';
import { ICONES, buildBotao, buildCabecalho, buildSelo, svg } from '../../ui/pagina.js';

const ICONE_DO_GUIA: Record<GuiaId, string> = {
  n8n: ICONES.n8n,
  servidores: ICONES.servidor,
  github: ICONES.github,
};

function estadoDoPasso(state: TutorialViewState, passo: Passo): EstadoPasso {
  return state.estados[passo.id] ?? (passo.verificar ? 'desconhecido' : 'manual');
}

/** Quantos passos verificáveis já estão resolvidos. */
function progresso(state: TutorialViewState, guia: Guia): { feitos: number; total: number } {
  const verificaveis = guia.passos.filter((passo) => passo.verificar);
  const feitos = verificaveis.filter((passo) => state.estados[passo.id] === 'ok').length;
  return { feitos, total: verificaveis.length };
}

function buildBloco(bloco: Bloco): HTMLElement {
  if (bloco.tipo === 'comando') {
    const wrap = document.createElement('div');
    wrap.className = 'tut-comando';

    const linha = document.createElement('div');
    linha.className = 'tut-comando-linha';

    const prompt = document.createElement('span');
    prompt.className = 'tut-comando-prompt';
    prompt.textContent = '$';
    linha.appendChild(prompt);

    const codigo = document.createElement('code');
    codigo.textContent = bloco.comando;
    linha.appendChild(codigo);

    const copiar = document.createElement('button');
    copiar.className = 'tut-copiar';
    copiar.title = 'Copiar comando';
    copiar.innerHTML = `${svg(ICONES.copiar, 13)}<span>Copiar</span>`;
    copiar.addEventListener('click', () => {
      window.irisAPI.system.copyToClipboard(bloco.comando);
      copiar.classList.add('is-copiado');
      copiar.innerHTML = `${svg(ICONES.check, 13, 2.4)}<span>Copiado</span>`;
      setTimeout(() => {
        copiar.classList.remove('is-copiado');
        copiar.innerHTML = `${svg(ICONES.copiar, 13)}<span>Copiar</span>`;
      }, 1400);
    });
    linha.appendChild(copiar);
    wrap.appendChild(linha);

    if (bloco.legenda) {
      const legenda = document.createElement('span');
      legenda.className = 'tut-comando-legenda';
      legenda.textContent = bloco.legenda;
      wrap.appendChild(legenda);
    }
    return wrap;
  }

  if (bloco.tipo === 'lista') {
    const lista = document.createElement('ol');
    lista.className = 'tut-lista';
    bloco.itens.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      lista.appendChild(li);
    });
    return lista;
  }

  if (bloco.tipo === 'aviso') {
    const aviso = document.createElement('div');
    aviso.className = `tut-aviso is-${bloco.nivel}`;
    aviso.innerHTML = svg(bloco.nivel === 'atencao' ? ICONES.alerta : ICONES.info, 15, 2);
    const texto = document.createElement('span');
    texto.textContent = bloco.texto;
    aviso.appendChild(texto);
    return aviso;
  }

  if (bloco.tipo === 'link') {
    const link = document.createElement('button');
    link.className = 'tut-link';
    link.innerHTML = svg(ICONES.externo, 13);
    link.appendChild(document.createTextNode(bloco.rotulo));
    link.addEventListener('click', () => window.irisAPI.system.openExternalLink(bloco.url));
    return link;
  }

  const paragrafo = document.createElement('p');
  paragrafo.className = 'tut-texto';
  paragrafo.textContent = bloco.texto;
  return paragrafo;
}

function buildPasso(state: TutorialViewState, passo: Passo, indice: number, ultimo: boolean): HTMLElement {
  const estado = estadoDoPasso(state, passo);

  const item = document.createElement('section');
  item.className = `tut-passo is-${estado}${ultimo ? ' is-ultimo' : ''}`;

  // Coluna da linha do tempo: número ou check, ligados por um traço.
  const trilho = document.createElement('div');
  trilho.className = 'tut-passo-trilho';
  const marca = document.createElement('div');
  marca.className = 'tut-passo-marca';
  if (estado === 'ok') marca.innerHTML = svg(ICONES.check, 14, 2.6);
  else marca.textContent = String(indice + 1);
  trilho.appendChild(marca);
  item.appendChild(trilho);

  const corpo = document.createElement('div');
  corpo.className = 'tut-passo-corpo';

  const cabecalho = document.createElement('div');
  cabecalho.className = 'tut-passo-cabecalho';
  const titulo = document.createElement('h3');
  // Os títulos do conteúdo trazem "1. ", redundante com o marcador numérico.
  titulo.textContent = passo.titulo.replace(/^\d+\.\s*/, '');
  cabecalho.appendChild(titulo);

  if (estado === 'ok') cabecalho.appendChild(buildSelo('feito', 'ok'));
  else if (estado === 'pendente') cabecalho.appendChild(buildSelo('pendente', 'atencao'));
  else if (estado === 'desconhecido') cabecalho.appendChild(buildSelo('não verificado', 'neutro'));
  corpo.appendChild(cabecalho);

  const conteudo = document.createElement('div');
  conteudo.className = 'tut-passo-conteudo';
  passo.blocos.forEach((bloco) => conteudo.appendChild(buildBloco(bloco)));
  corpo.appendChild(conteudo);

  item.appendChild(corpo);
  return item;
}

function buildSeletor(state: TutorialViewState): HTMLElement {
  const grade = document.createElement('div');
  grade.className = 'tut-seletor';

  GUIAS.forEach((guia) => {
    const { feitos, total } = progresso(state, guia);
    const completo = total > 0 && feitos === total;

    const cartao = document.createElement('button');
    cartao.className = `tut-guia${state.guiaAtivo === guia.id ? ' is-ativo' : ''}`;
    cartao.addEventListener('click', () => tutorialState.selecionarGuia(guia.id));

    const topo = document.createElement('div');
    topo.className = 'tut-guia-topo';
    const icone = document.createElement('span');
    icone.className = 'tut-guia-icone';
    icone.innerHTML = svg(ICONE_DO_GUIA[guia.id], 17);
    topo.appendChild(icone);
    const nome = document.createElement('span');
    nome.className = 'tut-guia-nome';
    nome.textContent = guia.titulo;
    topo.appendChild(nome);
    cartao.appendChild(topo);

    const barra = document.createElement('div');
    barra.className = 'tut-guia-barra';
    const preenchido = document.createElement('div');
    preenchido.className = `tut-guia-preenchido${completo ? ' is-completo' : ''}`;
    preenchido.style.width = total > 0 ? `${Math.round((feitos / total) * 100)}%` : '0%';
    barra.appendChild(preenchido);
    cartao.appendChild(barra);

    const rodape = document.createElement('span');
    rodape.className = 'tut-guia-rodape';
    rodape.textContent = completo ? 'tudo configurado' : `${feitos} de ${total} configurados`;
    cartao.appendChild(rodape);

    grade.appendChild(cartao);
  });

  return grade;
}

export function render(container: HTMLElement, state: TutorialViewState): void {
  container.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'pg-view tut-view';

  const reconferir = buildBotao(state.conferindo ? 'Conferindo…' : 'Reconferir', { icone: ICONES.atualizar });
  reconferir.title = 'Verificar de novo o que já está configurado';
  reconferir.disabled = state.conferindo;
  if (state.conferindo) reconferir.classList.add('is-girando');
  reconferir.addEventListener('click', () => void tutorialState.conferir());

  view.appendChild(
    buildCabecalho({
      icone: ICONES.tutorial,
      titulo: 'Tutorial',
      subtitulo: 'Guias passo a passo. As marcas de concluído vêm da sua configuração real, não de clique manual.',
      acoes: [reconferir],
    }),
  );

  view.appendChild(buildSeletor(state));

  const guia = GUIAS.find((g) => g.id === state.guiaAtivo) ?? GUIAS[0];
  if (guia) {
    const conteudo = document.createElement('div');
    conteudo.className = 'pg-rolagem';

    const artigo = document.createElement('article');
    artigo.className = 'tut-artigo';

    const intro = document.createElement('div');
    intro.className = 'tut-intro';
    const iconeIntro = document.createElement('div');
    iconeIntro.className = 'tut-intro-icone';
    iconeIntro.innerHTML = svg(ICONE_DO_GUIA[guia.id], 20);
    intro.appendChild(iconeIntro);
    const textos = document.createElement('div');
    const titulo = document.createElement('h2');
    titulo.textContent = guia.titulo;
    textos.appendChild(titulo);
    const resumo = document.createElement('p');
    resumo.textContent = guia.resumo;
    textos.appendChild(resumo);
    intro.appendChild(textos);
    artigo.appendChild(intro);

    const passos = document.createElement('div');
    passos.className = 'tut-passos';
    guia.passos.forEach((passo, i) => passos.appendChild(buildPasso(state, passo, i, i === guia.passos.length - 1)));
    artigo.appendChild(passos);

    conteudo.appendChild(artigo);
    view.appendChild(conteudo);
  }

  container.appendChild(view);
}

export function destroy(): void {
  // Sem timers nem listeners globais: o state cuida da assinatura de navegação.
}
