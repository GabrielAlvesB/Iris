import { PRIORIDADES, TIPOS_POSTAGEM, type TipoPostagem } from '../../../shared/types/postagens.types.js';
import {
  PARTES_METRICAS,
  TONS_DESTAQUE,
  type BaseMetricas,
  type BlocoAnalise,
  type BlocoCitacao,
  type BlocoColunas,
  type BlocoMetricas,
  type IndicadorManual,
  type BlocoRelatorio,
  type BlocoTabela,
  type FiltroMetricas,
  type Relatorio,
  type SecaoRelatorio,
  type TipoBloco,
  type TomDestaque,
} from '../../../shared/types/relatorios.types.js';
import { campo, grade2, input, pilulas, textarea } from '../../ui/campos.js';
import { openConfirmModal } from '../../ui/modal.js';
import { buildBotao, svg } from '../../ui/pagina.js';
import { ICONES_POSTAGEM, hojeIso, somarDias } from '../postagens/postagens.ui.js';
import { buildBloco } from './relatorios.documento.js';
import { calcularMetricas, catalogoAtual, intervaloDoMes, mesExato, novoBlocoMetricas } from './relatorios.metricas.js';

/**
 * Editores dos blocos livres de uma seção: texto, destaque, tabela, métricas
 * e quebra de página. Cada um edita o rascunho do relatório no lugar; texto
 * digitado só agenda o salvamento, mudança de estrutura redesenha o editor.
 */

export interface ContextoBlocos {
  rel: Relatorio;
  agendarSalvar(): void;
  mudouEstrutura(): void;
}

const ICONE_CIMA = '<path d="m18 15-6-6-6 6"/>';
const ICONE_BAIXO = '<path d="m6 9 6 6 6-6"/>';
const ICONE_RECALCULAR = '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>';

export const TIPOS_BLOCO: Record<TipoBloco, { rotulo: string; icone: string; dica: string }> = {
  texto: {
    rotulo: 'Texto',
    icone: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/>',
    dica: 'Um texto livre, com subtítulo opcional',
  },
  destaque: {
    rotulo: 'Destaque',
    icone: '<path d="M12 9v4"/><path d="M12 17h.01"/><rect x="3" y="3" width="18" height="18" rx="3"/>',
    dica: 'Caixa colorida para um achado, alerta ou recado',
  },
  tabela: {
    rotulo: 'Tabela',
    icone: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M10 4v16"/>',
    dica: 'Tabela que você mesmo preenche',
  },
  metricas: {
    rotulo: 'Métricas',
    icone: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    dica: 'Números das postagens com filtro de período, rede, tag…',
  },
  analise: {
    rotulo: 'Texto + métrica',
    icone: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><path d="M14 4h7"/><path d="M14 8h5"/><path d="M3 14h18"/><path d="M3 18h18"/><path d="M3 22h12"/>',
    dica: 'Números que você digita (alcance, vendas…) com a sua análise',
  },
  colunas: {
    rotulo: 'Duas colunas',
    icone: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
    dica: 'Dois textos lado a lado — ex.: pontos fortes / a melhorar',
  },
  citacao: {
    rotulo: 'Citação',
    icone: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2H4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .01-1 1.03V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2h-4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
    dica: 'Uma frase em destaque — de um cliente, de um comentário, sua',
  },
  quebra: {
    rotulo: 'Quebra de página',
    icone: '<path d="M4 12h3"/><path d="M10 12h4"/><path d="M17 12h3"/><path d="M6 4v4h12V4"/><path d="M6 20v-4h12v4"/>',
    dica: 'No PDF, o que vem depois começa numa página nova',
  },
};

const DICA_FORMATACAO = 'Linhas começando com "- " viram lista, "1. " lista numerada, e **texto** fica em negrito.';

function botaoIcone(icone: string, titulo: string, aoClicar: () => void, perigo = false): HTMLButtonElement {
  const b = buildBotao('', { icone, variante: 'fantasma', titulo });
  b.classList.add('is-mini');
  if (perigo) b.classList.add('is-perigo');
  b.addEventListener('click', aoClicar);
  return b;
}

