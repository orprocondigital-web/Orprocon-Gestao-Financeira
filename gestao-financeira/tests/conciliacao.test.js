const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/conciliacao.js");

const planilha = [
  ["FAN METAL - CONTAS PAGAS - JULHO/2026"],
  [],
  ["Fornecedor", "CNPJ Fornecedor", "Nº NF", "Vencimento", "Data Pagamento", "Valor Original", "Valor Pago"],
  ["ELETROCAL INDUSTRIA E COMERCIO LTDA", "83.060.012/0004-81", "12345", "10/07/2026", "13/07/2026", "30.412,22", "30.412,22"],
  ["TRAMONTINA ELETRIK S.A.", "", "555", "13/07/2026", "13/07/2026", "4.822,39", "4.822,39"],
  ["SOPRANO INDUSTRIA E LTDA", "", "777", "13/07/2026", "13/07/2026", "1.000,00", "1.000,00"],
  ["BLUMENAU ILUMINACAO", "", "888", "13/07/2026", "13/07/2026", "1.000,00", "1.000,00"],
  ["FORNECEDOR QUE NAO SAIU", "", "999", "20/07/2026", "20/07/2026", "77,00", "77,00"],
  ["", "", "", "", "", "TOTAL", "37.311,61"]
];

describe("planilha de títulos", () => {
  const r = C.lerPlanilhaTitulos(planilha, "pagamentos");
  test("acha o cabeçalho e prefere Data Pagamento e Valor Pago", () => {
    assert.deepEqual(r.colunas, { valor: "Valor Pago", data: "Data Pagamento", doc: "Nº NF", nome: "Fornecedor", cpf: "CNPJ Fornecedor" });
  });
  test("lê os títulos como saídas (D) e pula a linha de total", () => {
    assert.equal(r.itens.length, 5);
    assert.deepEqual([r.itens[0].data, r.itens[0].valorNum, r.itens[0].sign, r.itens[0].doc], ["2026-07-13", 30412.22, "D", "12345"]);
  });
  test("sem data ou valor explica o que achou", () => {
    const e = C.lerPlanilhaTitulos([["Fornecedor", "Observação"], ["X", "Y"]], "pagamentos");
    assert.equal(e.ok, false);
    assert.match(e.erro, /Fornecedor, Observação/);
  });
});

describe("cruzamento com o extrato", () => {
  const titulos = C.lerPlanilhaTitulos(planilha, "pagamentos").itens;
  const ext = [
    { data: "2026-07-13", valorNum: 1000, sign: "D", desc: "PAGAMENTO DE BOLETO OUTROS BANCOS BLUMENAU ILUMINACAO" },
    { data: "2026-07-13", valorNum: 1000, sign: "D", desc: "PAGAMENTO DE BOLETO OUTROS BANCOS SOPRANO INDUSTRIA E LT DA" },
    { data: "2026-07-13", valorNum: 30412.22, sign: "D", desc: "PAGAMENTO DE BOLETO ELETROCAL INDUSTRIA E COM" },
    { data: "2026-07-14", valorNum: 4822.39, sign: "D", desc: "PAGAMENTO DE BOLETO OUTROS BANCOS TRAMONTINA ELETRIK S. A." },
    { data: "2026-07-13", valorNum: 9.66, sign: "D", desc: "TAR LIQ COB COM REG COMPE" },
    { data: "2026-07-13", valorNum: 17500, sign: "C", desc: "PIX RECEBIDO 44531431000150" }
  ];
  const { linhas, resumo } = C.conciliarAvulso(ext, titulos, { toleranciaDias: 3 });
  const par = (nome) => linhas.find((l) => l.sistema && l.sistema.nome.startsWith(nome));

  test("valores iguais no mesmo dia: casa pelo nome do fornecedor no histórico", () => {
    assert.match(par("SOPRANO").extrato.desc, /SOPRANO/);
    assert.match(par("BLUMENAU").extrato.desc, /BLUMENAU/);
    assert.equal(par("SOPRANO").nomeConfere, true);
  });
  test("data próxima vira 'data diferente'", () => {
    assert.equal(par("TRAMONTINA").status, "data_diferente");
  });
  test("sobras dos dois lados; entradas do extrato ficam fora numa planilha de pagamentos", () => {
    assert.deepEqual([resumo.ok, resumo.data_diferente, resumo.so_extrato, resumo.so_sistema, resumo.ignorados], [3, 1, 1, 1, 1]);
    assert.equal(linhas.find((l) => l.status === "so_extrato").extrato.desc, "TAR LIQ COB COM REG COMPE");
    assert.equal(linhas.find((l) => l.status === "so_sistema").sistema.nome, "FORNECEDOR QUE NAO SAIU");
  });
  test("CNPJ no histórico também confirma o fornecedor", () => {
    assert.ok(C.nomeConfere({ desc: "TED 83060012000481" }, { nome: "OUTRO NOME", cpf: "83.060.012/0004-81" }));
    assert.ok(!C.nomeConfere({ desc: "PAGAMENTO DE BOLETO" }, { nome: "ELETROCAL LTDA", cpf: "" }));
  });
  test("CSV para o Excel", () => {
    const csv = C.csvResultado(linhas, "Planilha");
    assert.ok(csv.startsWith("\uFEFFSituação;Data banco"));
    assert.match(csv, /Só na planilha;;;;20\/07\/2026;FORNECEDOR QUE NAO SAIU;999;77,00;/);
  });
});

