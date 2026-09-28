import {
  FORMATOS_IMAGEM_IA,
  descritorDe,
  type ContextoTexto,
  type FormatoImagemIa,
  type IaConfig,
  type ProvedorId,
  type QualidadeImagem,
  type ReferenciaIa,
  type TarefaIa,
  type VinculoPostagem,
} from '../../../shared/types/ia.types.js';
import { carregarConfigIa, gerarTextoIa } from '../../core/ia.js';
import { campo, erroInline, pilulas, textarea } from '../../ui/campos.js';
import { ICONE_IA, abrirSeletorModelo, abrirVariantes, comGeracao, exigirIa } from '../../ui/ia.js';
import { buildSecaoModal, openCustomModal } from '../../ui/modal.js';
import { ICONES, buildBotao, buildBusca, svg } from '../../ui/pagina.js';

/**
 * O formulário de criar imagem: formato, prompt, referências, provedor e
 * quantidade. Usado no Estúdio e no modal "Gerar thumbnail" da postagem —
 * um só lugar decide como se pede uma imagem.
 */

const EXTENSOES_IMAGEM = /\.(png|jpe?g|webp)$/i;
const MAX_REFERENCIAS = 8;

export interface OpcoesCriador {
  /** Formato(s) marcados ao abrir; dá para marcar vários e gerar todos de uma vez. */
  formato?: FormatoImagemIa | FormatoImagemIa[];
  prompt?: string;
  referencias?: ReferenciaIa[];
  postagem?: VinculoPostagem;
  /** Com contexto, "Criar prompt com IA" usa a tarefa de thumbnail da postagem. */
  contextoThumbnail?: () => ContextoTexto;
  aoIniciar: (tarefa: TarefaIa) => void;
}

export interface Criador {
  el: HTMLElement;
  adicionarReferencias(refs: ReferenciaIa[]): void;
  definirPrompt(texto: string): void;
  /** Abre "Pedir ideias" já com o contexto atual (prompt e referências). */
  pedirIdeias(): void;
}

function unwrap<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

