/**
 * Combinações de teclas dos atalhos. Puro e dos dois lados: o main valida as
 * trocas do usuário ao gravar o ajustes.json, a tela lê o teclado e desenha as
 * teclas pelas mesmas regras.
 *
 * Formato em texto, sempre com "Ctrl" (nunca "⌘"): modificadores na ordem
 * Ctrl, Alt, Shift e a tecla no fim, separados por "+" — "Ctrl+P", "Shift+?",
 * "Alt+Left", "F1". Uma sequência são dois passos separados por espaço: "G K"
 * (aperta G, solta, aperta K).
 */

export type Combo = string;

const MODIFICADORES = ['Ctrl', 'Alt', 'Shift'] as const;

/** Teclas com nome; o resto é um caractere só (letra maiúscula, dígito ou símbolo). */
const TECLAS_NOMEADAS = new Set([
  'Enter',
  'Esc',
  'Space',
  'Tab',
  'Backspace',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Left',
  'Right',
  'Up',
  'Down',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]);

/**
 * Não podem virar atalho: edição de texto, e as do menu padrão do Electron
 * (recarregar, fechar a janela, ferramentas do desenvolvedor, zoom, tela cheia).
 * Esc, Enter e Tab também — são de toda tela e de todo campo.
 */
export const TECLAS_RESERVADAS: ReadonlySet<Combo> = new Set([
  'Ctrl+C',
  'Ctrl+V',
  'Ctrl+X',
  'Ctrl+Z',
  'Ctrl+Y',
  'Ctrl+A',
  'Ctrl+Shift+Z',
  'Ctrl+R',
  'Ctrl+Shift+R',
  'Ctrl+W',
  'Ctrl+Shift+I',
  'Ctrl+0',
  'Ctrl+=',
  'Ctrl+-',
  'Ctrl+Shift+=',
  'F5',
  'F11',
  'Esc',
  'Enter',
  'Tab',
  'Shift+Tab',
  'Space',
  'Backspace',
]);

/** Um passo normalizado ("ctrl+shift+k" → "Ctrl+Shift+K"), ou null se não for válido. */
function normalizarPasso(passo: string): string | null {
  const partes = passo.split('+').map((p) => p.trim());
  // "Ctrl++" (a tecla é o próprio "+"): o split deixa duas partes vazias no fim.
  if (partes.length >= 2 && partes[partes.length - 1] === '' && partes[partes.length - 2] === '') {
    partes.splice(-2, 2, '+');
  }
  const tecla = partes.pop();
  if (!tecla) return null;
  const mods = new Set<string>();
  for (const p of partes) {
    const m = MODIFICADORES.find((x) => x.toLowerCase() === p.toLowerCase());
    if (!m || mods.has(m)) return null;
    mods.add(m);
  }
  const nomeada = [...TECLAS_NOMEADAS].find((t) => t.toLowerCase() === tecla.toLowerCase());
  const final = nomeada ?? ([...tecla].length === 1 ? tecla.toUpperCase() : null);
  if (!final) return null;
  return [...MODIFICADORES.filter((m) => mods.has(m)), final].join('+');
}

/** Combinação normalizada, ou null. '' é válido: quer dizer "sem atalho". */
export function normalizarCombo(texto: unknown): Combo | null {
  if (typeof texto !== 'string') return null;
  const limpo = texto.trim();
  if (!limpo) return '';
  const passos = limpo.split(/\s+/);
  if (passos.length > 2) return null;
  const normalizados = passos.map(normalizarPasso);
  if (normalizados.some((p) => p === null)) return null;
  return normalizados.join(' ');
}

/** Passo com Ctrl ou Alt, ou tecla de função: vale mesmo com o foco num campo de texto. */
export function passoFuncionaDigitando(passo: string): boolean {
  return /(^|\+)(Ctrl|Alt)\+/.test(passo) || /^F\d{1,2}$/.test(passo.split('+').pop() ?? '');
}

/** Ids de ação gravados no arquivo: minúsculas, dígitos, ponto e hífen. */
export function isIdAtalho(v: unknown): v is string {
  return typeof v === 'string' && /^[a-z0-9][a-z0-9.-]{0,59}$/.test(v);
}

export const MAX_TROCAS_ATALHOS = 300;
