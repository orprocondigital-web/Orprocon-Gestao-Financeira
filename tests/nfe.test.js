const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const N = require("../js/nfe.js");
const C = require("../js/conciliacao.js");

const EMPRESA = "11222333000144";
let seq = 0;
function nfe({ emit, emitNome, dest = EMPRESA, destNome = "EMPRESA TESTE LTDA", numero, data, vNF, dups = [], tpNF = "1", cStat = "100", prefixo = "" }) {
  seq++;
  const chave = ("4226" + "0".repeat(40) + seq).slice(-44);
  const p = prefixo;
  const cobr = dups.length ? `<${p}cobr><${p}fat><${p}nFat>${numero}</${p}nFat></${p}fat>` + dups.map((d) =>
    `<${p}dup><${p}nDup>${d[0]}</${p}nDup><${p}dVenc>${d[1]}</${p}dVenc><${p}vDup>${d[2].toFixed(2)}</${p}vDup></${p}dup>`).join("") + `</${p}cobr>` : "";
  return { chave, xml: `<?xml version="1.0" encoding="UTF-8"?><${p}nfeProc xmlns${p ? ":" + p.slice(0, -1) : ""}="http://www.portalfiscal.inf.br/nfe" versao="4.00"><${p}NFe><${p}infNFe Id="NFe${chave}" versao="4.00">
<${p}ide><${p}mod>55</${p}mod><${p}serie>1</${p}serie><${p}nNF>${numero}</${p}nNF><${p}dhEmi>${data}T10:00:00-03:00</${p}dhEmi><${p}tpNF>${tpNF}</${p}tpNF></${p}ide>
<${p}emit><${p}CNPJ>${emit}</${p}CNPJ><${p}xNome>${emitNome}</${p}xNome></${p}emit>
<${p}dest><${p}CNPJ>${dest}</${p}CNPJ><${p}xNome>${destNome}</${p}xNome></${p}dest>
<${p}det nItem="1"><${p}prod><${p}CFOP>5102</${p}CFOP></${p}prod></${p}det>
<${p}total><${p}ICMSTot><${p}vNF>${vNF.toFixed(2)}</${p}vNF></${p}ICMSTot></${p}total>${cobr}
</${p}infNFe></${p}NFe><${p}protNFe><${p}infProt><${p}chNFe>${chave}</${p}chNFe><${p}cStat>${cStat}</${p}cStat></${p}infProt></${p}protNFe></${p}nfeProc>` };
}
const cancelamento = (chave) => `<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe"><evento><infEvento Id="ID110111${chave}01"><chNFe>${chave}</chNFe><tpEvento>110111</tpEvento></infEvento></evento></procEventoNFe>`;

const n1 = nfe({ emit: "12345678000190", emitNome: "METALURGICA SANTOS LTDA", numero: "1001", data: "2026-06-20", vNF: 3200, dups: [["001", "2026-07-01", 3200]] });
const n2 = nfe({ emit: "23456789000101", emitNome: "ACO FORTE DISTRIBUIDORA LTDA", numero: "520", data: "2026-07-01", vNF: 12300, dups: [["1", "2026-07-22", 4100], ["2", "2026-08-21", 4100], ["3", "2026-09-20", 4100]] });
const n3 = nfe({ emit: "34567890000112", emitNome: "TINTAS COLOR &amp; CIA LTDA", numero: "77", data: "2026-07-02", vNF: 1000, prefixo: "nfe:" });   // à vista, sem parcelas, com prefixo de namespace
const n4 = nfe({ emit: "90123456000178", emitNome: "USINAGEM PRECISAO LTDA", numero: "123", data: "2026-07-10", vNF: 2300, dups: [["001", "2026-07-29", 2300]] });
const n5 = nfe({ emit: EMPRESA, emitNome: "EMPRESA TESTE LTDA", dest: "55666777000188", destNome: "CLIENTE BETA SA", numero: "9001", data: "2026-07-05", vNF: 8300, dups: [["001", "2026-07-08", 8300]] });
const n6 = nfe({ emit: "45678901000123", emitNome: "TRANSPORTES RAPIDO LTDA", numero: "3301", data: "2026-07-01", vNF: 2450, dups: [["001", "2026-07-04", 2450]] });

