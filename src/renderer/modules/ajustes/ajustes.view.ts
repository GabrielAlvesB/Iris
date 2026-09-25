import { FORMATOS_ASSINATURA, type AssinaturaRelatorio, type ModuloInicial } from '../../../shared/types/ajustes.types.js';
import { MODULOS, rotuloCompleto } from '../../../shared/types/modulos.types.js';
import * as ajustesState from './ajustes.state.js';
import type { AjustesViewState } from './ajustes.state.js';
import * as exportacaoView from '../exportacao/exportacao.view.js';
import { abrirTutorial, consumirSecaoAjustes, type GuiaId } from '../../core/navegacao.js';
import {
  ICONE_ATUALIZACAO,
  abrirPaginaDaRelease,
  atualizarAgora,
  getEstadoAtualizacao,
  onAtualizacao,
  verificarAgora,
} from '../../core/atualizacao.js';
import type { EstadoAtualizacao } from '../../../shared/types/atualizacao.types.js';
import { buildAssinatura } from '../relatorios/relatorios.documento.js';
import {
  assinarSidebar,
  definirLargura,
  definirModoCompacto,
  obterEstadoSidebar,
  LARGURA_PADRAO,
  LARGURA_MINIMA,
  LARGURA_MAXIMA,
} from '../../core/sidebar.js';
import { ICONES, buildAviso, buildBotao, buildCabecalho, buildSelo, svg, type Tom } from '../../ui/pagina.js';

type Secao = 'n8n' | 'github' | 'credenciais' | 'preferencias' | 'relatorios' | 'atualizacoes' | 'backup';

let secaoAtiva: Secao = 'n8n';
let containerAtual: HTMLElement | null = null;
/** Assinatura do progresso da atualização, viva só com a seção aberta. */
let pararAtualizacao: (() => void) | null = null;

interface ItemNav {
  id: Secao;
  rotulo: string;
  icone: string;
  estado?: (s: AjustesViewState) => { texto: string; tom: Tom };
}

const NAV: ItemNav[] = [
  {
    id: 'n8n',
    rotulo: 'n8n',
    icone: ICONES.n8n,
    estado: (s) =>
      s.n8n.baseUrl && s.n8n.temApiKey ? { texto: 'configurado', tom: 'ok' } : { texto: 'pendente', tom: 'atencao' },
  },
  {
    id: 'github',
    rotulo: 'GitHub',
    icone: ICONES.github,
    estado: (s) => (s.github.temToken ? { texto: 'configurado', tom: 'ok' } : { texto: 'pendente', tom: 'atencao' }),
  },
  {
    id: 'credenciais',
    rotulo: 'Segurança',
    icone: ICONES.escudo,
    estado: (s) =>
      s.ajustes.criptografiaDisponivel ? { texto: 'cofre ativo', tom: 'ok' } : { texto: 'sem cofre', tom: 'erro' },
  },
  { id: 'preferencias', rotulo: 'Preferências', icone: ICONES.preferencias },
  {
    id: 'relatorios',
    rotulo: 'Relatórios',
    icone: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
    estado: (s) => (s.ajustes.assinatura.nome.trim() ? { texto: 'assinatura definida', tom: 'ok' } : { texto: 'sem assinatura', tom: 'neutro' }),
  },
  {
    id: 'atualizacoes',
    rotulo: 'Atualizações',
    icone: ICONE_ATUALIZACAO,
    estado: () => {
      const e = getEstadoAtualizacao();
      if (e?.nova && e.situacao !== 'em-dia') return { texto: `versão ${e.nova.versao} disponível`, tom: 'atencao' };
      return { texto: 'em dia', tom: 'ok' };
    },
  },
  { id: 'backup', rotulo: 'Backup', icone: ICONES.backup },
];

function rerender(): void {
  const state = ajustesState.getCurrentState();
  if (containerAtual && state) render(containerAtual, state);
}

function mensagemDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------- Peças de formulário ----------

