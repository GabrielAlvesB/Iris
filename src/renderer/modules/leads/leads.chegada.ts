import type { Pessoa } from '../../../shared/types/contatos.types.js';
import { formatarDuracao, leadsDoArquivo, minutosDe } from '../../../shared/types/leads.estatisticas.js';
import { abrirApiLeads } from '../../core/navegacao.js';
import type { CtxContatos } from '../contatos/contatos.casco.js';
import { ICONES_CONTATO, agoraLocal, buildIcone, buildSeloFaixa, el, quandoFoi } from '../contatos/contatos.ui.js';

/**
 * O cartão "Como chegou" da ficha de um lead: quando e por onde chegou, as
 * UTMs, a pontuação com os motivos e quanto levou até o primeiro contato.
 * Mora com os leads, mas é desenhado pela ficha (contatos.ficha.ts), que é a
 * mesma em Contatos e em Leads.
 */

function linha(rotulo: string, valor: string | HTMLElement): HTMLElement {
  const l = el('div', 'ld-chegou-linha');
  l.appendChild(el('span', 'ld-chegou-rotulo', rotulo));
  if (typeof valor === 'string') l.appendChild(el('span', 'ld-chegou-valor', valor));
  else {
    valor.classList.add('ld-chegou-valor');
    l.appendChild(valor);
  }
  return l;
}

function dataHoraPorExtenso(local: string): string {
  const [a, m, d] = local.slice(0, 10).split('-');
  return `${d}/${m}/${a} às ${local.slice(11, 16)}`;
}

export function buildComoChegou(ctx: CtxContatos, p: Pessoa): HTMLElement | null {
  const e = p.entrada;
  if (!e) return null;
  const card = el('section', 'ct-card ld-chegou');
  const cab = el('div', 'ct-card-cab');
  cab.appendChild(buildIcone(ICONES_CONTATO.caixa, 'ct-card-icone', 15));
  cab.appendChild(el('h3', undefined, 'Como chegou'));
  card.appendChild(cab);

  const topo = el('div', 'ld-chegou-topo');
  topo.appendChild(buildSeloFaixa(e.faixa, e.pontos));
  topo.appendChild(el('span', 'ld-chegou-quando', `${dataHoraPorExtenso(e.recebidoEm)} (${quandoFoi(e.recebidoEm.slice(0, 10))})`));
  card.appendChild(topo);

  const info = leadsDoArquivo({ pessoas: [p], interacoes: ctx.file.interacoes, etapas: ctx.file.etapas })[0];
  const linhas = el('div', 'ld-chegou-linhas');
  linhas.appendChild(linha('Pelo', e.canal === 'nuvem' ? 'Caixa na nuvem' : 'Servidor local'));
  if (e.formulario) linhas.appendChild(linha('Formulário', e.formulario));
  if (e.pagina) {
    if (/^https?:\/\//i.test(e.pagina)) {
      const a = el('button', 'ct-link ld-chegou-link', e.pagina.replace(/^https?:\/\//i, ''));
      a.type = 'button';
      a.title = e.pagina;
      a.addEventListener('click', () => window.irisAPI.system.openExternalLink(e.pagina));
      linhas.appendChild(linha('Página', a));
    } else linhas.appendChild(linha('Página', e.pagina));
  }
  const utm: Array<[string, string]> = [
    ['Fonte', e.utm.source],
    ['Meio', e.utm.medium],
    ['Campanha', e.utm.campaign],
    ['Termo', e.utm.term],
    ['Anúncio', e.utm.content],
  ];
  utm.filter(([, v]) => v).forEach(([r, v]) => linhas.appendChild(linha(r, v)));
  if (e.interesse) linhas.appendChild(linha('Interesse', e.interesse));
  if (e.retornos > 0) linhas.appendChild(linha('Voltou', `${e.retornos === 1 ? '1 vez' : `${e.retornos} vezes`}${e.ultimoEnvioEm ? `, a última em ${dataHoraPorExtenso(e.ultimoEnvioEm)}` : ''}`));
  if (info?.minutosAtePrimeiro !== undefined) {
    linhas.appendChild(linha('1º contato', `${formatarDuracao(info.minutosAtePrimeiro)} depois da chegada`));
  } else if (info && info.etapaTipo === 'aberta') {
    const espera = minutosDe(agoraLocal()) - minutosDe(e.recebidoEm);
    const span = el('span', espera > 1440 ? 'is-alerta' : '', `Nenhuma conversa registrada (há ${formatarDuracao(espera)})`);
    linhas.appendChild(linha('1º contato', span));
  }
  card.appendChild(linhas);

  const motivos = el('div', 'ld-chegou-motivos');
  motivos.appendChild(el('span', 'ld-chegou-subtitulo', 'Por que essa pontuação'));
  if (e.motivos.length) {
    const ul = el('ul');
    e.motivos.forEach((m) => ul.appendChild(el('li', undefined, m)));
    motivos.appendChild(ul);
  } else motivos.appendChild(el('p', 'ct-nada', 'Nenhum critério da pontuação foi cumprido.'));
  const ajustar = el('button', 'ct-link', 'Ajustar a pontuação');
  ajustar.type = 'button';
  ajustar.addEventListener('click', () => abrirApiLeads('pontuacao'));
  motivos.appendChild(ajustar);
  card.appendChild(motivos);

  if (e.extras.length) {
    const extras = el('details', 'ld-chegou-extras');
    extras.appendChild(el('summary', undefined, `Informações extras do formulário (${e.extras.length})`));
    e.extras.forEach((x) => extras.appendChild(linha(x.nome, x.valor)));
    card.appendChild(extras);
  }
  return card;
}
