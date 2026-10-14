import * as kanbanService from '../kanban/kanban.service';
import * as todoService from '../todo/todo.service';
import * as quadroService from '../quadro/quadro.service';
import * as pensamentosService from '../pensamentos/pensamentos.service';
import * as exploradorService from '../explorador/explorador.service';
import * as videosService from '../videos/videos.service';
import * as imagensService from '../imagens/imagens.service';
import * as sheetsService from '../sheets/sheets.service';
import * as roteirosService from '../roteiros/roteiros.service';
import * as linksService from '../links/links.service';
import * as copyService from '../copy/copy.service';
import * as contatosService from '../contatos/contatos.service';
import type { ItemBusca } from '../../../shared/types/busca.types';
import { VIDEO_STATUS } from '../../../shared/types/videos.types';
import { IMAGEM_STATUS } from '../../../shared/types/imagens.types';
import { STATUS_ROTEIRO } from '../../../shared/types/roteiros.types';

/**
 * O índice da busca global, montado na hora a partir dos arquivos (todos
 * locais e pequenos). Nada é guardado: o índice nunca fica velho em relação
 * aos dados. Arquivados ficam de fora — a busca é para o que está em uso.
 */

/** O bastante para casar uma palavra do meio do texto sem mandar um roteiro inteiro pelo IPC. */
const MAX_TERMOS = 4000;
/** Uma tabela importada pode ter milhares de linhas; a busca não precisa de todas. */
const MAX_LINHAS_POR_TABELA = 5000;

function juntar(...partes: Array<string | undefined | null | false>): string {
  const texto = partes.filter((p): p is string => typeof p === 'string' && !!p.trim()).join(' · ');
  return texto.length > MAX_TERMOS ? texto.slice(0, MAX_TERMOS) : texto;
}

function primeiraLinha(texto: string, max = 80): string {
  const linha = texto.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return linha.length > max ? `${linha.slice(0, max - 1)}…` : linha;
}

/** "AAAA-MM-DD" → "14/10" (sem passar por Date: a data é local). */
function diaCurto(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}` : '';
}

/** Cada fonte por conta própria: um arquivo ilegível não pode zerar a busca inteira. */
async function seguro(fonte: () => Promise<ItemBusca[]>): Promise<ItemBusca[]> {
  try {
    return await fonte();
  } catch (erro) {
    console.error('[busca] uma fonte falhou', erro);
    return [];
  }
}

async function doKanban(): Promise<ItemBusca[]> {
  const board = await kanbanService.getBoard();
  const colunas = new Map(board.columns.map((c) => [c.id, c.title]));
  return board.cards.map((c) => ({
    tipo: 'Card',
    rotulo: c.title,
    detalhe: juntar(colunas.get(c.columnId), c.dueDate && `vence ${diaCurto(c.dueDate)}`, c.assignee),
    termos: juntar(c.description, (c.tags ?? []).join(' '), (c.subtasks ?? []).map((s) => s.title).join(' ')),
    alvo: { modulo: 'kanban', id: c.id },
  }));
}

async function doTodo(): Promise<ItemBusca[]> {
  const file = await todoService.getFile();
  return file.checklists
    .filter((l) => !l.arquivada)
    .map((l) => {
      const feitos = l.itens.filter((i) => i.feito).length;
      return {
        tipo: 'Checklist',
        rotulo: l.titulo,
        detalhe: juntar(l.itens.length ? `${feitos}/${l.itens.length} feitos` : 'sem itens', l.prazo && `prazo ${diaCurto(l.prazo)}`),
        termos: juntar(l.descricao, l.itens.map((i) => i.texto).join(' · ')),
        alvo: { modulo: 'todo', id: l.id },
      };
    });
}

const TIPO_BLOCO: Record<string, string> = { nota: 'Nota', tarefa: 'Tarefa', rotina: 'Rotina' };

async function doQuadro(): Promise<ItemBusca[]> {
  const file = await quadroService.getState();
  return file.blocks.map((b) => ({
    tipo: 'Bloco',
    rotulo: b.title || primeiraLinha(b.content ?? '') || TIPO_BLOCO[b.type] || 'Bloco',
    detalhe: juntar(TIPO_BLOCO[b.type], b.assignee),
    termos: juntar(b.content),
    alvo: { modulo: 'quadro', id: b.id },
  }));
}

async function dosPensamentos(): Promise<ItemBusca[]> {
  const file = await pensamentosService.getPensamentos();
  return file.pensamentos
    .filter((p) => p.texto.trim())
    .map((p) => ({
      tipo: 'Post-it',
      rotulo: primeiraLinha(p.texto),
      detalhe: p.tags.length ? p.tags.map((t) => `#${t}`).join(' ') : 'Pensamentos',
      termos: juntar(p.texto),
      alvo: { modulo: 'pensamentos', id: p.id },
    }));
}

async function daBiblioteca(): Promise<ItemBusca[]> {
  const file = await exploradorService.getFullFile();
  const colecoes = new Map(file.colecoes.map((c) => [c.id, c.nome]));
  return file.recursos.map((r) => ({
    tipo: 'Arquivo',
    rotulo: r.nome,
    detalhe: juntar((r.colecaoId && colecoes.get(r.colecaoId)) || 'Biblioteca', r.tags.join(' ')),
    termos: juntar(r.nota, r.caminho),
    alvo: { modulo: 'explorador', id: r.id },
  }));
}

