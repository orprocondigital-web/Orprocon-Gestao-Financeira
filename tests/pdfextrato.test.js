// Extratos em PDF: páginas fictícias no formato do pdf.js ({ s, x, y, w }), imitando os layouts reais.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const P = require("../js/pdfextrato.js");

// monta uma página: cada linha é [y, [x, texto], [x, texto]...]
const pagina = (linhas) => linhas.flatMap(([y, ...itens]) => itens.map(([x, s]) => ({ s, x, y, w: s.length * 4 })));

describe("estilo BB: data em cada linha, C/D, saldo no fim do dia, complemento embaixo", () => {
  const r = P.lerExtratoPdf([pagina([
    [800, [400, "03/02/2026 11:30:25"]],                         // data de emissão: não é lançamento
    [760, [60, "Conta corrente"], [150, "315-8ALUMP ALUMINIO MP LTDA"]],
    [700, [60, "Dt. balancete"], [230, "Histórico"], [398, "Documento"], [462, "Valor R$"], [525, "Saldo"]],
    [690, [65, "29/12/2025"], [224, "00000 000 Saldo Anterior"], [498, "193.718,90 C"]],
    [680, [65, "02/01/2026"], [224, "14020 624 Cobrança"], [365, "110.021.100.287.246"], [451, "23.453,69 C 217.172,59 C"]],
    [670, [65, "05/01/2026"], [224, "99015 470 Transferência enviada"], [365, "558.279.000.000.314 217.000,00 D"], [503, "172,59 C"]],
    [660, [249, "05/01 16:14 VIPEL I COMERCIO LTDA"]],
    [650, [65, "31/01/2026"], [224, "00000 999 S A L D O"], [498, "172,59 C"]],
    [600, [60, "Serviço de Atendimento ao Consumidor - SAC 0800 729 0722 Ouvidoria BB 0800 729 5678"]]
  ])]);

  test("banco, conta e lançamentos", () => {
    assert.equal(r.banco.id, "bb");
    assert.equal(r.numeroConta, "315-8");
    assert.deepEqual(r.itens.map((i) => [i.data, i.sign, i.valorNum]), [["2026-01-02", "C", 23453.69], ["2026-01-05", "D", 217000]]);
  });
  test("histórico sem códigos, documento separado, nome do complemento", () => {
    assert.equal(r.itens[0].desc, "Cobrança");
    assert.equal(r.itens[0].doc, "110.021.100.287.246");
    assert.equal(r.itens[1].nome, "VIPEL I COMERCIO LTDA");
  });
  test("saldos conferem dia a dia", () => {
    assert.deepEqual([r.conferencia.conferidos, r.conferencia.total], [3, 3]);
  });
});

describe("estilo Itaú: data só na 1ª linha do dia, menos no fim, legenda ao lado", () => {
  const r = P.lerExtratoPdf([pagina([
    [790, [400, "extrato mensal ag 7448 cc 14778-0 jan 2026"], [520, "itau.com.br"]],
    [700, [152, "data"], [210, "descrição"], [359, "entradas R$"], [428, "saídas R$"], [523, "saldo R$"]],
    [690, [151, "30/12"], [208, "Saldo anterior"], [521, "100,00"]],
    [680, [60, "D = débito a compensar"], [151, "02/01"], [208, "Mov Tít Cob Disp 02/01S"], [366, "13.347,01"]],
    [670, [60, "G = aplicação programada"], [208, "Apl Aplic Aut Mais"], [427, "13.345,05-"]],
    [660, [208, "Tar/Custas Cobrança"], [444, "1,96-"], [535, "100,00"]],
    [650, [208, "SALDO APLIC AUT MAIS"], [521, "79.167,90"]],
    [640, [208, "Saldo final"], [521, "1.569,45"]],
    [630, [151, "02/01"], [208, "não é lançamento"], [366, "9,99"]]
  ])]);
  test("datas herdadas e ano de dezembro no extrato de janeiro", () => {
    assert.deepEqual(r.itens.map((i) => [i.data, i.sign, i.valorNum, i.desc]), [
      ["2026-01-02", "C", 13347.01, "Mov Tít Cob Disp 02/01S"],
      ["2026-01-02", "D", 13345.05, "Apl Aplic Aut Mais"],
      ["2026-01-02", "D", 1.96, "Tar/Custas Cobrança"]]);
  });
  test("para em 'Saldo final' e confere o saldo do dia", () => {
    assert.equal(r.itens.length, 3);
    assert.deepEqual([r.conferencia.conferidos, r.conferencia.total, r.numeroConta], [0, 0, "14778-0"]);
  });
});

