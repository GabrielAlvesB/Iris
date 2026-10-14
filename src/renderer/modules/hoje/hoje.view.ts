import type { DiaHoje, ItemDia, TipoItemDia } from '../../../shared/types/hoje.types';
import type {} from '../../../shared/types/preload-api.types';
import { MAX_APELIDO } from '../../../shared/types/ajustes.types.js';
import { hojeLocal } from '../../../shared/types/brasil.js';
import { abrirAlvo, consumirAbaHoje, type AbaHoje } from '../../core/navegacao.js';
import type { RevisaoSemana } from '../../../shared/types/revisao.types';
import { somarDias } from '../../../shared/types/revisao.types.js';
import { buildDocumentoSemana, buildSemana, fraseDaSemana, semanaAtual } from './hoje.semana.js';
import { buildCaixa, buildConstancia, buildIdeia, buildLembranca, buildRoteiros, buildSugestao } from './hoje.pulso.js';
import type { PulsoHome, SugestaoHome } from '../../../shared/types/home.types';
import { exportarDocumentoPdf } from '../../ui/impressao.js';
import { createPushBinding } from '../../core/pushBinding.js';
import { ICONE_DO_MODULO } from '../../core/sidebar.js';
import { mensagemDeErro, openAvisoModal } from '../../ui/modal.js';
import { buildSegmentado, svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';

/**
 * Home: a primeira tela do app. Junta o que é do dia em todos os módulos —
 * nada é guardado aqui, o main monta a lista a cada leitura (hoje.service).
 * Como em todo o Iris, a agenda mostra só o pendente: o que foi feito fica
 * recolhido no fim dela.
 *
 * Sem faixa de números no topo (tela de trabalho): o resumo é uma frase, e o
 * único número desenhado é o anel do progresso do dia.
 */

const TIPOS: Record<TipoItemDia, { rotulo: string; icone: string; modulo: string }> = {
  card: { rotulo: 'Card', icone: ICONE_DO_MODULO.kanban, modulo: 'Kanban' },
  checklist: { rotulo: 'Checklist', icone: ICONE_DO_MODULO.todo, modulo: 'To-do' },
  postagem: { rotulo: 'Postagem', icone: ICONE_DO_MODULO.postagens, modulo: 'Postagens' },
  rotina: { rotulo: 'Rotina', icone: ICONE_DO_MODULO.quadro, modulo: 'Quadro' },
};

const ICONE_CHECK = '<polyline points="20 6 9 17 4 12"/>';
const ICONE_SETA = '<path d="m9 18 6-6-6-6"/>';
const CHAVE_ABERTOS = 'iris.hoje.recolhidos';
/** Quantos itens cada dia de "Próximos dias" mostra antes do "+N outros". */
const MAX_POR_DIA = 3;
/** A faixa do dia vai de 6h a 22h; item fora disso alarga a faixa. */
const FAIXA_INICIO = 6;
const FAIXA_FIM = 22;

let containerAtual: HTMLElement | null = null;
let dia: DiaHoje | null = null;
let apelido = '';
let erro = '';
let timerRecarga: ReturnType<typeof setTimeout> | null = null;
let timerRelogio: ReturnType<typeof setInterval> | null = null;
/** Dia (a agenda de hoje) ou Semana (a revisão). Começa no Dia a cada abertura, salvo pedido de fora. */
let aba: AbaHoje = 'dia';
let semanaInicio = '';
let revisao: RevisaoSemana | null = null;
/** O apelido em edição sobrevive ao redesenho (um push no meio da digitação não apaga o que foi escrito). */
let rascunhoApelido: string | null = null;
/** A entrada animada é só da abertura; os redesenhos seguintes não podem piscar. */
let entrando = false;
/** A saudação animada da última vez: ela se anima ao abrir a tela e quando muda (tarde → noite), não a cada minuto. */
let saudacaoMostrada = '';
let pulso: PulsoHome | null = null;
let sugestao: SugestaoHome | null = null;
let gerandoSugestao = false;
/** Sorteio da ideia do banco: o botão "Outra" soma um. */
let semente = 0;
/** Dias de "Próximos dias" abertos por inteiro ("+N outros"): só nesta visita. */
const diasAbertos = new Set<string>();

/** Qualquer gravação feita pela tela (histórico) ou a agenda publicando: a lista pode ter mudado. */
const push = createPushBinding([
  () => window.irisAPI.events.on('historico:mudou', () => agendarRecarga()),
  () => window.irisAPI.events.on('postagens:mudou', () => agendarRecarga()),
  // A caixa de entrada da Home: leads chegando e mensagens do WhatsApp.
  () => window.irisAPI.events.on('contatos:mudou', () => agendarRecarga()),
  () => window.irisAPI.events.on('whatsapp:mudou', () => agendarRecarga()),
]);

const aoFocar = (): void => agendarRecarga();

// ---------- Seções recolhidas (por pessoa, no navegador) ----------

function lerRecolhidos(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_ABERTOS) ?? '["feitos"]') as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : ['feitos']);
  } catch {
    return new Set(['feitos']);
  }
}

