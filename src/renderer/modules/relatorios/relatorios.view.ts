import type { AssinaturaRelatorio } from '../../../shared/types/ajustes.types.js';
import { TIPOS_POSTAGEM } from '../../../shared/types/postagens.types.js';
import {
  STATUS_MARCACAO,
  TIPOS_MARCACAO,
  type BlocoRelatorio,
  type ItemRelatorio,
  type Relatorio,
  type RelatoriosFile,
  type SecaoRelatorio,
  type SituacaoRelatorio,
} from '../../../shared/types/relatorios.types.js';
import { abrirAjustes } from '../../core/navegacao.js';
import { campo, grade2, input, interruptor, pilulas, textarea } from '../../ui/campos.js';
import { mensagemDeErro, openAvisoModal, openConfirmModal } from '../../ui/modal.js';
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
import { ICONE_EMPRESA, ICONES_POSTAGEM, ordenarTags } from '../postagens/postagens.ui.js';
import { alternaveis, buildBlocosEditor, buildMenuNovoBloco, type ContextoBlocos } from './relatorios.blocos.js';
import { catalogoAtual } from './relatorios.metricas.js';
import { buildAssinatura, buildDocumento, descreverPeriodo, todosOsItens } from './relatorios.documento.js';
import { ICONES_RELATORIO, abrirAdicionarPostagens, abrirCategorias, abrirMarcacao, abrirNovoRelatorio } from './relatorios.modais.js';
import { MODELOS_SECAO, aplicarModelo, novaSecaoDoModelo, type ModeloSecao } from './relatorios.modelos.js';
import { abrirMenuIa } from '../../ui/ia.js';
import { ORIENTACOES_RELATORIO as ORIENTA, comIaRelatorio, resumoDaSecao } from './relatorios.ia.js';
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
/** Filtro da lista por empresa (id da tag); null = todas. */
let filtroEmpresa: string | null = null;
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
  atualizarMapa = null;
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
  atualizarMapa?.();
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
  topo.append(buildSelo(rel.situacao === 'finalizado' ? 'Finalizado' : 'Rascunho', rel.situacao === 'finalizado' ? 'ok' : 'neutro'));
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

  if (rel.tagsNomes.length) {
    const empresas = document.createElement('div');
    empresas.className = 'rel-cartao-empresas';
    const catalogo = catalogoAtual()?.tags ?? [];
    rel.tagIds.forEach((id, i) => {
      const chip = document.createElement('span');
      chip.className = 'rel-empresa-chip';
      const cor = catalogo.find((t) => t.id === id)?.cor;
      if (cor) chip.style.setProperty('--cor-tag', cor);
      chip.textContent = rel.tagsNomes[i] ?? '';
      empresas.appendChild(chip);
    });
    cartao.appendChild(empresas);
  }

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
  const categorias = buildBotao('Tipos de marcação', {
    icone: ICONES_RELATORIO.categorias,
    variante: 'secundario',
    titulo: 'Os tipos que você escolhe ao marcar um momento do vídeo ou uma área da imagem (ponto forte, ajuste, problema…)',
  });
  categorias.addEventListener('click', abrirCategorias);
  const assinar = buildBotao('', { icone: ICONE_ASSINATURA, variante: 'secundario', titulo: 'Assinatura dos relatórios (em Ajustes)' });
  assinar.addEventListener('click', () => abrirAjustes('relatorios'));
  return [assinar, categorias];
}

