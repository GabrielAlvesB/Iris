import type { BlocoRelatorio, Relatorio, SecaoRelatorio } from '../../../shared/types/relatorios.types.js';
import { novoBloco } from './relatorios.blocos.js';

/**
 * Pontos de partida: quem abre Relatórios pela primeira vez não precisa
 * adivinhar a estrutura. Um modelo só cria seções e blocos vazios — tudo
 * continua editável, e nada é preenchido com texto inventado.
 */

export type ModeloRelatorio = 'branco' | 'mensal' | 'postagens';

export const MODELOS: ReadonlyArray<{ id: ModeloRelatorio; titulo: string; descricao: string; cria: string }> = [
  {
    id: 'mensal',
    titulo: 'Resultados do mês',
    descricao: 'Para prestar contas a um cliente: números do período, o que funcionou e o que ajustar.',
    cria: 'Seções: Resultados do período (com métricas automáticas), Destaques (pontos fortes / a melhorar) e Postagens analisadas.',
  },
  {
    id: 'postagens',
    titulo: 'Análise de postagens',
    descricao: 'Para revisar vídeos e imagens um a um, com marcações e comentários.',
    cria: 'Seções: Postagens analisadas e Aprendizados. Liga o resumo das marcações.',
  },
  {
    id: 'branco',
    titulo: 'Em branco',
    descricao: 'Você monta as seções do seu jeito.',
    cria: 'Só a capa e as informações gerais.',
  },
];

export type ModeloSecao = 'resultados' | 'postagens' | 'destaques' | 'branco';

/** Os tipos de seção prontos do botão "Adicionar seção". */
export const MODELOS_SECAO: ReadonlyArray<{ id: ModeloSecao; titulo: string; dica: string }> = [
  { id: 'resultados', titulo: 'Resultados do período', dica: 'Já vem com um bloco de métricas das postagens (filtrado pela empresa e pelo período do relatório).' },
  { id: 'postagens', titulo: 'Postagens analisadas', dica: 'Para adicionar vídeos e imagens e comentar cada um.' },
  { id: 'destaques', titulo: 'Destaques', dica: 'Duas colunas: pontos fortes e o que melhorar.' },
  { id: 'branco', titulo: 'Seção em branco', dica: 'Só o título; você escolhe o conteúdo.' },
];

function secao(titulo: string, blocos: BlocoRelatorio[] = []): SecaoRelatorio {
  return { id: crypto.randomUUID(), titulo, texto: '', blocos, itens: [] };
}

export function novaSecaoDoModelo(modelo: ModeloSecao, rel: Relatorio, numero: number): SecaoRelatorio {
  switch (modelo) {
    case 'resultados':
      return secao('Resultados do período', [novoBloco('metricas', rel)]);
    case 'postagens':
      return secao('Postagens analisadas');
    case 'destaques':
      return secao('Destaques', [novoBloco('colunas', rel)]);
    case 'branco':
      return secao(`Seção ${numero}`);
  }
}

/** Aplica o modelo num relatório recém-criado (sem seções). */
export function aplicarModelo(rel: Relatorio, modelo: ModeloRelatorio): void {
  if (modelo === 'mensal') {
    rel.secoes.push(
      novaSecaoDoModelo('resultados', rel, 1),
      novaSecaoDoModelo('destaques', rel, 2),
      novaSecaoDoModelo('postagens', rel, 3),
    );
  } else if (modelo === 'postagens') {
    const aprendizados = secao('Aprendizados', [novoBloco('colunas', rel)]);
    rel.secoes.push(novaSecaoDoModelo('postagens', rel, 1), aprendizados);
    rel.mostrarIndicadores = true;
  }
}
