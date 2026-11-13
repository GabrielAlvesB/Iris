import type { ChaveBundle } from './export.types';

/**
 * Nuvem: os dados do Iris num banco de dados (Supabase, Cloudflare D1, Postgres),
 * para dois computadores trabalharem nos mesmos dados.
 *
 * O Iris continua local: cada computador tem os arquivos JSON inteiros e funciona
 * sem internet. A nuvem guarda uma cópia **por registro** (um card, uma pessoa, um
 * roteiro) e cada computador envia o que mudou e busca o que os outros mudaram.
 *
 * Puro (sem Electron nem Node): compilado pelos dois lados.
 */

/** O que sobra do arquivo depois de tiradas as coleções: preferências, contadores, listas sem id. */
export const ID_RESTO = '_resto';
/** A ordem dos itens de uma coleção (os ids, na sequência do array). */
export const ID_ORDEM = '_ordem';
/** Coleção do registro `_resto` (ele não pertence a nenhuma lista). */
export const COLECAO_RESTO = '';

/** Versão das tabelas no banco. Mudou a estrutura: subir e escrever a migração em nuvem.sql.ts. */
export const VERSAO_ESQUEMA_NUVEM = 1;

/**
 * Um número que só cresce (o "#12" do card, o `seq` da postagem). Fica fora do que
 * se envia — mudaria a cada item criado e os dois computadores brigariam por ele — e
 * é recalculado depois de juntar: o maior entre o daqui e o maior `seq` dos itens.
 */
export interface ContadorNuvem {
  /** Onde o contador mora: '' = no arquivo; 'boards' = em cada item dessa coleção. */
  tipo: string;
  campo: string;
  /** A lista cujos itens levam o número (de topo, ou dentro do item de `tipo`). */
  itens: string;
}

export interface RegraNuvem {
  /** false = o arquivo inteiro é deste computador. */
  sincroniza: boolean;
  /** Para a tela: por que não sincroniza, ou o que fica de fora. */
  porque?: string;
  /**
   * Listas dentro de um item que são coleções próprias. Chave = o tipo da coleção
   * ('boards'); valor = os campos do item. Sem isto o quadro do Kanban seria um
   * registro só, e dois computadores mexendo em cards diferentes entrariam em conflito.
   */
  aninhadas?: Record<string, string[]>;
  /** Caminhos do arquivo ('a.b') que ficam neste computador: nunca enviados nem sobrescritos. */
  locais?: string[];
  /** Campos de item que ficam neste computador, por tipo de coleção. */
  camposLocais?: Record<string, string[]>;
  contadores?: ContadorNuvem[];
}

const SEQ_DO_ARQUIVO = (itens: string): ContadorNuvem[] => [{ tipo: '', campo: 'seqAtual', itens }];
/** O arquivo copiado em `userData/anexos` só existe no computador que o anexou. */
const SEM_ANEXOS = (colecao: string): Record<string, string[]> => ({ [colecao]: ['anexos'] });

/**
 * Mexer num card carimba o `updatedAt` do quadro (e numa linha, o da tabela). Enviado, dois
 * computadores editando cards diferentes brigariam pelo quadro: o carimbo do pai fica em cada um.
 */
const CARIMBO_DO_PAI = ['updatedAt'];

/**
 * Uma regra por arquivo de dados (o compilador cobra arquivo novo). O padrão `{ sincroniza: true }`
 * serve para quase todos: toda lista de itens com `id` vira coleção sozinha, o resto vai em `_resto`.
 */
