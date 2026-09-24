import { FORMATOS_IMAGEM, IMAGEM_STATUS, type FormatoImagem, type ImagemStatus } from '../../../../shared/types/imagens.types.js';
import { buildSecaoModal } from '../../../ui/modal.js';
import { abrirNovaPostagem } from '../postagens.modais.js';
import { ICONES_POSTAGEM } from '../postagens.ui.js';
import * as imagensState from './imagens.state.js';
import { buildMiniaturaFormato } from './imagens.ui.js';

export interface NovaImagemOpcoes {
  status?: ImagemStatus;
  dataAgendada?: string;
  horaAgendada?: string;
  aoAbrir?: (imagemId: string) => void;
}

/** O mesmo modal de criação dos vídeos, com a escolha do formato. */
export function abrirNovaImagem(opcoes: NovaImagemOpcoes = {}): void {
  let formato: FormatoImagem = 'quadrado';

  const secao = buildSecaoModal('Formato', 'A proporção da arte. Dá para trocar depois no painel.');
  const grupo = document.createElement('div');
  grupo.className = 'md-pilulas';
  const desenhar = (): void => {
    grupo.innerHTML = '';
    FORMATOS_IMAGEM.forEach((f) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'md-pilula im-formato-opcao';
      btn.classList.toggle('is-ativa', formato === f.id);
      btn.setAttribute('aria-pressed', String(formato === f.id));
      btn.append(buildMiniaturaFormato(f.id), f.rotulo);
      btn.addEventListener('click', () => {
        formato = f.id;
        desenhar();
      });
      grupo.appendChild(btn);
    });
  };
  desenhar();
  secao.conteudo.appendChild(grupo);

  abrirNovaPostagem({
    titulo: 'Nova imagem',
    botao: 'Criar publicação',
    icone: ICONES_POSTAGEM.imagem,
    placeholder: 'Ex.: Carrossel — 5 atalhos do VS Code',
    etapas: IMAGEM_STATUS,
    status: opcoes.status,
    dataAgendada: opcoes.dataAgendada,
    horaAgendada: opcoes.horaAgendada,
    secaoExtra: secao.secao,
    aoAbrir: opcoes.aoAbrir,
    criar: async (dados) => {
      const antes = new Set((imagensState.getCurrentState()?.imagens ?? []).map((i) => i.id));
      const novo = await imagensState.criarImagem({ ...dados, status: dados.status as ImagemStatus, formato });
      return novo.imagens.find((i) => !antes.has(i.id))?.id ?? null;
    },
  });
}
