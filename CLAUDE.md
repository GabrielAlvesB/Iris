# CLAUDE.md

Orientações para o Claude Code trabalhar neste repositório.

## O que é o Iris

App desktop Electron, **100% local**: sem backend, sem conta, sem telemetria. Os dados do
usuário vivem em arquivos JSON dentro de `app.getPath('userData')/data`.

TypeScript puro, **sem framework de UI e sem bundler**. O DOM é construído à mão com
`document.createElement`. As únicas dependências de runtime são `sortablejs` (drag-and-drop),
`ssh2` (comandos remotos) e `xlsx` (import/export de planilhas).

Vinte e três módulos, organizados na sidebar por categoria:

- **soltos no topo**: Kanban, To-do (id `todo`)
- **Relacionamento**: Contatos (CRM: pessoas, empresas, funil, contratos), Leads (id `leads`: caixa de entrada e painel),
  Relatórios de leads (id `relatorios-leads`), API e n8n (id `api-leads`) — a área da 0.2.0 —, WhatsApp (id `whatsapp`)
- **Conteúdo**: Postagens (pipeline de conteúdo: vídeos, imagens), Estúdio IA (id `ia`), Relatórios (análises com PDF),
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
| `npm run release` | build + instalador/zip + **publica a release no GitHub** (precisa de `GH_TOKEN`). Roda no GitHub Actions — ver Atualização do app |
| `npm run dist:linux` | AppImage + .deb em `release/` — **só numa máquina Linux** (o .deb precisa do fpm). No Windows: Docker, ver "Linux" |
| `npm run release:linux` | o mesmo, publicando na release. Roda no GitHub Actions, depois do Windows |

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
  compositor dessincroniza e a janela para de rotear cliques. **Só no Windows** (no Linux a GPU fica ligada).
- `disable-features=CalculateNativeWinOcclusion` — pelo mesmo motivo: o Chromium julga a
  janela ocluída estando visível e estrangula o input. Também só no Windows.

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
5. Se tem arquivo de dados: `getFullFile`/`replaceFile` (que **passa pela `migrate`**) no service, a
   chave em `LEITORES`/`GRAVADORES` de [export.service.ts](src/main/modules/export/export.service.ts),
   o campo opcional no `ExportBundle` e a entrada em `EXPORTAVEIS` (`export.types.ts`). Planilha
   opcional em `export.planilhas.ts`.

Os passos 1–3 são checados pelo compilador (`Record<ModuloId, …>`); 4 e 5 não.

O `<nav id="sidebar">` do `index.html` é vazio: [sidebar.ts](src/renderer/core/sidebar.ts) gera um
**trilho de ícones** (64px) e um **painel** ao lado. Kanban/To-do/Tutorial/Ajustes e categorias de um
módulo só (Tráfego) são atalhos diretos no trilho; as outras categorias abrem o painel flutuante (Esc,
clique fora ou escolher fecham; entra na pilha de camadas). **Fixado** (atalho `geral.fixar`, botão do painel ou
Ajustes › Preferências, localStorage `iris.sidebar.fixado`) o painel lista todas as categorias e empurra
a tela. Classes do painel têm prefixo `sb-` — `.painel` é do painel de detalhes (ui/painel.ts).
`MODULOS[].descricao` é a linha que aparece no painel e na busca. **Ctrl+P** (`geral.busca`) abre a busca rápida
([paleta.ts](src/renderer/core/paleta.ts), importada sob demanda): módulos, contatos do CRM, `SECOES_AJUSTES`
(navegacao.ts) e guias do Tutorial. Para navegar de um módulo para outro, usar `abrirModulo()` de
[navegacao.ts](src/renderer/core/navegacao.ts); `abrirAjustes(secao)` funciona também com Ajustes já
aberto (`onSecaoAjustesSolicitada`).

## Tema claro/escuro

- `ajustes.json` v5 › `tema`: `'escuro'` (padrão), `'claro'` ou `'sistema'`. O main aplica com
  `nativeTheme.themeSource` ([core/tema.ts](src/main/core/tema.ts), chamado antes da janela e no `setTema`) — isso
  força o `prefers-color-scheme` do renderer. Por isso o CSS do claro é só um
  `@media (prefers-color-scheme: light)` no [base.css](src/renderer/styles/base.css): sem script na abertura e sem
  flash. A janela nasce com `corDeFundo()` e a troca o acompanha (o `salvarPdfDaJanela` restaura essa cor).
- **Cor nova em qualquer CSS sai dos tokens**, nunca literal de superfície, texto ou sombra — senão some num dos dois
  temas. Além dos de sempre: sombra preta = `rgb(0 0 0 / calc(X * var(--sombra-k)))`; realce de superfície =
  `rgb(var(--realce) / X)` (branco no escuro, preto no claro); fundo de modal `--veu`; texto a partir de uma cor de
  dado (tag, etapa, coleção) = `color-mix(in oklch, var(--cor) var(--tinta-texto|--tinta-chip), var(--tinta-forte))`;
  texto sobre o acento `--texto-sobre-acento`; avisos em texto `--danger-texto`/`--warning-texto`. Literal só no que
  desenha algo fixo: papel dos documentos, logos de rede, post-its, teleprompter, miniaturas de Ajustes › Aparência.
- Renderer: [core/tema.ts](src/renderer/core/tema.ts) (`temaEfetivo`, `alternarTema`, `onTemaMudou` pela media query).
  Trocar: sol/lua no trilho (acima do Tutorial), atalho `geral.tema` (Ctrl+Shift+L), Ctrl+P e Ajustes › Aparência.

## Persistência

[jsonStore.ts](src/main/storage/jsonStore.ts) — `readStore(fileName, defaultFactory, migrate)`
e `writeStore`. Escreve em `.tmp` e renomeia, guarda `.bak` antes de sobrescrever, e um
arquivo corrompido vira `.corrupted-<timestamp>` em vez de derrubar o app. Escritas do mesmo
arquivo são serializadas numa fila. Se o arquivo no disco tem `schemaVersion` **maior** que o que
vai ser gravado (versão antiga do app rodando — o Iris instalado ao lado do `npm run dev`, ou
"Escolher versão…" para trás), fica uma cópia permanente `<nome>.v<N>.json` antes: a versão
antiga descarta o que não conhece (foi assim que as escalas de score "não salvavam").

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
- **Empresas são tags** com `empresa: true` no mesmo catálogo (a postagem guarda o id; pode ter
  empresa + tags comuns). Cadastro único em [postagens.tags.ts](src/renderer/modules/postagens/postagens.tags.ts)
  (`buildCadastroTags`), usado em Ajustes › Empresas e tags e no modal "Empresas, tags e redes".
  O chip de empresa leva o prédio (`ICONE_EMPRESA`); todo seletor usa `ordenarTags` (empresas
  primeiro). **Instalação nova não traz tag nenhuma** — as antigas de exemplo ("Hora de Codar",
  "Grupo"…) eram do contexto de um usuário. A migração única `migrarEmpresasUmaVez` (chamada
  em main.ts antes da janela, flag `empresasMigradas` em videos.json) tornou empresa a "Hora de
  Codar" e as tags usadas em relatórios; com a flag, não roda de novo.
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
- **Data e horário** no painel: [postagens.agendar.ts](src/renderer/modules/postagens/postagens.agendar.ts)
  (mini calendário com atalhos + horário digitado livre — `lerHora` aceita "1830", "9h", "21:15" — ou
  escolhido numa grade; "Mais usados" = os repetidos do tipo). Não voltar ao `<input type="time">`.
  **Horários padrão** com nome (`preferencias.horariosPadrao` em videos.json, catálogo único — vale para
  todo tipo) vêm primeiro no seletor; cadastro em `abrirHorariosPadrao` (do seletor e de Ajustes › Horários padrão).
- A pipeline guarda a rolagem de cada coluna (`rolagemColunas`) e marca o **último card aberto**
  (`is-recente`, selo "último aberto"); se o card em foco muda de etapa ou posição no redesenho
  (`acompanharFoco`), rola até ele e pisca. Abrir postagem de dentro da view = `abrirItem`, não `fonte.abrir`.
