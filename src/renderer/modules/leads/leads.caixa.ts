import { nomeDoContato, type Pessoa } from '../../../shared/types/contatos.types.js';
import { origemDoLead, type FaixaLead } from '../../../shared/types/leads.types.js';
import { leadsDoArquivo, semResposta, type LeadInfo } from '../../../shared/types/leads.estatisticas.js';
import { openFormModal } from '../../ui/modal.js';
import { svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import type { CtxContatos } from '../contatos/contatos.casco.js';
import * as contatosState from '../contatos/contatos.state.js';
import {
  ICONES_CONTATO,
  agoraLocal,
  buildAvatar,
  buildSeloEtapa,
  buildSeloFaixa,
  casaBusca,
  el,
  etapaDe,
  quandoChegou,
  quandoFoi,
} from '../contatos/contatos.ui.js';

/**
 * A caixa de entrada do módulo Leads: quem chegou pelo formulário, do mais
 * novo ao mais antigo, com filtros e ações rápidas. Abrir um lead marca como
 * visto (quem faz isso é a casca, por qualquer caminho).
 */

export type FiltroLeads = 'todos' | 'naoVistos' | FaixaLead | 'semResposta';

let filtro: FiltroLeads = 'todos';

/** O Painel manda para cá já filtrado (ex.: "sem resposta há +24 h"). */
export function filtrarCaixa(f: FiltroLeads): void {
  filtro = f;
}

// ---------- Caixa de entrada ----------

function buildFiltros(todos: LeadInfo[], parados: Set<string>): HTMLElement {
  const linha = el('div', 'ct-filtros');
  const pilulas = el('div', 'md-pilulas');
  const naoVistos = todos.filter((l) => !l.entrada.visto).length;
  const opcoes: Array<[FiltroLeads, string, number]> = [
    ['todos', 'Todos', todos.length],
    ['naoVistos', 'Não vistos', naoVistos],
    ['quente', 'Quentes', todos.filter((l) => l.entrada.faixa === 'quente').length],
    ['morno', 'Mornos', todos.filter((l) => l.entrada.faixa === 'morno').length],
    ['frio', 'Frios', todos.filter((l) => l.entrada.faixa === 'frio').length],
    ['semResposta', 'Sem resposta há +24 h', parados.size],
  ];
  opcoes.forEach(([id, rotulo, n]) => {
    const b = el('button', `md-pilula${filtro === id ? ' is-ativa' : ''}${id === 'semResposta' && n ? ' is-alerta' : ''}`, n ? `${rotulo} · ${n}` : rotulo);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(filtro === id));
    b.addEventListener('click', () => {
      filtro = id;
      ctxAtual?.redesenhar();
    });
    pilulas.appendChild(b);
  });
  linha.appendChild(pilulas);
  return linha;
}

let ctxAtual: CtxContatos | null = null;

async function descartar(ctx: CtxContatos, p: Pessoa): Promise<void> {
  const v = await openFormModal(
    `Descartar ${p.nome}`,
    [
      {
        name: 'motivo',
        label: 'Motivo (opcional)',
        type: 'textarea',
        placeholder: 'Ex.: procurava vaga de emprego; fora da região atendida; spam',
        dica: 'Fica no histórico. O lead vai para a etapa "perdida" do funil e continua cadastrado.',
      },
    ],
    'Descartar',
    { icone: ICONES_CONTATO.descartar },
  );
  if (!v) return;
  try {
    await contatosState.descartarLead(p.id, v.motivo ?? '');
    mostrarToast(`${p.nome} foi descartado`, [], 3500);
  } catch (e) {
    ctx.falhou(e);
  }
}

function botaoAcao(icone: string, titulo: string, aoClicar: () => void): HTMLButtonElement {
  const b = el('button', 'ct-icone-btn');
  b.type = 'button';
  b.title = titulo;
  b.setAttribute('aria-label', titulo);
  b.innerHTML = svg(icone, 15);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    aoClicar();
  });
  return b;
}

