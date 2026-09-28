import type { ItemGaleria, SalvarNaBibliotecaResult, TarefaIa, VinculoPostagem } from '../../../shared/types/ia.types.js';
import { abrirPostagem } from '../../core/navegacao.js';
import { ICONE_IA, exigirIa } from '../../ui/ia.js';
import { erroInline, pilulas, textarea } from '../../ui/campos.js';
import { mensagemDeErro, openAvisoModal, openCustomModal } from '../../ui/modal.js';
import { ICONES, buildBotao, buildBusca } from '../../ui/pagina.js';
import * as imagensState from '../postagens/imagens/imagens.state.js';
import * as videosState from '../postagens/videos/videos.state.js';

/**
 * O que se faz com uma imagem gerada. Anexar a uma postagem passa pela
 * Biblioteca de propósito: a postagem só liga recursos (recursoIds), nunca
 * arquivos soltos — é o mesmo caminho de "Materiais".
 */

function unwrap<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

export async function salvarNaBiblioteca(itemId: string): Promise<SalvarNaBibliotecaResult> {
  return unwrap(await window.irisAPI.ia.salvarNaBiblioteca(itemId));
}

/** Salva na Biblioteca e acrescenta o recurso aos Materiais da postagem. */
export async function anexarAPostagem(itemId: string, alvo: VinculoPostagem): Promise<void> {
  const { recursoId } = await salvarNaBiblioteca(itemId);
  if (alvo.tipo === 'video') {
    const arquivo = videosState.getCurrentState() ?? (await videosState.load());
    const video = arquivo.videos.find((v) => v.id === alvo.id);
    if (!video) throw new Error('Essa postagem não existe mais.');
    if (!video.recursoIds.includes(recursoId)) await videosState.atualizarVideo({ videoId: video.id, recursoIds: [...video.recursoIds, recursoId] });
  } else {
    const arquivo = imagensState.getCurrentState() ?? (await imagensState.load());
    const imagem = arquivo.imagens.find((i) => i.id === alvo.id);
    if (!imagem) throw new Error('Essa postagem não existe mais.');
    if (!imagem.recursoIds.includes(recursoId)) await imagensState.atualizarImagem({ imagemId: imagem.id, recursoIds: [...imagem.recursoIds, recursoId] });
  }
  unwrap(await window.irisAPI.ia.vincularPostagem(itemId, alvo));
}

/** Escolher a postagem (vídeo ou imagem) que vai receber a imagem. */
export function escolherPostagem(): Promise<VinculoPostagem | null> {
  return new Promise((resolve) => {
    let escolhida: VinculoPostagem | null = null;
    void openCustomModal(
      'Anexar a uma postagem',
      ({ corpo, rodape, fechar }) => {
        let busca = '';
        const lista = document.createElement('div');
        lista.className = 'ia-seletor-lista';
        corpo.append(
          buildBusca('', 'Buscar postagem pelo título…', (v) => {
            busca = v;
            desenhar();
          }),
          lista,
        );
        let postagens: Array<VinculoPostagem & { detalhe: string }> = [];
        const desenhar = (): void => {
          const termo = busca.trim().toLocaleLowerCase('pt-BR');
          const visiveis = postagens.filter((p) => !termo || p.titulo.toLocaleLowerCase('pt-BR').includes(termo)).slice(0, 80);
          lista.replaceChildren(
            ...visiveis.map((p) => {
              const b = document.createElement('button');
              b.type = 'button';
              b.className = 'ia-seletor-linha is-botao';
              b.append(Object.assign(document.createElement('strong'), { textContent: p.titulo }), Object.assign(document.createElement('small'), { textContent: p.detalhe }));
              b.addEventListener('click', () => {
                escolhida = { tipo: p.tipo, id: p.id, titulo: p.titulo };
                fechar();
              });
              return b;
            }),
          );
          if (!visiveis.length) lista.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: 'Nenhuma postagem encontrada.' }));
        };
        void Promise.all([videosState.getCurrentState() ?? videosState.load(), imagensState.getCurrentState() ?? imagensState.load()]).then(([v, i]) => {
          postagens = [
            ...v.videos.filter((x) => x.status !== 'arquivado').map((x) => ({ tipo: 'video' as const, id: x.id, titulo: x.titulo, detalhe: `Vídeo · ${x.status}` })),
            ...i.imagens.filter((x) => x.status !== 'arquivado').map((x) => ({ tipo: 'imagem' as const, id: x.id, titulo: x.titulo, detalhe: `Imagem · ${x.status}` })),
          ];
          desenhar();
        });
        const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
        cancelar.addEventListener('click', fechar);
        rodape.appendChild(cancelar);
      },
      { largura: 520, icone: ICONES.pasta, subtitulo: 'A imagem vai para a Biblioteca e entra em Materiais', aoFechar: () => resolve(escolhida) },
    );
  });
}

