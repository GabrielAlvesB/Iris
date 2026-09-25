import type { TagPostagem } from '../../../shared/types/postagens.types.js';
import {
  FORMATOS_ROTEIRO,
  STATUS_ROTEIRO,
  type FormatoRoteiro,
  type Roteiro,
  type RoteirosFile,
  type StatusRoteiro,
} from '../../../shared/types/roteiros.types.js';
import { abrirModulo } from '../../core/navegacao.js';
import { campo, erroInline, input, pilulas, textarea } from '../../ui/campos.js';
import { buildSecaoModal, mensagemDeErro, openAvisoModal, openConfirmModal, openCustomModal, promptText } from '../../ui/modal.js';
import { abrirPainel, lembrarPosicao, lerPosicaoLembrada, type PainelHandle } from '../../ui/painel.js';
import {
  buildBotao,
  buildBusca,
  buildCabecalho,
  buildIndicadores,
  buildSegmentado,
  buildSelo,
  buildVazio,
  focarBusca,
  svg,
  tempoRelativo,
  type Tom,
} from '../../ui/pagina.js';
import * as videosState from '../postagens/videos/videos.state.js';
import { paragrafos } from '../relatorios/relatorios.documento.js';
import { duracaoDoTexto, renderMarkdown, secoesDoRoteiro, textoFalado, tituloDoTexto } from './roteiros.markdown.js';
import * as roteirosState from './roteiros.state.js';

/**
 * Módulo Roteiros: escrever, verificar e aprovar roteiros. Aprovado, o roteiro
 * vira card na primeira coluna do Kanban (o main cria o card, sem duplicar).
 *
 * O editor é um painel: o texto digitado salva na pausa sem redesenhar (para
 * não perder o cursor); só a prévia ao lado acompanha a digitação.
 */

type Modo = 'quadro' | 'lista';

const ICONES = {
  roteiro: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M13 13h3"/><path d="M13 17h3"/>',
  mais: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  voltar: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
  xis: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  lixeira: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  duplicar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  lista: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="m3 6 1 1 2-2"/><path d="m3 12 1 1 2-2"/><path d="m3 18 1 1 2-2"/>',
} as const;

const TOM_DO_STATUS: Record<StatusRoteiro, Tom> = {
  rascunho: 'neutro',
  revisao: 'atencao',
  aprovado: 'ok',
  reprovado: 'erro',
};

const DICA_MARKDOWN =
  '# Título · ## [0:00 - 0:50] Seção com tempo · **negrito** · *itálico* · [nota de cena] numa linha só · - lista · 1. lista numerada · > citação · --- separador';

const MODELO_ROTEIRO = `# Título do vídeo

**Duração estimada:** 8 a 10 minutos
**Tom:** direto e acessível

---

## [0:00 - 0:40] Abertura

**[Cenas rápidas do assunto]**

**NARRAÇÃO:**

A frase que prende nos primeiros segundos…

---

## [0:40 - 2:00] Primeira parte

…`;

let containerAtual: HTMLElement | null = null;
let modo: Modo = 'quadro';
let busca = '';
let filtroTag: string | null = null;

let painel: PainelHandle | null = null;
let rascunho: Roteiro | null = null;
let timerSalvar: ReturnType<typeof setTimeout> | null = null;
let atualizarPrevia: (() => void) | null = null;
let desenharRodape: (() => void) | null = null;
/** Leva o cursor do editor até uma linha do texto (clique no índice de seções). */
let irParaLinha: ((linha: number) => void) | null = null;

// ---------- Ciclo de vida ----------

export function montar(viewRoot: HTMLElement): void {
  containerAtual = viewRoot;
  roteirosState.onStateChange(() => redesenhar());
  // As tags são do catálogo de Postagens, que mora no arquivo dos vídeos.
  const catalogo = videosState.getCurrentState() ? Promise.resolve() : videosState.load().then(() => undefined);
  void Promise.all([roteirosState.load(), catalogo]).then(redesenhar).catch(falhou);
}

