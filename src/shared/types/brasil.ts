/**
 * Documentos, telefones, endereços e datas do jeito brasileiro. Puro e sem
 * imports: o renderer usa em runtime (formatar ao sair do campo, prévia do
 * contrato) e o main também (preencher o contrato que fica gravado) — os dois
 * precisam dar o mesmo resultado.
 */

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export function soDigitos(texto: string): string {
  return texto.replace(/\D+/g, '');
}

/** Dígitos verificadores de CPF/CNPJ: confere a conta, não se o documento existe. */
export function cpfValido(cpf: string): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (n: number): number => {
    let soma = 0;
    for (let i = 0; i < n; i += 1) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

export function cnpjValido(cnpj: string): boolean {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digito = (n: number): number => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + Number(d[i]) * p, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}

/** CPF ou CNPJ pelo tamanho; o que não tem tamanho de nenhum fica como digitado. */
export function formatarDocumento(doc: string): string {
  const d = soDigitos(doc);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return doc.trim();
}

/** Aviso para a tela; `undefined` = vazio ou certo. Nunca bloqueia a gravação. */
export function problemaDoDocumento(doc: string, tipo: 'cpf' | 'cnpj'): string | undefined {
  const d = soDigitos(doc);
  if (!d) return undefined;
  if (tipo === 'cpf') return d.length !== 11 ? 'O CPF tem 11 dígitos.' : cpfValido(d) ? undefined : 'Os dígitos deste CPF não conferem — confira se não há número trocado.';
  return d.length !== 14 ? 'O CNPJ tem 14 dígitos.' : cnpjValido(d) ? undefined : 'Os dígitos deste CNPJ não conferem — confira se não há número trocado.';
}

/** "(11) 98765-4321", "(11) 3456-7890"; com +55 na frente, tira. Fora disso, como digitado. */
export function formatarTelefone(tel: string): string {
  let d = soDigitos(tel);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel.trim();
}

/** Número para o link do WhatsApp (wa.me): só dígitos, com 55 quando é número brasileiro. */
export function telefoneWhatsapp(tel: string): string | undefined {
  const d = soDigitos(tel);
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.length >= 12) return d;
  return undefined;
}

export function formatarCep(cep: string): string {
  const d = soDigitos(cep);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep.trim();
}

export interface Endereco {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export function enderecoVazio(): Endereco {
  return { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };
}

function campo(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Endereço defensivo (disco, tela, backup): o mesmo formato em Ajustes e em Contatos. */
export function lerEndereco(raw: unknown): Endereco {
  const c = (raw ?? {}) as Partial<Endereco>;
  const uf = campo(c.uf, 2).toUpperCase();
  return {
    cep: formatarCep(campo(c.cep, 12)),
    logradouro: campo(c.logradouro, 160),
    numero: campo(c.numero, 20),
    complemento: campo(c.complemento, 80),
    bairro: campo(c.bairro, 80),
    cidade: campo(c.cidade, 80),
    uf: (UFS as readonly string[]).includes(uf) ? uf : '',
  };
}

/** "Rua A, 10, sala 2 — Centro — São Paulo/SP — CEP 01000-000"; partes vazias somem. */
export function enderecoPorExtenso(e: Endereco): string {
  const rua = [e.logradouro, e.numero, e.complemento].map((p) => p.trim()).filter(Boolean).join(', ');
  const cidade = [e.cidade.trim(), e.uf.trim()].filter(Boolean).join('/');
  const cep = e.cep.trim() ? `CEP ${formatarCep(e.cep)}` : '';
  return [rua, e.bairro.trim(), cidade, cep].filter(Boolean).join(' — ');
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * "8 de outubro de 2026" a partir de "AAAA-MM-DD" (data local). Montada à mão:
 * `new Date('2026-10-08')` seria meia-noite UTC — no Brasil, o dia anterior.
 */
export function dataIsoPorExtenso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1] ?? ''} de ${m[1]}`;
}

/** "08/10/2026" a partir de "AAAA-MM-DD". */
export function dataIsoCurta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Hoje como "AAAA-MM-DD" pelo relógio local (toISOString daria a data UTC). */
export function hojeLocal(agora = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

/** "R$ 1.500,00". */
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Lê "1.500,50", "1500.5", "R$ 2 mil" não; devolve undefined quando não é número. */
export function lerMoeda(texto: string): number | undefined {
  const limpo = texto.replace(/[R$\s]/g, '');
  if (!limpo) return undefined;
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}
