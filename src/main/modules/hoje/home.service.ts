import { readStore, writeStore } from '../../storage/jsonStore';
import * as kanbanService from '../kanban/kanban.service';
import * as todoService from '../todo/todo.service';
import * as quadroService from '../quadro/quadro.service';
import * as videosService from '../videos/videos.service';
import * as imagensService from '../imagens/imagens.service';
import * as contatosService from '../contatos/contatos.service';
import * as whatsappService from '../whatsapp/whatsapp.service';
import * as ideiasService from '../ideias/ideias.service';
import * as pensamentosService from '../pensamentos/pensamentos.service';
import * as roteirosService from '../roteiros/roteiros.service';
import * as iaService from '../ia/ia.service';
import * as ajustesService from '../ajustes/ajustes.service';
import { gerarTexto } from '../ia/ia.tarefas';
import { getDia, getSemana } from './hoje.service';
import { hojeLocal } from '../../../shared/types/brasil';
import { diaLocal, segundaDaSemana } from '../../../shared/types/revisao.types';
import { naoLidas } from '../../../shared/types/whatsapp.types';
import { PROVEDORES } from '../../../shared/types/ia.types';
import type { RefContato } from '../../../shared/types/contatos.types';
import type { ItemDia } from '../../../shared/types/hoje.types';
import { SEMANAS_ATIVIDADE, type AlvoHome, type PulsoHome, type SugestaoHome, type SugestaoItem } from '../../../shared/types/home.types';

/**
 * O resto da Home: o pulso dos módulos e a sugestão do dia.
 *
 * O pulso não é guardado — como o dia (hoje.service), é lido na hora. A
 * sugestão é guardada em home.json com o dia em que foi feita: abrir a Home
 * várias vezes no mesmo dia não pede à IA de novo (custa dinheiro na conta
 * do usuário). Fora do backup de propósito: é derivada, se perder, gera outra.
 */

const FILE_NAME = 'home.json';
/** v2: a manchete virou mensagem para o dia; a sugestão guardada na v1 é descartada (gera de novo). */
const SCHEMA_VERSION = 2;
/** As ações viraram coadjuvantes da mensagem: no máximo duas, como "Comece por". */
const MAX_SUGESTOES = 2;

interface SugestaoGuardada {
  dia: string;
  geradoEm: string;
  quem: string;
  mensagem: string;
  sugestoes: SugestaoItem[];
  erro?: string;
}

interface HomeFile {
  schemaVersion: number;
  sugestao?: SugestaoGuardada;
}

function padrao(): HomeFile {
  return { schemaVersion: SCHEMA_VERSION };
}

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function migrarAlvo(raw: unknown): AlvoHome | undefined {
  const a = (raw ?? {}) as { tipo?: unknown; ref?: { tipo?: unknown; id?: unknown }; alvo?: unknown };
  if (a.tipo === 'ideias') return { tipo: 'ideias' };
  if (a.tipo === 'lead' && a.ref && (a.ref.tipo === 'pessoa' || a.ref.tipo === 'empresa') && typeof a.ref.id === 'string') return { tipo: 'lead', ref: { tipo: a.ref.tipo, id: a.ref.id } };
  // O alvo da busca é montado aqui mesmo (alvoDaChave); só se confere a forma mínima.
  if (a.tipo === 'busca' && a.alvo && typeof a.alvo === 'object' && typeof (a.alvo as { modulo?: unknown }).modulo === 'string') return { tipo: 'busca', alvo: a.alvo as never };
  return undefined;
}

