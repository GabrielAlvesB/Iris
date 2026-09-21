import type { IpcResult } from './common.types';
import type {
  CreateCardInput,
  CreateColumnInput,
  KanbanBoard,
  MoveCardInput,
  RenameColumnInput,
  ReorderColumnsInput,
  UpdateCardInput,
} from './kanban.types';
import type {
  CreateBlockInput,
  CreateConnectionInput,
  MoveBlockInput,
  QuadroFile,
  QuadroViewport,
  UpdateBlockInput,
} from './quadro.types';
import type {
  CriarInput,
  ExcluirInput,
  ExploradorFile,
  ExploradorListagem,
  ListarDiretorioInput,
  MoverInput,
  RenomearInput,
} from './explorador.types';
import type {
  AtualizarServidorInput,
  ConfigHealthInput,
  CriarServidorHttpInput,
  CriarServidorSshInput,
  RemoverComandoInput,
  RodarComandoInput,
  SalvarComandoInput,
  ServidoresFile,
} from './servidores.types';
import type {
  DefinirVinculoInput,
  DispararWorkflowInput,
  DispararWorkflowResult,
  N8nConfig,
  N8nFile,
  N8nSnapshot,
  SalvarN8nConfigInput,
} from './n8n.types';
import type {
  GithubConfig,
  GithubSnapshot,
  SalvarGithubConfigInput,
} from './github.types';
import type { AjustesInfo, ModuloInicial } from './ajustes.types';
import type { IrisEventPayload, IrisEventTopic, Unsubscribe } from './events.types';
import type {
  AddColumnInput,
  CommitImportInput,
  CommitImportResult,
  CreateRowInput,
  CreateTableInput,
  DeleteColumnInput,
  DeleteRowInput,
  DeleteRowsInput,
  DeleteTableInput,
  DetectImportResult,
  RenameTableInput,
  SheetsFile,
  UpdateColumnInput,
  UpdateRowInput,
  UpdateTableVisibilityInput,
} from './sheets.types';
import type { FileOpResult } from './export.types';
import type { CreateLinkInput, LinksFile, UpdateLinkInput } from './links.types';
import type { CopyFile, CreateSnippetInput, ImportTxtResult, UpdateSnippetInput } from './copy.types';
import type {
  CreatePensamentoInput,
  MarcarPromovidoInput,
  PensamentosFile,
  UpdatePensamentoInput,
} from './pensamentos.types';

export interface KanbanApi {
  getBoard(): Promise<IpcResult<KanbanBoard>>;
  createColumn(input: CreateColumnInput): Promise<IpcResult<KanbanBoard>>;
  renameColumn(input: RenameColumnInput): Promise<IpcResult<KanbanBoard>>;
  reorderColumns(input: ReorderColumnsInput): Promise<IpcResult<KanbanBoard>>;
  deleteColumn(columnId: string): Promise<IpcResult<KanbanBoard>>;
  createCard(input: CreateCardInput): Promise<IpcResult<KanbanBoard>>;
  updateCard(input: UpdateCardInput): Promise<IpcResult<KanbanBoard>>;
  deleteCard(cardId: string): Promise<IpcResult<KanbanBoard>>;
  moveCard(input: MoveCardInput): Promise<IpcResult<KanbanBoard>>;
}

export interface QuadroApi {
  getState(): Promise<IpcResult<QuadroFile>>;
  createBlock(input: CreateBlockInput): Promise<IpcResult<QuadroFile>>;
  updateBlock(input: UpdateBlockInput): Promise<IpcResult<QuadroFile>>;
  moveBlock(input: MoveBlockInput): Promise<IpcResult<QuadroFile>>;
  deleteBlock(blockId: string): Promise<IpcResult<QuadroFile>>;
  createConnection(input: CreateConnectionInput): Promise<IpcResult<QuadroFile>>;
  deleteConnection(connectionId: string): Promise<IpcResult<QuadroFile>>;
  updateViewport(viewport: QuadroViewport): Promise<IpcResult<QuadroFile>>;
  updateBoardName(boardName: string): Promise<IpcResult<QuadroFile>>;
}

