import { TIPOS_REDE_CONTATO, TIPOS_TELEFONE, nomeDoContato, type EmpresaCrm, type Pessoa, type Telefone } from '../../../shared/types/contatos.types.js';
import { UFS, formatarCep, formatarDocumento, formatarTelefone, problemaDoDocumento } from '../../../shared/types/brasil.js';
import { numeroWhatsapp } from '../../../shared/types/whatsapp.numero.js';
import { openFormModal } from '../../ui/modal.js';
import type { CtxContatos } from './contatos.casco.js';
import { botaoAdicionar, botaoIcone, cartao, entrada, linha, linhaCampo, listaEditavel, seletor } from './contatos.ficha.campos.js';
import { agendar, descarregarFicha, rascunhoAtual, salvarERedesenhar } from './contatos.ficha.rascunho.js';
import * as contatosState from './contatos.state.js';
import { ICONES_CONTATO, buildAvatar, el } from './contatos.ui.js';

/**
 * A coluna principal da Visão geral: quem é (pessoa ou empresa), como falar
 * (telefones, e-mails, redes) e onde fica. Cada dado edita no lugar.
 */

export interface AcoesDados {
  /** O botão de conversa ao lado de um telefone leva à aba Conversa com aquele número. */
  conversar: (numero: string) => void;
}

const ICONE_ID = '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 8h2"/><path d="M15 12h2"/><path d="M7 16h10"/>';
const ICONE_TRABALHO = '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>';
const ICONE_ENDERECO = '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>';

function cartaoQuem(ctx: CtxContatos, c: Pessoa | EmpresaCrm): HTMLElement[] {
  const r = rascunhoAtual();
  if ('razaoSocial' in c) {
    return [
      cartao('Empresa', ICONES_CONTATO.empresa, [
        linhaCampo('Razão social', c.razaoSocial, (v) => (r.razaoSocial = v)),
        linhaCampo('Nome fantasia', c.nomeFantasia, (v) => (r.nomeFantasia = v), { placeholder: 'Como é conhecida' }),
        linhaCampo('CNPJ', c.cnpj, (v) => (r.cnpj = v), { formatar: formatarDocumento, aviso: (v) => problemaDoDocumento(v, 'cnpj'), placeholder: '00.000.000/0000-00' }),
        linhaCampo('Inscrição estadual', c.inscricaoEstadual, (v) => (r.inscricaoEstadual = v), { placeholder: '—' }),
        linhaCampo('Segmento', c.segmento, (v) => (r.segmento = v), { placeholder: 'Restaurante, software, clínica…' }),
      ]),
    ];
  }

  const empresa = el('select', 'cf-entrada is-seletor');
  empresa.appendChild(Object.assign(el('option'), { value: '', textContent: 'Nenhuma' }));
  ctx.file.empresas
    .filter((e) => !e.arquivado || e.id === c.empresaId)
    .sort((a, b) => nomeDoContato(a).localeCompare(nomeDoContato(b), 'pt-BR'))
    .forEach((e) => empresa.appendChild(Object.assign(el('option'), { value: e.id, textContent: nomeDoContato(e) })));
  empresa.value = c.empresaId ?? '';
  // Muda o subtítulo do topo e a lista da empresa: salva já e redesenha.
  empresa.addEventListener('change', () => void salvarERedesenhar(ctx, { empresaId: empresa.value || undefined }));

  return [
    cartao('Dados pessoais', ICONE_ID, [
      linhaCampo('Nome', c.nome, (v) => (r.nome = v)),
      linhaCampo('Apelido', c.apelido, (v) => (r.apelido = v), { placeholder: 'Como prefere ser chamado(a)' }),
      linhaCampo('Nascimento', c.nascimento ?? '', (v) => (r.nascimento = v || undefined), { tipo: 'date' }),
      linhaCampo('CPF', c.cpf, (v) => (r.cpf = v), { formatar: formatarDocumento, aviso: (v) => problemaDoDocumento(v, 'cpf'), placeholder: '000.000.000-00' }),
      linhaCampo('RG', c.rg, (v) => (r.rg = v), { placeholder: '—' }),
    ]),
    cartao('Trabalho', ICONE_TRABALHO, [linha('Empresa', empresa), linhaCampo('Cargo', c.cargo, (v) => (r.cargo = v), { placeholder: 'Diretora, comprador…' })]),
  ];
}

