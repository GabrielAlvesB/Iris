import type { AssinaturaRelatorio } from '../../../shared/types/ajustes.types.js';
import { TIPOS_POSTAGEM, type TipoPostagem } from '../../../shared/types/postagens.types.js';
import {
  STATUS_MARCACAO,
  TIPOS_MARCACAO,
  type ItemRelatorio,
  type Relatorio,
  type SecaoRelatorio,
} from '../../../shared/types/relatorios.types.js';
import { svg } from '../../ui/pagina.js';
import { formatarData } from '../postagens/postagens.ui.js';
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

/** Parágrafos a partir de texto com quebras de linha (sem innerHTML). */
function paragrafos(texto: string, classe = 'rd-texto'): HTMLElement {
  const wrap = el('div', classe);
  texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((p) => {
      const par = el('p');
      p.split('\n').forEach((linha, i) => {
        if (i) par.appendChild(document.createElement('br'));
        par.append(linha);
      });
      wrap.appendChild(par);
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
  marca.append(logo, el('span', undefined, `Iris · Relatório de análise nº ${rel.seq}`));
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
  linha('Criado em', dataPorExtenso(rel.createdAt));
  linha('Período', descreverPeriodo(rel));
  linha('Postagens', porTipo.length ? porTipo.map((x) => `${x.n} ${x.n === 1 ? x.t.singular.toLowerCase() : x.t.rotulo.toLowerCase()}`).join(' · ') : 'nenhuma');
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
    const adaptador = ADAPTADORES[t.id];
    secao.appendChild(el('h3', 'rd-h3', `${t.rotulo} ${t.id === 'imagem' ? 'analisadas' : 'analisados'} · ${doTipo.length}`));
    const tabela = el('table', 'rd-tabela');
    const cab = el('thead');
    const tr = el('tr');
    ['#', 'Título', 'Etapa', 'Data', 'Redes', 'Marcações'].forEach((c) => tr.appendChild(el('th', undefined, c)));
    cab.appendChild(tr);
    const corpo = el('tbody');
    doTipo.forEach((item) => {
      const s = item.snapshot;
      const linha = el('tr');
      linha.append(
        el('td', 'rd-num', `${adaptador.singular[0]}${s.seq}`),
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
  tipo.append(`${adaptador.singular} #${item.snapshot.seq}`);
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

function buildSecao(secao: SecaoRelatorio, numero: number): HTMLElement {
  const bloco = el('section', 'rd-bloco rd-secao');
  bloco.appendChild(el('h2', 'rd-h2', `${numero}. ${secao.titulo}`));
  if (secao.texto.trim()) bloco.appendChild(paragrafos(secao.texto));
  // Dentro da seção, os itens seguem agrupados por tipo, na ordem do catálogo.
  const tipos: TipoPostagem[] = TIPOS_POSTAGEM.map((t) => t.id);
  tipos.forEach((t) => secao.itens.filter((i) => i.tipo === t).forEach((item) => bloco.appendChild(buildItem(item))));
  return bloco;
}

// ---------- Documento ----------

export function buildDocumento(rel: Relatorio, assinatura: AssinaturaRelatorio): HTMLElement {
  const doc = el('div', 'rd-documento');
  doc.appendChild(buildCapa(rel));

  const indicadores = buildIndicadores(rel);
  if (rel.resumo.trim() || indicadores) {
    const geral = el('section', 'rd-bloco');
    geral.appendChild(el('h2', 'rd-h2', 'Informações gerais'));
    if (rel.resumo.trim()) geral.appendChild(paragrafos(rel.resumo));
    if (indicadores) geral.appendChild(indicadores);
    doc.appendChild(geral);
  }

  const utilizadas = buildPostagensUtilizadas(rel);
  if (utilizadas) doc.appendChild(utilizadas);

  rel.secoes.forEach((secao, i) => doc.appendChild(buildSecao(secao, i + 1)));

  if (rel.conclusao.trim()) {
    const conclusao = el('section', 'rd-bloco');
    conclusao.appendChild(el('h2', 'rd-h2', 'Conclusão'));
    conclusao.appendChild(paragrafos(rel.conclusao));
    doc.appendChild(conclusao);
  }

  if (rel.incluirAssinatura) {
    const bloco = buildAssinatura(assinatura);
    if (bloco) doc.appendChild(bloco);
  }
  return doc;
}
