import {
  FORMATOS_ROTEIRO,
  TIPOS_CENA,
  type BriefingRoteiro,
  type CenaRoteiro,
  type FonteRoteiro,
  type FormatoRoteiro,
  type Roteiro,
  type TipoCena,
} from './roteiros.types.js';

/**
 * Cenas ↔ markdown, e o tempo de fala. Puro e sem dependências: o main usa
 * na migração da v1 (texto livre → cenas) e no card do Kanban; o renderer no
 * modo texto livre, na importação de .md, na prévia e na exportação.
 *
 * O markdown gerado é sempre o mesmo formato, e a leitura dele devolve as
 * mesmas cenas (ida e volta sem perda). A leitura também aceita o jeito livre
 * como os roteiros eram escritos antes — "[0:00–0:45] — Abertura" sem "##",
 * "[Cena: …]", "[Texto na tela]: …", "[Fontes]:" seguido de linhas.
 */

export type GerarId = () => string;

const PPM_PADRAO = 150;

// ---------- Tempo ----------

/** "1:05" → 65; "12" → 12. */
export function lerTempo(texto: string): number | undefined {
  const m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{2})\s*$|^\s*(\d+):(\d{2})\s*$/.exec(texto);
  if (!m) return undefined;
  if (m[4] !== undefined) return Number(m[4]) * 60 + Number(m[5]);
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** 65 → "1:05"; 3725 → "1:02:05". */
export function formatarTempo(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/**
 * Duração escrita à mão ("12–15 minutos", "45s", "8 min", "1h") em segundos.
 * Num intervalo vale o maior — a linha do tempo avisa quando passa dele.
 */
export function lerDuracaoTexto(texto: string): number | undefined {
  const t = texto.toLowerCase().replace(',', '.');
  const numeros = [...t.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (!numeros.length) return undefined;
  const n = Math.max(...numeros);
  // "45s" não tem fronteira de palavra entre o 5 e o s: a unidade é lida colada ao número.
  if (/\d\s*h\b|hora/.test(t)) return Math.round(n * 3600);
  if (/\d\s*(s|seg|segundos?)\b|"/.test(t) && !/min/.test(t)) return Math.round(n);
  return Math.round(n * 60);
}

export function ppmDe(roteiro: Pick<Roteiro, 'formato' | 'briefing'>): number {
  return roteiro.briefing.palavrasPorMinuto || FORMATOS_ROTEIRO.find((f) => f.id === roteiro.formato)?.ppm || PPM_PADRAO;
}

export function contarPalavras(texto: string): number {
  return texto.replace(/[*_`>#[\]]/g, ' ').split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
}

/** Segundos de fala da cena, pelo ritmo do roteiro. */
export function tempoDaCena(cena: Pick<CenaRoteiro, 'fala'>, ppm: number): number {
  return Math.round((contarPalavras(cena.fala) / ppm) * 60);
}

export function tempoTotal(roteiro: Pick<Roteiro, 'cenas' | 'formato' | 'briefing'>): number {
  const ppm = ppmDe(roteiro);
  return roteiro.cenas.reduce((t, c) => t + tempoDaCena(c, ppm), 0);
}

/** Só o que é falado, na ordem — teleprompter, cartões da lista, "copiar só a fala". */
export function falaCompleta(cenas: CenaRoteiro[]): string {
  return cenas
    .map((c) => c.fala.trim())
    .filter(Boolean)
    .join('\n\n');
}

// ---------- Tipo da cena pelo título ----------

export function tipoPeloTitulo(titulo: string, indice: number, total: number): TipoCena {
  const t = titulo.toLowerCase();
  if (/gancho|hook/.test(t)) return 'gancho';
  if (/\bcta\b|chamada|inscrev|call to action|siga|comente/.test(t)) return 'cta';
  if (/encerra|conclus|fechamento|despedida|final\b/.test(t)) return 'encerramento';
  if (/demonstra|tutorial|passo a passo|na pr[aá]tica|mostrando/.test(t)) return 'demonstracao';
  if (/abertura|introdu|intro\b|apresenta/.test(t)) return 'abertura';
  if (indice === 0 && total > 1) return 'abertura';
  return 'secao';
}

// ---------- Markdown → cenas ----------

/** "## [0:00 - 0:45] Abertura", "[0:00–0:45] — Abertura", "**[0:45 – 2:30] Título**". */
const SECAO_COM_TEMPO = /^\s*(?:#{1,3}\s*)?\**\s*\[\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]+\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\]\s*\**\s*[-–—:]*\s*(.*?)\s*\**\s*$/;
/** "## Título" / "### Título" (o "# Título" de nível 1 é o título do roteiro). */
const SECAO_SEM_TEMPO = /^\s*#{2,3}\s+(.+?)\s*#*\s*$/;
const TITULO_ROTEIRO = /^\s*#\s+(.+?)\s*#*\s*$/;
/** "[Cena: x]", "**[Cena: x]**", "[Cena]: x", "[Texto na tela]:" (valor nas linhas de baixo). */
const ROTULO_COLCHETE = /^\s*(?:\*\*|__)?\[([^\]:]{1,40})(?::\s*([^\]]*))?\](?:\*\*|__)?\s*:?\s*(.*)$/;
const DIRECAO_SOLTA = /^\s*(?:\*\*|__|\*|_)?\[(.+)\](?:\*\*|__|\*|_)?\s*$/;
const NOTA = /^\s*>\s*(?:\*\*)?nota(?:\*\*)?\s*:?\s*(.*)$/i;
const SEPARADOR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const ROTULO_FALA = /^\s*\*{0,2}(?:NARRA[ÇC][ÃA]O|FALA|LOCU[ÇC][ÃA]O|APRESENTADOR[A]?|VOZ)\s*:?\*{0,2}\s*:?\s*/i;
const FONTES_TITULO = /^(fontes|refer[eê]ncias)\b/i;
/** Linhas de ficha antes da primeira cena: "Tom: …", "**Público:** …". */
const FICHA = /^\s*\**\s*(dura[çc][ãa]o(?: estimada| pretendida| alvo)?|tom|p[úu]blico(?:-alvo)?|objetivo|tema|formato)\s*\**\s*:\s*\**\s*(.+)$/i;

type Destino = 'visual' | 'textoTela' | 'fontes' | 'notas';

function destinoDoRotulo(rotulo: string): Destino {
  const r = rotulo.trim().toLowerCase();
  if (/fonte|refer[eê]ncia/.test(r)) return 'fontes';
  if (/tela|gr[aá]fico|letreiro|legenda|lettering|lower ?third/.test(r)) return 'textoTela';
  if (/cena|visual|b-?roll|imagem|v[ií]deo|enquadramento|corte|close|plano|tomada/.test(r)) return 'visual';
  return 'notas';
}

function juntar(atual: string, novo: string): string {
  const n = novo.trim();
  if (!n) return atual;
  return atual ? `${atual}\n${n}` : n;
}

/** "Gematsu | Bloomberg", uma URL, "Título — url": vira fontes. */
function fontesDoTexto(texto: string, gerarId: GerarId): FonteRoteiro[] {
  return texto
    .split(/\n|\s\|\s|^\|$/)
    .map((p) => p.replace(/^\s*[-*•]\s*/, '').trim())
    .filter((p) => p && p !== '|')
    .map((p) => {
      const url = /(https?:\/\/\S+|\b[\w-]+(?:\.[\w-]+)+\/\S*)/.exec(p)?.[1] ?? '';
      const titulo = url ? p.replace(url, '').replace(/[—–:-]\s*$/, '').trim() : p;
      return { id: gerarId(), titulo: titulo || url, url, nota: '' };
    });
}

export interface LeituraMarkdown {
  titulo?: string;
  cenas: CenaRoteiro[];
  fontes: FonteRoteiro[];
  /** Ficha encontrada antes da primeira cena (tom, público, duração…). */
  briefing: Partial<BriefingRoteiro>;
  duracaoTexto?: string;
}

function novaCena(gerarId: GerarId, titulo: string, inicio?: number, fim?: number): CenaRoteiro & { _inicio?: number } {
  return {
    id: gerarId(),
    tipo: 'secao',
    titulo: titulo.replace(/\*\*/g, '').trim(),
    fala: '',
    visual: '',
    textoTela: '',
    notas: '',
    ...(inicio !== undefined && fim !== undefined && fim > inicio ? { duracaoAlvoSeg: fim - inicio } : {}),
  };
}

/**
 * Lê um roteiro em markdown (ou no texto livre de antes). `anteriores`: as
 * cenas atuais — a cena na mesma posição com o mesmo título mantém id e tipo,
 * para alternar entre os modos não mexer no que o usuário escolheu.
 */
export function cenasDoMarkdown(md: string, gerarId: GerarId, anteriores: CenaRoteiro[] = []): LeituraMarkdown {
  const linhas = md.replace(/\r\n/g, '\n').split('\n');
  const cenas: CenaRoteiro[] = [];
  const fontes: FonteRoteiro[] = [];
  const briefing: Partial<BriefingRoteiro> = {};
  let titulo: string | undefined;
  let duracaoTexto: string | undefined;
  let atual: CenaRoteiro | null = null;
  let emFontes = false;
  /** Rótulo sem valor na mesma linha ("[Fontes]:"): as linhas seguintes são dele. */
  let continuacao: Destino | null = null;
  let continuacaoComConteudo = false;
  let brancosSeguidos = 0;
  /** Texto antes da primeira cena que não é ficha: vira a cena "Abertura". */
  let preambulo = '';

  const garantirCena = (): CenaRoteiro => {
    if (!atual) {
      atual = novaCena(gerarId, 'Abertura');
      cenas.push(atual);
    }
    return atual;
  };

  const guardar = (destino: Destino, valor: string): void => {
    if (!valor.trim()) return;
    if (destino === 'fontes') {
      fontes.push(...fontesDoTexto(valor, gerarId));
      return;
    }
    const c = garantirCena();
    c[destino] = juntar(c[destino], valor);
  };

  for (const bruta of linhas) {
    const linha = bruta.replace(/\s+$/, '');

    if (!linha.trim()) {
      brancosSeguidos += 1;
      // Um bloco de rótulo ("[Texto na tela]:" + linhas) termina na linha em
      // branco. Fontes, não: nos roteiros antigos elas vinham separadas por
      // linhas vazias ("Gematsu", "", "|", "", "Bloomberg").
      // Rótulo recém-aberto ainda sem nenhuma linha espera passar o branco.
      if (continuacaoComConteudo && (continuacao !== 'fontes' || brancosSeguidos >= 2)) continuacao = null;
      // Parágrafos da fala continuam separados.
      if (atual && !continuacao && !emFontes && atual.fala && !atual.fala.endsWith('\n\n')) atual.fala += '\n\n';
      continue;
    }
    brancosSeguidos = 0;

    const comTempo = SECAO_COM_TEMPO.exec(linha);
    const semTempo = comTempo ? null : SECAO_SEM_TEMPO.exec(linha);
    if (comTempo || semTempo) {
      continuacao = null;
      const tituloSecao = (comTempo ? comTempo[3] : semTempo![1])!.replace(/\*\*/g, '').trim();
      if (FONTES_TITULO.test(tituloSecao)) {
        emFontes = true;
        continue;
      }
      emFontes = false;
      const inicio = comTempo ? lerTempo(comTempo[1]!) : undefined;
      const fim = comTempo ? lerTempo(comTempo[2]!) : undefined;
      atual = novaCena(gerarId, tituloSecao || `Cena ${cenas.length + 1}`, inicio, fim);
      cenas.push(atual);
      continue;
    }

    if (emFontes) {
      fontes.push(...fontesDoTexto(linha, gerarId));
      continue;
    }

    const tituloRoteiro = TITULO_ROTEIRO.exec(linha);
    if (tituloRoteiro && !titulo && !atual) {
      titulo = tituloRoteiro[1]!.replace(/\*\*/g, '').trim();
      continue;
    }

    if (SEPARADOR.test(linha)) continue;

    const nota = NOTA.exec(linha);
    if (nota) {
      continuacao = null;
      guardar('notas', nota[1]!);
      continue;
    }

    // Rótulo só com dois-pontos ("[Cena: x]", "[Fontes]:"); "[Close no produto]"
    // sozinho é direção de cena, tratada logo abaixo.
    const rotulo = /\[[^\]]*:|\]\s*:/.test(linha) ? ROTULO_COLCHETE.exec(linha) : null;
    if (rotulo && !/^\d/.test(rotulo[1]!.trim())) {
      const nome = rotulo[1]!.trim();
      const valor = [rotulo[2], rotulo[3]].filter((v) => v && v.trim()).join(' ').trim();
      const destino = destinoDoRotulo(nome);
      if (valor) {
        continuacao = null;
        // Nota com rótulo próprio ("[Música: tensa]") guarda o rótulo junto.
        guardar(destino, destino === 'notas' ? `${nome}: ${valor}` : valor);
      } else {
        continuacao = destino;
        continuacaoComConteudo = false;
        if (destino === 'notas') guardar('notas', `${nome}:`);
      }
      continue;
    }

    const direcao = DIRECAO_SOLTA.exec(linha);
    if (direcao) {
      continuacao = null;
      const destino = destinoDoRotulo(direcao[1]!);
      // "[Fontes]" sozinho é cabeçalho: as linhas de baixo são as fontes.
      if (destino === 'fontes') {
        continuacao = 'fontes';
        continuacaoComConteudo = false;
      }
      else guardar(destino === 'notas' ? 'visual' : destino, direcao[1]!);
      continue;
    }

    // Linha com aspas abre fala: encerra qualquer bloco de rótulo aberto.
    if (continuacao && /^\s*["“«]/.test(linha)) continuacao = null;
    if (continuacao) {
      guardar(continuacao, linha.trim() === '|' ? '' : linha.trim());
      continuacaoComConteudo = true;
      continue;
    }

    if (!atual) {
      const ficha = FICHA.exec(linha);
      if (ficha) {
        const chave = ficha[1]!.toLowerCase();
        const valor = ficha[2]!.replace(/\*\*/g, '').trim();
        if (chave.startsWith('dura')) duracaoTexto = valor;
        else if (chave === 'tom') briefing.tom = valor;
        else if (chave.startsWith('p')) briefing.publico = valor;
        else if (chave === 'objetivo') briefing.objetivo = valor;
        else if (chave === 'tema') briefing.tema = valor;
        continue;
      }
      preambulo = juntar(preambulo, linha.trim());
      continue;
    }

    const texto = linha.replace(ROTULO_FALA, '');
    if (texto.trim()) {
      const c = garantirCena();
      c.fala = c.fala.endsWith('\n\n') || !c.fala ? `${c.fala}${texto.trim()}` : `${c.fala}\n${texto.trim()}`;
    }
  }

  if (preambulo) {
    const abertura = novaCena(gerarId, 'Abertura');
    abertura.fala = preambulo;
    cenas.unshift(abertura);
  }

  cenas.forEach((c, i) => {
    c.fala = c.fala.replace(/\n{3,}/g, '\n\n').trim();
    const antes = anteriores[i];
    if (antes && antes.titulo.trim().toLowerCase() === c.titulo.trim().toLowerCase()) {
      c.id = antes.id;
      c.tipo = antes.tipo;
    } else {
      c.tipo = tipoPeloTitulo(c.titulo, i, cenas.length);
    }
  });

  return { titulo, cenas, fontes, briefing, ...(duracaoTexto ? { duracaoTexto } : {}) };
}

// ---------- Cenas → markdown ----------

/**
 * O roteiro no formato canônico: título, uma seção por cena (com o tempo
 * quando a cena tem duração alvo), direção entre colchetes, fala, notas como
 * citação e as fontes no fim.
 */
export function markdownDasCenas(roteiro: Pick<Roteiro, 'titulo' | 'cenas'> & { pesquisa?: { fontes: FonteRoteiro[] } }, comTitulo = true): string {
  const partes: string[] = [];
  if (comTitulo && roteiro.titulo.trim()) partes.push(`# ${roteiro.titulo.trim()}`);
  let inicio = 0;
  roteiro.cenas.forEach((c) => {
    const titulo = c.titulo.trim() || TIPOS_CENA.find((t) => t.id === c.tipo)?.rotulo || 'Cena';
    const tempo = c.duracaoAlvoSeg ? `[${formatarTempo(inicio)} - ${formatarTempo(inicio + c.duracaoAlvoSeg)}] ` : '';
    if (c.duracaoAlvoSeg) inicio += c.duracaoAlvoSeg;
    const bloco = [`## ${tempo}${titulo}`];
    c.visual
      .split('\n')
      .filter((l) => l.trim())
      .forEach((l) => bloco.push(`[Cena: ${l.trim()}]`));
    if (c.textoTela.trim()) {
      const linhas = c.textoTela.split('\n').filter((l) => l.trim());
      if (linhas.length === 1) bloco.push(`[Texto na tela: ${linhas[0]!.trim()}]`);
      else bloco.push('[Texto na tela]:', ...linhas.map((l) => l.trim()), '');
    }
    if (c.fala.trim()) bloco.push('', c.fala.trim());
    c.notas
      .split('\n')
      .filter((l) => l.trim())
      .forEach((l) => bloco.push(`> Nota: ${l.trim()}`));
    partes.push(bloco.join('\n').replace(/\n{3,}/g, '\n\n'));
  });
  const fontes = roteiro.pesquisa?.fontes ?? [];
  if (fontes.length) {
    partes.push(['## Fontes', ...fontes.map((f) => `- ${[f.titulo.trim(), f.url.trim()].filter(Boolean).join(' — ')}`)].join('\n'));
  }
  return partes.join('\n\n');
}

/** Cenas vazias com que um roteiro em branco nasce. */
export function cenasIniciais(gerarId: GerarId, formato: FormatoRoteiro): CenaRoteiro[] {
  const base = (tipo: TipoCena, titulo: string, duracaoAlvoSeg?: number): CenaRoteiro => ({
    id: gerarId(),
    tipo,
    titulo,
    fala: '',
    visual: '',
    textoTela: '',
    notas: '',
    ...(duracaoAlvoSeg ? { duracaoAlvoSeg } : {}),
  });
  const curto = formato === 'reels';
  return [base('gancho', 'Gancho', curto ? 3 : 10), base('abertura', 'Abertura', curto ? 7 : 30), base('secao', 'Desenvolvimento'), base('cta', 'CTA', curto ? 5 : 20)];
}
