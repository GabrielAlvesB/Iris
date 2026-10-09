import { MODULOS } from '../../../shared/types/modulos.types.js';
import { TECLAS_RESERVADAS, type Combo } from '../../../shared/types/atalhos.types.js';
import { CATALOGO_ATALHOS, GRUPO_GERAL, GRUPO_NAVEGACAO, definicaoDe, type DefinicaoAtalho } from '../../core/atalhos.catalogo.js';
import {
  comboDe,
  conflitosDe,
  foiTrocado,
  onAtalhosMudaram,
  passoDoEvento,
  pausarAtalhos,
  salvarTrocas,
  textoDoCombo,
  trocasAtuais,
} from '../../core/atalhos.js';
import { mensagemDeErro, openAvisoModal, openConfirmModal, openCustomModal } from '../../ui/modal.js';
import { buildBotao, buildBusca, buildSelo, buildTeclas } from '../../ui/pagina.js';
import { DO_SISTEMA } from '../../ui/plataforma.js';

/**
 * Ajustes › Atalhos: todos os atalhos que se trocam, por grupo, com a tecla de
 * agora. "Trocar" abre a captura (aperta-se a combinação nova); conflito com
 * outra ação é avisado e pode ser resolvido tirando a tecla da outra.
 */

export const ICONE_TECLADO =
  '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01"/><path d="M10 9h.01"/><path d="M14 9h.01"/><path d="M18 9h.01"/><path d="M6 13h.01"/><path d="M18 13h.01"/><path d="M10 13h4"/><path d="M8 16h8"/>';

let busca = '';
let pararOuvinte: (() => void) | null = null;

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function ordemDosGrupos(): string[] {
  return [GRUPO_GERAL, GRUPO_NAVEGACAO, ...MODULOS.map((m) => m.rotulo)];
}

function nomes(acoes: DefinicaoAtalho[]): string {
  // Com o grupo: "Buscar" existe em Pensamentos e em Links.
  return acoes.map((a) => `"${a.rotulo}" (${a.grupo === GRUPO_NAVEGACAO ? 'ir para' : a.grupo})`).join(', ');
}

async function gravar(trocas: Record<string, Combo>): Promise<void> {
  try {
    await salvarTrocas(trocas);
  } catch (e) {
    void openAvisoModal('Não foi possível salvar o atalho', mensagemDeErro(e));
  }
}

// ---------- Captura de uma combinação nova ----------

