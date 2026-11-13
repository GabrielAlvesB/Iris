import type { EstadoNuvem, ModoDeEntrada, ResultadoSync, TesteNuvem } from '../../../shared/types/nuvem.types.js';
import { sqlDoEsquema } from '../../../shared/types/nuvem.sql.js';
import { ICONE_DO_MODULO } from '../../core/sidebar.js';
import { campo, input, interruptor } from '../../ui/campos.js';
import { openConfirmModal } from '../../ui/modal.js';
import { buildAviso, buildBotao, buildSelo, ICONES, tempoRelativo } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { cartao, codigo } from '../api-leads/api-leads.pecas.js';
import { el } from '../contatos/contatos.ui.js';
import * as state from './nuvem.state.js';

/**
 * A conexão com o banco e a situação da sincronização. Três passos, na ordem em
 * que acontecem: o projeto (endereço e chave), as tabelas, e como este
 * computador entra no espaço — a única hora em que dá para perder algo, e por
 * isso a única que pede uma escolha.
 */

export interface CtxNuvem {
  estado: EstadoNuvem;
  redesenhar: () => void;
  falhou: (erro: unknown) => void;
  irPara: (secao: 'conexao') => void;
}

const ICONE_CHAVE = '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2"/><path d="m16 7 3 3"/>';
const ICONE_TABELA = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v16"/>';
const ICONE_ENTRAR = '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>';

/** O que o último "Testar" disse. Fica fora do DOM: sobrevive ao redesenho. */
let teste: TesteNuvem | null = null;
let ocupado = '';

export function esquecerTeste(): void {
  teste = null;
  ocupado = '';
}

function fazer(c: CtxNuvem, nome: string, acao: () => Promise<void>): void {
  if (ocupado) return;
  ocupado = nome;
  c.redesenhar();
  void acao()
    .catch(c.falhou)
    .finally(() => {
      ocupado = '';
      c.redesenhar();
    });
}

function resumoDaRodada(r: ResultadoSync): string {
  const partes: string[] = [];
  if (r.enviados) partes.push(`${r.enviados.toLocaleString('pt-BR')} enviados`);
  if (r.recebidos) partes.push(`${r.recebidos.toLocaleString('pt-BR')} recebidos`);
  if (r.conflitos) partes.push(`${r.conflitos} ${r.conflitos === 1 ? 'conflito' : 'conflitos'}`);
  return partes.length ? `Sincronizado: ${partes.join(', ')}.` : 'Tudo em dia: nada para enviar nem receber.';
}

/**
 * Chegou dado de outro computador: o tema, os selos do trilho e o que já está em
 * memória podem estar velhos. A mesma saída da importação de backup: recarregar a janela.
 */
function recarregarSeRecebeu(r: ResultadoSync): void {
  mostrarToast(resumoDaRodada(r), [], 3500);
  if (r.recebidos) setTimeout(() => location.reload(), 1200);
}

// ---------- A situação (Visão geral) ----------

