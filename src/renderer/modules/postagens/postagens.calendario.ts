import type { RedeSocial } from '../../../shared/types/postagens.types.js';
import { buildSegmentado, buildSelo, svg, type Tom } from '../../ui/pagina.js';
import { openCustomModal } from '../../ui/modal.js';
import { buildLogoRede } from './postagens.logos.js';
import { faseDe, rotuloEtapa, type Fonte, type Postagem } from './postagens.fonte.js';
import { DIAS_CURTOS, buildNavegadorPeriodo, diaDaSemana, diaPorExtenso, partesData, somarMeses, tituloDaSemana, tituloDoMes } from './postagens.periodo.js';
import * as videosState from './videos/videos.state.js';
import {
  ICONES_POSTAGEM,
  atrasado,
  buildPrioridade,
  buildRedeBadge,
  hojeIso,
  inicioDaSemana,
  redesDe,
  somarDias,
  tituloExibido,
} from './postagens.ui.js';

/**
 * Calendário de publicação: mês ou semana por horário, com um painel fixo à
 * direita — o dia escolhido (tudo daquele dia, por horário) ou a lista do que
 * ainda não tem data. Arrastar reagenda: para outro dia, outra hora, para o
 * painel do dia ou de volta para "Sem data".
 *
 * Funciona para qualquer tipo de postagem: tudo o que é do tipo vem da Fonte.
 */

type Visao = 'mes' | 'semana';
type AbaLateral = 'dia' | 'semdata';

export interface CalendarioOpcoes {
  visivel: (item: Postagem) => boolean;
  abrir: (videoId: string) => void;
  criarEm: (data: string, hora?: string) => void;
  falhou: (erro: unknown) => void;
  redesenhar: () => void;
}

const CHAVE_PREFS = 'iris.postagens.calendario';

function lerPrefs(): { visao: Visao; aba: AbaLateral } {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PREFS) ?? '{}') as { visao?: unknown; aba?: unknown };
    return { visao: p.visao === 'semana' ? 'semana' : 'mes', aba: p.aba === 'semdata' ? 'semdata' : 'dia' };
  } catch {
    return { visao: 'mes', aba: 'dia' };
  }
}

function gravarPrefs(): void {
  try {
    localStorage.setItem(CHAVE_PREFS, JSON.stringify({ visao, aba: abaLateral }));
  } catch {
    // Sem localStorage o calendário só não lembra a escolha.
  }
}

const prefs = lerPrefs();
let visao: Visao = prefs.visao;
let abaLateral: AbaLateral = prefs.aba;
let referencia = hojeIso();
/** Dia mostrado no painel lateral; começa em hoje. */
let diaSelecionado = hojeIso();
/** Rolagem da grade semanal, para o redesenho não voltar ao topo. */
let rolagemSemana: number | null = null;

/** Cartõezinhos por dia no mês antes do "+N" (a célula não estica a semana). */
const MAX_POR_DIA = 3;
const TIPO_ARRASTE = 'application/x-iris-postagem';
/** Abaixo desta largura o painel desce para baixo da grade e o dia abre num modal. */
const LARGURA_COM_PAINEL = 1000;

function ordenarPorHora(a: Postagem, b: Postagem): number {
  return (a.horaAgendada ?? '99:99').localeCompare(b.horaAgendada ?? '99:99') || a.seq - b.seq;
}

// ---------- Situação ----------

type Situacao = 'publicado' | 'atrasado' | 'agendado' | 'planejado';

function situacaoDe(video: Postagem): Situacao {
  if (video.status === 'publicado') return 'publicado';
  if (atrasado(video)) return 'atrasado';
  if (video.status === 'agendado') return 'agendado';
  return 'planejado';
}

/** A cor da barra do cartão nunca fala sozinha: o rótulo vai no title, no painel e na legenda. */
const SITUACAO: Record<Situacao, { rotulo: string; tom: Tom }> = {
  publicado: { rotulo: 'Publicado', tom: 'ok' },
  agendado: { rotulo: 'Agendado', tom: 'atencao' },
  atrasado: { rotulo: 'Data vencida', tom: 'erro' },
  planejado: { rotulo: 'Em produção', tom: 'neutro' },
};

