import type { PerfilUsuario } from './ajustes.types';
import type { EmpresaCrm, Pessoa } from './contatos.types';
import { dataIsoCurta, dataIsoPorExtenso, enderecoPorExtenso, formatarTelefone } from './brasil.js';

/**
 * Campos dos modelos de contrato: `{nome}`, `{documento}`, `{valor}`… Puro e
 * usado pelos dois lados — a prévia na tela e o texto gravado saem da mesma
 * função, então o que se vê é o que fica no contrato.
 *
 * Campo que não está no catálogo (`{valor}`, `{prazo}`, `{forma_de_pagamento}`)
 * é um campo a preencher na hora de gerar.
 */

export type GrupoCampo = 'contato' | 'empresa' | 'voce' | 'data';

export interface CampoContrato {
  chave: string;
  rotulo: string;
  grupo: GrupoCampo;
}

export const GRUPOS_CAMPO: ReadonlyArray<{ id: GrupoCampo; rotulo: string }> = [
  { id: 'contato', rotulo: 'Do contato' },
  { id: 'empresa', rotulo: 'Da empresa da pessoa' },
  { id: 'voce', rotulo: 'Seus dados (Ajustes)' },
  { id: 'data', rotulo: 'Datas e local' },
];

export const CAMPOS_CONTRATO: readonly CampoContrato[] = [
  { chave: 'nome', rotulo: 'Nome (ou razão social)', grupo: 'contato' },
  { chave: 'nome_fantasia', rotulo: 'Nome fantasia', grupo: 'contato' },
  { chave: 'documento', rotulo: 'CPF ou CNPJ', grupo: 'contato' },
  { chave: 'rg', rotulo: 'RG', grupo: 'contato' },
  { chave: 'endereco', rotulo: 'Endereço completo', grupo: 'contato' },
  { chave: 'cidade', rotulo: 'Cidade/UF', grupo: 'contato' },
  { chave: 'email', rotulo: 'E-mail', grupo: 'contato' },
  { chave: 'telefone', rotulo: 'Telefone', grupo: 'contato' },
  { chave: 'cargo', rotulo: 'Cargo', grupo: 'contato' },
  { chave: 'empresa', rotulo: 'Empresa (razão social)', grupo: 'empresa' },
  { chave: 'empresa_cnpj', rotulo: 'CNPJ da empresa', grupo: 'empresa' },
  { chave: 'empresa_endereco', rotulo: 'Endereço da empresa', grupo: 'empresa' },
  { chave: 'meu_nome', rotulo: 'Seu nome (ou razão social)', grupo: 'voce' },
  { chave: 'meu_documento', rotulo: 'Seu CPF ou CNPJ', grupo: 'voce' },
  { chave: 'meu_endereco', rotulo: 'Seu endereço', grupo: 'voce' },
  { chave: 'meu_email', rotulo: 'Seu e-mail', grupo: 'voce' },
  { chave: 'meu_telefone', rotulo: 'Seu telefone', grupo: 'voce' },
  { chave: 'meu_representante', rotulo: 'Seu representante legal', grupo: 'voce' },
  { chave: 'meu_representante_cpf', rotulo: 'CPF do representante', grupo: 'voce' },
  { chave: 'data_hoje', rotulo: 'Data de hoje por extenso', grupo: 'data' },
  { chave: 'data_hoje_curta', rotulo: 'Data de hoje (dd/mm/aaaa)', grupo: 'data' },
  { chave: 'foro', rotulo: 'Cidade do foro', grupo: 'data' },
];

const CHAVES = new Set(CAMPOS_CONTRATO.map((c) => c.chave));

/** Um campo: letras minúsculas, números e "_" entre chaves. Acentos viram campo manual com o nome que tiver. */
const PADRAO_CAMPO = /\{([a-z0-9_]+)\}/g;

export interface ContextoContrato {
  contato: Pessoa | EmpresaCrm;
  /** A empresa do CRM em que a pessoa trabalha, se houver. */
  empresaDaPessoa?: EmpresaCrm;
  perfil: PerfilUsuario;
  /** AAAA-MM-DD, data local. */
  hoje: string;
}

