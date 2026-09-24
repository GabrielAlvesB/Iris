import type { SheetRow, SheetTable } from '../../../shared/types/sheets.types';
import {
  CAMPOS_VIDEO,
  VIDEO_STATUS,
  type CampoVideo,
  type MapeamentoColunas,
  type VideoStatus,
  type VideosFile,
} from '../../../shared/types/videos.types.js';
import {
  acharRede,
  descreverOrigem,
  dividirLista,
  extrairHashtags,
  normalizar,
  parseData,
  parseHora,
  parseScore,
  resolverStatus,
  sugerirMapeamento,
} from '../../../shared/types/videos.conversao.js';
import { abrirPostagem } from '../../core/navegacao.js';
import { buildSecaoModal, openConfirmModal, openCustomModal } from '../../ui/modal.js';
import { buildAviso, buildBotao } from '../../ui/pagina.js';
import * as videosState from '../postagens/videos/videos.state.js';
import { buildRedeBadge, buildTagChip, formatarDataCurta, rotuloStatus } from '../postagens/postagens.ui.js';

/**
 * Envio de linhas do Sheets para Postagens › Vídeos. A tela só escolhe o
 * mapeamento e mostra a prévia; quem copia os dados é o main, lendo a linha
 * direto do sheets.json.
 */

const PREVIA_MAX = 3;

interface Previa {
  titulo: string;
  status: VideoStatus;
  data?: string;
  hora?: string;
  hashtags: number;
  score?: number;
  scoreInvalido?: string;
  tagsConhecidas: string[];
  tagsNovas: string[];
  redes: string[];
  redesDesconhecidas: string[];
  extras: Array<{ nome: string; valor: string }>;
}

function converter(
  file: VideosFile,
  linha: SheetRow,
  mapeamento: MapeamentoColunas,
  statusInicial: VideoStatus,
  colunasExtras: Array<{ id: string; label: string }>,
): Previa {
  const valor = (campo: CampoVideo): string => {
    const coluna = mapeamento[campo];
    return coluna ? (linha.cells[coluna] ?? '').trim() : '';
  };
  const tags = dividirLista(valor('tags'));
  const redesEscritas = dividirLista(valor('redes'));
  // Mesma regra do main: nome, sigla ou apelido conhecido ("Insta", "Reels").
  const redeDoNome = (nome: string): string | undefined => acharRede(file.redes, nome)?.id;

  return {
    titulo: valor('titulo'),
    status: resolverStatus(valor('status')) ?? statusInicial,
    data: parseData(valor('data')),
    hora: parseHora(valor('hora')),
    hashtags: extrairHashtags(valor('hashtags')).length,
    score: parseScore(valor('score')),
    scoreInvalido: valor('score') && parseScore(valor('score')) === undefined ? valor('score') : undefined,
    tagsConhecidas: tags.filter((t) => file.tags.some((x) => normalizar(x.nome) === normalizar(t))),
    tagsNovas: tags.filter((t) => !file.tags.some((x) => normalizar(x.nome) === normalizar(t))),
    redes: redesEscritas.map(redeDoNome).filter((id): id is string => Boolean(id)),
    redesDesconhecidas: redesEscritas.filter((n) => !redeDoNome(n)),
    extras: colunasExtras
      .map((c) => ({ nome: c.label, valor: (linha.cells[c.id] ?? '').trim() }))
      .filter((c) => c.valor !== ''),
  };
}

