import type { IpcResult } from '../../../shared/types/common.types';
import {
  EXPORTAVEIS,
  type CopiaDeSeguranca,
  type FileOpResult,
  type FormatoExportacao,
  type ModuloExportavel,
  type PreviaImportacao,
  type ResumoExportavel,
} from '../../../shared/types/export.types.js';
import type {} from '../../../shared/types/preload-api.types';
import { openConfirmModal, openCustomModal } from '../../ui/modal.js';
import { ICONES, buildBotao, svg } from '../../ui/pagina.js';
import { ICONE_DO_MODULO } from '../../core/sidebar.js';

/**
 * Ajustes › Backup. Três partes: o backup completo, cada módulo separado
 * (JSON para restaurar, planilha para ler fora do Iris) e a importação — que
 * sempre mostra o que o arquivo traz e guarda uma cópia antes de substituir.
 */

const ICONE_PLANILHA = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>';
const ICONE_JSON = '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>';
const ICONE_IMPORTAR = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>';
const ICONE_DESFAZER = '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>';

let raiz: HTMLElement | null = null;
let statusEl: HTMLElement | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function mostrarStatus(texto: string, tom: 'ok' | 'erro' | 'neutro' = 'ok'): void {
  if (!statusEl) return;
  statusEl.textContent = texto;
  statusEl.className = `bk-status is-${tom}`;
  statusEl.hidden = !texto;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function dataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'data desconhecida';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function rotuloDe(id: ModuloExportavel): string {
  return EXPORTAVEIS.find((e) => e.id === id)?.rotulo ?? id;
}

async function exportar(escopo: ModuloExportavel[], formato: FormatoExportacao, botao: HTMLButtonElement): Promise<void> {
  botao.disabled = true;
  try {
    const r: FileOpResult = unwrap(await window.irisAPI.export.exportar(escopo, formato));
    if (!r.canceled) mostrarStatus(`Exportado em ${r.filePath}`);
  } catch (e) {
    mostrarStatus(mensagem(e), 'erro');
  } finally {
    botao.disabled = false;
  }
}

// ---------- Importação ----------

/** Depois de gravar, recarrega: todos os módulos leem o arquivo novo sem tratar cache por cache. */
function recarregarDepois(texto: string): void {
  void openCustomModal(
    'Importação concluída',
    ({ corpo, rodape, fechar }) => {
      corpo.appendChild(el('p', 'bk-modal-texto', texto));
      corpo.appendChild(el('p', 'bk-modal-dica', 'O Iris vai recarregar para mostrar os dados novos. Se algo não ficou como esperado, use "Desfazer última importação" em Ajustes › Backup.'));
      const ok = buildBotao('Recarregar agora', { variante: 'primario', icone: ICONES.atualizar });
      ok.addEventListener('click', () => fechar());
      rodape.appendChild(ok);
    },
    { icone: ICONES.check, largura: 460, aoFechar: () => location.reload() },
  );
}

function abrirPrevia(previa: PreviaImportacao): void {
  const marcados = new Set<ModuloExportavel>(previa.modulos.map((m) => m.id));
  let aplicou = false;

  void openCustomModal(
    previa.completo ? 'Importar backup completo' : 'Importar módulos',
    ({ corpo, rodape, fechar }) => {
      corpo.appendChild(
        el(
          'p',
          'bk-modal-texto',
          `Arquivo exportado em ${dataHora(previa.exportadoEm)}. Marque o que deve ser restaurado — cada módulo marcado fica igual ao do arquivo, e o que existe hoje nele é substituído.`,
        ),
      );

      const lista = el('div', 'bk-previa');
      const aviso = el('p', 'bk-modal-aviso');
      const importar = buildBotao('Importar', { variante: 'primario', icone: ICONE_IMPORTAR });

      const atualizar = (): void => {
        const nomes = previa.modulos.filter((m) => marcados.has(m.id)).map((m) => rotuloDe(m.id));
        aviso.textContent = nomes.length
          ? `Substitui o que existe hoje em: ${nomes.join(', ')}. Uma cópia do estado atual é guardada antes.`
          : 'Marque pelo menos um módulo.';
        importar.disabled = !nomes.length;
        importar.replaceChildren();
        importar.insertAdjacentHTML('beforeend', svg(ICONE_IMPORTAR, 14, 2));
        importar.appendChild(el('span', undefined, nomes.length === 1 ? `Importar ${nomes[0]}` : `Importar ${nomes.length} módulos`));
      };

      previa.modulos.forEach((m) => {
        const d = EXPORTAVEIS.find((e) => e.id === m.id);
        const item = el('label', 'bk-previa-item');
        const caixa = el('input');
        caixa.type = 'checkbox';
        caixa.checked = true;
        caixa.addEventListener('change', () => {
          if (caixa.checked) marcados.add(m.id);
          else marcados.delete(m.id);
          atualizar();
        });
        const icone = el('span', 'bk-icone');
        if (d) icone.innerHTML = svg(ICONE_DO_MODULO[d.modulo], 15);
        const textos = el('span', 'bk-previa-textos');
        textos.append(el('strong', undefined, rotuloDe(m.id)), el('span', undefined, m.resumo));
        if (d?.observacao) textos.appendChild(el('em', undefined, d.observacao));
        item.append(caixa, icone, textos);
        lista.appendChild(item);
      });
      corpo.append(lista, aviso);

      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', () => fechar());
      importar.addEventListener('click', () => {
        importar.disabled = true;
        void window.irisAPI.export
          .aplicarImportacao([...marcados])
          .then(unwrap)
          .then((r) => {
            aplicou = true;
            fechar();
            recarregarDepois(`Restaurado: ${r.modulos.map(rotuloDe).join(', ')}.`);
          })
          .catch((e: unknown) => {
            aviso.textContent = mensagem(e);
            aviso.classList.add('is-erro');
            importar.disabled = false;
          });
      });
      rodape.append(cancelar, importar);
      atualizar();
    },
    {
      icone: ICONE_IMPORTAR,
      largura: previa.modulos.length > 3 ? 660 : 520,
      subtitulo: 'Nada é substituído antes de você confirmar',
      aoFechar: () => {
        // Fechar sem importar solta o arquivo guardado no main.
        if (!aplicou) void window.irisAPI.export.cancelarImportacao();
      },
    },
  );
}

async function escolherArquivo(): Promise<void> {
  try {
    const previa = unwrap(await window.irisAPI.export.escolherImportacao());
    if (previa) abrirPrevia(previa);
  } catch (e) {
    mostrarStatus(mensagem(e), 'erro');
  }
}

async function desfazer(copia: CopiaDeSeguranca): Promise<void> {
  const ok = await openConfirmModal({
    title: 'Desfazer última importação',
    message: `Volta ${copia.modulos.map(rotuloDe).join(', ')} ao que era em ${dataHora(copia.criadaEm)}, antes da importação. O estado de agora também ganha uma cópia.`,
    confirmText: 'Desfazer',
  });
  if (!ok) return;
  try {
    const modulos = unwrap(await window.irisAPI.export.desfazerImportacao());
    recarregarDepois(`Voltaram ao estado anterior: ${modulos.map(rotuloDe).join(', ')}.`);
  } catch (e) {
    mostrarStatus(mensagem(e), 'erro');
  }
}

// ---------- Tela ----------

function buildCompleto(): HTMLElement {
  const bloco = el('section', 'bk-completo');
  const icone = el('span', 'bk-completo-icone');
  icone.innerHTML = svg(ICONES.backup, 22);
  const textos = el('div', 'bk-completo-textos');
  textos.append(
    el('h3', undefined, 'Backup completo'),
    el('p', undefined, 'Tudo num arquivo só, para guardar fora do computador ou levar para outra máquina. Senhas, tokens e chaves de IA ficam de fora — cole-as de novo depois de restaurar.'),
  );
  const acoes = el('div', 'bk-completo-acoes');
  const exportarTudo = buildBotao('Exportar tudo', { variante: 'primario', icone: ICONES.backup });
  exportarTudo.addEventListener('click', () => void exportar(EXPORTAVEIS.map((e) => e.id), 'json', exportarTudo));
  const importar = buildBotao('Importar arquivo…', { variante: 'secundario', icone: ICONE_IMPORTAR });
  importar.title = 'Backup completo ou de um módulo — você escolhe o que restaurar antes de qualquer mudança';
  importar.addEventListener('click', () => void escolherArquivo());
  acoes.append(exportarTudo, importar);
  textos.appendChild(acoes);
  bloco.append(icone, textos);
  return bloco;
}

function buildModulos(resumos: ResumoExportavel[] | null): HTMLElement {
  const secao = el('section', 'bk-secao');
  const cab = el('header', 'bk-secao-cab');
  cab.append(el('h3', undefined, 'Por módulo'), el('p', undefined, 'JSON restaura o módulo depois, aqui ou em outro computador. Planilha é para ler e compartilhar — não volta para o Iris.'));
  secao.appendChild(cab);

  const lista = el('div', 'bk-lista');
  EXPORTAVEIS.forEach((d) => {
    const resumo = resumos?.find((r) => r.id === d.id);
    const linha = el('div', `bk-linha${resumo?.vazio ? ' is-vazio' : ''}`);
    const icone = el('span', 'bk-icone');
    icone.innerHTML = svg(ICONE_DO_MODULO[d.modulo], 15);
    const textos = el('div', 'bk-linha-textos');
    textos.append(el('strong', undefined, d.rotulo), el('span', undefined, resumo ? resumo.resumo : 'Carregando…'));
    const acoes = el('div', 'bk-linha-acoes');
    const json = buildBotao('JSON', { variante: 'fantasma', icone: ICONE_JSON, titulo: `Exportar ${d.rotulo} para restaurar depois` });
    json.addEventListener('click', () => void exportar([d.id], 'json', json));
    acoes.appendChild(json);
    if (d.planilha) {
      const planilha = buildBotao('Planilha', { variante: 'fantasma', icone: ICONE_PLANILHA, titulo: `${d.rotulo} em Excel (.xlsx), para ler fora do Iris` });
      planilha.addEventListener('click', () => void exportar([d.id], 'xlsx', planilha));
      acoes.appendChild(planilha);
    } else {
      // Mantém o "JSON" na mesma coluna em todas as linhas.
      acoes.appendChild(el('span'));
    }
    linha.append(icone, textos, acoes);
    lista.appendChild(linha);
  });
  secao.appendChild(lista);
  return secao;
}

function buildSeguranca(copia: CopiaDeSeguranca | null): HTMLElement {
  const secao = el('section', 'bk-seguranca');
  const icone = el('span', 'bk-icone');
  icone.innerHTML = svg(ICONE_DESFAZER, 15);
  const textos = el('div', 'bk-linha-textos');
  textos.appendChild(el('strong', undefined, 'Cópias de segurança'));
  textos.appendChild(
    el(
      'span',
      undefined,
      copia
        ? `Última importação em ${dataHora(copia.criadaEm)} (${copia.modulos.map(rotuloDe).join(', ')}). Dá para voltar ao que era antes dela.`
        : 'Antes de cada importação o Iris guarda o estado atual dos módulos substituídos — as 10 mais recentes.',
    ),
  );
  const acoes = el('div', 'bk-linha-acoes');
  if (copia) {
    const voltar = buildBotao('Desfazer última importação', { variante: 'secundario', icone: ICONE_DESFAZER });
    voltar.addEventListener('click', () => void desfazer(copia));
    acoes.appendChild(voltar);
  }
  const pasta = buildBotao('', { variante: 'fantasma', icone: ICONES.pasta, titulo: 'Abrir a pasta das cópias' });
  pasta.setAttribute('aria-label', 'Abrir a pasta das cópias de segurança');
  pasta.addEventListener('click', () => void window.irisAPI.export.abrirPastaDeCopias());
  acoes.appendChild(pasta);
  secao.append(icone, textos, acoes);
  return secao;
}

function desenhar(resumos: ResumoExportavel[] | null, copia: CopiaDeSeguranca | null): void {
  if (!raiz) return;
  statusEl = el('p', 'bk-status');
  statusEl.setAttribute('role', 'status');
  statusEl.hidden = true;
  raiz.replaceChildren(buildCompleto(), statusEl, buildModulos(resumos), buildSeguranca(copia));
}

export function render(container: HTMLElement): void {
  raiz = container;
  desenhar(null, null);
  // Os números vêm depois: a tela aparece na hora e se completa sozinha.
  void Promise.all([window.irisAPI.export.resumo(), window.irisAPI.export.ultimaCopia()]).then(([r, c]) => {
    if (raiz !== container) return;
    desenhar(r.ok ? r.data : [], c.ok ? c.data : null);
  });
}

/**
 * As referências são de módulo: sem zerar aqui, uma resposta atrasada
 * escreveria num nó já removido depois que o usuário troca de seção.
 */
export function destroy(): void {
  raiz = null;
  statusEl = null;
}
