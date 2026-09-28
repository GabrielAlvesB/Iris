import { descritorDe, type Capacidade, type ContextoTexto, type ModeloIa, type ProvedorId, type TarefaTexto, type VarianteTexto } from '../../shared/types/ia.types.js';
import { carregarConfigIa, gerarTextoIa, iaPode } from '../core/ia.js';
import { abrirAjustes, abrirTutorial } from '../core/navegacao.js';
import { empilharCamada, mensagemDeErro, openAvisoModal, openCustomModal } from './modal.js';
import { ICONES, buildBotao, buildBusca, buildSelo, svg } from './pagina.js';

/**
 * Peças de IA usadas dentro das telas (Postagens, Roteiros, Estúdio): o botão
 * com a faísca, o aviso de "configure uma IA primeiro" e o modal de opções.
 */

export const ICONE_IA =
  '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>';

/** Botão pequeno com a faísca, no padrão dos botões de cabeçalho de seção. */
export function buildBotaoIa(rotulo: string, titulo: string): HTMLButtonElement {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'ia-botao';
  botao.title = titulo;
  botao.innerHTML = svg(ICONE_IA, 13, 2);
  const texto = document.createElement('span');
  texto.textContent = rotulo;
  botao.appendChild(texto);
  return botao;
}

/**
 * Confere se há IA para a tarefa; se não, explica e leva a Ajustes ou ao
 * Tutorial. Devolve false quando não dá para seguir.
 */
export async function exigirIa(capacidade: Capacidade): Promise<boolean> {
  let pode = false;
  try {
    pode = iaPode(await carregarConfigIa(true), capacidade);
  } catch (erro) {
    await openAvisoModal('Não deu para ler a configuração de IA', mensagemDeErro(erro), { erro: true });
    return false;
  }
  if (pode) return true;
  const oque =
    capacidade === 'imagem' || capacidade === 'imagemComReferencia'
      ? 'gerar imagens (OpenRouter, OpenAI, Google ou um serviço compatível — o Claude não gera imagem)'
      : 'escrever textos (qualquer um dos provedores serve)';
  await openCustomModal(
    'Configure uma IA primeiro',
    ({ corpo, rodape, fechar }) => {
      const p = document.createElement('p');
      p.className = 'md-mensagem';
      p.textContent = `Para usar este recurso, coloque a chave de uma IA que saiba ${oque}. A chave fica cifrada no seu computador e o custo é cobrado direto pelo provedor.`;
      corpo.appendChild(p);
      const tutorial = buildBotao('Ver tutorial', { variante: 'fantasma', icone: ICONES.tutorial });
      tutorial.addEventListener('click', () => {
        fechar();
        abrirTutorial('ia');
      });
      const ajustes = buildBotao('Configurar IA', { variante: 'primario', icone: ICONE_IA });
      ajustes.addEventListener('click', () => {
        fechar();
        abrirAjustes('ia');
      });
      rodape.append(tutorial, ajustes);
      ajustes.focus();
    },
    { largura: 460, icone: ICONE_IA, classe: 'modal-confirmacao' },
  );
  return false;
}

/**
 * Roda uma ação de IA com o botão em "Gerando…" e mostra o erro num aviso.
 * Devolve undefined se falhou.
 */
export async function comGeracao<T>(botao: HTMLButtonElement, acao: () => Promise<T>): Promise<T | undefined> {
  const conteudo = Array.from(botao.childNodes);
  botao.disabled = true;
  botao.classList.add('is-gerando');
  const texto = document.createElement('span');
  texto.textContent = 'Gerando…';
  botao.replaceChildren(document.createRange().createContextualFragment(svg(ICONE_IA, 13, 2)), texto);
  try {
    return await acao();
  } catch (erro) {
    await openAvisoModal('A IA não conseguiu', mensagemDeErro(erro), { erro: true });
    return undefined;
  } finally {
    botao.disabled = false;
    botao.classList.remove('is-gerando');
    botao.replaceChildren(...conteudo);
  }
}

export interface OpcoesVariantes {
  titulo: string;
  subtitulo?: string;
  variantes: VarianteTexto[];
  /** Linhas mostradas em cada cartão: [rótulo, valor]. */
  linhas: (v: VarianteTexto) => Array<[string, string | undefined]>;
  /** Texto copiado pelo botão Copiar. */
  copiar: (v: VarianteTexto) => string;
  aoUsar: (v: VarianteTexto) => void;
}

