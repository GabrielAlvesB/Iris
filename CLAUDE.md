# CLAUDE.md

Orientações para o Claude Code trabalhar neste repositório.

## O que é o Iris

App desktop Electron, **100% local**: sem backend, sem conta, sem telemetria. Os dados do
usuário vivem em arquivos JSON dentro de `app.getPath('userData')/data`.

TypeScript puro, **sem framework de UI e sem bundler**. O DOM é construído à mão com
`document.createElement`. As únicas dependências de runtime são `sortablejs` (drag-and-drop),
`ssh2` (comandos remotos) e `xlsx` (import/export de planilhas).

Dezesseis módulos, organizados na sidebar por categoria:

- **soltos no topo**: Kanban
- **Conteúdo**: Postagens (pipeline de conteúdo: vídeos, imagens), Relatórios (análises com PDF),
  Roteiros (escrever → revisar → aprovar; aprovado vira card no Kanban), Sheets
- **Arquivos**: Biblioteca (id interno `explorador`), Quadro, Copy, Pensamentos, Links rápidos
- **Sistema**: Servidores, n8n, GitHub
- **Tráfego**: Tráfego pago (id `trafego`)
- **soltos no rodapé**: Tutorial, Ajustes

A fonte única dessa lista é [modulos.types.ts](src/shared/types/modulos.types.ts).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run build` | `clean` → `tsc -p tsconfig.main.json` → `tsc -p tsconfig.renderer.json` → `copy-static` |
| `npm run dev` | `build` + `electron .` |
| `npm start` | só `electron .` (exige `dist/` já compilado) |
| `npx tsc -p tsconfig.json --noEmit` | checagem de tipos dos dois lados de uma vez, sem emitir |
| `npm run dist` | instalador NSIS + pasta portátil em .zip em `release/` (apaga `release/` antes: só a versão atual fica) |
| `npm run dist:portable` | só o .zip portátil |
| `npm run release` | build + instalador/zip + **publica a release no GitHub** (precisa de `GH_TOKEN`) |

Não há testes automatizados nem linter no projeto. A verificação é **compilar e rodar**.

## Os quatro tsconfigs

Quatro arquivos com papéis diferentes — errar o alvo é o tropeço mais comum aqui:

- `tsconfig.base.json` — regras compartilhadas: `strict`, `noUnusedLocals`,
  `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`.
- `tsconfig.main.json` — CommonJS, emite em `dist/`, cobre `main/`, `preload/` e `shared/`.
- `tsconfig.renderer.json` — ES2022 + DOM, emite em `dist/renderer/`, cobre `renderer/` e
  `shared/types/`.
- `tsconfig.json` — só type-check (editor e CLI). Não emite nada.

Consequência importante: [src/shared/types/events.types.ts](src/shared/types/events.types.ts)
é compilado pelos **dois** lados. Ele não pode importar `electron`, `node:*` nem `ssh2`, e
todo payload precisa sobreviver ao structured clone do IPC — só JSON puro, sem `Date`,
`Buffer`, `Map` ou `Set`.

## Arquitetura

```
renderer (DOM puro)  →  preload (contextBridge: window.irisAPI)  →  main (services)
       ↑                                                                  │
       └──────────────  push: canal único 'iris:event'  ←─────────────────┘
```

[src/main/main.ts](src/main/main.ts) tem três decisões que **não devem ser revertidas** sem
entender o motivo (todas comentadas no arquivo):

- O renderer é servido por um esquema privilegiado **`app://`**, não por `file://`. O TS do
  renderer compila para ES modules, e módulos ES são bloqueados em `file://` por falta de
  origem com CORS. O esquema customizado evita precisar de bundler.
- `app.disableHardwareAcceleration()` — contorna um bug do Chromium no Windows em que o
  compositor dessincroniza e a janela para de rotear cliques.
