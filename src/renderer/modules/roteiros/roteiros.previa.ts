import { contarPalavras, formatarTempo, tempoTotal } from '../../../shared/types/roteiros.conversao.js';
import type { Roteiro } from '../../../shared/types/roteiros.types.js';
import { renderMarkdown } from './roteiros.markdown.js';
import { rotuloFormato, tempoCena, tipoDe } from './roteiros.comum.js';

/**
 * A folha do roteiro, montada das cenas: cabeçalho, uma seção por cena (tempo,
 * tipo, o que se vê, o letreiro, a fala), observações e fontes. É o que se lê
 * antes de gravar.
 */
export function buildPrevia(r: Roteiro, aoClicarCena?: (cenaId: string) => void): HTMLElement {
  const folha = document.createElement('article');
  folha.className = 'rot-folha';
  const cab = document.createElement('header');
  cab.className = 'rot-folha-cab';
  const total = tempoTotal(r);
  cab.append(
    Object.assign(document.createElement('span'), {
      className: 'rot-folha-meta',
      textContent: ['Roteiro', rotuloFormato(r.formato), r.briefing.duracaoAlvoSeg ? `alvo ${formatarTempo(r.briefing.duracaoAlvoSeg)}` : ''].filter(Boolean).join(' · '),
    }),
    Object.assign(document.createElement('h2'), { textContent: r.titulo || 'Sem título' }),
  );
  folha.appendChild(cab);

  let inicio = 0;
  r.cenas.forEach((c, i) => {
    const t = tempoCena(r, c);
    const secao = document.createElement('section');
    secao.className = 'rot-folha-cena';
    secao.style.setProperty('--c', tipoDe(c.tipo).cor);
    const h = document.createElement('h3');
    h.className = 'rot-folha-cena-titulo';
    h.append(
      Object.assign(document.createElement('span'), { className: 'rot-md-tempo', textContent: `${formatarTempo(inicio)} – ${formatarTempo(inicio + t)}` }),
      Object.assign(document.createElement('span'), { className: 'rot-folha-tipo', textContent: tipoDe(c.tipo).rotulo }),
      `${i + 1}. ${c.titulo.trim() || tipoDe(c.tipo).rotulo}`,
    );
    if (aoClicarCena) {
      h.tabIndex = 0;
      h.title = 'Ir até a cena';
      h.addEventListener('click', () => aoClicarCena(c.id));
    }
    inicio += t;
    secao.appendChild(h);
    if (c.visual.trim()) secao.appendChild(Object.assign(document.createElement('p'), { className: 'rot-md-cena', textContent: c.visual.trim() }));
    if (c.textoTela.trim()) {
      const tela = document.createElement('p');
      tela.className = 'rot-folha-tela';
      tela.append(Object.assign(document.createElement('strong'), { textContent: 'Na tela: ' }), c.textoTela.trim());
      secao.appendChild(tela);
    }
    if (c.fala.trim()) secao.appendChild(renderMarkdown(c.fala));
    else secao.appendChild(Object.assign(document.createElement('p'), { className: 'rot-folha-vazio', textContent: 'Fala ainda em branco.' }));
    if (c.notas.trim()) secao.appendChild(Object.assign(document.createElement('p'), { className: 'rot-folha-nota', textContent: `Nota: ${c.notas.trim()}` }));
    folha.appendChild(secao);
  });
  if (!r.cenas.length) folha.appendChild(Object.assign(document.createElement('p'), { className: 'rot-folha-vazio', textContent: 'Nenhuma cena ainda.' }));

  if (r.observacoes.trim()) {
    const obs = document.createElement('section');
    obs.className = 'rot-folha-parte is-obs';
    obs.append(Object.assign(document.createElement('h3'), { textContent: 'Observações para a produção' }), renderMarkdown(r.observacoes));
    folha.appendChild(obs);
  }
  if (r.pesquisa.fontes.length) {
    const fontes = document.createElement('section');
    fontes.className = 'rot-folha-parte is-fontes';
    fontes.appendChild(Object.assign(document.createElement('h3'), { textContent: 'Fontes' }));
    const ul = document.createElement('ul');
    r.pesquisa.fontes.forEach((f) => ul.appendChild(Object.assign(document.createElement('li'), { textContent: [f.titulo, f.url].filter((x) => x.trim()).join(' — ') })));
    fontes.appendChild(ul);
    folha.appendChild(fontes);
  }

  const palavras = r.cenas.reduce((n, c) => n + contarPalavras(c.fala), 0);
  folha.appendChild(
    Object.assign(document.createElement('footer'), {
      className: 'rot-folha-rodape',
      textContent: palavras ? `${palavras} palavra${palavras === 1 ? '' : 's'} de fala · cerca de ${formatarTempo(total)}` : 'Sem fala ainda',
    }),
  );
  return folha;
}
