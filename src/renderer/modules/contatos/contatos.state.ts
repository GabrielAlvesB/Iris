import type { IpcResult } from '../../../shared/types/common.types';
import type {
  AtualizarContratoInput,
  ContatosFile,
  CriarContratoInput,
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
} from '../../../shared/types/contatos.types';
import type { FileOpResult } from '../../../shared/types/export.types';
import type { EstadoBusca, RelatorioLeads, ResultadoTeste, StatusLeads } from '../../../shared/types/leads.types';
import type { CenarioN8n, FluxoN8nCriado } from '../../../shared/types/leads.n8n';
import { contarDoArquivo } from '../../core/leads.js';

type Listener = (state: ContatosFile) => void;

let state: ContatosFile | null = null;
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function aplicar(next: ContatosFile): ContatosFile {
  state = next;
  contarDoArquivo(state);
  listener?.(state);
  return state;
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function offStateChange(): void {
  listener = null;
}

export function getCurrentState(): ContatosFile | null {
  return state;
}

export async function load(): Promise<ContatosFile> {
  return aplicar(unwrap(await window.irisAPI.contatos.getFile()));
}

/**
 * Lead chegou com a ficha ou um contrato aberto: troca o cache sem redesenhar,
 * para quem está digitando não perder o foco. A lista se atualiza ao voltar.
 */
export async function recarregarSilencioso(): Promise<void> {
  state = unwrap(await window.irisAPI.contatos.getFile());
  contarDoArquivo(state);
}

/**
 * Salva sem redesenhar a tela: a ficha edita no lugar e salva na pausa da
 * digitação — redesenhar a cada pausa derrubaria o foco do campo.
 */
export async function salvarSilencioso(tipo: 'pessoa' | 'empresa', dados: Partial<Pessoa> | Partial<EmpresaCrm>): Promise<void> {
  const api = window.irisAPI.contatos;
  state = unwrap(await (tipo === 'pessoa' ? api.salvarPessoa(dados as Partial<Pessoa>) : api.salvarEmpresa(dados as Partial<EmpresaCrm>)));
}

/** Cria e devolve o id do contato novo, para a tela abrir a ficha dele. */
export async function criarPessoa(dados: Partial<Pessoa>): Promise<string | undefined> {
  const antes = new Set((state?.pessoas ?? []).map((p) => p.id));
  const next = aplicar(unwrap(await window.irisAPI.contatos.salvarPessoa(dados)));
  return next.pessoas.find((p) => !antes.has(p.id))?.id;
}

export async function criarEmpresa(dados: Partial<EmpresaCrm>): Promise<string | undefined> {
  const antes = new Set((state?.empresas ?? []).map((e) => e.id));
  const next = aplicar(unwrap(await window.irisAPI.contatos.salvarEmpresa(dados)));
  return next.empresas.find((e) => !antes.has(e.id))?.id;
}

export async function salvarPessoa(dados: Partial<Pessoa>): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.salvarPessoa(dados)));
}

export async function salvarEmpresa(dados: Partial<EmpresaCrm>): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.salvarEmpresa(dados)));
}

export async function excluirContato(ref: RefContato): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.excluirContato(ref)));
}

export async function arquivarContato(ref: RefContato, arquivado: boolean): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.arquivarContato(ref, arquivado)));
}

export async function moverNoFunil(input: MoverNoFunilInput): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.moverNoFunil(input)));
}

export async function salvarEtapas(etapas: Array<Partial<EtapaFunil>>): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.salvarEtapas(etapas)));
}

export async function registrarInteracao(input: RegistrarInteracaoInput): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.registrarInteracao(input)));
}

export async function editarInteracao(input: EditarInteracaoInput): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.editarInteracao(input)));
}

export async function excluirInteracao(id: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.excluirInteracao(id)));
}

/** Devolve o id do modelo salvo (novo ou o mesmo). */
export async function salvarModelo(input: SalvarModeloInput): Promise<string | undefined> {
  const antes = new Set((state?.modelos ?? []).map((m) => m.id));
  const next = aplicar(unwrap(await window.irisAPI.contatos.salvarModelo(input)));
  return input.id ?? next.modelos.find((m) => !antes.has(m.id))?.id;
}

export async function duplicarModelo(id: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.duplicarModelo(id)));
}

export async function excluirModelo(id: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.excluirModelo(id)));
}

/** Devolve o id do contrato criado, para a tela abri-lo. */
export async function criarContrato(input: CriarContratoInput): Promise<string | undefined> {
  const antes = new Set((state?.contratos ?? []).map((c) => c.id));
  const next = aplicar(unwrap(await window.irisAPI.contatos.criarContrato(input)));
  return next.contratos.find((c) => !antes.has(c.id))?.id;
}

export async function atualizarContrato(input: AtualizarContratoInput): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.atualizarContrato(input)));
}

/** Texto do rascunho salvo na pausa da digitação, sem redesenhar (o foco fica no editor). */
export async function atualizarContratoSilencioso(input: AtualizarContratoInput): Promise<void> {
  state = unwrap(await window.irisAPI.contatos.atualizarContrato(input));
}

export async function duplicarContrato(id: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.duplicarContrato(id)));
}

export async function excluirContrato(id: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.excluirContrato(id)));
}

export async function exportarPdf(input: ExportarDocumentoInput): Promise<FileOpResult> {
  return unwrap(await window.irisAPI.contatos.exportarPdf(input));
}

// ---------- Leads por API ----------

export async function leadsStatus(): Promise<StatusLeads> {
  return unwrap(await window.irisAPI.contatos.leadsStatus());
}

export async function salvarLeadsConfig(input: SalvarLeadsConfigInput): Promise<ContatosFile> {
  return aplicar(unwrap(await window.irisAPI.contatos.salvarLeadsConfig(input)));
}

export async function gerarChaveFormulario(): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.gerarChaveFormulario()));
}

export async function gerarChaveIris(): Promise<StatusLeads> {
  return unwrap(await window.irisAPI.contatos.gerarChaveIris());
}

export async function definirChaveIris(valor: string): Promise<StatusLeads> {
  return unwrap(await window.irisAPI.contatos.definirChaveIris(valor));
}

export async function copiarChaveIris(): Promise<void> {
  unwrap(await window.irisAPI.contatos.copiarChaveIris());
}

export async function testarNuvem(): Promise<ResultadoTeste> {
  return unwrap(await window.irisAPI.contatos.testarNuvem());
}

export async function buscarAgora(): Promise<EstadoBusca> {
  return unwrap(await window.irisAPI.contatos.buscarAgora());
}

export async function enviarTeste(): Promise<ResultadoTeste> {
  return unwrap(await window.irisAPI.contatos.enviarTeste());
}

export async function marcarVisto(ids: string[] | 'todos'): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.marcarVisto(ids)));
}

export async function descartarLead(pessoaId: string, motivo: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.descartarLead({ pessoaId, motivo })));
}

export async function salvarRelatorioLeads(relatorio: Partial<RelatorioLeads>, exportou: boolean): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.salvarRelatorioLeads(relatorio, exportou)));
}

export async function criarFluxoN8n(cenario: CenarioN8n): Promise<FluxoN8nCriado> {
  return unwrap(await window.irisAPI.contatos.criarFluxoN8n(cenario));
}

export async function testarFluxoN8n(): Promise<ResultadoTeste> {
  return unwrap(await window.irisAPI.contatos.testarFluxoN8n());
}

export async function excluirRelatorioLeads(id: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.contatos.excluirRelatorioLeads(id)));
}
