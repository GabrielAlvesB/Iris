import type { RedeSocial } from '../../../shared/types/postagens.types.js';
import { buildSegmentado, svg } from '../../ui/pagina.js';
import { openCustomModal } from '../../ui/modal.js';
import { buildLogoRede } from './postagens.logos.js';
import { faseDe, rotuloEtapa, type Fonte, type Postagem } from './postagens.fonte.js';
import * as videosState from './videos/videos.state.js';
import {
  ICONES_POSTAGEM,
  atrasado,
  buildPrioridade,
  buildRedeBadge,
  hojeIso,
  redesDe,
  somarDias,
  tituloExibido,
} from './postagens.ui.js';

/**
 * Calendário de publicação no estilo das ferramentas de agendamento: mês ou
 * semana por horário, arrastar para reagendar, clicar num dia vazio para criar
 * já com a data. Postagens sem data ficam numa lista ao lado, prontas para arrastar.
 *
 * Funciona para qualquer tipo de postagem: tudo o que é do tipo vem da Fonte.
 */

type Visao = 'mes' | 'semana';

export interface CalendarioOpcoes {
  visivel: (item: Postagem) => boolean;
  abrir: (videoId: string) => void;
  criarEm: (data: string, hora?: string) => void;
  falhou: (erro: unknown) => void;
  redesenhar: () => void;
}

let visao: Visao = 'mes';
let referencia = hojeIso();
/** Rolagem da grade semanal, para o redesenho não voltar ao topo. */
let rolagemSemana: number | null = null;
/** Lista "Sem data" recolhida por padrão: os títulos do mês precisam da largura. */
let semDataAberta = false;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** Linhas por dia no mês antes do "+N mais" (cabem sem esticar a semana). */
const MAX_POR_DIA = 5;
const TIPO_ARRASTE = 'application/x-iris-postagem';

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.split('-').map(Number);
  return [a!, m!, d!];
}

function diaDaSemana(iso: string): number {
  const [a, m, d] = partes(iso);
  return new Date(a, m - 1, d).getDay();
}

function inicioDaSemana(iso: string, primeiro: 0 | 1): string {
  const recuo = (diaDaSemana(iso) - primeiro + 7) % 7;
  return somarDias(iso, -recuo);
}

function primeiroDoMes(iso: string): string {
  const [a, m] = partes(iso);
  return `${a}-${String(m).padStart(2, '0')}-01`;
}

function somarMeses(iso: string, meses: number): string {
  const [a, m] = partes(iso);
  const d = new Date(a, m - 1 + meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function ordenarPorHora(a: Postagem, b: Postagem): number {
  return (a.horaAgendada ?? '99:99').localeCompare(b.horaAgendada ?? '99:99') || a.seq - b.seq;
}

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

/** Alvo de soltura: data (e hora, na semana). Mantém os minutos se a hora não mudar. */
function tornarAlvo(el: HTMLElement, fonte: Fonte, data: string, hora: number | null, opcoes: CalendarioOpcoes): void {
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
    el.classList.remove('is-alvo');
    const videoId = e.dataTransfer?.getData(TIPO_ARRASTE);
    const video = fonte.itens.find((v) => v.id === videoId);
    if (!video) return;
    let horaNova = video.horaAgendada ?? '';
    if (hora !== null) {
      const hh = String(hora).padStart(2, '0');
      horaNova = video.horaAgendada?.startsWith(`${hh}:`) ? video.horaAgendada : `${hh}:00`;
    }
    if (video.dataAgendada === data && (video.horaAgendada ?? '') === horaNova) return;
    void fonte.agendar(video.id, data, horaNova).catch(opcoes.falhou);
  });
}

// ---------- Chip de vídeo ----------