function alternarRecolhido(id: string): void {
  const r = lerRecolhidos();
  if (r.has(id)) r.delete(id);
  else r.add(id);
  try {
    localStorage.setItem(CHAVE_ABERTOS, JSON.stringify([...r]));
  } catch {
    // Sem armazenamento: só não lembra na próxima vez.
  }
}

// ---------- Dados ----------

async function recarregarSemana(): Promise<void> {
  const pedida = semanaInicio;
  const r = await window.irisAPI.hoje.getSemana(pedida);
  if (pedida !== semanaInicio) return;
  if (r.ok) {
    revisao = r.data;
    erro = '';
  } else {
    erro = r.error;
  }
  desenhar();
}

async function exportarSemana(): Promise<void> {
  if (!revisao) return;
  const r = revisao;
  try {
    await exportarDocumentoPdf(buildDocumentoSemana(r), async () => {
      const res = await window.irisAPI.hoje.exportarPdf(`revisao-${r.inicio}`);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    });
  } catch (e) {
    void openAvisoModal('Não deu para salvar o PDF', mensagemDeErro(e), { erro: true });
  }
}

async function recarregar(): Promise<void> {
  // O apelido pode ter mudado em Ajustes › Preferências: relido junto, é uma leitura barata.
  const ajustes = window.irisAPI.ajustes.getAjustes().then((r) => {
    if (r.ok) apelido = r.data.apelido;
  });
  if (aba === 'semana') {
    await Promise.all([ajustes, recarregarSemana()]);
    return;
  }
  const [r, rp, rs] = await Promise.all([window.irisAPI.hoje.getDia(), window.irisAPI.hoje.getPulso(semente), window.irisAPI.hoje.getSugestao(), ajustes]);
  if (r.ok) {
    dia = r.data;
    erro = '';
  } else {
    erro = r.error;
  }
  if (rp.ok) pulso = rp.data;
  if (rs.ok && !gerandoSugestao) sugestao = rs.data;
  desenhar();
  // Uma vez por dia, sozinha: depois fica guardada (home.json) e só o botão pede outra.
  if (sugestao?.estado === 'nova' && !gerandoSugestao) void gerarSugestao();
}

async function gerarSugestao(): Promise<void> {
  if (gerandoSugestao) return;
  gerandoSugestao = true;
  desenhar();
  const r = await window.irisAPI.hoje.gerarSugestao();
  gerandoSugestao = false;
  sugestao = r.ok ? r.data : { estado: 'erro', dia: hojeLocal(), erro: r.error };
  desenhar();
}

async function outraIdeia(): Promise<void> {
  semente++;
  const r = await window.irisAPI.hoje.getPulso(semente);
  if (r.ok) pulso = r.data;
  desenhar();
}

function agendarRecarga(): void {
  if (timerRecarga) clearTimeout(timerRecarga);
  timerRecarga = setTimeout(() => {
    timerRecarga = null;
    if (containerAtual) void recarregar();
  }, 250);
}

async function concluir(item: ItemDia, feito: boolean): Promise<void> {
  try {
    const r = await window.irisAPI.hoje.concluir({ tipo: item.tipo, id: item.id, feito });
    if (!r.ok) throw new Error(r.error);
    dia = r.data;
    desenhar();
    if (feito) {
      const texto = item.tipo === 'card' ? `“${item.titulo}” foi para a última coluna do Kanban` : `Rotina feita: “${item.titulo}”`;
      mostrarToast(texto, [{ rotulo: 'Desfazer', fazer: () => void concluir(item, false) }]);
    }
  } catch (e) {
    void openAvisoModal('Não deu para concluir', mensagemDeErro(e), { erro: true });
  }
}

async function salvarApelido(valor: string): Promise<void> {
  rascunhoApelido = null;
  const novo = valor.replace(/\s+/g, ' ').trim();
  if (novo === apelido) {
    desenhar();
    return;
  }
  const anterior = apelido;
  apelido = novo;
  desenhar();
  const r = await window.irisAPI.ajustes.setApelido(novo);
  if (r.ok) {
    apelido = r.data.apelido;
  } else {
    apelido = anterior;
    void openAvisoModal('Não deu para salvar o apelido', r.error, { erro: true });
  }
  desenhar();
}

// ---------- Datas e horas ----------

function partes(iso: string): [number, number, number] {
  return iso.split('-').map(Number) as [number, number, number];
}

function dataLocal(iso: string): Date {
  const [a, m, d] = partes(iso);
  return new Date(a, m - 1, d);
}

function diasEntre(de: string, ate: string): number {
  return Math.round((dataLocal(ate).getTime() - dataLocal(de).getTime()) / 86_400_000);
}

function atraso(iso: string, hoje: string): string {
  const n = diasEntre(iso, hoje);
  return n === 1 ? 'venceu ontem' : `venceu há ${n} dias`;
}

