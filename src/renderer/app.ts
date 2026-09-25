import { registrarAtendente } from './core/navegacao.js';
import { iniciarAtualizacao } from './core/atualizacao.js';
import { marcarAtivo, montarSidebar } from './core/sidebar.js';
import { MODULOS, MODULO_PADRAO, isModuloId, type ModuloId } from '../shared/types/modulos.types.js';

// O Record abaixo obriga todo módulo do catálogo a ter um carregador.
type ModuleName = ModuloId;

interface AppModule {
  mount(viewRoot: HTMLElement): void;
  destroy(): void;
}

/**
 * Cada módulo é importado só quando é aberto pela primeira vez. Importar os
 * dezesseis de saída (~100 arquivos JS servidos pelo esquema app://) atrasava
 * a primeira tela; agora a abertura carrega o núcleo + o módulo inicial, e os
 * outros são pré-carregados em segundo plano depois que a tela já apareceu.
 */
const carregadores: Record<ModuleName, () => Promise<AppModule>> = {
  kanban: async () => {
    const [state, view] = await Promise.all([import('./modules/kanban/kanban.state.js'), import('./modules/kanban/kanban.view.js')]);
    return {
      mount(viewRoot) {
        state.onBoardChange((board) => view.render(viewRoot, board));
        void state.loadBoard();
      },
      destroy() {
        view.destroy();
        state.offBoardChange();
      },
    };
  },
  // Vários tipos, vários arquivos: a própria tela assina os states e carrega.
  postagens: async () => {
    const view = await import('./modules/postagens/postagens.view.js');
    return { mount: (viewRoot) => view.montar(viewRoot), destroy: () => view.destroy() };
  },
  relatorios: async () => {
    const view = await import('./modules/relatorios/relatorios.view.js');
    return { mount: (viewRoot) => view.montar(viewRoot), destroy: () => view.destroy() };
  },
  roteiros: async () => {
    const view = await import('./modules/roteiros/roteiros.view.js');
    return { mount: (viewRoot) => view.montar(viewRoot), destroy: () => view.destroy() };
  },
  trafego: async () => {
    const view = await import('./modules/trafego/trafego.view.js');
    return { mount: (viewRoot) => view.montar(viewRoot), destroy: () => view.destroy() };
  },
  quadro: async () => {
    const [state, view] = await Promise.all([import('./modules/quadro/quadro.state.js'), import('./modules/quadro/quadro.view.js')]);
    return {
      mount(viewRoot) {
        state.onStateChange((s) => view.render(viewRoot, s));
        void state.loadState();
      },
      destroy() {
        view.destroy();
      },
    };
  },
  explorador: async () => {
    const [state, view] = await Promise.all([import('./modules/explorador/explorador.state.js'), import('./modules/explorador/explorador.view.js')]);
    return {
      mount(viewRoot) {
        state.onStateChange((s) => view.render(viewRoot, s));
        void state.carregarTudo();
      },
      destroy() {
        view.destroy();
        state.offStateChange();
      },
    };
  },
  sheets: async () => {
    const [state, view] = await Promise.all([import('./modules/sheets/sheets.state.js'), import('./modules/sheets/sheets.view.js')]);
    return {
      mount(viewRoot) {
        state.onStateChange((s) => view.render(viewRoot, s));
        void state.loadFile();
      },
      destroy() {
        view.destroy();
      },
    };
  },
  links: async () => {
    const [state, view] = await Promise.all([import('./modules/links/links.state.js'), import('./modules/links/links.view.js')]);
    return {
      mount(viewRoot) {
        state.onStateChange((s) => view.render(viewRoot, s));
        void state.loadLinks();
      },
      destroy() {
        view.destroy();
      },
    };
  },
  copy: async () => {
    const [state, view] = await Promise.all([import('./modules/copy/copy.state.js'), import('./modules/copy/copy.view.js')]);
    return {
      mount(viewRoot) {
        state.onStateChange((s) => view.render(viewRoot, s));
        void state.loadSnippets();
      },
      destroy() {
        view.destroy();
        state.offStateChange();
      },
    };
  },
  pensamentos: async () => {
    const [state, view] = await Promise.all([import('./modules/pensamentos/pensamentos.state.js'), import('./modules/pensamentos/pensamentos.view.js')]);
    return {
      mount(viewRoot) {
        state.onStateChange((s) => view.render(viewRoot, s));
        void state.loadPensamentos();
      },
      destroy() {
        view.destroy();
        state.offStateChange();
      },
    };
  },
  servidores: async () => {
    const [state, view] = await Promise.all([import('./modules/servidores/servidores.state.js'), import('./modules/servidores/servidores.view.js')]);
    return {
      mount(viewRoot) {
        state.onStateChange((s) => view.render(viewRoot, s));
        void state.loadState();
      },
      destroy() {
        view.destroy();
        state.offStateChange();
      },
    };
  },
  n8n: async () => {
    const [state, view] = await Promise.all([import('./modules/n8n/n8n.state.js'), import('./modules/n8n/n8n.view.js')]);
    return {
      mount(viewRoot) {
        state.onStateChange((s) => view.render(viewRoot, s));
        void state.load().then(() => {
          // Busca dados frescos ao abrir, sem precisar encurtar o intervalo do poll.
          void state.atualizarAgora().catch(() => undefined);
        });
      },
      destroy() {
        view.destroy();
        state.offStateChange();
      },
    };
  },
  github: async () => {
    const [state, view] = await Promise.all([import('./modules/github/github.state.js'), import('./modules/github/github.view.js')]);
    return {
      mount(viewRoot) {
        state.onStateChange((s) => view.render(viewRoot, s));
        void state.load();
      },
      destroy() {
        view.destroy();
        state.offStateChange();
      },
    };
  },
  tutorial: async () => {
    const [state, view] = await Promise.all([import('./modules/tutorial/tutorial.state.js'), import('./modules/tutorial/tutorial.view.js')]);
    return {
      mount(viewRoot) {
        state.onStateChange((s) => view.render(viewRoot, s));
        // Desenha na hora com o estado atual e confere em seguida, para a tela
        // não ficar em branco esperando as verificações.
        view.render(viewRoot, state.getCurrentState());
        void state.conferir();
      },
      destroy() {
        view.destroy();
        state.offStateChange();
      },
    };
  },
  ajustes: async () => {
    const [state, view] = await Promise.all([import('./modules/ajustes/ajustes.state.js'), import('./modules/ajustes/ajustes.view.js')]);
    return {
      mount(viewRoot) {
        state.onStateChange((s) => view.render(viewRoot, s));
        void state.load();
      },
      destroy() {
        view.destroy();
        state.offStateChange();
      },
    };
  },
};

