import { randomBytes, randomUUID } from 'node:crypto';
import { clipboard } from 'electron';
import { broadcast } from '../../core/broadcast';
import * as secretStore from '../../storage/secretStore';
import { isRef, loadFile as loadContatos } from '../contatos/contatos.arquivo';
import { estadoServidor } from '../contatos/contatos.servidor';
import * as n8nService from '../n8n/n8n.service';
import type { RefContato } from '../../../shared/types/contatos.types';
import { soDigitos } from '../../../shared/types/brasil';
import { isOrigemEventoWa, type OrigemEventoWa } from '../../../shared/types/whatsapp.eventos';
import { cenarioPeloEndereco, type CenarioN8n, type FluxoN8n } from '../../../shared/types/leads.n8n';
import { baseIrisParaN8n, fluxoWa, isTipoFluxoWa, type TipoFluxoWa } from '../../../shared/types/whatsapp.n8n';
import { mesmoNumeroWa } from '../../../shared/types/whatsapp.numero';
import {
  PROVEDORES_WHATSAPP,
  SEGREDOS_WA,
  isProvedorWa,
  naoLidas,
  type ConferenciaNumero,
  type EnderecoWa,
  type ProvedorWa,
  type ResultadoTeste,
  type SalvarConfigWaInput,
  type SalvarModeloWaInput,
  type SegredoWa,
  type SituacaoProvedor,
  type StatusWhatsapp,
  type TemplateMeta,
  type ViaWebhookWa,
  type WhatsappFile,
} from '../../../shared/types/whatsapp.types';
import { loadFile, migrate, migrateConfig, migrateModelo, normalizarBaseUrl, nowIso, saveFile } from './whatsapp.arquivo';
import { ADAPTADORES, appDoWhatsapp } from './provedores';
import { aplicarTls, type ContextoWa } from './provedores/comum';

/**
 * Configuração, chaves, modelos e o que a tela precisa saber da conexão.
 * Envio em whatsapp.envio.ts; recebimento em whatsapp.receber.ts.
 */

const PREFIXO = 'whatsapp.';
/** A chave que vai no caminho dos endereços de recebimento e no cabeçalho do fluxo do n8n. */
export const SEGREDO_WEBHOOK = 'whatsapp.webhook.chave';

export function nomeDoSegredo(qual: SegredoWa): string {
  return PREFIXO + qual;
}

/** A credencial que cada caminho usa. */
export function chaveDo(provedor: ProvedorWa): string {
  if (provedor === 'meta') return secretStore.getSecret(nomeDoSegredo('meta.token')) ?? '';
  if (provedor === 'evolution') return secretStore.getSecret(nomeDoSegredo('evolution.apikey')) ?? '';
  if (provedor === 'waha') return secretStore.getSecret(nomeDoSegredo('waha.apikey')) ?? '';
  if (provedor === 'n8n') return secretStore.getSecret(SEGREDO_WEBHOOK) ?? '';
  return '';
}

export function contextoDo(provedor: ProvedorWa, file: WhatsappFile = loadFile(), signal?: AbortSignal): ContextoWa {
  aplicarTls(file.config);
  return { config: file.config, chave: chaveDo(provedor), ...(signal ? { signal } : {}) };
}

/** O motivo de um caminho não estar pronto; undefined = pronto. */
export function faltaNo(provedor: ProvedorWa, file: WhatsappFile = loadFile()): string | undefined {
  return ADAPTADORES[provedor].falta(contextoDo(provedor, file));
}

export function avisarMudanca(file: WhatsappFile, contato?: RefContato): void {
  broadcast('whatsapp:mudou', { naoLidas: naoLidas(file), ...(contato ? { contato } : {}) });
}

// ---------- Arquivo ----------

export async function getFile(): Promise<WhatsappFile> {
  return loadFile();
}

export async function getFullFile(): Promise<WhatsappFile> {
  return loadFile();
}

export async function replaceFile(file: unknown): Promise<WhatsappFile> {
  const migrado = migrate(file);
  await saveFile(migrado);
  avisarMudanca(migrado);
  return migrado;
}

