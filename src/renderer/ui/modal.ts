import { buildBotao } from './pagina.js';

/**
 * Todos os modais do Iris saem daqui e têm o mesmo desenho (o dos modais de
 * Postagens): cabeçalho com ícone, título, subtítulo e X; corpo que rola
 * sozinho; ações num rodapé fixo; raio de 16px; centralizados.
 */

export interface ModalFieldOption {
  value: string;
  label: string;
}

export interface ModalFieldSpec {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'date' | 'datetime-local' | 'time' | 'weekdays' | 'url' | 'number' | 'password';
  defaultValue?: string;
  placeholder?: string;
  options?: ModalFieldOption[];
  /** Used by type 'weekdays': short labels for each toggle, in day-index order (0 = Sunday). */
  weekdayLabels?: string[];
  /** Texto de ajuda sob o campo. */
  dica?: string;
  /** Campos seguidos com `metade` dividem a linha em duas colunas. */
  metade?: boolean;
  /** Campos com o mesmo título de seção vão juntos num cartão md-secao. */
  secao?: string;
}

export interface FormModalOptions {
  icone?: string;
  subtitulo?: string;
  largura?: number;
}

type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const DEFAULT_WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export const ICONES_MODAL = {
  editar: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  mais: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  alerta: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  pasta: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  mover: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  texto: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  colunas: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  lixeira: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
} as const;

// ---------- Pilha de camadas ----------

interface Camada {
  el: HTMLElement;
  fechar: () => void;
}

/**
 * Modais e painéis abertos, do mais antigo ao mais novo. Esc e clique fora só
 * valem para o do topo: um prompt aberto de dentro de outro modal fecha sozinho,
 * sem levar o de baixo junto.
 */
const pilha: Camada[] = [];

function onKeyDownGlobal(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  const topo = pilha[pilha.length - 1];
  if (!topo) return;
  e.preventDefault();
  topo.fechar();
}

/** Registra uma camada (modal ou painel). Devolve a função que a tira da pilha. */
export function empilharCamada(el: HTMLElement, fechar: () => void): () => void {
  if (pilha.length === 0) document.addEventListener('keydown', onKeyDownGlobal);
  const camada: Camada = { el, fechar };
  pilha.push(camada);
  return () => {
    const i = pilha.indexOf(camada);
    if (i >= 0) pilha.splice(i, 1);
    if (pilha.length === 0) document.removeEventListener('keydown', onKeyDownGlobal);
  };
}

/** Há algum modal (não painel) aberto? Atalhos de teclado das telas devem se calar. */
export function haModalAberto(): boolean {
  return pilha.some((c) => c.el.classList.contains('modal-overlay'));
}

export function estaNoTopo(el: HTMLElement): boolean {
  return pilha[pilha.length - 1]?.el === el;
}

// ---------- Casca comum ----------

export interface CustomModalOptions {
  /** Largura em px (padrão 500). */
  largura?: number;
  classe?: string;
  /** Path SVG (24×24) mostrado num selo ao lado do título. */
  icone?: string;
  subtitulo?: string;
  /** Variação do selo do ícone: perigo (vermelho) para exclusões. */
  tom?: 'perigo';
  /** Chamado quando o modal fecha por qualquer caminho (X, Esc, clique fora, fechar()). */
  aoFechar?: () => void;
}

export interface CustomModalHandle {
  modal: HTMLElement;
  corpo: HTMLElement;
  /** Barra fixa no pé do modal para as ações; some quando fica vazia. */
  rodape: HTMLElement;
  fechar(): void;
}

