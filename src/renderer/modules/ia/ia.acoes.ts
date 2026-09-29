import {
  descritorDe,
  formatoIaDe,
  type ItemGaleria,
  type ItemGaleriaComMiniatura,
  type SalvarNaBibliotecaResult,
  type TarefaIa,
  type VinculoPostagem,
} from '../../../shared/types/ia.types.js';
import { abrirPostagem } from '../../core/navegacao.js';
import { ICONE_IA, exigirIa } from '../../ui/ia.js';
import { erroInline, pilulas, textarea } from '../../ui/campos.js';
import { mensagemDeErro, openAvisoModal, openCustomModal } from '../../ui/modal.js';
import { ICONES, buildBotao, buildBusca, buildSelo, svg } from '../../ui/pagina.js';
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

export interface AcoesDaVisualizacao {
  /** Modificar, ideias, variação, referência — o primeiro é o destaque. */
  criar: HTMLButtonElement[];
  /** Anexar, salvar, exportar. */
  usar: HTMLButtonElement[];
  excluir: HTMLButtonElement;
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Visualização grande de um item da galeria: a imagem à esquerda (com setas
 * para passar pelas outras), e à direita o prompt, os detalhes e as ações em
 * grupos. As ações são montadas por quem abre (o Estúdio), porque dependem
 * do criador e da galeria dele.
 */
export function abrirVisualizacao(
  itens: ItemGaleriaComMiniatura[],
  indiceInicial: number,
  montarAcoes: (item: ItemGaleriaComMiniatura, fechar: () => void, removido: () => void) => AcoesDaVisualizacao,
): void {
  let lista = [...itens];
  let indice = Math.max(0, Math.min(indiceInicial, lista.length - 1));

  void openCustomModal(
    'Imagem gerada',
    ({ modal, corpo, rodape, fechar }) => {
      modal.classList.add('ia-vis-modal');
      const cabecalhoSub = modal.querySelector<HTMLElement>('.modal-custom-textos p');
      const fecharBtn = buildBotao('Fechar', { variante: 'fantasma' });
      fecharBtn.addEventListener('click', fechar);
      rodape.appendChild(fecharBtn);

      const onTecla = (e: KeyboardEvent): void => {
        if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
        if (e.key === 'ArrowRight') ir(1);
        else if (e.key === 'ArrowLeft') ir(-1);
      };
      document.addEventListener('keydown', onTecla);
      const observador = new MutationObserver(() => {
        if (!modal.isConnected) {
          document.removeEventListener('keydown', onTecla);
          observador.disconnect();
        }
      });
      observador.observe(document.body, { childList: true, subtree: true });

      const ir = (passo: number): void => {
        if (lista.length < 2) return;
        indice = (indice + passo + lista.length) % lista.length;
        desenhar();
      };

      const desenhar = (): void => {
        const item = lista[indice];
        if (!item) {
          fechar();
          return;
        }
        if (cabecalhoSub) cabecalhoSub.textContent = lista.length > 1 ? `${indice + 1} de ${lista.length}` : formatoIaDe(item.formato).rotulo;
        const grade = document.createElement('div');
        grade.className = 'ia-vis';

        // ---- Palco ----
        const palco = document.createElement('div');
        palco.className = 'ia-vis-palco';
        const img = document.createElement('img');
        img.alt = item.prompt.slice(0, 160);
        // A miniatura aparece na hora; a imagem em tamanho real troca quando chega.
        if (item.miniatura) img.src = item.miniatura;
        palco.appendChild(img);
        void window.irisAPI.ia.abrirImagem(item.id).then((r) => {
          if (r.ok && lista[indice]?.id === item.id) img.src = r.data;
        });
        if (lista.length > 1) {
          const seta = (passo: number, rotulo: string, icone: string): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `ia-vis-seta ${passo < 0 ? 'is-esq' : 'is-dir'}`;
            b.title = rotulo;
            b.setAttribute('aria-label', rotulo);
            b.innerHTML = svg(icone, 20, 2.2);
            b.addEventListener('click', () => ir(passo));
            return b;
          };
          palco.append(seta(-1, 'Imagem anterior (←)', '<path d="m15 18-6-6 6-6"/>'), seta(1, 'Próxima imagem (→)', '<path d="m9 18 6-6-6-6"/>'));
        }

        // ---- Lado ----
        const lado = document.createElement('aside');
        lado.className = 'ia-vis-lado';

        const selos = document.createElement('div');
        selos.className = 'ia-vis-selos';
        selos.appendChild(buildSelo(`${formatoIaDe(item.formato).rotulo} · ${formatoIaDe(item.formato).proporcao}`, 'neutro'));
        if (item.biblioteca) selos.appendChild(buildSelo('Na Biblioteca', 'ok'));
        if (item.postagem) selos.appendChild(buildSelo(`Em "${item.postagem.titulo}"`, 'ok'));
        lado.appendChild(selos);

        const blocoPrompt = document.createElement('section');
        blocoPrompt.className = 'ia-vis-bloco';
        const cabPrompt = document.createElement('div');
        cabPrompt.className = 'ia-vis-bloco-cab';
        cabPrompt.appendChild(Object.assign(document.createElement('h4'), { textContent: 'Prompt' }));
        const copiar = buildBotao('Copiar', { variante: 'fantasma', icone: ICONES.copiar });
        copiar.addEventListener('click', () => {
          void navigator.clipboard.writeText(item.prompt).then(() => {
            copiar.querySelector('span')!.textContent = 'Copiado';
          });
        });
        cabPrompt.appendChild(copiar);
        blocoPrompt.append(cabPrompt, Object.assign(document.createElement('p'), { className: 'ia-vis-prompt', textContent: item.prompt }));
        lado.appendChild(blocoPrompt);

        const detalhes = document.createElement('dl');
        detalhes.className = 'ia-vis-detalhes';
        const linhas: Array<[string, string]> = [
          ['Tamanho', `${item.largura} × ${item.altura}`],
          ['Modelo', item.modelo],
          ['Provedor', descritorDe(item.provedor).rotulo],
          ['Criada', formatarData(item.criadoEm)],
        ];
        if (item.referencias.length) linhas.push(['Referências', item.referencias.join(', ')]);
        if (item.biblioteca) linhas.push(['Arquivo', item.biblioteca.caminho]);
        linhas.forEach(([k, v]) => {
          detalhes.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v, title: v }));
        });
        lado.appendChild(detalhes);

