/*
 * integracao.js — integração contábil com o SCI Único.
 *
 * Porte fiel das macros da planilha "Setembro_v19-CORRETA.xlsm"
 * (Module1, "CELESP - Integracao Contabil v8-v10"). Cada função cita a
 * rotina VBA de origem. Quando o VBA tem um comportamento estranho, ele foi
 * mantido igual (para o TXT sair idêntico ao da planilha) e marcado com
 * "COMPORTAMENTO DO VBA".
 *
 * Funções puras: sem DOM, sem armazenamento. Testadas em tests/integracao.test.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Integracao = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ------------------------------------------------ regras contábeis (VBA: Const)
  var REGRAS = {
    HP_RECEBIMENTO: "3708",
    HP_PAGAMENTO: "3026",
    CRED_RECEBIMENTO: "18",
    CRED_JUROS_RECEBIDOS: "2284",
    DEB_PAGAMENTO_DEFAULT: "148"
  };

  var CATEGORIAS = ["Recebimento", "Despesa", "Pagamento", "Aplicações", "Resgate"];
  var MODELOS_DOC = ["NF", "NFS-E", "NFE", "NFCE", "REC", "BOL", "TED", "DOC", "PIX", "OUT"];

  var CABECALHO_TXT = ["Data", "Nome", "CNPJ/CPF", "Cta Debito", "Duplicata/Doc", "Centro Custos",
    "Natureza Gastos", "Cta Credito", "CNPJ Unidade", "Codigo Unidade", "Banco", "Cta Banco",
    "Valor", "HP", "Complemento HP"];

  // ------------------------------------------------------------- utilidades

  function limpa(s) { return s === null || s === undefined ? "" : String(s).trim(); }
  function chave(s) {
    return limpa(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  }
  function soDigitos(s) { return limpa(s).replace(/\D/g, ""); }
  function ehAplicacao(cat) { return cat === "Aplicações" || cat === "Aplicacoes"; }
  function ehVazioOuPlaceholder(s) { var k = chave(s); return !k || k === "selecionar" || k === "selecionar..." || k === "selecionar…"; }

  /** VBA NormalizeUnitName: corrige erros conhecidos de digitação. */
  function normalizaUnidade(nome) {
    var s = limpa(nome);
    var k = s.toLowerCase();
    if (k === "ciciuma" || k === "ciciúma") return "Criciúma";
    return s;
  }

  /** VBA ParseContaFromName: "Sicredi 19915-0 Conta 627" → "627". Só aceita número inteiro. */
  function contaDoNome(nome) {
    var partes = limpa(nome).split(" ");
    for (var i = 0; i < partes.length - 1; i++) {
      if (partes[i].toLowerCase() === "conta") {
        var c = limpa(partes[i + 1]);
        if (/^\d+$/.test(c)) return String(parseInt(c, 10));
      }
    }
    return "";
  }

  /** VBA FormatCNPJ: 14 dígitos → 00.000.000/0000-00, 11 → 000.000.000-00, senão como veio. */
  function formatCNPJ(v) {
    var s = limpa(v);
    if (!s) return "";
    if (/\.0$/.test(s)) s = s.slice(0, -2);
    var d = soDigitos(s);
    if (d.length === 14) return d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5, 8) + "/" + d.slice(8, 12) + "-" + d.slice(12);
    if (d.length === 11) return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9);
    return limpa(v);
  }

  /** VBA FormatValor: sempre positivo, 2 casas, vírgula, sem milhar. */
  function valorTxt(valorNum) { return Math.abs(Number(valorNum) || 0).toFixed(2).replace(".", ","); }

  /** VBA: documento numérico vira inteiro; vírgulas são removidas. */
  function docTxt(doc) {
    var s = limpa(doc);
    if (s && !isNaN(Number(s.replace(",", ".")))) s = String(Math.round(Number(s.replace(",", "."))));
    return s.replace(/,/g, "");
  }

  function dataBR(iso) { var p = limpa(iso).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : limpa(iso); }
  function dataAAAAMMDD(iso) { return limpa(iso).replace(/-/g, ""); }

  // ------------------------------------------------------ coleta (VBA CollectTransactions)

  /**
   * fontes: [{ nome, contaBanco, lancamentos: [...] }]
   *   nome        → nome da aba do banco (vai no TXT, coluna "Banco")
   *   contaBanco  → conta contábil do banco no Único (ex.: "643")
   * Entra no TXT o lançamento com data, categoria e valor. Sem unidade só entra
   * se for Aplicações (vai para Matriz).
   */
  function coletarTransacoes(fontes) {
    var out = [];
    (fontes || []).forEach(function (f) {
      (f.lancamentos || []).forEach(function (e) {
        var cat = ehVazioOuPlaceholder(e.categoria) ? "" : limpa(e.categoria);
        var uni = ehVazioOuPlaceholder(e.unidade) ? "" : normalizaUnidade(e.unidade);
        if (!e.data || !cat || e.valorNum === undefined || e.valorNum === null || e.valorNum === "") return;
        if (!uni) {
          if (ehAplicacao(cat)) uni = "Matriz";
          else return;
        }
        out.push({
          data: e.data, banco: f.nome, doc: limpa(e.doc), modelo: limpa(e.modelo), desc: limpa(e.desc),
          nome: limpa(e.nome), cnpj: formatCNPJ(e.cpf), categoria: cat, unidade: uni,
          natureza: limpa(e.natureza), conta: limpa(e.conta), valorNum: Math.abs(Number(e.valorNum)), sign: e.sign === "D" ? "D" : "C",
          contaBanco: limpa(f.contaBanco)
        });
      });
    });
    return out;
  }

  // ---------------------------------------------- contas contábeis (VBA GetLineMappings)

  function mapeamentoContabil(tx) {
    var banco = limpa(tx.contaBanco), contaM = limpa(tx.conta), nat = chave(tx.natureza);
    switch (tx.categoria) {
      case "Recebimento":
        return { ctaDeb: banco, ctaCred: nat === "juros recebidos" ? REGRAS.CRED_JUROS_RECEBIDOS : REGRAS.CRED_RECEBIMENTO, hp: REGRAS.HP_RECEBIMENTO };
      case "Pagamento":
        return { ctaDeb: REGRAS.DEB_PAGAMENTO_DEFAULT, ctaCred: banco, hp: REGRAS.HP_PAGAMENTO };
      case "Despesa":
        return { ctaDeb: contaM || REGRAS.DEB_PAGAMENTO_DEFAULT, ctaCred: banco, hp: "" };
      case "Aplicações":
      case "Aplicacoes":
        var cod = contaM || REGRAS.DEB_PAGAMENTO_DEFAULT;
        return nat.indexOf("resgate") > -1 ? { ctaDeb: banco, ctaCred: cod, hp: "" } : { ctaDeb: cod, ctaCred: banco, hp: "" };
      default:
        // COMPORTAMENTO DO VBA: outras categorias (Resgate, Pendente…) saem sem contas.
        return { ctaDeb: "", ctaCred: "", hp: "" };
    }
  }

  // ------------------------------------------ ordenação e distribuição (VBA SortTransactions, DistribuirPorUnidade)

  function ordemCategoria(cat) {
    return { "Despesa": 1, "Pagamento": 2, "Recebimento": 3, "Aplicações": 4, "Aplicacoes": 4 }[cat] || 5;
  }

  function ordenarTransacoes(lista) {
    return lista.map(function (t, i) { return { t: t, i: i }; }).sort(function (a, b) {
      return (ordemCategoria(a.t.categoria) - ordemCategoria(b.t.categoria)) ||
        String(a.t.data).localeCompare(String(b.t.data)) || (a.i - b.i);
    }).map(function (x) { return x.t; });
  }

  /** Agrupa por unidade, ordena (Despesa > Pagamento > Recebimento > Aplicações, depois data) e calcula as contas. */
  function distribuirPorUnidade(transacoes) {
    var grupos = {}, ordem = [];
    transacoes.forEach(function (t) {
      if (!grupos[t.unidade]) { grupos[t.unidade] = []; ordem.push(t.unidade); }
      grupos[t.unidade].push(t);
    });
    return ordem.map(function (u) {
      return {
        unidade: u,
        linhas: ordenarTransacoes(grupos[u]).map(function (t) {
          var m = mapeamentoContabil(t);
          return Object.assign({}, t, m);
        })
      };
    });
  }

  /** VBA BuildJurosRecebidosTab: lançamentos com Natureza "Juros Recebidos", com as contas. */
  function jurosRecebidos(transacoes) {
    return transacoes.filter(function (t) { return chave(t.natureza) === "juros recebidos"; })
      .map(function (t) { return Object.assign({}, t, mapeamentoContabil(t)); });
  }

  /** Lançamentos que vão sair sem conta de débito ou crédito — para avisar antes de gerar. */
  function semConta(linhas) {
    return linhas.filter(function (l) { return !l.ctaDeb || !l.ctaCred; });
  }

  // ------------------------------------------------ tabelas de referência

  /** Tabela de Unidades (colunas: nome, CNPJ, código SCI) → info da unidade. */
  function infoUnidade(tabela, nome) {
    var k = chave(nome);
    for (var i = 0; i < (tabela || []).length; i++) {
      var l = tabela[i].linha || [];
      if (chave(l[0]) === k) return { nome: limpa(l[0]), cnpj: limpa(l[1]), codigo: limpa(l[2]) };
    }
    return null;
  }

  /**
   * VBA: procura o nome da unidade na 1ª coluna de "Centro de Custos" e usa a 2ª.
   * COMPORTAMENTO DO VBA: na planilha atual a 1ª coluna é o código (1, 2…), então
   * nunca encontra e o centro de custo sai vazio. Mantido igual.
   */
  function centroDeCusto(tabela, nomeUnidade) {
    var k = nomeUnidade.toLowerCase();
    for (var i = 0; i < (tabela || []).length; i++) {
      var l = tabela[i].linha || [];
      if (limpa(l[0]).toLowerCase() === k) return limpa(l[1]);
    }
    return "";
  }

  function nomeArquivoUnidade(u) { return u.split(" ").join("_"); }

  // ------------------------------------------ TXT formato atual (VBA BuildTxtLine / GerarTXTs)

  function linhaTxt(l, unidadeInfo) {
    var doc = docTxt(l.doc);
    var nome = limpa(l.nome).replace(/,/g, " ");
    return [
      dataBR(l.data), nome, l.cnpj, l.ctaDeb, doc, l.unidade, l.natureza, l.ctaCred,
      unidadeInfo.cnpj, unidadeInfo.codigo, l.banco, l.contaBanco, valorTxt(l.valorNum), l.hp,
      doc ? doc + " - " + nome : nome
    ].join("\t");
  }

  /**
   * Um arquivo por unidade e categoria: "RECEBIMENTO_Passo_Fundo.txt".
   * Só gera para unidades que estão na Tabela de Unidades (igual ao VBA).
   * Conteúdo: cabeçalho + linhas separadas por TAB, fim de linha CRLF, UTF-8 sem BOM.
   */
  function gerarTxts(distribuicao, tabelaUnidades) {
    var arquivos = [];
    (tabelaUnidades || []).forEach(function (row) {
      var info = infoUnidade([row], (row.linha || [])[0]);
      if (!info || !info.nome) return;
      var grupo = distribuicao.filter(function (d) { return chave(d.unidade) === chave(info.nome); })[0];
      if (!grupo) return;
      var porCat = {}, ordem = [];
      grupo.linhas.forEach(function (l) {
        if (!porCat[l.categoria]) { porCat[l.categoria] = ""; ordem.push(l.categoria); }
        porCat[l.categoria] += linhaTxt(l, info) + "\r\n";
      });
      ordem.forEach(function (cat) {
        arquivos.push({
          nome: cat.toUpperCase() + "_" + nomeArquivoUnidade(info.nome) + ".txt",
          conteudo: CABECALHO_TXT.join("\t") + "\r\n" + porCat[cat]
        });
      });
    });
    return arquivos;
  }

  // ------------------------------------------ TXT SCI Único (VBA BuildUnicoLine / GerarTXTsUnico)

  function linhaUnico(l, seq, lote, centroCusto) {
    var valor = valorTxt(l.valorNum).replace(",", ".");
    var doc = docTxt(l.doc);
    var nome = limpa(l.nome).replace(/,/g, " ");
    var cnpj = soDigitos(l.cnpj);
    var complemento = (doc ? doc + " - " + nome : nome).replace(/,/g, " ");
    var cnpjDeb = "", cnpjCred = "";
    if (l.categoria === "Pagamento") cnpjCred = cnpj;
    else if (l.categoria === "Recebimento" || l.categoria === "Despesa" || ehAplicacao(l.categoria)) cnpjDeb = cnpj;

    var linha = ("000000" + seq).slice(-6) + "," + dataAAAAMMDD(l.data) + "," + l.ctaDeb + "," + l.ctaCred + "," +
      valor + "," + l.hp + ",\"" + complemento + "\"," + (doc ? "DCTO" + doc : "DCTO") + "," + lote + "," +
      cnpjDeb + "," + cnpjCred;
    // COMPORTAMENTO DO VBA: com centro de custo são 6 campos a mais; sem, 4 vazios.
    linha += centroCusto ? ",D," + centroCusto + "," + valor + ",C," + centroCusto + "," + valor : ",,,,";
    return linha + ",A";
  }

  /** Um arquivo por unidade: "UNICO_Passo_Fundo.txt". Sequência reinicia em cada unidade. Sem cabeçalho. */
  function gerarTxtsUnico(distribuicao, tabelaUnidades, tabelaCentroCustos) {
    var arquivos = [];
    (tabelaUnidades || []).forEach(function (row) {
      var info = infoUnidade([row], (row.linha || [])[0]);
      if (!info || !info.nome) return;
      var grupo = distribuicao.filter(function (d) { return chave(d.unidade) === chave(info.nome); })[0];
      if (!grupo || !grupo.linhas.length) return;
      var cc = centroDeCusto(tabelaCentroCustos, info.nome);
      var conteudo = grupo.linhas.map(function (l, i) {
        var lote = l.categoria.toUpperCase() + "_" + nomeArquivoUnidade(info.nome);
        return linhaUnico(l, i + 1, lote, cc) + "\r\n";
      }).join("");
      arquivos.push({ nome: "UNICO_" + nomeArquivoUnidade(info.nome) + ".txt", conteudo: conteudo });
    });
    return arquivos;
  }

  // ------------------------------------------------------ painel Master (VBA FormatMaster)

  /**
   * Por unidade: lançamentos (de todas as fontes) com aquela unidade; classificado = tem categoria.
   * Por fonte: lançamentos com data; classificado = tem categoria.
   */
  function estatisticasMaster(fontes, nomesUnidades) {
    var unidades = (nomesUnidades || []).map(function (u) {
      var total = 0, cls = 0;
      fontes.forEach(function (f) {
        (f.lancamentos || []).forEach(function (e) {
          if (ehVazioOuPlaceholder(e.unidade) || chave(normalizaUnidade(e.unidade)) !== chave(u)) return;
          total++;
          if (!ehVazioOuPlaceholder(e.categoria)) cls++;
        });
      });
      return { nome: u, classificados: cls, pendentes: total - cls, total: total, pct: total ? cls / total * 100 : null };
    });
    var bancos = fontes.map(function (f) {
      var total = 0, cls = 0;
      (f.lancamentos || []).forEach(function (e) {
        if (!e.data) return;
        total++;
        if (!ehVazioOuPlaceholder(e.categoria)) cls++;
      });
      return { id: f.id, nome: f.nome, classificados: cls, pendentes: total - cls, total: total };
    });
    return { unidades: unidades, bancos: bancos };
  }

  return {
    REGRAS: REGRAS, CATEGORIAS: CATEGORIAS, MODELOS_DOC: MODELOS_DOC, CABECALHO_TXT: CABECALHO_TXT,
    normalizaUnidade: normalizaUnidade, contaDoNome: contaDoNome, formatCNPJ: formatCNPJ,
    valorTxt: valorTxt, docTxt: docTxt, ehVazioOuPlaceholder: ehVazioOuPlaceholder,
    coletarTransacoes: coletarTransacoes, mapeamentoContabil: mapeamentoContabil,
    ordenarTransacoes: ordenarTransacoes, distribuirPorUnidade: distribuirPorUnidade,
    jurosRecebidos: jurosRecebidos, semConta: semConta,
    infoUnidade: infoUnidade, centroDeCusto: centroDeCusto,
    linhaTxt: linhaTxt, gerarTxts: gerarTxts, linhaUnico: linhaUnico, gerarTxtsUnico: gerarTxtsUnico,
    estatisticasMaster: estatisticasMaster
  };
});
