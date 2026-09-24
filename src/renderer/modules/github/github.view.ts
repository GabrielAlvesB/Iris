import type { PastaDeProjetos, RepoUnificado } from '../../../shared/types/github.types';
import type { CommitResumo } from '../../../shared/types/explorador.types';
import * as githubState from './github.state.js';
import type { GithubViewState } from './github.state.js';
import { openAvisoModal } from '../../ui/modal.js';
import { abrirTutorial } from '../../core/navegacao.js';
import {
  ICONES,
  buildAviso,
  buildBotao,
  buildBotaoAjuda,
  buildBusca,
  buildCabecalho,
  buildIndicadores,
  buildSegmentado,
  buildSelo,
  buildVazio,
  focarBusca,
  svg,
  tempoRelativo,
} from '../../ui/pagina.js';

type Filtro = 'todos' | 'pendentes' | 'locais' | 'privados';

let containerAtual: HTMLElement | null = null;
let filtroAtual: Filtro = 'todos';
let busca = '';

/** Cores tradicionais de linguagem no GitHub — identidade, não estado. */
const COR_LINGUAGEM: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  PHP: '#4f5d95',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Java: '#b07219',
  Go: '#00add8',
  Rust: '#dea584',
  'C#': '#178600',
  Vue: '#41b883',
  Shell: '#89e051',
};

function rerender(): void {
  const state = githubState.getCurrentState();
  if (containerAtual && state) render(containerAtual, state);
}

async function avisar(titulo: string, mensagem: string): Promise<void> {
  await openAvisoModal(titulo, mensagem, { botao: 'Entendi' });
}

function mensagemDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildTopo(state: GithubViewState): HTMLElement {
  const selo = !state.config.temToken
    ? buildSelo('sem token', 'atencao')
    : state.snapshot.conectado
      ? buildSelo('conectado', 'ok')
      : buildSelo('desconectado', 'erro');

  const atualizar = buildBotao(state.carregando ? 'Atualizando…' : 'Atualizar', { icone: ICONES.atualizar });
  atualizar.disabled = state.carregando;
  if (state.carregando) atualizar.classList.add('is-girando');
  atualizar.addEventListener('click', () => {
    void githubState.atualizarAgora().catch((error: unknown) => avisar('Falha ao atualizar', mensagemDe(error)));
  });

  const usuario = state.snapshot.usuario ?? state.config.usuario;
  const subtitulo = usuario
    ? `@${usuario} · sincronizado ${tempoRelativo(state.snapshot.atualizadoEm)}`
    : 'Seus repositórios do GitHub cruzados com o que está neste computador';

  return buildCabecalho({
    icone: ICONES.github,
    titulo: 'GitHub',
    subtitulo,
    extras: [selo],
    acoes: [atualizar, buildBotaoAjuda(() => abrirTutorial('github'))],
  });
}

function buildResumo(state: GithubViewState): HTMLElement {
  const repos = state.snapshot.repos;
  const locais = repos.filter((r) => r.local);
  const pendentes = locais.filter((r) => (r.local?.git.alteracoes ?? 0) > 0).length;
  const naoEnviados = locais.reduce((soma, r) => soma + (r.local?.git.ahead ?? 0), 0);
  const privados = repos.filter((r) => r.remoto?.privado).length;

  return buildIndicadores([
    { rotulo: 'Repositórios', valor: String(repos.length), detalhe: `${privados} privado${privados === 1 ? '' : 's'}` },
    { rotulo: 'Neste PC', valor: String(locais.length), detalhe: `em ${state.config.pastas.length} pasta${state.config.pastas.length === 1 ? '' : 's'}` },
    // Sem projeto local cadastrado não há o que medir: dizer "tudo commitado"
    // seria afirmar algo que ninguém verificou.
    locais.length === 0
      ? { rotulo: 'Com alterações', valor: '—', detalhe: 'adicione uma pasta de projetos' }
      : {
          rotulo: 'Com alterações',
          valor: String(pendentes),
          detalhe: pendentes > 0 ? 'trabalho não commitado' : 'tudo commitado',
          tom: pendentes > 0 ? 'atencao' : 'ok',
        },
    locais.length === 0
      ? { rotulo: 'Não enviados', valor: '—', detalhe: 'depende dos projetos locais' }
      : {
          rotulo: 'Não enviados',
          valor: String(naoEnviados),
          detalhe: naoEnviados > 0 ? 'commits à espera de push' : 'nada pendente',
          tom: naoEnviados > 0 ? 'atencao' : 'ok',
        },
  ]);
}

