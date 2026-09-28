import type { ContextoTexto, TarefaTexto, VarianteTexto } from '../../../shared/types/ia.types.js';
import { gerarTextoIa } from '../../core/ia.js';
import { abrirVariantes, buildBotaoIa, comGeracao, exigirIa } from '../../ui/ia.js';

/**
 * IA dentro do painel da postagem: sugestões de legenda/descrição, CTA e
 * texto alternativo. As sugestões entram nos campos disparando o evento
 * `input` — o mesmo caminho da digitação, então contador, prévia de hashtags
 * e o salvamento automático seguem funcionando sem código extra.
 */

interface CatalogoNomes {
  tags: Array<{ id: string; nome: string }>;
  redes: Array<{ id: string; nome: string }>;
}

/** Nomes das tags e redes marcadas, para a IA saber o tema e onde vai publicar. */
export function nomesDaPostagem(catalogo: CatalogoNomes | null | undefined, p: { tagIds: string[]; redeIds: string[] }): Pick<ContextoTexto, 'tags' | 'redes'> {
  if (!catalogo) return {};
  return {
    tags: catalogo.tags.filter((t) => p.tagIds.includes(t.id)).map((t) => t.nome),
    redes: catalogo.redes.filter((r) => p.redeIds.includes(r.id)).map((r) => r.nome),
  };
}

/** Preenche como se o usuário tivesse digitado. */
export function preencherCampo(el: HTMLInputElement | HTMLTextAreaElement, valor: string): void {
  el.value = valor;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function hashtagsComCerquilha(tags: string[] | undefined): string {
  return (tags ?? []).map((h) => `#${h}`).join(' ');
}

interface OpcoesBotao {
  tarefa: Extract<TarefaTexto, 'legenda-video' | 'legenda-imagem'>;
  contexto: () => ContextoTexto;
  aoUsar: (v: VarianteTexto) => void;
}

/** "Sugerir com IA" no cabeçalho da seção de legenda. */
export function buildSugerirLegenda(o: OpcoesBotao): HTMLButtonElement {
  const video = o.tarefa === 'legenda-video';
  const botao = buildBotaoIa('Sugerir com IA', video ? 'Três opções de descrição e hashtags' : 'Três opções de legenda, CTA e texto alternativo');
  botao.addEventListener('click', () => {
    void (async () => {
      if (!(await exigirIa('texto'))) return;
      const resposta = await comGeracao(botao, () => gerarTextoIa({ tarefa: o.tarefa, contexto: o.contexto() }));
      if (!resposta?.variantes?.length) return;
      abrirVariantes({
        titulo: video ? 'Sugestões de descrição' : 'Sugestões de legenda',
        subtitulo: `Gerado por ${resposta.modelo}`,
        variantes: resposta.variantes,
        linhas: (v) =>
          video
            ? [
                ['Descrição', v.legenda ?? v.texto],
                ['Hashtags', hashtagsComCerquilha(v.hashtags)],
              ]
            : [
                ['Legenda', v.legenda ?? v.texto],
                ['CTA', v.cta],
                ['Texto alternativo', v.textoAlternativo],
              ],
        copiar: (v) => (video ? [v.legenda ?? v.texto ?? '', hashtagsComCerquilha(v.hashtags)].filter(Boolean).join('\n\n') : (v.legenda ?? v.texto ?? '')),
        aoUsar: o.aoUsar,
      });
    })();
  });
  return botao;
}

/** Junta os botões de um cabeçalho de seção (IA + Copiar). */
export function grupoDeAcoes(...botoes: HTMLElement[]): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = 'vd-p-acoes';
  grupo.append(...botoes);
  return grupo;
}

