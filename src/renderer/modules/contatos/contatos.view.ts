import {
  SITUACOES_CONTRATO,
  nomeDoContato,
  type ContatosFile,
  type RefContato,
  type SituacaoContrato,
} from '../../../shared/types/contatos.types.js';
import { formatarDocumento, formatarTelefone } from '../../../shared/types/brasil.js';
import { consumirContatoPendente, onContatoSolicitado } from '../../core/navegacao.js';
import { openFormModal } from '../../ui/modal.js';
import { buildBotao, buildBusca, buildCabecalho, buildSegmentado, buildSelo, buildVazio, svg, type Tom } from '../../ui/pagina.js';
import { criarCasco, falhou, type CtxContatos } from './contatos.casco.js';
import { buildFunil } from './contatos.funil.js';
import { buildAbaModelos, modeloComMudancas, novoContratoEscolhendo } from './contatos.contratos.js';
import { lerAjustes } from './contatos.documento.js';
import type { PerfilUsuario } from '../../../shared/types/ajustes.types.js';
import * as contatosState from './contatos.state.js';
import {
  ICONES_CONTATO,
  buildAvatar,
  buildSeloEtapa,
  buildSeloSituacao,
  casaBusca,
  el,
  etapaDe,
  paraContatar,
  quandoFoi,
  situacaoDoProximo,
  subtituloDo,
  todosOsContatos,
  ultimoContato,
  type ItemContato,
} from './contatos.ui.js';

/**
 * Contatos — o CRM: Pessoas · Empresas · Funil · Contratos e, por cima, a
 * ficha de um contato ou um contrato aberto (a casca comum, contatos.casco.ts).
 * Leads, Relatórios de leads e API e n8n são módulos à parte na mesma
 * categoria, sobre o mesmo arquivo. O estado da tela (aba, busca, filtros)
 * mora aqui.
 */

export type { CtxContatos } from './contatos.casco.js';

type Aba = 'pessoas' | 'empresas' | 'funil' | 'contratos' | 'modelos';
type Ordem = 'nome' | 'ultimo' | 'proximo' | 'recentes';

let aba: Aba = 'pessoas';
let busca = '';
let filtroEtapa = '';
let filtroTag = '';
let ordem: Ordem = 'nome';
let arquivados = false;
let filtroSituacao: SituacaoContrato | '' = '';
let ctxAtual: CtxContatos | null = null;
/** Seus dados (Ajustes), para a prévia da aba Modelos: lidos uma vez por montagem. */
let perfil: PerfilUsuario | null = null;

const casco = criarCasco({
  rotuloVoltar: 'Contatos',
  desenharTela: (c) => {
    ctxAtual = c;
    return buildAbas(c.file);
  },
  // Busca rápida (Ctrl+P) ou outro módulo pedindo uma ficha.
  consumirPedido: consumirContatoPendente,
  onPedido: onContatoSolicitado,
  // Modelo com texto não salvo: um lead chegando troca o cache sem redesenhar a aba.
  emEdicao: () => aba === 'modelos' && modeloComMudancas(),
  aoDestruir: () => {
    perfil = null;
  },
});

export const montar = casco.montar;
export const destroy = casco.destroy;

function ctx(_file: ContatosFile): CtxContatos {
  return ctxAtual!;
}

function abrirFicha(ref: RefContato): void {
  ctxAtual?.abrirFicha(ref);
}

function abrirContrato(id: string): void {
  ctxAtual?.abrirContrato(id);
}

/** Filtros e busca: redesenha mantendo a rolagem e o foco da busca. */
function redesenhar(trocouDeTela = false): void {
  casco.redesenhar(trocouDeTela);
}

// ---------- Abas ----------

function irPara(destino: Aba): void {
  if (aba === destino) return;
  aba = destino;
  redesenhar(true);
}