function linhaTelefone(t: Telefone, acoes: AcoesDados): HTMLElement[] {
  const numero = entrada(t.numero, (v) => (t.numero = v), { placeholder: '(11) 98765-4321', formatar: formatarTelefone });
  numero.setAttribute('aria-label', 'Telefone');
  const tipo = seletor(t.tipo, TIPOS_TELEFONE, (v) => (t.tipo = v as Telefone['tipo']), 'Tipo do telefone');
  tipo.classList.add('is-curto');
  const partes: HTMLElement[] = [numero, tipo];
  // Só aparece para quem pode ter WhatsApp: celular ou marcado como WhatsApp, com DDD.
  const wa = botaoIcone(ICONES_CONTATO.whatsapp, 'Conversar no WhatsApp', () => {
    const n = numeroWhatsapp(numero.value);
    if (n) void descarregarFicha().then(() => acoes.conversar(n));
  }, 'cf-wa');
  const atualizar = (): void => {
    wa.hidden = t.tipo === 'fixo' || !numeroWhatsapp(numero.value);
  };
  numero.addEventListener('input', atualizar);
  tipo.addEventListener('change', atualizar);
  atualizar();
  partes.push(wa);
  return partes;
}

/** E-mail é uma lista de strings (sem objeto para editar no lugar): montada à parte, com o mesmo desenho. */
function listaDeEmails(): HTMLElement {
  const r = rascunhoAtual();
  const caixa = el('div', 'cf-lista');
  const desenhar = (): void => {
    const emails = (r.emails ??= []);
    caixa.replaceChildren();
    emails.forEach((email, i) => {
      const l = el('div', 'cf-lista-linha');
      const input = entrada(email, (v) => (emails[i] = v), { tipo: 'email', placeholder: 'nome@exemplo.com' });
      input.setAttribute('aria-label', 'E-mail');
      const tirar = botaoIcone(
        ICONES_CONTATO.lixeira,
        'Remover',
        () => {
          emails.splice(i, 1);
          agendar();
          desenhar();
        },
        'is-perigo cf-tirar',
      );
      l.append(input, tirar);
      caixa.appendChild(l);
    });
    caixa.appendChild(
      botaoAdicionar('E-mail', () => {
        emails.push('');
        desenhar();
        [...caixa.querySelectorAll<HTMLInputElement>('input')].pop()?.focus();
      }),
    );
  };
  desenhar();
  return caixa;
}

function cartaoContato(c: Pessoa | EmpresaCrm, acoes: AcoesDados): HTMLElement {
  const r = rascunhoAtual();
  const telefones = listaEditavel<Telefone>({
    itens: () => (r.telefones ??= []),
    novo: () => ({ numero: '', tipo: 'celular' }),
    linha: (t) => linhaTelefone(t, acoes),
    rotuloNovo: 'Telefone',
  });
  const emails = listaDeEmails();
  const redes = listaEditavel({
    itens: () => (r.redes ??= []),
    novo: () => ({ tipo: 'instagram' as const, valor: '' }),
    linha: (rede) => {
      const tipo = seletor(rede.tipo, TIPOS_REDE_CONTATO, (v) => (rede.tipo = v as typeof rede.tipo), 'Rede');
      tipo.classList.add('is-curto');
      const valor = entrada(rede.valor, (v) => (rede.valor = v), { placeholder: '@perfil ou endereço' });
      valor.setAttribute('aria-label', 'Perfil ou endereço');
      return [tipo, valor];
    },
    rotuloNovo: 'Rede ou site',
  });

  const naoEnviar = el('label', 'cf-marcar');
  const caixa = el('input');
  caixa.type = 'checkbox';
  caixa.checked = c.naoEnviarWhatsapp === true;
  caixa.addEventListener('change', () => {
    // false (e não ausente) para o salvar do main desligar o que estava ligado.
    r.naoEnviarWhatsapp = caixa.checked;
    agendar();
  });
  naoEnviar.append(caixa, el('span', undefined, 'Pediu para não receber mensagens (o Iris não envia)'));

  return cartao('Contato', ICONES_CONTATO.telefone, [
    linha('Telefones', telefones, { topo: true }),
    linha('E-mails', emails, { topo: true }),
    linha('Redes e site', redes, { topo: true }),
    linha('WhatsApp', naoEnviar),
  ]);
}