- `disable-features=CalculateNativeWinOcclusion` — pelo mesmo motivo: o Chromium julga a
  janela ocluída estando visível e estrangula o input.

`contextIsolation: true`, `nodeIntegration: false`. A CSP em
[src/renderer/index.html](src/renderer/index.html) é `default-src 'self'` — nenhum CDN,
nenhuma fonte externa (as fontes estão em `src/renderer/vendor/fonts/`).

## O contrato de um módulo

Todo módulo tem as mesmas peças, com nomes previsíveis:

| Camada | Caminho |
| --- | --- |
| Canais | `src/shared/ipcChannels.ts` (constante `MODULO_CHANNELS` com `as const`) |
| Tipos | `src/shared/types/<modulo>.types.ts` |
| Service | `src/main/modules/<modulo>/<modulo>.service.ts` |
| IPC | `src/main/ipc/<modulo>.ipc.ts` |
| Ponte | um namespace em `src/preload/preload.ts` |
| State | `src/renderer/modules/<modulo>/<modulo>.state.ts` |
| View | `src/renderer/modules/<modulo>/<modulo>.view.ts` |
| Estilo | `src/renderer/styles/<modulo>.css` |

O módulo **Pensamentos** é a referência mais curta e legível do padrão inteiro:
[service](src/main/modules/pensamentos/pensamentos.service.ts) ·
[ipc](src/main/ipc/pensamentos.ipc.ts) ·
[state](src/renderer/modules/pensamentos/pensamentos.state.ts).

Regras que o padrão embute:

- **Erro nunca atravessa o IPC como exceção.** O service lança `Error`; o `toResult()` do
  arquivo `.ipc.ts` converte em `IpcResult<T>` (`{ok:true,data}` | `{ok:false,error}`); o
  `unwrap()` do state volta a lançar no renderer.
- **Mutação devolve o arquivo inteiro**, não um delta. O state substitui o cache e notifica
  a view, que redesenha.
- A view expõe `render(viewRoot, state)` e `destroy()`; o state expõe `onStateChange` /
  `offStateChange`.

Ao adicionar um módulo:

1. Uma entrada em `MODULOS` de [modulos.types.ts](src/shared/types/modulos.types.ts) (id,
   rótulo, categoria). A sidebar, o seletor de módulo inicial de Ajustes e a validação do
   main derivam dela. Categoria nova = uma entrada em `CATEGORIAS`.
2. O ícone em `ICONE_DO_MODULO` de [sidebar.ts](src/renderer/core/sidebar.ts).
3. `mount`/`destroy` em [app.ts](src/renderer/app.ts).
4. O `register…Ipc()` em [src/main/ipc/index.ts](src/main/ipc/index.ts).
5. Se tem arquivo de dados, `getFullFile`/`replaceFile` em
   [export.service.ts](src/main/modules/export/export.service.ts) e o campo opcional em
   `export.types.ts`.

Os passos 1–3 são checados pelo compilador (`Record<ModuloId, …>`); 4 e 5 não.

O `<nav>` do `index.html` é só uma casca: os itens são gerados por
[sidebar.ts](src/renderer/core/sidebar.ts). Para navegar de um módulo para outro, usar
`abrirModulo()` de [navegacao.ts](src/renderer/core/navegacao.ts).

## Persistência

[jsonStore.ts](src/main/storage/jsonStore.ts) — `readStore(fileName, defaultFactory, migrate)`
e `writeStore`. Escreve em `.tmp` e renomeia, guarda `.bak` antes de sobrescrever, e um
arquivo corrompido vira `.corrupted-<timestamp>` em vez de derrubar o app. Escritas do mesmo
arquivo são serializadas numa fila.

**Todo arquivo de dados tem `schemaVersion` e uma `migrate(raw: unknown)` defensiva** — nada
é lido sem passar por ela. Campos derivados são recalculados na leitura em vez de confiados
(ex.: as `#tags` dos pensamentos, para o arquivo antigo se alinhar sozinho se a regra mudar).

