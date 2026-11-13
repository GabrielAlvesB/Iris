import { APPS_WORKSPACE, type AppWorkspace, type EstadoWorkspace, type MarcoApp } from '../../../shared/types/workspace.types.js';
import { buildSelo } from '../../ui/pagina.js';
import { iconeDoApp } from './workspace.ui.js';

/**
 * Linha do tempo do ecossistema (a coluna "Novidades" da vitrine): cada versão de
 * cada app, da mais nova à mais antiga, na cor do app. No lugar de um "destaque" fixo
 * (que sempre punha um app na frente dos outros), a história de todos crescendo juntos.
 *
 * Os dados vêm da mesma consulta que procura atualização (EstadoApp.historico):
 * abrir esta tela não chama o GitHub.
 */

/** Pouco de início: a coluna tem de acabar perto de onde a lista de apps acaba. */
const POR_PAGINA = 5;
const DIAS_NOVA = 7;

interface Item {
  app: AppWorkspace;
  marco: MarcoApp;
  instalada: boolean;
}

let filtro: string | null = null;
let visiveis = POR_PAGINA;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function itens(e: EstadoWorkspace): Item[] {
  const lista: Item[] = [];
  for (const app of APPS_WORKSPACE) {
    const estado = e.apps.find((a) => a.id === app.id);
    (estado?.historico ?? []).forEach((marco) =>
      lista.push({ app, marco, instalada: Boolean(estado?.instalacao?.versao && estado.instalacao.versao.replace(/^v/i, '') === marco.versao) }),
    );
  }
  return lista.filter((i) => !Number.isNaN(Date.parse(i.marco.publicadaEm))).sort((a, b) => b.marco.publicadaEm.localeCompare(a.marco.publicadaEm));
}

/**
 * As notas da release viram até duas linhas de texto puro: os itens de lista
 * primeiro (é onde ficam as novidades), sem títulos, links nem marcação.
 */
function destaquesDasNotas(md: string): string[] {
  const limpar = (t: string): string =>
    t
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const linhas = md.split(/\r?\n/).map((l) => l.trim());
  const itensDeLista = linhas.filter((l) => /^([-*+]|\d+[.)])\s+/.test(l)).map((l) => limpar(l.replace(/^([-*+]|\d+[.)])\s+/, '')));
  const paragrafos = linhas.filter((l) => l && !/^(#|>|\||[-*+]\s|\d+[.)]\s|```|<)/.test(l)).map(limpar);
  return (itensDeLista.length ? itensDeLista : paragrafos).filter((l) => l.length > 2).slice(0, 2);
}

function quando(iso: string): { dia: string; relativo: string } {
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const relativo =
    dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : dias < 30 ? `há ${dias} dias` : dias < 365 ? `há ${Math.round(dias / 30)} ${Math.round(dias / 30) === 1 ? 'mês' : 'meses'}` : `há ${Math.round(dias / 365)} ano${Math.round(dias / 365) === 1 ? '' : 's'}`;
  return { dia: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''), relativo };
}

