import type { Guia } from './tutorial.types.js';
import { GUIAS_DAS_AREAS, GUIA_COMECAR } from './tutorial.areas.js';
import { COFRE, NO_LINUX } from '../../ui/plataforma.js';

/**
 * Conteúdo dos guias em TypeScript, e não em markdown solto, porque o
 * checklist precisa consultar o estado real do app — o que só uma função faz.
 * Aqui ficam os guias de conexão (com verificação); os de cada área do app
 * estão em tutorial.areas.ts.
 */

const GUIA_N8N: Guia = {
  id: 'n8n',
  titulo: 'n8n',
  chamada: 'Veja seus fluxos de automação, se rodaram e dispare um na hora.',
  grupo: 'conectar',
  modulo: 'n8n',
  resumo:
    'O n8n é uma ferramenta de automação: você monta fluxos que ligam serviços entre si (um formulário chega, um e-mail sai, uma planilha é preenchida). O Iris não substitui o n8n — ele mostra os fluxos que você já tem, diz se rodaram com sucesso e permite disparar um deles na hora.',
  passos: [
    {
      id: 'n8n.oque',
      titulo: 'Antes de tudo: você precisa ter um n8n rodando',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'O Iris se conecta a um n8n que já existe — ele não instala nem hospeda nada. Então o primeiro passo é ter o n8n rodando em algum lugar: no seu próprio computador, num servidor seu, ou na nuvem oficial do n8n.',
        },
        {
          tipo: 'texto',
          texto:
            'Se você ainda não tem, o jeito mais rápido no seu computador é com Docker. O comando abaixo sobe o n8n e deixa ele acessível no navegador.',
        },
        {
          tipo: 'comando',
          comando: 'docker run -it --rm -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n',
          legenda: 'Depois disso, abra http://localhost:5678 no navegador',
        },
        {
          tipo: 'aviso',
          nivel: 'info',
          texto:
            'Enquanto esse comando estiver rodando no terminal, o n8n está no ar. Se você fechar o terminal, ele para — e o Iris passa a mostrar "desconectado".',
        },
        { tipo: 'link', url: 'https://docs.n8n.io/hosting/', rotulo: 'Documentação oficial de instalação' },
      ],
    },
    {
      id: 'n8n.url',
      titulo: 'Dizer ao Iris onde o n8n está',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Vá em Ajustes → Conexão com o n8n e preencha a URL base. É o mesmo endereço que você usa no navegador para abrir o n8n.',
        },
        {
          tipo: 'lista',
          itens: [
            'Rodando no seu PC: http://localhost:5678',
            'Num servidor seu: http://IP-DO-SERVIDOR:5678',
            'Na nuvem do n8n: https://SEU-NOME.app.n8n.cloud',
          ],
        },
        {
          tipo: 'aviso',
          nivel: 'atencao',
          texto: 'Não coloque barra no final do endereço, e não inclua /workflow nem nada depois da porta.',
        },
        { tipo: 'abrir', rotulo: 'Abrir Ajustes › n8n', ajustes: 'n8n' },
      ],
      verificar: async () => {
        const r = await window.irisAPI.n8n.getConfig();
        return r.ok && r.data.baseUrl.length > 0;
      },
    },
    {
      id: 'n8n.apikey',
      titulo: 'Gerar a API key no n8n e colar no Iris',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'A API key é o que autoriza o Iris a ler seus fluxos. Ela é gerada dentro do próprio n8n, não no Iris.',
        },
        {
          tipo: 'lista',
          numerada: true,
          itens: [
            'Abra o n8n no navegador',
            'Clique no seu perfil (canto inferior esquerdo) → Settings',
            'Vá em n8n API',
            'Clique em "Create an API key" e copie o valor que aparecer',
            'Volte ao Iris, em Ajustes, e cole no campo API key',
            'Clique em Salvar e depois em Testar conexão',
          ],
        },
        {
          tipo: 'aviso',
          nivel: 'atencao',
          texto:
            `Copie a key na hora: o n8n mostra o valor completo uma vez só. A key fica guardada cifrada no ${COFRE} e nunca mais volta para a tela — nem entra no arquivo de backup.`,
        },
      ],
      verificar: async () => {
        const r = await window.irisAPI.n8n.getConfig();
        return r.ok && r.data.temApiKey;
      },
    },
    {
      id: 'n8n.conectado',
      titulo: 'Confirmar que está conectado',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Abra a área n8n na barra lateral (categoria Sistema). No topo deve aparecer "conectado" em verde, com a lista dos seus workflows logo abaixo.',
        },
        {
          tipo: 'texto',
          texto:
            'A aba Workflows mostra cada fluxo, se está ativo ou não, e deixa você ligar e desligar. A aba Execuções mostra as últimas rodadas, com sucesso ou erro, duração, e um botão para abrir aquela execução no navegador.',
        },
      ],
      verificar: async () => {
        const r = await window.irisAPI.n8n.getSnapshot();
        return r.ok && r.data.conectado;
      },
    },
    {
      id: 'n8n.disparar',
      titulo: 'Disparar um fluxo pelo Iris',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'No card de cada workflow há o botão Executar. Ele abre uma caixa onde você pode mandar um payload JSON junto — os dados que o fluxo vai receber. Deixar em branco também funciona.',
        },
        {
          tipo: 'comando',
          comando: '{ "cliente": "ACME", "valor": 1500 }',
          legenda: 'Exemplo de payload que o seu fluxo pode ler',
        },
        {
          tipo: 'aviso',
          nivel: 'atencao',
          texto:
            'Nem toda versão do n8n permite executar pela API. Se aparecer a mensagem de HTTP 404, use um nó de Webhook no seu fluxo: o webhook gera uma URL própria que funciona em qualquer versão.',
        },
      ],
    },
  ],
};