export function buildCriador(o: OpcoesCriador): Criador {
  // Vários formatos de uma vez (thumb + feed + story…): cada um vira uma tarefa.
  const formatos = new Set<FormatoImagemIa>(Array.isArray(o.formato) ? o.formato : [o.formato ?? 'thumb-youtube']);
  let referencias: ReferenciaIa[] = [...(o.referencias ?? [])].slice(0, MAX_REFERENCIAS);
  let quantidade = '1';
  let qualidade: QualidadeImagem | '' = '';
  let config: IaConfig | null = null;

  const el = document.createElement('div');
  el.className = 'ia-criador';

  const rotulosFormatos = (): string =>
    FORMATOS_IMAGEM_IA.filter((f) => formatos.has(f.id))
      .map((f) => `${f.rotulo} (${f.proporcao})`)
      .join(', ');

  // ---- Formato ----
  const secaoFormato = buildSecaoModal('Formatos', 'Marque um ou mais: cada formato gera as suas próprias imagens, no tamanho certo.');
  const gradeFormatos = document.createElement('div');
  gradeFormatos.className = 'ia-formatos';
  const desenharFormatos = (): void => {
    gradeFormatos.replaceChildren(
      ...FORMATOS_IMAGEM_IA.map((f) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ia-formato';
        b.classList.toggle('is-ativo', formatos.has(f.id));
        b.setAttribute('aria-pressed', String(formatos.has(f.id)));
        const moldura = document.createElement('span');
        moldura.className = 'ia-formato-moldura';
        const [w, h] = f.proporcao.split(':').map(Number);
        moldura.style.aspectRatio = `${w} / ${h}`;
        b.append(moldura, Object.assign(document.createElement('strong'), { textContent: f.rotulo }), Object.assign(document.createElement('small'), { textContent: `${f.proporcao} · ${f.largura}×${f.altura}` }));
        b.addEventListener('click', () => {
          // Sempre fica ao menos um marcado.
          if (formatos.has(f.id) && formatos.size > 1) formatos.delete(f.id);
          else formatos.add(f.id);
          desenharFormatos();
          atualizarRotuloGerar();
        });
        return b;
      }),
    );
  };
  desenharFormatos();
  secaoFormato.conteudo.appendChild(gradeFormatos);
  el.appendChild(secaoFormato.secao);

  // ---- Prompt ----
  const melhorar = buildBotao(o.contextoThumbnail ? 'Criar prompt com IA' : 'Melhorar prompt', {
    icone: ICONE_IA,
    variante: 'fantasma',
    titulo: o.contextoThumbnail ? 'Escreve o prompt a partir do título e da descrição da postagem' : 'A IA de texto detalha o pedido (e descreve as referências)',
  });
  const ideias = buildBotao('Pedir ideias', {
    icone: ICONE_IA,
    variante: 'fantasma',
    titulo: 'A IA propõe 4 conceitos diferentes para a imagem; escolha um para virar o prompt',
  });
  const acoesPrompt = document.createElement('div');
  acoesPrompt.className = 'ia-prompt-acoes';
  acoesPrompt.append(ideias, melhorar);
  const secaoPrompt = buildSecaoModal('O que você quer ver', 'Descreva a cena, o estilo e o texto que deve aparecer na imagem.', acoesPrompt);
  const prompt = textarea(o.prompt ?? '', 'Ex.: thumbnail com um homem surpreso apontando para um notebook, fundo roxo vibrante, texto grande "3 ERROS"', 5);
  secaoPrompt.conteudo.appendChild(prompt);
  el.appendChild(secaoPrompt.secao);

  melhorar.addEventListener('click', () => {
    void (async () => {
      if (!(await exigirIa('texto'))) return;
      const refs = referencias.map(({ origem, id }) => ({ origem, id }));
      const resposta = await comGeracao(melhorar, () =>
        gerarTextoIa(
          o.contextoThumbnail
            ? { tarefa: 'prompt-thumbnail', contexto: { ...o.contextoThumbnail(), prompt: prompt.value, formato: rotulosFormatos(), referencias: refs } }
            : { tarefa: 'prompt-imagem', contexto: { prompt: prompt.value, formato: rotulosFormatos(), referencias: refs } },
        ),
      );
      if (resposta?.texto) prompt.value = resposta.texto;
    })();
  });

  const pedirIdeias = (): void => {
    void (async () => {
      if (!(await exigirIa('texto'))) return;
      const refs = referencias.map(({ origem, id }) => ({ origem, id }));
      const resposta = await comGeracao(ideias, () =>
        gerarTextoIa({
          tarefa: 'ideias-imagem',
          contexto: { ...(o.contextoThumbnail?.() ?? {}), prompt: prompt.value, formato: rotulosFormatos(), referencias: refs },
        }),
      );
      if (!resposta?.variantes?.length) return;
      abrirVariantes({
        titulo: 'Ideias para a imagem',
        subtitulo: `Gerado por ${resposta.modelo} — "Usar esta" põe a ideia no prompt`,
        variantes: resposta.variantes,
        linhas: (v) => [['Prompt', v.texto ?? v.legenda]],
        copiar: (v) => v.texto ?? v.legenda ?? '',
        aoUsar: (v) => {
          prompt.value = v.texto ?? v.legenda ?? prompt.value;
          prompt.focus();
        },
      });
    })();
  };
  ideias.addEventListener('click', pedirIdeias);

  // ---- Referências ----
  const bandeja = document.createElement('div');
  bandeja.className = 'ia-refs';
  const botoesRef = document.createElement('div');
  botoesRef.className = 'ia-refs-acoes';
  const secaoRefs = buildSecaoModal('Imagens de referência (opcional)', `A IA usa como base: rosto, produto, estilo… Até ${MAX_REFERENCIAS}.`);
  secaoRefs.conteudo.append(bandeja, botoesRef);
  el.appendChild(secaoRefs.secao);

  const desenharRefs = (): void => {
    bandeja.replaceChildren(
      ...referencias.map((ref, i) => {
        const item = document.createElement('div');
        item.className = 'ia-ref';
        item.title = ref.nome;
        if (ref.miniatura) {
          const img = document.createElement('img');
          img.src = ref.miniatura;
          img.alt = ref.nome;
          item.appendChild(img);
        } else {
          item.appendChild(Object.assign(document.createElement('span'), { className: 'ia-ref-nome', textContent: ref.nome }));
        }
        const remover = document.createElement('button');
        remover.type = 'button';
        remover.className = 'ia-ref-remover';
        remover.setAttribute('aria-label', `Tirar ${ref.nome}`);
        remover.innerHTML = svg(ICONES.xis, 12, 2.4);
        remover.addEventListener('click', () => {
          referencias.splice(i, 1);
          desenharRefs();
          atualizarAvisoProvedor();
        });
        item.appendChild(remover);
        return item;
      }),
    );
    if (!referencias.length) bandeja.appendChild(Object.assign(document.createElement('p'), { className: 'md-dica', textContent: 'Nenhuma — a imagem nasce só do texto.' }));
  };

  const adicionarReferencias = (refs: ReferenciaIa[]): void => {
    refs.forEach((r) => {
      if (!referencias.some((x) => x.origem === r.origem && x.id === r.id)) referencias.push(r);
    });
    referencias = referencias.slice(0, MAX_REFERENCIAS);
    desenharRefs();
    atualizarAvisoProvedor();
  };

  const doComputador = buildBotao('Do computador', { icone: ICONES.pasta, variante: 'secundario' });
  doComputador.addEventListener('click', () => {
    void window.irisAPI.ia.referenciasDoComputador().then((r) => {
      if (r.ok) adicionarReferencias(r.data);
      else erroInline(el, new Error(r.error));
    });
  });
  const daBiblioteca = buildBotao('Da Biblioteca', { icone: ICONES.backup, variante: 'secundario' });
  daBiblioteca.addEventListener('click', () => abrirSeletorBiblioteca(adicionarReferencias));
  const daGaleria = buildBotao('Da galeria', { icone: ICONE_IA, variante: 'secundario' });
  daGaleria.addEventListener('click', () => abrirSeletorGaleria(adicionarReferencias));
  botoesRef.append(doComputador, daBiblioteca, daGaleria);
  desenharRefs();

  // ---- Provedor, modelo, quantidade ----
  const secaoMotor = buildSecaoModal('Modelo');
  const provedor = document.createElement('select');
  provedor.className = 'md-input';
  const modelo = document.createElement('input');
  modelo.className = 'md-input';
  modelo.type = 'text';
  const escolherModelo = buildBotao('Escolher', { icone: ICONES.preferencias, variante: 'secundario', titulo: 'Todos os modelos de imagem do provedor, com busca' });
  escolherModelo.addEventListener('click', () => {
    const id = provedor.value as ProvedorId;
    if (!id) return;
    void abrirSeletorModelo(id, 'imagem', modelo.value).then((escolhido) => {
      if (escolhido) modelo.value = escolhido;
    });
  });
  const campoModeloEl = document.createElement('div');
  campoModeloEl.className = 'ia-modelo-campo';
  campoModeloEl.append(modelo, escolherModelo);
  const aviso = document.createElement('p');
  aviso.className = 'md-dica ia-aviso-provedor';
  const linhaMotor = document.createElement('div');
  linhaMotor.className = 'md-grade-2';
  linhaMotor.append(campo('Provedor', provedor), campo('Modelo', campoModeloEl));
  secaoMotor.conteudo.append(linhaMotor, aviso);
  secaoMotor.conteudo.appendChild(
    campo(
      'Quantidade',
      pilulas<string>(['1', '2', '3', '4'].map((n) => ({ id: n, rotulo: n })), () => quantidade, (v) => {
        quantidade = v;
        atualizarRotuloGerar();
      }),
      'Por formato. Cada imagem é cobrada à parte pelo provedor.',
    ),
  );
  secaoMotor.conteudo.appendChild(
    campo(
      'Qualidade',
      pilulas<QualidadeImagem | ''>(
        [
          { id: '', rotulo: 'Padrão' },
          { id: 'baixa', rotulo: 'Rascunho' },
          { id: 'media', rotulo: 'Média' },
          { id: 'alta', rotulo: 'Alta' },
        ],
        () => qualidade,
        (v) => (qualidade = v),
      ),
      'Só os modelos gpt-image da OpenAI usam; os outros ignoram.',
    ),
  );
  el.appendChild(secaoMotor.secao);

  const atualizarAvisoProvedor = (): void => {
    const id = provedor.value as ProvedorId;
    const semRef = referencias.length > 0 && id && !descritorDe(id).capacidades.includes('imagemComReferencia');
    aviso.textContent = semRef ? `${descritorDe(id).rotulo} não usa imagens de referência: elas serão ignoradas.` : '';
  };

  const carregarModelos = (): void => {
    const id = provedor.value as ProvedorId;
    const cfg = config?.provedores.find((p) => p.id === id);
    modelo.value = cfg?.modeloImagem || descritorDe(id).modeloImagemSugerido || '';
    modelo.placeholder = descritorDe(id).modeloImagemSugerido ?? 'nome do modelo de imagem';
    atualizarAvisoProvedor();
  };
  provedor.addEventListener('change', carregarModelos);

  void carregarConfigIa().then((c) => {
    config = c;
    const opcoes = c.provedores.filter((p) => p.configurado && descritorDe(p.id).capacidades.includes('imagem'));
    provedor.replaceChildren(...opcoes.map((p) => Object.assign(document.createElement('option'), { value: p.id, textContent: descritorDe(p.id).rotulo })));
    if (c.imagem && opcoes.some((p) => p.id === c.imagem)) provedor.value = c.imagem;
    if (opcoes.length) carregarModelos();
    else aviso.textContent = 'Nenhum provedor de imagem configurado (o Claude não gera imagem).';
  });

  // ---- Gerar ----
  const gerar = buildBotao('Gerar imagem', { icone: ICONE_IA, variante: 'primario' });
  gerar.classList.add('ia-gerar');
  const atualizarRotuloGerar = (): void => {
    const total = formatos.size * Number(quantidade);
    const rotulo = gerar.querySelector('span');
    if (rotulo) rotulo.textContent = total === 1 ? 'Gerar imagem' : `Gerar ${total} imagens${formatos.size > 1 ? ` (${formatos.size} formatos)` : ''}`;
  };
  gerar.addEventListener('click', () => {
    void (async () => {
      if (!(await exigirIa(referencias.length ? 'imagemComReferencia' : 'imagem'))) return;
      if (!prompt.value.trim()) {
        erroInline(el, new Error('Descreva a imagem que você quer.'));
        prompt.focus();
        return;
      }
      gerar.disabled = true;
      try {
        // Na ordem da tela; cada formato é uma tarefa própria (dá para cancelar só uma).
        for (const f of FORMATOS_IMAGEM_IA.filter((x) => formatos.has(x.id))) {
          const tarefa = unwrap(
            await window.irisAPI.ia.gerarImagem({
              prompt: prompt.value,
              formato: f.id,
              referencias: referencias.map(({ origem, id }) => ({ origem, id })),
              quantidade: Number(quantidade),
              provedor: (provedor.value as ProvedorId) || undefined,
              modelo: modelo.value.trim() || undefined,
              qualidade: qualidade || undefined,
              postagem: o.postagem,
            }),
          );
          o.aoIniciar(tarefa);
        }
        el.querySelector(':scope > .md-erro')?.remove();
      } catch (erro) {
        erroInline(el, erro);
      } finally {
        gerar.disabled = false;
      }
    })();
  });
  el.appendChild(gerar);
  atualizarRotuloGerar();

  return {
    el,
    adicionarReferencias,
    definirPrompt: (texto) => {
      prompt.value = texto;
    },
    pedirIdeias,
  };
}

