import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { CONTATOS_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { ContatosFile, ExportarDocumentoInput, SalvarLeadsConfigInput } from '../../shared/types/contatos.types';
import type { FileOpResult } from '../../shared/types/export.types';
import type { EstadoBusca, ResultadoTeste, StatusLeads } from '../../shared/types/leads.types';
import { reaplicarAgendamentos } from '../core/backgroundServices';
import { salvarPdfDaJanela } from '../core/pdf';
import * as contatos from '../modules/contatos/contatos.service';
import * as contratos from '../modules/contatos/contatos.contratos';
import * as leads from '../modules/contatos/contatos.leads';
import * as servidor from '../modules/contatos/contatos.servidor';
import type { WorkflowCriado } from '../modules/n8n/n8n.service';
import * as whatsapp from '../modules/whatsapp/whatsapp.service';
import type { RefContato } from '../../shared/types/contatos.types';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
}

/** Ficha ou contrato: o documento já está em #impressao (ui/impressao.ts); ver core/pdf.ts. */
function exportarPdf(event: IpcMainInvokeEvent, input: ExportarDocumentoInput): Promise<FileOpResult> {
  const texto = (v: unknown, padrao: string): string => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 160) : padrao);
  return salvarPdfDaJanela(event, {
    tituloDialogo: texto(input?.titulo, 'Exportar PDF'),
    nomeArquivo: texto(input?.nomeArquivo, 'contato'),
    rodape: texto(input?.rodape, ''),
  });
}

type Acao = (...args: never[]) => Promise<ContatosFile>;

export function registerContatosIpc(): void {
  const mutacoes: Record<string, Acao> = {
    [CONTATOS_CHANNELS.salvarPessoa]: contatos.salvarPessoa,
    [CONTATOS_CHANNELS.salvarEmpresa]: contatos.salvarEmpresa,
    // A conversa do WhatsApp mora em outro arquivo: sai junto, como o histórico.
    [CONTATOS_CHANNELS.excluirContato]: (ref: RefContato) =>
      contatos.excluirContato(ref).then(async (file) => {
        await whatsapp.excluirDoContato(ref);
        return file;
      }),
    [CONTATOS_CHANNELS.arquivarContato]: contatos.arquivarContato,
    [CONTATOS_CHANNELS.moverNoFunil]: contatos.moverNoFunil,
    [CONTATOS_CHANNELS.salvarEtapas]: contatos.salvarEtapas,
    [CONTATOS_CHANNELS.registrarInteracao]: contatos.registrarInteracao,
    [CONTATOS_CHANNELS.editarInteracao]: contatos.editarInteracao,
    [CONTATOS_CHANNELS.excluirInteracao]: contatos.excluirInteracao,
    [CONTATOS_CHANNELS.salvarModelo]: contratos.salvarModelo,
    [CONTATOS_CHANNELS.duplicarModelo]: contratos.duplicarModelo,
    [CONTATOS_CHANNELS.excluirModelo]: contratos.excluirModelo,
    [CONTATOS_CHANNELS.criarContrato]: contratos.criarContrato,
    [CONTATOS_CHANNELS.atualizarContrato]: contratos.atualizarContrato,
    [CONTATOS_CHANNELS.duplicarContrato]: contratos.duplicarContrato,
    [CONTATOS_CHANNELS.excluirContrato]: contratos.excluirContrato,
    [CONTATOS_CHANNELS.gerarChaveFormulario]: leads.gerarChaveFormulario,
    [CONTATOS_CHANNELS.marcarVisto]: leads.marcarVisto,
    [CONTATOS_CHANNELS.descartarLead]: leads.descartarLead,
    [CONTATOS_CHANNELS.repontuar]: leads.repontuar,
    [CONTATOS_CHANNELS.salvarRelatorioLeads]: leads.salvarRelatorioLeads,
    [CONTATOS_CHANNELS.excluirRelatorioLeads]: leads.excluirRelatorioLeads,
  };
  // Toda mutação tem a mesma forma (argumentos → arquivo inteiro); o service valida cada argumento.
  Object.entries(mutacoes).forEach(([canal, acao]) => {
    ipcMain.handle(canal, (_event, ...args: unknown[]) => toResult<ContatosFile>((acao as (...a: unknown[]) => Promise<ContatosFile>)(...args)));
  });

  // A primeira leitura gera a chave do formulário de quem ainda não tem (arquivo da parte 1).
  ipcMain.handle(CONTATOS_CHANNELS.getFile, () => toResult<ContatosFile>(contatos.getFile().then(leads.garantirChaveFormulario)));
  ipcMain.handle(CONTATOS_CHANNELS.exportarPdf, (event, input: ExportarDocumentoInput) => toResult<FileOpResult>(exportarPdf(event, input)));

  // ---------- Leads por API ----------
  // Servidor e busca na nuvem seguem a configuração na hora, sem reiniciar.
  const status = async (): Promise<StatusLeads> => leads.statusLeads(servidor.estadoServidor());
  ipcMain.handle(CONTATOS_CHANNELS.leadsStatus, () => toResult<StatusLeads>(status()));
  ipcMain.handle(CONTATOS_CHANNELS.salvarLeadsConfig, (_event, input: SalvarLeadsConfigInput) =>
    toResult<ContatosFile>(
      leads.salvarLeadsConfig(input).then(async (file) => {
        reaplicarAgendamentos();
        await servidor.aplicarServidor(file.leadsConfig.servidor);
        return file;
      }),
    ),
  );
  ipcMain.handle(CONTATOS_CHANNELS.gerarChaveIris, () => toResult<StatusLeads>(leads.gerarChaveIris().then(status)));
  ipcMain.handle(CONTATOS_CHANNELS.definirChaveIris, (_event, valor: unknown) => toResult<StatusLeads>(leads.definirChaveIris(valor).then(status)));
  ipcMain.handle(CONTATOS_CHANNELS.copiarChaveIris, () => toResult<void>(Promise.resolve().then(() => leads.copiarChaveIris())));
  ipcMain.handle(CONTATOS_CHANNELS.testarNuvem, () => toResult<ResultadoTeste>(leads.testarNuvem()));
  ipcMain.handle(CONTATOS_CHANNELS.buscarAgora, () => toResult<EstadoBusca>(leads.buscarNuvem(undefined, true)));
  ipcMain.handle(CONTATOS_CHANNELS.enviarTeste, () => toResult<ResultadoTeste>(leads.enviarTeste(servidor.estadoServidor())));
  // n8n: o fluxo pronto é montado aqui (endereço e chave de agora) e criado pela conexão do módulo n8n.
  ipcMain.handle(CONTATOS_CHANNELS.criarFluxoN8n, (_event, cenario: unknown) => toResult<WorkflowCriado>(leads.criarFluxoN8n(cenario)));
  ipcMain.handle(CONTATOS_CHANNELS.testarFluxoN8n, () => toResult<ResultadoTeste>(leads.testarFluxoN8n()));
  ipcMain.handle(CONTATOS_CHANNELS.contarNaoVistos, () => toResult<number>(contatos.getFile().then(leads.contarNaoVistos)));
}
