import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { salvarPdfDaJanela } from '../core/pdf';
import { RELATORIOS_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { FileOpResult } from '../../shared/types/export.types';
import type {
  CriarRelatorioInput,
  ExportarPdfInput,
  Relatorio,
  RelatoriosFile,
  SalvarCategoriasInput,
} from '../../shared/types/relatorios.types';
import * as relatoriosService from '../modules/relatorios/relatorios.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

/** Relatório em PDF: o documento já está em #impressao (relatorios.view.ts); ver core/pdf.ts. */
function exportarPdf(event: IpcMainInvokeEvent, input: ExportarPdfInput): Promise<FileOpResult> {
  const relatorio = relatoriosService.getRelatorio(input.relatorioId);
  return salvarPdfDaJanela(event, {
    tituloDialogo: 'Exportar relatório em PDF',
    nomeArquivo: input.nomeArquivo || relatorio.titulo || 'relatorio',
    rodape: relatorio.titulo,
  });
}

export function registerRelatoriosIpc(): void {
  ipcMain.handle(RELATORIOS_CHANNELS.getFile, () => toResult<RelatoriosFile>(relatoriosService.getFile()));

  ipcMain.handle(RELATORIOS_CHANNELS.criarRelatorio, (_event, input: CriarRelatorioInput) =>
    toResult<RelatoriosFile>(relatoriosService.criarRelatorio(input)),
  );

  ipcMain.handle(RELATORIOS_CHANNELS.salvarRelatorio, (_event, relatorio: Relatorio) =>
    toResult<RelatoriosFile>(relatoriosService.salvarRelatorio(relatorio)),
  );

  ipcMain.handle(RELATORIOS_CHANNELS.duplicarRelatorio, (_event, relatorioId: string) =>
    toResult<RelatoriosFile>(relatoriosService.duplicarRelatorio(relatorioId)),
  );

  ipcMain.handle(RELATORIOS_CHANNELS.excluirRelatorio, (_event, relatorioId: string) =>
    toResult<RelatoriosFile>(relatoriosService.excluirRelatorio(relatorioId)),
  );

  ipcMain.handle(RELATORIOS_CHANNELS.salvarCategorias, (_event, input: SalvarCategoriasInput) =>
    toResult<RelatoriosFile>(relatoriosService.salvarCategorias(input)),
  );

  ipcMain.handle(RELATORIOS_CHANNELS.exportarPdf, (event, input: ExportarPdfInput) =>
    toResult<FileOpResult>(exportarPdf(event, input)),
  );

}
