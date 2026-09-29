# Gestão Financeira — integração contábil e conciliação bancária

Substitui a planilha mensal de lançamentos (`Setembro_v19-CORRETA.xlsm`) usada
para integrar a movimentação bancária do cliente ao **SCI Único**.

## O que resolve

Todo mês, cada movimentação de cada conta bancária do cliente precisa ser
classificada (categoria, unidade/filial, natureza do gasto, fornecedor ou
cliente) e virar lançamento contábil no Único, com conta de débito, conta de
crédito e histórico padrão. Na planilha isso é feito com macros VBA. O sistema
reproduz o mesmo fluxo:

1. **Contas bancárias** — cada conta tem a sua conta contábil no Único (ex.: 643).
   Os lançamentos são digitados ou importados da aba da planilha.
2. **Classificação** — categoria, unidade, natureza e conta. O que falta
   classificar aparece como *Pendente*.
3. **Master** — acompanha classificados e pendentes por unidade e por banco e tem os três botões da planilha:
   - *Distribuir por unidade*: agrupa por filial, ordena (Despesa, Pagamento,
     Recebimento, Aplicações) e calcula débito, crédito e HP.
   - *Gerar TXTs (formato atual)*: um arquivo por unidade e categoria, separado por tabulação.
   - *Gerar TXTs (SCI Único)*: um arquivo por unidade no layout de importação do Único.
4. **Conciliação** — cruza o extrato do banco (`.xlsx`, `.csv` ou o `.txt` do
   Sicoob) com os lançamentos e aponta o que falta de cada lado.

### Regras contábeis

Conferidas linha a linha com os TXTs de agosto/2026 que foram importados no Único.

| Categoria | Débito | Crédito | HP |
|---|---|---|---|
| Recebimento | conta do banco | 18 (2284 se natureza = Juros Recebidos) | 3708 |
| Pagamento | 148 | conta do banco | 3026 |
| Despesa | coluna Conta (ou 148) | conta do banco | 3712 se natureza = Despesas Bancárias; 2020 se Transferência Banco; senão vazio |
| Aplicações | coluna Conta (ou 148) | conta do banco | — |
| Aplicações com natureza "resgate" | conta do banco | coluna Conta (ou 148) | — |
| Resgate | conta do banco | coluna Conta (ou 148) | — |

### Formato do TXT do SCI Único

Um arquivo por unidade (`UNICO_Matriz.txt`), importado na empresa da unidade (código SCI da Tabela de unidades).
UTF-8 **com BOM**, fim de linha CRLF, sem cabeçalho, 16 campos separados por vírgula:

```
000001,20260803,502,627,3.00,,"0 - PEDAGIO",DCTO0,DESPESA_Matriz,,,,,,,A
```

sequência (6 dígitos, reinicia por arquivo) · data AAAAMMDD · débito · crédito · valor com ponto ·
HP · complemento `"doc - nome"` · `DCTO` + documento · lote `CATEGORIA_Unidade` · CNPJ no débito
(Recebimento, Despesa, Aplicações) · CNPJ no crédito (Pagamento) · 4 campos vazios · `A`.

Documento vazio vira `0`; documento "9.393.740" vira "9393740"; espaços repetidos no nome viram um só.

### O que não vai para o Único

- **Pendências** (baixadas junto, em `PENDENCIAS_UNICO.csv`, com o motivo): sem conta de débito ou
  crédito, categoria sem regra (ex.: nome de unidade digitado na Categoria) e **valor digitado fora do
  padrão** ("2.29598C", "8,934,48C"). A planilha antiga gravava esses valores como 0,00 ou 100× maiores.
- **Depósito de cheque bloqueado** (valor com `*` no extrato do Sicoob): o dinheiro entra depois, na
  linha "LIBERAÇÃO DE DEPÓSITO".

## Onde ficam os dados

No **IndexedDB do navegador** de quem usa: nada vai para servidor. Cada
navegador e cada computador tem os seus dados. Limpar os dados de navegação
apaga tudo. Para uso compartilhado entre contadores será preciso um servidor.

## Estrutura

| Arquivo | Papel |
|---|---|
| `js/core.js` | Valores, datas, leitura de planilhas e extratos, conciliação, exportação. |
| `js/integracao.js` | Porte das macros VBA: coleta, contas contábeis, distribuição, TXTs, Master. |
| `js/storage.js` | Armazenamento em IndexedDB e migração dos formatos antigos. |
| `js/app.js` | Tela. |
| `tests/` | Testes automatizados e um extrato Sicoob fictício. |

## Testes

Requer Node.js 18 ou mais novo, sem dependências:

```
npm test
```

**Nunca** coloque extratos, planilhas ou cadastros reais no repositório. Use dados fictícios.
