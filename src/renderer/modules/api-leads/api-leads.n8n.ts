import type { N8nConfig } from '../../../shared/types/n8n.types.js';
import type { ResultadoTeste } from '../../../shared/types/leads.types.js';
import {
  CAMINHO_WEBHOOK,
  CENARIOS_N8N,
  LEAD_TESTE_N8N,
  cenarioPeloEndereco,
  enderecoParaN8n,
  fluxoN8n,
  type CenarioN8n,
  type FluxoN8nCriado,
} from '../../../shared/types/leads.n8n.js';
import { abrirAjustes } from '../../core/navegacao.js';
import { mensagemDeErro } from '../../ui/modal.js';
import { buildBotao, buildSegmentado, buildSelo, svg, type Tom } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import * as contatosState from '../contatos/contatos.state.js';
import { ICONES_CONTATO, el } from '../contatos/contatos.ui.js';
import { cartao, codigo, copiar, resultado, salvarConfig, status, valorCopiavel, type CtxApi } from './api-leads.pecas.js';

/**
 * n8n: levar leads de qualquer formulário ou ferramenta ao Iris por um fluxo
 * do n8n. O fluxo é sempre gatilho → "Campos do Iris" → HTTP Request para a
 * API de leads; o que muda é para onde o n8n consegue enviar, conforme onde
 * ele roda (leads.n8n.ts). O fluxo pronto sai com o endereço e a chave certos
 * e pode ser colado no editor ou criado pela conexão do módulo n8n.
 */

let n8n: N8nConfig | null = null;
let carregandoN8n = false;
/** Escolha da pessoa; sem ela, o palpite pelo endereço do n8n salvo em Ajustes. */
let cenarioEscolhido: CenarioN8n | null = null;
let criado: FluxoN8nCriado | null = null;
let erroCriar: string | null = null;
let teste: ResultadoTeste | null = null;

/** Ao abrir o módulo: o endereço pode ter mudado em Ajustes › n8n desde a última vez. */
export function esquecerN8n(): void {
  n8n = null;
  criado = null;
  erroCriar = null;
  teste = null;
}

/** O endereço do n8n mora no módulo n8n (Ajustes › n8n): lido ao abrir a seção. */
export function carregarN8n(ctx: CtxApi): void {
  if (carregandoN8n) return;
  carregandoN8n = true;
  void window.irisAPI.n8n
    .getConfig()
    .then((r) => {
      const novo = r.ok ? r.data : null;
      const mudou = JSON.stringify(novo) !== JSON.stringify(n8n);
      n8n = novo;
      if (mudou) ctx.redesenhar();
    })
    .catch(() => undefined)
    .finally(() => (carregandoN8n = false));
}

function cenarioAtual(): CenarioN8n {
  return cenarioEscolhido ?? cenarioPeloEndereco(n8n?.baseUrl ?? '') ?? 'local';
}

// ---------- O que precisa estar ligado ----------

interface Requisito {
  ok: boolean;
  texto: string;
  /** Botão que resolve ali mesmo (ligar o servidor, abrir a seção da caixa). */
  acao?: HTMLElement;
}

function requisitos(ctx: CtxApi, cenario: CenarioN8n): Requisito[] {
  const cfg = ctx.file.leadsConfig;
  const ouvindo = Boolean(status?.servidor.ouvindo);
  const botao = (rotulo: string, aoClicar: () => void): HTMLElement => {
    const b = buildBotao(rotulo, { variante: 'secundario' });
    b.addEventListener('click', aoClicar);
    return b;
  };
  if (cenario === 'servidor') {
    return [
      { ok: Boolean(cfg.nuvem.url), texto: 'Caixa na nuvem configurada (o n8n do servidor envia para ela)', acao: cfg.nuvem.url ? undefined : botao('Configurar a caixa', () => ctx.irPara('nuvem')) },
      {
        ok: cfg.nuvem.ativo,
        texto: 'Busca a cada minuto ligada (o Iris traz da caixa o que o n8n enviou)',
        acao: cfg.nuvem.ativo || !cfg.nuvem.url ? undefined : botao('Ligar a busca', () => void salvarConfig(ctx, { nuvem: { ativo: true } }, 'Busca ligada')),
      },
    ];
  }
  const lista: Requisito[] = [
    {
      ok: cfg.servidor.ativo && ouvindo,
      texto: cfg.servidor.ativo && !ouvindo && status?.servidor.erro ? `Servidor local ligado — ${status.servidor.erro}` : 'Servidor local ligado (é ele que o n8n chama)',
      acao: cfg.servidor.ativo ? undefined : botao('Ligar o servidor local', () => void salvarConfig(ctx, { servidor: { ativo: true } }, 'Servidor local ligado')),
    },
  ];
  if (cenario === 'docker') {
    lista.push({
      ok: cfg.servidor.rede,
      texto: '"Aceitar da rede local" ligado (o contêiner chega ao Iris por fora do 127.0.0.1)',
      acao: cfg.servidor.rede ? undefined : botao('Ligar', () => void salvarConfig(ctx, { servidor: { rede: true } }, 'O servidor local agora aceita da rede local')),
    });
  }
  lista.push({ ok: true, texto: 'O Iris aberto: o servidor local só responde enquanto o app está aberto' });
  return lista;
}