/** Modal com as opções da IA, cada uma com Usar e Copiar. */
export function abrirVariantes(o: OpcoesVariantes): void {
  void openCustomModal(
    o.titulo,
    ({ corpo, rodape, fechar }) => {
      const lista = document.createElement('div');
      lista.className = 'ia-variantes';
      o.variantes.forEach((v, i) => {
        const cartao = document.createElement('article');
        cartao.className = 'ia-variante';
        const cab = document.createElement('header');
        cab.className = 'ia-variante-cab';
        cab.appendChild(Object.assign(document.createElement('strong'), { textContent: v.titulo || `Opção ${i + 1}` }));
        const acoes = document.createElement('div');
        acoes.className = 'ia-variante-acoes';
        const copiar = buildBotao('Copiar', { variante: 'fantasma', icone: ICONES.copiar });
        copiar.addEventListener('click', () => {
          void navigator.clipboard.writeText(o.copiar(v)).then(() => {
            copiar.querySelector('span')!.textContent = 'Copiado';
          });
        });
        const usar = buildBotao('Usar esta', { variante: 'primario', icone: ICONES.check });
        usar.addEventListener('click', () => {
          o.aoUsar(v);
          fechar();
        });
        acoes.append(copiar, usar);
        cab.appendChild(acoes);
        cartao.appendChild(cab);
        o.linhas(v).forEach(([rotulo, valor]) => {
          if (!valor) return;
          const bloco = document.createElement('div');
          bloco.className = 'ia-variante-linha';
          bloco.appendChild(Object.assign(document.createElement('span'), { className: 'ia-variante-rotulo', textContent: rotulo }));
          bloco.appendChild(Object.assign(document.createElement('p'), { textContent: valor }));
          cartao.appendChild(bloco);
        });
        lista.appendChild(cartao);
      });
      corpo.appendChild(lista);
      const fecharBtn = buildBotao('Fechar', { variante: 'fantasma' });
      fecharBtn.addEventListener('click', fechar);
      rodape.appendChild(fecharBtn);
    },
    { largura: 640, icone: ICONE_IA, subtitulo: o.subtitulo },
  );
}

/**
 * Mostra um texto gerado para o usuário decidir. `montarPrevia` desenha o
 * conteúdo (ex.: roteiro renderizado). Resolve com a escolha.
 */
export function confirmarTextoGerado(
  titulo: string,
  subtitulo: string,
  montarPrevia: (alvo: HTMLElement) => void,
  botoes: Array<{ id: string; rotulo: string; primario?: boolean }>,
): Promise<string | null> {
  return new Promise((resolve) => {
    let escolha: string | null = null;
    void openCustomModal(
      titulo,
      ({ corpo, rodape, fechar }) => {
        const previa = document.createElement('div');
        previa.className = 'ia-previa';
        montarPrevia(previa);
        corpo.appendChild(previa);
        const descartar = buildBotao('Descartar', { variante: 'fantasma' });
        descartar.addEventListener('click', fechar);
        rodape.appendChild(descartar);
        botoes.forEach((b) => {
          const btn = buildBotao(b.rotulo, { variante: b.primario ? 'primario' : 'secundario' });
          btn.addEventListener('click', () => {
            escolha = b.id;
            fechar();
          });
          rodape.appendChild(btn);
        });
      },
      { largura: 760, icone: ICONE_IA, subtitulo, aoFechar: () => resolve(escolha) },
    );
  });
}

// ---------- Seletor de modelo ----------

function formatarPreco(v: number | undefined): string {
  if (v === undefined) return '';
  if (v === 0) return 'grátis';
  return `US$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 1 ? 3 : 2 })}`;
}

/**
 * Lista completa dos modelos do provedor, com busca, filtro e rolagem — o
 * <datalist> do Chromium não rola direito com centenas de itens (OpenRouter).
 * Resolve com o id escolhido, ou null.
 */
