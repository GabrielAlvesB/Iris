import {
  PRIORIDADES,
  type CampoExtra,
  type EtapaPostagem,
  type EventoPostagem,
  type Prioridade,
  type Publicacao,
} from '../../../shared/types/postagens.types.js';
import { extrairHashtags, faixaDoScore, hashtagsDoTexto } from '../../../shared/types/videos.conversao.js';
import { openConfirmModal } from '../../ui/modal.js';
import { buildBotao, buildSelo, svg, tempoRelativo } from '../../ui/pagina.js';
import type { PainelHandle } from '../../ui/painel.js';
import type { Catalogo, Postagem } from './postagens.fonte.js';
import * as videosState from './videos/videos.state.js';
import { ICONES_POSTAGEM, buildRedeBadge, buildTagChip, formatarDataHora, rotuloStatus } from './postagens.ui.js';

/**
 * Seções do painel que toda postagem tem (etapa, prioridade, score, agenda,
 * redes e links, tags, informações extras, notas, histórico) e o rodapé de
 * arquivar/excluir. Os painéis de cada tipo montam o próprio corpo com elas.
 */

export const ICONE_SECAO = {
  producao: '<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>',
  conteudo: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  informacoes: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  notas: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  externo: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>',
} as const;

// ---------- Salvamento com rascunho ----------

/**
 * Campos de texto guardam rascunho e salvam na pausa da digitação (500 ms);
 * cliques salvam na hora. Fechar o painel não descarta o que foi digitado.
 */
export function criarSalvador(salvarRascunho: () => Promise<void>, painel: () => PainelHandle | null) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendente = false;

  async function descarregar(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pendente) return;
    pendente = false;
    try {
      await salvarRascunho();
      painel()?.marcarSalvo();
    } catch (erro) {
      painel()?.marcarErro(erro);
    }
  }

  function agendar(): void {
    pendente = true;
    painel()?.marcarSalvando();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void descarregar(), 500);
  }

  /** Para mudanças pontuais (data, hora): salva o rascunho já. */
  function agora(): void {
    pendente = true;
    void descarregar();
  }

  return { agendar, agora, descarregar };
}

// ---------- Estrutura ----------

/** Cartão de seção do painel, no mesmo desenho do buildSecaoModal, com ícone. */
export function buildSecaoPainel(titulo: string, icone: string, extra?: HTMLElement): { secao: HTMLElement; conteudo: HTMLElement } {
  const secao = document.createElement('section');
  secao.className = 'md-secao vd-p-secao';
  const cabeca = document.createElement('header');
  cabeca.className = 'vd-p-secao-cabeca';
  const marca = document.createElement('span');
  marca.className = 'vd-p-secao-icone';
  marca.innerHTML = svg(icone, 13, 2);
  const h = document.createElement('h3');
  h.textContent = titulo;
  cabeca.append(marca, h);
  if (extra) {
    extra.classList.add('vd-p-secao-extra');
    cabeca.appendChild(extra);
  }
  const conteudo = document.createElement('div');
  conteudo.className = 'md-secao-conteudo';
  secao.append(cabeca, conteudo);
  return { secao, conteudo };
}

export function buildCampo(rotulo: string, conteudo: HTMLElement, extra?: HTMLElement): HTMLElement {
  const campo = document.createElement('div');
  campo.className = 'vd-campo';
  const cabeca = document.createElement('div');
  cabeca.className = 'vd-campo-cabeca';
  const label = document.createElement('span');
  label.className = 'md-rotulo';
  label.textContent = rotulo;
  cabeca.appendChild(label);
  if (extra) cabeca.appendChild(extra);
  campo.append(cabeca, conteudo);
  return campo;
}

export function textareaPainel(valor: string, placeholder: string, linhas: number, aoMudar: (v: string) => void): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  el.className = 'md-input md-textarea';
  el.rows = linhas;
  el.value = valor;
  el.placeholder = placeholder;
  el.addEventListener('input', () => aoMudar(el.value));
  return el;
}

export function inputPainel(tipo: string, valor: string, placeholder: string, aoMudar: (v: string) => void): HTMLInputElement {
  const el = document.createElement('input');
  el.type = tipo;
  el.className = 'md-input';
  el.value = valor;
  el.placeholder = placeholder;
  el.addEventListener('input', () => aoMudar(el.value));
  return el;
}