async function dasPostagens(): Promise<ItemBusca[]> {
  const [videos, imagens] = await Promise.all([videosService.getFile(), imagensService.getFile()]);
  const tags = new Map(videos.tags.map((t) => [t.id, t.nome]));
  const etapaVideo = new Map<string, string>(VIDEO_STATUS.map((s) => [s.id, s.rotulo]));
  const etapaImagem = new Map<string, string>(IMAGEM_STATUS.map((s) => [s.id, s.rotulo]));
  const quando = (data?: string, hora?: string): string => (data ? `${diaCurto(data)}${hora ? ` ${hora}` : ''}` : '');
  const nomesDasTags = (ids: string[]): string => ids.map((id) => tags.get(id) ?? '').join(' ');
  return [
    ...videos.videos
      .filter((v) => v.status !== 'arquivado')
      .map<ItemBusca>((v) => ({
        tipo: 'Postagem',
        rotulo: v.titulo || 'Vídeo sem título',
        detalhe: juntar('Vídeo', etapaVideo.get(v.status), quando(v.dataAgendada, v.horaAgendada)),
        termos: juntar(v.descricao, v.hashtags.join(' '), v.notas, nomesDasTags(v.tagIds), v.camposExtras.map((c) => c.valor).join(' ')),
        alvo: { modulo: 'postagens', tipo: 'video', id: v.id },
      })),
    ...imagens.imagens
      .filter((i) => i.status !== 'arquivado')
      .map<ItemBusca>((i) => ({
        tipo: 'Postagem',
        rotulo: i.titulo || 'Imagem sem título',
        detalhe: juntar('Imagem', etapaImagem.get(i.status), quando(i.dataAgendada, i.horaAgendada)),
        termos: juntar(i.legenda, i.briefing, i.textoNaArte, i.cta, i.notas, nomesDasTags(i.tagIds)),
        alvo: { modulo: 'postagens', tipo: 'imagem', id: i.id },
      })),
  ];
}

async function doSheets(): Promise<ItemBusca[]> {
  const file = await sheetsService.getFile();
  // Tabela escondida pelo usuário fica fora: a tela não teria onde mostrar a linha.
  return file.tables.filter((t) => t.visible).flatMap((t) =>
    t.rows.slice(0, MAX_LINHAS_POR_TABELA).flatMap<ItemBusca>((r) => {
      const valores = t.columns.map((c) => (r.cells[c.id] ?? '').trim()).filter(Boolean);
      if (!valores.length) return [];
      return [
        {
          tipo: 'Linha',
          rotulo: primeiraLinha(valores[0]!),
          detalhe: `Tabela ${t.name}`,
          termos: juntar(valores.slice(1).join(' · ')),
          alvo: { modulo: 'sheets', tabelaId: t.id, id: r.id },
        },
      ];
    }),
  );
}

async function dosRoteiros(): Promise<ItemBusca[]> {
  const file = await roteirosService.getFile();
  const status = new Map<string, string>(STATUS_ROTEIRO.map((s) => [s.id, s.rotulo]));
  return file.roteiros.map((r) => ({
    tipo: 'Roteiro',
    rotulo: r.titulo || 'Roteiro sem título',
    detalhe: juntar(status.get(r.status), r.briefing.tema),
    termos: juntar(r.briefing.objetivo, r.briefing.pontosChave, r.cenas.map((c) => `${c.titulo} ${c.fala}`).join(' · '), r.observacoes),
    alvo: { modulo: 'roteiros', id: r.id },
  }));
}

async function dosLinks(): Promise<ItemBusca[]> {
  const file = await linksService.getLinks();
  return file.links.map((l) => ({
    tipo: 'Link',
    rotulo: l.title,
    detalhe: l.url.replace(/^https?:\/\//, ''),
    termos: juntar(l.group, l.url),
    alvo: { modulo: 'links', url: l.url },
  }));
}

async function doCopy(): Promise<ItemBusca[]> {
  const file = await copyService.getSnippets();
  return file.snippets.map((s) => ({
    tipo: 'Texto',
    rotulo: s.title,
    detalhe: primeiraLinha(s.text, 60) || 'Copy',
    termos: juntar(s.group, s.text),
    alvo: { modulo: 'copy', id: s.id },
  }));
}

async function dosContatos(): Promise<ItemBusca[]> {
  const file = await contatosService.getFile();
  const empresas = new Map(file.empresas.map((e) => [e.id, e.nomeFantasia || e.razaoSocial]));
  return [
    ...file.pessoas
      .filter((p) => !p.arquivado)
      .map<ItemBusca>((p) => ({
        tipo: 'Contato',
        rotulo: p.nome,
        detalhe: juntar(p.cargo, p.empresaId && empresas.get(p.empresaId)) || 'Pessoa',
        termos: juntar(p.apelido, p.emails.join(' '), p.telefones.map((t) => t.numero.replace(/\D/g, '')).join(' ')),
        alvo: { modulo: 'contatos', ref: { tipo: 'pessoa', id: p.id } },
      })),
    ...file.empresas
      .filter((e) => !e.arquivado)
      .map<ItemBusca>((e) => ({
        tipo: 'Contato',
        rotulo: e.nomeFantasia || e.razaoSocial,
        detalhe: juntar('Empresa', e.segmento),
        termos: juntar(e.razaoSocial, e.cnpj.replace(/\D/g, ''), e.emails.join(' ')),
        alvo: { modulo: 'contatos', ref: { tipo: 'empresa', id: e.id } },
      })),
  ];
}

export async function montarIndice(): Promise<ItemBusca[]> {
  const partes = await Promise.all(
    [doKanban, doTodo, doQuadro, dosPensamentos, daBiblioteca, dasPostagens, doSheets, dosRoteiros, dosLinks, doCopy, dosContatos].map(seguro),
  );
  return partes.flat().filter((i) => i.rotulo.trim());
}
