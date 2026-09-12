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

export const ARQUIVOS_CHANNELS = {
  getItems: 'arquivos:getItems',
  importFiles: 'arquivos:importFiles',
  toggleDone: 'arquivos:toggleDone',
  toggleVerified: 'arquivos:toggleVerified',
  updateNote: 'arquivos:updateNote',
  deleteItem: 'arquivos:deleteItem',
  linkFileToCard: 'arquivos:linkFileToCard',
} as const;

export const AGENDA_CHANNELS = {
  getItems: 'agenda:getItems',
  createItem: 'agenda:createItem',
  updateItem: 'agenda:updateItem',
  deleteItem: 'agenda:deleteItem',
  importSpreadsheet: 'agenda:importSpreadsheet',
} as const;

export const EXPORT_CHANNELS = {
  exportAll: 'export:exportAll',
  importAll: 'export:importAll',
  exportAgendaCsv: 'export:exportAgendaCsv',
  exportArquivosCsv: 'export:exportArquivosCsv',
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

export const MARKDOWN_CHANNELS = {
  getConfig: 'markdown:getConfig',
  chooseFolder: 'markdown:chooseFolder',
  openFile: 'markdown:openFile',
  listFiles: 'markdown:listFiles',
  readFile: 'markdown:readFile',
  writeFile: 'markdown:writeFile',
  createFile: 'markdown:createFile',
  linkFileToCard: 'markdown:linkFileToCard',
  exportPdf: 'markdown:exportPdf',
} as const;
