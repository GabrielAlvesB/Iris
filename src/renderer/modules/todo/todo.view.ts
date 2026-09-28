import type { KanbanBoard } from '../../../shared/types/kanban.types.js';
import {
  CORES_TODO,
  PRIORIDADES_TODO,
  type Checklist,
  type ItemTodo,
  type PrioridadeTodo,
  type TodoFile,
} from '../../../shared/types/todo.types.js';
import { abrirModulo } from '../../core/navegacao.js';
import { campo, erroInline, grade2, input, interruptor, pilulas, textarea } from '../../ui/campos.js';
import {
  buildSecaoModal,
  empilharCamada,
  haModalAberto,
  mensagemDeErro,
  openAvisoModal,
  openConfirmModal,
  openCustomModal,
} from '../../ui/modal.js';
import {
  buildAviso,
  buildBotao,
  buildBusca,
  buildCabecalho,
  buildIndicadores,
  buildSegmentado,
  buildSelo,
  buildVazio,
  focarBusca,
  svg,
  type Tom,
} from '../../ui/pagina.js';
import * as kanbanState from '../kanban/kanban.state.js';
import * as todoState from './todo.state.js';

/**
 * To-do: checklists independentes em cartões. Tudo se edita no próprio cartão
 * (título, itens, marcar, arrastar); o que é menos frequente (detalhes, envio
 * ao Kanban, arquivar) fica no menu "⋯".
 *
 * Cada mudança devolve o arquivo inteiro e a tela redesenha; para isso não
 * atrapalhar a digitação, o foco do campo "Adicionar item" e a rolagem são
 * devolvidos depois do redesenho.
 */

type Filtro = 'abertas' | 'concluidas' | 'arquivadas' | 'todas';
type Ordenacao = 'manual' | 'prazo' | 'prioridade';

const ICONES = {
  todo: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="m3 6 1 1 2-2"/><path d="m3 12 1 1 2-2"/><path d="m3 18 1 1 2-2"/>',
  mais: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  mais3: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  alca: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  xis: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  editar: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  duplicar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  arquivo: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  restaurar: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
  lixeira: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  checkTodos: '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  vassoura: '<path d="m13 11 9-9"/><path d="M14.6 12.6c.8.8.9 2.1.2 3L10 22l-8-8 6.4-4.8c.9-.7 2.2-.6 3 .2Z"/><path d="m6.8 10.4 6.8 6.8"/>',
  seta: '<path d="m6 9 6 6 6-6"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
} as const;

const TOM_PRIORIDADE: Record<PrioridadeTodo, Tom> = { alta: 'erro', media: 'atencao', baixa: 'neutro' };
const PESO_PRIORIDADE: Record<PrioridadeTodo, number> = { alta: 0, media: 1, baixa: 2 };

const CHAVE_FEITOS_ABERTOS = 'iris.todo.feitosAbertos';

let containerAtual: HTMLElement | null = null;
let filtro: Filtro = 'abertas';
let ordenacao: Ordenacao = 'manual';
let busca = '';
/** Checklists com a lista de concluídos aberta (fechada por padrão, para não empurrar o que falta). */
let feitosAbertos = lerFeitosAbertos();
/** Seletor do campo que recebe o foco depois do próximo redesenho. */
let focoPendente: string | null = null;
let sortables: InstanceType<typeof Sortable>[] = [];
let fecharMenu: (() => void) | null = null;

// ---------- Ciclo de vida ----------

export function montar(viewRoot: HTMLElement): void {
  containerAtual = viewRoot;
  todoState.onStateChange(() => redesenhar());
  document.addEventListener('keydown', onAtalho);
  // O quadro do Kanban serve para mostrar onde está o card de quem já foi
  // enviado; se falhar, a tela funciona com o nome da coluna guardado no envio.
  void Promise.all([todoState.load(), kanbanState.loadBoard().catch(() => undefined)])
    .then(redesenhar)
    .catch(falhou);
}

export function destroy(): void {
  document.removeEventListener('keydown', onAtalho);
  fecharMenu?.();
  destruirSortables();
  todoState.offStateChange();
  containerAtual = null;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

/** Roda a ação do state e mostra o erro num aviso, sem deixar a promessa solta. */
function executar(acao: Promise<unknown>): void {
  void acao.catch(falhou);
}

function onAtalho(e: KeyboardEvent): void {
  if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey || haModalAberto()) return;
  const alvo = e.target as HTMLElement | null;
  if (alvo && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName))) return;
  const campoNovo = containerAtual?.querySelector<HTMLInputElement>('.td-nova input');
  if (!campoNovo) return;
  e.preventDefault();
  campoNovo.focus();
}

