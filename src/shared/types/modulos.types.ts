/**
 * Catálogo único dos módulos do app. A sidebar, o seletor de módulo inicial e a
 * validação do main derivam daqui — antes a lista vivia duplicada em seis lugares
 * e bastava esquecer um para o módulo novo não poder ser aberto ao iniciar.
 *
 * Mora em shared/types porque é a única pasta de shared que o renderer compila.
 */

export const CATEGORIAS = [
  { id: 'conteudo', rotulo: 'Conteúdo' },
  { id: 'arquivos', rotulo: 'Arquivos' },
  { id: 'sistema', rotulo: 'Sistema' },
  { id: 'trafego', rotulo: 'Tráfego' },
] as const;

export type CategoriaId = (typeof CATEGORIAS)[number]['id'];

/**
 * `topo` e `rodape` ficam fora das categorias: são áreas independentes do resto
 * (o Kanban é o painel de trabalho diário; Tutorial e Ajustes são do app em si).
 */
export type PosicaoModulo = 'topo' | CategoriaId | 'rodape';

export interface ModuloDescritor {
  id: string;
  rotulo: string;
  posicao: PosicaoModulo;
}

export const MODULOS = [
  { id: 'kanban', rotulo: 'Kanban', posicao: 'topo' },
  { id: 'postagens', rotulo: 'Postagens', posicao: 'conteudo' },
  { id: 'relatorios', rotulo: 'Relatórios', posicao: 'conteudo' },
  { id: 'roteiros', rotulo: 'Roteiros', posicao: 'conteudo' },
  { id: 'sheets', rotulo: 'Sheets', posicao: 'conteudo' },
  { id: 'explorador', rotulo: 'Biblioteca', posicao: 'arquivos' },
  { id: 'quadro', rotulo: 'Quadro', posicao: 'arquivos' },
  { id: 'copy', rotulo: 'Copy', posicao: 'arquivos' },
  { id: 'pensamentos', rotulo: 'Pensamentos', posicao: 'arquivos' },
  { id: 'links', rotulo: 'Links rápidos', posicao: 'arquivos' },
  { id: 'servidores', rotulo: 'Servidores', posicao: 'sistema' },
  { id: 'n8n', rotulo: 'n8n', posicao: 'sistema' },
  { id: 'github', rotulo: 'GitHub', posicao: 'sistema' },
  { id: 'trafego', rotulo: 'Tráfego pago', posicao: 'trafego' },
  { id: 'tutorial', rotulo: 'Tutorial', posicao: 'rodape' },
  { id: 'ajustes', rotulo: 'Ajustes', posicao: 'rodape' },
] as const satisfies readonly ModuloDescritor[];

export type ModuloId = (typeof MODULOS)[number]['id'];

export const MODULO_PADRAO: ModuloId = 'kanban';

export function isModuloId(valor: unknown): valor is ModuloId {
  return typeof valor === 'string' && MODULOS.some((m) => m.id === valor);
}

/** Rótulo com a categoria na frente, para listas fora da sidebar (ex.: Ajustes). */
export function rotuloCompleto(id: ModuloId): string {
  const modulo = MODULOS.find((m) => m.id === id);
  if (!modulo) return id;
  const categoria = CATEGORIAS.find((c) => c.id === modulo.posicao);
  return categoria ? `${categoria.rotulo} › ${modulo.rotulo}` : modulo.rotulo;
}
