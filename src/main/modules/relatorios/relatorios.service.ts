import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import * as videosService from '../videos/videos.service';
import { DATA_REGEX, HORA_REGEX, garantirSeq, limparExtras, listaDeStrings, naoNulo, nowIso, scoreValido, texto } from '../postagens/postagens.comum';
import { TIPOS_POSTAGEM, isTipoPostagem, type TipoPostagem } from '../../../shared/types/postagens.types';
import {
  CATEGORIAS_PADRAO,
  PARTES_METRICAS,
  isAreaImagem,
  isParteMetricas,
  isTomDestaque,
  isStatusMarcacao,
  isTipoMarcacao,
  type BlocoRelatorio,
  type CriarRelatorioInput,
  type FiltroMetricas,
  type LinhaMetrica,
  type PostagemMetrica,
  type ResultadoMetricas,
  type ItemRelatorio,
  type MarcacaoImagem,
  type MarcacaoVideo,
  type Relatorio,
  type RelatoriosFile,
  type SalvarCategoriasInput,
  type SecaoRelatorio,
  type SnapshotPostagem,
} from '../../../shared/types/relatorios.types';

const FILE_NAME = 'relatorios.json';
// v2: blocos livres nas seções (texto, destaque, tabela, métricas, quebra).
// v3: empresa por tags, objetivos/recomendações/observações finais, blocos
// análise (texto + métrica), duas colunas e citação.
const SCHEMA_VERSION = 3;
const MAX_COLUNAS = 8;
const MAX_LINHAS = 100;
const MAX_INDICADORES = 12;
const MAX_POSTAGENS_METRICAS = 500;
const MAX_CATEGORIAS = 30;

function categoriasPadrao(): Record<TipoPostagem, string[]> {
  return { video: [...CATEGORIAS_PADRAO.video], imagem: [...CATEGORIAS_PADRAO.imagem] };
}

function createDefaultFile(): RelatoriosFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), seqAtual: 0, relatorios: [], categorias: categoriasPadrao() };
}

// ---------- Migração defensiva ----------
// Também valida o relatório que a tela manda salvar: o documento inteiro passa
// por aqui, então não há dois caminhos de validação.

function data(valor: unknown): string | undefined {
  return typeof valor === 'string' && DATA_REGEX.test(valor) ? valor : undefined;
}

function id(valor: unknown): string {
  return typeof valor === 'string' && valor ? valor : randomUUID();
}

function numeroPositivo(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? valor : undefined;
}

function migrateSnapshot(raw: unknown): SnapshotPostagem {
  const c = (raw ?? {}) as Partial<SnapshotPostagem>;
  return {
    titulo: texto(c.titulo) || 'Postagem sem título',
    seq: typeof c.seq === 'number' ? c.seq : 0,
    etapa: texto(c.etapa),
    dataAgendada: data(c.dataAgendada),
    horaAgendada: typeof c.horaAgendada === 'string' && HORA_REGEX.test(c.horaAgendada) ? c.horaAgendada : undefined,
    redes: listaDeStrings(c.redes),
    tags: listaDeStrings(c.tags),
    prioridade: typeof c.prioridade === 'string' && c.prioridade ? c.prioridade : undefined,
    score: scoreValido(c.score),
    dados: limparExtras(c.dados),
    capturadoEm: texto(c.capturadoEm) || nowIso(),
  };
}

function migrateMarcacaoBase(raw: unknown): Omit<MarcacaoVideo, 'tempo' | 'tempoFim'> {
  const c = (raw ?? {}) as Partial<MarcacaoVideo>;
  return {
    id: id(c.id),
    tipo: isTipoMarcacao(c.tipo) ? c.tipo : 'ajuste',
    comentario: texto(c.comentario),
    observacao: texto(c.observacao),
    status: isStatusMarcacao(c.status) ? c.status : 'aberta',
    categoria: texto(c.categoria).trim(),
  };
}

