import type { IpcResult } from './common.types';
import type {
  ConferenciaNumero,
  CriarLoteInput,
  EnderecoWa,
  EnviarWaInput,
  ProvedorWa,
  SalvarConfigWaInput,
  SalvarModeloWaInput,
  SegredoWa,
  StatusWhatsapp,
  TemplateMeta,
  ViaWebhookWa,
  WhatsappFile,
} from './whatsapp.types';
import type { OrigemEventoWa } from './whatsapp.eventos';
import type { TipoFluxoWa } from './whatsapp.n8n';
import type { AnexoPostagem, EscolhaDeAnexos, InfoAnexo } from './postagens.types';
import type { EstadoAtualizacao, InstaladorLocal, VersaoPublicada } from './atualizacao.types';
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
  AdicionarRecursoInput,
  AdicionarRecursosResult,
  AtualizarRecursoInput,
  BibliotecaInfo,
  BuscarInput,
  CriarInput,
  ExcluirInput,
  ExploradorFile,
  ExploradorListagem,
  ListarDiretorioInput,
  MoverInput,
  RenomearInput,
  ResultadoBusca,
  SalvarColecaoInput,
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
import type { AjustesInfo, AssinaturaRelatorio, ModuloInicial, PerfilUsuario, Tema } from './ajustes.types';
import type {
  ArquivarImagemInput,
  AtualizarImagemInput,
  CriarImagemInput,
  ImagensFile,
  MoverImagemInput,
} from './imagens.types';
import type {
  CriarRelatorioInput,
  ExportarPdfInput,
  Relatorio,
  RelatoriosFile,
  SalvarCategoriasInput,
} from './relatorios.types';
import type {
  ArquivarVideoInput,
  AtualizarVideoInput,
  CriarVideoInput,
  ImportarDeSheetsInput,
  ImportarDeSheetsResult,
  MoverVideoInput,
  PreferenciasVideos,
  SalvarRedeInput,
  SalvarTagInput,
  SalvarEscalaInput,
  VideosFile,
} from './videos.types';
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
import type {
  AtualizarContratoInput,
  ContatosFile,
  CriarContratoInput,
  DescartarLeadInput,
  EditarInteracaoInput,
  EmpresaCrm,
  EtapaFunil,
  ExportarDocumentoInput,
  MoverNoFunilInput,
  Pessoa,
  RefContato,
  RegistrarInteracaoInput,
  SalvarLeadsConfigInput,
  SalvarModeloInput,
} from './contatos.types';
import type { EstadoBusca, RelatorioLeads, ResultadoTeste, StatusLeads } from './leads.types';
import type { CenarioN8n, FluxoN8nCriado } from './leads.n8n';
import type {
  CopiaDeSeguranca,
  FileOpResult,
  FormatoExportacao,
  ModuloExportavel,
  PreviaImportacao,
  ResultadoImportacao,
  ResumoExportavel,
} from './export.types';
import type {
  AprovarRoteiroInput,
  AtualizarRoteiroInput,
  CriarAdaptacaoInput,
  CriarAdaptacaoResult,
  CriarRoteiroInput,
  MudarStatusRoteiroInput,
  RestaurarVersaoInput,
  RoteirosFile,
  SalvarVersaoInput,
} from './roteiros.types';
import type {
  AtualizarCampanhaInput,
  CriarCampanhaInput,
  ImportarRegistrosResult,
  MoverCampanhaInput,
  RemoverRegistroInput,
  SalvarContaInput,
  SalvarRegistroInput,
  SalvarSiteInput,
  TrafegoFile,
} from './trafego.types';
import type { CreateLinkInput, LinksFile, UpdateLinkInput } from './links.types';
import type { CopyFile, CreateSnippetInput, ImportTxtResult, UpdateSnippetInput } from './copy.types';
import type {
  CreatePensamentoInput,
  MoverPensamentoInput,
  PensamentosFile,
  PensamentosViewport,
  UpdatePensamentoInput,
} from './pensamentos.types';
import type {
  AdicionarItensInput,
  ArquivarChecklistInput,
  AtualizarChecklistInput,
  AtualizarItemInput,
  CriarChecklistInput,
  EnviarAoKanbanInput,
  MarcarTodosInput,
  RemoverItemInput,
  ReordenarItensInput,
  TodoFile,
} from './todo.types';
import type {
  DestinoBiblioteca,
  GerarImagemInput,
  IaConfig,
  ItemGaleriaComMiniatura,
  ModeloIa,
  PedidoTexto,
  ProvedorId,
  ReferenciaIa,
  RefImagem,
  RespostaTexto,
  SalvarNaBibliotecaResult,
  SalvarPadroesInput,
  SalvarProvedorInput,
  TarefaIa,
  VinculoPostagem,
} from './ia.types';

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
  getBiblioteca(): Promise<IpcResult<BibliotecaInfo>>;
  adicionarRecurso(input: AdicionarRecursoInput): Promise<IpcResult<AdicionarRecursosResult>>;
  /** Seletor nativo de arquivos; cancelar devolve a Biblioteca inalterada. */
  adicionarRecursosPorDialogo(colecaoId?: string): Promise<IpcResult<AdicionarRecursosResult>>;
  atualizarRecurso(input: AtualizarRecursoInput): Promise<IpcResult<BibliotecaInfo>>;
  removerRecurso(recursoId: string): Promise<IpcResult<BibliotecaInfo>>;
  salvarColecao(input: SalvarColecaoInput): Promise<IpcResult<BibliotecaInfo>>;
  excluirColecao(colecaoId: string): Promise<IpcResult<BibliotecaInfo>>;
  limparRecentes(): Promise<IpcResult<BibliotecaInfo>>;
  buscar(input: BuscarInput): Promise<IpcResult<ResultadoBusca>>;
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
  setAssinatura(assinatura: AssinaturaRelatorio): Promise<IpcResult<AjustesInfo>>;
  setPerfil(perfil: PerfilUsuario): Promise<IpcResult<AjustesInfo>>;
  /** Só as trocas (id → combinação; '' = sem atalho). */
  setAtalhos(atalhos: Record<string, string>): Promise<IpcResult<AjustesInfo>>;
  setTema(tema: Tema): Promise<IpcResult<AjustesInfo>>;
}

