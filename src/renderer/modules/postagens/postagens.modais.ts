import {
  PRIORIDADES,
  REDES_CONHECIDAS,
  isLogoRede,
  type EtapaPostagem,
  type Prioridade,
  type RedeSocial,
  type TagPostagem,
} from '../../../shared/types/postagens.types.js';
import type { PreferenciasVideos, VideosFile } from '../../../shared/types/videos.types.js';
import { descreverOrigem } from '../../../shared/types/videos.conversao.js';
import { buildSecaoModal, openConfirmModal, openCustomModal } from '../../ui/modal.js';
import { campo, erroInline, grade2, input, interruptor, pilulas } from '../../ui/campos.js';
import { buildBotao, buildSegmentado } from '../../ui/pagina.js';
import { buildLogoRede } from './postagens.logos.js';
import * as videosState from './videos/videos.state.js';
import * as imagensState from './imagens/imagens.state.js';
import {
  ICONES_POSTAGEM,
  buildPrioridade,
  buildRedeBadge,
  buildScore,
  buildTagChip,
  tituloExibido,
} from './postagens.ui.js';

/**
 * Modais de configuração e criação de Postagens, de qualquer tipo. Todos
 * seguem a mesma estrutura (cabeçalho com ícone, seções em cartão, ações no
 * rodapé fixo). Tags, redes e exibição moram em videos.json e valem para todos.
 */

export const PALETA = ['#a78bfa', '#818cf8', '#38bdf8', '#2dd4bf', '#34d399', '#a3e635', '#fbbf24', '#fb923c', '#fb7185', '#f472b6', '#e1306c', '#9498a3'];

/** Postagens de todos os tipos, para contar usos de tag e rede. */
function todasAsPostagens(): Array<{ tagIds: string[]; redeIds: string[] }> {
  return [...(videosState.getCurrentState()?.videos ?? []), ...(imagensState.getCurrentState()?.imagens ?? [])];
}

function usos(n: number): string {
  return n === 1 ? '1 postagem' : `${n} postagens`;
}

/** Grupo de chips alternáveis (tags ou redes). */
export function alternaveis<T extends { id: string }>(itens: T[], selecionados: Set<string>, desenhar: (item: T, ativo: boolean) => HTMLElement): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = 'vd-escolhas';
  const redesenhar = (): void => {
    grupo.innerHTML = '';
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
        redesenhar();
      });
      grupo.appendChild(btn);
    });
  };
  redesenhar();
  return grupo;
}

// ---------- Nova postagem (qualquer tipo) ----------

/** Dados comuns que o modal de criação coleta; o tipo junta os seus em `extras`. */
export interface DadosNovaPostagem {
  titulo: string;
  status: string;
  prioridade?: Prioridade;
  dataAgendada?: string;
  horaAgendada?: string;
  tagIds: string[];
  redeIds: string[];
}

export interface NovaPostagemConfig {
  titulo: string;
  botao: string;
  icone: string;
  placeholder: string;
  etapas: readonly EtapaPostagem[];
  status?: string;
  dataAgendada?: string;
  horaAgendada?: string;
  /** Seção própria do tipo (ex.: formato da imagem), logo depois do título. */
  secaoExtra?: HTMLElement;
  /** Cria e devolve o id da postagem nova (ou null se não der para saber). */
  criar: (dados: DadosNovaPostagem) => Promise<string | null>;
  /** "Criar e abrir": recebe o id criado. */
  aoAbrir?: (id: string) => void;
}

/**
 * Criação de postagem, igual para todos os tipos: título, etapa e prioridade,
 * agenda, redes e tags. O tipo só acrescenta a seção dele.
 */
