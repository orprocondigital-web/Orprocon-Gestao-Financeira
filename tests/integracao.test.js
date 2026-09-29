const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const I = require("../js/integracao.js");

const L = (o) => Object.assign({ data: "2026-09-01", valorNum: 100, sign: "C", categoria: "Recebimento", unidade: "Matriz" }, o);
const fonte = (lancamentos, extra) => Object.assign({ nome: "Sicredi 19915-0 Conta 627", contaBanco: "627", lancamentos }, extra);

describe("utilidades", () => {
  test("conta contábil a partir do nome da aba", () => {
    assert.equal(I.contaDoNome("Sicredi 19915-0 Conta 627"), "627");
    assert.equal(I.contaDoNome("SICOOB 24402-3 Conta 643"), "643");
    assert.equal(I.contaDoNome("AG 3078 CONTA 24.402-3"), "");   // não numérico
    assert.equal(I.contaDoNome("Pagamento em dinheiro"), "");
  });

  test("CNPJ e CPF formatados; o resto passa como veio", () => {
    assert.equal(I.formatCNPJ("14580324000150"), "14.580.324/0001-50");
    assert.equal(I.formatCNPJ("08675495994"), "086.754.959-94");
    assert.equal(I.formatCNPJ("26.652.344 0001-79"), "26.652.344/0001-79");
    assert.equal(I.formatCNPJ("***.055.530-**"), "***.055.530-**");
    assert.equal(I.formatCNPJ(""), "");
  });

  test("valor e documento no formato do TXT", () => {
    assert.equal(I.valorTxt(1610.49), "1610,49");
    assert.equal(I.valorTxt(-86461.48), "86461,48");
    assert.equal(I.docTxt("13693803"), "13693803");
    assert.equal(I.docTxt("137103.0"), "137103");
    assert.equal(I.docTxt("NF 25,112"), "NF 25112");
  });

  test("corrige Ciciuma e ignora o texto 'Selecionar'", () => {
    assert.equal(I.normalizaUnidade("Ciciuma"), "Criciúma");
    assert.equal(I.normalizaUnidade("Matriz "), "Matriz");
    assert.ok(I.ehVazioOuPlaceholder("Selecionar"));
    assert.ok(!I.ehVazioOuPlaceholder("Matriz"));
  });
});

describe("coleta dos lançamentos", () => {
  test("precisa de data, categoria, valor e unidade", () => {
    const tx = I.coletarTransacoes([fonte([
      L({}),
      L({ categoria: "" }),
      L({ unidade: "" }),
      L({ unidade: "Selecionar", categoria: "Saldo do dia" }),
      L({ data: "" })
    ])]);
    assert.equal(tx.length, 1);
    assert.equal(tx[0].contaBanco, "627");
    assert.equal(tx[0].banco, "Sicredi 19915-0 Conta 627");
  });

  test("mantém o sinal C/D para a tela da unidade", () => {
    const tx = I.coletarTransacoes([fonte([L({ sign: "D", valorNum: -5 }), L({})])]);
    assert.deepEqual(tx.map((t) => [t.sign, t.valorNum]), [["D", 5], ["C", 100]]);
  });

  test("Aplicações sem unidade vai para Matriz", () => {
    const tx = I.coletarTransacoes([fonte([L({ categoria: "Aplicações", unidade: "" })])]);
    assert.equal(tx[0].unidade, "Matriz");
  });
});

