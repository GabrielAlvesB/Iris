import { BrowserWindow, app, dialog, net, shell, type OpenDialogOptions } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { broadcast } from '../../core/broadcast';
import { isFalha, request } from '../../core/httpClient';
import { aguardarEscritas } from '../../storage/jsonStore';
import {
  relacaoCom,
  seAtualizaSozinho,
  versaoMaior,
  type EstadoAtualizacao,
  type InstaladorLocal,
  type ModoAtualizacao,
  type PacoteLinux,
  type VersaoPublicada,
} from '../../../shared/types/atualizacao.types';

/**
 * Atualização pelas Releases do GitHub, sem electron-updater: a consulta sai
 * pelo httpClient como todo o resto, e o que precisamos é pouco — ler a
 * última release, baixar o instalador, conferir o SHA-512 do latest.yml que
 * o electron-builder publica junto e rodar o instalador em modo silencioso.
 *
 * As flags `--updated /S --force-run` são as mesmas que o electron-updater
 * usa com o NSIS do electron-builder: instala por cima na pasta de antes,
 * sem perguntas, e abre o app de novo no fim.
 *
 * Além da última release, dá para instalar qualquer versão publicada (voltar
 * para uma anterior) ou um instalador que está no disco — o de `release/`
 * recém-gerado, antes de publicar. Nos dois casos o fim é o mesmo: conferir
 * e rodar o instalador por cima.
 *
 * No Linux o arquivo da release depende de como o Iris foi instalado: o
 * AppImage troca o próprio arquivo; .deb, .rpm e pacman baixam o pacote e o
 * instalam pelo pkexec (a janela de senha de administrador do sistema). A
 * conferência é a mesma, pelo latest-linux.yml, que lista os quatro arquivos.
 */

/** Mesmo repositório do `build.publish` no package.json. */
const REPOSITORIO = 'GabrielAlvesB/Iris';
const API_ULTIMA = `https://api.github.com/repos/${REPOSITORIO}/releases/latest`;
const API_TODAS = `https://api.github.com/repos/${REPOSITORIO}/releases?per_page=30`;
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
  draft?: boolean;
  prerelease?: boolean;
  assets: AssetGithub[];
}

/** O que só o main precisa (urls dos arquivos); a UI recebe o EstadoAtualizacao. */
interface Pacote {
  versao: string;
  /** O arquivo deste formato: Iris-Setup-….exe, Iris-….AppImage, .deb, .rpm ou .pkg.tar.xz. */
  instalador?: AssetGithub;
  latestYml?: AssetGithub;
}

const pacoteLinux = detectarPacoteLinux();
let estado: EstadoAtualizacao = {
  versaoAtual: app.getVersion(),
  situacao: 'ocioso',
  modo: detectarModo(),
  ...(pacoteLinux ? { pacote: pacoteLinux } : {}),
};
let pacote: Pacote | null = null;
/** Pacotes da última listagem, por versão: instalarVersao só aceita o que veio do GitHub. */
let pacotesListados = new Map<string, Pacote>();
/**
 * Instalador escolhido no disco. Fica aqui, e não na tela, de propósito: o
 * renderer nunca manda um caminho para o main executar.
 */
let arquivoEscolhido: { caminho: string; versao?: string } | null = null;
let ultimoProgresso = 0;

const CABECALHOS_GITHUB = { Accept: 'application/vnd.github+json', 'User-Agent': 'Iris-app' };

/** O nome do arquivo da release que serve para esta cópia. */
function arquivoDoFormato(): RegExp {
  if (estado.pacote === 'deb') return /_amd64\.deb$/i;
  if (estado.pacote === 'rpm') return /\.x86_64\.rpm$/i;
  if (estado.pacote === 'pacman') return /\.pkg\.tar\.(xz|zst)$/i;
  // AppImage, ou uma pasta solta no Linux (o tamanho mostrado é o do AppImage).
  if (process.platform === 'linux') return /\.AppImage$/i;
  return /setup.*\.exe$/i;
}

const NOME_DO_YML = process.platform === 'linux' ? 'latest-linux.yml' : 'latest.yml';