function buildAbas(file: ContatosFile): HTMLElement {
  const view = el('div', 'pg-view ct-view');

  const novaPessoa = buildBotao('Nova pessoa', { icone: ICONES_CONTATO.pessoa, variante: 'primario' });
  novaPessoa.addEventListener('click', () => void criarPessoa(file));
  const novaEmpresa = buildBotao('Nova empresa', { icone: ICONES_CONTATO.empresa, variante: 'secundario' });
  novaEmpresa.addEventListener('click', () => void criarEmpresa());
  const modelos = buildBotao('', { icone: ICONES_CONTATO.modelo, variante: 'secundario', titulo: 'Modelos de contrato' });
  modelos.setAttribute('aria-label', 'Modelos de contrato');
  modelos.addEventListener('click', () => irPara('modelos'));
  view.appendChild(
    buildCabecalho({
      icone: ICONES_CONTATO.pessoa,
      titulo: 'Contatos',
      subtitulo: 'Pessoas e empresas com quem você trabalha — histórico, funil e contratos',
      acoes: [modelos, novaEmpresa, novaPessoa],
    }),
  );

  const pendentes = paraContatar(file);
  if (pendentes.length) view.appendChild(buildParaContatar(pendentes));

  const barra = el('div', 'ct-barra');
  const n = (lista: unknown[]): string => (lista.length ? ` · ${lista.length}` : '');
  barra.appendChild(
    buildSegmentado<Aba>(
      [
        { value: 'pessoas', label: `Pessoas${n(file.pessoas.filter((p) => !p.arquivado))}` },
        { value: 'empresas', label: `Empresas${n(file.empresas.filter((e) => !e.arquivado))}` },
        { value: 'funil', label: 'Funil' },
        { value: 'contratos', label: `Contratos${n(file.contratos)}` },
        { value: 'modelos', label: `Modelos${n(file.modelos)}` },
      ],
      aba,
      (v) => {
        aba = v;
        redesenhar(true);
      },
    ),
  );
  if (aba !== 'funil' && aba !== 'modelos') {
    const caixa = buildBusca(busca, aba === 'contratos' ? 'Buscar contrato ou contato…' : 'Nome, e-mail, telefone, CPF…', (v) => {
      busca = v;
      redesenhar();
    });
    caixa.classList.add('ct-busca');
    barra.appendChild(caixa);
  }
  view.appendChild(barra);

  const corpo = el('div', 'pg-rolagem ct-corpo');
  corpo.dataset.rolagem = `aba-${aba}`;
  if (aba === 'pessoas' || aba === 'empresas') corpo.appendChild(buildLista(file, aba));
  else if (aba === 'funil') corpo.appendChild(buildFunil(ctx(file)));
  else if (aba === 'modelos') {
    corpo.classList.add('is-modelos');
    corpo.appendChild(buildAbaModelos(ctx(file), perfil, (modeloId) => novoContratoEscolhendo(ctx(file), modeloId)));
    if (!perfil) {
      void lerAjustes()
        .then((a) => {
          perfil = a.perfil;
          if (aba === 'modelos') redesenhar();
        })
        .catch(falhou);
    }
  } else corpo.appendChild(buildContratos(file));
  view.appendChild(corpo);
  return view;
}

