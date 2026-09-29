/**
 * Integração com IAs. Compilado pelos dois lados (vai em evento push): só
 * JSON puro. As chaves de API nunca aparecem aqui — moram no secretStore e a
 * tela só recebe `temChave`.
 */

export type ProvedorId = 'openrouter' | 'openai' | 'anthropic' | 'google' | 'compativel';

/**
 * - texto: escreve (legendas, roteiros, prompts).
 * - visao: lê imagens junto com o texto.
 * - imagem: gera imagem a partir de texto.
 * - imagemComReferencia: gera imagem usando imagens enviadas como base.
 */
export type Capacidade = 'texto' | 'visao' | 'imagem' | 'imagemComReferencia';

export interface DescritorProvedor {
  id: ProvedorId;
  rotulo: string;
  descricao: string;
  capacidades: Capacidade[];
  /** Página onde se cria a chave. */
  urlChave: string;
  /** Sugestões para os campos de modelo; a lista real vem do provedor. */
  modeloTextoSugerido?: string;
  modeloImagemSugerido?: string;
  /** O "compatível" precisa do endereço do servidor. */
  exigeBaseUrl?: boolean;
}

/** Catálogo único dos provedores: Ajustes, Tutorial e seletores derivam daqui. */
export const PROVEDORES: readonly DescritorProvedor[] = [
  {
    id: 'openrouter',
    rotulo: 'OpenRouter',
    descricao: 'Uma chave só para centenas de modelos (GPT, Claude, Gemini, Llama…), inclusive os que geram imagem.',
    capacidades: ['texto', 'visao', 'imagem', 'imagemComReferencia'],
    urlChave: 'https://openrouter.ai/settings/keys',
    modeloTextoSugerido: 'google/gemini-2.5-flash',
    modeloImagemSugerido: 'google/gemini-2.5-flash-image',
  },
  {
    id: 'openai',
    rotulo: 'OpenAI (ChatGPT)',
    descricao: 'Modelos GPT para texto e gpt-image para imagens, com edição a partir de imagens de referência.',
    capacidades: ['texto', 'visao', 'imagem', 'imagemComReferencia'],
    urlChave: 'https://platform.openai.com/api-keys',
    modeloTextoSugerido: 'gpt-4.1-mini',
    modeloImagemSugerido: 'gpt-image-1',
  },
  {
    id: 'anthropic',
    rotulo: 'Anthropic (Claude)',
    descricao: 'Claude escreve e lê imagens muito bem, mas não gera imagens — use-o para textos e roteiros.',
    capacidades: ['texto', 'visao'],
    urlChave: 'https://console.anthropic.com/settings/keys',
    modeloTextoSugerido: 'claude-sonnet-5',
  },
  {
    id: 'google',
    rotulo: 'Google (Gemini)',
    descricao: 'Gemini para texto e Gemini Image (ou Imagen) para gerar e editar imagens. Texto tem uso gratuito; imagem, em geral, só com faturamento ativo na chave.',
    capacidades: ['texto', 'visao', 'imagem', 'imagemComReferencia'],
    urlChave: 'https://aistudio.google.com/apikey',
    modeloTextoSugerido: 'gemini-2.5-flash',
    modeloImagemSugerido: 'gemini-2.5-flash-image',
  },
  {
    id: 'compativel',
    rotulo: 'Compatível com OpenAI',
    descricao: 'Qualquer serviço que fale a API da OpenAI: Groq, DeepSeek, Together, Ollama ou LM Studio no seu PC…',
    capacidades: ['texto', 'visao', 'imagem', 'imagemComReferencia'],
    urlChave: 'https://platform.openai.com/docs/api-reference',
    exigeBaseUrl: true,
  },
];

export function descritorDe(id: ProvedorId): DescritorProvedor {
  return PROVEDORES.find((p) => p.id === id) ?? PROVEDORES[0]!;
}

export function isProvedorId(valor: unknown): valor is ProvedorId {
  return typeof valor === 'string' && PROVEDORES.some((p) => p.id === valor);
}

export interface ConfigProvedor {
  id: ProvedorId;
  temChave: boolean;
  /**
   * Pronto para uso: tem chave — ou, no "compatível", tem endereço (um Ollama
   * ou LM Studio local não pede chave).
   */
  configurado: boolean;
  /**
   * Os 4 últimos caracteres da chave salva, para reconhecer qual é
   * ("••••••••a1b2"). A chave inteira nunca sai do main.
   */
  finalChave?: string;
  /** Só o "compatível": ex. https://api.groq.com/openai/v1 ou http://localhost:11434/v1 */
  baseUrl: string;
  modeloTexto: string;
  modeloImagem: string;
}

export interface EscolhaModelo {
  provedor: ProvedorId;
  modelo: string;
}

/** Pasta da Biblioteca onde "Salvar na Biblioteca" grava as imagens. */
export interface DestinoBiblioteca {
  raizId: string;
  subpasta: string;
}