function buildPastas(state: GithubViewState): HTMLElement {
  const bloco = document.createElement('div');
  bloco.className = 'gh-pastas';

  const rotulo = document.createElement('span');
  rotulo.className = 'gh-pastas-rotulo';
  rotulo.innerHTML = svg(ICONES.pasta, 13);
  rotulo.appendChild(document.createTextNode(' Procurar projetos em'));
  bloco.appendChild(rotulo);

  state.config.pastas.forEach((pasta: PastaDeProjetos) => {
    const chip = document.createElement('span');
    chip.className = 'gh-pasta';
    chip.title = pasta.caminho;

    const nome = document.createElement('span');
    nome.textContent = pasta.nome;
    chip.appendChild(nome);

    const remover = document.createElement('button');
    remover.className = 'gh-pasta-remover';
    remover.innerHTML = svg(ICONES.xis, 11, 2.2);
    remover.title = 'Parar de procurar nesta pasta';
    remover.addEventListener('click', () => void githubState.removerPasta(pasta.id));
    chip.appendChild(remover);

    bloco.appendChild(chip);
  });

  const adicionar = document.createElement('button');
  adicionar.className = 'gh-pasta-add';
  adicionar.textContent = '+ adicionar pasta';
  adicionar.addEventListener('click', () => {
    void githubState.adicionarPasta().catch((error: unknown) => avisar('Não foi possível adicionar', mensagemDe(error)));
  });
  bloco.appendChild(adicionar);

  return bloco;
}

function buildLinhaCommit(commit: CommitResumo, local = false): HTMLElement {
  const linha = document.createElement('div');
  linha.className = `gh-commit${local ? ' is-local' : ''}`;
  linha.title = `${commit.mensagem}\npor ${commit.autor}`;

  const hash = document.createElement('code');
  hash.className = 'gh-commit-hash';
  hash.textContent = commit.hash;
  linha.appendChild(hash);

  const mensagem = document.createElement('span');
  mensagem.className = 'gh-commit-mensagem';
  mensagem.textContent = commit.mensagem;
  linha.appendChild(mensagem);

  const data = document.createElement('span');
  data.className = 'gh-commit-data';
  data.textContent = tempoRelativo(commit.data);
  linha.appendChild(data);

  return linha;
}

function buildBlocoLocal(repo: RepoUnificado): HTMLElement | null {
  if (!repo.local) return null;
  const { git, caminho } = repo.local;

  const bloco = document.createElement('div');
  bloco.className = 'gh-local';
  bloco.title = caminho;

  const branch = document.createElement('span');
  branch.className = 'gh-local-branch';
  branch.innerHTML = svg(ICONES.branch, 12);
  branch.appendChild(document.createTextNode(` ${git.branch}`));
  bloco.appendChild(branch);

  bloco.appendChild(
    git.alteracoes > 0
      ? buildSelo(`${git.alteracoes} ${git.alteracoes === 1 ? 'alteração' : 'alterações'}`, 'atencao')
      : buildSelo('limpo', 'ok'),
  );

  if (git.ahead !== undefined && git.behind !== undefined) {
    if (git.ahead > 0 || git.behind > 0) {
      const partes: string[] = [];
      if (git.ahead > 0) partes.push(`↑ ${git.ahead} a enviar`);
      if (git.behind > 0) partes.push(`↓ ${git.behind} a baixar`);
      const sync = buildSelo(partes.join(' · '), 'atencao');
      // O git só sabe o que viu no último fetch.
      sync.title = 'Comparado ao último "git fetch" deste repositório.';
      bloco.appendChild(sync);
    }
  } else {
    bloco.appendChild(buildSelo('sem upstream', 'neutro'));
  }

  const caminhoEl = document.createElement('span');
  caminhoEl.className = 'gh-local-caminho';
  caminhoEl.textContent = caminho;
  bloco.appendChild(caminhoEl);

  return bloco;
}