function buildPreviaCard(file: VideosFile, previa: Previa, tagsExtras: Set<string>, redesExtras: Set<string>): HTMLElement {
  const card = document.createElement('div');
  card.className = 'sv-previa-card';
  if (!previa.titulo) card.classList.add('is-invalida');

  const topo = document.createElement('div');
  topo.className = 'sv-previa-topo';
  const etapa = document.createElement('span');
  etapa.className = 'sv-previa-etapa';
  etapa.textContent = rotuloStatus(previa.status);
  topo.appendChild(etapa);
  if (previa.data) {
    const quando = document.createElement('span');
    quando.className = 'sv-previa-data';
    quando.textContent = `${formatarDataCurta(previa.data)}${previa.hora ? ` · ${previa.hora}` : ''}`;
    topo.appendChild(quando);
  }
  const redes = document.createElement('span');
  redes.className = 'vd-card-redes';
  new Set([...previa.redes, ...redesExtras]).forEach((id) => {
    const rede = file.redes.find((r) => r.id === id);
    if (rede) redes.appendChild(buildRedeBadge(rede));
  });
  topo.appendChild(redes);
  card.appendChild(topo);

  const titulo = document.createElement('strong');
  titulo.textContent = previa.titulo || 'Sem título — esta linha será pulada';
  card.appendChild(titulo);

  const tags = document.createElement('div');
  tags.className = 'vd-card-tags';
  const ids = new Set([
    ...previa.tagsConhecidas.map((n) => file.tags.find((t) => normalizar(t.nome) === normalizar(n))?.id ?? ''),
    ...tagsExtras,
  ]);
  ids.forEach((id) => {
    const tag = file.tags.find((t) => t.id === id);
    if (tag) tags.appendChild(buildTagChip(tag, { compacto: true }));
  });
  previa.tagsNovas.forEach((nome) => {
    const chip = document.createElement('span');
    chip.className = 'vd-tag is-compacto is-nova';
    chip.textContent = `${nome} (nova)`;
    tags.appendChild(chip);
  });
  if (tags.childElementCount) card.appendChild(tags);

  if (previa.extras.length) {
    const extras = document.createElement('dl');
    extras.className = 'vd-extras-resumo';
    previa.extras.forEach((e) => {
      const dt = document.createElement('dt');
      dt.textContent = e.nome;
      const dd = document.createElement('dd');
      dd.textContent = e.valor;
      extras.append(dt, dd);
    });
    card.appendChild(extras);
  }

  const notas: string[] = [];
  if (previa.score !== undefined) notas.push(`score ${previa.score.toLocaleString('pt-BR')}`);
  if (previa.scoreInvalido) notas.push(`score "${previa.scoreInvalido}" não reconhecido (use 0 a 100)`);
  if (previa.hashtags) notas.push(`${previa.hashtags} hashtag(s)`);
  if (previa.redesDesconhecidas.length) notas.push(`rede não reconhecida: ${previa.redesDesconhecidas.join(', ')}`);
  if (notas.length) {
    const p = document.createElement('p');
    p.className = 'sv-previa-notas';
    p.textContent = notas.join(' · ');
    card.appendChild(p);
  }
  return card;
}

function buildEscolhas<T extends { id: string }>(
  itens: T[],
  selecionados: Set<string>,
  desenhar: (item: T, ativo: boolean) => HTMLElement,
  aoMudar: () => void,
): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = 'vd-escolhas';
  itens.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vd-escolha';
    const ativo = selecionados.has(item.id);
    btn.setAttribute('aria-pressed', String(ativo));
    btn.appendChild(desenhar(item, ativo));
    btn.addEventListener('click', () => {
      if (selecionados.has(item.id)) selecionados.delete(item.id);
      else selecionados.add(item.id);
      aoMudar();
    });
    grupo.appendChild(btn);
  });
  return grupo;
}

/**
 * Abre o mapeamento e envia. Devolve true se algo foi criado, para a tela do
 * Sheets atualizar os selos "na pipeline".
 */
