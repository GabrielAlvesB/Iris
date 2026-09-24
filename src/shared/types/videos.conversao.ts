import {
  CAMPOS_VIDEO,
  REDES_CONHECIDAS,
  VIDEO_STATUS,
  type CampoVideo,
  type LogoRede,
  type MapeamentoColunas,
  type OrigemSheets,
  type RedeSocial,
  type VideoStatus,
} from './videos.types.js';

/**
 * Regras puras de conversão de texto de planilha para campos de vídeo. Ficam
 * em shared/types porque o main as usa para importar e o renderer, para mostrar
 * a prévia — as duas pontas precisam concordar exatamente.
 */

/** Minúsculas e sem acento, para comparar "Vídeo", "video" e "VIDEO" como iguais. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

const HASHTAG_REGEX = /#?([\p{L}\p{N}_]+)/gu;

/**
 * Aceita "#a #b", "a, b", "#a,#b" ou uma por linha. Guarda sem o "#" e sem
 * repetir (ignorando caixa), preservando a grafia da primeira ocorrência —
 * #HoraDeCodar é mais legível que #horadecodar.
 */
export function extrairHashtags(texto: string): string[] {
  const vistas = new Set<string>();
  const resultado: string[] = [];
  for (const match of texto.matchAll(HASHTAG_REGEX)) {
    const tag = match[1];
    if (!tag) continue;
    const chave = normalizar(tag);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    resultado.push(tag);
  }
  return resultado;
}

const HASHTAG_ESCRITA_REGEX = /#([\p{L}\p{N}_]+)/gu;

/**
 * Hashtags escritas no meio de um texto corrido (legenda): só o que tem #.
 * extrairHashtags, ao contrário, lê um campo que é só de hashtags, onde o #
 * é opcional — numa legenda isso transformaria cada palavra em hashtag.
 */
export function hashtagsDoTexto(texto: string): string[] {
  const vistas = new Set<string>();
  const resultado: string[] = [];
  for (const match of texto.matchAll(HASHTAG_ESCRITA_REGEX)) {
    const tag = match[1];
    if (!tag || vistas.has(normalizar(tag))) continue;
    vistas.add(normalizar(tag));
    resultado.push(tag);
  }
  return resultado;
}

