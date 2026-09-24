import { IMAGEM_STATUS, type Imagem, type ImagemStatus, type ImagensFile } from '../../../../shared/types/imagens.types.js';
import { svg } from '../../../ui/pagina.js';
import type { Catalogo, Fonte, Postagem } from '../postagens.fonte.js';
import { ICONES_POSTAGEM } from '../postagens.ui.js';
import { abrirNovaImagem } from './imagens.modais.js';
import { abrirPainel, painelAbertoPara } from './imagens.painel.js';
import * as imagensState from './imagens.state.js';
import { buildSeloFormato, descreverFormato } from './imagens.ui.js';

/** Imagens como Fonte das telas de Postagens. Tags, redes e exibição vêm do catálogo comum. */

function comoImagem(item: Postagem): Imagem {
  return item as Imagem;
}

export function montarFonteImagens(file: ImagensFile, catalogo: Catalogo): Fonte {
  const fonte: Fonte = {
    tipo: 'imagem',
    rotulo: 'Imagens',
    singular: 'Imagem',
    novoRotulo: 'Nova imagem',
    icone: ICONES_POSTAGEM.imagem,
    etapas: IMAGEM_STATUS,
    itens: file.imagens,
    catalogo,
    textoBusca: (item) => {
      const i = comoImagem(item);
      return [i.legenda, i.briefing, i.textoNaArte, i.cta, i.creditos, descreverFormato(i)].join(' ');
    },
    criarRapido: (titulo, status) => imagensState.criarImagem({ titulo, status: status as ImagemStatus }),
    mover: (id, status, indice) => imagensState.moverImagem({ imagemId: id, status: status as ImagemStatus, indice }),
    agendar: (id, data, hora) => imagensState.atualizarImagem({ imagemId: id, dataAgendada: data, horaAgendada: hora }),
    definirScore: (id, score) => imagensState.atualizarImagem({ imagemId: id, score }),
    abrir: (id) => {
      const atual = imagensState.getCurrentState();
      if (atual) abrirPainel(atual, catalogo, id);
    },
    painelAbertoPara,
    abrirNovo: (o) =>
      abrirNovaImagem({ status: o.status as ImagemStatus | undefined, dataAgendada: o.dataAgendada, horaAgendada: o.horaAgendada, aoAbrir: (id) => fonte.abrir(id) }),
    decorarCard: (item, partes) => {
      const i = comoImagem(item);
      partes.aposTitulo.appendChild(buildSeloFormato(i));
      if (i.hashtags.length) {
        const h = document.createElement('span');
        h.title = i.hashtags.map((x) => `#${x}`).join(' ');
        h.innerHTML = svg(ICONES_POSTAGEM.hashtag, 11, 2);
        h.append(String(i.hashtags.length));
        partes.metas.appendChild(h);
      }
    },
    dicaExtra: (item) => `Formato: ${descreverFormato(comoImagem(item))}`,
    subtitulo: () => 'Publicações de imagem: posts, carrosséis e stories, da ideia à publicação',
    dicaVazio: 'Crie uma publicação de imagem: formato, briefing da arte, texto e legenda ficam no painel.',
  };
  return fonte;
}
