import { mensagemDeErro } from './modal.js';

/**
 * Peças de formulário dos modais e painéis (classes md-* de base.css). Nasceram
 * nos modais de Postagens; ficam aqui para todo modal montar campos iguais.
 */

export function campo(rotulo: string, controle: HTMLElement, dica?: string): HTMLElement {
  // <label> só quando envolve um único campo; com grupos de botões, um clique
  // no rótulo acionaria o primeiro botão.
  const unico =
    controle instanceof HTMLInputElement || controle instanceof HTMLSelectElement || controle instanceof HTMLTextAreaElement;
  const wrap = document.createElement(unico ? 'label' : 'div');
  wrap.className = 'md-campo';
  const span = document.createElement('span');
  span.className = 'md-rotulo';
  span.textContent = rotulo;
  wrap.append(span, controle);
  if (dica) {
    const small = document.createElement('small');
    small.className = 'md-dica';
    small.textContent = dica;
    wrap.appendChild(small);
  }
  return wrap;
}

export function input(tipo: string, valor: string, placeholder = ''): HTMLInputElement {
  const el = document.createElement('input');
  el.type = tipo;
  el.className = 'md-input';
  el.value = valor;
  el.placeholder = placeholder;
  return el;
}

export function textarea(valor: string, placeholder = '', linhas = 4): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  el.className = 'md-input md-textarea';
  el.rows = linhas;
  el.value = valor;
  el.placeholder = placeholder;
  return el;
}

export function select(valor: string, opcoes: Array<{ value: string; label: string }>): HTMLSelectElement {
  const el = document.createElement('select');
  el.className = 'md-input';
  opcoes.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    el.appendChild(opt);
  });
  el.value = valor;
  return el;
}

/** Duas colunas lado a lado (uma só em tela estreita). */
export function grade2(...filhos: HTMLElement[]): HTMLElement {
  const grade = document.createElement('div');
  grade.className = 'md-grade-2';
  grade.append(...filhos);
  return grade;
}

export function pilulas<T extends string>(
  opcoes: Array<{ id: T; rotulo: string; classe?: string }>,
  ativo: () => T,
  aoEscolher: (v: T) => void,
): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = 'md-pilulas';
  const desenhar = (): void => {
    grupo.innerHTML = '';
    opcoes.forEach((o) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `md-pilula${o.classe ? ` ${o.classe}` : ''}`;
      btn.classList.toggle('is-ativa', ativo() === o.id);
      btn.setAttribute('aria-pressed', String(ativo() === o.id));
      btn.textContent = o.rotulo;
      btn.addEventListener('click', () => {
        aoEscolher(o.id);
        desenhar();
      });
      grupo.appendChild(btn);
    });
  };
  desenhar();
  return grupo;
}

/** Checkbox em forma de interruptor, com texto e explicação curta. */
export function interruptor(texto: string, detalhe: string, marcado: boolean, aoMudar: (v: boolean) => void): HTMLElement {
  const label = document.createElement('label');
  label.className = 'md-interruptor';
  const textos = document.createElement('span');
  textos.className = 'md-interruptor-texto';
  textos.textContent = texto;
  if (detalhe) {
    const small = document.createElement('small');
    small.textContent = detalhe;
    textos.appendChild(small);
  }
  const caixa = document.createElement('input');
  caixa.type = 'checkbox';
  caixa.checked = marcado;
  caixa.addEventListener('change', () => aoMudar(caixa.checked));
  label.append(textos, caixa);
  return label;
}

/** Mensagem de erro no topo do contêiner (uma por vez). */
export function erroInline(container: HTMLElement, erro: unknown): void {
  container.querySelector(':scope > .md-erro')?.remove();
  const aviso = document.createElement('p');
  aviso.className = 'md-erro';
  aviso.setAttribute('role', 'alert');
  aviso.textContent = mensagemDeErro(erro);
  container.prepend(aviso);
}
