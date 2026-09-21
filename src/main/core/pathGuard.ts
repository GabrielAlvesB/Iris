import fs from 'node:fs';
import path from 'node:path';

/** Mensagem exibida quando um caminho sai das pastas permitidas. */
const NEGADO = 'Caminho de arquivo não permitido.';

/**
 * Resolve e canoniza um caminho. O realpath importa no Windows: sem ele, uma
 * junction dentro de uma raiz permitida daria acesso a qualquer lugar do disco.
 */
function canonizar(alvo: string): string {
  const resolvido = path.resolve(alvo);
  try {
    return fs.realpathSync.native(resolvido);
  } catch {
    // O caminho ainda não existe (ou não pôde ser lido): o resolve já basta.
    return resolvido;
  }
}

/**
 * Comparar com startsWith não serve: "C:\notas-x" começa com "C:\notas" sem
 * estar dentro dela. path.relative respeita a fronteira de separador.
 */
function estaDentro(raiz: string, alvo: string): boolean {
  const relativo = path.relative(raiz, alvo);
  return relativo === '' || (!relativo.startsWith('..') && !path.isAbsolute(relativo));
}

/**
 * Valida um caminho existente contra as raízes permitidas.
 * Use SEMPRE o caminho retornado nas operações de fs — nunca a string original,
 * que pode conter ".." ou apontar para um link.
 */
export function assertDentroDasRaizes(raizes: string[], alvo: string): string {
  const alvoCanonico = canonizar(alvo);
  const permitido = raizes.map(canonizar).some((raiz) => estaDentro(raiz, alvoCanonico));
  if (!permitido) {
    throw new Error(NEGADO);
  }
  return alvoCanonico;
}

const NOME_INVALIDO = /[\\/:*?"<>|]/;

/**
 * Valida um caminho que ainda vai ser criado: o alvo não existe, então
 * validamos o diretório pai (que existe) e recolamos o nome já conferido.
 */
export function assertCriavelDentroDasRaizes(raizes: string[], alvo: string): string {
  const pai = assertDentroDasRaizes(raizes, path.dirname(alvo));
  const nome = path.basename(alvo);

  if (!nome || nome === '.' || nome === '..' || NOME_INVALIDO.test(nome)) {
    throw new Error('Nome de arquivo inválido.');
  }
  return path.join(pai, nome);
}

/** Mover/renomear: origem e destino precisam estar ambos dentro das raízes. */
export function assertMoverDentroDasRaizes(
  raizes: string[],
  origem: string,
  destino: string,
): { origem: string; destino: string } {
  return {
    origem: assertDentroDasRaizes(raizes, origem),
    destino: assertCriavelDentroDasRaizes(raizes, destino),
  };
}
