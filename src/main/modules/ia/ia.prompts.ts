import { formatoIaDe, type ContextoTexto, type TarefaTexto, type VarianteTexto } from '../../../shared/types/ia.types';

/**
 * Os prompts moram aqui, no main: a tela só diz a tarefa e o contexto. Assim
 * trocar o texto de um prompt não mexe em nenhuma tela, e o modelo recebe
 * sempre o mesmo formato, qualquer que seja o provedor.
 *
 * Cada pedido tem as mesmas partes, marcadas com tags para o modelo não
 * confundir instrução com material: <tarefa>, <campo> (o que aquele campo
 * deve conter), <material> (o que o usuário já escreveu, números, contexto)
 * e <regras>. As regras existem porque, sem elas, os modelos preenchem com
 * texto genérico em vez de analisar o material.
 */

export interface PromptMontado {
  sistema: string;
  texto: string;
  /**
   * 'variantes' pede JSON e a resposta é lida por lerVariantes; 'itens' e
   * 'card' também são JSON ({itens} / {descricao, itens}).
   */
  saida: 'texto' | 'variantes' | 'itens' | 'card' | 'json';
}

const BASE_SISTEMA =
  'Você trabalha para um criador de conteúdo brasileiro que produz vídeos, posts e relatórios de resultados para clientes. ' +
  'Escreva sempre em português do Brasil, com naturalidade e precisão.';

/** Regras que valem para todo texto gerado: é aqui que se evita o "texto genérico". */
const REGRAS_TEXTO = [
  'Baseie-se SOMENTE no material fornecido. Use os números, nomes, datas e fatos concretos que aparecem nele — cite-os.',
  'Nunca invente dados, métricas, resultados, nomes ou acontecimentos que não estão no material.',
  'Se o material não tiver o suficiente para o que o campo pede, escreva o melhor possível com o que existe e diga, em uma frase objetiva, o que faltou — em vez de preencher com generalidades.',
  'Fique estritamente no assunto do campo e do material. Nada de conselhos genéricos que serviriam para qualquer caso.',
  'Proibido frases vazias e clichês: "em suma", "é importante ressaltar", "vale destacar", "no cenário atual", "cada vez mais", "sem dúvida".',
  'Seja direto: frases curtas, sem introdução nem despedida, sem repetir o enunciado.',
];

const INSTRUCAO_JSON =
  'Responda APENAS com um objeto JSON válido, sem texto antes ou depois e sem cercas de código, no formato indicado.';

const FORMATACAO =
  'Formatação permitida: linhas começando com "- " viram lista, "1. " lista numerada e **texto** fica em negrito. Nada de títulos com #.';

function regras(extras: string[] = []): string {
  return `<regras>\n${[...REGRAS_TEXTO, ...extras].map((r) => `- ${r}`).join('\n')}\n</regras>`;
}

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

/** Material completo de um pedido genérico: onde o texto vai, o que deve conter e o apoio. */
function blocoMaterial(c: ContextoTexto): string {
  const partes = [
    c.area ? `Área do app: ${c.area}` : '',
    blocoContexto(c),
    c.referencia?.trim() ? c.referencia.trim().slice(0, 16000) : '',
  ].filter(Boolean);
  return `<material>\n${partes.join('\n\n') || '(nenhum material além do título)'}\n</material>`;
}

function blocoCampo(c: ContextoTexto): string {
  return `<campo>\n${c.campo ?? 'Campo de texto'}${c.orientacao ? `\nO que este campo deve conter: ${c.orientacao}` : ''}\n</campo>`;
}

const PAPEL_ROTEIRISTA =
  'Você é roteirista de vídeos para redes sociais e YouTube: escreve falas naturais para serem ditas em voz alta, ' +
  'com gancho forte, ritmo e uma ideia por cena.';