function migrateMarcacaoVideo(raw: unknown): MarcacaoVideo {
  const c = (raw ?? {}) as Partial<MarcacaoVideo>;
  const tempo = numeroPositivo(c.tempo) ?? 0;
  const fim = numeroPositivo(c.tempoFim);
  return { ...migrateMarcacaoBase(raw), tempo, tempoFim: fim !== undefined && fim > tempo ? fim : undefined };
}

function migrateMarcacaoImagem(raw: unknown): MarcacaoImagem {
  const c = (raw ?? {}) as Partial<MarcacaoImagem>;
  const slide = typeof c.slide === 'number' && Number.isInteger(c.slide) && c.slide >= 1 ? c.slide : undefined;
  return { ...migrateMarcacaoBase(raw), slide, area: isAreaImagem(c.area) ? c.area : 'geral' };
}

function migrateItem(raw: unknown): ItemRelatorio | null {
  const c = (raw ?? {}) as Partial<ItemRelatorio>;
  if (!isTipoPostagem(c.tipo) || typeof c.postagemId !== 'string') return null;
  const base = {
    id: id(c.id),
    postagemId: c.postagemId,
    snapshot: migrateSnapshot(c.snapshot),
    anotacoes: texto(c.anotacoes),
    observacoes: texto(c.observacoes),
  };
  const marcacoes: unknown[] = Array.isArray(c.marcacoes) ? c.marcacoes : [];
  switch (c.tipo) {
    case 'video':
      return {
        ...base,
        tipo: 'video',
        // Em ordem de tempo: é assim que se lê a análise de um vídeo.
        marcacoes: marcacoes.map(migrateMarcacaoVideo).sort((a, b) => a.tempo - b.tempo),
      };
    case 'imagem':
      return { ...base, tipo: 'imagem', marcacoes: marcacoes.map(migrateMarcacaoImagem) };
  }
}

function numero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? valor : 0;
}

function migrateLinhaMetrica(raw: unknown): LinhaMetrica | null {
  const c = (raw ?? {}) as Partial<LinhaMetrica>;
  if (typeof c.rotulo !== 'string') return null;
  return { rotulo: c.rotulo, total: numero(c.total), comScore: numero(c.comScore), media: scoreValido(c.media) };
}

function linhasMetrica(raw: unknown): LinhaMetrica[] {
  return Array.isArray(raw) ? raw.map(migrateLinhaMetrica).filter(naoNulo) : [];
}

function extremo(raw: unknown): { titulo: string; score: number } | undefined {
  const c = (raw ?? {}) as { titulo?: unknown; score?: unknown };
  const score = scoreValido(c.score);
  return typeof c.titulo === 'string' && score !== undefined ? { titulo: c.titulo, score } : undefined;
}

function migratePostagemMetrica(raw: unknown): PostagemMetrica | null {
  const c = (raw ?? {}) as Partial<PostagemMetrica>;
  const dia = data(c.data);
  if (!isTipoPostagem(c.tipo) || !dia) return null;
  return {
    tipo: c.tipo,
    seq: numero(c.seq),
    titulo: texto(c.titulo) || 'Postagem sem título',
    data: dia,
    score: scoreValido(c.score),
    redes: listaDeStrings(c.redes),
  };
}

function migrateResultado(raw: unknown): ResultadoMetricas | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<ResultadoMetricas>;
  return {
    calculadoEm: texto(c.calculadoEm) || nowIso(),
    filtrosDescritos: listaDeStrings(c.filtrosDescritos),
    primeiraData: data(c.primeiraData),
    ultimaData: data(c.ultimaData),
    total: numero(c.total),
    comScore: numero(c.comScore),
    media: scoreValido(c.media),
    mediana: scoreValido(c.mediana),
    maior: extremo(c.maior),
    menor: extremo(c.menor),
    porTipo: linhasMetrica(c.porTipo),
    porMes: linhasMetrica(c.porMes),
    faixas: linhasMetrica(c.faixas),
    redes: linhasMetrica(c.redes),
    tags: linhasMetrica(c.tags),
    postagens: Array.isArray(c.postagens) ? c.postagens.map(migratePostagemMetrica).filter(naoNulo).slice(0, MAX_POSTAGENS_METRICAS) : [],
  };
}

