import { CABECALHO_CHAVE } from './leads.types.js';

/**
 * Integração dos leads com o n8n. Puro e dos dois lados: a tela monta o fluxo
 * para copiar (colar no editor do n8n) e o main monta o mesmo fluxo para criar
 * pela API do n8n — o endereço e a chave saem iguais nos dois.
 *
 * O caminho do lead é sempre o mesmo: um gatilho no n8n (Webhook, Typeform,
 * Google Forms…) → um nó que dá os nomes de campo do Iris → um HTTP Request
 * para a API de leads. O que muda é para onde o n8n consegue enviar:
 */

export type CenarioN8n = 'local' | 'docker' | 'servidor';

export const CENARIOS_N8N: ReadonlyArray<{ id: CenarioN8n; rotulo: string; resumo: string }> = [
  { id: 'local', rotulo: 'Neste computador', resumo: 'n8n Desktop ou npx n8n, no mesmo PC do Iris' },
  { id: 'docker', rotulo: 'Em Docker neste computador', resumo: 'n8n num contêiner do Docker Desktop, no mesmo PC' },
  { id: 'servidor', rotulo: 'Num servidor ou n8n Cloud', resumo: 'VPS, servidor da empresa ou n8n.cloud' },
];

/** O caminho do Webhook no fluxo pronto: o formulário (ou o teste) chama {n8n}/webhook/iris-lead. */
export const CAMINHO_WEBHOOK = 'iris-lead';

/**
 * Palpite pelo endereço salvo no módulo n8n do Iris: endereço deste PC é o
 * n8n local; qualquer outro é um servidor. Docker não dá para adivinhar
 * (também responde em localhost): a pessoa escolhe.
 */
export function cenarioPeloEndereco(baseUrl: string): CenarioN8n | null {
  if (!baseUrl.trim()) return null;
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'localhost' || host === '0.0.0.0' || /^127\./.test(host) || host === '[::1]' ? 'local' : 'servidor';
  } catch {
    return null;
  }
}

/**
 * Para onde o n8n de cada cenário envia o lead:
 * - neste PC, o servidor local do Iris pelo 127.0.0.1;
 * - em Docker, o mesmo servidor, mas pelo host.docker.internal (o 127.0.0.1
 *   de dentro do contêiner é o próprio contêiner);
 * - num servidor, a caixa na nuvem: de lá não se alcança o seu PC.
 * `undefined` quando o caminho ainda não existe (caixa não configurada).
 */
export function enderecoParaN8n(cenario: CenarioN8n, opcoes: { porta: number; urlNuvem: string }): string | undefined {
  if (cenario === 'local') return `http://127.0.0.1:${opcoes.porta}/v1/leads`;
  if (cenario === 'docker') return `http://host.docker.internal:${opcoes.porta}/v1/leads`;
  return opcoes.urlNuvem ? `${opcoes.urlNuvem}/v1/leads` : undefined;
}

// ---------- O fluxo pronto ----------

export interface NoN8n {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  webhookId?: string;
  notes?: string;
  notesInFlow?: boolean;
}

/** O formato que o editor do n8n aceita colado (Ctrl+V) e que a API de workflows recebe. */
export interface FluxoN8n {
  name: string;
  nodes: NoN8n[];
  connections: Record<string, { main: Array<Array<{ node: string; type: 'main'; index: number }>> }>;
  settings: { executionOrder: 'v1' };
}

export const NOME_FLUXO = 'Iris — leads do formulário';

const NO_GATILHO = 'Formulário (Webhook)';
const NO_CAMPOS = 'Campos do Iris';
const NO_ENVIO = 'Enviar ao Iris';

/**
 * Campo do Iris → de onde ele vem no que o Webhook recebeu. O `??` aceita os
 * nomes em inglês mais comuns; para outro formulário, troque só aqui no nó
 * "Campos do Iris" (ex.: $json.body["seu-campo"]).
 */