const GUIA_SERVIDORES: Guia = {
  id: 'servidores',
  titulo: 'Servidores',
  chamada: 'Saiba quando um site cai e rode comandos por SSH sem abrir terminal.',
  grupo: 'conectar',
  modulo: 'servidores',
  resumo:
    'Esta área faz duas coisas diferentes. A primeira é vigiar um endereço na internet e avisar se ele saiu do ar. A segunda é entrar numa máquina remota por SSH para rodar comandos de conferência, sem abrir um terminal.',
  passos: [
    {
      id: 'srv.http',
      titulo: 'Monitorar um site ou API (o mais simples)',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Clique em "+ HTTP" e informe um endereço. De tempos em tempos o Iris acessa esse endereço e anota se respondeu, quanto demorou e qual código devolveu. É assim que você descobre que algo caiu sem precisar ficar testando na mão.',
        },
        {
          tipo: 'lista',
          itens: [
            'Nome: um apelido seu, como "API de produção"',
            'URL: o endereço completo, começando com http:// ou https://',
            'Status esperado: quase sempre 200, que significa "deu certo"',
            'Checar a cada: 60 segundos é um bom começo; 0 desliga a checagem automática',
          ],
        },
        {
          tipo: 'aviso',
          nivel: 'info',
          texto:
            'A bolinha verde quer dizer que a última checagem deu certo; vermelha, que falhou; cinza, que ainda não foi checado. As barrinhas abaixo são o histórico — altura é o tempo de resposta.',
        },
      ],
      verificar: async () => {
        const r = await window.irisAPI.servidores.getState();
        return r.ok && r.data.servidores.some((s) => s.tipo === 'http');
      },
    },
    {
      id: 'srv.ssh.oque',
      titulo: 'Entender o SSH antes de configurar',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'SSH é o jeito de entrar numa máquina remota e rodar comandos nela. Em vez de senha, o Iris usa chave — um par de arquivos onde um fica no seu PC (privado, secreto) e o outro vai para o servidor (público).',
        },
        {
          tipo: 'texto',
          texto:
            'A vantagem: você não digita senha, e ninguém consegue entrar sem ter o arquivo privado. O Iris só aceita esse método, justamente por ser o mais seguro.',
        },
      ],
    },
    {
      id: 'srv.ssh.chave',
      titulo: 'Criar a chave (se ainda não tiver)',
      blocos: [
        { tipo: 'texto', texto: NO_LINUX ? 'Abra o Terminal e rode:' : 'Abra o PowerShell no seu computador e rode:' },
        { tipo: 'comando', comando: 'ssh-keygen -t ed25519 -C "iris"', legenda: 'Pode aceitar todos os padrões apertando Enter' },
        {
          tipo: 'texto',
          texto:
            'Isso cria dois arquivos na pasta .ssh dentro do seu usuário: id_ed25519 (o privado, que fica só aqui) e id_ed25519.pub (o público, que vai para o servidor).',
        },
        { tipo: 'comando', comando: NO_LINUX ? 'cat ~/.ssh/id_ed25519.pub' : 'type $env:USERPROFILE\\.ssh\\id_ed25519.pub', legenda: 'Mostra o conteúdo da chave pública para copiar' },
        {
          tipo: 'aviso',
          nivel: 'atencao',
          texto:
            'Nunca compartilhe o arquivo sem .pub no final. Ele é o equivalente à sua senha — quem tiver ele entra no servidor como você.',
        },
      ],
    },
    {
      id: 'srv.ssh.servidor',
      titulo: 'Autorizar sua chave no servidor',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'O conteúdo da chave pública precisa ser colado num arquivo do servidor chamado authorized_keys. Entrando no servidor (pelo painel do provedor ou por SSH com senha), rode:',
        },
        {
          tipo: 'comando',
          comando: 'mkdir -p ~/.ssh && nano ~/.ssh/authorized_keys',
          legenda: 'Cole a chave pública numa linha nova, salve com Ctrl+O e saia com Ctrl+X',
        },
        { tipo: 'comando', comando: 'chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys', legenda: 'O SSH recusa a chave se as permissões estiverem abertas demais' },
        {
          tipo: 'aviso',
          nivel: 'info',
          texto:
            'Muitos provedores de VPS deixam você colar a chave pública na hora de criar a máquina. Se for esse o caso, esse passo já está feito.',
        },
      ],
    },
    {
      id: 'srv.ssh.cadastrar',
      titulo: 'Cadastrar o servidor no Iris',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Clique em "+ SSH". O Iris primeiro abre uma janela para você escolher o arquivo da chave privada — o id_ed25519, sem o .pub. Depois preencha os dados da máquina.',
        },
        {
          tipo: 'lista',
          itens: [
            'Host: o IP ou domínio do servidor',
            'Porta: 22, a não ser que seu provedor use outra',
            'Usuário: root, ubuntu, ou o que o provedor informou',
            'Passphrase: só se você tiver colocado uma ao criar a chave',
          ],
        },
      ],
      verificar: async () => {
        const r = await window.irisAPI.servidores.getState();
        return r.ok && r.data.servidores.some((s) => s.tipo === 'ssh');
      },
    },
    {
      id: 'srv.ssh.comandos',
      titulo: 'Salvar comandos de conferência',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'No card do servidor SSH, clique em Comandos e depois em "+ Comando". Você dá um nome amigável e escreve o comando. Depois é só clicar no botão e a saída aparece na hora, dentro do Iris.',
        },
        {
          tipo: 'lista',
          itens: [
            'uptime — há quanto tempo a máquina está ligada e o quanto está carregada',
            'df -h — quanto espaço em disco ainda resta',
            'free -m — memória disponível',
            'docker ps — quais containers estão rodando',
            'systemctl status nginx — se um serviço específico está de pé',
            'tail -n 200 /var/log/nginx/error.log — as últimas linhas de um log',
          ],
        },
        {
          tipo: 'aviso',
          nivel: 'info',
          texto:
            'Cada clique abre uma conexão, roda o comando e fecha. Não é um terminal interativo: comandos que pedem resposta no meio do caminho não funcionam aqui.',
        },
      ],
    },
  ],
};

