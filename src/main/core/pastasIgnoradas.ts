/**
 * Pastas que nenhuma varredura de disco deve descer: são enormes, geradas por
 * ferramenta e nunca são o que o usuário procura. Compartilhado pela varredura
 * de repositórios do GitHub e pela busca da Biblioteca.
 */
export const PASTAS_IGNORADAS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'release',
  'vendor',
  '.next',
  '__pycache__',
  '.venv',
]);

/** Pastas ocultas (".cache", ".vscode"…) também ficam de fora. */
export function ignorarPasta(nome: string): boolean {
  return nome.startsWith('.') || PASTAS_IGNORADAS.has(nome);
}