export function abrirSeletorModelo(
  provedor: ProvedorId,
  tipo: 'texto' | 'imagem',
  atual: string,
  buscaInicial = '',
): Promise<string | null> {
  return new Promise((resolve) => {
    let escolhido: string | null = null;
    void openCustomModal(
      tipo === 'imagem' ? 'Escolher modelo de imagem' : 'Escolher modelo de texto',
      ({ corpo, rodape, fechar }) => {
        let busca = buscaInicial;
        let filtro: 'tipo' | 'todos' = 'tipo';
        let modelos: ModeloIa[] = [];

        const barra = document.createElement('div');
        barra.className = 'ia-modelos-barra';
        const campoBusca = buildBusca(busca, 'Buscar pelo nome ou id (ex.: claude, gemini, gpt)…', (v) => {
          busca = v;
          desenhar();
        });
        const alternar = document.createElement('label');
        alternar.className = 'ia-modelos-todos';
        const caixa = document.createElement('input');
        caixa.type = 'checkbox';
        caixa.addEventListener('change', () => {
          filtro = caixa.checked ? 'todos' : 'tipo';
          desenhar();
        });
        alternar.append(caixa, document.createTextNode(tipo === 'imagem' ? 'Mostrar também os que não geram imagem' : 'Mostrar também os de imagem'));
        barra.append(campoBusca, alternar);

        const contagem = document.createElement('p');
        contagem.className = 'md-dica';
        const lista = document.createElement('div');
        lista.className = 'ia-modelos-lista';
        lista.setAttribute('role', 'listbox');
        lista.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: 'Carregando a lista do provedor…' }));
        corpo.append(barra, contagem, lista);

        const desenhar = (): void => {
          const termos = busca.trim().toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean);
          const visiveis = modelos.filter(
            (m) =>
              (filtro === 'todos' || (tipo === 'imagem' ? m.geraImagem : !m.geraImagem)) &&
              termos.every((t) => `${m.id} ${m.nome}`.toLocaleLowerCase('pt-BR').includes(t)),
          );
          contagem.textContent = `${visiveis.length} de ${modelos.length} modelos`;
          lista.replaceChildren(
            ...visiveis.slice(0, 400).map((m) => {
              const linha = document.createElement('button');
              linha.type = 'button';
              linha.className = 'ia-modelo';
              linha.setAttribute('role', 'option');
              linha.classList.toggle('is-atual', m.id === atual);
              const topo = document.createElement('div');
              topo.className = 'ia-modelo-topo';
              topo.appendChild(Object.assign(document.createElement('strong'), { textContent: m.nome }));
              if (m.id === atual) topo.appendChild(buildSelo('Em uso', 'ok'));
              if (m.geraImagem) topo.appendChild(buildSelo('Gera imagem', 'neutro'));
              linha.appendChild(topo);
              linha.appendChild(Object.assign(document.createElement('code'), { className: 'ia-modelo-id', textContent: m.id }));
              const detalhes = [
                m.contexto ? `${Math.round(m.contexto / 1000).toLocaleString('pt-BR')} mil tokens de contexto` : '',
                m.precoEntrada !== undefined ? `entrada ${formatarPreco(m.precoEntrada)}/1M` : '',
                m.precoSaida !== undefined ? `saída ${formatarPreco(m.precoSaida)}/1M` : '',
              ].filter(Boolean);
              if (detalhes.length) linha.appendChild(Object.assign(document.createElement('span'), { className: 'ia-modelo-detalhe', textContent: detalhes.join(' · ') }));
              if (m.descricao) linha.appendChild(Object.assign(document.createElement('span'), { className: 'ia-modelo-descricao', textContent: m.descricao }));
              linha.addEventListener('click', () => {
                escolhido = m.id;
                fechar();
              });
              return linha;
            }),
          );
          if (!visiveis.length) {
            lista.appendChild(
              Object.assign(document.createElement('p'), {
                className: 'md-vazio',
                textContent: modelos.length ? 'Nenhum modelo com essa busca. Marque "mostrar também" ou mude o termo.' : 'O provedor não devolveu modelos.',
              }),
            );
          }
        };

        void window.irisAPI.ia.listarModelos(provedor).then((r) => {
          if (!r.ok) {
            lista.replaceChildren(Object.assign(document.createElement('p'), { className: 'md-erro', textContent: `${r.error} — salve e teste a chave primeiro.` }));
            return;
          }
          modelos = r.data;
          desenhar();
        });

        const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
        cancelar.addEventListener('click', fechar);
        rodape.appendChild(cancelar);
        campoBusca.querySelector('input')?.focus();
      },
      { largura: 720, icone: ICONE_IA, subtitulo: descritorDe(provedor).rotulo, aoFechar: () => resolve(escolhido) },
    );
  });
}

// ---------- Menu de ações de IA ----------

