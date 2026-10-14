import type { AlvoHome, PulsoHome, SugestaoHome } from '../../../shared/types/home.types';
import { abrirAlvo, abrirContato, abrirLead, abrirPostagem, abrirWhatsapp, abrirModulo } from '../../core/navegacao.js';
import { ICONE_DO_MODULO } from '../../core/sidebar.js';
import { svg, tempoRelativo } from '../../ui/pagina.js';
import { tintaPara } from '../../../shared/types/cor.js';

/**
 * As partes da Home além do dia: a sugestão do dia (IA) e o "pulso" dos
 * módulos — constância, caixa de entrada, uma ideia do banco, uma lembrança
 * dos Pensamentos e os roteiros em aberto. Só desenho: os dados vêm prontos
 * do main (home.service) e as ações voltam para a view.
 */

const ICONE_BRILHO = '<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/><path d="M19 15l.7 2.1L22 18l-2.3.9L19 21l-.7-2.1L16 18l2.3-.9z"/>';
const ICONE_GIRAR = '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>';
const ICONE_SETA = '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>';
const ICONE_CHAMA = '<path d="M12 2c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.5 1 2.5 2 3 0-3 0-5.5 1-8.5z"/>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function botao(classe: string, texto: string, aoClicar: () => void, icone?: string): HTMLButtonElement {
  const b = el('button', classe);
  b.type = 'button';
  if (icone) b.innerHTML = svg(icone, 13);
  b.appendChild(document.createTextNode(texto));
  b.addEventListener('click', aoClicar);
  return b;
}

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? `1 ${um}` : `${n} ${varios}`;
}

function irPara(alvo: AlvoHome): void {
  if (alvo.tipo === 'lead') abrirLead(alvo.ref);
  else if (alvo.tipo === 'ideias') abrirPostagem({ tipo: 'video', ideias: true });
  else abrirAlvo(alvo.alvo);
}

// ---------- Sugestão do dia ----------

export interface AcoesSugestao {
  gerar: () => void;
}

/** A última mensagem que entrou animada: o redesenho de cada minuto não a escreve de novo. */
let mensagemAnimada = '';

/** A mensagem em palavras, cada uma entrando um pouco depois da outra (só na primeira vez que aparece). */
function buildMensagem(texto: string, animar: boolean): HTMLElement {
  const p = el('p', `hm-ia-mensagem${animar ? ' is-escrevendo' : ''}`);
  if (!animar) {
    p.textContent = texto;
    return p;
  }
  texto.split(' ').forEach((palavra, i) => {
    if (i) p.appendChild(document.createTextNode(' '));
    const s = el('span', 'hm-ia-palavra', palavra);
    s.style.setProperty('--i', String(i));
    p.appendChild(s);
  });
  return p;
}

/**
 * O cartão da IA: moldura em gradiente que gira devagar, uma mensagem calorosa
 * para o dia (pelo apelido, apoiada em fatos reais) e, menor, por onde começar.
 * Só é chamado gerando ou com a mensagem pronta: sem IA ou com erro, a Home nem
 * desenha o cartão (o usuário não quer aviso de falha na tela inicial).
 */
