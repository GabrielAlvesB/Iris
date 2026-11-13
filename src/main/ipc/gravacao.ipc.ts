import { BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import { GRAVACAO_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { FileOpResult } from '../../shared/types/export.types';
import {
  marcadoresEmCsv,
  marcadoresEmTexto,
  type ConviteInput,
  type ConviteLido,
  type CriarGravacaoInput,
  type EstadoRelogio,
  type GravacaoFile,
  type SessaoGravacao,
} from '../../shared/types/gravacao.types';
import * as gravacaoService from '../modules/gravacao/gravacao.service';
import { conferirRelogio } from '../modules/gravacao/gravacao.relogio';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

/** Nome de arquivo sem os caracteres que o Windows recusa. */
function nomeSeguro(texto: string): string {
  return texto.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'gravacao';
}

/** O conteúdo é montado aqui, do arquivo: a tela só diz qual gravação e o formato. */
async function exportarMarcadores(janela: BrowserWindow | null, sessaoId: unknown, formato: unknown): Promise<FileOpResult> {
  const sessao = (await gravacaoService.getFile()).sessoes.find((s) => s.id === sessaoId);
  if (!sessao) throw new Error('Gravação não encontrada.');
  const csv = formato === 'csv';
  const opcoes = {
    title: 'Exportar marcadores dos takes',
    defaultPath: `${nomeSeguro(sessao.titulo)} - marcadores.${csv ? 'csv' : 'txt'}`,
    filters: [csv ? { name: 'Planilha (CSV)', extensions: ['csv'] } : { name: 'Texto', extensions: ['txt'] }],
  };
  const escolha = janela ? await dialog.showSaveDialog(janela, opcoes) : await dialog.showSaveDialog(opcoes);
  if (escolha.canceled || !escolha.filePath) return { canceled: true };
  // BOM no CSV: sem ele o Excel abre os acentos estragados.
  const conteudo = csv ? String.fromCharCode(0xfeff) + marcadoresEmCsv(sessao) : marcadoresEmTexto(sessao);
  await fs.writeFile(escolha.filePath, conteudo, 'utf-8');
  return { canceled: false, filePath: escolha.filePath };
}

export function registerGravacaoIpc(): void {
  ipcMain.handle(GRAVACAO_CHANNELS.getFile, () => toResult<GravacaoFile>(gravacaoService.getFile()));
  ipcMain.handle(GRAVACAO_CHANNELS.criarGravacao, (_event, input: CriarGravacaoInput) => toResult(gravacaoService.criarGravacao(input ?? {})));
  ipcMain.handle(GRAVACAO_CHANNELS.montarGravacao, (_event, input: CriarGravacaoInput) => toResult<SessaoGravacao>(gravacaoService.montarGravacao(input ?? {})));
  ipcMain.handle(GRAVACAO_CHANNELS.limparSessoes, () => toResult<GravacaoFile>(gravacaoService.limparSessoes()));
  ipcMain.handle(GRAVACAO_CHANNELS.salvarSessao, (_event, sessao: unknown) => toResult<GravacaoFile>(gravacaoService.salvarSessao(sessao)));
  ipcMain.handle(GRAVACAO_CHANNELS.excluirSessao, (_event, sessaoId: string) => toResult<GravacaoFile>(gravacaoService.excluirSessao(String(sessaoId))));
  ipcMain.handle(GRAVACAO_CHANNELS.salvarChecklist, (_event, itens: unknown) => toResult<GravacaoFile>(gravacaoService.salvarChecklist(itens)));
  ipcMain.handle(GRAVACAO_CHANNELS.exportarMarcadores, (event, sessaoId: unknown, formato: unknown) =>
    toResult<FileOpResult>(exportarMarcadores(BrowserWindow.fromWebContents(event.sender), sessaoId, formato)),
  );
  ipcMain.handle(GRAVACAO_CHANNELS.relogio, (_event, forcar: unknown) => toResult<EstadoRelogio>(conferirRelogio(forcar === true)));
  ipcMain.handle(GRAVACAO_CHANNELS.criarConvite, (_event, input: ConviteInput) => toResult(gravacaoService.criarConvite(input)));
  ipcMain.handle(GRAVACAO_CHANNELS.lerConvite, (_event, texto: unknown) => toResult<ConviteLido>(gravacaoService.lerConvite(texto)));
  // Lê a área de transferência aqui e devolve só o convite reconhecido — nunca o texto copiado.
  ipcMain.handle(GRAVACAO_CHANNELS.conviteCopiado, () => toResult<ConviteLido | null>(gravacaoService.conviteNoTexto(clipboard.readText())));
  ipcMain.handle(GRAVACAO_CHANNELS.entrarComConvite, (_event, texto: unknown) => toResult(gravacaoService.entrarComConvite(texto)));
}
