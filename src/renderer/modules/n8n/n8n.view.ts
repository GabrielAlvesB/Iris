import type { N8nExecucao, N8nExecucaoStatus, N8nWorkflow } from '../../../shared/types/n8n.types';
import * as n8nState from './n8n.state.js';
import type { N8nViewState } from './n8n.state.js';
import { openConfirmModal, openFormModal } from '../../ui/modal.js';
import { abrirTutorial } from '../../core/navegacao.js';
import {
  ICONES,
  buildAviso,
  buildBotao,
  buildBotaoAjuda,
  buildBusca,
  buildCabecalho,
  buildIndicadores,
  buildSegmentado,
  buildSelo,
  buildVazio,
  focarBusca,
  tempoRelativo,
  type Tom,
} from '../../ui/pagina.js';

type Aba = 'workflows' | 'execucoes';

let abaAtual: Aba = 'workflows';
let busca = '';
let containerAtual: HTMLElement | null = null;

const STATUS: Record<N8nExecucaoStatus, { rotulo: string; tom: Tom }> = {
  sucesso: { rotulo: 'Sucesso', tom: 'ok' },
  erro: { rotulo: 'Erro', tom: 'erro' },
  rodando: { rotulo: 'Rodando', tom: 'atencao' },
  desconhecido: { rotulo: 'Indefinido', tom: 'neutro' },
};

function duracao(ms?: number): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

async function avisar(titulo: string, mensagem: string): Promise<void> {
  await openConfirmModal({ title: titulo, message: mensagem, confirmText: 'Entendi', cancelText: 'Fechar', danger: false });
}

function mensagemDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rerender(): void {
  const state = n8nState.getCurrentState();
  if (containerAtual && state) render(containerAtual, state);
}

function configurado(state: N8nViewState): boolean {
  return Boolean(state.config.baseUrl && state.config.temApiKey);
}

function buildTopo(state: N8nViewState): HTMLElement {
  const selo = !configurado(state)
    ? buildSelo('não configurado', 'atencao')
    : state.snapshot.conectado
      ? buildSelo('conectado', 'ok')
      : buildSelo('desconectado', 'erro');

  const atualizar = buildBotao('Atualizar', { icone: ICONES.atualizar });
  atualizar.addEventListener('click', () => {
    atualizar.disabled = true;
    atualizar.classList.add('is-girando');
    void n8nState
      .atualizarAgora()
      .catch((error: unknown) => avisar('Falha ao atualizar', mensagemDe(error)))
      .finally(() => {
        atualizar.disabled = false;
        atualizar.classList.remove('is-girando');
      });
  });

  const subtitulo = configurado(state)
    ? `${state.config.baseUrl} · sincronizado ${tempoRelativo(state.snapshot.atualizadoEm)}`
    : 'Automações do n8n: veja seus fluxos, acompanhe execuções e dispare pelo Iris';

  return buildCabecalho({
    icone: ICONES.n8n,
    titulo: 'n8n',
    subtitulo,
    extras: [selo],
    acoes: [atualizar, buildBotaoAjuda(() => abrirTutorial('n8n'))],
  });
}

function buildResumo(state: N8nViewState): HTMLElement {
  const { workflows, execucoes } = state.snapshot;
  const ativos = workflows.filter((w) => w.ativo).length;
  const falhas = execucoes.filter((e) => e.status === 'erro').length;
  const concluidas = execucoes.filter((e) => e.status === 'sucesso' || e.status === 'erro').length;
  const taxa = concluidas > 0 ? Math.round(((concluidas - falhas) / concluidas) * 100) : null;

  return buildIndicadores([
    { rotulo: 'Workflows', valor: String(workflows.length), detalhe: `${ativos} ativo${ativos === 1 ? '' : 's'}` },
    {
      rotulo: 'Execuções recentes',
      valor: String(execucoes.length),
      detalhe: execucoes[0] ? `última ${tempoRelativo(execucoes[0].iniciadaEm)}` : 'nenhuma ainda',
    },
    {
      rotulo: 'Falhas',
      valor: String(falhas),
      detalhe: falhas > 0 ? 'precisa de atenção' : 'tudo em ordem',
      tom: falhas > 0 ? 'erro' : 'ok',
    },
    {
      rotulo: 'Taxa de sucesso',
      valor: taxa === null ? '—' : `${taxa}%`,
      detalhe: concluidas > 0 ? `em ${concluidas} execuções` : 'sem dados',
    },
  ]);
}

