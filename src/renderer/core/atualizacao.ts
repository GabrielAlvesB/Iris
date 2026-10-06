import type { EstadoAtualizacao, InstaladorLocal, RelacaoVersao, VersaoPublicada } from '../../shared/types/atualizacao.types.js';
import { openAvisoModal, openConfirmModal, openCustomModal } from '../ui/modal.js';
import { buildAviso, buildBotao, buildSelo, svg, type Tom } from '../ui/pagina.js';
import { abrirAjustes } from './navegacao.js';

/**
 * Estado da atualização do app, vivo durante toda a sessão (não é um módulo:
 * o aviso na barra lateral aparece em qualquer tela). O main verifica o
 * GitHub sozinho e empurra 'atualizacao:estado'; aqui só guardamos e desenhamos.
 */

export const ICONE_ATUALIZACAO = '<path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/>';

type Ouvinte = (estado: EstadoAtualizacao) => void;

let estado: EstadoAtualizacao | null = null;
const ouvintes = new Set<Ouvinte>();
let aviso: HTMLButtonElement | null = null;

function mudou(novo: EstadoAtualizacao): void {
  estado = novo;
  desenharAviso();
  ouvintes.forEach((cb) => cb(novo));
}

export function getEstadoAtualizacao(): EstadoAtualizacao | null {
  return estado;
}

