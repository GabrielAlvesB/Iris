import type { Guia } from './tutorial.types.js';

/**
 * Conteúdo dos guias em TypeScript, e não em markdown solto, porque o
 * checklist precisa consultar o estado real do app — o que só uma função faz.
 */

const GUIA_N8N: Guia = {
  id: 'n8n',
  titulo: 'n8n — automações',
  resumo:
    'O n8n é uma ferramenta de automação: você monta fluxos que ligam serviços entre si (um formulário chega, um e-mail sai, uma planilha é preenchida). O Iris não substitui o n8n — ele mostra os fluxos que você já tem, diz se rodaram com sucesso e permite disparar um deles na hora.',
  passos: [
    {
      id: 'n8n.oque',
      titulo: '1. Antes de tudo: você precisa ter um n8n rodando',
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
      titulo: '2. Dizer ao Iris onde o n8n está',
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
      ],
      verificar: async () => {
        const r = await window.irisAPI.n8n.getConfig();
        return r.ok && r.data.baseUrl.length > 0;
      },
    },
    {
      id: 'n8n.apikey',
      titulo: '3. Gerar a API key no n8n e colar no Iris',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'A API key é o que autoriza o Iris a ler seus fluxos. Ela é gerada dentro do próprio n8n, não no Iris.',
        },
        {
          tipo: 'lista',
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
            'Copie a key na hora: o n8n mostra o valor completo uma vez só. A key fica guardada cifrada no cofre do Windows e nunca mais volta para a tela — nem entra no arquivo de backup.',
        },
      ],
      verificar: async () => {
        const r = await window.irisAPI.n8n.getConfig();
        return r.ok && r.data.temApiKey;
      },
    },
    {
      id: 'n8n.conectado',
      titulo: '4. Confirmar que está conectado',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Abra a área n8n na barra lateral. No topo deve aparecer "conectado" em verde, com a lista dos seus workflows logo abaixo.',
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
      titulo: '5. Disparar um fluxo pelo Iris',
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
  titulo: 'Servidores — monitorar e acessar',
  resumo:
    'Esta área faz duas coisas diferentes. A primeira é vigiar um endereço na internet e avisar se ele saiu do ar. A segunda é entrar numa máquina remota por SSH para rodar comandos de conferência, sem abrir um terminal.',
  passos: [
    {
      id: 'srv.http',
      titulo: '1. Monitorar um site ou API (o mais simples)',
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
      titulo: '2. Entender o SSH antes de configurar',
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
      titulo: '3. Criar a chave (se ainda não tiver)',
      blocos: [
        { tipo: 'texto', texto: 'Abra o PowerShell no seu computador e rode:' },
        { tipo: 'comando', comando: 'ssh-keygen -t ed25519 -C "iris"', legenda: 'Pode aceitar todos os padrões apertando Enter' },
        {
          tipo: 'texto',
          texto:
            'Isso cria dois arquivos na pasta .ssh dentro do seu usuário: id_ed25519 (o privado, que fica só aqui) e id_ed25519.pub (o público, que vai para o servidor).',
        },
        { tipo: 'comando', comando: 'type $env:USERPROFILE\\.ssh\\id_ed25519.pub', legenda: 'Mostra o conteúdo da chave pública para copiar' },
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
      titulo: '4. Autorizar sua chave no servidor',
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
      titulo: '5. Cadastrar o servidor no Iris',
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
      titulo: '6. Salvar comandos de conferência',
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
  titulo: 'GitHub — seus projetos',
  resumo:
    'Esta área junta duas visões do mesmo projeto: o que está publicado no GitHub e o que está no seu computador. Assim você vê, num lugar só, o que já foi enviado e o que ainda está parado aqui sem commit.',
  passos: [
    {
      id: 'gh.token',
      titulo: '1. Criar um token de acesso',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'O token é uma senha especial que dá ao Iris permissão de leitura na sua conta. É diferente da sua senha do GitHub: pode ser revogado a qualquer momento sem afetar mais nada.',
        },
        {
          tipo: 'lista',
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
      titulo: '2. Colar o token no Iris',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Em Ajustes → GitHub, cole o token e salve. Assim como a key do n8n, ele fica cifrado no cofre do Windows, nunca volta para a tela e não entra no backup.',
        },
      ],
    },
    {
      id: 'gh.pastas',
      titulo: '3. Apontar onde ficam seus projetos no PC',
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
      titulo: '4. Ler a tela',
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
      titulo: '5. Informação de git no Explorador',
      blocos: [
        {
          tipo: 'texto',
          texto:
            'Quando você monitora uma pasta no Explorador e ela é um repositório git, aparece uma faixa no topo com o branch, o último commit e quantas alterações há. Na lista, cada arquivo ganha uma marca colorida à esquerda.',
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

export const GUIAS: Guia[] = [GUIA_N8N, GUIA_SERVIDORES, GUIA_GITHUB];
