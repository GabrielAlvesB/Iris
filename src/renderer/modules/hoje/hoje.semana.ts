import type { ItemRevisao, RevisaoSemana } from '../../../shared/types/revisao.types';
import { diaCurto, segundaDaSemana, somarDias } from '../../../shared/types/revisao.types.js';
import { hojeLocal } from '../../../shared/types/brasil.js';
import { textoDuracao } from '../../../shared/types/pomodoro.types.js';
import { abrirAlvo, abrirModulo } from '../../core/navegacao.js';
import { buildBotao } from '../../ui/pagina.js';

/**
 * Aba "Semana" da Home: a revisão de segunda a domingo — o que foi publicado
 * (e o que ainda está agendado), o que foi concluído, o que atrasou, as
 * rotinas e o foco. É tela de análise, então os números entram em destaque;
 * os textos são só fatos (revisao.types.ts), a leitura é de quem olha. O
 * mesmo conteúdo vira PDF.
 */

const ICONE_ANTERIOR = '<path d="m15 18-6-6 6-6"/>';
const ICONE_PROXIMA = '<path d="m9 18 6-6-6-6"/>';
const ICONE_PDF = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/><path d="M9 11h2"/>';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** Quantas publicações a lista mostra antes do "Ver todos". */
const MAX_PUBLICADOS = 5;
/** Semanas com a lista de publicados aberta por inteiro (só nesta sessão). */
const publicadosAbertos = new Set<string>();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? `1 ${um}` : `${n} ${varios}`;
}

function dataLocal(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(a, m - 1, d);
}

/** "seg", "ter"… sem o ponto da abreviação. */
function semanaCurta(iso: string): string {
  return dataLocal(iso).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
}

/** "6 a 12 de outubro", "29 de setembro a 5 de outubro", com o ano se não for o atual. */
export function periodoPorExtenso(inicio: string, fim: string): string {
  const [ai, mi, di] = inicio.split('-').map(Number) as [number, number, number];
  const [af, mf, df] = fim.split('-').map(Number) as [number, number, number];
  const ano = af !== new Date().getFullYear() ? ` de ${af}` : '';
  if (mi === mf && ai === af) return `${di} a ${df} de ${MESES[mf - 1]}${ano}`;
  return `${di} de ${MESES[mi - 1]}${ai !== af ? ` de ${ai}` : ''} a ${df} de ${MESES[mf - 1]}${ano}`;
}

export function semanaAtual(): string {
  return segundaDaSemana(hojeLocal());
}

function rotinasDe(r: RevisaoSemana): { feitas: number; previstas: number } {
  return { feitas: r.rotinas.reduce((n, x) => n + Math.min(x.feitas, x.previstas), 0), previstas: r.rotinas.reduce((n, x) => n + x.previstas, 0) };
}

/** A frase do topo na aba Semana: o resumo em fatos ("21 publicações, nenhum atraso"). */
export function fraseDaSemana(r: RevisaoSemana): string {
  const partes = [
    r.publicados.length ? plural(r.publicados.length, 'publicação', 'publicações') : 'nenhuma publicação',
    ...(r.concluidos.length ? [plural(r.concluidos.length, 'item concluído', 'itens concluídos')] : []),
    r.atrasaram.length ? plural(r.atrasaram.length, 'atraso', 'atrasos') : 'nenhum atraso',
  ];
  const { feitas, previstas } = rotinasDe(r);
  let fim = '';
  if (!previstas && !r.tempoTotal) fim = ' Rotinas e foco ainda sem registro.';
  else {
    const extras = [previstas ? `rotinas ${feitas} de ${previstas}` : '', r.tempoTotal ? `${textoDuracao(r.tempoTotal)} de foco` : ''].filter(Boolean).join(', ');
    fim = ` ${extras.charAt(0).toUpperCase()}${extras.slice(1)}.`;
  }
  return `A semana em revisão: ${partes.join(', ')}.${fim}`;
}

function abrirItem(i: ItemRevisao): void {
  if (i.tipo === 'card') abrirAlvo({ modulo: 'kanban', id: i.id });
  else if (i.tipo === 'checklist') abrirAlvo({ modulo: 'todo', id: i.id });
  else abrirAlvo({ modulo: 'postagens', tipo: i.detalhe?.startsWith('Imagem') ? 'imagem' : 'video', id: i.id });
}

function buildCartao(classe: string, titulo: string): { cartao: HTMLElement; cab: HTMLElement; corpo: HTMLElement } {
  const cartao = el('section', `rv-cartao ${classe}`);
  const cab = el('header', 'rv-cartao-cab');
  cab.appendChild(el('h3', undefined, titulo));
  const corpo = el('div', 'rv-cartao-corpo');
  cartao.append(cab, corpo);
  return { cartao, cab, corpo };
}

