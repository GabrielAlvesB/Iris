import type { ResultadoTeste } from '../../../shared/types/leads.types.js';
import { CODIGO_WORKER } from '../../../shared/types/leads.worker.js';
import { abrirModulo } from '../../core/navegacao.js';
import { interruptor } from '../../ui/campos.js';
import { mensagemDeErro, openConfirmModal, promptText } from '../../ui/modal.js';
import { buildBotao, buildSelo, tempoRelativo, type Tom } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import * as contatosState from '../contatos/contatos.state.js';
import { ICONES_CONTATO, el } from '../contatos/contatos.ui.js';
import {
  campoLinha,
  carregarStatus,
  cartao,
  codigo,
  copiar,
  definirStatus,
  invalidarStatusApi,
  resultado,
  salvarConfig,
  status,
  ultimoLead,
  valorCopiavel,
  type CtxApi,
} from './api-leads.pecas.js';
import { NO_LINUX } from '../../ui/plataforma.js';

/**
 * Os dois caminhos de um lead até o Iris — a caixa na nuvem (com o passo a
 * passo da Cloudflare) e o servidor local (com o teste) — e as chaves.
 */

let testeNuvem: ResultadoTeste | null = null;
let testeLocal: ResultadoTeste | null = null;

// ---------- Situação ----------

export function seloDaNuvem(): { texto: string; tom: Tom } {
  const n = status?.nuvem;
  if (!n?.url) return { texto: 'Não configurada', tom: 'neutro' };
  if (!n.ativo) return { texto: 'Busca desligada', tom: 'neutro' };
  if (n.ultimaBusca && !n.ultimaBusca.ok) return { texto: 'Com erro', tom: 'erro' };
  return { texto: 'Buscando a cada minuto', tom: 'ok' };
}

export function buildNuvem(ctx: CtxApi): HTMLElement {
  const cfg = ctx.file.leadsConfig.nuvem;
  const { cartao: c, corpo, cab } = cartao('nuvem', ICONES_CONTATO.nuvem, 'Caixa na nuvem', 'Para o formulário do site na internet');
  const selo = seloDaNuvem();
  cab.appendChild(buildSelo(selo.texto, selo.tom));

  const url = el('input', 'ct-input');
  url.type = 'url';
  url.placeholder = 'https://iris-leads.seu-nome.workers.dev';
  url.value = cfg.url;
  url.spellcheck = false;
  const salvarUrl = (): void => {
    if (url.value.trim() === cfg.url) return;
    void salvarConfig(ctx, { nuvem: { url: url.value } }, 'Endereço salvo');
  };
  url.addEventListener('change', salvarUrl);
  url.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') url.blur();
  });
  corpo.appendChild(campoLinha('Endereço da caixa', url, 'O endereço do Worker, como aparece na Cloudflare. Ainda não tem? O passo a passo está logo abaixo.'));

  const liga = interruptor('Buscar a cada minuto', 'Importa o que chegou e esvazia a caixa', cfg.ativo, (v) => {
    void salvarConfig(ctx, { nuvem: { ativo: v, url: url.value } }, v ? 'Busca ligada' : 'Busca desligada').then((ok) => {
      if (!ok) ctx.redesenhar();
    });
  });
  corpo.appendChild(liga);

  const info = el('div', 'la-info');
  const ultima = status?.nuvem.ultimaBusca;
  // Com erro, a linha só resume: a explicação fica na caixa logo abaixo, uma vez só.
  info.appendChild(el('span', undefined, `Última busca: ${ultima ? `${tempoRelativo(ultima.em)} — ${ultima.ok ? ultima.mensagem : 'com erro'}` : 'nenhuma nesta sessão'}`));
  info.appendChild(el('span', undefined, `Último lead pela nuvem: ${ultimoLead(ctx, 'nuvem')}`));
  corpo.appendChild(info);
  if (ultima && !ultima.ok) corpo.appendChild(resultado({ ok: false, mensagem: ultima.mensagem, detalhes: [] })!);

  const acoes = el('div', 'la-acoes');
  const testar = buildBotao('Testar conexão', { variante: 'secundario', icone: ICONES_CONTATO.alvo });
  testar.disabled = !cfg.url;
  testar.addEventListener('click', () => {
    testar.disabled = true;
    void contatosState
      .testarNuvem()
      .then((r) => (testeNuvem = r))
      .catch((e: unknown) => (testeNuvem = { ok: false, mensagem: mensagemDeErro(e), detalhes: [] }))
      .finally(() => ctx.redesenhar());
  });
  const buscar = buildBotao('Buscar agora', { variante: 'secundario', icone: ICONES_CONTATO.caixa });
  buscar.disabled = !cfg.url;
  buscar.addEventListener('click', () => {
    buscar.disabled = true;
    void contatosState
      .buscarAgora()
      .then((r) => {
        // O resultado aparece na linha "Última busca" (e o erro na caixa abaixo dela).
        testeNuvem = null;
        if (r.ok) mostrarToast(r.mensagem, [], 3000);
        invalidarStatusApi();
        carregarStatus();
      })
      .catch((e: unknown) => (testeNuvem = { ok: false, mensagem: mensagemDeErro(e), detalhes: [] }))
      .finally(() => ctx.redesenhar());
  });
  acoes.append(testar, buscar);
  corpo.appendChild(acoes);
  const r = resultado(testeNuvem);
  if (r) corpo.appendChild(r);
  return c;
}

