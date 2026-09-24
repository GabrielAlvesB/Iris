import type { BibliotecaInfo, RecursoDetalhado } from '../../../shared/types/explorador.types';
import { normalizar } from '../../../shared/types/videos.conversao.js';
import { abrirModulo } from '../../core/navegacao.js';
import { openCustomModal } from '../../ui/modal.js';
import { buildBotao, buildBusca, buildSelo, buildVazio, svg } from '../../ui/pagina.js';
import { buildIconeArquivo } from '../explorador/explorador.icones.js';
import { ICONES_POSTAGEM as ICONES_VIDEO } from './postagens.ui.js';

/** O que a seção precisa de uma postagem de qualquer tipo. */
type ComMateriais = { titulo: string; recursoIds: string[] };
type SalvarRecursos = (input: { recursoIds: string[] }) => void;

/**
 * Seção "Materiais" do painel de uma postagem: recursos da Biblioteca anexados
 * por id (nunca cópia de arquivo — a arte de uma imagem, o bruto de um vídeo).
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
export function buildMateriais(video: ComMateriais, salvar: SalvarRecursos): HTMLElement {
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
  const anexar = buildBotao('Anexar', { icone: ICONES_VIDEO.clipe, variante: 'fantasma', titulo: 'Anexar arquivos da Biblioteca' });
  anexar.classList.add('is-mini');
  anexar.addEventListener('click', () => abrirSeletor(video, salvar));
  cabeca.append(rotulo, anexar);
  campo.appendChild(cabeca);

  const lista = document.createElement('div');
  lista.className = 'vd-materiais';
  campo.appendChild(lista);

  const aviso = (erro: unknown): void => {
    lista.prepend(buildSelo(erro instanceof Error ? erro.message : String(erro), 'erro'));
  };

  const desenhar = (bib: BibliotecaInfo | null): void => {
    lista.innerHTML = '';
    const recursos = video.recursoIds
      .map((id) => bib?.recursos.find((r) => r.id === id))
      .filter((r): r is RecursoDetalhado => Boolean(r));
    if (recursos.length === 0) {
      const vazio = document.createElement('span');
      vazio.className = 'vd-vazio-inline';
      vazio.textContent = 'Roteiro, thumbnail, arquivos de edição… anexe da Biblioteca.';
      lista.appendChild(vazio);
      return;
    }
    recursos.forEach((r) =>
      lista.appendChild(
        buildLinha(r, () => salvar({ recursoIds: video.recursoIds.filter((id) => id !== r.id) }), aviso),
      ),
    );
  };

  // Desenha com o cache na hora; se ainda não há cache ou falta algum id, lê de novo.
  desenhar(cache);
  const faltando = video.recursoIds.some((id) => !cache?.recursos.some((r) => r.id === id));
  if (!cache || faltando) void carregar(true).then(desenhar);
  return campo;
}
