import type { ChaveBundle } from './export.types';
import { COLECAO_RESTO, ID_ORDEM, ID_RESTO, REGRAS_NUVEM, type RegraNuvem } from './nuvem.types.js';

/**
 * As contas da sincronização, puras: partir um arquivo de dados em registros,
 * dizer o que mudou desde a última sincronização, juntar com o que veio da nuvem
 * e montar o arquivo de volta.
 *
 * Nenhum service precisou mudar: nem todo registro tem `updatedAt` e excluir tira
 * o item do array (não há lixeira). O que resolve é a **base** — o hash de cada
 * registro na última sincronização. Com ela, a comparação é de três lados
 * (base × aqui × nuvem): dá para saber quem mudou, e que um item sumiu.
 */

export interface Registro {
  /** 'boards', 'boards/<id>/cards'… ou '' para o `_resto`. */
  colecao: string;
  id: string;
  dados: unknown;
}

/** Chave `colecao\nid` → registro. */
export type Registros = Map<string, Registro>;

/** Chave → hash do registro na última sincronização. */
export type BaseNuvem = Record<string, string>;

export interface Mudanca {
  colecao: string;
  id: string;
  /** null = excluído. */
  dados: unknown | null;
  hash: string;
}

export interface Remoto {
  colecao: string;
  id: string;
  /** null = excluído. */
  dados: unknown | null;
  atualizadoEm: string;
  dispositivo: string;
}

export interface Conflito {
  colecao: string;
  id: string;
  venceu: 'local' | 'remoto';
  /** A versão que perdeu (null = era uma exclusão). */
  perdido: unknown | null;
  /** De qual dispositivo veio a versão da nuvem. */
  dispositivo: string;
}

export function chaveDe(colecao: string, id: string): string {
  return `${colecao}\n${id}`;
}

export function partesDaChave(chave: string): { colecao: string; id: string } {
  const i = chave.indexOf('\n');
  return { colecao: chave.slice(0, i), id: chave.slice(i + 1) };
}

/** 'boards/<id>/cards' → 'boards/cards': o tipo da coleção, sem os ids dos pais. */
export function tipoDe(colecao: string): string {
  return colecao
    .split('/')
    .filter((_, i) => i % 2 === 0)
    .join('/');
}

type Obj = Record<string, unknown>;

function ehObjeto(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Lista de itens com `id` de texto, único, sem "/" nem quebra de linha (viram
 * parte do caminho da coleção). Qualquer outra lista — de textos, de objetos sem
 * id — fica inteira no `_resto`.
 */
function ehColecao(v: unknown): v is Array<Obj & { id: string }> {
  if (!Array.isArray(v) || !v.length) return false;
  const vistos = new Set<string>();
  for (const item of v) {
    if (!ehObjeto(item) || typeof item.id !== 'string' || !/^[^/\n]+$/.test(item.id) || item.id.startsWith('_') || vistos.has(item.id)) return false;
    vistos.add(item.id);
  }
  return true;
}

/** Os dados são JSON puro (regra de todo arquivo do Iris): a cópia por JSON basta e é a mesma nos dois lados. */
function copia<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

function lerCaminho(obj: Obj, caminho: string): unknown {
  let atual: unknown = obj;
  for (const parte of caminho.split('.')) {
    if (!ehObjeto(atual)) return undefined;
    atual = atual[parte];
  }
  return atual;
}

function apagarCaminho(obj: Obj, caminho: string): void {
  const partes = caminho.split('.');
  let atual: unknown = obj;
  for (const parte of partes.slice(0, -1)) {
    if (!ehObjeto(atual)) return;
    atual = atual[parte];
  }
  if (ehObjeto(atual)) delete atual[partes[partes.length - 1]!];
}

function porCaminho(obj: Obj, caminho: string, valor: unknown): void {
  const partes = caminho.split('.');
  let atual = obj;
  for (const parte of partes.slice(0, -1)) {
    if (!ehObjeto(atual[parte])) atual[parte] = {};
    atual = atual[parte] as Obj;
  }
  atual[partes[partes.length - 1]!] = valor;
}

// ---------- Hash ----------

/** JSON com as chaves em ordem: a `migrate` de cada service monta os objetos em ordens diferentes. */
export function textoEstavel(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => textoEstavel(x === undefined ? null : x)).join(',')}]`;
  if (ehObjeto(v)) {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${textoEstavel(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * cyrb53 (53 bits) + o tamanho. Não é criptografia: só diz "este registro mudou?".
 * Feito à mão porque este arquivo roda também no renderer, sem `node:crypto`.
 */
export function hashDe(dados: unknown): string {
  const texto = textoEstavel(dados);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}.${texto.length.toString(36)}`;
}

