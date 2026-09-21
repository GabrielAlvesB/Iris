/** Integração com n8n: o Iris consulta a API REST; não abre porta local. */

export interface N8nConfig {
  /** Ex.: http://localhost:5678 — sem barra no fim. */
  baseUrl: string;
  /** A API key em si mora no secretStore; aqui só o fato de existir. */
  temApiKey: boolean;
  pollAtivo: boolean;
  pollIntervaloSeg: number;
  permitirTlsInseguro: boolean;
}

export interface N8nWorkflow {
  id: string;
  nome: string;
  ativo: boolean;
  tags: string[];
  atualizadoEm?: string;
}

export type N8nExecucaoStatus = 'sucesso' | 'erro' | 'rodando' | 'desconhecido';

export interface N8nExecucao {
  id: string;
  workflowId: string;
  workflowNome?: string;
  status: N8nExecucaoStatus;
  iniciadaEm?: string;
  duracaoMs?: number;
  modo?: string;
}

/** Retrato do n8n vindo do polling; é o que a tela desenha. */
export interface N8nSnapshot {
  conectado: boolean;
  erro?: string;
  atualizadoEm: string;
  workflows: N8nWorkflow[];
  execucoes: N8nExecucao[];
}

/** Vínculo de um workflow com algo do Iris, guardado em n8n.json. */
export interface N8nVinculo {
  workflowId: string;
  tipo: 'kanban' | 'servidor';
  refId: string;
}

export interface N8nFile {
  schemaVersion: number;
  updatedAt: string;
  baseUrl: string;
  pollAtivo: boolean;
  pollIntervaloSeg: number;
  permitirTlsInseguro: boolean;
  vinculos: N8nVinculo[];
  /** Último snapshot bem-sucedido, para a tela abrir já com conteúdo. */
  ultimoSnapshot?: N8nSnapshot;
}

export interface SalvarN8nConfigInput {
  baseUrl: string;
  /** undefined mantém a key atual; '' remove. */
  apiKey?: string;
  pollAtivo: boolean;
  pollIntervaloSeg: number;
  permitirTlsInseguro: boolean;
}

export interface DispararWorkflowInput {
  workflowId: string;
  /** JSON livre montado pelo usuário; vai no corpo da chamada. */
  payloadJson?: string;
}

export interface DispararWorkflowResult {
  ok: boolean;
  mensagem: string;
  respostaBruta?: string;
}

export interface DefinirVinculoInput {
  workflowId: string;
  tipo: 'kanban' | 'servidor';
  refId: string | null;
}