/** Salvar na Biblioteca com aviso do resultado. */
export async function salvarComAviso(item: ItemGaleria): Promise<void> {
  try {
    const r = await salvarNaBiblioteca(item.id);
    await openAvisoModal('Salva na Biblioteca', `A imagem está em:\n${r.caminho}\n\nEla entrou como recurso na coleção Thumbnails.`);
  } catch (erro) {
    await openAvisoModal('Não deu para salvar', mensagemDeErro(erro), { erro: true });
  }
}

/** Escolhe a postagem, anexa e oferece abrir. */
export async function anexarComEscolha(item: ItemGaleria): Promise<void> {
  const alvo = await escolherPostagem();
  if (!alvo) return;
  try {
    await anexarAPostagem(item.id, alvo);
    const abrir = await new Promise<boolean>((resolve) => {
      let sim = false;
      void openCustomModal(
        'Anexada',
        ({ corpo, rodape, fechar }) => {
          corpo.appendChild(Object.assign(document.createElement('p'), { className: 'md-mensagem', textContent: `A imagem entrou nos Materiais de "${alvo.titulo}".` }));
          const ficar = buildBotao('Ficar aqui', { variante: 'fantasma' });
          ficar.addEventListener('click', fechar);
          const ir = buildBotao('Abrir a postagem', { variante: 'primario' });
          ir.addEventListener('click', () => {
            sim = true;
            fechar();
          });
          rodape.append(ficar, ir);
        },
        { largura: 420, icone: ICONE_IA, classe: 'modal-confirmacao', aoFechar: () => resolve(sim) },
      );
    });
    if (abrir) abrirPostagem({ tipo: alvo.tipo, id: alvo.id });
  } catch (erro) {
    await openAvisoModal('Não deu para anexar', mensagemDeErro(erro), { erro: true });
  }
}

/** Visualização grande de um item da galeria. */
export function abrirVisualizacao(item: ItemGaleria, acoes: HTMLElement[]): void {
  void openCustomModal(
    'Imagem gerada',
    ({ corpo, rodape, fechar }) => {
      const moldura = document.createElement('div');
      moldura.className = 'ia-visualizacao';
      moldura.appendChild(Object.assign(document.createElement('p'), { className: 'md-dica', textContent: 'Carregando…' }));
      corpo.appendChild(moldura);
      void window.irisAPI.ia.abrirImagem(item.id).then((r) => {
        if (!r.ok) {
          moldura.replaceChildren(Object.assign(document.createElement('p'), { className: 'md-erro', textContent: r.error }));
          return;
        }
        const img = document.createElement('img');
        img.src = r.data;
        img.alt = item.prompt.slice(0, 120);
        moldura.replaceChildren(img);
      });
      const prompt = document.createElement('p');
      prompt.className = 'ia-visualizacao-prompt';
      prompt.textContent = item.prompt;
      corpo.appendChild(prompt);
      acoes.forEach((a) => a.addEventListener('click', () => fechar()));
      rodape.append(...acoes);
    },
    { largura: 980, icone: ICONE_IA, subtitulo: `${item.largura}×${item.altura} · ${item.modelo}` },
  );
}

