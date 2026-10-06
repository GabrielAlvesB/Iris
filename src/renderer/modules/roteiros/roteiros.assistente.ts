import type { VarianteTexto } from '../../../shared/types/ia.types.js';
import { formatarTempo, lerDuracaoTexto, lerTempo } from '../../../shared/types/roteiros.conversao.js';
import { TIPOS_CENA, isTipoCena, type TipoCena } from '../../../shared/types/roteiros.types.js';
import { gerarTextoIa } from '../../core/ia.js';
import { campo, input, select, textarea } from '../../ui/campos.js';
import { escolherIaDeTexto, exigirIa, type EscolhaTexto } from '../../ui/ia.js';
import { mensagemDeErro, openConfirmModal } from '../../ui/modal.js';
import { buildBotao, svg } from '../../ui/pagina.js';
import { ICONES, contextoIa, lista, novaCena, num, str, tipoDe, type CtxEstudio } from './roteiros.comum.js';
import { pedir } from './roteiros.ia.js';

/**
 * Assistente do tema ao roteiro, em quatro passos:
 * 1. Briefing (o mesmo da aba da esquerda);
 * 2. Ângulos — 3 formas de contar, cada uma com gancho;
 * 3. Estrutura — as cenas com tipo, duração e objetivo, editáveis;
 * 4. Escrever — cena por cena, com progresso; cada uma entra no roteiro
 *    assim que fica pronta (as cenas de antes ficam numa versão).
 * O estado fica guardado por roteiro: trocar de aba não perde o caminho.
 */

interface ItemEstrutura {
  tipo: TipoCena;
  titulo: string;
  duracaoSeg?: number;
  objetivo: string;
}

interface EstadoAssistente {
  passo: 1 | 2 | 3 | 4;
  angulos: VarianteTexto[];
  angulo?: VarianteTexto;
  estrutura: ItemEstrutura[];
  escrevendo?: { atual: number; total: number; cancelar: boolean; erro?: string; fim?: boolean };
}

const estados = new Map<string, EstadoAssistente>();

function estadoDe(roteiroId: string): EstadoAssistente {
  let e = estados.get(roteiroId);
  if (!e) {
    e = { passo: 1, angulos: [], estrutura: [] };
    estados.set(roteiroId, e);
  }
  return e;
}

const PASSOS = ['Briefing', 'Ângulo', 'Estrutura', 'Escrever'] as const;

function buildPassos(e: EstadoAssistente, irPara: (p: EstadoAssistente['passo']) => void): HTMLElement {
  const barra = document.createElement('ol');
  barra.className = 'rte-as-passos';
  PASSOS.forEach((nome, i) => {
    const n = (i + 1) as EstadoAssistente['passo'];
    const li = document.createElement('li');
    li.className = 'rte-as-passo';
    li.classList.toggle('is-atual', e.passo === n);
    li.classList.toggle('is-feito', e.passo > n);
    const b = document.createElement('button');
    b.type = 'button';
    b.disabled = n > e.passo || Boolean(e.escrevendo && !e.escrevendo.fim);
    b.append(Object.assign(document.createElement('span'), { className: 'rte-as-n', textContent: e.passo > n ? '✓' : String(n) }), nome);
    b.addEventListener('click', () => irPara(n));
    li.appendChild(b);
    barra.appendChild(li);
  });
  return barra;
}

function erroInline(alvo: HTMLElement, erro: unknown): void {
  alvo.querySelector(':scope > .md-erro')?.remove();
  alvo.prepend(Object.assign(document.createElement('p'), { className: 'md-erro', textContent: mensagemDeErro(erro) }));
}

function somaEstrutura(estrutura: ItemEstrutura[]): number {
  return estrutura.reduce((t, i) => t + (i.duracaoSeg ?? 0), 0);
}