function pacoteDaRelease(release: ReleaseGithub): Pacote {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const formato = arquivoDoFormato();
  return {
    versao: release.tag_name.replace(/^v/i, ''),
    instalador: assets.find((a) => formato.test(a.name)),
    latestYml: assets.find((a) => a.name === NOME_DO_YML),
  };
}

function ocupado(): boolean {
  return estado.situacao === 'baixando' || estado.situacao === 'instalando';
}

/**
 * O electron-builder grava `resources/package-type` ("deb", "rpm", "pacman")
 * dentro de cada pacote — é o mesmo arquivo que o electron-updater lê.
 * AppImage não tem: lá quem diz é a variável APPIMAGE, posta pelo runtime dele.
 */
function detectarPacoteLinux(): PacoteLinux | undefined {
  if (process.platform !== 'linux' || !app.isPackaged || process.env.APPIMAGE) return undefined;
  try {
    const tipo = fs.readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim();
    return tipo === 'deb' || tipo === 'rpm' || tipo === 'pacman' ? tipo : undefined;
  } catch {
    return undefined;
  }
}

function detectarModo(): ModoAtualizacao {
  if (!app.isPackaged) return 'desenvolvimento';
  if (process.platform === 'linux') {
    if (process.env.APPIMAGE) return 'appimage';
    // Pasta solta (linux-unpacked, um .tar): não há o que trocar, só avisa.
    return detectarPacoteLinux() ? 'pacote' : 'linux';
  }
  if (process.platform !== 'win32') return 'linux';
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
  return publicar({ situacao: 'erro', erro: mensagem, progresso: undefined, versaoAlvo: undefined });
}

export function getEstado(): EstadoAtualizacao {
  return estado;
}