// ---------- Seletores de referência ----------

/** Recursos de imagem da Biblioteca, com busca; os marcados viram referências. */
export function abrirSeletorBiblioteca(aoEscolher: (refs: ReferenciaIa[]) => void): void {
  void openCustomModal(
    'Imagens da Biblioteca',
    ({ corpo, rodape, fechar }) => {
      const marcados = new Set<string>();
      let busca = '';
      const lista = document.createElement('div');
      lista.className = 'ia-seletor-lista';
      corpo.append(
        buildBusca('', 'Buscar pelo nome, coleção ou tag…', (v) => {
          busca = v;
          desenhar();
        }),
        lista,
      );
      let recursos: Array<{ id: string; nome: string; detalhe: string }> = [];
      const desenhar = (): void => {
        const termo = busca.trim().toLocaleLowerCase('pt-BR');
        const visiveis = recursos.filter((r) => !termo || `${r.nome} ${r.detalhe}`.toLocaleLowerCase('pt-BR').includes(termo));
        lista.replaceChildren(
          ...visiveis.map((r) => {
            const linha = document.createElement('label');
            linha.className = 'ia-seletor-linha';
            const caixa = document.createElement('input');
            caixa.type = 'checkbox';
            caixa.checked = marcados.has(r.id);
            caixa.addEventListener('change', () => {
              if (caixa.checked) marcados.add(r.id);
              else marcados.delete(r.id);
              usar.disabled = !marcados.size;
            });
            const textos = document.createElement('span');
            textos.append(Object.assign(document.createElement('strong'), { textContent: r.nome }), Object.assign(document.createElement('small'), { textContent: r.detalhe }));
            linha.append(caixa, textos);
            return linha;
          }),
        );
        if (!visiveis.length) {
          lista.appendChild(
            Object.assign(document.createElement('p'), {
              className: 'md-vazio',
              textContent: recursos.length ? 'Nada com essa busca.' : 'Nenhuma imagem (PNG, JPG ou WebP) entre os recursos da Biblioteca.',
            }),
          );
        }
      };
      void window.irisAPI.explorador.getBiblioteca().then((r) => {
        if (!r.ok) return;
        const colecao = (id?: string): string => r.data.colecoes.find((c) => c.id === id)?.nome ?? 'Sem coleção';
        recursos = r.data.recursos
          .filter((x) => x.tipo === 'arquivo' && x.situacao === 'ok' && EXTENSOES_IMAGEM.test(x.nome))
          .map((x) => ({ id: x.id, nome: x.nome, detalhe: [colecao(x.colecaoId), ...x.tags.map((t) => `#${t}`)].join(' · ') }));
        desenhar();
      });

      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const usar = buildBotao('Usar como referência', { variante: 'primario', icone: ICONES.check });
      usar.disabled = true;
      usar.addEventListener('click', () => {
        usar.disabled = true;
        void Promise.all([...marcados].map((id) => window.irisAPI.ia.descreverReferencia({ origem: 'biblioteca', id }))).then((rs) => {
          const ok = rs.filter((x): x is { ok: true; data: ReferenciaIa } => x.ok).map((x) => x.data);
          const falha = rs.find((x) => !x.ok);
          if (falha && !falha.ok) erroInline(corpo, new Error(falha.error));
          if (ok.length) aoEscolher(ok);
          if (!falha) fechar();
          else usar.disabled = false;
        });
      });
      rodape.append(cancelar, usar);
    },
    { largura: 560, icone: ICONES.backup, subtitulo: 'Marque as imagens que a IA deve usar como base' },
  );
}

