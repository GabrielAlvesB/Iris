import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron';
import { BACKUP_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { BackupNaPasta, EstadoBackupAuto, MudancaBackupAuto } from '../../shared/types/backup.types';
import type { PreviaImportacao } from '../../shared/types/export.types';
import * as backupService from '../modules/backup/backup.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

/** null = cancelado. O caminho nunca vem do renderer: só deste diálogo. */
async function escolherPasta(janela: BrowserWindow | null): Promise<EstadoBackupAuto | null> {
  const atual = backupService.getEstado().pasta;
  const opcoes: OpenDialogOptions = {
    title: 'Pasta dos backups automáticos',
    properties: ['openDirectory', 'createDirectory'],
    ...(atual ? { defaultPath: atual } : {}),
  };
  const escolha = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes);
  const pasta = escolha.filePaths[0];
  if (escolha.canceled || !pasta) return null;
  return backupService.definirPasta(pasta);
}

export function registerBackupIpc(): void {
  ipcMain.handle(BACKUP_CHANNELS.getEstado, () => toResult<EstadoBackupAuto>(Promise.resolve().then(() => backupService.getEstado())));

  ipcMain.handle(BACKUP_CHANNELS.mudarConfig, (_event, mudanca: MudancaBackupAuto) =>
    toResult<EstadoBackupAuto>(backupService.mudarConfig(mudanca)),
  );

  ipcMain.handle(BACKUP_CHANNELS.escolherPasta, (event) =>
    toResult<EstadoBackupAuto | null>(escolherPasta(BrowserWindow.fromWebContents(event.sender))),
  );

  ipcMain.handle(BACKUP_CHANNELS.fazerAgora, () => toResult<EstadoBackupAuto>(backupService.fazerBackupAgora()));

  ipcMain.handle(BACKUP_CHANNELS.listar, () => toResult<BackupNaPasta[]>(Promise.resolve().then(() => backupService.listarBackups())));

  ipcMain.handle(BACKUP_CHANNELS.prepararRestauracao, (_event, arquivo: unknown) =>
    toResult<PreviaImportacao>(Promise.resolve().then(() => backupService.prepararRestauracao(arquivo))),
  );

  ipcMain.handle(BACKUP_CHANNELS.abrirPasta, () =>
    toResult<void>(
      Promise.resolve()
        .then(() => shell.openPath(backupService.pastaAtual()))
        .then((erro) => {
          if (erro) throw new Error(erro);
        }),
    ),
  );
}