// ---------- Arquivo → registros ----------

function decomporColecao(out: Registros, regra: RegraNuvem, nome: string, itens: Array<Obj & { id: string }>): void {
  const tipo = tipoDe(nome);
  const filhos = regra.aninhadas?.[tipo] ?? [];
  const fora = new Set([...(regra.camposLocais?.[tipo] ?? []), ...(regra.contadores ?? []).filter((c) => c.tipo === tipo).map((c) => c.campo)]);
  out.set(chaveDe(nome, ID_ORDEM), { colecao: nome, id: ID_ORDEM, dados: itens.map((i) => i.id) });
  for (const item of itens) {
    const dados: Obj = {};
    for (const [campo, valor] of Object.entries(item)) {
      if (fora.has(campo)) continue;
      if (filhos.includes(campo) && Array.isArray(valor) && (!valor.length || ehColecao(valor))) {
        if (valor.length) decomporColecao(out, regra, `${nome}/${item.id}/${campo}`, valor as Array<Obj & { id: string }>);
        continue;
      }
      dados[campo] = valor;
    }
    out.set(chaveDe(nome, item.id), { colecao: nome, id: item.id, dados });
  }
}

/**
 * Parte o arquivo em registros: um por item de cada lista com `id`, um `_ordem`
 * por lista e o `_resto`. Fora ficam `schemaVersion` e `updatedAt` (mudam a cada
 * gravação) e tudo que a regra marca como deste computador.
 */
export function decompor(chave: ChaveBundle, arquivo: unknown): Registros {
  const regra = REGRAS_NUVEM[chave];
  const out: Registros = new Map();
  if (!ehObjeto(arquivo)) return out;
  const resto: Obj = {};
  for (const [campo, valor] of Object.entries(arquivo)) {
    if (campo === 'schemaVersion' || campo === 'updatedAt') continue;
    // Lista vazia não vai para o `_resto`: se fosse, encher a lista num computador e
    // esvaziar o `_resto` no outro apagaria os itens. Na montagem ela volta como [].
    if (Array.isArray(valor) && (!valor.length || ehColecao(valor))) {
      if (valor.length && !(regra.locais ?? []).includes(campo)) decomporColecao(out, regra, campo, valor as Array<Obj & { id: string }>);
      continue;
    }
    resto[campo] = valor;
  }
  const limpo = copia(resto);
  for (const caminho of regra.locais ?? []) apagarCaminho(limpo, caminho);
  for (const c of regra.contadores ?? []) if (c.tipo === '') delete limpo[c.campo];
  out.set(chaveDe(COLECAO_RESTO, ID_RESTO), { colecao: COLECAO_RESTO, id: ID_RESTO, dados: limpo });
  return out;
}

// ---------- O que mudou aqui ----------

/** Compara com a base: o que é novo ou mudou, e o que estava na base e sumiu (excluído). */
export function diferencas(base: BaseNuvem, atuais: Registros): Mudanca[] {
  const mudancas: Mudanca[] = [];
  for (const [chave, r] of atuais) {
    const hash = hashDe(r.dados);
    if (base[chave] !== hash) mudancas.push({ colecao: r.colecao, id: r.id, dados: r.dados, hash });
  }
  for (const chave of Object.keys(base)) {
    if (!atuais.has(chave)) mudancas.push({ ...partesDaChave(chave), dados: null, hash: '' });
  }
  return mudancas;
}

/** A base depois de um envio que deu certo. */
export function baseDepoisDeEnviar(base: BaseNuvem, enviadas: Mudanca[]): BaseNuvem {
  const nova = { ...base };
  for (const m of enviadas) {
    const chave = chaveDe(m.colecao, m.id);
    if (m.dados === null) delete nova[chave];
    else nova[chave] = m.hash;
  }
  return nova;
}

// ---------- Juntar com o que veio da nuvem ----------

