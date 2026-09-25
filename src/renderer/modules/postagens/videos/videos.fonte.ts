import { VIDEO_STATUS, type Video, type VideoStatus, type VideosFile } from '../../../../shared/types/videos.types.js';
import { descreverOrigem } from '../../../../shared/types/videos.conversao.js';
import { buildBotao, svg, tempoRelativo } from '../../../ui/pagina.js';
import type { FiltroExtra, Fonte, Postagem } from '../postagens.fonte.js';
import { ICONES_POSTAGEM, formatarDataHora } from '../postagens.ui.js';
import { abrirImportacoes, abrirNovoVideo } from './videos.modais.js';
import { abrirPainel, painelAbertoPara } from './videos.painel.js';
import * as videosState from './videos.state.js';

/**
 * Vídeos como Fonte das telas de Postagens: o que só vídeo tem (origem na
 * planilha, histórico de importações, hashtags em campo próprio) entra aqui.
 */

/** 'fonte:<tabelaId>' filtra os vídeos vindos de uma planilha específica. */
type FiltroOrigem = 'todos' | 'importados' | 'manuais' | `fonte:${string}`;

let origem: FiltroOrigem = 'todos';
let importacaoId = '';

function comoVideo(item: Postagem): Video {
  return item as Video;
}

function buildSelectOrigem(file: VideosFile, redesenhar: () => void): HTMLSelectElement {
  // Uma opção por planilha de origem, montada a partir dos próprios vídeos:
  // continua listada mesmo que a tabela já tenha sido apagada do Sheets.
  const fontes = new Map<string, { label: string; qtd: number }>();
  file.videos.forEach((v) => {
    if (!v.origem) return;
    const atual = fontes.get(v.origem.tabelaId);
    fontes.set(v.origem.tabelaId, { label: descreverOrigem(v.origem), qtd: (atual?.qtd ?? 0) + 1 });
  });
  const opcoes = [
    { value: 'todos', label: 'Qualquer origem' },
    { value: 'importados', label: 'Importados do Sheets' },
    { value: 'manuais', label: 'Criados aqui' },
    ...[...fontes.entries()].map(([id, f]) => ({ value: `fonte:${id}`, label: `Planilha: ${f.label} (${f.qtd})` })),
  ];
  const select = document.createElement('select');
  select.className = 'vd-select';
  select.setAttribute('aria-label', 'Filtrar por origem');
  opcoes.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    select.appendChild(opt);
  });
  select.value = origem;
  select.classList.toggle('is-ativo', origem !== 'todos');
  select.addEventListener('change', () => {
    origem = select.value as FiltroOrigem;
    if (origem !== 'importados') importacaoId = '';
    redesenhar();
  });
  return select;
}

function filtroOrigem(file: VideosFile): FiltroExtra {
  return {
    controles: (redesenhar) => [buildSelectOrigem(file, redesenhar)],
    passa: (item) => {
      const v = comoVideo(item);
      if (origem === 'importados' && !v.origem) return false;
      if (origem === 'manuais' && v.origem) return false;
      if (origem.startsWith('fonte:') && v.origem?.tabelaId !== origem.slice(6)) return false;
      if (importacaoId && v.origem?.importacaoId !== importacaoId) return false;
      return true;
    },
    ativo: () => origem !== 'todos' || Boolean(importacaoId),
    limpar: () => {
      origem = 'todos';
      importacaoId = '';
    },
    aviso: () => {
      if (!importacaoId) return null;
      const imp = file.importacoes.find((i) => i.id === importacaoId);
      return `Mostrando a importação de ${imp ? formatarDataHora(imp.em) : '—'} (${imp?.tabelaNome ?? ''}).`;
    },
  };
}

