import { randomUUID } from 'node:crypto';
import {
  INTERACOES_DO_APP,
  nomeDoContato,
  refIgual,
  type ContatosFile,
  type EditarInteracaoInput,
  type EmpresaCrm,
  type EtapaFunil,
  type MoverNoFunilInput,
  type Pessoa,
  type RefContato,
  type RegistrarInteracaoInput,
} from '../../../shared/types/contatos.types';
import {
  agoraLocal,
  dataHoraLocal,
  isRef,
  loadFile,
  migrate,
  migrateEmpresa,
  migrateInteracao,
  migratePessoa,
  nowIso,
  saveFile,
  textoLongo,
} from './contatos.arquivo';

/**
 * Pessoas, empresas, funil e histórico. Toda mutação lê o arquivo, valida pela
 * mesma `migrate` da leitura e devolve o arquivo inteiro — a tela substitui o
 * cache e redesenha.
 */

export async function getFile(): Promise<ContatosFile> {
  return loadFile();
}

export async function getFullFile(): Promise<ContatosFile> {
  return loadFile();
}

/** Backup e importação passam pela mesma leitura defensiva do disco. */
export async function replaceFile(file: unknown): Promise<ContatosFile> {
  const migrado = migrate(file);
  await saveFile(migrado);
  return migrado;
}

function contatoDe(file: ContatosFile, ref: RefContato): Pessoa | EmpresaCrm {
  const c = ref.tipo === 'pessoa' ? file.pessoas.find((p) => p.id === ref.id) : file.empresas.find((e) => e.id === ref.id);
  if (!c) throw new Error('Contato não encontrado — ele pode ter sido excluído.');
  return c;
}

/** Linha automática no histórico: o que mudou sozinho também é parte da história do contato. */
export function registrarEvento(file: ContatosFile, ref: RefContato, texto: string): void {
  file.interacoes.push({ id: randomUUID(), contato: { ...ref }, tipo: 'evento', data: agoraLocal(), texto, criadoEm: nowIso() });
}

export function nomeDaEtapa(file: ContatosFile, id: string): string {
  return file.etapas.find((e) => e.id === id)?.nome ?? 'sem etapa';
}

/** Próxima posição no fim da coluna do funil. */
export function fimDaEtapa(file: ContatosFile, etapaId: string): number {
  const todos = [...file.pessoas, ...file.empresas].filter((c) => c.etapaId === etapaId);
  return todos.reduce((m, c) => Math.max(m, c.ordem), -1) + 1;
}

/**
 * Cria (sem id, ou id desconhecido) ou atualiza uma pessoa. O que vem da tela é
 * mesclado sobre o salvo e passa pela migrate: campo ausente mantém o valor,
 * `proximoContato: null` limpa.
 */
export async function salvarPessoa(raw: unknown): Promise<ContatosFile> {
  const file = loadFile();
  const entrada = (raw ?? {}) as Partial<Pessoa>;
  const etapas = new Set(file.etapas.map((e) => e.id));
  const primeira = file.etapas[0]!.id;
  const existente = typeof entrada.id === 'string' ? file.pessoas.find((p) => p.id === entrada.id) : undefined;

  if (existente) {
    // `entrada` (a chegada pelo formulário) nunca vem da tela: o rascunho da ficha
    // pode ter um `visto` velho e desfaria o que a caixa de leads marcou.
    const pessoa = migratePessoa(
      { ...existente, ...entrada, id: existente.id, createdAt: existente.createdAt, updatedAt: nowIso(), entrada: existente.entrada },
      etapas,
      primeira,
      file.leadsConfig.regras,
    );
    if (!pessoa) throw new Error('A pessoa precisa de um nome.');
    if (pessoa.empresaId && !file.empresas.some((e) => e.id === pessoa.empresaId)) delete pessoa.empresaId;
    if (pessoa.etapaId !== existente.etapaId) {
      pessoa.ordem = fimDaEtapa(file, pessoa.etapaId);
      registrarEvento(file, { tipo: 'pessoa', id: pessoa.id }, `Etapa: ${nomeDaEtapa(file, existente.etapaId)} → ${nomeDaEtapa(file, pessoa.etapaId)}`);
    }
    file.pessoas[file.pessoas.indexOf(existente)] = pessoa;
  } else {
    const etapaId = typeof entrada.etapaId === 'string' && etapas.has(entrada.etapaId) ? entrada.etapaId : primeira;
    const pessoa = migratePessoa({ ...entrada, entrada: undefined, id: randomUUID(), etapaId, ordem: fimDaEtapa(file, etapaId), createdAt: nowIso(), updatedAt: nowIso() }, etapas, primeira);
    if (!pessoa) throw new Error('A pessoa precisa de um nome.');
    if (pessoa.empresaId && !file.empresas.some((e) => e.id === pessoa.empresaId)) delete pessoa.empresaId;
    file.pessoas.push(pessoa);
  }
  await saveFile(file);
  return file;
}

