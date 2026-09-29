import type { BibliotecaInfo, RecursoDetalhado } from '../../../shared/types/explorador.types';
import type { AnexoPostagem, InfoAnexo } from '../../../shared/types/postagens.types';
import { normalizar } from '../../../shared/types/videos.conversao.js';
import { abrirModulo } from '../../core/navegacao.js';
import { abrirMenuIa } from '../../ui/ia.js';
import { openAvisoModal, openCustomModal } from '../../ui/modal.js';
import { buildBotao, buildBusca, buildSelo, buildVazio, svg } from '../../ui/pagina.js';
import { buildIconeArquivo } from '../explorador/explorador.icones.js';
import { ICONES_POSTAGEM as ICONES_VIDEO } from './postagens.ui.js';

/** O que a seção precisa de uma postagem de qualquer tipo. */
type ComMateriais = { titulo: string; recursoIds: string[]; anexos: AnexoPostagem[] };
type SalvarRecursos = (input: { recursoIds?: string[]; anexos?: AnexoPostagem[] }) => void;

/**
 * Seção "Materiais" do painel de uma postagem, com duas origens:
 * - anexos do computador: o Iris guarda uma cópia (a regra do Sheets), então
 *   serve qualquer pasta e apagar o original não afeta a postagem;
 * - recursos da Biblioteca, por id (nunca cópia — o arquivo continua na pasta
 *   monitorada, bom para o bruto pesado de um vídeo).
 * A Biblioteca é lida direto pela API (não pelo state do Explorador) para os
 * dois módulos não disputarem o mesmo listener.
 */

let cache: BibliotecaInfo | null = null;
let carregando: Promise<BibliotecaInfo | null> | null = null;

async function carregar(forcar = false): Promise<BibliotecaInfo | null> {
  if (cache && !forcar) return cache;
  carregando ??= window.irisAPI.explorador
    .getBiblioteca()
    .then((r) => {
      cache = r.ok ? r.data : null;
      return cache;
    })
    .finally(() => {
      carregando = null;
    });
  return carregando;
}

function mensagemErro(r: { ok: false; error: string }): never {
  throw new Error(r.error);
}

async function abrir(caminho: string): Promise<void> {
  const r = await window.irisAPI.explorador.abrirNoSistema(caminho);
  if (!r.ok) mensagemErro(r);
}

async function revelar(caminho: string): Promise<void> {
  const r = await window.irisAPI.explorador.revelarNoSistema(caminho);
  if (!r.ok) mensagemErro(r);
}

function botao(icone: string, titulo: string, aoClicar: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bb-acao';
  btn.title = titulo;
  btn.setAttribute('aria-label', titulo);
  btn.innerHTML = svg(icone, 13, 2);
  btn.addEventListener('click', aoClicar);
  return btn;
}

