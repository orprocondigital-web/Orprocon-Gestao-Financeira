// Rodar com:  npm test   (ou: node --test)
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../js/core.js");

const lerFixture = (nome) => fs.readFileSync(path.join(__dirname, "fixtures", nome));

describe("valores", () => {
  test("lê formatos brasileiros e americanos", () => {
    assert.equal(Core.parseValor("1.234,56"), 1234.56);
    assert.equal(Core.parseValor("1234,56"), 1234.56);
    assert.equal(Core.parseValor("1234.56"), 1234.56);
    assert.equal(Core.parseValor("R$ 86.461,48"), 86461.48);
    assert.equal(Core.parseValor("-1,20"), -1.2);
    assert.equal(Core.parseValor(42.5), 42.5);
  });

  test("milhar só com pontos não vira decimal", () => {
    assert.equal(Core.parseValor("1.234.567"), 1234567);
  });

  test("texto inválido ou vazio vira NaN", () => {
    assert.ok(Number.isNaN(Core.parseValor("")));
    assert.ok(Number.isNaN(Core.parseValor("abc")));
    assert.ok(Number.isNaN(Core.parseValor(null)));
  });

  test("célula de extrato separa valor e sinal C/D", () => {
    assert.deepEqual(Core.parseValorCell("5.514,70C"), { valorNum: 5514.7, sign: "C" });
    assert.deepEqual(Core.parseValorCell("-1,20D"), { valorNum: 1.2, sign: "D" });
    assert.deepEqual(Core.parseValorCell(-350), { valorNum: 350, sign: "D" });
    assert.deepEqual(Core.parseValorCell("100"), { valorNum: 100, sign: "C" });
    assert.deepEqual(Core.parseValorCell("3.640,00*"), { valorNum: 3640, sign: "C", bloqueado: true });
  });

  test("leitor de valores igual ao da macro v30", () => {
    const v = (t) => Core.parseValorCell(t).valorNum;
    assert.equal(v("1.234,56C"), 1234.56);
    assert.equal(v("8,934,48C"), 8934.48);
    assert.equal(v("836.71C"), 836.71);
    assert.equal(v("1;307,78C"), 1307.78);
    assert.equal(v("19,26CC"), 19.26);
    assert.equal(v("3.658.88C"), 3658.88);
    assert.equal(v("-65.12,72D"), 6512.72);
    assert.equal(v("2.29598C"), 229598);      // a macro lê assim; o sistema marca para conferir
    assert.equal(v("1.234"), 1234);
    assert.equal(v("abc"), 0);
    assert.equal(Core.parseValorCell("-1,20").sign, "D");
  });

  test("valor digitado fora do padrão é marcado como inválido", () => {
    for (const ok of ["1.234,56C", "1234,56", "- 109.618,91D", "0,00C", "1234.56", "R$ 86.461,48", "-1,20D"])
      assert.ok(!Core.parseValorCell(ok).invalido, ok);
    for (const ruim of ["2.29598C", "14.39831C", "8,934,48C", "1,132,21C", "-0,12,00D", "3.658.88C"])
      assert.ok(Core.parseValorCell(ruim).invalido, ruim);
    assert.ok(!Core.parseValorCell(390.46).invalido);   // número de verdade na célula
    assert.equal(Core.parseValorCell(""), null);
  });

  test("formata no padrão brasileiro", () => {
    assert.equal(Core.formatBR(86461.48), "86.461,48");
    assert.equal(Core.formatBR(0.1 + 0.2), "0,30");
    assert.equal(Core.formatBR(-1.2), "-1,20");
  });

  test("centavos eliminam erro de ponto flutuante", () => {
    assert.notEqual(0.1 + 0.2, 0.3);
    assert.equal(Core.toCents(0.1 + 0.2), Core.toCents(0.3));
  });
});

describe("datas", () => {
  test("DD/MM/AAAA, DD/MM/AA e ISO", () => {
    assert.equal(Core.toIsoDate("03/08/2026"), "2026-08-03");
    assert.equal(Core.toIsoDate("3/8/26"), "2026-08-03");
    assert.equal(Core.toIsoDate("2026-08-03"), "2026-08-03");
  });

  test("ignora a hora quando vem junto", () => {
    assert.equal(Core.toIsoDate("03/08/2026 10:45:00"), "2026-08-03");
  });

  test("número serial do Excel", () => {
    assert.equal(Core.toIsoDate(46237), "2026-08-03");
  });

  test("datas impossíveis e texto viram vazio", () => {
    assert.equal(Core.toIsoDate("31/02/2026"), "");
    assert.equal(Core.toIsoDate("SALDO"), "");
    assert.equal(Core.toIsoDate(""), "");
  });

  test("ida e volta com o formato de tela", () => {
    assert.equal(Core.brDate("2026-08-03"), "03/08/2026");
    assert.equal(Core.diasEntre("2026-08-01", "2026-08-04"), 3);
  });
});

