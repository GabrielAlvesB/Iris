/**
 * Revisão semanal: o que foi concluído, o que atrasou, o que foi publicado,
 * as rotinas e o tempo de foco de uma semana (segunda a domingo). As contas
 * são puras e só com fatos — a interpretação é de quem lê. Datas sempre
 * "AAAA-MM-DD" locais; instantes ISO viram dia local antes de comparar.
 */

export interface FontesRevisao {
  /** Dia local de hoje: o que ainda não chegou não "atrasou". */
  hoje: string;
  cards: Array<{ id: string; titulo: string; prazo?: string; concluidoEm?: string; tempo?: Array<{ fim: string; minutos: number }> }>;
  checklists: Array<{ id: string; titulo: string; prazo?: string; concluidaEm?: string; tempo?: Array<{ fim: string; minutos: number }> }>;
  /** Só as publicadas, com o dia em que contam (o mesmo das Métricas). */
  publicadas: Array<{ id: string; tipo: 'video' | 'imagem'; titulo: string; dia: string; redes: string[] }>;
  /** O dia marcado das que ainda não saíram (nem arquivadas): o "Ritmo da semana" mostra o que vem. */
  agendadas: string[];
  rotinas: Array<{ id: string; titulo: string; dias: number[]; feitasEm: string[] }>;
}

export interface ItemRevisao {
  tipo: 'card' | 'checklist' | 'postagem';
  id: string;
  titulo: string;
  /** AAAA-MM-DD do que importa para a lista (concluído em, prazo, publicado em). */
  dia: string;
  detalhe?: string;
  /** Postagem: as redes por extenso, para os selos da lista. */
  redes?: string[];
}

export interface RevisaoSemana {
  inicio: string;
  fim: string;
  concluidos: ItemRevisao[];
  atrasaram: ItemRevisao[];
  publicados: ItemRevisao[];
  porRede: Array<{ rede: string; n: number }>;
  /** Os sete dias, de segunda a domingo: publicadas no dia e as ainda agendadas para ele. */
  ritmo: Array<{ dia: string; publicadas: number; agendadas: number }>;
  rotinas: Array<{ titulo: string; feitas: number; previstas: number }>;
  tempo: Array<{ tipo: 'card' | 'checklist'; id: string; titulo: string; minutos: number }>;
  tempoTotal: number;
  /** "Fatos da semana", frases curtas sem opinião. */
  frases: string[];
}

function partes(iso: string): [number, number, number] {
  return iso.split('-').map(Number) as [number, number, number];
}

function paraIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function somarDias(iso: string, n: number): string {
  const [a, m, d] = partes(iso);
  const data = new Date(a, m - 1, d);
  data.setDate(data.getDate() + n);
  return paraIso(data);
}

/** A segunda-feira da semana de `iso` (a semana do Iris vai de segunda a domingo). */
export function segundaDaSemana(iso: string): string {
  const [a, m, d] = partes(iso);
  const dia = new Date(a, m - 1, d).getDay();
  return somarDias(iso, dia === 0 ? -6 : 1 - dia);
}

/** Instante ISO → dia local. */
export function diaLocal(instante: string | undefined): string {
  if (!instante) return '';
  const t = Date.parse(instante);
  return Number.isNaN(t) ? '' : paraIso(new Date(t));
}

/** "2026-10-14" → "14/10". */
export function diaCurto(iso: string): string {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
}