function abrirCaptura(definicao: DefinicaoAtalho): void {
  let combo: Combo = '';
  let primeiroPasso: string | null = null;
  let espera: number | null = null;
  let encerrar: () => void = () => undefined;

  void openCustomModal(
    'Trocar atalho',
    ({ corpo, rodape, fechar }) => {
      const instrucao = document.createElement('p');
      instrucao.className = 'aj-at-instrucao';
      instrucao.textContent = 'Aperte a nova combinação. Para uma sequência como G depois K, aperte uma tecla e logo a outra. Esc cancela.';
      const visor = document.createElement('div');
      visor.className = 'aj-at-visor';
      const aviso = document.createElement('div');
      aviso.className = 'aj-at-aviso';

      const salvar = buildBotao('Salvar', { variante: 'primario' });
      const semAtalho = buildBotao('Deixar sem atalho', { variante: 'fantasma' });
      const cancelar = buildBotao('Cancelar', { variante: 'secundario' });

      const desenhar = (): void => {
        visor.replaceChildren();
        if (primeiroPasso) {
          visor.appendChild(buildTeclas(primeiroPasso));
          visor.appendChild(Object.assign(document.createElement('span'), { className: 'aj-at-esperando', textContent: 'depois…' }));
        } else if (combo) visor.appendChild(buildTeclas(combo));
        else visor.appendChild(Object.assign(document.createElement('span'), { className: 'aj-at-esperando', textContent: 'Esperando as teclas…' }));

        aviso.replaceChildren();
        salvar.disabled = !combo || Boolean(primeiroPasso);
        if (!combo || primeiroPasso) return;
        const passos = combo.split(' ');
        if (passos.some((p) => TECLAS_RESERVADAS.has(p))) {
          aviso.appendChild(buildSelo('Tecla reservada', 'erro'));
          aviso.append(` Essa combinação é ${DO_SISTEMA} ou de edição de texto (copiar, colar, recarregar…). Escolha outra.`);
          salvar.disabled = true;
          return;
        }
        if (combo === comboDe(definicao.id)) {
          aviso.appendChild(buildSelo('Já é essa', 'neutro'));
          return;
        }
        const conflitos = conflitosDe(definicao.id, combo);
        if (conflitos.length) {
          aviso.appendChild(buildSelo('Em uso', 'atencao'));
          aviso.append(` ${textoDoCombo(combo)} já está com ${nomes(conflitos)}. Salvar tira a tecla de lá — ${conflitos.length === 1 ? 'ela fica' : 'elas ficam'} sem atalho até você escolher outra.`);
        }
      };

      const finalizar = (novo: Combo): void => {
        if (espera !== null) window.clearTimeout(espera);
        espera = null;
        primeiroPasso = null;
        combo = novo;
        desenhar();
      };

      const aoTeclar = (e: KeyboardEvent): void => {
        // Esc segue para a pilha de camadas, que fecha a janela.
        if (e.key === 'Escape') return;
        const passo = passoDoEvento(e);
        if (!passo) return;
        e.preventDefault();
        e.stopPropagation();
        if (primeiroPasso) {
          finalizar(`${primeiroPasso} ${passo}`);
          return;
        }
        // Tecla sozinha (sem Ctrl/Alt, não F): pode ser o começo de uma sequência.
        const simples = !/(Ctrl|Alt)\+/.test(passo) && !/^(Shift\+)?F\d{1,2}$/.test(passo);
        if (simples) {
          primeiroPasso = passo;
          combo = '';
          desenhar();
          espera = window.setTimeout(() => finalizar(passo), 1000);
          return;
        }
        finalizar(passo);
      };

      pausarAtalhos(true);
      window.addEventListener('keydown', aoTeclar, true);
      encerrar = (): void => {
        window.removeEventListener('keydown', aoTeclar, true);
        if (espera !== null) window.clearTimeout(espera);
        pausarAtalhos(false);
      };

      salvar.addEventListener('click', () => {
        const conflitos = conflitosDe(definicao.id, combo);
        const novas = { ...trocasAtuais(), [definicao.id]: combo };
        conflitos.forEach((c) => (novas[c.id] = ''));
        encerrar();
        fechar();
        void gravar(novas);
      });
      semAtalho.addEventListener('click', () => {
        encerrar();
        fechar();
        void gravar({ ...trocasAtuais(), [definicao.id]: '' });
      });
      cancelar.addEventListener('click', () => {
        encerrar();
        fechar();
      });

      corpo.append(instrucao, visor, aviso);
      rodape.append(semAtalho, cancelar, salvar);
      desenhar();
    },
    { largura: 520, icone: ICONE_TECLADO, subtitulo: `${definicao.rotulo} · ${definicao.grupo}` },
  )
    // Fechado pelo Esc ou pelo X: o ouvinte da captura sai junto (encerrar duas vezes não faz mal).
    .then(() => encerrar());
}

async function restaurar(definicao: DefinicaoAtalho): Promise<void> {
  const novas = trocasAtuais();
  delete novas[definicao.id];
  const conflitos = conflitosDe(definicao.id, definicao.padrao, novas);
  if (conflitos.length) {
    const ok = await openConfirmModal({
      title: 'Restaurar atalho',
      message: `A tecla padrão (${textoDoCombo(definicao.padrao)}) está com ${nomes(conflitos)}. Restaurar tira a tecla de lá.`,
      confirmText: 'Restaurar',
      danger: false,
    });
    if (!ok) return;
    conflitos.forEach((c) => (novas[c.id] = ''));
  }
  await gravar(novas);
}

// ---------- Seção ----------