export interface AtualizacaoApi {
  getEstado(): Promise<IpcResult<EstadoAtualizacao>>;
  verificar(): Promise<IpcResult<EstadoAtualizacao>>;
  /** Baixa, confere e instala; o app fecha e reabre na versão nova. */
  atualizar(): Promise<IpcResult<EstadoAtualizacao>>;
  abrirPagina(): Promise<IpcResult<void>>;
  /** Todas as releases publicadas, da mais nova para a mais antiga. */
  listarVersoes(): Promise<IpcResult<VersaoPublicada[]>>;
  /** Baixa e instala uma versão da lista (mais nova ou anterior). */
  instalarVersao(versao: string): Promise<IpcResult<EstadoAtualizacao>>;
  /** Abre o seletor de arquivo; null se cancelou. O caminho não sai do main. */
  escolherInstalador(): Promise<IpcResult<InstaladorLocal | null>>;
  /** Instala o arquivo escolhido por último em escolherInstalador. */
  instalarArquivo(): Promise<IpcResult<EstadoAtualizacao>>;
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

export type Plataforma = 'win32' | 'linux' | 'darwin';

export interface SystemApi {
  copyToClipboard(text: string): void;
  openExternalLink(url: string): void;
  /** O sistema em que o Iris roda: textos e opções que só existem no Windows somem no Linux. */
  plataforma: Plataforma;
  /** Avisa o main que a primeira tela tem conteúdo (medição de abertura). */
  primeiraTela(msDesdeNavegacao: number): void;
}

export interface LinksApi {
  getLinks(): Promise<IpcResult<LinksFile>>;
  createLink(input: CreateLinkInput): Promise<IpcResult<LinksFile>>;
  updateLink(input: UpdateLinkInput): Promise<IpcResult<LinksFile>>;
  deleteLink(linkId: string): Promise<IpcResult<LinksFile>>;
  reorderLinks(orderedLinkIds: string[]): Promise<IpcResult<LinksFile>>;
}

type ResultadoContatos = Promise<IpcResult<ContatosFile>>;

export interface ContatosApi {
  getFile(): ResultadoContatos;
  /** Sem id (ou id desconhecido) cria; com id mescla sobre o salvo. */
  salvarPessoa(pessoa: Partial<Pessoa>): ResultadoContatos;
  salvarEmpresa(empresa: Partial<EmpresaCrm>): ResultadoContatos;
  excluirContato(ref: RefContato): ResultadoContatos;
  arquivarContato(ref: RefContato, arquivado: boolean): ResultadoContatos;
  moverNoFunil(input: MoverNoFunilInput): ResultadoContatos;
  salvarEtapas(etapas: Array<Partial<EtapaFunil>>): ResultadoContatos;
  registrarInteracao(input: RegistrarInteracaoInput): ResultadoContatos;
  editarInteracao(input: EditarInteracaoInput): ResultadoContatos;
  excluirInteracao(id: string): ResultadoContatos;
  salvarModelo(input: SalvarModeloInput): ResultadoContatos;
  duplicarModelo(id: string): ResultadoContatos;
  excluirModelo(id: string): ResultadoContatos;
  criarContrato(input: CriarContratoInput): ResultadoContatos;
  atualizarContrato(input: AtualizarContratoInput): ResultadoContatos;
  duplicarContrato(id: string): ResultadoContatos;
  excluirContrato(id: string): ResultadoContatos;
  exportarPdf(input: ExportarDocumentoInput): Promise<IpcResult<FileOpResult>>;
  // ---------- Leads por API ----------
  leadsStatus(): Promise<IpcResult<StatusLeads>>;
  /** Mescla sobre a configuração salva; servidor e busca se reaplicam na hora. */
  salvarLeadsConfig(input: SalvarLeadsConfigInput): ResultadoContatos;
  gerarChaveFormulario(): ResultadoContatos;
  /** Gera e copia para a área de transferência no main: a chave nunca chega à tela. */
  gerarChaveIris(): Promise<IpcResult<StatusLeads>>;
  definirChaveIris(valor: string): Promise<IpcResult<StatusLeads>>;
  copiarChaveIris(): Promise<IpcResult<void>>;
  testarNuvem(): Promise<IpcResult<ResultadoTeste>>;
  buscarAgora(): Promise<IpcResult<EstadoBusca>>;
  enviarTeste(): Promise<IpcResult<ResultadoTeste>>;
  /** Ids de pessoas, ou 'todos'. */
  marcarVisto(ids: string[] | 'todos'): ResultadoContatos;
  descartarLead(input: DescartarLeadInput): ResultadoContatos;
  repontuar(): ResultadoContatos;
  contarNaoVistos(): Promise<IpcResult<number>>;
  /** `exportou` marca a data do último PDF. */
  salvarRelatorioLeads(relatorio: Partial<RelatorioLeads>, exportou: boolean): ResultadoContatos;
  excluirRelatorioLeads(id: string): ResultadoContatos;
  /** Cria o fluxo pronto no n8n configurado no Iris (desligado), com o endereço do cenário. */
  criarFluxoN8n(cenario: CenarioN8n): Promise<IpcResult<FluxoN8nCriado>>;
  /** Manda um lead de exemplo ao webhook do fluxo no n8n (o fluxo precisa estar ativo). */
  testarFluxoN8n(): Promise<IpcResult<ResultadoTeste>>;
}

type ResultadoWhatsapp = Promise<IpcResult<WhatsappFile>>;

export interface ResultadoEnvioWa {
  file: WhatsappFile;
  mensagemId: string;
  /** false: a mensagem foi gravada como "não saiu", com o motivo em `erro`. */
  ok: boolean;
  erro?: string;
}

export interface WhatsappApi {
  getFile(): ResultadoWhatsapp;
  status(): Promise<IpcResult<StatusWhatsapp>>;
  salvarConfig(input: SalvarConfigWaInput): ResultadoWhatsapp;
  /** Vazio remove. O valor vai para o cofre; a tela só recebe se existe e os 4 últimos caracteres. */
  definirSegredo(qual: SegredoWa, valor: string): Promise<IpcResult<StatusWhatsapp>>;
  removerCredenciais(): Promise<IpcResult<StatusWhatsapp>>;
  gerarChaveWebhook(): Promise<IpcResult<StatusWhatsapp>>;
  /** Copia a chave no main (para colar no Worker como CHAVE_WHATSAPP). */
  copiarChaveWebhook(): Promise<IpcResult<void>>;
  /** Endereços de recebimento com a chave mascarada. */
  enderecos(): Promise<IpcResult<EnderecoWa[]>>;
  copiarEndereco(origem: OrigemEventoWa, via: ViaWebhookWa): Promise<IpcResult<void>>;
  configurarWebhook(provedor: 'evolution' | 'waha', via: ViaWebhookWa): Promise<IpcResult<ResultadoTeste>>;
  testar(provedor: ProvedorWa): Promise<IpcResult<ResultadoTeste>>;
  conferirNumero(provedor: ProvedorWa | undefined, numero: string): Promise<IpcResult<ConferenciaNumero>>;
  listarTemplates(): Promise<IpcResult<TemplateMeta[]>>;
  /** Recusa (erro) antes de gravar se algo não confere; depois de gravar, o resultado vem em `ok`. */
  enviar(input: EnviarWaInput): Promise<IpcResult<ResultadoEnvioWa>>;
  reenviar(id: string): Promise<IpcResult<ResultadoEnvioWa>>;
  sincronizarConversa(ref: RefContato): Promise<IpcResult<{ novas: number; erro?: string }>>;
  marcarLidas(alvo: RefContato | 'todas' | { numero: string }): ResultadoWhatsapp;
  ligarNumero(numero: string, ref: RefContato): ResultadoWhatsapp;
  excluirMensagem(id: string): ResultadoWhatsapp;
  salvarModelo(input: SalvarModeloWaInput): ResultadoWhatsapp;
  excluirModelo(id: string): ResultadoWhatsapp;
  criarLote(input: CriarLoteInput): ResultadoWhatsapp;
  mudarLote(id: string, acao: 'pausar' | 'retomar' | 'cancelar' | 'excluir'): ResultadoWhatsapp;
  /** O JSON do fluxo com a chave mascarada (para mostrar). */
  previaFluxoN8n(tipo: TipoFluxoWa, cenario?: CenarioN8n): Promise<IpcResult<string>>;
  copiarFluxoN8n(tipo: TipoFluxoWa, cenario?: CenarioN8n): Promise<IpcResult<void>>;
  criarFluxoN8n(tipo: TipoFluxoWa, cenario?: CenarioN8n): Promise<IpcResult<FluxoN8nCriado>>;
}

export interface DocumentosApi {
  abrirPdf(filePath: string): Promise<IpcResult<void>>;
}

export interface ExportApi {
  /** O que cada módulo tem hoje ("34 cards"), para a tela de Backup. */
  resumo(): Promise<IpcResult<ResumoExportavel[]>>;
  exportar(escopo: ModuloExportavel[], formato: FormatoExportacao): Promise<IpcResult<FileOpResult>>;
  /** Abre o diálogo e lê o arquivo; nada é substituído ainda. null = cancelado. */
  escolherImportacao(): Promise<IpcResult<PreviaImportacao | null>>;
  aplicarImportacao(modulos: ModuloExportavel[]): Promise<IpcResult<ResultadoImportacao>>;
  cancelarImportacao(): Promise<IpcResult<void>>;
  ultimaCopia(): Promise<IpcResult<CopiaDeSeguranca | null>>;
  desfazerImportacao(): Promise<IpcResult<ModuloExportavel[]>>;
  abrirPastaDeCopias(): Promise<IpcResult<void>>;
}

export interface CopyApi {
  getSnippets(): Promise<IpcResult<CopyFile>>;
  createSnippet(input: CreateSnippetInput): Promise<IpcResult<CopyFile>>;
  updateSnippet(input: UpdateSnippetInput): Promise<IpcResult<CopyFile>>;
  deleteSnippet(snippetId: string): Promise<IpcResult<CopyFile>>;
  importTxt(): Promise<IpcResult<ImportTxtResult>>;
}

export interface RoteirosApi {
  getFile(): Promise<IpcResult<RoteirosFile>>;
  criarRoteiro(input: CriarRoteiroInput): Promise<IpcResult<RoteirosFile>>;
  atualizarRoteiro(input: AtualizarRoteiroInput): Promise<IpcResult<RoteirosFile>>;
  mudarStatus(input: MudarStatusRoteiroInput): Promise<IpcResult<RoteirosFile>>;
  /** Aprova e cria o card na 1ª coluna do Kanban (sem duplicar se ele já existe). */
  aprovarRoteiro(input: AprovarRoteiroInput): Promise<IpcResult<RoteirosFile>>;
  excluirRoteiro(roteiroId: string): Promise<IpcResult<RoteirosFile>>;
  duplicarRoteiro(roteiroId: string): Promise<IpcResult<RoteirosFile>>;
  salvarChecklistPadrao(itens: string[]): Promise<IpcResult<RoteirosFile>>;
  salvarVersao(input: SalvarVersaoInput): Promise<IpcResult<RoteirosFile>>;
  /** Guarda a atual como versão antes de voltar à escolhida. */
  restaurarVersao(input: RestaurarVersaoInput): Promise<IpcResult<RoteirosFile>>;
  /** Roteiro novo em outro formato; o original não muda. */
  criarAdaptacao(input: CriarAdaptacaoInput): Promise<IpcResult<CriarAdaptacaoResult>>;
}

export interface TrafegoApi {
  getFile(): Promise<IpcResult<TrafegoFile>>;
  salvarConta(input: SalvarContaInput): Promise<IpcResult<TrafegoFile>>;
  excluirConta(contaId: string): Promise<IpcResult<TrafegoFile>>;
  salvarSite(input: SalvarSiteInput): Promise<IpcResult<TrafegoFile>>;
  excluirSite(siteId: string): Promise<IpcResult<TrafegoFile>>;
  criarCampanha(input: CriarCampanhaInput): Promise<IpcResult<TrafegoFile>>;
  atualizarCampanha(input: AtualizarCampanhaInput): Promise<IpcResult<TrafegoFile>>;
  moverCampanha(input: MoverCampanhaInput): Promise<IpcResult<TrafegoFile>>;
  excluirCampanha(campanhaId: string): Promise<IpcResult<TrafegoFile>>;
  duplicarCampanha(campanhaId: string): Promise<IpcResult<TrafegoFile>>;
  salvarRegistro(input: SalvarRegistroInput): Promise<IpcResult<TrafegoFile>>;
  removerRegistro(input: RemoverRegistroInput): Promise<IpcResult<TrafegoFile>>;
  /** Abre o diálogo de arquivo no main e importa a primeira aba para a campanha. */
  importarRegistros(campanhaId: string): Promise<IpcResult<ImportarRegistrosResult>>;
}

export interface IaApi {
  getConfig(): Promise<IpcResult<IaConfig>>;
  /** apiKey: undefined mantém, '' remove. A chave nunca volta para a tela. */
  salvarProvedor(input: SalvarProvedorInput): Promise<IpcResult<IaConfig>>;
  salvarPadroes(input: SalvarPadroesInput): Promise<IpcResult<IaConfig>>;
  testarProvedor(id: ProvedorId): Promise<IpcResult<string>>;
  listarModelos(id: ProvedorId, forcar?: boolean): Promise<IpcResult<ModeloIa[]>>;
  gerarTexto(pedido: PedidoTexto): Promise<IpcResult<RespostaTexto>>;
  /** Dialog de arquivos no main; o caminho fica lá, a tela recebe ids. */
  referenciasDoComputador(): Promise<IpcResult<ReferenciaIa[]>>;
  descreverReferencia(ref: RefImagem): Promise<IpcResult<ReferenciaIa>>;
  /** Devolve a tarefa na hora; o progresso chega pelo evento 'ia:tarefa'. */
  gerarImagem(input: GerarImagemInput): Promise<IpcResult<TarefaIa>>;
  cancelarTarefa(tarefaId: string): Promise<IpcResult<TarefaIa[]>>;
  listarTarefas(): Promise<IpcResult<TarefaIa[]>>;
  /** Tira da lista uma tarefa terminada (erro ou cancelada). */
  dispensarTarefa(tarefaId: string): Promise<IpcResult<TarefaIa[]>>;
  limparTarefas(): Promise<IpcResult<TarefaIa[]>>;
  listarGaleria(): Promise<IpcResult<ItemGaleriaComMiniatura[]>>;
  /** data URL da imagem em tamanho real. */
  abrirImagem(id: string): Promise<IpcResult<string>>;
  excluirImagem(id: string): Promise<IpcResult<ItemGaleriaComMiniatura[]>>;
  /** Caminho salvo, ou null se cancelou. */
  exportarImagem(id: string): Promise<IpcResult<string | null>>;
  salvarNaBiblioteca(id: string, destino?: DestinoBiblioteca): Promise<IpcResult<SalvarNaBibliotecaResult>>;
  vincularPostagem(id: string, postagem: VinculoPostagem): Promise<IpcResult<void>>;
}

export interface TodoApi {
  getFile(): Promise<IpcResult<TodoFile>>;
  criarChecklist(input: CriarChecklistInput): Promise<IpcResult<TodoFile>>;
  atualizarChecklist(input: AtualizarChecklistInput): Promise<IpcResult<TodoFile>>;
  excluirChecklist(checklistId: string): Promise<IpcResult<TodoFile>>;
  duplicarChecklist(checklistId: string): Promise<IpcResult<TodoFile>>;
  arquivarChecklist(input: ArquivarChecklistInput): Promise<IpcResult<TodoFile>>;
  reordenarChecklists(checklistIds: string[]): Promise<IpcResult<TodoFile>>;
  adicionarItens(input: AdicionarItensInput): Promise<IpcResult<TodoFile>>;
  atualizarItem(input: AtualizarItemInput): Promise<IpcResult<TodoFile>>;
  removerItem(input: RemoverItemInput): Promise<IpcResult<TodoFile>>;
  reordenarItens(input: ReordenarItensInput): Promise<IpcResult<TodoFile>>;
  marcarTodos(input: MarcarTodosInput): Promise<IpcResult<TodoFile>>;
  limparConcluidos(checklistId: string): Promise<IpcResult<TodoFile>>;
  enviarAoKanban(input: EnviarAoKanbanInput): Promise<IpcResult<TodoFile>>;
}

export interface PensamentosApi {
  getPensamentos(): Promise<IpcResult<PensamentosFile>>;
  createPensamento(input: CreatePensamentoInput): Promise<IpcResult<PensamentosFile>>;
  updatePensamento(input: UpdatePensamentoInput): Promise<IpcResult<PensamentosFile>>;
  deletePensamento(pensamentoId: string): Promise<IpcResult<PensamentosFile>>;
  togglePin(pensamentoId: string): Promise<IpcResult<PensamentosFile>>;
  moverPensamento(input: MoverPensamentoInput): Promise<IpcResult<PensamentosFile>>;
  setViewport(viewport: PensamentosViewport): Promise<IpcResult<PensamentosFile>>;
}

export interface VideosApi {
  getFile(): Promise<IpcResult<VideosFile>>;
  criarVideo(input: CriarVideoInput): Promise<IpcResult<VideosFile>>;
  atualizarVideo(input: AtualizarVideoInput): Promise<IpcResult<VideosFile>>;
  moverVideo(input: MoverVideoInput): Promise<IpcResult<VideosFile>>;
  arquivarVideo(input: ArquivarVideoInput): Promise<IpcResult<VideosFile>>;
  restaurarVideo(videoId: string): Promise<IpcResult<VideosFile>>;
  excluirVideo(videoId: string): Promise<IpcResult<VideosFile>>;
  salvarTag(input: SalvarTagInput): Promise<IpcResult<VideosFile>>;
  excluirTag(tagId: string): Promise<IpcResult<VideosFile>>;
  salvarEscala(input: SalvarEscalaInput): Promise<IpcResult<VideosFile>>;
  excluirEscala(escalaId: string): Promise<IpcResult<VideosFile>>;
  definirEscalaPadrao(escalaId: string): Promise<IpcResult<VideosFile>>;
  salvarRede(input: SalvarRedeInput): Promise<IpcResult<VideosFile>>;
  excluirRede(redeId: string): Promise<IpcResult<VideosFile>>;
  importarDeSheets(input: ImportarDeSheetsInput): Promise<IpcResult<ImportarDeSheetsResult>>;
  listarLinhasImportadas(tabelaId: string): Promise<IpcResult<string[]>>;
  salvarPreferencias(preferencias: PreferenciasVideos): Promise<IpcResult<VideosFile>>;
}

export interface ImagensApi {
  getFile(): Promise<IpcResult<ImagensFile>>;
  criarImagem(input: CriarImagemInput): Promise<IpcResult<ImagensFile>>;
  atualizarImagem(input: AtualizarImagemInput): Promise<IpcResult<ImagensFile>>;
  moverImagem(input: MoverImagemInput): Promise<IpcResult<ImagensFile>>;
  arquivarImagem(input: ArquivarImagemInput): Promise<IpcResult<ImagensFile>>;
  restaurarImagem(imagemId: string): Promise<IpcResult<ImagensFile>>;
  excluirImagem(imagemId: string): Promise<IpcResult<ImagensFile>>;
}

/** Arquivos anexados às postagens a partir de qualquer pasta (cópia guardada pelo Iris). */
export interface AnexosApi {
  /** Abre o diálogo do sistema e copia os arquivos escolhidos. */
  escolher(): Promise<IpcResult<EscolhaDeAnexos>>;
  info(anexos: AnexoPostagem[]): Promise<IpcResult<InfoAnexo[]>>;
  abrir(anexo: AnexoPostagem): Promise<IpcResult<void>>;
  revelar(anexo: AnexoPostagem): Promise<IpcResult<void>>;
  /** Destino da cópia salva, ou null se cancelou. */
  exportar(anexo: AnexoPostagem): Promise<IpcResult<string | null>>;
}

export interface RelatoriosApi {
  getFile(): Promise<IpcResult<RelatoriosFile>>;
  criarRelatorio(input: CriarRelatorioInput): Promise<IpcResult<RelatoriosFile>>;
  salvarRelatorio(relatorio: Relatorio): Promise<IpcResult<RelatoriosFile>>;
  duplicarRelatorio(relatorioId: string): Promise<IpcResult<RelatoriosFile>>;
  excluirRelatorio(relatorioId: string): Promise<IpcResult<RelatoriosFile>>;
  salvarCategorias(input: SalvarCategoriasInput): Promise<IpcResult<RelatoriosFile>>;
  /** Imprime a própria janela (o documento em #impressao) e salva onde o usuário escolher. */
  exportarPdf(input: ExportarPdfInput): Promise<IpcResult<FileOpResult>>;
}

export interface IrisApi {
  kanban: KanbanApi;
  quadro: QuadroApi;
  sheets: SheetsApi;
  system: SystemApi;
  contatos: ContatosApi;
  whatsapp: WhatsappApi;
  documentos: DocumentosApi;
  export: ExportApi;
  links: LinksApi;
  copy: CopyApi;
  pensamentos: PensamentosApi;
  todo: TodoApi;
  ia: IaApi;
  roteiros: RoteirosApi;
  trafego: TrafegoApi;
  explorador: ExploradorApi;
  servidores: ServidoresApi;
  n8n: N8nApi;
  github: GithubApi;
  ajustes: AjustesApi;
  videos: VideosApi;
  imagens: ImagensApi;
  anexos: AnexosApi;
  relatorios: RelatoriosApi;
  atualizacao: AtualizacaoApi;
  events: EventsApi;
}

declare global {
  interface Window {
    irisAPI: IrisApi;
  }
}
