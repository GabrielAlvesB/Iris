/**
 * Iris Workspace: os outros apps do ecossistema Iris, baixados e instalados
 * de dentro do Iris (como o Creative Cloud faz com os da Adobe).
 *
 * O catálogo mora no código, não num arquivo de dados: um app novo do
 * ecossistema é uma entrada em APPS_WORKSPACE, e as releases dele no GitHub
 * dizem o resto (versão, arquivos, novidades). Puro — compilado pelos dois lados.
 */

/** Formatos que o Workspace sabe tratar. Cada um diz como instala. */
export type FormatoApp = 'msi' | 'exe' | 'zip' | 'appimage' | 'deb' | 'rpm' | 'pacman' | 'targz';

export interface DescricaoFormato {
  rotulo: string;
  /** Uma linha: o que acontece ao escolher este formato. */
  explicacao: string;
  /** Instala de verdade; os outros só baixam e mostram na pasta. */
  instala: boolean;
}

export const FORMATOS: Record<FormatoApp, DescricaoFormato> = {
  msi: { rotulo: 'Instalador (.msi)', explicacao: 'Instala só para a sua conta, sem pedir administrador, com atalho no menu Iniciar.', instala: true },
  exe: { rotulo: 'Instalador (.exe)', explicacao: 'Instala só para a sua conta, sem pedir administrador, com atalho no menu Iniciar.', instala: true },
  zip: { rotulo: 'Portátil (.zip)', explicacao: 'Baixa a pasta compactada e mostra onde ficou. Nada é instalado.', instala: false },
  appimage: { rotulo: 'AppImage', explicacao: 'Guarda o arquivo em ~/Aplicativos, pronto para abrir. Nada é instalado no sistema.', instala: true },
  deb: { rotulo: 'Pacote .deb', explicacao: 'Instala pelo dpkg — o sistema pede a senha de administrador.', instala: true },
  rpm: { rotulo: 'Pacote .rpm', explicacao: 'Instala pelo rpm — o sistema pede a senha de administrador.', instala: true },
  pacman: { rotulo: 'Pacote do Arch (pacman)', explicacao: 'Instala pelo pacman — o sistema pede a senha de administrador.', instala: true },
  targz: { rotulo: 'Pasta compactada (.tar.gz)', explicacao: 'Baixa o arquivo e mostra onde ficou. Nada é instalado.', instala: false },
};

/** Plataforma e arquitetura no vocabulário do Node (process.platform / process.arch). */
export type SistemaApp = 'win32' | 'linux';

export interface AppWorkspace {
  id: string;
  nome: string;
  /**
   * "dono/repositório" no GitHub; as releases dele são a fonte de tudo.
   * Sem repo = app **em criação**: aparece na vitrine e na órbita, mas o Workspace
   * não consulta nada nem oferece instalar. Ganhou repositório, ganha o resto.
   */
  repo?: string;
  /** Uma linha, no cartão. */
  frase: string;
  descricao: string;
  recursos: Array<{ titulo: string; texto: string }>;
  /** Corpo do ícone (SVG 64×64, sem a tag <svg>) — desenhado no código, a CSP não deixa imagem externa. */
  icone: string;
  /** Matiz (oklch) do app: o cartão e a órbita usam ele, o resto vem dos tokens do tema. */
  matiz: number;
  /**
   * Luminosidade do gradiente do ícone (padrão 0,66). Amarelo nessa luminosidade vira mostarda:
   * o IrisVector sobe para ficar dourado de verdade.
   */
  luz?: number;
  /** Quanto o matiz anda do começo ao fim do gradiente do ícone (padrão +42, o mesmo do --acento-2). */
  deriva?: number;
  /** Como o sistema conhece o app depois de instalado (ausente enquanto em criação). */
  instalado?: {
    /**
     * Nome do produto no "Aplicativos instalados" do Windows. O MSI grava só o nome ("IrisWord");
     * o Inno Setup grava nome e versão ("MultiDesk 0.5.3") — os dois casam.
     */
    nomeWindows: string;
    /**
     * Chave do próprio app no registro (HKCU ou HKLM), com o valor InstallDir — os MSI do ecossistema
     * gravam. Sem ela, a pasta vem do InstallLocation da chave de desinstalação (Inno Setup).
     */
    chaveWindows?: string;
    exeWindows: string;
    /** Argumentos do instalador .exe para instalar sem perguntas, só para a conta. */
    argsInstaladorExe?: string[];
    /** Argumentos a mais quando o app está aberto na hora de atualizar (o instalador o fecha; isto o reabre). */
    argsReabrir?: string[];
    /** Nome do pacote .deb/.rpm/pacman e do executável no PATH. */
    pacoteLinux: string;
    exeLinux: string;
  };
  /**
   * Como achar o arquivo de cada formato na release, por sistema e arquitetura.
   * A ordem é a preferência: o primeiro que existir na release é o sugerido.
   */
  arquivos?: Partial<Record<SistemaApp, Partial<Record<string, Array<{ formato: FormatoApp; padrao: RegExp }>>>>>;
  /**
   * Arquivo com "hash  nome" por linha (formato do sha256sum). Ausente = SHA256SUMS.txt. Release sem
   * ele ainda se confere pelo SHA-256 que o próprio GitHub publica de cada arquivo (`digest`).
   */
  somas?: RegExp;
}

