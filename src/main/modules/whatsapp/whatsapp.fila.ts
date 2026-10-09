import { randomUUID } from 'node:crypto';
import { startTask, stopTask } from '../../core/scheduler';
import { acharContato, nomeDoContato, type EmpresaCrm, type Pessoa } from '../../../shared/types/contatos.types';
import { camposFaltando, corpoDoTemplate, ehCampoAutomaticoWa, textoFinalWa, valoresWa } from '../../../shared/types/whatsapp.campos';
import { camposDoTexto } from '../../../shared/types/contratos.campos';
import { mesmoNumeroWa, numeroDoContato } from '../../../shared/types/whatsapp.numero';
import { descritorProvedor, isProvedorWa, type CriarLoteInput, type DestinoLote, type LoteWa, type ProvedorWa, type WhatsappFile } from '../../../shared/types/whatsapp.types';
import { isRef, loadFile as loadContatos } from '../contatos/contatos.arquivo';
import { loadFile, nowIso, saveFile, textoExato } from './whatsapp.arquivo';
import { contextoDeCampos, enviadosHoje, enviarAgora } from './whatsapp.envio';
import { avisarMudanca, faltaNo } from './whatsapp.service';

/**
 * Envio para vários: um destino por vez, com intervalo sorteado entre o
 * mínimo e o máximo, dentro da janela de horário e do limite diário. O
 * estado inteiro fica no arquivo — fechar o app no meio e abrir de novo
 * continua de onde parou.
 *
 * A tarefa só roda enquanto há lote enviando (ler whatsapp.json a cada 15 s
 * à toa pesaria com milhares de mensagens).
 */

export const TAREFA_FILA = 'whatsapp:fila';

function sorteio(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 1000);
}