/** Os cinco números da semana numa faixa só; o primeiro (publicados) em destaque. Vazio = "—", nunca 0 inventado. */
function buildNumeros(r: RevisaoSemana): HTMLElement {
  const { feitas, previstas } = rotinasDe(r);
  const canais = r.porRede.filter((p) => p.rede !== 'Sem rede').length;
  const cards = r.concluidos.filter((c) => c.tipo === 'card').length;
  const listas = r.concluidos.length - cards;
  const abertos = r.atrasaram.filter((a) => a.detalhe?.startsWith('ainda')).length;
  const celulas: Array<{ rotulo: string; valor: string; detalhe: string; tom?: 'destaque' | 'atencao' | 'vazio' }> = [
    { rotulo: 'Publicados', valor: String(r.publicados.length), detalhe: r.publicados.length ? (canais ? `em ${plural(canais, 'canal', 'canais')}` : 'sem rede marcada') : 'nenhuma publicada', tom: 'destaque' },
    {
      rotulo: 'Concluídos',
      valor: String(r.concluidos.length),
      detalhe: r.concluidos.length ? [cards ? plural(cards, 'card', 'cards') : '', listas ? plural(listas, 'checklist', 'checklists') : ''].filter(Boolean).join(', ') : 'nenhum card fechado',
      ...(r.concluidos.length ? {} : { tom: 'vazio' as const }),
    },
    {
      rotulo: 'Atrasaram',
      valor: String(r.atrasaram.length),
      detalhe: r.atrasaram.length ? (abertos ? `${plural(abertos, 'segue aberto', 'seguem abertos')}` : 'todos já concluídos') : 'tudo no prazo',
      tom: r.atrasaram.length ? 'atencao' : 'vazio',
    },
    { rotulo: 'Rotinas', valor: previstas ? `${feitas}/${previstas}` : '—', detalhe: previstas ? 'nos dias marcados' : 'sem registro', ...(previstas ? {} : { tom: 'vazio' as const }) },
    { rotulo: 'Foco', valor: r.tempoTotal ? textoDuracao(r.tempoTotal) : '—', detalhe: r.tempo.length ? `em ${plural(r.tempo.length, 'tarefa', 'tarefas')}` : 'sem registro', ...(r.tempoTotal ? {} : { tom: 'vazio' as const }) },
  ];
  const faixa = el('div', 'rv-numeros');
  celulas.forEach((c) => {
    const celula = el('div', `rv-numero${c.tom ? ` is-${c.tom}` : ''}`);
    celula.append(el('span', 'rv-numero-rotulo', c.rotulo), el('strong', 'rv-numero-valor', c.valor), el('span', 'rv-numero-detalhe', c.detalhe));
    faixa.appendChild(celula);
  });
  return faixa;
}

/**
 * Ritmo da semana: uma coluna por dia. Publicadas em cheio; o que ainda está
 * agendado, em contorno tracejado por cima — a mesma cor, o traço é que diz o
 * estado (e a legenda, e o title de cada coluna).
 */
function buildRitmo(r: RevisaoSemana): HTMLElement {
  const { cartao, cab, corpo } = buildCartao('rv-ritmo', 'Ritmo da semana');
  const legenda = el('div', 'rv-legenda');
  legenda.append(el('span', 'rv-legenda-publicado', 'Publicado'), el('span', 'rv-legenda-agendado', 'Agendado'));
  cab.appendChild(legenda);

  const hoje = hojeLocal();
  const maior = Math.max(1, ...r.ritmo.map((d) => d.publicadas + d.agendadas));
  const grafico = el('div', 'rv-colunas');
  grafico.setAttribute('role', 'list');
  r.ritmo.forEach((d) => {
    const total = d.publicadas + d.agendadas;
    const coluna = el('div', `rv-coluna${d.dia === hoje ? ' is-hoje' : ''}${total ? '' : ' is-zero'}`);
    coluna.setAttribute('role', 'listitem');
    const nomeDia = dataLocal(d.dia).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' });
    coluna.title = `${nomeDia}: ${plural(d.publicadas, 'publicada', 'publicadas')}${d.agendadas ? `, ${plural(d.agendadas, 'agendada', 'agendadas')}` : ''}`;
    coluna.setAttribute('aria-label', coluna.title);
    const area = el('div', 'rv-coluna-area');
    area.appendChild(el('span', 'rv-coluna-valor', String(total)));
    if (d.agendadas) {
      const agendado = el('span', 'rv-barra-agendada');
      agendado.style.height = `${(d.agendadas / maior) * 100}%`;
      area.appendChild(agendado);
    }
    if (d.publicadas) {
      const publicado = el('span', 'rv-barra-publicada');
      publicado.style.height = `${(d.publicadas / maior) * 100}%`;
      area.appendChild(publicado);
    }
    if (!total) area.appendChild(el('span', 'rv-barra-nada'));
    coluna.append(area, el('span', 'rv-coluna-dia', `${semanaCurta(d.dia)} ${dataLocal(d.dia).getDate()}`));
    grafico.appendChild(coluna);
  });
  corpo.appendChild(grafico);
  return cartao;
}

