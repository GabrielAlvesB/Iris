import * as kanbanState from './modules/kanban/kanban.state.js';
import * as kanbanView from './modules/kanban/kanban.view.js';
import * as quadroState from './modules/quadro/quadro.state.js';
import * as quadroView from './modules/quadro/quadro.view.js';
import * as arquivosState from './modules/arquivos/arquivos.state.js';
import * as arquivosView from './modules/arquivos/arquivos.view.js';
import * as agendaState from './modules/agenda/agenda.state.js';
import * as agendaView from './modules/agenda/agenda.view.js';
import * as linksState from './modules/links/links.state.js';
import * as linksView from './modules/links/links.view.js';
import * as copyState from './modules/copy/copy.state.js';
import * as copyView from './modules/copy/copy.view.js';
import * as markdownState from './modules/markdown/markdown.state.js';
import * as markdownView from './modules/markdown/markdown.view.js';

type ModuleName = 'kanban' | 'quadro' | 'arquivos' | 'agenda' | 'links' | 'copy' | 'markdown';

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
  arquivos: {
    mount(viewRoot) {
      arquivosState.onStateChange((state) => arquivosView.render(viewRoot, state));
      void arquivosState.loadItems();
    },
    destroy() {
      // No listeners or timers to tear down for this module.
    },
  },
  agenda: {
    mount(viewRoot) {
      agendaState.onStateChange((state) => agendaView.render(viewRoot, state));
      void agendaState.loadItems();
    },
    destroy() {
      // No listeners or timers to tear down for this module.
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
  markdown: {
    mount(viewRoot) {
      markdownState.onConfigChange((config) => markdownView.render(viewRoot, config));
      void markdownState.loadConfig();
    },
    destroy() {
      markdownView.destroy();
      markdownState.offConfigChange();
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
  if (!viewRoot) return;

  document.querySelectorAll<HTMLButtonElement>('.nav-item[data-module]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const moduleName = btn.dataset.module as ModuleName;
      document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
      btn.classList.add('active');
      switchModule(moduleName, viewRoot);
    });
  });

  switchModule('kanban', viewRoot);
}

document.addEventListener('DOMContentLoaded', bootstrap);
