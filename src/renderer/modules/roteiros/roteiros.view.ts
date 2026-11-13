import { FORMATOS_ROTEIRO, type FormatoRoteiro, type RoteirosFile } from '../../../shared/types/roteiros.types.js';
import { campo, erroInline, input, pilulas, textarea } from '../../ui/campos.js';
import { mensagemDeErro, openAvisoModal, openCustomModal } from '../../ui/modal.js';
import { buildBotao, svg } from '../../ui/pagina.js';
import * as videosState from '../postagens/videos/videos.state.js';
import { ICONES, catalogoTags } from './roteiros.comum.js';
import { abrirEstudio, descarregarEstudio, estudioAberto, fecharEstudio, sincronizarEstudio } from './roteiros.estudio.js';
import { tituloDoTexto } from './roteiros.markdown.js';
import { desenharBiblioteca } from './roteiros.biblioteca.js';
import * as roteirosState from './roteiros.state.js';
import { consumirItemPendente } from '../../core/navegacao.js';
import { ligarAtalhos } from '../../core/atalhos.js';

/**
 * Módulo Roteiros: a biblioteca (pastas, ideias e os roteiros como
 * documentos — roteiros.biblioteca.ts) e a entrada para o Estúdio de roteiro,
 * que ocupa a tela inteira do módulo. Aprovado, o roteiro vira card na
 * primeira coluna do Kanban.
 */

let containerAtual: HTMLElement | null = null;

// ---------- Ciclo de vida ----------

let desligarAtalhos: (() => void) | null = null;

export function montar(viewRoot: HTMLElement): void {
  containerAtual = viewRoot;
  desligarAtalhos = ligarAtalhos({ 'roteiros.novo': () => abrirNovoRoteiro() });
  roteirosState.onStateChange((file) => {
    if (estudioAberto()) sincronizarEstudio(file);
    else redesenhar();
  });
  // As tags são do catálogo de Postagens, que mora no arquivo dos vídeos.
  const catalogo = videosState.getCurrentState() ? Promise.resolve() : videosState.load().then(() => undefined);
  void Promise.all([roteirosState.load(), catalogo]).then(redesenhar).catch(falhou);
}