describe("planilhas", () => {
  test("acha a linha de cabeçalho mesmo com título em cima", () => {
    const rows = [["Extrato de agosto"], [], ["Data", "Histórico", "Valor"], ["03/08/2026", "PIX", "10,00C"]];
    assert.equal(Core.detectHeaderRow(rows), 2);
  });

  test("mapeia colunas pelo nome, inclusive Data Movimento separada de Data", () => {
    const map = Core.buildColumnMap(["Data", "Data Movimento", "Descrição/Histórico", "Doc.", "Valor",
      "Categoria", "Unidade", "Nome do Fornecedor/Cliente", "CPF/CNPJ"]);
    assert.deepEqual(map, { data: 0, dataMov: 1, desc: 2, doc: 3, valor: 4, categoria: 5, unidade: 6, nome: 7, cpf: 8 });
  });

  test("cabeçalho real das abas bancárias da planilha de setembro", () => {
    const map = Core.buildColumnMap(["Data", "Doc.", "Descrição/Histórico", "Valor", "Saldo", "Última Trasação do dia",
      "Modelo DOC", "Nome do Fornecedor/Cliente (não usar nome de fantasia)", "CPF/CNPJ", "Categoria", "Unidade",
      "Natureza do gasto", "Conta", "", "Índice Diário"]);
    assert.deepEqual(map, { data: 0, doc: 1, desc: 2, valor: 3, saldo: 4, modelo: 6, nome: 7, cpf: 8, categoria: 9, unidade: 10, natureza: 11, conta: 12 });
  });

  test("nome: coluna com razão social vence coluna genérica de cliente", () => {
    const map = Core.buildColumnMap(["Código", "Cliente", "Razão Social", "CNPJ"]);
    assert.equal(map.nome, 2);
  });

  test("extrato em planilha: pula saldos e linhas sem data/valor", () => {
    const rows = [
      ["Data", "Histórico", "Valor"],
      ["01/08/2026", "SALDO ANTERIOR", "1.000,00C"],
      ["03/08/2026", "PIX RECEBIDO", "167,23C"],
      ["03/08/2026", "TARIFA", -1.2],
      ["", "linha solta", ""]
    ];
    const r = Core.parseExtratoRows(rows);
    assert.ok(r.ok);
    assert.equal(r.itens.length, 2);
    assert.deepEqual(r.itens.map((i) => [i.data, i.valorNum, i.sign]),
      [["2026-08-03", 167.23, "C"], ["2026-08-03", 1.2, "D"]]);
  });

  test("extrato em planilha no formato do Sicredi: conta do cabeçalho, saldo inicial, CNPJ e nome do histórico", () => {
    const rows = [
      ["Associado:", "EMPRESA TESTE LTDA"], ["Cooperativa:", "2604"], ["Conta:", "14752-4"], [],
      ["Data", "Descrição", "Documento", "Valor (R$)", "Saldo (R$)"],
      ["", "Saldo Anterior", "", "", 100],
      ["03/08/2026", "PAGAMENTO PIX 32756790000126 VILLA PARK EVENTOS", "CX451231", -30, 70],
      ["03/08/2026", "RECEBIMENTO PIX 04739720000124 USINA TERMELETRIC", "PIX_CRED", 50, 120],
      [], ["Lançamentos Futuros (Próximos 30 dias)"], ["Data", "Descrição", "Valor (R$)"], ["05/09/2026", "Juros Cheque Especial", -38.45]
    ];
    const r = Core.parseExtratoRows(rows);
    assert.equal(r.numeroConta, "14752-4");
    assert.equal(r.saldoInicial, 100);
    assert.equal(r.itens.length, 2);                       // lançamentos futuros ficam fora
    assert.deepEqual([r.itens[0].sign, r.itens[0].cpf, r.itens[0].nome, r.itens[0].saldoLinha], ["D", "32756790000126", "VILLA PARK EVENTOS", 70]);
  });

  test("sem colunas de data/valor devolve erro legível", () => {
    const r = Core.parseExtratoRows([["Nome", "Cidade"], ["X", "Y"]]);
    assert.equal(r.ok, false);
    assert.match(r.erro, /Data e Valor/);
  });

  describe("escolha da aba", () => {
    const abas = ["SICOOB 24432-0 Conta 643", "SICOOB 58.282-4 Conta 7483", "Matriz"];

    test("nome exato ou sem acento/espaço extra", () => {
      assert.equal(Core.findSheet(abas, { sheetName: "Matriz" }), "Matriz");
      assert.equal(Core.findSheet(abas, { sheetName: "sicoob  24432-0 conta 643" }), "SICOOB 24432-0 Conta 643");
    });

    test("pelo número da conta cadastrada", () => {
      assert.equal(Core.findSheet(abas, { sheetName: "Sicoob Ag 3078 Conta 58.282-4", conta: "58.282-4" }),
        "SICOOB 58.282-4 Conta 7483");
    });

    test("arquivo com uma aba só usa essa aba", () => {
      assert.equal(Core.findSheet(["Planilha1"], { sheetName: "qualquer" }), "Planilha1");
    });

    test("sem pista nenhuma devolve null", () => {
      assert.equal(Core.findSheet(abas, { sheetName: "Bradesco 999" }), null);
    });
  });
});

