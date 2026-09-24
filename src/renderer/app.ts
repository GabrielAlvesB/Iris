import * as kanbanState from './modules/kanban/kanban.state.js';
import * as kanbanView from './modules/kanban/kanban.view.js';
import * as quadroState from './modules/quadro/quadro.state.js';
import * as quadroView from './modules/quadro/quadro.view.js';
import * as sheetsState from './modules/sheets/sheets.state.js';
import * as sheetsView from './modules/sheets/sheets.view.js';
import * as linksState from './modules/links/links.state.js';
import * as linksView from './modules/links/links.view.js';
import * as copyState from './modules/copy/copy.state.js';
import * as copyView from './modules/copy/copy.view.js';
import * as pensamentosState from './modules/pensamentos/pensamentos.state.js';
import * as pensamentosView from './modules/pensamentos/pensamentos.view.js';
import * as exploradorState from './modules/explorador/explorador.state.js';
import * as exploradorView from './modules/explorador/explorador.view.js';
import * as servidoresState from './modules/servidores/servidores.state.js';
import * as servidoresView from './modules/servidores/servidores.view.js';
import * as n8nState from './modules/n8n/n8n.state.js';
import * as n8nView from './modules/n8n/n8n.view.js';
import * as ajustesState from './modules/ajustes/ajustes.state.js';
import * as ajustesView from './modules/ajustes/ajustes.view.js';
import * as githubState from './modules/github/github.state.js';
import * as githubView from './modules/github/github.view.js';
import * as tutorialState from './modules/tutorial/tutorial.state.js';
import * as tutorialView from './modules/tutorial/tutorial.view.js';
import * as postagensView from './modules/postagens/postagens.view.js';
import * as relatoriosView from './modules/relatorios/relatorios.view.js';
import { registrarAtendente } from './core/navegacao.js';
import { marcarAtivo, montarSidebar } from './core/sidebar.js';
import { MODULO_PADRAO, isModuloId, type ModuloId } from '../shared/types/modulos.types.js';

// O Record abaixo obriga todo módulo do catálogo a ter mount/destroy.
type ModuleName = ModuloId;

interface AppModule {
  mount(viewRoot: HTMLElement): void;
  destroy(): void;
}

const modules: Record<ModuleName, AppModule> = {
  kanban: {
    mount(viewRoot) {
      kanbanState.onBoardChange((board) => kanbanView.render(viewRoot, board));
      void kanbanState.loadBoard();
    },
    destroy() {
      kanbanView.destroy();
      kanbanState.offBoardChange();
    },
  },
  postagens: {
    mount(viewRoot) {
      // Vários tipos, vários arquivos: a própria tela assina os states e carrega.
      postagensView.montar(viewRoot);
    },
    destroy() {
      postagensView.destroy();
    },
  },
  relatorios: {
    mount(viewRoot) {
      relatoriosView.montar(viewRoot);
    },
    destroy() {
      relatoriosView.destroy();
    },
  },
  quadro: {
    mount(viewRoot) {
      quadroState.onStateChange((state) => quadroView.render(viewRoot, state));
      void quadroState.loadState();
    },
    destroy() {
      quadroView.destroy();
    },
  },
  explorador: {
    mount(viewRoot) {
      exploradorState.onStateChange((state) => exploradorView.render(viewRoot, state));
      void exploradorState.carregarTudo();
    },
    destroy() {
      exploradorView.destroy();
      exploradorState.offStateChange();
    },
  },
  sheets: {
    mount(viewRoot) {
      sheetsState.onStateChange((state) => sheetsView.render(viewRoot, state));
      void sheetsState.loadFile();
    },
    destroy() {
      sheetsView.destroy();
    },
  },
  links: {
    mount(viewRoot) {
      linksState.onStateChange((state) => linksView.render(viewRoot, state));
      void linksState.loadLinks();
    },
    destroy() {
      linksView.destroy();
    },
  },
  copy: {
    mount(viewRoot) {
      copyState.onStateChange((state) => copyView.render(viewRoot, state));
      void copyState.loadSnippets();
    },
    destroy() {
      copyView.destroy();
      copyState.offStateChange();
    },
  },
  pensamentos: {
    mount(viewRoot) {
      pensamentosState.onStateChange((state) => pensamentosView.render(viewRoot, state));
      void pensamentosState.loadPensamentos();
    },
    destroy() {
      pensamentosView.destroy();
      pensamentosState.offStateChange();
    },
  },
  servidores: {
    mount(viewRoot) {
      servidoresState.onStateChange((state) => servidoresView.render(viewRoot, state));
      void servidoresState.loadState();
    },
    destroy() {
      servidoresView.destroy();
      servidoresState.offStateChange();
    },
  },
  n8n: {
    mount(viewRoot) {
      n8nState.onStateChange((state) => n8nView.render(viewRoot, state));
      void n8nState.load().then(() => {
        // Busca dados frescos ao abrir, sem precisar encurtar o intervalo do poll.
        void n8nState.atualizarAgora().catch(() => undefined);
      });
    },
    destroy() {
      n8nView.destroy();
      n8nState.offStateChange();
    },
  },
  github: {
    mount(viewRoot) {
      githubState.onStateChange((state) => githubView.render(viewRoot, state));
      void githubState.load();
    },
    destroy() {
      githubView.destroy();
      githubState.offStateChange();
    },
  },
  tutorial: {
    mount(viewRoot) {
      tutorialState.onStateChange((state) => tutorialView.render(viewRoot, state));
      // Desenha na hora com o estado atual e confere em seguida, para a tela
      // não ficar em branco esperando as verificações.
      tutorialView.render(viewRoot, tutorialState.getCurrentState());
      void tutorialState.conferir();
    },
    destroy() {
      tutorialView.destroy();
      tutorialState.offStateChange();
    },
  },
  ajustes: {
    mount(viewRoot) {
      ajustesState.onStateChange((state) => ajustesView.render(viewRoot, state));
      void ajustesState.load();
    },
    destroy() {
      ajustesView.destroy();
      ajustesState.offStateChange();
    },
  },
};

let currentModule: ModuleName | null = null;

function switchModule(name: ModuleName, viewRoot: HTMLElement): void {
  if (currentModule === name) return;
  if (currentModule) modules[currentModule].destroy();
  currentModule = name;
  viewRoot.innerHTML = '';
  modules[name].mount(viewRoot);
}

function bootstrap(): void {
  const viewRoot = document.getElementById('view-root');
  const navRoot = document.getElementById('sidebar-nav');
  if (!viewRoot || !navRoot) return;

  const abrir = (nome: ModuleName): void => {
    marcarAtivo(nome);
    switchModule(nome, viewRoot);
  };

  montarSidebar(navRoot, abrir);

  // Permite que um módulo peça navegação sem importar este arquivo de volta
  // (o que criaria ciclo, já que app.ts importa todos eles).
  registrarAtendente((modulo) => {
    if (isModuloId(modulo)) abrir(modulo);
  });

  // Abre no módulo escolhido em Ajustes; se a leitura falhar, cai no padrão.
  void window.irisAPI.ajustes
    .getAjustes()
    .then((result) => abrir(result.ok && isModuloId(result.data.moduloInicial) ? result.data.moduloInicial : MODULO_PADRAO))
    .catch(() => abrir(MODULO_PADRAO));
}

document.addEventListener('DOMContentLoaded', bootstrap);
