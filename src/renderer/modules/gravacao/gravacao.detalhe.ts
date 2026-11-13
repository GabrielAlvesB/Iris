import { formatarRelogio, rotuloDaMarca, takesEmOrdem, type SessaoGravacao, type TakeGravacao } from '../../../shared/types/gravacao.types.js';
import { campo, input, textarea } from '../../ui/campos.js';
import { mensagemDeErro, openAvisoModal, openConfirmModal, openCustomModal } from '../../ui/modal.js';
import { buildBotao, buildVazio, svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { ICONE_PESSOAS } from './gravacao.convite.js';
import * as gravacaoState from './gravacao.state.js';

/**
 * Uma gravação aberta: os takes com as marcas, o melhor take, exportar para a
 * edição e gravar mais. Edita uma cópia e salva a cada mudança.
 */

const ICONES = {
  estrela: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  lixeira: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  gravar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/>',
};

export interface OpcoesDetalhe {
  /** Fecha esta janela e abre o palco desta gravação. */
  gravarMais(sessao: SessaoGravacao): void;
}

export function quandoFoi(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (mesmoDia(d, hoje)) return `hoje, ${hora}`;
  if (mesmoDia(d, ontem)) return `ontem, ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}, ${hora}`;
}

function buildTake(s: SessaoGravacao, take: TakeGravacao, salvar: () => void): HTMLElement {
  const art = document.createElement('article');
  art.className = 'gv-take';
  art.classList.toggle('is-melhor', take.melhor);
  const cab = document.createElement('div');
  cab.className = 'gv-take-cab';
  const cena = s.roteiro?.cenas.find((c) => c.id === take.cenaId)?.titulo;
  const titulo = document.createElement('div');
  titulo.className = 'gv-take-titulo';
  titulo.append(Object.assign(document.createElement('strong'), { textContent: `Take ${take.numero}` }));
  if (cena) titulo.append(Object.assign(document.createElement('span'), { textContent: cena }));
  cab.append(
    titulo,
    Object.assign(document.createElement('span'), {
      className: 'gv-take-info',
      textContent: `${take.duracaoMs ? formatarRelogio(take.duracaoMs) : '—'} · bipe às ${new Date(take.inicioEm).toLocaleTimeString('pt-BR')}`,
    }),
  );
  const melhor = document.createElement('button');
  melhor.type = 'button';
  melhor.className = 'gv-melhor';
  melhor.setAttribute('aria-pressed', String(take.melhor));
  melhor.innerHTML = svg(ICONES.estrela, 13, 2);
  melhor.append(take.melhor ? 'Melhor take' : 'Este é o melhor');
  melhor.addEventListener('click', () => {
    const vira = !take.melhor;
    s.takes.forEach((t) => (t.melhor = false));
    take.melhor = vira;
    salvar();
  });
  const tirar = document.createElement('button');
  tirar.type = 'button';
  tirar.className = 'gv-icone-btn';
  tirar.title = 'Apagar este take';
  tirar.setAttribute('aria-label', `Apagar take ${take.numero}`);
  tirar.innerHTML = svg(ICONES.lixeira, 14, 2);
  tirar.addEventListener('click', () => {
    s.takes = s.takes.filter((t) => t !== take);
    salvar();
  });
  cab.append(melhor, tirar);
  art.appendChild(cab);
  if (take.marcas.length) {
    const ol = document.createElement('ol');
    ol.className = 'gv-marcas';
    take.marcas.forEach((m) => {
      const li = document.createElement('li');
      li.className = `is-${m.tipo}`;
      li.append(
        Object.assign(document.createElement('span'), { className: 'gv-marca-t', textContent: formatarRelogio(m.tMs) }),
        Object.assign(document.createElement('span'), { className: 'gv-marca-tipo', textContent: rotuloDaMarca(m.tipo) }),
      );
      if (m.texto) li.appendChild(Object.assign(document.createElement('span'), { textContent: m.texto }));
      ol.appendChild(li);
    });
    art.appendChild(ol);
  }
  return art;
}

export function abrirDetalhe(original: SessaoGravacao, op: OpcoesDetalhe): void {
  const s = structuredClone(original);
  let salvando: Promise<void> = Promise.resolve();
  const salvarJa = (): void => {
    const copia = structuredClone(s);
    salvando = salvando.then(() => gravacaoState.salvarSilencioso(copia)).catch((e: unknown) => void openAvisoModal('Não salvou', mensagemDeErro(e), { erro: true }));
  };

  void openCustomModal(
    s.titulo,
    ({ corpo, rodape, fechar }) => {
      const desenhar = (): void => {
        corpo.replaceChildren();
        const titulo = input('text', s.titulo, 'Nome da gravação');
        titulo.addEventListener('change', () => {
          s.titulo = titulo.value.trim() || s.titulo;
          salvarJa();
        });
        corpo.appendChild(campo('Nome', titulo));

        const meta = document.createElement('p');
        meta.className = 'gv-detalhe-meta';
        if (s.conjunta) {
          meta.innerHTML = svg(ICONE_PESSOAS, 13, 2);
          meta.append(`Com ${s.conjunta.parceiro} · `);
        }
        meta.append([s.roteiro ? `Roteiro "${s.roteiro.titulo}"` : 'Sem roteiro', quandoFoi(s.createdAt)].join(' · '));
        corpo.appendChild(meta);

        const takes = takesEmOrdem(s);
        const titTakes = document.createElement('h3');
        titTakes.className = 'gv-detalhe-sub';
        titTakes.textContent = takes.length ? `${takes.length} take${takes.length === 1 ? '' : 's'}` : 'Takes';
        corpo.appendChild(titTakes);
        if (!takes.length) {
          corpo.appendChild(buildVazio(ICONES.gravar, 'Nenhum take ainda', 'Os takes aparecem aqui com as marcas (bom, erro, repetir, notas) no tempo em que aconteceram.'));
        } else {
          const lista = document.createElement('div');
          lista.className = 'gv-takes';
          takes.forEach((t) =>
            lista.appendChild(
              buildTake(s, t, () => {
                salvarJa();
                desenhar();
              }),
            ),
          );
          corpo.appendChild(lista);
        }

        const notas = textarea(s.notas, 'Anotações para a edição: o que cortar, onde entra a trilha…', 3);
        notas.addEventListener('change', () => {
          s.notas = notas.value;
          salvarJa();
        });
        corpo.appendChild(campo('Notas', notas));
      };
      desenhar();

      const excluir = buildBotao('', { icone: ICONES.lixeira, variante: 'fantasma', titulo: 'Excluir gravação' });
      excluir.addEventListener('click', async () => {
        if (!(await openConfirmModal({ message: `Excluir "${s.titulo}" e os takes anotados? Dá para desfazer logo depois (Alt+Z).` }))) return;
        await salvando;
        fechar();
        await gravacaoState.excluirSessao(s.id).catch((e: unknown) => openAvisoModal('Não deu certo', mensagemDeErro(e), { erro: true }));
      });
      const exportar = (formato: 'txt' | 'csv'): void => {
        if (!s.takes.length) {
          mostrarToast('Ainda não há takes para exportar.');
          return;
        }
        void salvando
          .then(() => gravacaoState.exportarMarcadores(s.id, formato))
          .then((caminho) => caminho && mostrarToast('Marcadores exportados.'))
          .catch((e: unknown) => openAvisoModal('Não deu certo', mensagemDeErro(e), { erro: true }));
      };
      const txt = buildBotao('Marcadores', { icone: ICONES.baixar, variante: 'fantasma', titulo: 'Texto com cada take e as marcas, para ler na edição' });
      txt.addEventListener('click', () => exportar('txt'));
      const csv = buildBotao('CSV', { icone: ICONES.baixar, variante: 'fantasma', titulo: 'Planilha com uma linha por marca' });
      csv.addEventListener('click', () => exportar('csv'));
      const espaco = document.createElement('span');
      espaco.className = 'pg-espaco';
      const convidado = s.conjunta?.papel === 'convidado';
      const mais = buildBotao(convidado ? 'Abrir o palco' : 'Gravar mais', {
        icone: ICONES.gravar,
        variante: 'primario',
        titulo: convidado ? `O próximo take começa quando ${s.conjunta!.parceiro} mandar o convite` : 'Abre o palco nesta gravação',
      });
      mais.addEventListener('click', async () => {
        await salvando;
        fechar();
        op.gravarMais(s);
      });
      rodape.append(excluir, txt, csv, espaco, mais);
    },
    {
      largura: 640,
      classe: 'gv-detalhe',
      icone: s.conjunta ? ICONE_PESSOAS : ICONES.gravar,
      subtitulo: s.conjunta ? `Gravação com ${s.conjunta.parceiro}` : 'Gravação',
      aoFechar: () => {
        // Volta a lista com o que mudou aqui (melhor take, nome).
        void salvando.then(() => gravacaoState.load()).catch(() => undefined);
      },
    },
  );
}
