import {
  GRUPOS_PROVEDOR,
  PROVEDORES,
  RECOMENDACOES_OPENROUTER,
  descritorDe,
  type Capacidade,
  type ConfigProvedor,
  type DescritorProvedor,
  type IaConfig,
  type ProvedorId,
} from '../../../shared/types/ia.types.js';
import type { GuiaId } from '../../core/navegacao.js';
import { ICONE_IA, abrirSeletorModelo } from '../../ui/ia.js';
import { ICONES, buildAviso, buildBotao, buildSelo, svg, type Tom } from '../../ui/pagina.js';
import * as ajustesState from './ajustes.state.js';

/**
 * Ajustes › Inteligência artificial: um cartão por provedor (chave, modelos,
 * testar) e os padrões (quem escreve, quem gera imagem, onde salvar). A chave
 * digitada vai direto para o cofre no main; a tela só sabe se existe.
 */

export interface PecasAjustes {
  buildPainel: (titulo: string, descricao: string, icone: string, guia?: GuiaId) => HTMLElement;
  buildCampo: (rotulo: string, elemento: HTMLElement, dica?: string) => HTMLElement;
  buildInput: (tipo: string, valor: string, placeholder: string) => HTMLInputElement;
  /** `chave` mantém o aviso ("Salvo") no status certo depois do redesenho. */
  buildStatus: (chave?: string) => { el: HTMLElement; mostrar: (texto: string, tom: Tom) => void };
}

const ROTULO_CAPACIDADE: Record<Capacidade, string> = {
  texto: 'Texto',
  visao: 'Lê imagens',
  imagem: 'Gera imagem',
  imagemComReferencia: 'Imagem com referências',
};

/**
 * Cartões abertos/fechados. Fora do cartão porque salvar redesenha a seção
 * inteira — quem acabou de colar uma chave não pode ver o cartão fechar.
 * Ausente = aberto só se já está configurado (dez cartões abertos viram um paredão).
 */
const abertos = new Map<ProvedorId, boolean>();

const ICONE_SETA_BAIXO = '<path d="m6 9 6 6 6-6"/>';

function mensagemDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildSelect(opcoes: Array<{ value: string; label: string }>, valor: string): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'aj-input';
  opcoes.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    select.appendChild(opt);
  });
  select.value = valor;
  return select;
}

const OLHO = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
const OLHO_FECHADO =
  '<path d="M17.9 17.9A10.1 10.1 0 0 1 12 19c-6.4 0-10-7-10-7a18.5 18.5 0 0 1 5.1-5.9"/><path d="M9.9 5.2A9.1 9.1 0 0 1 12 5c6.4 0 10 7 10 7a18.6 18.6 0 0 1-2.2 3.2"/><path d="m2 2 20 20"/>';

/**
 * Campo da chave: mascarado, com o olho para conferir o que foi digitado.
 * Com chave salva, o placeholder mostra só o final dela — a chave inteira
 * nunca volta do main (regra do cofre).
 */
function campoChave(p: PecasAjustes, cfg: ConfigProvedor, d: DescritorProvedor): { el: HTMLElement; input: HTMLInputElement } {
  const input = p.buildInput(
    'password',
    '',
    cfg.temChave ? `••••••••••••${cfg.finalChave ?? ''}  (em branco mantém)` : d.exigeBaseUrl ? 'opcional para servidores locais' : 'cole a chave aqui',
  );
  input.autocomplete = 'off';
  input.spellcheck = false;
  const olho = document.createElement('button');
  olho.type = 'button';
  olho.className = 'aj-ia-olho';
  const desenharOlho = (): void => {
    const visivel = input.type === 'text';
    olho.innerHTML = svg(visivel ? OLHO_FECHADO : OLHO, 16, 2);
    olho.title = visivel ? 'Esconder a chave' : 'Mostrar a chave digitada';
    olho.setAttribute('aria-label', olho.title);
    olho.setAttribute('aria-pressed', String(visivel));
  };
  olho.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    desenharOlho();
    input.focus();
  });
  desenharOlho();
  const wrap = document.createElement('div');
  wrap.className = 'aj-ia-chave';
  wrap.append(input, olho);
  const dica = cfg.temChave
    ? `Chave salva, terminada em ${cfg.finalChave ?? '····'}. Por segurança ela não é mostrada inteira; cole outra para trocar.`
    : 'Fica cifrada no cofre do Windows. O olho mostra o que você digitou.';
  return { el: p.buildCampo('Chave de API', wrap, dica), input };
}

