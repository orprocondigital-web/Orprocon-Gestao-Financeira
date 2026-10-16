/*
 * leitor.js — lê o XML "movimento_economico" que o Meu ISS (Prefeitura Moderna, Tubarão/SC) gera em
 * Movimento Econômico → Períodos → Exportar XML → Gerar Arquivo.  (IssLeitor, UMD: navegador e node)
 *
 * Modelo (do robô antigo, que foi montado em cima do portal real):
 *   <movimento_economico>
 *     <tomador><cpf_cnpj/><razao_social/><cmc/></tomador>      ← a empresa cliente
 *     <nota numero="..."> <prestador><cpf_cnpj/><razao_social/></prestador>
 *        <tipo_nota/> <situacao/> <rps/> <data_emissao/> <cidade_prestacao/> <nome_atividade/>
 *        <valor_nota/> <base_calculo/> <valor_iss/> <valor_liquido/>
 *        <valor_ir/> <valor_pis/> <valor_cofins/> <valor_csll/> <valor_inss/> </nota>
 *   </movimento_economico>
 *
 * Regras do robô: nota cancelada sai; ISS retido = valor_iss quando tipo_nota = TOMADOR;
 * retenção federal = IR, PIS, COFINS, CSLL ou INSS > 0.
 *
 * TOLERANTE de propósito (ainda não vimos um arquivo real): números "1234.56" ou "1.234,56",
 * datas "2026-09-15" ou "15/09/2026", tags em maiúsculas ou minúsculas. O que não reconhece vira aviso.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.IssLeitor = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ------------------------------------------------------------ XML mínimo (funciona igual no navegador e nos testes)

  var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  function desescapar(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m;
    });
  }

  /** Transforma o texto XML em árvore {nome, attrs, filhos, texto}. Lança erro se não for XML. */
  function arvore(texto) {
    var s = String(texto || "").replace(/^﻿/, "");
    var raiz = { nome: "#doc", attrs: {}, filhos: [], texto: "" }, pilha = [raiz], i = 0, n = s.length;
    var re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s\/>]+)((?:\s+[^\s=\/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/gi;
    var m, ultimo = 0;
    while ((m = re.exec(s))) {
      var atual = pilha[pilha.length - 1];
      if (m.index > ultimo) atual.texto += desescapar(s.slice(ultimo, m.index));
      ultimo = re.lastIndex;
      if (m[1] !== undefined) { atual.texto += m[1]; continue; }
      if (m[2]) {   // fecha
        var nome = m[2].toLowerCase();
        for (var k = pilha.length - 1; k > 0; k--) if (pilha[k].nome === nome) { pilha.length = k; break; }
        continue;
      }
      if (!m[3]) continue;   // comentário, <?xml?>, doctype
      var attrs = {}, ra = /([^\s=\/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g, a;
      while ((a = ra.exec(m[4] || ""))) attrs[a[1].toLowerCase()] = desescapar(a[3] !== undefined ? a[3] : a[4]);
      var el = { nome: m[3].toLowerCase().replace(/^[^:]+:/, ""), attrs: attrs, filhos: [], texto: "" };
      atual.filhos.push(el);
      if (!m[5]) pilha.push(el);
    }
    if (!raiz.filhos.length) throw new Error("Não parece um arquivo XML.");
    return raiz.filhos[0];
  }
  function filho(el, nome) { if (!el) return null; for (var i = 0; i < el.filhos.length; i++) if (el.filhos[i].nome === nome) return el.filhos[i]; return null; }
  function texto(el, nome) { var f = nome ? filho(el, nome) : el; return f ? f.texto.trim() : ""; }
  function todos(el, nome, out) {
    out = out || [];
    el.filhos.forEach(function (f) { if (f.nome === nome) out.push(f); else todos(f, nome, out); });
    return out;
  }

  // ------------------------------------------------------------ números e datas

  /** "1.234,56" | "1234.56" | "1234,56" | "1.234" → número. avisos: lista onde registrar formatos duvidosos. */
  function numero(v, avisos, campo) {
    var s = String(v === undefined || v === null ? "" : v).trim().replace(/\s|R\$/g, "");
    if (!s) return 0;
    var neg = /^-/.test(s) || /^\(.*\)$/.test(s);
    s = s.replace(/[-()]/g, "");
    var temP = s.indexOf(".") > -1, temV = s.indexOf(",") > -1, r;
    if (temP && temV) {
      r = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    } else if (temV) {
      r = /^\d{1,3}(,\d{3})+$/.test(s) && s.split(",").length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (temP) {
      if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) r = s.replace(/\./g, "");      // 1.234.567
      else {
        if (/^\d{1,3}\.\d{3}$/.test(s) && avisos) avisos.push((campo || "valor") + " \"" + v + "\": entendido como " + s + " (ponto decimal). Confira.");
        r = s;
      }
    } else r = s;
    var x = Number(r);
    if (!isFinite(x)) { if (avisos) avisos.push((campo || "valor") + " \"" + v + "\" não reconhecido (ficou 0)."); return 0; }
    return Math.round((neg ? -x : x) * 100) / 100;
  }

  /** "2026-09-15", "2026-09-15T10:00:00", "15/09/2026", "15/09/2026 10:00" → "2026-09-15"; senão "". */
  function data(v) {
    var s = String(v || "").trim(), m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return m[1] + "-" + m[2] + "-" + m[3];
    if ((m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s))) return m[3] + "-" + m[2] + "-" + m[1];
    if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return m[1] + "-" + m[2] + "-" + m[3];
    return "";
  }
  function soDigitos(s) { return String(s || "").replace(/\D/g, ""); }
  function centavos(x) { return Math.round(x * 100) / 100; }

  // ------------------------------------------------------------ o leitor

  var TIPOS_CONHECIDOS = { TOMADOR: 1, PRESTADOR: 1 };

  /**
   * Lê o texto do XML. Devolve
   * { empresa: {cnpj, nome, cmc}, mes: "2026-09" (o mais comum nas notas), notas: [...], canceladas, avisos: [] }
   * Cada nota: { numero, rps, data, prestadorCnpj, prestadorNome, tipo, cidade, atividade,
   *   valor, base, iss, issRetido, ir, pis, cofins, csll, inss, federal, totalRetido, liquido, alertas: [] }
   */
  function ler(textoXml, nomeArquivo) {
    var raiz = arvore(textoXml), avisos = [];
    if (raiz.nome !== "movimento_economico") {
      throw new Error((nomeArquivo ? nomeArquivo + ": " : "") + "não é o XML do Movimento Econômico do Meu ISS (a primeira tag é <" + raiz.nome + ">).");
    }
    var tom = filho(raiz, "tomador");
    var empresa = { cnpj: soDigitos(texto(tom, "cpf_cnpj")), nome: texto(tom, "razao_social"), cmc: texto(tom, "cmc") };
    if (!empresa.cmc && !empresa.cnpj) avisos.push("O arquivo não traz o CMC nem o CNPJ da empresa.");
    var notas = [], canceladas = 0, meses = {}, tiposNovos = {};
    todos(raiz, "nota").forEach(function (el, i) {
      var situacao = texto(el, "situacao").toUpperCase();
      if (situacao === "C" || /^CANCELAD/.test(situacao)) { canceladas++; return; }
      var av = [], prest = filho(el, "prestador");
      var tipo = texto(el, "tipo_nota").toUpperCase();
      var n = {
        numero: (el.attrs.numero || texto(el, "numero") || texto(el, "rps") || String(i + 1)).trim(),
        rps: texto(el, "rps"), data: data(texto(el, "data_emissao")),
        prestadorCnpj: soDigitos(texto(prest, "cpf_cnpj")), prestadorNome: texto(prest, "razao_social"),
        tipo: tipo, situacao: situacao, cidade: texto(el, "cidade_prestacao"), atividade: texto(el, "nome_atividade").slice(0, 200),
        valor: numero(texto(el, "valor_nota"), av, "Valor da nota"), base: numero(texto(el, "base_calculo"), av, "Base de cálculo"),
        iss: numero(texto(el, "valor_iss"), av, "ISS"), liquido: numero(texto(el, "valor_liquido"), av, "Valor líquido"),
        ir: numero(texto(el, "valor_ir"), av, "IR"), pis: numero(texto(el, "valor_pis"), av, "PIS"), cofins: numero(texto(el, "valor_cofins"), av, "COFINS"),
        csll: numero(texto(el, "valor_csll"), av, "CSLL"), inss: numero(texto(el, "valor_inss"), av, "INSS")
      };
      n.issRetido = tipo === "TOMADOR" && n.iss > 0 ? n.iss : 0;
      n.federal = centavos(n.ir + n.pis + n.cofins + n.csll + n.inss);
      n.totalRetido = centavos(n.issRetido + n.federal);
      if (tipo && !TIPOS_CONHECIDOS[tipo]) tiposNovos[tipo] = (tiposNovos[tipo] || 0) + 1;
      if (!tipo) av.push("Nota sem tipo (tomador/prestador).");
      if (!n.data) av.push("Data de emissão não reconhecida: \"" + texto(el, "data_emissao") + "\".");
      n.alertas = av.concat(conferir(n));
      if (n.data) meses[n.data.slice(0, 7)] = (meses[n.data.slice(0, 7)] || 0) + 1;
      notas.push(n);
    });
    Object.keys(tiposNovos).forEach(function (t) { avisos.push("Tipo de nota \"" + t + "\" (" + tiposNovos[t] + " nota(s)) ainda não conhecido: o ISS dessas notas não foi tratado como retido."); });
    var mes = Object.keys(meses).sort(function (a, b) { return meses[b] - meses[a]; })[0] || "";
    if (Object.keys(meses).length > 1) avisos.push("O arquivo tem notas de mais de um mês: " + Object.keys(meses).sort().join(", ") + ".");
    return { arquivo: nomeArquivo || "", empresa: empresa, mes: mes, notas: notas, canceladas: canceladas, avisos: avisos };
  }

  /** Conferências de cada nota (o que vale olhar com atenção). */
  function conferir(n) {
    var a = [];
    if (n.base > n.valor + 0.01) a.push("Base de cálculo maior que o valor da nota.");
    if (n.iss > 0 && n.base > 0) {
      var aliq = n.iss / n.base * 100;
      if (aliq < 1.99 || aliq > 5.01) a.push("Alíquota de ISS fora de 2% a 5% (" + aliq.toFixed(2).replace(".", ",") + "%).");
    }
    if (n.liquido > 0) {
      var esperado = centavos(n.valor - n.totalRetido);
      if (Math.abs(esperado - n.liquido) > 0.05) a.push("Valor líquido (" + brl(n.liquido) + ") diferente de valor − retenções (" + brl(esperado) + ").");
    }
    if (n.tipo === "TOMADOR" && n.iss === 0 && n.valor > 0) a.push("Nota tomada sem ISS: confira se deveria ter retenção.");
    return a;
  }

  function brl(x) { return (x || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  /** Totais de uma lista de notas. */
  function totais(notas) {
    var t = { notas: notas.length, valor: 0, iss: 0, issRetido: 0, ir: 0, pis: 0, cofins: 0, csll: 0, inss: 0, federal: 0, totalRetido: 0,
      comFederal: 0, comIssRetido: 0, alertas: 0 };
    notas.forEach(function (n) {
      ["valor", "iss", "issRetido", "ir", "pis", "cofins", "csll", "inss", "federal", "totalRetido"].forEach(function (k) { t[k] = centavos(t[k] + n[k]); });
      if (n.federal > 0) t.comFederal++;
      if (n.issRetido > 0) t.comIssRetido++;
      if (n.alertas.length) t.alertas++;
    });
    return t;
  }

  return { ler: ler, arvore: arvore, numero: numero, data: data, totais: totais, conferir: conferir, brl: brl };
});