export interface IaConfig {
  provedores: ConfigProvedor[];
  /** Provedor usado nos botões de texto (legendas, roteiros, prompts). */
  texto?: ProvedorId;
  /** Provedor padrão do Estúdio de imagens. */
  imagem?: ProvedorId;
  destino?: DestinoBiblioteca;
  criptografiaDisponivel: boolean;
}

export interface SalvarProvedorInput {
  id: ProvedorId;
  /** undefined mantém a chave atual; '' remove. */
  apiKey?: string;
  baseUrl?: string;
  modeloTexto?: string;
  modeloImagem?: string;
}

export interface SalvarPadroesInput {
  /** '' tira o padrão. */
  texto?: ProvedorId | '';
  imagem?: ProvedorId | '';
  /** null tira o destino. */
  destino?: DestinoBiblioteca | null;
}

export interface ModeloIa {
  id: string;
  nome: string;
  /** Gera imagem (pelo que o provedor informa ou pelo nome). */
  geraImagem: boolean;
  descricao?: string;
  /** Janela de contexto em tokens, quando o provedor informa. */
  contexto?: number;
  /** US$ por 1 milhão de tokens (OpenRouter informa; os outros não). */
  precoEntrada?: number;
  precoSaida?: number;
}

/** Recomendação de modelo para um uso, mostrada no cartão do provedor. */
export interface RecomendacaoModelo {
  uso: string;
  tipo: 'texto' | 'imagem';
  /** Id sugerido; se não estiver na lista do provedor, a busca abre com `busca`. */
  modelo: string;
  busca: string;
  porque: string;
}

/**
 * Guia rápido de escolha no OpenRouter. Os ids mudam com o tempo, por isso
 * cada recomendação tem também um termo de busca: se o id sumir da lista, o
 * seletor abre já filtrado pela família certa.
 */
export const RECOMENDACOES_OPENROUTER: readonly RecomendacaoModelo[] = [
  {
    uso: 'Legendas, hashtags e prompts',
    tipo: 'texto',
    modelo: 'google/gemini-2.5-flash',
    busca: 'gemini flash',
    porque: 'Rápido e barato, ótimo em português. Ideal para o dia a dia (sugestões de legenda custam frações de centavo).',
  },
  {
    uso: 'Roteiros e revisão de texto',
    tipo: 'texto',
    modelo: 'anthropic/claude-opus-5',
    busca: 'anthropic/claude',
    porque: 'A melhor escrita e a melhor revisão em português. Mais caro: use para roteiros, não para legendas em massa.',
  },
  {
    uso: 'Texto econômico',
    tipo: 'texto',
    modelo: 'deepseek/deepseek-chat',
    busca: 'deepseek',
    porque: 'Muito barato e bom para rascunhos e ideias; revise o português antes de publicar.',
  },
  {
    uso: 'Thumbnails e imagens com referência',
    tipo: 'imagem',
    modelo: 'google/gemini-2.5-flash-image',
    busca: 'gemini image',
    porque: 'Mantém rosto, produto e estilo das imagens que você manda. O melhor custo-benefício para thumbnails.',
  },
  {
    uso: 'Imagem com texto grande legível',
    tipo: 'imagem',
    modelo: 'openai/gpt-5-image',
    busca: 'openai image',
    porque: 'Os modelos de imagem da OpenAI escrevem melhor as palavras na arte (títulos de thumbnail). Mais caros e lentos.',
  },
];

// ---------- Imagens ----------

export const FORMATOS_IMAGEM_IA = [
  { id: 'thumb-youtube', rotulo: 'Thumbnail YouTube', proporcao: '16:9', largura: 1280, altura: 720 },
  { id: 'story', rotulo: 'Reels / Story', proporcao: '9:16', largura: 1080, altura: 1920 },
  { id: 'quadrado', rotulo: 'Quadrado', proporcao: '1:1', largura: 1080, altura: 1080 },
  { id: 'retrato', rotulo: 'Retrato (feed)', proporcao: '4:5', largura: 1080, altura: 1350 },
  { id: 'paisagem', rotulo: 'Paisagem', proporcao: '3:2', largura: 1536, altura: 1024 },
] as const;

export type FormatoImagemIa = (typeof FORMATOS_IMAGEM_IA)[number]['id'];

export function formatoIaDe(id: string): (typeof FORMATOS_IMAGEM_IA)[number] {
  return FORMATOS_IMAGEM_IA.find((f) => f.id === id) ?? FORMATOS_IMAGEM_IA[0];
}

export type QualidadeImagem = 'baixa' | 'media' | 'alta';

export type OrigemReferencia = 'arquivo' | 'biblioteca' | 'galeria';

/**
 * Referência para gerar imagem. O renderer só conhece o id: o caminho do
 * arquivo fica no main (arquivo escolhido no dialog, recurso da Biblioteca ou
 * item da galeria).
 */