function minutosAgora(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** "09:30" → 570; hora mal formada vale como sem hora. */
function minutosDe(hora: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function hhmm(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

/** 450 → "7h30", 120 → "2h", 25 → "25 min". */
function duracao(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

type Periodo = 'manha' | 'tarde' | 'noite';

function periodoDe(minutos: number): Periodo {
  if (minutos >= 5 * 60 && minutos < 12 * 60) return 'manha';
  if (minutos >= 12 * 60 && minutos < 18 * 60) return 'tarde';
  return 'noite';
}

const SAUDACAO: Record<Periodo, string> = { manha: 'Bom dia', tarde: 'Boa tarde', noite: 'Boa noite' };
const NO_PERIODO: Record<Periodo, string> = { manha: 'de manhã', tarde: 'à tarde', noite: 'à noite' };

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? `1 ${um}` : `${n} ${varios}`;
}

function comHoraOrdenados(itens: ItemDia[]): Array<{ i: ItemDia; m: number }> {
  return itens
    .map((i) => ({ i, m: minutosDe(i.hora) }))
    .filter((x): x is { i: ItemDia; m: number } => x.m !== null)
    .sort((a, b) => a.m - b.m);
}

/** O que vem a seguir hoje: o pendente com hora ainda por chegar. */
function proximoDoDia(d: DiaHoje, minutos: number): { i: ItemDia; m: number } | null {
  return comHoraOrdenados(d.doDia).find((x) => x.m >= minutos) ?? null;
}

/** ", todas à tarde" quando todo o pendente tem hora e cai num período só. */
function emQuePeriodo(itens: ItemDia[]): string {
  const minutos = itens.map((i) => minutosDe(i.hora));
  if (!minutos.length || minutos.some((m) => m === null)) return '';
  const periodos = new Set(minutos.map((m) => periodoDe(m!)));
  if (periodos.size !== 1) return '';
  const p = NO_PERIODO[[...periodos][0]!];
  return itens.length === 1 ? `, ${p}` : `, todas ${p}`;
}

// ---------- Peças ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function buildNome(): HTMLElement {
  if (rascunhoApelido !== null) {
    const campo = el('input', 'hm-nome-campo');
    campo.type = 'text';
    campo.value = rascunhoApelido;
    campo.maxLength = MAX_APELIDO;
    campo.placeholder = 'seu apelido';
    campo.setAttribute('aria-label', 'Como o Iris te chama');
    campo.size = Math.max(campo.value.length, campo.placeholder.length) + 1;
    campo.addEventListener('input', () => {
      rascunhoApelido = campo.value;
      campo.size = Math.max(campo.value.length, campo.placeholder.length) + 1;
    });
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // Salva já (não espera o blur): o rascunho zera antes, então o blur da troca não salva de novo.
        e.preventDefault();
        void salvarApelido(campo.value);
      } else if (e.key === 'Escape') {
        // Esc cancela aqui, antes da pilha de camadas (não há modal aberto nesta tela).
        e.preventDefault();
        e.stopPropagation();
        rascunhoApelido = null;
        desenhar();
      }
    });
    campo.addEventListener('blur', () => {
      if (rascunhoApelido !== null) void salvarApelido(campo.value);
    });
    // Focado depois de entrar no documento (desenhar o chama ao final).
    queueMicrotask(() => {
      campo.focus();
      campo.setSelectionRange(campo.value.length, campo.value.length);
    });
    return campo;
  }
  const editar = (): void => {
    rascunhoApelido = apelido;
    desenhar();
  };
  if (apelido) {
    const nome = el('button', 'hm-nome');
    nome.append(palavras(apelido, 0));
    nome.type = 'button';
    nome.setAttribute('aria-label', `${apelido} — mudar como o Iris te chama`);
    nome.title = 'Mudar como o Iris te chama';
    nome.addEventListener('click', editar);
    return nome;
  }
  const convite = el('button', 'hm-nome-convite', 'Como quer ser chamado?');
  convite.type = 'button';
  convite.addEventListener('click', editar);
  return convite;
}

/** O resumo do dia numa frase, só com fatos: quanto falta, quando, o que ficou para trás e o que já foi. */
function frase(d: DiaHoje): string {
  const pendentes = d.doDia.length;
  const total = pendentes + d.feitos.length;
  const partesTexto: string[] = [];
  if (pendentes) partesTexto.push(`Hoje tem ${plural(pendentes, 'entrega', 'entregas')}${emQuePeriodo(d.doDia)}.`);
  else if (d.feitos.length) partesTexto.push('Tudo o que era para hoje está feito.');
  else partesTexto.push('Nada com data para hoje.');
  if (d.atrasados.length) partesTexto.push(`${plural(d.atrasados.length, 'ficou', 'ficaram')} de dias anteriores.`);
  if (pendentes && d.feitos.length) partesTexto.push(`Você já fechou ${d.feitos.length} de ${total}.`);
  if (!pendentes && !d.atrasados.length) {
    const prox = d.proximos.find((p) => p.itens.length);
    if (prox) {
      const quando = diasEntre(d.hoje, prox.data) === 1 ? 'amanhã' : dataLocal(prox.data).toLocaleDateString('pt-BR', { weekday: 'long' });
      partesTexto.push(`O próximo é “${prox.itens[0]!.titulo}”, ${quando}.`);
    }
  }
  return partesTexto.join(' ');
}

