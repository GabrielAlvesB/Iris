import {
  CORES_FAIXA,
  MODELOS_ESCALA,
  SENTIDOS_FAIXA,
  faixaDaEscala,
  intervaloDaFaixa,
  metaDaEscala,
  problemaDaEscala,
  type EscalaScore,
  type FaixaScore,
  type SentidoFaixa,
} from '../../../shared/types/score.types.js';
import type { TagPostagem } from '../../../shared/types/postagens.types.js';
import type { SalvarEscalaInput } from '../../../shared/types/videos.types.js';
import { openConfirmModal, openCustomModal, openFormModal } from '../../ui/modal.js';
import { input, pilulas, select } from '../../ui/campos.js';
import { buildBotao, buildSelo } from '../../ui/pagina.js';
import { buildSeletorCor } from './postagens.tags.js';
import { ICONES_POSTAGEM, ICONE_EMPRESA, buildTagChip, ordenarTags } from './postagens.ui.js';
import * as videosState from './videos/videos.state.js';

/**
 * Escalas de score: o usuário define as faixas (nome, onde começa, cor e se é
 * positiva, mediana ou negativa) e cada empresa escolhe a sua. O mesmo
 * cadastro aparece em Ajustes › Escalas de score e no botão "Escalas de score"
 * da aba Métricas.
 */

export const ICONE_ESCALA = '<path d="M3 3v18h18"/><path d="M7 15h3"/><path d="M7 11h7"/><path d="M7 7h11"/>';

const PALETA_FAIXAS = CORES_FAIXA.map((c) => c.cor);

/** Faixa em edição: o início fica como texto para aceitar digitação parcial ("8", "85,"). */
interface FaixaRascunho {
  id?: string;
  rotulo: string;
  de: string;
  cor: string;
  sentido: SentidoFaixa;
}

interface Rascunho {
  nome: string;
  faixas: FaixaRascunho[];
}

/**
 * Rascunhos por escala. Ficam fora do cartão porque salvar outra escala (ou
 * mexer numa empresa) redesenha o cadastro inteiro — o que estava sendo
 * digitado aqui não pode sumir por isso.
 */
const rascunhos = new Map<string, Rascunho>();

