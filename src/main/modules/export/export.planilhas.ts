import type * as XlsxTipos from 'xlsx';
import * as kanbanService from '../kanban/kanban.service';
import * as todoService from '../todo/todo.service';
import * as videosService from '../videos/videos.service';
import * as imagensService from '../imagens/imagens.service';
import * as roteirosService from '../roteiros/roteiros.service';
import * as trafegoService from '../trafego/trafego.service';
import * as contatosService from '../contatos/contatos.service';
import * as whatsappService from '../whatsapp/whatsapp.service';
import { PROVEDORES_WHATSAPP, STATUS_MENSAGEM_WA, SITUACOES_LOTE } from '../../../shared/types/whatsapp.types';
import { formatarNumeroWa } from '../../../shared/types/whatsapp.numero';
import { acharContato, nomeDoContato } from '../../../shared/types/contatos.types';
import { SITUACOES_CONTRATO, TIPOS_TELEFONE } from '../../../shared/types/contatos.types';
import { FAIXAS_LEAD } from '../../../shared/types/leads.types';
import { enderecoPorExtenso } from '../../../shared/types/brasil';
import type { ModuloExportavel } from '../../../shared/types/export.types';
import { VIDEO_STATUS } from '../../../shared/types/videos.types';
import { IMAGEM_STATUS, FORMATOS_IMAGEM } from '../../../shared/types/imagens.types';
import { FORMATOS_ROTEIRO, STATUS_ROTEIRO, TIPOS_CENA } from '../../../shared/types/roteiros.types';
import { OBJETIVOS_TRAFEGO, PLATAFORMAS_TRAFEGO, STATUS_CAMPANHA, calcularMetricas, somar } from '../../../shared/types/trafego.types';

/**
 * Versão em planilha de alguns módulos, para ler e compartilhar fora do Iris.
 * Só ida: a planilha achata o que é aninhado (subtarefas, cenas), então ela
 * não serve para restaurar — o JSON serve.
 *
 * xlsx carrega sob demanda, como no Sheets e no Tráfego: ~200 ms de require
 * que não precisam acontecer na abertura do app.
 */
let xlsx: typeof XlsxTipos | null = null;
function XLSX(): typeof XlsxTipos {
  xlsx ??= require('xlsx') as typeof XlsxTipos;
  return xlsx;
}

type Celula = string | number | undefined;
type Aba = { nome: string; linhas: Array<Record<string, Celula>> };

const SIM_NAO = (v: boolean): string => (v ? 'Sim' : 'Não');
const PRIORIDADE: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa', high: 'Alta', medium: 'Média', low: 'Baixa', urgent: 'Urgente' };
const rotulo = <T extends { id: string; rotulo: string }>(lista: readonly T[], id: string | undefined): string =>
  (id && lista.find((x) => x.id === id)?.rotulo) || id || '';

async function abasKanban(): Promise<Aba[]> {
  const file = await kanbanService.getFullFile();
  const linhas = file.boards.flatMap((board) => {
    const colunas = new Map(board.columns.map((c) => [c.id, c]));
    return [...board.cards]
      .sort((a, b) => (colunas.get(a.columnId)?.order ?? 0) - (colunas.get(b.columnId)?.order ?? 0) || a.order - b.order)
      .map((card) => {
        const sub = card.subtasks ?? [];
        return {
          Quadro: board.name,
          Coluna: colunas.get(card.columnId)?.title ?? '',
          Título: card.title,
          Prioridade: PRIORIDADE[card.priority ?? ''] ?? card.priority ?? '',
          Prazo: card.dueDate ?? '',
          Responsável: card.assignee ?? '',
          Etiquetas: (card.tags ?? []).join(', '),
          Subtarefas: sub.length ? `${sub.filter((s) => s.done).length}/${sub.length}` : '',
          'Lista de subtarefas': sub.map((s) => `${s.done ? '✓' : '☐'} ${s.title}`).join('\n'),
          Descrição: card.description ?? '',
        };
      });
  });
  return [{ nome: 'Cards', linhas }];
}

