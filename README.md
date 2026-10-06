# Gestão Financeira — integração contábil e conciliação bancária

Substitui a planilha mensal de lançamentos (`Setembro_v19-CORRETA.xlsm`) usada
para integrar a movimentação bancária do cliente ao **SCI Único**.

## O que resolve

Todo mês, cada movimentação de cada conta bancária do cliente precisa ser
classificada (categoria, unidade/filial, natureza do gasto, fornecedor ou
cliente) e virar lançamento contábil no SCI Único. Na planilha isso é feito com
macros VBA (versão de referência: v30). O sistema faz o mesmo fluxo:

1. **Importar a planilha do mês** (Master → *Importar planilha do mês*): lê a
   pasta de trabalho inteira e reconhece sozinho as contas bancárias (abas
   terminadas em "Conta <número>", que vira a conta contábil), Pagamento em
   dinheiro, Juros recebidos e os cadastros (clientes, fornecedores, plano de
   contas, tabelas). As abas de unidade e o Master da planilha são ignorados:
   o sistema gera essas informações. Antes de importar, mostra o que vai entrar
   e os problemas encontrados (ex.: unidade repetida na Tabela de unidades).
2. **Conferir e ajustar** os lançamentos nas contas. O que falta classificar
   aparece como *Pendente*.
3. **Master**: classificados e pendentes por unidade e por banco, e os botões
   *Distribuir por unidade*, *Gerar TXTs (formato atual)* e *Gerar TXTs (SCI Único)*.
4. **Conciliação** do extrato do banco (`.xlsx`, `.csv` ou `.txt` do Sicoob).

### Importar extratos do banco

No Master (ou na tela de uma conta), *Importar extratos do banco* aceita vários
arquivos de uma vez: **PDF**, **OFX**, **TXT do Sicoob**, CSV ou planilha.

- A conta é reconhecida pelo número que vem no extrato. Se nenhuma ou mais de
  uma conta bater, a pessoa escolhe.
- Cada lançamento vai para o mês da sua data. Importar o mesmo extrato de novo
  não duplica nada (no OFX, pelo código único de cada lançamento).
- Categoria, unidade, natureza e conta são **sugeridas** pelo que já foi
  classificado antes (primeiro pelo CPF/CNPJ, depois pelo nome, por último
  pelo histórico, só quando ele é sempre classificado igual). Sugestões ficam
  marcadas até alguém confirmar, e o sistema avisa ao gerar o TXT.
- **Conferência de saldos (PDF):** para cada dia, saldo anterior + lançamentos
  lidos = saldo informado pelo banco. Se fechar, nada ficou de fora.

PDFs testados (saldos conferidos em 100% dos dias): Banco do Brasil, Caixa,
Itaú, Santander, Sicoob, Sicredi, Unicred, Ailos (Acentra), Banrisul, Inter,
Nubank e C6. PDF que é imagem (digitalizado, como o do Bradesco enviado) não
tem texto: nesse caso, use o OFX do banco.

### Conciliação

Dois modos, no topo da tela:

- **Conta do sistema** — o extrato (PDF, OFX, TXT, CSV ou planilha) é cruzado com os
  lançamentos da conta, nos meses que o extrato cobre. A conta é reconhecida pelo número.
- **Extrato × planilha** — avulso, sem conta cadastrada e sem gravar nada: cruza o extrato
  com uma planilha de contas pagas a fornecedores (ou recebidas de clientes). As colunas são
  reconhecidas pelo nome (data de pagamento, valor pago, NF, fornecedor, CNPJ) e mostradas na
  tela. Valores iguais no mesmo período são desempatados pelo CNPJ ou pelo nome do
  fornecedor no histórico do banco.

Nos dois: tolerância de data, filtro, **Exportar resultado** (CSV) e **Limpar**.

