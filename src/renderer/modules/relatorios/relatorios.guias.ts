import type {
  BlocoAnalise,
  BlocoComparativo,
  BlocoMetricas,
  BlocoProducao,
  BlocoRanking,
  ItemRelatorio,
  LinhaMetrica,
  Relatorio,
  ResultadoMetricas,
} from '../../../shared/types/relatorios.types.js';
import {
  ESCALA_LEGADA,
  SENTIDOS_FAIXA,
  escalaDasEmpresas,
  escalaPadrao,
  faixaDaEscala,
  metaDaEscala,
  type EscalaScore,
  type SentidoFaixa,
} from '../../../shared/types/score.types.js';
import { svg } from '../../ui/pagina.js';
import { formatarData } from '../postagens/postagens.ui.js';
import {
  catalogoAtual,
  contarPorSentido,
  descreverPeriodoFiltro,
  formatarValorComparativo,
  linhasDoComparativo,
  rankingDoResultado,
  redesDoComparativo,
  variacaoComparativo,
} from './relatorios.metricas.js';

/**
 * O que escrever em cada campo do relatório: um exemplo (placeholder), as
 * perguntas que ajudam a chegar no texto e, onde há números, as frases com
 * os fatos calculados ("Começar com os números").
 *
 * As frases são só fatos tirados do resultado gravado (total, médias, faixas,
 * maior e menor) — nunca interpretação. Explicar o porquê fica com quem
 * escreve, como a regra dos modelos: nada de texto inventado.
 */

export type CampoGuia =
  | 'resumo'
  | 'objetivos'
  | 'conclusao'
  | 'proximosPassos'
  | 'observacoes'
  | 'secao'
  | 'introMetricas'
  | 'leituraMetricas'
  | 'comparativo'
  | 'ranking'
  | 'producao'
  | 'texto'
  | 'destaque'
  | 'analise'
  | 'colunas'
  | 'citacao'
  | 'anotacoes'
  | 'observacoesPostagem';