export interface AcaoMenuIa {
  rotulo: string;
  dica: string;
  fazer: () => void;
}

/** Menu flutuante ancorado num botão (o mesmo desenho do menu dos Roteiros). */
export function abrirMenuIa(ancora: HTMLElement, acoes: AcaoMenuIa[]): void {
  const menu = document.createElement('div');
  menu.className = 'ia-menu';
  menu.setAttribute('role', 'menu');
  let fechar = (): void => undefined;
  acoes.forEach((a) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'ia-menu-item';
    item.setAttribute('role', 'menuitem');
    // Sem isto o mousedown tira o foco (e a seleção) do campo antes do clique.
    item.addEventListener('mousedown', (e) => e.preventDefault());
    const icone = document.createElement('span');
    icone.className = 'ia-menu-icone';
    icone.innerHTML = svg(ICONE_IA, 13, 2);
    const textos = document.createElement('span');
    textos.className = 'ia-menu-textos';
    textos.append(Object.assign(document.createElement('strong'), { textContent: a.rotulo }), Object.assign(document.createElement('small'), { textContent: a.dica }));
    item.append(icone, textos);
    item.addEventListener('click', () => {
      fechar();
      a.fazer();
    });
    menu.appendChild(item);
  });
  document.body.appendChild(menu);
  const r = ancora.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth))}px`;
  menu.style.top = `${r.bottom + 6 + menu.offsetHeight > window.innerHeight ? Math.max(8, r.top - menu.offsetHeight - 6) : r.bottom + 6}px`;
  const fora = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node) && !ancora.contains(e.target as Node)) fechar();
  };
  const desempilhar = empilharCamada(menu, () => fechar());
  fechar = () => {
    desempilhar();
    document.removeEventListener('mousedown', fora, true);
    menu.remove();
  };
  document.addEventListener('mousedown', fora, true);
}

// ---------- Assistente de campo de texto ----------

export interface OpcoesAssistente {
  /** A área do app ("Relatório de resultados", "Kanban"). */
  area: string;
  /** O campo ("Próximos passos", "Descrição do card"). */
  campo: string;
  /** Contexto extra, lido na hora do clique (o resto do documento, o título…). */
  contexto?: () => ContextoTexto;
  /** "Desenvolver" no lugar de "Resumir" (post-its, ideias curtas). */
  desenvolver?: boolean;
}

function previaTexto(texto: string): (alvo: HTMLElement) => void {
  return (alvo) => {
    alvo.classList.add('ia-previa-texto');
    alvo.textContent = texto;
  };
}

function aplicarNoCampo(campo: HTMLTextAreaElement | HTMLInputElement, valor: string): void {
  campo.value = valor;
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}

type TarefaDeCampo = Extract<TarefaTexto, 'texto-escrever' | 'texto-melhorar' | 'texto-desenvolver' | 'texto-resumir'>;

/**
 * Pede um texto à IA para o campo, mostra a prévia e devolve o texto aceito
 * com o modo (substituir/acrescentar) — ou null. `aplicar` recebe o novo valor.
 */
export async function textoComIa(
  botao: HTMLButtonElement,
  atual: string,
  tarefa: TarefaDeCampo,
  o: OpcoesAssistente,
  aplicar: (valor: string) => void,
): Promise<void> {
  if (tarefa !== 'texto-escrever' && !atual.trim()) {
    await openAvisoModal('Campo vazio', 'Escreva algo primeiro, ou use "Escrever com IA".');
    return;
  }
  if (!(await exigirIa('texto'))) return;
  const r = await comGeracao(botao, () => gerarTextoIa({ tarefa, contexto: { area: o.area, campo: o.campo, ...(o.contexto?.() ?? {}), texto: atual } }));
  if (!r?.texto) return;
  const temTexto = Boolean(atual.trim());
  const escolha = await confirmarTextoGerado(
    o.campo,
    `Gerado por ${r.modelo} — confira antes de usar`,
    previaTexto(r.texto),
    temTexto && tarefa !== 'texto-melhorar' && tarefa !== 'texto-resumir'
      ? [
          { id: 'fim', rotulo: 'Acrescentar no fim' },
          { id: 'trocar', rotulo: 'Substituir', primario: true },
        ]
      : [{ id: 'trocar', rotulo: temTexto ? 'Substituir o texto' : 'Usar', primario: true }],
  );
  if (escolha === 'trocar') aplicar(r.texto);
  else if (escolha === 'fim') aplicar(`${atual.trimEnd()}\n\n${r.texto}`);
}

/** As três ações do assistente, para montar em qualquer botão. */
export function acoesDeTexto(botao: HTMLButtonElement, atual: () => string, o: OpcoesAssistente, aplicar: (valor: string) => void): AcaoMenuIa[] {
  return [
    { rotulo: 'Escrever com IA', dica: 'Um texto para este campo, a partir do contexto', fazer: () => void textoComIa(botao, atual(), 'texto-escrever', o, aplicar) },
    { rotulo: 'Melhorar o texto', dica: 'Português, clareza e ritmo, sem mudar o sentido', fazer: () => void textoComIa(botao, atual(), 'texto-melhorar', o, aplicar) },
    o.desenvolver
      ? { rotulo: 'Desenvolver a ideia', dica: 'Transforma uma nota curta em algo completo', fazer: () => void textoComIa(botao, atual(), 'texto-desenvolver', o, aplicar) }
      : { rotulo: 'Resumir', dica: 'O essencial em poucas linhas', fazer: () => void textoComIa(botao, atual(), 'texto-resumir', o, aplicar) },
  ];
}

/**
 * Envolve um campo de texto com o botão de IA no canto (Escrever, Melhorar,
 * Resumir/Desenvolver). Devolve o elemento que entra no lugar do campo; o
 * texto aceito entra disparando `input`, como se fosse digitado.
 */
export function comAssistente(campo: HTMLTextAreaElement, o: OpcoesAssistente): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'ia-campo';
  const botao = buildBotaoIa('IA', `Escrever, melhorar ou ${o.desenvolver ? 'desenvolver' : 'resumir'} com IA`);
  botao.classList.add('ia-campo-botao');
  botao.addEventListener('mousedown', (e) => e.preventDefault());
  botao.addEventListener('click', () => abrirMenuIa(botao, acoesDeTexto(botao, () => campo.value, o, (valor) => aplicarNoCampo(campo, valor))));
  wrap.append(campo, botao);
  return wrap;
}

// ---------- Itens sugeridos (checklist, subtarefas) ----------

/** Pede itens à IA (lista-itens) e deixa escolher quais entram. */
export async function sugerirItensComIa(botao: HTMLButtonElement, contexto: ContextoTexto, titulo: string): Promise<string[]> {
  if (!(await exigirIa('texto'))) return [];
  const r = await comGeracao(botao, () => gerarTextoIa({ tarefa: 'lista-itens', contexto }));
  if (!r?.itens?.length) return [];
  return escolherItens(titulo, r.itens, `Gerado por ${r.modelo} — desmarque o que não quiser`);
}

/** Modal com os itens sugeridos, todos marcados; devolve os que ficaram marcados. */
export function escolherItens(titulo: string, itens: string[], subtitulo?: string): Promise<string[]> {
  return new Promise((resolve) => {
    let escolhidos: string[] = [];
    void openCustomModal(
      titulo,
      ({ corpo, rodape, fechar }) => {
        const marcados = new Set(itens.map((_, i) => i));
        const lista = document.createElement('div');
        lista.className = 'ia-itens';
        const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
        cancelar.addEventListener('click', fechar);
        const usar = buildBotao(`Adicionar ${itens.length}`, { variante: 'primario', icone: ICONES.check });
        usar.addEventListener('click', () => {
          escolhidos = itens.filter((_, i) => marcados.has(i));
          fechar();
        });
        itens.forEach((texto, i) => {
          const linha = document.createElement('label');
          linha.className = 'ia-item-sugerido';
          const caixa = document.createElement('input');
          caixa.type = 'checkbox';
          caixa.checked = true;
          caixa.addEventListener('change', () => {
            if (caixa.checked) marcados.add(i);
            else marcados.delete(i);
            usar.querySelector('span')!.textContent = `Adicionar ${marcados.size}`;
            usar.disabled = !marcados.size;
          });
          linha.append(caixa, Object.assign(document.createElement('span'), { textContent: texto }));
          lista.appendChild(linha);
        });
        corpo.appendChild(lista);
        rodape.append(cancelar, usar);
      },
      { largura: 520, icone: ICONE_IA, subtitulo: subtitulo ?? 'Desmarque o que não quiser', aoFechar: () => resolve(escolhidos) },
    );
  });
}
