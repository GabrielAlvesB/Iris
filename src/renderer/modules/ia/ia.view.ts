import {
  FORMATOS_IMAGEM_IA,
  descritorDe,
  formatoIaDe,
  type ItemGaleriaComMiniatura,
  type TarefaIa,
} from '../../../shared/types/ia.types.js';
import { carregarConfigIa, iaPode, listarTarefasIa, onTarefaIa } from '../../core/ia.js';
import { abrirAjustes, abrirTutorial } from '../../core/navegacao.js';
import { ICONE_IA } from '../../ui/ia.js';
import { haModalAberto, mensagemDeErro, openAvisoModal, openConfirmModal } from '../../ui/modal.js';
import { ICONES, buildBotao, buildBotaoAjuda, buildBusca, buildCabecalho, buildSelo, buildVazio, focarBusca, svg, tempoRelativo } from '../../ui/pagina.js';
import { abrirModificacao, abrirVisualizacao, anexarComEscolha, salvarComAviso, type AcoesDaVisualizacao } from './ia.acoes.js';
import { buildCriador, type Criador } from './ia.criador.js';

/**
 * Estúdio IA: criar imagens (texto → imagem, ou a partir de referências) e a
 * galeria com tudo o que já foi gerado. A geração roda no main; a tela só
 * acompanha as tarefas pelo evento 'ia:tarefa'.
 */

let containerAtual: HTMLElement | null = null;
let criador: Criador | null = null;
let galeria: ItemGaleriaComMiniatura[] = [];
let tarefas: TarefaIa[] = [];
let busca = '';
let filtroFormato = '';
let pararTarefas: (() => void) | null = null;
let relogio: ReturnType<typeof setInterval> | null = null;
let areaTarefas: HTMLElement | null = null;
let areaGaleria: HTMLElement | null = null;

function unwrap<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

export function montar(viewRoot: HTMLElement): void {
  containerAtual = viewRoot;
  pararTarefas = onTarefaIa((t) => {
    tarefas = [t, ...tarefas.filter((x) => x.id !== t.id)];
    desenharTarefas();
    if (t.situacao === 'pronto') void recarregarGaleria();
  });
  document.addEventListener('keydown', onAtalho);
  void iniciar();
}

export function destroy(): void {
  pararTarefas?.();
  pararTarefas = null;
  if (relogio) clearInterval(relogio);
  relogio = null;
  document.removeEventListener('keydown', onAtalho);
  containerAtual = null;
  criador = null;
  areaTarefas = null;
  areaGaleria = null;
}

function onAtalho(e: KeyboardEvent): void {
  // Ctrl+Enter gera, de qualquer campo do criador.
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !haModalAberto()) {
    containerAtual?.querySelector<HTMLButtonElement>('.ia-gerar')?.click();
  }
}

async function iniciar(): Promise<void> {
  try {
    const [config, lista, itens] = await Promise.all([
      carregarConfigIa(true),
      listarTarefasIa(),
      window.irisAPI.ia.listarGaleria().then(unwrap),
    ]);
    tarefas = lista;
    galeria = itens;
    if (!containerAtual) return;
    render(containerAtual, iaPode(config, 'imagem'));
  } catch (erro) {
    void openAvisoModal('Não deu para abrir o Estúdio', mensagemDeErro(erro), { erro: true });
  }
}

async function recarregarGaleria(): Promise<void> {
  galeria = unwrap(await window.irisAPI.ia.listarGaleria());
  desenharGaleria();
}

