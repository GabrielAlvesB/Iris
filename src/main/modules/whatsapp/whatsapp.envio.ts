import { randomUUID } from 'node:crypto';
import { hojeLocal, soDigitos } from '../../../shared/types/brasil';
import { acharContato, ehPessoa, nomeDoContato, refIgual, type ContatosFile, type EmpresaCrm, type Pessoa, type RefContato } from '../../../shared/types/contatos.types';
import { broadcast } from '../../core/broadcast';
import { camposFaltando, corpoDoTemplate, textoFinalWa, type ContextoWa as ContextoCampos } from '../../../shared/types/whatsapp.campos';
import { preencher } from '../../../shared/types/contratos.campos';
import { numeroDoContato, numeroWhatsapp } from '../../../shared/types/whatsapp.numero';
import {
  LIMITE_TEXTO_WA,
  descritorProvedor,
  dentroDaJanela,
  isProvedorWa,
  statusSeguinte,
  type EnviarWaInput,
  type MensagemWa,
  type ModeloMetaWa,
  type ProvedorWa,
  type WhatsappFile,
} from '../../../shared/types/whatsapp.types';
import * as ajustesService from '../ajustes/ajustes.service';
import { agoraLocal, isRef, loadFile as loadContatos, saveFile as saveContatos } from '../contatos/contatos.arquivo';
import { contarNaoVistos } from '../contatos/contatos.leads';
import { loadFile, nowIso, saveFile, textoExato } from './whatsapp.arquivo';
import { ADAPTADORES, abrirNoWhatsapp } from './provedores';
import { avisarMudanca, contextoDo, faltaNo } from './whatsapp.service';

/**
 * Enviar: o texto é preenchido aqui com a mesma função da prévia e conferido
 * contra o que a tela mostrou (`textoEsperado`). Se der diferente — o cadastro
 * mudou no meio, a saudação virou de "Bom dia" para "Boa tarde" —, o Iris
 * recusa em vez de mandar algo que ninguém viu.
 *
 * Duas gravações: a mensagem entra como "enviando" antes da chamada (aparece
 * na conversa na hora) e o resultado entra depois. A chamada HTTP fica fora
 * do trecho ler→gravar, que não tem `await` no meio.
 */

export function contextoDeCampos(contatos: ContatosFile, c: Pessoa | EmpresaCrm, agora = new Date()): ContextoCampos {
  const empresaDaPessoa = ehPessoa(c) && c.empresaId ? contatos.empresas.find((e) => e.id === c.empresaId) : undefined;
  return { contato: c, ...(empresaDaPessoa ? { empresaDaPessoa } : {}), perfil: ajustesService.getPerfil(), hoje: hojeLocal(agora), hora: agora.getHours() };
}

/** Envios diretos (não o "abrir no WhatsApp") de hoje, no relógio local: a conta do limite diário. */
export function enviadosHoje(file: WhatsappFile): number {
  const hoje = hojeLocal();
  return file.mensagens.filter((m) => m.direcao === 'saida' && m.provedor !== 'link' && hojeLocal(new Date(m.criadaEm)) === hoje).length;
}

export interface PedidoEnvio {
  /** O lote já sabe o id antes de enviar (grava no destino primeiro). */
  id?: string;
  contato?: RefContato;
  numero: string;
  texto: string;
  provedor: ProvedorWa;
  modelo?: MensagemWa['modelo'];
  template?: { meta: ModeloMetaWa; parametros: string[] };
  loteId?: string;
}

export interface ResultadoEnvio {
  file: WhatsappFile;
  mensagemId: string;
  ok: boolean;
  erro?: string;
}

