/**
 * Categoria visual de um arquivo pela extensão. Usado pela Biblioteca e pelos
 * Materiais dos vídeos — a mesma planilha tem que parecer planilha nos dois.
 */

export type CategoriaArquivo = 'pasta' | 'video' | 'imagem' | 'audio' | 'documento' | 'planilha' | 'codigo' | 'design' | 'outro';

const EXTENSOES: Record<Exclude<CategoriaArquivo, 'pasta' | 'outro'>, string[]> = {
  video: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'prproj', 'drp', 'veg'],
  imagem: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic', 'ico'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'],
  documento: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'pptx', 'ppt', 'key'],
  planilha: ['xlsx', 'xls', 'csv', 'ods', 'tsv'],
  codigo: ['ts', 'js', 'json', 'html', 'css', 'py', 'java', 'cs', 'go', 'rs', 'php', 'sql', 'sh', 'yml', 'yaml'],
  design: ['psd', 'ai', 'fig', 'xd', 'sketch', 'afdesign', 'afphoto', 'blend'],
};

const ICONES: Record<CategoriaArquivo, string> = {
  pasta: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  video: '<rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3"/>',
  imagem: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  documento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  planilha: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>',
  codigo: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  design: '<path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="m2 2 7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
  outro: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
};

export function extensaoDe(nome: string): string {
  const ponto = nome.lastIndexOf('.');
  return ponto > 0 ? nome.slice(ponto + 1).toLowerCase() : '';
}

export function categoriaDe(nome: string, tipo: 'arquivo' | 'pasta'): CategoriaArquivo {
  if (tipo === 'pasta') return 'pasta';
  const ext = extensaoDe(nome);
  const achada = (Object.keys(EXTENSOES) as Array<keyof typeof EXTENSOES>).find((c) => EXTENSOES[c].includes(ext));
  return achada ?? 'outro';
}

export function iconeDaCategoria(categoria: CategoriaArquivo, tamanho = 18): string {
  return `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[categoria]}</svg>`;
}

/** Selo quadrado com o ícone na cor da categoria (classe bb-tipo is-<categoria>). */
export function buildIconeArquivo(nome: string, tipo: 'arquivo' | 'pasta', tamanho = 18): HTMLElement {
  const categoria = categoriaDe(nome, tipo);
  const el = document.createElement('span');
  el.className = `bb-tipo is-${categoria}`;
  el.innerHTML = iconeDaCategoria(categoria, tamanho);
  const ext = extensaoDe(nome);
  el.title = tipo === 'pasta' ? 'Pasta' : ext ? `.${ext}` : 'Arquivo';
  return el;
}

export function formatarTamanho(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