/** Publicações por canal: o nome, o número escrito e a barra (nunca só o comprimento). */
function buildCanais(r: RevisaoSemana): HTMLElement {
  const { cartao, corpo } = buildCartao('rv-canais', 'Por canal');
  if (!r.porRede.length) {
    corpo.appendChild(el('p', 'rv-vazio', 'Nenhuma publicação nesta semana.'));
    return cartao;
  }
  const maior = Math.max(1, ...r.porRede.map((p) => p.n));
  r.porRede.forEach((p) => {
    const linha = el('div', 'rv-canal');
    const topo = el('div', 'rv-canal-topo');
    topo.append(el('span', 'rv-canal-nome', p.rede), el('span', 'rv-canal-valor', String(p.n)));
    const trilho = el('span', 'rv-canal-trilho');
    const cheio = el('span', 'rv-canal-cheio');
    cheio.style.width = `${(p.n / maior) * 100}%`;
    trilho.appendChild(cheio);
    linha.append(topo, trilho);
    corpo.appendChild(linha);
  });
  return cartao;
}

/** A lista do que saiu, agrupada por dia, com as redes como selos. */
function buildPublicados(r: RevisaoSemana, redesenhar: () => void): HTMLElement {
  const { cartao, cab, corpo } = buildCartao('rv-publicados', 'Publicados');
  if (!r.publicados.length) {
    corpo.appendChild(el('p', 'rv-vazio', 'Nenhuma postagem publicada nesta semana.'));
    return cartao;
  }
  const aberto = publicadosAbertos.has(r.inicio);
  if (r.publicados.length > MAX_PUBLICADOS) {
    const todos = el('button', 'rv-link', aberto ? 'Mostrar menos' : `Ver todos os ${r.publicados.length}`);
    todos.type = 'button';
    todos.addEventListener('click', () => {
      if (aberto) publicadosAbertos.delete(r.inicio);
      else publicadosAbertos.add(r.inicio);
      redesenhar();
    });
    cab.appendChild(todos);
  }
  const visiveis = aberto ? r.publicados : r.publicados.slice(0, MAX_PUBLICADOS);
  let diaAtual = '';
  visiveis.forEach((p) => {
    if (p.dia !== diaAtual) {
      diaAtual = p.dia;
      const data = dataLocal(p.dia);
      corpo.appendChild(el('h4', 'rv-dia', `${semanaCurta(p.dia)} · ${data.getDate()} ${data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}`));
    }
    const item = el('button', 'rv-publicado');
    item.type = 'button';
    item.title = 'Abrir em Postagens';
    item.appendChild(el('span', 'rv-publicado-titulo', p.titulo));
    if (p.redes?.length) {
      const selos = el('span', 'rv-selos');
      p.redes.forEach((rede) => selos.appendChild(el('span', 'rv-selo', rede)));
      item.appendChild(selos);
    }
    item.addEventListener('click', () => abrirItem(p));
    corpo.appendChild(item);
  });
  return cartao;
}

function buildBlocoFechamento(titulo: string, itens: ItemRevisao[], vazio: string): HTMLElement {
  const bloco = el('div', 'rv-fecho');
  bloco.appendChild(el('h4', undefined, `${titulo} · ${itens.length}`));
  if (!itens.length) {
    bloco.appendChild(el('p', 'rv-fecho-texto', vazio));
    return bloco;
  }
  itens.slice(0, 6).forEach((i) => {
    const linha = el('button', 'rv-fecho-item');
    linha.type = 'button';
    linha.append(el('span', 'rv-fecho-titulo', i.titulo), el('span', 'rv-fecho-dia', diaCurto(i.dia)));
    linha.title = [i.tipo === 'card' ? 'Card' : 'Checklist', i.detalhe].filter(Boolean).join(' · ');
    linha.addEventListener('click', () => abrirItem(i));
    bloco.appendChild(linha);
  });
  if (itens.length > 6) bloco.appendChild(el('p', 'rv-fecho-texto', `+ ${itens.length - 6} no PDF da semana`));
  return bloco;
}