function buildCard(repo: RepoUnificado): HTMLElement {
  const card = document.createElement('article');
  card.className = `pg-card gh-repo${repo.local ? ' is-local' : ''}`;

  const topo = document.createElement('div');
  topo.className = 'gh-repo-topo';

  const titulo = document.createElement('div');
  titulo.className = 'gh-repo-titulo';

  const dono = repo.remoto?.nomeCompleto.split('/')[0];
  if (dono) {
    const donoEl = document.createElement('span');
    donoEl.className = 'gh-repo-dono';
    donoEl.textContent = `${dono} /`;
    titulo.appendChild(donoEl);
  }

  const nome = document.createElement('h3');
  nome.className = 'gh-repo-nome';
  nome.textContent = repo.remoto?.nome ?? repo.nome;
  titulo.appendChild(nome);
  topo.appendChild(titulo);

  const selos = document.createElement('div');
  selos.className = 'gh-repo-selos';
  if (repo.remoto?.privado) selos.appendChild(buildSelo('privado', 'neutro'));
  if (repo.remoto?.fork) selos.appendChild(buildSelo('fork', 'neutro'));
  if (!repo.remoto) selos.appendChild(buildSelo('só neste PC', 'neutro'));
  topo.appendChild(selos);

  if (repo.remoto) {
    const abrir = buildBotao('', { icone: ICONES.externo, variante: 'fantasma', titulo: 'Abrir no GitHub' });
    abrir.addEventListener('click', () => void githubState.abrirRepo(repo.remoto!.url));
    topo.appendChild(abrir);
  }
  card.appendChild(topo);

  if (repo.remoto?.descricao) {
    const descricao = document.createElement('p');
    descricao.className = 'gh-repo-descricao';
    descricao.textContent = repo.remoto.descricao;
    card.appendChild(descricao);
  }

  const meta = document.createElement('div');
  meta.className = 'gh-repo-meta';
  if (repo.remoto?.linguagem) {
    const linguagem = document.createElement('span');
    linguagem.className = 'gh-linguagem';
    const bolinha = document.createElement('span');
    bolinha.className = 'gh-linguagem-cor';
    bolinha.style.background = COR_LINGUAGEM[repo.remoto.linguagem] ?? 'var(--text-faint)';
    linguagem.appendChild(bolinha);
    linguagem.appendChild(document.createTextNode(repo.remoto.linguagem));
    meta.appendChild(linguagem);
  }
  if (repo.remoto && repo.remoto.estrelas > 0) {
    const estrelas = document.createElement('span');
    estrelas.textContent = `★ ${repo.remoto.estrelas}`;
    meta.appendChild(estrelas);
  }
  const quando = document.createElement('span');
  quando.textContent = `push ${tempoRelativo(repo.remoto?.enviadoEm ?? repo.local?.git.ultimoCommit?.data)}`;
  meta.appendChild(quando);
  card.appendChild(meta);

  const local = buildBlocoLocal(repo);
  if (local) card.appendChild(local);

  const commits = repo.remoto?.commits ?? [];
  if (commits.length > 0) {
    const lista = document.createElement('div');
    lista.className = 'gh-commits';
    commits.forEach((commit) => lista.appendChild(buildLinhaCommit(commit)));
    card.appendChild(lista);
  } else if (repo.local?.git.ultimoCommit) {
    // Fora do top de atividade não há commits da API; o último local dá contexto.
    const lista = document.createElement('div');
    lista.className = 'gh-commits';
    lista.appendChild(buildLinhaCommit(repo.local.git.ultimoCommit, true));
    card.appendChild(lista);
  }

  return card;
}

