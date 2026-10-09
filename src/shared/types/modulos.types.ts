/**
 * Catálogo único dos módulos do app. A sidebar, o seletor de módulo inicial e a
 * validação do main derivam daqui — antes a lista vivia duplicada em seis lugares
 * e bastava esquecer um para o módulo novo não poder ser aberto ao iniciar.
 *
 * Mora em shared/types porque é a única pasta de shared que o renderer compila.
 */

export const CATEGORIAS = [
  { id: 'relacionamento', rotulo: 'Relacionamento' },
  { id: 'conteudo', rotulo: 'Conteúdo' },
  { id: 'arquivos', rotulo: 'Arquivos' },
  { id: 'sistema', rotulo: 'Sistema' },
  { id: 'trafego', rotulo: 'Tráfego' },
] as const;

export type CategoriaId = (typeof CATEGORIAS)[number]['id'];

/**
 * `topo` e `rodape` ficam fora das categorias: são áreas independentes do resto
 * (Kanban e To-do são o trabalho diário; Tutorial e Ajustes são do app em si).
 */
export type PosicaoModulo = 'topo' | CategoriaId | 'rodape';

export interface ModuloDescritor {
  id: string;
  rotulo: string;
  posicao: PosicaoModulo;
  /** Uma linha: aparece no painel da barra lateral e na busca rápida (Ctrl+P). */
  descricao: string;
}

export const MODULOS = [
  { id: 'kanban', rotulo: 'Kanban', posicao: 'topo', descricao: 'Cards em colunas, do a fazer ao feito' },
  { id: 'todo', rotulo: 'To-do', posicao: 'topo', descricao: 'Checklists rápidas do dia a dia' },
  { id: 'contatos', rotulo: 'Contatos', posicao: 'relacionamento', descricao: 'Pessoas, empresas, funil e contratos' },
  { id: 'leads', rotulo: 'Leads', posicao: 'relacionamento', descricao: 'Formulários do site: caixa de entrada e painel' },
  { id: 'relatorios-leads', rotulo: 'Relatórios de leads', posicao: 'relacionamento', descricao: 'PDFs de leads por período' },
  { id: 'api-leads', rotulo: 'API e n8n', posicao: 'relacionamento', descricao: 'Conecte o formulário do site e o n8n' },
  { id: 'whatsapp', rotulo: 'WhatsApp', posicao: 'relacionamento', descricao: 'Conversas, envio para vários, modelos e conexão' },
  { id: 'postagens', rotulo: 'Postagens', posicao: 'conteudo', descricao: 'Vídeos e imagens, da ideia à publicação' },
  { id: 'ia', rotulo: 'Estúdio IA', posicao: 'conteudo', descricao: 'Imagens e thumbnails com IA' },
  { id: 'relatorios', rotulo: 'Relatórios', posicao: 'conteudo', descricao: 'PDFs de resultado para clientes' },
  { id: 'roteiros', rotulo: 'Roteiros', posicao: 'conteudo', descricao: 'Roteiros de vídeo, cena por cena' },
  { id: 'sheets', rotulo: 'Sheets', posicao: 'conteudo', descricao: 'Tabelas importadas de planilhas' },
  { id: 'explorador', rotulo: 'Biblioteca', posicao: 'arquivos', descricao: 'Seus arquivos organizados em coleções' },
  { id: 'quadro', rotulo: 'Quadro', posicao: 'arquivos', descricao: 'Tela livre de notas, tarefas e rotinas' },
  { id: 'copy', rotulo: 'Copy', posicao: 'arquivos', descricao: 'Textos prontos para copiar' },
  { id: 'pensamentos', rotulo: 'Pensamentos', posicao: 'arquivos', descricao: 'Post-its para ideias soltas' },
  { id: 'links', rotulo: 'Links rápidos', posicao: 'arquivos', descricao: 'Atalhos para os sites de sempre' },
  { id: 'servidores', rotulo: 'Servidores', posicao: 'sistema', descricao: 'Sites no ar e comandos por SSH' },
  { id: 'n8n', rotulo: 'n8n', posicao: 'sistema', descricao: 'Fluxos de automação' },
  { id: 'github', rotulo: 'GitHub', posicao: 'sistema', descricao: 'Repositórios e o que falta enviar' },
  { id: 'trafego', rotulo: 'Tráfego pago', posicao: 'trafego', descricao: 'Campanhas pagas e retorno' },
  { id: 'tutorial', rotulo: 'Tutorial', posicao: 'rodape', descricao: 'Um guia para cada área' },
  { id: 'ajustes', rotulo: 'Ajustes', posicao: 'rodape', descricao: 'Conexões, preferências e backup' },
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
