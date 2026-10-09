import type { OrigemEventoWa } from '../../../shared/types/whatsapp.eventos.js';
import { FLUXOS_WA, type TipoFluxoWa } from '../../../shared/types/whatsapp.n8n.js';
import {
  PROVEDORES_WHATSAPP,
  type AbrirWhatsappEm,
  VERSAO_API_META_PADRAO,
  type EnderecoWa,
  type ProvedorWa,
  type ResultadoTeste,
  type SegredoWa,
  type StatusWhatsapp,
  type ViaWebhookWa,
} from '../../../shared/types/whatsapp.types.js';
import { abrirApiLeads, abrirAjustes } from '../../core/navegacao.js';
import { interruptor, pilulas } from '../../ui/campos.js';
import { mensagemDeErro, openConfirmModal } from '../../ui/modal.js';
import { buildBotao, buildSelo } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { campoLinha, cartao, resultado } from '../api-leads/api-leads.pecas.js';
import { ICONES_CONTATO, el } from '../contatos/contatos.ui.js';
import { ICONES_WA } from './whatsapp.ui.js';
import * as whatsappState from './whatsapp.state.js';
import type { CtxWa } from './whatsapp.view.js';
import { COFRE, DO_SISTEMA, NO_LINUX } from '../../ui/plataforma.js';

/**
 * Conexão: por qual caminho as mensagens saem (com o teste de cada um), por
 * onde as respostas chegam (os endereços exatos para colar em cada lugar), os
 * fluxos prontos do n8n e os limites que protegem o número.
 *
 * Credencial digitada vai direto para o cofre do main; a tela só sabe se
 * existe e os 4 últimos caracteres. A chave do WhatsApp e os endereços com ela
 * são copiados pelo main.
 */

const testes = new Map<string, ResultadoTeste>();
let enderecos: EnderecoWa[] | null = null;
let carregandoEnderecos = false;
let previaFluxo: { tipo: TipoFluxoWa; texto: string } | null = null;
let via: ViaWebhookWa = 'local';

export function soltarConexao(): void {
  enderecos = null;
  previaFluxo = null;
}

function falhou(e: unknown): void {
  mostrarToast(mensagemDeErro(e), [], 6000);
}

async function carregarEnderecos(ctx: CtxWa): Promise<void> {
  if (carregandoEnderecos) return;
  carregandoEnderecos = true;
  try {
    const r = await window.irisAPI.whatsapp.enderecos();
    if (r.ok) {
      enderecos = r.data;
      ctx.redesenhar();
    }
  } finally {
    carregandoEnderecos = false;
  }
}

async function atualizarStatus(ctx: CtxWa, s?: StatusWhatsapp): Promise<void> {
  if (s) whatsappState.definirStatus(s);
  else await whatsappState.carregarStatus();
  enderecos = null;
  ctx.redesenhar();
}

function entrada(valor: string, placeholder: string, tipo = 'text'): HTMLInputElement {
  const i = el('input', 'ct-input');
  i.type = tipo;
  i.value = valor;
  i.placeholder = placeholder;
  return i;
}

