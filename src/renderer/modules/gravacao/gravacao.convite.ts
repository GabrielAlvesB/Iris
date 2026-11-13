import { formatarRelogio, temDuasPessoas, type ConviteLido, type IdPessoa, type SessaoGravacao } from '../../../shared/types/gravacao.types.js';
import { campo, erroInline, input, textarea } from '../../ui/campos.js';
import { mensagemDeErro, openCustomModal } from '../../ui/modal.js';
import { buildAviso, buildBotao, svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { agoraCerto, conferir, textoDoRelogio } from './gravacao.relogio.js';
import * as gravacaoState from './gravacao.state.js';

/**
 * Gravar com outra pessoa, Iris com Iris. Não há servidor no meio: quem chama
 * escolhe "começar em 1 min", o Iris gera um convite em texto (com o roteiro
 * dentro) e copia; a pessoa cola no Iris dela (ou só copia — ele reconhece). Os
 * dois contam até o mesmo instante pela hora conferida, perto ou longe.
 */

export const ICONE_PESSOAS =
  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>';
const ICONE_CONVITE = '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>';
const ICONE_COPIAR = '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
const ICONE_OK = '<polyline points="20 6 9 17 4 12"/>';

const CHAVE_PARCEIRO = 'iris.gravacao.parceiro';
const PRAZOS = [
  { ms: 30_000, rotulo: '30 s' },
  { ms: 60_000, rotulo: '1 min' },
  { ms: 120_000, rotulo: '2 min' },
  { ms: 300_000, rotulo: '5 min' },
];

/** Pelo main (clipboard do Electron): o navigator.clipboard falha se a janela não está em foco. */
function copiarTexto(texto: string): void {
  window.irisAPI.system.copyToClipboard(texto);
}

function lerParceiro(): string {
  try {
    return localStorage.getItem(CHAVE_PARCEIRO) ?? '';
  } catch {
    return '';
  }
}

function lembrarParceiro(nome: string): void {
  try {
    localStorage.setItem(CHAVE_PARCEIRO, nome);
  } catch {
    // Só conveniência: sem armazenamento, o nome não vem preenchido da próxima vez.
  }
}

function horaDe(em: number): string {
  return new Date(em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Pílulas "começar em". */
function buildPrazos(inicial: number, aoEscolher: (ms: number) => void): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = 'gv-prazos';
  grupo.setAttribute('role', 'radiogroup');
  grupo.setAttribute('aria-label', 'Começar em');
  PRAZOS.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gv-prazo';
    b.textContent = p.rotulo;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(p.ms === inicial));
    b.addEventListener('click', () => {
      grupo.querySelectorAll('.gv-prazo').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      aoEscolher(p.ms);
    });
    grupo.appendChild(b);
  });
  return grupo;
}

/** Linha "Hora conferida (±0,02 s)" que se atualiza quando a medida chega. */
function buildLinhaRelogio(): HTMLElement {
  const linha = document.createElement('p');
  linha.className = 'gv-relogio-linha';
  const desenhar = (): void => {
    const { texto, ok } = textoDoRelogio();
    linha.classList.toggle('is-aviso', !ok);
    linha.innerHTML = svg(ok ? ICONE_OK : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 13, 2.2);
    linha.append(texto);
  };
  desenhar();
  void conferir().then(desenhar);
  return linha;
}

/** "Começa em 0:52 · às 14:30:00", atualizando a cada meio segundo enquanto estiver na tela. */
function buildFaltaAoVivo(em: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'gv-falta';
  const tique = (): void => {
    if (!el.isConnected && el.dataset.montado) return;
    el.dataset.montado = '1';
    const falta = em - agoraCerto();
    el.textContent = falta > 0 ? `Começa em ${formatarRelogio(falta + 999)} · às ${horaDe(em)}` : `Começou às ${horaDe(em)}`;
    setTimeout(tique, 500);
  };
  tique();
  return el;
}