/** Grava como "enviando", chama o provedor e grava o resultado. Nunca lança depois de gravar: a falha fica na mensagem. */
export async function enviarAgora(p: PedidoEnvio): Promise<ResultadoEnvio> {
  const id = p.id ?? randomUUID();
  const agora = nowIso();
  const link = p.provedor === 'link';
  const nova: MensagemWa = {
    id,
    ...(p.contato ? { contato: { ...p.contato } } : {}),
    numero: p.numero,
    direcao: 'saida',
    texto: p.texto,
    provedor: p.provedor,
    status: link ? 'aberta-no-whatsapp' : 'enviando',
    ...(p.modelo ? { modelo: p.modelo } : {}),
    ...(p.loteId ? { loteId: p.loteId } : {}),
    vista: true,
    criadaEm: agora,
    statusEm: agora,
  };
  const file = loadFile();
  file.mensagens.push(nova);
  await saveFile(file);
  avisarMudanca(file, p.contato);

  if (link) {
    try {
      await abrirNoWhatsapp(p.numero, p.texto, file.config.link.abrirEm);
      if (p.contato) await anotarNoHistorico(p.contato, file).catch((erro: unknown) => console.error('[whatsapp] histórico do contato', erro));
      return { file, mensagemId: id, ok: true };
    } catch (erro) {
      return registrarResultado(id, p.contato, { erro: `Não deu para abrir o WhatsApp: ${erro instanceof Error ? erro.message : String(erro)}` });
    }
  }

  try {
    const adaptador = ADAPTADORES[p.provedor];
    const ctx = contextoDo(p.provedor);
    const enviado = p.template
      ? await adaptador.enviarTemplate!(ctx, p.numero, p.template.meta, p.template.parametros)
      : await adaptador.enviarTexto(ctx, p.numero, p.texto);
    return registrarResultado(id, p.contato, { ...(enviado.idExterno ? { idExterno: enviado.idExterno } : {}) });
  } catch (erro) {
    return registrarResultado(id, p.contato, { erro: erro instanceof Error ? erro.message : String(erro) });
  }
}

function registrarResultado(id: string, contato: RefContato | undefined, r: { idExterno?: string; erro?: string }): Promise<ResultadoEnvio> {
  const file = loadFile();
  const m = file.mensagens.find((x) => x.id === id);
  if (m) {
    if (r.erro) {
      m.status = 'falhou';
      m.erro = r.erro;
    } else {
      // O webhook pode ter chegado antes da resposta (eco da Evolution, "entregue" rápido): só avança.
      if (r.idExterno && !m.idExterno) m.idExterno = r.idExterno;
      m.status = statusSeguinte(m.status, 'enviada');
      delete m.erro;
    }
    m.statusEm = nowIso();
  }
  return saveFile(file).then(async () => {
    avisarMudanca(file, contato);
    if (!r.erro && contato) await anotarNoHistorico(contato, file).catch((erro: unknown) => console.error('[whatsapp] histórico do contato', erro));
    return { file, mensagemId: id, ok: !r.erro, ...(r.erro ? { erro: r.erro } : {}) };
  });
}

/**
 * Um registro por contato por dia no histórico de Contatos ("WhatsApp: 3
 * mensagens enviadas"), escrito quando o Iris envia. É o que faz o WhatsApp contar como contato
 * feito em todo lugar que já lê o histórico: último contato, "Sem resposta"
 * dos leads, a planilha e o PDF da ficha. A hora fica a da primeira do dia —
 * é ela que mede o tempo até o primeiro contato de um lead.
 */
async function anotarNoHistorico(ref: RefContato, wa: WhatsappFile): Promise<void> {
  const contatos = loadContatos();
  if (!acharContato(contatos, ref)) return;
  const hoje = hojeLocal();
  const doDia = wa.mensagens.filter(
    (m) => m.direcao === 'saida' && m.contato && refIgual(m.contato, ref) && (m.status === 'enviada' || m.status === 'entregue' || m.status === 'lida' || m.status === 'aberta-no-whatsapp') && hojeLocal(new Date(m.criadaEm)) === hoje,
  ).length;
  if (!doDia) return;
  // Conta tudo o que saiu no dia (inclusive pelo celular, que o webhook traz): é o contato feito.
  const texto = doDia === 1 ? 'WhatsApp: 1 mensagem enviada' : `WhatsApp: ${doDia} mensagens enviadas`;
  const existente = contatos.interacoes.find((i) => i.tipo === 'whatsapp-iris' && refIgual(i.contato, ref) && i.data.slice(0, 10) === hoje);
  if (existente?.texto === texto) return;
  if (existente) existente.texto = texto;
  else contatos.interacoes.push({ id: randomUUID(), contato: { ...ref }, tipo: 'whatsapp-iris', data: agoraLocal(), texto, criadoEm: nowIso() });
  await saveContatos(contatos);
  broadcast('contatos:mudou', { novos: 0, naoVistos: contarNaoVistos(contatos) });
}

// ---------- Envio pela tela ----------

function exigir(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(mensagem);
}