async function abasTodo(): Promise<Aba[]> {
  const file = await todoService.getFullFile();
  const linhas = [...file.checklists]
    .sort((a, b) => a.ordem - b.ordem)
    .flatMap((c) => {
      const concluida = c.itens.length > 0 && c.itens.every((i) => i.feito);
      const situacao = c.arquivada ? 'Arquivada' : concluida ? 'Concluída' : 'Aberta';
      const base = { Checklist: c.titulo, Situação: situacao, Prioridade: PRIORIDADE[c.prioridade ?? ''] ?? '', Prazo: c.prazo ?? '' };
      if (!c.itens.length) return [{ ...base, Item: '', Feito: '', 'Feito em': '' }];
      return c.itens.map((i) => ({ ...base, Item: i.texto, Feito: SIM_NAO(i.feito), 'Feito em': i.feitoEm?.slice(0, 10) ?? '' }));
    });
  return [{ nome: 'Itens', linhas }];
}

async function abasPostagens(): Promise<Aba[]> {
  const [videos, imagens] = await Promise.all([videosService.getFullFile(), imagensService.getFullFile()]);
  const tags = new Map(videos.tags.map((t) => [t.id, t]));
  const redes = new Map(videos.redes.map((r) => [r.id, r.nome]));
  const comum = (p: (typeof videos.videos)[number] | (typeof imagens.imagens)[number], etapas: ReadonlyArray<{ id: string; rotulo: string }>): Record<string, Celula> => {
    const ts = p.tagIds.map((id) => tags.get(id)).filter((t) => t !== undefined);
    return {
      Título: p.titulo,
      Etapa: rotulo(etapas, p.status),
      Prioridade: PRIORIDADE[p.prioridade ?? ''] ?? '',
      Empresa: ts.filter((t) => t.empresa).map((t) => t.nome).join(', '),
      Tags: ts.filter((t) => !t.empresa).map((t) => t.nome).join(', '),
      Redes: p.redeIds.map((id) => redes.get(id) ?? '').filter(Boolean).join(', '),
      Data: p.dataAgendada ?? '',
      Hora: p.horaAgendada ?? '',
      'Publicado em': p.publicadoEm?.slice(0, 10) ?? '',
      Score: p.score,
    };
  };
  return [
    { nome: 'Vídeos', linhas: videos.videos.map((v) => ({ ...comum(v, VIDEO_STATUS), Descrição: v.descricao, Hashtags: v.hashtags.join(' '), Notas: v.notas })) },
    {
      nome: 'Imagens',
      linhas: imagens.imagens.map((i) => ({ ...comum(i, IMAGEM_STATUS), Formato: rotulo(FORMATOS_IMAGEM, i.formato), Legenda: i.legenda, 'Texto na arte': i.textoNaArte, Notas: i.notas })),
    },
  ];
}

async function abasRoteiros(): Promise<Aba[]> {
  const file = await roteirosService.getFullFile();
  const linhas = file.roteiros.flatMap((r) =>
    r.cenas.map((c, i) => ({
      Roteiro: r.titulo,
      Situação: rotulo(STATUS_ROTEIRO, r.status),
      Formato: rotulo(FORMATOS_ROTEIRO, r.formato),
      Cena: i + 1,
      Tipo: rotulo(TIPOS_CENA, c.tipo),
      'Título da cena': c.titulo,
      Fala: c.fala,
      Visual: c.visual,
      'Texto na tela': c.textoTela,
      Notas: c.notas,
    })),
  );
  return [{ nome: 'Cenas', linhas }];
}

