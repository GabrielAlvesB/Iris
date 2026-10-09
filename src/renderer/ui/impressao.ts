import type { IpcResult } from '../../shared/types/common.types';
import type { FileOpResult } from '../../shared/types/export.types';
import { openConfirmModal } from './modal.js';

/**
 * Documento em PDF, para qualquer módulo. O documento vai para #impressao,
 * que o CSS de impressão (impressao.css) mostra sozinho escondendo o resto, e
 * o main imprime a própria janela (core/pdf.ts). A prévia na tela e o PDF são
 * o mesmo DOM.
 *
 * `exportar` é o canal do módulo, que sabe o nome do arquivo e o rodapé.
 * Lança o erro para quem chamou mostrar do jeito dele.
 */
export async function exportarDocumentoPdf(documento: HTMLElement, exportar: () => Promise<FileOpResult>): Promise<FileOpResult> {
  document.getElementById('impressao')?.remove();
  const alvo = document.createElement('div');
  alvo.id = 'impressao';
  alvo.appendChild(documento);
  document.body.appendChild(alvo);
  let resultado: FileOpResult;
  try {
    resultado = await exportar();
  } finally {
    alvo.remove();
  }
  if (!resultado.canceled) {
    const caminho = resultado.filePath;
    const abrir = await openConfirmModal({
      title: 'PDF exportado',
      message: `Salvo em:\n${caminho}`,
      danger: false,
      confirmText: 'Abrir PDF',
      cancelText: 'Fechar',
    });
    if (abrir) {
      const r: IpcResult<void> = await window.irisAPI.documentos.abrirPdf(caminho);
      if (!r.ok) throw new Error(r.error);
    }
  }
  return resultado;
}
