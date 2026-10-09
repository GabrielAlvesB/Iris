import { FORMATOS_ASSINATURA, TEMAS, type AssinaturaRelatorio, type ModuloInicial, type PerfilUsuario } from '../../../shared/types/ajustes.types.js';
import { formatarCep, formatarDocumento, formatarTelefone, problemaDoDocumento } from '../../../shared/types/brasil.js';

/** Antes do NAV, que é montado ao carregar o módulo. */
const ICONE_PERFIL = '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>';
import { MODULOS, rotuloCompleto } from '../../../shared/types/modulos.types.js';
import * as ajustesState from './ajustes.state.js';
import type { AjustesViewState } from './ajustes.state.js';
import * as exportacaoView from '../exportacao/exportacao.view.js';
import { abrirTutorial, consumirSecaoAjustes, onSecaoAjustesSolicitada, type GuiaId } from '../../core/navegacao.js';
import {
  ICONE_ATUALIZACAO,
  abrirPaginaDaRelease,
  atualizarAgora,
  abrirEscolhaDeVersao,
  getEstadoAtualizacao,
  instalarDeArquivo,
  onAtualizacao,
  verificarAgora,
} from '../../core/atualizacao.js';
import type { EstadoAtualizacao } from '../../../shared/types/atualizacao.types.js';
import { buildAssinatura } from '../../ui/documento.js';
import { buildSecaoIa } from './ajustes.ia.js';
import { buildCadastroTags, contarEmpresas } from '../postagens/postagens.tags.js';
import { ICONE_ESCALA, buildCadastroEscalas } from '../postagens/postagens.escalas.js';
import { ICONE_EMPRESA, ICONES_POSTAGEM } from '../postagens/postagens.ui.js';
import { abrirHorariosPadrao } from '../postagens/postagens.agendar.js';
import * as videosState from '../postagens/videos/videos.state.js';
import { ICONE_IA } from '../../ui/ia.js';
import { assinarFixado, definirFixado, estaFixado } from '../../core/sidebar.js';
import { comAtalho, foiTrocado } from '../../core/atalhos.js';
import { onTemaMudou } from '../../core/tema.js';
import { CATALOGO_ATALHOS } from '../../core/atalhos.catalogo.js';
import { ICONE_TECLADO, buildSecaoAtalhos } from './ajustes.atalhos.js';
import { ICONES, buildAviso, buildBotao, buildCabecalho, buildSelo, svg, type Tom } from '../../ui/pagina.js';
import { COFRE } from '../../ui/plataforma.js';

const ICONE_APARENCIA = '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>';

type Secao =
  | 'perfil'
  | 'n8n'
  | 'github'
  | 'ia'
  | 'empresas'
  | 'escalas'
  | 'horarios'
  | 'credenciais'
  | 'aparencia'
  | 'preferencias'
  | 'atalhos'
  | 'relatorios'
  | 'atualizacoes'
  | 'backup';

