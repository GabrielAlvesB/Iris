import type { ContextoTexto, RespostaTexto, TarefaTexto } from '../../../shared/types/ia.types.js';
import { cenasDoMarkdown, formatarTempo, markdownDasCenas } from '../../../shared/types/roteiros.conversao.js';
import { isTipoCena, type CenaRoteiro, type FormatoRoteiro } from '../../../shared/types/roteiros.types.js';
import { gerarTextoIa } from '../../core/ia.js';
import { abrirMenuIa, abrirVariantes, buildBotaoIa, comGeracao, confirmarTextoGerado, exigirIa, type EscolhaTexto } from '../../ui/ia.js';
import { openAvisoModal } from '../../ui/modal.js';
import { buildBotao } from '../../ui/pagina.js';
import { renderMarkdown } from './roteiros.markdown.js';
import { ICONES, contextoIa, lista, novaCena, num, str, tipoDe, type CtxEstudio } from './roteiros.comum.js';
import * as roteirosState from './roteiros.state.js';

/**
 * IA no Estúdio de roteiro. Toda resposta passa por uma prévia (antes ×
 * depois) e só entra quando o usuário aceita — e antes de entrar, as cenas
 * atuais viram uma versão ("Antes da IA: …"), então nada se perde.
 */

export async function pedir(botao: HTMLButtonElement, tarefa: TarefaTexto, contexto: ContextoTexto, ia?: EscolhaTexto): Promise<RespostaTexto | undefined> {
  if (!(await exigirIa('texto'))) return undefined;
  return comGeracao(botao, (escolha) => gerarTextoIa({ tarefa, contexto, ...escolha }), ia);
}

/** Cena vinda do JSON da IA, conferida campo a campo. */
export function cenaDoJson(v: unknown): CenaRoteiro | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const tipo = isTipoCena(o.tipo) ? o.tipo : 'secao';
  const titulo = str(o.titulo) || tipoDe(tipo).rotulo;
  const duracao = num(o.duracaoSeg);
  const cena: CenaRoteiro = {
    ...novaCena(tipo, titulo),
    fala: str(o.fala),
    visual: str(o.visual),
    textoTela: str(o.textoTela),
    notas: str(o.objetivo) ? `Objetivo: ${str(o.objetivo)}` : '',
    ...(duracao && duracao > 0 ? { duracaoAlvoSeg: Math.round(duracao) } : {}),
  };
  return cena.titulo || cena.fala ? cena : null;
}

/** Antes × depois, lado a lado, para conferir uma mudança da IA. */
function previaAntesDepois(antes: string, depois: string): (alvo: HTMLElement) => void {
  return (alvo) => {
    alvo.classList.add('rte-ia-comparar');
    const lado = (rotulo: string, texto: string, classe: string): HTMLElement => {
      const col = document.createElement('div');
      col.className = `rte-ia-lado ${classe}`;
      col.appendChild(Object.assign(document.createElement('span'), { className: 'rte-ia-lado-rotulo', textContent: rotulo }));
      col.appendChild(texto.trim() ? renderMarkdown(texto) : Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: '(vazio)' }));
      return col;
    };
    alvo.append(lado('Antes', antes, 'is-antes'), lado('Depois', depois, 'is-depois'));
  };
}

// ---------- Ações de uma cena (o ✨ do cartão) ----------

interface AcaoCena {
  rotulo: string;
  dica: string;
  /** Instrução para a IA (roteiro-acao-cena). */
  instrucao: string;
  campo: 'fala' | 'visual' | 'textoTela';
}

