import type { PerfilUsuario } from '../../../shared/types/ajustes.types.js';
import {
  acharContato,
  nomeDoContato,
  refDe,
  type ContatosFile,
  type Contrato,
  type EmpresaCrm,
  type ModeloContrato,
  type Pessoa,
  type RefContato,
  type SituacaoContrato,
} from '../../../shared/types/contatos.types.js';
import {
  CAMPOS_CONTRATO,
  ESQUELETO_MODELO,
  GRUPOS_CAMPO,
  camposManuais,
  camposSemValor,
  preencher,
  rotuloDoCampo,
  valoresAutomaticos,
  type ContextoContrato,
} from '../../../shared/types/contratos.campos.js';
import { enderecoVazio, hojeLocal } from '../../../shared/types/brasil.js';
import { openConfirmModal, openCustomModal } from '../../ui/modal.js';
import { buildBotao, buildVazio } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import type { CtxContatos } from './contatos.casco.js';
import { buildDocumentoContrato, exportarContratoPdf, lerAjustes } from './contatos.documento.js';
import * as contatosState from './contatos.state.js';
import { ICONES_CONTATO, buildAvatar, buildSeloSituacao, el, quandoFoi } from './contatos.ui.js';

/**
 * Contratos: os modelos (texto com campos), o "Novo contrato" que preenche um
 * modelo com os dados do contato, e a tela do contrato — onde o rascunho ainda
 * se ajusta e a situação anda (rascunho → enviado → assinado, ou cancelado).
 */

const ESPERA_SALVAR_MS = 700;

// ---------- Contexto de preenchimento ----------

