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
} as const;

export const PENSAMENTOS_CHANNELS = {
  getPensamentos: 'pensamentos:getPensamentos',
  createPensamento: 'pensamentos:createPensamento',
  updatePensamento: 'pensamentos:updatePensamento',
  deletePensamento: 'pensamentos:deletePensamento',
  togglePin: 'pensamentos:togglePin',
  marcarPromovido: 'pensamentos:marcarPromovido',
} as const;