function render(container: HTMLElement, temImagem: boolean): void {
  const tela = document.createElement('div');
  tela.className = 'pg-view ia-view';

  const configurar = buildBotao('Configurar IA', { icone: ICONES.ajustes, variante: 'secundario' });
  configurar.addEventListener('click', () => abrirAjustes('ia'));
  tela.appendChild(
    buildCabecalho({
      icone: ICONE_IA,
      titulo: 'Estúdio IA',
      subtitulo: 'Thumbnails e imagens a partir de texto ou das suas próprias imagens — com a sua chave de IA',
      acoes: [configurar, buildBotaoAjuda(() => abrirTutorial('ia'))],
    }),
  );

  if (!temImagem) {
    const ir = buildBotao('Configurar uma IA de imagem', { icone: ICONE_IA, variante: 'primario' });
    ir.addEventListener('click', () => abrirAjustes('ia'));
    tela.appendChild(
      buildVazio(
        ICONE_IA,
        'Nenhuma IA de imagem configurada',
        'Coloque a chave do OpenRouter, da OpenAI ou do Google (Gemini) em Ajustes › Inteligência artificial. O Claude escreve textos, mas não gera imagens. O Tutorial tem o passo a passo de cada um.',
        ir,
      ),
    );
    if (galeria.length) {
      const g = document.createElement('div');
      g.className = 'pg-rolagem';
      areaGaleria = document.createElement('div');
      g.appendChild(areaGaleria);
      tela.appendChild(g);
    }
    container.replaceChildren(tela);
    desenharGaleria();
    return;
  }

  const layout = document.createElement('div');
  layout.className = 'ia-layout';

  const coluna = document.createElement('aside');
  coluna.className = 'ia-coluna pg-rolagem';
  criador = buildCriador({ aoIniciar: acompanharTarefa });
  coluna.appendChild(criador.el);
  coluna.appendChild(Object.assign(document.createElement('p'), { className: 'md-dica', textContent: 'Ctrl+Enter gera. Você pode sair do Estúdio: a geração continua.' }));

  const direita = document.createElement('section');
  direita.className = 'ia-direita pg-rolagem';
  areaTarefas = document.createElement('div');
  areaTarefas.className = 'ia-tarefas';
  areaGaleria = document.createElement('div');
  direita.append(areaTarefas, areaGaleria);

  layout.append(coluna, direita);
  tela.appendChild(layout);
  container.replaceChildren(tela);

  desenharTarefas();
  desenharGaleria();
  if (relogio) clearInterval(relogio);
  // O tempo decorrido das tarefas em andamento anda de segundo em segundo.
  relogio = setInterval(() => {
    areaTarefas?.querySelectorAll<HTMLElement>('[data-inicio]').forEach((el) => {
      el.textContent = decorrido(el.dataset.inicio!);
    });
  }, 1000);
}