function migrateFiltro(raw: unknown): FiltroMetricas {
  const c = (raw ?? {}) as Partial<FiltroMetricas>;
  const inicio = data(c.inicio);
  const fim = data(c.fim);
  return {
    tipos: listaDeStrings(c.tipos).filter(isTipoPostagem),
    inicio: inicio && fim && inicio > fim ? fim : inicio,
    fim: inicio && fim && inicio > fim ? inicio : fim,
    base: c.base === 'todos' ? 'todos' : 'publicados',
    redeIds: listaDeStrings(c.redeIds),
    tagIds: listaDeStrings(c.tagIds),
    prioridades: listaDeStrings(c.prioridades),
  };
}

function migrateBloco(raw: unknown): BlocoRelatorio | null {
  const c = (raw ?? {}) as Record<string, unknown>;
  const base = { id: id(c.id), titulo: texto(c.titulo) };
  switch (c.tipo) {
    case 'texto':
      return { ...base, tipo: 'texto', texto: texto(c.texto) };
    case 'destaque':
      return { ...base, tipo: 'destaque', tom: isTomDestaque(c.tom) ? c.tom : 'info', texto: texto(c.texto) };
    case 'tabela': {
      const colunas = listaDeStrings(c.colunas).slice(0, MAX_COLUNAS);
      const largura = Math.max(colunas.length, 1);
      // Toda linha com o mesmo número de células das colunas: tabela torta não imprime direito.
      const linhas = (Array.isArray(c.linhas) ? c.linhas : [])
        .slice(0, MAX_LINHAS)
        .map((l) => Array.from({ length: largura }, (_, i) => texto((Array.isArray(l) ? l : [])[i])));
      return { ...base, tipo: 'tabela', colunas: colunas.length ? colunas : [''], linhas };
    }
    case 'metricas': {
      const partes = listaDeStrings(c.partes).filter(isParteMetricas);
      return {
        ...base,
        tipo: 'metricas',
        filtro: migrateFiltro(c.filtro),
        // Sem a lista gravada (bloco antigo ou malformado), mostra tudo.
        partes: Array.isArray(c.partes) ? partes : PARTES_METRICAS.map((p) => p.id),
        resultado: migrateResultado(c.resultado),
        introducao: texto(c.introducao),
        comentario: texto(c.comentario),
      };
    }
    case 'analise': {
      const brutos: unknown[] = Array.isArray(c.indicadores) ? c.indicadores : [];
      return {
        ...base,
        tipo: 'analise',
        indicadores: brutos.slice(0, MAX_INDICADORES).map((raw) => {
          const i = (raw ?? {}) as Record<string, unknown>;
          return { id: id(i.id), rotulo: texto(i.rotulo), valor: texto(i.valor), variacao: texto(i.variacao), nota: texto(i.nota) };
        }),
        texto: texto(c.texto),
      };
    }
    case 'colunas':
      return {
        id: base.id,
        tipo: 'colunas',
        tituloEsquerda: texto(c.tituloEsquerda),
        textoEsquerda: texto(c.textoEsquerda),
        tituloDireita: texto(c.tituloDireita),
        textoDireita: texto(c.textoDireita),
      };
    case 'citacao':
      return { id: base.id, tipo: 'citacao', texto: texto(c.texto), fonte: texto(c.fonte) };
    case 'quebra':
      return { id: base.id, tipo: 'quebra' };
    default:
      return null;
  }
}

function migrateSecao(raw: unknown): SecaoRelatorio {
  const c = (raw ?? {}) as Partial<SecaoRelatorio>;
  return {
    id: id(c.id),
    titulo: texto(c.titulo).trim() || 'Seção',
    texto: texto(c.texto),
    blocos: Array.isArray(c.blocos) ? c.blocos.map(migrateBloco).filter(naoNulo) : [],
    itens: Array.isArray(c.itens) ? c.itens.map(migrateItem).filter(naoNulo) : [],
  };
}