export function buildSecaoAtalhos(painel: HTMLElement): HTMLElement {
  const corpo = document.createElement('div');
  corpo.className = 'aj-corpo aj-atalhos';

  const barra = document.createElement('div');
  barra.className = 'aj-at-barra';
  const lista = document.createElement('div');
  lista.className = 'aj-at-lista';
  const restaurarTodos = buildBotao('Restaurar todos', { variante: 'fantasma' });
  const ajuda = buildBotao('Ver como lista', { variante: 'secundario', icone: ICONE_TECLADO, titulo: 'Abre a ajuda dos atalhos (a mesma do Shift+?)' });
  ajuda.addEventListener('click', () => void import('../../core/atalhos.ajuda.js').then((m) => m.abrirAjudaAtalhos()));
  restaurarTodos.addEventListener('click', () => {
    void openConfirmModal({ title: 'Restaurar todos', message: 'Voltar todos os atalhos para as teclas padrão?', confirmText: 'Restaurar', danger: false }).then((ok) => {
      if (ok) void gravar({});
    });
  });

  const desenhar = (): void => {
    lista.replaceChildren();
    restaurarTodos.disabled = !CATALOGO_ATALHOS.some((d) => foiTrocado(d.id));
    const termo = normalizar(busca.trim());
    const visiveis = CATALOGO_ATALHOS.filter((d) => !termo || normalizar(`${d.rotulo} ${d.grupo} ${comboDe(d.id)}`).includes(termo));
    if (!visiveis.length) {
      lista.appendChild(Object.assign(document.createElement('p'), { className: 'aj-at-vazio', textContent: 'Nenhum atalho com esse nome.' }));
      return;
    }
    ordemDosGrupos().forEach((grupo) => {
      const doGrupo = visiveis.filter((d) => d.grupo === grupo);
      if (!doGrupo.length) return;
      const secao = document.createElement('section');
      secao.className = 'aj-at-grupo';
      secao.appendChild(Object.assign(document.createElement('h3'), { textContent: grupo }));
      doGrupo.forEach((d) => {
        const linha = document.createElement('div');
        linha.className = 'aj-at-linha';
        const nome = document.createElement('span');
        nome.className = 'aj-at-nome';
        nome.textContent = d.rotulo;
        if (foiTrocado(d.id)) nome.appendChild(buildSelo('trocado', 'neutro'));
        if (d.escopo && grupo !== GRUPO_NAVEGACAO) nome.title = `Só vale com ${grupo} aberto`;
        const acoes = document.createElement('span');
        acoes.className = 'aj-at-acoes';
        acoes.appendChild(buildTeclas(comboDe(d.id)));
        const trocar = buildBotao('Trocar', { variante: 'secundario' });
        trocar.addEventListener('click', () => abrirCaptura(definicaoDe(d.id)!));
        acoes.appendChild(trocar);
        if (foiTrocado(d.id)) {
          const voltar = buildBotao('Restaurar', { variante: 'fantasma', titulo: `Voltar para ${textoDoCombo(d.padrao) || 'sem atalho'}` });
          voltar.addEventListener('click', () => void restaurar(d));
          acoes.appendChild(voltar);
        }
        linha.append(nome, acoes);
        secao.appendChild(linha);
      });
      lista.appendChild(secao);
    });
  };

  const campo = buildBusca(busca, 'Buscar atalho ou tecla…', (v) => {
    busca = v;
    desenhar();
  });
  barra.append(campo, ajuda, restaurarTodos);

  const nota = document.createElement('p');
  nota.className = 'aj-at-nota';
  nota.textContent =
    'Com o foco num campo de texto, só valem os atalhos com Ctrl ou Alt (e as teclas F). Atalhos de um módulo só valem com ele aberto — por isso o Ctrl+K pode ser uma coisa no Kanban e outra nos Links.';

  corpo.append(nota, barra, lista);
  desenhar();
  pararOuvinte?.();
  pararOuvinte = onAtalhosMudaram(() => {
    if (lista.isConnected) desenhar();
    else {
      pararOuvinte?.();
      pararOuvinte = null;
    }
  });
  painel.appendChild(corpo);
  return painel;
}
