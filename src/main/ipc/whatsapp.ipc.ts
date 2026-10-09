import { ipcMain } from 'electron';
import { WHATSAPP_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  ConferenciaNumero,
  CriarLoteInput,
  EnderecoWa,
  EnviarWaInput,
  ResultadoTeste,
  SalvarConfigWaInput,
  SalvarModeloWaInput,
  StatusWhatsapp,
  TemplateMeta,
  WhatsappFile,
} from '../../shared/types/whatsapp.types';
import * as secretStore from '../storage/secretStore';
import * as envio from '../modules/whatsapp/whatsapp.envio';
import * as fila from '../modules/whatsapp/whatsapp.fila';
import * as receber from '../modules/whatsapp/whatsapp.receber';
import * as whatsapp from '../modules/whatsapp/whatsapp.service';
import type { WorkflowCriado } from '../modules/n8n/n8n.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
}

function agora<T>(fazer: () => T): Promise<T> {
  return Promise.resolve().then(fazer);
}

/** A chave no JSON do fluxo aparece mascarada na tela; a inteira só vai para a área de transferência. */
function previaFluxo(tipo: unknown, cenario: unknown): string {
  const texto = JSON.stringify(whatsapp.fluxoN8n(tipo, cenario), null, 2);
  const chave = secretStore.getSecret(whatsapp.SEGREDO_WEBHOOK) ?? '';
  return chave ? texto.split(chave).join(`wa_…${chave.slice(-4)}`) : texto;
}

type Mutacao = (...args: never[]) => Promise<WhatsappFile>;

export function registerWhatsappIpc(): void {
  const mutacoes: Record<string, Mutacao> = {
    [WHATSAPP_CHANNELS.salvarConfig]: (input: SalvarConfigWaInput) => whatsapp.salvarConfig(input),
    [WHATSAPP_CHANNELS.marcarLidas]: whatsapp.marcarLidas,
    [WHATSAPP_CHANNELS.ligarNumero]: whatsapp.ligarNumero,
    [WHATSAPP_CHANNELS.excluirMensagem]: whatsapp.excluirMensagem,
    [WHATSAPP_CHANNELS.salvarModelo]: (input: SalvarModeloWaInput) => whatsapp.salvarModelo(input),
    [WHATSAPP_CHANNELS.excluirModelo]: whatsapp.excluirModelo,
    [WHATSAPP_CHANNELS.criarLote]: (input: CriarLoteInput) => fila.criarLote(input),
    [WHATSAPP_CHANNELS.mudarLote]: fila.mudarLote,
  };
  Object.entries(mutacoes).forEach(([canal, acao]) => {
    ipcMain.handle(canal, (_event, ...args: unknown[]) => toResult<WhatsappFile>((acao as (...a: unknown[]) => Promise<WhatsappFile>)(...args)));
  });

  ipcMain.handle(WHATSAPP_CHANNELS.getFile, () => toResult<WhatsappFile>(whatsapp.getFile()));
  ipcMain.handle(WHATSAPP_CHANNELS.status, () => toResult<StatusWhatsapp>(agora(whatsapp.status)));
  ipcMain.handle(WHATSAPP_CHANNELS.definirSegredo, (_event, qual: unknown, valor: unknown) => toResult<StatusWhatsapp>(whatsapp.definirSegredo(qual, valor)));
  ipcMain.handle(WHATSAPP_CHANNELS.removerCredenciais, () => toResult<StatusWhatsapp>(whatsapp.removerCredenciais()));
  ipcMain.handle(WHATSAPP_CHANNELS.gerarChaveWebhook, () => toResult<StatusWhatsapp>(whatsapp.gerarChaveWebhook()));
  ipcMain.handle(WHATSAPP_CHANNELS.copiarChaveWebhook, () => toResult<void>(agora(whatsapp.copiarChaveWebhook)));
  ipcMain.handle(WHATSAPP_CHANNELS.enderecos, () => toResult<EnderecoWa[]>(agora(whatsapp.enderecos)));
  ipcMain.handle(WHATSAPP_CHANNELS.copiarEndereco, (_event, origem: unknown, via: unknown) => toResult<void>(agora(() => whatsapp.copiarEndereco(origem, via))));
  ipcMain.handle(WHATSAPP_CHANNELS.configurarWebhook, (_event, provedor: unknown, via: unknown) => toResult<ResultadoTeste>(whatsapp.configurarWebhook(provedor, via)));
  ipcMain.handle(WHATSAPP_CHANNELS.testar, (_event, provedor: unknown) => toResult<ResultadoTeste>(whatsapp.testar(provedor)));
  ipcMain.handle(WHATSAPP_CHANNELS.conferirNumero, (_event, provedor: unknown, numero: unknown) => toResult<ConferenciaNumero>(whatsapp.conferirNumero(provedor, numero)));
  ipcMain.handle(WHATSAPP_CHANNELS.listarTemplates, () => toResult<TemplateMeta[]>(whatsapp.listarTemplates()));
  ipcMain.handle(WHATSAPP_CHANNELS.enviar, (_event, input: EnviarWaInput) => toResult<envio.ResultadoEnvio>(envio.enviar(input)));
  ipcMain.handle(WHATSAPP_CHANNELS.reenviar, (_event, id: unknown) => toResult<envio.ResultadoEnvio>(envio.reenviar(id)));
  ipcMain.handle(WHATSAPP_CHANNELS.sincronizarConversa, (_event, ref: unknown) => toResult<{ novas: number; erro?: string }>(receber.sincronizarConversa(ref)));
  ipcMain.handle(WHATSAPP_CHANNELS.previaFluxoN8n, (_event, tipo: unknown, cenario: unknown) => toResult<string>(agora(() => previaFluxo(tipo, cenario))));
  ipcMain.handle(WHATSAPP_CHANNELS.copiarFluxoN8n, (_event, tipo: unknown, cenario: unknown) => toResult<void>(agora(() => whatsapp.copiarFluxoN8n(tipo, cenario))));
  ipcMain.handle(WHATSAPP_CHANNELS.criarFluxoN8n, (_event, tipo: unknown, cenario: unknown) => toResult<WorkflowCriado>(whatsapp.criarFluxoN8n(tipo, cenario)));
}
