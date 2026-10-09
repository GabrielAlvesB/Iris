import { hojeLocal } from '../../../shared/types/brasil.js';
import { camposDoTexto, preencher, rotuloDoCampo } from '../../../shared/types/contratos.campos.js';
import { ehPessoa, nomeDoContato, type ContatosFile, type EmpresaCrm, type Pessoa, type RefContato } from '../../../shared/types/contatos.types.js';
import type { PerfilUsuario } from '../../../shared/types/ajustes.types.js';
import { CAMPOS_WA, camposFaltando, corpoDoTemplate, ehCampoAutomaticoWa, textoFinalWa, valoresWa, type ContextoWa } from '../../../shared/types/whatsapp.campos.js';
import { formatarNumeroWa } from '../../../shared/types/whatsapp.numero.js';
import {
  LIMITE_JANELA_META_MS,
  LIMITE_TEXTO_WA,
  PROVEDORES_WHATSAPP,
  dentroDaJanela,
  descritorProvedor,
  ultimaEntrada,
  type ModeloWa,
  type ProvedorWa,
  type StatusWhatsapp,
  type WhatsappFile,
} from '../../../shared/types/whatsapp.types.js';
import { abrirWhatsapp } from '../../core/navegacao.js';
import { abrirMenuIa, comAssistente } from '../../ui/ia.js';
import { mensagemDeErro, openConfirmModal, promptText } from '../../ui/modal.js';
import { buildBotao, svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { ICONES_WA, formatarWa, temFormatacao } from './whatsapp.ui.js';
import * as whatsappState from './whatsapp.state.js';

/**
 * Escrever e enviar uma mensagem. O que a prévia mostra é calculado com as
 * mesmas funções que o main usa para montar o texto (whatsapp.campos.ts), e o
 * pedido leva essa prévia junto: se o main chegar a outra coisa, ele recusa.
 * O que se vê é exatamente o que sai.
 *
 * O rascunho de cada conversa fica guardado enquanto o app está aberto: um
 * redesenho da ficha (mudar a etapa, um lead chegando) não apaga o que está
 * sendo escrito.
 */

export interface DestinoComposer {
  /** Chave do rascunho (contato ou número). */
  chave: string;
  contato?: { ref: RefContato; c: Pessoa | EmpresaCrm; contatos: ContatosFile };
  /** Números possíveis (já normalizados, com 55). */
  numeros: string[];
}

interface Rascunho {
  texto: string;
  manuais: Record<string, string>;
  modeloId?: string;
  numero?: string;
  provedor?: ProvedorWa;
}

const rascunhos = new Map<string, Rascunho>();
let perfil: PerfilUsuario | null = null;

function rascunhoDe(chave: string): Rascunho {
  let r = rascunhos.get(chave);
  if (!r) {
    r = { texto: '', manuais: {} };
    rascunhos.set(chave, r);
  }
  return r;
}

async function carregarPerfil(): Promise<void> {
  const r = await window.irisAPI.ajustes.getAjustes();
  if (r.ok) perfil = r.data.perfil;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Os caminhos que estão prontos agora; "Abrir no WhatsApp" sempre está. */
export function provedoresProntos(status: StatusWhatsapp | null): ProvedorWa[] {
  return PROVEDORES_WHATSAPP.map((p) => p.id).filter((id) => id === 'link' || status?.provedores[id]?.configurado);
}

// ---------- O cálculo (o mesmo do main) ----------

interface Calculo {
  provedor: ProvedorWa;
  numero?: string;
  modelo?: ModeloWa;
  /** API oficial fora da janela, com modelo ligado a template: vai o template. */
  usarTemplate: boolean;
  final: string;
  /** Campos que só quem escreve sabe ({valor}, {data_reuniao}). */
  manuais: string[];
  faltando: string[];
  /** Por que não dá para enviar agora (vazio = pode). */
  bloqueio: string;
  avisos: Array<{ tom: 'info' | 'atencao'; texto: string; acao?: { rotulo: string; fazer: () => void } }>;
}

function contextoCampos(d: DestinoComposer): ContextoWa | undefined {
  if (!d.contato || !perfil) return undefined;
  const { c, contatos } = d.contato;
  const empresaDaPessoa = ehPessoa(c) && c.empresaId ? contatos.empresas.find((e) => e.id === c.empresaId) : undefined;
  const agora = new Date();
  return { contato: c, ...(empresaDaPessoa ? { empresaDaPessoa } : {}), perfil, hoje: hojeLocal(agora), hora: agora.getHours() };
}

function calcular(d: DestinoComposer, r: Rascunho, file: WhatsappFile | null, status: StatusWhatsapp | null): Calculo {
  const prontos = provedoresProntos(status);
  const padrao = file?.config.provedor;
  const provedor: ProvedorWa = r.provedor && prontos.includes(r.provedor) ? r.provedor : padrao && prontos.includes(padrao) ? padrao : (prontos.find((p) => p !== 'link') ?? 'link');
  const numero = r.numero && d.numeros.includes(r.numero) ? r.numero : d.numeros[0];
  const modelo = r.modeloId ? file?.modelos.find((m) => m.id === r.modeloId) : undefined;
  const ref = d.contato?.ref;
  const naJanela = Boolean(file && ref && dentroDaJanela(file, ref));
  const usarTemplate = provedor === 'meta' && Boolean(modelo?.metaTemplate) && !naJanela;
  const ctx = contextoCampos(d);
  const auto = ctx ? valoresWa(ctx) : {};

  let final: string;
  let corpos: string[];
  if (usarTemplate && modelo?.metaTemplate && ctx) {
    final = corpoDoTemplate(modelo.metaTemplate, ctx, r.manuais).texto;
    corpos = modelo.metaTemplate.variaveis;
  } else {
    final = ctx ? textoFinalWa(r.texto, ctx, r.manuais) : preencher(r.texto, r.manuais);
    corpos = [r.texto];
  }
  const manuais = [...new Set(corpos.flatMap(camposDoTexto))].filter((c) => !ehCampoAutomaticoWa(c, auto));
  const faltando = camposFaltando(final);

  const avisos: Calculo['avisos'] = [];
  if (provedor === 'meta' && ref && file) {
    const ultima = ultimaEntrada(file, ref);
    if (naJanela && ultima) {
      const fecha = new Date(Date.parse(ultima.criadaEm) + LIMITE_JANELA_META_MS);
      avisos.push({ tom: 'info', texto: `Janela aberta até ${fecha.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}: dá para mandar texto livre.` });
    } else if (!usarTemplate) {
      avisos.push({
        tom: 'atencao',
        texto: 'Fora da janela de 24 h: pela API oficial, só um modelo aprovado pela Meta inicia a conversa. Escolha um modelo ligado a template, ou envie por outro caminho.',
        acao: { rotulo: 'Modelos', fazer: () => abrirWhatsapp('modelos') },
      });
    }
  }
  if (provedor === 'link') {
    const app = status?.appWhatsapp && file?.config.link.abrirEm !== 'web' ? status.appWhatsapp : 'WhatsApp Web';
    avisos.push({ tom: 'info', texto: `Abre o ${app} com este texto escrito. O último Enter é seu, lá.` });
  }

  const c = d.contato?.c;
  let bloqueio = '';
  if (c?.naoEnviarWhatsapp) bloqueio = `${nomeDoContato(c)} pediu para não receber mensagens (marcado na Visão geral).`;
  else if (!numero) bloqueio = 'Sem celular ou WhatsApp no cadastro: adicione um telefone na Visão geral.';
  else if (provedor === 'meta' && ref && !naJanela && !usarTemplate) bloqueio = 'Escolha um modelo ligado a template da Meta.';
  else if (usarTemplate && !ctx) bloqueio = 'Carregando seus dados…';
  else if (!final.trim()) bloqueio = 'Escreva a mensagem.';
  else if (final.length > LIMITE_TEXTO_WA) bloqueio = `Passou de ${LIMITE_TEXTO_WA} caracteres (o máximo do WhatsApp).`;
  else if (faltando.length) bloqueio = `Preencha ${faltando.map((x) => `{${x}}`).join(', ')}.`;

  return { provedor, ...(numero ? { numero } : {}), ...(modelo ? { modelo } : {}), usarTemplate, final, manuais, faltando, bloqueio, avisos };
}

// ---------- A tela ----------

export interface Composer {
  el: HTMLElement;
  focar(): void;
  /** O arquivo ou o status mudou: refaz avisos e prévia, sem tocar no que está sendo digitado. */
  atualizar(): void;
}

export function buildComposer(d: DestinoComposer, aoEnviar?: () => void): Composer {
  const r = rascunhoDe(d.chave);
  const raiz = el('div', 'wa-composer');
  const avisos = el('div', 'wa-composer-avisos');
  const previa = el('div', 'wa-composer-previa');
  const campos = el('div', 'wa-composer-campos');
  const erro = el('p', 'wa-composer-erro');
  erro.setAttribute('role', 'alert');
  erro.hidden = true;

  const texto = el('textarea', 'wa-composer-texto');
  texto.rows = 2;
  texto.value = r.texto;
  texto.placeholder = 'Escreva a mensagem…  *negrito*  _itálico_  ~riscado~';
  texto.setAttribute('aria-label', 'Mensagem');
  const caixa = comAssistente(texto, {
    area: 'WhatsApp',
    campo: 'Mensagem de WhatsApp para o contato',
    orientacao:
      'Uma mensagem curta de WhatsApp, em tom de conversa, em português do Brasil. Sem assunto, sem assinatura de e-mail, sem emojis em excesso. Use só o que está no material; se faltar algo (preço, data), deixe um campo entre chaves, como {valor}.',
    contexto: () => ({ referencia: referenciaParaIa(d) }),
  });
  caixa.classList.add('wa-composer-caixa');

  const barra = el('div', 'wa-composer-barra');
  const botaoModelo = buildBotao('Modelo', { variante: 'fantasma', icone: ICONES_WA.modelo, titulo: 'Usar um modelo de mensagem' });
  const botaoCampo = buildBotao('Campo', { variante: 'fantasma', icone: ICONES_WA.campo, titulo: 'Inserir um campo do cadastro ({primeiro_nome}, {empresa}…)' });
  const modeloAtivo = el('span', 'wa-composer-modelo');
  const destino = el('div', 'wa-composer-destino');
  const contador = el('span', 'wa-composer-contador');
  const motivo = el('span', 'wa-composer-motivo');
  const enviar = buildBotao('Enviar', { variante: 'primario', icone: ICONES_WA.enviar, titulo: 'Enviar (Ctrl+Enter)' });
  barra.append(botaoModelo, botaoCampo, modeloAtivo, el('span', 'ct-espaco'), destino, contador, enviar);
  raiz.append(avisos, previa, campos, caixa, erro, barra, motivo);

  let calculo = calcular(d, r, whatsappState.atual(), whatsappState.statusAtual());

  const ajustarAltura = (): void => {
    texto.style.height = 'auto';
    texto.style.height = `${Math.min(texto.scrollHeight, 240)}px`;
  };

  const desenharDestino = (): void => {
    destino.replaceChildren();
    if (d.numeros.length > 1) {
      const s = el('select', 'wa-composer-select');
      s.setAttribute('aria-label', 'Para qual número');
      d.numeros.forEach((n) => s.appendChild(Object.assign(el('option'), { value: n, textContent: formatarNumeroWa(n) })));
      s.value = calculo.numero ?? '';
      s.addEventListener('change', () => {
        r.numero = s.value;
        refazer();
      });
      destino.append(el('span', 'wa-composer-rotulo', 'Para'), s);
    } else if (calculo.numero) {
      destino.append(el('span', 'wa-composer-rotulo', 'Para'), el('span', 'wa-composer-numero', formatarNumeroWa(calculo.numero)));
    }
    const prontos = provedoresProntos(whatsappState.statusAtual());
    if (prontos.length > 1) {
      const s = el('select', 'wa-composer-select');
      s.setAttribute('aria-label', 'Enviar por');
      prontos.forEach((p) => s.appendChild(Object.assign(el('option'), { value: p, textContent: descritorProvedor(p).curto })));
      s.value = calculo.provedor;
      s.addEventListener('change', () => {
        r.provedor = s.value as ProvedorWa;
        refazer();
      });
      destino.append(el('span', 'wa-composer-rotulo', 'por'), s);
    } else {
      const config = el('button', 'ct-link', 'Conectar uma API');
      config.type = 'button';
      config.title = 'Hoje só "Abrir no WhatsApp" está pronto. Conecte a API oficial, a Evolution, o WAHA ou o n8n para enviar direto.';
      config.addEventListener('click', () => abrirWhatsapp('conexao'));
      destino.append(config);
    }
  };

  const desenharAvisos = (): void => {
    avisos.replaceChildren(
      ...calculo.avisos.map((a) => {
        const p = el('div', `wa-aviso is-${a.tom}`);
        p.innerHTML = svg(a.tom === 'atencao' ? ICONES_WA.alerta : ICONES_WA.relogio, 14, 2);
        p.appendChild(el('span', undefined, a.texto));
        if (a.acao) {
          const b = el('button', 'ct-link', a.acao.rotulo);
          b.type = 'button';
          b.addEventListener('click', a.acao.fazer);
          p.appendChild(b);
        }
        return p;
      }),
    );
  };

  const desenharCampos = (): void => {
    // Redesenhar só quando a lista de campos muda: senão o campo em digitação perderia o foco.
    const atuais = [...campos.querySelectorAll<HTMLInputElement>('input')].map((i) => i.dataset.campo).join('|');
    if (atuais === calculo.manuais.join('|')) return;
    campos.replaceChildren();
    calculo.manuais.forEach((chave) => {
      const l = el('label', 'wa-campo');
      l.appendChild(el('span', undefined, rotuloDoCampo(chave)));
      const input = el('input', 'cf-entrada is-caixa');
      input.dataset.campo = chave;
      input.value = r.manuais[chave] ?? '';
      input.placeholder = `{${chave}}`;
      input.addEventListener('input', () => {
        r.manuais[chave] = input.value;
        refazer(false);
      });
      l.appendChild(input);
      campos.appendChild(l);
    });
  };

  const desenharPrevia = (): void => {
    // A prévia aparece quando o texto final difere do digitado (campos, template) ou tem formatação.
    const mostra = calculo.final.trim() && (calculo.usarTemplate || calculo.final !== r.texto || temFormatacao(calculo.final));
    previa.replaceChildren();
    previa.hidden = !mostra;
    if (!mostra) return;
    previa.appendChild(el('span', 'wa-composer-rotulo', calculo.usarTemplate ? `Vai sair assim (modelo da Meta "${calculo.modelo?.metaTemplate?.nome}")` : 'Vai sair assim'));
    const bolha = el('div', 'wa-bolha is-saida is-previa');
    const p = el('p', 'wa-bolha-texto');
    p.appendChild(formatarWa(calculo.final));
    bolha.appendChild(p);
    previa.appendChild(bolha);
  };

  function refazer(destinoTambem = true): void {
    calculo = calcular(d, r, whatsappState.atual(), whatsappState.statusAtual());
    if (destinoTambem) desenharDestino();
    desenharAvisos();
    desenharCampos();
    desenharPrevia();
    modeloAtivo.replaceChildren();
    if (calculo.modelo) {
      modeloAtivo.appendChild(el('span', undefined, calculo.modelo.nome));
      const tirar = el('button', 'wa-composer-tirar', '×');
      tirar.type = 'button';
      tirar.title = 'Deixar de usar o modelo (o texto fica)';
      tirar.setAttribute('aria-label', 'Deixar de usar o modelo');
      tirar.addEventListener('click', () => {
        delete r.modeloId;
        refazer();
      });
      modeloAtivo.appendChild(tirar);
    }
    // Template da Meta: o texto vem do modelo aprovado, não da caixa.
    texto.disabled = calculo.usarTemplate;
    texto.classList.toggle('is-template', calculo.usarTemplate);
    contador.textContent = calculo.final.length > LIMITE_TEXTO_WA * 0.8 ? `${calculo.final.length}/${LIMITE_TEXTO_WA}` : '';
    contador.classList.toggle('is-alerta', calculo.final.length > LIMITE_TEXTO_WA);
    enviar.disabled = Boolean(calculo.bloqueio);
    enviar.title = calculo.bloqueio || 'Enviar (Ctrl+Enter)';
    const rotulo = enviar.querySelector('span');
    if (rotulo) rotulo.textContent = calculo.provedor === 'link' ? 'Abrir no WhatsApp' : 'Enviar';
    motivo.textContent = calculo.bloqueio && calculo.bloqueio !== 'Escreva a mensagem.' ? calculo.bloqueio : '';
  }

  texto.addEventListener('input', () => {
    r.texto = texto.value;
    erro.hidden = true;
    ajustarAltura();
    refazer(false);
  });
  texto.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void mandar();
    }
  });
  enviar.addEventListener('click', () => void mandar());

  botaoCampo.addEventListener('click', () =>
    abrirMenuIa(
      botaoCampo,
      CAMPOS_WA.map((c) => ({
        rotulo: c.rotulo,
        dica: `{${c.chave}}`,
        icone: ICONES_WA.campo,
        fazer: () => inserirNoCursor(`{${c.chave}}`),
      })),
      { titulo: 'Inserir campo' },
    ),
  );

  botaoModelo.addEventListener('click', () => {
    const modelos = [...(whatsappState.atual()?.modelos ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    abrirMenuIa(
      botaoModelo,
      [
        ...modelos.map((m) => ({
          rotulo: m.nome,
          dica: (m.texto || m.metaTemplate?.corpo || '').replace(/\s+/g, ' ').slice(0, 70),
          icone: ICONES_WA.modelo,
          grupo: 'Seus modelos',
          fazer: () => void usarModelo(m),
        })),
        {
          rotulo: 'Salvar este texto como modelo',
          dica: 'Para usar de novo, com os mesmos campos',
          icone: ICONES_WA.modelo,
          grupo: 'Modelos',
          fazer: () => void salvarComoModelo(),
        },
        { rotulo: 'Gerenciar modelos', dica: 'Criar, editar, ligar a templates da Meta', icone: ICONES_WA.modelo, grupo: 'Modelos', fazer: () => abrirWhatsapp('modelos') },
      ],
      { titulo: modelos.length ? 'Modelos de mensagem' : 'Nenhum modelo ainda' },
    );
  });

  function inserirNoCursor(trecho: string): void {
    if (texto.disabled) return;
    const ini = texto.selectionStart ?? texto.value.length;
    const fim = texto.selectionEnd ?? ini;
    texto.setRangeText(trecho, ini, fim, 'end');
    texto.focus();
    texto.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function usarModelo(m: ModeloWa): Promise<void> {
    if (r.texto.trim() && r.texto !== m.texto) {
      const ok = await openConfirmModal({ title: 'Usar o modelo', message: `Trocar o texto que está escrito pelo modelo "${m.nome}"?`, confirmText: 'Trocar' });
      if (!ok) return;
    }
    r.modeloId = m.id;
    r.texto = m.texto;
    texto.value = m.texto;
    ajustarAltura();
    refazer();
    texto.focus();
  }

  async function salvarComoModelo(): Promise<void> {
    if (!r.texto.trim()) {
      mostrarToast('Escreva o texto primeiro.', [], 2500);
      return;
    }
    const nome = await promptText('Salvar como modelo', 'Nome do modelo (ex.: Primeiro contato)');
    if (!nome?.trim()) return;
    try {
      const file = await whatsappState.salvarModelo({ nome: nome.trim(), texto: r.texto });
      const novo = file.modelos.find((x) => x.nome === nome.trim() && x.texto === r.texto);
      if (novo) r.modeloId = novo.id;
      refazer();
      mostrarToast(`Modelo "${nome.trim()}" salvo.`, [], 2500);
    } catch (e) {
      mostrarErro(e);
    }
  }

  function mostrarErro(e: unknown): void {
    erro.textContent = mensagemDeErro(e);
    erro.hidden = false;
  }

  async function mandar(): Promise<void> {
    // Recalcula na hora do clique: a saudação e os campos são os de agora.
    calculo = calcular(d, r, whatsappState.atual(), whatsappState.statusAtual());
    refazer(false);
    if (calculo.bloqueio || !calculo.numero) return;
    enviar.disabled = true;
    erro.hidden = true;
    try {
      const resultado = await whatsappState.enviar({
        ...(d.contato ? { contato: d.contato.ref } : {}),
        numero: calculo.numero,
        texto: r.texto,
        valores: { ...r.manuais },
        textoEsperado: calculo.final,
        ...(calculo.modelo ? { modeloId: calculo.modelo.id } : {}),
        provedor: calculo.provedor,
      });
      // Gravada (saiu ou não): a conversa mostra o resultado; a caixa fica livre para a próxima.
      r.texto = '';
      r.manuais = {};
      delete r.modeloId;
      texto.value = '';
      ajustarAltura();
      if (calculo.provedor === 'link' && resultado.ok) mostrarToast('Aberto no WhatsApp — aperte Enter lá para enviar.', [], 4000);
      aoEnviar?.();
    } catch (e) {
      // Recusada antes de gravar: nada saiu, o texto continua aqui.
      mostrarErro(e);
    } finally {
      refazer();
      texto.focus();
    }
  }

  if (!perfil) void carregarPerfil().then(() => refazer());
  if (!whatsappState.statusAtual()) void whatsappState.carregarStatus().then(() => refazer()).catch(() => undefined);
  refazer();
  requestAnimationFrame(ajustarAltura);

  return {
    el: raiz,
    focar: () => texto.focus(),
    atualizar: () => refazer(),
  };
}

/** O que a IA lê para escrever: quem é o contato e as últimas mensagens da conversa. */
function referenciaParaIa(d: DestinoComposer): string {
  const partes: string[] = [];
  if (d.contato) {
    const c = d.contato.c;
    partes.push(`Contato: ${nomeDoContato(c)}`);
    if (ehPessoa(c) && c.cargo) partes.push(`Cargo: ${c.cargo}`);
    if (c.observacoes) partes.push(`Observações do cadastro: ${c.observacoes.slice(0, 800)}`);
    if (c.proximoContato) partes.push(`Próximo contato marcado: ${c.proximoContato.data} — ${c.proximoContato.nota}`);
    const file = whatsappState.atual();
    if (file) {
      const ultimas = file.mensagens.filter((m) => m.contato && m.contato.tipo === d.contato!.ref.tipo && m.contato.id === d.contato!.ref.id).slice(-12);
      if (ultimas.length) partes.push(`Últimas mensagens da conversa:\n${ultimas.map((m) => `${m.direcao === 'saida' ? 'Eu' : 'Contato'}: ${m.texto}`).join('\n')}`);
    }
  }
  return partes.join('\n');
}
