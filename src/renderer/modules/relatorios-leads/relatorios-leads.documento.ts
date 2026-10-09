import type { ContatosFile } from '../../../shared/types/contatos.types.js';
import { origemDoLead, type PeriodoLeads, type SecoesRelatorioLeads } from '../../../shared/types/leads.types.js';
import {
  NOMES_DIA_SEMANA,
  formatarDuracao,
  frasesDosLeads,
  intervaloAnterior,
  intervaloDe,
  leadsDoArquivo,
  melhorJanela,
  noIntervalo,
  porDiaDaSemana,
  porHora,
  porOrigem,
  resumir,
  semResposta,
  type Intervalo,
} from '../../../shared/types/leads.estatisticas.js';
import { dataIsoCurta, dataIsoPorExtenso, hojeLocal } from '../../../shared/types/brasil.js';
import { buildAssinatura, paragrafos } from '../../ui/documento.js';
import { buildEmissor, type lerAjustes } from '../contatos/contatos.documento.js';
import { agoraLocal, el, rotuloDaFaixa } from '../contatos/contatos.ui.js';

/**
 * O documento de papel do relatório de leads: o mesmo DOM na prévia e no PDF
 * (ui/impressao.ts), da família .rd-documento, com barras simples em HTML (as
 * cores do tema escuro não servem no papel). Os números vêm das mesmas contas
 * do Painel (leads.estatisticas) e são recalculados a cada vez.
 */

export type DadosDeAjustes = Awaited<ReturnType<typeof lerAjustes>>;

/** O que um relatório guarda: só a configuração (relatorioLeads, sem os números). */
export interface ConfigRelatorioLeads {
  id: string;
  titulo: string;
  periodo: PeriodoLeads;
  secoes: SecoesRelatorioLeads;
  comentarios: string;
}

export function num(n: number, casas = 0): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function pct(v: number | undefined): string {
  return v === undefined ? '—' : `${num(v)}%`;
}

function secaoDoc(titulo: string): HTMLElement {
  const s = el('section', 'ct-doc-secao');
  s.appendChild(el('h2', 'ct-doc-titulo', titulo));
  return s;
}

/** Barra horizontal simples em HTML: as cores do tema escuro não servem no papel. */
function barra(rotulo: string, valor: number, maximo: number, texto: string, classe = ''): HTMLElement {
  const linha = el('div', `ct-doc-barra ${classe}`);
  linha.appendChild(el('span', 'ct-doc-barra-rotulo', rotulo));
  const trilho = el('span', 'ct-doc-barra-trilho');
  const preenchido = el('i');
  preenchido.style.width = `${maximo > 0 ? Math.max(valor > 0 ? 1.5 : 0, (valor / maximo) * 100) : 0}%`;
  trilho.appendChild(preenchido);
  linha.append(trilho, el('span', 'ct-doc-barra-valor', texto));
  return linha;
}

function numero(rotulo: string, valor: string, detalhe?: string): HTMLElement {
  const c = el('div', 'ct-doc-numero');
  c.append(el('span', 'ct-doc-numero-rotulo', rotulo), el('strong', undefined, valor));
  if (detalhe) c.appendChild(el('span', 'ct-doc-numero-detalhe', detalhe));
  return c;
}

export function rotuloDoIntervalo(i: Intervalo): string {
  return i.de === i.ate ? dataIsoCurta(i.de) : `${dataIsoCurta(i.de)} a ${dataIsoCurta(i.ate)}`;
}

