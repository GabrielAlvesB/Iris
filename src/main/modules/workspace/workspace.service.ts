import { app, net, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { broadcast } from '../../core/broadcast';
import { isFalha, request } from '../../core/httpClient';
import { focarJanela, notificar } from '../../core/notificacao';
import { COMANDO_DO_PACOTE, comandoParaTerminal, rodarPkexec } from '../../core/pacotesLinux';
import { readStore, writeStore } from '../../storage/jsonStore';
import {
  APPS_WORKSPACE,
  FORMATOS,
  acharApp,
  emCriacao,
  arquivosDoSistema,
  hashDasSomas,
  versaoMaiorQue,
  type AppWorkspace,
  type ArquivoRelease,
  type EstadoApp,
  type EstadoWorkspace,
  type FormatoApp,
  type InstalacaoDetectada,
  type PedidoInstalar,
  type RegistroApp,
  type ReleaseApp,
  type SituacaoApp,
  type VersaoAnterior,
  type WorkspaceFile,
} from '../../../shared/types/workspace.types';

/**
 * Iris Workspace: baixa, confere e instala os outros apps do ecossistema a
 * partir das Releases públicas do GitHub de cada um — o mesmo caminho da
 * atualização do próprio Iris, sem token (o usuário escolheu só repositórios
 * públicos; privado aparece como "ainda não publicado").
 *
 * Nada que a tela manda vira caminho ou URL: ela pede por id de app, formato
 * e versão, e o main usa só o que veio do GitHub nesta sessão e o que ele
 * mesmo detectou no sistema.
 *
 * workspace.json fica fora do backup: diz o que está instalado *neste*
 * computador, e restaurar em outro não pode fingir que o app está lá.
 */

const FILE_NAME = 'workspace.json';
const SCHEMA_VERSION = 1;

/** Só no `npm run dev`: aponta para um servidor falso no formato da API do GitHub. */
const API = (!app.isPackaged && process.env.IRIS_WORKSPACE_API) || 'https://api.github.com';
const CABECALHOS_GITHUB = { Accept: 'application/vnd.github+json', 'User-Agent': 'Iris-app' };
/** A lista de conferência que o app não declara outra: a do sha256sum. */
const SOMAS_PADRAO = /^SHA256SUMS\.txt$/i;

interface AssetGithub {
  name: string;
  size: number;
  browser_download_url: string;
  /** "sha256:<hex>": o GitHub calcula e publica o hash de cada arquivo de release. */
  digest?: string | null;
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

/** O que muda durante a sessão e não vai para o arquivo. */
interface Transitorio {
  situacao?: Extract<SituacaoApp, 'verificando' | 'baixando' | 'conferindo' | 'instalando'>;
  progresso?: number;
  formatoEmUso?: FormatoApp;
  erro?: string;
}

const transitorios = new Map<string, Transitorio>();
/** A última release de cada app, como veio do GitHub (com as URLs dos arquivos). */
const releasesAtuais = new Map<string, ReleaseGithub>();
/** Versões listadas em "Versões anteriores": instalar uma específica só aceita estas. */
const versoesListadas = new Map<string, Map<string, ReleaseGithub>>();
const deteccoes = new Map<string, InstalacaoDetectada & { executavel?: string }>();
const downloads = new Map<string, AbortController>();

// ---------- Arquivo ----------

function nowIso(): string {
  return new Date().toISOString();
}

function ehFormato(v: unknown): v is FormatoApp {
  return typeof v === 'string' && v in FORMATOS;
}

function texto(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function migrateRelease(raw: unknown): ReleaseApp | undefined {
  const r = (raw ?? null) as Partial<ReleaseApp> | null;
  if (!r || typeof r.versao !== 'string') return undefined;
  return {
    versao: r.versao,
    titulo: texto(r.titulo),
    notas: typeof r.notas === 'string' ? r.notas : '',
    publicadaEm: typeof r.publicadaEm === 'string' ? r.publicadaEm : '',
    paginaUrl: typeof r.paginaUrl === 'string' ? r.paginaUrl : '',
    arquivos: Array.isArray(r.arquivos)
      ? r.arquivos.filter((a): a is ArquivoRelease => Boolean(a) && ehFormato(a.formato) && typeof a.nome === 'string').map((a) => ({
          formato: a.formato,
          nome: a.nome,
          tamanho: typeof a.tamanho === 'number' ? a.tamanho : 0,
        }))
      : [],
    temSomas: Boolean(r.temSomas),
  };
}

function migrateRegistro(raw: unknown): RegistroApp {
  const r = (raw ?? {}) as Record<string, unknown>;
  const inst = (r.instalacao ?? null) as Record<string, unknown> | null;
  const baixado = (r.baixado ?? null) as Record<string, unknown> | null;
  return {
    formatoPreferido: ehFormato(r.formatoPreferido) ? r.formatoPreferido : undefined,
    instalacao:
      inst && typeof inst.versao === 'string' && typeof inst.caminho === 'string' && ehFormato(inst.formato)
        ? { versao: inst.versao, caminho: inst.caminho, formato: inst.formato, instaladoEm: texto(inst.instaladoEm) ?? nowIso() }
        : undefined,
    baixado:
      baixado && typeof baixado.nome === 'string' && typeof baixado.versao === 'string' && typeof baixado.caminho === 'string' && ehFormato(baixado.formato)
        ? { nome: baixado.nome, versao: baixado.versao, caminho: baixado.caminho, formato: baixado.formato }
        : undefined,
    ultimaRelease: migrateRelease(r.ultimaRelease),
    naoPublicado: r.naoPublicado === true ? true : undefined,
    verificadoEm: texto(r.verificadoEm),
    avisadaVersao: texto(r.avisadaVersao),
  };
}

function migrate(raw: unknown): WorkspaceFile {
  const c = (raw ?? {}) as Partial<WorkspaceFile>;
  const apps: Record<string, RegistroApp> = {};
  // App que saiu do catálogo some do arquivo: não há tela para mostrá-lo.
  if (c.apps && typeof c.apps === 'object') {
    for (const [id, reg] of Object.entries(c.apps)) if (acharApp(id)) apps[id] = migrateRegistro(reg);
  }
  return { schemaVersion: SCHEMA_VERSION, updatedAt: texto(c.updatedAt) ?? nowIso(), apps };
}

function loadFile(): WorkspaceFile {
  return readStore(FILE_NAME, () => ({ schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), apps: {} }), migrate);
}

async function alterar(appId: string, fn: (reg: RegistroApp) => void): Promise<void> {
  const file = loadFile();
  const reg = file.apps[appId] ?? {};
  fn(reg);
  file.apps[appId] = reg;
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

// ---------- Estado para a tela ----------

function montarApp(app: AppWorkspace, reg: RegistroApp): EstadoApp {
  const t = transitorios.get(app.id) ?? {};
  const release = reg.naoPublicado ? undefined : reg.ultimaRelease;
  const deteccao = deteccoes.get(app.id);
  const instalacao: InstalacaoDetectada | undefined = deteccao
    ? { versao: deteccao.versao, local: deteccao.local, via: deteccao.via }
    : undefined;

  let situacao: SituacaoApp;
  if (emCriacao(app)) situacao = 'em-criacao';
  else if (t.situacao) situacao = t.situacao;
  else if (instalacao) situacao = release && instalacao.versao && versaoMaiorQue(release.versao, instalacao.versao) ? 'atualizacao' : 'instalado';
  else if (t.erro && !release) situacao = 'erro';
  else if (!release) situacao = 'nao-publicado';
  else situacao = release.arquivos.length > 0 ? 'disponivel' : 'sem-arquivo';

  return {
    id: app.id,
    situacao,
    release,
    instalacao,
    progresso: t.progresso,
    formatoEmUso: t.formatoEmUso,
    formatoPreferido: reg.formatoPreferido,
    baixado: reg.baixado && fs.existsSync(reg.baixado.caminho) ? { nome: reg.baixado.nome, versao: reg.baixado.versao, formato: reg.baixado.formato } : undefined,
    erro: t.erro,
    verificadoEm: reg.verificadoEm,
  };
}

function montarEstado(): EstadoWorkspace {
  const file = loadFile();
  return {
    sistema: process.platform,
    arch: process.arch,
    apps: APPS_WORKSPACE.map((a) => montarApp(a, file.apps[a.id] ?? {})),
  };
}

function publicar(): EstadoWorkspace {
  const estado = montarEstado();
  broadcast('workspace:estado', estado);
  return estado;
}

function marcar(appId: string, t: Transitorio | null): void {
  if (t) transitorios.set(appId, t);
  else transitorios.delete(appId);
  publicar();
}

export async function getEstado(): Promise<EstadoWorkspace> {
  await detectarTodos();
  return montarEstado();
}

function exigirApp(appId: string): AppWorkspace {
  const a = acharApp(appId);
  if (!a) throw new Error('Esse app não faz parte do Workspace.');
  return a;
}

type AppComRepo = AppWorkspace & { repo: string };

/** App em criação não tem repositório: nada a consultar, baixar ou abrir no GitHub. */
function exigirRepo(appId: string): AppComRepo {
  const a = exigirApp(appId);
  if (!a.repo) throw new Error(`${a.nome} ainda está em criação.`);
  return a as AppComRepo;
}

function ocupado(appId: string): boolean {
  const s = transitorios.get(appId)?.situacao;
  return s === 'baixando' || s === 'conferindo' || s === 'instalando';
}

// ---------- GitHub ----------

function arquivosDaRelease(a: AppWorkspace, release: ReleaseGithub): ArquivoRelease[] {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const out: ArquivoRelease[] = [];
  for (const { formato, padrao } of arquivosDoSistema(a, process.platform, process.arch)) {
    const asset = assets.find((x) => padrao.test(x.name));
    if (asset) out.push({ formato, nome: asset.name, tamanho: asset.size });
  }
  return out;
}

/** O SHA-256 que o próprio GitHub publicou para o arquivo, em hex minúsculo. */
function hashDoGithub(asset: AssetGithub): string | null {
  const m = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest ?? '');
  return m ? m[1].toLowerCase() : null;
}

/**
 * Dá para conferir quando a release traz o SHA256SUMS.txt ou quando o GitHub publicou o hash de todos os
 * arquivos deste computador (o MultiDesk não publica a lista; o digest do GitHub cobre).
 */
function conferivel(a: AppWorkspace, r: ReleaseGithub): boolean {
  const assets = r.assets ?? [];
  if (assets.some((x) => (a.somas ?? SOMAS_PADRAO).test(x.name))) return true;
  const deste = arquivosDoSistema(a, process.platform, process.arch).map((o) => assets.find((x) => o.padrao.test(x.name)));
  const presentes = deste.filter((x): x is AssetGithub => Boolean(x));
  return presentes.length > 0 && presentes.every((x) => hashDoGithub(x));
}

function releaseParaTela(a: AppWorkspace, r: ReleaseGithub): ReleaseApp {
  return {
    versao: r.tag_name.replace(/^v/i, ''),
    titulo: r.name || undefined,
    notas: r.body ?? '',
    publicadaEm: r.published_at,
    paginaUrl: r.html_url,
    arquivos: arquivosDaRelease(a, r),
    temSomas: conferivel(a, r),
  };
}

/** Nunca lança: também roda na tarefa de fundo. */
export async function verificar(appId?: string, signal?: AbortSignal): Promise<EstadoWorkspace> {
  const alvos = (appId ? [exigirApp(appId)] : APPS_WORKSPACE).filter((a): a is AppComRepo => Boolean(a.repo));
  for (const a of alvos) {
    if (ocupado(a.id)) continue;
    marcar(a.id, { situacao: 'verificando' });
    const erro = await verificarUm(a, signal);
    marcar(a.id, erro ? { erro } : null);
  }
  await detectarTodos();
  avisarAtualizacoes();
  return publicar();
}

async function verificarUm(a: AppComRepo, signal?: AbortSignal): Promise<string | undefined> {
  const resposta = await request(`${API}/repos/${a.repo}/releases/latest`, { headers: CABECALHOS_GITHUB, timeoutMs: 15_000, signal });
  if (isFalha(resposta)) return `Sem conexão com o GitHub (${resposta.motivo}).`;
  const verificadoEm = nowIso();
  // 404: repositório sem release pública — ou ainda privado, que para a API sem token é a mesma coisa.
  if (resposta.status === 404) {
    releasesAtuais.delete(a.id);
    await alterar(a.id, (reg) => {
      reg.naoPublicado = true;
      reg.ultimaRelease = undefined;
      reg.verificadoEm = verificadoEm;
    });
    return undefined;
  }
  if (resposta.status === 403 || resposta.status === 429) return 'O GitHub limitou as consultas por agora. Tente de novo mais tarde.';
  if (!resposta.ok) return `O GitHub respondeu HTTP ${resposta.status}.`;
  let release: ReleaseGithub;
  try {
    release = JSON.parse(resposta.body) as ReleaseGithub;
  } catch {
    return 'Resposta inesperada do GitHub.';
  }
  releasesAtuais.set(a.id, release);
  await alterar(a.id, (reg) => {
    reg.naoPublicado = undefined;
    reg.ultimaRelease = releaseParaTela(a, release);
    reg.verificadoEm = verificadoEm;
  });
  return undefined;
}

/** Notificação uma vez por versão nova de um app instalado. */
function avisarAtualizacoes(): void {
  const file = loadFile();
  for (const a of APPS_WORKSPACE) {
    const reg = file.apps[a.id];
    const instalada = deteccoes.get(a.id)?.versao;
    const nova = reg?.ultimaRelease?.versao;
    if (!reg || !instalada || !nova || !versaoMaiorQue(nova, instalada) || reg.avisadaVersao === nova) continue;
    void alterar(a.id, (r) => (r.avisadaVersao = nova));
    notificar(`${a.nome} ${nova} disponível`, `Você está na ${instalada}. Atualize pelo Iris Workspace.`, () => {
      focarJanela();
      broadcast('workspace:abrir', { appId: a.id });
    });
  }
}

export async function listarVersoes(appId: string): Promise<VersaoAnterior[]> {
  const a = exigirRepo(appId);
  const resposta = await request(`${API}/repos/${a.repo}/releases?per_page=30`, { headers: CABECALHOS_GITHUB, timeoutMs: 15_000 });
  if (isFalha(resposta)) throw new Error(`Sem conexão com o GitHub (${resposta.motivo}).`);
  if (resposta.status === 404) return [];
  if (!resposta.ok) throw new Error(`O GitHub respondeu HTTP ${resposta.status}.`);
  let lista: ReleaseGithub[];
  try {
    lista = JSON.parse(resposta.body) as ReleaseGithub[];
  } catch {
    throw new Error('Resposta inesperada do GitHub.');
  }
  const mapa = new Map<string, ReleaseGithub>();
  const versoes: VersaoAnterior[] = [];
  for (const r of Array.isArray(lista) ? lista : []) {
    if (r.draft) continue;
    const versao = r.tag_name.replace(/^v/i, '');
    mapa.set(versao, r);
    versoes.push({ versao, titulo: r.name || undefined, publicadaEm: r.published_at, paginaUrl: r.html_url, preRelease: Boolean(r.prerelease) });
  }
  versoesListadas.set(appId, mapa);
  return versoes;
}

// ---------- Detectar o que está instalado ----------

interface Saida {
  codigo: number | null;
  saida: string;
}

function rodar(comando: string, args: string[], timeoutMs = 10_000): Promise<Saida> {
  return new Promise((resolve) => {
    // execFile sem shell: os argumentos nunca passam por interpretação de linha de comando.
    execFile(comando, args, { timeout: timeoutMs, windowsHide: true, shell: false }, (erro, stdout, stderr) => {
      const codigo = erro ? (typeof (erro as { code?: unknown }).code === 'number' ? ((erro as { code: number }).code) : null) : 0;
      resolve({ codigo, saida: `${stdout ?? ''}${stderr ?? ''}` });
    });
  });
}

/** "    InstallDir    REG_SZ    C:\…" → o valor. */
function valorDoReg(saida: string, nome: string): string | undefined {
  const m = new RegExp(`^\\s*${nome}\\s+REG_\\w+\\s+(.+?)\\s*$`, 'mi').exec(saida);
  // O MSI grava a pasta com a barra no fim ("…\IrisWord\").
  return m?.[1].replace(/[\\/]+$/, '');
}

type ComoInstalado = NonNullable<AppWorkspace['instalado']>;

/**
 * A chave de desinstalação do app: o nome dela é o código do produto (o MSI troca a cada versão, o Inno
 * Setup usa o AppId), por isso a busca é pelo DisplayName — "IrisWord" (MSI) ou "MultiDesk 0.5.3" (Inno).
 */
async function chaveDeDesinstalacao(nome: string): Promise<{ versao?: string; local?: string } | null> {
  for (const raiz of ['HKCU', 'HKLM']) {
    for (const base of ['Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall']) {
      if (raiz === 'HKCU' && base.includes('WOW6432Node')) continue;
      const busca = await rodar('reg', ['query', `${raiz}\\${base}`, '/s', '/f', nome, '/d']);
      if (busca.codigo !== 0) continue;
      const chaves = busca.saida.split(/\r?\n/).filter((l) => /^HKEY_/i.test(l.trim())).map((l) => l.trim());
      for (const chave of chaves) {
        const r = await rodar('reg', ['query', chave]);
        if (r.codigo !== 0) continue;
        const exibido = valorDoReg(r.saida, 'DisplayName') ?? '';
        // "IrisWord" não pode casar com "IrisWord Tools": só o nome puro ou seguido da versão.
        if (exibido !== nome && !exibido.startsWith(`${nome} `)) continue;
        return { versao: valorDoReg(r.saida, 'DisplayVersion'), local: valorDoReg(r.saida, 'InstallLocation') };
      }
    }
  }
  return null;
}

async function detectarWindows(a: AppWorkspace, inst: ComoInstalado): Promise<(InstalacaoDetectada & { executavel?: string }) | null> {
  let pasta: string | undefined;
  if (inst.chaveWindows) {
    for (const raiz of ['HKCU', 'HKLM']) {
      const r = await rodar('reg', ['query', `${raiz}\\${inst.chaveWindows}`, '/v', 'InstallDir', '/reg:64']);
      pasta = r.codigo === 0 ? valorDoReg(r.saida, 'InstallDir') : undefined;
      if (pasta) break;
    }
  }
  const desinstalacao = await chaveDeDesinstalacao(inst.nomeWindows);
  // Sem a chave (instalação antiga, portátil copiado à mão): as pastas padrão — a dos apps Iris e a de cada um.
  const programas = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'), process.env.ProgramFiles, process.env['ProgramFiles(x86)']];
  const candidatas = [
    pasta,
    desinstalacao?.local,
    ...programas.flatMap((p) => (p ? [path.join(p, 'Iris', a.nome), path.join(p, a.nome)] : [])),
  ].filter((p): p is string => Boolean(p));
  const local = candidatas.find((p) => fs.existsSync(path.join(p, inst.exeWindows)));
  if (!local) return null;
  return { versao: desinstalacao?.versao, local, via: 'sistema', executavel: path.join(local, inst.exeWindows) };
}

async function detectarLinux(inst: ComoInstalado, reg: RegistroApp): Promise<(InstalacaoDetectada & { executavel?: string }) | null> {
  const pacote = inst.pacoteLinux;
  const dpkg = await rodar('dpkg-query', ['-W', '-f=${Status}|${Version}', pacote]);
  if (dpkg.codigo === 0 && /install ok installed/.test(dpkg.saida)) {
    const versao = dpkg.saida.split('|')[1]?.trim().replace(/-\d+$/, '').replace(/~/g, '-');
    return { versao, local: `/usr/bin/${inst.exeLinux}`, via: 'sistema', executavel: inst.exeLinux };
  }
  const rpm = await rodar('rpm', ['-q', '--qf', '%{VERSION}', pacote]);
  if (rpm.codigo === 0 && rpm.saida.trim() && !/not installed|não está instalado/i.test(rpm.saida)) {
    return { versao: rpm.saida.trim().replace(/~/g, '-'), local: `/usr/bin/${inst.exeLinux}`, via: 'sistema', executavel: inst.exeLinux };
  }
  // "multidesk 0.5.3-1": a versão sem o número do pacote.
  const pacman = await rodar('pacman', ['-Q', pacote]);
  if (pacman.codigo === 0 && pacman.saida.trim()) {
    const versao = pacman.saida.trim().split(/\s+/)[1]?.replace(/-\d+$/, '');
    return { versao, local: `/usr/bin/${inst.exeLinux}`, via: 'sistema', executavel: inst.exeLinux };
  }
  const appImage = reg.instalacao;
  if (appImage && fs.existsSync(appImage.caminho)) {
    return { versao: appImage.versao, local: appImage.caminho, via: 'workspace', executavel: appImage.caminho };
  }
  return null;
}

async function detectarTodos(): Promise<void> {
  const file = loadFile();
  await Promise.all(
    APPS_WORKSPACE.map(async (a) => {
      // App em criação não tem como ser reconhecido no sistema.
      const inst = a.instalado;
      try {
        const d = !inst
          ? null
          : process.platform === 'win32'
            ? await detectarWindows(a, inst)
            : process.platform === 'linux'
              ? await detectarLinux(inst, file.apps[a.id] ?? {})
              : null;
        if (d) deteccoes.set(a.id, d);
        else deteccoes.delete(a.id);
      } catch {
        // Detectar é melhor esforço: na dúvida, o app aparece como não instalado.
        deteccoes.delete(a.id);
      }
    }),
  );
}

// ---------- Baixar, conferir e instalar ----------

function pastaDeDownloads(): string {
  const pasta = path.join(app.getPath('userData'), 'workspace', 'downloads');
  fs.mkdirSync(pasta, { recursive: true });
  return pasta;
}

async function baixarPara(appId: string, url: string, destino: string, total: number, signal: AbortSignal): Promise<string> {
  const resposta = await net.fetch(url, { signal });
  if (!resposta.ok || !resposta.body) throw new Error(`Download recusado (HTTP ${resposta.status}).`);
  const tamanho = Number(resposta.headers.get('content-length')) || total;
  const hash = createHash('sha256');
  const arquivo = await fs.promises.open(destino, 'w');
  let recebidos = 0;
  let ultimo = 0;
  try {
    const leitor = resposta.body.getReader();
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      hash.update(value);
      await arquivo.write(value);
      recebidos += value.byteLength;
      const progresso = tamanho > 0 ? recebidos / tamanho : 0;
      // Um push por ponto percentual basta; por pedaço seriam milhares.
      if (progresso - ultimo >= 0.01) {
        ultimo = progresso;
        marcar(appId, { ...transitorios.get(appId), progresso });
      }
    }
  } finally {
    await arquivo.close();
  }
  return hash.digest('hex');
}

/** Baixa o arquivo do formato escolhido, confere o SHA-256 publicado na release e instala. */
export async function instalar(pedido: PedidoInstalar): Promise<EstadoWorkspace> {
  const a = exigirRepo(pedido.appId);
  if (ocupado(a.id)) return montarEstado();

  let release = pedido.versao ? versoesListadas.get(a.id)?.get(pedido.versao) : releasesAtuais.get(a.id);
  if (!release && !pedido.versao) {
    // Aberto sem internet e reconectado depois: a cópia do arquivo não tem as URLs.
    await verificar(a.id);
    release = releasesAtuais.get(a.id);
  }
  if (!release) throw new Error(pedido.versao ? 'Liste as versões de novo antes de instalar uma anterior.' : 'Este app ainda não tem uma versão publicada.');

  const versao = release.tag_name.replace(/^v/i, '');
  const opcoes = arquivosDoSistema(a, process.platform, process.arch);
  const assets = release.assets ?? [];
  const reg = loadFile().apps[a.id] ?? {};
  const escolhido =
    [pedido.formato, reg.formatoPreferido]
      .map((f) => opcoes.find((o) => o.formato === f))
      .find((o) => o && assets.some((x) => o.padrao.test(x.name))) ?? opcoes.find((o) => assets.some((x) => o.padrao.test(x.name)));
  const asset = escolhido && assets.find((x) => escolhido.padrao.test(x.name));
  if (!escolhido || !asset) throw new Error(`A versão ${versao} não tem um arquivo para este computador.`);
  const somas = assets.find((x) => (a.somas ?? SOMAS_PADRAO).test(x.name));
  const doGithub = hashDoGithub(asset);
  if (!somas && !doGithub) {
    throw new Error('Esta versão não traz o SHA256SUMS.txt e o GitHub não publicou o hash do arquivo — sem isso o Iris não tem como conferir, e não instala.');
  }
  // O nome vem do GitHub, mas vira caminho no disco: nada de pastas nele.
  const nome = path.basename(asset.name);
  if (!nome || nome !== asset.name) throw new Error('Nome de arquivo inesperado na release.');

  const controle = new AbortController();
  downloads.set(a.id, controle);
  marcar(a.id, { situacao: 'baixando', progresso: 0, formatoEmUso: escolhido.formato });
  const destino = path.join(pastaDeDownloads(), nome);
  try {
    // O digest vem na mesma resposta da API que deu a URL; o SHA256SUMS.txt é a reserva (release antiga).
    let esperado = doGithub;
    if (!esperado && somas) {
      const lista = await request(somas.browser_download_url, { timeoutMs: 30_000, signal: controle.signal });
      if (isFalha(lista)) throw new Error(lista.motivo === 'abortado' ? 'abortado' : `Não deu para baixar a lista de conferência (${lista.motivo}).`);
      if (!lista.ok) throw new Error(`Não deu para baixar a lista de conferência (HTTP ${lista.status}).`);
      esperado = hashDasSomas(lista.body, nome);
      if (!esperado) throw new Error(`O SHA256SUMS.txt desta versão não lista ${nome}; o arquivo não foi baixado.`);
    }

    const obtido = await baixarPara(a.id, asset.browser_download_url, destino, asset.size, controle.signal);
    marcar(a.id, { situacao: 'conferindo', progresso: 1, formatoEmUso: escolhido.formato });
    if (obtido !== esperado) {
      await fs.promises.rm(destino, { force: true });
      throw new Error('O arquivo baixado não bate com o SHA-256 publicado na release. Ele foi apagado e nada foi instalado.');
    }
    await alterar(a.id, (r) => {
      r.formatoPreferido = escolhido.formato;
      r.baixado = { nome, versao, formato: escolhido.formato, caminho: destino };
    });
    await instalarArquivo(a, escolhido.formato, destino, versao);
    marcar(a.id, null);
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    const cancelado = controle.signal.aborted || msg === 'abortado';
    if (cancelado) await fs.promises.rm(destino, { force: true }).catch(() => undefined);
    marcar(a.id, cancelado ? null : { erro: msg });
  } finally {
    downloads.delete(a.id);
  }
  await detectarTodos();
  return publicar();
}

export function cancelar(appId: string): EstadoWorkspace {
  downloads.get(appId)?.abort();
  return montarEstado();
}

async function instalarArquivo(a: AppWorkspace, formato: FormatoApp, arquivo: string, versao: string): Promise<void> {
  if (formato === 'zip' || formato === 'targz') {
    shell.showItemInFolder(arquivo);
    return;
  }
  marcar(a.id, { situacao: 'instalando', progresso: 1, formatoEmUso: formato });
  if (formato === 'msi') return instalarMsi(a, arquivo);
  if (formato === 'exe') return instalarExe(a, arquivo);
  if (formato === 'appimage') return guardarAppImage(a, arquivo, versao);
  if (formato === 'deb' || formato === 'rpm' || formato === 'pacman') return instalarPacote(arquivo, formato);
}

/** O processo do app está rodando? (tasklist com o nome exato do executável.) */
async function estaAberto(exe: string): Promise<boolean> {
  const r = await rodar('tasklist', ['/FI', `IMAGENAME eq ${exe}`, '/NH']);
  return r.codigo === 0 && r.saida.toLowerCase().includes(exe.toLowerCase());
}

/**
 * Instalador .exe (Inno Setup, o do MultiDesk): os argumentos do catálogo o fazem instalar sem perguntas,
 * só para a conta. Não é assinado — com o Controle Inteligente de Aplicativos ligado, o Windows recusa
 * criar o processo e o execFile volta sem código.
 */
async function instalarExe(a: AppWorkspace, arquivo: string): Promise<void> {
  const inst = a.instalado;
  if (!inst?.argsInstaladorExe) throw new Error(`O Iris não sabe instalar o ${a.nome} por este arquivo. Use a página da release.`);
  const reabrir = inst.argsReabrir && (await estaAberto(inst.exeWindows)) ? inst.argsReabrir : [];
  const r = await rodar(arquivo, [...inst.argsInstaladorExe, ...reabrir], 30 * 60_000);
  if (r.codigo === 0) {
    await fs.promises.rm(arquivo, { force: true }).catch(() => undefined);
    await alterar(a.id, (reg) => (reg.baixado = undefined));
    return;
  }
  const saida = 'O arquivo foi conferido e ficou na pasta de downloads do Workspace (botão "Mostrar na pasta").';
  if (r.codigo === null) {
    throw new Error(
      `O Windows não deixou o instalador abrir. Isso acontece quando o Controle Inteligente de Aplicativos ou o antivírus barra programas sem assinatura digital, como este. ${saida}`,
    );
  }
  // Códigos do Inno Setup: 2 e 5 = cancelado; 8 = precisa reiniciar o Windows antes.
  if (r.codigo === 2 || r.codigo === 5) throw new Error('A instalação foi cancelada.');
  if (r.codigo === 8) throw new Error(`O Windows precisa reiniciar antes de instalar o ${a.nome}. ${saida}`);
  throw new Error(`O instalador terminou com o código ${r.codigo}. ${saida}`);
}

/**
 * MSI de escopo duplo (perUserOrMachine): por padrão para a conta, sem
 * administrador. Se a cópia instalada é a de "todos os usuários" (Program
 * Files), atualiza nela — o instalador recusa uma segunda cópia em outro escopo.
 */
async function instalarMsi(a: AppWorkspace, arquivo: string): Promise<void> {
  const local = deteccoes.get(a.id)?.local ?? '';
  const daMaquina = /\\Program Files( \(x86\))?\\/i.test(local);
  const escopo = daMaquina ? ['ALLUSERS=1'] : ['ALLUSERS=2', 'MSIINSTALLPERUSER=1'];
  const r = await rodar('msiexec', ['/i', arquivo, '/passive', '/norestart', ...escopo], 30 * 60_000);
  if (r.codigo === 0 || r.codigo === 3010) {
    await fs.promises.rm(arquivo, { force: true }).catch(() => undefined);
    await alterar(a.id, (reg) => (reg.baixado = undefined));
    return;
  }
  if (r.codigo === 1602) throw new Error('A instalação foi cancelada.');
  if (r.codigo === 1618) throw new Error('Outra instalação está em andamento no Windows. Espere ela terminar e tente de novo.');
  // Nem todo app do ecossistema tem instalador assinado (o do IrisGrid não tem): com o Controle
  // Inteligente de Aplicativos ligado, o Windows barra o .msi e o portátil é a saída.
  const saida = `O arquivo foi conferido e ficou na pasta de downloads do Workspace; se o Windows continuar barrando, use o formato Portátil (.zip) na página do ${a.nome}.`;
  if (r.codigo === 1625 || r.codigo === 1260) {
    throw new Error(`O Windows bloqueou o instalador (Controle Inteligente de Aplicativos ou uma política do sistema). ${saida}`);
  }
  if (r.codigo === null) throw new Error(`O Windows não deixou o instalador abrir (antivírus ou Controle Inteligente de Aplicativos). ${saida}`);
  throw new Error(`O instalador terminou com o código ${r.codigo}. ${saida}`);
}

/** AppImage: um arquivo só, guardado numa pasta do usuário — a atualização troca o arquivo no mesmo lugar. */
async function guardarAppImage(a: AppWorkspace, arquivo: string, versao: string): Promise<void> {
  const pasta = path.join(app.getPath('home'), 'Aplicativos');
  await fs.promises.mkdir(pasta, { recursive: true });
  const final = path.join(pasta, `${a.nome}.AppImage`);
  // Temporário ao lado: rename entre discos diferentes falha (EXDEV).
  const aoLado = path.join(pasta, `.${a.nome}.AppImage.novo`);
  try {
    await fs.promises.copyFile(arquivo, aoLado);
    await fs.promises.chmod(aoLado, 0o755);
    await fs.promises.rename(aoLado, final);
  } catch (erro) {
    await fs.promises.rm(aoLado, { force: true }).catch(() => undefined);
    throw new Error(`Não deu para guardar o AppImage em ${pasta} (${(erro as NodeJS.ErrnoException).code ?? String(erro)}).`);
  }
  await fs.promises.rm(arquivo, { force: true }).catch(() => undefined);
  await alterar(a.id, (reg) => {
    reg.baixado = undefined;
    reg.instalacao = { versao, caminho: final, formato: 'appimage', instaladoEm: nowIso() };
  });
}

async function instalarPacote(baixado: string, pacote: 'deb' | 'rpm' | 'pacman'): Promise<void> {
  let arquivo = baixado;
  try {
    // Na pasta Downloads: se a senha for recusada, o pacote está lá para instalar à mão.
    const destino = path.join(app.getPath('downloads'), path.basename(baixado));
    await fs.promises.copyFile(baixado, destino);
    arquivo = destino;
  } catch {
    // Sem pasta Downloads: instala do lugar onde baixou.
  }
  const manual = `O pacote ficou em ${arquivo}. Para instalar pelo terminal: ${comandoParaTerminal(pacote, arquivo)}`;
  const r = await rodarPkexec(COMANDO_DO_PACOTE[pacote](arquivo));
  if (r.erro?.code === 'ENOENT') throw new Error(`Este sistema não tem o pkexec (polkit). ${manual}`);
  if (r.erro) throw new Error(`Não deu para pedir a senha de administrador (${r.erro.code ?? r.erro.message}). ${manual}`);
  if (r.codigo === 126) throw new Error(`A instalação foi cancelada na janela de senha. ${manual}`);
  if (r.codigo === 127) throw new Error(`A janela de senha de administrador não apareceu. ${manual}`);
  if (r.codigo !== 0) {
    const ultima = r.saida.trim().split('\n').filter(Boolean).pop() ?? `código ${r.codigo}`;
    throw new Error(`A instalação falhou (${ultima}). ${manual}`);
  }
}

// ---------- Abrir, mostrar, desinstalar ----------

export async function abrir(appId: string): Promise<void> {
  const a = exigirApp(appId);
  if (!deteccoes.has(a.id)) await detectarTodos();
  const executavel = deteccoes.get(a.id)?.executavel;
  if (!executavel) throw new Error(`${a.nome} não está instalado neste computador.`);
  await new Promise<void>((resolve, reject) => {
    try {
      const filho = spawn(executavel, [], { detached: true, stdio: 'ignore', windowsHide: false });
      filho.once('error', (erro: NodeJS.ErrnoException) => reject(new Error(`Não deu para abrir o ${a.nome} (${erro.code ?? erro.message}).`)));
      filho.once('spawn', () => {
        filho.unref();
        resolve();
      });
    } catch (erro) {
      reject(new Error(`Não deu para abrir o ${a.nome} (${erro instanceof Error ? erro.message : String(erro)}).`));
    }
  });
}

export async function mostrarNaPasta(appId: string): Promise<void> {
  const a = exigirApp(appId);
  const baixado = loadFile().apps[a.id]?.baixado;
  if (baixado && fs.existsSync(baixado.caminho)) {
    shell.showItemInFolder(baixado.caminho);
    return;
  }
  const local = deteccoes.get(a.id)?.local;
  if (local && fs.existsSync(local)) {
    if (fs.statSync(local).isDirectory()) await shell.openPath(local);
    else shell.showItemInFolder(local);
    return;
  }
  throw new Error('Não há arquivo deste app para mostrar.');
}

export async function abrirPagina(appId: string, versao?: string): Promise<void> {
  const a = exigirRepo(appId);
  const release = versao ? versoesListadas.get(a.id)?.get(versao) : releasesAtuais.get(a.id);
  const url = release?.html_url ?? `https://github.com/${a.repo}/releases`;
  // Só a página do GitHub: a URL veio da API, mas é o shell do sistema que a abre.
  if (!/^https:\/\/github\.com\//.test(url)) throw new Error('Endereço inesperado da release.');
  await shell.openExternal(url);
}

/**
 * Desinstalar fica com o sistema (a lista de aplicativos do Windows, o
 * gerenciador de pacotes). Só o AppImage, que o próprio Workspace guardou,
 * sai daqui.
 */
export async function desinstalar(appId: string): Promise<EstadoWorkspace> {
  const a = exigirApp(appId);
  const d = deteccoes.get(a.id);
  if (!d) throw new Error(`${a.nome} não está instalado.`);
  if (d.via === 'workspace' && d.local) {
    await fs.promises.rm(d.local, { force: true });
    await alterar(a.id, (reg) => (reg.instalacao = undefined));
    await detectarTodos();
    return publicar();
  }
  if (process.platform === 'win32') {
    await shell.openExternal('ms-settings:appsfeatures');
    return montarEstado();
  }
  const pacote = a.instalado?.pacoteLinux ?? a.id;
  throw new Error(`Remova pelo gerenciador de pacotes: sudo apt remove ${pacote} (Debian/Ubuntu) ou sudo dnf remove ${pacote} (Fedora).`);
}