const ACOES_CENA: AcaoCena[] = [
  { rotulo: 'Reescrever', dica: 'Mais claro e mais falado, mesmo conteúdo', instrucao: 'Reescreva a fala para ficar mais clara, natural e envolvente quando dita em voz alta, com o mesmo conteúdo e tamanho parecido.', campo: 'fala' },
  { rotulo: 'Encurtar', dica: 'Mesma ideia em bem menos palavras', instrucao: 'Encurte a fala para cerca de metade das palavras, mantendo a ideia principal e os fatos.', campo: 'fala' },
  { rotulo: 'Expandir', dica: 'Mais desenvolvimento, exemplos do material', instrucao: 'Desenvolva a fala com mais detalhe e um exemplo concreto tirado do material, sem inventar dados.', campo: 'fala' },
  { rotulo: 'Mais emoção', dica: 'Mais energia, tensão ou curiosidade', instrucao: 'Reescreva a fala com mais energia e emoção (curiosidade, tensão, entusiasmo), sem exagerar nem inventar.', campo: 'fala' },
  { rotulo: 'Mais simples', dica: 'Para qualquer pessoa entender', instrucao: 'Reescreva a fala em linguagem simples, sem jargão, como se explicasse para alguém leigo.', campo: 'fala' },
  { rotulo: 'Sugerir visual / B-roll', dica: 'O que mostrar enquanto a fala acontece', instrucao: 'Sugira o visual desta cena: o que aparece na tela, enquadramento e B-roll, em 1 a 3 linhas curtas, coerentes com a fala.', campo: 'visual' },
  { rotulo: 'Sugerir texto na tela', dica: 'Um letreiro curto que reforça a fala', instrucao: 'Sugira um texto curto para aparecer na tela nesta cena (até 8 palavras), que reforce a ideia principal da fala.', campo: 'textoTela' },
];

function rotuloCampo(campo: AcaoCena['campo']): string {
  return campo === 'fala' ? 'Fala' : campo === 'visual' ? 'Visual' : 'Texto na tela';
}

/** Contexto de uma cena: o roteiro inteiro e, em destaque, a cena e as vizinhas. */
function contextoDaCena(ctx: CtxEstudio, cena: CenaRoteiro, extra: Partial<ContextoTexto> = {}): ContextoTexto {
  const i = ctx.r.cenas.indexOf(cena);
  const descricao = `Cena ${i + 1} de ${ctx.r.cenas.length} — ${tipoDe(cena.tipo).rotulo}: ${cena.titulo}${cena.duracaoAlvoSeg ? ` (alvo ${formatarTempo(cena.duracaoAlvoSeg)})` : ''}`;
  return contextoIa(ctx.r, { campo: descricao, ...extra });
}

async function aplicarNaCena(ctx: CtxEstudio, cena: CenaRoteiro, campo: AcaoCena['campo'], novo: string, rotulo: string, inicio?: number, fim?: number): Promise<void> {
  await ctx.versaoAntes(`Antes da IA: ${rotulo} (${cena.titulo || tipoDe(cena.tipo).rotulo})`);
  if (inicio !== undefined && fim !== undefined) cena[campo] = `${cena[campo].slice(0, inicio)}${novo}${cena[campo].slice(fim)}`;
  else cena[campo] = novo;
  ctx.mudouEstrutura();
}

export async function executarAcaoCena(
  botao: HTMLButtonElement,
  ctx: CtxEstudio,
  cena: CenaRoteiro,
  instrucao: string,
  campo: AcaoCena['campo'],
  rotulo: string,
  ia?: EscolhaTexto,
): Promise<boolean> {
  const atual = cena[campo];
  if (campo === 'fala' && !cena.fala.trim()) {
    await openAvisoModal('Fala vazia', 'Escreva a fala primeiro, ou use "Escrever esta cena".');
    return false;
  }
  const texto = campo === 'fala' ? cena.fala : `Fala da cena:\n${cena.fala}`;
  const r = await pedir(botao, 'roteiro-acao-cena', contextoDaCena(ctx, cena, { orientacao: instrucao, texto }), ia);
  if (!r?.texto) return false;
  const escolha = await confirmarTextoGerado(`${rotulo} — ${rotuloCampo(campo)}`, `Gerado por ${r.modelo}. A versão de antes fica guardada.`, previaAntesDepois(atual, r.texto), [
    { id: 'usar', rotulo: 'Aplicar', primario: true },
  ]);
  if (escolha !== 'usar') return false;
  await aplicarNaCena(ctx, cena, campo, r.texto, rotulo);
  return true;
}

