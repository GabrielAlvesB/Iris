import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import { TRAFEGO_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  AtualizarCampanhaInput,
  CriarCampanhaInput,
  ImportarRegistrosResult,
  MoverCampanhaInput,
  RemoverRegistroInput,
  SalvarContaInput,
  SalvarRegistroInput,
  SalvarSiteInput,
  TrafegoFile,
} from '../../shared/types/trafego.types';
import * as trafegoService from '../modules/trafego/trafego.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

async function importarRegistros(senderWindow: BrowserWindow | null, campanhaId: string): Promise<ImportarRegistrosResult> {
  const options: OpenDialogOptions = {
    title: 'Importar resultados da campanha',
    properties: ['openFile'],
    filters: [{ name: 'Planilhas', extensions: ['csv', 'xlsx', 'xls', 'ods'] }],
  };
  const result = senderWindow ? await dialog.showOpenDialog(senderWindow, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return { file: null, importados: null, ignorados: 0, colunasLidas: [] };
  }
  return trafegoService.importarRegistros(campanhaId, result.filePaths[0]!);
}

export function registerTrafegoIpc(): void {
  ipcMain.handle(TRAFEGO_CHANNELS.getFile, () => toResult<TrafegoFile>(trafegoService.getFile()));

  ipcMain.handle(TRAFEGO_CHANNELS.salvarConta, (_event, input: SalvarContaInput) =>
    toResult<TrafegoFile>(trafegoService.salvarConta(input)),
  );
  ipcMain.handle(TRAFEGO_CHANNELS.excluirConta, (_event, contaId: string) =>
    toResult<TrafegoFile>(trafegoService.excluirConta(contaId)),
  );

  ipcMain.handle(TRAFEGO_CHANNELS.salvarSite, (_event, input: SalvarSiteInput) =>
    toResult<TrafegoFile>(trafegoService.salvarSite(input)),
  );
  ipcMain.handle(TRAFEGO_CHANNELS.excluirSite, (_event, siteId: string) =>
    toResult<TrafegoFile>(trafegoService.excluirSite(siteId)),
  );

  ipcMain.handle(TRAFEGO_CHANNELS.criarCampanha, (_event, input: CriarCampanhaInput) =>
    toResult<TrafegoFile>(trafegoService.criarCampanha(input)),
  );
  ipcMain.handle(TRAFEGO_CHANNELS.atualizarCampanha, (_event, input: AtualizarCampanhaInput) =>
    toResult<TrafegoFile>(trafegoService.atualizarCampanha(input)),
  );
  ipcMain.handle(TRAFEGO_CHANNELS.moverCampanha, (_event, input: MoverCampanhaInput) =>
    toResult<TrafegoFile>(trafegoService.moverCampanha(input)),
  );
  ipcMain.handle(TRAFEGO_CHANNELS.excluirCampanha, (_event, campanhaId: string) =>
    toResult<TrafegoFile>(trafegoService.excluirCampanha(campanhaId)),
  );
  ipcMain.handle(TRAFEGO_CHANNELS.duplicarCampanha, (_event, campanhaId: string) =>
    toResult<TrafegoFile>(trafegoService.duplicarCampanha(campanhaId)),
  );

  ipcMain.handle(TRAFEGO_CHANNELS.salvarRegistro, (_event, input: SalvarRegistroInput) =>
    toResult<TrafegoFile>(trafegoService.salvarRegistro(input)),
  );
  ipcMain.handle(TRAFEGO_CHANNELS.removerRegistro, (_event, input: RemoverRegistroInput) =>
    toResult<TrafegoFile>(trafegoService.removerRegistro(input)),
  );
  ipcMain.handle(TRAFEGO_CHANNELS.importarRegistros, (event, campanhaId: string) =>
    toResult<ImportarRegistrosResult>(importarRegistros(BrowserWindow.fromWebContents(event.sender), campanhaId)),
  );
}
