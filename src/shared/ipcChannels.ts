export const KANBAN_CHANNELS = {
  getBoard: 'kanban:getBoard',
  createColumn: 'kanban:createColumn',
  renameColumn: 'kanban:renameColumn',
  reorderColumns: 'kanban:reorderColumns',
  deleteColumn: 'kanban:deleteColumn',
  createCard: 'kanban:createCard',
  updateCard: 'kanban:updateCard',
  deleteCard: 'kanban:deleteCard',
  moveCard: 'kanban:moveCard',
} as const;

export const QUADRO_CHANNELS = {
  getState: 'quadro:getState',
  createBlock: 'quadro:createBlock',
  updateBlock: 'quadro:updateBlock',
  moveBlock: 'quadro:moveBlock',
  deleteBlock: 'quadro:deleteBlock',
  createConnection: 'quadro:createConnection',
  deleteConnection: 'quadro:deleteConnection',
  updateViewport: 'quadro:updateViewport',
  updateBoardName: 'quadro:updateBoardName',
} as const;

export const SHEETS_CHANNELS = {
  getFile: 'sheets:getFile',
  detectImport: 'sheets:detectImport',
  commitImport: 'sheets:commitImport',
  createTable: 'sheets:createTable',
  renameTable: 'sheets:renameTable',
  setTableVisibility: 'sheets:setTableVisibility',
  addColumn: 'sheets:addColumn',
  updateColumn: 'sheets:updateColumn',
  deleteColumn: 'sheets:deleteColumn',
  createRow: 'sheets:createRow',
  updateRow: 'sheets:updateRow',
  deleteRow: 'sheets:deleteRow',
  deleteRows: 'sheets:deleteRows',
  deleteTable: 'sheets:deleteTable',
} as const;

export const EXPORT_CHANNELS = {
  exportAll: 'export:exportAll',
  importAll: 'export:importAll',
} as const;

export const LINKS_CHANNELS = {
  getLinks: 'links:getLinks',
  createLink: 'links:createLink',
  updateLink: 'links:updateLink',
  deleteLink: 'links:deleteLink',
  reorderLinks: 'links:reorderLinks',
} as const;

export const COPY_CHANNELS = {
  getSnippets: 'copy:getSnippets',
  createSnippet: 'copy:createSnippet',
  updateSnippet: 'copy:updateSnippet',
  deleteSnippet: 'copy:deleteSnippet',
  importTxt: 'copy:importTxt',
} as const;

/** Canal físico único de push main→renderer; os tópicos vivem em events.types.ts. */
export const PUSH_CHANNEL = 'iris:event';

export const EXPLORADOR_CHANNELS = {
  getRaizes: 'explorador:getRaizes',
  adicionarRaiz: 'explorador:adicionarRaiz',
  removerRaiz: 'explorador:removerRaiz',
  listarDiretorio: 'explorador:listarDiretorio',
  criar: 'explorador:criar',
  renomear: 'explorador:renomear',
  mover: 'explorador:mover',
  excluir: 'explorador:excluir',
  revelarNoSistema: 'explorador:revelarNoSistema',
  abrirNoSistema: 'explorador:abrirNoSistema',
  getBiblioteca: 'explorador:getBiblioteca',
  adicionarRecurso: 'explorador:adicionarRecurso',
  adicionarRecursosPorDialogo: 'explorador:adicionarRecursosPorDialogo',
  atualizarRecurso: 'explorador:atualizarRecurso',
  removerRecurso: 'explorador:removerRecurso',
  salvarColecao: 'explorador:salvarColecao',
  excluirColecao: 'explorador:excluirColecao',
  limparRecentes: 'explorador:limparRecentes',
  buscar: 'explorador:buscar',
} as const;

export const SERVIDORES_CHANNELS = {
  getState: 'servidores:getState',
  criarHttp: 'servidores:criarHttp',
  criarSsh: 'servidores:criarSsh',
  atualizar: 'servidores:atualizar',
  remover: 'servidores:remover',
  checarAgora: 'servidores:checarAgora',
  checarTodos: 'servidores:checarTodos',
  salvarComando: 'servidores:salvarComando',
  removerComando: 'servidores:removerComando',
  rodarComando: 'servidores:rodarComando',
  configHealth: 'servidores:configHealth',
  escolherChave: 'servidores:escolherChave',
} as const;

export const N8N_CHANNELS = {
  getConfig: 'n8n:getConfig',
  salvarConfig: 'n8n:salvarConfig',
  getSnapshot: 'n8n:getSnapshot',
  atualizarAgora: 'n8n:atualizarAgora',
  testarConexao: 'n8n:testarConexao',
  dispararWorkflow: 'n8n:dispararWorkflow',
  alternarAtivo: 'n8n:alternarAtivo',
  definirVinculo: 'n8n:definirVinculo',
  abrirExecucao: 'n8n:abrirExecucao',
} as const;

