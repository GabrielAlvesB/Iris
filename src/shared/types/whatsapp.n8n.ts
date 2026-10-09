import type { CenarioN8n, FluxoN8n, NoN8n } from './leads.n8n';
import { CABECALHO_CHAVE } from './leads.types.js';

/**
 * Fluxos prontos do n8n para o WhatsApp. Puro: a tela mostra o JSON para
 * colar e o main cria o mesmo pela API do n8n.
 *
 * Enviar: o Iris chama o webhook com `{ numero, texto, idIris }` e o
 * cabeçalho X-Iris-Chave; o fluxo confere a chave, envia pelo nó escolhido e
 * responde `{ idExterno }` — é por esse id que "entregue" e "lida" casam depois.
 *
 * Credenciais (a da Meta, a apikey da Evolution) nunca saem do Iris para o
 * fluxo: o nó fica com o lugar marcado e quem usa escolhe a credencial no n8n.
 */

export type TipoFluxoWa = 'enviar-oficial' | 'enviar-evolution' | 'receber-oficial';

export const FLUXOS_WA: ReadonlyArray<{ id: TipoFluxoWa; rotulo: string; explica: string }> = [
  { id: 'enviar-oficial', rotulo: 'Enviar pela API oficial', explica: 'Usa o nó WhatsApp Business Cloud do n8n, com a credencial da Meta que você escolher lá.' },
  { id: 'enviar-evolution', rotulo: 'Enviar pela Evolution', explica: 'Um HTTP Request para a sua Evolution API. Cole a apikey no nó, dentro do n8n.' },
  { id: 'receber-oficial', rotulo: 'Receber pela API oficial', explica: 'O gatilho WhatsApp do n8n repassa ao Iris o que chega: mensagens e "entregue/lida".' },
];

export const NOME_FLUXO_WA: Record<TipoFluxoWa, string> = {
  'enviar-oficial': 'Iris — enviar WhatsApp (API oficial)',
  'enviar-evolution': 'Iris — enviar WhatsApp (Evolution)',
  'receber-oficial': 'Iris — receber WhatsApp (API oficial)',
};

/** Endereço do Iris que o n8n alcança em cada cenário (o mesmo raciocínio dos leads, ver leads.n8n.ts). */
export function baseIrisParaN8n(cenario: CenarioN8n, opcoes: { porta: number; urlNuvem: string }): string | undefined {
  if (cenario === 'local') return `http://127.0.0.1:${opcoes.porta}`;
  if (cenario === 'docker') return `http://host.docker.internal:${opcoes.porta}`;
  return opcoes.urlNuvem || undefined;
}

function no(n: number, nome: string, tipo: string, versao: number, x: number, y: number, parametros: Record<string, unknown>, nota: string, extra: Partial<NoN8n> = {}): NoN8n {
  return { id: `iris-wa-no-${n}`, name: nome, type: tipo, typeVersion: versao, position: [x, y], parameters: parametros, notes: nota, notesInFlow: true, ...extra };
}

function liga(de: string, para: string, saida = 0): { de: string; para: string; saida: number } {
  return { de, para, saida };
}

function conexoes(ligacoes: Array<{ de: string; para: string; saida: number }>): FluxoN8n['connections'] {
  const mapa: Record<string, Array<Array<{ node: string; type: 'main'; index: number }>>> = {};
  ligacoes.forEach(({ de, para, saida }) => {
    const saidas = (mapa[de] ??= []);
    while (saidas.length <= saida) saidas.push([]);
    saidas[saida]!.push({ node: para, type: 'main', index: 0 });
  });
  return Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, { main: v }]));
}

const NO_WEBHOOK = 'Pedido do Iris';
const NO_CHAVE = 'Chave confere?';
const NO_ENVIO = 'Enviar no WhatsApp';
const NO_OK = 'Responder ao Iris';
const NO_RECUSA = 'Recusar';

export interface OpcoesFluxoWa {
  caminho: string;
  /** A chave do WhatsApp no Iris (a mesma dos endereços de recebimento). */
  chave: string;
  webhookId?: string;
  /** Para o fluxo de envio pela API oficial. */
  phoneNumberId?: string;
  /** Para o da Evolution. */
  evolution?: { baseUrl: string; instancia: string };
  /** Para o de recebimento: o endereço do Iris (base, sem barra no fim). */
  baseIris?: string;
}

