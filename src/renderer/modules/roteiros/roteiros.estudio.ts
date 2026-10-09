import { falaCompleta, formatarTempo, lerDuracaoTexto, lerTempo, markdownDasCenas, ppmDe } from '../../../shared/types/roteiros.conversao.js';
import { FORMATOS_ROTEIRO, type FormatoRoteiro, type Roteiro, type RoteirosFile } from '../../../shared/types/roteiros.types.js';
import { ligarAtalhos } from '../../core/atalhos.js';
import { abrirModulo } from '../../core/navegacao.js';
import { campo, input, pilulas, textarea } from '../../ui/campos.js';
import { abrirMenuIa } from '../../ui/ia.js';
import { buildSecaoModal, mensagemDeErro, openAvisoModal, openConfirmModal, promptText } from '../../ui/modal.js';
import { buildBotao, buildSegmentado, buildSelo, svg } from '../../ui/pagina.js';
import { buildAssistente, assistenteOcupado } from './roteiros.assistente.js';
import { atualizarTempos, buildAV, buildCartoes, buildIndice, destruirArraste } from './roteiros.cartoes.js';
import {
  ICONES,
  TOM_DO_STATUS,
  catalogoTags,
  rotuloStatus,
  type AbaDireita,
  type AbaEsquerda,
  type CtxEstudio,
  type ModoEscrita,
} from './roteiros.comum.js';
import { buildAdaptar, ganchoECta, rascunhoRapido, revisarPortugues } from './roteiros.ia.js';
import { buildLinhaTempo } from './roteiros.linhaTempo.js';
import { buildLivre, descarregarLivre } from './roteiros.livre.js';
import { buildPrevia } from './roteiros.previa.js';
import { buildRevisor } from './roteiros.revisor.js';
import { abrirTeleprompter } from './roteiros.teleprompter.js';
import { abrirVersoes } from './roteiros.versoes.js';
import * as roteirosState from './roteiros.state.js';

/**
 * Estúdio de roteiro: a tela cheia de um roteiro. Topo (título, situação,
 * ferramentas), linha do tempo, e três colunas — estrutura/briefing/pesquisa,
 * a escrita (cartões, duas colunas ou texto livre) e prévia/IA/revisão/
 * verificação.
 *
 * O rascunho é uma cópia do roteiro salvo. Digitação salva na pausa, sem
 * redesenhar o que está sob o cursor; mudança de estrutura redesenha o centro
 * e o índice. Ações que mudam o arquivo (status, restaurar versão) primeiro
 * descarregam o que está pendente e depois recarregam o rascunho do arquivo.
 */

interface OpcoesEstudio {
  aba?: AbaDireita;
}

const CHAVE_PREFS = 'iris.roteiros.estudio';

interface Prefs {
  modo: ModoEscrita;
  esquerda: AbaEsquerda;
  direita: AbaDireita;
  /** Foco na escrita: as colunas dos lados somem e o centro ocupa tudo. */
  foco: boolean;
}

function lerPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PREFS) ?? '{}') as Partial<Prefs>;
    return {
      modo: p.modo === 'av' || p.modo === 'livre' ? p.modo : 'cartoes',
      esquerda: p.esquerda === 'briefing' || p.esquerda === 'pesquisa' ? p.esquerda : 'estrutura',
      direita: p.direita === 'ia' || p.direita === 'revisao' || p.direita === 'verificacao' ? p.direita : 'previa',
      foco: p.foco === true,
    };
  } catch {
    return { modo: 'cartoes', esquerda: 'estrutura', direita: 'previa', foco: false };
  }
}

let prefs = lerPrefs();

function lembrarPrefs(): void {
  try {
    localStorage.setItem(CHAVE_PREFS, JSON.stringify(prefs));
  } catch {
    // Sem armazenamento local, a escolha vale até fechar.
  }
}

interface Estudio {
  container: HTMLElement;
  r: Roteiro;
  aoFechar: () => void;
  timerSalvar: ReturnType<typeof setTimeout> | null;
  timerLeve: ReturnType<typeof setTimeout> | null;
  els: {
    salvo: HTMLElement;
    status: HTMLElement;
    acoesStatus: HTMLElement;
    linha: HTMLElement;
    corpo: HTMLElement;
    esquerda: HTMLElement;
    centro: HTMLElement;
    direita: HTMLElement;
    titulo: HTMLInputElement;
  };
}

let atual: Estudio | null = null;
let desligarAtalhos: (() => void) | null = null;

