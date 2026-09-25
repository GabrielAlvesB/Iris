import { app, net, shell } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { broadcast } from '../../core/broadcast';
import { isFalha, request } from '../../core/httpClient';
import { aguardarEscritas } from '../../storage/jsonStore';
import { versaoMaior, type EstadoAtualizacao, type ModoAtualizacao } from '../../../shared/types/atualizacao.types';

/**
 * Atualização pelas Releases do GitHub, sem electron-updater: a consulta sai
 * pelo httpClient como todo o resto, e o que precisamos é pouco — ler a
 * última release, baixar o instalador, conferir o SHA-512 do latest.yml que
 * o electron-builder publica junto e rodar o instalador em modo silencioso.
 *
 * As flags `--updated /S --force-run` são as mesmas que o electron-updater
 * usa com o NSIS do electron-builder: instala por cima na pasta de antes,
 * sem perguntas, e abre o app de novo no fim.
 */

/** Mesmo repositório do `build.publish` no package.json. */
const REPOSITORIO = 'GabrielAlvesB/Iris';
const API_ULTIMA = `https://api.github.com/repos/${REPOSITORIO}/releases/latest`;
const PAGINA_RELEASES = `https://github.com/${REPOSITORIO}/releases`;

interface AssetGithub {
  name: string;
  size: number;
  browser_download_url: string;
}

interface ReleaseGithub {
  tag_name: string;
  name?: string;
  body?: string;
  html_url: string;
  published_at: string;
  assets: AssetGithub[];
}

/** O que só o main precisa (urls dos arquivos); a UI recebe o EstadoAtualizacao. */
interface Pacote {
  versao: string;
  instalador?: AssetGithub;
  latestYml?: AssetGithub;
}

let estado: EstadoAtualizacao = {
  versaoAtual: app.getVersion(),
  situacao: 'ocioso',
  modo: detectarModo(),
};
let pacote: Pacote | null = null;
let ultimoProgresso = 0;

function detectarModo(): ModoAtualizacao {
  if (!app.isPackaged) return 'desenvolvimento';
  // O desinstalador só existe na pasta criada pelo instalador NSIS.
  const desinstalador = path.join(path.dirname(process.execPath), `Uninstall ${app.getName()}.exe`);
  return fs.existsSync(desinstalador) ? 'instalado' : 'portatil';
}

function publicar(parcial: Partial<EstadoAtualizacao>): EstadoAtualizacao {
  estado = { ...estado, ...parcial };
  broadcast('atualizacao:estado', estado);
  return estado;
}

function falhar(mensagem: string): EstadoAtualizacao {
  return publicar({ situacao: 'erro', erro: mensagem, progresso: undefined });
}

export function getEstado(): EstadoAtualizacao {
  return estado;
}

/** Nunca lança: é chamado também pela tarefa de fundo. */
export async function verificar(signal?: AbortSignal): Promise<EstadoAtualizacao> {
  // Download em andamento ou instalador rodando: uma verificação no meio atrapalharia.
  if (estado.situacao === 'baixando' || estado.situacao === 'instalando') return estado;
  publicar({ situacao: 'verificando', erro: undefined });

  const resposta = await request(API_ULTIMA, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Iris-app' },
    timeoutMs: 15_000,
    signal,
  });
  const verificadoEm = new Date().toISOString();

  if (isFalha(resposta)) {
    return publicar({ situacao: 'erro', erro: `Sem conexão com o GitHub (${resposta.motivo}).`, verificadoEm });
  }
  // 404 = o repositório ainda não tem nenhuma release publicada.
  if (resposta.status === 404) {
    pacote = null;
    return publicar({ situacao: 'em-dia', nova: undefined, verificadoEm });
  }
  if (resposta.status === 403) {
    return publicar({ situacao: 'erro', erro: 'O GitHub limitou as consultas por agora. Tente de novo mais tarde.', verificadoEm });
  }
  if (!resposta.ok) {
    return publicar({ situacao: 'erro', erro: `O GitHub respondeu HTTP ${resposta.status}.`, verificadoEm });
  }

  let release: ReleaseGithub;
  try {
    release = JSON.parse(resposta.body) as ReleaseGithub;
  } catch {
    return publicar({ situacao: 'erro', erro: 'Resposta inesperada do GitHub.', verificadoEm });
  }

  const versao = release.tag_name.replace(/^v/i, '');
  if (!versaoMaior(versao, estado.versaoAtual)) {
    pacote = null;
    return publicar({ situacao: 'em-dia', nova: undefined, verificadoEm });
  }

  const assets = Array.isArray(release.assets) ? release.assets : [];
  pacote = {
    versao,
    instalador: assets.find((a) => /setup.*\.exe$/i.test(a.name)),
    latestYml: assets.find((a) => a.name === 'latest.yml'),
  };
  return publicar({
    situacao: 'disponivel',
    verificadoEm,
    nova: {
      versao,
      notas: release.body ?? '',
      publicadaEm: release.published_at,
      paginaUrl: release.html_url || PAGINA_RELEASES,
      tamanho: pacote.instalador?.size,
    },
  });
}

