import { MODULOS, type ModuloId } from '../../shared/types/modulos.types.js';
import type { ItemBusca } from '../../shared/types/busca.types';
import { empilharCamada } from '../ui/modal.js';
import { ICONE_DO_MODULO } from './sidebar.js';
import {
  SECOES_AJUSTES,
  abrirAjustes,
  abrirAlvo,
  abrirModulo,
  abrirPostagem,
  abrirTutorial,
  type GuiaId,
} from './navegacao.js';
import { buildTeclas } from '../ui/pagina.js';
import { mostrarToast } from '../ui/toast.js';
import { comboDe, executarAcao, textoDoCombo } from './atalhos.js';
import { CATALOGO_ATALHOS, idIrPara } from './atalhos.catalogo.js';
import { temaEfetivo } from './tema.js';

/**
 * Busca e comandos (Ctrl+K, ou Ctrl+P): módulos, seções de Ajustes, guias do Tutorial,
 * os comandos (toda ação do catálogo de atalhos e alguns daqui — ">" mostra só eles) e — pelo
 * índice que o main monta na hora (busca:indice) — o conteúdo de tudo: cards,
 * checklists, blocos do Quadro, post-its, arquivos da Biblioteca, postagens,
 * linhas do Sheets, roteiros, links, textos do Copy e contatos. Carregada só no
 * primeiro uso, pela barra lateral.
 *
 * O overlay usa a classe modal-overlay de propósito: `haModalAberto()` passa a
 * calar os atalhos das telas (Ctrl+N do Kanban, N dos Pensamentos) enquanto
 * ela está aberta.
 */

type TipoOpcao = 'Módulo' | 'Ajustes' | 'Tutorial' | 'Ação' | ItemBusca['tipo'];

interface Opcao {
  tipo: TipoOpcao;
  rotulo: string;
  detalhe: string;
  icone: string;
  /** Texto extra só para a busca (sinônimos, conteúdo do item). */
  termos: string;
  ir: () => void;
  /** Id da ação no catálogo de atalhos: a tecla de agora aparece à direita. */
  atalho?: string;
  /** Comandos: chave estável para a lista "Usados por último". */
  chave?: string;
}

/** Nome do grupo na lista e a ordem de desempate entre grupos com a mesma nota. */
const GRUPOS: Record<TipoOpcao, { nome: string; peso: number }> = {
  Módulo: { nome: 'Módulos', peso: 0.5 },
  Contato: { nome: 'Contatos', peso: 0.4 },
  Card: { nome: 'Cards do Kanban', peso: 0.35 },
  Checklist: { nome: 'Checklists do To-do', peso: 0.35 },
  Postagem: { nome: 'Postagens', peso: 0.35 },
  Roteiro: { nome: 'Roteiros', peso: 0.3 },
  Ajustes: { nome: 'Ajustes', peso: 0.3 },
  Ação: { nome: 'Comandos', peso: 0.45 },
  Bloco: { nome: 'Quadro', peso: 0.25 },
  'Post-it': { nome: 'Pensamentos', peso: 0.25 },
  Arquivo: { nome: 'Biblioteca', peso: 0.25 },
  Linha: { nome: 'Linhas do Sheets', peso: 0.2 },
  Texto: { nome: 'Copy', peso: 0.2 },
  Link: { nome: 'Links rápidos', peso: 0.2 },
  Tutorial: { nome: 'Tutorial', peso: 0 },
};

/** Por grupo, com a busca preenchida; "Ver todos" abre o grupo até o teto. */
const POR_GRUPO = 5;
const TETO_DO_GRUPO = 60;

const ICONE_GUIA = ICONE_DO_MODULO.tutorial;
const ICONE_EMPRESA = '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M10 21v-4h4v4"/>';
const ICONE_MAIS = '<path d="m6 9 6 6 6-6"/>';

/** Sem acento e em minúsculas, caractere a caractere (a posição casa com o texto original). */
function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function normalizarCaractere(c: string): string {
  return normalizar(c).charAt(0) || c.toLowerCase();
}

