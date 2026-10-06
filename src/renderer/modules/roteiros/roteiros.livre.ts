import { cenasDoMarkdown, markdownDasCenas } from '../../../shared/types/roteiros.conversao.js';
import { textarea } from '../../ui/campos.js';
import type { CtxEstudio } from './roteiros.comum.js';

/**
 * Texto livre: o roteiro inteiro em markdown, para quem prefere escrever de
 * uma vez. É só outra forma de ver as cenas — parar de digitar (ou sair do
 * modo) lê o texto de volta para cenas, mantendo id e tipo das que não
 * mudaram de título.
 */

const DICA =
  '## [0:00 - 0:45] Título da cena · [Cena: o que se vê] · [Texto na tela: letreiro] · a fala em parágrafos · > Nota: lembrete · **negrito**';

let pendente: (() => void) | null = null;

/** Lê o texto pendente agora (troca de modo, fechar o Estúdio). */
export function descarregarLivre(): void {
  pendente?.();
}

function inserir(area: HTMLTextAreaElement, antes: string, depois = '', seVazio = ''): void {
  const { selectionStart: ini, selectionEnd: fim, value } = area;
  const selecionado = value.slice(ini, fim) || seVazio;
  area.focus();
  area.setRangeText(`${antes}${selecionado}${depois}`, ini, fim, 'end');
  if (ini === fim && seVazio) area.setSelectionRange(ini + antes.length, ini + antes.length + seVazio.length);
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

function quebraAntes(area: HTMLTextAreaElement): string {
  const ini = area.selectionStart;
  if (ini === 0) return '';
  return area.value.slice(Math.max(0, ini - 2), ini).endsWith('\n\n') ? '' : area.value[ini - 1] === '\n' ? '\n' : '\n\n';
}

export function buildLivre(ctx: CtxEstudio): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rte-livre';
  const area = textarea(markdownDasCenas({ titulo: ctx.r.titulo, cenas: ctx.r.cenas }, false), '## [0:00 - 0:05] Gancho\n[Cena: …]\n\nA primeira frase…', 30);
  area.className = 'md-input md-textarea rte-livre-texto';
  area.spellcheck = true;
  area.setAttribute('aria-label', 'Roteiro em texto livre');

  let timer: ReturnType<typeof setTimeout> | null = null;
  const ler = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendente = null;
    const leitura = cenasDoMarkdown(area.value, () => crypto.randomUUID(), ctx.r.cenas);
    ctx.r.cenas = leitura.cenas;
    // "## Fontes" escrito aqui entra na Pesquisa, sem repetir as que já estão lá.
    leitura.fontes.forEach((f) => {
      if (!ctx.r.pesquisa.fontes.some((x) => x.titulo === f.titulo && x.url === f.url)) ctx.r.pesquisa.fontes.push(f);
    });
    ctx.digitou();
  };
  area.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    pendente = ler;
    timer = setTimeout(ler, 1200);
  });
  area.addEventListener('blur', () => pendente?.());

  const barra = document.createElement('div');
  barra.className = 'rot-barra rte-livre-barra';
  const botao = (rotulo: string, titulo: string, acao: () => void): void => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rot-barra-btn';
    b.textContent = rotulo;
    b.title = titulo;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', acao);
    barra.appendChild(b);
  };
  botao('Cena nova', 'Nova cena com tempo', () => inserir(area, `${quebraAntes(area)}## [0:00 - 0:00] `, '\n\n', 'Título da cena'));
  botao('Visual', 'O que aparece (vai para Visual / B-roll)', () => inserir(area, `${quebraAntes(area)}[Cena: `, ']\n', 'o que se vê'));
  botao('Na tela', 'Letreiro (vai para Texto na tela)', () => inserir(area, `${quebraAntes(area)}[Texto na tela: `, ']\n', 'letreiro'));
  botao('Nota', 'Nota de produção', () => inserir(area, `${quebraAntes(area)}> Nota: `, '\n', 'lembrete'));
  botao('B', 'Negrito (seleção)', () => inserir(area, '**', '**', 'texto'));

  // Arquivo lido no próprio renderer: nada de caminho nem disco no main.
  const arquivo = document.createElement('input');
  arquivo.type = 'file';
  arquivo.accept = '.md,.markdown,.txt';
  arquivo.hidden = true;
  arquivo.addEventListener('change', () => {
    const f = arquivo.files?.[0];
    if (!f) return;
    void f.text().then((conteudo) => {
      if (!area.value.trim()) area.value = conteudo;
      else area.setRangeText(`${quebraAntes(area)}${conteudo}`, area.selectionStart, area.selectionEnd, 'end');
      area.dispatchEvent(new Event('input', { bubbles: true }));
      arquivo.value = '';
    });
  });
  botao('Abrir .md', 'Trazer o texto de um arquivo .md ou .txt', () => arquivo.click());
  barra.appendChild(arquivo);

  wrap.append(barra, area, Object.assign(document.createElement('p'), { className: 'md-dica', textContent: DICA }));
  return wrap;
}