export function estudioAberto(): boolean {
  return atual !== null;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

// ---------- Salvamento ----------

function marcar(texto: string, classe = ''): void {
  if (!atual) return;
  atual.els.salvo.textContent = texto;
  atual.els.salvo.className = `rte-salvo ${classe}`.trim();
}

async function descarregar(forcar = false): Promise<void> {
  const e = atual;
  if (!e) return;
  if (e.timerSalvar) {
    clearTimeout(e.timerSalvar);
    e.timerSalvar = null;
  } else if (!forcar) return;
  const r = e.r;
  try {
    await roteirosState.atualizarSilencioso({
      roteiroId: r.id,
      titulo: r.titulo.trim() || 'Sem título',
      tagIds: r.tagIds,
      formato: r.formato,
      briefing: r.briefing,
      cenas: r.cenas,
      pesquisa: r.pesquisa,
      observacoes: r.observacoes,
      checklist: r.checklist,
      ...(r.revisaoIa ? { revisaoIa: r.revisaoIa } : {}),
    });
    // Editar um reprovado volta a rascunho no main: acompanha aqui.
    const salvo = roteirosState.getCurrentState()?.roteiros.find((x) => x.id === r.id);
    if (salvo && salvo.status !== r.status) {
      r.status = salvo.status;
      r.historico = salvo.historico;
      desenharStatus();
    }
    if (atual === e) marcar('Salvo', 'is-ok');
  } catch (erro) {
    if (atual === e) marcar(`Não salvou: ${mensagemDeErro(erro)}`, 'is-erro');
  }
}

function agendarSalvar(): void {
  const e = atual;
  if (!e) return;
  marcar('Salvando…');
  if (e.timerSalvar) clearTimeout(e.timerSalvar);
  e.timerSalvar = setTimeout(() => void descarregar(), 600);
}

// ---------- Contexto das partes ----------

function ctxDe(e: Estudio): CtxEstudio {
  return {
    get r() {
      return e.r;
    },
    digitou: () => {
      agendarSalvar();
      // Tempos, linha do tempo, índice e prévia acompanham sem tocar nos campos.
      if (e.timerLeve) clearTimeout(e.timerLeve);
      e.timerLeve = setTimeout(() => {
        if (atual !== e) return;
        desenharLinha();
        atualizarTempos(e.els.centro, ctxDe(e));
        if (prefs.esquerda === 'estrutura') desenharEsquerda();
        if (prefs.direita === 'previa') desenharDireita();
      }, 250);
    },
    mudouEstrutura: () => {
      agendarSalvar();
      desenharCentro();
      desenharLinha();
      if (prefs.esquerda === 'estrutura') desenharEsquerda();
      if (prefs.direita === 'previa' || prefs.direita === 'revisao') desenharDireita();
    },
    irParaCena: (cenaId) => irParaCena(cenaId),
    versaoAntes: async (rotulo) => {
      descarregarLivre();
      await descarregar(true);
      const file = await roteirosState.salvarVersao({ roteiroId: e.r.id, rotulo, origem: 'ia' });
      const salvo = file.roteiros.find((x) => x.id === e.r.id);
      if (salvo) e.r.versoes = salvo.versoes;
    },
    falhou,
    abrirAba: (aba) => {
      prefs.direita = aba;
      lembrarPrefs();
      desenharDireita();
    },
    abrirRoteiro: (id) => {
      void trocarPara(id);
    },
  };
}

function irParaCena(cenaId: string): void {
  const e = atual;
  if (!e) return;
  // No texto livre não há cartão: vai para os cartões.
  if (prefs.modo === 'livre') {
    descarregarLivre();
    prefs.modo = 'cartoes';
    lembrarPrefs();
    desenharCentro();
  }
  const alvo = e.els.centro.querySelector<HTMLElement>(`[data-cena="${cenaId}"]`);
  if (!alvo) return;
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  alvo.classList.remove('is-destaque');
  void alvo.offsetWidth;
  alvo.classList.add('is-destaque');
  alvo.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true });
}

// ---------- Regiões ----------

function desenharLinha(): void {
  const e = atual;
  if (!e) return;
  e.els.linha.replaceChildren(buildLinhaTempo(e.r, irParaCena));
}

