import { svg } from '../../ui/pagina.js';
import { agendar } from './contatos.ficha.rascunho.js';
import { ICONES_CONTATO, el } from './contatos.ui.js';

/**
 * Peças de campo da ficha. Cada dado é uma linha "rótulo | valor" num cartão,
 * e o valor parece texto até receber o mouse ou o foco — uma ficha cheia lê
 * como um cadastro, não como um formulário de caixas cinzas.
 *
 * Tudo que digita chama `agendar()` (salva na pausa, sem redesenhar).
 */

let seq = 0;
function idNovo(): string {
  seq += 1;
  return `cf-campo-${seq}`;
}

export interface OpcoesCampo {
  placeholder?: string;
  tipo?: string;
  /** Roda ao sair do campo (formatar telefone, documento, CEP). */
  formatar?: (v: string) => string;
  /** Aviso sob o campo, recalculado ao sair dele (nunca bloqueia). */
  aviso?: (v: string) => string | undefined;
  /** id de um <datalist> com sugestões. */
  lista?: string;
}

export function entrada(valor: string, gravar: (v: string) => void, op: OpcoesCampo = {}): HTMLInputElement {
  const input = el('input', 'cf-entrada');
  input.type = op.tipo ?? 'text';
  input.value = valor;
  input.placeholder = op.placeholder ?? '';
  if (op.lista) input.setAttribute('list', op.lista);
  input.addEventListener('input', () => {
    gravar(input.value);
    agendar();
  });
  if (op.formatar) {
    const formatar = op.formatar;
    input.addEventListener('change', () => {
      const novo = formatar(input.value);
      if (novo === input.value) return;
      input.value = novo;
      gravar(novo);
      agendar();
    });
  }
  return input;
}

export function seletor(valor: string, opcoes: ReadonlyArray<{ id: string; rotulo: string }>, gravar: (v: string) => void, rotulo: string): HTMLSelectElement {
  const s = el('select', 'cf-entrada is-seletor');
  s.setAttribute('aria-label', rotulo);
  opcoes.forEach((o) => s.appendChild(Object.assign(el('option'), { value: o.id, textContent: o.rotulo })));
  s.value = valor;
  s.addEventListener('change', () => {
    gravar(s.value);
    agendar();
  });
  return s;
}

/** Linha com um controle qualquer (select, botão, lista). */
export function linha(rotulo: string, controle: HTMLElement, opcoes: { dica?: string; topo?: boolean } = {}): HTMLElement {
  const l = el('div', `cf-linha${opcoes.topo ? ' is-topo' : ''}`);
  const r = el('label', 'cf-rotulo', rotulo);
  const alvo = controle.matches('input, select, textarea') ? controle : controle.querySelector<HTMLElement>('input, select, textarea');
  if (alvo) {
    alvo.id ||= idNovo();
    r.htmlFor = alvo.id;
  }
  const valor = el('div', 'cf-valor');
  valor.appendChild(controle);
  if (opcoes.dica) valor.appendChild(el('span', 'cf-dica', opcoes.dica));
  l.append(r, valor);
  return l;
}

/** Linha de texto editável, com o aviso (CPF, CNPJ) embaixo. */
export function linhaCampo(rotulo: string, valor: string, gravar: (v: string) => void, op: OpcoesCampo = {}): HTMLElement {
  const input = entrada(valor, gravar, op);
  const l = linha(rotulo, input);
  if (op.aviso) {
    const conferir = op.aviso;
    const aviso = el('span', 'cf-aviso');
    const atualizar = (): void => {
      aviso.textContent = conferir(input.value) ?? '';
    };
    input.addEventListener('change', atualizar);
    atualizar();
    l.querySelector('.cf-valor')!.appendChild(aviso);
  }
  return l;
}

export interface OpcoesCartao {
  /** Botão no canto do cabeçalho. */
  acao?: HTMLElement;
  classe?: string;
  /** Texto curto ao lado do título ("2", "lead"). */
  contagem?: string;
}

export function cartao(titulo: string, icone: string, filhos: HTMLElement[], op: OpcoesCartao = {}): HTMLElement {
  const c = el('section', `cf-cartao${op.classe ? ` ${op.classe}` : ''}`);
  const cab = el('header', 'cf-cartao-cab');
  const marca = el('span', 'cf-cartao-icone');
  marca.innerHTML = svg(icone, 15);
  cab.append(marca, el('h3', undefined, titulo));
  if (op.contagem) cab.appendChild(el('span', 'cf-cartao-contagem', op.contagem));
  if (op.acao) {
    op.acao.classList.add('cf-cartao-acao');
    cab.appendChild(op.acao);
  }
  const corpo = el('div', 'cf-cartao-corpo');
  corpo.append(...filhos);
  c.append(cab, corpo);
  return c;
}

export function botaoIcone(icone: string, titulo: string, aoClicar: () => void, classe = ''): HTMLButtonElement {
  const b = el('button', `ct-icone-btn${classe ? ` ${classe}` : ''}`);
  b.type = 'button';
  b.title = titulo;
  b.setAttribute('aria-label', titulo);
  b.innerHTML = svg(icone, 14);
  b.addEventListener('click', aoClicar);
  return b;
}

export function botaoAdicionar(rotulo: string, aoClicar: () => void): HTMLButtonElement {
  const b = el('button', 'cf-adicionar');
  b.type = 'button';
  b.innerHTML = svg(ICONES_CONTATO.mais, 13, 2);
  b.appendChild(el('span', undefined, rotulo));
  b.addEventListener('click', aoClicar);
  return b;
}

/**
 * Lista editável (e-mails, telefones, redes): adicionar e remover redesenham só
 * a própria lista — quem está digitando no campo ao lado não perde nada.
 */
export function listaEditavel<T>(opcoes: {
  itens: () => T[];
  novo: () => T;
  linha: (item: T, i: number) => HTMLElement[];
  rotuloNovo: string;
  vazio?: string;
  /** Depois de remover (ex.: atualizar o botão de WhatsApp do topo). */
  aoMudar?: () => void;
}): HTMLElement {
  const caixa = el('div', 'cf-lista');
  const desenhar = (): void => {
    caixa.replaceChildren();
    const itens = opcoes.itens();
    if (!itens.length && opcoes.vazio) caixa.appendChild(el('p', 'cf-vazio', opcoes.vazio));
    itens.forEach((item, i) => {
      const l = el('div', 'cf-lista-linha');
      l.append(...opcoes.linha(item, i));
      l.appendChild(
        botaoIcone(
          ICONES_CONTATO.lixeira,
          'Remover',
          () => {
            opcoes.itens().splice(i, 1);
            agendar();
            desenhar();
            opcoes.aoMudar?.();
          },
          'is-perigo cf-tirar',
        ),
      );
      caixa.appendChild(l);
    });
    caixa.appendChild(
      botaoAdicionar(opcoes.rotuloNovo, () => {
        opcoes.itens().push(opcoes.novo());
        desenhar();
        [...caixa.querySelectorAll<HTMLInputElement>('.cf-lista-linha input')].pop()?.focus();
      }),
    );
  };
  desenhar();
  return caixa;
}
