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

  // ------------------------------------------------------------- balancete de fornecedores (totais)

  function norm(s) { return limpa(s).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
  var IGNORA = { DE: 1, DA: 1, DO: 1, DOS: 1, DAS: 1, E: 1 };

  /** É o "Balancete Consolidado" do Único (Saldo anterior / Débito / Crédito / Saldo atual por conta)? */
  function ehBalancete(rows) {
    return rows.slice(0, 40).some(function (r) {
      var t = (r || []).map(chave).join("|");
      return t.indexOf("saldo anterior") > -1 && t.indexOf("debito") > -1 && t.indexOf("credito") > -1 && t.indexOf("saldo atual") > -1;
    });
  }

  /**
   * Balancete → fornecedores: { classif, conta, nome, nomeNorm, raiz (8 dígitos, quando o nome começa pelo CNPJ),
   * saldoAnterior, debito (pago no período), credito (comprado no período), saldoAtual }. Também o período do cabeçalho.
   */
  function lerBalanceteFornecedores(rows) {
    var h = -1, col = {};
    for (var i = 0; i < Math.min(rows.length, 40) && h < 0; i++) {
      var cab = (rows[i] || []).map(chave);
      var ia = cab.indexOf("saldo anterior"), id = cab.indexOf("debito"), ic = cab.indexOf("credito"), is = cab.indexOf("saldo atual");
      if (ia > -1 && id > -1 && ic > -1 && is > -1) { h = i; col = { anterior: ia, debito: id, credito: ic, atual: is, classif: cab.indexOf("classificacao") }; }
    }
    if (h < 0) return { ok: false, erro: "Não reconheci o balancete (faltam as colunas Saldo anterior, Débito, Crédito e Saldo atual).", fornecedores: [] };
    var per = null;
    rows.slice(0, h).some(function (r) {
      var m = /(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/.exec((r || []).join(" "));
      if (m) per = { inicio: Core.toIsoDate(m[1]), fim: Core.toIsoDate(m[2]) };
      return !!m;
    });
    var forn = [], vistos = {};
    rows.forEach(function (r, idx) {
      r = r || [];
      var classif = limpa(r[col.classif >= 0 ? col.classif : 1]);
      if (!/^\d[\d.]{5,}$/.test(classif) || vistos[classif]) return;
      var nome = "";
      for (var c = (col.classif >= 0 ? col.classif : 1) + 1; c < col.anterior; c++) { if (limpa(r[c])) { nome = limpa(r[c]); break; } }
      if (!nome) return;
      var v = function (k) { var n = Core.parseValor(r[col[k]]); return isNaN(n) ? 0 : n; };
      var raiz = (/^(\d{2})\.(\d{3})\.(\d{3})\b/.exec(nome) || []).slice(1).join("");
      vistos[classif] = true;
      forn.push({ classif: classif, conta: limpa(r[0]), nome: nome, nomeNorm: norm(nome.replace(/^\d[\d.]*\s*-?\s*/, "")), raiz: raiz,
        saldoAnterior: v("anterior"), debito: v("debito"), credito: v("credito"), saldoAtual: v("atual"), linha: idx + 1 });
    });
    return { ok: forn.length > 0, erro: forn.length ? "" : "O balancete não tem contas de fornecedores.", periodo: per, fornecedores: forn };
  }

  /** Nome do extrato (cortado/abreviado) bate com o do cadastro? "DELUPO COM DE F" → "DELUPO COMERCIO DE FERRAMENTAS…" */
  function nomeBate(nomeExtrato, nomeCadastro) {
    var a = norm(nomeExtrato).split(" ").filter(function (w) { return w && !IGNORA[w]; });
    var b = nomeCadastro.split(" ").filter(function (w) { return w && !IGNORA[w]; });
    if (!a.length || a.join("").length < 4) return false;
    var j = 0;
    for (var i = 0; i < a.length; i++) {
      while (j < b.length && b[j].indexOf(a[i]) !== 0) { if (i === 0) return false; j++; }
      if (j >= b.length) return false;
      j++;
    }
    return true;
  }

  /** Chave para lembrar a escolha da pessoa: CNPJ/CPF do histórico, ou o nome. */
  function chaveVinculo(e) {
    var d = soDigitos(e.cpf || e.cpfCnpj);
    if (d.length === 14 || d.length === 11) return "doc:" + d;
    return "nome:" + norm(e.nome || e.desc);
  }

  /**
   * De quem é este pagamento? 1) o que a pessoa já escolheu (vínculo); 2) raiz do CNPJ no nome do cadastro
   * (MEI: "18.663.698 DIOVANA SOUZA"); 3) nome com abreviações. Entre vários, prefere quem teve débito no período.
   */
  function identificarFornecedor(e, fornecedores, vinculos) {
    var v = vinculos && vinculos[chaveVinculo(e)];
    if (v && v.ignorar) return { ignorado: true };
    if (v && v.classif) {
      var f = fornecedores.filter(function (x) { return x.classif === v.classif; })[0];
      if (f) return { fornecedor: f, via: "vinculo" };
    }
    var d = soDigitos(e.cpf || e.cpfCnpj);
    if (d.length === 14) {
      var porRaiz = fornecedores.filter(function (x) { return x.raiz && x.raiz === d.slice(0, 8); });
      if (porRaiz.length === 1) return { fornecedor: porRaiz[0], via: "cnpj" };
    }
    var nome = e.nome || "";
    if (!nome) return { candidatos: [] };
    var c = fornecedores.filter(function (x) { return nomeBate(nome, x.nomeNorm); });
    if (c.length > 1) {
      var comDebito = c.filter(function (x) { return x.debito > 0; });
      if (comDebito.length === 1) c = comDebito;
    }
    if (c.length === 1) return { fornecedor: c[0], via: "nome" };
    return { candidatos: c };
  }

  /**
   * Extrato × balancete, por fornecedor: soma o que saiu no banco para cada um e compara com o Débito do balancete.
   * Só entram as saídas (D) do extrato. Devolve linhas por fornecedor, pagamentos sem fornecedor e os ignorados.
   */
  function conciliarPorFornecedor(extrato, balancete, vinculos) {
    var porClassif = {}, semFornecedor = [], ignorados = [];
    extrato.filter(function (e) { return e.sign === "D"; }).forEach(function (e) {
      var r = identificarFornecedor(e, balancete.fornecedores, vinculos);
      if (r.ignorado) { ignorados.push(e); return; }
      if (!r.fornecedor) { semFornecedor.push({ item: e, candidatos: r.candidatos || [] }); return; }
      var g = porClassif[r.fornecedor.classif] = porClassif[r.fornecedor.classif] || { fornecedor: r.fornecedor, pagos: [], vias: {} };
      g.pagos.push(e); g.vias[r.via] = true;
    });
    var linhas = [];
    balancete.fornecedores.forEach(function (f) {
      var g = porClassif[f.classif];
      var banco = g ? g.pagos.reduce(function (a, x) { return a + cents(x.valorNum); }, 0) : 0;
      var deb = cents(f.debito);
      if (!banco && !deb) return;
      var status = !banco ? "so_balancete" : !deb ? "so_banco" : banco === deb ? "bate" : "diferenca";
      linhas.push({ fornecedor: f, pagos: g ? g.pagos : [], totalBancoCents: banco, debitoCents: deb, diferencaCents: banco - deb, status: status,
        via: g ? Object.keys(g.vias) : [] });
    });
    var r = { bate: 0, diferenca: 0, so_banco: 0, so_balancete: 0, semFornecedor: semFornecedor.length, ignorados: ignorados.length };
    linhas.forEach(function (l) { r[l.status]++; });
    r.semFornecedorCents = semFornecedor.reduce(function (a, s) { return a + cents(s.item.valorNum); }, 0);
    return { linhas: linhas, semFornecedor: semFornecedor, ignorados: ignorados, resumo: r };
  }

  var NOME_STATUS_F = { bate: "Bate", diferenca: "Diferença", so_banco: "Só no banco", so_balancete: "Só no balancete" };

  function csvPorFornecedor(res) {
    var esc = function (c) { c = limpa(c); return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; };
    var f2 = function (c) { return Core.formatBR(c / 100); };
    var out = [["Situação", "Classificação", "Fornecedor", "Pagamentos no banco", "Pago no banco", "Débito no balancete", "Diferença"].join(";")];
    res.linhas.forEach(function (l) {
      out.push([NOME_STATUS_F[l.status], l.fornecedor.classif, l.fornecedor.nome, l.pagos.length, f2(l.totalBancoCents), f2(l.debitoCents), f2(l.diferencaCents)].map(esc).join(";"));
    });
    if (res.semFornecedor.length) {
      out.push(""); out.push(["Pagamentos sem fornecedor identificado", "Data", "Histórico", "Valor"].join(";"));
      res.semFornecedor.forEach(function (s) { out.push(["", Core.brDate(s.item.data), s.item.desc, Core.formatBR(s.item.valorNum)].map(esc).join(";")); });
    }
    return "\uFEFF" + out.join("\r\n");
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
    chaveExtrato: chaveExtrato, chaveSistema: chaveSistema, chavesUnicas: chavesUnicas, separarManuais: separarManuais,
    ehBalancete: ehBalancete, lerBalanceteFornecedores: lerBalanceteFornecedores, nomeBate: nomeBate, chaveVinculo: chaveVinculo,
    identificarFornecedor: identificarFornecedor, conciliarPorFornecedor: conciliarPorFornecedor, csvPorFornecedor: csvPorFornecedor
  };
});