function buildPainel(titulo: string, descricao: string, icone: string, guia?: GuiaId): HTMLElement {
  const painel = document.createElement('section');
  painel.className = 'aj-painel';

  const topo = document.createElement('header');
  topo.className = 'aj-painel-topo';

  const marca = document.createElement('div');
  marca.className = 'aj-painel-icone';
  marca.innerHTML = svg(icone, 18);
  topo.appendChild(marca);

  const textos = document.createElement('div');
  textos.className = 'aj-painel-textos';
  const h2 = document.createElement('h2');
  h2.textContent = titulo;
  textos.appendChild(h2);
  const p = document.createElement('p');
  p.textContent = descricao;
  textos.appendChild(p);
  topo.appendChild(textos);

  if (guia) {
    const ajuda = buildBotao('Como configurar', { icone: ICONES.tutorial, variante: 'fantasma' });
    ajuda.addEventListener('click', () => abrirTutorial(guia));
    topo.appendChild(ajuda);
  }

  painel.appendChild(topo);
  return painel;
}

function buildCampo(rotulo: string, elemento: HTMLElement, dica?: string): HTMLElement {
  const campo = document.createElement('label');
  campo.className = 'aj-campo';

  const span = document.createElement('span');
  span.className = 'aj-campo-rotulo';
  span.textContent = rotulo;
  campo.appendChild(span);
  campo.appendChild(elemento);

  if (dica) {
    const d = document.createElement('span');
    d.className = 'aj-campo-dica';
    d.textContent = dica;
    campo.appendChild(d);
  }
  return campo;
}

function buildInput(tipo: string, valor: string, placeholder: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = tipo;
  input.className = 'aj-input';
  input.value = valor;
  input.placeholder = placeholder;
  return input;
}

/** Linha com interruptor; o valor fica na closure até o usuário salvar. */
function buildOpcao(titulo: string, descricao: string, inicial: boolean): { el: HTMLElement; valor: () => boolean } {
  let ligado = inicial;

  const linha = document.createElement('div');
  linha.className = 'aj-opcao';

  const textos = document.createElement('div');
  textos.className = 'aj-opcao-textos';
  const t = document.createElement('span');
  t.className = 'aj-opcao-titulo';
  t.textContent = titulo;
  textos.appendChild(t);
  const d = document.createElement('span');
  d.className = 'aj-opcao-descricao';
  d.textContent = descricao;
  textos.appendChild(d);
  linha.appendChild(textos);

  const interruptor = document.createElement('button');
  interruptor.type = 'button';
  interruptor.className = `pg-interruptor${ligado ? ' is-ligado' : ''}`;
  interruptor.setAttribute('role', 'switch');
  interruptor.setAttribute('aria-checked', String(ligado));
  interruptor.setAttribute('aria-label', titulo);
  interruptor.addEventListener('click', () => {
    ligado = !ligado;
    interruptor.classList.toggle('is-ligado', ligado);
    interruptor.setAttribute('aria-checked', String(ligado));
  });
  linha.appendChild(interruptor);

  return { el: linha, valor: () => ligado };
}

/** Linha de status abaixo das ações: mostra resultado de salvar/testar. */
function buildStatus(): { el: HTMLElement; mostrar: (texto: string, tom: Tom) => void } {
  const el = document.createElement('div');
  el.className = 'aj-status';
  return {
    el,
    mostrar(texto, tom) {
      el.innerHTML = '';
      el.appendChild(buildSelo(texto, tom));
    },
  };
}

// ---------- Seções ----------