/** Para a seção de Ajustes acompanhar o progresso. Devolve o cancelamento. */
export function onAtualizacao(cb: Ouvinte): () => void {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

/** Chamado uma vez no bootstrap; a assinatura dura a vida da janela. */
export function iniciarAtualizacao(): void {
  window.irisAPI.events.on('atualizacao:estado', mudou);
  void window.irisAPI.atualizacao.getEstado().then((r) => {
    if (r.ok) mudou(r.data);
  });
}

export async function verificarAgora(): Promise<void> {
  const r = await window.irisAPI.atualizacao.verificar();
  if (!r.ok) throw new Error(r.error);
}

export async function abrirPaginaDaRelease(): Promise<void> {
  const r = await window.irisAPI.atualizacao.abrirPagina();
  if (!r.ok) throw new Error(r.error);
}

/** Confirma, baixa e instala. O app fecha e volta aberto na versão nova. */
export async function atualizarAgora(): Promise<void> {
  const nova = estado?.nova;
  if (!nova) return;
  const ok = await openConfirmModal({
    title: `Atualizar para a versão ${nova.versao}`,
    message:
      'O Iris vai baixar a versão nova e, quando terminar, fechar sozinho para instalar e abrir de novo. ' +
      'Seus dados não são tocados — ficam na pasta de dados, fora da instalação.',
    confirmText: 'Baixar e instalar',
    danger: false,
  });
  if (!ok) return;
  const r = await window.irisAPI.atualizacao.atualizar();
  if (!r.ok) await openAvisoModal('Não deu para atualizar', r.error, { erro: true });
}

const AVISO_DE_VOLTAR =
  'Voltar para uma versão anterior pode fazer ela não entender dados criados por recursos mais novos ' +
  '(ex.: uma área que ela ainda não tinha). Antes, faça um backup em Ajustes › Backup e restauração.';

function confirmarInstalacao(versao: string | undefined, relacao: RelacaoVersao | undefined, origem: string): Promise<boolean> {
  const alvo = versao ? `a versão ${versao}` : 'este instalador';
  const titulo =
    relacao === 'anterior' ? `Voltar para a versão ${versao}` : relacao === 'atual' ? `Reinstalar a versão ${versao}` : `Instalar ${alvo}`;
  const texto =
    `O Iris vai ${origem} e, quando terminar, fechar sozinho para instalar ${alvo} e abrir de novo. ` +
    'Seus dados ficam na pasta de dados, fora da instalação.' +
    (relacao === 'anterior' ? `\n\n${AVISO_DE_VOLTAR}` : '');
  return openConfirmModal({
    title: titulo,
    message: texto,
    confirmText: relacao === 'anterior' ? 'Voltar para esta versão' : 'Instalar',
    danger: relacao === 'anterior',
  });
}

export async function listarVersoes(): Promise<VersaoPublicada[]> {
  const r = await window.irisAPI.atualizacao.listarVersoes();
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

/** Instala uma versão publicada (mais nova, a mesma ou anterior), depois de confirmar. */
export async function instalarVersao(v: VersaoPublicada): Promise<boolean> {
  if (!(await confirmarInstalacao(v.versao, v.relacao, 'baixar o instalador do GitHub, conferir o arquivo'))) return false;
  const r = await window.irisAPI.atualizacao.instalarVersao(v.versao);
  if (!r.ok) {
    await openAvisoModal('Não deu para instalar', r.error, { erro: true });
    return false;
  }
  return true;
}

function formatarMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/**
 * Instalar um Iris-Setup-….exe que está no disco — o de release/ recém-gerado
 * pelo npm run dist, antes (ou em vez) de publicar no GitHub.
 */
export async function instalarDeArquivo(): Promise<void> {
  const escolha = await window.irisAPI.atualizacao.escolherInstalador();
  if (!escolha.ok) {
    await openAvisoModal('Instalador recusado', escolha.error, { erro: true });
    return;
  }
  const arquivo: InstaladorLocal | null = escolha.data;
  if (!arquivo) return;
  const conferencia = arquivo.conferido
    ? 'conferido com o latest.yml ao lado dele'
    : 'sem latest.yml ao lado para conferir — use só um instalador que você mesmo gerou ou baixou do GitHub';
  const origem = `usar o arquivo ${arquivo.nome} (${formatarMb(arquivo.tamanho)}, ${conferencia})`;
  if (!(await confirmarInstalacao(arquivo.versao, arquivo.relacao, origem))) return;
  const r = await window.irisAPI.atualizacao.instalarArquivo();
  if (!r.ok) await openAvisoModal('Não deu para instalar', r.error, { erro: true });
}

const SELO_DA_RELACAO: Record<RelacaoVersao, { texto: string; tom: Tom }> = {
  'mais-nova': { texto: 'Mais nova', tom: 'ok' },
  atual: { texto: 'Instalada', tom: 'neutro' },
  anterior: { texto: 'Anterior', tom: 'atencao' },
};

/** Lista das releases publicadas, cada uma com o botão de instalar. */
export function abrirEscolhaDeVersao(): void {
  void openCustomModal(
    'Escolher versão',
    ({ corpo, rodape, fechar }) => {
      const fecharBtn = buildBotao('Fechar', { variante: 'fantasma' });
      fecharBtn.addEventListener('click', fechar);
      rodape.appendChild(fecharBtn);

      const carregando = document.createElement('p');
      carregando.className = 'md-vazio';
      carregando.textContent = 'Buscando as versões publicadas no GitHub…';
      corpo.appendChild(carregando);

      const modo = estado?.modo;
      listarVersoes()
        .then((versoes) => {
          corpo.replaceChildren();
          if (modo !== 'instalado') {
            corpo.appendChild(
              buildAviso(
                'Esta cópia não foi instalada pelo instalador (portátil ou npm run dev): ela não se troca sozinha. Use a página da release para baixar.',
                'neutro',
              ),
            );
          }
          if (!versoes.length) {
            corpo.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: 'Nenhuma versão publicada ainda. Publique com npm run release.' }));
            return;
          }
          const lista = document.createElement('div');
          lista.className = 'aj-versoes';
          versoes.forEach((v) => {
            const linha = document.createElement('div');
            linha.className = 'aj-versao';
            linha.classList.toggle('is-atual', v.relacao === 'atual');

            const info = document.createElement('div');
            info.className = 'aj-versao-info';
            const titulo = document.createElement('div');
            titulo.className = 'aj-versao-titulo';
            titulo.appendChild(Object.assign(document.createElement('strong'), { textContent: v.versao }));
            titulo.appendChild(buildSelo(SELO_DA_RELACAO[v.relacao].texto, SELO_DA_RELACAO[v.relacao].tom));
            if (v.preRelease) titulo.appendChild(buildSelo('Pré-lançamento', 'atencao'));
            info.appendChild(titulo);
            const detalhe = [
              v.publicadaEm ? new Date(v.publicadaEm).toLocaleDateString('pt-BR') : '',
              v.tamanho ? formatarMb(v.tamanho) : '',
              v.instalavel ? '' : 'sem instalador na release',
            ]
              .filter(Boolean)
              .join(' · ');
            info.appendChild(Object.assign(document.createElement('span'), { className: 'aj-campo-dica', textContent: detalhe }));
            if (v.notas.trim()) {
              const notas = document.createElement('details');
              notas.className = 'aj-versao-notas';
              notas.appendChild(Object.assign(document.createElement('summary'), { textContent: 'O que mudou' }));
              notas.appendChild(Object.assign(document.createElement('p'), { textContent: v.notas.trim() }));
              info.appendChild(notas);
            }
            linha.appendChild(info);

            const rotulo = v.relacao === 'anterior' ? 'Voltar para esta' : v.relacao === 'atual' ? 'Reinstalar' : 'Instalar';
            const acao = buildBotao(rotulo, { variante: v.relacao === 'mais-nova' ? 'primario' : 'secundario', icone: ICONE_ATUALIZACAO });
            acao.disabled = !v.instalavel || modo !== 'instalado';
            if (acao.disabled) acao.title = v.instalavel ? 'Só a versão instalada se troca sozinha' : 'A release não tem o instalador e o latest.yml';
            acao.addEventListener('click', () => {
              void instalarVersao(v).then((ok) => {
                if (ok) fechar();
              });
            });
            linha.appendChild(acao);
            lista.appendChild(linha);
          });
          corpo.appendChild(lista);
        })
        .catch((erro: unknown) => {
          corpo.replaceChildren(buildAviso(erro instanceof Error ? erro.message : String(erro), 'erro'));
        });
    },
    { largura: 600, icone: ICONE_ATUALIZACAO, subtitulo: `Instalada agora: ${estado?.versaoAtual ?? '—'}` },
  );
}