export function buildAssistente(ctx: CtxEstudio, redesenhar: () => void): HTMLElement {
  const r = ctx.r;
  const e = estadoDe(r.id);
  const wrap = document.createElement('div');
  wrap.className = 'rte-as';
  const irPara = (p: EstadoAssistente['passo']): void => {
    e.passo = p;
    redesenhar();
  };
  wrap.appendChild(buildPassos(e, irPara));
  const corpo = document.createElement('div');
  corpo.className = 'rte-as-corpo';
  wrap.appendChild(corpo);

  // ---------- 1. Briefing ----------
  if (e.passo === 1) {
    corpo.appendChild(
      Object.assign(document.createElement('p'), {
        className: 'rte-as-intro',
        textContent: 'Conte do que é o vídeo. Quanto mais concreto (fatos, números, links na Pesquisa), melhor a IA escreve.',
      }),
    );
    const b = r.briefing;
    const ligado = (rotulo: string, valor: string, placeholder: string, aoMudar: (v: string) => void, linhas = 0, dica?: string): HTMLElement => {
      const el = linhas ? textarea(valor, placeholder, linhas) : input('text', valor, placeholder);
      el.addEventListener('input', () => {
        aoMudar(el.value);
        ctx.digitou();
      });
      return campo(rotulo, el, dica);
    };
    corpo.append(
      ligado('Tema', b.tema, 'Ex.: as demissões na Xbox e o Halo indo para a Activision', (v) => (b.tema = v), 2),
      ligado('Público', b.publico, 'Ex.: gamers e fãs de Halo', (v) => (b.publico = v)),
      ligado('Tom', b.tom, 'Ex.: investigativo, sério, mas acessível', (v) => (b.tom = v)),
      ligado('Objetivo', b.objetivo, 'Ex.: explicar o que muda e gerar debate nos comentários', (v) => (b.objetivo = v)),
      ligado('Pontos-chave', b.pontosChave, 'Um por linha: fatos, números, o que não pode faltar', (v) => (b.pontosChave = v), 4),
    );
    const duracao = input('text', b.duracaoAlvoSeg ? formatarTempo(b.duracaoAlvoSeg) : '', 'Ex.: 60s, 8 min, 12:00');
    duracao.addEventListener('change', () => {
      const v = duracao.value.trim();
      b.duracaoAlvoSeg = (v.includes(':') ? lerTempo(v) : lerDuracaoTexto(v)) ?? undefined;
      if (!b.duracaoAlvoSeg) delete b.duracaoAlvoSeg;
      duracao.value = b.duracaoAlvoSeg ? formatarTempo(b.duracaoAlvoSeg) : '';
      ctx.digitou();
    });
    corpo.appendChild(campo('Duração alvo', duracao, 'As cenas da estrutura somam este tempo.'));
    const seguir = buildBotao('Propor ângulos', { icone: ICONES.estrela, variante: 'primario' });
    seguir.addEventListener('click', () =>
      void (async () => {
        if (!b.tema.trim() && !r.titulo.trim()) {
          erroInline(corpo, 'Diga o tema (ou dê um título ao roteiro) primeiro.');
          return;
        }
        const resp = await pedir(seguir, 'roteiro-angulos', contextoIa(r, {}, false));
        if (!resp?.variantes?.length) return;
        e.angulos = resp.variantes;
        e.passo = 2;
        redesenhar();
      })(),
    );
    const pular = buildBotao('Já sei o ângulo — ir para a estrutura', { variante: 'fantasma' });
    pular.addEventListener('click', () => irPara(3));
    corpo.appendChild(Object.assign(document.createElement('div'), { className: 'rte-as-acoes' })).append(pular, seguir);
  }

  // ---------- 2. Ângulos ----------
  if (e.passo === 2) {
    corpo.appendChild(Object.assign(document.createElement('p'), { className: 'rte-as-intro', textContent: 'Três formas de contar o mesmo tema. Escolha uma — ela guia a estrutura e as falas.' }));
    const grade = document.createElement('div');
    grade.className = 'rte-as-angulos';
    e.angulos.forEach((a) => {
      const c = document.createElement('article');
      c.className = 'rte-as-angulo';
      c.classList.toggle('is-escolhido', e.angulo === a);
      c.append(
        Object.assign(document.createElement('h4'), { textContent: a.titulo ?? 'Ângulo' }),
        Object.assign(document.createElement('p'), { className: 'rte-as-gancho', textContent: a.gancho ? `“${a.gancho}”` : '' }),
        Object.assign(document.createElement('p'), { textContent: a.texto ?? '' }),
      );
      const usar = buildBotao(e.angulo === a ? 'Escolhido' : 'Escolher', { icone: ICONES.check, variante: e.angulo === a ? 'primario' : 'secundario' });
      usar.addEventListener('click', () => {
        e.angulo = a;
        redesenhar();
      });
      c.appendChild(usar);
      grade.appendChild(c);
    });
    corpo.appendChild(grade);
    const outros = buildBotao('Pedir outros', { icone: ICONES.estrela, variante: 'fantasma' });
    outros.addEventListener('click', () =>
      void (async () => {
        const resp = await pedir(outros, 'roteiro-angulos', contextoIa(r, { orientacao: `Ângulos que já foram propostos (não repita): ${e.angulos.map((a) => a.titulo).join('; ')}` }, false));
        if (resp?.variantes?.length) {
          e.angulos = resp.variantes;
          e.angulo = undefined;
          redesenhar();
        }
      })(),
    );
    const estrutura = buildBotao('Montar a estrutura', { icone: ICONES.lista, variante: 'primario' });
    estrutura.disabled = !e.angulo;
    estrutura.title = e.angulo ? '' : 'Escolha um ângulo primeiro';
    estrutura.addEventListener('click', () => void montarEstrutura(estrutura));
    corpo.appendChild(Object.assign(document.createElement('div'), { className: 'rte-as-acoes' })).append(outros, estrutura);
  }

  async function montarEstrutura(botao: HTMLButtonElement): Promise<void> {
    const angulo = e.angulo ? `Ângulo escolhido: ${e.angulo.titulo}\nGancho: ${e.angulo.gancho ?? ''}\nAbordagem: ${e.angulo.texto ?? ''}` : '';
    const resp = await pedir(botao, 'roteiro-estrutura', contextoIa(r, { orientacao: angulo, referencia: [contextoIa(r).referencia, angulo].filter(Boolean).join('\n\n') }, false));
    if (!resp?.json) return;
    const itens = lista(resp.json, 'cenas')
      .map((v): ItemEstrutura | null => {
        const o = (v ?? {}) as Record<string, unknown>;
        const titulo = str(o.titulo);
        if (!titulo) return null;
        const d = num(o.duracaoSeg);
        return { tipo: isTipoCena(o.tipo) ? o.tipo : 'secao', titulo, duracaoSeg: d && d > 0 ? Math.round(d) : undefined, objetivo: str(o.objetivo) };
      })
      .filter((i): i is ItemEstrutura => i !== null);
    if (!itens.length) {
      erroInline(corpo, 'A IA não devolveu cenas. Tente de novo.');
      return;
    }
    e.estrutura = itens;
    e.passo = 3;
    redesenhar();
  }

  // ---------- 3. Estrutura ----------
  if (e.passo === 3) {
    const alvo = r.briefing.duracaoAlvoSeg;
    const soma = somaEstrutura(e.estrutura);
    corpo.appendChild(
      Object.assign(document.createElement('p'), {
        className: 'rte-as-intro',
        textContent: e.estrutura.length
          ? `Ajuste as cenas antes de escrever. Soma: ${formatarTempo(soma)}${alvo ? ` de ${formatarTempo(alvo)} pretendidos` : ''}.`
          : 'Monte a estrutura com a IA ou adicione as cenas na mão.',
      }),
    );
    const tabela = document.createElement('div');
    tabela.className = 'rte-as-estrutura';
    e.estrutura.forEach((it, i) => {
      const linha = document.createElement('div');
      linha.className = 'rte-as-linha';
      linha.style.setProperty('--c', tipoDe(it.tipo).cor);
      const tipo = select(it.tipo, TIPOS_CENA.map((t) => ({ value: t.id, label: t.rotulo })));
      tipo.addEventListener('change', () => {
        if (isTipoCena(tipo.value)) it.tipo = tipo.value;
        linha.style.setProperty('--c', tipoDe(it.tipo).cor);
      });
      const titulo = input('text', it.titulo, 'Título');
      titulo.addEventListener('input', () => (it.titulo = titulo.value));
      const dur = input('text', it.duracaoSeg ? formatarTempo(it.duracaoSeg) : '', 'm:ss');
      dur.className = 'md-input rte-alvo';
      dur.addEventListener('change', () => {
        const v = dur.value.trim();
        it.duracaoSeg = v ? (lerTempo(v.includes(':') ? v : `0:${v.padStart(2, '0')}`) ?? undefined) : undefined;
        redesenhar();
      });
      const objetivo = input('text', it.objetivo, 'O que esta cena precisa dizer ou mostrar');
      objetivo.classList.add('rte-as-objetivo');
      objetivo.addEventListener('input', () => (it.objetivo = objetivo.value));
      const remover = buildBotao('', { icone: ICONES.lixeira, variante: 'fantasma', titulo: 'Tirar cena' });
      remover.classList.add('is-mini', 'is-perigo');
      remover.addEventListener('click', () => {
        e.estrutura.splice(i, 1);
        redesenhar();
      });
      linha.append(Object.assign(document.createElement('span'), { className: 'rte-as-n', textContent: String(i + 1) }), tipo, titulo, dur, remover, objetivo);
      tabela.appendChild(linha);
    });
    corpo.appendChild(tabela);
    const add = buildBotao('Cena', { icone: ICONES.mais, variante: 'fantasma' });
    add.addEventListener('click', () => {
      e.estrutura.push({ tipo: 'secao', titulo: `Cena ${e.estrutura.length + 1}`, objetivo: '' });
      redesenhar();
    });
    const refazer = buildBotao(e.estrutura.length ? 'Refazer com IA' : 'Montar com IA', { icone: ICONES.estrela, variante: 'secundario' });
    refazer.addEventListener('click', () => void montarEstrutura(refazer));
    const escrever = buildBotao('Escrever o roteiro', { icone: ICONES.roteiro, variante: 'primario' });
    escrever.disabled = !e.estrutura.length;
    escrever.addEventListener('click', () => void escreverTudo(escrever));
    corpo.appendChild(Object.assign(document.createElement('div'), { className: 'rte-as-acoes' })).append(add, refazer, escrever);
  }

  async function escreverTudo(botao: HTMLButtonElement): Promise<void> {
    if (!(await exigirIa('texto'))) return;
    const temConteudo = r.cenas.some((c) => c.fala.trim() || c.visual.trim());
    if (temConteudo) {
      const ok = await openConfirmModal({
        title: 'Escrever o roteiro',
        message: 'As cenas atuais serão trocadas pela estrutura nova. Elas ficam guardadas numa versão ("Antes da IA").',
        confirmText: 'Escrever',
        danger: false,
      });
      if (!ok) return;
    }
    const ia: EscolhaTexto | null = await escolherIaDeTexto(botao);
    if (!ia) return;
    await ctx.versaoAntes('Antes da IA: assistente');
    r.cenas = e.estrutura.map((it) => ({
      ...novaCena(it.tipo, it.titulo),
      notas: it.objetivo ? `Objetivo: ${it.objetivo}` : '',
      ...(it.duracaoSeg ? { duracaoAlvoSeg: it.duracaoSeg } : {}),
    }));
    e.passo = 4;
    ctx.mudouEstrutura();
    await escreverDe(0, ia);
  }

  /**
   * Escreve as cenas a partir de `inicio`. Separado para "Continuar de onde
   * parou": um erro no meio (crédito, rede) não obriga a recomeçar.
   */
  async function escreverDe(inicio: number, ia: EscolhaTexto): Promise<void> {
    e.escrevendo = { atual: inicio, total: r.cenas.length, cancelar: false };
    redesenhar();
    const angulo = e.angulo ? `Ângulo: ${e.angulo.titulo} — ${e.angulo.texto ?? ''}${e.angulo.gancho ? `\nGancho combinado: ${e.angulo.gancho}` : ''}` : '';
    for (let i = inicio; i < r.cenas.length; i += 1) {
      if (e.escrevendo.cancelar) {
        // "atual" aponta para a cena que ficou faltando (a do "Continuar").
        e.escrevendo.atual = i + 1;
        break;
      }
      e.escrevendo.atual = i + 1;
      redesenhar();
      const cena = r.cenas[i]!;
      const it = e.estrutura[i];
      const orientacao = [
        `Cena ${i + 1} de ${r.cenas.length} — ${tipoDe(cena.tipo).rotulo}: ${cena.titulo}`,
        cena.duracaoAlvoSeg ? `Duração: ${formatarTempo(cena.duracaoAlvoSeg)}` : '',
        it?.objetivo ? `Objetivo: ${it.objetivo}` : '',
        angulo,
      ]
        .filter(Boolean)
        .join('\n');
      try {
        const resp = await gerarTextoIa({
          tarefa: 'roteiro-cena',
          contexto: contextoIa(r, { orientacao, duracao: cena.duracaoAlvoSeg ? formatarTempo(cena.duracaoAlvoSeg) : undefined }),
          ...ia,
        });
        const o = (resp.json ?? {}) as Record<string, unknown>;
        cena.fala = str(o.fala);
        cena.visual = str(o.visual);
        cena.textoTela = str(o.textoTela);
        ctx.mudouEstrutura();
      } catch (erro) {
        e.escrevendo.erro = `Parou na cena ${i + 1}: ${mensagemDeErro(erro)}`;
        break;
      }
    }
    e.escrevendo.fim = true;
    redesenhar();
  }

  // ---------- 4. Escrevendo ----------
  if (e.passo === 4 && e.escrevendo) {
    const w = e.escrevendo;
    const progresso = document.createElement('div');
    progresso.className = 'rte-as-progresso';
    const barra = document.createElement('div');
    barra.className = 'rte-as-barra';
    const feitas = w.fim ? (w.erro || w.cancelar ? w.atual - 1 : w.total) : w.atual - 1;
    const preenchida = document.createElement('i');
    preenchida.style.width = `${(Math.max(0, feitas) / Math.max(1, w.total)) * 100}%`;
    barra.appendChild(preenchida);
    const texto = document.createElement('p');
    texto.className = 'rte-as-intro';
    texto.textContent = w.fim
      ? w.erro
        ? w.erro
        : w.cancelar
          ? `Interrompido: ${Math.max(0, feitas)} de ${w.total} cenas escritas.`
          : `Pronto: ${w.total} cenas escritas. Revise nos cartões — cada uma tem o botão de IA para ajustar.`
      : `Escrevendo a cena ${w.atual} de ${w.total}…`;
    if (!w.fim) texto.prepend(document.createRange().createContextualFragment(svg(ICONES.estrela, 13, 2)));
    progresso.append(barra, texto);
    corpo.appendChild(progresso);
    const acoes = Object.assign(document.createElement('div'), { className: 'rte-as-acoes' });
    if (!w.fim) {
      const parar = buildBotao('Parar', { icone: ICONES.xis, variante: 'secundario' });
      parar.addEventListener('click', () => {
        w.cancelar = true;
        parar.disabled = true;
      });
      acoes.appendChild(parar);
    } else {
      const recomecar = buildBotao('Começar de novo', { variante: 'fantasma' });
      recomecar.addEventListener('click', () => {
        estados.delete(r.id);
        redesenhar();
      });
      // Parou no meio (erro ou "Parar"): segue da cena que faltou.
      const faltou = w.atual - 1;
      if ((w.erro || w.cancelar) && faltou >= 0 && faltou < r.cenas.length) {
        const continuar = buildBotao(`Continuar da cena ${faltou + 1}`, { icone: ICONES.estrela, variante: 'secundario' });
        continuar.addEventListener('click', () =>
          void (async () => {
            if (!(await exigirIa('texto'))) return;
            const ia = await escolherIaDeTexto(continuar);
            if (ia) await escreverDe(faltou, ia);
          })(),
        );
        acoes.appendChild(continuar);
      }
      const revisar = buildBotao('Revisar com a IA', { icone: ICONES.lupa, variante: 'primario' });
      revisar.addEventListener('click', () => ctx.abrirAba('revisao'));
      acoes.append(recomecar, revisar);
    }
    corpo.appendChild(acoes);
  }
  return wrap;
}

/** O assistente está escrevendo agora? (o Estúdio não deve trocar de roteiro no meio). */
export function assistenteOcupado(roteiroId: string): boolean {
  const e = estados.get(roteiroId);
  return Boolean(e?.escrevendo && !e.escrevendo.fim);
}
