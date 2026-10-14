import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { salvarPdfDaJanela } from '../core/pdf';
import type { FileOpResult } from '../../shared/types/export.types';
import type { RevisaoSemana } from '../../shared/types/revisao.types';
import { HOJE_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { ConcluirItemDiaInput, DiaHoje } from '../../shared/types/hoje.types';
import type { PulsoHome, SugestaoHome } from '../../shared/types/home.types';
import * as homeService from '../modules/hoje/home.service';
import * as hojeService from '../modules/hoje/hoje.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

/** O documento da revisão já está em #impressao (ui/impressao.ts); ver core/pdf.ts. */
function exportarPdf(event: IpcMainInvokeEvent, nomeArquivo: unknown): Promise<FileOpResult> {
  const nome = typeof nomeArquivo === 'string' && nomeArquivo.trim() ? nomeArquivo.trim().slice(0, 120) : 'revisao-da-semana';
  return salvarPdfDaJanela(event, { tituloDialogo: 'Salvar a revisão da semana em PDF', nomeArquivo: nome, rodape: 'Revisão da semana · Iris' });
}

export function registerHojeIpc(): void {
  ipcMain.handle(HOJE_CHANNELS.getSemana, (_event, inicio: unknown) => toResult<RevisaoSemana>(hojeService.getSemana(inicio)));
  ipcMain.handle(HOJE_CHANNELS.exportarPdf, (event, nome: unknown) => toResult<FileOpResult>(exportarPdf(event, nome)));
  ipcMain.handle(HOJE_CHANNELS.getDia, () => toResult<DiaHoje>(hojeService.getDia()));

  ipcMain.handle(HOJE_CHANNELS.getPulso, (_event, semente: unknown) => toResult<PulsoHome>(homeService.getPulso(semente)));
  ipcMain.handle(HOJE_CHANNELS.getSugestao, () => toResult<SugestaoHome>(homeService.getSugestao()));
  ipcMain.handle(HOJE_CHANNELS.gerarSugestao, () => toResult<SugestaoHome>(homeService.gerarSugestao()));

  ipcMain.handle(HOJE_CHANNELS.concluir, (_event, input: ConcluirItemDiaInput) => toResult<DiaHoje>(hojeService.concluir(input)));
}
