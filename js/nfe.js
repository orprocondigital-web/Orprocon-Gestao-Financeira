/*
 * nfe.js — XML de NF-e/NFC-e → títulos para a conciliação.
 *
 * Lê só o que a conciliação precisa: emitente, destinatário, número, data,
 * valor, parcelas (cobr/dup: número, vencimento, valor), situação e eventos
 * de cancelamento. Não usa DOMParser, para rodar igual no navegador e no Node.
 *
 * Testado em tests/nfe.test.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Nfe = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function semNamespace(xml) { return String(xml).replace(/<(\/?)[A-Za-z0-9_]+:/g, "<$1"); }
  function bloco(xml, tag) {
    var m = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">").exec(xml);
    return m ? m[1] : "";
  }
  function blocos(xml, tag) {
    var re = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "g"), out = [], m;
    while ((m = re.exec(xml))) out.push(m[1]);
    return out;
  }
  function decod(s) {
    return String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
  }
  function campo(xml, tag) { var m = new RegExp("<" + tag + ">([^<]*)</" + tag + ">").exec(xml); return m ? decod(m[1]) : ""; }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  /**
   * Um arquivo XML → { tipo: "nfe", nota } | { tipo: "cancelamento", chaves } | { tipo: "resumo" } | { tipo: "outro" }.
   * nota: { chave, modelo, numero, serie, data, tpNF, emit: {doc, nome}, dest: {doc, nome}, vNF, cStat, duplicatas: [{ numero, venc, valor }] }
   */
  function lerXml(texto) {
    var xml = semNamespace(texto);
    var inf = bloco(xml, "infNFe");
    if (!inf) {
      var evs = blocos(xml, "infEvento").filter(function (e) { return campo(e, "tpEvento") === "110111"; });
      if (evs.length) return { tipo: "cancelamento", chaves: evs.map(function (e) { return campo(e, "chNFe"); }).filter(Boolean) };
      if (bloco(xml, "resNFe")) return { tipo: "resumo" };
      return { tipo: "outro" };
    }
    var idAttr = /<infNFe[^>]*\sId="NFe(\d{44})"/.exec(xml);
    var ide = bloco(inf, "ide"), emit = bloco(inf, "emit"), dest = bloco(inf, "dest"), prot = bloco(xml, "infProt");
    var doc = function (b) { return campo(b, "CNPJ") || campo(b, "CPF"); };
    var dh = campo(ide, "dhEmi") || campo(ide, "dEmi");
    var dups = blocos(bloco(inf, "cobr"), "dup").map(function (d) {
      return { numero: campo(d, "nDup"), venc: campo(d, "dVenc").slice(0, 10), valor: num(campo(d, "vDup")) };
    }).filter(function (d) { return d.valor > 0; });
    return {
      tipo: "nfe",
      nota: {
        chave: idAttr ? idAttr[1] : campo(prot, "chNFe"),
        modelo: campo(ide, "mod"), numero: campo(ide, "nNF"), serie: campo(ide, "serie"),
        data: dh.slice(0, 10), tpNF: campo(ide, "tpNF"),
        emit: { doc: doc(emit), nome: campo(emit, "xNome") },
        dest: { doc: doc(dest), nome: campo(dest, "xNome") },
        vNF: num(campo(bloco(inf, "ICMSTot"), "vNF")),
        cStat: campo(prot, "cStat"),
        duplicatas: dups
      }
    };
  }

  /** Vários XMLs (textos) → { notas (sem repetir a chave), cancelados: {chave: true}, resumos, outros }. */
  function lerVarios(textos) {
    var notas = {}, cancelados = {}, resumos = 0, outros = 0;
    textos.forEach(function (t) {
      var r = lerXml(t);
      if (r.tipo === "nfe" && r.nota.chave) notas[r.nota.chave] = r.nota;
      else if (r.tipo === "cancelamento") r.chaves.forEach(function (c) { cancelados[c] = true; });
      else if (r.tipo === "resumo") resumos++;
      else outros++;
    });
    return { notas: Object.keys(notas).map(function (k) { return notas[k]; }), cancelados: cancelados, resumos: resumos, outros: outros };
  }

  /** O CNPJ que mais aparece nas notas, como emitente ou destinatário, é a empresa da conciliação. */
  function empresaProvavel(notas) {
    var cont = {}, nomes = {};
    notas.forEach(function (n) {
      [n.emit, n.dest].forEach(function (p) {
        if (!p.doc || p.doc.length !== 14) return;
        cont[p.doc] = (cont[p.doc] || 0) + 1;
        nomes[p.doc] = nomes[p.doc] || p.nome;
      });
    });
    var doc = Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; })[0] || "";
    return doc ? { doc: doc, nome: nomes[doc], notas: cont[doc] } : null;
  }

  function cnpjFormatado(d) {
    return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
         : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;
  }

  /**
   * Notas → títulos da conciliação.
   *  pagamentos:   notas em que a empresa é a destinatária (compras); o fornecedor é o emitente.
   *  recebimentos: notas emitidas pela empresa para terceiros (vendas); o cliente é o destinatário.
   * Cada parcela (dup) vira um título com a data de vencimento; sem parcela, um título com o valor da nota e a data de emissão.
   * Notas canceladas (evento carregado ou cStat 101) ficam fora.
   */
  function titulosDasNotas(lidos, empresaDoc, tipo) {
    var receb = tipo === "recebimentos", sinal = receb ? "C" : "D", out = [], canceladas = 0, fora = 0;
    lidos.notas.forEach(function (n) {
      var daEmpresa = receb ? (n.emit.doc === empresaDoc && n.tpNF === "1" && n.dest.doc !== empresaDoc)
                            : (n.dest.doc === empresaDoc && n.emit.doc !== empresaDoc);
      if (!daEmpresa) { fora++; return; }
      if (lidos.cancelados[n.chave] || n.cStat === "101") { canceladas++; return; }
      var outro = receb ? n.dest : n.emit;
      var base = { sign: sinal, nome: outro.nome, cpf: cnpjFormatado(outro.doc), desc: outro.nome, origem: "NF-e" };
      var parcelas = n.duplicatas.length ? n.duplicatas : [{ numero: "", venc: n.data, valor: n.vNF }];
      parcelas.forEach(function (d, i) {
        out.push(Object.assign({}, base, {
          id: n.chave + "-" + (d.numero || i + 1),
          data: d.venc || n.data, valorNum: Math.round(d.valor * 100) / 100,
          doc: "NF " + n.numero + (parcelas.length > 1 ? " parc. " + (d.numero || i + 1) + "/" + parcelas.length : ""),
          emissao: n.data
        }));
      });
    });
    out.sort(function (a, b) { return a.data.localeCompare(b.data) || a.doc.localeCompare(b.doc); });
    out.forEach(function (t, i) { t.linha = i + 1; });
    return { titulos: out, canceladas: canceladas, fora: fora };
  }

  return { lerXml: lerXml, lerVarios: lerVarios, empresaProvavel: empresaProvavel, titulosDasNotas: titulosDasNotas, cnpjFormatado: cnpjFormatado };
});
