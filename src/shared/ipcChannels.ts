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

export const CONTATOS_CHANNELS = {
  getFile: 'contatos:getFile',
  salvarPessoa: 'contatos:salvarPessoa',
  salvarEmpresa: 'contatos:salvarEmpresa',
  excluirContato: 'contatos:excluirContato',
  arquivarContato: 'contatos:arquivarContato',
  moverNoFunil: 'contatos:moverNoFunil',
  salvarEtapas: 'contatos:salvarEtapas',
  registrarInteracao: 'contatos:registrarInteracao',
  editarInteracao: 'contatos:editarInteracao',
  excluirInteracao: 'contatos:excluirInteracao',
  salvarModelo: 'contatos:salvarModelo',
  duplicarModelo: 'contatos:duplicarModelo',
  excluirModelo: 'contatos:excluirModelo',
  criarContrato: 'contatos:criarContrato',
  atualizarContrato: 'contatos:atualizarContrato',
  duplicarContrato: 'contatos:duplicarContrato',
  excluirContrato: 'contatos:excluirContrato',
  exportarPdf: 'contatos:exportarPdf',
  // Leads por API
  leadsStatus: 'contatos:leadsStatus',
  salvarLeadsConfig: 'contatos:salvarLeadsConfig',
  gerarChaveFormulario: 'contatos:gerarChaveFormulario',
  gerarChaveIris: 'contatos:gerarChaveIris',
  definirChaveIris: 'contatos:definirChaveIris',
  copiarChaveIris: 'contatos:copiarChaveIris',
  testarNuvem: 'contatos:testarNuvem',
  buscarAgora: 'contatos:buscarAgora',
  enviarTeste: 'contatos:enviarTeste',
  marcarVisto: 'contatos:marcarVisto',
  descartarLead: 'contatos:descartarLead',
  repontuar: 'contatos:repontuar',
  contarNaoVistos: 'contatos:contarNaoVistos',
  salvarRelatorioLeads: 'contatos:salvarRelatorioLeads',
  excluirRelatorioLeads: 'contatos:excluirRelatorioLeads',
  criarFluxoN8n: 'contatos:criarFluxoN8n',
  testarFluxoN8n: 'contatos:testarFluxoN8n',
} as const;

export const WHATSAPP_CHANNELS = {
  getFile: 'whatsapp:getFile',
  status: 'whatsapp:status',
  salvarConfig: 'whatsapp:salvarConfig',
  definirSegredo: 'whatsapp:definirSegredo',
  removerCredenciais: 'whatsapp:removerCredenciais',
  gerarChaveWebhook: 'whatsapp:gerarChaveWebhook',
  copiarChaveWebhook: 'whatsapp:copiarChaveWebhook',
  enderecos: 'whatsapp:enderecos',
  copiarEndereco: 'whatsapp:copiarEndereco',
  configurarWebhook: 'whatsapp:configurarWebhook',
  testar: 'whatsapp:testar',
  conferirNumero: 'whatsapp:conferirNumero',
  listarTemplates: 'whatsapp:listarTemplates',
  enviar: 'whatsapp:enviar',
  reenviar: 'whatsapp:reenviar',
  sincronizarConversa: 'whatsapp:sincronizarConversa',
  marcarLidas: 'whatsapp:marcarLidas',
  ligarNumero: 'whatsapp:ligarNumero',
  excluirMensagem: 'whatsapp:excluirMensagem',
  salvarModelo: 'whatsapp:salvarModelo',
  excluirModelo: 'whatsapp:excluirModelo',
  criarLote: 'whatsapp:criarLote',
  mudarLote: 'whatsapp:mudarLote',
  previaFluxoN8n: 'whatsapp:previaFluxoN8n',
  copiarFluxoN8n: 'whatsapp:copiarFluxoN8n',
  criarFluxoN8n: 'whatsapp:criarFluxoN8n',
} as const;

/** O que vale para qualquer documento do app (PDF de relatório, ficha, contrato). */
export const DOCUMENTOS_CHANNELS = {
  abrirPdf: 'documentos:abrirPdf',
} as const;

