# Iris

**Assistente pessoal de tarefas e organização de conteúdo — 100% local, no seu computador.**

O Iris junta num app só o que costuma ficar espalhado em várias ferramentas: tarefas,
planejamento de postagens, roteiros, relatórios para clientes, arquivos, anotações e o
acompanhamento de servidores e automações. Não tem conta, não tem servidor na nuvem e não
coleta nada: seus dados ficam em arquivos no seu computador.

[![Licença: GPL v3](https://img.shields.io/badge/licen%C3%A7a-GPL%20v3-blue.svg)](LICENSE)
[![Última versão](https://img.shields.io/github/v/release/GabrielAlvesB/Iris?label=vers%C3%A3o)](https://github.com/GabrielAlvesB/Iris/releases/latest)
![Plataforma](https://img.shields.io/badge/plataforma-Windows-lightgrey)

---

## Sumário

- [O que o Iris faz](#o-que-o-iris-faz)
- [Baixar e instalar](#baixar-e-instalar)
- [Privacidade](#privacidade)
- [Rodar a partir do código](#rodar-a-partir-do-código)
- [Como o projeto é organizado](#como-o-projeto-é-organizado)
- [Como contribuir](#como-contribuir)
- [Autor](#autor)
- [Licença](#licença)

---

## O que o Iris faz

São 18 módulos, organizados na barra lateral:

**Tarefas**
- **Kanban** — quadro de cards com colunas, prazos, prioridade, responsável e subtarefas.
- **To-do** — checklists do dia a dia; qualquer uma vira um card no Kanban.

**Conteúdo**
- **Postagens** — pipeline de vídeos e imagens, do rascunho à publicação: calendário, agenda
  automática, redes sociais, empresas e tags, materiais anexados e métricas.
- **Estúdio IA** — gera imagens e thumbnails e ajuda a escrever textos, usando a sua chave de
  OpenRouter, OpenAI, Anthropic (Claude), Google (Gemini) ou de um servidor compatível
  (Ollama, LM Studio).
- **Relatórios** — documentos em PDF para apresentar resultados a uma empresa: capa, números do
  período, postagens comentadas e próximos passos, com modelos prontos para começar.
- **Roteiros** — escrever, revisar e aprovar roteiros; o aprovado vira card no Kanban.
- **Sheets** — planilhas simples, com importação e exportação de Excel/CSV e envio de linhas
  para a pipeline de postagens.

**Arquivos**
- **Biblioteca** — organiza (coleções, tags, notas) arquivos de pastas que você escolhe, sem
  copiar nada.
- **Quadro** — um quadro livre de notas, tarefas e rotinas.
- **Copy** — textos prontos para copiar com um clique (ou `Ctrl+1…9`).
- **Pensamentos** — post-its de ideias soltas.
- **Links rápidos** — atalhos para os sites que você mais usa.

**Sistema**
- **Servidores** — verifica se seus servidores estão no ar e roda comandos por SSH.
- **n8n** — acompanha as execuções dos seus workflows do n8n e dispara um workflow na hora.
- **GitHub** — junta os seus repositórios do GitHub com as pastas de projeto do computador:
  commits recentes e a situação do git de cada um.

**Tráfego**
- **Tráfego pago** — contas, campanhas e resultados diários de anúncios, com CTR, CPC, CPA e
  ROAS calculados sozinhos.

E ainda um **Tutorial** dentro do app e os **Ajustes** (conexões, IA, empresas e tags,
assinatura dos relatórios, atualizações e backup).

---

## Baixar e instalar

O Iris é feito para **Windows 10 e 11 (64 bits)**.

1. Abra a [página da última versão](https://github.com/GabrielAlvesB/Iris/releases/latest).
2. Em **Assets**, baixe um dos arquivos:

   | Arquivo | Para quem |
   | --- | --- |
   | `Iris-Setup-<versão>.exe` | **Recomendado.** Instala o Iris e **se atualiza sozinho** quando sai versão nova. |
   | `Iris-<versão>-win.zip` | Versão portátil: descompacte numa pasta e abra o `Iris.exe`. Não se atualiza sozinha — o app avisa quando há versão nova. |

3. Rode o instalador. Como o app ainda não tem assinatura digital, o Windows pode mostrar o
   aviso **"O Windows protegeu o computador"**: clique em **Mais informações** → **Executar
   assim mesmo**.

Na primeira abertura, o **Tutorial** (no fim da barra lateral) mostra o passo a passo de cada
módulo.

### Atualizações

A versão instalada verifica sozinha se há versão nova (ao abrir e a cada 6 horas), baixa,
confere a integridade do arquivo e instala. Também dá para fazer à mão em **Ajustes ›
Atualizações**, inclusive voltar para uma versão anterior.

### Backup

Em **Ajustes › Backup** você exporta todos os dados num arquivo só e importa de volta — por
exemplo, para levar o Iris para outro computador.

---

## Privacidade

- **Tudo fica no seu computador**, em `%APPDATA%\iris\data`. Não há conta, servidor do Iris
  nem telemetria.
- **Senhas e chaves** (SSH, n8n, GitHub, provedores de IA) são guardadas cifradas pelo próprio
  Windows. Elas não entram no arquivo de backup, porque a cifra só vale neste computador — num
  computador novo, é preciso digitá-las de novo.
- O app só acessa a internet para o que você configurou: seus servidores, o n8n, o GitHub, o
  provedor de IA escolhido e a verificação de atualizações no GitHub.
- A inteligência artificial usa a **sua** chave, e o custo é cobrado direto pelo provedor.

---

## Rodar a partir do código

### O que você precisa

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) 20 ou mais novo (vem com o npm)
- Windows 10/11 — é onde o app é desenvolvido e testado

### Passo a passo

```bash
git clone https://github.com/GabrielAlvesB/Iris.git
cd Iris
npm install
npm run dev
```

O `npm run dev` compila o projeto e abre o app.

> **Rodando pelo terminal do VS Code?** Se aparecer o erro `bad option`, remova a variável
> `ELECTRON_RUN_AS_NODE` do ambiente (o VS Code a define e ela faz o Electron rodar como
> Node puro). No PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE`.

> **Para testar sem mexer nos seus dados**, abra com outra pasta de dados:
> `npx electron . --user-data-dir=C:\caminho\para\uma\pasta-de-teste`

### Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Compila tudo e abre o app. |
| `npm run build` | Só compila, para a pasta `dist/`. |
| `npm start` | Abre o app já compilado. |
| `npx tsc -p tsconfig.json --noEmit` | Confere os tipos de todo o projeto, sem gerar arquivos. |
| `npm run dist` | Gera o instalador e o `.zip` portátil na pasta `release/`. |
| `npm run dist:portable` | Gera só o `.zip` portátil. |
| `npm run release` | Gera e publica uma versão no GitHub (precisa da variável `GH_TOKEN`; uso do mantenedor). |

O projeto não tem testes automatizados: a verificação é compilar e usar o app.

---

## Como o projeto é organizado

O Iris é um app [Electron](https://www.electronjs.org/) escrito em **TypeScript puro**, sem
framework de interface e sem bundler — as telas são montadas direto no DOM. As únicas
dependências do app são [SortableJS](https://sortablejs.github.io/Sortable/) (arrastar e
soltar), [ssh2](https://github.com/mscdex/ssh2) (comandos nos servidores) e
[SheetJS](https://sheetjs.com/) (planilhas).

```
src/
├── main/        processo principal: dados, arquivos, rede, IA, atualizações
├── preload/     a ponte segura entre a tela e o processo principal
├── renderer/    as telas (um diretório por módulo em renderer/modules/)
└── shared/      tipos e regras usados pelos dois lados
```

Cada módulo segue o mesmo formato: tipos em `shared/types`, um service e um arquivo de IPC no
`main`, e um state e uma view no `renderer`. O módulo **Pensamentos** é o exemplo mais curto
para entender o padrão. O arquivo [CLAUDE.md](CLAUDE.md) documenta a arquitetura, as regras de
segurança e as decisões de projeto em detalhe.

---

## Como contribuir

Contribuições são bem-vindas!

- **Encontrou um problema ou tem uma ideia?** Abra uma
  [issue](https://github.com/GabrielAlvesB/Iris/issues) explicando o que aconteceu (ou o que
  gostaria que acontecesse) e, se possível, como reproduzir.
- **Quer mandar código?**
  1. Faça um fork e crie um branch a partir do `main`.
  2. Faça a mudança seguindo o estilo do projeto: nomes e comentários em português, e
     comentários explicando o *porquê*, não o *o quê*.
  3. Confira os tipos (`npx tsc -p tsconfig.json --noEmit`) e teste no app (`npm run dev`).
  4. Abra um pull request descrevendo o que mudou e por quê.

Ao contribuir, você concorda que seu código seja distribuído sob a mesma licença do projeto
(GPL-3.0).

---

## Autor

Criado e mantido por **Gabriel Alves Tech** — [@GabrielAlvesB](https://github.com/GabrielAlvesB).

---

## Licença

O Iris é **software livre e de código aberto**, distribuído sob a
**[GNU General Public License v3.0](LICENSE)** (GPL-3.0).

Em resumo: você pode usar, estudar, modificar e redistribuir o Iris, inclusive
comercialmente. Se distribuir uma versão modificada, ela também precisa ser publicada sob a
GPL-3.0, com o código-fonte disponível. O texto completo, que é o que vale legalmente, está no
arquivo [LICENSE](LICENSE).

Copyright © 2026 Gabriel Alves Tech.