export function destroy(): void {
  void descarregar();
  painel?.fechar();
  roteirosState.offStateChange();
  containerAtual = null;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

function redesenhar(): void {
  const file = roteirosState.getCurrentState();
  if (!containerAtual || !file) return;
  renderLista(containerAtual, file);
}

function catalogoTags(): TagPostagem[] {
  return videosState.getCurrentState()?.tags ?? [];
}

function rotuloStatus(status: StatusRoteiro): string {
  return STATUS_ROTEIRO.find((s) => s.id === status)?.rotulo ?? status;
}

function rotuloFormato(formato: FormatoRoteiro): string {
  return FORMATOS_ROTEIRO.find((f) => f.id === formato)?.rotulo ?? formato;
}

function progressoChecklist(r: Roteiro): { feitos: number; total: number } {
  return { feitos: r.checklist.filter((i) => i.feito).length, total: r.checklist.length };
}

function buildTags(tagIds: string[]): HTMLElement | null {
  const tags = tagIds.map((id) => catalogoTags().find((t) => t.id === id)).filter((t): t is TagPostagem => Boolean(t));
  if (!tags.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'rot-tags';
  tags.forEach((t) => {
    const chip = document.createElement('span');
    chip.className = 'rot-tag';
    chip.style.setProperty('--cor-tag', t.cor);
    chip.textContent = t.nome;
    wrap.appendChild(chip);
  });
  return wrap;
}

// ---------- Lista / quadro ----------

function filtrar(file: RoteirosFile): Roteiro[] {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  return file.roteiros.filter(
    (r) =>
      (!filtroTag || r.tagIds.includes(filtroTag)) &&
      (!termo || `${r.titulo} ${r.gancho} ${r.texto}`.toLocaleLowerCase('pt-BR').includes(termo)),
  );
}

function buildCartao(r: Roteiro): HTMLElement {
  const cartao = document.createElement('article');
  cartao.className = `rot-cartao is-${r.status}`;
  cartao.tabIndex = 0;

  const topo = document.createElement('div');
  topo.className = 'rot-cartao-topo';
  const formato = document.createElement('span');
  formato.className = 'rot-formato';
  formato.textContent = rotuloFormato(r.formato) + (r.duracao ? ` · ${r.duracao}` : '');
  topo.append(formato);
  cartao.appendChild(topo);

  const titulo = document.createElement('h3');
  titulo.className = 'rot-cartao-titulo';
  titulo.textContent = r.titulo;
  cartao.appendChild(titulo);

  // Sem gancho, o começo do que é falado dá a ideia do roteiro.
  const resumo = r.gancho.trim() || textoFalado(r.texto).replace(/\s+/g, ' ').trim().slice(0, 180);
  if (resumo) {
    const gancho = document.createElement('p');
    gancho.className = 'rot-cartao-gancho';
    gancho.textContent = resumo;
    cartao.appendChild(gancho);
  }

  const tags = buildTags(r.tagIds);
  if (tags) cartao.appendChild(tags);

  const rodape = document.createElement('div');
  rodape.className = 'rot-cartao-rodape';
  const { feitos, total } = progressoChecklist(r);
  if (total) {
    const check = document.createElement('span');
    check.className = 'rot-cartao-check';
    check.classList.toggle('is-completo', feitos === total);
    check.innerHTML = svg(ICONES.lista, 12, 2);
    check.append(`${feitos}/${total}`);
    check.title = 'Itens da verificação marcados';
    rodape.appendChild(check);
  }
  if (r.kanbanCardId) {
    const kanban = document.createElement('span');
    kanban.className = 'rot-cartao-kanban';
    kanban.innerHTML = svg(ICONES.kanban, 12, 2);
    kanban.append('No Kanban');
    rodape.appendChild(kanban);
  }
  const quando = document.createElement('time');
  quando.dateTime = r.updatedAt;
  quando.textContent = tempoRelativo(r.updatedAt);
  rodape.appendChild(quando);
  cartao.appendChild(rodape);

  cartao.addEventListener('click', () => abrirEditor(r.id));
  cartao.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') abrirEditor(r.id);
  });
  return cartao;
}

function buildQuadro(roteiros: Roteiro[]): HTMLElement {
  const quadro = document.createElement('div');
  quadro.className = 'rot-quadro';
  STATUS_ROTEIRO.forEach((s) => {
    const doStatus = roteiros.filter((r) => r.status === s.id);
    const coluna = document.createElement('section');
    coluna.className = `rot-coluna is-${s.id}`;
    const cab = document.createElement('header');
    cab.className = 'rot-coluna-cab';
    cab.appendChild(buildSelo(s.rotulo, TOM_DO_STATUS[s.id]));
    const n = document.createElement('span');
    n.className = 'rot-coluna-n';
    n.textContent = String(doStatus.length);
    cab.appendChild(n);
    coluna.appendChild(cab);
    const lista = document.createElement('div');
    lista.className = 'rot-coluna-lista';
    doStatus.forEach((r) => lista.appendChild(buildCartao(r)));
    if (!doStatus.length) lista.appendChild(Object.assign(document.createElement('p'), { className: 'rot-coluna-vazia', textContent: 'Nada aqui.' }));
    coluna.appendChild(lista);
    quadro.appendChild(coluna);
  });
  return quadro;
}

function buildTabela(roteiros: Roteiro[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rot-tabela-wrap';
  const tabela = document.createElement('table');
  tabela.className = 'rot-tabela';
  const cab = document.createElement('thead');
  const tr = document.createElement('tr');
  ['Título', 'Formato', 'Tags', 'Verificação', 'Situação', 'Editado'].forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  });
  cab.appendChild(tr);
  const corpo = document.createElement('tbody');
  roteiros.forEach((r) => {
    const linha = document.createElement('tr');
    linha.tabIndex = 0;
    const cel = (conteudo: string | HTMLElement | null, classe = ''): void => {
      const td = document.createElement('td');
      if (classe) td.className = classe;
      if (typeof conteudo === 'string') td.textContent = conteudo;
      else if (conteudo) td.appendChild(conteudo);
      linha.appendChild(td);
    };
    const { feitos, total } = progressoChecklist(r);
    cel(r.titulo, 'rot-forte');
    cel(rotuloFormato(r.formato));
    cel(buildTags(r.tagIds));
    cel(total ? `${feitos}/${total}` : '—', 'rot-num');
    cel(buildSelo(rotuloStatus(r.status), TOM_DO_STATUS[r.status]));
    cel(tempoRelativo(r.updatedAt));
    linha.addEventListener('click', () => abrirEditor(r.id));
    linha.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') abrirEditor(r.id);
    });
    corpo.appendChild(linha);
  });
  tabela.append(cab, corpo);
  wrap.appendChild(tabela);
  return wrap;
}