let secaoAtiva: Secao = 'n8n';
/** A seção do último desenho, para saber se a rolagem deve ser mantida. */
let secaoDesenhada: Secao | null = null;
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
    id: 'perfil',
    rotulo: 'Seus dados',
    icone: ICONE_PERFIL,
    estado: (s) => (s.ajustes.perfil.nome.trim() ? { texto: 'preenchido', tom: 'ok' } : { texto: 'para os contratos', tom: 'neutro' }),
  },
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
    id: 'ia',
    rotulo: 'Inteligência artificial',
    icone: ICONE_IA,
    estado: (s) =>
      s.ia.provedores.some((p) => p.configurado) ? { texto: 'configurado', tom: 'ok' } : { texto: 'pendente', tom: 'atencao' },
  },
  {
    id: 'empresas',
    rotulo: 'Empresas e tags',
    icone: ICONE_EMPRESA,
    // O catálogo mora no state de Postagens; sem ele carregado, sem contagem.
    estado: () => {
      if (!videosState.getCurrentState()) return { texto: 'catálogo global', tom: 'neutro' };
      const n = contarEmpresas();
      return { texto: n === 1 ? '1 empresa' : `${n} empresas`, tom: n ? 'ok' : 'neutro' };
    },
  },
  {
    id: 'escalas',
    rotulo: 'Escalas de score',
    icone: ICONE_ESCALA,
    estado: () => {
      const n = videosState.getCurrentState()?.escalasScore.length;
      if (n === undefined) return { texto: 'faixas do score', tom: 'neutro' };
      return { texto: n === 1 ? '1 escala' : `${n} escalas`, tom: 'neutro' };
    },
  },
  {
    id: 'horarios',
    rotulo: 'Horários padrão',
    icone: ICONES_POSTAGEM.relogio,
    estado: () => {
      const n = videosState.getCurrentState()?.preferencias.horariosPadrao.length;
      if (n === undefined) return { texto: 'atalhos de agenda', tom: 'neutro' };
      return { texto: n === 1 ? '1 horário' : `${n} horários`, tom: n ? 'ok' : 'neutro' };
    },
  },
  {
    id: 'credenciais',
    rotulo: 'Segurança',
    icone: ICONES.escudo,
    estado: (s) =>
      s.ajustes.criptografiaDisponivel ? { texto: 'cofre ativo', tom: 'ok' } : { texto: 'sem cofre', tom: 'erro' },
  },
  {
    id: 'aparencia',
    rotulo: 'Aparência',
    icone: ICONE_APARENCIA,
    estado: (s) => ({ texto: TEMAS.find((t) => t.id === s.ajustes.tema)?.rotulo.toLowerCase() ?? 'escuro', tom: 'neutro' }),
  },
  { id: 'preferencias', rotulo: 'Preferências', icone: ICONES.preferencias },
  {
    id: 'atalhos',
    rotulo: 'Atalhos de teclado',
    icone: ICONE_TECLADO,
    estado: () => {
      const n = CATALOGO_ATALHOS.filter((d) => foiTrocado(d.id)).length;
      return n ? { texto: n === 1 ? '1 trocado' : `${n} trocados`, tom: 'ok' } : { texto: 'teclas padrão', tom: 'neutro' };
    },
  },
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
const ROTULO_DO_TOM: Record<Tom, string> = { ok: 'Tudo certo', erro: 'Não deu certo', atencao: 'Atenção', neutro: 'Aviso' };

/**
 * O selo é uma pílula de uma linha só: serve para "Salvo", mas corta uma
 * mensagem longa (o teste de IA explica o que falhou e em qual modelo). Texto
 * longo vira selo curto + parágrafo que quebra linha, e o que o provedor
 * mandou (depois de " Detalhe: ") fica recolhido.
 */
/**
 * Status vivos por chave. Salvar redesenha a seção inteira (o state notifica
 * e a view refaz tudo) antes de o `.then` mostrar "Salvo" — sem a chave, o
 * aviso ia para o elemento antigo, já fora da tela, e nada aparecia.
 */
const statusVivos = new Map<string, HTMLElement>();