/** Fechamento: o que foi concluído, o que atrasou, e rotinas e foco — com o caminho para começar quando não há registro. */
function buildFechamento(r: RevisaoSemana): HTMLElement {
  const { cartao, corpo } = buildCartao('rv-fechamento', 'Fechamento');
  corpo.append(
    buildBlocoFechamento('Concluídos', r.concluidos, 'Nenhum card chegou à última coluna e nenhuma checklist foi concluída.'),
    buildBlocoFechamento('Atrasaram', r.atrasaram, 'Nenhum prazo passou sem conclusão.'),
  );
  const bloco = el('div', 'rv-fecho');
  bloco.appendChild(el('h4', undefined, 'Rotinas e foco'));
  if (!r.rotinas.length && !r.tempo.length) {
    const texto = el('p', 'rv-fecho-texto', 'Sem registros nesta semana. ');
    const link = el('button', 'rv-link', 'Criar uma rotina no Quadro');
    link.type = 'button';
    link.addEventListener('click', () => abrirModulo('quadro'));
    texto.appendChild(link);
    bloco.appendChild(texto);
  } else {
    r.rotinas.forEach((x) => {
      const linha = el('div', 'rv-fecho-item is-estatico');
      linha.append(el('span', 'rv-fecho-titulo', x.titulo), el('span', 'rv-fecho-dia', `${x.feitas} de ${x.previstas}`));
      bloco.appendChild(linha);
    });
    r.tempo.slice(0, 5).forEach((t) => {
      const linha = el('button', 'rv-fecho-item');
      linha.type = 'button';
      linha.append(el('span', 'rv-fecho-titulo', t.titulo), el('span', 'rv-fecho-dia', textoDuracao(t.minutos)));
      linha.title = 'Foco registrado no Pomodoro';
      linha.addEventListener('click', () => abrirAlvo(t.tipo === 'card' ? { modulo: 'kanban', id: t.id } : { modulo: 'todo', id: t.id }));
      bloco.appendChild(linha);
    });
  }
  corpo.appendChild(bloco);
  return cartao;
}

export interface AcoesSemana {
  irPara: (inicio: string) => void;
  exportar: () => void;
}

export function buildSemana(inicio: string, r: RevisaoSemana | null, acoes: AcoesSemana): HTMLElement {
  const tela = el('div', 'rv-tela');
  const nav = el('div', 'rv-nav');
  const anterior = buildBotao('', { variante: 'fantasma', icone: ICONE_ANTERIOR, titulo: 'Semana anterior' });
  anterior.classList.add('rv-seta');
  anterior.setAttribute('aria-label', 'Semana anterior');
  anterior.addEventListener('click', () => acoes.irPara(somarDias(inicio, -7)));
  const proxima = buildBotao('', { variante: 'fantasma', icone: ICONE_PROXIMA, titulo: 'Semana seguinte' });
  proxima.classList.add('rv-seta');
  proxima.setAttribute('aria-label', 'Semana seguinte');
  const atual = semanaAtual();
  proxima.disabled = inicio >= atual;
  proxima.addEventListener('click', () => acoes.irPara(somarDias(inicio, 7)));
  const rotulo = el('h2', 'rv-periodo');
  rotulo.append(el('strong', undefined, inicio === atual ? 'Esta semana' : inicio === somarDias(atual, -7) ? 'Semana passada' : 'Semana'), el('span', undefined, ` · ${periodoPorExtenso(inicio, somarDias(inicio, 6))}`));
  nav.append(anterior, rotulo, proxima);
  if (inicio !== atual) {
    const voltar = buildBotao('Esta semana', { variante: 'fantasma' });
    voltar.addEventListener('click', () => acoes.irPara(atual));
    nav.appendChild(voltar);
  }
  nav.appendChild(el('span', 'pg-espaco'));
  const pdf = buildBotao('Salvar PDF', { variante: 'secundario', icone: ICONE_PDF });
  pdf.disabled = !r;
  pdf.addEventListener('click', () => acoes.exportar());
  nav.appendChild(pdf);
  tela.appendChild(nav);

  if (!r) {
    tela.appendChild(el('p', 'rv-vazio', 'Montando a semana…'));
    return tela;
  }

  tela.appendChild(buildNumeros(r));
  const linha1 = el('div', 'rv-linha');
  linha1.append(buildRitmo(r), buildCanais(r));
  const linha2 = el('div', 'rv-linha');
  // A lista se redesenha sozinha ("Ver todos"): troca o próprio cartão, sem pedir nada à Home.
  const trocarPublicados = (): void => {
    const novo = buildPublicados(r, trocarPublicados);
    linha2.firstElementChild?.replaceWith(novo);
  };
  linha2.append(buildPublicados(r, trocarPublicados), buildFechamento(r));
  tela.append(linha1, linha2);
  return tela;
}

