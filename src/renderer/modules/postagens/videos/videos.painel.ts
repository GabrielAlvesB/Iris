import { VIDEO_STATUS, type AtualizarVideoInput, type CampoExtra, type Video, type VideosFile } from '../../../../shared/types/videos.types.js';
import { descreverOrigem, extrairHashtags } from '../../../../shared/types/videos.conversao.js';
import { svg } from '../../../ui/pagina.js';
import { abrirPainel as abrirCasca, type PainelHandle } from '../../../ui/painel.js';
import { buildMateriais } from '../postagens.materiais.js';
import {
  ICONE_SECAO,
  buildAgendamento,
  buildBotaoCopiar,
  buildCampo,
  buildCampoScore,
  buildContador,
  buildEtapas,
  buildExtras,
  buildHistorico,
  buildPrioridadeEscolha,
  buildPreviaHashtags,
  buildPublicacoes,
  buildRedes,
  buildRodapePostagem,
  buildSecaoPainel,
  buildSeloEtapa,
  buildTags,
  buildTituloPainel,
  criarSalvador,
  textareaPainel,
} from '../postagens.secoes.js';
import { ICONES_POSTAGEM, buildSeloAgenda, formatarDataHora, legendaCompleta } from '../postagens.ui.js';
import * as videosState from './videos.state.js';

/**
 * Painel de um vídeo: tudo editável sem sair da pipeline. A casca (posições,
 * fundo, Esc) é a de ui/painel; as seções comuns vêm de postagens.secoes. Aqui
 * fica só o que é de vídeo: descrição + hashtags e a origem na planilha.
 *
 * Quando o arquivo muda, só as seções derivadas são redesenhadas — os campos
 * de texto nunca, para não perder o cursor.
 */

interface Rascunho {
  titulo: string;
  descricao: string;
  hashtags: string;
  dataAgendada: string;
  horaAgendada: string;
  notas: string;
  camposExtras: CampoExtra[];
}

let handle: PainelHandle | null = null;
let videoId: string | null = null;
let rascunho: Rascunho | null = null;
let redesenharSecoes: ((file: VideosFile, video: Video) => void) | null = null;

const salvador = criarSalvador(async () => {
  if (!videoId || !rascunho) return;
  const r = rascunho;
  await videosState.atualizarVideo({
    videoId,
    titulo: r.titulo.trim() || 'Sem título',
    descricao: r.descricao,
    hashtags: [r.hashtags],
    dataAgendada: r.dataAgendada,
    horaAgendada: r.horaAgendada,
    notas: r.notas,
    camposExtras: r.camposExtras,
  });
}, () => handle);

export function painelAbertoPara(): string | null {
  return videoId;
}

function avisar(erro: unknown): void {
  handle?.marcarErro(erro);
}

function salvar(input: Omit<AtualizarVideoInput, 'videoId'>): void {
  if (!videoId) return;
  void videosState.atualizarVideo({ videoId, ...input }).catch(avisar);
}

export function fecharPainel(): void {
  // Fecha já, mas não descarta o que foi digitado nos últimos 500 ms.
  void salvador.descarregar();
  const aberto = handle;
  handle = null;
  videoId = null;
  rascunho = null;
  redesenharSecoes = null;
  aberto?.fechar();
  document.querySelectorAll('.vd-card.is-aberto').forEach((el) => el.classList.remove('is-aberto'));
}

/** Chamado pela view a cada mudança de estado. */
export function sincronizarPainel(file: VideosFile): void {
  if (!videoId) return;
  const video = file.videos.find((v) => v.id === videoId);
  if (!video) {
    fecharPainel();
    return;
  }
  redesenharSecoes?.(file, video);
}

function buildOrigem(video: Video): HTMLElement | null {
  const origem = video.origem;
  if (!origem) return null;
  const secao = buildSecaoPainel('Origem na planilha', ICONES_POSTAGEM.planilha);
  secao.secao.id = 'vd-painel-origem';

  const ficha = document.createElement('dl');
  ficha.className = 'vd-origem-ficha';
  const linha = (rotulo: string, valor: string | undefined): void => {
    if (!valor) return;
    const dt = document.createElement('dt');
    dt.textContent = rotulo;
    const dd = document.createElement('dd');
    dd.textContent = valor;
    ficha.append(dt, dd);
  };
  linha('Arquivo', origem.arquivoNome ?? 'Tabela criada no Iris');
  linha('Aba', origem.abaNome);
  linha('Tabela no Iris', origem.tabelaNome);
  linha('Importado em', formatarDataHora(origem.importadoEm));
  secao.conteudo.appendChild(ficha);

  const bloco = document.createElement('details');
  bloco.className = 'vd-origem';
  const resumo = document.createElement('summary');
  resumo.textContent = `Linha original (${Object.keys(origem.dadosOriginais).length} colunas)`;
  bloco.appendChild(resumo);
  const nota = document.createElement('p');
  nota.className = 'vd-origem-nota';
  nota.textContent = 'Cópia da linha no momento da importação. Continua aqui mesmo se a planilha for alterada ou excluída.';
  bloco.appendChild(nota);
  const dl = document.createElement('dl');
  Object.entries(origem.dadosOriginais).forEach(([coluna, valor]) => {
    const dt = document.createElement('dt');
    dt.textContent = coluna;
    const dd = document.createElement('dd');
    dd.textContent = valor;
    dl.append(dt, dd);
  });
  bloco.appendChild(dl);
  secao.conteudo.appendChild(bloco);
  return secao.secao;
}

