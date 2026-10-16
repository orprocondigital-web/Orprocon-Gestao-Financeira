// ISS Tubarão: leitor do XML do Meu ISS (movimento_economico) e os meses importados. Dados fictícios.
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const L = require("../modulos/iss-tubarao/js/leitor.js");
const D = require("../modulos/iss-tubarao/js/dados.js");

function xml(notas, tomador) {
  tomador = tomador || "<tomador><cpf_cnpj>00.000.000/0001-01</cpf_cnpj><razao_social>Cliente Exemplo &amp; Cia</razao_social><cmc>900001</cmc></tomador>";
  return '<?xml version="1.0" encoding="UTF-8"?><movimento_economico>' + tomador + notas.join("") + "</movimento_economico>";
}
function nota(o) {
  o = Object.assign({ numero: "1", tipo: "TOMADOR", situacao: "N", data: "2026-09-10", valor: "1000,00", base: "1000,00", iss: "30,00", liq: "", ir: "0,00", pis: "0,00", cofins: "0,00", csll: "0,00", inss: "0,00" }, o);
  return '<nota numero="' + o.numero + '"><prestador><cpf_cnpj>00000000000202</cpf_cnpj><razao_social><![CDATA[Prestador Exemplo <ME>]]></razao_social></prestador>' +
    "<tipo_nota>" + o.tipo + "</tipo_nota><situacao>" + o.situacao + "</situacao><rps>10</rps><data_emissao>" + o.data + "</data_emissao>" +
    "<cidade_prestacao>Tubarão</cidade_prestacao><nome_atividade>Serviço exemplo</nome_atividade><valor_nota>" + o.valor + "</valor_nota>" +
    "<base_calculo>" + o.base + "</base_calculo><valor_iss>" + o.iss + "</valor_iss>" + (o.liq ? "<valor_liquido>" + o.liq + "</valor_liquido>" : "") +
    "<valor_ir>" + o.ir + "</valor_ir><valor_pis>" + o.pis + "</valor_pis><valor_cofins>" + o.cofins + "</valor_cofins><valor_csll>" + o.csll + "</valor_csll><valor_inss>" + o.inss + "</valor_inss></nota>";
}

describe("leitor do XML do Meu ISS", () => {
  test("números: vírgula ou ponto decimal, milhar, negativo", () => {
    const av = [];
    assert.equal(L.numero("1.234,56"), 1234.56);
    assert.equal(L.numero("1234.56"), 1234.56);
    assert.equal(L.numero("1234,5"), 1234.5);
    assert.equal(L.numero("1.234.567"), 1234567);
    assert.equal(L.numero("1,234.50"), 1234.5);
    assert.equal(L.numero("(10,00)"), -10);
    assert.equal(L.numero(""), 0);
    assert.equal(L.numero("1.500", av, "Valor"), 1.5);
    assert.match(av[0], /Valor "1.500".*Confira/);
    assert.equal(L.numero("abc", av), 0);
    assert.equal(av.length, 2);
  });
  test("datas em vários formatos", () => {
    assert.equal(L.data("2026-09-15T10:00:00"), "2026-09-15");
    assert.equal(L.data("15/09/2026 08:00"), "2026-09-15");
    assert.equal(L.data("20260915"), "2026-09-15");
    assert.equal(L.data("set/26"), "");
  });
  test("lê empresa, notas, ISS retido (tomador), federais; cancelada sai", () => {
    const r = L.ler(xml([
      nota({ numero: "1" }),
      nota({ numero: "2", valor: "8.000,00", base: "8.000,00", iss: "400,00", ir: "120,00", pis: "52,00", cofins: "240,00", csll: "80,00" }),
      nota({ numero: "3", situacao: "CANCELADA" }),
      nota({ numero: "4", valor: "500.00", base: "500.00", iss: "15.00", data: "20/09/2026" })
    ]), "a.xml");
    assert.deepEqual(r.empresa, { cnpj: "00000000000101", nome: "Cliente Exemplo & Cia", cmc: "900001" });
    assert.equal(r.mes, "2026-09");
    assert.equal(r.canceladas, 1);
    assert.deepEqual(r.notas.map((n) => n.numero), ["1", "2", "4"]);
    const n2 = r.notas[1];
    assert.equal(n2.prestadorNome, "Prestador Exemplo <ME>", "CDATA");
    assert.deepEqual([n2.issRetido, n2.federal, n2.totalRetido], [400, 492, 892]);
    assert.equal(r.notas[2].valor, 500, "ponto decimal");
    const t = L.totais(r.notas);
    assert.deepEqual([t.notas, t.valor, t.issRetido, t.federal, t.comFederal], [3, 9500, 445, 492, 1]);
  });
  test("conferências: alíquota, base, líquido, tomada sem ISS", () => {
    const r = L.ler(xml([
      nota({ numero: "1", iss: "70,00" }),
      nota({ numero: "2", base: "1.200,00", iss: "36,00" }),
      nota({ numero: "3", liq: "1.000,00", ir: "15,00" }),
      nota({ numero: "4", iss: "0,00" }),
      nota({ numero: "5", liq: "955,00", ir: "15,00" })
    ]));
    const a = (i) => r.notas[i].alertas.join(" | ");
    assert.match(a(0), /Alíquota de ISS fora de 2% a 5% \(7,00%\)/);
    assert.match(a(1), /Base de cálculo maior/);
    assert.match(a(2), /Valor líquido \(1.000,00\) diferente de valor − retenções \(955,00\)/);
    assert.match(a(3), /Nota tomada sem ISS/);
    assert.equal(a(4), "", "líquido que fecha não alerta");
  });
  test("tipo de nota desconhecido e meses misturados viram aviso; ISS de nota prestada não é retido", () => {
    const r = L.ler(xml([nota({ tipo: "PRESTADOR", iss: "30,00" }), nota({ numero: "2", tipo: "OUTRO", data: "2026-08-30" }), nota({ numero: "3" })]));
    assert.equal(r.notas[0].issRetido, 0);
    assert.equal(r.notas[1].issRetido, 0);
    assert.ok(r.avisos.some((x) => /Tipo de nota "OUTRO"/.test(x)));
    assert.ok(r.avisos.some((x) => /mais de um mês: 2026-08, 2026-09/.test(x)));
    assert.equal(r.mes, "2026-09");
  });
  test("arquivo que não é o do Meu ISS", () => {
    assert.throws(() => L.ler('<?xml version="1.0"?><nfeProc></nfeProc>', "nota.xml"), /nota.xml: não é o XML do Movimento Econômico/);
    assert.throws(() => L.ler("isto não é xml"), /Não parece um arquivo XML/);
  });
});