/**
 * Texto em palavras, cada uma dentro de uma máscara: na animação a palavra sobe
 * de trás da máscara. Por palavra, não por letra — letra solta em caixa perde o
 * kerning da fonte. `--i` é a ordem, para o atraso escalonado.
 */
function palavras(texto: string, inicio: number): DocumentFragment {
  const frag = document.createDocumentFragment();
  texto.split(' ').forEach((p, n) => {
    if (n) frag.appendChild(document.createTextNode(' '));
    const mascara = el('span', 'hm-palavra');
    const dentro = el('span', 'hm-palavra-texto', p);
    dentro.style.setProperty('--i', String(inicio + n));
    mascara.appendChild(dentro);
    frag.appendChild(mascara);
  });
  return frag;
}

function buildSaudacao(minutos: number): HTMLElement {
  const saudacao = SAUDACAO[periodoDe(minutos)];
  const comNome = !!apelido || rascunhoApelido !== null;
  const chave = `${saudacao}|${rascunhoApelido === null ? apelido : ''}`;
  // Anima ao abrir, ao virar o período e ao trocar o apelido; o redesenho de cada minuto fica parado.
  const animar = rascunhoApelido === null && chave !== saudacaoMostrada;
  if (rascunhoApelido === null) saudacaoMostrada = chave;
  const titulo = el('h1', `hm-saudacao${animar ? ' is-animando' : ''}`);
  const qtd = saudacao.split(' ').length;
  if (comNome) {
    titulo.append(palavras(`${saudacao},`, 0), document.createTextNode(' '));
    const nome = buildNome();
    nome.style.setProperty('--depois', String(qtd));
    titulo.appendChild(nome);
    if (rascunhoApelido === null) {
      const ponto = el('span', 'hm-ponto', '.');
      ponto.style.setProperty('--i', String(qtd + apelido.split(' ').length));
      titulo.appendChild(ponto);
    }
  } else {
    titulo.append(palavras(`${saudacao}.`, 0), buildNome());
  }
  return titulo;
}

/** O cartão "Próximo": o que vem a seguir hoje, quanto falta e um atalho para abrir. */
function buildProximo(d: DiaHoje, minutos: number): HTMLElement | null {
  const prox = proximoDoDia(d, minutos);
  if (!prox) return null;
  const { i, m } = prox;
  const cartao = el('section', 'hm-proximo');
  const cab = el('div', 'hm-proximo-cab');
  cab.append(el('span', 'hm-rotulo', m === minutos ? 'Próximo · agora' : `Próximo · em ${duracao(m - minutos)}`), el('span', 'hm-proximo-hora', i.hora ?? ''));
  const rodape = el('div', 'hm-proximo-rodape');
  rodape.appendChild(el('span', 'hm-proximo-meta', `${TIPOS[i.tipo].rotulo} · ${i.detalhe}`));
  const abrir = el('button', 'hm-botao', 'Abrir');
  abrir.type = 'button';
  abrir.title = `Abrir em ${TIPOS[i.tipo].modulo}`;
  abrir.addEventListener('click', () => abrirAlvo(i.alvo));
  rodape.appendChild(abrir);
  cartao.append(cab, el('h2', 'hm-proximo-titulo', i.titulo), rodape);
  return cartao;
}

function buildTopo(d: DiaHoje | null): HTMLElement {
  const minutos = minutosAgora();
  const hoje = d?.hoje ?? hojeLocal();
  const topo = el('header', 'hm-topo');
  const textos = el('div', 'hm-topo-textos');
  const data = dataLocal(hoje).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(', ', ' · ');
  textos.appendChild(el('p', 'hm-data', `${data} · ${hhmm(minutos)}`));
  textos.appendChild(buildSaudacao(minutos));
  const texto = aba === 'semana' ? (revisao ? fraseDaSemana(revisao) : ' ') : d ? frase(d) : ' ';
  textos.appendChild(el('p', 'hm-frase', texto));
  topo.appendChild(textos);
  if (aba === 'dia' && d) {
    const prox = buildProximo(d, minutos);
    if (prox) topo.appendChild(prox);
  }
  return topo;
}

/**
 * A faixa do dia: as horas de 6h a 22h numa linha, cheia até agora, com uma
 * marca por horário que tem algo. Mostra de relance onde o dia está ocupado.
 */