async function disparar(workflow: N8nWorkflow): Promise<void> {
  const resposta = await openFormModal(
    `Executar "${workflow.nome}"`,
    [{ name: 'payload', label: 'Dados enviados ao fluxo (JSON, opcional)', type: 'textarea', placeholder: '{ "chave": "valor" }' }],
    'Executar',
  );
  if (!resposta) return;

  try {
    const resultado = await n8nState.dispararWorkflow({ workflowId: workflow.id, payloadJson: resposta.payload });
    await avisar(
      resultado.ok ? 'Workflow disparado' : 'Não foi possível disparar',
      resultado.respostaBruta ? `${resultado.mensagem}\n\nResposta:\n${resultado.respostaBruta.slice(0, 600)}` : resultado.mensagem,
    );
  } catch (error) {
    await avisar('Não foi possível disparar', mensagemDe(error));
  }
}

function buildWorkflowCard(workflow: N8nWorkflow, execucoes: N8nExecucao[]): HTMLElement {
  const card = document.createElement('article');
  card.className = `pg-card n8n-wf${workflow.ativo ? ' is-ativo' : ''}`;

  const topo = document.createElement('div');
  topo.className = 'n8n-wf-topo';

  const nome = document.createElement('h3');
  nome.className = 'n8n-wf-nome';
  nome.textContent = workflow.nome;
  nome.title = workflow.nome;
  topo.appendChild(nome);

  const interruptor = document.createElement('button');
  interruptor.className = `pg-interruptor${workflow.ativo ? ' is-ligado' : ''}`;
  interruptor.title = workflow.ativo ? 'Desativar workflow' : 'Ativar workflow';
  interruptor.setAttribute('role', 'switch');
  interruptor.setAttribute('aria-checked', String(workflow.ativo));
  interruptor.addEventListener('click', () => {
    interruptor.disabled = true;
    void n8nState
      .alternarAtivo(workflow.id, !workflow.ativo)
      .catch((error: unknown) => avisar('Não foi possível alterar', mensagemDe(error)))
      .finally(() => {
        interruptor.disabled = false;
      });
  });
  topo.appendChild(interruptor);
  card.appendChild(topo);

  const meta = document.createElement('div');
  meta.className = 'n8n-wf-meta';
  meta.appendChild(buildSelo(workflow.ativo ? 'ativo' : 'inativo', workflow.ativo ? 'ok' : 'neutro'));
  const id = document.createElement('span');
  id.className = 'n8n-mono';
  id.textContent = `#${workflow.id}`;
  meta.appendChild(id);
  workflow.tags.forEach((tag) => {
    const chip = document.createElement('span');
    chip.className = 'n8n-tag';
    chip.textContent = tag;
    meta.appendChild(chip);
  });
  card.appendChild(meta);

  // Faixa das últimas execuções deste fluxo: leitura rápida de saúde.
  const doFluxo = execucoes.filter((e) => e.workflowId === workflow.id).slice(0, 12).reverse();
  const rodape = document.createElement('div');
  rodape.className = 'n8n-wf-rodape';

  const historico = document.createElement('div');
  historico.className = 'n8n-wf-historico';
  if (doFluxo.length === 0) {
    const nada = document.createElement('span');
    nada.className = 'n8n-wf-sem';
    nada.textContent = 'sem execuções recentes';
    historico.appendChild(nada);
  } else {
    doFluxo.forEach((execucao) => {
      const ponto = document.createElement('span');
      ponto.className = `n8n-wf-ponto is-${STATUS[execucao.status].tom}`;
      ponto.title = `${STATUS[execucao.status].rotulo} · ${tempoRelativo(execucao.iniciadaEm)} · ${duracao(execucao.duracaoMs)}`;
      historico.appendChild(ponto);
    });
  }
  rodape.appendChild(historico);

  const executar = buildBotao('Executar', { icone: ICONES.play, variante: 'fantasma' });
  executar.addEventListener('click', () => void disparar(workflow));
  rodape.appendChild(executar);

  card.appendChild(rodape);
  return card;
}