export const REGRAS_NUVEM: Record<ChaveBundle, RegraNuvem> = {
  kanban: {
    sincroniza: true,
    aninhadas: { boards: ['cards'] },
    camposLocais: { boards: CARIMBO_DO_PAI },
    contadores: [{ tipo: 'boards', campo: 'cardSeq', itens: 'cards' }],
  },
  todo: { sincroniza: true },
  quadro: { sincroniza: true },
  sheets: { sincroniza: true, aninhadas: { tables: ['rows'] }, camposLocais: { tables: CARIMBO_DO_PAI } },
  links: { sincroniza: true },
  pensamentos: { sincroniza: true },
  copy: { sincroniza: true },
  ideias: { sincroniza: true },
  gravacao: { sincroniza: true },
  videos: {
    sincroniza: true,
    porque: 'Os arquivos anexados "do computador" ficam só onde foram anexados.',
    camposLocais: SEM_ANEXOS('videos'),
    contadores: SEQ_DO_ARQUIVO('videos'),
  },
  imagens: {
    sincroniza: true,
    porque: 'Os arquivos anexados "do computador" ficam só onde foram anexados.',
    camposLocais: SEM_ANEXOS('imagens'),
    contadores: SEQ_DO_ARQUIVO('imagens'),
  },
  roteiros: {
    sincroniza: true,
    porque: 'Os arquivos anexados "do computador" ficam só onde foram anexados.',
    camposLocais: SEM_ANEXOS('roteiros'),
    contadores: SEQ_DO_ARQUIVO('roteiros'),
  },
  relatorios: { sincroniza: true, contadores: SEQ_DO_ARQUIVO('relatorios') },
  trafego: { sincroniza: true, contadores: SEQ_DO_ARQUIVO('campanhas') },
  contatos: {
    sincroniza: true,
    porque: 'O servidor local de leads (porta, rede) é de cada computador.',
    locais: ['leadsConfig.servidor', 'leadsConfig.idsRecebidos'],
  },
  whatsapp: {
    sincroniza: true,
    porque: 'Só os modelos de mensagem. Conversas, envios e a conexão ficam em cada computador: dois enviando o mesmo lote mandariam em dobro.',
    locais: ['config', 'mensagens', 'lotes', 'idsRecebidos'],
  },
  servidores: {
    sincroniza: true,
    porque: 'O histórico de checagens é de cada computador.',
    // A checagem de saúde carimba `updatedAt` a cada minuto: sem tirá-lo, o servidor "mudaria" sem parar.
    camposLocais: { servidores: ['historico', 'updatedAt'] },
  },
  n8n: { sincroniza: true, porque: 'A lista de fluxos é lida de novo em cada computador.', locais: ['ultimoSnapshot'] },
  ia: { sincroniza: true, porque: 'Modelos e padrões. As chaves de IA ficam no cofre de cada computador.' },
  lembretes: { sincroniza: true, locais: ['avisados'] },
  ajustes: { sincroniza: true, porque: 'A bandeja do sistema é de cada computador.', locais: ['bandeja'] },
  explorador: { sincroniza: false, porque: 'A Biblioteca aponta para pastas deste computador.' },
  github: { sincroniza: false, porque: 'As pastas de projetos e a lista de repositórios são deste computador.' },
};

/** O que nunca vai para a nuvem, além dos arquivos com `sincroniza: false`. Só texto, para a tela. */
export const FORA_DA_NUVEM: ReadonlyArray<{ titulo: string; texto: string }> = [
  { titulo: 'Senhas, tokens e chaves', texto: 'Ficam no cofre de cada computador. No outro, digite de novo as que for usar.' },
  { titulo: 'Arquivos anexados e imagens da IA', texto: 'Um banco de dados não é lugar de vídeo nem imagem: os arquivos ficam onde foram salvos.' },
  { titulo: 'Histórico de desfazer', texto: 'Cada computador desfaz o que foi feito nele.' },
  { titulo: 'Workspace', texto: 'Quais apps estão instalados é coisa de cada computador.' },
];

export type DialetoSql = 'postgres' | 'sqlite';

export const DIALETOS: ReadonlyArray<{ id: DialetoSql; rotulo: string; serve: string }> = [
  { id: 'postgres', rotulo: 'PostgreSQL', serve: 'Supabase, Neon, Railway ou qualquer Postgres.' },
  { id: 'sqlite', rotulo: 'SQLite', serve: 'Cloudflare D1, Turso ou um arquivo SQLite.' },
];

// ---------- Serviços ----------

export type ProvedorNuvem = 'supabase';

