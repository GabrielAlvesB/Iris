import { randomUUID } from 'node:crypto';
import {
  SITUACOES_CONTRATO,
  type AtualizarContratoInput,
  type ContatosFile,
  type Contrato,
  type CriarContratoInput,
  type SalvarModeloInput,
} from '../../../shared/types/contatos.types';
import { isRef, loadFile, migrateContrato, migrateModelo, nowIso, saveFile, texto, textoLongo } from './contatos.arquivo';
import { contatoDe, nomeDe, registrarEvento } from './contatos.service';

/**
 * Modelos de contrato e contratos gerados. O contrato guarda a cópia do texto
 * final (preenchido na tela com contratos.campos.ts): mudar o modelo depois não
 * mexe em contrato nenhum.
 */

export async function salvarModelo(input: SalvarModeloInput): Promise<ContatosFile> {
  const file = loadFile();
  const nome = texto(input?.nome, 120);
  if (!nome) throw new Error('Dê um nome ao modelo.');
  const duplicado = file.modelos.find((m) => m.nome.toLowerCase() === nome.toLowerCase() && m.id !== input.id);
  if (duplicado) throw new Error(`Já existe o modelo "${duplicado.nome}".`);
  const existente = input.id ? file.modelos.find((m) => m.id === input.id) : undefined;
  if (input.id && !existente) throw new Error('Esse modelo não existe mais.');
  const modelo = migrateModelo({
    id: existente?.id ?? randomUUID(),
    nome,
    quandoUsar: input.quandoUsar ?? existente?.quandoUsar ?? '',
    corpo: input.corpo,
    criadoEm: existente?.criadoEm ?? nowIso(),
    atualizadoEm: nowIso(),
  });
  if (!modelo) throw new Error('Modelo inválido.');
  if (existente) file.modelos[file.modelos.indexOf(existente)] = modelo;
  else file.modelos.push(modelo);
  await saveFile(file);
  return file;
}

export async function duplicarModelo(id: unknown): Promise<ContatosFile> {
  const file = loadFile();
  const original = file.modelos.find((m) => m.id === id);
  if (!original) throw new Error('Esse modelo não existe mais.');
  const nomes = new Set(file.modelos.map((m) => m.nome.toLowerCase()));
  let n = 1;
  let nome = `${original.nome} (cópia)`;
  while (nomes.has(nome.toLowerCase())) nome = `${original.nome} (cópia ${++n})`;
  file.modelos.push({ ...original, id: randomUUID(), nome, criadoEm: nowIso(), atualizadoEm: nowIso() });
  await saveFile(file);
  return file;
}

/** Os contratos já gerados continuam: eles têm o texto e o nome do modelo por extenso. */
export async function excluirModelo(id: unknown): Promise<ContatosFile> {
  const file = loadFile();
  const antes = file.modelos.length;
  file.modelos = file.modelos.filter((m) => m.id !== id);
  if (file.modelos.length === antes) throw new Error('Esse modelo não existe mais.');
  await saveFile(file);
  return file;
}

export async function criarContrato(input: CriarContratoInput): Promise<ContatosFile> {
  const file = loadFile();
  if (!isRef(input?.contato)) throw new Error('Escolha o contato do contrato.');
  contatoDe(file, input.contato);
  const corpo = textoLongo(input.corpo);
  if (!corpo) throw new Error('O contrato está vazio.');
  const modelo = input.modeloId ? file.modelos.find((m) => m.id === input.modeloId) : undefined;
  const agora = nowIso();
  const contrato = migrateContrato({
    id: randomUUID(),
    contato: input.contato,
    contatoNome: nomeDe(file, input.contato),
    ...(modelo ? { modeloId: modelo.id } : {}),
    modeloNome: modelo?.nome ?? '',
    titulo: texto(input.titulo, 160) || modelo?.nome || 'Contrato',
    corpo,
    campos: input.campos,
    situacao: 'rascunho',
    historico: [{ situacao: 'rascunho', em: agora }],
    criadoEm: agora,
    atualizadoEm: agora,
  });
  if (!contrato) throw new Error('Contrato inválido.');
  file.contratos.push(contrato);
  registrarEvento(file, input.contato, `Contrato criado: ${contrato.titulo}`);
  await saveFile(file);
  return file;
}

function acharContrato(file: ContatosFile, id: unknown): Contrato {
  const c = file.contratos.find((x) => x.id === id);
  if (!c) throw new Error('Esse contrato não existe mais.');
  return c;
}

/**
 * Título e texto só mudam enquanto o contrato é rascunho: depois de enviado,
 * o documento que a outra parte recebeu não pode mudar por baixo.
 */
export async function atualizarContrato(input: AtualizarContratoInput): Promise<ContatosFile> {
  const file = loadFile();
  const c = acharContrato(file, input?.id);
  const mudaTexto = input.titulo !== undefined || input.corpo !== undefined;
  if (mudaTexto && c.situacao !== 'rascunho') throw new Error('Só um rascunho pode ter o texto alterado. Para mudar um contrato enviado, duplique-o.');
  if (input.titulo !== undefined) c.titulo = texto(input.titulo, 160) || c.titulo;
  if (input.corpo !== undefined) {
    const corpo = textoLongo(input.corpo);
    if (!corpo) throw new Error('O contrato não pode ficar vazio.');
    c.corpo = corpo;
  }
  if (input.situacao !== undefined && input.situacao !== c.situacao) {
    const situacao = SITUACOES_CONTRATO.find((s) => s.id === input.situacao);
    if (!situacao) throw new Error('Situação inválida.');
    c.situacao = situacao.id;
    c.historico.push({ situacao: situacao.id, em: nowIso() });
    // O evento vai para o histórico do contato, se ele ainda existe.
    const existe = c.contato.tipo === 'pessoa' ? file.pessoas.some((p) => p.id === c.contato.id) : file.empresas.some((e) => e.id === c.contato.id);
    if (existe) registrarEvento(file, c.contato, `Contrato "${c.titulo}": ${situacao.rotulo.toLowerCase()}`);
  }
  c.atualizadoEm = nowIso();
  await saveFile(file);
  return file;
}

/** Cópia em rascunho — o caminho para "mudar" um contrato que já foi enviado. */
export async function duplicarContrato(id: unknown): Promise<ContatosFile> {
  const file = loadFile();
  const original = acharContrato(file, id);
  if (!isRef(original.contato)) throw new Error('Contrato inválido.');
  const agora = nowIso();
  file.contratos.push({
    ...structuredClone(original),
    id: randomUUID(),
    titulo: `${original.titulo} (cópia)`.slice(0, 160),
    situacao: 'rascunho',
    historico: [{ situacao: 'rascunho', em: agora }],
    criadoEm: agora,
    atualizadoEm: agora,
  });
  await saveFile(file);
  return file;
}

export async function excluirContrato(id: unknown): Promise<ContatosFile> {
  const file = loadFile();
  acharContrato(file, id);
  file.contratos = file.contratos.filter((c) => c.id !== id);
  await saveFile(file);
  return file;
}