export function buildLocal(ctx: CtxApi): HTMLElement {
  const cfg = ctx.file.leadsConfig.servidor;
  const s = status?.servidor;
  const { cartao: c, corpo, cab } = cartao('local', ICONES_CONTATO.servidor, 'Servidor local', 'Para testes, n8n e formulários na mesma rede');
  const selo: { texto: string; tom: Tom } = !cfg.ativo ? { texto: 'Desligado', tom: 'neutro' } : s?.ouvindo ? { texto: 'Ligado', tom: 'ok' } : s?.erro ? { texto: 'Não ligou', tom: 'erro' } : { texto: 'Ligando…', tom: 'atencao' };
  cab.appendChild(buildSelo(selo.texto, selo.tom));

  corpo.appendChild(
    interruptor('Ligado', 'Recebe leads enquanto o Iris está aberto', cfg.ativo, (v) => {
      void salvarConfig(ctx, { servidor: { ativo: v } });
    }),
  );
  const porta = el('input', 'ct-input la-porta');
  porta.type = 'number';
  porta.min = '1024';
  porta.max = '65535';
  porta.value = String(cfg.porta);
  porta.addEventListener('change', () => {
    if (Number(porta.value) === cfg.porta) return;
    void salvarConfig(ctx, { servidor: { porta: Number(porta.value) } }, 'Porta salva').then((ok) => {
      if (!ok) porta.value = String(cfg.porta);
    });
  });
  corpo.appendChild(campoLinha('Porta', porta, 'Troque só se outro programa já usa esta.'));
  corpo.appendChild(
    interruptor('Aceitar da rede local', `Outros aparelhos da casa ou do escritório e o n8n em Docker podem enviar (${NO_LINUX ? 'com firewall ligado, libere a porta' : 'o Windows pode perguntar sobre o firewall'})`, cfg.rede, (v) => {
      void salvarConfig(ctx, { servidor: { rede: v } });
    }),
  );

  if (s?.erro) corpo.appendChild(resultado({ ok: false, mensagem: s.erro, detalhes: [] })!);
  if (cfg.ativo && s?.ouvindo) {
    corpo.appendChild(el('span', 'ct-campo-rotulo', 'Endereço'));
    corpo.appendChild(valorCopiavel(`${s.endereco}/v1/leads`, 'Endereço copiado'));
    if (s.enderecoRede) {
      corpo.appendChild(el('span', 'ct-campo-rotulo', 'Na rede da casa'));
      corpo.appendChild(valorCopiavel(`${s.enderecoRede}/v1/leads`, 'Endereço copiado'));
    }
  }
  corpo.appendChild(el('div', 'la-info', `Último lead pelo servidor local: ${ultimoLead(ctx, 'local')}`));
  return c;
}

// ---------- Testar agora ----------

export function buildTestar(ctx: CtxApi): HTMLElement {
  const { cartao: c, corpo } = cartao('testar', ICONES_CONTATO.raio, 'Testar agora', 'Manda um lead de exemplo ao servidor local, pelo mesmo caminho de um formulário');
  const ligado = ctx.file.leadsConfig.servidor.ativo && status?.servidor.ouvindo;
  if (!ligado) corpo.appendChild(el('p', 'la-aviso', 'Ligue o servidor local (no primeiro cartão desta seção) para testar.'));
  const botao = buildBotao('Enviar lead de teste', { variante: 'primario', icone: ICONES_CONTATO.raio });
  botao.disabled = !ligado;
  botao.addEventListener('click', () => {
    botao.disabled = true;
    void contatosState
      .enviarTeste()
      .then((r) => (testeLocal = r))
      .catch((e: unknown) => (testeLocal = { ok: false, mensagem: mensagemDeErro(e), detalhes: [] }))
      .finally(() => void contatosState.load().catch(ctx.falhou));
  });
  corpo.appendChild(botao);
  const r = resultado(testeLocal);
  if (r) {
    corpo.appendChild(r);
    if (testeLocal?.ok) {
      const ver = buildBotao('Ver na caixa de leads', { variante: 'fantasma', icone: ICONES_CONTATO.caixa });
      ver.addEventListener('click', () => abrirModulo('leads'));
      corpo.appendChild(ver);
    }
  }
  return c;
}