/** Contato fictício só para a prévia do modelo quando ainda não há ninguém cadastrado. */
function contatoExemplo(): Pessoa {
  const agora = new Date().toISOString();
  return {
    id: 'exemplo',
    createdAt: agora,
    updatedAt: agora,
    etapaId: '',
    ordem: 0,
    emails: ['maria@exemplo.com'],
    telefones: [{ numero: '(11) 98765-4321', tipo: 'celular' }],
    endereco: { ...enderecoVazio(), logradouro: 'Rua das Flores', numero: '100', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', cep: '01000-000' },
    redes: [],
    origem: '',
    tags: [],
    observacoes: '',
    arquivado: false,
    nome: 'Maria Exemplo da Silva',
    apelido: '',
    cpf: '000.000.000-00',
    rg: '',
    cargo: 'Diretora',
  };
}

function contextoDe(file: ContatosFile, contato: Pessoa | EmpresaCrm, perfil: PerfilUsuario): ContextoContrato {
  const empresaDaPessoa = !('razaoSocial' in contato) && contato.empresaId ? file.empresas.find((e) => e.id === contato.empresaId) : undefined;
  return { contato, ...(empresaDaPessoa ? { empresaDaPessoa } : {}), perfil, hoje: hojeLocal() };
}

/** Texto em edição → texto do contrato, com os campos do cadastro e os digitados. */
function montarTexto(corpo: string, ctx: ContextoContrato, manuais: Record<string, string>): string {
  return preencher(corpo, { ...valoresAutomaticos(ctx), ...manuais });
}

/** Insere `texto` na posição do cursor e devolve o foco ao editor. */
function inserirNoCursor(area: HTMLTextAreaElement, texto: string): void {
  const ini = area.selectionStart ?? area.value.length;
  const fim = area.selectionEnd ?? ini;
  area.setRangeText(texto, ini, fim, 'end');
  area.focus();
  area.dispatchEvent(new Event('input'));
}

/** Menu "Inserir campo", com os campos do catálogo agrupados. */
function buildInserirCampo(area: HTMLTextAreaElement): HTMLElement {
  const sel = el('select', 'md-input ct-inserir');
  sel.setAttribute('aria-label', 'Inserir campo');
  sel.appendChild(Object.assign(el('option'), { value: '', textContent: '+ Inserir campo…' }));
  GRUPOS_CAMPO.forEach((g) => {
    const grupo = el('optgroup');
    grupo.label = g.rotulo;
    CAMPOS_CONTRATO.filter((c) => c.grupo === g.id).forEach((c) => grupo.appendChild(Object.assign(el('option'), { value: c.chave, textContent: `${c.rotulo}  {${c.chave}}` })));
    sel.appendChild(grupo);
  });
  const outro = el('optgroup');
  outro.label = 'A preencher ao gerar';
  outro.appendChild(Object.assign(el('option'), { value: '__novo', textContent: 'Campo novo (ex.: {valor})…' }));
  sel.appendChild(outro);
  sel.addEventListener('change', () => {
    const v = sel.value;
    sel.value = '';
    if (!v) return;
    if (v === '__novo') {
      inserirNoCursor(area, '{valor}');
      // Seleciona o nome para a pessoa já digitar o dela.
      const fim = area.selectionStart;
      area.setSelectionRange(fim - 6, fim - 1);
      return;
    }
    inserirNoCursor(area, `{${v}}`);
  });
  return sel;
}

// ---------- Modelos ----------

/**
 * O modelo em edição e o texto ainda não salvo. Ficam fora do DOM porque a aba
 * Modelos é redesenhada a cada mudança do arquivo (lead chegando, outra ação):
 * o que foi digitado volta igual no desenho seguinte.
 */
let modeloSelecionado: string | null = null;
let rascunhoModelo: { id: string; nome: string; quandoUsar: string; corpo: string } | null = null;

/** Há texto de modelo não salvo: a casca não redesenha a tela por um push. */
export function modeloComMudancas(): boolean {
  return rascunhoModelo !== null;
}

function confirmarDescarte(): Promise<boolean> {
  if (!rascunhoModelo) return Promise.resolve(true);
  return openConfirmModal({ title: 'Mudanças não salvas', message: 'Este modelo tem mudanças que não foram salvas. Descartar?', confirmText: 'Descartar' }).then((ok) => {
    if (ok) rascunhoModelo = null;
    return ok;
  });
}

function ordenarModelos(modelos: ModeloContrato[]): ModeloContrato[] {
  return modelos.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** "Modelo 1", "Modelo 2"… o primeiro número livre (o main recusa nome repetido). */
function nomeLivre(modelos: ModeloContrato[]): string {
  const nomes = new Set(modelos.map((m) => m.nome.toLowerCase()));
  let n = modelos.length + 1;
  while (nomes.has(`modelo ${n}`)) n++;
  return `Modelo ${n}`;
}

/** O nome pedido, ou "Nome (2)", "Nome (3)"… se já existe um modelo com ele. */
function nomeDeCopia(modelos: ModeloContrato[], nome: string): string {
  const nomes = new Set(modelos.map((m) => m.nome.toLowerCase()));
  const base = nome.slice(0, 110);
  let candidato = base;
  for (let n = 2; nomes.has(candidato.toLowerCase()); n++) candidato = `${base} (${n})`;
  return candidato;
}

interface OpcoesEditorModelos {
  /** Onde vão Excluir/Duplicar/Salvar: o rodapé do modal ou a barra da aba. */
  acoes: HTMLElement;
  /** Botões que ficam sempre na barra (o "Fechar" do modal). */
  extras?: HTMLElement[];
  /** Na aba: "Usar num contrato" abre o Novo contrato já com o modelo. */
  usar?: (modeloId: string) => void;
  /** Redesenho depois de criar, duplicar, excluir, salvar ou trocar de modelo. */
  redesenhar: () => void;
}

/**
 * Lista de modelos à esquerda; nome, "para que serve", texto e prévia à
 * direita. A mesma peça serve a aba Modelos de Contatos e o modal aberto de
 * dentro do Novo contrato.
 */
function buildEditorModelos(ctx: CtxContatos, perfil: PerfilUsuario, op: OpcoesEditorModelos): HTMLElement {
  const f = contatosState.getCurrentState() ?? ctx.file;
  if (!f.modelos.some((m) => m.id === modeloSelecionado)) modeloSelecionado = ordenarModelos(f.modelos)[0]?.id ?? null;
  const grade = el('div', 'ct-modelos');
  const lista = el('nav', 'ct-modelos-lista');
  lista.setAttribute('aria-label', 'Modelos de contrato');
  const editor = el('div', 'ct-modelos-editor');
  grade.append(lista, editor);

  const exemplo: Pessoa | EmpresaCrm = f.pessoas[0] ?? f.empresas[0] ?? contatoExemplo();

  const novo = buildBotao('Novo modelo', { variante: 'primario', icone: ICONES_CONTATO.mais });
  novo.addEventListener('click', () => {
    void confirmarDescarte().then((ok) => {
      if (!ok) return;
      void contatosState
        .salvarModelo({ nome: nomeLivre(f.modelos), quandoUsar: '', corpo: ESQUELETO_MODELO })
        .then((id) => {
          modeloSelecionado = id ?? null;
          op.redesenhar();
        })
        .catch(ctx.falhou);
    });
  });
  lista.appendChild(novo);
  ordenarModelos(f.modelos).forEach((m) => {
    const ativo = m.id === modeloSelecionado;
    const r = rascunhoModelo?.id === m.id ? rascunhoModelo : null;
    const b = el('button', `ct-modelo-item${ativo ? ' is-ativo' : ''}`);
    b.type = 'button';
    if (ativo) b.setAttribute('aria-current', 'true');
    b.appendChild(el('strong', undefined, (r?.nome.trim() || m.nome)));
    const quando = r ? r.quandoUsar : m.quandoUsar;
    const manuais = camposManuais(m.corpo);
    b.appendChild(el('span', undefined, quando.trim() || (manuais.length ? `${manuais.length} campo(s) a preencher` : 'só campos automáticos')));
    if (r) b.appendChild(el('span', 'ct-modelo-sujo', 'não salvo'));
    b.addEventListener('click', () => {
      if (ativo) return;
      void confirmarDescarte().then((ok) => {
        if (!ok) return;
        modeloSelecionado = m.id;
        op.redesenhar();
      });
    });
    lista.appendChild(b);
  });

  const m = f.modelos.find((x) => x.id === modeloSelecionado);
  if (!m) {
    const criar = buildBotao('Criar o primeiro modelo', { variante: 'primario', icone: ICONES_CONTATO.mais });
    criar.addEventListener('click', () => novo.click());
    editor.appendChild(
      buildVazio(
        ICONES_CONTATO.modelo,
        'Nenhum modelo ainda',
        'Um modelo é o seu texto de contrato, escrito uma vez e guardado aqui — um para cada ocasião (serviço mensal, projeto fechado, parceria…). Campos entre chaves como {nome}, {documento} e {endereco} vêm do cadastro; {valor}, {prazo} ou qualquer outro nome você preenche ao gerar. O Iris não escreve cláusulas: o modelo novo vem só com a estrutura.',
        criar,
      ),
    );
    op.acoes.replaceChildren(el('span', 'ct-espaco'), ...(op.extras ?? []));
    return grade;
  }

  const r = rascunhoModelo?.id === m.id ? rascunhoModelo : { id: m.id, nome: m.nome, quandoUsar: m.quandoUsar, corpo: m.corpo };
  const nome = el('input', 'md-input ct-modelo-nome');
  nome.value = r.nome;
  nome.placeholder = 'Nome do modelo (ex.: Prestação de serviço mensal)';
  nome.setAttribute('aria-label', 'Nome do modelo');
  const quando = el('input', 'md-input ct-modelo-quando');
  quando.value = r.quandoUsar;
  quando.maxLength = 160;
  quando.placeholder = 'Ex.: clientes PJ com mensalidade fixa';
  const area = el('textarea', 'md-input ct-modelo-texto');
  area.value = r.corpo;
  area.spellcheck = true;
  area.setAttribute('aria-label', 'Texto do modelo');
  const barra = el('div', 'ct-modelo-barra');
  barra.append(buildInserirCampo(area), el('span', 'ct-modelo-dica', '# título · ## subtítulo · **negrito** · - lista · 1. lista numerada'));
  const manuaisEl = el('p', 'ct-modelo-manuais');
  const previa = el('div', 'ct-modelo-previa');
  const indicador = el('span', 'ct-salvo', rascunhoModelo?.id === m.id ? 'Não salvo' : '');

  const atualizar = (): void => {
    const manuais = camposManuais(area.value);
    manuaisEl.textContent = manuais.length ? `A preencher ao gerar: ${manuais.map((c) => `{${c}}`).join(', ')}` : 'Todos os campos vêm do cadastro.';
    const exemplos = Object.fromEntries(manuais.map((c) => [c, `[${rotuloDoCampo(c)}]`]));
    const contrato: Contrato = {
      id: 'previa',
      contato: refDe(exemplo),
      contatoNome: nomeDoContato(exemplo),
      modeloNome: m.nome,
      titulo: nome.value,
      corpo: montarTexto(area.value, contextoDe(f, exemplo, perfil), exemplos),
      campos: {},
      situacao: 'rascunho',
      historico: [],
      criadoEm: '',
      atualizadoEm: '',
    };
    previa.replaceChildren(buildDocumentoContrato(contrato, perfil, f));
  };
  const mudou = (): void => {
    rascunhoModelo = { id: m.id, nome: nome.value, quandoUsar: quando.value, corpo: area.value };
    indicador.textContent = 'Não salvo';
  };
  area.addEventListener('input', () => {
    mudou();
    atualizar();
  });
  nome.addEventListener('input', mudou);
  quando.addEventListener('input', mudou);

  const col = el('div', 'ct-modelo-col');
  const campoQuando = el('label', 'ct-modelo-campo');
  campoQuando.append(el('span', 'ct-modelo-rotulo', 'Para que serve'), quando);
  col.append(nome, campoQuando, barra, area, manuaisEl);
  const colPrevia = el('div', 'ct-modelo-col');
  colPrevia.append(el('span', 'ct-modelo-rotulo', `Prévia com ${exemplo.id === 'exemplo' ? 'um contato de exemplo' : nomeDoContato(exemplo)}`), previa);
  const duas = el('div', 'ct-modelo-duas');
  duas.append(col, colPrevia);
  editor.appendChild(duas);

  const excluir = buildBotao('Excluir', { variante: 'fantasma', icone: ICONES_CONTATO.lixeira });
  excluir.classList.add('is-perigo');
  excluir.addEventListener('click', () => {
    void openConfirmModal({ title: 'Excluir modelo', message: `Excluir "${m.nome}"? Os contratos já gerados com ele continuam iguais.` }).then((ok) => {
      if (!ok) return;
      void contatosState
        .excluirModelo(m.id)
        .then(() => {
          if (rascunhoModelo?.id === m.id) rascunhoModelo = null;
          modeloSelecionado = null;
          op.redesenhar();
        })
        .catch(ctx.falhou);
    });
  });
  const duplicar = buildBotao('Duplicar', { variante: 'fantasma', icone: ICONES_CONTATO.copiar, titulo: 'Uma cópia para fazer outra versão deste modelo' });
  duplicar.addEventListener('click', () => {
    void confirmarDescarte().then((ok) => {
      if (!ok) return;
      const antes = new Set(f.modelos.map((x) => x.id));
      void contatosState
        .duplicarModelo(m.id)
        .then(() => {
          modeloSelecionado = contatosState.getCurrentState()?.modelos.find((x) => !antes.has(x.id))?.id ?? modeloSelecionado;
          op.redesenhar();
        })
        .catch(ctx.falhou);
    });
  });
  const salvar = buildBotao('Salvar modelo', { variante: 'primario', icone: '<polyline points="20 6 9 17 4 12"/>' });
  salvar.addEventListener('click', () => {
    salvar.disabled = true;
    void contatosState
      .salvarModelo({ id: m.id, nome: nome.value, quandoUsar: quando.value, corpo: area.value })
      .then(() => {
        rascunhoModelo = null;
        mostrarToast('Modelo salvo', [], 2500);
        op.redesenhar();
      })
      .catch(ctx.falhou)
      .finally(() => {
        salvar.disabled = false;
      });
  });
  const botoes: HTMLElement[] = [excluir, duplicar, el('span', 'ct-espaco'), indicador, ...(op.extras ?? [])];
  if (op.usar) {
    const usar = buildBotao('Usar num contrato', { variante: 'secundario', icone: ICONES_CONTATO.contrato, titulo: 'Escolher o contato e gerar um contrato com este modelo' });
    usar.addEventListener('click', () => void confirmarDescarte().then((ok) => ok && op.usar!(m.id)));
    botoes.push(usar);
  }
  botoes.push(salvar);
  op.acoes.replaceChildren(...botoes);
  atualizar();
  return grade;
}

/** A aba Modelos de Contatos: o editor direto na tela, com as ações numa barra embaixo. */
export function buildAbaModelos(ctx: CtxContatos, perfil: PerfilUsuario | null, usar: (modeloId: string) => void): HTMLElement {
  const wrap = el('div', 'ct-modelos-aba');
  if (!perfil) {
    // Seus dados (Ajustes) entram na prévia; enquanto não chegam, nada de editor pela metade.
    wrap.appendChild(el('p', 'ct-nada', 'Carregando os modelos…'));
    return wrap;
  }
  const acoes = el('div', 'ct-modelos-acoes');
  wrap.append(buildEditorModelos(ctx, perfil, { acoes, usar, redesenhar: ctx.redesenhar }), acoes);
  return wrap;
}

/** O mesmo editor num modal, aberto de dentro do Novo contrato. `aoFechar` relê a lista de lá. */
export function abrirModelos(ctx: CtxContatos, abrirId?: string, aoFechar?: () => void): void {
  if (abrirId) {
    if (rascunhoModelo && rascunhoModelo.id !== abrirId) rascunhoModelo = null;
    modeloSelecionado = abrirId;
  }
  void lerAjustes()
    .then(({ perfil }) =>
      openCustomModal(
        'Modelos de contrato',
        ({ corpo, rodape, fechar }) => {
          const fecharBtn = buildBotao('Fechar', { variante: 'fantasma' });
          fecharBtn.addEventListener('click', () => void confirmarDescarte().then((ok) => ok && fechar()));
          const desenhar = (): void => {
            corpo.replaceChildren(buildEditorModelos(ctx, perfil, { acoes: rodape, extras: [fecharBtn], redesenhar: desenhar }));
          };
          desenhar();
        },
        { icone: ICONES_CONTATO.modelo, largura: 1180, subtitulo: 'Seus textos de contrato, um para cada ocasião, com campos preenchidos sozinhos', classe: 'ct-modelos-modal' },
      ),
    )
    .then(() => aoFechar?.())
    .catch(ctx.falhou);
}

// ---------- Escolher o contato ----------

function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Para o "Novo contrato" de fora da ficha: busca entre pessoas e empresas (arquivados fora). */
export function escolherContato(ctx: CtxContatos): Promise<RefContato | null> {
  let escolhido: RefContato | null = null;
  return openCustomModal(
    'Contrato com quem?',
    ({ corpo, fechar }) => {
      const f = contatosState.getCurrentState() ?? ctx.file;
      const itens = [...f.pessoas, ...f.empresas].filter((c) => !c.arquivado).sort((a, b) => nomeDoContato(a).localeCompare(nomeDoContato(b), 'pt-BR'));
      const busca = el('input', 'md-input');
      busca.type = 'search';
      busca.placeholder = 'Buscar pessoa ou empresa…';
      busca.setAttribute('aria-label', 'Buscar contato');
      const lista = el('div', 'ct-escolher-lista');
      const desenhar = (): void => {
        const termo = semAcento(busca.value.trim());
        lista.replaceChildren();
        const visiveis = itens.filter((c) => !termo || semAcento(nomeDoContato(c)).includes(termo)).slice(0, 80);
        if (!itens.length) lista.appendChild(el('p', 'ct-nada', 'Nenhum contato cadastrado. Cadastre uma pessoa ou empresa primeiro.'));
        else if (!visiveis.length) lista.appendChild(el('p', 'ct-nada', 'Ninguém com esse nome.'));
        visiveis.forEach((c) => {
          const b = el('button', 'ct-escolher-item');
          b.type = 'button';
          b.append(buildAvatar(c, 'p'), el('strong', undefined, nomeDoContato(c)), el('span', undefined, 'razaoSocial' in c ? 'Empresa' : 'Pessoa'));
          b.addEventListener('click', () => {
            escolhido = refDe(c);
            fechar();
          });
          lista.appendChild(b);
        });
      };
      busca.addEventListener('input', desenhar);
      busca.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') lista.querySelector<HTMLButtonElement>('.ct-escolher-item')?.click();
      });
      corpo.append(busca, lista);
      desenhar();
      setTimeout(() => busca.focus(), 0);
    },
    { icone: ICONES_CONTATO.contrato, largura: 460, subtitulo: 'O contrato sai com os dados do cadastro dele' },
  ).then(() => escolhido);
}

