import type { AssinaturaRelatorio } from '../../../shared/types/ajustes.types.js';
import { TIPOS_POSTAGEM } from '../../../shared/types/postagens.types.js';
import {
  STATUS_MARCACAO,
  TIPOS_MARCACAO,
  type ItemRelatorio,
  type Relatorio,
  type RelatoriosFile,
  type SecaoRelatorio,
  type SituacaoRelatorio,
} from '../../../shared/types/relatorios.types.js';
import { abrirAjustes } from '../../core/navegacao.js';
import { campo, grade2, input, interruptor, pilulas, textarea } from '../../ui/campos.js';
import { buildSecaoModal, mensagemDeErro, openAvisoModal, openConfirmModal } from '../../ui/modal.js';
import {
  buildBotao,
  buildBusca,
  buildCabecalho,
  buildIndicadores,
  buildSegmentado,
  buildSelo,
  buildVazio,
  focarBusca,
  svg,
  tempoRelativo,
} from '../../ui/pagina.js';
import { ICONES_POSTAGEM } from '../postagens/postagens.ui.js';
import { buildAssinatura, buildDocumento, descreverPeriodo, todosOsItens } from './relatorios.documento.js';
import { ICONES_RELATORIO, abrirAdicionarPostagens, abrirCategorias, abrirMarcacao, abrirNovoRelatorio } from './relatorios.modais.js';
import * as relatoriosState from './relatorios.state.js';
import { ADAPTADORES, carregarPostagens, localMarcacaoImagem, localMarcacaoVideo } from './relatorios.tipos.js';

/**
 * Módulo Relatórios: lista de relatórios e o editor de um relatório (dados
 * gerais, seções com postagens, marcações, anotações e observações), com
 * prévia e exportação para PDF.
 *
 * O editor trabalha num rascunho (cópia do relatório) e salva na pausa da
 * digitação; mudanças de estrutura (adicionar, mover, remover) redesenham o
 * editor, textos não — para não perder o cursor.
 */

type ModoEditor = 'editar' | 'previa';

const ICONE_VOLTAR = '<path d="m15 18-6-6 6-6"/>';
const ICONE_PDF = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>';
const ICONE_OLHO = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>';
const ICONE_CIMA = '<path d="m18 15-6-6-6 6"/>';
const ICONE_BAIXO = '<path d="m6 9 6 6 6-6"/>';
const ICONE_DUPLICAR = '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
const ICONE_ASSINATURA = '<path d="M3 17c3-3 5.5-8 7.5-8s-1 7 1 7 3-4 4.5-4 1 3 2.5 3H21"/><path d="M3 21h18"/>';

let containerAtual: HTMLElement | null = null;
let relatorioAberto: string | null = null;
let modoEditor: ModoEditor = 'editar';
let rascunho: Relatorio | null = null;
/** Itens cuja postagem não existe mais (o relatório mostra a cópia guardada). */
let removidas = new Set<string>();
let assinatura: AssinaturaRelatorio = { nome: '', linhas: [], formato: 'com-linha', mostrarData: true };
let busca = '';
let timerSalvar: ReturnType<typeof setTimeout> | null = null;
let pendente = false;
let salvoEl: HTMLElement | null = null;
let exportando = false;

// ---------- Ciclo de vida ----------

async function carregarAssinatura(): Promise<void> {
  const r = await window.irisAPI.ajustes.getAjustes();
  if (r.ok) assinatura = r.data.assinatura;
}

export function montar(viewRoot: HTMLElement): void {
  containerAtual = viewRoot;
  relatoriosState.onStateChange(() => {
    // No editor, o rascunho é a fonte da verdade: o arquivo salvo só confirma.
    if (!relatorioAberto) redesenhar();
  });
  void Promise.all([relatoriosState.load(), carregarPostagens(), carregarAssinatura()])
    .then(redesenhar)
    .catch(falhou);
}