function textoDoAviso(e: EstadoAtualizacao): string | null {
  if (e.situacao === 'disponivel' && e.nova) return `Versão ${e.nova.versao} disponível`;
  if (e.situacao === 'baixando') return `Baixando${e.versaoAlvo ? ` ${e.versaoAlvo}` : ''} ${Math.round((e.progresso ?? 0) * 100)}%`;
  if (e.situacao === 'instalando') return 'Instalando…';
  if (e.situacao === 'erro' && e.nova) return 'Atualização com erro';
  return null;
}

/**
 * Ícone no trilho da barra lateral, com ponto de destaque; só existe quando há
 * o que fazer. O texto vai na dica (o trilho não tem espaço para escrever) e o
 * download aparece como uma barrinha embaixo do ícone.
 */
function desenharAviso(): void {
  const texto = estado ? textoDoAviso(estado) : null;
  if (!texto) {
    aviso?.remove();
    aviso = null;
    return;
  }
  if (!aviso) {
    const vaga = document.querySelector('#sidebar .trilho-aviso');
    if (!vaga) return;
    aviso = document.createElement('button');
    aviso.type = 'button';
    aviso.className = 'trilho-item trilho-atualizacao';
    aviso.addEventListener('click', () => abrirAjustes('atualizacoes'));
    vaga.appendChild(aviso);
  }
  aviso.classList.toggle('is-erro', estado?.situacao === 'erro');
  aviso.dataset.dica = texto;
  aviso.setAttribute('aria-label', `${texto} — abrir Atualizações`);
  aviso.innerHTML = svg(ICONE_ATUALIZACAO, 20, 1.8);
  aviso.style.setProperty('--progresso', String(estado?.situacao === 'baixando' ? (estado.progresso ?? 0) : 0));
  aviso.classList.toggle('is-baixando', estado?.situacao === 'baixando');
}