export function buildSituacao(c: CtxNuvem): HTMLElement {
  const e = c.estado;
  if (!e.conectado) {
    const s = cartao('situacao', ICONE_DO_MODULO.nuvem, 'Este computador ainda não sincroniza', 'Os dados estão só aqui, como sempre estiveram.');
    const conectar = buildBotao(e.provedor ? 'Continuar a conexão' : 'Conectar a um banco de dados', { variante: 'primario', icone: ICONE_ENTRAR });
    conectar.addEventListener('click', () => c.irPara('conexao'));
    s.corpo.appendChild(conectar);
    return s.cartao;
  }
  const s = cartao('situacao', ICONE_DO_MODULO.nuvem, 'Sincronização', `Supabase · espaço "${e.espaco}"`);
  const linha = el('div', 'nv-situacao');
  linha.appendChild(
    e.sincronizando ? buildSelo('Sincronizando…', 'neutro') : e.ultimoErro ? buildSelo('A última tentativa falhou', 'erro') : buildSelo('Em dia', 'ok'),
  );
  if (e.ultimaSyncEm) linha.appendChild(el('span', 'nv-situacao-quando', `Última sincronização ${tempoRelativo(e.ultimaSyncEm)}`));
  const agora = buildBotao(e.sincronizando || ocupado === 'sync' ? 'Sincronizando…' : 'Sincronizar agora', { variante: 'secundario', icone: ICONES.atualizar });
  agora.disabled = e.sincronizando || Boolean(ocupado);
  agora.addEventListener('click', () => fazer(c, 'sync', async () => recarregarSeRecebeu(await state.sincronizar())));
  linha.appendChild(agora);
  s.corpo.appendChild(linha);
  if (e.ultimoErro) s.corpo.appendChild(buildAviso(e.ultimoErro, 'erro'));
  s.corpo.appendChild(
    interruptor(
      'Este é o computador principal',
      'Só o principal busca os leads do site e envia os lotes do WhatsApp — dois fazendo isso criariam contatos e mensagens em dobro. Deixe ligado em um computador só, o que fica mais tempo aberto.',
      e.principal,
      (v) => void state.definirPrincipal(v).catch(c.falhou),
    ),
  );
  if (e.pausados.length) {
    s.corpo.appendChild(
      buildAviso(
        `${e.pausados.join(', ')}: veio de uma versão mais nova do Iris. Atualize este Iris para voltar a sincronizar ${e.pausados.length === 1 ? 'esse módulo' : 'esses módulos'} — o resto continua normal.`,
        'atencao',
      ),
    );
  }
  if (e.conflitos.length) {
    s.corpo.appendChild(el('h4', 'nv-subtitulo', 'Editado nos dois lugares'));
    s.corpo.appendChild(
      el('p', 'nv-texto', 'O mesmo item mudou aqui e em outro computador: valeu a edição mais recente. A que foi substituída aqui está em Ajustes › Histórico, para desfazer.'),
    );
    const lista = el('ul', 'nv-lista');
    e.conflitos.slice(0, 8).forEach((k) => {
      const li = el('li', 'nv-linha');
      const textos = el('div', 'nv-linha-textos');
      textos.appendChild(el('strong', undefined, k.item ? `${k.modulo} · ${k.item}` : k.modulo));
      const outro = k.dispositivo || 'outro computador';
      textos.appendChild(el('span', undefined, k.venceu === 'remoto' ? `Valeu a versão de ${outro}.` : `Valeu a versão deste computador (a de ${outro} era mais antiga).`));
      li.append(textos, el('span', 'nv-linha-conta', tempoRelativo(k.quando)));
      lista.appendChild(li);
    });
    s.corpo.appendChild(lista);
  }
  return s.cartao;
}

// ---------- Conexão ----------

function buildProjeto(c: CtxNuvem): HTMLElement {
  const e = c.estado;
  const p = cartao('projeto', ICONE_CHAVE, '1. O projeto do Supabase', 'Em supabase.com, crie um projeto (o plano gratuito serve) e abra Project Settings › API.');
  const url = input('url', e.supabase.url, 'https://xxxxxxxx.supabase.co');
  url.spellcheck = false;
  const chave = input('password', '', e.supabase.temChave ? `Salva (termina em ${e.supabase.finalChave || '••••'}) — deixe em branco para manter` : 'service_role ou sb_secret_…');
  chave.autocomplete = 'off';
  const salvar = buildBotao(ocupado === 'projeto' ? 'Testando…' : 'Salvar e testar', { variante: 'primario' });
  salvar.disabled = Boolean(ocupado);
  salvar.addEventListener('click', () =>
    fazer(c, 'projeto', async () => {
      teste = null;
      await state.salvarSupabase({ url: url.value, chave: chave.value });
      teste = await state.testar();
    }),
  );
  p.corpo.append(
    campo('Endereço do projeto (Project URL)', url),
    campo(
      'Chave secreta',
      chave,
      'A chave "service_role" (ou "sb_secret_…"), não a pública. Fica no cofre deste computador e nunca aparece de novo na tela. Quem tem essa chave lê e altera tudo no banco: não a coloque em site nem a mande por mensagem.',
    ),
    salvar,
  );
  if (teste) {
    const caixa = el('div', `la-resultado is-${teste.ok ? 'ok' : 'erro'}`);
    caixa.setAttribute('role', 'status');
    caixa.appendChild(buildSelo(teste.ok ? 'Conectado' : 'Precisa de atenção', teste.ok ? 'ok' : 'erro'));
    caixa.appendChild(el('p', undefined, teste.mensagem));
    p.corpo.appendChild(caixa);
  }
  return p.cartao;
}

