import { BrowserWindow, ipcMain } from 'electron';
import { IA_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  DestinoBiblioteca,
  GerarImagemInput,
  IaConfig,
  ItemGaleriaComMiniatura,
  ModeloIa,
  PedidoTexto,
  ProvedorId,
  ReferenciaIa,
  RefImagem,
  RespostaTexto,
  SalvarNaBibliotecaResult,
  SalvarPadroesInput,
  SalvarProvedorInput,
  TarefaIa,
  VinculoPostagem,
} from '../../shared/types/ia.types';
import * as galeria from '../modules/ia/ia.galeria';
import * as referencias from '../modules/ia/ia.referencias';
import * as iaService from '../modules/ia/ia.service';
import * as tarefas from '../modules/ia/ia.tarefas';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

/** Para funções síncronas que lançam: o erro também vira IpcResult. */
function tentar<T>(fn: () => T): Promise<IpcResult<T>> {
  return toResult(Promise.resolve().then(fn));
}

export function registerIaIpc(): void {
  ipcMain.handle(IA_CHANNELS.getConfig, () => toResult<IaConfig>(iaService.getConfig()));
  ipcMain.handle(IA_CHANNELS.salvarProvedor, (_event, input: SalvarProvedorInput) =>
    toResult<IaConfig>(iaService.salvarProvedor(input)),
  );
  ipcMain.handle(IA_CHANNELS.salvarPadroes, (_event, input: SalvarPadroesInput) =>
    toResult<IaConfig>(iaService.salvarPadroes(input)),
  );
  ipcMain.handle(IA_CHANNELS.testarProvedor, (_event, id: ProvedorId) => toResult<string>(iaService.testarProvedor(id)));
  ipcMain.handle(IA_CHANNELS.listarModelos, (_event, id: ProvedorId, forcar?: boolean) =>
    toResult<ModeloIa[]>(iaService.listarModelos(id, Boolean(forcar))),
  );

  ipcMain.handle(IA_CHANNELS.gerarTexto, (_event, pedido: PedidoTexto) => toResult<RespostaTexto>(tarefas.gerarTexto(pedido)));

  ipcMain.handle(IA_CHANNELS.referenciasDoComputador, (event) =>
    toResult<ReferenciaIa[]>(referencias.escolherDoComputador(BrowserWindow.fromWebContents(event.sender))),
  );
  ipcMain.handle(IA_CHANNELS.descreverReferencia, (_event, ref: RefImagem) =>
    toResult<ReferenciaIa>(referencias.descreverReferencia(ref)),
  );

  ipcMain.handle(IA_CHANNELS.gerarImagem, (_event, input: GerarImagemInput) => tentar<TarefaIa>(() => tarefas.gerarImagem(input)));
  ipcMain.handle(IA_CHANNELS.cancelarTarefa, (_event, tarefaId: string) => tentar<TarefaIa[]>(() => tarefas.cancelar(tarefaId)));
  ipcMain.handle(IA_CHANNELS.listarTarefas, () => tentar<TarefaIa[]>(() => tarefas.listarTarefas()));
  ipcMain.handle(IA_CHANNELS.dispensarTarefa, (_event, tarefaId: string) => tentar<TarefaIa[]>(() => tarefas.dispensarTarefa(tarefaId)));
  ipcMain.handle(IA_CHANNELS.limparTarefas,() => tentar<TarefaIa[]>(() => tarefas.limparTarefas()));

  ipcMain.handle(IA_CHANNELS.listarGaleria, () => toResult<ItemGaleriaComMiniatura[]>(galeria.listar()));
  ipcMain.handle(IA_CHANNELS.abrirImagem, (_event, id: string) => toResult<string>(galeria.original(id)));
  ipcMain.handle(IA_CHANNELS.excluirImagem, (_event, id: string) => toResult<ItemGaleriaComMiniatura[]>(galeria.excluir(id)));
  ipcMain.handle(IA_CHANNELS.exportarImagem, (event, id: string) =>
    toResult<string | null>(galeria.exportar(id, BrowserWindow.fromWebContents(event.sender))),
  );
  ipcMain.handle(IA_CHANNELS.salvarNaBiblioteca, (_event, id: string, destino?: DestinoBiblioteca) =>
    toResult<SalvarNaBibliotecaResult>(galeria.salvarNaBiblioteca(id, destino)),
  );
  ipcMain.handle(IA_CHANNELS.vincularPostagem, (_event, id: string, postagem: VinculoPostagem) =>
    toResult<void>(galeria.vincularPostagem(id, postagem)),
  );
}
