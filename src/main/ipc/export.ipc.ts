import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron';
import fs from 'node:fs';
import { EXPORT_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import {
  EXPORTAVEIS,
  isModuloExportavel,
  type CopiaDeSeguranca,
  type FileOpResult,
  type FormatoExportacao,
  type ModuloExportavel,
  type PreviaImportacao,
  type ResultadoImportacao,
  type ResumoExportavel,
} from '../../shared/types/export.types';
import * as exportService from '../modules/export/export.service';
import { gerarPlanilha, temPlanilha } from '../modules/export/export.planilhas';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

function dateStamp(): string {
  // Data local: pelo UTC, um backup feito depois das 21h sairia com a data de amanhã.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "iris-kanban-2026-10-06"; mais de um módulo (ou todos) vira "iris-backup-…". */
function nomeDoArquivo(escopo: ModuloExportavel[]): string {
  const um = escopo.length === 1 ? escopo[0] : undefined;
  return `iris-${um ?? 'backup'}-${dateStamp()}`;
}

async function exportar(janela: BrowserWindow | null, escopoBruto: unknown, formatoBruto: unknown): Promise<FileOpResult> {
  const escopo = Array.isArray(escopoBruto) ? escopoBruto.filter(isModuloExportavel) : [];
  if (!escopo.length) throw new Error('Escolha o que exportar.');
  const formato: FormatoExportacao = formatoBruto === 'xlsx' ? 'xlsx' : 'json';
  const unico = escopo[0]!;
  if (formato === 'xlsx' && (escopo.length > 1 || !temPlanilha(unico))) throw new Error('A planilha é gerada um módulo por vez, só para os que têm lista.');

  const rotulo = escopo.length === 1 ? EXPORTAVEIS.find((e) => e.id === unico)?.rotulo : undefined;
  const opcoes = {
    title: rotulo ? `Exportar ${rotulo}` : 'Exportar todos os dados do Iris',
    defaultPath: `${nomeDoArquivo(escopo)}.${formato}`,
    filters: [formato === 'xlsx' ? { name: 'Planilha do Excel', extensions: ['xlsx'] } : { name: 'JSON', extensions: ['json'] }],
  };
  const escolha = janela ? await dialog.showSaveDialog(janela, opcoes) : await dialog.showSaveDialog(opcoes);
  if (escolha.canceled || !escolha.filePath) return { canceled: true };

  const conteudo = formato === 'xlsx' ? await gerarPlanilha(unico) : JSON.stringify(await exportService.buildExportBundle(escopo), null, 2);
  fs.writeFileSync(escolha.filePath, conteudo, typeof conteudo === 'string' ? 'utf-8' : undefined);
  return { canceled: false, filePath: escolha.filePath };
}

async function escolherImportacao(janela: BrowserWindow | null): Promise<PreviaImportacao | null> {
  const opcoes: OpenDialogOptions = {
    title: 'Importar dados do Iris',
    properties: ['openFile'],
    filters: [{ name: 'Backup do Iris (JSON)', extensions: ['json'] }],
  };
  const escolha = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes);
  const caminho = escolha.filePaths[0];
  if (escolha.canceled || !caminho) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(caminho, 'utf-8'));
  } catch {
    throw new Error('Não deu para ler o arquivo: ele não é um JSON válido.');
  }
  return exportService.prepararImportacao(raw);
}

export function registerExportIpc(): void {
  ipcMain.handle(EXPORT_CHANNELS.resumo, () => toResult<ResumoExportavel[]>(exportService.resumoAtual()));

  ipcMain.handle(EXPORT_CHANNELS.exportar, (event, escopo: unknown, formato: unknown) =>
    toResult<FileOpResult>(exportar(BrowserWindow.fromWebContents(event.sender), escopo, formato)),
  );

  ipcMain.handle(EXPORT_CHANNELS.escolherImportacao, (event) =>
    toResult<PreviaImportacao | null>(escolherImportacao(BrowserWindow.fromWebContents(event.sender))),
  );

  ipcMain.handle(EXPORT_CHANNELS.aplicarImportacao, (_event, modulos: unknown) =>
    toResult<ResultadoImportacao>(exportService.aplicarImportacao(modulos)),
  );

  ipcMain.handle(EXPORT_CHANNELS.cancelarImportacao, () => toResult<void>(Promise.resolve(exportService.cancelarImportacao())));

  ipcMain.handle(EXPORT_CHANNELS.ultimaCopia, () => toResult<CopiaDeSeguranca | null>(Promise.resolve().then(() => exportService.ultimaCopia())));

  ipcMain.handle(EXPORT_CHANNELS.desfazerImportacao, () => toResult<ModuloExportavel[]>(exportService.desfazerUltimaImportacao()));

  ipcMain.handle(EXPORT_CHANNELS.abrirPastaDeCopias, () =>
    toResult<void>(
      shell.openPath(exportService.abrirPastaDeCopias()).then((erro) => {
        if (erro) throw new Error(erro);
      }),
    ),
  );
}