function svgModal(path: string, tamanho: number): string {
  return `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/**
 * Modal de conteúdo livre. Os outros modais (formulário, confirmação, aviso)
 * são montados sobre ele, então todos compartilham a mesma casca.
 */
export function openCustomModal(
  titulo: string,
  montar: (handle: CustomModalHandle) => void,
  opcoes: CustomModalOptions = {},
): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = `modal modal-custom${opcoes.classe ? ` ${opcoes.classe}` : ''}`;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', titulo);
    modal.style.width = `${opcoes.largura ?? 500}px`;

    const cabecalho = document.createElement('div');
    cabecalho.className = 'modal-custom-cabecalho';
    if (opcoes.icone) {
      const selo = document.createElement('span');
      selo.className = `modal-custom-icone${opcoes.tom ? ` is-${opcoes.tom}` : ''}`;
      selo.innerHTML = svgModal(opcoes.icone, 18);
      cabecalho.appendChild(selo);
    }
    const textos = document.createElement('div');
    textos.className = 'modal-custom-textos';
    const heading = document.createElement('h2');
    heading.textContent = titulo;
    textos.appendChild(heading);
    if (opcoes.subtitulo) {
      const sub = document.createElement('p');
      sub.textContent = opcoes.subtitulo;
      textos.appendChild(sub);
    }
    const fecharBtn = document.createElement('button');
    fecharBtn.type = 'button';
    fecharBtn.className = 'modal-custom-fechar';
    fecharBtn.setAttribute('aria-label', 'Fechar');
    fecharBtn.innerHTML = svgModal('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 16);
    cabecalho.append(textos, fecharBtn);

    const corpo = document.createElement('div');
    corpo.className = 'modal-custom-corpo';
    const rodape = document.createElement('div');
    rodape.className = 'modal-custom-rodape';
    modal.append(cabecalho, corpo, rodape);
    overlay.appendChild(modal);

    let fechado = false;
    let desempilhar = (): void => undefined;
    const focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function fechar(): void {
      if (fechado) return;
      fechado = true;
      desempilhar();
      overlay.remove();
      opcoes.aoFechar?.();
      // Devolve o foco a quem abriu, para o teclado não se perder no body.
      if (focoAnterior?.isConnected) focoAnterior.focus();
      resolve();
    }

    fecharBtn.addEventListener('click', fechar);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay && estaNoTopo(overlay)) fechar();
    });
    desempilhar = empilharCamada(overlay, fechar);
    document.body.appendChild(overlay);

    montar({ modal, corpo, rodape, fechar });

    // Quem montou pode ter focado algo; senão, o primeiro campo do corpo.
    if (!modal.contains(document.activeElement)) {
      const primeiro = corpo.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select');
      (primeiro ?? fecharBtn).focus();
    }
  });
}

/**
 * Bloco de seção dos modais de configuração: título, descrição curta e
 * conteúdo num cartão. Mantém os modais com a mesma hierarquia visual.
 */
export function buildSecaoModal(
  titulo: string,
  descricao?: string,
  extra?: HTMLElement,
): { secao: HTMLElement; conteudo: HTMLElement } {
  const secao = document.createElement('section');
  secao.className = 'md-secao';
  const cabeca = document.createElement('header');
  cabeca.className = 'md-secao-cabeca';
  const textos = document.createElement('div');
  const h = document.createElement('h3');
  h.textContent = titulo;
  textos.appendChild(h);
  if (descricao) {
    const p = document.createElement('p');
    p.textContent = descricao;
    textos.appendChild(p);
  }
  cabeca.appendChild(textos);
  if (extra) cabeca.appendChild(extra);
  const conteudo = document.createElement('div');
  conteudo.className = 'md-secao-conteudo';
  secao.append(cabeca, conteudo);
  return { secao, conteudo };
}

// ---------- Formulário ----------

function buildWeekdaysField(field: ModalFieldSpec, wrap: HTMLElement): HTMLInputElement {
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.value = field.defaultValue ?? '';

  const selected = new Set(
    (field.defaultValue ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v !== ''),
  );

  const picker = document.createElement('div');
  picker.className = 'md-pilulas md-dias';

  const labels = field.weekdayLabels ?? DEFAULT_WEEKDAY_LABELS;
  labels.forEach((label, dayIndex) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-pilula md-dia';
    btn.textContent = label;
    const marcar = (): void => {
      const ativo = selected.has(String(dayIndex));
      btn.classList.toggle('is-ativa', ativo);
      btn.setAttribute('aria-pressed', String(ativo));
    };
    marcar();
    btn.addEventListener('click', () => {
      const key = String(dayIndex);
      if (selected.has(key)) {
        selected.delete(key);
      } else {
        selected.add(key);
      }
      marcar();
      hidden.value = Array.from(selected)
        .map(Number)
        .sort((a, b) => a - b)
        .join(',');
    });
    picker.appendChild(btn);
  });

  wrap.appendChild(picker);
  return hidden;
}

function buildFieldElement(field: ModalFieldSpec): FieldElement {
  if (field.type === 'textarea') {
    const textarea = document.createElement('textarea');
    textarea.className = 'md-input md-textarea';
    textarea.rows = 4;
    textarea.value = field.defaultValue ?? '';
    if (field.placeholder) textarea.placeholder = field.placeholder;
    return textarea;
  }

  if (field.type === 'select') {
    const select = document.createElement('select');
    select.className = 'md-input';
    (field.options ?? []).forEach((option) => {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      select.appendChild(optionEl);
    });
    select.value = field.defaultValue ?? '';
    return select;
  }

  const input = document.createElement('input');
  input.className = 'md-input';
  input.type = field.type && field.type !== 'text' ? field.type : 'text';
  input.value = field.defaultValue ?? '';
  if (field.placeholder) input.placeholder = field.placeholder;
  return input;
}

/**
 * Formulário simples em modal. Devolve os valores por nome, ou null se o
 * usuário cancelar. Campos podem ser agrupados em seções (`secao`) e pareados
 * em duas colunas (`metade`).
 */
export function openFormModal(
  title: string,
  fields: ModalFieldSpec[],
  submitLabel = 'Salvar',
  opcoes: FormModalOptions = {},
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    let resultado: Record<string, string> | null = null;
    void openCustomModal(
      title,
      ({ corpo, rodape, fechar }) => {
        const form = document.createElement('form');
        form.className = 'md-form';
        form.id = `md-form-${Date.now()}`;
        const inputs = new Map<string, FieldElement>();

        let secaoAtual: { nome: string; conteudo: HTMLElement } | null = null;
        let gradeAtual: HTMLElement | null = null;

        fields.forEach((field) => {
          // Destino: o cartão da seção, ou o próprio form.
          if (field.secao && secaoAtual?.nome !== field.secao) {
            const s = buildSecaoModal(field.secao);
            form.appendChild(s.secao);
            secaoAtual = { nome: field.secao, conteudo: s.conteudo };
            gradeAtual = null;
          } else if (!field.secao && secaoAtual) {
            secaoAtual = null;
            gradeAtual = null;
          }
          const destinoBase: HTMLElement = secaoAtual?.conteudo ?? form;

          const wrap = document.createElement(field.type === 'weekdays' ? 'div' : 'label');
          wrap.className = 'md-campo';
          const rotulo = document.createElement('span');
          rotulo.className = 'md-rotulo';
          rotulo.textContent = field.label;
          wrap.appendChild(rotulo);

          const fieldEl = field.type === 'weekdays' ? buildWeekdaysField(field, wrap) : buildFieldElement(field);
          fieldEl.name = field.name;
          inputs.set(field.name, fieldEl);
          wrap.appendChild(fieldEl);

          if (field.dica) {
            const dica = document.createElement('small');
            dica.className = 'md-dica';
            dica.textContent = field.dica;
            wrap.appendChild(dica);
          }

          if (field.metade) {
            if (!gradeAtual || gradeAtual.childElementCount >= 2) {
              gradeAtual = document.createElement('div');
              gradeAtual.className = 'md-grade-2';
              destinoBase.appendChild(gradeAtual);
            }
            gradeAtual.appendChild(wrap);
          } else {
            gradeAtual = null;
            destinoBase.appendChild(wrap);
          }
        });

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const values: Record<string, string> = {};
          inputs.forEach((fieldEl, name) => {
            values[name] = fieldEl.value;
          });
          resultado = values;
          fechar();
        });
        // Enter num input de uma linha envia; num textarea quebra linha, como sempre.
        corpo.appendChild(form);

        const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
        cancelar.type = 'button';
        cancelar.addEventListener('click', fechar);
        const enviar = buildBotao(submitLabel, { variante: 'primario' });
        enviar.type = 'submit';
        enviar.setAttribute('form', form.id);
        rodape.append(cancelar, enviar);

        const primeiro = fields[0];
        if (primeiro) {
          const el = inputs.get(primeiro.name);
          if (el && !(el instanceof HTMLInputElement && el.type === 'hidden')) {
            el.focus();
            if (el instanceof HTMLInputElement && el.type === 'text') el.select();
          }
        }
      },
      {
        largura: opcoes.largura ?? 480,
        icone: opcoes.icone ?? ICONES_MODAL.editar,
        subtitulo: opcoes.subtitulo,
        aoFechar: () => resolve(resultado),
      },
    );
  });
}

export async function promptText(
  title: string,
  label: string,
  defaultValue = '',
  opcoes: FormModalOptions = {},
): Promise<string | null> {
  const result = await openFormModal(title, [{ name: 'value', label, type: 'text', defaultValue }], 'Salvar', {
    largura: 440,
    ...opcoes,
  });
  return result ? result.value : null;
}

// ---------- Confirmação e aviso ----------

export interface ConfirmModalOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export function openConfirmModal(options: ConfirmModalOptions | string): Promise<boolean> {
  const opts: ConfirmModalOptions = typeof options === 'string' ? { message: options } : options;
  const isDanger = opts.danger !== false;
  const title = opts.title ?? (isDanger ? 'Confirmar exclusão' : 'Confirmar ação');
  const confirmText = opts.confirmText ?? (isDanger ? 'Excluir' : 'Confirmar');
  const cancelText = opts.cancelText ?? 'Cancelar';

  return new Promise((resolve) => {
    let confirmado = false;
    void openCustomModal(
      title,
      ({ corpo, rodape, fechar }) => {
        const mensagem = document.createElement('p');
        mensagem.className = 'md-mensagem';
        mensagem.textContent = opts.message;
        corpo.appendChild(mensagem);

        const cancelar = buildBotao(cancelText, { variante: 'fantasma' });
        cancelar.addEventListener('click', fechar);
        const confirmar = buildBotao(confirmText, { variante: 'primario' });
        if (isDanger) confirmar.classList.add('is-perigo-cheio');
        confirmar.addEventListener('click', () => {
          confirmado = true;
          fechar();
        });
        rodape.append(cancelar, confirmar);
        confirmar.focus();
      },
      {
        largura: 440,
        classe: 'modal-confirmacao',
        icone: isDanger ? ICONES_MODAL.alerta : ICONES_MODAL.info,
        tom: isDanger ? 'perigo' : undefined,
        aoFechar: () => resolve(confirmado),
      },
    );
  });
}

/** Mensagem com um único botão, no lugar de window.alert e de confirmações usadas como aviso. */
export function openAvisoModal(titulo: string, mensagem: string, opcoes: { erro?: boolean; botao?: string } = {}): Promise<void> {
  return openCustomModal(
    titulo,
    ({ corpo, rodape, fechar }) => {
      const p = document.createElement('p');
      p.className = 'md-mensagem';
      p.textContent = mensagem;
      corpo.appendChild(p);
      const ok = buildBotao(opcoes.botao ?? 'Ok', { variante: 'primario' });
      ok.addEventListener('click', fechar);
      rodape.appendChild(ok);
      ok.focus();
    },
    {
      largura: 440,
      classe: 'modal-confirmacao',
      icone: opcoes.erro ? ICONES_MODAL.alerta : ICONES_MODAL.info,
      tom: opcoes.erro ? 'perigo' : undefined,
    },
  );
}

/** Mensagem legível de um erro qualquer, para avisos. */
export function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