export function destroy(): void {
  void descarregar();
  relatoriosState.offStateChange();
  containerAtual = null;
  relatorioAberto = null;
  rascunho = null;
  salvoEl = null;
  document.getElementById('impressao')?.remove();
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

function redesenhar(): void {
  if (!containerAtual) return;
  const file = relatoriosState.getCurrentState();
  if (!file) return;
  if (relatorioAberto && rascunho) renderEditor(containerAtual, file);
  else renderLista(containerAtual, file);
}

// ---------- Salvamento do rascunho ----------

function marcarSalvo(texto: string, erro = false): void {
  if (!salvoEl) return;
  salvoEl.textContent = texto;
  salvoEl.classList.toggle('is-erro', erro);
}

async function descarregar(): Promise<void> {
  if (timerSalvar) {
    clearTimeout(timerSalvar);
    timerSalvar = null;
  }
  if (!pendente || !rascunho) return;
  pendente = false;
  try {
    await relatoriosState.salvarRelatorio(rascunho);
    marcarSalvo(`Salvo · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (erro) {
    pendente = true;
    marcarSalvo(mensagemDeErro(erro), true);
  }
}

function agendarSalvar(): void {
  pendente = true;
  marcarSalvo('Salvando…');
  if (timerSalvar) clearTimeout(timerSalvar);
  timerSalvar = setTimeout(() => void descarregar(), 600);
}

/** Mudança de estrutura: salva e redesenha o editor mantendo a rolagem. */
function mudouEstrutura(): void {
  agendarSalvar();
  const rolagem = containerAtual?.querySelector<HTMLElement>('.rel-editor-rolagem')?.scrollTop ?? 0;
  redesenhar();
  const alvo = containerAtual?.querySelector<HTMLElement>('.rel-editor-rolagem');
  if (alvo) alvo.scrollTop = rolagem;
}

// ---------- Abrir e fechar o editor ----------

/** Renova as cópias dos itens cuja postagem ainda existe; marca as que sumiram. */
function renovarCopias(rel: Relatorio): boolean {
  let mudou = false;
  removidas = new Set();
  todosOsItens(rel).forEach((item) => {
    const atual = ADAPTADORES[item.tipo].snapshot(item.postagemId);
    if (!atual) {
      removidas.add(item.id);
      return;
    }
    const semData = (s: typeof atual): string => JSON.stringify({ ...s, capturadoEm: '' });
    if (semData(atual) !== semData(item.snapshot)) {
      item.snapshot = atual;
      mudou = true;
    }
  });
  return mudou;
}

function abrirEditor(relatorioId: string): void {
  const rel = relatoriosState.getCurrentState()?.relatorios.find((r) => r.id === relatorioId);
  if (!rel) return;
  relatorioAberto = relatorioId;
  rascunho = structuredClone(rel);
  modoEditor = 'editar';
  if (renovarCopias(rascunho)) pendente = true;
  redesenhar();
  if (pendente) agendarSalvar();
}

async function fecharEditor(): Promise<void> {
  await descarregar();
  relatorioAberto = null;
  rascunho = null;
  salvoEl = null;
  redesenhar();
}

// ---------- Lista ----------

function contagem(rel: Relatorio): string {
  const itens = todosOsItens(rel);
  const partes = TIPOS_POSTAGEM.map((t) => {
    const n = itens.filter((i) => i.tipo === t.id).length;
    return n ? `${n} ${n === 1 ? t.singular.toLowerCase() : t.rotulo.toLowerCase()}` : '';
  }).filter(Boolean);
  const marcacoes = itens.reduce((t, i) => t + i.marcacoes.length, 0);
  if (marcacoes) partes.push(`${marcacoes} marcaç${marcacoes === 1 ? 'ão' : 'ões'}`);
  return partes.join(' · ') || 'Sem postagens ainda';
}

function buildCartao(rel: Relatorio): HTMLElement {
  const cartao = document.createElement('article');
  cartao.className = 'rel-cartao';
  cartao.tabIndex = 0;

  const topo = document.createElement('div');
  topo.className = 'rel-cartao-topo';
  const seq = document.createElement('span');
  seq.className = 'vd-seq';
  seq.textContent = `#${rel.seq}`;
  topo.append(seq, buildSelo(rel.situacao === 'finalizado' ? 'Finalizado' : 'Rascunho', rel.situacao === 'finalizado' ? 'ok' : 'neutro'));
  const acoes = document.createElement('span');
  acoes.className = 'rel-cartao-acoes';
  const duplicar = buildBotao('', { icone: ICONE_DUPLICAR, variante: 'fantasma', titulo: 'Duplicar relatório' });
  duplicar.addEventListener('click', (e) => {
    e.stopPropagation();
    void relatoriosState.duplicarRelatorio(rel.id).catch(falhou);
  });
  const excluir = buildBotao('', { icone: ICONES_POSTAGEM.lixeira, variante: 'fantasma', titulo: 'Excluir relatório' });
  excluir.classList.add('is-perigo');
  excluir.addEventListener('click', (e) => {
    e.stopPropagation();
    void confirmarExclusao(rel);
  });
  acoes.append(duplicar, excluir);
  topo.appendChild(acoes);
  cartao.appendChild(topo);

  const titulo = document.createElement('h3');
  titulo.className = 'rel-cartao-titulo';
  titulo.textContent = rel.titulo;
  cartao.appendChild(titulo);

  const periodo = descreverPeriodo(rel);
  if (periodo) {
    const p = document.createElement('p');
    p.className = 'rel-cartao-periodo';
    p.innerHTML = svg(ICONES_POSTAGEM.calendario, 12, 2);
    p.append(periodo);
    cartao.appendChild(p);
  }
  if (rel.contexto.trim()) {
    const ctx = document.createElement('p');
    ctx.className = 'rel-cartao-contexto';
    ctx.textContent = rel.contexto;
    cartao.appendChild(ctx);
  }
  const rodape = document.createElement('div');
  rodape.className = 'rel-cartao-rodape';
  const conta = document.createElement('span');
  conta.textContent = contagem(rel);
  const quando = document.createElement('time');
  quando.dateTime = rel.updatedAt;
  quando.textContent = `editado ${tempoRelativo(rel.updatedAt)}`;
  rodape.append(conta, quando);
  cartao.appendChild(rodape);

  cartao.addEventListener('click', () => abrirEditor(rel.id));
  cartao.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') abrirEditor(rel.id);
  });
  return cartao;
}

async function confirmarExclusao(rel: Relatorio): Promise<boolean> {
  const ok = await openConfirmModal({
    title: 'Excluir relatório',
    message: `"${rel.titulo}" e todas as marcações e anotações dele serão apagados. As postagens não são afetadas.`,
  });
  if (!ok) return false;
  await relatoriosState.excluirRelatorio(rel.id).catch(falhou);
  return true;
}

function buildAcoesGerais(): HTMLElement[] {
  const categorias = buildBotao('Categorias', { icone: ICONES_RELATORIO.categorias, variante: 'secundario', titulo: 'Categorias das marcações' });
  categorias.addEventListener('click', abrirCategorias);
  const assinar = buildBotao('', { icone: ICONE_ASSINATURA, variante: 'secundario', titulo: 'Assinatura dos relatórios (em Ajustes)' });
  assinar.addEventListener('click', () => abrirAjustes('relatorios'));
  return [assinar, categorias];
}

function renderLista(container: HTMLElement, file: RelatoriosFile): void {
  const tela = document.createElement('div');
  tela.className = 'pg-view rel-view';

  const novo = buildBotao('Novo relatório', { icone: ICONES_RELATORIO.adicionar, variante: 'primario' });
  novo.addEventListener('click', () => abrirNovoRelatorio(abrirEditor));
  tela.appendChild(
    buildCabecalho({
      icone: ICONES_RELATORIO.relatorio,
      titulo: 'Relatórios',
      subtitulo: 'Análises de vídeos e imagens com marcações, anotações e PDF',
      acoes: [...buildAcoesGerais(), novo],
    }),
  );

  if (!file.relatorios.length) {
    const comecar = buildBotao('Criar o primeiro relatório', { icone: ICONES_RELATORIO.adicionar, variante: 'primario' });
    comecar.addEventListener('click', () => novo.click());
    tela.appendChild(
      buildVazio(
        ICONES_RELATORIO.relatorio,
        'Nenhum relatório ainda',
        'Um relatório reúne postagens de Postagens (vídeos e imagens), com marcações por tempo ou por área da arte, anotações e observações — e vira PDF.',
        comecar,
      ),
    );
    container.replaceChildren(tela);
    return;
  }

  const todas = file.relatorios.flatMap((r) => todosOsItens(r).flatMap((i) => i.marcacoes as Array<{ status: string }>));
  const abertas = todas.filter((m) => m.status === 'aberta' || m.status === 'andamento').length;
  tela.appendChild(
    buildIndicadores([
      { rotulo: 'Relatórios', valor: String(file.relatorios.length), detalhe: `${file.relatorios.filter((r) => r.situacao === 'finalizado').length} finalizado(s)` },
      { rotulo: 'Rascunhos', valor: String(file.relatorios.filter((r) => r.situacao === 'rascunho').length), detalhe: 'em andamento' },
      { rotulo: 'Marcações', valor: String(todas.length), detalhe: 'em todos os relatórios' },
      { rotulo: 'Em aberto', valor: String(abertas), detalhe: 'abertas ou em andamento', tom: abertas ? 'atencao' : 'ok' },
    ]),
  );

  const barra = document.createElement('div');
  barra.className = 'pg-barra';
  barra.appendChild(
    buildBusca(busca, 'Buscar título ou contexto…', (v) => {
      busca = v;
      redesenhar();
      focarBusca(containerAtual);
    }),
  );
  tela.appendChild(barra);

  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const visiveis = file.relatorios.filter((r) => !termo || `${r.titulo} ${r.contexto} #${r.seq}`.toLocaleLowerCase('pt-BR').includes(termo));
  const grade = document.createElement('div');
  grade.className = 'rel-grade';
  visiveis.forEach((r) => grade.appendChild(buildCartao(r)));
  if (!visiveis.length) grade.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: 'Nada com essa busca.' }));
  tela.appendChild(grade);
  container.replaceChildren(tela);
}

