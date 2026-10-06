import { nativeImage } from 'electron';
import { randomUUID } from 'node:crypto';
import { broadcast } from '../../core/broadcast';
import {
  FORMATOS_IMAGEM_IA,
  formatoIaDe,
  isProvedorId,
  type GerarImagemInput,
  type PedidoTexto,
  type RespostaTexto,
  type TarefaIa,
} from '../../../shared/types/ia.types';
import * as galeria from './ia.galeria';
import { extrairJson, lerCard, lerItens, lerVariantes, limparTexto, montarPrompt, montarPromptDeImagem } from './ia.prompts';
import { carregar } from './ia.referencias';
import { resolver } from './ia.service';

/**
 * Execução: texto (resposta direta, alguns segundos) e imagem (tarefa em
 * segundo plano, 30–90 s). A tarefa de imagem devolve o id na hora e empurra
 * 'ia:tarefa' a cada mudança — a tela acompanha mesmo se o usuário sair e
 * voltar ao Estúdio.
 */

// ---------- Texto ----------

/**
 * Teto de resposta por tarefa: folgado para modelos que "pensam" antes de
 * responder (o raciocínio conta no mesmo teto), mas longe do máximo do modelo,
 * que o OpenRouter reservaria no saldo.
 */
function tetoDe(tarefa: PedidoTexto['tarefa']): number {
  if (tarefa === 'roteiro-rascunho' || tarefa === 'roteiro-revisar' || tarefa === 'roteiro-adaptar') return 12_000;
  if (tarefa === 'roteiro-critica' || tarefa === 'roteiro-cena') return 6_000;
  return 4_096;
}

export async function gerarTexto(pedido: PedidoTexto): Promise<RespostaTexto> {
  const refs = pedido.contexto.referencias ?? [];
  // Com imagem junto, o provedor de texto precisa ler imagem (todos os nossos leem).
  const provedor = resolver(refs.length ? 'visao' : 'texto', { provedor: isProvedorId(pedido.provedor) ? pedido.provedor : undefined });
  const prompt = montarPrompt(pedido.tarefa, pedido.contexto);
  const imagens = refs.length ? await carregar(refs) : [];
  const bruto = await provedor.adaptador.gerarTexto(provedor.ctx, {
    modelo: provedor.modelo,
    sistema: prompt.sistema,
    texto: prompt.texto,
    imagens,
    maxTokens: tetoDe(pedido.tarefa),
  });
  const quem = { provedor: provedor.id, modelo: provedor.modelo };
  if (prompt.saida === 'variantes') return { variantes: lerVariantes(bruto), ...quem };
  if (prompt.saida === 'itens') return { itens: lerItens(bruto), ...quem };
  if (prompt.saida === 'json') return { json: extrairJson(bruto), ...quem };
  if (prompt.saida === 'card') {
    const card = lerCard(bruto);
    return { texto: card.descricao, itens: card.itens, ...quem };
  }
  return { texto: limparTexto(bruto), ...quem };
}

// ---------- Imagem ----------

interface Execucao {
  tarefa: TarefaIa;
  controle: AbortController;
}

/** As tarefas da sessão, mais recente primeiro; as antigas saem da lista. */
const execucoes: Execucao[] = [];
const MAX_TAREFAS = 20;

function publicar(e: Execucao, parcial: Partial<TarefaIa>): void {
  e.tarefa = { ...e.tarefa, ...parcial };
  broadcast('ia:tarefa', e.tarefa);
}

/**
 * Recorta no centro para a proporção do formato e redimensiona para o tamanho
 * exato — os modelos entregam 1536×1024 quando se pede 16:9, por exemplo.
 */
function ajustarAoFormato(dados: Buffer, formatoId: string): Buffer {
  const formato = formatoIaDe(formatoId);
  const img = nativeImage.createFromBuffer(dados);
  if (img.isEmpty()) return dados;
  const { width, height } = img.getSize();
  const alvo = formato.largura / formato.altura;
  let corte = { x: 0, y: 0, width, height };
  if (width / height > alvo + 0.01) {
    const w = Math.round(height * alvo);
    corte = { x: Math.round((width - w) / 2), y: 0, width: w, height };
  } else if (width / height < alvo - 0.01) {
    const h = Math.round(width / alvo);
    corte = { x: 0, y: Math.round((height - h) / 2), width, height: h };
  }
  return img.crop(corte).resize({ width: formato.largura, height: formato.altura, quality: 'best' }).toPNG();
}

