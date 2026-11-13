import {
  APPS_WORKSPACE,
  FORMATOS,
  tamanhoLegivel,
  type AppWorkspace,
  type EstadoApp,
  type FormatoApp,
} from '../../../shared/types/workspace.types.js';
import { buildBotao, buildSelo, ICONES, svg, type Tom } from '../../ui/pagina.js';

/**
 * Peças do Workspace: o ícone de cada app, o céu com as órbitas, o selo de
 * situação e o botão que muda de forma (Instalar → anel de progresso → Abrir).
 * A tela (workspace.view.ts) só decide o que vai onde.
 */

export const ICONE_ABRIR = '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>';
export const ICONE_BAIXAR = ICONES.backup;
/** Martelo: o app ainda está sendo construído. */
const ICONE_OBRA = '<path d="m15 12-8.4 8.4a2 2 0 0 1-2.8-2.8L12.2 9.2"/><path d="M17.6 15 22 10.6"/><path d="m20.9 11.7-1.3-1.3c-.6-.6-.9-1.3-.9-2.1V7l-2.6-2.6A5.5 5.5 0 0 0 12.3 3H9l.9.8A6 6 0 0 1 12 8.4V10l2 2h1.2c.8 0 1.5.3 2.1.9l1.3 1.3"/>';
const ICONE_RELOGIO = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';

/** O gradiente do app, nas cores dele: a única cor de dado da tela. */
function defsDoApp(app: AppWorkspace): string {
  const h = app.matiz;
  const l = app.luz ?? 0.66;
  return (
    `<defs><linearGradient id="ws-g-${app.id}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="oklch(${l} 0.2 ${h})"/><stop offset="1" stop-color="oklch(${(l - 0.06).toFixed(2)} 0.21 ${h + (app.deriva ?? 42)})"/>` +
    '</linearGradient></defs>'
  );
}

export function iconeDoApp(app: AppWorkspace, tamanho: number): HTMLElement {
  const span = document.createElement('span');
  span.className = 'ws-icone';
  span.style.setProperty('--ws-tam', `${tamanho}px`);
  span.innerHTML = `<svg viewBox="0 0 64 64" width="${tamanho}" height="${tamanho}" aria-hidden="true">${defsDoApp(app)}${app.icone}</svg>`;
  return span;
}

// ---------- Situação ----------

const SELO: Record<EstadoApp['situacao'], (e: EstadoApp) => [string, Tom]> = {
  verificando: () => ['Procurando versões…', 'neutro'],
  'em-criacao': () => ['Em criação', 'neutro'],
  'nao-publicado': () => ['Em breve', 'neutro'],
  'sem-arquivo': () => ['Sem versão para este computador', 'atencao'],
  disponivel: (e) => [`Disponível · v${e.release?.versao ?? ''}`, 'neutro'],
  baixando: (e) => [`Baixando ${Math.round((e.progresso ?? 0) * 100)}%`, 'neutro'],
  conferindo: () => ['Conferindo o arquivo…', 'neutro'],
  instalando: () => ['Instalando…', 'neutro'],
  instalado: (e) => [e.instalacao?.versao ? `Instalado · v${e.instalacao.versao}` : 'Instalado', 'ok'],
  atualizacao: (e) => [`Atualização · v${e.release?.versao ?? ''}`, 'atencao'],
  erro: () => ['Não deu certo', 'erro'],
};

export function seloDaSituacao(e: EstadoApp): HTMLElement {
  const [texto, tom] = SELO[e.situacao](e);
  const selo = buildSelo(texto, tom);
  selo.classList.add('ws-selo');
  return selo;
}

/** O texto do selo, para a tela atualizar no lugar durante o download. */
export function textoDaSituacao(e: EstadoApp): string {
  return SELO[e.situacao](e)[0];
}

export function emAndamento(e: EstadoApp): boolean {
  return e.situacao === 'baixando' || e.situacao === 'conferindo' || e.situacao === 'instalando';
}

