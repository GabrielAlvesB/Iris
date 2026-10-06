import type { ApontamentoRevisao, CriterioRevisao, RevisaoIaRoteiro } from '../../../shared/types/roteiros.types.js';
import { buildBotao, tempoRelativo } from '../../ui/pagina.js';
import { ICONES, contextoIa, lista, num, str, tipoDe, type CtxEstudio } from './roteiros.comum.js';
import { executarAcaoCena, pedir } from './roteiros.ia.js';

/**
 * Revisor crítico: a IA lê o roteiro inteiro e devolve nota por critério e
 * apontamentos concretos (cena, trecho, problema, sugestão). A última revisão
 * fica guardada no roteiro. "Pedir correção" manda o apontamento como
 * instrução para a cena — com prévia antes × depois, como toda ação da IA.
 */

function tomDaNota(nota: number): 'ok' | 'atencao' | 'erro' {
  return nota >= 7.5 ? 'ok' : nota >= 5 ? 'atencao' : 'erro';
}

function revisaoDoJson(json: unknown, ctx: CtxEstudio): RevisaoIaRoteiro {
  const o = (json ?? {}) as Record<string, unknown>;
  const criterios = lista(o.criterios, 'criterios')
    .map((v): CriterioRevisao | null => {
      const c = (v ?? {}) as Record<string, unknown>;
      const nome = str(c.nome);
      return nome ? { nome, nota: Math.min(10, Math.max(0, num(c.nota) ?? 0)), comentario: str(c.comentario) } : null;
    })
    .filter((c): c is CriterioRevisao => c !== null);
  const apontamentos = lista(o.apontamentos, 'apontamentos')
    .map((v): ApontamentoRevisao | null => {
      const a = (v ?? {}) as Record<string, unknown>;
      const problema = str(a.problema);
      if (!problema) return null;
      // A IA cita a cena pelo número (começando em 1).
      const n = num(a.cena);
      const cena = n !== undefined ? ctx.r.cenas[Math.round(n) - 1] : undefined;
      return { id: crypto.randomUUID(), ...(cena ? { cenaId: cena.id } : {}), trecho: str(a.trecho), problema, sugestao: str(a.sugestao) };
    })
    .filter((a): a is ApontamentoRevisao => a !== null);
  const media = criterios.length ? criterios.reduce((t, c) => t + c.nota, 0) / criterios.length : 0;
  return {
    em: new Date().toISOString(),
    notaGeral: Math.min(10, Math.max(0, num(o.notaGeral) ?? Math.round(media * 10) / 10)),
    resumo: str(o.resumo),
    criterios,
    apontamentos,
  };
}

function buildNota(valor: number, rotulo: string, grande = false): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `rte-rev-nota is-${tomDaNota(valor)}${grande ? ' is-grande' : ''}`;
  const numero = document.createElement('strong');
  numero.textContent = valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const barra = document.createElement('span');
  barra.className = 'rte-rev-barra';
  const preenchida = document.createElement('i');
  preenchida.style.width = `${valor * 10}%`;
  barra.appendChild(preenchida);
  wrap.append(Object.assign(document.createElement('span'), { className: 'rte-rev-rotulo', textContent: rotulo }), barra, numero);
  wrap.title = `${rotulo}: ${numero.textContent} de 10`;
  return wrap;
}