function renderLista(container: HTMLElement, file: RoteirosFile): void {
  const tela = document.createElement('div');
  tela.className = 'pg-view rot-view';

  const checklist = buildBotao('Verificação padrão', { icone: ICONES.lista, variante: 'secundario', titulo: 'Itens com que todo roteiro novo nasce' });
  checklist.addEventListener('click', () => abrirChecklistPadrao(file));
  const novo = buildBotao('Novo roteiro', { icone: ICONES.mais, variante: 'primario' });
  novo.addEventListener('click', abrirNovoRoteiro);
  tela.appendChild(
    buildCabecalho({
      icone: ICONES.roteiro,
      titulo: 'Roteiros',
      subtitulo: 'Escreva, verifique e aprove — aprovado vai direto para o Kanban',
      acoes: [checklist, novo],
    }),
  );

  if (!file.roteiros.length) {
    const comecar = buildBotao('Escrever o primeiro roteiro', { icone: ICONES.mais, variante: 'primario' });
    comecar.addEventListener('click', abrirNovoRoteiro);
    tela.appendChild(
      buildVazio(
        ICONES.roteiro,
        'Nenhum roteiro ainda',
        'Um roteiro tem gancho, corpo e CTA, uma lista de verificação e passa por revisão. Quando você aprova, ele vira um card no Kanban.',
        comecar,
      ),
    );
    container.replaceChildren(tela);
    return;
  }

  const conta = (s: StatusRoteiro): number => file.roteiros.filter((r) => r.status === s).length;
  tela.appendChild(
    buildIndicadores([
      { rotulo: 'Roteiros', valor: String(file.roteiros.length), detalhe: `${conta('rascunho')} em rascunho` },
      { rotulo: 'Em revisão', valor: String(conta('revisao')), detalhe: 'esperando aprovação', tom: conta('revisao') ? 'atencao' : 'neutro' },
      { rotulo: 'Aprovados', valor: String(conta('aprovado')), detalhe: 'enviados ao Kanban', tom: conta('aprovado') ? 'ok' : 'neutro' },
      { rotulo: 'Reprovados', valor: String(conta('reprovado')), detalhe: 'precisam de nova versão', tom: conta('reprovado') ? 'erro' : 'neutro' },
    ]),
  );

  const barra = document.createElement('div');
  barra.className = 'pg-barra';
  barra.appendChild(
    buildBusca(busca, 'Buscar título, gancho ou texto…', (v) => {
      busca = v;
      redesenhar();
      focarBusca(containerAtual);
    }),
  );
  barra.appendChild(
    buildSegmentado<Modo>(
      [
        { value: 'quadro', label: 'Quadro' },
        { value: 'lista', label: 'Lista' },
      ],
      modo,
      (v) => {
        modo = v;
        redesenhar();
      },
    ),
  );
  // Só as tags que algum roteiro usa: o filtro é para achar, não para catalogar.
  const usadas = catalogoTags().filter((t) => file.roteiros.some((r) => r.tagIds.includes(t.id)));
  if (filtroTag && !usadas.some((t) => t.id === filtroTag)) filtroTag = null;
  if (usadas.length) {
    const tags = document.createElement('div');
    tags.className = 'md-pilulas rot-filtro-tags';
    tags.setAttribute('role', 'group');
    tags.setAttribute('aria-label', 'Filtrar por tag');
    [{ id: null as string | null, nome: 'Todas as tags' }, ...usadas].forEach((t) => {
      const ativo = filtroTag === t.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'md-pilula';
      btn.classList.toggle('is-ativa', ativo);
      btn.setAttribute('aria-pressed', String(ativo));
      btn.textContent = t.nome;
      btn.addEventListener('click', () => {
        filtroTag = t.id;
        redesenhar();
      });
      tags.appendChild(btn);
    });
    barra.appendChild(tags);
  }
  tela.appendChild(barra);

  const visiveis = filtrar(file);
  const rolagem = document.createElement('div');
  rolagem.className = 'pg-rolagem rot-rolagem';
  if (!visiveis.length) rolagem.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: 'Nada com esses filtros.' }));
  else rolagem.appendChild(modo === 'quadro' ? buildQuadro(visiveis) : buildTabela(visiveis));
  tela.appendChild(rolagem);
  container.replaceChildren(tela);
}

// ---------- Modais ----------