function cidadeUf(cidade: string, uf: string): string {
  return [cidade.trim(), uf.trim()].filter(Boolean).join('/');
}

/** Os valores que o Iris sabe sozinho. Vazio quando o cadastro não tem o dado. */
export function valoresAutomaticos(ctx: ContextoContrato): Record<string, string> {
  const c = ctx.contato;
  const ehEmpresa = 'razaoSocial' in c;
  const e = ctx.empresaDaPessoa;
  const p = ctx.perfil;
  return {
    nome: ehEmpresa ? c.razaoSocial : c.nome,
    nome_fantasia: ehEmpresa ? c.nomeFantasia : '',
    documento: ehEmpresa ? c.cnpj : c.cpf,
    rg: ehEmpresa ? '' : c.rg,
    endereco: enderecoPorExtenso(c.endereco),
    cidade: cidadeUf(c.endereco.cidade, c.endereco.uf),
    email: c.emails[0] ?? '',
    telefone: c.telefones[0] ? formatarTelefone(c.telefones[0].numero) : '',
    cargo: ehEmpresa ? '' : c.cargo,
    empresa: e?.razaoSocial ?? '',
    empresa_cnpj: e?.cnpj ?? '',
    empresa_endereco: e ? enderecoPorExtenso(e.endereco) : '',
    meu_nome: p.nome,
    meu_documento: p.documento,
    meu_endereco: enderecoPorExtenso(p.endereco),
    meu_email: p.email,
    meu_telefone: p.telefone,
    meu_representante: p.representante,
    meu_representante_cpf: p.representanteCpf,
    data_hoje: dataIsoPorExtenso(ctx.hoje),
    data_hoje_curta: dataIsoCurta(ctx.hoje),
    foro: p.cidadeForo.trim() || cidadeUf(p.endereco.cidade, p.endereco.uf),
  };
}

/** Os campos que aparecem no texto, na ordem da primeira aparição, sem repetir. */
export function camposDoTexto(texto: string): string[] {
  const vistos: string[] = [];
  for (const m of texto.matchAll(PADRAO_CAMPO)) {
    if (!vistos.includes(m[1]!)) vistos.push(m[1]!);
  }
  return vistos;
}

/** Os que não vêm do cadastro: viram campos a preencher ao gerar o contrato. */
export function camposManuais(texto: string): string[] {
  return camposDoTexto(texto).filter((c) => !CHAVES.has(c));
}

export function ehCampoAutomatico(chave: string): boolean {
  return CHAVES.has(chave);
}

/** "forma_de_pagamento" → "Forma de pagamento"; os do catálogo usam o rótulo dele. */
export function rotuloDoCampo(chave: string): string {
  const doCatalogo = CAMPOS_CONTRATO.find((c) => c.chave === chave);
  if (doCatalogo) return doCatalogo.rotulo;
  const t = chave.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Troca cada `{campo}` pelo valor. Campo sem valor fica como está — a tela
 * aponta o que falta antes de gerar, em vez de o contrato sair com buraco.
 */
export function preencher(texto: string, valores: Record<string, string>): string {
  return texto.replace(PADRAO_CAMPO, (inteiro, chave: string) => {
    const v = valores[chave]?.trim();
    return v ? v : inteiro;
  });
}

/** Campos que ficaram sem valor depois de preencher. */
export function camposSemValor(textoPreenchido: string): string[] {
  return camposDoTexto(textoPreenchido);
}

/**
 * Ponto de partida de um modelo novo: só a estrutura, com os campos no lugar.
 * O Iris não escreve cláusula jurídica — o texto de cada parte é de quem usa.
 */
export const ESQUELETO_MODELO = `# Título do contrato

## Partes

**De um lado:** {meu_nome}, inscrito(a) sob o documento {meu_documento}, com endereço em {meu_endereco}.

**De outro lado:** {nome}, inscrito(a) sob o documento {documento}, com endereço em {endereco}.

## Objeto

(Descreva aqui o que está sendo contratado.)

## Valor e pagamento

Valor: {valor}.
Forma de pagamento: {forma_de_pagamento}.

## Prazo

(Descreva o prazo e as condições de entrega.)

## Disposições gerais

(Escreva as demais condições.)

Foro: {foro}.

{data_hoje}.`;