function buildFaixa(d: DiaHoje, minutos: number): HTMLElement {
  const todos = comHoraOrdenados([...d.doDia, ...d.feitos]);
  const inicio = Math.min(FAIXA_INICIO, ...todos.map((x) => Math.floor(x.m / 60)), Math.floor(minutos / 60)) * 60;
  const fim = Math.max(FAIXA_FIM, ...todos.map((x) => Math.ceil((x.m + 1) / 60))) * 60;
  const pos = (m: number): string => `${((Math.min(Math.max(m, inicio), fim) - inicio) / (fim - inicio)) * 100}%`;

  const faixa = el('section', 'hm-faixa');
  faixa.setAttribute('aria-label', `Faixa do dia, das ${inicio / 60}h às ${fim / 60}h`);
  const trilho = el('div', 'hm-faixa-trilho');
  const cheio = el('span', 'hm-faixa-cheio');
  cheio.style.width = pos(minutos);
  trilho.appendChild(cheio);

  // Itens no mesmo horário viram uma marca só, com todos no title.
  const porHora = new Map<number, ItemDia[]>();
  todos.forEach(({ i, m }) => porHora.set(m, [...(porHora.get(m) ?? []), i]));
  porHora.forEach((itens, m) => {
    const feito = itens.every((i) => i.feito);
    const alta = itens.some((i) => !i.feito && i.prioridade === 'alta');
    const passou = !feito && m < minutos;
    const marca = el('button', `hm-faixa-marca${feito ? ' is-feito' : alta ? ' is-alta' : passou ? ' is-passou' : ''}`);
    marca.type = 'button';
    marca.style.left = pos(m);
    marca.title = itens.map((i) => `${i.hora} · ${i.titulo}${i.feito ? ' (feito)' : ''}`).join('\n');
    marca.setAttribute('aria-label', marca.title);
    marca.addEventListener('click', () => abrirAlvo(itens[0]!.alvo));
    trilho.appendChild(marca);
  });

  const agora = el('span', 'hm-faixa-agora');
  agora.style.left = pos(minutos);
  agora.title = `Agora, ${hhmm(minutos)}`;
  trilho.appendChild(agora);

  const horas = el('div', 'hm-faixa-horas');
  horas.setAttribute('aria-hidden', 'true');
  for (let h = inicio / 60; h <= fim / 60; h += 4) {
    const rotulo = el('span', undefined, `${String(h).padStart(2, '0')}h`);
    rotulo.style.left = pos(h * 60);
    horas.appendChild(rotulo);
  }
  faixa.append(trilho, horas);
  return faixa;
}

function buildMarcar(item: ItemDia): HTMLElement | null {
  if (!item.podeConcluir) return null;
  const marcar = el('button', 'hm-marcar');
  marcar.type = 'button';
  marcar.setAttribute('aria-pressed', String(item.feito));
  const acao = item.tipo === 'card' ? (item.feito ? 'Voltar o card para a primeira coluna' : 'Concluir: mover para a última coluna do Kanban') : item.feito ? 'Desmarcar a rotina de hoje' : 'Marcar a rotina como feita hoje';
  marcar.title = acao;
  marcar.setAttribute('aria-label', `${acao}: ${item.titulo}`);
  marcar.innerHTML = svg(ICONE_CHECK, 12, 2.8);
  marcar.addEventListener('click', () => void concluir(item, !item.feito));
  return marcar;
}

/** Um item como cartão: o círculo de concluir (card e rotina), o título que abre o item, o detalhe e a prioridade. */
function buildItem(item: ItemDia, opcoes: { hoje: string; comAtraso?: boolean; comHora?: boolean; passou?: boolean }): HTMLElement {
  const linha = el('div', `hm-item is-${item.tipo}${item.feito ? ' is-feito' : ''}`);
  linha.dataset.chave = item.chave;
  linha.setAttribute('role', 'listitem');
  const marcar = buildMarcar(item);
  if (marcar) linha.appendChild(marcar);

  const abrir = el('button', 'hm-abrir');
  abrir.type = 'button';
  abrir.title = `Abrir em ${TIPOS[item.tipo].modulo}`;
  const textos = el('span', 'hm-textos');
  textos.appendChild(el('span', 'hm-titulo', item.titulo));
  const meta = el('span', 'hm-meta', `${TIPOS[item.tipo].rotulo} · ${item.detalhe}`);
  if (opcoes.comAtraso) meta.appendChild(el('span', 'hm-atraso', ` · ${atraso(item.data, opcoes.hoje)}`));
  if (opcoes.passou) meta.appendChild(el('span', 'hm-atraso', ' · passou do horário'));
  textos.appendChild(meta);
  abrir.appendChild(textos);
  abrir.addEventListener('click', () => abrirAlvo(item.alvo));
  linha.appendChild(abrir);

  const lado = el('span', 'hm-lado');
  if (opcoes.comHora && item.hora) lado.appendChild(el('span', 'hm-hora-lado', item.hora));
  // Prioridade com ponto + texto (nunca só a cor).
  if (item.prioridade === 'alta' && !item.feito) lado.appendChild(el('span', 'hm-prioridade', 'Alta'));
  linha.appendChild(lado);
  return linha;
}

function buildQuadro(classe: string, titulo: string, detalhe?: string): { quadro: HTMLElement; corpo: HTMLElement } {
  const quadro = el('section', `hm-quadro ${classe}`);
  const cab = el('header', 'hm-quadro-cab');
  cab.appendChild(el('h2', undefined, titulo));
  if (detalhe) cab.appendChild(el('span', 'hm-quadro-detalhe', detalhe));
  const corpo = el('div', 'hm-quadro-corpo');
  quadro.append(cab, corpo);
  return { quadro, corpo };
}