function abrirNovoRoteiro(): void {
  let formato: FormatoRoteiro = 'reels';
  let tagIds: string[] = filtroTag ? [filtroTag] : [];
  void openCustomModal(
    'Novo roteiro',
    ({ corpo, rodape, fechar }) => {
      const titulo = input('text', '', 'Ex.: Xbox demite 268 e muda o futuro de Halo');
      titulo.classList.add('is-grande');
      corpo.appendChild(campo('Título', titulo, 'Se deixar em branco e colar um roteiro com "# Título", ele é usado.'));
      const texto = textarea('', 'Cole aqui o roteiro inteiro (opcional) — em markdown, do jeito que você já escreve.', 8);
      texto.classList.add('rot-colar');
      corpo.appendChild(campo('Roteiro', texto));
      corpo.appendChild(
        campo(
          'Formato',
          pilulas<FormatoRoteiro>(
            FORMATOS_ROTEIRO.map((f) => ({ id: f.id, rotulo: f.rotulo })),
            () => formato,
            (v) => (formato = v),
          ),
        ),
      );
      if (catalogoTags().length) {
        const tagsWrap = document.createElement('div');
        const desenhar = (): void => tagsWrap.replaceChildren(buildSeletorTags(tagIds, (v) => ((tagIds = v), desenhar())));
        desenhar();
        corpo.appendChild(campo('Tags / empresa', tagsWrap, 'As mesmas tags de Postagens e Relatórios.'));
      }

      const criar = async (): Promise<void> => {
        const nome = titulo.value.trim() || tituloDoTexto(texto.value);
        if (!nome) {
          titulo.focus();
          erroInline(corpo, 'Dê um título ao roteiro (ou cole um roteiro que comece com "# Título").');
          return;
        }
        try {
          const id = await roteirosState.criarRoteiro({
            titulo: nome,
            formato,
            tagIds,
            texto: texto.value,
            duracao: duracaoDoTexto(texto.value),
          });
          fechar();
          if (id) abrirEditor(id);
        } catch (erro) {
          erroInline(corpo, erro);
        }
      };
      titulo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') void criar();
      });
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const criarBtn = buildBotao('Criar e escrever', { icone: ICONES.mais, variante: 'primario' });
      criarBtn.addEventListener('click', () => void criar());
      rodape.append(cancelar, criarBtn);
      titulo.focus();
    },
    { largura: 620, icone: ICONES.roteiro, subtitulo: 'Escreva ou cole o roteiro livre; a prévia formatada fica ao lado.' },
  );
}

function abrirChecklistPadrao(file: RoteirosFile): void {
  void openCustomModal(
    'Verificação padrão',
    ({ corpo, rodape, fechar }) => {
      const area = textarea(file.checklistPadrao.join('\n'), 'Um item por linha', 8);
      corpo.appendChild(campo('Itens', area, 'Um por linha. Vale para os roteiros criados daqui em diante; os que já existem não mudam.'));
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const salvar = buildBotao('Salvar', { icone: ICONES.check, variante: 'primario' });
      salvar.addEventListener('click', () => {
        void roteirosState
          .salvarChecklistPadrao(area.value.split('\n'))
          .then(fechar)
          .catch((e) => erroInline(corpo, e));
      });
      rodape.append(cancelar, salvar);
    },
    { largura: 520, icone: ICONES.lista, subtitulo: 'A lista que todo roteiro novo traz para ser conferida antes da aprovação.' },
  );
}

function buildSeletorTags(marcadas: string[], aoMudar: (v: string[]) => void): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = 'md-pilulas';
  catalogoTags().forEach((t) => {
    const ativo = marcadas.includes(t.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-pilula rot-pilula-tag';
    btn.style.setProperty('--cor-tag', t.cor);
    btn.classList.toggle('is-ativa', ativo);
    btn.setAttribute('aria-pressed', String(ativo));
    btn.textContent = t.nome;
    btn.addEventListener('click', () => aoMudar(ativo ? marcadas.filter((id) => id !== t.id) : [...marcadas, t.id]));
    grupo.appendChild(btn);
  });
  return grupo;
}

// ---------- Editor ----------

async function descarregar(): Promise<void> {
  if (timerSalvar) {
    clearTimeout(timerSalvar);
    timerSalvar = null;
  } else return;
  if (!rascunho) return;
  const r = rascunho;
  try {
    await roteirosState.atualizarSilencioso({
      roteiroId: r.id,
      titulo: r.titulo,
      tagIds: r.tagIds,
      formato: r.formato,
      duracao: r.duracao,
      gancho: r.gancho,
      texto: r.texto,
      cta: r.cta,
      observacoes: r.observacoes,
      checklist: r.checklist,
    });
    // Editar um reprovado volta a rascunho no main: acompanha aqui também.
    const salvo = roteirosState.getCurrentState()?.roteiros.find((x) => x.id === r.id);
    if (salvo && salvo.status !== r.status) {
      r.status = salvo.status;
      r.historico = salvo.historico;
      desenharRodape?.();
    }
    painel?.marcarSalvo();
  } catch (erro) {
    painel?.marcarErro(erro);
  }
}

function agendarSalvar(): void {
  painel?.marcarSalvando();
  atualizarPrevia?.();
  if (timerSalvar) clearTimeout(timerSalvar);
  timerSalvar = setTimeout(() => void descarregar(), 600);
}

function campoTexto(
  rotulo: string,
  valor: string,
  placeholder: string,
  linhas: number,
  aoMudar: (v: string) => void,
  dica?: string,
): HTMLElement {
  const area = textarea(valor, placeholder, linhas);
  area.addEventListener('input', () => {
    aoMudar(area.value);
    agendarSalvar();
  });
  return campo(rotulo, area, dica);
}

