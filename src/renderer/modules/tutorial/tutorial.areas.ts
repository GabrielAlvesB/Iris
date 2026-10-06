import type { Guia } from './tutorial.types.js';
import { descritorDe } from '../../../shared/types/ia.types.js';

/**
 * Um guia por área do app: o que ela resolve, o caminho do primeiro uso e os
 * atalhos que ninguém descobre sozinho. As verificações aqui são só as que
 * dizem algo útil ("já tem uma empresa cadastrada?") — o resto é leitura.
 */

/** Pergunta ao catálogo de Postagens; `videos.getFile` é barato (arquivo local). */
async function temEmpresa(): Promise<boolean> {
  const r = await window.irisAPI.videos.getFile();
  return r.ok && r.data.tags.some((t) => t.empresa);
}

export const GUIA_COMECAR: Guia = {
  id: 'comecar',
  titulo: 'Primeiros passos',
  chamada: 'O que é o Iris, onde ficam seus dados e o que configurar primeiro.',
  grupo: 'comecar',
  icone: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  resumo:
    'O Iris junta num app só o que costuma ficar espalhado: tarefas, conteúdo para redes sociais, relatórios para clientes, roteiros, arquivos e as ferramentas técnicas do dia a dia. Tudo roda no seu computador — sem conta, sem servidor e sem enviar seus dados para lugar nenhum.',
  passos: [
    {
      id: 'comecar.mapa',
      titulo: 'Conheça a barra lateral',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'A barra lateral é uma coluna de ícones. Passe o mouse para ver o nome; os ícones de categoria abrem, ao lado, um painel com as áreas daquela categoria:',
        },
        {
          tipo: 'lista',
          itens: [
            'Kanban e To-do abrem direto — o trabalho do dia a dia.',
            'Conteúdo — Postagens, Estúdio IA, Relatórios, Roteiros e Sheets.',
            'Arquivos — Biblioteca, Quadro, Copy, Pensamentos e Links rápidos.',
            'Sistema — Servidores, n8n e GitHub, para quem cuida de infraestrutura.',
            'Tráfego pago abre direto.',
            'Embaixo: a busca rápida, este Tutorial e os Ajustes.',
          ],
        },
        {
          tipo: 'atalhos',
          itens: [
            { teclas: ['Ctrl', 'P'], texto: 'Busca rápida: digite o nome de uma área, de uma seção de Ajustes ou de um guia' },
            { teclas: ['Ctrl', 'B'], texto: 'Fixa (ou solta) o painel com todas as áreas ao lado dos ícones' },
          ],
        },
        {
          tipo: 'aviso',
          nivel: 'dica',
          texto: 'Não precisa usar tudo. Comece pela área que resolve o seu problema de hoje — as outras continuam ali, sem atrapalhar.',
        },
      ],
    },
    {
      id: 'comecar.dados',
      titulo: 'Seus dados ficam no seu computador',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Tudo o que você cria fica em arquivos dentro da pasta do Iris no seu usuário do Windows. Não existe login nem nuvem: se o computador quebrar, só o backup traz seus dados de volta.',
        },
        {
          tipo: 'lista',
          numerada: true,
          itens: [
            'Abra Ajustes › Backup',
            'Clique em exportar e guarde o arquivo num lugar seguro (pendrive, Google Drive, OneDrive…)',
            'Para voltar, use importar no mesmo lugar — num computador novo ou depois de reinstalar',
          ],
        },
        {
          tipo: 'aviso',
          nivel: 'atencao',
          texto:
            'Senhas, tokens e chaves de IA não vão no backup, de propósito: elas são cifradas com uma chave deste computador e não abririam em outro. Depois de restaurar, cole-as de novo em Ajustes.',
        },
        { tipo: 'abrir', rotulo: 'Abrir Ajustes › Backup', ajustes: 'backup' },
      ],
    },
    {
      id: 'comecar.ia',
      titulo: 'Ligue a inteligência artificial (opcional)',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Com uma chave de IA sua, o Iris escreve legendas, roteiros e textos de relatório e gera imagens e thumbnails. Sem ela, tudo continua funcionando — só os botões de IA ficam de fora.',
        },
        { tipo: 'aviso', nivel: 'dica', texto: 'O guia "Inteligência artificial" mostra, provedor por provedor, onde pegar a chave e quanto custa.' },
      ],
      verificar: async () => {
        const r = await window.irisAPI.ia.getConfig();
        return r.ok && r.data.provedores.some((p) => p.configurado);
      },
      opcional: true,
    },
    {
      id: 'comecar.preferencias',
      titulo: 'Deixe o app do seu jeito',
      blocos: [
        {
          tipo: 'lista',
          itens: [
            'Ajustes › Preferências — em qual área o Iris abre ao iniciar, entre outras opções gerais.',
            'Ajustes › Empresas e tags — as empresas que você atende e as tags das postagens.',
            'Ajustes › Relatórios — a assinatura que sai no fim de cada PDF.',
          ],
        },
        { tipo: 'abrir', rotulo: 'Abrir Ajustes › Preferências', ajustes: 'preferencias' },
      ],
    },
    {
      id: 'comecar.atualizar',
      titulo: 'Mantenha o Iris atualizado',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'O Iris confere sozinho se há versão nova (ao abrir e a cada 6 horas). Quando houver, aparece um aviso na barra lateral; é só clicar para baixar e instalar — seus dados continuam onde estavam.',
        },
        {
          tipo: 'aviso',
          nivel: 'atencao',
          texto:
            'Se o Windows bloquear o instalador ("Controle Inteligente de Aplicativos"), o Iris explica o que fazer. Em Ajustes › Atualizações também dá para escolher outra versão ou instalar de um arquivo.',
        },
        { tipo: 'abrir', rotulo: 'Abrir Ajustes › Atualizações', ajustes: 'atualizacoes' },
      ],
    },
  ],
};

