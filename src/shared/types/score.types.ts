/**
 * Escalas de score (0–100): faixas com nome, cor e sentido, definidas pelo
 * usuário. Uma escala é nomeada e reutilizável — cada empresa escolhe a sua,
 * várias podem dividir a mesma, e o que não tem empresa usa a padrão.
 *
 * Sem imports de propósito: o renderer importa este arquivo em runtime e o
 * main também, então ele precisa ser puro.
 */

export type SentidoFaixa = 'positivo' | 'mediano' | 'negativo';

export const SENTIDOS_FAIXA: Array<{ id: SentidoFaixa; rotulo: string; plural: string }> = [
  { id: 'positivo', rotulo: 'Positivo', plural: 'Pontos positivos' },
  { id: 'mediano', rotulo: 'Mediano', plural: 'Pontos de atenção' },
  { id: 'negativo', rotulo: 'Negativo', plural: 'Pontos negativos' },
];

/**
 * A faixa guarda só onde começa (`de`); termina onde a próxima começa, e a
 * última vai até 100. Guardar início e fim deixaria o usuário criar buraco
 * ("de 0 a 49" e "de 60 a 100": e o 55?) ou sobreposição.
 */
export interface FaixaScore {
  id: string;
  rotulo: string;
  de: number;
  /** Hex de CORES_FAIXA. Vai gravado (e não um token) porque o PDF também pinta. */
  cor: string;
  sentido: SentidoFaixa;
}

export interface EscalaScore {
  id: string;
  nome: string;
  /** Ordenadas por `de`; a primeira começa em 0. */
  faixas: FaixaScore[];
}

/** O mínimo do catálogo que as funções de escala precisam. */
export interface CatalogoEscalas {
  tags: Array<{ id: string; empresa?: boolean; escalaScoreId?: string }>;
  escalasScore: EscalaScore[];
  escalaPadraoId: string;
}

/** Cores que o usuário pode dar a uma faixa — legíveis no fundo escuro e no PDF branco. */
export const CORES_FAIXA = [
  { cor: '#ef4444', nome: 'Vermelho' },
  { cor: '#f97316', nome: 'Laranja' },
  { cor: '#f59e0b', nome: 'Amarelo' },
  { cor: '#84cc16', nome: 'Lima' },
  { cor: '#22c55e', nome: 'Verde' },
  { cor: '#3b82f6', nome: 'Azul' },
  { cor: '#8b5cf6', nome: 'Roxo' },
  { cor: '#9498a3', nome: 'Cinza' },
] as const;

export const COR_POR_SENTIDO: Record<SentidoFaixa, string> = {
  positivo: '#22c55e',
  mediano: '#f59e0b',
  negativo: '#ef4444',
};

/**
 * A escala de antes das escalas configuráveis: corte em 85, "passou ou não
 * passou". É a "Padrão" criada na migração e a leitura de resultados de
 * relatório calculados antes (que não guardam a escala).
 */
export const ESCALA_LEGADA: EscalaScore = {
  id: 'padrao',
  nome: 'Padrão',
  faixas: [
    { id: 'negativo', rotulo: 'Negativo', de: 0, cor: '#ef4444', sentido: 'negativo' },
    { id: 'positivo', rotulo: 'Positivo', de: 85, cor: '#22c55e', sentido: 'positivo' },
  ],
};

type FaixaModelo = Omit<FaixaScore, 'id'>;