function buildSecaoN8n(state: AjustesViewState): HTMLElement {
  const painel = buildPainel(
    'Conexão com o n8n',
    'O Iris consulta a API do seu n8n a partir do próprio app — nenhuma porta é aberta no seu computador.',
    ICONES.n8n,
    'n8n',
  );

  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo';

  const url = buildInput('text', state.n8n.baseUrl, 'http://localhost:5678');
  corpo.appendChild(buildCampo('URL base', url, 'O mesmo endereço que você abre no navegador, sem barra no final.'));

  const apiKey = buildInput('password', '', state.n8n.temApiKey ? '•••••••••••• (em branco mantém a atual)' : 'cole a API key aqui');
  corpo.appendChild(buildCampo('API key', apiKey, 'Gerada no n8n em Settings → n8n API.'));

  const intervalo = buildInput('number', String(state.n8n.pollIntervaloSeg), '120');
  intervalo.min = '15';
  corpo.appendChild(buildCampo('Atualizar a cada (segundos)', intervalo));

  const poll = buildOpcao('Atualizar em segundo plano', 'Mantém workflows e execuções atualizados mesmo com a tela fechada.', state.n8n.pollAtivo);
  corpo.appendChild(poll.el);

  const tls = buildOpcao('Aceitar certificado autoassinado', 'Só para n8n próprio com HTTPS sem certificado válido.', state.n8n.permitirTlsInseguro);
  corpo.appendChild(tls.el);

  const status = buildStatus();
  if (state.n8n.temApiKey) status.mostrar('API key guardada no cofre', 'ok');

  const dados = (apiKeyValor: string | undefined): Parameters<typeof ajustesState.salvarN8n>[0] => ({
    baseUrl: url.value,
    apiKey: apiKeyValor,
    pollAtivo: poll.valor(),
    pollIntervaloSeg: Number(intervalo.value) || 120,
    permitirTlsInseguro: tls.valor(),
  });

  const acoes = document.createElement('div');
  acoes.className = 'aj-acoes';

  const salvar = buildBotao('Salvar', { variante: 'primario', icone: ICONES.check });
  salvar.addEventListener('click', () => {
    salvar.disabled = true;
    // String vazia mantém a key atual: só mandamos quando o usuário digitou.
    void ajustesState
      .salvarN8n(dados(apiKey.value ? apiKey.value : undefined))
      .then(() => status.mostrar('Configuração salva', 'ok'))
      .catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'))
      .finally(() => {
        salvar.disabled = false;
      });
  });
  acoes.appendChild(salvar);

  const testar = buildBotao('Testar conexão', { icone: ICONES.atualizar });
  testar.addEventListener('click', () => {
    testar.disabled = true;
    status.mostrar('Testando…', 'neutro');
    void ajustesState
      .testarConexao()
      .then((mensagem) => status.mostrar(mensagem, 'ok'))
      .catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'))
      .finally(() => {
        testar.disabled = false;
      });
  });
  acoes.appendChild(testar);

  if (state.n8n.temApiKey) {
    const remover = buildBotao('Remover API key', { variante: 'fantasma' });
    remover.classList.add('is-perigo');
    remover.addEventListener('click', () => {
      void ajustesState.salvarN8n(dados('')).then(() => status.mostrar('API key removida', 'neutro'));
    });
    acoes.appendChild(remover);
  }

  corpo.appendChild(acoes);
  corpo.appendChild(status.el);
  painel.appendChild(corpo);
  return painel;
}

