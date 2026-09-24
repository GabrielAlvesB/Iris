import type {
  Checagem,
  Servidor,
  ServidorHttp,
  ServidorSsh,
  ServidoresFile,
} from '../../../shared/types/servidores.types';
import * as servidoresState from './servidores.state.js';
import { openAvisoModal, openConfirmModal, openFormModal } from '../../ui/modal.js';
import { abrirTutorial } from '../../core/navegacao.js';
import { ICONES, buildBotaoAjuda } from '../../ui/pagina.js';

let containerAtual: HTMLElement | null = null;
/** Servidores SSH com o painel de comandos aberto. */
let expandidos = new Set<string>();
/** Painel <pre> de cada servidor, para anexar a saída sem redesenhar a tela. */
const painesSaida = new Map<string, HTMLElement>();
/**
 * Texto já recebido por servidor. Um broadcast de 'servidores:estado' (o ciclo
 * de health check, por exemplo) redesenha a tela e recriaria o <pre> vazio no
 * meio de um comando — guardar aqui faz a saída sobreviver ao re-render.
 */
const saidaAcumulada = new Map<string, string>();

function rerender(): void {
  const state = servidoresState.getCurrentState();
  if (containerAtual && state) render(containerAtual, state);
}

async function avisar(titulo: string, mensagem: string): Promise<void> {
  await openAvisoModal(titulo, mensagem, { erro: true, botao: 'Entendi' });
}

const ICONE_TERMINAL = '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>';
const OPCOES_HTTP = { icone: ICONES.servidor, subtitulo: 'Checagem de saúde por HTTP: o Iris chama a URL e confere o status.', largura: 540 };
const OPCOES_SSH = { icone: ICONE_TERMINAL, subtitulo: 'Conexão por chave privada para rodar comandos salvos.', largura: 540 };

function ultimaChecagem(servidor: Servidor): Checagem | undefined {
  return servidor.historico[servidor.historico.length - 1];
}