const GUIA_GITHUB: Guia = {
  id: 'github',
  titulo: 'GitHub',
  chamada: 'O que está publicado e o que ainda está parado no seu PC, lado a lado.',
  grupo: 'conectar',
  modulo: 'github',
  resumo:
    'Esta área junta duas visões do mesmo projeto: o que está publicado no GitHub e o que está no seu computador. Assim você vê, num lugar só, o que já foi enviado e o que ainda está parado aqui sem commit.',
  passos: [
    {
      id: 'gh.token',
      titulo: 'Criar um token de acesso',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'O token é uma senha especial que dá ao Iris permissão de leitura na sua conta. É diferente da sua senha do GitHub: pode ser revogado a qualquer momento sem afetar mais nada.',
        },
        {
          tipo: 'lista',
          numerada: true,
          itens: [
            'Abra github.com/settings/tokens',
            'Escolha "Tokens (classic)" e clique em "Generate new token (classic)"',
            'Dê um nome, como "Iris"',
            'Marque a caixa repo — é ela que permite ver também os repositórios privados',
            'Gere e copie o token na hora',
          ],
        },
        { tipo: 'link', url: 'https://github.com/settings/tokens', rotulo: 'Abrir a página de tokens do GitHub' },
        {
          tipo: 'aviso',
          nivel: 'atencao',
          texto:
            'Prefira o token clássico. O token "fine-grained" costuma não enxergar repositórios de organizações, e aí sua lista viria incompleta sem nenhum aviso de erro.',
        },
      ],
      verificar: async () => {
        const r = await window.irisAPI.github.getConfig();
        return r.ok && r.data.temToken;
      },
    },
    {
      id: 'gh.colar',
      titulo: 'Colar o token no Iris',
      blocos: [
        {
          tipo: 'texto',
          texto:
            `Em Ajustes → GitHub, cole o token e salve. Assim como a key do n8n, ele fica cifrado no ${COFRE}, nunca volta para a tela e não entra no backup.`,
        },
        { tipo: 'abrir', rotulo: 'Abrir Ajustes › GitHub', ajustes: 'github' },
      ],
    },
    {
      id: 'gh.pastas',
      titulo: 'Apontar onde ficam seus projetos no PC',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Para o Iris cruzar o que está no GitHub com o que está aqui, ele precisa saber em que pasta você guarda os projetos. Na área GitHub, clique em "+ pasta" e escolha a pasta que contém seus repositórios.',
        },
        {
          tipo: 'texto',
          texto:
            'O Iris procura dentro dela por pastas que sejam repositórios git, descendo no máximo dois níveis. Pastas como node_modules são ignoradas.',
        },
        {
          tipo: 'aviso',
          nivel: 'info',
          texto:
            'Pastas que não são repositório git simplesmente não aparecem — não é erro, é só que não há o que mostrar sobre elas.',
        },
      ],
      verificar: async () => {
        const r = await window.irisAPI.github.getConfig();
        return r.ok && r.data.pastas.length > 0;
      },
    },
    {
      id: 'gh.ler',
      titulo: 'Ler a tela',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Cada card é um projeto. O marcador colorido à esquerda indica que ele também existe neste computador. Quando existe, aparece a linha do estado local: em qual branch você está, quantas alterações ainda não foram enviadas e quantos commits você está à frente ou atrás.',
        },
        {
          tipo: 'lista',
          itens: [
            'Com alterações — filtra só o que está com trabalho pendente aqui',
            'Neste PC — só os projetos que você tem baixado',
            'Privados — só os repositórios fechados',
          ],
        },
        {
          tipo: 'aviso',
          nivel: 'atencao',
          texto:
            'O "à frente/atrás" é comparado ao último git fetch feito naquele repositório. Se você não busca atualizações há dias, esse número pode estar desatualizado.',
        },
      ],
    },
    {
      id: 'gh.explorador',
      titulo: 'Informação de git na Biblioteca',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Na Biblioteca (categoria Arquivos), aba Pastas: quando uma pasta monitorada é um repositório git, aparece uma faixa no topo com o branch, o último commit e quantas alterações há. Na lista, cada arquivo ganha uma marca colorida à esquerda.',
        },
        {
          tipo: 'lista',
          itens: [
            'Verde: arquivo novo, que o git ainda não acompanha',
            'Amarelo: arquivo que você alterou',
            'Vermelho: arquivo apagado',
            'Cinza: arquivo ignorado pelo .gitignore',
          ],
        },
      ],
    },
  ],
};