/** Contador de caracteres para o cabeçalho de um campo. */
export function buildContador(texto: string, limite?: number, dica?: string): { el: HTMLElement; atualizar: (v: string) => void } {
  const el = document.createElement('span');
  el.className = 'vd-contador';
  if (dica) el.title = dica;
  const atualizar = (v: string): void => {
    const n = v.trim().length;
    el.textContent = limite ? `${n}/${limite}` : `${v.length} caracteres`;
    el.classList.toggle('is-excedido', limite !== undefined && n > limite);
  };
  atualizar(texto);
  return { el, atualizar };
}

/** Título em destaque, fora dos cartões; cresce com o texto. */
export function buildTituloPainel(
  valor: string,
  placeholder: string,
  aoMudar: (v: string) => void,
  limite?: { max: number; dica: string },
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vd-painel-titulo-wrap';
  const titulo = document.createElement('textarea');
  titulo.className = 'vd-painel-titulo';
  titulo.rows = 1;
  titulo.value = valor;
  titulo.placeholder = placeholder;
  const ajustar = (): void => {
    titulo.style.height = 'auto';
    titulo.style.height = `${titulo.scrollHeight}px`;
  };
  const contador = limite ? buildContador(valor, limite.max, limite.dica) : null;
  titulo.addEventListener('input', () => {
    contador?.atualizar(titulo.value);
    ajustar();
    aoMudar(titulo.value);
  });
  requestAnimationFrame(ajustar);
  wrap.appendChild(titulo);
  if (contador) wrap.appendChild(contador.el);
  return wrap;
}

// ---------- Produção ----------

export function buildEtapas(etapas: readonly EtapaPostagem[], atual: string, aoEscolher: (id: string) => void): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = 'md-pilulas';
  etapas
    .filter((s) => s.id !== 'arquivado')
    .forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `md-pilula is-fase-${s.fase}`;
      btn.classList.toggle('is-ativa', atual === s.id);
      btn.setAttribute('aria-pressed', String(atual === s.id));
      btn.textContent = s.rotulo;
      btn.addEventListener('click', () => {
        if (atual !== s.id) aoEscolher(s.id);
      });
      grupo.appendChild(btn);
    });
  return grupo;
}

export function buildPrioridadeEscolha(atual: Prioridade | undefined, aoEscolher: (p: Prioridade | '') => void): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = 'md-pilulas';
  [{ id: '', rotulo: 'Nenhuma' }, ...PRIORIDADES].forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `md-pilula vd-prio-escolha${p.id ? ` is-prio-${p.id}` : ''}`;
    const ativo = (atual ?? '') === p.id;
    btn.classList.toggle('is-ativa', ativo);
    btn.setAttribute('aria-pressed', String(ativo));
    if (p.id) btn.innerHTML = svg(ICONES_POSTAGEM.bandeira, 11, 2.2);
    btn.append(p.rotulo);
    btn.addEventListener('click', () => {
      if (!ativo) aoEscolher(p.id as Prioridade | '');
    });
    grupo.appendChild(btn);
  });
  return grupo;
}

/** Score 0–100 com barra na cor da faixa; salva ao sair do campo ou no Enter. */
export function buildCampoScore(score: number | undefined, aoSalvar: (score: number | null) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vd-score-campo';
  const campo = document.createElement('input');
  campo.type = 'number';
  campo.min = '0';
  campo.max = '100';
  campo.step = '0.1';
  campo.placeholder = '0–100';
  campo.className = 'md-input';
  campo.value = score === undefined ? '' : String(score);
  campo.setAttribute('aria-label', 'Score de 0 a 100');
  const trilho = document.createElement('div');
  trilho.className = 'vd-score-trilho';
  const barra = document.createElement('i');
  trilho.appendChild(barra);
  const faixa = document.createElement('span');
  faixa.className = 'vd-score-faixa';

  const desenhar = (): void => {
    const n = Number(campo.value.replace(',', '.'));
    const valido = campo.value !== '' && !Number.isNaN(n) && n >= 0 && n <= 100;
    campo.classList.toggle('is-invalido', campo.value !== '' && !valido);
    barra.style.width = valido ? `${n}%` : '0%';
    barra.className = valido ? `is-${faixaDoScore(n).id}` : '';
    faixa.textContent = valido ? faixaDoScore(n).rotulo : campo.value === '' ? 'sem score' : 'use 0 a 100';
  };
  const salvarScore = (): void => {
    const n = Number(campo.value.replace(',', '.'));
    if (campo.value === '') aoSalvar(null);
    else if (!Number.isNaN(n) && n >= 0 && n <= 100) aoSalvar(n);
  };
  campo.addEventListener('input', desenhar);
  campo.addEventListener('change', salvarScore);
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') campo.blur();
  });
  desenhar();
  wrap.append(campo, trilho, faixa);
  return wrap;
}