export const PERGUNTAS: Record<CampoGuia, string[]> = {
  resumo: [
    'O que foi analisado? (empresa, período, quantas postagens)',
    'Quais são os 2 ou 3 achados mais importantes — e qual número comprova cada um?',
    'O resultado geral foi bom ou ruim em relação à meta?',
    'Se o cliente ler só este parágrafo, o que ele precisa saber?',
  ],
  objetivos: [
    'O que se queria alcançar neste período? (ex.: score médio, quantidade de publicações, alcance)',
    'Dá para medir? Prefira "score médio acima de 85" a "melhorar a qualidade".',
    'Algum teste novo estava sendo feito (formato, horário, rede)?',
  ],
  conclusao: [
    'Os objetivos foram atingidos? Cite o número de cada um.',
    'O que funcionou — e por que você acha que funcionou?',
    'O que não funcionou — e o que provavelmente explica isso?',
    'Qual é a mensagem final para o cliente, em uma frase?',
  ],
  proximosPassos: [
    'O que repetir? (o formato, tema ou horário das postagens de maior score)',
    'O que ajustar? (o que ficou na faixa negativa ou mediana)',
    'Que teste fazer no próximo período e como saber se deu certo?',
    'Uma ação por linha, começando com um verbo: "Repetir…", "Testar…", "Reduzir…".',
  ],
  observacoes: [
    'De onde vieram os dados e em que data foram coletados?',
    'Alguma postagem ficou sem score ou fora da análise? Por quê?',
    'Há algo combinado com o cliente que vale registrar?',
  ],
  secao: [
    'O que esta seção mostra? (um recorte, uma rede, um tipo de conteúdo)',
    'Por que ela está no relatório — que pergunta ela responde?',
  ],
  introMetricas: ['De onde vêm estes números e que período cobrem?', 'O que se esperava antes de olhar para eles (a meta)?'],
  leituraMetricas: [
    'A média ficou acima ou abaixo da meta? Por quanto?',
    'Quantas postagens ficaram em cada faixa (positiva, mediana, negativa)?',
    'Qual rede, tag ou mês puxou a média para cima — e qual puxou para baixo?',
    'O que a postagem de maior score tem que a de menor não tem?',
    'O que isso indica para o próximo período?',
  ],
  comparativo: [
    'O período melhorou ou piorou em relação ao anterior? Em quais números?',
    'A variação é grande o bastante para importar, ou é oscilação normal?',
    'O que mudou entre os dois períodos (tema, formato, frequência, horário, rede)?',
    'Qual rede teve a maior mudança — para cima ou para baixo?',
    'O que manter e o que corrigir a partir dessa comparação?',
  ],
  ranking: [
    'O que as postagens de maior score têm em comum? (tema, formato, gancho, duração, rede)',
    'E as de menor score — o que se repete nelas?',
    'Alguma surpresa: algo que você esperava ir bem e foi mal, ou o contrário?',
    'Que regra prática sai daqui para o próximo período?',
  ],
  producao: [
    'O ritmo de publicação foi o combinado? (ex.: 5 por semana)',
    'Quantas passaram da data sem publicar — e por quê?',
    'Em que fase da pipeline as postagens estão acumulando?',
    'O que muda no processo para o próximo período?',
  ],
  texto: ['Qual é a ideia principal deste bloco, em uma frase?', 'Que dado ou exemplo sustenta essa ideia?'],
  destaque: [
    'Qual é o recado mais importante desta seção?',
    'Cabe em 1 ou 2 frases, com o número que o comprova?',
    'É uma conquista (tom positivo), um alerta (atenção) ou uma informação?',
  ],
  analise: [
    'De onde veio cada número (Instagram Insights, YouTube Studio, planilha…) e de que data?',
    'Os números subiram ou caíram? Compare com o período anterior ou com a meta.',
    'O que provavelmente explica a variação? (conteúdo, horário, investimento, sazonalidade)',
    'O que fazer com isso no próximo período?',
  ],
  colunas: [
    'Um par que se compara: pontos fortes × o que melhorar, antes × depois, rede A × rede B.',
    'Itens curtos, um por linha (comece com "- "), com o mesmo nível de detalhe dos dois lados.',
  ],
  citacao: ['Uma frase real: de um comentário, do cliente, de uma mensagem recebida.', 'Diga quem disse ou de onde veio (opcional).'],
  anotacoes: [
    'O que esta postagem fez bem ou mal? (gancho, ritmo, imagem, legenda, chamada)',
    'O score dela combina com o que você viu? Por quê?',
    'Marque os momentos ou áreas na tabela acima e resuma aqui.',
  ],
  observacoesPostagem: ['O que mudar numa próxima postagem parecida?', 'Ficou alguma pendência (corrigir, repostar, responder comentários)?'],
};

// ---------- Números ----------

