import { ANTECEDENCIAS_POSTAGEM, type ConfigLembretes, type EstadoLembretes } from '../../../shared/types/lembretes.types.js';
import type {} from '../../../shared/types/preload-api.types';
import { campo, interruptor, select } from '../../ui/campos.js';
import { buildAviso, buildBotao } from '../../ui/pagina.js';
import { NO_LINUX } from '../../ui/plataforma.js';
import { abrirAjustes } from '../../core/navegacao.js';

/**
 * Ajustes › Notificações: o que avisar e quando. Cada mudança grava na hora
 * (como o resto de Ajustes); a tarefa de lembretes lê a config a cada minuto.
 */

export const ICONE_NOTIFICACOES = '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>';

let raiz: HTMLElement | null = null;
let estado: EstadoLembretes | null = null;
let aviso = '';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function inputHora(valor: string, aoMudar: (v: string) => void): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'text';
  i.className = 'md-input aj-nt-hora';
  i.value = valor;
  i.placeholder = '09:00';
  i.inputMode = 'numeric';
  i.maxLength = 5;
  i.addEventListener('change', () => {
    // Aceita "9", "930", "9:30", "21h": vira HH:mm; inválido volta ao que era.
    const limpo = i.value.trim().replace(/h$/i, '');
    const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(limpo);
    const h = m ? Number(m[1]) : NaN;
    const mi = m && m[2] ? Number(m[2]) : 0;
    if (!m || h > 23 || mi > 59) {
      i.value = valor;
      return;
    }
    const novo = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    i.value = novo;
    aoMudar(novo);
  });
  return i;
}

async function salvar(muda: (c: ConfigLembretes) => void): Promise<void> {
  if (!estado) return;
  const config: ConfigLembretes = JSON.parse(JSON.stringify(estado.config)) as ConfigLembretes;
  muda(config);
  const r = await window.irisAPI.lembretes.salvarConfig(config);
  if (r.ok) {
    estado = r.data;
    aviso = '';
  } else {
    aviso = r.error;
  }
  desenhar();
}

function desenhar(): void {
  if (!raiz) return;
  const filhos: HTMLElement[] = [];
  if (!estado) {
    raiz.replaceChildren(el('p', 'aj-tema-dica', 'Carregando…'));
    return;
  }
  const c = estado.config;
  if (!estado.suportado) filhos.push(buildAviso(`Este sistema não está mostrando notificações.${NO_LINUX ? ' No Linux, elas dependem do servidor de notificações da área de trabalho.' : ''}`, 'atencao'));

  filhos.push(interruptor('Lembretes do Iris', 'Avisos do sistema para o que está na Home', c.ativo, (v) => void salvar((x) => (x.ativo = v))));

  if (c.ativo) {
    const grupo = el('div', 'aj-nt-grupo');

    const antecedencia = select(
      String(c.postagens.antecedenciaMin),
      ANTECEDENCIAS_POSTAGEM.map((m) => ({ value: String(m), label: m === 60 ? '1 hora antes' : `${m} minutos antes` })),
    );
    antecedencia.addEventListener('change', () => void salvar((x) => (x.postagens.antecedenciaMin = Number(antecedencia.value))));
    grupo.append(
      interruptor('Postagens com horário', 'Antes do horário marcado na postagem', c.postagens.ativo, (v) => void salvar((x) => (x.postagens.ativo = v))),
    );
    if (c.postagens.ativo) grupo.appendChild(campo('Avisar', antecedencia));

    grupo.append(
      interruptor('Resumo dos prazos', 'Uma vez por dia: cards e checklists que vencem hoje e os atrasados', c.prazos.ativo, (v) => void salvar((x) => (x.prazos.ativo = v))),
    );
    if (c.prazos.ativo) grupo.appendChild(campo('No horário', inputHora(c.prazos.hora, (h) => void salvar((x) => (x.prazos.hora = h))), 'Ex.: 9, 930, 9:30'));

    grupo.append(
      interruptor('Rotinas do Quadro', 'No horário de cada rotina marcada para o dia', c.rotinas.ativo, (v) => void salvar((x) => (x.rotinas.ativo = v))),
      interruptor('Revisão da semana', 'Segunda-feira, no horário do resumo: o que foi feito na semana anterior', c.revisaoSemanal.ativo, (v) => void salvar((x) => (x.revisaoSemanal.ativo = v))),
      interruptor('Não perturbe', 'Nenhum aviso neste intervalo (pode virar a meia-noite)', c.naoPerturbe.ativo, (v) => void salvar((x) => (x.naoPerturbe.ativo = v))),
    );
    if (c.naoPerturbe.ativo) {
      const linha = el('div', 'md-grade-2');
      linha.append(
        campo('Das', inputHora(c.naoPerturbe.de, (h) => void salvar((x) => (x.naoPerturbe.de = h)))),
        campo('Até', inputHora(c.naoPerturbe.ate, (h) => void salvar((x) => (x.naoPerturbe.ate = h)))),
      );
      grupo.appendChild(linha);
    }
    filhos.push(grupo);

    const rodape = el('div', 'aj-nt-rodape');
    const testar = buildBotao('Mostrar um aviso de teste', { variante: 'secundario', icone: ICONE_NOTIFICACOES });
    testar.disabled = !estado.suportado;
    testar.addEventListener('click', () => {
      void window.irisAPI.lembretes.testar().then((r) => {
        aviso = r.ok ? '' : r.error;
        desenhar();
      });
    });
    rodape.appendChild(testar);
    filhos.push(rodape);
  }

  // O aviso só sai com o Iris aberto: a bandeja deixa ele aberto sem a janela.
  const dica = el('p', 'aj-tema-dica', 'Os lembretes só aparecem com o Iris aberto. Para ele continuar rodando ao fechar a janela, ligue "continuar na bandeja" em ');
  const link = el('button', 'aj-nt-link', 'Preferências');
  link.type = 'button';
  link.addEventListener('click', () => abrirAjustes('preferencias'));
  dica.append(link, document.createTextNode('.'));
  filhos.push(dica);
  if (aviso) filhos.push(el('p', 'bk-status is-erro', aviso));
  raiz.replaceChildren(...filhos);
}

export function buildSecaoNotificacoes(painel: HTMLElement): HTMLElement {
  const corpo = el('div', 'aj-corpo aj-nt');
  raiz = corpo;
  desenhar();
  void window.irisAPI.lembretes.getEstado().then((r) => {
    if (raiz !== corpo) return;
    if (r.ok) estado = r.data;
    else aviso = r.error;
    desenhar();
  });
  painel.appendChild(corpo);
  return painel;
}

export function destroySecaoNotificacoes(): void {
  raiz = null;
}