export const PROVEDORES_NUVEM: ReadonlyArray<{ id: ProvedorNuvem; rotulo: string; dialeto: DialetoSql; resumo: string }> = [
  { id: 'supabase', rotulo: 'Supabase', dialeto: 'postgres', resumo: 'Postgres com API pronta. Tem plano gratuito.' },
];

/** Como este computador entra num espaço que já pode ter dados (a única hora em que dá para perder algo). */
export type ModoDeEntrada = 'enviar' | 'trazer' | 'juntar';

// ---------- Deste computador (nuvem.json, fora do backup) ----------

/** Uma edição daqui que perdeu para a da nuvem (ou o contrário). O que perdeu fica no Histórico. */
export interface ConflitoNuvem {
  quando: string;
  /** Rótulo do módulo ("Kanban"). */
  modulo: string;
  /** Título ou nome do item, quando ele tem um. */
  item: string;
  venceu: 'local' | 'remoto';
  /** Nome do outro dispositivo. */
  dispositivo: string;
}

export const MAX_CONFLITOS_GUARDADOS = 30;

export interface NuvemFile {
  schemaVersion: number;
  /** Identidade deste computador: cada mudança enviada leva o id, e o nome aparece para os outros. */
  dispositivo: { id: string; nome: string };
  /**
   * O conjunto de dados compartilhado. Todo computador que usa o mesmo espaço no mesmo
   * banco vê os mesmos dados; dois espaços no mesmo banco não se misturam.
   */
  espaco: string;
  provedor: ProvedorNuvem | '';
  /** Endereço do projeto (https://xxxx.supabase.co). A chave fica no cofre. */
  supabase: { url: string };
  /** Já entrou no espaço (escolheu enviar, trazer ou juntar): daí em diante é só sincronizar. */
  conectado: boolean;
  /**
   * O computador que faz o que não pode ser feito em dobro: buscar os leads na caixa da nuvem e
   * enviar os lotes do WhatsApp. Dois fazendo isso criariam o mesmo contato duas vezes. Um por espaço.
   */
  principal: boolean;
  /** Último `rev` lido da nuvem. */
  rev: number;
  ultimaSyncEm: string;
  ultimoErro: string;
  conflitos: ConflitoNuvem[];
}

/** O que cada arquivo tem para sincronizar, para a tela. */
export interface ResumoArquivoNuvem {
  chave: ChaveBundle;
  rotulo: string;
  sincroniza: boolean;
  porque: string;
  /** Registros que iriam para a nuvem (itens, mais o `_resto` e as ordens). */
  registros: number;
  /** Só os itens de verdade (cards, contatos…): é o número que faz sentido para o usuário. */
  itens: number;
  bytes: number;
}

export interface DispositivoNuvem {
  id: string;
  nome: string;
  versao: string;
  vistoEm: string;
}

export interface EstadoNuvem {
  dispositivo: { id: string; nome: string };
  espaco: string;
  arquivos: ResumoArquivoNuvem[];
  provedor: ProvedorNuvem | '';
  supabase: { url: string; temChave: boolean; finalChave: string };
  conectado: boolean;
  principal: boolean;
  sincronizando: boolean;
  ultimaSyncEm: string;
  ultimoErro: string;
  conflitos: ConflitoNuvem[];
  /** Arquivos que vieram de uma versão mais nova do Iris: parados até atualizar este. */
  pausados: string[];
}

/** O que "Testar conexão" descobriu. */
export interface TesteNuvem {
  ok: boolean;
  mensagem: string;
  /** null = conectou, mas as tabelas ainda não existem. */
  esquema: number | null;
  /** Registros do espaço na nuvem (0 = vazio). */
  registros: number;
  dispositivos: DispositivoNuvem[];
}

export interface ResultadoSync {
  enviados: number;
  recebidos: number;
  conflitos: number;
}

/** Resultado de "Gerar arquivo para banco de dados"; `null` = diálogo cancelado. */
export interface ExtracaoGerada {
  arquivo: string;
  registros: number;
  bytes: number;
}

export const MAX_NOME_DISPOSITIVO = 40;