/**
 * Na abertura: mensagem que ficou "enviando" é de um envio que o app não viu
 * terminar (fechou no meio). Pode ter saído ou não — fica como "não saiu",
 * com o motivo, para quem usa conferir antes de reenviar.
 */
export async function recuperarInterrompidas(): Promise<void> {
  const file = loadFile();
  let mudou = false;
  file.mensagens.forEach((m) => {
    if (m.status === 'enviando' || m.status === 'na-fila') {
      m.status = 'falhou';
      m.erro = 'O Iris fechou durante o envio. Confira no WhatsApp se a mensagem saiu antes de reenviar.';
      m.statusEm = nowIso();
      mudou = true;
    }
  });
  if (mudou) await saveFile(file);
}

// ---------- Configuração ----------

export async function salvarConfig(input: SalvarConfigWaInput): Promise<WhatsappFile> {
  const file = loadFile();
  const atual = file.config;
  const evolution = { ...atual.evolution, ...(input?.evolution ?? {}) };
  const waha = { ...atual.waha, ...(input?.waha ?? {}) };
  if (input?.evolution?.baseUrl !== undefined && String(input.evolution.baseUrl).trim() && !normalizarBaseUrl(input.evolution.baseUrl)) {
    throw new Error('O endereço da Evolution precisa começar com http:// ou https://.');
  }
  if (input?.waha?.baseUrl !== undefined && String(input.waha.baseUrl).trim() && !normalizarBaseUrl(input.waha.baseUrl)) {
    throw new Error('O endereço do WAHA precisa começar com http:// ou https://.');
  }
  if (input?.provedor !== undefined && !isProvedorWa(input.provedor)) throw new Error('Caminho de envio desconhecido.');
  file.config = migrateConfig({
    ...atual,
    ...(input?.provedor ? { provedor: input.provedor } : {}),
    meta: { ...atual.meta, ...(input?.meta ?? {}) },
    evolution,
    waha,
    n8n: { ...atual.n8n, ...(input?.n8n ?? {}) },
    link: { ...atual.link, ...(input?.link ?? {}) },
    envio: { ...atual.envio, ...(input?.envio ?? {}) },
    permitirTlsInseguro: input?.permitirTlsInseguro ?? atual.permitirTlsInseguro,
    notificar: input?.notificar ?? atual.notificar,
  });
  await saveFile(file);
  return file;
}

export async function definirSegredo(qual: unknown, valor: unknown): Promise<StatusWhatsapp> {
  if (!SEGREDOS_WA.includes(qual as SegredoWa)) throw new Error('Credencial desconhecida.');
  const v = typeof valor === 'string' ? valor.trim() : '';
  if (v && (v.length < 8 || /\s/.test(v))) throw new Error('Essa credencial parece incompleta: confira se copiou inteira, sem espaços.');
  await secretStore.setSecret(nomeDoSegredo(qual as SegredoWa), v);
  return status();
}

/** Gera a chave dos endereços de recebimento. Trocar invalida os webhooks já configurados. */
export async function gerarChaveWebhook(): Promise<StatusWhatsapp> {
  await secretStore.setSecret(SEGREDO_WEBHOOK, `wa_${randomBytes(24).toString('base64url')}`);
  return status();
}

function garantirChave(): string {
  const chave = secretStore.getSecret(SEGREDO_WEBHOOK);
  if (!chave) throw new Error('Gere a chave do WhatsApp primeiro (Conexão › Recebimento).');
  return chave;
}

/** O Worker precisa da mesma chave na variável CHAVE_WHATSAPP: copia sem passar pela tela. */
export function copiarChaveWebhook(): void {
  clipboard.writeText(garantirChave());
}

