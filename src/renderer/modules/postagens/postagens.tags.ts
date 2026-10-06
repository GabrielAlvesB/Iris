import type { TagPostagem } from '../../../shared/types/postagens.types.js';
import { buildSecaoModal, openConfirmModal } from '../../ui/modal.js';
import { input, select } from '../../ui/campos.js';
import { buildBotao } from '../../ui/pagina.js';
import * as videosState from './videos/videos.state.js';
import * as imagensState from './imagens/imagens.state.js';
import { ICONES_POSTAGEM, ICONE_EMPRESA, buildTagChip, ordenarTags } from './postagens.ui.js';

/**
 * Cadastro de empresas e tags — um catálogo só (videos.json), usado por
 * Postagens, Roteiros, Relatórios e Tráfego. Empresa é uma tag marcada
 * (`empresa: true`); os Relatórios usam só as empresas. O mesmo cadastro
 * aparece em Ajustes › Empresas e tags e no modal "Tags e redes" de Postagens.
 */

export const PALETA = ['#a78bfa', '#818cf8', '#38bdf8', '#2dd4bf', '#34d399', '#a3e635', '#fbbf24', '#fb923c', '#fb7185', '#f472b6', '#e1306c', '#9498a3'];

/** Postagens de todos os tipos, para contar usos de tag e rede. */
export function todasAsPostagens(): Array<{ tagIds: string[]; redeIds: string[] }> {
  return [...(videosState.getCurrentState()?.videos ?? []), ...(imagensState.getCurrentState()?.imagens ?? [])];
}

export function usos(n: number): string {
  return n === 1 ? '1 postagem' : `${n} postagens`;
}

/** Seletor de cor em bolinhas; abre ao clicar na amostra. */
export function buildSeletorCor(atual: string, aoEscolher: (cor: string) => void, paleta: readonly string[] = PALETA): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'md-cor';
  const amostra = document.createElement('button');
  amostra.type = 'button';
  amostra.className = 'md-cor-amostra';
  amostra.style.setProperty('--cor', atual);
  amostra.title = 'Mudar cor';
  amostra.setAttribute('aria-label', 'Mudar cor');
  const caixa = document.createElement('div');
  caixa.className = 'md-cor-paleta';
  caixa.hidden = true;
  paleta.forEach((cor) => {
    const opcao = document.createElement('button');
    opcao.type = 'button';
    opcao.className = 'md-cor-opcao';
    opcao.classList.toggle('is-ativa', cor.toLowerCase() === atual.toLowerCase());
    opcao.style.setProperty('--cor', cor);
    opcao.setAttribute('aria-label', cor);
    opcao.addEventListener('click', () => {
      caixa.hidden = true;
      amostra.style.setProperty('--cor', cor);
      aoEscolher(cor);
    });
    caixa.appendChild(opcao);
  });
  amostra.addEventListener('click', () => {
    document.querySelectorAll<HTMLElement>('.md-cor-paleta').forEach((p) => {
      if (p !== caixa) p.hidden = true;
    });
    caixa.hidden = !caixa.hidden;
  });
  wrap.append(amostra, caixa);
  return wrap;
}

/** Formulário "cor + nome (+ sigla) + Adicionar" no fim das listas de cadastro. */
export function formNovo(placeholder: string, comSigla: boolean, aoCriar: (nome: string, cor: string, sigla: string) => Promise<void>): HTMLElement {
  const form = document.createElement('form');
  form.className = 'md-novo';
  let cor = PALETA[0]!;
  const nome = input('text', '', placeholder);
  const sigla = input('text', '', 'Sigla');
  sigla.maxLength = 3;
  sigla.className = 'md-input md-item-sigla';
  const adicionar = buildBotao('Adicionar', { icone: ICONES_POSTAGEM.mais, variante: 'secundario' });
  adicionar.type = 'submit';
  form.append(buildSeletorCor(cor, (c) => (cor = c)), nome);
  if (comSigla) form.appendChild(sigla);
  form.appendChild(adicionar);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!nome.value.trim()) {
      nome.focus();
      return;
    }
    void aoCriar(nome.value, cor, sigla.value);
  });
  return form;
}