const GUIA_KANBAN: Guia = {
  id: 'kanban',
  titulo: 'Kanban',
  chamada: 'Cards em colunas para enxergar o que está parado e o que anda.',
  grupo: 'dia',
  modulo: 'kanban',
  resumo:
    'O Kanban mostra o trabalho como cards que andam da esquerda para a direita, de coluna em coluna. Bom para tudo que tem etapas: um projeto, um cliente, a produção de um vídeo.',
  passos: [
    {
      id: 'kanban.card',
      titulo: 'Crie o primeiro card',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Clique em "Novo card" no topo — ele nasce na primeira coluna. No painel que abre, dê um título e, se quiser, descrição, prioridade, prazo e subtarefas.',
        },
        { tipo: 'atalhos', itens: [{ teclas: ['Ctrl', 'K'], texto: 'Novo card, de qualquer lugar do quadro' }] },
      ],
    },
    {
      id: 'kanban.mover',
      titulo: 'Arraste para avançar',
      blocos: [
        {
          tipo: 'texto',
          texto: 'Arraste o card para a próxima coluna quando a etapa mudar. Para concluir, arraste até a coluna final ou abra o card e use "Concluir card".',
        },
        {
          tipo: 'aviso',
          nivel: 'dica',
          texto:
            'Clique no número de cards de uma coluna para definir um limite (WIP). Coluna cheia avisa — é um lembrete para terminar algo antes de puxar o próximo.',
        },
      ],
    },
    {
      id: 'kanban.origem',
      titulo: 'Cards que chegam de outras áreas',
      blocos: [
        {
          tipo: 'lista',
          itens: [
            'Um roteiro aprovado vira card na primeira coluna, com o texto na descrição.',
            'Uma checklist do To-do pode ser enviada para qualquer coluna, com os itens como subtarefas.',
            'Uma tarefa do Quadro também pode vir para cá.',
          ],
        },
        { tipo: 'aviso', nivel: 'info', texto: 'Com a IA ligada, o card ganha "Sugerir" nas subtarefas e o botão IA na descrição.' },
      ],
    },
  ],
};