/** O lembrete diário: quem falar hoje e quem ficou para trás. */
function buildParaContatar(itens: ItemContato[]): HTMLElement {
  const faixa = el('section', 'ct-faixa');
  const titulo = el('div', 'ct-faixa-titulo');
  titulo.innerHTML = svg(ICONES_CONTATO.sino, 15, 2);
  titulo.appendChild(el('span', undefined, 'Para contatar'));
  faixa.appendChild(titulo);
  const lista = el('div', 'ct-faixa-lista');
  itens.slice(0, 12).forEach(({ ref, c }) => {
    const prox = c.proximoContato!;
    const atrasado = situacaoDoProximo(prox.data) === 'atrasado';
    const item = el('button', `ct-faixa-item${atrasado ? ' is-atrasado' : ''}`);
    item.type = 'button';
    item.appendChild(buildAvatar(c, 'p'));
    const textos = el('span', 'ct-faixa-textos');
    textos.append(el('strong', undefined, nomeDoContato(c)), el('span', undefined, `${atrasado ? 'Atrasado · ' : ''}${quandoFoi(prox.data)}${prox.nota ? ` — ${prox.nota}` : ''}`));
    item.appendChild(textos);
    item.addEventListener('click', () => abrirFicha(ref));
    lista.appendChild(item);
  });
  if (itens.length > 12) lista.appendChild(el('span', 'ct-faixa-mais', `e mais ${itens.length - 12}`));
  faixa.appendChild(lista);
  return faixa;
}

// ---------- Lista de pessoas / empresas ----------

