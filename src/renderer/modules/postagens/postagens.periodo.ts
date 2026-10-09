import { svg } from '../../ui/pagina.js';
import { inicioDaSemana, somarDias } from './postagens.ui.js';

/**
 * Datas por extenso e o navegador ‹ Hoje › usados pelo Calendário e pelas
 * Métricas — antes cada tela tinha a sua cópia dos meses e dos títulos, e as
 * Métricas pegavam emprestadas as classes do calendário.
 */

export const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function partesData(iso: string): [number, number, number] {
  const [a, m, d] = iso.split('-').map(Number);
  return [a!, m!, d!];
}

export function diaDaSemana(iso: string): number {
  const [a, m, d] = partesData(iso);
  return new Date(a, m - 1, d).getDay();
}

/** "outubro de 2026" */
export function tituloDoMes(iso: string): string {
  const [a, m] = partesData(iso);
  return `${MESES_LONGOS[m - 1]} de ${a}`;
}

/** "5 – 11 de outubro de 2026", ou com os dois meses quando a semana vira o mês. */
export function tituloDaSemana(iso: string, primeiro: 0 | 1): string {
  const inicio = inicioDaSemana(iso, primeiro);
  const fim = somarDias(inicio, 6);
  const [ai, mi, di] = partesData(inicio);
  const [af, mf, df] = partesData(fim);
  if (mi === mf) return `${di} – ${df} de ${MESES_LONGOS[mf - 1]} de ${af}`;
  if (ai === af) return `${di} de ${MESES_LONGOS[mi - 1]} – ${df} de ${MESES_LONGOS[mf - 1]} de ${af}`;
  return `${di} de ${MESES_LONGOS[mi - 1]} de ${ai} – ${df} de ${MESES_LONGOS[mf - 1]} de ${af}`;
}

/** "quarta-feira, 8 de outubro" */
export function diaPorExtenso(iso: string, comAno = false): string {
  const [a, m, d] = partesData(iso);
  return `${DIAS_LONGOS[diaDaSemana(iso)]}, ${d} de ${MESES_LONGOS[m - 1]}${comAno ? ` de ${a}` : ''}`;
}

/** Primeiro dia do mês `sentido` meses depois do de `iso`. */
export function somarMeses(iso: string, sentido: number): string {
  const [a, m] = partesData(iso);
  const d = new Date(a, m - 1 + sentido, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export interface NavegadorPeriodo {
  titulo: string;
  /** "semana" ou "mês": monta os títulos dos botões ("Semana anterior"…). */
  unidade: 'semana' | 'mês';
  /** Rótulo do botão do meio ("Hoje", "Este mês"). */
  rotuloAtual: string;
  /** O período mostrado já é o atual: o botão do meio fica apagado. */
  noAtual: boolean;
  anterior: () => void;
  atual: () => void;
  proximo: () => void;
  /** Título grande (cabeçalho do calendário) ou na altura dos controles (Métricas). */
  grande?: boolean;
}

const SETA_ESQ = '<path d="m15 18-6-6 6-6"/>';
const SETA_DIR = '<path d="m9 18 6-6-6-6"/>';

/** ‹ Hoje › + o título do período. */
export function buildNavegadorPeriodo(n: NavegadorPeriodo): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `pe-nav${n.grande ? ' is-grande' : ''}`;
  const grupo = document.createElement('div');
  grupo.className = 'pe-nav-botoes';
  const botao = (conteudo: string, titulo: string, aoClicar: () => void, icone: boolean): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `pe-nav-btn${icone ? ' is-icone' : ''}`;
    b.title = titulo;
    b.setAttribute('aria-label', titulo);
    if (icone) b.innerHTML = svg(conteudo, 16, 2.2);
    else b.textContent = conteudo;
    b.addEventListener('click', aoClicar);
    return b;
  };
  const semana = n.unidade === 'semana';
  const atual = botao(n.rotuloAtual, semana ? 'Voltar para esta semana' : 'Voltar para este mês', n.atual, false);
  atual.disabled = n.noAtual;
  grupo.append(
    botao(SETA_ESQ, semana ? 'Semana anterior' : 'Mês anterior', n.anterior, true),
    atual,
    botao(SETA_DIR, semana ? 'Próxima semana' : 'Próximo mês', n.proximo, true),
  );
  const titulo = document.createElement(n.grande ? 'h2' : 'strong');
  titulo.className = 'pe-nav-titulo';
  titulo.textContent = n.titulo;
  wrap.append(grupo, titulo);
  return wrap;
}