describe("estilo Nubank: cabeçalho do dia e sinal pelo grupo", () => {
  const r = P.lerExtratoPdf([pagina([
    [700, [320, "Saldo inicial"], [495, "770,79"]],
    [690, [320, "Total de saídas"], [495, "-3.588,89"]],
    [640, [58, "01 JUL 2026"], [120, "Total de entradas"], [489, "+ 3.000,00"]],
    [620, [120, "Transferência recebida pelo Pix"], [262, "JOAO - 81.601.353/0001-49 -"], [497, "3.000,00"]],
    [600, [262, "BANCO INTER (0077) Agência: 1 Conta: 12085777-4"]],
    [580, [120, "Saldo do dia"], [499, "3.770,79"]],
    [550, [58, "02 JUL 2026"], [120, "Total de saídas"], [505, "- 66,50"]],
    [530, [120, "Compra no débito"], [260, "RAIA DROGASIL SA"], [511, "66,50"]],
    [510, [120, "Saldo do dia"], [498, "3.704,29"]],
    [400, [100, "nubank.com.br"]]
  ])]);
  test("hífen solto no histórico não vira sinal de menos", () => {
    assert.deepEqual(r.itens.map((i) => [i.data, i.sign, i.valorNum]), [["2026-07-01", "C", 3000], ["2026-07-02", "D", 66.5]]);
    assert.equal(r.itens[0].cpf, "81.601.353/0001-49");
  });
  test("saldo inicial + dias conferem", () => {
    assert.deepEqual([r.conferencia.conferidos, r.conferencia.total], [2, 2]);
  });
});

describe("estilo Unicred: histórico acima e abaixo da linha da data, '- R$'", () => {
  const r = P.lerExtratoPdf([pagina([
    [720, [20, "Saldo em 31/12/2025: R$ 100,00"]],                    // impresso sem o sinal: era -100,00
    [650, [21, "Data"], [91, "Lançamentos"], [396, "Valor (R$)"], [514, "Saldo (R$)"]],
    [625, [91, "CREDITO RECEBIMENTO DE PIX ( Doc.: CRED PIX /"]],
    [621, [21, "02/01/2026"], [383, "R$ 600,00"], [503, "R$ 500,00"]],
    [614, [91, "ME SISTEMAS DE GESTAO LTDA )"]],
    [598, [91, "DEBITO TRANSFERENCIA PIX ( Doc.: DEB PIX / ANA"]],
    [594, [21, "02/01/2026"], [391, "- R$ 410,00"], [503, "R$ 90,00"]],
    [587, [91, "JULIA CORREA DELFINO )"]],
    [500, [20, "CENTRAL DE RELACIONAMENTO: 3003 7703 - OUVIDORIA: 0800 940 0602 Pág. 1/19"]]
  ])]);
  test("junta as três linhas do histórico e tira o nome", () => {
    assert.deepEqual(r.itens.map((i) => [i.sign, i.valorNum, i.nome]), [["C", 600, "ME SISTEMAS DE GESTAO LTDA"], ["D", 410, "ANA JULIA CORREA DELFINO"]]);
    assert.match(r.itens[1].desc, /^DEBITO TRANSFERENCIA PIX .* JULIA CORREA DELFINO \)$/);
  });
  test("aceita o saldo inicial impresso sem o sinal de negativo", () => {
    assert.deepEqual([r.conferencia.conferidos, r.conferencia.total], [1, 1]);
  });
});

describe("conferência aponta lançamento faltando", () => {
  test("saldo que não fecha vira divergência", () => {
    const c = P.conferirSaldos([{ data: "2026-01-02", valorNum: 10, sign: "C", saldoLinha: 15 }], [{ data: "2026-01-01", saldo: 0, tipo: "inicio" }]);
    assert.deepEqual(c.divergencias, [{ data: "2026-01-02", esperado: 10, extrato: 15 }]);
  });
});

describe("outros", () => {
  test("PDF que é imagem não tem texto", () => {
    assert.equal(P.lerExtratoPdf([[], []]).semTexto, true);
  });
  test("número da conta nos formatos dos bancos", () => {
    assert.equal(P.numeroConta("Conta: 4270 | 1292 | 000577220246-0"), "000577220246-0");
    assert.equal(P.numeroConta("EXTRATO DE CONTA CORRENTE 04/08/2026\nConta: 8.478-6 / VIPEL"), "8.478-6");
    assert.equal(P.numeroConta("CONTA..: 06.160894.0-8"), "06.160894.0-8");
    assert.equal(P.numeroConta("Agência : 1263 Conta : 130007096"), "130007096");
    assert.equal(P.numeroConta("Agência 0001 Conta\n21769647-5"), "21769647-5");
  });
  test("valores: C/D, menos antes, menos depois, R$", () => {
    const v = (t) => P.valoresDaLinha(t).map((x) => [x.valor, x.sinal]);
    assert.deepEqual(v("1.234,56 C 10,00 D"), [[1234.56, "C"], [10, "D"]]);
    assert.deepEqual(v("-R$ 548,56"), [[548.56, "D"]]);
    assert.deepEqual(v("13.345,05-"), [[13345.05, "D"]]);
    assert.deepEqual(v("R$ 2.500,00D"), [[2500, "D"]]);
    assert.deepEqual(v("PAGTO 001041 38.248,11-"), [[38248.11, "D"]]);
    assert.deepEqual(v("Doc 558.279.000.000.314"), []);
  });
});
