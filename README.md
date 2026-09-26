# whatsapp-scrap

Extrai os participantes de grupos do WhatsApp Web — número, LID, nome da agenda, nome do perfil (pushname/notify), papel (membro/admin/superadmin), contato salvo, business/enterprise, bloqueado, silenciado, DDD, UF e país — e exporta para **JSON** (dados completos), **CSV** (só os números) e **XLSX** (planilha estilizada com 3 abas).

Duas formas de usar, o mesmo motor de leitura:

- **terminal** — `node ler_grupo.cjs` lê um grupo por vez (nome ou id vindo do `.env`);
- **interface local** — `npm run ui` abre uma página em `127.0.0.1` onde você escaneia o QR, filtra a lista de grupos e marca **quantos grupos quiser** para extrair de uma vez.

## ⚠️ Leia antes de usar

- **Cliente não oficial.** Isso automatiza o WhatsApp Web por CDP/puppeteer. Isso viola os termos do WhatsApp e **existe risco real de bloqueio da conta** (temporário ou definitivo). Use por sua conta e risco.
- **Dados de terceiros.** A saída contém números de telefone (e nomes) de pessoas que não consentiram. Trate como dado pessoal: não suba pro GitHub (o `.gitignore` já bloqueia `saida/`), não compartilhe sem base legal.
- **`.wwebjs_auth/` contém a credencial da sua sessão.** Também está no `.gitignore`. Nunca versione.

## Instalação (3 passos)

