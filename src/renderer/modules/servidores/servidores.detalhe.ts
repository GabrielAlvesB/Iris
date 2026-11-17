import type { Checagem, ComandoSalvo, ServidorHttp, ServidorSsh, SshSaidaChunk } from '../../../shared/types/servidores.types';
import { mensagemDeErro, openAvisoModal, openConfirmModal, openFormModal } from '../../ui/modal.js';
import { buildBotao, buildSelo, ICONES, svg, tempoRelativo, type Tom } from '../../ui/pagina.js';
import { COFRE } from '../../ui/plataforma.js';
import { ICONE_SITE, ICONE_TERMINAL } from './servidores.cadastro.js';
import * as servidoresState from './servidores.state.js';
import * as terminais from './servidores.terminal.js';

/** O lado direito da tela quando um servidor está escolhido (e nenhum terminal em foco). */

export interface CtxDetalhe {
  /** Abre um terminal novo neste servidor e põe a aba dele em foco. */
  abrirTerminal(servidorId: string): void;
  /** Põe em foco a aba de um terminal já aberto. */
  irParaTerminal(sessaoId: string): void;
  editar(): void;
  remover(): void;
}

export const ICONE_EDITAR = '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>';
export const ICONE_LIXEIRA = '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>';
export const ICONE_MAIS = '<path d="M12 5v14"/><path d="M5 12h14"/>';
const ICONE_RAIO = '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>';
const ICONE_CHAVE = '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function botao(texto: string, opcoes: Parameters<typeof buildBotao>[1], fazer: () => unknown): HTMLButtonElement {
  const b = buildBotao(texto, opcoes);
  b.type = 'button';
  b.addEventListener('click', () => {
    void Promise.resolve()
      .then(fazer)
      .catch((erro: unknown) => openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true }));
  });
  return b;
}

// ---------- Situação (usada também pela lista) ----------

export function ultimaChecagem(s: ServidorHttp): Checagem | undefined {
  return s.historico[s.historico.length - 1];
}

export function situacaoHttp(s: ServidorHttp): { tom: Tom; texto: string } {
  const ultima = ultimaChecagem(s);
  if (!ultima) return { tom: 'neutro', texto: 'Ainda não checado' };
  if (!ultima.ok) return { tom: 'erro', texto: 'Fora do ar' };
  if ((ultima.latenciaMs ?? 0) > 2000) return { tom: 'atencao', texto: 'Lento' };
  return { tom: 'ok', texto: 'No ar' };
}

/** Disponibilidade e latência média das checagens das últimas 24 h. */
function resumo24h(s: ServidorHttp): { disponibilidade?: number; media?: number; quedas: number; total: number } {
  const desde = Date.now() - 86_400_000;
  const dia = s.historico.filter((c) => new Date(c.em).getTime() >= desde);
  if (dia.length === 0) return { quedas: 0, total: 0 };
  const ok = dia.filter((c) => c.ok);
  const latencias = ok.map((c) => c.latenciaMs ?? 0);
  return {
    disponibilidade: (ok.length / dia.length) * 100,
    media: latencias.length ? Math.round(latencias.reduce((a, b) => a + b, 0) / latencias.length) : undefined,
    quedas: dia.length - ok.length,
    total: dia.length,
  };
}