export function abrirNovaPostagem(config: NovaPostagemConfig): void {
  const file = videosState.getCurrentState();
  if (!file) return;
  let status = config.status ?? (config.dataAgendada ? 'agendado' : 'ideia');
  let prioridade: Prioridade | '' = '';
  const tags = new Set<string>();
  const redes = new Set<string>();

  void openCustomModal(
    config.titulo,
    ({ corpo, rodape, fechar }) => {
      const titulo = input('text', '', config.placeholder);
      titulo.classList.add('is-grande');
      corpo.appendChild(campo('Título', titulo));
      if (config.secaoExtra) corpo.appendChild(config.secaoExtra);

      const etapa = buildSecaoModal('Etapa e prioridade');
      etapa.conteudo.appendChild(
        campo(
          'Etapa',
          pilulas(
            config.etapas.filter((s) => s.id !== 'arquivado').map((s) => ({ id: s.id, rotulo: s.rotulo, classe: `is-fase-${s.fase}` })),
            () => status,
            (v) => (status = v),
          ),
        ),
      );
      etapa.conteudo.appendChild(
        campo(
          'Prioridade',
          pilulas<Prioridade | ''>(
            [{ id: '', rotulo: 'Nenhuma' }, ...PRIORIDADES.map((p) => ({ id: p.id, rotulo: p.rotulo, classe: `is-prio-${p.id}` }))],
            () => prioridade,
            (v) => (prioridade = v),
          ),
        ),
      );
      corpo.appendChild(etapa.secao);

      const agenda = buildSecaoModal('Agendamento', 'Opcional. Com data, a postagem aparece no calendário.');
      const data = input('date', config.dataAgendada ?? '');
      const hora = input('time', config.horaAgendada ?? '');
      agenda.conteudo.appendChild(grade2(campo('Data', data), campo('Horário', hora)));
      corpo.appendChild(agenda.secao);

      const marcacoes = buildSecaoModal('Redes e tags');
      marcacoes.conteudo.appendChild(alternaveis(file.redes, redes, (r, ativo) => buildRedeBadge(r, { comNome: true, ativo })));
      marcacoes.conteudo.appendChild(alternaveis(file.tags, tags, (t, ativo) => buildTagChip(t, { ativo })));
      corpo.appendChild(marcacoes.secao);

      const criar = async (abrir: boolean): Promise<void> => {
        if (!titulo.value.trim()) {
          titulo.focus();
          erroInline(corpo, 'Dê um título à postagem.');
          return;
        }
        try {
          const id = await config.criar({
            titulo: titulo.value,
            status,
            prioridade: prioridade || undefined,
            dataAgendada: data.value || undefined,
            horaAgendada: hora.value || undefined,
            tagIds: [...tags],
            redeIds: [...redes],
          });
          fechar();
          if (abrir && id) config.aoAbrir?.(id);
        } catch (erro) {
          erroInline(corpo, erro);
        }
      };

      const dica = document.createElement('span');
      dica.className = 'md-rodape-info';
      dica.textContent = 'Enter cria · Esc cancela';
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const criarAbrir = buildBotao('Criar e abrir', { variante: 'secundario' });
      criarAbrir.addEventListener('click', () => void criar(true));
      const criarBtn = buildBotao(config.botao, { icone: ICONES_POSTAGEM.mais, variante: 'primario' });
      criarBtn.addEventListener('click', () => void criar(false));
      rodape.append(dica, cancelar, criarAbrir, criarBtn);

      titulo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') void criar(false);
      });
      titulo.focus();
    },
    {
      largura: 560,
      icone: config.icone,
      subtitulo: config.dataAgendada ? 'Já com a data escolhida no calendário.' : 'Só o título é obrigatório; o resto dá para ajustar depois no painel.',
    },
  );
}

// ---------- Tags e redes ----------