const MAPEAMENTO: Array<[string, string]> = [
  ['nome', '={{ $json.body.nome ?? $json.body.name ?? "" }}'],
  ['email', '={{ $json.body.email ?? $json.body["e-mail"] ?? "" }}'],
  ['telefone', '={{ $json.body.telefone ?? $json.body.phone ?? $json.body.whatsapp ?? "" }}'],
  ['empresa', '={{ $json.body.empresa ?? $json.body.company ?? "" }}'],
  ['cnpj', '={{ $json.body.cnpj ?? "" }}'],
  ['mensagem', '={{ $json.body.mensagem ?? $json.body.message ?? "" }}'],
  ['interesse', '={{ $json.body.interesse ?? "" }}'],
  ['pagina', '={{ $json.body.pagina ?? $json.headers.referer ?? "" }}'],
  ['utm_source', '={{ $json.body.utm_source ?? "" }}'],
  ['utm_medium', '={{ $json.body.utm_medium ?? "" }}'],
  ['utm_campaign', '={{ $json.body.utm_campaign ?? "" }}'],
  ['formulario', '={{ $json.body.formulario ?? "n8n" }}'],
];

/** Ids estáveis por nó: colar duas vezes não confunde o n8n, e o teste compara o fluxo inteiro. */
function idDoNo(n: number): string {
  return `iris-lead-no-${n}`;
}

export function fluxoN8n(opcoes: { endereco: string; chave: string; nome?: string; webhookId?: string }): FluxoN8n {
  return {
    name: opcoes.nome ?? NOME_FLUXO,
    nodes: [
      {
        id: idDoNo(1),
        name: NO_GATILHO,
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 0],
        webhookId: opcoes.webhookId ?? 'iris-lead-webhook',
        parameters: { httpMethod: 'POST', path: CAMINHO_WEBHOOK, responseMode: 'lastNode', options: {} },
        notes: 'Recebe o lead. Pode trocar por outro gatilho (Typeform, Google Forms, Elementor…) — o resto continua igual.',
        notesInFlow: true,
      },
      {
        id: idDoNo(2),
        name: NO_CAMPOS,
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [260, 0],
        parameters: {
          assignments: {
            assignments: MAPEAMENTO.map(([campo, valor], i) => ({ id: `iris-campo-${i + 1}`, name: campo, value: valor, type: 'string' })),
          },
          options: {},
        },
        notes: 'Dá os nomes que o Iris espera. Se o seu formulário usa outros nomes, troque só a expressão de cada campo.',
        notesInFlow: true,
      },
      {
        id: idDoNo(3),
        name: NO_ENVIO,
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [520, 0],
        parameters: {
          method: 'POST',
          url: opcoes.endereco,
          sendHeaders: true,
          headerParameters: { parameters: [{ name: CABECALHO_CHAVE, value: opcoes.chave }] },
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ JSON.stringify($json) }}',
          options: {},
        },
        notes: 'POST para a API de leads do Iris, com a chave do formulário.',
        notesInFlow: true,
      },
    ],
    connections: {
      [NO_GATILHO]: { main: [[{ node: NO_CAMPOS, type: 'main', index: 0 }]] },
      [NO_CAMPOS]: { main: [[{ node: NO_ENVIO, type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  };
}

/** O que a tela recebe depois de criar o fluxo no n8n. */
export interface FluxoN8nCriado {
  id: string;
  nome: string;
  /** Endereço do fluxo no editor do n8n. */
  link: string;
}

/** O lead de exemplo do teste pelo n8n (o mesmo para o curl da tela e o botão). */
export const LEAD_TESTE_N8N = {
  nome: 'Teste pelo n8n',
  email: 'teste.n8n@exemplo.com.br',
  telefone: '11 90000-1234',
  mensagem: 'Enviado pelo teste da seção n8n do Iris. Pode excluir este contato.',
  formulario: 'Teste do n8n',
} as const;