// ---------- Chaves ----------

export function buildChaves(ctx: CtxApi): HTMLElement {
  const { cartao: c, corpo } = cartao('chaves', ICONES_CONTATO.chave, 'Chaves', 'Uma pública para o formulário, uma secreta para o Iris ler a caixa');
  const grade = el('div', 'la-chaves');

  const form = el('div', 'la-chave');
  form.appendChild(el('strong', undefined, 'Chave do formulário'));
  form.appendChild(el('p', undefined, 'Pública: vai no HTML do site e só serve para enviar leads. Mesmo vista por alguém, não lê nada.'));
  form.appendChild(valorCopiavel(ctx.file.leadsConfig.chaveFormulario, 'Chave do formulário copiada'));
  const novaForm = buildBotao('Gerar nova', { variante: 'fantasma', icone: ICONES_CONTATO.chave });
  novaForm.addEventListener('click', () => {
    void openConfirmModal({
      title: 'Gerar nova chave do formulário',
      message: 'Os formulários que usam a chave atual param de enviar até você trocar a chave neles (e na variável CHAVE_FORMULARIO da caixa na nuvem). Use se a chave foi usada para mandar lixo.',
      confirmText: 'Gerar nova',
    }).then((ok) => {
      if (ok) void contatosState.gerarChaveFormulario().then(() => mostrarToast('Chave nova gerada — atualize o formulário e a caixa', [], 4000), ctx.falhou);
    });
  });
  form.appendChild(novaForm);

  const iris = el('div', 'la-chave');
  iris.appendChild(el('strong', undefined, 'Chave do Iris'));
  iris.appendChild(el('p', undefined, 'Secreta: só o Iris e a caixa na nuvem conhecem. Fica guardada cifrada neste computador e nunca aparece na tela — gerar e copiar mandam direto para a área de transferência.'));
  const tem = status?.nuvem.temChaveIris;
  iris.appendChild(valorCopiavel(tem ? `guardada · termina em ${status?.nuvem.finalChaveIris}` : 'ainda não gerada', '', true));
  const botoes = el('div', 'la-acoes');
  const gerar = buildBotao(tem ? 'Gerar outra' : 'Gerar e copiar', { variante: tem ? 'fantasma' : 'primario', icone: ICONES_CONTATO.chave });
  gerar.addEventListener('click', () => {
    const fazer = (): void => {
      void contatosState
        .gerarChaveIris()
        .then((novo) => {
          definirStatus(novo);
          mostrarToast('Chave do Iris gerada e copiada — cole no Worker como CHAVE_IRIS', [], 5000);
          ctx.redesenhar();
        })
        .catch(ctx.falhou);
    };
    if (!tem) return fazer();
    void openConfirmModal({
      title: 'Gerar outra chave do Iris',
      message: 'A chave atual deixa de valer: até você colar a nova na variável CHAVE_IRIS do Worker, o Iris não consegue buscar os leads (eles continuam guardados na caixa).',
      confirmText: 'Gerar outra',
    }).then((ok) => {
      if (ok) fazer();
    });
  });
  botoes.appendChild(gerar);
  if (tem) {
    const copiarBtn = buildBotao('Copiar', { variante: 'secundario', icone: ICONES_CONTATO.copiar });
    copiarBtn.addEventListener('click', () => void contatosState.copiarChaveIris().then(() => mostrarToast('Chave do Iris copiada', [], 2500), ctx.falhou));
    botoes.appendChild(copiarBtn);
  }
  const colar = buildBotao('Colar uma existente', { variante: 'fantasma' });
  colar.addEventListener('click', () => {
    void promptText('Colar a chave do Iris', 'A CHAVE_IRIS que já está no Worker', '', { icone: ICONES_CONTATO.chave }).then((valor) => {
      if (!valor) return;
      void contatosState
        .definirChaveIris(valor)
        .then((novo) => {
          definirStatus(novo);
          mostrarToast('Chave do Iris guardada', [], 2500);
          ctx.redesenhar();
        })
        .catch(ctx.falhou);
    });
  });
  botoes.appendChild(colar);
  iris.appendChild(botoes);

  grade.append(form, iris);
  corpo.appendChild(grade);
  return c;
}

