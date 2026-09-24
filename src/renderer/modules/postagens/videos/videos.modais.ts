import { VIDEO_STATUS, type ImportacaoRegistro, type VideoStatus, type VideosFile } from '../../../../shared/types/videos.types.js';
import { openCustomModal } from '../../../ui/modal.js';
import { buildBotao, buildSelo, buildVazio, svg } from '../../../ui/pagina.js';
import { abrirNovaPostagem } from '../postagens.modais.js';
import { ICONES_POSTAGEM, formatarDataHora } from '../postagens.ui.js';
import * as videosState from './videos.state.js';

/** Modais só de vídeo: criação e o histórico de importações do Sheets. */

export interface NovoVideoOpcoes {
  status?: VideoStatus;
  dataAgendada?: string;
  horaAgendada?: string;
  /** Chamado com o id criado quando o usuário escolhe "Criar e abrir". */
  aoAbrir?: (videoId: string) => void;
}

export function abrirNovoVideo(opcoes: NovoVideoOpcoes = {}): void {
  abrirNovaPostagem({
    titulo: 'Novo vídeo',
    botao: 'Criar vídeo',
    icone: ICONES_POSTAGEM.video,
    placeholder: 'Ex.: Closures em JavaScript em 60 segundos',
    etapas: VIDEO_STATUS,
    status: opcoes.status,
    dataAgendada: opcoes.dataAgendada,
    horaAgendada: opcoes.horaAgendada,
    aoAbrir: opcoes.aoAbrir,
    criar: async (dados) => {
      const antes = new Set((videosState.getCurrentState()?.videos ?? []).map((v) => v.id));
      const novo = await videosState.criarVideo({ ...dados, status: dados.status as VideoStatus });
      return novo.videos.find((v) => !antes.has(v.id))?.id ?? null;
    },
  });
}

// ---------- Histórico de importações ----------

export function abrirImportacoes(file: VideosFile, aoVer: (imp: ImportacaoRegistro) => void): void {
  void openCustomModal(
    'Histórico de importações',
    ({ corpo, rodape, fechar }) => {
      if (file.importacoes.length === 0) {
        corpo.appendChild(
          buildVazio(ICONES_POSTAGEM.planilha, 'Nada importado ainda', 'No Sheets, use o botão de vídeo de uma linha ou "Selecionar linhas → Enviar para Vídeos".'),
        );
      } else {
        const lista = document.createElement('ol');
        lista.className = 'md-linha-tempo';
        file.importacoes.forEach((imp) => {
          const item = document.createElement('li');
          const ponto = document.createElement('span');
          ponto.className = 'md-linha-tempo-ponto';
          ponto.innerHTML = svg(ICONES_POSTAGEM.planilha, 13, 2);
          const cartao = document.createElement('div');
          cartao.className = 'md-linha-tempo-cartao';
          const topo = document.createElement('div');
          topo.className = 'md-linha-tempo-topo';
          const titulo = document.createElement('strong');
          titulo.textContent = imp.tabelaNome;
          const quando = document.createElement('time');
          quando.textContent = formatarDataHora(imp.em);
          topo.append(titulo, quando);
          const fonte = document.createElement('span');
          fonte.className = 'md-linha-tempo-fonte';
          fonte.textContent = [imp.arquivoNome, imp.abaNome].filter(Boolean).join(' · ') || 'Tabela criada no Iris';
          const selos = document.createElement('div');
          selos.className = 'md-pilulas';
          const aindaExistem = imp.videoIds.filter((id) => file.videos.some((v) => v.id === id)).length;
          selos.appendChild(buildSelo(`${imp.quantidade} criado(s)`, 'ok'));
          if (imp.pulados) selos.appendChild(buildSelo(`${imp.pulados} pulado(s)`, 'atencao'));
          if (aindaExistem < imp.quantidade) selos.appendChild(buildSelo(`${aindaExistem} ainda na pipeline`, 'neutro'));
          const ver = buildBotao('Ver vídeos', { variante: 'fantasma' });
          ver.classList.add('is-mini');
          ver.addEventListener('click', () => {
            fechar();
            aoVer(imp);
          });
          selos.appendChild(ver);
          cartao.append(topo, fonte, selos);
          item.append(ponto, cartao);
          lista.appendChild(item);
        });
        corpo.appendChild(lista);
      }
      const ok = buildBotao('Fechar', { variante: 'secundario' });
      ok.addEventListener('click', fechar);
      rodape.appendChild(ok);
    },
    { largura: 580, icone: ICONES_POSTAGEM.historico, subtitulo: 'Cada envio do Sheets para a pipeline, do mais recente ao mais antigo.' },
  );
}
