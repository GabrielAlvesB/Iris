import { app, dialog, nativeImage, shell, type BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AnexoPostagem, EscolhaDeAnexos, InfoAnexo } from '../../../shared/types/postagens.types';

/**
 * Anexos de postagem vindos de qualquer pasta do computador. Cada arquivo é
 * copiado para userData/anexos/<id><extensão> no momento em que é escolhido —
 * como o Sheets → Postagens grava a cópia da linha, a postagem nunca depende
 * do original. A descrição (nome, tamanho) mora na própria postagem; aqui só
 * os arquivos. Os binários ficam fora do backup, como a galeria da IA.
 */

/** Anexo é arte de publicação; bruto de vídeo pesado continua indo pela Biblioteca. */
const LIMITE_BYTES = 200 * 1024 * 1024;
const LARGURA_MINIATURA = 160;
const ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXTENSAO_REGEX = /^(\.[a-z0-9]{1,10})?$/;
/** O que o nativeImage sabe ler para a miniatura (SVG e AVIF, não). */
const COM_MINIATURA = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

function pasta(): string {
  return path.join(app.getPath('userData'), 'anexos');
}

/** Quarentena dos órfãos: ficam 30 dias antes de sumir de vez. */
function pastaOrfaos(): string {
  return path.join(pasta(), 'orfaos');
}

const QUARENTENA_MS = 30 * 24 * 60 * 60_000;

/**
 * O caminho vem só do id e da extensão, os dois conferidos por regex: um
 * anexo forjado pela tela não chega a nenhum arquivo fora da pasta.
 */
function caminhoDe(anexo: Pick<AnexoPostagem, 'id' | 'extensao'>): string {
  if (!ID_REGEX.test(anexo.id) || !EXTENSAO_REGEX.test(anexo.extensao)) throw new Error('Anexo inválido.');
  return path.join(pasta(), `${anexo.id}${anexo.extensao}`);
}

/** Limpeza do que vem da tela ou do arquivo: só entra anexo com id e extensão válidos. */
export function migrarAnexos(raw: unknown): AnexoPostagem[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  return raw.flatMap((item): AnexoPostagem[] => {
    const a = (item ?? {}) as Partial<AnexoPostagem>;
    const extensao = typeof a.extensao === 'string' ? a.extensao.toLowerCase() : '';
    if (typeof a.id !== 'string' || !ID_REGEX.test(a.id) || !EXTENSAO_REGEX.test(extensao) || vistos.has(a.id)) return [];
    vistos.add(a.id);
    return [
      {
        id: a.id,
        nome: typeof a.nome === 'string' && a.nome.trim() ? path.basename(a.nome).slice(0, 255) : `anexo${extensao}`,
        extensao,
        tamanho: typeof a.tamanho === 'number' && a.tamanho >= 0 ? a.tamanho : 0,
        adicionadoEm: typeof a.adicionadoEm === 'string' ? a.adicionadoEm : new Date().toISOString(),
      },
    ];
  });
}

/**
 * A cópia existe? Se estiver na quarentena (uma postagem voltou a usá-la —
 * backup restaurado, arquivo de dados recuperado), volta para o lugar.
 */
function presente(anexo: AnexoPostagem): boolean {
  const caminho = caminhoDe(anexo);
  if (fs.existsSync(caminho)) return true;
  const naQuarentena = path.join(pastaOrfaos(), path.basename(caminho));
  if (!fs.existsSync(naQuarentena)) return false;
  try {
    fs.renameSync(naQuarentena, caminho);
    return true;
  } catch {
    return false;
  }
}

/** Na edição: só aceita anexos cuja cópia existe — a tela não inventa anexo. */
export function anexosValidosParaSalvar(raw: unknown): AnexoPostagem[] {
  return migrarAnexos(raw).filter(presente);
}