export function status(): StatusWhatsapp {
  const file = loadFile();
  const provedores = {} as Record<ProvedorWa, SituacaoProvedor>;
  PROVEDORES_WHATSAPP.forEach(({ id }) => {
    const chave = chaveDo(id);
    const falta = faltaNo(id, file);
    provedores[id] = { configurado: !falta, temChave: Boolean(chave), finalChave: id === 'n8n' ? '' : chave.slice(-4), ...(falta ? { falta } : {}) };
  });
  const webhook = secretStore.getSecret(SEGREDO_WEBHOOK) ?? '';
  const leads = loadContatos().leadsConfig;
  return {
    provedores,
    webhook: { temChave: Boolean(webhook), final: webhook.slice(-4) },
    servidorLocal: estadoServidor(),
    nuvem: { ativo: leads.nuvem.ativo, url: leads.nuvem.url },
    n8n: n8nService.enderecoN8n(),
    temSegredoApp: secretStore.hasSecret(nomeDoSegredo('meta.appSecret')),
    appWhatsapp: appDoWhatsapp(),
  };
}

// ---------- Endereços de recebimento ----------

const ORIGENS: readonly OrigemEventoWa[] = ['meta', 'evolution', 'waha', 'iris'];
const VIAS: readonly ViaWebhookWa[] = ['local', 'docker', 'rede', 'nuvem'];

function montarEndereco(origem: OrigemEventoWa, via: ViaWebhookWa, chave: string): { url: string; falta?: string } {
  const leads = loadContatos().leadsConfig;
  const servidor = estadoServidor();
  const porta = leads.servidor.porta;
  const caminho = `/v1/whatsapp/${origem}/${chave}`;
  if (via === 'nuvem') return leads.nuvem.url ? { url: leads.nuvem.url + caminho } : { url: '', falta: 'Configure a caixa na nuvem (API e n8n › Caixa na nuvem).' };
  if (!leads.servidor.ativo || !servidor.ouvindo) return { url: `http://127.0.0.1:${porta}${caminho}`, falta: 'Ligue o servidor local (API e n8n › Servidor local).' };
  if (via === 'local') return { url: `http://127.0.0.1:${porta}${caminho}` };
  if (!leads.servidor.rede) return { url: '', falta: 'Ligue "aceitar da rede local" no servidor local: de dentro do Docker ou de outro aparelho, 127.0.0.1 não é este PC.' };
  if (via === 'docker') return { url: `http://host.docker.internal:${porta}${caminho}` };
  return servidor.enderecoRede ? { url: servidor.enderecoRede + caminho } : { url: '', falta: 'Este PC não tem endereço na rede local agora.' };
}

export function enderecos(): EnderecoWa[] {
  const chave = secretStore.getSecret(SEGREDO_WEBHOOK) ?? '';
  const mascara = chave ? `wa_…${chave.slice(-4)}` : '<gere-a-chave>';
  return ORIGENS.flatMap((origem) =>
    VIAS.map((via) => {
      const e = montarEndereco(origem, via, mascara);
      return { origem, via, url: e.url, disponivel: Boolean(chave) && !e.falta, ...(e.falta ? { falta: e.falta } : !chave ? { falta: 'Gere a chave do WhatsApp primeiro.' } : {}) };
    }),
  );
}

export function enderecoReal(origem: OrigemEventoWa, via: ViaWebhookWa): string {
  const e = montarEndereco(origem, via, garantirChave());
  if (e.falta) throw new Error(e.falta);
  return e.url;
}

export function copiarEndereco(origem: unknown, via: unknown): void {
  if (!isOrigemEventoWa(origem) || !VIAS.includes(via as ViaWebhookWa)) throw new Error('Endereço desconhecido.');
  clipboard.writeText(enderecoReal(origem, via as ViaWebhookWa));
}