/** Arquitetura do Node → como o IrisWord e o IrisGrid a escrevem no nome do arquivo. */
const IRISWORD_WIN = (arch: string): Array<{ formato: FormatoApp; padrao: RegExp }> => [
  { formato: 'msi', padrao: new RegExp(`-windows-${arch}\\.msi$`, 'i') },
  { formato: 'zip', padrao: new RegExp(`-windows-${arch}-portable\\.zip$`, 'i') },
];
const IRISWORD_LINUX = (arch: string): Array<{ formato: FormatoApp; padrao: RegExp }> => [
  { formato: 'appimage', padrao: new RegExp(`-linux-${arch}\\.AppImage$`, 'i') },
  { formato: 'deb', padrao: new RegExp(`-linux-${arch}\\.deb$`, 'i') },
  { formato: 'rpm', padrao: new RegExp(`-linux-${arch}\\.rpm$`, 'i') },
  { formato: 'targz', padrao: new RegExp(`-linux-${arch}\\.tar\\.gz$`, 'i') },
];

/** MultiDesk: instalador do Inno Setup no Windows; pacotes sem arquitetura no Linux (é Python). */
const MULTIDESK_WIN: Array<{ formato: FormatoApp; padrao: RegExp }> = [{ formato: 'exe', padrao: /^MultiDesk-Setup-.+\.exe$/i }];
const MULTIDESK_LINUX: Array<{ formato: FormatoApp; padrao: RegExp }> = [
  { formato: 'deb', padrao: /_all\.deb$/i },
  { formato: 'pacman', padrao: /-any\.pkg\.tar\.(zst|xz)$/i },
];