function decorrido(inicioIso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(inicioIso).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${s % 60}s`;
}

// ---------- Tarefas ----------

/** Dispensa no main (senão o erro volta ao reabrir o Estúdio) e tira da tela na hora. */
function dispensar(ids: string[]): void {
  tarefas = tarefas.filter((x) => !ids.includes(x.id));
  desenharTarefas();
  const pedido = ids.length === 1 ? window.irisAPI.ia.dispensarTarefa(ids[0]!) : window.irisAPI.ia.limparTarefas();
  void pedido.then((r) => {
    if (!r.ok) return;
    tarefas = r.data;
    desenharTarefas();
  });
}

/**
 * O provedor devolve um texto técnico longo (cotas, links, "retry in 47s") que
 * o main anexa depois de " Detalhe: ". Na tela fica só a frase em português;
 * o resto vai para um bloco recolhido, para quem precisar diagnosticar.
 */
function buildErro(mensagem: string): HTMLElement[] {
  const corte = mensagem.indexOf(' Detalhe: ');
  const resumo = corte >= 0 ? mensagem.slice(0, corte) : mensagem;
  const partes: HTMLElement[] = [Object.assign(document.createElement('p'), { className: 'ia-tarefa-erro', textContent: resumo })];
  if (corte >= 0) {
    const detalhes = document.createElement('details');
    detalhes.className = 'ia-tarefa-detalhe';
    detalhes.appendChild(Object.assign(document.createElement('summary'), { textContent: 'Resposta do provedor' }));
    detalhes.appendChild(Object.assign(document.createElement('pre'), { textContent: mensagem.slice(corte + ' Detalhe: '.length) }));
    partes.push(detalhes);
  }
  return partes;
}

function desenharTarefas(): void {
  if (!areaTarefas) return;
  const visiveis = tarefas.filter((t) => t.situacao === 'gerando' || t.situacao === 'erro');
  const falhas = visiveis.filter((t) => t.situacao === 'erro');
  const barra: HTMLElement[] = [];
  if (falhas.length > 1) {
    const el = document.createElement('div');
    el.className = 'ia-tarefas-barra';
    el.appendChild(Object.assign(document.createElement('span'), { textContent: `${falhas.length} gerações não deram certo` }));
    const todas = buildBotao('Dispensar todas', { icone: ICONES.xis, variante: 'fantasma' });
    todas.addEventListener('click', () => dispensar(falhas.map((t) => t.id)));
    el.appendChild(todas);
    barra.push(el);
  }
  areaTarefas.replaceChildren(
    ...barra,
    ...visiveis.map((t) => {
      const cartao = document.createElement('article');
      cartao.className = `ia-tarefa is-${t.situacao}`;
      const topo = document.createElement('div');
      topo.className = 'ia-tarefa-topo';
      if (t.situacao === 'gerando') {
        const spinner = document.createElement('span');
        spinner.className = 'ia-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        topo.appendChild(spinner);
        topo.appendChild(
          Object.assign(document.createElement('strong'), {
            textContent: `Gerando ${t.quantidade} ${t.quantidade === 1 ? 'imagem' : 'imagens'} · ${formatoIaDe(t.formato).rotulo}`,
          }),
        );
        const tempo = document.createElement('span');
        tempo.className = 'ia-tarefa-tempo';
        tempo.dataset.inicio = t.iniciadaEm;
        tempo.textContent = decorrido(t.iniciadaEm);
        topo.appendChild(tempo);
        const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
        cancelar.addEventListener('click', () => void window.irisAPI.ia.cancelarTarefa(t.id));
        topo.appendChild(cancelar);
      } else {
        topo.appendChild(buildSelo('Não deu certo', 'erro'));
        // Uma modificação depende da imagem de referência, que a tarefa não guarda.
        if (criador && !t.prompt.startsWith('Modificação: ')) {
          const reusar = buildBotao('Usar o prompt', { icone: ICONES.atualizar, variante: 'fantasma' });
          reusar.title = 'Pôr este prompt no criador para tentar de novo (com outro modelo, se quiser)';
          reusar.addEventListener('click', () => {
            criador?.definirPrompt(t.prompt);
            dispensar([t.id]);
          });
          topo.appendChild(reusar);
        }
        const fechar = buildBotao('', { icone: ICONES.xis, variante: 'fantasma', titulo: 'Dispensar' });
        fechar.addEventListener('click', () => dispensar([t.id]));
        topo.appendChild(fechar);
      }
      cartao.appendChild(topo);
      cartao.appendChild(Object.assign(document.createElement('p'), { className: 'ia-tarefa-prompt', textContent: t.prompt }));
      if (t.erro) cartao.append(...buildErro(t.erro));
      cartao.appendChild(Object.assign(document.createElement('small'), { className: 'md-dica', textContent: `${descritorDe(t.provedor).rotulo} · ${t.modelo}` }));
      return cartao;
    }),
  );
}

// ---------- Galeria ----------

const ICONE_LIXEIRA =
  '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';
const ICONE_EDITAR = '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>';
const ICONE_IDEIAS = '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>';

function acompanharTarefa(t: TarefaIa): void {
  tarefas = [t, ...tarefas.filter((x) => x.id !== t.id)];
  desenharTarefas();
}

/** Ideias novas a partir de uma imagem: ela vira referência e o prompt dela, o ponto de partida. */
function maisIdeias(item: ItemGaleriaComMiniatura): void {
  void window.irisAPI.ia.descreverReferencia({ origem: 'galeria', id: item.id }).then((r) => {
    if (!r.ok || !criador) return;
    criador.adicionarReferencias([r.data]);
    criador.definirPrompt(item.prompt);
    criador.pedirIdeias();
  });
}

/** Confirma e apaga da galeria; `depois` roda só se apagou. */
function excluirItem(item: ItemGaleriaComMiniatura, depois?: () => void): void {
  void openConfirmModal({
    title: 'Apagar imagem',
    message: item.biblioteca
      ? 'A imagem sai da galeria. A cópia salva na Biblioteca continua lá (e nos Materiais da postagem, se estiver anexada).'
      : 'A imagem será apagada de vez. Ela não foi salva na Biblioteca.',
    confirmText: 'Apagar',
  }).then((ok) => {
    if (!ok) return;
    void window.irisAPI.ia.excluirImagem(item.id).then((r) => {
      if (!r.ok) {
        void openAvisoModal('Não deu para apagar', r.error, { erro: true });
        return;
      }
      galeria = r.data;
      desenharGaleria();
      depois?.();
    });
  });
}

function usarComoReferencia(item: ItemGaleriaComMiniatura): void {
  void window.irisAPI.ia.descreverReferencia({ origem: 'galeria', id: item.id }).then((r) => {
    if (r.ok) criador?.adicionarReferencias([r.data]);
  });
}

function gerarVariacao(item: ItemGaleriaComMiniatura): void {
  void window.irisAPI.ia.descreverReferencia({ origem: 'galeria', id: item.id }).then((r) => {
    if (!r.ok) return;
    criador?.adicionarReferencias([r.data]);
    criador?.definirPrompt(`${item.prompt.replace(/^Modificação: /, '')}\n\nFaça uma variação da imagem de referência: mesmo tema e estilo, outra composição.`);
  });
}

/** As ações da visualização grande, em grupos. As que mexem no criador fecham a visualização. */
function acoesDoItem(item: ItemGaleriaComMiniatura, fechar: () => void, removido: () => void): AcoesDaVisualizacao {
  const botao = (rotulo: string, icone: string, variante: 'primario' | 'secundario' | 'fantasma', fazer: () => void, fecha = true): HTMLButtonElement => {
    const b = buildBotao(rotulo, { icone, variante });
    b.addEventListener('click', () => {
      if (fecha) fechar();
      fazer();
    });
    return b;
  };
  const excluir = buildBotao('Apagar imagem', { icone: ICONE_LIXEIRA, variante: 'fantasma' });
  excluir.classList.add('is-perigo');
  excluir.addEventListener('click', () => excluirItem(item, removido));
  return {
    criar: [
      botao('Modificar', ICONE_EDITAR, 'primario', () => void abrirModificacao(item, acompanharTarefa), false),
      botao('Mais ideias', ICONE_IDEIAS, 'secundario', () => maisIdeias(item)),
      botao('Gerar variação', ICONES.atualizar, 'secundario', () => gerarVariacao(item)),
      botao('Usar como referência', ICONE_IA, 'secundario', () => usarComoReferencia(item)),
    ],
    usar: [
      botao('Anexar a postagem', ICONES.check, 'secundario', () => void anexarComEscolha(item).then(recarregarGaleria), false),
      botao(item.biblioteca ? 'Já na Biblioteca' : 'Salvar na Biblioteca', ICONES.pasta, 'secundario', () => void salvarComAviso(item).then(recarregarGaleria), false),
      botao('Exportar…', ICONES.backup, 'secundario', () => void window.irisAPI.ia.exportarImagem(item.id), false),
    ],
    excluir,
  };
}

function buildCartaoGaleria(item: ItemGaleriaComMiniatura): HTMLElement {
  const cartao = document.createElement('article');
  cartao.className = 'ia-item';
  const imagem = document.createElement('button');
  imagem.type = 'button';
  imagem.className = 'ia-item-imagem';
  imagem.style.aspectRatio = `${item.largura || 1} / ${item.altura || 1}`;
  imagem.title = 'Ver em tamanho grande';
  if (item.miniatura) {
    const img = document.createElement('img');
    img.src = item.miniatura;
    img.alt = item.prompt.slice(0, 120);
    img.loading = 'lazy';
    imagem.appendChild(img);
  }
  imagem.addEventListener('click', () => {
    // Navega pelo que está visível agora (respeita busca e filtro de formato).
    const visiveis = galeriaVisivel();
    abrirVisualizacao(visiveis, Math.max(0, visiveis.findIndex((x) => x.id === item.id)), acoesDoItem);
  });
  cartao.appendChild(imagem);

  const corpo = document.createElement('div');
  corpo.className = 'ia-item-corpo';
  corpo.appendChild(Object.assign(document.createElement('p'), { className: 'ia-item-prompt', textContent: item.prompt, title: item.prompt }));
  const meta = document.createElement('div');
  meta.className = 'ia-item-meta';
  meta.append(`${formatoIaDe(item.formato).rotulo} · ${tempoRelativo(item.criadoEm)}`);
  corpo.appendChild(meta);
  const selos = document.createElement('div');
  selos.className = 'ia-item-selos';
  if (item.biblioteca) selos.appendChild(buildSelo('Na Biblioteca', 'ok'));
  if (item.postagem) selos.appendChild(buildSelo(`Em "${item.postagem.titulo}"`, 'neutro'));
  if (selos.childElementCount) corpo.appendChild(selos);

  const acoes = document.createElement('div');
  acoes.className = 'ia-item-acoes';
  const mini = (icone: string, titulo: string, fazer: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ia-item-acao';
    b.title = titulo;
    b.setAttribute('aria-label', titulo);
    b.innerHTML = svg(icone, 14, 2);
    b.addEventListener('click', fazer);
    return b;
  };
  acoes.append(
    mini(ICONE_EDITAR, 'Modificar esta imagem', () => void abrirModificacao(item, acompanharTarefa)),
    mini(ICONE_IDEIAS, 'Mais ideias a partir desta', () => maisIdeias(item)),
    mini(ICONES.pasta, item.biblioteca ? 'Já está na Biblioteca' : 'Salvar na Biblioteca', () => void salvarComAviso(item).then(recarregarGaleria)),
    mini(ICONES.check, 'Anexar a uma postagem', () => void anexarComEscolha(item).then(recarregarGaleria)),
    mini(ICONE_IA, 'Usar como referência', () => usarComoReferencia(item)),
    mini(ICONES.copiar, 'Copiar o prompt', () => void navigator.clipboard.writeText(item.prompt)),
  );
  const apagar = mini(ICONE_LIXEIRA, 'Apagar imagem', () => excluirItem(item));
  apagar.classList.add('is-perigo');
  acoes.appendChild(apagar);
  corpo.appendChild(acoes);
  cartao.appendChild(corpo);
  return cartao;
}

function galeriaVisivel(): ItemGaleriaComMiniatura[] {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  return galeria.filter((i) => (!filtroFormato || i.formato === filtroFormato) && (!termo || i.prompt.toLocaleLowerCase('pt-BR').includes(termo)));
}

function desenharGaleria(): void {
  if (!areaGaleria) return;
  const cab = document.createElement('div');
  cab.className = 'ia-galeria-cab';
  cab.appendChild(Object.assign(document.createElement('h2'), { textContent: `Galeria · ${galeria.length}` }));
  const filtros = document.createElement('div');
  filtros.className = 'ia-galeria-filtros';
  filtros.appendChild(
    buildBusca(busca, 'Buscar no prompt…', (v) => {
      busca = v;
      desenharGaleria();
      focarBusca(areaGaleria);
    }),
  );
  const formato = document.createElement('select');
  formato.className = 'md-input';
  [{ id: '', rotulo: 'Todos os formatos' }, ...FORMATOS_IMAGEM_IA].forEach((f) => formato.appendChild(Object.assign(document.createElement('option'), { value: f.id, textContent: f.rotulo })));
  formato.value = filtroFormato;
  formato.addEventListener('change', () => {
    filtroFormato = formato.value;
    desenharGaleria();
  });
  filtros.appendChild(formato);
  cab.appendChild(filtros);

  const visiveis = galeriaVisivel();
  const grade = document.createElement('div');
  grade.className = 'ia-galeria';
  visiveis.forEach((i) => grade.appendChild(buildCartaoGaleria(i)));
  const conteudo: HTMLElement[] = [cab];
  if (!galeria.length) {
    conteudo.push(Object.assign(document.createElement('p'), { className: 'md-vazio ia-galeria-vazia', textContent: 'As imagens que você gerar aparecem aqui — e ficam guardadas mesmo sem salvar na Biblioteca.' }));
  } else if (!visiveis.length) {
    conteudo.push(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: 'Nada com esses filtros.' }));
  } else {
    conteudo.push(grade);
  }
  areaGaleria.replaceChildren(...conteudo);
}
