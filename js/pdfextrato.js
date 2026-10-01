/*
 * pdfextrato.js — extrato bancário em PDF → lançamentos.
 *
 * Recebe o texto das páginas com a posição de cada pedaço (como o pdf.js entrega)
 * e devolve { banco, numeroConta, itens, conferencia }.
 *
 * Funciona por regras gerais, com poucos ajustes por banco:
 *   - a linha é montada pela posição vertical do texto;
 *   - lançamento = linha com valor em dinheiro e uma data (dela ou herdada do
 *     cabeçalho do dia, como no Itaú, Nubank, Inter e Banrisul);
 *   - linhas só de texto perto de um lançamento são o resto do histórico
 *     (nome do favorecido, CNPJ…), coladas ao lançamento mais próximo;
 *   - sinal: sufixo C/D, sinal de menos antes ou depois, ou o cabeçalho
 *     "Total de entradas/saídas" (Nubank).
 *
 * A conferência soma os lançamentos de cada dia e compara com os saldos que o
 * próprio extrato informa. Se bater, nada ficou de fora nem foi lido errado.
 *
 * PDF que é imagem (digitalizado) não tem texto: devolve semTexto = true.
 * Testado em tests/pdfextrato.test.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PdfExtrato = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

  function semAcento(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function limpa(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  // ------------------------------------------------------------- linhas

  /** Itens do pdf.js ({ s, x, y, w } por página) → linhas, de cima para baixo. */
  function agruparLinhas(paginas, tolerancia) {
    var tol = tolerancia || 2.5, out = [];
    (paginas || []).forEach(function (itens, p) {
      var ord = itens.filter(function (i) { return i.s && String(i.s).trim(); })
        .slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; });
      var atual = null;
      ord.forEach(function (i) {
        if (atual && Math.abs(atual.y - i.y) <= tol) atual.itens.push(i);
        else { atual = { p: p, y: i.y, itens: [i] }; out.push(atual); }
      });
    });
    out.forEach(function (l) { l.itens.sort(function (a, b) { return a.x - b.x; }); });
    return out;
  }

  function textoDe(itens) { return limpa(itens.map(function (i) { return String(i.s).trim(); }).join(" ")); }

  // ------------------------------------------------------------- banco e conta

  var BANCOS = [
    ["banrisul", "Banrisul", /B\s?A\s?N\s?R\s?I\s?S\s?U\s?L/],
    ["sicoob", "Sicoob", /SICOOB|SISBR/],
    ["sicredi", "Sicredi", /Sicredi/i],
    ["unicred", "Unicred", /UNICRED|0800 940 0602/i],
    ["ailos", "Ailos", /AILOS|Banco: 085/i],
    ["bb", "Banco do Brasil", /Ouvidoria BB|Dt\. balancete/i],
    ["caixa", "Caixa", /SAC CAIXA|Al[oô] CAIXA|GERENCIADOR CAIXA/i],
    ["itau", "Itaú", /ita[uú]\.com\.br|Aplic Aut Mais|Ita[uú] Empresas/i],
    ["nubank", "Nubank", /nubank|Nu Pagamentos/i],
    ["inter", "Inter", /Banco Inter/i],
    ["c6", "C6 Bank", /C6 Bank/i],
    ["santander", "Santander", /Santander/i],
    ["bradesco", "Bradesco", /Bradesco/i]
  ];

  function detectarBanco(texto) {
    for (var i = 0; i < BANCOS.length; i++) if (BANCOS[i][2].test(texto)) return { id: BANCOS[i][0], nome: BANCOS[i][1] };
    return { id: "", nome: "Banco não identificado" };
  }

  function numeroConta(texto) {
    var caixa = /Conta:\s*\d+\s*\|\s*\d+\s*\|\s*([\d.\-]+)/i.exec(texto);
    if (caixa) return caixa[1];
    var m = /\b(?:conta(?:\s+corrente)?|cc)\b\s*[:.]*\s*(\d[\d.\-]*\d)(?![\/\d])/i.exec(texto);
    return m ? m[1] : "";
  }

  // ------------------------------------------------------------- valores

  // "1.234,56 C" "-R$ 548,56" "- R$ 28.000,00" "13.345,05-" "R$ 2.500,00D" "+ 3.000,00" "0,00*"
  // o menos vale colado no número ("-83.838,37") ou antes de "R$" ("- R$ 28.000,00"); hífen solto é do histórico
  var RE_VALOR = /(^|[\s$+(])(-(?:\s+(?=R\$))?)?(R\$\s*)?(-)?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?!\d)(\s?[CD](?![A-Za-zÀ-ú]))?(\*)?(-)?/g;

  function valoresDaLinha(texto) {
    var out = [], m;
    RE_VALOR.lastIndex = 0;
    while ((m = RE_VALOR.exec(texto))) {
      var n = Number(m[5].replace(/\./g, "") + "." + m[6]);
      var cd = m[7] ? m[7].trim() : "";
      var negativo = !!(m[2] || m[4] || m[9]) || cd === "D";
      out.push({ valor: n, sinal: negativo ? "D" : "C", explicito: !!(m[2] || m[4] || m[9] || cd), bloqueado: !!m[8],
        inicio: m.index + m[1].length, fim: RE_VALOR.lastIndex, texto: m[0].slice(m[1].length) });
    }
    return out;
  }

  // ------------------------------------------------------------- datas

  var RE_DATA_COMPLETA = /^(\d{2})\/(\d{2})\/(\d{4})\b/;
  var RE_DATA_CURTA_ANO = /^(\d{2})\/(\d{2})\/(\d{2})\b/;
  var RE_DATA_DIA_MES = /^(\d{2})\/(\d{2})(?![\/\d])/;
  var RE_NUBANK = /^(\d{2}) (JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ) (\d{4})\b/i;
  var RE_INTER = /^(\d{1,2}) de ([a-zçA-ZÇ]+) de (\d{4})\b/;

  function isoValido(a, m, d) {
    a = +a; m = +m; d = +d;
    if (!a || m < 1 || m > 12 || d < 1 || d > 31) return "";
    return a + "-" + pad(m) + "-" + pad(d);
  }

  /** Data no começo do texto. ref = { ano, mes } para datas sem ano. */
  function dataNoInicio(texto, ref, banco) {
    var m;
    if ((m = RE_DATA_COMPLETA.exec(texto))) return { iso: isoValido(m[3], m[2], m[1]), tam: m[0].length };
    if ((m = RE_DATA_CURTA_ANO.exec(texto))) return { iso: isoValido("20" + m[3], m[2], m[1]), tam: m[0].length };
    if ((m = RE_NUBANK.exec(texto))) return { iso: isoValido(m[3], MESES[m[2].toLowerCase()], m[1]), tam: m[0].length };
    if ((m = RE_INTER.exec(texto))) {
      var mes = MESES[semAcento(m[2]).toLowerCase().slice(0, 3)];
      if (mes) return { iso: isoValido(m[3], mes, m[1]), tam: m[0].length };
    }
    if ((m = RE_DATA_DIA_MES.exec(texto)) && ref.ano) {
      var mm = +m[2], ano = ref.ano;
      if (ref.mes && mm - ref.mes > 6) ano--;          // dezembro num extrato de janeiro
      else if (ref.mes && ref.mes - mm > 6) ano++;     // janeiro num extrato de dezembro
      var tam = m[0].length;
      var dupla = /^\d{2}\/\d{2} (\d{2}\/\d{2})(?![\/\d])/.exec(texto);   // C6: data de lançamento e contábil
      if (dupla) tam = dupla[0].length;
      return { iso: isoValido(ano, mm, m[1]), tam: tam };
    }
    if (banco === "banrisul" && ref.mes && (m = /^(\d{2}) (?=[A-Z])/.exec(texto))) return { iso: isoValido(ref.ano, ref.mes, m[1]), tam: 2 };
    return null;
  }

  /** Mês e ano de referência para datas sem ano. */
  function referenciaInicial(texto) {
    var m = /(?:per[ií]odo|periodo)[^0-9]{0,30}(\d{2})\/(\d{2})\/(\d{4})/i.exec(texto) ||
            /\((\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
    if (m) return { ano: +m[3], mes: +m[2] };
    var it = /\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s+(\d{4})\b/i.exec(texto);
    if (it) return { ano: +it[2], mes: MESES[it[1].toLowerCase()] };
    var q = /(\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
    return q ? { ano: +q[3], mes: +q[2] } : {};
  }

  // ------------------------------------------------------------- classificação das linhas

  var RE_SALDO = /^(saldo\b|s a l d o\b|[a-f] - saldo\b)|saldo (do dia|anterior|na data|ant em|em c\/c|aplic|bloqueado|inicial|final|disponivel|disponível|atual|de conta|em investimentos|no final|em \d)/i;
  var RE_PARADA = /^saldo final\b|totalizador de aplica|^lan[cç]amentos futuros|^resumo$|[uú]ltimos lan[cç]amentos|^saldos invest|^total\s+-?[\d.]+,\d{2}|^extrato emitido|saldo no final do per[ií]odo/i;
  var RE_RESUMO = /total de (entradas|sa[ií]das)|entradas:.*sa[ií]das:/i;
  var RE_RUIDO = /\b(SAC|OUVIDORIA)\b|CENTRAL DE RELACIONAMENTO|P[aá]g\. ?\d|^Folha \d|Extrato gerado|Tem alguma d[uú]vida|Caso a solu|dispon[ií]vel na Internet|Os dados acima|Informa[cç][oõ]es sujeitas|^VALORES EM R\$|^\d{2} DE [A-ZÇ]+ DE \d{4} a |^(data|dt\.?)\b.*\b(valor|saldo|hist|lan[cç]amento|descri)|^lan[cç]amento$|^cont[aá]bil\b|^\(cr[eé]ditos\)|^-+\+?-*$|^-{5,}|PARA SIMPLES CONFERENCIA|^Data Lançamento|^Período|^Atendimento|Fale com a gente/i;

  var RE_ATUALIZA_REF = /\((\d{2})\/(\d{2})\/(\d{4})|MOVIMENTOS ([A-Z]{3})\/(\d{4})/i;

  // ------------------------------------------------------------- leitura

  /**
   * paginas: [[{ s, x, y, w }]] — um array de itens por página.
   * Devolve { semTexto, banco, numeroConta, itens: [lançamentos], conferencia }.
   */
  function lerExtratoPdf(paginas) {
    var linhas = agruparLinhas(paginas);
    var textoTodo = linhas.map(function (l) { return textoDe(l.itens); }).join("\n");
    if (!textoTodo.trim()) return { ok: false, semTexto: true, itens: [] };

    var banco = detectarBanco(textoTodo);
    var ref = referenciaInicial(textoTodo);
    var docX = null, esquerda = null;

    // coluna "Documento", para separar o número do documento do histórico
    linhas.some(function (l) {
      var t = textoDe(l.itens);
      if (!/(data|dt\.)/i.test(t) || !/(valor|saldo|hist)/i.test(t)) return false;
      var d = l.itens.filter(function (i) { return /^(documento|doc\.?|dcto\.?|nr\. ?doc\.?)$/i.test(String(i.s).trim()); })[0];
      if (d) { docX = d.x + (d.w || 0) / 2; return true; }
      return false;
    });

    var dataAtual = null, sinalSecao = null, comecou = false, parou = false;
    var anchors = [], soltas = [], marcos = [];

    linhas.forEach(function (l, idx) {
      if (parou) return;
      var itens = l.itens;
      var textoInteiro = textoDe(l.itens);
      // margem esquerda da tabela: a coluna da primeira data encontrada (descarta legendas ao lado, como no Itaú)
      if (esquerda !== null) itens = itens.filter(function (i) { return i.x >= esquerda - 6; });
      var texto = textoDe(itens);
      if (!texto) return;

      var mref = RE_ATUALIZA_REF.exec(texto);
      if (mref) {
        if (mref[3]) ref = { ano: +mref[3], mes: +mref[2] };
        else if (MESES[mref[4].toLowerCase()]) ref = { ano: +mref[5], mes: MESES[mref[4].toLowerCase()] };
      }

      var d = dataNoInicio(texto, ref, banco.id);
      if (!d) {
        // data no começo do primeiro item que tenha data (há PDFs com texto solto à esquerda)
        for (var k = 1; k < itens.length && k < 4; k++) {
          var t2 = textoDe(itens.slice(k));
          var d2 = dataNoInicio(t2, ref, banco.id);
          if (d2 && d2.iso && valoresDaLinha(t2.slice(d2.tam)).length) { d = d2; texto = t2; itens = itens.slice(k); break; }
        }
      }
      var resto = d && d.iso ? limpa(texto.slice(d.tam)) : texto;
      if (d && d.iso && valoresDaLinha(resto).length) dataAtual = d.iso;
      else if (d && d.iso && comecou) dataAtual = d.iso;

      if (RE_RUIDO.test(texto) && !(d && d.iso && valoresDaLinha(resto).length)) return;

      if (/total de entradas/i.test(resto)) sinalSecao = "C";
      if (/total de sa[ií]das/i.test(resto)) sinalSecao = "D";

      var valores = valoresDaLinha(resto);
      var semCodigo = resto.replace(/^((\d[\d.\/-]*|[a-z])\s+)+/, "");
      var ehSaldo = RE_SALDO.test(resto) || RE_SALDO.test(semCodigo) || RE_SALDO.test(texto) || RE_SALDO.test(textoInteiro);

      if (comecou && RE_PARADA.test(resto)) {
        if (ehSaldo && valores.length && banco.id !== "itau") marcos.push({ data: dataAtual, saldo: assinado(valores[valores.length - 1]), tipo: "fim" });
        parou = true; return;
      }

      if (ehSaldo) {
        // quadro de resumo ("A - Saldo de Conta Corrente"…) mostra o saldo da emissão, não serve para conferir
        if (valores.length && !/aplic|bloqueado|invest|dispon/i.test(textoInteiro) && !/^[a-f] - saldo/i.test(textoInteiro)) {
          // C6 escreve "Saldo do dia 01/09/25": a data está no meio
          var dm = /(\d{2})\/(\d{2})\/(\d{2,4})/.exec(resto);
          var dataSaldo = dm ? isoValido(dm[3].length === 2 ? "20" + dm[3] : dm[3], dm[2], dm[1]) : dataAtual;
          var inicial = /anterior|inicial|ant em|saldo em \d/i.test(resto);
          if (banco.id === "itau" && inicial) return;
          marcos.push({ data: dataSaldo, saldo: assinado(valores[valores.length - 1]), tipo: inicial ? "inicio" : "dia", ordem: anchors.length });
        }
        return;
      }
      if (RE_RESUMO.test(resto) || RE_RESUMO.test(textoInteiro)) return;

      if (valores.length && dataAtual) {
        if (!comecou && d && d.iso) esquerda = itens[0].x;   // coluna da data do primeiro lançamento
        comecou = true;
        var v = valores[0];
        var sinal = v.explicito ? v.sinal : (sinalSecao || "C");
        var antes = resto.slice(0, v.inicio).trim();
        var doc = "";
        if (docX !== null) {
          var it = itens.filter(function (i) { var c = i.x + (i.w || 0) / 2; return Math.abs(c - docX) < 45 || Math.abs(i.x - docX) < 45; })[0];
          if (it) {
            doc = limpa(String(it.s).replace(RE_VALOR, " "));
            if (doc && antes.indexOf(doc) > -1) antes = limpa(antes.replace(doc, " "));
            if (!/\d/.test(doc)) doc = doc.length <= 4 ? doc : "";
          }
        }
        anchors.push({
          idx: idx, p: l.p, y: l.y, data: dataAtual, valorNum: v.valor, sign: sinal, bloqueado: v.bloqueado,
          desc: limpa(antes.replace(/^[a-z](\s+|$)/, "").replace(/^(\d[\d.]*\s+)+(?=[A-Za-zÀ-ú])/, "")), doc: doc, detalhes: [],
          saldo: valores.length > 1 ? assinado(valores[valores.length - 1]) : null
        });
        return;
      }
      soltas.push({ idx: idx, p: l.p, y: l.y, texto: resto });
    });

    // texto solto vai para o lançamento mais próximo na mesma página (empate: o de cima)
    soltas.forEach(function (s) {
      var melhor = null, dist = Infinity;
      anchors.forEach(function (a) {
        if (a.p !== s.p) return;
        var dd = Math.abs(a.y - s.y);
        if (dd < dist - 0.5 || (Math.abs(dd - dist) <= 0.5 && a.y > s.y)) { dist = dd; melhor = a; }
      });
      if (melhor && dist <= 22) {
        if (s.y > melhor.y) melhor.acima = limpa((melhor.acima || "") + " " + s.texto);   // linha acima: começo do histórico
        else melhor.detalhes.push(s.texto);
      }
    });

    var itensSaida = anchors.map(function (a) {
      var completo = limpa([a.acima || "", a.desc].concat(a.detalhes).join(" "));
      var cpf = (/\b\d{2}\.\d{3}\.\d{3}[\/ ]?\d{4}-?\d{2}\b/.exec(completo) || /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.exec(completo) ||
                 /(?:PIX(?: RECEBIDO| ENVIADO)?|TED|TRANSF[A-Z ]*|BOLETO|LIQUIDACAO[A-Z ]*|DEBITO[A-Z/ ]*|CONVENIOS)\s+(\d{14}|\d{11})\b/i.exec(completo) || ["", ""]);
      cpf = cpf[1] && /^\d+$/.test(cpf[1]) ? cpf[1] : cpf[0];
      var nomeM = /(?:FAV\.:|REM\.:|Pix (?:recebido de|enviado para)|(?:DEB|CRED|PGTO) PIX \/|Recebimento Pix|Pagamento Pix)\s*([^()]+?)\s*(?:\)|\d{2}\.\d{3}|$)/i.exec(completo) ||
                  /"(?:[\d :-]+)?([^"]+)"/.exec(completo) ||
                  /\b\d{14}\s+([A-ZÀ-Ú][A-ZÀ-Ú .&\-]{2,})/.exec(completo) ||
                  /\b\d{2}:\d{2}\s+([A-ZÀ-Ú][A-ZÀ-Ú0-9 .&\-]{2,})$/.exec(a.detalhes[0] || "");
      var nome = nomeM ? limpa(nomeM[1]).replace(/^\d[\d.\s]*\s(?=[A-Za-z])/, "") : "";
      if (!nome && banco.id === "bb" && a.detalhes.length && /^[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 &.\-\/]{3,}$/.test(a.detalhes[0]) && !/^\d+$/.test(a.detalhes[0])) nome = a.detalhes[0];
      return {
        data: a.data, valorNum: a.valorNum, sign: a.sign, bloqueado: a.bloqueado || undefined,
        desc: completo.slice(0, 200), doc: a.doc, detalhes: a.detalhes,
        nome: nome, cpf: cpf, saldoLinha: a.saldo
      };
    });

    return {
      ok: true, semTexto: false, banco: banco, numeroConta: numeroConta(textoTodo),
      itens: itensSaida, conferencia: conferirSaldos(itensSaida, marcos)
    };
  }

  function assinado(v) { return v.sinal === "D" ? -v.valor : v.valor; }

  // ------------------------------------------------------------- conferência

  /**
   * Para cada dia com saldo conhecido: saldo do dia anterior + lançamentos = saldo do dia.
   * Saldos vêm das linhas "Saldo do dia/anterior" e da última coluna de saldo de cada dia.
   */
  function conferirSaldos(itens, marcos) {
    var cent = function (n) { return Math.round(n * 100); };
    var porDia = {}, saldoDia = {}, inicio = null, ordemDatas = [];
    itens.forEach(function (i) {
      if (!porDia[i.data]) { porDia[i.data] = 0; ordemDatas.push(i.data); }
      porDia[i.data] += (i.sign === "D" ? -1 : 1) * cent(i.valorNum);
      if (i.saldoLinha !== null && i.saldoLinha !== undefined) saldoDia[i.data] = cent(i.saldoLinha);
    });
    marcos.forEach(function (m) {
      if (m.tipo === "inicio") { if (inicio === null) inicio = cent(m.saldo); }
      else if (m.data) saldoDia[m.data] = cent(m.saldo);
    });
    // a ordem do extrato pode ser crescente ou decrescente: confere em ordem de data
    var datas = Object.keys(porDia).concat(Object.keys(saldoDia)).filter(function (d, i, a) { return d && a.indexOf(d) === i; }).sort();
    var anterior = inicio, acumulado = 0, ok = 0, total = 0, divergencias = [];
    datas.forEach(function (d) {
      acumulado += porDia[d] || 0;
      if (saldoDia[d] === undefined) return;
      if (anterior !== null) {
        total++;
        if (anterior + acumulado === saldoDia[d]) ok++;
        else if (anterior === inicio && -anterior + acumulado === saldoDia[d]) ok++;   // saldo inicial impresso sem o sinal
        else divergencias.push({ data: d, esperado: (anterior + acumulado) / 100, extrato: saldoDia[d] / 100 });
      }
      anterior = saldoDia[d]; acumulado = 0;
    });
    return { conferidos: ok, total: total, divergencias: divergencias };
  }

  return {
    agruparLinhas: agruparLinhas, detectarBanco: detectarBanco, numeroConta: numeroConta,
    valoresDaLinha: valoresDaLinha, dataNoInicio: dataNoInicio, referenciaInicial: referenciaInicial,
    lerExtratoPdf: lerExtratoPdf, conferirSaldos: conferirSaldos
  };
});