/** Campo de modelo: texto livre + "Escolher", que abre a lista completa com busca. */
function campoModelo(
  p: PecasAjustes,
  d: DescritorProvedor,
  cfg: ConfigProvedor,
  tipo: 'texto' | 'imagem',
  valor: string,
): { el: HTMLElement; input: HTMLInputElement; escolher: (busca?: string) => void } {
  const sugerido = tipo === 'texto' ? d.modeloTextoSugerido : d.modeloImagemSugerido;
  const input = p.buildInput('text', valor, sugerido ? `padrão: ${sugerido}` : 'nome do modelo');
  const botao = buildBotao('Escolher', { icone: ICONES.preferencias, variante: 'secundario', titulo: 'Ver todos os modelos do provedor, com busca e preço' });
  botao.disabled = !cfg.configurado;
  if (!cfg.configurado) botao.title = d.semChave ? 'Ative primeiro' : 'Salve a chave primeiro';
  const escolher = (busca = ''): void => {
    void abrirSeletorModelo(d.id, tipo, input.value || sugerido || '', busca).then((id) => {
      if (id) input.value = id;
    });
  };
  botao.addEventListener('click', () => escolher());
  const wrap = document.createElement('div');
  wrap.className = 'aj-ia-modelo';
  wrap.append(input, botao);
  return {
    el: p.buildCampo(tipo === 'texto' ? 'Modelo de texto' : 'Modelo de imagem', wrap, tipo === 'texto' ? 'Em branco usa o padrão.' : 'Só modelos que geram imagem.'),
    input,
    escolher,
  };
}

/** "Qual modelo usar": recomendações do OpenRouter, cada uma aplicável num clique. */
function buildRecomendacoes(
  cfg: ConfigProvedor,
  campos: { texto: ReturnType<typeof campoModelo>; imagem: ReturnType<typeof campoModelo> | null },
  status: { mostrar: (texto: string, tom: Tom) => void },
): HTMLElement {
  const bloco = document.createElement('details');
  bloco.className = 'aj-ia-recomendacoes';
  bloco.open = true;
  const titulo = document.createElement('summary');
  titulo.textContent = 'Qual modelo usar em cada situação';
  bloco.appendChild(titulo);
  const lista = document.createElement('div');
  lista.className = 'aj-ia-rec-lista';
  RECOMENDACOES_OPENROUTER.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'aj-ia-rec';
    const textos = document.createElement('div');
    textos.className = 'aj-ia-rec-textos';
    const cab = document.createElement('div');
    cab.className = 'aj-ia-rec-cab';
    cab.append(
      Object.assign(document.createElement('strong'), { textContent: r.uso }),
      buildSelo(r.tipo === 'imagem' ? 'Imagem' : 'Texto', 'neutro'),
    );
    textos.append(
      cab,
      Object.assign(document.createElement('code'), { textContent: r.modelo }),
      Object.assign(document.createElement('p'), { textContent: r.porque }),
    );
    item.appendChild(textos);
    const campo = r.tipo === 'imagem' ? campos.imagem : campos.texto;
    if (campo) {
      const usar = buildBotao('Usar', { variante: 'fantasma', icone: ICONES.check, titulo: `Pôr no campo "${r.tipo === 'imagem' ? 'Modelo de imagem' : 'Modelo de texto'}"` });
      usar.disabled = !cfg.configurado;
      if (!cfg.configurado) usar.title = 'Salve a chave primeiro';
      usar.addEventListener('click', () => {
        // O id pode ter mudado no OpenRouter: confere na lista antes de usar.
        void window.irisAPI.ia.listarModelos(cfg.id).then((res) => {
          if (res.ok && res.data.some((m) => m.id === r.modelo)) {
            campo.input.value = r.modelo;
            status.mostrar(`"${r.modelo}" no campo — clique em Salvar`, 'neutro');
          } else {
            campo.escolher(r.busca);
          }
        });
      });
      item.appendChild(usar);
    }
    lista.appendChild(item);
  });
  bloco.appendChild(lista);
  bloco.appendChild(
    Object.assign(document.createElement('p'), {
      className: 'aj-campo-dica',
      textContent: 'Dica: em Padrões, dá para usar um provedor para texto e outro para imagem. Preços por 1 milhão de tokens aparecem em "Escolher".',
    }),
  );
  return bloco;
}