describe("meses importados", () => {
  test("importa por empresa (CMC), substitui no mesmo mês, avisa mês diferente, remove", () => {
    const e = D.estadoVazio();
    const lido = L.ler(xml([nota({})]), "a.xml");
    const r1 = D.importar(e, "2026-09", lido, { quem: "Pessoa Exemplo" });
    assert.deepEqual([r1.chave, r1.substituiu], ["cmc:900001", false]);
    const r2 = D.importar(e, "2026-09", L.ler(xml([nota({}), nota({ numero: "2" })]), "b.xml"));
    assert.equal(r2.substituiu, true);
    assert.equal(e.meses["2026-09"]["cmc:900001"].notas.length, 2);
    D.importar(e, "2026-10", lido);
    assert.match(e.meses["2026-10"]["cmc:900001"].avisos[0], /notas são de setembro\/2026.*outubro\/2026/);
    D.marcarConferida(e, "2026-09", "cmc:900001", true);
    const res = D.resumoMes(e, "2026-09");
    assert.deepEqual([res.geral.empresas, res.geral.conferidas, res.geral.notas], [1, 1, 2]);
    D.remover(e, "2026-10", "cmc:900001");
    assert.deepEqual(D.mesesComDados(e), ["2026-09"]);
    assert.throws(() => D.importar(e, "2026-09", L.ler(xml([nota({})], "<tomador><razao_social>Sem id</razao_social></tomador>"))), /sem CMC nem CNPJ/);
  });
  test("exemplo: 3 empresas fictícias, tira só o exemplo", () => {
    const e = D.estadoVazio();
    D.importar(e, "2026-09", L.ler(xml([nota({})]), "real.xml"));
    const r = D.exemplo(e, "2026-09");
    assert.equal(r.empresas, 3);
    const res = D.resumoMes(e, "2026-09");
    assert.equal(res.geral.empresas, 4);
    assert.ok(res.geral.alertas >= 2);
    assert.ok(D.temExemplo(e));
    assert.equal(D.removerExemplo(e), 3);
    assert.deepEqual(Object.keys(e.empresas), ["cmc:900001"]);
    assert.equal(D.resumoMes(e, "2026-09").geral.empresas, 1);
    D.limparTudo(e);
    assert.deepEqual([e.empresas, e.meses], [{}, {}]);
  });
});