/** O formato que o botão vai usar: o escolhido na página, o último usado, ou o primeiro da release. */
export function formatoSugerido(e: EstadoApp, escolhido?: FormatoApp): FormatoApp | undefined {
  const disponiveis = e.release?.arquivos.map((a) => a.formato) ?? [];
  return [escolhido, e.formatoPreferido].find((f): f is FormatoApp => Boolean(f) && disponiveis.includes(f!)) ?? disponiveis[0];
}

// ---------- O botão que muda de forma ----------

export interface AcoesDoBotao {
  instalar: (formato?: FormatoApp) => void;
  cancelar: () => void;
  abrir: () => void;
  verificar: () => void;
  pagina: () => void;
}

/**
 * Anel de progresso: um conic-gradient no --p (0–100). O número no meio é
 * atualizado no lugar pela tela a cada push, sem redesenhar o resto.
 */
function anel(e: EstadoApp): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'ws-anel';
  wrap.dataset.anel = e.id;
  const indeterminado = e.situacao !== 'baixando';
  wrap.classList.toggle('is-indeterminado', indeterminado);
  wrap.style.setProperty('--p', String(Math.round((e.progresso ?? 0) * 100)));
  const num = document.createElement('span');
  num.className = 'ws-anel-num';
  num.textContent = indeterminado ? '' : `${Math.round((e.progresso ?? 0) * 100)}%`;
  if (indeterminado) num.innerHTML = svg(e.situacao === 'conferindo' ? ICONES.escudo : ICONE_BAIXAR, 14, 2.2);
  wrap.appendChild(num);
  wrap.setAttribute('role', 'progressbar');
  wrap.setAttribute('aria-label', SELO[e.situacao](e)[0]);
  if (!indeterminado) wrap.setAttribute('aria-valuenow', String(Math.round((e.progresso ?? 0) * 100)));
  return wrap;
}

export function buildAcao(app: AppWorkspace, e: EstadoApp, acoes: AcoesDoBotao, formato?: FormatoApp): HTMLElement {
  const box = document.createElement('div');
  box.className = 'ws-acao';
  const botao = (texto: string, icone: string, variante: 'primario' | 'secundario' | 'fantasma', fazer: () => void): HTMLButtonElement => {
    const b = buildBotao(texto, { icone, variante });
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      fazer();
    });
    box.appendChild(b);
    return b;
  };

  if (emAndamento(e)) {
    box.classList.add('is-andamento');
    box.appendChild(anel(e));
    const textos = document.createElement('div');
    textos.className = 'ws-acao-textos';
    const t = document.createElement('strong');
    t.textContent = SELO[e.situacao](e)[0];
    t.dataset.andamento = e.id;
    const sub = document.createElement('span');
    const f = e.formatoEmUso ? FORMATOS[e.formatoEmUso].rotulo : '';
    sub.textContent = e.situacao === 'baixando' ? f : e.situacao === 'conferindo' ? 'SHA-256 contra a lista da versão' : 'Pode levar um minuto';
    textos.append(t, sub);
    box.appendChild(textos);
    if (e.situacao === 'baixando') botao('Cancelar', ICONES.xis, 'fantasma', acoes.cancelar);
    return box;
  }

  const f = formatoSugerido(e, formato);
  const soBaixa = f ? !FORMATOS[f].instala : false;
  switch (e.situacao) {
    case 'instalado':
      botao('Abrir', ICONE_ABRIR, 'primario', acoes.abrir);
      break;
    case 'atualizacao':
      botao(`Atualizar para v${e.release?.versao ?? ''}`, ICONE_BAIXAR, 'primario', () => acoes.instalar(f));
      botao('Abrir', ICONE_ABRIR, 'secundario', acoes.abrir);
      break;
    case 'disponivel':
      botao(soBaixa ? 'Baixar' : 'Instalar', ICONE_BAIXAR, 'primario', () => acoes.instalar(f));
      break;
    case 'em-criacao': {
      const b = botao('Em criação', ICONE_OBRA, 'secundario', () => undefined);
      b.disabled = true;
      b.title = `${app.nome} está sendo feito. Quando sair a primeira versão, ele aparece aqui para instalar.`;
      break;
    }
    case 'nao-publicado': {
      const b = botao('Em breve', ICONE_RELOGIO, 'secundario', () => undefined);
      b.disabled = true;
      b.title = `${app.nome} ainda não tem uma versão pública no GitHub.`;
      botao('', ICONES.atualizar, 'fantasma', acoes.verificar).title = 'Procurar de novo';
      break;
    }
    case 'sem-arquivo':
      botao('Ver no GitHub', ICONES.externo, 'secundario', acoes.pagina);
      break;
    case 'verificando': {
      const b = botao('Procurando…', ICONES.atualizar, 'secundario', () => undefined);
      b.disabled = true;
      b.classList.add('is-girando');
      break;
    }
    case 'erro':
      botao('Tentar de novo', ICONES.atualizar, 'secundario', acoes.verificar);
      break;
    default:
      break;
  }
  return box;
}

