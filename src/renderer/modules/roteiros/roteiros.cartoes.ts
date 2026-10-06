import { formatarTempo, lerTempo } from '../../../shared/types/roteiros.conversao.js';
import { TIPOS_CENA, type CenaRoteiro, type TipoCena } from '../../../shared/types/roteiros.types.js';
import { input, textarea } from '../../ui/campos.js';
import { openConfirmModal } from '../../ui/modal.js';
import { abrirMenuIa } from '../../ui/ia.js';
import { buildBotao, svg } from '../../ui/pagina.js';
import { ICONES, autoCrescer, novaCena, tempoCena, textoTempoCena, tipoDe, type CtxEstudio } from './roteiros.comum.js';
import { buildBotaoIaCena } from './roteiros.ia.js';

/**
 * Escrever na mão: cartões (uma cena por cartão), duas colunas AV (vídeo ×
 * áudio, denso) e o índice da esquerda, que reordena arrastando. Os três
 * mexem nas mesmas cenas do rascunho.
 */

let sortables: InstanceType<typeof Sortable>[] = [];

export function destruirArraste(): void {
  sortables.forEach((s) => s.destroy());
  sortables = [];
}

function mover<T>(lista: T[], de: number, para: number): void {
  if (para < 0 || para >= lista.length) return;
  const [item] = lista.splice(de, 1);
  lista.splice(para, 0, item!);
}

function botaoIcone(icone: string, titulo: string, aoClicar: (e: MouseEvent) => void): HTMLButtonElement {
  const b = buildBotao('', { icone, variante: 'fantasma', titulo });
  b.classList.add('is-mini');
  b.setAttribute('aria-label', titulo);
  b.addEventListener('click', aoClicar);
  return b;
}

/** Menu dos tipos de cena — para "+ cena" e para trocar o tipo. */
export function menuTipos(ancora: HTMLElement, aoEscolher: (tipo: TipoCena) => void, titulo = 'Que tipo de cena?'): void {
  abrirMenuIa(
    ancora,
    TIPOS_CENA.map((t) => ({
      rotulo: t.rotulo,
      dica: t.dica,
      icone: '<circle cx="12" cy="12" r="6"/>',
      fazer: () => aoEscolher(t.id),
    })),
    { titulo },
  );
}

export function inserirCena(ctx: CtxEstudio, indice: number, tipo: TipoCena): void {
  const cena = novaCena(tipo);
  ctx.r.cenas.splice(indice, 0, cena);
  ctx.mudouEstrutura();
  requestAnimationFrame(() => ctx.irParaCena(cena.id));
}

function excluirCena(ctx: CtxEstudio, cena: CenaRoteiro): void {
  const remover = (): void => {
    ctx.r.cenas.splice(ctx.r.cenas.indexOf(cena), 1);
    ctx.mudouEstrutura();
  };
  const vazia = !cena.fala.trim() && !cena.visual.trim() && !cena.textoTela.trim() && !cena.notas.trim();
  if (vazia) return remover();
  void openConfirmModal({ title: 'Excluir cena', message: `A cena "${cena.titulo || tipoDe(cena.tipo).rotulo}" e o que está escrito nela saem do roteiro.`, confirmText: 'Excluir' }).then(
    (ok) => ok && remover(),
  );
}

/** Campo de tempo alvo "m:ss" (vazio = sem alvo). */
function campoAlvo(ctx: CtxEstudio, cena: CenaRoteiro): HTMLInputElement {
  const campo = input('text', cena.duracaoAlvoSeg ? formatarTempo(cena.duracaoAlvoSeg) : '', 'alvo');
  campo.className = 'md-input rte-alvo';
  campo.title = 'Tempo pretendido da cena (m:ss). Vazio = sem alvo.';
  campo.setAttribute('aria-label', `Tempo alvo da cena ${cena.titulo}`);
  campo.addEventListener('change', () => {
    const v = campo.value.trim();
    const seg = v ? (lerTempo(v.includes(':') ? v : `0:${v.padStart(2, '0')}`) ?? undefined) : undefined;
    if (seg) cena.duracaoAlvoSeg = seg;
    else delete cena.duracaoAlvoSeg;
    campo.value = cena.duracaoAlvoSeg ? formatarTempo(cena.duracaoAlvoSeg) : '';
    ctx.digitou();
  });
  return campo;
}

