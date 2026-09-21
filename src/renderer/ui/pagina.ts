/**
 * Peças visuais compartilhadas pelas telas de sistema (n8n, GitHub, Tutorial,
 * Ajustes). Mantê-las aqui garante que as quatro falem a mesma língua visual
 * em vez de cada uma reinventar cabeçalho, indicador e estado vazio.
 */

export type Tom = 'ok' | 'atencao' | 'erro' | 'neutro';

export const ICONES = {
  n8n: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.5 11 16.5 6.8"/><path d="M7.5 13l9 4.2"/>',
  github:
    '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
  tutorial: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  ajustes:
    '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  atualizar: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  externo: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>',
  play: '<polygon points="6 4 20 12 6 20 6 4"/>',
  pasta: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  branch: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7"/><path d="M18 10.5c0 4-4.5 3.5-6.5 5"/>',
  cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  backup: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  preferencias: '<circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  alerta: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  xis: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  ponto: '<circle cx="12" cy="12" r="4"/>',
  servidor: '<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01"/><path d="M6 17h.01"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
} as const;

export function svg(path: string, tamanho = 16, traco = 1.8): string {
  return `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="${traco}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const ICONE_DO_TOM: Record<Tom, string> = {
  ok: ICONES.check,
  atencao: ICONES.alerta,
  erro: ICONES.xis,
  neutro: ICONES.ponto,
};

/** Selo de estado: sempre ícone + texto, nunca só a cor. */
export function buildSelo(texto: string, tom: Tom): HTMLElement {
  const selo = document.createElement('span');
  selo.className = `pg-selo is-${tom}`;
  selo.innerHTML = svg(ICONE_DO_TOM[tom], 11, 2.4);
  const rotulo = document.createElement('span');
  rotulo.textContent = texto;
  selo.appendChild(rotulo);
  return selo;
}

export interface CabecalhoOpcoes {
  icone: string;
  titulo: string;
  subtitulo?: string;
  /** Elementos logo após o título, como o selo de conexão. */
  extras?: HTMLElement[];
  acoes?: HTMLElement[];
}

export function buildCabecalho(opcoes: CabecalhoOpcoes): HTMLElement {
  const header = document.createElement('header');
  header.className = 'pg-cabecalho';

  const marca = document.createElement('div');
  marca.className = 'pg-cabecalho-icone';
  marca.innerHTML = svg(opcoes.icone, 20, 1.8);
  header.appendChild(marca);

  const textos = document.createElement('div');
  textos.className = 'pg-cabecalho-textos';

  const linha = document.createElement('div');
  linha.className = 'pg-cabecalho-linha';
  const titulo = document.createElement('h1');
  titulo.className = 'pg-titulo';
  titulo.textContent = opcoes.titulo;
  linha.appendChild(titulo);
  (opcoes.extras ?? []).forEach((extra) => linha.appendChild(extra));
  textos.appendChild(linha);

  if (opcoes.subtitulo) {
    const sub = document.createElement('p');
    sub.className = 'pg-subtitulo';
    sub.textContent = opcoes.subtitulo;
    textos.appendChild(sub);
  }
  header.appendChild(textos);

  const acoes = document.createElement('div');
  acoes.className = 'pg-cabecalho-acoes';
  (opcoes.acoes ?? []).forEach((acao) => acoes.appendChild(acao));
  header.appendChild(acoes);

  return header;
}

export interface Indicador {
  rotulo: string;
  valor: string;
  detalhe?: string;
  /** Tom do selo de detalhe. O número em si fica sempre na cor de texto. */
  tom?: Tom;
}

export function buildIndicadores(itens: Indicador[]): HTMLElement {
  const grade = document.createElement('div');
  grade.className = 'pg-indicadores';

  itens.forEach((item) => {
    const bloco = document.createElement('div');
    bloco.className = 'pg-indicador';

    const rotulo = document.createElement('span');
    rotulo.className = 'pg-indicador-rotulo';
    rotulo.textContent = item.rotulo;
    bloco.appendChild(rotulo);

    const valor = document.createElement('span');
    valor.className = 'pg-indicador-valor';
    valor.textContent = item.valor;
    bloco.appendChild(valor);

    if (item.detalhe) {
      bloco.appendChild(
        item.tom && item.tom !== 'neutro'
          ? buildSelo(item.detalhe, item.tom)
          : Object.assign(document.createElement('span'), {
              className: 'pg-indicador-detalhe',
              textContent: item.detalhe,
            }),
      );
    }

    grade.appendChild(bloco);
  });

  return grade;
}

export function buildSegmentado<T extends string>(
  opcoes: Array<{ value: T; label: string }>,
  ativo: T,
  aoMudar: (valor: T) => void,
): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = 'pg-segmentado';
  grupo.setAttribute('role', 'tablist');

  opcoes.forEach((opcao) => {
    const btn = document.createElement('button');
    btn.className = 'pg-segmento';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(opcao.value === ativo));
    if (opcao.value === ativo) btn.classList.add('is-ativo');
    btn.textContent = opcao.label;
    btn.addEventListener('click', () => aoMudar(opcao.value));
    grupo.appendChild(btn);
  });

  return grupo;
}

export function buildBusca(valor: string, placeholder: string, aoDigitar: (v: string) => void): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'pg-busca';
  wrap.innerHTML = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 14);

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = placeholder;
  input.value = valor;
  input.addEventListener('input', () => aoDigitar(input.value));
  wrap.appendChild(input);

  return wrap;
}

/**
 * As telas redesenham por inteiro a cada tecla da busca; isto devolve o foco
 * ao campo novo com o cursor no fim, para a digitação não ser interrompida.
 */
export function focarBusca(container: HTMLElement | null): void {
  const input = container?.querySelector<HTMLInputElement>('.pg-busca input');
  if (!input) return;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

export function buildBotao(
  texto: string,
  opcoes: { icone?: string; variante?: 'primario' | 'secundario' | 'fantasma'; titulo?: string } = {},
): HTMLButtonElement {
  const btn = document.createElement('button');
  const variante = opcoes.variante ?? 'secundario';
  btn.className = `pg-botao is-${variante}`;
  if (opcoes.titulo) btn.title = opcoes.titulo;
  if (opcoes.icone) btn.innerHTML = svg(opcoes.icone, 14, 2);
  if (texto) {
    const span = document.createElement('span');
    span.textContent = texto;
    btn.appendChild(span);
  } else {
    btn.classList.add('is-so-icone');
  }
  return btn;
}

/** Botão "?" que leva ao guia da própria área. */
export function buildBotaoAjuda(aoClicar: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'pg-ajuda';
  btn.title = 'Como configurar esta área';
  btn.setAttribute('aria-label', 'Abrir tutorial desta área');
  btn.textContent = '?';
  btn.addEventListener('click', aoClicar);
  return btn;
}

export function buildAviso(texto: string, tom: Tom, acao?: HTMLElement): HTMLElement {
  const aviso = document.createElement('div');
  aviso.className = `pg-aviso is-${tom}`;
  aviso.innerHTML = svg(ICONE_DO_TOM[tom], 16, 2);

  const span = document.createElement('span');
  span.className = 'pg-aviso-texto';
  span.textContent = texto;
  aviso.appendChild(span);

  if (acao) aviso.appendChild(acao);
  return aviso;
}

export function buildVazio(icone: string, titulo: string, texto: string, acao?: HTMLElement): HTMLElement {
  const vazio = document.createElement('div');
  vazio.className = 'pg-vazio';

  const marca = document.createElement('div');
  marca.className = 'pg-vazio-icone';
  marca.innerHTML = svg(icone, 26, 1.5);
  vazio.appendChild(marca);

  const h = document.createElement('h3');
  h.textContent = titulo;
  vazio.appendChild(h);

  const p = document.createElement('p');
  p.textContent = texto;
  vazio.appendChild(p);

  if (acao) vazio.appendChild(acao);
  return vazio;
}

export function tempoRelativo(iso?: string): string {
  if (!iso) return '—';
  const segundos = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(segundos)) return '—';
  if (segundos < 60) return 'agora há pouco';
  if (segundos < 3600) return `há ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `há ${Math.floor(segundos / 3600)} h`;
  if (segundos < 2592000) return `há ${Math.floor(segundos / 86400)} d`;
  if (segundos < 31536000) {
    const meses = Math.floor(segundos / 2592000);
    return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
  }
  const anos = Math.floor(segundos / 31536000);
  return anos === 1 ? 'há 1 ano' : `há ${anos} anos`;
}