function desenharStatus(): void {
  const e = atual;
  if (!e) return;
  const r = e.r;
  e.els.status.replaceChildren(buildSelo(rotuloStatus(r.status), TOM_DO_STATUS[r.status]));
  const acoes = e.els.acoesStatus;
  acoes.replaceChildren();

  const acao = (fn: () => Promise<void>): void => {
    descarregarLivre();
    void descarregar(true)
      .then(fn)
      .catch(falhou);
  };
  const aprovar = buildBotao('Aprovar', { icone: ICONES.check, variante: 'primario', titulo: 'Aprovar e criar o card na primeira coluna do Kanban' });
  aprovar.addEventListener('click', () => {
    const pendentes = r.checklist.filter((i) => !i.feito).length;
    void openConfirmModal({
      title: 'Aprovar roteiro',
      message: pendentes
        ? `${pendentes} item(ns) da verificação ainda não foram marcados. Aprovar mesmo assim? Um card será criado na primeira coluna do Kanban.`
        : 'O roteiro será aprovado e um card será criado na primeira coluna do Kanban.',
      confirmText: 'Aprovar e enviar',
      danger: false,
    }).then((ok) => ok && acao(() => roteirosState.aprovarRoteiro({ roteiroId: r.id })));
  });
  const voltarRascunho = (): HTMLButtonElement => {
    const b = buildBotao('Voltar a rascunho', { icone: ICONES.voltar, variante: 'fantasma' });
    b.addEventListener('click', () => acao(() => roteirosState.mudarStatus({ roteiroId: r.id, status: 'rascunho' })));
    return b;
  };
  switch (r.status) {
    case 'rascunho':
    case 'reprovado': {
      const revisar = buildBotao('Enviar para revisão', { icone: ICONES.enviar, variante: 'secundario' });
      revisar.addEventListener('click', () => acao(() => roteirosState.mudarStatus({ roteiroId: r.id, status: 'revisao' })));
      acoes.append(revisar, aprovar);
      break;
    }
    case 'revisao': {
      const reprovar = buildBotao('Reprovar', { icone: ICONES.xis, variante: 'secundario' });
      reprovar.addEventListener('click', () => {
        void promptText('Reprovar roteiro', 'O que precisa mudar?', '', { icone: ICONES.xis, subtitulo: 'O motivo fica no histórico e orienta a próxima versão.' }).then((motivo) => {
          if (motivo !== null) acao(() => roteirosState.mudarStatus({ roteiroId: r.id, status: 'reprovado', comentario: motivo }));
        });
      });
      acoes.append(voltarRascunho(), reprovar, aprovar);
      break;
    }
    case 'aprovado': {
      const kanban = buildBotao('Abrir no Kanban', { icone: ICONES.kanban, variante: 'primario' });
      kanban.addEventListener('click', () => {
        void sair().then(() => abrirModulo('kanban'));
      });
      acoes.append(voltarRascunho(), kanban);
      break;
    }
  }
}

function desenharCentro(): void {
  const e = atual;
  if (!e) return;
  const ctx = ctxDe(e);
  const rolagem = e.els.centro.scrollTop;
  const cab = document.createElement('div');
  cab.className = 'rte-centro-cab';
  const modos = buildSegmentado<ModoEscrita>(
    [
      { value: 'cartoes', label: 'Cartões' },
      { value: 'av', label: 'Duas colunas' },
      { value: 'livre', label: 'Texto livre' },
    ],
    prefs.modo,
    (v) => {
      descarregarLivre();
      prefs.modo = v;
      lembrarPrefs();
      desenharCentro();
    },
  );
  modos.setAttribute('aria-label', 'Modo de escrita');
  cab.appendChild(modos);
  const foco = buildBotao(prefs.foco ? 'Mostrar painéis' : 'Foco', {
    icone: prefs.foco ? '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>' : '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    variante: 'fantasma',
    titulo: prefs.foco ? 'Voltar a mostrar estrutura, prévia e IA' : 'Esconder as colunas dos lados e escrever com a tela toda',
  });
  foco.classList.add('rte-foco');
  foco.addEventListener('click', () => {
    prefs.foco = !prefs.foco;
    lembrarPrefs();
    e.els.corpo.classList.toggle('is-foco', prefs.foco);
    desenharCentro();
  });
  cab.appendChild(foco);
  cab.appendChild(
    Object.assign(document.createElement('span'), {
      className: 'rte-centro-dica',
      textContent:
        prefs.modo === 'cartoes'
          ? 'Uma cena por cartão: fala, o que se vê e o letreiro.'
          : prefs.modo === 'av'
            ? 'Formato AV: vídeo à esquerda, áudio à direita, uma linha por cena.'
            : 'O roteiro inteiro em texto. Vira cenas quando você para de digitar.',
    }),
  );
  const conteudo = prefs.modo === 'cartoes' ? buildCartoes(ctx) : prefs.modo === 'av' ? buildAV(ctx) : buildLivre(ctx);
  e.els.centro.replaceChildren(cab, conteudo);
  e.els.centro.scrollTop = rolagem;
}

function abasEsquerda(): HTMLElement {
  const abas = buildSegmentado<AbaEsquerda>(
    [
      { value: 'estrutura', label: 'Estrutura' },
      { value: 'briefing', label: 'Briefing' },
      { value: 'pesquisa', label: 'Pesquisa' },
    ],
    prefs.esquerda,
    (v) => {
      prefs.esquerda = v;
      lembrarPrefs();
      desenharEsquerda();
    },
  );
  abas.classList.add('rte-abas');
  return abas;
}