function buildTabelas(c: CtxNuvem): HTMLElement {
  const prontas = teste?.esquema !== null && teste?.esquema !== undefined;
  const t = cartao('tabelas', ICONE_TABELA, '2. As tabelas', prontas ? 'Já existem neste banco.' : 'Três tabelas e duas funções, criadas uma vez por banco.');
  if (prontas) {
    t.corpo.appendChild(buildSelo('Tabelas criadas', 'ok'));
    return t.cartao;
  }
  const sql = sqlDoEsquema('postgres');
  const passos = el('ol', 'la-passos');
  const passo = (titulo: string, texto: string, extra?: HTMLElement): void => {
    const li = el('li');
    li.append(el('strong', undefined, titulo), el('p', undefined, texto));
    if (extra) li.appendChild(extra);
    passos.appendChild(li);
  };
  const detalhes = el('details', 'la-worker');
  detalhes.appendChild(el('summary', undefined, 'Ver o SQL'));
  detalhes.appendChild(codigo(sql, 'Copiar SQL', 'SQL das tabelas copiado.'));
  const copiar = buildBotao('Copiar o SQL das tabelas', { variante: 'secundario', icone: ICONES.backup });
  copiar.addEventListener('click', () => {
    window.irisAPI.system.copyToClipboard(sql);
    mostrarToast('SQL copiado. Cole no SQL Editor do Supabase.', [], 3000);
  });
  const caixa = el('div', 'nv-pilha');
  caixa.append(copiar, detalhes);
  passo('Copie o SQL', 'Pode rodar mais de uma vez: ele só cria o que falta.', caixa);
  passo('Cole no Supabase', 'No painel do projeto: SQL Editor › New query. Cole e clique em Run.');
  const conferir = buildBotao(ocupado === 'conferir' ? 'Conferindo…' : 'Já rodei: conferir', { variante: 'primario' });
  conferir.disabled = Boolean(ocupado);
  conferir.addEventListener('click', () =>
    fazer(c, 'conferir', async () => {
      teste = await state.testar();
    }),
  );
  passo('Volte aqui', 'O Iris confere se as tabelas estão lá.', conferir);
  t.corpo.appendChild(passos);

  // O outro caminho: o Iris cria, com um token da conta. Recolhido — a maioria cola o SQL e pronto.
  const auto = el('details', 'la-worker');
  auto.appendChild(el('summary', undefined, 'Ou deixe o Iris criar, com um token de acesso da sua conta'));
  const token = input('password', '', 'sbp_…');
  token.autocomplete = 'off';
  const criar = buildBotao(ocupado === 'criar' ? 'Criando…' : 'Criar as tabelas', { variante: 'secundario' });
  criar.disabled = Boolean(ocupado);
  criar.addEventListener('click', () =>
    fazer(c, 'criar', async () => {
      teste = await state.criarTabelas(token.value);
      if (teste.esquema !== null) mostrarToast('Tabelas criadas.', [], 2500);
    }),
  );
  const corpoAuto = el('div', 'nv-pilha');
  corpoAuto.append(
    campo(
      'Token de acesso',
      token,
      'Em supabase.com/dashboard/account/tokens › Generate new token. O Iris usa uma vez para criar as tabelas e não guarda. Depois você pode apagar o token lá.',
    ),
    criar,
  );
  auto.appendChild(corpoAuto);
  t.corpo.appendChild(auto);
  return t.cartao;
}

async function entrar(c: CtxNuvem, modo: ModoDeEntrada): Promise<void> {
  if (modo === 'trazer') {
    const ok = await openConfirmModal({
      title: 'Trazer os dados da nuvem',
      message:
        'O que está neste computador (cards, contatos, postagens…) será substituído pelo que está na nuvem. Antes, o Iris guarda uma cópia de tudo: em Ajustes › Backup e restauração, "Desfazer última importação" volta ao que era.',
      confirmText: 'Trazer da nuvem',
      danger: false,
    });
    if (!ok) return;
  }
  if (modo === 'juntar') {
    const ok = await openConfirmModal({
      title: 'Juntar os dois',
      message:
        'Os dados daqui e os da nuvem serão somados. Itens que vêm prontos em toda instalação (o quadro do Kanban, as etapas do funil, as redes) podem ficar em dobro, e nada é apagado para evitar isso. Para um computador novo, o certo é "Trazer da nuvem".',
      confirmText: 'Juntar mesmo assim',
      danger: false,
    });
    if (!ok) return;
  }
  fazer(c, 'entrar', async () => {
    const r = await state.entrar(modo);
    teste = null;
    recarregarSeRecebeu(r);
  });
}

