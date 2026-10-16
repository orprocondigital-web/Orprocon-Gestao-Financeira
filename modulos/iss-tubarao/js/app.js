/*
 * app.js — telas do ISS Tubarão. Leitura do XML: leitor.js · meses e empresas: dados.js.
 *
 * Fluxo: no Meu ISS, para cada empresa, Movimento Econômico → Períodos → Exportar XML → Gerar Arquivo.
 * Aqui: arrastar os XML (todos de uma vez) → conferir cada empresa → marcar como conferida → exportar o Excel.
 * Quem usa vem do login da Gestão Financeira ("gf.sessao"). Dados no navegador, chave "iss:v1" (vão no backup do sistema).
 */
(function () {
  "use strict";
  var L = IssLeitor, D = IssDados;
  var CHAVE = "iss:v1";
  var EXCELJS_URL = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) { return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._h); toast._h = setTimeout(function () { t.classList.remove("show"); }, 3500); }
  function lerJSON(k, p) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? p : v; } catch (e) { return p; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function mesAtual() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  function carregarScript(url, global) {
    if (window[global]) return Promise.resolve(window[global]);
    return new Promise(function (ok, erro) {
      var s = document.createElement("script"); s.src = url;
      s.onload = function () { window[global] ? ok(window[global]) : erro(new Error("Biblioteca não carregou.")); };
      s.onerror = function () { erro(new Error("Sem internet para carregar a biblioteca de planilhas. Tente de novo.")); };
      document.head.appendChild(s);
    });
  }
  function baixar(nome, blob) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function v(x) { return x ? L.brl(x) : '<span class="muted">—</span>'; }
  function dataBr(iso) { return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : ""; }
  function cnpjFmt(d) {
    d = String(d || "");
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    return d;
  }
  function quando(iso) { try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return ""; } }

  // ---------------------------------------------------------------- estado

  var estado = D.normalizar(lerJSON(CHAVE, null));
  function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { alert("Não consegui guardar os dados neste navegador (espaço cheio?)."); } }
  window.addEventListener("storage", function (ev) { if (ev.key === CHAVE) { estado = D.normalizar(lerJSON(CHAVE, null)); render(); } });

  var sessao = lerJSON("gf.sessao", null);
  var eu = sessao && sessao.usuarioId ? { id: sessao.usuarioId, nome: sessao.nome } : null;
  var mes = localStorage.getItem("iss:mes") || D.somarMes(mesAtual(), -1);
  var aba = "mes", aberta = null, filtro = "todas";

  var ABAS = [{ id: "mes", nome: "Empresas do mês" }, { id: "como", nome: "Como exportar do Meu ISS" }];

  function render() {
    $("mes-rotulo").textContent = D.rotuloMes(mes).replace(/^./, function (c) { return c.toUpperCase(); });
    $("abas").innerHTML = ABAS.map(function (a) {
      return '<button type="button" data-aba="' + a.id + '" class="' + (a.id === aba ? "ativo" : "") + '">' + esc(a.nome) + "</button>";
    }).join("");
    $("tela").innerHTML = aba === "como" ? telaComo() : aberta && estado.meses[mes] && estado.meses[mes][aberta] ? telaEmpresa(aberta) : telaMes();
  }

  // ---------------------------------------------------------------- tela do mês

  function stat(rotulo, valor, sub, principal) {
    return '<div class="stat' + (principal ? " primary" : "") + '"><div class="label">' + esc(rotulo) + '</div><div class="value">' + esc(valor) + "</div>" + (sub ? '<div class="sub">' + esc(sub) + "</div>" : "") + "</div>";
  }

  function telaMes() {
    var r = D.resumoMes(estado, mes), g = r.geral, html = "";
    if (D.temExemplo(estado)) html += '<div class="hr-aviso info"><span><strong>Dados de exemplo.</strong> Empresas e prestadores fictícios para conhecer o módulo.</span><button type="button" class="btn btn-outline btn-sm" data-acao="remover-exemplo">Remover exemplo</button></div>';
    var outros = D.mesesComDados(estado).filter(function (m) { return m !== mes; });
    if (!r.linhas.length) {
      return html + '<section class="panel"><div class="hr-vazio"><strong>Nenhum XML importado em ' + esc(D.rotuloMes(mes)) + "</strong>" +
        "No Meu ISS, exporte o XML do Movimento Econômico de cada empresa e traga todos de uma vez para cá.</div>" +
        '<div class="is-zona" data-acao="importar" tabindex="0" role="button"><strong>Arraste os XML aqui ou clique para escolher</strong>Pode selecionar vários arquivos juntos (um por empresa).</div>' +
        '<div class="hr-vazio" style="padding-top:0"><button type="button" class="btn btn-ghost" data-aba="como">Como exportar do Meu ISS</button>' +
        (D.temExemplo(estado) ? "" : '<button type="button" class="btn btn-outline" data-acao="exemplo">Ver com dados de exemplo</button>') +
        (outros.length ? '<p class="muted small" style="margin-top:12px">Meses com dados: ' + outros.slice(0, 6).map(function (m) { return '<button type="button" class="link-btn" data-acao="ir-mes" data-mes="' + m + '">' + esc(D.rotuloMes(m)) + "</button>"; }).join(" · ") + "</p>" : "") +
        "</div></section>" + rodapeLimpar();
    }
    html += '<div class="stats hr-stats">' +
      stat("Empresas", String(g.empresas), g.conferidas + " conferida(s)", true) +
      stat("Notas", String(g.notas), g.comIssRetido + " com ISS retido") +
      stat("ISS retido", L.brl(g.issRetido), "ISS Substituto (tomador)") +
      stat("Retenções federais", L.brl(g.federal), g.comFederal + " nota(s) com retenção") +
      stat("Total retido", L.brl(g.totalRetido), g.alertas ? g.alertas + " nota(s) para olhar" : "nenhum alerta") + "</div>";
    html += '<section class="panel"><div class="hr-acoes">' +
      '<button type="button" class="btn btn-primary" data-acao="importar">Importar XML</button>' +
      '<span class="muted small">ou arraste os arquivos para esta tela</span><span class="espaco"></span>' +
      '<button type="button" class="btn btn-outline btn-sm" data-acao="exportar">Exportar Excel</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-acao="imprimir">Imprimir</button></div>' +
      '<div class="is-wrap"><table class="ledger"><thead><tr><th>Empresa</th><th>Situação</th><th class="num">Notas</th><th class="num">Valor dos serviços</th>' +
      '<th class="num">ISS retido</th><th class="num">Federais</th><th class="num">Total retido</th><th class="num">Alertas</th><th></th></tr></thead><tbody>' +
      r.linhas.map(function (l) {
        var al = l.t.alertas + l.avisos;
        return '<tr class="clicavel" data-acao="abrir" data-chave="' + esc(l.chave) + '"><td><strong>' + esc(l.empresa.nome) + '</strong><span class="cell-sub">' +
          esc([l.empresa.cmc ? "CMC " + l.empresa.cmc : "", cnpjFmt(l.empresa.cnpj)].filter(Boolean).join(" · ")) + "</span></td>" +
          "<td>" + (l.registro.conferida ? '<span class="pill st-revisada">Conferida</span>' : '<span class="pill st-importada">A conferir</span>') + "</td>" +
          '<td class="hr-num">' + l.t.notas + '</td><td class="hr-num">' + v(l.t.valor) + '</td><td class="hr-num">' + v(l.t.issRetido) + '</td><td class="hr-num">' + v(l.t.federal) +
          '</td><td class="hr-num"><strong>' + v(l.t.totalRetido) + '</strong></td><td class="hr-num">' + (al ? '<span class="hr-alertas">' + al + "</span>" : "—") +
          '</td><td class="row-actions"><button type="button" data-acao="abrir" data-chave="' + esc(l.chave) + '">Conferir</button></td></tr>';
      }).join("") + "</tbody></table></div></section>" + rodapeLimpar();
    return html;
  }

  function rodapeLimpar() {
    if (!Object.keys(estado.empresas).length) return "";
    return '<p class="muted small no-print" style="margin-top:16px;text-align:right">Para testar do zero: <button type="button" class="link-btn" data-acao="limpar-tudo">Apagar tudo do ISS Tubarão</button></p>';
  }

  // ---------------------------------------------------------------- uma empresa

  var FILTROS = [["todas", "Todas"], ["iss", "Com ISS retido"], ["federal", "Com retenção federal"], ["alerta", "Com alerta"]];

  function telaEmpresa(chave) {
    var reg = estado.meses[mes][chave], emp = estado.empresas[chave] || { nome: chave };
    var lista = D.resumoMes(estado, mes).linhas.map(function (l) { return l.chave; }), i = lista.indexOf(chave);
    var notas = reg.notas.filter(function (n) {
      return filtro === "iss" ? n.issRetido > 0 : filtro === "federal" ? n.federal > 0 : filtro === "alerta" ? n.alertas.length > 0 : true;
    });
    var t = L.totais(notas);
    var html = '<section class="panel"><div class="is-topo-folha"><div><button type="button" class="link-btn no-print" data-acao="voltar">‹ Todas as empresas</button>' +
      "<h2>" + esc(emp.nome) + '</h2><span class="cell-sub">' + esc([emp.cmc ? "CMC " + emp.cmc : "", cnpjFmt(emp.cnpj), D.rotuloMes(mes)].filter(Boolean).join(" · ")) + "</span>" +
      '<span class="cell-sub">Arquivo ' + esc(reg.arquivo || "—") + ", importado em " + esc(quando(reg.importadoEm)) + (reg.por ? " por " + esc(reg.por) : "") +
      (reg.canceladas ? " · " + reg.canceladas + " nota(s) cancelada(s) ficaram de fora" : "") + "</span></div>" +
      '<div class="hr-folha-nav no-print">' +
      (i > 0 ? '<button type="button" class="btn btn-ghost btn-sm" data-acao="abrir" data-chave="' + esc(lista[i - 1]) + '">‹ Anterior</button>' : "") +
      (i < lista.length - 1 ? '<button type="button" class="btn btn-ghost btn-sm" data-acao="abrir" data-chave="' + esc(lista[i + 1]) + '">Próxima ›</button>' : "") +
      '<button type="button" class="btn btn-danger-ghost btn-sm" data-acao="remover" data-chave="' + esc(chave) + '">Remover</button>' +
      (reg.conferida ? '<button type="button" class="btn btn-ghost btn-sm" data-acao="conferida" data-sim="0">Desmarcar</button>'
        : '<button type="button" class="btn btn-primary btn-sm" data-acao="conferida" data-sim="1">Marcar como conferida</button>') + "</div></div>";
    if (reg.avisos.length) html += '<div class="hr-aviso atencao" style="margin:16px 20px 0"><span><strong>Sobre o arquivo:</strong><ul>' + reg.avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul></span></div>";
    html += '<div class="is-filtros no-print" role="group" aria-label="Filtrar notas">' + FILTROS.map(function (f) {
      return '<button type="button" data-filtro="' + f[0] + '" class="' + (filtro === f[0] ? "ativo" : "") + '">' + f[1] + "</button>";
    }).join("") + "</div>";
    if (!notas.length) return html + '<div class="hr-vazio">Nenhuma nota neste filtro.</div></section>';
    html += '<div class="is-wrap"><table class="is-notas"><thead><tr><th>Nº</th><th>Data</th><th>Prestador</th><th>Atividade</th><th class="num">Valor</th><th class="num">ISS retido</th>' +
      '<th class="num">IR</th><th class="num">PIS</th><th class="num">COFINS</th><th class="num">CSLL</th><th class="num">INSS</th><th class="num">Total retido</th></tr></thead><tbody>' +
      notas.map(function (n) {
        return '<tr class="' + (n.alertas.length ? "alerta" : "") + '"><td>' + esc(n.numero) + "</td><td>" + esc(dataBr(n.data)) + "</td><td>" + esc(n.prestadorNome) +
          '<span class="is-sub">' + esc(cnpjFmt(n.prestadorCnpj)) + "</span>" + n.alertas.map(function (a) { return '<span class="is-alerta">' + esc(a) + "</span>"; }).join("") + "</td>" +
          "<td>" + esc(n.atividade) + (n.tipo && n.tipo !== "TOMADOR" ? '<span class="is-sub">Tipo: ' + esc(n.tipo) + "</span>" : "") + "</td>" +
          '<td class="num">' + v(n.valor) + '</td><td class="num">' + v(n.issRetido) + '</td><td class="num">' + v(n.ir) + '</td><td class="num">' + v(n.pis) +
          '</td><td class="num">' + v(n.cofins) + '</td><td class="num">' + v(n.csll) + '</td><td class="num">' + v(n.inss) + '</td><td class="num"><strong>' + v(n.totalRetido) + "</strong></td></tr>";
      }).join("") + '</tbody><tfoot><tr><td colspan="4">Totais (' + t.notas + " nota" + (t.notas === 1 ? "" : "s") + ')</td><td class="num">' + v(t.valor) + '</td><td class="num">' + v(t.issRetido) +
      '</td><td class="num">' + v(t.ir) + '</td><td class="num">' + v(t.pis) + '</td><td class="num">' + v(t.cofins) + '</td><td class="num">' + v(t.csll) + '</td><td class="num">' + v(t.inss) +
      '</td><td class="num">' + v(t.totalRetido) + "</td></tr></tfoot></table></div></section>";
    return html;
  }

  // ---------------------------------------------------------------- como exportar

  function telaComo() {
    return '<section class="panel"><div class="panel-head"><h2>Como exportar o XML no Meu ISS</h2><p class="muted small">Uma vez por empresa. Depois traga todos os arquivos de uma vez.</p></div>' +
      '<ol class="is-passos">' +
      "<li>Entre no <b>Meu ISS</b> de Tubarão com o acesso do escritório (contador).</li>" +
      "<li>Na lista de clientes, escolha a empresa e clique em <b>Acessar Movimento Econômico</b>.</li>" +
      "<li>No menu <b>Períodos</b>, abra <b>Exportar XML</b>.</li>" +
      "<li>Escolha o mês no período inicial e no final (o mesmo mês), deixe os lançamentos em <b>Todos</b> e clique em <b>Gerar Arquivo</b>. O XML é baixado.</li>" +
      "<li>Volte para a lista de clientes e repita para as outras empresas.</li>" +
      "<li>Aqui, em <b>Empresas do mês</b>, arraste todos os XML juntos (ou clique em <b>Importar XML</b> e selecione vários). Cada arquivo vira uma empresa, no mês das notas.</li></ol>" +
      '<div class="panel-head" style="padding-top:0"><h2>O que o sistema confere</h2></div><ul class="is-passos">' +
      "<li><b>ISS retido</b> (substituto): o ISS das notas em que a empresa é a tomadora. Notas canceladas ficam de fora.</li>" +
      "<li><b>Retenções federais</b>: IR, PIS, COFINS, CSLL e INSS de cada nota, com a lista das notas que tiveram retenção.</li>" +
      "<li><b>Alertas</b>: alíquota de ISS fora de 2% a 5%, base de cálculo maior que a nota, valor líquido que não fecha com as retenções, nota tomada sem ISS.</li>" +
      "<li>Valores com vírgula ou ponto decimal são aceitos. O que o sistema não reconhecer aparece como aviso na empresa.</li></ul></section>";
  }

  // ---------------------------------------------------------------- importar

  function importar(arquivos) {
    arquivos = Array.prototype.filter.call(arquivos || [], function (f) { return /\.xml$/i.test(f.name) || /xml/.test(f.type); });
    if (!arquivos.length) { alert("Escolha arquivos .xml exportados do Meu ISS."); return; }
    toast("Lendo " + arquivos.length + " arquivo(s)…");
    Promise.all(arquivos.map(function (f) {
      return lerTexto(f).then(function (txt) {
        try { return { ok: L.ler(txt, f.name) }; } catch (e) { return { erro: e.message.indexOf(f.name) === 0 ? e.message : f.name + ": " + e.message }; }
      });
    })).then(function (rs) {
      var lidos = rs.filter(function (r) { return r.ok; }).map(function (r) { return r.ok; });
      var erros = rs.filter(function (r) { return r.erro; }).map(function (r) { return r.erro; });
      var repetidas = lidos.filter(function (l) {
        var mm = l.mes || mes, k = D.chaveDe(l.empresa);
        return k && estado.meses[mm] && estado.meses[mm][k];
      });
      if (repetidas.length && !confirm(repetidas.length + " empresa(s) já tinham XML importado nesse mês. Substituir pelos arquivos novos?")) return;
      var porMes = {}, falhas = [];
      lidos.forEach(function (l) {
        var mm = l.mes || mes;
        try { D.importar(estado, mm, l, { quem: eu ? eu.nome : "" }); porMes[mm] = (porMes[mm] || 0) + 1; } catch (e) { falhas.push(e.message); }
      });
      salvar();
      var meses = Object.keys(porMes).sort();
      if (meses.length && meses.indexOf(mes) < 0) { mes = meses[meses.length - 1]; guardar("iss:mes", mes); }
      aberta = null; aba = "mes"; render();
      var msg = meses.map(function (m) { return porMes[m] + " empresa(s) em " + D.rotuloMes(m); }).join(", ");
      var problemas = erros.concat(falhas);
      if (problemas.length) alert((msg ? "Importado: " + msg + ".\n\n" : "") + "Não importados:\n• " + problemas.join("\n• "));
      else toast("Importado: " + msg + ".");
    });
  }
  /** Lê o arquivo como texto respeitando a codificação declarada no XML (UTF-8 ou ISO-8859-1). */
  function lerTexto(f) {
    return f.arrayBuffer().then(function (buf) {
      var cabeca = new TextDecoder("ascii").decode(new Uint8Array(buf).slice(0, 200));
      var cod = (/encoding\s*=\s*["']([^"']+)["']/i.exec(cabeca) || [])[1] || "utf-8";
      try { return new TextDecoder(cod.toLowerCase()).decode(buf); } catch (e) { return new TextDecoder("utf-8").decode(buf); }
    });
  }

  // ---------------------------------------------------------------- exportar Excel

  function exportar() {
    var r = D.resumoMes(estado, mes);
    if (!r.linhas.length) return;
    toast("Gerando a planilha…");
    carregarScript(EXCELJS_URL, "ExcelJS").then(function (ExcelJS) {
      var wb = new ExcelJS.Workbook(); wb.creator = "Orprocon";
      var azul = "FF2445B0", dinheiro = "#,##0.00";
      var cab = function (ws, cols) {
        ws.columns = cols.map(function (c) { return { header: c[0], key: c[1], width: c[2] }; });
        ws.getRow(1).eachCell(function (c) { c.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azul } }; c.alignment = { vertical: "middle", wrapText: true }; });
        ws.getRow(1).height = 30; ws.views = [{ state: "frozen", ySplit: 1 }];
      };
      var moeda = function (ws, chaves) { chaves.forEach(function (k) { ws.getColumn(k).numFmt = dinheiro; }); };
      var VAL = ["valor", "issRetido", "ir", "pis", "cofins", "csll", "inss", "federal", "totalRetido"];

      var ws = wb.addWorksheet("Resumo");
      cab(ws, [["Empresa", "empresa", 42], ["CMC", "cmc", 10], ["CNPJ", "cnpj", 20], ["Notas", "notas", 8], ["Valor dos serviços", "valor", 16], ["ISS retido", "issRetido", 14],
        ["IR", "ir", 12], ["PIS", "pis", 12], ["COFINS", "cofins", 12], ["CSLL", "csll", 12], ["INSS", "inss", 12], ["Federais", "federal", 14], ["Total retido", "totalRetido", 15], ["Alertas", "alertas", 9], ["Situação", "sit", 12]]);
      r.linhas.forEach(function (l) {
        var row = { empresa: l.empresa.nome, cmc: l.empresa.cmc, cnpj: cnpjFmt(l.empresa.cnpj), notas: l.t.notas, alertas: l.t.alertas + l.avisos, sit: l.registro.conferida ? "Conferida" : "A conferir" };
        VAL.forEach(function (k) { row[k] = l.t[k]; }); ws.addRow(row);
      });
      var tot = { empresa: "TOTAL", notas: r.geral.notas }; VAL.forEach(function (k) { tot[k] = r.geral[k]; });
      var tr = ws.addRow(tot); tr.font = { name: "Arial", bold: true };
      moeda(ws, VAL);

      var notasSheet = function (nome, filtroFn) {
        var w = wb.addWorksheet(nome);
        cab(w, [["Empresa", "empresa", 34], ["CMC", "cmc", 10], ["Nº NFS-e", "numero", 10], ["Data", "data", 11], ["Prestador", "prest", 34], ["CNPJ prestador", "pcnpj", 20],
          ["Atividade", "ativ", 34], ["Valor", "valor", 13], ["ISS retido", "issRetido", 12], ["IR", "ir", 10], ["PIS", "pis", 10], ["COFINS", "cofins", 10], ["CSLL", "csll", 10], ["INSS", "inss", 10],
          ["Federais", "federal", 12], ["Total retido", "totalRetido", 13], ["Alertas", "alertas", 50]]);
        r.linhas.forEach(function (l) {
          l.registro.notas.filter(filtroFn).forEach(function (n) {
            var row = { empresa: l.empresa.nome, cmc: l.empresa.cmc, numero: n.numero, data: dataBr(n.data), prest: n.prestadorNome, pcnpj: cnpjFmt(n.prestadorCnpj), ativ: n.atividade, alertas: n.alertas.join(" | ") };
            VAL.forEach(function (k) { row[k] = n[k]; }); w.addRow(row);
          });
        });
        moeda(w, VAL);
      };
      notasSheet("Todas as notas", function () { return true; });
      notasSheet("Retenção federal", function (n) { return n.federal > 0; });
      notasSheet("Alertas", function (n) { return n.alertas.length > 0; });
      return wb.xlsx.writeBuffer();
    }).then(function (buf) {
      if (!buf) return;
      baixar("ISS_Tubarao_" + mes + ".xlsx", new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      toast("Planilha gerada.");
    }).catch(function (e) { alert(e.message); });
  }

  // ---------------------------------------------------------------- eventos

  document.addEventListener("click", function (ev) {
    var ab = ev.target.closest("[data-aba]");
    if (ab) { aba = ab.dataset.aba; aberta = null; render(); return; }
    var fi = ev.target.closest("[data-filtro]");
    if (fi) { filtro = fi.dataset.filtro; render(); return; }
    var el = ev.target.closest("[data-acao]");
    if (!el || el.disabled) return;
    var a = el.dataset.acao;
    if (a === "mes-anterior" || a === "mes-seguinte") { mes = D.somarMes(mes, a === "mes-anterior" ? -1 : 1); guardar("iss:mes", mes); aberta = null; render(); return; }
    if (a === "ir-mes") { mes = el.dataset.mes; guardar("iss:mes", mes); render(); return; }
    if (a === "importar") { $("arquivo").value = ""; $("arquivo").click(); return; }
    if (a === "abrir") { aberta = el.dataset.chave; filtro = "todas"; aba = "mes"; render(); window.scrollTo(0, 0); return; }
    if (a === "voltar") { aberta = null; render(); return; }
    if (a === "exportar") { exportar(); return; }
    if (a === "imprimir") { window.print(); return; }
    if (a === "conferida") {
      D.marcarConferida(estado, mes, aberta, el.dataset.sim === "1"); salvar();
      if (el.dataset.sim === "1") {   // vai para a próxima a conferir
        var prox = D.resumoMes(estado, mes).linhas.filter(function (l) { return !l.registro.conferida; })[0];
        aberta = prox ? prox.chave : null;
        toast(prox ? "Conferida. Próxima: " + prox.empresa.nome : "Todas as empresas do mês conferidas.");
      }
      render(); return;
    }
    if (a === "remover") {
      var emp = estado.empresas[el.dataset.chave] || {};
      if (!confirm("Remover o XML de " + (emp.nome || "esta empresa") + " em " + D.rotuloMes(mes) + "?")) return;
      D.remover(estado, mes, el.dataset.chave); salvar(); aberta = null; toast("Removido."); render(); return;
    }
    if (a === "exemplo") {
      var r = D.exemplo(estado, mes); salvar(); toast("Exemplo carregado: " + r.empresas + " empresas fictícias."); render(); return;
    }
    if (a === "limpar-tudo") {
      var qtd = Object.keys(estado.empresas).length;
      if (!confirm("Apagar TUDO do ISS Tubarão: " + qtd + " empresa(s) e os XML importados de todos os meses?\n\nNão dá para desfazer. Dica: baixe antes um backup no Master.")) return;
      if (prompt("Para confirmar, digite APAGAR") !== "APAGAR") { toast("Nada foi apagado."); return; }
      D.limparTudo(estado); salvar(); aberta = null; toast("ISS Tubarão zerado."); render(); return;
    }
    if (a === "remover-exemplo") {
      if (!confirm("Remover as empresas de exemplo? O que você importou continua.")) return;
      D.removerExemplo(estado); salvar(); aberta = null; toast("Exemplo removido."); render(); return;
    }
  });
  document.addEventListener("keydown", function (ev) {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList && ev.target.classList.contains("is-zona")) { ev.preventDefault(); ev.target.click(); }
  });
  document.addEventListener("change", function (ev) { if (ev.target.id === "arquivo" && ev.target.files && ev.target.files.length) importar(ev.target.files); });

  // arrastar e soltar em qualquer lugar da tela
  var contaArraste = 0;
  document.addEventListener("dragenter", function (ev) { if (ev.dataTransfer && Array.prototype.indexOf.call(ev.dataTransfer.types || [], "Files") > -1) { contaArraste++; $("solte").hidden = false; } });
  document.addEventListener("dragleave", function () { contaArraste = Math.max(0, contaArraste - 1); if (!contaArraste) $("solte").hidden = true; });
  document.addEventListener("dragover", function (ev) { ev.preventDefault(); });
  document.addEventListener("drop", function (ev) {
    ev.preventDefault(); contaArraste = 0; $("solte").hidden = true;
    if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) importar(ev.dataTransfer.files);
  });

  // ---------------------------------------------------------------- início

  if (!eu) {
    document.querySelector(".hr-app").innerHTML = '<div class="panel" style="margin-top:40px"><div class="hr-vazio"><strong>Abra o ISS Tubarão pelo sistema</strong>Entre na Gestão Financeira e escolha <b>ISS Tubarão</b> no menu.</div></div>';
    return;
  }
  render();
})();
