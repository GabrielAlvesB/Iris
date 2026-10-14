import { readStore, writeStore } from '../../storage/jsonStore';
import { registerTask, startTask } from '../../core/scheduler';
import { broadcast } from '../../core/broadcast';
import { notificacaoDisponivel, notificar } from '../../core/notificacao';
import * as hojeService from '../hoje/hoje.service';
import { atualizarBandeja } from '../../core/bandeja';
import {
  ANTECEDENCIAS_POSTAGEM,
  configLembretesPadrao,
  type AberturaLembrete,
  type ConfigLembretes,
  type EstadoLembretes,
  type LembretesFile,
} from '../../../shared/types/lembretes.types';

/**
 * Lembretes nativos a partir do mesmo dia que a tela Hoje mostra
 * (hoje.service): o que aparece lá é o que avisa aqui, sem uma segunda regra.
 * A tarefa roda a cada minuto e cada aviso tem uma chave — fechar e abrir o
 * app não repete, e um aviso perdido (app fechado na hora) não chega atrasado.
 */

const FILE_NAME = 'lembretes.json';
const SCHEMA_VERSION = 1;
export const TAREFA_LEMBRETES = 'lembretes:verificar';
/** Postagem: o aviso ainda vale até alguns minutos depois do horário; depois disso, perdeu a graça. */
const TOLERANCIA_POSTAGEM_MIN = 5;
const TOLERANCIA_ROTINA_MIN = 30;
const GUARDAR_AVISOS_DIAS = 7;

function hora(v: unknown, padrao: string): string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : padrao;
}

function bool(v: unknown, padrao: boolean): boolean {
  return typeof v === 'boolean' ? v : padrao;
}

function migrarConfig(raw: unknown): ConfigLembretes {
  const p = configLembretesPadrao();
  const r = (raw ?? {}) as Partial<Record<keyof ConfigLembretes, Record<string, unknown>>> & { ativo?: unknown };
  const antecedencia = Number(r.postagens?.antecedenciaMin);
  return {
    ativo: bool(r.ativo, p.ativo),
    postagens: {
      ativo: bool(r.postagens?.ativo, p.postagens.ativo),
      antecedenciaMin: (ANTECEDENCIAS_POSTAGEM as readonly number[]).includes(antecedencia) ? antecedencia : p.postagens.antecedenciaMin,
    },
    prazos: { ativo: bool(r.prazos?.ativo, p.prazos.ativo), hora: hora(r.prazos?.hora, p.prazos.hora) },
    rotinas: { ativo: bool(r.rotinas?.ativo, p.rotinas.ativo) },
    revisaoSemanal: { ativo: bool(r.revisaoSemanal?.ativo, p.revisaoSemanal.ativo) },
    naoPerturbe: {
      ativo: bool(r.naoPerturbe?.ativo, p.naoPerturbe.ativo),
      de: hora(r.naoPerturbe?.de, p.naoPerturbe.de),
      ate: hora(r.naoPerturbe?.ate, p.naoPerturbe.ate),
    },
  };
}

function migrate(raw: unknown): LembretesFile {
  const r = (raw ?? {}) as Partial<LembretesFile>;
  const avisados: Record<string, string> = {};
  if (r.avisados && typeof r.avisados === 'object') {
    Object.entries(r.avisados).forEach(([k, v]) => {
      if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) avisados[k] = v;
    });
  }
  return { schemaVersion: SCHEMA_VERSION, config: migrarConfig(r.config), avisados };
}

function criarPadrao(): LembretesFile {
  return { schemaVersion: SCHEMA_VERSION, config: configLembretesPadrao(), avisados: {} };
}

function loadFile(): LembretesFile {
  return readStore(FILE_NAME, criarPadrao, migrate);
}

export async function getFullFile(): Promise<LembretesFile> {
  return loadFile();
}

export async function replaceFile(raw: unknown): Promise<LembretesFile> {
  const file = migrate(raw);
  await writeStore(FILE_NAME, file);
  return file;
}

export function getEstado(): EstadoLembretes {
  return { config: loadFile().config, suportado: notificacaoDisponivel() };
}

export async function salvarConfig(config: unknown): Promise<EstadoLembretes> {
  const file = loadFile();
  file.config = migrarConfig(config);
  await writeStore(FILE_NAME, file);
  return getEstado();
}