/** Insere no cursor (ou envolve a seleção) e avisa o editor como se fosse digitado. */
function inserir(area: HTMLTextAreaElement, antes: string, depois = '', seVazio = ''): void {
  const { selectionStart: ini, selectionEnd: fim, value } = area;
  const selecionado = value.slice(ini, fim) || seVazio;
  area.focus();
  area.setRangeText(`${antes}${selecionado}${depois}`, ini, fim, 'end');
  // Com seleção vazia, deixa o texto de exemplo selecionado para ser sobrescrito.
  if (ini === fim && seVazio) area.setSelectionRange(ini + antes.length, ini + antes.length + seVazio.length);
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Começo de linha: blocos (seção, separador) não podem nascer no meio de uma frase. */
function quebraAntes(area: HTMLTextAreaElement): string {
  const ini = area.selectionStart;
  if (ini === 0) return '';
  return area.value.slice(Math.max(0, ini - 2), ini).endsWith('\n\n') ? '' : area.value[ini - 1] === '\n' ? '\n' : '\n\n';
}

function buildBarraEscrita(area: HTMLTextAreaElement): HTMLElement {
  const barra = document.createElement('div');
  barra.className = 'rot-barra';
  const botao = (rotulo: string, titulo: string, acao: () => void): void => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rot-barra-btn';
    b.textContent = rotulo;
    b.title = titulo;
    // mousedown sem foco: a seleção do textarea não se perde antes do clique.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', acao);
    barra.appendChild(b);
  };
  botao('Seção', 'Nova seção com tempo', () => inserir(area, `${quebraAntes(area)}## [0:00 - 0:00] `, '\n\n', 'Nome da seção'));
  botao('Cena', 'Nota de cena / o que aparece na tela', () => inserir(area, `${quebraAntes(area)}**[`, ']**\n\n', 'O que aparece na tela'));
  botao('Fala', 'Rótulo de narração', () => inserir(area, `${quebraAntes(area)}**`, ':**\n\n', 'NARRAÇÃO'));
  botao('B', 'Negrito (seleção)', () => inserir(area, '**', '**', 'texto'));
  botao('I', 'Itálico (seleção)', () => inserir(area, '*', '*', 'texto'));
  botao('—', 'Separador', () => inserir(area, `${quebraAntes(area)}---\n\n`));

  // Arquivo .md/.txt lido no próprio renderer: nada de caminho nem de acesso a disco no main.
  const arquivo = document.createElement('input');
  arquivo.type = 'file';
  arquivo.accept = '.md,.markdown,.txt';
  arquivo.hidden = true;
  arquivo.addEventListener('change', () => {
    const f = arquivo.files?.[0];
    if (!f) return;
    void f.text().then((conteudo) => {
      const substituir = !area.value.trim();
      if (substituir) area.value = conteudo;
      else area.setRangeText(`${quebraAntes(area)}${conteudo}`, area.selectionStart, area.selectionEnd, 'end');
      area.dispatchEvent(new Event('input', { bubbles: true }));
      arquivo.value = '';
    });
  });
  botao('Abrir .md', 'Trazer o texto de um arquivo .md ou .txt', () => arquivo.click());
  barra.appendChild(arquivo);
  return barra;
}