export function buildRevisor(ctx: CtxEstudio, redesenhar: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rte-rev';
  const rev = ctx.r.revisaoIa;

  const revisar = buildBotao(rev ? 'Revisar de novo' : 'Revisar o roteiro com IA', { icone: ICONES.lupa, variante: rev ? 'secundario' : 'primario' });
  revisar.addEventListener('click', () =>
    void (async () => {
      if (!ctx.r.cenas.some((c) => c.fala.trim())) {
        wrap.prepend(Object.assign(document.createElement('p'), { className: 'md-erro', textContent: 'Escreva as falas primeiro — o revisor lê o roteiro inteiro.' }));
        return;
      }
      const r = await pedir(revisar, 'roteiro-critica', contextoIa(ctx.r));
      if (!r?.json) return;
      ctx.r.revisaoIa = revisaoDoJson(r.json, ctx);
      ctx.digitou();
      redesenhar();
    })(),
  );

  if (!rev) {
    wrap.append(
      Object.assign(document.createElement('p'), {
        className: 'rte-as-intro',
        textContent: 'Um editor exigente lê o roteiro e dá nota para gancho, clareza, ritmo, duração, CTA e fontes, com apontamentos concretos e como corrigir cada um.',
      }),
      revisar,
    );
    return wrap;
  }

  const topo = document.createElement('div');
  topo.className = 'rte-rev-topo';
  topo.append(buildNota(rev.notaGeral, 'Nota geral', true), revisar);
  wrap.appendChild(topo);
  wrap.appendChild(Object.assign(document.createElement('p'), { className: 'rte-rev-quando', textContent: `Revisado ${tempoRelativo(rev.em)}. Editou depois? Revise de novo.` }));
  if (rev.resumo) wrap.appendChild(Object.assign(document.createElement('p'), { className: 'rte-rev-resumo', textContent: rev.resumo }));

  const criterios = document.createElement('div');
  criterios.className = 'rte-rev-criterios';
  rev.criterios.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'rte-rev-criterio';
    item.appendChild(buildNota(c.nota, c.nome));
    if (c.comentario) item.appendChild(Object.assign(document.createElement('p'), { textContent: c.comentario }));
    criterios.appendChild(item);
  });
  wrap.appendChild(criterios);

  if (rev.apontamentos.length) {
    wrap.appendChild(Object.assign(document.createElement('h4'), { className: 'rte-rev-h', textContent: `Apontamentos · ${rev.apontamentos.length}` }));
    rev.apontamentos.forEach((a) => {
      const cena = ctx.r.cenas.find((c) => c.id === a.cenaId);
      const cartao = document.createElement('article');
      cartao.className = 'rte-rev-ap';
      if (cena) cartao.style.setProperty('--c', tipoDe(cena.tipo).cor);
      if (cena) {
        const ir = document.createElement('button');
        ir.type = 'button';
        ir.className = 'rte-rev-cena';
        ir.textContent = `Cena ${ctx.r.cenas.indexOf(cena) + 1} · ${cena.titulo || tipoDe(cena.tipo).rotulo}`;
        ir.title = 'Ir até a cena';
        ir.addEventListener('click', () => ctx.irParaCena(cena.id));
        cartao.appendChild(ir);
      }
      if (a.trecho) cartao.appendChild(Object.assign(document.createElement('blockquote'), { textContent: a.trecho }));
      cartao.append(
        Object.assign(document.createElement('p'), { className: 'rte-rev-problema', textContent: a.problema }),
        ...(a.sugestao ? [Object.assign(document.createElement('p'), { className: 'rte-rev-sugestao', textContent: `Sugestão: ${a.sugestao}` })] : []),
      );
      const acoes = document.createElement('div');
      acoes.className = 'rte-rev-acoes';
      if (cena) {
        const corrigir = buildBotao('Pedir correção', { icone: ICONES.estrela, variante: 'secundario', titulo: 'A IA reescreve a fala da cena resolvendo este apontamento' });
        corrigir.classList.add('is-mini');
        corrigir.addEventListener('click', () =>
          void (async () => {
            const instrucao = `Reescreva a fala resolvendo este problema apontado na revisão: ${a.problema}${a.trecho ? ` (trecho: "${a.trecho}")` : ''}.${a.sugestao ? ` Sugestão do revisor: ${a.sugestao}` : ''} Mantenha o resto da fala.`;
            const aplicou = await executarAcaoCena(corrigir, ctx, cena, instrucao, 'fala', 'correção da revisão');
            if (aplicou) resolver(a);
          })(),
        );
        acoes.appendChild(corrigir);
      }
      const feito = buildBotao('Resolvido', { icone: ICONES.check, variante: 'fantasma', titulo: 'Tirar da lista' });
      feito.classList.add('is-mini');
      feito.addEventListener('click', () => resolver(a));
      acoes.appendChild(feito);
      cartao.appendChild(acoes);
      wrap.appendChild(cartao);
    });
  } else {
    wrap.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: 'Nenhum apontamento pendente.' }));
  }

  function resolver(a: ApontamentoRevisao): void {
    if (!ctx.r.revisaoIa) return;
    ctx.r.revisaoIa.apontamentos = ctx.r.revisaoIa.apontamentos.filter((x) => x.id !== a.id);
    ctx.digitou();
    redesenhar();
  }
  return wrap;
}