- Fases da pipeline recolhem numa faixa estreita (localStorage `iris.postagens.fasesRecolhidas`).
- **Agenda** tem abas **Próximas** (atrasados, hoje → +60 dias, prontos sem data e um "Últimos 7 dias"
  recolhível no topo) e **Anteriores** (histórico por dia, do mais recente ao mais antigo, com atalhos de
  período, "Só publicadas/Todas", resumo e separador por semana). O dia de uma publicada é o mesmo das
  Métricas (`dataParaMetricas`); sem hora marcada, mostra a hora de `publicadoEm`. Escolhas em localStorage
  `iris.postagens.agenda`.
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
- **Editor organizado pela ordem do PDF**, em quatro partes (`buildParte`: ícone, para que serve
  e "No PDF: onde aparece"): Capa → Informações gerais → Seções → Fechamento, com o **mapa**
  fixo à esquerda (✓ quando a parte tem conteúdo de verdade — `secaoPreenchida`/`blocoPreenchido`;
  bloco vazio de modelo não conta). Cada seção tem três passos rotulados: Introdução → Conteúdo
  (blocos, pelo menu "Adicionar bloco" com a explicação de cada tipo) → Postagens analisadas.
  Parte nova ou campo novo = dizer para que serve e onde sai no PDF.
- **Modelos** ([relatorios.modelos.ts](src/renderer/modules/relatorios/relatorios.modelos.ts)):
  "Resultados do mês", "Análise de postagens", "Em branco" no Novo relatório, e tipos prontos em
  "Adicionar seção" (`MODELOS_SECAO`, em grupos: Números automáticos — resultados, só vídeos, só imagens,
  por rede, comparativo, melhores e piores, produção; Números a mão — números das redes (indicadores já
  nomeados, valores vazios), metas × realizado, plano de ação, calendário do próximo período (puxa as
  postagens com data, não publicadas, como cópia); Análise e texto). Bloco de modelo vazio (indicador sem
  valor, tabela sem linha preenchida) não sai no documento. O main cria o relatório com uma seção vazia "Análise"; o modelo a substitui.
  Modelo só cria estrutura vazia — nunca texto inventado.
- **Guias de escrita** ([relatorios.guias.ts](src/renderer/modules/relatorios/relatorios.guias.ts)): todo campo de
  texto tem placeholder de exemplo (os de métricas, resumo, conclusão e próximos passos citam os números reais do
  bloco ou do primeiro bloco de métricas) e um "Como escrever" (`buildGuia`) com perguntas-guia. "Começar com os
  números" escreve **só fatos** do resultado gravado (`frasesDoResultado`, `frasesDaAnalise`, `frasesDaPostagem`),
  via evento `input`; a interpretação é de quem escreve. Campo novo = entrada em `PERGUNTAS` + exemplo.
  A IA do campo lê o mesmo guia (`buildGuia` registra o textarea; `comIaRelatorio` junta
  `orientacaoDoGuia` — perguntas + exemplo como modelo de forma — e `fatosDoGuia` antes do relatório completo).
- **PDF**: o documento é um DOM só
  ([relatorios.documento.ts](src/renderer/modules/relatorios/relatorios.documento.ts)), usado
  na prévia e no PDF, exportado pela base comum de documentos (ver "Documentos em PDF").
  [relatorios-impressao.css](src/renderer/styles/relatorios-impressao.css) tem só as quebras de página do relatório.
- **Empresa por tags** (`relatorios.json` v3): `Relatorio.tagIds` são tags-empresa do catálogo
  único (a criação e o editor listam só `empresa: true`; uma tag comum escolhida antes continua
  visível, marcada, até ser desmarcada);
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
- **Blocos calculados além das métricas** (v4): `comparativo` (o filtro em dois períodos — `periodoAnterior`
  em relatorios.metricas.ts: mês exato → mês anterior, senão o mesmo tamanho logo antes; variação com seta e
  sinal, `variacaoComparativo`), `ranking` (N maiores/menores do `resultado.postagens`, `rankingDoResultado`) e
  `producao` (`calcularProducao`: criadas, publicadas, atrasadas no período + pipeline por fase no cálculo).
  Os quatro editores calculados usam o mesmo `buildEditorFiltro`.
- **Bloco de métricas**: filtro (tipos, período, publicados/todos, redes, tags, prioridade) +
  `resultado` gravado com `calculadoEm` — uma fotografia, como o snapshot dos itens; só muda
  quando o filtro muda ou o usuário recalcula. Conta pela mesma regra da aba Métricas
  (`dataParaMetricas` de postagens.metricas.ts). Nomes de rede/tag vão por extenso no resultado.
- A **assinatura** fica em Ajustes (`ajustes.json` › `assinatura`); `buildAssinatura()` (ui/documento.ts) é o
  único lugar que a desenha. Categorias de marcação são editáveis por tipo.

## Documentos em PDF (base comum)

- Qualquer documento de papel (relatório, ficha de contato, contrato) sai pelo mesmo caminho: o renderer monta
  o DOM e chama `exportarDocumentoPdf(documento, exportar)` de [ui/impressao.ts](src/renderer/ui/impressao.ts), que
  põe o nó em `#impressao`, chama o canal do módulo e oferece "Abrir PDF" (`documentos:abrirPdf`). O canal do
  módulo chama `salvarPdfDaJanela(event, { tituloDialogo, nomeArquivo, rodape })` de [core/pdf.ts](src/main/core/pdf.ts):
  diálogo, `printToPDF` na própria janela, rodapé "Página N de M".
- O `printToPDF` pinta as margens de cima/baixo com a **cor de fundo da janela** (`#0c0d12`): `salvarPdfDaJanela`
  troca para branco durante a impressão e restaura depois — sem isso cada página sai com faixas pretas.
- [impressao.css](src/renderer/styles/impressao.css) esconde a tela e mostra `#impressao` (A4); cada documento
  tem as próprias regras de quebra. Família visual: `.rd-documento` (variáveis `--rd-*` de relatorios.css).
- Texto formatado e assinatura: [ui/documento.ts](src/renderer/ui/documento.ts) — `paragrafos(texto, classe,
  { titulos })` (`- `, `1. `, `**negrito**`; `#`/`##` só com `titulos: true`, para contratos) e `buildAssinatura`.
  relatorios.documento.ts reexporta as duas para quem já importava de lá.
- **Documento novo**: montar o DOM com essas peças, um canal `exportarPdf` no IPC do módulo chamando
  `salvarPdfDaJanela`, e conferir o resultado rasterizando o PDF (o de um relatório real saiu idêntico,
  pixel a pixel, depois da extração desta base).

## Contatos (CRM)

- `contatos.json` (v1): `pessoas`, `empresas` (cadastros **separados**, sem ligação com as "empresas" de
  Postagens — lá empresa é tag de conteúdo), `interacoes` (histórico), `etapas` do funil (`tipo`
  aberta/ganha/perdida; sementes Lead, Em conversa, Proposta, Cliente, Perdido), `modelos` e `contratos`.
  Pessoa pode ter `empresaId` (empresa do CRM). `RefContato {tipo, id}` aponta qualquer um dos dois.
- Main em três arquivos: [contatos.arquivo.ts](src/main/modules/contatos/contatos.arquivo.ts) (`migrate` e todas as
  `migrate*` — tudo que entra passa por elas), `contatos.service.ts` (pessoas, empresas, funil, etapas, histórico)
  e `contatos.contratos.ts`. `salvarPessoa`/`salvarEmpresa`: sem id cria; com id **mescla** sobre o salvo e
  migra (`proximoContato: null` limpa). Mudar a etapa (por qualquer caminho) escreve um `evento` no histórico
  ("Etapa: A → B"); contrato criado/enviado/assinado também. Excluir pessoa leva o histórico; contratos ficam
  (guardam `contatoNome`). Excluir empresa só desliga as pessoas dela.