function desenharEsquerda(): void {
  const e = atual;
  if (!e) return;
  const ctx = ctxDe(e);
  const corpo = document.createElement('div');
  corpo.className = 'rte-col-corpo';
  if (prefs.esquerda === 'estrutura') {
    destruirArraste();
    corpo.appendChild(buildIndice(ctx));
  } else if (prefs.esquerda === 'briefing') corpo.appendChild(buildBriefing(ctx));
  else corpo.appendChild(buildPesquisa(ctx));
  const rolagem = e.els.esquerda.querySelector('.rte-col-corpo')?.scrollTop ?? 0;
  e.els.esquerda.replaceChildren(abasEsquerda(), corpo);
  corpo.scrollTop = rolagem;
}

function desenharDireita(): void {
  const e = atual;
  if (!e) return;
  const ctx = ctxDe(e);
  const abas = buildSegmentado<AbaDireita>(
    [
      { value: 'previa', label: 'Prévia' },
      { value: 'ia', label: 'IA' },
      { value: 'revisao', label: 'Revisão' },
      { value: 'verificacao', label: 'Verificação' },
    ],
    prefs.direita,
    (v) => {
      prefs.direita = v;
      lembrarPrefs();
      desenharDireita();
    },
  );
  abas.classList.add('rte-abas');
  const corpo = document.createElement('div');
  corpo.className = 'rte-col-corpo';
  const anterior = e.els.direita.querySelector('.rte-col-corpo');
  const rolagem = anterior && e.els.direita.dataset.aba === prefs.direita ? anterior.scrollTop : 0;
  if (prefs.direita === 'previa') corpo.appendChild(buildPrevia(e.r, irParaCena));
  else if (prefs.direita === 'ia') corpo.appendChild(buildAbaIa(ctx));
  else if (prefs.direita === 'revisao') corpo.appendChild(buildRevisor(ctx, desenharDireita));
  else corpo.appendChild(buildVerificacao(ctx));
  e.els.direita.dataset.aba = prefs.direita;
  e.els.direita.replaceChildren(abas, corpo);
  corpo.scrollTop = rolagem;
}

// ---------- Aba IA ----------

function secaoCol(titulo: string, descricao: string, ...conteudo: HTMLElement[]): HTMLElement {
  const { secao, conteudo: c } = buildSecaoModal(titulo, descricao);
  secao.classList.add('rte-secao');
  c.append(...conteudo);
  return secao;
}

function buildAbaIa(ctx: CtxEstudio): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rte-aba-ia';
  wrap.appendChild(secaoCol('Assistente: do tema ao roteiro', 'Briefing → ângulo → estrutura → escrever, cena por cena.', buildAssistente(ctx, desenharDireita)));

  const grade = document.createElement('div');
  grade.className = 'rte-ia-acoes';
  const acao = (rotulo: string, dica: string, fazer: (b: HTMLButtonElement) => Promise<void>): void => {
    const b = buildBotao(rotulo, { icone: ICONES.estrela, variante: 'secundario', titulo: dica });
    b.addEventListener('click', () => void fazer(b));
    const item = document.createElement('div');
    item.className = 'rte-ia-acao';
    item.append(b, Object.assign(document.createElement('span'), { textContent: dica }));
    grade.appendChild(item);
  };
  acao('Rascunho de uma vez', 'O roteiro inteiro num pedido só, a partir do briefing.', (b) => rascunhoRapido(b, ctx));
  acao('Revisar português e ritmo', 'Corrige e deixa as falas mais naturais, sem mudar a estrutura.', (b) => revisarPortugues(b, ctx));
  acao('Gancho e CTA', 'Três pares para a abertura e a chamada final.', (b) => ganchoECta(b, ctx));
  wrap.appendChild(secaoCol('Roteiro inteiro', 'Cada cena também tem o botão IA no cartão, para ajustes pontuais.', grade));
  wrap.appendChild(secaoCol('Adaptar para outro formato', 'Vira um roteiro novo; este fica como está.', buildAdaptar(ctx)));
  return wrap;
}

// ---------- Briefing e pesquisa ----------