/** Faixa logo abaixo do título: de qual planilha o vídeo veio, sem rolar até a seção. */
function buildFaixaOrigem(video: Video): HTMLElement | null {
  const origem = video.origem;
  if (!origem) return null;
  const faixa = document.createElement('button');
  faixa.type = 'button';
  faixa.className = 'vd-painel-fonte';
  faixa.title = 'Ver detalhes da origem';
  faixa.innerHTML = svg(ICONES_POSTAGEM.planilha, 13, 2);
  const texto = document.createElement('span');
  texto.textContent = `Importado de ${descreverOrigem(origem)}`;
  const quando = document.createElement('time');
  quando.textContent = new Date(origem.importadoEm).toLocaleDateString('pt-BR');
  faixa.append(texto, quando);
  faixa.addEventListener('click', () => {
    document.getElementById('vd-painel-origem')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  return faixa;
}

/**
 * Vídeos importados antes dos campos extras existirem ainda têm a linha
 * original guardada: isto traz as colunas que faltam, sem duplicar.
 */
function acaoTrazerColunas(video: Video, extras: CampoExtra[]) {
  return (acoes: HTMLElement, redesenhar: () => void): void => {
    const origem = video.origem && !video.origem.colunasExtras ? video.origem.dadosOriginais : {};
    const nativos = new Set([video.titulo, video.descricao, video.notas].map((t) => t.trim()));
    const faltando = Object.entries(origem).filter(([nome, valor]) => !extras.some((e) => e.nome === nome) && !nativos.has(valor.trim()));
    if (!faltando.length) return;
    const trazer = document.createElement('button');
    trazer.type = 'button';
    trazer.className = 'pg-botao is-fantasma is-mini';
    trazer.title = faltando.map(([n]) => n).join(', ');
    trazer.innerHTML = svg(ICONES_POSTAGEM.planilha, 14, 2);
    trazer.append(`Trazer ${faltando.length} coluna(s) da planilha`);
    trazer.addEventListener('click', () => {
      faltando.forEach(([nome, valor]) => extras.push({ nome, valor }));
      salvador.agendar();
      redesenhar();
    });
    acoes.appendChild(trazer);
  };
}

export function abrirPainel(file: VideosFile, id: string): void {
  const video = file.videos.find((v) => v.id === id);
  if (!video) return;
  if (videoId === id && handle) return;
  fecharPainel();

  videoId = id;
  const r: Rascunho = {
    titulo: video.titulo,
    descricao: video.descricao,
    hashtags: video.hashtags.map((h) => `#${h}`).join(' '),
    dataAgendada: video.dataAgendada ?? '',
    horaAgendada: video.horaAgendada ?? '',
    notas: video.notas,
    camposExtras: video.camposExtras.map((c) => ({ ...c })),
  };
  rascunho = r;

  const casca = abrirCasca({
    icone: ICONES_POSTAGEM.video,
    rotulo: 'Vídeo',
    ariaLabel: 'Detalhes do vídeo',
    posicao: file.preferencias.posicaoPainel,
    aoMudarPosicao: (posicao) => {
      const atual = videosState.getCurrentState();
      if (atual && atual.preferencias.posicaoPainel !== posicao) {
        void videosState.salvarPreferencias({ ...atual.preferencias, posicaoPainel: posicao }).catch(avisar);
      }
    },
    aoFechar: () => {
      if (handle === casca) fecharPainel();
    },
  });
  handle = casca;
  const { grade } = casca;

  // Título em destaque, fora dos cartões
  const titulo = buildTituloPainel(
    r.titulo,
    'Título do vídeo',
    (v) => {
      r.titulo = v;
      salvador.agendar();
    },
    { max: 100, dica: 'O YouTube corta títulos acima de 100 caracteres' },
  );
  const faixaOrigem = buildFaixaOrigem(video);
  if (faixaOrigem) titulo.appendChild(faixaOrigem);
  casca.corpo.insertBefore(titulo, grade);

  // Produção
  const producao = buildSecaoPainel('Produção', ICONE_SECAO.producao);
  const etapasSlot = document.createElement('div');
  const prioridadeSlot = document.createElement('div');
  const scoreSlot = document.createElement('div');
  producao.conteudo.append(buildCampo('Etapa', etapasSlot), buildCampo('Prioridade', prioridadeSlot), buildCampo('Score', scoreSlot));
  scoreSlot.appendChild(buildCampoScore(video.score, (score) => salvar({ score })));
  grade.appendChild(producao.secao);

  // Agendamento e publicação
  const alertaSlot = document.createElement('span');
  const agendaSecao = buildSecaoPainel('Agendamento e publicação', ICONES_POSTAGEM.calendario, alertaSlot);
  const redesSlot = document.createElement('div');
  const publicacoesSlot = document.createElement('div');
  agendaSecao.conteudo.append(
    buildAgendamento(r.dataAgendada, r.horaAgendada, (campo, valor) => {
      r[campo] = valor;
      salvador.agora();
    }),
    buildCampo('Redes sociais', redesSlot),
    buildCampo('Links publicados', publicacoesSlot),
  );
  grade.appendChild(agendaSecao.secao);

  // Conteúdo: descrição e hashtags
  const contDescricao = buildContador(r.descricao);
  const copiar = buildBotaoCopiar('Copiar legenda', 'Descrição + hashtags, prontas para colar', () =>
    legendaCompleta({ descricao: r.descricao, hashtags: extrairHashtags(r.hashtags) }),
  );
  const conteudo = buildSecaoPainel('Conteúdo', ICONE_SECAO.conteudo, copiar);
  conteudo.conteudo.appendChild(
    buildCampo(
      'Descrição / legenda',
      textareaPainel(r.descricao, 'O texto que acompanha o vídeo', 5, (v) => {
        r.descricao = v;
        contDescricao.atualizar(v);
        salvador.agendar();
      }),
      contDescricao.el,
    ),
  );
  const previa = buildPreviaHashtags();
  previa.desenhar(r.hashtags);
  const hashtagsWrap = document.createElement('div');
  hashtagsWrap.append(
    textareaPainel(r.hashtags, '#horadecodar #javascript', 2, (v) => {
      r.hashtags = v;
      previa.desenhar(v);
      salvador.agendar();
    }),
    previa.el,
  );
  conteudo.conteudo.appendChild(buildCampo('Hashtags', hashtagsWrap));
  grade.appendChild(conteudo.secao);

  // Informações extras
  const informacoes = buildSecaoPainel('Informações', ICONE_SECAO.informacoes);
  informacoes.conteudo.appendChild(buildExtras(r.camposExtras, () => salvador.agendar(), acaoTrazerColunas(video, r.camposExtras)));
  grade.appendChild(informacoes.secao);

  // Tags
  const tagsSecao = buildSecaoPainel('Tags', ICONES_POSTAGEM.tag);
  const tagsSlot = document.createElement('div');
  tagsSecao.conteudo.appendChild(tagsSlot);
  grade.appendChild(tagsSecao.secao);

  // Materiais da Biblioteca
  const materiaisSlot = document.createElement('section');
  materiaisSlot.className = 'md-secao vd-p-secao';
  grade.appendChild(materiaisSlot);

  // Notas
  const notas = buildSecaoPainel('Notas', ICONE_SECAO.notas);
  notas.conteudo.appendChild(
    textareaPainel(r.notas, 'Roteiro, ideias de cena, referências…', 4, (v) => {
      r.notas = v;
      salvador.agendar();
    }),
  );
  grade.appendChild(notas.secao);

  const origemSlot = document.createElement('div');
  grade.appendChild(origemSlot);
  const historico = buildSecaoPainel('Histórico', ICONES_POSTAGEM.historico);
  const historicoSlot = document.createElement('div');
  historico.conteudo.appendChild(historicoSlot);
  grade.appendChild(historico.secao);

  redesenharSecoes = (arquivo, atual) => {
    casca.estado.replaceChildren(buildSeloEtapa(atual, VIDEO_STATUS));
    etapasSlot.replaceChildren(buildEtapas(VIDEO_STATUS, atual.status, (status) => salvar({ status: status as Video['status'] })));
    prioridadeSlot.replaceChildren(buildPrioridadeEscolha(atual.prioridade, (prioridade) => salvar({ prioridade })));
    const alerta = buildSeloAgenda(atual);
    alertaSlot.replaceChildren(...(alerta ? [alerta] : []));
    redesSlot.replaceChildren(buildRedes(arquivo, atual.redeIds, (redeIds) => salvar({ redeIds })));
    tagsSlot.replaceChildren(buildTags(arquivo, atual.tagIds, (tagIds) => salvar({ tagIds }), avisar));
    publicacoesSlot.replaceChildren(buildPublicacoes(arquivo, atual.redeIds, atual.publicacoes, (publicacoes) => salvar({ publicacoes })));
    materiaisSlot.replaceChildren(buildMateriais(atual, (input) => salvar(input)));
    const origem = buildOrigem(atual);
    origemSlot.replaceChildren(...(origem ? [origem] : []));
    historicoSlot.replaceChildren(buildHistorico(atual.historico));
    casca.rodape.replaceChildren(
      ...buildRodapePostagem(atual, {
        nome: 'vídeo',
        etapas: VIDEO_STATUS,
        restaurar: () => videosState.restaurarVideo(atual.id),
        arquivar: (motivo) => videosState.arquivarVideo({ videoId: atual.id, motivo }),
        excluir: () => videosState.excluirVideo(atual.id),
        aoErro: avisar,
      }),
    );
  };
  redesenharSecoes(file, video);

  document.querySelector(`.vd-card[data-id="${id}"]`)?.classList.add('is-aberto');
}
