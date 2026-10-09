import type { ContatosFile, EmpresaCrm, Pessoa, RefContato, Telefone } from './contatos.types';
import { formatarTelefone, soDigitos, telefoneWhatsapp } from './brasil.js';

/**
 * Números de WhatsApp. Puro, dos dois lados: a tela mostra o número que o main
 * vai usar, e a resposta que chega casa com o cadastro pela mesma regra.
 *
 * O nono dígito: celulares brasileiros têm 9 dígitos depois do DDD, mas contas
 * antigas do WhatsApp continuam com o id de 8 (55 11 8765-4321). A resposta de
 * quem tem conta antiga chega nesse formato e não casaria com "(11) 98765-4321"
 * do cadastro — por isso a comparação aceita as duas formas.
 */

/** Só dígitos, com código do país; `undefined` se não dá para ser WhatsApp. */
export function numeroWhatsapp(tel: string): string | undefined {
  const n = telefoneWhatsapp(tel);
  return n && n.length >= 12 && n.length <= 15 ? n : undefined;
}

/** As formas em que o mesmo número brasileiro pode aparecer (com e sem o 9). */
export function variantesDoNumero(numero: string): string[] {
  const d = soDigitos(numero);
  const formas = new Set([d]);
  if (d.startsWith('55')) {
    if (d.length === 13 && d[4] === '9') formas.add(d.slice(0, 4) + d.slice(5));
    if (d.length === 12 && /[6-9]/.test(d[4] ?? '')) formas.add(`${d.slice(0, 4)}9${d.slice(4)}`);
  }
  return [...formas];
}

export function mesmoNumeroWa(a: string, b: string): boolean {
  const va = variantesDoNumero(a);
  return variantesDoNumero(b).some((x) => va.includes(x));
}

/** Telefones que podem ser WhatsApp: os marcados como WhatsApp primeiro, depois os celulares. */
export function telefonesWhatsappDe(c: Pessoa | EmpresaCrm): Telefone[] {
  return [...c.telefones.filter((t) => t.tipo === 'whatsapp'), ...c.telefones.filter((t) => t.tipo === 'celular')].filter((t) => numeroWhatsapp(t.numero));
}

export function numeroDoContato(c: Pessoa | EmpresaCrm): string | undefined {
  const t = telefonesWhatsappDe(c)[0];
  return t ? numeroWhatsapp(t.numero) : undefined;
}

/**
 * O contato dono do número. Ativos antes dos arquivados; telefone marcado como
 * WhatsApp antes de celular (o mesmo número pode estar em dois cadastros).
 */
export function contatoDoNumero(file: Pick<ContatosFile, 'pessoas' | 'empresas'>, numero: string): RefContato | undefined {
  const todos: Array<{ ref: RefContato; c: Pessoa | EmpresaCrm }> = [
    ...file.pessoas.map((c) => ({ ref: { tipo: 'pessoa' as const, id: c.id }, c })),
    ...file.empresas.map((c) => ({ ref: { tipo: 'empresa' as const, id: c.id }, c })),
  ].sort((a, b) => Number(a.c.arquivado) - Number(b.c.arquivado));
  for (const tipo of ['whatsapp', 'celular', 'fixo'] as const) {
    const achado = todos.find(({ c }) => c.telefones.some((t) => t.tipo === tipo && mesmoNumeroWa(soDigitos(telefoneWhatsapp(t.numero) ?? t.numero), numero)));
    if (achado) return achado.ref;
  }
  return undefined;
}

/** "(11) 98765-4321" para número brasileiro; "+351 912 345 678" fica "+351912345678". */
export function formatarNumeroWa(numero: string): string {
  const d = soDigitos(numero);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return formatarTelefone(d);
  return d ? `+${d}` : numero;
}