[secretStore.ts](src/main/storage/secretStore.ts) — credenciais em `secrets.json`, cifradas
com `safeStorage` (DPAPI no Windows). Três regras:

- **`getSecret` nunca pode ser exposto por IPC.** A UI só recebe booleanos como `temToken` /
  `temApiKey` / `temPassphrase`.
- Chaves por entidade usam prefixo (`servidor.<id>.passphrase`), para `deleteSecretsByPrefix`
  limpar em cascata quando a entidade é apagada.
- `safeStorage` só é confiável depois de `app.whenReady()` — nunca chamar no topo do módulo.

`secrets.json` fica **fora** do bundle de export/import de propósito
([export.service.ts](src/main/modules/export/export.service.ts)): o valor cifrado com DPAPI
não seria decifrável em outra máquina.

## Postagens (vídeos, imagens…) e tipos de postagem

- O módulo **Postagens** (id `postagens`; antes `videos` — `ajustes.migrate` converte o
  módulo inicial salvo) tem um seletor de tipo e as mesmas visões para todos: pipeline,
  calendário, agenda e **Métricas** (a antiga aba "Relatórios" dos vídeos). As telas
  genéricas ([postagens.view.ts](src/renderer/modules/postagens/postagens.view.ts),
  `postagens.calendario.ts`, `postagens.metricas.ts`) só falam com uma **Fonte**
  ([postagens.fonte.ts](src/renderer/modules/postagens/postagens.fonte.ts)); nada nelas é
  de vídeo ou imagem.
- Cada tipo tem arquivo, service, IPC e state próprios (`videos.json`, `imagens.json`).
  O comum a todos (etapas por fase, prioridade, agenda, redes, tags, links, histórico) mora
  em [postagens.types.ts](src/shared/types/postagens.types.ts) e, no main, em
  [postagens.comum.ts](src/main/modules/postagens/postagens.comum.ts) (`criarEtapas`,
  `migrarBase`, `aplicarEdicaoComum`). Seções de painel comuns em `postagens.secoes.ts`.
- **Tags, redes e preferências de exibição são um catálogo único e moram em `videos.json`**
  (`videosService.getCatalogo()`); as imagens validam contra ele na leitura. Por isso o
  state de vídeos carrega antes dos outros tipos, e no restore do backup as imagens vão
  depois dos vídeos.
- **Adicionar um tipo**: entrada em `TIPOS_POSTAGEM`; tipos/service/ipc/state próprios
  (copiar o de imagens); a Fonte e a entrada em `TIPOS` de
  [postagens.tipos.ts](src/renderer/modules/postagens/postagens.tipos.ts); o adaptador em
  `ADAPTADORES` de [relatorios.tipos.ts](src/renderer/modules/relatorios/relatorios.tipos.ts)
  e o item/marcação em `ItemRelatorio` (relatorios.types.ts). Os `Record<TipoPostagem, …>`
  fazem o compilador cobrar cada ponto.
- **Imagens não guardam o arquivo da arte** — só nome e dados (formato, briefing, texto na
  arte, legenda, CTA, link, alt, créditos). A arte, se quiser, vem por Materiais (caminho
  da Biblioteca). O card desenha a proporção do formato no lugar da imagem. Hashtags da
  legenda saem de `hashtagsDoTexto` (só o que tem `#`), não de `extrairHashtags` (que lê
  um campo só de hashtags e trataria cada palavra como uma).
- **Agenda automática** (`seguirAgenda`/`publicarVencidas` em `criarEtapas`): marcar data **e**
  hora no futuro leva a postagem para `agendado`; tirar a data de uma agendada volta a `pronto`;
  a tarefa `postagens:agenda` (30s, [postagens.agenda.ts](src/main/modules/postagens/postagens.agenda.ts))
  publica as vencidas com `publicadoEm` = horário marcado e empurra `postagens:mudou`. Ano < 2000
  é ignorado (o campo de data dispara `change` a cada dígito do ano).
