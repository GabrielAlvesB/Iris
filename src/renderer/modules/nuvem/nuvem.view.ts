import { DIALETOS, FORA_DA_NUVEM, MAX_NOME_DISPOSITIVO, type DialetoSql, type EstadoNuvem, type ExtracaoGerada } from '../../../shared/types/nuvem.types.js';
import { sqlDoEsquema } from '../../../shared/types/nuvem.sql.js';
import { ICONE_DO_MODULO } from '../../core/sidebar.js';
import { campo, input } from '../../ui/campos.js';
import { mensagemDeErro, openAvisoModal } from '../../ui/modal.js';
import { buildBotao, buildCabecalho, buildSegmentado, buildSelo, ICONES, svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { cartao, codigo } from '../api-leads/api-leads.pecas.js';
import { el } from '../contatos/contatos.ui.js';
import { createPushBinding } from '../../core/pushBinding.js';
import { buildConexao, buildSituacao, esquecerTeste, type CtxNuvem } from './nuvem.conexao.js';
import * as state from './nuvem.state.js';

/**
 * Nuvem — os dados do Iris num banco de dados, para dois computadores verem o
 * mesmo. Um índice à esquerda e uma seção por vez (o layout `la-` de API e n8n).
 *
 * A tela não conhece caminho de arquivo nem credencial: pede ao main.
 */

type Secao = 'computador' | 'conexao' | 'sincroniza' | 'extracao';

const ICONE_PC = '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M12 16v4"/>';
const ICONE_LISTA = '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="m3 6 1 1 2-2"/><path d="m3 12 1 1 2-2"/><path d="m3 18 1 1 2-2"/>';
const ICONE_BANCO = '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>';

const SECOES: ReadonlyArray<{ id: Secao; rotulo: string; icone: string; titulo: string; explica: string }> = [
  {
    id: 'computador',
    rotulo: 'Visão geral',
    icone: ICONE_PC,
    titulo: 'Visão geral',
    explica: 'O Iris continua funcionando sem internet. A nuvem guarda uma cópia de cada item, e cada computador envia o que mudou e busca o que os outros mudaram.',
  },
  {
    id: 'conexao',
    rotulo: 'Conexão',
    icone: ICONE_BANCO,
    titulo: 'Conexão com o banco',
    explica: 'O banco é seu: um projeto no Supabase, na sua conta. O Iris fala direto com ele, sem servidor no meio.',
  },
  {
    id: 'sincroniza',
    rotulo: 'O que vai para a nuvem',
    icone: ICONE_LISTA,
    titulo: 'O que vai para a nuvem',
    explica: 'Cada card, contato, postagem ou roteiro é um registro no banco. Aqui está o que este computador tem para enviar — e o que fica só nele.',
  },
  {
    id: 'extracao',
    rotulo: 'Arquivo para o banco',
    icone: ICONE_BANCO,
    titulo: 'Arquivo para o banco de dados',
    explica: 'Um arquivo .sql que cria as tabelas e insere todos os seus dados. Carregue no banco que quiser, sem precisar conectar o Iris a ele.',
  },
];

let container: HTMLElement | null = null;
let secao: Secao = 'computador';
let dialeto: DialetoSql = 'postgres';
let gerando = false;
let ultima: ExtracaoGerada | null = null;

// Uma rodada começou ou terminou (aqui ou pela tarefa de fundo): a situação é relida.
const push = createPushBinding([() => window.irisAPI.events.on('nuvem:mudou', () => void state.carregar().catch(() => undefined))]);

export function montar(viewRoot: HTMLElement): void {
  container = viewRoot;
  esquecerTeste();
  push.attach();
  state.onStateChange(() => desenhar());
  const atual = state.getEstado();
  if (atual) desenhar();
  // Relê a cada entrada: as contagens mudam com o uso do resto do app.
  void state.carregar().catch(falhou);
}

export function destroy(): void {
  push.detach();
  state.offStateChange();
  container = null;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

function desenhar(trocouDeSecao = false): void {
  const e = state.getEstado();
  if (!container || !e) return;
  const rolagem = container.querySelector<HTMLElement>('.la-conteudo');
  const topo = trocouDeSecao ? 0 : (rolagem?.scrollTop ?? 0);
  container.replaceChildren(buildTela(e));
  const nova = container.querySelector<HTMLElement>('.la-conteudo');
  if (nova) nova.scrollTop = topo;
}

function buildTela(e: EstadoNuvem): HTMLElement {
  const view = el('div', 'pg-view la-view');
  view.appendChild(
    buildCabecalho({
      icone: ICONE_DO_MODULO.nuvem,
      titulo: 'Nuvem',
      subtitulo: 'Seus dados num banco de dados, iguais em todos os computadores',
    }),
  );
  const grade = el('div', 'la-grade');
  const indice = el('nav', 'la-indice');
  indice.setAttribute('aria-label', 'Seções da Nuvem');
  SECOES.forEach((s) => {
    const b = el('button', `la-indice-item${s.id === secao ? ' is-ativo' : ''}`);
    b.type = 'button';
    if (s.id === secao) b.setAttribute('aria-current', 'page');
    b.innerHTML = svg(s.icone, 16);
    b.appendChild(el('span', 'la-indice-rotulo', s.rotulo));
    if (s.id === 'conexao') {
      // Bolinha + texto na dica e no nome acessível: a situação não fica só na cor.
      const [tom, dica] = e.conectado ? (e.ultimoErro ? ['erro', 'A última sincronização falhou'] : ['ok', 'Conectado']) : ['neutro', 'Não conectado'];
      const ponto = el('span', `la-indice-ponto is-${tom}`);
      ponto.title = dica;
      b.appendChild(ponto);
      b.setAttribute('aria-label', `${s.rotulo} — ${dica}`);
    }
    b.addEventListener('click', () => {
      secao = s.id;
      desenhar(true);
    });
    indice.appendChild(b);
  });
  grade.appendChild(indice);

  const atual = SECOES.find((s) => s.id === secao) ?? SECOES[0]!;
  const conteudo = el('main', 'la-conteudo');
  const cab = el('header', 'la-secao-cab');
  cab.append(el('h2', undefined, atual.titulo), el('p', undefined, atual.explica));
  conteudo.appendChild(cab);
  const corpo = el('div', 'la-secao');
  const c: CtxNuvem = {
    estado: e,
    redesenhar: () => desenhar(),
    falhou,
    irPara: (nova) => {
      secao = nova;
      desenhar(true);
    },
  };
  const partes =
    secao === 'computador'
      ? [buildSituacao(c), ...buildComputador(e)]
      : secao === 'conexao'
        ? buildConexao(c)
        : secao === 'sincroniza'
          ? buildSincroniza(e)
          : buildExtracao(e);
  partes.forEach((p) => corpo.appendChild(p));
  conteudo.appendChild(corpo);
  grade.appendChild(conteudo);
  view.appendChild(grade);
  return view;
}

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

// ---------- Este computador ----------

function buildComputador(e: EstadoNuvem): HTMLElement[] {
  const id = cartao('identidade', ICONE_PC, 'Como este computador aparece', 'Cada mudança enviada leva o nome de onde veio.');
  const nome = input('text', e.dispositivo.nome, 'Ex.: Notebook, PC do escritório');
  nome.maxLength = MAX_NOME_DISPOSITIVO;
  const espaco = input('text', e.espaco, 'principal');
  espaco.maxLength = 40;
  espaco.spellcheck = false;
  const salvar = buildBotao('Salvar', { variante: 'primario' });
  salvar.disabled = true;
  const mudou = (): void => {
    salvar.disabled = nome.value.trim() === e.dispositivo.nome && espaco.value.trim().toLowerCase() === e.espaco;
  };
  nome.addEventListener('input', mudou);
  espaco.addEventListener('input', mudou);
  salvar.addEventListener('click', () => {
    salvar.disabled = true;
    void state
      .salvarIdentidade({ nome: nome.value, espaco: espaco.value })
      .then(() => mostrarToast('Salvo.', [], 2000))
      .catch((erro: unknown) => {
        falhou(erro);
        mudou();
      });
  });
  id.corpo.append(
    campo('Nome deste computador', nome),
    campo(
      'Espaço',
      espaco,
      'O conjunto de dados compartilhado. Computadores com o mesmo espaço, no mesmo banco, veem os mesmos dados. Um banco pode ter vários espaços que não se misturam.',
    ),
    salvar,
  );

  const como = cartao('como', ICONES.atualizar, 'Como a sincronização funciona', 'Sem servidor do Iris no meio: o banco é seu.');
  const passos = el('ol', 'la-passos');
  const passo = (titulo: string, texto: string): void => {
    const li = el('li');
    li.append(el('strong', undefined, titulo), el('p', undefined, texto));
    passos.appendChild(li);
  };
  passo('Cada item é um registro', 'Um card, uma pessoa, um roteiro: cada um vira uma linha no banco. Editar um card não reenvia o quadro inteiro.');
  passo('Só o que mudou viaja', 'O Iris guarda o que já foi sincronizado e compara: o que é novo, o que mudou e o que foi excluído.');
  passo(
    'Mesmo item mudado em dois lugares',
    'Vale a edição mais recente, e a outra fica guardada no Histórico. Itens diferentes (dois cards, dois contatos) nunca brigam.',
  );
  como.corpo.appendChild(passos);
  return [id.cartao, como.cartao];
}

// ---------- O que vai para a nuvem ----------

function buildSincroniza(e: EstadoNuvem): HTMLElement[] {
  // Vídeos e imagens são dois arquivos do mesmo "Postagens": uma linha só para o usuário.
  const porRotulo = new Map<string, { itens: number; bytes: number; notas: Set<string> }>();
  const locais: Array<{ titulo: string; texto: string }> = [];
  for (const a of e.arquivos) {
    if (!a.sincroniza) {
      locais.push({ titulo: a.rotulo, texto: a.porque });
      continue;
    }
    const linha = porRotulo.get(a.rotulo) ?? { itens: 0, bytes: 0, notas: new Set<string>() };
    linha.itens += a.itens;
    linha.bytes += a.bytes;
    if (a.porque) linha.notas.add(a.porque);
    porRotulo.set(a.rotulo, linha);
  }
  const total = [...porRotulo.values()].reduce((n, l) => ({ itens: n.itens + l.itens, bytes: n.bytes + l.bytes }), { itens: 0, bytes: 0 });

  const vai = cartao('vai', ICONE_DO_MODULO.nuvem, 'Sincroniza', `${plural(total.itens, 'item', 'itens')} neste computador, ${tamanho(total.bytes)} com as preferências de cada módulo.`);
  const lista = el('ul', 'nv-lista');
  for (const [rotulo, l] of porRotulo) {
    const li = el('li', 'nv-linha');
    const textos = el('div', 'nv-linha-textos');
    textos.appendChild(el('strong', undefined, rotulo));
    l.notas.forEach((n) => textos.appendChild(el('span', undefined, n)));
    li.append(textos, el('span', 'nv-linha-conta', l.itens ? `${plural(l.itens, 'item', 'itens')} · ${tamanho(l.bytes)}` : 'só as preferências'));
    lista.appendChild(li);
  }
  vai.corpo.appendChild(lista);

  const fica = cartao('fica', ICONE_PC, 'Fica só em cada computador', 'Não por limite técnico: são coisas da máquina, ou que não cabem num banco.');
  const listaFica = el('ul', 'nv-lista');
  [...locais, ...FORA_DA_NUVEM].forEach((f) => {
    const li = el('li', 'nv-linha');
    const textos = el('div', 'nv-linha-textos');
    textos.append(el('strong', undefined, f.titulo), el('span', undefined, f.texto));
    li.appendChild(textos);
    listaFica.appendChild(li);
  });
  fica.corpo.appendChild(listaFica);
  return [vai.cartao, fica.cartao];
}

// ---------- Arquivo para o banco ----------

function buildExtracao(e: EstadoNuvem): HTMLElement[] {
  const total = e.arquivos.filter((a) => a.sincroniza).reduce((n, a) => n + a.registros, 0);
  const info = DIALETOS.find((d) => d.id === dialeto) ?? DIALETOS[0]!;

  const gerar = cartao('gerar', ICONE_BANCO, 'Gerar o arquivo', `${plural(total, 'registro', 'registros')} do espaço "${e.espaco}".`);
  gerar.corpo.appendChild(
    buildSegmentado(
      DIALETOS.map((d) => ({ value: d.id, label: d.rotulo })),
      dialeto,
      (valor) => {
        dialeto = valor;
        ultima = null;
        desenhar();
      },
    ),
  );
  gerar.corpo.appendChild(el('p', 'nv-texto', `Serve para: ${info.serve}`));
  gerar.corpo.appendChild(
    el(
      'p',
      'nv-texto',
      'O arquivo tem os seus dados (contatos, textos, tudo que sincroniza): guarde-o com o mesmo cuidado que um backup. Senhas, tokens e chaves não vão nele.',
    ),
  );
  const botao = buildBotao(gerando ? 'Gerando…' : 'Gerar arquivo…', { variante: 'primario', icone: ICONES.backup });
  botao.disabled = gerando;
  botao.addEventListener('click', () => {
    gerando = true;
    desenhar();
    void state
      .gerarExtracao(dialeto)
      .then((r) => {
        if (r) ultima = r;
      })
      .catch(falhou)
      .finally(() => {
        gerando = false;
        desenhar();
      });
  });
  gerar.corpo.appendChild(botao);
  if (ultima) {
    const feito = el('div', 'nv-feito');
    feito.setAttribute('role', 'status');
    feito.appendChild(buildSelo('Arquivo gerado', 'ok'));
    feito.appendChild(el('span', 'nv-feito-texto', `${ultima.arquivo} · ${plural(ultima.registros, 'registro', 'registros')} · ${tamanho(ultima.bytes)}`));
    const mostrar = buildBotao('Mostrar na pasta', { variante: 'secundario', icone: ICONES.pasta });
    mostrar.addEventListener('click', () => void state.mostrarExtracao().catch(falhou));
    feito.appendChild(mostrar);
    gerar.corpo.appendChild(feito);
  }

  const carregar = cartao('carregar', ICONE_LISTA, 'Como carregar no banco', 'Carregar duas vezes não duplica: o registro que já existe é atualizado.');
  const passos = el('ol', 'la-passos');
  const passo = (titulo: string, texto: string): void => {
    const li = el('li');
    li.append(el('strong', undefined, titulo), el('p', undefined, texto));
    passos.appendChild(li);
  };
  if (dialeto === 'postgres') {
    passo('Supabase', 'No painel do projeto: SQL Editor › New query. Cole o conteúdo do arquivo e clique em Run. Arquivo grande demais para colar: use o psql.');
    passo('Qualquer Postgres (psql)', 'No terminal: psql "endereço-de-conexão" -f arquivo.sql');
  } else {
    passo('Cloudflare D1', 'No terminal, com o wrangler: wrangler d1 execute nome-do-banco --remote --file arquivo.sql');
    passo('Arquivo SQLite', 'No terminal: sqlite3 banco.db < arquivo.sql');
  }
  carregar.corpo.appendChild(passos);

  const tabelas = cartao('tabelas', ICONE_BANCO, 'Só as tabelas', 'O mesmo começo do arquivo, sem os dados — para criar o banco vazio.');
  const detalhes = el('details', 'la-worker');
  detalhes.appendChild(el('summary', undefined, `Ver o SQL das tabelas (${info.rotulo})`));
  detalhes.appendChild(codigo(sqlDoEsquema(dialeto), 'Copiar SQL', 'SQL das tabelas copiado.'));
  tabelas.corpo.appendChild(detalhes);
  return [gerar.cartao, carregar.cartao, tabelas.cartao];
}
