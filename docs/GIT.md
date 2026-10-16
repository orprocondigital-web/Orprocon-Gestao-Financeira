# Fluxo do Git

Três tipos de branch. O deploy é automático, então **o que entra na `main` vai para a Orprocon**.

| Branch | Para que serve | Onde publica |
|---|---|---|
| `main` | produção: o que o escritório usa | GitHub Pages (e a API de produção no Render) |
| `develop` | homologação: onde se testa antes | ambiente de teste (Supabase e Render de teste, quando existirem) |
| `feat/nome-curto` | uma mudança por vez | — |

Também valem `fix/nome-curto` (correção) e `docs/nome-curto` (só documentação).

## Uma mudança, do começo ao fim

```
git switch develop
git pull
git switch -c feat/inicio-capa
```

Extraia o zip por cima da pasta (ou edite os arquivos) e:

```
git add -A
git commit -m "Início em forma de capa (v0.20.0)"
git push -u origin feat/inicio-capa
```

1. No GitHub aparece **Compare & pull request**: abra o PR **para a `develop`**.
2. Os **testes rodam sozinhos** no PR (aba *Checks*). Só faça o merge com tudo verde.
3. **Merge** (botão *Squash and merge*: a mudança vira um commit só na `develop`) e apague a branch.
4. Teste na homologação.
5. Pronto para o escritório: abra um PR **da `develop` para a `main`** e faça o merge.
6. Marque a versão:
   ```
   git switch main
   git pull
   git tag v0.20.1
   git push origin v0.20.1
   ```

Depois, no computador: `git switch develop` e `git pull` antes de começar a próxima.

## Correção urgente na produção

Algo quebrado no ar e a `develop` tem coisas ainda não testadas:

```
git switch main
git pull
git switch -c fix/descricao-curta
```

Corrija, abra o PR **para a `main`**, faça o merge e depois traga a correção para a `develop`:

```
git switch develop
git pull
git merge main
git push
```

## Regras

- Na `main` e na `develop` não se faz push direto: só por Pull Request (o GitHub bloqueia; veja abaixo).
- Uma branch por assunto, e de vida curta (dias, não semanas).
- Mensagem de commit diz o que muda para quem usa, e a versão quando houver.
- A versão do front sobe em `index.html`, `login.html`, `sw.js` e `package.json` (o teste confere).
- Nunca entram no Git: senhas, `.env`, planilhas e XMLs de clientes (o `.gitignore` já barra os mais comuns).

## Configuração única no GitHub (feita uma vez)

1. **Criar a `develop`** a partir da `main`:
   ```
   git switch main
   git pull
   git switch -c develop
   git push -u origin develop
   ```
2. **Proteger a `main` e a `develop`**: *Settings → Branches → Add branch ruleset* (ou *Add rule*):
   - nome/padrão: `main` (depois repita para `develop`);
   - marque **Require a pull request before merging** (aprovações: 0, porque é uma pessoa só);
   - marque **Require status checks to pass** e escolha **testes** (aparece depois do primeiro PR com os testes rodando);
   - marque **Block force pushes**.
3. **Merge**: *Settings → General → Pull Requests*: deixe **Allow squash merging** e marque
   **Automatically delete head branches** (a branch some sozinha depois do merge).
4. **GitHub Pages**: *Settings → Pages* continua publicando a partir da **`main`**.