/**
 * Passo 2, igual para o primeiro take e os seguintes: o convite pronto e
 * copiado, com WhatsApp e o botão para ir ao palco.
 */
function buildConvitePronto(texto: string, em: number, parceiro: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'gv-pronto';
  const selo = document.createElement('div');
  selo.className = 'gv-pronto-selo';
  selo.innerHTML = svg(ICONE_OK, 18, 2.4);
  const textos = document.createElement('div');
  textos.append(
    Object.assign(document.createElement('strong'), { textContent: `Convite copiado. Mande para ${parceiro}.` }),
    Object.assign(document.createElement('span'), { textContent: `${parceiro} copia a mensagem e abre o Iris em Gravação › Gravar: o convite aparece sozinho.` }),
  );
  const topo = document.createElement('div');
  topo.className = 'gv-pronto-topo';
  topo.append(selo, textos);
  wrap.append(topo, buildFaltaAoVivo(em));
  const caixa = textarea(texto, '', 5);
  caixa.readOnly = true;
  caixa.className += ' gv-convite-texto';
  caixa.addEventListener('focus', () => caixa.select());
  wrap.appendChild(caixa);
  const acoes = document.createElement('div');
  acoes.className = 'gv-linha-acoes';
  const copiar = buildBotao('Copiar de novo', { icone: ICONE_COPIAR });
  copiar.addEventListener('click', () => {
    copiarTexto(texto);
    mostrarToast('Convite copiado.');
  });
  const whatsapp = buildBotao('Mandar pelo WhatsApp', { titulo: 'Abre o WhatsApp com a mensagem pronta; você escolhe a conversa' });
  whatsapp.addEventListener('click', () => window.irisAPI.system.openExternalLink(`https://wa.me/?text=${encodeURIComponent(texto)}`));
  acoes.append(copiar, whatsapp);
  wrap.appendChild(acoes);
  return wrap;
}

// ---------- Quem chama: primeiro take ----------

export interface PedidoChamar {
  roteiroId?: string;
  /** Texto das cenas do roteiro escolhido, para saber se há falas de A e B. */
  cenasDoRoteiro?: Array<{ texto: string }>;
  nomesDoRoteiro?: string;
}

/**
 * "Gravar com outra pessoa": nome, quem é quem (se o roteiro tem A e B) e
 * quando começar. Cria a gravação, o convite (já copiado) e devolve a gravação
 * para o palco abrir contando — ou null se a janela fechou antes.
 */
