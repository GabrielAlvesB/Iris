import { VERSAO_ESQUEMA_NUVEM, type DialetoSql } from './nuvem.types.js';

/**
 * O SQL da nuvem: criar as tabelas e inserir registros, em PostgreSQL e em SQLite
 * (Cloudflare D1). É o mesmo texto no arquivo de extração, no "Criar tabelas" de
 * cada serviço e no passo a passo de quem prefere colar no editor de SQL.
 *
 * Três tabelas, iguais nos dois bancos:
 * - `iris_registros`: um registro do Iris por linha. `rev` é um número que só
 *   cresce, dado pelo banco: cada computador pede "tudo com rev maior que o meu".
 *   Excluir não apaga a linha — marca `excluido_em`, para os outros saberem.
 * - `iris_dispositivos`: os computadores que usam o espaço.
 * - `iris_meta`: a versão destas tabelas.
 *
 * Puro: sem Electron nem Node.
 */

export interface LinhaSql {
  arquivo: string;
  colecao: string;
  id: string;
  /** null = excluído. */
  dados: unknown | null;
  /** `schemaVersion` do arquivo de onde o registro saiu. */
  esquema: number;
  atualizadoEm: string;
}

/** Texto entre aspas simples. Vale para os dois bancos: Postgres com `standard_conforming_strings` (o padrão) não interpreta barra. */
export function textoSql(valor: string): string {
  // NUL não entra em texto do Postgres, e nenhum dado do Iris deveria ter um.
  return `'${valor.replace(/\u0000/g, '').replace(/'/g, "''")}'`;
}

function jsonSql(dialeto: DialetoSql, dados: unknown | null): string {
  if (dados === null) return 'null';
  const texto = textoSql(JSON.stringify(dados));
  return dialeto === 'postgres' ? `${texto}::jsonb` : texto;
}

export function sqlDoEsquema(dialeto: DialetoSql): string {
  const pg = dialeto === 'postgres';
  const quando = pg ? 'timestamptz' : 'text';
  const linhas = [
    `-- Iris na nuvem: tabelas (versão ${VERSAO_ESQUEMA_NUVEM}, ${pg ? 'PostgreSQL' : 'SQLite / Cloudflare D1'}).`,
    '-- Pode rodar mais de uma vez: só cria o que falta.',
    '',
    'create table if not exists iris_meta (',
    '  chave text primary key,',
    '  valor text not null',
    ');',
    '',
    'create table if not exists iris_registros (',
    '  espaco text not null,',
    '  arquivo text not null,',
    '  colecao text not null,',
    '  id text not null,',
    `  dados ${pg ? 'jsonb' : 'text'},`,
    '  esquema integer not null default 1,',
    `  rev ${pg ? 'bigint' : 'integer'} not null,`,
    `  atualizado_em ${quando} not null,`,
    `  excluido_em ${quando},`,
    "  dispositivo text not null default '',",
    '  primary key (espaco, arquivo, colecao, id)',
    ');',
    '',
    'create index if not exists iris_registros_rev on iris_registros (espaco, rev);',
    '',
    'create table if not exists iris_dispositivos (',
    '  espaco text not null,',
    '  id text not null,',
    "  nome text not null default '',",
    "  versao text not null default '',",
    `  visto_em ${quando} not null,`,
    '  primary key (espaco, id)',
    ');',
    '',
  ];
  if (pg) {
    linhas.push(
      '-- O número de revisão. Uma sequência nunca repete nem volta atrás.',
      'create sequence if not exists iris_rev;',
      '',
      '-- Sem política nenhuma: a chave pública (anon) do Supabase não lê nem grava nestas tabelas.',
      'alter table iris_meta enable row level security;',
      'alter table iris_registros enable row level security;',
      'alter table iris_dispositivos enable row level security;',
      '',
      '-- O envio de um lote. A trava faz um envio de cada vez: sem ela, dois computadores enviando juntos',
      '-- poderiam confirmar o rev 11 antes do 10, e quem lesse no meio pularia o 10 para sempre.',
      'create or replace function iris_enviar(p_espaco text, p_dispositivo text, p_linhas jsonb) returns bigint',
      'language plpgsql as $iris$',
      'declare',
      '  ultimo bigint;',
      'begin',
      "  perform pg_advisory_xact_lock(hashtext('iris_rev'));",
      '  insert into iris_registros (espaco, arquivo, colecao, id, dados, esquema, rev, atualizado_em, excluido_em, dispositivo)',
      "  select p_espaco, l->>'arquivo', l->>'colecao', l->>'id',",
      "    case when coalesce((l->>'excluido')::boolean, false) then null else l->'dados' end,",
      "    coalesce((l->>'esquema')::integer, 1), nextval('iris_rev'), (l->>'atualizadoEm')::timestamptz,",
      "    case when coalesce((l->>'excluido')::boolean, false) then (l->>'atualizadoEm')::timestamptz else null end,",
      '    p_dispositivo',
      '  from jsonb_array_elements(p_linhas) as l',
      '  on conflict (espaco, arquivo, colecao, id) do update set',
      '    dados = excluded.dados, esquema = excluded.esquema, rev = excluded.rev,',
      '    atualizado_em = excluded.atualizado_em, excluido_em = excluded.excluido_em, dispositivo = excluded.dispositivo;',
      '  select coalesce(max(rev), 0) into ultimo from iris_registros where espaco = p_espaco;',
      '  return ultimo;',
      'end',
      '$iris$;',
      '',
      '-- Quantos registros vivos o espaço tem: é o que "Testar conexão" mostra.',
      'create or replace function iris_contar(p_espaco text) returns bigint',
      'language sql stable as $iris$',
      '  select count(*) from iris_registros where espaco = p_espaco and excluido_em is null;',
      '$iris$;',
      '',
      '-- Supabase: a API relê as tabelas e as funções agora (em outro Postgres o aviso não faz nada).',
      "notify pgrst, 'reload schema';",
      '',
    );
  }
  linhas.push(
    `insert into iris_meta (chave, valor) values ('esquema', '${VERSAO_ESQUEMA_NUVEM}') on conflict (chave) do update set valor = excluded.valor;`,
    '',
  );
  return linhas.join('\n');
}

