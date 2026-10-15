// Controle de horas: regras em modulos/controle-horas/js/regras.js. Nomes fictícios.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../modulos/controle-horas/js/regras.js");

const h = (s) => R.paraMin(s);
const dia = (e1, s1, e2, s2, oc) => ({ e1: h(e1), s1: h(s1), e2: h(e2), s2: h(s2), oc: oc || "" });
const regras = (mais) => Object.assign(R.regrasPadrao(), mais || {});

describe("horários", () => {
  test("lê os formatos que o cliente escreve", () => {
    assert.equal(R.paraMin("09:00"), 540);
    assert.equal(R.paraMin("9:00"), 540);
    assert.equal(R.paraMin("0900"), 540);
    assert.equal(R.paraMin("900"), 540);
    assert.equal(R.paraMin(1830), 1110);
    assert.equal(R.paraMin("18h"), 1080);
    assert.equal(R.paraMin("18h30"), 1110);
    assert.equal(R.paraMin(0.375), 540, "fração do Excel");
    assert.equal(R.paraMin("24:00"), 0);
    assert.equal(R.paraMin(""), null);
    assert.equal(R.paraMin(" — "), null);
    assert.ok(isNaN(R.paraMin("25:00")));
    assert.ok(isNaN(R.paraMin("abc")));
    assert.equal(R.fmt(125), "2:05");
    assert.equal(R.fmt(-30), "-0:30");
    assert.equal(R.fmtHora(545), "09:05");
  });
});

describe("um dia", () => {
  const seg = 1, carga8 = 480;
  test("dia normal: 8h, sem extra nem atraso", () => {
    const r = R.calcularDia(dia("09:00", "12:30", "13:30", "18:00"), carga8, false, seg, regras());
    assert.deepEqual([r.trabalhado, r.extra, r.atraso, r.alertas.length], [480, 0, 0, 0]);
  });
  test("tolerância de 10 min por dia: 18:05 e 18:10 não contam; 18:11 conta inteiro", () => {
    assert.equal(R.calcularDia(dia("09:00", "12:30", "13:30", "18:05"), carga8, false, seg, regras()).extra, 0);
    assert.equal(R.calcularDia(dia("09:00", "12:30", "13:30", "18:10"), carga8, false, seg, regras()).extra, 0);
    assert.equal(R.calcularDia(dia("09:00", "12:30", "13:30", "18:11"), carga8, false, seg, regras()).extra, 11);
    assert.equal(R.calcularDia(dia("09:00", "12:30", "13:30", "18:05"), carga8, false, seg, regras({ toleranciaDia: 0 })).extra, 5);
    assert.equal(R.calcularDia(dia("09:15", "12:30", "13:30", "18:00"), carga8, false, seg, regras()).atraso, 15);
  });
  test("faixas: 2h a 50%, o resto na 2ª faixa", () => {
    const rg = regras(); rg.he["1"] = { ate: 120, pct1: 50, pct2: 70 };
    const r = R.calcularDia(dia("09:00", "12:30", "13:30", "21:00"), carga8, false, seg, rg);
    assert.equal(r.extra, 180);
    assert.deepEqual(r.extras, { 50: 120, 70: 60 });
    assert.ok(r.alertas.some((a) => /extras no dia/.test(a)));
  });
  test("domingo e feriado: tudo é extra a 100%", () => {
    const dom = R.calcularDia(dia("08:00", "", "", "12:00"), 0, false, 0, regras());
    assert.deepEqual([dom.tipo, dom.extra, dom.extras[100]], ["0", 240, 240]);
    const fer = R.calcularDia(dia("09:00", "12:00", "13:00", "15:00"), carga8, true, 3, regras());
    assert.deepEqual([fer.tipo, fer.carga, fer.extras[100]], ["F", 0, 300]);
  });
  test("sábado sem intervalo (um período só)", () => {
    const r = R.calcularDia(dia("08:30", "", "", "12:30"), 240, false, 6, regras());
    assert.deepEqual([r.trabalhado, r.extra, r.atraso], [240, 0, 0]);
  });
  test("adicional noturno com hora reduzida, inclusive virando a meia-noite", () => {
    const r = R.calcularDia(dia("22:00", "02:00", "02:30", "05:00"), 420, false, seg, regras());
    assert.equal(r.trabalhado, 390);
    assert.equal(r.noturno, 390);
    assert.equal(r.noturnoReduzido, 446, "390 min × 60/52,5");
    const cheia = regras(); cheia.noturno = Object.assign({}, cheia.noturno, { reduzida: false });
    assert.equal(R.calcularDia(dia("21:00", "", "", "23:00"), 0, false, seg, cheia).noturnoReduzido, 60);
  });
  test("ocorrências: falta conta, atestado abona, sem registro avisa", () => {
    const f = R.calcularDia(dia("", "", "", "", "Falta"), carga8, false, seg, regras());
    assert.deepEqual([f.falta, f.atraso, f.alertas.length], [1, 0, 0]);
    const a = R.calcularDia(dia("", "", "", "", "Atestado"), carga8, false, seg, regras());
    assert.deepEqual([a.falta, a.atraso, a.abonado, a.alertas.length], [0, 0, true, 0]);
    const v = R.calcularDia(dia(), carga8, false, seg, regras());
    assert.deepEqual(v.alertas, ["Sem registro"]);
    const folgaDom = R.calcularDia(dia(), 0, false, 0, regras());
    assert.equal(folgaDom.alertas.length, 0);
  });
  test("alertas de marcação e intervalo", () => {
    assert.ok(R.calcularDia(dia("09:00", "12:30", "13:30", ""), carga8, false, seg, regras()).alertas.includes("Marcação incompleta"));
    assert.ok(R.calcularDia(dia("09:00", "", "", "17:00"), carga8, false, seg, regras()).alertas.includes("Jornada acima de 6h sem intervalo"));
    assert.ok(R.calcularDia(dia("09:00", "12:30", "13:00", "17:30"), carga8, false, seg, regras()).alertas.some((x) => /Intervalo de 0:30/.test(x)));
    assert.ok(R.calcularDia({ e1: NaN, s2: 600 }, carga8, false, seg, regras()).alertas.includes("Horário inválido"));
  });
});

