import {
  FORMATOS_IMAGEM,
  IMAGEM_STATUS,
  MAX_SLIDES,
  type AtualizarImagemInput,
  type FormatoImagem,
  type Imagem,
  type ImagensFile,
} from '../../../../shared/types/imagens.types.js';
import type { CampoExtra } from '../../../../shared/types/postagens.types.js';
import { abrirPainel as abrirCasca, type PainelHandle } from '../../../ui/painel.js';
import { buildMateriais } from '../postagens.materiais.js';
import type { Catalogo } from '../postagens.fonte.js';
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
  inputPainel,
  textareaPainel,
} from '../postagens.secoes.js';
import { ICONES_POSTAGEM, buildSeloAgenda } from '../postagens.ui.js';
import * as videosState from '../videos/videos.state.js';
import * as imagensState from './imagens.state.js';
import { buildMiniaturaFormato } from './imagens.ui.js';

/**
 * Painel de uma publicação de imagem. Mesma casca e seções comuns do vídeo;
 * no lugar de descrição/hashtags, os campos da arte: formato e peças, briefing,
 * texto na arte, e a legenda com CTA, link e texto alternativo.
 */

interface Rascunho {
  titulo: string;
  briefing: string;
  textoNaArte: string;
  legenda: string;
  textoAlternativo: string;
  cta: string;
  link: string;
  creditos: string;
  dataAgendada: string;
  horaAgendada: string;
  notas: string;
  camposExtras: CampoExtra[];
}

let handle: PainelHandle | null = null;
let imagemId: string | null = null;
let rascunho: Rascunho | null = null;
let redesenharSecoes: ((catalogo: Catalogo, imagem: Imagem) => void) | null = null;

const salvador = criarSalvador(async () => {
  if (!imagemId || !rascunho) return;
  const r = rascunho;
  await imagensState.atualizarImagem({
    imagemId,
    titulo: r.titulo.trim() || 'Sem título',
    briefing: r.briefing,
    textoNaArte: r.textoNaArte,
    legenda: r.legenda,
    textoAlternativo: r.textoAlternativo,
    cta: r.cta,
    link: r.link,
    creditos: r.creditos,
    dataAgendada: r.dataAgendada,
    horaAgendada: r.horaAgendada,
    notas: r.notas,
    camposExtras: r.camposExtras,
  });
}, () => handle);

export function painelAbertoPara(): string | null {
  return imagemId;
}

function avisar(erro: unknown): void {
  handle?.marcarErro(erro);
}

function salvar(input: Omit<AtualizarImagemInput, 'imagemId'>): void {
  if (!imagemId) return;
  void imagensState.atualizarImagem({ imagemId, ...input }).catch(avisar);
}

export function fecharPainel(): void {
  void salvador.descarregar();
  const aberto = handle;
  handle = null;
  imagemId = null;
  rascunho = null;
  redesenharSecoes = null;
  aberto?.fechar();
  document.querySelectorAll('.vd-card.is-aberto').forEach((el) => el.classList.remove('is-aberto'));
}

export function sincronizarPainel(file: ImagensFile, catalogo: Catalogo): void {
  if (!imagemId) return;
  const imagem = file.imagens.find((i) => i.id === imagemId);
  if (!imagem) {
    fecharPainel();
    return;
  }
  redesenharSecoes?.(catalogo, imagem);
}

/** Formato em pílulas com a miniatura da proporção; carrossel pede a quantidade de peças. */
function buildFormato(imagem: Imagem): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'im-formato';
  const grupo = document.createElement('div');
  grupo.className = 'md-pilulas';
  FORMATOS_IMAGEM.forEach((f) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-pilula im-formato-opcao';
    const ativo = imagem.formato === f.id;
    btn.classList.toggle('is-ativa', ativo);
    btn.setAttribute('aria-pressed', String(ativo));
    btn.append(buildMiniaturaFormato(f.id), f.rotulo);
    btn.addEventListener('click', () => {
      if (!ativo) salvar({ formato: f.id as FormatoImagem });
    });
    grupo.appendChild(btn);
  });
  wrap.appendChild(grupo);

  if (imagem.formato === 'carrossel') {
    const slides = document.createElement('input');
    slides.type = 'number';
    slides.min = '2';
    slides.max = String(MAX_SLIDES);
    slides.className = 'md-input im-slides';
    slides.placeholder = `2 a ${MAX_SLIDES}`;
    slides.value = imagem.quantidadeSlides ? String(imagem.quantidadeSlides) : '';
    slides.addEventListener('change', () => {
      const n = Number(slides.value);
      salvar({ quantidadeSlides: slides.value === '' ? null : Number.isInteger(n) ? n : null });
    });
    wrap.appendChild(buildCampo('Quantidade de peças', slides));
  }
  return wrap;
}