function mover<T>(lista: T[], indice: number, sentido: -1 | 1): void {
  const alvo = indice + sentido;
  if (alvo < 0 || alvo >= lista.length) return;
  [lista[indice], lista[alvo]] = [lista[alvo]!, lista[indice]!];
}

/** Botões liga/desliga de escolha múltipla (redes, tags, partes, empresa do relatório). */
export function alternaveis(opcoes: Array<{ id: string; rotulo: string }>, marcados: string[], aoMudar: (lista: string[]) => void): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = 'md-pilulas';
  opcoes.forEach((o) => {
    const ativo = marcados.includes(o.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-pilula';
    btn.classList.toggle('is-ativa', ativo);
    btn.setAttribute('aria-pressed', String(ativo));
    btn.textContent = o.rotulo;
    btn.addEventListener('click', () => aoMudar(ativo ? marcados.filter((m) => m !== o.id) : [...marcados, o.id]));
    grupo.appendChild(btn);
  });
  return grupo;
}

// ---------- Criação ----------

export function novoBloco(tipo: TipoBloco, rel: Relatorio): BlocoRelatorio {
  const id = crypto.randomUUID();
  switch (tipo) {
    case 'texto':
      return { id, tipo, titulo: '', texto: '' };
    case 'destaque':
      return { id, tipo, tom: 'info', titulo: '', texto: '' };
    case 'tabela':
      return { id, tipo, titulo: '', colunas: ['Item', 'Valor'], linhas: [['', ''], ['', '']] };
    case 'metricas':
      return novoBlocoMetricas(rel);
    case 'analise':
      return { id, tipo, titulo: '', indicadores: [novoIndicador(), novoIndicador()], texto: '' };
    case 'colunas':
      return { id, tipo, tituloEsquerda: 'Pontos fortes', textoEsquerda: '', tituloDireita: 'A melhorar', textoDireita: '' };
    case 'citacao':
      return { id, tipo, texto: '', fonte: '' };
    case 'quebra':
      return { id, tipo };
  }
}

function novoIndicador(): IndicadorManual {
  return { id: crypto.randomUUID(), rotulo: '', valor: '', variacao: '', nota: '' };
}

/** Os blocos que têm título próprio no cabeçalho do editor. */
function temTitulo(bloco: BlocoRelatorio): bloco is Extract<BlocoRelatorio, { titulo: string }> {
  return 'titulo' in bloco;
}

// ---------- Editores por tipo ----------

function editorTexto(bloco: Extract<BlocoRelatorio, { tipo: 'texto' | 'destaque' }>, ctx: ContextoBlocos): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rel-bl-corpo';
  if (bloco.tipo === 'destaque') {
    wrap.appendChild(
      campo(
        'Tom',
        pilulas<TomDestaque>(
          TONS_DESTAQUE.map((t) => ({ id: t.id, rotulo: t.rotulo, classe: `rel-tom is-${t.id}` })),
          () => bloco.tom,
          (v) => {
            bloco.tom = v;
            ctx.agendarSalvar();
          },
        ),
      ),
    );
  }
  const area = textarea(bloco.texto, bloco.tipo === 'destaque' ? 'O recado desta caixa' : 'Escreva à vontade…', bloco.tipo === 'destaque' ? 3 : 6);
  area.addEventListener('input', () => {
    bloco.texto = area.value;
    ctx.agendarSalvar();
  });
  wrap.appendChild(campo('Texto', area, DICA_FORMATACAO));
  return wrap;
}

