import type { IpcResult } from '../../../shared/types/common.types';
import {
  INTERVALOS_BACKUP,
  MANTER_BACKUPS_MAX,
  MANTER_BACKUPS_MIN,
  type BackupNaPasta,
  type EstadoBackupAuto,
} from '../../../shared/types/backup.types.js';
import type { PreviaImportacao } from '../../../shared/types/export.types';
import type {} from '../../../shared/types/preload-api.types';
import { campo, input, interruptor, select } from '../../ui/campos.js';
import { ICONES, buildBotao, svg, tempoRelativo } from '../../ui/pagina.js';
import { createPushBinding } from '../../core/pushBinding.js';

/**
 * Ajustes › Backup › Backup automático. A pasta é escolhida no diálogo do main
 * (a tela nunca manda caminho) e restaurar passa pela mesma prévia da
 * importação, com a cópia "antes de importar" e o Desfazer de sempre.
 */

const ICONE_RELOGIO = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
const ICONE_RESTAURAR = '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>';

let raiz: HTMLElement | null = null;
let estado: EstadoBackupAuto | null = null;
let backups: BackupNaPasta[] = [];
let erro = '';
let abrirPrevia: ((previa: PreviaImportacao) => void) | null = null;

const push = createPushBinding([
  () =>
    window.irisAPI.events.on('backup:estado', (novo) => {
      const terminou = estado?.fazendo && !novo.fazendo;
      estado = novo;
      // A lista só muda quando um backup termina (ou a pasta troca, que já relê).
      if (terminou) void recarregarLista();
      else desenhar();
    }),
]);

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function dataHora(iso: string, segundos = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', ...(segundos ? { second: '2-digit' } : {}) });
}

function tamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