export function buildDocumentoLeads(file: ContatosFile, cfg: ConfigRelatorioLeads, dados: DadosDeAjustes | null, hoje = hojeLocal(), agora = agoraLocal()): HTMLElement {
  const doc = el('article', 'rd-documento ct-doc ct-doc-leads');
  const emissor = dados ? buildEmissor(dados.perfil) : null;
  if (emissor) doc.appendChild(emissor);

  const intervalo = intervaloDe(cfg.periodo, hoje);
  const anterior = intervaloAnterior(cfg.periodo, intervalo);
  const todos = leadsDoArquivo(file).filter((l) => !l.pessoa.arquivado);
  const atuais = noIntervalo(todos, intervalo);
  const anteriores = noIntervalo(todos, anterior);
  const r = resumir(atuais, anteriores);

  const capa = el('header', 'ct-doc-capa');
  capa.append(el('span', 'ct-doc-sobre', 'Relatório de leads'), el('h1', undefined, cfg.titulo.trim() || 'Relatório de leads'));
  capa.appendChild(el('span', 'ct-doc-data', `Período: ${rotuloDoIntervalo(intervalo)} · emitido em ${dataIsoPorExtenso(hoje)}`));
  doc.appendChild(capa);

  if (!atuais.length) {
    doc.appendChild(el('p', 'ct-doc-vazio', 'Nenhum lead chegou neste período.'));
  }

  if (cfg.secoes.resumo && atuais.length) {
    const s = secaoDoc('Resumo');
    const numeros = el('div', 'ct-doc-numeros');
    numeros.append(
      numero('Leads', num(r.total), r.variacao === undefined ? (r.anterior ? undefined : 'nenhum no período anterior') : `${r.variacao > 0 ? '+' : ''}${num(r.variacao)}% contra ${num(r.anterior)} (${rotuloDoIntervalo(anterior)})`),
      numero('Quentes', pct(r.pctQuentes), `${num(r.quentes)} de ${num(r.total)}`),
      numero('Viraram clientes', pct(r.conversao), `${num(r.convertidos)} em etapa "ganha"`),
      numero('Até o 1º contato', r.tempoMedioMin === undefined ? '—' : formatarDuracao(r.tempoMedioMin), r.respondidos ? `média de ${num(r.respondidos)} respondidos` : 'nenhuma conversa registrada'),
    );
    s.appendChild(numeros);
    const faixas = el('div', 'ct-doc-faixas');
    faixas.appendChild(el('span', 'ct-doc-subtitulo', 'Pontuação'));
    (['quente', 'morno', 'frio'] as const).forEach((f) => {
      const v = f === 'quente' ? r.quentes : f === 'morno' ? r.mornos : r.frios;
      faixas.appendChild(barra(rotuloDaFaixa(f), v, r.total, `${num(v)} (${pct((v / r.total) * 100)})`, `is-${f}`));
    });
    s.appendChild(faixas);
    // Só as frases do período: "sem resposta agora" é do dia de hoje, não do relatório.
    const frases = frasesDosLeads([], atuais, anteriores, agora).filter((f) => f.tom !== 'atencao');
    if (frases.length) {
      s.appendChild(el('span', 'ct-doc-subtitulo', 'O que os números mostram'));
      const ul = el('ul', 'ct-doc-lista');
      frases.forEach((f) => ul.appendChild(el('li', undefined, f.texto)));
      s.appendChild(ul);
    }
    const parados = semResposta(todos, agora).length;
    if (parados && hoje <= intervalo.ate) s.appendChild(el('p', 'ct-doc-nota', `Hoje, ${num(parados)} ${parados === 1 ? 'lead está' : 'leads estão'} sem resposta há mais de 24 h.`));
    doc.appendChild(s);
  }

  if (cfg.secoes.origens && atuais.length) {
    const s = secaoDoc('Origens e campanhas');
    s.appendChild(el('p', 'ct-doc-nota', 'Origem = fonte (meio) das UTMs do link; sem UTM, o nome do formulário. "Clientes" = leads que hoje estão numa etapa ganha do funil.'));
    const origens = porOrigem(atuais);
    const maior = Math.max(...origens.map((o) => o.total));
    const tabela = el('div', 'ct-doc-origens');
    const cab = el('div', 'ct-doc-origem is-cabecalho');
    ['Origem', 'Leads', 'Quentes', 'Clientes', 'Conversão'].forEach((t) => cab.appendChild(el('span', undefined, t)));
    tabela.appendChild(cab);
    origens.forEach((o) => {
      const linha = el('div', 'ct-doc-origem');
      const nome = el('span', 'ct-doc-origem-nome');
      nome.appendChild(el('span', undefined, o.origem));
      const trilho = el('span', 'ct-doc-barra-trilho');
      const i = el('i');
      i.style.width = `${Math.max(1.5, (o.total / maior) * 100)}%`;
      trilho.appendChild(i);
      nome.appendChild(trilho);
      linha.append(nome, el('span', undefined, `${num(o.total)} (${pct((o.total / atuais.length) * 100)})`), el('span', undefined, num(o.quentes)), el('span', undefined, num(o.convertidos)), el('span', undefined, pct(o.conversao)));
      tabela.appendChild(linha);
    });
    s.appendChild(tabela);
    doc.appendChild(s);
  }

  if (cfg.secoes.horarios && atuais.length) {
    const s = secaoDoc('Quando chegam');
    const duas = el('div', 'ct-doc-duas');
    const semana = porDiaDaSemana(atuais);
    const maiorDia = Math.max(...semana);
    const blocoDias = el('div');
    blocoDias.appendChild(el('span', 'ct-doc-subtitulo', 'Por dia da semana'));
    [1, 2, 3, 4, 5, 6, 0].forEach((d) => blocoDias.appendChild(barra(NOMES_DIA_SEMANA[d]!, semana[d]!, maiorDia, num(semana[d]!))));
    const horas = porHora(atuais);
    const periodos: Array<[string, number, number]> = [
      ['Madrugada (0h–6h)', 0, 6],
      ['Manhã (6h–12h)', 6, 12],
      ['Tarde (12h–18h)', 12, 18],
      ['Noite (18h–24h)', 18, 24],
    ];
    const somas = periodos.map(([, de, ate]) => horas.slice(de, ate).reduce((a, b) => a + b, 0));
    const maiorPeriodo = Math.max(...somas);
    const blocoHoras = el('div');
    blocoHoras.appendChild(el('span', 'ct-doc-subtitulo', 'Por período do dia'));
    periodos.forEach(([rotulo], i) => blocoHoras.appendChild(barra(rotulo, somas[i]!, maiorPeriodo, num(somas[i]!))));
    const janela = melhorJanela(horas);
    blocoHoras.appendChild(el('p', 'ct-doc-nota', `Horário com mais chegadas: entre ${janela.de}h e ${janela.ate}h (${num(janela.total)} de ${num(atuais.length)}).`));
    duas.append(blocoDias, blocoHoras);
    s.appendChild(duas);
    doc.appendChild(s);
  }

  if (cfg.secoes.lista && atuais.length) {
    const s = secaoDoc(`Leads do período (${num(atuais.length)})`);
    const tabela = el('div', 'ct-doc-leads');
    const cab = el('div', 'ct-doc-lead is-cabecalho');
    ['Chegada', 'Nome', 'Origem', 'Pontuação', 'Etapa hoje'].forEach((t) => cab.appendChild(el('span', undefined, t)));
    tabela.appendChild(cab);
    [...atuais]
      .sort((a, b) => a.entrada.recebidoEm.localeCompare(b.entrada.recebidoEm))
      .forEach((l) => {
        const linha = el('div', 'ct-doc-lead');
        const empresa = l.pessoa.empresaId ? file.empresas.find((e) => e.id === l.pessoa.empresaId) : undefined;
        const quem = el('span');
        quem.appendChild(el('strong', undefined, l.pessoa.nome));
        if (empresa) quem.appendChild(el('span', 'ct-doc-lead-empresa', empresa.nomeFantasia || empresa.razaoSocial));
        linha.append(
          el('span', undefined, `${dataIsoCurta(l.entrada.recebidoEm.slice(0, 10))} ${l.entrada.recebidoEm.slice(11, 16)}`),
          quem,
          el('span', undefined, origemDoLead(l.entrada)),
          el('span', `ct-doc-faixa is-${l.entrada.faixa}`, `${rotuloDaFaixa(l.entrada.faixa)} · ${l.entrada.pontos}`),
          el('span', undefined, l.etapaNome),
        );
        tabela.appendChild(linha);
      });
    s.appendChild(tabela);
    doc.appendChild(s);
  }

  if (cfg.comentarios.trim()) {
    const s = secaoDoc('Comentários');
    s.appendChild(paragrafos(cfg.comentarios, 'ct-doc-texto'));
    doc.appendChild(s);
  }

  const assinatura = dados ? buildAssinatura(dados.assinatura) : null;
  if (assinatura) doc.appendChild(assinatura);
  return doc;
}