export async function salvarEmpresa(raw: unknown): Promise<ContatosFile> {
  const file = loadFile();
  const entrada = (raw ?? {}) as Partial<EmpresaCrm>;
  const etapas = new Set(file.etapas.map((e) => e.id));
  const primeira = file.etapas[0]!.id;
  const existente = typeof entrada.id === 'string' ? file.empresas.find((e) => e.id === entrada.id) : undefined;

  if (existente) {
    const empresa = migrateEmpresa({ ...existente, ...entrada, id: existente.id, createdAt: existente.createdAt, updatedAt: nowIso() }, etapas, primeira);
    if (!empresa) throw new Error('A empresa precisa de uma razão social ou de um nome fantasia.');
    if (empresa.etapaId !== existente.etapaId) {
      empresa.ordem = fimDaEtapa(file, empresa.etapaId);
      registrarEvento(file, { tipo: 'empresa', id: empresa.id }, `Etapa: ${nomeDaEtapa(file, existente.etapaId)} → ${nomeDaEtapa(file, empresa.etapaId)}`);
    }
    file.empresas[file.empresas.indexOf(existente)] = empresa;
  } else {
    const etapaId = typeof entrada.etapaId === 'string' && etapas.has(entrada.etapaId) ? entrada.etapaId : primeira;
    const empresa = migrateEmpresa({ ...entrada, id: randomUUID(), etapaId, ordem: fimDaEtapa(file, etapaId), createdAt: nowIso(), updatedAt: nowIso() }, etapas, primeira);
    if (!empresa) throw new Error('A empresa precisa de uma razão social ou de um nome fantasia.');
    file.empresas.push(empresa);
  }
  await saveFile(file);
  return file;
}

/**
 * Some com o contato e o histórico dele. Contratos ficam (guardam o nome por
 * extenso); pessoas de uma empresa excluída só perdem o vínculo.
 */
export async function excluirContato(ref: unknown): Promise<ContatosFile> {
  if (!isRef(ref)) throw new Error('Contato inválido.');
  const file = loadFile();
  contatoDe(file, ref);
  if (ref.tipo === 'pessoa') file.pessoas = file.pessoas.filter((p) => p.id !== ref.id);
  else {
    file.empresas = file.empresas.filter((e) => e.id !== ref.id);
    file.pessoas.forEach((p) => {
      if (p.empresaId === ref.id) delete p.empresaId;
    });
  }
  file.interacoes = file.interacoes.filter((i) => !refIgual(i.contato, ref));
  await saveFile(file);
  return file;
}

export async function arquivarContato(ref: unknown, arquivado: unknown): Promise<ContatosFile> {
  if (!isRef(ref)) throw new Error('Contato inválido.');
  const file = loadFile();
  const c = contatoDe(file, ref);
  c.arquivado = arquivado === true;
  c.updatedAt = nowIso();
  registrarEvento(file, ref, c.arquivado ? 'Arquivado' : 'Saiu do arquivo');
  await saveFile(file);
  return file;
}