describe("o mês", () => {
  const func = { id: "f1", nome: "Maria Exemplo", carga: R.cargaDeTextos(["08:00", "08:00", "08:00", "08:00", "08:00", "04:00", "00:00"]) };
  test("setembro/2026: feriado de 7/9, sábados de 4h, domingos de folga", () => {
    const dias = {};
    for (let d = 1; d <= 30; d++) {
      const ds = R.diaSemana(R.dataIso("2026-09", d));
      if (ds === 0 || d === 7) continue;
      dias[d] = ds === 6 ? dia("08:30", "", "", "12:30") : dia("09:00", "12:30", "13:30", d === 10 ? "19:30" : "18:00");
    }
    dias[17] = dia("", "", "", "", "Atestado");
    const fer = R.feriadosNacionais(2026);
    const m = R.calcularMes({ dias }, func, "2026-09", fer, R.regrasPadrao());
    assert.equal(m.dias.length, 30);
    assert.equal(m.dias[6].feriado, "Independência do Brasil");
    assert.equal(m.totais.extra, 90);
    assert.deepEqual(m.totais.extras, { 50: 90 });
    assert.equal(m.totais.atestados, 1);
    assert.equal(m.totais.semRegistro, 0);
    assert.equal(m.totais.alertas, 0);
  });
  test("descanso entre jornadas menor que 11h gera alerta", () => {
    const dias = { 1: dia("14:00", "", "", "23:30"), 2: dia("07:00", "", "", "12:00") };
    const m = R.calcularMes({ dias }, func, "2026-09", [], R.regrasPadrao());
    assert.ok(m.dias[1].alertas.some((x) => /Descanso de 7:30/.test(x)));
  });
  test("compensar atrasos tira das horas extras de menor percentual", () => {
    const dias = { 1: dia("09:00", "12:30", "13:30", "19:00"), 2: dia("09:30", "12:30", "13:30", "18:00") };
    const rg = R.regrasPadrao(); rg.compensarAtrasos = true;
    const m = R.calcularMes({ dias }, func, "2026-09", [], rg);
    assert.deepEqual([m.totais.extra, m.totais.atraso, m.totais.atrasoCompensado], [30, 0, 30]);
  });
});