const GUIA_TODO: Guia = {
  id: 'todo',
  titulo: 'To-do',
  chamada: 'Checklists rápidas do dia a dia, que viram card quando crescem.',
  grupo: 'dia',
  modulo: 'todo',
  resumo:
    'Listas de verificação para o que é pequeno demais para um card: compras, conferências, passos de uma entrega. Cada checklist tem cor, prioridade e prazo, e tudo se edita no próprio cartão.',
  passos: [
    {
      id: 'todo.criar',
      titulo: 'Crie uma checklist',
      blocos: [
        { tipo: 'texto', texto: 'Crie a checklist e vá adicionando itens no campo "Adicionar item" do próprio cartão.' },
        { tipo: 'aviso', nivel: 'dica', texto: 'Colou várias linhas de uma vez? Cada linha vira um item.' },
      ],
    },
    {
      id: 'todo.abas',
      titulo: 'Abertas, Concluídas e Arquivadas',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'A tela inicial mostra só o que está aberto. Quando o último item é marcado, a checklist vai para Concluídas e aparece um aviso com "Ver" e "Desfazer". Em Concluídas há "Arquivar todas" para limpar a área.',
        },
      ],
    },
    {
      id: 'todo.kanban',
      titulo: 'Mande para o Kanban',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'No menu "⋯" da checklist, "Enviar ao Kanban" cria um card na coluna que você escolher, com os itens como subtarefas. A checklist fica marcada como enviada e mostra em que coluna o card está.',
        },
        { tipo: 'abrir', rotulo: 'Abrir o To-do', modulo: 'todo' },
      ],
    },
  ],
};

const GUIA_POSTAGENS: Guia = {
  id: 'postagens',
  titulo: 'Postagens',
  chamada: 'A produção de vídeos e imagens, da ideia até publicado.',
  grupo: 'conteudo',
  modulo: 'postagens',
  resumo:
    'Postagens organiza todo o conteúdo para redes sociais numa pipeline por etapas, com calendário, agenda e métricas. Vídeos e imagens têm o mesmo jeito de trabalhar — troque o tipo no seletor do topo.',
  passos: [
    {
      id: 'postagens.empresas',
      titulo: 'Cadastre suas empresas e tags',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Empresa é para quem o conteúdo é feito (o cliente, a sua marca); tags são assuntos livres. Uma postagem pode ter uma empresa e várias tags. Elas filtram a pipeline, as métricas e os relatórios.',
        },
        { tipo: 'abrir', rotulo: 'Abrir Ajustes › Empresas e tags', ajustes: 'empresas' },
      ],
      verificar: temEmpresa,
    },
    {
      id: 'postagens.pipeline',
      titulo: 'Crie e avance pela pipeline',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Cada coluna é uma etapa (ideia, roteiro, gravação, edição…). Crie a postagem, abra o painel para preencher título, descrição, redes, materiais e prazo, e arraste o card de etapa em etapa.',
        },
        {
          tipo: 'aviso',
          nivel: 'dica',
          texto: 'As fases da pipeline podem ser recolhidas numa faixa estreita para sobrar espaço; o último card aberto fica marcado.',
        },
      ],
    },
    {
      id: 'postagens.agenda',
      titulo: 'Agende a publicação',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'No painel, escolha data e horário. Com os dois marcados no futuro, a postagem vai sozinha para "agendado"; quando a hora chega, o Iris a marca como publicada.',
        },
        {
          tipo: 'lista',
          itens: [
            'O horário aceita digitação livre: "1830", "9h", "21:15".',
            'Horários padrão com nome (ex.: "Almoço — 12:00") aparecem primeiro — cadastre em Ajustes › Horários padrão.',
            'O Calendário deixa arrastar postagens de um dia para outro; a Agenda lista o que vem por aí e o histórico.',
          ],
        },
      ],
    },
    {
      id: 'postagens.metricas',
      titulo: 'Acompanhe as métricas e o score',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'A aba Métricas mostra o que foi publicado por mês, rede e empresa. Se você usa uma nota (score de 0 a 100) para as postagens, as escalas de score definem o que é positivo, mediano ou negativo — cada empresa pode ter a sua.',
        },
        { tipo: 'abrir', rotulo: 'Abrir Ajustes › Escalas de score', ajustes: 'escalas' },
      ],
    },
    {
      id: 'postagens.sheets',
      titulo: 'Traga ideias de uma planilha',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Se suas pautas estão numa planilha, importe-a no Sheets e envie as linhas para Postagens. Cada postagem guarda uma cópia — apagar a planilha depois não afeta nada.',
        },
      ],
    },
  ],
};