function numeroBr(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function lerNumero(texto: string): number {
  const limpo = texto.trim().replace(',', '.');
  return limpo === '' ? NaN : Number(limpo);
}

function rascunhoDe(escala: EscalaScore): Rascunho {
  return {
    nome: escala.nome,
    faixas: escala.faixas.map((f) => ({ id: f.id, rotulo: f.rotulo, de: String(f.de).replace('.', ','), cor: f.cor, sentido: f.sentido })),
  };
}

function iguais(a: Rascunho, b: Rascunho): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** O rascunho como escala, na ordem em que está (a validação aponta o que está fora de ordem). */
function escalaDoRascunho(id: string, r: Rascunho): EscalaScore {
  return {
    id,
    nome: r.nome,
    faixas: r.faixas.map((f, i) => ({ id: f.id ?? `nova-${i}`, rotulo: f.rotulo, de: Math.round(lerNumero(f.de) * 10) / 10, cor: f.cor, sentido: f.sentido })),
  };
}

function paraSalvar(id: string | undefined, r: Rascunho): SalvarEscalaInput {
  return {
    ...(id ? { id } : {}),
    nome: r.nome.trim(),
    faixas: r.faixas.map((f) => ({ ...(f.id ? { id: f.id } : {}), rotulo: f.rotulo.trim(), de: Math.round(lerNumero(f.de) * 10) / 10, cor: f.cor, sentido: f.sentido })),
  };
}

function empresas(): TagPostagem[] {
  return ordenarTags((videosState.getCurrentState()?.tags ?? []).filter((t) => t.empresa));
}

/** Empresas cujas postagens são lidas por esta escala. */
function empresasDaEscala(escala: EscalaScore, padraoId: string): TagPostagem[] {
  return empresas().filter((t) => (t.escalaScoreId ?? padraoId) === escala.id);
}

// ---------- Peças visuais ----------

/**
 * A escala de relance: uma barra de 0 a 100 com um segmento por faixa, na cor
 * dela, e onde cada uma começa escrito embaixo.
 */
export function buildBarraEscala(escala: EscalaScore, compacta = false): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `es-barra-wrap${compacta ? ' is-compacta' : ''}`;
  const barra = document.createElement('div');
  barra.className = 'es-barra';
  barra.setAttribute('role', 'img');
  barra.setAttribute('aria-label', escala.faixas.map((f, i) => `${f.rotulo}: ${intervaloDaFaixa(escala, i)}`).join('; '));
  const marcas = document.createElement('div');
  marcas.className = 'es-marcas';
  // Cortes muito próximos (80 e 85) se sobreporiam: o segundo desce uma linha.
  let ultimaEmCima = -Infinity;
  let temBaixo = false;
  const marcar = (valor: number, classe = ''): void => {
    const marca = document.createElement('span');
    marca.className = `es-marca${classe}`;
    marca.style.left = `${valor}%`;
    marca.textContent = numeroBr(valor);
    if (valor - ultimaEmCima < 7) {
      marca.classList.add('is-baixo');
      temBaixo = true;
    } else ultimaEmCima = valor;
    marcas.appendChild(marca);
  };
  escala.faixas.forEach((f, i) => {
    const fim = escala.faixas[i + 1]?.de ?? 100;
    const seg = document.createElement('span');
    seg.className = 'es-segmento';
    seg.style.setProperty('--c', f.cor);
    seg.style.flexGrow = String(Math.max(fim - f.de, 0.0001));
    seg.title = `${f.rotulo}: ${intervaloDaFaixa(escala, i)} · ${SENTIDOS_FAIXA.find((s) => s.id === f.sentido)?.rotulo ?? ''}`;
    // Faixa estreita não tem onde escrever o nome sem cortar: fica a cor, o
    // title e a lista de faixas logo abaixo.
    if (!compacta && fim - f.de >= 12) seg.textContent = f.rotulo;
    barra.appendChild(seg);
    marcar(f.de);
  });
  marcar(100, ' is-fim');
  wrap.classList.toggle('tem-baixo', temBaixo);
  wrap.append(barra, marcas);
  return wrap;
}

// ---------- Cartão de uma escala ----------

