import type { BlocoRelatorio, Relatorio, ResultadoMetricas } from '../../../shared/types/relatorios.types.js';
import { comAssistente } from '../../ui/ia.js';

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
    default:
      return '';
  }
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
        `Postagens analisadas (${s.itens.length}): ` +
          s.itens
            .slice(0, 15)
            .map((i) => {
              const titulo = (i as { snapshot?: { titulo?: string } }).snapshot?.titulo ?? 'postagem';
              const nota = [i.anotacoes, i.observacoes].filter((t) => t?.trim()).join(' / ');
              return nota ? `"${titulo}" — ${nota}` : `"${titulo}"`;
            })
            .join('; '),
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
export function comIaRelatorio(area: HTMLTextAreaElement, campo: string, rel: Relatorio, foco?: () => string): HTMLElement {
  return comAssistente(area, {
    area: 'Relatório de resultados de conteúdo para um cliente',
    campo,
    contexto: () => ({
      titulo: rel.titulo,
      referencia: [foco ? `Foco deste campo:\n${foco()}` : '', resumoDoRelatorio(rel)].filter(Boolean).join('\n\n'),
    }),
  });
}