function migrate(raw: unknown): HomeFile {
  const r = (raw ?? {}) as { schemaVersion?: unknown; sugestao?: Partial<SugestaoGuardada> };
  const s = r.sugestao;
  if (!s || typeof s.dia !== 'string' || r.schemaVersion !== SCHEMA_VERSION) return padrao();
  return {
    schemaVersion: SCHEMA_VERSION,
    sugestao: {
      dia: s.dia,
      geradoEm: texto(s.geradoEm, 40),
      quem: texto(s.quem, 120),
      mensagem: texto(s.mensagem, 600),
      sugestoes: (Array.isArray(s.sugestoes) ? s.sugestoes : [])
        .map((x) => ({ titulo: texto(x?.titulo, 120), porque: texto(x?.porque, 300), alvo: migrarAlvo(x?.alvo) }))
        .filter((x) => x.titulo)
        .slice(0, MAX_SUGESTOES),
      ...(s.erro ? { erro: texto(s.erro, 400) } : {}),
    },
  };
}

function loadFile(): HomeFile {
  return readStore(FILE_NAME, padrao, migrate);
}

// ---------- Datas ----------

function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number];
  const data = new Date(a, m - 1, d);
  data.setDate(data.getDate() + n);
  return hojeLocal(data);
}

/** O começo "AAAA-MM-DD" de um campo que pode ser data local ou instante ISO. */
function diaDe(valor: string | undefined): string {
  if (!valor) return '';
  // Instante com fuso (Z ou ±hh:mm) vira o dia local; data ou "AAAA-MM-DDTHH:mm" local fica como está.
  return /[zZ]$|[+-]\d{2}:\d{2}$/.test(valor) ? diaLocal(valor) : valor.slice(0, 10);
}

/** Sorteio estável: o mesmo dia (e a mesma semente) escolhe o mesmo item. */
function sortear<T>(lista: T[], chave: string): T | undefined {
  if (!lista.length) return undefined;
  let h = 2166136261;
  for (let i = 0; i < chave.length; i++) h = Math.imul(h ^ chave.charCodeAt(i), 16777619);
  return lista[(h >>> 0) % lista.length];
}

// ---------- Pulso ----------