// ---------- Arrastar e soltar ----------

function tornarArrastavel(el: HTMLElement, video: Postagem): void {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer?.setData(TIPO_ARRASTE, video.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    el.classList.add('is-arrastando');
  });
  el.addEventListener('dragend', () => el.classList.remove('is-arrastando'));
}

/**
 * Alvo de soltura. `hora`: número = aquela hora (mantém os minutos se a hora
 * não mudar); null = mantém a hora que já tinha; '' = tira a hora ("dia todo").
 */
function tornarAlvo(el: HTMLElement, fonte: Fonte, data: string, hora: number | null | '', opcoes: CalendarioOpcoes): void {
  el.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes(TIPO_ARRASTE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('is-alvo');
  });
  el.addEventListener('dragleave', (e) => {
    if (!el.contains(e.relatedTarget as Node | null)) el.classList.remove('is-alvo');
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('is-alvo');
    const video = fonte.itens.find((v) => v.id === e.dataTransfer?.getData(TIPO_ARRASTE));
    if (!video) return;
    let horaNova = video.horaAgendada ?? '';
    if (hora === '') horaNova = '';
    else if (hora !== null) {
      const hh = String(hora).padStart(2, '0');
      horaNova = video.horaAgendada?.startsWith(`${hh}:`) ? video.horaAgendada : `${hh}:00`;
    }
    if (video.dataAgendada === data && (video.horaAgendada ?? '') === horaNova) return;
    void fonte.agendar(video.id, data, horaNova).catch(opcoes.falhou);
  });
}

// ---------- Entradas (uma por postagem, ou uma por rede) ----------

interface Entrada {
  video: Postagem;
  rede?: RedeSocial;
}

function entradasDe(fonte: Fonte, videos: Postagem[]): Entrada[] {
  if (!fonte.catalogo.preferencias.calendarioPorRede) return videos.map((video) => ({ video }));
  return videos.flatMap((video) => {
    const redes = redesDe(fonte.catalogo, video);
    return redes.length ? redes.map((rede) => ({ video, rede })) : [{ video }];
  });
}

function buildMarcaRede(rede: RedeSocial | undefined): HTMLElement {
  if (rede) {
    const logo = buildLogoRede(rede, 16, 'circulo');
    logo.classList.add('vd-cal-rede');
    return logo;
  }
  const marca = document.createElement('span');
  marca.className = 'vd-cal-rede is-vazia';
  marca.title = 'Sem rede definida';
  return marca;
}

/** Por postagem, a primeira rede e quantas mais; por rede, a própria. */
function buildRedesDaEntrada(fonte: Fonte, entrada: Entrada): HTMLElement {
  if (entrada.rede || fonte.catalogo.preferencias.calendarioPorRede) return buildMarcaRede(entrada.rede);
  const redes = redesDe(fonte.catalogo, entrada.video);
  const pilha = document.createElement('span');
  pilha.className = 'vd-cal-redes-pilha';
  pilha.appendChild(buildMarcaRede(redes[0]));
  if (redes.length > 1) {
    const mais = document.createElement('span');
    mais.className = 'vd-cal-rede-mais';
    mais.textContent = `+${redes.length - 1}`;
    pilha.appendChild(mais);
  }
  return pilha;
}