function buildBriefing(ctx: CtxEstudio): HTMLElement {
  const r = ctx.r;
  const b = r.briefing;
  const wrap = document.createElement('div');
  wrap.className = 'rte-form';
  const ligado = (rotulo: string, valor: string, placeholder: string, aoMudar: (v: string) => void, linhas = 0, dica?: string): HTMLElement => {
    const el = linhas ? textarea(valor, placeholder, linhas) : input('text', valor, placeholder);
    el.addEventListener('input', () => {
      aoMudar(el.value);
      ctx.digitou();
    });
    return campo(rotulo, el, dica);
  };
  wrap.appendChild(
    campo(
      'Formato',
      pilulas<FormatoRoteiro>(
        FORMATOS_ROTEIRO.map((f) => ({ id: f.id, rotulo: f.rotulo })),
        () => r.formato,
        (v) => {
          r.formato = v;
          ctx.digitou();
          desenharEsquerda();
        },
      ),
    ),
  );
  const duracao = input('text', b.duracaoAlvoSeg ? formatarTempo(b.duracaoAlvoSeg) : '', 'Ex.: 60s, 8 min, 12:00');
  duracao.addEventListener('change', () => {
    const v = duracao.value.trim();
    const seg = v ? ((v.includes(':') ? lerTempo(v) : lerDuracaoTexto(v)) ?? undefined) : undefined;
    if (seg) b.duracaoAlvoSeg = seg;
    else delete b.duracaoAlvoSeg;
    duracao.value = b.duracaoAlvoSeg ? formatarTempo(b.duracaoAlvoSeg) : '';
    ctx.digitou();
  });
  const ppm = input('number', b.palavrasPorMinuto ? String(b.palavrasPorMinuto) : '', String(ppmDe({ formato: r.formato, briefing: { ...b, palavrasPorMinuto: undefined } })));
  ppm.min = '60';
  ppm.max = '300';
  ppm.addEventListener('change', () => {
    const n = Number(ppm.value);
    if (n >= 60 && n <= 300) b.palavrasPorMinuto = Math.round(n);
    else {
      delete b.palavrasPorMinuto;
      ppm.value = '';
    }
    ctx.digitou();
  });
  const linha = document.createElement('div');
  linha.className = 'md-grade-2';
  linha.append(campo('Duração alvo', duracao, 'A linha do tempo mede contra ela.'), campo('Palavras por minuto', ppm, 'Vazio = o ritmo do formato.'));
  wrap.appendChild(linha);
  wrap.append(
    ligado('Tema', b.tema, 'Do que o vídeo trata, em uma frase', (v) => (b.tema = v), 2),
    ligado('Público', b.publico, 'Para quem é', (v) => (b.publico = v)),
    ligado('Tom', b.tom, 'Ex.: direto, investigativo, bem-humorado', (v) => (b.tom = v)),
    ligado('Objetivo', b.objetivo, 'O que o vídeo precisa causar', (v) => (b.objetivo = v)),
    ligado('Pontos-chave', b.pontosChave, 'Um por linha: fatos, números, o que não pode faltar', (v) => (b.pontosChave = v), 5),
  );
  if (catalogoTags().length) {
    const tagsWrap = document.createElement('div');
    const desenharTags = (): void => {
      const grupo = document.createElement('div');
      grupo.className = 'md-pilulas';
      catalogoTags().forEach((t) => {
        const ativo = r.tagIds.includes(t.id);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'md-pilula rot-pilula-tag';
        btn.style.setProperty('--cor-tag', t.cor);
        btn.classList.toggle('is-ativa', ativo);
        btn.setAttribute('aria-pressed', String(ativo));
        btn.textContent = t.nome;
        btn.addEventListener('click', () => {
          r.tagIds = ativo ? r.tagIds.filter((id) => id !== t.id) : [...r.tagIds, t.id];
          ctx.digitou();
          desenharTags();
        });
        grupo.appendChild(btn);
      });
      tagsWrap.replaceChildren(grupo);
    };
    desenharTags();
    wrap.appendChild(campo('Tags / empresa', tagsWrap));
  }
  wrap.appendChild(ligado('Observações para a produção', r.observacoes, 'Referências, trilha, legenda, combinados…', (v) => (r.observacoes = v), 3, 'Saem no fim da prévia e no card do Kanban.'));
  return wrap;
}