/** Razões vêm de calcularMetricas, nunca do arquivo — a mesma regra da tela. */
async function abasTrafego(): Promise<Aba[]> {
  const file = await trafegoService.getFullFile();
  const contas = new Map(file.contas.map((c) => [c.id, c.nome]));
  const metricas = (m: ReturnType<typeof calcularMetricas>): Record<string, Celula> => ({
    Investimento: m.investimento,
    Impressões: m.impressoes,
    Cliques: m.cliques,
    Conversões: m.conversoes,
    Receita: m.receita,
    'CTR (%)': m.ctr === undefined ? '' : m.ctr * 100,
    CPC: m.cpc,
    CPM: m.cpm,
    CPA: m.cpa,
    'Taxa de conversão (%)': m.taxaConversao === undefined ? '' : m.taxaConversao * 100,
    ROAS: m.roas,
  });
  const campanhas = file.campanhas.map((c) => ({
    Campanha: c.nome,
    Conta: c.contaId ? (contas.get(c.contaId) ?? '') : '',
    Plataforma: rotulo(PLATAFORMAS_TRAFEGO, c.plataforma),
    Objetivo: rotulo(OBJETIVOS_TRAFEGO, c.objetivo),
    Status: rotulo(STATUS_CAMPANHA, c.status),
    Início: c.inicio ?? '',
    Fim: c.fim ?? '',
    ...metricas(calcularMetricas(somar(c.registros))),
  }));
  const registros = file.campanhas.flatMap((c) =>
    [...c.registros].sort((a, b) => a.data.localeCompare(b.data)).map((r) => ({ Campanha: c.nome, Data: r.data, ...metricas(calcularMetricas(somar([r]))) })),
  );
  return [
    { nome: 'Campanhas', linhas: campanhas },
    { nome: 'Registros diários', linhas: registros },
  ];
}

/** Uma linha por pessoa e por empresa, com o último contato; e os contratos. */
async function abasContatos(): Promise<Aba[]> {
  const file = await contatosService.getFullFile();
  const etapas = new Map(file.etapas.map((e) => [e.id, e.nome]));
  const empresas = new Map(file.empresas.map((e) => [e.id, e.nomeFantasia || e.razaoSocial]));
  const ultimo = (tipo: string, id: string): string =>
    file.interacoes
      .filter((i) => i.contato.tipo === tipo && i.contato.id === id && i.tipo !== 'evento' && i.tipo !== 'formulario')
      .map((i) => i.data.slice(0, 10))
      .sort()
      .pop() ?? '';
  const telefones = (lista: Array<{ numero: string; tipo: string }>): string =>
    lista.map((t) => `${t.numero} (${rotulo(TIPOS_TELEFONE, t.tipo)})`).join('; ');
  const comuns = (c: (typeof file.pessoas)[number] | (typeof file.empresas)[number], tipo: string): Record<string, Celula> => ({
    'E-mails': c.emails.join('; '),
    Telefones: telefones(c.telefones),
    Endereço: enderecoPorExtenso(c.endereco),
    Etapa: etapas.get(c.etapaId) ?? '',
    Origem: c.origem,
    Tags: c.tags.join(', '),
    'Valor estimado': c.valorEstimado,
    'Último contato': ultimo(tipo, c.id),
    'Próximo contato': c.proximoContato?.data ?? '',
    'Sobre o próximo': c.proximoContato?.nota ?? '',
    Arquivado: SIM_NAO(c.arquivado),
    Observações: c.observacoes,
  });
  return [
    {
      nome: 'Pessoas',
      linhas: file.pessoas.map((p) => ({
        Nome: p.nome,
        Apelido: p.apelido,
        CPF: p.cpf,
        RG: p.rg,
        Nascimento: p.nascimento ?? '',
        Empresa: p.empresaId ? (empresas.get(p.empresaId) ?? '') : '',
        Cargo: p.cargo,
        ...comuns(p, 'pessoa'),
        // Leads por API: como e quando chegou, com a pontuação.
        'Chegou pelo formulário em': p.entrada ? p.entrada.recebidoEm.replace('T', ' ') : '',
        Canal: p.entrada ? (p.entrada.canal === 'nuvem' ? 'Caixa na nuvem' : 'Servidor local') : '',
        Formulário: p.entrada?.formulario ?? '',
        Página: p.entrada?.pagina ?? '',
        Pontuação: p.entrada?.pontos,
        Faixa: p.entrada ? (FAIXAS_LEAD.find((f) => f.id === p.entrada!.faixa)?.rotulo ?? '') : '',
        'Motivos da pontuação': p.entrada?.motivos.join('; ') ?? '',
        'UTM source': p.entrada?.utm.source ?? '',
        'UTM medium': p.entrada?.utm.medium ?? '',
        'UTM campaign': p.entrada?.utm.campaign ?? '',
        'UTM term': p.entrada?.utm.term ?? '',
        'UTM content': p.entrada?.utm.content ?? '',
        Interesse: p.entrada?.interesse ?? '',
        'Voltou pelo formulário': p.entrada ? p.entrada.retornos : undefined,
      })),
    },
    {
      nome: 'Empresas',
      linhas: file.empresas.map((e) => ({
        'Razão social': e.razaoSocial,
        'Nome fantasia': e.nomeFantasia,
        CNPJ: e.cnpj,
        'Inscrição estadual': e.inscricaoEstadual,
        Segmento: e.segmento,
        Pessoas: file.pessoas.filter((p) => p.empresaId === e.id).length,
        ...comuns(e, 'empresa'),
      })),
    },
    {
      nome: 'Contratos',
      linhas: file.contratos.map((c) => ({
        Título: c.titulo,
        Contato: c.contatoNome,
        Modelo: c.modeloNome,
        Situação: rotulo(SITUACOES_CONTRATO, c.situacao),
        'Criado em': c.criadoEm.slice(0, 10),
        'Atualizado em': c.atualizadoEm.slice(0, 10),
      })),
    },
  ];
}

