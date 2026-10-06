import type { BlocoAnalise, BlocoMetricas, BlocoRelatorio, BlocoTabela, Relatorio, SecaoRelatorio } from '../../../shared/types/relatorios.types.js';
import { formatarData, hojeIso, somarDias } from '../postagens/postagens.ui.js';
import { novoBloco, novoIndicador } from './relatorios.blocos.js';
import { agendadasEntre, calcularMetricas, intervaloDoMes, mesExato } from './relatorios.metricas.js';

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

export type ModeloSecao =
  | 'resultados'
  | 'videos'
  | 'imagens'
  | 'redes'
  | 'comparativo'
  | 'ranking'
  | 'producao'
  | 'numerosRedes'
  | 'metas'
  | 'plano'
  | 'calendario'
  | 'postagens'
  | 'destaques'
  | 'depoimentos'
  | 'branco';

export type GrupoSecao = 'Números automáticos' | 'Números a mão' | 'Análise e texto';

/** Os tipos de seção prontos do botão "Adicionar seção", na ordem e nos grupos do menu. */
export const MODELOS_SECAO: ReadonlyArray<{ id: ModeloSecao; grupo: GrupoSecao; titulo: string; dica: string }> = [
  { id: 'resultados', grupo: 'Números automáticos', titulo: 'Resultados do período', dica: 'Métricas de todas as postagens (filtradas pela empresa e pelo período do relatório).' },
  { id: 'videos', grupo: 'Números automáticos', titulo: 'Resultados dos vídeos', dica: 'As mesmas métricas, só dos vídeos.' },
  { id: 'imagens', grupo: 'Números automáticos', titulo: 'Resultados das imagens', dica: 'As mesmas métricas, só das imagens (posts, carrosséis, stories).' },
  { id: 'redes', grupo: 'Números automáticos', titulo: 'Por rede social', dica: 'Score médio e quantidade em cada rede, com espaço para comentar.' },
  { id: 'comparativo', grupo: 'Números automáticos', titulo: 'Comparativo com o período anterior', dica: 'Este período × o anterior: quantidade, score, faixa positiva e redes, com a variação.' },
  { id: 'ranking', grupo: 'Números automáticos', titulo: 'Melhores e piores', dica: 'As postagens de maior e de menor score, com data, redes e faixa.' },
  { id: 'producao', grupo: 'Números automáticos', titulo: 'Produção do período', dica: 'Criadas, publicadas e atrasadas no período, e a pipeline por fase.' },
  { id: 'numerosRedes', grupo: 'Números a mão', titulo: 'Números das redes', dica: 'Conteúdos totais, alcance, impressões, seguidores, engajamento e cliques — você digita os valores.' },
  { id: 'metas', grupo: 'Números a mão', titulo: 'Metas × realizado', dica: 'Tabela: meta, previsto, realizado e situação.' },
  { id: 'plano', grupo: 'Números a mão', titulo: 'Plano de ação', dica: 'Tabela: ação, responsável, prazo e status.' },
  { id: 'calendario', grupo: 'Números a mão', titulo: 'Calendário do próximo período', dica: 'Já vem com as postagens agendadas para o próximo período; edite à vontade.' },
  { id: 'postagens', grupo: 'Análise e texto', titulo: 'Postagens analisadas', dica: 'Para adicionar vídeos e imagens e comentar cada um.' },
  { id: 'destaques', grupo: 'Análise e texto', titulo: 'Destaques', dica: 'Duas colunas: pontos fortes e o que melhorar.' },
  { id: 'depoimentos', grupo: 'Análise e texto', titulo: 'Depoimentos', dica: 'Frases de clientes ou de comentários, em destaque.' },
  { id: 'branco', grupo: 'Análise e texto', titulo: 'Seção em branco', dica: 'Só o título; você escolhe o conteúdo.' },
];

function secao(titulo: string, blocos: BlocoRelatorio[] = []): SecaoRelatorio {
  return { id: crypto.randomUUID(), titulo, texto: '', blocos, itens: [] };
}

/** Bloco de métricas com o filtro ajustado (e recalculado para os números baterem). */
function metricas(rel: Relatorio, ajuste: (b: BlocoMetricas) => void): BlocoMetricas {
  const b = novoBloco('metricas', rel) as BlocoMetricas;
  ajuste(b);
  b.resultado = calcularMetricas(b.filtro);
  return b;
}