function horaDe(dados: unknown, padrao: string): string {
  if (!ehObjeto(dados)) return padrao;
  for (const campo of ['updatedAt', 'atualizadoEm', 'atualizadaEm']) {
    const v = dados[campo];
    if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return v;
  }
  return padrao;
}

/** Ordem da nuvem primeiro; o que só existe aqui (criado enquanto isso) entra no fim. */
function juntarOrdens(remota: unknown, local: unknown): string[] {
  const r = Array.isArray(remota) ? remota.filter((x): x is string => typeof x === 'string') : [];
  const l = Array.isArray(local) ? local.filter((x): x is string => typeof x === 'string') : [];
  const vistos = new Set(r);
  return [...r, ...l.filter((id) => !vistos.has(id))];
}

export interface ResultadoMescla {
  registros: Registros;
  base: BaseNuvem;
  conflitos: Conflito[];
  /** Registros daqui que mudaram por causa da nuvem (0 = não precisa regravar o arquivo). */
  aplicados: number;
}

/**
 * Aplica as mudanças da nuvem sobre os registros daqui.
 *
 * - Só a nuvem mudou → vale a nuvem.
 * - Só aqui mudou → fica como está (o envio leva depois).
 * - Os dois mudaram → conflito: vale o mais recente (`updatedAt` do registro; sem
 *   carimbo, a edição daqui, que ainda nem foi enviada). Editar ganha de excluir.
 *   A versão que perdeu volta em `conflitos`, para o Histórico.
 *
 * A base passa a ser o que a nuvem tem: o que ficou diferente dela é enviado em seguida.
 */
export function mesclar(locais: Registros, baseAtual: BaseNuvem, remotos: Remoto[], agora: string): ResultadoMescla {
  const registros: Registros = new Map(locais);
  const base: BaseNuvem = { ...baseAtual };
  const conflitos: Conflito[] = [];
  let aplicados = 0;

  for (const r of remotos) {
    const chave = chaveDe(r.colecao, r.id);
    const local = registros.get(chave);
    const hashLocal = local ? hashDe(local.dados) : undefined;
    const hashRemoto = r.dados === null ? undefined : hashDe(r.dados);
    const mudouAqui = hashLocal !== base[chave];
    const marcarBase = (): void => {
      if (hashRemoto === undefined) delete base[chave];
      else base[chave] = hashRemoto;
    };
    const aplicar = (): void => {
      if (r.dados === null) registros.delete(chave);
      else registros.set(chave, { colecao: r.colecao, id: r.id, dados: r.dados });
      aplicados++;
    };

    if (hashLocal === hashRemoto) {
      marcarBase();
      continue;
    }
    if (!mudouAqui) {
      aplicar();
      marcarBase();
      continue;
    }
    // Os dois lados mudaram.
    marcarBase();
    if (r.id === ID_ORDEM) {
      // Ordem não é conflito de ninguém: junta as duas e segue.
      registros.set(chave, { colecao: r.colecao, id: r.id, dados: juntarOrdens(r.dados, local?.dados) });
      aplicados++;
      continue;
    }
    const remotoVence =
      r.dados !== null && (!local || Date.parse(r.atualizadoEm) > Date.parse(horaDe(local.dados, agora)));
    if (remotoVence) {
      conflitos.push({ colecao: r.colecao, id: r.id, venceu: 'remoto', perdido: local ? local.dados : null, dispositivo: r.dispositivo });
      aplicar();
    } else {
      conflitos.push({ colecao: r.colecao, id: r.id, venceu: 'local', perdido: r.dados, dispositivo: r.dispositivo });
    }
  }
  return { registros, base, conflitos, aplicados };
}

// ---------- Registros → arquivo ----------

function maiorSeq(itens: unknown): number {
  if (!Array.isArray(itens)) return 0;
  return itens.reduce<number>((m, i) => (ehObjeto(i) && typeof i.seq === 'number' && i.seq > m ? i.seq : m), 0);
}

/**
 * Monta o arquivo de volta. O que é deste computador (campos locais, contadores,
 * `schemaVersion`, `updatedAt`) vem de `arquivoLocal`. O resultado ainda passa pela
 * `migrate` do service antes de ser gravado, como todo dado que entra no Iris.
 */