export async function enviarParaVideos(tabela: SheetTable, linhaIds: string[], jaNaPipeline: Set<string>): Promise<boolean> {
  const file = videosState.getCurrentState() ?? (await videosState.load());
  const linhas = tabela.rows.filter((r) => linhaIds.includes(r.id));
  const repetidas = linhas.filter((r) => jaNaPipeline.has(r.id)).length;

  const salvo = file.mapeamentos.find((m) => m.tabelaId === tabela.id)?.campos;
  const colunasExistem = (m: MapeamentoColunas): boolean =>
    Object.values(m).every((id) => !id || tabela.columns.some((c) => c.id === id));
  // O mapeamento lembrado vale, mas campo que ele não cobre (ex.: Score, criado
  // depois do último envio) recebe o palpite pelo nome da coluna, se ela estiver livre.
  const sugestao = sugerirMapeamento(tabela.columns);
  const mapeamento: MapeamentoColunas = salvo && colunasExistem(salvo) ? { ...salvo } : { ...sugestao };
  if (salvo && colunasExistem(salvo)) {
    const usadas = new Set(Object.values(mapeamento));
    (Object.entries(sugestao) as Array<[keyof MapeamentoColunas, string]>).forEach(([campo, coluna]) => {
      if (!mapeamento[campo] && !usadas.has(coluna)) {
        mapeamento[campo] = coluna;
        usadas.add(coluna);
      }
    });
  }
  const extrasDesmarcados = new Set(
    salvo ? (file.mapeamentos.find((m) => m.tabelaId === tabela.id)?.extrasIgnorados ?? []) : [],
  );
  // Coluna já usada num campo nativo não vira extra: evita o título aparecer duas vezes.
  const colunasExtras = (): SheetTable['columns'] => {
    const mapeadas = new Set(Object.values(mapeamento));
    return tabela.columns.filter((c) => !mapeadas.has(c.id) && !extrasDesmarcados.has(c.id));
  };
  let statusInicial: VideoStatus = 'ideia';
  let duplicar = false;
  const tagsExtras = new Set<string>();
  const redesExtras = new Set<string>();
  let criou = false;

  const unica = linhas.length === 1 && mapeamento.titulo ? (linhas[0]!.cells[mapeamento.titulo] ?? '').trim() : '';
  const fonte = descreverOrigem({ arquivoNome: tabela.sourceFileName, abaNome: tabela.sourceSheetName, tabelaNome: tabela.name });

  await openCustomModal(
    'Enviar para Postagens › Vídeos',
    ({ corpo, rodape, fechar }) => {
      const desenhar = (): void => {
        // Cada escolha redesenha o modal; a rolagem fica onde o usuário estava.
        const rolagem = corpo.scrollTop;
        corpo.innerHTML = '';
        rodape.innerHTML = '';

        // De onde vêm os dados — o mesmo texto fica gravado em cada vídeo criado.
        const origem = document.createElement('div');
        origem.className = 'sv-origem';
        origem.innerHTML =
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 3v18"/></svg>';
        const origemTextos = document.createElement('div');
        const origemTitulo = document.createElement('strong');
        origemTitulo.textContent = tabela.sourceFileName ?? `Tabela "${tabela.name}"`;
        const origemDetalhe = document.createElement('span');
        origemDetalhe.textContent = tabela.sourceFileName
          ? [tabela.sourceSheetName ? `aba ${tabela.sourceSheetName}` : '', `tabela "${tabela.name}" no Iris`].filter(Boolean).join(' · ')
          : 'criada no Iris, sem arquivo de origem';
        origemTextos.append(origemTitulo, origemDetalhe);
        const origemSelo = document.createElement('span');
        origemSelo.className = 'sv-origem-selo';
        origemSelo.textContent = 'fica registrado em cada vídeo';
        origem.append(origemTextos, origemSelo);
        corpo.appendChild(origem);

        if (repetidas > 0) {
          const alternar = document.createElement('label');
          alternar.className = 'sv-duplicar';
          const check = document.createElement('input');
          check.type = 'checkbox';
          check.checked = duplicar;
          check.addEventListener('change', () => {
            duplicar = check.checked;
            desenhar();
          });
          alternar.append(check, ' Enviar de novo (cria cópias)');
          corpo.appendChild(
            buildAviso(
              duplicar
                ? `${repetidas} linha(s) já estão na pipeline e serão duplicadas.`
                : `${repetidas} linha(s) já estão na pipeline e serão puladas.`,
              'atencao',
              alternar,
            ),
          );
        }

        // 1. Mapeamento
        const lembrete = salvo ? Object.assign(document.createElement('span'), { className: 'sv-lembrete', textContent: 'lembrado do último envio' }) : undefined;
        const mapa = buildSecaoModal('1 · Colunas da planilha → campos do vídeo', 'À direita, o valor da primeira linha para conferir.', lembrete);
        const grade = document.createElement('div');
        grade.className = 'sv-mapa';
        const amostra = linhas[0];
        CAMPOS_VIDEO.forEach((campo) => {
          const rotulo = document.createElement('label');
          rotulo.className = 'sv-mapa-campo';
          const nomeCampo = document.createElement('span');
          nomeCampo.textContent = campo.rotulo;
          if (campo.id === 'titulo') nomeCampo.appendChild(Object.assign(document.createElement('em'), { textContent: ' obrigatório' }));
          rotulo.appendChild(nomeCampo);

          const select = document.createElement('select');
          select.className = 'md-input';
          select.classList.toggle('is-vazio', !mapeamento[campo.id]);
          const nenhum = document.createElement('option');
          nenhum.value = '';
          nenhum.textContent = campo.id === 'titulo' ? 'Escolha a coluna…' : '— não usar —';
          select.appendChild(nenhum);
          tabela.columns.forEach((coluna) => {
            const opt = document.createElement('option');
            opt.value = coluna.id;
            opt.textContent = coluna.label;
            select.appendChild(opt);
          });
          select.value = mapeamento[campo.id] ?? '';
          select.addEventListener('change', () => {
            if (select.value) mapeamento[campo.id] = select.value;
            else delete mapeamento[campo.id];
            desenhar();
          });
          rotulo.appendChild(select);

          const exemplo = document.createElement('span');
          exemplo.className = 'sv-mapa-exemplo';
          const colunaId = mapeamento[campo.id];
          const valor = colunaId && amostra ? (amostra.cells[colunaId] ?? '') : '';
          exemplo.textContent = valor ? valor.slice(0, 80) : colunaId ? '(vazio)' : '';
          exemplo.title = valor;

          grade.append(rotulo, exemplo);
        });
        mapa.conteudo.appendChild(grade);
        corpo.appendChild(mapa.secao);

        // 2. Colunas que não são campo nativo viram informações extras do vídeo.
        const livres = tabela.columns.filter((c) => !Object.values(mapeamento).includes(c.id));
        if (livres.length) {
          const outras = buildSecaoModal('2 · Outras colunas', 'Marcadas entram no vídeo como informações editáveis (ex.: Minuto, Gancho, CTA).');
          const lista = document.createElement('div');
          lista.className = 'sv-outras-lista';
          livres.forEach((coluna) => {
            const item = document.createElement('label');
            item.className = 'sv-outra';
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.checked = !extrasDesmarcados.has(coluna.id);
            check.addEventListener('change', () => {
              if (check.checked) extrasDesmarcados.delete(coluna.id);
              else extrasDesmarcados.add(coluna.id);
              desenhar();
            });
            const nome = document.createElement('span');
            nome.textContent = coluna.label;
            item.append(check, nome);
            lista.appendChild(item);
          });
          outras.conteudo.appendChild(lista);
          corpo.appendChild(outras.secao);
        }

        // 3. Etapa, tags e redes aplicadas a todos
        const marcacoes = buildSecaoModal(
          `${livres.length ? '3' : '2'} · Etapa, tags e redes`,
          mapeamento.status ? 'A etapa vale quando a coluna Status estiver vazia ou não for reconhecida.' : 'Aplicadas a todos os vídeos deste envio.',
        );
        const etapas = document.createElement('div');
        etapas.className = 'md-pilulas';
        VIDEO_STATUS.filter((s) => s.id !== 'arquivado').forEach((s) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `md-pilula is-fase-${s.fase}`;
          btn.classList.toggle('is-ativa', statusInicial === s.id);
          btn.textContent = s.rotulo;
          btn.addEventListener('click', () => {
            statusInicial = s.id;
            desenhar();
          });
          etapas.appendChild(btn);
        });
        const linha = (rotulo: string, conteudo: HTMLElement): HTMLElement => {
          const wrap = document.createElement('div');
          wrap.className = 'sv-linha';
          wrap.append(Object.assign(document.createElement('span'), { className: 'md-rotulo', textContent: rotulo }), conteudo);
          return wrap;
        };
        marcacoes.conteudo.append(
          linha('Etapa inicial', etapas),
          linha('Tags', buildEscolhas(file.tags, tagsExtras, (t, ativo) => buildTagChip(t, { ativo }), desenhar)),
          linha('Redes', buildEscolhas(file.redes, redesExtras, (r, ativo) => buildRedeBadge(r, { comNome: true, ativo }), desenhar)),
        );
        corpo.appendChild(marcacoes.secao);

        // Prévia
        const validas = linhas.filter((l) => duplicar || !jaNaPipeline.has(l.id));
        const previaSecao = buildSecaoModal(
          `Prévia${validas.length > PREVIA_MAX ? ` · ${PREVIA_MAX} de ${validas.length}` : ''}`,
          'Assim os vídeos vão aparecer na pipeline.',
        );
        const previa = document.createElement('div');
        previa.className = 'sv-previa';
        if (!mapeamento.titulo) {
          previa.appendChild(buildAviso('Escolha qual coluna vira o título para ver a prévia.', 'neutro'));
        } else {
          validas
            .slice(0, PREVIA_MAX)
            .forEach((l) =>
              previa.appendChild(
                buildPreviaCard(file, converter(file, l, mapeamento, statusInicial, colunasExtras()), tagsExtras, redesExtras),
              ),
            );
          if (validas.length === 0) previa.appendChild(buildAviso('Nenhuma linha nova para enviar.', 'neutro'));
        }
        previaSecao.conteudo.appendChild(previa);
        corpo.appendChild(previaSecao.secao);

        // Ações no rodapé fixo
        const semTitulo = mapeamento.titulo
          ? validas.filter((l) => !(l.cells[mapeamento.titulo!] ?? '').trim()).length
          : 0;
        const quantos = validas.length - semTitulo;
        const info = document.createElement('span');
        info.className = 'md-rodape-info';
        info.textContent = semTitulo ? `${semTitulo} linha(s) sem título serão puladas` : 'Os dados são copiados; a planilha pode mudar depois.';
        const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
        cancelar.addEventListener('click', fechar);
        const enviar = buildBotao(quantos === 1 ? 'Enviar 1 vídeo' : `Enviar ${quantos} vídeos`, {
          icone: '<rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3"/>',
          variante: 'primario',
        });
        enviar.disabled = !mapeamento.titulo || quantos === 0;
        enviar.addEventListener('click', () => {
          enviar.disabled = true;
          void videosState
            .importarDeSheets({
              tabelaId: tabela.id,
              linhaIds: linhas.map((l) => l.id),
              mapeamento,
              colunasExtras: colunasExtras().map((c) => c.id),
              statusInicial,
              tagIdsExtras: [...tagsExtras],
              redeIdsExtras: [...redesExtras],
              duplicar,
            })
            .then((resultado) => {
              criou = resultado.criados > 0;
              fechar();
              const pulados = resultado.pulados ? ` ${resultado.pulados} linha(s) pulada(s) — sem título ou já enviadas.` : '';
              return openConfirmModal({
                title: 'Enviado para Postagens',
                message: `${resultado.criados} vídeo(s) criado(s) na pipeline.${pulados}`,
                danger: false,
                confirmText: 'Abrir Postagens',
                cancelText: 'Continuar no Sheets',
              });
            })
            .then((abrir) => {
              if (abrir) abrirPostagem({ tipo: 'video' });
            })
            .catch((erro: unknown) => {
              enviar.disabled = false;
              corpo.prepend(buildAviso(erro instanceof Error ? erro.message : String(erro), 'erro'));
              corpo.scrollTop = 0;
            });
        });
        rodape.append(info, cancelar, enviar);
        corpo.scrollTop = rolagem;
      };
      desenhar();
    },
    {
      largura: 680,
      classe: 'sv-modal',
      icone: '<rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3"/>',
      subtitulo: `${unica ? `"${unica}"` : `${linhas.length} linha(s)`} de ${fonte}. Os dados viram uma cópia independente da planilha.`,
    },
  );

  return criou;
}