function renderLista(container: HTMLElement, file: RelatoriosFile): void {
  const tela = document.createElement('div');
  tela.className = 'pg-view rel-view';

  const novo = buildBotao('Novo relatório', { icone: ICONES_RELATORIO.adicionar, variante: 'primario' });
  novo.addEventListener('click', () =>
    abrirNovoRelatorio((id, modelo) => {
      abrirEditor(id);
      // O main cria o relatório com uma seção vazia; o modelo toma o lugar dela.
      if (rascunho && rascunho.secoes.every((x) => !x.texto.trim() && !x.blocos.length && !x.itens.length)) {
        rascunho.secoes = [];
        aplicarModelo(rascunho, modelo);
        mudouEstrutura();
      }
    }),
  );
  tela.appendChild(
    buildCabecalho({
      icone: ICONES_RELATORIO.relatorio,
      titulo: 'Relatórios',
      subtitulo: 'Documentos em PDF para mostrar resultados a uma empresa: números do período, postagens comentadas e próximos passos',
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
        'Um relatório vira um PDF em quatro partes: capa, informações gerais, seções (números, destaques e postagens comentadas) e fechamento. Ao criar, escolha um modelo — ele já monta as seções.',
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
  // Empresas que aparecem em algum relatório (pelo nome guardado, que sobrevive à tag apagada).
  const empresas = new Map<string, string>();
  file.relatorios.forEach((r) => r.tagIds.forEach((id, i) => empresas.set(id, r.tagsNomes[i] ?? id)));
  if (filtroEmpresa && !empresas.has(filtroEmpresa)) filtroEmpresa = null;
  if (empresas.size) {
    const pilulasEmpresa = document.createElement('div');
    pilulasEmpresa.className = 'md-pilulas rel-filtro-empresa';
    pilulasEmpresa.setAttribute('role', 'group');
    pilulasEmpresa.setAttribute('aria-label', 'Filtrar por empresa');
    const opcoes: Array<{ id: string | null; rotulo: string }> = [
      { id: null, rotulo: 'Todas as empresas' },
      ...[...empresas].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([id, rotulo]) => ({ id, rotulo })),
    ];
    opcoes.forEach((o) => {
      const ativo = filtroEmpresa === o.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'md-pilula';
      btn.classList.toggle('is-ativa', ativo);
      btn.setAttribute('aria-pressed', String(ativo));
      btn.textContent = o.rotulo;
      btn.addEventListener('click', () => {
        filtroEmpresa = o.id;
        redesenhar();
      });
      pilulasEmpresa.appendChild(btn);
    });
    barra.appendChild(pilulasEmpresa);
  }
  tela.appendChild(barra);

  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const visiveis = file.relatorios.filter(
    (r) =>
      (!filtroEmpresa || r.tagIds.includes(filtroEmpresa)) &&
      (!termo || `${r.titulo} ${r.contexto} ${r.tagsNomes.join(' ')}`.toLocaleLowerCase('pt-BR').includes(termo)),
  );
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

/**
 * A empresa do relatório são as tags-empresa do catálogo único (Ajustes ›
 * Empresas e tags). Mudar a escolha não mexe nos blocos de métricas já feitos
 * (são fotografias); só os novos herdam.
 */
function buildCampoEmpresa(rel: Relatorio): HTMLElement {
  const catalogo = catalogoAtual()?.tags ?? [];
  const empresas = ordenarTags(catalogo.filter((t) => t.empresa));
  // O nome de cada opção; o rótulo pode levar um aviso entre parênteses.
  const nomes = new Map<string, string>();
  const opcoes = empresas.map((t) => {
    nomes.set(t.id, t.nome);
    return { id: t.id, rotulo: t.nome };
  });
  // Já escolhida e fora da lista de empresas (tag comum de antes, ou apagada):
  // continua visível até ser desmarcada, para nada sumir sem o usuário ver.
  rel.tagIds.forEach((id, i) => {
    if (nomes.has(id)) return;
    const tag = catalogo.find((t) => t.id === id);
    const nome = tag?.nome ?? rel.tagsNomes[i] ?? 'Tag removida';
    nomes.set(id, nome);
    opcoes.push({ id, rotulo: `${nome} (${tag ? 'tag, não empresa' : 'removida'})` });
  });
  if (!opcoes.length) {
    const cadastrar = buildBotao('Cadastrar empresa', { icone: ICONE_EMPRESA, variante: 'secundario' });
    cadastrar.addEventListener('click', () => abrirAjustes('empresas'));
    const vazio = document.createElement('div');
    vazio.className = 'rel-empresa-vazia';
    vazio.append(Object.assign(document.createElement('p'), { className: 'md-dica', textContent: 'Nenhuma empresa cadastrada ainda.' }), cadastrar);
    return campo('Empresa', vazio);
  }
  return campo(
    'Empresa',
    alternaveis(opcoes, rel.tagIds, (v) => {
      rel.tagIds = v;
      // Cópia local só para a prévia; o main renova de novo ao salvar.
      rel.tagsNomes = v.map((id) => nomes.get(id) ?? '');
      mudouEstrutura();
    }),
    'A escolha de postagens e os novos blocos de métricas já vêm filtrados pela empresa. Empresas se cadastram em Ajustes › Empresas e tags.',
  );
}

// ---------- Partes do editor ----------
//
// O editor segue a ordem do PDF, em quatro partes: Capa → Informações gerais →
// Seções → Fechamento. Cada parte diz para que serve e onde aparece no
// documento — quem monta o primeiro relatório não precisa adivinhar.

const ICONE_CAPA = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>';
const ICONE_GERAIS = '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>';
const ICONE_SECOES = '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>';
const ICONE_FECHAMENTO = '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>';
const ICONE_CHECK = '<polyline points="20 6 9 17 4 12"/>';
const DICA_FORMATACAO = 'Linhas com "- " viram lista, "1. " lista numerada, e **texto** fica em negrito.';

/** Atualiza os ✓ do mapa sem redesenhar (roda a cada digitação, via agendarSalvar). */
let atualizarMapa: (() => void) | null = null;

interface OpcoesParte {
  id: string;
  icone: string;
  titulo: string;
  /** Para que serve, em uma frase. */
  paraQue: string;
  /** Onde aparece no documento. */
  noPdf: string;
}

/** Cabeçalho comum das partes: ícone, título, para que serve e "No PDF: …". */
function buildParte(o: OpcoesParte): { parte: HTMLElement; conteudo: HTMLElement } {
  const parte = document.createElement('section');
  parte.className = 'rel-parte';
  parte.id = `rel-parte-${o.id}`;
  parte.dataset.parte = o.id;
  const cab = document.createElement('header');
  cab.className = 'rel-parte-cab';
  const marca = document.createElement('span');
  marca.className = 'rel-parte-icone';
  marca.innerHTML = svg(o.icone, 16, 2);
  const textos = document.createElement('div');
  textos.className = 'rel-parte-textos';
  textos.append(
    Object.assign(document.createElement('h2'), { textContent: o.titulo }),
    Object.assign(document.createElement('p'), { textContent: o.paraQue }),
  );
  const pdf = document.createElement('p');
  pdf.className = 'rel-parte-pdf';
  pdf.innerHTML = svg(ICONE_CAPA, 12, 2);
  // Rótulo e texto num span só: como itens separados do flex, "No PDF:" quebrava em duas linhas.
  const textoPdf = document.createElement('span');
  textoPdf.append(Object.assign(document.createElement('strong'), { textContent: 'No PDF: ' }), o.noPdf);
  pdf.appendChild(textoPdf);
  textos.appendChild(pdf);
  cab.append(marca, textos);
  const conteudo = document.createElement('div');
  conteudo.className = 'rel-parte-conteudo';
  parte.append(cab, conteudo);
  return { parte, conteudo };
}

/** Cartão de campos dentro de uma parte. */
function cartaoDeCampos(...filhos: HTMLElement[]): HTMLElement {
  const cartao = document.createElement('div');
  cartao.className = 'md-secao rel-bloco rel-cartao-campos';
  cartao.append(...filhos);
  return cartao;
}

/** Liga um campo de texto a um campo do relatório, salvando na pausa. */
function ligarTexto<K extends 'titulo' | 'contexto' | 'resumo' | 'objetivos' | 'conclusao' | 'recomendacoes' | 'observacoesFinais'>(
  rel: Relatorio,
  chave: K,
  el: HTMLInputElement | HTMLTextAreaElement,
): void {
  el.addEventListener('input', () => {
    rel[chave] = el.value;
    if (chave === 'titulo') {
      const cab = containerAtual?.querySelector('.rel-editor-titulo');
      if (cab) cab.textContent = el.value || 'Sem título';
    }
    agendarSalvar();
  });
}

function buildParteCapa(rel: Relatorio): HTMLElement {
  const { parte, conteudo } = buildParte({
    id: 'capa',
    icone: ICONE_CAPA,
    titulo: 'Capa',
    paraQue: 'Identifica o relatório: do que se trata, de qual empresa e de quando.',
    noPdf: 'primeira página — o título em destaque, o contexto logo abaixo e uma ficha com empresa, período, quantas postagens e a situação.',
  });
  const titulo = input('text', rel.titulo, 'Ex.: Análise de outubro — Minha Empresa');
  titulo.classList.add('is-grande');
  ligarTexto(rel, 'titulo', titulo);
  const contexto = textarea(rel.contexto, 'Ex.: Revisão mensal dos vídeos curtos, para acompanhar a meta de alcance do trimestre.', 2);
  ligarTexto(rel, 'contexto', contexto);
  const inicio = input('date', rel.periodoInicio ?? '');
  const fim = input('date', rel.periodoFim ?? '');
  const periodo = (chave: 'periodoInicio' | 'periodoFim', el: HTMLInputElement): void => {
    el.addEventListener('input', () => {
      rel[chave] = el.value || undefined;
      agendarSalvar();
    });
  };
  periodo('periodoInicio', inicio);
  periodo('periodoFim', fim);
  conteudo.appendChild(
    cartaoDeCampos(
      campo('Título', titulo),
      buildCampoEmpresa(rel),
      grade2(campo('Período — de', inicio), campo('até', fim, 'Filtra as postagens e as métricas. Pode ficar em branco.')),
      campo('Contexto', contexto, 'Para quem é o relatório e por quê, em 1 a 3 frases.'),
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
        'Rascunho enquanto você trabalha; Finalizado quando for entregar. Aparece na ficha da capa e na lista de relatórios.',
      ),
    ),
  );
  return parte;
}

function buildParteGerais(rel: Relatorio): HTMLElement {
  const { parte, conteudo } = buildParte({
    id: 'gerais',
    icone: ICONE_GERAIS,
    titulo: 'Informações gerais',
    paraQue: 'A visão rápida: o que foi analisado e o que se descobriu. É o que a maioria das pessoas lê primeiro.',
    noPdf: 'logo depois da capa, com o título "Informações gerais". Só aparece se tiver algo escrito ou ligado aqui.',
  });
  const resumo = textarea(rel.resumo, 'Ex.: Analisamos 12 vídeos publicados em setembro. O alcance cresceu 18%, puxado pelos tutoriais curtos…', 4);
  ligarTexto(rel, 'resumo', resumo);
  const objetivos = textarea(rel.objetivos, '- Chegar a 50 mil visualizações no mês\n- Testar vídeos de até 30 segundos', 3);
  ligarTexto(rel, 'objetivos', objetivos);

  const automaticas = document.createElement('div');
  automaticas.className = 'rel-automaticas';
  automaticas.append(
    interruptor(
      'Resumo das marcações',
      'Conta os pontos fortes, ajustes e problemas marcados nas postagens e mostra no fim desta parte.',
      rel.mostrarIndicadores,
      (v) => {
        rel.mostrarIndicadores = v;
        agendarSalvar();
      },
    ),
    interruptor(
      'Lista de postagens utilizadas',
      'Uma tabela com todas as postagens analisadas no relatório, logo depois desta parte.',
      rel.mostrarPostagensUtilizadas,
      (v) => {
        rel.mostrarPostagensUtilizadas = v;
        agendarSalvar();
      },
    ),
  );

  conteudo.appendChild(
    cartaoDeCampos(
      campo(
        'Resumo executivo',
        comIaRelatorio(resumo, 'Resumo executivo', rel, undefined, ORIENTA.resumo),
        `O que foi analisado e os 2 ou 3 principais achados, com os números. ${DICA_FORMATACAO}`,
      ),
      campo(
        'Objetivos (opcional)',
        comIaRelatorio(objetivos, 'Objetivos do período', rel, undefined, ORIENTA.objetivos),
        'As metas do período. Vira o subtítulo "Objetivos".',
      ),
      campo('Gerado automaticamente', automaticas, 'O Iris monta estas partes com os dados das postagens; é só ligar.'),
    ),
  );
  return parte;
}

function buildParteFechamento(rel: Relatorio): HTMLElement {
  const { parte, conteudo } = buildParte({
    id: 'fechamento',
    icone: ICONE_FECHAMENTO,
    titulo: 'Fechamento',
    paraQue: 'A conclusão da análise e o que fazer a seguir.',
    noPdf: 'no fim do documento, depois de todas as seções: Conclusão, Próximos passos, Observações finais e a assinatura. Campo vazio não aparece.',
  });
  const area = (chave: 'conclusao' | 'recomendacoes' | 'observacoesFinais', placeholder: string): HTMLTextAreaElement => {
    const el = textarea(rel[chave], placeholder, 4);
    ligarTexto(rel, chave, el);
    return el;
  };
  const cartao = cartaoDeCampos(
    campo(
      'Conclusão',
      comIaRelatorio(area('conclusao', 'Ex.: Os vídeos curtos com gancho nos 3 primeiros segundos tiveram o dobro de retenção…'), 'Conclusão do relatório', rel, undefined, ORIENTA.conclusao),
      `A síntese do que a análise mostrou. ${DICA_FORMATACAO}`,
    ),
    campo(
      'Próximos passos (opcional)',
      comIaRelatorio(area('recomendacoes', '- O que fazer no próximo período\n- Testes, ajustes, metas'), 'Próximos passos', rel, undefined, ORIENTA.proximosPassos),
      'Ações práticas para o próximo período. Uma por linha fica mais fácil de ler.',
    ),
    campo(
      'Observações finais (opcional)',
      comIaRelatorio(area('observacoesFinais', 'Ex.: Dados do Instagram exportados em 01/10; o TikTok não informa salvamentos.'), 'Observações finais', rel, undefined, ORIENTA.observacoes),
      'Ressalvas, de onde vieram os dados, combinados. Sai numa caixa em destaque.',
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
        mudouEstrutura();
      },
    ),
  );
  const configurar = buildBotao('Configurar assinatura', { icone: ICONE_ASSINATURA, variante: 'fantasma' });
  configurar.classList.add('is-mini');
  configurar.addEventListener('click', () => {
    void descarregar().then(() => abrirAjustes('relatorios'));
  });
  assinaturaWrap.appendChild(configurar);
  cartao.appendChild(assinaturaWrap);
  if (rel.incluirAssinatura) {
    const previa = buildAssinatura(assinatura);
    if (previa) {
      const wrap = document.createElement('div');
      wrap.className = 'rel-assinatura-previa';
      wrap.append(Object.assign(document.createElement('span'), { className: 'md-rotulo', textContent: 'Como a assinatura vai sair' }), previa);
      cartao.appendChild(wrap);
    }
  }
  conteudo.appendChild(cartao);
  return parte;
}

function adicionarSecao(rel: Relatorio, modelo: ModeloSecao): void {
  const secao = novaSecaoDoModelo(modelo, rel, rel.secoes.length + 1);
  rel.secoes.push(secao);
  mudouEstrutura();
  // Leva até a seção nova, que entra no fim da lista.
  requestAnimationFrame(() => document.getElementById(`rel-parte-secao-${secao.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/** "Adicionar seção": menu com os tipos prontos, cada um dizendo o que já traz. */
function buildBotaoNovaSecao(rel: Relatorio): HTMLButtonElement {
  const botao = buildBotao('Adicionar seção', { icone: ICONES_RELATORIO.adicionar, variante: 'secundario' });
  botao.classList.add('rel-nova-secao');
  botao.setAttribute('aria-haspopup', 'menu');
  botao.addEventListener('click', () =>
    abrirMenuIa(
      botao,
      MODELOS_SECAO.map((m) => ({ rotulo: m.titulo, dica: m.dica, icone: ICONE_SECOES, fazer: () => adicionarSecao(rel, m.id) })),
      { titulo: 'Que tipo de seção?' },
    ),
  );
  return botao;
}

function buildParteSecoes(rel: Relatorio, categorias: RelatoriosFile['categorias']): HTMLElement {
  const { parte, conteudo } = buildParte({
    id: 'secoes',
    icone: ICONE_SECOES,
    titulo: 'Seções',
    paraQue:
      'O corpo do relatório, em capítulos (ex.: "Resultados do mês", "Vídeos em destaque"). Cada seção tem, nesta ordem: uma introdução, blocos de conteúdo (números, tabelas, destaques) e as postagens analisadas.',
    noPdf: 'depois das informações gerais, cada seção com o título numerado (1., 2., …).',
  });
  if (!rel.secoes.length) {
    const vazio = document.createElement('div');
    vazio.className = 'rel-secoes-vazio';
    vazio.appendChild(Object.assign(document.createElement('p'), { textContent: 'Nenhuma seção ainda. Escolha por onde começar:' }));
    const opcoes = document.createElement('div');
    opcoes.className = 'rel-secoes-opcoes';
    MODELOS_SECAO.forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rel-secao-opcao';
      b.append(Object.assign(document.createElement('strong'), { textContent: m.titulo }), Object.assign(document.createElement('span'), { textContent: m.dica }));
      b.addEventListener('click', () => adicionarSecao(rel, m.id));
      opcoes.appendChild(b);
    });
    vazio.appendChild(opcoes);
    conteudo.appendChild(vazio);
    return parte;
  }
  rel.secoes.forEach((s, i) => conteudo.appendChild(buildSecaoEditor(rel, s, i, categorias)));
  conteudo.appendChild(buildBotaoNovaSecao(rel));
  return parte;
}

// ---------- Mapa do relatório ----------

/**
 * O bloco já diz alguma coisa no PDF? Um bloco recém-criado pelo modelo está
 * vazio e não deve marcar a seção como feita. Métricas contam sempre: os
 * números saem sozinhos das postagens.
 */
function blocoPreenchido(b: BlocoRelatorio): boolean {
  switch (b.tipo) {
    case 'metricas':
      return true;
    case 'tabela':
      return b.linhas.some((linha) => linha.some((c) => c.trim()));
    case 'analise':
      return Boolean(b.texto.trim()) || b.indicadores.some((i) => i.valor.trim());
    case 'colunas':
      return Boolean(b.textoEsquerda.trim() || b.textoDireita.trim());
    case 'quebra':
      return false;
    default:
      return Boolean(b.texto.trim());
  }
}

function secaoPreenchida(s: SecaoRelatorio): boolean {
  return Boolean(s.texto.trim()) || s.itens.length > 0 || s.blocos.some(blocoPreenchido);
}

interface ItemMapa {
  alvo: string;
  rotulo: string;
  numero?: string;
  feito: () => boolean;
  /** Seção: fica recuada, dentro de "Seções". */
  filho?: boolean;
}

function itensDoMapa(rel: Relatorio): ItemMapa[] {
  return [
    { alvo: 'capa', rotulo: 'Capa', feito: () => Boolean(rel.titulo.trim()) && (rel.tagIds.length > 0 || Boolean(rel.periodoInicio) || Boolean(rel.contexto.trim())) },
    { alvo: 'gerais', rotulo: 'Informações gerais', feito: () => Boolean(rel.resumo.trim()) },
    { alvo: 'secoes', rotulo: 'Seções', feito: () => rel.secoes.some(secaoPreenchida) },
    ...rel.secoes.map((s, i) => ({
      alvo: `secao-${s.id}`,
      rotulo: s.titulo.trim() || 'Sem título',
      numero: String(i + 1),
      feito: () => secaoPreenchida(s),
      filho: true,
    })),
    { alvo: 'fechamento', rotulo: 'Fechamento', feito: () => Boolean(rel.conclusao.trim()) },
  ];
}

/**
 * Coluna fixa com a estrutura do documento, na ordem do PDF. ✓ quando a parte
 * tem conteúdo; clicar leva até ela; a parte na tela fica marcada.
 */
function buildMapa(rel: Relatorio): HTMLElement {
  const mapa = document.createElement('nav');
  mapa.className = 'rel-mapa';
  mapa.setAttribute('aria-label', 'Estrutura do relatório');
  mapa.append(
    Object.assign(document.createElement('p'), { className: 'rel-mapa-titulo', textContent: 'Estrutura do relatório' }),
    Object.assign(document.createElement('p'), { className: 'rel-mapa-dica', textContent: 'O PDF segue esta ordem.' }),
  );
  const lista = document.createElement('ol');
  lista.className = 'rel-mapa-lista';
  const itens = itensDoMapa(rel);
  const botoes = itens.map((item) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rel-mapa-item';
    b.classList.toggle('is-filho', Boolean(item.filho));
    b.dataset.alvo = item.alvo;
    const estado = document.createElement('span');
    estado.className = 'rel-mapa-estado';
    const rotulo = document.createElement('span');
    rotulo.className = 'rel-mapa-rotulo';
    rotulo.textContent = item.numero ? `${item.numero}. ${item.rotulo}` : item.rotulo;
    b.append(estado, rotulo);
    b.addEventListener('click', () => document.getElementById(`rel-parte-${item.alvo}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    li.appendChild(b);
    lista.appendChild(li);
    return { b, estado, rotulo, item };
  });
  mapa.appendChild(lista);
  atualizarMapa = () => {
    botoes.forEach(({ b, estado, rotulo, item }) => {
      const feito = item.feito();
      b.classList.toggle('is-feito', feito);
      estado.innerHTML = feito ? svg(ICONE_CHECK, 11, 3) : '';
      estado.title = feito ? 'Com conteúdo' : 'Vazio';
      if (item.filho) {
        const s = rel.secoes.find((x) => `secao-${x.id}` === item.alvo);
        if (s) rotulo.textContent = `${item.numero}. ${s.titulo.trim() || 'Sem título'}`;
      }
    });
  };
  atualizarMapa();
  return mapa;
}

/** Marca no mapa a parte que está no topo da área de edição. */
function acompanharRolagem(rolagem: HTMLElement): void {
  const marcar = (): void => {
    const topo = rolagem.getBoundingClientRect().top + 100;
    let atual = '';
    rolagem.querySelectorAll<HTMLElement>('[data-parte]').forEach((el) => {
      if (el.getBoundingClientRect().top <= topo) atual = el.dataset.parte ?? atual;
    });
    rolagem.querySelectorAll<HTMLElement>('.rel-mapa-item').forEach((b) => b.classList.toggle('is-atual', b.dataset.alvo === (atual || 'capa')));
  };
  rolagem.addEventListener('scroll', marcar, { passive: true });
  requestAnimationFrame(marcar);
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
  tipo.append(adaptador.singular);
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

/** Um dos três passos de uma seção: rótulo, explicação e o conteúdo. */
function buildPasso(titulo: string, dica: string, ...conteudo: HTMLElement[]): HTMLElement {
  const passo = document.createElement('div');
  passo.className = 'rel-passo';
  const cab = document.createElement('div');
  cab.className = 'rel-passo-cab';
  cab.append(Object.assign(document.createElement('strong'), { textContent: titulo }), Object.assign(document.createElement('span'), { textContent: dica }));
  passo.append(cab, ...conteudo);
  return passo;
}

function buildSecaoEditor(rel: Relatorio, secao: SecaoRelatorio, indice: number, categorias: RelatoriosFile['categorias']): HTMLElement {
  const bloco = document.createElement('section');
  bloco.className = 'md-secao rel-bloco rel-secao';
  bloco.id = `rel-parte-secao-${secao.id}`;
  bloco.dataset.parte = `secao-${secao.id}`;

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

  const texto = textarea(secao.texto, 'Ex.: Nesta seção, os números de alcance e engajamento do período.', 2);
  texto.addEventListener('input', () => {
    secao.texto = texto.value;
    agendarSalvar();
  });
  bloco.appendChild(
    buildPasso('Introdução', 'Um parágrafo que apresenta a seção. Opcional.', comIaRelatorio(texto, `Introdução da seção "${secao.titulo}"`, rel, () => resumoDaSecao(secao), ORIENTA.secao)),
  );

  // Blocos livres (texto, destaque, tabela, métricas, quebra), antes das postagens.
  const ctx: ContextoBlocos = { rel, agendarSalvar, mudouEstrutura };
  bloco.appendChild(
    buildPasso(
      'Conteúdo',
      'Números, tabelas, destaques e textos — aparecem depois da introdução, nesta ordem.',
      buildBlocosEditor(secao, ctx),
      buildMenuNovoBloco(secao, ctx),
    ),
  );

  const itens = document.createElement('div');
  itens.className = 'rel-itens';
  secao.itens.forEach((item, i) => itens.appendChild(buildItemEditor(secao, item, i, categorias)));

  const adicionar = buildBotao('Adicionar postagens', { icone: ICONES_RELATORIO.adicionar, variante: 'secundario' });
  adicionar.classList.add('rel-passo-acao');
  adicionar.addEventListener('click', () =>
    abrirAdicionarPostagens(
      {
        jaNaSecao: secao.itens.map((i) => ({ tipo: i.tipo, id: i.postagemId })),
        tagIds: rel.tagIds,
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
  bloco.appendChild(
    buildPasso(
      'Postagens analisadas',
      'Vídeos e imagens comentados um a um. Cada um entra com uma cópia dos dados; marque momentos do vídeo ou áreas da imagem com o que observou. Opcional.',
      itens,
      adicionar,
    ),
  );
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
  seq.textContent = 'Relatório';
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
    const layout = document.createElement('div');
    layout.className = 'rel-editor-layout';
    const corpo = document.createElement('div');
    corpo.className = 'rel-editor-corpo';
    corpo.append(buildParteCapa(rel), buildParteGerais(rel), buildParteSecoes(rel, file.categorias), buildParteFechamento(rel));
    layout.append(buildMapa(rel), corpo);
    rolagem.appendChild(layout);
    acompanharRolagem(rolagem);
  }
  tela.appendChild(rolagem);
  container.replaceChildren(tela);
}