- Quem **chega** em `publicado` vai para o topo da etapa (`ordemAoEntrar`), por qualquer caminho
  (painel, arrasto, agenda, restaurar): a mais recente primeiro.
- `seq` de postagens, roteiros e relatórios é interno: não mostrar em card, painel, tabela nem
  no PDF (o usuário pediu para tirar).
- Fases da pipeline recolhem numa faixa estreita (localStorage `iris.postagens.fasesRecolhidas`).
- Para abrir Postagens já num tipo/postagem a partir de outro módulo: `abrirPostagem()` de
  [navegacao.ts](src/renderer/core/navegacao.ts).

## Relatórios

- `relatorios.json`: relatórios com seções; cada seção tem itens (um por postagem, união
  discriminada por tipo) com marcações, anotações e observações. Marcação de vídeo aponta
  um tempo (`parseTempo`/`formatarTempo`); de imagem, uma área da arte e a peça do carrossel.
- Cada item guarda uma **cópia** (`snapshot`) dos dados da postagem — apagar a postagem não
  quebra o relatório. O editor renova a cópia ao abrir quando a postagem ainda existe.
- O editor trabalha num rascunho e salva o relatório inteiro (`salvarRelatorio`), que o
  main valida com a mesma `migrateRelatorio` da leitura.
- **PDF**: o documento é um DOM só
  ([relatorios.documento.ts](src/renderer/modules/relatorios/relatorios.documento.ts)), usado
  na prévia e no PDF. Para exportar, o renderer monta-o em `#impressao` e o main chama
  `printToPDF` na própria janela; [relatorios-impressao.css](src/renderer/styles/relatorios-impressao.css)
  esconde o resto no `@media print`. Não há janela oculta nem segundo gerador de HTML.
- **Empresa por tags** (`relatorios.json` v3): `Relatorio.tagIds` são tags do catálogo único;
  `tagsNomes` é a cópia por extenso, renovada **no main** ao criar/salvar
  (`renovarNomesDasTags`) — apagar a tag não apaga a empresa do documento. O seletor
  "Adicionar postagens" já abre filtrado por essas tags e um bloco de métricas novo as herda
  (`filtroPadrao`). A lista de relatórios filtra por empresa. Textos extras do relatório:
  `objetivos`, `recomendacoes` (Próximos passos), `observacoesFinais`.
- **Blocos livres** (`relatorios.json` v2+): cada seção tem, na ordem, texto de abertura →
  `blocos` (texto, destaque, tabela, métricas, texto + métrica (`analise`, indicadores
  digitados), duas colunas, citação, quebra de página; editores em
  [relatorios.blocos.ts](src/renderer/modules/relatorios/relatorios.blocos.ts)) → postagens
  analisadas. Os textos aceitam `- ` (lista), `1. ` (lista numerada) e `**negrito**`
  (`paragrafos()` do documento). Bloco novo = entrada em `BlocoRelatorio`, `migrateBloco` no
  service, `buildBloco` no documento e `TIPOS_BLOCO`/editor.
- **Bloco de métricas**: filtro (tipos, período, publicados/todos, redes, tags, prioridade) +
  `resultado` gravado com `calculadoEm` — uma fotografia, como o snapshot dos itens; só muda
  quando o filtro muda ou o usuário recalcula. Conta pela mesma regra da aba Métricas
  (`dataParaMetricas` de postagens.metricas.ts). Nomes de rede/tag vão por extenso no resultado.
- A **assinatura** fica em Ajustes (`ajustes.json` › `assinatura`); `buildAssinatura()` é o
  único lugar que a desenha. Categorias de marcação são editáveis por tipo.

## Roteiros

- `roteiros.json`: status `rascunho` → `revisao` → `aprovado`/`reprovado` (reprovar exige
  motivo; editar um reprovado volta a rascunho), checklist de verificação (a padrão do arquivo
  entra em todo roteiro novo) e histórico. Tags = catálogo único de Postagens.
