import { temDuasPessoas, type ConviteLido, type GravacaoFile, type SessaoGravacao } from '../../../shared/types/gravacao.types.js';
import { contarPalavras, formatarTempo } from '../../../shared/types/roteiros.conversao.js';
import type { Roteiro } from '../../../shared/types/roteiros.types.js';
import { ligarAtalhos } from '../../core/atalhos.js';
import { abrirModulo, consumirItemPendente, consumirRoteiroParaGravar } from '../../core/navegacao.js';
import { campo, textarea } from '../../ui/campos.js';
import { mensagemDeErro, openAvisoModal, openConfirmModal, openCustomModal } from '../../ui/modal.js';
import { buildBotao, buildBusca, buildSelo, focarBusca, svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { ICONE_PESSOAS, buildResumoConvite, chamarParaGravar, combinarProximoTake, entrarComConvite } from './gravacao.convite.js';
import { abrirPalco, type ControlePalco } from './gravacao.palco.js';
import { agoraCerto, conferir } from './gravacao.relogio.js';
import * as gravacaoState from './gravacao.state.js';

/**
 * Gravar: uma tela só. Escolhe (ou não) um roteiro e grava — sozinho, na hora;
 * ou com outra pessoa que tem o Iris, por convite com horário marcado.
 *
 * **O Iris não guarda o que foi gravado** (o usuário pediu): gravar sozinho nem
 * toca no arquivo. Só a gravação a dois fica guardada enquanto há um horário
 * combinado, porque o convite depende dela — e aparece em "Combinado".
 */

const ICONES = {
  gravar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/>',
  convite: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  roteiro:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M13 13h3"/><path d="M13 17h3"/>',
  seta: '<path d="m9 18 6-6-6-6"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  relogio: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/>',
};

const CHAVE_ROTEIRO = 'iris.gravacao.roteiro';
const CHAVE_MARCADOS = 'iris.gravacao.antes';

let container: HTMLElement | null = null;
let roteiros: Roteiro[] = [];
let roteiroId = '';
let buscaRoteiro = '';
/** Até aqui a lista inteira cabe à vista; acima disso aparece a busca. */
const LIMITE_SEM_BUSCA = 6;
let conviteCopiado: ConviteLido | null = null;
let palco: ControlePalco | null = null;
let salvandoPalco: Promise<void> = Promise.resolve();
let desligarAtalhos: (() => void) | null = null;

// ---------- Preferências da tela (só conveniência: falhou, começa do zero) ----------

function lerLocal(chave: string): string {
  try {
    return localStorage.getItem(chave) ?? '';
  } catch {
    return '';
  }
}

function gravarLocal(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Sem armazenamento local, vale só até fechar.
  }
}

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** O "Antes de gravar" marcado vale pelo dia: amanhã a lista volta em branco. */
function marcadosHoje(): Set<string> {
  try {
    const d = JSON.parse(lerLocal(CHAVE_MARCADOS) || '{}') as { dia?: string; ids?: string[] };
    return new Set(d.dia === hojeLocal() ? (d.ids ?? []) : []);
  } catch {
    return new Set();
  }
}

function gravarMarcados(ids: Set<string>): void {
  gravarLocal(CHAVE_MARCADOS, JSON.stringify({ dia: hojeLocal(), ids: [...ids] }));
}

// ---------- Ciclo de vida ----------

export function montar(viewRoot: HTMLElement): void {
  container = viewRoot;
  desligarAtalhos = ligarAtalhos({ 'gravacao.nova': () => void gravarSozinho() });
  roteiroId = consumirRoteiroParaGravar() ?? lerLocal(CHAVE_ROTEIRO);
  gravacaoState.onStateChange(() => redesenhar());
  window.addEventListener('focus', verificarConvite);
  void conferir();
  void Promise.all([gravacaoState.load(), carregarRoteiros()])
    .then(() => {
      redesenhar();
      // Um resultado antigo da busca pode apontar para uma gravação: não há mais o que abrir, só gasta o pedido.
      consumirItemPendente('gravacao', () => true);
      void verificarConvite();
    })
    .catch(falhou);
}

