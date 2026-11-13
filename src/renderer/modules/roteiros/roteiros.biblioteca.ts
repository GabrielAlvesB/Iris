import { ideiaPendente, type Ideia, type IdeiasFile } from '../../../shared/types/ideias.types.js';
import { falaCompleta, formatarTempo, tempoTotal } from '../../../shared/types/roteiros.conversao.js';
import { CORES_PASTA, STATUS_ROTEIRO, type PastaRoteiro, type Roteiro, type RoteirosFile, type StatusRoteiro } from '../../../shared/types/roteiros.types.js';
import { campo, erroInline, input, textarea } from '../../ui/campos.js';
import { abrirMenuIa } from '../../ui/ia.js';
import { mensagemDeErro, openAvisoModal, openConfirmModal, openCustomModal } from '../../ui/modal.js';
import { buildBotao, buildBusca, buildCabecalho, buildSelo, buildVazio, focarBusca, svg, tempoRelativo } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { ICONES, TOM_DO_STATUS, rotuloFormato, rotuloStatus } from './roteiros.comum.js';
import * as roteirosState from './roteiros.state.js';

/**
 * A tela inicial dos Roteiros: um lugar para guardar, não um quadro de
 * produção. Pastas do usuário à esquerda (por canal, cliente, série…), os
 * roteiros como documentos à direita, e as Ideias soltas — o mesmo banco de
 * Postagens › Ideias, onde uma ideia vira roteiro com um clique. A situação
 * (rascunho, revisão…) é só um selo no documento e um filtro.
 *
 * Arrastar um documento para uma pasta move; "⋯" do documento faz o mesmo.
 */

export interface AcoesBiblioteca {
  abrir(roteiroId: string): void;
  novo(pastaId?: string): void;
  checklistPadrao(): void;
  redesenhar(): void;
}

type Vista = 'ideias' | 'todos' | 'sem-pasta' | string;
type Ordem = 'recentes' | 'titulo';

const ICONE_IDEIA = '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/>';
const ICONE_PASTA = '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>';
const ICONE_TODOS = '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>';
const ICONE_SEM_PASTA = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>';
const ICONE_CLIPE = '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>';
const ICONE_EDITAR = '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>';
const ICONE_ARQUIVAR = '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>';
const TIPO_ARRASTE = 'application/x-iris-roteiro';
const CHAVE = 'iris.roteiros.biblioteca';

let vista: Vista = 'todos';
let busca = '';
let filtroStatus: StatusRoteiro | 'todos' = 'todos';
let ordem: Ordem = 'recentes';
let ideias: IdeiasFile | null = null;
let carregandoIdeias = false;

// Só conveniência de tela: sem armazenamento, começa em "Todos".
try {
  const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as { vista?: string; ordem?: string };
  if (typeof salvo.vista === 'string' && salvo.vista) vista = salvo.vista;
  if (salvo.ordem === 'titulo') ordem = 'titulo';
} catch {
  // nada
}