/** Nunca lança: é chamado também pela tarefa de fundo. */
export async function verificar(signal?: AbortSignal): Promise<EstadoAtualizacao> {
  // Download em andamento ou instalador rodando: uma verificação no meio atrapalharia.
  if (ocupado()) return estado;
  publicar({ situacao: 'verificando', erro: undefined });

  const resposta = await request(API_ULTIMA, {
    headers: CABECALHOS_GITHUB,
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
    return publicar({ situacao: 'em-dia', nova: undefined, semReleases: true, verificadoEm });
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
    return publicar({ situacao: 'em-dia', nova: undefined, semReleases: false, verificadoEm });
  }

  pacote = pacoteDaRelease(release);
  return publicar({
    situacao: 'disponivel',
    semReleases: false,
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

/**
 * SHA-512 (base64) de um arquivo no latest.yml / latest-linux.yml. O do Linux
 * lista os quatro formatos em `files:` (cada um com `url` e `sha512`), por
 * isso a busca é pelo nome. O do Windows também tem a lista; o `sha512` de
 * topo fica de reserva para um .yml antigo.
 */
function sha512DoYml(yml: string, nome: string): string | null {
  let atual: string | null = null;
  for (const linha of yml.split(/\r?\n/)) {
    const url = /^\s*-\s*url:\s*(\S+)\s*$/.exec(linha);
    if (url) {
      atual = url[1];
      continue;
    }
    const sha = /^\s+sha512:\s*(\S+)\s*$/.exec(linha);
    if (sha && atual === nome) return sha[1];
  }
  if (process.platform === 'linux') return null;
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
 * Roda o instalador por cima e fecha o app. Na versão instalada vai em modo
 * silencioso e reabre sozinho; fora dela (portátil, npm run dev) abre o
 * assistente normal do instalador, que pergunta onde instalar.
 */
async function rodarInstalador(caminho: string, versao: string | undefined): Promise<EstadoAtualizacao> {
  publicar({ situacao: 'instalando', progresso: 1, versaoAlvo: versao, erro: undefined });
  await aguardarEscritas();
  if (estado.modo === 'appimage') return trocarAppImage(caminho);
  if (estado.modo === 'pacote' && estado.pacote) return instalarPacote(caminho, estado.pacote);
  if (estado.modo !== 'instalado') {
    const erro = await shell.openPath(caminho);
    if (erro) return falhar(`Não deu para abrir o instalador: ${erro}`);
    return publicar({ situacao: estado.nova ? 'disponivel' : 'em-dia', progresso: undefined, versaoAlvo: undefined });
  }
  // Só fecha o app depois que o Windows de fato iniciou o instalador: antes o
  // quit era agendado às cegas, e um erro assíncrono fechava o Iris sem instalar.
  return new Promise((resolve) => {
    const bloqueado = (erro: unknown): void => {
      const codigo = (erro as NodeJS.ErrnoException | undefined)?.code ?? '';
      resolve(falhar(mensagemDeBloqueio(codigo, erro)));
    };
    try {
      const instalador = spawn(caminho, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' });
      instalador.once('error', bloqueado);
      instalador.once('spawn', () => {
        instalador.unref();
        // Um respiro para o push chegar à tela antes da janela fechar.
        setTimeout(() => app.quit(), 600);
        resolve(estado);
      });
    } catch (erro) {
      // No Windows, um CreateProcess recusado (UNKNOWN) é lançado na hora, não emitido.
      bloqueado(erro);
    }
  });
}

/**
 * "spawn UNKNOWN" não diz nada a ninguém. No Windows 11, o caso comum é o
 * Controle Inteligente de Aplicativos (ou o antivírus) barrar o instalador
 * porque ele não tem assinatura digital — o log CodeIntegrity registra
 * "did not meet the signing level requirements". Nada no app contorna isso.
 */
function mensagemDeBloqueio(codigo: string, erro: unknown): string {
  if (codigo === 'UNKNOWN' || codigo === 'EPERM' || codigo === 'EACCES') {
    return (
      'O Windows impediu o instalador de abrir. Isso acontece quando o Controle Inteligente de Aplicativos ' +
      '(Segurança do Windows › Controle de aplicativos e navegador) ou o antivírus bloqueia programas sem ' +
      'assinatura digital, como o instalador do Iris. O arquivo foi baixado e conferido; instale pela página ' +
      'da release ou libere o instalador e tente de novo.'
    );
  }
  return `Não deu para abrir o instalador (${codigo || (erro instanceof Error ? erro.message : String(erro))}).`;
}

/**
 * Reabre o Iris depois da troca. O relaunch do Electron espera este processo
 * sair antes de abrir o novo — por isso não briga com a instância única da bandeja.
 */
function reabrir(execPath?: string): void {
  app.relaunch(execPath ? { execPath, args: process.argv.slice(1) } : undefined);
  // Um respiro para o push chegar à tela antes da janela fechar.
  setTimeout(() => app.quit(), 600);
}

/**
 * AppImage: o arquivo novo entra no lugar do antigo, no mesmo caminho — o
 * atalho do menu continua valendo. O antigo está montado (o processo atual lê
 * dele), mas o rename só troca a entrada da pasta; o conteúdo antigo continua
 * aberto até o app fechar.
 */
async function trocarAppImage(baixado: string): Promise<EstadoAtualizacao> {
  const atual = process.env.APPIMAGE;
  if (!atual) return falhar('Não deu para achar o arquivo do AppImage em uso.');
  // O temporário fica ao lado: rename entre discos diferentes falha (EXDEV).
  const aoLado = path.join(path.dirname(atual), `.${path.basename(atual)}.novo`);
  try {
    await fs.promises.copyFile(baixado, aoLado);
    await fs.promises.chmod(aoLado, 0o755);
    await fs.promises.rename(aoLado, atual);
  } catch (erro) {
    await fs.promises.rm(aoLado, { force: true }).catch(() => undefined);
    const codigo = (erro as NodeJS.ErrnoException).code;
    return falhar(
      codigo === 'EACCES' || codigo === 'EPERM' || codigo === 'EROFS'
        ? `Sem permissão para trocar ${atual}. Mova o AppImage para uma pasta sua (ex.: ~/Aplicativos) ou baixe o novo pela página da release.`
        : `Não deu para trocar o AppImage (${codigo ?? String(erro)}).`,
    );
  }
  await fs.promises.rm(baixado, { force: true }).catch(() => undefined);
  reabrir(atual);
  return estado;
}

/**
 * O comando de baixo nível de cada família — existe em toda distribuição dela
 * e aceita subir, repetir ou voltar de versão (as dependências vieram na
 * primeira instalação): dpkg (Debian, Ubuntu, Mint, Pop!_OS), rpm (Fedora,
 * openSUSE, RHEL e derivados) e pacman (Arch, Manjaro, EndeavourOS).
 */
const COMANDO_DO_PACOTE: Record<PacoteLinux, (arquivo: string) => string[]> = {
  deb: (arquivo) => ['dpkg', '-i', arquivo],
  rpm: (arquivo) => ['rpm', '-U', '--oldpackage', '--replacepkgs', arquivo],
  pacman: (arquivo) => ['pacman', '-U', '--noconfirm', arquivo],
};

/** O mesmo comando para colar no terminal, quando a janela de senha não deu certo. */
function comandoParaTerminal(pacote: PacoteLinux, arquivo: string): string {
  return ['sudo', ...COMANDO_DO_PACOTE[pacote](arquivo)].map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(' ');
}

interface ResultadoPkexec {
  codigo: number | null;
  erro?: NodeJS.ErrnoException;
  saida: string;
}

function rodarPkexec(args: string[]): Promise<ResultadoPkexec> {
  return new Promise((resolve) => {
    let saida = '';
    try {
      const filho = spawn('pkexec', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      filho.stdout.on('data', (d: Buffer) => (saida += d.toString()));
      filho.stderr.on('data', (d: Buffer) => (saida += d.toString()));
      filho.once('error', (erro: NodeJS.ErrnoException) => resolve({ codigo: null, erro, saida }));
      filho.once('close', (codigo) => resolve({ codigo, saida }));
    } catch (erro) {
      resolve({ codigo: null, erro: erro as NodeJS.ErrnoException, saida });
    }
  });
}

/**
 * Pacote do sistema: instala pelo pkexec, que abre a janela de senha de
 * administrador do GNOME/KDE (o agente do polkit). O pacote vai antes para a
 * pasta Downloads — se a senha for recusada, ele está lá para instalar à mão.
 */
async function instalarPacote(baixado: string, pacote: PacoteLinux): Promise<EstadoAtualizacao> {
  let arquivo = baixado;
  try {
    const destino = path.join(app.getPath('downloads'), path.basename(baixado));
    await fs.promises.copyFile(baixado, destino);
    await fs.promises.rm(baixado, { force: true });
    arquivo = destino;
  } catch {
    // Sem pasta Downloads: instala do temporário mesmo.
  }
  const comando = COMANDO_DO_PACOTE[pacote](arquivo);
  const manual = `O pacote ficou em ${arquivo}. Para instalar pelo terminal: ${comandoParaTerminal(pacote, arquivo)}`;
  const r = await rodarPkexec(comando);

  if (r.erro?.code === 'ENOENT') return falhar(`Este sistema não tem o pkexec (polkit). ${manual}`);
  if (r.erro) return falhar(`Não deu para pedir a senha de administrador (${r.erro.code ?? r.erro.message}). ${manual}`);
  // 126: senha recusada ou janela fechada; 127: não há agente do polkit na
  // sessão (comum num gerenciador de janelas sem ambiente completo).
  if (r.codigo === 126) return falhar(`A instalação foi cancelada na janela de senha. ${manual}`);
  if (r.codigo === 127) return falhar(`A janela de senha de administrador não apareceu. ${manual}`);
  if (r.codigo !== 0) {
    const ultima = r.saida.trim().split('\n').filter(Boolean).pop() ?? `código ${r.codigo}`;
    return falhar(`O ${comando[0]} não conseguiu instalar (${ultima}). ${manual}`);
  }
  await fs.promises.rm(arquivo, { force: true }).catch(() => undefined);
  // Mesmo caminho (/opt/Iris/iris), arquivos novos.
  reabrir();
  return estado;
}

function descreverArquivo(): string {
  if (estado.modo === 'appimage') return 'o AppImage';
  if (estado.pacote === 'deb') return 'o .deb';
  if (estado.pacote === 'rpm') return 'o .rpm';
  if (estado.pacote === 'pacman') return 'o pacote do pacman (.pkg.tar.xz)';
  return 'o instalador (Iris-Setup-….exe)';
}

/** Baixa o arquivo de uma release, confere com o .yml dela e instala. */
async function baixarEInstalar(alvo: Pacote): Promise<EstadoAtualizacao> {
  if (ocupado()) return estado;
  if (!seAtualizaSozinho(estado.modo)) {
    throw new Error(
      estado.modo === 'linux'
        ? 'Esta cópia do Iris não veio de um pacote (.deb, .rpm, pacman) nem de um AppImage: baixe a versão nova na página da release.'
        : 'Só a versão instalada se atualiza sozinha. Baixe a versão pela página da release ou use "Instalar de um arquivo".',
    );
  }
  if (!alvo.instalador) {
    throw new Error(`A release ${alvo.versao} não tem ${descreverArquivo()}. Baixe pela página da release.`);
  }
  if (!alvo.latestYml) {
    throw new Error(`A release ${alvo.versao} não tem o ${NOME_DO_YML}, que confere o arquivo baixado.`);
  }

  ultimoProgresso = 0;
  publicar({ situacao: 'baixando', progresso: 0, versaoAlvo: alvo.versao, erro: undefined });

  try {
    const yml = await request(alvo.latestYml.browser_download_url, { timeoutMs: 20_000 });
    const esperado = !isFalha(yml) && yml.ok ? sha512DoYml(yml.body, alvo.instalador.name) : null;
    if (!esperado) return falhar(`O ${NOME_DO_YML} da release não descreve ${alvo.instalador.name}.`);

    const pasta = path.join(app.getPath('temp'), 'iris-atualizacao');
    await fs.promises.rm(pasta, { recursive: true, force: true });
    await fs.promises.mkdir(pasta, { recursive: true });
    // O nome vem do GitHub: só o nome-base, nunca um caminho.
    const destino = path.join(pasta, path.basename(alvo.instalador.name));

    const obtido = await baixarPara(alvo.instalador.browser_download_url, destino, alvo.instalador.size);
    if (obtido !== esperado) {
      await fs.promises.rm(destino, { force: true });
      return falhar('O arquivo baixado não confere com a release (download corrompido). Tente de novo.');
    }
    return await rodarInstalador(destino, alvo.versao);
  } catch (error) {
    return falhar(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Baixa, confere e instala a versão nova encontrada na verificação. O app
 * fecha no fim: o instalador substitui os arquivos e abre a versão nova sozinho.
 */
export async function atualizar(): Promise<EstadoAtualizacao> {
  if (!pacote) throw new Error('Nenhuma versão nova encontrada. Clique em "Verificar agora".');
  return baixarEInstalar(pacote);
}

/** Todas as releases publicadas (sem rascunhos), da mais nova para a mais antiga. */
export async function listarVersoes(): Promise<VersaoPublicada[]> {
  const resposta = await request(API_TODAS, { headers: CABECALHOS_GITHUB, timeoutMs: 15_000 });
  if (isFalha(resposta)) throw new Error(`Sem conexão com o GitHub (${resposta.motivo}).`);
  if (resposta.status === 403) throw new Error('O GitHub limitou as consultas por agora. Tente de novo mais tarde.');
  if (!resposta.ok) throw new Error(`O GitHub respondeu HTTP ${resposta.status}.`);

  let releases: ReleaseGithub[];
  try {
    releases = JSON.parse(resposta.body) as ReleaseGithub[];
  } catch {
    throw new Error('Resposta inesperada do GitHub.');
  }
  if (!Array.isArray(releases)) throw new Error('Resposta inesperada do GitHub.');

  const publicadas = releases.filter((r) => !r.draft && typeof r.tag_name === 'string');
  pacotesListados = new Map(publicadas.map((r) => [pacoteDaRelease(r).versao, pacoteDaRelease(r)]));
  return publicadas
    .map((r): VersaoPublicada => {
      const p = pacoteDaRelease(r);
      return {
        versao: p.versao,
        publicadaEm: r.published_at,
        notas: r.body ?? '',
        paginaUrl: r.html_url || PAGINA_RELEASES,
        tamanho: p.instalador?.size,
        preRelease: Boolean(r.prerelease),
        instalavel: Boolean(p.instalador && p.latestYml),
        relacao: relacaoCom(p.versao, estado.versaoAtual),
      };
    })
    .sort((a, b) => (versaoMaior(a.versao, b.versao) ? -1 : versaoMaior(b.versao, a.versao) ? 1 : 0));
}

/** Instala uma versão da última listagem — mais nova, a mesma (reparar) ou anterior. */
export async function instalarVersao(versao: string): Promise<EstadoAtualizacao> {
  if (typeof versao !== 'string') throw new Error('Versão inválida.');
  if (!pacotesListados.has(versao)) await listarVersoes();
  const alvo = pacotesListados.get(versao);
  if (!alvo) throw new Error(`A versão ${versao} não está entre as releases publicadas.`);
  return baixarEInstalar(alvo);
}

/** "Iris-Setup-0.1.4.exe" → "0.1.4". Nome fora do padrão fica sem versão. */
function versaoDoNome(nome: string): string | undefined {
  return /setup[-_ ]?v?(\d+(?:\.\d+)+(?:-[\w.]+)?)\.exe$/i.exec(nome)?.[1];
}

async function sha512DoArquivo(caminho: string): Promise<string> {
  const hash = createHash('sha512');
  for await (const pedaco of fs.createReadStream(caminho)) hash.update(pedaco as Buffer);
  return hash.digest('base64');
}

/** O `path:` do latest.yml aponta para este arquivo? O de outra versão não serve de régua. */
function ymlDescreve(yml: string, nome: string): boolean {
  return yml.split(/\r?\n/).some((linha) => /^path:/.test(linha) && linha.slice(5).trim() === nome);
}

/**
 * Seletor de arquivo para um instalador no disco. Se houver um latest.yml ao
 * lado (a pasta release/ do build tem), confere o SHA-512; se não bater,
 * recusa — é outro arquivo, ou um corrompido.
 */
export async function escolherInstalador(janela: BrowserWindow | null): Promise<InstaladorLocal | null> {
  if (ocupado()) throw new Error('Já há uma instalação em andamento.');
  if (process.platform === 'linux') throw new Error('No Linux a troca de versão é por "Escolher versão…" ou pela página da release.');
  const opcoes: OpenDialogOptions = {
    title: 'Escolher o instalador do Iris',
    properties: ['openFile'],
    filters: [{ name: 'Instalador do Iris', extensions: ['exe'] }],
  };
  const escolha = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes);
  const caminho = escolha.filePaths[0];
  if (escolha.canceled || !caminho) return null;

  const nome = path.basename(caminho);
  if (!/setup.*\.exe$/i.test(nome)) {
    throw new Error(`"${nome}" não parece o instalador do Iris. Escolha o Iris-Setup-<versão>.exe (fica em release/ depois do npm run dist).`);
  }
  const info = await fs.promises.stat(caminho);

  let conferido = false;
  const yml = await fs.promises.readFile(path.join(path.dirname(caminho), 'latest.yml'), 'utf8').catch(() => null);
  if (yml && ymlDescreve(yml, nome)) {
    const esperado = sha512DoYml(yml, nome);
    if (esperado && (await sha512DoArquivo(caminho)) !== esperado) {
      throw new Error('O instalador não confere com o latest.yml ao lado dele (arquivo corrompido ou trocado). Gere de novo com npm run dist.');
    }
    conferido = Boolean(esperado);
  }

  const versao = versaoDoNome(nome);
  arquivoEscolhido = { caminho, versao };
  return {
    nome,
    versao,
    tamanho: info.size,
    conferido,
    relacao: versao ? relacaoCom(versao, estado.versaoAtual) : undefined,
  };
}

/** Instala o arquivo escolhido por último. O app fecha e reabre na versão dele. */
export async function instalarArquivo(): Promise<EstadoAtualizacao> {
  if (ocupado()) return estado;
  if (!arquivoEscolhido) throw new Error('Escolha o instalador primeiro.');
  const { caminho, versao } = arquivoEscolhido;
  if (!fs.existsSync(caminho)) {
    arquivoEscolhido = null;
    throw new Error('O instalador escolhido não está mais lá. Escolha de novo.');
  }
  try {
    return await rodarInstalador(caminho, versao);
  } catch (error) {
    return falhar(error instanceof Error ? error.message : String(error));
  }
}

/** Portátil e desenvolvimento: a atualização é baixar o .zip novo à mão. */
export async function abrirPagina(): Promise<void> {
  await shell.openExternal(estado.nova?.paginaUrl ?? PAGINA_RELEASES);
}