export interface ExploradorApi {
  getRaizes(): Promise<IpcResult<ExploradorFile>>;
  /** Abre o diálogo nativo de pasta; cancelar devolve a lista inalterada. */
  adicionarRaiz(): Promise<IpcResult<ExploradorFile>>;
  removerRaiz(raizId: string): Promise<IpcResult<ExploradorFile>>;
  listarDiretorio(input: ListarDiretorioInput): Promise<IpcResult<ExploradorListagem>>;
  criar(input: CriarInput): Promise<IpcResult<ExploradorListagem>>;
  renomear(input: RenomearInput): Promise<IpcResult<ExploradorListagem>>;
  mover(input: MoverInput): Promise<IpcResult<ExploradorListagem>>;
  excluir(input: ExcluirInput): Promise<IpcResult<ExploradorListagem>>;
  revelarNoSistema(caminho: string): Promise<IpcResult<void>>;
  abrirNoSistema(caminho: string): Promise<IpcResult<void>>;
}

export interface ServidoresApi {
  getState(): Promise<IpcResult<ServidoresFile>>;
  criarHttp(input: CriarServidorHttpInput): Promise<IpcResult<ServidoresFile>>;
  criarSsh(input: CriarServidorSshInput): Promise<IpcResult<ServidoresFile>>;
  atualizar(input: AtualizarServidorInput): Promise<IpcResult<ServidoresFile>>;
  remover(servidorId: string): Promise<IpcResult<ServidoresFile>>;
  checarAgora(servidorId: string): Promise<IpcResult<ServidoresFile>>;
  checarTodos(): Promise<IpcResult<ServidoresFile>>;
  salvarComando(input: SalvarComandoInput): Promise<IpcResult<ServidoresFile>>;
  removerComando(input: RemoverComandoInput): Promise<IpcResult<ServidoresFile>>;
  /** Só confirma o disparo; a saída chega pelo tópico 'servidores:saida'. */
  rodarComando(input: RodarComandoInput): Promise<IpcResult<void>>;
  configHealth(input: ConfigHealthInput): Promise<IpcResult<ServidoresFile>>;
  escolherChave(): Promise<IpcResult<string>>;
}

export interface N8nApi {
  getConfig(): Promise<IpcResult<N8nConfig>>;
  salvarConfig(input: SalvarN8nConfigInput): Promise<IpcResult<N8nConfig>>;
  getSnapshot(): Promise<IpcResult<N8nSnapshot>>;
  atualizarAgora(): Promise<IpcResult<void>>;
  testarConexao(): Promise<IpcResult<string>>;
  dispararWorkflow(input: DispararWorkflowInput): Promise<IpcResult<DispararWorkflowResult>>;
  alternarAtivo(input: { workflowId: string; ativar: boolean }): Promise<IpcResult<N8nSnapshot>>;
  definirVinculo(input: DefinirVinculoInput): Promise<IpcResult<N8nFile>>;
  abrirExecucao(execucaoId: string): Promise<IpcResult<void>>;
}

export interface GithubApi {
  getConfig(): Promise<IpcResult<GithubConfig>>;
  salvarConfig(input: SalvarGithubConfigInput): Promise<IpcResult<GithubConfig>>;
  getSnapshot(): Promise<IpcResult<GithubSnapshot>>;
  atualizarAgora(): Promise<IpcResult<void>>;
  testarConexao(): Promise<IpcResult<string>>;
  /** Abre o diálogo nativo de pasta; cancelar devolve a config inalterada. */
  adicionarPasta(): Promise<IpcResult<GithubConfig>>;
  removerPasta(pastaId: string): Promise<IpcResult<GithubConfig>>;
  abrirRepo(url: string): Promise<IpcResult<void>>;
}

export interface AjustesApi {
  getAjustes(): Promise<IpcResult<AjustesInfo>>;
  setModuloInicial(modulo: ModuloInicial): Promise<IpcResult<AjustesInfo>>;
}