1. Instale o **Node.js LTS** ([nodejs.org](https://nodejs.org)) e tenha o **Google Chrome** (ou Edge, Brave, Chromium) instalado.
2. Dê dois cliques em **`iniciar.command`** (macOS) ou **`iniciar.bat`** (Windows). Na primeira vez ele roda o `npm install` sozinho.
3. A página abre no navegador: clique em **Conectar** e escaneie o QR.

Nada de baixar outro Chrome: o projeto usa o `puppeteer-core` e acha sozinho o navegador que você já tem (com um perfil separado, sem mexer no seu Chrome do dia a dia). O `.env` é opcional — só crie (`cp .env.example .env`) se quiser mudar algo.

Pelo terminal é o mesmo: `npm install` e `npm start`.

> No macOS, se aparecer "não foi possível verificar o desenvolvedor", clique com o botão direito em `iniciar.command` → **Abrir**. Se aparecer "permissão negada": `chmod +x iniciar.command`.

## Configuração (`.env`)

Tudo que é configurável vem de variáveis de ambiente, com os valores padrão do `.env`:

```bash
cp .env.example .env     # e edite à vontade
```

O `.env` é lido automaticamente pelo `src/config.cjs` (via `dotenv`), então funciona tanto em `node ler_grupo.cjs` quanto em `npm run iniciar`. Duas regras de precedência:

1. **Variável de ambiente na linha de comando ganha do `.env`** — útil para testes pontuais: `GRUPO="Outro Grupo" node ler_grupo.cjs`.
2. **`.env` ganha do padrão do código** — o único lugar com valores default é o `src/config.cjs`.

O `.env` está no `.gitignore` (só o `.env.example` é versionado).

O exemplo mais importante é o `GRUPO`, que aceita:

- **nome aproximado** — `Meu Grupo`, `meu grupo` ou `Grupo Meu` funcionam (ignora acento, maiúsculas e ordem das palavras), o que ajuda quando o grupo é subgrupo de comunidade e o nome aparece como `Meu - Grupo`, `Meu Grupo ⚽` etc.;
- **id** — `120363xxxxxxxxxxxxxx@g.us` (rode com `LISTAR=1` para ver os seus).

### Variáveis de ambiente

| Variável | Padrão | Para que serve |
|---|---|---|
| `GRUPO` | `Meu Grupo` | Nome aproximado ou id `1234@g.us` do grupo |
| `LISTAR=1` | — | Só lista os grupos/comunidades e sai (útil quando o nome não casa) |
| `HEADLESS=0` | headless | Abre uma janela real do Chrome — dá para escanear o QR na própria tela |
| `HEADLESS=shell` | — | Usa o `chrome-headless-shell` em vez do Chrome cheio (precisa apontar o binário em `CHROME_PATH`) |
| `PERFIL` | `./.wwebjs_auth/session` | Pasta do perfil do Chrome (é onde mora a sessão do WhatsApp) |
| `CHROME_PATH` | — | Caminho do navegador. Vazio = acha sozinho o Chrome, Edge, Brave ou Chromium instalado |
| `CHROME_ARGS` | — | Flags extras ao Chrome, ex. `CHROME_ARGS="--no-sandbox --disable-gpu"` (necessário dentro de sandbox/container) |
| `DIAG=1` | — | Imprime diagnóstico da leitura (formatos, contagem de nomes, exemplos) |
| `SEM_XLSX=1` | — | Gera só JSON e CSV |
| `SAIDA` | `./saida` | Pasta de saída |
| `JSON` / `CSV` / `XLSX` | dentro de `SAIDA` | Caminho individual de cada arquivo |
| `PORTA` | `4173` | Porta da interface local (`npm run ui`) |
| `ABRIR_NAVEGADOR=0` | — | Não abre o navegador do sistema sozinho ao subir a interface |

Caminhos relativos (`SAIDA`, `JSON`, `CSV`, `XLSX`) são resolvidos a partir da raiz do projeto, então dá para rodar o script de qualquer diretório.

## Uso

```bash
node ler_grupo.cjs          # ou: npm run iniciar
```

Na primeira execução aparece um QR no terminal: escaneie em **WhatsApp → Dispositivos conectados → Conectar dispositivo**. A sessão fica salva em `.wwebjs_auth/`, então as próximas execuções não pedem QR (o QR se renova sozinho no terminal se expirar).

A saída vai para a pasta `saida/`:

| Arquivo | Conteúdo |
|---|---|
| `saida/membros_ic.json` | tudo: metadados do grupo + um registro por participante |
| `saida/membros_ic.csv` | só os números, um por linha, sem repetir |
| `saida/membros_ic.xlsx` | planilha: abas **Participantes**, **Resumo** e **Por DDD-UF** |

Para refazer a planilha **sem reler o WhatsApp** (é o fluxo recomendado: leia uma vez, itere à vontade):

```bash
node gerar_xlsx.cjs         # ou: npm run planilha
```
### Códigos de saída

| Código | Significado |
|---|---|
| `0` | ok |
| `1` | falha inesperada |
| `2` | não chegou a logar (QR não escaneado / tempo esgotado) |
| `3` | grupo não encontrado (a lista de grupos é impressa) |
| `4` | erro ao ler o grupo |
| `5` | formato inesperado na lista de participantes |
| `7` | leitura suspeita (0 participantes, ou todos sem número) — **nada é gravado** |

Os códigos `5` e `7` existem por um motivo específico: nunca sobrescrever uma saída boa com uma leitura ruim. Se a leitura parecer errada, o script para e seus arquivos anteriores continuam intactos.

## Interface local no navegador

Serve para o caso de vários grupos de uma vez, e para quem não quer decorar variável de ambiente:

```bash
npm start                   # ou: npm run ui / node ui.cjs / dois cliques no iniciar
```

Ele sobe um servidor **só em `127.0.0.1`** (não fica exposto na rede) e abre a página. O fluxo é um só:

1. **Conectar** — abre o seu Chrome (invisível, com perfil próprio) e mostra o **QR na própria página** (o mesmo QR que o terminal imprime). Ele se renova sozinho se expirar. O QR tem que ser escaneado por quem tem a sessão, e cada dispositivo vinculado ocupa um dos **4 lugares** do WhatsApp.
2. **Escolher os grupos** — a lista vem da sua conta, com filtro por nome (ignora acento, maiúsculas e separadores: `offtopic` acha `Off-Topic`) e contagem de participantes por grupo. Marque quantos quiser — **Marcar visíveis** marca tudo que o filtro está mostrando.
3. **Extrair** — uma barra mostra o progresso por grupo. Cada grupo é tentado até 3 vezes (os dados às vezes ainda não chegaram do celular); se mesmo assim falhar, a linha aparece com o motivo e os demais seguem.

Se o WhatsApp desconectar o aparelho ou o Chrome fechar no meio do caminho, a página mostra isso em até ~10s — é só clicar em **Conectar** de novo.
4. **Baixar** — cada grupo ganha **XLSX**, **JSON** e **CSV** (só os números, no mesmo formato do `ler_grupo.cjs`, que é o que o `adm-sorteio-amostra` espera). Com mais de um grupo aparece também um **CSV consolidado** com a coluna `grupo`, para comparar quem está em quais.

5. **Exportar sob medida** — abaixo da tabela de resultados você escolhe o grupo (ou todos, com a coluna `Grupo`), **quais colunas** entram, **filtros** (papel, UF, DDD, só com número, só com nome, só contatos salvos, sem repetir número) e o separador (`;` para abrir direto no Excel em português). A contagem de linhas atualiza enquanto você mexe. Cada grupo também tem o link **completo**: um CSV com todas as colunas.
6. **PDF** — o botão **Baixar PDF** gera um relatório (participantes, admins, com nome, contatos salvos, distribuição por UF/país e lista de admins) usando o próprio Chrome, sem dependência extra. A lista de participantes só entra se você marcar a opção, e segue as mesmas colunas e filtros do CSV. **Mascarar números** (`+55 71 9****-2516`) vale para o CSV e o PDF e tira o LID — use quando o arquivo for circular.

Os grupos já extraídos são recarregados de `saida/grupos/` quando a interface sobe (por isso eles aparecem mesmo desconectado, com um aviso), então dá para exportar de novo sem conectar ao WhatsApp. O botão **apagar** remove do computador os arquivos daquele grupo.

Os arquivos ficam em `saida/grupos/`, com nome do grupo achatado + o final do id (`ic-geral-834321.xlsx`), sempre os três formatos por grupo. Dois grupos com o mesmo nome não se atropelam: o segundo vira `ic-geral-834321-2`. Reler um grupo que já foi extraído reescreve os mesmos arquivos.

`Ctrl+C` no terminal encerra o servidor, fecha o Chrome e solta o perfil.

O que a interface **não** faz, de propósito: não tem conta, não tem login, não manda nada para fora e não guarda a sua sessão em nenhum lugar além do `.wwebjs_auth/` que já existia. Um Chrome por vez usa o mesmo perfil, então **não dá para rodar o `npm run ui` e o `node ler_grupo.cjs` ao mesmo tempo**.

## A planilha

**Aba `Participantes`** (cabeçalho congelado, filtro automático, zebra; admin/superadmin destacados por cor):

`#` · `Número` · `Nome (agenda)` · `Nome do perfil` · `Apelido curto` · `Papel no grupo` · `É contato salvo` · `DDD` · `UF` · `DDI` · `País` · `Business` · `Enterprise` · `Bloqueado` · `Silenciado` · `Nome verificado` · `LID`

**Aba `Resumo`**: nome/JID/criador/data de criação/descrição, "só admins falam", "só admins editam", contagens (membros, admins, superadmins, com e sem número, números únicos, contatos seus, com nome, business, bloqueados, silenciados, UFs e DDDs distintos), versão do WhatsApp Web e data da leitura.

**Aba `Por DDD-UF`**: DDD, UF, quantidade e `% do grupo`, ordenado do maior para o menor.

## Como funciona

```
ler_grupo.cjs          # entrada: orquestra tudo, decide códigos de saída
gerar_xlsx.cjs         # entrada: só monta a planilha a partir do JSON
ui.cjs                 # entrada: sobe a interface local e encerra o Chrome no Ctrl+C
src/config.cjs         # env vars (carrega o .env), caminhos, tempos
src/navegador.cjs      # puppeteer-core: achar o Chrome instalado, detectar QR/login, esperar o sync
iniciar.command/.bat   # dois cliques: instala na primeira vez e abre a interface
src/pagina.cjs         # código que roda DENTRO da página (extração + listagem)
src/sessao.cjs         # estado da interface: conectar, listar grupos, extrair vários, arquivos
src/servidor.cjs       # HTTP + SSE da interface (estado, QR, progresso e downloads)
src/www/               # a página em si (html + css + js, sem build e sem framework)
src/resumo.cjs         # contagens + o que conta como leitura suspeita
src/saida.cjs          # escrita de JSON/CSV
src/exportar.cjs       # CSV sob medida: colunas, filtros, separador e máscara
src/pdf.cjs            # relatório em PDF (HTML impresso pelo Chrome instalado)
src/planilha.cjs       # montagem do XLSX (exceljs)
src/ddd.cjs            # tabelas DDD→UF e DDI→país + decomposição do número
```

A interface usa o **mesmo** `src/pagina.cjs` do terminal — a extração não foi duplicada. O que muda é só quem segura o estado: o `ler_grupo.cjs` narra no terminal e sai; o `src/sessao.cjs` mantém o Chrome aberto, publica o estado a cada mudança e deixa o `src/servidor.cjs` empurrar isso para a página por SSE.

Decisões que valem registrar:

- **Por que não `whatsapp-web.js`.** Ele era a dependência original, mas na 1.34.7 (última publicada) está quebrado contra o WhatsApp Web atual por dois motivos independentes: `getChats()` estoura porque o WhatsApp renomeou `MsgKey._serialized` para `$1` (uma conversa problemática derruba o `Promise.all` inteiro, e o erro aparece como um inútil `r: r`), e a sessão sofre force-logout com `Execution context was destroyed` no `inject`. Aqui a leitura é feita direto na store da página, pelo mesmo caminho que a lib usaria — sem `getChats()` e sem o inject dela.
- **User-agent.** O WhatsApp Web recusa o Chrome em headless ("atualize o Chrome") porque a UA vem com `HeadlessChrome`. O `src/navegador.cjs` troca por `Chrome` e usa o resto da UA real do binário.
- **LID → número.** Nesta versão o `id` do participante é um `@lid`, não um telefone. A resolução é feita com `WAWebLidMigrationUtils.toPn`, e a checagem de "sobrou LID?" acontece **depois** da resolução — checar antes foi exatamente o bug que zerou uma das primeiras versões.
- **"É contato salvo"** usa `isAddressBookContact` (o campo vivo nesta versão). `getIsMyContact` **não existe** em `WAWebContactGetters` e `isMyContact`/`isSaved` vêm sempre `false` — por isso há uma cadeia de fallbacks.
- **QR pela página, não pelo terminal.** O `src/navegador.cjs` já extraía o QR como texto (`data-ref`); a interface só troca quem mostra: em vez do `qrcode-terminal`, o texto vira SVG (`qrcode`) e vai por SSE. Sem VNC, sem abrir janela do Chrome.
- **SSE em vez de WebSocket.** O fluxo é só servidor → página (QR, status, progresso). `EventSource` já reconecta sozinho e não exige dependência nenhuma no cliente.
- **Sem framework e sem build.** A página é HTML/CSS/JS servidos como estão, de uma lista fixa de arquivos (nada de servidor de arquivos genérico) e com `Host`/`Origin` checados para uma página de fora não falar com o `127.0.0.1`.
- **Um grupo por vez, mesmo em lote.** A extração lê os grupos em série, nunca em paralelo: `metadados.update()` num grupo já mexe na store da mesma página, e paralelizar só criaria corrida sem ganho real (depois do login e do sync, cada grupo leva ~1s).
- **Erro em um grupo não derruba o lote.** Cada grupo é lido dentro do seu próprio `try`, vira uma linha com o motivo, e os outros seguem. É o mesmo espírito dos códigos `5`/`7` do terminal: leitura ruim vira aviso, nunca sobrescreve em silêncio.
- **Nada de multi-usuário.** Um servidor que hospeda o QR e a credencial de várias pessoas na mesma máquina é outro problema, com outro custo (isolamento de perfil, retenção de dado pessoal de terceiros, cada colega gastando um dos 4 lugares do dispositivo). A interface é deliberadamente local.

## Limitações conhecidas

- **Nomes.** Só aparece nome de quem está na sua agenda (`Nome (agenda)`) ou de quem tem nome de perfil sincronizado (`Nome do perfil`). Para os demais, esta sessão do WhatsApp simplesmente não tem o dado — testado com `Contact.find()` (o contato existe, mas sem nome), com o objeto do participante e com `__x_contact`/`mirror`. Na medição real: 117 de 1023 com nome, 906 só com número.
- **DDD → UF** é tabela fixa (`src/ddd.cjs`). Com portabilidade numérica o DDD indica a região de emissão do número, não onde a pessoa está.
- **Foto de perfil e "sobre"** não são extraídos: exigiriam uma requisição por participante.
- **Números** vêm como o WhatsApp armazena — não normalizei formatos (medido: 1013 com 12 dígitos, 9 com 13, 2 sem o prefixo `55`).
- Se a sessão for derrubada pelo WhatsApp, o script volta a pedir QR. Nesse caso escaneie **uma vez** e não fique re-tentando em sequência: insistir é o que transforma bloqueio temporário em ban.
- **A interface só lista grupos em que você está** (a lista sai das suas conversas) e só vê o que essa sessão vê. Um grupo que você não tem não aparece.
- **Uma sessão/Chrome por vez.** O perfil em `.wwebjs_auth/` tem ~200 MB e o Chrome é aberto de verdade: o `npm run ui` e o `node ler_grupo.cjs` disputam o mesmo perfil e não podem rodar juntos.
- **Os arquivos ficam em disco, sem cifrar.** `saida/grupos/` é dado pessoal de terceiros em texto puro, igual ao CSV do terminal. O `Ctrl+C` fecha o Chrome, mas não apaga nada.
- **Não é um serviço.** Não tem fila entre pessoas, nem login, nem vários usuários ao mesmo tempo — é uma página local que você abre para si.

## Problemas comuns

- `The browser is already running for .../.wwebjs_auth/session` — tem um Chrome vivo segurando o perfil (trava de um Chrome que já morreu é solta sozinha). Feche-o ou:
  `pkill -f "user-data-dir=$PWD/.wwebjs_auth/session"`
  Na interface, essa é justamente a mensagem que aparece se você tentar `npm run ui` com o `node ler_grupo.cjs` rodando (ou o contrário).
- `A porta 4173 está ocupada` — tem outro processo na porta. A própria mensagem sugere o caminho: `PORTA=4174 npm run ui`.
- `Não achei Chrome, Edge, Brave nem Chromium` — instale o Google Chrome ou aponte o caminho do navegador em `CHROME_PATH` no `.env`.
- **Grupos aparecem como "(sem nome)"** — o celular ainda estava mandando os dados quando a lista foi montada. Desconecte e conecte de novo; se persistir, rode `DIAG=1 npm run iniciar` e abra uma issue com a saída.
- **No celular**: "não é possível conectar dispositivos no momento" — bloqueio temporário do lado do WhatsApp. Espere antes de tentar de novo; QR expirado também dá essa mensagem, e o script imprime o QR novo sozinho.

## O que dá para fazer com a saída

A pasta `saida/` serve de entrada para outras ferramentas — por exemplo:

- [adm-sorteio-amostra](https://github.com/ynxdeiv/adm-sorteio-amostra) — sorteia uma amostra dos participantes (o id é a posição no arquivo, mais papel e contato salvo), com trilha de auditoria por seed e hashes, para quem precisa justificar o sorteio.

O CSV que a interface grava em `saida/grupos/` é o mesmo formato de números soltos que o `ler_grupo.cjs` gera, então ferramentas assim funcionam com ele do mesmo jeito. O **CSV consolidado** (coluna `grupo` na frente) é para comparar grupos entre si — dá para cruzar `grupo` × `numero` numa tabela dinâmica e ver quem está em mais de um.

## Licença

MIT — veja [LICENSE](LICENSE). Em resumo: pode usar, copiar, modificar e distribuir, inclusive comercialmente, mantendo o aviso de copyright; o software vem **sem garantia** de nenhum tipo.

A licença vale para o **código** deste repositório. Ela não muda os termos do WhatsApp: automatizar o WhatsApp Web continua sendo uso de cliente não oficial, com o risco descrito no aviso lá em cima.
