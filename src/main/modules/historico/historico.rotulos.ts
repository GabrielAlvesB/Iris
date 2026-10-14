import type { TipoEntradaHistorico } from '../../../shared/types/historico.types';

/**
 * Como dizer o que aconteceu sem uma tabela por canal: o tipo sai da diferença
 * entre o antes e o depois (sumiu um objeto com id = exclusão, apareceu =
 * criação), o substantivo sai do nome do canal e o nome do item sai do próprio
 * objeto. Canal novo ganha rótulo sozinho.
 */

type Genero = 'm' | 'f';

/** A ordem importa: o primeiro que casar vale ("deleteSubtask" é subtarefa, não tarefa). */
const SUBSTANTIVOS: ReadonlyArray<[RegExp, string, Genero]> = [
  [/subtask|subtarefa/i, 'Subtarefa', 'f'],
  [/card/i, 'Card', 'm'],
  [/column|coluna/i, 'Coluna', 'f'],
  [/connection|conexao/i, 'Conexão', 'f'],
  [/block|bloco/i, 'Bloco', 'm'],
  [/checklist/i, 'Checklist', 'f'],
  [/item/i, 'Item', 'm'],
  [/pensamento/i, 'Post-it', 'm'],
  [/video/i, 'Vídeo', 'm'],
  [/imagem/i, 'Imagem', 'f'],
  [/escala/i, 'Escala de score', 'f'],
  [/tag/i, 'Tag', 'f'],
  [/rede/i, 'Rede', 'f'],
  [/rows?\b|linha/i, 'Linha', 'f'],
  [/table|tabela/i, 'Tabela', 'f'],
  [/snippet/i, 'Texto', 'm'],
  [/link/i, 'Link', 'm'],
  [/relatorio/i, 'Relatório', 'm'],
  [/roteiro/i, 'Roteiro', 'm'],
  [/campanha/i, 'Campanha', 'f'],
  [/registro/i, 'Registro diário', 'm'],
  [/conta/i, 'Conta', 'f'],
  [/site/i, 'Site', 'm'],
  [/pessoa/i, 'Pessoa', 'f'],
  [/empresa/i, 'Empresa', 'f'],
  [/contrato/i, 'Contrato', 'm'],
  [/modelo/i, 'Modelo', 'm'],
  [/etapa/i, 'Etapa', 'f'],
  [/interac/i, 'Registro do histórico', 'm'],
  [/recurso/i, 'Arquivo da Biblioteca', 'm'],
  [/colecao/i, 'Coleção', 'f'],
  [/raiz/i, 'Pasta monitorada', 'f'],
  [/servidor/i, 'Servidor', 'm'],
  [/board|quadro/i, 'Quadro', 'm'],
  [/destaque/i, 'Cor de destaque', 'f'],
  [/settema/i, 'Tema', 'm'],
  [/atalho/i, 'Atalho de teclado', 'm'],
  [/assinatura/i, 'Assinatura', 'f'],
  [/perfil/i, 'Seus dados', 'm'],
];

const PARTICIPIOS: Record<Exclude<TipoEntradaHistorico, 'desfazer'> | 'movido', [string, string]> = {
  criacao: ['criado', 'criada'],
  edicao: ['editado', 'editada'],
  exclusao: ['excluído', 'excluída'],
  movido: ['movido', 'movida'],
};

const CAMPOS_DE_NOME = ['title', 'titulo', 'nome', 'name', 'texto', 'label', 'rotulo', 'nomeFantasia', 'razaoSocial'] as const;

interface ObjetoComId {
  id: string;
  json: string;
  nome: string;
}

function nomeDe(obj: Record<string, unknown>): string {
  for (const c of CAMPOS_DE_NOME) {
    const v = obj[c];
    if (typeof v === 'string' && v.trim()) {
      const t = v.trim().replace(/\s+/g, ' ');
      return t.length > 60 ? `${t.slice(0, 57)}…` : t;
    }
  }
  return '';
}

/**
 * Todo objeto com `id` texto que é item de uma lista, até uma profundidade
 * razoável. Só dentro de lista: um campo de configuração com `id` (a cor de
 * destaque `{ id: 'azul' }`) trocar de valor não é exclusão de nada.
 */
function objetosComId(raiz: unknown): Map<string, ObjetoComId> {
  const mapa = new Map<string, ObjetoComId>();
  const andar = (v: unknown, nivel: number, emLista: boolean): void => {
    if (nivel > 6 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      v.forEach((x) => andar(x, nivel + 1, true));
      return;
    }
    const obj = v as Record<string, unknown>;
    if (emLista && typeof obj.id === 'string' && !mapa.has(obj.id)) mapa.set(obj.id, { id: obj.id, json: JSON.stringify(obj), nome: nomeDe(obj) });
    Object.values(obj).forEach((x) => andar(x, nivel + 1, false));
  };
  andar(raiz, 0, false);
  return mapa;
}

/** Acima disso a comparação objeto a objeto pesaria; vale só o nome do canal. */
const LIMITE_COMPARACAO = 5 * 1024 * 1024;

export interface Diferenca {
  tipo: Exclude<TipoEntradaHistorico, 'desfazer'>;
  detalhe: string;
}

function porCanal(canal: string): Diferenca['tipo'] {
  const metodo = canal.split(':')[1] ?? '';
  if (/delete|excluir|remover|apagar/i.test(metodo)) return 'exclusao';
  if (/create|criar|adicionar|novo|nova|duplicar|importar/i.test(metodo)) return 'criacao';
  return 'edicao';
}

export function diferenca(canal: string, antes: string, depois: string): Diferenca {
  if (antes.length > LIMITE_COMPARACAO || depois.length > LIMITE_COMPARACAO) return { tipo: porCanal(canal), detalhe: '' };
  let a: Map<string, ObjetoComId>;
  let d: Map<string, ObjetoComId>;
  try {
    a = objetosComId(JSON.parse(antes));
    d = objetosComId(JSON.parse(depois));
  } catch {
    return { tipo: porCanal(canal), detalhe: '' };
  }
  // O que sumiu/apareceu "por fora": o card, não as subtarefas que foram junto.
  const maior = (lista: ObjetoComId[]): ObjetoComId | undefined => lista.sort((x, y) => y.json.length - x.json.length)[0];
  const removidos = [...a.values()].filter((o) => !d.has(o.id));
  if (removidos.length) return { tipo: 'exclusao', detalhe: maior(removidos.filter((o) => o.nome))?.nome ?? '' };
  const criados = [...d.values()].filter((o) => !a.has(o.id));
  if (criados.length) return { tipo: 'criacao', detalhe: maior(criados.filter((o) => o.nome))?.nome ?? '' };
  // Editado: o objeto mais específico que mudou (o card, não o quadro que o contém).
  const mudados = [...d.values()].filter((o) => a.get(o.id)?.json !== o.json && o.nome).sort((x, y) => x.json.length - y.json.length);
  return { tipo: 'edicao', detalhe: mudados[0]?.nome ?? '' };
}

export function rotular(canal: string, tipo: Diferenca['tipo']): string {
  const metodo = canal.split(':')[1] ?? canal;
  const achado = SUBSTANTIVOS.find(([re]) => re.test(metodo));
  if (!achado) return tipo === 'exclusao' ? 'Exclusão' : tipo === 'criacao' ? 'Criação' : 'Alteração';
  const [, nome, genero] = achado;
  const chave = tipo === 'edicao' && /reorder|mover|move|ordem/i.test(metodo) ? 'movido' : tipo;
  return `${nome} ${PARTICIPIOS[chave][genero === 'm' ? 0 : 1]}`;
}
