/**
 * Gravar: o Iris não grava vídeo — a câmera ou o celular gravam. Ele conta
 * (3-2-1), bate a claquete (flash + bipe de 1 kHz no mesmo instante: o ponto
 * de encontro de imagem e áudio na edição), mostra o roteiro e anota as
 * marcas de cada take.
 *
 * Com outra pessoa (Iris com Iris): um convite em texto leva um horário
 * combinado; cada Iris confere o próprio relógio num servidor de hora e conta
 * até o mesmo instante. Os dois bipes saem juntos, perto ou longe.
 *
 * Puro, dos dois lados: nada de electron/node aqui.
 */

export type IdPessoa = 'A' | 'B';

export interface PessoaGravacao {
  id: IdPessoa;
  nome: string;
}

/** Cópia da cena do roteiro: mudar o roteiro depois não muda a gravação. */
export interface CenaGravacao {
  id: string;
  titulo: string;
  /** A fala. Linhas "A:"/"B:" (ou "Nome:") dizem quem fala. */
  texto: string;
}

export interface RoteiroGravacao {
  /** Roteiro de origem neste Iris; ausente no convidado (o roteiro veio no convite). */
  roteiroId?: string;
  titulo: string;
  cenas: CenaGravacao[];
  /** Palavras por minuto do roteiro (briefing ou formato): o ritmo em que as palavras acendem no palco. */
  ppm?: number;
}

/** Gravação a dois. A `chave` é a mesma nos dois Iris: um convite novo da mesma gravação cai nela. */
export interface ConjuntaGravacao {
  chave: string;
  papel: 'anfitriao' | 'convidado';
  parceiro: string;
  euSou: IdPessoa;
  /** Próximo início combinado (epoch ms, hora conferida). Some depois que passa. */
  proximoInicio?: number;
}

export const TIPOS_MARCA = [
  { id: 'bom', rotulo: 'Take bom' },
  { id: 'erro', rotulo: 'Erro' },
  { id: 'repetir', rotulo: 'Repetir' },
  { id: 'nota', rotulo: 'Nota' },
] as const;

export type TipoMarca = (typeof TIPOS_MARCA)[number]['id'];

export function isTipoMarca(v: unknown): v is TipoMarca {
  return typeof v === 'string' && TIPOS_MARCA.some((t) => t.id === v);
}

export interface MarcaTake {
  id: string;
  tipo: TipoMarca;
  /** Milissegundos desde o bipe do take. */
  tMs: number;
  texto: string;
}

export interface TakeGravacao {
  id: string;
  numero: number;
  /** ISO do bipe (na gravação a dois, o instante combinado). */
  inicioEm: string;
  duracaoMs?: number;
  /** Cena em que o take começou (com roteiro). */
  cenaId?: string;
  marcas: MarcaTake[];
  melhor: boolean;
}

