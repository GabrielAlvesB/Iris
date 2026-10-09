import type { RefContato } from './contatos.types';
import type { EstadoServidorLocal, ResultadoTeste } from './leads.types';
import type { OrigemEventoWa } from './whatsapp.eventos';

/**
 * WhatsApp dentro de Contatos: escrever no Iris e sair exatamente aquele
 * texto, por um de cinco caminhos. Puro e usado pelos dois lados.
 *
 * As mensagens moram em whatsapp.json, fora de contatos.json: crescem rápido
 * e contatos.json é relido a cada lead que chega. Credenciais ficam no cofre
 * (`whatsapp.<provedor>.*`); a tela só sabe se existem e os 4 últimos caracteres.
 */

export const PROVEDORES_WHATSAPP = [
  {
    id: 'meta',
    rotulo: 'API oficial (Meta)',
    curto: 'API oficial',
    descricao: 'WhatsApp Business Platform, com número comercial. Envia direto, sem risco de bloqueio. Fora das 24 h desde a última mensagem do contato, só modelos aprovados pela Meta.',
    enviaDireto: true,
    lote: true,
  },
  {
    id: 'evolution',
    rotulo: 'Evolution API',
    curto: 'Evolution',
    descricao: 'Servidor que você hospeda (Docker, VPS), ligado ao seu WhatsApp por QR code. Envia qualquer texto. Não oficial: abuso pode levar ao bloqueio do número.',
    enviaDireto: true,
    lote: true,
  },
  {
    id: 'waha',
    rotulo: 'WAHA',
    curto: 'WAHA',
    descricao: 'WhatsApp HTTP API, também hospedado por você e ligado por QR code. Envia qualquer texto. Não oficial: abuso pode levar ao bloqueio do número.',
    enviaDireto: true,
    lote: true,
  },
  {
    id: 'n8n',
    rotulo: 'Pelo n8n',
    curto: 'n8n',
    descricao: 'O Iris manda a mensagem a um fluxo do n8n, que envia pelo nó de WhatsApp que você já usa lá (oficial ou Evolution).',
    enviaDireto: true,
    lote: true,
  },
  {
    id: 'link',
    rotulo: 'Abrir no WhatsApp',
    curto: 'WhatsApp do PC',
    descricao: 'Abre o WhatsApp do computador com a mensagem já escrita; o último Enter é seu, lá. Sem configuração nenhuma.',
    enviaDireto: false,
    lote: false,
  },
] as const;

export type ProvedorWa = (typeof PROVEDORES_WHATSAPP)[number]['id'];

export function isProvedorWa(v: unknown): v is ProvedorWa {
  return PROVEDORES_WHATSAPP.some((p) => p.id === v);
}

export function descritorProvedor(id: ProvedorWa): (typeof PROVEDORES_WHATSAPP)[number] {
  return PROVEDORES_WHATSAPP.find((p) => p.id === id)!;
}

/**
 * `na-fila` → `enviando` → `enviada` → `entregue` → `lida` só andam para a
 * frente (eventos chegam fora de ordem: "lida" antes de "entregue" é comum).
 * `aberta-no-whatsapp`: foi para o WhatsApp do PC; o Iris não sabe se saiu.
 */
export const STATUS_MENSAGEM_WA = [
  { id: 'na-fila', rotulo: 'Na fila' },
  { id: 'enviando', rotulo: 'Enviando' },
  { id: 'enviada', rotulo: 'Enviada' },
  { id: 'entregue', rotulo: 'Entregue' },
  { id: 'lida', rotulo: 'Lida' },
  { id: 'falhou', rotulo: 'Não saiu' },
  { id: 'aberta-no-whatsapp', rotulo: 'Aberta no WhatsApp' },
  { id: 'recebida', rotulo: 'Recebida' },
] as const;

export type StatusMensagemWa = (typeof STATUS_MENSAGEM_WA)[number]['id'];

const ORDEM_STATUS: Partial<Record<StatusMensagemWa, number>> = { 'na-fila': 0, enviando: 1, enviada: 2, entregue: 3, lida: 4 };

/**
 * O status que fica depois de um evento. Só avança; `falhou` vale a qualquer
 * hora antes de entregue (a Meta avisa falha de entrega depois de "enviada").
 */
export function statusSeguinte(atual: StatusMensagemWa, novo: StatusMensagemWa): StatusMensagemWa {
  if (novo === 'falhou') return (ORDEM_STATUS[atual] ?? 0) >= 3 ? atual : 'falhou';
  const a = ORDEM_STATUS[atual];
  const n = ORDEM_STATUS[novo];
  if (n === undefined) return atual;
  // Uma falha seguida de "entregue" (reenvio do provedor) vale a confirmação.
  if (a === undefined) return atual === 'falhou' && n >= 3 ? novo : atual;
  return n > a ? novo : atual;
}

export function rotuloDoStatus(s: StatusMensagemWa): string {
  return STATUS_MENSAGEM_WA.find((x) => x.id === s)?.rotulo ?? s;
}