function buildCartaoEscala(escala: EscalaScore, padraoId: string, redesenhar: () => void, erro: (e: unknown) => void): HTMLElement {
  const salvo = rascunhoDe(escala);
  const r = rascunhos.get(escala.id) ?? rascunhoDe(escala);
  const ehPadrao = escala.id === padraoId;

  const cartao = document.createElement('section');
  cartao.className = 'es-cartao';
  cartao.classList.toggle('is-padrao', ehPadrao);

  // Cabeçalho: nome, selo de padrão e ações da escala inteira.
  const cab = document.createElement('header');
  cab.className = 'es-cab';
  const nome = input('text', r.nome, 'Nome da escala (ex.: Exigente)');
  nome.className = 'md-input es-nome';
  nome.maxLength = 60;
  nome.setAttribute('aria-label', 'Nome da escala');
  cab.appendChild(nome);
  if (ehPadrao) {
    const selo = buildSelo('Padrão', 'ok');
    selo.title = 'Usada por postagens sem empresa e por empresas sem escala escolhida';
    cab.appendChild(selo);
  }
  const acoesCab = document.createElement('div');
  acoesCab.className = 'es-cab-acoes';
  if (!ehPadrao) {
    const tornar = buildBotao('Tornar padrão', { variante: 'fantasma', titulo: 'Usar esta escala para postagens sem empresa e empresas sem escala escolhida' });
    tornar.addEventListener('click', () => void videosState.definirEscalaPadrao(escala.id).then(redesenhar).catch(erro));
    acoesCab.appendChild(tornar);
  }
  const duplicar = buildBotao('', { icone: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', variante: 'fantasma', titulo: 'Duplicar escala' });
  duplicar.setAttribute('aria-label', `Duplicar a escala "${escala.nome}"`);
  duplicar.addEventListener('click', () => {
    const copia = paraSalvar(undefined, salvo);
    const nomes = new Set((videosState.getCurrentState()?.escalasScore ?? []).map((e) => e.nome.toLowerCase()));
    let n = 1;
    let novoNome = `${escala.nome} (cópia)`;
    while (nomes.has(novoNome.toLowerCase())) novoNome = `${escala.nome} (cópia ${++n})`;
    void videosState
      .salvarEscala({ ...copia, nome: novoNome, faixas: copia.faixas.map(({ id: _id, ...f }) => f) })
      .then(redesenhar)
      .catch(erro);
  });
  acoesCab.appendChild(duplicar);
  if (!ehPadrao) {
    const excluir = buildBotao('', { icone: ICONES_POSTAGEM.lixeira, variante: 'fantasma', titulo: 'Excluir escala' });
    excluir.classList.add('is-perigo');
    excluir.setAttribute('aria-label', `Excluir a escala "${escala.nome}"`);
    excluir.addEventListener('click', () => {
      const usando = empresasDaEscala(escala, padraoId);
      void openConfirmModal({
        title: 'Excluir escala',
        message: usando.length
          ? `"${escala.nome}" é usada por ${usando.map((t) => t.nome).join(', ')}. Essas empresas voltam para a escala padrão.`
          : `Excluir a escala "${escala.nome}"?`,
      }).then((ok) => {
        if (!ok) return;
        rascunhos.delete(escala.id);
        void videosState.excluirEscala(escala.id).then(redesenhar).catch(erro);
      });
    });
    acoesCab.appendChild(excluir);
  }
  cab.appendChild(acoesCab);

  // Barra visual (redesenhada a cada tecla, sem mexer nos campos).
  const barraSlot = document.createElement('div');
  barraSlot.className = 'es-barra-slot';

  // Faixas
  const lista = document.createElement('div');
  lista.className = 'es-faixas';
  lista.setAttribute('role', 'list');
  lista.setAttribute('aria-label', 'Faixas da escala');

  const problema = document.createElement('p');
  problema.className = 'md-erro es-problema';
  problema.setAttribute('role', 'alert');

  const resumo = document.createElement('p');
  resumo.className = 'es-resumo';

  // Rodapé: testar um score, descartar, salvar.
  const teste = input('text', '', 'ex.: 72');
  teste.className = 'md-input es-teste-campo';
  teste.inputMode = 'decimal';
  teste.setAttribute('aria-label', 'Testar um score nesta escala');
  const testeResultado = document.createElement('span');
  testeResultado.className = 'es-teste-resultado';
  testeResultado.setAttribute('aria-live', 'polite');
  const descartar = buildBotao('Descartar', { variante: 'fantasma', titulo: 'Voltar ao que está salvo' });
  const salvar = buildBotao('Salvar escala', { icone: '<polyline points="20 6 9 17 4 12"/>', variante: 'primario' });

  const fimDoRascunho = (i: number): string => {
    const proxima = r.faixas[i + 1];
    if (!proxima) return '100';
    const n = lerNumero(proxima.de);
    return Number.isFinite(n) ? numeroBr(Math.round((n - 0.1) * 10) / 10) : '…';
  };

  const fins: HTMLElement[] = [];

  /** Barra, fins calculados, problema e botões — tudo que muda com a digitação. */
  const atualizar = (): void => {
    const sujo = !iguais(r, salvo);
    if (sujo) rascunhos.set(escala.id, r);
    else rascunhos.delete(escala.id);
    cartao.classList.toggle('is-sujo', sujo);

    const candidata = escalaDoRascunho(escala.id, r);
    const motivo = problemaDaEscala(candidata);
    problema.textContent = motivo ?? '';
    problema.hidden = !motivo;
    barraSlot.replaceChildren(buildBarraEscala(motivo ? escala : candidata));
    barraSlot.classList.toggle('is-desatualizada', Boolean(motivo));
    fins.forEach((el, i) => (el.textContent = `até ${fimDoRascunho(i)}`));

    const valida = motivo ? escala : candidata;
    const meta = metaDaEscala(valida);
    const usando = empresasDaEscala(escala, padraoId);
    resumo.textContent = [
      meta === undefined ? 'Sem faixa positiva: o gráfico de score fica sem linha de meta.' : `Meta no gráfico de score: ${numeroBr(meta)} (início da primeira faixa positiva).`,
      sujo ? (usando.length || ehPadrao ? 'Ao salvar, muda a leitura de todas as postagens que usam esta escala.' : '') : '',
    ]
      .filter(Boolean)
      .join(' ');

    const n = lerNumero(teste.value);
    if (teste.value.trim() === '') testeResultado.replaceChildren();
    else if (!Number.isFinite(n) || n < 0 || n > 100) testeResultado.replaceChildren('use 0 a 100');
    else {
      const f = faixaDaEscala(valida, n);
      const chip = document.createElement('span');
      chip.className = 'vd-score';
      chip.style.setProperty('--c', f.cor);
      const b = document.createElement('b');
      b.textContent = numeroBr(n);
      chip.append(b, f.rotulo);
      testeResultado.replaceChildren('cai em', chip);
    }

    descartar.hidden = !sujo;
    salvar.disabled = !sujo || Boolean(motivo);
    salvar.title = motivo ? motivo : sujo ? 'Salvar as faixas desta escala' : 'Nada mudou desde o último salvamento';
  };

  const desenharFaixas = (): void => {
    lista.replaceChildren();
    fins.length = 0;
    r.faixas.forEach((f, i) => {
      const linha = document.createElement('div');
      linha.className = 'es-faixa';
      linha.setAttribute('role', 'listitem');

      const cor = buildSeletorCor(
        f.cor,
        (c) => {
          f.cor = c;
          atualizar();
        },
        PALETA_FAIXAS,
      );

      const rotulo = input('text', f.rotulo, 'Nome (ex.: Péssimo)');
      rotulo.maxLength = 40;
      rotulo.setAttribute('aria-label', `Nome da ${i + 1}ª faixa`);
      rotulo.addEventListener('input', () => {
        f.rotulo = rotulo.value;
        atualizar();
      });

      const intervalo = document.createElement('div');
      intervalo.className = 'es-intervalo';
      const de = input('text', i === 0 ? '0' : f.de, '0–100');
      de.className = 'md-input es-de';
      de.inputMode = 'decimal';
      de.setAttribute('aria-label', `Onde a faixa "${f.rotulo || i + 1}" começa`);
      if (i === 0) {
        // A primeira cobre desde o zero: sem isso sobraria um buraco no começo.
        de.disabled = true;
        de.title = 'A primeira faixa sempre começa em 0';
      }
      de.addEventListener('input', () => {
        f.de = de.value;
        atualizar();
      });
      // Ao sair do campo, as faixas se reordenam pelo início (se a digitação
      // deixou alguma fora de ordem) — a lista fica sempre de baixo para cima.
      de.addEventListener('change', () => {
        const ordenadas = [...r.faixas].sort((a, b) => lerNumero(a.de) - lerNumero(b.de));
        if (ordenadas.some((x, j) => x !== r.faixas[j]) && ordenadas.every((x) => Number.isFinite(lerNumero(x.de)))) {
          r.faixas.splice(0, r.faixas.length, ...ordenadas);
          r.faixas[0]!.de = '0';
          desenharFaixas();
        }
      });
      const fim = document.createElement('span');
      fim.className = 'es-fim';
      fins.push(fim);
      intervalo.append(Object.assign(document.createElement('span'), { className: 'es-de-rotulo', textContent: 'de' }), de, fim);

      const sentido = pilulas<SentidoFaixa>(
        SENTIDOS_FAIXA.map((s) => ({ id: s.id, rotulo: s.rotulo, classe: `es-sentido is-${s.id}` })),
        () => f.sentido,
        (v) => {
          f.sentido = v;
          atualizar();
        },
      );
      sentido.classList.add('es-sentidos');
      sentido.setAttribute('aria-label', 'Como esta faixa conta nas métricas');

      const remover = buildBotao('', { icone: ICONES_POSTAGEM.lixeira, variante: 'fantasma', titulo: r.faixas.length <= 2 ? 'Uma escala precisa de pelo menos duas faixas' : 'Remover faixa' });
      remover.classList.add('is-perigo');
      remover.setAttribute('aria-label', `Remover a faixa "${f.rotulo || i + 1}"`);
      remover.disabled = r.faixas.length <= 2;
      remover.addEventListener('click', () => {
        r.faixas.splice(i, 1);
        // Tirando a primeira, a seguinte passa a cobrir desde o zero.
        if (r.faixas[0]) r.faixas[0].de = '0';
        desenharFaixas();
      });

      cor.classList.add('es-c-cor');
      rotulo.classList.add('es-c-nome');
      remover.classList.add('es-c-remover');
      linha.append(cor, rotulo, intervalo, sentido, remover);
      lista.appendChild(linha);
    });
    atualizar();
  };

  const adicionar = buildBotao('Adicionar faixa', { icone: ICONES_POSTAGEM.mais, variante: 'secundario', titulo: 'Divide ao meio a faixa mais larga' });
  adicionar.addEventListener('click', () => {
    // Divide a faixa mais larga: a escala continua cobrindo de 0 a 100 sem buraco.
    const valida = escalaDoRascunho(escala.id, r);
    if (problemaDaEscala(valida)) {
      erro(new Error('Corrija a escala antes de adicionar uma faixa.'));
      return;
    }
    let maior = 0;
    let largura = -1;
    valida.faixas.forEach((f, i) => {
      const l = (valida.faixas[i + 1]?.de ?? 100) - f.de;
      if (l > largura) {
        largura = l;
        maior = i;
      }
    });
    if (largura < 0.2) return;
    const inicio = Math.round((valida.faixas[maior]!.de + largura / 2) * 10) / 10;
    r.faixas.splice(maior + 1, 0, { rotulo: 'Nova faixa', de: String(inicio).replace('.', ','), cor: '#f59e0b', sentido: 'mediano' });
    desenharFaixas();
    lista.querySelectorAll<HTMLInputElement>('.es-faixa input[type="text"]:not(.es-de)')[maior + 1]?.select();
  });

  nome.addEventListener('input', () => {
    r.nome = nome.value;
    atualizar();
  });
  teste.addEventListener('input', atualizar);

  descartar.addEventListener('click', () => {
    rascunhos.delete(escala.id);
    redesenhar();
  });
  salvar.addEventListener('click', () => {
    salvar.disabled = true;
    void videosState
      .salvarEscala(paraSalvar(escala.id, r))
      .then(() => {
        rascunhos.delete(escala.id);
        redesenhar();
      })
      .catch((e: unknown) => {
        erro(e);
        atualizar();
      });
  });

  // Empresas que usam a escala, com atalho para ligar/desligar daqui mesmo.
  const usoWrap = document.createElement('div');
  usoWrap.className = 'es-uso';
  const usoRotulo = document.createElement('span');
  usoRotulo.className = 'md-rotulo';
  usoRotulo.textContent = 'Usada por';
  const chips = document.createElement('div');
  chips.className = 'es-uso-chips';
  const usando = empresasDaEscala(escala, padraoId);
  usando.forEach((t) => {
    const item = document.createElement('span');
    item.className = 'es-uso-item';
    item.appendChild(buildTagChip(t, { compacto: true }));
    if (!ehPadrao) {
      const tirar = document.createElement('button');
      tirar.type = 'button';
      tirar.className = 'es-uso-tirar';
      tirar.title = `"${t.nome}" volta para a escala padrão`;
      tirar.setAttribute('aria-label', tirar.title);
      tirar.textContent = '×';
      tirar.addEventListener('click', () => void videosState.salvarTag({ id: t.id, nome: t.nome, cor: t.cor, escalaScoreId: '' }).then(redesenhar).catch(erro));
      item.appendChild(tirar);
    }
    chips.appendChild(item);
  });
  if (ehPadrao) chips.appendChild(Object.assign(document.createElement('span'), { className: 'es-uso-texto', textContent: usando.length ? 'e postagens sem empresa' : 'postagens sem empresa' }));
  else if (!usando.length) chips.appendChild(Object.assign(document.createElement('span'), { className: 'es-uso-texto', textContent: 'Nenhuma empresa ainda.' }));
  const outras = empresas().filter((t) => !usando.includes(t));
  if (outras.length) {
    const ligar = select('', [{ value: '', label: '+ Usar nesta escala…' }, ...outras.map((t) => ({ value: t.id, label: t.nome }))]);
    ligar.className = 'md-input es-uso-ligar';
    ligar.setAttribute('aria-label', `Escolher uma empresa para usar a escala "${escala.nome}"`);
    ligar.addEventListener('change', () => {
      const t = outras.find((x) => x.id === ligar.value);
      if (!t) return;
      // Ligar à padrão = não guardar escolha (acompanha a padrão se ela mudar).
      void videosState.salvarTag({ id: t.id, nome: t.nome, cor: t.cor, escalaScoreId: ehPadrao ? '' : escala.id }).then(redesenhar).catch(erro);
    });
    chips.appendChild(ligar);
  }
  usoWrap.append(usoRotulo, chips);

  const pe = document.createElement('footer');
  pe.className = 'es-pe';
  const testeWrap = document.createElement('label');
  testeWrap.className = 'es-teste';
  testeWrap.append(Object.assign(document.createElement('span'), { className: 'md-rotulo', textContent: 'Testar um score' }), teste, testeResultado);
  const botoes = document.createElement('div');
  botoes.className = 'es-pe-botoes';
  botoes.append(descartar, salvar);
  pe.append(testeWrap, botoes);

  const legenda = document.createElement('div');
  legenda.className = 'es-legenda';
  legenda.append(
    Object.assign(document.createElement('span'), { textContent: 'Cor' }),
    Object.assign(document.createElement('span'), { textContent: 'Nome da faixa' }),
    Object.assign(document.createElement('span'), { textContent: 'Começa em → termina em' }),
    Object.assign(document.createElement('span'), { textContent: 'Conta como' }),
  );

  cartao.append(cab, barraSlot, legenda, lista, adicionar, problema, resumo, usoWrap, pe);
  desenharFaixas();
  return cartao;
}

// ---------- Cadastro ----------

async function novaEscala(redesenhar: () => void, erro: (e: unknown) => void): Promise<void> {
  const file = videosState.getCurrentState();
  const padrao = file?.escalasScore.find((e) => e.id === file.escalaPadraoId);
  const valores = await openFormModal(
    'Nova escala de score',
    [
      { name: 'nome', label: 'Nome', placeholder: 'ex.: Exigente, Cliente novo, Campanhas', dica: 'Aparece ao escolher a escala de uma empresa e nos relatórios.' },
      {
        name: 'modelo',
        label: 'Começar de',
        type: 'select',
        defaultValue: 'tres',
        options: [
          ...MODELOS_ESCALA.map((m) => ({ value: m.id, label: `${m.rotulo} — ${m.descricao}` })),
          ...(padrao ? [{ value: 'padrao', label: `Uma cópia da escala padrão (${padrao.nome})` }] : []),
        ],
        dica: 'É só o ponto de partida: nomes, cortes, cores e quantidade de faixas se ajustam depois.',
      },
    ],
    'Criar escala',
    { icone: ICONE_ESCALA, subtitulo: 'Faixas com nome, de quanto a quanto vão e se contam como positivas, medianas ou negativas.' },
  );
  if (!valores) return;
  const modelo = MODELOS_ESCALA.find((m) => m.id === valores.modelo);
  const faixas: Array<Omit<FaixaScore, 'id'>> = modelo
    ? modelo.faixas
    : padrao
      ? padrao.faixas.map(({ id: _id, ...f }) => f)
      : MODELOS_ESCALA[0]!.faixas;
  try {
    await videosState.salvarEscala({ nome: valores.nome ?? '', faixas });
    redesenhar();
  } catch (e) {
    erro(e);
  }
}

/**
 * Explicação do modelo, recolhida: quem já entendeu não precisa ler de novo a
 * cada visita, e o que importa (as escalas) sobe para perto do topo.
 */
function buildComoFunciona(): HTMLElement {
  const caixa = document.createElement('details');
  caixa.className = 'es-como';
  const resumo = document.createElement('summary');
  resumo.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  resumo.append('Como as escalas funcionam');
  const itens: Array<[string, string]> = [
    ['Faixas', 'Cada faixa vai de onde começa até o início da próxima; a última vai até 100. Você só digita o início — não sobra buraco nem sobreposição.'],
    ['Conta como', 'Positivo, Mediano ou Negativo decide a lista em Métricas (pontos positivos, de atenção, negativos). A meta do gráfico é o início da primeira faixa positiva.'],
    ['Empresas', 'Cada empresa usa uma escala — escolha em "Usada por" ou em Empresas e tags. Postagem sem empresa usa a padrão.'],
    ['Relatórios', 'Guardam uma cópia da escala ao calcular as métricas: mudar a escala só altera o relatório quando você recalcula.'],
  ];
  const grade = document.createElement('div');
  grade.className = 'es-como-grade';
  itens.forEach(([t, d]) => {
    const item = document.createElement('div');
    item.append(Object.assign(document.createElement('strong'), { textContent: t }), Object.assign(document.createElement('p'), { textContent: d }));
    grade.appendChild(item);
  });
  caixa.append(resumo, grade);
  return caixa;
}

/**
 * Todas as escalas, uma por cartão, com "Nova escala" no topo. Sem cartão de
 * seção em volta: quem chama (painel de Ajustes, modal de Métricas) já tem
 * título e descrição — repetir dava "Escalas de score" duas vezes e uma caixa
 * dentro de outra.
 */
export function buildCadastroEscalas(redesenhar: () => void, erro: (e: unknown) => void): HTMLElement {
  const file = videosState.getCurrentState();
  const conteudo = document.createElement('div');
  conteudo.className = 'es-cadastro';
  const secao = conteudo;

  const topo = document.createElement('div');
  topo.className = 'es-topo';
  const contagem = document.createElement('span');
  contagem.className = 'es-topo-texto';
  const n = file?.escalasScore.length ?? 0;
  contagem.textContent = file ? `${n === 1 ? '1 escala' : `${n} escalas`} · a padrão vale para postagens sem empresa` : '';
  const nova = buildBotao('Nova escala', { icone: ICONES_POSTAGEM.mais, variante: 'primario' });
  nova.addEventListener('click', () => void novaEscala(redesenhar, erro));
  topo.append(contagem, nova);
  conteudo.append(topo, buildComoFunciona());
  if (!file) {
    conteudo.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: 'Carregando…' }));
    return secao;
  }
  // A padrão primeiro; as outras pela ordem de criação.
  const escalas = [...file.escalasScore].sort((a, b) => Number(b.id === file.escalaPadraoId) - Number(a.id === file.escalaPadraoId));
  // Rascunho de escala que não existe mais (excluída em outra tela) não volta.
  [...rascunhos.keys()].forEach((id) => {
    if (!escalas.some((e) => e.id === id)) rascunhos.delete(id);
  });
  escalas.forEach((e) => conteudo.appendChild(buildCartaoEscala(e, file.escalaPadraoId, redesenhar, erro)));
  if (!empresas().length) {
    const dica = document.createElement('p');
    dica.className = 'es-sem-empresa';
    dica.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE_EMPRESA}</svg>`;
    dica.append('Nenhuma empresa cadastrada: por enquanto, todas as postagens usam a escala padrão. Cadastre empresas em Ajustes › Empresas e tags.');
    conteudo.appendChild(dica);
  }
  return secao;
}

/** O cadastro num modal (botão "Escalas de score" da aba Métricas). */
export function abrirEscalas(aoMudar: () => void): void {
  let mudou = false;
  void openCustomModal(
    'Escalas de score',
    ({ corpo }) => {
      const desenhar = (): void => {
        const rolagem = corpo.scrollTop;
        corpo.replaceChildren(
          buildCadastroEscalas(
            () => {
              mudou = true;
              desenhar();
            },
            (e) => {
              const alvo = corpo.querySelector<HTMLElement>('.es-cadastro') ?? corpo;
              alvo.querySelector(':scope > .md-erro')?.remove();
              const aviso = document.createElement('p');
              aviso.className = 'md-erro';
              aviso.setAttribute('role', 'alert');
              aviso.textContent = e instanceof Error ? e.message : String(e);
              alvo.prepend(aviso);
              corpo.scrollTop = 0;
            },
          ),
        );
        corpo.scrollTop = rolagem;
      };
      if (videosState.getCurrentState()) desenhar();
      else void videosState.load().then(desenhar);
    },
    {
      largura: 860,
      icone: ICONE_ESCALA,
      subtitulo: 'Faixas do score e a escala de cada empresa',
      aoFechar: () => {
        if (mudou) aoMudar();
      },
    },
  );
}
