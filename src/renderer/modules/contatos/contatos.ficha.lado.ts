import { formatarMoeda, hojeLocal, lerMoeda } from '../../../shared/types/brasil.js';
import type { EmpresaCrm, Pessoa } from '../../../shared/types/contatos.types.js';
import { buildBotao } from '../../ui/pagina.js';
import { buildComoChegou } from '../leads/leads.chegada.js';
import type { CtxContatos } from './contatos.casco.js';
import { cartao, linhaCampo } from './contatos.ficha.campos.js';
import { agendar, rascunhoAtual, salvarERedesenhar } from './contatos.ficha.rascunho.js';
import { ICONES_CONTATO, ICONE_DO_TIPO_INTERACAO, el, quandoFoi, situacaoDoProximo } from './contatos.ui.js';

/**
 * A coluna da direita da Visão geral: o que move o relacionamento — próximo
 * contato, o negócio, como o lead chegou e o que vale lembrar.
 */

const ICONE_NEGOCIO = '<path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>';

function somarDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return hojeLocal(d);
}

export function buildProximo(ctx: CtxContatos, c: Pessoa | EmpresaCrm): HTMLElement {
  const prox = c.proximoContato;
  const corpo: HTMLElement[] = [];
  if (prox) {
    const sit = situacaoDoProximo(prox.data);
    const quando = el('p', `cf-proximo is-${sit}`);
    quando.append(
      el('strong', undefined, `${sit === 'atrasado' ? 'Atrasado · ' : ''}${quandoFoi(prox.data)}`),
      el('span', undefined, prox.data.split('-').reverse().join('/')),
    );
    corpo.push(quando);
  } else {
    corpo.push(el('p', 'cf-vazio', 'Nada marcado. Quando falar de novo?'));
  }
  const nota = el('input', 'cf-entrada is-caixa');
  nota.placeholder = 'Sobre o quê? (ex.: mandar a proposta)';
  nota.value = prox?.nota ?? '';
  nota.setAttribute('aria-label', 'Sobre o quê');
  const data = el('input', 'cf-entrada is-caixa');
  data.type = 'date';
  data.value = prox?.data ?? '';
  data.setAttribute('aria-label', 'Data do próximo contato');
  const salvar = (novaData: string): void => {
    // null (e não ausente) limpa no main.
    void salvarERedesenhar(ctx, { proximoContato: novaData ? { data: novaData, nota: nota.value.trim() } : (null as unknown as undefined) });
  };
  data.addEventListener('change', () => {
    // O campo de data dispara change a cada dígito do ano: só vale ano completo.
    if (!data.value || Number(data.value.slice(0, 4)) >= 2000) salvar(data.value);
  });
  nota.addEventListener('change', () => {
    if (data.value) salvar(data.value);
  });
  const atalhos = el('div', 'cf-atalhos');
  (
    [
      ['Amanhã', 1],
      ['1 semana', 7],
      ['15 dias', 15],
      ['1 mês', 30],
    ] as const
  ).forEach(([rotulo, dias]) => {
    const b = el('button', 'md-pilula', rotulo);
    b.type = 'button';
    b.addEventListener('click', () => salvar(somarDias(dias)));
    atalhos.appendChild(b);
  });
  const campos = el('div', 'cf-proximo-campos');
  campos.append(data, nota);
  corpo.push(atalhos, campos);
  let acao: HTMLElement | undefined;
  if (prox) {
    acao = buildBotao('Feito', { variante: 'fantasma', icone: '<polyline points="20 6 9 17 4 12"/>', titulo: 'Feito — tirar o lembrete' });
    acao.addEventListener('click', () => salvar(''));
  }
  return cartao('Próximo contato', ICONES_CONTATO.sino, corpo, { classe: prox ? `is-${situacaoDoProximo(prox.data)}` : '', ...(acao ? { acao } : {}) });
}

function buildNegocio(ctx: CtxContatos, c: Pessoa | EmpresaCrm): HTMLElement {
  const r = rascunhoAtual();
  const origens = [...new Set([...ctx.file.pessoas, ...ctx.file.empresas].map((x) => x.origem).filter(Boolean))];
  const lista = el('datalist');
  lista.id = 'cf-origens';
  origens.forEach((o) => lista.appendChild(Object.assign(el('option'), { value: o })));
  const origem = linhaCampo('Origem', c.origem, (v) => (r.origem = v), { placeholder: 'Indicação, Instagram, evento…', lista: 'cf-origens' });
  origem.appendChild(lista);
  return cartao('Negócio', ICONE_NEGOCIO, [
    origem,
    linhaCampo('Valor estimado', c.valorEstimado !== undefined ? formatarMoeda(c.valorEstimado) : '', (v) => (r.valorEstimado = lerMoeda(v)), {
      placeholder: 'R$ 0,00',
      formatar: (v) => {
        const n = lerMoeda(v);
        return n === undefined ? '' : formatarMoeda(n);
      },
    }),
    linhaCampo('Tags', c.tags.join(', '), (v) => (r.tags = v.split(',').map((t) => t.trim()).filter(Boolean)), { placeholder: 'Separadas por vírgula' }),
  ]);
}

function buildObservacoes(c: Pessoa | EmpresaCrm): HTMLElement {
  const t = el('textarea', 'cf-entrada is-caixa cf-observacoes');
  t.rows = 5;
  t.placeholder = 'O que vale lembrar: preferências, contexto, cuidados.';
  t.value = c.observacoes;
  t.setAttribute('aria-label', 'Observações');
  t.addEventListener('input', () => {
    rascunhoAtual().observacoes = t.value;
    agendar();
  });
  return cartao('Observações', ICONE_DO_TIPO_INTERACAO.nota!, [t]);
}

export function buildColunaLado(ctx: CtxContatos, c: Pessoa | EmpresaCrm): HTMLElement {
  const col = el('div', 'cf-coluna is-lado');
  col.appendChild(buildProximo(ctx, c));
  const chegou = 'razaoSocial' in c ? null : buildComoChegou(ctx, c);
  if (chegou) col.appendChild(chegou);
  col.append(buildNegocio(ctx, c), buildObservacoes(c));
  return col;
}