- Tela ([contatos.view.ts](src/renderer/modules/contatos/contatos.view.ts)): abas Pessoas · Empresas · Funil ·
  Contratos, faixa **"Para contatar"** (próximo contato hoje ou atrasado — `paraContatar`).
  **Ficha** (tela cheia, prefixo de CSS `cf-` em [contatos-ficha.css](src/renderer/styles/contatos-ficha.css)): topo com
  identidade, etapa, telefone e WhatsApp, a linha "próximo / último contato / origem" e o menu **⋯** (copiar, PDF, contrato,
  arquivar, excluir); **abas** Visão geral · Conversa · Histórico · Contratos (`AbaFicha`, localStorage `iris.contatos.fichaAba`;
  `abrirContato(ref, aba)` abre já numa). Partes: `contatos.ficha.ts` (casca), `.rascunho.ts` (o rascunho, `agendar`,
  `descarregarFicha`, `salvarERedesenhar`), `.campos.ts` (linha "rótulo | valor", campo que parece texto até o foco),
  `.dados.ts`, `.lado.ts`, `.historico.ts` e `contatos.conversa.ts`. Dados editados no lugar e salvos na pausa por
  `salvarSilencioso` (não redesenha — o foco fica); ações estruturais (etapa, empresa, próximo contato, histórico, trocar de
  aba) descarregam o pendente e redesenham. Cada aba tem a própria chave `data-rolagem`. Voltar ao módulo começa nas abas.
  Funil (`contatos.funil.ts`, sortablejs) e editor de etapas. Ctrl+P encontra contatos (`abrirContato` em navegacao.ts).
- **Aba Modelos** (Pessoas · Empresas · Funil · Contratos · Modelos): o editor de modelos direto na tela
  (`buildAbaModelos`); o mesmo `buildEditorModelos` serve o modal aberto de dentro do Novo contrato ("Editar este
  modelo" / "Ver todos os modelos", que ao fechar relê o seletor). O texto não salvo fica em `rascunhoModelo` (fora do
  DOM) e sobrevive ao redesenho; com ele, o push de lead troca o cache sem redesenhar (`emEdicao` da casca).
  `ModeloContrato.quandoUsar` ("para que serve") aparece na lista e no seletor, que ordena pelo último uso
  (`modelosPorUso`). "Novo contrato" fora da ficha pede o contato antes (`escolherContato`); "Usar num contrato" já
  vem com o modelo; "Salvar como modelo" no topo de um contrato em rascunho cria um modelo com o texto dele.
- **Contratos**: campos em [contratos.campos.ts](src/shared/types/contratos.campos.ts) (puro, dos dois lados):
  `CAMPOS_CONTRATO` (do contato, da empresa da pessoa, `meu_*` de Ajustes › Seus dados, datas, `{foro}`);
  campo fora do catálogo = **a preencher ao gerar**; `preencher` deixa `{campo}` sem valor visível e a tela
  avisa. O contrato guarda a **cópia do texto final** (editar o modelo não muda contrato feito). Texto só muda
  em rascunho (o main recusa depois de enviado — duplicar vira rascunho novo). O Iris **não escreve cláusula**:
  o modelo novo é `ESQUELETO_MODELO`, só estrutura. PDF do contrato e da ficha em `contatos.documento.ts`;
  as linhas de assinatura vêm dos cadastros, não do texto.
- **Seus dados** (`ajustes.json` v3 › `perfil`: PF/PJ, documento, representante, endereço, foro): a outra parte
  dos contratos e o cabeçalho dos documentos. Seção `perfil` de Ajustes, em `SECOES_AJUSTES`.
- [brasil.ts](src/shared/types/brasil.ts) (puro, dos dois lados): CPF/CNPJ por dígito verificador
  (`problemaDoDocumento` só avisa, nunca bloqueia), telefone/CEP/moeda, `lerEndereco`, `enderecoPorExtenso`,
  `dataIsoPorExtenso` (monta a data à mão — `new Date('AAAA-MM-DD')` cairia no dia anterior), `hojeLocal`.
- Backup: `contatos` em `EXPORTAVEIS` (com aviso de dados pessoais) e planilha com abas Pessoas, Empresas e Contratos
  (a de Pessoas leva também chegada, pontuação e UTMs dos leads).

## Leads por API (módulos Leads, Relatórios de leads e API e n8n)

- **Quatro módulos sobre o mesmo `contatos.json`** (state de Contatos): Contatos (Pessoas · Empresas · Funil · Contratos),
  Leads, Relatórios de leads e API e n8n — separados como Postagens/Relatórios/Roteiros em Conteúdo. Contatos e Leads usam
  a mesma **casca** ([contatos.casco.ts](src/renderer/modules/contatos/contatos.casco.ts)): a tela do módulo, a ficha ou o
  contrato por cima, o push `contatos:mudou`, "visto" ao abrir a ficha e a rolagem. Cada módulo passa `desenharTela` e o
  `rotuloVoltar` da ficha ("Contatos" ou "Leads"): abrir um lead em Leads fica em Leads. Relatórios de leads e API e n8n não
  abrem ficha e têm ciclo de vida próprio (state + push).
- Navegação: `abrirContato(ref)` abre em Contatos (Ctrl+P); `abrirLead(ref)` abre a ficha em Leads (clique na notificação);
  `abrirApiLeads(secao)` abre API e n8n numa seção (`SecaoApiLeads`). O selo de não vistos é do módulo `leads`
  (`definirContagem('leads', n)`); o ícone da categoria soma sozinho.
- **Contrato único** `POST /v1/leads` (JSON, urlencoded de `<form>` e multipart), igual nos dois caminhos. Campos no catálogo
  `CAMPOS_API` ([leads.types.ts](src/shared/types/leads.types.ts), puro) — ele alimenta a validação e a tabela da aba API.
  `validarLead` é a validação de verdade (a do Worker é barreira); aceita apelidos comuns (name, phone, company). Especiais:
  `_chave` (ou cabeçalho `X-Iris-Chave`), isca `_site` (preenchida = robô, responde 201 e descarta), `_redirecionar` (303).
  Respostas 201/400 (erro por campo)/401/403/413/429; 32 KB e 20 envios/min por IP.
- **Caixa na nuvem**: o código do Cloudflare Worker é texto em [leads.worker.ts](src/shared/types/leads.worker.ts) (`String.raw`:
  sem crase nem `${` dentro). KV `LEADS`, variáveis `CHAVE_FORMULARIO`, `CHAVE_IRIS`, `ORIGENS`. O KV grátis só permite 1.000
  `list`/dia: cada envio grava também a chave `ultimo` e o `GET` só lista se chegou algo até 3 min antes do `desde` que o
  Iris manda. A tarefa `contatos:leads` (60 s) busca, importa e confirma (`/v1/leads/confirmar` apaga da caixa); os ids
  importados ficam em `leadsConfig.idsRecebidos` (300) para confirmação falha não duplicar. Mudou o Worker: subir `VERSAO_WORKER`
  e o comentário do topo do código — quem já colou continua com o antigo até colar de novo.
- **Servidor local** ([contatos.servidor.ts](src/main/modules/contatos/contatos.servidor.ts), `node:http`): 127.0.0.1, ou
  0.0.0.0 com "aceitar da rede local". `aplicarServidor` é em fila (salvar + `reaplicarAgendamentos` chamam juntos); fecha no
  `before-quit`.
- **Receber** ([contatos.leads.ts](src/main/modules/contatos/contatos.leads.ts) do main): `receberLeads` faz uma leitura e uma
  gravação por lote, **sem `await` entre ler e gravar**. Mesmo e-mail ou telefone (`telefoneComparavel`) = a mesma pessoa:
  histórico "Voltou pelo formulário", `retornos`+1, volta a não visto. Lead novo vira Pessoa na primeira etapa com
  `Pessoa.entrada: EntradaLead` (contatos.json v2); empresa/CNPJ liga a uma `EmpresaCrm` (mesmo CNPJ ou nome) ou cria.
  A mensagem vira histórico do tipo `formulario` (automático como `evento`: não se edita e não conta como "último contato").
  `salvarPessoa` nunca aceita `entrada` da tela (o rascunho da ficha teria um `visto` velho).
- **Pontuação** ([leads.pontuacao.ts](src/shared/types/leads.pontuacao.ts), puro): `CRITERIOS_PONTUACAO` com pesos em
  `leadsConfig.regras`; teto 100; faixas quente/morno/frio (selo sempre ícone + texto). **Recalculada em toda leitura**
  (`migrateEntrada`): mudar a regra repontua todos sem passo extra.
- **Aviso**: `Notification` do Electron (guardar a referência viva, senão o clique se perde) → push `contatos:abrir`;
  `contatos:mudou` atualiza a tela e o selo de não vistos no trilho (`definirContagem` em sidebar.ts, via
  [core/leads.ts](src/renderer/core/leads.ts), vivo a sessão toda). Abrir a ficha de um lead por qualquer caminho marca visto.
  Com ficha ou contrato aberto, o push troca o cache sem redesenhar (`recarregarSilencioso`): quem digita não perde o foco.
