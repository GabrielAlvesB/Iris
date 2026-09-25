/**
 * Markdown mínimo para roteiros, montado em DOM (todo texto entra por
 * textContent — nada de innerHTML com conteúdo do usuário).
 *
 * Cobre o que um roteiro usa: títulos (#, ##, ###), seções com tempo
 * ("## [0:00 - 0:50] Abertura"), **negrito**, *itálico*, `código`, listas,
 * listas numeradas, citação (>), separador (---) e notas de cena — linha
 * inteira entre colchetes, com ou sem negrito ("**[Cenas rápidas…]**").
 */

export interface SecaoRoteiro {
  /** "0:00 - 0:50", quando o título traz o tempo entre colchetes. */
  tempo?: string;
  titulo: string;
  nivel: number;
  /** Âncora do título na prévia. */
  ancora: string;
  /** Linha (0-based) do título no texto — para levar o cursor até ela. */
  linha: number;
}

const TITULO = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const TEMPO_NO_TITULO = /^\[([^\]]+)\]\s*(.*)$/;
const SEPARADOR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const ITEM_LISTA = /^\s*[-*•]\s+/;
const ITEM_NUMERO = /^\s*\d+[.)]\s+/;
const CITACAO = /^\s*>\s?/;
// Linha inteira de direção: [..] ou **[..]** ou _[..]_
const CENA = /^\s*(\*\*|__|\*|_)?\[(.+)\]\1?\s*$/;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** **negrito**, *itálico* / _itálico_ e `código`, sem aninhamento. */
function inline(destino: HTMLElement, texto: string): void {
  const partes = texto.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g);
  partes.forEach((p) => {
    if (!p) return;
    if (/^(\*\*|__).+\1$/.test(p)) destino.appendChild(el('strong', undefined, p.slice(2, -2)));
    else if (/^`.+`$/.test(p)) destino.appendChild(el('code', undefined, p.slice(1, -1)));
    else if (/^([*_]).+\1$/.test(p)) destino.appendChild(el('em', undefined, p.slice(1, -1)));
    else destino.append(p);
  });
}

function ancoraDe(indice: number): string {
  return `rot-secao-${indice}`;
}

function lerTitulo(bruto: string): { tempo?: string; titulo: string } {
  const semNegrito = bruto.replace(/^\*\*(.+)\*\*$/, '$1');
  const comTempo = TEMPO_NO_TITULO.exec(semNegrito);
  if (comTempo && /\d/.test(comTempo[1]!)) return { tempo: comTempo[1]!.trim(), titulo: comTempo[2]!.trim() };
  return { titulo: semNegrito };
}

/** Os títulos do roteiro, na ordem — para o índice ao lado da prévia. */
export function secoesDoRoteiro(texto: string): SecaoRoteiro[] {
  const secoes: SecaoRoteiro[] = [];
  texto.split('\n').forEach((linha, i) => {
    const m = TITULO.exec(linha);
    if (!m) return;
    const { tempo, titulo } = lerTitulo(m[2]!);
    secoes.push({ tempo, titulo, nivel: m[1]!.length, ancora: ancoraDe(secoes.length), linha: i });
  });
  return secoes;
}

/** Primeiro título "# …" do texto — vira o título do roteiro quando ele é colado inteiro. */
export function tituloDoTexto(texto: string): string | undefined {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(texto);
  return m?.[1]?.replace(/^\*\*(.+)\*\*$/, '$1').trim() || undefined;
}

/** "**Duração estimada:** 12 a 15 minutos" → "12 a 15 minutos". */
export function duracaoDoTexto(texto: string): string | undefined {
  const m = /^\W*dura[cç][aã]o[^:]*:\W*\s*(.+)$/im.exec(texto);
  return m?.[1]?.replace(/\*+/g, '').trim().slice(0, 40) || undefined;
}

/**
 * Só o que é falado: sem títulos, notas de cena, separadores, marcação e a
 * parte de fontes/referências do fim. Base da estimativa de tempo de fala.
 */