/** Pontos de partida do "Nova escala": só estrutura, o usuário ajusta os números. */
export const MODELOS_ESCALA: Array<{ id: string; rotulo: string; descricao: string; faixas: FaixaModelo[] }> = [
  {
    id: 'duas',
    rotulo: 'Passou ou não passou',
    descricao: 'Duas faixas: abaixo da meta e na meta.',
    faixas: [
      { rotulo: 'Negativo', de: 0, cor: '#ef4444', sentido: 'negativo' },
      { rotulo: 'Positivo', de: 85, cor: '#22c55e', sentido: 'positivo' },
    ],
  },
  {
    id: 'tres',
    rotulo: 'Péssimo, mediano e positivo',
    descricao: 'Três faixas, com um meio-termo entre o ruim e o bom.',
    faixas: [
      { rotulo: 'Péssimo', de: 0, cor: '#ef4444', sentido: 'negativo' },
      { rotulo: 'Mediano', de: 50, cor: '#f59e0b', sentido: 'mediano' },
      { rotulo: 'Positivo', de: 80, cor: '#22c55e', sentido: 'positivo' },
    ],
  },
  {
    id: 'cinco',
    rotulo: 'Cinco níveis',
    descricao: 'Péssimo, ruim, mediano, bom e ótimo.',
    faixas: [
      { rotulo: 'Péssimo', de: 0, cor: '#ef4444', sentido: 'negativo' },
      { rotulo: 'Ruim', de: 40, cor: '#f97316', sentido: 'negativo' },
      { rotulo: 'Mediano', de: 60, cor: '#f59e0b', sentido: 'mediano' },
      { rotulo: 'Bom', de: 75, cor: '#84cc16', sentido: 'positivo' },
      { rotulo: 'Ótimo', de: 90, cor: '#22c55e', sentido: 'positivo' },
    ],
  },
];

// ---------- Leitura ----------

export function faixaDaEscala(escala: EscalaScore, score: number): FaixaScore {
  let atual = escala.faixas[0]!;
  for (const f of escala.faixas) if (score >= f.de) atual = f;
  return atual;
}

/** Onde a faixa termina: um décimo antes da próxima (o score tem uma casa), ou 100. */
export function fimDaFaixa(escala: EscalaScore, indice: number): number {
  const proxima = escala.faixas[indice + 1];
  return proxima ? Math.round((proxima.de - 0.1) * 10) / 10 : 100;
}

