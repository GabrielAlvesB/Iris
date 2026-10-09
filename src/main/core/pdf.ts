import { BrowserWindow, app, dialog, shell, type IpcMainInvokeEvent, type SaveDialogOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { FileOpResult } from '../../shared/types/export.types';

/**
 * PDF de qualquer documento do app (relatório, ficha de contato, contrato).
 *
 * O PDF sai da própria janela: o renderer monta o documento num contêiner
 * #impressao (ui/impressao.ts) e o CSS de impressão (impressao.css) esconde
 * todo o resto. Assim a prévia na tela e o PDF são o mesmo DOM — sem janela
 * oculta, sem um segundo gerador de HTML para manter em sincronia.
 */

const ENTIDADES_HTML: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ENTIDADES_HTML[c] ?? c);
}

/** Mesma cor do papel dos documentos (--rd-papel em relatorios.css). */
const COR_PAPEL = '#ffffff';

/** Nome de arquivo seguro no Windows: sem os caracteres proibidos e sem ponto no fim. */
export function nomeDeArquivo(nome: string, padrao = 'documento'): string {
  const limpo = nome
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return limpo.slice(0, 120) || padrao;
}

export interface OpcoesPdf {
  /** Título do diálogo de salvar ("Exportar relatório em PDF"). */
  tituloDialogo: string;
  /** Nome sugerido, sem extensão. */
  nomeArquivo: string;
  /** Texto à esquerda do rodapé de cada página; à direita vai "Página N de M". */
  rodape: string;
}

export async function salvarPdfDaJanela(event: IpcMainInvokeEvent, opcoes: OpcoesPdf): Promise<FileOpResult> {
  const janela = BrowserWindow.fromWebContents(event.sender);
  const dialogo: SaveDialogOptions = {
    title: opcoes.tituloDialogo,
    defaultPath: path.join(app.getPath('documents'), `${nomeDeArquivo(opcoes.nomeArquivo)}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  };
  const escolha = janela ? await dialog.showSaveDialog(janela, dialogo) : await dialog.showSaveDialog(dialogo);
  if (escolha.canceled || !escolha.filePath) return { canceled: true };

  // Rodapé do Chromium: fica fora do fluxo da página, então numera todas sem JS.
  const rodape = `<div style="width:100%;padding:0 15mm;font-family:'Segoe UI',sans-serif;font-size:7.5px;color:#6b6780;display:flex;justify-content:space-between;">
    <span>${escaparHtml(opcoes.rodape)}</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;

  // O printToPDF pinta as margens de cima e de baixo (onde mora o rodapé) com a
  // cor de fundo da janela, não com a do documento: com o #0c0d12 do tema, cada
  // página saía com uma faixa preta no topo e no pé. Branco só durante a impressão.
  const fundoOriginal = janela?.getBackgroundColor();
  janela?.setBackgroundColor(COR_PAPEL);
  let pdf: Buffer;
  try {
    pdf = await event.sender.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: rodape,
      // As margens laterais ficam no CSS (padding do documento), para o fundo da capa ir até a borda.
      margins: { marginType: 'custom', top: 0.5, bottom: 0.6, left: 0, right: 0 },
    });
  } finally {
    if (janela && fundoOriginal) janela.setBackgroundColor(fundoOriginal);
  }
  await fs.promises.writeFile(escolha.filePath, pdf);
  return { canceled: false, filePath: escolha.filePath };
}

/** Abre o PDF recém-salvo no leitor padrão. Só aceita um .pdf que existe. */
export async function abrirPdf(filePath: unknown): Promise<void> {
  if (typeof filePath !== 'string' || path.extname(filePath).toLowerCase() !== '.pdf' || !fs.existsSync(filePath)) {
    throw new Error('Arquivo não encontrado.');
  }
  const erro = await shell.openPath(filePath);
  if (erro) throw new Error(erro);
}