function buildSecaoGithub(state: AjustesViewState): HTMLElement {
  const painel = buildPainel(
    'Conexão com o GitHub',
    'Um token pessoal dá ao Iris permissão de leitura na sua conta, inclusive nos repositórios privados.',
    ICONES.github,
    'github',
  );

  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo';

  const token = buildInput('password', '', state.github.temToken ? '•••••••••••• (em branco mantém o atual)' : 'ghp_…');
  corpo.appendChild(buildCampo('Token pessoal', token, 'Crie em github.com/settings/tokens, modelo clássico, com a permissão "repo".'));

  const intervalo = buildInput('number', String(state.github.pollIntervaloSeg), '600');
  intervalo.min = '60';
  corpo.appendChild(buildCampo('Atualizar a cada (segundos)', intervalo));

  const poll = buildOpcao('Atualizar em segundo plano', 'Busca repositórios e commits periodicamente, mesmo com a tela fechada.', state.github.pollAtivo);
  corpo.appendChild(poll.el);

  const status = buildStatus();
  if (state.github.usuario) status.mostrar(`Última conexão como @${state.github.usuario}`, 'ok');
  else if (state.github.temToken) status.mostrar('Token guardado no cofre', 'ok');

  const acoes = document.createElement('div');
  acoes.className = 'aj-acoes';

  const salvar = buildBotao('Salvar', { variante: 'primario', icone: ICONES.check });
  salvar.addEventListener('click', () => {
    salvar.disabled = true;
    void ajustesState
      .salvarGithub({
        token: token.value ? token.value : undefined,
        pollAtivo: poll.valor(),
        pollIntervaloSeg: Number(intervalo.value) || 600,
      })
      .then(() => status.mostrar('Configuração salva', 'ok'))
      .catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'))
      .finally(() => {
        salvar.disabled = false;
      });
  });
  acoes.appendChild(salvar);

  const testar = buildBotao('Testar conexão', { icone: ICONES.atualizar });
  testar.addEventListener('click', () => {
    testar.disabled = true;
    status.mostrar('Testando…', 'neutro');
    void ajustesState
      .testarGithub()
      .then((mensagem) => status.mostrar(mensagem, 'ok'))
      .catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'))
      .finally(() => {
        testar.disabled = false;
      });
  });
  acoes.appendChild(testar);

  if (state.github.temToken) {
    const remover = buildBotao('Remover token', { variante: 'fantasma' });
    remover.classList.add('is-perigo');
    remover.addEventListener('click', () => {
      void ajustesState
        .salvarGithub({ token: '', pollAtivo: poll.valor(), pollIntervaloSeg: Number(intervalo.value) || 600 })
        .then(() => status.mostrar('Token removido', 'neutro'));
    });
    acoes.appendChild(remover);
  }

  corpo.appendChild(acoes);
  corpo.appendChild(status.el);
  painel.appendChild(corpo);
  return painel;
}

function buildSecaoCredenciais(state: AjustesViewState): HTMLElement {
  const painel = buildPainel(
    'Segurança das credenciais',
    'Como o Iris guarda a API key do n8n, o token do GitHub e as passphrases das chaves SSH.',
    ICONES.escudo,
  );

  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo';

  corpo.appendChild(
    state.ajustes.criptografiaDisponivel
      ? buildAviso('As credenciais ficam cifradas pelo cofre do Windows, atreladas ao seu usuário. Nem o próprio Iris as mostra de volta na tela.', 'ok')
      : buildAviso('Este sistema não oferece cofre de credenciais: elas seriam gravadas em texto puro. Prefira deixá-las em branco e informar quando precisar.', 'erro'),
  );

  const lista = document.createElement('ul');
  lista.className = 'aj-lista';
  [
    ['Fora do backup', 'Credenciais nunca entram no arquivo exportado. Ao restaurar em outro computador, informe-as de novo.'],
    ['Sem ida e volta', 'Os campos mostram apenas se existe algo salvo — o valor em si nunca volta para a tela.'],
    ['Removíveis a qualquer momento', 'Cada conexão tem um botão para apagar a credencial guardada.'],
  ].forEach(([titulo, texto]) => {
    const li = document.createElement('li');
    const icone = document.createElement('span');
    icone.className = 'aj-lista-icone';
    icone.innerHTML = svg(ICONES.cadeado, 14);
    li.appendChild(icone);
    const textos = document.createElement('div');
    const t = document.createElement('strong');
    t.textContent = titulo ?? '';
    textos.appendChild(t);
    const p = document.createElement('span');
    p.textContent = texto ?? '';
    textos.appendChild(p);
    li.appendChild(textos);
    lista.appendChild(li);
  });
  corpo.appendChild(lista);

  painel.appendChild(corpo);
  return painel;
}

const ICONE_ASSINATURA = '<path d="M3 17c3-3 5.5-8 7.5-8s-1 7 1 7 3-4 4.5-4 1 3 2.5 3H21"/><path d="M3 21h18"/>';

/**
 * Assinatura dos relatórios em PDF. Fica aqui, e não no gerador: mudar nome,
 * texto ou formato não exige mexer no código do documento. A prévia usa o
 * mesmo buildAssinatura do PDF.
 */