function lerFeitosAbertos(): Set<string> {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_FEITOS_ABERTOS) ?? '[]') as unknown;
    return new Set(Array.isArray(bruto) ? bruto.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function salvarFeitosAbertos(): void {
  try {
    localStorage.setItem(CHAVE_FEITOS_ABERTOS, JSON.stringify([...feitosAbertos]));
  } catch {
    // Só conveniência de tela.
  }
}

function destruirSortables(): void {
  sortables.forEach((s) => s.destroy());
  sortables = [];
}

function redesenhar(): void {
  const file = todoState.getCurrentState();
  if (!containerAtual || !file) return;
  fecharMenu?.();
  const rolagemAntes = containerAtual.querySelector<HTMLElement>('.pg-rolagem')?.scrollTop ?? 0;
  render(containerAtual, file);
  const rolagem = containerAtual.querySelector<HTMLElement>('.pg-rolagem');
  if (rolagem) rolagem.scrollTop = rolagemAntes;
  if (focoPendente) {
    containerAtual.querySelector<HTMLElement>(focoPendente)?.focus();
    focoPendente = null;
  }
}

// ---------- Regras de exibição ----------

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diaDoIso(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dataCurta(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return ano === String(new Date().getFullYear()) ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`;
}

function concluida(l: Checklist): boolean {
  return l.itens.length > 0 && l.itens.every((i) => i.feito);
}

function atrasada(l: Checklist): boolean {
  return Boolean(l.prazo && l.prazo < hojeIso() && !concluida(l));
}

function passaNoFiltro(l: Checklist, f: Filtro): boolean {
  if (f === 'arquivadas') return l.arquivada;
  if (l.arquivada) return false;
  if (f === 'abertas') return !concluida(l);
  if (f === 'concluidas') return concluida(l);
  return true;
}

function casaComBusca(l: Checklist): boolean {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  if (!termo) return true;
  return [l.titulo, l.descricao, ...l.itens.map((i) => i.texto)].join('\n').toLocaleLowerCase('pt-BR').includes(termo);
}

function ordenar(lista: Checklist[]): Checklist[] {
  const copia = lista.slice();
  if (ordenacao === 'prazo') {
    copia.sort((a, b) => (a.prazo ?? '9999').localeCompare(b.prazo ?? '9999') || a.ordem - b.ordem);
  } else if (ordenacao === 'prioridade') {
    const peso = (l: Checklist): number => (l.prioridade ? PESO_PRIORIDADE[l.prioridade] : 3);
    copia.sort((a, b) => peso(a) - peso(b) || a.ordem - b.ordem);
  } else {
    copia.sort((a, b) => a.ordem - b.ordem);
  }
  return copia;
}

/** Arrastar é só na ordem manual e sem busca: nos outros modos a posição não é a gravada. */
function podeArrastar(): boolean {
  return ordenacao === 'manual' && !busca.trim();
}

// ---------- Tela ----------

function render(container: HTMLElement, file: TodoFile): void {
  destruirSortables();
  const tela = document.createElement('div');
  tela.className = 'pg-view td-view';

  const nova = buildBotao('Nova checklist', { icone: ICONES.mais, variante: 'primario', titulo: 'Criar com detalhes (atalho: N para a criação rápida)' });
  nova.addEventListener('click', () => abrirDetalhes(null));
  tela.appendChild(
    buildCabecalho({
      icone: ICONES.todo,
      titulo: 'To-do',
      subtitulo: 'Checklists do dia a dia — marque, reorganize e mande qualquer uma para o Kanban',
      acoes: [nova],
    }),
  );

  if (!file.checklists.length) {
    const comecar = buildBotao('Criar a primeira checklist', { icone: ICONES.mais, variante: 'primario' });
    comecar.addEventListener('click', () => abrirDetalhes(null));
    tela.appendChild(
      buildVazio(
        ICONES.todo,
        'Nenhuma checklist ainda',
        'Crie quantas quiser — uma para a semana, outra para um projeto, outra para uma gravação. Cada uma pode virar um card no Kanban com os itens como subtarefas.',
        comecar,
      ),
    );
    container.replaceChildren(tela);
    return;
  }

  tela.appendChild(buildResumo(file));
  tela.appendChild(buildBarra(file));

  const visiveis = ordenar(file.checklists.filter((l) => passaNoFiltro(l, filtro) && casaComBusca(l)));
  const rolagem = document.createElement('div');
  rolagem.className = 'pg-rolagem td-rolagem';
  const grade = document.createElement('div');
  grade.className = 'td-grade';
  if (filtro === 'abertas' || filtro === 'todas') grade.appendChild(buildCriacaoRapida());
  visiveis.forEach((l) => grade.appendChild(buildCartao(l)));
  rolagem.appendChild(grade);
  if (!visiveis.length) {
    const vazio = busca.trim()
      ? 'Nada encontrado com essa busca.'
      : {
          abertas: 'Nada pendente. Crie uma checklist acima ou veja as concluídas.',
          concluidas: 'Nenhuma checklist com todos os itens marcados.',
          arquivadas: 'Nenhuma checklist arquivada.',
          todas: 'Nenhuma checklist.',
        }[filtro];
    rolagem.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio td-vazio', textContent: vazio }));
  }
  tela.appendChild(rolagem);
  container.replaceChildren(tela);

  if (podeArrastar() && visiveis.length > 1) ligarArrasteDasChecklists(grade, file);
}

function buildResumo(file: TodoFile): HTMLElement {
  const ativas = file.checklists.filter((l) => !l.arquivada);
  const abertas = ativas.filter((l) => !concluida(l));
  const pendentes = ativas.reduce((t, l) => t + l.itens.filter((i) => !i.feito).length, 0);
  const hoje = hojeIso();
  const feitosHoje = ativas.reduce((t, l) => t + l.itens.filter((i) => i.feito && i.feitoEm && diaDoIso(i.feitoEm) === hoje).length, 0);
  const atrasadas = ativas.filter(atrasada).length;
  const noKanban = ativas.filter((l) => l.envio).length;
  return buildIndicadores([
    { rotulo: 'Checklists abertas', valor: String(abertas.length), detalhe: `${ativas.length - abertas.length} concluída${ativas.length - abertas.length === 1 ? '' : 's'}` },
    { rotulo: 'Itens pendentes', valor: String(pendentes), detalhe: pendentes ? 'por fazer' : 'tudo em dia', tom: pendentes ? 'neutro' : 'ok' },
    { rotulo: 'Feitos hoje', valor: String(feitosHoje), detalhe: feitosHoje ? 'bom ritmo' : 'nenhum ainda', tom: feitosHoje ? 'ok' : 'neutro' },
    { rotulo: 'Atrasadas', valor: String(atrasadas), detalhe: atrasadas ? 'prazo vencido' : 'nenhuma', tom: atrasadas ? 'erro' : 'ok' },
    { rotulo: 'No Kanban', valor: String(noKanban), detalhe: 'enviadas como card' },
  ]);
}

function buildBarra(file: TodoFile): HTMLElement {
  const barra = document.createElement('div');
  barra.className = 'pg-barra td-barra';
  barra.appendChild(
    buildBusca(busca, 'Buscar checklist ou item…', (v) => {
      busca = v;
      redesenhar();
      focarBusca(containerAtual);
    }),
  );
  const conta = (f: Filtro): number => file.checklists.filter((l) => passaNoFiltro(l, f)).length;
  barra.appendChild(
    buildSegmentado<Filtro>(
      [
        { value: 'abertas', label: `Abertas · ${conta('abertas')}` },
        { value: 'concluidas', label: `Concluídas · ${conta('concluidas')}` },
        { value: 'todas', label: 'Todas' },
        { value: 'arquivadas', label: `Arquivadas · ${conta('arquivadas')}` },
      ],
      filtro,
      (v) => {
        filtro = v;
        redesenhar();
      },
    ),
  );
  const ordem = document.createElement('div');
  ordem.className = 'td-ordem';
  ordem.appendChild(Object.assign(document.createElement('span'), { className: 'td-ordem-rotulo', textContent: 'Ordenar' }));
  ordem.appendChild(
    buildSegmentado<Ordenacao>(
      [
        { value: 'manual', label: 'Manual' },
        { value: 'prazo', label: 'Prazo' },
        { value: 'prioridade', label: 'Prioridade' },
      ],
      ordenacao,
      (v) => {
        ordenacao = v;
        redesenhar();
      },
    ),
  );
  barra.appendChild(ordem);
  return barra;
}

/** Cartão-campo no topo da grade: título + Enter cria e já leva ao primeiro item. */
function buildCriacaoRapida(): HTMLElement {
  const form = document.createElement('form');
  form.className = 'td-nova';
  const icone = document.createElement('span');
  icone.className = 'td-nova-icone';
  icone.innerHTML = svg(ICONES.mais, 16, 2);
  const campoTitulo = document.createElement('input');
  campoTitulo.type = 'text';
  campoTitulo.placeholder = 'Nova checklist… (Enter cria)';
  campoTitulo.setAttribute('aria-label', 'Título da nova checklist');
  campoTitulo.maxLength = 200;
  form.append(icone, campoTitulo);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const titulo = campoTitulo.value.trim();
    if (!titulo) return;
    campoTitulo.disabled = true;
    void todoState
      .criarChecklist({ titulo })
      .then((id) => {
        if (!id) return;
        // A nova pode não aparecer no filtro "concluídas"; nas abertas, sim.
        focoPendente = `.td-cartao[data-id="${id}"] .td-add input`;
        redesenhar();
      })
      .catch((erro) => {
        campoTitulo.disabled = false;
        falhou(erro);
      });
  });
  return form;
}

// ---------- Cartão ----------

function buildCartao(l: Checklist): HTMLElement {
  const cartao = document.createElement('article');
  cartao.className = 'td-cartao';
  cartao.classList.toggle('is-concluida', concluida(l));
  cartao.classList.toggle('is-arquivada', l.arquivada);
  cartao.dataset.id = l.id;
  cartao.style.setProperty('--td-cor', l.cor);

  cartao.appendChild(buildCabecaCartao(l));

  const selos = buildSelosCartao(l);
  if (selos.childElementCount) cartao.appendChild(selos);

  if (l.descricao) {
    cartao.appendChild(Object.assign(document.createElement('p'), { className: 'td-descricao', textContent: l.descricao }));
  }

  if (l.itens.length) cartao.appendChild(buildProgresso(l));

  const pendentes = l.itens.filter((i) => !i.feito);
  const feitos = l.itens.filter((i) => i.feito);

  const lista = document.createElement('ul');
  lista.className = 'td-itens';
  lista.setAttribute('aria-label', `Itens pendentes de ${l.titulo}`);
  pendentes.forEach((i) => lista.appendChild(buildItem(l, i)));
  cartao.appendChild(lista);
  if (!l.arquivada && pendentes.length > 1) ligarArrasteDosItens(lista, l.id);

  if (!l.arquivada) cartao.appendChild(buildAdicionarItem(l));

  if (feitos.length) {
    const aberto = feitosAbertos.has(l.id);
    const alternar = document.createElement('button');
    alternar.type = 'button';
    alternar.className = 'td-feitos-toggle';
    alternar.classList.toggle('is-aberto', aberto);
    alternar.setAttribute('aria-expanded', String(aberto));
    alternar.innerHTML = svg(ICONES.seta, 13, 2.2);
    alternar.append(`Concluídos · ${feitos.length}`);
    alternar.addEventListener('click', () => {
      if (aberto) feitosAbertos.delete(l.id);
      else feitosAbertos.add(l.id);
      salvarFeitosAbertos();
      redesenhar();
    });
    cartao.appendChild(alternar);
    if (aberto) {
      const listaFeitos = document.createElement('ul');
      listaFeitos.className = 'td-itens is-feitos';
      listaFeitos.setAttribute('aria-label', `Itens concluídos de ${l.titulo}`);
      feitos.forEach((i) => listaFeitos.appendChild(buildItem(l, i)));
      cartao.appendChild(listaFeitos);
    }
  }

  cartao.appendChild(buildRodapeCartao(l));
  return cartao;
}

function buildCabecaCartao(l: Checklist): HTMLElement {
  const cab = document.createElement('header');
  cab.className = 'td-cartao-cab';

  if (podeArrastar() && !l.arquivada) {
    const alca = document.createElement('span');
    alca.className = 'td-alca td-alca-cartao';
    alca.title = 'Arraste para reordenar';
    alca.innerHTML = svg(ICONES.alca, 14, 2);
    cab.appendChild(alca);
  }

  const titulo = document.createElement('h3');
  titulo.className = 'td-titulo';
  const botaoTitulo = document.createElement('button');
  botaoTitulo.type = 'button';
  botaoTitulo.className = 'td-titulo-btn';
  botaoTitulo.textContent = l.titulo;
  botaoTitulo.title = 'Clique para renomear';
  botaoTitulo.addEventListener('click', () => {
    editarNoLugar(titulo, l.titulo, 200, (novo) => todoState.atualizarChecklist({ checklistId: l.id, titulo: novo }));
  });
  titulo.appendChild(botaoTitulo);
  cab.appendChild(titulo);

  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'td-icone-btn td-menu-btn';
  menu.title = 'Mais ações';
  menu.setAttribute('aria-label', `Mais ações de ${l.titulo}`);
  menu.setAttribute('aria-haspopup', 'menu');
  menu.innerHTML = svg(ICONES.mais3, 16, 2);
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirMenu(menu, l);
  });
  cab.appendChild(menu);
  return cab;
}

function buildSelosCartao(l: Checklist): HTMLElement {
  const selos = document.createElement('div');
  selos.className = 'td-selos';
  if (l.arquivada) selos.appendChild(buildSelo('Arquivada', 'neutro'));
  if (l.prioridade) {
    const rotulo = PRIORIDADES_TODO.find((p) => p.id === l.prioridade)?.rotulo ?? l.prioridade;
    selos.appendChild(buildSelo(`Prioridade ${rotulo.toLocaleLowerCase('pt-BR')}`, TOM_PRIORIDADE[l.prioridade]));
  }
  if (l.prazo) {
    const hoje = hojeIso();
    if (concluida(l)) selos.appendChild(buildSelo(`Prazo ${dataCurta(l.prazo)}`, 'ok'));
    else if (l.prazo < hoje) selos.appendChild(buildSelo(`Atrasada · ${dataCurta(l.prazo)}`, 'erro'));
    else if (l.prazo === hoje) selos.appendChild(buildSelo('Vence hoje', 'atencao'));
    else selos.appendChild(buildSelo(`Até ${dataCurta(l.prazo)}`, 'neutro'));
  }
  const envio = buildSeloEnvio(l);
  if (envio) selos.appendChild(envio);
  return selos;
}

/**
 * Onde está o card agora: coluna e subtarefas marcadas no Kanban. Sem o quadro
 * carregado, vale o nome da coluna guardado no envio.
 */
function buildSeloEnvio(l: Checklist): HTMLElement | null {
  if (!l.envio) return null;
  const board: KanbanBoard | null = kanbanState.getCurrentBoard();
  const card = board?.cards.find((c) => c.id === l.envio?.kanbanCardId);
  let texto: string;
  let tom: Tom = 'ok';
  if (board && !card) {
    texto = 'Card apagado no Kanban';
    tom = 'atencao';
  } else if (card) {
    const coluna = board?.columns.find((c) => c.id === card.columnId)?.title ?? l.envio.colunaNome;
    const subtarefas = card.subtasks ?? [];
    texto = `No Kanban · ${coluna}${subtarefas.length ? ` · ${subtarefas.filter((s) => s.done).length}/${subtarefas.length}` : ''}`;
  } else {
    texto = `No Kanban · ${l.envio.colunaNome}`;
  }
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'td-selo-btn';
  botao.title = tom === 'ok' ? 'Abrir o Kanban' : 'O card foi apagado; envie de novo pelo menu';
  botao.appendChild(buildSelo(texto, tom));
  botao.addEventListener('click', () => {
    if (tom === 'ok') abrirModulo('kanban');
    else abrirEnvio(l);
  });
  return botao;
}

function buildProgresso(l: Checklist): HTMLElement {
  const feitos = l.itens.filter((i) => i.feito).length;
  const total = l.itens.length;
  const wrap = document.createElement('div');
  wrap.className = 'td-progresso';
  const barra = document.createElement('div');
  barra.className = 'td-progresso-trilho';
  barra.setAttribute('role', 'progressbar');
  barra.setAttribute('aria-valuemin', '0');
  barra.setAttribute('aria-valuemax', String(total));
  barra.setAttribute('aria-valuenow', String(feitos));
  barra.setAttribute('aria-label', `${feitos} de ${total} itens feitos`);
  const cheio = document.createElement('i');
  cheio.style.width = `${Math.round((feitos / total) * 100)}%`;
  cheio.classList.toggle('is-completo', feitos === total);
  barra.appendChild(cheio);
  const numero = document.createElement('span');
  numero.className = 'td-progresso-num';
  numero.textContent = `${feitos}/${total}`;
  wrap.append(barra, numero);
  return wrap;
}

function buildItem(l: Checklist, item: ItemTodo): HTMLElement {
  const li = document.createElement('li');
  li.className = 'td-item';
  li.classList.toggle('is-feito', item.feito);
  li.dataset.id = item.id;

  if (!item.feito && !l.arquivada) {
    const alca = document.createElement('span');
    alca.className = 'td-alca td-alca-item';
    alca.title = 'Arraste para reordenar';
    alca.innerHTML = svg(ICONES.alca, 12, 2);
    li.appendChild(alca);
  }

  const caixa = document.createElement('input');
  caixa.type = 'checkbox';
  caixa.className = 'td-caixa';
  caixa.checked = item.feito;
  caixa.disabled = l.arquivada;
  caixa.setAttribute('aria-label', `${item.feito ? 'Desmarcar' : 'Marcar'} "${item.texto}"`);
  caixa.addEventListener('change', () => {
    executar(todoState.atualizarItem({ checklistId: l.id, itemId: item.id, feito: caixa.checked }));
  });
  li.appendChild(caixa);

  const textoWrap = document.createElement('div');
  textoWrap.className = 'td-item-texto';
  const textoBtn = document.createElement('button');
  textoBtn.type = 'button';
  textoBtn.className = 'td-item-texto-btn';
  textoBtn.textContent = item.texto;
  textoBtn.title = l.arquivada ? item.texto : 'Clique para editar';
  textoBtn.disabled = l.arquivada;
  textoBtn.addEventListener('click', () => {
    editarNoLugar(textoWrap, item.texto, 500, (novo) => todoState.atualizarItem({ checklistId: l.id, itemId: item.id, texto: novo }));
  });
  textoWrap.appendChild(textoBtn);
  li.appendChild(textoWrap);

  if (!l.arquivada) {
    const remover = document.createElement('button');
    remover.type = 'button';
    remover.className = 'td-icone-btn td-item-remover';
    remover.title = 'Remover item';
    remover.setAttribute('aria-label', `Remover "${item.texto}"`);
    remover.innerHTML = svg(ICONES.xis, 13, 2.2);
    remover.addEventListener('click', () => executar(todoState.removerItem({ checklistId: l.id, itemId: item.id })));
    li.appendChild(remover);
  }
  return li;
}

/** Campo "Adicionar item": Enter adiciona e mantém o foco; colar várias linhas vira vários itens. */
function buildAdicionarItem(l: Checklist): HTMLElement {
  const form = document.createElement('form');
  form.className = 'td-add';
  const icone = document.createElement('span');
  icone.className = 'td-add-icone';
  icone.innerHTML = svg(ICONES.mais, 13, 2.2);
  const campoItem = document.createElement('input');
  campoItem.type = 'text';
  campoItem.placeholder = 'Adicionar item…';
  campoItem.maxLength = 500;
  campoItem.setAttribute('aria-label', `Adicionar item em ${l.titulo}`);
  form.append(icone, campoItem);

  const enviar = (textos: string[]): void => {
    const limpos = textos.map((t) => t.replace(/^\s*(?:[-*•]|\[[ xX]?\])\s*/, '').trim()).filter(Boolean);
    if (!limpos.length) return;
    focoPendente = `.td-cartao[data-id="${l.id}"] .td-add input`;
    executar(todoState.adicionarItens({ checklistId: l.id, textos: limpos }));
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    enviar([campoItem.value]);
  });
  campoItem.addEventListener('paste', (e) => {
    const colado = e.clipboardData?.getData('text') ?? '';
    if (!/\r?\n/.test(colado.trim())) return;
    e.preventDefault();
    enviar(colado.split(/\r?\n/));
  });
  campoItem.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && campoItem.value) {
      e.stopPropagation();
      campoItem.value = '';
    }
  });
  return form;
}

function buildRodapeCartao(l: Checklist): HTMLElement {
  const rodape = document.createElement('footer');
  rodape.className = 'td-cartao-rodape';
  if (l.arquivada) {
    const restaurar = buildBotao('Restaurar', { icone: ICONES.restaurar, variante: 'fantasma' });
    restaurar.addEventListener('click', () => executar(todoState.arquivarChecklist({ checklistId: l.id, arquivada: false })));
    rodape.appendChild(restaurar);
    return rodape;
  }
  const kanban = buildBotao(l.envio ? 'Enviar de novo' : 'Enviar ao Kanban', {
    icone: ICONES.kanban,
    variante: 'fantasma',
    titulo: 'Cria um card no Kanban com os itens como subtarefas',
  });
  kanban.addEventListener('click', () => abrirEnvio(l));
  rodape.appendChild(kanban);
  if (concluida(l)) {
    const arquivar = buildBotao('Arquivar', { icone: ICONES.arquivo, variante: 'fantasma', titulo: 'Tudo feito: tire da frente' });
    arquivar.addEventListener('click', () => executar(todoState.arquivarChecklist({ checklistId: l.id, arquivada: true })));
    rodape.appendChild(arquivar);
  }
  return rodape;
}

/**
 * Troca o texto por um campo no mesmo lugar. Enter ou sair do campo salva;
 * Esc desiste. A trava evita salvar duas vezes quando o redesenho tira o
 * campo da tela e dispara o blur.
 */
function editarNoLugar(alvo: HTMLElement, atual: string, max: number, salvar: (novo: string) => Promise<void>): void {
  const campoEdicao = document.createElement('input');
  campoEdicao.type = 'text';
  campoEdicao.className = 'td-edicao';
  campoEdicao.value = atual;
  campoEdicao.maxLength = max;
  const original = Array.from(alvo.childNodes);
  alvo.replaceChildren(campoEdicao);
  campoEdicao.focus();
  campoEdicao.select();

  let encerrado = false;
  const encerrar = (gravar: boolean): void => {
    if (encerrado) return;
    encerrado = true;
    const novo = campoEdicao.value.trim();
    if (!gravar || !novo || novo === atual) {
      alvo.replaceChildren(...original);
      return;
    }
    salvar(novo).catch((erro) => {
      alvo.replaceChildren(...original);
      falhou(erro);
    });
  };
  campoEdicao.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      encerrar(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      encerrar(false);
    }
  });
  campoEdicao.addEventListener('blur', () => encerrar(true));
}

// ---------- Arrastar ----------

function ligarArrasteDasChecklists(grade: HTMLElement, file: TodoFile): void {
  sortables.push(
    new Sortable(grade, {
      animation: 150,
      handle: '.td-alca-cartao',
      draggable: '.td-cartao',
      ghostClass: 'sortable-ghost',
      onEnd: () => {
        const novaVisivel = Array.from(grade.querySelectorAll<HTMLElement>(':scope > .td-cartao')).map((el) => el.dataset.id as string);
        // As escondidas pelo filtro mantêm o lugar: só as posições das visíveis trocam de dono.
        const visiveis = new Set(novaVisivel);
        const todas = file.checklists.slice().sort((a, b) => a.ordem - b.ordem).map((l) => l.id);
        let proxima = 0;
        const ordem = todas.map((id) => (visiveis.has(id) ? novaVisivel[proxima++]! : id));
        executar(todoState.reordenarChecklists(ordem));
      },
    }),
  );
}

function ligarArrasteDosItens(lista: HTMLElement, checklistId: string): void {
  sortables.push(
    new Sortable(lista, {
      animation: 120,
      handle: '.td-alca-item',
      ghostClass: 'sortable-ghost',
      onEnd: (evt) => {
        if (evt.oldIndex === evt.newIndex) return;
        const itemIds = Array.from(lista.querySelectorAll<HTMLElement>(':scope > .td-item')).map((el) => el.dataset.id as string);
        executar(todoState.reordenarItens({ checklistId, itemIds }));
      },
    }),
  );
}

// ---------- Menu "⋯" ----------

interface AcaoMenu {
  rotulo: string;
  icone: string;
  perigo?: boolean;
  fazer: () => void;
}

function abrirMenu(ancora: HTMLElement, l: Checklist): void {
  // Segundo clique no mesmo botão fecha em vez de reabrir.
  const eraEste = fecharMenu !== null && ancora.getAttribute('aria-expanded') === 'true';
  fecharMenu?.();
  if (eraEste) return;

  const pendentes = l.itens.filter((i) => !i.feito).length;
  const feitos = l.itens.length - pendentes;
  const acoes: AcaoMenu[] = [
    { rotulo: 'Editar detalhes', icone: ICONES.editar, fazer: () => abrirDetalhes(l) },
    ...(l.arquivada ? [] : [{ rotulo: l.envio ? 'Enviar ao Kanban de novo' : 'Enviar ao Kanban', icone: ICONES.enviar, fazer: () => abrirEnvio(l) }]),
    ...(pendentes
      ? [{ rotulo: 'Marcar todos como feitos', icone: ICONES.checkTodos, fazer: () => executar(todoState.marcarTodos({ checklistId: l.id, feito: true })) }]
      : []),
    ...(feitos
      ? [
          { rotulo: 'Desmarcar todos', icone: ICONES.restaurar, fazer: () => executar(todoState.marcarTodos({ checklistId: l.id, feito: false })) },
          { rotulo: `Limpar concluídos (${feitos})`, icone: ICONES.vassoura, fazer: () => executar(todoState.limparConcluidos(l.id)) },
        ]
      : []),
    { rotulo: 'Duplicar', icone: ICONES.duplicar, fazer: () => executar(todoState.duplicarChecklist(l.id)) },
    l.arquivada
      ? { rotulo: 'Restaurar', icone: ICONES.restaurar, fazer: () => executar(todoState.arquivarChecklist({ checklistId: l.id, arquivada: false })) }
      : { rotulo: 'Arquivar', icone: ICONES.arquivo, fazer: () => executar(todoState.arquivarChecklist({ checklistId: l.id, arquivada: true })) },
    { rotulo: 'Excluir', icone: ICONES.lixeira, perigo: true, fazer: () => void confirmarExclusao(l) },
  ];

  const menu = document.createElement('div');
  menu.className = 'td-menu';
  menu.setAttribute('role', 'menu');
  acoes.forEach((a) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'td-menu-item';
    item.classList.toggle('is-perigo', Boolean(a.perigo));
    item.setAttribute('role', 'menuitem');
    item.innerHTML = svg(a.icone, 14, 2);
    item.append(a.rotulo);
    item.addEventListener('click', () => {
      fecharMenu?.();
      a.fazer();
    });
    menu.appendChild(item);
  });
  document.body.appendChild(menu);

  // Posição fixa junto ao botão, virando para cima/esquerda quando não cabe.
  const r = ancora.getBoundingClientRect();
  const { offsetWidth: largura, offsetHeight: altura } = menu;
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - largura - 8, r.right - largura))}px`;
  menu.style.top = `${r.bottom + 6 + altura > window.innerHeight ? Math.max(8, r.top - altura - 6) : r.bottom + 6}px`;
  ancora.setAttribute('aria-expanded', 'true');

  const foraDoMenu = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node) && e.target !== ancora) fecharMenu?.();
  };
  const desempilhar = empilharCamada(menu, () => fecharMenu?.());
  fecharMenu = () => {
    fecharMenu = null;
    desempilhar();
    document.removeEventListener('mousedown', foraDoMenu, true);
    window.removeEventListener('resize', fecharPorResize);
    ancora.setAttribute('aria-expanded', 'false');
    menu.remove();
  };
  const fecharPorResize = (): void => fecharMenu?.();
  document.addEventListener('mousedown', foraDoMenu, true);
  window.addEventListener('resize', fecharPorResize);
  menu.querySelector<HTMLElement>('.td-menu-item')?.focus();
}