export const APPS_WORKSPACE: AppWorkspace[] = [
  {
    id: 'irisword',
    nome: 'IrisWord',
    repo: 'GabrielAlvesB/Irisword',
    frase: 'Escrever e diagramar documentos, com arquivos do Word.',
    descricao:
      'Um processador de texto nativo, rápido e aberto, com o jeito de trabalhar que você já conhece do Word: faixa de opções, ' +
      'estilos, tabelas, controle de alterações, referências e mala direta. Abre e salva .docx e exporta PDF com texto de verdade.',
    recursos: [
      { titulo: 'Seus arquivos', texto: 'Abre e salva .docx; abre .doc, .odt, .rtf, .html, .md e .txt; exporta PDF com links e marcadores.' },
      { titulo: 'Revisão', texto: 'Controle de alterações, comentários na margem, ortografia e gramática enquanto digita — tudo offline.' },
      { titulo: 'Referências', texto: 'Sumário, notas de rodapé, citações em APA, MLA, Chicago ou IEEE, índice e legendas.' },
      { titulo: 'Design', texto: 'Temas, conjuntos de estilos, marca-d’água, capitular, texto em volta de imagens e bordas de página.' },
      { titulo: 'Rápido', texto: 'Feito em Rust e desenhado na GPU: digitar num documento de 188 páginas leva ~1,4 ms.' },
      { titulo: 'Para agentes', texto: 'Cada ação é um comando com id: a mesma lista move a faixa, os atalhos, a linha de comando e um servidor MCP.' },
    ],
    // Uma folha com a dobra e um "W" — o olho do Iris fica para o próprio Iris.
    icone:
      '<rect x="4" y="4" width="56" height="56" rx="15" fill="url(#ws-g-irisword)"/>' +
      '<path d="M21 14h15l9 9v25a3 3 0 0 1-3 3H21a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3z" fill="#fff" fill-opacity=".95"/>' +
      '<path d="M36 14v7a2 2 0 0 0 2 2h7" fill="#fff" fill-opacity=".55"/>' +
      '<path d="m23.5 29 3.2 12 4.3-9.5 4.3 9.5 3.2-12" fill="none" stroke="url(#ws-g-irisword)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
    matiz: 285,
    instalado: {
      nomeWindows: 'IrisWord',
      chaveWindows: 'Software\\IrisWord',
      exeWindows: 'wordcraft.exe',
      pacoteLinux: 'wordcraft',
      exeLinux: 'wordcraft',
    },
    arquivos: {
      win32: { x64: IRISWORD_WIN('x64'), arm64: IRISWORD_WIN('arm64'), ia32: IRISWORD_WIN('x86') },
      linux: { x64: IRISWORD_LINUX('x86_64'), arm64: IRISWORD_LINUX('aarch64') },
    },
    somas: /^SHA256SUMS\.txt$/i,
  },
  {
    id: 'irisgrid',
    nome: 'IrisGrid',
    repo: 'GabrielAlvesB/IrisGrid',
    frase: 'Planilhas: tabelas, fórmulas e números organizados.',
    descricao:
      'Uma planilha nativa, rápida e aberta, com o jeito de trabalhar que você já conhece do Excel: faixa de opções, ' +
      'fórmulas, tabelas, formatação condicional, gráficos e tabelas dinâmicas. Abre e salva .xlsx e exporta PDF.',
    recursos: [
      { titulo: 'Seus arquivos', texto: 'Abre e salva .xlsx e .xlsm; abre .xls, .xlsb, .ods, .csv e .tsv; exporta PDF.' },
      { titulo: 'Fórmulas', texto: 'Mais de 500 funções de planilha, matrizes dinâmicas, nomes definidos e auditoria de fórmulas.' },
      { titulo: 'Análise', texto: 'Tabelas, filtros, tabelas dinâmicas, Solver, cenários e atingir meta — tudo offline.' },
      { titulo: 'Visual', texto: 'Gráficos, minigráficos, formatação condicional com barras e ícones, e estilos de tabela.' },
      { titulo: 'Seguro', texto: 'Macros VBA são preservadas mas nunca executadas, e nenhuma fórmula acessa a internet.' },
      { titulo: 'Para agentes', texto: 'Cada ação é um comando com id: a mesma lista move a faixa, os atalhos, a linha de comando e um servidor MCP.' },
    ],
    // Uma folha de planilha: linha de cabeçalho, grade e uma célula selecionada com a alça de preencher.
    icone:
      '<rect x="4" y="4" width="56" height="56" rx="15" fill="url(#ws-g-irisgrid)"/>' +
      '<rect x="12" y="12" width="40" height="40" rx="4" fill="#fff" fill-opacity=".95"/>' +
      '<path d="M12 16a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v6H12z" fill="url(#ws-g-irisgrid)" fill-opacity=".4"/>' +
      '<path d="M12 22h40M12 32h40M12 42h40M24.5 12v40M38 12v40" stroke="url(#ws-g-irisgrid)" stroke-width="1.6" stroke-opacity=".6"/>' +
      '<rect x="24.5" y="32" width="13.5" height="10" fill="url(#ws-g-irisgrid)" fill-opacity=".3"/>' +
      '<rect x="24.5" y="32" width="13.5" height="10" fill="none" stroke="url(#ws-g-irisgrid)" stroke-width="2.4"/>' +
      '<rect x="35.6" y="39.6" width="4.8" height="4.8" rx="1" fill="url(#ws-g-irisgrid)" stroke="#fff" stroke-width="1.2"/>',
    matiz: 152,
    instalado: {
      nomeWindows: 'IrisGrid',
      chaveWindows: 'Software\\IrisGrid',
      exeWindows: 'gridcraft.exe',
      pacoteLinux: 'gridcraft',
      exeLinux: 'gridcraft',
    },
    // Mesmos sufixos do IrisWord (gridcraft-<versão>-windows-x64.msi etc.).
    arquivos: {
      win32: { x64: IRISWORD_WIN('x64'), arm64: IRISWORD_WIN('arm64'), ia32: IRISWORD_WIN('x86') },
      linux: { x64: IRISWORD_LINUX('x86_64'), arm64: IRISWORD_LINUX('aarch64') },
    },
    somas: /^SHA256SUMS\.txt$/i,
  },
  {
    id: 'multidesk',
    nome: 'MultiDesk',
    repo: 'GabrielAlvesB/MultiDesk',
    frase: 'Um mouse e um teclado para vários computadores.',
    descricao:
      'Leve o cursor até a borda da tela e ele passa para o outro computador, junto com o teclado e a área de ' +
      'transferência. Funciona entre Windows e Linux, na mesma rede, conectando pelo link que o computador principal mostra.',
    recursos: [
      { titulo: 'Até 4 computadores', texto: 'Um em cada lado da tela do principal: direita, esquerda, acima e abaixo.' },
      { titulo: 'Área de transferência', texto: 'Copie num computador e cole no outro — texto e imagens.' },
      { titulo: 'Criptografado', texto: 'Tudo passa cifrado (X25519 + AES-GCM) e só conecta quem tem o código de pareamento.' },
      { titulo: 'Cursor sem travar', texto: 'A posição vai por UDP: um pacote perdido no Wi-Fi não congela o cursor.' },
      { titulo: 'Scroll Lock', texto: 'Prende o cursor na tela em que ele está — bom para jogos.' },
      { titulo: 'Ping na janela', texto: 'Mostra a latência de cada conexão nos dois computadores.' },
    ],
    // A logo do próprio MultiDesk (tools/make_icon.py de lá), redesenhada em vetor nas mesmas proporções e
    // cores: duas telas e a seta passando de uma para a outra. Cores fixas — é a marca dele, não a do Iris.
    icone:
      '<rect x="4" y="4" width="56" height="56" rx="11.2" fill="#2563eb"/>' +
      '<rect x="9.6" y="18.56" width="21.28" height="19.04" rx="1.68" fill="#fff"/>' +
      '<rect x="33.12" y="18.56" width="21.28" height="19.04" rx="1.68" fill="#bfdbfe"/>' +
      '<rect x="18" y="37.6" width="4.48" height="4.48" fill="#fff"/>' +
      '<rect x="41.52" y="37.6" width="4.48" height="4.48" fill="#bfdbfe"/>' +
      '<rect x="14.64" y="42.08" width="11.2" height="2.24" rx=".56" fill="#fff"/>' +
      '<rect x="38.16" y="42.08" width="11.2" height="2.24" rx=".56" fill="#bfdbfe"/>' +
      '<path d="M20.8 26.68h16.8v2.8H20.8z" fill="#0f172a"/>' +
      '<path d="M37.6 24.72v6.72l6.72-3.36z" fill="#0f172a"/>',
    matiz: 262,
    instalado: {
      nomeWindows: 'MultiDesk',
      exeWindows: 'MultiDesk.exe',
      // Inno Setup: sem janelas, sem reiniciar o Windows, na pasta da conta (Programs\MultiDesk).
      argsInstaladorExe: ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', '/CURRENTUSER'],
      // O instalador fecha o MultiDesk aberto (CloseApplications=force); o RELAUNCH do .iss dele o reabre.
      argsReabrir: ['/RELAUNCH=1'],
      pacoteLinux: 'multidesk',
      exeLinux: 'multidesk',
    },
    // O .exe é x64 e roda emulado no Windows ARM; o .deb e o pacote do Arch são "all"/"any" (Python).
    arquivos: {
      win32: { x64: MULTIDESK_WIN, arm64: MULTIDESK_WIN },
      linux: { x64: MULTIDESK_LINUX, arm64: MULTIDESK_LINUX },
    },
  },
  {
    id: 'irisdeck',
    nome: 'IrisDeck',
    repo: 'GabrielAlvesB/IrisDeck',
    frase: 'Apresentações e slides, do roteiro à tela cheia.',
    descricao:
      'O app de apresentações do ecossistema Iris, no papel do PowerPoint: temas, layouts, formas, gráficos, ' +
      'transições e animações, com modo de apresentação e modo do apresentador. Abre e salva .pptx e exporta PDF.',
    recursos: [
      { titulo: 'Seus arquivos', texto: 'Abre e salva .pptx; exporta PDF (slides, anotações e folhetos), PNG, JPEG e GIF animado.' },
      { titulo: 'Slides', texto: 'Slides mestres, onze layouts, oito temas originais, seções, anotações, comentários e cabeçalho/rodapé.' },
      { titulo: 'Desenho', texto: 'Mais de 150 formas com alças, conectores, mesclar formas, gradientes, sombras, brilho e reflexo.' },
      { titulo: 'Conteúdo', texto: 'Imagens com corte e correções, tabelas com estilos, gráficos, SmartArt, áudio e vídeo.' },
      { titulo: 'Apresentar', texto: 'Transições (inclusive Morph), animações, tela cheia, modo do apresentador, caneta e ensaio de tempos.' },
      { titulo: 'Para agentes', texto: 'Cada ação é um comando com id: a mesma lista move a faixa, os atalhos, a linha de comando e um servidor MCP.' },
    ],
    // Um slide no cavalete, com título, texto e um gráfico de pizza.
    icone:
      '<rect x="4" y="4" width="56" height="56" rx="15" fill="url(#ws-g-irisdeck)"/>' +
      '<rect x="12" y="14" width="40" height="28" rx="3.5" fill="#fff" fill-opacity=".95"/>' +
      '<path d="M32 42v6M25.5 52.5 32 48l6.5 4.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M18 21.5h12" stroke="url(#ws-g-irisdeck)" stroke-width="3.2" stroke-linecap="round"/>' +
      '<path d="M18 27.5h9M18 33h6" stroke="url(#ws-g-irisdeck)" stroke-width="2.2" stroke-linecap="round" stroke-opacity=".55"/>' +
      '<circle cx="40" cy="29.5" r="7" fill="url(#ws-g-irisdeck)"/>' +
      '<path d="M40 29.5v-7a7 7 0 0 1 7 7z" fill="#fff" fill-opacity=".6"/>',
    matiz: 48,
    instalado: {
      nomeWindows: 'IrisDeck',
      chaveWindows: 'Software\\IrisDeck',
      exeWindows: 'deckcraft.exe',
      pacoteLinux: 'deckcraft',
      exeLinux: 'deckcraft',
    },
    // Mesmos sufixos do IrisWord (deckcraft-<versão>-windows-x64.msi etc.).
    arquivos: {
      win32: { x64: IRISWORD_WIN('x64'), arm64: IRISWORD_WIN('arm64'), ia32: IRISWORD_WIN('x86') },
      linux: { x64: IRISWORD_LINUX('x86_64'), arm64: IRISWORD_LINUX('aarch64') },
    },
    somas: /^SHA256SUMS\.txt$/i,
  },
  {
    id: 'irisphoto',
    nome: 'Iris Photo',
    frase: 'Fotos e imagens: retoque, camadas e ajustes.',
    descricao:
      'O app de edição de imagens do ecossistema Iris, no papel do Photoshop: camadas, seleções, retoque e ajustes de cor.',
    recursos: [],
    // Uma foto (montanhas e sol) entre as marcas de corte.
    icone:
      '<rect x="4" y="4" width="56" height="56" rx="15" fill="url(#ws-g-irisphoto)"/>' +
      '<rect x="13" y="17" width="38" height="30" rx="4" fill="#fff" fill-opacity=".95"/>' +
      '<circle cx="41" cy="25.5" r="3.8" fill="url(#ws-g-irisphoto)"/>' +
      '<path d="M15.5 44.5 25.5 31l6.8 8.2 4.9-5.3 11.3 10.6z" fill="url(#ws-g-irisphoto)" fill-opacity=".85"/>' +
      '<path d="M9 20v-8h8M55 44v8h-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    matiz: 205,
  },
  {
    id: 'irisvector',
    nome: 'IrisVector',
    repo: 'GabrielAlvesB/IrisVector',
    frase: 'Ilustração vetorial: formas, curvas e logos.',
    descricao:
      'O app de ilustração do ecossistema Iris, no papel do Illustrator: desenhar com curvas e formas que não perdem ' +
      'qualidade em tamanho nenhum — logos, ícones e ilustrações. Abre e salva SVG, PDF e .ai e exporta PNG, JPEG e WebP.',
    recursos: [
      { titulo: 'Seus arquivos', texto: 'Abre e salva SVG, PDF, .ai e EPS; exporta PNG, JPEG e WebP, com Exportar para telas.' },
      { titulo: 'Desenho', texto: 'Caneta, Seleção direta, formas, pincéis, lápis e borracha, com guias inteligentes e pranchetas.' },
      { titulo: 'Formas e cor', texto: 'Pathfinder exato, mesclagens, gradientes, malhas, amostras e efeitos ao vivo no painel Aparência.' },
      { titulo: 'Texto', texto: 'Texto em ponto, em área e em caminho, com recursos OpenType e os painéis Caractere e Parágrafo.' },
      { titulo: 'Organização', texto: 'Camadas, símbolos, estilos gráficos, máscaras de recorte e desfazer ilimitado.' },
      { titulo: 'Para agentes', texto: 'Cada ação é um comando com id: menus, ferramentas e painéis respondem à linha de comando e a um servidor MCP.' },
    ],
    // Uma curva de Bézier com os pontos de âncora e as alças, como a caneta a desenha. Traço escuro: o dourado
    // é claro demais para o branco aparecer.
    icone:
      '<rect x="4" y="4" width="56" height="56" rx="15" fill="url(#ws-g-irisvector)"/>' +
      '<path d="M15 46V27M49 18v19" stroke="#2b2200" stroke-opacity=".5" stroke-width="1.5"/>' +
      '<path d="M15 46C15 27 49 37 49 18" fill="none" stroke="#2b2200" stroke-width="3.4" stroke-linecap="round"/>' +
      '<circle cx="15" cy="27" r="2.6" fill="#fff" stroke="#2b2200" stroke-width="1.5"/>' +
      '<circle cx="49" cy="37" r="2.6" fill="#fff" stroke="#2b2200" stroke-width="1.5"/>' +
      '<rect x="11.5" y="42.5" width="7" height="7" rx="1.2" fill="#fff" stroke="#2b2200" stroke-width="1.8"/>' +
      '<rect x="45.5" y="14.5" width="7" height="7" rx="1.2" fill="#fff" stroke="#2b2200" stroke-width="1.8"/>' +
      '<rect x="29" y="29" width="6" height="6" rx="1" fill="#2b2200"/>',
    // Dourado → laranja, os tons de ilustração; com o +42 padrão ia para o verde-limão.
    matiz: 88,
    luz: 0.82,
    deriva: -38,
    instalado: {
      nomeWindows: 'IrisVector',
      chaveWindows: 'Software\\IrisVector',
      exeWindows: 'vectorcraft.exe',
      pacoteLinux: 'vectorcraft',
      exeLinux: 'vectorcraft',
    },
    // Mesmos sufixos do IrisWord (vectorcraft-<versão>-windows-x64.msi etc.).
    arquivos: {
      win32: { x64: IRISWORD_WIN('x64'), arm64: IRISWORD_WIN('arm64'), ia32: IRISWORD_WIN('x86') },
      linux: { x64: IRISWORD_LINUX('x86_64'), arm64: IRISWORD_LINUX('aarch64') },
    },
    somas: /^SHA256SUMS\.txt$/i,
  },
  {
    id: 'irisfig',
    nome: 'Iris Fig',
    frase: 'Design de telas, componentes e protótipos.',
    descricao:
      'O app de design de interfaces do ecossistema Iris, no papel do Figma: desenhar telas, montar componentes e ' +
      'ligar tudo num protótipo clicável.',
    recursos: [],
    // Um quadro (frame) com formas dentro e o cursor de seleção em cima.
    icone:
      '<rect x="4" y="4" width="56" height="56" rx="15" fill="url(#ws-g-irisfig)"/>' +
      '<path d="M12.5 10h8" stroke="#fff" stroke-opacity=".7" stroke-width="2.2" stroke-linecap="round"/>' +
      '<rect x="12" y="14" width="32" height="28" rx="3.5" fill="#fff" fill-opacity=".95"/>' +
      '<circle cx="21.5" cy="23.5" r="4.8" fill="url(#ws-g-irisfig)"/>' +
      '<rect x="28" y="27" width="11" height="9.5" rx="2.2" fill="url(#ws-g-irisfig)" fill-opacity=".5"/>' +
      '<path d="M17 36h7" stroke="url(#ws-g-irisfig)" stroke-width="2.4" stroke-linecap="round" stroke-opacity=".6"/>' +
      '<path d="M38 33v16.5l4.3-4.2 3.2 7 3.2-1.4-3.2-6.9h6z" fill="#fff" stroke="url(#ws-g-irisfig)" stroke-width="1.8" stroke-linejoin="round"/>',
    matiz: 325,
  },
  {
    id: 'irispdf',
    nome: 'Iris PDF',
    frase: 'Ler, anotar, preencher e assinar PDFs.',
    descricao:
      'O app de PDF do ecossistema Iris, no papel do Acrobat: abrir, anotar, preencher formulários, assinar e ' +
      'organizar as páginas de documentos PDF.',
    recursos: [],
    // Uma página com a dobra e a etiqueta "PDF".
    icone:
      '<rect x="4" y="4" width="56" height="56" rx="15" fill="url(#ws-g-irispdf)"/>' +
      '<path d="M22 11h15l10 10v28a3 3 0 0 1-3 3H22a3 3 0 0 1-3-3V14a3 3 0 0 1 3-3z" fill="#fff" fill-opacity=".95"/>' +
      '<path d="M37 11v8a2 2 0 0 0 2 2h8" fill="#fff" fill-opacity=".55"/>' +
      '<path d="M24 25h13M24 30h17M24 35h11" stroke="url(#ws-g-irispdf)" stroke-width="2.2" stroke-linecap="round" stroke-opacity=".55"/>' +
      '<rect x="10.5" y="38.5" width="30" height="14" rx="3.5" fill="url(#ws-g-irispdf)" stroke="#fff" stroke-width="2"/>' +
      // Fonte por style: o atributo font-family perde para o CSS da página e caía numa monoespaçada.
      '<text x="25.5" y="48.6" text-anchor="middle" fill="#fff" ' +
      'style="font: 700 10px var(--font-sans, sans-serif); letter-spacing: .5px">PDF</text>',
    matiz: 22,
  },
];

