import { camposSemValor, preencher, valoresAutomaticos, type ContextoContrato } from './contratos.campos.js';
import type { ModeloMetaWa } from './whatsapp.types';

/**
 * Campos das mensagens de WhatsApp: os mesmos dos contratos (`{nome}`,
 * `{empresa}`, `{meu_nome}`…) e mais alguns que só fazem sentido numa
 * conversa. A prévia na tela e o texto que o main envia saem desta função —
 * o que se vê é exatamente o que sai.
 */

export interface CampoWa {
  chave: string;
  rotulo: string;
}

/** Os oferecidos no "Inserir campo" (os outros dos contratos também funcionam se digitados). */
export const CAMPOS_WA: readonly CampoWa[] = [
  { chave: 'primeiro_nome', rotulo: 'Primeiro nome' },
  { chave: 'como_chamar', rotulo: 'Apelido (ou primeiro nome)' },
  { chave: 'nome', rotulo: 'Nome completo' },
  { chave: 'saudacao', rotulo: 'Bom dia / Boa tarde / Boa noite' },
  { chave: 'empresa', rotulo: 'Empresa da pessoa' },
  { chave: 'cargo', rotulo: 'Cargo' },
  { chave: 'email', rotulo: 'E-mail' },
  { chave: 'cidade', rotulo: 'Cidade/UF' },
  { chave: 'meu_nome', rotulo: 'Seu nome' },
  { chave: 'meu_telefone', rotulo: 'Seu telefone' },
  { chave: 'meu_email', rotulo: 'Seu e-mail' },
  { chave: 'data_hoje_curta', rotulo: 'Data de hoje' },
];

const CHAVES_WA = new Set(['primeiro_nome', 'como_chamar', 'apelido', 'saudacao']);

export interface ContextoWa extends ContextoContrato {
  /** Hora local de agora (a saudação depende dela). */
  hora: number;
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? '';
}

export function saudacaoDaHora(hora: number): string {
  return hora >= 5 && hora < 12 ? 'Bom dia' : hora >= 12 && hora < 18 ? 'Boa tarde' : 'Boa noite';
}

export function valoresWa(ctx: ContextoWa): Record<string, string> {
  const c = ctx.contato;
  const ehEmpresa = 'razaoSocial' in c;
  const nome = ehEmpresa ? c.nomeFantasia || c.razaoSocial : c.nome;
  const apelido = ehEmpresa ? '' : c.apelido.trim();
  return {
    ...valoresAutomaticos(ctx),
    // Numa conversa, a empresa se chama pelo nome fantasia.
    nome,
    primeiro_nome: ehEmpresa ? nome : primeiroNome(nome),
    apelido,
    como_chamar: apelido || (ehEmpresa ? nome : primeiroNome(nome)),
    saudacao: saudacaoDaHora(ctx.hora),
  };
}

/** Campo que o Iris sabe sozinho (do cadastro, de Ajustes ou da hora); os outros se preenchem na hora. */
export function ehCampoAutomaticoWa(chave: string, automaticos: Record<string, string>): boolean {
  return CHAVES_WA.has(chave) || chave in automaticos;
}

/**
 * O texto que sai. Campo sem valor fica `{assim}` — e a tela e o main
 * recusam enviar enquanto sobrar algum (`camposFaltando`).
 */
export function textoFinalWa(texto: string, ctx: ContextoWa, manuais: Record<string, string> = {}): string {
  return preencher(texto, { ...valoresWa(ctx), ...manuais });
}

export function camposFaltando(textoFinal: string): string[] {
  return camposSemValor(textoFinal);
}

/** Corpo de um template da Meta preenchido: cada {{n}} recebe a variável n já com os campos do Iris. */
export function corpoDoTemplate(meta: ModeloMetaWa, ctx: ContextoWa, manuais: Record<string, string> = {}): { texto: string; parametros: string[] } {
  const parametros = meta.variaveis.map((v) => textoFinalWa(v, ctx, manuais));
  const texto = meta.corpo.replace(/\{\{(\d+)\}\}/g, (inteiro, n: string) => parametros[Number(n) - 1] ?? inteiro);
  return { texto, parametros };
}

/** Quantas variáveis {{n}} um corpo de template tem (a maior delas). */
export function variaveisDoCorpo(corpo: string): number {
  let maior = 0;
  for (const m of corpo.matchAll(/\{\{(\d+)\}\}/g)) maior = Math.max(maior, Number(m[1]));
  return maior;
}
