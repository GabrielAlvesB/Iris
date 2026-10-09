import { refIgual, type RefContato } from '../../../shared/types/contatos.types.js';
import type { PeriodoRapido } from '../../../shared/types/leads.types.js';
import {
  NOMES_DIA_SEMANA,
  formatarDuracao,
  frasesDosLeads,
  intervaloAnterior,
  intervaloDe,
  leadsDoArquivo,
  noIntervalo,
  porDia,
  porDiaDaSemana,
  porEtapa,
  porHora,
  porOrigem,
  resumir,
  semResposta,
  type FraseLeads,
  type LeadInfo,
} from '../../../shared/types/leads.estatisticas.js';
import { hojeLocal } from '../../../shared/types/brasil.js';
import { RAMPA_ORDINAL, buildCartaoGrafico, buildColunas, buildLegenda, buildRanking, formatarNumero } from '../postagens/postagens.graficos.js';
import { buildIndicadores, buildSegmentado, svg, type Tom } from '../../ui/pagina.js';
import type { CtxContatos } from '../contatos/contatos.casco.js';
import { ICONES_CONTATO, agoraLocal, buildSeloEtapa, el } from '../contatos/contatos.ui.js';

/**
 * Painel dos leads: quantos chegaram, quanto valem, quando chegam, de onde
 * vêm e quantos viram clientes. Todos os números saem de leads.estatisticas
 * (as mesmas contas do Relatório em PDF) e as frases de "O que está
 * acontecendo" são só fatos calculados — nenhuma opinião inventada.
 */

let periodo: PeriodoRapido = '30';

/** As faixas em ordem (frio → quente) na rampa de azul já validada para a superfície escura. */
const COR_FAIXA = { frio: RAMPA_ORDINAL[1], morno: RAMPA_ORDINAL[2], quente: RAMPA_ORDINAL[3] } as const;

function n(v: number, casas = 0): string {
  return formatarNumero(v, casas);
}

function pctTexto(v: number | undefined): string {
  return v === undefined ? '—' : `${n(v)}%`;
}

function buildFrase(ctx: CtxContatos, f: FraseLeads, todos: LeadInfo[], irParaCaixa: () => void): HTMLElement {
  const item = el('li', `ld-frase is-${f.tom}`);
  const icone = f.tom === 'atencao' ? ICONES_CONTATO.sino : f.tom === 'ok' ? '<polyline points="20 6 9 17 4 12"/>' : ICONES_CONTATO.painel;
  item.innerHTML = svg(icone, 15, 2);
  const corpo = el('div', 'ld-frase-corpo');
  corpo.appendChild(el('p', undefined, f.texto));
  if (f.refs?.length) {
    const links = el('div', 'ld-frase-links');
    f.refs.slice(0, 6).forEach((ref: RefContato) => {
      const lead = todos.find((l) => refIgual(l.ref, ref));
      if (!lead) return;
      const b = el('button', 'ld-chip-lead', lead.pessoa.nome);
      b.type = 'button';
      b.addEventListener('click', () => ctx.abrirFicha(ref));
      links.appendChild(b);
    });
    if (f.refs.length > 6) {
      const mais = el('button', 'ct-link', `e mais ${f.refs.length - 6}`);
      mais.type = 'button';
      mais.addEventListener('click', irParaCaixa);
      links.appendChild(mais);
    }
    corpo.appendChild(links);
  }
  item.appendChild(corpo);
  return item;
}