export interface EventsApi {
  /**
   * Assina um tópico de push. Guarde o retorno e chame-o no destroy() do
   * módulo — sem isso a assinatura sobrevive à troca de tela.
   */
  on<T extends IrisEventTopic>(
    topic: T,
    callback: (payload: IrisEventPayload<T>) => void,
  ): Unsubscribe;
}

export interface SheetsApi {
  getFile(): Promise<IpcResult<SheetsFile>>;
  detectImport(): Promise<IpcResult<DetectImportResult | null>>;
  commitImport(input: CommitImportInput): Promise<IpcResult<CommitImportResult>>;
  createTable(input: CreateTableInput): Promise<IpcResult<SheetsFile>>;
  renameTable(input: RenameTableInput): Promise<IpcResult<SheetsFile>>;
  setTableVisibility(input: UpdateTableVisibilityInput): Promise<IpcResult<SheetsFile>>;
  addColumn(input: AddColumnInput): Promise<IpcResult<SheetsFile>>;
  updateColumn(input: UpdateColumnInput): Promise<IpcResult<SheetsFile>>;
  deleteColumn(input: DeleteColumnInput): Promise<IpcResult<SheetsFile>>;
  createRow(input: CreateRowInput): Promise<IpcResult<SheetsFile>>;
  updateRow(input: UpdateRowInput): Promise<IpcResult<SheetsFile>>;
  deleteRow(input: DeleteRowInput): Promise<IpcResult<SheetsFile>>;
  deleteRows(input: DeleteRowsInput): Promise<IpcResult<SheetsFile>>;
  deleteTable(input: DeleteTableInput): Promise<IpcResult<SheetsFile>>;
}

export interface SystemApi {
  copyToClipboard(text: string): void;
  openExternalLink(url: string): void;
}

export interface LinksApi {
  getLinks(): Promise<IpcResult<LinksFile>>;
  createLink(input: CreateLinkInput): Promise<IpcResult<LinksFile>>;
  updateLink(input: UpdateLinkInput): Promise<IpcResult<LinksFile>>;
  deleteLink(linkId: string): Promise<IpcResult<LinksFile>>;
  reorderLinks(orderedLinkIds: string[]): Promise<IpcResult<LinksFile>>;
}

export interface ExportApi {
  exportAll(): Promise<IpcResult<FileOpResult>>;
  importAll(): Promise<IpcResult<FileOpResult>>;
}

export interface CopyApi {
  getSnippets(): Promise<IpcResult<CopyFile>>;
  createSnippet(input: CreateSnippetInput): Promise<IpcResult<CopyFile>>;
  updateSnippet(input: UpdateSnippetInput): Promise<IpcResult<CopyFile>>;
  deleteSnippet(snippetId: string): Promise<IpcResult<CopyFile>>;
  importTxt(): Promise<IpcResult<ImportTxtResult>>;
}

export interface PensamentosApi {
  getPensamentos(): Promise<IpcResult<PensamentosFile>>;
  createPensamento(input: CreatePensamentoInput): Promise<IpcResult<PensamentosFile>>;
  updatePensamento(input: UpdatePensamentoInput): Promise<IpcResult<PensamentosFile>>;
  deletePensamento(pensamentoId: string): Promise<IpcResult<PensamentosFile>>;
  togglePin(pensamentoId: string): Promise<IpcResult<PensamentosFile>>;
  marcarPromovido(input: MarcarPromovidoInput): Promise<IpcResult<PensamentosFile>>;
}

export interface IrisApi {
  kanban: KanbanApi;
  quadro: QuadroApi;
  sheets: SheetsApi;
  system: SystemApi;
  export: ExportApi;
  links: LinksApi;
  copy: CopyApi;
  pensamentos: PensamentosApi;
  explorador: ExploradorApi;
  servidores: ServidoresApi;
  n8n: N8nApi;
  github: GithubApi;
  ajustes: AjustesApi;
  events: EventsApi;
}

declare global {
  interface Window {
    irisAPI: IrisApi;
  }
}
