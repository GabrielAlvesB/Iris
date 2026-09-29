import { readStore, writeStore } from '../../storage/jsonStore';
import { deleteSecretsByPrefix, getSecret, hasSecret, isEncryptionAvailable, setSecret } from '../../storage/secretStore';
import {
  PROVEDORES,
  descritorDe,
  isProvedorId,
  type Capacidade,
  type ConfigProvedor,
  type DestinoBiblioteca,
  type IaConfig,
  type ModeloIa,
  type ProvedorId,
  type SalvarPadroesInput,
  type SalvarProvedorInput,
} from '../../../shared/types/ia.types';
import { anthropic } from './provedores/anthropic';
import type { Adaptador, ContextoProvedor } from './provedores/comum';
import { google } from './provedores/google';
import { criarOpenAi } from './provedores/openai';
import { openrouter } from './provedores/openrouter';

/**
 * Configuração das IAs: quais provedores estão ligados, com que modelos, e
 * quais são os padrões de texto e de imagem. A chave de cada um mora no
 * secretStore como `ia.<provedor>.apiKey` e nunca sai do main.
 */

const FILE_NAME = 'ia.json';
const SCHEMA_VERSION = 1;

interface ProvedorSalvo {
  baseUrl: string;
  modeloTexto: string;
  modeloImagem: string;
}

interface IaArquivo {
  schemaVersion: number;
  updatedAt: string;
  provedores: Record<ProvedorId, ProvedorSalvo>;
  texto?: ProvedorId;
  imagem?: ProvedorId;
  destino?: DestinoBiblioteca;
}

const ADAPTADORES: Record<ProvedorId, Adaptador> = {
  openrouter,
  openai: criarOpenAi('A OpenAI', 'https://api.openai.com/v1', 'max_completion_tokens'),
  anthropic,
  google,
  compativel: criarOpenAi('O servidor compatível', ''),
};

function chaveSecreta(id: ProvedorId): string {
  return `ia.${id}.apiKey`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function texto(valor: unknown, max = 300): string {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : '';
}

function provedorVazio(): ProvedorSalvo {
  return { baseUrl: '', modeloTexto: '', modeloImagem: '' };
}

function createDefaultFile(): IaArquivo {
  const provedores = Object.fromEntries(PROVEDORES.map((p) => [p.id, provedorVazio()])) as Record<ProvedorId, ProvedorSalvo>;
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), provedores };
}

/** Endereço http(s) sem barra final; qualquer outra coisa vira vazio. */
function baseUrlValida(valor: unknown): string {
  const t = texto(valor, 500).replace(/\/+$/, '');
  return /^https?:\/\/[^\s]+$/i.test(t) ? t : '';
}

function migrate(raw: unknown): IaArquivo {
  const c = (raw ?? {}) as Partial<IaArquivo>;
  const base = createDefaultFile();
  const salvos = (c.provedores ?? {}) as Partial<Record<ProvedorId, Partial<ProvedorSalvo>>>;
  PROVEDORES.forEach((p) => {
    const s = salvos[p.id] ?? {};
    base.provedores[p.id] = {
      baseUrl: p.exigeBaseUrl ? baseUrlValida(s.baseUrl) : '',
      modeloTexto: texto(s.modeloTexto),
      modeloImagem: texto(s.modeloImagem),
    };
  });
  const destino = c.destino && typeof c.destino.raizId === 'string' ? { raizId: c.destino.raizId, subpasta: subpastaValida(c.destino.subpasta) } : undefined;
  return {
    ...base,
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : base.updatedAt,
    texto: isProvedorId(c.texto) ? c.texto : undefined,
    imagem: isProvedorId(c.imagem) ? c.imagem : undefined,
    destino,
  };
}

