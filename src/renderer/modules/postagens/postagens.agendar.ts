import type { HorarioPadrao } from '../../../shared/types/videos.types.js';
import { erroInline } from '../../ui/campos.js';
import { buildSecaoModal, openCustomModal } from '../../ui/modal.js';
import { buildBotao, svg } from '../../ui/pagina.js';
import { ICONES_POSTAGEM, hojeIso, somarDias } from './postagens.ui.js';
import * as videosState from './videos/videos.state.js';

/**
 * Data e horário de uma postagem. Substitui o par <input type="date"> +
 * <input type="time"> do Chromium: o de hora não tinha atalho nenhum, abria
 * uma roleta pequena e confundia (o usuário pediu algo mais fácil). Aqui a
 * data é um mini calendário com atalhos e a hora aceita digitação livre
 * ("1830", "18h", "9:15") ou um clique numa grade de horários.
 */

type Campo = 'dataAgendada' | 'horaAgendada';
type Aberto = 'data' | 'hora' | null;

export interface OpcoesAgendamento {
  /** 0 = domingo, 1 = segunda — a mesma preferência do calendário. */
  inicioDaSemana?: 0 | 1;
  /** Horários já usados nas postagens do tipo; os mais frequentes viram atalho. */
  horasUsadas?: string[];
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_CURTOS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DIAS_NOMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const GRADE_HORAS: Array<{ rotulo: string; horas: string[] }> = [
  { rotulo: 'Manhã', horas: ['07:00', '08:00', '09:00', '10:00', '11:00'] },
  { rotulo: 'Tarde', horas: ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00'] },
  { rotulo: 'Noite', horas: ['18:00', '19:00', '20:00', '21:00', '22:00'] },
];
const SETA_ESQ = '<polyline points="15 6 9 12 15 18"/>';
const SETA_DIR = '<polyline points="9 6 15 12 9 18"/>';
const FECHAR = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const LAPIS = '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>';

/** Os horários padrão moram no catálogo único (videos.json) e valem para todo tipo. */
function horariosPadrao(): HorarioPadrao[] {
  return [...(videosState.getCurrentState()?.preferencias.horariosPadrao ?? [])].sort((a, b) => a.hora.localeCompare(b.hora));
}

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.split('-').map(Number);
  return [a!, m! - 1, d!];
}

function iso(ano: number, mes: number, dia: number): string {
  const data = new Date(ano, mes, dia);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function diaDaSemana(dataIso: string): number {
  const [a, m, d] = partes(dataIso);
  return new Date(a, m, d).getDay();
}

function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = partes(de);
  const [a2, m2, d2] = partes(ate);
  // Date.UTC dos dois lados: a conta não sofre com horário de verão.
  return Math.round((Date.UTC(a2, m2, d2) - Date.UTC(a1, m1, d1)) / 86_400_000);
}

/** "Seg, 6 de outubro" — e o ano só quando não é o corrente. */
function formatarDataBotao(dataIso: string): string {
  const [a, m, d] = partes(dataIso);
  const dia = DIAS_NOMES[new Date(a, m, d).getDay()]!;
  const ano = a === new Date().getFullYear() ? '' : ` de ${a}`;
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1, 3)}, ${d} de ${MESES[m]}${ano}`;
}

function descreverDistancia(dataIso: string): string {
  const n = diasEntre(hojeIso(), dataIso);
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  return n > 0 ? `daqui a ${n} dias` : `há ${-n} dias`;
}

/**
 * Lê o que foi digitado: "18:30", "18h30", "18h", "18", "1830", "830", "9.15".
 * Devolve "HH:MM" ou null se não for um horário.
 */
export function lerHora(texto: string): string | null {
  const t = texto.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  let h: number;
  let m: number;
  const separado = /^(\d{1,2})[:h.](\d{1,2})?h?$/.exec(t) ?? /^(\d{1,2})h$/.exec(t);
  if (separado) {
    h = Number(separado[1]);
    m = Number(separado[2] ?? 0);
  } else if (/^\d{1,4}$/.test(t)) {
    // Só dígitos: até 2 é a hora; 3 ou 4 têm os minutos nos dois últimos.
    h = Number(t.length <= 2 ? t : t.slice(0, -2));
    m = Number(t.length <= 2 ? 0 : t.slice(-2));
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function somarMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.split(':').map(Number);
  const total = (((h! * 60 + m! + minutos) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Os horários mais repetidos nas postagens, do mais usado ao menos. */
function maisUsadas(horas: string[], limite: number): string[] {
  const contagem = new Map<string, number>();
  horas.forEach((h) => {
    if (/^\d{2}:\d{2}$/.test(h)) contagem.set(h, (contagem.get(h) ?? 0) + 1);
  });
  return [...contagem.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limite)
    .map(([h]) => h)
    .sort();
}

function botao(classe: string, texto: string, titulo?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = classe;
  b.textContent = texto;
  if (titulo) b.title = titulo;
  return b;
}

export function buildAgendamento(
  dataInicial: string,
  horaInicial: string,
  aoMudar: (campo: Campo, valor: string) => void,
  opcoes: OpcoesAgendamento = {},
): HTMLElement {
  let data = dataInicial;
  let hora = horaInicial;
  let aberto: Aberto = null;
  /** Grava o horário digitado e ainda não confirmado (Enter) antes de fechar ou trocar. */
  let gravarDigitado: (() => void) | null = null;
  const primeiro = opcoes.inicioDaSemana ?? 0;
  // Mês exibido no mini calendário (ano, mês 0–11).
  let [anoVisto, mesVisto] = partes(data || hojeIso());

  const wrap = document.createElement('div');
  wrap.className = 'vd-agendar';

  const linha = document.createElement('div');
  linha.className = 'vd-agendar-linha';
  const gatilhoData = document.createElement('button');
  gatilhoData.type = 'button';
  gatilhoData.className = 'vd-agendar-gatilho is-data';
  const gatilhoHora = document.createElement('button');
  gatilhoHora.type = 'button';
  gatilhoHora.className = 'vd-agendar-gatilho is-hora';
  const limpar = document.createElement('button');
  limpar.type = 'button';
  limpar.className = 'vd-agendar-limpar';
  limpar.title = 'Tirar data e horário';
  limpar.setAttribute('aria-label', 'Tirar data e horário');
  limpar.innerHTML = svg(FECHAR, 14, 2.2);
  linha.append(gatilhoData, gatilhoHora, limpar);

  const resumo = document.createElement('p');
  resumo.className = 'vd-agendar-resumo';
  const pop = document.createElement('div');
  pop.className = 'vd-agendar-pop';
  wrap.append(linha, resumo, pop);

  const mudarData = (nova: string): void => {
    if (nova === data) return;
    data = nova;
    aoMudar('dataAgendada', nova);
  };
  const mudarHora = (nova: string): void => {
    if (nova === hora) return;
    hora = nova;
    aoMudar('horaAgendada', nova);
  };

  const preencherGatilho = (el: HTMLButtonElement, icone: string, rotulo: string, valor: string, vazio: string, ativo: boolean): void => {
    el.replaceChildren();
    el.setAttribute('aria-expanded', String(ativo));
    el.classList.toggle('is-ativo', ativo);
    el.classList.toggle('is-vazio', !valor);
    const ic = document.createElement('span');
    ic.className = 'vd-agendar-icone';
    ic.innerHTML = svg(icone, 16, 2);
    const textos = document.createElement('span');
    textos.className = 'vd-agendar-textos';
    const r = document.createElement('span');
    r.className = 'vd-agendar-rotulo';
    r.textContent = rotulo;
    const v = document.createElement('span');
    v.className = 'vd-agendar-valor';
    v.textContent = valor || vazio;
    textos.append(r, v);
    el.append(ic, textos);
  };

  const desenharResumo = (): void => {
    resumo.className = 'vd-agendar-resumo';
    if (!data && !hora) {
      resumo.textContent = 'Sem data. Escolha o dia e o horário para agendar.';
      return;
    }
    if (!data) {
      resumo.textContent = 'Falta o dia — o horário sozinho não agenda.';
      resumo.classList.add('is-aviso');
      return;
    }
    if (!hora) {
      resumo.textContent = `${descreverDistancia(data).replace(/^./, (c) => c.toUpperCase())}. Marque também o horário para agendar.`;
      resumo.classList.add('is-aviso');
      return;
    }
    const [a, m, d] = partes(data);
    const [h, min] = hora.split(':').map(Number);
    const passou = new Date(a, m, d, h, min).getTime() < Date.now();
    resumo.textContent = `${passou ? 'Era para' : 'Sai'} ${descreverDistancia(data)} às ${hora}${passou ? ' — esse horário já passou.' : '.'}`;
    if (passou) resumo.classList.add('is-passado');
  };

  // ---- Data ----
  const buildPopData = (): HTMLElement => {
    const caixa = document.createElement('div');
    caixa.className = 'vd-agendar-cal';

    const hoje = hojeIso();
    const atalhos = document.createElement('div');
    atalhos.className = 'vd-agendar-atalhos';
    const proxima = (alvo: number): string => {
      const falta = (alvo - diaDaSemana(hoje) + 7) % 7 || 7;
      return somarDias(hoje, falta);
    };
    [
      { rotulo: 'Hoje', valor: hoje },
      { rotulo: 'Amanhã', valor: somarDias(hoje, 1) },
      { rotulo: 'Próx. segunda', valor: proxima(1) },
      { rotulo: 'Em 1 semana', valor: somarDias(hoje, 7) },
    ].forEach((a) => {
      const b = botao('vd-agendar-chip', a.rotulo, formatarDataBotao(a.valor));
      b.classList.toggle('is-marcado', a.valor === data);
      b.addEventListener('click', () => escolherDia(a.valor));
      atalhos.appendChild(b);
    });
    caixa.appendChild(atalhos);

    const cab = document.createElement('div');
    cab.className = 'vd-agendar-cal-cab';
    const anterior = document.createElement('button');
    anterior.type = 'button';
    anterior.className = 'vd-agendar-seta';
    anterior.setAttribute('aria-label', 'Mês anterior');
    anterior.innerHTML = svg(SETA_ESQ, 14, 2.4);
    const titulo = document.createElement('span');
    titulo.className = 'vd-agendar-cal-titulo';
    titulo.textContent = `${MESES[mesVisto]} ${anoVisto}`;
    const seguinte = document.createElement('button');
    seguinte.type = 'button';
    seguinte.className = 'vd-agendar-seta';
    seguinte.setAttribute('aria-label', 'Próximo mês');
    seguinte.innerHTML = svg(SETA_DIR, 14, 2.4);
    const navegar = (passo: number): void => {
      [anoVisto, mesVisto] = partes(iso(anoVisto, mesVisto + passo, 1));
      desenharPop();
    };
    anterior.addEventListener('click', () => navegar(-1));
    seguinte.addEventListener('click', () => navegar(1));
    cab.append(anterior, titulo, seguinte);
    caixa.appendChild(cab);

    const grade = document.createElement('div');
    grade.className = 'vd-agendar-cal-grade';
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('span');
      s.className = 'vd-agendar-cal-sem';
      s.textContent = DIAS_CURTOS[(i + primeiro) % 7]!;
      grade.appendChild(s);
    }
    const primeiroDoMes = iso(anoVisto, mesVisto, 1);
    const recuo = (diaDaSemana(primeiroDoMes) - primeiro + 7) % 7;
    const inicio = somarDias(primeiroDoMes, -recuo);
    // Sempre 6 semanas: o painel não muda de altura ao trocar de mês.
    for (let i = 0; i < 42; i++) {
      const dia = somarDias(inicio, i);
      const [, m, d] = partes(dia);
      const b = botao('vd-agendar-dia', String(d));
      b.setAttribute('aria-label', formatarDataBotao(dia));
      b.classList.toggle('is-fora', m !== mesVisto);
      b.classList.toggle('is-hoje', dia === hoje);
      b.classList.toggle('is-passado', dia < hoje);
      b.classList.toggle('is-marcado', dia === data);
      b.setAttribute('aria-pressed', String(dia === data));
      b.addEventListener('click', () => escolherDia(dia));
      grade.appendChild(b);
    }
    caixa.appendChild(grade);
    return caixa;
  };

  const escolherDia = (dia: string): void => {
    mudarData(dia);
    [anoVisto, mesVisto] = partes(dia);
    // Sem horário ainda, o próximo passo natural é escolher a hora.
    abrir(hora ? null : 'hora');
  };

  // ---- Hora ----
  const buildPopHora = (): HTMLElement => {
    const caixa = document.createElement('div');
    caixa.className = 'vd-agendar-horas';

    const digitar = document.createElement('div');
    digitar.className = 'vd-agendar-digitar';
    const menos = botao('vd-agendar-passo', '−15', 'Voltar 15 minutos');
    const campo = document.createElement('input');
    campo.className = 'vd-agendar-hora-input';
    campo.inputMode = 'numeric';
    campo.maxLength = 5;
    campo.placeholder = '--:--';
    campo.value = hora;
    campo.setAttribute('aria-label', 'Horário (ex.: 18:30)');
    const mais = botao('vd-agendar-passo', '+15', 'Avançar 15 minutos');
    const dica = document.createElement('span');
    dica.className = 'vd-agendar-dica';
    dica.textContent = 'Digite (ex.: 1830, 9h, 21:15) e Enter — ↑ ↓ andam 15 min';

    const confirmar = (): void => {
      if (campo.value.trim() === '') {
        mudarHora('');
      } else {
        const lida = lerHora(campo.value);
        if (!lida) {
          campo.classList.add('is-invalido');
          return;
        }
        mudarHora(lida);
      }
      abrir(null);
    };
    gravarDigitado = () => {
      const lida = lerHora(campo.value);
      if (lida) mudarHora(lida);
    };
    const passo = (min: number): void => {
      const base = lerHora(campo.value) ?? hora ?? '';
      mudarHora(somarMinutos(base || '12:00', min));
      desenharTudo();
      wrap.querySelector<HTMLInputElement>('.vd-agendar-hora-input')?.focus();
    };
    menos.addEventListener('click', () => passo(-15));
    mais.addEventListener('click', () => passo(15));
    campo.addEventListener('input', () => {
      campo.classList.remove('is-invalido');
      // Quatro dígitos seguidos ganham os dois-pontos sozinhos: "1830" → "18:30".
      if (/^\d{4}$/.test(campo.value)) campo.value = `${campo.value.slice(0, 2)}:${campo.value.slice(2)}`;
    });
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmar();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        passo(e.key === 'ArrowUp' ? 15 : -15);
      }
    });
    digitar.append(menos, campo, mais);
    caixa.append(digitar, dica);

    const escolher = (h: string): void => {
      campo.value = h;
      mudarHora(h);
      abrir(null);
    };
    const grupo = (rotulo: string, horas: string[]): void => {
      const linhaG = document.createElement('div');
      linhaG.className = 'vd-agendar-grupo';
      const r = document.createElement('span');
      r.className = 'vd-agendar-grupo-rotulo';
      r.textContent = rotulo;
      const chips = document.createElement('div');
      chips.className = 'vd-agendar-chips';
      horas.forEach((h) => {
        const b = botao('vd-agendar-chip is-hora', h);
        b.classList.toggle('is-marcado', h === hora);
        b.setAttribute('aria-pressed', String(h === hora));
        b.addEventListener('click', () => escolher(h));
        chips.appendChild(b);
      });
      linhaG.append(r, chips);
      caixa.appendChild(linhaG);
    };

    // Horários padrão, com nome: vêm primeiro, porque foram escolhidos pelo usuário.
    const padroes = horariosPadrao();
    const reabrir = (): void => {
      if (wrap.isConnected) abrir('hora');
    };
    const blocoPadrao = document.createElement('div');
    blocoPadrao.className = 'vd-agendar-padroes';
    const cabPadrao = document.createElement('div');
    cabPadrao.className = 'vd-agendar-padroes-cab';
    const tituloPadrao = document.createElement('span');
    tituloPadrao.className = 'vd-agendar-grupo-rotulo';
    tituloPadrao.textContent = 'Horários padrão';
    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = 'vd-agendar-editar';
    editar.innerHTML = svg(padroes.length ? LAPIS : ICONES_POSTAGEM.mais, 12, 2.2);
    editar.append(padroes.length ? 'Editar' : 'Criar');
    editar.addEventListener('click', () => void abrirHorariosPadrao().then(reabrir));
    cabPadrao.append(tituloPadrao, editar);
    blocoPadrao.appendChild(cabPadrao);
    if (padroes.length) {
      const chips = document.createElement('div');
      chips.className = 'vd-agendar-chips is-padroes';
      padroes.forEach((p) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vd-agendar-padrao';
        b.classList.toggle('is-marcado', p.hora === hora);
        b.setAttribute('aria-pressed', String(p.hora === hora));
        b.title = `${p.nome} — ${p.hora}`;
        const n = document.createElement('span');
        n.className = 'vd-agendar-padrao-nome';
        n.textContent = p.nome;
        const h = document.createElement('span');
        h.className = 'vd-agendar-padrao-hora';
        h.textContent = p.hora;
        b.append(n, h);
        b.addEventListener('click', () => escolher(p.hora));
        chips.appendChild(b);
      });
      blocoPadrao.appendChild(chips);
    } else {
      const vazio = document.createElement('p');
      vazio.className = 'vd-agendar-dica is-esquerda';
      vazio.textContent = 'Cadastre os horários que você sempre usa, com um nome (ex.: "Reels da manhã" às 09:00).';
      blocoPadrao.appendChild(vazio);
    }
    if (hora && !padroes.some((p) => p.hora === hora)) {
      const guardar = botao('vd-agendar-sem', `Salvar ${hora} como horário padrão`);
      guardar.addEventListener('click', () => void abrirHorariosPadrao(hora).then(reabrir));
      blocoPadrao.appendChild(guardar);
    }
    caixa.appendChild(blocoPadrao);

    const horasPadrao = new Set(padroes.map((p) => p.hora));
    const frequentes = maisUsadas(opcoes.horasUsadas ?? [], 5).filter((h) => !horasPadrao.has(h));
    if (frequentes.length) grupo('Mais usados', frequentes);
    GRADE_HORAS.forEach((g) => grupo(g.rotulo, g.horas));

    if (hora) {
      const sem = botao('vd-agendar-sem', 'Tirar o horário');
      sem.addEventListener('click', () => {
        campo.value = '';
        mudarHora('');
        abrir(null);
      });
      caixa.appendChild(sem);
    }
    queueMicrotask(() => {
      campo.focus();
      campo.select();
    });
    return caixa;
  };

  const desenharPop = (): void => {
    gravarDigitado = null;
    pop.replaceChildren();
    pop.hidden = aberto === null;
    if (aberto === 'data') pop.appendChild(buildPopData());
    else if (aberto === 'hora') pop.appendChild(buildPopHora());
  };

  const desenharTudo = (): void => {
    preencherGatilho(gatilhoData, ICONES_POSTAGEM.calendario, 'Dia', data ? formatarDataBotao(data) : '', 'Escolher dia', aberto === 'data');
    preencherGatilho(gatilhoHora, ICONES_POSTAGEM.relogio, 'Horário', hora, 'Escolher', aberto === 'hora');
    limpar.hidden = !data && !hora;
    desenharResumo();
    desenharPop();
  };

  // Clique fora fecha; Esc também, sem fechar o painel inteiro.
  const foraDaqui = (e: PointerEvent): void => {
    if (!wrap.isConnected) {
      document.removeEventListener('pointerdown', foraDaqui, true);
      return;
    }
    if (!wrap.contains(e.target as Node)) abrir(null);
  };
  const abrir = (qual: Aberto): void => {
    gravarDigitado?.();
    aberto = qual;
    if (qual) document.addEventListener('pointerdown', foraDaqui, true);
    else document.removeEventListener('pointerdown', foraDaqui, true);
    desenharTudo();
  };
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aberto) {
      e.stopPropagation();
      // Esc desiste do que foi digitado.
      gravarDigitado = null;
      abrir(null);
    }
  });

  gatilhoData.addEventListener('click', () => {
    if (aberto !== 'data') [anoVisto, mesVisto] = partes(data || hojeIso());
    abrir(aberto === 'data' ? null : 'data');
  });
  gatilhoHora.addEventListener('click', () => abrir(aberto === 'hora' ? null : 'hora'));
  limpar.addEventListener('click', () => {
    gravarDigitado = null;
    mudarHora('');
    mudarData('');
    abrir(null);
  });

  desenharTudo();
  return wrap;
}

// ---------- Cadastro dos horários padrão ----------

/**
 * Lista editável de horários com nome. `novaHora` já abre com uma linha
 * preenchida (o "Salvar 18:30 como horário padrão" do seletor). Resolve quando
 * o modal fecha, salvo ou não.
 */
export function abrirHorariosPadrao(novaHora?: string): Promise<void> {
  const file = videosState.getCurrentState();
  if (!file) return Promise.resolve();
  const linhas: HorarioPadrao[] = horariosPadrao().map((h) => ({ ...h }));
  let focarNova = false;
  if (novaHora) {
    linhas.push({ id: crypto.randomUUID(), nome: '', hora: novaHora });
    focarNova = true;
  }

  return openCustomModal(
    'Horários padrão',
    ({ corpo, rodape, fechar }) => {
      const secao = buildSecaoModal('Seus horários', 'Aparecem primeiro ao escolher o horário de qualquer postagem. O nome ajuda a lembrar para que serve cada um.');
      const lista = document.createElement('div');
      lista.className = 'vd-padroes-lista';
      secao.conteudo.appendChild(lista);

      const desenhar = (): void => {
        lista.replaceChildren();
        if (!linhas.length) {
          const vazio = document.createElement('p');
          vazio.className = 'md-dica';
          vazio.textContent = 'Nenhum horário padrão ainda.';
          lista.appendChild(vazio);
        }
        linhas.forEach((l, i) => {
          const linha = document.createElement('div');
          linha.className = 'vd-padroes-linha';
          const nome = document.createElement('input');
          nome.className = 'md-input';
          nome.placeholder = 'Nome (ex.: Reels da manhã)';
          nome.maxLength = 60;
          nome.value = l.nome;
          nome.addEventListener('input', () => (l.nome = nome.value));
          const horaEl = document.createElement('input');
          horaEl.className = 'md-input vd-padroes-hora';
          horaEl.placeholder = '09:00';
          horaEl.inputMode = 'numeric';
          horaEl.maxLength = 5;
          horaEl.value = l.hora;
          horaEl.setAttribute('aria-label', 'Horário');
          horaEl.addEventListener('input', () => {
            horaEl.classList.remove('is-invalido');
            l.hora = horaEl.value;
          });
          horaEl.addEventListener('blur', () => {
            const lida = lerHora(horaEl.value);
            if (lida) horaEl.value = l.hora = lida;
            else if (horaEl.value.trim()) horaEl.classList.add('is-invalido');
          });
          const remover = document.createElement('button');
          remover.type = 'button';
          remover.className = 'vd-agendar-limpar';
          remover.title = 'Remover este horário';
          remover.setAttribute('aria-label', 'Remover este horário');
          remover.innerHTML = svg(FECHAR, 14, 2.2);
          remover.addEventListener('click', () => {
            linhas.splice(i, 1);
            desenhar();
          });
          linha.append(nome, horaEl, remover);
          lista.appendChild(linha);
          if (focarNova && i === linhas.length - 1) {
            focarNova = false;
            queueMicrotask(() => nome.focus());
          }
        });
      };

      const adicionar = buildBotao('Adicionar horário', { icone: ICONES_POSTAGEM.mais, variante: 'secundario' });
      adicionar.addEventListener('click', () => {
        linhas.push({ id: crypto.randomUUID(), nome: '', hora: '' });
        focarNova = true;
        desenhar();
      });
      secao.conteudo.appendChild(adicionar);
      corpo.appendChild(secao.secao);
      desenhar();

      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const salvar = buildBotao('Salvar horários', { variante: 'primario' });
      salvar.addEventListener('click', () => {
        // Linha toda vazia é ignorada; horário que não dá para ler barra o salvar.
        const preenchidas = linhas.filter((l) => l.nome.trim() || l.hora.trim());
        const invalida = preenchidas.find((l) => !lerHora(l.hora));
        if (invalida) {
          const onde = invalida.nome.trim() ? ` em "${invalida.nome.trim()}"` : '';
          erroInline(corpo, new Error(`Falta um horário válido${onde}. Use algo como 09:00 ou 1830.`));
          return;
        }
        const atual = videosState.getCurrentState() ?? file;
        void videosState
          .salvarPreferencias({
            ...atual.preferencias,
            horariosPadrao: preenchidas.map((l) => ({ id: l.id, nome: l.nome.trim(), hora: lerHora(l.hora) ?? l.hora })),
          })
          .then(fechar)
          .catch((e: unknown) => erroInline(corpo, e));
      });
      rodape.append(cancelar, salvar);
    },
    { largura: 520, icone: ICONES_POSTAGEM.relogio, subtitulo: 'Atalhos com nome para agendar mais rápido — valem para vídeos e imagens.' },
  );
}