// ---------- Editor ----------

function botaoIcone(icone: string, titulo: string, aoClicar: () => void, perigo = false): HTMLButtonElement {
  const b = buildBotao('', { icone, variante: 'fantasma', titulo });
  b.classList.add('is-mini');
  if (perigo) b.classList.add('is-perigo');
  b.addEventListener('click', aoClicar);
  return b;
}

function mover<T>(lista: T[], indice: number, sentido: -1 | 1): void {
  const alvo = indice + sentido;
  if (alvo < 0 || alvo >= lista.length) return;
  [lista[indice], lista[alvo]] = [lista[alvo]!, lista[indice]!];
}

function buildGerais(rel: Relatorio): HTMLElement {
  const { secao, conteudo } = buildSecaoModal('Informações gerais', 'Capa e abertura do documento.');
  secao.classList.add('rel-bloco');
  const texto = <K extends 'titulo' | 'contexto' | 'resumo' | 'periodoInicio' | 'periodoFim'>(chave: K) => (el: HTMLInputElement | HTMLTextAreaElement): void => {
    el.addEventListener('input', () => {
      (rel[chave] as string | undefined) = chave.startsWith('periodo') ? el.value || undefined : el.value;
      if (chave === 'titulo') {
        const cab = containerAtual?.querySelector('.rel-editor-titulo');
        if (cab) cab.textContent = el.value || 'Sem título';
      }
      agendarSalvar();
    });
  };
  const titulo = input('text', rel.titulo, 'Título do relatório');
  titulo.classList.add('is-grande');
  texto('titulo')(titulo);
  const contexto = textarea(rel.contexto, 'Para quem e por quê: cliente, campanha, objetivo', 2);
  texto('contexto')(contexto);
  const inicio = input('date', rel.periodoInicio ?? '');
  const fim = input('date', rel.periodoFim ?? '');
  texto('periodoInicio')(inicio);
  texto('periodoFim')(fim);
  const resumo = textarea(rel.resumo, 'Resumo executivo: o que foi analisado e os principais achados', 4);
  texto('resumo')(resumo);

  conteudo.append(
    campo('Título', titulo),
    campo('Contexto', contexto),
    grade2(campo('Período — de', inicio), campo('até', fim)),
    campo('Resumo / informações gerais', resumo),
    campo(
      'Situação',
      pilulas<SituacaoRelatorio>(
        [
          { id: 'rascunho', rotulo: 'Rascunho' },
          { id: 'finalizado', rotulo: 'Finalizado' },
        ],
        () => rel.situacao,
        (v) => {
          rel.situacao = v;
          agendarSalvar();
        },
      ),
    ),
  );

  const assinaturaWrap = document.createElement('div');
  assinaturaWrap.className = 'rel-assinatura-opcao';
  assinaturaWrap.appendChild(
    interruptor(
      'Assinatura no fim do documento',
      assinatura.nome.trim() ? `${assinatura.nome}${assinatura.linhas.length ? ` · ${assinatura.linhas.join(' · ')}` : ''}` : 'Nenhuma assinatura configurada em Ajustes',
      rel.incluirAssinatura,
      (v) => {
        rel.incluirAssinatura = v;
        agendarSalvar();
      },
    ),
  );
  const configurar = buildBotao('Configurar assinatura', { icone: ICONE_ASSINATURA, variante: 'fantasma' });
  configurar.classList.add('is-mini');
  configurar.addEventListener('click', () => {
    void descarregar().then(() => abrirAjustes('relatorios'));
  });
  assinaturaWrap.appendChild(configurar);
  conteudo.appendChild(assinaturaWrap);
  return secao;
}