function semTitulo<T extends BlocoRelatorio>(b: T): T {
  if ('titulo' in b) b.titulo = '';
  return b;
}

function tabelaVazia(rel: Relatorio, titulo: string, colunas: string[]): BlocoTabela {
  const b = novoBloco('tabela', rel) as BlocoTabela;
  b.titulo = titulo;
  b.colunas = colunas;
  b.linhas = Array.from({ length: 3 }, () => colunas.map(() => ''));
  return b;
}

/**
 * O próximo período: o mês seguinte, se o relatório é de um mês exato;
 * senão os próximos 30 dias a partir de hoje.
 */
function proximoPeriodo(rel: Relatorio): { inicio: string; fim: string } {
  const mes = mesExato({ inicio: rel.periodoInicio, fim: rel.periodoFim });
  if (mes) {
    const [a, m] = mes.split('-').map(Number) as [number, number];
    const seguinte = new Date(a, m, 1);
    const chave = `${seguinte.getFullYear()}-${String(seguinte.getMonth() + 1).padStart(2, '0')}`;
    if (`${chave}-31` >= hojeIso()) return intervaloDoMes(chave);
  }
  const hoje = hojeIso();
  return { inicio: hoje, fim: somarDias(hoje, 29) };
}

/** O calendário traz as agendadas de verdade (cópia, editável); sem nenhuma, linhas vazias. */
function calendario(rel: Relatorio): BlocoTabela {
  const periodo = proximoPeriodo(rel);
  const b = tabelaVazia(rel, `De ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`, ['Data', 'Hora', 'Postagem', 'Formato', 'Redes']);
  const agendadas = agendadasEntre(periodo.inicio, periodo.fim, rel.tagIds);
  if (agendadas.length) b.linhas = agendadas.map((p) => [formatarData(p.data), p.hora, p.titulo, p.formato, p.redes]);
  return b;
}

export function novaSecaoDoModelo(modelo: ModeloSecao, rel: Relatorio, numero: number): SecaoRelatorio {
  switch (modelo) {
    case 'resultados':
      return secao('Resultados do período', [novoBloco('metricas', rel)]);
    case 'videos':
      return secao('Resultados dos vídeos', [metricas(rel, (b) => ((b.filtro.tipos = ['video']), (b.titulo = 'Vídeos do período')))]);
    case 'imagens':
      return secao('Resultados das imagens', [metricas(rel, (b) => ((b.filtro.tipos = ['imagem']), (b.titulo = 'Imagens do período')))]);
    case 'redes':
      return secao('Por rede social', [
        metricas(rel, (b) => ((b.partes = ['redes']), (b.titulo = 'Score e quantidade por rede'))),
        novoBloco('texto', rel),
      ]);
    // O título da seção já diz o que é: o bloco entra sem subtítulo repetido.
    case 'comparativo':
      return secao('Comparativo com o período anterior', [semTitulo(novoBloco('comparativo', rel))]);
    case 'ranking':
      return secao('Melhores e piores', [semTitulo(novoBloco('ranking', rel))]);
    case 'producao':
      return secao('Produção do período', [semTitulo(novoBloco('producao', rel))]);
    case 'numerosRedes': {
      const b = novoBloco('analise', rel) as BlocoAnalise;
      // Só os nomes: os valores são do usuário (indicador sem valor não sai no PDF).
      b.indicadores = ['Conteúdos totais', 'Alcance', 'Impressões', 'Seguidores ganhos', 'Engajamento', 'Cliques no link'].map((r) => novoIndicador(r));
      return secao('Números das redes', [b]);
    }
    case 'metas':
      return secao('Metas × realizado', [tabelaVazia(rel, '', ['Meta', 'Previsto', 'Realizado', 'Situação'])]);
    case 'plano':
      return secao('Plano de ação', [tabelaVazia(rel, '', ['Ação', 'Responsável', 'Prazo', 'Status'])]);
    case 'calendario':
      return secao('Calendário do próximo período', [calendario(rel)]);
    case 'postagens':
      return secao('Postagens analisadas');
    case 'destaques':
      return secao('Destaques', [novoBloco('colunas', rel)]);
    case 'depoimentos':
      return secao('Depoimentos', [novoBloco('citacao', rel)]);
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