/**
 * A agenda de hoje como linha do tempo: o que tem hora, na ordem, com o
 * marcador de "agora" entre o que já passou e o que vem (e o tempo livre até
 * a próxima); o que não tem hora fica em "Ao longo do dia"; o feito, recolhido no fim.
 */
function buildAgenda(d: DiaHoje, minutos: number): HTMLElement {
  const detalhe = [d.doDia.length ? plural(d.doDia.length, 'pendente', 'pendentes') : '', d.feitos.length ? plural(d.feitos.length, 'feita', 'feitas') : ''].filter(Boolean).join(' · ');
  const { quadro, corpo } = buildQuadro('hm-agenda', 'Agenda de hoje', detalhe || undefined);

  if (!d.doDia.length) {
    const vazio = el('div', 'hm-agenda-vazia');
    vazio.append(
      el('strong', undefined, d.feitos.length ? 'Tudo feito por hoje' : 'Dia sem compromissos marcados'),
      el('span', undefined, 'Aparecem aqui os cards e as checklists com prazo, as postagens com data e as rotinas do Quadro marcadas para o dia da semana.'),
    );
    corpo.appendChild(vazio);
  }

  const comHora = comHoraOrdenados(d.doDia);
  const semHora = d.doDia.filter((i) => minutosDe(i.hora) === null);

  if (comHora.length) {
    const linha = el('div', 'hm-linha');
    linha.setAttribute('role', 'list');
    let agoraPosto = false;
    const porAgora = (proxima: number | null): void => {
      const agora = el('div', 'hm-agora');
      agora.append(el('span', 'hm-agora-hora', hhmm(minutos)), el('span', 'hm-agora-ponto'), el('span', 'hm-agora-rotulo', 'Agora'));
      linha.appendChild(agora);
      if (proxima !== null && proxima > minutos) linha.appendChild(el('p', 'hm-livre', `${duracao(proxima - minutos)} livres até a próxima entrega`));
      agoraPosto = true;
    };
    comHora.forEach(({ i, m }) => {
      if (!agoraPosto && m > minutos) porAgora(m);
      const passo = el('div', `hm-passo${m <= minutos ? ' is-passou' : ''}`);
      passo.append(el('span', 'hm-passo-hora', i.hora ?? ''), el('span', 'hm-passo-ponto'), buildItem(i, { hoje: d.hoje, passou: m < minutos }));
      linha.appendChild(passo);
    });
    if (!agoraPosto) porAgora(null);
    corpo.appendChild(linha);
  }

  if (semHora.length) {
    if (comHora.length) corpo.appendChild(el('h3', 'hm-subtitulo', 'Ao longo do dia'));
    const lista = el('div', 'hm-lista');
    lista.setAttribute('role', 'list');
    semHora.forEach((i) => lista.appendChild(buildItem(i, { hoje: d.hoje })));
    corpo.appendChild(lista);
  }

  if (d.feitos.length) {
    const recolhida = lerRecolhidos().has('feitos');
    const botao = el('button', 'hm-feitos-botao');
    botao.type = 'button';
    botao.setAttribute('aria-expanded', String(!recolhida));
    const seta = el('span', `hm-seta${recolhida ? '' : ' is-aberta'}`);
    seta.innerHTML = svg(ICONE_SETA, 12);
    botao.append(seta, document.createTextNode(plural(d.feitos.length, 'concluída hoje', 'concluídas hoje')));
    botao.addEventListener('click', () => {
      alternarRecolhido('feitos');
      desenhar();
    });
    const rodape = el('div', 'hm-agenda-rodape');
    rodape.appendChild(botao);
    if (!recolhida) {
      const lista = el('div', 'hm-lista is-compacta');
      lista.setAttribute('role', 'list');
      d.feitos.forEach((i) => lista.appendChild(buildItem(i, { hoje: d.hoje, comHora: true })));
      rodape.appendChild(lista);
    }
    corpo.appendChild(rodape);
  }
  return quadro;
}

function buildAtrasados(d: DiaHoje): HTMLElement {
  const { quadro, corpo } = buildQuadro('hm-atrasados', 'Ficou para trás', plural(d.atrasados.length, 'item', 'itens'));
  const lista = el('div', 'hm-lista');
  lista.setAttribute('role', 'list');
  d.atrasados.forEach((i) => lista.appendChild(buildItem(i, { hoje: d.hoje, comAtraso: true, comHora: true })));
  corpo.appendChild(lista);
  return quadro;
}