/** Índice clicável: leva a prévia e o cursor do editor até a seção. */
function buildIndice(texto: string, titulo: string, previa: HTMLElement): HTMLElement[] {
  // O "# título" igual ao nome do roteiro não entra; os outros (ex.: "# Fontes") sim.
  const nome = titulo.trim().toLocaleLowerCase('pt-BR');
  const partes = secoesDoRoteiro(texto).filter((s) => !(s.nivel === 1 && s.titulo.trim().toLocaleLowerCase('pt-BR') === nome));
  return partes.map((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `rot-indice-item is-nivel-${s.nivel}`;
    if (s.tempo) b.appendChild(Object.assign(document.createElement('span'), { className: 'rot-indice-tempo', textContent: s.tempo }));
    b.appendChild(Object.assign(document.createElement('span'), { className: 'rot-indice-titulo', textContent: s.titulo.replace(/[*_`]/g, '') }));
    b.addEventListener('click', () => {
      irParaLinha?.(s.linha);
      // Rola só a coluna da prévia (ela é sticky e rola sozinha); scrollIntoView
      // rolaria também o painel e brigaria com o foco que acabou de ir para o editor.
      const alvo = previa.querySelector<HTMLElement>(`#${s.ancora}`);
      const coluna = previa.closest<HTMLElement>('.rot-editor-previa');
      if (alvo && coluna) coluna.scrollTop = alvo.getBoundingClientRect().top - coluna.getBoundingClientRect().top + coluna.scrollTop - 8;
    });
    return b;
  });
}

function buildPrevia(r: Roteiro): HTMLElement {
  const folha = document.createElement('article');
  folha.className = 'rot-folha';
  const cab = document.createElement('header');
  cab.className = 'rot-folha-cab';
  const meta = document.createElement('span');
  meta.className = 'rot-folha-meta';
  meta.textContent = ['Roteiro', rotuloFormato(r.formato), r.duracao].filter(Boolean).join(' · ');
  const titulo = document.createElement('h2');
  titulo.textContent = r.titulo || 'Sem título';
  cab.append(meta, titulo);
  folha.appendChild(cab);

  // Gancho, CTA e observações são opcionais: só aparecem quando preenchidos.
  const parte = (rotulo: string, texto: string, classe: string): void => {
    if (!texto.trim()) return;
    const bloco = document.createElement('section');
    bloco.className = `rot-folha-parte ${classe}`;
    const h = document.createElement('h3');
    h.textContent = rotulo;
    bloco.appendChild(h);
    bloco.appendChild(paragrafos(texto, 'rot-folha-texto'));
    folha.appendChild(bloco);
  };
  parte('Gancho', r.gancho, 'is-gancho');
  if (r.texto.trim()) folha.appendChild(renderMarkdown(r.texto, r.titulo));
  else if (!r.gancho.trim() && !r.cta.trim()) {
    folha.appendChild(Object.assign(document.createElement('p'), { className: 'rot-folha-vazio', textContent: 'Ainda em branco. Escreva ou cole o roteiro ao lado.' }));
  }
  parte('CTA', r.cta, 'is-cta');
  parte('Observações para a produção', r.observacoes, 'is-obs');

  // Conta só o que é falado: títulos, notas de cena e fontes não entram no tempo.
  const palavras = `${r.gancho} ${textoFalado(r.texto)} ${r.cta}`.trim().split(/\s+/).filter(Boolean).length;
  const rodape = document.createElement('footer');
  rodape.className = 'rot-folha-rodape';
  // ~150 palavras por minuto de fala: estimativa para conferir com a duração pretendida.
  const segundos = Math.round((palavras / 150) * 60);
  rodape.textContent = palavras
    ? `${palavras} palavra${palavras === 1 ? '' : 's'} · cerca de ${segundos < 60 ? `${segundos}s` : `${Math.floor(segundos / 60)}min ${segundos % 60}s`} falado`
    : 'Sem texto ainda';
  folha.appendChild(rodape);
  return folha;
}

function buildChecklist(r: Roteiro): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rot-checklist';
  const desenhar = (focarNovo = false): void => {
    wrap.replaceChildren();
    const { feitos, total } = progressoChecklist(r);
    const resumo = document.createElement('p');
    resumo.className = 'rot-checklist-resumo';
    resumo.classList.toggle('is-completo', total > 0 && feitos === total);
    resumo.textContent = total ? `${feitos} de ${total} verificado${total === 1 ? '' : 's'}` : 'Nenhum item de verificação.';
    wrap.appendChild(resumo);

    r.checklist.forEach((item, i) => {
      const linha = document.createElement('label');
      linha.className = 'rot-checklist-item';
      linha.classList.toggle('is-feito', item.feito);
      const caixa = document.createElement('input');
      caixa.type = 'checkbox';
      caixa.checked = item.feito;
      caixa.addEventListener('change', () => {
        item.feito = caixa.checked;
        agendarSalvar();
        desenhar();
      });
      const texto = document.createElement('span');
      texto.textContent = item.texto;
      const remover = document.createElement('button');
      remover.type = 'button';
      remover.className = 'rot-checklist-remover';
      remover.title = 'Remover item';
      remover.setAttribute('aria-label', `Remover "${item.texto}"`);
      remover.innerHTML = svg(ICONES.xis, 12, 2);
      remover.addEventListener('click', (e) => {
        e.preventDefault();
        r.checklist.splice(i, 1);
        agendarSalvar();
        desenhar();
      });
      linha.append(caixa, texto, remover);
      wrap.appendChild(linha);
    });

    const novo = input('text', '', 'Novo item de verificação e Enter');
    novo.classList.add('rot-checklist-novo');
    novo.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !novo.value.trim()) return;
      e.preventDefault();
      r.checklist.push({ id: crypto.randomUUID(), texto: novo.value.trim(), feito: false });
      agendarSalvar();
      desenhar(true);
    });
    wrap.appendChild(novo);
    if (focarNovo) novo.focus();
  };
  desenhar();
  return wrap;
}

