import { BrowserWindow, app, dialog, ipcMain, shell, type IpcMainInvokeEvent, type SaveDialogOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
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

const ENTIDADES_HTML: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ENTIDADES_HTML[c] ?? c);
}

/** Nome de arquivo seguro no Windows: sem os caracteres proibidos e sem ponto no fim. */
function nomeDeArquivo(nome: string): string {
  const limpo = nome
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return limpo.slice(0, 120) || 'relatorio';
}

/**
 * O PDF sai da própria janela do app: o renderer monta o documento num
 * contêiner #impressao e o CSS de impressão (relatorios-impressao.css) esconde
 * todo o resto. Assim a prévia na tela e o PDF são o mesmo DOM — sem janela
 * oculta, sem um segundo gerador de HTML para manter em sincronia.
 */
async function exportarPdf(event: IpcMainInvokeEvent, input: ExportarPdfInput): Promise<FileOpResult> {
  const relatorio = relatoriosService.getRelatorio(input.relatorioId);
  const janela = BrowserWindow.fromWebContents(event.sender);
  const opcoes: SaveDialogOptions = {
    title: 'Exportar relatório em PDF',
    defaultPath: path.join(app.getPath('documents'), `${nomeDeArquivo(input.nomeArquivo || relatorio.titulo)}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  };
  const escolha = janela ? await dialog.showSaveDialog(janela, opcoes) : await dialog.showSaveDialog(opcoes);
  if (escolha.canceled || !escolha.filePath) return { canceled: true };

  // Rodapé do Chromium: fica fora do fluxo da página, então numera todas sem JS.
  const rodape = `<div style="width:100%;padding:0 15mm;font-family:'Segoe UI',sans-serif;font-size:7.5px;color:#6b6780;display:flex;justify-content:space-between;">
    <span>${escaparHtml(relatorio.titulo)}</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;

  const pdf = await event.sender.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: rodape,
    // As margens laterais ficam no CSS (padding do documento), para o fundo da capa ir até a borda.
    margins: { marginType: 'custom', top: 0.5, bottom: 0.6, left: 0, right: 0 },
  });
  await fs.promises.writeFile(escolha.filePath, pdf);
  return { canceled: false, filePath: escolha.filePath };
}

/** Abre o PDF recém-salvo no leitor padrão. Só aceita um .pdf que existe. */
async function abrirPdf(filePath: string): Promise<void> {
  if (typeof filePath !== 'string' || path.extname(filePath).toLowerCase() !== '.pdf' || !fs.existsSync(filePath)) {
    throw new Error('Arquivo não encontrado.');
  }
  const erro = await shell.openPath(filePath);
  if (erro) throw new Error(erro);
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

  ipcMain.handle(RELATORIOS_CHANNELS.abrirPdf, (_event, filePath: string) => toResult<void>(abrirPdf(filePath)));
}