function buildTabelaMarcacoes(item: ItemRelatorio, categorias: RelatoriosFile['categorias']): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rel-marcacoes';
  const cab = document.createElement('div');
  cab.className = 'rel-marcacoes-cab';
  const rotulo = document.createElement('span');
  rotulo.className = 'md-rotulo';
  rotulo.textContent = `Marcações · ${item.marcacoes.length}`;
  const nova = buildBotao(item.tipo === 'video' ? 'Marcar tempo' : 'Marcar área', { icone: ICONES_RELATORIO.marcacao, variante: 'secundario' });
  nova.classList.add('is-mini');
  nova.addEventListener('click', () => abrirMarcacao(item, null, categorias, mudouEstrutura));
  cab.append(rotulo, nova);
  wrap.appendChild(cab);

  if (!item.marcacoes.length) {
    const vazio = document.createElement('p');
    vazio.className = 'md-dica';
    vazio.textContent =
      item.tipo === 'video'
        ? 'Aponte um minuto (ou trecho) do vídeo e diga o que viu: ponto forte, ajuste, problema…'
        : 'Aponte uma área da arte (título, fundo, CTA…) ou uma peça do carrossel e diga o que viu.';
    wrap.appendChild(vazio);
    return wrap;
  }

  const lista = document.createElement('ol');
  lista.className = 'rel-marcacoes-lista';
  const linhas =
    item.tipo === 'video'
      ? item.marcacoes.map((m) => ({ m, local: localMarcacaoVideo(m) }))
      : item.marcacoes.map((m) => ({ m, local: localMarcacaoImagem(m) }));
  linhas.forEach(({ m, local }) => {
    const li = document.createElement('li');
    li.className = `rel-marcacao is-${m.tipo}`;
    const onde = document.createElement('span');
    onde.className = 'rel-marcacao-local';
    onde.textContent = local;
    const corpo = document.createElement('div');
    corpo.className = 'rel-marcacao-corpo';
    const selos = document.createElement('div');
    selos.className = 'rel-marcacao-selos';
    const tipo = document.createElement('span');
    tipo.className = `rel-tipo-selo is-${m.tipo}`;
    tipo.textContent = TIPOS_MARCACAO.find((t) => t.id === m.tipo)?.rotulo ?? m.tipo;
    selos.appendChild(tipo);
    if (m.categoria) selos.appendChild(Object.assign(document.createElement('span'), { className: 'rel-categoria', textContent: m.categoria }));
    const statusRotulo = STATUS_MARCACAO.find((s) => s.id === m.status)?.rotulo ?? m.status;
    selos.appendChild(buildSelo(statusRotulo, m.status === 'resolvida' ? 'ok' : m.status === 'descartada' ? 'neutro' : 'atencao'));
    const comentario = document.createElement('p');
    comentario.className = 'rel-marcacao-texto';
    comentario.textContent = m.comentario || 'Sem comentário';
    corpo.append(selos, comentario);
    if (m.observacao.trim()) {
      corpo.appendChild(Object.assign(document.createElement('p'), { className: 'rel-marcacao-obs', textContent: m.observacao }));
    }
    const acoes = document.createElement('span');
    acoes.className = 'rel-marcacao-acoes';
    acoes.append(
      botaoIcone('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>', 'Editar marcação', () => abrirMarcacao(item, m.id, categorias, mudouEstrutura)),
      botaoIcone(
        ICONES_POSTAGEM.lixeira,
        'Remover marcação',
        () => {
          (item.marcacoes as Array<{ id: string }>).splice(
            item.marcacoes.findIndex((x) => x.id === m.id),
            1,
          );
          mudouEstrutura();
        },
        true,
      ),
    );
    li.append(onde, corpo, acoes);
    lista.appendChild(li);
  });
  wrap.appendChild(lista);
  return wrap;
}

