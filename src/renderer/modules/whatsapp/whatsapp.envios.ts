import { hojeLocal } from '../../../shared/types/brasil.js';
import { camposDoTexto } from '../../../shared/types/contratos.campos.js';
import { ehPessoa, nomeDoContato, refDe, type ContatosFile, type EmpresaCrm, type Pessoa, type RefContato } from '../../../shared/types/contatos.types.js';
import type { PerfilUsuario } from '../../../shared/types/ajustes.types.js';
import { camposFaltando, corpoDoTemplate, ehCampoAutomaticoWa, textoFinalWa, valoresWa, type ContextoWa } from '../../../shared/types/whatsapp.campos.js';
import { formatarNumeroWa, numeroDoContato } from '../../../shared/types/whatsapp.numero.js';
import { SITUACOES_LOTE, descritorProvedor, rotuloDoStatus, type LoteWa, type ProvedorWa } from '../../../shared/types/whatsapp.types.js';
import { openConfirmModal } from '../../ui/modal.js';
import { buildBotao, buildSelo, type Tom } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { cartao } from '../api-leads/api-leads.pecas.js';
import { buildAvatar, el } from '../contatos/contatos.ui.js';
import { provedoresProntos } from './whatsapp.composer.js';
import { ICONES_WA, formatarWa } from './whatsapp.ui.js';
import * as whatsappState from './whatsapp.state.js';
import type { CtxWa } from './whatsapp.view.js';

/**
 * Envio para vários: montar a lista (filtros + marcar/desmarcar), escrever ou
 * escolher o modelo, ver três destinatários reais na prévia e começar. Os
 * envios em andamento ficam embaixo, com o resultado de cada contato.
 */

interface Form {
  nome: string;
  texto: string;
  modeloId: string;
  etapas: Set<string>;
  tag: string;
  busca: string;
  /** Desmarcados à mão (o resto do filtro vai). */
  fora: Set<string>;
  provedor?: ProvedorWa;
}

const form: Form = { nome: '', texto: '', modeloId: '', etapas: new Set(), tag: '', busca: '', fora: new Set() };
let perfil: PerfilUsuario | null = null;
let abertos = new Set<string>();

function chave(ref: RefContato): string {
  return `${ref.tipo}:${ref.id}`;
}