function horaLocal(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dentroDoHorario(file: WhatsappFile, agora = new Date()): boolean {
  const h = horaLocal(agora);
  return h >= file.config.envio.horarioDe && h < file.config.envio.horarioAte;
}

export function aplicarFila(atrasoMs = 2_000): void {
  try {
    if (loadFile().lotes.some((l) => l.situacao === 'rodando')) startTask(TAREFA_FILA, atrasoMs);
    else stopTask(TAREFA_FILA);
  } catch (erro) {
    console.error('[whatsapp] fila', erro);
  }
}

// ---------- Criar e controlar ----------

function destinoDe(c: Pessoa | EmpresaCrm, ref: DestinoLote['contato'], vistos: string[]): DestinoLote {
  const numero = numeroDoContato(c) ?? '';
  const base = { contato: ref, nome: nomeDoContato(c), numero };
  if (!numero) return { ...base, situacao: 'pulado', motivo: 'Sem celular ou WhatsApp no cadastro' };
  if (c.naoEnviarWhatsapp) return { ...base, situacao: 'pulado', motivo: 'Pediu para não receber mensagens' };
  if (vistos.some((n) => mesmoNumeroWa(n, numero))) return { ...base, situacao: 'pulado', motivo: 'Mesmo número de outro contato deste envio' };
  vistos.push(numero);
  return { ...base, situacao: 'pendente' };
}

export async function criarLote(input: CriarLoteInput): Promise<WhatsappFile> {
  const file = loadFile();
  const provedor: ProvedorWa = isProvedorWa(input?.provedor) ? input.provedor : file.config.provedor;
  if (!descritorProvedor(provedor).lote) throw new Error('"Abrir no WhatsApp" não envia para vários (abriria uma janela por contato). Escolha a API oficial, a Evolution, o WAHA ou o n8n.');
  const falta = faltaNo(provedor, file);
  if (falta) throw new Error(`${descritorProvedor(provedor).rotulo}: ${falta}`);
  const modelo = typeof input?.modeloId === 'string' ? file.modelos.find((m) => m.id === input.modeloId) : undefined;
  if (provedor === 'meta' && !modelo?.metaTemplate) {
    throw new Error('Pela API oficial, um envio para vários precisa de um modelo ligado a um template aprovado da Meta (a maioria dos contatos está fora da janela de 24 h).');
  }
  const texto = textoExato(input?.texto);
  if (!texto.trim() && !modelo?.metaTemplate) throw new Error('Escreva a mensagem.');

  const contatos = loadContatos();
  const refs = Array.isArray(input?.contatos) ? input.contatos.filter(isRef) : [];
  if (!refs.length) throw new Error('Escolha pelo menos um contato.');
  // Campo que não vem do cadastro não tem como ser preenchido para cada um: recusa já.
  const exemplo = refs.map((r) => acharContato(contatos, r)).find(Boolean);
  if (exemplo) {
    const auto = valoresWa(contextoDeCampos(contatos, exemplo));
    const corpos = modelo?.metaTemplate ? modelo.metaTemplate.variaveis : [texto];
    const manuais = [...new Set(corpos.flatMap(camposDoTexto))].filter((c) => !ehCampoAutomaticoWa(c, auto));
    if (manuais.length) throw new Error(`Envio para vários só usa campos do cadastro. Tire ${manuais.map((c) => `{${c}}`).join(', ')} ou envie um por um.`);
  }

  const vistos: string[] = [];
  const destinos = refs
    .map((ref) => {
      const c = acharContato(contatos, ref);
      return c ? destinoDe(c, { tipo: ref.tipo, id: ref.id }, vistos) : null;
    })
    .filter((d): d is DestinoLote => d !== null);
  const agora = nowIso();
  const lote: LoteWa = {
    id: randomUUID(),
    nome: typeof input?.nome === 'string' && input.nome.trim() ? input.nome.trim().slice(0, 120) : `Envio de ${new Date().toLocaleDateString('pt-BR')}`,
    texto,
    ...(modelo ? { modelo: { id: modelo.id, nome: modelo.nome } } : {}),
    ...(provedor === 'meta' && modelo?.metaTemplate ? { metaTemplate: modelo.metaTemplate } : {}),
    provedor,
    destinos,
    situacao: destinos.some((d) => d.situacao === 'pendente') ? 'rodando' : 'concluido',
    criadoEm: agora,
    atualizadoEm: agora,
    proximoEnvioEm: Date.now(),
  };
  file.lotes.push(lote);
  await saveFile(file);
  avisarMudanca(file);
  aplicarFila(500);
  return file;
}

export async function mudarLote(id: unknown, acao: unknown): Promise<WhatsappFile> {
  const file = loadFile();
  const lote = file.lotes.find((l) => l.id === id);
  if (!lote) throw new Error('Esse envio não existe mais.');
  if (acao === 'excluir') {
    if (lote.situacao === 'rodando') throw new Error('Pause ou cancele o envio antes de tirar da lista.');
    file.lotes = file.lotes.filter((l) => l.id !== lote.id);
  } else if (acao === 'pausar' && lote.situacao === 'rodando') lote.situacao = 'pausado';
  else if (acao === 'retomar' && lote.situacao === 'pausado') {
    const falta = faltaNo(lote.provedor, file);
    if (falta) throw new Error(falta);
    lote.situacao = 'rodando';
    lote.proximoEnvioEm = Date.now();
  } else if (acao === 'cancelar' && (lote.situacao === 'rodando' || lote.situacao === 'pausado')) {
    lote.situacao = 'cancelado';
    lote.destinos.forEach((d) => {
      if (d.situacao === 'pendente') {
        d.situacao = 'pulado';
        d.motivo = 'Envio cancelado';
      }
    });
  } else throw new Error('Essa ação não vale para este envio agora.');
  lote.atualizadoEm = nowIso();
  await saveFile(file);
  avisarMudanca(file);
  aplicarFila(500);
  return file;
}

// ---------- A rodada ----------

/** Um envio por rodada; sem lote enviando, a tarefa para sozinha. */
export async function processarFila(signal: AbortSignal): Promise<void> {
  const file = loadFile();
  const rodando = file.lotes.filter((l) => l.situacao === 'rodando');
  if (!rodando.length) {
    stopTask(TAREFA_FILA);
    return;
  }
  if (signal.aborted || !dentroDoHorario(file) || enviadosHoje(file) >= file.config.envio.limiteDiario) return;
  const lote = rodando.find((l) => (l.proximoEnvioEm ?? 0) <= Date.now());
  if (!lote) return;
  const destino = lote.destinos.find((d) => d.situacao === 'pendente');
  if (!destino) {
    lote.situacao = 'concluido';
    lote.atualizadoEm = nowIso();
    await saveFile(file);
    avisarMudanca(file);
    return;
  }

  const falta = faltaNo(lote.provedor, file);
  if (falta) {
    // Credencial removida, servidor mudou: pausa com o motivo em vez de falhar destino por destino.
    lote.situacao = 'pausado';
    destino.motivo = `Pausado: ${falta}`;
    await saveFile(file);
    avisarMudanca(file);
    return;
  }

  const contatos = loadContatos();
  const c = acharContato(contatos, destino.contato);
  let texto = '';
  let parametros: string[] | undefined;
  let motivo = '';
  if (!c) motivo = 'O contato foi excluído';
  else if (c.naoEnviarWhatsapp) motivo = 'Pediu para não receber mensagens';
  else {
    const ctx = contextoDeCampos(contatos, c);
    if (lote.metaTemplate) {
      const r = corpoDoTemplate(lote.metaTemplate, ctx);
      texto = r.texto;
      parametros = r.parametros;
      if (r.parametros.some((p) => !p.trim() || camposFaltando(p).length)) motivo = 'Um campo do modelo ficou vazio no cadastro';
    } else {
      texto = textoFinalWa(lote.texto, ctx);
      const faltando = camposFaltando(texto);
      if (faltando.length) motivo = `Sem ${faltando.map((x) => `{${x}}`).join(', ')} no cadastro`;
    }
  }
  const mensagemId = randomUUID();
  if (motivo) {
    destino.situacao = 'pulado';
    destino.motivo = motivo;
  } else {
    // Marcado antes de enviar: se o app fechar no meio, este destino não sai duas vezes.
    destino.situacao = 'enviado';
    destino.mensagemId = mensagemId;
  }
  lote.proximoEnvioEm = Date.now() + (motivo ? 1000 : sorteio(file.config.envio.intervaloMinSeg, file.config.envio.intervaloMaxSeg));
  lote.atualizadoEm = nowIso();
  await saveFile(file);
  if (motivo || !c) {
    avisarMudanca(file);
    return;
  }

  const r = await enviarAgora({
    id: mensagemId,
    contato: destino.contato,
    numero: destino.numero,
    texto,
    provedor: lote.provedor,
    loteId: lote.id,
    ...(lote.modelo ? { modelo: { ...lote.modelo, ...(lote.metaTemplate ? { template: lote.metaTemplate.nome } : {}) } } : {}),
    ...(lote.metaTemplate && parametros ? { template: { meta: lote.metaTemplate, parametros } } : {}),
  });
  if (!r.ok) {
    const depois = loadFile();
    const d = depois.lotes.find((l) => l.id === lote.id)?.destinos.find((x) => x.mensagemId === mensagemId);
    if (d) {
      d.situacao = 'falhou';
      d.motivo = r.erro ?? 'Não saiu';
      await saveFile(depois);
      avisarMudanca(depois);
    }
  }
}
