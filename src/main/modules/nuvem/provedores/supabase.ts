import { isFalha, request, type HttpResposta } from '../../../core/httpClient';
import type { DispositivoNuvem } from '../../../../shared/types/nuvem.types';
import type { AdaptadorNuvem, LinhaEnvio, LinhaRemota } from './comum';

/**
 * Supabase pela API REST que todo projeto já tem (PostgREST), em HTTP direto —
 * sem SDK, como as IAs. Ler é um GET na tabela; enviar é a função `iris_enviar`
 * (nuvem.sql.ts), que numera as revisões uma de cada vez.
 *
 * A chave é a **secreta** do projeto (service_role / sb_secret_…): as tabelas
 * têm RLS ligado e nenhuma política, então a chave pública não enxerga nada.
 * Ela vive no cofre e só entra aqui, no main.
 */

const TEMPO_MS = 30_000;

/** `https://xxxx.supabase.co`, sem barra no fim. http só para 127.0.0.1/localhost (o servidor falso dos testes). */
export function normalizarUrlSupabase(entrada: string): string {
  const texto = entrada.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  if (!texto) return '';
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new Error('Endereço inválido. Copie o "Project URL" do Supabase (https://….supabase.co).');
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('O endereço precisa começar com https://');
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
}

/** O "ref" do projeto (o começo do endereço): é o que a API de gerenciamento pede. */
export function refDoProjeto(url: string): string | null {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co$/i.exec(url);
  return m ? m[1]! : null;
}

function erroDoCorpo(corpo: string): { code: string; message: string } {
  try {
    const j = JSON.parse(corpo) as { code?: unknown; message?: unknown; msg?: unknown; error?: unknown };
    return { code: typeof j.code === 'string' ? j.code : '', message: String(j.message ?? j.msg ?? j.error ?? '') };
  } catch {
    return { code: '', message: corpo.slice(0, 200) };
  }
}

/** Tabela ou função que o PostgREST não conhece: as tabelas do Iris ainda não foram criadas. */
function faltaEstrutura(r: HttpResposta): boolean {
  if (isFalha(r) || r.ok) return false;
  const { code } = erroDoCorpo(r.body);
  return r.status === 404 || code === 'PGRST205' || code === 'PGRST202' || code === '42P01' || code === '42883';
}

function conferir(r: HttpResposta, oQue: string): string {
  if (isFalha(r)) {
    if (r.motivo === 'timeout') throw new Error(`O Supabase demorou demais para responder (${oQue}).`);
    throw new Error(`Sem conexão com o Supabase (${oQue}). Confira a internet e o endereço do projeto.`);
  }
  if (r.ok) return r.body;
  const { message } = erroDoCorpo(r.body);
  if (r.status === 401 || r.status === 403) {
    throw new Error('O Supabase recusou a chave. Use a chave secreta do projeto (service_role ou sb_secret_…), não a pública.');
  }
  if (faltaEstrutura(r)) throw new Error('As tabelas do Iris ainda não existem neste banco. Crie-as em Nuvem › Conexão.');
  if (r.status === 413) throw new Error('O Supabase recusou o envio por ser grande demais.');
  if (r.status === 429) throw new Error('O Supabase pediu para esperar (muitos pedidos). A próxima sincronização tenta de novo.');
  if (r.status >= 500) throw new Error(`O Supabase está com problema (HTTP ${r.status}). Tente de novo em instantes.`);
  throw new Error(`O Supabase respondeu HTTP ${r.status} (${oQue})${message ? `: ${message}` : '.'}`);
}

function lerJson<T>(corpo: string, oQue: string): T {
  try {
    return JSON.parse(corpo) as T;
  } catch {
    throw new Error(`A resposta do Supabase não é JSON (${oQue}). O endereço é mesmo o do projeto?`);
  }
}