/** Seletor de cor em bolinhas; abre ao clicar na amostra. */
function buildSeletorCor(atual: string, aoEscolher: (cor: string) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'md-cor';
  const amostra = document.createElement('button');
  amostra.type = 'button';
  amostra.className = 'md-cor-amostra';
  amostra.style.setProperty('--cor', atual);
  amostra.title = 'Mudar cor';
  amostra.setAttribute('aria-label', 'Mudar cor');
  const paleta = document.createElement('div');
  paleta.className = 'md-cor-paleta';
  paleta.hidden = true;
  PALETA.forEach((cor) => {
    const opcao = document.createElement('button');
    opcao.type = 'button';
    opcao.className = 'md-cor-opcao';
    opcao.classList.toggle('is-ativa', cor.toLowerCase() === atual.toLowerCase());
    opcao.style.setProperty('--cor', cor);
    opcao.setAttribute('aria-label', cor);
    opcao.addEventListener('click', () => {
      paleta.hidden = true;
      amostra.style.setProperty('--cor', cor);
      aoEscolher(cor);
    });
    paleta.appendChild(opcao);
  });
  amostra.addEventListener('click', () => {
    document.querySelectorAll<HTMLElement>('.md-cor-paleta').forEach((p) => {
      if (p !== paleta) p.hidden = true;
    });
    paleta.hidden = !paleta.hidden;
  });
  wrap.append(amostra, paleta);
  return wrap;
}

function linhaTag(tag: TagPostagem, redesenhar: () => void, erro: (e: unknown) => void): HTMLElement {
  const linha = document.createElement('div');
  linha.className = 'md-item';
  const qtd = todasAsPostagens().filter((v) => v.tagIds.includes(tag.id)).length;
  let cor = tag.cor;

  const nome = input('text', tag.nome);
  nome.setAttribute('aria-label', 'Nome da tag');
  const previa = document.createElement('div');
  previa.className = 'md-item-previa';
  const desenharPrevia = (): void => previa.replaceChildren(buildTagChip({ ...tag, nome: nome.value || tag.nome, cor }));
  desenharPrevia();
  const salvar = (): void => void videosState.salvarTag({ id: tag.id, nome: nome.value, cor }).then(redesenhar).catch(erro);
  nome.addEventListener('input', desenharPrevia);
  nome.addEventListener('change', salvar);

  const contagem = document.createElement('span');
  contagem.className = 'md-item-uso';
  contagem.textContent = usos(qtd);

  const excluir = buildBotao('', { icone: ICONES_POSTAGEM.lixeira, variante: 'fantasma', titulo: 'Excluir tag' });
  excluir.classList.add('is-perigo');
  excluir.addEventListener('click', () => {
    void openConfirmModal({
      title: 'Excluir tag',
      message: qtd ? `"${tag.nome}" está em ${usos(qtd)} e será removida delas.` : `Excluir "${tag.nome}"?`,
    }).then((ok) => {
      if (ok) void videosState.excluirTag(tag.id).then(redesenhar).catch(erro);
    });
  });

  linha.append(
    buildSeletorCor(tag.cor, (c) => {
      cor = c;
      desenharPrevia();
      salvar();
    }),
    nome,
    previa,
    contagem,
    excluir,
  );
  return linha;
}

