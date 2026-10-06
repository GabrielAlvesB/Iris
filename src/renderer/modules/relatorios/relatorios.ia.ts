import type { BlocoRelatorio, Relatorio, ResultadoMetricas, SecaoRelatorio } from '../../../shared/types/relatorios.types.js';
import { descreverEscala } from '../../../shared/types/score.types.js';
import { comAssistente } from '../../ui/ia.js';
import {
  escalaDoRelatorio,
  fatosDoGuia,
  frasesDaProducao,
  frasesDoComparativo,
  frasesDoRanking,
  orientacaoDoGuia,
} from './relatorios.guias.js';

/**
 * IA nos campos de texto do relatório. A IA recebe o relatório inteiro como
 * material de apoio — títulos, textos e os números dos blocos de métricas —
 * para escrever resumo, conclusão e próximos passos em cima do que o
 * documento realmente mostra, e não de algo inventado.
 */

function numero(n: number | undefined, casas = 1): string {
  return n === undefined ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

export function resumoDoResultado(r: ResultadoMetricas | null): string {
  if (!r) return '(ainda não calculado)';
  const linhas = [
    `Postagens: ${r.total} (${r.comScore} com score); score médio ${numero(r.media)}, mediana ${numero(r.mediana)}`,
    r.maior ? `Maior score: "${r.maior.titulo}" (${numero(r.maior.score)})` : '',
    r.menor ? `Menor score: "${r.menor.titulo}" (${numero(r.menor.score)})` : '',
    r.porTipo.length ? `Por tipo: ${r.porTipo.map((l) => `${l.rotulo} ${l.total}`).join(', ')}` : '',
    r.porMes.length > 1 ? `Por mês: ${r.porMes.map((l) => `${l.rotulo}: ${l.total} postagens, média ${numero(l.media)}`).join('; ')}` : '',
    r.redes.length ? `Redes: ${r.redes.map((l) => `${l.rotulo} ${l.total}`).join(', ')}` : '',
    r.tags.length ? `Tags: ${r.tags.slice(0, 10).map((l) => `${l.rotulo} ${l.total} (média ${numero(l.media)})`).join(', ')}` : '',
  ];
  return linhas.filter(Boolean).join('\n');
}

function resumoDoBloco(b: BlocoRelatorio): string {
  switch (b.tipo) {
    case 'texto':
    case 'destaque':
      return [b.titulo, b.texto].filter((t) => t.trim()).join(': ');
    case 'metricas':
      return [`Métricas "${b.titulo}"`, b.introducao, resumoDoResultado(b.resultado), b.comentario].filter((t) => t.trim()).join('\n');
    case 'analise':
      return [
        `Análise "${b.titulo}"`,
        b.indicadores.map((i) => `${i.rotulo}: ${i.valor}${i.variacao ? ` (${i.variacao})` : ''}${i.nota ? ` — ${i.nota}` : ''}`).join('; '),
        b.texto,
      ]
        .filter((t) => t.trim())
        .join('\n');
    case 'tabela':
      return [`Tabela "${b.titulo}"`, b.colunas.join(' | '), ...b.linhas.slice(0, 20).map((l) => l.join(' | '))].join('\n');
    case 'colunas':
      return [`${b.tituloEsquerda}: ${b.textoEsquerda}`, `${b.tituloDireita}: ${b.textoDireita}`].join('\n');
    case 'citacao':
      return `Citação: "${b.texto}" ${b.fonte}`;
    case 'comparativo':
      return [`Comparativo "${b.titulo}"`, ...frasesDoComparativo(b), b.comentario].filter((t) => t.trim()).join('\n').replace(/\*\*/g, '');
    case 'ranking':
      return [`Melhores e piores "${b.titulo}"`, ...frasesDoRanking(b), b.comentario].filter((t) => t.trim()).join('\n').replace(/\*\*/g, '');
    case 'producao':
      return [`Produção "${b.titulo}"`, ...frasesDaProducao(b), b.comentario].filter((t) => t.trim()).join('\n').replace(/\*\*/g, '');
    default:
      return '';
  }
}

/** Os blocos de uma seção em texto (para a introdução dela). */
export function resumoDaSecao(s: SecaoRelatorio): string {
  return [`Seção "${s.titulo}"`, ...s.blocos.map(resumoDoBloco).filter((t) => t.trim())].join('\n');
}

/** O relatório em texto corrido, na ordem do documento. */
export function resumoDoRelatorio(rel: Relatorio): string {
  const partes: string[] = [
    `Relatório: ${rel.titulo}`,
    rel.tagsNomes.length ? `Empresa/cliente: ${rel.tagsNomes.join(', ')}` : '',
    rel.periodoInicio || rel.periodoFim ? `Período: ${rel.periodoInicio ?? '?'} a ${rel.periodoFim ?? '?'}` : '',
    rel.contexto ? `Contexto: ${rel.contexto}` : '',
    rel.objetivos ? `Objetivos: ${rel.objetivos}` : '',
    rel.resumo ? `Resumo: ${rel.resumo}` : '',
  ];
  rel.secoes.forEach((s) => {
    partes.push(`\n## ${s.titulo}`);
    if (s.texto.trim()) partes.push(s.texto);
    s.blocos.forEach((b) => {
      const t = resumoDoBloco(b);
      if (t.trim()) partes.push(t);
    });
    if (s.itens.length) {
      partes.push(
        `Postagens analisadas (${s.itens.length}):\n` +
          s.itens
            .slice(0, 25)
            .map((i) => {
              const p = i.snapshot;
              const dados = [
                p.score !== undefined ? `score ${numero(p.score)}` : 'sem score',
                p.dataAgendada ? `data ${p.dataAgendada}` : '',
                p.redes.length ? `redes ${p.redes.join('/')}` : '',
                p.etapa ? `etapa ${p.etapa}` : '',
              ].filter(Boolean);
              const nota = [i.anotacoes, i.observacoes].filter((t) => t?.trim()).join(' / ');
              return `- "${p.titulo}" (${dados.join(', ')})${nota ? ` — análise: ${nota}` : ''}`;
            })
            .join('\n'),
      );
    }
  });
  if (rel.conclusao) partes.push(`\nConclusão: ${rel.conclusao}`);
  if (rel.recomendacoes) partes.push(`Próximos passos: ${rel.recomendacoes}`);
  return partes.filter((p) => p.trim()).join('\n');
}

/**
 * Campo do relatório com o botão de IA. `foco` é o material mais relevante
 * para aquele campo (ex.: os números do próprio bloco), que vai antes do
 * relatório inteiro.
 */
/** O que cada campo do relatório deve conter — a IA lê isto antes do material. */
export const ORIENTACOES_RELATORIO = {
  resumo:
    'Resumo executivo em 3 a 6 linhas: o que foi analisado (empresa, período, quantas postagens) e os 2 ou 3 principais achados, cada um com o número que o comprova.',
  objetivos: 'As metas do período em lista, mensuráveis sempre que o material permitir (ex.: score médio acima de 85, X publicações).',
  secao: 'De 1 a 3 frases apresentando o que esta seção mostra, citando os dados dela.',
  texto: 'Texto sobre o assunto deste bloco, apoiado nos dados da seção e do relatório.',
  destaque: 'De 1 a 2 frases com o recado mais importante para o cliente, com o número que o sustenta.',
  introMetricas: 'De 1 a 2 frases dizendo de onde vêm os números deste bloco e o período que cobrem.',
  leituraMetricas:
    'Interprete os números deste bloco: o que está bom e o que está ruim (pelas faixas da escala de score informada no material), comparações entre meses, tipos, redes e tags, as postagens de maior e menor score, e uma recomendação que saia desses números.',
  analise: 'Interprete os indicadores digitados: o que as variações mostram, o que provavelmente as explica e o que fazer a seguir.',
  conclusao:
    'Síntese do relatório inteiro em 1 ou 2 parágrafos: compare os resultados com os objetivos, cite os números principais (total de postagens, score médio, as melhores e as piores e por quê), diga claramente o que funcionou e o que não funcionou.',
  proximosPassos:
    'Lista de 3 a 6 ações concretas para o próximo período, cada uma ligada a um achado específico do relatório (ex.: "Repetir o formato X, que teve score 92").',
  observacoes: 'Ressalvas curtas sobre os dados (período, postagens sem score, o que não foi medido) e combinados com o cliente.',
  comparativo:
    'Compare os dois períodos: o que subiu e o que caiu (com os números de antes e depois), se a mudança é relevante, o que provavelmente a explica e o que fazer.',
  ranking:
    'Aponte o que as postagens de maior score têm em comum e o que se repete nas de menor score, citando títulos e scores, e tire uma regra prática para o próximo período.',
  producao:
    'Leia o ritmo de produção: publicadas no período, as que passaram da data, onde a pipeline acumula, e o que ajustar no processo.',
} as const;

export function comIaRelatorio(area: HTMLTextAreaElement, campo: string, rel: Relatorio, foco?: () => string, orientacao?: string): HTMLElement {
  return comAssistente(area, {
    area: 'Relatório de resultados de conteúdo para um cliente',
    campo,
    orientacao,
    // Lido na hora de gerar: o guia do campo (perguntas, exemplo e fatos — o
    // mesmo "Como escrever" que a pessoa vê) entra junto, para a IA escrever
    // no formato que o campo pede e com os números já conferidos.
    contexto: () => ({
      titulo: rel.titulo,
      orientacao: [orientacao, orientacaoDoGuia(area)].filter(Boolean).join('\n'),
      referencia: [
        // A régua é a escala das empresas do relatório — fixar 85 aqui faria a
        // IA contradizer uma empresa com escala própria.
        `Regra do score (0 a 100), escala ${escalaDoRelatorio(rel).nome}: ${descreverEscala(escalaDoRelatorio(rel))}.`,
        // Antes do relatório completo: a referência é cortada no fim se passar do limite.
        fatosDoGuia(area),
        foco ? `Dados mais importantes para este campo:\n${foco()}` : '',
        `Relatório completo:\n${resumoDoRelatorio(rel)}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    }),
  });
}
