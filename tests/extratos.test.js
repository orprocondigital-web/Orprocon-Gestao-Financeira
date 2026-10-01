const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../js/core.js");
const E = require("../js/extratos.js");

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0756<BRANCHID>3078<ACCTID>24402-3<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260803120000[-3:BRT]<TRNAMT>1209,74<FITID>A1<MEMO>PIX RECEBIDO - OUTRA IF<NAME>CONSTRUTORA EXEMPLO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260803<TRNAMT>-1.20<FITID>A2<CHECKNUM>2433150<MEMO>TARIFA COBRANCA</STMTTRN>
<STMTTRN><TRNTYPE>OTHER<DTPOSTED>20260803<TRNAMT>0.00<FITID>A3<MEMO>SALDO DO DIA</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const OFX_XML = `<?xml version="1.0"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>748</BANKID><ACCTID>0000199150</ACCTID></BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260905</DTPOSTED><TRNAMT>-350.00</TRNAMT><FITID>X9</FITID><MEMO>PAGAMENTO &amp; TARIFA</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("OFX", () => {
  test("SGML de banco brasileiro (vírgula decimal, sem tags de fechamento)", () => {
    const r = E.lerExtrato(OFX_SGML);
    assert.equal(r.formato, "OFX");
    assert.equal(r.numeroConta, "24402-3");
    assert.deepEqual(r.itens.map((i) => [i.data, i.sign, i.valorNum, i.desc, i.fitid]),
      [["2026-08-03", "C", 1209.74, "PIX RECEBIDO - OUTRA IF", "A1"], ["2026-08-03", "D", 1.2, "TARIFA COBRANCA", "A2"]]);
    assert.equal(r.itens[0].nome, "CONSTRUTORA EXEMPLO");
    assert.equal(r.itens[1].doc, "2433150");
  });
  test("XML (OFX 2.x) com entidades", () => {
    const r = E.lerExtrato(OFX_XML);
    assert.deepEqual(r.itens.map((i) => [i.sign, i.valorNum, i.desc]), [["D", 350, "PAGAMENTO & TARIFA"]]);
  });
});

describe("TXT do Sicoob", () => {
  test("lê lançamentos e o número da conta do cabeçalho", () => {
    const r = E.lerExtrato(Core.decodeText(fs.readFileSync(path.join(__dirname, "fixtures", "sicoob-exemplo.txt"))));
    assert.equal(r.formato, "Sicoob TXT");
    assert.equal(r.numeroConta, "00.000-0");
    assert.equal(r.itens.length, 6);
    assert.equal(r.itens[3].cpf, "12.345.678 0001-90");
  });
});

describe("qual conta do sistema", () => {
  const contas = [{ id: "a", conta: "24402-3" }, { id: "b", conta: "13953.0-6-0" }, { id: "c", conta: "13953.0-6-0" }, { id: "d", conta: "" }];
  test("ignora pontuação e zeros, aceita agência na frente", () => {
    assert.deepEqual(E.contasCandidatas("0024402-3", contas).map((c) => c.id), ["a"]);
    assert.deepEqual(E.contasCandidatas("3078244023", contas).map((c) => c.id), ["a"]);
  });
  test("duas contas com o mesmo número: a pessoa escolhe", () => {
    assert.deepEqual(E.contasCandidatas("1395306 0", contas).map((c) => c.id), ["b", "c"]);
  });
  test("número curto ou ausente não casa com nada", () => {
    assert.deepEqual(E.contasCandidatas("12", contas), []);
  });
});

describe("sem duplicar", () => {
  const L = (o) => Object.assign({ data: "2026-08-03", valorNum: 1.2, sign: "D", desc: "TARIFA", doc: "" }, o);
  test("extrato repetido não duplica; repetição legítima no mesmo dia é respeitada", () => {
    const existentes = [L({}), L({})];
    const r = E.mesclar(existentes, [L({}), L({}), L({}), L({ valorNum: 5 })]);
    assert.equal(r.repetidos, 2);
    assert.deepEqual(r.adicionados.map((i) => i.valorNum), [1.2, 5]);
  });
  test("FITID do OFX casa mesmo com descrição diferente", () => {
    const r = E.mesclar([L({ fitid: "A1", desc: "X" })], [L({ fitid: "A1", desc: "Y" })]);
    assert.equal(r.repetidos, 1);
  });
});

describe("classificação sugerida", () => {
  const hist = [
    { desc: "PIX RECEBIDO 123", sign: "C", cpf: "12.345.678/0001-90", categoria: "Recebimento", unidade: "Tubarão", natureza: "", conta: "" },
    { desc: "TARIFA COBRANÇA 01", sign: "D", categoria: "Despesa", unidade: "Matriz", natureza: "Despesas Bancárias", conta: "565" },
    { desc: "TARIFA COBRANÇA 02", sign: "D", categoria: "Despesa", unidade: "Matriz", natureza: "Despesas Bancárias", conta: "565" },
    { desc: "PIX RECEBIDO 999", sign: "C", nome: "FULANO", categoria: "Recebimento", unidade: "Matriz" },
    { desc: "PIX RECEBIDO 888", sign: "C", nome: "BELTRANO", categoria: "Recebimento", unidade: "Chapecó" },
    { desc: "SUGESTAO ANTIGA", sign: "C", categoria: "Pagamento", unidade: "X", sugerido: true }
  ];
  const idx = E.criarIndice(hist);
  test("pelo CNPJ (com ou sem pontuação)", () => {
    assert.deepEqual(E.sugerir({ desc: "QUALQUER", sign: "C", cpf: "12345678000190" }, idx),
      { categoria: "Recebimento", unidade: "Tubarão", natureza: "", conta: "" });
  });
  test("pelo histórico, só quando é sempre igual", () => {
    assert.equal(E.sugerir({ desc: "TARIFA COBRANCA 77", sign: "D" }, idx).conta, "565");
    assert.equal(E.sugerir({ desc: "PIX RECEBIDO 555", sign: "C" }, idx), null);   // vai para unidades diferentes
  });
  test("sinal diferente não sugere; sugestão não confirmada não ensina", () => {
    assert.equal(E.sugerir({ desc: "TARIFA COBRANCA", sign: "C" }, idx), null);
    assert.equal(E.sugerir({ desc: "SUGESTAO ANTIGA", sign: "C" }, idx), null);
  });
});