describe("planilha de recebimentos", () => {
  test("títulos como entradas (C) casam com créditos do extrato", () => {
    const t = C.lerPlanilhaTitulos([["Cliente", "Data Recebimento", "Valor Recebido"], ["ACME", "03/07/2026", "500,00"]], "recebimentos").itens;
    const r = C.conciliarAvulso([{ data: "2026-07-03", valorNum: 500, sign: "C", desc: "PIX RECEBIDO ACME" }], t);
    assert.equal(r.resumo.ok, 1);
  });
});

describe("conciliação manual", () => {
  const ext = [
    { data: "2026-07-13", valorNum: 4000, sign: "D", desc: "PAGAMENTO DE BOLETOS EM LOTE" },
    { data: "2026-07-13", valorNum: 9.66, sign: "D", desc: "TARIFA" },
    { data: "2026-07-13", valorNum: 9.66, sign: "D", desc: "TARIFA" },
    { data: "2026-07-20", valorNum: 500, sign: "D", desc: "PIX ENVIADO FULANO" }
  ];
  const tit = [
    { linha: 4, data: "2026-07-13", valorNum: 2500, sign: "D", nome: "ACO FORTE", doc: "1" },
    { linha: 5, data: "2026-07-13", valorNum: 1500, sign: "D", nome: "TINTAS COLOR", doc: "2" },
    { linha: 6, data: "2026-07-21", valorNum: 499.5, sign: "D", nome: "FULANO", doc: "3" }
  ];
  const kE = C.chavesUnicas(ext, C.chaveExtrato), kS = C.chavesUnicas(tit, C.chaveSistema);

  test("tarifas idênticas no mesmo dia ganham chaves diferentes", () => {
    assert.notEqual(kE[1], kE[2]);
    assert.ok(kE[2].endsWith("#2"));
  });
  test("um débito que pagou dois boletos; tarifa conferida sem par; diferença de valor aceita", () => {
    const grupos = [
      { ext: [kE[0]], sis: [kS[0], kS[1]], tipo: "manual" },
      { ext: [kE[1]], sis: [], tipo: "justificado", obs: "tarifa bancária" },
      { ext: [kE[3]], sis: [kS[2]], tipo: "manual", obs: "pago com 0,50 de desconto" }
    ];
    const r = C.separarManuais(ext, tit, grupos, kE, kS);
    assert.deepEqual(r.linhas.map((l) => [l.status, l.extratos.length, l.sistemas.length, l.diferencaCents]),
      [["manual", 1, 2, 0], ["justificado", 1, 0, 0], ["manual", 1, 1, -50]]);
    assert.deepEqual(r.extrato.map((e) => e.desc), ["TARIFA"]);      // sobra a segunda tarifa
    assert.equal(r.sistema.length, 0);
    const csv = C.csvResultado(r.linhas, "Planilha");
    assert.match(csv, /Conciliado à mão;13\/07\/2026;PAGAMENTO DE BOLETOS EM LOTE;4\.000,00;13\/07\/2026;ACO FORTE \+ TINTAS COLOR;1 \+ 2;4\.000,00/);
    assert.match(csv, /Conferido \(sem par\);.*;tarifa bancária/);
  });
  test("chave que não existe mais é ignorada", () => {
    const r = C.separarManuais(ext, tit, [{ ext: ["E|sumiu#1"], sis: [], tipo: "justificado" }], kE, kS);
    assert.equal(r.linhas.length, 0);
    assert.equal(r.extrato.length, 4);
  });
  test("lançamento do sistema é identificado pelo id", () => {
    assert.equal(C.chaveSistema({ id: "e123", data: "2026-07-01", valorNum: 1, sign: "C" }), "S|id:e123");
  });
});