function buildChip(fonte: Fonte, video: Postagem, opcoes: CalendarioOpcoes, comHora = true): HTMLElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `vd-cal-chip is-fase-${faseDe(fonte, video.status)} is-${video.status}`;
  chip.classList.toggle('is-atrasado', atrasado(video));
  chip.title = `${video.titulo}\n${rotuloEtapa(fonte, video.status)}${video.horaAgendada ? ` · ${video.horaAgendada}` : ''}`;

  // Duas linhas: metadados em cima, título inteiro embaixo — numa célula de
  // mês estreita, tudo numa linha só deixava o título invisível.
  const meta = document.createElement('span');
  meta.className = 'vd-cal-chip-meta';
  if (comHora) {
    const hora = document.createElement('span');
    hora.className = 'vd-cal-chip-hora';
    hora.textContent = video.horaAgendada ?? 'dia todo';
    meta.appendChild(hora);
  }
  if (video.status === 'publicado') {
    const ok = document.createElement('span');
    ok.className = 'vd-cal-chip-ok';
    ok.innerHTML = svg('<polyline points="20 6 9 17 4 12"/>', 11, 2.6);
    ok.title = 'Publicado';
    meta.appendChild(ok);
  }
  if (video.prioridade) meta.appendChild(buildPrioridade(video.prioridade, true));
  const redes = redesDe(fonte.catalogo, video);
  if (redes.length) {
    const wrap = document.createElement('span');
    wrap.className = 'vd-cal-chip-redes';
    redes.slice(0, 3).forEach((r) => wrap.appendChild(buildRedeBadge(r)));
    meta.appendChild(wrap);
  }
  if (meta.childElementCount) chip.appendChild(meta);

  const titulo = document.createElement('span');
  titulo.className = 'vd-cal-chip-titulo';
  titulo.textContent = tituloExibido(fonte.catalogo, video);
  chip.appendChild(titulo);

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    opcoes.abrir(video.id);
  });
  tornarArrastavel(chip, video);
  return chip;
}

// ---------- Linha compacta (uma publicação) ----------

/**
 * Uma entrada do calendário: o vídeo, e a rede quando o calendário está no
 * modo "por rede" (uma linha para cada rede em que o vídeo sai).
 */
interface Entrada {
  video: Postagem;
  rede?: RedeSocial;
}

type Situacao = 'publicado' | 'atrasado' | 'agendado' | 'planejado';

function situacaoDe(video: Postagem): Situacao {
  if (video.status === 'publicado') return 'publicado';
  if (atrasado(video)) return 'atrasado';
  if (video.status === 'agendado') return 'agendado';
  return 'planejado';
}