- **Chave do Iris** no cofre (`leads.nuvem.chave`): gerar e copiar acontecem no main (`clipboard.writeText`); a tela só
  recebe `temChaveIris` e os 4 últimos caracteres. A chave do formulário é pública e fica em `leadsConfig`.
- **Contas** em [leads.estatisticas.ts](src/shared/types/leads.estatisticas.ts) (puro): Painel, Relatório e as frases de "O que
  está acontecendo" leem daqui. Datas locais tratadas como relógio de parede (`minutosDe` via `Date.UTC`). Frases só com fatos
  e com amostra mínima (sem opinião). "Sem resposta" = funil aberto, nenhuma conversa registrada à mão, mais de 24 h.
- Telas no renderer:
  - `modules/leads/`: `leads.view.ts` (cabeçalho, Caixa de entrada | Painel em localStorage `iris.leads.visao`, estado vazio
    único), `leads.caixa.ts`, `leads.painel.ts` (gráficos de postagens.graficos.ts — `buildRanking` aceita `textoValor`) e
    `leads.chegada.ts` (o cartão "Como chegou", desenhado pela ficha).
  - `modules/relatorios-leads/`: lista de relatórios guardados + editor em tela cheia (como o módulo Relatórios);
    `relatorios-leads.documento.ts` é o papel. Guarda só a configuração (`relatoriosLeads`: `atualizadoEm` e `exportadoEm`
    opcional — "Salvar" sem exportar existe); números sempre recalculados.
  - `modules/api-leads/`: índice fixo à esquerda e uma seção por vez (Visão geral, Caixa na nuvem, Servidor local, n8n, No seu
    site, Chaves, Pontuação, Avisos). Peças e o status do main em `api-leads.pecas.ts`; uma seção por arquivo. Os códigos
    prontos saem com o endereço e a chave reais; o curl usa `\"` para funcionar no Prompt de Comando.
  - CSS em [leads.css](src/renderer/styles/leads.css) com prefixos `ld-` (Leads), `rl-` (Relatórios de leads) e `la-` (API e
    n8n); o documento em papel (`ct-doc-*`) fica em contatos.css.
- **n8n** ([leads.n8n.ts](src/shared/types/leads.n8n.ts), puro): três cenários e o endereço que o n8n chama em cada um —
  neste PC `127.0.0.1:<porta>`; em Docker `host.docker.internal:<porta>` (exige "aceitar da rede local": o 127.0.0.1 do
  contêiner é ele mesmo); num servidor/n8n Cloud, a caixa na nuvem (de lá não se alcança o PC). O cenário vem do endereço salvo
  em Ajustes › n8n (`cenarioPeloEndereco`; Docker não dá para adivinhar). `fluxoN8n` monta o fluxo Webhook (`iris-lead`) →
  Set "Campos do Iris" (expressões `$json.body.x ?? …`) → HTTP Request com `X-Iris-Chave`: o mesmo JSON para colar
  (Ctrl+V no editor) e para criar pela API pública (`criarWorkflow` em n8n.service.ts: só `name/nodes/connections/settings`,
  propriedade a mais é recusada; nasce desligado). `chamarWebhook` testa ponta a ponta no webhook de produção (404 = fluxo
  desligado).
- Testar a nuvem sem conta Cloudflare: importar `CODIGO_WORKER` como módulo em Node, com um KV falso em memória, atrás de um
  `http.createServer`; a URL `http://127.0.0.1` é aceita só para esse teste (na internet, sempre https). Testar o n8n sem
  n8n: um servidor Node que responde a API de workflows e, no webhook, executa o fluxo salvo (avalia as expressões do Set e
  faz o HTTP Request dele).

## WhatsApp (módulo WhatsApp + aba Conversa da ficha)

- **O que se vê é o que sai.** O texto passa por [whatsapp.campos.ts](src/shared/types/whatsapp.campos.ts) (puro: os campos dos
  contratos + `primeiro_nome`, `como_chamar`, `saudacao`) na prévia **e** no main; o pedido leva `textoEsperado` e o main recusa
  se o texto montado der diferente (`whatsapp.envio.ts`). Campo sem valor bloqueia o envio. O texto nunca é aparado
  (`textoExato`: só `
` → `
`).
- `whatsapp.json` (próprio, fora de contatos.json): `config` (provedor padrão, Meta, Evolution, WAHA, n8n, limites), `mensagens`
  (`MensagemWa`, com `idExterno` do provedor), `modelos` (texto com campos + `metaTemplate` opcional) e `lotes` (envio para vários).
  Credenciais no cofre `whatsapp.*` (`meta.token`, `meta.appSecret`, `evolution.apikey`, `waha.apikey`, `webhook.chave`); a tela
  recebe `StatusWhatsapp` (booleanos + 4 últimos). Backup: `whatsapp` em `EXPORTAVEIS`, planilha Mensagens/Envios.
- **Caminhos** = um adaptador por provedor em [provedores/](src/main/modules/whatsapp/provedores) (`AdaptadorWa`: `falta`,
  `testar`, `enviarTexto`, `enviarTemplate?`, `conferirNumero?`, `listarTemplates?`, `configurarWebhook?`, `buscarConversa?`),
  catálogo `PROVEDORES_WHATSAPP`. `link` não envia: abre `whatsapp://send` no app do PC (`appDoWhatsapp` — WhatsApp ou WhatsApp Beta da Store, detectado
  pelo **nome** do protocolo: `getApplicationInfoForProtocol` falha com app da Store) ou `web.whatsapp.com/send`, conforme
  `config.link.abrirEm`; grava `aberta-no-whatsapp`. O "Testar" abre o app sem número (escolha de conversa — nada sai). Meta fora da
  janela de 24 h (`dentroDaJanela`, a partir da última mensagem recebida) só aceita template. TLS inseguro por grupo
  (`setHostsInseguros(hosts, 'whatsapp')` — cada serviço tem a sua lista).
- **Envio**: grava "enviando" → chama o provedor → grava o resultado (duas gravações; HTTP fora do trecho ler→gravar). Abrir o
  app com algo "enviando" vira "não saiu" com aviso (`recuperarInterrompidas`, em main.ts antes da janela). Cada envio para um
  contato atualiza **um registro por dia** no histórico de Contatos (tipo `whatsapp-iris`, somente leitura,
  `INTERACOES_DO_APP`): é o que faz o WhatsApp contar como contato em "último contato", "Sem resposta" dos leads, planilha e PDF.
- **Recebimento**: tudo vira `EventoWa` ([whatsapp.eventos.ts](src/shared/types/whatsapp.eventos.ts), tradutores tolerantes de
  Meta, Evolution v1/v2 — `MESSAGES_UPSERT` e `messages.upsert` —, WAHA e o formato do Iris) e cai em `receberEventos`: dedup
  por `idExterno` (`idsRecebidos`), status **só avança** (`statusSeguinte`: "lida" antes de "entregue" é comum), eco de envio
  casa por número+texto, número com e sem o **9** casa (`mesmoNumeroWa`), número fora do cadastro fica em "Sem cadastro".
  Rotas `/v1/whatsapp/<meta|evolution|waha|iris>/<chave>` no servidor local (contatos.servidor.ts) e no Worker (versão 2, KV
  `wa:`, variáveis `CHAVE_WHATSAPP` e `META_APP_SECRET`; o GET responde o `hub.challenge` da Meta). A busca na nuvem roda na
  mesma tarefa dos leads. Evolution/WAHA: "Ligar o webhook" configura pela API; abrir a conversa busca as últimas 50.
- **Lotes** (`whatsapp.fila.ts`): tarefa `whatsapp:fila` (15 s) só enquanto há lote enviando; um destino por rodada, marcado
  antes de enviar (fechar no meio não duplica), intervalo sorteado, horário e limite diário. Só campos do cadastro; quem tem
  `naoEnviarWhatsapp` (ContatoBase) ou falta campo é pulado com motivo.
- **n8n** ([whatsapp.n8n.ts](src/shared/types/whatsapp.n8n.ts)): fluxos "enviar pela API oficial", "enviar pela Evolution" (o nó
  confere `X-Iris-Chave` e responde `{ idExterno }`) e "receber pela API oficial". Credenciais nunca vão para o fluxo; a chave
  aparece mascarada na prévia e só sai inteira pelo "Copiar JSON"/"Criar no n8n" do main.