- `aprovarRoteiro` (main) cria o card na **primeira coluna** do Kanban via `kanbanService`,
  com o roteiro na descrição; guarda `kanbanCardId` e não duplica se o card ainda existe.
- O roteiro é **texto livre em markdown** (`Roteiro.texto`): `# título`, seções com tempo
  (`## [0:00 - 0:50] Abertura`), notas de cena numa linha entre colchetes, `**NARRAÇÃO:**`,
  listas, `---`. Renderização e índice de seções em
  [roteiros.markdown.ts](src/renderer/modules/roteiros/roteiros.markdown.ts) (DOM, sem
  innerHTML). Gancho/CTA/observações são opcionais. A estimativa de fala usa `textoFalado`
  (tira títulos, cenas, rótulos, linhas de ficha e a parte de Fontes). Colar um roteiro na
  criação tira título (`# …`) e duração ("Duração estimada:") do próprio texto.
- O editor é um painel com a prévia ao lado; texto salva por `atualizarSilencioso` (sem
  notificar, para não redesenhar sob o cursor) e a lista redesenha ao fechar.

## Tráfego pago

- `trafego.json`: contas (clientes, com tags e verba mensal), sites/páginas de destino e
  campanhas (plataforma, objetivo, status, orçamento, público, criativos, links) com
  `registros` diários — **um por dia**; salvar/importar um dia existente substitui.
- CTR, CPC, CPM, CPA, taxa de conversão e ROAS **nunca são gravados**: `calcularMetricas(somar(…))`
  de [trafego.types.ts](src/shared/types/trafego.types.ts). Razão com denominador zero é
  `undefined` ("—"), não 0.
- `importarRegistros` lê a primeira aba (CSV sem inferência de tipo; planilha com `cellDates`),
  acha as colunas pelo nome (`COLUNAS` no service) e soma linhas do mesmo dia.
- O quadro de campanhas usa sortablejs (`moverCampanha` renumera `ordem` da coluna). Classe de
  status nas pílulas usa prefixo `st-`: `is-ativa` já é a classe de pílula marcada.

## Vídeos, Sheets e Biblioteca

- **Vídeos** tem etapas fixas (`VIDEO_STATUS` em
  [videos.types.ts](src/shared/types/videos.types.ts)), não colunas editáveis: `agendado`,
  `publicado` e `arquivado` têm efeito (carimbo de publicação, restaurar para a etapa de
  origem). Tags e redes são do usuário; seeds na criação do arquivo.
- **Sheets → Vídeos**: `importarDeSheets` no main lê a linha direto do `sheets.json` e grava
  uma **cópia** (`origem.dadosOriginais`). O vídeo nunca referencia a planilha viva — apagar a
  tabela não pode afetar a pipeline. As regras de conversão (data, hora, hashtags, status)
  ficam em [videos.conversao.ts](src/shared/types/videos.conversao.ts), usado pelos dois
  lados para a prévia bater com o resultado.
- Coluna da planilha que não é campo nativo vira **campo extra** do vídeo (`camposExtras`,
  nome + valor, editável no painel). Só vão as colunas que existem e estão marcadas no
  envio; as desmarcadas ficam em `mapeamentos[].extrasIgnorados` (guardamos as recusadas
  para coluna nova já vir marcada). Cada linha do Sheets tem botão próprio de envio.
- Vídeos têm `prioridade` opcional (alta/média/baixa), mapeável do Sheets (`parsePrioridade`
  em videos.conversao.ts aceita "Alta", "média", "high", "urgente", "1"…; coluna "Prioridade"
  que chegou antes como informação extra é promovida na leitura, como o score) e o arquivo guarda `preferencias` de
  exibição — inclusive `tituloDoCard`, que pode ser uma informação extra (ex.: "Tema") no
  lugar do título; use `tituloExibido()` de `postagens.ui.ts` em vez de `video.titulo` em
  qualquer card ou chip.