/**
 * Selo de tempo que se atualiza na digitação ([data-tempo-cena]). `comAlvo`:
 * "0:17 / 0:45"; sem, só o falado (o cartão mostra o alvo num campo ao lado).
 */
function seloTempo(ctx: CtxEstudio, cena: CenaRoteiro, comAlvo = true): HTMLElement {
  const selo = document.createElement('span');
  selo.className = 'rte-tempo';
  selo.dataset.tempoCena = cena.id;
  if (!comAlvo) selo.dataset.semAlvo = '1';
  selo.textContent = comAlvo ? textoTempoCena(ctx.r, cena) : formatarTempo(tempoCena(ctx.r, cena));
  selo.title = 'Tempo de fala estimado';
  return selo;
}

/** Atualiza os tempos escritos sem redesenhar os campos (a digitação continua). */
export function atualizarTempos(raiz: HTMLElement, ctx: CtxEstudio): void {
  raiz.querySelectorAll<HTMLElement>('[data-tempo-cena]').forEach((el) => {
    const cena = ctx.r.cenas.find((c) => c.id === el.dataset.tempoCena);
    if (!cena) return;
    el.textContent = el.dataset.semAlvo ? formatarTempo(tempoCena(ctx.r, cena)) : textoTempoCena(ctx.r, cena);
    const passou = Boolean(cena.duracaoAlvoSeg && tempoCena(ctx.r, cena) > cena.duracaoAlvoSeg * 1.15);
    el.classList.toggle('is-acima', passou);
  });
}

function areaCena(valor: string, placeholder: string, linhas: number, aoMudar: (v: string) => void, ctx: CtxEstudio, rotulo: string): HTMLTextAreaElement {
  const area = textarea(valor, placeholder, linhas);
  area.setAttribute('aria-label', rotulo);
  area.spellcheck = true;
  autoCrescer(area);
  area.addEventListener('input', () => {
    aoMudar(area.value);
    ctx.digitou();
  });
  return area;
}

function rotuloCampo(texto: string, area: HTMLElement): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'rte-campo';
  wrap.append(Object.assign(document.createElement('span'), { className: 'rte-campo-rotulo', textContent: texto }), area);
  return wrap;
}

const EXEMPLOS: Record<TipoCena, string> = {
  gancho: 'A frase dos primeiros segundos. Ex.: "268 demissões e o Halo saiu das mãos da Xbox."',
  abertura: 'Apresente o assunto e prometa o que a pessoa vai ganhar assistindo até o fim.',
  secao: 'O que é dito nesta parte, do jeito que vai ser falado.',
  demonstracao: 'O passo a passo falado enquanto mostra na tela.',
  cta: 'Ex.: "Comenta aqui o que você acha — e segue para a parte 2."',
  encerramento: 'Feche a ideia em uma ou duas frases.',
};

// ---------- Cartões ----------