export function chamarParaGravar(pedido: PedidoChamar): Promise<SessaoGravacao | null> {
  return new Promise((resolve) => {
    let resultado: SessaoGravacao | null = null;
    let prazo = 60_000;
    let euSou: IdPessoa = 'A';
    const dupla = temDuasPessoas(pedido.cenasDoRoteiro ?? []);
    void openCustomModal(
      'Gravar com outra pessoa',
      ({ corpo, rodape, fechar }) => {
        const nome = input('text', lerParceiro(), 'Ex.: Bruno');
        nome.maxLength = 60;
        corpo.appendChild(campo('Com quem você vai gravar?', nome, 'A pessoa precisa ter o Iris. Cada um grava o próprio vídeo; o bipe sai junto nos dois.'));

        if (dupla) {
          const grupo = document.createElement('div');
          grupo.className = 'gv-prazos';
          (['A', 'B'] as IdPessoa[]).forEach((id) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'gv-prazo';
            b.textContent = id === 'A' ? 'Eu falo o "A"' : 'Eu falo o "B"';
            b.setAttribute('aria-checked', String(id === euSou));
            b.setAttribute('role', 'radio');
            b.addEventListener('click', () => {
              euSou = id;
              grupo.querySelectorAll('.gv-prazo').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
            });
            grupo.appendChild(b);
          });
          corpo.appendChild(campo('No roteiro', grupo, 'A outra pessoa fica com a outra letra; cada um vê a própria fala em destaque.'));
        }

        corpo.appendChild(campo('Começar em', buildPrazos(prazo, (ms) => (prazo = ms)), 'Tempo para a outra pessoa receber, colar e ligar a câmera.'));
        corpo.appendChild(buildLinhaRelogio());

        const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
        cancelar.addEventListener('click', fechar);
        const criar = buildBotao('Criar convite', { icone: ICONE_CONVITE, variante: 'primario' });
        criar.addEventListener('click', async () => {
          const parceiro = nome.value.trim();
          if (!parceiro) {
            erroInline(corpo, new Error('Escreva o nome de quem vai gravar com você.'));
            nome.focus();
            return;
          }
          criar.disabled = true;
          try {
            lembrarParceiro(parceiro);
            await conferir();
            const sessao = await gravacaoState.criarGravacao({ roteiroId: pedido.roteiroId, parceiro, euSou });
            const em = agoraCerto() + prazo;
            const texto = await gravacaoState.criarConvite(sessao.id, em);
            copiarTexto(texto);
            resultado = gravacaoState.sessaoPorId(sessao.id) ?? sessao;
            corpo.replaceChildren(buildConvitePronto(texto, em, parceiro));
            const palco = buildBotao('Ir para o palco', { variante: 'primario' });
            palco.addEventListener('click', fechar);
            rodape.replaceChildren(palco);
            palco.focus();
          } catch (e) {
            criar.disabled = false;
            erroInline(corpo, e);
          }
        });
        rodape.append(cancelar, criar);
        nome.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') criar.click();
        });
        nome.focus();
      },
      { largura: 520, icone: ICONE_PESSOAS, subtitulo: 'Iris com Iris, perto ou longe', aoFechar: () => resolve(resultado) },
    );
  });
}

// ---------- Quem chama: os próximos takes ----------

/** Do palco ou da gravação: novo horário para a mesma dupla. Devolve o instante, ou null. */
export function combinarProximoTake(sessao: SessaoGravacao): Promise<number | null> {
  return new Promise((resolve) => {
    let resultado: number | null = null;
    let prazo = 30_000;
    const parceiro = sessao.conjunta?.parceiro ?? 'a outra pessoa';
    void openCustomModal(
      'Próximo take junto',
      ({ corpo, rodape, fechar }) => {
        corpo.appendChild(campo('Começar em', buildPrazos(prazo, (ms) => (prazo = ms)), `${parceiro} cola o convite novo e o Iris dele já conta até o mesmo instante.`));
        corpo.appendChild(buildLinhaRelogio());
        const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
        cancelar.addEventListener('click', fechar);
        const criar = buildBotao('Criar convite', { icone: ICONE_CONVITE, variante: 'primario' });
        criar.addEventListener('click', async () => {
          criar.disabled = true;
          try {
            await conferir();
            const em = agoraCerto() + prazo;
            const texto = await gravacaoState.criarConvite(sessao.id, em);
            copiarTexto(texto);
            resultado = em;
            if (sessao.conjunta) sessao.conjunta.proximoInicio = em;
            corpo.replaceChildren(buildConvitePronto(texto, em, parceiro));
            const voltar = buildBotao('Voltar ao palco', { variante: 'primario' });
            voltar.addEventListener('click', fechar);
            rodape.replaceChildren(voltar);
            voltar.focus();
          } catch (e) {
            criar.disabled = false;
            erroInline(corpo, e);
          }
        });
        rodape.append(cancelar, criar);
        criar.focus();
      },
      { largura: 500, icone: ICONE_PESSOAS, subtitulo: `com ${parceiro}`, aoFechar: () => resolve(resultado) },
    );
  });
}

// ---------- Quem recebe ----------

