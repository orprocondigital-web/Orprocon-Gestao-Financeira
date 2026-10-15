/*
 * importacao.js — leitura da planilha mensal inteira (.xlsm/.xlsx).
 *
 * Recebe as abas já convertidas em linhas (array de arrays) e devolve um plano
 * do que importar: contas bancárias, movimentos, cadastros, a competência (mês)
 * e os problemas encontrados. Não toca em tela nem em armazenamento.
 * Usado pelo app (js/app.js) e testado em tests/importacao.test.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"), require("./integracao.js"));
  else root.Importacao = factory(root.Core, root.Integracao);
})(typeof self !== "undefined" ? self : this, function (Core, I) {
  "use strict";

  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  function limpa(v) { return v === null || v === undefined ? "" : String(v).trim(); }
  function chave(s) { return limpa(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " "); }

  /** "2026-08" → "Agosto de 2026" */
  function nomeCompetencia(c) {
    var m = /^(\d{4})-(\d{2})$/.exec(c || "");
    if (!m) return c || "";
    var mes = MESES[+m[2] - 1];
    return mes.charAt(0).toUpperCase() + mes.slice(1) + " de " + m[1];
  }

  /** Mês mais frequente entre as datas dos lançamentos (AAAA-MM), ou "". */
  function competenciaDominante(lancamentos) {
    var cont = {}, melhor = "", max = 0;
    lancamentos.forEach(function (e) {
      var c = limpa(e.data).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(c)) return;
      cont[c] = (cont[c] || 0) + 1;
      if (cont[c] > max) { max = cont[c]; melhor = c; }
    });
    return melhor;
  }

  /**
   * "SICOOB  58.289-1 Conta 7486" → { banco: "SICOOB", numero: "58.289-1", contabil: "7486" }.
   * Sem "Conta <número>" no fim → null (não é aba de banco).
   */
  function nomeAbaBanco(nome) {
    var partes = limpa(nome).split(/\s+/);
    var i = partes.length - 2;
    if (i < 1 || partes[i].toLowerCase() !== "conta" || !/^\d+$/.test(partes[i + 1])) return null;
    var antes = partes.slice(0, i);
    var numero = antes.length > 1 ? antes.pop() : "";
    return { banco: antes.join(" ").toUpperCase(), numero: numero, contabil: String(parseInt(partes[i + 1], 10)) };
  }

  var CADASTROS = {
    "clientes": "cad-clientes", "clientes_parte1": "cad-clientes", "clientes_parte2": "cad-clientes",
    "fornecedores": "cad-fornecedores", "plano de contas": "cad-plano", "centro de custos": "cad-custos",
    "tabela de bancos": "cad-bancos", "tabela de unidades": "cad-unidades"
  };
  var MOVIMENTOS = { "pagamento em dinheiro": "mov-dinheiro", "juros recebidos": "mov-juros" };

  /** Linhas de uma aba de lançamentos → lançamentos do sistema (mesma regra da importação aba a aba). */
  function lancamentosDaAba(rows, opcoes) {
    var comDataMov = !!(opcoes && opcoes.comDataMov);
    var headerIdx = Core.detectHeaderRow(rows);
    var col = Core.buildColumnMap(rows[headerIdx]);
    var get = function (row, k) { return col[k] !== undefined ? limpa(row[col[k]]) : ""; };
    var semPlaceholder = function (v) { return I.ehVazioOuPlaceholder(v) ? "" : v; };
    var itens = [], semData = 0, prefixo = (opcoes && opcoes.prefixoId) || ("e" + Date.now());
    if (col.data === undefined || col.valor === undefined) return { ok: false, itens: itens, semData: 0 };

    for (var r = headerIdx + 1; r < rows.length; r++) {
      var row = rows[r];
      if (!row || row.every(function (c) { return c === "" || c === null || c === undefined; })) continue;
      var data = Core.toIsoDate(row[col.data]);
      var v = Core.parseValorCell(row[col.valor]);
      if (!data || !v) {
        if (v && semPlaceholder(get(row, "categoria"))) semData++;   // classificada, mas sem data
        continue;
      }
      itens.push({
        id: prefixo + "-" + r,
        data: data,
        dataMov: comDataMov ? Core.toIsoDate(col.dataMov !== undefined ? row[col.dataMov] : "") : "",
        desc: get(row, "desc") || get(row, "nome") || get(row, "natureza") || "SEM DESCRIÇÃO",
        doc: get(row, "doc"), modelo: semPlaceholder(get(row, "modelo")),
        valorNum: v.valorNum, sign: v.sign, bloqueado: !!v.bloqueado,
        valorInvalido: !!v.invalido, valorOriginal: v.invalido ? limpa(row[col.valor]) : "",
        categoria: semPlaceholder(get(row, "categoria")), unidade: semPlaceholder(get(row, "unidade")),
        natureza: semPlaceholder(get(row, "natureza")), conta: get(row, "conta"),
        nome: get(row, "nome"), cpf: get(row, "cpf")
      });
    }
    return { ok: true, itens: itens, semData: semData };
  }

  /** Linhas de uma aba de cadastro → { cabecalho, itens: [{ id, nome, linha }] }. */
  function cadastroDaAba(rows, prefixoId) {
    var headerIdx = 0;
    var cab = (rows[0] || []).map(limpa);
    var col = Core.buildColumnMap(rows[0]);
    var itens = [], vistos = {}, prefixo = prefixoId || ("c" + Date.now());
    for (var r = headerIdx + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var nome = (col.nome !== undefined ? limpa(row[col.nome]) : "") || (col.desc !== undefined ? limpa(row[col.desc]) : "");
      if (!nome) {
        for (var c = 0; c < row.length; c++) {
          var cel = limpa(row[c]);
          if (cel.length > 1 && isNaN(Number(cel))) { nome = cel; break; }
        }
      }
      if (!nome || vistos[nome]) continue;
      vistos[nome] = true;
      itens.push({
        id: prefixo + "-" + r, nome: nome,
        linha: row.map(function (x) { return x instanceof Date ? Core.brDate(Core.toIsoDate(x)) : (x === null || x === undefined ? "" : x); })
      });
    }
    return { cabecalho: cab, itens: itens };
  }

  function ehAbaDeUnidade(nome, rows, nomesUnidades) {
    var cab = (rows[0] || []).map(chave);
    if (cab.indexOf("cta debito") > -1 && cab.indexOf("cta credito") > -1) return true;
    return nomesUnidades.indexOf(chave(nome)) > -1;
  }

  /**
   * Problemas da Tabela de unidades que estragam os TXTs:
   * nome repetido (cada linha é uma empresa no Único) e unidade usada nos lançamentos que não está na tabela.
   */
  function problemasTabelaUnidades(tabela, unidadesUsadas) {
    var problemas = [], porNome = {};
    (tabela || []).forEach(function (t) {
      var l = t.linha || [], k = chave(l[0]);
      if (!k) return;
      (porNome[k] = porNome[k] || []).push(l);
    });
    Object.keys(porNome).forEach(function (k) {
      var ls = porNome[k];
      if (ls.length > 1) problemas.push("A Tabela de unidades tem \"" + limpa(ls[0][0]) + "\" " + ls.length + " vezes (códigos SCI " +
        ls.map(function (l) { return limpa(l[2]) || "?"; }).join(", ") + "). Só a primeira gera TXT; confira se uma delas é outra unidade com o nome trocado.");
    });
    var faltando = {};
    (unidadesUsadas || []).forEach(function (u) { if (u && !porNome[chave(u)]) faltando[u] = true; });
    Object.keys(faltando).forEach(function (u) {
      problemas.push("A unidade \"" + u + "\" tem lançamentos, mas não está na Tabela de unidades: não sai TXT para ela.");
    });
    return problemas;
  }

  /**
   * Analisa a planilha inteira. abas: [{ nome, rows }] na ordem da pasta de trabalho.
   * Devolve o plano de importação; nada é gravado aqui.
   */
  function analisarPlanilha(abas) {
    var plano = { bancos: [], movimentos: [], cadastros: {}, ignoradas: [], competencia: "", avisos: [], totalLancamentos: 0 };

    // a Tabela de unidades primeiro: ela diz quais abas são de unidade (geradas pela macro)
    var nomesUnidades = [], tabelaBruta = null;
    abas.forEach(function (a) {
      if (chave(a.nome) === "tabela de unidades") {
        tabelaBruta = (a.rows || []).slice(1).map(function (r) { return { linha: r }; });
        tabelaBruta.forEach(function (t) { if (limpa(t.linha[0])) nomesUnidades.push(chave(t.linha[0])); });
      }
    });
    ["matriz", "chapeco", "criciuma", "florianopolis", "passo fundo", "tubarao"].forEach(function (u) {
      if (nomesUnidades.indexOf(u) < 0) nomesUnidades.push(u);
    });

    abas.forEach(function (a, ordem) {
      var k = chave(a.nome), rows = a.rows || [];
      if (k === "master") return plano.ignoradas.push({ nome: a.nome, motivo: "painel da planilha" });

      var idCad = CADASTROS[k.replace(/\s+/g, " ")] || CADASTROS[k.replace(/\s/g, "_")];
      if (idCad) {
        var cad = cadastroDaAba(rows, idCad + "-" + ordem);
        var atual = plano.cadastros[idCad];
        if (atual) {                         // Clientes_Parte1 + Clientes_Parte2
          var vistos = {};
          atual.itens.forEach(function (i) { vistos[i.nome] = true; });
          cad.itens.forEach(function (i) { if (!vistos[i.nome]) atual.itens.push(i); });
        } else plano.cadastros[idCad] = cad;
        return;
      }

      if (k.indexOf("digitacao compras") === 0) return plano.ignoradas.push({ nome: a.nome, motivo: "aba de testes da planilha" });

      var idMov = MOVIMENTOS[k];
      if (idMov) {
        var lm = lancamentosDaAba(rows, { prefixoId: idMov + "-" + ordem });
        plano.movimentos.push({ id: idMov, nomeAba: a.nome, lancamentos: lm.itens, semData: lm.semData });
        return;
      }

      if (ehAbaDeUnidade(a.nome, rows, nomesUnidades)) return plano.ignoradas.push({ nome: a.nome, motivo: "aba de unidade (o sistema gera ao distribuir)" });

      var b = nomeAbaBanco(a.nome);
      if (b) {
        var lb = lancamentosDaAba(rows, { comDataMov: true, prefixoId: "b" + b.contabil + "-" + ordem });
        if (!lb.ok) return plano.ignoradas.push({ nome: a.nome, motivo: "sem colunas Data e Valor" });
        plano.bancos.push({ nomeAba: a.nome.replace(/\s+$/, ""), banco: b.banco, numero: b.numero, contabil: b.contabil,
          lancamentos: lb.itens, semData: lb.semData });
        plano.totalLancamentos += lb.itens.length;
        return;
      }

      plano.ignoradas.push({ nome: a.nome, motivo: "não reconhecida" });
    });

    var todos = [];
    plano.bancos.forEach(function (b) { todos = todos.concat(b.lancamentos); });
    plano.movimentos.forEach(function (m) { if (m.id === "mov-dinheiro") todos = todos.concat(m.lancamentos); });
    plano.competencia = competenciaDominante(todos);

    var foraDoMes = todos.filter(function (e) { return plano.competencia && e.data.slice(0, 7) !== plano.competencia; }).length;
    if (foraDoMes) plano.avisos.push(foraDoMes + " lançamento(s) têm data fora de " + nomeCompetencia(plano.competencia) + ". Eles entram nesta competência mesmo assim.");

    var semData = 0;
    plano.bancos.concat(plano.movimentos).forEach(function (x) { semData += x.semData; });
    if (semData) plano.avisos.push(semData + " linha(s) classificadas estão sem data e ficaram de fora (a planilha também não as envia ao Único).");

    var usadas = {};
    todos.forEach(function (e) { var u = I.normalizaUnidade(e.unidade); if (u && e.categoria) usadas[u] = true; });
    if (tabelaBruta) plano.avisos = plano.avisos.concat(problemasTabelaUnidades(tabelaBruta, Object.keys(usadas)));
    else plano.avisos.push("A planilha não tem a aba Tabela de unidades: sem ela não dá para gerar os TXTs.");

    var invalidos = todos.filter(function (e) { return e.valorInvalido; }).length;
    if (invalidos) plano.avisos.push(invalidos + " valor(es) digitados fora do padrão (ex.: \"2.29598C\"). Vão para o TXT como a planilha lê, e aparecem na lista para conferir.");

    return plano;
  }

  return {
    nomeCompetencia: nomeCompetencia, competenciaDominante: competenciaDominante, nomeAbaBanco: nomeAbaBanco,
    lancamentosDaAba: lancamentosDaAba, cadastroDaAba: cadastroDaAba,
    problemasTabelaUnidades: problemasTabelaUnidades, analisarPlanilha: analisarPlanilha
  };
});