describe("extrato TXT do Sicoob", () => {
  const texto = Core.decodeText(lerFixture("sicoob-exemplo.txt"));
  const r = Core.parseExtratoTexto(texto);

  test("reconhece o formato", () => {
    assert.equal(r.formato, "Sicoob TXT");
  });

  test("lê só as movimentações, sem as linhas de saldo nem o resumo", () => {
    assert.equal(r.itens.length, 6);
    assert.equal(r.saldos.length, 4);
    assert.ok(r.itens.every((i) => !/SALDO/.test(i.desc)));
  });

  test("separa data, documento, histórico, valor e sinal", () => {
    assert.deepEqual(
      { data: r.itens[0].data, doc: r.itens[0].doc, desc: r.itens[0].desc, valorNum: r.itens[0].valorNum, sign: r.itens[0].sign },
      { data: "2026-08-03", doc: "2432370", desc: "CRÉD.LIQUIDAÇÃO COBRANÇA", valorNum: 5514.7, sign: "C" });
    assert.equal(r.itens[1].sign, "D");
    assert.equal(r.itens[1].valorNum, 1.2);
    assert.equal(r.itens[5].doc, "64 - 43");
  });

  test("junta ao Pix o nome e o CPF/CNPJ das linhas de baixo", () => {
    const pix = r.itens.find((i) => i.valorNum === 1209.74);
    assert.equal(pix.nome, "CONSTRUTORA EXEMPLO LTDA");
    assert.equal(pix.cpfCnpj, "12.345.678 0001-90");
    assert.match(pix.texto, /compra de material/);

    const cpf = r.itens.find((i) => i.valorNum === 167.23);
    assert.equal(cpf.nome, "FULANO DE TAL");
    assert.equal(cpf.cpfCnpj, "***.055.530-**");
  });

  test("lançamento depois de quebra de página continua certo", () => {
    const emitido = r.itens.find((i) => i.desc === "PIX EMITIDO OUTRA IF");
    assert.equal(emitido.sign, "D");
    assert.equal(emitido.nome, "FORNECEDOR EXEMPLO SA");
  });

  test("arquivo em Windows-1252 (sem UTF-8) também é lido", () => {
    const latin1 = Buffer.from(texto, "latin1");
    const r2 = Core.parseExtratoTexto(Core.decodeText(latin1));
    assert.equal(r2.itens.length, 6);
    assert.equal(r2.itens[0].desc, "CRÉD.LIQUIDAÇÃO COBRANÇA");
  });
});