function buildItemEditor(secao: SecaoRelatorio, item: ItemRelatorio, indice: number, categorias: RelatoriosFile['categorias']): HTMLElement {
  const adaptador = ADAPTADORES[item.tipo];
  const cartao = document.createElement('article');
  cartao.className = `rel-item is-${item.tipo}`;

  const cab = document.createElement('header');
  cab.className = 'rel-item-cab';
  const tipo = document.createElement('span');
  tipo.className = 'rel-item-tipo';
  tipo.innerHTML = svg(adaptador.icone, 13, 2);
  tipo.append(`${adaptador.singular} #${item.snapshot.seq}`);
  const titulo = document.createElement('strong');
  titulo.className = 'rel-item-titulo';
  titulo.textContent = item.snapshot.titulo;
  const selos = document.createElement('span');
  selos.className = 'rel-item-selos';
  selos.appendChild(buildSelo(item.snapshot.etapa, 'neutro'));
  if (removidas.has(item.id)) selos.appendChild(buildSelo('postagem removida — usando a cópia', 'atencao'));
  const acoes = document.createElement('span');
  acoes.className = 'rel-item-acoes';
  if (!removidas.has(item.id)) {
    acoes.appendChild(
      botaoIcone(ICONE_OLHO, `Abrir ${adaptador.nome} em Postagens`, () => {
        void descarregar().then(() => adaptador.abrir(item.postagemId));
      }),
    );
  }
  acoes.append(
    botaoIcone(ICONE_CIMA, 'Subir', () => {
      mover(secao.itens, indice, -1);
      mudouEstrutura();
    }),
    botaoIcone(ICONE_BAIXO, 'Descer', () => {
      mover(secao.itens, indice, 1);
      mudouEstrutura();
    }),
    botaoIcone(
      ICONES_POSTAGEM.lixeira,
      'Tirar do relatório',
      () => {
        void openConfirmModal({
          title: 'Tirar do relatório',
          message: `"${item.snapshot.titulo}" sai desta seção, com ${item.marcacoes.length} marcação(ões) e as anotações. A postagem continua em Postagens.`,
          confirmText: 'Tirar',
        }).then((ok) => {
          if (!ok) return;
          secao.itens.splice(secao.itens.indexOf(item), 1);
          mudouEstrutura();
        });
      },
      true,
    ),
  );
  cab.append(tipo, titulo, selos, acoes);
  cartao.appendChild(cab);

  const dados = document.createElement('details');
  dados.className = 'rel-item-dados';
  const resumo = document.createElement('summary');
  const s = item.snapshot;
  resumo.textContent = [
    'Dados da postagem',
    s.dataAgendada ? s.dataAgendada.split('-').reverse().join('/') : '',
    s.redes.join(', '),
    `${s.dados.length} informação(ões)`,
  ]
    .filter(Boolean)
    .join(' · ');
  dados.appendChild(resumo);
  const dl = document.createElement('dl');
  s.dados.forEach((d) => dl.append(Object.assign(document.createElement('dt'), { textContent: d.nome }), Object.assign(document.createElement('dd'), { textContent: d.valor })));
  if (!s.dados.length) dl.appendChild(Object.assign(document.createElement('dd'), { textContent: 'Sem informações além do título.' }));
  const capturado = document.createElement('p');
  capturado.className = 'md-dica';
  capturado.textContent = removidas.has(item.id)
    ? `Cópia guardada em ${new Date(s.capturadoEm).toLocaleString('pt-BR')}; a postagem foi excluída.`
    : 'Cópia atualizada ao abrir o relatório.';
  dados.append(dl, capturado);
  cartao.appendChild(dados);

  cartao.appendChild(buildTabelaMarcacoes(item, categorias));

  const anotacoes = textarea(item.anotacoes, 'Análise geral desta postagem', 3);
  anotacoes.addEventListener('input', () => {
    item.anotacoes = anotacoes.value;
    agendarSalvar();
  });
  const observacoes = textarea(item.observacoes, 'Recomendações, pendências, próximos passos', 3);
  observacoes.addEventListener('input', () => {
    item.observacoes = observacoes.value;
    agendarSalvar();
  });
  cartao.appendChild(grade2(campo('Anotações', anotacoes), campo('Observações', observacoes)));
  return cartao;
}