function filtrar(repos: RepoUnificado[], filtro: Filtro, texto: string): RepoUnificado[] {
  const termo = texto.trim().toLocaleLowerCase('pt-BR');

  return repos.filter((repo) => {
    if (termo) {
      const alvo = `${repo.nome} ${repo.remoto?.nomeCompleto ?? ''} ${repo.remoto?.descricao ?? ''}`;
      if (!alvo.toLocaleLowerCase('pt-BR').includes(termo)) return false;
    }
    if (filtro === 'pendentes') return Boolean(repo.local && repo.local.git.alteracoes > 0);
    if (filtro === 'locais') return Boolean(repo.local);
    if (filtro === 'privados') return Boolean(repo.remoto?.privado);
    return true;
  });
}

export function render(container: HTMLElement, state: GithubViewState): void {
  containerAtual = container;
  container.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'pg-view gh-view';
  view.appendChild(buildTopo(state));

  if (!state.config.temToken) {
    const ir = buildBotao('Ver o passo a passo', { variante: 'primario' });
    ir.addEventListener('click', () => abrirTutorial('github'));
    view.appendChild(
      buildVazio(
        ICONES.github,
        'Conecte sua conta do GitHub',
        'Crie um token pessoal e cole em Ajustes. O tutorial mostra onde criar e qual permissão marcar para ver também os repositórios privados.',
        ir,
      ),
    );
    view.appendChild(buildPastas(state));
    container.appendChild(view);
    return;
  }

  if (state.snapshot.erro) view.appendChild(buildAviso(state.snapshot.erro, 'erro'));

  view.appendChild(buildResumo(state));

  const barra = document.createElement('div');
  barra.className = 'pg-barra';
  // A contagem de cada aba ignora a busca: mostra o tamanho da categoria.
  const contagem = (f: Filtro): number => filtrar(state.snapshot.repos, f, '').length;
  const rotulos: Array<{ value: Filtro; label: string }> = [
    { value: 'todos', label: `Todos · ${contagem('todos')}` },
    { value: 'pendentes', label: `Com alterações · ${contagem('pendentes')}` },
    { value: 'locais', label: `Neste PC · ${contagem('locais')}` },
    { value: 'privados', label: `Privados · ${contagem('privados')}` },
  ];

  barra.appendChild(
    buildSegmentado<Filtro>(rotulos, filtroAtual, (valor) => {
      filtroAtual = valor;
      rerender();
    }),
  );
  const espaco = document.createElement('div');
  espaco.className = 'pg-espaco';
  barra.appendChild(espaco);
  barra.appendChild(
    buildBusca(busca, 'Buscar repositório…', (valor) => {
      busca = valor;
      rerender();
      focarBusca(containerAtual);
    }),
  );
  view.appendChild(barra);
  view.appendChild(buildPastas(state));

  const conteudo = document.createElement('div');
  conteudo.className = 'pg-rolagem';

  const visiveis = filtrar(state.snapshot.repos, filtroAtual, busca);
  if (visiveis.length === 0) {
    conteudo.appendChild(
      state.snapshot.repos.length === 0
        ? buildVazio(ICONES.github, 'Nenhum repositório ainda', 'Clique em Atualizar para buscar seus repositórios.')
        : buildVazio(ICONES.github, 'Nada encontrado', 'Nenhum repositório bate com a busca e o filtro atuais.'),
    );
  } else {
    const grade = document.createElement('div');
    grade.className = 'gh-grade';
    visiveis.forEach((repo) => grade.appendChild(buildCard(repo)));
    conteudo.appendChild(grade);
  }

  view.appendChild(conteudo);
  container.appendChild(view);
}

export function destroy(): void {
  containerAtual = null;
  busca = '';
  filtroAtual = 'todos';
}