function tempoRelativo(iso?: string): string {
  if (!iso) return 'nunca checado';

  const segundos = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (segundos < 60) return 'agora há pouco';
  if (segundos < 3600) return `há ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `há ${Math.floor(segundos / 3600)} h`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/** Barras das últimas checagens — um sparkline em CSS puro, sem lib. */
function buildSparkline(servidor: Servidor): HTMLElement {
  const faixa = document.createElement('div');
  faixa.className = 'servidor-sparkline';

  const recentes = servidor.historico.slice(-40);
  const maiorLatencia = Math.max(1, ...recentes.map((c) => c.latenciaMs ?? 0));

  recentes.forEach((checagem) => {
    const barra = document.createElement('span');
    barra.className = `servidor-barra ${checagem.ok ? 'is-ok' : 'is-falha'}`;
    const proporcao = (checagem.latenciaMs ?? 0) / maiorLatencia;
    barra.style.height = `${Math.max(15, Math.round(proporcao * 100))}%`;
    barra.title = checagem.ok
      ? `${new Date(checagem.em).toLocaleString('pt-BR')} · ${checagem.latenciaMs} ms`
      : `${new Date(checagem.em).toLocaleString('pt-BR')} · ${checagem.erro ?? 'falhou'}`;
    faixa.appendChild(barra);
  });

  return faixa;
}

async function editarServidor(servidor: Servidor): Promise<void> {
  if (servidor.tipo === 'http') {
    const resposta = await openFormModal(
      'Editar servidor HTTP',
      [
        { name: 'nome', label: 'Nome', defaultValue: servidor.nome, secao: 'Identificação' },
        { name: 'url', label: 'URL', type: 'url', defaultValue: servidor.url, secao: 'Identificação' },
        {
          name: 'metodo',
          label: 'Método',
          type: 'select',
          secao: 'Checagem',
          metade: true,
          defaultValue: servidor.metodo,
          options: [
            { value: 'GET', label: 'GET' },
            { value: 'HEAD', label: 'HEAD' },
          ],
        },
        { name: 'statusEsperado', label: 'Status esperado', type: 'number', defaultValue: String(servidor.statusEsperado), secao: 'Checagem', metade: true },
        { name: 'timeoutMs', label: 'Timeout (ms)', type: 'number', defaultValue: String(servidor.timeoutMs), secao: 'Checagem', metade: true },
        { name: 'intervalo', label: 'Checar a cada (s)', type: 'number', defaultValue: String(servidor.intervaloSegundos), secao: 'Checagem', metade: true, dica: '0 = só manual' },
        {
          name: 'tls',
          label: 'Certificado autoassinado',
          type: 'select',
          secao: 'Checagem',
          defaultValue: servidor.permitirTlsInseguro ? 'sim' : 'nao',
          options: [
            { value: 'nao', label: 'Não aceitar (recomendado)' },
            { value: 'sim', label: 'Aceitar mesmo inválido' },
          ],
        },
      ],
      'Salvar',
      OPCOES_HTTP,
    );
    if (!resposta) return;

    await servidoresState.atualizar({
      servidorId: servidor.id,
      nome: resposta.nome,
      url: resposta.url,
      metodo: resposta.metodo === 'HEAD' ? 'HEAD' : 'GET',
      statusEsperado: Number(resposta.statusEsperado) || 200,
      timeoutMs: Number(resposta.timeoutMs) || 8000,
      intervaloSegundos: Number(resposta.intervalo) || 0,
      permitirTlsInseguro: resposta.tls === 'sim',
    });
    return;
  }

  const resposta = await openFormModal(
    'Editar servidor SSH',
    [
      { name: 'nome', label: 'Nome', defaultValue: servidor.nome, secao: 'Conexão' },
      { name: 'host', label: 'Host', defaultValue: servidor.host, secao: 'Conexão' },
      { name: 'porta', label: 'Porta', type: 'number', defaultValue: String(servidor.porta), secao: 'Conexão', metade: true },
      { name: 'usuario', label: 'Usuário', defaultValue: servidor.usuario, secao: 'Conexão', metade: true },
      { name: 'caminhoChave', label: 'Caminho da chave privada', defaultValue: servidor.caminhoChave, secao: 'Chave' },
      {
        name: 'passphrase',
        label: 'Passphrase',
        type: 'password',
        secao: 'Chave',
        dica: servidor.temPassphrase ? 'Em branco mantém a atual.' : 'Opcional; guardada cifrada neste computador.',
        defaultValue: '',
      },
    ],
    'Salvar',
    OPCOES_SSH,
  );
  if (!resposta) return;

  await servidoresState.atualizar({
    servidorId: servidor.id,
    nome: resposta.nome,
    host: resposta.host,
    porta: Number(resposta.porta) || 22,
    usuario: resposta.usuario,
    caminhoChave: resposta.caminhoChave,
    // String vazia mantém a passphrase; para remover use o botão dedicado.
    passphrase: resposta.passphrase ? resposta.passphrase : undefined,
  });
}

async function novoHttp(): Promise<void> {
  const resposta = await openFormModal(
    'Novo servidor HTTP',
    [
      { name: 'nome', label: 'Nome', placeholder: 'API de produção', secao: 'Identificação' },
      { name: 'url', label: 'URL', type: 'url', placeholder: 'https://meuservidor.com/health', secao: 'Identificação' },
      {
        name: 'metodo',
        label: 'Método',
        type: 'select',
        secao: 'Checagem',
        metade: true,
        defaultValue: 'GET',
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'HEAD', label: 'HEAD' },
        ],
      },
      { name: 'statusEsperado', label: 'Status esperado', type: 'number', defaultValue: '200', secao: 'Checagem', metade: true },
      { name: 'intervalo', label: 'Checar a cada (s)', type: 'number', defaultValue: '60', secao: 'Checagem', dica: '0 = só manual' },
    ],
    'Adicionar',
    OPCOES_HTTP,
  );
  if (!resposta) return;

  try {
    await servidoresState.criarHttp({
      nome: resposta.nome,
      url: resposta.url,
      metodo: resposta.metodo === 'HEAD' ? 'HEAD' : 'GET',
      statusEsperado: Number(resposta.statusEsperado) || 200,
      timeoutMs: 8000,
      permitirTlsInseguro: false,
      intervaloSegundos: Number(resposta.intervalo) || 0,
    });
  } catch (error) {
    await avisar('Não foi possível adicionar', error instanceof Error ? error.message : String(error));
  }
}

async function novoSsh(): Promise<void> {
  const caminhoChave = await servidoresState.escolherChave();
  if (!caminhoChave) return;

  const resposta = await openFormModal(
    'Novo servidor SSH',
    [
      { name: 'nome', label: 'Nome', placeholder: 'VPS principal', secao: 'Conexão' },
      { name: 'host', label: 'Host', placeholder: '203.0.113.10', secao: 'Conexão' },
      { name: 'porta', label: 'Porta', type: 'number', defaultValue: '22', secao: 'Conexão', metade: true },
      { name: 'usuario', label: 'Usuário', defaultValue: 'root', secao: 'Conexão', metade: true },
      { name: 'passphrase', label: 'Passphrase da chave', type: 'password', defaultValue: '', secao: 'Chave', dica: 'Só se a chave tiver uma.' },
    ],
    'Adicionar',
    { ...OPCOES_SSH, subtitulo: `Chave escolhida: ${caminhoChave}` },
  );
  if (!resposta) return;

  try {
    await servidoresState.criarSsh({
      nome: resposta.nome,
      host: resposta.host,
      porta: Number(resposta.porta) || 22,
      usuario: resposta.usuario,
      caminhoChave,
      passphrase: resposta.passphrase || undefined,
    });
  } catch (error) {
    await avisar('Não foi possível adicionar', error instanceof Error ? error.message : String(error));
  }
}

async function removerServidor(servidor: Servidor): Promise<void> {
  const confirmado = await openConfirmModal({
    title: 'Remover servidor',
    message: `"${servidor.nome}" sai da lista, junto com o histórico de checagens${
      servidor.tipo === 'ssh' ? ' e a passphrase salva' : ''
    }.`,
    confirmText: 'Remover',
  });
  if (confirmado) await servidoresState.remover(servidor.id);
}

async function editarComando(servidor: ServidorSsh, comandoId?: string): Promise<void> {
  const existente = comandoId ? servidor.comandos.find((c) => c.id === comandoId) : undefined;

  const resposta = await openFormModal(
    existente ? 'Editar comando' : 'Novo comando',
    [
      { name: 'rotulo', label: 'Rótulo', defaultValue: existente?.rotulo ?? '', placeholder: 'Ver containers' },
      {
        name: 'comando',
        label: 'Comando',
        type: 'textarea',
        defaultValue: existente?.comando ?? '',
        placeholder: 'docker ps',
        dica: 'Roda no servidor pela conexão SSH; a saída aparece no painel.',
      },
    ],
    'Salvar',
    { icone: ICONE_TERMINAL, subtitulo: servidor.nome },
  );
  if (!resposta) return;

  await servidoresState.salvarComando({
    servidorId: servidor.id,
    comandoId,
    rotulo: resposta.rotulo,
    comando: resposta.comando,
  });
}

function buildPainelSsh(servidor: ServidorSsh): HTMLElement {
  const painel = document.createElement('div');
  painel.className = 'servidor-painel';

  const botoes = document.createElement('div');
  botoes.className = 'servidor-comandos';

  const saida = document.createElement('pre');
  saida.className = 'servidor-saida';
  saida.textContent = saidaAcumulada.get(servidor.id) ?? '';
  painesSaida.set(servidor.id, saida);

  servidor.comandos.forEach((comando) => {
    const grupo = document.createElement('div');
    grupo.className = 'servidor-comando';

    const rodar = document.createElement('button');
    rodar.className = 'btn btn-secondary servidor-btn-comando';
    rodar.textContent = comando.rotulo;
    rodar.title = comando.comando;
    rodar.addEventListener('click', () => {
      const cabecalho = `$ ${comando.comando}\n`;
      saidaAcumulada.set(servidor.id, cabecalho);
      saida.textContent = cabecalho;
      void servidoresState
        .rodarComando({ servidorId: servidor.id, comandoId: comando.id })
        .catch((error: unknown) => {
          const texto = `\n${error instanceof Error ? error.message : String(error)}\n`;
          saidaAcumulada.set(servidor.id, (saidaAcumulada.get(servidor.id) ?? '') + texto);
          saida.textContent += texto;
        });
    });
    grupo.appendChild(rodar);

    const editar = document.createElement('button');
    editar.className = 'btn-icon servidor-mini';
    editar.title = 'Editar comando';
    editar.textContent = '✎';
    editar.addEventListener('click', () => void editarComando(servidor, comando.id));
    grupo.appendChild(editar);

    const remover = document.createElement('button');
    remover.className = 'btn-icon servidor-mini';
    remover.title = 'Remover comando';
    remover.textContent = '×';
    remover.addEventListener('click', () => {
      void servidoresState.removerComando({ servidorId: servidor.id, comandoId: comando.id });
    });
    grupo.appendChild(remover);

    botoes.appendChild(grupo);
  });

  const novo = document.createElement('button');
  novo.className = 'btn btn-secondary servidor-btn-comando servidor-btn-novo';
  novo.textContent = '+ Comando';
  novo.addEventListener('click', () => void editarComando(servidor));
  botoes.appendChild(novo);

  painel.appendChild(botoes);

  if (servidor.comandos.length === 0) {
    const dica = document.createElement('div');
    dica.className = 'servidor-dica';
    dica.textContent =
      'Cadastre comandos de conferência, como uptime, docker ps ou tail -n 200 /var/log/app.log.';
    painel.appendChild(dica);
  }

  painel.appendChild(saida);
  return painel;
}

function buildCard(servidor: Servidor): HTMLElement {
  const card = document.createElement('article');
  card.className = 'servidor-card';

  const topo = document.createElement('div');
  topo.className = 'servidor-topo';

  const ultima = ultimaChecagem(servidor);
  const bolinha = document.createElement('span');
  const situacao = servidor.tipo === 'ssh' ? 'neutro' : !ultima ? 'neutro' : ultima.ok ? 'ok' : 'falha';
  bolinha.className = `servidor-bolinha is-${situacao}`;
  topo.appendChild(bolinha);

  const nome = document.createElement('span');
  nome.className = 'servidor-nome';
  nome.textContent = servidor.nome;
  topo.appendChild(nome);

  const tipo = document.createElement('span');
  tipo.className = 'servidor-tipo';
  tipo.textContent = servidor.tipo === 'http' ? 'HTTP' : 'SSH';
  topo.appendChild(tipo);

  const alvo = document.createElement('span');
  alvo.className = 'servidor-alvo';
  alvo.textContent =
    servidor.tipo === 'http'
      ? (servidor as ServidorHttp).url
      : `${(servidor as ServidorSsh).usuario}@${(servidor as ServidorSsh).host}:${(servidor as ServidorSsh).porta}`;
  topo.appendChild(alvo);

  const espaco = document.createElement('div');
  espaco.className = 'servidor-espaco';
  topo.appendChild(espaco);

  if (servidor.tipo === 'http') {
    const checar = document.createElement('button');
    checar.className = 'btn btn-secondary servidor-btn-pequeno';
    checar.textContent = 'Checar';
    checar.addEventListener('click', () => {
      checar.disabled = true;
      void servidoresState.checarAgora(servidor.id).finally(() => {
        checar.disabled = false;
      });
    });
    topo.appendChild(checar);
  } else {
    const alternar = document.createElement('button');
    alternar.className = 'btn btn-secondary servidor-btn-pequeno';
    alternar.textContent = expandidos.has(servidor.id) ? 'Fechar' : 'Comandos';
    alternar.addEventListener('click', () => {
      if (expandidos.has(servidor.id)) expandidos.delete(servidor.id);
      else expandidos.add(servidor.id);
      rerender();
    });
    topo.appendChild(alternar);
  }

  const editar = document.createElement('button');
  editar.className = 'btn-icon servidor-mini';
  editar.title = 'Editar';
  editar.textContent = '✎';
  editar.addEventListener('click', () => void editarServidor(servidor));
  topo.appendChild(editar);

  const remover = document.createElement('button');
  remover.className = 'btn-icon servidor-mini servidor-mini--danger';
  remover.title = 'Remover';
  remover.textContent = '×';
  remover.addEventListener('click', () => void removerServidor(servidor));
  topo.appendChild(remover);

  card.appendChild(topo);

  if (servidor.tipo === 'http') {
    const meta = document.createElement('div');
    meta.className = 'servidor-meta';

    const quando = document.createElement('span');
    quando.textContent = tempoRelativo(ultima?.em);
    meta.appendChild(quando);

    if (ultima) {
      const detalhe = document.createElement('span');
      detalhe.className = ultima.ok ? 'servidor-detalhe is-ok' : 'servidor-detalhe is-falha';
      detalhe.textContent = ultima.ok
        ? `HTTP ${ultima.status} · ${ultima.latenciaMs} ms`
        : (ultima.erro ?? 'falhou');
      meta.appendChild(detalhe);
    }

    if (servidor.intervaloSegundos > 0) {
      const ciclo = document.createElement('span');
      ciclo.className = 'servidor-ciclo';
      ciclo.textContent = `a cada ${servidor.intervaloSegundos}s`;
      meta.appendChild(ciclo);
    }

    card.appendChild(meta);
    if (servidor.historico.length > 0) card.appendChild(buildSparkline(servidor));
  }

  if (servidor.tipo === 'ssh' && expandidos.has(servidor.id)) {
    card.appendChild(buildPainelSsh(servidor as ServidorSsh));
  }

  return card;
}

export function render(container: HTMLElement, state: ServidoresFile): void {
  containerAtual = container;
  container.innerHTML = '';
  painesSaida.clear();

  const view = document.createElement('div');
  view.className = 'servidores-view';

  const header = document.createElement('header');
  header.className = 'servidores-header';

  const titulo = document.createElement('h1');
  titulo.className = 'servidores-titulo';
  titulo.textContent = 'Servidores';
  header.appendChild(titulo);

  const contagem = document.createElement('span');
  contagem.className = 'servidores-contagem';
  contagem.textContent = `${state.servidores.length} cadastrados`;
  header.appendChild(contagem);

  const espaco = document.createElement('div');
  espaco.className = 'servidor-espaco';
  header.appendChild(espaco);

  const ciclo = document.createElement('label');
  ciclo.className = 'servidores-ciclo';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = state.healthAtivo;
  check.addEventListener('change', () => {
    void servidoresState.configHealth({
      healthAtivo: check.checked,
      healthIntervaloSeg: state.healthIntervaloSeg,
    });
  });
  ciclo.appendChild(check);
  const cicloTexto = document.createElement('span');
  cicloTexto.textContent = `Checagem automática (${state.healthIntervaloSeg}s)`;
  ciclo.appendChild(cicloTexto);
  header.appendChild(ciclo);

  const checarTodos = document.createElement('button');
  checarTodos.className = 'btn btn-secondary';
  checarTodos.textContent = 'Checar todos';
  checarTodos.addEventListener('click', () => {
    checarTodos.disabled = true;
    checarTodos.textContent = 'Checando…';
    void servidoresState.checarTodos().finally(() => {
      checarTodos.disabled = false;
      checarTodos.textContent = 'Checar todos';
    });
  });
  header.appendChild(checarTodos);

  const addHttp = document.createElement('button');
  addHttp.className = 'btn';
  addHttp.textContent = '+ HTTP';
  addHttp.addEventListener('click', () => void novoHttp());
  header.appendChild(addHttp);

  const addSsh = document.createElement('button');
  addSsh.className = 'btn';
  addSsh.textContent = '+ SSH';
  addSsh.addEventListener('click', () => void novoSsh());
  header.appendChild(addSsh);

  header.appendChild(buildBotaoAjuda(() => abrirTutorial('servidores')));

  view.appendChild(header);

  const lista = document.createElement('div');
  lista.className = 'servidores-lista';

  if (state.servidores.length === 0) {
    const vazio = document.createElement('div');
    vazio.className = 'servidores-vazio';
    vazio.textContent =
      'Nenhum servidor cadastrado. Use "+ HTTP" para monitorar uma URL ou "+ SSH" para acessar uma máquina remota.';
    lista.appendChild(vazio);

    const guia = document.createElement('button');
    guia.className = 'btn btn-secondary servidores-vazio-guia';
    guia.textContent = 'Ver o passo a passo';
    guia.addEventListener('click', () => abrirTutorial('servidores'));
    lista.appendChild(guia);
  } else {
    state.servidores.forEach((servidor) => lista.appendChild(buildCard(servidor)));
  }

  view.appendChild(lista);
  container.appendChild(view);

  // Anexa a saída SSH direto no <pre> correspondente, sem passar por re-render.
  servidoresState.onSaida((chunk) => {
    const texto =
      chunk.stream === 'fim'
        ? `\n— ${chunk.texto}${chunk.exitCode !== undefined ? ` (código ${chunk.exitCode})` : ''}\n`
        : chunk.texto;

    saidaAcumulada.set(chunk.servidorId, (saidaAcumulada.get(chunk.servidorId) ?? '') + texto);

    const painel = painesSaida.get(chunk.servidorId);
    if (!painel) return; // painel fechado: o texto fica guardado para quando reabrir

    painel.textContent += texto;
    painel.scrollTop = painel.scrollHeight;
  });
}

export function destroy(): void {
  servidoresState.onSaida(null);
  containerAtual = null;
  painesSaida.clear();
  // A saída pode conter conteúdo sensível de servidor; não sobrevive à saída
  // do módulo, e nada dela é gravado em disco.
  saidaAcumulada.clear();
  expandidos = new Set();
}