/** O material de um pedido do Estúdio de roteiro: ficha, briefing, pesquisa e o roteiro atual. */
function blocoRoteiro(c: ContextoTexto): string {
  const partes = [
    blocoContexto(c),
    c.referencia?.trim() ? c.referencia.trim().slice(0, 24000) : '',
  ].filter(Boolean);
  return `<material>\n${partes.join('\n\n') || '(só o título)'}\n</material>`;
}

function blocoItensExistentes(c: ContextoTexto, rotulo: string): string {
  return c.itens?.length ? `\n<existentes>\n${rotulo}:\n- ${c.itens.join('\n- ')}\n</existentes>` : '';
}

// ---------- Imagem ----------

/** Como cada formato é usado — entra no prompt da imagem e nos pedidos de ideia. */
const USO_DO_FORMATO: Record<string, string> = {
  'thumb-youtube':
    'thumbnail de vídeo do YouTube, horizontal 16:9, feita para ser clicada numa tela pequena: um elemento principal grande, contraste alto, fundo simples, leitura imediata',
  story:
    'Reels/Story vertical 9:16, vista no celular: assunto principal no centro, sem nada importante nas faixas de cima e de baixo (onde ficam os botões do app)',
  quadrado: 'post quadrado 1:1 para o feed: composição centrada, que funcione em tamanho pequeno',
  retrato: 'post vertical 4:5 para o feed: assunto principal ocupando bem a altura',
  paisagem: 'imagem horizontal 3:2: composição ampla e equilibrada',
};

const PAPEL_DIRETOR_DE_ARTE =
  'Você é diretor de arte de thumbnails e posts de redes sociais que performam bem. ' +
  'Seu trabalho é transformar o pedido em um prompt excelente para um gerador de imagem. Regras: ' +
  'fique no tema pedido — não troque o assunto nem acrescente temas que não foram pedidos; ' +
  'descreva UMA única imagem: assunto principal, ação/expressão, composição e enquadramento, iluminação, paleta de cores e estilo visual; ' +
  'se houver texto escrito na arte, coloque-o entre aspas, curto (até 5 palavras), em português; ' +
  'NÃO mencione formato, proporção, resolução nem plataforma — o app cuida disso; ' +
  'escreva em português, sem introdução.';

/**
 * O que vai de fato para o modelo de imagem: o pedido do usuário dentro de um
 * envelope fixo que garante qualidade, fidelidade ao pedido e o formato certo.
 * O formato é repetido aqui porque o pedido pode ter vindo de uma ideia que
 * citava outro formato — e o modelo seguiria o texto em vez da proporção.
 */
export function montarPromptDeImagem(pedido: string, formatoId: string, temReferencias: boolean, modo: 'criar' | 'modificar'): string {
  const formato = formatoIaDe(formatoId);
  const uso = USO_DO_FORMATO[formato.id] ?? formato.rotulo;
  if (modo === 'modificar') {
    return [
      'Edite a imagem de referência fazendo SOMENTE esta mudança:',
      pedido.trim(),
      '',
      'Mantenha todo o resto idêntico: pessoas e rostos, objetos, composição, enquadramento, estilo, cores e textos que não foram citados.',
      `A imagem final continua no formato ${formato.proporcao} (${uso}).`,
      'Todo texto escrito na imagem deve estar em português, sem erros de ortografia, nítido e legível.',
    ].join('\n');
  }
  return [
    `Crie uma única imagem profissional, de alta qualidade, para ${uso}.`,
    temReferencias
      ? 'Use as imagens anexadas como referência fiel: mantenha a aparência das pessoas, dos produtos e o estilo visual delas.'
      : '',
    'Siga o pedido abaixo com fidelidade. Não acrescente pessoas, objetos, logotipos ou textos que não foram pedidos.',
    'Todo texto escrito na imagem deve estar em português, exatamente como pedido, grande, nítido e sem erros de ortografia.',
    `O formato é ${formato.proporcao}. Ignore qualquer outra proporção ou formato citado no pedido.`,
    '',
    `Pedido: ${pedido.trim()}`,
  ]
    .filter((l, i, todas) => l || todas[i - 1])
    .join('\n');
}