/** Um provedor configurado? Usado pelos passos de cada provedor. */
async function provedorPronto(id: string): Promise<boolean> {
  const r = await window.irisAPI.ia.getConfig();
  return r.ok && r.data.provedores.some((p) => p.id === id && p.configurado);
}

const GUIA_IA: Guia = {
  id: 'ia',
  titulo: 'Inteligência artificial',
  chamada: 'Sua própria chave de IA para escrever textos e gerar imagens.',
  grupo: 'conectar',
  icone: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  resumo:
    'O Iris usa a SUA chave de IA (OpenRouter, OpenAI/ChatGPT, Claude, Gemini ou qualquer serviço compatível) para escrever legendas, roteiros e gerar imagens e thumbnails. A chave fica cifrada no seu computador, as chamadas saem direto do app para o provedor, e o custo é cobrado pelo provedor na sua conta — o Iris não cobra nada nem guarda seus pedidos em lugar nenhum além do seu PC.',
  passos: [
    {
      id: 'ia.onde',
      titulo: 'Onde a IA aparece no Iris',
      blocos: [
        {
          tipo: 'lista',
          itens: [
            'Estúdio IA (categoria Conteúdo): gerar imagens e thumbnails a partir de texto ou de imagens que você já tem ("faça uma imagem baseada nestas"), em vários formatos de uma vez (thumb, feed, story…). "Pedir ideias" traz conceitos diferentes; "Modificar" altera uma imagem já criada. Tudo fica numa galeria, e dá para salvar na Biblioteca ou anexar a uma postagem.',
            'Postagens → painel do vídeo → Conteúdo: botão "Sugerir com IA" gera opções de descrição e hashtags.',
            'Postagens → painel da imagem → Legenda: opções de legenda, CTA e texto alternativo.',
            'Postagens → Materiais: "Gerar thumbnail com IA", já com título, descrição e as imagens da postagem como referência.',
            'Roteiros → editor → botão "IA": gerar rascunho, melhorar o trecho selecionado, revisar o roteiro inteiro, sugerir gancho e CTA.',
            'Relatórios → botão "IA" no canto dos campos de texto (resumo, objetivos, seções, blocos, conclusão, próximos passos): escreve, melhora ou resume usando o relatório inteiro e os números dos blocos de métricas.',
            'Kanban → card: "Sugerir" subtarefas e o botão "IA" na descrição.',
            'To-do → "Sugerir itens" em cada checklist.',
            'Pensamentos → botão de IA no post-it: desenvolver a ideia, melhorar o texto ou virar uma checklist no To-do.',
          ],
        },
      ],
    },
    {
      id: 'ia.qual',
      titulo: 'Qual provedor escolher',
      blocos: [
        {
          tipo: 'lista',
          itens: [
            'OpenRouter — uma chave só para centenas de modelos (GPT, Claude, Gemini…), texto E imagem. O jeito mais simples de começar.',
            'OpenAI (ChatGPT) — texto e imagens (gpt-image), inclusive editar a partir de imagens de referência.',
            'Google (Gemini) — texto e imagens (Gemini Image), também com imagens de referência. Tem cota gratuita para testar.',
            'Anthropic (Claude) — excelente para textos e roteiros, mas NÃO gera imagens.',
            'Groq — Llama e outros modelos abertos, muito rápidos, com cota gratuita. Só texto.',
            'DeepSeek e Mistral — texto bom e barato; a Mistral também lê imagens.',
            'Grátis e sem internet: Ollama ou LM Studio rodam a IA no seu próprio computador (Llama, Gemma, Qwen…). Só texto, e pedem um computador com memória folgada.',
            'Compatível com OpenAI — qualquer outro serviço no mesmo formato (Together, Fireworks…).',
          ],
        },
        {
          tipo: 'texto',
          texto: 'Basta um. Os passos a seguir mostram como pegar a chave de cada provedor — siga só o do que você escolheu.',
        },
        {
          tipo: 'aviso',
          nivel: 'dica',
          texto:
            'Você pode configurar vários ao mesmo tempo e escolher um padrão para texto e outro para imagem em Ajustes. Ex.: Claude para roteiros e OpenRouter para as imagens.',
        },
        {
          tipo: 'aviso',
          nivel: 'atencao',
          texto:
            'Cada geração custa alguns centavos (imagens custam mais que texto). Coloque um limite de gasto no painel do provedor se quiser ter controle.',
        },
      ],
      verificar: async () => {
        const r = await window.irisAPI.ia.getConfig();
        return r.ok && r.data.provedores.some((p) => p.configurado);
      },
    },
    {
      id: 'ia.openrouter',
      titulo: 'OpenRouter',
      blocos: [
        {
          tipo: 'lista',
          numerada: true,
          itens: [
            'Crie a conta em openrouter.ai e coloque crédito em Credits (a partir de US$ 5)',
            'Em Keys, clique em "Create Key", dê um nome (ex.: Iris) e copie a chave (começa com sk-or-)',
            'No Iris: Ajustes → Inteligência artificial → OpenRouter → cole a chave → Salvar → Testar',
            'Para imagens, escolha um modelo marcado como "gera imagem" (ex.: google/gemini-2.5-flash-image)',
          ],
        },
        { tipo: 'link', url: 'https://openrouter.ai/settings/keys', rotulo: 'Abrir a página de chaves do OpenRouter' },
      ],
      verificar: () => provedorPronto('openrouter'),
      opcional: true,
    },
    {
      id: 'ia.openai',
      titulo: 'OpenAI (ChatGPT)',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'A assinatura do ChatGPT Plus não vale para a API: a API tem cobrança própria, por uso, na plataforma de desenvolvedores.',
        },
        {
          tipo: 'lista',
          numerada: true,
          itens: [
            'Entre em platform.openai.com e adicione crédito em Settings → Billing',
            'Em API keys, clique em "Create new secret key" e copie (começa com sk-)',
            'No Iris: Ajustes → Inteligência artificial → OpenAI → cole → Salvar → Testar',
          ],
        },
        {
          tipo: 'aviso',
          nivel: 'atencao',
          texto:
            'Para gerar imagens com gpt-image a OpenAI pode pedir que a organização seja verificada (Settings → Organization → Verify). Sem isso, a geração de imagem volta erro 403.',
        },
        { tipo: 'link', url: 'https://platform.openai.com/api-keys', rotulo: 'Abrir a página de chaves da OpenAI' },
      ],
      verificar: () => provedorPronto('openai'),
      opcional: true,
    },
    {
      id: 'ia.anthropic',
      titulo: 'Anthropic (Claude)',
      blocos: [
        {
          tipo: 'lista',
          numerada: true,
          itens: [
            'Entre em console.anthropic.com e adicione crédito em Billing',
            'Em Settings → API Keys, clique em "Create Key" e copie (começa com sk-ant-)',
            'No Iris: Ajustes → Inteligência artificial → Anthropic → cole → Salvar → Testar',
          ],
        },
        {
          tipo: 'aviso',
          nivel: 'info',
          texto: 'O Claude escreve e lê imagens, mas não gera imagens. Para o Estúdio, configure também outro provedor.',
        },
        { tipo: 'link', url: 'https://console.anthropic.com/settings/keys', rotulo: 'Abrir a página de chaves da Anthropic' },
      ],
      verificar: () => provedorPronto('anthropic'),
      opcional: true,
    },
    {
      id: 'ia.google',
      titulo: 'Google (Gemini)',
      blocos: [
        {
          tipo: 'lista',
          numerada: true,
          itens: [
            'Entre em aistudio.google.com com sua conta Google',
            'Clique em "Get API key" → "Create API key" e copie',
            'No Iris: Ajustes → Inteligência artificial → Google → cole → Salvar → Testar',
          ],
        },
        {
          tipo: 'aviso',
          nivel: 'info',
          texto: 'A cota gratuita tem limite por minuto e por dia. Para uso contínuo, ative o faturamento no Google Cloud.',
        },
        { tipo: 'link', url: 'https://aistudio.google.com/apikey', rotulo: 'Abrir o Google AI Studio' },
      ],
      verificar: () => provedorPronto('google'),
      opcional: true,
    },
    {
      id: 'ia.groq',
      titulo: 'Groq (Llama na nuvem)',
      blocos: [
        {
          tipo: 'lista',
          numerada: true,
          itens: [
            'Crie a conta em console.groq.com (dá para entrar com o Google)',
            'Em API Keys, clique em "Create API Key" e copie (começa com gsk_)',
            'No Iris: Ajustes → Inteligência artificial → Groq → cole → Salvar → Testar',
          ],
        },
        { tipo: 'aviso', nivel: 'info', texto: 'A cota gratuita tem limite por minuto e por dia. O modelo padrão é o Llama 3.3 70B; "Escolher" mostra os outros.' },
        { tipo: 'link', url: 'https://console.groq.com/keys', rotulo: 'Abrir a página de chaves do Groq' },
      ],
      verificar: () => provedorPronto('groq'),
      opcional: true,
    },
    {
      id: 'ia.deepseek-mistral',
      titulo: 'DeepSeek e Mistral',
      blocos: [
        {
          tipo: 'lista',
          itens: [
            'DeepSeek: crie a chave em platform.deepseek.com → API keys e coloque crédito em Top up.',
            'Mistral: crie a chave em console.mistral.ai → API Keys (há um plano gratuito para testar).',
            'No Iris: Ajustes → Inteligência artificial → o cartão do provedor → cole → Salvar → Testar.',
          ],
        },
      ],
      verificar: async () => (await provedorPronto('deepseek')) || provedorPronto('mistral'),
      opcional: true,
    },
    {
      id: 'ia.ollama',
      titulo: 'Ollama: IA grátis no seu computador',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'O Ollama roda modelos abertos (Llama, Gemma, Qwen, DeepSeek…) no próprio PC: não precisa de chave, não custa nada e nada sai do computador. Em troca, precisa de memória — 8 GB de RAM para modelos pequenos, 16 GB ou mais para os médios.',
        },
        {
          tipo: 'lista',
          numerada: true,
          itens: [
            'Baixe e instale o Ollama (ollama.com/download) e deixe-o aberto',
            NO_LINUX ? 'No Terminal, baixe um modelo com o comando abaixo' : 'No PowerShell, baixe um modelo com o comando abaixo',
            'No Iris: Ajustes → Inteligência artificial → No seu computador → Ollama → Ativar → Testar',
          ],
        },
        { tipo: 'comando', comando: 'ollama pull llama3.2', legenda: 'Um modelo pequeno e bom para começar (cerca de 2 GB)' },
        {
          tipo: 'aviso',
          nivel: 'dica',
          texto: 'Prefere uma tela em vez do terminal? O LM Studio faz o mesmo com janela: baixe o modelo pelo app, ligue o servidor local (aba Developer) e ative o LM Studio em Ajustes.',
        },
        { tipo: 'link', url: 'https://ollama.com/download', rotulo: 'Baixar o Ollama' },
      ],
      verificar: async () => (await provedorPronto('ollama')) || provedorPronto('lmstudio'),
      opcional: true,
    },
    {
      id: 'ia.compativel',
      titulo: 'Qualquer outra IA (compatível com OpenAI)',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Muitos serviços usam o mesmo formato da API da OpenAI. Preencha o endereço base e, se o serviço pedir, a chave:',
        },
        {
          tipo: 'lista',
          itens: ['Together: https://api.together.xyz/v1', 'Fireworks: https://api.fireworks.ai/inference/v1', 'xAI (Grok): https://api.x.ai/v1'],
        },
        {
          tipo: 'aviso',
          nivel: 'info',
          texto: 'Geração de imagem só funciona se o serviço tiver o endpoint de imagens da OpenAI; a maioria só tem texto.',
        },
      ],
      verificar: () => provedorPronto('compativel'),
      opcional: true,
    },
    {
      id: 'ia.padroes',
      titulo: 'Escolher os padrões e a pasta das imagens',
      blocos: [
        {
          tipo: 'lista',
          numerada: true,
          itens: [
            'Em Ajustes → Inteligência artificial → Padrões: escolha qual IA escreve os textos e qual gera as imagens',
            'Escolha também a pasta da Biblioteca onde "Salvar na Biblioteca" grava as imagens (padrão: uma subpasta "Iris IA" dentro de uma pasta monitorada)',
            'Toda imagem gerada fica também na galeria do Estúdio, mesmo sem salvar na Biblioteca',
          ],
        },
        { tipo: 'abrir', rotulo: 'Abrir Ajustes › Inteligência artificial', ajustes: 'ia' },
      ],
      verificar: async () => {
        const r = await window.irisAPI.ia.getConfig();
        return r.ok && Boolean(r.data.texto || r.data.imagem);
      },
    },
  ],
};

/** Ordem do índice e do "anterior/próximo": começar, conectar e depois as áreas na ordem da barra lateral. */
export const GUIAS: Guia[] = [GUIA_COMECAR, GUIA_IA, GUIA_N8N, GUIA_SERVIDORES, GUIA_GITHUB, ...GUIAS_DAS_AREAS];