function buildSecaoEditor(rel: Relatorio, secao: SecaoRelatorio, indice: number, categorias: RelatoriosFile['categorias']): HTMLElement {
  const bloco = document.createElement('section');
  bloco.className = 'md-secao rel-bloco rel-secao';

  const cab = document.createElement('header');
  cab.className = 'rel-secao-cab';
  const numero = document.createElement('span');
  numero.className = 'rel-secao-numero';
  numero.textContent = String(indice + 1);
  const titulo = input('text', secao.titulo, 'Título da seção');
  titulo.classList.add('rel-secao-titulo');
  titulo.setAttribute('aria-label', 'Título da seção');
  titulo.addEventListener('input', () => {
    secao.titulo = titulo.value;
    agendarSalvar();
  });
  const acoes = document.createElement('span');
  acoes.className = 'rel-item-acoes';
  acoes.append(
    botaoIcone(ICONE_CIMA, 'Subir seção', () => {
      mover(rel.secoes, indice, -1);
      mudouEstrutura();
    }),
    botaoIcone(ICONE_BAIXO, 'Descer seção', () => {
      mover(rel.secoes, indice, 1);
      mudouEstrutura();
    }),
    botaoIcone(
      ICONES_POSTAGEM.lixeira,
      'Remover seção',
      () => {
        void openConfirmModal({
          title: 'Remover seção',
          message: secao.itens.length
            ? `"${secao.titulo}" tem ${secao.itens.length} postagem(ns) com marcações e anotações. Tudo isso sai do relatório.`
            : `Remover "${secao.titulo}"?`,
          confirmText: 'Remover',
        }).then((ok) => {
          if (!ok) return;
          rel.secoes.splice(rel.secoes.indexOf(secao), 1);
          mudouEstrutura();
        });
      },
      true,
    ),
  );
  cab.append(numero, titulo, acoes);
  bloco.appendChild(cab);

  const texto = textarea(secao.texto, 'Introdução da seção (opcional)', 2);
  texto.addEventListener('input', () => {
    secao.texto = texto.value;
    agendarSalvar();
  });
  bloco.appendChild(texto);

  const itens = document.createElement('div');
  itens.className = 'rel-itens';
  secao.itens.forEach((item, i) => itens.appendChild(buildItemEditor(secao, item, i, categorias)));
  bloco.appendChild(itens);

  const adicionar = buildBotao('Adicionar postagens', { icone: ICONES_RELATORIO.adicionar, variante: 'secundario' });
  adicionar.addEventListener('click', () =>
    abrirAdicionarPostagens(
      {
        jaNaSecao: secao.itens.map((i) => ({ tipo: i.tipo, id: i.postagemId })),
        periodoInicio: rel.periodoInicio,
        periodoFim: rel.periodoFim,
        titulo: secao.titulo,
      },
      (escolhas) => {
        escolhas.forEach((e) => {
          const snapshot = ADAPTADORES[e.tipo].snapshot(e.id);
          if (!snapshot) return;
          const base = { id: crypto.randomUUID(), postagemId: e.id, snapshot, anotacoes: '', observacoes: '' };
          secao.itens.push(e.tipo === 'video' ? { ...base, tipo: 'video', marcacoes: [] } : { ...base, tipo: 'imagem', marcacoes: [] });
        });
        mudouEstrutura();
      },
    ),
  );
  bloco.appendChild(adicionar);
  return bloco;
}