function buildSecaoRelatorios(state: AjustesViewState): HTMLElement {
  const painel = buildPainel(
    'Assinatura dos relatórios',
    'Identificação no fim de cada relatório exportado em PDF. Deixe o nome em branco para sair sem assinatura.',
    ICONE_ASSINATURA,
  );

  const rascunho: AssinaturaRelatorio = structuredClone(state.ajustes.assinatura);
  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo';

  const nome = buildInput('text', rascunho.nome, 'Ex.: Gabriel Alves Batista');
  corpo.appendChild(buildCampo('Nome', nome));

  const linhas = document.createElement('textarea');
  linhas.className = 'aj-input aj-textarea';
  linhas.rows = 3;
  linhas.value = rascunho.linhas.join('\n');
  linhas.placeholder = 'Direitos reservados\nTech';
  corpo.appendChild(buildCampo('Texto abaixo do nome', linhas, 'Uma linha por item (até 4) — cargo, empresa, aviso de direitos.'));

  const formatoCampo = document.createElement('div');
  formatoCampo.className = 'aj-campo';
  const formatoRotulo = document.createElement('span');
  formatoRotulo.className = 'aj-campo-rotulo';
  formatoRotulo.textContent = 'Formato';
  const formatos = document.createElement('div');
  formatos.className = 'md-pilulas';
  const desenharFormatos = (): void => {
    formatos.innerHTML = '';
    FORMATOS_ASSINATURA.forEach((f) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'md-pilula';
      btn.title = f.descricao;
      btn.classList.toggle('is-ativa', rascunho.formato === f.id);
      btn.setAttribute('aria-pressed', String(rascunho.formato === f.id));
      btn.textContent = f.rotulo;
      btn.addEventListener('click', () => {
        rascunho.formato = f.id;
        desenharFormatos();
        desenharPrevia();
      });
      formatos.appendChild(btn);
    });
  };
  formatoCampo.append(formatoRotulo, formatos);
  corpo.appendChild(formatoCampo);

  const data = buildOpcao('Data de emissão', 'Mostra "Emitido em …" junto da assinatura.', rascunho.mostrarData);
  data.el.querySelector('.pg-interruptor')?.addEventListener('click', () => {
    rascunho.mostrarData = data.valor();
    desenharPrevia();
  });
  corpo.appendChild(data.el);

  const previa = document.createElement('div');
  previa.className = 'aj-assinatura-previa';
  const desenharPrevia = (): void => {
    const bloco = buildAssinatura({ ...rascunho, nome: nome.value, linhas: linhas.value.split('\n').map((l) => l.trim()).filter(Boolean) });
    previa.replaceChildren(
      bloco ?? Object.assign(document.createElement('p'), { className: 'aj-campo-dica', textContent: 'Sem nome, os relatórios saem sem assinatura.' }),
    );
  };
  nome.addEventListener('input', desenharPrevia);
  linhas.addEventListener('input', desenharPrevia);
  desenharFormatos();
  desenharPrevia();
  corpo.appendChild(buildCampo('Prévia', previa));

  const status = buildStatus();
  const acoes = document.createElement('div');
  acoes.className = 'aj-acoes';
  const salvar = buildBotao('Salvar assinatura', { variante: 'primario' });
  salvar.addEventListener('click', () => {
    salvar.disabled = true;
    void ajustesState
      .setAssinatura({ ...rascunho, nome: nome.value, linhas: linhas.value.split('\n') })
      .then(() => status.mostrar('Salvo — vale para os próximos PDFs', 'ok'))
      .catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'))
      .finally(() => (salvar.disabled = false));
  });
  acoes.appendChild(salvar);
  corpo.append(acoes, status.el);

  painel.appendChild(corpo);
  return painel;
}

let unsubSidebar: (() => void) | null = null;