export async function getPulso(semente?: unknown): Promise<PulsoHome> {
  const hoje = hojeLocal();
  const s = typeof semente === 'number' && Number.isFinite(semente) ? Math.floor(semente) : 0;
  const [board, todo, quadro, videos, imagens, contatos, whatsapp, ideias, pensamentos, roteiros] = await Promise.all([
    kanbanService.getBoard(),
    todoService.getFile(),
    quadroService.getState(),
    videosService.getFile(),
    imagensService.getFile(),
    contatosService.getFile(),
    whatsappService.getFile(),
    ideiasService.getFile(),
    pensamentosService.getPensamentos(),
    roteirosService.getFile(),
  ]);

  // Constância: tudo o que foi feito, por dia.
  const inicio = somarDias(segundaDaSemana(hoje), -7 * (SEMANAS_ATIVIDADE - 1));
  const contagem = new Map<string, number>();
  const somar = (dia: string): void => {
    if (dia && dia >= inicio && dia <= hoje) contagem.set(dia, (contagem.get(dia) ?? 0) + 1);
  };
  [...videos.videos, ...imagens.imagens].filter((p) => p.status === 'publicado').forEach((p) => somar(diaDe(p.dataAgendada) || diaDe(p.publicadoEm)));
  board.cards.forEach((c) => somar(diaDe(c.concluidoEm)));
  todo.checklists.forEach((l) => l.itens.forEach((i) => i.feito && somar(diaDe(i.feitoEm))));
  quadro.blocks.forEach((b) => (b.feitasEm ?? []).forEach((d) => somar(d)));
  const atividade: PulsoHome['atividade'] = [];
  for (let d = inicio; d <= hoje; d = somarDias(d, 1)) atividade.push({ dia: d, n: contagem.get(d) ?? 0 });
  let sequencia = 0;
  for (let d = (contagem.get(hoje) ? hoje : somarDias(hoje, -1)); contagem.get(d); d = somarDias(d, -1)) sequencia++;

  const focoHoje = [...board.cards.map((c) => c.tempo ?? []), ...todo.checklists.map((l) => l.tempo ?? [])]
    .flat()
    .filter((t) => diaDe(t.fim) === hoje)
    .reduce((n, t) => n + t.minutos, 0);

  // Caixa de entrada.
  const novos = contatos.pessoas.filter((p) => p.entrada && !p.entrada.visto && !p.arquivado).sort((a, b) => b.entrada!.recebidoEm.localeCompare(a.entrada!.recebidoEm));
  const nomeEmpresa = (e: { nomeFantasia: string; razaoSocial: string }): string => e.nomeFantasia || e.razaoSocial || 'Empresa';
  const contatar = [
    ...contatos.pessoas.map((p) => ({ c: p, ref: { tipo: 'pessoa', id: p.id } as RefContato, nome: p.nome || 'Sem nome' })),
    ...contatos.empresas.map((e) => ({ c: e, ref: { tipo: 'empresa', id: e.id } as RefContato, nome: nomeEmpresa(e) })),
  ]
    .filter(({ c }) => !c.arquivado && c.proximoContato && c.proximoContato.data <= hoje)
    .sort((a, b) => a.c.proximoContato!.data.localeCompare(b.c.proximoContato!.data));

  const pendentes = ideias.ideias.filter((i) => !i.arquivada && !i.virouPostagem);
  const ideia = sortear(pendentes, `ideia:${hoje}:${s}`);
  const limite = somarDias(hoje, -7);
  const antigos = pensamentos.pensamentos.filter((p) => p.texto.trim() && diaDe(p.createdAt) <= limite);
  const lembranca = sortear(antigos, `lembranca:${hoje}`);
  const abertos = roteiros.roteiros
    .filter((r) => r.status === 'rascunho' || r.status === 'revisao')
    .sort((a, b) => (a.status === b.status ? b.updatedAt.localeCompare(a.updatedAt) : a.status === 'revisao' ? -1 : 1));

  return {
    hoje,
    atividade,
    sequencia,
    focoHoje,
    leads: novos.slice(0, 3).map((p) => ({ ref: { tipo: 'pessoa', id: p.id }, nome: p.nome || 'Sem nome', faixa: p.entrada!.faixa, recebidoEm: p.entrada!.recebidoEm, interesse: p.entrada!.interesse })),
    leadsNaoVistos: novos.length,
    contatar: contatar.slice(0, 4).map((x) => ({ ref: x.ref, nome: x.nome, data: x.c.proximoContato!.data, nota: x.c.proximoContato!.nota })),
    whatsappNaoLidas: naoLidas(whatsapp),
    ideiasPendentes: pendentes.length,
    ...(ideia ? { ideia: { id: ideia.id, titulo: ideia.titulo, notas: ideia.notas, criadaEm: ideia.criadaEm } } : {}),
    ...(lembranca ? { lembranca: { id: lembranca.id, texto: lembranca.texto.slice(0, 600), criadoEm: lembranca.createdAt, cor: lembranca.cor } } : {}),
    roteiros: abertos.slice(0, 3).map((r) => ({ id: r.id, titulo: r.titulo || 'Sem título', status: r.status as 'rascunho' | 'revisao', atualizadoEm: r.updatedAt })),
    roteirosEmRevisao: abertos.filter((r) => r.status === 'revisao').length,
    roteirosRascunho: abertos.filter((r) => r.status === 'rascunho').length,
  };
}

// ---------- Sugestão do dia ----------

function iaPronta(): string | null {
  try {
    const p = iaService.resolver('texto');
    return `${p.rotulo} · ${p.modelo}`;
  } catch {
    return null;
  }
}

function paraTela(g: SugestaoGuardada | undefined, hoje: string): SugestaoHome {
  if (g && g.dia === hoje) {
    if (g.erro) return { estado: 'erro', dia: hoje, erro: g.erro };
    return { estado: 'pronta', dia: hoje, mensagem: g.mensagem, sugestoes: g.sugestoes, geradoEm: g.geradoEm, quem: g.quem };
  }
  return { estado: iaPronta() ? 'nova' : 'sem-ia', dia: hoje };
}

export async function getSugestao(): Promise<SugestaoHome> {
  return paraTela(loadFile().sugestao, hojeLocal());
}