function buildStatus(chave?: string): { el: HTMLElement; mostrar: (texto: string, tom: Tom) => void } {
  const proprio = document.createElement('div');
  proprio.className = 'aj-status';
  if (chave) statusVivos.set(chave, proprio);
  return {
    el: proprio,
    mostrar(texto, tom) {
      const vivo = chave ? statusVivos.get(chave) : undefined;
      const el = vivo?.isConnected ? vivo : proprio;
      el.replaceChildren();
      el.classList.toggle('is-longo', texto.length > 80);
      if (texto.length <= 80) {
        el.appendChild(buildSelo(texto, tom));
        return;
      }
      const corte = texto.indexOf(' Detalhe: ');
      el.appendChild(buildSelo(ROTULO_DO_TOM[tom], tom));
      el.appendChild(Object.assign(document.createElement('p'), { className: `aj-status-texto is-${tom}`, textContent: corte >= 0 ? texto.slice(0, corte) : texto }));
      if (corte >= 0) {
        const detalhes = document.createElement('details');
        detalhes.className = 'aj-status-detalhe';
        detalhes.appendChild(Object.assign(document.createElement('summary'), { textContent: 'Resposta do provedor' }));
        detalhes.appendChild(Object.assign(document.createElement('pre'), { textContent: texto.slice(corte + ' Detalhe: '.length) }));
        el.appendChild(detalhes);
      }
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

  const status = buildStatus('n8n');
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

  const status = buildStatus('github');
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
    'Como o Iris guarda as chaves de IA, a API key do n8n, o token do GitHub e as passphrases das chaves SSH.',
    ICONES.escudo,
  );

  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo';

  corpo.appendChild(
    state.ajustes.criptografiaDisponivel
      ? buildAviso(`As credenciais ficam cifradas pelo ${COFRE}, atreladas ao seu usuário. Nem o próprio Iris as mostra de volta na tela.`, 'ok')
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

/**
 * Seus dados: a outra parte dos contratos e o cabeçalho dos documentos do
 * CRM. Um cadastro só para o app — contrato, ficha e propostas leem daqui.
 */
function buildSecaoPerfil(state: AjustesViewState): HTMLElement {
  const painel = buildPainel(
    'Seus dados',
    'Quem você é nos documentos: a outra parte dos contratos gerados em Contatos e o cabeçalho das fichas em PDF.',
    ICONE_PERFIL,
  );
  const r: PerfilUsuario = structuredClone(state.ajustes.perfil);
  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo';

  const tipo = document.createElement('div');
  tipo.className = 'md-pilulas';
  const camposPj: HTMLElement[] = [];
  const rotuloNome = document.createElement('span');
  const rotuloDoc = document.createElement('span');
  const desenharTipo = (): void => {
    tipo.replaceChildren();
    (
      [
        ['pf', 'Pessoa física'],
        ['pj', 'Empresa'],
      ] as const
    ).forEach(([id, rotulo]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'md-pilula';
      b.classList.toggle('is-ativa', r.tipo === id);
      b.setAttribute('aria-pressed', String(r.tipo === id));
      b.textContent = rotulo;
      b.addEventListener('click', () => {
        r.tipo = id;
        desenharTipo();
      });
      tipo.appendChild(b);
    });
    camposPj.forEach((c) => (c.hidden = r.tipo !== 'pj'));
    rotuloNome.textContent = r.tipo === 'pj' ? 'Razão social' : 'Nome completo';
    rotuloDoc.textContent = r.tipo === 'pj' ? 'CNPJ' : 'CPF';
    avisoDoc();
  };
  const campoTipo = document.createElement('div');
  campoTipo.className = 'aj-campo';
  campoTipo.append(Object.assign(document.createElement('span'), { className: 'aj-campo-rotulo', textContent: 'Você contrata como' }), tipo);
  corpo.appendChild(campoTipo);

  /** Campo de texto ligado ao rascunho; `formatar` roda ao sair do campo (telefone, documento, CEP). */
  const ligado = (rotulo: string | HTMLElement, valor: string, ph: string, gravar: (v: string) => void, formatar?: (v: string) => string, dica?: string): { el: HTMLElement; input: HTMLInputElement } => {
    const input = buildInput('text', valor, ph);
    input.addEventListener('input', () => gravar(input.value));
    if (formatar) {
      input.addEventListener('change', () => {
        input.value = formatar(input.value);
        gravar(input.value);
      });
    }
    const el = buildCampo(typeof rotulo === 'string' ? rotulo : '', input, dica);
    if (typeof rotulo !== 'string') el.querySelector('.aj-campo-rotulo')?.replaceChildren(rotulo);
    return { el, input };
  };
  const grade = (...itens: HTMLElement[]): HTMLElement => {
    const g = document.createElement('div');
    g.className = 'aj-ia-grade';
    g.append(...itens);
    return g;
  };

  const nome = ligado(rotuloNome, r.nome, 'Como aparece no contrato', (v) => (r.nome = v));
  const fantasia = ligado('Nome fantasia', r.nomeFantasia, 'Opcional', (v) => (r.nomeFantasia = v));
  camposPj.push(fantasia.el);
  const avisoDocEl = document.createElement('span');
  avisoDocEl.className = 'aj-campo-dica is-aviso';
  const doc = ligado(rotuloDoc, r.documento, '', (v) => (r.documento = v), formatarDocumento);
  doc.el.appendChild(avisoDocEl);
  const avisoDoc = (): void => {
    avisoDocEl.textContent = problemaDoDocumento(r.documento, r.tipo === 'pj' ? 'cnpj' : 'cpf') ?? '';
  };
  doc.input.addEventListener('change', avisoDoc);
  corpo.append(grade(nome.el, doc.el), grade(fantasia.el));

  const rep = ligado('Representante legal', r.representante, 'Quem assina pela empresa', (v) => (r.representante = v));
  const repCpf = ligado('CPF do representante', r.representanteCpf, '', (v) => (r.representanteCpf = v), formatarDocumento);
  const gradeRep = grade(rep.el, repCpf.el);
  camposPj.push(gradeRep);
  corpo.appendChild(gradeRep);

  const email = ligado('E-mail', r.email, 'voce@exemplo.com', (v) => (r.email = v));
  const tel = ligado('Telefone', r.telefone, '(11) 98765-4321', (v) => (r.telefone = v), formatarTelefone);
  corpo.appendChild(grade(email.el, tel.el));

  const e = r.endereco;
  corpo.append(
    grade(
      ligado('CEP', e.cep, '00000-000', (v) => (e.cep = v), formatarCep).el,
      ligado('Endereço', e.logradouro, 'Rua, avenida…', (v) => (e.logradouro = v)).el,
    ),
    grade(ligado('Número', e.numero, '', (v) => (e.numero = v)).el, ligado('Complemento', e.complemento, 'Sala, apto…', (v) => (e.complemento = v)).el),
    grade(ligado('Bairro', e.bairro, '', (v) => (e.bairro = v)).el, ligado('Cidade', e.cidade, '', (v) => (e.cidade = v)).el),
  );
  const uf = buildInput('text', e.uf, 'SP');
  uf.maxLength = 2;
  uf.addEventListener('input', () => (e.uf = uf.value.toUpperCase()));
  const foro = ligado('Foro dos contratos', r.cidadeForo, 'Em branco usa a cidade do endereço', (v) => (r.cidadeForo = v), undefined, 'A cidade que aparece em {foro} nos modelos de contrato.');
  corpo.appendChild(grade(buildCampo('UF', uf), foro.el));

  const status = buildStatus('perfil');
  const acoes = document.createElement('div');
  acoes.className = 'aj-acoes';
  const salvar = buildBotao('Salvar', { variante: 'primario', icone: ICONES.check });
  salvar.addEventListener('click', () => {
    salvar.disabled = true;
    void ajustesState
      .setPerfil(r)
      .then(() => status.mostrar('Salvo', 'ok'))
      .catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'))
      .finally(() => {
        salvar.disabled = false;
      });
  });
  acoes.appendChild(salvar);
  corpo.append(acoes, status.el);
  desenharTipo();
  painel.appendChild(corpo);
  return painel;
}

const ICONE_ASSINATURA = '<path d="M3 17c3-3 5.5-8 7.5-8s-1 7 1 7 3-4 4.5-4 1 3 2.5 3H21"/><path d="M3 21h18"/>';

/**
 * Assinatura dos relatórios em PDF. Fica aqui, e não no gerador: mudar nome,
 * texto ou formato não exige mexer no código do documento. A prévia usa o
 * mesmo buildAssinatura do PDF.
 */
/**
 * Cadastro global de empresas e tags (o catálogo único de videos.json). Cada
 * ação redesenha Ajustes inteiro, para a contagem da navegação acompanhar; a
 * rolagem é mantida pelo render.
 */
function buildSecaoEmpresas(): HTMLElement {
  const painel = buildPainel(
    'Empresas e tags',
    'Um cadastro só para o app inteiro: Postagens, Roteiros, Tráfego e Relatórios usam as mesmas empresas e tags. Os relatórios são feitos por empresa.',
    ICONE_EMPRESA,
  );
  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo aj-empresas';
  const status = buildStatus('empresas');
  if (!videosState.getCurrentState()) {
    corpo.appendChild(Object.assign(document.createElement('p'), { className: 'aj-campo-dica', textContent: 'Carregando o catálogo…' }));
    void videosState
      .load()
      .then(rerender)
      .catch((erro: unknown) => status.mostrar(mensagemDe(erro), 'erro'));
  } else {
    const erro = (e: unknown): void => status.mostrar(mensagemDe(e), 'erro');
    corpo.append(buildCadastroTags('empresas', rerender, erro), buildCadastroTags('tags', rerender, erro));
  }
  corpo.appendChild(status.el);
  painel.appendChild(corpo);
  return painel;
}

/** Escalas de score (também no catálogo de videos.json), com o mesmo cadastro da aba Métricas. */
function buildSecaoEscalas(): HTMLElement {
  const painel = buildPainel(
    'Escalas de score',
    'De quanto a quanto o score de uma postagem é positivo, mediano ou negativo. Cada empresa pode ter a sua escala; Métricas e Relatórios leem o score por ela.',
    ICONE_ESCALA,
  );
  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo aj-escalas';
  const status = buildStatus('escalas');
  if (!videosState.getCurrentState()) {
    corpo.appendChild(Object.assign(document.createElement('p'), { className: 'aj-campo-dica', textContent: 'Carregando as escalas…' }));
    void videosState
      .load()
      .then(rerender)
      .catch((erro: unknown) => status.mostrar(mensagemDe(erro), 'erro'));
  } else {
    corpo.appendChild(buildCadastroEscalas(rerender, (e: unknown) => status.mostrar(mensagemDe(e), 'erro')));
  }
  corpo.appendChild(status.el);
  painel.appendChild(corpo);
  return painel;
}

/** Horários padrão do agendamento de postagens (catálogo de videos.json), com o mesmo modal do painel. */
function buildSecaoHorarios(): HTMLElement {
  const painel = buildPainel(
    'Horários padrão',
    'Horários com nome que aparecem primeiro ao agendar qualquer postagem (ex.: "Reels da manhã" às 09:00). Também dá para criar pelo próprio seletor de horário.',
    ICONES_POSTAGEM.relogio,
  );
  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo';
  const status = buildStatus('horarios');
  const file = videosState.getCurrentState();
  if (!file) {
    corpo.appendChild(Object.assign(document.createElement('p'), { className: 'aj-campo-dica', textContent: 'Carregando os horários…' }));
    void videosState
      .load()
      .then(rerender)
      .catch((erro: unknown) => status.mostrar(mensagemDe(erro), 'erro'));
  } else {
    const horarios = [...file.preferencias.horariosPadrao].sort((a, b) => a.hora.localeCompare(b.hora));
    const lista = document.createElement('div');
    lista.className = 'vd-agendar-chips is-padroes';
    horarios.forEach((h) => {
      const item = document.createElement('span');
      item.className = 'vd-agendar-padrao is-estatico';
      const nome = document.createElement('span');
      nome.className = 'vd-agendar-padrao-nome';
      nome.textContent = h.nome;
      const hora = document.createElement('span');
      hora.className = 'vd-agendar-padrao-hora';
      hora.textContent = h.hora;
      item.append(nome, hora);
      lista.appendChild(item);
    });
    if (!horarios.length) {
      lista.appendChild(Object.assign(document.createElement('p'), { className: 'aj-campo-dica', textContent: 'Nenhum horário padrão cadastrado.' }));
    }
    const editar = buildBotao(horarios.length ? 'Editar horários' : 'Cadastrar horários', { icone: ICONES_POSTAGEM.relogio, variante: 'primario' });
    editar.addEventListener('click', () => void abrirHorariosPadrao().then(rerender));
    corpo.append(lista, editar);
  }
  corpo.appendChild(status.el);
  painel.appendChild(corpo);
  return painel;
}

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

  const status = buildStatus('assinatura');
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
let unsubTema: (() => void) | null = null;

/** Claro, escuro ou igual ao Windows — com uma miniatura de cada um. */
function buildSecaoAparencia(state: AjustesViewState): HTMLElement {
  const painel = buildPainel('Aparência', 'O tema do Iris. Vale na hora, em todas as telas; os PDFs saem sempre em papel branco.', ICONE_APARENCIA);
  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo';
  const grade = document.createElement('div');
  grade.className = 'aj-temas';
  grade.setAttribute('role', 'radiogroup');
  grade.setAttribute('aria-label', 'Tema');
  const status = buildStatus('tema');
  TEMAS.forEach((t) => {
    const ativo = state.ajustes.tema === t.id;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `aj-tema is-${t.id}${ativo ? ' is-ativo' : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(ativo));
    // A miniatura desenha o tema, então usa as cores dele mesmo, não os tokens da tela.
    const mini = document.createElement('span');
    mini.className = 'aj-tema-mini';
    mini.setAttribute('aria-hidden', 'true');
    mini.innerHTML = '<span class="aj-tema-lado"></span><span class="aj-tema-area"><i></i><i></i><i></i></span>';
    const textos = document.createElement('span');
    textos.className = 'aj-tema-textos';
    const nome = document.createElement('strong');
    nome.textContent = t.id === 'escuro' ? `${t.rotulo} (padrão)` : t.rotulo;
    const desc = document.createElement('span');
    desc.textContent = t.descricao;
    textos.append(nome, desc);
    b.append(mini, textos);
    if (ativo) b.insertAdjacentHTML('beforeend', `<span class="aj-tema-check">${svg('<polyline points="20 6 9 17 4 12"/>', 14, 2.4)}</span>`);
    b.addEventListener('click', () => {
      if (ativo) return;
      void ajustesState.setTema(t.id).catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'));
    });
    grade.appendChild(b);
  });
  corpo.appendChild(grade);
  const dica = document.createElement('p');
  dica.className = 'aj-tema-dica';
  dica.textContent = comAtalho('Para trocar rápido entre claro e escuro: o sol/lua na barra lateral, logo acima do Tutorial, ou o atalho', 'geral.tema');
  corpo.appendChild(dica);
  corpo.appendChild(status.el);
  painel.appendChild(corpo);

  // O botão do trilho e o atalho trocam o tema por fora: a escolha marcada acompanha.
  unsubTema?.();
  unsubTema = onTemaMudou(() => void ajustesState.recarregarAjustes().catch(() => undefined));
  return painel;
}

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

  const status = buildStatus('inicial');
  select.addEventListener('change', () => {
    void ajustesState
      .setModuloInicial(select.value as ModuloInicial)
      .then(() => status.mostrar('Salvo — vale a partir da próxima abertura', 'ok'))
      .catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'));
  });

  corpo.appendChild(buildCampo('Abrir o Iris em', select, 'A área que aparece primeiro quando o app inicia.'));

  // A barra lateral: o painel de categorias abre ao lado (padrão) ou fica fixo.
  const opcaoFixar = buildOpcao(
    'Fixar o painel da barra lateral',
    comAtalho('Deixa a lista de módulos sempre aberta ao lado dos ícones, empurrando a tela. Desligado, cada categoria abre num painel por cima e fecha ao escolher. Atalho', 'geral.fixar'),
    estaFixado(),
  );
  const interruptorFixar = opcaoFixar.el.querySelector<HTMLButtonElement>('.pg-interruptor');
  interruptorFixar?.addEventListener('click', () => definirFixado(opcaoFixar.valor()));
  corpo.appendChild(opcaoFixar.el);

  // Acompanha o botão do próprio painel e o Ctrl+B.
  unsubSidebar?.();
  unsubSidebar = assinarFixado((fixo) => {
    interruptorFixar?.classList.toggle('is-ligado', fixo);
    interruptorFixar?.setAttribute('aria-checked', String(fixo));
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
      return e.semReleases
        ? { texto: 'Nenhuma versão publicada no GitHub ainda', tom: 'neutro' }
        : { texto: 'Você está na versão mais recente', tom: 'ok' };
    case 'disponivel':
      return { texto: `Versão ${e.nova?.versao ?? ''} disponível`, tom: 'atencao' };
    case 'baixando':
      return { texto: `Baixando${e.versaoAlvo ? ` a ${e.versaoAlvo}` : ''}… ${Math.round((e.progresso ?? 0) * 100)}%`, tom: 'neutro' };
    case 'instalando':
      return { texto: `Instalando${e.versaoAlvo ? ` a ${e.versaoAlvo}` : ''} — o Iris vai fechar e abrir de novo`, tom: 'neutro' };
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
  // Erro longo (ex.: instalador bloqueado pelo Windows) não cabe no selo de uma linha.
  const erroLongo = e.situacao === 'erro' && situacao.texto.length > 60;
  status.appendChild(buildSelo(erroLongo ? 'Não deu certo' : situacao.texto, situacao.tom));
  if (e.verificadoEm && e.situacao !== 'verificando') {
    const quando = document.createElement('span');
    quando.className = 'aj-campo-dica';
    quando.textContent = `verificado em ${new Date(e.verificadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;
    status.appendChild(quando);
  }
  corpo.appendChild(status);
  if (erroLongo) corpo.appendChild(Object.assign(document.createElement('p'), { className: 'aj-status-texto is-erro', textContent: situacao.texto }));

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
          : e.modo === 'linux'
            ? 'No Linux o Iris não se substitui sozinho: baixe o .deb (Ubuntu, Debian, Mint) ou o AppImage novo na página da release. Os dados continuam onde estão.'
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

  // Troca manual: qualquer versão publicada, ou um instalador do disco (o de
  // release/ gerado pelo npm run dist, sem precisar publicar).
  const manual = document.createElement('div');
  manual.className = 'aj-atualizacao-manual';
  const textos = document.createElement('div');
  textos.appendChild(Object.assign(document.createElement('strong'), { textContent: 'Trocar de versão manualmente' }));
  textos.appendChild(
    Object.assign(document.createElement('span'), {
      className: 'aj-campo-dica',
      textContent: 'Escolha qualquer versão publicada (inclusive voltar para uma anterior) ou instale um Iris-Setup-….exe que está no seu computador.',
    }),
  );
  const acoesManuais = document.createElement('div');
  acoesManuais.className = 'aj-acoes';
  const versoes = buildBotao('Escolher versão…', { icone: ICONES.branch });
  versoes.disabled = ocupado;
  versoes.addEventListener('click', abrirEscolhaDeVersao);
  const arquivo = buildBotao('Instalar de um arquivo…', { icone: ICONES.pasta });
  arquivo.disabled = ocupado;
  arquivo.addEventListener('click', () => void instalarDeArquivo().catch(falhou));
  acoesManuais.append(versoes, arquivo);
  manual.append(textos, acoesManuais);
  // Trocar de versão e instalar de um arquivo são do instalador do Windows.
  if (e.modo !== 'linux') corpo.appendChild(manual);
}

function buildSecaoAtualizacoes(): HTMLElement {
  const painel = buildPainel(
    'Atualizações',
    window.irisAPI.system.plataforma === 'linux'
      ? 'O Iris procura versão nova no GitHub ao abrir e a cada 6 horas e avisa aqui e na barra lateral. A instalação é pelo .deb ou pelo AppImage novo — os dados continuam onde estão.'
      : 'O Iris procura versão nova no GitHub ao abrir e a cada 6 horas. Atualizar baixa o instalador, confere o arquivo e reinstala por cima — os dados continuam onde estão.',
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
    'Exporte tudo ou só um módulo, e restaure escolhendo o que volta — sempre com uma cópia antes.',
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

let pararPedidosDeSecao: (() => void) | null = null;

export function render(container: HTMLElement, state: AjustesViewState): void {
  containerAtual = container;
  // Busca rápida ou Tutorial pedindo outra seção com Ajustes já aberto.
  pararPedidosDeSecao ??= onSecaoAjustesSolicitada(() => rerender());
  // Outro módulo pode ter pedido uma seção (ex.: Relatórios → assinatura).
  const pedida = consumirSecaoAjustes();
  if (pedida && NAV.some((n) => n.id === pedida)) secaoAtiva = pedida as Secao;
  // Salvar redesenha a tela; na mesma seção, a rolagem volta para onde o usuário estava.
  const rolagemAnterior = secaoDesenhada === secaoAtiva ? container.querySelector<HTMLElement>('.aj-conteudo')?.scrollTop ?? 0 : 0;
  container.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'pg-view aj-view';

  view.appendChild(
    buildCabecalho({
      icone: ICONES.ajustes,
      titulo: 'Ajustes',
      subtitulo: 'Conexões, inteligência artificial, segurança, preferências, relatórios, atualizações e backup',
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
    ia: () => buildSecaoIa({ buildPainel, buildCampo, buildInput, buildStatus }, state.ia),
    empresas: () => buildSecaoEmpresas(),
    escalas: () => buildSecaoEscalas(),
    horarios: () => buildSecaoHorarios(),
    credenciais: () => buildSecaoCredenciais(state),
    aparencia: () => buildSecaoAparencia(state),
    preferencias: () => buildSecaoPreferencias(state),
    atalhos: () =>
      buildSecaoAtalhos(
        buildPainel(
          'Atalhos de teclado',
          'Ande pelo Iris sem o mouse: G e uma letra abre cada módulo, Ctrl+P busca qualquer coisa. Troque qualquer tecla aqui.',
          ICONE_TECLADO,
          'atalhos',
        ),
      ),
    relatorios: () => buildSecaoRelatorios(state),
    perfil: () => buildSecaoPerfil(state),
    atualizacoes: () => buildSecaoAtualizacoes(),
    backup: () => buildSecaoBackup(),
  };
  conteudo.appendChild(secoes[secaoAtiva]());

  layout.appendChild(conteudo);
  view.appendChild(layout);
  container.appendChild(view);
  conteudo.scrollTop = rolagemAnterior;
  secaoDesenhada = secaoAtiva;
}

export function destroy(): void {
  // Voltar a Ajustes vindo de outro módulo começa do topo.
  secaoDesenhada = null;
  pararPedidosDeSecao?.();
  pararPedidosDeSecao = null;
  statusVivos.clear();
  if (unsubSidebar) {
    unsubSidebar();
    unsubSidebar = null;
  }
  unsubTema?.();
  unsubTema = null;
  // O statusEl do módulo de exportação sobreviveria ao DOM destruído.
  exportacaoView.destroy();
  pararAtualizacao?.();
  pararAtualizacao = null;
  containerAtual = null;
}