const GUIA_ESTUDIO: Guia = {
  id: 'estudio',
  titulo: 'Estúdio IA',
  chamada: 'Thumbnails e imagens a partir de texto ou das suas imagens.',
  grupo: 'conteudo',
  modulo: 'ia',
  resumo:
    'O Estúdio gera imagens com a sua chave de IA, já no tamanho certo de cada formato (thumbnail, feed, story…). Tudo o que sai fica numa galeria interna, de onde dá para salvar na Biblioteca ou anexar a uma postagem.',
  passos: [
    {
      id: 'estudio.chave',
      titulo: 'Tenha um provedor que gera imagem',
      blocos: [
        {
          tipo: 'texto',
          texto: 'OpenRouter, OpenAI e Google geram imagens; Claude, Groq, DeepSeek, Mistral e as IAs locais só escrevem. Veja o guia "Inteligência artificial" para configurar.',
        },
      ],
      verificar: async () => {
        const r = await window.irisAPI.ia.getConfig();
        return r.ok && r.data.provedores.some((p) => p.configurado && descritorDe(p.id).capacidades.includes('imagem'));
      },
    },
    {
      id: 'estudio.criar',
      titulo: 'Descreva e escolha os formatos',
      blocos: [
        {
          tipo: 'lista',
          numerada: true,
          itens: [
            'Escreva o que você quer na imagem',
            'Marque um ou mais formatos — cada um vira uma imagem própria',
            'Se quiser, anexe imagens de referência (do computador, da Biblioteca ou da galeria)',
            'Gere e acompanhe o andamento na galeria',
          ],
        },
        { tipo: 'aviso', nivel: 'dica', texto: 'Sem ideia? "Pedir ideias" traz quatro conceitos diferentes e transforma o escolhido em pedido.' },
      ],
    },
    {
      id: 'estudio.galeria',
      titulo: 'Ajuste e aproveite o resultado',
      blocos: [
        {
          tipo: 'lista',
          itens: [
            '"Modificar" pede uma alteração a partir de uma imagem já gerada.',
            'Na visualização grande, as setas ← → passam pelas imagens.',
            '"Salvar na Biblioteca" copia o arquivo para a sua pasta; anexar a uma postagem também.',
          ],
        },
        { tipo: 'abrir', rotulo: 'Abrir o Estúdio IA', modulo: 'ia' },
      ],
    },
  ],
};

const GUIA_RELATORIOS: Guia = {
  id: 'relatorios',
  titulo: 'Relatórios',
  chamada: 'PDFs de resultado para clientes, com números e análise.',
  grupo: 'conteudo',
  modulo: 'relatorios',
  resumo:
    'Relatórios monta documentos em PDF para mostrar resultados a uma empresa: números do período, postagens comentadas e próximos passos. O editor segue a ordem do PDF, então o que você vê à esquerda é o que sai no documento.',
  passos: [
    {
      id: 'relatorios.novo',
      titulo: 'Comece por um modelo',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Em "Novo relatório", escolha a empresa e um modelo: "Resultados do mês", "Análise de postagens" ou "Em branco". O modelo só cria a estrutura — nenhum texto é inventado.',
        },
      ],
    },
    {
      id: 'relatorios.partes',
      titulo: 'Preencha as quatro partes',
      blocos: [
        {
          tipo: 'lista',
          numerada: true,
          itens: [
            'Capa — título, período e empresa',
            'Informações gerais — resumo e objetivos',
            'Seções — introdução, blocos de conteúdo (texto, métricas, comparativo, ranking, tabela…) e as postagens analisadas',
            'Fechamento — conclusão e próximos passos',
          ],
        },
        {
          tipo: 'aviso',
          nivel: 'dica',
          texto: 'O mapa à esquerda marca com ✓ cada parte que já tem conteúdo. Cada campo tem "Como escrever" com perguntas-guia e "Começar com os números".',
        },
      ],
    },
    {
      id: 'relatorios.numeros',
      titulo: 'Números que não mudam sozinhos',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Blocos de métricas calculam a partir das suas postagens e guardam o resultado como uma fotografia. Ele só muda se você alterar o filtro ou clicar em recalcular — o relatório enviado continua batendo com o que o cliente viu.',
        },
      ],
    },
    {
      id: 'relatorios.pdf',
      titulo: 'Exporte o PDF',
      blocos: [
        {
          tipo: 'texto',
          texto: 'Confira a prévia e exporte. A assinatura do fim do documento vem de Ajustes › Relatórios.',
        },
        { tipo: 'abrir', rotulo: 'Abrir Ajustes › Relatórios', ajustes: 'relatorios' },
      ],
    },
  ],
};

