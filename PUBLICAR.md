# Publicar a Action no Marketplace do GitHub

Passo a passo para colocar a **RTCloud Deploy** no ar em `github.com/marketplace`. Nada disto foi feito ainda: o repositório não existe, nenhuma tag foi criada e nada foi publicado.

Dono escolhido: a conta pessoal **RTPySystems**. O cliente usa:

```yaml
uses: RTPySystems/rtcloud-deploy@v1
```

Situação conferida em 19/11/2026:

- O nome **RTCloud Deploy** está livre no Marketplace e não bate com nenhuma conta do GitHub. O Marketplace exige as duas coisas.
- O repositório `RTPySystems/rtcloud-deploy` ainda não existe, então o nome está livre.
- O README, os exemplos e os comandos abaixo já usam `RTPySystems/rtcloud-deploy`.

---

## 0. Antes de começar

- Estar logado no GitHub como **RTPySystems**.
- Verificação em duas etapas (2FA) ligada na conta. O GitHub pede isso para publicar no Marketplace.
- Node 24 e Git instalados na máquina.

> Se um dia a Action for para a organização `rtcloud-br`, use **Settings → Transfer ownership**. O GitHub redireciona `RTPySystems/rtcloud-deploy` para o endereço novo, então os workflows dos clientes continuam funcionando. Mesmo assim, atualize o README.

## 1. Conferir o dono nos arquivos

Este comando não deve listar nada. Se listar, sobrou um marcador antigo:

```powershell
Select-String -Path README.md, exemplos\*.yml -Pattern "DONO/", "rtcloud-oficial"
```

## 2. Conferir tudo localmente

```powershell
npm ci
```

```powershell
npm run all
```

`npm run all` gera o `dist/` de novo e roda os 44 testes. No Windows, 2 testes são pulados (link simbólico e bit de execução) e rodam no CI em Linux.

## 3. Criar o repositório público

Pelo site: **New repository** → nome `rtcloud-deploy` → **Public** → sem README, sem .gitignore e sem licença (já estão na pasta).

Ou com o GitHub CLI:

```powershell
gh repo create RTPySystems/rtcloud-deploy --public --description "Deploy na RTCloud a cada push, pela API pública."
```

## 4. Enviar o código

O `dist/` **vai** para o repositório: é ele que o GitHub executa. O `node_modules/` não vai, e o `.gitignore` já cuida disso.

```powershell
git init -b main
```

```powershell
git add .
```

```powershell
git commit -m "RTCloud Deploy v1.0.0"
```

```powershell
git remote add origin https://github.com/RTPySystems/rtcloud-deploy.git
```

```powershell
git push -u origin main
```

Em **Actions**, espere o workflow **Testes** ficar verde em Ubuntu e Windows. Ele também confere se o `dist/` commitado é o mesmo que o `src/` gera.

## 5. Testar contra a RTCloud de verdade (antes de publicar)

Os testes automáticos usam um servidor falso da API. Antes de abrir para clientes, faça um deploy real:

1. No painel, crie uma aplicação de teste (um bot simples basta) e uma chave de API com acesso total.
2. Num repositório de teste, crie o secret `RTCLOUD_API_KEY` e um workflow com `uses: RTPySystems/rtcloud-deploy@main` e `app-id` da aplicação de teste. O modelo está em `exemplos/deploy-rtcloud.yml`.
3. Rode o workflow e confira:
   - o resumo do job (✅, situação, pacote, link do painel);
   - o histórico de publicações da aplicação no painel (deve aparecer o commit feito pela API);
   - que a chave aparece como `***` no log;
   - um erro de propósito (`app-id: nao-existe`), que deve dar ❌ com a dica no resumo.
4. Revogue a chave de teste ao terminar.

## 6. Criar a versão

Use duas tags: a exata (`v1.0.0`), que nunca muda, e a móvel (`v1`), que os clientes usam e que você move a cada correção compatível.

```powershell
git tag -a v1.0.0 -m "RTCloud Deploy v1.0.0"
```