describe("conciliação", () => {
  const L = (data, valorNum, sign, desc = "") => ({ data, valorNum, sign, desc });

  test("tudo batendo: conciliação fechada", () => {
    const ext = [L("2026-08-03", 100, "C"), L("2026-08-03", 50, "D")];
    const sis = [L("2026-08-03", 50, "D"), L("2026-08-03", 100, "C")];
    const { linhas, resumo } = Core.conciliar(ext, sis);
    assert.ok(linhas.every((l) => l.status === "ok"));
    assert.equal(resumo.fechado, true);
    assert.equal(resumo.diferencaCents, 0);
  });

  test("aponta o que está só no banco e o que está só no sistema", () => {
    const ext = [L("2026-08-03", 100, "C"), L("2026-08-04", 7.9, "D", "TARIFA")];
    const sis = [L("2026-08-03", 100, "C"), L("2026-08-10", 300, "D", "BOLETO")];
    const { linhas, resumo } = Core.conciliar(ext, sis);
    assert.equal(resumo.ok, 1);
    assert.equal(linhas.find((l) => l.status === "so_extrato").extrato.desc, "TARIFA");
    assert.equal(linhas.find((l) => l.status === "so_sistema").sistema.desc, "BOLETO");
    assert.equal(resumo.fechado, false);
    assert.equal(resumo.diferencaCents, 100 * 100 - 790 - (100 * 100 - 300 * 100));
  });

  test("mesmo valor com sinal trocado não concilia", () => {
    const { resumo } = Core.conciliar([L("2026-08-03", 100, "C")], [L("2026-08-03", 100, "D")]);
    assert.equal(resumo.ok, 0);
  });

  test("compara em centavos (0.1 + 0.2 bate com 0.3)", () => {
    const { resumo } = Core.conciliar([L("2026-08-03", 0.3, "C")], [L("2026-08-03", 0.1 + 0.2, "C")]);
    assert.equal(resumo.ok, 1);
  });

  test("valores repetidos casam um a um, nunca duas vezes", () => {
    const ext = [L("2026-08-03", 10, "C"), L("2026-08-03", 10, "C"), L("2026-08-03", 10, "C")];
    const sis = [L("2026-08-03", 10, "C"), L("2026-08-03", 10, "C")];
    const { resumo } = Core.conciliar(ext, sis);
    assert.equal(resumo.ok, 2);
    assert.equal(resumo.so_extrato, 1);
  });

  test("data próxima casa como 'data_diferente', preferindo a mais perto", () => {
    const ext = [L("2026-08-05", 200, "D")];
    const sis = [L("2026-08-02", 200, "D", "longe"), L("2026-08-04", 200, "D", "perto")];
    const { linhas } = Core.conciliar(ext, sis);
    assert.equal(linhas[0].status, "data_diferente");
    assert.equal(linhas[0].sistema.desc, "perto");
  });

  test("casamento exato tem prioridade sobre data próxima", () => {
    const ext = [L("2026-08-04", 200, "D"), L("2026-08-05", 200, "D")];
    const sis = [L("2026-08-05", 200, "D", "dia5"), L("2026-08-04", 200, "D", "dia4")];
    const { linhas } = Core.conciliar(ext, sis);
    assert.deepEqual(linhas.map((l) => [l.status, l.sistema.desc]), [["ok", "dia4"], ["ok", "dia5"]]);
  });

  test("fora da tolerância não casa; tolerância 0 exige a mesma data", () => {
    const ext = [L("2026-08-10", 200, "D")];
    const sis = [L("2026-08-04", 200, "D")];
    assert.equal(Core.conciliar(ext, sis).resumo.ok + Core.conciliar(ext, sis).resumo.data_diferente, 0);
    assert.equal(Core.conciliar([L("2026-08-05", 1, "C")], [L("2026-08-04", 1, "C")], { toleranciaDias: 0 }).resumo.so_extrato, 1);
  });

  test("ponta a ponta: extrato Sicoob contra lançamentos do sistema", () => {
    const extrato = Core.parseExtratoTexto(Core.decodeText(lerFixture("sicoob-exemplo.txt"))).itens;
    const sistema = [
      L("2026-08-03", 5514.7, "C", "Cobrança"),
      L("2026-08-03", 1.2, "D", "Tarifa"),
      L("2026-08-03", 167.23, "C", "Fulano"),
      L("2026-08-04", 1209.74, "C", "Construtora (lançada um dia depois)"),
      L("2026-08-04", 350, "D", "Fornecedor"),
      L("2026-08-20", 999, "D", "Pagamento que não saiu")
    ];
    const { resumo } = Core.conciliar(extrato, sistema);
    assert.equal(resumo.ok, 4);
    assert.equal(resumo.data_diferente, 1);
    assert.equal(resumo.so_extrato, 1);   // resgate RDC ninguém lançou
    assert.equal(resumo.so_sistema, 1);   // pagamento de 999 não aparece no banco
  });
});

describe("exportação", () => {
  const entries = [{ data: "2026-08-03", dataMov: "", desc: 'PIX "teste"; ok', doc: "1", valorNum: 1234.5, sign: "C",
    categoria: "Recebimento", unidade: "Matriz", nome: "Fulano", cpf: "000.000.000-00" }];

  test("CSV com ; , BOM e aspas escapadas", () => {
    const csv = Core.toCSV(entries, false);
    assert.ok(csv.startsWith("\uFEFFData;Descrição/Histórico"));
    assert.match(csv, /03\/08\/2026;"PIX ""teste""; ok";1;1\.234,50C;Recebimento;Matriz;Fulano;000\.000\.000-00/);
  });

  test("TSV para colar no Excel, com coluna Data Movimento quando pedida", () => {
    const tsv = Core.toTSV(entries, true);
    assert.equal(tsv.split("\t").length, 12);
    assert.ok(tsv.startsWith("03/08/2026\t\t"));
  });
});
