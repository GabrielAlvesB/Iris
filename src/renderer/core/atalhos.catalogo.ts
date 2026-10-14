import { MODULOS, type ModuloId } from '../../shared/types/modulos.types.js';
import type { Combo } from '../../shared/types/atalhos.types.js';

/**
 * Catálogo único dos atalhos: o que existe, em que grupo aparece e a tecla
 * padrão. A ajuda (Shift+?), Ajustes › Atalhos, a busca rápida e o Tutorial
 * leem daqui; quem executa cada ação é ligado à parte (atalhos.ts), pelo id —
 * a ajuda precisa listar os atalhos de um módulo mesmo com ele fechado.
 */

export interface DefinicaoAtalho {
  id: string;
  rotulo: string;
  grupo: string;
  padrao: Combo;
  /** Só vale com este módulo aberto; atalhos de módulos diferentes podem repetir a tecla. */
  escopo?: ModuloId;
}

/** Teclas que não se trocam (faixa de números, teclas do teleprompter): só aparecem na ajuda. */
export interface AtalhoFixo {
  rotulo: string;
  grupo: string;
  /** Alternativas ("↑" ou "↓"); "Ctrl+1…9" vale como texto. */
  teclas: Combo[];
  escopo?: ModuloId;
}

/**
 * G + letra para ir a cada módulo. O Record cobra a tecla de todo módulo novo.
 * Tutorial e Ajustes ficam nas teclas que todo programa usa (F1 e Ctrl+,).
 */
const IR_PARA: Record<ModuloId, Combo> = {
  // D de "dia": H já é do GitHub.
  hoje: 'G D',
  kanban: 'G K',
  todo: 'G T',
  contatos: 'G C',
  leads: 'G L',
  'relatorios-leads': 'G E',
  'api-leads': 'G A',
  whatsapp: 'G W',
  postagens: 'G P',
  ia: 'G I',
  relatorios: 'G R',
  roteiros: 'G O',
  sheets: 'G S',
  explorador: 'G B',
  quadro: 'G Q',
  copy: 'G Y',
  pensamentos: 'G M',
  links: 'G U',
  servidores: 'G V',
  n8n: 'G N',
  github: 'G H',
  trafego: 'G F',
  tutorial: 'F1',
  ajustes: 'Ctrl+,',
};

export const GRUPO_GERAL = 'Geral';
export const GRUPO_NAVEGACAO = 'Ir para';

function rotuloDoModulo(id: ModuloId): string {
  return MODULOS.find((m) => m.id === id)?.rotulo ?? id;
}

export function idIrPara(modulo: ModuloId): string {
  return `ir.${modulo}`;
}

