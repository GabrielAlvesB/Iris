import { clipboard, contextBridge, ipcRenderer, shell, type IpcRendererEvent } from 'electron';
import {
  AJUSTES_CHANNELS,
  ATUALIZACAO_CHANNELS,
  COPY_CHANNELS,
  EXPLORADOR_CHANNELS,
  EXPORT_CHANNELS,
  GITHUB_CHANNELS,
  IMAGENS_CHANNELS,
  KANBAN_CHANNELS,
  LINKS_CHANNELS,
  N8N_CHANNELS,
  PENSAMENTOS_CHANNELS,
  PUSH_CHANNEL,
  QUADRO_CHANNELS,
  RELATORIOS_CHANNELS,
  ROTEIROS_CHANNELS,
  TRAFEGO_CHANNELS,
  SERVIDORES_CHANNELS,
  SHEETS_CHANNELS,
  VIDEOS_CHANNELS,
} from '../shared/ipcChannels';
import type {
  IrisEvent,
  IrisEventPayload,
  IrisEventTopic,
  Unsubscribe,
} from '../shared/types/events.types';
import type { IrisApi } from '../shared/types/preload-api.types';

function openExternalLink(url: string): void {
  if (/^https?:\/\//i.test(url)) {
    void shell.openExternal(url);
  }
}

// Vários assinantes lógicos compartilham um único canal físico; sem isto o
// EventEmitter reclama ao passar de 10 listeners.
ipcRenderer.setMaxListeners(64);

/**
 * O contextBridge não consegue devolver a identidade do listener para um
 * removeListener do lado do renderer, então quem cancela é esta closure.
 */