/** Um template aprovado da Meta, ligado a um modelo do Iris: `{{1}}`, `{{2}}`… viram campos do contato. */
export interface ModeloMetaWa {
  nome: string;
  /** "pt_BR" */
  idioma: string;
  /** O corpo como está na Meta, com {{1}}…: a prévia é feita a partir dele. */
  corpo: string;
  /** Para cada {{n}}, na ordem: um texto com campos do Iris ("{primeiro_nome}"). */
  variaveis: string[];
}

export interface ModeloWa {
  id: string;
  nome: string;
  /** Texto com campos entre chaves: {primeiro_nome}, {empresa}… (os mesmos dos contratos). */
  texto: string;
  metaTemplate?: ModeloMetaWa;
  criadoEm: string;
  atualizadoEm: string;
}

export interface MensagemWa {
  id: string;
  /** Ausente: número que ainda não está no cadastro (aparece em "Sem cadastro"). */
  contato?: RefContato;
  /** Só dígitos, com código do país, sem "+". */
  numero: string;
  direcao: 'saida' | 'entrada';
  /** O texto exato que saiu (ou chegou). */
  texto: string;
  provedor: ProvedorWa;
  status: StatusMensagemWa;
  /** Id do provedor (wamid, id da Evolution/WAHA): é por ele que o status casa depois. */
  idExterno?: string;
  modelo?: { id: string; nome: string; template?: string };
  erro?: string;
  /** Lote de envio para vários de onde saiu. */
  loteId?: string;
  /** Nome do perfil no WhatsApp de quem escreveu (ajuda a cadastrar um número novo). */
  nomePerfil?: string;
  /** Entrada: já vista na conversa. Saída: sempre true. */
  vista: boolean;
  /** ISO. */
  criadaEm: string;
  statusEm: string;
}

export const SITUACOES_LOTE = [
  { id: 'rodando', rotulo: 'Enviando' },
  { id: 'pausado', rotulo: 'Pausado' },
  { id: 'concluido', rotulo: 'Concluído' },
  { id: 'cancelado', rotulo: 'Cancelado' },
] as const;
export type SituacaoLote = (typeof SITUACOES_LOTE)[number]['id'];

export type SituacaoDestino = 'pendente' | 'enviado' | 'falhou' | 'pulado';

export interface DestinoLote {
  contato: RefContato;
  /** Cópia: o lote continua legível se o contato for excluído. */
  nome: string;
  numero: string;
  situacao: SituacaoDestino;
  mensagemId?: string;
  motivo?: string;
}

export interface LoteWa {
  id: string;
  nome: string;
  /** Cópia do texto (com campos) na criação: editar o modelo depois não muda o lote. */
  texto: string;
  modelo?: { id: string; nome: string };
  metaTemplate?: ModeloMetaWa;
  provedor: ProvedorWa;
  destinos: DestinoLote[];
  situacao: SituacaoLote;
  criadoEm: string;
  atualizadoEm: string;
  /** Epoch ms do próximo envio (intervalo sorteado entre o mínimo e o máximo). */
  proximoEnvioEm?: number;
}

export type AbrirWhatsappEm = 'app' | 'web';

export interface WhatsappConfig {
  /** O caminho usado quando a tela não escolhe outro. */
  provedor: ProvedorWa;
  meta: { phoneNumberId: string; wabaId: string; versaoApi: string };
  evolution: { baseUrl: string; instancia: string };
  waha: { baseUrl: string; sessao: string };
  /** Caminho do webhook de envio no n8n (`{baseUrl}/webhook/<caminho>`). */
  n8n: { caminhoEnviar: string };
  /** "Abrir no WhatsApp": no aplicativo do PC (o que atende whatsapp://, ex. WhatsApp Beta) ou no WhatsApp Web. */
  link: { abrirEm: AbrirWhatsappEm };
  envio: {
    intervaloMinSeg: number;
    intervaloMaxSeg: number;
    /** Envios por dia somando todos os caminhos diretos (proteção contra bloqueio). */
    limiteDiario: number;
    /** "HH:mm": lotes só enviam dentro da janela. */
    horarioDe: string;
    horarioAte: string;
  };
  permitirTlsInseguro: boolean;
  notificar: boolean;
}

export interface WhatsappFile {
  schemaVersion: number;
  updatedAt: string;
  config: WhatsappConfig;
  mensagens: MensagemWa[];
  modelos: ModeloWa[];
  lotes: LoteWa[];
  /** Ids externos já recebidos: webhook repetido não duplica mensagem. */
  idsRecebidos: string[];
}

export const VERSAO_API_META_PADRAO = 'v21.0';
export const CAMINHO_ENVIO_N8N_PADRAO = 'iris-whatsapp-enviar';
export const LIMITE_JANELA_META_MS = 24 * 60 * 60_000;
/** Teto de uma mensagem de texto no WhatsApp. */
export const LIMITE_TEXTO_WA = 4096;

// ---------- Situação (não gravada) ----------

export interface SituacaoProvedor {
  configurado: boolean;
  /** Credencial no cofre (token/apikey). */
  temChave: boolean;
  finalChave: string;
  /** O que falta, em português, quando não está configurado. */
  falta?: string;
}