export const GITHUB_CHANNELS = {
  getConfig: 'github:getConfig',
  salvarConfig: 'github:salvarConfig',
  getSnapshot: 'github:getSnapshot',
  atualizarAgora: 'github:atualizarAgora',
  testarConexao: 'github:testarConexao',
  adicionarPasta: 'github:adicionarPasta',
  removerPasta: 'github:removerPasta',
  abrirRepo: 'github:abrirRepo',
} as const;

export const AJUSTES_CHANNELS = {
  getAjustes: 'ajustes:getAjustes',
  setModuloInicial: 'ajustes:setModuloInicial',
  setAssinatura: 'ajustes:setAssinatura',
} as const;

export const ROTEIROS_CHANNELS = {
  getFile: 'roteiros:getFile',
  criarRoteiro: 'roteiros:criarRoteiro',
  atualizarRoteiro: 'roteiros:atualizarRoteiro',
  mudarStatus: 'roteiros:mudarStatus',
  aprovarRoteiro: 'roteiros:aprovarRoteiro',
  excluirRoteiro: 'roteiros:excluirRoteiro',
  duplicarRoteiro: 'roteiros:duplicarRoteiro',
  salvarChecklistPadrao: 'roteiros:salvarChecklistPadrao',
} as const;

export const TRAFEGO_CHANNELS = {
  getFile: 'trafego:getFile',
  salvarConta: 'trafego:salvarConta',
  excluirConta: 'trafego:excluirConta',
  salvarSite: 'trafego:salvarSite',
  excluirSite: 'trafego:excluirSite',
  criarCampanha: 'trafego:criarCampanha',
  atualizarCampanha: 'trafego:atualizarCampanha',
  moverCampanha: 'trafego:moverCampanha',
  excluirCampanha: 'trafego:excluirCampanha',
  duplicarCampanha: 'trafego:duplicarCampanha',
  salvarRegistro: 'trafego:salvarRegistro',
  removerRegistro: 'trafego:removerRegistro',
  importarRegistros: 'trafego:importarRegistros',
} as const;

export const PENSAMENTOS_CHANNELS = {
  getPensamentos: 'pensamentos:getPensamentos',
  createPensamento: 'pensamentos:createPensamento',
  updatePensamento: 'pensamentos:updatePensamento',
  deletePensamento: 'pensamentos:deletePensamento',
  togglePin: 'pensamentos:togglePin',
  moverPensamento: 'pensamentos:moverPensamento',
  setViewport: 'pensamentos:setViewport',
} as const;


export const VIDEOS_CHANNELS = {
  getFile: 'videos:getFile',
  criarVideo: 'videos:criarVideo',
  atualizarVideo: 'videos:atualizarVideo',
  moverVideo: 'videos:moverVideo',
  arquivarVideo: 'videos:arquivarVideo',
  restaurarVideo: 'videos:restaurarVideo',
  excluirVideo: 'videos:excluirVideo',
  salvarTag: 'videos:salvarTag',
  excluirTag: 'videos:excluirTag',
  salvarRede: 'videos:salvarRede',
  excluirRede: 'videos:excluirRede',
  importarDeSheets: 'videos:importarDeSheets',
  listarLinhasImportadas: 'videos:listarLinhasImportadas',
  salvarPreferencias: 'videos:salvarPreferencias',
} as const;

export const IMAGENS_CHANNELS = {
  getFile: 'imagens:getFile',
  criarImagem: 'imagens:criarImagem',
  atualizarImagem: 'imagens:atualizarImagem',
  moverImagem: 'imagens:moverImagem',
  arquivarImagem: 'imagens:arquivarImagem',
  restaurarImagem: 'imagens:restaurarImagem',
  excluirImagem: 'imagens:excluirImagem',
} as const;

export const RELATORIOS_CHANNELS = {
  getFile: 'relatorios:getFile',
  criarRelatorio: 'relatorios:criarRelatorio',
  salvarRelatorio: 'relatorios:salvarRelatorio',
  duplicarRelatorio: 'relatorios:duplicarRelatorio',
  excluirRelatorio: 'relatorios:excluirRelatorio',
  salvarCategorias: 'relatorios:salvarCategorias',
  exportarPdf: 'relatorios:exportarPdf',
  abrirPdf: 'relatorios:abrirPdf',
} as const;

export const ATUALIZACAO_CHANNELS = {
  getEstado: 'atualizacao:getEstado',
  verificar: 'atualizacao:verificar',
  atualizar: 'atualizacao:atualizar',
  abrirPagina: 'atualizacao:abrirPagina',
} as const;
