# Em Dia — fechamento do mês e diário dos setores

Módulo da Gestão Financeira para saber **o que cada pessoa fez no dia** e **em que pé está o
fechamento de cada cliente**, para que outra pessoa consiga continuar se alguém faltar.

## Telas

- **Meu dia** — minhas tarefas do mês (atrasadas, vencendo, em andamento) e o formulário
  *Registrar atividade*: o que fiz, **onde parei / próximo passo**, situação da etapa, tempo gasto.
- **Fechamento do mês** — quadro clientes × etapas (ou lista), com filtro por setor e responsável.
- **Diários dos setores** — um diário para cada setor: **Contábil**, **Fiscal** e **Pessoal (DP)**,
  além de *Todos*. Cada diário mostra os registros do dia, quem registrou, horas, as etapas do
  setor no mês e a equipe do setor (com quem está ausente). Filtros e exportação em CSV.
- **Passagem de bastão** — tudo o que está em aberto com uma pessoa, com o último "onde parei";
  o gestor marca e passa para outra pessoa (fica anotado no diário do setor).
- **Painel do gestor**, **Clientes**, **Etapas** e **Equipe** — só para administradores.

## Em qual diário cai cada registro

1. Na etapa do fechamento escolhida (ex.: *Apuração de ICMS* → Fiscal, *Folha* → Pessoal);
2. senão, no setor marcado no formulário;
3. senão, no setor da pessoa (definido em **Equipe**, ou pela própria pessoa no *Meu dia*).

## Dados

Nesta fase (só front) ficam no navegador, nas chaves `emDia:*`, e vão no backup do sistema.
Quem usa vem do login da Gestão Financeira (`gf.sessao`); administrador = gestor.
Regras em `js/dados.js` (testadas em `tests/emdia.test.js`), telas em `js/app.js`.
Os dados de exemplo usam apenas nomes fictícios.