const GUIA_ROTEIROS: Guia = {
  id: 'roteiros',
  titulo: 'Roteiros',
  chamada: 'Escreva cena por cena; aprovado vira card no Kanban.',
  grupo: 'conteudo',
  modulo: 'roteiros',
  resumo:
    'Roteiros é um estúdio de escrita para vídeo: o texto é dividido em cenas (gancho, abertura, demonstração, CTA…), com o tempo de fala calculado enquanto você escreve. Depois passa por revisão e aprovação.',
  passos: [
    {
      id: 'roteiros.briefing',
      titulo: 'Comece pelo briefing',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Tema, público, tom, objetivo e duração alvo. Eles orientam a IA e o cálculo de tempo — Reels usa 170 palavras por minuto, YouTube 150 e live 140.',
        },
      ],
    },
    {
      id: 'roteiros.cenas',
      titulo: 'Escreva as cenas',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Cada cena tem a fala (só ela conta no tempo), o que aparece na tela e notas. Escreva em cartões, em duas colunas (áudio × vídeo) ou em texto livre — dá para trocar a qualquer momento.',
        },
        {
          tipo: 'lista',
          itens: [
            'A linha do tempo no topo mostra quanto cada cena ocupa.',
            '"Foco" esconde as laterais para escrever sem distração.',
            'O teleprompter rola o texto no ritmo da fala.',
          ],
        },
      ],
    },
    {
      id: 'roteiros.ia',
      titulo: 'Use a IA como parceira',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'O assistente sugere ângulos, monta a estrutura e escreve cena por cena; o revisor aponta problemas. Toda troca mostra antes × depois e guarda uma versão automática antes de aplicar.',
        },
      ],
    },
    {
      id: 'roteiros.aprovar',
      titulo: 'Revise e aprove',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'O roteiro passa de rascunho para revisão e depois aprovado ou reprovado (com motivo). Aprovar cria um card na primeira coluna do Kanban com o roteiro na descrição.',
        },
        { tipo: 'aviso', nivel: 'info', texto: 'Em Versões dá para comparar lado a lado e restaurar qualquer versão anterior.' },
      ],
    },
  ],
};

const GUIA_SHEETS: Guia = {
  id: 'sheets',
  titulo: 'Sheets',
  chamada: 'Tabelas importadas de planilhas, prontas para virar postagens.',
  grupo: 'conteudo',
  modulo: 'sheets',
  resumo:
    'Sheets guarda tabelas dentro do Iris — importadas de Excel ou CSV, ou criadas do zero. A ligação principal é com Postagens: cada linha pode virar um vídeo.',
  passos: [
    {
      id: 'sheets.importar',
      titulo: 'Importe uma planilha',
      blocos: [
        {
          tipo: 'texto',
          texto: 'Escolha o arquivo e confira a prévia. Cada coluna tem uma caixa de seleção — desmarque o que não interessa antes de confirmar.',
        },
      ],
    },
    {
      id: 'sheets.enviar',
      titulo: 'Envie linhas para Postagens',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Cada linha tem seu botão de envio. O Iris reconhece as colunas pelo nome (título, data, hora, rede, prioridade, score…) e lembra o mapeamento para a próxima vez.',
        },
        {
          tipo: 'aviso',
          nivel: 'info',
          texto: 'Colunas que não são campos do Iris viram "informações extras" da postagem. O vídeo guarda uma cópia: mudar ou apagar a tabela depois não mexe na pipeline.',
        },
      ],
    },
  ],
};

const GUIA_BIBLIOTECA: Guia = {
  id: 'biblioteca',
  titulo: 'Biblioteca',
  chamada: 'Seus arquivos organizados em coleções, sem mudar nada de lugar.',
  grupo: 'arquivos',
  modulo: 'explorador',
  resumo:
    'A Biblioteca organiza materiais e referências que já estão no seu computador. Ela não copia nem move arquivos: guarda só a curadoria — coleção, tags e uma nota — sobre as pastas que você escolhe monitorar.',
  passos: [
    {
      id: 'biblioteca.pasta',
      titulo: 'Escolha as pastas a monitorar',
      blocos: [
        {
          tipo: 'texto',
          texto: 'Clique em "Monitorar pasta" e escolha onde ficam seus materiais. Só o que está dentro dessas pastas aparece no Iris.',
        },
      ],
      verificar: async () => {
        const r = await window.irisAPI.explorador.getRaizes();
        return r.ok && r.data.raizes.length > 0;
      },
    },
    {
      id: 'biblioteca.colecoes',
      titulo: 'Organize em coleções',
      blocos: [
        {
          tipo: 'texto',
          texto: 'Adicione arquivos a coleções (Thumbnails, Logos, Referências…) e dê tags e notas. Eles continuam no mesmo lugar do disco.',
        },
        {
          tipo: 'lista',
          itens: [
            'Recentes — o que você abriu por último.',
            'Busca — procura pelo nome em todas as pastas monitoradas.',
            'Pastas — navegue pelos arquivos como no Explorador do Windows.',
          ],
        },
        {
          tipo: 'aviso',
          nivel: 'info',
          texto: 'Se um arquivo for movido ou apagado fora do Iris, ele aparece como ausente em vez de sumir sem aviso.',
        },
      ],
    },
  ],
};