function linhaTag(tag: TagPostagem, redesenhar: () => void, erro: (e: unknown) => void): HTMLElement {
  const linha = document.createElement('div');
  linha.className = 'md-item is-tag';
  const qtd = todasAsPostagens().filter((v) => v.tagIds.includes(tag.id)).length;
  const oque = tag.empresa ? 'empresa' : 'tag';
  let cor = tag.cor;

  const nome = input('text', tag.nome);
  nome.setAttribute('aria-label', tag.empresa ? 'Nome da empresa' : 'Nome da tag');
  const previa = document.createElement('div');
  previa.className = 'md-item-previa';
  const desenharPrevia = (): void => previa.replaceChildren(buildTagChip({ ...tag, nome: nome.value || tag.nome, cor }));
  desenharPrevia();
  const salvar = (): void => void videosState.salvarTag({ id: tag.id, nome: nome.value, cor }).then(redesenhar).catch(erro);
  nome.addEventListener('input', desenharPrevia);
  nome.addEventListener('change', salvar);

  const contagem = document.createElement('span');
  contagem.className = 'md-item-uso';
  contagem.textContent = usos(qtd);

  // Muda o tipo sem mexer nas postagens: elas guardam o id, que é o mesmo.
  const converter = buildBotao('', {
    icone: tag.empresa ? ICONES_POSTAGEM.tag : ICONE_EMPRESA,
    variante: 'fantasma',
    titulo: tag.empresa ? 'Tornar tag comum (sai da lista de empresas dos relatórios)' : 'Tornar empresa (passa a ser escolhida nos relatórios)',
  });
  converter.setAttribute('aria-label', tag.empresa ? `Tornar "${tag.nome}" uma tag comum` : `Tornar "${tag.nome}" uma empresa`);
  converter.addEventListener('click', () => void videosState.salvarTag({ id: tag.id, nome: tag.nome, cor, empresa: !tag.empresa }).then(redesenhar).catch(erro));

  const excluir = buildBotao('', { icone: ICONES_POSTAGEM.lixeira, variante: 'fantasma', titulo: `Excluir ${oque}` });
  excluir.classList.add('is-perigo');
  excluir.addEventListener('click', () => {
    void openConfirmModal({
      title: `Excluir ${oque}`,
      message: qtd ? `"${tag.nome}" está em ${usos(qtd)} e será removida delas.` : `Excluir "${tag.nome}"?`,
    }).then((ok) => {
      if (ok) void videosState.excluirTag(tag.id).then(redesenhar).catch(erro);
    });
  });

  linha.append(
    buildSeletorCor(tag.cor, (c) => {
      cor = c;
      desenharPrevia();
      salvar();
    }),
    nome,
    previa,
  );
  if (tag.empresa) {
    linha.classList.add('is-empresa');
    linha.appendChild(buildEscalaDaEmpresa(tag, redesenhar, erro));
  }
  linha.append(contagem, converter, excluir);
  return linha;
}

/**
 * Qual régua de score vale para as postagens da empresa. "Padrão" não grava
 * nada: a empresa acompanha a escala padrão mesmo se ela for trocada depois.
 */
function buildEscalaDaEmpresa(tag: TagPostagem, redesenhar: () => void, erro: (e: unknown) => void): HTMLElement {
  const file = videosState.getCurrentState();
  const escalas = file?.escalasScore ?? [];
  const padrao = escalas.find((e) => e.id === file?.escalaPadraoId);
  const seletor = select(tag.escalaScoreId ?? '', [
    { value: '', label: `Padrão${padrao ? ` (${padrao.nome})` : ''}` },
    ...escalas.filter((e) => e.id !== file?.escalaPadraoId).map((e) => ({ value: e.id, label: e.nome })),
    // A própria padrão escolhida de propósito continua aparecendo como escolha.
    ...(tag.escalaScoreId && tag.escalaScoreId === file?.escalaPadraoId && padrao ? [{ value: padrao.id, label: padrao.nome }] : []),
  ]);
  seletor.classList.add('md-item-escala');
  seletor.title = 'Escala de score das postagens desta empresa (Métricas e Relatórios)';
  seletor.setAttribute('aria-label', `Escala de score de "${tag.nome}"`);
  seletor.addEventListener('change', () => {
    void videosState.salvarTag({ id: tag.id, nome: tag.nome, cor: tag.cor, escalaScoreId: seletor.value }).then(redesenhar).catch(erro);
  });
  return seletor;
}

const TEXTOS = {
  empresas: {
    titulo: 'Empresas',
    descricao:
      'Clientes e marcas para quem você produz. Nos relatórios, a empresa filtra as postagens e as métricas. A escala diz como o score das postagens dela é lido (as faixas se definem em Escalas de score).',
    novo: 'Nova empresa (ex.: nome do cliente)',
    vazio: 'Nenhuma empresa cadastrada.',
  },
  tags: {
    titulo: 'Tags',
    descricao: 'Categorias para achar o conteúdo rápido: série, formato, objetivo. Aparecem com nome e cor no card.',
    novo: 'Nova tag (ex.: Série JS)',
    vazio: 'Nenhuma tag cadastrada.',
  },
} as const;

/**
 * Uma das duas listas do cadastro, em seção com título, descrição e o
 * formulário de criação. Lê o catálogo do videosState na hora de desenhar.
 */
export function buildCadastroTags(tipo: 'empresas' | 'tags', redesenhar: () => void, erro: (e: unknown) => void): HTMLElement {
  const textos = TEXTOS[tipo];
  const { secao, conteudo } = buildSecaoModal(textos.titulo, textos.descricao);
  const tags = ordenarTags((videosState.getCurrentState()?.tags ?? []).filter((t) => Boolean(t.empresa) === (tipo === 'empresas')));
  const lista = document.createElement('div');
  lista.className = 'md-lista';
  tags.forEach((t) => lista.appendChild(linhaTag(t, redesenhar, erro)));
  if (!tags.length) lista.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: textos.vazio }));
  conteudo.appendChild(lista);
  conteudo.appendChild(
    formNovo(textos.novo, false, (nome, cor) => videosState.salvarTag({ nome, cor, empresa: tipo === 'empresas' }).then(redesenhar).catch(erro)),
  );
  return secao;
}

/** Quantas empresas há no catálogo (para o estado da navegação de Ajustes). */
export function contarEmpresas(): number {
  return (videosState.getCurrentState()?.tags ?? []).filter((t) => t.empresa).length;
}