async function confirmarExclusao(l: Checklist): Promise<void> {
  const ok = await openConfirmModal({
    title: 'Excluir checklist',
    message: `"${l.titulo}" e ${l.itens.length === 1 ? 'o item dela' : `os ${l.itens.length} itens dela`} serão apagados.${l.envio ? ' O card no Kanban continua lá.' : ''}`,
  });
  if (ok) executar(todoState.excluirChecklist(l.id));
}

// ---------- Modal de detalhes (criar e editar) ----------

function abrirDetalhes(l: Checklist | null): void {
  let prioridade: PrioridadeTodo | '' = l?.prioridade ?? '';
  let cor: string = l?.cor ?? CORES_TODO[0];

  void openCustomModal(
    l ? 'Editar checklist' : 'Nova checklist',
    ({ corpo, rodape, fechar }) => {
      const campoTitulo = input('text', l?.titulo ?? '', 'Ex.: Gravação de sexta');
      campoTitulo.maxLength = 200;
      const campoDescricao = textarea(l?.descricao ?? '', 'Contexto, objetivo ou observação (opcional)', 2);
      const campoPrazo = input('date', l?.prazo ?? '');
      const campoItens = l ? null : textarea('', 'Um item por linha — dá para colar uma lista pronta', 5);

      const { secao: secaoBase, conteudo: base } = buildSecaoModal('Checklist');
      base.append(campo('Título', campoTitulo), campo('Descrição', campoDescricao));
      if (campoItens) base.appendChild(campo('Itens', campoItens, 'Linhas começando com "-", "•" ou "[ ]" também valem.'));

      const { secao: secaoOrg, conteudo: org } = buildSecaoModal('Organização');
      org.appendChild(
        grade2(
          campo(
            'Prioridade',
            pilulas<PrioridadeTodo | ''>(
              [{ id: '', rotulo: 'Sem' }, ...PRIORIDADES_TODO.map((p) => ({ id: p.id as PrioridadeTodo, rotulo: p.rotulo }))],
              () => prioridade,
              (v) => {
                prioridade = v;
              },
            ),
          ),
          campo('Prazo', campoPrazo),
        ),
      );
      const cores = document.createElement('div');
      cores.className = 'td-cores';
      cores.setAttribute('role', 'radiogroup');
      cores.setAttribute('aria-label', 'Cor');
      const desenharCores = (): void => {
        cores.replaceChildren();
        CORES_TODO.forEach((c) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'td-cor';
          b.style.setProperty('--td-cor', c);
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', String(c === cor));
          b.setAttribute('aria-label', `Cor ${c}`);
          b.classList.toggle('is-ativa', c === cor);
          b.addEventListener('click', () => {
            cor = c;
            desenharCores();
          });
          cores.appendChild(b);
        });
      };
      desenharCores();
      org.appendChild(campo('Cor da faixa', cores));

      corpo.append(secaoBase, secaoOrg);

      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const salvar = buildBotao(l ? 'Salvar' : 'Criar checklist', { variante: 'primario' });
      const concluir = async (): Promise<void> => {
        const titulo = campoTitulo.value.trim();
        if (!titulo) {
          erroInline(corpo, new Error('Dê um título à checklist.'));
          campoTitulo.focus();
          return;
        }
        salvar.disabled = true;
        try {
          if (l) {
            await todoState.atualizarChecklist({
              checklistId: l.id,
              titulo,
              descricao: campoDescricao.value,
              prioridade,
              prazo: campoPrazo.value,
              cor,
            });
          } else {
            const id = await todoState.criarChecklist({
              titulo,
              descricao: campoDescricao.value,
              prioridade: prioridade || undefined,
              prazo: campoPrazo.value || undefined,
              cor,
              itens: (campoItens?.value ?? '').split(/\r?\n/).map((t) => t.replace(/^\s*(?:[-*•]|\[[ xX]?\])\s*/, '').trim()).filter(Boolean),
            });
            // Nova checklist aparece em "Abertas"; se o filtro a esconderia, muda para lá.
            if (filtro === 'concluidas' || filtro === 'arquivadas') filtro = 'abertas';
            if (id) {
              focoPendente = `.td-cartao[data-id="${id}"] .td-add input`;
              redesenhar();
            }
          }
          fechar();
        } catch (erro) {
          salvar.disabled = false;
          erroInline(corpo, erro);
        }
      };
      salvar.addEventListener('click', () => void concluir());
      campoTitulo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void concluir();
        }
      });
      rodape.append(cancelar, salvar);
      campoTitulo.focus();
    },
    {
      largura: 520,
      icone: l ? ICONES.editar : ICONES.todo,
      subtitulo: l ? 'Título, descrição, prioridade, prazo e cor' : 'Os itens você também pode adicionar direto no cartão',
    },
  );
}