function buildLinha(recurso: RecursoDetalhado, remover: () => void, aviso: (e: unknown) => void): HTMLElement {
  const linha = document.createElement('div');
  linha.className = 'vd-material';
  linha.classList.toggle('is-indisponivel', recurso.situacao !== 'ok');
  linha.appendChild(buildIconeArquivo(recurso.caminho, recurso.tipo, 15));

  const nome = document.createElement('button');
  nome.type = 'button';
  nome.className = 'vd-material-nome';
  nome.textContent = recurso.nome;
  nome.title = recurso.situacao === 'ok' ? `Abrir ${recurso.caminho}` : recurso.caminho;
  nome.addEventListener('click', () => {
    if (recurso.situacao === 'ok') void abrir(recurso.caminho).catch(aviso);
  });
  linha.appendChild(nome);

  if (recurso.situacao === 'ausente') linha.appendChild(buildSelo('não encontrado', 'erro'));
  if (recurso.situacao === 'fora') linha.appendChild(buildSelo('pasta não monitorada', 'atencao'));
  if (recurso.situacao === 'ok') {
    linha.appendChild(
      botao('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>', 'Mostrar no Explorer', () =>
        void revelar(recurso.caminho).catch(aviso),
      ),
    );
  }
  linha.appendChild(botao('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 'Desanexar desta postagem', remover));
  return linha;
}

const ICONE_MAIS = '<path d="M12 5v14"/><path d="M5 12h14"/>';
const ICONE_UPLOAD = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>';
const ICONE_PASTA = '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>';
const ICONE_BAIXAR = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>';
const ICONE_XIS = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

async function acaoDeAnexo(pedido: Promise<{ ok: true } | { ok: false; error: string }>): Promise<void> {
  const r = await pedido;
  if (!r.ok) mensagemErro(r);
}

function buildLinhaAnexo(anexo: AnexoPostagem, info: InfoAnexo | undefined, remover: () => void, aviso: (e: unknown) => void): HTMLElement {
  const linha = document.createElement('div');
  linha.className = 'vd-material is-anexo';
  // Sem info ainda (carregando), trata como presente; a falta só aparece quando o main confirma.
  const existe = info?.existe !== false;
  linha.classList.toggle('is-indisponivel', !existe);

  if (info?.miniatura) {
    const mini = document.createElement('img');
    mini.className = 'vd-material-mini';
    mini.src = info.miniatura;
    mini.alt = '';
    linha.appendChild(mini);
  } else {
    linha.appendChild(buildIconeArquivo(anexo.nome, 'arquivo', 15));
  }

  const nome = document.createElement('button');
  nome.type = 'button';
  nome.className = 'vd-material-nome';
  nome.textContent = anexo.nome;
  nome.title = existe ? `Abrir ${anexo.nome} (cópia guardada no Iris)` : anexo.nome;
  nome.addEventListener('click', () => {
    if (existe) void acaoDeAnexo(window.irisAPI.anexos.abrir(anexo)).catch(aviso);
  });
  linha.appendChild(nome);
  linha.appendChild(Object.assign(document.createElement('span'), { className: 'vd-material-meta', textContent: tamanhoLegivel(anexo.tamanho) }));

  if (!existe) {
    linha.appendChild(buildSelo('cópia não encontrada', 'erro'));
  } else {
    linha.appendChild(botao(ICONE_PASTA, 'Mostrar na pasta', () => void acaoDeAnexo(window.irisAPI.anexos.revelar(anexo)).catch(aviso)));
    linha.appendChild(botao(ICONE_BAIXAR, 'Salvar uma cópia…', () => void acaoDeAnexo(window.irisAPI.anexos.exportar(anexo)).catch(aviso)));
  }
  linha.appendChild(botao(ICONE_XIS, 'Desanexar desta postagem', remover));
  return linha;
}

/** Diálogo do sistema → cópias → entram na postagem. Avisa o que ficou de fora. */
async function anexarDoComputador(video: ComMateriais, salvar: SalvarRecursos): Promise<void> {
  const r = await window.irisAPI.anexos.escolher();
  if (!r.ok) {
    await openAvisoModal('Não deu para anexar', r.error, { erro: true });
    return;
  }
  if (r.data.anexos.length) salvar({ anexos: [...video.anexos, ...r.data.anexos] });
  if (r.data.recusados.length) {
    await openAvisoModal(r.data.anexos.length ? 'Alguns arquivos não entraram' : 'Nenhum arquivo entrou', r.data.recusados.join('\n'), { erro: true });
  }
}

function abrirSeletor(video: ComMateriais, salvar: SalvarRecursos): void {
  const anexados = new Set(video.recursoIds);
  let termo = '';

  void openCustomModal(
    'Anexar materiais da Biblioteca',
    ({ corpo, rodape, fechar }) => {
      const info = document.createElement('span');
      info.className = 'md-rodape-info';
      const atualizarInfo = (): void => {
        info.textContent = anexados.size === 1 ? '1 material anexado' : `${anexados.size} materiais anexados`;
      };
      atualizarInfo();
      const pronto = buildBotao('Pronto', { variante: 'primario' });
      pronto.addEventListener('click', fechar);
      rodape.append(info, pronto);

      const desenhar = (bib: BibliotecaInfo): void => {
        corpo.innerHTML = '';
        if (bib.recursos.length === 0) {
          const ir = buildBotao('Abrir Biblioteca', { variante: 'primario' });
          ir.addEventListener('click', () => {
            fechar();
            abrirModulo('explorador');
          });
          corpo.appendChild(
            buildVazio(
              ICONES_VIDEO.clipe,
              'A Biblioteca está vazia',
              'Guarde roteiros, thumbnails e mídias na Biblioteca para anexá-los às postagens.',
              ir,
            ),
          );
          return;
        }

        const busca = buildBusca(termo, 'Filtrar por nome, tag ou coleção…', (v) => {
          termo = v;
          desenhar(bib);
          const input = corpo.querySelector<HTMLInputElement>('.pg-busca input');
          input?.focus();
          input?.setSelectionRange(input.value.length, input.value.length);
        });
        corpo.appendChild(busca);

        const alvo = normalizar(termo);
        const lista = document.createElement('div');
        lista.className = 'vd-seletor';
        const porColecao = new Map<string, RecursoDetalhado[]>();
        bib.recursos
          .filter((r) => {
            const colecao = bib.colecoes.find((c) => c.id === r.colecaoId)?.nome ?? '';
            return !alvo || normalizar([r.nome, r.nota, colecao, ...r.tags].join(' ')).includes(alvo);
          })
          .forEach((r) => {
            const chave = r.colecaoId ?? '';
            porColecao.set(chave, [...(porColecao.get(chave) ?? []), r]);
          });

        [...bib.colecoes.map((c) => ({ id: c.id, nome: c.nome })), { id: '', nome: 'Sem coleção' }].forEach((grupo) => {
          const itens = porColecao.get(grupo.id);
          if (!itens?.length) return;
          const titulo = document.createElement('div');
          titulo.className = 'vd-seletor-grupo';
          titulo.textContent = grupo.nome;
          lista.appendChild(titulo);
          itens.forEach((r) => {
            const item = document.createElement('label');
            item.className = 'vd-seletor-item';
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.checked = anexados.has(r.id);
            check.addEventListener('change', () => {
              if (check.checked) anexados.add(r.id);
              else anexados.delete(r.id);
              atualizarInfo();
              salvar({ recursoIds: [...anexados] });
            });
            const nome = document.createElement('span');
            nome.className = 'vd-seletor-nome';
            nome.textContent = r.nome;
            item.append(check, buildIconeArquivo(r.caminho, r.tipo, 14), nome);
            if (r.situacao !== 'ok') item.appendChild(buildSelo(r.situacao === 'ausente' ? 'não encontrado' : 'fora', 'atencao'));
            lista.appendChild(item);
          });
        });
        if (!lista.childElementCount) {
          const nada = document.createElement('p');
          nada.className = 'vd-vazio-inline';
          nada.textContent = 'Nada bate com o filtro.';
          lista.appendChild(nada);
        }
        corpo.appendChild(lista);
      };

      corpo.textContent = 'Carregando…';
      void carregar(true).then((bib) => {
        if (bib) desenhar(bib);
        else corpo.textContent = 'Não foi possível ler a Biblioteca.';
      });
    },
    {
      largura: 540,
      icone: ICONES_VIDEO.clipe,
      subtitulo: `Arquivos da Biblioteca para "${video.titulo}". Marque para anexar; salva na hora.`,
    },
  );
}

/** Usada pelos painéis de todos os tipos de postagem. */
export function buildMateriais(video: ComMateriais, salvar: SalvarRecursos, extra?: HTMLElement): HTMLElement {
  const campo = document.createElement('div');
  campo.className = 'vd-campo';

  // Mesmo cabeçalho das seções do painel (ícone + título + ação).
  const cabeca = document.createElement('header');
  cabeca.className = 'vd-p-secao-cabeca';
  const marca = document.createElement('span');
  marca.className = 'vd-p-secao-icone';
  marca.innerHTML = svg(ICONES_VIDEO.clipe, 13, 2);
  const rotulo = document.createElement('h3');
  rotulo.textContent = 'Materiais';
  cabeca.appendChild(marca);
  // Um botão só com as duas origens num menu: dois botões lado a lado não
  // cabiam no painel lateral junto do "Thumbnail com IA".
  const anexar = buildBotao('Anexar', { icone: ICONE_MAIS, variante: 'fantasma', titulo: 'Anexar do computador ou da Biblioteca' });
  anexar.classList.add('is-mini', 'vd-materiais-anexar');
  anexar.setAttribute('aria-haspopup', 'menu');
  anexar.addEventListener('click', () =>
    abrirMenuIa(anexar, [
      {
        rotulo: 'Do computador',
        dica: 'Qualquer pasta. O Iris guarda uma cópia: apagar o original não afeta a postagem.',
        icone: ICONE_UPLOAD,
        fazer: () => void anexarDoComputador(video, salvar),
      },
      {
        rotulo: 'Da Biblioteca',
        dica: 'Arquivos das pastas monitoradas, sem cópia.',
        icone: ICONES_VIDEO.clipe,
        fazer: () => abrirSeletor(video, salvar),
      },
    ]),
  );
  // extra: ação de quem monta o painel (ex.: "Thumbnail com IA").
  cabeca.append(rotulo, ...(extra ? [extra] : []), anexar);
  campo.appendChild(cabeca);

  const lista = document.createElement('div');
  lista.className = 'vd-materiais';
  campo.appendChild(lista);

  const aviso = (erro: unknown): void => {
    lista.prepend(buildSelo(erro instanceof Error ? erro.message : String(erro), 'erro'));
  };

  let bibAtual: BibliotecaInfo | null = cache;
  let infos = new Map<string, InfoAnexo>();

  const desenhar = (): void => {
    lista.innerHTML = '';
    const recursos = video.recursoIds
      .map((id) => bibAtual?.recursos.find((r) => r.id === id))
      .filter((r): r is RecursoDetalhado => Boolean(r));
    if (recursos.length === 0 && video.anexos.length === 0) {
      const vazio = document.createElement('span');
      vazio.className = 'vd-vazio-inline';
      vazio.textContent = 'Banner, thumbnail, roteiro, arquivos de edição… anexe do computador ou da Biblioteca.';
      lista.appendChild(vazio);
      return;
    }
    video.anexos.forEach((a) =>
      lista.appendChild(buildLinhaAnexo(a, infos.get(a.id), () => salvar({ anexos: video.anexos.filter((x) => x.id !== a.id) }), aviso)),
    );
    recursos.forEach((r) =>
      lista.appendChild(
        buildLinha(r, () => salvar({ recursoIds: video.recursoIds.filter((id) => id !== r.id) }), aviso),
      ),
    );
  };

  // Desenha com o cache na hora; se ainda não há cache ou falta algum id, lê de novo.
  desenhar();
  const faltando = video.recursoIds.some((id) => !cache?.recursos.some((r) => r.id === id));
  if (!cache || faltando) {
    void carregar(true).then((bib) => {
      bibAtual = bib;
      desenhar();
    });
  }
  // Miniaturas e "a cópia ainda existe?" vêm do main.
  if (video.anexos.length) {
    void window.irisAPI.anexos.info(video.anexos).then((r) => {
      if (!r.ok) return;
      infos = new Map(r.data.map((i) => [i.id, i]));
      desenhar();
    });
  }
  return campo;
}
