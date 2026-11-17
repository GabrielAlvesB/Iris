/**
 * Canvas: lousa infinita com formas, setas, desenho à mão, texto e notas.
 * Puro (dos dois lados): o main valida com a `migrateForma`, a tela usa as
 * mesmas constantes para desenhar.
 */

export const TIPOS_FORMA = ['retangulo', 'elipse', 'losango', 'triangulo', 'linha', 'seta', 'desenho', 'texto', 'nota'] as const;
export type TipoForma = (typeof TIPOS_FORMA)[number];

/** Formas com área (caixa): podem ter texto dentro e receber ponta de seta. */
export const FORMAS_DE_CAIXA: readonly TipoForma[] = ['retangulo', 'elipse', 'losango', 'triangulo', 'texto', 'nota'];

/**
 * Paleta fixa (é o desenho do usuário, como a cor de um post-it). A "tinta" é a
 * cor do texto do tema: preta no claro, clara no escuro — senão o traço preto
 * some no fundo escuro.
 */
export const CORES_CANVAS = ['tinta', 'cinza', 'vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'violeta', 'rosa'] as const;
export type CorCanvas = (typeof CORES_CANVAS)[number];

/** As cores para exportar (fundo branco) — no app elas vêm do canvas.css, uma por tema. */
export const HEX_CANVAS_CLARO: Record<CorCanvas, string> = {
  tinta: '#1d1d1f',
  cinza: '#8a8f98',
  vermelho: '#e03131',
  laranja: '#f76707',
  amarelo: '#f2b705',
  verde: '#2f9e44',
  azul: '#1c7ed6',
  violeta: '#7048e8',
  rosa: '#d6336c',
};

/** Fundo das notas: tons pastel fixos (texto sempre escuro por cima). */
export const NOTA_CANVAS: Record<CorCanvas, string> = {
  tinta: '#fff3a3',
  cinza: '#e9ecef',
  vermelho: '#ffc9c9',
  laranja: '#ffd8a8',
  amarelo: '#fff3a3',
  verde: '#c3fae8',
  azul: '#bfdbfe',
  violeta: '#d0bfff',
  rosa: '#fcc2d7',
};

export type Preenchimento = 'nenhum' | 'suave' | 'solido';
export type Traco = 'fino' | 'medio' | 'grosso';
export type Tracejado = 'solido' | 'tracejado' | 'pontilhado';
export type TamanhoTexto = 'p' | 'm' | 'g' | 'gg';

export const LARGURA_TRACO: Record<Traco, number> = { fino: 2, medio: 3.5, grosso: 6 };
export const TAMANHO_FONTE: Record<TamanhoTexto, number> = { p: 16, m: 22, g: 30, gg: 44 };

export interface EstiloForma {
  cor: CorCanvas;
  preenchimento: Preenchimento;
  traco: Traco;
  tracejado: Tracejado;
  tamanhoTexto: TamanhoTexto;
}

export const ESTILO_PADRAO: EstiloForma = {
  cor: 'tinta',
  preenchimento: 'nenhum',
  traco: 'medio',
  tracejado: 'solido',
  tamanhoTexto: 'm',
};

export interface FormaCanvas {
  id: string;
  tipo: TipoForma;
  /** Caixa no mundo (sem rotação). Linha e seta: a caixa dos dois pontos (derivada). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Graus, em torno do centro. Linha, seta e desenho não giram. */
  rotacao: number;
  estilo: EstiloForma;
  /** Formas de caixa, texto e nota. */
  texto?: string;
  /**
   * Desenho: pontos relativos ao canto (x, y), na escala de w×h.
   * Linha e seta: os dois pontos, em coordenadas do mundo.
   */
  pontos?: Array<[number, number]>;
  /** Seta: pontas em cada extremo (a padrão é só no fim). */
  pontaInicio?: boolean;
  pontaFim?: boolean;
  /** Seta/linha presa a uma forma de caixa: acompanha quando a forma se move. */
  ligacoes?: { inicio?: string; fim?: string };
  updatedAt: string;
}

export interface ViewportCanvas {
  x: number;
  y: number;
  zoom: number;
}

export interface QuadroCanvas {
  id: string;
  nome: string;
  createdAt: string;
  updatedAt: string;
  viewport: ViewportCanvas;
  /** A ordem da lista é a ordem de desenho: a última fica por cima. */
  formas: FormaCanvas[];
}

export interface CanvasFile {
  schemaVersion: number;
  updatedAt: string;
  quadros: QuadroCanvas[];
  quadroAtivoId?: string;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
export const MAX_FORMAS = 5000;
export const MAX_PONTOS_DESENHO = 4000;
export const MAX_TEXTO_FORMA = 20_000;

// ---------- Validação (o main lê tudo por aqui) ----------

function numero(v: unknown, padrao: number, min = -1e7, max = 1e7): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao;
}

function umDe<T extends string>(v: unknown, lista: readonly T[], padrao: T): T {
  return typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : padrao;
}

export function migrateEstilo(raw: unknown): EstiloForma {
  const e = (raw ?? {}) as Partial<EstiloForma>;
  return {
    cor: umDe(e.cor, CORES_CANVAS, ESTILO_PADRAO.cor),
    preenchimento: umDe(e.preenchimento, ['nenhum', 'suave', 'solido'] as const, ESTILO_PADRAO.preenchimento),
    traco: umDe(e.traco, ['fino', 'medio', 'grosso'] as const, ESTILO_PADRAO.traco),
    tracejado: umDe(e.tracejado, ['solido', 'tracejado', 'pontilhado'] as const, ESTILO_PADRAO.tracejado),
    tamanhoTexto: umDe(e.tamanhoTexto, ['p', 'm', 'g', 'gg'] as const, ESTILO_PADRAO.tamanhoTexto),
  };
}

function migratePontos(raw: unknown, max: number): Array<[number, number]> {
  if (!Array.isArray(raw)) return [];
  const pontos: Array<[number, number]> = [];
  for (const p of raw) {
    if (pontos.length >= max) break;
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      pontos.push([Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
    }
  }
  return pontos;
}

/** Forma desconhecida ou sem o mínimo (seta sem dois pontos, desenho sem traço) volta null e é descartada. */
export function migrateForma(raw: unknown, agora: string): FormaCanvas | null {
  const f = (raw ?? {}) as Partial<FormaCanvas>;
  if (typeof f.id !== 'string' || !f.id) return null;
  const tipo = umDe<TipoForma | ''>(f.tipo, TIPOS_FORMA, '');
  if (!tipo) return null;
  const forma: FormaCanvas = {
    id: f.id,
    tipo,
    x: numero(f.x, 0),
    y: numero(f.y, 0),
    w: numero(f.w, 100, 1, 1e6),
    h: numero(f.h, 100, 1, 1e6),
    rotacao: tipo === 'linha' || tipo === 'seta' || tipo === 'desenho' ? 0 : ((numero(f.rotacao, 0) % 360) + 360) % 360,
    estilo: migrateEstilo(f.estilo),
    updatedAt: typeof f.updatedAt === 'string' ? f.updatedAt : agora,
  };
  if (FORMAS_DE_CAIXA.includes(tipo) && typeof f.texto === 'string') forma.texto = f.texto.slice(0, MAX_TEXTO_FORMA);
  if (tipo === 'linha' || tipo === 'seta') {
    const pontos = migratePontos(f.pontos, 2);
    if (pontos.length !== 2) return null;
    forma.pontos = pontos;
    if (tipo === 'seta') {
      forma.pontaInicio = f.pontaInicio === true;
      forma.pontaFim = f.pontaFim !== false;
    }
    const lig = (f.ligacoes ?? {}) as { inicio?: unknown; fim?: unknown };
    const ligacoes: { inicio?: string; fim?: string } = {};
    if (typeof lig.inicio === 'string' && lig.inicio) ligacoes.inicio = lig.inicio;
    if (typeof lig.fim === 'string' && lig.fim) ligacoes.fim = lig.fim;
    if (ligacoes.inicio || ligacoes.fim) forma.ligacoes = ligacoes;
    Object.assign(forma, caixaDosPontos(pontos));
  }
  if (tipo === 'desenho') {
    const pontos = migratePontos(f.pontos, MAX_PONTOS_DESENHO);
    if (pontos.length < 1) return null;
    forma.pontos = pontos;
  }
  return forma;
}

export function caixaDosPontos(pontos: Array<[number, number]>): { x: number; y: number; w: number; h: number } {
  const xs = pontos.map((p) => p[0]);
  const ys = pontos.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

export function migrateViewport(raw: unknown): ViewportCanvas {
  const v = (raw ?? {}) as Partial<ViewportCanvas>;
  return { x: numero(v.x, 0), y: numero(v.y, 0), zoom: numero(v.zoom, 1, ZOOM_MIN, ZOOM_MAX) };
}

/** Lê um quadro, tira formas inválidas e ligações para formas que não existem mais. */
export function migrateQuadro(raw: unknown, agora: string): QuadroCanvas | null {
  const q = (raw ?? {}) as Partial<QuadroCanvas>;
  if (typeof q.id !== 'string' || !q.id) return null;
  const vistos = new Set<string>();
  const formas: FormaCanvas[] = [];
  for (const r of Array.isArray(q.formas) ? q.formas : []) {
    if (formas.length >= MAX_FORMAS) break;
    const f = migrateForma(r, agora);
    if (!f || vistos.has(f.id)) continue;
    vistos.add(f.id);
    formas.push(f);
  }
  const deCaixa = new Set(formas.filter((f) => FORMAS_DE_CAIXA.includes(f.tipo)).map((f) => f.id));
  formas.forEach((f) => {
    if (!f.ligacoes) return;
    if (f.ligacoes.inicio && !deCaixa.has(f.ligacoes.inicio)) delete f.ligacoes.inicio;
    if (f.ligacoes.fim && !deCaixa.has(f.ligacoes.fim)) delete f.ligacoes.fim;
    if (!f.ligacoes.inicio && !f.ligacoes.fim) delete f.ligacoes;
  });
  return {
    id: q.id,
    nome: typeof q.nome === 'string' && q.nome.trim() ? q.nome.trim().slice(0, 120) : 'Sem nome',
    createdAt: typeof q.createdAt === 'string' ? q.createdAt : agora,
    updatedAt: typeof q.updatedAt === 'string' ? q.updatedAt : agora,
    viewport: migrateViewport(q.viewport),
    formas,
  };
}

/** Texto de busca de uma forma (para a busca global e a do quadro). */
export function textoDaForma(f: FormaCanvas): string {
  return (f.texto ?? '').trim();
}

// ---------- Entradas do IPC ----------

export interface ExportarImagemCanvasInput {
  formato: 'png' | 'svg';
  nomeSugerido: string;
  /** PNG: data URL base64. SVG: o texto do arquivo. */
  dados: string;
}
