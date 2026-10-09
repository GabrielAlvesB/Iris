import { hojeLocal } from '../../../shared/types/brasil.js';
import { ehPessoa, nomeDoContato, type EmpresaCrm, type Pessoa } from '../../../shared/types/contatos.types.js';
import type { PerfilUsuario } from '../../../shared/types/ajustes.types.js';
import { CAMPOS_WA, corpoDoTemplate, textoFinalWa, type ContextoWa } from '../../../shared/types/whatsapp.campos.js';
import type { ModeloMetaWa, ModeloWa, TemplateMeta } from '../../../shared/types/whatsapp.types.js';
import { abrirMenuIa } from '../../ui/ia.js';
import { mensagemDeErro, openConfirmModal } from '../../ui/modal.js';
import { buildBotao, svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { el } from '../contatos/contatos.ui.js';
import { cartao } from '../api-leads/api-leads.pecas.js';
import { ICONES_WA, formatarWa } from './whatsapp.ui.js';
import * as whatsappState from './whatsapp.state.js';
import type { CtxWa } from './whatsapp.view.js';

/**
 * Modelos de mensagem: lista à esquerda, editor à direita com a prévia num
 * contato de verdade (escolhido na hora). O modelo novo nasce vazio — o Iris
 * não escreve a mensagem por ninguém.
 */

interface Edicao {
  id?: string;
  nome: string;
  texto: string;
  meta?: ModeloMetaWa;
}

let selecionado: string | 'novo' | null = null;
let edicao: Edicao | null = null;
let exemploId = '';
let perfil: PerfilUsuario | null = null;
let templates: TemplateMeta[] | null = null;

function abrir(m: ModeloWa | null): void {
  selecionado = m ? m.id : 'novo';
  edicao = m ? { id: m.id, nome: m.nome, texto: m.texto, ...(m.metaTemplate ? { meta: structuredClone(m.metaTemplate) } : {}) } : { nome: '', texto: '' };
}

function contextoExemplo(ctx: CtxWa): ContextoWa | undefined {
  const c: Pessoa | EmpresaCrm | undefined = ctx.contatos.pessoas.find((p) => p.id === exemploId) ?? ctx.contatos.pessoas.find((p) => !p.arquivado) ?? ctx.contatos.empresas[0];
  if (!c || !perfil) return undefined;
  const empresaDaPessoa = ehPessoa(c) && c.empresaId ? ctx.contatos.empresas.find((e) => e.id === c.empresaId) : undefined;
  const agora = new Date();
  return { contato: c, ...(empresaDaPessoa ? { empresaDaPessoa } : {}), perfil, hoje: hojeLocal(agora), hora: agora.getHours() };
}

function buildLista(ctx: CtxWa): HTMLElement {
  const lista = el('div', 'wa-modelos-lista');
  const novo = buildBotao('Novo modelo', { variante: 'primario', icone: '<path d="M12 5v14"/><path d="M5 12h14"/>' });
  novo.addEventListener('click', () => {
    abrir(null);
    ctx.redesenhar();
  });
  lista.appendChild(novo);
  const modelos = [...ctx.wa.modelos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!modelos.length) lista.appendChild(el('p', 'cf-vazio', 'Nenhum modelo ainda. Um modelo guarda uma mensagem que você manda sempre, com os campos de cada contato.'));
  modelos.forEach((m) => {
    const b = el('button', `wa-modelo-item${m.id === selecionado ? ' is-ativo' : ''}`);
    b.type = 'button';
    const t = el('span', 'ct-mini-textos');
    t.append(el('strong', undefined, m.nome), el('span', undefined, (m.texto || m.metaTemplate?.corpo || '').replace(/\s+/g, ' ').slice(0, 80)));
    b.appendChild(t);
    if (m.metaTemplate) b.appendChild(el('span', 'wa-selo-meta', 'Meta'));
    b.addEventListener('click', () => {
      abrir(m);
      ctx.redesenhar();
    });
    lista.appendChild(b);
  });
  return lista;
}

function buildEditor(ctx: CtxWa, e: Edicao): HTMLElement {
  const { cartao: c, corpo } = cartao('modelo', ICONES_WA.modelo, e.id ? 'Editar modelo' : 'Novo modelo', 'O texto sai exatamente como na prévia, com os campos de cada contato.');
  const nome = el('input', 'cf-entrada is-caixa');
  nome.value = e.nome;
  nome.placeholder = 'Ex.: Primeiro contato, Lembrete de reunião';
  nome.setAttribute('aria-label', 'Nome do modelo');
  nome.addEventListener('input', () => (e.nome = nome.value));

  const texto = el('textarea', 'cf-entrada is-caixa wa-modelo-texto');
  texto.rows = 7;
  texto.value = e.texto;
  texto.placeholder = '{saudacao}, {como_chamar}! Tudo bem?';
  texto.setAttribute('aria-label', 'Texto do modelo');
  const previa = el('div', 'wa-composer-previa');

  const exemplo = el('select', 'wa-composer-select');
  exemplo.setAttribute('aria-label', 'Contato de exemplo para a prévia');
  [...ctx.contatos.pessoas, ...ctx.contatos.empresas]
    .filter((x) => !x.arquivado)
    .slice(0, 300)
    .forEach((x) => exemplo.appendChild(Object.assign(el('option'), { value: x.id, textContent: nomeDoContato(x) })));
  const ctxExemplo = contextoExemplo(ctx);
  if (ctxExemplo) exemplo.value = ctxExemplo.contato.id;

  const desenharPrevia = (): void => {
    previa.replaceChildren();
    const cx = contextoExemplo(ctx);
    const rotulo = el('span', 'wa-composer-rotulo', cx ? 'Prévia com' : 'Cadastre um contato para ver a prévia com dados de verdade');
    const cab = el('div', 'wa-previa-cab');
    cab.appendChild(rotulo);
    if (cx) cab.appendChild(exemplo);
    previa.appendChild(cab);
    const final = cx ? (e.meta ? corpoDoTemplate(e.meta, cx).texto : textoFinalWa(e.texto, cx)) : e.meta ? e.meta.corpo : e.texto;
    if (!final.trim()) return;
    const bolha = el('div', 'wa-bolha is-saida is-previa');
    const p = el('p', 'wa-bolha-texto');
    p.appendChild(formatarWa(final));
    bolha.appendChild(p);
    previa.appendChild(bolha);
  };
  exemplo.addEventListener('change', () => {
    exemploId = exemplo.value;
    desenharPrevia();
  });
  texto.addEventListener('input', () => {
    e.texto = texto.value;
    desenharPrevia();
  });

  const inserir = buildBotao('Inserir campo', { variante: 'fantasma', icone: ICONES_WA.campo });
  inserir.addEventListener('click', () =>
    abrirMenuIa(
      inserir,
      CAMPOS_WA.map((x) => ({
        rotulo: x.rotulo,
        dica: `{${x.chave}}`,
        icone: ICONES_WA.campo,
        fazer: () => {
          const ini = texto.selectionStart ?? texto.value.length;
          texto.setRangeText(`{${x.chave}}`, ini, texto.selectionEnd ?? ini, 'end');
          texto.focus();
          texto.dispatchEvent(new Event('input', { bubbles: true }));
        },
      })),
      { titulo: 'Inserir campo' },
    ),
  );
  const dica = el(
    'p',
    'cf-dica',
    'Campos que não são do cadastro ({valor}, {data_reuniao}) são pedidos na hora de enviar — e não valem no envio para vários. Formatação do WhatsApp: *negrito*, _itálico_, ~riscado~.',
  );

  const barra = el('div', 'wa-modelo-barra');
  barra.appendChild(inserir);
  corpo.append(rotular('Nome', nome), rotular('Texto', texto), barra, dica);
  corpo.appendChild(buildMeta(e, desenharPrevia));
  corpo.appendChild(previa);

  const acoes = el('div', 'wa-modelo-acoes');
  const salvar = buildBotao('Salvar modelo', { variante: 'primario', icone: '<polyline points="20 6 9 17 4 12"/>' });
  salvar.addEventListener('click', () => {
    salvar.disabled = true;
    void whatsappState
      .salvarModelo({ ...(e.id ? { id: e.id } : {}), nome: e.nome, texto: e.texto, metaTemplate: e.meta ?? null })
      .then((file) => {
        const salvo = e.id ? file.modelos.find((m) => m.id === e.id) : file.modelos.find((m) => m.nome === e.nome.trim() && m.texto === e.texto);
        if (salvo) abrir(salvo);
        mostrarToast('Modelo salvo.', [], 2000);
        ctx.redesenhar();
      })
      .catch((erro: unknown) => {
        salvar.disabled = false;
        ctx.falhou(erro);
      });
  });
  acoes.appendChild(salvar);
  if (e.id) {
    const excluir = buildBotao('Excluir', { variante: 'fantasma', icone: ICONES_WA.lixeira });
    excluir.addEventListener('click', () => {
      void openConfirmModal({ title: 'Excluir modelo', message: `Excluir o modelo "${e.nome}"? Mensagens já enviadas e envios para vários não mudam.`, confirmText: 'Excluir' }).then((ok) => {
        if (!ok) return;
        void whatsappState
          .excluirModelo(e.id!)
          .then(() => {
            selecionado = null;
            edicao = null;
            ctx.redesenhar();
          })
          .catch(ctx.falhou);
      });
    });
    acoes.appendChild(excluir);
  }
  corpo.appendChild(acoes);
  desenharPrevia();
  if (!perfil)
    void window.irisAPI.ajustes.getAjustes().then((r) => {
      if (r.ok) {
        perfil = r.data.perfil;
        desenharPrevia();
      }
    });
  return c;
}

function rotular(rotulo: string, controle: HTMLElement): HTMLElement {
  const l = el('label', 'wa-rotulado');
  l.append(el('span', 'cf-rotulo', rotulo), controle);
  return l;
}

/** Ligar a um template aprovado da Meta: fora das 24 h, a API oficial só aceita template. */
function buildMeta(e: Edicao, aoMudar: () => void): HTMLElement {
  const caixa = el('div', 'wa-meta');
  const desenhar = (): void => {
    caixa.replaceChildren();
    const cab = el('div', 'wa-meta-cab');
    cab.appendChild(el('strong', undefined, 'Template da Meta (API oficial)'));
    caixa.appendChild(cab);
    if (!e.meta) {
      caixa.appendChild(
        el('p', 'cf-dica', 'Opcional. Para iniciar conversa pela API oficial (fora das 24 h), a Meta só aceita um template aprovado no painel dela. Ligue aqui e diga o que vai em cada {{1}}, {{2}}…'),
      );
      const ligar = buildBotao('Ligar a um template', { variante: 'secundario', icone: ICONES_WA.conexao });
      ligar.addEventListener('click', () => void escolherTemplate(ligar));
      caixa.appendChild(ligar);
      return;
    }
    const meta = e.meta;
    const info = el('p', 'wa-meta-info');
    info.append(el('code', undefined, meta.nome), document.createTextNode(` · ${meta.idioma}`));
    caixa.appendChild(info);
    const corpoMeta = el('p', 'wa-meta-corpo');
    corpoMeta.appendChild(formatarWa(meta.corpo));
    caixa.appendChild(corpoMeta);
    meta.variaveis.forEach((v, i) => {
      const input = el('input', 'cf-entrada is-caixa');
      input.value = v;
      input.placeholder = i === 0 ? '{primeiro_nome}' : 'Texto ou campo';
      input.setAttribute('aria-label', `Variável {{${i + 1}}}`);
      input.addEventListener('input', () => {
        meta.variaveis[i] = input.value;
        aoMudar();
      });
      caixa.appendChild(rotular(`{{${i + 1}}}`, input));
    });
    const tirar = buildBotao('Desligar do template', { variante: 'fantasma' });
    tirar.addEventListener('click', () => {
      delete e.meta;
      desenhar();
      aoMudar();
    });
    caixa.appendChild(tirar);
  };

  async function escolherTemplate(ancora: HTMLButtonElement): Promise<void> {
    ancora.disabled = true;
    try {
      templates ??= unwrapTemplates(await window.irisAPI.whatsapp.listarTemplates());
      if (!templates.length) {
        mostrarToast('Nenhum template aprovado nesta conta da Meta.', [], 4000);
        return;
      }
      abrirMenuIa(
        ancora,
        templates.map((t) => ({
          rotulo: `${t.nome} (${t.idioma})`,
          dica: t.corpo.replace(/\s+/g, ' ').slice(0, 80),
          icone: ICONES_WA.modelo,
          grupo: t.categoria,
          fazer: () => {
            e.meta = { nome: t.nome, idioma: t.idioma, corpo: t.corpo, variaveis: Array.from({ length: t.variaveis }, (_, i) => (i === 0 ? '{primeiro_nome}' : '')) };
            desenhar();
            aoMudar();
          },
        })),
        { titulo: 'Templates aprovados' },
      );
    } catch (erro) {
      mostrarToast(mensagemDeErro(erro), [], 6000);
    } finally {
      ancora.disabled = false;
    }
  }

  desenhar();
  return caixa;
}

function unwrapTemplates(r: Awaited<ReturnType<typeof window.irisAPI.whatsapp.listarTemplates>>): TemplateMeta[] {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

export function buildModelos(ctx: CtxWa): HTMLElement[] {
  if (selecionado && selecionado !== 'novo' && !ctx.wa.modelos.some((m) => m.id === selecionado)) {
    selecionado = null;
    edicao = null;
  }
  if (!selecionado && ctx.wa.modelos.length) abrir([...ctx.wa.modelos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))[0]!);
  const grade = el('div', 'wa-modelos');
  grade.appendChild(buildLista(ctx));
  if (edicao) grade.appendChild(buildEditor(ctx, edicao));
  else {
    const vazio = el('div', 'wa-vazio');
    vazio.innerHTML = svg(ICONES_WA.modelo, 28, 1.5);
    vazio.append(el('strong', undefined, 'Crie o primeiro modelo'), el('p', undefined, 'Escreva a mensagem uma vez, com {primeiro_nome} e outros campos, e use em qualquer conversa ou num envio para vários.'));
    grade.appendChild(vazio);
  }
  return [grade];
}
