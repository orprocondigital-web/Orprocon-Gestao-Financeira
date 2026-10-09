# Apuração parcial de ICMS

Ferramenta do departamento fiscal da **Orprocon** para acompanhar a apuração de ICMS de um cliente **durante o mês**, antes do fechamento.

**Acesse:** https://orprocondigital-web.github.io/apuracao-icms/

> Esta é uma **prévia** para acompanhamento. A escrituração e a apuração oficial continuam sendo feitas no **Único**.

---

## O que a ferramenta faz

A partir dos XMLs de NF-e e NFC-e de uma empresa, a ferramenta:

1. Separa as notas de **entrada** e de **saída**.
2. Agrupa os valores por **CFOP**.
3. Soma os **débitos** de ICMS (saídas) e os **créditos** (entradas).
4. Mostra o **saldo até a data escolhida**: ICMS a recolher ou saldo credor.
5. Exporta uma **planilha Excel** formatada para conferência.

## Privacidade dos dados

Os arquivos XML são lidos **somente no navegador de quem está usando**. Nenhuma nota é enviada para o GitHub, para a Orprocon ou para qualquer servidor.

- Este repositório contém apenas o código da página, sem dados de clientes.
- **Nunca** coloque XMLs, arquivos .zip ou planilhas exportadas nesta pasta. O arquivo `.gitignore` bloqueia esses formatos, mas o cuidado continua valendo.

## Como usar

1. Abra o link acima no Chrome ou no Edge.
2. Baixe os XMLs do cliente (pela SIEG ou pelo S@T da SEFAZ/SC) e arraste os arquivos, ou o .zip, para a área **"Notas fiscais"**.
3. Confira em **"Empresa apurada"** se o CNPJ é o do cliente. O sistema identifica sozinho, mas é possível trocar.
4. Ajuste o período. Para ver a posição parcial do mês, deixe **"De"** no dia 1º e altere só o **"Até"**.
5. Se necessário, preencha os **ajustes manuais** (veja abaixo).
6. Revise a tabela **por CFOP** e clique em **"Baixar planilha (.xlsx)"**.

Para conhecer a ferramenta sem usar dados reais, clique em **"Usar exemplo"**. Os dados de exemplo são fictícios.

## Como o cálculo funciona

### Entrada ou saída

| Situação | Classificação | Efeito |
|---|---|---|
| A empresa emitiu uma nota de saída (venda, devolução de compra) | Saída | Débito |
| A empresa emitiu uma nota de entrada (devolução de venda, importação) | Entrada | Crédito |
| Um fornecedor emitiu a nota para a empresa | Entrada | Crédito |

Notas em que a empresa não é emitente nem destinatária ficam fora da conta.

### CFOP das notas de fornecedores

No XML do fornecedor, o CFOP é o **dele** (ex.: 5102, venda). A ferramenta converte para o CFOP de **entrada equivalente**:

- 5xxx → 1xxx, 6xxx → 2xxx, 7xxx → 3xxx (ex.: 5102 → 1102)
- Compras com substituição tributária (5401, 5403, 5405) → 1403; interestaduais → 2403

A ferramenta **não sabe o destino da mercadoria**. Uma compra de material de escritório com CFOP 5102 é tratada como 1102 (revenda), quando o correto seria 1556 (uso e consumo, sem crédito). Esse é o principal ponto de diferença em relação ao Único.

### Valor de ICMS considerado

- **Saídas e entradas de fornecedores normais:** ICMS destacado no item (`vICMS`).
- **Entradas de fornecedores do Simples Nacional:** crédito informado na nota (`vCredICMSSN`).
- **ICMS-ST e DIFAL** não entram no saldo do ICMS próprio.

### Regras por CFOP

Cada CFOP tem uma chave **"Entra / Não entra"**. Por padrão, todos entram, exceto:

- **Entradas:** 1551/2551 (ativo imobilizado, que é creditado pelo CIAP), 1556/2556 (uso e consumo), 1403/2403 e similares (compras com ST).
- **Saídas:** 5929/6929, que registram vendas já emitidas em cupom ou NFC-e e duplicariam o débito.