export function emCriacao(app: AppWorkspace): boolean {
  return !app.repo;
}

export function acharApp(id: string): AppWorkspace | undefined {
  return APPS_WORKSPACE.find((a) => a.id === id);
}

/** Os arquivos que servem para este computador, na ordem de preferência. */
export function arquivosDoSistema(app: AppWorkspace, sistema: string, arch: string): Array<{ formato: FormatoApp; padrao: RegExp }> {
  return app.arquivos?.[sistema as SistemaApp]?.[arch] ?? [];
}

// ---------- Estado que a tela recebe ----------

export interface ArquivoRelease {
  formato: FormatoApp;
  nome: string;
  tamanho: number;
}

export interface ReleaseApp {
  versao: string;
  titulo?: string;
  notas: string;
  publicadaEm: string;
  paginaUrl: string;
  /** Só os arquivos que servem para este computador. */
  arquivos: ArquivoRelease[];
  /** Dá para conferir o arquivo (SHA256SUMS.txt ou o `digest` do GitHub): sem isso o Workspace não instala. */
  temSomas: boolean;
}

/**
 * Em que pé está cada app. A tela desenha o botão e o selo só a partir disto.
 * - `nao-publicado`: o repositório não tem release pública (ou não é público).
 * - `sem-arquivo`: tem release, mas nenhum arquivo para este sistema.
 * - `em-criacao`: o app ainda não tem repositório (catálogo sem `repo`).
 */