export function criarSupabase(url: string, chave: string): AdaptadorNuvem {
  const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
  const get = (caminho: string): Promise<HttpResposta> => request(`${url}/rest/v1/${caminho}`, { headers: cabecalhos, timeoutMs: TEMPO_MS });
  const post = (caminho: string, corpo: unknown, extra: Record<string, string> = {}): Promise<HttpResposta> =>
    request(`${url}/rest/v1/${caminho}`, { method: 'POST', headers: { ...cabecalhos, ...extra }, body: JSON.stringify(corpo), timeoutMs: TEMPO_MS });
  const q = encodeURIComponent;

  return {
    async versaoDoEsquema() {
      const r = await get('iris_meta?select=valor&chave=eq.esquema');
      if (faltaEstrutura(r)) return null;
      const linhas = lerJson<Array<{ valor?: unknown }>>(conferir(r, 'ler a versão das tabelas'), 'versão das tabelas');
      const n = Number(Array.isArray(linhas) ? linhas[0]?.valor : NaN);
      return Number.isFinite(n) ? n : null;
    },

    async contar(espaco) {
      const r = await post('rpc/iris_contar', { p_espaco: espaco });
      const n = Number(lerJson<unknown>(conferir(r, 'contar os registros'), 'contagem'));
      return Number.isFinite(n) ? n : 0;
    },

    async enviar(espaco, dispositivo, linhas) {
      const corpo = {
        p_espaco: espaco,
        p_dispositivo: dispositivo,
        p_linhas: linhas.map((l: LinhaEnvio) => ({
          arquivo: l.arquivo,
          colecao: l.colecao,
          id: l.id,
          dados: l.dados,
          excluido: l.dados === null,
          esquema: l.esquema,
          atualizadoEm: l.atualizadoEm,
        })),
      };
      conferir(await post('rpc/iris_enviar', corpo), 'enviar');
    },

    async buscar(espaco, desdeRev, limite) {
      const r = await get(
        `iris_registros?select=arquivo,colecao,id,dados,esquema,rev,atualizado_em,excluido_em,dispositivo&espaco=eq.${q(espaco)}&rev=gt.${desdeRev}&order=rev.asc&limit=${limite}`,
      );
      const linhas = lerJson<Array<Record<string, unknown>>>(conferir(r, 'buscar'), 'busca');
      if (!Array.isArray(linhas)) throw new Error('O Supabase devolveu uma resposta inesperada na busca.');
      return linhas.map(
        (l): LinhaRemota => ({
          arquivo: String(l.arquivo ?? ''),
          colecao: String(l.colecao ?? ''),
          id: String(l.id ?? ''),
          dados: l.excluido_em ? null : (l.dados ?? null),
          esquema: Number(l.esquema) || 1,
          rev: Number(l.rev) || 0,
          atualizadoEm: String(l.atualizado_em ?? ''),
          dispositivo: String(l.dispositivo ?? ''),
        }),
      );
    },

    async marcarPresenca(espaco, d) {
      const r = await post(
        'iris_dispositivos?on_conflict=espaco,id',
        { espaco, id: d.id, nome: d.nome, versao: d.versao, visto_em: new Date().toISOString() },
        { Prefer: 'resolution=merge-duplicates,return=minimal' },
      );
      conferir(r, 'registrar este computador');
    },

    async dispositivos(espaco) {
      const r = await get(`iris_dispositivos?select=id,nome,versao,visto_em&espaco=eq.${q(espaco)}&order=visto_em.desc`);
      const linhas = lerJson<Array<Record<string, unknown>>>(conferir(r, 'listar os computadores'), 'computadores');
      return (Array.isArray(linhas) ? linhas : []).map(
        (l): DispositivoNuvem => ({ id: String(l.id ?? ''), nome: String(l.nome ?? ''), versao: String(l.versao ?? ''), vistoEm: String(l.visto_em ?? '') }),
      );
    },
  };
}

/**
 * Cria as tabelas pela API de gerenciamento do Supabase, com um token de acesso
 * da conta (Account › Access Tokens). O token é usado nesta chamada e descartado:
 * não vai para o cofre. Quem prefere não gerar token cola o SQL no SQL Editor.
 */
export async function criarTabelasNoSupabase(url: string, token: string, sql: string): Promise<void> {
  const ref = refDoProjeto(url);
  if (!ref) throw new Error('Criar pelo Iris só funciona com o endereço padrão (https://….supabase.co). Copie o SQL e cole no SQL Editor.');
  const r = await request(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
    timeoutMs: 60_000,
  });
  if (isFalha(r)) throw new Error('Sem conexão com a API do Supabase. Confira a internet.');
  if (r.status === 401 || r.status === 403) throw new Error('O Supabase recusou o token de acesso. Gere um em Account › Access Tokens e cole inteiro.');
  if (r.status === 404) throw new Error('O Supabase não achou este projeto com esse token. O token é da mesma conta do projeto?');
  if (!r.ok) throw new Error(`O Supabase não criou as tabelas (HTTP ${r.status}): ${erroDoCorpo(r.body).message || 'sem detalhe'}`);
}