const ICONE_SITUACAO: Record<Situacao, { path: string; rotulo: string }> = {
  publicado: { path: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>', rotulo: 'Publicado' },
  agendado: { path: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>', rotulo: 'Agendado' },
  atrasado: { path: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16h.01"/>', rotulo: 'Data vencida' },
  planejado: { path: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>', rotulo: 'Ainda em produção' },
};

function entradasDe(fonte: Fonte, videos: Postagem[]): Entrada[] {
  if (!fonte.catalogo.preferencias.calendarioPorRede) return videos.map((video) => ({ video }));
  return videos.flatMap((video) => {
    const redes = redesDe(fonte.catalogo, video);
    return redes.length ? redes.map((rede) => ({ video, rede })) : [{ video }];
  });
}

/** Círculo com a sigla da rede, na cor dela — o "logo" de cada linha. */
function buildMarcaRede(rede: RedeSocial | undefined): HTMLElement {
  if (rede) {
    const logo = buildLogoRede(rede, 17, 'circulo');
    logo.classList.add('vd-cal-rede');
    return logo;
  }
  const marca = document.createElement('span');
  marca.className = 'vd-cal-rede is-vazia';
  marca.title = 'Sem rede definida';
  return marca;
}

function buildLinha(fonte: Fonte, entrada: Entrada, opcoes: CalendarioOpcoes, comHora = true): HTMLElement {
  const { video } = entrada;
  const situacao = situacaoDe(video);
  const linha = document.createElement('button');
  linha.type = 'button';
  linha.className = `vd-cal-linha is-${situacao} is-fase-${faseDe(fonte, video.status)}`;
  const redes = redesDe(fonte.catalogo, video);
  linha.title = [
    video.titulo,
    `${rotuloEtapa(fonte, video.status)}${video.horaAgendada ? ` · ${video.horaAgendada}` : ''}`,
    redes.length ? redes.map((r) => r.nome).join(', ') : 'Sem rede',
    video.score !== undefined ? `Score: ${video.score.toLocaleString('pt-BR')}` : '',
    fonte.dicaExtra?.(video) ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  // Por vídeo, mostra a primeira rede e quantas mais; por rede, a própria.
  if (entrada.rede || fonte.catalogo.preferencias.calendarioPorRede) {
    linha.appendChild(buildMarcaRede(entrada.rede));
  } else {
    const pilha = document.createElement('span');
    pilha.className = 'vd-cal-redes-pilha';
    pilha.appendChild(buildMarcaRede(redes[0]));
    if (redes.length > 1) {
      const mais = document.createElement('span');
      mais.className = 'vd-cal-rede-mais';
      mais.textContent = `+${redes.length - 1}`;
      pilha.appendChild(mais);
    }
    linha.appendChild(pilha);
  }

  if (video.prioridade === 'alta') linha.appendChild(buildPrioridade('alta', true));

  const titulo = document.createElement('span');
  titulo.className = 'vd-cal-linha-titulo';
  titulo.textContent = tituloExibido(fonte.catalogo, video);
  linha.appendChild(titulo);

  if (comHora && video.horaAgendada) {
    const hora = document.createElement('span');
    hora.className = 'vd-cal-linha-hora';
    hora.textContent = video.horaAgendada;
    linha.appendChild(hora);
  }

  const icone = document.createElement('span');
  icone.className = 'vd-cal-linha-situacao';
  icone.title = ICONE_SITUACAO[situacao].rotulo;
  icone.innerHTML = svg(ICONE_SITUACAO[situacao].path, 12, 2.2);
  linha.appendChild(icone);

  linha.addEventListener('click', (e) => {
    e.stopPropagation();
    opcoes.abrir(video.id);
  });
  tornarArrastavel(linha, video);
  return linha;
}

function abrirDia(fonte: Fonte, data: string, videos: Postagem[], opcoes: CalendarioOpcoes): void {
  const [a, m, d] = partes(data);
  const entradas = entradasDe(fonte, videos);
  const publicados = entradas.filter((e) => e.video.status === 'publicado').length;
  void openCustomModal(
    new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }),
    ({ corpo, rodape, fechar }) => {
      const lista = document.createElement('div');
      lista.className = 'vd-cal-dia-lista';
      entradas.forEach((entrada) => {
        lista.appendChild(
          buildLinha(fonte, entrada, {
            ...opcoes,
            abrir: (id) => {
              fechar();
              opcoes.abrir(id);
            },
          }),
        );
      });
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
    {
      largura: 500,
      icone: ICONES_POSTAGEM.calendario,
      subtitulo: `${publicados} de ${entradas.length} publicação(ões) já no ar`,
    },
  );
}

// ---------- Visão mensal ----------

function buildMes(fonte: Fonte, porDia: Map<string, Postagem[]>, opcoes: CalendarioOpcoes): HTMLElement {
  const primeiro = fonte.catalogo.preferencias.inicioDaSemana;
  const inicioMes = primeiroDoMes(referencia);
  const mes = partes(inicioMes)[1];
  const inicio = inicioDaSemana(inicioMes, primeiro);
  const hoje = hojeIso();

  const grade = document.createElement('div');
  grade.className = 'vd-cal-mes';

  for (let i = 0; i < 7; i++) {
    const cab = document.createElement('div');
    cab.className = 'vd-cal-semana-dia';
    cab.textContent = DIAS_CURTOS[(primeiro + i) % 7]!;
    grade.appendChild(cab);
  }

  // Sempre 6 semanas: a grade não pula de altura ao trocar de mês.
  for (let i = 0; i < 42; i++) {
    const data = somarDias(inicio, i);
    const celula = document.createElement('div');
    celula.className = 'vd-cal-celula';
    celula.classList.toggle('is-fora', partes(data)[1] !== mes);
    celula.classList.toggle('is-hoje', data === hoje);
    celula.classList.toggle('is-passado', data < hoje);
    celula.dataset.data = data;

    const topo = document.createElement('div');
    topo.className = 'vd-cal-celula-topo';
    const novo = document.createElement('button');
    novo.type = 'button';
    novo.className = 'vd-cal-novo';
    novo.title = `${fonte.novoRotulo} neste dia`;
    novo.setAttribute('aria-label', `${fonte.novoRotulo} em ${data}`);
    novo.innerHTML = svg(ICONES_POSTAGEM.mais, 12, 2.4);
    novo.addEventListener('click', (e) => {
      e.stopPropagation();
      opcoes.criarEm(data);
    });
    const numero = document.createElement('span');
    numero.className = 'vd-cal-numero';
    numero.textContent = String(partes(data)[2]);
    topo.append(novo, numero);
    celula.appendChild(topo);

    const videos = (porDia.get(data) ?? []).sort(ordenarPorHora);
    const entradas = entradasDe(fonte, videos);
    const lista = document.createElement('div');
    lista.className = 'vd-cal-celula-lista';
    entradas.slice(0, MAX_POR_DIA).forEach((entrada) => lista.appendChild(buildLinha(fonte, entrada, opcoes)));
    celula.appendChild(lista);

    // Rodapé do dia: quantas publicações já estão no ar e acesso ao resto.
    if (entradas.length) {
      const rodape = document.createElement('div');
      rodape.className = 'vd-cal-celula-rodape';
      const publicados = entradas.filter((e) => e.video.status === 'publicado').length;
      const placar = document.createElement('span');
      placar.className = 'vd-cal-placar';
      placar.classList.toggle('is-completo', publicados === entradas.length);
      placar.title = `${publicados} de ${entradas.length} publicação(ões) no ar`;
      placar.textContent = `${publicados} / ${entradas.length}`;
      const mais = document.createElement('button');
      mais.type = 'button';
      mais.className = 'vd-cal-mais';
      mais.textContent = entradas.length > MAX_POR_DIA ? `+${entradas.length - MAX_POR_DIA} mais` : 'ver dia';
      mais.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirDia(fonte, data, videos, opcoes);
      });
      rodape.append(placar, mais);
      celula.appendChild(rodape);
    }

    celula.addEventListener('dblclick', () => opcoes.criarEm(data));
    tornarAlvo(celula, fonte, data, null, opcoes);
    grade.appendChild(celula);
  }
  return grade;
}

// ---------- Visão semanal ----------

function buildSemana(fonte: Fonte, porDia: Map<string, Postagem[]>, opcoes: CalendarioOpcoes): HTMLElement {
  const inicio = inicioDaSemana(referencia, fonte.catalogo.preferencias.inicioDaSemana);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  const hoje = hojeIso();

  const wrap = document.createElement('div');
  wrap.className = 'vd-cal-semana';

  const cabecalho = document.createElement('div');
  cabecalho.className = 'vd-cal-semana-linha is-cabecalho';
  cabecalho.appendChild(document.createElement('span'));
  dias.forEach((dia) => {
    const cab = document.createElement('div');
    cab.className = 'vd-cal-semana-cab';
    cab.classList.toggle('is-hoje', dia === hoje);
    const nome = document.createElement('span');
    nome.textContent = DIAS_CURTOS[diaDaSemana(dia)]!;
    const num = document.createElement('strong');
    num.textContent = String(partes(dia)[2]);
    cab.append(nome, num);
    cabecalho.appendChild(cab);
  });
  wrap.appendChild(cabecalho);

  // "Sem horário": agendado para o dia, sem hora definida.
  const semHora = document.createElement('div');
  semHora.className = 'vd-cal-semana-linha is-sem-hora';
  const rotuloSemHora = document.createElement('span');
  rotuloSemHora.className = 'vd-cal-hora';
  rotuloSemHora.textContent = 'dia todo';
  semHora.appendChild(rotuloSemHora);
  dias.forEach((dia) => {
    const celula = document.createElement('div');
    celula.className = 'vd-cal-slot';
    entradasDe(fonte, (porDia.get(dia) ?? []).filter((v) => !v.horaAgendada)).forEach((e) =>
      celula.appendChild(buildLinha(fonte, e, opcoes, false)),
    );
    tornarAlvoSemHora(celula, fonte, dia, opcoes);
    semHora.appendChild(celula);
  });
  wrap.appendChild(semHora);

  const corpo = document.createElement('div');
  corpo.className = 'vd-cal-semana-corpo';
  for (let h = 0; h < 24; h++) {
    const linha = document.createElement('div');
    linha.className = 'vd-cal-semana-linha';
    linha.classList.toggle('is-noite', h < 6);
    const rotulo = document.createElement('span');
    rotulo.className = 'vd-cal-hora';
    rotulo.textContent = `${String(h).padStart(2, '0')}:00`;
    linha.appendChild(rotulo);
    dias.forEach((dia) => {
      const celula = document.createElement('div');
      celula.className = 'vd-cal-slot';
      celula.classList.toggle('is-hoje', dia === hoje);
      entradasDe(
        fonte,
        (porDia.get(dia) ?? []).filter((v) => v.horaAgendada && Number(v.horaAgendada.slice(0, 2)) === h).sort(ordenarPorHora),
      ).forEach((e) => celula.appendChild(buildLinha(fonte, e, opcoes)));
      celula.addEventListener('dblclick', () => opcoes.criarEm(dia, `${String(h).padStart(2, '0')}:00`));
      tornarAlvo(celula, fonte, dia, h, opcoes);
      linha.appendChild(celula);
    });
    corpo.appendChild(linha);
  }
  // A grade inteira rola (cabeçalho e "dia todo" ficam presos no topo), assim
  // a barra de rolagem não desalinha as colunas do corpo e as do cabeçalho.
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

/** Soltar em "dia todo" tira o horário. */
function tornarAlvoSemHora(el: HTMLElement, fonte: Fonte, data: string, opcoes: CalendarioOpcoes): void {
  el.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes(TIPO_ARRASTE)) return;
    e.preventDefault();
    el.classList.add('is-alvo');
  });
  el.addEventListener('dragleave', () => el.classList.remove('is-alvo'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('is-alvo');
    const video = fonte.itens.find((v) => v.id === e.dataTransfer?.getData(TIPO_ARRASTE));
    if (!video) return;
    void fonte.agendar(video.id, data, '').catch(opcoes.falhou);
  });
}