/** Escreve a cena inteira (fala, visual, texto na tela) a partir do título/objetivo. */
export async function escreverCena(botao: HTMLButtonElement, ctx: CtxEstudio, cena: CenaRoteiro, ia?: EscolhaTexto): Promise<void> {
  const orientacao = [`${tipoDe(cena.tipo).rotulo}: ${cena.titulo}`, cena.duracaoAlvoSeg ? `Duração: ${formatarTempo(cena.duracaoAlvoSeg)}` : '', cena.notas]
    .filter(Boolean)
    .join('\n');
  const r = await pedir(botao, 'roteiro-cena', contextoDaCena(ctx, cena, { orientacao, duracao: cena.duracaoAlvoSeg ? formatarTempo(cena.duracaoAlvoSeg) : undefined }), ia);
  const o = (r?.json ?? {}) as Record<string, unknown>;
  const fala = str(o.fala);
  if (!r || !fala) return;
  const depois = [str(o.visual) && `[Cena: ${str(o.visual)}]`, str(o.textoTela) && `[Texto na tela: ${str(o.textoTela)}]`, fala].filter(Boolean).join('\n\n');
  const antes = [cena.visual && `[Cena: ${cena.visual}]`, cena.textoTela && `[Texto na tela: ${cena.textoTela}]`, cena.fala].filter(Boolean).join('\n\n');
  const escolha = await confirmarTextoGerado(`Escrever: ${cena.titulo}`, `Gerado por ${r.modelo}. A versão de antes fica guardada.`, previaAntesDepois(antes, depois), [
    { id: 'usar', rotulo: 'Usar na cena', primario: true },
  ]);
  if (escolha !== 'usar') return;
  await ctx.versaoAntes(`Antes da IA: escrever ${cena.titulo}`);
  cena.fala = fala;
  if (str(o.visual)) cena.visual = str(o.visual);
  if (str(o.textoTela)) cena.textoTela = str(o.textoTela);
  ctx.mudouEstrutura();
}

/** 3 variações da fala (ou do trecho selecionado). */
async function variacoes(botao: HTMLButtonElement, ctx: CtxEstudio, cena: CenaRoteiro, sel: { ini: number; fim: number }, ia?: EscolhaTexto): Promise<void> {
  const trecho = sel.fim > sel.ini ? cena.fala.slice(sel.ini, sel.fim) : cena.fala;
  if (!trecho.trim()) {
    await openAvisoModal('Fala vazia', 'Escreva a fala (ou selecione um trecho) primeiro.');
    return;
  }
  const r = await pedir(botao, 'roteiro-variacoes', contextoDaCena(ctx, cena, { texto: trecho, campo: `${tipoDe(cena.tipo).rotulo}: ${cena.titulo}` }), ia);
  if (!r?.variantes?.length) return;
  abrirVariantes({
    titulo: `Variações — ${cena.titulo || tipoDe(cena.tipo).rotulo}`,
    subtitulo: `Gerado por ${r.modelo}. Usar troca ${sel.fim > sel.ini ? 'o trecho selecionado' : 'a fala'}; a de antes fica nas versões.`,
    variantes: r.variantes,
    linhas: (v) => [[v.titulo ?? 'Opção', v.texto]],
    copiar: (v) => v.texto ?? '',
    aoUsar: (v) => {
      if (!v.texto) return;
      if (sel.fim > sel.ini) void aplicarNaCena(ctx, cena, 'fala', v.texto, 'variação', sel.ini, sel.fim);
      else void aplicarNaCena(ctx, cena, 'fala', v.texto, 'variação');
    },
  });
}

