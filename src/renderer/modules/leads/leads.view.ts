import { abrirApiLeads, consumirLeadPendente, onLeadSolicitado } from '../../core/navegacao.js';
import { buildBotao, buildBusca, buildCabecalho, buildSegmentado, buildVazio } from '../../ui/pagina.js';
import { criarCasco, type CtxContatos } from '../contatos/contatos.casco.js';
import * as contatosState from '../contatos/contatos.state.js';
import { ICONES_CONTATO, el } from '../contatos/contatos.ui.js';
import { buildCaixaDeLeads, filtrarCaixa } from './leads.caixa.js';
import { buildPainel } from './leads.painel.js';

/**
 * Leads — quem chegou pelo formulário do site (API de leads). Duas visões, como
 * Postagens tem pipeline e métricas: a caixa de entrada e o Painel. Abrir um
 * lead abre a ficha aqui mesmo (a casca de Contatos), e "Voltar" volta a Leads.
 * Os dados são os de contatos.json: o lead é uma pessoa do CRM desde a chegada.
 */

type Visao = 'caixa' | 'painel';

const CHAVE_VISAO = 'iris.leads.visao';

// localStorage é só conveniência: se falhar, abre na caixa de entrada.
function lerVisao(): Visao {
  try {
    return localStorage.getItem(CHAVE_VISAO) === 'painel' ? 'painel' : 'caixa';
  } catch {
    return 'caixa';
  }
}

function gravarVisao(v: Visao): void {
  try {
    localStorage.setItem(CHAVE_VISAO, v);
  } catch {
    // Sem armazenamento, a escolha dura a sessão.
  }
}

let visao: Visao = lerVisao();
let busca = '';

const casco = criarCasco({
  rotuloVoltar: 'Leads',
  desenharTela: (ctx) => buildTela(ctx),
  // Clique na notificação do Windows.
  consumirPedido: consumirLeadPendente,
  onPedido: onLeadSolicitado,
});

export const montar = casco.montar;
export const destroy = casco.destroy;

function trocarVisao(v: Visao): void {
  visao = v;
  gravarVisao(v);
  casco.redesenhar(true);
}

function buildTela(ctx: CtxContatos): HTMLElement {
  const view = el('div', 'pg-view ld-view');
  const leads = ctx.file.pessoas.filter((p) => p.entrada && !p.arquivado);
  const naoVistos = leads.filter((p) => !p.entrada!.visto).length;

  const acoes: HTMLElement[] = [];
  if (naoVistos) {
    const vistos = buildBotao(`Marcar ${naoVistos === 1 ? 'o novo' : `os ${naoVistos} novos`} como vistos`, { variante: 'secundario', icone: ICONES_CONTATO.olho });
    vistos.addEventListener('click', () => void contatosState.marcarVisto('todos').catch(ctx.falhou));
    acoes.push(vistos);
  }
  const api = buildBotao('API e n8n', { variante: 'secundario', icone: ICONES_CONTATO.api, titulo: 'Conectar o formulário do site e o n8n' });
  api.addEventListener('click', () => abrirApiLeads());
  acoes.push(api);
  view.appendChild(
    buildCabecalho({
      icone: ICONES_CONTATO.caixa,
      titulo: 'Leads',
      subtitulo: 'Quem chegou pelo formulário do site — quando, de onde e quanto vale a pena',
      acoes,
    }),
  );

  if (!leads.length) {
    const ir = buildBotao('Conectar o formulário', { icone: ICONES_CONTATO.api, variante: 'primario' });
    ir.addEventListener('click', () => abrirApiLeads());
    const corpo = el('div', 'pg-rolagem ld-corpo');
    corpo.appendChild(
      buildVazio(
        ICONES_CONTATO.caixa,
        'Nenhum lead ainda',
        'Quando alguém preencher o formulário do seu site (ou um fluxo do n8n enviar), a pessoa aparece aqui na hora — com o horário em que chegou, de onde veio e uma pontuação de quanto vale a pena. Em "API e n8n" está o passo a passo para conectar.',
        ir,
      ),
    );
    view.appendChild(corpo);
    return view;
  }

  const barra = el('div', 'ld-barra');
  const seletor = buildSegmentado<Visao>(
    [
      { value: 'caixa', label: `Caixa de entrada${naoVistos ? ` · ${naoVistos} ${naoVistos === 1 ? 'novo' : 'novos'}` : ''}` },
      { value: 'painel', label: 'Painel' },
    ],
    visao,
    trocarVisao,
  );
  barra.appendChild(seletor);
  if (visao === 'caixa') {
    const caixa = buildBusca(busca, 'Nome, e-mail, telefone, origem…', (v) => {
      busca = v;
      casco.redesenhar();
    });
    caixa.classList.add('ld-busca');
    barra.appendChild(caixa);
  }
  view.appendChild(barra);

  const corpo = el('div', 'pg-rolagem ld-corpo');
  corpo.dataset.rolagem = `leads-${visao}`;
  if (visao === 'caixa') corpo.appendChild(buildCaixaDeLeads(ctx, busca));
  else
    corpo.appendChild(
      buildPainel(ctx, () => {
        filtrarCaixa('semResposta');
        trocarVisao('caixa');
      }),
    );
  view.appendChild(corpo);
  return view;
}