function alvoDoItem(i: ItemDia): AlvoHome {
  return { tipo: 'busca', alvo: i.alvo };
}

/**
 * O retrato do dia que vai para a IA, em linhas curtas. Cada item que pode
 * virar sugestão leva uma chave entre colchetes: a IA devolve a chave e a tela
 * vira link — sem a IA nunca ver um id que não estava no material.
 */
async function montarMaterial(): Promise<{ material: string; alvos: Map<string, AlvoHome> }> {
  const [dia, pulso, semana, contatos, ideias] = await Promise.all([getDia(), getPulso(), getSemana(), contatosService.getFile(), ideiasService.getFile()]);
  const alvos = new Map<string, AlvoHome>();
  const agora = new Date();
  const linhas: string[] = [];
  const dataTexto = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hora = agora.getHours();
  const periodo = hora >= 5 && hora < 12 ? 'manhã' : hora < 18 && hora >= 12 ? 'tarde' : 'noite';
  const { apelido } = await ajustesService.getAjustes();
  linhas.push(`Hoje é ${dataTexto}; agora são ${String(hora).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')} (${periodo}).`);
  linhas.push(apelido ? `A pessoa gosta de ser chamada de: ${apelido}.` : 'A pessoa não informou como gosta de ser chamada (não use nome).');

  const item = (i: ItemDia, comData = false): string => {
    alvos.set(i.chave, alvoDoItem(i));
    return `- [${i.chave}] ${comData ? `${i.data} ` : ''}${i.hora ? `${i.hora} · ` : ''}${i.titulo} · ${i.detalhe}${i.prioridade === 'alta' ? ' · prioridade alta' : ''}`;
  };
  linhas.push('', `Agenda de hoje, ainda por fazer (${dia.doDia.length}):`, ...(dia.doDia.length ? dia.doDia.map((i) => item(i)) : ['- nada']));
  linhas.push('', `Atrasados (${dia.atrasados.length}):`, ...(dia.atrasados.length ? dia.atrasados.slice(0, 10).map((i) => item(i, true)) : ['- nenhum']));
  linhas.push('', `Já feito hoje: ${dia.feitos.length} ${dia.feitos.length === 1 ? 'item' : 'itens'}.`);
  const proximos = dia.proximos.flatMap((p) => p.itens).slice(0, 15);
  linhas.push('', 'Próximos dias:', ...(proximos.length ? proximos.map((i) => item(i, true)) : ['- nada marcado']));

  const novos = contatos.pessoas.filter((p) => p.entrada && !p.entrada.visto && !p.arquivado).slice(0, 6);
  if (novos.length) {
    linhas.push('', `Leads novos ainda não vistos (${pulso.leadsNaoVistos}):`);
    novos.forEach((p) => {
      const chave = `lead:${p.id}`;
      alvos.set(chave, { tipo: 'lead', ref: { tipo: 'pessoa', id: p.id } });
      linhas.push(`- [${chave}] ${p.nome || 'Sem nome'} · ${p.entrada!.faixa} · chegou ${p.entrada!.recebidoEm.replace('T', ' ')}${p.entrada!.interesse ? ` · interesse: ${p.entrada!.interesse}` : ''}`);
    });
  }
  if (pulso.contatar.length) {
    linhas.push('', 'Contatos com retorno marcado para hoje ou atrasado:');
    pulso.contatar.forEach((c) => {
      const chave = `contato:${c.ref.tipo}:${c.ref.id}`;
      alvos.set(chave, { tipo: 'busca', alvo: { modulo: 'contatos', ref: c.ref } });
      linhas.push(`- [${chave}] ${c.nome} · desde ${c.data}${c.nota ? ` · ${c.nota}` : ''}`);
    });
  }
  if (pulso.whatsappNaoLidas) linhas.push('', `Mensagens de WhatsApp não lidas: ${pulso.whatsappNaoLidas}.`);

  const pendentes = ideias.ideias.filter((i) => !i.arquivada && !i.virouPostagem).sort((a, b) => a.criadaEm.localeCompare(b.criadaEm)).slice(0, 8);
  if (pendentes.length) {
    alvos.set('ideias', { tipo: 'ideias' });
    linhas.push('', `Banco de ideias, pendentes (${pulso.ideiasPendentes}; chave [ideias] para todas):`, ...pendentes.map((i) => `- ${i.titulo} · guardada em ${diaDe(i.criadaEm)}`));
  }
  if (pulso.roteiros.length) {
    linhas.push('', 'Roteiros em aberto:');
    pulso.roteiros.forEach((r) => {
      const chave = `roteiro:${r.id}`;
      alvos.set(chave, { tipo: 'busca', alvo: { modulo: 'roteiros', id: r.id } });
      linhas.push(`- [${chave}] ${r.titulo} · ${r.status === 'revisao' ? 'em revisão' : 'rascunho'} · mexido em ${diaDe(r.atualizadoEm)}`);
    });
  }

  const agendadasRestantes = semana.ritmo.filter((d) => d.dia >= dia.hoje).reduce((n, d) => n + d.agendadas, 0);
  linhas.push(
    '',
    `Esta semana (segunda a domingo): ${semana.publicados.length} publicadas, ${agendadasRestantes} ainda agendadas, ${semana.concluidos.length} cards/checklists concluídos, ${semana.atrasaram.length} prazos que atrasaram.`,
    `Dias seguidos com alguma coisa feita: ${pulso.sequencia}. Foco do Pomodoro hoje: ${pulso.focoHoje} min.`,
  );
  return { material: linhas.join('\n'), alvos };
}

