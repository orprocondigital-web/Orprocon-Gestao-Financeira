# ISS Tubarão

Módulo do fiscal dentro da Gestão Financeira (menu **Módulos → ISS Tubarão**). Substitui o robô do
Prefeitura Moderna 2.0: em vez de o sistema entrar no Meu ISS, o fiscal exporta o XML e importa aqui.

## Fluxo do mês

1. No **Meu ISS** de Tubarão (acesso do escritório), para cada empresa: **Acessar Movimento Econômico →
   Períodos → Exportar XML** → mês inicial e final iguais, lançamentos **Todos** → **Gerar Arquivo**.
2. Aqui: arraste todos os XML de uma vez (ou **Importar XML**). Cada arquivo vira uma empresa, no mês
   das notas. Importar de novo a mesma empresa no mesmo mês substitui.
3. Abra cada empresa, confira (filtros: ISS retido, retenção federal, alertas) e **Marque como conferida**.
4. **Exportar Excel**: abas Resumo, Todas as notas, Retenção federal e Alertas.

## Regras (as mesmas do robô antigo)

- Nota cancelada (`situacao` C/CANCELADA) fica de fora.
- **ISS retido** = `valor_iss` das notas com `tipo_nota` = TOMADOR.
- **Retenção federal** = IR, PIS, COFINS, CSLL ou INSS > 0. **Total retido** = ISS retido + federais.
- **Alertas**: alíquota de ISS fora de 2% a 5%, base maior que a nota, líquido ≠ valor − retenções, nota tomada sem ISS.

## Ainda a confirmar com um XML real

O leitor (`js/leitor.js`) foi montado pelo modelo que o robô lia e é tolerante: aceita `1234.56` e
`1.234,56`, datas `AAAA-MM-DD` e `DD/MM/AAAA`, UTF-8 e ISO-8859-1. Tipo de nota que não seja
TOMADOR/PRESTADOR, número ambíguo (ex.: `1.500`) ou data não reconhecida aparecem como aviso na empresa.
Com o primeiro arquivo real, conferir: os valores de `tipo_nota`, o formato dos números e das datas.

Dados no navegador, chave `iss:v1` (vão no backup do sistema). Testes: `tests/iss.test.js`.