function buildSecaoPreferencias(state: AjustesViewState): HTMLElement {
  const painel = buildPainel('Preferências', 'Comportamento geral do Iris.', ICONES.preferencias);

  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo';

  const select = document.createElement('select');
  select.className = 'aj-input';
  MODULOS.forEach((modulo) => {
    const option = document.createElement('option');
    option.value = modulo.id;
    option.textContent = rotuloCompleto(modulo.id);
    if (state.ajustes.moduloInicial === modulo.id) option.selected = true;
    select.appendChild(option);
  });

  const status = buildStatus();
  select.addEventListener('change', () => {
    void ajustesState
      .setModuloInicial(select.value as ModuloInicial)
      .then(() => status.mostrar('Salvo — vale a partir da próxima abertura', 'ok'))
      .catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'));
  });

  corpo.appendChild(buildCampo('Abrir o Iris em', select, 'A área que aparece primeiro quando o app inicia.'));

  // Controles do Menu Lateral (Navbar)
  const estadoSidebar = obterEstadoSidebar();

  const opcaoCompacto = buildOpcao(
    'Menu lateral compacto (Clean)',
    'Exibe apenas os ícones para uma interface minimalista e maior foco no conteúdo (Atalho: Ctrl+B).',
    estadoSidebar.compacto,
  );
  const btnCompacto = opcaoCompacto.el.querySelector<HTMLButtonElement>('.pg-interruptor');
  btnCompacto?.addEventListener('click', () => {
    definirModoCompacto(opcaoCompacto.valor());
  });
  corpo.appendChild(opcaoCompacto.el);

  const sliderRow = document.createElement('div');
  sliderRow.className = 'aj-slider-row';

  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'aj-slider';
  range.min = String(LARGURA_MINIMA);
  range.max = String(LARGURA_MAXIMA);
  range.step = '2';
  range.value = String(estadoSidebar.largura);

  const valorSpan = document.createElement('span');
  valorSpan.className = 'aj-slider-valor';
  valorSpan.textContent = `${estadoSidebar.largura} px`;

  const resetBtn = buildBotao('Padrão (216px)', { variante: 'fantasma' });
  resetBtn.addEventListener('click', () => {
    definirLargura(LARGURA_PADRAO);
    range.value = String(LARGURA_PADRAO);
    valorSpan.textContent = `${LARGURA_PADRAO} px`;
  });

  range.addEventListener('input', () => {
    const valor = Number(range.value);
    valorSpan.textContent = `${valor} px`;
    definirLargura(valor);
  });

  sliderRow.append(range, valorSpan, resetBtn);
  corpo.appendChild(
    buildCampo(
      'Largura do menu lateral',
      sliderRow,
      'Ajuste o tamanho do menu. Você também pode arrastar a borda direita da barra lateral diretamente na tela.',
    ),
  );

  // Sincroniza em tempo real caso o usuário arraste ou alterne a barra lateral
  if (unsubSidebar) unsubSidebar();
  unsubSidebar = assinarSidebar((est) => {
    range.value = String(est.largura);
    valorSpan.textContent = `${est.largura} px`;
    if (btnCompacto) {
      btnCompacto.classList.toggle('is-ligado', est.compacto);
      btnCompacto.setAttribute('aria-checked', String(est.compacto));
    }
  });

  corpo.appendChild(status.el);

  painel.appendChild(corpo);
  return painel;
}