function buildItem(ctx: CtxContatos, l: LeadInfo, parado: boolean): HTMLElement {
  const { pessoa: p, entrada: e } = l;
  const item = el('article', `ld-lead${e.visto ? '' : ' is-novo'}${l.perdido ? ' is-perdido' : ''}`);
  item.tabIndex = 0;
  item.setAttribute('role', 'listitem');
  const abrir = (): void => ctx.abrirFicha(l.ref);
  item.addEventListener('click', abrir);
  item.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === item) {
      ev.preventDefault();
      abrir();
    }
  });

  const marca = el('span', 'ld-lead-marca');
  if (!e.visto) marca.appendChild(el('span', 'ld-lead-novo', 'Novo'));
  item.appendChild(marca);
  item.appendChild(buildAvatar(p));

  const meio = el('div', 'ld-lead-meio');
  const titulo = el('div', 'ld-lead-titulo');
  titulo.appendChild(el('strong', undefined, p.nome));
  const empresa = p.empresaId ? ctx.file.empresas.find((x) => x.id === p.empresaId) : undefined;
  if (empresa) titulo.appendChild(el('span', 'ld-lead-empresa', nomeDoContato(empresa)));
  if (e.retornos > 0) titulo.appendChild(el('span', 'ld-lead-voltou', e.retornos === 1 ? 'voltou 1 vez' : `voltou ${e.retornos} vezes`));
  meio.appendChild(titulo);
  const texto = e.mensagem || e.interesse;
  meio.appendChild(el('p', `ld-lead-msg${texto ? '' : ' is-vazio'}`, texto || 'Sem mensagem'));
  const pe = el('div', 'ld-lead-pe');
  const chegada = el('span', 'ld-lead-quando');
  chegada.innerHTML = svg(ICONES_CONTATO.relogio, 12, 2);
  chegada.appendChild(el('span', undefined, quandoChegou(e.ultimoEnvioEm ?? e.recebidoEm)));
  pe.appendChild(chegada);
  const origem = el('span', 'ld-lead-origem');
  origem.innerHTML = svg(ICONES_CONTATO.alvo, 12, 2);
  origem.appendChild(el('span', undefined, origemDoLead(e)));
  pe.appendChild(origem);
  if (parado) {
    const alerta = el('span', 'ld-lead-parado');
    alerta.innerHTML = svg(ICONES_CONTATO.sino, 12, 2);
    alerta.appendChild(el('span', undefined, 'sem resposta há +24 h'));
    pe.appendChild(alerta);
  }
  meio.appendChild(pe);
  item.appendChild(meio);

  const lado = el('div', 'ld-lead-lado');
  lado.append(buildSeloFaixa(e.faixa, e.pontos), buildSeloEtapa(etapaDe(ctx.file, p.etapaId)));
  item.appendChild(lado);

  const acoes = el('div', 'ld-lead-acoes');
  if (!e.visto) acoes.appendChild(botaoAcao(ICONES_CONTATO.olho, 'Marcar como visto', () => void contatosState.marcarVisto([p.id]).catch(ctx.falhou)));
  if (!l.perdido) acoes.appendChild(botaoAcao(ICONES_CONTATO.descartar, 'Descartar', () => void descartar(ctx, p)));
  item.appendChild(acoes);
  return item;
}

export function buildCaixaDeLeads(ctx: CtxContatos, busca: string): HTMLElement {
  ctxAtual = ctx;
  const wrap = el('div', 'ct-lista-wrap ld-leads');
  const todos = leadsDoArquivo(ctx.file).filter((l) => !l.pessoa.arquivado);
  const parados = new Set(semResposta(todos, agoraLocal()).map((l) => l.pessoa.id));
  const barra = el('div', 'ld-leads-barra');
  barra.appendChild(buildFiltros(todos, parados));
  wrap.appendChild(barra);

  const lista = todos
    .filter((l) => {
      if (filtro === 'naoVistos') return !l.entrada.visto;
      if (filtro === 'semResposta') return parados.has(l.pessoa.id);
      if (filtro === 'quente' || filtro === 'morno' || filtro === 'frio') return l.entrada.faixa === filtro;
      return true;
    })
    .filter((l) => casaBusca(l.pessoa, busca) || origemDoLead(l.entrada).toLowerCase().includes(busca.trim().toLowerCase()))
    // A mais recente primeiro — quem voltou pelo formulário sobe de novo.
    .sort((a, b) => (b.entrada.ultimoEnvioEm ?? b.entrada.recebidoEm).localeCompare(a.entrada.ultimoEnvioEm ?? a.entrada.recebidoEm));

  if (!lista.length) {
    wrap.appendChild(el('p', 'ct-nada', filtro === 'naoVistos' ? 'Tudo visto por aqui.' : 'Nenhum lead com esses filtros.'));
    return wrap;
  }
  const grupos = el('div', 'ld-leads-lista');
  grupos.setAttribute('role', 'list');
  let diaAtual = '';
  lista.forEach((l) => {
    const dia = (l.entrada.ultimoEnvioEm ?? l.entrada.recebidoEm).slice(0, 10);
    if (dia !== diaAtual) {
      diaAtual = dia;
      const rotulo = quandoFoi(dia);
      grupos.appendChild(el('div', 'ld-leads-dia', rotulo.replace(/^./, (c) => c.toUpperCase())));
    }
    grupos.appendChild(buildItem(ctx, l, parados.has(l.pessoa.id)));
  });
  wrap.appendChild(grupos);
  return wrap;
}

