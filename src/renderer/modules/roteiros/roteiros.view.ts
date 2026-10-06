import { falaCompleta, formatarTempo, tempoTotal } from '../../../shared/types/roteiros.conversao.js';
import { FORMATOS_ROTEIRO, STATUS_ROTEIRO, type FormatoRoteiro, type Roteiro, type RoteirosFile, type StatusRoteiro } from '../../../shared/types/roteiros.types.js';
import { campo, erroInline, input, pilulas, textarea } from '../../ui/campos.js';
import { mensagemDeErro, openAvisoModal, openCustomModal } from '../../ui/modal.js';
import { buildBotao, buildBusca, buildCabecalho, buildIndicadores, buildSegmentado, buildSelo, buildVazio, focarBusca, svg, tempoRelativo } from '../../ui/pagina.js';
import * as videosState from '../postagens/videos/videos.state.js';
import { ICONES, TOM_DO_STATUS, catalogoTags, rotuloFormato, rotuloStatus } from './roteiros.comum.js';
import { abrirEstudio, descarregarEstudio, estudioAberto, fecharEstudio, sincronizarEstudio } from './roteiros.estudio.js';
import { buildLinhaTempo } from './roteiros.linhaTempo.js';
import { tituloDoTexto } from './roteiros.markdown.js';
import * as roteirosState from './roteiros.state.js';

/**
 * Módulo Roteiros: a lista (quadro por situação ou tabela) e a entrada para o
 * Estúdio de roteiro, que ocupa a tela inteira do módulo. Aprovado, o
 * roteiro vira card na primeira coluna do Kanban.
 */

type Modo = 'quadro' | 'lista';

let containerAtual: HTMLElement | null = null;
let modo: Modo = 'quadro';
let busca = '';
let filtroTag: string | null = null;

// ---------- Ciclo de vida ----------

export function montar(viewRoot: HTMLElement): void {
  containerAtual = viewRoot;
  roteirosState.onStateChange((file) => {
    if (estudioAberto()) sincronizarEstudio(file);
    else redesenhar();
  });
  // As tags são do catálogo de Postagens, que mora no arquivo dos vídeos.
  const catalogo = videosState.getCurrentState() ? Promise.resolve() : videosState.load().then(() => undefined);
  void Promise.all([roteirosState.load(), catalogo]).then(redesenhar).catch(falhou);
}