- Telas: `modules/whatsapp/` — `whatsapp.view.ts` (índice: Conversas · Envio para vários · Modelos · Conexão), `whatsapp.composer.ts`
  (caixa de escrever, rascunho por conversa que sobrevive ao redesenho), `whatsapp.ui.ts` (formatação `*negrito*`/`_itálico_`/
  `~riscado~`, bolha, situação com ícone + texto), state com **vários ouvintes** (`assinar`). Vivo a sessão toda em
  [core/whatsapp.ts](src/renderer/core/whatsapp.ts): selo de não lidas e o clique na notificação (`whatsapp:abrir` →
  `abrirConversaWa`). CSS em [whatsapp.css](src/renderer/styles/whatsapp.css), prefixo `wa-` (reusa o layout `la-` de API e n8n).
- Testar sem conta: uma Evolution falsa em Node (responde `sendText` com `key.id` e devolve `messages.update`/`upsert` ao webhook
  configurado) e o Worker importado em Node com KV em memória, como nos leads.

## Roteiros

- `roteiros.json`: status `rascunho` → `revisao` → `aprovado`/`reprovado` (reprovar exige
  motivo; editar um reprovado volta a rascunho), checklist de verificação (a padrão do arquivo
  entra em todo roteiro novo) e histórico. Tags = catálogo único de Postagens.
- `aprovarRoteiro` (main) cria o card na **primeira coluna** do Kanban via `kanbanService`,
  com o roteiro na descrição; guarda `kanbanCardId` e não duplica se o card ainda existe.
- **v2: o roteiro é uma lista de cenas** (`Roteiro.cenas`, fonte única): tipo (`TIPOS_CENA`: gancho,
  abertura, seção, demonstração, CTA, encerramento), título, `fala` (só ela conta no tempo), `visual`,
  `textoTela`, `notas`, `duracaoAlvoSeg`. Mais `briefing` (tema, público, tom, objetivo, pontos-chave,
  duração alvo, ppm), `pesquisa` (notas + fontes), `versoes` (máx. 30), `revisaoIa`, `adaptadoDe`.
- **Markdown ↔ cenas** em [roteiros.conversao.ts](src/shared/types/roteiros.conversao.ts) (compartilhado,
  puro): `cenasDoMarkdown` lê o formato canônico **e** o texto livre antigo ("[0:00–0:45] — Título" sem
  `##`, "[Cena: …]", "[Texto na tela]:", "[Fontes]:" com linhas soltas, ficha "Tom:/Público:" no topo);
  `markdownDasCenas` gera o canônico — ida e volta sem perda. Usado na migração v1→v2 (o texto antigo
  fica intacto em `textoLegado`, visível em Versões), no card do Kanban, no modo texto livre, no rascunho
  da IA e na exportação. O primeiro `getFile` depois da migração grava o arquivo (ids estáveis).
- Tempo de fala = palavras da fala ÷ ppm (`ppmDe`: briefing ou o do formato — Reels 170, YouTube 150,
  Live 140). `lerDuracaoTexto` aceita "45s", "8 min", "12–15 minutos" (vale o maior).
- **Estúdio de roteiro** ([roteiros.estudio.ts](src/renderer/modules/roteiros/roteiros.estudio.ts)) é a
  tela cheia do módulo (não um painel): topo (título, situação, ações), faixa com a linha do tempo
  (`roteiros.linhaTempo.ts`) e as ferramentas, e três colunas — Estrutura (índice com sortablejs)/
  Briefing/Pesquisa · Cartões/Duas colunas (AV)/Texto livre (`roteiros.cartoes.ts`, `roteiros.livre.ts`) ·
  Prévia/IA/Revisão/Verificação. "Foco" esconde as laterais; o centro usa container query.
  Partes recebem um `CtxEstudio` (roteiros.comum.ts): `digitou()` salva na pausa (atualizarSilencioso) e
  atualiza tempos/linha/índice/prévia **sem redesenhar campos**; `mudouEstrutura()` redesenha o centro.
  Ações que notificam (status, restaurar, duplicar, adaptar) descarregam o pendente antes; o listener
  chama `sincronizarEstudio`, que recarrega o rascunho do arquivo.
- **IA** (tarefas `roteiro-angulos/estrutura/cena/acao-cena/variacoes/critica/adaptar`, saída `json`
  devolvida em `RespostaTexto.json` e conferida campo a campo na tela): Assistente em 4 passos
  (`roteiros.assistente.ts`, estado por roteiro, "Continuar da cena N" se parar), ✨ de cada cartão
  (`roteiros.ia.ts`), Revisor (`roteiros.revisor.ts`) e Adaptar (cria roteiro **novo**). Toda troca feita
  pela IA mostra antes × depois e, ao aplicar, guarda **versão automática antes** (`versaoAntes`).
- Teleprompter (`roteiros.teleprompter.ts`, rola pelo ppm) e Versões com diff de linhas lado a lado
  (`roteiros.versoes.ts`; restaurar guarda a atual como "Antes de restaurar").

## To-do

- `todo.json`: várias checklists (título, descrição, cor, prioridade, prazo, itens, `ordem`
  manual, `arquivada`). Tudo se edita no próprio cartão ([todo.view.ts](src/renderer/modules/todo/todo.view.ts));
  o menu "⋯" tem o resto. Colar várias linhas no "Adicionar item" cria um item por linha.
- **Enviar ao Kanban** (`enviarAoKanban` no main): cria o card na coluna escolhida com os itens
  como `subtasks`, prioridade e prazo; grava `envio` e a checklist continua no To-do marcada
  como enviada (o card é cópia). Reenviar com o card ainda existente exige `forcarNovo`.
  O selo lê o quadro do Kanban para mostrar a coluna e as subtarefas atuais do card.
- Reordenar com filtro ativo: a tela manda a ordem completa, trocando só as posições das
  checklists visíveis — as escondidas não saem do lugar.
- **Cada aba só mostra o que é dela**: Abertas (inicial) · Concluídas · Arquivadas — não há aba
  "Todas" (misturava tudo; o usuário pediu para tirar). Concluir uma checklist (último item,
  "marcar todos", remover o último pendente) a tira das Abertas com um aviso
  (`acompanharConclusao` → `mostrarToast` de [ui/toast.ts](src/renderer/ui/toast.ts), com "Ver" e,
  quando dá, "Desfazer"). Concluídas tem "Arquivar todas".

## Inteligência artificial

- **Provedores** (catálogo único `PROVEDORES` em [ia.types.ts](src/shared/types/ia.types.ts), com
  `grupo` nuvem/local/avançado que Ajustes usa para agrupar): OpenRouter, OpenAI, Anthropic (Claude —
  **não gera imagem**), Google Gemini, Groq, DeepSeek, Mistral, **Ollama** e **LM Studio** (locais) e
  "Compatível com OpenAI" (base URL). Groq/DeepSeek/Mistral/locais reusam `criarOpenAi(rotulo, basePadrao)`
  e só escrevem. **Locais (`semChave`)**: sem chave, ficam prontos pelo `ativo` (botão "Ativar"); endereço
  editável com `basePadrao` (o padrão não é gravado); `comAvisoLocal` troca o `ErroSemConexao` do
  `chamarJson` por "abra o Ollama"; "Testar" sem modelo baixado ensina o `ollama pull`. Um adaptador por provedor em
  [src/main/modules/ia/provedores/](src/main/modules/ia/provedores) com a mesma interface
  (`listarModelos`, `gerarTexto`, `gerarImagem?`); o compatível reusa o da OpenAI (`criarOpenAi`).
  Modelos se escolhem por `abrirSeletorModelo` (ui/ia.ts: busca, rolagem, preço do OpenRouter) —
  o `<datalist>` do Chromium não rola com centenas de itens. `RECOMENDACOES_OPENROUTER` traz
  id sugerido + termo de busca (se o id sumir, o seletor abre filtrado).
  Tudo em HTTP direto pelo `httpClient` (aceita `FormData` para o multipart de `/images/edits`),
  sem SDK. Erros viram mensagens em português em `chamarJson` (401/403 chave, 402/429 crédito,
  429 com `limit: 0` = modelo sem cota gratuita no Google…) como `ErroProvedor` (status + texto
  original). 500/503/529 têm uma segunda tentativa automática.
