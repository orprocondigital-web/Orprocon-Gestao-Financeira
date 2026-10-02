/*
 * conciliacao.js — conciliação avulsa: extrato do banco × planilha de títulos
 * (contas pagas a fornecedores ou recebidas de clientes), sem conta cadastrada.
 *
 *  - lerPlanilhaTitulos: reconhece as colunas pelo nome e diz quais usou.
 *  - conciliarAvulso: casa cada título com um lançamento do extrato pelo valor e
 *    sinal, na data mais próxima dentro da tolerância; entre candidatos de mesmo
 *    valor, prefere o que tem o CNPJ ou o nome do fornecedor no histórico.
 *  - csvResultado: o resultado para abrir no Excel.
 *
 * Funções puras. Testadas em tests/conciliacao.test.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.Conciliacao = factory(root.Core);
})(typeof self !== "undefined" ? self : this, function (Core) {
  "use strict";

  function limpa(v) { return v === null || v === undefined ? "" : String(v).trim(); }
  function chave(s) { return limpa(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " "); }
  function soDigitos(s) { return limpa(s).replace(/\D/g, ""); }

  // Para cada campo, os cabeçalhos aceitos em ordem de preferência.
  var COLUNAS = {
    data: [/^data (de )?(pagamento|pagto|pgto|baixa|liquida|recebimento|credito|debito)/, /^(pagamento|pagto|pgto|baixa|dt\.? ?pagto|dt\.? ?pagamento|liquidacao)$/, /^data$/, /^dt\.?$/, /^data/, /vencimento|^venc\.?$/],
    valor: [/valor (pago|recebido|liquido|baixado|liquidado)/, /^(pago|recebido|vl\.? ?pago)$/, /^valor$/, /^vl\.?$/, /^valor/, /total/],
    doc: [/^(n[ºo°]?\.? ?)?(documento|doc\.?|nf|nfe|nf-e|nota( fiscal)?|titulo|duplicata|parcela)/, /^n[ºo°]\.?$/, /numero/],
    nome: [/^(?!.*(cnpj|cpf)).*(fornecedor|favorecido|razao|beneficiario|cliente|sacado|credor)/, /^nome/],
    cpf: [/cnpj|cpf/]
  };

  function detectarCabecalho(rows) {
    var melhor = 0, pontos = -1;
    for (var i = 0; i < Math.min(rows.length, 30); i++) {
      var cab = (rows[i] || []).map(chave), p = 0;
      Object.keys(COLUNAS).forEach(function (campo) {
        if (cab.some(function (c) { return c && COLUNAS[campo].some(function (re) { return re.test(c); }); })) p++;
      });
      if (p > pontos) { pontos = p; melhor = i; }
    }
    return melhor;
  }

  function escolherColunas(cabecalho) {
    var cab = cabecalho.map(chave), usadas = {}, mapa = {};
    ["valor", "data", "doc", "nome", "cpf"].forEach(function (campo) {
      for (var r = 0; r < COLUNAS[campo].length && mapa[campo] === undefined; r++) {
        for (var c = 0; c < cab.length; c++) {
          if (!usadas[c] && cab[c] && COLUNAS[campo][r].test(cab[c])) { mapa[campo] = c; usadas[c] = true; break; }
        }
      }
    });
    return mapa;
  }

  /**
   * Linhas da planilha → títulos. tipo: "pagamentos" (sinal D) ou "recebimentos" (sinal C).
   * Devolve { ok, erro?, colunas: { campo: nome do cabeçalho }, itens }.
   */
  function lerPlanilhaTitulos(rows, tipo) {
    var h = detectarCabecalho(rows), cab = (rows[h] || []).map(limpa), m = escolherColunas(cab);
    if (m.valor === undefined || m.data === undefined) {
      return { ok: false, erro: "Não encontrei as colunas de data e de valor na planilha (cabeçalho: " + cab.filter(Boolean).join(", ") + ").", itens: [] };
    }
    var sinal = tipo === "recebimentos" ? "C" : "D", itens = [];
    for (var r = h + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var data = Core.toIsoDate(row[m.data]);
      var v = Core.parseValorCell(row[m.valor]);
      if (!data || !v || Math.round(v.valorNum * 100) === 0) continue;
      itens.push({
        linha: r + 1, data: data, valorNum: v.valorNum, sign: sinal,
        doc: m.doc !== undefined ? limpa(row[m.doc]) : "",
        nome: m.nome !== undefined ? limpa(row[m.nome]) : "",
        cpf: m.cpf !== undefined ? limpa(row[m.cpf]) : "",
        desc: m.nome !== undefined ? limpa(row[m.nome]) : ""
      });
    }
    var colunas = {};
    Object.keys(m).forEach(function (k) { colunas[k] = cab[m[k]]; });
    return { ok: true, colunas: colunas, itens: itens };
  }

  // ------------------------------------------------------------- cruzamento

  var GENERICAS = { ltda: 1, me: 1, sa: 1, "s/a": 1, eireli: 1, epp: 1, de: 1, da: 1, do: 1, e: 1, comercio: 1, industria: 1, servicos: 1 };
  function palavras(s) {
    return chave(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter(function (p) { return p.length >= 3 && !GENERICAS[p]; });
  }

  /** O histórico do extrato fala deste fornecedor? CNPJ (ou raiz do CNPJ) ou duas palavras do nome. */
  function nomeConfere(extrato, titulo) {
    var texto = chave([extrato.desc, extrato.nome, extrato.cpf, extrato.texto].concat(extrato.detalhes || []).join(" "));
    var dig = soDigitos(texto), doc = soDigitos(titulo.cpf);
    if (doc.length >= 11 && (dig.indexOf(doc) > -1 || (doc.length === 14 && dig.indexOf(doc.slice(0, 8)) > -1))) return true;
    var p = palavras(titulo.nome);
    if (!p.length) return false;
    var achadas = p.filter(function (x) { return texto.indexOf(x) > -1; }).length;
    return achadas >= Math.min(2, p.length);
  }

  function diasEntre(a, b) { return Math.round(Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000); }

  /**
   * Cruza extrato × títulos. Só entram do extrato os lançamentos do mesmo sinal dos títulos.
   * Casamento: mesmo valor em centavos e mesmo sinal, data até `toleranciaDias` de diferença;
   * entre candidatos, ganha o que tem o fornecedor no histórico, depois a data mais próxima.
   * Status: "ok" (mesma data), "data_diferente", "so_extrato", "so_sistema" (só na planilha).
   */
  function conciliarAvulso(extrato, titulos, opcoes) {
    var tol = opcoes && opcoes.toleranciaDias !== undefined ? opcoes.toleranciaDias : 3;
    var sinal = titulos.length ? titulos[0].sign : "D";
    var ext = extrato.filter(function (e) { return e.sign === sinal; });
    var ignorados = extrato.length - ext.length;

    var pares = [];
    titulos.forEach(function (t, ti) {
      var c = Math.round(t.valorNum * 100);
      ext.forEach(function (e, ei) {
        if (Math.round(e.valorNum * 100) !== c) return;
        var d = diasEntre(e.data, t.data);
        if (d > tol) return;
        var confere = nomeConfere(e, t);
        pares.push({ ti: ti, ei: ei, d: d, confere: confere, peso: (confere ? 0 : 1000) + d * 10 });
      });
    });
    pares.sort(function (a, b) { return a.peso - b.peso || a.ti - b.ti || a.ei - b.ei; });

    var usadoT = {}, usadoE = {}, linhas = [];
    pares.forEach(function (p) {
      if (usadoT[p.ti] || usadoE[p.ei]) return;
      usadoT[p.ti] = usadoE[p.ei] = true;
      linhas.push({ status: p.d === 0 ? "ok" : "data_diferente", extrato: ext[p.ei], sistema: titulos[p.ti], nomeConfere: p.confere });
    });
    ext.forEach(function (e, i) { if (!usadoE[i]) linhas.push({ status: "so_extrato", extrato: e, sistema: null }); });
    titulos.forEach(function (t, i) { if (!usadoT[i]) linhas.push({ status: "so_sistema", extrato: null, sistema: t }); });

    var r = { ok: 0, data_diferente: 0, so_extrato: 0, so_sistema: 0, totalExtratoCents: 0, totalSistemaCents: 0, ignorados: ignorados };
    linhas.forEach(function (l) { r[l.status]++; });
    ext.forEach(function (e) { r.totalExtratoCents += Math.round(e.valorNum * 100); });
    titulos.forEach(function (t) { r.totalSistemaCents += Math.round(t.valorNum * 100); });
    r.diferencaCents = r.totalExtratoCents - r.totalSistemaCents;
    r.fechado = r.so_extrato === 0 && r.so_sistema === 0;
    return { linhas: linhas, resumo: r };
  }

  // ------------------------------------------------------------- conciliação manual

  function cents(v) { return Math.round(Number(v) * 100); }

  /** Chave estável de um lançamento do extrato (repetições idênticas ganham #2, #3…). */
  function chaveExtrato(e) {
    return ["E", e.data, cents(e.valorNum), e.sign, limpa(e.doc), chave(e.desc).replace(/[^a-z0-9]/g, "")].join("|");
  }
  /** Chave de um lançamento do sistema (pelo id) ou de um título da planilha (pela linha). */
  function chaveSistema(s) {
    if (s.id) return "S|id:" + s.id;
    return ["P", s.linha || "", s.data, cents(s.valorNum), s.sign, limpa(s.doc), chave(s.nome || s.desc).replace(/[^a-z0-9]/g, "")].join("|");
  }
  function chavesUnicas(lista, base) {
    var cont = {};
    return lista.map(function (i) { var k = base(i); cont[k] = (cont[k] || 0) + 1; return k + "#" + cont[k]; });
  }

  /**
   * Separa o que foi conciliado à mão. grupos: [{ ext: [chaves], sis: [chaves], tipo: "manual"|"justificado", obs }].
   * Devolve o que sobra para a conciliação automática e uma linha por grupo:
   * { status, extratos: [...], sistemas: [...], diferencaCents, obs, grupo }.
   * Chaves que não existem mais (extrato trocado, lançamento apagado) são ignoradas.
   */
  function separarManuais(extrato, sistema, grupos, chavesE, chavesS) {
    var kE = chavesE || chavesUnicas(extrato, chaveExtrato), kS = chavesS || chavesUnicas(sistema, chaveSistema);
    var porE = {}, porS = {}, usados = {};
    extrato.forEach(function (e, i) { porE[kE[i]] = e; });
    sistema.forEach(function (s, i) { porS[kS[i]] = s; });
    var linhas = [];
    (grupos || []).forEach(function (g, gi) {
      var ex = (g.ext || []).filter(function (k) { return porE[k] && !usados[k]; });
      var si = (g.sis || []).filter(function (k) { return porS[k] && !usados[k]; });
      if (!ex.length && !si.length) return;
      ex.concat(si).forEach(function (k) { usados[k] = true; });
      var assin = function (x) { return (x.sign === "D" ? -1 : 1) * cents(x.valorNum); };
      var somaE = ex.reduce(function (a, k) { return a + assin(porE[k]); }, 0);
      var somaS = si.reduce(function (a, k) { return a + assin(porS[k]); }, 0);
      linhas.push({ status: g.tipo === "justificado" ? "justificado" : "manual", grupo: gi, obs: limpa(g.obs),
        extratos: ex.map(function (k) { return porE[k]; }), sistemas: si.map(function (k) { return porS[k]; }),
        diferencaCents: ex.length && si.length ? somaE - somaS : 0 });
    });
    return {
      linhas: linhas,
      extrato: extrato.filter(function (e, i) { return !usados[kE[i]]; }),
      sistema: sistema.filter(function (s, i) { return !usados[kS[i]]; }),
      chavesE: kE, chavesS: kS
    };
  }

  // ------------------------------------------------------------- exportação

  var NOME_STATUS = { ok: "Conciliado", data_diferente: "Data diferente", so_extrato: "Só no banco", so_sistema: "Só na planilha",
    manual: "Conciliado à mão", justificado: "Conferido (sem par)" };

  /** Resultado → CSV para o Excel (";" e BOM). rotuloSistema: "Planilha" ou "Sistema". */
  function csvResultado(linhas, rotuloSistema) {
    var rs = rotuloSistema || "Planilha";
    var cab = ["Situação", "Data banco", "Histórico banco", "Valor banco", "Data " + rs.toLowerCase(), "Fornecedor/cliente", "Documento", "Valor " + rs.toLowerCase(), "Fornecedor no histórico", "Observação"];
    var v = function (x) { return x ? Core.formatBR(x.valorNum) : ""; };
    // grupo manual (vários itens de cada lado) vira uma linha, com os textos juntos e os valores somados
    var juntar = function (lista) {
      if (!lista || !lista.length) return null;
      if (lista.length === 1) return lista[0];
      return { data: lista[0].data, desc: lista.map(function (x) { return x.desc || x.nome; }).join(" + "),
        nome: lista.map(function (x) { return x.nome || x.desc; }).join(" + "), doc: lista.map(function (x) { return x.doc; }).filter(Boolean).join(" + "),
        valorNum: lista.reduce(function (a, x) { return a + x.valorNum; }, 0) };
    };
    var out = [cab.join(";")];
    linhas.forEach(function (l) {
      var e = l.extratos ? juntar(l.extratos) : l.extrato, s = l.sistemas ? juntar(l.sistemas) : l.sistema;
      var st = l.status === "so_sistema" ? "Só " + (rs === "Planilha" ? "na planilha" : "no sistema") : NOME_STATUS[l.status];
      out.push([st, e ? Core.brDate(e.data) : "", e ? e.desc : "", v(e), s ? Core.brDate(s.data) : "", s ? (s.nome || s.desc || "") : "", s ? s.doc || "" : "", v(s),
        l.nomeConfere ? "sim" : "", l.obs || ""].map(function (c) {
        c = limpa(c);
        return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
      }).join(";"));
    });
    return "\uFEFF" + out.join("\r\n");
  }

  return {
    lerPlanilhaTitulos: lerPlanilhaTitulos, escolherColunas: escolherColunas, detectarCabecalho: detectarCabecalho,
    nomeConfere: nomeConfere, conciliarAvulso: conciliarAvulso, csvResultado: csvResultado,
    chaveExtrato: chaveExtrato, chaveSistema: chaveSistema, chavesUnicas: chavesUnicas, separarManuais: separarManuais
  };
});