async function acao(fn: () => Promise<unknown>): Promise<void> {
  erro = '';
  try {
    await fn();
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  desenhar();
}

async function recarregarLista(): Promise<void> {
  try {
    backups = unwrap(await window.irisAPI.backup.listar());
  } catch {
    backups = [];
  }
  desenhar();
}

async function escolherPasta(): Promise<boolean> {
  const novo = unwrap(await window.irisAPI.backup.escolherPasta());
  if (!novo) return false;
  estado = novo;
  await recarregarLista();
  return true;
}

async function ligar(ativo: boolean): Promise<void> {
  // Ligar sem pasta abre o diálogo antes, em vez de só reclamar.
  if (ativo && !estado?.pasta && !(await escolherPasta())) return;
  estado = unwrap(await window.irisAPI.backup.mudarConfig({ ativo }));
}

async function restaurar(b: BackupNaPasta): Promise<void> {
  const previa = unwrap(await window.irisAPI.backup.prepararRestauracao(b.arquivo));
  abrirPrevia?.(previa);
}

function linhaSituacao(e: EstadoBackupAuto): HTMLElement {
  if (e.ultimoErro) {
    const aviso = el('p', 'bk-status is-erro', e.ultimoErro);
    aviso.setAttribute('role', 'alert');
    return aviso;
  }
  const partes: string[] = [];
  partes.push(e.ultimoEm ? `Último backup: ${tempoRelativo(e.ultimoEm)} (${dataHora(e.ultimoEm)})` : 'Nenhum backup feito ainda');
  if (e.fazendo) partes.push('fazendo agora…');
  else if (e.ativo && e.proximoEm) partes.push(Date.parse(e.proximoEm) <= Date.now() ? 'o próximo sai em instantes' : `próximo em ${dataHora(e.proximoEm)}`);
  return el('p', 'bk-auto-situacao', partes.join(' · '));
}

function buildPasta(e: EstadoBackupAuto): HTMLElement {
  const linha = el('div', 'bk-auto-pasta');
  const icone = el('span', 'bk-icone');
  icone.innerHTML = svg(ICONES.pasta, 15);
  const textos = el('div', 'bk-linha-textos');
  textos.appendChild(el('strong', undefined, 'Pasta'));
  const caminho = el('span', e.pasta && !e.pastaExiste ? 'is-ausente' : undefined, e.pasta || 'Nenhuma pasta escolhida');
  if (e.pasta) caminho.title = e.pasta;
  textos.appendChild(caminho);
  const acoes = el('div', 'bk-linha-acoes');
  const trocar = buildBotao(e.pasta ? 'Trocar…' : 'Escolher pasta…', { variante: 'secundario', icone: ICONES.pasta });
  trocar.addEventListener('click', () => void acao(escolherPasta));
  acoes.appendChild(trocar);
  if (e.pastaExiste) {
    const abrir = buildBotao('', { variante: 'fantasma', icone: ICONES.externo, titulo: 'Abrir a pasta no Explorador' });
    abrir.setAttribute('aria-label', 'Abrir a pasta dos backups');
    abrir.addEventListener('click', () => void acao(async () => unwrap(await window.irisAPI.backup.abrirPasta())));
    acoes.appendChild(abrir);
  }
  linha.append(icone, textos, acoes);
  return linha;
}

function buildOpcoes(e: EstadoBackupAuto): HTMLElement {
  const grade = el('div', 'bk-auto-opcoes');
  const intervalo = select(
    String(e.intervaloHoras),
    INTERVALOS_BACKUP.map((i) => ({ value: String(i.horas), label: i.rotulo })),
  );
  intervalo.addEventListener('change', () =>
    void acao(async () => {
      estado = unwrap(await window.irisAPI.backup.mudarConfig({ intervaloHoras: Number(intervalo.value) }));
    }),
  );
  const manter = input('number', String(e.manter));
  manter.min = String(MANTER_BACKUPS_MIN);
  manter.max = String(MANTER_BACKUPS_MAX);
  manter.addEventListener('change', () =>
    void acao(async () => {
      estado = unwrap(await window.irisAPI.backup.mudarConfig({ manter: Number(manter.value) }));
      await recarregarLista();
    }),
  );
  grade.append(
    campo('Frequência', intervalo),
    campo('Versões guardadas', manter, `As mais antigas são apagadas da pasta (de ${MANTER_BACKUPS_MIN} a ${MANTER_BACKUPS_MAX}).`),
  );
  return grade;
}

function buildLista(): HTMLElement {
  const secao = el('div', 'bk-auto-lista');
  secao.appendChild(el('h4', undefined, backups.length ? `Backups na pasta · ${backups.length}` : 'Backups na pasta'));
  if (!backups.length) {
    secao.appendChild(el('p', 'bk-auto-vazio', 'Nenhum backup do Iris nesta pasta ainda.'));
    return secao;
  }
  const lista = el('div', 'bk-lista');
  backups.forEach((b, i) => {
    const linha = el('div', 'bk-linha');
    const icone = el('span', 'bk-icone');
    icone.innerHTML = svg(ICONES.backup, 15);
    const textos = el('div', 'bk-linha-textos');
    // Segundos na lista: dois "Fazer agora" no mesmo minuto não podem parecer o mesmo backup.
    textos.append(el('strong', undefined, dataHora(b.criadoEm, true)), el('span', undefined, `${tamanho(b.tamanho)}${i === 0 ? ' · o mais recente' : ''}`));
    textos.title = b.arquivo;
    const acoes = el('div', 'bk-linha-acoes');
    const voltar = buildBotao('Restaurar…', { variante: 'fantasma', icone: ICONE_RESTAURAR, titulo: 'Mostra o que o backup traz antes de substituir qualquer coisa' });
    voltar.addEventListener('click', () => void acao(() => restaurar(b)));
    acoes.appendChild(voltar);
    linha.append(icone, textos, acoes);
    lista.appendChild(linha);
  });
  secao.appendChild(lista);
  return secao;
}

function desenhar(): void {
  if (!raiz) return;
  const cab = el('header', 'bk-secao-cab');
  cab.append(
    el('h3', undefined, 'Backup automático'),
    el(
      'p',
      undefined,
      'Um backup completo de tempos em tempos numa pasta sua — um HD externo ou uma pasta sincronizada com a nuvem, por exemplo. Ficam só as versões mais recentes.',
    ),
  );
  if (!estado) {
    raiz.replaceChildren(cab, el('p', 'bk-auto-situacao', 'Carregando…'));
    return;
  }
  const e = estado;
  const cartao = el('div', 'bk-auto');
  const topo = el('div', 'bk-auto-topo');
  const icone = el('span', 'bk-icone');
  icone.innerHTML = svg(ICONE_RELOGIO, 15);
  topo.append(
    icone,
    interruptor('Fazer backup automático', e.ativo ? 'Ligado' : 'Desligado — nenhum backup sai sozinho', e.ativo, (v) => void acao(() => ligar(v))),
  );
  cartao.append(topo, buildPasta(e), buildOpcoes(e), linhaSituacao(e));

  const rodape = el('div', 'bk-auto-rodape');
  const agora = buildBotao(e.fazendo ? 'Fazendo backup…' : 'Fazer backup agora', { variante: 'primario', icone: ICONES.backup });
  agora.disabled = e.fazendo || !e.pasta || !e.pastaExiste;
  agora.addEventListener('click', () =>
    void acao(async () => {
      estado = unwrap(await window.irisAPI.backup.fazerAgora());
      await recarregarLista();
    }),
  );
  rodape.append(
    agora,
    el('p', 'bk-auto-aviso', 'Cada arquivo leva todos os dados, inclusive os contatos do CRM. Ficam de fora os anexos, as imagens da IA e as senhas e chaves.'),
  );
  cartao.appendChild(rodape);

  const filhos: HTMLElement[] = [cab, cartao];
  if (erro) {
    const aviso = el('p', 'bk-status is-erro', erro);
    aviso.setAttribute('role', 'alert');
    filhos.push(aviso);
  }
  if (e.pasta) filhos.push(buildLista());
  raiz.replaceChildren(...filhos);
}

export function buildBackupAutomatico(aoRestaurar: (previa: PreviaImportacao) => void): HTMLElement {
  const secao = el('section', 'bk-secao');
  raiz = secao;
  abrirPrevia = aoRestaurar;
  push.attach();
  desenhar();
  void window.irisAPI.backup.getEstado().then((r) => {
    if (raiz !== secao) return;
    if (r.ok) estado = r.data;
    else erro = r.error;
    void recarregarLista();
  });
  return secao;
}

export function destroyBackupAutomatico(): void {
  push.detach();
  raiz = null;
  abrirPrevia = null;
}