- **Modelos novos sem tabela por modelo**: todo pedido passa por `enviarTolerante` (comum.ts) —
  se o provedor recusar apontando um parâmetro, ele é tirado ou trocado e o pedido vai de novo
  (até 3×; `model`/`messages`/`contents`… nunca saem). Ajustes específicos no adaptador:
  `max_tokens`↔`max_completion_tokens` e fallback para `/v1/responses` (OpenAI), `imageConfig` e
  `responseModalities` (Gemini), instrução de sistema no texto (Gemma), `modalities` só `image`
  para modelos só-imagem e teto pelo saldo ("can only afford N") no OpenRouter, teto máximo
  do modelo no Claude. Imagen vai por `:predict`. As listagens tiram modelos que não conversam
  (voz, embeddings, computer use, vídeo). "Testar" em Ajustes manda um pedido mínimo ao modelo
  de texto salvo e confere o de imagem na lista.
- **Chaves** no secretStore como `ia.<provedor>.apiKey`; a tela recebe só `temChave`/`configurado`
  e `finalChave` (os 4 últimos caracteres, para reconhecer qual está salva — a chave inteira nunca
  sai do main). O campo tem o olho só para o que está sendo digitado.
  Config sem chave em `ia.json` (entra no backup). `resolver(capacidade)` escolhe o provedor:
  pedido explícito → padrão → primeiro configurado com a capacidade.
- **Prompts moram no main** ([ia.prompts.ts](src/main/modules/ia/ia.prompts.ts)): a tela manda
  `TarefaTexto` + `ContextoTexto`. Tarefas com opções pedem JSON (`lerVariantes` é tolerante).
  Todo pedido de texto tem `<tarefa>`, `<campo>` (com a `orientacao` do que o campo deve conter),
  `<material>` e `<regras>` (`REGRAS_TEXTO`: só o material, citar números, nunca inventar, dizer o
  que falta em vez de encher de generalidade). Campo novo com IA = passar uma `orientacao`
  específica (ex.: `ORIENTACOES_RELATORIO` em relatorios.ia.ts) — sem ela o texto sai genérico.
- **Prompt de imagem**: o pedido do usuário vai dentro de `montarPromptDeImagem` (uma imagem
  profissional, fiel ao pedido, texto em português legível, e o formato certo — repetido porque
  ideias/prompt podem citar outro formato). `modo: 'modificar'` manda só a instrução; o main
  monta o pedido de edição. Os prompts de apoio (melhorar/ideias/thumbnail) usam
  `PAPEL_DIRETOR_DE_ARTE`: ficar no tema e não citar formato nem proporção.
- **Imagens**: `gerarImagem` (ia.tarefas.ts) devolve a tarefa na hora e empurra `ia:tarefa`;
  o resultado é recortado/redimensionado com `nativeImage` para o formato exato
  (`FORMATOS_IMAGEM_IA`, ex. thumb 1280×720). Tudo vai para a **galeria interna**
  (`userData/ia-galeria/<id>.png` + `ia-galeria.json`, fora do backup — binário);
  "Salvar na Biblioteca" copia para a pasta padrão (raiz + subpasta "Iris IA", pathGuard) e cria
  o recurso na coleção Thumbnails. Anexar a uma postagem = salvar na Biblioteca + `recursoIds`.
- **Referências nunca por caminho vindo do renderer**: arquivo escolhido no dialog do main (mapa
  id → caminho), recurso da Biblioteca por id (validado com `assertDentroDasRaizes`) ou item da
  galeria por id. PNG/JPG/WebP, até 20 MB, até 8.
- **Onde aparece**: Estúdio IA ([ia.view.ts](src/renderer/modules/ia/ia.view.ts), criador
  compartilhado em `ia.criador.ts`); "Sugerir com IA" nos painéis de vídeo e imagem
  (`postagens.ia.ts` — preenche disparando `input`, o mesmo caminho da digitação); "Thumbnail com
  IA" na seção Materiais (`ia.thumbnail.ts`); botão "IA" na barra dos Roteiros (`roteiros.ia.ts`).
  Sem IA configurada, `exigirIa()` explica e leva a Ajustes › Inteligência artificial / Tutorial.
- **Qual IA escreve**: com 2+ IAs de texto configuradas, o usuário escolhe na hora. Menus de IA
  (`abrirMenuIa(…, { escolherIa: true })`) têm a fileira "Gerar com" (padrão marcada) e passam a
  escolha ao `fazer(ia)`; botões diretos passam por `comGeracao`, que abre `escolherIaDeTexto`
  se não recebeu `ia`. `PedidoTexto.provedor` vazio = padrão de Ajustes. Com uma IA só, nada aparece.
- **Assistente de texto genérico** (ui/ia.ts): `comAssistente(textarea, {area, campo, contexto})`
  envolve qualquer campo com o botão "IA" (Escrever / Melhorar / Resumir ou Desenvolver);
  `sugerirItensComIa` + `escolherItens` para checklists e subtarefas (tarefa `lista-itens`). Usado
  em Relatórios (`relatorios.ia.ts` manda o relatório inteiro + números das métricas como
  `referencia`), Kanban (descrição e subtarefas), To-do ("Sugerir itens") e Pensamentos (post-it →
  desenvolver ou virar checklist no To-do).
- **Estúdio**: o criador aceita vários formatos marcados — cada um vira uma tarefa própria;
  "Pedir ideias" (`ideias-imagem`, 4 conceitos → prompt); "Modificar" (`abrirModificacao` em
  ia.acoes.ts) manda a imagem da galeria como referência com o pedido do que mudar.
  A visualização grande (`abrirVisualizacao`) navega pelas imagens visíveis (setas e ←/→), com
  ações em grupos e "Apagar imagem" no rodapé; o cartão da galeria também tem a lixeira.
- Config e tarefas compartilhadas no renderer: [core/ia.ts](src/renderer/core/ia.ts). Guia do
  Tutorial: `GUIA_IA` (GuiaId `'ia'`).

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
  usa drag-and-drop nativo do HTML5 (não sortablejs) com o tipo `application/x-iris-postagem`. Mês (só as
  semanas que o mês usa) ou semana, e um **painel fixo à direita** com duas abas: **Dia** (o dia clicado —
  `diaSelecionado`, começa em hoje — por horário, com selo da situação) e **Sem data**. Soltar no painel do
  dia agenda naquele dia; soltar em "Sem data" tira a data; "dia todo" na semana tira a hora. Cada dia do
  mês mostra no máximo 3 linhas (`MAX_POR_DIA`, o "+N" ocupa a terceira), por isso as semanas podem usar
  `minmax(112px, 1fr)` sem o conteúdo vazar. Abaixo de 1000px (container query `calendario` e
  `LARGURA_COM_PAINEL`) o painel desce para baixo da grade e o clique no dia abre o modal. Situação
  (publicado/agendado/vencido/em produção) é a cor da barra do cartão, sempre com rótulo no title, no painel
  e na legenda. Visão e aba em localStorage `iris.postagens.calendario`. O navegador ‹ Hoje › e os títulos
  de período são de [postagens.periodo.ts](src/renderer/modules/postagens/postagens.periodo.ts), dividido com Métricas.
- Redes têm `logo` opcional do catálogo `REDES_CONHECIDAS` (videos.types.ts); os glifos
  SVG ficam em [postagens.logos.ts](src/renderer/modules/postagens/postagens.logos.ts) — desenhados
  no código, a CSP não permite imagem externa. Para achar uma rede escrita na planilha, use
  `acharRede()` (nome, sigla ou apelido como "Insta"/"Reels") nos dois lados; para mostrar
  a planilha de origem de um vídeo, `descreverOrigem()`.
- `Video.score` (0–100) vem da planilha (`parseScore` aceita "85", "85%", "8,5");
  informação extra com nome de score é promovida ao campo na migração, com preferência para
  "Score Editorial" (o nome usado nas planilhas dele) sobre outros como "Score Viral".
  Campo que o mapeamento lembrado de uma aba não cobre recebe o palpite pelo nome da coluna.