// ---------- Texto ----------

export function montarPrompt(tarefa: TarefaTexto, c: ContextoTexto): PromptMontado {
  const contexto = blocoContexto(c) || '(sem mais informações)';

  switch (tarefa) {
    case 'legenda-video':
      return {
        saida: 'variantes',
        sistema: `${BASE_SISTEMA}\nVocê é copywriter de redes sociais. ${INSTRUCAO_JSON}`,
        texto:
          `<tarefa>Crie 3 opções de descrição/legenda para a publicação deste vídeo, cada uma com um tom diferente ` +
          `(1: direta e informativa; 2: conversa próxima; 3: curiosidade). Cada uma com 2 a 5 frases curtas sobre o ASSUNTO REAL do vídeo ` +
          `(use o título, a descrição e as notas), adequada às redes indicadas, e de 5 a 12 hashtags específicas do tema, em português, sem o #.</tarefa>\n` +
          `<material>\n${contexto}\n</material>\n` +
          regras(['Hashtags específicas do assunto, nada de hashtags genéricas como #conteudo ou #video.']) +
          `\nFormato: {"variantes":[{"titulo":"nome curto do tom","legenda":"...","hashtags":["..."]}]}`,
      };
    case 'legenda-imagem':
      return {
        saida: 'variantes',
        sistema: `${BASE_SISTEMA}\nVocê é copywriter de redes sociais. ${INSTRUCAO_JSON}`,
        texto:
          `<tarefa>Crie 3 opções de legenda para este post de imagem (1: direta; 2: próxima e pessoal; 3: provocativa). ` +
          `Cada opção traz: a legenda pronta para colar (2 a 6 frases sobre o assunto real do post, com 5 a 10 hashtags específicas no fim), ` +
          `um CTA curto coerente com o objetivo do post e um texto alternativo que descreva a arte em 1 frase (sem hashtags), a partir do briefing e do texto na arte.</tarefa>\n` +
          `<material>\n${contexto}\n</material>\n` +
          regras() +
          `\nFormato: {"variantes":[{"titulo":"nome curto do tom","legenda":"... #tag #tag","cta":"...","textoAlternativo":"..."}]}`,
      };
    case 'roteiro-rascunho':
      return {
        saida: 'texto',
        sistema:
          `${BASE_SISTEMA}\nVocê é roteirista de vídeos para redes sociais e YouTube. Escreve em markdown, neste padrão: "# Título" na primeira linha; ` +
          `seções com tempo no formato "## [0:00 - 0:40] Nome da seção"; notas de cena numa linha só entre colchetes, ` +
          `como "**[Close no produto]**"; falas depois de "**NARRAÇÃO:**"; "---" entre seções. ` +
          `Responda só com o roteiro, sem comentários antes ou depois.`,
        texto:
          `<tarefa>Escreva o rascunho completo do roteiro. Gancho forte nos primeiros 3 segundos, seções com tempos que somem a duração indicada ` +
          `(ou algo realista para o formato), falas naturais para serem ditas em voz alta e um CTA no fim.</tarefa>\n` +
          `<material>\n${contexto}\n</material>\n` +
          regras(['Todo o conteúdo gira em torno do tema do título; não fuja para assuntos paralelos.', 'Não invente estatísticas; se precisar de um dado, deixe [dado a confirmar].']),
      };
    case 'roteiro-melhorar':
      return {
        saida: 'texto',
        sistema:
          `${BASE_SISTEMA}\nVocê melhora trechos de roteiro mantendo o formato markdown (títulos "##", notas de cena ` +
          `entre colchetes, "**NARRAÇÃO:**"). Responda só com o trecho reescrito, sem comentários.`,
        texto:
          `<tarefa>Reescreva o trecho para ficar mais claro, falado e envolvente, com o mesmo sentido e tamanho parecido.</tarefa>\n` +
          `<material>\n${contexto}\n</material>\n<trecho>\n${c.selecao ?? ''}\n</trecho>\n` +
          regras(['Mantenha as informações do trecho; mude só a forma.']),
      };
    case 'roteiro-revisar':
      return {
        saida: 'texto',
        sistema:
          `${BASE_SISTEMA}\nVocê revisa roteiros em markdown: corrige português, deixa as falas mais naturais para serem ` +
          `lidas em voz alta, corta repetições e melhora o ritmo, sem mudar a estrutura de seções nem o conteúdo factual. ` +
          `Responda só com o roteiro revisado inteiro, no mesmo formato.`,
        texto: `<material>\n${contexto}\n</material>\n<roteiro>\n${c.texto ?? ''}\n</roteiro>\n${regras(['Não acrescente seções nem informações novas.'])}`,
      };
    case 'roteiro-gancho-cta':
      return {
        saida: 'variantes',
        sistema: `${BASE_SISTEMA}\nVocê é roteirista de vídeos curtos. ${INSTRUCAO_JSON}`,
        texto:
          `<tarefa>Sugira 3 pares de gancho (frase dos primeiros 3 segundos que faz a pessoa parar de rolar, ligada ao assunto real do roteiro) ` +
          `e CTA (chamada final coerente com o conteúdo).</tarefa>\n` +
          `<material>\n${contexto}\n</material>\n<roteiro>\n${(c.texto ?? '').slice(0, 8000)}\n</roteiro>\n` +
          regras() +
          `\nFormato: {"variantes":[{"titulo":"nome curto","gancho":"...","cta":"..."}]}`,
      };
    // ---------- Estúdio de roteiro ----------
    // A tela manda: briefing (texto), referencia (pesquisa, fontes e o roteiro
    // atual em markdown), orientacao (o pedido específico: ângulo escolhido,
    // objetivo da cena, ação) e texto (a cena ou o trecho em foco).
    case 'roteiro-angulos':
      return {
        saida: 'variantes',
        sistema: `${BASE_SISTEMA}\n${PAPEL_ROTEIRISTA} ${INSTRUCAO_JSON}`,
        texto:
          `<tarefa>Proponha 3 ângulos BEM diferentes para este vídeo — cada um é uma forma de contar o mesmo tema ` +
          `(ex.: investigação, opinião forte, guia prático, história pessoal, lista). Para cada ângulo: um nome curto, ` +
          `o gancho exato dos primeiros 3 segundos (frase falada, que faça parar de rolar) e a abordagem em 2 ou 3 frases ` +
          `(o que o vídeo promete e como desenvolve).</tarefa>\n` +
          `${blocoRoteiro(c)}\n` +
          regras(['Os três ângulos tratam do MESMO tema do briefing; mude a abordagem, não o assunto.']) +
          `\nFormato: {"variantes":[{"titulo":"nome do ângulo","gancho":"frase falada","texto":"abordagem"}]}`,
      };
    case 'roteiro-estrutura':
      return {
        saida: 'json',
        sistema: `${BASE_SISTEMA}\n${PAPEL_ROTEIRISTA} ${INSTRUCAO_JSON}`,
        texto:
          `<tarefa>Monte a estrutura do roteiro: a lista de cenas, na ordem, com tipo, título curto, duração em segundos e o ` +
          `objetivo de cada uma (o que a cena precisa dizer ou mostrar). Comece com um gancho, termine com CTA ou encerramento. ` +
          `As durações somam a duração alvo${c.duracao ? ` (${c.duracao})` : ' (ou algo realista para o formato)'}.</tarefa>\n` +
          `${blocoRoteiro(c)}\n` +
          regras(['Tipos permitidos: gancho, abertura, secao, demonstracao, cta, encerramento.', 'Cada cena com um objetivo concreto ligado ao tema — nada de "falar sobre o assunto".']) +
          `\nFormato: {"cenas":[{"tipo":"gancho","titulo":"...","duracaoSeg":5,"objetivo":"..."}]}`,
      };
    case 'roteiro-cena':
      return {
        saida: 'json',
        sistema: `${BASE_SISTEMA}\n${PAPEL_ROTEIRISTA} ${INSTRUCAO_JSON}`,
        texto:
          `<tarefa>Escreva UMA cena do roteiro: a fala (o que é dito em voz alta, natural, com o tamanho certo para a duração da cena ` +
          `— cerca de ${c.duracao ? `${c.duracao} de fala` : 'o tempo indicado'}), o visual (cena, B-roll, enquadramento) e o texto na tela ` +
          `(curto, opcional). Continue de onde as cenas anteriores pararam, sem repetir o que já foi dito.</tarefa>\n` +
          `<cena>\n${c.orientacao ?? ''}\n</cena>\n` +
          `${blocoRoteiro(c)}\n` +
          regras(['A fala é para ser dita: frases curtas, sem marcação de cena dentro dela.', 'Se precisar de um dado que não está no material, escreva [dado a confirmar].']) +
          `\nFormato: {"fala":"...","visual":"...","textoTela":"..."}`,
      };
    case 'roteiro-acao-cena':
      return {
        saida: 'texto',
        sistema: `${BASE_SISTEMA}\n${PAPEL_ROTEIRISTA} Responda só com o texto pronto para entrar no lugar, sem comentários, aspas extras ou rótulos.`,
        texto:
          `<tarefa>${c.orientacao ?? 'Melhore o trecho.'}</tarefa>\n<trecho>\n${c.texto ?? ''}\n</trecho>\n` +
          `${blocoRoteiro(c)}\n` +
          regras(['Mantenha os fatos do trecho; não invente dados.']),
      };
    case 'roteiro-variacoes':
      return {
        saida: 'variantes',
        sistema: `${BASE_SISTEMA}\n${PAPEL_ROTEIRISTA} ${INSTRUCAO_JSON}`,
        texto:
          `<tarefa>Escreva 3 variações BEM diferentes deste trecho (${c.campo ?? 'trecho do roteiro'}), cada uma com uma estratégia diferente ` +
          `(ex.: pergunta, número forte, conflito, promessa). Mesmo assunto e tamanho parecido.</tarefa>\n<trecho>\n${c.texto ?? ''}\n</trecho>\n` +
          `${blocoRoteiro(c)}\n${regras()}` +
          `\nFormato: {"variantes":[{"titulo":"estratégia","texto":"..."}]}`,
      };
    case 'roteiro-critica':
      return {
        saida: 'json',
        sistema: `${BASE_SISTEMA}\nVocê é um editor exigente de roteiros de vídeo: aponta o que derruba a retenção e diz como corrigir. ${INSTRUCAO_JSON}`,
        texto:
          `<tarefa>Avalie o roteiro. Dê nota de 0 a 10 para cada critério — Gancho (prende nos 3 primeiros segundos?), Clareza, ` +
          `Ritmo (trechos arrastados, repetição), Duração (cabe no alvo?), CTA (claro e ligado ao conteúdo?), Fontes (afirmações sustentadas?) — ` +
          `com um comentário curto e específico. Depois liste de 3 a 10 apontamentos concretos: a cena (número, começando em 1), o trecho exato, ` +
          `o problema e a sugestão de correção. Termine com nota geral e um resumo de 1 a 2 frases.</tarefa>\n` +
          `${blocoRoteiro(c)}\n` +
          regras(['Cite trechos reais do roteiro nos apontamentos.', 'Nada de elogio genérico: se está bom, diga por quê em poucas palavras.']) +
          `\nFormato: {"notaGeral":7.5,"resumo":"...","criterios":[{"nome":"Gancho","nota":8,"comentario":"..."}],"apontamentos":[{"cena":1,"trecho":"...","problema":"...","sugestao":"..."}]}`,
      };
    case 'roteiro-adaptar':
      return {
        saida: 'json',
        sistema: `${BASE_SISTEMA}\n${PAPEL_ROTEIRISTA} ${INSTRUCAO_JSON}`,
        texto:
          `<tarefa>Adapte o roteiro para outro formato: ${c.orientacao ?? 'outro formato'}. Reescreva cena a cena para o novo formato ` +
          `(corte, reordene, junte ou divida cenas; ajuste a linguagem e o tamanho). Mantenha os fatos e as fontes do original.</tarefa>\n` +
          `${blocoRoteiro(c)}\n` +
          regras(['Tipos de cena permitidos: gancho, abertura, secao, demonstracao, cta, encerramento.', 'Não acrescente informações que não estão no original.']) +
          `\nFormato: {"titulo":"...","cenas":[{"tipo":"gancho","titulo":"...","duracaoSeg":5,"fala":"...","visual":"...","textoTela":"..."}]}`,
      };
    case 'prompt-imagem':
      return {
        saida: 'texto',
        sistema: PAPEL_DIRETOR_DE_ARTE + ' Responda só com o prompt final, num parágrafo.',
        texto:
          `<tarefa>Melhore este pedido de imagem para gerar um resultado profissional, mantendo exatamente o tema e a intenção do pedido.` +
          `${c.formato ? ` A imagem será usada como: ${c.formato}.` : ''} ` +
          `Se houver imagens anexadas, são referências: diga o que deve ser aproveitado delas (pessoa, produto, estilo).</tarefa>\n` +
          `<pedido>\n${c.prompt || '(vazio)'}\n</pedido>`,
      };
    case 'prompt-thumbnail':
      return {
        saida: 'texto',
        sistema:
          PAPEL_DIRETOR_DE_ARTE +
          ' Para thumbnails: um elemento principal forte, rosto com expressão quando fizer sentido, contraste alto, fundo simples ' +
          'e de 2 a 5 palavras de texto grande (diga exatamente quais). Responda só com o prompt, num parágrafo.',
        texto:
          `<tarefa>Crie o prompt da imagem desta postagem. A imagem tem que comunicar o ASSUNTO REAL da postagem (use título, descrição e briefing).` +
          `${c.formato ? ` Uso: ${c.formato}.` : ''} Se houver imagens anexadas, são referências (pessoa, produto ou estilo) que devem aparecer.</tarefa>\n` +
          `<material>\n${contexto}\n</material>${c.prompt?.trim() ? `\n<pedido_atual>\n${c.prompt}\n</pedido_atual>` : ''}`,
      };
    case 'ideias-imagem':
      return {
        saida: 'variantes',
        sistema: `${PAPEL_DIRETOR_DE_ARTE} ${INSTRUCAO_JSON}`,
        texto:
          `<tarefa>Proponha 4 ideias BEM diferentes entre si para esta imagem — mude o conceito visual, a composição e o estilo, ` +
          `mas todas sobre o MESMO tema do pedido. Cada ideia vira um prompt completo, pronto para o gerador de imagem.` +
          `${c.formato ? ` A imagem será usada como: ${c.formato}.` : ''} ` +
          `Se houver imagens anexadas, são referências (pessoa, produto ou estilo) que devem aparecer.</tarefa>\n` +
          `<pedido>\n${c.prompt || '(vazio — use o material)'}\n</pedido>` +
          (blocoContexto(c) ? `\n<material>\n${blocoContexto(c)}\n</material>` : '') +
          `\nFormato: {"variantes":[{"titulo":"nome curto da ideia","texto":"prompt completo"}]}`,
      };
    case 'texto-escrever':
      return {
        saida: 'texto',
        sistema: `${BASE_SISTEMA}\nVocê escreve o conteúdo de um campo específico de um documento, analisando o material. ${FORMATACAO} Responda só com o texto do campo.`,
        texto:
          `<tarefa>Escreva o conteúdo do campo abaixo analisando o material: tire conclusões dele, use os números e fatos concretos.</tarefa>\n` +
          `${blocoCampo(c)}\n${blocoMaterial(c)}` +
          (c.texto?.trim() ? `\n<rascunho_atual>\n${c.texto}\n</rascunho_atual>` : '') +
          `\n${regras(c.texto?.trim() ? ['Aproveite o que o rascunho atual tiver de útil.'] : [])}`,
      };
    case 'texto-melhorar':
      return {
        saida: 'texto',
        sistema: `${BASE_SISTEMA}\nVocê é revisor: corrige o português, deixa o texto mais claro e direto, mantendo o sentido e os fatos. ${FORMATACAO} Responda só com o texto melhorado.`,
        texto:
          `<tarefa>Melhore o texto do campo. Mantenha todas as informações e números; mude a forma, não o conteúdo. ` +
          `Se o material mostrar algo que contradiz o texto, corrija pelo material.</tarefa>\n${blocoCampo(c)}\n<texto>\n${c.texto ?? ''}\n</texto>\n${blocoMaterial(c)}\n${regras()}`,
      };
    case 'texto-desenvolver':
      return {
        saida: 'texto',
        sistema: `${BASE_SISTEMA}\nVocê desenvolve ideias curtas em algo mais completo e útil. ${FORMATACAO} Responda só com o texto.`,
        texto:
          `<tarefa>Desenvolva a ideia: explique o que ela é, por que vale a pena, como executar (passos concretos) e o que decidir primeiro. ` +
          `Tudo sobre ESTA ideia, sem generalidades.</tarefa>\n${blocoCampo(c)}\n<ideia>\n${c.texto ?? ''}\n</ideia>\n${blocoMaterial(c)}\n${regras()}`,
      };
    case 'texto-resumir':
      return {
        saida: 'texto',
        sistema: `${BASE_SISTEMA}\nVocê resume textos mantendo o essencial. ${FORMATACAO} Responda só com o resumo.`,
        texto:
          `<tarefa>Resuma o texto em poucas linhas, mantendo os números e as conclusões principais.</tarefa>\n${blocoCampo(c)}\n<texto>\n${c.texto ?? ''}\n</texto>\n${regras()}`,
      };
    case 'lista-itens':
      return {
        saida: 'itens',
        sistema: `${BASE_SISTEMA}\n${INSTRUCAO_JSON}`,
        texto:
          `<tarefa>Sugira de 4 a 10 itens de checklist concretos e acionáveis para concluir ESTE trabalho específico. ` +
          `Cada item começa com verbo, tem no máximo 12 palavras e é uma ação que dá para marcar como feita. ` +
          `Na ordem em que devem ser feitos. Não repita os existentes.</tarefa>\n` +
          `${blocoCampo(c)}\n${blocoMaterial(c)}${c.texto?.trim() ? `\n<texto>\n${c.texto}\n</texto>` : ''}${blocoItensExistentes(c, 'Itens que já existem')}\n` +
          regras(['Nada de itens vagos como "Planejar" ou "Revisar tudo": diga o quê.']) +
          `\nFormato: {"itens":["...","..."]}`,
      };
    case 'kanban-card':
      return {
        saida: 'card',
        sistema: `${BASE_SISTEMA}\n${INSTRUCAO_JSON}`,
        texto:
          `<tarefa>A partir do título do card, escreva uma descrição curta (contexto e critério de pronto, 2 a 5 linhas; ${FORMATACAO}) ` +
          `e de 3 a 8 subtarefas acionáveis, na ordem de execução. Não repita as existentes.</tarefa>\n` +
          `${blocoCampo(c)}\n${blocoMaterial(c)}${blocoItensExistentes(c, 'Subtarefas que já existem')}\n${regras()}` +
          `\nFormato: {"descricao":"...","itens":["...","..."]}`,
      };
    default:
      throw new Error('Tarefa de texto desconhecida.');
  }
}

/** Tira cercas de código e acha o primeiro objeto JSON da resposta. */
export function extrairJson(texto: string): unknown {
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