export function buildSugestao(s: SugestaoHome | null, gerando: boolean, acoes: AcoesSugestao): HTMLElement {
  const moldura = el('section', `hm-ia${gerando ? ' is-gerando' : ''}`);
  const cartao = el('div', 'hm-ia-cartao');
  moldura.appendChild(cartao);

  const cab = el('header', 'hm-ia-cab');
  const rotulo = el('span', 'hm-ia-rotulo');
  rotulo.innerHTML = svg(ICONE_BRILHO, 14);
  rotulo.appendChild(document.createTextNode('Para o seu dia'));
  cab.appendChild(rotulo);
  if (s?.estado === 'pronta' && !gerando) cab.appendChild(botao('hm-ia-botao', 'Outra mensagem', acoes.gerar, ICONE_GIRAR));
  cartao.appendChild(cab);

  if (gerando || !s || s.estado === 'nova') {
    cartao.appendChild(el('p', 'hm-ia-mensagem is-carregando', 'Escrevendo uma mensagem para o seu dia…'));
    const linhas = el('div', 'hm-ia-esqueleto');
    linhas.append(el('span', 'hm-esq'), el('span', 'hm-esq is-medio'));
    cartao.appendChild(linhas);
    return moldura;
  }

  const chave = `${s.dia}|${s.geradoEm ?? ''}`;
  const animar = chave !== mensagemAnimada;
  mensagemAnimada = chave;
  if (s.mensagem) cartao.appendChild(buildMensagem(s.mensagem, animar));

  const rodape = el('div', 'hm-ia-rodape');
  const itens = s.sugestoes ?? [];
  if (itens.length) {
    const comece = el('div', 'hm-ia-comece');
    comece.appendChild(el('span', 'hm-ia-comece-rotulo', 'Comece por'));
    itens.forEach((item) => {
      const alvo = item.alvo;
      const chip = el(alvo ? 'button' : 'span', `hm-ia-chip${alvo ? ' is-link' : ''}`);
      chip.title = item.porque;
      chip.appendChild(el('span', undefined, item.titulo));
      if (chip instanceof HTMLButtonElement) {
        chip.type = 'button';
        chip.insertAdjacentHTML('beforeend', svg(ICONE_SETA, 12));
        chip.addEventListener('click', () => irPara(alvo!));
      }
      comece.appendChild(chip);
    });
    rodape.appendChild(comece);
  }
  if (s.quem) rodape.appendChild(el('span', 'hm-ia-quem', `escrito por ${s.quem}`));
  cartao.appendChild(rodape);
  return moldura;
}

// ---------- Pulso ----------

export interface AcoesPulso {
  outraIdeia: () => void;
}

function buildCartao(classe: string, rotulo: string, detalhe?: string): { cartao: HTMLElement; corpo: HTMLElement } {
  const cartao = el('section', `hm-cartao ${classe}`);
  const cab = el('header', 'hm-cartao-cab');
  cab.appendChild(el('span', 'hm-rotulo', rotulo));
  if (detalhe) cab.appendChild(el('span', 'hm-cartao-detalhe', detalhe));
  const corpo = el('div', 'hm-cartao-corpo');
  cartao.append(cab, corpo);
  return { cartao, corpo };
}

function dataLocal(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return new Date(a, m - 1, d);
}

/**
 * Constância: um quadradinho por dia, semanas em colunas (segunda em cima).
 * Uma cor só, mais forte quanto mais coisa feita — e o número no title.
 */