**XMLs das NF-e** (soltos ou em .zip, como vêm da SIEG) também servem no lugar da planilha:
cada parcela da nota (cobr/dup) vira um título pelo vencimento; nota sem parcela vira um título
com o valor total. Compras para "pagamentos", vendas para "recebimentos"; a empresa é o CNPJ
que mais aparece nas notas. Notas canceladas saem se o XML do evento vier junto. Parcelas que
vencem depois do extrato ficam fora ("a vencer"). Pagamento antecipado ou atrasado casa até
30 dias, desde que o CNPJ ou o nome do fornecedor esteja no histórico do banco.

**Balancete de fornecedores do Único** (Saldo anterior / Débito / Crédito / Saldo atual por
fornecedor) também é aceito no Extrato × planilha: o sistema reconhece o formato e confere por
**total pago a cada fornecedor** (soma das saídas do extrato × Débito do balancete). O pagamento
é ligado ao fornecedor pela raiz do CNPJ (MEI) ou pelo nome, mesmo cortado e abreviado pelo
banco ("DELUPO COM DE F"). O que não for reconhecido a pessoa liga uma vez (ou marca "não é
fornecedor"); a escolha fica salva pelo CNPJ e vale nos meses seguintes. Aceita vários extratos
juntos e avisa quando o período do balancete não é o mesmo dos extratos.

**Conciliação manual** — o que ficou pendente mas está certo: marque as caixinhas e
- *Conciliar selecionados*: junta um ou mais itens do banco com um ou mais da planilha/sistema
  (ex.: um débito que pagou vários boletos). Se as somas não batem, pede o motivo;
- *Marcar como conferido*: item sem par que está certo (ex.: tarifa), com observação.

Cada um tem *Desfazer*. No modo por conta ficam salvos junto com a conta.

**Conciliações externas salvas** (modo Extrato × planilha):
- a conciliação em andamento é gravada sozinha a cada mudança: se a página fechar, ela volta;
- *Salvar conciliação* guarda com nome (ex.: "Fan Metal – Julho de 2026"); a lista
  *Conciliações salvas* reabre ou exclui;
- tudo entra no backup do Master. *Limpar* avisa se houver trabalho à mão não salvo.

### Competência (mês)

Cada mês tem os seus lançamentos, escolhido no seletor *Competência* do topo.
Os cadastros e as contas bancárias valem para todos os meses. Ao importar a
planilha, o mês é sugerido pelas datas dos lançamentos.

### Backup

Os dados ficam no navegador. *Baixar backup* (no Master) gera um arquivo `.json`
com tudo — todos os meses, cadastros e configurações. Guarde numa pasta da rede
ou no Drive. *Restaurar backup* substitui os dados do navegador pelos do arquivo
(serve também para levar os dados para outro computador).

### Regras contábeis

Iguais às da macro v30 e conferidas linha a linha com os TXTs de agosto/2026
(4.510 de 4.510 linhas idênticas). O HP pela natureza vale para qualquer categoria.

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
| `js/importacao.js` | Leitura da planilha inteira: reconhece as abas, a competência e os problemas. |
| `js/extratos.js` | OFX, TXT do Sicoob e CSV; conta do extrato, sem duplicar, sugestão de classificação. |
| `js/pdfextrato.js` | Extratos em PDF (texto com posição, via pdf.js) e conferência de saldos. |
| `js/conciliacao.js` | Conciliação avulsa: planilha de fornecedores/clientes × extrato. |
| `js/nfe.js` | Leitura dos XMLs de NF-e (parcelas, cancelamentos) para a conciliação. |
| `js/storage.js` | Armazenamento em IndexedDB e migração dos formatos antigos. |
| `js/app.js` | Tela. |
| `tests/` | Testes automatizados e um extrato Sicoob fictício. |

## Testes

Requer Node.js 18 ou mais novo, sem dependências:

```
npm test
```

**Nunca** coloque extratos, planilhas ou cadastros reais no repositório. Use dados fictícios.