describe("feriados e cadastro", () => {
  test("feriados nacionais calculados pela Páscoa", () => {
    const f = R.feriadosNacionais(2026);
    assert.ok(f.some((x) => x.data === "2026-04-03" && /Paixão/.test(x.nome)));
    assert.ok(f.some((x) => x.data === "2026-06-04" && /Corpus/.test(x.nome)));
    assert.equal(R.feriadosNacionais(2027).find((x) => /Paixão/.test(x.nome)).data, "2027-03-26");
  });
  test("carga por dia e nomes", () => {
    const c = R.cargaDeTextos(["08:00", "08:00", "08:00", "08:00", "08:00", "04:00", ""]);
    assert.deepEqual(c, [0, 480, 480, 480, 480, 480, 240]);
    assert.deepEqual(R.textosDeCarga(c), ["08:00", "08:00", "08:00", "08:00", "08:00", "04:00", "00:00"]);
    assert.equal(R.normalizarNome("  Izabel   da  Conceição "), "IZABEL DA CONCEICAO");
  });
});

// Planilha do cliente: gerar (ExcelJS) e ler (SheetJS). Só roda se as bibliotecas estiverem instaladas
// (npm install exceljs xlsx --no-save); o navegador as carrega da CDN.
const P = require("../modulos/controle-horas/js/planilha.js");
function lib(nome) {
  for (const p of [nome, (process.env.HORAS_LIBS || "") + "/" + nome]) { try { return require(p); } catch (e) {} }
  return null;
}
const ExcelJS = lib("exceljs"), XLSX = lib("xlsx");
describe("planilha do cliente", { skip: !(ExcelJS && XLSX) && "exceljs/xlsx não instalados" }, () => {
  test("gera uma aba por funcionário e lê de volta o que o cliente preencheu", async () => {
    const funcs = [{ id: "f1", nome: "Maria Exemplo", funcao: "Vendedora", quadro: "Seg a sex 9h-18h" },
      { id: "f2", nome: "João Exemplo: Filial/Centro", funcao: "Estoquista" }];
    const wb = P.gerar(ExcelJS, { nome: "Comércio Exemplo Ltda", cnpj: "11.222.333/0001-81" }, funcs, "2026-09");
    assert.deepEqual(wb.worksheets.map((w) => w.name), ["Como preencher", "Empresa", "01 Maria Exemplo", "02 João Exemplo  Filial Centro".replace(/\s+/g, " ")]);
    // o cliente preenche
    const ws = wb.getWorksheet("01 Maria Exemplo");
    ws.getCell("C8").value = 0.375; ws.getCell("D8").value = 0.5208333333; ws.getCell("E8").value = "13:30"; ws.getCell("F8").value = "1805";
    ws.getCell("C12").value = "08:30"; ws.getCell("F12").value = "12:30";
    ws.getCell("G14").value = "feriado"; ws.getCell("H14").value = "Independência";
    ws.getCell("C15").value = "25:99";
    ws.getCell("G16").value = "SUSPENSO";
    const buf = await wb.xlsx.writeBuffer();
    if (process.env.HORAS_SALVAR) require("fs").writeFileSync(process.env.HORAS_SALVAR, Buffer.from(buf));
    const lido = P.ler(XLSX, XLSX.read(buf, { type: "buffer" }));
    assert.equal(lido.empresa, "Comércio Exemplo Ltda");
    assert.equal(lido.mes, "2026-09");
    assert.equal(lido.folhas.length, 2);
    const m = lido.folhas[0];
    assert.deepEqual([m.id, m.nome, m.funcao], ["f1", "Maria Exemplo", "Vendedora"]);
    assert.deepEqual(m.dias[1], { e1: 540, s1: 750, e2: 810, s2: 1085, oc: "", obs: "" });
    assert.deepEqual([m.dias[5].e1, m.dias[5].s1, m.dias[5].s2], [510, null, 750]);
    assert.deepEqual([m.dias[7].oc, m.dias[7].obs], ["Feriado", "Independência"]);
    assert.equal(m.dias[9].oc, "Suspensão");
    assert.ok(m.avisos.some((a) => /Dia 8: horário "25:99"/.test(a)));
    assert.equal(lido.folhas[1].id, "f2");
    assert.deepEqual(lido.folhas[1].dias, {});
  });
  test("sem cadastro: abas em branco; o cliente escreve o nome e a importação cadastra", async () => {
    const wb = P.gerar(ExcelJS, { nome: "Cliente Exemplo Ltda" }, [], "2026-09", { emBranco: 3 });
    assert.deepEqual(wb.worksheets.map((w) => w.name).slice(2), ["01 Funcionário", "02 Funcionário", "03 Funcionário"]);
    const ws = wb.getWorksheet("02 Funcionário");
    ws.getCell("B3").value = "Paula Exemplo"; ws.getCell("B4").value = "Auxiliar";
    ws.getCell("C8").value = "08:00"; ws.getCell("F8").value = "17:00";
    const buf = await wb.xlsx.writeBuffer();
    const lido = P.ler(XLSX, XLSX.read(buf, { type: "buffer" }));
    const cheias = lido.folhas.filter((f) => Object.keys(f.dias).length);
    assert.deepEqual(cheias.map((f) => [f.nome, f.funcao]), [["Paula Exemplo", "Auxiliar"]]);
    const D = require("../modulos/controle-horas/js/dados.js");
    const e = D.estadoVazio(), emp = D.salvarEmpresa(e, { nome: "Cliente Exemplo Ltda" }, 2026);
    const r = D.aplicarImportacao(e, emp.id, "2026-09", lido);
    assert.deepEqual([r.importadas, r.criados, r.ignoradas], [1, ["Paula Exemplo"], []], "abas que sobraram em branco não atrapalham");
    // com cadastro: nomes + abas extras em branco
    const wb2 = P.gerar(ExcelJS, { nome: "X" }, [{ id: "f1", nome: "Maria Exemplo" }], "2026-09", { emBranco: 2 });
    assert.deepEqual(wb2.worksheets.map((w) => w.name).slice(2), ["01 Maria Exemplo", "02 Funcionário", "03 Funcionário"]);
  });
  test("nome de aba: até 31 caracteres, sem repetir", () => {
    const usados = {};
    assert.equal(P.nomeAba("Maria", usados, 1), "01 Maria");
    const longo = P.nomeAba("Fulano de Tal da Silva Sauro Pereira", usados, 2);
    assert.ok(longo.length <= 31);
    assert.equal(P.mesDoSerial(XLSX, 46266), "2026-09");
  });
});

