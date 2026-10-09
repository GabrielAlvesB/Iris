import { CRITERIOS_PONTUACAO, regrasPadrao, type CriterioId, type RegrasPontuacao } from '../../../shared/types/leads.types.js';
import { somaMaxima } from '../../../shared/types/leads.pontuacao.js';
import { interruptor } from '../../ui/campos.js';
import { buildBotao } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { ICONES_CONTATO, el } from '../contatos/contatos.ui.js';
import { campoLinha, cartao, salvarConfig, status, type CtxApi } from './api-leads.pecas.js';
import { DO_SISTEMA, NO_LINUX } from '../../ui/plataforma.js';

/** Pontuação (pesos, faixas, páginas valiosas) e avisos quando um lead chega. */

let regras: RegrasPontuacao | null = null;

// ---------- Pontuação ----------

export function buildPontuacao(ctx: CtxApi): HTMLElement {
  const salvas = ctx.file.leadsConfig.regras;
  const r = (regras ??= structuredClone(salvas));
  const { cartao: c, corpo } = cartao('pontuacao', ICONES_CONTATO.alvo, 'Pontuação', 'Quanto cada critério vale. Mudar aqui refaz a pontuação de todos os leads.');
  const lista = el('div', 'la-criterios');
  const somaEl = el('p', 'la-nota');
  const atualizarSoma = (): void => {
    const soma = somaMaxima(r);
    somaEl.textContent = `Soma de todos os critérios: ${soma} pontos${soma > 100 ? ' — a pontuação para em 100.' : '.'}`;
  };
  CRITERIOS_PONTUACAO.forEach((cr) => {
    const l = el('label', 'la-criterio');
    l.appendChild(el('span', undefined, cr.rotulo));
    const n = el('input', 'ct-input');
    n.type = 'number';
    n.min = '-100';
    n.max = '100';
    n.value = String(r.pesos[cr.id as CriterioId]);
    n.addEventListener('input', () => {
      r.pesos[cr.id as CriterioId] = Math.round(Number(n.value) || 0);
      atualizarSoma();
    });
    l.append(n, el('span', 'la-pts', 'pts'));
    lista.appendChild(l);
  });
  corpo.appendChild(lista);
  atualizarSoma();
  corpo.appendChild(somaEl);

  const faixas = el('div', 'la-faixas');
  const numeroCampo = (rotulo: string, valor: number, gravar: (v: number) => void, dica: string): HTMLElement => {
    const n = el('input', 'ct-input');
    n.type = 'number';
    n.min = '0';
    n.max = '100';
    n.value = String(valor);
    n.addEventListener('input', () => gravar(Math.round(Number(n.value) || 0)));
    return campoLinha(rotulo, n, dica);
  };
  faixas.append(
    numeroCampo('Quente a partir de', r.quente, (v) => (r.quente = v), 'pontos'),
    numeroCampo('Morno a partir de', r.morno, (v) => (r.morno = v), 'abaixo disso, frio'),
  );
  corpo.appendChild(faixas);

  const valiosos = el('textarea', 'ct-input');
  valiosos.rows = 3;
  valiosos.placeholder = 'Um por linha. Ex.:\n/orcamento\nContato da página de preços';
  valiosos.value = r.valiosos.join('\n');
  valiosos.addEventListener('input', () => {
    r.valiosos = valiosos.value
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
  });
  corpo.appendChild(campoLinha('Páginas e formulários valiosos', valiosos, 'Um trecho do endereço da página (ex.: /orcamento) ou o nome do formulário. Quem vier deles ganha o critério "valioso".'));

  const acoes = el('div', 'la-acoes');
  const salvar = buildBotao('Salvar e refazer a pontuação', { variante: 'primario', icone: '<polyline points="20 6 9 17 4 12"/>' });
  salvar.addEventListener('click', () => {
    salvar.disabled = true;
    void salvarConfig(ctx, { regras: r }).then((ok) => {
      salvar.disabled = false;
      if (!ok) return;
      regras = null;
      const total = ctx.file.pessoas.filter((p) => p.entrada).length;
      mostrarToast(`Pontuação refeita para ${total} ${total === 1 ? 'lead' : 'leads'}`, [], 3000);
    });
  });
  const padrao = buildBotao('Voltar ao padrão', { variante: 'fantasma' });
  padrao.addEventListener('click', () => {
    regras = { ...regrasPadrao(), valiosos: r.valiosos };
    ctx.redesenhar();
  });
  acoes.append(salvar, padrao);
  if (JSON.stringify(r) !== JSON.stringify(salvas)) acoes.appendChild(el('span', 'la-pendente', 'Alterações não salvas'));
  corpo.appendChild(acoes);
  return c;
}

// ---------- Avisos ----------

export function buildAvisos(ctx: CtxApi): HTMLElement {
  const { cartao: c, corpo } = cartao('avisos', ICONES_CONTATO.sino2, 'Avisos', 'Quando um lead chega');
  corpo.appendChild(
    interruptor(`Notificação ${DO_SISTEMA}`, 'Nome, pontuação e origem; clicar abre a ficha. O número no ícone de Leads, na barra lateral, aparece sempre.', ctx.file.leadsConfig.notificar, (v) => {
      void salvarConfig(ctx, { notificar: v });
    }),
  );
  if (status && !status.notificacoesSuportadas) corpo.appendChild(el('p', 'la-aviso', NO_LINUX
        ? 'O sistema não está aceitando notificações de aplicativos. Confira as notificações nas configurações da sua área de trabalho.'
        : 'Este Windows não está aceitando notificações de aplicativos. Confira em Configurações › Sistema › Notificações.'));
  return c;
}
