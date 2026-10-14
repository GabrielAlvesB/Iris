/**
 * Markdown dos cartões (Kanban e To-do), com o botão "Markdown" ligado. Sem
 * dependência e sem innerHTML: cada pedaço vira um nó com textContent, então
 * um "<script>" no texto aparece como texto. Cobre o que se usa em nota de
 * tarefa — títulos, listas, caixas de marcar, citação, código, negrito,
 * itálico, links — e [[Título]] para ligar a outro card ou checklist.
 */

export interface AlvoDeLink {
  abrir: () => void;
  /** "Card", "Checklist": vai no title do link. */
  tipo: string;
}

export interface OpcoesMarkdown {
  /** [[Título]] → o item com esse título, ou null (o link aparece tracejado). */
  resolver?: (titulo: string) => AlvoDeLink | null;
  /** Clique num [[Título]] que não existe: oferecer criar. */
  aoCriar?: (titulo: string) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Só http(s) e mailto: um "javascript:" num link nunca vira clique. */
function urlSegura(url: string): string | null {
  return /^(https?:\/\/|mailto:)/i.test(url.trim()) ? url.trim() : null;
}

function linkExterno(texto: string, url: string): HTMLElement {
  const a = el('a', 'mdk-link', texto);
  a.href = url;
  a.title = url;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    window.irisAPI.system.openExternalLink(url);
  });
  return a;
}

/** Ordem importa: código antes de tudo (nada se interpreta dentro dele). */
const INLINE = /(`[^`\n]+`)|(\[\[[^\]\n]+\]\])|(\[[^\]\n]+\]\([^)\s]+\))|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)|(https?:\/\/[^\s<>()]+)/g;

function inline(texto: string, op: OpcoesMarkdown, destino: HTMLElement): void {
  let ultimo = 0;
  for (const m of texto.matchAll(INLINE)) {
    const i = m.index ?? 0;
    if (i > ultimo) destino.appendChild(document.createTextNode(texto.slice(ultimo, i)));
    const t = m[0];
    if (m[1]) {
      destino.appendChild(el('code', 'mdk-code', t.slice(1, -1)));
    } else if (m[2]) {
      const titulo = t.slice(2, -2).trim();
      const alvo = op.resolver?.(titulo) ?? null;
      const b = el('button', `mdk-wiki${alvo ? '' : ' is-sem-alvo'}`, titulo);
      b.type = 'button';
      b.title = alvo ? `Abrir ${alvo.tipo.toLowerCase()} “${titulo}”` : `Ainda não existe nada com o título “${titulo}”${op.aoCriar ? ' — clique para criar' : ''}`;
      b.addEventListener('click', () => (alvo ? alvo.abrir() : op.aoCriar?.(titulo)));
      destino.appendChild(b);
    } else if (m[3]) {
      const fim = t.indexOf('](');
      const rotulo = t.slice(1, fim);
      const url = urlSegura(t.slice(fim + 2, -1));
      destino.appendChild(url ? linkExterno(rotulo, url) : document.createTextNode(t));
    } else if (m[4]) {
      const forte = el('strong');
      inline(t.slice(2, -2), op, forte);
      destino.appendChild(forte);
    } else if (m[5]) {
      const em = el('em');
      inline(t.slice(1, -1), op, em);
      destino.appendChild(em);
    } else if (m[6]) {
      // Pontuação colada no fim ("veja https://x.com.") não faz parte do link.
      const limpo = t.replace(/[.,;:!?]+$/, '');
      destino.appendChild(linkExterno(limpo, limpo));
      if (limpo.length < t.length) destino.appendChild(document.createTextNode(t.slice(limpo.length)));
    }
    ultimo = i + t.length;
  }
  if (ultimo < texto.length) destino.appendChild(document.createTextNode(texto.slice(ultimo)));
}

export function renderMarkdown(texto: string, op: OpcoesMarkdown = {}): HTMLElement {
  const raiz = el('div', 'mdk');
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n');
  let lista: HTMLElement | null = null;
  let tipoLista = '';
  let paragrafo: string[] = [];

  const fecharParagrafo = (): void => {
    if (!paragrafo.length) return;
    const p = el('p');
    paragrafo.forEach((l, i) => {
      if (i) p.appendChild(el('br'));
      inline(l, op, p);
    });
    raiz.appendChild(p);
    paragrafo = [];
  };
  const fecharLista = (): void => {
    lista = null;
    tipoLista = '';
  };
  const garantirLista = (tipo: 'ul' | 'ol' | 'tarefas'): HTMLElement => {
    if (!lista || tipoLista !== tipo) {
      fecharParagrafo();
      lista = el(tipo === 'ol' ? 'ol' : 'ul', tipo === 'tarefas' ? 'mdk-tarefas' : undefined);
      tipoLista = tipo;
      raiz.appendChild(lista);
    }
    return lista;
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]!;
    if (/^```/.test(linha.trim())) {
      fecharParagrafo();
      fecharLista();
      const bloco: string[] = [];
      for (i++; i < linhas.length && !/^```/.test(linhas[i]!.trim()); i++) bloco.push(linhas[i]!);
      const pre = el('pre', 'mdk-pre');
      pre.appendChild(el('code', undefined, bloco.join('\n')));
      raiz.appendChild(pre);
      continue;
    }
    if (!linha.trim()) {
      fecharParagrafo();
      fecharLista();
      continue;
    }
    const titulo = /^(#{1,3})\s+(.*)$/.exec(linha);
    if (titulo) {
      fecharParagrafo();
      fecharLista();
      const h = el(titulo[1]!.length === 1 ? 'h3' : titulo[1]!.length === 2 ? 'h4' : 'h5', 'mdk-titulo');
      inline(titulo[2]!, op, h);
      raiz.appendChild(h);
      continue;
    }
    const tarefa = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(linha);
    if (tarefa) {
      const li = el('li', tarefa[1] === ' ' ? undefined : 'is-feita');
      const caixa = el('input');
      caixa.type = 'checkbox';
      caixa.checked = tarefa[1] !== ' ';
      // Só mostra: marcar se faz editando o texto (ou nas subtarefas do card).
      caixa.disabled = true;
      li.appendChild(caixa);
      const span = el('span');
      inline(tarefa[2]!, op, span);
      li.appendChild(span);
      garantirLista('tarefas').appendChild(li);
      continue;
    }
    const marcador = /^\s*[-*]\s+(.*)$/.exec(linha);
    if (marcador) {
      const li = el('li');
      inline(marcador[1]!, op, li);
      garantirLista('ul').appendChild(li);
      continue;
    }
    const numero = /^\s*\d+[.)]\s+(.*)$/.exec(linha);
    if (numero) {
      const li = el('li');
      inline(numero[1]!, op, li);
      garantirLista('ol').appendChild(li);
      continue;
    }
    const citacao = /^>\s?(.*)$/.exec(linha);
    if (citacao) {
      fecharParagrafo();
      fecharLista();
      const q = el('blockquote', 'mdk-citacao');
      inline(citacao[1]!, op, q);
      raiz.appendChild(q);
      continue;
    }
    fecharLista();
    paragrafo.push(linha);
  }
  fecharParagrafo();
  return raiz;
}