// ---------- Agenda, redes e tags ----------

export function buildAgendamento(
  data: string,
  hora: string,
  aoMudar: (campo: 'dataAgendada' | 'horaAgendada', valor: string) => void,
): HTMLElement {
  const agenda = document.createElement('div');
  agenda.className = 'md-grade-2 vd-agenda-campos';
  const dataEl = document.createElement('input');
  dataEl.type = 'date';
  dataEl.className = 'md-input';
  dataEl.value = data;
  const horaEl = document.createElement('input');
  horaEl.type = 'time';
  horaEl.className = 'md-input';
  horaEl.value = hora;
  // Data e hora salvam na hora da escolha: são poucas mudanças e afetam a agenda.
  dataEl.addEventListener('change', () => aoMudar('dataAgendada', dataEl.value));
  horaEl.addEventListener('change', () => aoMudar('horaAgendada', horaEl.value));
  agenda.append(buildCampo('Data', dataEl), buildCampo('Horário', horaEl));
  return agenda;
}

export function buildRedes(catalogo: Catalogo, redeIds: string[], aoMudar: (ids: string[]) => void): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = 'vd-escolhas';
  if (catalogo.redes.length === 0) {
    grupo.appendChild(Object.assign(document.createElement('span'), { className: 'vd-vazio-inline', textContent: 'Nenhuma rede cadastrada.' }));
  }
  catalogo.redes.forEach((rede) => {
    const ativo = redeIds.includes(rede.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vd-escolha';
    btn.setAttribute('aria-pressed', String(ativo));
    btn.appendChild(buildRedeBadge(rede, { comNome: true, ativo }));
    btn.addEventListener('click', () => aoMudar(ativo ? redeIds.filter((id) => id !== rede.id) : [...redeIds, rede.id]));
    grupo.appendChild(btn);
  });
  return grupo;
}

/** Tags do catálogo, com campo para criar uma nova ali mesmo. */
export function buildTags(catalogo: Catalogo, tagIds: string[], aoMudar: (ids: string[]) => void, aoErro: (e: unknown) => void): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = 'vd-escolhas';
  catalogo.tags.forEach((tag) => {
    const ativo = tagIds.includes(tag.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vd-escolha';
    btn.setAttribute('aria-pressed', String(ativo));
    btn.appendChild(buildTagChip(tag, { ativo }));
    btn.addEventListener('click', () => aoMudar(ativo ? tagIds.filter((id) => id !== tag.id) : [...tagIds, tag.id]));
    grupo.appendChild(btn);
  });

  const nova = document.createElement('input');
  nova.className = 'vd-tag-nova';
  nova.placeholder = '+ nova tag';
  nova.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const nome = nova.value.trim();
    if (!nome) return;
    nova.disabled = true;
    const existente = catalogo.tags.find((t) => t.nome.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'));
    const garantir = existente
      ? Promise.resolve(existente.id)
      : videosState.salvarTag({ nome, cor: '' }).then((novo) => novo.tags.find((t) => t.nome === nome)?.id);
    void garantir
      .then((tagId) => {
        if (tagId && !tagIds.includes(tagId)) aoMudar([...tagIds, tagId]);
      })
      .catch(aoErro);
  });
  grupo.appendChild(nova);
  return grupo;
}

export function buildPublicacoes(
  catalogo: Catalogo,
  redeIds: string[],
  publicacoes: Publicacao[],
  aoMudar: (publicacoes: Publicacao[]) => void,
): HTMLElement {
  const lista = document.createElement('div');
  lista.className = 'vd-publicacoes';
  const redes = redeIds.map((id) => catalogo.redes.find((r) => r.id === id)).filter((r) => r !== undefined);
  if (redes.length === 0) {
    lista.appendChild(Object.assign(document.createElement('span'), { className: 'vd-vazio-inline', textContent: 'Escolha as redes acima para registrar os links.' }));
    return lista;
  }
  redes.forEach((rede) => {
    const linha = document.createElement('div');
    linha.className = 'vd-publicacao';
    linha.appendChild(buildRedeBadge(rede));

    const atual = publicacoes.find((p) => p.redeId === rede.id)?.url ?? '';
    const input = document.createElement('input');
    input.className = 'md-input';
    input.type = 'url';
    input.placeholder = `Link no ${rede.nome}`;
    input.value = atual;
    input.addEventListener('change', () => {
      const outras = publicacoes.filter((p) => p.redeId !== rede.id);
      aoMudar(input.value.trim() ? [...outras, { redeId: rede.id, url: input.value.trim() }] : outras);
    });
    linha.appendChild(input);

    if (/^https?:\/\//i.test(atual)) {
      const abrir = buildBotao('', { icone: ICONE_SECAO.externo, variante: 'fantasma', titulo: 'Abrir publicação' });
      abrir.addEventListener('click', () => window.irisAPI.system.openExternalLink(atual));
      linha.appendChild(abrir);
    }
    lista.appendChild(linha);
  });
  return lista;
}

