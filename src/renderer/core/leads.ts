import type { ContatosFile } from '../../shared/types/contatos.types.js';
import { abrirLead, abrirModulo } from './navegacao.js';
import { definirContagem } from './sidebar.js';

/**
 * Leads por API, vivos a sessão inteira (não é um módulo): o selo de "não
 * vistos" no ícone de Leads aparece em qualquer tela, e o clique na
 * notificação do Windows abre a ficha mesmo com outro módulo aberto.
 */

/** Chamado uma vez no bootstrap; as assinaturas duram a vida da janela. */
export function iniciarLeads(): void {
  window.irisAPI.events.on('contatos:mudou', ({ naoVistos }) => definirContagem('leads', naoVistos));
  window.irisAPI.events.on('contatos:abrir', ({ ref }) => {
    if (ref) abrirLead(ref);
    else abrirModulo('leads');
  });
  void window.irisAPI.contatos.contarNaoVistos().then((r) => {
    if (r.ok) definirContagem('leads', r.data);
  });
}

/** O state de Contatos (compartilhado pelos módulos de Relacionamento) chama a cada arquivo novo: marcar como visto na tela já tira o selo. */
export function contarDoArquivo(file: ContatosFile): void {
  definirContagem('leads', file.pessoas.filter((p) => p.entrada && !p.entrada.visto && !p.arquivado).length);
}
