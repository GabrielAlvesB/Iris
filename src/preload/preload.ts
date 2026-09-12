import { clipboard, contextBridge, ipcRenderer, shell } from 'electron';
import {
  AGENDA_CHANNELS,
  ARQUIVOS_CHANNELS,
  COPY_CHANNELS,
  EXPORT_CHANNELS,
  KANBAN_CHANNELS,
  LINKS_CHANNELS,
  MARKDOWN_CHANNELS,
  QUADRO_CHANNELS,
} from '../shared/ipcChannels';
import type { IrisApi } from '../shared/types/preload-api.types';

function openExternalLink(url: string): void {
  if (/^https?:\/\//i.test(url)) {
    void shell.openExternal(url);
  }
}

const irisAPI: IrisApi = {
  kanban: {
    getBoard: () => ipcRenderer.invoke(KANBAN_CHANNELS.getBoard),
    createColumn: (input) => ipcRenderer.invoke(KANBAN_CHANNELS.createColumn, input),
    renameColumn: (input) => ipcRenderer.invoke(KANBAN_CHANNELS.renameColumn, input),
    reorderColumns: (input) => ipcRenderer.invoke(KANBAN_CHANNELS.reorderColumns, input),
    deleteColumn: (columnId) => ipcRenderer.invoke(KANBAN_CHANNELS.deleteColumn, columnId),
    createCard: (input) => ipcRenderer.invoke(KANBAN_CHANNELS.createCard, input),
    updateCard: (input) => ipcRenderer.invoke(KANBAN_CHANNELS.updateCard, input),
    deleteCard: (cardId) => ipcRenderer.invoke(KANBAN_CHANNELS.deleteCard, cardId),
    moveCard: (input) => ipcRenderer.invoke(KANBAN_CHANNELS.moveCard, input),
  },
  quadro: {
    getState: () => ipcRenderer.invoke(QUADRO_CHANNELS.getState),
    createBlock: (input) => ipcRenderer.invoke(QUADRO_CHANNELS.createBlock, input),
    updateBlock: (input) => ipcRenderer.invoke(QUADRO_CHANNELS.updateBlock, input),
    moveBlock: (input) => ipcRenderer.invoke(QUADRO_CHANNELS.moveBlock, input),
    deleteBlock: (blockId) => ipcRenderer.invoke(QUADRO_CHANNELS.deleteBlock, blockId),
    createConnection: (input) => ipcRenderer.invoke(QUADRO_CHANNELS.createConnection, input),
    deleteConnection: (connectionId) => ipcRenderer.invoke(QUADRO_CHANNELS.deleteConnection, connectionId),
    updateViewport: (viewport) => ipcRenderer.invoke(QUADRO_CHANNELS.updateViewport, viewport),
  },
  arquivos: {
    getItems: () => ipcRenderer.invoke(ARQUIVOS_CHANNELS.getItems),
    importFiles: () => ipcRenderer.invoke(ARQUIVOS_CHANNELS.importFiles),
    toggleDone: (itemId) => ipcRenderer.invoke(ARQUIVOS_CHANNELS.toggleDone, itemId),
    toggleVerified: (itemId) => ipcRenderer.invoke(ARQUIVOS_CHANNELS.toggleVerified, itemId),
    updateNote: (input) => ipcRenderer.invoke(ARQUIVOS_CHANNELS.updateNote, input),
    deleteItem: (itemId) => ipcRenderer.invoke(ARQUIVOS_CHANNELS.deleteItem, itemId),
    linkFileToCard: (input) => ipcRenderer.invoke(ARQUIVOS_CHANNELS.linkFileToCard, input),
  },
  agenda: {
    getItems: () => ipcRenderer.invoke(AGENDA_CHANNELS.getItems),
    createItem: (input) => ipcRenderer.invoke(AGENDA_CHANNELS.createItem, input),
    updateItem: (input) => ipcRenderer.invoke(AGENDA_CHANNELS.updateItem, input),
    deleteItem: (itemId) => ipcRenderer.invoke(AGENDA_CHANNELS.deleteItem, itemId),
    importSpreadsheet: () => ipcRenderer.invoke(AGENDA_CHANNELS.importSpreadsheet),
  },
  system: {
    copyToClipboard: (text) => clipboard.writeText(text),
    openExternalLink,
  },
  export: {
    exportAll: () => ipcRenderer.invoke(EXPORT_CHANNELS.exportAll),
    importAll: () => ipcRenderer.invoke(EXPORT_CHANNELS.importAll),
    exportAgendaCsv: () => ipcRenderer.invoke(EXPORT_CHANNELS.exportAgendaCsv),
    exportArquivosCsv: () => ipcRenderer.invoke(EXPORT_CHANNELS.exportArquivosCsv),
  },
  links: {
    getLinks: () => ipcRenderer.invoke(LINKS_CHANNELS.getLinks),
    createLink: (input) => ipcRenderer.invoke(LINKS_CHANNELS.createLink, input),
    updateLink: (input) => ipcRenderer.invoke(LINKS_CHANNELS.updateLink, input),
    deleteLink: (linkId) => ipcRenderer.invoke(LINKS_CHANNELS.deleteLink, linkId),
    reorderLinks: (orderedLinkIds) => ipcRenderer.invoke(LINKS_CHANNELS.reorderLinks, orderedLinkIds),
  },
  copy: {
    getSnippets: () => ipcRenderer.invoke(COPY_CHANNELS.getSnippets),
    createSnippet: (input) => ipcRenderer.invoke(COPY_CHANNELS.createSnippet, input),
    updateSnippet: (input) => ipcRenderer.invoke(COPY_CHANNELS.updateSnippet, input),
    deleteSnippet: (snippetId) => ipcRenderer.invoke(COPY_CHANNELS.deleteSnippet, snippetId),
    importTxt: () => ipcRenderer.invoke(COPY_CHANNELS.importTxt),
  },
  markdown: {
    getConfig: () => ipcRenderer.invoke(MARKDOWN_CHANNELS.getConfig),
    chooseFolder: () => ipcRenderer.invoke(MARKDOWN_CHANNELS.chooseFolder),
    openFile: () => ipcRenderer.invoke(MARKDOWN_CHANNELS.openFile),
    listFiles: () => ipcRenderer.invoke(MARKDOWN_CHANNELS.listFiles),
    readFile: (filePath) => ipcRenderer.invoke(MARKDOWN_CHANNELS.readFile, filePath),
    writeFile: (input) => ipcRenderer.invoke(MARKDOWN_CHANNELS.writeFile, input),
    createFile: (input) => ipcRenderer.invoke(MARKDOWN_CHANNELS.createFile, input),
    linkFileToCard: (input) => ipcRenderer.invoke(MARKDOWN_CHANNELS.linkFileToCard, input),
    exportPdf: (input) => ipcRenderer.invoke(MARKDOWN_CHANNELS.exportPdf, input),
  },
};

contextBridge.exposeInMainWorld('irisAPI', irisAPI);