const POR_QUE: Record<CenarioN8n, string> = {
  local:
    'O n8n e o Iris estão no mesmo computador, então o n8n fala direto com o servidor local do Iris pelo 127.0.0.1 — sem internet no meio. Funciona enquanto o Iris estiver aberto.',
  docker:
    'Dentro do Docker, "127.0.0.1" é o próprio contêiner, não o seu computador. O endereço host.docker.internal é o jeito do Docker Desktop de chegar ao computador; por isso o servidor local precisa aceitar conexões de fora do 127.0.0.1 ("aceitar da rede local").',
  servidor:
    'Um n8n num servidor (VPS, n8n Cloud) está na internet e não consegue chegar ao seu computador. Ele envia para a caixa na nuvem — que fica no ar o tempo todo — e o Iris busca de lá a cada minuto, mesmo que o PC tenha ficado desligado.',
};

// ---------- Seção ----------

export function buildN8n(ctx: CtxApi): HTMLElement {
  if (!n8n) carregarN8n(ctx);
  const wrap = el('div', 'la-secao-corpo');
  const cenario = cenarioAtual();
  const cfg = ctx.file.leadsConfig;
  const endereco = enderecoParaN8n(cenario, { porta: cfg.servidor.porta, urlNuvem: cfg.nuvem.url });
  const baseN8n = n8n?.baseUrl ?? '';

  // 1. Como funciona
  const como = cartao('n8n-como', ICONES_CONTATO.api, 'Como o n8n entrega leads ao Iris', 'Qualquer coisa que o n8n receba — um formulário, uma planilha, um CRM — pode virar lead no Iris.');
  const fluxo = el('div', 'la-fluxo');
  const no = (icone: string, titulo: string, texto: string): HTMLElement => {
    const n = el('div', 'la-no');
    const i = el('span', 'la-no-icone');
    i.innerHTML = svg(icone, 18);
    n.append(i, el('strong', undefined, titulo), el('span', undefined, texto));
    return n;
  };
  const seta = (): HTMLElement => {
    const s = el('div', 'la-seta is-curta');
    s.innerHTML = svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', 18);
    return s;
  };
  fluxo.append(
    no(ICONES_CONTATO.raio, 'Gatilho', 'Webhook, Typeform, Google Forms, Elementor…'),
    seta(),
    no(ICONES_CONTATO.modelo, 'Campos do Iris', 'Dá os nomes nome, email, telefone…'),
    seta(),
    no(ICONES_CONTATO.api, 'HTTP Request', 'POST na API de leads, com a chave'),
    seta(),
    no(ICONES_CONTATO.pessoa, 'Iris', 'Cria a pessoa, pontua, avisa'),
  );
  como.corpo.appendChild(fluxo);
  como.corpo.appendChild(el('p', 'la-nota', 'O único detalhe é o endereço do último passo: ele depende de onde o seu n8n roda. Escolha abaixo e o fluxo sai pronto.'));
  wrap.appendChild(como.cartao);

  // 2. Onde o n8n roda
  const onde = cartao('n8n-onde', ICONES_CONTATO.servidor, 'Onde o seu n8n roda?', 'Cada lugar tem um caminho até o Iris');
  onde.corpo.appendChild(
    buildSegmentado<CenarioN8n>(
      CENARIOS_N8N.map((c) => ({ value: c.id, label: c.rotulo })),
      cenario,
      (v) => {
        cenarioEscolhido = v;
        criado = null;
        erroCriar = null;
        ctx.redesenhar();
      },
    ),
  );
  const palpite = cenarioPeloEndereco(baseN8n);
  if (!cenarioEscolhido && palpite) onde.corpo.appendChild(el('p', 'la-nota', `Escolhido pelo endereço do n8n em Ajustes (${baseN8n}). Se ele roda em Docker, escolha "Em Docker".`));
  onde.corpo.appendChild(el('p', 'la-explica', POR_QUE[cenario]));

  const lista = el('ul', 'la-requisitos');
  requisitos(ctx, cenario).forEach((r) => {
    const li = el('li', r.ok ? 'is-ok' : 'is-falta');
    li.appendChild(buildSelo(r.ok ? 'Pronto' : 'Falta', r.ok ? 'ok' : ('atencao' as Tom)));
    li.appendChild(el('span', undefined, r.texto));
    if (r.acao) li.appendChild(r.acao);
    lista.appendChild(li);
  });
  onde.corpo.appendChild(lista);

  onde.corpo.appendChild(el('span', 'ct-campo-rotulo', 'Endereço que o n8n chama (último nó, HTTP Request)'));
  onde.corpo.appendChild(endereco ? valorCopiavel(endereco, 'Endereço copiado') : el('p', 'la-aviso', 'Configure a caixa na nuvem para ter este endereço.'));
  onde.corpo.appendChild(el('span', 'ct-campo-rotulo', 'Cabeçalho X-Iris-Chave (a chave do formulário)'));
  onde.corpo.appendChild(valorCopiavel(cfg.chaveFormulario, 'Chave copiada'));
  wrap.appendChild(onde.cartao);

  // 3. Fluxo pronto
  const webhook = `${baseN8n || 'http://ENDERECO-DO-SEU-N8N'}/webhook/${CAMINHO_WEBHOOK}`;
  const pronto = cartao('n8n-fluxo', ICONES_CONTATO.copiar, 'Montar o fluxo no seu n8n', 'O Iris escreve o fluxo por você; você só escolhe como ele entra no n8n');
  if (!endereco) {
    pronto.corpo.appendChild(el('p', 'la-aviso', 'Sem a caixa na nuvem, um n8n de servidor não tem para onde enviar. Configure a caixa primeiro.'));
  } else {
    const definicao = fluxoN8n({ endereco, chave: cfg.chaveFormulario });
    const json = JSON.stringify(definicao, null, 2);
    const conectado = Boolean(baseN8n && n8n?.temApiKey);

    pronto.corpo.appendChild(
      el(
        'p',
        'la-explica',
        'Um fluxo do n8n é uma sequência de passos ligados. Este tem três, e montar à mão é onde mais se erra: o endereço do Iris, a chave e o nome de cada campo. Por isso ele já sai escrito, com os dados deste cenário:',
      ),
    );
    // O que vai dentro de cada nó: é isto que a pessoa veria abrindo o fluxo no n8n.
    const preenchido = el('ol', 'la-preenchido');
    const item = (titulo: string, texto: string, valor?: string): void => {
      const li = el('li');
      li.append(el('strong', undefined, titulo), el('span', undefined, texto));
      if (valor) li.appendChild(el('code', undefined, valor));
      preenchido.appendChild(li);
    };
    item('Formulário (Webhook)', 'Fica esperando. Quem quiser mandar um lead manda para este endereço do n8n:', webhook);
    item('Campos do Iris', 'Traduz o que chegou para os nomes que o Iris entende — nome, email, telefone, empresa, mensagem, UTMs… Aceita também name, phone, company.');
    item('Enviar ao Iris', 'Entrega o lead ao Iris neste endereço, com a chave do formulário no cabeçalho:', endereco);
    pronto.corpo.appendChild(preenchido);

    // Dois jeitos de pôr o mesmo fluxo no n8n, lado a lado: escolher um basta.
    pronto.corpo.appendChild(el('span', 'ct-campo-rotulo', 'Leve o fluxo ao n8n de um destes jeitos'));
    const opcoes = el('div', 'la-opcoes');
    const opcao = (titulo: string, texto: string): HTMLElement => {
      const o = el('div', 'la-opcao');
      o.append(el('strong', undefined, titulo), el('p', undefined, texto));
      opcoes.appendChild(o);
      return o;
    };
    const automatico = opcao(
      'Automático',
      'O Iris usa a conexão com o n8n (Ajustes › n8n) e cria o fluxo lá dentro, desligado, para você conferir antes de ligar.',
    );
    const manual = opcao(
      'Copiar e colar',
      'Não precisa de conexão. Copie, abra o n8n, crie um workflow vazio, clique na área em branco e aperte Ctrl+V: os três passos aparecem ligados.',
    );
    pronto.corpo.appendChild(opcoes);

    const criar = buildBotao('Criar no meu n8n', { variante: 'primario', icone: ICONES_CONTATO.raio });
    criar.disabled = !conectado;
    criar.addEventListener('click', () => {
      criar.disabled = true;
      erroCriar = null;
      void contatosState
        .criarFluxoN8n(cenario)
        .then((r) => {
          criado = r;
          mostrarToast('Fluxo criado no n8n', [], 3000);
        })
        .catch((e: unknown) => (erroCriar = mensagemDeErro(e)))
        .finally(() => ctx.redesenhar());
    });
    automatico.appendChild(criar);
    if (!conectado) {
      const linha = el('p', 'la-nota');
      linha.appendChild(
        document.createTextNode(baseN8n ? 'Falta a API key do n8n para o Iris poder criar. ' : 'O Iris ainda não está conectado ao seu n8n (endereço e API key). '),
      );
      const ir = el('button', 'ct-link', 'Abrir Ajustes › n8n');
      ir.type = 'button';
      ir.addEventListener('click', () => abrirAjustes('n8n'));
      linha.appendChild(ir);
      automatico.appendChild(linha);
    }
    const copiarBtn = buildBotao('Copiar fluxo', { variante: conectado ? 'secundario' : 'primario', icone: ICONES_CONTATO.copiar });
    copiarBtn.addEventListener('click', () => copiar(json, 'Fluxo copiado — cole no editor do n8n com Ctrl+V'));
    manual.appendChild(copiarBtn);

    if (erroCriar) pronto.corpo.appendChild(resultado({ ok: false, mensagem: erroCriar, detalhes: [] })!);
    if (criado) {
      const caixa = resultado({
        ok: true,
        mensagem: `"${criado.nome}" foi criado no n8n, desligado. Siga os passos abaixo a partir do 1.`,
        detalhes: [],
      })!;
      const abrir = buildBotao('Abrir no n8n', { variante: 'secundario', icone: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>' });
      abrir.addEventListener('click', () => window.irisAPI.system.openExternalLink(criado!.link));
      caixa.appendChild(abrir);
      pronto.corpo.appendChild(caixa);
    }

    pronto.corpo.appendChild(el('span', 'ct-campo-rotulo', 'Com o fluxo no n8n'));
    const passos = el('ol', 'la-passos');
    [
      ['Ligar o fluxo', 'Abra o fluxo no n8n e ligue a chave "Active" no topo (nas versões mais novas, o botão "Publish"). Desligado, o n8n não escuta nada.'],
      [
        'Apontar a origem para o n8n',
        `No formulário do site (ou na ferramenta que manda os leads), o endereço de envio passa a ser ${webhook}. Se os leads vêm de Typeform, Google Forms, Elementor ou outro, troque o primeiro passo pelo gatilho dessa ferramenta — os outros dois ficam como estão.`,
      ],
      ['Conferir os nomes dos campos', 'Só se a origem usa nomes diferentes (ex.: "seu-nome" em vez de nome): no passo "Campos do Iris", troque $json.body.nome por $json.body["seu-nome"].'],
      ['Testar', 'Use o cartão logo abaixo: um lead de exemplo passa pelo n8n inteiro e tem de aparecer em Leads.'],
    ].forEach(([t, d]) => {
      const li = el('li');
      li.append(el('strong', undefined, t), el('p', undefined, d));
      passos.appendChild(li);
    });
    pronto.corpo.appendChild(passos);
    const detalhes = el('details', 'la-worker');
    detalhes.appendChild(el('summary', undefined, 'Ver o fluxo por dentro (JSON)'));
    detalhes.appendChild(codigo(json, 'Copiar', 'Fluxo copiado — cole no editor do n8n com Ctrl+V'));
    pronto.corpo.appendChild(detalhes);
  }
  wrap.appendChild(pronto.cartao);

  // 4. Testar de ponta a ponta
  const testar = cartao('n8n-teste', ICONES_CONTATO.alvo, 'Testar de ponta a ponta', 'Um lead de exemplo entra pelo Webhook do n8n e tem de aparecer em Leads');
  testar.corpo.appendChild(el('span', 'ct-campo-rotulo', 'Endereço do Webhook (produção)'));
  testar.corpo.appendChild(valorCopiavel(webhook, 'Endereço do webhook copiado'));
  testar.corpo.appendChild(
    el(
      'p',
      'la-nota',
      'Só responde com o fluxo ativo. O endereço /webhook-test/ do n8n só funciona com o editor aberto em "Listen for test event" — para o dia a dia, use este.',
    ),
  );
  const botao = buildBotao('Enviar lead de teste pelo n8n', { variante: 'primario', icone: ICONES_CONTATO.raio });
  botao.disabled = !baseN8n;
  if (!baseN8n) botao.title = 'Conecte o n8n em Ajustes › n8n';
  botao.addEventListener('click', () => {
    botao.disabled = true;
    void contatosState
      .testarFluxoN8n()
      .then((r) => (teste = r))
      .catch((e: unknown) => (teste = { ok: false, mensagem: mensagemDeErro(e), detalhes: [] }))
      .finally(() => void contatosState.load().catch(ctx.falhou));
  });
  testar.corpo.appendChild(botao);
  const r = resultado(teste);
  if (r) testar.corpo.appendChild(r);
  const corpoTeste = JSON.stringify(LEAD_TESTE_N8N).replace(/"/g, '\\"');
  testar.corpo.appendChild(el('span', 'ct-campo-rotulo', 'Ou pelo terminal'));
  testar.corpo.appendChild(codigo(`curl -X POST "${webhook}" -H "Content-Type: application/json" -d "${corpoTeste}"`, 'Copiar comando', 'Comando copiado'));
  wrap.appendChild(testar.cartao);

  return wrap;
}