function linhaRede(rede: RedeSocial, redesenhar: () => void, erro: (e: unknown) => void): HTMLElement {
  const linha = document.createElement('div');
  linha.className = 'md-item is-rede';
  const qtd = todasAsPostagens().filter((v) => v.redeIds.includes(rede.id)).length;
  let cor = rede.cor;

  const nome = input('text', rede.nome);
  nome.setAttribute('aria-label', 'Nome da rede');
  const sigla = input('text', rede.sigla);
  sigla.maxLength = 3;
  sigla.className = 'md-input md-item-sigla';
  sigla.setAttribute('aria-label', 'Sigla');
  const logo = document.createElement('select');
  logo.className = 'md-input md-item-logo';
  logo.setAttribute('aria-label', 'Logo');
  [{ id: '', nome: 'Sem logo (sigla)' }, ...REDES_CONHECIDAS].forEach((r) => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.id ? `Logo: ${r.nome}` : r.nome;
    logo.appendChild(opt);
  });
  logo.value = rede.logo ?? '';
  const previa = document.createElement('div');
  previa.className = 'md-item-previa';
  const desenharPrevia = (): void =>
    previa.replaceChildren(
      buildLogoRede(
        {
          nome: nome.value || rede.nome,
          sigla: (sigla.value || rede.sigla).toUpperCase(),
          cor,
          logo: isLogoRede(logo.value) ? logo.value : undefined,
        },
        26,
      ),
    );
  desenharPrevia();
  const salvar = (): void =>
    void videosState
      .salvarRede({ id: rede.id, nome: nome.value, sigla: sigla.value, cor, logo: isLogoRede(logo.value) ? logo.value : '' })
      .then(redesenhar)
      .catch(erro);
  [nome, sigla].forEach((el) => {
    el.addEventListener('input', desenharPrevia);
    el.addEventListener('change', salvar);
  });
  logo.addEventListener('change', () => {
    desenharPrevia();
    salvar();
  });

  const contagem = document.createElement('span');
  contagem.className = 'md-item-uso';
  contagem.textContent = usos(qtd);

  const excluir = buildBotao('', { icone: ICONES_POSTAGEM.lixeira, variante: 'fantasma', titulo: 'Excluir rede' });
  excluir.classList.add('is-perigo');
  excluir.addEventListener('click', () => {
    void openConfirmModal({ title: 'Excluir rede', message: `Excluir "${rede.nome}"? Ela sai de ${usos(qtd)}, com os links publicados.` }).then((ok) => {
      if (ok) void videosState.excluirRede(rede.id).then(redesenhar).catch(erro);
    });
  });

  linha.append(
    buildSeletorCor(rede.cor, (c) => {
      cor = c;
      desenharPrevia();
      salvar();
    }),
    previa,
    nome,
    sigla,
    logo,
    contagem,
    excluir,
  );
  return linha;
}

/** Botões das redes com logo que ainda não foram cadastradas: um clique e pronto. */
function buildGaleriaRedes(file: VideosFile, redesenhar: () => void, erro: (e: unknown) => void): HTMLElement | null {
  const faltando = REDES_CONHECIDAS.filter((r) => !file.redes.some((x) => x.logo === r.id));
  if (!faltando.length) return null;
  const galeria = document.createElement('div');
  galeria.className = 'md-galeria-redes';
  const rotulo = document.createElement('span');
  rotulo.className = 'md-rotulo';
  rotulo.textContent = 'Adicionar rede conhecida';
  const grade = document.createElement('div');
  grade.className = 'md-galeria-grade';
  faltando.forEach((r) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-galeria-item';
    btn.title = `Adicionar ${r.nome}`;
    btn.appendChild(buildLogoRede({ nome: r.nome, sigla: r.sigla, cor: r.cor, logo: r.id }, 22));
    btn.append(r.nome);
    btn.addEventListener('click', () => {
      btn.disabled = true;
      void videosState.salvarRede({ nome: r.nome, sigla: r.sigla, cor: r.cor, logo: r.id }).then(redesenhar).catch(erro);
    });
    grade.appendChild(btn);
  });
  galeria.append(rotulo, grade);
  return galeria;
}

function formNovo(placeholder: string, comSigla: boolean, aoCriar: (nome: string, cor: string, sigla: string) => Promise<void>): HTMLElement {
  const form = document.createElement('form');
  form.className = 'md-novo';
  let cor = PALETA[0]!;
  const nome = input('text', '', placeholder);
  const sigla = input('text', '', 'Sigla');
  sigla.maxLength = 3;
  sigla.className = 'md-input md-item-sigla';
  const adicionar = buildBotao('Adicionar', { icone: ICONES_POSTAGEM.mais, variante: 'secundario' });
  adicionar.type = 'submit';
  form.append(buildSeletorCor(cor, (c) => (cor = c)), nome);
  if (comSigla) form.appendChild(sigla);
  form.appendChild(adicionar);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!nome.value.trim()) {
      nome.focus();
      return;
    }
    void aoCriar(nome.value, cor, sigla.value);
  });
  return form;
}

