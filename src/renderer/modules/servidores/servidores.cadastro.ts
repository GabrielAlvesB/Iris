import type {
  AutenticacaoSsh,
  ResultadoTesteServidor,
  Servidor,
  ServidorTipo,
  TestarConexaoInput,
} from '../../../shared/types/servidores.types';
import { campo, grade2, input, interruptor, pilulas, select } from '../../ui/campos.js';
import { mensagemDeErro, openCustomModal, type CustomModalHandle } from '../../ui/modal.js';
import { buildBotao, buildSelo, ICONES, svg } from '../../ui/pagina.js';
import { COFRE } from '../../ui/plataforma.js';
import * as servidoresState from './servidores.state.js';

/**
 * Cadastro e edição num modal só: escolhe o tipo, preenche, testa e salva. Antes
 * eram dois botões ("+ HTTP", "+ SSH"), e o SSH abria o seletor de arquivo antes do
 * formulário — quem queria entrar por senha não tinha como.
 */

export const ICONE_TERMINAL = '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>';
export const ICONE_SITE = '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>';

export const TIPOS: ReadonlyArray<{ id: ServidorTipo; titulo: string; texto: string; icone: string }> = [
  {
    id: 'http',
    titulo: 'Site ou API',
    texto: 'O Iris chama o endereço de tempos em tempos e avisa quando sai do ar ou fica lento.',
    icone: ICONE_SITE,
  },
  {
    id: 'ssh',
    titulo: 'Servidor por SSH',
    texto: 'Entre num terminal dentro do Iris e guarde os comandos que você roda sempre.',
    icone: ICONE_TERMINAL,
  },
];