/**
 * O ✨ de cada cartão. A seleção dentro da fala é lida no mousedown (antes de
 * o foco sair do campo): "Melhorar o trecho" age só nela.
 */
export function buildBotaoIaCena(ctx: CtxEstudio, cena: CenaRoteiro, fala: HTMLTextAreaElement): HTMLButtonElement {
  const botao = buildBotaoIa('IA', 'Escrever, reescrever, encurtar, variações, visual e texto na tela desta cena');
  botao.classList.add('rte-ia-cena');
  let sel = { ini: 0, fim: 0 };
  botao.addEventListener('mousedown', (e) => {
    e.preventDefault();
    sel = document.activeElement === fala ? { ini: fala.selectionStart, fim: fala.selectionEnd } : { ini: 0, fim: 0 };
  });
  botao.addEventListener('click', () => {
    const temSelecao = sel.fim > sel.ini;
    const itens = [
      ...(temSelecao
        ? [
            {
              rotulo: 'Melhorar o trecho selecionado',
              dica: 'Reescreve só o que está marcado na fala',
              fazer: (ia: EscolhaTexto) =>
                void (async () => {
                  const trecho = cena.fala.slice(sel.ini, sel.fim);
                  const r = await pedir(botao, 'roteiro-acao-cena', contextoDaCena(ctx, cena, { orientacao: 'Reescreva o trecho para ficar mais claro e falado, com o mesmo sentido e tamanho parecido.', texto: trecho }), ia);
                  if (!r?.texto) return;
                  const ok = await confirmarTextoGerado('Trecho melhorado', `Gerado por ${r.modelo}`, previaAntesDepois(trecho, r.texto), [{ id: 'usar', rotulo: 'Aplicar', primario: true }]);
                  if (ok === 'usar') await aplicarNaCena(ctx, cena, 'fala', r.texto, 'trecho', sel.ini, sel.fim);
                })(),
            },
          ]
        : []),
      {
        rotulo: cena.fala.trim() ? 'Reescrever a cena inteira' : 'Escrever esta cena',
        dica: 'Fala, visual e texto na tela a partir do título e do roteiro',
        fazer: (ia: EscolhaTexto) => void escreverCena(botao, ctx, cena, ia),
      },
      ...ACOES_CENA.map((a) => ({ rotulo: a.rotulo, dica: a.dica, fazer: (ia: EscolhaTexto) => void executarAcaoCena(botao, ctx, cena, a.instrucao, a.campo, a.rotulo, ia) })),
      { rotulo: '3 variações', dica: temSelecao ? 'Do trecho selecionado' : 'Da fala, com estratégias diferentes', fazer: (ia: EscolhaTexto) => void variacoes(botao, ctx, cena, sel, ia) },
    ];
    abrirMenuIa(botao, itens, { escolherIa: true, titulo: cena.titulo || tipoDe(cena.tipo).rotulo });
  });
  return botao;
}

// ---------- Ações do roteiro inteiro (aba IA) ----------

/** Rascunho de uma vez (tarefa antiga, em markdown), lido para cenas. */
export async function rascunhoRapido(botao: HTMLButtonElement, ctx: CtxEstudio): Promise<void> {
  const r = await pedir(botao, 'roteiro-rascunho', contextoIa(ctx.r, {}, false));
  if (!r?.texto) return;
  const leitura = cenasDoMarkdown(r.texto, () => crypto.randomUUID());
  if (!leitura.cenas.length) {
    await openAvisoModal('Rascunho vazio', 'A IA não devolveu cenas. Tente de novo.');
    return;
  }
  const temConteudo = ctx.r.cenas.some((c) => c.fala.trim());
  const escolha = await confirmarTextoGerado(
    'Rascunho do roteiro',
    `Gerado por ${r.modelo} · ${leitura.cenas.length} cenas. ${temConteudo ? 'As cenas atuais ficam guardadas numa versão.' : ''}`,
    (alvo) => alvo.appendChild(renderMarkdown(r.texto!)),
    temConteudo
      ? [
          { id: 'fim', rotulo: 'Acrescentar no fim' },
          { id: 'trocar', rotulo: 'Substituir as cenas', primario: true },
        ]
      : [{ id: 'trocar', rotulo: 'Usar este rascunho', primario: true }],
  );
  if (!escolha) return;
  await ctx.versaoAntes('Antes da IA: rascunho');
  ctx.r.cenas = escolha === 'fim' ? [...ctx.r.cenas, ...leitura.cenas] : leitura.cenas;
  leitura.fontes.forEach((f) => ctx.r.pesquisa.fontes.push(f));
  ctx.mudouEstrutura();
}