/** Linhas por `insert`: o D1 recusa comando acima de 100 KB, e um vídeo com roteiro passa de 10 KB. */
const POR_INSERT = 5;

/**
 * Os `insert` dos registros de um espaço. Carregar duas vezes não duplica: a
 * linha que já existe é atualizada. No SQLite o `rev` continua de onde a tabela parou.
 */
export function sqlDosDados(dialeto: DialetoSql, espaco: string, dispositivo: string, linhas: LinhaSql[]): string {
  const pg = dialeto === 'postgres';
  const partes: string[] = [];
  const e = textoSql(espaco);
  const d = textoSql(dispositivo);
  for (let i = 0; i < linhas.length; i += POR_INSERT) {
    const lote = linhas.slice(i, i + POR_INSERT);
    const valores = lote.map((l, n) => {
      const rev = pg ? "nextval('iris_rev')" : `(select coalesce(max(rev), 0) from iris_registros where espaco = ${e}) + ${n + 1}`;
      const quando = pg ? `${textoSql(l.atualizadoEm)}::timestamptz` : textoSql(l.atualizadoEm);
      const excluido = l.dados === null ? quando : 'null';
      return `  (${e}, ${textoSql(l.arquivo)}, ${textoSql(l.colecao)}, ${textoSql(l.id)}, ${jsonSql(dialeto, l.dados)}, ${l.esquema}, ${rev}, ${quando}, ${excluido}, ${d})`;
    });
    partes.push(
      'insert into iris_registros (espaco, arquivo, colecao, id, dados, esquema, rev, atualizado_em, excluido_em, dispositivo) values',
      valores.join(',\n'),
      'on conflict (espaco, arquivo, colecao, id) do update set',
      '  dados = excluded.dados, esquema = excluded.esquema, rev = excluded.rev,',
      '  atualizado_em = excluded.atualizado_em, excluido_em = excluded.excluido_em, dispositivo = excluded.dispositivo;',
      '',
    );
  }
  return partes.join('\n');
}

/**
 * O arquivo de extração inteiro: tabelas + dados. No Postgres vai numa transação
 * (ou entra tudo, ou nada); no SQLite não — o D1 recusa `begin`/`commit` em SQL e
 * o `wrangler d1 execute --file` já aplica o arquivo de uma vez.
 */
export function sqlDaExtracao(dialeto: DialetoSql, espaco: string, dispositivo: string, linhas: LinhaSql[], geradoEm: string): string {
  const pg = dialeto === 'postgres';
  return [
    `-- Extração do Iris em ${geradoEm}: ${linhas.length} registros do espaço "${espaco.replace(/[\r\n]/g, ' ')}".`,
    pg
      ? '-- Carregue no banco (psql -f arquivo.sql, ou cole no SQL Editor do Supabase) e conecte o Iris a ele.'
      : '-- Carregue no banco (wrangler d1 execute <banco> --remote --file arquivo.sql, ou sqlite3 banco.db < arquivo.sql) e conecte o Iris a ele.',
    '-- Tem os seus dados: guarde este arquivo com o mesmo cuidado que um backup.',
    '',
    ...(pg ? ['begin;', ''] : []),
    sqlDoEsquema(dialeto),
    sqlDosDados(dialeto, espaco, dispositivo, linhas),
    ...(pg ? ['commit;', ''] : []),
  ].join('\n');
}
