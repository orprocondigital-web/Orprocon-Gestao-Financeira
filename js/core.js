/*
 * core.js — regras de negócio do sistema, sem DOM e sem localStorage.
 *
 * Tudo aqui é função pura: recebe dados, devolve dados. Por isso roda igual
 * no navegador (window.Core) e no Node (require), e é o que os testes cobrem.
 *
 * Convenção de valores: todo lançamento guarda { valorNum, sign }, onde
 * valorNum é sempre positivo e sign é "C" (crédito, entrou dinheiro) ou
 * "D" (débito, saiu dinheiro). Comparações de dinheiro são feitas em
 * centavos inteiros para evitar erro de ponto flutuante (0.1 + 0.2).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- valores

  /** "1.234,56" / "1234.56" / "-1,20" → número. Texto inválido → NaN. */
  function parseValor(raw) {
    if (raw === null || raw === undefined || raw === "") return NaN;
    if (typeof raw === "number") return raw;
    var s = String(raw).trim().replace(/[^\d,.\-]/g, "");
    if (!s || s === "-") return NaN;
    var temVirgula = s.indexOf(",") > -1;
    var pontos = (s.match(/\./g) || []).length;
    if (temVirgula) {
      // padrão brasileiro: ponto é milhar, vírgula é decimal
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (pontos > 1) {
      // "1.234.567" sem vírgula: todos os pontos são milhar
      s = s.replace(/\./g, "");
    }
    var n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }

  /**
   * Célula de extrato/planilha → { valorNum, sign } ou null. Aceita "5.514,70C", "-1,20D", -1.2.
   * Valor terminado em "*" ("3.640,00*") é depósito bloqueado no Sicoob: volta com bloqueado: true.
   */
  function parseValorCell(v) {
    if (v === null || v === undefined || v === "") return null;
    var s = String(v).trim().replace(/["']/g, "");
    var bloqueado = /\*$/.test(s);
    if (bloqueado) s = s.replace(/\*+$/, "").trim();
    var invalido = typeof v === "string" && !valorBemFormado(s);
    var sign = null;
    var ultimo = s.slice(-1).toUpperCase();
    if (ultimo === "C" || ultimo === "D") {
      sign = ultimo;
      s = s.slice(0, -1);
    }
    var n = parseValor(s);
    if (isNaN(n)) return null;
    if (!sign) sign = n < 0 ? "D" : "C";
    var r = { valorNum: Math.abs(n), sign: sign };
    if (bloqueado) r.bloqueado = true;
    if (invalido) r.invalido = true;
    return r;
  }

  /**
   * Texto de valor digitado dentro de um padrão reconhecível: "1.234,56", "1234,56", "1234.56", "-0,12".
   * Fora do padrão ("2.29598", "8,934,48", "-0,12,00"): a planilha antiga gravava esses como 0 ou
   * 100× maiores no TXT. Aqui eles são marcados como inválidos para alguém corrigir.
   */
  function valorBemFormado(texto) {
    var s = String(texto).trim().replace(/^R\$\s*/i, "").replace(/[CD]$/i, "").replace(/\s+/g, "");
    return /^-?\d+(,\d+)?$/.test(s) || /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+\.\d{1,2}$/.test(s);
  }

  function toCents(n) { return Math.round(Number(n) * 100); }

  /** 1234.5 → "1.234,50" */
  function formatBR(n) {
    var neg = n < 0;
    var partes = Math.abs(n).toFixed(2).split(".");
    var inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + inteiro + "," + partes[1];
  }

  // ------------------------------------------------------------------ datas

  function pad2(x) { return String(x).padStart(2, "0"); }

  function isoValida(y, m, d) {
    y = +y; m = +m; d = +d;
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return "";
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return ""; // ex.: 31/02
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  /** Data do Excel (serial), Date, "DD/MM/AAAA", "DD/MM/AA" ou "AAAA-MM-DD" → "AAAA-MM-DD" ou "". */
  function toIsoDate(v) {
    if (v instanceof Date && !isNaN(v)) {
      return isoValida(v.getFullYear(), v.getMonth() + 1, v.getDate());
    }
    if (typeof v === "number" && isFinite(v) && v > 0) {
      var dt = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return isoValida(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    if (typeof v === "string") {
      var s = v.trim().replace(/["']/g, "").split(/\s+/)[0]; // descarta hora
      var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) return isoValida(m[1], m[2], m[3]);
      m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
      if (m) return isoValida(m[3].length === 2 ? "20" + m[3] : m[3], m[2], m[1]);
    }
    return "";
  }

  /** "2026-08-03" → "03/08/2026" */
  function brDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso;
  }

  function diasEntre(isoA, isoB) {
    var a = Date.parse(isoA + "T00:00:00Z"), b = Date.parse(isoB + "T00:00:00Z");
    return Math.round(Math.abs(a - b) / 86400000);
  }

  // ------------------------------------------------- planilhas e cabeçalhos

  // Ordem importa: o primeiro campo que casar fica com a coluna.
  // Teste começando com "=" exige o texto exato do cabeçalho.
  var HEADER_MAP = [
    { field: "dataMov", tests: ["data movimento"] },
    { field: "data", tests: ["=data"] },
    { field: "modelo", tests: ["modelo doc"] },
    { field: "natureza", tests: ["natureza"] },
    { field: "desc", tests: ["descrição", "descricao", "hist", "lança", "favorecido"] },
    { field: "doc", tests: ["doc.", "doc", "nro", "número"] },
    { field: "valor", tests: ["=valor", "valor", "saída", "entrada", "débito", "crédito"] },
    { field: "categoria", tests: ["categoria"] },
    { field: "unidade", tests: ["unidade"] },
    { field: "conta", tests: ["=conta"] },
    { field: "codigo", tests: ["cod", "cód"] },
    { field: "nome", tests: ["nome", "fornecedor/cliente", "razão", "razao", "cliente", "fornecedor"] },
    { field: "cpf", tests: ["cpf/cnpj", "cpf", "cnpj"] }
  ];

  /** Índice da linha de cabeçalho (a que tem "data" e "valor"/"descrição"/"histórico"). */
  function detectHeaderRow(rows) {
    for (var i = 0; i < Math.min(rows.length, 30); i++) {
      var linha = (rows[i] || []).map(function (c) { return String(c || "").toLowerCase(); }).join("|");
      if (linha.indexOf("data") > -1 &&
          (linha.indexOf("valor") > -1 || linha.indexOf("descri") > -1 || linha.indexOf("hist") > -1)) return i;
    }
    return 0;
  }

  function casa(texto, teste) {
    return teste.charAt(0) === "=" ? texto === teste.slice(1) : texto.indexOf(teste) > -1;
  }

  /**
   * Cabeçalho → { campo: índiceDaColuna }. Cada coluna atende um campo só.
   * "Data" só casa com o texto exato para não pegar "Data Movimento" nem "Índice Diário".
   * Nome: uma coluna com "razão" ou "nome" vence outra que só diz "cliente"/"fornecedor".
   */
  function buildColumnMap(headerRow) {
    var map = {}, usadas = {};
    (headerRow || []).forEach(function (h, idx) {
      var text = String(h || "").toLowerCase().trim();
      if (!text) return;
      for (var f = 0; f < HEADER_MAP.length; f++) {
        var spec = HEADER_MAP[f];
        if (usadas[idx]) break;
        var bate = spec.tests.some(function (t) { return casa(text, t); });
        if (!bate) continue;
        if (map[spec.field] === undefined) { map[spec.field] = idx; usadas[idx] = true; }
        else if (spec.field === "nome" && /raz[aã]o|nome/.test(text) && !/raz[aã]o|nome/.test(String(headerRow[map.nome]).toLowerCase())) {
          map.nome = idx; usadas[idx] = true;
        }
      }
    });
    if (map.data === undefined) {
      // planilhas com "Data do lançamento", "Data Mov." etc.
      (headerRow || []).some(function (h, idx) {
        var t = String(h || "").toLowerCase().trim();
        if (!usadas[idx] && t.indexOf("data") === 0 && t.indexOf("movimento") < 0) { map.data = idx; return true; }
        return false;
      });
    }
    return map;
  }

  function soDigitos(s) { return String(s || "").replace(/\D/g, ""); }
  function normaliza(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  }

  /**
   * Escolhe a aba certa de uma planilha para uma conta do sistema.
   * Ordem: nome exato → nome sem acento/espaços → número da conta dentro do
   * nome da aba → se o arquivo só tem uma aba, usa ela. Nada disso → null.
   */
  function findSheet(sheetNames, item) {
    var alvo = normaliza(item.sheetName || item.label);
    var achou = sheetNames.filter(function (sn) { return sn === item.sheetName; })[0] ||
                sheetNames.filter(function (sn) { return normaliza(sn) === alvo; })[0];
    if (achou) return achou;
    var conta = soDigitos(item.conta);
    if (conta.length >= 3) {
      var porConta = sheetNames.filter(function (sn) { return soDigitos(sn).indexOf(conta) > -1; });
      if (porConta.length === 1) return porConta[0];
    }
    return sheetNames.length === 1 ? sheetNames[0] : null;
  }

  function ehSaldo(desc) { return /^\s*saldo\b/i.test(desc || ""); }

  /**
   * Linhas de planilha (array de arrays) → lançamentos do extrato.
   * Linhas de saldo ("SALDO DO DIA", "SALDO ANTERIOR") não são movimentação e ficam de fora.
   */
  function parseExtratoRows(rows) {
    var headerIdx = detectHeaderRow(rows);
    var col = buildColumnMap(rows[headerIdx]);
    if (col.data === undefined || col.valor === undefined) {
      return { ok: false, erro: "Não encontrei colunas de Data e Valor no arquivo.", itens: [] };
    }
    var itens = [];
    for (var r = headerIdx + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var data = toIsoDate(row[col.data]);
      var v = parseValorCell(row[col.valor]);
      var desc = col.desc !== undefined ? String(row[col.desc] || "").trim() : "";
      if (!data || !v || ehSaldo(desc)) continue;
      itens.push({
        data: data,
        doc: col.doc !== undefined ? String(row[col.doc] || "").trim() : "",
        desc: desc,
        valorNum: v.valorNum,
        sign: v.sign,
        detalhes: [],
        texto: row.join(" ")
      });
    }
    return { ok: true, itens: itens };
  }

  // ----------------------------------------------------------- extrato Sicoob

  var RE_LANC = /^(\d{2}\/\d{2}\/\d{4})\s+(.*?)\s+(-?[\d.]+,\d{2})([CD])\*?\s*$/;
  var RE_CNPJ = /\d{2}\.\d{3}\.\d{3}[\s\/]?\d{4}-\d{2}/;
  var RE_CPF = /[\d*]{3}\.\d{3}\.\d{3}-[\d*]{2}/;

  function pareceSicoobTxt(texto) {
    return /SICOOB/i.test(texto.slice(0, 2000)) && /EXTRATO CONTA CORRENTE/i.test(texto.slice(0, 2000));
  }

  /**
   * Extrato .txt do Sicoob (SISBR, largura fixa) → lançamentos.
   * Cada lançamento pode ter linhas de complemento abaixo dele, recuadas —
   * no Pix vêm "Recebimento Pix", o nome do pagador e o CPF/CNPJ.
   */
  function parseSicoobTxt(texto) {
    var linhas = String(texto).replace(/\r/g, "").split("\n");
    var colHist = 32;
    linhas.some(function (l) {
      var i = l.toUpperCase().indexOf("HISTÓRICO");
      if (/^DATA\s+DOCUMENTO/i.test(l) && i > 0) { colHist = i; return true; }
      return false;
    });

    var itens = [], saldos = [], atual = null;
    linhas.forEach(function (l) {
      var m = l.match(RE_LANC);
      if (m) {
        var inicioValor = l.lastIndexOf(m[3]);
        var doc = l.slice(10, colHist).trim();
        var hist = l.slice(colHist, inicioValor).trim() || m[2].trim();
        var v = parseValorCell(m[3] + m[4]);
        var lanc = { data: toIsoDate(m[1]), doc: doc, desc: hist, valorNum: v.valorNum, sign: v.sign, detalhes: [] };
        if (ehSaldo(hist)) { saldos.push(lanc); atual = null; }
        else { itens.push(lanc); atual = lanc; }
        return;
      }
      // complemento: linha recuada logo abaixo de um lançamento
      if (atual && /^\s{20,}\S/.test(l)) { atual.detalhes.push(l.trim()); return; }
      atual = null; // qualquer outra linha (tracejado, cabeçalho de página, resumo) encerra o bloco
    });

    itens.forEach(function (it) {
      var docId = "", nome = "";
      for (var i = 0; i < it.detalhes.length; i++) {
        var d = it.detalhes[i];
        var cnpj = d.match(RE_CNPJ), cpf = d.match(RE_CPF);
        if (cnpj || cpf) {
          docId = (cnpj || cpf)[0];
          if (i > 0 && !/^(recebimento|pagamento) pix$/i.test(it.detalhes[i - 1])) nome = it.detalhes[i - 1];
          break;
        }
      }
      it.cpfCnpj = docId;
      it.nome = nome;
      it.texto = [it.data, it.doc, it.desc].concat(it.detalhes).join(" ");
    });
    return { ok: true, itens: itens, saldos: saldos };
  }

  /** Bytes de arquivo texto → string. Tenta UTF-8; se não for, usa Windows-1252 (comum em bancos). */
  function decodeText(bytes) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch (e) { return new TextDecoder("windows-1252").decode(bytes); }
  }

  /** Texto CSV/TXT genérico → linhas (array de arrays). */
  function textToRows(texto) {
    return String(texto).replace(/\r/g, "").split("\n").map(function (l) {
      if (l.indexOf(";") > -1) return l.split(";");
      if (l.indexOf("\t") > -1) return l.split("\t");
      if (l.indexOf(",") > -1 && l.split(",").length > 3) return l.split(",");
      var cols = l.trim().split(/\s{2,}/);
      return cols.length > 1 ? cols : [l];
    });
  }

  /** Ponto de entrada: conteúdo textual de um extrato → lançamentos. */
  function parseExtratoTexto(texto) {
    if (pareceSicoobTxt(texto)) {
      var r = parseSicoobTxt(texto);
      r.formato = "Sicoob TXT";
      return r;
    }
    var g = parseExtratoRows(textToRows(texto));
    g.formato = "genérico";
    return g;
  }

  // ------------------------------------------------------------- conciliação

  /**
   * Cruza extrato x sistema.
   *   1ª passada: mesma data, mesmo valor, mesmo sinal            → "ok"
   *   2ª passada: mesmo valor e sinal, data até N dias de diferença → "data_diferente"
   *   Sobras do extrato → "so_extrato"   (o banco mostra, ninguém lançou)
   *   Sobras do sistema → "so_sistema"   (foi lançado, o banco não mostra)
   * Cada lançamento casa no máximo uma vez.
   */
  function conciliar(extrato, sistema, opcoes) {
    var tolerancia = (opcoes && opcoes.toleranciaDias !== undefined) ? opcoes.toleranciaDias : 3;
    var ext = extrato.map(function (e, i) { return { i: i, item: e, cents: toCents(e.valorNum), par: null, status: null }; });
    var sis = sistema.map(function (s, i) { return { i: i, item: s, cents: toCents(s.valorNum), usado: false }; });

    function passada(aceita, status) {
      ext.forEach(function (e) {
        if (e.par) return;
        var melhor = null, melhorDist = Infinity;
        sis.forEach(function (s) {
          if (s.usado || s.cents !== e.cents || s.item.sign !== e.item.sign) return;
          var dist = diasEntre(s.item.data, e.item.data);
          if (aceita(dist) && dist < melhorDist) { melhor = s; melhorDist = dist; }
        });
        if (melhor) { melhor.usado = true; e.par = melhor; e.status = status; }
      });
    }
    passada(function (d) { return d === 0; }, "ok");
    if (tolerancia > 0) passada(function (d) { return d <= tolerancia; }, "data_diferente");

    var linhas = ext.map(function (e) {
      return { status: e.par ? e.status : "so_extrato", extrato: e.item, sistema: e.par ? e.par.item : null };
    });
    sis.forEach(function (s) {
      if (!s.usado) linhas.push({ status: "so_sistema", extrato: null, sistema: s.item });
    });

    var resumo = { ok: 0, data_diferente: 0, so_extrato: 0, so_sistema: 0, totalExtratoCents: 0, totalSistemaCents: 0 };
    linhas.forEach(function (l) { resumo[l.status]++; });
    extrato.forEach(function (e) { resumo.totalExtratoCents += (e.sign === "D" ? -1 : 1) * toCents(e.valorNum); });
    sistema.forEach(function (s) { resumo.totalSistemaCents += (s.sign === "D" ? -1 : 1) * toCents(s.valorNum); });
    resumo.diferencaCents = resumo.totalExtratoCents - resumo.totalSistemaCents;
    resumo.fechado = resumo.so_extrato === 0 && resumo.so_sistema === 0;
    return { linhas: linhas, resumo: resumo };
  }

  // --------------------------------------------------------------- exportação

  var COLUNAS_EXPORT = [
    ["data", "Data"], ["dataMov", "Data Movimento"], ["desc", "Descrição/Histórico"], ["doc", "Doc."],
    ["valor", "Valor"], ["categoria", "Categoria"], ["unidade", "Unidade"],
    ["nome", "Fornecedor/Cliente"], ["cpf", "CPF/CNPJ"],
    ["modelo", "Modelo DOC"], ["natureza", "Natureza do gasto"], ["conta", "Conta"]
  ];

  function celulaExport(e, campo) {
    if (campo === "data" || campo === "dataMov") return brDate(e[campo]);
    if (campo === "valor") return formatBR(e.valorNum) + e.sign;
    return e[campo] || "";
  }

  /** Lançamentos → CSV no padrão do Excel brasileiro (";" e BOM para acentos). */
  function toCSV(entries, comDataMov) {
    var cols = COLUNAS_EXPORT.filter(function (c) { return comDataMov || c[0] !== "dataMov"; });
    var esc = function (v) {
      v = String(v);
      return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var linhas = [cols.map(function (c) { return c[1]; }).join(";")];
    entries.forEach(function (e) {
      linhas.push(cols.map(function (c) { return esc(celulaExport(e, c[0])); }).join(";"));
    });
    return "\uFEFF" + linhas.join("\r\n");
  }

  /** Lançamentos → texto com tabulação, para colar direto no Excel. */
  function toTSV(entries, comDataMov) {
    var cols = COLUNAS_EXPORT.filter(function (c) { return comDataMov || c[0] !== "dataMov"; });
    return entries.map(function (e) {
      return cols.map(function (c) { return String(celulaExport(e, c[0])).replace(/[\t\n]/g, " "); }).join("\t");
    }).join("\n");
  }

  return {
    parseValor: parseValor, parseValorCell: parseValorCell, valorBemFormado: valorBemFormado, toCents: toCents, formatBR: formatBR,
    toIsoDate: toIsoDate, brDate: brDate, diasEntre: diasEntre,
    HEADER_MAP: HEADER_MAP, detectHeaderRow: detectHeaderRow, buildColumnMap: buildColumnMap,
    findSheet: findSheet, parseExtratoRows: parseExtratoRows,
    pareceSicoobTxt: pareceSicoobTxt, parseSicoobTxt: parseSicoobTxt,
    decodeText: decodeText, textToRows: textToRows, parseExtratoTexto: parseExtratoTexto,
    conciliar: conciliar, toCSV: toCSV, toTSV: toTSV
  };
});
