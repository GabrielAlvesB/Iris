import { registerTask, setTaskInterval, startTask, stopAll, stopTask } from './scheduler';
import * as servidoresService from '../modules/servidores/servidores.service';
import * as n8nService from '../modules/n8n/n8n.service';
import * as githubService from '../modules/github/github.service';
import * as exploradorService from '../modules/explorador/explorador.service';
import * as postagensAgenda from '../modules/postagens/postagens.agenda';
import * as atualizacaoService from '../modules/atualizacao/atualizacao.service';
import * as anexosService from '../modules/anexos/anexos.service';
import * as imagensService from '../modules/imagens/imagens.service';
import * as videosService from '../modules/videos/videos.service';
import * as contatosArquivo from '../modules/contatos/contatos.arquivo';
import * as contatosLeads from '../modules/contatos/contatos.leads';
import * as contatosServidor from '../modules/contatos/contatos.servidor';
import * as whatsappFila from '../modules/whatsapp/whatsapp.fila';
import * as whatsappReceber from '../modules/whatsapp/whatsapp.receber';

/**
 * Raiz de composição das tarefas de fundo — mantém o main.ts sem precisar
 * conhecer cada serviço.
 */

export const TAREFA_HEALTH = 'servidores:health';
export const TAREFA_N8N = 'n8n:poll';
export const TAREFA_GITHUB = 'github:poll';
export const TAREFA_AGENDA_POSTAGENS = 'postagens:agenda';
export const TAREFA_ATUALIZACAO = 'atualizacao:verificar';
export const TAREFA_LEADS = 'contatos:leads';

/**
 * Leads por API: o servidor local liga/desliga e a busca na caixa da nuvem
 * (a cada minuto) começa/para conforme a aba API. Nunca lança: um contatos.json
 * ilegível não pode impedir as outras tarefas de subir.
 */
function aplicarLeads(atrasoMs: number): void {
  try {
    const config = contatosArquivo.loadFile().leadsConfig;
    void contatosServidor.aplicarServidor(config.servidor);
    if (config.nuvem.ativo && config.nuvem.url) startTask(TAREFA_LEADS, atrasoMs);
    else stopTask(TAREFA_LEADS);
  } catch (erro) {
    console.error('[leads] não deu para aplicar a configuração', erro);
  }
}

export async function startBackgroundServices(): Promise<void> {
  registerTask(TAREFA_HEALTH, 60_000, (signal) => servidoresService.runHealthCycle(signal));
  registerTask(TAREFA_N8N, 120_000, (signal) => n8nService.pollOnce(signal));
  registerTask(TAREFA_GITHUB, 600_000, (signal) => githubService.pollOnce(signal));

  const health = servidoresService.getHealthConfig();
  setTaskInterval(TAREFA_HEALTH, health.intervaloMs);
  // Atraso inicial: deixa a janela abrir antes de disparar a primeira rodada.
  if (health.ativo) startTask(TAREFA_HEALTH, 3_000);

  const n8n = n8nService.getPollConfig();
  setTaskInterval(TAREFA_N8N, n8n.intervaloMs);
  if (n8n.ativo && n8n.temBaseUrl) startTask(TAREFA_N8N, 5_000);

  const github = githubService.getPollConfig();
  setTaskInterval(TAREFA_GITHUB, github.intervaloMs);
  if (github.ativo && github.temToken) startTask(TAREFA_GITHUB, 8_000);

  // Sem configuração: agendada → publicada no horário é regra da pipeline, não opção.
  // 30s deixa a virada perto do minuto marcado sem custo (só lê dois JSONs).
  registerTask(TAREFA_AGENDA_POSTAGENS, 30_000, (signal) => postagensAgenda.publicarVencidas(signal));
  startTask(TAREFA_AGENDA_POSTAGENS, 2_000);

  // Versão nova no GitHub: na abertura (depois da primeira tela assentar) e a
  // cada 6 h para quem deixa o app aberto dias seguidos. A API sem token
  // aceita 60 consultas/h, longe disso.
  registerTask(TAREFA_ATUALIZACAO, 6 * 60 * 60_000, async (signal) => {
    await atualizacaoService.verificar(signal);
  });
  startTask(TAREFA_ATUALIZACAO, 12_000);

  // Cópias de anexos que nenhuma postagem usa mais. Tipo de postagem novo
  // precisa entrar aqui, senão os anexos dele seriam apagados na abertura.
  setTimeout(() => {
    void (async () => {
      const [videos, imagens] = await Promise.all([videosService.getFile(), imagensService.getFile()]);
      const emUso = new Set([...videos.videos, ...imagens.imagens].flatMap((p) => p.anexos.map((a) => a.id)));
      await anexosService.limparOrfaos(emUso);
    })().catch(() => undefined);
  }, 20_000);

  // A caixa na nuvem guarda leads e WhatsApp: a mesma rodada esvazia os dois.
  registerTask(TAREFA_LEADS, 60_000, async (signal) => {
    await contatosLeads.buscarNuvem(signal);
    await whatsappReceber.buscarNuvem(signal);
  });
  aplicarLeads(4_000);

  // Envio para vários: só roda com lote enviando (o "enviando" de antes já foi resolvido em main.ts).
  registerTask(whatsappFila.TAREFA_FILA, 15_000, (signal) => whatsappFila.processarFila(signal));
  whatsappFila.aplicarFila(6_000);

  exploradorService.iniciarWatchers();
}

/** Chamado quando a configuração muda na UI, para não exigir reinício do app. */
export function reaplicarAgendamentos(): void {
  const health = servidoresService.getHealthConfig();
  setTaskInterval(TAREFA_HEALTH, health.intervaloMs);
  if (health.ativo) {
    startTask(TAREFA_HEALTH, 1_000);
  } else {
    stopTask(TAREFA_HEALTH);
  }

  const n8n = n8nService.getPollConfig();
  setTaskInterval(TAREFA_N8N, n8n.intervaloMs);
  if (n8n.ativo && n8n.temBaseUrl) {
    startTask(TAREFA_N8N, 1_000);
  } else {
    stopTask(TAREFA_N8N);
  }

  const github = githubService.getPollConfig();
  setTaskInterval(TAREFA_GITHUB, github.intervaloMs);
  if (github.ativo && github.temToken) {
    startTask(TAREFA_GITHUB, 1_000);
  } else {
    stopTask(TAREFA_GITHUB);
  }

  aplicarLeads(1_000);
}

export function stopBackgroundServices(): void {
  stopAll();
  exploradorService.pararWatchers();
  contatosServidor.pararServidor();
}
