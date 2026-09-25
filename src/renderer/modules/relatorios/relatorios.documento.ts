import type { AssinaturaRelatorio } from '../../../shared/types/ajustes.types.js';
import { TIPOS_POSTAGEM, type TipoPostagem } from '../../../shared/types/postagens.types.js';
import {
  STATUS_MARCACAO,
  TIPOS_MARCACAO,
  TONS_DESTAQUE,
  type BlocoMetricas,
  type BlocoRelatorio,
  type ItemRelatorio,
  type LinhaMetrica,
  type Relatorio,
  type SecaoRelatorio,
} from '../../../shared/types/relatorios.types.js';
import { FAIXAS_SCORE, faixaDoScore } from '../../../shared/types/videos.conversao.js';
import { svg } from '../../ui/pagina.js';
import { formatarData } from '../postagens/postagens.ui.js';
import { descreverPeriodoFiltro, rotuloMes } from './relatorios.metricas.js';
import { ADAPTADORES, localMarcacaoImagem, localMarcacaoVideo } from './relatorios.tipos.js';

/**
 * O documento do relatório, montado em DOM. É o mesmo nó na prévia da tela e
 * no PDF (impresso da própria janela pelo main): não há um segundo gerador de
 * HTML para manter igual. Todo conteúdo do usuário entra por textContent.
 *
 * As seções que dependem do tipo (vídeos analisados, imagens analisadas)
 * aparecem só quando o relatório tem itens daquele tipo.
 */

const MARCA_IRIS =
  '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3.2"/>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** `**trecho**` vira negrito; o resto entra como texto puro. */
function comNegrito(destino: HTMLElement, linha: string): void {
  linha.split(/(\*\*[^*]+\*\*)/g).forEach((parte) => {
    if (/^\*\*[^*]+\*\*$/.test(parte)) destino.appendChild(el('strong', undefined, parte.slice(2, -2)));
    else if (parte) destino.append(parte);
  });
}

const MARCADOR_LISTA = /^\s*[-•*]\s+/;
const MARCADOR_NUMERO = /^\s*\d+[.)]\s+/;

/**
 * Texto livre em parágrafos, sem innerHTML. Uma formatação mínima, que se
 * escreve sem barra de ferramentas: linhas com "- " viram lista, "1. " lista
 * numerada, e **trecho** fica em negrito.
 */
export function paragrafos(texto: string, classe = 'rd-texto'): HTMLElement {
  const wrap = el('div', classe);
  texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((p) => {
      let par: HTMLElement | null = null;
      let lista: HTMLElement | null = null;
      p.split('\n').forEach((linha) => {
        const marcador = MARCADOR_LISTA.test(linha) ? 'ul' : MARCADOR_NUMERO.test(linha) ? 'ol' : null;
        if (marcador) {
          par = null;
          if (!lista || lista.tagName.toLowerCase() !== marcador) {
            lista = el(marcador);
            wrap.appendChild(lista);
          }
          const li = el('li');
          comNegrito(li, linha.replace(marcador === 'ul' ? MARCADOR_LISTA : MARCADOR_NUMERO, ''));
          lista.appendChild(li);
          return;
        }
        lista = null;
        if (par) par.appendChild(document.createElement('br'));
        else {
          par = el('p');
          wrap.appendChild(par);
        }
        comNegrito(par, linha);
      });
    });
  return wrap;
}