/** As conversas, uma linha por mensagem (data local), e os envios para vários. */
async function abasWhatsapp(): Promise<Aba[]> {
  const [file, contatos] = await Promise.all([whatsappService.getFullFile(), contatosService.getFullFile()]);
  const nome = (ref: { tipo: 'pessoa' | 'empresa'; id: string } | undefined): string => {
    const c = ref ? acharContato(contatos, ref) : undefined;
    return c ? nomeDoContato(c) : '';
  };
  const local = (iso: string): string => {
    const d = new Date(iso);
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return [
    {
      nome: 'Mensagens',
      linhas: file.mensagens.map((m) => ({
        Quando: local(m.criadaEm),
        Contato: nome(m.contato) || m.nomePerfil || '',
        Número: formatarNumeroWa(m.numero),
        Direção: m.direcao === 'saida' ? 'Enviada' : 'Recebida',
        Texto: m.texto,
        Caminho: rotulo(PROVEDORES_WHATSAPP, m.provedor),
        Situação: rotulo(STATUS_MENSAGEM_WA, m.status),
        Modelo: m.modelo?.nome ?? '',
        Erro: m.erro ?? '',
      })),
    },
    {
      nome: 'Envios para vários',
      linhas: file.lotes.flatMap((l) =>
        l.destinos.map((d) => ({
          Envio: l.nome,
          'Criado em': local(l.criadoEm),
          Situação: rotulo(SITUACOES_LOTE, l.situacao),
          Contato: d.nome,
          Número: formatarNumeroWa(d.numero),
          Resultado: d.situacao === 'pendente' ? 'Na fila' : d.situacao === 'enviado' ? 'Enviado' : d.situacao === 'falhou' ? 'Não saiu' : 'Pulado',
          Motivo: d.motivo ?? '',
        })),
      ),
    },
  ];
}

const GERADORES: Partial<Record<ModuloExportavel, () => Promise<Aba[]>>> = {
  contatos: abasContatos,
  whatsapp: abasWhatsapp,
  kanban: abasKanban,
  todo: abasTodo,
  postagens: abasPostagens,
  roteiros: abasRoteiros,
  trafego: abasTrafego,
};

export function temPlanilha(modulo: ModuloExportavel): boolean {
  return modulo in GERADORES;
}

export async function gerarPlanilha(modulo: ModuloExportavel): Promise<Buffer> {
  const gerar = GERADORES[modulo];
  if (!gerar) throw new Error('Este módulo não tem versão em planilha.');
  const X = XLSX();
  const livro = X.utils.book_new();
  (await gerar()).forEach((aba) => {
    // Aba vazia ainda mostra os títulos: "não tem nada" fica claro em vez de parecer erro.
    const folha = aba.linhas.length ? X.utils.json_to_sheet(aba.linhas) : X.utils.aoa_to_sheet([['Nada por aqui ainda']]);
    const colunas = aba.linhas.length ? Object.keys(aba.linhas[0]!) : ['x'];
    folha['!cols'] = colunas.map((c) => ({
      wch: Math.min(60, Math.max(c.length, ...aba.linhas.slice(0, 200).map((l) => String(l[c] ?? '').split('\n')[0]!.length)) + 2),
    }));
    X.utils.book_append_sheet(livro, folha, aba.nome.slice(0, 31));
  });
  return X.write(livro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