function fluxoEnviar(tipo: 'enviar-oficial' | 'enviar-evolution', o: OpcoesFluxoWa): FluxoN8n {
  const gatilho = no(
    1,
    NO_WEBHOOK,
    'n8n-nodes-base.webhook',
    2,
    0,
    0,
    { httpMethod: 'POST', path: o.caminho, responseMode: 'responseNode', options: {} },
    'Recebe do Iris: numero, texto e idIris.',
    { webhookId: o.webhookId ?? 'iris-wa-enviar' },
  );
  const chave = no(
    2,
    NO_CHAVE,
    'n8n-nodes-base.if',
    2,
    240,
    0,
    {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          {
            id: 'iris-wa-chave',
            leftValue: `={{ $json.headers["${CABECALHO_CHAVE.toLowerCase()}"] }}`,
            rightValue: o.chave,
            operator: { type: 'string', operation: 'equals' },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    'Sem a chave do Iris, ninguém manda mensagem por este webhook.',
  );
  const envio =
    tipo === 'enviar-oficial'
      ? no(
          3,
          NO_ENVIO,
          'n8n-nodes-base.whatsApp',
          1,
          500,
          -80,
          {
            resource: 'message',
            operation: 'send',
            messageType: 'text',
            phoneNumberId: o.phoneNumberId || 'COLE_O_PHONE_NUMBER_ID',
            recipientPhoneNumber: '={{ $json.body.numero }}',
            textBody: '={{ $json.body.texto }}',
            additionalFields: {},
          },
          'Escolha a credencial da Meta neste nó (WhatsApp API). O texto vai exatamente como o Iris mandou.',
        )
      : no(
          3,
          NO_ENVIO,
          'n8n-nodes-base.httpRequest',
          4.2,
          500,
          -80,
          {
            method: 'POST',
            url: `${(o.evolution?.baseUrl || 'https://SUA-EVOLUTION').replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(o.evolution?.instancia || 'SUA-INSTANCIA')}`,
            sendHeaders: true,
            headerParameters: { parameters: [{ name: 'apikey', value: 'COLE_A_APIKEY_DA_EVOLUTION' }] },
            sendBody: true,
            specifyBody: 'json',
            jsonBody: '={{ JSON.stringify({ number: $json.body.numero, text: $json.body.texto }) }}',
            options: {},
          },
          'Troque COLE_A_APIKEY_DA_EVOLUTION pela apikey (o Iris não copia credenciais para fora).',
        );
  const ok = no(
    4,
    NO_OK,
    'n8n-nodes-base.respondToWebhook',
    1.1,
    760,
    -80,
    {
      respondWith: 'json',
      responseBody: '={{ JSON.stringify({ ok: true, idExterno: $json.messages?.[0]?.id ?? $json.key?.id ?? $json.id ?? "" }) }}',
      options: {},
    },
    'Devolve o id da mensagem: é com ele que o Iris marca entregue e lida.',
  );
  const recusa = no(
    5,
    NO_RECUSA,
    'n8n-nodes-base.respondToWebhook',
    1.1,
    500,
    120,
    { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: false, erro: "Chave do Iris inválida." }) }}', options: { responseCode: 401 } },
    'Pedido sem a chave certa.',
  );
  return {
    name: NOME_FLUXO_WA[tipo],
    nodes: [gatilho, chave, envio, ok, recusa],
    connections: conexoes([liga(NO_WEBHOOK, NO_CHAVE), liga(NO_CHAVE, NO_ENVIO, 0), liga(NO_CHAVE, NO_RECUSA, 1), liga(NO_ENVIO, NO_OK)]),
    settings: { executionOrder: 'v1' },
  };
}

function fluxoReceber(o: OpcoesFluxoWa): FluxoN8n {
  const gatilho = no(
    1,
    'WhatsApp chegou',
    'n8n-nodes-base.whatsAppTrigger',
    1,
    0,
    0,
    { updates: ['messages'] },
    'Escolha a credencial do app da Meta (WhatsApp OAuth). Mensagens e status de entrega passam por aqui.',
    { webhookId: o.webhookId ?? 'iris-wa-receber' },
  );
  const envio = no(
    2,
    'Repassar ao Iris',
    'n8n-nodes-base.httpRequest',
    4.2,
    260,
    0,
    {
      method: 'POST',
      url: `${(o.baseIris ?? '').replace(/\/+$/, '')}/v1/whatsapp/meta/${o.chave}`,
      sendBody: true,
      specifyBody: 'json',
      // O gatilho entrega o "value" do webhook da Meta; o Iris lê o formato completo.
      jsonBody: '={{ JSON.stringify({ entry: [{ changes: [{ value: $json }] }] }) }}',
      options: {},
    },
    'Manda ao Iris no formato da Meta.',
  );
  return {
    name: NOME_FLUXO_WA['receber-oficial'],
    nodes: [gatilho, envio],
    connections: conexoes([liga('WhatsApp chegou', 'Repassar ao Iris')]),
    settings: { executionOrder: 'v1' },
  };
}

export function fluxoWa(tipo: TipoFluxoWa, o: OpcoesFluxoWa): FluxoN8n {
  return tipo === 'receber-oficial' ? fluxoReceber(o) : fluxoEnviar(tipo, o);
}

export function isTipoFluxoWa(v: unknown): v is TipoFluxoWa {
  return v === 'enviar-oficial' || v === 'enviar-evolution' || v === 'receber-oficial';
}