describe("balancete de fornecedores (totais por fornecedor)", () => {
  const V = (x) => x;
  const rows = [
    ["Balancete Consolidado de 01/08/2026 a 31/08/2026", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Página: 1", ""],
    ["Empresa: 995 - EMPRESA TESTE LTDA"], [],
    ["Conta", "Classificação", "Nome da conta contábil", "", "", "", "", "Saldo anterior", "", "", "", "Débito", "", "", "", "Crédito", "", "Saldo atual", ""],
    [],
    ["148", "02.1.1.01.000001", "", "", "DELUPO COMERCIO DE FERRAMENTAS E MAQUINAS LTDA", "", "", "1.000,00", "", "", "", "800,00", "", "", "", "500,00", "", "700,00", ""],
    ["148", "02.1.1.01.000002", "", "", "18.663.698 DIOVANA SOUZA", "", "", "0,00", "", "", "", "300,00", "", "", "", "300,00", "", "0,00", ""],
    ["148", "02.1.1.01.000003", "", "", "SHERWIN-WILLIAMS DO BRASIL INDUSTRIA E COMERCIO LTDA", "", "", "0,00", "", "", "", "0,00", "", "", "", "0,00", "", "0,00", ""],
    ["148", "02.1.1.01.000004", "", "", "SHERWIN WILLIAMS DO BRASIL IND E COM LT", "", "", "0,00", "", "", "", "1.500,00", "", "", "", "0,00", "", "0,00", ""],
    ["148", "02.1.1.01.000005", "", "", "ACOSUL LTDA", "", "", "0,00", "", "", "", "999,00", "", "", "", "0,00", "", "0,00", ""],
    ["148", "02.1.1.01.000006", "", "", "ZENAIR TEREZINHA NUNES FELIPPE LTDA", "", "", "0,00", "", "", "", "120,00", "", "", "", "0,00", "", "0,00", ""],
    ["Total de débitos", "", "", "", "", "", "0,00"]
  ];
  const ext = [
    { data: "2026-08-03", valorNum: 500, sign: "D", desc: "LIQUIDACAO BOLETO 86448941000108 DELUPO COM DE F", cpf: "86448941000108", nome: "DELUPO COM DE F" },
    { data: "2026-08-10", valorNum: 300, sign: "D", desc: "LIQUIDACAO BOLETO 86448941000108 DELUPO COM DE F", cpf: "86448941000108", nome: "DELUPO COM DE F" },
    { data: "2026-08-05", valorNum: 300, sign: "D", desc: "PAGAMENTO PIX 18663698000155 DIOVANA SOUZA", cpf: "18663698000155", nome: "DIOVANA SOUZA" },
    { data: "2026-08-06", valorNum: 1500, sign: "D", desc: "LIQUIDACAO BOLETO 61067161000197 SHERWIN WILLIAM", cpf: "61067161000197", nome: "SHERWIN WILLIAM" },
    { data: "2026-08-07", valorNum: 120, sign: "D", desc: "LIQUIDACAO BOLETO 20906868000162 ZENAIR TERESINH", cpf: "20906868000162", nome: "ZENAIR TERESINH" },
    { data: "2026-08-08", valorNum: 50, sign: "D", desc: "TARIFA COBRANCA", cpf: "", nome: "" },
    { data: "2026-08-09", valorNum: 7000, sign: "C", desc: "RECEBIMENTO PIX 04739720000124 USINA", cpf: "04739720000124", nome: "USINA" }
  ];
  const b = C.lerBalanceteFornecedores(rows);

  test("reconhece o balancete, o período e os valores", () => {
    assert.ok(C.ehBalancete(rows));
    assert.deepEqual(b.periodo, { inicio: "2026-08-01", fim: "2026-08-31" });
    assert.equal(b.fornecedores.length, 6);
    assert.deepEqual([b.fornecedores[0].debito, b.fornecedores[0].saldoAtual, b.fornecedores[1].raiz], [800, 700, "18663698"]);
  });
  test("nome cortado e abreviado do banco", () => {
    assert.ok(C.nomeBate("DELUPO COM DE F", "DELUPO COMERCIO DE FERRAMENTAS E MAQUINAS LTDA"));
    assert.ok(!C.nomeBate("ZENAIR TERESINH", "ZENAIR TEREZINHA NUNES FELIPPE LTDA"));   // grafia diferente: precisa de vínculo
  });
  test("soma por fornecedor e compara com o Débito; cadastro duplicado desempata por quem teve débito", () => {
    const r = C.conciliarPorFornecedor(ext, b, {});
    const por = (n) => r.linhas.find((l) => l.fornecedor.nome.startsWith(n));
    assert.deepEqual([por("DELUPO").status, por("DELUPO").totalBancoCents, por("DELUPO").pagos.length], ["bate", 80000, 2]);
    assert.deepEqual([por("18.663.698").status, por("18.663.698").via], ["bate", ["cnpj"]]);
    assert.equal(por("SHERWIN WILLIAMS DO BRASIL IND").status, "bate");
    assert.equal(por("ACOSUL").status, "so_balancete");
    assert.deepEqual(r.semFornecedor.map((s) => s.item.nome), ["ZENAIR TERESINH", ""]);
    assert.equal(r.resumo.semFornecedorCents, 17000);
  });
  test("vínculo escolhido pela pessoa e 'não é fornecedor' ficam valendo", () => {
    const vinc = {};
    vinc[C.chaveVinculo(ext[4])] = { classif: "02.1.1.01.000006" };
    vinc[C.chaveVinculo(ext[5])] = { ignorar: true };
    const r = C.conciliarPorFornecedor(ext, b, vinc);
    assert.equal(r.linhas.find((l) => l.fornecedor.nome.startsWith("ZENAIR")).status, "bate");
    assert.deepEqual([r.semFornecedor.length, r.ignorados.length], [0, 1]);
    assert.match(C.csvPorFornecedor(r), /Bate;02\.1\.1\.01\.000006;ZENAIR TEREZINHA NUNES FELIPPE LTDA;1;120,00;120,00;0,00/);
  });
});