// ---------- Lista "Sem data" ----------

function buildSemData(fonte: Fonte, opcoes: CalendarioOpcoes): HTMLElement {
  const lateral = document.createElement('aside');
  lateral.className = 'vd-cal-lateral';
  const videos = fonte.itens
    .filter((v) => !v.dataAgendada && v.status !== 'arquivado' && v.status !== 'publicado' && opcoes.visivel(v))
    .sort((a, b) => {
      const prio = { alta: 0, media: 1, baixa: 2 } as const;
      return (a.prioridade ? prio[a.prioridade] : 3) - (b.prioridade ? prio[b.prioridade] : 3) || a.seq - b.seq;
    });

  const cab = document.createElement('div');
  cab.className = 'vd-cal-lateral-cab';
  const titulo = document.createElement('strong');
  titulo.textContent = 'Sem data';
  const qtd = document.createElement('span');
  qtd.textContent = String(videos.length);
  cab.append(titulo, qtd);
  const dica = document.createElement('p');
  dica.textContent = 'Arraste para um dia do calendário para agendar.';
  lateral.append(cab, dica);

  const lista = document.createElement('div');
  lista.className = 'vd-cal-lateral-lista';
  if (!videos.length) {
    const vazio = document.createElement('p');
    vazio.className = 'vd-vazio-inline';
    vazio.textContent = 'Tudo com data. 🎉';
    lista.appendChild(vazio);
  }
  videos.forEach((v) => {
    const chip = buildChip(fonte, v, opcoes, false);
    const etapa = document.createElement('span');
    etapa.className = 'vd-cal-chip-etapa';
    etapa.textContent = rotuloEtapa(fonte, v.status);
    const meta =
      chip.querySelector('.vd-cal-chip-meta') ??
      chip.insertBefore(Object.assign(document.createElement('span'), { className: 'vd-cal-chip-meta' }), chip.firstChild);
    meta.prepend(etapa);
    lista.appendChild(chip);
  });
  lateral.appendChild(lista);

  // Soltar de volta na lista tira a data.
  lateral.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes(TIPO_ARRASTE)) return;
    e.preventDefault();
    lateral.classList.add('is-alvo');
  });
  lateral.addEventListener('dragleave', (e) => {
    if (!lateral.contains(e.relatedTarget as Node | null)) lateral.classList.remove('is-alvo');
  });
  lateral.addEventListener('drop', (e) => {
    e.preventDefault();
    lateral.classList.remove('is-alvo');
    const video = fonte.itens.find((v) => v.id === e.dataTransfer?.getData(TIPO_ARRASTE));
    if (!video?.dataAgendada) return;
    void fonte.agendar(video.id, '', '').catch(opcoes.falhou);
  });
  return lateral;
}