function subscribe<T extends IrisEventTopic>(
  topic: T,
  callback: (payload: IrisEventPayload<T>) => void,
): Unsubscribe {
  const handler = (_event: IpcRendererEvent, incoming: IrisEvent): void => {
    if (!incoming || incoming.topic !== topic) return;
    try {
      callback(incoming.payload as IrisEventPayload<T>);
    } catch (error) {
      // Um listener que lança não pode derrubar os outros assinantes do canal.
      console.error(`[irisAPI.events] listener falhou em "${topic}"`, error);
    }
  };

  ipcRenderer.on(PUSH_CHANNEL, handler);

  let ativo = true;
  return () => {
    if (!ativo) return; // cancelamento idempotente
    ativo = false;
    ipcRenderer.off(PUSH_CHANNEL, handler);
  };
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
    updateBoardName: (boardName) => ipcRenderer.invoke(QUADRO_CHANNELS.updateBoardName, boardName),
  },
  sheets: {
    getFile: () => ipcRenderer.invoke(SHEETS_CHANNELS.getFile),
    detectImport: () => ipcRenderer.invoke(SHEETS_CHANNELS.detectImport),
    commitImport: (input) => ipcRenderer.invoke(SHEETS_CHANNELS.commitImport, input),
    createTable: (input) => ipcRenderer.invoke(SHEETS_CHANNELS.createTable, input),
    renameTable: (input) => ipcRenderer.invoke(SHEETS_CHANNELS.renameTable, input),
    setTableVisibility: (input) => ipcRenderer.invoke(SHEETS_CHANNELS.setTableVisibility, input),
    addColumn: (input) => ipcRenderer.invoke(SHEETS_CHANNELS.addColumn, input),
    updateColumn: (input) => ipcRenderer.invoke(SHEETS_CHANNELS.updateColumn, input),
    deleteColumn: (input) => ipcRenderer.invoke(SHEETS_CHANNELS.deleteColumn, input),
    createRow: (input) => ipcRenderer.invoke(SHEETS_CHANNELS.createRow, input),
    updateRow: (input) => ipcRenderer.invoke(SHEETS_CHANNELS.updateRow, input),
    deleteRow: (input) => ipcRenderer.invoke(SHEETS_CHANNELS.deleteRow, input),
    deleteRows: (input) => ipcRenderer.invoke(SHEETS_CHANNELS.deleteRows, input),
    deleteTable: (input) => ipcRenderer.invoke(SHEETS_CHANNELS.deleteTable, input),
  },
  system: {
    copyToClipboard: (text) => clipboard.writeText(text),
    openExternalLink,
  },
  export: {
    exportAll: () => ipcRenderer.invoke(EXPORT_CHANNELS.exportAll),
    importAll: () => ipcRenderer.invoke(EXPORT_CHANNELS.importAll),
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
  roteiros: {
    getFile: () => ipcRenderer.invoke(ROTEIROS_CHANNELS.getFile),
    criarRoteiro: (input) => ipcRenderer.invoke(ROTEIROS_CHANNELS.criarRoteiro, input),
    atualizarRoteiro: (input) => ipcRenderer.invoke(ROTEIROS_CHANNELS.atualizarRoteiro, input),
    mudarStatus: (input) => ipcRenderer.invoke(ROTEIROS_CHANNELS.mudarStatus, input),
    aprovarRoteiro: (input) => ipcRenderer.invoke(ROTEIROS_CHANNELS.aprovarRoteiro, input),
    excluirRoteiro: (roteiroId) => ipcRenderer.invoke(ROTEIROS_CHANNELS.excluirRoteiro, roteiroId),
    duplicarRoteiro: (roteiroId) => ipcRenderer.invoke(ROTEIROS_CHANNELS.duplicarRoteiro, roteiroId),
    salvarChecklistPadrao: (itens) => ipcRenderer.invoke(ROTEIROS_CHANNELS.salvarChecklistPadrao, itens),
  },
  trafego: {
    getFile: () => ipcRenderer.invoke(TRAFEGO_CHANNELS.getFile),
    salvarConta: (input) => ipcRenderer.invoke(TRAFEGO_CHANNELS.salvarConta, input),
    excluirConta: (contaId) => ipcRenderer.invoke(TRAFEGO_CHANNELS.excluirConta, contaId),
    salvarSite: (input) => ipcRenderer.invoke(TRAFEGO_CHANNELS.salvarSite, input),
    excluirSite: (siteId) => ipcRenderer.invoke(TRAFEGO_CHANNELS.excluirSite, siteId),
    criarCampanha: (input) => ipcRenderer.invoke(TRAFEGO_CHANNELS.criarCampanha, input),
    atualizarCampanha: (input) => ipcRenderer.invoke(TRAFEGO_CHANNELS.atualizarCampanha, input),
    moverCampanha: (input) => ipcRenderer.invoke(TRAFEGO_CHANNELS.moverCampanha, input),
    excluirCampanha: (campanhaId) => ipcRenderer.invoke(TRAFEGO_CHANNELS.excluirCampanha, campanhaId),
    duplicarCampanha: (campanhaId) => ipcRenderer.invoke(TRAFEGO_CHANNELS.duplicarCampanha, campanhaId),
    salvarRegistro: (input) => ipcRenderer.invoke(TRAFEGO_CHANNELS.salvarRegistro, input),
    removerRegistro: (input) => ipcRenderer.invoke(TRAFEGO_CHANNELS.removerRegistro, input),
    importarRegistros: (campanhaId) => ipcRenderer.invoke(TRAFEGO_CHANNELS.importarRegistros, campanhaId),
  },
  pensamentos: {
    getPensamentos: () => ipcRenderer.invoke(PENSAMENTOS_CHANNELS.getPensamentos),
    createPensamento: (input) => ipcRenderer.invoke(PENSAMENTOS_CHANNELS.createPensamento, input),
    updatePensamento: (input) => ipcRenderer.invoke(PENSAMENTOS_CHANNELS.updatePensamento, input),
    deletePensamento: (pensamentoId) =>
      ipcRenderer.invoke(PENSAMENTOS_CHANNELS.deletePensamento, pensamentoId),
    togglePin: (pensamentoId) => ipcRenderer.invoke(PENSAMENTOS_CHANNELS.togglePin, pensamentoId),
    moverPensamento: (input) => ipcRenderer.invoke(PENSAMENTOS_CHANNELS.moverPensamento, input),
    setViewport: (viewport) => ipcRenderer.invoke(PENSAMENTOS_CHANNELS.setViewport, viewport),
  },
  explorador: {
    getRaizes: () => ipcRenderer.invoke(EXPLORADOR_CHANNELS.getRaizes),
    adicionarRaiz: () => ipcRenderer.invoke(EXPLORADOR_CHANNELS.adicionarRaiz),
    removerRaiz: (raizId) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.removerRaiz, raizId),
    listarDiretorio: (input) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.listarDiretorio, input),
    criar: (input) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.criar, input),
    renomear: (input) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.renomear, input),
    mover: (input) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.mover, input),
    excluir: (input) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.excluir, input),
    revelarNoSistema: (caminho) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.revelarNoSistema, caminho),
    abrirNoSistema: (caminho) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.abrirNoSistema, caminho),
    getBiblioteca: () => ipcRenderer.invoke(EXPLORADOR_CHANNELS.getBiblioteca),
    adicionarRecurso: (input) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.adicionarRecurso, input),
    adicionarRecursosPorDialogo: (colecaoId) =>
      ipcRenderer.invoke(EXPLORADOR_CHANNELS.adicionarRecursosPorDialogo, colecaoId),
    atualizarRecurso: (input) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.atualizarRecurso, input),
    removerRecurso: (recursoId) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.removerRecurso, recursoId),
    salvarColecao: (input) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.salvarColecao, input),
    excluirColecao: (colecaoId) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.excluirColecao, colecaoId),
    limparRecentes: () => ipcRenderer.invoke(EXPLORADOR_CHANNELS.limparRecentes),
    buscar: (input) => ipcRenderer.invoke(EXPLORADOR_CHANNELS.buscar, input),
  },
  servidores: {
    getState: () => ipcRenderer.invoke(SERVIDORES_CHANNELS.getState),
    criarHttp: (input) => ipcRenderer.invoke(SERVIDORES_CHANNELS.criarHttp, input),
    criarSsh: (input) => ipcRenderer.invoke(SERVIDORES_CHANNELS.criarSsh, input),
    atualizar: (input) => ipcRenderer.invoke(SERVIDORES_CHANNELS.atualizar, input),
    remover: (servidorId) => ipcRenderer.invoke(SERVIDORES_CHANNELS.remover, servidorId),
    checarAgora: (servidorId) => ipcRenderer.invoke(SERVIDORES_CHANNELS.checarAgora, servidorId),
    checarTodos: () => ipcRenderer.invoke(SERVIDORES_CHANNELS.checarTodos),
    salvarComando: (input) => ipcRenderer.invoke(SERVIDORES_CHANNELS.salvarComando, input),
    removerComando: (input) => ipcRenderer.invoke(SERVIDORES_CHANNELS.removerComando, input),
    rodarComando: (input) => ipcRenderer.invoke(SERVIDORES_CHANNELS.rodarComando, input),
    configHealth: (input) => ipcRenderer.invoke(SERVIDORES_CHANNELS.configHealth, input),
    escolherChave: () => ipcRenderer.invoke(SERVIDORES_CHANNELS.escolherChave),
  },
  n8n: {
    getConfig: () => ipcRenderer.invoke(N8N_CHANNELS.getConfig),
    salvarConfig: (input) => ipcRenderer.invoke(N8N_CHANNELS.salvarConfig, input),
    getSnapshot: () => ipcRenderer.invoke(N8N_CHANNELS.getSnapshot),
    atualizarAgora: () => ipcRenderer.invoke(N8N_CHANNELS.atualizarAgora),
    testarConexao: () => ipcRenderer.invoke(N8N_CHANNELS.testarConexao),
    dispararWorkflow: (input) => ipcRenderer.invoke(N8N_CHANNELS.dispararWorkflow, input),
    alternarAtivo: (input) => ipcRenderer.invoke(N8N_CHANNELS.alternarAtivo, input),
    definirVinculo: (input) => ipcRenderer.invoke(N8N_CHANNELS.definirVinculo, input),
    abrirExecucao: (execucaoId) => ipcRenderer.invoke(N8N_CHANNELS.abrirExecucao, execucaoId),
  },
  github: {
    getConfig: () => ipcRenderer.invoke(GITHUB_CHANNELS.getConfig),
    salvarConfig: (input) => ipcRenderer.invoke(GITHUB_CHANNELS.salvarConfig, input),
    getSnapshot: () => ipcRenderer.invoke(GITHUB_CHANNELS.getSnapshot),
    atualizarAgora: () => ipcRenderer.invoke(GITHUB_CHANNELS.atualizarAgora),
    testarConexao: () => ipcRenderer.invoke(GITHUB_CHANNELS.testarConexao),
    adicionarPasta: () => ipcRenderer.invoke(GITHUB_CHANNELS.adicionarPasta),
    removerPasta: (pastaId) => ipcRenderer.invoke(GITHUB_CHANNELS.removerPasta, pastaId),
    abrirRepo: (url) => ipcRenderer.invoke(GITHUB_CHANNELS.abrirRepo, url),
  },
  ajustes: {
    getAjustes: () => ipcRenderer.invoke(AJUSTES_CHANNELS.getAjustes),
    setModuloInicial: (modulo) => ipcRenderer.invoke(AJUSTES_CHANNELS.setModuloInicial, modulo),
    setAssinatura: (assinatura) => ipcRenderer.invoke(AJUSTES_CHANNELS.setAssinatura, assinatura),
  },
  videos: {
    getFile: () => ipcRenderer.invoke(VIDEOS_CHANNELS.getFile),
    criarVideo: (input) => ipcRenderer.invoke(VIDEOS_CHANNELS.criarVideo, input),
    atualizarVideo: (input) => ipcRenderer.invoke(VIDEOS_CHANNELS.atualizarVideo, input),
    moverVideo: (input) => ipcRenderer.invoke(VIDEOS_CHANNELS.moverVideo, input),
    arquivarVideo: (input) => ipcRenderer.invoke(VIDEOS_CHANNELS.arquivarVideo, input),
    restaurarVideo: (videoId) => ipcRenderer.invoke(VIDEOS_CHANNELS.restaurarVideo, videoId),
    excluirVideo: (videoId) => ipcRenderer.invoke(VIDEOS_CHANNELS.excluirVideo, videoId),
    salvarTag: (input) => ipcRenderer.invoke(VIDEOS_CHANNELS.salvarTag, input),
    excluirTag: (tagId) => ipcRenderer.invoke(VIDEOS_CHANNELS.excluirTag, tagId),
    salvarRede: (input) => ipcRenderer.invoke(VIDEOS_CHANNELS.salvarRede, input),
    excluirRede: (redeId) => ipcRenderer.invoke(VIDEOS_CHANNELS.excluirRede, redeId),
    importarDeSheets: (input) => ipcRenderer.invoke(VIDEOS_CHANNELS.importarDeSheets, input),
    listarLinhasImportadas: (tabelaId) => ipcRenderer.invoke(VIDEOS_CHANNELS.listarLinhasImportadas, tabelaId),
    salvarPreferencias: (preferencias) => ipcRenderer.invoke(VIDEOS_CHANNELS.salvarPreferencias, preferencias),
  },
  imagens: {
    getFile: () => ipcRenderer.invoke(IMAGENS_CHANNELS.getFile),
    criarImagem: (input) => ipcRenderer.invoke(IMAGENS_CHANNELS.criarImagem, input),
    atualizarImagem: (input) => ipcRenderer.invoke(IMAGENS_CHANNELS.atualizarImagem, input),
    moverImagem: (input) => ipcRenderer.invoke(IMAGENS_CHANNELS.moverImagem, input),
    arquivarImagem: (input) => ipcRenderer.invoke(IMAGENS_CHANNELS.arquivarImagem, input),
    restaurarImagem: (imagemId) => ipcRenderer.invoke(IMAGENS_CHANNELS.restaurarImagem, imagemId),
    excluirImagem: (imagemId) => ipcRenderer.invoke(IMAGENS_CHANNELS.excluirImagem, imagemId),
  },
  relatorios: {
    getFile: () => ipcRenderer.invoke(RELATORIOS_CHANNELS.getFile),
    criarRelatorio: (input) => ipcRenderer.invoke(RELATORIOS_CHANNELS.criarRelatorio, input),
    salvarRelatorio: (relatorio) => ipcRenderer.invoke(RELATORIOS_CHANNELS.salvarRelatorio, relatorio),
    duplicarRelatorio: (relatorioId) => ipcRenderer.invoke(RELATORIOS_CHANNELS.duplicarRelatorio, relatorioId),
    excluirRelatorio: (relatorioId) => ipcRenderer.invoke(RELATORIOS_CHANNELS.excluirRelatorio, relatorioId),
    salvarCategorias: (input) => ipcRenderer.invoke(RELATORIOS_CHANNELS.salvarCategorias, input),
    exportarPdf: (input) => ipcRenderer.invoke(RELATORIOS_CHANNELS.exportarPdf, input),
    abrirPdf: (filePath) => ipcRenderer.invoke(RELATORIOS_CHANNELS.abrirPdf, filePath),
  },
  atualizacao: {
    getEstado: () => ipcRenderer.invoke(ATUALIZACAO_CHANNELS.getEstado),
    verificar: () => ipcRenderer.invoke(ATUALIZACAO_CHANNELS.verificar),
    atualizar: () => ipcRenderer.invoke(ATUALIZACAO_CHANNELS.atualizar),
    abrirPagina: () => ipcRenderer.invoke(ATUALIZACAO_CHANNELS.abrirPagina),
  },
  events: {
    on: subscribe,
  },
};

contextBridge.exposeInMainWorld('irisAPI', irisAPI);
