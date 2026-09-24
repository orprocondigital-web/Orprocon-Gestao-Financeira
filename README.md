# Lançamentos — Agosto

Ferramenta web para lançar, editar e importar os lançamentos bancários mensais
(Sicredi, Banrisul, CAIXA, SICOOB, SANTANDER), no mesmo padrão da planilha
`.xlsm` usada no projeto Celesp / TI - Netdata.

- Lançamento manual por conta, com os mesmos dropdowns de Categoria e Unidade
  da planilha.
- Importação direta de um arquivo `.xlsx`/`.xlsm` (lida no navegador, nada é
  enviado para nenhum servidor).
- Exportação em CSV ou cópia formatada para colar direto no Excel.
- Os lançamentos ficam salvos no `localStorage` do navegador — por conta, por
  dispositivo. Não há sincronização entre dispositivos nesta versão.

## Publicar no GitHub Pages

1. Crie um repositório novo no GitHub (pode ser privado ou público — o
   GitHub Pages funciona nos dois casos; em repositório privado, o Pages fica
   restrito a quem tem acesso ao repo se a conta for Pro/Team/Enterprise, ou
   público em conta free).
2. Suba este arquivo `index.html` para a raiz do repositório (branch `main`).
3. No repositório: **Settings → Pages → Build and deployment → Source**:
   escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`. Salve.
4. Em alguns minutos o link fica disponível em
   `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Aviso sobre dados

A página em si não contém nenhum lançamento — eles só existem no navegador
de quem preenche o formulário ou importa um arquivo. Publicar o repositório
no GitHub Pages deixa a *ferramenta* acessível publicamente pelo link, mas
os dados lançados continuam privados a cada navegador/dispositivo, a menos
que a pessoa exporte e compartilhe o CSV manualmente.
