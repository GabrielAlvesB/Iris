import type { ContextoTexto, FormatoImagemIa, ReferenciaIa, TarefaIa, VinculoPostagem } from '../../../shared/types/ia.types.js';
import { aguardarTarefaIa } from '../../core/ia.js';
import { buildBotaoIa, exigirIa, ICONE_IA } from '../../ui/ia.js';
import { mensagemDeErro, openCustomModal } from '../../ui/modal.js';
import { ICONES, buildBotao, buildSelo } from '../../ui/pagina.js';
import { abrirModificacao, anexarAPostagem } from './ia.acoes.js';
import { buildCriador } from './ia.criador.js';

/**
 * "Thumbnail com IA" na seção Materiais da postagem: abre o criador do
 * Estúdio já com o formato, as imagens da postagem como referência e o
 * contexto (título, descrição) para a IA escrever o prompt. A escolhida vai
 * para a Biblioteca e entra nos Materiais da própria postagem.
 */

export interface PostagemParaThumbnail {
  tipo: 'video' | 'imagem';
  id: string;
  titulo: string;
  formato: FormatoImagemIa;
  recursoIds: string[];
  contexto: () => ContextoTexto;
}

const IMAGEM = /\.(png|jpe?g|webp)$/i;

/** As imagens já anexadas à postagem viram referência (até 4). */
async function referenciasDaPostagem(recursoIds: string[]): Promise<ReferenciaIa[]> {
  if (!recursoIds.length) return [];
  const bib = await window.irisAPI.explorador.getBiblioteca();
  if (!bib.ok) return [];
  const ids = bib.data.recursos.filter((r) => recursoIds.includes(r.id) && r.situacao === 'ok' && IMAGEM.test(r.nome)).map((r) => r.id);
  const rs = await Promise.all(ids.slice(0, 4).map((id) => window.irisAPI.ia.descreverReferencia({ origem: 'biblioteca', id })));
  return rs.filter((r): r is { ok: true; data: ReferenciaIa } => r.ok).map((r) => r.data);
}

export function buildBotaoThumbnail(p: PostagemParaThumbnail): HTMLButtonElement {
  const botao = buildBotaoIa('Thumbnail com IA', 'Gerar uma imagem para esta postagem e anexar aqui');
  botao.addEventListener('click', () => void abrirThumbnail(p));
  return botao;
}

async function abrirThumbnail(p: PostagemParaThumbnail): Promise<void> {
  if (!(await exigirIa('imagem'))) return;
  const referencias = await referenciasDaPostagem(p.recursoIds).catch(() => [] as ReferenciaIa[]);
  const vinculo: VinculoPostagem = { tipo: p.tipo, id: p.id, titulo: p.titulo };

  void openCustomModal(
    'Thumbnail com IA',
    ({ corpo, rodape, fechar }) => {
      const grade = document.createElement('div');
      grade.className = 'ia-thumb';
      const resultados = document.createElement('section');
      resultados.className = 'ia-thumb-resultados';
      resultados.appendChild(Object.assign(document.createElement('h3'), { textContent: 'Resultados' }));
      const lista = document.createElement('div');
      lista.className = 'ia-thumb-resultados';
      lista.appendChild(
        Object.assign(document.createElement('p'), {
          className: 'md-dica',
          textContent: 'Dica: clique em "Criar prompt com IA" para a IA escrever o pedido a partir do título e da descrição. As imagens geradas ficam também na galeria do Estúdio.',
        }),
      );
      resultados.appendChild(lista);

      const acompanhar = (tarefa: TarefaIa): void => {
        const cartao = document.createElement('div');
        cartao.className = 'ia-tarefa';
        const topo = document.createElement('div');
        topo.className = 'ia-tarefa-topo';
        const spinner = Object.assign(document.createElement('span'), { className: 'ia-spinner' });
        topo.append(spinner, Object.assign(document.createElement('strong'), { textContent: `Gerando ${tarefa.quantidade === 1 ? '1 imagem' : `${tarefa.quantidade} imagens`}…` }));
        cartao.appendChild(topo);
        lista.prepend(cartao);

        void aguardarTarefaIa(tarefa.id).then(async (fim) => {
          if (fim.situacao !== 'pronto') {
            cartao.replaceChildren(
              fim.situacao === 'cancelado' ? buildSelo('Cancelada', 'neutro') : buildSelo('Não deu certo', 'erro'),
              ...(fim.erro ? [Object.assign(document.createElement('p'), { className: 'ia-tarefa-erro', textContent: fim.erro })] : []),
            );
            cartao.classList.add('is-erro');
            return;
          }
          const galeria = await window.irisAPI.ia.listarGaleria();
          const itens = galeria.ok ? galeria.data.filter((i) => fim.itemIds?.includes(i.id)) : [];
          const opcoes = itens.map((item) => {
            const opcao = document.createElement('div');
            opcao.className = 'ia-thumb-opcao';
            const img = document.createElement('img');
            img.src = item.miniatura;
            img.alt = item.prompt.slice(0, 120);
            const usar = buildBotao('Usar como thumbnail', { variante: 'primario', icone: ICONES.check });
            usar.addEventListener('click', () => {
              usar.disabled = true;
              anexarAPostagem(item.id, vinculo)
                .then(() => {
                  usar.replaceChildren(buildSelo('Anexada em Materiais', 'ok'));
                  setTimeout(fechar, 700);
                })
                .catch((erro: unknown) => {
                  usar.disabled = false;
                  opcao.appendChild(Object.assign(document.createElement('p'), { className: 'ia-tarefa-erro', textContent: mensagemDeErro(erro) }));
                });
            });
            const modificar = buildBotao('Modificar', { variante: 'secundario', icone: ICONE_IA });
            // A versão modificada aparece aqui mesmo, como mais uma opção.
            modificar.addEventListener('click', () => void abrirModificacao(item, acompanhar));
            const botoes = document.createElement('div');
            botoes.className = 'ia-thumb-botoes';
            botoes.append(modificar, usar);
            opcao.append(img, botoes);
            return opcao;
          });
          cartao.replaceWith(...opcoes);
        });
      };

      const criador = buildCriador({
        formato: p.formato,
        referencias,
        postagem: vinculo,
        contextoThumbnail: p.contexto,
        aoIniciar: acompanhar,
      });
      grade.append(criador.el, resultados);
      corpo.appendChild(grade);

      const fecharBtn = buildBotao('Fechar', { variante: 'fantasma' });
      fecharBtn.addEventListener('click', fechar);
      rodape.appendChild(fecharBtn);
    },
    { largura: 1120, icone: ICONE_IA, subtitulo: p.titulo },
  );
}