let gerando: Promise<SugestaoHome> | null = null;

/** Pede a sugestão à IA e guarda. Duas telas pedindo juntas recebem o mesmo pedido. */
export function gerarSugestao(): Promise<SugestaoHome> {
  gerando ??= (async () => {
    const hoje = hojeLocal();
    const quem = iaPronta();
    if (!quem) return { estado: 'sem-ia' as const, dia: hoje };
    let guardada: SugestaoGuardada;
    try {
      const { material, alvos } = await montarMaterial();
      const resposta = await gerarTexto({ tarefa: 'home-sugestao', contexto: { area: 'Home do Iris', referencia: material } });
      const json = (resposta.json ?? {}) as { mensagem?: unknown; sugestoes?: unknown };
      const sugestoes = (Array.isArray(json.sugestoes) ? json.sugestoes : [])
        .map((x: { titulo?: unknown; porque?: unknown; chave?: unknown }) => {
          const chave = texto(x?.chave, 120).replace(/^\[|\]$/g, '');
          const alvo = alvos.get(chave);
          return { titulo: texto(x?.titulo, 120), porque: texto(x?.porque, 300), ...(alvo ? { alvo } : {}) };
        })
        .filter((x) => x.titulo)
        .slice(0, MAX_SUGESTOES);
      if (!texto(json.mensagem, 600)) throw new Error('A IA respondeu fora do formato esperado. Tente de novo ou troque o modelo em Ajustes › Inteligência artificial.');
      const rotulo = PROVEDORES.find((p) => p.id === resposta.provedor)?.rotulo ?? resposta.provedor;
      guardada = { dia: hoje, geradoEm: new Date().toISOString(), quem: `${rotulo} · ${resposta.modelo}`, mensagem: texto(json.mensagem, 600), sugestoes };
    } catch (e) {
      // O erro também fica guardado com o dia: a Home não tenta sozinha de novo a cada abertura.
      guardada = { dia: hoje, geradoEm: new Date().toISOString(), quem, mensagem: '', sugestoes: [], erro: e instanceof Error ? e.message : String(e) };
    }
    await writeStore(FILE_NAME, { schemaVersion: SCHEMA_VERSION, sugestao: guardada } satisfies HomeFile);
    return paraTela(guardada, hoje);
  })().finally(() => {
    gerando = null;
  });
  return gerando;
}