export function abrirTagsERedes(abaInicial: 'tags' | 'redes' = 'tags'): void {
  let aba = abaInicial;
  void openCustomModal(
    'Tags e redes sociais',
    ({ corpo, rodape, fechar }) => {
      const erro = (e: unknown): void => erroInline(corpo, e);
      const desenhar = (): void => {
        const file = videosState.getCurrentState();
        if (!file) return;
        corpo.innerHTML = '';
        corpo.appendChild(
          buildSegmentado<'tags' | 'redes'>(
            [
              { value: 'tags', label: `Tags · ${file.tags.length}` },
              { value: 'redes', label: `Redes · ${file.redes.length}` },
            ],
            aba,
            (v) => {
              aba = v;
              desenhar();
            },
          ),
        );

        const { secao, conteudo } =
          aba === 'tags'
            ? buildSecaoModal('Tags', 'Categorias para achar o conteúdo rápido: série, formato, objetivo. Aparecem com nome e cor no card.')
            : buildSecaoModal('Redes sociais', 'Onde cada postagem será publicada. A sigla aparece no card e no calendário — mantenha curta.');
        const lista = document.createElement('div');
        lista.className = 'md-lista';
        if (aba === 'tags') file.tags.forEach((t) => lista.appendChild(linhaTag(t, desenhar, erro)));
        else file.redes.forEach((r) => lista.appendChild(linhaRede(r, desenhar, erro)));
        if (!lista.childElementCount) lista.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: 'Nada cadastrado ainda.' }));
        conteudo.appendChild(lista);
        if (aba === 'redes') {
          const galeria = buildGaleriaRedes(file, desenhar, erro);
          if (galeria) conteudo.appendChild(galeria);
        }
        conteudo.appendChild(
          aba === 'tags'
            ? formNovo('Nova tag (ex.: Série JS)', false, (nome, cor) => videosState.salvarTag({ nome, cor }).then(desenhar).catch(erro))
            : formNovo('Nova rede (ex.: LinkedIn)', true, (nome, cor, sigla) => videosState.salvarRede({ nome, cor, sigla }).then(desenhar).catch(erro)),
        );
        corpo.appendChild(secao);
      };
      desenhar();

      const info = document.createElement('span');
      info.className = 'md-rodape-info';
      info.textContent = 'Alterações salvas automaticamente';
      const pronto = buildBotao('Pronto', { variante: 'primario' });
      pronto.addEventListener('click', fechar);
      rodape.append(info, pronto);
    },
    { largura: 720, icone: ICONES_POSTAGEM.tag, subtitulo: 'Valem para todas as postagens: vídeos, imagens e os próximos tipos.' },
  );
}

// ---------- Exibição ----------