/** O anel: feitos sobre tudo o que era para hoje. É o único número da tela, e está desenhado. */
function buildProgresso(d: DiaHoje, minutos: number): HTMLElement | null {
  const total = d.feitos.length + d.doDia.length;
  if (!total) return null;
  const feitos = d.feitos.length;
  const quadro = el('section', 'hm-quadro hm-progresso');

  const r = 30;
  const volta = 2 * Math.PI * r;
  const anel = el('div', 'hm-anel');
  anel.setAttribute('role', 'img');
  anel.setAttribute('aria-label', `${feitos} de ${total} feitos hoje`);
  anel.innerHTML = `<svg viewBox="0 0 76 76" width="76" height="76">
    <circle cx="38" cy="38" r="${r}" class="hm-anel-trilha"/>
    <circle cx="38" cy="38" r="${r}" class="hm-anel-cheio" stroke-dasharray="${(feitos / total) * volta} ${volta}" transform="rotate(-90 38 38)"/>
  </svg>`;
  const centro = el('span', 'hm-anel-centro');
  centro.append(el('strong', undefined, String(feitos)), el('span', undefined, `/${total}`));
  anel.appendChild(centro);

  const texto = el('div', 'hm-progresso-texto');
  const restante = d.doDia.length;
  const partesTexto: string[] = [];
  if (restante) {
    partesTexto.push(`${restante === 1 ? 'Falta 1 entrega' : `Faltam ${restante} entregas`}${emQuePeriodo(d.doDia)}.`);
    // Fato da agenda, não conselho: a manhã não tem nada marcado e ainda não acabou.
    const manhaOcupada = d.doDia.some((i) => {
      const m = minutosDe(i.hora);
      return m === null || m < 12 * 60;
    });
    if (minutos < 12 * 60 && !manhaOcupada) partesTexto.push('Manhã sem nada marcado.');
  } else {
    partesTexto.push('Tudo o que era de hoje foi feito.');
  }
  texto.append(el('strong', undefined, `${Math.round((feitos / total) * 100)}% do dia fechado`), el('span', undefined, partesTexto.join(' ')));
  quadro.append(anel, texto);
  return quadro;
}