const GUIA_QUADRO: Guia = {
  id: 'quadro',
  titulo: 'Quadro',
  chamada: 'Uma tela livre para notas, tarefas e rotinas.',
  grupo: 'arquivos',
  modulo: 'quadro',
  resumo:
    'O Quadro é um espaço infinito para espalhar blocos onde quiser: notas soltas, tarefas e rotinas (hábitos com dias e horário, que contam os dias seguidos).',
  passos: [
    {
      id: 'quadro.blocos',
      titulo: 'Três tipos de bloco',
      blocos: [
        {
          tipo: 'lista',
          itens: [
            'Nota — uma ideia solta; o título sai das primeiras palavras.',
            'Tarefa — algo a fazer, que pode ir para o Kanban depois.',
            'Rotina — um hábito com dias e horário; o quadro conta a sequência.',
          ],
        },
      ],
    },
    {
      id: 'quadro.navegar',
      titulo: 'Navegue pela tela',
      blocos: [
        { tipo: 'texto', texto: 'Arraste o fundo para se mover e use o zoom para ver o todo ou chegar perto. Os blocos ficam onde você os soltar.' },
      ],
    },
  ],
};

const GUIA_COPY: Guia = {
  id: 'copy',
  titulo: 'Copy',
  chamada: 'Textos prontos para copiar com um clique.',
  grupo: 'arquivos',
  modulo: 'copy',
  resumo:
    'Copy guarda os textos que você repete toda semana — respostas, assinaturas, descrições padrão, chamadas para ação — para copiar sem procurar.',
  passos: [
    {
      id: 'copy.usar',
      titulo: 'Salve e copie',
      blocos: [
        { tipo: 'texto', texto: 'Crie um texto com um nome fácil de reconhecer. Um clique no cartão copia o conteúdo inteiro.' },
        { tipo: 'atalhos', itens: [{ teclas: ['Ctrl', '1…9'], texto: 'Copia o 1º ao 9º texto da lista, sem usar o mouse' }] },
      ],
    },
  ],
};

const GUIA_PENSAMENTOS: Guia = {
  id: 'pensamentos',
  titulo: 'Pensamentos',
  chamada: 'Post-its para capturar ideias antes que fujam.',
  grupo: 'arquivos',
  modulo: 'pensamentos',
  resumo:
    'Pensamentos é um mural de post-its para tirar ideias da cabeça rápido. Escreva #palavra no texto e ela vira uma tag para filtrar depois.',
  passos: [
    {
      id: 'pensamentos.postit',
      titulo: 'Anote rápido',
      blocos: [
        {
          tipo: 'atalhos',
          itens: [
            { teclas: ['N'], texto: 'Novo post-it' },
            { teclas: ['Ctrl', 'Enter'], texto: 'Termina a edição' },
            { teclas: ['Esc'], texto: 'Sai da edição' },
          ],
        },
        { tipo: 'aviso', nivel: 'dica', texto: 'Mude a cor do papel para separar assuntos; o texto ajusta o contraste sozinho.' },
      ],
    },
    {
      id: 'pensamentos.ia',
      titulo: 'Transforme ideia em ação',
      blocos: [
        {
          tipo: 'texto',
          texto: 'Com a IA ligada, o botão do post-it desenvolve a ideia, melhora o texto ou a transforma numa checklist no To-do.',
        },
      ],
    },
  ],
};

const GUIA_LINKS: Guia = {
  id: 'links',
  titulo: 'Links rápidos',
  chamada: 'Atalhos para os sites que você mais abre.',
  grupo: 'arquivos',
  modulo: 'links',
  resumo: 'Uma página de favoritos dentro do Iris: painéis de clientes, ferramentas, documentos que você abre todo dia.',
  passos: [
    {
      id: 'links.usar',
      titulo: 'Salve seus atalhos',
      blocos: [
        { tipo: 'texto', texto: 'Adicione o endereço e um nome. Clicar abre no seu navegador padrão.' },
      ],
    },
  ],
};