function buildPesquisa(ctx: CtxEstudio): HTMLElement {
  const p = ctx.r.pesquisa;
  const wrap = document.createElement('div');
  wrap.className = 'rte-form';
  const notas = textarea(p.notas, 'Fatos, números, citações, o que você levantou. A IA escreve em cima disto.', 8);
  notas.addEventListener('input', () => {
    p.notas = notas.value;
    ctx.digitou();
  });
  wrap.appendChild(campo('Notas de pesquisa', notas));

  const lista = document.createElement('div');
  lista.className = 'rte-fontes';
  const desenhar = (): void => {
    lista.replaceChildren();
    p.fontes.forEach((f, i) => {
      const item = document.createElement('div');
      item.className = 'rte-fonte';
      const titulo = input('text', f.titulo, 'Nome da fonte');
      titulo.addEventListener('input', () => {
        f.titulo = titulo.value;
        ctx.digitou();
      });
      const url = input('text', f.url, 'Link (opcional)');
      url.addEventListener('input', () => {
        f.url = url.value;
        ctx.digitou();
      });
      const remover = buildBotao('', { icone: ICONES.xis, variante: 'fantasma', titulo: 'Tirar fonte' });
      remover.classList.add('is-mini');
      remover.addEventListener('click', () => {
        p.fontes.splice(i, 1);
        ctx.digitou();
        desenhar();
      });
      item.append(titulo, remover, url);
      lista.appendChild(item);
    });
    if (!p.fontes.length) lista.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: 'Nenhuma fonte ainda.' }));
  };
  desenhar();
  const adicionar = buildBotao('Fonte', { icone: ICONES.mais, variante: 'secundario' });
  adicionar.addEventListener('click', () => {
    p.fontes.push({ id: crypto.randomUUID(), titulo: '', url: '', nota: '' });
    ctx.digitou();
    desenhar();
    lista.querySelectorAll<HTMLInputElement>('.rte-fonte input')[(p.fontes.length - 1) * 2]?.focus();
  });
  wrap.appendChild(campo('Fontes', lista, 'Saem no fim da prévia, do .md exportado e do card do Kanban.'));
  wrap.appendChild(adicionar);
  return wrap;
}

// ---------- Verificação ----------

function buildVerificacao(ctx: CtxEstudio): HTMLElement {
  const r = ctx.r;
  const wrap = document.createElement('div');
  wrap.className = 'rte-verificacao';
  const checklist = document.createElement('div');
  checklist.className = 'rot-checklist';
  const desenhar = (focarNovo = false): void => {
    checklist.replaceChildren();
    const feitos = r.checklist.filter((i) => i.feito).length;
    const total = r.checklist.length;
    const resumo = document.createElement('p');
    resumo.className = 'rot-checklist-resumo';
    resumo.classList.toggle('is-completo', total > 0 && feitos === total);
    resumo.textContent = total ? `${feitos} de ${total} verificado${total === 1 ? '' : 's'}` : 'Nenhum item de verificação.';
    checklist.appendChild(resumo);
    r.checklist.forEach((item, i) => {
      const linha = document.createElement('label');
      linha.className = 'rot-checklist-item';
      linha.classList.toggle('is-feito', item.feito);
      const caixa = document.createElement('input');
      caixa.type = 'checkbox';
      caixa.checked = item.feito;
      caixa.addEventListener('change', () => {
        item.feito = caixa.checked;
        ctx.digitou();
        desenhar();
      });
      const remover = document.createElement('button');
      remover.type = 'button';
      remover.className = 'rot-checklist-remover';
      remover.title = 'Remover item';
      remover.setAttribute('aria-label', `Remover "${item.texto}"`);
      remover.innerHTML = svg(ICONES.xis, 12, 2);
      remover.addEventListener('click', (ev) => {
        ev.preventDefault();
        r.checklist.splice(i, 1);
        ctx.digitou();
        desenhar();
      });
      linha.append(caixa, Object.assign(document.createElement('span'), { textContent: item.texto }), remover);
      checklist.appendChild(linha);
    });
    const novo = input('text', '', 'Novo item de verificação e Enter');
    novo.classList.add('rot-checklist-novo');
    novo.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' || !novo.value.trim()) return;
      ev.preventDefault();
      r.checklist.push({ id: crypto.randomUUID(), texto: novo.value.trim(), feito: false });
      ctx.digitou();
      desenhar(true);
    });
    checklist.appendChild(novo);
    if (focarNovo) novo.focus();
  };
  desenhar();
  wrap.appendChild(secaoCol('Verificação', 'Confira antes de aprovar.', checklist));

  const historico = document.createElement('ol');
  historico.className = 'rot-historico';
  r.historico
    .slice()
    .reverse()
    .forEach((ev) => {
      const li = document.createElement('li');
      li.appendChild(buildSelo(rotuloStatus(ev.status), TOM_DO_STATUS[ev.status]));
      const quando = document.createElement('time');
      quando.dateTime = ev.em;
      quando.textContent = new Date(ev.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      li.appendChild(quando);
      if (ev.comentario) li.appendChild(Object.assign(document.createElement('p'), { textContent: ev.comentario }));
      historico.appendChild(li);
    });
  wrap.appendChild(secaoCol('Histórico', 'Mudanças de situação, da mais nova à mais antiga.', historico));
  return wrap;
}

// ---------- Exportar ----------

