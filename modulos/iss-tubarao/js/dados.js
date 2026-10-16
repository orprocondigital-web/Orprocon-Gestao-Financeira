/*
 * dados.js — ISS de Tubarão: o que foi importado, por mês e por empresa.  (IssDados, UMD)
 *
 * Estado no navegador, chave "iss:v1" (vai no backup do sistema):
 *   { versao: 1,
 *     empresas: { <chave>: { chave, cmc, cnpj, nome, exemplo? } },          chave = CMC (ou CNPJ, se não houver CMC)
 *     meses: { "2026-09": { <chave>: { arquivo, importadoEm, por, notas:[...], canceladas, avisos:[], conferida } } } }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./leitor.js"));
  else root.IssDados = factory(root.IssLeitor);
})(typeof self !== "undefined" ? self : this, function (L) {
  "use strict";

  function estadoVazio() { return { versao: 1, empresas: {}, meses: {} }; }
  function normalizar(e) {
    e = e && typeof e === "object" ? e : {};
    return { versao: 1, empresas: e.empresas && typeof e.empresas === "object" ? e.empresas : {}, meses: e.meses && typeof e.meses === "object" ? e.meses : {} };
  }
  function chaveDe(emp) { return emp.cmc ? "cmc:" + emp.cmc : emp.cnpj ? "cnpj:" + emp.cnpj : ""; }

  /**
   * Junta um arquivo lido (IssLeitor.ler) ao mês. Substitui o que já havia da mesma empresa no mês.
   * Devolve { chave, substituiu, mesDoArquivo }.
   */
  function importar(e, mes, lido, opcoes) {
    opcoes = opcoes || {};
    var chave = chaveDe(lido.empresa);
    if (!chave) throw new Error((lido.arquivo || "Arquivo") + ": sem CMC nem CNPJ da empresa, não dá para saber de quem é.");
    var cad = e.empresas[chave] || { chave: chave };
    cad.cmc = lido.empresa.cmc || cad.cmc || ""; cad.cnpj = lido.empresa.cnpj || cad.cnpj || ""; cad.nome = lido.empresa.nome || cad.nome || "(sem nome)";
    if (opcoes.exemplo) cad.exemplo = true;
    e.empresas[chave] = cad;
    var m = e.meses[mes] = e.meses[mes] || {};
    var substituiu = !!m[chave];
    var avisos = lido.avisos.slice();
    if (lido.mes && lido.mes !== mes) avisos.unshift("As notas são de " + rotuloMes(lido.mes) + ", mas o arquivo foi importado em " + rotuloMes(mes) + ".");
    m[chave] = { arquivo: lido.arquivo || "", importadoEm: (opcoes.agora || new Date()).toISOString(), por: opcoes.quem || "",
      notas: lido.notas, canceladas: lido.canceladas || 0, avisos: avisos, conferida: false };
    return { chave: chave, substituiu: substituiu, mesDoArquivo: lido.mes };
  }

  function remover(e, mes, chave) {
    if (e.meses[mes]) delete e.meses[mes][chave];
    if (e.meses[mes] && !Object.keys(e.meses[mes]).length) delete e.meses[mes];
  }
  function marcarConferida(e, mes, chave, sim) { var r = e.meses[mes] && e.meses[mes][chave]; if (r) r.conferida = !!sim; }

  /** Linhas do mês, uma por empresa importada, com os totais. */
  function resumoMes(e, mes) {
    var m = e.meses[mes] || {};
    var linhas = Object.keys(m).map(function (k) {
      var r = m[k], emp = e.empresas[k] || { chave: k, nome: k };
      var t = L.totais(r.notas);
      return { chave: k, empresa: emp, registro: r, t: t, avisos: r.avisos.length };
    }).sort(function (a, b) { return b.t.totalRetido - a.t.totalRetido || a.empresa.nome.localeCompare(b.empresa.nome); });
    var geral = L.totais([].concat.apply([], linhas.map(function (l) { return l.registro.notas; })));
    geral.empresas = linhas.length;
    geral.conferidas = linhas.filter(function (l) { return l.registro.conferida; }).length;
    geral.comAlerta = linhas.filter(function (l) { return l.t.alertas || l.avisos; }).length;
    return { mes: mes, linhas: linhas, geral: geral };
  }

  function mesesComDados(e) { return Object.keys(e.meses).filter(function (k) { return Object.keys(e.meses[k]).length; }).sort().reverse(); }

  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function rotuloMes(mes) { return mes ? MESES[Number(mes.slice(5, 7)) - 1] + "/" + mes.slice(0, 4) : ""; }
  function somarMes(mes, n) { var y = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7)) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + "-" + String(m + 1).padStart(2, "0"); }

  // ------------------------------------------------------------ exemplo (empresas e prestadores fictícios)

  /** XML fictício no formato do Meu ISS, para conhecer o módulo. */
  function xmlExemplo(emp, mes, notas) {
    var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
    var v = function (x) { return x.toFixed(2).replace(".", ","); };
    return '<?xml version="1.0" encoding="UTF-8"?>\n<movimento_economico>\n  <tomador><cpf_cnpj>' + emp.cnpj + "</cpf_cnpj><razao_social>" + esc(emp.nome) +
      "</razao_social><cmc>" + emp.cmc + "</cmc></tomador>\n" + notas.map(function (n, i) {
        var fed = n.ir + n.pis + n.cofins + n.csll + n.inss, ret = (n.tipo === "TOMADOR" ? n.iss : 0) + fed;
        return '  <nota numero="' + (1000 + i) + '"><prestador><cpf_cnpj>' + n.cnpj + "</cpf_cnpj><razao_social>" + esc(n.prest) + "</razao_social></prestador>" +
          "<tipo_nota>" + n.tipo + "</tipo_nota><situacao>" + (n.cancelada ? "C" : "N") + "</situacao><rps>" + (500 + i) + "</rps>" +
          "<data_emissao>" + mes + "-" + String(3 + i * 2).padStart(2, "0") + "</data_emissao><cidade_prestacao>Tubarão</cidade_prestacao>" +
          "<nome_atividade>" + esc(n.ativ) + "</nome_atividade><valor_nota>" + v(n.valor) + "</valor_nota><base_calculo>" + v(n.base === undefined ? n.valor : n.base) + "</base_calculo>" +
          "<valor_iss>" + v(n.iss) + "</valor_iss><valor_liquido>" + v(n.liquido === undefined ? n.valor - ret : n.liquido) + "</valor_liquido>" +
          "<valor_ir>" + v(n.ir) + "</valor_ir><valor_pis>" + v(n.pis) + "</valor_pis><valor_cofins>" + v(n.cofins) + "</valor_cofins>" +
          "<valor_csll>" + v(n.csll) + "</valor_csll><valor_inss>" + v(n.inss) + "</valor_inss></nota>";
      }).join("\n") + "\n</movimento_economico>\n";
  }

  function exemplo(e, mes) {
    var z = { ir: 0, pis: 0, cofins: 0, csll: 0, inss: 0 };
    var nota = function (o) { var r = {}; Object.keys(z).forEach(function (k) { r[k] = z[k]; }); Object.keys(o).forEach(function (k) { r[k] = o[k]; }); return r; };
    var empresas = [
      { cnpj: "00000000000101", nome: "Alfa Comércio Exemplo Ltda", cmc: "EX-001", notas: [
        nota({ cnpj: "00000000000202", prest: "Limpeza Exemplo ME", tipo: "TOMADOR", ativ: "Limpeza e conservação", valor: 3200, iss: 96, inss: 352 }),
        nota({ cnpj: "00000000000303", prest: "Consultoria Exemplo Ltda", tipo: "TOMADOR", ativ: "Consultoria empresarial", valor: 8000, iss: 400, ir: 120, pis: 52, cofins: 240, csll: 80 }),
        nota({ cnpj: "00000000000404", prest: "Manutenção Exemplo", tipo: "TOMADOR", ativ: "Manutenção de máquinas", valor: 1500, iss: 0 }),
        nota({ cnpj: "00000000000505", prest: "Cancelada Exemplo", tipo: "TOMADOR", ativ: "Serviço cancelado", valor: 900, iss: 27, cancelada: true })
      ] },
      { cnpj: "00000000000606", nome: "Beta Serviços Exemplo ME", cmc: "EX-002", notas: [
        nota({ cnpj: "00000000000707", prest: "Vigilância Exemplo Ltda", tipo: "TOMADOR", ativ: "Vigilância", valor: 5400, iss: 162, inss: 594, ir: 54 }),
        nota({ cnpj: "00000000000808", prest: "Informática Exemplo", tipo: "TOMADOR", ativ: "Suporte técnico", valor: 1200, iss: 84, liquido: 1200 })
      ] },
      { cnpj: "00000000000909", nome: "Gama Indústria Exemplo S.A.", cmc: "EX-003", notas: [
        nota({ cnpj: "00000000001010", prest: "Transportes Exemplo", tipo: "TOMADOR", ativ: "Frete municipal", valor: 2500, iss: 50 }),
        nota({ cnpj: "00000000001111", prest: "Engenharia Exemplo Ltda", tipo: "TOMADOR", ativ: "Projeto de engenharia", valor: 12000, iss: 600, ir: 180, pis: 78, cofins: 360, csll: 120 })
      ] }
    ];
    var n = 0;
    empresas.forEach(function (emp) {
      var lido = L.ler(xmlExemplo(emp, mes, emp.notas), "exemplo_" + emp.cmc + ".xml");
      importar(e, mes, lido, { exemplo: true, quem: "Exemplo" }); n++;
    });
    return { empresas: n, mes: mes };
  }

  function temExemplo(e) { return Object.keys(e.empresas).some(function (k) { return e.empresas[k].exemplo; }); }
  function removerExemplo(e) {
    var tirou = 0;
    Object.keys(e.empresas).forEach(function (k) {
      if (!e.empresas[k].exemplo) return;
      delete e.empresas[k]; tirou++;
      Object.keys(e.meses).forEach(function (m) { remover(e, m, k); });
    });
    return tirou;
  }

  /** Zera o módulo (todas as empresas e meses). */
  function limparTudo(e) { e.empresas = {}; e.meses = {}; }

  return { limparTudo: limparTudo, estadoVazio: estadoVazio, normalizar: normalizar, chaveDe: chaveDe, importar: importar, remover: remover, marcarConferida: marcarConferida,
    resumoMes: resumoMes, mesesComDados: mesesComDados, rotuloMes: rotuloMes, somarMes: somarMes,
    xmlExemplo: xmlExemplo, exemplo: exemplo, temExemplo: temExemplo, removerExemplo: removerExemplo };
});