/** Cartão do convite lido: de quem, o quê, quando e quem você é. */
export function buildResumoConvite(lido: ConviteLido): HTMLElement {
  const d = lido.dados;
  const cartao = document.createElement('div');
  cartao.className = 'gv-convite-resumo';
  const eu = d.pessoas.find((p) => p.id === d.voce);
  cartao.append(
    Object.assign(document.createElement('span'), { className: 'gv-convite-de', textContent: `${d.de} te chamou para gravar` }),
    Object.assign(document.createElement('strong'), { className: 'gv-convite-titulo', textContent: d.titulo }),
  );
  const meta = document.createElement('div');
  meta.className = 'gv-convite-meta';
  const partes = [
    d.roteiro ? `Roteiro com ${d.roteiro.cenas.length} cena${d.roteiro.cenas.length === 1 ? '' : 's'}` : 'Sem roteiro: só a contagem',
    d.roteiro && temDuasPessoas(d.roteiro.cenas) && eu ? `você fala o "${eu.id}"` : '',
  ].filter(Boolean);
  meta.textContent = partes.join(' · ');
  cartao.append(meta, buildFaltaAoVivo(d.em));
  return cartao;
}

/**
 * "Entrar com convite": colar a mensagem (vem preenchida se o Iris achou um
 * convite copiado). Devolve a gravação para o palco abrir contando.
 */
export function entrarComConvite(inicial?: { texto: string; lido: ConviteLido }): Promise<SessaoGravacao | null> {
  return new Promise((resolve) => {
    let resultado: SessaoGravacao | null = null;
    void openCustomModal(
      'Entrar com convite',
      ({ corpo, rodape, fechar }) => {
        const caixa = textarea(inicial?.texto ?? '', 'Cole aqui a mensagem que você recebeu (com a linha IRIS-GRAVAR…)', 4);
        corpo.appendChild(campo('Convite', caixa));
        const previa = document.createElement('div');
        previa.className = 'gv-convite-previa';
        corpo.append(previa, buildLinhaRelogio());
        const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
        cancelar.addEventListener('click', fechar);
        const entrar = buildBotao('Entrar e ir para o palco', { variante: 'primario' });
        entrar.disabled = true;
        let lido: ConviteLido | null = inicial?.lido ?? null;

        const mostrar = (): void => {
          previa.replaceChildren();
          entrar.disabled = true;
          if (!lido) return;
          const atraso = agoraCerto() - lido.dados.em;
          previa.appendChild(buildResumoConvite(lido));
          if (atraso > 0) {
            previa.appendChild(buildAviso(`Esse horário já passou (há ${formatarRelogio(atraso)}). Peça um convite novo para ${lido.dados.de}.`, 'atencao'));
            return;
          }
          entrar.disabled = false;
        };
        let pendente = 0;
        const ler = (): void => {
          const meu = ++pendente;
          const texto = caixa.value.trim();
          if (!texto) {
            lido = null;
            mostrar();
            return;
          }
          void gravacaoState
            .lerConvite(texto)
            .then((l) => {
              if (meu !== pendente) return;
              lido = l;
              mostrar();
            })
            .catch((e: unknown) => {
              if (meu !== pendente) return;
              lido = null;
              mostrar();
              previa.appendChild(buildAviso(mensagemDeErro(e), 'erro'));
            });
        };
        caixa.addEventListener('input', ler);
        if (inicial) mostrar();
        else ler();

        entrar.addEventListener('click', async () => {
          entrar.disabled = true;
          try {
            await conferir();
            resultado = await gravacaoState.entrarComConvite(caixa.value);
            fechar();
          } catch (e) {
            entrar.disabled = false;
            erroInline(corpo, e);
          }
        });
        rodape.append(cancelar, entrar);
        if (inicial) entrar.focus();
        else caixa.focus();
      },
      { largura: 520, icone: ICONE_CONVITE, subtitulo: 'De outra pessoa que tem o Iris', aoFechar: () => resolve(resultado) },
    );
  });
}