function dicaDe(fonte: Fonte, video: Postagem): string {
  const redes = redesDe(fonte.catalogo, video);
  return [
    tituloExibido(fonte.catalogo, video),
    `${SITUACAO[situacaoDe(video)].rotulo} · ${rotuloEtapa(fonte, video.status)}${video.horaAgendada ? ` · ${video.horaAgendada}` : ''}`,
    redes.length ? redes.map((r) => r.nome).join(', ') : 'Sem rede',
    video.score !== undefined ? `Score: ${video.score.toLocaleString('pt-BR')}` : '',
    fonte.dicaExtra?.(video) ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------- Cartãozinho da grade ----------

/** Barra na cor da situação, rede, hora e título — o que cabe numa célula do mês ou num horário da semana. */
function buildItem(fonte: Fonte, entrada: Entrada, opcoes: CalendarioOpcoes, comHora = true): HTMLElement {
  const { video } = entrada;
  const item = document.createElement('button');
  item.type = 'button';
  item.className = `vd-cal-item is-${situacaoDe(video)}`;
  item.title = dicaDe(fonte, video);
  item.appendChild(buildRedesDaEntrada(fonte, entrada));
  if (comHora && video.horaAgendada) {
    const hora = document.createElement('span');
    hora.className = 'vd-cal-item-hora';
    hora.textContent = video.horaAgendada;
    item.appendChild(hora);
  }
  const titulo = document.createElement('span');
  titulo.className = 'vd-cal-item-titulo';
  titulo.textContent = tituloExibido(fonte.catalogo, video);
  item.appendChild(titulo);
  if (video.prioridade === 'alta') item.appendChild(buildPrioridade('alta', true));
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    opcoes.abrir(video.id);
  });
  tornarArrastavel(item, video);
  return item;
}

// ---------- Linha completa (painel do dia e modal) ----------

/** Horário à esquerda; título, redes, etapa e o selo da situação por extenso. */
function buildLinhaDoDia(fonte: Fonte, entrada: Entrada, opcoes: CalendarioOpcoes): HTMLElement {
  const { video } = entrada;
  const situacao = situacaoDe(video);
  const linha = document.createElement('button');
  linha.type = 'button';
  linha.className = `vd-cal-dia-item is-${situacao}`;
  linha.title = dicaDe(fonte, video);

  const hora = document.createElement('span');
  hora.className = 'vd-cal-dia-hora';
  hora.textContent = video.horaAgendada ?? 'dia todo';
  linha.appendChild(hora);

  const corpo = document.createElement('span');
  corpo.className = 'vd-cal-dia-corpo';
  const titulo = document.createElement('span');
  titulo.className = 'vd-cal-dia-titulo';
  titulo.textContent = tituloExibido(fonte.catalogo, video);
  corpo.appendChild(titulo);

  const meta = document.createElement('span');
  meta.className = 'vd-cal-dia-meta';
  const redes = entrada.rede ? [entrada.rede] : redesDe(fonte.catalogo, video);
  if (redes.length) {
    const wrap = document.createElement('span');
    wrap.className = 'vd-cal-dia-redes';
    redes.slice(0, 4).forEach((r) => wrap.appendChild(buildRedeBadge(r)));
    meta.appendChild(wrap);
  }
  // Publicado e agendado já estão no selo da situação; a etapa só aparece quando diz mais (Roteiro, Edição…).
  if (video.status !== 'publicado' && video.status !== 'agendado') {
    const etapa = document.createElement('span');
    etapa.className = `vd-cal-dia-etapa is-fase-${faseDe(fonte, video.status)}`;
    etapa.textContent = rotuloEtapa(fonte, video.status);
    meta.appendChild(etapa);
  }
  if (video.prioridade) meta.appendChild(buildPrioridade(video.prioridade, true));
  corpo.appendChild(meta);
  linha.appendChild(corpo);

  linha.appendChild(buildSelo(SITUACAO[situacao].rotulo, SITUACAO[situacao].tom));

  linha.addEventListener('click', () => opcoes.abrir(video.id));
  tornarArrastavel(linha, video);
  return linha;
}

function resumoDoDia(entradas: Entrada[]): string {
  if (!entradas.length) return 'Nada marcado';
  const noAr = entradas.filter((e) => e.video.status === 'publicado').length;
  const total = `${entradas.length} ${entradas.length === 1 ? 'publicação' : 'publicações'}`;
  return noAr ? `${total} · ${noAr} já no ar` : total;
}