function tamanhoLegivel(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Diálogo do sistema → cópia de cada arquivo escolhido. */
export async function escolherArquivos(janela: BrowserWindow | null): Promise<EscolhaDeAnexos> {
  const opcoes: OpenDialogOptions = {
    title: 'Anexar arquivos à postagem',
    buttonLabel: 'Anexar',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  };
  const escolha = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes);
  if (escolha.canceled || !escolha.filePaths.length) return { anexos: [], recusados: [] };

  await fs.promises.mkdir(pasta(), { recursive: true });
  const anexos: AnexoPostagem[] = [];
  const recusados: string[] = [];
  for (const origem of escolha.filePaths) {
    const nome = path.basename(origem);
    try {
      const info = await fs.promises.stat(origem);
      if (!info.isFile()) {
        recusados.push(`${nome}: não é um arquivo`);
        continue;
      }
      if (info.size > LIMITE_BYTES) {
        recusados.push(`${nome}: tem ${tamanhoLegivel(info.size)} (o limite é ${tamanhoLegivel(LIMITE_BYTES)}; para arquivos grandes, use a Biblioteca)`);
        continue;
      }
      const extensao = path.extname(nome).toLowerCase();
      const anexo: AnexoPostagem = {
        id: randomUUID(),
        nome,
        extensao: EXTENSAO_REGEX.test(extensao) ? extensao : '',
        tamanho: info.size,
        adicionadoEm: new Date().toISOString(),
      };
      const destino = caminhoDe(anexo);
      await fs.promises.copyFile(origem, destino);
      // A cópia herda a data do original no Windows; a limpeza de órfãos conta a folga a partir de agora.
      const agora = new Date();
      await fs.promises.utimes(destino, agora, agora);
      anexos.push(anexo);
    } catch (erro) {
      recusados.push(`${nome}: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
  return { anexos, recusados };
}

const miniaturas = new Map<string, string>();

function miniaturaDe(anexo: AnexoPostagem, caminho: string): string | undefined {
  if (!COM_MINIATURA.has(anexo.extensao)) return undefined;
  const emCache = miniaturas.get(anexo.id);
  if (emCache) return emCache;
  const img = nativeImage.createFromPath(caminho);
  if (img.isEmpty()) return undefined;
  const { width } = img.getSize();
  const url = (width > LARGURA_MINIATURA ? img.resize({ width: LARGURA_MINIATURA, quality: 'good' }) : img).toDataURL();
  miniaturas.set(anexo.id, url);
  return url;
}

export async function info(raw: unknown): Promise<InfoAnexo[]> {
  return migrarAnexos(raw).map((a) => {
    const existe = presente(a);
    return { id: a.id, existe, miniatura: existe ? miniaturaDe(a, caminhoDe(a)) : undefined };
  });
}

function existente(raw: unknown): { anexo: AnexoPostagem; caminho: string } {
  const [anexo] = migrarAnexos([raw]);
  if (!anexo) throw new Error('Anexo inválido.');
  const caminho = caminhoDe(anexo);
  if (!presente(anexo)) throw new Error('A cópia deste anexo não está mais no computador. Anexe o arquivo de novo.');
  return { anexo, caminho };
}

export async function abrir(raw: unknown): Promise<void> {
  const { caminho } = existente(raw);
  const erro = await shell.openPath(caminho);
  if (erro) throw new Error(`Não deu para abrir: ${erro}`);
}

export async function revelar(raw: unknown): Promise<void> {
  shell.showItemInFolder(existente(raw).caminho);
}

/** "Salvar uma cópia…": devolve o destino, ou null se cancelou. */
export async function exportar(raw: unknown, janela: BrowserWindow | null): Promise<string | null> {
  const { anexo, caminho } = existente(raw);
  const opcoes: SaveDialogOptions = { title: 'Salvar uma cópia do anexo', defaultPath: anexo.nome };
  const escolha = janela ? await dialog.showSaveDialog(janela, opcoes) : await dialog.showSaveDialog(opcoes);
  if (escolha.canceled || !escolha.filePath) return null;
  await fs.promises.copyFile(caminho, escolha.filePath);
  return escolha.filePath;
}

/**
 * Cópias que nenhuma postagem usa mais (anexo tirado, postagem excluída) vão
 * para a quarentena e só são apagadas depois de 30 dias lá. Não apaga direto
 * porque "nenhuma postagem usa" também seria verdade com um videos.json
 * corrompido e recriado vazio — e aí os anexos de verdade sumiriam.
 * Roda na abertura, não a cada edição; a folga de uma hora protege o anexo
 * recém-copiado que ainda não chegou a ser salvo na postagem.
 */
export async function limparOrfaos(emUso: Set<string>): Promise<void> {
  let nomes: string[];
  try {
    nomes = (await fs.promises.readdir(pasta(), { withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name);
  } catch {
    return;
  }
  const agora = Date.now();
  await fs.promises.mkdir(pastaOrfaos(), { recursive: true });
  for (const nome of nomes) {
    const id = nome.slice(0, 36);
    if (!ID_REGEX.test(id) || emUso.has(id)) continue;
    const caminho = path.join(pasta(), nome);
    try {
      if ((await fs.promises.stat(caminho)).mtimeMs > agora - 60 * 60_000) continue;
      const destino = path.join(pastaOrfaos(), nome);
      await fs.promises.rename(caminho, destino);
      // A data da mudança marca o início dos 30 dias.
      await fs.promises.utimes(destino, new Date(agora), new Date(agora));
      miniaturas.delete(id);
    } catch {
      // Arquivo em uso: fica para a próxima abertura.
    }
  }
  for (const nome of await fs.promises.readdir(pastaOrfaos()).catch(() => [] as string[])) {
    const caminho = path.join(pastaOrfaos(), nome);
    try {
      if ((await fs.promises.stat(caminho)).mtimeMs < agora - QUARENTENA_MS) await fs.promises.unlink(caminho);
    } catch {
      // Idem.
    }
  }
}