function buildCartaoProvedor(p: PecasAjustes, d: DescritorProvedor, cfg: ConfigProvedor): HTMLElement {
  const cartao = document.createElement('section');
  cartao.className = 'aj-ia-provedor';
  cartao.classList.toggle('is-configurado', cfg.configurado);
  const aberto = abertos.get(d.id) ?? cfg.configurado;
  cartao.classList.toggle('is-recolhido', !aberto);

  const topo = document.createElement('header');
  topo.className = 'aj-ia-topo';
  topo.setAttribute('role', 'button');
  topo.tabIndex = 0;
  topo.setAttribute('aria-expanded', String(aberto));
  const alternar = (): void => {
    const abrir = cartao.classList.contains('is-recolhido');
    abertos.set(d.id, abrir);
    cartao.classList.toggle('is-recolhido', !abrir);
    topo.setAttribute('aria-expanded', String(abrir));
  };
  topo.addEventListener('click', alternar);
  topo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      alternar();
    }
  });
  const titulos = document.createElement('div');
  titulos.className = 'aj-ia-titulos';
  const nome = document.createElement('h3');
  nome.textContent = d.rotulo;
  titulos.appendChild(nome);
  titulos.appendChild(Object.assign(document.createElement('p'), { textContent: d.descricao }));
  topo.appendChild(titulos);
  const lado = document.createElement('div');
  lado.className = 'aj-ia-topo-lado';
  lado.appendChild(
    cfg.configurado ? buildSelo(d.semChave ? 'Ativado' : 'Configurado', 'ok') : buildSelo(d.semChave ? 'Desativado' : 'Sem chave', 'neutro'),
  );
  const seta = document.createElement('span');
  seta.className = 'aj-ia-seta';
  seta.innerHTML = svg(ICONE_SETA_BAIXO, 16, 2);
  lado.appendChild(seta);
  topo.appendChild(lado);
  cartao.appendChild(topo);

  const capacidades = document.createElement('div');
  capacidades.className = 'aj-ia-capacidades';
  (['texto', 'visao', 'imagem', 'imagemComReferencia'] as Capacidade[]).forEach((c) => {
    const tem = d.capacidades.includes(c);
    const chip = document.createElement('span');
    chip.className = `aj-ia-cap${tem ? '' : ' is-nao'}`;
    chip.textContent = `${tem ? '✓' : '✕'} ${ROTULO_CAPACIDADE[c]}`;
    capacidades.appendChild(chip);
  });
  cartao.appendChild(capacidades);

  const corpo = document.createElement('div');
  corpo.className = 'aj-ia-campos';

  // Local não tem chave: o lugar dela fica com o endereço, já preenchido.
  const campoDaChave = d.semChave ? null : campoChave(p, cfg, d);
  const chave = campoDaChave?.input ?? null;
  if (campoDaChave) corpo.appendChild(campoDaChave.el);

  let baseUrl: HTMLInputElement | null = null;
  if (d.semChave) {
    baseUrl = p.buildInput('url', cfg.baseUrl || d.basePadrao || '', d.basePadrao ?? '');
    corpo.appendChild(p.buildCampo('Endereço', baseUrl, `O padrão do app é ${d.basePadrao}. Só troque se mudou a porta.`));
  } else if (d.exigeBaseUrl) {
    baseUrl = p.buildInput('url', cfg.baseUrl, 'https://api.together.xyz/v1');
    corpo.appendChild(p.buildCampo('Endereço base', baseUrl, 'O endereço da API do serviço — normalmente termina em /v1.'));
  }

  const texto = campoModelo(p, d, cfg, 'texto', cfg.modeloTexto);
  corpo.appendChild(texto.el);

  const imagem = d.capacidades.includes('imagem') ? campoModelo(p, d, cfg, 'imagem', cfg.modeloImagem) : null;
  if (imagem) corpo.appendChild(imagem.el);
  cartao.appendChild(corpo);

  const status = p.buildStatus(`ia.${d.id}`);
  if (d.semChave) {
    const passos = document.createElement('ol');
    passos.className = 'aj-ia-passos';
    [
      `Instale o ${d.rotulo} (botão "Baixar ${d.rotulo}" abaixo) e deixe-o aberto.`,
      d.comandoModelo ? `Baixe um modelo. No terminal: ${d.comandoModelo}` : 'Baixe um modelo pela tela do app e ligue o servidor local (aba Developer).',
      cfg.ativo ? 'Clique em "Testar" para conferir se está tudo respondendo.' : 'Clique em "Ativar" e depois em "Testar".',
    ].forEach((t) => passos.appendChild(Object.assign(document.createElement('li'), { textContent: t })));
    cartao.appendChild(passos);
  }
  if (d.id === 'openrouter') cartao.appendChild(buildRecomendacoes(cfg, { texto, imagem }, status));

  const acoes = document.createElement('div');
  acoes.className = 'aj-acoes';

  // Local desligado: o botão principal já liga — salvar sem ativar não serviria para nada.
  const ativar = Boolean(d.semChave && !cfg.ativo);
  const salvar = buildBotao(ativar ? 'Ativar' : 'Salvar', { variante: 'primario', icone: ICONES.check });
  salvar.addEventListener('click', () => {
    salvar.disabled = true;
    abertos.set(d.id, true);
    void ajustesState
      .salvarProvedorIa({
        id: d.id,
        apiKey: chave?.value ? chave.value : undefined,
        baseUrl: baseUrl?.value,
        ...(ativar ? { ativo: true } : {}),
        modeloTexto: texto.input.value,
        modeloImagem: imagem?.input.value,
      })
      .then(() => status.mostrar(ativar ? 'Ativado — agora clique em Testar' : 'Salvo', 'ok'))
      .catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'))
      .finally(() => {
        salvar.disabled = false;
      });
  });
  acoes.appendChild(salvar);

  const testar = buildBotao('Testar', { icone: ICONES.atualizar });
  testar.disabled = !cfg.configurado;
  testar.title = cfg.configurado
    ? d.semChave
      ? 'Confere se o app está aberto, quais modelos tem e se o modelo de texto responde'
      : 'Confere a chave, a lista e os modelos salvos (o de texto recebe um pedido mínimo)'
    : d.semChave
      ? 'Ative primeiro'
      : 'Salve a chave primeiro';
  testar.addEventListener('click', () => {
    testar.disabled = true;
    status.mostrar('Testando…', 'neutro');
    void ajustesState
      .testarIa(d.id)
      .then((mensagem) => status.mostrar(mensagem, 'ok'))
      .catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'))
      .finally(() => {
        testar.disabled = false;
      });
  });
  acoes.appendChild(testar);

  if (d.urlBaixar) {
    const baixar = buildBotao(`Baixar ${d.rotulo}`, { variante: 'fantasma', icone: ICONES.backup });
    const url = d.urlBaixar;
    baixar.addEventListener('click', () => window.irisAPI.system.openExternalLink(url));
    acoes.appendChild(baixar);
  }

  const pegar = buildBotao(d.semChave ? 'Ver modelos' : d.exigeBaseUrl ? 'Referência da API' : 'Onde pegar a chave', {
    variante: 'fantasma',
    icone: ICONES.externo,
  });
  pegar.addEventListener('click', () => window.irisAPI.system.openExternalLink(d.urlChave));
  acoes.appendChild(pegar);

  if (d.semChave && cfg.ativo) {
    const desativar = buildBotao('Desativar', { variante: 'fantasma' });
    desativar.addEventListener('click', () => {
      void ajustesState
        .salvarProvedorIa({ id: d.id, ativo: false })
        .then(() => status.mostrar('Desativado', 'neutro'))
        .catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'));
    });
    acoes.appendChild(desativar);
  }

  if (cfg.temChave) {
    const remover = buildBotao('Remover chave', { variante: 'fantasma' });
    remover.classList.add('is-perigo');
    remover.addEventListener('click', () => {
      void ajustesState
        .salvarProvedorIa({ id: d.id, apiKey: '' })
        .then(() => status.mostrar('Chave removida', 'neutro'))
        .catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'));
    });
    acoes.appendChild(remover);
  }

  cartao.appendChild(acoes);
  cartao.appendChild(status.el);

  return cartao;
}