/** Arrastar no funil: muda a etapa (com evento no histórico) e renumera a coluna de destino. */
export async function moverNoFunil(input: MoverNoFunilInput): Promise<ContatosFile> {
  const file = loadFile();
  if (!isRef(input?.contato)) throw new Error('Contato inválido.');
  const etapa = file.etapas.find((e) => e.id === input.etapaId);
  if (!etapa) throw new Error('Essa etapa não existe mais.');
  const c = contatoDe(file, input.contato);
  if (c.etapaId !== etapa.id) {
    registrarEvento(file, input.contato, `Etapa: ${nomeDaEtapa(file, c.etapaId)} → ${etapa.nome}`);
    c.etapaId = etapa.id;
    c.updatedAt = nowIso();
  }
  const ordem = Array.isArray(input.ordem) ? input.ordem.filter(isRef) : [];
  ordem.forEach((ref, i) => {
    const alvo = ref.tipo === 'pessoa' ? file.pessoas.find((p) => p.id === ref.id) : file.empresas.find((e) => e.id === ref.id);
    if (alvo && alvo.etapaId === etapa.id) alvo.ordem = i;
  });
  await saveFile(file);
  return file;
}

/**
 * Troca a lista de etapas inteira (criar, renomear, recolorir, reordenar,
 * excluir). Quem estava numa etapa excluída vai para a primeira.
 */
export async function salvarEtapas(lista: unknown): Promise<ContatosFile> {
  const file = loadFile();
  const novas = migrate({ ...file, etapas: lista }).etapas;
  if (!Array.isArray(lista) || !lista.length) throw new Error('O funil precisa de pelo menos uma etapa.');
  const nomes = new Set<string>();
  novas.forEach((e: EtapaFunil) => {
    const n = e.nome.toLowerCase();
    if (nomes.has(n)) throw new Error(`Há duas etapas chamadas "${e.nome}".`);
    nomes.add(n);
  });
  const ids = new Set(novas.map((e) => e.id));
  const primeira = novas[0]!.id;
  [...file.pessoas, ...file.empresas].forEach((c) => {
    if (!ids.has(c.etapaId)) c.etapaId = primeira;
  });
  file.etapas = novas;
  await saveFile(file);
  return file;
}

// ---------- Histórico ----------

export async function registrarInteracao(input: RegistrarInteracaoInput): Promise<ContatosFile> {
  const file = loadFile();
  if (!isRef(input?.contato)) throw new Error('Contato inválido.');
  const c = contatoDe(file, input.contato);
  if (INTERACOES_DO_APP.has(input.tipo)) throw new Error('Esse tipo é escrito pelo app.');
  const nova = migrateInteracao({ ...input, id: randomUUID(), data: dataHoraLocal(input.data) ?? agoraLocal(), criadoEm: nowIso() });
  if (!nova) throw new Error('Escreva o que aconteceu.');
  file.interacoes.push(nova);
  c.updatedAt = nowIso();
  await saveFile(file);
  return file;
}

export async function editarInteracao(input: EditarInteracaoInput): Promise<ContatosFile> {
  const file = loadFile();
  const atual = file.interacoes.find((i) => i.id === input?.id);
  if (!atual) throw new Error('Esse registro não existe mais.');
  if (INTERACOES_DO_APP.has(atual.tipo)) throw new Error('Registros automáticos não se editam.');
  const nova = migrateInteracao({
    ...atual,
    ...(input.tipo && !INTERACOES_DO_APP.has(input.tipo) ? { tipo: input.tipo } : {}),
    ...(input.data ? { data: input.data } : {}),
    ...(input.texto !== undefined ? { texto: textoLongo(input.texto, 20_000) } : {}),
  });
  if (!nova) throw new Error('O registro não pode ficar vazio.');
  file.interacoes[file.interacoes.indexOf(atual)] = nova;
  await saveFile(file);
  return file;
}

export async function excluirInteracao(id: unknown): Promise<ContatosFile> {
  const file = loadFile();
  const antes = file.interacoes.length;
  file.interacoes = file.interacoes.filter((i) => i.id !== id);
  if (file.interacoes.length === antes) throw new Error('Esse registro não existe mais.');
  await saveFile(file);
  return file;
}

/** Nome por extenso de um contato, para cópias (contratos) e mensagens. */
export function nomeDe(file: ContatosFile, ref: RefContato): string {
  return nomeDoContato(contatoDe(file, ref));
}

export { contatoDe };
