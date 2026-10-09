import type { AssinaturaRelatorio } from '../../shared/types/ajustes.types.js';

/**
 * Peças de documento de papel (relatório, ficha de contato, contrato): o mesmo
 * texto formatado e a mesma assinatura em todo PDF do app. As classes `rd-`
 * são a família visual desses documentos (relatorios.css).
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** `**trecho**` vira negrito; o resto entra como texto puro. */
function comNegrito(destino: HTMLElement, linha: string): void {
  linha.split(/(\*\*[^*]+\*\*)/g).forEach((parte) => {
    if (/^\*\*[^*]+\*\*$/.test(parte)) destino.appendChild(el('strong', undefined, parte.slice(2, -2)));
    else if (parte) destino.append(parte);
  });
}

const MARCADOR_LISTA = /^\s*[-•*]\s+/;
const MARCADOR_NUMERO = /^\s*\d+[.)]\s+/;
const MARCADOR_TITULO = /^(#{1,2})\s+/;

export interface OpcoesParagrafos {
  /**
   * `# Título` e `## Subtítulo` viram títulos — para contratos (cláusulas). Nos
   * relatórios fica desligado: um "#" escrito lá continua sendo texto.
   */
  titulos?: boolean;
}

/**
 * Texto livre em parágrafos, sem innerHTML. Uma formatação mínima, que se
 * escreve sem barra de ferramentas: linhas com "- " viram lista, "1. " lista
 * numerada, e **trecho** fica em negrito.
 */
export function paragrafos(texto: string, classe = 'rd-texto', opcoes: OpcoesParagrafos = {}): HTMLElement {
  const wrap = el('div', classe);
  texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((p) => {
      let par: HTMLElement | null = null;
      let lista: HTMLElement | null = null;
      p.split('\n').forEach((linha) => {
        const titulo = opcoes.titulos ? MARCADOR_TITULO.exec(linha) : null;
        if (titulo) {
          par = null;
          lista = null;
          const h = el(titulo[1] === '#' ? 'h2' : 'h3', titulo[1] === '#' ? 'rd-texto-titulo' : 'rd-texto-subtitulo');
          comNegrito(h, linha.replace(MARCADOR_TITULO, ''));
          wrap.appendChild(h);
          return;
        }
        const marcador = MARCADOR_LISTA.test(linha) ? 'ul' : MARCADOR_NUMERO.test(linha) ? 'ol' : null;
        if (marcador) {
          par = null;
          if (!lista || lista.tagName.toLowerCase() !== marcador) {
            lista = el(marcador);
            wrap.appendChild(lista);
          }
          const li = el('li');
          comNegrito(li, linha.replace(marcador === 'ul' ? MARCADOR_LISTA : MARCADOR_NUMERO, ''));
          lista.appendChild(li);
          return;
        }
        lista = null;
        if (par) par.appendChild(document.createElement('br'));
        else {
          par = el('p');
          wrap.appendChild(par);
        }
        comNegrito(par, linha);
      });
    });
  return wrap;
}

/** "8 de outubro de 2026" a partir de um ISO (data e hora). */
export function dataPorExtenso(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * O único lugar que desenha a assinatura. Nome, linhas e formato vêm dos
 * Ajustes: mudar a identificação não mexe em nenhum gerador.
 */
export function buildAssinatura(assinatura: AssinaturaRelatorio, dataEmissao = new Date().toISOString()): HTMLElement | null {
  if (!assinatura.nome.trim()) return null;
  const bloco = el('footer', `rd-assinatura is-${assinatura.formato}`);
  if (assinatura.formato === 'com-linha') bloco.appendChild(el('span', 'rd-assinatura-linha'));
  bloco.appendChild(el('strong', 'rd-assinatura-nome', assinatura.nome));
  assinatura.linhas.forEach((linha) => bloco.appendChild(el('span', 'rd-assinatura-texto', linha)));
  if (assinatura.mostrarData) bloco.appendChild(el('span', 'rd-assinatura-data', `Emitido em ${dataPorExtenso(dataEmissao)}`));
  return bloco;
}