describe("contas de débito e crédito (GetLineMappings)", () => {
  const m = (o) => I.mapeamentoContabil(Object.assign({ contaBanco: "627", conta: "", natureza: "" }, o));

  test("Recebimento: debita o banco, credita 18, HP 3708", () => {
    assert.deepEqual(m({ categoria: "Recebimento" }), { ctaDeb: "627", ctaCred: "18", hp: "3708" });
  });
  test("Recebimento de juros credita 2284", () => {
    assert.deepEqual(m({ categoria: "Recebimento", natureza: "Juros Recebidos" }), { ctaDeb: "627", ctaCred: "2284", hp: "3708" });
  });
  test("Pagamento: sempre debita 148, credita o banco, HP 3026", () => {
    assert.deepEqual(m({ categoria: "Pagamento", conta: "500" }), { ctaDeb: "148", ctaCred: "627", hp: "3026" });
  });
  test("Despesa: debita a coluna Conta (ou 148), credita o banco, sem HP", () => {
    assert.deepEqual(m({ categoria: "Despesa", conta: "500" }), { ctaDeb: "500", ctaCred: "627", hp: "" });
    assert.deepEqual(m({ categoria: "Despesa" }), { ctaDeb: "148", ctaCred: "627", hp: "" });
  });
  test("Aplicações: sentido pela Natureza (resgate inverte)", () => {
    assert.deepEqual(m({ categoria: "Aplicações", conta: "793", natureza: "App Automática Sicredi (627)" }), { ctaDeb: "793", ctaCred: "627", hp: "" });
    assert.deepEqual(m({ categoria: "Aplicações", conta: "793", natureza: "Resgate App Automática Sicredi (627)" }), { ctaDeb: "627", ctaCred: "793", hp: "" });
  });
  test("outras categorias saem sem conta (igual ao VBA) e são apontadas", () => {
    const r = m({ categoria: "Resgate" });
    assert.deepEqual(r, { ctaDeb: "", ctaCred: "", hp: "" });
    assert.equal(I.semConta([Object.assign({}, r)]).length, 1);
  });
});

describe("distribuir por unidade", () => {
  const tx = I.coletarTransacoes([fonte([
    L({ data: "2026-09-03", categoria: "Recebimento", unidade: "Tubarão", doc: "r2" }),
    L({ data: "2026-09-01", categoria: "Recebimento", unidade: "Tubarão", doc: "r1" }),
    L({ data: "2026-09-05", categoria: "Despesa", unidade: "Tubarão", doc: "d1" }),
    L({ data: "2026-09-02", categoria: "Pagamento", unidade: "Tubarão", doc: "p1" }),
    L({ data: "2026-09-02", categoria: "Pagamento", unidade: "Matriz", doc: "pm" })
  ])]);
  const dist = I.distribuirPorUnidade(tx);

  test("agrupa por unidade", () => {
    assert.deepEqual(dist.map((d) => [d.unidade, d.linhas.length]), [["Tubarão", 4], ["Matriz", 1]]);
  });
  test("ordena Despesa > Pagamento > Recebimento e depois por data", () => {
    assert.deepEqual(dist[0].linhas.map((l) => l.doc), ["d1", "p1", "r1", "r2"]);
  });
  test("cada linha já sai com as contas", () => {
    assert.deepEqual([dist[0].linhas[1].ctaDeb, dist[0].linhas[1].ctaCred, dist[0].linhas[1].hp], ["148", "627", "3026"]);
  });
  test("aba Juros Recebidos pega só a natureza de juros", () => {
    const j = I.jurosRecebidos(I.coletarTransacoes([fonte([L({ natureza: "Juros Recebidos", valorNum: 10.63 }), L({})])]));
    assert.equal(j.length, 1);
    assert.equal(j[0].ctaCred, "2284");
  });
});