const H = require("../modulos/controle-horas/js/dados.js");
describe("cadastro, meses e importação", () => {
  function base() {
    const e = H.estadoVazio();
    const emp = H.salvarEmpresa(e, { nome: "Comércio Exemplo Ltda", cnpj: "x" }, 2026);
    H.salvarFuncionario(emp, { nome: "Maria Exemplo", funcao: "Vendedora" });
    return { e, emp };
  }
  test("empresa nova vem com regras padrão e feriados do ano; nomes não repetem", () => {
    const { e, emp } = base();
    assert.equal(emp.regras.toleranciaDia, 10);
    assert.ok(emp.feriados.some((f) => f.data === "2026-09-07"));
    assert.throws(() => H.salvarEmpresa(e, { nome: "comercio exemplo LTDA" }), /Já existe/);
    assert.throws(() => H.salvarFuncionario(emp, { nome: " maria  exemplo " }), /Já existe/);
    assert.deepEqual(emp.funcionarios[0].carga, H.CARGA_PADRAO);
  });
  test("vários funcionários de uma vez (nome; função)", () => {
    const { emp } = base();
    const r = H.adicionarVarios(emp, "João Exemplo; Estoquista\n\nMaria Exemplo\nPedro Exemplo");
    assert.deepEqual([r.criados, r.repetidos], [2, ["Maria Exemplo"]]);
    assert.equal(emp.funcionarios.find((f) => f.nome === "João Exemplo").funcao, "Estoquista");
  });
  test("importação liga pelo id, depois pelo nome, e cadastra quem não existe", () => {
    const { e, emp } = base();
    const maria = emp.funcionarios[0];
    const lido = { mes: "2026-08", folhas: [
      { aba: "01 Maria", id: maria.id, nome: "Maria (nome mudado)", dias: { 1: { e1: 540, s1: 750, e2: 810, s2: 1080, oc: "", obs: "" } }, avisos: [] },
      { aba: "02 João", id: "", nome: "João Novo", funcao: "Caixa", dias: { 2: { oc: "Folga" } }, avisos: ["Dia 3: horário não reconhecido."] },
      { aba: "Func 03", id: "", nome: "", dias: { 2: {} }, avisos: [] },
      { aba: "04 Rita", id: "", nome: "Rita Exemplo", dias: {}, avisos: [] }] };
    const r = H.aplicarImportacao(e, emp.id, "2026-09", lido, { arquivo: "x.xlsx" });
    assert.deepEqual([r.importadas, r.criados, r.ignoradas, r.emBranco], [2, ["João Novo"], ["Func 03"], ["Rita Exemplo"]]);
    assert.ok(!emp.funcionarios.some((f) => f.nome === "Rita Exemplo"), "aba em branco não cadastra ninguém");
    assert.ok(/agosto\/2026/.test(r.avisos[0]));
    const m = H.mesDe(e, emp.id, "2026-09");
    assert.equal(m.folhas[maria.id].dias[1].s2, 1080);
    assert.equal(m.importacoes.length, 1);
  });
  test("editar dia tira a revisão; mês fechado não aceita mudança e guarda as regras", () => {
    const { e, emp } = base();
    const f = emp.funcionarios[0];
    H.marcarRevisada(e, emp.id, "2026-09", f.id, true);
    H.atualizarDia(e, emp.id, "2026-09", f.id, 1, { e1: 540, s2: 1080 });
    assert.equal(H.folhaDe(e, emp.id, "2026-09", f.id).revisada, false);
    H.atualizarDia(e, emp.id, "2026-09", f.id, 1, { e1: null, s2: null });
    assert.deepEqual(H.folhaDe(e, emp.id, "2026-09", f.id).dias, {}, "dia vazio some");
    H.fecharMes(e, emp.id, "2026-09", "u1");
    emp.regras.toleranciaDia = 0;
    assert.equal(H.resumoMes(e, emp.id, "2026-09").regras.toleranciaDia, 10, "mês fechado usa as regras do fechamento");
    assert.throws(() => H.atualizarDia(e, emp.id, "2026-09", f.id, 2, { e1: 1 }), /fechado/);
    assert.throws(() => H.aplicarImportacao(e, emp.id, "2026-09", { folhas: [] }), /fechado/);
    H.reabrirMes(e, emp.id, "2026-09");
    assert.equal(H.resumoMes(e, emp.id, "2026-09").regras.toleranciaDia, 0);
  });
  test("exemplo: empresa fictícia com mês importado e resumo calculado", () => {
    const e = H.estadoVazio();
    const r = H.exemplo(e, new Date(2026, 9, 15));
    assert.equal(r.mes, "2026-09");
    const res = H.resumoMes(e, r.empresa.id, r.mes);
    assert.equal(res.linhas.length, 4);
    assert.equal(res.geral.comFolha, 4);
    assert.equal(res.geral.revisadas, 1);
    assert.ok(res.geral.extra > 0 && res.geral.noturno > 0 && res.geral.alertas > 0);
    assert.ok(res.pcts.includes(50));
    H.exemplo(e, new Date(2026, 9, 15));
    assert.equal(e.empresas.length, 1, "rodar de novo não duplica");
  });
  test("remover exemplo tira só o fictício; limpar tudo zera o módulo", () => {
    const e = H.estadoVazio();
    const real = H.salvarEmpresa(e, { nome: "Cliente Real Exemplo" }, 2026);
    H.salvarFuncionario(real, { nome: "Fulano Exemplo" });
    const ex = H.exemplo(e, new Date(2026, 9, 15));
    assert.ok(H.temExemplo(e));
    assert.equal(H.removerExemplo(e), 1);
    assert.deepEqual(e.empresas.map((x) => x.nome), ["Cliente Real Exemplo"]);
    assert.equal(e.meses[ex.empresa.id], undefined);
    assert.ok(!H.temExemplo(e));
    H.limparTudo(e);
    assert.deepEqual([e.empresas, e.meses], [[], {}]);
  });
});