As alterações ficam salvas **no navegador de quem alterou** e valem para todas as empresas. O botão **"Restaurar regras padrão"** desfaz as mudanças.

### Notas canceladas

Uma nota só sai da conta se o **XML do evento de cancelamento** também for carregado, ou se a própria nota vier marcada como cancelada. Confira se o download da SIEG inclui os eventos.

### Ajustes manuais

Para valores que não aparecem nas NF-e:

- **Saldo credor do mês anterior**
- **Outros créditos:** CIAP, ICMS de frete (CT-e), crédito presumido, TTD
- **Outros débitos e estornos de crédito**

Os ajustes ficam salvos no navegador, **por empresa e por mês**.

### Fórmula do saldo

```
Saldo = (débitos das saídas + outros débitos)
      − (créditos das entradas + outros créditos + saldo credor anterior)
```

- Resultado positivo: **ICMS a recolher**
- Resultado negativo: **saldo credor**

## Diferenças esperadas em relação ao Único

| Motivo | Explicação |
|---|---|
| Destino das compras | Compras para uso e consumo ou ativo podem vir com CFOP de revenda |
| Data | A ferramenta usa a data de **emissão**; o Único escritura entradas pela data de **entrada** |
| CT-e e benefícios fiscais | Frete, crédito presumido e TTD não estão nas NF-e e precisam ir nos ajustes |
| Cancelamentos | Sem o XML do evento, a nota cancelada continua na conta |

## A planilha exportada

| Aba | Conteúdo |
|---|---|
| **Resumo** | Empresa, período, débitos, créditos, ajustes e saldo final |
| **Por CFOP** | Totais por CFOP, separados em saídas e entradas, com indicação do que entra na apuração |
| **Notas** | Todas as notas do período, com filtros, valores e situação (canceladas aparecem riscadas) |

## Requisitos

- Navegador atualizado (Chrome ou Edge).
- Conexão com a internet, para carregar as bibliotecas que abrem o .zip e geram a planilha.

## Estrutura do projeto

```
apuracao-icms/
├── index.html          Estrutura da página
├── css/
│   └── style.css       Visual (cores, tema escuro, layout, impressão)
├── js/
│   ├── tema.js         Tema claro/escuro (carregado antes da página aparecer)
│   ├── utils.js        Formatação de valores, datas e armazenamento local
│   ├── estado.js       Dados em memória: notas, empresa, período, regras
│   ├── regras.js       Regras de CFOP e classificação entrada/saída
│   ├── leitor-xml.js   Leitura dos XMLs, eventos de cancelamento e .zip
│   ├── apuracao.js     Cálculo de débitos, créditos, saldo e ajustes
│   ├── interface.js    Desenho da tela: saldo, gráfico e tabelas
│   ├── exportar.js     Geração da planilha Excel formatada
│   ├── exemplo.js      Notas fictícias do botão "Usar exemplo"
│   └── app.js          Ligação dos botões e inicialização
├── .gitignore          Impede o envio de XML, .zip e planilhas
└── README.md
```

Os scripts são carregados no fim do `index.html` **nessa ordem**, porque cada arquivo usa funções dos anteriores. Ao criar um arquivo novo, inclua a tag `<script>` dele na posição certa.

## Manutenção (equipe de TI)

Para publicar uma nova versão:

```
git add .
git commit -m "Descrição da alteração"
git push
```

O GitHub Pages atualiza o site em um ou dois minutos. Se a versão antiga continuar aparecendo, atualize com **Ctrl+F5**.

O app funciona também abrindo o `index.html` direto do computador (dois cliques), útil para testar alterações antes de publicar.

Bibliotecas externas utilizadas:

- [JSZip](https://stuk.github.io/jszip/) para ler arquivos .zip
- [ExcelJS](https://github.com/exceljs/exceljs) para gerar a planilha formatada