describe("arquivos TXT", () => {
  const unidades = [
    { linha: ["Matriz", "00.589.066/0001-69", 158] },
    { linha: ["Passo Fundo", "00.589.066/0008-35", 160] }
  ];
  const tx = I.coletarTransacoes([fonte([
    L({ data: "2026-09-01", categoria: "Recebimento", unidade: "Passo Fundo", doc: "13693803", nome: "ELETRO VOLTS, LTDA", cpf: "14580324000150", valorNum: 972.92 }),
    L({ data: "2026-09-02", categoria: "Despesa", unidade: "Passo Fundo", doc: "", nome: "POSTO X", conta: "499", natureza: "Viagens e Estadas", valorNum: 9.8, sign: "D" }),
    L({ data: "2026-09-02", categoria: "Pagamento", unidade: "Tubarão", valorNum: 1 })   // Tubarão fora da tabela
  ])]);
  const dist = I.distribuirPorUnidade(tx);

  test("formato atual: um arquivo por unidade e categoria, só unidades da tabela", () => {
    const arqs = I.gerarTxts(dist, unidades);
    assert.deepEqual(arqs.map((a) => a.nome), ["DESPESA_Passo_Fundo.txt", "RECEBIMENTO_Passo_Fundo.txt"]);
    const [cab, linha, fim] = arqs[1].conteudo.split("\r\n");
    assert.equal(cab, I.CABECALHO_TXT.join("\t"));
    assert.equal(linha, ["01/09/2026", "ELETRO VOLTS  LTDA", "14.580.324/0001-50", "627", "13693803", "Passo Fundo", "",
      "18", "00.589.066/0008-35", "160", "Sicredi 19915-0 Conta 627", "627", "972,92", "3708", "13693803 - ELETRO VOLTS  LTDA"].join("\t"));
    assert.equal(fim, "");
  });

  test("SCI Único: CSV com sequência, data AAAAMMDD, CNPJ só dígitos no lado certo", () => {
    const [arq] = I.gerarTxtsUnico(dist, unidades, []);
    assert.equal(arq.nome, "UNICO_Passo_Fundo.txt");
    const linhas = arq.conteudo.split("\r\n");
    assert.equal(linhas[0], '000001,20260902,499,627,9.80,,"POSTO X",DCTO,DESPESA_Passo_Fundo,,,,,,,A');
    assert.equal(linhas[1], '000002,20260901,627,18,972.92,3708,"13693803 - ELETRO VOLTS  LTDA",DCTO13693803,RECEBIMENTO_Passo_Fundo,14580324000150,,,,,,A');
  });

  test("SCI Único com centro de custo acrescenta os rateios D e C", () => {
    const l = Object.assign({}, dist[0].linhas[0]);
    assert.match(I.linhaUnico(l, 1, "LOTE", "7"), /,D,7,9\.80,C,7,9\.80,A$/);
  });

  test("com ignorarSemConta, linhas sem conta ficam fora e a sequência continua corrida", () => {
    const d = I.distribuirPorUnidade(I.coletarTransacoes([fonte([
      L({ unidade: "Passo Fundo", categoria: "Criciúma" }),
      L({ unidade: "Passo Fundo", data: "2026-09-05" }),
      L({ unidade: "Passo Fundo", data: "2026-09-06" })
    ])]));
    const [arq] = I.gerarTxtsUnico(d, unidades, [], { ignorarSemConta: true });
    assert.deepEqual(arq.conteudo.trim().split("\r\n").map((l) => l.slice(0, 15)), ["000001,20260905", "000002,20260906"]);
    assert.equal(I.gerarTxts(d, unidades, { ignorarSemConta: true }).length, 1);
    const csv = I.pendenciasCSV(d, ["Criciúma"]);
    assert.match(csv, /Categoria sem regra contábil: Criciúma \(é o nome de uma unidade/);
    assert.equal(csv.trim().split("\r\n").length, 2);
  });

  test("toda linha do Único tem 16 campos (sem centro de custo)", () => {
    const [arq] = I.gerarTxtsUnico(dist, unidades, []);
    arq.conteudo.trim().split("\r\n").forEach((l) => {
      assert.equal(l.match(/("[^"]*"|[^,]*)(,|$)/g).length - 1, 16);
    });
  });

  test("centro de custo procura o nome da unidade na 1ª coluna (como o VBA)", () => {
    assert.equal(I.centroDeCusto([{ linha: [1, "ADM"] }], "Matriz"), "");
    assert.equal(I.centroDeCusto([{ linha: ["Matriz", "12"] }], "Matriz"), "12");
  });
});

describe("painel Master", () => {
  test("classificados, pendentes e total por unidade e por banco", () => {
    const fontes = [
      fonte([L({}), L({ categoria: "" }), L({ unidade: "Tubarão" }), L({ data: "", categoria: "", unidade: "" })], { id: "b1" }),
      fonte([L({ unidade: "Ciciuma" })], { id: "b2", nome: "Caixa" })
    ];
    const s = I.estatisticasMaster(fontes, ["Matriz", "Criciúma", "Chapecó"]);
    assert.deepEqual(s.unidades.map((u) => [u.nome, u.classificados, u.pendentes, u.total]),
      [["Matriz", 1, 1, 2], ["Criciúma", 1, 0, 1], ["Chapecó", 0, 0, 0]]);
    assert.equal(s.unidades[0].pct, 50);
    assert.equal(s.unidades[2].pct, null);
    assert.deepEqual(s.bancos.map((b) => [b.id, b.classificados, b.pendentes, b.total]), [["b1", 2, 1, 3], ["b2", 1, 0, 1]]);
  });
});