/** Tela estreita (sem painel ao lado): o dia abre num modal. */
function abrirDia(fonte: Fonte, data: string, videos: Postagem[], opcoes: CalendarioOpcoes): void {
  const entradas = entradasDe(fonte, [...videos].sort(ordenarPorHora));
  void openCustomModal(
    diaPorExtenso(data),
    ({ corpo, rodape, fechar }) => {
      const lista = document.createElement('div');
      lista.className = 'vd-cal-dia-lista';
      const abrirFechando = {
        ...opcoes,
        abrir: (id: string) => {
          fechar();
          opcoes.abrir(id);
        },
      };
      entradas.forEach((entrada) => lista.appendChild(buildLinhaDoDia(fonte, entrada, abrirFechando)));
      corpo.appendChild(lista);
      const novo = document.createElement('button');
      novo.type = 'button';
      novo.className = 'pg-botao is-secundario';
      novo.innerHTML = svg(ICONES_POSTAGEM.mais, 14, 2);
      novo.append(`${fonte.novoRotulo} neste dia`);
      novo.addEventListener('click', () => {
        fechar();
        opcoes.criarEm(data);
      });
      rodape.appendChild(novo);
    },
    { largura: 520, icone: ICONES_POSTAGEM.calendario, subtitulo: resumoDoDia(entradas) },
  );
}

/** Clique num dia: com o painel ao lado, mostra o dia nele; sem espaço para o painel, abre o modal. */
function escolherDia(tela: HTMLElement, fonte: Fonte, data: string, videos: Postagem[], opcoes: CalendarioOpcoes): void {
  if (tela.clientWidth < LARGURA_COM_PAINEL) {
    abrirDia(fonte, data, videos, opcoes);
    return;
  }
  diaSelecionado = data;
  abaLateral = 'dia';
  gravarPrefs();
  opcoes.redesenhar();
}

// ---------- Visão mensal ----------

function buildMes(tela: HTMLElement, fonte: Fonte, porDia: Map<string, Postagem[]>, opcoes: CalendarioOpcoes): HTMLElement {
  const primeiro = fonte.catalogo.preferencias.inicioDaSemana;
  const [ano, mes] = partesData(referencia);
  const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const inicio = inicioDaSemana(inicioMes, primeiro);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  // Só as semanas que o mês usa (4 a 6): sem uma linha inteira de outro mês.
  const semanas = Math.ceil(((diaDaSemana(inicioMes) - primeiro + 7) % 7 + diasNoMes) / 7);
  const hoje = hojeIso();

  const grade = document.createElement('div');
  grade.className = 'vd-cal-mes';
  grade.style.setProperty('--semanas', String(semanas));

  for (let i = 0; i < 7; i++) {
    const dia = (primeiro + i) % 7;
    const cab = document.createElement('div');
    cab.className = `vd-cal-mes-cab${dia === 0 || dia === 6 ? ' is-fim-semana' : ''}`;
    cab.textContent = DIAS_CURTOS[dia]!;
    grade.appendChild(cab);
  }

  for (let i = 0; i < semanas * 7; i++) {
    const data = somarDias(inicio, i);
    const [, m, d] = partesData(data);
    const semana = diaDaSemana(data);
    const celula = document.createElement('div');
    celula.className = 'vd-cal-celula';
    celula.classList.toggle('is-fora', m !== mes);
    celula.classList.toggle('is-hoje', data === hoje);
    celula.classList.toggle('is-passado', data < hoje);
    celula.classList.toggle('is-fim-semana', semana === 0 || semana === 6);
    celula.classList.toggle('is-selecionado', data === diaSelecionado && abaLateral === 'dia');
    celula.dataset.data = data;

    const videos = (porDia.get(data) ?? []).sort(ordenarPorHora);
    const entradas = entradasDe(fonte, videos);

    const topo = document.createElement('div');
    topo.className = 'vd-cal-celula-topo';
    const numero = document.createElement('span');
    numero.className = 'vd-cal-numero';
    numero.textContent = String(d);
    const novo = document.createElement('button');
    novo.type = 'button';
    novo.className = 'vd-cal-novo';
    novo.title = `${fonte.novoRotulo} neste dia`;
    novo.setAttribute('aria-label', `${fonte.novoRotulo} em ${diaPorExtenso(data)}`);
    novo.innerHTML = svg(ICONES_POSTAGEM.mais, 12, 2.4);
    novo.addEventListener('click', (e) => {
      e.stopPropagation();
      opcoes.criarEm(data);
    });
    topo.append(numero, novo);
    celula.appendChild(topo);

    const lista = document.createElement('div');
    lista.className = 'vd-cal-celula-lista';
    // Com mais do que cabe, os dois primeiros + "+N" (o "+N" ocupa a terceira linha).
    const cabem = entradas.length > MAX_POR_DIA ? MAX_POR_DIA - 1 : MAX_POR_DIA;
    entradas.slice(0, cabem).forEach((entrada) => lista.appendChild(buildItem(fonte, entrada, opcoes)));
    if (entradas.length > cabem) {
      const mais = document.createElement('button');
      mais.type = 'button';
      mais.className = 'vd-cal-mais';
      mais.textContent = `+${entradas.length - cabem} mais`;
      mais.addEventListener('click', (e) => {
        e.stopPropagation();
        escolherDia(tela, fonte, data, videos, opcoes);
      });
      lista.appendChild(mais);
    }
    celula.appendChild(lista);

    celula.addEventListener('click', () => escolherDia(tela, fonte, data, videos, opcoes));
    celula.addEventListener('dblclick', () => opcoes.criarEm(data));
    tornarAlvo(celula, fonte, data, null, opcoes);
    grade.appendChild(celula);
  }
  return grade;
}