// ---------- Documento (PDF) ----------

const ROTULO_TIPO: Record<ItemRevisao['tipo'], string> = { card: 'Card', checklist: 'Checklist', postagem: 'Postagem' };

function docLista(titulo: string, itens: ItemRevisao[], vazio: string): HTMLElement {
  const secao = el('section', 'rv-doc-secao');
  secao.appendChild(el('h2', undefined, `${titulo}${itens.length ? ` (${itens.length})` : ''}`));
  if (!itens.length) {
    secao.appendChild(el('p', 'rv-doc-vazio', vazio));
    return secao;
  }
  const tabela = el('table', 'rv-doc-tabela');
  itens.forEach((i) => {
    const tr = el('tr');
    tr.append(el('td', 'rv-doc-dia', diaCurto(i.dia)), el('td', undefined, i.titulo), el('td', 'rv-doc-meta', [ROTULO_TIPO[i.tipo], i.detalhe].filter(Boolean).join(' · ')));
    tabela.appendChild(tr);
  });
  secao.appendChild(tabela);
  return secao;
}

/** O papel da revisão: sempre claro, na família visual dos documentos (`.rd-documento`). */
export function buildDocumentoSemana(r: RevisaoSemana): HTMLElement {
  const doc = el('article', 'rd-documento rv-doc');
  const topo = el('header', 'rv-doc-topo');
  topo.append(el('h1', undefined, 'Revisão da semana'), el('p', undefined, periodoPorExtenso(r.inicio, r.fim)));
  doc.appendChild(topo);
  const numeros = el('div', 'rv-doc-numeros');
  const rotinasFeitas = r.rotinas.reduce((n, x) => n + Math.min(x.feitas, x.previstas), 0);
  const rotinasPrevistas = r.rotinas.reduce((n, x) => n + x.previstas, 0);
  [
    ['Concluídos', String(r.concluidos.length)],
    ['Atrasaram', String(r.atrasaram.length)],
    ['Publicados', String(r.publicados.length)],
    ['Rotinas', rotinasPrevistas ? `${rotinasFeitas}/${rotinasPrevistas}` : '—'],
    ['Foco', r.tempoTotal ? textoDuracao(r.tempoTotal) : '—'],
  ].forEach(([rotulo, valor]) => {
    const b = el('div');
    b.append(el('strong', undefined, valor), el('span', undefined, rotulo));
    numeros.appendChild(b);
  });
  doc.appendChild(numeros);
  if (r.frases.length) {
    const fatos = el('section', 'rv-doc-secao');
    fatos.appendChild(el('h2', undefined, 'Fatos da semana'));
    const ul = el('ul');
    r.frases.forEach((f) => ul.appendChild(el('li', undefined, f)));
    fatos.appendChild(ul);
    doc.appendChild(fatos);
  }
  doc.append(
    docLista('Concluídos', r.concluidos, 'Nenhum item concluído.'),
    docLista('Atrasaram', r.atrasaram, 'Nenhum prazo passou sem conclusão.'),
    docLista('Publicados', r.publicados, 'Nenhuma postagem publicada.'),
  );
  if (r.rotinas.length || r.tempo.length) {
    const secao = el('section', 'rv-doc-secao');
    secao.appendChild(el('h2', undefined, 'Rotinas e foco'));
    const tabela = el('table', 'rv-doc-tabela');
    r.rotinas.forEach((x) => {
      const tr = el('tr');
      tr.append(el('td', 'rv-doc-dia', 'Rotina'), el('td', undefined, x.titulo), el('td', 'rv-doc-meta', `${x.feitas} de ${x.previstas} dias`));
      tabela.appendChild(tr);
    });
    r.tempo.forEach((t) => {
      const tr = el('tr');
      tr.append(el('td', 'rv-doc-dia', 'Foco'), el('td', undefined, t.titulo), el('td', 'rv-doc-meta', textoDuracao(t.minutos)));
      tabela.appendChild(tr);
    });
    secao.appendChild(tabela);
    doc.appendChild(secao);
  }
  return doc;
}