/**
 * Hashtags como chips, embaixo do campo onde são escritas. `emTexto`: o campo é
 * texto corrido (legenda) e só conta o que tem #.
 */
export function buildPreviaHashtags(emTexto = false): { el: HTMLElement; desenhar: (texto: string) => void } {
  const el = document.createElement('div');
  el.className = 'vd-hashtags-previa';
  const desenhar = (texto: string): void => {
    el.innerHTML = '';
    (emTexto ? hashtagsDoTexto(texto) : extrairHashtags(texto)).forEach((h) => {
      const chip = document.createElement('span');
      chip.className = 'vd-hashtag';
      chip.textContent = `#${h}`;
      el.appendChild(chip);
    });
  };
  return { el, desenhar };
}

/** Botão pequeno "Copiar …" que confirma com "Copiado!". */
export function buildBotaoCopiar(rotulo: string, titulo: string, texto: () => string): HTMLButtonElement {
  const copiar = buildBotao(rotulo, { icone: ICONE_SECAO.copiar, variante: 'fantasma', titulo });
  copiar.classList.add('is-mini');
  copiar.addEventListener('click', () => {
    window.irisAPI.system.copyToClipboard(texto());
    const span = copiar.querySelector('span');
    if (span) {
      span.textContent = 'Copiado!';
      setTimeout(() => (span.textContent = rotulo), 1400);
    }
  });
  return copiar;
}

// ---------- Informações extras ----------

/**
 * Campos livres (nome + valor). Vive de uma lista mutável do rascunho, como os
 * outros textos, para não perder o cursor quando o arquivo muda por fora.
 * `acoesExtras` acrescenta botões ao lado de "+ Campo" (ex.: trazer colunas da planilha).
 */
export function buildExtras(
  extras: CampoExtra[],
  aoMudar: () => void,
  acoesExtras?: (acoes: HTMLElement, redesenhar: () => void) => void,
): HTMLElement {
  const bloco = document.createElement('div');
  bloco.className = 'vd-extras';

  const desenhar = (focarUltimo = false): void => {
    bloco.innerHTML = '';

    extras.forEach((campo, indice) => {
      const linha = document.createElement('div');
      linha.className = 'vd-extra';
      const nome = document.createElement('input');
      nome.className = 'md-input vd-extra-nome';
      nome.value = campo.nome;
      nome.placeholder = 'Campo';
      nome.setAttribute('aria-label', 'Nome do campo');
      nome.addEventListener('input', () => {
        campo.nome = nome.value;
        aoMudar();
      });
      const valor = document.createElement('textarea');
      valor.className = 'md-input md-textarea vd-extra-valor';
      valor.rows = 1;
      valor.value = campo.valor;
      valor.placeholder = 'Valor';
      valor.setAttribute('aria-label', `Valor de ${campo.nome || 'campo'}`);
      const ajustar = (): void => {
        valor.style.height = 'auto';
        valor.style.height = `${valor.scrollHeight}px`;
      };
      valor.addEventListener('input', () => {
        campo.valor = valor.value;
        ajustar();
        aoMudar();
      });
      requestAnimationFrame(ajustar);
      const copiar = document.createElement('button');
      copiar.type = 'button';
      copiar.className = 'bb-acao';
      copiar.title = 'Copiar valor';
      copiar.innerHTML = svg(ICONE_SECAO.copiar, 13, 2);
      copiar.addEventListener('click', () => window.irisAPI.system.copyToClipboard(campo.valor));
      const remover = document.createElement('button');
      remover.type = 'button';
      remover.className = 'bb-acao';
      remover.title = 'Remover campo';
      remover.innerHTML = svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 13, 2);
      remover.addEventListener('click', () => {
        extras.splice(indice, 1);
        aoMudar();
        desenhar();
      });
      linha.append(nome, valor, copiar, remover);
      bloco.appendChild(linha);
    });

    const acoes = document.createElement('div');
    acoes.className = 'vd-extras-acoes';
    const adicionar = buildBotao('Campo', { icone: ICONES_POSTAGEM.mais, variante: 'fantasma', titulo: 'Adicionar uma informação' });
    adicionar.classList.add('is-mini');
    adicionar.addEventListener('click', () => {
      extras.push({ nome: '', valor: '' });
      desenhar(true);
    });
    acoes.appendChild(adicionar);
    acoesExtras?.(acoes, () => desenhar());
    bloco.appendChild(acoes);

    if (focarUltimo) [...bloco.querySelectorAll<HTMLInputElement>('.vd-extra-nome')].pop()?.focus();
  };

  desenhar();
  return bloco;
}

