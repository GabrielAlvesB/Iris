import fs from 'node:fs';
import path from 'node:path';
import { assertDentroDasRaizes } from '../../core/pathGuard';
import { ignorarPasta } from '../../core/pastasIgnoradas';
import type { RaizMonitorada, ResultadoBusca, ResultadoBuscaItem } from '../../../shared/types/explorador.types';

/** Tetos que mantêm a busca abaixo de ~1 s mesmo em pastas de projeto grandes. */
const MAX_RESULTADOS = 200;
const MAX_VISITADOS = 40_000;
const MAX_PROFUNDIDADE = 12;

/**
 * Cada busca nova incrementa a geração; a antiga percebe na próxima pasta e
 * para. Digitar rápido não empilha varreduras concorrentes no disco.
 */
let geracao = 0;

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR');
}

export async function buscarNasRaizes(raizes: RaizMonitorada[], termoBruto: string): Promise<ResultadoBusca> {
  const minha = ++geracao;
  const termo = termoBruto.trim();
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  const vazio: ResultadoBusca = { termo, itens: [], truncado: false, obsoleta: false };
  if (palavras.length === 0 || palavras.join('').length < 2) return vazio;

  const itens: ResultadoBuscaItem[] = [];
  let visitados = 0;
  let truncado = false;

  for (const raiz of raizes) {
    let base: string;
    try {
      // Canoniza a raiz como qualquer outra operação de fs: se ela virou uma
      // junction apontando para outro lugar, o pathGuard é quem decide.
      base = assertDentroDasRaizes([raiz.caminho], raiz.caminho);
    } catch {
      continue;
    }

    // Largura primeiro: resultados rasos (mais prováveis de serem o que se
    // procura) aparecem antes de o teto ser atingido.
    const fila: Array<{ dir: string; profundidade: number }> = [{ dir: base, profundidade: 0 }];
    while (fila.length > 0) {
      if (minha !== geracao) return { ...vazio, obsoleta: true };
      if (itens.length >= MAX_RESULTADOS || visitados >= MAX_VISITADOS) {
        truncado = true;
        break;
      }
      const { dir, profundidade } = fila.shift()!;

      let entradas: fs.Dirent[];
      try {
        entradas = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        continue; // sem permissão ou sumiu no meio da varredura
      }

      for (const entrada of entradas) {
        visitados += 1;
        // Links simbólicos e junctions não são seguidos: poderiam levar para
        // fora da pasta monitorada ou criar ciclo.
        if (entrada.isSymbolicLink()) continue;
        const ehPasta = entrada.isDirectory();
        if (ehPasta && ignorarPasta(entrada.name)) continue;

        const completo = path.join(dir, entrada.name);
        const nome = normalizar(entrada.name);
        if (palavras.every((p) => nome.includes(p)) && itens.length < MAX_RESULTADOS) {
          let tamanho = 0;
          let modificadoEm = '';
          try {
            const stat = await fs.promises.stat(completo);
            tamanho = ehPasta ? 0 : stat.size;
            modificadoEm = stat.mtime.toISOString();
          } catch {
            continue;
          }
          itens.push({
            nome: entrada.name,
            caminho: completo,
            tipo: ehPasta ? 'pasta' : 'arquivo',
            tamanho,
            modificadoEm,
            raizId: raiz.id,
            raizNome: raiz.nome,
            pastaRelativa: path.relative(base, dir).split(path.sep).join('/'),
          });
        }
        if (ehPasta && profundidade < MAX_PROFUNDIDADE) fila.push({ dir: completo, profundidade: profundidade + 1 });
      }
    }
    if (truncado) break;
  }

  // Nome que começa com o termo vem antes de nome que só o contém.
  const inicio = normalizar(termo);
  itens.sort((a, b) => {
    const pa = normalizar(a.nome).startsWith(inicio) ? 0 : 1;
    const pb = normalizar(b.nome).startsWith(inicio) ? 0 : 1;
    return pa - pb || a.nome.localeCompare(b.nome, 'pt-BR');
  });

  return { termo, itens, truncado, obsoleta: false };
}