function editorTabela(bloco: BlocoTabela, ctx: ContextoBlocos): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rel-bl-corpo';
  const grade = document.createElement('div');
  grade.className = 'rel-tabela-editor';
  grade.style.setProperty('--colunas', String(bloco.colunas.length));

  bloco.colunas.forEach((nome, c) => {
    const celula = document.createElement('div');
    celula.className = 'rel-tabela-cab';
    const campoNome = input('text', nome, `Coluna ${c + 1}`);
    campoNome.setAttribute('aria-label', `Nome da coluna ${c + 1}`);
    campoNome.addEventListener('input', () => {
      bloco.colunas[c] = campoNome.value;
      ctx.agendarSalvar();
    });
    celula.appendChild(campoNome);
    if (bloco.colunas.length > 1) {
      celula.appendChild(
        botaoIcone(ICONES_POSTAGEM.lixeira, 'Remover coluna', () => {
          bloco.colunas.splice(c, 1);
          bloco.linhas.forEach((l) => l.splice(c, 1));
          ctx.mudouEstrutura();
        }, true),
      );
    }
    grade.appendChild(celula);
  });
  grade.appendChild(document.createElement('span'));

  bloco.linhas.forEach((linha, l) => {
    bloco.colunas.forEach((_, c) => {
      const cel = input('text', linha[c] ?? '');
      cel.setAttribute('aria-label', `Linha ${l + 1}, ${bloco.colunas[c] || `coluna ${c + 1}`}`);
      cel.addEventListener('input', () => {
        linha[c] = cel.value;
        ctx.agendarSalvar();
      });
      grade.appendChild(cel);
    });
    grade.appendChild(
      botaoIcone(ICONES_POSTAGEM.lixeira, 'Remover linha', () => {
        bloco.linhas.splice(l, 1);
        ctx.mudouEstrutura();
      }, true),
    );
  });
  wrap.appendChild(grade);

  const acoes = document.createElement('div');
  acoes.className = 'rel-bl-acoes';
  const novaLinha = buildBotao('Linha', { icone: '<path d="M12 5v14"/><path d="M5 12h14"/>', variante: 'secundario' });
  novaLinha.classList.add('is-mini');
  novaLinha.addEventListener('click', () => {
    bloco.linhas.push(bloco.colunas.map(() => ''));
    ctx.mudouEstrutura();
  });
  const novaColuna = buildBotao('Coluna', { icone: '<path d="M12 5v14"/><path d="M5 12h14"/>', variante: 'secundario' });
  novaColuna.classList.add('is-mini');
  novaColuna.disabled = bloco.colunas.length >= 8;
  novaColuna.addEventListener('click', () => {
    bloco.colunas.push('');
    bloco.linhas.forEach((l) => l.push(''));
    ctx.mudouEstrutura();
  });
  acoes.append(novaLinha, novaColuna);
  wrap.appendChild(acoes);
  return wrap;
}

interface AtalhoPeriodo {
  rotulo: string;
  intervalo: () => Pick<FiltroMetricas, 'inicio' | 'fim'>;
}