- **Escalas de score** ([score.types.ts](src/shared/types/score.types.ts), puro, usado pelos dois
  lados): escalas nomeadas do usuário em `videos.json` (`escalasScore`, `escalaPadraoId`, catálogo
  único); cada empresa escolhe uma (`TagPostagem.escalaScoreId`; ausente = acompanha a padrão).
  A faixa guarda **só o início** (`de`) — termina onde a próxima começa, a primeira começa em 0:
  não há buraco nem sobreposição possível. `sentido` (positivo/mediano/negativo) decide "Pontos
  positivos / de atenção / negativos" em Métricas; a meta do gráfico = início da primeira faixa
  positiva (`metaDaEscala`). Cor de faixa vem de `CORES_FAIXA` (gravada em hex, o PDF também pinta).
  Uma postagem se lê por `escalaDaPostagem` (primeira empresa com escala, na ordem do catálogo);
  um conjunto por `escalaDoRecorte` — escalas misturadas usam a padrão nas médias e a tela avisa.
  Nunca comparar com número fixo: sempre `faixaDaEscala`. Arquivo anterior ganha a "Padrão" com o
  corte antigo em 85 (`ESCALA_LEGADA`). Editor em [postagens.escalas.ts](src/renderer/modules/postagens/postagens.escalas.ts)
  (Ajustes › Escalas de score e botão na aba Métricas). O bloco de métricas dos Relatórios grava
  uma **cópia** da escala no `resultado` (a das empresas do filtro); resultado sem escala é lido
  com `ESCALA_LEGADA`. A aba **Métricas** (postagens.metricas.ts, prefixo de CSS `mt-` — o `rl-` antigo era
  dividido com Relatórios de leads e o leads.css sobrescrevia a grade) se lê de cima para baixo: resumo (nota
  em destaque com `buildMiniLinha` + três números de apoio), Produção (por mês + **"Pipeline agora"**, as
  etapas por fase — os números que saíram do topo da pipeline; ignora o período), Qualidade, Onde funciona
  melhor, Destaques (lista vazia vira uma linha de texto) e a Conferência recolhível no fim. Período e base
  em localStorage `iris.postagens.metricas`. Gráficos SVG próprios de
  [postagens.graficos.ts](src/renderer/modules/postagens/postagens.graficos.ts): um eixo só, cores validadas
  contra a superfície escura, tabela alternativa em cada gráfico (`buildCartaoGrafico` com `tabela: null`
  para os rankings, que já são texto). Mês de um vídeo publicado = `dataAgendada` (não `publicadoEm`, que num lote
  importado é o dia da importação).
- O painel do vídeo abre na posição de `preferencias.posicaoPainel` (centro = modal com
  fundo e seções em duas colunas; esquerda/direita = lateral sem fundo).
- **Anexos do computador** (Materiais › "Do computador"): arquivo de qualquer pasta, sem pasta
  monitorada. O main copia para `userData/anexos/<id><ext>` na escolha (regra do Sheets: a
  postagem nunca depende do original); a postagem guarda só `anexos: AnexoPostagem[]` (nome,
  extensão, tamanho). Tela fala por id — `aplicarEdicaoComum` só aceita anexo cuja cópia existe.
  Binários fora do backup (como a galeria da IA). Órfãos vão para `anexos/orfaos/` na abertura
  (`limparOrfaos` em backgroundServices, que lê vídeos + imagens — **tipo novo entra lá**) e só
  somem após 30 dias; voltam sozinhos se uma postagem os usar de novo.
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
- **O app não é assinado.** Com o Controle Inteligente de Aplicativos do Windows 11 ligado, o
  `spawn` do instalador baixado falha com `UNKNOWN` (o log `CodeIntegrity/Operational` registra
  "did not meet the signing level requirements"). Nada no código contorna isso — só assinatura
  digital. `rodarInstalador` só fecha o app no evento `spawn` (antes fechava às cegas) e traduz
  o erro em `mensagemDeBloqueio`.
- Só a instalação NSIS se atualiza (detectada pelo `Uninstall Iris.exe` ao lado do exe); o .zip
  portátil e o `npm run dev` só avisam e abrem a página da release.
- **Troca manual** (Ajustes › Atualizações): "Escolher versão…" lista todas as releases
  (`listarVersoes`, sem rascunhos) e instala qualquer uma — mais nova, a mesma ou anterior
  (voltar avisa que dados de recursos novos podem não ser entendidos). "Instalar de um
  arquivo…" roda um `Iris-Setup-*.exe` do disco (ex.: o de `release/` antes de publicar); se
  há `latest.yml` ao lado descrevendo o arquivo, confere o SHA-512 e recusa se não bater. O
  caminho escolhido fica **só no main** (`arquivoEscolhido`) — o renderer nunca manda caminho
  para executar. Fora da instalação NSIS, o instalador abre no modo assistente.
- Verifica 12 s após abrir e a cada 6 h (tarefa `atualizacao:verificar`); estado por push
  `atualizacao:estado`. UI: aviso na barra lateral ([core/atualizacao.ts](src/renderer/core/atualizacao.ts))
  e Ajustes › Atualizações.
- **Publicar versão nova**: `npm version X.Y.Z --no-git-tag-version`, commit, push, e `git tag vX.Y.Z` +
  `git push origin vX.Y.Z`. A tag dispara [release.yml](.github/workflows/release.yml), que roda `npm run release`
  num Windows do GitHub com o `GITHUB_TOKEN` e recusa tag diferente da versão do package.json. **Não rodar
  `npm run release` no PC do Gabriel**: o Controle Inteligente de Aplicativos bloqueia o desinstalador sem
  assinatura que o NSIS executa durante o build (`spawn UNKNOWN` em `computeScriptAndSignUninstaller`). Sai como release publicada, não rascunho
  (`releaseType: release`) — rascunho não aparece em `releases/latest`. O `nsis.artifactName`
  sem espaços é o que o service procura (`/setup.*\.exe$/i`).
- O mesmo workflow tem um job `linux` (`needs: release`, para não disputar a criação da release): `dist:linux`, teste de
  fumaça (abre o app empacotado em `xvfb-run` com `IRIS_SAIR_APOS_ABRIR=1` e exige o marco "primeira tela") e só então
  publica AppImage + .deb. No Linux o modo de atualização é `linux`: avisa e abre a página da release; "Escolher versão…"
  e "Instalar de um arquivo…" (NSIS) não aparecem.

## Backup e exportação

- Um formato só (`ExportBundle`) para o backup completo e para o arquivo de um módulo: todos os módulos
  opcionais + `escopo`. Backup antigo, sem `escopo`, é lido pelas chaves presentes. Catálogo
  `EXPORTAVEIS` (export.types.ts): Postagens leva vídeos **e** imagens (o catálogo de tags mora nos vídeos).
- Importar é em dois passos: `escolherImportacao` (diálogo no main, arquivo guardado **só no main**,
  devolve a prévia com contagens) → `aplicarImportacao(modulos)`, que grava antes uma cópia do estado
  atual em `userData/backups/antes-de-importar-*.json` (10 mais recentes) e substitui. "Desfazer última
  importação" restaura essa cópia (e guarda `antes-de-desfazer-*`). Depois de importar, a janela recarrega.
- Planilha (.xlsx, `export.planilhas.ts`, xlsx sob demanda) só para ler fora do Iris: Kanban, To-do,
  Postagens, Roteiros, Tráfego (razões por `calcularMetricas`). Não se importa de volta.

## Tutorial

- Um guia por área do app + os de conexão (IA, n8n, Servidores, GitHub). Conexões em
  [tutorial.content.ts](src/renderer/modules/tutorial/tutorial.content.ts) (passos com `verificar`
  que consultam o estado real; provedores de IA são `opcional` — não contam no progresso); áreas em
  `tutorial.areas.ts`. Só o grupo `conectar` mostra progresso; nos outros o selo fica no passo.
- Telas: Início (destaque + cartões por grupo da sidebar), guia (índice "Neste guia", anterior/próximo)
  e busca (abre o guia rolando até o passo). Blocos: texto, lista (`numerada`), aviso
  (dica/info/atencao), comando, link, `atalhos` (kbd) e `abrir` (leva a um módulo ou seção de Ajustes).
- Área nova = guia novo em `GUIAS_DAS_AREAS` e o id em `GuiaId` (navegacao.ts); `abrirTutorial(id)`
  abre direto nele. Ícone vem de `ICONE_DO_MODULO` (sidebar.ts) pelo `modulo` do guia.

## Atalhos de teclado

