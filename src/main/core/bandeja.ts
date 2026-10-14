import { app, Menu, Tray, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { broadcast } from './broadcast';
import { iconeDoApp } from './icone';
import { focarJanela, notificar } from './notificacao';
import * as hojeService from '../modules/hoje/hoje.service';
import type { ItemDia } from '../../shared/types/hoje.types';

/**
 * Ícone na bandeja do sistema (opção de Ajustes › Preferências). Ligada, o X
 * da janela só a esconde: o Iris continua rodando — e os lembretes saindo —
 * até "Sair" no menu da bandeja. O menu traz o que é de hoje, lido na hora.
 */

let tray: Tray | null = null;
let ativa = false;
/** Ligado no before-quit: daí em diante o close fecha de verdade. */
let saindo = false;
let avisouQueEscondeu = false;
/** Linha extra no topo do menu e na dica (o Pomodoro põe o tempo aqui). */
let linhaExtra: { rotulo: string; aoClicar: () => void } | null = null;

const MAX_ITENS_NO_MENU = 8;

export function bandejaAtiva(): boolean {
  return ativa;
}

function abrirNoApp(item: ItemDia): void {
  focarJanela();
  broadcast('lembretes:abrir', { alvo: item.alvo });
}

async function montarMenu(): Promise<Menu> {
  const itens: MenuItemConstructorOptions[] = [];
  if (linhaExtra) {
    const extra = linhaExtra;
    itens.push({ label: extra.rotulo, click: () => extra.aoClicar() }, { type: 'separator' });
  }
  itens.push({ label: 'Abrir o Iris', click: () => focarJanela() }, { type: 'separator' });
  try {
    const dia = await hojeService.getDia();
    const lista = [...dia.atrasados, ...dia.doDia];
    if (!lista.length) itens.push({ label: 'Nada pendente para hoje', enabled: false });
    lista.slice(0, MAX_ITENS_NO_MENU).forEach((i) => {
      const quando = i.data < dia.hoje ? ' (atrasado)' : i.hora ? ` · ${i.hora}` : '';
      // & é atalho de menu no Windows: dobrado, aparece como texto.
      itens.push({ label: `${i.titulo}${quando}`.replace(/&/g, '&&').slice(0, 80), click: () => abrirNoApp(i) });
    });
    if (lista.length > MAX_ITENS_NO_MENU) {
      itens.push({ label: `+ ${lista.length - MAX_ITENS_NO_MENU} na Home`, click: () => abrirHojeNoApp() });
    }
  } catch {
    itens.push({ label: 'Não deu para ler o dia', enabled: false });
  }
  itens.push(
    { type: 'separator' },
    { label: 'Ver o dia inteiro', click: () => abrirHojeNoApp() },
    {
      label: 'Novo card…',
      click: () => {
        focarJanela();
        broadcast('app:executar', { acao: 'kanban.novo' });
      },
    },
    { type: 'separator' },
    { label: 'Sair do Iris', click: () => app.quit() },
  );
  return Menu.buildFromTemplate(itens);
}

function abrirHojeNoApp(): void {
  focarJanela();
  broadcast('lembretes:abrir', { tela: 'hoje' });
}

async function atualizarDica(): Promise<void> {
  if (!tray) return;
  try {
    const dia = await hojeService.getDia();
    const partes = [`${dia.doDia.length} para hoje`];
    if (dia.atrasados.length) partes.push(`${dia.atrasados.length} atrasado${dia.atrasados.length === 1 ? '' : 's'}`);
    tray.setToolTip(`Iris · ${linhaExtra ? `${linhaExtra.rotulo} · ` : ''}${partes.join(' · ')}`);
  } catch {
    tray.setToolTip('Iris');
  }
}

function criar(): void {
  if (tray) return;
  try {
    tray = new Tray(iconeDoApp());
  } catch (erro) {
    console.error('[bandeja] o sistema não aceitou o ícone', erro);
    tray = null;
    return;
  }
  tray.setToolTip('Iris');
  // O menu é montado na hora de abrir: o dia pode ter mudado desde o último clique.
  const abrirMenu = (): void => {
    void montarMenu().then((menu) => tray?.popUpContextMenu(menu));
  };
  tray.on('right-click', abrirMenu);
  // Clique simples abre a janela (no Linux, muitas áreas de trabalho só têm o menu).
  tray.on('click', () => focarJanela());
  // Linux sem evento de clique: o menu precisa estar fixado.
  if (process.platform === 'linux') void montarMenu().then((menu) => tray?.setContextMenu(menu));
  void atualizarDica();
}

function destruir(): void {
  tray?.destroy();
  tray = null;
}

let ouvindoSegunda = false;

/**
 * Com a bandeja ligada a janela some ao fechar — abrir o Iris de novo (atalho
 * do menu Iniciar) traria uma segunda instância esperando o bloqueio do perfil.
 * Então, com ela ligada, uma instância só: a segunda mostra esta e sai. Sem
 * bandeja o bloqueio não é pedido — o `npm run dev` ao lado do instalado
 * continua abrindo. Devolve false se outra instância já tem o bloqueio.
 */
export function garantirInstanciaUnica(): boolean {
  if (!app.hasSingleInstanceLock() && !app.requestSingleInstanceLock()) return false;
  if (!ouvindoSegunda) {
    ouvindoSegunda = true;
    app.on('second-instance', () => focarJanela());
  }
  return true;
}

export function aplicarBandeja(ligada: boolean): void {
  ativa = ligada;
  if (ligada) {
    garantirInstanciaUnica();
    criar();
  } else {
    // Solto o bloqueio: sem bandeja, voltam a valer duas janelas como antes.
    if (app.hasSingleInstanceLock()) app.releaseSingleInstanceLock();
    destruir();
  }
}

/** Chamado pela tarefa de lembretes (a cada minuto) e pelo Pomodoro. */
export function atualizarBandeja(): void {
  if (!tray) return;
  void atualizarDica();
  if (process.platform === 'linux') void montarMenu().then((menu) => tray?.setContextMenu(menu));
}

export function definirLinhaExtra(linha: { rotulo: string; aoClicar: () => void } | null): void {
  linhaExtra = linha;
  atualizarBandeja();
}

/** Liga o "fechar = esconder" na janela principal. */
export function prepararJanela(janela: BrowserWindow): void {
  janela.on('close', (e) => {
    if (!ativa || saindo || !tray) return;
    e.preventDefault();
    janela.hide();
    if (!avisouQueEscondeu) {
      avisouQueEscondeu = true;
      notificar('O Iris continua na bandeja', 'Os lembretes seguem chegando. Para fechar de vez, use "Sair do Iris" no ícone da bandeja.', () => focarJanela());
    }
  });
}

export function marcarSaida(): void {
  saindo = true;
}