export type SituacaoApp =
  | 'verificando'
  | 'em-criacao'
  | 'nao-publicado'
  | 'sem-arquivo'
  | 'disponivel'
  | 'baixando'
  | 'conferindo'
  | 'instalando'
  | 'instalado'
  | 'atualizacao'
  | 'erro';

export interface InstalacaoDetectada {
  versao?: string;
  /** Onde está — só para mostrar; o main nunca executa caminho vindo da tela. */
  local?: string;
  /** Quem instalou: o sistema (MSI, pacote) ou o próprio Workspace (AppImage). */
  via: 'sistema' | 'workspace';
}

export interface EstadoApp {
  id: string;
  situacao: SituacaoApp;
  release?: ReleaseApp;
  instalacao?: InstalacaoDetectada;
  /** 0–1 durante o download. */
  progresso?: number;
  /** Formato do download/instalação em andamento. */
  formatoEmUso?: FormatoApp;
  formatoPreferido?: FormatoApp;
  /** O último arquivo baixado e conferido, para "Mostrar na pasta". */
  baixado?: { nome: string; versao: string; formato: FormatoApp };
  erro?: string;
  verificadoEm?: string;
}

export interface EstadoWorkspace {
  sistema: string;
  arch: string;
  apps: EstadoApp[];
}