function buildHistorico(r: Roteiro): HTMLElement {
  const lista = document.createElement('ol');
  lista.className = 'rot-historico';
  r.historico
    .slice()
    .reverse()
    .forEach((ev) => {
      const li = document.createElement('li');
      li.appendChild(buildSelo(rotuloStatus(ev.status), TOM_DO_STATUS[ev.status]));
      const quando = document.createElement('time');
      quando.dateTime = ev.em;
      quando.textContent = new Date(ev.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      li.appendChild(quando);
      if (ev.comentario) li.appendChild(Object.assign(document.createElement('p'), { textContent: ev.comentario }));
      lista.appendChild(li);
    });
  return lista;
}

function abrirEditor(roteiroId: string): void {
  const original = roteirosState.getCurrentState()?.roteiros.find((r) => r.id === roteiroId);
  if (!original) return;
  painel?.fechar();
  const r: Roteiro = structuredClone(original);
  rascunho = r;

  const handle = abrirPainel({
    icone: ICONES.roteiro,
    rotulo: 'Roteiro',
    ariaLabel: `Roteiro ${r.titulo}`,
    posicao: lerPosicaoLembrada('roteiros', 'centro'),
    aoMudarPosicao: (pos) => lembrarPosicao('roteiros', pos),
    aoFechar: () => {
      if (painel !== handle) return;
      void descarregar().then(() => {
        painel = null;
        rascunho = null;
        atualizarPrevia = null;
        desenharRodape = null;
        irParaLinha = null;
        // O que foi salvo em silêncio só aparece na lista agora.
        redesenhar();
      });
    },
  });
  painel = handle;
  handle.painel.classList.add('rot-painel');

  const desenharEstado = (): void => {
    handle.estado.replaceChildren(buildSelo(rotuloStatus(r.status), TOM_DO_STATUS[r.status]));
  };
  desenharEstado();

  const editor = document.createElement('div');
  editor.className = 'rot-editor';
  const form = document.createElement('div');
  form.className = 'rot-editor-form';
  const lado = document.createElement('div');
  lado.className = 'rot-editor-previa';

  // Título
  const titulo = document.createElement('textarea');
  titulo.className = 'rot-titulo';
  titulo.rows = 1;
  titulo.value = r.titulo;
  titulo.placeholder = 'Título do roteiro';
  titulo.setAttribute('aria-label', 'Título do roteiro');
  const ajustar = (): void => {
    titulo.style.height = 'auto';
    titulo.style.height = `${titulo.scrollHeight}px`;
  };
  titulo.addEventListener('input', () => {
    r.titulo = titulo.value;
    ajustar();
    agendarSalvar();
  });
  titulo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault();
  });
  requestAnimationFrame(ajustar);
  form.appendChild(titulo);

  // Dados
  const dados = buildSecaoModal('Dados');
  dados.conteudo.appendChild(
    campo(
      'Formato',
      pilulas<FormatoRoteiro>(
        FORMATOS_ROTEIRO.map((f) => ({ id: f.id, rotulo: f.rotulo })),
        () => r.formato,
        (v) => {
          r.formato = v;
          agendarSalvar();
        },
      ),
    ),
  );
  const duracao = input('text', r.duracao, 'Ex.: 45s, 8 min');
  duracao.addEventListener('input', () => {
    r.duracao = duracao.value;
    agendarSalvar();
  });
  dados.conteudo.appendChild(campo('Duração pretendida', duracao));
  if (catalogoTags().length) {
    const tagsWrap = document.createElement('div');
    const desenharTags = (): void =>
      tagsWrap.replaceChildren(
        buildSeletorTags(r.tagIds, (v) => {
          r.tagIds = v;
          agendarSalvar();
          desenharTags();
        }),
      );
    desenharTags();
    dados.conteudo.appendChild(campo('Tags / empresa', tagsWrap));
  }
  form.appendChild(dados.secao);

  // Texto livre
  const areaTexto = textarea(r.texto, MODELO_ROTEIRO, 26);
  areaTexto.classList.add('rot-texto-livre');
  areaTexto.setAttribute('aria-label', 'Roteiro');
  areaTexto.spellcheck = true;
  areaTexto.addEventListener('input', () => {
    r.texto = areaTexto.value;
    agendarSalvar();
  });
  const escrita = buildSecaoModal('Roteiro', 'Escreva livre. A prévia ao lado formata e monta o índice das seções.', buildBarraEscrita(areaTexto));
  escrita.secao.classList.add('rot-secao-escrita');
  escrita.conteudo.append(areaTexto, Object.assign(document.createElement('p'), { className: 'md-dica', textContent: DICA_MARKDOWN }));
  form.appendChild(escrita.secao);
  irParaLinha = (linha: number): void => {
    const inicio = areaTexto.value.split('\n').slice(0, linha).join('\n').length + (linha ? 1 : 0);
    areaTexto.focus();
    areaTexto.setSelectionRange(inicio, inicio);
    // Rola até a linha: mede pela proporção de linhas (sem medir cada uma).
    const total = Math.max(1, areaTexto.value.split('\n').length);
    areaTexto.scrollTop = (areaTexto.scrollHeight * linha) / total - 40;
  };

  // Campos do card: opcionais, recolhidos.
  const extras = document.createElement('details');
  extras.className = 'rot-extras';
  extras.open = Boolean(r.gancho.trim() || r.cta.trim() || r.observacoes.trim());
  const resumoExtras = document.createElement('summary');
  resumoExtras.textContent = 'Gancho, CTA e observações para a produção (opcional)';
  const corpoExtras = document.createElement('div');
  corpoExtras.className = 'rot-extras-corpo';
  corpoExtras.append(
    campoTexto('Gancho', r.gancho, 'A primeira frase — o que faz a pessoa parar de rolar', 2, (v) => (r.gancho = v)),
    campoTexto('CTA', r.cta, 'Ex.: Comenta aqui embaixo o que você acha', 2, (v) => (r.cta = v)),
    campoTexto('Observações para a produção', r.observacoes, 'Referências, cortes, trilha, legenda…', 3, (v) => (r.observacoes = v)),
  );
  extras.append(resumoExtras, corpoExtras);
  form.appendChild(extras);

  // Verificação
  const verificacao = buildSecaoModal('Verificação', 'Confira antes de aprovar.');
  verificacao.conteudo.appendChild(buildChecklist(r));
  form.appendChild(verificacao.secao);

  // Histórico
  const historico = buildSecaoModal('Histórico');
  const historicoConteudo = historico.conteudo;
  historicoConteudo.appendChild(buildHistorico(r));
  form.appendChild(historico.secao);

  // Prévia
  const previaCab = document.createElement('div');
  previaCab.className = 'rot-previa-cab';
  previaCab.innerHTML = svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', 13, 2);
  previaCab.append('Prévia');
  const indice = document.createElement('nav');
  indice.className = 'rot-indice';
  indice.setAttribute('aria-label', 'Seções do roteiro');
  const previaCorpo = document.createElement('div');
  lado.append(indice, previaCab, previaCorpo);
  atualizarPrevia = (): void => {
    previaCorpo.replaceChildren(buildPrevia(r));
    indice.replaceChildren(...buildIndice(r.texto, r.titulo, previaCorpo));
    indice.hidden = indice.childElementCount === 0;
  };
  atualizarPrevia();

  editor.append(form, lado);
  handle.grade.appendChild(editor);

  // Rodapé: as ações dependem da situação.
  const aplicarDoArquivo = (): void => {
    const salvo = roteirosState.getCurrentState()?.roteiros.find((x) => x.id === r.id);
    if (!salvo) return;
    r.status = salvo.status;
    r.historico = salvo.historico;
    r.kanbanCardId = salvo.kanbanCardId;
    desenharEstado();
    historicoConteudo.replaceChildren(buildHistorico(r));
    desenharRodape?.();
  };
  const acao = (fn: () => Promise<void>): void => {
    void descarregar()
      .then(fn)
      .then(aplicarDoArquivo)
      .catch(falhou);
  };

  const aprovar = async (): Promise<void> => {
    const pendentes = r.checklist.filter((i) => !i.feito).length;
    const mensagem = pendentes
      ? `${pendentes} item(ns) da verificação ainda não foram marcados. Aprovar mesmo assim? Um card será criado na primeira coluna do Kanban.`
      : 'O roteiro será aprovado e um card será criado na primeira coluna do Kanban.';
    const ok = await openConfirmModal({ title: 'Aprovar roteiro', message: mensagem, confirmText: 'Aprovar e enviar', danger: false });
    if (ok) acao(() => roteirosState.aprovarRoteiro({ roteiroId: r.id }));
  };

  desenharRodape = (): void => {
    handle.rodape.replaceChildren();
    const excluir = buildBotao('', { icone: ICONES.lixeira, variante: 'fantasma', titulo: 'Excluir roteiro' });
    excluir.classList.add('is-perigo');
    excluir.addEventListener('click', () => {
      void openConfirmModal({
        title: 'Excluir roteiro',
        message: `"${r.titulo}" será apagado. ${r.kanbanCardId ? 'O card no Kanban continua lá.' : ''}`.trim(),
      }).then((ok) => {
        if (!ok) return;
        // Sai sem o salvamento pendente: o roteiro está sendo apagado.
        if (timerSalvar) clearTimeout(timerSalvar);
        timerSalvar = null;
        painel = null;
        rascunho = null;
        atualizarPrevia = null;
        desenharRodape = null;
        handle.fechar();
        void roteirosState.excluirRoteiro(r.id).catch(falhou);
      });
    });
    const duplicar = buildBotao('', { icone: ICONES.duplicar, variante: 'fantasma', titulo: 'Duplicar roteiro' });
    duplicar.addEventListener('click', () => acao(() => roteirosState.duplicarRoteiro(r.id)));
    const espaco = document.createElement('span');
    espaco.className = 'pg-espaco';
    handle.rodape.append(excluir, duplicar, espaco);

    const voltarRascunho = (): HTMLButtonElement => {
      const b = buildBotao('Voltar a rascunho', { icone: ICONES.voltar, variante: 'fantasma' });
      b.addEventListener('click', () => acao(() => roteirosState.mudarStatus({ roteiroId: r.id, status: 'rascunho' })));
      return b;
    };
    const aprovarBtn = buildBotao('Aprovar e enviar ao Kanban', { icone: ICONES.check, variante: 'primario' });
    aprovarBtn.addEventListener('click', () => void aprovar());

    switch (r.status) {
      case 'rascunho':
      case 'reprovado': {
        const revisar = buildBotao('Enviar para revisão', { icone: ICONES.enviar, variante: 'secundario' });
        revisar.addEventListener('click', () => acao(() => roteirosState.mudarStatus({ roteiroId: r.id, status: 'revisao' })));
        handle.rodape.append(revisar, aprovarBtn);
        break;
      }
      case 'revisao': {
        const reprovar = buildBotao('Reprovar', { icone: ICONES.xis, variante: 'secundario' });
        reprovar.addEventListener('click', () => {
          void promptText('Reprovar roteiro', 'O que precisa mudar?', '', { icone: ICONES.xis, subtitulo: 'O motivo fica no histórico e orienta a próxima versão.' }).then(
            (motivo) => {
              if (motivo === null) return;
              acao(() => roteirosState.mudarStatus({ roteiroId: r.id, status: 'reprovado', comentario: motivo }));
            },
          );
        });
        handle.rodape.append(voltarRascunho(), reprovar, aprovarBtn);
        break;
      }
      case 'aprovado': {
        const abrirKanban = buildBotao('Abrir no Kanban', { icone: ICONES.kanban, variante: 'primario' });
        abrirKanban.addEventListener('click', () => {
          handle.fechar();
          abrirModulo('kanban');
        });
        handle.rodape.append(voltarRascunho(), abrirKanban);
        break;
      }
    }
  };
  desenharRodape();

  if (!r.gancho && !r.texto) titulo.focus();
}
