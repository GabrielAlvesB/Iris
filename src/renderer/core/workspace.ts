import { aplicar, assinar, carregar } from '../modules/workspace/workspace.state.js';
import { abrirWorkspace } from './navegacao.js';
import { definirContagem } from './sidebar.js';

/**
 * Vivo a sessão toda: o selo de atualizações no trilho e o clique na
 * notificação de versão nova, que precisam funcionar com qualquer tela aberta.
 */
export function iniciarWorkspace(): void {
  window.irisAPI.events.on('workspace:estado', aplicar);
  window.irisAPI.events.on('workspace:abrir', ({ appId }) => abrirWorkspace(appId));
  assinar((e) => definirContagem('workspace', e.apps.filter((a) => a.situacao === 'atualizacao').length));
  // A detecção do que está instalado roda no main; não precisa segurar a abertura.
  setTimeout(() => void carregar().catch(() => undefined), 4_000);
}