function migrateRelatorio(raw: unknown): Relatorio | null {
  const c = (raw ?? {}) as Partial<Relatorio>;
  const titulo = texto(c.titulo).trim();
  if (!titulo) return null;
  const timestamp = texto(c.createdAt) || nowIso();
  const inicio = data(c.periodoInicio);
  const fim = data(c.periodoFim);
  return {
    id: id(c.id),
    seq: typeof c.seq === 'number' && c.seq > 0 ? c.seq : 0,
    titulo,
    tagIds: [...new Set(listaDeStrings(c.tagIds))],
    tagsNomes: listaDeStrings(c.tagsNomes),
    contexto: texto(c.contexto),
    objetivos: texto(c.objetivos),
    // Período invertido vira o certo em vez de ser descartado.
    periodoInicio: inicio && fim && inicio > fim ? fim : inicio,
    periodoFim: inicio && fim && inicio > fim ? inicio : fim,
    resumo: texto(c.resumo),
    secoes: Array.isArray(c.secoes) ? c.secoes.map(migrateSecao) : [],
    conclusao: texto(c.conclusao),
    recomendacoes: texto(c.recomendacoes),
    observacoesFinais: texto(c.observacoesFinais),
    incluirAssinatura: typeof c.incluirAssinatura === 'boolean' ? c.incluirAssinatura : true,
    mostrarIndicadores: typeof c.mostrarIndicadores === 'boolean' ? c.mostrarIndicadores : true,
    mostrarPostagensUtilizadas: typeof c.mostrarPostagensUtilizadas === 'boolean' ? c.mostrarPostagensUtilizadas : true,
    situacao: c.situacao === 'finalizado' ? 'finalizado' : 'rascunho',
    createdAt: timestamp,
    updatedAt: texto(c.updatedAt) || timestamp,
  };
}