export function destroy(): void {
  window.removeEventListener('focus', verificarConvite);
  gravacaoState.offStateChange();
  desligarAtalhos?.();
  desligarAtalhos = null;
  container = null;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

async function carregarRoteiros(): Promise<void> {
  const r = await window.irisAPI.roteiros.getFile();
  roteiros = r.ok ? [...r.data.roteiros].sort((a, b) => Number(b.status === 'aprovado') - Number(a.status === 'aprovado') || b.updatedAt.localeCompare(a.updatedAt)) : [];
  if (roteiroId && !roteiros.some((x) => x.id === roteiroId)) roteiroId = '';
}

function roteiroEscolhido(): Roteiro | undefined {
  return roteiros.find((r) => r.id === roteiroId);
}

// ---------- Convite copiado ----------

/**
 * A janela voltou ao foco (a pessoa copiou o convite no WhatsApp e veio para o
 * Iris): se for um convite de outra pessoa, mostra a faixa para entrar — ou,
 * com o palco daquela gravação aberto, já conta até o próximo take.
 */
async function verificarConvite(): Promise<void> {
  if (!container) return;
  const lido = await gravacaoState.conviteCopiado().catch(() => null);
  if (lido?.codigo && palco?.aberto && lido.sessaoExistente === palco.sessaoId) {
    try {
      const sessao = await gravacaoState.entrarComConvite(lido.codigo);
      if (sessao.conjunta?.proximoInicio) palco.agendar(sessao.conjunta.proximoInicio);
      mostrarToast(`Próximo take às ${new Date(lido.dados.em).toLocaleTimeString('pt-BR')}.`);
    } catch (e) {
      falhou(e);
    }
    return;
  }
  const antes = conviteCopiado?.dados.em;
  conviteCopiado = lido;
  if (antes !== lido?.dados.em) redesenhar();
}

async function entrarPeloAviso(): Promise<void> {
  const lido = conviteCopiado;
  conviteCopiado = null;
  redesenhar();
  const sessao = await entrarComConvite(lido?.codigo ? { texto: lido.codigo, lido } : undefined);
  if (sessao) abrirNoPalco(sessao);
}

// ---------- Gravar ----------

function abrirNoPalco(sessao: SessaoGravacao): void {
  const copia = structuredClone(sessao);
  palco = abrirPalco({
    sessao: copia,
    fechou: (s) => {
      palco = null;
      // Sozinho não há nada guardado. A dois, só o horário combinado (que o palco limpa ao começar) volta ao arquivo.
      if (!s.conjunta) return;
      const foto = structuredClone(s);
      salvandoPalco = salvandoPalco.then(() => gravacaoState.salvarSessao(foto)).catch(falhou);
    },
    proximoJunto: copia.conjunta?.papel === 'anfitriao' ? () => combinarProximoTake(copia) : undefined,
  });
}

async function gravarSozinho(): Promise<void> {
  try {
    abrirNoPalco(await gravacaoState.montarGravacao({ roteiroId: roteiroId || undefined }));
  } catch (e) {
    falhou(e);
  }
}

async function gravarJunto(): Promise<void> {
  const r = roteiroEscolhido();
  const sessao = await chamarParaGravar({ roteiroId: r?.id, cenasDoRoteiro: r?.cenas.map((c) => ({ texto: c.fala })) });
  if (sessao) abrirNoPalco(sessao);
}

// ---------- Desenho ----------

function redesenhar(): void {
  const file = gravacaoState.getCurrentState();
  if (!container || !file) return;
  const rolagemAntes = container.querySelector<HTMLElement>('.gv-rolagem')?.scrollTop ?? 0;
  const listaAntes = container.querySelector<HTMLElement>('.gv-rot-lista')?.scrollTop;
  const tela = document.createElement('div');
  tela.className = 'pg-view gv-view';

  const topo = document.createElement('header');
  topo.className = 'gv-topo';
  const textos = document.createElement('div');
  textos.append(
    Object.assign(document.createElement('h1'), { className: 'gv-topo-titulo', textContent: 'Gravar' }),
    Object.assign(document.createElement('p'), { className: 'gv-topo-sub', textContent: 'Contagem, bipe de sincronia e o roteiro na tela. A câmera grava; o Iris só mostra o texto e não guarda nada do que foi gravado.' }),
  );
  const entrar = buildBotao('Entrar com convite', { icone: ICONES.convite, titulo: 'Alguém te chamou para gravar: cole a mensagem que recebeu' });
  entrar.addEventListener('click', () => {
    void entrarComConvite().then((s) => s && abrirNoPalco(s));
  });
  topo.append(textos, entrar);
  tela.appendChild(topo);

  if (conviteCopiado && conviteCopiado.dados.em > agoraCerto()) tela.appendChild(buildFaixaConvite(conviteCopiado));

  const rolagem = document.createElement('div');
  rolagem.className = 'pg-rolagem gv-rolagem';
  const grade = document.createElement('div');
  grade.className = 'gv-grade';
  grade.append(buildComecar(), buildAntes(file));
  rolagem.append(grade, buildRecentes(file));
  tela.appendChild(rolagem);
  container.replaceChildren(tela);
  rolagem.scrollTop = rolagemAntes;
  // A lista de roteiros rola por conta própria: escolher um não pode devolvê-la ao topo.
  const lista = tela.querySelector<HTMLElement>('.gv-rot-lista');
  if (lista && listaAntes !== undefined) lista.scrollTop = listaAntes;
  // Na primeira vez, o roteiro já escolhido aparece sem precisar procurar.
  else lista?.querySelector<HTMLElement>('.is-escolhido')?.scrollIntoView({ block: 'nearest' });
}

function buildFaixaConvite(lido: ConviteLido): HTMLElement {
  const faixa = document.createElement('div');
  faixa.className = 'gv-faixa';
  const icone = document.createElement('span');
  icone.className = 'gv-faixa-icone';
  icone.innerHTML = svg(ICONE_PESSOAS, 18, 2);
  const resumo = buildResumoConvite(lido);
  const botao = buildBotao('Entrar', { variante: 'primario' });
  botao.addEventListener('click', () => void entrarPeloAviso());
  faixa.append(icone, resumo, botao);
  return faixa;
}

function resumoDoRoteiro(r: Roteiro): string {
  const palavras = r.cenas.reduce((n, c) => n + contarPalavras(c.fala), 0);
  return [
    `${r.cenas.length} cena${r.cenas.length === 1 ? '' : 's'}`,
    palavras ? `~${formatarTempo((palavras / 150) * 60)} de fala` : 'sem fala escrita',
    temDuasPessoas(r.cenas.map((c) => ({ texto: c.fala }))) ? 'falas de A e B' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A escolha do roteiro: uma lista de linhas inteiras clicáveis, com o que cada
 * roteiro tem (cenas, tempo de fala) à vista. Era um `<select>` do sistema dentro
 * de uma caixa — o usuário achou feio, e não dava para comparar os roteiros sem abrir.
 * Opcional: "Sem roteiro" é a primeira linha (o palco vira só contagem e cronômetro).
 */
function buildEscolhaDoRoteiro(): HTMLElement {
  const bloco = document.createElement('div');
  bloco.className = 'gv-rot';

  // Busca só quando a lista não cabe à vista.
  if (roteiros.length > LIMITE_SEM_BUSCA) {
    bloco.appendChild(
      buildBusca(buscaRoteiro, 'Buscar roteiro', (v) => {
        buscaRoteiro = v;
        redesenhar();
        focarBusca(container);
      }),
    );
  }

  const lista = document.createElement('div');
  lista.className = 'gv-rot-lista';
  lista.setAttribute('role', 'radiogroup');
  lista.setAttribute('aria-label', 'Roteiro para gravar');
  const linha = (id: string, icone: string, titulo: string, resumo: string, aprovado = false): void => {
    const b = document.createElement('button');
    b.type = 'button';
    const escolhido = id === roteiroId;
    b.className = `gv-rot-item${escolhido ? ' is-escolhido' : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(escolhido));
    const ic = document.createElement('span');
    ic.className = 'gv-rot-icone';
    ic.innerHTML = svg(icone, 17, 1.9);
    const textos = document.createElement('span');
    textos.className = 'gv-rot-textos';
    const cab = document.createElement('span');
    cab.className = 'gv-rot-titulo';
    cab.appendChild(Object.assign(document.createElement('strong'), { textContent: titulo }));
    if (aprovado) cab.appendChild(buildSelo('Aprovado', 'ok'));
    textos.append(cab, Object.assign(document.createElement('span'), { className: 'gv-rot-resumo', textContent: resumo }));
    // A bolinha de escolha: cheia e com o visto na linha escolhida (não é só a cor que diz).
    const marca = document.createElement('span');
    marca.className = 'gv-rot-marca';
    if (escolhido) marca.innerHTML = svg(ICONES.check, 12, 3);
    b.append(ic, textos, marca);
    b.addEventListener('click', () => {
      roteiroId = id;
      gravarLocal(CHAVE_ROTEIRO, roteiroId);
      redesenhar();
    });
    lista.appendChild(b);
  };

  const termo = buscaRoteiro.trim().toLowerCase();
  const visiveis = termo ? roteiros.filter((r) => (r.titulo || '').toLowerCase().includes(termo)) : roteiros;
  if (!termo) linha('', ICONES.relogio, 'Sem roteiro', 'Só a contagem, o bipe e o cronômetro.');
  visiveis.forEach((r) => linha(r.id, ICONES.roteiro, r.titulo || 'Roteiro sem título', resumoDoRoteiro(r), r.status === 'aprovado'));
  bloco.appendChild(lista);

  if (termo && !visiveis.length) {
    bloco.appendChild(Object.assign(document.createElement('p'), { className: 'gv-rot-nota', textContent: `Nenhum roteiro com "${buscaRoteiro.trim()}".` }));
  }
  if (!roteiros.length) {
    const vazio = document.createElement('div');
    vazio.className = 'gv-rot-nota';
    vazio.appendChild(Object.assign(document.createElement('span'), { textContent: 'Você ainda não escreveu nenhum roteiro — dá para gravar assim mesmo.' }));
    const ir = buildBotao('Escrever um roteiro', { variante: 'secundario', icone: ICONES.roteiro });
    ir.addEventListener('click', () => abrirModulo('roteiros'));
    vazio.appendChild(ir);
    bloco.appendChild(vazio);
  }
  return bloco;
}

function buildComecar(): HTMLElement {
  const cartao = document.createElement('section');
  cartao.className = 'gv-comecar';

  cartao.appendChild(Object.assign(document.createElement('h2'), { className: 'gv-secao-titulo', textContent: 'O que vai gravar?' }));

  cartao.appendChild(buildEscolhaDoRoteiro());

  // As duas formas de gravar, grandes.
  const acoes = document.createElement('div');
  acoes.className = 'gv-formas';
  const forma = (classe: string, iconePath: string, titulo: string, texto: string, fazer: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `gv-forma ${classe}`;
    const ic = document.createElement('span');
    ic.className = 'gv-forma-icone';
    ic.innerHTML = svg(iconePath, 26, 1.9);
    const t = document.createElement('span');
    t.className = 'gv-forma-textos';
    t.append(Object.assign(document.createElement('strong'), { textContent: titulo }), Object.assign(document.createElement('span'), { textContent: texto }));
    b.append(ic, t);
    b.addEventListener('click', fazer);
    return b;
  };
  acoes.append(
    forma('is-sozinho', ICONES.gravar, 'Gravar sozinho', 'Abre o palco: Espaço conta 3-2-1 e o bipe marca o início.', () => void gravarSozinho()),
    forma('is-junto', ICONE_PESSOAS, 'Gravar com outra pessoa', 'Manda um convite para o Iris dela. Os dois contam juntos, perto ou longe.', () => void gravarJunto()),
  );
  cartao.appendChild(acoes);
  return cartao;
}

function buildAntes(file: GravacaoFile): HTMLElement {
  const marcados = marcadosHoje();
  const cartao = document.createElement('aside');
  cartao.className = 'gv-antes';
  const feitos = file.checklist.filter((i) => marcados.has(i.id)).length;
  const cab = document.createElement('div');
  cab.className = 'gv-antes-cab';
  cab.append(
    Object.assign(document.createElement('h2'), { className: 'gv-secao-titulo', textContent: 'Antes de gravar' }),
    Object.assign(document.createElement('span'), { className: 'gv-antes-n', textContent: `${feitos}/${file.checklist.length}` }),
  );
  cartao.appendChild(cab);
  const ul = document.createElement('ul');
  ul.className = 'gv-check';
  file.checklist.forEach((item) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const caixa = document.createElement('input');
    caixa.type = 'checkbox';
    caixa.checked = marcados.has(item.id);
    caixa.addEventListener('change', () => {
      if (caixa.checked) marcados.add(item.id);
      else marcados.delete(item.id);
      gravarMarcados(marcados);
      redesenhar();
    });
    label.append(caixa, Object.assign(document.createElement('span'), { textContent: item.texto }));
    li.classList.toggle('is-feito', caixa.checked);
    li.appendChild(label);
    ul.appendChild(li);
  });
  if (!file.checklist.length) ul.appendChild(Object.assign(document.createElement('li'), { className: 'gv-check-vazio', textContent: 'Lista vazia.' }));
  cartao.appendChild(ul);
  const editar = document.createElement('button');
  editar.type = 'button';
  editar.className = 'gv-link';
  editar.textContent = 'Editar a lista';
  editar.addEventListener('click', () => editarChecklist(file));
  cartao.appendChild(editar);
  return cartao;
}

function editarChecklist(file: GravacaoFile): void {
  void openCustomModal(
    'Antes de gravar',
    ({ corpo, rodape, fechar }) => {
      const ta = textarea(file.checklist.map((i) => i.texto).join('\n'), 'Um item por linha', 8);
      corpo.appendChild(campo('Itens', ta, 'Um por linha. O que você marca vale só pelo dia: amanhã a lista volta em branco.'));
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const salvar = buildBotao('Salvar', { variante: 'primario' });
      salvar.addEventListener('click', () => {
        void gravacaoState
          .salvarChecklist(ta.value.split('\n'))
          .then(fechar)
          .catch(falhou);
      });
      rodape.append(cancelar, salvar);
    },
    { largura: 460, icone: ICONES.check },
  );
}

function buildRecentes(file: GravacaoFile): HTMLElement {
  const secao = document.createElement('section');
  secao.className = 'gv-recentes';
  const agora = agoraCerto();
  const combinadas = file.sessoes.filter((s) => (s.conjunta?.proximoInicio ?? 0) > agora);
  const antigas = file.sessoes.length - combinadas.length;

  // Só o que ainda vai acontecer: uma gravação a dois com horário marcado.
  if (combinadas.length) {
    const cab = document.createElement('div');
    cab.className = 'gv-recentes-cab';
    cab.appendChild(Object.assign(document.createElement('h2'), { className: 'gv-secao-titulo', textContent: 'Combinado' }));
    secao.appendChild(cab);
    const lista = document.createElement('div');
    lista.className = 'gv-lista';
    combinadas.forEach((s) => lista.appendChild(buildLinha(s)));
    secao.appendChild(lista);
  }

  // Gravações guardadas antes de o Iris parar de registrar takes: o usuário decide se apaga.
  if (antigas > 0) {
    const linha = document.createElement('div');
    linha.className = 'gv-antigas';
    linha.appendChild(
      Object.assign(document.createElement('span'), {
        textContent: `${antigas} ${antigas === 1 ? 'gravação antiga ainda está guardada' : 'gravações antigas ainda estão guardadas'} (takes e marcas de antes). O Iris não registra mais isso.`,
      }),
    );
    const apagar = buildBotao(antigas === 1 ? 'Apagar' : 'Apagar todas', { variante: 'secundario' });
    apagar.addEventListener('click', () => {
      void openConfirmModal({
        title: 'Apagar as gravações antigas',
        message: `${antigas === 1 ? 'A gravação guardada' : `As ${antigas} gravações guardadas`}, com os takes e as marcas, ${antigas === 1 ? 'será apagada' : 'serão apagadas'}. Os vídeos da câmera e os roteiros não são tocados.`,
        confirmText: 'Apagar',
      }).then((ok) => {
        if (ok) void gravacaoState.limparSessoes().catch(falhou);
      });
    });
    linha.appendChild(apagar);
    secao.appendChild(linha);
  }
  return secao;
}

/** Uma gravação a dois com horário marcado: clicar abre o palco já contando. */
function buildLinha(s: SessaoGravacao): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'gv-linha';
  const icone = document.createElement('span');
  icone.className = 'gv-linha-icone is-junto';
  icone.innerHTML = svg(ICONE_PESSOAS, 16, 2);
  const textos = document.createElement('span');
  textos.className = 'gv-linha-textos';
  textos.append(
    Object.assign(document.createElement('strong'), { textContent: s.titulo }),
    Object.assign(document.createElement('span'), {
      textContent: [
        `com ${s.conjunta?.parceiro ?? ''}`,
        s.roteiro ? s.roteiro.titulo : '',
        `começa às ${new Date(s.conjunta?.proximoInicio ?? 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      ]
        .filter(Boolean)
        .join(' · '),
    }),
  );
  const fim = document.createElement('span');
  fim.className = 'gv-linha-fim';
  const seta = document.createElement('span');
  seta.className = 'gv-linha-seta';
  seta.innerHTML = svg(ICONES.seta, 16, 2);
  fim.appendChild(seta);
  b.append(icone, textos, fim);
  b.addEventListener('click', () => abrirNoPalco(s));
  return b;
}