function atalhosDePeriodo(rel: Relatorio): AtalhoPeriodo[] {
  const hoje = hojeIso();
  const mesAtual = hoje.slice(0, 7);
  const [a, m] = mesAtual.split('-').map(Number) as [number, number];
  const anterior = new Date(a, m - 2, 1);
  const mesPassado = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`;
  const atalhos: AtalhoPeriodo[] = [
    { rotulo: 'Este mês', intervalo: () => intervaloDoMes(mesAtual) },
    { rotulo: 'Mês passado', intervalo: () => intervaloDoMes(mesPassado) },
    { rotulo: 'Últimos 30 dias', intervalo: () => ({ inicio: somarDias(hoje, -29), fim: hoje }) },
    { rotulo: 'Últimos 90 dias', intervalo: () => ({ inicio: somarDias(hoje, -89), fim: hoje }) },
    { rotulo: 'Este ano', intervalo: () => ({ inicio: `${a}-01-01`, fim: `${a}-12-31` }) },
  ];
  if (rel.periodoInicio || rel.periodoFim) {
    atalhos.push({ rotulo: 'Período do relatório', intervalo: () => ({ inicio: rel.periodoInicio, fim: rel.periodoFim }) });
  }
  atalhos.push({ rotulo: 'Tudo', intervalo: () => ({ inicio: undefined, fim: undefined }) });
  return atalhos;
}

function editorMetricas(bloco: BlocoMetricas, ctx: ContextoBlocos): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rel-bl-corpo rel-metricas-editor';
  const f = bloco.filtro;
  const catalogo = catalogoAtual();

  // Qualquer mudança no filtro recalcula na hora: os números nunca ficam
  // desencontrados do filtro que aparece no documento.
  const aplicar = (mudanca: Partial<FiltroMetricas>): void => {
    Object.assign(f, mudanca);
    if (f.inicio && f.fim && f.inicio > f.fim) [f.inicio, f.fim] = [f.fim, f.inicio];
    bloco.resultado = calcularMetricas(f);
    ctx.mudouEstrutura();
  };

  // Período
  const atalhos = document.createElement('div');
  atalhos.className = 'md-pilulas';
  atalhosDePeriodo(ctx.rel).forEach((at) => {
    const alvo = at.intervalo();
    const ativo = (alvo.inicio ?? '') === (f.inicio ?? '') && (alvo.fim ?? '') === (f.fim ?? '');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-pilula';
    btn.classList.toggle('is-ativa', ativo);
    btn.setAttribute('aria-pressed', String(ativo));
    btn.textContent = at.rotulo;
    btn.addEventListener('click', () => aplicar(alvo));
    atalhos.appendChild(btn);
  });

  const mes = input('month', mesExato(f) ?? '');
  mes.addEventListener('change', () => {
    if (mes.value) aplicar(intervaloDoMes(mes.value));
  });
  const de = input('date', f.inicio ?? '');
  de.addEventListener('change', () => aplicar({ inicio: de.value || undefined }));
  const ate = input('date', f.fim ?? '');
  ate.addEventListener('change', () => aplicar({ fim: ate.value || undefined }));
  const datas = document.createElement('div');
  datas.className = 'rel-metricas-datas';
  datas.append(campo('Um mês', mes), campo('De', de), campo('Até', ate));

  const introducao = textarea(bloco.introducao, 'Apresente os números: de onde vêm, o que se esperava…', 3);
  introducao.addEventListener('input', () => {
    bloco.introducao = introducao.value;
    ctx.agendarSalvar();
  });
  wrap.appendChild(campo('Texto antes dos números (opcional)', introducao, DICA_FORMATACAO));

  wrap.append(campo('Período', atalhos), datas);

  wrap.appendChild(
    grade2(
      campo(
        'Tipo de postagem',
        pilulas<'todos' | TipoPostagem>(
          [{ id: 'todos', rotulo: 'Todos' }, ...TIPOS_POSTAGEM.map((t) => ({ id: t.id, rotulo: t.rotulo }))],
          () => (f.tipos.length === 1 ? f.tipos[0]! : 'todos'),
          (v) => aplicar({ tipos: v === 'todos' ? [] : [v] }),
        ),
      ),
      campo(
        'O que conta',
        pilulas<BaseMetricas>(
          [
            { id: 'publicados', rotulo: 'Só publicados' },
            { id: 'todos', rotulo: 'Tudo com data' },
          ],
          () => f.base,
          (v) => aplicar({ base: v }),
        ),
        f.base === 'publicados' ? 'Pelo dia em que foi ao ar.' : 'Publicado, agendado ou em produção, pela data marcada.',
      ),
    ),
  );

  const redes = catalogo?.redes ?? [];
  if (redes.length) {
    wrap.appendChild(
      campo('Redes', alternaveis(redes.map((r) => ({ id: r.id, rotulo: r.nome })), f.redeIds, (v) => aplicar({ redeIds: v })), 'Nenhuma marcada = todas.'),
    );
  }
  const tags = catalogo?.tags ?? [];
  if (tags.length) {
    wrap.appendChild(
      campo('Tags', alternaveis(tags.map((t) => ({ id: t.id, rotulo: t.nome })), f.tagIds, (v) => aplicar({ tagIds: v })), 'Nenhuma marcada = todas.'),
    );
  }
  wrap.appendChild(
    campo(
      'Prioridade',
      alternaveis(PRIORIDADES.map((p) => ({ id: p.id, rotulo: p.rotulo })), f.prioridades, (v) => aplicar({ prioridades: v })),
      'Nenhuma marcada = todas.',
    ),
  );
  wrap.appendChild(
    campo(
      'Mostrar no documento',
      alternaveis(
        PARTES_METRICAS.map((p) => ({ id: p.id, rotulo: p.rotulo })),
        bloco.partes,
        (v) => {
          bloco.partes = PARTES_METRICAS.map((p) => p.id).filter((id) => v.includes(id));
          ctx.mudouEstrutura();
        },
      ),
      'Período, quantidade, score geral, mediana e cobertura aparecem sempre.',
    ),
  );

  const comentario = textarea(bloco.comentario, 'O que esses números dizem? Contexto, comparação, próximos passos…', 3);
  comentario.addEventListener('input', () => {
    bloco.comentario = comentario.value;
    ctx.agendarSalvar();
  });
  wrap.appendChild(campo('Leitura dos números (opcional)', comentario, DICA_FORMATACAO));

  // Prévia dos números, com o mesmo desenho do PDF.
  const cabPrevia = document.createElement('div');
  cabPrevia.className = 'rel-metricas-cab';
  const quando = document.createElement('span');
  quando.className = 'md-dica';
  quando.textContent = bloco.resultado
    ? `Números de ${new Date(bloco.resultado.calculadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Mudou alguma postagem depois? Recalcule.`
    : 'Ainda sem cálculo.';
  const recalcular = buildBotao('Recalcular', { icone: ICONE_RECALCULAR, variante: 'secundario', titulo: 'Recalcular com os dados atuais das postagens' });
  recalcular.classList.add('is-mini');
  recalcular.addEventListener('click', () => aplicar({}));
  cabPrevia.append(quando, recalcular);
  wrap.appendChild(cabPrevia);

  const papel = document.createElement('div');
  papel.className = 'rd-documento rel-bl-previa';
  // O título do bloco já está no campo de cima; a prévia mostra só os números.
  papel.appendChild(buildBloco({ ...bloco, titulo: '', introducao: '', comentario: '' }));
  wrap.appendChild(papel);
  return wrap;
}

/** Campo de texto que grava a cada tecla sem redesenhar (o foco não pode pular). */
function areaLigada(valor: string, placeholder: string, linhas: number, aoMudar: (v: string) => void, ctx: ContextoBlocos): HTMLTextAreaElement {
  const area = textarea(valor, placeholder, linhas);
  area.addEventListener('input', () => {
    aoMudar(area.value);
    ctx.agendarSalvar();
  });
  return area;
}

function inputLigado(valor: string, placeholder: string, aoMudar: (v: string) => void, ctx: ContextoBlocos): HTMLInputElement {
  const campoTexto = input('text', valor, placeholder);
  campoTexto.addEventListener('input', () => {
    aoMudar(campoTexto.value);
    ctx.agendarSalvar();
  });
  return campoTexto;
}

function editorAnalise(bloco: BlocoAnalise, ctx: ContextoBlocos): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rel-bl-corpo';

  const lista = document.createElement('div');
  lista.className = 'rel-indicadores-editor';
  bloco.indicadores.forEach((ind, i) => {
    const linha = document.createElement('div');
    linha.className = 'rel-indicador-editor';
    const rotulo = inputLigado(ind.rotulo, 'Indicador (ex.: Alcance)', (v) => (ind.rotulo = v), ctx);
    rotulo.setAttribute('aria-label', `Nome do indicador ${i + 1}`);
    const valor = inputLigado(ind.valor, 'Valor (ex.: 48 mil)', (v) => (ind.valor = v), ctx);
    valor.setAttribute('aria-label', `Valor do indicador ${i + 1}`);
    const variacao = inputLigado(ind.variacao, 'Variação (ex.: +12%)', (v) => (ind.variacao = v), ctx);
    variacao.setAttribute('aria-label', `Variação do indicador ${i + 1}`);
    const nota = inputLigado(ind.nota, 'Nota curta (opcional)', (v) => (ind.nota = v), ctx);
    nota.setAttribute('aria-label', `Nota do indicador ${i + 1}`);
    nota.classList.add('rel-indicador-nota');
    linha.append(
      rotulo,
      valor,
      variacao,
      botaoIcone(ICONES_POSTAGEM.lixeira, 'Remover indicador', () => {
        bloco.indicadores.splice(i, 1);
        ctx.mudouEstrutura();
      }, true),
      nota,
    );
    lista.appendChild(linha);
  });
  wrap.appendChild(campo('Números', lista, 'Variação começando com "+" fica verde no documento; com "-", vermelha.'));

  const acoes = document.createElement('div');
  acoes.className = 'rel-bl-acoes';
  const novo = buildBotao('Indicador', { icone: '<path d="M12 5v14"/><path d="M5 12h14"/>', variante: 'secundario' });
  novo.classList.add('is-mini');
  novo.disabled = bloco.indicadores.length >= 12;
  novo.addEventListener('click', () => {
    bloco.indicadores.push(novoIndicador());
    ctx.mudouEstrutura();
  });
  acoes.appendChild(novo);
  wrap.appendChild(acoes);

  wrap.appendChild(
    campo('Análise', areaLigada(bloco.texto, 'O que esses números mostram? Compare, explique, recomende…', 6, (v) => (bloco.texto = v), ctx), DICA_FORMATACAO),
  );
  return wrap;
}

function editorColunas(bloco: BlocoColunas, ctx: ContextoBlocos): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rel-bl-corpo';
  const lado = (titulo: string, textoLado: string, aoTitulo: (v: string) => void, aoTexto: (v: string) => void, rotulo: string): HTMLElement => {
    const col = document.createElement('div');
    col.className = 'rel-colunas-lado';
    col.append(
      campo(`${rotulo} — título`, inputLigado(titulo, 'Título da coluna', aoTitulo, ctx)),
      campo(`${rotulo} — texto`, areaLigada(textoLado, 'Escreva à vontade…', 6, aoTexto, ctx)),
    );
    return col;
  };
  wrap.appendChild(
    grade2(
      lado(bloco.tituloEsquerda, bloco.textoEsquerda, (v) => (bloco.tituloEsquerda = v), (v) => (bloco.textoEsquerda = v), 'Esquerda'),
      lado(bloco.tituloDireita, bloco.textoDireita, (v) => (bloco.tituloDireita = v), (v) => (bloco.textoDireita = v), 'Direita'),
    ),
  );
  wrap.appendChild(Object.assign(document.createElement('p'), { className: 'md-dica', textContent: DICA_FORMATACAO }));
  return wrap;
}

function editorCitacao(bloco: BlocoCitacao, ctx: ContextoBlocos): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rel-bl-corpo';
  wrap.append(
    campo('Frase', areaLigada(bloco.texto, '"O conteúdo desse mês trouxe…"', 3, (v) => (bloco.texto = v), ctx)),
    campo('Quem disse (opcional)', inputLigado(bloco.fonte, 'Nome, cargo ou origem', (v) => (bloco.fonte = v), ctx)),
  );
  return wrap;
}

// ---------- Casca do bloco ----------

function buildBlocoEditor(secao: SecaoRelatorio, bloco: BlocoRelatorio, indice: number, ctx: ContextoBlocos): HTMLElement {
  const def = TIPOS_BLOCO[bloco.tipo];
  const cartao = document.createElement('article');
  cartao.className = `rel-bl is-${bloco.tipo}`;

  const cab = document.createElement('header');
  cab.className = 'rel-bl-cab';
  const tipo = document.createElement('span');
  tipo.className = 'rel-bl-tipo';
  tipo.innerHTML = svg(def.icone, 13, 2);
  tipo.append(def.rotulo);
  cab.appendChild(tipo);

  if (temTitulo(bloco)) {
    const titulo = input('text', bloco.titulo, bloco.tipo === 'destaque' ? 'Título (opcional)' : 'Subtítulo (opcional)');
    titulo.classList.add('rel-bl-titulo');
    titulo.setAttribute('aria-label', 'Título do bloco');
    titulo.addEventListener('input', () => {
      bloco.titulo = titulo.value;
      ctx.agendarSalvar();
    });
    cab.appendChild(titulo);
  } else {
    cab.appendChild(Object.assign(document.createElement('span'), { className: 'rel-bl-quebra', textContent: def.dica }));
  }

  const acoes = document.createElement('span');
  acoes.className = 'rel-item-acoes';
  acoes.append(
    botaoIcone(ICONE_CIMA, 'Subir bloco', () => {
      mover(secao.blocos, indice, -1);
      ctx.mudouEstrutura();
    }),
    botaoIcone(ICONE_BAIXO, 'Descer bloco', () => {
      mover(secao.blocos, indice, 1);
      ctx.mudouEstrutura();
    }),
    botaoIcone(
      ICONES_POSTAGEM.lixeira,
      'Remover bloco',
      () => {
        const vazio =
          bloco.tipo === 'quebra' ||
          ((bloco.tipo === 'texto' || bloco.tipo === 'destaque') && !bloco.texto.trim() && !bloco.titulo.trim()) ||
          (bloco.tipo === 'citacao' && !bloco.texto.trim() && !bloco.fonte.trim());
        const remover = (): void => {
          secao.blocos.splice(secao.blocos.indexOf(bloco), 1);
          ctx.mudouEstrutura();
        };
        if (vazio) return remover();
        const nome = (temTitulo(bloco) && bloco.titulo.trim()) || def.rotulo;
        void openConfirmModal({ title: 'Remover bloco', message: `O bloco "${nome}" sai do relatório.`, confirmText: 'Remover' }).then(
          (ok) => ok && remover(),
        );
      },
      true,
    ),
  );
  cab.appendChild(acoes);
  cartao.appendChild(cab);

  switch (bloco.tipo) {
    case 'texto':
    case 'destaque':
      cartao.appendChild(editorTexto(bloco, ctx));
      break;
    case 'tabela':
      cartao.appendChild(editorTabela(bloco, ctx));
      break;
    case 'metricas':
      cartao.appendChild(editorMetricas(bloco, ctx));
      break;
    case 'analise':
      cartao.appendChild(editorAnalise(bloco, ctx));
      break;
    case 'colunas':
      cartao.appendChild(editorColunas(bloco, ctx));
      break;
    case 'citacao':
      cartao.appendChild(editorCitacao(bloco, ctx));
      break;
    case 'quebra':
      break;
  }
  return cartao;
}

export function buildBlocosEditor(secao: SecaoRelatorio, ctx: ContextoBlocos): HTMLElement {
  const lista = document.createElement('div');
  lista.className = 'rel-blocos';
  secao.blocos.forEach((b, i) => lista.appendChild(buildBlocoEditor(secao, b, i, ctx)));
  return lista;
}

/** Barra "Adicionar: Texto · Destaque · Tabela · Métricas · Quebra de página". */
export function buildMenuNovoBloco(secao: SecaoRelatorio, ctx: ContextoBlocos): HTMLElement {
  const barra = document.createElement('div');
  barra.className = 'rel-bl-menu';
  barra.appendChild(Object.assign(document.createElement('span'), { className: 'md-rotulo', textContent: 'Adicionar' }));
  (Object.keys(TIPOS_BLOCO) as TipoBloco[]).forEach((tipo) => {
    const def = TIPOS_BLOCO[tipo];
    const btn = buildBotao(def.rotulo, { icone: def.icone, variante: 'secundario', titulo: def.dica });
    btn.classList.add('is-mini');
    btn.addEventListener('click', () => {
      secao.blocos.push(novoBloco(tipo, ctx.rel));
      ctx.mudouEstrutura();
    });
    barra.appendChild(btn);
  });
  return barra;
}