function buildPadroes(p: PecasAjustes, ia: IaConfig): HTMLElement {
  const bloco = document.createElement('div');
  bloco.className = 'aj-ia-padroes';
  bloco.appendChild(Object.assign(document.createElement('h3'), { textContent: 'Padrões' }));

  const opcoesDe = (capacidade: Capacidade): Array<{ value: string; label: string }> => [
    { value: '', label: 'Automático (o primeiro configurado)' },
    ...ia.provedores
      .filter((c) => c.configurado && descritorDe(c.id).capacidades.includes(capacidade))
      .map((c) => ({ value: c.id, label: descritorDe(c.id).rotulo })),
  ];
  const texto = buildSelect(opcoesDe('texto'), ia.texto ?? '');
  const imagem = buildSelect(opcoesDe('imagem'), ia.imagem ?? '');
  const grade = document.createElement('div');
  grade.className = 'aj-ia-grade';
  grade.append(
    p.buildCampo('Textos (legendas, roteiros, prompts)', texto),
    p.buildCampo('Imagens (Estúdio e thumbnails)', imagem),
  );
  bloco.appendChild(grade);

  const raiz = buildSelect([{ value: '', label: 'Carregando pastas…' }], '');
  const subpasta = p.buildInput('text', ia.destino?.subpasta ?? 'Iris IA', 'Iris IA');
  const grade2 = document.createElement('div');
  grade2.className = 'aj-ia-grade';
  grade2.append(
    p.buildCampo('Pasta da Biblioteca para as imagens', raiz, '"Salvar na Biblioteca" grava aqui e cria o recurso na coleção Thumbnails.'),
    p.buildCampo('Subpasta', subpasta),
  );
  bloco.appendChild(grade2);
  void window.irisAPI.explorador.getRaizes().then((r) => {
    const raizes = r.ok ? r.data.raizes : [];
    raiz.replaceChildren(
      ...[{ value: '', label: raizes.length ? 'A primeira pasta monitorada' : 'Nenhuma pasta na Biblioteca ainda' }, ...raizes.map((x) => ({ value: x.id, label: x.nome }))].map((o) => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        return opt;
      }),
    );
    raiz.value = ia.destino?.raizId ?? '';
  });

  const status = p.buildStatus('ia.padroes');
  const acoes = document.createElement('div');
  acoes.className = 'aj-acoes';
  const salvar = buildBotao('Salvar padrões', { variante: 'primario', icone: ICONES.check });
  salvar.addEventListener('click', () => {
    salvar.disabled = true;
    void ajustesState
      .salvarPadroesIa({
        texto: texto.value as ProvedorId | '',
        imagem: imagem.value as ProvedorId | '',
        destino: raiz.value ? { raizId: raiz.value, subpasta: subpasta.value } : null,
      })
      .then(() => status.mostrar('Padrões salvos', 'ok'))
      .catch((error: unknown) => status.mostrar(mensagemDe(error), 'erro'))
      .finally(() => {
        salvar.disabled = false;
      });
  });
  acoes.appendChild(salvar);
  bloco.append(acoes, status.el);
  return bloco;
}