export function recompor(chave: ChaveBundle, arquivoLocal: unknown, registros: Registros): Obj {
  const regra = REGRAS_NUVEM[chave];
  const local: Obj = ehObjeto(arquivoLocal) ? arquivoLocal : {};

  const itensDe = new Map<string, Map<string, unknown>>();
  const ordemDe = new Map<string, string[]>();
  let resto: unknown;
  for (const r of registros.values()) {
    if (r.colecao === COLECAO_RESTO) {
      if (r.id === ID_RESTO) resto = r.dados;
      continue;
    }
    if (r.id === ID_ORDEM) {
      ordemDe.set(r.colecao, Array.isArray(r.dados) ? r.dados.filter((x): x is string => typeof x === 'string') : []);
      continue;
    }
    if (!itensDe.has(r.colecao)) itensDe.set(r.colecao, new Map());
    itensDe.get(r.colecao)!.set(r.id, r.dados);
  }

  const montar = (nome: string, listaLocal: unknown): unknown[] => {
    const itens = itensDe.get(nome) ?? new Map<string, unknown>();
    const tipo = tipoDe(nome);
    const locaisPorId = new Map<string, Obj>();
    if (Array.isArray(listaLocal)) for (const i of listaLocal) if (ehObjeto(i) && typeof i.id === 'string') locaisPorId.set(i.id, i);
    // A ordem gravada; depois o que só tem aqui, na ordem daqui; por fim o resto, na ordem em que chegou.
    const ids: string[] = [];
    const postos = new Set<string>();
    for (const id of [...(ordemDe.get(nome) ?? []), ...locaisPorId.keys(), ...itens.keys()]) {
      if (itens.has(id) && !postos.has(id)) {
        postos.add(id);
        ids.push(id);
      }
    }
    return ids.map((id) => {
      const dados = itens.get(id);
      if (!ehObjeto(dados)) return dados;
      const item: Obj = copia(dados);
      const daqui = locaisPorId.get(id);
      for (const campo of regra.camposLocais?.[tipo] ?? []) {
        if (daqui && daqui[campo] !== undefined) item[campo] = copia(daqui[campo]);
      }
      for (const filho of regra.aninhadas?.[tipo] ?? []) item[filho] = montar(`${nome}/${id}/${filho}`, daqui?.[filho]);
      for (const c of regra.contadores ?? []) {
        if (c.tipo !== tipo) continue;
        const daquiN = typeof daqui?.[c.campo] === 'number' ? (daqui[c.campo] as number) : 0;
        const maior = Math.max(daquiN, maiorSeq(item[c.itens]));
        // Item que já existia sem o contador continua sem ele: a montagem não inventa campo.
        if (daqui?.[c.campo] !== undefined || (!daqui && maior > 0)) item[c.campo] = maior;
      }
      return item;
    });
  };

  // Sem `_resto` (nunca deveria faltar): o daqui, para nenhuma preferência sumir.
  const out: Obj = ehObjeto(resto) ? copia(resto) : (decompor(chave, local).get(chaveDe(COLECAO_RESTO, ID_RESTO))?.dados as Obj) ?? {};

  const nomes = new Set<string>();
  for (const nome of itensDe.keys()) if (!nome.includes('/')) nomes.add(nome);
  // Lista que existe aqui e não veio em lugar nenhum = ficou vazia.
  for (const [campo, valor] of Object.entries(local)) if (Array.isArray(valor) && !(campo in out)) nomes.add(campo);
  for (const nome of nomes) out[nome] = montar(nome, local[nome]);

  for (const caminho of regra.locais ?? []) {
    const valor = lerCaminho(local, caminho);
    if (valor !== undefined) porCaminho(out, caminho, copia(valor));
  }
  for (const c of regra.contadores ?? []) {
    if (c.tipo !== '') continue;
    const daqui = typeof local[c.campo] === 'number' ? (local[c.campo] as number) : 0;
    const maior = Math.max(daqui, maiorSeq(out[c.itens]));
    if (local[c.campo] !== undefined || maior > 0) out[c.campo] = maior;
  }
  return {
    ...(local.schemaVersion !== undefined ? { schemaVersion: local.schemaVersion } : {}),
    ...(local.updatedAt !== undefined ? { updatedAt: local.updatedAt } : {}),
    ...out,
  };
}

/** Bytes aproximados de um registro no banco (o JSON dos dados). */
export function tamanhoDe(dados: unknown): number {
  return textoEstavel(dados).length;
}