function numeroBr(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** "50 a 79,9". */
export function intervaloDaFaixa(escala: EscalaScore, indice: number): string {
  const f = escala.faixas[indice];
  if (!f) return '';
  return `${numeroBr(f.de)} a ${numeroBr(fimDaFaixa(escala, indice))}`;
}

/** "Péssimo 0 a 49,9 · Mediano 50 a 79,9 · Positivo 80 a 100". */
export function descreverEscala(escala: EscalaScore): string {
  return escala.faixas.map((f, i) => `${f.rotulo} ${intervaloDaFaixa(escala, i)}`).join(' · ');
}

/** Meta = início da faixa positiva mais baixa. Escala sem faixa positiva não tem meta. */
export function metaDaEscala(escala: EscalaScore): number | undefined {
  return escala.faixas.find((f) => f.sentido === 'positivo')?.de;
}

export function escalaPadrao(catalogo: Pick<CatalogoEscalas, 'escalasScore' | 'escalaPadraoId'>): EscalaScore {
  return catalogo.escalasScore.find((e) => e.id === catalogo.escalaPadraoId) ?? catalogo.escalasScore[0] ?? ESCALA_LEGADA;
}

/**
 * Escala de uma postagem: a da primeira empresa dela, na ordem do catálogo,
 * que tenha escala escolhida; senão a padrão. Postagem de duas empresas com
 * escalas diferentes é rara — a ordem do catálogo deixa o resultado estável.
 */
export function escalaDaPostagem(catalogo: CatalogoEscalas, tagIds: readonly string[]): EscalaScore {
  for (const t of catalogo.tags) {
    if (!t.empresa || !t.escalaScoreId || !tagIds.includes(t.id)) continue;
    const escala = catalogo.escalasScore.find((e) => e.id === t.escalaScoreId);
    if (escala) return escala;
  }
  return escalaPadrao(catalogo);
}

/**
 * Escala para ler as médias de um conjunto de postagens. Se todas (com score)
 * seguem a mesma escala, é ela; se misturam, a padrão — e `misturada` avisa a
 * tela, porque uma média de empresas com réguas diferentes não tem uma régua só.
 */
export function escalaDoRecorte(
  catalogo: CatalogoEscalas,
  postagens: ReadonlyArray<{ tagIds: readonly string[]; score?: number }>,
): { escala: EscalaScore; misturada: boolean } {
  const ids = new Set<string>();
  let unica: EscalaScore | undefined;
  postagens.forEach((p) => {
    if (typeof p.score !== 'number') return;
    const e = escalaDaPostagem(catalogo, p.tagIds);
    ids.add(e.id);
    unica = e;
  });
  if (ids.size === 1 && unica) return { escala: unica, misturada: false };
  return { escala: escalaPadrao(catalogo), misturada: ids.size > 1 };
}

/** Escala de um conjunto de empresas escolhidas (relatório, filtro): uma só régua ou a padrão. */
export function escalaDasEmpresas(catalogo: CatalogoEscalas, empresaIds: readonly string[]): EscalaScore | undefined {
  const escalas = new Map<string, EscalaScore>();
  empresaIds.forEach((id) => {
    const tag = catalogo.tags.find((t) => t.id === id && t.empresa);
    if (!tag) return;
    const e = escalaDaPostagem(catalogo, [tag.id]);
    escalas.set(e.id, e);
  });
  return escalas.size === 1 ? [...escalas.values()][0] : undefined;
}

// ---------- Validação (migração e salvar) ----------

function isSentido(v: unknown): v is SentidoFaixa {
  return v === 'positivo' || v === 'mediano' || v === 'negativo';
}

/**
 * Confere uma escala vinda do disco ou da tela. Devolve o motivo em português
 * quando não dá para aceitar — a tela mostra o mesmo texto que o main recusa.
 */
export function problemaDaEscala(escala: Pick<EscalaScore, 'nome' | 'faixas'>): string | undefined {
  if (!escala.nome.trim()) return 'Dê um nome à escala.';
  if (escala.faixas.length < 2) return 'Uma escala precisa de pelo menos duas faixas.';
  for (let i = 0; i < escala.faixas.length; i += 1) {
    const f = escala.faixas[i]!;
    if (!f.rotulo.trim()) return `A ${i + 1}ª faixa está sem nome.`;
    if (!Number.isFinite(f.de) || f.de < 0 || f.de > 100) return `"${f.rotulo}" precisa começar entre 0 e 100.`;
    if (i === 0 && f.de !== 0) return 'A primeira faixa começa em 0.';
    const anterior = escala.faixas[i - 1];
    if (anterior && f.de <= anterior.de) return `"${f.rotulo}" precisa começar depois de "${anterior.rotulo}" (${numeroBr(anterior.de)}).`;
  }
  return undefined;
}

/** Lê uma escala crua; `undefined` quando não dá para aproveitar. */
export function lerEscala(raw: unknown, novoId: () => string): EscalaScore | undefined {
  const c = (raw ?? {}) as Partial<EscalaScore>;
  if (!Array.isArray(c.faixas)) return undefined;
  const faixas: FaixaScore[] = c.faixas
    .map((f): FaixaScore | null => {
      const x = (f ?? {}) as Partial<FaixaScore>;
      const de = typeof x.de === 'number' ? Math.round(x.de * 10) / 10 : NaN;
      if (typeof x.rotulo !== 'string' || !Number.isFinite(de)) return null;
      return {
        id: typeof x.id === 'string' && x.id ? x.id : novoId(),
        rotulo: x.rotulo.trim().slice(0, 40),
        de,
        cor: typeof x.cor === 'string' && /^#[0-9a-f]{6}$/i.test(x.cor) ? x.cor : COR_POR_SENTIDO[isSentido(x.sentido) ? x.sentido : 'mediano'],
        sentido: isSentido(x.sentido) ? x.sentido : 'mediano',
      };
    })
    .filter((f): f is FaixaScore => f !== null)
    .sort((a, b) => a.de - b.de);
  const escala: EscalaScore = {
    id: typeof c.id === 'string' && c.id ? c.id : novoId(),
    nome: typeof c.nome === 'string' ? c.nome.trim().slice(0, 60) : '',
    faixas,
  };
  return problemaDaEscala(escala) ? undefined : escala;
}