```powershell
git push origin v1.0.0
```

```powershell
git tag -f v1 v1.0.0
```

```powershell
git push -f origin v1
```

## 7. Publicar no Marketplace

1. No repositório, abra o `action.yml`. O GitHub mostra a faixa **"Publish this Action to the GitHub Marketplace"**. Clique em **Draft a release**, ou vá em **Releases → Draft a new release**.
2. Marque **Publish this Action to the GitHub Marketplace**.
3. Na primeira vez, aceite o **GitHub Marketplace Developer Agreement**.
4. O GitHub confere o `action.yml` (nome, descrição, ícone e cor). Tudo deve aparecer verde, porque o `action.yml` já tem `name`, `description` e `branding` (ícone `upload-cloud`, cor `red`).
5. **Primary category:** Deployment. **Another category:** Continuous integration.
6. **Choose a tag:** `v1.0.0`. **Release title:** `v1.0.0`.
7. Notas da versão (pode colar):

   ```markdown
   Primeira versão da Action oficial da RTCloud.

   - Monta o .zip do projeto respeitando o .rtcloudignore (ou o .gitignore)
   - Publica pelo Commit da API pública v1
   - Reinicia de novo quando o .env traz variáveis novas (restart: auto | true | false)
   - Espera sozinha durante atualizações da RTCloud, commit em andamento e limite curto
   - Resumo do job com situação, pacote, tempo e link para o painel
   ```

8. **Publish release.** A página fica em `https://github.com/marketplace/actions/rtcloud-deploy`.

> Versões antigas da documentação do GitHub diziam que o repositório publicado não podia ter arquivos de workflow. A documentação atual pede só um `action.yml` na raiz de um repositório público. Se a tela de publicação reclamar de `.github/workflows/testes.yml`, apague esse arquivo, faça um commit, crie a tag de novo e tente outra vez.

## 8. Depois de publicar

- Na documentação do painel (`/docs/referencia-api`, seção "GitHub Actions"), o exemplo ainda usa `zip` + `curl`. Vale trocar pelo `uses: RTPySystems/rtcloud-deploy@v1`. É uma mudança no painel, para uma entrega separada.
- Guarde a página do Marketplace no README do site, se quiser divulgar.
- Considere ligar, em **Settings → Rules → Rulesets**, uma regra de tag que impeça apagar ou mover `v1.0.0` (as tags `v1.x.y` não devem mudar nunca).

## 9. Versões seguintes

1. Mexa em `src/`, rode `npm run all` e commite `src/` **e** `dist/` juntos.
2. Suba a versão no `package.json` (`1.0.1` para correção, `1.1.0` para novidade compatível).
3. Crie a tag exata e mova a `v1`:

   ```powershell
   git tag -a v1.0.1 -m "v1.0.1"
   ```

   ```powershell
   git push origin v1.0.1
   ```

   ```powershell
   git tag -f v1 v1.0.1
   ```

   ```powershell
   git push -f origin v1
   ```

4. Crie a release da `v1.0.1`, com a caixa do Marketplace marcada.
5. Mudança que quebra quem já usa (entrada renomeada, comportamento novo por padrão) vira `v2.0.0` e uma tag `v2` nova. Nunca mova a `v1` para ela.

## Dependências

| Pacote | Versão fixada | Para quê | Publicada em |
| --- | --- | --- | --- |
| `fflate` | 0.8.3 | escrever o .zip | 16/05/2026 |
| `ignore` | 7.0.14 | regras do `.gitignore` / `.rtcloudignore` | 23/10/2026 |
| `@vercel/ncc` | 0.45.0 (só no build) | juntar tudo em `dist/index.js` | 13/08/2026 |

Nenhuma tem script de instalação, e o `.npmrc` desliga scripts (`ignore-scripts=true`). A `ignore@7.0.16` saiu em 17/11/2026 e ficou de fora de propósito: a regra é usar versões com pelo menos duas semanas. Para atualizar, troque a versão no `package.json`, rode `npm install`, `npm run all` e confira o `npm audit`.
