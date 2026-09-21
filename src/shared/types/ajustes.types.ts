/** Nome de módulo que o app pode abrir ao iniciar. Espelha o ModuleName do app.ts. */
export type ModuloInicial =
  | 'kanban'
  | 'quadro'
  | 'explorador'
  | 'sheets'
  | 'links'
  | 'copy'
  | 'pensamentos'
  | 'servidores'
  | 'n8n'
  | 'github'
  | 'tutorial'
  | 'ajustes';

export interface AjustesFile {
  schemaVersion: number;
  updatedAt: string;
  moduloInicial: ModuloInicial;
}

export interface AjustesInfo {
  moduloInicial: ModuloInicial;
  /**
   * false quando o SO não oferece cofre de credenciais — a UI avisa que
   * API key e passphrase ficariam em texto puro.
   */
  criptografiaDisponivel: boolean;
}