function svg(path: string, tamanho = 16): string {
  return `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const ICONE_COMANDO = '<path d="m9 18 6-6-6-6"/>';
const ICONES_GERAIS: Record<string, string> = {
  'geral.ajuda': '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01"/><path d="M10 9h.01"/><path d="M14 9h.01"/><path d="M18 9h.01"/><path d="M8 16h8"/>',
  'geral.tema': '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
  'geral.desfazer': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  'geral.fixar': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  'geral.voltar': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'geral.avancar': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
};
/** Sinônimos para achar o comando pelo que a pessoa pensa, não só pelo rótulo. */
const TERMOS_DE_COMANDO: Record<string, string> = {
  'geral.ajuda': 'teclado tecla atalho ajuda',
  'geral.tema': 'tema claro escuro aparencia branco dark light cor modo noturno',
  'geral.desfazer': 'desfazer voltar recuperar apagado excluido undo',
  'geral.fixar': 'barra lateral painel sidebar',
  'kanban.novo': 'criar adicionar tarefa card',
  'todo.novo': 'criar adicionar lista checklist tarefa',
  'pensamentos.novo': 'criar adicionar nota ideia',
  'roteiros.novo': 'criar adicionar script video',
  'postagens.novaIdeia': 'ideia banco anotar pauta conteudo',
  'contatos.novaPessoa': 'criar adicionar contato cliente lead',
  'contatos.novaEmpresa': 'criar adicionar contato cliente cnpj',
};
/** Precisam de um contexto que a paleta não tem (um prompt digitado, um estúdio aberto) ou entram por outro caminho. */
const FORA_DOS_COMANDOS = new Set(['geral.busca', 'geral.buscaAlt', 'ia.gerar', 'roteiros.salvar', 'postagens.novo']);

function rotuloDoModulo(id: ModuloId): string {
  return MODULOS.find((m) => m.id === id)?.rotulo ?? id;
}

/** Toda ação do catálogo vira comando — com a tecla atual ao lado; quem não tem tecla também entra. */
function comandos(): Opcao[] {
  const doCatalogo: Opcao[] = CATALOGO_ATALHOS.filter((d) => !d.id.startsWith('ir.') && !FORA_DOS_COMANDOS.has(d.id)).map((d) => ({
    tipo: 'Ação',
    rotulo:
      d.id === 'geral.tema'
        ? temaEfetivo() === 'escuro'
          ? 'Mudar para o tema claro'
          : 'Mudar para o tema escuro'
        : d.escopo
          ? `${rotuloDoModulo(d.escopo)}: ${d.rotulo}`
          : d.rotulo,
    detalhe: d.escopo ? `Abre ${rotuloDoModulo(d.escopo)} e executa` : 'Comando',
    icone: d.escopo ? ICONE_DO_MODULO[d.escopo] : (ICONES_GERAIS[d.id] ?? ICONE_COMANDO),
    termos: TERMOS_DE_COMANDO[d.id] ?? '',
    ir: () => void executarAcao(d.id),
    atalho: d.id,
    chave: d.id,
  }));
  const novaPostagem = (tipo: 'video' | 'imagem', rotulo: string): Opcao => ({
    tipo: 'Ação',
    rotulo: `Postagens: ${rotulo}`,
    detalhe: 'Abre Postagens e cria',
    icone: ICONE_DO_MODULO.postagens,
    termos: 'criar adicionar post conteudo agenda',
    ir: () => {
      abrirPostagem({ tipo });
      void executarAcao('postagens.novo');
    },
    chave: `postagens.novo.${tipo}`,
  });
  const backup: Opcao = {
    tipo: 'Ação',
    rotulo: 'Fazer backup agora',
    detalhe: 'Na pasta do backup automático',
    icone: ICONE_DO_MODULO.ajustes,
    termos: 'backup copia seguranca salvar exportar',
    ir: () => void fazerBackup(),
    chave: 'backup.agora',
  };
  const cor: Opcao = {
    tipo: 'Ação',
    rotulo: 'Cor de destaque',
    detalhe: 'Trocar a cor dos botões e seleções',
    icone: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A5.7 5.7 0 0 0 22 9.7C22 5.4 17.5 2 12 2Z"/>',
    termos: 'cor destaque acento roxo violeta azul verde personalizar aparencia tema',
    ir: () => abrirAjustes('aparencia'),
    chave: 'ajustes.cor',
  };
  return [...doCatalogo, novaPostagem('video', 'Novo vídeo'), novaPostagem('imagem', 'Nova imagem'), backup, cor];
}

/** Sem pasta escolhida, leva a Ajustes › Backup em vez de falhar calado. */
async function fazerBackup(): Promise<void> {
  const estado = await window.irisAPI.backup.getEstado();
  if (!estado.ok || !estado.data.pasta || !estado.data.pastaExiste) {
    abrirAjustes('backup');
    mostrarToast('Escolha a pasta dos backups em "Backup automático" primeiro.', [], 6000);
    return;
  }
  const r = await window.irisAPI.backup.fazerAgora();
  if (!r.ok) mostrarToast(`Backup não saiu: ${r.error}`, [], 7000);
  else if (r.data.ultimoErro) mostrarToast(`Backup não saiu: ${r.data.ultimoErro}`, [], 7000);
  else mostrarToast('Backup feito.', [{ rotulo: 'Ver', fazer: () => abrirAjustes('backup') }], 5000);
}

// ---------- Usados por último ----------

const CHAVE_RECENTES = 'iris.paleta.recentes';
const MAX_RECENTES = 5;

function lerRecentes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENTES) : [];
  } catch {
    return [];
  }
}

function lembrarRecente(chave: string): void {
  try {
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify([chave, ...lerRecentes().filter((c) => c !== chave)].slice(0, MAX_RECENTES)));
  } catch {
    // Sem armazenamento: a lista só não lembra.
  }
}

function opcoesFixas(): Opcao[] {
  const modulos: Opcao[] = MODULOS.map((m) => ({
    tipo: 'Módulo',
    rotulo: m.rotulo,
    detalhe: m.descricao,
    icone: ICONE_DO_MODULO[m.id],
    termos: m.id,
    ir: () => abrirModulo(m.id as ModuloId),
    atalho: idIrPara(m.id as ModuloId),
  }));
  const ajustes: Opcao[] = SECOES_AJUSTES.map((s) => ({
    tipo: 'Ajustes',
    rotulo: s.rotulo,
    detalhe: 'Ajustes',
    icone: ICONE_DO_MODULO.ajustes,
    termos: s.termos,
    ir: () => abrirAjustes(s.id),
  }));
  return [...modulos, ...ajustes, ...comandos()];
}

function iconeDo(item: ItemBusca): string {
  if (item.alvo.modulo === 'contatos' && item.alvo.ref.tipo === 'empresa') return ICONE_EMPRESA;
  return ICONE_DO_MODULO[item.alvo.modulo];
}

/** O conteúdo de tudo, lido na hora (arquivos locais). Falhou = a busca segue só com o fixo. */
async function opcoesDoIndice(): Promise<Opcao[]> {
  try {
    const r = await window.irisAPI.busca.indice();
    if (!r.ok) return [];
    return r.data.map((item) => ({
      tipo: item.tipo,
      rotulo: item.rotulo,
      detalhe: item.detalhe,
      icone: iconeDo(item),
      termos: item.termos,
      ir: () => abrirAlvo(item.alvo),
    }));
  } catch {
    return [];
  }
}

/** Os guias vêm do próprio Tutorial, carregado só quando a paleta abre. */
async function opcoesDoTutorial(): Promise<Opcao[]> {
  try {
    const { GUIAS } = await import('../modules/tutorial/tutorial.content.js');
    return GUIAS.map((g) => ({
      tipo: 'Tutorial' as const,
      rotulo: `Como usar: ${g.titulo}`,
      detalhe: g.chamada,
      icone: ICONE_GUIA,
      termos: 'tutorial ajuda guia como usar',
      ir: () => abrirTutorial(g.id as GuiaId),
    }));
  } catch {
    return [];
  }
}

interface Achado {
  o: Opcao;
  pontos: number;
  /** Trecho do conteúdo onde a palavra apareceu, quando ela não está no nome. */
  trecho: string;
}

function palavrasDa(busca: string): string[] {
  return normalizar(busca).split(/\s+/).filter(Boolean);
}

/** "…um pedaço do texto em volta da palavra…", para mostrar por que o item apareceu. */
function trechoEmVolta(texto: string, palavra: string): string {
  const i = normalizar(texto).indexOf(palavra);
  if (i < 0) return '';
  const inicio = Math.max(0, i - 28);
  const fim = Math.min(texto.length, i + palavra.length + 44);
  return `${inicio > 0 ? '…' : ''}${texto.slice(inicio, fim).replace(/\s+/g, ' ').trim()}${fim < texto.length ? '…' : ''}`;
}

/**
 * Toda palavra digitada precisa aparecer (no nome ou no resto). Pontua pela
 * primeira: começo do nome > palavra do nome > nome contém > só no conteúdo.
 */
function avaliar(o: Opcao, palavras: string[]): Achado | null {
  const nome = normalizar(o.rotulo);
  const resto = normalizar(`${o.detalhe} ${o.termos}`);
  if (!palavras.every((p) => nome.includes(p) || resto.includes(p))) return null;
  const [primeira] = palavras as [string];
  let pontos = 1;
  if (nome.startsWith(primeira)) pontos = 4;
  else if (nome.split(/\s+/).some((p) => p.startsWith(primeira))) pontos = 3;
  else if (nome.includes(primeira)) pontos = 2;
  // Todas no nome vale mais que espalhadas pelo conteúdo.
  if (palavras.every((p) => nome.includes(p))) pontos += 0.5;
  const fora = palavras.find((p) => !nome.includes(p));
  const trecho = fora && !normalizar(o.detalhe).includes(fora) ? trechoEmVolta(o.termos, fora) : '';
  return { o, pontos: pontos + GRUPOS[o.tipo].peso, trecho };
}

interface Grupo {
  tipo: TipoOpcao;
  /** No lugar do nome do grupo ("Usados por último"). */
  titulo?: string;
  achados: Achado[];
  total: number;
}

/** ">" no começo = só comandos, como no VS Code. Devolve o texto sem ele. */
function lerBusca(valor: string): { soComandos: boolean; texto: string } {
  const limpo = valor.trimStart();
  return limpo.startsWith('>') ? { soComandos: true, texto: limpo.slice(1) } : { soComandos: false, texto: valor };
}

const semPontos = (o: Opcao): Achado => ({ o, pontos: 0, trecho: '' });

function agrupar(opcoes: Opcao[], busca: string, expandido: TipoOpcao | null): Grupo[] {
  const { soComandos, texto } = lerBusca(busca);
  const palavras = palavrasDa(texto);
  const base = soComandos ? opcoes.filter((o) => o.tipo === 'Ação') : opcoes;
  if (!palavras.length) {
    if (soComandos) return [{ tipo: 'Ação', achados: base.map(semPontos), total: base.length }];
    const recentes = lerRecentes()
      .map((chave) => opcoes.find((o) => o.chave === chave))
      .filter((o): o is Opcao => !!o);
    const modulos: Grupo = { tipo: 'Módulo', achados: opcoes.filter((o) => o.tipo === 'Módulo').map(semPontos), total: 0 };
    return recentes.length ? [{ tipo: 'Ação', titulo: 'Usados por último', achados: recentes.map(semPontos), total: 0 }, modulos] : [modulos];
  }
  const porTipo = new Map<TipoOpcao, Achado[]>();
  base.forEach((o) => {
    const a = avaliar(o, palavras);
    if (!a) return;
    const lista = porTipo.get(o.tipo) ?? [];
    lista.push(a);
    porTipo.set(o.tipo, lista);
  });
  const grupos = [...porTipo.entries()].map(([tipo, achados]) => {
    achados.sort((x, y) => y.pontos - x.pontos || x.o.rotulo.localeCompare(y.o.rotulo, 'pt-BR'));
    return { tipo, achados, total: achados.length };
  });
  // O grupo com o melhor resultado vem primeiro; o expandido mostra até o teto.
  grupos.sort((a, b) => (b.achados[0]?.pontos ?? 0) - (a.achados[0]?.pontos ?? 0));
  return (expandido ? grupos.filter((g) => g.tipo === expandido) : grupos).map((g) => ({
    ...g,
    achados: g.achados.slice(0, g.tipo === expandido ? TETO_DO_GRUPO : POR_GRUPO),
  }));
}

/** O texto com as palavras buscadas em <mark>, montado nó a nó (nada de innerHTML com texto do usuário). */
function comDestaque(classe: string, texto: string, palavras: string[]): HTMLElement {
  const el = document.createElement('span');
  el.className = classe;
  if (!palavras.length) {
    el.textContent = texto;
    return el;
  }
  // split(''), não Array.from: a posição precisa contar como texto.length (unidades UTF-16).
  const norm = texto.split('').map(normalizarCaractere).join('');
  const marcado = new Array<boolean>(texto.length).fill(false);
  palavras.forEach((p) => {
    for (let i = norm.indexOf(p); i >= 0; i = norm.indexOf(p, i + p.length)) marcado.fill(true, i, i + p.length);
  });
  let i = 0;
  while (i < texto.length) {
    const j = marcado.indexOf(!marcado[i], i);
    const fim = j < 0 ? texto.length : j;
    const pedaco = texto.slice(i, fim);
    if (marcado[i]) {
      const mark = document.createElement('mark');
      mark.textContent = pedaco;
      el.appendChild(mark);
    } else {
      el.appendChild(document.createTextNode(pedaco));
    }
    i = fim;
  }
  return el;
}

let aberta = false;

export function abrirPaleta(): void {
  if (aberta) return;
  aberta = true;

  let opcoes = opcoesFixas();
  /** Linhas selecionáveis na ordem da tela (resultados e "Ver todos"). */
  let linhas: Array<{ escolher: () => void }> = [];
  let selecionada = 0;
  let expandido: TipoOpcao | null = null;
  let indiceCarregado = false;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay paleta-overlay';
  const caixa = document.createElement('div');
  caixa.className = 'paleta';
  caixa.setAttribute('role', 'dialog');
  caixa.setAttribute('aria-label', 'Buscar e ir para');

  const campo = document.createElement('div');
  campo.className = 'paleta-campo';
  campo.innerHTML = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 17);
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Buscar em tudo, ou > para comandos…';
  input.setAttribute('aria-label', 'Buscar');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', 'paleta-lista');
  input.setAttribute('aria-expanded', 'true');
  input.spellcheck = false;
  campo.appendChild(input);
  const esc = document.createElement('kbd');
  esc.textContent = 'Esc';
  campo.appendChild(esc);

  const lista = document.createElement('div');
  lista.className = 'paleta-lista';
  lista.id = 'paleta-lista';
  lista.setAttribute('role', 'listbox');

  const rodape = document.createElement('div');
  rodape.className = 'paleta-rodape';
  rodape.innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>&gt;</kbd> só comandos</span>';
  const comboAjuda = comboDe('geral.ajuda');
  if (comboAjuda) {
    const dica = document.createElement('span');
    dica.className = 'paleta-rodape-atalhos';
    dica.textContent = `${textoDoCombo(comboAjuda)} todos os atalhos`;
    rodape.appendChild(dica);
  }

  caixa.append(campo, lista, rodape);
  overlay.appendChild(caixa);

  let soltar: (() => void) | null = null;
  const fechar = (): void => {
    if (!aberta) return;
    aberta = false;
    soltar?.();
    overlay.remove();
  };

  const marcar = (): void => {
    lista.querySelectorAll<HTMLElement>('.paleta-item').forEach((el, i) => {
      const ativa = i === selecionada;
      el.classList.toggle('is-selecionada', ativa);
      el.setAttribute('aria-selected', String(ativa));
      if (ativa) {
        input.setAttribute('aria-activedescendant', el.id);
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const linhaBase = (indice: number, aoEscolher: () => void): HTMLButtonElement => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'paleta-item';
    item.id = `paleta-item-${indice}`;
    item.setAttribute('role', 'option');
    item.tabIndex = -1;
    item.addEventListener('mousemove', () => {
      if (selecionada === indice) return;
      selecionada = indice;
      marcar();
    });
    item.addEventListener('click', aoEscolher);
    return item;
  };

  const desenhar = (): void => {
    const { soComandos, texto } = lerBusca(input.value);
    const palavras = palavrasDa(texto);
    const grupos = agrupar(opcoes, input.value, expandido);
    linhas = [];
    lista.replaceChildren();
    if (!grupos.some((g) => g.achados.length)) {
      const texto = !indiceCarregado ? 'Procurando…' : 'Nada encontrado com essas palavras.';
      lista.appendChild(Object.assign(document.createElement('p'), { className: 'paleta-vazio', textContent: texto }));
      return;
    }
    const comTitulos = palavras.length > 0 || soComandos || grupos.length > 1;
    grupos.forEach((g) => {
      if (!g.achados.length) return;
      if (comTitulos) {
        const titulo = document.createElement('div');
        titulo.className = 'paleta-grupo';
        titulo.setAttribute('role', 'presentation');
        const nome = g.titulo ?? GRUPOS[g.tipo].nome;
        titulo.textContent = g.total > g.achados.length || expandido ? `${nome} · ${g.total}` : nome;
        if (expandido) {
          const voltar = document.createElement('button');
          voltar.type = 'button';
          voltar.className = 'paleta-grupo-voltar';
          voltar.textContent = 'ver todos os tipos';
          voltar.addEventListener('click', () => {
            expandido = null;
            selecionada = 0;
            desenhar();
            input.focus();
          });
          titulo.appendChild(voltar);
        }
        lista.appendChild(titulo);
      }
      g.achados.forEach(({ o, trecho }) => {
        const escolher = (): void => {
          if (o.chave) lembrarRecente(o.chave);
          fechar();
          o.ir();
        };
        const indice = linhas.length;
        linhas.push({ escolher });
        const item = linhaBase(indice, escolher);
        const icone = document.createElement('span');
        icone.className = 'paleta-item-icone';
        icone.innerHTML = svg(o.icone);
        const textos = document.createElement('span');
        textos.className = 'paleta-item-textos';
        textos.append(comDestaque('paleta-item-nome', o.rotulo, palavras), comDestaque('paleta-item-detalhe', o.detalhe, palavras));
        if (trecho) textos.appendChild(comDestaque('paleta-item-trecho', trecho, palavras));
        item.append(icone, textos);
        const combo = o.atalho ? comboDe(o.atalho) : '';
        if (combo) item.appendChild(buildTeclas(combo));
        if (!comTitulos) item.appendChild(Object.assign(document.createElement('span'), { className: 'paleta-item-tipo', textContent: o.tipo }));
        lista.appendChild(item);
      });
      if (!expandido && g.total > g.achados.length) {
        const ver = (): void => {
          expandido = g.tipo;
          selecionada = 0;
          desenhar();
          input.focus();
        };
        const indice = linhas.length;
        linhas.push({ escolher: ver });
        const item = linhaBase(indice, ver);
        item.classList.add('paleta-item-mais');
        const icone = document.createElement('span');
        icone.className = 'paleta-item-icone';
        icone.innerHTML = svg(ICONE_MAIS);
        item.append(icone, Object.assign(document.createElement('span'), { className: 'paleta-item-nome', textContent: `Ver todos os ${g.total} em ${GRUPOS[g.tipo].nome}` }));
        lista.appendChild(item);
      }
    });
    selecionada = Math.min(selecionada, Math.max(0, linhas.length - 1));
    marcar();
  };

  input.addEventListener('input', () => {
    selecionada = 0;
    expandido = null;
    desenhar();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selecionada = (selecionada + 1) % Math.max(1, linhas.length);
      marcar();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selecionada = (selecionada - 1 + linhas.length) % Math.max(1, linhas.length);
      marcar();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      linhas[selecionada]?.escolher();
    } else if (e.key === 'Backspace' && expandido && !input.value) {
      expandido = null;
      desenhar();
    }
  });
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) fechar();
  });

  document.body.appendChild(overlay);
  soltar = empilharCamada(overlay, fechar);
  desenhar();
  input.focus();

  void Promise.all([opcoesDoIndice(), opcoesDoTutorial()]).then(([conteudo, guias]) => {
    if (!aberta) return;
    indiceCarregado = true;
    opcoes = [...opcoes, ...conteudo, ...guias];
    if (input.value.trim()) desenhar();
  });
}
