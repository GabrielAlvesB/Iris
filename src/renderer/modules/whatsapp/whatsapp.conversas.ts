import { formatarTelefone } from '../../../shared/types/brasil.js';
import { acharContato, ehPessoa, nomeDoContato, type ContatosFile, type EmpresaCrm, type Pessoa, type RefContato } from '../../../shared/types/contatos.types.js';
import { formatarNumeroWa, mesmoNumeroWa, numeroWhatsapp } from '../../../shared/types/whatsapp.numero.js';
import type { MensagemWa, WhatsappFile } from '../../../shared/types/whatsapp.types.js';
import { abrirContato } from '../../core/navegacao.js';
import { openFormModal } from '../../ui/modal.js';
import { buildBotao, buildBusca, buildVazio, focarBusca, svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { buildAbaConversa, type AbaConversa } from '../contatos/contatos.conversa.js';
import * as contatosState from '../contatos/contatos.state.js';
import { ICONES_CONTATO, buildAvatar, el, quandoFoi } from '../contatos/contatos.ui.js';
import { buildComposer, provedoresProntos } from './whatsapp.composer.js';
import { ICONES_WA, buildBolha, diaDaMensagem, horaDaMensagem } from './whatsapp.ui.js';
import * as whatsappState from './whatsapp.state.js';
import type { CtxWa } from './whatsapp.view.js';

/**
 * A caixa de entrada: todas as conversas à esquerda, a escolhida à direita.
 * Conversa de contato é a mesma da ficha (contatos.conversa.ts); a de um
 * número fora do cadastro tem o mesmo desenho e os botões para cadastrar.
 */

type Filtro = 'todas' | 'naoLidas' | 'semCadastro';

interface ItemConversa {
  chave: string;
  ref?: RefContato;
  contato?: Pessoa | EmpresaCrm;
  numero: string;
  nome: string;
  ultima: MensagemWa;
  naoLidas: number;
}

let selecionada: string | null = null;
let busca = '';
let filtro: Filtro = 'todas';
let painel: { chave: string; soltar: () => void } | null = null;
let listaEl: HTMLElement | null = null;
let contatosAtuais: ContatosFile | null = null;

export function soltarConversas(): void {
  painel?.soltar();
  painel = null;
  listaEl = null;
}

function semAcento(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Uma conversa por contato; o que é de número fora do cadastro, uma por número (com e sem o 9 juntos). */
export function conversasDe(wa: WhatsappFile, contatos: ContatosFile): ItemConversa[] {
  const itens = new Map<string, ItemConversa>();
  const soltos: ItemConversa[] = [];
  wa.mensagens.forEach((m) => {
    let item: ItemConversa | undefined;
    if (m.contato) {
      const chave = `c:${m.contato.tipo}:${m.contato.id}`;
      item = itens.get(chave);
      if (!item) {
        const c = acharContato(contatos, m.contato);
        if (!c) return;
        item = { chave, ref: m.contato, contato: c, numero: m.numero, nome: nomeDoContato(c), ultima: m, naoLidas: 0 };
        itens.set(chave, item);
      }
    } else {
      item = soltos.find((s) => mesmoNumeroWa(s.numero, m.numero));
      if (!item) {
        item = { chave: `n:${m.numero}`, numero: m.numero, nome: formatarNumeroWa(m.numero), ultima: m, naoLidas: 0 };
        soltos.push(item);
      }
      if (m.nomePerfil) item.nome = `${m.nomePerfil} · ${formatarNumeroWa(item.numero)}`;
    }
    if (m.criadaEm >= item.ultima.criadaEm) item.ultima = m;
    if (m.direcao === 'entrada' && !m.vista) item.naoLidas += 1;
  });
  return [...itens.values(), ...soltos].sort((a, b) => b.ultima.criadaEm.localeCompare(a.ultima.criadaEm));
}

function filtrar(itens: ItemConversa[]): ItemConversa[] {
  const q = semAcento(busca.trim());
  const digitos = q.replace(/\D/g, '');
  return itens.filter((i) => {
    if (filtro === 'naoLidas' && !i.naoLidas) return false;
    if (filtro === 'semCadastro' && i.ref) return false;
    if (!q) return true;
    return semAcento(i.nome).includes(q) || (digitos.length >= 3 && i.numero.includes(digitos)) || semAcento(i.ultima.texto).includes(q);
  });
}

function quando(iso: string): string {
  const dia = diaDaMensagem(iso);
  const rel = quandoFoi(dia);
  return rel === 'hoje' ? horaDaMensagem(iso) : rel;
}

function buildItem(i: ItemConversa): HTMLElement {
  const b = el('button', `wa-conversa${i.chave === selecionada ? ' is-ativa' : ''}${i.naoLidas ? ' is-nova' : ''}`);
  b.type = 'button';
  if (i.contato) b.appendChild(buildAvatar(i.contato, 'm'));
  else {
    const a = el('span', 'wa-conversa-anonimo');
    a.innerHTML = svg(ICONES_WA.whatsapp, 18);
    b.appendChild(a);
  }
  const textos = el('span', 'wa-conversa-textos');
  const linha1 = el('span', 'wa-conversa-linha');
  linha1.append(el('strong', undefined, i.nome), el('span', 'wa-conversa-quando', quando(i.ultima.criadaEm)));
  const linha2 = el('span', 'wa-conversa-linha');
  const previa = el('span', 'wa-conversa-previa', `${i.ultima.direcao === 'saida' ? 'Você: ' : ''}${i.ultima.texto.replace(/\s+/g, ' ')}`);
  linha2.appendChild(previa);
  if (i.naoLidas) {
    const n = el('span', 'wa-conversa-nao-lidas', String(i.naoLidas));
    n.setAttribute('aria-label', `${i.naoLidas} não ${i.naoLidas === 1 ? 'lida' : 'lidas'}`);
    linha2.appendChild(n);
  }
  textos.append(linha1, linha2);
  b.appendChild(textos);
  b.addEventListener('click', () => {
    selecionada = i.chave;
    const caixa = b.closest('.wa-caixa');
    if (caixa) abrirPainel(caixa.querySelector('.wa-caixa-painel')!, i);
    listaEl?.querySelectorAll('.wa-conversa').forEach((x) => x.classList.toggle('is-ativa', x === b));
  });
  return b;
}

const ROTULOS_FILTRO: Record<Filtro, string> = { todas: 'Todas', naoLidas: 'Não lidas', semCadastro: 'Sem cadastro' };

function desenharLista(wa: WhatsappFile): void {
  if (!listaEl || !contatosAtuais) return;
  const topo = listaEl.scrollTop;
  const todas = conversasDe(wa, contatosAtuais);
  // As contagens dos filtros acompanham a lista (ler uma conversa tira das "Não lidas").
  const contagem: Record<Filtro, number> = { todas: 0, naoLidas: todas.filter((i) => i.naoLidas).length, semCadastro: todas.filter((i) => !i.ref).length };
  listaEl.parentElement?.querySelectorAll<HTMLButtonElement>('.wa-filtros .md-pilula').forEach((b) => {
    const id = b.dataset.filtro as Filtro;
    b.textContent = contagem[id] ? `${ROTULOS_FILTRO[id]} · ${contagem[id]}` : ROTULOS_FILTRO[id];
  });
  const itens = filtrar(todas);
  listaEl.replaceChildren();
  if (!itens.length) {
    listaEl.appendChild(el('p', 'cf-vazio is-grande', busca || filtro !== 'todas' ? 'Nenhuma conversa com esse filtro.' : 'Nenhuma conversa ainda.'));
    return;
  }
  itens.forEach((i) => listaEl!.appendChild(buildItem(i)));
  listaEl.scrollTop = topo;
}

/** Mensagem chegou: a lista se refaz; o painel aberto se atualiza sozinho (assina o state). */
export function atualizarConversas(wa: WhatsappFile): void {
  desenharLista(wa);
}

// ---------- Painel ----------

function abrirPainel(alvo: HTMLElement, i: ItemConversa): void {
  painel?.soltar();
  painel = null;
  alvo.replaceChildren();
  const cab = el('header', 'wa-painel-cab');
  const textos = el('div', 'cf-conversa-textos');
  textos.appendChild(el('h3', undefined, i.nome));
  textos.appendChild(el('span', undefined, i.ref ? formatarNumeroWa(i.numero) : 'Este número ainda não está no cadastro'));
  cab.appendChild(textos);
  const falhou = (e: unknown): void => mostrarToast(e instanceof Error ? e.message : String(e), [], 5000);

  if (i.ref && i.contato) {
    const ficha = buildBotao('Abrir a ficha', { variante: 'secundario', icone: ICONES_CONTATO.pessoa });
    const ref = i.ref;
    ficha.addEventListener('click', () => abrirContato(ref, 'conversa'));
    cab.appendChild(ficha);
    alvo.appendChild(cab);
    const conversa: AbaConversa = buildAbaConversa({ file: contatosAtuais!, falhou }, ref, i.contato);
    conversa.el.classList.add('is-painel');
    alvo.appendChild(conversa.el);
    painel = { chave: i.chave, soltar: conversa.destruir };
    return;
  }

  const criar = buildBotao('Cadastrar', { variante: 'primario', icone: ICONES_CONTATO.mais, titulo: 'Criar uma pessoa com este número' });
  criar.addEventListener('click', () => void cadastrar(i));
  const ligar = buildBotao('Ligar a um contato', { variante: 'secundario', icone: ICONES_CONTATO.link, titulo: 'Este número é de alguém que já está no cadastro' });
  ligar.addEventListener('click', () => void ligarAContato(i));
  cab.append(ligar, criar);
  alvo.appendChild(cab);

  const conversa = el('div', 'cf-conversa is-painel');
  const lista = el('div', 'wa-lista');
  lista.setAttribute('role', 'log');
  const composer = buildComposer({ chave: `n:${i.numero}`, numeros: [i.numero] }, () => requestAnimationFrame(() => (lista.scrollTop = lista.scrollHeight)));
  conversa.append(lista, composer.el);
  alvo.appendChild(conversa);
  const desenhar = (wa: WhatsappFile | null): void => {
    lista.replaceChildren();
    const msgs = (wa?.mensagens ?? []).filter((m) => !m.contato && mesmoNumeroWa(m.numero, i.numero));
    let dia = '';
    msgs.forEach((m) => {
      const d = diaDaMensagem(m.criadaEm);
      if (d !== dia) {
        dia = d;
        lista.appendChild(el('div', 'wa-dia', quandoFoi(d)));
      }
      lista.appendChild(buildBolha(m, { reenviar: (x) => void whatsappState.reenviar(x.id).catch(falhou) }));
    });
    composer.atualizar();
    requestAnimationFrame(() => (lista.scrollTop = lista.scrollHeight));
    if (msgs.some((m) => m.direcao === 'entrada' && !m.vista)) void whatsappState.marcarLidas({ numero: i.numero }).catch(() => undefined);
  };
  desenhar(whatsappState.atual());
  painel = { chave: i.chave, soltar: whatsappState.assinar(desenhar) };
}

/** O número entra no cadastro como telefone de WhatsApp: as próximas mensagens já caem na conversa certa. */
async function cadastrar(i: ItemConversa): Promise<void> {
  const nomePerfil = [...(whatsappState.atual()?.mensagens ?? [])].reverse().find((m) => !m.contato && mesmoNumeroWa(m.numero, i.numero) && m.nomePerfil)?.nomePerfil ?? '';
  const v = await openFormModal(
    'Cadastrar pessoa',
    [
      { name: 'nome', label: 'Nome', defaultValue: nomePerfil },
      { name: 'email', label: 'E-mail (opcional)', metade: true },
      { name: 'telefone', label: 'WhatsApp', defaultValue: formatarTelefone(i.numero), metade: true },
    ],
    'Cadastrar',
    { icone: ICONES_CONTATO.pessoa, subtitulo: 'As mensagens deste número passam para a conversa dela.' },
  );
  if (!v?.nome?.trim()) return;
  try {
    const id = await contatosState.criarPessoa({
      nome: v.nome.trim(),
      emails: v.email?.trim() ? [v.email.trim()] : [],
      telefones: [{ numero: v.telefone || i.numero, tipo: 'whatsapp' }],
      origem: 'WhatsApp',
    });
    if (!id) return;
    const ref: RefContato = { tipo: 'pessoa', id };
    await whatsappState.ligarNumero(i.numero, ref);
    selecionada = `c:pessoa:${id}`;
    mostrarToast(`${v.nome.trim()} cadastrada(o).`, [{ rotulo: 'Abrir a ficha', fazer: () => abrirContato(ref, 'geral') }], 5000);
  } catch (e) {
    mostrarToast(e instanceof Error ? e.message : String(e), [], 5000);
  }
}

async function ligarAContato(i: ItemConversa): Promise<void> {
  const contatos = contatosAtuais;
  if (!contatos) return;
  const opcoes = [...contatos.pessoas, ...contatos.empresas]
    .filter((c) => !c.arquivado)
    .map((c) => ({ value: `${ehPessoa(c) ? 'pessoa' : 'empresa'}:${c.id}`, label: nomeDoContato(c) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  if (!opcoes.length) {
    mostrarToast('Ainda não há contatos no cadastro.', [], 3000);
    return;
  }
  const v = await openFormModal('Ligar a um contato', [{ name: 'contato', label: 'Contato', type: 'select', options: opcoes, defaultValue: opcoes[0]!.value }], 'Ligar', {
    icone: ICONES_CONTATO.link,
    subtitulo: `As mensagens de ${formatarNumeroWa(i.numero)} passam para a conversa do contato, e o número entra no cadastro dele.`,
  });
  if (!v?.contato) return;
  const [tipo, id] = v.contato.split(':') as ['pessoa' | 'empresa', string];
  const ref: RefContato = { tipo, id };
  const c = acharContato(contatos, ref);
  if (!c) return;
  try {
    if (!c.telefones.some((t) => mesmoNumeroWa(numeroWhatsapp(t.numero) ?? '', i.numero))) {
      const telefones = [...c.telefones, { numero: formatarTelefone(i.numero), tipo: 'whatsapp' as const }];
      if (tipo === 'pessoa') await contatosState.salvarPessoa({ id, telefones });
      else await contatosState.salvarEmpresa({ id, telefones });
    }
    await whatsappState.ligarNumero(i.numero, ref);
    selecionada = `c:${tipo}:${id}`;
    mostrarToast(`Ligado a ${nomeDoContato(c)}.`, [], 3500);
  } catch (e) {
    mostrarToast(e instanceof Error ? e.message : String(e), [], 5000);
  }
}

// ---------- Tela ----------

export function buildConversas(ctx: CtxWa): HTMLElement {
  soltarConversas();
  contatosAtuais = ctx.contatos;
  const caixa = el('div', 'wa-caixa');
  const lado = el('aside', 'wa-caixa-lista');
  const buscaEl = buildBusca(busca, 'Buscar nome, número ou texto', (v) => {
    busca = v;
    desenharLista(whatsappState.atual() ?? ctx.wa);
  });
  const filtros = el('div', 'wa-filtros');
  const todas = conversasDe(ctx.wa, ctx.contatos);
  (['todas', 'naoLidas', 'semCadastro'] as Filtro[]).forEach((id) => {
    const b = el('button', `md-pilula${filtro === id ? ' is-ativa' : ''}`, ROTULOS_FILTRO[id]);
    b.type = 'button';
    b.dataset.filtro = id;
    b.setAttribute('aria-pressed', String(filtro === id));
    b.addEventListener('click', () => {
      filtro = id;
      filtros.querySelectorAll('.md-pilula').forEach((x) => {
        x.classList.toggle('is-ativa', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      desenharLista(whatsappState.atual() ?? ctx.wa);
    });
    filtros.appendChild(b);
  });
  listaEl = el('div', 'wa-conversas');
  lado.append(buscaEl, filtros, listaEl);
  const painelEl = el('section', 'wa-caixa-painel');
  caixa.append(lado, painelEl);
  desenharLista(ctx.wa);

  const escolhida = todas.find((i) => i.chave === selecionada);
  if (escolhida) abrirPainel(painelEl, escolhida);
  else {
    selecionada = null;
    // Só com "Abrir no WhatsApp", o Iris não tem como ler o app do PC: deixar isso dito, senão a lista vazia parece defeito.
    const soLink = !provedoresProntos(whatsappState.statusAtual()).some((p) => p !== 'link');
    painelEl.appendChild(
      buildVazio(
        ICONES_WA.conversas,
        todas.length ? 'Escolha uma conversa' : 'Nenhuma conversa ainda',
        todas.length
          ? 'A conversa abre aqui, com a caixa de escrever. Para começar uma nova, abra a ficha do contato em Contatos › aba Conversa.'
          : soLink
            ? 'Aqui aparece o que você escreve pelo Iris — pela ficha do contato, aba Conversa. As conversas que já estão no seu WhatsApp não vêm para cá: o aplicativo do PC não deixa outros programas lerem as mensagens. Para ver as respostas aqui, conecte a Evolution, o WAHA ou a API oficial em Conexão.'
            : 'Escreva para alguém pela ficha do contato (aba Conversa). As respostas chegam aqui quando o recebimento está ligado em Conexão.',
      ),
    );
  }
  if (busca) requestAnimationFrame(() => focarBusca(lado));
  return caixa;
}