export function listarTarefas(): TarefaIa[] {
  return execucoes.map((e) => e.tarefa);
}

export function gerarImagem(input: GerarImagemInput): TarefaIa {
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (!prompt) throw new Error('Descreva a imagem que você quer.');
  if (!FORMATOS_IMAGEM_IA.some((f) => f.id === input.formato)) throw new Error('Formato inválido.');
  const refs = Array.isArray(input.referencias) ? input.referencias : [];
  const modo = input.modo === 'modificar' ? 'modificar' : 'criar';
  if (modo === 'modificar' && refs.length !== 1) throw new Error('Para modificar, escolha uma imagem.');
  const quantidade = Math.min(4, Math.max(1, Math.round(Number(input.quantidade) || 1)));
  const provedor = resolver(refs.length ? 'imagemComReferencia' : 'imagem', { provedor: input.provedor, modelo: input.modelo });
  if (!provedor.adaptador.gerarImagem) throw new Error(`${provedor.rotulo} não gera imagens.`);

  const execucao: Execucao = {
    controle: new AbortController(),
    tarefa: {
      id: randomUUID(),
      situacao: 'gerando',
      prompt: modo === 'modificar' ? `Modificação: ${prompt}` : prompt,
      formato: input.formato,
      quantidade,
      provedor: provedor.id,
      modelo: provedor.modelo,
      iniciadaEm: new Date().toISOString(),
      postagem: input.postagem,
    },
  };
  execucoes.unshift(execucao);
  execucoes.splice(MAX_TAREFAS);
  publicar(execucao, {});

  const formato = formatoIaDe(input.formato);
  void (async () => {
    try {
      const referencias = await carregar(refs);
      const imagens = await provedor.adaptador.gerarImagem!(provedor.ctx, {
        modelo: provedor.modelo,
        // O pedido do usuário vai dentro do envelope de qualidade e formato.
        prompt: montarPromptDeImagem(prompt, input.formato, referencias.length > 0, modo),
        referencias,
        largura: formato.largura,
        altura: formato.altura,
        proporcao: formato.proporcao,
        quantidade,
        qualidade: input.qualidade,
        signal: execucao.controle.signal,
      });
      if (execucao.controle.signal.aborted) return;
      const itens = [];
      for (const dados of imagens.slice(0, quantidade)) {
        itens.push(
          await galeria.adicionar(ajustarAoFormato(dados, input.formato), {
            prompt: modo === 'modificar' ? `Modificação: ${prompt}` : prompt,
            provedor: provedor.id,
            modelo: provedor.modelo,
            formato: input.formato,
            referencias: referencias.map((r) => r.nome),
            postagem: input.postagem,
          }),
        );
      }
      publicar(execucao, { situacao: 'pronto', itemIds: itens.map((i) => i.id), terminadaEm: new Date().toISOString() });
    } catch (error) {
      if (execucao.controle.signal.aborted) return;
      publicar(execucao, {
        situacao: 'erro',
        erro: error instanceof Error ? error.message : String(error),
        terminadaEm: new Date().toISOString(),
      });
    }
  })();

  return execucao.tarefa;
}

export function cancelar(tarefaId: string): TarefaIa[] {
  const e = execucoes.find((x) => x.tarefa.id === tarefaId);
  if (e && e.tarefa.situacao === 'gerando') {
    e.controle.abort();
    publicar(e, { situacao: 'cancelado', terminadaEm: new Date().toISOString() });
  }
  return listarTarefas();
}

/**
 * Dispensar vale aqui, não só na tela: o Estúdio relê a lista ao ser montado,
 * e um erro dispensado só no renderer voltava a cada visita.
 */
export function dispensarTarefa(tarefaId: string): TarefaIa[] {
  const i = execucoes.findIndex((x) => x.tarefa.id === tarefaId);
  if (i >= 0 && execucoes[i]!.tarefa.situacao !== 'gerando') execucoes.splice(i, 1);
  return listarTarefas();
}

/** Tira da lista as tarefas terminadas (a galeria continua com as imagens). */
export function limparTarefas(): TarefaIa[] {
  for (let i = execucoes.length - 1; i >= 0; i--) {
    if (execucoes[i]!.tarefa.situacao !== 'gerando') execucoes.splice(i, 1);
  }
  return listarTarefas();
}