/** Envio de uma mensagem da Conversa. Lança antes de gravar se algo não confere (a tela mostra e nada sai). */
export async function enviar(input: EnviarWaInput): Promise<ResultadoEnvio> {
  const file = loadFile();
  const provedor: ProvedorWa = isProvedorWa(input?.provedor) ? input.provedor : file.config.provedor;
  const falta = faltaNo(provedor, file);
  exigir(!falta, `${descritorProvedor(provedor).rotulo}: ${falta}`);

  const contatos = loadContatos();
  const ref = isRef(input?.contato) ? input.contato : undefined;
  const c = ref ? acharContato(contatos, ref) : undefined;
  exigir(!ref || c, 'Contato não encontrado — ele pode ter sido excluído.');
  exigir(!(c && c.naoEnviarWhatsapp), `${c ? nomeDoContato(c) : 'Este contato'} pediu para não receber mensagens (está marcado na ficha).`);

  const numeroPedido = typeof input?.numero === 'string' && soDigitos(input.numero) ? numeroWhatsapp(input.numero) : undefined;
  const numero = numeroPedido ?? (c ? numeroDoContato(c) : undefined);
  exigir(numero, c ? 'Este contato não tem celular nem WhatsApp no cadastro.' : 'Número inválido: use DDD + número.');

  const valores = input?.valores && typeof input.valores === 'object' ? Object.fromEntries(Object.entries(input.valores).filter(([, v]) => typeof v === 'string')) : {};
  const modelo = typeof input?.modeloId === 'string' ? file.modelos.find((m) => m.id === input.modeloId) : undefined;
  const ctx = c ? contextoDeCampos(contatos, c) : undefined;

  // API oficial fora das 24 h: só template aprovado — o texto livre seria recusado pela Meta.
  const usarTemplate = provedor === 'meta' && Boolean(modelo?.metaTemplate) && !(ref && dentroDaJanela(file, ref));
  let texto: string;
  let template: PedidoEnvio['template'];
  if (usarTemplate && modelo?.metaTemplate) {
    exigir(ctx, 'Modelo da Meta precisa de um contato (os campos vêm do cadastro).');
    const r = corpoDoTemplate(modelo.metaTemplate, ctx, valores);
    texto = r.texto;
    template = { meta: modelo.metaTemplate, parametros: r.parametros };
    exigir(!r.parametros.some((x) => camposFaltando(x).length || !x.trim()), 'Algum campo do modelo da Meta ficou sem valor.');
  } else {
    exigir(provedor !== 'meta' || !ref || dentroDaJanela(file, ref), 'Fora da janela de 24 h: pela API oficial, só um modelo aprovado pela Meta pode iniciar a conversa. Escolha um modelo ligado a um template, ou envie por outro caminho.');
    const bruto = textoExato(input?.texto, LIMITE_TEXTO_WA + 1);
    // Sem contato (número em "Sem cadastro") só valem os campos digitados na hora.
    texto = ctx ? textoFinalWa(bruto, ctx, valores) : preencher(bruto, valores);
  }

  exigir(texto.trim(), 'Escreva a mensagem.');
  exigir(texto.length <= LIMITE_TEXTO_WA, `A mensagem passou de ${LIMITE_TEXTO_WA} caracteres, o máximo do WhatsApp.`);
  const faltando = camposFaltando(texto);
  exigir(!faltando.length, `Preencha ${faltando.map((x) => `{${x}}`).join(', ')} antes de enviar.`);
  exigir(
    texto === textoExato(input?.textoEsperado, LIMITE_TEXTO_WA + 1),
    'A mensagem mudou entre a prévia e o envio (o cadastro ou a hora mudou um campo). Confira a prévia e envie de novo.',
  );

  return enviarAgora({
    ...(ref ? { contato: ref } : {}),
    numero,
    texto,
    provedor,
    ...(modelo ? { modelo: { id: modelo.id, nome: modelo.nome, ...(template ? { template: template.meta.nome } : {}) } } : {}),
    ...(template ? { template } : {}),
  });
}

/** "Tentar de novo" numa que não saiu: o mesmo texto, pelo mesmo caminho, como mensagem nova. */
export async function reenviar(id: unknown): Promise<ResultadoEnvio> {
  const file = loadFile();
  const m = file.mensagens.find((x) => x.id === id);
  exigir(m, 'Essa mensagem não existe mais.');
  exigir(m.direcao === 'saida' && m.status === 'falhou', 'Só dá para reenviar mensagem que não saiu.');
  exigir(!m.modelo?.template, 'Mensagem de modelo da Meta: envie de novo pelo modelo, na conversa.');
  const falta = faltaNo(m.provedor, file);
  exigir(!falta, falta ?? '');
  // A tentativa que falhou sai da conversa: fica só a nova, com o resultado dela.
  file.mensagens = file.mensagens.filter((x) => x.id !== m.id);
  await saveFile(file);
  return enviarAgora({ ...(m.contato ? { contato: m.contato } : {}), numero: m.numero, texto: m.texto, provedor: m.provedor, ...(m.modelo ? { modelo: m.modelo } : {}) });
}
