import { app } from 'electron';
import { aguardarEscritas } from '../../storage/jsonStore';
import { broadcast } from '../../core/broadcast';
import { contextoIpc } from '../../core/contextoIpc';
import * as exportService from '../export/export.service';
import type { ChaveBundle, ExportBundle } from '../../../shared/types/export.types';
import {
  ID_ORDEM,
  ID_RESTO,
  MAX_CONFLITOS_GUARDADOS,
  REGRAS_NUVEM,
  VERSAO_ESQUEMA_NUVEM,
  type ConflitoNuvem,
  type ModoDeEntrada,
  type ResultadoSync,
} from '../../../shared/types/nuvem.types';
import {
  baseDepoisDeEnviar,
  decompor,
  diferencas,
  mesclar,
  recompor,
  tamanhoDe,
  type BaseNuvem,
  type Mudanca,
  type Registros,
  type Remoto,
} from '../../../shared/types/nuvem.sync';
import { criarAdaptador, loadBase, loadFile, saveBase, saveFile } from './nuvem.arquivo';
import { LINHAS_POR_BUSCA, MAX_BYTES_POR_ENVIO, MAX_LINHAS_POR_ENVIO, type AdaptadorNuvem, type LinhaEnvio, type LinhaRemota } from './provedores/comum';

/**
 * O motor: uma rodada de sincronização é buscar → juntar → enviar.
 *
 * 1. Busca na nuvem tudo com `rev` maior que o último lido.
 * 2. Junta com os arquivos daqui (nuvem.sync.ts) e regrava só os que mudaram,
 *    pela `replaceFile` de cada service — logo, pela `migrate`, como todo dado
 *    que entra no Iris.
 * 3. Compara de novo com a base e envia o que este computador tem de diferente.
 *
 * Uma rodada de cada vez. A rede vem antes de ler os arquivos: entre ler e
 * regravar não há espera de internet no meio.
 */

/** A ordem do catálogo; as imagens depois dos vídeos, de quem validam tags e redes. */
const CHAVES = (Object.keys(REGRAS_NUVEM) as ChaveBundle[]).filter((c) => REGRAS_NUVEM[c].sincroniza);

/** Nome do canal das gravações que sobrescrevem uma edição daqui: é com ele que elas entram no Histórico. */
const CANAL_DO_HISTORICO = 'sincronizacao:juntar';

let rodando: Promise<ResultadoSync> | null = null;
let pausados: string[] = [];

export function estaSincronizando(): boolean {
  return rodando !== null;
}

export function arquivosPausados(): string[] {
  return pausados;
}

function avisar(): void {
  broadcast('nuvem:mudou', { sincronizando: rodando !== null });
}

function versaoDe(dados: unknown): number {
  const v = (dados as { schemaVersion?: unknown } | null)?.schemaVersion;
  return typeof v === 'number' ? v : 1;
}

function nomeDoItem(dados: unknown): string {
  if (!dados || typeof dados !== 'object') return '';
  const d = dados as Record<string, unknown>;
  for (const campo of ['titulo', 'title', 'nome', 'name', 'texto', 'text']) {
    const v = d[campo];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80);
  }
  return '';
}

async function buscarTudo(adaptador: AdaptadorNuvem, espaco: string, desde: number): Promise<{ linhas: LinhaRemota[]; rev: number }> {
  const linhas: LinhaRemota[] = [];
  let rev = desde;
  // Teto de páginas: uma nuvem enorme não prende a rodada para sempre; o resto vem na próxima.
  for (let pagina = 0; pagina < 500; pagina++) {
    const lote = await adaptador.buscar(espaco, rev, LINHAS_POR_BUSCA);
    for (const l of lote) {
      linhas.push(l);
      if (l.rev > rev) rev = l.rev;
    }
    if (lote.length < LINHAS_POR_BUSCA) break;
  }
  return { linhas, rev };
}

