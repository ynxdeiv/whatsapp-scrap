# whatsapp-scrap

Extrai os participantes de um grupo do WhatsApp Web — número, LID, nome da agenda, nome do perfil (pushname/notify), papel (membro/admin/superadmin), contato salvo, business/enterprise, bloqueado, silenciado, DDD, UF e país — e exporta para **JSON** (dados completos), **CSV** (só os números) e **XLSX** (planilha estilizada com 3 abas).

## ⚠️ Leia antes de usar

- **Cliente não oficial.** Isso automatiza o WhatsApp Web por CDP/puppeteer. Isso viola os termos do WhatsApp e **existe risco real de bloqueio da conta** (temporário ou definitivo). Use por sua conta e risco.
- **Dados de terceiros.** A saída contém números de telefone (e nomes) de pessoas que não consentiram. Trate como dado pessoal: não suba pro GitHub (o `.gitignore` já bloqueia `saida/`), não compartilhe sem base legal.
- **`.wwebjs_auth/` contém a credencial da sua sessão.** Também está no `.gitignore`. Nunca versione.

## Requisitos

- Node.js 20+ (testado no 25)
- Chrome que o puppeteer controla: `npx puppeteer browsers install chrome`

```bash
npm install
npx puppeteer browsers install chrome
cp .env.example .env
```

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
| `CHROME_ARGS` | — | Flags extras ao Chrome, ex. `CHROME_ARGS="--no-sandbox --disable-gpu"` (necessário dentro de sandbox/container) |
| `DIAG=1` | — | Imprime diagnóstico da leitura (formatos, contagem de nomes, exemplos) |
| `SEM_XLSX=1` | — | Gera só JSON e CSV |
| `SAIDA` | `./saida` | Pasta de saída |
| `JSON` / `CSV` / `XLSX` | dentro de `SAIDA` | Caminho individual de cada arquivo |

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

## A planilha

**Aba `Participantes`** (cabeçalho congelado, filtro automático, zebra; admin/superadmin destacados por cor):

`#` · `Número` · `Nome (agenda)` · `Nome do perfil` · `Apelido curto` · `Papel no grupo` · `É contato salvo` · `DDD` · `UF` · `DDI` · `País` · `Business` · `Enterprise` · `Bloqueado` · `Silenciado` · `Nome verificado` · `LID`

**Aba `Resumo`**: nome/JID/criador/data de criação/descrição, "só admins falam", "só admins editam", contagens (membros, admins, superadmins, com e sem número, números únicos, contatos seus, com nome, business, bloqueados, silenciados, UFs e DDDs distintos), versão do WhatsApp Web e data da leitura.

**Aba `Por DDD-UF`**: DDD, UF, quantidade e `% do grupo`, ordenado do maior para o menor.

## Como funciona

```
ler_grupo.cjs          # entrada: orquestra tudo, decide códigos de saída
gerar_xlsx.cjs         # entrada: só monta a planilha a partir do JSON
src/config.cjs         # env vars (carrega o .env), caminhos, tempos
src/navegador.cjs      # puppeteer: abrir Chrome, detectar QR/login, esperar o sync
src/pagina.cjs         # código que roda DENTRO da página (extração + listagem)
src/resumo.cjs         # contagens (fonte única para console e planilha)
src/saida.cjs          # escrita de JSON/CSV
src/planilha.cjs       # montagem do XLSX (exceljs)
src/ddd.cjs            # tabelas DDD→UF e DDI→país + decomposição do número
```

Decisões que valem registrar:

- **Por que não `whatsapp-web.js`.** Ele era a dependência original, mas na 1.34.7 (última publicada) está quebrado contra o WhatsApp Web atual por dois motivos independentes: `getChats()` estoura porque o WhatsApp renomeou `MsgKey._serialized` para `$1` (uma conversa problemática derruba o `Promise.all` inteiro, e o erro aparece como um inútil `r: r`), e a sessão sofre force-logout com `Execution context was destroyed` no `inject`. Aqui a leitura é feita direto na store da página, pelo mesmo caminho que a lib usaria — sem `getChats()` e sem o inject dela.
- **User-agent.** O WhatsApp Web recusa o Chrome em headless ("atualize o Chrome") porque a UA vem com `HeadlessChrome`. O `src/navegador.cjs` troca por `Chrome` e usa o resto da UA real do binário.
- **LID → número.** Nesta versão o `id` do participante é um `@lid`, não um telefone. A resolução é feita com `WAWebLidMigrationUtils.toPn`, e a checagem de "sobrou LID?" acontece **depois** da resolução — checar antes foi exatamente o bug que zerou uma das primeiras versões.
- **"É contato salvo"** usa `isAddressBookContact` (o campo vivo nesta versão). `getIsMyContact` **não existe** em `WAWebContactGetters` e `isMyContact`/`isSaved` vêm sempre `false` — por isso há uma cadeia de fallbacks.

## Limitações conhecidas

- **Nomes.** Só aparece nome de quem está na sua agenda (`Nome (agenda)`) ou de quem tem nome de perfil sincronizado (`Nome do perfil`). Para os demais, esta sessão do WhatsApp simplesmente não tem o dado — testado com `Contact.find()` (o contato existe, mas sem nome), com o objeto do participante e com `__x_contact`/`mirror`. Na medição real: 117 de 1023 com nome, 906 só com número.
- **DDD → UF** é tabela fixa (`src/ddd.cjs`). Com portabilidade numérica o DDD indica a região de emissão do número, não onde a pessoa está.
- **Foto de perfil e "sobre"** não são extraídos: exigiriam uma requisição por participante.
- **Números** vêm como o WhatsApp armazena — não normalizei formatos (medido: 1013 com 12 dígitos, 9 com 13, 2 sem o prefixo `55`).
- Se a sessão for derrubada pelo WhatsApp, o script volta a pedir QR. Nesse caso escaneie **uma vez** e não fique re-tentando em sequência: insistir é o que transforma bloqueio temporário em ban.

## Problemas comuns

- `The browser is already running for .../.wwebjs_auth/session` — sobrou um Chrome vivo segurando o perfil. Feche-o ou:
  `pkill -f "user-data-dir=$PWD/.wwebjs_auth/session"`
- `Could not find Chrome` — falta instalar o navegador do puppeteer: `npx puppeteer browsers install chrome`.
- **No celular**: "não é possível conectar dispositivos no momento" — bloqueio temporário do lado do WhatsApp. Espere antes de tentar de novo; QR expirado também dá essa mensagem, e o script imprime o QR novo sozinho.

## Licença

MIT — veja [LICENSE](LICENSE). Em resumo: pode usar, copiar, modificar e distribuir, inclusive comercialmente, mantendo o aviso de copyright; o software vem **sem garantia** de nenhum tipo.

A licença vale para o **código** deste repositório. Ela não muda os termos do WhatsApp: automatizar o WhatsApp Web continua sendo uso de cliente não oficial, com o risco descrito no aviso lá em cima.
