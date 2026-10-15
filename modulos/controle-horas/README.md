# Controle de horas

Módulo do DP dentro da Gestão Financeira (menu **Visão geral → Controle de horas**).
Serve para os **clientes que não têm cartão ponto**: o funcionário anota os horários à mão,
o cliente passa para a planilha padrão e devolve; o DP importa, confere e fecha o mês.

A folha em papel assinada continua sendo o documento do cliente; este módulo é a conferência e o cálculo.

## Fluxo do mês

1. **Empresa**: cadastre o cliente. Cadastrar os funcionários é opcional.
2. **Gerar planilha para o cliente**: sai um `.xlsx` com uma aba por funcionário. Sem cadastro,
   escolha quantas abas em branco mandar: o cliente escreve o nome de cada funcionário no alto da
   aba (campo amarelo). Com cadastro, as abas já vêm com os nomes, e dá para mandar algumas em branco
   a mais para funcionário novo. Sobrou aba: fica em branco e é ignorada. Faltou: o cliente copia
   uma aba (explicado na planilha). Sem macros, abre em qualquer Excel.
3. **Importar planilha preenchida**: o sistema liga cada aba ao funcionário (pela marca escondida
   na aba e, se não tiver, pelo nome). Funcionário que não existe é cadastrado com a carga padrão.
   Aba em branco é ignorada e não apaga nada. Assim o cadastro de funcionários se monta sozinho na
   primeira importação; depois é só conferir a carga de cada um.
4. **Conferir**: cada folha mostra trabalhado, extras por faixa (%), atrasos, noturno e alertas
   (intervalo curto, mais de 2h extras no dia, interjornada menor que 11h, horário faltando…).
   Dá para corrigir direto na tabela (Enter desce para o dia seguinte) e **Marcar como revisada**.
5. **Fechar mês**: congela as regras e os feriados usados. **Exportar resumo (Excel)** gera as abas
   *Resumo* e *Dia a dia*.

## Regras de cálculo (por empresa)

Nada fica fixo no código. Em **Regras de cálculo** a empresa tem:

- tolerância por dia (padrão 10 min, CLT);
- hora extra por dia da semana, domingo e feriado: as primeiras N horas a X% e as demais a Y%;
- adicional noturno (início, fim, % e hora reduzida de 52min30s);
- intervalo mínimo, limite de extras por dia e interjornada (só geram alertas);
- descontar ou não os atrasos das horas extras do mês.

Em **Feriados**: nacionais do ano com um clique, mais os estaduais/municipais da empresa.

## Arquivos

| Arquivo | O que tem |
|---|---|
| `js/regras.js` | Cálculo (dia e mês), feriados nacionais, conversão de horários. Sem tela. |
| `js/planilha.js` | Gera a planilha do cliente (ExcelJS) e lê a devolvida (SheetJS). |
| `js/dados.js` | Empresas, funcionários, meses, importação, fechamento, resumo. |
| `js/app.js` | Telas. |

Dados no navegador, chave `horas:v1` (vão no backup do sistema). As bibliotecas de planilha
são baixadas só na hora de gerar, importar ou exportar.

Testes: `npm test` na raiz (`tests/horas.test.js`). Os de planilha rodam se `exceljs` e `xlsx`
estiverem instalados (ou com `HORAS_LIBS` apontando para um `node_modules` que tenha os dois).