// ---------- Histórico e rodapé ----------

function descreverEvento(e: EventoPostagem): string {
  switch (e.tipo) {
    case 'criado':
      return `Criado em ${e.para ?? 'Ideias'}`;
    case 'importado':
      return `Importado do Sheets${e.detalhe ? ` (${e.detalhe})` : ''}`;
    case 'status':
      return `${e.de ?? '?'} → ${e.para ?? '?'}`;
    case 'arquivado':
      return e.detalhe === 'cancelado' ? 'Cancelado' : 'Arquivado';
    case 'restaurado':
      return `Restaurado para ${e.para ?? 'a pipeline'}`;
    case 'editado':
      return `Editado: ${e.detalhe ?? ''}`;
  }
}

export function buildHistorico(historico: EventoPostagem[]): HTMLElement {
  if (historico.length === 0) {
    return Object.assign(document.createElement('p'), { className: 'vd-vazio-inline', textContent: 'Sem registros ainda.' });
  }
  const lista = document.createElement('ol');
  lista.className = 'vd-historico';
  [...historico].reverse().forEach((e) => {
    const item = document.createElement('li');
    item.className = `is-${e.tipo}`;
    const texto = document.createElement('span');
    texto.textContent = descreverEvento(e);
    const quando = document.createElement('time');
    quando.dateTime = e.em;
    quando.title = formatarDataHora(e.em);
    quando.textContent = tempoRelativo(e.em);
    item.append(texto, quando);
    lista.appendChild(item);
  });
  return lista;
}

export function buildSeloEtapa(item: Postagem, etapas: readonly EtapaPostagem[]): HTMLElement {
  return buildSelo(
    item.status === 'arquivado' && item.motivoArquivamento === 'cancelado' ? 'Cancelado' : rotuloStatus(item.status, etapas),
    item.status === 'publicado' ? 'ok' : 'neutro',
  );
}

export interface AcoesRodape {
  /** "vídeo", "publicação" — usado na confirmação de exclusão. */
  nome: string;
  etapas: readonly EtapaPostagem[];
  restaurar: () => Promise<unknown>;
  arquivar: (motivo: 'cancelado' | 'arquivado') => Promise<unknown>;
  excluir: () => Promise<unknown>;
  aoErro: (e: unknown) => void;
}

export function buildRodapePostagem(item: Postagem, acoes: AcoesRodape): HTMLElement[] {
  const botoes: HTMLElement[] = [];
  if (item.status === 'arquivado') {
    const restaurar = buildBotao(`Restaurar para ${rotuloStatus(item.statusAntesDeArquivar ?? 'ideia', acoes.etapas)}`, {
      icone: ICONES_POSTAGEM.historico,
    });
    restaurar.addEventListener('click', () => void acoes.restaurar().catch(acoes.aoErro));
    botoes.push(restaurar);
  } else {
    const cancelar = buildBotao('Marcar cancelado', { variante: 'fantasma', titulo: 'Tirar da pipeline marcando como cancelado' });
    cancelar.addEventListener('click', () => void acoes.arquivar('cancelado').catch(acoes.aoErro));
    const arquivar = buildBotao('Arquivar', { icone: ICONES_POSTAGEM.arquivo, variante: 'fantasma' });
    arquivar.addEventListener('click', () => void acoes.arquivar('arquivado').catch(acoes.aoErro));
    botoes.push(cancelar, arquivar);
  }

  const espaco = document.createElement('span');
  espaco.className = 'pg-espaco';
  botoes.push(espaco);

  const excluir = buildBotao('', { icone: ICONES_POSTAGEM.lixeira, variante: 'fantasma', titulo: 'Excluir definitivamente' });
  excluir.classList.add('is-perigo');
  excluir.addEventListener('click', () => {
    void openConfirmModal({
      title: `Excluir ${acoes.nome}`,
      message: `"${item.titulo}" e todo o histórico serão apagados. Para só tirar da pipeline, use Arquivar.`,
    }).then((ok) => {
      if (ok) void acoes.excluir().catch(acoes.aoErro);
    });
  });
  botoes.push(excluir);
  return botoes;
}