async function exportarPdf(rel: Relatorio): Promise<void> {
  if (exportando) return;
  exportando = true;
  await descarregar();
  // O documento vai para #impressao, que o CSS de impressão mostra sozinho.
  document.getElementById('impressao')?.remove();
  const alvo = document.createElement('div');
  alvo.id = 'impressao';
  alvo.appendChild(buildDocumento(rel, assinatura));
  document.body.appendChild(alvo);
  try {
    const resultado = await relatoriosState.exportarPdf({ relatorioId: rel.id, nomeArquivo: rel.titulo });
    if (!resultado.canceled) {
      const abrir = await openConfirmModal({
        title: 'PDF exportado',
        message: `Salvo em:\n${resultado.filePath}`,
        danger: false,
        confirmText: 'Abrir PDF',
        cancelText: 'Fechar',
      });
      if (abrir) await relatoriosState.abrirPdf(resultado.filePath);
    }
  } catch (erro) {
    falhou(erro);
  } finally {
    alvo.remove();
    exportando = false;
  }
}

function renderEditor(container: HTMLElement, file: RelatoriosFile): void {
  const rel = rascunho!;
  const tela = document.createElement('div');
  tela.className = 'pg-view rel-view rel-editor';

  // Barra do editor
  const barra = document.createElement('header');
  barra.className = 'rel-editor-barra';
  const voltar = buildBotao('Relatórios', { icone: ICONE_VOLTAR, variante: 'fantasma' });
  voltar.addEventListener('click', () => void fecharEditor());
  const identidade = document.createElement('div');
  identidade.className = 'rel-editor-identidade';
  const seq = document.createElement('span');
  seq.className = 'vd-seq';
  seq.textContent = `Relatório #${rel.seq}`;
  const titulo = document.createElement('h1');
  titulo.className = 'rel-editor-titulo';
  titulo.textContent = rel.titulo || 'Sem título';
  identidade.append(seq, titulo);
  salvoEl = document.createElement('span');
  salvoEl.className = 'painel-salvo';
  salvoEl.textContent = pendente ? 'Salvando…' : 'Tudo salvo';
  const modo = buildSegmentado<ModoEditor>(
    [
      { value: 'editar', label: 'Editar' },
      { value: 'previa', label: 'Prévia' },
    ],
    modoEditor,
    (v) => {
      modoEditor = v;
      redesenhar();
    },
  );
  const duplicar = buildBotao('', { icone: ICONE_DUPLICAR, variante: 'secundario', titulo: 'Duplicar relatório' });
  duplicar.addEventListener('click', () => {
    void descarregar()
      .then(() => relatoriosState.duplicarRelatorio(rel.id))
      .then((f) => abrirEditor(f.relatorios[0]!.id))
      .catch(falhou);
  });
  const excluir = buildBotao('', { icone: ICONES_POSTAGEM.lixeira, variante: 'secundario', titulo: 'Excluir relatório' });
  excluir.classList.add('is-perigo');
  excluir.addEventListener('click', () => {
    void confirmarExclusao(rel).then((ok) => {
      if (!ok) return;
      pendente = false;
      relatorioAberto = null;
      rascunho = null;
      redesenhar();
    });
  });
  const pdf = buildBotao('Exportar PDF', { icone: ICONE_PDF, variante: 'primario' });
  pdf.addEventListener('click', () => void exportarPdf(rel));
  const espaco = document.createElement('span');
  espaco.className = 'pg-espaco';
  barra.append(voltar, identidade, espaco, salvoEl, modo, duplicar, excluir, pdf);
  tela.appendChild(barra);

  const rolagem = document.createElement('div');
  rolagem.className = 'pg-rolagem rel-editor-rolagem';

  if (modoEditor === 'previa') {
    const papel = document.createElement('div');
    papel.className = 'rel-papel';
    papel.appendChild(buildDocumento(rel, assinatura));
    const aviso = document.createElement('p');
    aviso.className = 'rel-previa-aviso';
    aviso.innerHTML = svg(ICONE_OLHO, 13, 2);
    aviso.append('Prévia do documento: é exatamente este conteúdo que vai para o PDF (em A4, com número de página no rodapé).');
    rolagem.append(aviso, papel);
  } else {
    const corpo = document.createElement('div');
    corpo.className = 'rel-editor-corpo';
    corpo.appendChild(buildGerais(rel));
    rel.secoes.forEach((s, i) => corpo.appendChild(buildSecaoEditor(rel, s, i, file.categorias)));

    const novaSecao = buildBotao('Nova seção', { icone: ICONES_RELATORIO.adicionar, variante: 'secundario' });
    novaSecao.classList.add('rel-nova-secao');
    novaSecao.addEventListener('click', () => {
      rel.secoes.push({ id: crypto.randomUUID(), titulo: `Seção ${rel.secoes.length + 1}`, texto: '', itens: [] });
      mudouEstrutura();
    });
    corpo.appendChild(novaSecao);

    const conclusao = buildSecaoModal('Conclusão', 'Fecha o documento, antes da assinatura.');
    conclusao.secao.classList.add('rel-bloco');
    const textoConclusao = textarea(rel.conclusao, 'Síntese, recomendações finais, próximos passos', 4);
    textoConclusao.addEventListener('input', () => {
      rel.conclusao = textoConclusao.value;
      agendarSalvar();
    });
    conclusao.conteudo.appendChild(textoConclusao);
    if (rel.incluirAssinatura) {
      const previa = buildAssinatura(assinatura);
      if (previa) {
        const wrap = document.createElement('div');
        wrap.className = 'rel-assinatura-previa';
        wrap.append(Object.assign(document.createElement('span'), { className: 'md-rotulo', textContent: 'Assinatura' }), previa);
        conclusao.conteudo.appendChild(wrap);
      }
    }
    corpo.appendChild(conclusao.secao);
    rolagem.appendChild(corpo);
  }
  tela.appendChild(rolagem);
  container.replaceChildren(tela);
}