function baixar(nome: string, conteudo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function nomeArquivo(titulo: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60);
  return `${base || 'roteiro'}.md`;
}

function menuExportar(botao: HTMLButtonElement, r: Roteiro): void {
  const md = (): string => markdownDasCenas(r);
  const copiar = (texto: string, aviso: string): void => {
    void navigator.clipboard.writeText(texto).then(() => marcar(aviso, 'is-ok'));
  };
  abrirMenuIa(
    botao,
    [
      { rotulo: 'Copiar em markdown', dica: 'O roteiro inteiro, com cenas, tempos e fontes', icone: ICONES.duplicar, fazer: () => copiar(md(), 'Markdown copiado') },
      { rotulo: 'Copiar só a fala', dica: 'Para colar no teleprompter de outro app ou mandar para quem grava', icone: ICONES.duplicar, fazer: () => copiar(falaCompleta(r.cenas), 'Fala copiada') },
      { rotulo: 'Baixar .md', dica: 'Arquivo markdown com o roteiro inteiro', icone: ICONES.exportar, fazer: () => baixar(nomeArquivo(r.titulo), md()) },
    ],
    { titulo: 'Exportar' },
  );
}

// ---------- Montagem ----------

function montar(e: Estudio): void {
  const r = e.r;
  const tela = document.createElement('div');
  tela.className = 'rte';

  const topo = document.createElement('header');
  topo.className = 'rte-topo';
  const voltar = buildBotao('Roteiros', { icone: '<path d="m15 18-6-6 6-6"/>', variante: 'fantasma', titulo: 'Voltar para a lista' });
  voltar.classList.add('rte-voltar');
  voltar.addEventListener('click', () => void sair());
  const titulo = e.els.titulo;
  titulo.value = r.titulo;
  titulo.addEventListener('input', () => {
    r.titulo = titulo.value;
    ctxDe(e).digitou();
  });
  const ferramentas = document.createElement('div');
  ferramentas.className = 'rte-ferramentas';
  const teleprompter = buildBotao('Teleprompter', { icone: ICONES.teleprompter, variante: 'fantasma', titulo: 'Ler a fala em tela cheia, rolando sozinha' });
  teleprompter.addEventListener('click', () => {
    descarregarLivre();
    abrirTeleprompter(e.r);
  });
  const versoes = buildBotao('Versões', { icone: ICONES.versoes, variante: 'fantasma', titulo: 'Versões guardadas: comparar e voltar' });
  versoes.addEventListener('click', () => {
    descarregarLivre();
    abrirVersoes(ctxDe(e), () => descarregar(true));
  });
  const exportar = buildBotao('Exportar', { icone: ICONES.exportar, variante: 'fantasma', titulo: 'Copiar ou baixar o roteiro' });
  exportar.addEventListener('click', () => {
    descarregarLivre();
    menuExportar(exportar, e.r);
  });
  const mais = buildBotao('', { icone: ICONES.mais3, variante: 'fantasma', titulo: 'Mais' });
  mais.addEventListener('click', () =>
    abrirMenuIa(
      mais,
      [
        {
          rotulo: 'Duplicar roteiro',
          dica: 'Uma cópia em rascunho, sem versões nem card',
          icone: ICONES.duplicar,
          fazer: () => {
            void descarregar(true)
              .then(() => roteirosState.duplicarRoteiro(r.id))
              .catch(falhou);
          },
        },
        {
          rotulo: 'Excluir roteiro',
          dica: r.kanbanCardId ? 'O card no Kanban continua lá' : 'Apaga o roteiro e as versões dele',
          icone: ICONES.lixeira,
          fazer: () => {
            void openConfirmModal({ title: 'Excluir roteiro', message: `"${r.titulo}" será apagado, com todas as versões.` }).then((ok) => {
              if (!ok) return;
              if (e.timerSalvar) clearTimeout(e.timerSalvar);
              e.timerSalvar = null;
              const id = r.id;
              fecharEstudio();
              e.aoFechar();
              void roteirosState.excluirRoteiro(id).catch(falhou);
            });
          },
        },
      ],
      {},
    ),
  );
  ferramentas.append(teleprompter, versoes, exportar, mais);
  const direitaTopo = document.createElement('div');
  direitaTopo.className = 'rte-topo-direita';
  direitaTopo.append(e.els.salvo, e.els.status, e.els.acoesStatus);
  topo.append(voltar, titulo, direitaTopo);

  // Linha do tempo e ferramentas do roteiro inteiro na mesma faixa.
  const faixa = document.createElement('div');
  faixa.className = 'rte-faixa';
  faixa.append(e.els.linha, ferramentas);

  e.els.corpo.className = 'rte-corpo';
  e.els.corpo.classList.toggle('is-foco', prefs.foco);
  e.els.corpo.append(e.els.esquerda, e.els.centro, e.els.direita);
  tela.append(topo, faixa, e.els.corpo);
  e.container.replaceChildren(tela);

  desenharStatus();
  desenharLinha();
  desenharEsquerda();
  desenharCentro();
  desenharDireita();
  marcar('Salvo', 'is-ok');
}