function buildEntrada(c: CtxNuvem): HTMLElement {
  const e = c.estado;
  if (e.conectado) {
    const ok = cartao('entrada', ICONE_ENTRAR, '3. Este computador está no espaço', `"${e.espaco}" · sincronizado ${tempoRelativo(e.ultimaSyncEm)}`);
    ok.corpo.appendChild(el('p', 'nv-texto', 'Para sair: os dados continuam aqui e na nuvem, só deixam de se atualizar. A chave fica guardada no cofre.'));
    const sair = buildBotao('Parar de sincronizar', { variante: 'fantasma' });
    sair.disabled = Boolean(ocupado) || e.sincronizando;
    sair.addEventListener('click', () =>
      fazer(c, 'sair', async () => {
        await state.desconectar();
        teste = null;
      }),
    );
    ok.corpo.appendChild(sair);
    return ok.cartao;
  }
  const s = cartao('entrada', ICONE_ENTRAR, '3. Entrar no espaço', `Como este computador entra em "${e.espaco}".`);
  if (!teste?.ok) {
    s.corpo.appendChild(el('p', 'nv-texto', 'Depois que os passos 1 e 2 estiverem certos, o Iris mostra aqui o que há na nuvem e o que fazer com os dados deste computador.'));
    return s.cartao;
  }
  const aqui = e.arquivos.filter((a) => a.sincroniza).reduce((n, a) => n + a.itens, 0);
  const opcao = (titulo: string, texto: string, rotulo: string, modo: ModoDeEntrada, primario: boolean): void => {
    const linha = el('div', 'nv-opcao');
    const textos = el('div', 'nv-opcao-textos');
    textos.append(el('strong', undefined, titulo), el('span', undefined, texto));
    const b = buildBotao(ocupado === 'entrar' ? 'Sincronizando…' : rotulo, { variante: primario ? 'primario' : 'secundario' });
    b.disabled = Boolean(ocupado);
    b.addEventListener('click', () => void entrar(c, modo));
    linha.append(textos, b);
    s.corpo.appendChild(linha);
  };
  if (teste.registros === 0) {
    s.corpo.appendChild(el('p', 'nv-texto', `A nuvem está vazia e este computador tem ${aqui.toLocaleString('pt-BR')} itens.`));
    opcao('Este é o primeiro computador', 'Envia tudo o que está aqui para a nuvem. Nada muda neste computador.', 'Enviar os dados daqui', 'enviar', true);
  } else {
    const outros = teste.dispositivos.filter((d) => d.id !== e.dispositivo.id).map((d) => d.nome);
    s.corpo.appendChild(
      el(
        'p',
        'nv-texto',
        `A nuvem já tem ${teste.registros.toLocaleString('pt-BR')} registros${outros.length ? ` (de ${outros.join(', ')})` : ''} e este computador tem ${aqui.toLocaleString('pt-BR')} itens.`,
      ),
    );
    opcao(
      'Trazer da nuvem (recomendado)',
      'Este computador fica igual à nuvem. O que há aqui é substituído — com uma cópia de segurança antes, que dá para desfazer.',
      'Trazer da nuvem',
      'trazer',
      true,
    );
    opcao('Juntar os dois', 'Soma o daqui com o da nuvem. Só vale quando os dois têm trabalho diferente que você quer manter; itens padrão podem ficar em dobro.', 'Juntar', 'juntar', false);
  }
  return s.cartao;
}

export function buildConexao(c: CtxNuvem): HTMLElement[] {
  // Aberta a seção com a conexão já salva: o teste roda sozinho uma vez, para os passos 2 e 3 já virem certos.
  if (!teste && !ocupado && c.estado.provedor && c.estado.supabase.temChave && !c.estado.conectado) {
    fazer(c, 'conferir', async () => {
      teste = await state.testar();
    });
  }
  return c.estado.conectado ? [buildEntrada(c), buildProjeto(c)] : [buildProjeto(c), buildTabelas(c), buildEntrada(c)];
}