/** Os próximos dias: a folhinha do dia à esquerda, os itens com hora à direita. */
function buildProximos(d: DiaHoje): HTMLElement {
  const total = d.proximos.reduce((n, p) => n + p.itens.length, 0);
  const { quadro, corpo } = buildQuadro('hm-proximos', 'Próximos dias', total ? plural(total, 'agendado', 'agendados') : undefined);
  d.proximos.forEach((p) => {
    const data = dataLocal(p.data);
    const linha = el('div', `hm-prox${p.itens.length ? '' : ' is-livre'}`);
    const folha = el('div', 'hm-prox-folha');
    folha.append(el('span', 'hm-prox-semana', data.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')), el('span', 'hm-prox-dia', String(data.getDate())));
    const itens = el('div', 'hm-prox-itens');
    const quando = diasEntre(d.hoje, p.data) === 1 ? 'Amanhã · ' : '';
    itens.appendChild(el('span', 'hm-prox-resumo', p.itens.length ? `${quando}${plural(p.itens.length, 'item', 'itens')}` : `${quando}Livre`));
    const aberto = diasAbertos.has(p.data);
    (aberto ? p.itens : p.itens.slice(0, MAX_POR_DIA)).forEach((i) => {
      const b = el('button', 'hm-prox-item');
      b.type = 'button';
      b.title = `${TIPOS[i.tipo].rotulo} · ${i.detalhe} — abrir em ${TIPOS[i.tipo].modulo}`;
      b.append(el('span', 'hm-prox-hora', i.hora ?? '—'), el('span', 'hm-prox-titulo', i.titulo));
      b.addEventListener('click', () => abrirAlvo(i.alvo));
      itens.appendChild(b);
    });
    if (p.itens.length > MAX_POR_DIA) {
      const resto = p.itens.length - MAX_POR_DIA;
      const mais = el('button', 'hm-link', aberto ? 'Mostrar menos' : `+ ${resto} ${resto === 1 ? 'outro' : 'outros'}`);
      mais.type = 'button';
      mais.addEventListener('click', () => {
        if (aberto) diasAbertos.delete(p.data);
        else diasAbertos.add(p.data);
        desenhar();
      });
      itens.appendChild(mais);
    }
    linha.append(folha, itens);
    corpo.appendChild(linha);
  });
  return quadro;
}

/**
 * O dia em duas colunas que crescem cada uma por si: à esquerda o que é de
 * fazer (atrasados, agenda) e o que é de olhar devagar (constância, uma ideia,
 * uma lembrança); à direita o que é de consultar (progresso, caixa de entrada,
 * próximos dias, roteiros). Assim nenhuma coluna deixa buraco embaixo da outra.
 */
function buildDia(d: DiaHoje): HTMLElement {
  const minutos = minutosAgora();
  const tela = el('div', 'hm-dia');
  // Sem IA ou com erro, o cartão não aparece: a Home não mostra aviso de falha (o usuário pediu).
  // Gerando, aparece o "escrevendo…"; se der erro, some no redesenho seguinte.
  if (gerandoSugestao || sugestao?.estado === 'pronta' || sugestao?.estado === 'nova') {
    tela.appendChild(buildSugestao(sugestao, gerandoSugestao, { gerar: () => void gerarSugestao() }));
  }
  tela.appendChild(buildFaixa(d, minutos));
  const grade = el('div', 'hm-grade');
  const principal = el('div', 'hm-coluna');
  if (d.atrasados.length) principal.appendChild(buildAtrasados(d));
  principal.appendChild(buildAgenda(d, minutos));
  const lado = el('div', 'hm-coluna is-lado');
  const progresso = buildProgresso(d, minutos);
  if (progresso) lado.appendChild(progresso);
  if (pulso) {
    principal.appendChild(buildConstancia(pulso));
    lado.appendChild(buildCaixa(pulso));
  }
  if (d.proximos.length) lado.appendChild(buildProximos(d));
  if (pulso) {
    // Cartões "avulsos": não têm coluna fixa — equilibrar() os põe na mais curta depois de desenhar.
    const avulsos = [buildIdeia(pulso, { outraIdeia: () => void outraIdeia() }), buildLembranca(pulso), buildRoteiros(pulso)].filter((c): c is HTMLElement => !!c);
    avulsos.forEach((c) => {
      c.dataset.avulso = '';
      lado.appendChild(c);
    });
  }
  grade.append(principal, lado);
  tela.appendChild(grade);
  return tela;
}

function desenhar(): void {
  if (!containerAtual) return;
  // Digitando o apelido: um push no meio não troca o campo (o foco e o cursor ficam); salvar redesenha.
  if (rascunhoApelido !== null && document.activeElement?.classList.contains('hm-nome-campo')) return;
  const rolagemAntes = containerAtual.querySelector<HTMLElement>('.pg-rolagem')?.scrollTop ?? 0;
  const view = el('div', `pg-view hm-view${entrando ? ' is-entrando' : ''}`);
  const rolagem = el('div', 'pg-rolagem');
  const pagina = el('div', 'hm-pagina');
  const d = dia;

  const barra = el('div', 'hm-barra');
  barra.appendChild(
    buildSegmentado<AbaHoje>(
      [
        { value: 'dia', label: 'Dia' },
        { value: 'semana', label: 'Semana' },
      ],
      aba,
      (v) => {
        aba = v;
        if (v === 'semana' && !semanaInicio) semanaInicio = semanaAtual();
        desenhar();
        void recarregar();
      },
    ),
  );
  pagina.append(barra, buildTopo(d));

  if (erro) pagina.appendChild(el('p', 'hm-erro', erro));
  if (aba === 'semana') {
    pagina.appendChild(
      buildSemana(semanaInicio, revisao && revisao.inicio === semanaInicio ? revisao : null, {
        irPara: (inicio) => {
          semanaInicio = inicio;
          desenhar();
          void recarregarSemana();
        },
        exportar: () => void exportarSemana(),
      }),
    );
  } else if (d) {
    pagina.appendChild(buildDia(d));
  }

  rolagem.appendChild(pagina);
  view.appendChild(rolagem);
  containerAtual.replaceChildren(view);
  equilibrar(pagina);
  rolagem.scrollTop = rolagemAntes;
}

/**
 * As duas colunas crescem cada uma por si, e a altura depende do dia (a agenda,
 * as concluídas abertas ou não). Com a tela já no documento, cada cartão avulso
 * vai, na ordem, para a coluna que está mais curta naquele momento.
 */
function equilibrar(pagina: HTMLElement): void {
  const [esquerda, direita] = pagina.querySelectorAll<HTMLElement>('.hm-grade > .hm-coluna');
  if (!esquerda || !direita) return;
  // Em tela estreita as colunas empilham: aí a ordem do código vale.
  if (getComputedStyle(esquerda.parentElement!).gridTemplateColumns.split(' ').length < 2) return;
  const avulsos = [...pagina.querySelectorAll<HTMLElement>('[data-avulso]')];
  avulsos.forEach((c) => c.remove());
  avulsos.forEach((c) => (esquerda.offsetHeight <= direita.offsetHeight ? esquerda : direita).appendChild(c));
}

export function montar(viewRoot: HTMLElement): void {
  containerAtual = viewRoot;
  // O lembrete de segunda ("a revisão está pronta") abre direto na semana que acabou.
  const pedida = consumirAbaHoje();
  aba = pedida ?? 'dia';
  semanaInicio = pedida === 'semana' ? somarDias(semanaAtual(), -7) : semanaAtual();
  revisao = null;
  rascunhoApelido = null;
  saudacaoMostrada = '';
  diasAbertos.clear();
  semente = 0;
  push.attach();
  window.addEventListener('focus', aoFocar);
  // A saudação, a hora, a faixa e o "agora" andam com o relógio; à meia-noite a tela vira para o dia novo.
  timerRelogio = setInterval(() => {
    if (dia && dia.hoje !== hojeLocal()) void recarregar();
    else if (rascunhoApelido === null) desenhar();
  }, 60_000);
  // A primeira tela espera o dia e o apelido juntos: a saudação não pode aparecer e depois ganhar o nome.
  entrando = true;
  void recarregar().then(() => {
    entrando = false;
  });
}

export function destroy(): void {
  push.detach();
  window.removeEventListener('focus', aoFocar);
  if (timerRecarga) clearTimeout(timerRecarga);
  if (timerRelogio) clearInterval(timerRelogio);
  timerRecarga = null;
  timerRelogio = null;
  containerAtual = null;
}