function semAcento(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

interface Candidato {
  ref: RefContato;
  c: Pessoa | EmpresaCrm;
  numero?: string;
  /** Por que não entra (sem número, pediu para não receber). */
  impedimento?: string;
}

function candidatos(contatos: ContatosFile): Candidato[] {
  const q = semAcento(form.busca.trim());
  return [...contatos.pessoas, ...contatos.empresas]
    .filter((c) => !c.arquivado)
    .filter((c) => !form.etapas.size || form.etapas.has(c.etapaId))
    .filter((c) => !form.tag || c.tags.includes(form.tag))
    .filter((c) => !q || semAcento(nomeDoContato(c)).includes(q))
    .sort((a, b) => nomeDoContato(a).localeCompare(nomeDoContato(b), 'pt-BR'))
    .map((c) => {
      const numero = numeroDoContato(c);
      const impedimento = c.naoEnviarWhatsapp ? 'pediu para não receber' : !numero ? 'sem celular/WhatsApp' : undefined;
      return { ref: refDe(c), c, ...(numero ? { numero } : {}), ...(impedimento ? { impedimento } : {}) };
    });
}

function contexto(contatos: ContatosFile, c: Pessoa | EmpresaCrm): ContextoWa | undefined {
  if (!perfil) return undefined;
  const empresaDaPessoa = ehPessoa(c) && c.empresaId ? contatos.empresas.find((e) => e.id === c.empresaId) : undefined;
  const agora = new Date();
  return { contato: c, ...(empresaDaPessoa ? { empresaDaPessoa } : {}), perfil, hoje: hojeLocal(agora), hora: agora.getHours() };
}

function rotular(rotulo: string, controle: HTMLElement): HTMLElement {
  const l = el('label', 'wa-rotulado');
  l.append(el('span', 'cf-rotulo', rotulo), controle);
  return l;
}

function buildNovo(ctx: CtxWa): HTMLElement {
  const { cartao: c, corpo } = cartao('novo-envio', ICONES_WA.lote, 'Novo envio', 'Um contato por vez, com intervalo sorteado entre as mensagens (Conexão › Limites de envio).');
  const prontos = provedoresProntos(whatsappState.statusAtual()).filter((p) => descritorProvedor(p).lote);
  if (!prontos.length) {
    corpo.appendChild(
      el('p', 'cf-dica', 'Envio para vários precisa de um caminho que envie direto: API oficial, Evolution, WAHA ou n8n. "Abrir no WhatsApp" abriria uma janela por contato.'),
    );
    const ir = buildBotao('Abrir a Conexão', { variante: 'primario', icone: ICONES_WA.conexao });
    ir.addEventListener('click', () => ctx.irPara('conexao'));
    corpo.appendChild(ir);
    return c;
  }
  const provedor = form.provedor && prontos.includes(form.provedor) ? form.provedor : prontos.includes(ctx.wa.config.provedor) ? ctx.wa.config.provedor : prontos[0]!;

  // ----- Quem recebe -----
  const filtros = el('div', 'wa-envio-filtros');
  const etapas = el('div', 'wa-pilulas');
  ctx.contatos.etapas.forEach((e) => {
    const b = el('button', `md-pilula${form.etapas.has(e.id) ? ' is-ativa' : ''}`, e.nome);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(form.etapas.has(e.id)));
    b.addEventListener('click', () => {
      if (form.etapas.has(e.id)) form.etapas.delete(e.id);
      else form.etapas.add(e.id);
      ctx.redesenhar();
    });
    etapas.appendChild(b);
  });
  filtros.appendChild(rotular('Etapas do funil', etapas));
  const tags = [...new Set([...ctx.contatos.pessoas, ...ctx.contatos.empresas].flatMap((x) => x.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (tags.length) {
    const tag = el('select', 'wa-composer-select');
    tag.appendChild(Object.assign(el('option'), { value: '', textContent: 'Qualquer tag' }));
    tags.forEach((t) => tag.appendChild(Object.assign(el('option'), { value: t, textContent: t })));
    tag.value = form.tag;
    tag.addEventListener('change', () => {
      form.tag = tag.value;
      ctx.redesenhar();
    });
    filtros.appendChild(rotular('Tag', tag));
  }
  const busca = el('input', 'cf-entrada is-caixa');
  busca.type = 'search';
  busca.placeholder = 'Filtrar por nome';
  busca.value = form.busca;
  busca.setAttribute('aria-label', 'Filtrar por nome');
  busca.addEventListener('change', () => {
    form.busca = busca.value;
    ctx.redesenhar();
  });
  filtros.appendChild(rotular('Nome', busca));
  corpo.appendChild(filtros);

  const todos = candidatos(ctx.contatos);
  const aptos = todos.filter((x) => !x.impedimento);
  const marcados = aptos.filter((x) => !form.fora.has(chave(x.ref)));
  const lista = el('div', 'wa-envio-lista');
  const cabLista = el('div', 'wa-envio-lista-cab');
  cabLista.appendChild(el('span', undefined, `${marcados.length} de ${todos.length} ${todos.length === 1 ? 'contato' : 'contatos'} vão receber`));
  const todosBtn = el('button', 'ct-link', marcados.length === aptos.length ? 'Desmarcar todos' : 'Marcar todos');
  todosBtn.type = 'button';
  todosBtn.addEventListener('click', () => {
    if (marcados.length === aptos.length) aptos.forEach((x) => form.fora.add(chave(x.ref)));
    else aptos.forEach((x) => form.fora.delete(chave(x.ref)));
    ctx.redesenhar();
  });
  cabLista.appendChild(todosBtn);
  lista.appendChild(cabLista);
  const linhas = el('div', 'wa-envio-linhas');
  todos.forEach((x) => {
    const l = el('label', `wa-envio-linha${x.impedimento ? ' is-impedido' : ''}`);
    const caixa = el('input');
    caixa.type = 'checkbox';
    caixa.disabled = Boolean(x.impedimento);
    caixa.checked = !x.impedimento && !form.fora.has(chave(x.ref));
    caixa.addEventListener('change', () => {
      if (caixa.checked) form.fora.delete(chave(x.ref));
      else form.fora.add(chave(x.ref));
      ctx.redesenhar();
    });
    l.append(caixa, buildAvatar(x.c, 'p'), el('span', 'wa-envio-nome', nomeDoContato(x.c)), el('span', 'wa-envio-numero', x.impedimento ?? formatarNumeroWa(x.numero!)));
    linhas.appendChild(l);
  });
  if (!todos.length) linhas.appendChild(el('p', 'cf-vazio', 'Nenhum contato com esses filtros.'));
  lista.appendChild(linhas);
  corpo.appendChild(lista);

  // ----- O que vai -----
  const modelos = [...ctx.wa.modelos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const modelo = modelos.find((m) => m.id === form.modeloId);
  const escolha = el('select', 'wa-composer-select');
  escolha.appendChild(Object.assign(el('option'), { value: '', textContent: 'Escrever aqui' }));
  modelos.forEach((m) => escolha.appendChild(Object.assign(el('option'), { value: m.id, textContent: `${m.nome}${m.metaTemplate ? ' (template da Meta)' : ''}` })));
  escolha.value = form.modeloId;
  escolha.addEventListener('change', () => {
    form.modeloId = escolha.value;
    const m = modelos.find((x) => x.id === escolha.value);
    if (m) form.texto = m.texto;
    ctx.redesenhar();
  });
  corpo.appendChild(rotular('Mensagem', escolha));
  const texto = el('textarea', 'cf-entrada is-caixa wa-modelo-texto');
  texto.rows = 5;
  texto.value = form.texto;
  texto.placeholder = '{saudacao}, {como_chamar}! …';
  texto.setAttribute('aria-label', 'Texto da mensagem');
  texto.disabled = provedor === 'meta' && Boolean(modelo?.metaTemplate);
  corpo.appendChild(texto);

  // ----- Prévia com 3 destinatários reais -----
  const previa = el('div', 'wa-envio-previa');
  const desenharPrevia = (): void => {
    previa.replaceChildren();
    const amostra = marcados.slice(0, 3);
    if (!amostra.length || (!form.texto.trim() && !modelo?.metaTemplate)) return;
    previa.appendChild(el('span', 'wa-composer-rotulo', `Vai sair assim (${amostra.length === 1 ? 'o primeiro' : `os ${amostra.length} primeiros`})`));
    amostra.forEach((x) => {
      const cx = contexto(ctx.contatos, x.c);
      if (!cx) return;
      const final = provedor === 'meta' && modelo?.metaTemplate ? corpoDoTemplate(modelo.metaTemplate, cx).texto : textoFinalWa(form.texto, cx);
      const faltando = camposFaltando(final);
      const item = el('div', 'wa-envio-previa-item');
      item.appendChild(el('strong', undefined, nomeDoContato(x.c)));
      const bolha = el('div', 'wa-bolha is-saida is-previa');
      const p = el('p', 'wa-bolha-texto');
      p.appendChild(formatarWa(final));
      bolha.appendChild(p);
      item.appendChild(bolha);
      if (faltando.length) item.appendChild(el('span', 'cf-aviso', `Sem ${faltando.map((f) => `{${f}}`).join(', ')} no cadastro: este contato será pulado.`));
      previa.appendChild(item);
    });
  };
  texto.addEventListener('input', () => {
    form.texto = texto.value;
    desenharPrevia();
    conferir();
  });
  corpo.appendChild(previa);

  // ----- Começar -----
  const rodape = el('div', 'wa-envio-rodape');
  const por = el('select', 'wa-composer-select');
  por.setAttribute('aria-label', 'Enviar por');
  prontos.forEach((p) => por.appendChild(Object.assign(el('option'), { value: p, textContent: descritorProvedor(p).rotulo })));
  por.value = provedor;
  por.addEventListener('change', () => {
    form.provedor = por.value as ProvedorWa;
    ctx.redesenhar();
  });
  const media = (ctx.wa.config.envio.intervaloMinSeg + ctx.wa.config.envio.intervaloMaxSeg) / 2;
  const minutos = Math.ceil((marcados.length * media) / 60);
  const estimativa = el('span', 'cf-dica', marcados.length ? `Cerca de ${minutos < 60 ? `${minutos} min` : `${(minutos / 60).toFixed(1).replace('.', ',')} h`} (${ctx.wa.config.envio.horarioDe}–${ctx.wa.config.envio.horarioAte}, até ${ctx.wa.config.envio.limiteDiario} por dia)` : '');
  const motivo = el('span', 'wa-composer-motivo');
  const comecar = buildBotao('Começar envio', { variante: 'primario', icone: ICONES_WA.enviar });
  rodape.append(rotular('Enviar por', por), estimativa, el('span', 'ct-espaco'), comecar);
  corpo.append(rodape, motivo);

  function conferir(): void {
    let m = '';
    const auto = marcados[0] && contexto(ctx.contatos, marcados[0].c);
    const corpos = provedor === 'meta' && modelo?.metaTemplate ? modelo.metaTemplate.variaveis : [form.texto];
    const manuais = auto ? [...new Set(corpos.flatMap(camposDoTexto))].filter((k) => !ehCampoAutomaticoWa(k, valoresWa(auto))) : [];
    if (!marcados.length) m = 'Marque pelo menos um contato.';
    else if (provedor === 'meta' && !modelo?.metaTemplate) m = 'Pela API oficial, escolha um modelo ligado a template da Meta.';
    else if (!form.texto.trim() && !modelo?.metaTemplate) m = 'Escreva a mensagem.';
    else if (manuais.length) m = `Envio para vários só usa campos do cadastro: tire ${manuais.map((k) => `{${k}}`).join(', ')}.`;
    motivo.textContent = m;
    comecar.disabled = Boolean(m);
  }

  comecar.addEventListener('click', () => {
    void openConfirmModal({
      title: 'Começar o envio',
      message: `${marcados.length} ${marcados.length === 1 ? 'mensagem' : 'mensagens'} por ${descritorProvedor(provedor).rotulo}, uma a cada ${ctx.wa.config.envio.intervaloMinSeg}–${ctx.wa.config.envio.intervaloMaxSeg} s. Dá para pausar ou cancelar a qualquer momento.${provedor === 'evolution' || provedor === 'waha' ? '\n\nLembrete: em caminho não oficial, mandar para quem não te conhece pode levar ao bloqueio do número.' : ''}`,
      confirmText: 'Começar',
    }).then((ok) => {
      if (!ok) return;
      comecar.disabled = true;
      void whatsappState
        .criarLote({ nome: form.nome || `Envio de ${new Date().toLocaleDateString('pt-BR')}`, texto: form.texto, ...(form.modeloId ? { modeloId: form.modeloId } : {}), contatos: marcados.map((x) => x.ref), provedor })
        .then(() => {
          form.texto = '';
          form.modeloId = '';
          form.fora.clear();
          mostrarToast('Envio começou. Acompanhe embaixo.', [], 3500);
        })
        .catch((e: unknown) => {
          comecar.disabled = false;
          ctx.falhou(e);
        });
    });
  });

  desenharPrevia();
  conferir();
  if (!perfil)
    void window.irisAPI.ajustes.getAjustes().then((r) => {
      if (r.ok) {
        perfil = r.data.perfil;
        desenharPrevia();
        conferir();
      }
    });
  return c;
}

const TOM_LOTE: Record<LoteWa['situacao'], Tom> = { rodando: 'atencao', pausado: 'neutro', concluido: 'ok', cancelado: 'erro' };

function buildLote(ctx: CtxWa, l: LoteWa): HTMLElement {
  const c = el('section', 'la-cartao wa-lote');
  const cab = el('header', 'la-cab');
  const textos = el('div', 'la-cab-textos');
  textos.appendChild(el('h3', undefined, l.nome));
  const enviados = l.destinos.filter((d) => d.situacao === 'enviado').length;
  const pulados = l.destinos.filter((d) => d.situacao === 'pulado').length;
  const falharam = l.destinos.filter((d) => d.situacao === 'falhou').length;
  const pendentes = l.destinos.filter((d) => d.situacao === 'pendente').length;
  textos.appendChild(
    el(
      'p',
      undefined,
      [`${enviados} de ${l.destinos.length} enviados`, pulados ? `${pulados} pulados` : '', falharam ? `${falharam} não saíram` : '', `por ${descritorProvedor(l.provedor).rotulo}`, l.modelo ? `modelo "${l.modelo.nome}"` : '']
        .filter(Boolean)
        .join(' · '),
    ),
  );
  cab.append(textos, buildSelo(SITUACOES_LOTE.find((s) => s.id === l.situacao)?.rotulo ?? l.situacao, TOM_LOTE[l.situacao]));
  c.appendChild(cab);
  const corpo = el('div', 'la-corpo');
  const barra = el('div', 'wa-progresso');
  barra.setAttribute('role', 'progressbar');
  barra.setAttribute('aria-valuemin', '0');
  barra.setAttribute('aria-valuemax', String(l.destinos.length));
  barra.setAttribute('aria-valuenow', String(l.destinos.length - pendentes));
  const feito = el('span', 'wa-progresso-feito');
  feito.style.width = `${l.destinos.length ? ((l.destinos.length - pendentes) / l.destinos.length) * 100 : 0}%`;
  barra.appendChild(feito);
  corpo.appendChild(barra);
  if (l.situacao === 'rodando') {
    const cfg = ctx.wa.config.envio;
    const agora = new Date();
    const hora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
    const hoje = ctx.wa.mensagens.filter((m) => m.direcao === 'saida' && m.provedor !== 'link' && hojeLocal(new Date(m.criadaEm)) === hojeLocal()).length;
    const espera =
      hora < cfg.horarioDe || hora >= cfg.horarioAte
        ? `Esperando o horário de envio (${cfg.horarioDe}–${cfg.horarioAte}).`
        : hoje >= cfg.limiteDiario
          ? `Limite do dia atingido (${cfg.limiteDiario}); continua amanhã.`
          : l.proximoEnvioEm
            ? `Próxima mensagem por volta das ${new Date(Math.max(l.proximoEnvioEm, Date.now())).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`
            : '';
    if (espera) corpo.appendChild(el('p', 'cf-dica', espera));
  }
  const acoes = el('div', 'wa-modelo-acoes');
  const acao = (rotulo: string, a: 'pausar' | 'retomar' | 'cancelar' | 'excluir', variante: 'primario' | 'secundario' | 'fantasma' = 'secundario'): void => {
    const b = buildBotao(rotulo, { variante });
    b.addEventListener('click', () => {
      const confirmar = a === 'cancelar' ? openConfirmModal({ title: 'Cancelar o envio', message: 'Os contatos que ainda não receberam ficam de fora. O que já saiu não volta.', confirmText: 'Cancelar envio' }) : Promise.resolve(true);
      void confirmar.then((ok) => {
        if (ok) void whatsappState.mudarLote(l.id, a).catch(ctx.falhou);
      });
    });
    acoes.appendChild(b);
  };
  if (l.situacao === 'rodando') acao('Pausar', 'pausar');
  if (l.situacao === 'pausado') acao('Retomar', 'retomar', 'primario');
  if (l.situacao === 'rodando' || l.situacao === 'pausado') acao('Cancelar', 'cancelar', 'fantasma');
  if (l.situacao === 'concluido' || l.situacao === 'cancelado') acao('Tirar da lista', 'excluir', 'fantasma');
  corpo.appendChild(acoes);

  const detalhes = el('details', 'wa-lote-detalhes');
  detalhes.open = abertos.has(l.id);
  detalhes.addEventListener('toggle', () => {
    if (detalhes.open) abertos.add(l.id);
    else abertos.delete(l.id);
  });
  detalhes.appendChild(el('summary', undefined, 'Cada contato'));
  const mensagens = new Map(ctx.wa.mensagens.filter((m) => m.loteId === l.id).map((m) => [m.id, m]));
  l.destinos.forEach((d) => {
    const linha = el('div', 'wa-envio-linha');
    const m = d.mensagemId ? mensagens.get(d.mensagemId) : undefined;
    const situacao = d.situacao === 'pendente' ? 'Na fila' : d.situacao === 'pulado' ? `Pulado: ${d.motivo ?? ''}` : d.situacao === 'falhou' ? `Não saiu: ${d.motivo ?? ''}` : m ? rotuloDoStatus(m.status) : 'Enviado';
    linha.append(el('span', 'wa-envio-nome', d.nome), el('span', 'wa-envio-numero', d.numero ? formatarNumeroWa(d.numero) : '—'), el('span', `wa-envio-situacao is-${d.situacao}`, situacao));
    detalhes.appendChild(linha);
  });
  corpo.appendChild(detalhes);
  c.appendChild(corpo);
  return c;
}

export function buildEnvios(ctx: CtxWa): HTMLElement[] {
  abertos = new Set([...abertos].filter((id) => ctx.wa.lotes.some((l) => l.id === id)));
  const partes: HTMLElement[] = [buildNovo(ctx)];
  const lotes = [...ctx.wa.lotes].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  if (lotes.length) {
    partes.push(el('h3', 'wa-subtitulo', 'Envios'));
    lotes.forEach((l) => partes.push(buildLote(ctx, l)));
  }
  return partes;
}
