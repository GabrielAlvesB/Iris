import { descritorProvedor, rotuloDoStatus, type MensagemWa, type StatusMensagemWa } from '../../../shared/types/whatsapp.types.js';
import { svg } from '../../ui/pagina.js';

/**
 * Peças visuais do WhatsApp usadas pela conversa da ficha e pelo módulo:
 * a formatação do WhatsApp, a bolha e o selo de situação. Conteúdo do
 * usuário entra sempre por textContent.
 */

export const ICONES_WA = {
  whatsapp: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 10c.5 2 2.5 4 5 5l1.5-1.5 2 1-1 2c-3.5 0-8.5-5-8.5-8.5l2-1 1 2z"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  modelo: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/>',
  campo: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  um: '<polyline points="20 6 9 17 4 12"/>',
  dois: '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  alerta: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  externo: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  sincronizar: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  lixeira: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  conexao: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  lote: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  conversas: '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
} as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// ---------- Formatação do WhatsApp ----------

/**
 * *negrito*, _itálico_, ~riscado~, `código` e ```bloco``` como o WhatsApp
 * mostra: o marcador precisa encostar no texto (`* oi *` não formata) e não
 * atravessa linha. A prévia usa isto para mostrar o que o contato vai ver.
 */
const PADRAO_FORMATO = /```([\s\S]+?)```|`([^`\n]+)`|(?<![\p{L}\p{N}])\*(\S(?:[^*\n]*\S)?)\*(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])_(\S(?:[^_\n]*\S)?)_(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])~(\S(?:[^~\n]*\S)?)~(?![\p{L}\p{N}])/gu;

export function formatarWa(texto: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  let ultimo = 0;
  for (const m of texto.matchAll(PADRAO_FORMATO)) {
    if (m.index! > ultimo) frag.appendChild(document.createTextNode(texto.slice(ultimo, m.index)));
    const [, bloco, codigo, negrito, italico, riscado] = m;
    if (bloco !== undefined) frag.appendChild(el('code', 'wa-mono is-bloco', bloco));
    else if (codigo !== undefined) frag.appendChild(el('code', 'wa-mono', codigo));
    else if (negrito !== undefined) frag.appendChild(el('strong', undefined, negrito));
    else if (italico !== undefined) frag.appendChild(el('em', undefined, italico));
    else if (riscado !== undefined) frag.appendChild(el('s', undefined, riscado));
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < texto.length) frag.appendChild(document.createTextNode(texto.slice(ultimo)));
  return frag;
}

export function temFormatacao(texto: string): boolean {
  PADRAO_FORMATO.lastIndex = 0;
  return PADRAO_FORMATO.test(texto);
}

// ---------- Situação ----------

const ICONE_DO_STATUS: Record<StatusMensagemWa, string> = {
  'na-fila': ICONES_WA.relogio,
  enviando: ICONES_WA.relogio,
  enviada: ICONES_WA.um,
  entregue: ICONES_WA.dois,
  lida: ICONES_WA.dois,
  falhou: ICONES_WA.alerta,
  'aberta-no-whatsapp': ICONES_WA.externo,
  recebida: '',
};

/** "14:32" no relógio local. */
export function horaDaMensagem(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "AAAA-MM-DD" local de um ISO. */
export function diaDaMensagem(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ícone + texto (a situação nunca é dita só pela cor ou só pelo ícone). */
export function buildStatus(m: MensagemWa): HTMLElement {
  const s = el('span', `wa-status is-${m.status}`);
  const icone = ICONE_DO_STATUS[m.status];
  if (icone) s.innerHTML = svg(icone, 13, 2.2);
  const rotulo = m.status === 'aberta-no-whatsapp' ? 'Aberta no WhatsApp do PC — o envio é confirmado lá' : rotuloDoStatus(m.status);
  s.title = `${rotulo} · ${descritorProvedor(m.provedor).rotulo}${m.erro ? `\n${m.erro}` : ''}`;
  s.setAttribute('aria-label', rotulo);
  return s;
}

export interface AcoesBolha {
  reenviar?: (m: MensagemWa) => void;
  tirar?: (m: MensagemWa) => void;
}

export function buildBolha(m: MensagemWa, acoes: AcoesBolha = {}): HTMLElement {
  const linha = el('div', `wa-linha is-${m.direcao}`);
  const bolha = el('article', `wa-bolha is-${m.direcao} is-${m.status}`);
  if (m.modelo) bolha.appendChild(el('span', 'wa-bolha-modelo', `Modelo: ${m.modelo.nome}${m.modelo.template ? ' (Meta)' : ''}`));
  const texto = el('p', 'wa-bolha-texto');
  texto.appendChild(formatarWa(m.texto));
  bolha.appendChild(texto);
  const rodape = el('div', 'wa-bolha-rodape');
  rodape.appendChild(el('span', 'wa-bolha-hora', horaDaMensagem(m.criadaEm)));
  if (m.direcao === 'saida') rodape.appendChild(buildStatus(m));
  bolha.appendChild(rodape);

  if (m.status === 'falhou') {
    const falha = el('div', 'wa-falha');
    falha.appendChild(el('p', undefined, m.erro ?? 'Não saiu.'));
    const botoes = el('div', 'wa-falha-acoes');
    if (acoes.reenviar && !m.modelo?.template) {
      const b = el('button', 'wa-falha-botao', 'Tentar de novo');
      b.type = 'button';
      b.addEventListener('click', () => {
        b.disabled = true;
        acoes.reenviar!(m);
      });
      botoes.appendChild(b);
    }
    if (acoes.tirar) {
      const b = el('button', 'wa-falha-botao is-fantasma', 'Tirar da conversa');
      b.type = 'button';
      b.addEventListener('click', () => acoes.tirar!(m));
      botoes.appendChild(b);
    }
    falha.appendChild(botoes);
    bolha.appendChild(falha);
  } else if (m.status === 'aberta-no-whatsapp') {
    bolha.appendChild(el('p', 'wa-bolha-nota', 'Aberta no WhatsApp do computador. Se você apertou Enter lá, ela saiu.'));
  }

  // Copiar o texto exato (o que saiu, sem a formatação desenhada).
  const copiar = el('button', 'wa-bolha-copiar');
  copiar.type = 'button';
  copiar.title = 'Copiar o texto';
  copiar.setAttribute('aria-label', 'Copiar o texto');
  copiar.innerHTML = svg(ICONES_WA.copiar, 12);
  copiar.addEventListener('click', () => window.irisAPI.system.copyToClipboard(m.texto));
  bolha.appendChild(copiar);

  linha.appendChild(bolha);
  return linha;
}