/** Subpasta relativa segura: sem "..", sem caracteres proibidos no Windows. */
export function subpastaValida(valor: unknown): string {
  return texto(valor, 120)
    .split(/[\\/]+/)
    .map((s) => s.trim().replace(/[<>:"|?*\u0000-\u001f]/g, ''))
    .filter((s) => s && s !== '.' && s !== '..')
    .join('/');
}

function loadFile(): IaArquivo {
  return readStore(FILE_NAME, createDefaultFile, migrate);
}

async function saveFile(file: IaArquivo): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

function configurado(id: ProvedorId, salvo: ProvedorSalvo): boolean {
  return hasSecret(chaveSecreta(id)) || (id === 'compativel' && Boolean(salvo.baseUrl));
}

function montarConfig(file: IaArquivo): IaConfig {
  const provedores = PROVEDORES.map((p): ConfigProvedor => {
    const salvo = file.provedores[p.id];
    // Só o final da chave sai do main, para o usuário reconhecer qual está salva.
    const chave = getSecret(chaveSecreta(p.id));
    return {
      id: p.id,
      temChave: Boolean(chave),
      finalChave: chave && chave.length > 8 ? chave.slice(-4) : undefined,
      configurado: configurado(p.id, salvo),
      baseUrl: salvo.baseUrl,
      modeloTexto: salvo.modeloTexto,
      modeloImagem: salvo.modeloImagem,
    };
  });
  return {
    provedores,
    texto: file.texto,
    imagem: file.imagem,
    destino: file.destino,
    criptografiaDisponivel: isEncryptionAvailable(),
  };
}

// ---------- Config ----------

export async function getConfig(): Promise<IaConfig> {
  return montarConfig(loadFile());
}

export async function getFullFile(): Promise<IaArquivo> {
  return loadFile();
}

export async function replaceFile(file: unknown): Promise<IaArquivo> {
  const migrado = migrate(file);
  await saveFile(migrado);
  return migrado;
}

export async function salvarProvedor(input: SalvarProvedorInput): Promise<IaConfig> {
  if (!isProvedorId(input.id)) throw new Error('Provedor desconhecido.');
  const file = loadFile();
  const salvo = file.provedores[input.id];
  const descritor = descritorDe(input.id);

  if (input.baseUrl !== undefined && descritor.exigeBaseUrl) {
    const url = baseUrlValida(input.baseUrl);
    if (input.baseUrl.trim() && !url) throw new Error('Endereço inválido. Use algo como https://api.groq.com/openai/v1 ou http://localhost:11434/v1');
    salvo.baseUrl = url;
  }
  if (input.modeloTexto !== undefined) salvo.modeloTexto = texto(input.modeloTexto);
  if (input.modeloImagem !== undefined) salvo.modeloImagem = texto(input.modeloImagem);

  if (input.apiKey !== undefined) {
    if (input.apiKey.trim()) await setSecret(chaveSecreta(input.id), input.apiKey.trim());
    else await deleteSecretsByPrefix(`ia.${input.id}.`);
  }
  modelosEmCache.delete(input.id);

  // Primeiro provedor configurado vira o padrão sozinho — menos um passo.
  const cfg = descritor.capacidades;
  if (configurado(input.id, salvo)) {
    if (!file.texto && cfg.includes('texto')) file.texto = input.id;
    if (!file.imagem && cfg.includes('imagem')) file.imagem = input.id;
  } else {
    if (file.texto === input.id) file.texto = undefined;
    if (file.imagem === input.id) file.imagem = undefined;
  }

  await saveFile(file);
  return montarConfig(file);
}

export async function salvarPadroes(input: SalvarPadroesInput): Promise<IaConfig> {
  const file = loadFile();
  if (input.texto !== undefined) file.texto = isProvedorId(input.texto) ? input.texto : undefined;
  if (input.imagem !== undefined) file.imagem = isProvedorId(input.imagem) ? input.imagem : undefined;
  if (input.destino !== undefined) {
    file.destino =
      input.destino && typeof input.destino.raizId === 'string'
        ? { raizId: input.destino.raizId, subpasta: subpastaValida(input.destino.subpasta) || 'Iris IA' }
        : undefined;
  }
  await saveFile(file);
  return montarConfig(file);
}

// ---------- Uso pelos outros arquivos do módulo ----------

export interface ProvedorPronto {
  id: ProvedorId;
  rotulo: string;
  adaptador: Adaptador;
  ctx: ContextoProvedor;
  modelo: string;
}

function contexto(id: ProvedorId, file: IaArquivo): ContextoProvedor {
  const salvo = file.provedores[id];
  if (!configurado(id, salvo)) {
    throw new Error(`${descritorDe(id).rotulo} não está configurado. Coloque a chave em Ajustes › Inteligência artificial.`);
  }
  return { chave: getSecret(chaveSecreta(id)) ?? '', baseUrl: salvo.baseUrl };
}

/**
 * Qual provedor atende a um pedido: o pedido explícito, senão o padrão,
 * senão o primeiro configurado que tenha a capacidade.
 */
export function resolver(capacidade: Capacidade, pedido?: { provedor?: ProvedorId; modelo?: string }): ProvedorPronto {
  const file = loadFile();
  const padrao = capacidade === 'texto' || capacidade === 'visao' ? file.texto : file.imagem;
  const candidatos: ProvedorId[] = [
    ...(pedido?.provedor ? [pedido.provedor] : []),
    ...(padrao ? [padrao] : []),
    ...PROVEDORES.map((p) => p.id),
  ];
  const id = candidatos.find((c) => descritorDe(c).capacidades.includes(capacidade) && configurado(c, file.provedores[c]));
  if (!id) {
    const oque = capacidade === 'texto' || capacidade === 'visao' ? 'escrever textos' : capacidade === 'imagem' ? 'gerar imagens' : 'gerar imagens a partir de referências';
    throw new Error(`Nenhuma IA configurada para ${oque}. Configure em Ajustes › Inteligência artificial (o Tutorial mostra como).`);
  }
  if (pedido?.provedor && id !== pedido.provedor) {
    throw new Error(`${descritorDe(pedido.provedor).rotulo} não pode ${capacidade === 'imagemComReferencia' ? 'usar imagens de referência' : 'fazer isso'} ou não está configurado.`);
  }
  const descritor = descritorDe(id);
  const salvo = file.provedores[id];
  const ehTexto = capacidade === 'texto' || capacidade === 'visao';
  const modelo =
    (pedido?.provedor === id && pedido.modelo?.trim()) ||
    (ehTexto ? salvo.modeloTexto || descritor.modeloTextoSugerido : salvo.modeloImagem || descritor.modeloImagemSugerido) ||
    '';
  if (!modelo) throw new Error(`Escolha o modelo ${ehTexto ? 'de texto' : 'de imagem'} de ${descritor.rotulo} em Ajustes › Inteligência artificial.`);
  return { id, rotulo: descritor.rotulo, adaptador: ADAPTADORES[id], ctx: contexto(id, file), modelo };
}

export function destinoPadrao(): DestinoBiblioteca | undefined {
  return loadFile().destino;
}

// ---------- Modelos e teste ----------

/** Por sessão: a lista muda pouco e cada consulta custa uma ida ao provedor. */
const modelosEmCache = new Map<ProvedorId, ModeloIa[]>();

export async function listarModelos(id: ProvedorId, forcar = false): Promise<ModeloIa[]> {
  if (!isProvedorId(id)) throw new Error('Provedor desconhecido.');
  const emCache = modelosEmCache.get(id);
  if (emCache && !forcar) return emCache;
  const modelos = await ADAPTADORES[id].listarModelos(contexto(id, loadFile()));
  modelosEmCache.set(id, modelos);
  return modelos;
}

/**
 * Confere a chave, a lista e os modelos escolhidos: o de texto recebe um
 * pedido mínimo (custa uma fração de centavo); o de imagem só é conferido na
 * lista, porque gerar uma imagem de teste custaria de verdade. Assim o modelo
 * que não funciona aparece aqui, e não no meio do trabalho.
 */
export async function testarProvedor(id: ProvedorId): Promise<string> {
  const modelos = await listarModelos(id, true);
  const nImagem = modelos.filter((m) => m.geraImagem).length;
  const conectado = `Conectado — ${modelos.length} modelo${modelos.length === 1 ? '' : 's'} disponíve${modelos.length === 1 ? 'l' : 'is'}${nImagem ? `, ${nImagem} de imagem` : ''}`;

  const file = loadFile();
  const salvo = file.provedores[id];
  const descritor = descritorDe(id);
  const problemas: string[] = [];
  let detalhe = '';

  const modeloTexto = salvo.modeloTexto || descritor.modeloTextoSugerido || '';
  if (modeloTexto) {
    try {
      await ADAPTADORES[id].gerarTexto(contexto(id, file), {
        modelo: modeloTexto,
        sistema: 'Responda apenas com a palavra: ok',
        texto: 'Teste de conexão.',
        imagens: [],
        // Folga para modelos que raciocinam antes de responder.
        maxTokens: 2_048,
      });
    } catch (erro) {
      // O texto do provedor vai para o fim: a tela recolhe o que vem depois de " Detalhe: ".
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      const corte = mensagem.indexOf(' Detalhe: ');
      if (corte >= 0) detalhe = mensagem.slice(corte);
      problemas.push(`O modelo de texto "${modeloTexto}" falhou: ${corte >= 0 ? mensagem.slice(0, corte) : mensagem}`);
    }
  }

  const modeloImagem = descritor.capacidades.includes('imagem') ? salvo.modeloImagem || descritor.modeloImagemSugerido || '' : '';
  if (modeloImagem && modelos.length) {
    const m = modelos.find((x) => x.id === modeloImagem);
    if (!m) problemas.push(`O modelo de imagem "${modeloImagem}" não está na lista da sua chave — escolha outro em "Escolher"`);
    else if (!m.geraImagem) problemas.push(`"${modeloImagem}" não parece gerar imagem — escolha um marcado como "Gera imagem"`);
  }

  // Um problema por linha; a tela quebra linha no status longo.
  if (problemas.length) throw new Error(`${conectado}, mas:\n• ${problemas.join('\n• ')}${detalhe}`);
  return `${conectado}.${modeloTexto ? ` "${modeloTexto}" respondeu.` : ''}${modeloImagem ? ` "${modeloImagem}" está disponível (a cota de imagem só é conferida ao gerar).` : ''}`;
}