const GUIA_TRAFEGO: Guia = {
  id: 'trafego',
  titulo: 'Tráfego pago',
  chamada: 'Campanhas, investimento e retorno por cliente.',
  grupo: 'trafego',
  modulo: 'trafego',
  resumo:
    'Tráfego pago acompanha campanhas de anúncio por conta (cliente): quanto foi investido, cliques, conversões e retorno. CTR, CPC, CPM, CPA e ROAS são calculados na hora a partir dos números do dia.',
  passos: [
    {
      id: 'trafego.conta',
      titulo: 'Cadastre a conta e os sites',
      blocos: [
        {
          tipo: 'texto',
          texto: 'Conta é o cliente ou empresa, com a verba mensal. Sites são as páginas que recebem o tráfego (landing page, loja, publicação).',
        },
      ],
      verificar: async () => {
        const r = await window.irisAPI.trafego.getFile();
        return r.ok && r.data.contas.length > 0;
      },
    },
    {
      id: 'trafego.campanha',
      titulo: 'Crie as campanhas',
      blocos: [
        {
          tipo: 'texto',
          texto: 'A campanha nasce em Planejamento. Plataforma, objetivo, orçamento, público e criativos se preenchem quando você quiser; arraste entre colunas conforme o status muda.',
        },
      ],
    },
    {
      id: 'trafego.resultados',
      titulo: 'Lance os resultados',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Registre os números de cada dia na mão ou importe a planilha exportada da plataforma de anúncios — o Iris acha as colunas pelo nome e soma linhas do mesmo dia.',
        },
        {
          tipo: 'aviso',
          nivel: 'info',
          texto: 'Um dia tem um registro só: importar de novo um dia que já existe substitui os números dele em vez de duplicar.',
        },
      ],
    },
  ],
};

const GUIA_AJUSTES: Guia = {
  id: 'ajustes',
  titulo: 'Ajustes',
  chamada: 'Conexões, segurança, preferências, atualizações e backup.',
  grupo: 'app',
  modulo: 'ajustes',
  resumo: 'Tudo o que vale para o app inteiro mora em Ajustes. Cada seção mostra, na lista à esquerda, se já está configurada.',
  passos: [
    {
      id: 'ajustes.secoes',
      titulo: 'O que tem em cada seção',
      blocos: [
        {
          tipo: 'lista',
          itens: [
            'n8n, GitHub e Inteligência artificial — as conexões com serviços externos.',
            'Empresas e tags, Escalas de score e Horários padrão — o catálogo usado por Postagens e Relatórios.',
            'Segurança — o cofre do Windows onde ficam senhas e chaves.',
            'Preferências — comportamento geral, como a área que abre ao iniciar.',
            'Relatórios — a assinatura do PDF.',
            'Atualizações — versão nova, outra versão ou instalar de um arquivo.',
            'Backup — exportar e importar seus dados.',
          ],
        },
        { tipo: 'abrir', rotulo: 'Abrir Ajustes', modulo: 'ajustes' },
      ],
    },
    {
      id: 'ajustes.seguranca',
      titulo: 'Onde ficam suas senhas',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Tokens, chaves de IA e senhas de chave SSH são cifrados pelo próprio Windows e nunca voltam para a tela inteiros — o Iris mostra só se estão salvos (e, nas chaves de IA, os 4 últimos caracteres para você reconhecer qual é).',
        },
      ],
    },
  ],
};

/** Na ordem da barra lateral. n8n, Servidores e GitHub são os próprios guias de conexão. */
export const GUIAS_DAS_AREAS: Guia[] = [
  GUIA_KANBAN,
  GUIA_TODO,
  GUIA_POSTAGENS,
  GUIA_ESTUDIO,
  GUIA_RELATORIOS,
  GUIA_ROTEIROS,
  GUIA_SHEETS,
  GUIA_BIBLIOTECA,
  GUIA_QUADRO,
  GUIA_COPY,
  GUIA_PENSAMENTOS,
  GUIA_LINKS,
  GUIA_TRAFEGO,
  GUIA_AJUSTES,
];