/** SHA-512 em base64 da linha de topo do latest.yml (a do instalador). */
function sha512DoYml(yml: string): string | null {
  return /^sha512:\s*(\S+)\s*$/m.exec(yml)?.[1] ?? null;
}

async function baixarPara(url: string, destino: string, total: number): Promise<string> {
  const resposta = await net.fetch(url);
  if (!resposta.ok || !resposta.body) throw new Error(`Download recusado (HTTP ${resposta.status}).`);
  const tamanho = Number(resposta.headers.get('content-length')) || total;

  const hash = createHash('sha512');
  const arquivo = await fs.promises.open(destino, 'w');
  let recebidos = 0;
  try {
    const leitor = resposta.body.getReader();
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      hash.update(value);
      await arquivo.write(value);
      recebidos += value.byteLength;
      // Um push por ponto percentual basta; por pedaço seriam milhares.
      const progresso = tamanho > 0 ? recebidos / tamanho : 0;
      if (progresso - ultimoProgresso >= 0.01) {
        ultimoProgresso = progresso;
        publicar({ progresso });
      }
    }
  } finally {
    await arquivo.close();
  }
  return hash.digest('base64');
}

/**
 * Baixa, confere e instala. O app fecha no fim: o instalador substitui os
 * arquivos e abre a versão nova sozinho.
 */
export async function atualizar(): Promise<EstadoAtualizacao> {
  if (estado.situacao === 'baixando' || estado.situacao === 'instalando') return estado;
  if (estado.modo !== 'instalado') {
    throw new Error('Só a versão instalada se atualiza sozinha. Baixe a versão nova pela página da release.');
  }
  if (!pacote?.instalador) {
    throw new Error('A release não tem o instalador (Iris-Setup-….exe). Publique com "npm run release".');
  }
  if (!pacote.latestYml) {
    throw new Error('A release não tem o latest.yml, que confere o instalador baixado. Publique com "npm run release".');
  }

  ultimoProgresso = 0;
  publicar({ situacao: 'baixando', progresso: 0, erro: undefined });

  try {
    const yml = await request(pacote.latestYml.browser_download_url, { timeoutMs: 20_000 });
    const esperado = !isFalha(yml) && yml.ok ? sha512DoYml(yml.body) : null;
    if (!esperado) return falhar('Não deu para ler o latest.yml da release.');

    const pasta = path.join(app.getPath('temp'), 'iris-atualizacao');
    await fs.promises.rm(pasta, { recursive: true, force: true });
    await fs.promises.mkdir(pasta, { recursive: true });
    // O nome vem do GitHub: só o nome-base, nunca um caminho.
    const destino = path.join(pasta, path.basename(pacote.instalador.name));

    const obtido = await baixarPara(pacote.instalador.browser_download_url, destino, pacote.instalador.size);
    if (obtido !== esperado) {
      await fs.promises.rm(destino, { force: true });
      return falhar('O arquivo baixado não confere com a release (download corrompido). Tente de novo.');
    }

    publicar({ situacao: 'instalando', progresso: 1 });
    await aguardarEscritas();
    const instalador = spawn(destino, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' });
    instalador.unref();
    // Um respiro para o push chegar à tela antes da janela fechar.
    setTimeout(() => app.quit(), 600);
    return estado;
  } catch (error) {
    return falhar(error instanceof Error ? error.message : String(error));
  }
}

/** Portátil e desenvolvimento: a atualização é baixar o .zip novo à mão. */
export async function abrirPagina(): Promise<void> {
  await shell.openExternal(estado.nova?.paginaUrl ?? PAGINA_RELEASES);
}