function dentro(dia: string, inicio: string, fim: string): boolean {
  return !!dia && dia >= inicio && dia <= fim;
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

function horas(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

export function calcularRevisao(f: FontesRevisao, inicio: string): RevisaoSemana {
  const fim = somarDias(inicio, 6);
  // Atrasou = prazo na semana, já passado (antes de hoje), e não concluído até o prazo.
  const limiteAtraso = f.hoje <= fim ? somarDias(f.hoje, -1) : fim;

  const concluidos: ItemRevisao[] = [];
  const atrasaram: ItemRevisao[] = [];
  f.cards.forEach((c) => {
    const feito = diaLocal(c.concluidoEm);
    if (dentro(feito, inicio, fim)) concluidos.push({ tipo: 'card', id: c.id, titulo: c.titulo, dia: feito });
    const prazo = (c.prazo ?? '').slice(0, 10);
    if (dentro(prazo, inicio, limiteAtraso) && (!feito || feito > prazo)) atrasaram.push({ tipo: 'card', id: c.id, titulo: c.titulo, dia: prazo, detalhe: feito ? `concluído em ${diaCurto(feito)}` : 'ainda aberto' });
  });
  f.checklists.forEach((c) => {
    const feito = diaLocal(c.concluidaEm);
    if (dentro(feito, inicio, fim)) concluidos.push({ tipo: 'checklist', id: c.id, titulo: c.titulo, dia: feito });
    const prazo = (c.prazo ?? '').slice(0, 10);
    if (dentro(prazo, inicio, limiteAtraso) && (!feito || feito > prazo)) atrasaram.push({ tipo: 'checklist', id: c.id, titulo: c.titulo, dia: prazo, detalhe: feito ? `concluída em ${diaCurto(feito)}` : 'ainda aberta' });
  });
  concluidos.sort((a, b) => a.dia.localeCompare(b.dia));
  atrasaram.sort((a, b) => a.dia.localeCompare(b.dia));

  const publicados = f.publicadas
    .filter((p) => dentro(p.dia, inicio, fim))
    .map<ItemRevisao>((p) => ({ tipo: 'postagem', id: p.id, titulo: p.titulo, dia: p.dia, detalhe: [p.tipo === 'video' ? 'Vídeo' : 'Imagem', ...p.redes].join(' · '), redes: p.redes }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
  const contagem = new Map<string, number>();
  f.publicadas.filter((p) => dentro(p.dia, inicio, fim)).forEach((p) => (p.redes.length ? p.redes : ['Sem rede']).forEach((r) => contagem.set(r, (contagem.get(r) ?? 0) + 1)));
  const porRede = [...contagem.entries()].map(([rede, n]) => ({ rede, n })).sort((a, b) => b.n - a.n || a.rede.localeCompare(b.rede, 'pt-BR'));

  const ritmo = Array.from({ length: 7 }, (_, i) => {
    const d = somarDias(inicio, i);
    return { dia: d, publicadas: publicados.filter((p) => p.dia === d).length, agendadas: f.agendadas.filter((a) => a === d).length };
  });

  // Previstas = os dias da semana marcados na rotina, até hoje (o futuro ainda não conta).
  const ultimoDiaContado = f.hoje < fim ? f.hoje : fim;
  const rotinas = f.rotinas
    .map((r) => {
      let previstas = 0;
      for (let d = inicio; d <= ultimoDiaContado; d = somarDias(d, 1)) {
        const [a, m, dd] = partes(d);
        if (r.dias.includes(new Date(a, m - 1, dd).getDay())) previstas++;
      }
      const feitas = r.feitasEm.filter((d) => dentro(d, inicio, fim)).length;
      return { titulo: r.titulo, feitas, previstas };
    })
    .filter((r) => r.previstas || r.feitas);

  const tempo = [
    ...f.cards.map((c) => ({ tipo: 'card' as const, id: c.id, titulo: c.titulo, minutos: (c.tempo ?? []).filter((s) => dentro(diaLocal(s.fim), inicio, fim)).reduce((n, s) => n + s.minutos, 0) })),
    ...f.checklists.map((c) => ({ tipo: 'checklist' as const, id: c.id, titulo: c.titulo, minutos: (c.tempo ?? []).filter((s) => dentro(diaLocal(s.fim), inicio, fim)).reduce((n, s) => n + s.minutos, 0) })),
  ]
    .filter((t) => t.minutos > 0)
    .sort((a, b) => b.minutos - a.minutos);
  const tempoTotal = tempo.reduce((n, t) => n + t.minutos, 0);

  const frases: string[] = [];
  if (concluidos.length) frases.push(`${plural(concluidos.length, 'item concluído', 'itens concluídos')} (${plural(concluidos.filter((c) => c.tipo === 'card').length, 'card', 'cards')}, ${plural(concluidos.filter((c) => c.tipo === 'checklist').length, 'checklist', 'checklists')}).`);
  if (atrasaram.length) frases.push(`${plural(atrasaram.length, 'prazo passou', 'prazos passaram')} sem conclusão a tempo; ${plural(atrasaram.filter((a) => a.detalhe?.startsWith('ainda')).length, 'segue aberto', 'seguem abertos')}.`);
  // Sem rede marcada em nenhuma, a quebra por rede não diz nada.
  const comRede = porRede.filter((r) => r.rede !== 'Sem rede');
  if (publicados.length) frases.push(`${plural(publicados.length, 'publicação', 'publicações')}${comRede.length ? `: ${porRede.map((r) => `${r.rede} ${r.n}`).join(', ')}` : ''}.`);
  const somaPrevistas = rotinas.reduce((n, r) => n + r.previstas, 0);
  if (somaPrevistas) frases.push(`Rotinas: ${rotinas.reduce((n, r) => n + Math.min(r.feitas, r.previstas), 0)} de ${somaPrevistas} feitas nos dias marcados.`);
  if (tempoTotal) {
    const maior = tempo[0];
    const onde = !maior ? '' : tempo.length === 1 ? `, todo em “${maior.titulo}”` : `, ${horas(maior.minutos)} em “${maior.titulo}”`;
    frases.push(`Foco registrado: ${horas(tempoTotal)}${onde}.`);
  }

  return { inicio, fim, concluidos, atrasaram, publicados, porRede, ritmo, rotinas, tempo, tempoTotal, frases };
}