export interface VersaoAnterior {
  versao: string;
  titulo?: string;
  publicadaEm: string;
  paginaUrl: string;
  preRelease: boolean;
}

export interface PedidoInstalar {
  appId: string;
  formato?: FormatoApp;
  /** Ausente = a última. Só versões que vieram do GitHub nesta sessão são aceitas. */
  versao?: string;
}

/** Arquivo que o Workspace grava: só o que é deste computador (fora do backup). */
export interface WorkspaceFile {
  schemaVersion: number;
  updatedAt: string;
  apps: Record<string, RegistroApp>;
}

export interface RegistroApp {
  formatoPreferido?: FormatoApp;
  /** Instalado pelo próprio Workspace (AppImage): o sistema não sabe dele. */
  instalacao?: { versao: string; caminho: string; formato: FormatoApp; instaladoEm: string };
  baixado?: { nome: string; versao: string; formato: FormatoApp; caminho: string };
  /** Cópia da última release vista: a tela abre sem internet. */
  ultimaRelease?: ReleaseApp;
  naoPublicado?: boolean;
  verificadoEm?: string;
  /** Versão da última atualização avisada por notificação (não repetir). */
  avisadaVersao?: string;
}

// ---------- Contas puras ----------

/** "1.2.10" > "1.2.9"; ignora o "v" e o sufixo de pré-lançamento. */
export function versaoMaiorQue(a: string, b: string): boolean {
  const partes = (v: string): number[] => v.replace(/^v/i, '').split(/[-+~]/)[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pa = partes(a);
  const pb = partes(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export function tamanhoLegivel(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 100 * 1024 * 1024 ? 1 : 0).replace('.', ',')} MB`;
}

/** O hash de um arquivo dentro do SHA256SUMS.txt ("<hash>  <nome>" ou "<hash> *<nome>"). */
export function hashDasSomas(texto: string, nome: string): string | null {
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(linha.trim());
    if (m && m[2].split('/').pop() === nome) return m[1].toLowerCase();
  }
  return null;
}