export function textoFalado(texto: string): string {
  const linhas: string[] = [];
  for (const linha of texto.split('\n')) {
    const titulo = TITULO.exec(linha);
    if (titulo && /^(fontes|refer[eê]ncias)\b/i.test(lerTitulo(titulo[2]!).titulo)) break;
    if (titulo || CENA.test(linha) || SEPARADOR.test(linha)) continue;
    // Rótulos de quem fala ("NARRAÇÃO:") também não são lidos em voz alta.
    if (/^\s*\*{0,2}[A-ZÇÃÕÁÉÍÓÚÂÊÔ ]{3,}:\*{0,2}\s*$/.test(linha)) continue;
    // Linhas de ficha ("**Duração estimada:** 12 min", "**Tom:** direto") descrevem o vídeo, não são fala.
    if (/^\s*\*\*[^*]{1,40}:\*\*/.test(linha)) continue;
    linhas.push(linha.replace(/[*_`>#]/g, ''));
  }
  return linhas.join(' ');
}

/**
 * Monta o roteiro. `ignorarTitulo`: um "# título" igual ao título do roteiro
 * não é repetido (a folha já mostra o título no cabeçalho).
 */
export function renderMarkdown(texto: string, ignorarTitulo?: string): HTMLElement {
  const raiz = el('div', 'rot-md');
  const linhas = texto.replace(/\r\n/g, '\n').split('\n');
  let par: HTMLElement | null = null;
  let lista: HTMLElement | null = null;
  let citacao: HTMLElement | null = null;
  let secao = 0;
  const normal = (t: string): string => t.trim().toLocaleLowerCase('pt-BR');

  const fecharBlocos = (): void => {
    par = null;
    lista = null;
    citacao = null;
  };

  linhas.forEach((linha) => {
    if (!linha.trim()) {
      fecharBlocos();
      return;
    }

    const titulo = TITULO.exec(linha);
    if (titulo) {
      fecharBlocos();
      const nivel = titulo[1]!.length;
      const { tempo, titulo: texto } = lerTitulo(titulo[2]!);
      const ancora = ancoraDe(secao++);
      if (nivel === 1 && ignorarTitulo && normal(texto) === normal(ignorarTitulo)) return;
      const h = el(nivel === 1 ? 'h1' : nivel === 2 ? 'h2' : 'h3', 'rot-md-titulo');
      h.id = ancora;
      if (tempo) h.appendChild(el('span', 'rot-md-tempo', tempo));
      const rotulo = el('span');
      inline(rotulo, texto);
      h.appendChild(rotulo);
      raiz.appendChild(h);
      return;
    }

    if (SEPARADOR.test(linha)) {
      fecharBlocos();
      raiz.appendChild(el('hr', 'rot-md-separador'));
      return;
    }

    const cena = CENA.exec(linha);
    if (cena) {
      fecharBlocos();
      const nota = el('p', 'rot-md-cena');
      inline(nota, cena[2]!);
      raiz.appendChild(nota);
      return;
    }

    if (CITACAO.test(linha)) {
      par = null;
      lista = null;
      if (!citacao) {
        citacao = el('blockquote', 'rot-md-citacao');
        raiz.appendChild(citacao);
      }
      const p = el('p');
      inline(p, linha.replace(CITACAO, ''));
      citacao.appendChild(p);
      return;
    }

    const tipoLista = ITEM_LISTA.test(linha) ? 'ul' : ITEM_NUMERO.test(linha) ? 'ol' : null;
    if (tipoLista) {
      par = null;
      citacao = null;
      if (!lista || lista.tagName.toLowerCase() !== tipoLista) {
        lista = el(tipoLista);
        // Lista numerada que começa em outro número ("3. …") mantém a numeração.
        const inicio = Number(/^\s*(\d+)/.exec(linha)?.[1]);
        if (tipoLista === 'ol' && inicio > 1) (lista as HTMLOListElement).start = inicio;
        raiz.appendChild(lista);
      }
      const li = el('li');
      inline(li, linha.replace(tipoLista === 'ul' ? ITEM_LISTA : ITEM_NUMERO, ''));
      lista.appendChild(li);
      return;
    }

    lista = null;
    citacao = null;
    if (par) par.appendChild(document.createElement('br'));
    else {
      par = el('p');
      raiz.appendChild(par);
    }
    inline(par, linha.trim());
  });

  return raiz;
}