/** Evolution e WAHA deixam ligar o webhook pela API: o Iris faz, com o endereço certo. */
export async function configurarWebhook(provedor: unknown, via: unknown): Promise<ResultadoTeste> {
  if (provedor !== 'evolution' && provedor !== 'waha') throw new Error('Só a Evolution e o WAHA deixam configurar o webhook pelo Iris.');
  if (!VIAS.includes(via as ViaWebhookWa)) throw new Error('Escolha de onde o provedor chama o Iris.');
  const falta = faltaNo(provedor);
  if (falta) return { ok: false, mensagem: falta, detalhes: [] };
  const url = enderecoReal(provedor, via as ViaWebhookWa);
  const adaptador = ADAPTADORES[provedor];
  try {
    await adaptador.configurarWebhook!(contextoDo(provedor), url);
    return { ok: true, mensagem: `Webhook ligado: ${provedor === 'evolution' ? 'a Evolution' : 'o WAHA'} vai avisar o Iris das mensagens e das confirmações de entrega.`, detalhes: [] };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : String(erro), detalhes: [] };
  }
}

// ---------- Testes e consultas ----------

export async function testar(provedor: unknown): Promise<ResultadoTeste> {
  if (!isProvedorWa(provedor)) throw new Error('Caminho de envio desconhecido.');
  const falta = faltaNo(provedor);
  if (falta) return { ok: false, mensagem: falta, detalhes: [] };
  return ADAPTADORES[provedor].testar(contextoDo(provedor));
}

export async function conferirNumero(provedor: unknown, numero: unknown): Promise<ConferenciaNumero> {
  const p = isProvedorWa(provedor) ? provedor : loadFile().config.provedor;
  const n = soDigitos(typeof numero === 'string' ? numero : '');
  if (n.length < 10) throw new Error('Número inválido.');
  const adaptador = ADAPTADORES[p];
  if (!adaptador.conferirNumero) throw new Error('Este caminho não confere números; a Evolution e o WAHA conferem.');
  const falta = faltaNo(p);
  if (falta) throw new Error(falta);
  return adaptador.conferirNumero(contextoDo(p), n);
}

export async function listarTemplates(): Promise<TemplateMeta[]> {
  const falta = faltaNo('meta');
  if (falta) throw new Error(falta);
  return ADAPTADORES.meta.listarTemplates!(contextoDo('meta'));
}

// ---------- Modelos ----------

export async function salvarModelo(input: SalvarModeloWaInput): Promise<WhatsappFile> {
  const file = loadFile();
  const existente = typeof input?.id === 'string' ? file.modelos.find((m) => m.id === input.id) : undefined;
  const agora = nowIso();
  const modelo = migrateModelo({
    ...(existente ?? {}),
    ...input,
    id: existente?.id ?? randomUUID(),
    metaTemplate: input?.metaTemplate === null ? undefined : (input?.metaTemplate ?? existente?.metaTemplate),
    criadoEm: existente?.criadoEm ?? agora,
    atualizadoEm: agora,
  });
  if (!modelo) throw new Error('Dê um nome ao modelo.');
  if (!modelo.texto.trim() && !modelo.metaTemplate) throw new Error('Escreva o texto do modelo.');
  if (existente) file.modelos[file.modelos.indexOf(existente)] = modelo;
  else file.modelos.push(modelo);
  await saveFile(file);
  return file;
}

export async function excluirModelo(id: unknown): Promise<WhatsappFile> {
  const file = loadFile();
  const antes = file.modelos.length;
  file.modelos = file.modelos.filter((m) => m.id !== id);
  if (file.modelos.length === antes) throw new Error('Esse modelo não existe mais.');
  await saveFile(file);
  return file;
}

// ---------- Conversa ----------

function mesmaRef(a: RefContato | undefined, b: RefContato): boolean {
  return Boolean(a && a.tipo === b.tipo && a.id === b.id);
}

/** Um contato, 'todas', ou `{ numero }` (conversa em "Sem cadastro"). */
export async function marcarLidas(alvo: unknown): Promise<WhatsappFile> {
  const file = loadFile();
  const numero = alvo && typeof alvo === 'object' && typeof (alvo as { numero?: unknown }).numero === 'string' ? soDigitos((alvo as { numero: string }).numero) : '';
  const casa = (m: WhatsappFile['mensagens'][number]): boolean =>
    alvo === 'todas' || (isRef(alvo) && mesmaRef(m.contato, alvo)) || (Boolean(numero) && !m.contato && mesmoNumeroWa(m.numero, numero));
  let mudou = false;
  file.mensagens.forEach((m) => {
    if (m.direcao === 'entrada' && !m.vista && casa(m)) {
      m.vista = true;
      mudou = true;
    }
  });
  if (mudou) {
    await saveFile(file);
    avisarMudanca(file);
  }
  return file;
}