// ---------- Passo a passo da Cloudflare ----------

export function buildPassoAPasso(ctx: CtxApi): HTMLElement {
  const { cartao: c, corpo } = cartao('cloudflare', ICONES_CONTATO.nuvem, 'Criar a caixa na nuvem', 'Uma vez só, uns 10 minutos, pelo painel da Cloudflare — sem terminal e sem cartão de crédito');
  const chave = ctx.file.leadsConfig.chaveFormulario;
  const passos: Array<[string, string, HTMLElement?]> = [
    ['Crie uma conta grátis', 'Em dash.cloudflare.com. Não precisa de domínio nem de cartão.'],
    ['Crie o Worker', 'No menu, "Workers & Pages" › "Create" › "Create Worker" (o modelo "Hello World"). Dê o nome iris-leads e clique em "Deploy".'],
    ['Cole o código', 'Clique em "Edit code", apague tudo o que estiver lá, cole o código abaixo e clique em "Deploy".'],
    ['Crie o KV', 'No menu, "Storage & Databases" › "KV" › "Create" — o nome pode ser iris-leads. É onde os leads ficam guardados até o Iris buscar (por até 30 dias).'],
    ['Ligue o KV ao Worker', 'Abra o Worker › "Settings" › "Bindings" › "Add" › "KV namespace". Em "Variable name" escreva exatamente LEADS e escolha o KV criado.'],
    [
      'Preencha as variáveis',
      'Ainda em "Settings", "Variables and Secrets" › "Add". Crie as três abaixo e clique em "Deploy":',
      (() => {
        const lista = el('div', 'la-variaveis');
        const variavel = (nome: string, tipo: string, valor: HTMLElement | string): void => {
          const l = el('div', 'la-variavel');
          l.append(el('code', undefined, nome), el('span', 'la-variavel-tipo', tipo));
          l.appendChild(typeof valor === 'string' ? el('span', 'la-variavel-valor', valor) : valor);
          lista.appendChild(l);
        };
        variavel('CHAVE_FORMULARIO', 'Text', valorCopiavel(chave, 'Chave do formulário copiada'));
        const irisBtn = buildBotao(status?.nuvem.temChaveIris ? 'Copiar a chave do Iris' : 'Gerar e copiar a chave do Iris', { variante: 'secundario', icone: ICONES_CONTATO.chave });
        irisBtn.addEventListener('click', () => {
          const acao = status?.nuvem.temChaveIris ? contatosState.copiarChaveIris().then(() => undefined) : contatosState.gerarChaveIris().then((novo) => definirStatus(novo));
          void acao.then(() => {
            mostrarToast('Chave do Iris copiada — cole como CHAVE_IRIS (tipo Secret)', [], 4000);
            ctx.redesenhar();
          }, ctx.falhou);
        });
        variavel('CHAVE_IRIS', 'Secret', irisBtn);
        variavel('ORIGENS', 'Text, opcional', 'O endereço do seu site (ex.: https://seusite.com.br). Mais de um, separe por vírgula. Vazio aceita de qualquer site — a chave continua protegendo.');
        return lista;
      })(),
    ],
    ['Traga o endereço para cá', 'No topo do Worker aparece o endereço (https://iris-leads.<sua-conta>.workers.dev). Cole em "Endereço da caixa", no topo desta seção, clique em "Testar conexão" e ligue "Buscar a cada minuto".'],
  ];
  const ol = el('ol', 'la-passos');
  passos.forEach(([titulo, texto, extra]) => {
    const li = el('li');
    li.append(el('strong', undefined, titulo), el('p', undefined, texto));
    if (extra) li.appendChild(extra);
    ol.appendChild(li);
  });
  corpo.appendChild(ol);

  const detalhes = el('details', 'la-worker');
  detalhes.appendChild(el('summary', undefined, 'Código do Worker'));
  detalhes.appendChild(codigo(CODIGO_WORKER, 'Copiar código', 'Código do Worker copiado — cole em "Edit code"'));
  const copiarDireto = buildBotao('Copiar o código do Worker', { variante: 'primario', icone: ICONES_CONTATO.copiar });
  copiarDireto.addEventListener('click', () => copiar(CODIGO_WORKER, 'Código do Worker copiado — cole em "Edit code"'));
  corpo.append(copiarDireto, detalhes);
  corpo.appendChild(el('p', 'la-nota', 'O plano grátis da Cloudflare aguenta centenas de leads por dia. A caixa só guarda o que ainda não foi buscado: o Iris apaga de lá o que importou.'));
  return c;
}