/**
 * "v1.2 · 3 de nov. de 2026 · 24,5 MB" — só o que a release diz. No cartão da vitrine vai sem a
 * versão (`semVersao`): o selo ao lado já a mostra, e com ela a linha quebrava em duas.
 */
export function linhaDaVersao(e: EstadoApp, formato?: FormatoApp, semVersao = false): string {
  const r = e.release;
  if (!r) return '';
  const partes = semVersao ? [] : [`v${r.versao}`];
  if (r.publicadaEm) partes.push(new Date(r.publicadaEm).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }));
  const f = formatoSugerido(e, formato);
  const arquivo = r.arquivos.find((a) => a.formato === f);
  if (arquivo) partes.push(tamanhoLegivel(arquivo.tamanho));
  return partes.join(' · ');
}

// ---------- O céu: o Iris no centro e os apps em órbita ----------

/** Estrelas em posições fixas (o céu não pode mudar a cada redesenho). */
function estrelas(n: number): string {
  let s = 17;
  const aleatorio = (): number => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  let out = '';
  for (let i = 0; i < n; i++) {
    const r = (0.5 + aleatorio() * 1.1).toFixed(2);
    out += `<circle class="ws-estrela" style="--d:${(aleatorio() * 4).toFixed(2)}s" cx="${(aleatorio() * 420).toFixed(1)}" cy="${(aleatorio() * 280).toFixed(1)}" r="${r}"/>`;
  }
  return out;
}

const ORBITAS = [
  { rx: 92, ry: 40 },
  { rx: 142, ry: 62 },
  { rx: 192, ry: 84 },
];

/** Lugares ainda vazios, nas órbitas de dentro: o ecossistema tem espaço para crescer, sem inventar apps. */
const VAGAS = [
  { orbita: 0, angulo: 200 },
  { orbita: 0, angulo: 20 },
  { orbita: 1, angulo: 330 },
  { orbita: 1, angulo: 130 },
];

/**
 * Os apps ficam todos na órbita de fora, um a cada 45° a partir de 337,5° (o primeiro à direita, um pouco
 * acima do olho). Fórmula espalhada pelas três órbitas punha dois planetas um em cima do outro e um sobre o
 * olho; aqui cabem oito sem encostar, com o nome embaixo. Do nono em diante, o anel fica mais cheio.
 */
function lugarDoApp(i: number, total: number): [number, number] {
  const n = Math.max(8, total);
  const passo = 360 / n;
  // Simétrico em torno do topo (número par: dois ladeando o topo; ímpar: um no topo), com o primeiro
  // app o mais perto possível de 337,5° — com 9 a partir de 337,5° o anel ficava torto.
  const fase = (270 + (n % 2 === 0 ? passo / 2 : 0)) % passo;
  const inicio = fase + passo * Math.round((337.5 - fase) / passo);
  return ponto(2, inicio + i * passo);
}