/** "Sem cadastro" → um contato: as mensagens daquele número passam a ser da conversa dele. */
export async function ligarNumero(numero: unknown, ref: unknown): Promise<WhatsappFile> {
  if (!isRef(ref)) throw new Error('Contato inválido.');
  const n = soDigitos(typeof numero === 'string' ? numero : '');
  if (n.length < 10) throw new Error('Número inválido.');
  const file = loadFile();
  file.mensagens.forEach((m) => {
    if (!m.contato && mesmoNumeroWa(m.numero, n)) m.contato = { tipo: ref.tipo, id: ref.id };
  });
  await saveFile(file);
  avisarMudanca(file, ref);
  return file;
}

/** Tira do histórico do Iris (não apaga do WhatsApp de ninguém). */
export async function excluirMensagem(id: unknown): Promise<WhatsappFile> {
  const file = loadFile();
  const antes = file.mensagens.length;
  file.mensagens = file.mensagens.filter((m) => m.id !== id);
  if (file.mensagens.length === antes) throw new Error('Essa mensagem não existe mais.');
  await saveFile(file);
  avisarMudanca(file);
  return file;
}

/** Contato excluído leva a conversa junto (como leva o histórico); lotes guardam o nome por extenso. */
export async function excluirDoContato(ref: RefContato): Promise<void> {
  const file = loadFile();
  const antes = file.mensagens.length;
  file.mensagens = file.mensagens.filter((m) => !mesmaRef(m.contato, ref));
  if (file.mensagens.length !== antes) {
    await saveFile(file);
    avisarMudanca(file);
  }
}

// ---------- n8n ----------

function cenarioN8n(pedido: unknown): CenarioN8n {
  if (pedido === 'local' || pedido === 'docker' || pedido === 'servidor') return pedido;
  return cenarioPeloEndereco(n8nService.enderecoN8n().baseUrl) ?? 'servidor';
}

export function fluxoN8n(tipo: unknown, cenario: unknown): FluxoN8n {
  if (!isTipoFluxoWa(tipo)) throw new Error('Fluxo desconhecido.');
  const file = loadFile();
  const chave = garantirChave();
  const leads = loadContatos().leadsConfig;
  const baseIris = baseIrisParaN8n(cenarioN8n(cenario), { porta: leads.servidor.porta, urlNuvem: leads.nuvem.url });
  if (tipo === 'receber-oficial' && !baseIris) throw new Error('Configure a caixa na nuvem: um n8n num servidor não alcança este PC.');
  return fluxoWa(tipo as TipoFluxoWa, {
    caminho: file.config.n8n.caminhoEnviar,
    chave,
    webhookId: randomUUID(),
    phoneNumberId: file.config.meta.phoneNumberId,
    evolution: file.config.evolution,
    ...(baseIris ? { baseIris } : {}),
  });
}

/** Copia o JSON do fluxo (com a chave) sem ela passar pela tela. */
export function copiarFluxoN8n(tipo: unknown, cenario: unknown): void {
  clipboard.writeText(JSON.stringify(fluxoN8n(tipo, cenario), null, 2));
}

export async function criarFluxoN8n(tipo: unknown, cenario: unknown): Promise<n8nService.WorkflowCriado> {
  return n8nService.criarWorkflow(fluxoN8n(tipo, cenario));
}

/** Limpa as credenciais (Ajustes › Backup não leva o cofre; isto é o "esquecer tudo" da Conexão). */
export async function removerCredenciais(): Promise<StatusWhatsapp> {
  await secretStore.deleteSecretsByPrefix(PREFIXO);
  return status();
}