/** Campo de credencial: vazio mantém a salva; o olho só mostra o que está sendo digitado. */
function campoSegredo(rotulo: string, qual: SegredoWa, temChave: boolean, final: string): { el: HTMLElement; input: HTMLInputElement } {
  const input = entrada('', temChave ? `Salva (termina em ${final}) — digite para trocar` : 'Cole aqui', 'password');
  input.autocomplete = 'off';
  input.dataset.segredo = qual;
  const linha = el('div', 'wa-segredo');
  const olho = el('button', 'ct-icone-btn');
  olho.type = 'button';
  olho.title = 'Mostrar o que está digitado';
  olho.setAttribute('aria-label', 'Mostrar o que está digitado');
  olho.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES_CONTATO.olho}</svg>`;
  olho.addEventListener('click', () => (input.type = input.type === 'password' ? 'text' : 'password'));
  linha.append(input, olho);
  return { el: campoLinha(rotulo, linha, temChave ? `Guardada no ${COFRE}. Fica fora do backup.` : undefined), input };
}

async function salvarSegredos(inputs: HTMLInputElement[]): Promise<StatusWhatsapp | undefined> {
  let ultimo: StatusWhatsapp | undefined;
  for (const i of inputs) {
    if (!i.value.trim()) continue;
    const r = await window.irisAPI.whatsapp.definirSegredo(i.dataset.segredo as SegredoWa, i.value.trim());
    if (!r.ok) throw new Error(r.error);
    ultimo = r.data;
  }
  return ultimo;
}

function botaoTestar(ctx: CtxWa, provedor: ProvedorWa): HTMLButtonElement {
  const b = buildBotao('Testar', { variante: 'secundario', icone: ICONES_WA.um });
  b.addEventListener('click', () => {
    b.disabled = true;
    void window.irisAPI.whatsapp
      .testar(provedor)
      .then((r) => {
        if (r.ok) testes.set(provedor, r.data);
        else falhou(r.error);
        ctx.redesenhar();
      })
      .finally(() => (b.disabled = false));
  });
  return b;
}

function seloSituacao(s: StatusWhatsapp | null, p: ProvedorWa): HTMLElement {
  const sit = s?.provedores[p];
  if (p === 'link') return buildSelo('Sempre pronto', 'ok');
  return sit?.configurado ? buildSelo('Configurado', 'ok') : buildSelo('Falta configurar', 'neutro');
}

// ---------- Caminho padrão ----------

function buildPadrao(ctx: CtxWa, s: StatusWhatsapp | null): HTMLElement {
  const { cartao: c, corpo } = cartao('wa-padrao', ICONES_WA.enviar, 'Caminho padrão', 'O que a conversa usa quando você não escolhe outro. Só aparecem para escolher, na hora de enviar, os caminhos já configurados.');
  const grade = el('div', 'wa-caminhos');
  PROVEDORES_WHATSAPP.forEach((p) => {
    const pronto = p.id === 'link' || s?.provedores[p.id]?.configurado;
    const b = el('button', `wa-caminho${ctx.wa.config.provedor === p.id ? ' is-ativo' : ''}`);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(ctx.wa.config.provedor === p.id));
    const cab = el('span', 'wa-caminho-cab');
    cab.append(el('strong', undefined, p.rotulo), seloSituacao(s, p.id));
    b.append(cab, el('span', 'wa-caminho-texto', p.descricao));
    if (!pronto) b.appendChild(el('span', 'wa-caminho-falta', s?.provedores[p.id]?.falta ?? 'Configure abaixo.'));
    b.addEventListener('click', () => {
      if (ctx.wa.config.provedor === p.id) return;
      void whatsappState.salvarConfig({ provedor: p.id }).catch(ctx.falhou);
    });
    grade.appendChild(b);
  });
  corpo.appendChild(grade);
  return c;
}

// ---------- Cada provedor ----------

function acoesProvedor(ctx: CtxWa, provedor: ProvedorWa, salvar: () => Promise<void>): HTMLElement {
  const acoes = el('div', 'wa-modelo-acoes');
  const botao = buildBotao('Salvar', { variante: 'primario' });
  botao.addEventListener('click', () => {
    botao.disabled = true;
    testes.delete(provedor);
    void salvar()
      .then(() => mostrarToast('Salvo.', [], 2000))
      .catch(ctx.falhou)
      .finally(() => (botao.disabled = false));
  });
  acoes.append(botao, botaoTestar(ctx, provedor));
  return acoes;
}

function blocoTeste(provedor: string): HTMLElement[] {
  const r = resultado(testes.get(provedor) ?? null);
  return r ? [r] : [];
}

function buildMeta(ctx: CtxWa, s: StatusWhatsapp | null): HTMLElement {
  const cfg = ctx.wa.config.meta;
  const sit = s?.provedores.meta;
  const { cartao: c, corpo, cab } = cartao('wa-meta', ICONES_WA.whatsapp, 'API oficial (Meta)', 'WhatsApp Business Platform, Cloud API. No painel da Meta: WhatsApp › Configuração da API.');
  cab.appendChild(seloSituacao(s, 'meta'));
  const id = entrada(cfg.phoneNumberId, 'Ex.: 123456789012345');
  const waba = entrada(cfg.wabaId, 'Ex.: 102938475610293');
  const versao = entrada(cfg.versaoApi, VERSAO_API_META_PADRAO);
  const token = campoSegredo('Token de acesso permanente', 'meta.token', Boolean(sit?.temChave), sit?.finalChave ?? '');
  const segredo = campoSegredo('Chave secreta do app (opcional)', 'meta.appSecret', Boolean(s?.temSegredoApp), '');
  const grade = el('div', 'wa-grade2');
  grade.append(
    campoLinha('Phone Number ID', id, 'O número de identificação do telefone (não é o telefone).'),
    campoLinha('ID da conta (WABA)', waba, 'Para listar os templates aprovados.'),
    token.el,
    campoLinha('Versão da API', versao, 'Mude só se a Meta pedir.'),
  );
  corpo.append(
    grade,
    el('p', 'cf-dica', 'Use o token de um usuário do sistema (Business Settings › Usuários do sistema): o temporário do painel vence em 24 h. Fora da janela de 24 h desde a última mensagem do contato, só templates aprovados iniciam conversa — ligue um a cada modelo em Modelos.'),
    segredo.el,
    acoesProvedor(ctx, 'meta', async () => {
      await whatsappState.salvarConfig({ meta: { phoneNumberId: id.value, wabaId: waba.value, versaoApi: versao.value } });
      await atualizarStatus(ctx, await salvarSegredos([token.input, segredo.input]));
    }),
    ...blocoTeste('meta'),
  );
  return c;
}

function buildServidorProprio(ctx: CtxWa, s: StatusWhatsapp | null, provedor: 'evolution' | 'waha'): HTMLElement {
  const evo = provedor === 'evolution';
  const cfg = evo ? ctx.wa.config.evolution : ctx.wa.config.waha;
  const sit = s?.provedores[provedor];
  const { cartao: c, corpo, cab } = cartao(
    `wa-${provedor}`,
    ICONES_CONTATO.servidor,
    evo ? 'Evolution API' : 'WAHA',
    evo ? 'Servidor que você hospeda, ligado ao seu WhatsApp por QR code (v2; a v1 também funciona).' : 'WhatsApp HTTP API, hospedado por você e ligado por QR code.',
  );
  cab.appendChild(seloSituacao(s, provedor));
  const base = entrada(cfg.baseUrl, evo ? 'https://evolution.seudominio.com' : 'http://localhost:3000', 'url');
  const nome = entrada(evo ? ctx.wa.config.evolution.instancia : ctx.wa.config.waha.sessao, evo ? 'Nome da instância' : 'default');
  const chave = campoSegredo(evo ? 'apikey' : 'apikey (se o WAHA tiver)', evo ? 'evolution.apikey' : 'waha.apikey', Boolean(sit?.temChave), sit?.finalChave ?? '');
  const grade = el('div', 'wa-grade2');
  grade.append(campoLinha('Endereço', base), campoLinha(evo ? 'Instância' : 'Sessão', nome), chave.el);
  corpo.append(
    grade,
    el('p', 'cf-aviso is-bloco', 'Caminho não oficial: o WhatsApp pode bloquear números que mandam para quem não os conhece ou em grande volume. Use os limites de envio, mais abaixo.'),
    acoesProvedor(ctx, provedor, async () => {
      await whatsappState.salvarConfig(evo ? { evolution: { baseUrl: base.value, instancia: nome.value } } : { waha: { baseUrl: base.value, sessao: nome.value } });
      await atualizarStatus(ctx, await salvarSegredos([chave.input]));
    }),
    ...blocoTeste(provedor),
  );

  // Ligar o webhook pela API: o Iris manda o endereço certo, com a chave.
  const webhook = el('div', 'wa-webhook');
  webhook.appendChild(el('strong', undefined, 'Receber respostas e confirmações'));
  webhook.appendChild(el('p', 'cf-dica', `O Iris configura o webhook ${evo ? 'da instância' : 'da sessão'} para avisar mensagens recebidas e "entregue/lida".`));
  const viaSel = el('select', 'wa-composer-select');
  viaSel.setAttribute('aria-label', `De onde ${evo ? 'a Evolution' : 'o WAHA'} chama o Iris`);
  (
    [
      ['local', 'Roda neste PC'],
      ['docker', 'Roda em Docker neste PC'],
      ['rede', 'Outro aparelho da rede'],
      ['nuvem', 'Num servidor na internet (pela caixa na nuvem)'],
    ] as Array<[ViaWebhookWa, string]>
  ).forEach(([v, r]) => viaSel.appendChild(Object.assign(el('option'), { value: v, textContent: r })));
  viaSel.value = via;
  viaSel.addEventListener('change', () => {
    via = viaSel.value as ViaWebhookWa;
    ctx.redesenhar();
  });
  const ligar = buildBotao('Ligar o webhook', { variante: 'secundario', icone: ICONES_WA.sincronizar });
  const endereco = enderecos?.find((e) => e.origem === provedor && e.via === via);
  ligar.disabled = !sit?.configurado || !endereco?.disponivel;
  ligar.title = !sit?.configurado ? 'Configure e salve primeiro.' : (endereco?.falta ?? '');
  ligar.addEventListener('click', () => {
    ligar.disabled = true;
    void window.irisAPI.whatsapp
      .configurarWebhook(provedor, via)
      .then((r) => {
        if (r.ok) testes.set(`${provedor}-webhook`, r.data);
        else falhou(r.error);
        ctx.redesenhar();
      })
      .finally(() => (ligar.disabled = false));
  });
  const linha = el('div', 'wa-modelo-acoes');
  linha.append(viaSel, ligar);
  webhook.appendChild(linha);
  if (endereco?.falta) webhook.appendChild(el('p', 'cf-aviso', endereco.falta));
  webhook.append(...blocoTeste(`${provedor}-webhook`));
  corpo.appendChild(webhook);
  return c;
}

function buildN8n(ctx: CtxWa, s: StatusWhatsapp | null): HTMLElement {
  const { cartao: c, corpo, cab } = cartao('wa-n8n', ICONES_CONTATO.api, 'Pelo n8n', 'O Iris chama um fluxo do n8n, que envia pelo nó de WhatsApp de lá. Os fluxos prontos já conferem a chave do Iris.');
  cab.appendChild(seloSituacao(s, 'n8n'));
  if (!s?.n8n.baseUrl) {
    corpo.appendChild(el('p', 'cf-dica', 'Primeiro, configure o endereço e a API key do n8n em Ajustes › n8n.'));
    const ir = buildBotao('Abrir Ajustes › n8n', { variante: 'secundario' });
    ir.addEventListener('click', () => abrirAjustes('n8n'));
    corpo.appendChild(ir);
    return c;
  }
  if (!s.webhook.temChave) corpo.appendChild(el('p', 'cf-aviso is-bloco', 'Gere a chave do WhatsApp (em Recebimento, abaixo): os fluxos do n8n usam ela para recusar pedidos de fora.'));
  const caminho = entrada(ctx.wa.config.n8n.caminhoEnviar, 'iris-whatsapp-enviar');
  corpo.append(campoLinha('Caminho do webhook de envio', caminho, `${s.n8n.baseUrl}/webhook/${ctx.wa.config.n8n.caminhoEnviar}`));
  corpo.appendChild(
    acoesProvedor(ctx, 'n8n', async () => {
      await whatsappState.salvarConfig({ n8n: { caminhoEnviar: caminho.value } });
      await atualizarStatus(ctx);
    }),
  );
  corpo.append(...blocoTeste('n8n'));

  const fluxos = el('div', 'wa-fluxos');
  FLUXOS_WA.forEach((f) => {
    const item = el('div', 'wa-fluxo');
    const t = el('div', 'ct-mini-textos');
    t.append(el('strong', undefined, f.rotulo), el('span', undefined, f.explica));
    const criar = buildBotao('Criar no n8n', { variante: 'secundario', titulo: 'Cria o fluxo pela API do n8n (desligado: ative lá depois de escolher a credencial)' });
    criar.disabled = !s.n8n.temApiKey || !s.webhook.temChave;
    criar.addEventListener('click', () => {
      criar.disabled = true;
      void window.irisAPI.whatsapp
        .criarFluxoN8n(f.id)
        .then((r) => {
          if (!r.ok) return falhou(r.error);
          mostrarToast(`Fluxo "${r.data.nome}" criado (desligado).`, [{ rotulo: 'Abrir no n8n', fazer: () => window.irisAPI.system.openExternalLink(r.data.link) }], 7000);
        })
        .finally(() => (criar.disabled = false));
    });
    const copiar = buildBotao('Copiar JSON', { variante: 'fantasma', titulo: 'Para colar no editor do n8n (Ctrl+V)' });
    copiar.disabled = !s.webhook.temChave;
    copiar.addEventListener('click', () =>
      void window.irisAPI.whatsapp.copiarFluxoN8n(f.id).then((r) => (r.ok ? mostrarToast('Fluxo copiado — cole no editor do n8n com Ctrl+V.', [], 3500) : falhou(r.error))),
    );
    const ver = buildBotao(previaFluxo?.tipo === f.id ? 'Esconder' : 'Ver', { variante: 'fantasma' });
    ver.disabled = !s.webhook.temChave;
    ver.addEventListener('click', () => {
      if (previaFluxo?.tipo === f.id) {
        previaFluxo = null;
        ctx.redesenhar();
        return;
      }
      void window.irisAPI.whatsapp.previaFluxoN8n(f.id).then((r) => {
        if (!r.ok) return falhou(r.error);
        previaFluxo = { tipo: f.id, texto: r.data };
        ctx.redesenhar();
      });
    });
    const botoes = el('div', 'wa-fluxo-botoes');
    botoes.append(ver, copiar, criar);
    item.append(t, botoes);
    fluxos.appendChild(item);
    if (previaFluxo?.tipo === f.id) {
      const pre = el('pre', 'la-resposta wa-fluxo-json');
      pre.textContent = previaFluxo.texto;
      fluxos.appendChild(pre);
    }
  });
  if (!s.n8n.temApiKey) fluxos.appendChild(el('p', 'cf-dica', 'Sem a API key do n8n, use "Copiar JSON" e cole no editor (Ctrl+V).'));
  corpo.appendChild(fluxos);
  return c;
}

function buildLink(ctx: CtxWa, s: StatusWhatsapp | null): HTMLElement {
  const { cartao: c, corpo, cab } = cartao('wa-link', ICONES_WA.externo, 'Abrir no WhatsApp', 'Sem configuração: abre a conversa no WhatsApp do computador (ou no WhatsApp Web), com o texto já escrito.');
  cab.appendChild(buildSelo('Sempre pronto', 'ok'));
  const app = s?.appWhatsapp ?? '';
  // Sem aplicativo, a escolha não muda nada: vai pelo Web de qualquer jeito.
  const escolha: AbrirWhatsappEm = app ? ctx.wa.config.link.abrirEm : 'web';
  corpo.appendChild(
    campoLinha(
      'Abrir em',
      pilulas<AbrirWhatsappEm>(
        [
          { id: 'app', rotulo: app ? `${app} (aplicativo do PC)` : 'Aplicativo do PC' },
          { id: 'web', rotulo: 'WhatsApp Web (navegador)' },
        ],
        () => escolha,
        (v) => {
          if (v === 'app' && !app) {
            mostrarToast(
              NO_LINUX
                ? 'O WhatsApp não tem aplicativo oficial para Linux: use o WhatsApp Web.'
                : 'Nenhum WhatsApp instalado neste PC foi encontrado. Instale o WhatsApp (ou o WhatsApp Beta) pela Microsoft Store.',
              [],
              5000,
            );
            ctx.redesenhar();
            return;
          }
          testes.delete('link');
          void whatsappState.salvarConfig({ link: { abrirEm: v } }).catch(ctx.falhou);
        },
      ),
      app ? `Encontrado neste PC: ${app}.` : 'Nenhum WhatsApp instalado neste PC: abre o WhatsApp Web.',
    ),
  );
  corpo.appendChild(el('p', 'cf-dica', 'O Iris registra a mensagem como "aberta no WhatsApp": quem aperta Enter é você, lá — por isso não há confirmação de entrega por este caminho.'));
  const acoes = el('div', 'wa-modelo-acoes');
  acoes.appendChild(botaoTestar(ctx, 'link'));
  corpo.append(acoes, ...blocoTeste('link'));
  return c;
}

// ---------- Recebimento ----------

const ROTULO_ORIGEM: Record<OrigemEventoWa, string> = { meta: 'API oficial (Meta)', evolution: 'Evolution', waha: 'WAHA', iris: 'n8n ou outro (formato do Iris)' };
const ROTULO_VIA: Record<ViaWebhookWa, string> = { local: 'Neste PC', docker: 'Docker neste PC', rede: 'Rede local', nuvem: 'Caixa na nuvem' };

function buildRecebimento(ctx: CtxWa, s: StatusWhatsapp | null): HTMLElement {
  const { cartao: c, corpo } = cartao(
    'wa-receber',
    ICONES_CONTATO.caixa,
    'Recebimento',
    'Mensagens que chegam e as confirmações de entrega ("entregue", "lida") entram na conversa certa. Cada provedor chama um endereço do Iris com a chave do WhatsApp no caminho.',
  );
  const chave = el('div', 'wa-modelo-acoes');
  if (s?.webhook.temChave) {
    chave.appendChild(el('code', 'wa-chave', `wa_…${s.webhook.final}`));
    const copiar = buildBotao('Copiar a chave', { variante: 'secundario', icone: ICONES_WA.copiar, titulo: 'Para a variável CHAVE_WHATSAPP do Worker e o "Verify token" da Meta' });
    copiar.addEventListener('click', () => void window.irisAPI.whatsapp.copiarChaveWebhook().then((r) => (r.ok ? mostrarToast('Chave copiada.', [], 2500) : falhou(r.error))));
    const trocar = buildBotao('Gerar outra', { variante: 'fantasma' });
    trocar.addEventListener('click', () =>
      void openConfirmModal({ title: 'Gerar outra chave', message: 'Os webhooks e fluxos já configurados com a chave atual param de funcionar até você colar a nova em cada lugar.', confirmText: 'Gerar outra' }).then((ok) => {
        if (ok) void window.irisAPI.whatsapp.gerarChaveWebhook().then((r) => (r.ok ? atualizarStatus(ctx, r.data) : falhou(r.error)));
      }),
    );
    chave.append(copiar, trocar);
  } else {
    const gerar = buildBotao('Gerar a chave do WhatsApp', { variante: 'primario', icone: ICONES_CONTATO.chave });
    gerar.addEventListener('click', () => void window.irisAPI.whatsapp.gerarChaveWebhook().then((r) => (r.ok ? atualizarStatus(ctx, r.data) : falhou(r.error))));
    chave.appendChild(gerar);
  }
  corpo.appendChild(campoLinha('Chave do WhatsApp', chave, 'Vai no caminho dos endereços abaixo. Só copia pelo botão: ela não aparece inteira na tela.'));

  const situacao = el('div', 'wa-situacao');
  const servidor = s?.servidorLocal;
  situacao.append(
    linhaSituacao('Servidor local', servidor?.ouvindo ? buildSelo(`Ligado em ${servidor.endereco}`, 'ok') : buildSelo('Desligado', 'neutro'), () => abrirApiLeads('local')),
    linhaSituacao('Caixa na nuvem', s?.nuvem.url ? buildSelo(s.nuvem.ativo ? 'Configurada e buscando' : 'Configurada, busca desligada', s.nuvem.ativo ? 'ok' : 'atencao') : buildSelo('Não configurada', 'neutro'), () =>
      abrirApiLeads('nuvem'),
    ),
  );
  corpo.appendChild(situacao);

  if (!enderecos) void carregarEnderecos(ctx);
  const tabela = el('div', 'wa-enderecos');
  (['meta', 'evolution', 'waha', 'iris'] as OrigemEventoWa[]).forEach((origem) => {
    const grupo = el('div', 'wa-enderecos-grupo');
    grupo.appendChild(el('strong', undefined, ROTULO_ORIGEM[origem]));
    (enderecos ?? [])
      .filter((e) => e.origem === origem && (origem !== 'meta' || e.via === 'nuvem'))
      .forEach((e) => {
        const l = el('div', `wa-endereco${e.disponivel ? '' : ' is-indisponivel'}`);
        l.appendChild(el('span', 'wa-endereco-via', ROTULO_VIA[e.via]));
        l.appendChild(el('code', undefined, e.url || '—'));
        if (e.disponivel) {
          const b = el('button', 'ct-icone-btn');
          b.type = 'button';
          b.title = 'Copiar o endereço completo';
          b.setAttribute('aria-label', 'Copiar o endereço completo');
          b.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES_WA.copiar}</svg>`;
          b.addEventListener('click', () => void window.irisAPI.whatsapp.copiarEndereco(e.origem, e.via).then((r) => (r.ok ? mostrarToast('Endereço copiado.', [], 2500) : falhou(r.error))));
          l.appendChild(b);
        } else if (e.falta) l.title = e.falta;
        grupo.appendChild(l);
      });
    if (origem === 'meta')
      grupo.appendChild(
        el(
          'p',
          'cf-dica',
          'A Meta só chama endereço https público: use o da caixa na nuvem (ou o fluxo "Receber pela API oficial" do n8n). No painel da Meta › WhatsApp › Configuração › Webhook: cole o endereço, use a chave do WhatsApp como "Verify token" e assine o campo "messages". No Worker, crie as variáveis CHAVE_WHATSAPP (a chave) e META_APP_SECRET (opcional, confere a assinatura).',
        ),
      );
    tabela.appendChild(grupo);
  });
  corpo.appendChild(tabela);
  const worker = el('p', 'cf-dica');
  worker.append(document.createTextNode('A caixa na nuvem recebe o WhatsApp a partir da versão 2 do código do Worker. Se a sua é de antes, '));
  const link = el('button', 'ct-link', 'copie o código novo em API e n8n › Caixa na nuvem');
  link.type = 'button';
  link.addEventListener('click', () => abrirApiLeads('nuvem'));
  worker.append(link, document.createTextNode(' e cole no painel da Cloudflare.'));
  corpo.appendChild(worker);
  return c;
}