export interface SessaoGravacao {
  id: string;
  titulo: string;
  roteiro?: RoteiroGravacao;
  conjunta?: ConjuntaGravacao;
  pessoas: PessoaGravacao[];
  takes: TakeGravacao[];
  notas: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItemChecklistGravacao {
  id: string;
  texto: string;
}

export interface GravacaoFile {
  schemaVersion: number;
  updatedAt: string;
  sessoes: SessaoGravacao[];
  /** "Antes de gravar": a mesma lista para toda gravação. O marcado é do dia (fica na tela, não aqui). */
  checklist: ItemChecklistGravacao[];
}

export interface CriarGravacaoInput {
  titulo?: string;
  roteiroId?: string;
  /** Gravação a dois: nome de quem grava junto. */
  parceiro?: string;
  /** Com roteiro em dupla: quem eu sou nas falas. */
  euSou?: IdPessoa;
}

export interface ConviteInput {
  sessaoId: string;
  /** Instante combinado (epoch ms, já na hora conferida). */
  inicioEm: number;
}

/** O que o convite leva. Vai comprimido e em base64url depois de "IRIS-GRAVAR:". */
export interface DadosConvite {
  v: 1;
  chave: string;
  titulo: string;
  de: string;
  para: string;
  em: number;
  /** Quem o convidado é nas falas. */
  voce: IdPessoa;
  pessoas: PessoaGravacao[];
  roteiro?: { titulo: string; cenas: CenaGravacao[]; ppm?: number };
}

export interface ConviteLido {
  dados: DadosConvite;
  /** Já existe uma gravação com esta chave neste Iris (convite de um take novo). */
  sessaoExistente?: string;
  /** Só a linha "IRIS-GRAVAR:…" achada — o resto do texto copiado nunca sai do main. */
  codigo?: string;
}

export interface EstadoRelogio {
  /** Quanto somar ao relógio deste PC para chegar à hora certa (ms). */
  diferencaMs: number;
  /** Servidor que respondeu; ausente = não deu para conferir (vale o relógio do PC). */
  servidor?: string;
  conferidoEm: number;
  /** Ida e volta do pedido: a incerteza é metade disto. */
  rttMs?: number;
}

export const MARCA_CONVITE = 'IRIS-GRAVAR:';
export const CONVITE_RE = /IRIS-GRAVAR:([A-Za-z0-9_-]{20,})/;

export const CHECKLIST_PADRAO = [
  'Bateria da câmera ou do celular',
  'Espaço livre para gravar',
  'Microfone ligado e testado',
  'Luz de frente, sem janela atrás',
  'Celular no modo não perturbe',
];

/** Dicas para o Tutorial: só orientação prática. */
export const DICAS_GRAVACAO: Array<{ titulo: string; texto: string }> = [
  { titulo: 'Claquete em todo take', texto: 'O flash e o bipe marcam o mesmo instante na imagem e no áudio: na edição, alinhe o pico do bipe com o quadro branco.' },
  { titulo: 'Gravando a dois', texto: 'Cada um grava o seu vídeo. Os dois bipes saem no mesmo instante, então os áudios se alinham pelo bipe.' },
  { titulo: 'Áudio primeiro', texto: 'Microfone perto da boca e longe de ar-condicionado e ventilador. Imagem mais ou menos se perdoa; áudio ruim, não.' },
  { titulo: 'Grave sobra', texto: 'Comece a gravar antes da contagem e pare uns segundos depois de falar. Corte é fácil; falta não se recupera.' },
];

// ---------- Falas por pessoa ----------

export interface TrechoFala {
  /** null = sem dono (narração, ou roteiro de uma pessoa só). */
  pessoa: IdPessoa | null;
  texto: string;
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lê "A: texto", "B: texto" ou "Nome: texto" no começo da linha. Linha sem
 * marca continua com a pessoa da anterior. É só uma convenção de escrita: as
 * cenas dos Roteiros continuam texto livre.
 */
export function falasPorPessoa(texto: string, pessoas: PessoaGravacao[]): TrechoFala[] {
  const marcas = pessoas
    .flatMap((p) => [
      { id: p.id, nome: p.id },
      { id: p.id, nome: p.nome.trim() },
    ])
    .filter((m) => m.nome)
    .map((m) => ({ id: m.id, re: new RegExp(`^\\s*(?:\\*\\*)?${escaparRegex(m.nome)}(?:\\*\\*)?\\s*:\\s*`, 'i') }));

  const trechos: TrechoFala[] = [];
  let atual: IdPessoa | null = null;
  for (const linha of texto.split('\n')) {
    let resto = linha;
    for (const m of marcas) {
      const achado = m.re.exec(linha);
      if (achado) {
        atual = m.id;
        resto = linha.slice(achado[0].length);
        break;
      }
    }
    if (!resto.trim()) continue;
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && ultimo.pessoa === atual && linha === resto) ultimo.texto += `\n${resto}`;
    else trechos.push({ pessoa: atual, texto: resto });
  }
  return trechos;
}

/** O roteiro tem falas marcadas para duas pessoas? */
export function temDuasPessoas(cenas: Array<{ texto: string }>): boolean {
  return cenas.some((c) => /^\s*(?:\*\*)?[AB](?:\*\*)?\s*:/m.test(c.texto));
}

// ---------- Tempo e marcadores ----------

/** "1:02:05" ou "02:05". */
export function formatarRelogio(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const dd = (n: number): string => String(n).padStart(2, '0');
  return h ? `${h}:${dd(m)}:${dd(s % 60)}` : `${dd(m)}:${dd(s % 60)}`;
}

export function rotuloDaMarca(tipo: TipoMarca): string {
  return TIPOS_MARCA.find((t) => t.id === tipo)?.rotulo ?? tipo;
}

export function takesEmOrdem(sessao: SessaoGravacao): TakeGravacao[] {
  return [...sessao.takes].sort((a, b) => a.inicioEm.localeCompare(b.inicioEm));
}

function nomeDaCena(sessao: SessaoGravacao, take: TakeGravacao): string {
  return sessao.roteiro?.cenas.find((c) => c.id === take.cenaId)?.titulo ?? '';
}

export function marcadoresEmTexto(sessao: SessaoGravacao): string {
  const linhas: string[] = [sessao.titulo];
  if (sessao.conjunta) linhas.push(`Com ${sessao.conjunta.parceiro}`);
  for (const take of takesEmOrdem(sessao)) {
    const cena = nomeDaCena(sessao, take);
    linhas.push('');
    linhas.push(
      `Take ${take.numero}${cena ? ` — ${cena}` : ''}${take.melhor ? ' (melhor)' : ''}${take.duracaoMs ? ` — ${formatarRelogio(take.duracaoMs)}` : ''} — bipe às ${new Date(take.inicioEm).toLocaleTimeString('pt-BR')}`,
    );
    for (const m of take.marcas) linhas.push(`  ${formatarRelogio(m.tMs)} — ${rotuloDaMarca(m.tipo)}${m.texto ? `: ${m.texto}` : ''}`);
  }
  return linhas.join('\n');
}

function celulaCsv(v: string): string {
  return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Uma linha por marca, separador ";" (o Excel em português espera assim). */
export function marcadoresEmCsv(sessao: SessaoGravacao): string {
  const linhas = [['Take', 'Cena', 'Melhor', 'Tempo', 'Marca', 'Texto', 'Bipe'].join(';')];
  for (const take of takesEmOrdem(sessao)) {
    const base = [String(take.numero), nomeDaCena(sessao, take), take.melhor ? 'sim' : ''];
    const marcas = take.marcas.length ? take.marcas : [null];
    for (const m of marcas) {
      linhas.push([...base, m ? formatarRelogio(m.tMs) : '', m ? rotuloDaMarca(m.tipo) : '', m?.texto ?? '', take.inicioEm].map(celulaCsv).join(';'));
    }
  }
  return linhas.join('\r\n');
}

// ---------- Palavra por palavra (palco) ----------

export const PPM_PADRAO_PALCO = 150;

/**
 * Quando cada palavra começa (em segundos desde o início da cena), no ritmo
 * `ppm`. Palavra longa demora um pouco mais; pontuação ganha a pausa da fala
 * (vírgula curta, ponto mais longa). Normalizado para o total bater com o ppm:
 * o tempo da cena continua o mesmo que os Roteiros calculam.
 */
export function tempoDasPalavras(palavras: string[], ppm: number): { inicios: number[]; fim: number } {
  const base = 60 / Math.max(60, ppm);
  const brutos = palavras.map((p) => {
    const letras = p.replace(/[^\p{L}\p{N}]/gu, '').length;
    return Math.min(1.6, Math.max(0.7, letras / 5));
  });
  const soma = brutos.reduce((a, b) => a + b, 0) || 1;
  const escala = (palavras.length * base) / soma;
  const inicios: number[] = [];
  let t = 0;
  palavras.forEach((p, i) => {
    inicios.push(t);
    t += brutos[i]! * escala;
    if (/[.!?…]["')\]]*$/.test(p)) t += 0.45;
    else if (/[,;:—–]["')\]]*$/.test(p)) t += 0.2;
  });
  return { inicios, fim: t };
}

/** Índice da palavra que está sendo dita no instante `t` (-1 antes da primeira). */
export function palavraNoInstante(inicios: number[], t: number): number {
  let lo = 0;
  let hi = inicios.length - 1;
  let achado = -1;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    if (inicios[meio]! <= t) {
      achado = meio;
      lo = meio + 1;
    } else hi = meio - 1;
  }
  return achado;
}