export interface StatusWhatsapp {
  provedores: Record<ProvedorWa, SituacaoProvedor>;
  /** Chave dos endereços de recebimento (vai no caminho da URL). */
  webhook: { temChave: boolean; final: string };
  servidorLocal: EstadoServidorLocal;
  /** Endereço da caixa na nuvem dos leads (o mesmo Worker recebe o WhatsApp). */
  nuvem: { ativo: boolean; url: string };
  /** O n8n configurado em Ajustes. */
  n8n: { baseUrl: string; temApiKey: boolean };
  /** Segredo do app da Meta (confere a assinatura dos webhooks na caixa). */
  temSegredoApp: boolean;
  /** O aplicativo que o Windows usa para whatsapp:// ("WhatsApp", "WhatsApp Beta"); vazio = nenhum. */
  appWhatsapp: string;
}

export type SegredoWa = 'meta.token' | 'evolution.apikey' | 'waha.apikey' | 'meta.appSecret';

export const SEGREDOS_WA: readonly SegredoWa[] = ['meta.token', 'evolution.apikey', 'waha.apikey', 'meta.appSecret'];

// ---------- Entradas ----------

export interface EnviarWaInput {
  contato?: RefContato;
  /** Sem contato (número em "Sem cadastro"), ou para escolher entre os telefones do contato. */
  numero?: string;
  /** O texto com campos; o main preenche com a mesma função da prévia. */
  texto: string;
  /** Campos a preencher na hora ({valor}, {data_reuniao}…). */
  valores?: Record<string, string>;
  /** A prévia que a tela mostrou: se o main chegar a outro texto, recusa em vez de mandar algo diferente. */
  textoEsperado: string;
  modeloId?: string;
  /** Vazio = o padrão de config. */
  provedor?: ProvedorWa;
}

export interface CriarLoteInput {
  nome: string;
  texto: string;
  modeloId?: string;
  contatos: RefContato[];
  provedor?: ProvedorWa;
}

export interface SalvarModeloWaInput {
  id?: string;
  nome: string;
  texto: string;
  metaTemplate?: ModeloMetaWa | null;
}

/** Tudo opcional: mesclado sobre o salvo. */
export interface SalvarConfigWaInput {
  provedor?: ProvedorWa;
  meta?: Partial<WhatsappConfig['meta']>;
  evolution?: Partial<WhatsappConfig['evolution']>;
  waha?: Partial<WhatsappConfig['waha']>;
  n8n?: Partial<WhatsappConfig['n8n']>;
  link?: Partial<WhatsappConfig['link']>;
  envio?: Partial<WhatsappConfig['envio']>;
  permitirTlsInseguro?: boolean;
  notificar?: boolean;
}

export interface ConferenciaNumero {
  existe: boolean;
  /** O número como o WhatsApp o conhece (contas antigas sem o 9). */
  numeroWa?: string;
  mensagem: string;
}

/** Template aprovado na conta da Meta, para ligar a um modelo do Iris. */
export interface TemplateMeta {
  nome: string;
  idioma: string;
  categoria: string;
  corpo: string;
  /** Quantas variáveis {{n}} o corpo tem. */
  variaveis: number;
}

/** De onde o provedor chama o Iris: este PC, um contêiner Docker neste PC, outro aparelho da rede ou a caixa na nuvem. */
export type ViaWebhookWa = 'local' | 'docker' | 'rede' | 'nuvem';

export interface EnderecoWa {
  origem: OrigemEventoWa;
  via: ViaWebhookWa;
  /** Com a chave mascarada: a inteira só vai para a área de transferência, pelo main. */
  url: string;
  disponivel: boolean;
  /** Por que não está disponível (servidor desligado, sem caixa na nuvem…). */
  falta?: string;
}

export type { ResultadoTeste };

// ---------- Leitura ----------

/** Mensagens de um contato, da mais antiga à mais nova (ordem de conversa). */
export function mensagensDe(file: Pick<WhatsappFile, 'mensagens'>, ref: RefContato): MensagemWa[] {
  return file.mensagens.filter((m) => m.contato && m.contato.tipo === ref.tipo && m.contato.id === ref.id).sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
}

export function naoLidas(file: Pick<WhatsappFile, 'mensagens'>, ref?: RefContato): number {
  return file.mensagens.filter((m) => m.direcao === 'entrada' && !m.vista && (!ref || (m.contato && m.contato.tipo === ref.tipo && m.contato.id === ref.id))).length;
}

/** Última mensagem recebida do número: a janela de 24 h da API oficial conta a partir dela. */
export function ultimaEntrada(file: Pick<WhatsappFile, 'mensagens'>, ref: RefContato): MensagemWa | undefined {
  return mensagensDe(file, ref)
    .filter((m) => m.direcao === 'entrada')
    .pop();
}

export function dentroDaJanela(file: Pick<WhatsappFile, 'mensagens'>, ref: RefContato, agora = Date.now()): boolean {
  const ultima = ultimaEntrada(file, ref);
  return Boolean(ultima && agora - Date.parse(ultima.criadaEm) < LIMITE_JANELA_META_MS);
}
