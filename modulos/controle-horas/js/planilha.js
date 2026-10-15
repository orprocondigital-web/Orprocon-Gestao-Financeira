/*
 * planilha.js — a planilha do cliente ("Folha de presença"): gerar (ExcelJS) e ler (SheetJS/XLSX).
 * Mesmo layout do modelo em Excel: uma aba por funcionário, dias nas linhas 8 a 38,
 * colunas C a H = Entrada, Saída intervalo, Volta intervalo, Saída, Ocorrência, Observação.
 * Testado em tests/horas.test.js (com as mesmas bibliotecas que o navegador usa).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./regras.js"));
  else root.HorasPlanilha = factory(root.HorasRegras);
})(typeof self !== "undefined" ? self : this, function (R) {
  "use strict";

  var MARCA = "modelo: folha-presenca v1";
  var IGNORAR = { "COMO PREENCHER": 1, "EMPRESA": 1, "EXEMPLO": 1 };
  var L0 = 8;          // linha do dia 1
  var AZUL = "FF2445B0", AZUL_CLARO = "FFE9EEFC", CINZA = "FFF3F5F8", LINHA = "FFCDD3DD", TINTA = "FF172033", ENTRADA = "FF1F4ED8", MUDO = "FF5F6A7D", ALERTA = "FFFBE9E7";
  var COLS = ["Dia", "Semana", "Entrada", "Saída intervalo", "Volta intervalo", "Saída", "Ocorrência", "Observação", "Total do dia"];
  var LARG = [17, 9, 11, 13, 13, 11, 14, 34, 11];

  function fonte(o) { return Object.assign({ name: "Arial", size: 10, color: { argb: TINTA } }, o || {}); }
  function preenchido(argb) { return { type: "pattern", pattern: "solid", fgColor: { argb: argb } }; }
  var borda = { top: { style: "thin", color: { argb: LINHA } }, left: { style: "thin", color: { argb: LINHA } }, bottom: { style: "thin", color: { argb: LINHA } }, right: { style: "thin", color: { argb: LINHA } } };

  /** Nome de aba válido no Excel (até 31 caracteres, sem : \ / ? * [ ]), sem repetir. */
  function nomeAba(nome, usados, i) {
    var base = (String(i).padStart(2, "0") + " " + String(nome || "Funcionário").replace(/[:\\\/\?\*\[\]]/g, " ").replace(/\s+/g, " ").trim()).slice(0, 31).trim();
    var n = base, k = 2;
    while (usados[n.toUpperCase()]) { n = (base.slice(0, 28) + " " + k++).trim(); }
    usados[n.toUpperCase()] = 1;
    return n;
  }

  /**
   * Gera a planilha do cliente. ExcelJS = a biblioteca; empresa = {nome, cnpj}; funcionarios = [{id, nome, funcao, quadro}];
   * mes = "2026-09". Devolve o Workbook (use wb.xlsx.writeBuffer()).
   */
  function gerar(ExcelJS, empresa, funcionarios, mes) {
    var wb = new ExcelJS.Workbook();
    wb.creator = "Orprocon"; wb.created = new Date();

    // --- Como preencher
    var w = wb.addWorksheet("Como preencher", { views: [{ showGridLines: false }], properties: { tabColor: { argb: MUDO } } });
    w.getColumn(1).width = 3; w.getColumn(2).width = 110;
    w.getCell("B2").value = "Folha de presença — " + (empresa.nome || ""); w.getCell("B2").font = fonte({ size: 16, bold: true, color: { argb: AZUL } });
    w.getCell("B3").value = "Mês de " + R.rotuloMes(mes) + ". Preencha e envie ao Departamento Pessoal da Orprocon no fim do mês."; w.getCell("B3").font = fonte({ size: 11, color: { argb: MUDO } });
    var linhas = [
      ["Uma aba para cada funcionário", true],
      ["As abas já vêm com o nome de cada funcionário. Preencha os horários de cada dia, como na folha de papel: Entrada, Saída para o intervalo, Volta do intervalo e Saída.", false],
      ["• Horário com dois pontos: 09:00, 12:30, 18:05.", false],
      ["• Dia sem intervalo (ex.: sábado de manhã): preencha só Entrada e Saída.", false],
      ["• Saiu depois da meia-noite? Use a hora normal (ex.: entrou 22:00, saiu 02:00): a planilha entende que virou o dia.", false],
      ["• Falta, atestado, folga, feriado, férias ou suspensão: escolha na coluna Ocorrência e deixe os horários em branco.", false],
      ["• A coluna Total do dia é calculada sozinha, para conferir. Fica vermelha se faltar um horário ou se passar de 10 horas.", false],
      ["", false],
      ["Funcionário novo ou que saiu?", true],
      ["Avise o Departamento Pessoal: a próxima planilha já vem atualizada. Não mude o nome das abas nem os títulos das colunas.", false],
      ["", false],
      ["A folha de papel assinada pelo funcionário continua valendo: guarde-a normalmente.", false]
    ];
    linhas.forEach(function (l, i) { var c = w.getCell("B" + (5 + i)); c.value = l[0]; c.font = fonte({ size: 11, bold: l[1] }); });
    w.getCell("B" + (5 + linhas.length + 2)).value = MARCA; w.getCell("B" + (5 + linhas.length + 2)).font = fonte({ size: 8, color: { argb: "FF9AA3B2" } });

    // --- Empresa
    var e = wb.addWorksheet("Empresa", { views: [{ showGridLines: false }], properties: { tabColor: { argb: AZUL } } });
    e.getColumn(1).width = 22; e.getColumn(2).width = 46;
    e.getCell("A1").value = "Empresa"; e.getCell("A1").font = fonte({ size: 14, bold: true, color: { argb: AZUL } });
    var y = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
    [["Empresa", empresa.nome || ""], ["CNPJ", empresa.cnpj || ""], ["Mês de referência", new Date(Date.UTC(y, m - 1, 1))], ["Preenchido por", ""], ["Telefone / WhatsApp", ""]].forEach(function (p, i) {
      var a = e.getCell(4 + i, 1), b = e.getCell(4 + i, 2);
      a.value = p[0]; a.font = fonte({ bold: true }); a.fill = preenchido(AZUL_CLARO); a.border = borda;
      b.value = p[1]; b.font = fonte({ size: 11, color: { argb: ENTRADA } }); b.border = borda;
    });
    e.getCell("B6").numFmt = "mm/yyyy";

    // --- uma aba por funcionário
    var usados = { "COMO PREENCHER": 1, "EMPRESA": 1 };
    (funcionarios.length ? funcionarios : [{ id: "", nome: "", funcao: "", quadro: "" }]).forEach(function (f, i) {
      folha(wb, nomeAba(f.nome, usados, i + 1), f);
    });
    return wb;
  }

  function folha(wb, aba, f) {
    var ws = wb.addWorksheet(aba, {
      views: [{ showGridLines: false, state: "frozen", xSplit: 2, ySplit: L0 - 1 }],
      properties: { tabColor: { argb: AZUL } },
      pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
    });
    LARG.forEach(function (l, i) { ws.getColumn(i + 1).width = l; });
    ws.getCell("A1").value = "Folha de presença"; ws.getCell("A1").font = fonte({ size: 14, bold: true, color: { argb: AZUL } });
    ws.getCell("E1").value = { formula: 'IF(Empresa!$B$4="","",Empresa!$B$4)' }; ws.getCell("E1").font = fonte({ color: { argb: MUDO } });
    ws.getCell("E2").value = { formula: 'IF(Empresa!$B$6="","",CHOOSE(MONTH(Empresa!$B$6),"Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro")&"/"&YEAR(Empresa!$B$6))' };
    ws.getCell("E2").font = fonte({ bold: true });
    [["Funcionário", f.nome], ["Função", f.funcao], ["Quadro de horário", f.quadro]].forEach(function (p, i) {
      var r = 3 + i, a = ws.getCell(r, 1);
      a.value = p[0]; a.font = fonte({ bold: true }); a.fill = preenchido(AZUL_CLARO); a.border = borda;
      ws.mergeCells(r, 2, r, 9);
      var b = ws.getCell(r, 2); b.value = p[1] || ""; b.font = fonte({ size: 11, color: { argb: ENTRADA } }); b.border = borda;
    });
    ws.getCell("K1").value = "id:" + (f.id || "");
    ws.getColumn(11).hidden = true;
    var cab = ws.getRow(L0 - 1); cab.height = 30;
    COLS.forEach(function (t, j) {
      var c = cab.getCell(j + 1); c.value = t; c.font = fonte({ bold: true, color: { argb: "FFFFFFFF" } }); c.fill = preenchido(AZUL); c.border = borda;
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    var ult = L0 + 30;
    for (var n = 1; n <= 31; n++) {
      var r = L0 + n - 1, row = ws.getRow(r);
      row.getCell(1).value = { formula: 'IF(Empresa!$B$6="","",IF(' + n + '>DAY(EOMONTH(Empresa!$B$6,0)),"",DATE(YEAR(Empresa!$B$6),MONTH(Empresa!$B$6),' + n + ')))' };
      row.getCell(2).value = { formula: 'IF(A' + r + '="","",CHOOSE(WEEKDAY(A' + r + '),"Dom","Seg","Ter","Qua","Qui","Sex","Sáb"))' };
      row.getCell(9).value = { formula: 'IF(AND(C' + r + '="",F' + r + '=""),"",IF(D' + r + '="",IF(OR(C' + r + '="",F' + r + '=""),0,MOD(F' + r + '-C' + r + ',1)),IF(C' + r + '="",0,MOD(D' + r + '-C' + r + ',1))+IF(OR(E' + r + '="",F' + r + '=""),0,MOD(F' + r + '-E' + r + ',1))))' };
      for (var j = 1; j <= 9; j++) {
        var c = row.getCell(j);
        c.border = borda;
        c.font = fonte({ color: { argb: j >= 3 && j <= 8 ? ENTRADA : TINTA } });
        if (j !== 7 && j !== 8) c.alignment = { horizontal: "center" };
        if (j >= 3 && j <= 6) {
          c.numFmt = "hh:mm";
          c.dataValidation = { type: "decimal", operator: "between", allowBlank: true, formulae: [0, 0.99931], showErrorMessage: true, errorTitle: "Horário inválido", error: "Digite o horário com dois pontos, ex.: 09:00." };
        }
        if (j === 7) c.dataValidation = { type: "list", allowBlank: true, formulae: ['"' + R.OCORRENCIAS.join(",") + '"'], showErrorMessage: true, errorTitle: "Ocorrência", error: "Escolha uma opção da lista." };
      }
      row.getCell(1).numFmt = "dd/mm";
      row.getCell(9).numFmt = "[h]:mm";
    }
    var rt = ult + 2;
    ws.getCell(rt, 8).value = "Total do mês"; ws.getCell(rt, 8).font = fonte({ bold: true }); ws.getCell(rt, 8).alignment = { horizontal: "right" };
    var t = ws.getCell(rt, 9); t.value = { formula: "SUM(I" + L0 + ":I" + ult + ")" }; t.numFmt = "[h]:mm"; t.font = fonte({ bold: true }); t.alignment = { horizontal: "center" }; t.border = borda;
    ws.addConditionalFormatting({ ref: "A" + L0 + ":H" + ult, rules: [{ type: "expression", formulae: ['OR($B' + L0 + '="Sáb",$B' + L0 + '="Dom")'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: CINZA } } } }] });
    ws.addConditionalFormatting({ ref: "I" + L0 + ":I" + ult, rules: [{ type: "expression",
      formulae: ['OR(AND($C' + L0 + '<>"",$F' + L0 + '=""),AND($C' + L0 + '="",$F' + L0 + '<>""),AND($D' + L0 + '<>"",$E' + L0 + '=""),AND($D' + L0 + '="",$E' + L0 + '<>""),AND(I' + L0 + '<>"",I' + L0 + '>TIME(10,0,0)))'],
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: ALERTA } } } }] });
    ws.pageSetup.printTitlesRow = (L0 - 1) + ":" + (L0 - 1);
    return ws;
  }

  // ---------------------------------------------------------------- leitura

  function mesDoSerial(XLSX, v) {
    if (v instanceof Date) return v.getUTCFullYear() + "-" + String(v.getUTCMonth() + 1).padStart(2, "0");
    if (typeof v === "number" && XLSX && XLSX.SSF) { var d = XLSX.SSF.parse_date_code(v); if (d) return d.y + "-" + String(d.m).padStart(2, "0"); }
    var s = String(v || "").match(/(\d{1,2})\/(\d{4})/);
    return s ? s[2] + "-" + s[1].padStart(2, "0") : "";
  }

  function ocorrencia(v) {
    var s = R.normalizarNome(v);
    if (!s) return "";
    for (var i = 0; i < R.OCORRENCIAS.length; i++) if (R.normalizarNome(R.OCORRENCIAS[i]) === s) return R.OCORRENCIAS[i];
    if (s === "SUSPENSO" || s === "SUSPENSAO") return "Suspensão";
    if (s === "FERIAS") return "Férias";
    return "?" + String(v).trim();
  }

  /**
   * Lê a planilha preenchida (workbook do SheetJS). Devolve
   * {empresa, cnpj, mes, folhas:[{aba, id, nome, funcao, quadro, dias:{n:{e1,s1,e2,s2,oc,obs}}, avisos:[]}], avisos:[]}.
   */
  function ler(XLSX, wb) {
    var out = { empresa: "", cnpj: "", mes: "", folhas: [], avisos: [] };
    var emp = wb.Sheets.Empresa || wb.Sheets.EMPRESA;
    if (emp) {
      var er = XLSX.utils.sheet_to_json(emp, { header: 1, raw: true, defval: null });
      out.empresa = String((er[3] || [])[1] || "").trim();
      out.cnpj = String((er[4] || [])[1] || "").trim();
      out.mes = mesDoSerial(XLSX, (er[5] || [])[1]);
    }
    wb.SheetNames.forEach(function (aba) {
      if (IGNORAR[R.normalizarNome(aba)]) return;
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: true, defval: null });
      var cab = (rows[L0 - 2] || []).map(function (x) { return R.normalizarNome(x); });
      if (cab[2] !== "ENTRADA" || cab[5] !== "SAIDA") { out.avisos.push("Aba \"" + aba + "\" ignorada: não está no formato da folha de presença."); return; }
      var nome = String((rows[2] || [])[1] || "").trim();
      var idCel = String((rows[0] || [])[10] || "");
      var f = { aba: aba, id: idCel.indexOf("id:") === 0 ? idCel.slice(3) : "", nome: nome, funcao: String((rows[3] || [])[1] || "").trim(),
        quadro: String((rows[4] || [])[1] || "").trim(), dias: {}, avisos: [] };
      var algum = false;
      for (var n = 1; n <= 31; n++) {
        var lin = rows[L0 - 1 + n - 1] || [];
        var d = { e1: R.paraMin(lin[2]), s1: R.paraMin(lin[3]), e2: R.paraMin(lin[4]), s2: R.paraMin(lin[5]), oc: ocorrencia(lin[6]), obs: String(lin[7] === null || lin[7] === undefined ? "" : lin[7]).trim() };
        ["e1", "s1", "e2", "s2"].forEach(function (k, j) {
          if (typeof d[k] === "number" && isNaN(d[k])) { f.avisos.push("Dia " + n + ": horário \"" + lin[2 + j] + "\" não reconhecido."); d[k] = null; }
        });
        if (d.oc.charAt(0) === "?") { f.avisos.push("Dia " + n + ": ocorrência \"" + d.oc.slice(1) + "\" não reconhecida."); d.oc = ""; }
        var vazio = d.e1 === null && d.s1 === null && d.e2 === null && d.s2 === null && !d.oc && !d.obs;
        if (!vazio) { f.dias[n] = d; algum = true; }
      }
      if (!nome && !algum) return;   // aba sobrando, em branco
      if (!nome) f.avisos.push("Aba sem o nome do funcionário.");
      out.folhas.push(f);
    });
    if (!out.folhas.length) out.avisos.push("Nenhuma folha preenchida encontrada na planilha.");
    return out;
  }

  return { MARCA: MARCA, gerar: gerar, ler: ler, nomeAba: nomeAba, mesDoSerial: mesDoSerial, ocorrencia: ocorrencia };
});