describe("leitura do XML", () => {
  test("nota com parcelas, nota à vista com prefixo de namespace, evento de cancelamento", () => {
    const a = N.lerXml(n2.xml).nota;
    assert.deepEqual([a.numero, a.emit.doc, a.dest.doc, a.vNF, a.duplicatas.length, a.duplicatas[1].venc], ["520", "23456789000101", EMPRESA, 12300, 3, "2026-08-21"]);
    const b = N.lerXml(n3.xml).nota;
    assert.deepEqual([b.emit.nome, b.duplicatas.length, b.data], ["TINTAS COLOR & CIA LTDA", 0, "2026-07-02"]);
    assert.deepEqual(N.lerXml(cancelamento(n6.chave)), { tipo: "cancelamento", chaves: [n6.chave] });
    assert.equal(N.lerXml("<qualquer/>").tipo, "outro");
  });
  test("empresa provável: quem mais recebe as notas (compras) ou mais emite (vendas)", () => {
    const l = N.lerVarios([n1.xml, n2.xml, n3.xml, n5.xml]);
    assert.equal(N.empresaProvavel(l.notas, "pagamentos").doc, EMPRESA);
    assert.equal(N.empresaProvavel(l.notas, "recebimentos").doc, EMPRESA);
  });
});

describe("títulos para a conciliação", () => {
  const lidos = N.lerVarios([n1.xml, n2.xml, n3.xml, n4.xml, n5.xml, n6.xml, cancelamento(n6.chave), n1.xml]);
  test("compras viram títulos a pagar por parcela; cancelada e repetida ficam fora", () => {
    const r = N.titulosDasNotas(lidos, EMPRESA, "pagamentos");
    assert.equal(lidos.notas.length, 6);                 // n1 repetido conta uma vez
    assert.deepEqual([r.titulos.length, r.canceladas, r.fora], [6, 1, 1]);   // 1+3+1+1; transportes cancelada; venda fora
    const aco = r.titulos.filter((t) => t.nome.startsWith("ACO FORTE"));
    assert.deepEqual(aco.map((t) => [t.data, t.valorNum, t.doc]), [
      ["2026-07-22", 4100, "NF 520 parc. 1/3"], ["2026-08-21", 4100, "NF 520 parc. 2/3"], ["2026-09-20", 4100, "NF 520 parc. 3/3"]]);
    assert.equal(aco[0].cpf, "23.456.789/0001-01");
    assert.ok(r.titulos.every((t) => t.sign === "D" && t.id));
  });
  test("vendas viram títulos a receber", () => {
    const r = N.titulosDasNotas(lidos, EMPRESA, "recebimentos");
    assert.deepEqual(r.titulos.map((t) => [t.nome, t.valorNum, t.sign]), [["CLIENTE BETA SA", 8300, "C"]]);
  });
  test("na conciliação: pagamento antecipado com o mesmo fornecedor casa até 30 dias; sem fornecedor no histórico, não", () => {
    const tit = N.titulosDasNotas(lidos, EMPRESA, "pagamentos").titulos;
    const ext = [
      { data: "2026-07-01", valorNum: 3200, sign: "D", desc: "LIQUIDACAO BOLETO 12345678000190 METALURGICA SANTOS LTDA" },
      { data: "2026-07-02", valorNum: 1000, sign: "D", desc: "LIQUIDACAO BOLETO 34567890000112 TINTAS COLOR LTDA" },
      { data: "2026-07-10", valorNum: 4100, sign: "D", desc: "LIQUIDACAO BOLETO 23456789000101 ACO FORTE DISTRIBUIDORA" },   // 12 dias antes do vencimento
      { data: "2026-07-15", valorNum: 2300, sign: "D", desc: "PAGAMENTO DIVERSOS" }                                         // 14 dias, sem fornecedor no histórico
    ];
    const r = C.conciliarAvulso(ext, tit, { toleranciaDias: 3 });
    const st = (n) => r.linhas.filter((l) => l.sistema && l.sistema.nome.startsWith(n)).map((l) => l.status);
    assert.deepEqual(st("METALURGICA"), ["ok"]);
    assert.deepEqual(st("TINTAS"), ["ok"]);
    assert.deepEqual(st("ACO FORTE").sort(), ["data_diferente", "so_sistema", "so_sistema"]);
    assert.deepEqual(st("USINAGEM"), ["so_sistema"]);
  });
});
