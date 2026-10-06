import { formatarTempo } from '../../../shared/types/roteiros.conversao.js';
import type { Roteiro } from '../../../shared/types/roteiros.types.js';
import { tempoCena, tipoDe } from './roteiros.comum.js';

/**
 * Linha do tempo do roteiro: um segmento por cena, do tamanho do tempo de
 * fala estimado, na cor do tipo. A marca é a duração alvo do briefing; o que
 * passa dela fica hachurado. O total vai sempre escrito — a cor só reforça.
 */
export function buildLinhaTempo(r: Roteiro, aoClicar: (cenaId: string) => void, compacta = false): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `rte-linha${compacta ? ' is-compacta' : ''}`;
  const tempos = r.cenas.map((c) => tempoCena(r, c));
  const total = tempos.reduce((a, b) => a + b, 0);
  const alvo = r.briefing.duracaoAlvoSeg;
  // A escala cobre o maior entre o total e o alvo: assim a marca do alvo e o
  // excesso aparecem no mesmo trilho.
  const escala = Math.max(total, alvo ?? 0, 1);

  const trilho = document.createElement('div');
  trilho.className = 'rte-linha-trilho';
  trilho.setAttribute('role', 'list');
  trilho.setAttribute('aria-label', 'Linha do tempo das cenas');
  r.cenas.forEach((c, i) => {
    const t = tempos[i]!;
    const seg = document.createElement(compacta ? 'span' : 'button');
    if (seg instanceof HTMLButtonElement) {
      seg.type = 'button';
      seg.addEventListener('click', () => aoClicar(c.id));
    }
    seg.className = 'rte-linha-seg';
    seg.setAttribute('role', 'listitem');
    seg.style.setProperty('--c', tipoDe(c.tipo).cor);
    // Cena sem fala ainda ocupa um fiapo, para não sumir da linha.
    seg.style.width = `${Math.max((t / escala) * 100, 0.6)}%`;
    const nome = c.titulo.trim() || tipoDe(c.tipo).rotulo;
    seg.title = `${i + 1}. ${nome} — ${formatarTempo(t)}${c.duracaoAlvoSeg ? ` (alvo ${formatarTempo(c.duracaoAlvoSeg)})` : ''}`;
    seg.setAttribute('aria-label', seg.title);
    if (!compacta && t / escala > 0.07) seg.textContent = nome;
    trilho.appendChild(seg);
  });
  if (alvo && total > alvo) {
    const excesso = document.createElement('span');
    excesso.className = 'rte-linha-excesso';
    excesso.style.left = `${(alvo / escala) * 100}%`;
    excesso.style.width = `${((total - alvo) / escala) * 100}%`;
    excesso.title = `Passa ${formatarTempo(total - alvo)} do alvo`;
    trilho.appendChild(excesso);
  }
  if (alvo) {
    const marca = document.createElement('span');
    marca.className = 'rte-linha-alvo';
    marca.style.left = `${(alvo / escala) * 100}%`;
    marca.title = `Alvo: ${formatarTempo(alvo)}`;
    trilho.appendChild(marca);
  }
  wrap.appendChild(trilho);

  if (!compacta) {
    const resumo = document.createElement('div');
    resumo.className = 'rte-linha-resumo';
    const forte = document.createElement('strong');
    forte.textContent = formatarTempo(total);
    resumo.appendChild(forte);
    if (alvo) {
      resumo.append(` de ${formatarTempo(alvo)}`);
      const situacao = document.createElement('span');
      const diferenca = total - alvo;
      // Até 10% para cima ou para baixo do alvo é "no ponto".
      const folga = alvo * 0.1;
      situacao.className = `rte-linha-situacao ${diferenca > folga ? 'is-acima' : diferenca < -folga ? 'is-abaixo' : 'is-ok'}`;
      situacao.textContent =
        diferenca > folga ? `passa ${formatarTempo(diferenca)}` : diferenca < -folga ? `faltam ${formatarTempo(-diferenca)}` : 'no ponto';
      resumo.appendChild(situacao);
    } else {
      resumo.append(' de fala');
      resumo.appendChild(Object.assign(document.createElement('span'), { className: 'rte-linha-situacao', textContent: 'sem duração alvo' }));
    }
    wrap.appendChild(resumo);
  }
  return wrap;
}