/** Divide listas escritas à mão: vírgula, ponto e vírgula, barra, "e" ou quebra de linha. */
export function dividirLista(texto: string): string[] {
  return texto
    .split(/[,;/\n|]|\s+e\s+/)
    .map((parte) => parte.trim())
    .filter((parte) => parte !== '');
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

function dataValida(ano: number, mes: number, dia: number): string | undefined {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return undefined;
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

/**
 * Datas como aparecem em planilha brasileira: 24/09/2026, 24/09/26, 2026-09-24
 * ou o número serial do Excel (dias desde 30/12/1899). Devolve YYYY-MM-DD.
 */
export function parseData(texto: string): string | undefined {
  const valor = texto.trim();
  if (!valor) return undefined;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(valor);
  if (m) return dataValida(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(valor);
  if (m) {
    const anoBruto = Number(m[3]);
    const ano = m[3]!.length === 2 ? 2000 + anoBruto : anoBruto;
    return dataValida(ano, Number(m[2]), Number(m[1]));
  }

  if (/^\d{5}(\.\d+)?$/.test(valor)) {
    const serial = Math.floor(Number(valor));
    const base = Date.UTC(1899, 11, 30);
    const data = new Date(base + serial * 86_400_000);
    return dataValida(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate());
  }

  return undefined;
}

/** "18:30", "18h30", "18h", "9:05" ou fração de dia do Excel (0.77). Devolve HH:mm. */
export function parseHora(texto: string): string | undefined {
  const valor = texto.trim().toLowerCase();
  if (!valor) return undefined;

  const m = /(\d{1,2})\s*(?::|h)\s*(\d{2})?/.exec(valor);
  if (m) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h > 23 || min > 59) return undefined;
    return `${doisDigitos(h)}:${doisDigitos(min)}`;
  }

  if (/^0?\.\d+$/.test(valor)) {
    const minutos = Math.round(Number(valor) * 24 * 60);
    return `${doisDigitos(Math.floor(minutos / 60) % 24)}:${doisDigitos(minutos % 60)}`;
  }

  return undefined;
}

const SINONIMOS_STATUS: Record<string, VideoStatus> = {
  ideia: 'ideia',
  ideias: 'ideia',
  backlog: 'ideia',
  'a fazer': 'ideia',
  pendente: 'ideia',
  roteiro: 'roteiro',
  roteirizando: 'roteiro',
  gravacao: 'gravacao',
  gravar: 'gravacao',
  gravando: 'gravacao',
  gravado: 'edicao',
  edicao: 'edicao',
  editando: 'edicao',
  editar: 'edicao',
  pronto: 'pronto',
  finalizado: 'pronto',
  agendado: 'agendado',
  programado: 'agendado',
  publicado: 'publicado',
  postado: 'publicado',
  feito: 'publicado',
  arquivado: 'arquivado',
  cancelado: 'arquivado',
};

export function resolverStatus(texto: string): VideoStatus | undefined {
  const chave = normalizar(texto);
  if (!chave) return undefined;
  const porRotulo = VIDEO_STATUS.find((s) => normalizar(s.rotulo) === chave || s.id === chave);
  return porRotulo?.id ?? SINONIMOS_STATUS[chave];
}

/**
 * Palpite de mapeamento pelo nome das colunas, usado só na primeira vez que
 * uma aba é enviada. Cada coluna é usada no máximo uma vez.
 */
export function sugerirMapeamento(colunas: Array<{ id: string; label: string }>): MapeamentoColunas {
  const usadas = new Set<string>();
  const mapeamento: MapeamentoColunas = {};

  CAMPOS_VIDEO.forEach((campo) => {
    const dicas = campo.dicas.map(normalizar);
    const exata = colunas.find((c) => !usadas.has(c.id) && dicas.includes(normalizar(c.label)));
    const parcial =
      exata ?? colunas.find((c) => !usadas.has(c.id) && dicas.some((d) => normalizar(c.label).includes(d)));
    if (parcial) {
      mapeamento[campo.id as CampoVideo] = parcial.id;
      usadas.add(parcial.id);
    }
  });

  return mapeamento;
}

/**
 * Logo de uma rede pelo nome escrito: "Instagram", "insta", "Reels do IG"...
 * Nome curto (sigla) precisa bater exato; nome longo pode estar contido.
 */
export function inferirLogo(nome: string): LogoRede | undefined {
  const alvo = normalizar(nome);
  if (!alvo) return undefined;
  const exata = REDES_CONHECIDAS.find((r) => r.dicas.some((d) => d === alvo));
  if (exata) return exata.id;
  return REDES_CONHECIDAS.find((r) => r.dicas.some((d) => d.length > 3 && alvo.includes(d)))?.id;
}

/**
 * Acha a rede cadastrada que corresponde a um nome escrito na planilha: pelo
 * nome, pela sigla ou, por último, pelo logo ("Reels" → a rede com logo do
 * Instagram, qualquer que seja o nome que o usuário deu a ela).
 */
export function acharRede(redes: RedeSocial[], escrito: string): RedeSocial | undefined {
  const alvo = normalizar(escrito);
  if (!alvo) return undefined;
  const direta = redes.find((r) => normalizar(r.nome) === alvo || normalizar(r.sigla) === alvo);
  if (direta) return direta;
  const logo = inferirLogo(escrito);
  return logo ? redes.find((r) => r.logo === logo) : undefined;
}

/** "conteudo.xlsx › Setembro", ou o nome da tabela quando ela foi criada no Iris. */
export function descreverOrigem(origem: Pick<OrigemSheets, 'arquivoNome' | 'abaNome' | 'tabelaNome'>): string {
  if (origem.arquivoNome) return [origem.arquivoNome, origem.abaNome ?? origem.tabelaNome].filter(Boolean).join(' › ');
  return origem.tabelaNome;
}

/**
 * Score de 0 a 100 como aparece em planilha: "85", "85%", "85,5", "85/100".
 * Fora da faixa ou não numérico devolve undefined — melhor ficar sem score
 * (e aparecer na conferência) do que gravar um número errado.
 */
export function parseScore(texto: string): number | undefined {
  const valor = texto.trim().replace('%', '').replace(/\s*\/\s*100$/, '').replace(',', '.');
  if (!valor || !/^-?\d+(\.\d+)?$/.test(valor)) return undefined;
  const n = Math.round(Number(valor) * 10) / 10;
  return n >= 0 && n <= 100 ? n : undefined;
}

export const FAIXAS_SCORE = [
  { id: 'baixo', rotulo: 'Baixo', min: 0, max: 39.99, tom: 'erro' },
  { id: 'regular', rotulo: 'Regular', min: 40, max: 59.99, tom: 'atencao' },
  { id: 'bom', rotulo: 'Bom', min: 60, max: 79.99, tom: 'neutro' },
  { id: 'excelente', rotulo: 'Excelente', min: 80, max: 100, tom: 'ok' },
] as const;

export type FaixaScore = (typeof FAIXAS_SCORE)[number];

export function faixaDoScore(score: number): FaixaScore {
  return FAIXAS_SCORE.find((f) => score >= f.min && score <= f.max) ?? FAIXAS_SCORE[0];
}
