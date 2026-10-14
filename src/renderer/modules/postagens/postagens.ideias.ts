import type { Ideia, IdeiasFile } from '../../../shared/types/ideias.types';
import type { TipoPostagem } from '../../../shared/types/postagens.types';
import type {} from '../../../shared/types/preload-api.types';
import { abrirPostagem } from '../../core/navegacao.js';
import { campo, input, textarea } from '../../ui/campos.js';
import { mensagemDeErro, openAvisoModal, openConfirmModal, openCustomModal } from '../../ui/modal.js';
import { buildBotao, buildBusca, buildVazio, svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import * as videosState from './videos/videos.state.js';

/**
 * Aba "Ideias" de Postagens: o banco de ideias soltas de conteúdo. Escrever e
 * Enter cria; colar várias linhas cria uma por linha. "Virar vídeo/imagem"
 * leva a ideia para a primeira etapa da pipeline — e ela sai da lista (como em
 * todo o app, a tela inicial só mostra o pendente), guardando o link.
 */

export const ICONE_IDEIA = '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/>';
const ICONE_EDITAR = '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>';
const ICONE_ARQUIVO = '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>';
const ICONE_LIXO = '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>';
const ICONE_SETA = '<path d="m6 9 6 6 6-6"/>';

let arquivo: IdeiasFile | null = null;
let carregando: Promise<void> | null = null;
let busca = '';
let abertas = new Set<string>();
let focarNova = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

async function rodar(pedido: Promise<{ ok: true; data: IdeiasFile } | { ok: false; error: string }>, redesenhar: () => void): Promise<boolean> {
  const r = await pedido;
  if (!r.ok) {
    falhou(new Error(r.error));
    return false;
  }
  arquivo = r.data;
  redesenhar();
  return true;
}

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function casa(i: Ideia): boolean {
  if (!busca.trim()) return true;
  const q = normalizar(busca.trim());
  return normalizar(`${i.titulo} ${i.notas}`).includes(q);
}

function nomesDasTags(ids: string[]): string[] {
  const tags = videosState.getCurrentState()?.tags ?? [];
  return ids.map((id) => tags.find((t) => t.id === id)?.nome).filter((n): n is string => !!n);
}

/** A ideia vira postagem e a tela oferece abrir. */
async function virar(i: Ideia, tipo: TipoPostagem, redesenhar: () => void): Promise<void> {
  const r = await window.irisAPI.ideias.virarPostagem(i.id, tipo);
  if (!r.ok) {
    falhou(new Error(r.error));
    return;
  }
  arquivo = r.data.file;
  redesenhar();
  const { postagem } = r.data;
  mostrarToast(`“${i.titulo}” virou ${tipo === 'video' ? 'vídeo' : 'imagem'} na primeira etapa`, [{ rotulo: 'Abrir', fazer: () => abrirPostagem({ tipo: postagem.tipo, id: postagem.id }) }]);
}

function editar(i: Ideia, redesenhar: () => void): void {
  const tags = (videosState.getCurrentState()?.tags ?? []).slice().sort((a, b) => Number(!!b.empresa) - Number(!!a.empresa) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const marcadas = new Set(i.tagIds);
  void openCustomModal(
    'Editar ideia',
    ({ corpo, rodape, fechar }) => {
      const titulo = input('text', i.titulo, 'A ideia em uma linha');
      const notas = textarea(i.notas, 'Ângulo, referência, gancho, para quem é…', 4);
      corpo.append(campo('Ideia', titulo), campo('Notas', notas, 'Vão para as notas da postagem quando a ideia virar uma.'));
      if (tags.length) {
        const grupo = el('div', 'id-tags-escolha');
        tags.forEach((t) => {
          const b = el('button', 'md-pilula', t.nome);
          b.type = 'button';
          const marcar = (): void => {
            b.classList.toggle('is-ativa', marcadas.has(t.id));
            b.setAttribute('aria-pressed', String(marcadas.has(t.id)));
          };
          b.addEventListener('click', () => {
            if (marcadas.has(t.id)) marcadas.delete(t.id);
            else marcadas.add(t.id);
            marcar();
          });
          marcar();
          grupo.appendChild(b);
        });
        corpo.appendChild(campo('Empresas e tags', grupo, 'As mesmas da pipeline: vão junto para a postagem.'));
      }
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const salvar = buildBotao('Salvar', { variante: 'primario' });
      salvar.addEventListener('click', () => {
        void rodar(window.irisAPI.ideias.atualizar({ id: i.id, titulo: titulo.value, notas: notas.value, tagIds: [...marcadas] }), redesenhar).then((ok) => {
          if (ok) fechar();
        });
      });
      rodape.append(cancelar, salvar);
      requestAnimationFrame(() => titulo.focus());
    },
    { icone: ICONE_IDEIA, largura: 520 },
  );
}

function botaoIcone(icone: string, titulo: string, aoClicar: () => void, perigo = false): HTMLButtonElement {
  const b = el('button', `id-acao${perigo ? ' is-perigo' : ''}`);
  b.type = 'button';
  b.title = titulo;
  b.setAttribute('aria-label', titulo);
  b.innerHTML = svg(icone, 14);
  b.addEventListener('click', aoClicar);
  return b;
}

function buildCartao(i: Ideia, redesenhar: () => void): HTMLElement {
  const cartao = el('article', `id-cartao${i.virouPostagem ? ' is-virou' : ''}${i.arquivada ? ' is-arquivada' : ''}`);
  cartao.appendChild(el('h3', 'id-titulo', i.titulo));
  if (i.notas.trim()) cartao.appendChild(el('p', 'id-notas', i.notas));
  const tags = nomesDasTags(i.tagIds);
  if (tags.length) {
    const linha = el('div', 'id-tags');
    tags.forEach((t) => linha.appendChild(el('span', 'id-tag', t)));
    cartao.appendChild(linha);
  }
  const acoes = el('div', 'id-acoes');
  if (i.virouPostagem) {
    const v = i.virouPostagem;
    const abrir = buildBotao(`Abrir ${v.tipo === 'video' ? 'vídeo' : 'imagem'}`, { variante: 'fantasma' });
    abrir.addEventListener('click', () => abrirPostagem({ tipo: v.tipo, id: v.id }));
    acoes.appendChild(abrir);
  } else if (i.arquivada) {
    const restaurar = buildBotao('Restaurar', { variante: 'fantasma' });
    restaurar.addEventListener('click', () => void rodar(window.irisAPI.ideias.atualizar({ id: i.id, arquivada: false }), redesenhar));
    acoes.appendChild(restaurar);
  } else {
    const video = buildBotao('Virar vídeo', { variante: 'secundario', titulo: 'Cria um vídeo na primeira etapa da pipeline, com o título, as notas e as tags da ideia' });
    video.addEventListener('click', () => void virar(i, 'video', redesenhar));
    const imagem = buildBotao('Virar imagem', { variante: 'secundario', titulo: 'Cria uma imagem na primeira etapa da pipeline' });
    imagem.addEventListener('click', () => void virar(i, 'imagem', redesenhar));
    acoes.append(video, imagem, el('span', 'pg-espaco'));
    acoes.append(
      botaoIcone(ICONE_EDITAR, 'Editar', () => editar(i, redesenhar)),
      botaoIcone(ICONE_ARQUIVO, 'Arquivar', () => void rodar(window.irisAPI.ideias.atualizar({ id: i.id, arquivada: true }), redesenhar)),
    );
  }
  acoes.appendChild(
    botaoIcone(
      ICONE_LIXO,
      'Excluir',
      () =>
        void openConfirmModal({ title: 'Excluir ideia', message: `“${i.titulo}” sai do banco de ideias.${i.virouPostagem ? ' A postagem criada a partir dela continua.' : ''}`, confirmText: 'Excluir' }).then((ok) => {
          if (ok) void rodar(window.irisAPI.ideias.excluir(i.id), redesenhar);
        }),
      true,
    ),
  );
  cartao.appendChild(acoes);
  return cartao;
}

function buildGrupoRecolhido(id: string, titulo: string, ideias: Ideia[], redesenhar: () => void): HTMLElement | null {
  if (!ideias.length) return null;
  const secao = el('section', 'id-grupo');
  const aberto = abertas.has(id);
  const cab = el('button', 'id-grupo-cab');
  cab.type = 'button';
  cab.setAttribute('aria-expanded', String(aberto));
  cab.innerHTML = svg(ICONE_SETA, 14);
  cab.classList.toggle('is-aberto', aberto);
  cab.appendChild(el('span', undefined, `${titulo} · ${ideias.length}`));
  cab.addEventListener('click', () => {
    if (aberto) abertas.delete(id);
    else abertas.add(id);
    redesenhar();
  });
  secao.appendChild(cab);
  if (aberto) {
    const grade = el('div', 'id-grade');
    ideias.forEach((i) => grade.appendChild(buildCartao(i, redesenhar)));
    secao.appendChild(grade);
  }
  return secao;
}

function buildNova(redesenhar: () => void): HTMLElement {
  const linha = el('form', 'id-nova');
  const campoNova = input('text', '', 'Uma ideia de conteúdo… (Enter salva; colar várias linhas cria uma por linha)');
  campoNova.setAttribute('aria-label', 'Nova ideia');
  const criar = (titulos: string[]): void => {
    const limpos = titulos.map((t) => t.trim()).filter(Boolean);
    if (!limpos.length) return;
    focarNova = true;
    void rodar(window.irisAPI.ideias.criar({ titulos: limpos }), redesenhar);
  };
  linha.addEventListener('submit', (e) => {
    e.preventDefault();
    criar([campoNova.value]);
    campoNova.value = '';
  });
  campoNova.addEventListener('paste', (e) => {
    const colado = e.clipboardData?.getData('text') ?? '';
    if (!colado.includes('\n')) return;
    e.preventDefault();
    criar(colado.split(/\r?\n/));
  });
  const salvar = buildBotao('Salvar ideia', { variante: 'primario' });
  salvar.type = 'submit';
  linha.append(campoNova, salvar);
  if (focarNova) {
    focarNova = false;
    requestAnimationFrame(() => campoNova.focus());
  }
  return linha;
}

/** Pedido de fora (paleta "Nova ideia"): o próximo desenho foca o campo. */
export function focarNovaIdeia(): void {
  focarNova = true;
}

export function buildIdeias(redesenhar: () => void): HTMLElement {
  const tela = el('div', 'id-tela');
  if (!arquivo) {
    tela.appendChild(el('p', 'id-dica', 'Carregando ideias…'));
    carregando ??= window.irisAPI.ideias
      .getFile()
      .then((r) => {
        if (r.ok) arquivo = r.data;
        else falhou(new Error(r.error));
      })
      .finally(() => {
        carregando = null;
        redesenhar();
      });
    return tela;
  }
  tela.appendChild(buildNova(redesenhar));
  const todas = arquivo.ideias.filter(casa).sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
  const pendentes = todas.filter((i) => !i.virouPostagem && !i.arquivada);
  if (arquivo.ideias.length > 6) {
    tela.appendChild(
      buildBusca(busca, 'Buscar nas ideias…', (v) => {
        busca = v;
        redesenhar();
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.id-tela .pg-busca input')?.focus());
      }),
    );
  }
  if (pendentes.length) {
    const grade = el('div', 'id-grade');
    pendentes.forEach((i) => grade.appendChild(buildCartao(i, redesenhar)));
    tela.appendChild(grade);
  } else {
    tela.appendChild(
      buildVazio(
        ICONE_IDEIA,
        busca ? 'Nenhuma ideia com essa busca' : 'Nenhuma ideia pendente',
        'Anote aqui qualquer ideia de conteúdo, sem compromisso. Quando ela amadurecer, um clique a transforma em vídeo ou imagem na primeira etapa da pipeline.',
      ),
    );
  }
  const viraram = buildGrupoRecolhido('viraram', 'Já viraram postagem', todas.filter((i) => i.virouPostagem), redesenhar);
  const arquivadas = buildGrupoRecolhido('arquivadas', 'Arquivadas', todas.filter((i) => i.arquivada && !i.virouPostagem), redesenhar);
  if (viraram) tela.appendChild(viraram);
  if (arquivadas) tela.appendChild(arquivadas);
  return tela;
}

/** Ideias mudaram por fora (post-it mandado de Pensamentos): relê na próxima vez. */
export function esquecerIdeias(): void {
  arquivo = null;
  abertas = new Set();
}