export function montarFonteVideos(file: VideosFile): Fonte {
  const fonte: Fonte = {
    tipo: 'video',
    rotulo: 'Vídeos',
    singular: 'Vídeo',
    novoRotulo: 'Novo vídeo',
    icone: ICONES_POSTAGEM.video,
    etapas: VIDEO_STATUS,
    itens: file.videos,
    catalogo: file,
    textoBusca: (item) => {
      const v = comoVideo(item);
      // A planilha de origem entra na busca: digitar o nome dela acha os vídeos que vieram de lá.
      const origemTexto = v.origem ? [v.origem.arquivoNome, v.origem.abaNome, v.origem.tabelaNome] : [];
      return [v.descricao, ...v.hashtags.map((h) => `#${h}`), ...origemTexto.filter(Boolean)].join(' ');
    },
    criarRapido: (titulo, status) => videosState.criarVideo({ titulo, status: status as VideoStatus }),
    mover: (id, status, indice) => videosState.moverVideo({ videoId: id, status: status as VideoStatus, indice }),
    agendar: (id, data, hora) => videosState.atualizarVideo({ videoId: id, dataAgendada: data, horaAgendada: hora }),
    definirScore: (id, score) => videosState.atualizarVideo({ videoId: id, score }),
    abrir: (id) => {
      const atual = videosState.getCurrentState();
      if (atual) abrirPainel(atual, id);
    },
    painelAbertoPara,
    abrirNovo: (o) =>
      abrirNovoVideo({ status: o.status as VideoStatus | undefined, dataAgendada: o.dataAgendada, horaAgendada: o.horaAgendada, aoAbrir: (id) => fonte.abrir(id) }),
    decorarCard: (item, partes) => {
      const v = comoVideo(item);
      const prefs = file.preferencias;
      // Só o ícone quando a linha de origem está desligada em Exibição.
      if (v.origem && !prefs.mostrarOrigem) {
        const icone = document.createElement('span');
        icone.className = 'vd-card-origem';
        icone.title = `Importado de ${descreverOrigem(v.origem)}`;
        icone.innerHTML = svg(ICONES_POSTAGEM.planilha, 11, 2);
        partes.topo.appendChild(icone);
      }
      // De qual planilha o vídeo veio, sem precisar abrir o painel.
      if (prefs.mostrarOrigem && v.origem) {
        const linha = document.createElement('div');
        linha.className = 'vd-card-fonte';
        linha.title = `Importado de ${descreverOrigem(v.origem)}${v.origem.arquivoNome ? ` (tabela "${v.origem.tabelaNome}")` : ''}`;
        linha.textContent = descreverOrigem(v.origem);
        partes.aposTitulo.appendChild(linha);
      }
      if (v.hashtags.length) {
        const h = document.createElement('span');
        h.title = v.hashtags.map((x) => `#${x}`).join(' ');
        h.innerHTML = svg(ICONES_POSTAGEM.hashtag, 11, 2);
        h.append(String(v.hashtags.length));
        partes.metas.appendChild(h);
      }
    },
    dicaExtra: (item) => {
      const v = comoVideo(item);
      return v.origem ? `Planilha: ${descreverOrigem(v.origem)}` : null;
    },
    filtroExtra: filtroOrigem(file),
    subtitulo: () => {
      const ultima = file.importacoes[0];
      return ultima
        ? `Pipeline de conteúdo · última importação ${tempoRelativo(ultima.em)} de ${ultima.tabelaNome}`
        : 'Pipeline de conteúdo, da ideia à publicação';
    },
    acoesCabecalho: (tela) => {
      const importacoes = buildBotao('', { icone: ICONES_POSTAGEM.historico, variante: 'secundario', titulo: 'Histórico de importações do Sheets' });
      importacoes.addEventListener('click', () =>
        abrirImportacoes(file, (imp) => {
          origem = 'importados';
          importacaoId = imp.id;
          tela.irParaPipeline(true);
        }),
      );
      return [importacoes];
    },
    dicaVazio: 'Crie um vídeo aqui ou envie linhas de uma planilha pelo Sheets (Selecionar linhas → Enviar para Postagens).',
  };
  return fonte;
}