function mesDe(iso: string): string {
  const t = new Date(iso).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function buildMarco(i: Item, abrir: (appId: string) => void): HTMLElement {
  const li = el('li', 'ws-marco');
  li.style.setProperty('--ws-h', String(i.app.matiz));
  const { dia, relativo } = quando(i.marco.publicadaEm);
  const ponto = el('span', 'ws-marco-ponto');
  ponto.setAttribute('aria-hidden', 'true');

  const card = el('button', 'ws-marco-card');
  card.type = 'button';
  card.setAttribute('aria-label', `${i.app.nome} versão ${i.marco.versao}, ${relativo}: ver a página do app`);
  card.addEventListener('click', () => abrir(i.app.id));
  const cab = el('div', 'ws-marco-cab');
  cab.appendChild(iconeDoApp(i.app, 24));
  const nome = el('div', 'ws-marco-nome');
  nome.append(el('strong', undefined, i.app.nome), el('span', 'ws-marco-versao', `v${i.marco.versao}`));
  cab.appendChild(nome);
  const data = el('span', 'ws-marco-data', dia);
  data.title = relativo;
  cab.appendChild(data);
  card.appendChild(cab);

  // Os mesmos selos do resto do app (ícone + texto), não um desenho próprio.
  const selos = el('div', 'ws-marco-selos');
  if (Date.now() - Date.parse(i.marco.publicadaEm) < DIAS_NOVA * 86_400_000) {
    const nova = buildSelo('Nova', 'neutro');
    nova.classList.add('ws-selo-nova');
    selos.appendChild(nova);
  }
  // "Mais recente" saiu: com a lista da mais nova à mais antiga, quase todo item do topo o levava.
  if (i.instalada) selos.appendChild(buildSelo('A sua', 'ok'));
  if (selos.childElementCount) card.appendChild(selos);

  // Título da release só quando diz algo além do número da versão.
  const titulo = i.marco.titulo?.trim();
  if (titulo && !titulo.replace(/^v/i, '').includes(i.marco.versao)) card.appendChild(el('p', 'ws-marco-titulo', titulo));
  const destaques = destaquesDasNotas(i.marco.resumo);
  if (destaques.length) {
    const ul = el('ul', 'ws-marco-notas');
    destaques.forEach((d) => {
      // O texto num span: o corte em duas linhas no próprio <li> esconderia o marcador.
      const li = el('li');
      li.appendChild(el('span', undefined, d));
      li.title = d;
      ul.appendChild(li);
    });
    card.appendChild(ul);
  }
  li.append(ponto, card);
  return li;
}

/**
 * A coluna "Novidades" da vitrine. Sempre devolve a coluna: sem histórico (primeira abertura sem
 * internet) ela diz isso numa linha, em vez de sumir e a lista de apps mudar de largura.
 */
export function buildLinhaDoTempo(e: EstadoWorkspace, abrir: (appId: string) => void, redesenhar: () => void): HTMLElement {
  const todos = itens(e);
  const sec = el('aside', 'ws-col ws-linha');
  const cab = el('header', 'ws-col-cab');
  cab.appendChild(el('h2', 'ws-col-titulo', 'Novidades'));
  sec.appendChild(cab);
  if (!todos.length) {
    sec.appendChild(el('p', 'ws-linha-vazia', 'As versões de cada app aparecem aqui assim que o Iris conferir o GitHub.'));
    return sec;
  }

  // Filtro por app: só os que têm versão publicada. Um menu só — uma pílula por app não cabe na coluna.
  const comVersao = APPS_WORKSPACE.filter((a) => todos.some((i) => i.app === a));
  if (filtro && !comVersao.some((a) => a.id === filtro)) filtro = null;
  if (comVersao.length > 1) {
    const menu = el('select', 'vd-select ws-linha-menu');
    menu.setAttribute('aria-label', 'Mostrar as versões de');
    menu.appendChild(new Option('Todos os apps', ''));
    comVersao.forEach((a) => menu.appendChild(new Option(a.nome, a.id)));
    menu.value = filtro ?? '';
    menu.classList.toggle('is-ativo', Boolean(filtro));
    menu.addEventListener('change', () => {
      filtro = menu.value || null;
      visiveis = POR_PAGINA;
      redesenhar();
    });
    cab.appendChild(menu);
  }

  const lista = filtro ? todos.filter((i) => i.app.id === filtro) : todos;
  const ol = el('ol', 'ws-linha-lista');
  let mesAnterior = '';
  lista.slice(0, visiveis).forEach((i) => {
    const mes = mesDe(i.marco.publicadaEm);
    if (mes !== mesAnterior) {
      mesAnterior = mes;
      ol.appendChild(el('li', 'ws-linha-mes', mes));
    }
    ol.appendChild(buildMarco(i, abrir));
  });
  sec.appendChild(ol);
  if (lista.length > visiveis) {
    const mais = el('button', 'ws-linha-mais', `Ver mais ${Math.min(POR_PAGINA, lista.length - visiveis)} de ${lista.length - visiveis}`);
    mais.type = 'button';
    mais.addEventListener('click', () => {
      visiveis += POR_PAGINA;
      redesenhar();
    });
    sec.appendChild(mais);
  }
  return sec;
}