function buildTabelaExecucoes(execucoes: N8nExecucao[]): HTMLElement {
  const tabela = document.createElement('div');
  tabela.className = 'n8n-tabela';

  const cabecalho = document.createElement('div');
  cabecalho.className = 'n8n-linha n8n-linha--cabecalho';
  ['Status', 'Workflow', 'Início', 'Duração', 'Modo', ''].forEach((titulo) => {
    const celula = document.createElement('span');
    celula.textContent = titulo;
    cabecalho.appendChild(celula);
  });
  tabela.appendChild(cabecalho);

  execucoes.forEach((execucao) => {
    const linha = document.createElement('div');
    linha.className = 'n8n-linha';

    const status = STATUS[execucao.status];
    linha.appendChild(buildSelo(status.rotulo, status.tom));

    const nome = document.createElement('span');
    nome.className = 'n8n-linha-nome';
    nome.textContent = execucao.workflowNome ?? `Workflow ${execucao.workflowId || '—'}`;
    linha.appendChild(nome);

    const inicio = document.createElement('span');
    inicio.className = 'n8n-mono';
    inicio.textContent = tempoRelativo(execucao.iniciadaEm);
    inicio.title = execucao.iniciadaEm ? new Date(execucao.iniciadaEm).toLocaleString('pt-BR') : '';
    linha.appendChild(inicio);

    const dur = document.createElement('span');
    dur.className = 'n8n-mono';
    dur.textContent = duracao(execucao.duracaoMs);
    linha.appendChild(dur);

    const modo = document.createElement('span');
    modo.className = 'n8n-linha-modo';
    modo.textContent = execucao.modo ?? '—';
    linha.appendChild(modo);

    const abrir = buildBotao('', { icone: ICONES.externo, variante: 'fantasma', titulo: 'Abrir no navegador' });
    abrir.addEventListener('click', () => {
      void n8nState.abrirExecucao(execucao.id).catch((error: unknown) => avisar('Não foi possível abrir', mensagemDe(error)));
    });
    linha.appendChild(abrir);

    tabela.appendChild(linha);
  });

  return tabela;
}

export function render(container: HTMLElement, state: N8nViewState): void {
  containerAtual = container;
  container.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'pg-view n8n-view';
  view.appendChild(buildTopo(state));

  if (!configurado(state)) {
    const ir = buildBotao('Ver o passo a passo', { variante: 'primario' });
    ir.addEventListener('click', () => abrirTutorial('n8n'));
    view.appendChild(
      buildVazio(
        ICONES.n8n,
        'Conecte seu n8n',
        'Informe a URL e a API key do seu n8n em Ajustes. O tutorial mostra, passo a passo, onde encontrar cada uma.',
        ir,
      ),
    );
    container.appendChild(view);
    return;
  }

  if (!state.snapshot.conectado && state.snapshot.erro) {
    view.appendChild(buildAviso(state.snapshot.erro, 'erro'));
  }

  view.appendChild(buildResumo(state));

  const barra = document.createElement('div');
  barra.className = 'pg-barra';
  barra.appendChild(
    buildSegmentado<Aba>(
      [
        { value: 'workflows', label: `Workflows · ${state.snapshot.workflows.length}` },
        { value: 'execucoes', label: `Execuções · ${state.snapshot.execucoes.length}` },
      ],
      abaAtual,
      (valor) => {
        abaAtual = valor;
        rerender();
      },
    ),
  );
  const espaco = document.createElement('div');
  espaco.className = 'pg-espaco';
  barra.appendChild(espaco);
  barra.appendChild(
    buildBusca(busca, abaAtual === 'workflows' ? 'Buscar workflow…' : 'Buscar por workflow…', (valor) => {
      busca = valor;
      rerender();
      focarBusca(containerAtual);
    }),
  );
  view.appendChild(barra);

  const conteudo = document.createElement('div');
  conteudo.className = 'pg-rolagem';

  const termo = busca.trim().toLocaleLowerCase('pt-BR');

  if (abaAtual === 'workflows') {
    const visiveis = state.snapshot.workflows.filter((w) => !termo || w.nome.toLocaleLowerCase('pt-BR').includes(termo));
    if (visiveis.length === 0) {
      conteudo.appendChild(
        buildVazio(
          ICONES.n8n,
          state.snapshot.workflows.length === 0 ? 'Nenhum workflow ainda' : 'Nada encontrado',
          state.snapshot.workflows.length === 0
            ? 'Crie fluxos no seu n8n; eles aparecem aqui automaticamente na próxima sincronização.'
            : 'Nenhum workflow tem esse nome.',
        ),
      );
    } else {
      const grade = document.createElement('div');
      grade.className = 'n8n-grade';
      // Ativos primeiro: são os que importam no dia a dia.
      [...visiveis]
        .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'))
        .forEach((workflow) => grade.appendChild(buildWorkflowCard(workflow, state.snapshot.execucoes)));
      conteudo.appendChild(grade);
    }
  } else {
    const visiveis = state.snapshot.execucoes.filter(
      (e) => !termo || (e.workflowNome ?? '').toLocaleLowerCase('pt-BR').includes(termo),
    );
    conteudo.appendChild(
      visiveis.length === 0
        ? buildVazio(ICONES.play, 'Nenhuma execução', 'Quando algum fluxo rodar, ele aparece aqui com o resultado e a duração.')
        : buildTabelaExecucoes(visiveis),
    );
  }

  view.appendChild(conteudo);
  container.appendChild(view);
}

export function destroy(): void {
  containerAtual = null;
  busca = '';
  abaAtual = 'workflows';
}
