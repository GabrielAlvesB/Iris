import type { ContextoTexto, TarefaTexto, VarianteTexto } from '../../../shared/types/ia.types';

/**
 * Os prompts moram aqui, no main: a tela só diz a tarefa e o contexto. Assim
 * trocar o texto de um prompt não mexe em nenhuma tela, e o modelo recebe
 * sempre o mesmo formato, qualquer que seja o provedor.
 */

export interface PromptMontado {
  sistema: string;
  texto: string;
  /**
   * 'variantes' pede JSON e a resposta é lida por lerVariantes; 'itens' e
   * 'card' também são JSON ({itens} / {descricao, itens}).
   */
  saida: 'texto' | 'variantes' | 'itens' | 'card';
}

const BASE_SISTEMA =
  'Você é um assistente de criação de conteúdo para redes sociais e vídeos, trabalhando para um criador brasileiro. ' +
  'Escreva sempre em português do Brasil, com naturalidade, sem clichês de marketing e sem inventar fatos que não estão no contexto.';

const INSTRUCAO_JSON =
  'Responda APENAS com um objeto JSON válido, sem texto antes ou depois e sem cercas de código, no formato indicado.';

/** Contexto em linhas "Rótulo: valor", pulando o que está vazio. */
function blocoContexto(c: ContextoTexto): string {
  const linhas: Array<[string, string | undefined]> = [
    ['Título', c.titulo],
    ['Formato', c.formato],
    ['Duração', c.duracao],
    ['Descrição atual', c.descricao],
    ['Briefing', c.briefing],
    ['Texto na arte', c.textoNaArte],
    ['Legenda atual', c.legenda],
    ['Gancho', c.gancho],
    ['CTA', c.cta],
    ['Observações', c.observacoes],
    ['Notas', c.notas],
    ['Tags / temas', c.tags?.join(', ')],
    ['Redes', c.redes?.join(', ')],
  ];
  return linhas
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${v!.trim()}`)
    .join('\n');
}

const FORMATACAO =
  'Formatação permitida: linhas começando com "- " viram lista, "1. " lista numerada e **texto** fica em negrito. Nada de títulos com #.';

/** Onde o texto vai e o material de apoio, para os pedidos genéricos. */
function blocoCampo(c: ContextoTexto): string {
  return [
    c.area ? `Área: ${c.area}` : '',
    c.campo ? `Campo: ${c.campo}` : '',
    blocoContexto(c),
    c.referencia?.trim() ? `Material de apoio:\n${c.referencia.trim().slice(0, 12000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function montarPrompt(tarefa: TarefaTexto, c: ContextoTexto): PromptMontado {
  const contexto = blocoContexto(c) || '(sem mais informações)';

  switch (tarefa) {
    case 'legenda-video':
      return {
        saida: 'variantes',
        sistema: `${BASE_SISTEMA}\n${INSTRUCAO_JSON}`,
        texto:
          `Crie 3 opções de descrição/legenda para a publicação deste vídeo, cada uma com um tom diferente ` +
          `(1: direta e informativa; 2: conversa próxima; 3: curiosidade/gancho). Cada legenda com 2 a 5 frases curtas, ` +
          `adequadas às redes indicadas, e de 5 a 12 hashtags relevantes em português (sem o #).\n\n` +
          `Formato: {"variantes":[{"titulo":"nome curto do tom","legenda":"...","hashtags":["..."]}]}\n\n${contexto}`,
      };
    case 'legenda-imagem':
      return {
        saida: 'variantes',
        sistema: `${BASE_SISTEMA}\n${INSTRUCAO_JSON}`,
        texto:
          `Crie 3 opções de legenda para este post de imagem (1: direta; 2: próxima e pessoal; 3: provocativa). ` +
          `Cada opção traz: a legenda pronta para colar (2 a 6 frases, com as hashtags já no fim do texto, de 5 a 10), ` +
          `um CTA curto e um texto alternativo (descrição acessível da arte em 1 frase, sem hashtags).\n\n` +
          `Formato: {"variantes":[{"titulo":"nome curto do tom","legenda":"... #tag #tag","cta":"...","textoAlternativo":"..."}]}\n\n${contexto}`,
      };
    case 'roteiro-rascunho':
      return {
        saida: 'texto',
        sistema:
          `${BASE_SISTEMA}\nVocê escreve roteiros de vídeo em markdown, neste padrão: "# Título" na primeira linha; ` +
          `seções com tempo no formato "## [0:00 - 0:40] Nome da seção"; notas de cena numa linha só entre colchetes, ` +
          `como "**[Close no produto]**"; falas depois de "**NARRAÇÃO:**"; "---" entre seções. ` +
          `Responda só com o roteiro, sem comentários antes ou depois.`,
        texto:
          `Escreva o rascunho completo de um roteiro com base nisto. Comece com um gancho forte nos primeiros segundos, ` +
          `desenvolva em seções com tempos que somem a duração indicada (ou algo razoável para o formato) e termine com um CTA.\n\n${contexto}`,
      };
    case 'roteiro-melhorar':
      return {
        saida: 'texto',
        sistema:
          `${BASE_SISTEMA}\nVocê melhora trechos de roteiro mantendo o formato markdown (títulos "##", notas de cena ` +
          `entre colchetes, "**NARRAÇÃO:**"). Responda só com o trecho reescrito, sem comentários.`,
        texto:
          `Reescreva o trecho abaixo para ficar mais claro, falado e envolvente, com o mesmo sentido e tamanho parecido.` +
          `\n\nContexto do roteiro:\n${contexto}\n\nTrecho:\n${c.selecao ?? ''}`,
      };
    case 'roteiro-revisar':
      return {
        saida: 'texto',
        sistema:
          `${BASE_SISTEMA}\nVocê revisa roteiros em markdown: corrige português, deixa as falas mais naturais para serem ` +
          `lidas em voz alta, corta repetições e melhora o ritmo, sem mudar a estrutura de seções nem o conteúdo factual. ` +
          `Responda só com o roteiro revisado inteiro, no mesmo formato.`,
        texto: `Revise este roteiro.\n\nContexto:\n${contexto}\n\nRoteiro:\n${c.texto ?? ''}`,
      };
    case 'roteiro-gancho-cta':
      return {
        saida: 'variantes',
        sistema: `${BASE_SISTEMA}\n${INSTRUCAO_JSON}`,
        texto:
          `Sugira 3 pares de gancho (frase dos primeiros 3 segundos, que prende) e CTA (chamada final) para este roteiro.\n\n` +
          `Formato: {"variantes":[{"titulo":"nome curto","gancho":"...","cta":"..."}]}\n\n` +
          `Contexto:\n${contexto}\n\nRoteiro (trecho):\n${(c.texto ?? '').slice(0, 6000)}`,
      };
    case 'prompt-imagem':
      return {
        saida: 'texto',
        sistema:
          'Você escreve prompts para modelos de geração de imagem. Responda só com o prompt final, em português, ' +
          'num parágrafo detalhado: assunto, composição, enquadramento, iluminação, cores, estilo e o que deve ficar legível.',
        texto:
          `Melhore este pedido de imagem para gerar um resultado profissional${c.formato ? ` no formato ${c.formato}` : ''}. ` +
          `Se houver imagens anexadas, elas são referências: descreva o que deve ser aproveitado delas.\n\nPedido: ${c.prompt ?? ''}`,
      };
    case 'prompt-thumbnail':
      return {
        saida: 'texto',
        sistema:
          'Você cria prompts para thumbnails de vídeo com alto índice de clique. Responda só com o prompt, em português, ' +
          'num parágrafo: um elemento principal forte, rosto/expressão se fizer sentido, contraste alto, fundo simples, ' +
          'e no máximo 3 a 5 palavras de texto grande e legível (diga exatamente quais).',
        texto:
          `Crie o prompt da imagem para esta postagem${c.formato ? ` (formato ${c.formato})` : ''}. ` +
          `Se houver imagens anexadas, são referências (pessoa, produto ou estilo) que devem aparecer.\n\n${contexto}`,
      };
    case 'ideias-imagem':
      return {
        saida: 'variantes',
        sistema: `Você é diretor de arte de thumbnails e posts para redes sociais. Escreva em português. ${INSTRUCAO_JSON}`,
        texto:
          `Proponha 4 ideias BEM diferentes entre si para esta imagem${c.formato ? ` (formato: ${c.formato})` : ''} — mude o conceito, ` +
          `a composição e o estilo, não só detalhes. Cada ideia vira um prompt completo, pronto para um gerador de imagem ` +
          `(assunto, composição, luz, cores, estilo e o texto exato que aparece na arte, se houver). ` +
          `Se houver imagens anexadas, são referências (pessoa, produto ou estilo) que devem aparecer.\n\n` +
          `Formato: {"variantes":[{"titulo":"nome curto da ideia","texto":"prompt completo"}]}\n\n` +
          `Pedido atual: ${c.prompt || '(vazio)'}\n${contexto}`,
      };
    case 'texto-escrever':
      return {
        saida: 'texto',
        sistema: `${BASE_SISTEMA}\nVocê escreve o conteúdo de um campo de texto específico. ${FORMATACAO} Responda só com o texto do campo, sem introdução.`,
        texto: `Escreva o conteúdo deste campo, objetivo e útil, baseado no material abaixo.${c.texto?.trim() ? `\n\nRascunho atual (aproveite o que servir):\n${c.texto}` : ''}\n\n${blocoCampo(c)}`,
      };
    case 'texto-melhorar':
      return {
        saida: 'texto',
        sistema: `${BASE_SISTEMA}\nVocê melhora textos: corrige o português, deixa mais claro e direto, mantém o sentido, os fatos e um tamanho parecido. ${FORMATACAO} Responda só com o texto melhorado.`,
        texto: `Melhore este texto.\n\nTexto:\n${c.texto ?? ''}\n\n${blocoCampo(c)}`,
      };
    case 'texto-desenvolver':
      return {
        saida: 'texto',
        sistema: `${BASE_SISTEMA}\nVocê desenvolve ideias curtas em algo mais completo: explica, dá exemplos e sugere próximos passos, sem enrolar. ${FORMATACAO} Responda só com o texto.`,
        texto: `Desenvolva esta ideia.\n\nIdeia:\n${c.texto ?? ''}\n\n${blocoCampo(c)}`,
      };
    case 'texto-resumir':
      return {
        saida: 'texto',
        sistema: `${BASE_SISTEMA}\nVocê resume textos mantendo o essencial, em poucas linhas. ${FORMATACAO} Responda só com o resumo.`,
        texto: `Resuma este texto.\n\nTexto:\n${c.texto ?? ''}\n\n${blocoCampo(c)}`,
      };
    case 'lista-itens':
      return {
        saida: 'itens',
        sistema: `${BASE_SISTEMA}\n${INSTRUCAO_JSON}`,
        texto:
          `Sugira de 4 a 10 itens de checklist concretos e acionáveis (cada um começa com verbo, no máximo 12 palavras) para concluir isto. ` +
          `Não repita os itens que já existem.\n\nFormato: {"itens":["...","..."]}\n\n` +
          `${blocoCampo(c)}${c.itens?.length ? `\n\nItens que já existem:\n- ${c.itens.join('\n- ')}` : ''}`,
      };
    case 'kanban-card':
      return {
        saida: 'card',
        sistema: `${BASE_SISTEMA}\n${INSTRUCAO_JSON}`,
        texto:
          `A partir do título do card, escreva uma descrição curta (contexto e critério de pronto, 2 a 5 linhas; ${FORMATACAO}) ` +
          `e de 3 a 8 subtarefas acionáveis. Não repita subtarefas que já existem.\n\n` +
          `Formato: {"descricao":"...","itens":["...","..."]}\n\n${blocoCampo(c)}${c.itens?.length ? `\n\nSubtarefas que já existem:\n- ${c.itens.join('\n- ')}` : ''}`,
      };
    default:
      throw new Error('Tarefa de texto desconhecida.');
  }
}

/** Tira cercas de código e acha o primeiro objeto JSON da resposta. */
function extrairJson(texto: string): unknown {
  const limpo = texto.replace(/```(?:json)?/gi, '').trim();
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio < 0 || fim <= inicio) throw new Error('A IA não respondeu no formato esperado. Tente de novo.');
  try {
    return JSON.parse(limpo.slice(inicio, fim + 1));
  } catch {
    throw new Error('A IA não respondeu no formato esperado. Tente de novo.');
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function lerVariantes(texto: string): VarianteTexto[] {
  const json = extrairJson(texto) as { variantes?: unknown };
  const lista = Array.isArray(json.variantes) ? json.variantes : Array.isArray(json) ? json : [];
  const variantes = lista
    .map((v): VarianteTexto => {
      const o = (v ?? {}) as Record<string, unknown>;
      return {
        titulo: str(o.titulo),
        texto: str(o.texto),
        legenda: str(o.legenda),
        hashtags: Array.isArray(o.hashtags)
          ? o.hashtags.filter((h): h is string => typeof h === 'string').map((h) => h.replace(/^#/, '').trim()).filter(Boolean)
          : undefined,
        cta: str(o.cta),
        textoAlternativo: str(o.textoAlternativo),
        gancho: str(o.gancho),
      };
    })
    .filter((v) => v.legenda || v.texto || v.gancho || v.cta);
  if (!variantes.length) throw new Error('A IA não devolveu nenhuma sugestão. Tente de novo.');
  return variantes;
}

/** {itens:[...]} → lista limpa, sem repetidos. */
export function lerItens(texto: string): string[] {
  const json = extrairJson(texto) as { itens?: unknown };
  const itens = (Array.isArray(json.itens) ? json.itens : [])
    .filter((i): i is string => typeof i === 'string')
    .map((i) => i.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s*/, '').trim())
    .filter(Boolean);
  const unicos = [...new Set(itens)];
  if (!unicos.length) throw new Error('A IA não devolveu nenhum item. Tente de novo.');
  return unicos;
}

/** {descricao, itens} do card do Kanban. */
export function lerCard(texto: string): { descricao: string; itens: string[] } {
  const json = extrairJson(texto) as { descricao?: unknown };
  const descricao = typeof json.descricao === 'string' ? json.descricao.trim() : '';
  let itens: string[] = [];
  try {
    itens = lerItens(texto);
  } catch {
    itens = [];
  }
  if (!descricao && !itens.length) throw new Error('A IA não devolveu nada para o card. Tente de novo.');
  return { descricao, itens };
}

/** Texto livre: tira cercas de código que alguns modelos põem em volta. */
export function limparTexto(texto: string): string {
  return texto
    .replace(/^\s*```(?:markdown|md)?\s*\n/i, '')
    .replace(/\n```\s*$/i, '')
    .trim();
}
