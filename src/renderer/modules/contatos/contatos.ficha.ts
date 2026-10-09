import { acharContato, nomeDoContato, refIgual, type EmpresaCrm, type Pessoa, type RefContato } from '../../../shared/types/contatos.types.js';
import { numeroDoContato } from '../../../shared/types/whatsapp.numero.js';
import { consumirAbaFicha, type AbaFicha } from '../../core/navegacao.js';
import { abrirMenuIa } from '../../ui/ia.js';
import { openConfirmModal } from '../../ui/modal.js';
import { buildBotao, svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import type { CtxContatos } from './contatos.casco.js';
import { abrirNovoContrato } from './contatos.contratos.js';
import { buildAbaConversa, naoLidasDoContato, type AbaConversa } from './contatos.conversa.js';
import { abrirFichaPdf } from './contatos.documento.js';
import { buildColunaDados } from './contatos.ficha.dados.js';
import { buildAbaHistorico, rotuloDoTipo } from './contatos.ficha.historico.js';
import { buildColunaLado } from './contatos.ficha.lado.js';
import { descarregarFicha, descartarPendente, ligarIndicador, prepararRascunho, salvarERedesenhar } from './contatos.ficha.rascunho.js';
import * as contatosState from './contatos.state.js';
import {
  ICONES_CONTATO,
  buildAvatar,
  buildSeloEtapa,
  buildSeloFaixa,
  buildSeloSituacao,
  el,
  interacoesDe,
  quandoFoi,
  situacaoDoProximo,
  subtituloDo,
  ultimoContato,
} from './contatos.ui.js';

export { descarregarFicha } from './contatos.ficha.rascunho.js';

/**
 * A ficha de um contato, em abas: Visão geral (quem é, como falar, o negócio),
 * Conversa (WhatsApp), Histórico e Contratos. O topo diz quem é e o que vem a
 * seguir; as ações raras ficam no menu "⋯".
 *
 * Os dados editam no lugar (contatos.ficha.rascunho.ts); trocar de aba
 * descarrega o pendente e redesenha.
 */

const CHAVE_ABA = 'iris.contatos.fichaAba';
const ABAS: readonly AbaFicha[] = ['geral', 'conversa', 'historico', 'contratos'];

function lerAba(): AbaFicha {
  try {
    const v = localStorage.getItem(CHAVE_ABA);
    return ABAS.includes(v as AbaFicha) ? (v as AbaFicha) : 'geral';
  } catch {
    return 'geral';
  }
}

let abaAtual: AbaFicha = lerAba();
let conversa: AbaConversa | null = null;
/** O telefone clicado na Visão geral: a Conversa abre nele. */
let numeroPedido: string | undefined;
let fichaDesenhada = '';

function trocarAba(ctx: CtxContatos, aba: AbaFicha, numero?: string): void {
  abaAtual = aba;
  numeroPedido = numero;
  try {
    localStorage.setItem(CHAVE_ABA, aba);
  } catch {
    // Sem localStorage, a aba só não é lembrada.
  }
  void descarregarFicha()
    .then(() => {
      ctx.redesenhar();
      if (aba === 'conversa') conversa?.focar();
    })
    .catch(ctx.falhou);
}

// ---------- Topo ----------

function copiar(texto: string, aviso: string): void {
  window.irisAPI.system.copyToClipboard(texto);
  mostrarToast(aviso, [], 2500);
}

async function arquivar(ctx: CtxContatos, ref: RefContato, arquivado: boolean): Promise<void> {
  try {
    await descarregarFicha();
    await contatosState.arquivarContato(ref, arquivado);
    mostrarToast(arquivado ? 'Arquivado — continua em "Arquivados" na lista' : 'Saiu do arquivo', [], 3500);
  } catch (e) {
    ctx.falhou(e);
  }
}

async function excluir(ctx: CtxContatos, ref: RefContato, c: Pessoa | EmpresaCrm): Promise<void> {
  const contratos = ctx.file.contratos.filter((x) => refIgual(x.contato, ref)).length;
  const pessoas = ref.tipo === 'empresa' ? ctx.file.pessoas.filter((p) => p.empresaId === ref.id).length : 0;
  const ok = await openConfirmModal({
    title: `Excluir ${nomeDoContato(c)}`,
    message: [
      'O cadastro, o histórico e a conversa do WhatsApp guardada no Iris somem — não dá para desfazer.',
      contratos ? `${contratos === 1 ? 'O contrato continua guardado' : `Os ${contratos} contratos continuam guardados`} na aba Contratos, com o nome por extenso.` : '',
      pessoas ? `${pessoas === 1 ? 'A pessoa ligada' : `As ${pessoas} pessoas ligadas`} a esta empresa continua(m), sem empresa.` : '',
      'Se só não quer mais ver na lista, prefira Arquivar.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    confirmText: 'Excluir',
  });
  if (!ok) return;
  try {
    descartarPendente();
    await contatosState.excluirContato(ref);
  } catch (e) {
    ctx.falhou(e);
  }
}

function abrirMenu(ctx: CtxContatos, ref: RefContato, c: Pessoa | EmpresaCrm, ancora: HTMLElement): void {
  const email = c.emails[0];
  const tel = c.telefones[0];
  abrirMenuIa(
    ancora,
    [
      ...(email ? [{ rotulo: 'Copiar e-mail', dica: email, icone: ICONES_CONTATO.email, grupo: 'Copiar', fazer: () => copiar(email, 'E-mail copiado') }] : []),
      ...(tel ? [{ rotulo: 'Copiar telefone', dica: tel.numero, icone: ICONES_CONTATO.telefone, grupo: 'Copiar', fazer: () => copiar(tel.numero, 'Telefone copiado') }] : []),
      {
        rotulo: 'Ficha em PDF',
        dica: 'Os dados e o histórico, para imprimir ou mandar',
        icone: ICONES_CONTATO.pdf,
        grupo: 'Documentos',
        fazer: () => void descarregarFicha().then(() => abrirFichaPdf(ctx, ref)),
      },
      {
        rotulo: 'Novo contrato',
        dica: 'A partir de um modelo, com os dados deste cadastro',
        icone: ICONES_CONTATO.contrato,
        grupo: 'Documentos',
        fazer: () => void descarregarFicha().then(() => abrirNovoContrato(ctx, ref)),
      },
      {
        rotulo: c.arquivado ? 'Tirar do arquivo' : 'Arquivar',
        dica: c.arquivado ? 'Volta para as listas e o funil' : 'Sai das listas, continua guardado',
        icone: ICONES_CONTATO.arquivo,
        grupo: 'Cadastro',
        fazer: () => void arquivar(ctx, ref, !c.arquivado),
      },
      { rotulo: 'Excluir', dica: 'Apaga o cadastro e o histórico', icone: ICONES_CONTATO.lixeira, grupo: 'Cadastro', fazer: () => void excluir(ctx, ref, c) },
    ],
    { titulo: nomeDoContato(c) },
  );
}

function buildTopo(ctx: CtxContatos, ref: RefContato, c: Pessoa | EmpresaCrm): HTMLElement {
  const topo = el('header', 'cf-topo');

  const barra = el('div', 'cf-barra');
  const voltar = buildBotao(ctx.rotuloVoltar, { icone: ICONES_CONTATO.voltar, variante: 'fantasma' });
  voltar.addEventListener('click', ctx.voltar);
  const salvo = el('span', 'cf-salvo');
  ligarIndicador(salvo);
  const mais = buildBotao('', { icone: ICONES_CONTATO.mais3, variante: 'fantasma', titulo: 'Mais ações' });
  mais.setAttribute('aria-label', 'Mais ações');
  mais.addEventListener('click', () => abrirMenu(ctx, ref, c, mais));
  barra.append(voltar, el('span', 'ct-espaco'), salvo, mais);

  const quem = el('div', 'cf-quem');
  quem.appendChild(buildAvatar(c, 'g'));
  const nomes = el('div', 'cf-nomes');
  nomes.appendChild(el('h1', undefined, nomeDoContato(c)));
  const sub = el('div', 'cf-sub');
  if (!('razaoSocial' in c) && c.empresaId) {
    const empresa = ctx.file.empresas.find((e) => e.id === c.empresaId);
    if (empresa) {
      if (c.cargo) sub.appendChild(el('span', undefined, c.cargo));
      const link = el('button', 'ct-link', nomeDoContato(empresa));
      link.type = 'button';
      link.title = 'Abrir a ficha da empresa';
      link.addEventListener('click', () => ctx.abrirFicha({ tipo: 'empresa', id: empresa.id }));
      sub.appendChild(link);
    }
  } else {
    const texto = subtituloDo(ctx.file, c);
    sub.appendChild(el('span', undefined, texto || (ref.tipo === 'pessoa' ? 'Pessoa' : 'Empresa')));
  }
  nomes.appendChild(sub);
  const selos = el('div', 'cf-selos');
  if (!('razaoSocial' in c) && c.entrada) selos.appendChild(buildSeloFaixa(c.entrada.faixa, c.entrada.pontos));
  if (c.arquivado) selos.appendChild(el('span', 'ct-arquivado', 'Arquivado'));
  if (c.naoEnviarWhatsapp) selos.appendChild(el('span', 'cf-selo-optout', 'Não recebe WhatsApp'));
  if (selos.childElementCount) nomes.appendChild(selos);
  quem.appendChild(nomes);

  const acoes = el('div', 'cf-acoes');
  // Etapa: muda já (o histórico ganha a linha "Etapa: A → B").
  const etapa = el('label', 'ct-ficha-etapa cf-etapa');
  etapa.title = 'Etapa no funil';
  etapa.appendChild(buildSeloEtapa(ctx.file.etapas.find((e) => e.id === c.etapaId)));
  const sel = el('select', 'ct-etapa-select');
  sel.setAttribute('aria-label', 'Etapa no funil');
  ctx.file.etapas.forEach((e) => sel.appendChild(Object.assign(el('option'), { value: e.id, textContent: e.nome })));
  sel.value = c.etapaId;
  sel.addEventListener('change', () => void salvarERedesenhar(ctx, { etapaId: sel.value }));
  etapa.appendChild(sel);
  acoes.appendChild(etapa);
  if (c.telefones[0]) {
    const tel = c.telefones[0];
    const b = buildBotao(tel.numero, { variante: 'secundario', icone: ICONES_CONTATO.telefone, titulo: 'Copiar o telefone' });
    b.addEventListener('click', () => copiar(tel.numero, 'Telefone copiado'));
    acoes.appendChild(b);
  }
  if (numeroDoContato(c) && abaAtual !== 'conversa') {
    const wa = buildBotao('WhatsApp', { variante: 'primario', icone: ICONES_CONTATO.whatsapp, titulo: 'Escrever no WhatsApp' });
    wa.addEventListener('click', () => trocarAba(ctx, 'conversa'));
    acoes.appendChild(wa);
  }

  const identidade = el('div', 'cf-identidade');
  identidade.append(quem, acoes);
  topo.append(barra, identidade, buildResumo(ctx, ref, c));
  return topo;
}

/** A linha do "o que vem a seguir": próximo contato, último contato, origem. Texto, não placar. */
function buildResumo(ctx: CtxContatos, ref: RefContato, c: Pessoa | EmpresaCrm): HTMLElement {
  const linha = el('div', 'cf-resumo');
  const item = (icone: string, texto: string, classe = '', aoClicar?: () => void): void => {
    const e = el(aoClicar ? 'button' : 'span', `cf-resumo-item${classe ? ` ${classe}` : ''}`);
    if (e instanceof HTMLButtonElement) {
      e.type = 'button';
      e.addEventListener('click', aoClicar!);
    }
    e.innerHTML = svg(icone, 13, 2);
    e.appendChild(el('span', undefined, texto));
    linha.appendChild(e);
  };
  const prox = c.proximoContato;
  if (prox) {
    const sit = situacaoDoProximo(prox.data);
    item(ICONES_CONTATO.sino, `${sit === 'atrasado' ? 'Atrasado: ' : 'Próximo contato '}${quandoFoi(prox.data)}${prox.nota ? ` — ${prox.nota}` : ''}`, `is-${sit}`, () => trocarAba(ctx, 'geral'));
  } else {
    item(ICONES_CONTATO.sino, 'Sem próximo contato marcado', 'is-apagado', () => trocarAba(ctx, 'geral'));
  }
  const ultimo = ultimoContato(ctx.file, ref);
  item(
    ICONES_CONTATO.relogio,
    ultimo ? `Último contato ${quandoFoi(ultimo.data.slice(0, 10))} (${rotuloDoTipo(ultimo.tipo).toLowerCase()})` : 'Nenhum contato registrado',
    ultimo ? '' : 'is-apagado',
    () => trocarAba(ctx, 'historico'),
  );
  if (c.origem) item(ICONES_CONTATO.alvo, `Origem: ${c.origem}`);
  return linha;
}

// ---------- Abas ----------

function buildAbas(ctx: CtxContatos, ref: RefContato): HTMLElement {
  const nav = el('nav', 'cf-abas');
  nav.setAttribute('role', 'tablist');
  const historico = interacoesDe(ctx.file, ref).filter((i) => i.tipo !== 'evento').length;
  const contratos = ctx.file.contratos.filter((x) => refIgual(x.contato, ref)).length;
  const novas = naoLidasDoContato(ref);
  const abas: Array<{ id: AbaFicha; rotulo: string; contagem?: string; alerta?: boolean }> = [
    { id: 'geral', rotulo: 'Visão geral' },
    { id: 'conversa', rotulo: 'Conversa', ...(novas ? { contagem: String(novas), alerta: true } : {}) },
    { id: 'historico', rotulo: 'Histórico', ...(historico ? { contagem: String(historico) } : {}) },
    { id: 'contratos', rotulo: 'Contratos', ...(contratos ? { contagem: String(contratos) } : {}) },
  ];
  abas.forEach((a) => {
    const b = el('button', `cf-aba${a.id === abaAtual ? ' is-ativa' : ''}`);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(a.id === abaAtual));
    b.appendChild(el('span', undefined, a.rotulo));
    if (a.contagem) b.appendChild(el('span', `cf-aba-contagem${a.alerta ? ' is-alerta' : ''}`, a.contagem));
    b.addEventListener('click', () => {
      if (a.id !== abaAtual) trocarAba(ctx, a.id);
    });
    nav.appendChild(b);
  });
  return nav;
}

function buildAbaGeral(ctx: CtxContatos, c: Pessoa | EmpresaCrm): HTMLElement {
  const grade = el('div', 'cf-geral');
  grade.append(buildColunaDados(ctx, c, { conversar: (numero) => trocarAba(ctx, 'conversa', numero) }), buildColunaLado(ctx, c));
  return grade;
}

function buildAbaContratos(ctx: CtxContatos, ref: RefContato): HTMLElement {
  const aba = el('div', 'cf-contratos');
  const contratos = ctx.file.contratos.filter((x) => refIgual(x.contato, ref)).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  const cab = el('div', 'cf-contratos-cab');
  cab.appendChild(el('p', undefined, contratos.length ? 'Do mais recente ao mais antigo. Cada contrato guarda o texto como foi gerado.' : 'Nenhum contrato com este contato.'));
  const novo = buildBotao('Novo contrato', { variante: 'primario', icone: ICONES_CONTATO.mais });
  novo.addEventListener('click', () => void descarregarFicha().then(() => abrirNovoContrato(ctx, ref)));
  cab.appendChild(novo);
  aba.appendChild(cab);
  contratos.forEach((x) => {
    const b = el('button', 'cf-contrato');
    b.type = 'button';
    const marca = el('span', 'cf-cartao-icone');
    marca.innerHTML = svg(ICONES_CONTATO.contrato, 16);
    const t = el('span', 'ct-mini-textos');
    t.append(el('strong', undefined, x.titulo), el('span', undefined, `${x.modeloNome ? `${x.modeloNome} · ` : ''}atualizado ${quandoFoi(x.atualizadoEm.slice(0, 10))}`));
    b.append(marca, t, buildSeloSituacao(x.situacao));
    b.addEventListener('click', () => ctx.abrirContrato(x.id));
    aba.appendChild(b);
  });
  return aba;
}

// ---------- Ficha ----------

export function buildFicha(ctx: CtxContatos, ref: RefContato): HTMLElement {
  // A conversa assina o state do WhatsApp: o redesenho solta a anterior antes de criar a nova.
  conversa?.destruir();
  conversa = null;
  const c = acharContato(ctx.file, ref)!;
  prepararRascunho(c, ref);
  const chave = `${ref.tipo}:${ref.id}`;
  const pedida = consumirAbaFicha();
  if (pedida) abaAtual = pedida;
  else if (chave !== fichaDesenhada) numeroPedido = undefined;
  fichaDesenhada = chave;

  const view = el('div', `pg-view cf-ficha is-aba-${abaAtual}`);
  view.append(buildTopo(ctx, ref, c), buildAbas(ctx, ref));
  const corpo = el('div', 'cf-corpo');
  corpo.dataset.rolagem = `aba-${abaAtual}`;
  if (abaAtual === 'geral') corpo.appendChild(buildAbaGeral(ctx, c));
  else if (abaAtual === 'historico') corpo.appendChild(buildAbaHistorico(ctx, ref, () => trocarAba(ctx, 'conversa')));
  else if (abaAtual === 'contratos') corpo.appendChild(buildAbaContratos(ctx, ref));
  else {
    conversa = buildAbaConversa(ctx, ref, c, numeroPedido);
    corpo.appendChild(conversa.el);
  }
  view.appendChild(corpo);
  return view;
}

/** O módulo saiu (destroy): a conversa para de ouvir o WhatsApp. */
export function soltarFicha(): void {
  conversa?.destruir();
  conversa = null;
}