export function buildSecaoIa(p: PecasAjustes, ia: IaConfig): HTMLElement {
  const painel = p.buildPainel(
    'Inteligência artificial',
    'Use suas próprias chaves de IA para escrever legendas e roteiros e gerar imagens e thumbnails. O custo é cobrado pelo provedor, na sua conta.',
    ICONE_IA,
    'ia',
  );
  painel.classList.add('aj-painel-ia');

  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo';

  if (!ia.criptografiaDisponivel) {
    corpo.appendChild(buildAviso('Este sistema não oferece cofre de credenciais: as chaves seriam gravadas em texto puro.', 'erro'));
  }
  if (!ia.provedores.some((c) => c.configurado)) {
    corpo.appendChild(
      buildAviso('Nenhuma IA configurada ainda. O OpenRouter é o jeito mais simples: uma chave só para texto e imagem. "Como configurar" mostra o passo a passo.', 'atencao'),
    );
  }

  corpo.appendChild(buildPadroes(p, ia));

  GRUPOS_PROVEDOR.forEach((g) => {
    const doGrupo = PROVEDORES.filter((d) => d.grupo === g.id);
    if (!doGrupo.length) return;
    const cab = document.createElement('header');
    cab.className = 'aj-ia-grupo';
    cab.append(Object.assign(document.createElement('h3'), { textContent: g.rotulo }), Object.assign(document.createElement('p'), { textContent: g.descricao }));
    const lista = document.createElement('div');
    lista.className = 'aj-ia-lista';
    doGrupo.forEach((d) => {
      const cfg = ia.provedores.find((c) => c.id === d.id);
      if (cfg) lista.appendChild(buildCartaoProvedor(p, d, cfg));
    });
    corpo.append(cab, lista);
  });

  painel.appendChild(corpo);
  return painel;
}