// ---------- Visão semanal ----------

function buildSemana(tela: HTMLElement, fonte: Fonte, porDia: Map<string, Postagem[]>, opcoes: CalendarioOpcoes): HTMLElement {
  const inicio = inicioDaSemana(referencia, fonte.catalogo.preferencias.inicioDaSemana);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  const hoje = hojeIso();

  const wrap = document.createElement('div');
  wrap.className = 'vd-cal-semana';

  const cabecalho = document.createElement('div');
  cabecalho.className = 'vd-cal-semana-linha is-cabecalho';
  cabecalho.appendChild(document.createElement('span'));
  dias.forEach((dia) => {
    const cab = document.createElement('button');
    cab.type = 'button';
    cab.className = 'vd-cal-semana-cab';
    cab.classList.toggle('is-hoje', dia === hoje);
    cab.classList.toggle('is-selecionado', dia === diaSelecionado && abaLateral === 'dia');
    cab.title = `Ver ${diaPorExtenso(dia)}`;
    const nome = document.createElement('span');
    nome.textContent = DIAS_CURTOS[diaDaSemana(dia)]!;
    const num = document.createElement('strong');
    num.textContent = String(partesData(dia)[2]);
    cab.append(nome, num);
    cab.addEventListener('click', () => escolherDia(tela, fonte, dia, porDia.get(dia) ?? [], opcoes));
    cabecalho.appendChild(cab);
  });
  wrap.appendChild(cabecalho);

  // "Dia todo": marcado para o dia, sem hora. Soltar aqui tira a hora.
  const semHora = document.createElement('div');
  semHora.className = 'vd-cal-semana-linha is-sem-hora';
  semHora.appendChild(Object.assign(document.createElement('span'), { className: 'vd-cal-hora', textContent: 'dia todo' }));
  dias.forEach((dia) => {
    const celula = document.createElement('div');
    celula.className = 'vd-cal-slot';
    celula.classList.toggle('is-hoje', dia === hoje);
    entradasDe(fonte, (porDia.get(dia) ?? []).filter((v) => !v.horaAgendada)).forEach((e) => celula.appendChild(buildItem(fonte, e, opcoes, false)));
    tornarAlvo(celula, fonte, dia, '', opcoes);
    semHora.appendChild(celula);
  });
  wrap.appendChild(semHora);

  const agora = new Date();
  const corpo = document.createElement('div');
  corpo.className = 'vd-cal-semana-corpo';
  for (let h = 0; h < 24; h++) {
    const linha = document.createElement('div');
    linha.className = 'vd-cal-semana-linha';
    // Madrugada mais baixa: quase nunca tem publicação, não deve ocupar a tela.
    linha.classList.toggle('is-noite', h < 6);
    linha.appendChild(Object.assign(document.createElement('span'), { className: 'vd-cal-hora', textContent: `${String(h).padStart(2, '0')}:00` }));
    dias.forEach((dia) => {
      const celula = document.createElement('div');
      celula.className = 'vd-cal-slot';
      celula.classList.toggle('is-hoje', dia === hoje);
      entradasDe(fonte, (porDia.get(dia) ?? []).filter((v) => v.horaAgendada && Number(v.horaAgendada.slice(0, 2)) === h).sort(ordenarPorHora)).forEach((e) =>
        celula.appendChild(buildItem(fonte, e, opcoes)),
      );
      if (dia === hoje && agora.getHours() === h) {
        const marca = document.createElement('span');
        marca.className = 'vd-cal-agora';
        marca.style.top = `${(agora.getMinutes() / 60) * 100}%`;
        marca.title = `Agora, ${String(h).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
        celula.appendChild(marca);
      }
      celula.addEventListener('dblclick', () => opcoes.criarEm(dia, `${String(h).padStart(2, '0')}:00`));
      tornarAlvo(celula, fonte, dia, h, opcoes);
      linha.appendChild(celula);
    });
    corpo.appendChild(linha);
  }
  // A grade inteira rola (cabeçalho e "dia todo" presos no topo), assim a
  // barra de rolagem não desalinha as colunas do corpo e as do cabeçalho.
  wrap.addEventListener('scroll', () => {
    rolagemSemana = wrap.scrollTop;
  });
  // Primeira abertura começa às 7h, onde a agenda costuma estar.
  requestAnimationFrame(() => {
    if (rolagemSemana !== null) {
      wrap.scrollTop = rolagemSemana;
      return;
    }
    const seteHoras = corpo.children[7] as HTMLElement | undefined;
    if (!seteHoras) return;
    // O corpo começa logo abaixo das linhas presas, então o deslocamento da
    // linha das 7h dentro dele é exatamente a rolagem que a põe sob elas.
    wrap.scrollTop = seteHoras.getBoundingClientRect().top - corpo.getBoundingClientRect().top;
  });
  wrap.appendChild(corpo);
  return wrap;
}

// ---------- Painel lateral ----------

function semDataDe(fonte: Fonte, opcoes: CalendarioOpcoes): Postagem[] {
  const prio = { alta: 0, media: 1, baixa: 2 } as const;
  return fonte.itens
    .filter((v) => !v.dataAgendada && v.status !== 'arquivado' && v.status !== 'publicado' && opcoes.visivel(v))
    .sort((a, b) => (a.prioridade ? prio[a.prioridade] : 3) - (b.prioridade ? prio[b.prioridade] : 3) || a.seq - b.seq);
}

function buildPainelDia(fonte: Fonte, porDia: Map<string, Postagem[]>, opcoes: CalendarioOpcoes): HTMLElement {
  const painel = document.createElement('div');
  painel.className = 'vd-cal-painel-corpo';
  const hoje = hojeIso();
  const entradas = entradasDe(fonte, [...(porDia.get(diaSelecionado) ?? [])].sort(ordenarPorHora));

  const cab = document.createElement('div');
  cab.className = 'vd-cal-painel-cab';
  const relativo = diaSelecionado === hoje ? 'Hoje' : diaSelecionado === somarDias(hoje, 1) ? 'Amanhã' : diaSelecionado === somarDias(hoje, -1) ? 'Ontem' : '';
  if (relativo) cab.appendChild(Object.assign(document.createElement('span'), { className: 'vd-cal-painel-relativo', textContent: relativo }));
  cab.appendChild(Object.assign(document.createElement('h3'), { textContent: diaPorExtenso(diaSelecionado, partesData(diaSelecionado)[0] !== partesData(hoje)[0]) }));
  cab.appendChild(Object.assign(document.createElement('p'), { textContent: resumoDoDia(entradas) }));
  painel.appendChild(cab);

  const lista = document.createElement('div');
  lista.className = 'vd-cal-dia-lista';
  if (!entradas.length) {
    lista.appendChild(
      Object.assign(document.createElement('p'), {
        className: 'vd-cal-painel-vazio',
        textContent: 'Nenhuma postagem neste dia. Arraste uma do calendário ou da lista "Sem data" para cá, ou crie uma nova.',
      }),
    );
  }
  entradas.forEach((entrada) => lista.appendChild(buildLinhaDoDia(fonte, entrada, opcoes)));
  painel.appendChild(lista);

  const novo = document.createElement('button');
  novo.type = 'button';
  novo.className = 'pg-botao is-secundario vd-cal-painel-novo';
  novo.innerHTML = svg(ICONES_POSTAGEM.mais, 14, 2);
  novo.append(`${fonte.novoRotulo} neste dia`);
  novo.addEventListener('click', () => opcoes.criarEm(diaSelecionado));
  painel.appendChild(novo);

  // Soltar no painel agenda para o dia mostrado, mantendo a hora.
  tornarAlvo(painel, fonte, diaSelecionado, null, opcoes);
  return painel;
}

function buildPainelSemData(fonte: Fonte, opcoes: CalendarioOpcoes): HTMLElement {
  const painel = document.createElement('div');
  painel.className = 'vd-cal-painel-corpo';
  const videos = semDataDe(fonte, opcoes);
  painel.appendChild(
    Object.assign(document.createElement('p'), {
      className: 'vd-cal-painel-dica',
      textContent: videos.length ? 'Arraste para um dia do calendário para agendar. Soltar aqui tira a data.' : 'Tudo o que está em andamento já tem data.',
    }),
  );
  const lista = document.createElement('div');
  lista.className = 'vd-cal-dia-lista';
  videos.forEach((v) => lista.appendChild(buildLinhaDoDia(fonte, { video: v }, opcoes)));
  painel.appendChild(lista);

  painel.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes(TIPO_ARRASTE)) return;
    e.preventDefault();
    painel.classList.add('is-alvo');
  });
  painel.addEventListener('dragleave', (e) => {
    if (!painel.contains(e.relatedTarget as Node | null)) painel.classList.remove('is-alvo');
  });
  painel.addEventListener('drop', (e) => {
    e.preventDefault();
    painel.classList.remove('is-alvo');
    const video = fonte.itens.find((v) => v.id === e.dataTransfer?.getData(TIPO_ARRASTE));
    if (!video?.dataAgendada) return;
    void fonte.agendar(video.id, '', '').catch(opcoes.falhou);
  });
  return painel;
}

function buildLateral(fonte: Fonte, porDia: Map<string, Postagem[]>, opcoes: CalendarioOpcoes): HTMLElement {
  const lateral = document.createElement('aside');
  lateral.className = 'vd-cal-lateral';
  const qtdSemData = semDataDe(fonte, opcoes).length;
  const abas = buildSegmentado<AbaLateral>(
    [
      { value: 'dia', label: 'Dia' },
      { value: 'semdata', label: `Sem data · ${qtdSemData}` },
    ],
    abaLateral,
    (v) => {
      abaLateral = v;
      gravarPrefs();
      opcoes.redesenhar();
    },
  );
  abas.classList.add('vd-cal-lateral-abas');
  lateral.appendChild(abas);
  lateral.appendChild(abaLateral === 'dia' ? buildPainelDia(fonte, porDia, opcoes) : buildPainelSemData(fonte, opcoes));
  return lateral;
}

function buildLegenda(): HTMLElement {
  const legenda = document.createElement('div');
  legenda.className = 'vd-cal-legenda';
  (Object.keys(SITUACAO) as Situacao[]).forEach((s) => {
    const item = document.createElement('span');
    item.className = `is-${s}`;
    item.append(document.createElement('i'), SITUACAO[s].rotulo);
    legenda.appendChild(item);
  });
  legenda.appendChild(Object.assign(document.createElement('span'), { className: 'vd-cal-legenda-dica', textContent: 'Clique no dia para ver tudo · duplo clique cria · arraste para reagendar' }));
  return legenda;
}

// ---------- Montagem ----------

export function buildCalendario(fonte: Fonte, opcoes: CalendarioOpcoes): HTMLElement {
  const tela = document.createElement('div');
  tela.className = 'vd-cal';

  const hoje = hojeIso();
  const primeiro = fonte.catalogo.preferencias.inicioDaSemana;
  const mudar = (acao: () => void): (() => void) => () => {
    acao();
    opcoes.redesenhar();
  };
  const barra = document.createElement('div');
  barra.className = 'vd-cal-barra';
  barra.appendChild(
    buildNavegadorPeriodo({
      titulo: visao === 'mes' ? tituloDoMes(referencia) : tituloDaSemana(referencia, primeiro),
      unidade: visao === 'mes' ? 'mês' : 'semana',
      rotuloAtual: 'Hoje',
      noAtual: visao === 'mes' ? referencia.slice(0, 7) === hoje.slice(0, 7) : inicioDaSemana(referencia, primeiro) === inicioDaSemana(hoje, primeiro),
      anterior: mudar(() => (referencia = visao === 'mes' ? somarMeses(referencia, -1) : somarDias(referencia, -7))),
      atual: mudar(() => {
        referencia = hoje;
        diaSelecionado = hoje;
      }),
      proximo: mudar(() => (referencia = visao === 'mes' ? somarMeses(referencia, 1) : somarDias(referencia, 7))),
      grande: true,
    }),
  );

  const direita = document.createElement('div');
  direita.className = 'vd-cal-barra-acoes';
  const modoLinhas = buildSegmentado<'video' | 'rede'>(
    [
      { value: 'video', label: `Por ${fonte.singular.toLowerCase()}` },
      { value: 'rede', label: 'Por rede' },
    ],
    fonte.catalogo.preferencias.calendarioPorRede ? 'rede' : 'video',
    (v) => {
      void videosState.salvarPreferencias({ ...fonte.catalogo.preferencias, calendarioPorRede: v === 'rede' }).catch(opcoes.falhou);
    },
  );
  modoLinhas.title = `Um cartão por ${fonte.singular.toLowerCase()}, ou um por rede em que será publicado`;
  direita.append(
    modoLinhas,
    buildSegmentado<Visao>(
      [
        { value: 'mes', label: 'Mês' },
        { value: 'semana', label: 'Semana' },
      ],
      visao,
      (v) => {
        visao = v;
        // A semana abre na do dia escolhido no painel.
        if (v === 'semana') referencia = diaSelecionado;
        gravarPrefs();
        opcoes.redesenhar();
      },
    ),
  );
  barra.appendChild(direita);
  tela.appendChild(barra);

  const porDia = new Map<string, Postagem[]>();
  fonte.itens
    .filter((v) => v.dataAgendada && v.status !== 'arquivado' && opcoes.visivel(v))
    .forEach((v) => porDia.set(v.dataAgendada!, [...(porDia.get(v.dataAgendada!) ?? []), v]));

  const area = document.createElement('div');
  area.className = 'vd-cal-area';
  const principal = document.createElement('div');
  principal.className = 'vd-cal-principal';
  principal.appendChild(visao === 'mes' ? buildMes(tela, fonte, porDia, opcoes) : buildSemana(tela, fonte, porDia, opcoes));
  principal.appendChild(buildLegenda());
  area.append(principal, buildLateral(fonte, porDia, opcoes));
  tela.appendChild(area);
  return tela;
}