// ---------- Modal de envio ao Kanban ----------

function abrirEnvio(l: Checklist): void {
  void (async () => {
    try {
      await kanbanState.loadBoard();
    } catch (erro) {
      falhou(erro);
      return;
    }
    const board = kanbanState.getCurrentBoard();
    const colunas = (board?.columns ?? []).slice().sort((a, b) => a.order - b.order);
    const cardExistente = l.envio ? board?.cards.find((c) => c.id === l.envio?.kanbanCardId) : undefined;
    let colunaId = colunas[0]?.id ?? '';
    const feitos = l.itens.filter((i) => i.feito).length;
    let incluirFeitos = true;

    void openCustomModal(
      'Enviar ao Kanban',
      ({ corpo, rodape, fechar }) => {
        if (!colunas.length) {
          corpo.appendChild(buildAviso('O Kanban ainda não tem colunas. Crie uma coluna lá e volte para enviar.', 'atencao'));
          const ir = buildBotao('Abrir o Kanban', { icone: ICONES.kanban, variante: 'primario' });
          ir.addEventListener('click', () => {
            fechar();
            abrirModulo('kanban');
          });
          const cancelar = buildBotao('Fechar', { variante: 'fantasma' });
          cancelar.addEventListener('click', fechar);
          rodape.append(cancelar, ir);
          return;
        }

        if (cardExistente) {
          const colunaAtual = board?.columns.find((c) => c.id === cardExistente.columnId)?.title ?? l.envio?.colunaNome ?? '';
          corpo.appendChild(
            buildAviso(`Esta checklist já está no Kanban, na coluna "${colunaAtual}". Enviar de novo cria outro card — o atual não muda.`, 'atencao'),
          );
        }

        const { secao: secaoColuna, conteudo: conteudoColuna } = buildSecaoModal('Coluna', 'Onde o card vai aparecer');
        conteudoColuna.appendChild(
          pilulas<string>(
            colunas.map((c) => ({ id: c.id, rotulo: c.title })),
            () => colunaId,
            (v) => {
              colunaId = v;
            },
          ),
        );
        corpo.appendChild(secaoColuna);

        const { secao: secaoCard, conteudo: conteudoCard } = buildSecaoModal('O card', 'Uma cópia: mexer no card não muda a checklist, e vice-versa');
        const previa = document.createElement('ul');
        previa.className = 'td-previa';
        const desenharPrevia = (): void => {
          const n = l.itens.length - (incluirFeitos ? 0 : feitos);
          const linhas = [
            `Título: ${l.titulo}`,
            n ? `${n} subtarefa${n === 1 ? '' : 's'}${incluirFeitos && feitos ? ` (${feitos} já marcada${feitos === 1 ? '' : 's'})` : ''}` : 'Sem subtarefas',
            ...(l.prioridade ? [`Prioridade ${PRIORIDADES_TODO.find((p) => p.id === l.prioridade)?.rotulo.toLocaleLowerCase('pt-BR')}`] : []),
            ...(l.prazo ? [`Prazo ${dataCurta(l.prazo)}`] : []),
            ...(l.descricao ? ['Descrição da checklist na descrição do card'] : []),
          ];
          previa.replaceChildren(...linhas.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
        };
        desenharPrevia();
        conteudoCard.appendChild(previa);
        if (feitos) {
          conteudoCard.appendChild(
            interruptor('Incluir itens já concluídos', feitos === 1 ? '1 item vai como subtarefa marcada' : `${feitos} itens vão como subtarefas marcadas`, incluirFeitos, (v) => {
              incluirFeitos = v;
              desenharPrevia();
            }),
          );
        }
        corpo.appendChild(secaoCard);

        const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
        cancelar.addEventListener('click', fechar);
        const enviar = buildBotao(cardExistente ? 'Criar outro card' : 'Enviar', { icone: ICONES.enviar, variante: 'primario' });
        enviar.addEventListener('click', () => {
          enviar.disabled = true;
          const coluna = colunas.find((c) => c.id === colunaId)?.title ?? '';
          todoState
            .enviarAoKanban({ checklistId: l.id, colunaId, incluirFeitos, forcarNovo: Boolean(cardExistente) })
            .then(async () => {
              fechar();
              // Recarrega para o selo já mostrar a coluna e as subtarefas do card novo.
              await kanbanState.loadBoard().catch(() => undefined);
              redesenhar();
              const abrir = await openConfirmModal({
                title: 'Enviado ao Kanban',
                message: `"${l.titulo}" virou um card na coluna "${coluna}". A checklist continua aqui, marcada como enviada.`,
                danger: false,
                confirmText: 'Abrir no Kanban',
                cancelText: 'Ficar aqui',
              });
              if (abrir) abrirModulo('kanban');
            })
            .catch((erro) => {
              enviar.disabled = false;
              erroInline(corpo, erro);
            });
        });
        rodape.append(cancelar, enviar);
      },
      { largura: 500, icone: ICONES.kanban, subtitulo: l.titulo },
    );
  })();
}