/** Um carregamento por módulo: a promessa fica guardada e serve às próximas aberturas. */
const cache = new Map<ModuleName, Promise<AppModule>>();
function carregar(nome: ModuleName): Promise<AppModule> {
  let p = cache.get(nome);
  if (!p) {
    p = carregadores[nome]();
    // Falhou (arquivo faltando no build, erro de sintaxe): deixa tentar de novo no próximo clique.
    p.catch(() => cache.delete(nome));
    cache.set(nome, p);
  }
  return p;
}

let currentModule: ModuleName | null = null;
let montado: AppModule | null = null;
/** Cresce a cada troca: um carregamento lento que termina depois de outra troca não monta nada. */
let pedido = 0;

async function switchModule(name: ModuleName, viewRoot: HTMLElement): Promise<void> {
  if (currentModule === name) return;
  montado?.destroy();
  montado = null;
  currentModule = name;
  viewRoot.innerHTML = '';
  const meu = ++pedido;
  try {
    const modulo = await carregar(name);
    if (meu !== pedido) return;
    montado = modulo;
    modulo.mount(viewRoot);
  } catch (erro) {
    if (meu !== pedido) return;
    currentModule = null;
    const aviso = document.createElement('p');
    aviso.className = 'md-vazio';
    aviso.textContent = `Não foi possível abrir esta área: ${erro instanceof Error ? erro.message : String(erro)}`;
    viewRoot.replaceChildren(aviso);
  }
}

/** Depois da primeira tela, carrega os outros módulos devagar, um por vez, sem disputar com a interação. */
function preCarregarRestantes(): void {
  const fila = MODULOS.map((m) => m.id).filter((id) => !cache.has(id));
  const proximo = (): void => {
    const nome = fila.shift();
    if (!nome) return;
    void carregar(nome)
      .catch(() => undefined)
      .then(() => agendar());
  };
  const agendar = (): void => {
    if (!fila.length) return;
    if ('requestIdleCallback' in window) window.requestIdleCallback(proximo, { timeout: 2000 });
    else setTimeout(proximo, 50);
  };
  // Pequena folga: a primeira tela ainda está buscando os dados dela.
  setTimeout(agendar, 1500);
}

function bootstrap(): void {
  const viewRoot = document.getElementById('view-root');
  const navRoot = document.getElementById('sidebar-nav');
  if (!viewRoot || !navRoot) return;

  const abrir = (nome: ModuleName): void => {
    marcarAtivo(nome);
    void switchModule(nome, viewRoot);
  };

  montarSidebar(navRoot, abrir);
  iniciarAtualizacao();

  // Permite que um módulo peça navegação sem importar este arquivo de volta.
  registrarAtendente((modulo) => {
    if (isModuloId(modulo)) abrir(modulo);
  });

  // Abre no módulo escolhido em Ajustes; se a leitura falhar, cai no padrão.
  void window.irisAPI.ajustes
    .getAjustes()
    .then((result) => abrir(result.ok && isModuloId(result.data.moduloInicial) ? result.data.moduloInicial : MODULO_PADRAO))
    .catch(() => abrir(MODULO_PADRAO))
    .finally(preCarregarRestantes);
}

document.addEventListener('DOMContentLoaded', bootstrap);