const INTERVALOS = [
  { value: '0', label: 'Só quando eu pedir' },
  { value: '30', label: 'A cada 30 segundos' },
  { value: '60', label: 'A cada minuto' },
  { value: '300', label: 'A cada 5 minutos' },
  { value: '900', label: 'A cada 15 minutos' },
  { value: '3600', label: 'A cada hora' },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Cartões de tipo — no passo 1 do modal e no estado vazio da tela. */
export function buildEscolhaDeTipo(aoEscolher: (tipo: ServidorTipo) => void): HTMLElement {
  const grade = el('div', 'sv-tipos');
  TIPOS.forEach((t) => {
    const b = el('button', 'sv-tipo');
    b.type = 'button';
    const icone = el('span', 'sv-tipo-icone');
    icone.innerHTML = svg(t.icone, 22, 1.8);
    b.append(icone, el('strong', undefined, t.titulo), el('span', 'sv-tipo-texto', t.texto));
    b.addEventListener('click', () => aoEscolher(t.id));
    grade.appendChild(b);
  });
  return grade;
}

function gruposExistentes(): string[] {
  const nomes = new Set<string>();
  servidoresState.getCurrentState()?.servidores.forEach((s) => s.grupo && nomes.add(s.grupo));
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function campoGrupo(valor: string): { el: HTMLElement; ler: () => string } {
  const i = input('text', valor, 'Ex.: Clientes, Produção');
  const lista = el('datalist');
  lista.id = `sv-grupos-${Math.random().toString(36).slice(2)}`;
  gruposExistentes().forEach((g) => lista.appendChild(Object.assign(document.createElement('option'), { value: g })));
  i.setAttribute('list', lista.id);
  const wrap = campo('Grupo', i, 'Opcional — junta servidores na lista.');
  wrap.appendChild(lista);
  return { el: wrap, ler: () => i.value.trim() };
}

/**
 * Abre o cadastro. Sem `servidor`, é um novo (com `tipo`, pula a escolha);
 * com ele, edição do mesmo formulário.
 */
export function abrirCadastro(opcoes: { servidor?: Servidor; tipo?: ServidorTipo } = {}): Promise<string | null> {
  const editando = opcoes.servidor;
  let criadoId: string | null = null;

  return openCustomModal(
    editando ? `Editar ${editando.nome}` : 'Novo servidor',
    (h) => {
      if (editando) montarFormulario(h, editando.tipo, editando, (id) => (criadoId = id));
      else if (opcoes.tipo) montarFormulario(h, opcoes.tipo, undefined, (id) => (criadoId = id));
      else {
        h.corpo.appendChild(el('p', 'sv-cad-intro', 'O que você quer acompanhar?'));
        h.corpo.appendChild(
          buildEscolhaDeTipo((tipo) => {
            h.corpo.replaceChildren();
            montarFormulario(h, tipo, undefined, (id) => (criadoId = id));
          }),
        );
      }
    },
    {
      icone: editando?.tipo === 'ssh' ? ICONE_TERMINAL : ICONES.servidor,
      subtitulo: editando ? 'As mudanças valem a partir da próxima conexão.' : 'Um site para vigiar ou uma máquina para entrar por SSH.',
      largura: 600,
      classe: 'sv-cadastro',
    },
  ).then(() => criadoId);
}

function montarFormulario(
  h: CustomModalHandle,
  tipo: ServidorTipo,
  editando: Servidor | undefined,
  aoSalvar: (id: string) => void,
): void {
  const form = el('div', 'sv-cad-form');
  const resultado = el('div', 'sv-cad-resultado');
  resultado.setAttribute('aria-live', 'polite');
  let ultimoTeste: { chave: string; impressao?: string } | null = null;

  const nome = input('text', editando?.nome ?? '', tipo === 'http' ? 'Ex.: Site da loja' : 'Ex.: VPS de produção');
  const grupo = campoGrupo(editando?.grupo ?? '');

  // ---- HTTP ----
  const http = editando?.tipo === 'http' ? editando : undefined;
  const url = input('url', http?.url ?? '', 'https://exemplo.com.br/saude');
  let metodo: 'GET' | 'HEAD' = http?.metodo ?? 'GET';
  const statusEsperado = input('number', String(http?.statusEsperado ?? 200));
  const intervalo = select(String(http?.intervaloSegundos ?? 60), INTERVALOS);
  if (http && !INTERVALOS.some((o) => o.value === String(http.intervaloSegundos))) {
    intervalo.appendChild(Object.assign(document.createElement('option'), { value: String(http.intervaloSegundos), textContent: `A cada ${http.intervaloSegundos} s` }));
    intervalo.value = String(http.intervaloSegundos);
  }
  const timeout = input('number', String((http?.timeoutMs ?? 8000) / 1000));
  let tlsInseguro = http?.permitirTlsInseguro ?? false;

  // ---- SSH ----
  const ssh = editando?.tipo === 'ssh' ? editando : undefined;
  const host = input('text', ssh?.host ?? '', '203.0.113.10 ou servidor.exemplo.com');
  const porta = input('number', String(ssh?.porta ?? 22));
  const usuario = input('text', ssh?.usuario ?? '', 'root');
  let autenticacao: AutenticacaoSsh = ssh?.autenticacao ?? 'senha';
  let caminhoChave = ssh?.caminhoChave ?? '';
  const senha = input('password', '', ssh?.temSenha ? 'Salva — deixe vazio para manter' : '');
  senha.autocomplete = 'off';
  const passphrase = input('password', '', ssh?.temPassphrase ? 'Salva — deixe vazio para manter' : 'Só se a chave tiver');
  passphrase.autocomplete = 'off';

  const blocoAuth = el('div', 'sv-cad-auth');
  const desenharAuth = (): void => {
    blocoAuth.replaceChildren();
    if (autenticacao === 'senha') {
      blocoAuth.appendChild(campo('Senha', senha, `Guardada no ${COFRE}, nunca no arquivo de dados.`));
      return;
    }
    const linha = el('div', 'sv-cad-chave');
    const caminho = el('code', 'sv-cad-caminho', caminhoChave || 'Nenhum arquivo escolhido');
    caminho.classList.toggle('is-vazio', !caminhoChave);
    const escolher = buildBotao(caminhoChave ? 'Trocar' : 'Escolher arquivo…', { icone: ICONES.pasta });
    escolher.type = 'button';
    escolher.addEventListener('click', async () => {
      const escolhido = await servidoresState.escolherChave();
      if (escolhido) {
        caminhoChave = escolhido;
        desenharAuth();
      }
    });
    linha.append(caminho, escolher);
    blocoAuth.append(
      campo('Chave privada', linha, 'O arquivo fica onde está; o Iris guarda só o caminho.'),
      campo('Passphrase da chave', passphrase, `Guardada no ${COFRE}.`),
    );
  };

  form.appendChild(campo('Nome', nome));
  if (tipo === 'http') {
    form.append(
      campo('Endereço', url, 'O Iris chama este endereço e confere a resposta.'),
      grade2(
        campo('Checar', intervalo),
        campo(
          'Método',
          pilulas(
            [
              { id: 'GET', rotulo: 'GET' },
              { id: 'HEAD', rotulo: 'HEAD' },
            ],
            () => metodo,
            (v) => (metodo = v),
          ),
        ),
      ),
      grade2(campo('Resposta esperada (HTTP)', statusEsperado), campo('Esperar até (segundos)', timeout)),
      interruptor('Aceitar certificado inválido', 'Para servidores internos com certificado autoassinado.', tlsInseguro, (v) => (tlsInseguro = v)),
    );
  } else {
    form.append(
      grade2(campo('Endereço (host)', host), campo('Porta', porta)),
      campo('Usuário', usuario),
      campo(
        'Entrar com',
        pilulas(
          [
            { id: 'senha', rotulo: 'Senha' },
            { id: 'chave', rotulo: 'Chave privada' },
          ],
          () => autenticacao,
          (v) => {
            autenticacao = v;
            ultimoTeste = null;
            desenharAuth();
          },
        ),
      ),
      blocoAuth,
    );
    desenharAuth();
  }
  form.append(grupo.el);
  h.corpo.append(form, resultado);

  // ---- Leitura e teste ----

  function pedido(): TestarConexaoInput {
    if (tipo === 'http') {
      return {
        tipo: 'http',
        servidorId: editando?.id,
        nome: nome.value.trim(),
        url: url.value.trim(),
        metodo,
        statusEsperado: Number(statusEsperado.value) || 200,
        timeoutMs: Math.max(1, Number(timeout.value) || 8) * 1000,
        permitirTlsInseguro: tlsInseguro,
        intervaloSegundos: Number(intervalo.value) || 0,
        grupo: grupo.ler() || undefined,
      };
    }
    return {
      tipo: 'ssh',
      servidorId: editando?.id,
      nome: nome.value.trim(),
      host: host.value.trim(),
      porta: Number(porta.value) || 22,
      usuario: usuario.value.trim(),
      autenticacao,
      caminhoChave: autenticacao === 'chave' ? caminhoChave : '',
      senha: senha.value || undefined,
      passphrase: passphrase.value || undefined,
      grupo: grupo.ler() || undefined,
    };
  }

  /** Mesmo host+porta do teste: a impressão vista ali já nasce confiada. */
  const chaveDoAlvo = (): string => `${host.value.trim()}:${Number(porta.value) || 22}`;

  function mostrarResultado(r: ResultadoTesteServidor): void {
    resultado.replaceChildren();
    resultado.className = `sv-cad-resultado ${r.ok ? 'is-ok' : 'is-erro'}`;
    const linha = el('div', 'sv-cad-resultado-linha');
    linha.appendChild(buildSelo(r.ok ? 'Conectou' : 'Não conectou', r.ok ? 'ok' : 'erro'));
    const partes: string[] = [];
    if (r.status) partes.push(`HTTP ${r.status}`);
    if (r.latenciaMs !== undefined) partes.push(`${r.latenciaMs} ms`);
    if (r.sistema) partes.push(r.sistema);
    if (partes.length) linha.appendChild(el('span', 'sv-cad-resultado-meta', partes.join(' · ')));
    resultado.appendChild(linha);
    if (r.erro) resultado.appendChild(el('p', 'sv-cad-resultado-erro', r.erro));
    if (r.impressaoDigital) {
      const fp = el('p', 'sv-cad-impressao');
      fp.append(el('span', undefined, 'Chave do servidor: '), el('code', undefined, r.impressaoDigital));
      resultado.appendChild(fp);
    }
    if (r.chaveMudou && editando) {
      const confiar = buildBotao('Confiar na nova chave', { icone: ICONES.escudo });
      confiar.type = 'button';
      confiar.addEventListener('click', async () => {
        await servidoresState.confiarHost(editando.id);
        confiar.replaceWith(el('span', 'sv-cad-resultado-meta', 'Pronto — teste de novo para gravar a chave nova.'));
      });
      resultado.appendChild(confiar);
    }
  }

  const testar = buildBotao('Testar conexão', { icone: ICONES.play });
  testar.type = 'button';
  testar.addEventListener('click', async () => {
    testar.disabled = true;
    resultado.className = 'sv-cad-resultado is-testando';
    resultado.replaceChildren(el('span', 'sv-cad-girando'), el('span', undefined, tipo === 'http' ? 'Chamando o endereço…' : 'Conectando…'));
    try {
      const r = await servidoresState.testarConexao(pedido());
      if (tipo === 'ssh') ultimoTeste = r.ok ? { chave: chaveDoAlvo(), impressao: r.impressaoDigital } : null;
      mostrarResultado(r);
    } catch (erro) {
      mostrarResultado({ ok: false, erro: mensagemDeErro(erro) });
    } finally {
      testar.disabled = false;
      // O resultado fica no pé do formulário: em janela baixa, cairia fora da vista.
      resultado.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });

  const salvar = buildBotao(editando ? 'Salvar' : 'Adicionar', { variante: 'primario', icone: ICONES.check });
  salvar.type = 'button';
  salvar.addEventListener('click', async () => {
    salvar.disabled = true;
    try {
      const p = pedido();
      const antes = new Set(servidoresState.getCurrentState()?.servidores.map((s) => s.id));
      if (editando) {
        await servidoresState.atualizar(
          p.tipo === 'http'
            ? { servidorId: editando.id, nome: p.nome || p.url, grupo: p.grupo ?? '', url: p.url, metodo: p.metodo, statusEsperado: p.statusEsperado, timeoutMs: p.timeoutMs, permitirTlsInseguro: p.permitirTlsInseguro, intervaloSegundos: p.intervaloSegundos }
            : {
                servidorId: editando.id,
                nome: p.nome || p.host,
                grupo: p.grupo ?? '',
                host: p.host,
                porta: p.porta,
                usuario: p.usuario,
                autenticacao: p.autenticacao,
                caminhoChave: p.caminhoChave,
                // Vazio mantém o que está no cofre.
                senha: p.autenticacao === 'senha' && p.senha ? p.senha : undefined,
                passphrase: p.autenticacao === 'chave' && p.passphrase ? p.passphrase : undefined,
              },
        );
        aoSalvar(editando.id);
      } else if (p.tipo === 'http') {
        await servidoresState.criarHttp(p);
      } else {
        await servidoresState.criarSsh({ ...p, impressaoDigital: ultimoTeste?.chave === chaveDoAlvo() ? ultimoTeste.impressao : undefined });
      }
      if (!editando) {
        const novo = servidoresState.getCurrentState()?.servidores.find((s) => !antes.has(s.id));
        if (novo) aoSalvar(novo.id);
      }
      h.fechar();
    } catch (erro) {
      resultado.className = 'sv-cad-resultado is-erro';
      resultado.replaceChildren(el('p', 'sv-cad-resultado-erro', mensagemDeErro(erro)));
      salvar.disabled = false;
    }
  });

  const espaco = el('span', 'pg-espaco');
  h.rodape.replaceChildren(testar, espaco, salvar);
  requestAnimationFrame(() => (tipo === 'http' ? url : host).focus());
}