export function destroy(): void {
  if (estudioAberto()) {
    void descarregarEstudio().finally(fecharEstudio);
  }
  roteirosState.offStateChange();
  containerAtual = null;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

function redesenhar(): void {
  const file = roteirosState.getCurrentState();
  if (!containerAtual || !file || estudioAberto()) return;
  renderLista(containerAtual, file);
}

function abrirNoEstudio(id: string, opcoes: { aba?: 'ia' } = {}): void {
  if (!containerAtual) return;
  abrirEstudio(containerAtual, id, () => redesenhar(), opcoes);
}

function progressoChecklist(r: Roteiro): { feitos: number; total: number } {
  return { feitos: r.checklist.filter((i) => i.feito).length, total: r.checklist.length };
}

function buildTags(tagIds: string[]): HTMLElement | null {
  const tags = tagIds.map((id) => catalogoTags().find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => Boolean(t));
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

/** "11:42 de 12:00" — o tempo de fala contra o alvo, quando há. */
function textoDuracao(r: Roteiro): string {
  const total = tempoTotal(r);
  return r.briefing.duracaoAlvoSeg ? `${formatarTempo(total)} de ${formatarTempo(r.briefing.duracaoAlvoSeg)}` : `${formatarTempo(total)} de fala`;
}

// ---------- Lista / quadro ----------

function filtrar(file: RoteirosFile): Roteiro[] {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  return file.roteiros.filter(
    (r) =>
      (!filtroTag || r.tagIds.includes(filtroTag)) &&
      (!termo || `${r.titulo} ${r.briefing.tema} ${r.cenas.map((c) => `${c.titulo} ${c.fala}`).join(' ')}`.toLocaleLowerCase('pt-BR').includes(termo)),
  );
}

function buildCartao(r: Roteiro): HTMLElement {
  const cartao = document.createElement('article');
  cartao.className = `rot-cartao is-${r.status}`;
  cartao.tabIndex = 0;

  const topo = document.createElement('div');
  topo.className = 'rot-cartao-topo';
  topo.appendChild(Object.assign(document.createElement('span'), { className: 'rot-formato', textContent: `${rotuloFormato(r.formato)} · ${textoDuracao(r)}` }));
  cartao.appendChild(topo);
  cartao.appendChild(Object.assign(document.createElement('h3'), { className: 'rot-cartao-titulo', textContent: r.titulo }));

  // A fala do gancho (ou o começo do que é dito) dá a ideia do roteiro.
  const gancho = r.cenas.find((c) => c.tipo === 'gancho' && c.fala.trim())?.fala ?? falaCompleta(r.cenas);
  const resumo = gancho.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (resumo) cartao.appendChild(Object.assign(document.createElement('p'), { className: 'rot-cartao-gancho', textContent: resumo }));
  if (r.cenas.length) cartao.appendChild(buildLinhaTempo(r, () => undefined, true));

  const tags = buildTags(r.tagIds);
  if (tags) cartao.appendChild(tags);

  const rodape = document.createElement('div');
  rodape.className = 'rot-cartao-rodape';
  rodape.appendChild(Object.assign(document.createElement('span'), { className: 'rot-cartao-cenas', textContent: `${r.cenas.length} cena${r.cenas.length === 1 ? '' : 's'}` }));
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

  cartao.addEventListener('click', () => abrirNoEstudio(r.id));
  cartao.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') abrirNoEstudio(r.id);
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
    cab.appendChild(Object.assign(document.createElement('span'), { className: 'rot-coluna-n', textContent: String(doStatus.length) }));
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
  ['Título', 'Formato', 'Duração', 'Cenas', 'Tags', 'Verificação', 'Situação', 'Editado'].forEach((c) => tr.appendChild(Object.assign(document.createElement('th'), { textContent: c })));
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
    cel(textoDuracao(r), 'rot-num');
    cel(String(r.cenas.length), 'rot-num');
    cel(buildTags(r.tagIds));
    cel(total ? `${feitos}/${total}` : '—', 'rot-num');
    cel(buildSelo(rotuloStatus(r.status), TOM_DO_STATUS[r.status]));
    cel(tempoRelativo(r.updatedAt));
    linha.addEventListener('click', () => abrirNoEstudio(r.id));
    linha.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') abrirNoEstudio(r.id);
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
      subtitulo: 'Escreva cena por cena, com a IA ou na mão — aprovado vai direto para o Kanban',
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
        'Um roteiro é uma sequência de cenas — gancho, desenvolvimento, CTA — com o que se fala, o que se vê e o letreiro. Dá para criar com a IA a partir do tema ou escrever na mão.',
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
    buildBusca(busca, 'Buscar título, tema ou fala…', (v) => {
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

type Caminho = 'ia' | 'branco' | 'colar';

const CAMINHOS: Array<{ id: Caminho; titulo: string; dica: string; icone: string }> = [
  { id: 'ia', titulo: 'Criar com IA', dica: 'Do tema ao roteiro: a IA propõe ângulos, monta a estrutura e escreve cena por cena.', icone: ICONES.estrela },
  { id: 'branco', titulo: 'Em branco', dica: 'Começa com Gancho, Abertura, Desenvolvimento e CTA vazios para você escrever.', icone: ICONES.cartoes },
  { id: 'colar', titulo: 'Colar ou abrir .md', dica: 'Um roteiro pronto em texto: vira cenas sozinho (tempos, cenas, letreiros e fontes).', icone: ICONES.livre },
];

function abrirNovoRoteiro(): void {
  let formato: FormatoRoteiro = 'reels';
  let tagIds: string[] = filtroTag ? [filtroTag] : [];
  let caminho: Caminho = 'ia';
  void openCustomModal(
    'Novo roteiro',
    ({ corpo, rodape, fechar }) => {
      const opcoes = document.createElement('div');
      opcoes.className = 'rot-caminhos';
      const titulo = input('text', '', 'Ex.: Xbox demite 268 e muda o futuro de Halo');
      titulo.classList.add('is-grande');
      const tema = textarea('', 'Do que o vídeo trata, em uma ou duas frases — a IA parte daqui.', 3);
      const colar = textarea('', 'Cole aqui o roteiro inteiro — do jeito que você já escreve (com "[0:00 - 0:45] Seção", "[Cena: …]", fontes…).', 9);
      colar.classList.add('rot-colar');
      const arquivo = document.createElement('input');
      arquivo.type = 'file';
      arquivo.accept = '.md,.markdown,.txt';
      arquivo.hidden = true;
      arquivo.addEventListener('change', () => {
        const f = arquivo.files?.[0];
        if (!f) return;
        void f.text().then((t) => {
          colar.value = t;
          if (!titulo.value.trim()) titulo.value = tituloDoTexto(t) ?? f.name.replace(/\.(md|markdown|txt)$/i, '');
        });
      });
      const abrirArquivo = buildBotao('Abrir arquivo .md', { icone: ICONES.exportar, variante: 'fantasma' });
      abrirArquivo.addEventListener('click', () => arquivo.click());

      const campos = document.createElement('div');
      campos.className = 'rot-novo-campos';
      const desenhar = (): void => {
        opcoes.replaceChildren();
        CAMINHOS.forEach((c) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'rot-caminho';
          b.classList.toggle('is-ativo', caminho === c.id);
          b.setAttribute('aria-pressed', String(caminho === c.id));
          b.innerHTML = svg(c.icone, 18, 2);
          b.append(Object.assign(document.createElement('strong'), { textContent: c.titulo }), Object.assign(document.createElement('span'), { textContent: c.dica }));
          b.addEventListener('click', () => {
            caminho = c.id;
            desenhar();
          });
          opcoes.appendChild(b);
        });
        campos.replaceChildren(campo('Título', titulo, caminho === 'colar' ? 'Em branco: usa o "# Título" do texto colado.' : undefined));
        if (caminho === 'ia') campos.appendChild(campo('Tema', tema, 'Você completa o briefing (público, tom, duração) no próximo passo.'));
        if (caminho === 'colar') {
          const linha = document.createElement('div');
          linha.className = 'rot-novo-colar';
          linha.append(colar, abrirArquivo, arquivo);
          campos.appendChild(campo('Roteiro', linha));
        }
        campos.appendChild(
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
          const desenharTags = (): void => {
            const grupo = document.createElement('div');
            grupo.className = 'md-pilulas';
            catalogoTags().forEach((t) => {
              const ativo = tagIds.includes(t.id);
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'md-pilula rot-pilula-tag';
              btn.style.setProperty('--cor-tag', t.cor);
              btn.classList.toggle('is-ativa', ativo);
              btn.textContent = t.nome;
              btn.addEventListener('click', () => {
                tagIds = ativo ? tagIds.filter((id) => id !== t.id) : [...tagIds, t.id];
                desenharTags();
              });
              grupo.appendChild(btn);
            });
            tagsWrap.replaceChildren(grupo);
          };
          desenharTags();
          campos.appendChild(campo('Tags / empresa', tagsWrap));
        }
        criarBtn.lastChild!.textContent = caminho === 'ia' ? 'Criar e abrir o assistente' : caminho === 'colar' ? 'Criar a partir do texto' : 'Criar e escrever';
      };

      const criar = async (): Promise<void> => {
        const nome = titulo.value.trim() || (caminho === 'colar' ? tituloDoTexto(colar.value) : undefined) || (caminho === 'ia' ? tema.value.trim().slice(0, 80) : '');
        if (!nome) {
          titulo.focus();
          erroInline(corpo, caminho === 'colar' ? 'Dê um título (ou cole um roteiro que comece com "# Título").' : 'Dê um título ao roteiro.');
          return;
        }
        if (caminho === 'colar' && !colar.value.trim()) {
          colar.focus();
          erroInline(corpo, 'Cole o roteiro (ou abra um arquivo .md).');
          return;
        }
        try {
          const id = await roteirosState.criarRoteiro({
            titulo: nome,
            formato,
            tagIds,
            ...(caminho === 'colar' ? { texto: colar.value } : {}),
            ...(caminho === 'ia' ? { briefing: { tema: tema.value.trim() } } : {}),
          });
          fechar();
          if (id) abrirNoEstudio(id, caminho === 'ia' ? { aba: 'ia' } : {});
        } catch (erro) {
          erroInline(corpo, erro);
        }
      };
      titulo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && caminho !== 'colar') void criar();
      });
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const criarBtn = buildBotao('Criar', { icone: ICONES.mais, variante: 'primario' });
      criarBtn.addEventListener('click', () => void criar());
      rodape.append(cancelar, criarBtn);
      corpo.append(opcoes, campos);
      desenhar();
      titulo.focus();
    },
    { largura: 720, icone: ICONES.roteiro, subtitulo: 'Escolha por onde começar — dá para trocar de caminho no Estúdio a qualquer momento.' },
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