/** Revisão de português e ritmo do roteiro inteiro, devolvida em markdown e lida de volta. */
export async function revisarPortugues(botao: HTMLButtonElement, ctx: CtxEstudio): Promise<void> {
  if (!ctx.r.cenas.some((c) => c.fala.trim())) {
    await openAvisoModal('Nada para revisar', 'Escreva ou gere as falas primeiro.');
    return;
  }
  const antes = markdownDasCenas({ titulo: ctx.r.titulo, cenas: ctx.r.cenas }, false);
  const r = await pedir(botao, 'roteiro-revisar', contextoIa(ctx.r, { texto: antes }, false));
  if (!r?.texto) return;
  const escolha = await confirmarTextoGerado('Roteiro revisado', `Gerado por ${r.modelo}. As cenas atuais ficam guardadas numa versão.`, previaAntesDepois(antes, r.texto), [
    { id: 'usar', rotulo: 'Aplicar revisão', primario: true },
  ]);
  if (escolha !== 'usar') return;
  await ctx.versaoAntes('Antes da IA: revisão de português');
  ctx.r.cenas = cenasDoMarkdown(r.texto, () => crypto.randomUUID(), ctx.r.cenas).cenas;
  ctx.mudouEstrutura();
}

/** Gancho e CTA: 3 pares; usar preenche (ou cria) as cenas de gancho e de CTA. */
export async function ganchoECta(botao: HTMLButtonElement, ctx: CtxEstudio): Promise<void> {
  const r = await pedir(botao, 'roteiro-gancho-cta', contextoIa(ctx.r, { texto: markdownDasCenas({ titulo: ctx.r.titulo, cenas: ctx.r.cenas }, false) }));
  if (!r?.variantes?.length) return;
  abrirVariantes({
    titulo: 'Gancho e CTA',
    subtitulo: `Gerado por ${r.modelo}. Usar preenche as cenas de Gancho e de CTA (cria se não existirem).`,
    variantes: r.variantes,
    linhas: (v) => [
      ['Gancho', v.gancho],
      ['CTA', v.cta],
    ],
    copiar: (v) => [v.gancho, v.cta].filter(Boolean).join('\n'),
    aoUsar: (v) =>
      void (async () => {
        await ctx.versaoAntes('Antes da IA: gancho e CTA');
        if (v.gancho) {
          let gancho = ctx.r.cenas.find((c) => c.tipo === 'gancho');
          if (!gancho) {
            gancho = novaCena('gancho');
            ctx.r.cenas.unshift(gancho);
          }
          gancho.fala = v.gancho;
        }
        if (v.cta) {
          let cta = ctx.r.cenas.find((c) => c.tipo === 'cta');
          if (!cta) {
            cta = novaCena('cta');
            ctx.r.cenas.push(cta);
          }
          cta.fala = v.cta;
        }
        ctx.mudouEstrutura();
      })(),
  });
}

// ---------- Adaptar formato ----------

