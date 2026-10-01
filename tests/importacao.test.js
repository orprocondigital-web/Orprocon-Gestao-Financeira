const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const Imp = require("../js/importacao.js");

const CAB_BANCO = ["Data", "Doc.", "Descrição/Histórico", "Valor", "Saldo", "Modelo DOC", "Nome do Fornecedor/Cliente",
  "CPF/CNPJ", "Categoria", "Unidade", "Natureza do gasto", "Conta"];
const lin = (data, desc, valor, cat, uni, extra = {}) =>
  [data, extra.doc || "", desc, valor, "", "", extra.nome || "", extra.cpf || "", cat, uni, extra.nat || "", extra.conta || ""];

function planilhaFicticia() {
  return [
    { nome: "Master", rows: [["Unidade", "Classificados"]] },
    { nome: "Clientes", rows: [["Código", "Razão Social", "CNPJ"], [1, "CLIENTE UM LTDA", "11.111.111/0001-11"]] },
    { nome: "Pagamento em dinheiro ", rows: [CAB_BANCO, lin("05/08/2026", "PEDAGIO", "3,00D", "Despesa", "Matriz", { conta: "502" })] },
    { nome: "Sicredi 19915-0 Conta 627", rows: [CAB_BANCO,
      lin("01/08/2026", "SALDO ANTERIOR", "0,00C", "Saldo do dia", "Selecionar"),
      lin("03/08/2026", "PIX RECEBIDO", "1.209,74C", "Recebimento", "Chapecó", { nome: "CONSTRUTORA", cpf: "12345678000190" }),
      lin("04/08/2026", "TARIFA", "1,20D", "Despesa", "Matriz", { nat: "Despesas Bancárias", conta: "565" }),
      lin("", "linha solta classificada", "10,00C", "Recebimento", "Matriz"),
      lin("31/07/2026", "ESTORNO", "5,00C", "Recebimento", "Matriz")] },
    { nome: "SICOOB  58.289-1 Conta 7486", rows: [CAB_BANCO, lin("10/08/2026", "PIX", "2.29598C", "Recebimento", "Ciciuma")] },
    { nome: "Tabela de Unidades", rows: [["Nome da Unidade ", "CNPJ", "Código SCI"],
      ["Matriz", "00.589.066/0001-69", 158], ["Chapecó", "00.589.066/0002-40", 23], ["Matriz", "00.589.066/0004-01", 195]] },
    { nome: "Matriz", rows: [["Data", "Banco", "Doc.", "Modelo DOC", "Descricao", "Nome", "CPF/CNPJ", "Categoria", "Natureza", "Conta", "Valor", "Conta Banco", "Cta Debito", "Cta Credito", "HP"]] },
    { nome: "Digitação Compras (Nova-teste)", rows: [["x"]] }
  ];
}

describe("nome da aba de banco", () => {
  test("separa banco, número da conta e conta contábil", () => {
    assert.deepEqual(Imp.nomeAbaBanco("SICOOB  58.289-1 Conta 7486"), { banco: "SICOOB", numero: "58.289-1", contabil: "7486" });
    assert.deepEqual(Imp.nomeAbaBanco("Banrisul 13953.0-6-0 Conta 637"), { banco: "BANRISUL", numero: "13953.0-6-0", contabil: "637" });
    assert.deepEqual(Imp.nomeAbaBanco("CAIXA 000577219519-7 Conta 3112"), { banco: "CAIXA", numero: "000577219519-7", contabil: "3112" });
    assert.equal(Imp.nomeAbaBanco("Pagamento em dinheiro "), null);
    assert.equal(Imp.nomeAbaBanco("Tabela de Bancos"), null);
  });
});

describe("competência", () => {
  test("mês mais frequente nas datas", () => {
    assert.equal(Imp.competenciaDominante([{ data: "2026-08-03" }, { data: "2026-08-10" }, { data: "2026-07-31" }]), "2026-08");
    assert.equal(Imp.nomeCompetencia("2026-08"), "Agosto de 2026");
  });
});

describe("planilha inteira", () => {
  const p = Imp.analisarPlanilha(planilhaFicticia());

  test("reconhece contas bancárias, com conta contábil tirada do nome", () => {
    assert.deepEqual(p.bancos.map((b) => [b.banco, b.numero, b.contabil, b.lancamentos.length]),
      [["SICREDI", "19915-0", "627", 4], ["SICOOB", "58.289-1", "7486", 1]]);
    assert.equal(p.bancos[1].nomeAba, "SICOOB  58.289-1 Conta 7486");
  });

  test("lê os lançamentos com classificação; 'Selecionar' vira vazio", () => {
    const [saldo, pix, tarifa] = p.bancos[0].lancamentos;
    assert.equal(saldo.unidade, "");
    assert.deepEqual([pix.data, pix.valorNum, pix.sign, pix.categoria, pix.unidade, pix.nome, pix.cpf],
      ["2026-08-03", 1209.74, "C", "Recebimento", "Chapecó", "CONSTRUTORA", "12345678000190"]);
    assert.deepEqual([tarifa.natureza, tarifa.conta, tarifa.sign], ["Despesas Bancárias", "565", "D"]);
  });

  test("movimentos e cadastros vão para os lugares certos", () => {
    assert.deepEqual(p.movimentos.map((m) => [m.id, m.lancamentos.length]), [["mov-dinheiro", 1]]);
    assert.deepEqual(Object.keys(p.cadastros).sort(), ["cad-clientes", "cad-unidades"]);
    assert.equal(p.cadastros["cad-clientes"].itens[0].nome, "CLIENTE UM LTDA");
  });

  test("ignora Master, abas de unidade e de testes", () => {
    assert.deepEqual(p.ignoradas.map((i) => i.nome), ["Master", "Matriz", "Digitação Compras (Nova-teste)"]);
  });

  test("competência e avisos: fora do mês, sem data, tabela com nome repetido, unidade fora da tabela, valor estranho", () => {
    assert.equal(p.competencia, "2026-08");
    const avisos = p.avisos.join("\n");
    assert.match(avisos, /1 lançamento\(s\) têm data fora de Agosto de 2026/);
    assert.match(avisos, /1 linha\(s\) classificadas estão sem data/);
    assert.match(avisos, /"Matriz" 2 vezes \(códigos SCI 158, 195\)/);
    assert.match(avisos, /"Criciúma" tem lançamentos, mas não está na Tabela de unidades/);
    assert.match(avisos, /1 valor\(es\) digitados fora do padrão/);
  });
});