// ---------- Montagem ----------

function tituloDoPeriodo(fonte: Fonte): string {
  if (visao === 'mes') {
    const [a, m] = partes(referencia);
    const nome = MESES[m - 1]!;
    return `${nome[0]!.toUpperCase()}${nome.slice(1)} de ${a}`;
  }
  const inicio = inicioDaSemana(referencia, fonte.catalogo.preferencias.inicioDaSemana);
  const fim = somarDias(inicio, 6);
  const [, mi, di] = partes(inicio);
  const [af, mf, df] = partes(fim);
  return mi === mf ? `${di} – ${df} de ${MESES[mf - 1]} de ${af}` : `${di} de ${MESES[mi - 1]} – ${df} de ${MESES[mf - 1]} de ${af}`;
}

export function buildCalendario(fonte: Fonte, opcoes: CalendarioOpcoes): HTMLElement {
  const tela = document.createElement('div');
  tela.className = 'vd-cal';

  const barra = document.createElement('div');
  barra.className = 'vd-cal-barra';
  const nav = document.createElement('div');
  nav.className = 'vd-cal-nav';
  const botao = (rotulo: string, icone: string | null, aoClicar: () => void, titulo: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vd-cal-nav-btn';
    b.title = titulo;
    b.setAttribute('aria-label', titulo);
    if (icone) b.innerHTML = svg(icone, 15, 2.2);
    else b.textContent = rotulo;
    b.addEventListener('click', aoClicar);
    return b;
  };
  const mover = (sentido: number): void => {
    referencia = visao === 'mes' ? somarMeses(referencia, sentido) : somarDias(referencia, sentido * 7);
    opcoes.redesenhar();
  };
  nav.append(
    botao('', '<path d="m15 18-6-6 6-6"/>', () => mover(-1), 'Anterior'),
    botao('Hoje', null, () => {
      referencia = hojeIso();
      opcoes.redesenhar();
    }, 'Voltar para hoje'),
    botao('', '<path d="m9 18 6-6-6-6"/>', () => mover(1), 'Próximo'),
  );
  const periodo = document.createElement('h2');
  periodo.className = 'vd-cal-periodo';
  periodo.textContent = tituloDoPeriodo(fonte);

  const legenda = document.createElement('div');
  legenda.className = 'vd-cal-legenda';
  (['publicado', 'agendado', 'atrasado', 'planejado'] as const).forEach((situacao) => {
    const item = document.createElement('span');
    item.className = `is-${situacao}`;
    item.innerHTML = svg(ICONE_SITUACAO[situacao].path, 12, 2.2);
    item.append(ICONE_SITUACAO[situacao].rotulo);
    legenda.appendChild(item);
  });

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
  modoLinhas.title = `Uma linha por ${fonte.singular.toLowerCase()}, ou uma por rede em que será publicado`;

  const qtdSemData = fonte.itens.filter(
    (v) => !v.dataAgendada && v.status !== 'arquivado' && v.status !== 'publicado' && opcoes.visivel(v),
  ).length;
  const semData = document.createElement('button');
  semData.type = 'button';
  semData.className = 'vd-cal-semdata-btn';
  semData.classList.toggle('is-ativo', semDataAberta);
  semData.setAttribute('aria-pressed', String(semDataAberta));
  semData.title = `${fonte.rotulo} sem data, para arrastar para o calendário`;
  semData.innerHTML = svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="M9 15h6"/>', 14, 2);
  semData.append(`Sem data · ${qtdSemData}`);
  semData.addEventListener('click', () => {
    semDataAberta = !semDataAberta;
    opcoes.redesenhar();
  });

  barra.append(
    nav,
    periodo,
    legenda,
    semData,
    modoLinhas,
    buildSegmentado<Visao>(
      [
        { value: 'mes', label: 'Mês' },
        { value: 'semana', label: 'Semana' },
      ],
      visao,
      (v) => {
        visao = v;
        opcoes.redesenhar();
      },
    ),
  );
  tela.appendChild(barra);

  const porDia = new Map<string, Postagem[]>();
  fonte.itens
    .filter((v) => v.dataAgendada && v.status !== 'arquivado' && opcoes.visivel(v))
    .forEach((v) => porDia.set(v.dataAgendada!, [...(porDia.get(v.dataAgendada!) ?? []), v]));

  const area = document.createElement('div');
  area.className = 'vd-cal-area';
  area.appendChild(visao === 'mes' ? buildMes(fonte, porDia, opcoes) : buildSemana(fonte, porDia, opcoes));
  if (semDataAberta) area.appendChild(buildSemData(fonte, opcoes));
  tela.appendChild(area);
  return tela;
}