        const removido = (): void => {
          lista = lista.filter((x) => x.id !== item.id);
          indice = Math.min(indice, lista.length - 1);
          if (!lista.length) fechar();
          else desenhar();
        };
        const acoes = montarAcoes(item, fechar, removido);
        const grupo = (titulo: string, botoes: HTMLButtonElement[], classe: string): HTMLElement => {
          const g = document.createElement('section');
          g.className = `ia-vis-grupo ${classe}`;
          g.appendChild(Object.assign(document.createElement('h4'), { textContent: titulo }));
          const wrap = document.createElement('div');
          wrap.className = 'ia-vis-botoes';
          wrap.append(...botoes);
          g.appendChild(wrap);
          return g;
        };
        lado.append(grupo('Continuar criando', acoes.criar, 'is-criar'), grupo('Usar esta imagem', acoes.usar, 'is-usar'));
        // No rodapé, sempre à vista — dentro da coluna ele ficava escondido abaixo da rolagem.
        const espaco = Object.assign(document.createElement('span'), { className: 'pg-espaco' });
        rodape.replaceChildren(acoes.excluir, espaco, fecharBtn);

        grade.append(palco, lado);
        corpo.replaceChildren(grade);
      };
      desenhar();
    },
    { largura: 1180, icone: ICONE_IA, subtitulo: ' ' },
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
            prompt: pedido.value.trim(),
            modo: 'modificar',
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