/** Imagens já geradas, para usar de base numa nova. */
export function abrirSeletorGaleria(aoEscolher: (refs: ReferenciaIa[]) => void): void {
  void openCustomModal(
    'Imagens da galeria',
    ({ corpo, rodape, fechar }) => {
      const grade = document.createElement('div');
      grade.className = 'ia-seletor-grade';
      corpo.appendChild(grade);
      const marcados = new Set<string>();
      void window.irisAPI.ia.listarGaleria().then((r) => {
        if (!r.ok) return;
        if (!r.data.length) {
          grade.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: 'A galeria ainda está vazia.' }));
          return;
        }
        r.data.forEach((item) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'ia-seletor-img';
          b.title = item.prompt;
          const img = document.createElement('img');
          img.src = item.miniatura;
          img.alt = item.prompt.slice(0, 80);
          b.appendChild(img);
          b.addEventListener('click', () => {
            if (marcados.has(item.id)) marcados.delete(item.id);
            else marcados.add(item.id);
            b.classList.toggle('is-marcado', marcados.has(item.id));
            usar.disabled = !marcados.size;
          });
          grade.appendChild(b);
        });
      });
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const usar = buildBotao('Usar como referência', { variante: 'primario', icone: ICONES.check });
      usar.disabled = true;
      usar.addEventListener('click', () => {
        void Promise.all([...marcados].map((id) => window.irisAPI.ia.descreverReferencia({ origem: 'galeria', id }))).then((rs) => {
          aoEscolher(rs.filter((x): x is { ok: true; data: ReferenciaIa } => x.ok).map((x) => x.data));
          fechar();
        });
      });
      rodape.append(cancelar, usar);
    },
    { largura: 640, icone: ICONE_IA, subtitulo: 'Clique para marcar' },
  );
}
