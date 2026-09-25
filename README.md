# Gestão Financeira — lançamentos e conciliação bancária

Substitui a planilha mensal `.xlsm` de lançamentos usada no atendimento ao
cliente (uma aba por conta bancária, por filial e por tipo de movimento).

## O problema que resolve

Todo mês, cada movimentação de cada conta bancária do cliente precisa ser
**classificada** (categoria, unidade/filial, fornecedor ou cliente, CPF/CNPJ)
para entrar na contabilidade. Depois, é preciso **conferir** se o que foi
lançado bate com o extrato do banco: nada faltando, nada sobrando.

Fazer essa conferência na planilha é manual e lento — um único extrato do
Sicoob chega a 1.600 movimentações no mês. O sistema:

1. Guarda os lançamentos classificados por conta (digitados ou importados da planilha).
2. Lê o extrato do banco (`.xlsx`, `.csv` ou o `.txt` do Sicoob, incluindo nome
   e CPF/CNPJ de quem pagou ou recebeu no Pix).
3. Cruza os dois e aponta, linha a linha:
   - **OK** — mesmo valor, sinal (C/D) e data;
   - **Data diferente** — mesmo valor e sinal, data próxima (tolerância ajustável);
   - **Só no banco** — o banco mostra, ninguém lançou;
   - **Só no sistema** — foi lançado, o banco não mostra.
4. Mostra a diferença de saldo e se a conciliação do mês está fechada.

## Como usar

Abra o `index.html` no navegador (ou pelo GitHub Pages). Os dados ficam só no
`localStorage` daquele navegador — nada é enviado a servidor. Para levar os
lançamentos para outro lugar, use **Exportar CSV** ou **Copiar (colar no Excel)**.

## Estrutura

| Arquivo | Papel |
|---|---|
| `js/core.js` | Regras de negócio puras: valores, datas, leitura de extratos, conciliação, exportação. Sem DOM. |
| `js/app.js` | Tela: menu, formulários, tabelas, localStorage. Usa o `core.js`. |
| `tests/` | Testes automatizados do `core.js` e um extrato Sicoob fictício. |

## Testes

Requer Node.js 18 ou mais novo. Não há dependências para instalar.

```
npm test
```

**Nunca** coloque extratos, planilhas ou cadastros reais em `tests/fixtures/`
nem em qualquer pasta do repositório. Use dados fictícios.