export const DESTINOS_ADAPTACAO: Array<{ id: string; rotulo: string; formato: FormatoRoteiro; pedido: string; duracaoSeg?: number }> = [
  { id: 'reels', rotulo: 'Reels / Shorts de 60 s', formato: 'reels', duracaoSeg: 60, pedido: 'vídeo vertical curto de até 60 segundos (Reels/Shorts/TikTok): gancho em 2 segundos, uma ideia só, cortes rápidos, CTA curto' },
  { id: 'youtube', rotulo: 'YouTube longo (8–10 min)', formato: 'youtube', duracaoSeg: 600, pedido: 'vídeo de YouTube de 8 a 10 minutos: gancho, promessa, seções desenvolvidas com exemplos, CTA no meio e no fim' },
  { id: 'carrossel', rotulo: 'Carrossel (8 slides)', formato: 'carrossel', pedido: 'carrossel de Instagram com 8 slides: cada cena é um slide; a "fala" é o texto do slide (curto), o "textoTela" é o título do slide e o "visual" descreve a arte' },
  { id: 'legenda', rotulo: 'Legenda / thread', formato: 'outro', pedido: 'thread/legenda para redes sociais: cada cena é um parágrafo ou post da thread, com gancho no primeiro e CTA no último' },
  { id: 'live', rotulo: 'Roteiro de live / aula', formato: 'live', duracaoSeg: 1800, pedido: 'roteiro de live ou aula de 30 minutos: abertura, blocos de conteúdo com momentos de interação com o público, encerramento' },
];

export function buildAdaptar(ctx: CtxEstudio): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rte-adaptar';
  const grade = document.createElement('div');
  grade.className = 'rte-adaptar-grade';
  DESTINOS_ADAPTACAO.forEach((d) => {
    const b = buildBotao(d.rotulo, { icone: ICONES.adaptar, variante: 'secundario', titulo: `Criar um roteiro novo: ${d.pedido}` });
    b.addEventListener('click', () => void adaptar(b, ctx, d));
    grade.appendChild(b);
  });
  wrap.append(
    Object.assign(document.createElement('p'), {
      className: 'md-dica',
      textContent: 'Cria um roteiro NOVO no formato escolhido, com as mesmas tags, briefing e fontes. Este roteiro não muda.',
    }),
    grade,
  );
  return wrap;
}

async function adaptar(botao: HTMLButtonElement, ctx: CtxEstudio, destino: (typeof DESTINOS_ADAPTACAO)[number]): Promise<void> {
  if (!ctx.r.cenas.some((c) => c.fala.trim())) {
    await openAvisoModal('Nada para adaptar', 'Escreva o roteiro primeiro.');
    return;
  }
  const r = await pedir(botao, 'roteiro-adaptar', contextoIa(ctx.r, { orientacao: destino.pedido }));
  if (!r?.json) return;
  const cenas = lista(r.json, 'cenas').map(cenaDoJson).filter((c): c is CenaRoteiro => c !== null);
  if (!cenas.length) {
    await openAvisoModal('Sem cenas', 'A IA não devolveu cenas para a adaptação. Tente de novo.');
    return;
  }
  const titulo = str((r.json as Record<string, unknown>).titulo) || `${ctx.r.titulo} — ${destino.rotulo}`;
  const escolha = await confirmarTextoGerado(
    `Adaptação: ${destino.rotulo}`,
    `Gerado por ${r.modelo} · ${cenas.length} cenas. Vira um roteiro novo — este não muda.`,
    (alvo) => alvo.appendChild(renderMarkdown(markdownDasCenas({ titulo, cenas }))),
    [{ id: 'criar', rotulo: 'Criar roteiro adaptado', primario: true }],
  );
  if (escolha !== 'criar') return;
  try {
    const id = await roteirosState.criarAdaptacao({
      roteiroId: ctx.r.id,
      formato: destino.formato,
      titulo,
      cenas,
      duracaoAlvoSeg: destino.duracaoSeg,
    });
    ctx.abrirRoteiro(id);
  } catch (e) {
    ctx.falhou(e);
  }
}