- O calendário ([postagens.calendario.ts](src/renderer/modules/postagens/postagens.calendario.ts))
  usa drag-and-drop nativo do HTML5 (não sortablejs) com o tipo
  `application/x-iris-postagem`. As linhas do mês usam `grid-template-rows: max-content`: com a grade
  rolando, `minmax(…, auto)` não cresce e o conteúdo vaza sobre a semana seguinte.
- Redes têm `logo` opcional do catálogo `REDES_CONHECIDAS` (videos.types.ts); os glifos
  SVG ficam em [postagens.logos.ts](src/renderer/modules/postagens/postagens.logos.ts) — desenhados
  no código, a CSP não permite imagem externa. Para achar uma rede escrita na planilha, use
  `acharRede()` (nome, sigla ou apelido como "Insta"/"Reels") nos dois lados; para mostrar
  a planilha de origem de um vídeo, `descreverOrigem()`.
- `Video.score` (0–100) vem da planilha (`parseScore` aceita "85", "85%", "8,5");
  informação extra com nome de score é promovida ao campo na migração, com preferência para
  "Score Editorial" (o nome usado nas planilhas dele) sobre outros como "Score Viral".
  Campo que o mapeamento lembrado de uma aba não cobre recebe o palpite pelo nome da coluna. Faixas em
  `FAIXAS_SCORE` (videos.conversao.ts). A aba **Métricas** (postagens.metricas.ts) usa
  gráficos SVG próprios de [postagens.graficos.ts](src/renderer/modules/postagens/postagens.graficos.ts):
  um eixo só, cores validadas contra a superfície escura, tabela alternativa em cada
  gráfico. Mês de um vídeo publicado = `dataAgendada` (não `publicadoEm`, que num lote
  importado é o dia da importação).
- O painel do vídeo abre na posição de `preferencias.posicaoPainel` (centro = modal com
  fundo e seções em duas colunas; esquerda/direita = lateral sem fundo).
- **Biblioteca** guarda curadoria (coleção, tags, nota) sobre caminhos dentro das pastas
  monitoradas, nunca cópias de arquivo. Situação `ausente`/`fora` é derivada na leitura.
  Vídeos referenciam recursos por id em `recursoIds`; órfãos são ignorados na tela.
- Arquivo de `shared/types` importado **em runtime** pelo renderer precisa de imports com
  `.js` entre si (ex.: `videos.conversao.ts` → `./videos.types.js`); `import type` não precisa.

## Atualização do app

- Pelas **Releases do GitHub** (`GabrielAlvesB/Iris`, repositório público), sem electron-updater:
  [atualizacao.service.ts](src/main/modules/atualizacao/atualizacao.service.ts) lê
  `releases/latest` pelo httpClient, compara com `app.getVersion()` (`versaoMaior`), baixa o
  `Iris-Setup-<versão>.exe`, confere o SHA-512 do `latest.yml` e roda o instalador com
  `--updated /S --force-run` (as flags do NSIS do electron-builder: instala por cima e reabre).
  Antes de fechar, `aguardarEscritas()` do jsonStore.
- Só a instalação NSIS se atualiza (detectada pelo `Uninstall Iris.exe` ao lado do exe); o .zip
  portátil e o `npm run dev` só avisam e abrem a página da release.
- Verifica 12 s após abrir e a cada 6 h (tarefa `atualizacao:verificar`); estado por push
  `atualizacao:estado`. UI: aviso na barra lateral ([core/atualizacao.ts](src/renderer/core/atualizacao.ts))
  e Ajustes › Atualizações.
- **Publicar versão nova**: subir `version` no package.json e `npm run release` com `GH_TOKEN`
  (token com permissão de escrita no repositório). Sai como release publicada, não rascunho
  (`releaseType: release`) — rascunho não aparece em `releases/latest`. O `nsis.artifactName`
  sem espaços é o que o service procura (`/setup.*\.exe$/i`).