export function abrirExibicao(): void {
  const file = videosState.getCurrentState();
  if (!file) return;
  const prefs: PreferenciasVideos = JSON.parse(JSON.stringify(file.preferencias)) as PreferenciasVideos;

  // Nomes de campos extras usados em alguma postagem, do mais comum ao mais raro.
  const contagem = new Map<string, number>();
  const exemplos = [...file.videos, ...(imagensState.getCurrentState()?.imagens ?? [])];
  exemplos.forEach((v) => new Set(v.camposExtras.map((c) => c.nome)).forEach((n) => contagem.set(n, (contagem.get(n) ?? 0) + 1)));
  const nomesExtras = [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  if (prefs.tituloDoCard.tipo === 'extra' && !nomesExtras.includes(prefs.tituloDoCard.nome)) nomesExtras.unshift(prefs.tituloDoCard.nome);

  void openCustomModal(
    'Exibição dos cards',
    ({ corpo, rodape, fechar }) => {
      const previaSlot = document.createElement('div');
      previaSlot.className = 'md-previa-card';
      const exemplo = exemplos.find((v) => v.camposExtras.length) ?? exemplos[0];
      const desenharPrevia = (): void => {
        previaSlot.innerHTML = '';
        if (!exemplo) {
          previaSlot.textContent = 'Crie uma postagem para ver a prévia.';
          return;
        }
        const card = document.createElement('div');
        card.className = 'vd-card is-previa';
        const titulo = document.createElement('h3');
        titulo.className = 'vd-card-titulo';
        titulo.textContent = tituloExibido({ ...file, preferencias: prefs }, exemplo);
        const topo = document.createElement('div');
        topo.className = 'vd-card-topo';
        if (exemplo.prioridade) topo.appendChild(buildPrioridade(exemplo.prioridade));
        if (prefs.mostrarScore && exemplo.score !== undefined) topo.appendChild(buildScore(exemplo.score, true));
        const redesEl = document.createElement('span');
        redesEl.className = 'vd-card-redes';
        if (prefs.mostrarRedes) exemplo.redeIds.forEach((id) => {
          const r = file.redes.find((x) => x.id === id);
          if (r) redesEl.appendChild(buildRedeBadge(r));
        });
        topo.appendChild(redesEl);
        card.append(topo, titulo);
        if (prefs.mostrarTags && exemplo.tagIds.length) {
          const tags = document.createElement('div');
          tags.className = 'vd-card-tags';
          exemplo.tagIds.forEach((id) => {
            const t = file.tags.find((x) => x.id === id);
            if (t) tags.appendChild(buildTagChip(t, { compacto: true }));
          });
          card.appendChild(tags);
        }
        if (prefs.mostrarExtras) {
          const extras = exemplo.camposExtras.filter((c) => !(prefs.tituloDoCard.tipo === 'extra' && c.nome === prefs.tituloDoCard.nome)).slice(0, 2);
          if (extras.length) {
            const dl = document.createElement('dl');
            dl.className = 'vd-extras-resumo';
            extras.forEach((c) => dl.append(Object.assign(document.createElement('dt'), { textContent: c.nome }), Object.assign(document.createElement('dd'), { textContent: c.valor })));
            card.appendChild(dl);
          }
        }
        if (prefs.mostrarOrigem && 'origem' in exemplo && exemplo.origem) {
          const origem = document.createElement('div');
          origem.className = 'vd-card-fonte';
          origem.textContent = descreverOrigem(exemplo.origem);
          card.appendChild(origem);
        }
        previaSlot.appendChild(card);
      };

      const titulo = buildSecaoModal('Título do card', 'O que aparece em destaque nos cards e no calendário. Postagens sem o campo escolhido mostram o título normal.');
      const select = document.createElement('select');
      select.className = 'md-input';
      const opcaoTitulo = document.createElement('option');
      opcaoTitulo.value = '';
      opcaoTitulo.textContent = 'Título da postagem';
      select.appendChild(opcaoTitulo);
      nomesExtras.forEach((nome) => {
        const opt = document.createElement('option');
        opt.value = nome;
        opt.textContent = `Informação: ${nome}`;
        select.appendChild(opt);
      });
      select.value = prefs.tituloDoCard.tipo === 'extra' ? prefs.tituloDoCard.nome : '';
      select.addEventListener('change', () => {
        prefs.tituloDoCard = select.value ? { tipo: 'extra', nome: select.value } : { tipo: 'titulo' };
        desenharPrevia();
      });
      titulo.conteudo.appendChild(select);
      if (!nomesExtras.length) {
        const dica = document.createElement('p');
        dica.className = 'md-dica';
        dica.textContent = 'Quando as postagens tiverem informações extras (ex.: colunas do Sheets como "Tema"), elas aparecem aqui como opção.';
        titulo.conteudo.appendChild(dica);
      }

      const mostrar = buildSecaoModal('Mostrar no card');
      const alternar = (rotulo: string, detalhe: string, chave: 'mostrarTags' | 'mostrarRedes' | 'mostrarExtras' | 'mostrarOrigem' | 'mostrarScore'): HTMLElement =>
        interruptor(rotulo, detalhe, prefs[chave], (v) => {
          prefs[chave] = v;
          desenharPrevia();
        });
      mostrar.conteudo.append(
        alternar('Tags', 'Chips coloridos com o nome', 'mostrarTags'),
        alternar('Redes sociais', 'Siglas no canto do card', 'mostrarRedes'),
        alternar('Informações extras', 'As duas primeiras (ex.: Minuto, Gancho)', 'mostrarExtras'),
        alternar('Planilha de origem', 'Arquivo e aba dos vídeos importados do Sheets', 'mostrarOrigem'),
        alternar('Score', 'O número de 0 a 100 no canto do card', 'mostrarScore'),
      );

      const calendario = buildSecaoModal('Calendário');
      calendario.conteudo.appendChild(
        pilulas<'0' | '1'>(
          [
            { id: '0', rotulo: 'Semana começa no domingo' },
            { id: '1', rotulo: 'Semana começa na segunda' },
          ],
          () => String(prefs.inicioDaSemana) as '0' | '1',
          (v) => (prefs.inicioDaSemana = v === '1' ? 1 : 0),
        ),
      );

      const painel = buildSecaoModal('Painel de edição', 'Onde ele abre ao clicar num card. Também dá para trocar pelo cabeçalho do próprio painel.');
      painel.conteudo.appendChild(
        pilulas<PreferenciasVideos['posicaoPainel']>(
          [
            { id: 'centro', rotulo: 'Centralizado' },
            { id: 'esquerda', rotulo: 'À esquerda' },
            { id: 'direita', rotulo: 'À direita' },
          ],
          () => prefs.posicaoPainel,
          (v) => (prefs.posicaoPainel = v),
        ),
      );
      const linhasCal = buildSecaoModal('Linhas do calendário');
      linhasCal.conteudo.appendChild(
        pilulas<'video' | 'rede'>(
          [
            { id: 'video', rotulo: 'Uma por postagem' },
            { id: 'rede', rotulo: 'Uma por rede' },
          ],
          () => (prefs.calendarioPorRede ? 'rede' : 'video'),
          (v) => (prefs.calendarioPorRede = v === 'rede'),
        ),
      );

      const grade = document.createElement('div');
      grade.className = 'md-exibicao';
      const colunaEsq = document.createElement('div');
      colunaEsq.className = 'md-exibicao-opcoes';
      const rotuloLinhas = document.createElement('span');
      rotuloLinhas.className = 'md-rotulo';
      rotuloLinhas.textContent = 'Linhas';
      calendario.conteudo.append(rotuloLinhas, linhasCal.conteudo);
      colunaEsq.append(titulo.secao, mostrar.secao, calendario.secao, painel.secao);
      const colunaDir = document.createElement('div');
      colunaDir.className = 'md-exibicao-previa';
      const rotuloPrevia = document.createElement('span');
      rotuloPrevia.className = 'md-rotulo';
      rotuloPrevia.textContent = 'Prévia';
      colunaDir.append(rotuloPrevia, previaSlot);
      grade.append(colunaEsq, colunaDir);
      corpo.appendChild(grade);
      desenharPrevia();

      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const salvar = buildBotao('Salvar exibição', { variante: 'primario' });
      salvar.addEventListener('click', () => {
        void videosState
          .salvarPreferencias(prefs)
          .then(fechar)
          .catch((e) => erroInline(corpo, e));
      });
      rodape.append(cancelar, salvar);
    },
    { largura: 720, icone: ICONES_POSTAGEM.exibicao, subtitulo: 'Escolha o que cada card mostra na pipeline e no calendário, em todos os tipos.' },
  );
}