function buildCartao(ctx: CtxEstudio, cena: CenaRoteiro, indice: number): HTMLElement {
  const r = ctx.r;
  const tipo = tipoDe(cena.tipo);
  const cartao = document.createElement('article');
  cartao.className = 'rte-cartao';
  cartao.dataset.cena = cena.id;
  cartao.style.setProperty('--c', tipo.cor);

  const cab = document.createElement('header');
  cab.className = 'rte-cartao-cab';
  const numero = Object.assign(document.createElement('span'), { className: 'rte-cartao-n', textContent: String(indice + 1) });
  const tipoBtn = document.createElement('button');
  tipoBtn.type = 'button';
  tipoBtn.className = 'rte-tipo';
  tipoBtn.textContent = tipo.rotulo;
  tipoBtn.title = 'Mudar o tipo da cena';
  tipoBtn.addEventListener('click', () =>
    menuTipos(
      tipoBtn,
      (t) => {
        // Título igual ao rótulo do tipo antigo acompanha a troca.
        if (!cena.titulo.trim() || cena.titulo === tipo.rotulo) cena.titulo = tipoDe(t).rotulo;
        cena.tipo = t;
        ctx.mudouEstrutura();
      },
      'Mudar para',
    ),
  );
  const titulo = input('text', cena.titulo, tipo.rotulo);
  titulo.className = 'rte-cartao-titulo';
  titulo.setAttribute('aria-label', 'Título da cena');
  titulo.addEventListener('input', () => {
    cena.titulo = titulo.value;
    ctx.digitou();
  });
  // "0:17 de [0:45]": o falado e o alvo editável, lado a lado.
  const tempos = document.createElement('span');
  tempos.className = 'rte-cartao-tempos';
  tempos.append(seloTempo(ctx, cena, false), Object.assign(document.createElement('span'), { className: 'rte-de', textContent: 'de' }), campoAlvo(ctx, cena));

  const acoes = document.createElement('span');
  acoes.className = 'rte-cartao-acoes';
  const fala = areaCena(cena.fala, EXEMPLOS[cena.tipo], 4, (v) => (cena.fala = v), ctx, 'Fala');
  fala.classList.add('rte-fala');
  const mais = botaoIcone(ICONES.mais3, 'Mais ações da cena', () =>
    abrirMenuIa(
      mais,
      [
        ...(indice > 0
          ? [{ rotulo: 'Subir', dica: 'Troca de lugar com a cena de cima', icone: ICONES.cima, fazer: () => (mover(r.cenas, indice, indice - 1), ctx.mudouEstrutura()) }]
          : []),
        ...(indice < r.cenas.length - 1
          ? [{ rotulo: 'Descer', dica: 'Troca de lugar com a cena de baixo', icone: ICONES.baixo, fazer: () => (mover(r.cenas, indice, indice + 1), ctx.mudouEstrutura()) }]
          : []),
        {
          rotulo: 'Duplicar',
          dica: 'Uma cópia logo abaixo',
          icone: ICONES.duplicar,
          fazer: () => {
            r.cenas.splice(indice + 1, 0, { ...structuredClone(cena), id: crypto.randomUUID() });
            ctx.mudouEstrutura();
          },
        },
        { rotulo: 'Excluir', dica: 'Tira a cena do roteiro', icone: ICONES.lixeira, fazer: () => excluirCena(ctx, cena) },
      ],
      { titulo: `Cena ${indice + 1}` },
    ),
  );
  acoes.append(buildBotaoIaCena(ctx, cena, fala), mais);
  cab.append(numero, tipoBtn, titulo, tempos, acoes);
  cartao.appendChild(cab);

  const corpo = document.createElement('div');
  corpo.className = 'rte-cartao-corpo';
  corpo.appendChild(rotuloCampo('Fala', fala));
  const lado = document.createElement('div');
  lado.className = 'rte-cartao-lado';
  lado.append(
    rotuloCampo('Visual / B-roll', areaCena(cena.visual, 'O que aparece: cena, corte, B-roll, enquadramento', 2, (v) => (cena.visual = v), ctx, 'Visual')),
    rotuloCampo('Texto na tela', areaCena(cena.textoTela, 'Letreiro curto (opcional)', 2, (v) => (cena.textoTela = v), ctx, 'Texto na tela')),
  );
  corpo.appendChild(lado);
  const notas = document.createElement('details');
  notas.className = 'rte-notas';
  notas.open = Boolean(cena.notas.trim());
  notas.append(
    Object.assign(document.createElement('summary'), { textContent: cena.notas.trim() ? 'Notas de produção' : 'Notas de produção (opcional)' }),
    areaCena(cena.notas, 'Trilha, efeito, lembrete para a edição…', 2, (v) => (cena.notas = v), ctx, 'Notas'),
  );
  corpo.appendChild(notas);
  cartao.appendChild(corpo);
  return cartao;
}

function buildInserir(ctx: CtxEstudio, indice: number): HTMLElement {
  const linha = document.createElement('div');
  linha.className = 'rte-inserir';
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'rte-inserir-btn';
  b.innerHTML = svg(ICONES.mais, 13, 2.2);
  b.append('cena aqui');
  b.title = 'Inserir uma cena nesta posição';
  b.addEventListener('click', () => menuTipos(b, (t) => inserirCena(ctx, indice, t)));
  linha.appendChild(b);
  return linha;
}

export function buildCartoes(ctx: CtxEstudio): HTMLElement {
  const lista = document.createElement('div');
  lista.className = 'rte-cartoes';
  ctx.r.cenas.forEach((c, i) => {
    lista.appendChild(buildInserir(ctx, i));
    lista.appendChild(buildCartao(ctx, c, i));
  });
  const fim = document.createElement('div');
  fim.className = 'rte-fim';
  const nova = buildBotao('Nova cena', { icone: ICONES.mais, variante: 'secundario' });
  nova.addEventListener('click', () => menuTipos(nova, (t) => inserirCena(ctx, ctx.r.cenas.length, t)));
  fim.appendChild(nova);
  lista.appendChild(fim);
  return lista;
}

// ---------- Duas colunas (AV) ----------