function buildFiltros(file: ContatosFile, tipo: 'pessoas' | 'empresas'): HTMLElement {
  const linha = el('div', 'ct-filtros');
  const select = (valor: string, opcoes: Array<[string, string]>, rotulo: string, aoMudar: (v: string) => void): HTMLSelectElement => {
    const s = el('select', 'md-input ct-filtro');
    s.setAttribute('aria-label', rotulo);
    opcoes.forEach(([v, t]) => s.appendChild(Object.assign(el('option'), { value: v, textContent: t })));
    s.value = valor;
    s.addEventListener('change', () => aoMudar(s.value));
    return s;
  };
  linha.appendChild(
    select(filtroEtapa, [['', 'Todas as etapas'], ...file.etapas.map((e): [string, string] => [e.id, e.nome])], 'Filtrar por etapa', (v) => {
      filtroEtapa = v;
      redesenhar();
    }),
  );
  const lista = tipo === 'pessoas' ? file.pessoas : file.empresas;
  const tags = [...new Set(lista.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (tags.length) {
    linha.appendChild(
      select(filtroTag, [['', 'Todas as tags'], ...tags.map((t): [string, string] => [t, t])], 'Filtrar por tag', (v) => {
        filtroTag = v;
        redesenhar();
      }),
    );
  }
  linha.appendChild(
    select(
      ordem,
      [
        ['nome', 'Ordem: nome'],
        ['ultimo', 'Ordem: último contato'],
        ['proximo', 'Ordem: próximo contato'],
        ['recentes', 'Ordem: cadastrados por último'],
      ],
      'Ordenar',
      (v) => {
        ordem = v as Ordem;
        redesenhar();
      },
    ),
  );
  const arq = el('button', `md-pilula ct-arquivados${arquivados ? ' is-ativa' : ''}`);
  arq.type = 'button';
  arq.setAttribute('aria-pressed', String(arquivados));
  arq.innerHTML = svg(ICONES_CONTATO.arquivo, 13, 2);
  arq.appendChild(el('span', undefined, 'Arquivados'));
  arq.addEventListener('click', () => {
    arquivados = !arquivados;
    redesenhar();
  });
  linha.appendChild(arq);
  return linha;
}

function buildLista(file: ContatosFile, tipo: 'pessoas' | 'empresas'): HTMLElement {
  const wrap = el('div', 'ct-lista-wrap');
  wrap.appendChild(buildFiltros(file, tipo));

  const base: ItemContato[] = todosOsContatos(file).filter(({ ref }) => ref.tipo === (tipo === 'pessoas' ? 'pessoa' : 'empresa'));
  const itens = base
    .filter(({ c }) => c.arquivado === arquivados)
    .filter(({ c }) => !filtroEtapa || c.etapaId === filtroEtapa)
    .filter(({ c }) => !filtroTag || c.tags.includes(filtroTag))
    .filter(({ c }) => casaBusca(c, busca));

  const ultimo = new Map(itens.map((i) => [i.c.id, ultimoContato(file, i.ref)?.data ?? '']));
  itens.sort((a, b) => {
    if (ordem === 'ultimo') return (ultimo.get(b.c.id) ?? '').localeCompare(ultimo.get(a.c.id) ?? '');
    if (ordem === 'proximo') return (a.c.proximoContato?.data ?? '9999').localeCompare(b.c.proximoContato?.data ?? '9999');
    if (ordem === 'recentes') return b.c.createdAt.localeCompare(a.c.createdAt);
    return nomeDoContato(a.c).localeCompare(nomeDoContato(b.c), 'pt-BR');
  });

  if (!base.length) {
    const criar = buildBotao(tipo === 'pessoas' ? 'Cadastrar a primeira pessoa' : 'Cadastrar a primeira empresa', { icone: ICONES_CONTATO.mais, variante: 'primario' });
    criar.addEventListener('click', () => void (tipo === 'pessoas' ? criarPessoa(file) : criarEmpresa()));
    wrap.appendChild(
      buildVazio(
        tipo === 'pessoas' ? ICONES_CONTATO.pessoa : ICONES_CONTATO.empresa,
        tipo === 'pessoas' ? 'Nenhuma pessoa ainda' : 'Nenhuma empresa ainda',
        tipo === 'pessoas'
          ? 'Cadastre as pessoas com quem você trabalha ou conversa: clientes, contatos de empresa, indicações. A ficha de cada uma guarda o histórico e os contratos.'
          : 'Cadastre as empresas que você atende, com CNPJ e endereço — as pessoas podem ser ligadas a elas e os contratos saem com esses dados.',
        criar,
      ),
    );
    return wrap;
  }
  if (!itens.length) {
    wrap.appendChild(el('p', 'ct-nada', arquivados ? 'Nada arquivado com esses filtros.' : 'Ninguém com esses filtros.'));
    return wrap;
  }

  const tabela = el('div', 'ct-tabela');
  tabela.setAttribute('role', 'list');
  const cab = el('div', 'ct-linha is-cabecalho');
  cab.setAttribute('aria-hidden', 'true');
  ['Nome', 'Etapa', 'Contato', 'Último contato', 'Próximo'].forEach((t) => cab.appendChild(el('span', undefined, t)));
  tabela.appendChild(cab);
  itens.forEach((item) => tabela.appendChild(buildLinha(file, item, ultimo.get(item.c.id) ?? '')));
  wrap.appendChild(tabela);
  return wrap;
}

function buildLinha(file: ContatosFile, { ref, c }: ItemContato, ultimo: string): HTMLElement {
  const linha = el('button', 'ct-linha');
  linha.type = 'button';
  linha.setAttribute('role', 'listitem');
  linha.addEventListener('click', () => abrirFicha(ref));

  const quem = el('span', 'ct-quem');
  quem.appendChild(buildAvatar(c));
  const nomes = el('span', 'ct-quem-textos');
  nomes.appendChild(el('strong', undefined, nomeDoContato(c)));
  const sub = subtituloDo(file, c);
  if (sub) nomes.appendChild(el('span', undefined, sub));
  if (c.tags.length) {
    const tags = el('span', 'ct-tags');
    c.tags.slice(0, 3).forEach((t) => tags.appendChild(el('span', 'ct-tag', t)));
    nomes.appendChild(tags);
  }
  quem.appendChild(nomes);

  const contato = el('span', 'ct-contato-curto');
  const email = c.emails[0];
  const tel = c.telefones[0];
  if (email) contato.appendChild(el('span', undefined, email));
  if (tel) contato.appendChild(el('span', undefined, formatarTelefone(tel.numero)));
  if (!email && !tel) {
    const doc = 'razaoSocial' in c ? c.cnpj : c.cpf;
    contato.appendChild(el('span', 'is-vazio', doc ? formatarDocumento(doc) : '—'));
  }

  const proximo = el('span', 'ct-proximo');
  if (c.proximoContato) {
    const sit = situacaoDoProximo(c.proximoContato.data);
    const tom: Tom = sit === 'atrasado' ? 'erro' : sit === 'hoje' ? 'atencao' : 'neutro';
    proximo.appendChild(buildSelo(quandoFoi(c.proximoContato.data), tom));
  } else proximo.appendChild(el('span', 'is-vazio', '—'));

  linha.append(quem, buildSeloEtapa(etapaDe(file, c.etapaId)), contato, el('span', 'ct-ultimo', ultimo ? quandoFoi(ultimo) : 'nunca'), proximo);
  return linha;
}

// ---------- Contratos ----------

function buildContratos(file: ContatosFile): HTMLElement {
  const wrap = el('div', 'ct-lista-wrap');
  const filtros = el('div', 'ct-filtros');
  const pilulas = el('div', 'md-pilulas');
  ([['', 'Todos'], ...SITUACOES_CONTRATO.map((s) => [s.id, s.rotulo])] as Array<[SituacaoContrato | '', string]>).forEach(([id, rotulo]) => {
    const b = el('button', `md-pilula${filtroSituacao === id ? ' is-ativa' : ''}`, rotulo);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(filtroSituacao === id));
    b.addEventListener('click', () => {
      filtroSituacao = id;
      redesenhar();
    });
    pilulas.appendChild(b);
  });
  filtros.appendChild(pilulas);
  const modelos = buildBotao('Modelos', { icone: ICONES_CONTATO.modelo, variante: 'secundario', titulo: 'Seus modelos de contrato' });
  modelos.addEventListener('click', () => irPara('modelos'));
  const novo = buildBotao('Novo contrato', { icone: ICONES_CONTATO.mais, variante: 'primario' });
  novo.addEventListener('click', () => novoContratoEscolhendo(ctx(file)));
  const botoes = el('div', 'ct-filtros-acoes');
  botoes.append(modelos, novo);
  filtros.appendChild(botoes);
  wrap.appendChild(filtros);

  const n = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const contratos = file.contratos
    .filter((c) => !filtroSituacao || c.situacao === filtroSituacao)
    .filter((c) => !busca.trim() || n(`${c.titulo} ${c.contatoNome} ${c.modeloNome}`).includes(n(busca.trim())))
    .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));

  if (!file.contratos.length) {
    const ir = buildBotao(file.modelos.length ? 'Ver os modelos' : 'Criar o primeiro modelo', { icone: ICONES_CONTATO.modelo, variante: 'primario' });
    ir.addEventListener('click', () => irPara('modelos'));
    wrap.appendChild(
      buildVazio(
        ICONES_CONTATO.contrato,
        'Nenhum contrato ainda',
        'Escreva seus modelos uma vez, na aba Modelos, com campos como {nome}, {documento} e {valor}. "Novo contrato" (aqui ou na ficha de cada contato) preenche o modelo com os dados dele e gera o PDF.',
        ir,
      ),
    );
    return wrap;
  }
  if (!contratos.length) {
    wrap.appendChild(el('p', 'ct-nada', 'Nenhum contrato com esses filtros.'));
    return wrap;
  }
  const tabela = el('div', 'ct-tabela is-contratos');
  const cab = el('div', 'ct-linha is-cabecalho');
  cab.setAttribute('aria-hidden', 'true');
  ['Contrato', 'Contato', 'Situação', 'Atualizado'].forEach((t) => cab.appendChild(el('span', undefined, t)));
  tabela.appendChild(cab);
  contratos.forEach((c) => {
    const linha = el('button', 'ct-linha');
    linha.type = 'button';
    linha.addEventListener('click', () => abrirContrato(c.id));
    const titulo = el('span', 'ct-quem');
    titulo.appendChild(el('span', 'ct-doc-icone')).innerHTML = svg(ICONES_CONTATO.contrato, 16);
    const textos = el('span', 'ct-quem-textos');
    textos.appendChild(el('strong', undefined, c.titulo));
    if (c.modeloNome) textos.appendChild(el('span', undefined, `Modelo: ${c.modeloNome}`));
    titulo.appendChild(textos);
    linha.append(titulo, el('span', 'ct-contato-curto', c.contatoNome), buildSeloSituacao(c.situacao), el('span', 'ct-ultimo', quandoFoi(c.atualizadoEm.slice(0, 10))));
    tabela.appendChild(linha);
  });
  wrap.appendChild(tabela);
  return wrap;
}