/** Planeta menor que o ícone dos cartões: com oito no anel, 44 px encostavam. */
const PLANETA = 36;

function ponto(orbita: number, angulo: number): [number, number] {
  const o = ORBITAS[orbita];
  const rad = (angulo * Math.PI) / 180;
  return [210 + o.rx * Math.cos(rad), 140 + o.ry * Math.sin(rad)];
}

export function buildCeu(estados: EstadoApp[], aoEscolher: (appId: string) => void): HTMLElement {
  const box = document.createElement('div');
  box.className = 'ws-ceu-arte';
  let html =
    '<svg viewBox="0 0 420 280" aria-hidden="false" role="group" aria-label="Apps do ecossistema Iris">' +
    '<defs>' +
    '<linearGradient id="ws-olho" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color: var(--accent)"/><stop offset="1" style="stop-color: var(--acento-2)"/></linearGradient>' +
    '<radialGradient id="ws-halo"><stop offset="0" style="stop-color: var(--accent); stop-opacity: .45"/><stop offset="1" style="stop-color: var(--accent); stop-opacity: 0"/></radialGradient>' +
    '</defs>' +
    estrelas(46) +
    ORBITAS.map((o, i) => `<ellipse class="ws-orbita" style="--i:${i}" cx="210" cy="140" rx="${o.rx}" ry="${o.ry}"/>`).join('') +
    '<circle cx="210" cy="140" r="62" fill="url(#ws-halo)"/>' +
    // O olho do Iris, o mesmo desenho do trilho, no centro de tudo.
    '<g class="ws-sol" transform="translate(182 112) scale(.875)">' +
    '<path d="M2 32C14 11 50 11 62 32C50 53 14 53 2 32Z" fill="url(#ws-olho)"/>' +
    '<circle cx="32" cy="32" r="13.5" fill="#fff"/><circle class="ws-pupila" cx="32" cy="32" r="7"/><circle cx="35.2" cy="28.8" r="2.2" fill="#fff"/>' +
    '</g>';
  VAGAS.forEach((v) => {
    const [x, y] = ponto(v.orbita, v.angulo);
    html += `<circle class="ws-vaga" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/>`;
  });
  html += '</svg>';
  box.innerHTML = html;
  const svgEl = box.querySelector('svg')!;

  // Os apps de verdade, em órbita, na frente (z) do que está atrás do sol.
  APPS_WORKSPACE.forEach((app, i) => {
    const e = estados.find((x) => x.id === app.id);
    const [x, y] = lugarDoApp(i, APPS_WORKSPACE.length);
    const meio = PLANETA / 2;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `ws-planeta is-${e?.situacao ?? 'nao-publicado'}`);
    g.setAttribute('transform', `translate(${(x - meio).toFixed(1)} ${(y - meio).toFixed(1)})`);
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${app.nome}: ${e ? SELO[e.situacao](e)[0] : ''}`);
    g.innerHTML =
      '<g class="ws-planeta-corpo">' +
      `<circle class="ws-planeta-aura" cx="${meio}" cy="${meio}" r="${meio + 4}"/>` +
      `<svg x="0" y="0" width="${PLANETA}" height="${PLANETA}" viewBox="0 0 64 64">${defsDoApp(app)}${app.icone}</svg>` +
      (e?.situacao === 'atualizacao' ? `<circle class="ws-planeta-ponto" cx="${PLANETA - 3}" cy="4" r="4"/>` : '') +
      `<text class="ws-planeta-nome" x="${meio}" y="${PLANETA + 14}" text-anchor="middle"></text>` +
      '</g>';
    // Pela classe: o ícone pode ter <text> próprio (o "PDF" do Iris PDF) antes do rótulo.
    g.querySelector('.ws-planeta-nome')!.textContent = app.nome;
    g.addEventListener('click', () => aoEscolher(app.id));
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        aoEscolher(app.id);
      }
    });
    svgEl.appendChild(g);
  });
  return box;
}