export const EXPORT_CHANNELS = {
  resumo: 'export:resumo',
  exportar: 'export:exportar',
  escolherImportacao: 'export:escolherImportacao',
  aplicarImportacao: 'export:aplicarImportacao',
  cancelarImportacao: 'export:cancelarImportacao',
  ultimaCopia: 'export:ultimaCopia',
  desfazerImportacao: 'export:desfazerImportacao',
  abrirPastaDeCopias: 'export:abrirPastaDeCopias',
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

/** Do próprio app, fora de qualquer módulo. */
export const APP_CHANNELS = {
  primeiraTela: 'app:primeiraTela',
} as const;

export const AJUSTES_CHANNELS = {
  getAjustes: 'ajustes:getAjustes',
  setModuloInicial: 'ajustes:setModuloInicial',
  setAssinatura: 'ajustes:setAssinatura',
  setPerfil: 'ajustes:setPerfil',
  setAtalhos: 'ajustes:setAtalhos',
  setTema: 'ajustes:setTema',
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
  salvarVersao: 'roteiros:salvarVersao',
  restaurarVersao: 'roteiros:restaurarVersao',
  criarAdaptacao: 'roteiros:criarAdaptacao',
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

export const IA_CHANNELS = {
  getConfig: 'ia:getConfig',
  salvarProvedor: 'ia:salvarProvedor',
  salvarPadroes: 'ia:salvarPadroes',
  testarProvedor: 'ia:testarProvedor',
  listarModelos: 'ia:listarModelos',
  gerarTexto: 'ia:gerarTexto',
  referenciasDoComputador: 'ia:referenciasDoComputador',
  descreverReferencia: 'ia:descreverReferencia',
  gerarImagem: 'ia:gerarImagem',
  cancelarTarefa: 'ia:cancelarTarefa',
  listarTarefas: 'ia:listarTarefas',
  dispensarTarefa: 'ia:dispensarTarefa',
  limparTarefas: 'ia:limparTarefas',
  listarGaleria: 'ia:listarGaleria',
  abrirImagem: 'ia:abrirImagem',
  excluirImagem: 'ia:excluirImagem',
  exportarImagem: 'ia:exportarImagem',
  salvarNaBiblioteca: 'ia:salvarNaBiblioteca',
  vincularPostagem: 'ia:vincularPostagem',
} as const;

export const TODO_CHANNELS = {
  getFile: 'todo:getFile',
  criarChecklist: 'todo:criarChecklist',
  atualizarChecklist: 'todo:atualizarChecklist',
  excluirChecklist: 'todo:excluirChecklist',
  duplicarChecklist: 'todo:duplicarChecklist',
  arquivarChecklist: 'todo:arquivarChecklist',
  reordenarChecklists: 'todo:reordenarChecklists',
  adicionarItens: 'todo:adicionarItens',
  atualizarItem: 'todo:atualizarItem',
  removerItem: 'todo:removerItem',
  reordenarItens: 'todo:reordenarItens',
  marcarTodos: 'todo:marcarTodos',
  limparConcluidos: 'todo:limparConcluidos',
  enviarAoKanban: 'todo:enviarAoKanban',
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
  salvarEscala: 'videos:salvarEscala',
  excluirEscala: 'videos:excluirEscala',
  definirEscalaPadrao: 'videos:definirEscalaPadrao',
  salvarRede: 'videos:salvarRede',
  excluirRede: 'videos:excluirRede',
  importarDeSheets: 'videos:importarDeSheets',
  listarLinhasImportadas: 'videos:listarLinhasImportadas',
  salvarPreferencias: 'videos:salvarPreferencias',
} as const;

export const ANEXOS_CHANNELS = {
  escolher: 'anexos:escolher',
  info: 'anexos:info',
  abrir: 'anexos:abrir',
  revelar: 'anexos:revelar',
  exportar: 'anexos:exportar',
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
} as const;

export const ATUALIZACAO_CHANNELS = {
  getEstado: 'atualizacao:getEstado',
  verificar: 'atualizacao:verificar',
  atualizar: 'atualizacao:atualizar',
  abrirPagina: 'atualizacao:abrirPagina',
  listarVersoes: 'atualizacao:listarVersoes',
  instalarVersao: 'atualizacao:instalarVersao',
  escolherInstalador: 'atualizacao:escolherInstalador',
  instalarArquivo: 'atualizacao:instalarArquivo',
} as const;