export function buildConstancia(p: PulsoHome): HTMLElement {
  const total = p.atividade.reduce((n, d) => n + d.n, 0);
  const { cartao, corpo } = buildCartao('hm-constancia', 'Constância', `${plural(total, 'coisa feita', 'coisas feitas')} em ${Math.ceil(p.atividade.length / 7)} semanas`);
  const destaque = el('div', 'hm-const-destaque');
  const chama = el('span', `hm-const-chama${p.sequencia ? ' is-acesa' : ''}`);
  chama.innerHTML = svg(ICONE_CHAMA, 22, 1.8);
  const textos = el('div', 'hm-const-textos');
  textos.append(
    el('strong', undefined, p.sequencia ? plural(p.sequencia, 'dia seguido', 'dias seguidos') : 'Sequência zerada'),
    el('span', undefined, p.sequencia ? 'com alguma coisa publicada, concluída ou marcada.' : 'Marque algo como feito hoje para começar uma.'),
  );
  destaque.append(chama, textos);
  if (p.focoHoje) destaque.appendChild(el('span', 'hm-const-foco', `${p.focoHoje} min de foco hoje`));
  corpo.appendChild(destaque);

  const maior = Math.max(1, ...p.atividade.map((d) => d.n));
  const nivel = (n: number): number => (n ? Math.min(4, Math.ceil((n / maior) * 4)) : 0);
  const mapa = el('div', 'hm-mapa');
  mapa.setAttribute('role', 'img');
  mapa.setAttribute('aria-label', `Atividade por dia nas últimas semanas: ${total} no total, ${p.sequencia} dias seguidos até hoje.`);
  const meses = el('div', 'hm-mapa-meses');
  const grade = el('div', 'hm-mapa-grade');
  let mesAnterior = -1;
  // Rótulo de mês só com espaço para ele (um mês que começa no fim de uma coluna não encosta no próximo).
  let ultimoRotulo = -3;
  for (let i = 0; i < p.atividade.length; i += 7) {
    const semana = p.atividade.slice(i, i + 7);
    const coluna = el('div', 'hm-mapa-semana');
    semana.forEach((d) => {
      const c = el('span', `hm-mapa-dia is-n${nivel(d.n)}${d.dia === p.hoje ? ' is-hoje' : ''}`);
      c.title = `${dataLocal(d.dia).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}: ${d.n ? plural(d.n, 'coisa feita', 'coisas feitas') : 'nada registrado'}`;
      coluna.appendChild(c);
    });
    grade.appendChild(coluna);
    const indice = i / 7;
    const mes = dataLocal(semana[semana.length - 1]!.dia).getMonth();
    const mostrar = mes !== mesAnterior && indice - ultimoRotulo >= 3;
    meses.appendChild(el('span', undefined, mostrar ? dataLocal(semana[semana.length - 1]!.dia).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') : ''));
    if (mostrar) ultimoRotulo = indice;
    mesAnterior = mes;
  }
  const legenda = el('div', 'hm-mapa-legenda');
  legenda.appendChild(el('span', undefined, 'menos'));
  for (let n = 0; n <= 4; n++) legenda.appendChild(el('span', `hm-mapa-dia is-n${n}`));
  legenda.appendChild(el('span', undefined, 'mais'));
  mapa.append(meses, grade);
  corpo.append(mapa, legenda);
  return cartao;
}

/** Caixa de entrada: leads novos, retornos marcados e mensagens não lidas, de vários módulos num lugar só. */
export function buildCaixa(p: PulsoHome): HTMLElement {
  const total = p.leadsNaoVistos + p.contatar.length + (p.whatsappNaoLidas ? 1 : 0);
  const { cartao, corpo } = buildCartao('hm-caixa', 'Caixa de entrada', total ? undefined : 'tudo em dia');
  if (!total) {
    corpo.appendChild(el('p', 'hm-cartao-vazio', 'Nenhum lead novo, nenhum retorno marcado para hoje e nenhuma mensagem esperando.'));
    return cartao;
  }
  const linha = (inicial: string, titulo: string, detalhe: string, tom: string, fazer: () => void): HTMLElement => {
    const b = el('button', 'hm-caixa-linha');
    b.type = 'button';
    b.append(el('span', `hm-avatar is-${tom}`, inicial), el('span', 'hm-caixa-textos'));
    const textos = b.lastElementChild!;
    textos.append(el('strong', undefined, titulo), el('span', undefined, detalhe));
    b.addEventListener('click', fazer);
    return b;
  };
  const inicial = (nome: string): string => nome.trim().charAt(0).toUpperCase() || '?';
  p.leads.forEach((l) =>
    corpo.appendChild(linha(inicial(l.nome), l.nome, ['Lead novo', l.faixa, l.interesse].filter(Boolean).join(' · '), l.faixa, () => abrirLead(l.ref))),
  );
  if (p.leadsNaoVistos > p.leads.length) corpo.appendChild(botao('hm-link', `+ ${p.leadsNaoVistos - p.leads.length} leads novos`, () => abrirModulo('leads')));
  p.contatar.forEach((c) =>
    corpo.appendChild(linha(inicial(c.nome), c.nome, `Retornar${c.data < p.hoje ? ` · desde ${dataLocal(c.data).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}` : ' · hoje'}${c.nota ? ` · ${c.nota}` : ''}`, 'retorno', () => abrirContato(c.ref))),
  );
  if (p.whatsappNaoLidas) {
    const b = linha('', `${plural(p.whatsappNaoLidas, 'mensagem não lida', 'mensagens não lidas')}`, 'WhatsApp', 'whatsapp', () => abrirWhatsapp('conversas'));
    b.querySelector('.hm-avatar')!.innerHTML = svg(ICONE_DO_MODULO.whatsapp, 14);
    corpo.appendChild(b);
  }
  return cartao;
}

/** Uma ideia esquecida no banco, sorteada por dia; "Outra" sorteia de novo. */
export function buildIdeia(p: PulsoHome, acoes: AcoesPulso): HTMLElement | null {
  if (!p.ideia) return null;
  const { cartao, corpo } = buildCartao('hm-ideia', 'Do banco de ideias', plural(p.ideiasPendentes, 'pendente', 'pendentes'));
  corpo.appendChild(el('p', 'hm-ideia-titulo', p.ideia.titulo));
  if (p.ideia.notas.trim()) corpo.appendChild(el('p', 'hm-ideia-notas', p.ideia.notas));
  corpo.appendChild(el('span', 'hm-cartao-quando', `guardada ${tempoRelativo(p.ideia.criadaEm)}`));
  const rodape = el('div', 'hm-cartao-rodape');
  if (p.ideiasPendentes > 1) rodape.appendChild(botao('hm-fantasma', 'Outra', acoes.outraIdeia, ICONE_GIRAR));
  rodape.appendChild(botao('hm-link', 'Abrir o banco', () => abrirPostagem({ tipo: 'video', ideias: true })));
  corpo.appendChild(rodape);
  return cartao;
}

/** Um pensamento antigo volta, no papel do post-it em que foi escrito. */
export function buildLembranca(p: PulsoHome): HTMLElement | null {
  if (!p.lembranca) return null;
  const l = p.lembranca;
  const { cartao, corpo } = buildCartao('hm-lembranca', 'Lembrança', `escrito ${tempoRelativo(l.criadoEm)}`);
  const papel = el('button', 'hm-postit');
  papel.type = 'button';
  papel.title = 'Abrir em Pensamentos';
  papel.style.setProperty('--postit-cor', l.cor);
  papel.style.setProperty('--postit-tinta', tintaPara(l.cor));
  papel.appendChild(el('span', 'hm-postit-texto', l.texto));
  papel.addEventListener('click', () => abrirAlvo({ modulo: 'pensamentos', id: l.id }));
  corpo.appendChild(papel);
  return cartao;
}

export function buildRoteiros(p: PulsoHome): HTMLElement | null {
  if (!p.roteiros.length) return null;
  const detalhe = [p.roteirosEmRevisao ? `${p.roteirosEmRevisao} em revisão` : '', p.roteirosRascunho ? plural(p.roteirosRascunho, 'rascunho', 'rascunhos') : ''].filter(Boolean).join(' · ');
  const { cartao, corpo } = buildCartao('hm-roteiros', 'Roteiros em aberto', detalhe);
  p.roteiros.forEach((r) => {
    const b = el('button', 'hm-roteiro');
    b.type = 'button';
    b.append(el('span', `hm-roteiro-status is-${r.status}`, r.status === 'revisao' ? 'Em revisão' : 'Rascunho'), el('strong', undefined, r.titulo), el('span', 'hm-cartao-quando', `mexido ${tempoRelativo(r.atualizadoEm)}`));
    b.addEventListener('click', () => abrirAlvo({ modulo: 'roteiros', id: r.id }));
    corpo.appendChild(b);
  });
  return cartao;
}