## Eventos push (main → renderer)

Canal físico único `iris:event`; os tópicos são a união discriminada em
[events.types.ts](src/shared/types/events.types.ts). `broadcast()` e `broadcastErro()` em
[broadcast.ts](src/main/core/broadcast.ts) **nunca lançam** — um push com falha não pode
derrubar o watcher ou o agendador que o chamou.

No renderer, assinaturas vão sempre por
[createPushBinding()](src/renderer/core/pushBinding.ts). O `contextBridge` não devolve a
identidade do listener, então quem cancela é a closure criada no preload; os `attach`/`detach`
idempotentes do binding tornam assinatura duplicada estruturalmente impossível quando o
usuário entra e sai do módulo várias vezes.

## Tarefas de fundo

[scheduler.ts](src/main/core/scheduler.ts) usa `setTimeout` encadeado, não `setInterval`: um
ciclo lento não pode sobrepor o seguinte e empilhar sockets. Cada runner recebe um
`AbortSignal`, abortado no `stop`/`before-quit`.

[backgroundServices.ts](src/main/core/backgroundServices.ts) é a raiz de composição — health
de servidores (60s), poll do n8n (120s), poll do GitHub (600s) e os watchers do Explorador.
Quando a configuração muda na UI, chamar `reaplicarAgendamentos()` em vez de exigir reinício.

## Segurança — regras já estabelecidas no código

- **Caminhos de arquivo**: validar sempre com [pathGuard.ts](src/main/core/pathGuard.ts) e
  usar **o caminho retornado** nas operações de `fs`, nunca a string original. Ele canoniza
  com `realpath` (uma junction do Windows dentro de uma raiz permitida daria acesso ao disco
  inteiro) e compara fronteiras com `path.relative`, não `startsWith`.
- **git**: sempre `execFile` com array de argumentos e `shell: false`
  ([gitClient.ts](src/main/core/gitClient.ts)). Caminhos de projeto têm espaço e acento;
  concatenar em shell seria injeção de comando. As variáveis `GIT_TERMINAL_PROMPT=0`,
  `GIT_ASKPASS`, `GCM_INTERACTIVE=never` evitam travar num credential helper interativo.
- **HTTP**: todo tráfego sai do processo principal por
  [httpClient.ts](src/main/core/httpClient.ts), que usa `net.fetch` (herda o proxy do sistema)
  e **não lança** — a falha é um valor (`timeout` | `abortado` | `rede`), para o health check
  distinguir "fora do ar" de "demorou demais". TLS inseguro é por-host, numa `Session` isolada
  em memória, nunca na sessão do renderer. O renderer não faz requisição nenhuma.

## Convenções de UI

- Sem framework. **Conteúdo do usuário vai por `textContent`**; `innerHTML` só para SVG de
  ícone vindo das constantes do próprio código.
- **Um só desenho de modal** (o que nasceu em Vídeos): tudo em
  [modal.ts](src/renderer/ui/modal.ts) é montado sobre `openCustomModal` — cabeçalho com
  ícone/subtítulo/X, corpo que rola, ações no rodapé fixo, raio 16px. `openFormModal`
  aceita `opcoes` (ícone, subtítulo, largura) e campos com `secao`/`metade`/`dica`;
  `openAvisoModal` substitui `window.alert` e confirmações usadas como aviso. Campos
  soltos: [campos.ts](src/renderer/ui/campos.ts) (`campo`, `input`, `pilulas`,
  `interruptor`, `erroInline`). Não recriar modal à mão.
- **Pilha de camadas**: modais e painéis se registram em `empilharCamada`; Esc e clique
  fora valem só para o do topo (um prompt aberto de dentro de outro modal fecha sozinho).
  Atalhos de tela devem checar `haModalAberto()`.