// ---------- Novo contrato ----------

/**
 * Modelos na ordem do Novo contrato: os usados por último primeiro (quem tem
 * um modelo "de sempre" já o encontra marcado), depois os nunca usados por nome.
 */
function modelosPorUso(file: ContatosFile): ModeloContrato[] {
  const ultimoUso = new Map<string, string>();
  file.contratos.forEach((c) => {
    if (c.modeloId && (ultimoUso.get(c.modeloId) ?? '') < c.criadoEm) ultimoUso.set(c.modeloId, c.criadoEm);
  });
  return file.modelos.slice().sort((a, b) => {
    const ua = ultimoUso.get(a.id) ?? '';
    const ub = ultimoUso.get(b.id) ?? '';
    if (ua !== ub) return ub.localeCompare(ua);
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

/** Novo contrato de fora da ficha (aba Contratos, aba Modelos): primeiro o contato. */
export function novoContratoEscolhendo(ctx: CtxContatos, modeloId?: string): void {
  void escolherContato(ctx).then((ref) => {
    if (ref) abrirNovoContrato(ctx, ref, modeloId);
  });
}

export function abrirNovoContrato(ctx: CtxContatos, ref: RefContato, modeloId?: string): void {
  const emCache = contatosState.getCurrentState() ?? ctx.file;
  // Sem modelo no cache, confere o arquivo antes de dizer que não há nenhum
  // (um backup importado ou outra janela pode ter trazido modelos).
  if (!emCache.modelos.length) {
    void contatosState
      .load()
      .then((f) => (f.modelos.length ? abrirNovoContratoCom(ctx, ref, f, modeloId) : abrirNovoContratoCom(ctx, ref, emCache, modeloId)))
      .catch(ctx.falhou);
    return;
  }
  abrirNovoContratoCom(ctx, ref, emCache, modeloId);
}

function abrirNovoContratoCom(ctx: CtxContatos, ref: RefContato, inicial: ContatosFile, modeloId?: string): void {
  let file = inicial;
  const contato = acharContato(file, ref);
  if (!contato) return;
  if (!file.modelos.length) {
    void openConfirmModal({
      title: 'Nenhum modelo de contrato',
      message: 'O contrato sai de um modelo seu: um texto com campos como {nome}, {documento} e {valor}, escrito uma vez e guardado na aba Modelos. Criar o primeiro agora?',
      confirmText: 'Criar modelo',
      danger: false,
    }).then((ok) => {
      // Depois de criar, volta direto para este contrato.
      if (ok) abrirModelos(ctx, undefined, () => (contatosState.getCurrentState()?.modelos.length ? abrirNovoContrato(ctx, ref) : undefined));
    });
    return;
  }
  void lerAjustes()
    .then(({ perfil }) =>
      openCustomModal(
        `Novo contrato — ${nomeDoContato(contato)}`,
        ({ corpo, rodape, fechar }) => {
          let modelo: ModeloContrato = file.modelos.find((m) => m.id === modeloId) ?? modelosPorUso(file)[0]!;
          const manuais: Record<string, string> = {};
          const contexto = contextoDe(file, contato, perfil);
          const grade = el('div', 'ct-novo');
          const form = el('div', 'ct-novo-form');
          const previa = el('div', 'ct-modelo-previa');
          const faltando = el('p', 'ct-faltando');
          const titulo = el('input', 'md-input');
          titulo.setAttribute('aria-label', 'Título do contrato');

          const camposEl = el('div', 'ct-novo-campos');
          const atualizar = (): void => {
            const texto = montarTexto(modelo.corpo, contexto, manuais);
            const vazios = camposSemValor(texto);
            faltando.hidden = !vazios.length;
            faltando.textContent = vazios.length ? `Ainda sem valor: ${vazios.map(rotuloDoCampo).join(', ')}. Preencha aqui ou no cadastro — ou siga e ajuste o texto no rascunho.` : '';
            const contrato: Contrato = { id: 'previa', contato: ref, contatoNome: nomeDoContato(contato), modeloNome: modelo.nome, titulo: titulo.value, corpo: texto, campos: {}, situacao: 'rascunho', historico: [], criadoEm: '', atualizadoEm: '' };
            previa.replaceChildren(buildDocumentoContrato(contrato, perfil, file));
          };
          const desenharCampos = (): void => {
            camposEl.replaceChildren();
            const lista = camposManuais(modelo.corpo);
            if (!lista.length) camposEl.appendChild(el('p', 'ct-modelo-dica', 'Este modelo só usa campos do cadastro — nada a preencher.'));
            lista.forEach((chave) => {
              const l = el('label', 'md-campo');
              l.appendChild(el('span', 'md-rotulo', rotuloDoCampo(chave)));
              const i = el('input', 'md-input');
              i.value = manuais[chave] ?? '';
              i.placeholder = `{${chave}}`;
              i.addEventListener('input', () => {
                manuais[chave] = i.value;
                atualizar();
              });
              l.appendChild(i);
              camposEl.appendChild(l);
            });
          };

          const sel = el('select', 'md-input');
          const quando = el('p', 'ct-novo-quando');
          const preencherSelect = (): void => {
            sel.replaceChildren(...modelosPorUso(file).map((m) => Object.assign(el('option'), { value: m.id, textContent: m.nome, title: m.quandoUsar })));
            sel.value = modelo.id;
            quando.textContent = modelo.quandoUsar;
            quando.hidden = !modelo.quandoUsar;
          };
          preencherSelect();
          sel.addEventListener('change', () => {
            modelo = file.modelos.find((m) => m.id === sel.value) ?? modelo;
            titulo.value = modelo.nome;
            quando.textContent = modelo.quandoUsar;
            quando.hidden = !modelo.quandoUsar;
            desenharCampos();
            atualizar();
          });
          // Editar ou criar um modelo sem sair daqui: o editor abre por cima e, ao
          // fechar, o seletor e a prévia releem o arquivo.
          const depoisDosModelos = (antes: Set<string>, preferir?: string): void => {
            const atual = contatosState.getCurrentState();
            if (!atual?.modelos.length) return;
            file = atual;
            // Um modelo criado lá dentro vem já escolhido.
            modelo =
              file.modelos.find((m) => !antes.has(m.id)) ??
              file.modelos.find((m) => m.id === preferir) ??
              file.modelos.find((m) => m.id === modelo.id) ??
              modelosPorUso(file)[0]!;
            titulo.value = modelo.nome;
            preencherSelect();
            desenharCampos();
            atualizar();
          };
          const linksModelo = el('div', 'ct-novo-links');
          const editarModelo = el('button', 'ct-link', 'Editar este modelo');
          editarModelo.type = 'button';
          editarModelo.addEventListener('click', () => {
            const id = modelo.id;
            const antes = new Set(file.modelos.map((m) => m.id));
            abrirModelos(ctx, id, () => depoisDosModelos(antes, id));
          });
          const novoModelo = el('button', 'ct-link', 'Ver todos os modelos');
          novoModelo.type = 'button';
          novoModelo.addEventListener('click', () => {
            const antes = new Set(file.modelos.map((m) => m.id));
            abrirModelos(ctx, undefined, () => depoisDosModelos(antes));
          });
          linksModelo.append(editarModelo, el('span', undefined, '·'), novoModelo);
          titulo.value = modelo.nome;
          titulo.addEventListener('input', atualizar);
          const campo = (rotulo: string, controle: HTMLElement): HTMLElement => {
            const l = el('label', 'md-campo');
            l.append(el('span', 'md-rotulo', rotulo), controle);
            return l;
          };
          form.append(campo('Modelo', sel), quando, linksModelo, campo('Título', titulo), el('h3', 'ct-novo-sub', 'Campos a preencher'), camposEl, faltando);
          if (!perfil.nome.trim()) form.appendChild(el('p', 'ct-pdf-aviso', 'Seus dados (Ajustes › Seus dados) estão vazios: os campos {meu_…} e a sua assinatura vão sair em branco.'));
          grade.append(form, previa);
          corpo.appendChild(grade);
          desenharCampos();
          atualizar();

          const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
          cancelar.addEventListener('click', fechar);
          const criar = buildBotao('Criar rascunho', { variante: 'primario', icone: ICONES_CONTATO.contrato });
          criar.addEventListener('click', () => {
            criar.disabled = true;
            void contatosState
              .criarContrato({ contato: ref, modeloId: modelo.id, titulo: titulo.value, corpo: montarTexto(modelo.corpo, contexto, manuais), campos: manuais })
              .then((id) => {
                fechar();
                if (id) ctx.abrirContrato(id);
              })
              .catch((e: unknown) => {
                criar.disabled = false;
                ctx.falhou(e);
              });
          });
          rodape.append(cancelar, criar);
        },
        { icone: ICONES_CONTATO.contrato, largura: 1120, subtitulo: 'Escolha o modelo e preencha o que não vem do cadastro', classe: 'ct-novo-modal' },
      ),
    )
    .catch(ctx.falhou);
}

// ---------- Tela do contrato ----------

let contratoEmEdicao: string | null = null;
let textoPendente: { titulo?: string; corpo?: string } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let indicador: HTMLElement | null = null;

export async function descarregarContrato(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!textoPendente || !contratoEmEdicao) return;
  const dados = textoPendente;
  textoPendente = null;
  await contatosState.atualizarContratoSilencioso({ id: contratoEmEdicao, ...dados });
  if (indicador) indicador.textContent = 'Salvo';
}

function agendar(mudanca: { titulo?: string; corpo?: string }): void {
  textoPendente = { ...(textoPendente ?? {}), ...mudanca };
  if (indicador) indicador.textContent = 'Salvando…';
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void descarregarContrato().catch(() => indicador && (indicador.textContent = 'Não salvou')), ESPERA_SALVAR_MS);
}

const PROXIMAS: Record<SituacaoContrato, Array<{ para: SituacaoContrato; rotulo: string; primario?: boolean }>> = {
  rascunho: [
    { para: 'enviado', rotulo: 'Marcar como enviado', primario: true },
    { para: 'cancelado', rotulo: 'Cancelar' },
  ],
  enviado: [
    { para: 'assinado', rotulo: 'Marcar como assinado', primario: true },
    { para: 'rascunho', rotulo: 'Voltar a rascunho' },
    { para: 'cancelado', rotulo: 'Cancelar' },
  ],
  assinado: [{ para: 'cancelado', rotulo: 'Cancelar contrato' }],
  cancelado: [{ para: 'rascunho', rotulo: 'Reabrir como rascunho' }],
};

export function buildContratoTela(ctx: CtxContatos, id: string): HTMLElement {
  const contrato = ctx.file.contratos.find((c) => c.id === id)!;
  if (contratoEmEdicao !== id) {
    textoPendente = null;
    contratoEmEdicao = id;
  }
  const view = el('div', 'pg-view ct-contrato');
  const topo = el('header', 'ct-ficha-topo');
  const voltar = buildBotao('Voltar', { icone: ICONES_CONTATO.voltar, variante: 'fantasma' });
  voltar.addEventListener('click', ctx.voltar);
  topo.appendChild(voltar);

  const quem = el('div', 'ct-ficha-nomes');
  const editavel = contrato.situacao === 'rascunho';
  const titulo = el('input', 'ct-contrato-titulo');
  titulo.value = contrato.titulo;
  titulo.readOnly = !editavel;
  titulo.setAttribute('aria-label', 'Título do contrato');
  titulo.addEventListener('input', () => agendar({ titulo: titulo.value }));
  quem.appendChild(titulo);
  const sub = el('div', 'ct-ficha-sub');
  sub.appendChild(buildSeloSituacao(contrato.situacao));
  const contato = acharContato(ctx.file, contrato.contato);
  if (contato) {
    const link = el('button', 'ct-link', nomeDoContato(contato));
    link.type = 'button';
    link.addEventListener('click', () => void descarregarContrato().then(() => ctx.abrirFicha(contrato.contato)));
    sub.appendChild(link);
  } else sub.appendChild(el('span', undefined, `${contrato.contatoNome} (contato excluído)`));
  if (contrato.modeloNome) sub.appendChild(el('span', undefined, `Modelo: ${contrato.modeloNome}`));
  quem.appendChild(sub);
  topo.appendChild(quem);

  const acoes = el('div', 'ct-ficha-acoes');
  indicador = el('span', 'ct-salvo', '');
  acoes.appendChild(indicador);
  const mudarPara = (para: SituacaoContrato): void => {
    void descarregarContrato()
      .then(() => contatosState.atualizarContrato({ id, situacao: para }))
      .catch(ctx.falhou);
  };
  PROXIMAS[contrato.situacao].forEach((p) => {
    const b = buildBotao(p.rotulo, { variante: p.primario ? 'primario' : 'secundario' });
    b.addEventListener('click', () => {
      if (p.para === 'cancelado') {
        void openConfirmModal({ title: 'Cancelar contrato', message: 'Marcar este contrato como cancelado? Ele continua guardado, com o histórico.', confirmText: 'Marcar cancelado' }).then((ok) => ok && mudarPara(p.para));
      } else mudarPara(p.para);
    });
    acoes.appendChild(b);
  });
  const pdf = buildBotao('PDF', { variante: 'secundario', icone: ICONES_CONTATO.pdf });
  pdf.addEventListener('click', () => {
    void descarregarContrato()
      .then(() => {
        const atual = contatosState.getCurrentState()?.contratos.find((c) => c.id === id) ?? contrato;
        return exportarContratoPdf(atual, contatosState.getCurrentState() ?? ctx.file);
      })
      .catch(ctx.falhou);
  });
  const duplicar = buildBotao('', { variante: 'fantasma', icone: ICONES_CONTATO.copiar, titulo: 'Duplicar (nova versão em rascunho)' });
  duplicar.setAttribute('aria-label', 'Duplicar contrato');
  duplicar.addEventListener('click', () => {
    void descarregarContrato()
      .then(() => contatosState.duplicarContrato(id))
      .then(() => mostrarToast('Cópia criada em rascunho — está na lista de contratos', [], 3500))
      .catch(ctx.falhou);
  });
  const excluir = buildBotao('', { variante: 'fantasma', icone: ICONES_CONTATO.lixeira, titulo: 'Excluir contrato' });
  excluir.classList.add('is-perigo');
  excluir.setAttribute('aria-label', 'Excluir contrato');
  excluir.addEventListener('click', () => {
    void openConfirmModal({ title: 'Excluir contrato', message: `Excluir "${contrato.titulo}"? Não dá para desfazer. Para só encerrar, prefira Cancelar.` }).then((ok) => {
      if (!ok) return;
      textoPendente = null;
      void contatosState.excluirContrato(id).then(ctx.voltar).catch(ctx.falhou);
    });
  });
  if (editavel) {
    // O texto deste rascunho vira um modelo novo: valores já preenchidos ficam como
    // texto, e a pessoa troca pelos {campos} que quiser na aba Modelos.
    const comoModelo = buildBotao('', { variante: 'fantasma', icone: ICONES_CONTATO.modelo, titulo: 'Salvar como modelo' });
    comoModelo.setAttribute('aria-label', 'Salvar como modelo');
    comoModelo.addEventListener('click', () => {
      void descarregarContrato()
        .then(() => {
          const f = contatosState.getCurrentState() ?? ctx.file;
          const atual = f.contratos.find((c) => c.id === id) ?? contrato;
          return contatosState.salvarModelo({ nome: nomeDeCopia(f.modelos, atual.titulo.trim() || 'Modelo'), quandoUsar: '', corpo: atual.corpo });
        })
        .then((novoId) => {
          if (novoId) modeloSelecionado = novoId;
          mostrarToast('Modelo criado com o texto deste contrato — ajuste-o na aba Modelos de Contatos', [], 4500);
        })
        .catch(ctx.falhou);
    });
    acoes.appendChild(comoModelo);
  }
  acoes.append(pdf, duplicar, excluir);
  topo.appendChild(acoes);
  view.appendChild(topo);

  const grade = el('div', 'ct-contrato-grade');
  const previa = el('div', 'ct-modelo-previa ct-contrato-previa');
  previa.dataset.rolagem = 'previa';
  const desenharPrevia = (corpoTexto: string): void => {
    void lerAjustes()
      .then(({ perfil }) => previa.replaceChildren(buildDocumentoContrato({ ...contrato, corpo: corpoTexto }, perfil, ctx.file)))
      .catch(() => undefined);
  };

  if (editavel) {
    const col = el('div', 'ct-modelo-col');
    const area = el('textarea', 'md-input ct-modelo-texto');
    area.value = textoPendente?.corpo ?? contrato.corpo;
    const vazios = el('p', 'ct-faltando');
    const conferir = (): void => {
      const lista = camposSemValor(area.value);
      vazios.hidden = !lista.length;
      vazios.textContent = lista.length ? `Campos ainda sem valor: ${lista.map((c) => `{${c}}`).join(', ')} — troque pelo texto certo antes de enviar.` : '';
    };
    area.addEventListener('input', () => {
      agendar({ corpo: area.value });
      conferir();
      desenharPrevia(area.value);
    });
    col.append(el('span', 'ct-modelo-rotulo', 'Texto deste contrato (ajustes aqui não mudam o modelo)'), area, vazios);
    conferir();
    grade.append(col, previa);
  } else {
    const aviso = el('div', 'ct-contrato-travado');
    aviso.textContent =
      contrato.situacao === 'cancelado'
        ? 'Contrato cancelado. Para usar de novo, reabra como rascunho ou duplique.'
        : 'Depois de enviado, o texto fica travado — é o documento que a outra parte recebeu. Para mudar, duplique (vira um rascunho novo).';
    const historico = el('ul', 'ct-contrato-hist');
    contrato.historico
      .slice()
      .reverse()
      .forEach((h) => {
        const li = el('li');
        li.append(buildSeloSituacao(h.situacao), el('span', undefined, `${quandoFoi(h.em.slice(0, 10))} · ${new Date(h.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`));
        historico.appendChild(li);
      });
    const col = el('div', 'ct-modelo-col');
    col.append(aviso, el('span', 'ct-modelo-rotulo', 'Situação'), historico);
    grade.append(col, previa);
  }
  desenharPrevia(textoPendente?.corpo ?? contrato.corpo);
  view.appendChild(grade);
  return view;
}