/** Ctrl+S salva na hora (registro central de atalhos, core/atalhos.ts). */
function salvarAgora(): void {
  if (!atual) return;
  descarregarLivre();
  void descarregar(true);
}

export function abrirEstudio(container: HTMLElement, roteiroId: string, aoFechar: () => void, opcoes: OpcoesEstudio = {}): void {
  const salvo = roteirosState.getCurrentState()?.roteiros.find((r) => r.id === roteiroId);
  if (!salvo) return;
  if (opcoes.aba) {
    prefs.direita = opcoes.aba;
    lembrarPrefs();
  }
  const titulo = document.createElement('input');
  titulo.type = 'text';
  titulo.className = 'rte-titulo';
  titulo.placeholder = 'Título do roteiro';
  titulo.setAttribute('aria-label', 'Título do roteiro');
  const col = (classe: string, rotulo: string): HTMLElement => {
    const el = document.createElement('section');
    el.className = `rte-col ${classe}`;
    el.setAttribute('aria-label', rotulo);
    return el;
  };
  atual = {
    container,
    r: structuredClone(salvo),
    aoFechar,
    timerSalvar: null,
    timerLeve: null,
    els: {
      salvo: Object.assign(document.createElement('span'), { className: 'rte-salvo' }),
      status: Object.assign(document.createElement('span'), { className: 'rte-status' }),
      acoesStatus: Object.assign(document.createElement('div'), { className: 'rte-acoes-status' }),
      linha: Object.assign(document.createElement('div'), { className: 'rte-linha-wrap' }),
      corpo: document.createElement('div'),
      esquerda: col('rte-esquerda', 'Estrutura, briefing e pesquisa'),
      centro: col('rte-centro', 'Escrita'),
      direita: col('rte-direita', 'Prévia, IA, revisão e verificação'),
      titulo,
    },
  };
  desligarAtalhos?.();
  desligarAtalhos = ligarAtalhos({ 'roteiros.salvar': salvarAgora });
  montar(atual);
}

async function trocarPara(roteiroId: string): Promise<void> {
  const e = atual;
  if (!e) return;
  if (assistenteOcupado(e.r.id)) {
    await openAvisoModal('O assistente está escrevendo', 'Espere terminar (ou clique em Parar) antes de abrir outro roteiro.');
    return;
  }
  descarregarLivre();
  await descarregar(true);
  const container = e.container;
  const aoFechar = e.aoFechar;
  fecharEstudio();
  abrirEstudio(container, roteiroId, aoFechar);
}

/** Salva o pendente e volta para a lista. */
async function sair(): Promise<void> {
  const e = atual;
  if (!e) return;
  if (assistenteOcupado(e.r.id)) {
    const ok = await openConfirmModal({ title: 'Sair do roteiro', message: 'O assistente ainda está escrevendo. Sair interrompe nas cenas que já ficaram prontas.', confirmText: 'Sair', danger: false });
    if (!ok) return;
  }
  descarregarLivre();
  await descarregar(true);
  fecharEstudio();
  e.aoFechar();
}

/** Fecha sem salvar o pendente (quem chama já salvou, ou está apagando). */
export function fecharEstudio(): void {
  if (!atual) return;
  if (atual.timerLeve) clearTimeout(atual.timerLeve);
  destruirArraste();
  desligarAtalhos?.();
  desligarAtalhos = null;
  atual = null;
}

/** O módulo vai sair da tela: salva o que estiver pendente. */
export async function descarregarEstudio(): Promise<void> {
  descarregarLivre();
  await descarregar(true);
}

/**
 * O arquivo mudou por uma ação que notifica (status, restaurar versão,
 * duplicar, adaptar). O pendente já foi salvo antes da ação: o rascunho é
 * recarregado do arquivo e o Estúdio redesenha.
 */
export function sincronizarEstudio(file: RoteirosFile): void {
  const e = atual;
  if (!e) return;
  const salvo = file.roteiros.find((r) => r.id === e.r.id);
  if (!salvo) {
    fecharEstudio();
    e.aoFechar();
    return;
  }
  if (e.timerSalvar) return;
  e.r = structuredClone(salvo);
  e.els.titulo.value = e.r.titulo;
  desenharStatus();
  desenharLinha();
  desenharEsquerda();
  desenharCentro();
  desenharDireita();
}