export function buildAV(ctx: CtxEstudio): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rte-av';
  const cab = document.createElement('div');
  cab.className = 'rte-av-cab';
  cab.append(
    Object.assign(document.createElement('span'), { textContent: 'Cena' }),
    Object.assign(document.createElement('span'), { textContent: 'Vídeo — o que se vê' }),
    Object.assign(document.createElement('span'), { textContent: 'Áudio — o que se fala' }),
  );
  wrap.appendChild(cab);
  ctx.r.cenas.forEach((cena, i) => {
    const linha = document.createElement('div');
    linha.className = 'rte-av-linha';
    linha.dataset.cena = cena.id;
    linha.style.setProperty('--c', tipoDe(cena.tipo).cor);
    const id = document.createElement('div');
    id.className = 'rte-av-id';
    const titulo = input('text', cena.titulo, tipoDe(cena.tipo).rotulo);
    titulo.className = 'rte-av-titulo';
    titulo.setAttribute('aria-label', 'Título da cena');
    titulo.addEventListener('input', () => {
      cena.titulo = titulo.value;
      ctx.digitou();
    });
    id.append(
      Object.assign(document.createElement('span'), { className: 'rte-av-n', textContent: `${i + 1} · ${tipoDe(cena.tipo).rotulo}` }),
      titulo,
      seloTempo(ctx, cena),
    );
    const video = document.createElement('div');
    video.className = 'rte-av-video';
    video.append(
      areaCena(cena.visual, 'Cena, B-roll, enquadramento', 2, (v) => (cena.visual = v), ctx, 'Visual'),
      areaCena(cena.textoTela, 'Texto na tela', 1, (v) => (cena.textoTela = v), ctx, 'Texto na tela'),
    );
    const audio = areaCena(cena.fala, EXEMPLOS[cena.tipo], 3, (v) => (cena.fala = v), ctx, 'Fala');
    audio.classList.add('rte-av-audio');
    linha.append(id, video, audio);
    wrap.appendChild(linha);
  });
  const nova = buildBotao('Nova cena', { icone: ICONES.mais, variante: 'secundario' });
  nova.classList.add('rte-av-nova');
  nova.addEventListener('click', () => menuTipos(nova, (t) => inserirCena(ctx, ctx.r.cenas.length, t)));
  wrap.appendChild(nova);
  return wrap;
}

// ---------- Índice (esquerda) ----------

export function buildIndice(ctx: CtxEstudio): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rte-indice';
  const lista = document.createElement('ol');
  lista.className = 'rte-indice-lista';
  ctx.r.cenas.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = 'rte-indice-item';
    li.dataset.id = c.id;
    li.style.setProperty('--c', tipoDe(c.tipo).cor);
    const alca = document.createElement('span');
    alca.className = 'rte-indice-alca';
    alca.innerHTML = svg(ICONES.alca, 12, 2);
    alca.title = 'Arraste para reordenar';
    const ir = document.createElement('button');
    ir.type = 'button';
    ir.className = 'rte-indice-ir';
    ir.append(
      Object.assign(document.createElement('span'), { className: 'rte-indice-n', textContent: String(i + 1) }),
      Object.assign(document.createElement('span'), { className: 'rte-indice-titulo', textContent: c.titulo.trim() || tipoDe(c.tipo).rotulo }),
    );
    ir.title = `${tipoDe(c.tipo).rotulo}: ${c.titulo}`;
    ir.addEventListener('click', () => ctx.irParaCena(c.id));
    const tempo = seloTempo(ctx, c);
    li.append(alca, ir, tempo);
    lista.appendChild(li);
  });
  wrap.appendChild(lista);
  sortables.push(
    new Sortable(lista, {
      animation: 150,
      handle: '.rte-indice-alca',
      ghostClass: 'sortable-ghost',
      onEnd: (evt) => {
        if (evt.oldIndex === undefined || evt.newIndex === undefined || evt.oldIndex === evt.newIndex) return;
        mover(ctx.r.cenas, evt.oldIndex, evt.newIndex);
        ctx.mudouEstrutura();
      },
    }),
  );
  const nova = buildBotao('Nova cena', { icone: ICONES.mais, variante: 'secundario' });
  nova.classList.add('rte-indice-nova');
  nova.addEventListener('click', () => menuTipos(nova, (t) => inserirCena(ctx, ctx.r.cenas.length, t)));
  wrap.appendChild(nova);
  return wrap;
}
