# RTCloud Deploy: GitHub Action

Publica uma versão nova da sua aplicação na [RTCloud](https://rtcloud.com.br) a cada push.

A Action:

1. confere a chave e a aplicação antes de qualquer envio;
2. monta o `.zip` do projeto respeitando o `.rtcloudignore` (ou o `.gitignore`);
3. envia pelo **Commit** da API pública (`POST /api/v1/apps/{id}/commit`), o mesmo caminho do botão Commit do painel;
4. reinicia de novo quando o `.env` do pacote trouxe variáveis novas;
5. escreve o resultado no resumo do job, com situação, tamanho do pacote, tempo e link para o painel.

```yaml
- uses: actions/checkout@v5
- uses: RTPySystems/rtcloud-deploy@v1
  with:
    api-key: ${{ secrets.RTCLOUD_API_KEY }}
    app-id: minha-api
```

---

## Começando em 3 passos

**1. Gere uma chave de API.** No painel da RTCloud, abra o menu da conta (rodapé da barra lateral) → **Chaves de API** → nova chave com **acesso total**. Ela começa com `rtc_` e só aparece uma vez.

> A chave do servidor MCP (`rtm_`) não serve aqui. A Action recusa essa chave antes de enviar qualquer coisa.

**2. Guarde a chave no repositório.** No GitHub: **Settings → Secrets and variables → Actions → New repository secret**, com o nome `RTCLOUD_API_KEY`.

Se quiser, crie também a variável `RTCLOUD_APP_ID` na aba **Variables**, com o id da aplicação. O id aparece no painel; o nome exato da aplicação também funciona.

**3. Crie o workflow.** Salve como `.github/workflows/deploy-rtcloud.yml`:

```yaml
name: Deploy na RTCloud

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: rtcloud-deploy
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v5

      - name: Publicar na RTCloud
        id: rtcloud
        uses: RTPySystems/rtcloud-deploy@v1
        with:
          api-key: ${{ secrets.RTCLOUD_API_KEY }}
          app-id: ${{ vars.RTCLOUD_APP_ID }}
```

Pronto: o próximo push na `main` vira versão nova no ar. Há outros modelos em [`exemplos/`](exemplos/).

---

## Entradas

| Entrada | Obrigatória | Padrão | O que é |
| --- | --- | --- | --- |
| `api-key` | sim | — | Chave da API com acesso total (`rtc_…`). Use sempre um secret. |
| `app-id` | sim | — | Id da aplicação no painel, ou o nome exato dela. |
| `path` | não | `.` | Pasta do projeto, relativa à raiz do repositório. Em monorepo, aponte para a pasta da aplicação. |
| `restart` | não | `auto` | Reinício extra depois do commit: `auto`, `true` ou `false` (veja [Reinício](#reinício)). |
| `api-url` | não | `https://rtcloud.com.br/api/v1` | Endereço da API. Deixe como está; a entrada existe para testes. Precisa ser `https`. |

## Saídas

| Saída | Exemplo | O que é |
| --- | --- | --- |
| `app-id` | `a1b2c3` | Id da aplicação que recebeu a versão. |
| `online` | `true` | `true` se a aplicação já respondia no ar ao fim do commit; `false` se ainda estava reiniciando. |
| `env-added` | `2` | Variáveis novas que o `.env` do pacote adicionou. |
| `restarted` | `false` | `true` se a Action fez o reinício extra. |
| `package-size` | `1843200` | Tamanho do `.zip` enviado, em bytes. |
| `files` | `37` | Quantos arquivos foram no pacote. |
| `dashboard-url` | `https://rtcloud.com.br/dashboard/apps/a1b2c3` | Link da aplicação no painel. |
| `message` | `Commit aplicado e aplicação no ar.` | Mensagem final: a do servidor em sucesso, o motivo em falha. |

Para usar uma saída num passo seguinte, passe por `env:` em vez de escrever `${{ }}` dentro do script:

```yaml
      - name: Avisar
        env:
          PAINEL: ${{ steps.rtcloud.outputs.dashboard-url }}
        run: |
          echo "Nova versão: $PAINEL"
```

---

## O que vai no pacote

A Action monta o `.zip` a partir da pasta `path`:

- **Se houver `.rtcloudignore` na raiz**, valem só as regras dele, e o `.gitignore` é deixado de lado. É assim que você manda o que o build do CI gerou (`dist/`, `.next/`, `build/`) mesmo com essas pastas no `.gitignore`. É a mesma ideia do `.npmignore` no npm.
- **Sem `.rtcloudignore`**, valem os `.gitignore` do projeto, o da raiz e os das subpastas, cada um relativo à própria pasta, como no Git.
- **Sempre ficam de fora** `.git/`, `node_modules/` (a RTCloud instala as dependências no servidor), `.DS_Store`, `Thumbs.db` e `desktop.ini`.
- **Nunca são ignorados** o `package.json`, o `requirements.txt` e o `pyproject.toml` da raiz. Sem eles a aplicação não sobe, e o painel faz a mesma coisa.
- **Links simbólicos não são seguidos.** Um link para fora do projeto levaria arquivos do runner junto. Eles aparecem como aviso no job.
- **O limite é de 100 MB por envio.** Se passar, a Action para antes de enviar e lista os maiores arquivos.

A sintaxe do `.rtcloudignore` é a do `.gitignore`. Comentário só vale no começo da linha:

```gitignore
# .rtcloudignore
.env.local
*.log
coverage/
tests/
!tests/fixtures/essencial.json
```

O log do job lista cada arquivo que entrou (até 300), e o resumo mostra os maiores.

### E o `.env`?

Se o `.env` estiver no pacote, a RTCloud adiciona **só as variáveis que ainda não existem** na aplicação, sem trocar as que já estão lá. Normalmente o `.env` fica no `.gitignore` e não existe no CI. Para segredos, prefira cadastrá-los no painel, na aba Variáveis da aplicação.

### Projeto com build

```yaml
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: RTPySystems/rtcloud-deploy@v1
        with:
          api-key: ${{ secrets.RTCLOUD_API_KEY }}
          app-id: ${{ vars.RTCLOUD_APP_ID }}
```

Lembre do `.rtcloudignore` se o `dist/` estiver no `.gitignore`. O modelo completo está em [`exemplos/deploy-com-build.yml`](exemplos/deploy-com-build.yml).

### Monorepo

```yaml
      - uses: RTPySystems/rtcloud-deploy@v1
        with:
          api-key: ${{ secrets.RTCLOUD_API_KEY }}
          app-id: meu-bot
          path: apps/bot
```

Para publicar só quando a pasta mudar, use `on.push.paths: ['apps/bot/**']`.

---

## Reinício

O commit **já reinicia** a aplicação. As variáveis novas que vieram do `.env` do pacote entram depois desse reinício, então só passam a valer no próximo. Por isso:

| `restart` | Comportamento |
| --- | --- |
| `auto` (padrão) | Reinicia de novo **só se** o `.env` trouxe variáveis novas. |
| `true` | Reinicia de novo sempre. Se esse reinício falhar, o passo falha, mas a versão já foi publicada. |
| `false` | Nunca faz o reinício extra. |

---

## O que a Action resolve sozinha

| Situação | O que acontece |
| --- | --- |
| A RTCloud está publicando uma atualização (503 "em atualização") | Espera o tempo indicado e tenta de novo, por até 20 minutos. As aplicações seguem no ar. |
| Já existe um commit em andamento na aplicação (409) | Espera 20 s e tenta de novo, por até 5 minutos. |
| Limite de chamadas curto (429 de até 5 min) | Espera e tenta de novo. Acima disso, falha com a explicação. |
| A plataforma não respondeu (500, 502, 503, 504) | Até 3 novas tentativas, com 15, 30 e 45 s de intervalo. |
| A conexão caiu | Até 3 novas tentativas. |
| Chave errada, aplicação inexistente, pacote recusado | Falha na hora, com o motivo e o que fazer. |

O commit pode levar alguns minutos do lado do servidor (preparo, envio e reinício). A Action espera até 12 minutos pela resposta.

## O resumo do job

Na página do run, a Action deixa um quadro com:

- a aplicação e a situação (🟢 no ar ou 🟡 reiniciando);
- o endereço do site, quando houver;
- o pacote (tamanho, número de arquivos e quais regras de ignorar valeram);
- as variáveis novas e se houve reinício extra;
- o commit do Git e a branch;
- o tempo total;
- um link para a aplicação no painel e a lista dos maiores arquivos.

Em falha, o quadro mostra **o que aconteceu**, **como resolver** e em que etapa parou.

---

## Erros comuns

| Mensagem | O que fazer |
| --- | --- |
| `A entrada "api-key" é obrigatória` | O secret não existe neste repositório, ou o workflow roda num fork (secrets não passam para PRs de fork). |
| `Essa chave começa com rtm_` | É a chave do MCP. Gere uma chave de API (`rtc_`). |
| `Chave da API inválida ou revogada (HTTP 401)` | Gere outra chave e atualize o secret. |
| `Esta chave é só de leitura (HTTP 403)` | Gere uma chave com acesso total. |
| `Aplicação não encontrada (HTTP 404)` | Confira o `app-id`. A chave precisa ser da conta dona ou de alguém da equipe da aplicação. |
| `ZIP sem o arquivo principal (HTTP 400)` | O arquivo principal configurado na aplicação não entrou no pacote. Confira o `path`, o build e as regras de ignorar. |
| `O pacote passou do limite de 100 MB` | Ponha mídia, bancos e builds antigos no `.rtcloudignore`. |
| `Muitas chamadas. Tente de novo em … s (HTTP 429)` | São 6 commits a cada 10 minutos por chave. Use `concurrency` no workflow. |

## Deploy automático pelo GitHub × esta Action

O painel também tem o **Deploy automático pelo GitHub** (aba Commit da aplicação), que publica a cada push sem workflow nenhum. **Use um ou outro.** Com os dois ligados, cada push publica duas vezes. Se a aplicação estiver com o automático ligado, a Action avisa no job.

A Action é a escolha certa quando você quer rodar testes ou build antes de publicar, publicar só de certas pastas ou branches, ou usar uma organização em que o webhook não pode ser criado.

## Segurança

- A chave vai só no cabeçalho `Authorization`, por HTTPS, e é escondida (`***`) em todo o log do job.
- A Action só precisa de `permissions: contents: read`.
- Links simbólicos não entram no pacote, e nomes de arquivo nunca viram comandos do runner.
- Para travar a versão exata, use o SHA do commit em vez da tag: `uses: RTPySystems/rtcloud-deploy@<sha-de-40-caracteres>  # v1.0.0`.
- Se a chave vazar, revogue no painel. A próxima chamada com ela já recebe 401.

## Limites

- 100 MB por pacote (depois de tirar `node_modules` e `.git`).
- 6 commits a cada 10 minutos por chave, um por vez por aplicação.
- O plano precisa estar ativo. Teste grátis expirado recusa o commit.

---

## Desenvolvimento

Para mexer na própria Action:

```bash
npm ci
npm test          # testes com um servidor falso da API (node:test, sem dependência extra)
npm run build     # gera dist/index.js com o ncc — o dist/ vai commitado
```

- O código fica em `src/`. O `dist/` é gerado e é o que o GitHub executa.
- Roda em Node 24 (`runs.using: node24`). O código também funciona em Node 20.
- Dependências fixadas na versão exata: `fflate` (zip) e `ignore` (regras do `.gitignore`), e `@vercel/ncc` só no build.
- O passo a passo para publicar no Marketplace está em [PUBLICAR.md](PUBLICAR.md).

## Licença

[MIT](LICENSE)