export interface RefImagem {
  origem: OrigemReferencia;
  id: string;
}

export interface ReferenciaIa extends RefImagem {
  nome: string;
  /** data URL pequena; vazia quando o formato não tem prévia (ex.: webp). */
  miniatura: string;
}

export interface VinculoPostagem {
  tipo: 'video' | 'imagem';
  id: string;
  titulo: string;
}

export interface GerarImagemInput {
  prompt: string;
  formato: FormatoImagemIa;
  referencias: RefImagem[];
  /** 1 a 4 */
  quantidade: number;
  provedor?: ProvedorId;
  modelo?: string;
  qualidade?: QualidadeImagem;
  postagem?: VinculoPostagem;
  /**
   * 'modificar': `prompt` é só o que mudar, e a (única) referência é a imagem
   * a editar. O main monta o pedido de edição; o texto não vem da tela.
   */
  modo?: 'criar' | 'modificar';
}

export interface ItemGaleria {
  id: string;
  prompt: string;
  provedor: ProvedorId;
  modelo: string;
  formato: FormatoImagemIa;
  largura: number;
  altura: number;
  /** Nomes das referências usadas (as próprias não são copiadas). */
  referencias: string[];
  criadoEm: string;
  postagem?: VinculoPostagem;
  biblioteca?: { recursoId: string; caminho: string };
}

/** Item com a miniatura, como a tela recebe. */
export interface ItemGaleriaComMiniatura extends ItemGaleria {
  miniatura: string;
}

export type SituacaoTarefaIa = 'gerando' | 'pronto' | 'erro' | 'cancelado';

export interface TarefaIa {
  id: string;
  situacao: SituacaoTarefaIa;
  prompt: string;
  formato: FormatoImagemIa;
  quantidade: number;
  provedor: ProvedorId;
  modelo: string;
  iniciadaEm: string;
  terminadaEm?: string;
  erro?: string;
  /** Itens da galeria criados, quando pronta. */
  itemIds?: string[];
  postagem?: VinculoPostagem;
}

export interface SalvarNaBibliotecaResult {
  item: ItemGaleria;
  recursoId: string;
  caminho: string;
}

// ---------- Texto ----------

export type TarefaTexto =
  | 'legenda-video'
  | 'legenda-imagem'
  | 'roteiro-rascunho'
  | 'roteiro-melhorar'
  | 'roteiro-revisar'
  | 'roteiro-gancho-cta'
  | 'prompt-imagem'
  | 'prompt-thumbnail'
  /** Ideias diferentes de imagem (variantes com título + prompt). */
  | 'ideias-imagem'
  /** Assistente de qualquer campo de texto (relatórios, kanban, pensamentos…). */
  | 'texto-escrever'
  | 'texto-melhorar'
  | 'texto-desenvolver'
  | 'texto-resumir'
  /** Itens acionáveis (checklist do To-do, subtarefas do Kanban). */
  | 'lista-itens'
  /** Descrição + subtarefas de um card do Kanban a partir do título. */
  | 'kanban-card';

/** O que a tela sabe; o main monta o prompt. Campos vazios são ignorados. */
export interface ContextoTexto {
  /** Onde o texto vai: "Próximos passos", "Descrição do card"… */
  campo?: string;
  /** O que aquele campo deve conter e como analisar o material (ex.: conclusão = síntese com números). */
  orientacao?: string;
  /** A área do app: "Relatório de resultados", "Kanban"… */
  area?: string;
  /** Material de apoio (ex.: o resto do relatório, com as métricas). */
  referencia?: string;
  /** Itens que já existem (para não repetir). */
  itens?: string[];
  titulo?: string;
  descricao?: string;
  briefing?: string;
  textoNaArte?: string;
  legenda?: string;
  notas?: string;
  tags?: string[];
  redes?: string[];
  formato?: string;
  duracao?: string;
  gancho?: string;
  cta?: string;
  observacoes?: string;
  texto?: string;
  selecao?: string;
  prompt?: string;
  /** Imagens que a IA de texto deve olhar (precisa de visão). */
  referencias?: RefImagem[];
}

export interface PedidoTexto {
  tarefa: TarefaTexto;
  contexto: ContextoTexto;
  /** A IA escolhida na hora; ausente = a padrão de texto de Ajustes. Usa o modelo de texto salvo dela. */
  provedor?: ProvedorId;
}

export interface VarianteTexto {
  titulo?: string;
  texto?: string;
  legenda?: string;
  hashtags?: string[];
  cta?: string;
  textoAlternativo?: string;
  gancho?: string;
}

export interface RespostaTexto {
  /** Tarefas de texto único (rascunho, revisão, melhorar, prompt). */
  texto?: string;
  /** Tarefas com opções (legendas, gancho/CTA). */
  variantes?: VarianteTexto[];
  /** 'lista-itens' e 'kanban-card'. */
  itens?: string[];
  provedor: ProvedorId;
  modelo: string;
}