function formatarTamanho(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

function descreverSituacao(e: EstadoAtualizacao): { texto: string; tom: Tom } {
  switch (e.situacao) {
    case 'verificando':
      return { texto: 'Procurando versão nova…', tom: 'neutro' };
    case 'em-dia':
      return { texto: 'Você está na versão mais recente', tom: 'ok' };
    case 'disponivel':
      return { texto: `Versão ${e.nova?.versao ?? ''} disponível`, tom: 'atencao' };
    case 'baixando':
      return { texto: `Baixando… ${Math.round((e.progresso ?? 0) * 100)}%`, tom: 'neutro' };
    case 'instalando':
      return { texto: 'Instalando — o Iris vai fechar e abrir de novo', tom: 'neutro' };
    case 'erro':
      return { texto: e.erro ?? 'Falhou', tom: 'erro' };
    default:
      return { texto: 'Ainda não verificado', tom: 'neutro' };
  }
}

/** Redesenha só o corpo da seção: o progresso chega em dezenas de pushes. */
function desenharAtualizacao(corpo: HTMLElement, e: EstadoAtualizacao | null): void {
  corpo.replaceChildren();
  if (!e) {
    corpo.appendChild(buildSelo('Carregando…', 'neutro'));
    return;
  }

  const versao = document.createElement('p');
  versao.className = 'aj-atualizacao-versao';
  versao.textContent = `Versão instalada: ${e.versaoAtual}`;
  corpo.appendChild(versao);

  const situacao = descreverSituacao(e);
  const status = document.createElement('div');
  status.className = 'aj-status';
  status.appendChild(buildSelo(situacao.texto, situacao.tom));
  if (e.verificadoEm && e.situacao !== 'verificando') {
    const quando = document.createElement('span');
    quando.className = 'aj-campo-dica';
    quando.textContent = `verificado em ${new Date(e.verificadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;
    status.appendChild(quando);
  }
  corpo.appendChild(status);

  if (e.situacao === 'baixando') {
    const pct = Math.round((e.progresso ?? 0) * 100);
    const trilho = document.createElement('div');
    trilho.className = 'aj-progresso';
    trilho.setAttribute('role', 'progressbar');
    trilho.setAttribute('aria-valuenow', String(pct));
    const barra = document.createElement('span');
    barra.style.width = `${pct}%`;
    trilho.appendChild(barra);
    corpo.appendChild(trilho);
  }

  if (e.nova) {
    const nova = document.createElement('div');
    nova.className = 'aj-atualizacao-nova';
    const titulo = document.createElement('strong');
    const data = e.nova.publicadaEm ? new Date(e.nova.publicadaEm).toLocaleDateString('pt-BR') : '';
    titulo.textContent = [`Novidades da ${e.nova.versao}`, data, e.nova.tamanho ? formatarTamanho(e.nova.tamanho) : '']
      .filter(Boolean)
      .join(' · ');
    nova.appendChild(titulo);
    const notas = document.createElement('p');
    notas.className = 'aj-atualizacao-notas';
    notas.textContent = e.nova.notas.trim() || 'A release não trouxe descrição.';
    nova.appendChild(notas);
    corpo.appendChild(nova);
  }

  if (e.modo !== 'instalado' && e.nova) {
    corpo.appendChild(
      buildAviso(
        e.modo === 'portatil'
          ? 'Esta é a versão portátil (.zip): ela não se substitui sozinha. Baixe o .zip novo na página da release, ou use o instalador para receber as próximas automaticamente.'
          : 'Rodando pelo código-fonte (npm run dev): atualize com git pull.',
        'neutro',
      ),
    );
  }

  const acoes = document.createElement('div');
  acoes.className = 'aj-acoes';
  const ocupado = e.situacao === 'verificando' || e.situacao === 'baixando' || e.situacao === 'instalando';
  const falhou = (error: unknown): void => desenharAtualizacao(corpo, { ...e, situacao: 'erro', erro: mensagemDe(error) });

  if (e.nova && e.modo === 'instalado') {
    const atualizar = buildBotao(e.situacao === 'erro' ? 'Tentar de novo' : 'Atualizar agora', {
      variante: 'primario',
      icone: ICONE_ATUALIZACAO,
    });
    atualizar.disabled = ocupado;
    atualizar.addEventListener('click', () => void atualizarAgora().catch(falhou));
    acoes.appendChild(atualizar);
  }
  if (e.nova && e.modo !== 'instalado') {
    const pagina = buildBotao('Abrir página do download', { variante: 'primario', icone: ICONES.externo });
    pagina.addEventListener('click', () => void abrirPaginaDaRelease().catch(falhou));
    acoes.appendChild(pagina);
  }
  const verificar = buildBotao('Verificar agora', { icone: ICONES.atualizar });
  verificar.disabled = ocupado;
  verificar.addEventListener('click', () => void verificarAgora().catch(falhou));
  acoes.appendChild(verificar);
  corpo.appendChild(acoes);
}

function buildSecaoAtualizacoes(): HTMLElement {
  const painel = buildPainel(
    'Atualizações',
    'O Iris procura versão nova no GitHub ao abrir e a cada 6 horas. Atualizar baixa o instalador, confere o arquivo e reinstala por cima — os dados continuam onde estão.',
    ICONE_ATUALIZACAO,
  );
  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo';
  desenharAtualizacao(corpo, getEstadoAtualizacao());
  pararAtualizacao?.();
  pararAtualizacao = onAtualizacao((e) => desenharAtualizacao(corpo, e));
  painel.appendChild(corpo);
  return painel;
}

function buildSecaoBackup(): HTMLElement {
  const painel = buildPainel(
    'Backup e restauração',
    'Exporte todos os dados do Iris para um arquivo JSON, ou restaure um backup anterior.',
    ICONES.backup,
  );

  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo aj-backup';
  // Reaproveitado sem alteração: o módulo de exportação já é autocontido.
  exportacaoView.render(corpo);
  painel.appendChild(corpo);
  return painel;
}

// ---------- Tela ----------

function buildNav(state: AjustesViewState): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'aj-nav';

  NAV.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = `aj-nav-item${secaoAtiva === item.id ? ' is-ativo' : ''}`;

    const icone = document.createElement('span');
    icone.className = 'aj-nav-icone';
    icone.innerHTML = svg(item.icone, 16);
    btn.appendChild(icone);

    const rotulo = document.createElement('span');
    rotulo.className = 'aj-nav-rotulo';
    rotulo.textContent = item.rotulo;
    btn.appendChild(rotulo);

    if (item.estado) {
      const { texto, tom } = item.estado(state);
      const ponto = document.createElement('span');
      ponto.className = `aj-nav-ponto is-${tom}`;
      ponto.title = texto;
      btn.appendChild(ponto);
    }

    btn.addEventListener('click', () => {
      if (secaoAtiva === item.id) return;
      // A seção de backup mantém uma referência de status; soltar antes de trocar.
      if (secaoAtiva === 'backup') exportacaoView.destroy();
      pararAtualizacao?.();
      pararAtualizacao = null;
      secaoAtiva = item.id;
      rerender();
    });
    nav.appendChild(btn);
  });

  return nav;
}

export function render(container: HTMLElement, state: AjustesViewState): void {
  containerAtual = container;
  // Outro módulo pode ter pedido uma seção (ex.: Relatórios → assinatura).
  const pedida = consumirSecaoAjustes();
  if (pedida && NAV.some((n) => n.id === pedida)) secaoAtiva = pedida as Secao;
  container.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'pg-view aj-view';

  view.appendChild(
    buildCabecalho({
      icone: ICONES.ajustes,
      titulo: 'Ajustes',
      subtitulo: 'Conexões, segurança, preferências, relatórios, atualizações e backup',
    }),
  );

  const layout = document.createElement('div');
  layout.className = 'aj-layout';
  layout.appendChild(buildNav(state));

  const conteudo = document.createElement('div');
  conteudo.className = 'pg-rolagem aj-conteudo';

  const secoes: Record<Secao, () => HTMLElement> = {
    n8n: () => buildSecaoN8n(state),
    github: () => buildSecaoGithub(state),
    credenciais: () => buildSecaoCredenciais(state),
    preferencias: () => buildSecaoPreferencias(state),
    relatorios: () => buildSecaoRelatorios(state),
    atualizacoes: () => buildSecaoAtualizacoes(),
    backup: () => buildSecaoBackup(),
  };
  conteudo.appendChild(secoes[secaoAtiva]());

  layout.appendChild(conteudo);
  view.appendChild(layout);
  container.appendChild(view);
}

export function destroy(): void {
  if (unsubSidebar) {
    unsubSidebar();
    unsubSidebar = null;
  }
  // O statusEl do módulo de exportação sobreviveria ao DOM destruído.
  exportacaoView.destroy();
  pararAtualizacao?.();
  pararAtualizacao = null;
  containerAtual = null;
}
