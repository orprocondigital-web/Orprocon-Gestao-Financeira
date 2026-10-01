/*
 * extratos.js — extrato do banco direto para a conta certa do sistema.
 *
 *  - lerExtrato: OFX (padrão de todos os bancos), TXT do Sicoob e CSV/TXT genérico.
 *  - contasCandidatas: descobre a conta pelo número que vem no extrato.
 *  - mesclar: junta ao que já existe sem duplicar (extratos chegam várias vezes no mês).
 *  - criarIndice / sugerir: sugere categoria, unidade, natureza e conta a partir
 *    do que já foi classificado nos meses anteriores.
 *
 * Funções puras. Testadas em tests/extratos.test.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.Extratos = factory(root.Core);
})(typeof self !== "undefined" ? self : this, function (Core) {
  "use strict";

  function limpa(v) { return v === null || v === undefined ? "" : String(v).trim(); }
  function soDigitos(s) { return limpa(s).replace(/\D/g, ""); }
  function chave(s) { return limpa(s).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " "); }

  // ------------------------------------------------------------------ OFX

  function campoOFX(bloco, tag) {
    // OFX 1.x (SGML) não fecha as tags: o valor vai até a próxima "<" ou fim de linha
    var m = new RegExp("<" + tag + ">([^<\\r\\n]*)", "i").exec(bloco);
    return m ? m[1].trim() : "";
  }

  function decodificaEntidades(s) {
    return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  }

  /** Arquivo OFX (1.x SGML ou 2.x XML) → lançamentos + identificação da conta. */
  function lerOFX(texto) {
    var t = String(texto);
    var banco = campoOFX(t, "BANKID"), agencia = campoOFX(t, "BRANCHID"), conta = campoOFX(t, "ACCTID");
    var itens = [];
    var re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi, m;
    while ((m = re.exec(t))) {
      var b = m[1];
      var dt = campoOFX(b, "DTPOSTED");
      var data = /^\d{8}/.test(dt) ? dt.slice(0, 4) + "-" + dt.slice(4, 6) + "-" + dt.slice(6, 8) : "";
      var bruto = campoOFX(b, "TRNAMT").replace(/\s/g, "");
      // alguns bancos brasileiros escrevem o valor com vírgula decimal
      var valor = /,\d{1,2}$/.test(bruto) ? Number(bruto.replace(/\./g, "").replace(",", ".")) : Number(bruto);
      if (!data || isNaN(valor)) continue;
      var memo = decodificaEntidades(campoOFX(b, "MEMO")), nome = decodificaEntidades(campoOFX(b, "NAME"));
      var tipo = campoOFX(b, "TRNTYPE").toUpperCase();
      var sinal = valor < 0 || (valor === 0 && tipo === "DEBIT") ? "D" : "C";
      if (/^saldo\b/i.test(memo || nome)) continue;
      itens.push({
        data: data, valorNum: Math.abs(valor), sign: sinal,
        desc: memo || nome, nome: memo && nome && nome !== memo ? nome : "",
        doc: campoOFX(b, "CHECKNUM") || campoOFX(b, "REFNUM"),
        fitid: campoOFX(b, "FITID"), detalhes: []
      });
    }
    return { ok: true, formato: "OFX", numeroConta: conta, agencia: agencia, codigoBanco: banco, itens: itens };
  }

  /** Número da conta no cabeçalho do TXT do Sicoob: "CONTA: 24.402-3 - EMPRESA". */
  function contaDoSicoob(texto) {
    var m = /CONTA:\s*([\d.\-\/]+)/i.exec(String(texto).slice(0, 3000));
    return m ? m[1] : "";
  }

  /** Conteúdo de um arquivo de extrato (já como texto) → { formato, numeroConta, itens }. */
  function lerExtrato(texto) {
    var t = String(texto);
    if (/<OFX>/i.test(t) || /OFXHEADER/i.test(t.slice(0, 500))) return lerOFX(t);
    var r = Core.parseExtratoTexto(t);
    r.numeroConta = Core.pareceSicoobTxt(t) ? contaDoSicoob(t) : "";
    (r.itens || []).forEach(function (i) { if (i.cpfCnpj && !i.cpf) i.cpf = i.cpfCnpj; });
    return r;
  }

  // ------------------------------------------------ qual conta do sistema

  /**
   * Contas do sistema cujo número bate com o do extrato (ignorando pontuação e zeros à esquerda;
   * aceita o número do extrato terminar com o da conta, porque alguns bancos põem a agência antes).
   * Mais de uma (ex.: duas contas com o mesmo número e contábeis diferentes) → a pessoa escolhe.
   */
  function contasCandidatas(numeroExtrato, contas) {
    var n = soDigitos(numeroExtrato).replace(/^0+/, "");
    if (n.length < 4) return [];
    return (contas || []).filter(function (c) {
      var d = soDigitos(c.conta || c.numero).replace(/^0+/, "");
      if (d.length < 4) return false;
      return d === n || n.slice(-d.length) === d || d.slice(-n.length) === n;
    });
  }

  // --------------------------------------------------- sem duplicar

  function chaveLancamento(e) {
    if (e.fitid) return "F|" + e.fitid;
    var desc = chave(e.desc).replace(/[^A-Z0-9]/g, "");
    return [e.data, Math.round(Number(e.valorNum) * 100), e.sign, soDigitos(e.doc), desc].join("|");
  }

  /**
   * Junta o extrato ao que já existe. Conta repetições: se o dia tem duas tarifas iguais já lançadas
   * e o extrato traz três, entra só uma. Lançamentos com FITID (OFX) também casam pelo FITID.
   */
  function mesclar(existentes, novos) {
    var conta = {}, fitids = {};
    (existentes || []).forEach(function (e) {
      if (e.fitid) fitids[e.fitid] = true;
      var k = chaveLancamento(Object.assign({}, e, { fitid: "" }));
      conta[k] = (conta[k] || 0) + 1;
    });
    var adicionados = [], repetidos = 0;
    (novos || []).forEach(function (e) {
      if (e.fitid && fitids[e.fitid]) { repetidos++; return; }
      var k = chaveLancamento(Object.assign({}, e, { fitid: "" }));
      if (conta[k]) { conta[k]--; repetidos++; return; }
      adicionados.push(e);
    });
    return { adicionados: adicionados, repetidos: repetidos };
  }

  // ------------------------------------------------ classificação sugerida

  /** Histórico sem números e pontuação: "PIX RECEBIDO - OUTRA IF 123" → "PIX RECEBIDO OUTRA IF". */
  function historicoBase(desc) {
    return chave(desc).replace(/[0-9]+/g, " ").replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
  }

  function assinatura(e) {
    return JSON.stringify([limpa(e.categoria), limpa(e.unidade), limpa(e.natureza), limpa(e.conta)]);
  }

  /** Índice do que já foi classificado: por CPF/CNPJ, por nome e por histórico (+ sinal). */
  function criarIndice(lancamentos) {
    var idx = { doc: {}, nome: {}, hist: {} };
    function soma(mapa, k, e) {
      if (!k) return;
      var m = mapa[k] = mapa[k] || {};
      var a = assinatura(e);
      m[a] = (m[a] || 0) + 1;
    }
    (lancamentos || []).forEach(function (e) {
      if (!limpa(e.categoria) || e.sugerido) return;   // só o que uma pessoa classificou
      var doc = soDigitos(e.cpf || e.cpfCnpj);
      soma(idx.doc, doc.length >= 11 ? doc + "|" + e.sign : "", e);
      soma(idx.nome, limpa(e.nome) ? chave(e.nome) + "|" + e.sign : "", e);
      var h = historicoBase(e.desc);
      soma(idx.hist, h.length >= 4 ? h + "|" + e.sign : "", e);
    });
    return idx;
  }

  function melhor(mapa, minimoHist) {
    if (!mapa) return null;
    var total = 0, top = null, n = 0;
    Object.keys(mapa).forEach(function (a) { total += mapa[a]; if (mapa[a] > n) { n = mapa[a]; top = a; } });
    if (!top) return null;
    // histórico genérico ("PIX RECEBIDO") só vale se for quase sempre classificado igual
    if (minimoHist && (n < 2 || n / total < 0.8)) return null;
    if (!minimoHist && n / total < 0.6) return null;
    var p = JSON.parse(top);
    return { categoria: p[0], unidade: p[1], natureza: p[2], conta: p[3] };
  }

  /**
   * Sugestão para um lançamento sem categoria: primeiro pelo CPF/CNPJ, depois pelo nome, por último
   * pelo histórico. Devolve null quando o histórico não é consistente o bastante.
   */
  function sugerir(e, idx) {
    var doc = soDigitos(e.cpf || e.cpfCnpj);
    return (doc.length >= 11 && melhor(idx.doc[doc + "|" + e.sign])) ||
           (limpa(e.nome) && melhor(idx.nome[chave(e.nome) + "|" + e.sign])) ||
           melhor(idx.hist[historicoBase(e.desc) + "|" + e.sign], true) || null;
  }

  return {
    lerOFX: lerOFX, lerExtrato: lerExtrato, contaDoSicoob: contaDoSicoob,
    contasCandidatas: contasCandidatas, chaveLancamento: chaveLancamento, mesclar: mesclar,
    historicoBase: historicoBase, criarIndice: criarIndice, sugerir: sugerir
  };
});