function lembrar(): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ vista, ordem }));
  } catch {
    // nada
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

function unwrap<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

function carregarIdeias(acoes: AcoesBiblioteca): void {
  if (carregandoIdeias) return;
  carregandoIdeias = true;
  void window.irisAPI.ideias
    .getFile()
    .then((r) => {
      ideias = unwrap(r);
      acoes.redesenhar();
    })
    .catch(() => undefined)
    .finally(() => {
      carregandoIdeias = false;
    });
}

// ---------- Documentos ----------

function arquivosDe(r: Roteiro): number {
  return r.anexos.length + r.recursoIds.length;
}

function filtrar(file: RoteirosFile): Roteiro[] {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const lista = file.roteiros.filter((r) => {
    if (vista === 'sem-pasta' && r.pastaId) return false;
    if (vista !== 'todos' && vista !== 'sem-pasta' && r.pastaId !== vista) return false;
    if (filtroStatus !== 'todos' && r.status !== filtroStatus) return false;
    if (!termo) return true;
    return `${r.titulo} ${r.briefing.tema} ${r.observacoes} ${r.cenas.map((c) => `${c.titulo} ${c.fala}`).join(' ')} ${r.anexos.map((a) => a.nome).join(' ')}`
      .toLocaleLowerCase('pt-BR')
      .includes(termo);
  });
  return lista.sort((a, b) => (ordem === 'titulo' ? a.titulo.localeCompare(b.titulo, 'pt-BR') : b.updatedAt.localeCompare(a.updatedAt)));
}

function buildDoc(r: Roteiro, file: RoteirosFile, acoes: AcoesBiblioteca): HTMLElement {
  const doc = el('article', 'rb-doc');
  doc.tabIndex = 0;
  doc.draggable = true;
  doc.setAttribute('aria-label', `Roteiro ${r.titulo}`);
  doc.addEventListener('dragstart', (e) => {
    e.dataTransfer?.setData(TIPO_ARRASTE, r.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('rb-arrastando');
  });
  doc.addEventListener('dragend', () => document.body.classList.remove('rb-arrastando'));

  // A "folha": o começo da fala, como a primeira página de um documento.
  const folha = el('div', 'rb-doc-folha');
  const texto = falaCompleta(r.cenas).replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  folha.appendChild(el('p', 'rb-doc-trecho', texto.slice(0, 260) || 'Ainda sem fala escrita.'));
  folha.classList.toggle('is-vazia', !texto);
  const selo = buildSelo(rotuloStatus(r.status), TOM_DO_STATUS[r.status]);
  selo.classList.add('rb-doc-selo');
  folha.appendChild(selo);
  doc.appendChild(folha);

  const info = el('div', 'rb-doc-info');
  info.appendChild(el('h3', 'rb-doc-titulo', r.titulo));
  const total = tempoTotal(r);
  info.appendChild(el('p', 'rb-doc-meta', [rotuloFormato(r.formato), total ? `${formatarTempo(total)} de fala` : '', `${r.cenas.length} cena${r.cenas.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')));
  const pe = el('div', 'rb-doc-pe');
  const pasta = file.pastas.find((p) => p.id === r.pastaId);
  if (pasta && (vista === 'todos' || vista === 'ideias')) {
    const chip = el('span', 'rb-doc-pasta', pasta.nome);
    chip.style.setProperty('--rb-cor', pasta.cor);
    pe.appendChild(chip);
  }
  if (arquivosDe(r)) {
    const clipe = el('span', 'rb-doc-arquivos');
    clipe.innerHTML = svg(ICONE_CLIPE, 12, 2);
    clipe.append(String(arquivosDe(r)));
    clipe.title = `${arquivosDe(r)} arquivo${arquivosDe(r) === 1 ? '' : 's'} anexado${arquivosDe(r) === 1 ? '' : 's'}`;
    pe.appendChild(clipe);
  }
  pe.appendChild(el('time', 'rb-doc-quando', tempoRelativo(r.updatedAt)));
  const mais = el('button', 'rb-mais');
  mais.type = 'button';
  mais.innerHTML = svg(ICONES.mais3, 16, 2);
  mais.setAttribute('aria-label', `Mais ações de ${r.titulo}`);
  mais.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirMenuIa(mais, [
      { rotulo: 'Abrir', dica: 'No estúdio de roteiro', icone: ICONES.roteiro, fazer: () => acoes.abrir(r.id) },
      { rotulo: 'Mover para…', dica: 'Outra pasta ou "Sem pasta"', icone: ICONE_PASTA, fazer: () => escolherPasta([r.id], file, r.pastaId) },
      { rotulo: 'Duplicar', dica: 'Uma cópia em rascunho, na mesma pasta', icone: ICONES.duplicar, fazer: () => void roteirosState.duplicarRoteiro(r.id).catch(falhou) },
      {
        rotulo: 'Excluir',
        dica: r.kanbanCardId ? 'O card no Kanban continua lá' : 'Dá para desfazer logo depois (Alt+Z)',
        icone: ICONES.lixeira,
        fazer: () => {
          void openConfirmModal({ title: 'Excluir roteiro', message: `"${r.titulo}" será apagado, com as versões e os arquivos anexados.` }).then((ok) => {
            if (ok) void roteirosState.excluirRoteiro(r.id).catch(falhou);
          });
        },
      },
    ]);
  });
  pe.appendChild(mais);
  info.appendChild(pe);
  doc.appendChild(info);

  doc.addEventListener('click', () => acoes.abrir(r.id));
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target === doc) acoes.abrir(r.id);
  });
  return doc;
}

// ---------- Pastas ----------

function editarPasta(pasta: PastaRoteiro | null, depois?: (id: string) => void): void {
  let cor = pasta?.cor ?? CORES_PASTA[0];
  void openCustomModal(
    pasta ? 'Editar pasta' : 'Nova pasta',
    ({ corpo, rodape, fechar }) => {
      const nome = input('text', pasta?.nome ?? '', 'Ex.: Canal, Cliente X, Série de dicas');
      nome.maxLength = 80;
      corpo.appendChild(campo('Nome', nome));
      const cores = el('div', 'rb-cores');
      cores.setAttribute('role', 'radiogroup');
      cores.setAttribute('aria-label', 'Cor');
      CORES_PASTA.forEach((c) => {
        const b = el('button', 'rb-cor');
        b.type = 'button';
        b.style.setProperty('--rb-cor', c);
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(c === cor));
        b.setAttribute('aria-label', `Cor ${c}`);
        b.addEventListener('click', () => {
          cor = c;
          cores.querySelectorAll('.rb-cor').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        });
        cores.appendChild(b);
      });
      corpo.appendChild(campo('Cor', cores));
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const salvar = buildBotao(pasta ? 'Salvar' : 'Criar pasta', { variante: 'primario' });
      const ir = async (): Promise<void> => {
        try {
          const id = await roteirosState.salvarPasta({ ...(pasta ? { id: pasta.id } : {}), nome: nome.value, cor });
          fechar();
          depois?.(id);
        } catch (e) {
          erroInline(corpo, e);
        }
      };
      salvar.addEventListener('click', () => void ir());
      nome.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') void ir();
      });
      rodape.append(cancelar, salvar);
      nome.focus();
    },
    { largura: 440, icone: ICONE_PASTA },
  );
}

function escolherPasta(roteiroIds: string[], file: RoteirosFile, atual?: string): void {
  void openCustomModal(
    'Mover para…',
    ({ corpo, fechar }) => {
      const lista = el('div', 'rb-escolha');
      const opcao = (rotulo: string, pastaId: string | null, cor?: string): void => {
        const b = el('button', 'rb-escolha-item');
        b.type = 'button';
        const ponto = el('span', 'rb-ponto');
        if (cor) ponto.style.setProperty('--rb-cor', cor);
        else ponto.classList.add('is-vazio');
        b.append(ponto, el('span', undefined, rotulo));
        if ((pastaId ?? undefined) === atual) {
          b.disabled = true;
          b.appendChild(el('small', undefined, 'está aqui'));
        }
        b.addEventListener('click', () => {
          fechar();
          void roteirosState.moverRoteiros(roteiroIds, pastaId).catch(falhou);
        });
        lista.appendChild(b);
      };
      file.pastas.forEach((p) => opcao(p.nome, p.id, p.cor));
      opcao('Sem pasta', null);
      corpo.appendChild(lista);
      const nova = buildBotao('Nova pasta…', { icone: ICONES.mais, variante: 'fantasma' });
      nova.addEventListener('click', () => {
        fechar();
        editarPasta(null, (id) => void roteirosState.moverRoteiros(roteiroIds, id).catch(falhou));
      });
      corpo.appendChild(nova);
    },
    { largura: 380, icone: ICONE_PASTA },
  );
}

/** Item da lateral que aceita um documento arrastado. */
function alvoDeArraste(item: HTMLElement, pastaId: string | null): void {
  item.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes(TIPO_ARRASTE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    item.classList.add('is-alvo');
  });
  item.addEventListener('dragleave', () => item.classList.remove('is-alvo'));
  item.addEventListener('drop', (e) => {
    item.classList.remove('is-alvo');
    const id = e.dataTransfer?.getData(TIPO_ARRASTE);
    if (!id) return;
    e.preventDefault();
    void roteirosState
      .moverRoteiros([id], pastaId)
      .then(() => mostrarToast(pastaId ? 'Roteiro movido para a pasta.' : 'Roteiro tirado da pasta.'))
      .catch(falhou);
  });
}

function buildLado(file: RoteirosFile, acoes: AcoesBiblioteca): HTMLElement {
  const lado = el('nav', 'rb-lado');
  lado.setAttribute('aria-label', 'Pastas dos roteiros');
  const item = (id: Vista, rotulo: string, n: number | null, icone: string, cor?: string): HTMLButtonElement => {
    const b = el('button', 'rb-item');
    b.type = 'button';
    b.classList.toggle('is-ativo', vista === id);
    b.setAttribute('aria-current', String(vista === id));
    const ic = el('span', 'rb-item-icone');
    if (cor) {
      ic.classList.add('is-pasta');
      ic.style.setProperty('--rb-cor', cor);
    }
    ic.innerHTML = svg(icone, 15, 2);
    b.append(ic, el('span', 'rb-item-nome', rotulo));
    if (n !== null) b.appendChild(el('span', 'rb-item-n', String(n)));
    b.addEventListener('click', () => {
      vista = id;
      busca = '';
      lembrar();
      acoes.redesenhar();
    });
    return b;
  };

  const pendentes = ideias ? ideias.ideias.filter(ideiaPendente).length : null;
  lado.appendChild(item('ideias', 'Ideias', pendentes, ICONE_IDEIA));
  lado.appendChild(item('todos', 'Todos os roteiros', file.roteiros.length, ICONE_TODOS));
  if (file.pastas.length) {
    const sem = item('sem-pasta', 'Sem pasta', file.roteiros.filter((r) => !r.pastaId).length, ICONE_SEM_PASTA);
    alvoDeArraste(sem, null);
    lado.appendChild(sem);
  }

  const cab = el('div', 'rb-lado-cab');
  cab.appendChild(el('span', undefined, 'Pastas'));
  const nova = el('button', 'rb-lado-nova');
  nova.type = 'button';
  nova.innerHTML = svg(ICONES.mais, 14, 2.2);
  nova.title = 'Nova pasta';
  nova.setAttribute('aria-label', 'Nova pasta');
  nova.addEventListener('click', () =>
    editarPasta(null, (id) => {
      vista = id;
      lembrar();
      acoes.redesenhar();
    }),
  );
  cab.appendChild(nova);
  lado.appendChild(cab);

  if (!file.pastas.length) lado.appendChild(el('p', 'rb-lado-dica', 'Crie pastas para separar por canal, cliente ou série. Arraste os roteiros até elas.'));
  file.pastas.forEach((p) => {
    const linha = el('div', 'rb-pasta');
    const b = item(p.id, p.nome, file.roteiros.filter((r) => r.pastaId === p.id).length, ICONE_PASTA, p.cor);
    alvoDeArraste(b, p.id);
    const mais = el('button', 'rb-mais rb-pasta-mais');
    mais.type = 'button';
    mais.innerHTML = svg(ICONES.mais3, 14, 2);
    mais.setAttribute('aria-label', `Mais ações da pasta ${p.nome}`);
    mais.addEventListener('click', () =>
      abrirMenuIa(mais, [
        { rotulo: 'Renomear ou trocar a cor', dica: p.nome, icone: ICONE_EDITAR, fazer: () => editarPasta(p) },
        {
          rotulo: 'Excluir a pasta',
          dica: 'Os roteiros dela voltam para "Sem pasta"',
          icone: ICONES.lixeira,
          fazer: () => {
            const n = file.roteiros.filter((r) => r.pastaId === p.id).length;
            void openConfirmModal({
              title: 'Excluir pasta',
              message: n ? `"${p.nome}" sai da lista. Os ${n} roteiro${n === 1 ? '' : 's'} dela não são apagados: voltam para "Sem pasta".` : `"${p.nome}" sai da lista.`,
              confirmText: 'Excluir pasta',
            }).then((ok) => {
              if (!ok) return;
              if (vista === p.id) vista = 'todos';
              lembrar();
              void roteirosState.excluirPasta(p.id).catch(falhou);
            });
          },
        },
      ]),
    );
    linha.append(b, mais);
    lado.appendChild(linha);
  });
  return lado;
}

// ---------- Ideias ----------

async function rodarIdeias(p: Promise<{ ok: true; data: IdeiasFile } | { ok: false; error: string }>, acoes: AcoesBiblioteca): Promise<void> {
  try {
    ideias = unwrap(await p);
    acoes.redesenhar();
  } catch (e) {
    falhou(e);
  }
}

function editarIdeia(i: Ideia, acoes: AcoesBiblioteca): void {
  void openCustomModal(
    'Editar ideia',
    ({ corpo, rodape, fechar }) => {
      const titulo = input('text', i.titulo);
      const notas = textarea(i.notas, 'Contexto, referências, o ângulo que você imaginou…', 5);
      corpo.append(campo('Ideia', titulo), campo('Notas', notas, 'Viram as observações do roteiro quando a ideia virar roteiro.'));
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const salvar = buildBotao('Salvar', { variante: 'primario' });
      salvar.addEventListener('click', () => {
        void rodarIdeias(window.irisAPI.ideias.atualizar({ id: i.id, titulo: titulo.value, notas: notas.value }), acoes).then(fechar);
      });
      rodape.append(cancelar, salvar);
    },
    { largura: 520, icone: ICONE_IDEIA },
  );
}

async function virarRoteiro(i: Ideia, acoes: AcoesBiblioteca): Promise<void> {
  try {
    const r = unwrap(await window.irisAPI.ideias.virarRoteiro(i.id));
    ideias = r.file;
    await roteirosState.load();
    acoes.abrir(r.roteiroId);
  } catch (e) {
    falhou(e);
  }
}

function buildIdeia(i: Ideia, acoes: AcoesBiblioteca): HTMLElement {
  const cartao = el('article', 'rb-ideia');
  cartao.appendChild(el('h3', 'rb-ideia-titulo', i.titulo));
  if (i.notas.trim()) cartao.appendChild(el('p', 'rb-ideia-notas', i.notas));
  const pe = el('div', 'rb-ideia-pe');
  pe.appendChild(el('time', 'rb-doc-quando', tempoRelativo(i.criadaEm)));
  const virar = buildBotao('Virar roteiro', { icone: ICONES.roteiro, variante: 'secundario', titulo: 'Cria um roteiro com esta ideia (as notas vão para as observações) e abre no estúdio' });
  virar.classList.add('is-mini');
  virar.addEventListener('click', () => void virarRoteiro(i, acoes));
  const mais = el('button', 'rb-mais');
  mais.type = 'button';
  mais.innerHTML = svg(ICONES.mais3, 16, 2);
  mais.setAttribute('aria-label', `Mais ações da ideia ${i.titulo}`);
  mais.addEventListener('click', () =>
    abrirMenuIa(mais, [
      { rotulo: 'Editar', dica: 'Título e notas', icone: ICONE_EDITAR, fazer: () => editarIdeia(i, acoes) },
      { rotulo: 'Arquivar', dica: 'Sai daqui; fica em Postagens › Ideias › Arquivadas', icone: ICONE_ARQUIVAR, fazer: () => void rodarIdeias(window.irisAPI.ideias.atualizar({ id: i.id, arquivada: true }), acoes) },
      {
        rotulo: 'Excluir',
        dica: 'Apaga a ideia',
        icone: ICONES.lixeira,
        fazer: () => {
          void openConfirmModal({ title: 'Excluir ideia', message: `"${i.titulo}" sai do banco de ideias.`, confirmText: 'Excluir' }).then((ok) => {
            if (ok) void rodarIdeias(window.irisAPI.ideias.excluir(i.id), acoes);
          });
        },
      },
    ]),
  );
  pe.append(el('span', 'pg-espaco'), virar, mais);
  cartao.appendChild(pe);
  return cartao;
}

function buildIdeias(acoes: AcoesBiblioteca): HTMLElement {
  const wrap = el('div', 'rb-principal');
  const cab = el('div', 'rb-principal-cab');
  const textos = el('div');
  textos.append(
    el('h2', 'rb-principal-titulo', 'Ideias'),
    el('p', 'rb-principal-sub', 'Anote sem compromisso. Quando amadurecer, vira roteiro com um clique. As mesmas ideias aparecem em Postagens › Ideias.'),
  );
  cab.appendChild(textos);
  wrap.appendChild(cab);

  const nova = textarea('', 'Anotar uma ideia e Enter — colar várias linhas cria uma ideia por linha', 1);
  nova.classList.add('rb-ideia-nova');
  nova.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const titulos = nova.value
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    if (!titulos.length) return;
    nova.value = '';
    void rodarIdeias(window.irisAPI.ideias.criar({ titulos }), acoes).then(() =>
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.rb-ideia-nova')?.focus()),
    );
  });
  // Colar várias linhas: uma ideia por linha, sem precisar do Enter.
  nova.addEventListener('paste', (e) => {
    const colado = e.clipboardData?.getData('text') ?? '';
    const titulos = colado
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    if (titulos.length < 2) return;
    e.preventDefault();
    void rodarIdeias(window.irisAPI.ideias.criar({ titulos }), acoes);
  });
  wrap.appendChild(nova);

  if (!ideias) {
    wrap.appendChild(el('p', 'md-vazio', 'Carregando…'));
    return wrap;
  }
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const pendentes = ideias.ideias
    .filter(ideiaPendente)
    .filter((i) => !termo || `${i.titulo} ${i.notas}`.toLocaleLowerCase('pt-BR').includes(termo))
    .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
  if (!pendentes.length) {
    wrap.appendChild(buildVazio(ICONE_IDEIA, 'Nenhuma ideia guardada', 'Um tema, uma frase, um link que deu vontade de gravar: anote aqui. Ideia que virou roteiro ou postagem sai da lista e guarda o caminho até ele.'));
    return wrap;
  }
  const grade = el('div', 'rb-ideias');
  pendentes.forEach((i) => grade.appendChild(buildIdeia(i, acoes)));
  wrap.appendChild(grade);
  return wrap;
}

// ---------- Tela ----------

function buildDocumentos(file: RoteirosFile, acoes: AcoesBiblioteca): HTMLElement {
  const wrap = el('div', 'rb-principal');
  const pasta = file.pastas.find((p) => p.id === vista);
  const titulo = vista === 'todos' ? 'Todos os roteiros' : vista === 'sem-pasta' ? 'Sem pasta' : (pasta?.nome ?? 'Todos os roteiros');
  const cab = el('div', 'rb-principal-cab');
  const h = el('h2', 'rb-principal-titulo');
  if (pasta) {
    const ponto = el('span', 'rb-ponto is-grande');
    ponto.style.setProperty('--rb-cor', pasta.cor);
    h.appendChild(ponto);
  }
  h.append(titulo);
  cab.appendChild(h);
  const novo = buildBotao(pasta ? 'Novo roteiro aqui' : 'Novo roteiro', { icone: ICONES.mais, variante: 'primario' });
  novo.addEventListener('click', () => acoes.novo(pasta?.id));
  cab.appendChild(novo);
  wrap.appendChild(cab);

  const barra = el('div', 'rb-barra');
  barra.appendChild(
    buildBusca(busca, 'Buscar título, fala ou nome de arquivo…', (v) => {
      busca = v;
      acoes.redesenhar();
      focarBusca(document.querySelector('.rb-principal'));
    }),
  );
  const situacao = document.createElement('select');
  situacao.className = 'md-input rb-select';
  situacao.setAttribute('aria-label', 'Situação');
  situacao.appendChild(new Option('Todas as situações', 'todos'));
  STATUS_ROTEIRO.forEach((s) => situacao.appendChild(new Option(s.rotulo, s.id)));
  situacao.value = filtroStatus;
  situacao.addEventListener('change', () => {
    filtroStatus = situacao.value as StatusRoteiro | 'todos';
    acoes.redesenhar();
  });
  const ordenar = document.createElement('select');
  ordenar.className = 'md-input rb-select';
  ordenar.setAttribute('aria-label', 'Ordem');
  ordenar.append(new Option('Editados por último', 'recentes'), new Option('Título (A–Z)', 'titulo'));
  ordenar.value = ordem;
  ordenar.addEventListener('change', () => {
    ordem = ordenar.value === 'titulo' ? 'titulo' : 'recentes';
    lembrar();
    acoes.redesenhar();
  });
  barra.append(situacao, ordenar);
  wrap.appendChild(barra);

  const lista = filtrar(file);
  if (!lista.length) {
    const vazioTotal = !file.roteiros.length;
    const comecar = buildBotao(vazioTotal ? 'Escrever o primeiro roteiro' : 'Novo roteiro', { icone: ICONES.mais, variante: 'primario' });
    comecar.addEventListener('click', () => acoes.novo(pasta?.id));
    wrap.appendChild(
      buildVazio(
        pasta ? ICONE_PASTA : ICONES.roteiro,
        vazioTotal ? 'Nenhum roteiro ainda' : busca || filtroStatus !== 'todos' ? 'Nada com esses filtros' : 'Pasta vazia',
        vazioTotal
          ? 'Um roteiro é uma sequência de cenas — gancho, desenvolvimento, CTA — com o que se fala, o que se vê e os arquivos de referência. Comece por uma ideia (em Ideias) ou escreva direto.'
          : pasta
            ? 'Arraste roteiros até esta pasta na lateral, ou crie um novo aqui.'
            : 'Tente outra busca ou situação.',
        busca || filtroStatus !== 'todos' ? undefined : comecar,
      ),
    );
    return wrap;
  }
  const grade = el('div', 'rb-grade');
  lista.forEach((r) => grade.appendChild(buildDoc(r, file, acoes)));
  wrap.appendChild(grade);
  return wrap;
}

export function desenharBiblioteca(container: HTMLElement, file: RoteirosFile, acoes: AcoesBiblioteca): void {
  // A pasta lembrada pode ter sido apagada (ou vir de outro computador pelo backup).
  if (vista !== 'todos' && vista !== 'sem-pasta' && vista !== 'ideias' && !file.pastas.some((p) => p.id === vista)) vista = 'todos';
  if (vista === 'sem-pasta' && !file.pastas.length) vista = 'todos';
  if (!ideias) carregarIdeias(acoes);

  const rolagemAntes = container.querySelector<HTMLElement>('.rb-conteudo')?.scrollTop ?? 0;
  const tela = el('div', 'pg-view rot-view rb');
  const verificacao = buildBotao('Verificação padrão', { icone: ICONES.lista, variante: 'secundario', titulo: 'Itens com que todo roteiro novo nasce' });
  verificacao.addEventListener('click', () => acoes.checklistPadrao());
  tela.appendChild(
    buildCabecalho({
      icone: ICONES.roteiro,
      titulo: 'Roteiros',
      subtitulo: 'Ideias, roteiros e os arquivos de cada um, organizados em pastas',
      acoes: [verificacao],
    }),
  );
  const corpo = el('div', 'rb-corpo');
  const conteudo = el('div', 'rb-conteudo');
  conteudo.appendChild(vista === 'ideias' ? buildIdeias(acoes) : buildDocumentos(file, acoes));
  corpo.append(buildLado(file, acoes), conteudo);
  tela.appendChild(corpo);
  container.replaceChildren(tela);
  conteudo.scrollTop = rolagemAntes;
}

/** Depois de criar ou mexer em ideias por outro caminho: relê na próxima vez. */
export function esquecerIdeias(): void {
  ideias = null;
}