- Um ouvinte só, na janela: [core/atalhos.ts](src/renderer/core/atalhos.ts). O que existe e a tecla padrão estão em
  [atalhos.catalogo.ts](src/renderer/core/atalhos.catalogo.ts) (`CATALOGO_ATALHOS`; `ATALHOS_FIXOS` são as que só
  aparecem na ajuda, como Ctrl+1…9 e as do teleprompter). Quem executa é ligado por id: os globais em
  `atalhos.globais.ts` (na abertura), os de um módulo no mount dele — `desligar = ligarAtalhos({ 'kanban.novo': … })`
  e `desligar()` no destroy. Atalho com `escopo` só vale com aquele módulo aberto (`moduloAtual()` de navegacao.ts).
  **Não criar `keydown` de documento num módulo**: entrada no catálogo + `ligarAtalhos`.
- Regras do despacho: com modal aberto nada dispara; com foco num campo só Ctrl/Alt e teclas F
  (`passoFuncionaDigitando`); "G K" é sequência (1,2 s para a segunda tecla, aviso "G…" no canto). Ctrl+P sempre
  tem o `preventDefault` (imprimir do Chromium).
- **Módulo novo = uma letra em `IR_PARA`** (`Record<ModuloId, Combo>`, o compilador cobra). Tutorial é F1, Ajustes
  Ctrl+,. Alt+←/→ andam no histórico de módulos (`registrarVisita`/`voltarModulo` em navegacao.ts).
- Combinação em texto, sempre "Ctrl" (nunca "⌘"): `"Ctrl+Shift+K"`, `"Alt+Left"`, `"G K"` —
  [atalhos.types.ts](src/shared/types/atalhos.types.ts) (puro, dos dois lados: `normalizarCombo`, `TECLAS_RESERVADAS`
  — copiar/colar/desfazer, recarregar, fechar janela, devtools, zoom, F5, F11, Esc, Enter, Tab).
- Trocas do usuário em `ajustes.json` v4 › `atalhos` (só o que difere do padrão; `''` = sem atalho; id desconhecido é
  mantido). Ajustes › Atalhos (`ajustes.atalhos.ts`) captura a combinação nova, avisa conflito (mesma tecla no mesmo
  escopo, ou "G" sozinho contra "G K") e tira a tecla da outra ação ao salvar.
- Mostrar a tecla: `buildTeclas(comboDe(id))` (ui/pagina.ts, `.pg-kbd`) ou `comAtalho(texto, id)` num title — nunca
  escrever a tecla à mão, ela pode ter sido trocada. Ajuda com Shift+? (`atalhos.ajuda.ts`), busca rápida mostra a tecla
  de cada módulo, blocos `atalhos` do Tutorial com `acao` leem a tecla atual.

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
  [painel.ts](src/renderer/ui/painel.ts) — esquerda/centro/direita, fundo no centro. O centro é
  centralizado por `inset: 0; margin: auto`, **nunca** `translate(-50%, -50%)`: numa caixa de medida
  em vh/min() isso cai em meio pixel e o Chromium borra todo o texto do painel.
  Duas áreas: `grade` (conteúdo) e `lateral` (propriedades — etapa, datas, tags, configuração). No centro,
  conteúdo numa coluna à esquerda e propriedades numa coluna fixa à direita (grid via `:has`); nas laterais,
  propriedades empilhadas antes do conteúdo. Sem nada na `lateral`, a grade volta às duas colunas de jornal.
  Usam a lateral: Postagens (vídeo, imagem), cartão do Kanban ("Detalhes") e campanha do Tráfego. Seção nova
  de painel = decidir se é conteúdo ou propriedade. O cabeçalho mostra só o tipo ("Card", "Campanha"), sem código.
- Reusar as peças compartilhadas em [src/renderer/ui/pagina.ts](src/renderer/ui/pagina.ts)
  (`buildCabecalho`, `buildSelo`, `buildIndicadores`, `buildBusca`, `buildVazio`,
  `buildBotao`, `buildTeclas`, `ICONES`, `svg`, `tempoRelativo`) e
  [src/renderer/ui/modal.ts](src/renderer/ui/modal.ts) (`openFormModal`, `promptText`,
  `openConfirmModal`) em vez de recriar variantes.
- Estado nunca é comunicado só por cor: `buildSelo` sempre emite ícone + texto.
- **Nada de faixa de números no topo de tela de trabalho** (Contatos, pipeline, To-do, Roteiros, lista de
  Relatórios, GitHub, n8n…): o usuário achou que tinha "cara de IA". `buildIndicadores` só em tela de análise
  (Métricas, Leads › Painel, Tráfego › Painel); um número útil vira gráfico lá. Contagem discreta nas abas
  ("Pessoas · 12") pode.
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
- **Medir antes de otimizar**: `IRIS_MEDIR_ABERTURA=1` imprime os marcos da abertura (main.js, ready, janela,
  did-navigate, dom-ready, did-finish-load, primeira tela — avisada pelo `app.ts` via `app:primeiraTela`) e
  `IRIS_SAIR_APOS_ABRIR=1` fecha quando a primeira tela aparece ([core/abertura.ts](src/main/core/abertura.ts)).
  Medido em out/2026: ~0,55 s no dev, 0,6–0,85 s empacotado no Windows, ~0,7 s no Ubuntu 24.04. Os requires do
  main pesam ~85 ms espalhados pela árvore dos services (não há um vilão só). Juntar os CSS num arquivo foi medido
  e **não** ajudou — não refazer.
- A janela **não espera** as migrações da abertura (`migrarEmpresas`, `recuperarInterrompidas`): elas viram
  `dadosProntos`, e `registerAllIpcHandlers` embrulha todo `ipcMain.handle` para esperar essa promessa antes do
  service. Os serviços de fundo também esperam por ela.
- O esquema `app://` tem `codeCache: true`: sem ele o Chromium não guarda o bytecode dos módulos do renderer.
- **Medir sem outra instância aberta no mesmo `--user-data-dir`**: duas instâncias no mesmo perfil fazem a segunda
  esperar ~6 s pelo bloqueio e a medição sai falsa.

## Linux

- AppImage + .deb x64 (`package.json › build.linux/appImage/deb`). O `.deb` declara `depends` à mão: a lista padrão
  do electron-builder não traz `libasound2` (no Ubuntu 24.04, `libasound2t64`) e o app nem abre sem ela.
  `desktopName` + `syncDesktopName` ligam a janela ao `.desktop`.
- No Ubuntu 23.10+ o AppArmor bloqueia o sandbox do Chromium em AppImage (comum a todo app Electron): o README
  manda Ubuntu/Debian/Mint para o `.deb`, que deixa o `chrome-sandbox` SUID na instalação. Não desligar o sandbox.
- Código que muda por sistema: `iconeDoApp()` ([core/icone.ts](src/main/core/icone.ts) — `.ico` no Windows, `.png`
  no resto, para janela e notificações); `isEncryptionAvailable()` devolve `false` no Linux com o backend
  `basic_text` (sem chaveiro o safeStorage só ofusca — a tela avisa "sem cofre"); `detectarModo()` da atualização.
- Na tela: `window.irisAPI.system.plataforma` e [ui/plataforma.ts](src/renderer/ui/plataforma.ts) (`NO_LINUX`,
  `COFRE`, `DO_SISTEMA`). Texto novo que cite o Windows (cofre, notificação, Lixeira, firewall, PowerShell, Store)
  usa essas constantes.
- Testar sem Linux: Docker Desktop. Montar em `electronuserland/builder:20` (copiar o projeto sem `node_modules`,
  `npm ci && npm run dist:linux`) e rodar o `.deb` num `ubuntu:24.04` com `xvfb-run`, como usuário comum e
  `--security-opt seccomp=unconfined` (o seccomp padrão do Docker bloqueia o sandbox do Chromium). Capturas: socat
  repassando o `--remote-debugging-port` para fora do contêiner.

## Armadilhas

- **Datas "AAAA-MM-DD" são sempre locais.** Nunca `toISOString().slice(0, 10)` para "hoje"
  (é a data UTC: no Brasil vira amanhã a partir das 21h) nem `new Date('2026-10-03')` para ler
  (é meia-noite UTC: vira o dia anterior). Use `hojeIso`/`somarDias` de `postagens.ui.ts`, ou
  monte com `getFullYear/getMonth/getDate`; "amanhã" é `setDate(+1)`, não `+86400000`.
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