function formatarPct(n: number): string {
  return `${n >= 99.95 ? '100' : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

// ---------- HTTP ----------

const NS = 'http://www.w3.org/2000/svg';
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
  return e;
}

/** Latência das últimas checagens: área no acento, quedas como marcas vermelhas no pé. */
function buildGraficoLatencia(servidor: ServidorHttp): HTMLElement {
  const cartao = el('section', 'sv-cartao sv-grafico');
  const cab = el('header', 'sv-cartao-cab');
  cab.append(el('h3', undefined, 'Tempo de resposta'), el('span', 'sv-cartao-sub', 'Últimas 60 checagens'));
  cartao.appendChild(cab);

  const pontos = servidor.historico.slice(-60);
  if (pontos.length < 2) {
    cartao.appendChild(el('p', 'sv-nota', 'O gráfico aparece depois de duas checagens.'));
    return cartao;
  }

  const L = 640;
  const A = 150;
  const [esq, dir, topo, base] = [44, 8, 10, 18];
  const largura = L - esq - dir;
  const altura = A - topo - base;
  const maior = Math.max(100, ...pontos.map((c) => (c.ok ? (c.latenciaMs ?? 0) : 0)));
  const teto = Math.ceil(maior / 100) * 100;
  const x = (i: number): number => esq + (i / (pontos.length - 1)) * largura;
  const y = (v: number): number => topo + altura - (v / teto) * altura;

  const svgEl = s('svg', { viewBox: `0 0 ${L} ${A}`, class: 'sv-grafico-svg', role: 'img', 'aria-label': `Tempo de resposta das últimas ${pontos.length} checagens` });
  const id = `sv-area-${servidor.id.slice(0, 8)}`;
  const defs = s('defs', {});
  const grad = s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(s('stop', { offset: '0%', class: 'sv-grafico-stop-a' }), s('stop', { offset: '100%', class: 'sv-grafico-stop-b' }));
  defs.appendChild(grad);
  svgEl.appendChild(defs);

  [0, 0.5, 1].forEach((f) => {
    const valor = teto * f;
    svgEl.appendChild(s('line', { x1: esq, x2: L - dir, y1: y(valor), y2: y(valor), class: 'sv-grafico-grade' }));
    const t = s('text', { x: esq - 8, y: y(valor) + 4, class: 'sv-grafico-eixo', 'text-anchor': 'end' });
    t.textContent = `${Math.round(valor)} ms`;
    svgEl.appendChild(t);
  });

  const valores = pontos.map((c) => (c.ok ? (c.latenciaMs ?? 0) : null));
  let linha = '';
  valores.forEach((v, i) => {
    if (v === null) return;
    linha += `${linha && valores[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  const primeiros = valores.map((v, i) => [v, i] as const).filter(([v]) => v !== null);
  if (primeiros.length) {
    const ini = primeiros[0]![1];
    const fim = primeiros[primeiros.length - 1]![1];
    const area = `M${x(ini)},${y(0)} ${valores
      .map((v, i) => (v === null || i < ini || i > fim ? '' : `L${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .join(' ')} L${x(fim)},${y(0)} Z`;
    svgEl.appendChild(s('path', { d: area, fill: `url(#${id})` }));
  }
  svgEl.appendChild(s('path', { d: linha, class: 'sv-grafico-linha' }));

  pontos.forEach((c, i) => {
    const alvo = s('rect', { x: x(i) - largura / pontos.length / 2, y: topo, width: largura / pontos.length, height: altura, class: 'sv-grafico-alvo' });
    const titulo = s('title', {});
    titulo.textContent = `${new Date(c.em).toLocaleString('pt-BR')} — ${c.ok ? `${c.latenciaMs} ms` : (c.erro ?? 'falhou')}`;
    alvo.appendChild(titulo);
    svgEl.appendChild(alvo);
    if (!c.ok) svgEl.appendChild(s('rect', { x: x(i) - 2, y: A - base + 6, width: 4, height: 8, rx: 1, class: 'sv-grafico-queda' }));
  });

  cartao.appendChild(svgEl);
  const legenda = el('div', 'sv-grafico-legenda');
  legenda.append(el('span', 'sv-leg is-linha', 'Tempo de resposta'), el('span', 'sv-leg is-queda', 'Checagem que falhou'));
  cartao.appendChild(legenda);
  return cartao;
}

function buildUltimas(servidor: ServidorHttp): HTMLElement {
  const cartao = el('section', 'sv-cartao');
  const cab = el('header', 'sv-cartao-cab');
  cab.append(el('h3', undefined, 'Últimas checagens'));
  cartao.appendChild(cab);
  const recentes = servidor.historico.slice(-8).reverse();
  if (recentes.length === 0) {
    cartao.appendChild(el('p', 'sv-nota', 'Nenhuma checagem ainda. Use "Checar agora" ou espere o próximo ciclo.'));
    return cartao;
  }
  const lista = el('ul', 'sv-checagens');
  recentes.forEach((c) => {
    const li = el('li', `sv-checagem ${c.ok ? 'is-ok' : 'is-falha'}`);
    li.appendChild(buildSelo(c.ok ? 'OK' : 'Falhou', c.ok ? 'ok' : 'erro'));
    li.appendChild(el('span', 'sv-checagem-quando', new Date(c.em).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })));
    li.appendChild(el('span', 'sv-checagem-info', c.ok ? `HTTP ${c.status} · ${c.latenciaMs} ms` : (c.erro ?? 'falhou')));
    lista.appendChild(li);
  });
  cartao.appendChild(lista);
  return cartao;
}

export function buildDetalheHttp(servidor: ServidorHttp, ctx: CtxDetalhe): HTMLElement {
  const wrap = el('div', 'sv-detalhe-corpo');
  const situacao = situacaoHttp(servidor);
  const ultima = ultimaChecagem(servidor);
  const r = resumo24h(servidor);

  const hero = el('section', `sv-hero is-${situacao.tom}`);
  const topo = el('div', 'sv-hero-topo');
  const icone = el('span', 'sv-hero-icone');
  icone.innerHTML = svg(ICONE_SITE, 22, 1.8);
  const textos = el('div', 'sv-hero-textos');
  const linhaNome = el('div', 'sv-hero-linha');
  linhaNome.append(el('h2', 'sv-hero-nome', servidor.nome), buildSelo(situacao.texto, situacao.tom));
  const link = el('button', 'sv-hero-alvo', servidor.url);
  link.type = 'button';
  link.title = 'Abrir no navegador';
  link.addEventListener('click', () => void window.irisAPI.system.openExternalLink(servidor.url));
  textos.append(linhaNome, link);
  const acoes = el('div', 'sv-hero-acoes');
  const checar = botao('Checar agora', { icone: ICONES.atualizar, variante: 'primario' }, async () => {
    checar.disabled = true;
    try {
      await servidoresState.checarAgora(servidor.id);
    } finally {
      checar.disabled = false;
    }
  });
  acoes.append(checar, botao('', { icone: ICONE_EDITAR, titulo: 'Editar', variante: 'fantasma' }, ctx.editar), botao('', { icone: ICONE_LIXEIRA, titulo: 'Remover', variante: 'fantasma' }, ctx.remover));
  topo.append(icone, textos, acoes);
  hero.appendChild(topo);

  const fatos = el('dl', 'sv-hero-fatos');
  const fato = (rotulo: string, valor: string, detalhe?: string): void => {
    const d = el('div', 'sv-fato');
    d.append(el('dt', undefined, rotulo), el('dd', undefined, valor));
    if (detalhe) d.appendChild(el('span', 'sv-fato-detalhe', detalhe));
    fatos.appendChild(d);
  };
  fato('Última resposta', ultima?.ok ? `${ultima.latenciaMs} ms` : ultima ? 'sem resposta' : '—', tempoRelativo(ultima?.em));
  fato('No ar em 24 h', r.disponibilidade !== undefined ? formatarPct(r.disponibilidade) : '—', r.total ? `${r.total} checagens${r.quedas ? ` · ${r.quedas} com falha` : ''}` : undefined);
  fato('Média em 24 h', r.media !== undefined ? `${r.media} ms` : '—');
  fato('Checagem', servidor.intervaloSegundos > 0 ? `a cada ${rotuloIntervalo(servidor.intervaloSegundos)}` : 'só manual', `${servidor.metodo} · espera ${servidor.statusEsperado}`);
  hero.appendChild(fatos);
  if (ultima && !ultima.ok && ultima.erro) hero.appendChild(el('p', 'sv-hero-erro', ultima.erro));
  wrap.appendChild(hero);

  wrap.append(buildGraficoLatencia(servidor), buildUltimas(servidor));
  return wrap;
}

function rotuloIntervalo(seg: number): string {
  if (seg < 60) return `${seg} s`;
  if (seg < 3600) return `${Math.round(seg / 60)} min`;
  return `${Math.round(seg / 3600)} h`;
}

// ---------- SSH ----------

/** Saída do último comando de cada servidor: sobrevive ao redesenho (a tela redesenha a cada checagem). */
const saidas = new Map<string, { comandoId: string; texto: string; rodando: boolean }>();
const paineisSaida = new Map<string, HTMLElement>();

export function receberSaida(chunk: SshSaidaChunk): void {
  const atual = saidas.get(chunk.servidorId);
  if (!atual || atual.comandoId !== chunk.comandoId) return;
  const pedaco = chunk.stream === 'fim' ? `\n— ${chunk.texto}${chunk.exitCode !== undefined ? ` (código ${chunk.exitCode})` : ''}\n` : chunk.texto;
  atual.texto += pedaco;
  if (chunk.stream === 'fim') atual.rodando = false;
  const pre = paineisSaida.get(chunk.servidorId);
  if (pre?.isConnected) {
    pre.textContent = atual.texto;
    pre.scrollTop = pre.scrollHeight;
    pre.closest('.sv-saida')?.classList.toggle('is-rodando', atual.rodando);
  }
}

export function limparSaidas(): void {
  saidas.clear();
  paineisSaida.clear();
}

async function editarComando(servidor: ServidorSsh, comando?: ComandoSalvo): Promise<void> {
  const r = await openFormModal(
    comando ? 'Editar comando' : 'Novo comando',
    [
      { name: 'rotulo', label: 'Nome', defaultValue: comando?.rotulo ?? '', placeholder: 'Ex.: Containers rodando' },
      { name: 'comando', label: 'Comando', type: 'textarea', defaultValue: comando?.comando ?? '', placeholder: 'docker ps --format "table {{.Names}}\\t{{.Status}}"' },
    ],
    'Salvar',
    { icone: ICONE_TERMINAL, subtitulo: 'Roda com um clique e mostra a saída — ou é digitado no terminal aberto.', largura: 520 },
  );
  if (!r) return;
  await servidoresState.salvarComando({ servidorId: servidor.id, comandoId: comando?.id, rotulo: r.rotulo ?? '', comando: r.comando ?? '' });
}

export function buildDetalheSsh(servidor: ServidorSsh, ctx: CtxDetalhe): HTMLElement {
  const wrap = el('div', 'sv-detalhe-corpo');
  const abertas = terminais.sessoes().filter((x) => x.servidorId === servidor.id);
  const conectado = abertas.some((x) => x.aberta);

  const hero = el('section', `sv-hero is-ssh${conectado ? ' is-ok' : ''}`);
  const topo = el('div', 'sv-hero-topo');
  const icone = el('span', 'sv-hero-icone');
  icone.innerHTML = svg(ICONE_TERMINAL, 22, 1.8);
  const textos = el('div', 'sv-hero-textos');
  const linhaNome = el('div', 'sv-hero-linha');
  linhaNome.appendChild(el('h2', 'sv-hero-nome', servidor.nome));
  if (conectado) linhaNome.appendChild(buildSelo(abertas.length > 1 ? `${abertas.filter((x) => x.aberta).length} terminais abertos` : 'Terminal aberto', 'ok'));
  textos.append(linhaNome, el('code', 'sv-hero-alvo is-mono', `${servidor.usuario}@${servidor.host}${servidor.porta !== 22 ? `:${servidor.porta}` : ''}`));
  const acoes = el('div', 'sv-hero-acoes');
  acoes.append(botao('', { icone: ICONE_EDITAR, titulo: 'Editar', variante: 'fantasma' }, ctx.editar), botao('', { icone: ICONE_LIXEIRA, titulo: 'Remover', variante: 'fantasma' }, ctx.remover));
  topo.append(icone, textos, acoes);
  hero.appendChild(topo);

  const entrar = el('div', 'sv-entrar');
  const abrir = botao('Abrir terminal', { icone: ICONE_TERMINAL, variante: 'primario' }, () => ctx.abrirTerminal(servidor.id));
  abrir.classList.add('sv-entrar-botao');
  entrar.appendChild(abrir);
  abertas.forEach((x) => {
    const chip = el('button', `sv-sessao-chip${x.aberta ? '' : ' is-fechada'}`);
    chip.type = 'button';
    chip.append(el('span', 'sv-ponto'), el('span', undefined, x.titulo));
    chip.title = x.aberta ? 'Ir para este terminal' : (x.motivo ?? 'Desconectado');
    chip.addEventListener('click', () => ctx.irParaTerminal(x.sessaoId));
    entrar.appendChild(chip);
  });
  hero.appendChild(entrar);

  const fatos = el('dl', 'sv-hero-fatos');
  const fato = (rotulo: string, valor: string, detalhe?: string, mono = false): void => {
    const d = el('div', 'sv-fato');
    const dd = el('dd', mono ? 'is-mono' : undefined, valor);
    d.append(el('dt', undefined, rotulo), dd);
    if (detalhe) d.appendChild(el('span', 'sv-fato-detalhe', detalhe));
    fatos.appendChild(d);
  };
  fato(
    'Entra com',
    servidor.autenticacao === 'senha' ? 'Senha' : 'Chave privada',
    servidor.autenticacao === 'senha'
      ? servidor.temSenha
        ? `guardada no ${COFRE}`
        : 'nenhuma senha salva'
      : `${servidor.caminhoChave.split(/[\\/]/).pop()}${servidor.temPassphrase ? ' · com passphrase' : ''}`,
  );
  fato('Porta', String(servidor.porta));
  fato(
    'Chave do servidor',
    servidor.impressaoDigital ? servidor.impressaoDigital.replace(/^SHA256:/, '').slice(0, 16) + '…' : 'ainda não vista',
    servidor.impressaoDigital ? 'conferida a cada conexão' : 'gravada na primeira conexão',
    Boolean(servidor.impressaoDigital),
  );
  if (servidor.impressaoDigital) {
    const ultimo = fatos.lastElementChild as HTMLElement;
    ultimo.title = servidor.impressaoDigital;
  }
  hero.appendChild(fatos);
  wrap.appendChild(hero);

  wrap.appendChild(buildComandos(servidor, abertas.find((x) => x.aberta)?.sessaoId));
  return wrap;
}

function buildComandos(servidor: ServidorSsh, sessaoAberta: string | undefined): HTMLElement {
  const cartao = el('section', 'sv-cartao');
  const cab = el('header', 'sv-cartao-cab');
  cab.append(el('h3', undefined, 'Comandos salvos'), el('span', 'sv-cartao-sub', 'Os que você roda sempre, a um clique'));
  const novo = botao('Novo comando', { icone: ICONE_MAIS }, () => editarComando(servidor));
  cab.appendChild(novo);
  cartao.appendChild(cab);

  if (servidor.comandos.length === 0) {
    const vazio = el('div', 'sv-comandos-vazio');
    vazio.append(el('p', undefined, 'Nenhum comando ainda. Bons para começar:'));
    const sugestoes = el('div', 'sv-sugestoes');
    [
      ['Uso do disco', 'df -h'],
      ['Memória', 'free -h'],
      ['Há quanto tempo está ligado', 'uptime'],
      ['Containers', 'docker ps'],
    ].forEach(([rotulo, comando]) => {
      const b = el('button', 'sv-sugestao');
      b.type = 'button';
      b.append(el('strong', undefined, rotulo), el('code', undefined, comando));
      b.addEventListener('click', () => void servidoresState.salvarComando({ servidorId: servidor.id, rotulo: rotulo!, comando: comando! }));
      sugestoes.appendChild(b);
    });
    vazio.appendChild(sugestoes);
    cartao.appendChild(vazio);
    return cartao;
  }

  const grade = el('div', 'sv-comandos');
  servidor.comandos.forEach((c) => {
    const item = el('div', 'sv-comando');
    const rodando = saidas.get(servidor.id)?.comandoId === c.id && saidas.get(servidor.id)?.rodando;
    item.classList.toggle('is-rodando', Boolean(rodando));
    const textos = el('div', 'sv-comando-textos');
    textos.append(el('strong', undefined, c.rotulo), el('code', undefined, c.comando));
    const acoes = el('div', 'sv-comando-acoes');
    acoes.appendChild(
      botao('Rodar', { icone: ICONES.play, variante: 'secundario', titulo: 'Rodar e mostrar a saída aqui' }, async () => {
        saidas.set(servidor.id, { comandoId: c.id, texto: `$ ${c.comando}\n`, rodando: true });
        const pre = paineisSaida.get(servidor.id);
        if (pre?.isConnected) {
          pre.textContent = `$ ${c.comando}\n`;
          pre.closest('.sv-saida')?.classList.add('is-rodando');
          pre.closest('.sv-saida')?.removeAttribute('hidden');
        }
        await servidoresState.rodarComando({ servidorId: servidor.id, comandoId: c.id });
      }),
    );
    if (sessaoAberta) {
      acoes.appendChild(
        botao('', { icone: ICONE_RAIO, variante: 'fantasma', titulo: 'Digitar no terminal aberto' }, () => {
          terminais.digitar(sessaoAberta, c.comando);
        }),
      );
    }
    acoes.append(
      botao('', { icone: ICONE_EDITAR, variante: 'fantasma', titulo: 'Editar' }, () => editarComando(servidor, c)),
      botao('', { icone: ICONE_LIXEIRA, variante: 'fantasma', titulo: 'Remover' }, async () => {
        const ok = await openConfirmModal({ title: 'Remover comando?', message: `"${c.rotulo}" sai da lista deste servidor.`, confirmText: 'Remover' });
        if (ok) await servidoresState.removerComando({ servidorId: servidor.id, comandoId: c.id });
      }),
    );
    item.append(textos, acoes);
    grade.appendChild(item);
  });
  cartao.appendChild(grade);

  const atual = saidas.get(servidor.id);
  const saida = el('div', `sv-saida${atual?.rodando ? ' is-rodando' : ''}`);
  if (!atual) saida.hidden = true;
  const saidaCab = el('div', 'sv-saida-cab');
  saidaCab.append(el('span', undefined, 'Saída'), el('span', 'sv-saida-rodando', 'rodando…'));
  const limpar = el('button', 'sv-saida-limpar', 'Limpar');
  limpar.type = 'button';
  limpar.addEventListener('click', () => {
    saidas.delete(servidor.id);
    saida.hidden = true;
  });
  saidaCab.appendChild(limpar);
  const pre = el('pre', 'sv-saida-texto', atual?.texto ?? '');
  paineisSaida.set(servidor.id, pre);
  saida.append(saidaCab, pre);
  cartao.appendChild(saida);
  requestAnimationFrame(() => (pre.scrollTop = pre.scrollHeight));
  return cartao;
}

export { ICONE_CHAVE };