export const CATALOGO_ATALHOS: readonly DefinicaoAtalho[] = [
  { id: 'geral.busca', rotulo: 'Buscar e executar comandos', grupo: GRUPO_GERAL, padrao: 'Ctrl+K' },
  // A tecla de antes continua: quem se acostumou com o Ctrl+P não perde nada.
  { id: 'geral.buscaAlt', rotulo: 'Buscar (tecla alternativa)', grupo: GRUPO_GERAL, padrao: 'Ctrl+P' },
  { id: 'geral.ajuda', rotulo: 'Ver todos os atalhos', grupo: GRUPO_GERAL, padrao: 'Shift+?' },
  { id: 'geral.fixar', rotulo: 'Fixar ou soltar o painel da barra lateral', grupo: GRUPO_GERAL, padrao: 'Ctrl+B' },
  { id: 'geral.tema', rotulo: 'Trocar entre tema claro e escuro', grupo: GRUPO_GERAL, padrao: 'Ctrl+Shift+L' },
  { id: 'geral.desfazer', rotulo: 'Desfazer a última alteração (exclusão, edição…)', grupo: GRUPO_GERAL, padrao: 'Alt+Z' },
  { id: 'pomodoro.pausar', rotulo: 'Foco (Pomodoro): pausar ou continuar', grupo: GRUPO_GERAL, padrao: '' },
  { id: 'pomodoro.parar', rotulo: 'Foco (Pomodoro): parar e guardar o tempo', grupo: GRUPO_GERAL, padrao: '' },
  { id: 'geral.voltar', rotulo: 'Voltar ao módulo anterior', grupo: GRUPO_GERAL, padrao: 'Alt+Left' },
  { id: 'geral.avancar', rotulo: 'Avançar (depois de voltar)', grupo: GRUPO_GERAL, padrao: 'Alt+Right' },
  ...MODULOS.map((m) => ({ id: idIrPara(m.id), rotulo: m.rotulo, grupo: GRUPO_NAVEGACAO, padrao: IR_PARA[m.id] })),
  // Ctrl+K era o "Novo card" até a busca global ganhar a tecla; Ctrl+N é o "novo" de todo programa.
  { id: 'kanban.novo', rotulo: 'Novo card', grupo: rotuloDoModulo('kanban'), padrao: 'Ctrl+N', escopo: 'kanban' },
  { id: 'todo.novo', rotulo: 'Nova checklist (foca o campo)', grupo: rotuloDoModulo('todo'), padrao: 'N', escopo: 'todo' },
  { id: 'pensamentos.novo', rotulo: 'Novo post-it', grupo: rotuloDoModulo('pensamentos'), padrao: 'N', escopo: 'pensamentos' },
  { id: 'pensamentos.buscar', rotulo: 'Buscar nos post-its', grupo: rotuloDoModulo('pensamentos'), padrao: 'Ctrl+F', escopo: 'pensamentos' },
  { id: 'ia.gerar', rotulo: 'Gerar a imagem', grupo: rotuloDoModulo('ia'), padrao: 'Ctrl+Enter', escopo: 'ia' },
  { id: 'links.buscar', rotulo: 'Buscar nos links', grupo: rotuloDoModulo('links'), padrao: 'Ctrl+F', escopo: 'links' },
  // Sem tecla padrão: existem para a paleta (Ctrl+K › "nova pessoa"); quem quiser dá uma tecla em Ajustes.
  { id: 'postagens.novo', rotulo: 'Nova postagem (do tipo aberto)', grupo: rotuloDoModulo('postagens'), padrao: '', escopo: 'postagens' },
  { id: 'postagens.novaIdeia', rotulo: 'Nova ideia (banco de ideias)', grupo: rotuloDoModulo('postagens'), padrao: '', escopo: 'postagens' },
  { id: 'roteiros.novo', rotulo: 'Novo roteiro', grupo: rotuloDoModulo('roteiros'), padrao: '', escopo: 'roteiros' },
  { id: 'contatos.novaPessoa', rotulo: 'Nova pessoa', grupo: rotuloDoModulo('contatos'), padrao: '', escopo: 'contatos' },
  { id: 'contatos.novaEmpresa', rotulo: 'Nova empresa', grupo: rotuloDoModulo('contatos'), padrao: '', escopo: 'contatos' },
  { id: 'roteiros.salvar', rotulo: 'Salvar agora (no estúdio)', grupo: rotuloDoModulo('roteiros'), padrao: 'Ctrl+S', escopo: 'roteiros' },
];

export const ATALHOS_FIXOS: readonly AtalhoFixo[] = [
  { rotulo: 'Fechar a janela, o painel ou o menu de cima', grupo: GRUPO_GERAL, teclas: ['Esc'] },
  { rotulo: 'Copiar o texto 1 a 9 da lista', grupo: rotuloDoModulo('copy'), teclas: ['Ctrl+1…9'], escopo: 'copy' },
  { rotulo: 'Abrir o link 1 a 9 da lista', grupo: rotuloDoModulo('links'), teclas: ['Ctrl+1…9'], escopo: 'links' },
  { rotulo: 'Registrar a anotação no histórico', grupo: rotuloDoModulo('contatos'), teclas: ['Ctrl+Enter'], escopo: 'contatos' },
  { rotulo: 'Teleprompter: tocar ou pausar', grupo: rotuloDoModulo('roteiros'), teclas: ['Space'], escopo: 'roteiros' },
  { rotulo: 'Teleprompter: velocidade', grupo: rotuloDoModulo('roteiros'), teclas: ['Up', 'Down'], escopo: 'roteiros' },
  { rotulo: 'Teleprompter: tamanho do texto', grupo: rotuloDoModulo('roteiros'), teclas: ['Left', 'Right'], escopo: 'roteiros' },
  { rotulo: 'Teleprompter: espelhar', grupo: rotuloDoModulo('roteiros'), teclas: ['M'], escopo: 'roteiros' },
];

export function definicaoDe(id: string): DefinicaoAtalho | undefined {
  return CATALOGO_ATALHOS.find((d) => d.id === id);
}