// ---------- Criar ----------

async function criarPessoa(file: ContatosFile): Promise<void> {
  const valores = await openFormModal(
    'Nova pessoa',
    [
      { name: 'nome', label: 'Nome', placeholder: 'Nome completo' },
      { name: 'telefone', label: 'Telefone', placeholder: '(11) 98765-4321', metade: true },
      { name: 'email', label: 'E-mail', placeholder: 'nome@exemplo.com', metade: true },
      ...(file.empresas.length
        ? [
            {
              name: 'empresaId',
              label: 'Empresa',
              type: 'select' as const,
              options: [{ value: '', label: 'Nenhuma' }, ...file.empresas.filter((e) => !e.arquivado).map((e) => ({ value: e.id, label: nomeDoContato(e) }))],
              metade: true,
            },
            { name: 'cargo', label: 'Cargo', placeholder: 'Ex.: Gerente de marketing', metade: true },
          ]
        : []),
      { name: 'etapaId', label: 'Etapa', type: 'select' as const, options: file.etapas.map((e) => ({ value: e.id, label: e.nome })), defaultValue: file.etapas[0]?.id },
    ],
    'Cadastrar e abrir',
    { icone: ICONES_CONTATO.pessoa, subtitulo: 'O resto (CPF, endereço, redes) se completa na ficha.' },
  );
  if (!valores) return;
  try {
    const id = await contatosState.criarPessoa({
      nome: valores.nome ?? '',
      emails: valores.email ? [valores.email] : [],
      telefones: valores.telefone ? [{ numero: valores.telefone, tipo: 'celular' }] : [],
      ...(valores.empresaId ? { empresaId: valores.empresaId } : {}),
      cargo: valores.cargo ?? '',
      etapaId: valores.etapaId,
    });
    if (id) abrirFicha({ tipo: 'pessoa', id });
  } catch (e) {
    falhou(e);
  }
}