function linhaSituacao(rotulo: string, selo: HTMLElement, abrir: () => void): HTMLElement {
  const l = el('div', 'wa-situacao-linha');
  const ir = el('button', 'ct-link', 'Ajustar');
  ir.type = 'button';
  ir.addEventListener('click', abrir);
  l.append(el('span', 'cf-rotulo', rotulo), selo, ir);
  return l;
}

// ---------- Limites ----------

function buildLimites(ctx: CtxWa): HTMLElement {
  const e = ctx.wa.config.envio;
  const { cartao: c, corpo } = cartao('wa-limites', ICONES_WA.relogio, 'Limites de envio', 'Valem para o envio para vários: protegem o número de parecer robô (mais importante na Evolution e no WAHA).');
  const min = entrada(String(e.intervaloMinSeg), '30', 'number');
  const max = entrada(String(e.intervaloMaxSeg), '90', 'number');
  const limite = entrada(String(e.limiteDiario), '200', 'number');
  const de = entrada(e.horarioDe, '08:00', 'time');
  const ate = entrada(e.horarioAte, '20:00', 'time');
  const grade = el('div', 'wa-grade2');
  grade.append(
    campoLinha('Intervalo mínimo (segundos)', min),
    campoLinha('Intervalo máximo (segundos)', max, 'O próximo envio é sorteado entre os dois.'),
    campoLinha('Máximo por dia', limite, 'Conta todo envio direto do dia, inclusive os da conversa.'),
    campoLinha('Enviar entre', el('div', 'cf-par')),
  );
  grade.lastElementChild!.querySelector('.cf-par')!.append(de, el('span', 'cf-dica', 'e'), ate);
  const salvar = buildBotao('Salvar limites', { variante: 'primario' });
  salvar.addEventListener('click', () =>
    void whatsappState
      .salvarConfig({ envio: { intervaloMinSeg: Number(min.value), intervaloMaxSeg: Number(max.value), limiteDiario: Number(limite.value), horarioDe: de.value, horarioAte: ate.value } })
      .then(() => mostrarToast('Limites salvos.', [], 2000))
      .catch(ctx.falhou),
  );
  const outros = el('div', 'wa-interruptores');
  outros.append(
    interruptor('Avisar mensagem nova', `Notificação ${DO_SISTEMA}; o clique abre a conversa.`, ctx.wa.config.notificar, (v) => void whatsappState.salvarConfig({ notificar: v }).catch(ctx.falhou)),
    interruptor(
      'Aceitar certificado inválido',
      'Só para a sua Evolution/WAHA com certificado próprio (autoassinado). Nunca para a Meta.',
      ctx.wa.config.permitirTlsInseguro,
      (v) => void whatsappState.salvarConfig({ permitirTlsInseguro: v }).catch(ctx.falhou),
    ),
  );
  corpo.append(grade, salvar, outros);
  return c;
}

function buildEsquecer(ctx: CtxWa): HTMLElement {
  const b = buildBotao('Apagar as credenciais do WhatsApp', { variante: 'fantasma', icone: ICONES_WA.lixeira });
  b.addEventListener('click', () =>
    void openConfirmModal({ title: 'Apagar credenciais', message: 'Tira do cofre o token da Meta, as apikeys e a chave do WhatsApp. As conversas e os modelos ficam.', confirmText: 'Apagar' }).then((ok) => {
      if (ok) void window.irisAPI.whatsapp.removerCredenciais().then((r) => (r.ok ? atualizarStatus(ctx, r.data) : falhou(r.error)));
    }),
  );
  const l = el('div', 'wa-esquecer');
  l.appendChild(b);
  return l;
}

export function buildConexao(ctx: CtxWa): HTMLElement[] {
  const s = whatsappState.statusAtual();
  return [
    buildPadrao(ctx, s),
    buildMeta(ctx, s),
    buildServidorProprio(ctx, s, 'evolution'),
    buildServidorProprio(ctx, s, 'waha'),
    buildN8n(ctx, s),
    buildLink(ctx, s),
    buildRecebimento(ctx, s),
    buildLimites(ctx),
    buildEsquecer(ctx),
  ];
}