export function testar(): void {
  if (!notificacaoDisponivel()) throw new Error('Este sistema não está mostrando notificações.');
  notificar('Iris · lembrete de teste', 'É assim que os lembretes vão aparecer.', () => abrir({ tela: 'hoje' }));
}

function abrir(a: AberturaLembrete): void {
  broadcast('lembretes:abrir', a);
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** A janela de silêncio pode virar a meia-noite (22:00 → 07:00). */
function emSilencio(c: ConfigLembretes, agoraMin: number): boolean {
  if (!c.naoPerturbe.ativo) return false;
  const de = minutos(c.naoPerturbe.de);
  const ate = minutos(c.naoPerturbe.ate);
  if (de === ate) return false;
  return de < ate ? agoraMin >= de && agoraMin < ate : agoraMin >= de || agoraMin < ate;
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export async function verificar(): Promise<void> {
  // A dica da bandeja ("3 para hoje") acompanha o mesmo ritmo dos lembretes.
  atualizarBandeja();
  const file = loadFile();
  const c = file.config;
  if (!c.ativo || !notificacaoDisponivel()) return;
  const agora = new Date();
  const agoraMin = agora.getHours() * 60 + agora.getMinutes();
  if (emSilencio(c, agoraMin)) return;

  const dia = await hojeService.getDia();
  let mudou = false;
  const avisar = (chave: string, fazer: () => void): void => {
    if (file.avisados[chave]) return;
    file.avisados[chave] = agora.toISOString();
    mudou = true;
    fazer();
  };

  if (c.postagens.ativo) {
    dia.doDia
      .filter((i) => i.tipo === 'postagem' && i.hora)
      .forEach((i) => {
        const alvo = minutos(i.hora!);
        if (agoraMin < alvo - c.postagens.antecedenciaMin || agoraMin > alvo + TOLERANCIA_POSTAGEM_MIN) return;
        avisar(`postagem:${i.id}:${i.data}:${i.hora}`, () =>
          notificar(`Postagem às ${i.hora}: ${i.titulo}`, i.detalhe, () => abrir({ alvo: i.alvo })),
        );
      });
  }

  if (c.rotinas.ativo) {
    dia.doDia
      .filter((i) => i.tipo === 'rotina' && i.hora)
      .forEach((i) => {
        const alvo = minutos(i.hora!);
        if (agoraMin < alvo || agoraMin > alvo + TOLERANCIA_ROTINA_MIN) return;
        avisar(`rotina:${i.id}:${i.data}`, () => notificar(`Rotina das ${i.hora}: ${i.titulo}`, 'Marque como feita na Home.', () => abrir({ tela: 'hoje' })));
      });
  }

  const horaDoResumo = minutos(c.prazos.hora);
  if (c.prazos.ativo && agoraMin >= horaDoResumo) {
    const prazos = dia.doDia.filter((i) => i.tipo === 'card' || i.tipo === 'checklist').length;
    const atrasados = dia.atrasados.length;
    // Marca o dia mesmo sem nada: não fica conferindo de novo a cada minuto.
    avisar(`prazos:${dia.hoje}`, () => {
      if (!prazos && !atrasados) return;
      const titulo = prazos ? `Hoje: ${plural(prazos, 'prazo', 'prazos')}` : `${plural(atrasados, 'item atrasado', 'itens atrasados')}`;
      const corpo = [prazos && atrasados ? plural(atrasados, 'atrasado', 'atrasados') : '', 'Abra a Home para ver.'].filter(Boolean).join(' · ');
      notificar(titulo, corpo, () => abrir({ tela: 'hoje' }));
    });
  }

  if (c.revisaoSemanal.ativo && agora.getDay() === 1 && agoraMin >= horaDoResumo) {
    avisar(`revisao:${dia.hoje}`, () => notificar('A revisão da semana está pronta', 'O que foi concluído, o que atrasou e o que foi publicado.', () => abrir({ tela: 'semana' })));
  }

  const limite = agora.getTime() - GUARDAR_AVISOS_DIAS * 86_400_000;
  Object.entries(file.avisados).forEach(([k, v]) => {
    if (Date.parse(v) < limite) {
      delete file.avisados[k];
      mudou = true;
    }
  });
  if (mudou) await writeStore(FILE_NAME, file);
}

export function iniciarLembretes(): void {
  registerTask(TAREFA_LEMBRETES, 60_000, () => verificar());
  // Depois da primeira tela e das outras tarefas de abertura.
  startTask(TAREFA_LEMBRETES, 20_000);
}
