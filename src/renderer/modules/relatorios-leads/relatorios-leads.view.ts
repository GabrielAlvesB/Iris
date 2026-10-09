import type { ContatosFile } from '../../../shared/types/contatos.types.js';
import type { PeriodoLeads, RelatorioLeads, SecoesRelatorioLeads } from '../../../shared/types/leads.types.js';
import { intervaloDe, leadsDoArquivo, noIntervalo } from '../../../shared/types/leads.estatisticas.js';
import { dataIsoCurta, hojeLocal } from '../../../shared/types/brasil.js';
import { abrirModulo } from '../../core/navegacao.js';
import { createPushBinding } from '../../core/pushBinding.js';
import { exportarDocumentoPdf } from '../../ui/impressao.js';
import { mensagemDeErro, openAvisoModal, openConfirmModal } from '../../ui/modal.js';
import { buildBotao, buildCabecalho, buildSegmentado, buildVazio, svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { lerAjustes } from '../contatos/contatos.documento.js';
import * as contatosState from '../contatos/contatos.state.js';
import { ICONES_CONTATO, el } from '../contatos/contatos.ui.js';
import { buildDocumentoLeads, rotuloDoIntervalo, type ConfigRelatorioLeads, type DadosDeAjustes } from './relatorios-leads.documento.js';

/**
 * Relatórios de leads — o módulo, no desenho do módulo Relatórios: a lista
 * dos relatórios guardados e, por cima, o editor em tela cheia (configuração
 * à esquerda, a prévia, que é o próprio PDF, à direita). Guarda só a
 * configuração; os números são sempre recalculados de contatos.json.
 */

let container: HTMLElement | null = null;
/** O relatório aberto no editor (cópia de trabalho); null = a lista. */
let rascunho: ConfigRelatorioLeads | null = null;
/** O rascunho é de um relatório já guardado (ou novo, ainda não salvo)? */
let guardado = false;
let alterado = false;
let ajustes: DadosDeAjustes | null = null;
let previaEl: HTMLElement | null = null;

// Lead chegou: a prévia e a lista mostram os números de agora.
const push = createPushBinding([() => window.irisAPI.events.on('contatos:mudou', () => void contatosState.load().catch(() => undefined))]);

export function montar(viewRoot: HTMLElement): void {
  container = viewRoot;
  contatosState.onStateChange(() => desenhar());
  push.attach();
  void contatosState.load().catch(falhou);
  // Seus dados e assinatura moram em Ajustes: lidos uma vez, depois a prévia ganha o cabeçalho.
  void lerAjustes()
    .then((a) => {
      ajustes = a;
      desenharPrevia();
    })
    .catch(() => undefined);
}

export function destroy(): void {
  contatosState.offStateChange();
  push.detach();
  container = null;
  previaEl = null;
  // Voltar ao módulo começa na lista (como em Relatórios).
  rascunho = null;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

const ROTULO_PERIODO: Record<PeriodoLeads['tipo'], string> = {
  '7': 'Últimos 7 dias',
  '30': 'Últimos 30 dias',
  '90': 'Últimos 90 dias',
  mes: 'Este mês',
  personalizado: 'Datas escolhidas',
};

function rotuloDoPeriodo(p: PeriodoLeads): string {
  if (p.tipo === 'personalizado' && p.de && p.ate) return `${dataIsoCurta(p.de)} a ${dataIsoCurta(p.ate)}`;
  return ROTULO_PERIODO[p.tipo];
}

function novo(): ConfigRelatorioLeads {
  return {
    id: crypto.randomUUID(),
    titulo: 'Relatório de leads',
    periodo: { tipo: 'mes', de: '', ate: '' },
    secoes: { resumo: true, origens: true, horarios: true, lista: true },
    comentarios: '',
  };
}

function copiaDe(r: RelatorioLeads): ConfigRelatorioLeads {
  return { id: r.id, titulo: r.titulo, periodo: { ...r.periodo }, secoes: { ...r.secoes }, comentarios: r.comentarios };
}

function desenhar(): void {
  const file = contatosState.getCurrentState();
  if (!container || !file) return;
  // Relatório excluído enquanto estava aberto: volta para a lista.
  if (rascunho && guardado && !file.relatoriosLeads.some((r) => r.id === rascunho!.id)) rascunho = null;
  // Lead chegou com alguém digitando na configuração: só a prévia muda, o foco fica.
  if (rascunho && container.querySelector('.rl-editor') && document.activeElement?.closest('.rl-editor .rl-config')) {
    desenharPrevia();
    return;
  }
  container.replaceChildren(rascunho ? buildEditor(file, rascunho) : buildLista(file));
}

// ---------- Ações ----------

function nomeDoArquivo(cfg: ConfigRelatorioLeads): string {
  const i = intervaloDe(cfg.periodo, hojeLocal());
  return `${cfg.titulo.trim() || 'Relatório de leads'} - ${i.de === i.ate ? i.de : `${i.de} a ${i.ate}`}`;
}

async function salvar(cfg: ConfigRelatorioLeads, exportou = false): Promise<void> {
  await contatosState.salvarRelatorioLeads({ ...cfg }, exportou);
  if (rascunho?.id === cfg.id) {
    guardado = true;
    alterado = false;
    // O state já redesenhou ao gravar (ou nem redesenhou, com o foco num campo):
    // o rótulo e o título se acertam direto, sem tirar o foco de ninguém.
    const salvo = container?.querySelector('.rl-salvo');
    if (salvo) salvo.textContent = 'Salvo';
    const titulo = container?.querySelector('.rl-topo-nome strong');
    if (titulo) titulo.textContent = cfg.titulo.trim() || 'Relatório de leads';
  }
}

/** Exporta o PDF; devolve se foi salvo no disco (e então a configuração é guardada). */
async function exportar(file: ContatosFile, cfg: ConfigRelatorioLeads): Promise<boolean> {
  try {
    const dados = await lerAjustes();
    ajustes = dados;
    const i = intervaloDe(cfg.periodo, hojeLocal());
    const resultado = await exportarDocumentoPdf(buildDocumentoLeads(file, cfg, dados), () =>
      contatosState.exportarPdf({
        titulo: 'Exportar relatório de leads',
        nomeArquivo: nomeDoArquivo(cfg),
        rodape: `${cfg.titulo.trim() || 'Relatório de leads'} · ${rotuloDoIntervalo(i)}`,
      }),
    );
    if (resultado.canceled) return false;
    await salvar(cfg, true);
    return true;
  } catch (e) {
    falhou(e);
    return false;
  }
}

async function sairDoEditor(): Promise<void> {
  if (alterado) {
    const ok = await openConfirmModal({
      title: 'Sair sem salvar?',
      message: 'As mudanças deste relatório ainda não foram salvas.',
      confirmText: 'Sair sem salvar',
    });
    if (!ok) return;
  }
  rascunho = null;
  alterado = false;
  desenhar();
}

function excluir(r: RelatorioLeads): void {
  void openConfirmModal({ title: 'Excluir relatório', message: `Excluir "${r.titulo}"? Os PDFs já salvos no computador não mudam.`, confirmText: 'Excluir' }).then((ok) => {
    if (ok) void contatosState.excluirRelatorioLeads(r.id).catch(falhou);
  });
}

// ---------- Lista ----------

function buildLista(file: ContatosFile): HTMLElement {
  const view = el('div', 'pg-view rl-view');
  const criar = buildBotao('Novo relatório', { variante: 'primario', icone: ICONES_CONTATO.mais });
  criar.addEventListener('click', () => {
    rascunho = novo();
    guardado = false;
    alterado = false;
    desenhar();
  });
  view.appendChild(
    buildCabecalho({
      icone: ICONES_CONTATO.relatorio,
      titulo: 'Relatórios de leads',
      subtitulo: 'PDFs de quantos leads chegaram, de onde, quando e quantos viraram clientes',
      acoes: [criar],
    }),
  );

  const corpo = el('div', 'pg-rolagem rl-corpo');
  const temLeads = file.pessoas.some((p) => p.entrada);
  const lista = [...file.relatoriosLeads].sort((a, b) => (b.atualizadoEm ?? '').localeCompare(a.atualizadoEm ?? ''));
  if (!lista.length) {
    const comecar = buildBotao(temLeads ? 'Criar o primeiro relatório' : 'Ver os leads', { variante: 'primario', icone: temLeads ? ICONES_CONTATO.mais : ICONES_CONTATO.caixa });
    comecar.addEventListener('click', () => {
      if (!temLeads) return abrirModulo('leads');
      rascunho = novo();
      guardado = false;
      desenhar();
    });
    corpo.appendChild(
      buildVazio(
        ICONES_CONTATO.relatorio,
        'Nenhum relatório ainda',
        temLeads
          ? 'Escolha o período e o que entra — resumo, origens e campanhas, horários, a lista de leads e os seus comentários. O relatório fica guardado para gerar de novo, sempre com os números do dia.'
          : 'Os relatórios contam os leads que chegaram pelo formulário do site. Quando os primeiros chegarem, é aqui que eles viram PDF.',
        comecar,
      ),
    );
    view.appendChild(corpo);
    return view;
  }

  const todos = leadsDoArquivo(file).filter((l) => !l.pessoa.arquivado);
  const grade = el('div', 'rl-lista');
  lista.forEach((r) => {
    const cartao = el('article', 'rl-cartao');
    const abrir = el('button', 'rl-cartao-abrir');
    abrir.type = 'button';
    abrir.title = 'Abrir no editor';
    const i = intervaloDe(r.periodo, hojeLocal());
    const n = noIntervalo(todos, i).length;
    const icone = el('span', 'rl-cartao-icone');
    icone.innerHTML = svg(ICONES_CONTATO.relatorio, 18);
    const textos = el('span', 'rl-cartao-textos');
    textos.append(
      el('strong', undefined, r.titulo),
      el('span', undefined, `${rotuloDoPeriodo(r.periodo)} · hoje: ${rotuloDoIntervalo(i)} · ${n} ${n === 1 ? 'lead' : 'leads'}`),
      el('span', 'rl-cartao-quando', r.exportadoEm ? `PDF gerado em ${dataIsoCurta(r.exportadoEm.slice(0, 10))}` : 'Ainda sem PDF'),
    );
    abrir.append(icone, textos);
    abrir.addEventListener('click', () => {
      rascunho = copiaDe(r);
      guardado = true;
      alterado = false;
      desenhar();
    });
    const acoes = el('div', 'rl-cartao-acoes');
    const pdf = buildBotao('PDF', { variante: 'secundario', icone: ICONES_CONTATO.pdf, titulo: 'Gerar o PDF de novo, com os números de hoje' });
    pdf.addEventListener('click', () => {
      pdf.disabled = true;
      void exportar(file, copiaDe(r)).finally(() => (pdf.disabled = false));
    });
    const tirar = buildBotao('', { variante: 'fantasma', icone: ICONES_CONTATO.lixeira, titulo: 'Excluir' });
    tirar.setAttribute('aria-label', `Excluir "${r.titulo}"`);
    tirar.classList.add('is-perigo');
    tirar.addEventListener('click', () => excluir(r));
    acoes.append(pdf, tirar);
    cartao.append(abrir, acoes);
    grade.appendChild(cartao);
  });
  corpo.appendChild(grade);
  corpo.appendChild(el('p', 'rl-nota', 'Um período como "Este mês" ou "Últimos 30 dias" conta a partir do dia em que o PDF é gerado; "Datas escolhidas" fica fixo.'));
  view.appendChild(corpo);
  return view;
}

// ---------- Editor ----------

function desenharPrevia(): void {
  const file = contatosState.getCurrentState();
  if (!previaEl || !file || !rascunho) return;
  const rolagem = previaEl.scrollTop;
  previaEl.replaceChildren(buildDocumentoLeads(file, rascunho, ajustes));
  previaEl.scrollTop = rolagem;
}

function mudou(): void {
  alterado = true;
  container?.querySelector('.rl-salvo')?.replaceChildren(document.createTextNode('Não salvo'));
  desenharPrevia();
}

function marca(rotulo: string, dica: string, marcado: boolean, aoMudar: (v: boolean) => void): HTMLElement {
  const l = el('label', 'ct-pdf-opcao');
  const caixa = el('input');
  caixa.type = 'checkbox';
  caixa.checked = marcado;
  caixa.addEventListener('change', () => aoMudar(caixa.checked));
  const t = el('span', 'ct-pdf-opcao-textos');
  t.append(el('strong', undefined, rotulo), el('span', undefined, dica));
  l.append(caixa, t);
  return l;
}

function buildConfig(cfg: ConfigRelatorioLeads): HTMLElement {
  const col = el('div', 'rl-config');
  col.dataset.rolagem = 'config';

  const titulo = el('label', 'ct-campo');
  titulo.appendChild(el('span', 'ct-campo-rotulo', 'Título'));
  const inputTitulo = el('input', 'ct-input');
  inputTitulo.value = cfg.titulo;
  inputTitulo.addEventListener('input', () => {
    cfg.titulo = inputTitulo.value;
    mudou();
  });
  titulo.appendChild(inputTitulo);
  col.appendChild(titulo);

  const periodo = el('div', 'ct-campo');
  periodo.appendChild(el('span', 'ct-campo-rotulo', 'Período'));
  const datas = el('div', 'rl-datas');
  const de = el('input', 'ct-input');
  de.type = 'date';
  const ate = el('input', 'ct-input');
  ate.type = 'date';
  const preencherDatas = (): void => {
    const i = intervaloDe(cfg.periodo, hojeLocal());
    de.value = i.de;
    ate.value = i.ate;
  };
  periodo.appendChild(
    buildSegmentado<PeriodoLeads['tipo']>(
      [
        { value: 'mes', label: 'Este mês' },
        { value: '7', label: '7 dias' },
        { value: '30', label: '30 dias' },
        { value: '90', label: '90 dias' },
        { value: 'personalizado', label: 'Datas' },
      ],
      cfg.periodo.tipo,
      (v) => {
        const atual = intervaloDe(cfg.periodo, hojeLocal());
        cfg.periodo = v === 'personalizado' ? { tipo: v, de: atual.de, ate: atual.ate } : { tipo: v, de: '', ate: '' };
        datas.hidden = v !== 'personalizado';
        preencherDatas();
        mudou();
      },
    ),
  );
  const aoMudarData = (): void => {
    // O campo de data dispara change a cada dígito do ano: só vale ano completo.
    if (Number(de.value.slice(0, 4)) < 2000 || Number(ate.value.slice(0, 4)) < 2000) return;
    cfg.periodo = { tipo: 'personalizado', de: de.value, ate: ate.value };
    mudou();
  };
  de.addEventListener('change', aoMudarData);
  ate.addEventListener('change', aoMudarData);
  datas.append(de, el('span', undefined, 'a'), ate);
  datas.hidden = cfg.periodo.tipo !== 'personalizado';
  preencherDatas();
  periodo.appendChild(datas);
  periodo.appendChild(el('span', 'ct-campo-dica', 'Um período como "Últimos 30 dias" conta a partir do dia em que o PDF é gerado.'));
  col.appendChild(periodo);

  const secoes = el('div', 'ct-campo');
  secoes.appendChild(el('span', 'ct-campo-rotulo', 'O que entra'));
  const troca = (chave: keyof SecoesRelatorioLeads) => (v: boolean): void => {
    cfg.secoes = { ...cfg.secoes, [chave]: v };
    mudou();
  };
  secoes.append(
    marca('Resumo', 'Quantos chegaram, quentes, conversão, tempo até o 1º contato', cfg.secoes.resumo, troca('resumo')),
    marca('Origens e campanhas', 'De onde vieram e quanto cada uma converteu', cfg.secoes.origens, troca('origens')),
    marca('Horários', 'Dias da semana e períodos do dia com mais chegadas', cfg.secoes.horarios, troca('horarios')),
    marca('Lista de leads', 'Cada lead do período, com a pontuação e a etapa de hoje', cfg.secoes.lista, troca('lista')),
  );
  col.appendChild(secoes);

  const comentarios = el('label', 'ct-campo');
  comentarios.appendChild(el('span', 'ct-campo-rotulo', 'Comentários'));
  const texto = el('textarea', 'ct-input');
  texto.rows = 6;
  texto.placeholder = 'O que você leu nos números e o que vai fazer. Ex.: "A campanha de outubro trouxe metade dos leads; vamos manter o anúncio de vídeo."';
  texto.value = cfg.comentarios;
  texto.addEventListener('input', () => {
    cfg.comentarios = texto.value;
    mudou();
  });
  comentarios.appendChild(texto);
  comentarios.appendChild(el('span', 'ct-campo-dica', 'Aceita "- " para lista, "1. " para lista numerada e **negrito**. Sai no fim do documento.'));
  col.appendChild(comentarios);

  if (ajustes && !ajustes.perfil.nome.trim()) col.appendChild(el('p', 'ct-pdf-aviso', 'Dica: preencha Ajustes › Seus dados para o documento sair com o seu cabeçalho.'));
  return col;
}

function buildEditor(file: ContatosFile, cfg: ConfigRelatorioLeads): HTMLElement {
  const view = el('div', 'pg-view rl-editor');
  const topo = el('header', 'rl-topo');
  const voltar = buildBotao('Relatórios de leads', { variante: 'fantasma', icone: ICONES_CONTATO.voltar });
  voltar.addEventListener('click', () => void sairDoEditor());
  const nome = el('div', 'rl-topo-nome');
  nome.append(el('strong', undefined, guardado ? cfg.titulo : 'Novo relatório'), el('span', 'rl-salvo', alterado ? 'Não salvo' : guardado ? 'Salvo' : 'Ainda não salvo'));
  const salvarBtn = buildBotao('Salvar', { variante: 'secundario', icone: '<polyline points="20 6 9 17 4 12"/>' });
  salvarBtn.addEventListener('click', () => {
    salvarBtn.disabled = true;
    void salvar(cfg)
      .then(() => mostrarToast('Relatório salvo', [], 2500))
      .catch(falhou)
      .finally(() => (salvarBtn.disabled = false));
  });
  const exportarBtn = buildBotao('Exportar PDF', { variante: 'primario', icone: ICONES_CONTATO.pdf });
  exportarBtn.addEventListener('click', () => {
    exportarBtn.disabled = true;
    void exportar(file, cfg).finally(() => (exportarBtn.disabled = false));
  });
  topo.append(voltar, nome, el('span', 'ct-espaco'), salvarBtn, exportarBtn);
  view.appendChild(topo);

  const grade = el('div', 'rl-grade rl-grade');
  grade.appendChild(buildConfig(cfg));
  previaEl = el('div', 'ct-pdf-previa rl-previa');
  previaEl.dataset.rolagem = 'previa-leads';
  grade.appendChild(previaEl);
  view.appendChild(grade);
  desenharPrevia();
  return view;
}