export function destroy(): void {
  if (estudioAberto()) {
    void descarregarEstudio().finally(fecharEstudio);
  }
  roteirosState.offStateChange();
  desligarAtalhos?.();
  desligarAtalhos = null;
  containerAtual = null;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

function redesenhar(): void {
  const file = roteirosState.getCurrentState();
  if (!containerAtual || !file || estudioAberto()) return;
  desenharBiblioteca(containerAtual, file, {
    abrir: (id) => abrirNoEstudio(id),
    novo: (pastaId) => abrirNovoRoteiro(pastaId),
    checklistPadrao: () => abrirChecklistPadrao(file),
    redesenhar,
  });
  // Busca global: abre o roteiro pedido direto no estúdio.
  const pedido = consumirItemPendente('roteiros', (p) => file.roteiros.some((r) => r.id === p.id));
  if (pedido) abrirNoEstudio(pedido.id);
}

function abrirNoEstudio(id: string, opcoes: { aba?: 'ia' } = {}): void {
  if (!containerAtual) return;
  abrirEstudio(containerAtual, id, () => redesenhar(), opcoes);
}

// ---------- Modais ----------

type Caminho = 'ia' | 'branco' | 'colar';

const CAMINHOS: Array<{ id: Caminho; titulo: string; dica: string; icone: string }> = [
  { id: 'ia', titulo: 'Criar com IA', dica: 'Do tema ao roteiro: a IA propõe ângulos, monta a estrutura e escreve cena por cena.', icone: ICONES.estrela },
  { id: 'branco', titulo: 'Em branco', dica: 'Começa com Gancho, Abertura, Desenvolvimento e CTA vazios para você escrever.', icone: ICONES.cartoes },
  { id: 'colar', titulo: 'Colar ou abrir .md', dica: 'Um roteiro pronto em texto: vira cenas sozinho (tempos, cenas, letreiros e fontes).', icone: ICONES.livre },
];

function abrirNovoRoteiro(pastaId?: string): void {
  let formato: FormatoRoteiro = 'reels';
  let tagIds: string[] = [];
  let caminho: Caminho = 'ia';
  void openCustomModal(
    'Novo roteiro',
    ({ corpo, rodape, fechar }) => {
      const opcoes = document.createElement('div');
      opcoes.className = 'rot-caminhos';
      const titulo = input('text', '', 'Ex.: Xbox demite 268 e muda o futuro de Halo');
      titulo.classList.add('is-grande');
      const tema = textarea('', 'Do que o vídeo trata, em uma ou duas frases — a IA parte daqui.', 3);
      const colar = textarea('', 'Cole aqui o roteiro inteiro — do jeito que você já escreve (com "[0:00 - 0:45] Seção", "[Cena: …]", fontes…).', 9);
      colar.classList.add('rot-colar');
      const arquivo = document.createElement('input');
      arquivo.type = 'file';
      arquivo.accept = '.md,.markdown,.txt';
      arquivo.hidden = true;
      arquivo.addEventListener('change', () => {
        const f = arquivo.files?.[0];
        if (!f) return;
        void f.text().then((t) => {
          colar.value = t;
          if (!titulo.value.trim()) titulo.value = tituloDoTexto(t) ?? f.name.replace(/\.(md|markdown|txt)$/i, '');
        });
      });
      const abrirArquivo = buildBotao('Abrir arquivo .md', { icone: ICONES.exportar, variante: 'fantasma' });
      abrirArquivo.addEventListener('click', () => arquivo.click());

      const campos = document.createElement('div');
      campos.className = 'rot-novo-campos';
      const desenhar = (): void => {
        opcoes.replaceChildren();
        CAMINHOS.forEach((c) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'rot-caminho';
          b.classList.toggle('is-ativo', caminho === c.id);
          b.setAttribute('aria-pressed', String(caminho === c.id));
          b.innerHTML = svg(c.icone, 18, 2);
          b.append(Object.assign(document.createElement('strong'), { textContent: c.titulo }), Object.assign(document.createElement('span'), { textContent: c.dica }));
          b.addEventListener('click', () => {
            caminho = c.id;
            desenhar();
          });
          opcoes.appendChild(b);
        });
        campos.replaceChildren(campo('Título', titulo, caminho === 'colar' ? 'Em branco: usa o "# Título" do texto colado.' : undefined));
        if (caminho === 'ia') campos.appendChild(campo('Tema', tema, 'Você completa o briefing (público, tom, duração) no próximo passo.'));
        if (caminho === 'colar') {
          const linha = document.createElement('div');
          linha.className = 'rot-novo-colar';
          linha.append(colar, abrirArquivo, arquivo);
          campos.appendChild(campo('Roteiro', linha));
        }
        campos.appendChild(
          campo(
            'Formato',
            pilulas<FormatoRoteiro>(
              FORMATOS_ROTEIRO.map((f) => ({ id: f.id, rotulo: f.rotulo })),
              () => formato,
              (v) => (formato = v),
            ),
          ),
        );
        if (catalogoTags().length) {
          const tagsWrap = document.createElement('div');
          const desenharTags = (): void => {
            const grupo = document.createElement('div');
            grupo.className = 'md-pilulas';
            catalogoTags().forEach((t) => {
              const ativo = tagIds.includes(t.id);
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'md-pilula rot-pilula-tag';
              btn.style.setProperty('--cor-tag', t.cor);
              btn.classList.toggle('is-ativa', ativo);
              btn.textContent = t.nome;
              btn.addEventListener('click', () => {
                tagIds = ativo ? tagIds.filter((id) => id !== t.id) : [...tagIds, t.id];
                desenharTags();
              });
              grupo.appendChild(btn);
            });
            tagsWrap.replaceChildren(grupo);
          };
          desenharTags();
          campos.appendChild(campo('Tags / empresa', tagsWrap));
        }
        criarBtn.lastChild!.textContent = caminho === 'ia' ? 'Criar e abrir o assistente' : caminho === 'colar' ? 'Criar a partir do texto' : 'Criar e escrever';
      };

      const criar = async (): Promise<void> => {
        const nome = titulo.value.trim() || (caminho === 'colar' ? tituloDoTexto(colar.value) : undefined) || (caminho === 'ia' ? tema.value.trim().slice(0, 80) : '');
        if (!nome) {
          titulo.focus();
          erroInline(corpo, caminho === 'colar' ? 'Dê um título (ou cole um roteiro que comece com "# Título").' : 'Dê um título ao roteiro.');
          return;
        }
        if (caminho === 'colar' && !colar.value.trim()) {
          colar.focus();
          erroInline(corpo, 'Cole o roteiro (ou abra um arquivo .md).');
          return;
        }
        try {
          const id = await roteirosState.criarRoteiro({
            titulo: nome,
            formato,
            tagIds,
            ...(pastaId ? { pastaId } : {}),
            ...(caminho === 'colar' ? { texto: colar.value } : {}),
            ...(caminho === 'ia' ? { briefing: { tema: tema.value.trim() } } : {}),
          });
          fechar();
          if (id) abrirNoEstudio(id, caminho === 'ia' ? { aba: 'ia' } : {});
        } catch (erro) {
          erroInline(corpo, erro);
        }
      };
      titulo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && caminho !== 'colar') void criar();
      });
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const criarBtn = buildBotao('Criar', { icone: ICONES.mais, variante: 'primario' });
      criarBtn.addEventListener('click', () => void criar());
      rodape.append(cancelar, criarBtn);
      corpo.append(opcoes, campos);
      desenhar();
      titulo.focus();
    },
    { largura: 720, icone: ICONES.roteiro, subtitulo: 'Escolha por onde começar — dá para trocar de caminho no Estúdio a qualquer momento.' },
  );
}

function abrirChecklistPadrao(file: RoteirosFile): void {
  void openCustomModal(
    'Verificação padrão',
    ({ corpo, rodape, fechar }) => {
      const area = textarea(file.checklistPadrao.join('\n'), 'Um item por linha', 8);
      corpo.appendChild(campo('Itens', area, 'Um por linha. Vale para os roteiros criados daqui em diante; os que já existem não mudam.'));
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const salvar = buildBotao('Salvar', { icone: ICONES.check, variante: 'primario' });
      salvar.addEventListener('click', () => {
        void roteirosState
          .salvarChecklistPadrao(area.value.split('\n'))
          .then(fechar)
          .catch((e) => erroInline(corpo, e));
      });
      rodape.append(cancelar, salvar);
    },
    { largura: 520, icone: ICONES.lista, subtitulo: 'A lista que todo roteiro novo traz para ser conferida antes da aprovação.' },
  );
}