function limparCategorias(raw: unknown): string[] {
  const vistos = new Set<string>();
  return listaDeStrings(raw)
    .map((c) => c.trim().slice(0, 40))
    .filter((c) => {
      const chave = c.toLocaleLowerCase('pt-BR');
      if (!c || vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .slice(0, MAX_CATEGORIAS);
}

function migrateFile(raw: unknown): RelatoriosFile {
  const c = (raw ?? {}) as Partial<RelatoriosFile>;
  const relatorios = Array.isArray(c.relatorios) ? c.relatorios.map(migrateRelatorio).filter(naoNulo) : [];
  const seqAtual = garantirSeq(relatorios, typeof c.seqAtual === 'number' ? c.seqAtual : 0);
  const categorias = categoriasPadrao();
  const brutas = (c.categorias ?? {}) as Partial<Record<TipoPostagem, unknown>>;
  TIPOS_POSTAGEM.forEach((t) => {
    if (Array.isArray(brutas[t.id])) categorias[t.id] = limparCategorias(brutas[t.id]);
  });
  return { schemaVersion: SCHEMA_VERSION, updatedAt: c.updatedAt ?? nowIso(), seqAtual, relatorios, categorias };
}

function loadFile(): RelatoriosFile {
  return readStore(FILE_NAME, createDefaultFile, migrateFile);
}

async function saveFile(file: RelatoriosFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

/**
 * Renova a cópia por extenso das tags da empresa a partir do catálogo. Tag que
 * sumiu do catálogo mantém o nome que tinha — mesma regra do snapshot das postagens.
 * Só roda ao criar/salvar: na leitura, a cópia gravada é a verdade do documento.
 */
function renovarNomesDasTags(relatorio: Relatorio, anterior?: Relatorio): Relatorio {
  const catalogo = videosService.getCatalogo();
  const nomesAntigos = new Map<string, string>();
  anterior?.tagIds.forEach((tagId, i) => {
    const nome = anterior.tagsNomes[i];
    if (nome) nomesAntigos.set(tagId, nome);
  });
  const pares = relatorio.tagIds
    .map((tagId) => ({ tagId, nome: catalogo.tags.find((t) => t.id === tagId)?.nome ?? nomesAntigos.get(tagId) }))
    .filter((p): p is { tagId: string; nome: string } => Boolean(p.nome));
  // As duas listas andam alinhadas por índice: tag sem nome conhecido sai das duas.
  return { ...relatorio, tagIds: pares.map((p) => p.tagId), tagsNomes: pares.map((p) => p.nome) };
}

// ---------- API do service ----------

export async function getFile(): Promise<RelatoriosFile> {
  return loadFile();
}

export async function getFullFile(): Promise<RelatoriosFile> {
  return loadFile();
}

export async function replaceFile(file: RelatoriosFile): Promise<RelatoriosFile> {
  const normalizado = migrateFile(file);
  await saveFile(normalizado);
  return normalizado;
}

export function getRelatorio(relatorioId: string): Relatorio {
  const relatorio = loadFile().relatorios.find((r) => r.id === relatorioId);
  if (!relatorio) throw new Error('Relatório não encontrado — ele pode ter sido excluído.');
  return relatorio;
}

export async function criarRelatorio(input: CriarRelatorioInput): Promise<RelatoriosFile> {
  const titulo = input.titulo.trim();
  if (!titulo) throw new Error('Dê um título ao relatório.');
  const file = loadFile();
  file.seqAtual += 1;
  const timestamp = nowIso();
  const novo = migrateRelatorio({
    id: randomUUID(),
    seq: file.seqAtual,
    titulo,
    tagIds: input.tagIds ?? [],
    contexto: input.contexto ?? '',
    periodoInicio: input.periodoInicio,
    periodoFim: input.periodoFim,
    resumo: '',
    // Começa com uma seção: quase todo relatório precisa de ao menos uma.
    secoes: [{ id: randomUUID(), titulo: 'Análise', texto: '', blocos: [], itens: [] }],
    conclusao: '',
    incluirAssinatura: true,
    situacao: 'rascunho',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (!novo) throw new Error('Não foi possível criar o relatório.');
  file.relatorios.unshift(renovarNomesDasTags(novo));
  await saveFile(file);
  return file;
}

/** Grava o relatório inteiro, validado pela mesma migração da leitura. */
export async function salvarRelatorio(raw: Relatorio): Promise<RelatoriosFile> {
  const file = loadFile();
  const indice = file.relatorios.findIndex((r) => r.id === raw?.id);
  if (indice < 0) throw new Error('Relatório não encontrado — ele pode ter sido excluído.');
  const atual = file.relatorios[indice]!;
  const validado = migrateRelatorio({ ...raw, id: atual.id, seq: atual.seq, createdAt: atual.createdAt, updatedAt: nowIso() });
  if (!validado) throw new Error('O relatório precisa de um título.');
  file.relatorios[indice] = renovarNomesDasTags(validado, atual);
  await saveFile(file);
  return file;
}

export async function duplicarRelatorio(relatorioId: string): Promise<RelatoriosFile> {
  const file = loadFile();
  const original = file.relatorios.find((r) => r.id === relatorioId);
  if (!original) throw new Error('Relatório não encontrado.');
  file.seqAtual += 1;
  const timestamp = nowIso();
  // Ids novos em tudo: seções, itens e marcações não podem colidir com os do original.
  const copia = migrateRelatorio({
    ...original,
    id: randomUUID(),
    seq: file.seqAtual,
    titulo: `${original.titulo} (cópia)`,
    situacao: 'rascunho',
    secoes: original.secoes.map((s) => ({
      ...s,
      id: randomUUID(),
      blocos: s.blocos.map((b) => ({ ...b, id: randomUUID() })),
      itens: s.itens.map((i) => ({ ...i, id: randomUUID(), marcacoes: i.marcacoes.map((m) => ({ ...m, id: randomUUID() })) })),
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (copia) file.relatorios.unshift(copia);
  await saveFile(file);
  return file;
}

export async function excluirRelatorio(relatorioId: string): Promise<RelatoriosFile> {
  const file = loadFile();
  file.relatorios = file.relatorios.filter((r) => r.id !== relatorioId);
  await saveFile(file);
  return file;
}

export async function salvarCategorias(input: SalvarCategoriasInput): Promise<RelatoriosFile> {
  if (!isTipoPostagem(input.tipo)) throw new Error('Tipo de postagem inválido.');
  const file = loadFile();
  file.categorias[input.tipo] = limparCategorias(input.categorias);
  await saveFile(file);
  return file;
}