function num(n: number | undefined, casas = 1): string {
  return n === undefined ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

function encurtar(texto: string, max = 60): string {
  return texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;
}

/** Escala que vale para o relatório: a das empresas dele, senão a padrão. */
export function escalaDoRelatorio(rel: Pick<Relatorio, 'tagIds'>): EscalaScore {
  const catalogo = catalogoAtual();
  if (!catalogo) return ESCALA_LEGADA;
  return escalaDasEmpresas(catalogo, rel.tagIds) ?? escalaPadrao(catalogo);
}

const porSentido = contarPorSentido;

function melhorEPior(linhas: LinhaMetrica[]): { melhor?: LinhaMetrica; pior?: LinhaMetrica } {
  const com = linhas.filter((l) => l.media !== undefined).sort((a, b) => b.media! - a.media!);
  return { melhor: com[0], pior: com.length > 1 ? com[com.length - 1] : undefined };
}

function nomeMes(chave: string): string {
  const [a, m] = chave.split('-').map(Number) as [number, number];
  return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

const SENTIDO_PLURAL: Record<SentidoFaixa, string> = { positivo: 'na faixa positiva', mediano: 'na faixa mediana', negativo: 'na faixa negativa' };

/**
 * Os fatos de um resultado de métricas, uma frase por item. Só o que foi
 * calculado — a interpretação fica para quem escreve.
 */
export function frasesDoResultado(r: ResultadoMetricas | null): string[] {
  if (!r || !r.total) return [];
  const escala = r.escala ?? ESCALA_LEGADA;
  const frases: string[] = [];
  const tipos = r.porTipo.filter((t) => t.total > 0);
  const periodo =
    r.primeiraData && r.ultimaData
      ? r.primeiraData === r.ultimaData
        ? `Em ${formatarData(r.primeiraData)}`
        : `De ${formatarData(r.primeiraData)} a ${formatarData(r.ultimaData)}`
      : 'No período';
  frases.push(
    `${periodo}: ${r.total} postage${r.total === 1 ? 'm' : 'ns'}${tipos.length > 1 ? ` (${tipos.map((t) => `${t.total} ${t.rotulo === 'video' ? 'vídeos' : 'imagens'}`).join(', ')})` : ''}.`,
  );
  if (r.media !== undefined) {
    const faixa = faixaDaEscala(escala, r.media);
    const meta = metaDaEscala(escala);
    frases.push(
      `Score médio de **${num(r.media)}** (${faixa.rotulo}, escala ${escala.nome})${meta !== undefined ? ` — meta ${num(meta)}` : ''}; mediana ${num(r.mediana)}.`,
    );
    const conta = porSentido(r);
    const partes = SENTIDOS_FAIXA.filter((s) => conta[s.id] > 0 || s.id !== 'mediano').map((s) => `${conta[s.id]} ${SENTIDO_PLURAL[s.id]}`);
    frases.push(`Das ${r.comScore} postagens com score: ${partes.join(', ')}.`);
  }
  if (r.comScore < r.total) frases.push(`${r.total - r.comScore} postage${r.total - r.comScore === 1 ? 'm ficou' : 'ns ficaram'} sem score.`);
  if (r.maior) frases.push(`Maior score: "${encurtar(r.maior.titulo)}" (${num(r.maior.score)}).`);
  if (r.menor) frases.push(`Menor score: "${encurtar(r.menor.titulo)}" (${num(r.menor.score)}).`);
  const redes = melhorEPior(r.redes);
  if (redes.melhor && redes.pior && redes.melhor.rotulo !== redes.pior.rotulo) {
    frases.push(`Por rede: maior média no ${redes.melhor.rotulo} (${num(redes.melhor.media)}), menor no ${redes.pior.rotulo} (${num(redes.pior.media)}).`);
  } else if (redes.melhor) {
    frases.push(`Rede: ${redes.melhor.rotulo}, média ${num(redes.melhor.media)} em ${redes.melhor.total} postagens.`);
  }
  const tags = melhorEPior(r.tags);
  if (tags.melhor && tags.pior && tags.melhor.rotulo !== tags.pior.rotulo) {
    frases.push(`Por tag: maior média em ${tags.melhor.rotulo} (${num(tags.melhor.media)}), menor em ${tags.pior.rotulo} (${num(tags.pior.media)}).`);
  }
  const meses = melhorEPior(r.porMes);
  if (r.porMes.length > 1 && meses.melhor && meses.pior) {
    frases.push(`Melhor mês: ${nomeMes(meses.melhor.rotulo)} (${num(meses.melhor.media)}); pior: ${nomeMes(meses.pior.rotulo)} (${num(meses.pior.media)}).`);
  }
  return frases;
}

function periodoTexto(p: { inicio?: string; fim?: string } | undefined): string {
  return p?.inicio && p.fim ? `${formatarData(p.inicio)} a ${formatarData(p.fim)}` : '';
}

/** As variações do comparativo, só as que existem nos dois períodos. */
export function frasesDoComparativo(b: BlocoComparativo): string[] {
  if (!b.atual || !b.anterior) return [];
  const frases = [`Período: ${periodoTexto(b.filtro)} comparado com ${periodoTexto(b.periodoAnterior)}.`];
  linhasDoComparativo(b.atual, b.anterior).forEach((l) => {
    if (l.atual === undefined || l.anterior === undefined) return;
    const v = variacaoComparativo(l);
    frases.push(
      `${l.rotulo}: ${formatarValorComparativo(l, l.anterior)} → **${formatarValorComparativo(l, l.atual)}** (${v.texto.replace(/^[↑↓=]\s*/, '')}).`,
    );
  });
  const redes = redesDoComparativo(b.atual, b.anterior).filter((l) => l.atual !== undefined && l.anterior !== undefined);
  if (redes.length) {
    const ordenadas = [...redes].sort((x, y) => x.atual! - x.anterior! - (y.atual! - y.anterior!));
    const pior = ordenadas[0]!;
    const melhor = ordenadas[ordenadas.length - 1]!;
    frases.push(`Rede que mais subiu: ${melhor.rotulo} (${formatarValorComparativo(melhor, melhor.anterior)} → ${formatarValorComparativo(melhor, melhor.atual)}).`);
    if (pior !== melhor) frases.push(`Rede que mais caiu: ${pior.rotulo} (${formatarValorComparativo(pior, pior.anterior)} → ${formatarValorComparativo(pior, pior.atual)}).`);
  }
  return frases;
}

/** As listas do ranking, as 3 primeiras de cada lado. */
export function frasesDoRanking(b: BlocoRanking): string[] {
  if (!b.resultado) return [];
  const escala = b.resultado.escala ?? ESCALA_LEGADA;
  const { maiores, menores } = rankingDoResultado(b.resultado, b.quantidade);
  const item = (p: (typeof maiores)[number]): string =>
    `"${encurtar(p.titulo, 50)}" — ${num(p.score)} (${faixaDaEscala(escala, p.score!).rotulo}, ${formatarData(p.data)}${p.redes.length ? `, ${p.redes.join('/')}` : ''})`;
  const frases: string[] = [];
  if (maiores.length) frases.push(`Maiores scores: ${maiores.slice(0, 3).map(item).join('; ')}.`);
  if (menores.length) frases.push(`Menores scores: ${menores.slice(0, 3).map(item).join('; ')}.`);
  return frases;
}

export function frasesDaProducao(b: BlocoProducao): string[] {
  const r = b.resultado;
  if (!r) return [];
  const periodo = periodoTexto(b.filtro) || 'No período';
  return [
    `${periodo}: ${r.criadas} postage${r.criadas === 1 ? 'm criada' : 'ns criadas'}, **${r.publicadas} publicada${r.publicadas === 1 ? '' : 's'}**.`,
    r.atrasadas ? `${r.atrasadas} passaram da data sem publicar.` : 'Nenhuma passou da data sem publicar.',
    `Pipeline no cálculo: ${r.porFase.map((f) => `${f.rotulo} ${f.total}`).join(', ')}.`,
  ];
}

/** Os números digitados num bloco "texto + métrica", em frases. */
export function frasesDaAnalise(bloco: BlocoAnalise): string[] {
  return bloco.indicadores
    .filter((i) => i.rotulo.trim() && i.valor.trim())
    .map((i) => `${i.rotulo.trim()}: **${i.valor.trim()}**${i.variacao.trim() ? ` (${i.variacao.trim()})` : ''}${i.nota.trim() ? ` — ${i.nota.trim()}` : ''}.`);
}

/** Os dados guardados de uma postagem analisada. */
export function frasesDaPostagem(item: ItemRelatorio, escala: EscalaScore): string[] {
  const s = item.snapshot;
  const frases: string[] = [];
  if (s.score !== undefined) frases.push(`Score ${num(s.score)} — ${faixaDaEscala(escala, s.score).rotulo} (escala ${escala.nome}).`);
  if (s.dataAgendada) frases.push(`Publicada em ${formatarData(s.dataAgendada)}${s.horaAgendada ? ` às ${s.horaAgendada}` : ''}${s.redes.length ? ` no ${s.redes.join(', ')}` : ''}.`);
  const marcacoes = item.marcacoes.length;
  if (marcacoes) frases.push(`${marcacoes} ${marcacoes === 1 ? 'ponto marcado' : 'pontos marcados'} na análise.`);
  return frases;
}

/** O primeiro bloco de métricas calculado do relatório — o que resumo e conclusão citam. */
export function primeiroResultado(rel: Relatorio): ResultadoMetricas | null {
  for (const secao of rel.secoes) {
    for (const b of secao.blocos) if (b.tipo === 'metricas' && b.resultado?.total) return b.resultado;
  }
  return null;
}

// ---------- Exemplos (placeholders) ----------

export function exemploIntroMetricas(bloco: BlocoMetricas): string {
  const r = bloco.resultado;
  const periodo = descreverPeriodoFiltro(bloco.filtro).toLowerCase();
  const meta = metaDaEscala(r?.escala ?? ESCALA_LEGADA);
  return `Ex.: Estes números cobrem ${periodo}${r ? `, com ${r.total} postagens ${bloco.filtro.base === 'publicados' ? 'publicadas' : 'com data'}` : ''}. A meta era manter o score médio acima de ${num(meta ?? 85)}.`;
}

export function exemploLeituraMetricas(r: ResultadoMetricas | null): string {
  if (!r || r.media === undefined) return 'Ex.: A média ficou em 87 (Positivo), com 17 de 22 postagens na faixa positiva. O destaque foi… Isso mostra que…';
  const escala = r.escala ?? ESCALA_LEGADA;
  const conta = porSentido(r);
  const redes = melhorEPior(r.redes);
  return [
    `Ex.: A média ficou em ${num(r.media)} (${faixaDaEscala(escala, r.media).rotulo}), com ${conta.positivo} de ${r.comScore} postagens na faixa positiva.`,
    r.maior ? `O destaque foi "${encurtar(r.maior.titulo, 40)}" (${num(r.maior.score)})` : '',
    redes.melhor ? `e o ${redes.melhor.rotulo} teve a maior média (${num(redes.melhor.media)}).` : '',
    'Isso indica que… (o porquê, com as suas palavras). Para o próximo mês…',
  ]
    .filter(Boolean)
    .join(' ');
}

export function exemploResumo(rel: Relatorio): string {
  const r = primeiroResultado(rel);
  if (!r || r.media === undefined) {
    return 'Ex.: Analisamos 12 vídeos publicados em setembro. O score médio foi 87 (Positivo); os tutoriais curtos foram o destaque e os vídeos longos ficaram abaixo da meta…';
  }
  const escala = r.escala ?? ESCALA_LEGADA;
  return `Ex.: Analisamos ${r.total} postagens${r.primeiraData && r.ultimaData ? ` de ${formatarData(r.primeiraData)} a ${formatarData(r.ultimaData)}` : ''}. O score médio foi ${num(r.media)} (${faixaDaEscala(escala, r.media).rotulo}), com ${porSentido(r).positivo} na faixa positiva.${r.maior ? ` O melhor resultado foi "${encurtar(r.maior.titulo, 40)}" (${num(r.maior.score)}).` : ''} O principal aprendizado foi…`;
}

export function exemploObjetivos(rel: Relatorio): string {
  const meta = metaDaEscala(escalaDoRelatorio(rel));
  return `- Manter o score médio acima de ${num(meta ?? 85)}\n- Publicar 5 vídeos por semana\n- Testar vídeos de até 30 segundos no TikTok`;
}

export function exemploConclusao(rel: Relatorio): string {
  const r = primeiroResultado(rel);
  if (!r || r.media === undefined) return 'Ex.: O período fechou acima da meta. Funcionou: … Não funcionou: … A principal lição é…';
  const escala = r.escala ?? ESCALA_LEGADA;
  const meta = metaDaEscala(escala);
  const relacao = meta === undefined ? '' : r.media >= meta ? `, acima da meta de ${num(meta)}` : `, abaixo da meta de ${num(meta)}`;
  return `Ex.: O período fechou com score médio de ${num(r.media)}${relacao}. Funcionou: … (o que as postagens de maior score têm em comum). Não funcionou: … A principal lição é…`;
}

export function exemploProximosPassos(rel: Relatorio): string {
  const r = primeiroResultado(rel);
  return [
    r?.maior ? `- Repetir o formato de "${encurtar(r.maior.titulo, 40)}" (score ${num(r.maior.score)})` : '- Repetir o formato que teve o maior score',
    r?.menor ? `- Rever o que levou "${encurtar(r.menor.titulo, 40)}" a ${num(r.menor.score)}` : '- Rever o que ficou na faixa negativa',
    '- Testar … e medir no próximo relatório',
  ].join('\n');
}

export function exemploComparativo(b: BlocoComparativo): string {
  const media = linhasDoComparativo(b.atual, b.anterior).find((l) => l.rotulo === 'Score médio')!;
  if (media.atual === undefined || media.anterior === undefined) {
    return 'Ex.: O score médio subiu de 84 para 87 em relação ao mês anterior, e a faixa positiva passou de 60% para 75%. A mudança veio de…';
  }
  return `Ex.: O score médio ${media.atual >= media.anterior ? 'subiu' : 'caiu'} de ${formatarValorComparativo(media, media.anterior)} para ${formatarValorComparativo(media, media.atual)} em relação ao período anterior. A mudança veio de… Para o próximo período…`;
}

export function exemploRanking(b: BlocoRanking): string {
  const { maiores, menores } = rankingDoResultado(b.resultado, b.quantidade);
  if (!maiores.length) return 'Ex.: As melhores têm gancho nos 2 primeiros segundos e são tutoriais curtos; as piores são as mais longas…';
  return `Ex.: As melhores (como "${encurtar(maiores[0]!.titulo, 35)}", ${num(maiores[0]!.score)}) têm em comum…${menores[0] ? ` Já as de menor score, como "${encurtar(menores[0].titulo, 35)}" (${num(menores[0].score)}), …` : ''}`;
}

export function exemploProducao(b: BlocoProducao): string {
  const r = b.resultado;
  if (!r) return 'Ex.: Publicamos 18 dos 20 combinados; 2 ficaram atrasados na edição…';
  return `Ex.: Publicamos ${r.publicadas} no período${r.atrasadas ? ` e ${r.atrasadas} passaram da data` : ''}. O gargalo está em… Para o próximo período…`;
}

export const EXEMPLOS_FIXOS = {
  observacoes: 'Ex.: Dados exportados do Instagram em 01/10; 2 vídeos ainda sem score; o TikTok não informa salvamentos.',
  secao: 'Ex.: Nesta seção, os vídeos curtos de setembro: quanto saiu, como foi o score e o que se destacou.',
  texto: 'Ex.: Em setembro, os vídeos com gancho nos 3 primeiros segundos tiveram score bem maior que os demais…',
  destaque: 'Ex.: 17 de 22 vídeos ficaram na faixa positiva — o melhor mês do ano até aqui.',
  analise: 'Ex.: O alcance subiu 12%, puxado pelos Reels de bastidores. Os cliques caíram porque… No próximo mês…',
  colunas: '- Item curto\n- Outro item',
  citacao: '"Esse vídeo explicou em 1 minuto o que eu não entendia há meses." — comentário no YouTube',
  anotacoes: 'Ex.: Gancho forte nos 2 primeiros segundos; a legenda ficou longa e o CTA aparece tarde.',
  observacoesPostagem: 'Ex.: Repostar como Reel com corte de 30 s; responder os comentários fixados.',
} as const;

// ---------- Peça de tela ----------

const ICONE_LAMPADA = '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>';
const ICONE_NUMEROS = '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>';

/**
 * O guia de cada campo, para a IA ler na hora de gerar: o mesmo exemplo,
 * as mesmas perguntas e os mesmos fatos que a pessoa vê. WeakMap pelo
 * textarea porque o botão de IA e o guia são montados separados em volta do
 * mesmo campo, em editores diferentes.
 */
const guiasDosCampos = new WeakMap<HTMLTextAreaElement, { campo: CampoGuia; frases?: () => string[] }>();

/** Orientação extra para o <campo> do pedido: as perguntas e o exemplo como modelo de forma. */
export function orientacaoDoGuia(area: HTMLTextAreaElement): string {
  const guia = guiasDosCampos.get(area);
  if (!guia) return '';
  const exemplo = area.placeholder.replace(/^Ex\.:\s*/, '').trim();
  return [
    `O texto deve responder, com os dados do material: ${PERGUNTAS[guia.campo].map((p) => `(${p})`).join(' ')}`,
    exemplo
      ? `Modelo de forma e tamanho (só um exemplo: não copie as frases, não use os números dele se não estiverem no material, e nunca deixe reticências ou lacunas como "…" ou "(o porquê)" — escreva a análise de fato): «${exemplo}»`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Os fatos já calculados para o campo — a IA usa estes números em vez de recontar. */
export function fatosDoGuia(area: HTMLTextAreaElement): string {
  const frases = guiasDosCampos.get(area)?.frases?.() ?? [];
  return frases.length ? `Fatos já calculados para este campo (use estes números, exatamente):\n${frases.map((f) => `- ${f.replace(/\*\*/g, '')}`).join('\n')}` : '';
}

export interface OpcoesGuia {
  /** Fatos que o botão "Começar com os números" escreve no campo. */
  frases?: () => string[];
  /** Lista ("- " por linha) ou parágrafo corrido. */
  formato?: 'lista' | 'texto';
}

/**
 * "Como escrever": perguntas-guia recolhidas sob o campo e, quando há
 * números, o botão que escreve os fatos no campo para a pessoa completar com
 * a própria leitura. Escreve disparando `input` — o mesmo caminho da
 * digitação, que salva e atualiza o mapa.
 */
export function buildGuia(area: HTMLTextAreaElement, campo: CampoGuia, opcoes: OpcoesGuia = {}): HTMLElement {
  guiasDosCampos.set(area, { campo, frases: opcoes.frases });
  const guia = document.createElement('details');
  guia.className = 'rel-guia';
  const resumo = document.createElement('summary');
  resumo.innerHTML = svg(ICONE_LAMPADA, 13, 2);
  resumo.append(Object.assign(document.createElement('span'), { textContent: 'Como escrever' }));
  const aviso = Object.assign(document.createElement('p'), {
    className: 'rel-guia-aviso',
    textContent: 'Ainda não há números para escrever: calcule as métricas ou preencha os indicadores acima.',
    hidden: true,
  });

  const temNumeros = Boolean(opcoes.frases);
  if (opcoes.frases) {
    const lerFrases = opcoes.frases;
    const inserir = document.createElement('button');
    inserir.type = 'button';
    inserir.className = 'rel-guia-numeros';
    inserir.innerHTML = svg(ICONE_NUMEROS, 13, 2);
    inserir.append('Começar com os números');
    // Lido na hora: números digitados depois de abrir o editor também entram.
    inserir.addEventListener('mouseenter', () => {
      const frases = lerFrases();
      inserir.title = frases.length
        ? `Escreve no campo:\n${frases.map((f) => `• ${f.replace(/\*\*/g, '')}`).join('\n')}\n\nDepois é só completar com a sua leitura.`
        : 'Ainda não há números para escrever aqui.';
    });
    inserir.addEventListener('click', (e) => {
      // Dentro do summary: sem isso o clique também abriria/fecharia o guia.
      e.preventDefault();
      e.stopPropagation();
      const frases = lerFrases();
      if (!frases.length) {
        guia.open = true;
        aviso.hidden = false;
        return;
      }
      const texto = opcoes.formato === 'texto' ? frases.join(' ') : frases.map((f) => `- ${f}`).join('\n');
      const atual = area.value.trimEnd();
      area.value = atual ? `${atual}\n\n${texto}\n` : `${texto}\n\n`;
      area.dispatchEvent(new Event('input', { bubbles: true }));
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    });
    resumo.appendChild(inserir);
  }

  const lista = document.createElement('ul');
  PERGUNTAS[campo].forEach((p) => lista.appendChild(Object.assign(document.createElement('li'), { textContent: p })));
  guia.append(resumo, aviso, lista);
  if (temNumeros) {
    guia.appendChild(
      Object.assign(document.createElement('p'), {
        className: 'rel-guia-nota',
        textContent: '"Começar com os números" escreve só os fatos calculados. O porquê e o que fazer com eles são com você.',
      }),
    );
  }
  return guia;
}