const PEDIDOS_RAPIDOS = [
  'Trocar o fundo por algo mais limpo',
  'Deixar o texto maior e mais legível',
  'Mais contraste e cores mais vivas',
  'Expressão do rosto mais surpresa',
  'Enquadramento mais fechado no assunto',
  'Tirar o texto da imagem',
];

/**
 * Modificar uma imagem já gerada: ela vai como referência e o pedido diz o
 * que mudar — o resto deve ficar igual. O resultado é uma imagem nova na
 * galeria (a original continua lá). `aoIniciar` deixa quem abriu acompanhar
 * (o modal de thumbnail mostra o resultado ali mesmo).
 */
export async function abrirModificacao(item: ItemGaleria & { miniatura?: string }, aoIniciar?: (tarefa: TarefaIa) => void): Promise<void> {
  if (!(await exigirIa('imagemComReferencia'))) return;
  void openCustomModal(
    'Modificar imagem',
    ({ corpo, rodape, fechar }) => {
      let quantidade = '1';
      const grade = document.createElement('div');
      grade.className = 'ia-modificar';
      const previa = document.createElement('div');
      previa.className = 'ia-modificar-previa';
      if (item.miniatura) {
        const img = document.createElement('img');
        img.src = item.miniatura;
        img.alt = item.prompt.slice(0, 120);
        previa.appendChild(img);
      }
      const lado = document.createElement('div');
      lado.className = 'ia-modificar-lado';
      const pedido = textarea('', 'O que mudar? Ex.: troque o fundo por uma cidade à noite e deixe o título em amarelo', 4);
      const rapidos = document.createElement('div');
      rapidos.className = 'md-pilulas';
      PEDIDOS_RAPIDOS.forEach((t) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'md-pilula';
        b.textContent = t;
        b.addEventListener('click', () => {
          pedido.value = pedido.value.trim() ? `${pedido.value.trim()}. ${t}` : t;
          pedido.focus();
        });
        rapidos.appendChild(b);
      });
      lado.append(
        Object.assign(document.createElement('strong'), { className: 'ia-modificar-titulo', textContent: 'O que mudar' }),
        pedido,
        rapidos,
        Object.assign(document.createElement('span'), { className: 'md-dica', textContent: 'Versões' }),
        pilulas<string>(['1', '2', '3', '4'].map((n) => ({ id: n, rotulo: n })), () => quantidade, (v) => (quantidade = v)),
        Object.assign(document.createElement('p'), { className: 'md-dica', textContent: 'A original continua na galeria; cada versão sai como imagem nova, no mesmo formato.' }),
      );
      grade.append(previa, lado);
      corpo.appendChild(grade);

      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const modificar = buildBotao('Modificar', { variante: 'primario', icone: ICONE_IA });
      modificar.addEventListener('click', () => {
        if (!pedido.value.trim()) {
          erroInline(corpo, new Error('Diga o que deve mudar na imagem.'));
          pedido.focus();
          return;
        }
        modificar.disabled = true;
        void window.irisAPI.ia
          .gerarImagem({
            prompt:
              `Edite a imagem de referência: ${pedido.value.trim()}. ` +
              'Mantenha todo o resto igual — pessoas, rostos, composição, estilo e cores — mudando só o que foi pedido.',
            formato: item.formato,
            referencias: [{ origem: 'galeria', id: item.id }],
            quantidade: Number(quantidade),
            postagem: item.postagem,
          })
          .then((r) => {
            if (!r.ok) {
              modificar.disabled = false;
              erroInline(corpo, new Error(r.error));
              return;
            }
            aoIniciar?.(r.data);
            fechar();
          });
      });
      rodape.append(cancelar, modificar);
      pedido.focus();
    },
    { largura: 820, icone: ICONE_IA, subtitulo: 'A imagem vai como base; diga só o que muda' },
  );
}