export function dataPorExtenso(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function descreverPeriodo(rel: Pick<Relatorio, 'periodoInicio' | 'periodoFim'>): string {
  if (rel.periodoInicio && rel.periodoFim) return `${formatarData(rel.periodoInicio)} a ${formatarData(rel.periodoFim)}`;
  if (rel.periodoInicio) return `A partir de ${formatarData(rel.periodoInicio)}`;
  if (rel.periodoFim) return `Até ${formatarData(rel.periodoFim)}`;
  return '';
}

export function todosOsItens(rel: Relatorio): ItemRelatorio[] {
  return rel.secoes.flatMap((s) => s.itens);
}

function rotuloTipoMarcacao(id: string): string {
  return TIPOS_MARCACAO.find((t) => t.id === id)?.rotulo ?? id;
}

function rotuloStatusMarcacao(id: string): string {
  return STATUS_MARCACAO.find((s) => s.id === id)?.rotulo ?? id;
}

// ---------- Assinatura ----------

/**
 * O único lugar que desenha a assinatura. Nome, linhas e formato vêm dos
 * Ajustes: mudar a identificação não mexe no gerador.
 */
export function buildAssinatura(assinatura: AssinaturaRelatorio, dataEmissao = new Date().toISOString()): HTMLElement | null {
  if (!assinatura.nome.trim()) return null;
  const bloco = el('footer', `rd-assinatura is-${assinatura.formato}`);
  if (assinatura.formato === 'com-linha') bloco.appendChild(el('span', 'rd-assinatura-linha'));
  bloco.appendChild(el('strong', 'rd-assinatura-nome', assinatura.nome));
  assinatura.linhas.forEach((linha) => bloco.appendChild(el('span', 'rd-assinatura-texto', linha)));
  if (assinatura.mostrarData) bloco.appendChild(el('span', 'rd-assinatura-data', `Emitido em ${dataPorExtenso(dataEmissao)}`));
  return bloco;
}

// ---------- Blocos ----------

function buildCapa(rel: Relatorio): HTMLElement {
  const capa = el('header', 'rd-capa');
  const marca = el('div', 'rd-marca');
  const logo = el('span', 'rd-marca-logo');
  logo.innerHTML = svg(MARCA_IRIS, 16, 2);
  marca.append(logo, el('span', undefined, 'Iris · Relatório de análise'));
  capa.appendChild(marca);
  capa.appendChild(el('h1', 'rd-titulo', rel.titulo));
  if (rel.contexto.trim()) capa.appendChild(paragrafos(rel.contexto, 'rd-contexto'));

  const itens = todosOsItens(rel);
  const porTipo = TIPOS_POSTAGEM.map((t) => ({ t, n: itens.filter((i) => i.tipo === t.id).length })).filter((x) => x.n);
  const meta = el('dl', 'rd-meta');
  const linha = (rotulo: string, valor: string): void => {
    if (!valor) return;
    const bloco = el('div');
    bloco.append(el('dt', undefined, rotulo), el('dd', undefined, valor));
    meta.appendChild(bloco);
  };
  linha(rel.tagsNomes.length > 1 ? 'Empresas' : 'Empresa', rel.tagsNomes.join(', '));
  linha('Criado em', dataPorExtenso(rel.createdAt));
  linha('Período', descreverPeriodo(rel));
  // Só as analisadas item a item; números de blocos de métricas têm o próprio período e contagem.
  linha('Postagens analisadas', porTipo.map((x) => `${x.n} ${x.n === 1 ? x.t.singular.toLowerCase() : x.t.rotulo.toLowerCase()}`).join(' · '));
  linha('Situação', rel.situacao === 'finalizado' ? 'Finalizado' : 'Rascunho');
  capa.appendChild(meta);
  return capa;
}

const PLURAL_MARCACAO: Record<(typeof TIPOS_MARCACAO)[number]['id'], string> = {
  'ponto-forte': 'pontos fortes',
  ajuste: 'ajustes',
  problema: 'problemas',
  ideia: 'ideias',
  duvida: 'dúvidas',
};

function buildIndicadores(rel: Relatorio): HTMLElement | null {
  const marcacoes = todosOsItens(rel).flatMap((i) => i.marcacoes as Array<{ tipo: string; status: string }>);
  if (!marcacoes.length) return null;
  const grade = el('div', 'rd-indicadores');
  const caixa = (rotulo: string, valor: number, classe = ''): void => {
    const c = el('div', `rd-indicador ${classe}`.trim());
    c.append(el('strong', undefined, String(valor)), el('span', undefined, rotulo));
    grade.appendChild(c);
  };
  caixa('marcações', marcacoes.length, 'is-total');
  TIPOS_MARCACAO.forEach((t) => {
    const n = marcacoes.filter((m) => m.tipo === t.id).length;
    if (n) caixa(n === 1 ? t.rotulo.toLowerCase() : PLURAL_MARCACAO[t.id], n, `is-${t.id}`);
  });
  const abertas = marcacoes.filter((m) => m.status === 'aberta' || m.status === 'andamento').length;
  caixa('em aberto', abertas, abertas ? 'is-aberto' : '');
  return grade;
}

/** Uma tabela por tipo: "Vídeos analisados", "Imagens analisadas". */
function buildPostagensUtilizadas(rel: Relatorio): HTMLElement | null {
  const itens = todosOsItens(rel);
  if (!itens.length) return null;
  const secao = el('section', 'rd-bloco');
  secao.appendChild(el('h2', 'rd-h2', 'Postagens utilizadas'));
  TIPOS_POSTAGEM.forEach((t) => {
    const doTipo = itens.filter((i) => i.tipo === t.id);
    if (!doTipo.length) return;
    secao.appendChild(el('h3', 'rd-h3', `${t.rotulo} ${t.id === 'imagem' ? 'analisadas' : 'analisados'} · ${doTipo.length}`));
    const tabela = el('table', 'rd-tabela');
    const cab = el('thead');
    const tr = el('tr');
    ['Título', 'Etapa', 'Data', 'Redes', 'Marcações'].forEach((c) => tr.appendChild(el('th', undefined, c)));
    cab.appendChild(tr);
    const corpo = el('tbody');
    doTipo.forEach((item) => {
      const s = item.snapshot;
      const linha = el('tr');
      linha.append(
        el('td', 'rd-forte', s.titulo),
        el('td', undefined, s.etapa),
        el('td', 'rd-num', s.dataAgendada ? formatarData(s.dataAgendada) : '—'),
        el('td', undefined, s.redes.join(', ') || '—'),
        el('td', 'rd-num', String(item.marcacoes.length)),
      );
      corpo.appendChild(linha);
    });
    tabela.append(cab, corpo);
    secao.appendChild(tabela);
  });
  return secao;
}

function buildDados(item: ItemRelatorio): HTMLElement {
  const s = item.snapshot;
  const meta = el('p', 'rd-item-meta');
  meta.textContent = [
    s.etapa,
    s.dataAgendada ? `${formatarData(s.dataAgendada)}${s.horaAgendada ? ` às ${s.horaAgendada}` : ''}` : '',
    s.redes.join(', '),
    s.tags.length ? `Tags: ${s.tags.join(', ')}` : '',
    s.prioridade ? `Prioridade ${s.prioridade.toLowerCase()}` : '',
    s.score !== undefined ? `Score ${s.score.toLocaleString('pt-BR')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const wrap = el('div', 'rd-item-dados');
  wrap.appendChild(meta);
  if (s.dados.length) {
    const dl = el('dl', 'rd-dados');
    s.dados.forEach((d) => {
      const par = el('div');
      par.append(el('dt', undefined, d.nome), el('dd', undefined, d.valor));
      dl.appendChild(par);
    });
    wrap.appendChild(dl);
  }
  return wrap;
}

function buildMarcacoes(item: ItemRelatorio): HTMLElement | null {
  if (!item.marcacoes.length) return null;
  const tabela = el('table', 'rd-tabela rd-marcacoes');
  const cab = el('thead');
  const tr = el('tr');
  [item.tipo === 'video' ? 'Tempo' : 'Onde', 'Tipo', 'Categoria', 'Status', 'Comentário'].forEach((c) => tr.appendChild(el('th', undefined, c)));
  cab.appendChild(tr);
  const corpo = el('tbody');
  const linhas =
    item.tipo === 'video'
      ? item.marcacoes.map((m) => ({ m, local: localMarcacaoVideo(m) }))
      : item.marcacoes.map((m) => ({ m, local: localMarcacaoImagem(m) }));
  linhas.forEach(({ m, local }) => {
    const linha = el('tr', `is-${m.tipo}`);
    const comentario = el('td');
    comentario.appendChild(el('span', 'rd-comentario', m.comentario || '—'));
    if (m.observacao.trim()) comentario.appendChild(el('span', 'rd-observacao', `Obs.: ${m.observacao}`));
    const tipo = el('td');
    tipo.appendChild(el('span', `rd-selo is-${m.tipo}`, rotuloTipoMarcacao(m.tipo)));
    linha.append(
      el('td', 'rd-num rd-local', local),
      tipo,
      el('td', undefined, m.categoria || '—'),
      el('td', `rd-status is-${m.status}`, rotuloStatusMarcacao(m.status)),
      comentario,
    );
    corpo.appendChild(linha);
  });
  tabela.append(cab, corpo);
  return tabela;
}

function buildItem(item: ItemRelatorio): HTMLElement {
  const adaptador = ADAPTADORES[item.tipo];
  const cartao = el('article', `rd-item is-${item.tipo}`);
  const cab = el('header', 'rd-item-cab');
  const tipo = el('span', 'rd-item-tipo');
  tipo.innerHTML = svg(adaptador.icone, 12, 2);
  tipo.append(adaptador.singular);
  cab.append(tipo, el('h4', 'rd-item-titulo', item.snapshot.titulo));
  cartao.appendChild(cab);
  cartao.appendChild(buildDados(item));

  const marcacoes = buildMarcacoes(item);
  if (marcacoes) {
    cartao.appendChild(el('h5', 'rd-h5', `Marcações · ${item.marcacoes.length}`));
    cartao.appendChild(marcacoes);
  }
  if (item.anotacoes.trim()) {
    cartao.appendChild(el('h5', 'rd-h5', 'Anotações'));
    cartao.appendChild(paragrafos(item.anotacoes));
  }
  if (item.observacoes.trim()) {
    cartao.appendChild(el('h5', 'rd-h5', 'Observações'));
    cartao.appendChild(paragrafos(item.observacoes, 'rd-texto rd-destaque'));
  }
  return cartao;
}

// ---------- Blocos livres ----------

function num(n: number, casas = 1): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function tabela(colunas: string[], linhas: string[][], classesColunas: string[] = [], rodape?: string[]): HTMLElement {
  const t = el('table', 'rd-tabela');
  const cab = el('thead');
  const tr = el('tr');
  colunas.forEach((c, i) => tr.appendChild(el('th', classesColunas[i], c)));
  cab.appendChild(tr);
  const corpo = el('tbody');
  linhas.forEach((l) => {
    const linha = el('tr');
    l.forEach((celula, i) => linha.appendChild(el('td', classesColunas[i], celula)));
    corpo.appendChild(linha);
  });
  t.append(cab, corpo);
  if (rodape) {
    const pe = el('tfoot');
    const linha = el('tr');
    rodape.forEach((c, i) => linha.appendChild(el('td', classesColunas[i], c)));
    pe.appendChild(linha);
    t.appendChild(pe);
  }
  return t;
}

function mediaTexto(l: Pick<LinhaMetrica, 'media'>): string {
  return l.media === undefined ? '—' : num(l.media);
}

function faixaTexto(media: number | undefined): string {
  return media === undefined ? '—' : faixaDoScore(media).rotulo;
}

function rotuloTipo(id: string, total: number): string {
  const t = TIPOS_POSTAGEM.find((x) => x.id === id);
  if (!t) return id;
  return total === 1 ? t.singular.toLowerCase() : t.rotulo.toLowerCase();
}

function buildBlocoMetricas(bloco: BlocoMetricas): HTMLElement {
  const wrap = el('div', 'rd-metricas');
  if (bloco.titulo.trim()) wrap.appendChild(el('h3', 'rd-h3', bloco.titulo));
  if (bloco.introducao.trim()) wrap.appendChild(paragrafos(bloco.introducao));
  const r = bloco.resultado;

  // Período: o pedido no filtro e o que de fato foi encontrado dentro dele.
  const periodo = el('dl', 'rd-meta rd-metricas-periodo');
  const par = (rotulo: string, valor: string): void => {
    const d = el('div');
    d.append(el('dt', undefined, rotulo), el('dd', undefined, valor));
    periodo.appendChild(d);
  };
  par('Período analisado', descreverPeriodoFiltro(bloco.filtro));
  if (r) {
    par(
      'Postagens encontradas',
      r.primeiraData && r.ultimaData
        ? r.primeiraData === r.ultimaData
          ? `Todas em ${formatarData(r.primeiraData)}`
          : `De ${formatarData(r.primeiraData)} a ${formatarData(r.ultimaData)}`
        : 'Nenhuma no período',
    );
    par('Calculado em', new Date(r.calculadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }));
  }
  wrap.appendChild(periodo);

  if (!r) {
    wrap.appendChild(paragrafos('Métricas ainda não calculadas.'));
    return wrap;
  }

  const grade = el('div', 'rd-indicadores');
  const caixa = (rotulo: string, valor: string, detalhe = '', classe = ''): void => {
    const c = el('div', `rd-indicador ${classe}`.trim());
    c.append(el('strong', undefined, valor), el('span', undefined, rotulo));
    if (detalhe) c.appendChild(el('small', 'rd-indicador-detalhe', detalhe));
    grade.appendChild(c);
  };
  const tiposComPostagem = r.porTipo.filter((t) => t.total > 0);
  caixa(
    'postagens',
    String(r.total),
    tiposComPostagem.length > 1 ? tiposComPostagem.map((t) => `${t.total} ${rotuloTipo(t.rotulo, t.total)}`).join(' · ') : '',
    'is-total',
  );
  caixa('score geral (média)', r.media === undefined ? '—' : num(r.media), faixaTexto(r.media), 'is-score');
  caixa('mediana', r.mediana === undefined ? '—' : num(r.mediana));
  caixa('com score', `${r.comScore}/${r.total}`, r.total ? `${Math.round((r.comScore / r.total) * 100)}% preenchido` : '');
  if (r.maior) caixa('maior score', num(r.maior.score), r.maior.titulo, 'is-ponto-forte');
  if (r.menor) caixa('menor score', num(r.menor.score), r.menor.titulo, 'is-problema');
  wrap.appendChild(grade);

  if (r.filtrosDescritos.length) {
    const filtros = el('ul', 'rd-filtros');
    r.filtrosDescritos.forEach((f) => filtros.appendChild(el('li', undefined, f)));
    wrap.appendChild(filtros);
  }

  const partes = new Set(bloco.partes);
  if (partes.has('porMes') && r.porMes.length) {
    wrap.appendChild(el('h5', 'rd-h5', 'Por mês'));
    wrap.appendChild(
      tabela(
        ['Mês', 'Postagens', 'Com score', 'Score médio', 'Faixa'],
        r.porMes.map((m) => [rotuloMes(m.rotulo).replace(/^./, (c) => c.toUpperCase()), String(m.total), String(m.comScore), mediaTexto(m), faixaTexto(m.media)]),
        ['rd-forte', 'rd-num', 'rd-num', 'rd-num', ''],
        r.porMes.length > 1 ? ['Total', String(r.total), String(r.comScore), r.media === undefined ? '—' : num(r.media), faixaTexto(r.media)] : undefined,
      ),
    );
  }
  if (partes.has('faixas') && r.comScore) {
    wrap.appendChild(el('h5', 'rd-h5', 'Faixas de score'));
    wrap.appendChild(
      tabela(
        ['Faixa', 'Intervalo', 'Postagens', '% das com score'],
        FAIXAS_SCORE.map((f) => {
          const n = r.faixas.find((x) => x.rotulo === f.id)?.total ?? 0;
          return [f.rotulo, `${f.min} a ${Math.floor(f.max)}`, String(n), `${Math.round((n / r.comScore) * 100)}%`];
        }),
        ['rd-forte', 'rd-num', 'rd-num', 'rd-num'],
      ),
    );
  }
  const porGrupo = (titulo: string, coluna: string, linhas: LinhaMetrica[]): void => {
    if (!linhas.length) return;
    wrap.appendChild(el('h5', 'rd-h5', titulo));
    wrap.appendChild(
      tabela(
        [coluna, 'Postagens', 'Com score', 'Score médio'],
        linhas.map((l) => [l.rotulo, String(l.total), String(l.comScore), mediaTexto(l)]),
        ['rd-forte', 'rd-num', 'rd-num', 'rd-num'],
      ),
    );
  };
  if (partes.has('redes')) porGrupo('Por rede', 'Rede', r.redes);
  if (partes.has('tags')) porGrupo('Por tag', 'Tag', r.tags);
  if (partes.has('postagens') && r.postagens.length) {
    wrap.appendChild(el('h5', 'rd-h5', `Postagens · ${r.postagens.length}`));
    wrap.appendChild(
      tabela(
        ['Título', 'Data', 'Redes', 'Score'],
        r.postagens.map((p) => [
          p.titulo,
          formatarData(p.data),
          p.redes.join(', ') || '—',
          p.score === undefined ? '—' : num(p.score),
        ]),
        ['rd-forte', 'rd-num', '', 'rd-num'],
      ),
    );
  }
  if (bloco.comentario.trim()) {
    wrap.appendChild(el('h5', 'rd-h5', 'Leitura dos números'));
    wrap.appendChild(paragrafos(bloco.comentario, 'rd-texto rd-destaque'));
  }
  return wrap;
}

export function buildBloco(bloco: BlocoRelatorio): HTMLElement {
  switch (bloco.tipo) {
    case 'texto': {
      const wrap = el('div', 'rd-bloco-livre');
      if (bloco.titulo.trim()) wrap.appendChild(el('h3', 'rd-h3', bloco.titulo));
      wrap.appendChild(paragrafos(bloco.texto));
      return wrap;
    }
    case 'destaque': {
      const wrap = el('aside', `rd-caixa is-${bloco.tom}`);
      // O tom nunca vai só pela cor: sem título, o rótulo do tom aparece no lugar.
      wrap.appendChild(el('strong', 'rd-caixa-titulo', bloco.titulo.trim() || (TONS_DESTAQUE.find((t) => t.id === bloco.tom)?.rotulo ?? '')));
      wrap.appendChild(paragrafos(bloco.texto));
      return wrap;
    }
    case 'tabela': {
      const wrap = el('div', 'rd-bloco-livre');
      if (bloco.titulo.trim()) wrap.appendChild(el('h3', 'rd-h3', bloco.titulo));
      const linhas = bloco.linhas.filter((l) => l.some((c) => c.trim()));
      wrap.appendChild(tabela(bloco.colunas, linhas, bloco.colunas.map((_, i) => (i === 0 ? 'rd-forte' : ''))));
      return wrap;
    }
    case 'metricas':
      return buildBlocoMetricas(bloco);
    case 'analise':
      return buildBlocoAnalise(bloco);
    case 'colunas': {
      const wrap = el('div', 'rd-bloco-livre rd-colunas');
      const lado = (titulo: string, texto: string): void => {
        const col = el('div', 'rd-coluna');
        if (titulo.trim()) col.appendChild(el('h4', 'rd-coluna-titulo', titulo));
        col.appendChild(paragrafos(texto));
        wrap.appendChild(col);
      };
      lado(bloco.tituloEsquerda, bloco.textoEsquerda);
      lado(bloco.tituloDireita, bloco.textoDireita);
      return wrap;
    }
    case 'citacao': {
      const wrap = el('figure', 'rd-citacao');
      const frase = el('blockquote');
      frase.appendChild(paragrafos(bloco.texto));
      wrap.appendChild(frase);
      if (bloco.fonte.trim()) wrap.appendChild(el('figcaption', undefined, `— ${bloco.fonte.trim()}`));
      return wrap;
    }
    case 'quebra':
      return el('div', 'rd-quebra');
  }
}

/**
 * "+12%" sobe, "-3 mil" / "−3 mil" desce. O sentido vai também no texto (seta),
 * nunca só na cor.
 */
function sentidoVariacao(variacao: string): 'sobe' | 'desce' | 'neutro' {
  const v = variacao.trim();
  if (/^\+/.test(v)) return 'sobe';
  if (/^[-−–]/.test(v)) return 'desce';
  return 'neutro';
}

function buildBlocoAnalise(bloco: Extract<BlocoRelatorio, { tipo: 'analise' }>): HTMLElement {
  const wrap = el('div', 'rd-bloco-livre rd-analise');
  if (bloco.titulo.trim()) wrap.appendChild(el('h3', 'rd-h3', bloco.titulo));
  const preenchidos = bloco.indicadores.filter((i) => i.rotulo.trim() || i.valor.trim());
  if (preenchidos.length) {
    const grade = el('div', 'rd-indicadores');
    preenchidos.forEach((ind) => {
      const c = el('div', 'rd-indicador is-manual');
      c.append(el('strong', undefined, ind.valor.trim() || '—'), el('span', undefined, ind.rotulo));
      if (ind.variacao.trim()) {
        const sentido = sentidoVariacao(ind.variacao);
        const seta = sentido === 'sobe' ? '▲ ' : sentido === 'desce' ? '▼ ' : '';
        c.appendChild(el('small', `rd-variacao is-${sentido}`, `${seta}${ind.variacao.trim()}`));
      }
      if (ind.nota.trim()) c.appendChild(el('small', 'rd-indicador-detalhe', ind.nota));
      grade.appendChild(c);
    });
    wrap.appendChild(grade);
  }
  if (bloco.texto.trim()) wrap.appendChild(paragrafos(bloco.texto));
  return wrap;
}

function buildSecao(secao: SecaoRelatorio, numero: number): HTMLElement {
  const bloco = el('section', 'rd-bloco rd-secao');
  bloco.appendChild(el('h2', 'rd-h2', `${numero}. ${secao.titulo}`));
  if (secao.texto.trim()) bloco.appendChild(paragrafos(secao.texto));
  secao.blocos.forEach((b) => bloco.appendChild(buildBloco(b)));
  // Dentro da seção, os itens seguem agrupados por tipo, na ordem do catálogo.
  const tipos: TipoPostagem[] = TIPOS_POSTAGEM.map((t) => t.id);
  tipos.forEach((t) => secao.itens.filter((i) => i.tipo === t).forEach((item) => bloco.appendChild(buildItem(item))));
  return bloco;
}

// ---------- Documento ----------

export function buildDocumento(rel: Relatorio, assinatura: AssinaturaRelatorio): HTMLElement {
  const doc = el('div', 'rd-documento');
  doc.appendChild(buildCapa(rel));

  const indicadores = rel.mostrarIndicadores ? buildIndicadores(rel) : null;
  if (rel.resumo.trim() || rel.objetivos.trim() || indicadores) {
    const geral = el('section', 'rd-bloco');
    geral.appendChild(el('h2', 'rd-h2', 'Informações gerais'));
    if (rel.resumo.trim()) geral.appendChild(paragrafos(rel.resumo));
    if (rel.objetivos.trim()) {
      geral.appendChild(el('h3', 'rd-h3', 'Objetivos'));
      geral.appendChild(paragrafos(rel.objetivos));
    }
    if (indicadores) geral.appendChild(indicadores);
    doc.appendChild(geral);
  }

  const utilizadas = rel.mostrarPostagensUtilizadas ? buildPostagensUtilizadas(rel) : null;
  if (utilizadas) doc.appendChild(utilizadas);

  rel.secoes.forEach((secao, i) => doc.appendChild(buildSecao(secao, i + 1)));

  if (rel.conclusao.trim()) {
    const conclusao = el('section', 'rd-bloco');
    conclusao.appendChild(el('h2', 'rd-h2', 'Conclusão'));
    conclusao.appendChild(paragrafos(rel.conclusao));
    doc.appendChild(conclusao);
  }

  if (rel.recomendacoes.trim()) {
    const recomendacoes = el('section', 'rd-bloco');
    recomendacoes.appendChild(el('h2', 'rd-h2', 'Próximos passos'));
    recomendacoes.appendChild(paragrafos(rel.recomendacoes));
    doc.appendChild(recomendacoes);
  }

  if (rel.observacoesFinais.trim()) {
    const obs = el('section', 'rd-bloco');
    obs.appendChild(el('h2', 'rd-h2', 'Observações finais'));
    obs.appendChild(paragrafos(rel.observacoesFinais, 'rd-texto rd-destaque'));
    doc.appendChild(obs);
  }

  if (rel.incluirAssinatura) {
    const bloco = buildAssinatura(assinatura);
    if (bloco) doc.appendChild(bloco);
  }
  return doc;
}
