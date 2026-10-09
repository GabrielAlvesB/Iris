import { INTERACOES_DO_APP, TIPOS_INTERACAO, type Interacao, type RefContato, type TipoInteracao } from '../../../shared/types/contatos.types.js';
import { hojeLocal } from '../../../shared/types/brasil.js';
import { openConfirmModal, openFormModal } from '../../ui/modal.js';
import { buildBotao, svg } from '../../ui/pagina.js';
import type { CtxContatos } from './contatos.casco.js';
import { botaoIcone } from './contatos.ficha.campos.js';
import { descarregarFicha } from './contatos.ficha.rascunho.js';
import * as contatosState from './contatos.state.js';
import { ICONES_CONTATO, ICONE_DO_TIPO_INTERACAO, buildIcone, el, horaDe, interacoesDe, quandoFoi } from './contatos.ui.js';

/**
 * A aba Histórico: registrar o que aconteceu (nota, ligação, reunião…) e a
 * linha do tempo do contato, por dia. O que o app escreve sozinho — mudança
 * de etapa, formulário do site, o resumo do WhatsApp — não se edita.
 */

/** Tipo escolhido no registro: sobrevive ao redesenho depois de registrar. */
let tipoRegistro: TipoInteracao = 'nota';

export function rotuloDoTipo(t: TipoInteracao): string {
  if (t === 'evento') return 'Registro do app';
  if (t === 'formulario') return 'Formulário do site';
  if (t === 'whatsapp-iris') return 'WhatsApp';
  return TIPOS_INTERACAO.find((x) => x.id === t)?.rotulo ?? t;
}

function buildRegistro(ctx: CtxContatos, ref: RefContato): HTMLElement {
  const caixa = el('div', 'ct-registro');
  const tipos = el('div', 'ct-registro-tipos');
  const texto = el('textarea', 'cf-entrada is-caixa ct-registro-texto');
  const desenharTipos = (): void => {
    tipos.replaceChildren();
    TIPOS_INTERACAO.forEach((t) => {
      const b = el('button', `ct-registro-tipo${tipoRegistro === t.id ? ' is-ativo' : ''}`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(tipoRegistro === t.id));
      b.innerHTML = svg(ICONE_DO_TIPO_INTERACAO[t.id] ?? '', 13, 2);
      b.appendChild(el('span', undefined, t.rotulo));
      b.addEventListener('click', () => {
        tipoRegistro = t.id;
        desenharTipos();
        texto.focus();
      });
      tipos.appendChild(b);
    });
  };
  desenharTipos();
  texto.rows = 3;
  texto.placeholder = 'O que foi conversado, combinado ou decidido…';
  texto.setAttribute('aria-label', 'O que aconteceu');
  const rodape = el('div', 'ct-registro-rodape');
  const quando = el('input', 'cf-entrada is-caixa is-curto');
  quando.type = 'datetime-local';
  const agora = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  quando.value = `${hojeLocal(agora)}T${p(agora.getHours())}:${p(agora.getMinutes())}`;
  quando.title = 'Quando aconteceu — dá para registrar algo de antes';
  quando.setAttribute('aria-label', 'Quando aconteceu');
  const registrar = buildBotao('Registrar', { variante: 'primario', icone: ICONES_CONTATO.mais, titulo: 'Registrar (Ctrl+Enter)' });
  const enviar = (): void => {
    if (!texto.value.trim()) {
      texto.focus();
      return;
    }
    registrar.disabled = true;
    void descarregarFicha()
      .then(() => contatosState.registrarInteracao({ contato: ref, tipo: tipoRegistro, data: quando.value, texto: texto.value }))
      .catch((e: unknown) => {
        registrar.disabled = false;
        ctx.falhou(e);
      });
  };
  registrar.addEventListener('click', enviar);
  texto.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      enviar();
    }
  });
  rodape.append(quando, el('span', 'ct-espaco'), registrar);
  caixa.append(tipos, texto, rodape);
  return caixa;
}

function buildItem(ctx: CtxContatos, i: Interacao, verConversa: () => void): HTMLElement {
  const item = el('article', `ct-hist-item is-${i.tipo}`);
  item.appendChild(buildIcone(ICONE_DO_TIPO_INTERACAO[i.tipo] ?? '', 'ct-hist-icone', 14));
  const corpo = el('div', 'ct-hist-corpo');
  const cab = el('div', 'ct-hist-cab');
  cab.append(el('strong', undefined, rotuloDoTipo(i.tipo)), el('span', 'ct-hist-quando', `${quandoFoi(i.data)} · ${horaDe(i.data)}`));
  if (!INTERACOES_DO_APP.has(i.tipo)) {
    const acoes = el('span', 'ct-hist-acoes');
    acoes.append(
      botaoIcone(ICONES_CONTATO.editar, 'Editar registro', () => void editarRegistro(ctx, i)),
      botaoIcone(
        ICONES_CONTATO.lixeira,
        'Excluir registro',
        () => {
          void openConfirmModal({ title: 'Excluir registro', message: 'Excluir este registro do histórico?' }).then((ok) => {
            if (ok) void contatosState.excluirInteracao(i.id).catch(ctx.falhou);
          });
        },
        'is-perigo',
      ),
    );
    cab.appendChild(acoes);
  }
  corpo.append(cab, el('p', 'ct-hist-texto', i.texto));
  if (i.tipo === 'whatsapp-iris') {
    const ver = el('button', 'ct-link', 'Ver a conversa');
    ver.type = 'button';
    ver.addEventListener('click', verConversa);
    corpo.appendChild(ver);
  }
  item.appendChild(corpo);
  return item;
}

async function editarRegistro(ctx: CtxContatos, i: Interacao): Promise<void> {
  const v = await openFormModal(
    'Editar registro',
    [
      { name: 'tipo', label: 'Tipo', type: 'select', options: TIPOS_INTERACAO.map((t) => ({ value: t.id, label: t.rotulo })), defaultValue: i.tipo, metade: true },
      { name: 'data', label: 'Quando', type: 'datetime-local', defaultValue: i.data, metade: true },
      { name: 'texto', label: 'O que aconteceu', type: 'textarea', defaultValue: i.texto },
    ],
    'Salvar',
    { icone: ICONES_CONTATO.editar },
  );
  if (!v) return;
  try {
    await contatosState.editarInteracao({ id: i.id, tipo: v.tipo as TipoInteracao, data: v.data, texto: v.texto });
  } catch (e) {
    ctx.falhou(e);
  }
}

export function buildAbaHistorico(ctx: CtxContatos, ref: RefContato, verConversa: () => void): HTMLElement {
  const aba = el('div', 'cf-historico');
  aba.appendChild(buildRegistro(ctx, ref));
  const itens = interacoesDe(ctx.file, ref);
  if (!itens.length) {
    aba.appendChild(el('p', 'cf-vazio is-grande', 'Nada registrado ainda. Anote aqui cada conversa, reunião ou combinado — a ficha vira a memória do relacionamento.'));
    return aba;
  }
  const linha = el('div', 'ct-hist');
  let diaAtual = '';
  itens.forEach((i) => {
    const dia = i.data.slice(0, 10);
    if (dia !== diaAtual) {
      diaAtual = dia;
      linha.appendChild(el('div', 'ct-hist-dia', quandoFoi(dia)));
    }
    linha.appendChild(buildItem(ctx, i, verConversa));
  });
  aba.appendChild(linha);
  return aba;
}