export function abrirPainel(file: ImagensFile, catalogo: Catalogo, id: string): void {
  const imagem = file.imagens.find((i) => i.id === id);
  if (!imagem) return;
  if (imagemId === id && handle) return;
  fecharPainel();

  imagemId = id;
  const r: Rascunho = {
    titulo: imagem.titulo,
    briefing: imagem.briefing,
    textoNaArte: imagem.textoNaArte,
    legenda: imagem.legenda,
    textoAlternativo: imagem.textoAlternativo,
    cta: imagem.cta,
    link: imagem.link,
    creditos: imagem.creditos,
    dataAgendada: imagem.dataAgendada ?? '',
    horaAgendada: imagem.horaAgendada ?? '',
    notas: imagem.notas,
    camposExtras: imagem.camposExtras.map((c) => ({ ...c })),
  };
  rascunho = r;

  const casca = abrirCasca({
    icone: ICONES_POSTAGEM.imagem,
    rotulo: 'Imagem',
    ariaLabel: 'Detalhes da publicação de imagem',
    posicao: catalogo.preferencias.posicaoPainel,
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

  const texto = (campo: keyof Rascunho) => (v: string): void => {
    (r[campo] as string) = v;
    salvador.agendar();
  };

  casca.corpo.insertBefore(buildTituloPainel(r.titulo, 'Nome da publicação', texto('titulo')), grade);

  // Produção
  const producao = buildSecaoPainel('Produção', ICONE_SECAO.producao);
  const etapasSlot = document.createElement('div');
  const prioridadeSlot = document.createElement('div');
  const scoreSlot = document.createElement('div');
  scoreSlot.appendChild(buildCampoScore(imagem.score, (score) => salvar({ score })));
  producao.conteudo.append(buildCampo('Etapa', etapasSlot), buildCampo('Prioridade', prioridadeSlot), buildCampo('Score', scoreSlot));
  grade.appendChild(producao.secao);

  // Formato e peças
  const formatoSecao = buildSecaoPainel('Formato', ICONES_POSTAGEM.imagem);
  const formatoSlot = document.createElement('div');
  formatoSecao.conteudo.appendChild(formatoSlot);
  grade.appendChild(formatoSecao.secao);

  // Arte: o que pedir e o que vai escrito nela
  const arte = buildSecaoPainel('Arte', ICONES_POSTAGEM.paleta);
  arte.conteudo.append(
    buildCampo('Briefing', textareaPainel(r.briefing, 'O que a arte precisa comunicar, referências, cores…', 4, texto('briefing'))),
    buildCampo('Texto na arte', textareaPainel(r.textoNaArte, 'Título e chamada que vão escritos na imagem', 3, texto('textoNaArte'))),
    buildCampo('Créditos', inputPainel('text', r.creditos, 'Designer, banco de imagens, fotógrafo', texto('creditos'))),
  );
  grade.appendChild(arte.secao);

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

  // Legenda (com as hashtags dentro), CTA, link e acessibilidade
  const contLegenda = buildContador(r.legenda);
  const copiar = buildBotaoCopiar('Copiar legenda', 'Legenda pronta para colar', () => r.legenda.trim());
  const legenda = buildSecaoPainel('Legenda', ICONE_SECAO.conteudo, copiar);
  const previa = buildPreviaHashtags(true);
  previa.desenhar(r.legenda);
  const legendaWrap = document.createElement('div');
  legendaWrap.append(
    textareaPainel(r.legenda, 'O texto da publicação. #hashtags escritas aqui são reconhecidas.', 5, (v) => {
      r.legenda = v;
      contLegenda.atualizar(v);
      previa.desenhar(v);
      salvador.agendar();
    }),
    previa.el,
  );
  legenda.conteudo.append(
    buildCampo('Legenda', legendaWrap, contLegenda.el),
    buildCampo('Chamada para ação (CTA)', inputPainel('text', r.cta, 'Ex.: Salve para ver depois · Link na bio', texto('cta'))),
    buildCampo('Link de destino', inputPainel('url', r.link, 'https://…', texto('link'))),
    buildCampo('Texto alternativo', textareaPainel(r.textoAlternativo, 'Descreva a imagem para quem usa leitor de tela', 2, texto('textoAlternativo'))),
  );
  grade.appendChild(legenda.secao);

  // Informações extras
  const informacoes = buildSecaoPainel('Informações', ICONE_SECAO.informacoes);
  informacoes.conteudo.appendChild(buildExtras(r.camposExtras, () => salvador.agendar()));
  grade.appendChild(informacoes.secao);

  const tagsSecao = buildSecaoPainel('Tags', ICONES_POSTAGEM.tag);
  const tagsSlot = document.createElement('div');
  tagsSecao.conteudo.appendChild(tagsSlot);
  grade.appendChild(tagsSecao.secao);

  // A arte em si, se quiser, fica ligada por Materiais (caminho da Biblioteca).
  const materiaisSlot = document.createElement('section');
  materiaisSlot.className = 'md-secao vd-p-secao';
  grade.appendChild(materiaisSlot);

  const notas = buildSecaoPainel('Notas', ICONE_SECAO.notas);
  notas.conteudo.appendChild(textareaPainel(r.notas, 'Ideias, referências, pendências…', 4, texto('notas')));
  grade.appendChild(notas.secao);

  const historico = buildSecaoPainel('Histórico', ICONES_POSTAGEM.historico);
  const historicoSlot = document.createElement('div');
  historico.conteudo.appendChild(historicoSlot);
  grade.appendChild(historico.secao);

  redesenharSecoes = (cat, atual) => {
    casca.estado.replaceChildren(buildSeloEtapa(atual, IMAGEM_STATUS));
    etapasSlot.replaceChildren(buildEtapas(IMAGEM_STATUS, atual.status, (status) => salvar({ status: status as Imagem['status'] })));
    prioridadeSlot.replaceChildren(buildPrioridadeEscolha(atual.prioridade, (prioridade) => salvar({ prioridade })));
    formatoSlot.replaceChildren(buildFormato(atual));
    const alerta = buildSeloAgenda(atual);
    alertaSlot.replaceChildren(...(alerta ? [alerta] : []));
    redesSlot.replaceChildren(buildRedes(cat, atual.redeIds, (redeIds) => salvar({ redeIds })));
    tagsSlot.replaceChildren(buildTags(cat, atual.tagIds, (tagIds) => salvar({ tagIds }), avisar));
    publicacoesSlot.replaceChildren(buildPublicacoes(cat, atual.redeIds, atual.publicacoes, (publicacoes) => salvar({ publicacoes })));
    materiaisSlot.replaceChildren(buildMateriais(atual, (input) => salvar(input)));
    historicoSlot.replaceChildren(buildHistorico(atual.historico));
    casca.rodape.replaceChildren(
      ...buildRodapePostagem(atual, {
        nome: 'publicação',
        etapas: IMAGEM_STATUS,
        restaurar: () => imagensState.restaurarImagem(atual.id),
        arquivar: (motivo) => imagensState.arquivarImagem({ imagemId: atual.id, motivo }),
        excluir: () => imagensState.excluirImagem(atual.id),
        aoErro: avisar,
      }),
    );
  };
  redesenharSecoes(catalogo, imagem);

  document.querySelector(`.vd-card[data-id="${id}"]`)?.classList.add('is-aberto');
}