async function enviarEmLotes(adaptador: AdaptadorNuvem, espaco: string, dispositivo: string, linhas: LinhaEnvio[]): Promise<void> {
  let lote: LinhaEnvio[] = [];
  let bytes = 0;
  const despachar = async (): Promise<void> => {
    if (!lote.length) return;
    await adaptador.enviar(espaco, dispositivo, lote);
    lote = [];
    bytes = 0;
  };
  for (const l of linhas) {
    const tamanho = l.dados === null ? 40 : tamanhoDe(l.dados);
    if (lote.length >= MAX_LINHAS_POR_ENVIO || (lote.length && bytes + tamanho > MAX_BYTES_POR_ENVIO)) await despachar();
    lote.push(l);
    bytes += tamanho;
  }
  await despachar();
}

async function rodar(modo: ModoDeEntrada | undefined): Promise<ResultadoSync> {
  const f = loadFile();
  if (!modo && !f.conectado) throw new Error('Este computador ainda não entrou no espaço. Abra Nuvem › Conexão.');
  const adaptador = criarAdaptador(f);

  const esquema = await adaptador.versaoDoEsquema();
  if (esquema === null) throw new Error('As tabelas do Iris ainda não existem neste banco. Crie-as em Nuvem › Conexão.');
  if (esquema > VERSAO_ESQUEMA_NUVEM) throw new Error('O banco foi atualizado por uma versão mais nova do Iris. Atualize este Iris para continuar sincronizando.');
  await adaptador.marcarPresenca(f.espaco, { id: f.dispositivo.id, nome: f.dispositivo.nome, versao: app.getVersion() });

  // ---- 1. Buscar (só rede) ----
  const { linhas, rev } = await buscarTudo(adaptador, f.espaco, modo ? 0 : f.rev);
  const porArquivo = new Map<string, LinhaRemota[]>();
  for (const l of linhas) {
    // Na rodada normal, o que este computador mesmo enviou não precisa voltar.
    if (!modo && l.dispositivo === f.dispositivo.id) continue;
    if (!porArquivo.has(l.arquivo)) porArquivo.set(l.arquivo, []);
    porArquivo.get(l.arquivo)!.push(l);
  }

  // ---- 2. Juntar (ler → regravar, sem rede no meio) ----
  // "Trazer" substitui o que há aqui: antes, a mesma cópia de segurança de uma importação
  // (Ajustes › Backup › "Desfazer última importação" volta dela).
  if (modo === 'trazer' && porArquivo.size) await exportService.guardarCopiaAntesDeSubstituir();
  await aguardarEscritas();
  const bundle: ExportBundle = await exportService.buildExportBundle();
  const base: Record<string, BaseNuvem> = modo ? {} : { ...loadBase(f) };
  const agora = new Date().toISOString();
  const novosConflitos: Array<Omit<ConflitoNuvem, 'dispositivo'> & { dispositivoId: string }> = [];
  const parados: string[] = [];
  let recebidos = 0;

  for (const chave of CHAVES) {
    const remotas = porArquivo.get(chave);
    if (!remotas?.length) continue;
    const local = bundle[chave];
    // Veio de um Iris mais novo: esta versão descartaria os campos que não conhece e os apagaria da nuvem.
    if (remotas.some((l) => l.esquema > versaoDe(local))) {
      parados.push(exportService.rotuloDaChave(chave));
      continue;
    }
    const locais: Registros = modo === 'trazer' ? new Map() : decompor(chave, local);
    const remotos: Remoto[] = remotas.map((l) => ({ colecao: l.colecao, id: l.id, dados: l.dados, atualizadoEm: l.atualizadoEm, dispositivo: l.dispositivo }));
    const r = mesclar(locais, base[chave] ?? {}, remotos, agora);
    base[chave] = r.base;
    if (!r.aplicados) continue;
    recebidos += r.aplicados;

    // Na entrada ("juntar" dois computadores) tudo é "conflito": não é notícia, e a cópia de antes já existe.
    const perdeuDaqui = modo ? [] : r.conflitos.filter((c) => c.venceu === 'remoto' && c.id !== ID_RESTO && c.id !== ID_ORDEM);
    if (!modo) {
      for (const c of r.conflitos) {
        if (c.id === ID_ORDEM) continue;
        novosConflitos.push({
          quando: agora,
          modulo: exportService.rotuloDaChave(chave),
          item: c.id === ID_RESTO ? 'Preferências' : nomeDoItem(c.perdido) || nomeDoItem(r.registros.get(`${c.colecao}\n${c.id}`)?.dados),
          venceu: c.venceu,
          dispositivoId: c.dispositivo,
        });
      }
    }
    const novo = recompor(chave, local, r.registros);
    // Uma edição daqui foi sobrescrita: a gravação entra no Histórico (com o "antes"), e desfazer traz de volta.
    if (perdeuDaqui.length) await contextoIpc.run({ canal: CANAL_DO_HISTORICO }, () => exportService.restaurarChave(chave, novo));
    else await exportService.restaurarChave(chave, novo);
  }
  await saveBase(f, base);

  // ---- 3. Enviar o que este computador tem de diferente ----
  await aguardarEscritas();
  const depois: ExportBundle = await exportService.buildExportBundle();
  let enviados = 0;
  for (const chave of CHAVES) {
    const mudancas: Mudanca[] = diferencas(base[chave] ?? {}, decompor(chave, depois[chave]));
    if (!mudancas.length) continue;
    const esquemaDoArquivo = versaoDe(depois[chave]);
    await enviarEmLotes(
      adaptador,
      f.espaco,
      f.dispositivo.id,
      mudancas.map((m) => ({ arquivo: chave, colecao: m.colecao, id: m.id, dados: m.dados, esquema: esquemaDoArquivo, atualizadoEm: agora })),
    );
    base[chave] = baseDepoisDeEnviar(base[chave] ?? {}, mudancas);
    enviados += mudancas.length;
    // Arquivo por arquivo: se o próximo falhar, este já está registrado como enviado.
    await saveBase(f, base);
  }

  // ---- 4. Registrar ----
  let nomes = new Map<string, string>();
  if (novosConflitos.length) {
    try {
      nomes = new Map((await adaptador.dispositivos(f.espaco)).map((d) => [d.id, d.nome]));
    } catch {
      // Sem os nomes o conflito aparece do mesmo jeito, só sem dizer de qual computador.
    }
  }
  const g = loadFile();
  // Com um arquivo parado o `rev` não anda: as mudanças dele precisam vir de novo depois de atualizar o Iris.
  if (!parados.length) g.rev = Math.max(g.rev, rev);
  g.conectado = true;
  g.ultimaSyncEm = new Date().toISOString();
  g.ultimoErro = '';
  g.conflitos = [
    ...novosConflitos.map((c): ConflitoNuvem => ({ quando: c.quando, modulo: c.modulo, item: c.item, venceu: c.venceu, dispositivo: nomes.get(c.dispositivoId) ?? '' })),
    ...g.conflitos,
  ].slice(0, MAX_CONFLITOS_GUARDADOS);
  await saveFile(g);
  pausados = parados;
  return { enviados, recebidos, conflitos: novosConflitos.length };
}

/**
 * Uma rodada. `modo` só na entrada no espaço (enviar, trazer ou juntar); depois,
 * sem modo. Chamadas ao mesmo tempo dividem a mesma rodada.
 */
export function sincronizar(modo?: ModoDeEntrada): Promise<ResultadoSync> {
  if (rodando) return rodando;
  rodando = rodar(modo)
    .catch(async (erro: unknown) => {
      // O erro fica guardado para a tela, e ainda sobe para quem pediu.
      try {
        const f = loadFile();
        f.ultimoErro = erro instanceof Error ? erro.message : String(erro);
        await saveFile(f);
      } catch {
        // Nem o registro do erro deu certo: o erro original é o que importa.
      }
      throw erro;
    })
    .finally(() => {
      rodando = null;
      avisar();
    });
  avisar();
  return rodando;
}