async function criarEmpresa(): Promise<void> {
  const file = contatosState.getCurrentState();
  const valores = await openFormModal(
    'Nova empresa',
    [
      { name: 'razaoSocial', label: 'Razão social', placeholder: 'Como está no CNPJ' },
      { name: 'nomeFantasia', label: 'Nome fantasia', placeholder: 'Como todo mundo chama', metade: true },
      { name: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0000-00', metade: true },
      { name: 'telefone', label: 'Telefone', metade: true },
      { name: 'email', label: 'E-mail', metade: true },
      { name: 'etapaId', label: 'Etapa', type: 'select' as const, options: (file?.etapas ?? []).map((e) => ({ value: e.id, label: e.nome })), defaultValue: file?.etapas[0]?.id },
    ],
    'Cadastrar e abrir',
    { icone: ICONES_CONTATO.empresa, subtitulo: 'Endereço, segmento e pessoas se completam na ficha.' },
  );
  if (!valores) return;
  try {
    const id = await contatosState.criarEmpresa({
      razaoSocial: valores.razaoSocial ?? '',
      nomeFantasia: valores.nomeFantasia ?? '',
      cnpj: valores.cnpj ?? '',
      emails: valores.email ? [valores.email] : [],
      telefones: valores.telefone ? [{ numero: valores.telefone, tipo: 'fixo' }] : [],
      etapaId: valores.etapaId,
    });
    if (id) abrirFicha({ tipo: 'empresa', id });
  } catch (e) {
    falhou(e);
  }
}