- Painel de detalhes (postagens, cartão do Kanban): a casca de
  [painel.ts](src/renderer/ui/painel.ts) — esquerda/centro/direita, fundo no centro.
- Reusar as peças compartilhadas em [src/renderer/ui/pagina.ts](src/renderer/ui/pagina.ts)
  (`buildCabecalho`, `buildSelo`, `buildIndicadores`, `buildBusca`, `buildVazio`,
  `buildBotao`, `ICONES`, `svg`, `tempoRelativo`) e
  [src/renderer/ui/modal.ts](src/renderer/ui/modal.ts) (`openFormModal`, `promptText`,
  `openConfirmModal`) em vez de recriar variantes.
- Estado nunca é comunicado só por cor: `buildSelo` sempre emite ícone + texto.
- Tokens de cor, raio e fonte no `:root` de
  [base.css](src/renderer/styles/base.css) — usar as variáveis, não valores literais.
- Navegação entre módulos via [navegacao.ts](src/renderer/core/navegacao.ts). Ele existe
  porque `app.ts` importa todos os módulos, então nenhum módulo pode importar `app.ts` de
  volta sem criar ciclo.

## Estilo de código

- Domínio, nomes de função e comentários em **português**; as APIs de Electron/Node
  permanecem em inglês, como é natural.
- Comentários explicam **por quê**, não o quê. O repositório inteiro segue isso e registra os
  contornos de plataforma no ponto onde eles vivem — manter o padrão.
- `strict` com `noUnusedLocals` e `noUnusedParameters` ligados: parâmetro não usado leva `_`
  na frente (`(_event, input) => …`).

## Tempo de abertura

- **Nada de portátil de arquivo único** (target `portable`): ele extrai ~230 MB em `%TEMP%` a
  cada abertura, e o antivírus analisa o `Iris.exe` novo toda vez — ~17 s medidos. O portátil
  é o `.zip` (pasta pronta, abre direto). `electronLanguages` mantém só pt-BR/en-US.
- `app.ts` **importa cada módulo sob demanda** (`carregadores`); os outros são pré-carregados em
  segundo plano depois da primeira tela. Módulo não pode ter efeito colateral no import.
- No main, dependência pesada é carregada no primeiro uso: `ssh2` (~1 s de require) em
  servidores.ssh.ts e `xlsx` nos services de Sheets e Tráfego. Não voltar para import no topo.
- `startBackgroundServices()` roda depois do `did-finish-load` (watchers da Biblioteca e polls
  não disputam com a primeira tela). A janela nasce com `backgroundColor` do tema.

## Armadilhas

- **Testar sem mexer nos dados do usuário**: rode o Electron com `--user-data-dir=<pasta>`.
  Trocar a variável `APPDATA` **não** isola no Windows (o Electron consulta a pasta pelo SO) e
  grava direto em `%APPDATA%/iris/data`.
- Sheets: a prévia da importação tem checkbox por coluna; o renderer filtra colunas e células
  pelos mesmos índices e `commitImport` (que casa por posição) não muda.
- `buildSegmentado` marca a aba ativa sozinho no clique; quem não redesenha não precisa
  fazer nada.
- Para rodar o app pelo terminal integrado do VS Code, tire `ELECTRON_RUN_AS_NODE` do
  ambiente — herdado do VS Code, ele faz o `electron.exe` rodar como Node puro ("bad option").
- **Imports do renderer terminam em `.js`** (`./modules/x/x.state.js`), porque é ESM nativo no
  browser. Os imports do main, não.
- Arquivo estático novo (CSS, fonte, asset) precisa entrar em
  [scripts/copy-static.mjs](scripts/copy-static.mjs), senão ele simplesmente não existe no
  build.
- CSS novo precisa de `<link>` no [index.html](src/renderer/index.html) — não há import de CSS.
- `dist/` e `release/` são ignorados pelo git; nunca versionar.