/** `irParaCaixa`: o "e mais N" das frases leva à caixa de entrada, já filtrada. */
export function buildPainel(ctx: CtxContatos, irParaCaixa: () => void): HTMLElement {
  const wrap = el('div', 'ld-painel');
  const todos = leadsDoArquivo(ctx.file).filter((l) => !l.pessoa.arquivado);
  const hoje = hojeLocal();
  const config = { tipo: periodo, de: '', ate: '' } as const;
  const intervalo = intervaloDe(config, hoje);
  const anterior = intervaloAnterior(config, intervalo);
  const atuais = noIntervalo(todos, intervalo);
  const anteriores = noIntervalo(todos, anterior);
  const resumo = resumir(atuais, anteriores);
  const agora = agoraLocal();
  const parados = semResposta(todos, agora);

  const barra = el('div', 'ld-painel-barra');
  barra.appendChild(
    buildSegmentado<PeriodoRapido>(
      [
        { value: '7', label: '7 dias' },
        { value: '30', label: '30 dias' },
        { value: '90', label: '90 dias' },
        { value: 'mes', label: 'Este mês' },
      ],
      periodo,
      (v) => {
        periodo = v;
        ctx.redesenhar();
      },
    ),
  );
  barra.appendChild(el('span', 'ld-painel-periodo', `${intervalo.rotulo.replace(/^./, (c) => c.toUpperCase())} · comparado com ${anterior.rotulo}`));
  wrap.appendChild(barra);

  const variacao = resumo.variacao;
  const tomVariacao: Tom = variacao === undefined || variacao === 0 ? 'neutro' : variacao > 0 ? 'ok' : 'atencao';
  wrap.appendChild(
    buildIndicadores([
      {
        rotulo: 'Leads no período',
        valor: n(resumo.total),
        detalhe: variacao === undefined ? (resumo.anterior ? undefined : 'nenhum no período anterior') : `${variacao > 0 ? '+' : ''}${n(variacao)}% contra ${n(resumo.anterior)}`,
        tom: tomVariacao,
      },
      { rotulo: 'Quentes', valor: pctTexto(resumo.pctQuentes), detalhe: `${n(resumo.quentes)} de ${n(resumo.total)}`, tom: 'neutro' },
      { rotulo: 'Viraram clientes', valor: pctTexto(resumo.conversao), detalhe: `${n(resumo.convertidos)} em etapa "ganha"`, tom: resumo.convertidos ? 'ok' : 'neutro' },
      {
        rotulo: 'Até o 1º contato',
        valor: resumo.tempoMedioMin === undefined ? '—' : formatarDuracao(resumo.tempoMedioMin),
        detalhe: resumo.respondidos ? `média de ${n(resumo.respondidos)} respondidos` : 'nenhuma conversa registrada',
        tom: 'neutro',
      },
      { rotulo: 'Sem resposta há +24 h', valor: n(parados.length), detalhe: parados.length ? 'esperando você' : 'ninguém esperando', tom: parados.length ? 'atencao' : 'ok' },
    ]),
  );

  const frases = frasesDosLeads(todos, atuais, anteriores, agora);
  if (frases.length) {
    const quadro = el('section', 'ld-acontecendo');
    const cab = el('div', 'ld-acontecendo-cab');
    cab.innerHTML = svg(ICONES_CONTATO.raio, 15, 2);
    cab.appendChild(el('h3', undefined, 'O que está acontecendo'));
    quadro.appendChild(cab);
    const lista = el('ul', 'ld-frases');
    frases.forEach((f) => lista.appendChild(buildFrase(ctx, f, todos, irParaCaixa)));
    quadro.appendChild(lista);
    wrap.appendChild(quadro);
  }

  if (!atuais.length) {
    wrap.appendChild(el('p', 'ct-nada', 'Nenhum lead chegou neste período. Escolha um período maior para ver os gráficos.'));
    return wrap;
  }

  const grade = el('div', 'ld-painel-graficos');

  // Leads por dia, empilhados por faixa.
  const dias = porDia(atuais, intervalo);
  const rotuloDia = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const series = [
    { nome: 'Frios', cor: COR_FAIXA.frio, valores: dias.map((d) => d.frio) },
    { nome: 'Mornos', cor: COR_FAIXA.morno, valores: dias.map((d) => d.morno) },
    { nome: 'Quentes', cor: COR_FAIXA.quente, valores: dias.map((d) => d.quente) },
  ];
  const porDiaCartao = buildCartaoGrafico(
    'Leads por dia',
    'Separados pela pontuação',
    buildColunas(dias.map((d) => rotuloDia(d.dia)), series, 'Leads por dia, separados em frios, mornos e quentes', (v) => n(v)),
    { colunas: ['Dia', 'Quentes', 'Mornos', 'Frios', 'Total'], linhas: dias.map((d) => [rotuloDia(d.dia), n(d.quente), n(d.morno), n(d.frio), n(d.quente + d.morno + d.frio)]) },
    buildLegenda([...series].reverse()),
  );
  // Meia largura como os outros: o SVG escala com o cartão, e na largura toda as letras ficavam enormes.
  grade.appendChild(porDiaCartao);

  // Hora do dia e dia da semana: "a que horas chegam".
  const horas = porHora(atuais);
  const rotulosHora = horas.map((_, h) => `${h}h`);
  grade.appendChild(
    buildCartaoGrafico(
      'Por hora do dia',
      'Horário em que o formulário foi enviado',
      buildColunas(rotulosHora, [{ nome: 'Leads', cor: COR_FAIXA.morno, valores: horas }], 'Leads por hora do dia', (v) => n(v)),
      { colunas: ['Hora', 'Leads'], linhas: horas.map((v, h) => [`${h}h–${h + 1}h`, n(v)]) },
    ),
  );
  // Segunda primeiro: é como a semana de trabalho é lida.
  const semana = porDiaDaSemana(atuais);
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  grade.appendChild(
    buildCartaoGrafico(
      'Por dia da semana',
      'Dia em que o formulário foi enviado',
      buildColunas(ordem.map((d) => NOMES_DIA_SEMANA[d]!.slice(0, 3)), [{ nome: 'Leads', cor: COR_FAIXA.morno, valores: ordem.map((d) => semana[d]!) }], 'Leads por dia da semana', (v) => n(v)),
      { colunas: ['Dia', 'Leads'], linhas: ordem.map((d) => [NOMES_DIA_SEMANA[d]!, n(semana[d]!)]) },
    ),
  );

  // Origem e conversão por origem.
  const origens = porOrigem(atuais).slice(0, 10);
  const rotulo = (texto: string): HTMLElement => el('span', 'ld-ranking-rotulo', texto);
  grade.appendChild(
    buildCartaoGrafico(
      'Por origem ou campanha',
      'Parte do total do período (%) — fonte (meio) das UTMs, ou o formulário',
      buildRanking(
        origens.map((o) => ({
          rotulo: rotulo(o.origem),
          valor: (o.total / atuais.length) * 100,
          textoValor: `${n((o.total / atuais.length) * 100)}%`,
          detalhe: `${n(o.total)} ${o.total === 1 ? 'lead' : 'leads'} · ${n(o.quentes)} quentes`,
        })),
        'Leads por origem',
      ),
      { colunas: ['Origem', 'Leads', '% do total', 'Quentes'], linhas: origens.map((o) => [o.origem, n(o.total), `${n((o.total / atuais.length) * 100)}%`, n(o.quentes)]) },
    ),
  );
  grade.appendChild(
    buildCartaoGrafico(
      'Conversão por origem',
      'Quantos de cada origem estão numa etapa "ganha" (%)',
      buildRanking(
        origens.map((o) => ({ rotulo: rotulo(o.origem), valor: o.conversao ?? 0, textoValor: pctTexto(o.conversao), detalhe: `${n(o.convertidos)} de ${n(o.total)}` })),
        'Conversão por origem',
      ),
      { colunas: ['Origem', 'Leads', 'Clientes', 'Conversão'], linhas: origens.map((o) => [o.origem, n(o.total), n(o.convertidos), pctTexto(o.conversao)]) },
    ),
  );

  // Funil: onde estão hoje os leads do período.
  const etapas = porEtapa(atuais, ctx.file.etapas);
  const maior = Math.max(1, ...etapas.map((e) => e.total));
  grade.appendChild(
    buildCartaoGrafico(
      'Funil',
      'Em que etapa estão hoje os leads do período',
      buildRanking(
        etapas.map((e) => ({
          rotulo: buildSeloEtapa(e.etapa),
          valor: (e.total / maior) * 100,
          textoValor: n(e.total),
          detalhe: `${n(e.total)} ${e.total === 1 ? 'lead' : 'leads'}${atuais.length ? ` · ${n((e.total / atuais.length) * 100)}%` : ''}`,
          cor: e.etapa.cor,
        })),
        'Leads por etapa do funil',
      ),
      { colunas: ['Etapa', 'Leads'], linhas: etapas.map((e) => [e.etapa.nome, n(e.total)]) },
    ),
  );
  wrap.appendChild(grade);
  return wrap;
}