function cartaoEndereco(c: Pessoa | EmpresaCrm): HTMLElement {
  const r = rascunhoAtual();
  const e = (r.endereco ??= structuredClone(c.endereco));
  const uf = el('select', 'cf-entrada is-seletor is-curto');
  uf.appendChild(Object.assign(el('option'), { value: '', textContent: '—' }));
  UFS.forEach((u) => uf.appendChild(Object.assign(el('option'), { value: u, textContent: u })));
  uf.value = e.uf;
  uf.addEventListener('change', () => {
    e.uf = uf.value;
    agendar();
  });
  const cidade = el('div', 'cf-par');
  const nomeCidade = entrada(e.cidade, (v) => (e.cidade = v), { placeholder: 'Cidade' });
  nomeCidade.setAttribute('aria-label', 'Cidade');
  uf.setAttribute('aria-label', 'UF');
  cidade.append(nomeCidade, uf);
  const rua = el('div', 'cf-par');
  const logradouro = entrada(e.logradouro, (v) => (e.logradouro = v), { placeholder: 'Rua, avenida…' });
  logradouro.setAttribute('aria-label', 'Logradouro');
  const numero = entrada(e.numero, (v) => (e.numero = v), { placeholder: 'Nº' });
  numero.classList.add('is-curto');
  numero.setAttribute('aria-label', 'Número');
  rua.append(logradouro, numero);
  return cartao('Endereço', ICONE_ENDERECO, [
    linhaCampo('CEP', e.cep, (v) => (e.cep = v), { formatar: formatarCep, placeholder: '00000-000' }),
    linha('Logradouro', rua),
    linhaCampo('Complemento', e.complemento, (v) => (e.complemento = v), { placeholder: 'Sala, apto…' }),
    linhaCampo('Bairro', e.bairro, (v) => (e.bairro = v), { placeholder: '—' }),
    linha('Cidade', cidade),
  ]);
}

function cartaoPessoasDaEmpresa(ctx: CtxContatos, empresa: EmpresaCrm): HTMLElement {
  const pessoas = ctx.file.pessoas.filter((p) => p.empresaId === empresa.id).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const lista = el('div', 'ct-mini-lista');
  pessoas.forEach((p) => {
    const b = el('button', 'ct-mini');
    b.type = 'button';
    b.appendChild(buildAvatar(p, 'p'));
    const t = el('span', 'ct-mini-textos');
    t.append(el('strong', undefined, p.nome), el('span', undefined, p.cargo || (p.emails[0] ?? '')));
    b.appendChild(t);
    b.addEventListener('click', () => ctx.abrirFicha({ tipo: 'pessoa', id: p.id }));
    lista.appendChild(b);
  });
  if (!pessoas.length) lista.appendChild(el('p', 'cf-vazio', 'Ninguém desta empresa no cadastro ainda.'));
  lista.appendChild(botaoAdicionar('Pessoa nesta empresa', () => void novaPessoaNaEmpresa(ctx, empresa)));
  return cartao('Pessoas', ICONES_CONTATO.pessoa, [lista], pessoas.length ? { contagem: String(pessoas.length) } : {});
}

async function novaPessoaNaEmpresa(ctx: CtxContatos, empresa: EmpresaCrm): Promise<void> {
  const v = await openFormModal(
    `Pessoa em ${nomeDoContato(empresa)}`,
    [
      { name: 'nome', label: 'Nome' },
      { name: 'cargo', label: 'Cargo', metade: true },
      { name: 'email', label: 'E-mail', metade: true },
    ],
    'Cadastrar',
    { icone: ICONES_CONTATO.pessoa },
  );
  if (!v) return;
  try {
    await descarregarFicha();
    await contatosState.criarPessoa({ nome: v.nome ?? '', cargo: v.cargo ?? '', emails: v.email ? [v.email] : [], empresaId: empresa.id, etapaId: empresa.etapaId });
  } catch (e) {
    ctx.falhou(e);
  }
}

export function buildColunaDados(ctx: CtxContatos, c: Pessoa | EmpresaCrm, acoes: AcoesDados): HTMLElement {
  const col = el('div', 'cf-coluna');
  // Como falar vem primeiro: é o que se procura numa ficha no dia a dia.
  col.append(cartaoContato(c, acoes), ...cartaoQuem(ctx, c), cartaoEndereco(c));
  if ('razaoSocial' in c) col.appendChild(cartaoPessoasDaEmpresa(ctx, c));
  return col;
}
