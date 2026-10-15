/*
 * app.js — telas do Controle de horas. Regras: regras.js · planilha do cliente: planilha.js · cadastro e meses: dados.js.
 *
 * Fluxo do mês: Gerar planilha para o cliente → o cliente preenche e devolve → Importar → conferir cada folha
 * (corrigir na tela) → marcar como revisada → Fechar o mês → Exportar o resumo.
 * Quem usa vem do login da Gestão Financeira ("gf.sessao"). Dados no navegador, chave "horas:v1" (vão no backup do sistema).
 */
(function () {
  "use strict";
  var R = HorasRegras, P = HorasPlanilha, H = HorasDados;
  var CHAVE = "horas:v1";
  var EXCELJS_URL = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
  var XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  var $ = function (id) { return document.getElementById(id); };

  // ---------------------------------------------------------------- utilidades

  function esc(s) { return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._h); toast._h = setTimeout(function () { t.classList.remove("show"); }, 3000); }
  function lerJSON(k, p) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? p : v; } catch (e) { return p; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function mesAtual() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  function opcoes(lista, valor, vazio) {
    return (vazio !== undefined ? '<option value="">' + esc(vazio) + "</option>" : "") +
      lista.map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === valor ? " selected" : "") + ">" + esc(o.nome) + "</option>"; }).join("");
  }
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
  function nomeArquivo(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "").slice(0, 50); }
  function h(min) { return R.fmt(min || 0); }
  function hSem0(min) { return min ? R.fmt(min) : '<span class="muted">—</span>'; }

  // ---------------------------------------------------------------- estado

  var estado = H.normalizar(lerJSON(CHAVE, null));
  function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { alert("Não consegui guardar os dados neste navegador (espaço cheio?)."); } }
  window.addEventListener("storage", function (ev) { if (ev.key === CHAVE) { estado = H.normalizar(lerJSON(CHAVE, null)); render(); } });

  var sessao = lerJSON("gf.sessao", null);
  var eu = sessao && sessao.usuarioId ? { id: sessao.usuarioId, nome: sessao.nome, perfil: sessao.perfil } : null;
  var empId = localStorage.getItem("horas:empresa") || "";
  var mes = localStorage.getItem("horas:mes") || R.somarMes(mesAtual(), -1);
  var aba = "mes", folhaAberta = null, mostrarInativos = false;

  function empresa() { return H.porId(estado.empresas, empId); }
  function garantirEmpresa() {
    if (!empresa()) empId = (estado.empresas.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); })[0] || {}).id || "";
  }

  // ---------------------------------------------------------------- moldura

  var ABAS = [{ id: "mes", nome: "Folhas do mês" }, { id: "funcionarios", nome: "Funcionários" }, { id: "regras", nome: "Regras de cálculo" }, { id: "feriados", nome: "Feriados" }];

  function render() {
    garantirEmpresa();
    $("mes-rotulo").textContent = R.rotuloMes(mes);
    var lista = estado.empresas.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    $("sel-empresa").innerHTML = lista.length ? opcoes(lista, empId) + '<option value="__nova">+ Nova empresa…</option>' : '<option value="">Nenhuma empresa</option><option value="__nova">+ Nova empresa…</option>';
    var emp = empresa();
    $("abas").innerHTML = emp ? ABAS.map(function (a) {
      return '<button type="button" data-aba="' + a.id + '" class="' + (a.id === aba ? "ativo" : "") + '"' + (a.id === aba ? ' aria-current="page"' : "") + ">" + esc(a.nome) + "</button>";
    }).join("") : "";
    if (!emp) { $("tela").innerHTML = telaVazia(); return; }
    $("tela").innerHTML = aba === "funcionarios" ? telaFuncionarios(emp) : aba === "regras" ? telaRegras(emp) : aba === "feriados" ? telaFeriados(emp)
      : folhaAberta ? telaFolha(emp) : telaMes(emp);
  }

  function telaVazia() {
    return '<section class="panel"><div class="hr-vazio"><strong>Nenhuma empresa cadastrada</strong>' +
      "Cadastre o cliente e os funcionários dele, gere a planilha de presença e importe quando ela voltar preenchida.<br>" +
      '<button type="button" class="btn btn-primary" data-acao="empresa-nova">Cadastrar empresa</button>' +
      '<button type="button" class="btn btn-outline" data-acao="exemplo">Ver com dados de exemplo</button></div></section>';
  }

  // ---------------------------------------------------------------- Folhas do mês

  function telaMes(emp) {
    var r = H.resumoMes(estado, emp.id, mes), g = r.geral, m = r.registro, fechado = m && m.status === "fechado";
    var ativos = H.ativos(emp);
    var extrasTxt = Object.keys(g.extras).sort(function (a, b) { return a - b; }).map(function (p) { return p + "%: " + h(g.extras[p]); }).join(" · ");
    var html = "";
    if (emp.exemplo) html += '<div class="hr-aviso info"><span><strong>Dados de exemplo.</strong> Empresa e funcionários fictícios para conhecer o módulo. Quando quiser começar de verdade, remova o exemplo (as empresas que você cadastrou ficam).</span>' +
      '<button type="button" class="btn btn-outline btn-sm" data-acao="remover-exemplo">Remover exemplo</button></div>';
    if (fechado) html += '<div class="hr-aviso fechado"><span><strong>Mês fechado</strong> em ' + esc(new Date(m.fechadoEm).toLocaleString("pt-BR")) +
      ". O cálculo usa as regras e os feriados da data do fechamento.</span>" + '<button type="button" class="btn btn-ghost btn-sm" data-acao="reabrir">Reabrir mês</button></div>';
    if (!ativos.length) html += '<div class="hr-aviso info"><span><strong>Sem funcionários cadastrados — e tudo bem.</strong> Gere a planilha com abas em branco: o cliente escreve o nome de cada funcionário e, na importação, o sistema cadastra sozinho. Se preferir, cadastre antes em <b>Funcionários</b> e a planilha já sai com os nomes.</span>' +
      '<button type="button" class="btn btn-soft btn-sm" data-aba="funcionarios">Cadastrar funcionários</button></div>';
    html += '<div class="stats hr-stats">' +
      stat("Folhas recebidas", g.comFolha + " de " + g.funcionarios, R.rotuloMes(mes), true) +
      stat("Revisadas", g.revisadas + " de " + g.comFolha, g.comFolha && g.revisadas === g.comFolha ? "todas conferidas" : "falta conferir", false, false) +
      stat("Alertas", g.alertas, "dias para olhar com atenção", false, g.alertas > 0) +
      stat("Horas extras", h(g.extra), extrasTxt || "nenhuma") +
      stat("Adicional noturno", h(g.noturno), r.regras.noturno.reduzida ? "em horas reduzidas" : "em horas de relógio") + "</div>";
    html += '<section class="panel"><div class="hr-acoes">' +
      '<button type="button" class="btn btn-primary" data-acao="gerar">Gerar planilha para o cliente</button>' +
      '<button type="button" class="btn btn-outline" data-acao="importar"' + (fechado ? " disabled" : "") + ">Importar planilha preenchida</button>" +
      '<span class="espaco"></span>' +
      '<button type="button" class="btn btn-outline btn-sm" data-acao="exportar"' + (g.comFolha ? "" : " disabled") + ">Exportar resumo (Excel)</button>" +
      '<button type="button" class="btn btn-ghost btn-sm" data-acao="imprimir"' + (g.comFolha ? "" : " disabled") + ">Imprimir</button>" +
      (fechado ? "" : '<button type="button" class="btn btn-soft btn-sm" data-acao="fechar"' + (g.comFolha ? "" : " disabled") + ">Fechar mês</button>") + "</div>";
    if (!r.linhas.length) return html + '<div class="hr-vazio"><strong>Sem funcionários</strong>Cadastre os funcionários ou importe a planilha do cliente.</div></section>';
    html += '<div class="table-wrap"><table class="ledger"><thead><tr><th>Funcionário</th><th>Situação</th><th class="num">Dias</th><th class="num">Trabalhadas</th>' +
      r.pcts.map(function (p) { return '<th class="num">HE ' + p + "%</th>"; }).join("") +
      '<th class="num">Noturno</th><th class="num">Atrasos</th><th class="num">Faltas</th><th class="num">Alertas</th><th class="col-actions"></th></tr></thead><tbody>' +
      r.linhas.map(function (l) {
        var t = l.calc.totais, tem = !!l.folha;
        return '<tr class="clicavel" data-acao="abrir-folha" data-func="' + esc(l.func.id) + '"><td><strong>' + esc(l.func.nome) + '</strong><span class="cell-sub">' + esc(l.func.funcao || "") + (l.func.ativo === false ? " · inativo" : "") + "</span></td>" +
          '<td><span class="pill st-' + l.status + '">' + { sem: "Sem folha", importada: "A conferir", revisada: "Revisada" }[l.status] + "</span></td>" +
          '<td class="hr-num">' + (tem ? t.diasTrabalhados : "—") + '</td><td class="hr-num">' + (tem ? h(t.trabalhado) : "—") + "</td>" +
          r.pcts.map(function (p) { return '<td class="hr-num">' + (tem ? hSem0(t.extras[p]) : "—") + "</td>"; }).join("") +
          '<td class="hr-num">' + (tem ? hSem0(t.noturnoReduzido) : "—") + '</td><td class="hr-num">' + (tem ? hSem0(t.atraso) : "—") + '</td><td class="hr-num">' + (tem ? (t.faltas || "—") : "—") + "</td>" +
          '<td class="hr-num">' + (tem && t.alertas ? '<span class="hr-alertas">' + t.alertas + "</span>" : "—") + '</td><td class="row-actions"><button type="button" data-acao="abrir-folha" data-func="' + esc(l.func.id) + '">' + (tem ? "Conferir" : "Digitar") + "</button></td></tr>";
      }).join("") + "</tbody></table></div></section>";
    return html;
  }
  function stat(rotulo, valor, sub, principal, alerta) {
    return '<div class="stat' + (principal ? " primary" : "") + (alerta ? " alerta" : "") + '"><div class="label">' + esc(rotulo) + '</div><div class="value">' + esc(valor) + "</div>" + (sub ? '<div class="sub">' + esc(sub) + "</div>" : "") + "</div>";
  }

  // ---------------------------------------------------------------- folha de um funcionário

  function telaFolha(emp) {
    var f = H.porId(emp.funcionarios, folhaAberta);
    if (!f) { folhaAberta = null; return telaMes(emp); }
    var m = H.mesDe(estado, emp.id, mes, false), fechado = m && m.status === "fechado";
    var folha = (m && m.folhas[f.id]) || { dias: {}, revisada: false, avisos: [] };
    var calc = R.calcularMes(folha, f, mes, H.feriadosDoMes(emp, m), H.regrasDoMes(emp, m));
    var lista = H.resumoMes(estado, emp.id, mes).linhas.map(function (l) { return l.func.id; });
    var i = lista.indexOf(f.id), ant = lista[i - 1], prox = lista[i + 1];
    var cargaTxt = resumoCarga(f.carga);
    var dis = fechado ? " disabled" : "";
    var html = '<section class="panel"><div class="hr-folha-topo"><div><button type="button" class="link-btn no-print" data-acao="voltar">‹ Todas as folhas</button>' +
      '<h2 style="margin-top:6px">' + esc(f.nome) + '</h2><span class="cell-sub">' + esc([f.funcao, "Carga: " + cargaTxt, f.quadro ? "Quadro: " + f.quadro : ""].filter(Boolean).join(" · ")) + "</span></div>" +
      '<div class="hr-folha-nav no-print">' +
      (ant ? '<button type="button" class="btn btn-ghost btn-sm" data-acao="abrir-folha" data-func="' + esc(ant) + '">‹ Anterior</button>' : "") +
      (prox ? '<button type="button" class="btn btn-ghost btn-sm" data-acao="abrir-folha" data-func="' + esc(prox) + '">Próximo ›</button>' : "") +
      '<button type="button" class="btn btn-outline btn-sm" data-acao="func-editar" data-id="' + esc(f.id) + '">Carga e cadastro</button>' +
      (fechado ? "" : folha.revisada ? '<button type="button" class="btn btn-ghost btn-sm" data-acao="revisada" data-sim="0">Desmarcar revisão</button>'
        : '<button type="button" class="btn btn-primary btn-sm" data-acao="revisada" data-sim="1">Marcar como revisada</button>') + "</div></div>";
    var avisos = (folha.avisos || []);
    if (avisos.length) html += '<div class="hr-aviso atencao" style="margin:16px 20px 0"><span><strong>Na importação:</strong><ul>' + avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul></span></div>";
    if (folha.revisada) html += '<div class="hr-aviso fechado" style="margin:16px 20px 0"><span>Folha revisada. Se mudar algum horário, ela volta para “a conferir”.</span></div>';
    html += '<div class="hr-folha-wrap"><table class="hr-folha"><thead><tr><th>Dia</th><th>Sem.</th><th>Entrada</th><th>Saída int.</th><th>Volta int.</th><th>Saída</th><th>Ocorrência</th><th>Observação</th>' +
      '<th>Trabalhado</th><th>Extra</th><th>Atraso</th><th>Noturno</th><th>Alertas</th></tr></thead><tbody>';
    calc.dias.forEach(function (d) {
      var e = d.entrada || {}, cls = [d.feriado ? "feriado" : "", d.semana === "Sáb" || d.semana === "Dom" ? "fds" : "", d.alertas.length ? "tem-alerta" : ""].join(" ");
      var extraTxt = d.extra ? Object.keys(d.extras).map(function (p) { return h(d.extras[p]) + " <small>(" + p + "%)</small>"; }).join("<br>") : "";
      html += '<tr class="' + cls + '"><td>' + String(d.dia).padStart(2, "0") + (d.feriado ? '<span class="hr-feriado-nome">' + esc(d.feriado) + "</span>" : "") + "</td><td>" + d.semana + "</td>" +
        ["e1", "s1", "e2", "s2"].map(function (k) {
          return '<td><input class="hr-h" inputmode="numeric" data-dia="' + d.dia + '" data-campo="' + k + '" value="' + esc(R.fmtHora(e[k])) + '" aria-label="' + k + " do dia " + d.dia + '"' + dis + "></td>";
        }).join("") +
        '<td><select data-dia="' + d.dia + '" data-campo="oc" aria-label="Ocorrência do dia ' + d.dia + '"' + dis + '><option value=""></option>' +
          R.OCORRENCIAS.map(function (o) { return "<option" + (e.oc === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select></td>" +
        '<td class="esq"><input class="hr-obs" data-dia="' + d.dia + '" data-campo="obs" value="' + esc(e.obs || "") + '" aria-label="Observação do dia ' + d.dia + '"' + dis + "></td>" +
        '<td class="hr-num">' + (d.trabalhado ? h(d.trabalhado) : "") + '</td><td class="hr-num hr-extra">' + extraTxt + '</td><td class="hr-num hr-atraso">' + (d.atraso ? h(d.atraso) : d.falta ? "falta" : "") +
        '</td><td class="hr-num">' + (d.noturnoReduzido ? h(d.noturnoReduzido) : "") + '</td><td class="hr-alerta-txt">' + esc(d.alertas.join("; ")) + "</td></tr>";
    });
    var t = calc.totais;
    html += '</tbody><tfoot><tr><td colspan="8" style="text-align:right">Totais do mês</td><td class="hr-num">' + h(t.trabalhado) + '</td><td class="hr-num hr-extra">' +
      (Object.keys(t.extras).map(function (p) { return h(t.extras[p]) + " <small>(" + p + "%)</small>"; }).join("<br>") || "—") +
      '</td><td class="hr-num hr-atraso">' + (t.atraso ? h(t.atraso) : "—") + (t.faltas ? "<br>" + t.faltas + " falta(s)" : "") + '</td><td class="hr-num">' + (t.noturnoReduzido ? h(t.noturnoReduzido) : "—") +
      "</td><td>" + (t.alertas ? t.alertas + " alerta(s)" : "") + "</td></tr></tfoot></table></div>" +
      '<div class="panel-foot small muted">Digite os horários como quiser (0900, 9:00 ou 9h) e tecle Enter para ir ao dia seguinte. ' +
      (t.atrasoCompensado ? "Atrasos compensados com horas extras: " + h(t.atrasoCompensado) + ". " : "") + "Os cálculos usam as regras de cálculo da empresa.</div></section>";
    return html;
  }
  function resumoCarga(c) {
    var nomes = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"], t = R.textosDeCarga(c), grupos = [];
    t.forEach(function (v, i) {
      var ult = grupos[grupos.length - 1];
      if (ult && ult.v === v) ult.fim = nomes[i]; else grupos.push({ ini: nomes[i], fim: nomes[i], v: v });
    });
    return grupos.filter(function (g) { return g.v !== "00:00"; }).map(function (g) { return (g.ini === g.fim ? g.ini : g.ini + "–" + g.fim) + " " + g.v.replace(/^0/, ""); }).join(", ") || "sem carga";
  }

  // ---------------------------------------------------------------- Funcionários

  function telaFuncionarios(emp) {
    var lista = emp.funcionarios.filter(function (f) { return mostrarInativos || f.ativo !== false; }).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    var inativos = emp.funcionarios.filter(function (f) { return f.ativo === false; }).length;
    return '<section class="panel"><div class="panel-head row"><div><h2>Funcionários de ' + esc(emp.nome) + '</h2><p class="muted small">' + H.ativos(emp).length +
      " ativo(s). A planilha do cliente sai com uma aba para cada funcionário ativo.</p></div>" +
      '<div class="panel-actions"><button type="button" class="btn btn-outline btn-sm" data-acao="func-varios">Adicionar vários</button><button type="button" class="btn btn-primary btn-sm" data-acao="func-novo">Novo funcionário</button></div></div>' +
      (inativos ? '<div class="hr-acoes"><label class="hr-check"><input type="checkbox" data-acao-change="inativos"' + (mostrarInativos ? " checked" : "") + "> Mostrar os " + inativos + " inativo(s)</label></div>" : "") +
      (lista.length ? '<div class="table-wrap"><table class="ledger"><thead><tr><th>Funcionário</th><th>Carga horária</th><th>Quadro de horário</th><th>Situação</th><th class="col-actions"></th></tr></thead><tbody>' +
        lista.map(function (f) {
          return "<tr><td><strong>" + esc(f.nome) + '</strong><span class="cell-sub">' + esc(f.funcao || "") + "</span></td><td>" + esc(resumoCarga(f.carga)) + '</td><td class="small">' + esc(f.quadro || "—") + "</td><td>" +
            (f.ativo === false ? '<span class="pill inativo">Inativo</span>' : '<span class="pill ativo">Ativo</span>') + '</td><td class="row-actions"><button type="button" data-acao="func-editar" data-id="' + esc(f.id) + '">Editar</button></td></tr>';
        }).join("") + "</tbody></table></div>"
        : '<div class="hr-vazio"><strong>Nenhum funcionário</strong>Cadastre um a um, cole uma lista em “Adicionar vários”, ou importe a planilha do cliente.</div>') + "</section>";
  }

  function modalFuncionario(emp, id) {
    var f = id ? H.porId(emp.funcionarios, id) : null;
    var carga = R.textosDeCarga(f ? f.carga : emp.cargaPadrao);
    abrirModal("<h3>" + (f ? "Editar funcionário" : "Novo funcionário") + "</h3>" +
      '<form data-form="funcionario" data-id="' + esc(id || "") + '">' +
      '<div class="field"><label for="f-nome">Nome</label><input id="f-nome" name="nome" required value="' + esc(f ? f.nome : "") + '"></div>' +
      '<div class="field"><label for="f-funcao">Função</label><input id="f-funcao" name="funcao" value="' + esc(f ? f.funcao : "") + '"></div>' +
      '<div class="field"><label for="f-quadro">Quadro de horário (como no Único)</label><input id="f-quadro" name="quadro" placeholder="Ex.: Seg a sex 09:00-12:30 e 13:30-18:00; sáb 08:30-12:30" value="' + esc(f ? f.quadro : "") + '"></div>' +
      '<div class="field"><span class="ed-rotulo" style="font-size:12.5px;font-weight:600">Carga horária por dia (horas trabalhadas, sem o intervalo)</span>' + campoCarga(carga) + "</div>" +
      (f ? '<label class="hr-check"><input type="checkbox" name="ativo"' + (f.ativo !== false ? " checked" : "") + "> Ativo (sai na planilha do cliente)</label>" : "") +
      '<p class="error-msg" data-erro></p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div></form>');
  }
  function campoCarga(carga) {
    return '<div class="hr-carga">' + ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(function (n, i) {
      return '<div><label for="c-' + i + '">' + n + '</label><input id="c-' + i + '" name="carga' + i + '" value="' + esc(carga[i]) + '" inputmode="numeric"></div>';
    }).join("") + "</div>";
  }

  // ---------------------------------------------------------------- Regras de cálculo

  function painelLimpeza() {
    return '<section class="panel"><div class="panel-head"><h2>Começar do zero</h2><p class="muted small">Para os testes: tirar o exemplo ou apagar tudo deste módulo. Não mexe na Gestão Financeira nem nos outros módulos.</p></div>' +
      '<div class="hr-acoes" style="border-bottom:0">' +
      (H.temExemplo(estado) ? '<button type="button" class="btn btn-outline btn-sm" data-acao="remover-exemplo">Remover dados de exemplo</button>' : "") +
      '<button type="button" class="btn btn-danger-ghost btn-sm" data-acao="limpar-tudo">Apagar tudo do Controle de horas</button></div></section>';
  }

  function telaRegras(emp) {
    var rg = emp.regras;
    var pct = function (n, v) { return '<input name="' + n + '" type="number" min="0" max="300" step="1" value="' + esc(v) + '">'; };
    return '<section class="panel"><div class="panel-head"><h2>Dados da empresa</h2></div><form class="hr-form" data-form="empresa" data-id="' + esc(emp.id) + '">' +
      '<div class="linha"><div class="field"><label for="e-nome">Nome</label><input id="e-nome" name="nome" required value="' + esc(emp.nome) + '"></div>' +
      '<div class="field"><label for="e-cnpj">CNPJ</label><input id="e-cnpj" name="cnpj" value="' + esc(emp.cnpj || "") + '"></div></div>' +
      '<div class="field"><span style="font-size:12.5px;font-weight:600;color:var(--ink-2)">Carga padrão para funcionário novo</span>' + campoCarga(R.textosDeCarga(emp.cargaPadrao)) + "</div>" +
      '<p class="error-msg" data-erro></p><div class="hr-rodape"><button type="button" class="btn btn-danger-ghost btn-sm" data-acao="empresa-excluir">Excluir empresa</button><button type="submit" class="btn btn-primary">Salvar dados</button></div></form></section>' +
      '<section class="panel"><div class="panel-head"><h2>Regras de cálculo</h2><p class="muted small">Valem para esta empresa. Mês já fechado continua com as regras da data do fechamento.</p></div>' +
      '<form class="hr-form" data-form="regras">' +
      '<div class="linha"><div class="field"><label for="r-tol">Tolerância por dia (minutos)</label><input id="r-tol" name="toleranciaDia" type="number" min="0" max="60" value="' + esc(rg.toleranciaDia) + '"><span class="dica">Diferença até este limite não conta como extra nem atraso (CLT: 10 min). 0 = sem tolerância.</span></div>' +
      '<div class="field"><label class="hr-check" style="margin-top:24px"><input type="checkbox" name="compensarAtrasos"' + (rg.compensarAtrasos ? " checked" : "") + "> Descontar os atrasos do mês das horas extras</label></div></div>" +
      '<div><h3 style="font-size:14px;margin-bottom:6px">Hora extra</h3><table class="ledger hr-faixas"><thead><tr><th>Dia</th><th>As primeiras (horas)</th><th>a (%)</th><th>As demais a (%)</th></tr></thead><tbody>' +
      R.TIPOS.map(function (t) {
        var x = rg.he[t.id];
        return "<tr><td><strong>" + t.nome + '</strong></td><td><input name="ate-' + t.id + '" value="' + esc(R.fmtHora(x.ate)) + '" inputmode="numeric"></td><td>' + pct("pct1-" + t.id, x.pct1) + "</td><td>" + pct("pct2-" + t.id, x.pct2) + "</td></tr>";
      }).join("") + '</tbody></table><span class="dica">Ex.: as primeiras 02:00 a 50%, as demais a 100%. Para um percentual só, use o mesmo nas duas colunas. Domingo e feriado: todo o trabalho do dia é extra quando a carga do dia é zero.</span></div>' +
      '<div><h3 style="font-size:14px;margin-bottom:6px">Adicional noturno</h3><div class="linha">' +
      '<div class="field"><label for="r-ni">Começa às</label><input id="r-ni" name="noturnoInicio" value="' + esc(R.fmtHora(rg.noturno.inicio)) + '"></div>' +
      '<div class="field"><label for="r-nf">Termina às</label><input id="r-nf" name="noturnoFim" value="' + esc(R.fmtHora(rg.noturno.fim)) + '"></div>' +
      '<div class="field"><label for="r-np">Percentual (%)</label>' + pct("noturnoPct", rg.noturno.pct).replace("<input", '<input id="r-np"') + "</div>" +
      '<div class="field"><label class="hr-check" style="margin-top:24px"><input type="checkbox" name="noturnoReduzida"' + (rg.noturno.reduzida ? " checked" : "") + "> Hora noturna reduzida (52min30s)</label></div></div></div>" +
      '<div><h3 style="font-size:14px;margin-bottom:6px">Alertas da conferência</h3><div class="linha">' +
      '<div class="field"><label for="r-int">Intervalo mínimo (min)</label><input id="r-int" name="intervaloMinimo" type="number" min="0" value="' + esc(rg.intervaloMinimo) + '"><span class="dica">Para jornada acima de 6h.</span></div>' +
      '<div class="field"><label for="r-lim">Hora extra máxima por dia</label><input id="r-lim" name="limiteExtraDia" value="' + esc(R.fmtHora(rg.limiteExtraDia)) + '"></div>' +
      '<div class="field"><label for="r-inter">Descanso mínimo entre jornadas</label><input id="r-inter" name="interjornada" value="' + esc(R.fmtHora(rg.interjornada)) + '"></div></div></div>' +
      '<p class="error-msg" data-erro></p><div class="hr-rodape"><button type="button" class="btn btn-ghost btn-sm" data-acao="regras-padrao">Voltar ao padrão</button><button type="submit" class="btn btn-primary">Salvar regras</button></div></form></section>' +
      painelLimpeza();
  }

  // ---------------------------------------------------------------- Feriados

  function telaFeriados(emp) {
    var ano = Number(mes.slice(0, 4));
    var lista = emp.feriados.filter(function (f) { return f.data.slice(0, 4) === String(ano); }).sort(function (a, b) { return a.data.localeCompare(b.data); });
    return '<section class="panel"><div class="panel-head row"><div><h2>Feriados de ' + ano + '</h2><p class="muted small">Dia de feriado usa a regra de hora extra “Feriado”. Acrescente os municipais da cidade do cliente.</p></div>' +
      '<div class="panel-actions"><button type="button" class="btn btn-outline btn-sm" data-acao="feriados-nacionais" data-ano="' + ano + '">Adicionar nacionais de ' + ano + "</button></div></div>" +
      '<form class="hr-acoes" data-form="feriado"><div class="field"><label for="fe-data">Data</label><input id="fe-data" name="data" type="date" required></div>' +
      '<div class="field" style="flex:1;min-width:200px"><label for="fe-nome">Nome</label><input id="fe-nome" name="nome" placeholder="Ex.: Aniversário da cidade" required></div>' +
      '<button type="submit" class="btn btn-primary" style="align-self:flex-end">Adicionar</button></form>' +
      (lista.length ? '<div class="table-wrap"><table class="ledger"><thead><tr><th>Data</th><th>Dia</th><th>Feriado</th><th class="col-actions"></th></tr></thead><tbody>' +
        lista.map(function (f) {
          return "<tr><td>" + f.data.split("-").reverse().join("/") + "</td><td>" + R.DIAS[R.diaSemana(f.data)] + "</td><td>" + esc(f.nome) + '</td><td class="row-actions"><button type="button" data-acao="feriado-remover" data-data="' + esc(f.data) + '">Remover</button></td></tr>';
        }).join("") + "</tbody></table></div>" : '<div class="hr-vazio"><strong>Nenhum feriado em ' + ano + "</strong>Use “Adicionar nacionais” e depois acrescente os municipais.</div>") + "</section>";
  }

  // ---------------------------------------------------------------- modais

  function abrirModal(html) { $("modal-card").innerHTML = html; $("modal").style.display = "flex"; var f = $("modal-card").querySelector("input, textarea, select"); if (f) setTimeout(function () { f.focus(); }, 30); }
  function fecharModal() { $("modal").style.display = "none"; $("modal-card").innerHTML = ""; }
  function erroForm(form, msg) { var e = form.querySelector("[data-erro]"); if (e) { e.textContent = msg; e.style.display = msg ? "block" : "none"; } else alert(msg); }
  function val(form, n) { var el = form.elements[n]; return el ? String(el.value || "").trim() : ""; }
  function lerCarga(form) {
    var t = [], erro = "";
    for (var i = 0; i < 7; i++) { var v = val(form, "carga" + i), m = R.paraMin(v || "0"); if (m === null) m = 0; if (isNaN(m)) erro = "Carga inválida: " + v; t.push(R.fmtHora(m)); }
    if (erro) throw new Error(erro);
    return R.cargaDeTextos(t);
  }
  function lerHora(form, n, rotulo) { var m = R.paraMin(val(form, n)); if (m === null || isNaN(m)) throw new Error(rotulo + ": use o formato 00:00."); return m; }

  function enviar(form) {
    var tipo = form.dataset.form, emp = empresa();
    try {
      if (tipo === "empresa-nova") {
        var nova = H.salvarEmpresa(estado, { nome: val(form, "nome"), cnpj: val(form, "cnpj") }, Number(mes.slice(0, 4)));
        empId = nova.id; guardar("horas:empresa", empId); aba = "mes"; folhaAberta = null;
        salvar(); fecharModal(); toast("Empresa cadastrada. Já pode gerar a planilha para o cliente."); render(); return;
      }
      if (tipo === "gerar") {
        var nb = Math.round(Number(val(form, "branco")) || 0), temCad = H.ativos(emp).length > 0;
        if (nb < 0 || nb > 300 || (!temCad && nb < 1)) throw new Error(temCad ? "Use de 0 a 300 abas em branco." : "Use de 1 a 300 abas.");
        fecharModal(); gerarPlanilha(nb); return;
      }
      if (tipo === "empresa") {
        H.salvarEmpresa(estado, { id: emp.id, nome: val(form, "nome"), cnpj: val(form, "cnpj"), cargaPadrao: lerCarga(form) });
        salvar(); toast("Dados da empresa salvos."); render(); return;
      }
      if (tipo === "funcionario") {
        var dados = { id: form.dataset.id || "", nome: val(form, "nome"), funcao: val(form, "funcao"), quadro: val(form, "quadro"), carga: lerCarga(form) };
        if (form.elements.ativo) dados.ativo = form.elements.ativo.checked;
        H.salvarFuncionario(emp, dados);
        salvar(); fecharModal(); toast("Funcionário salvo."); render(); return;
      }
      if (tipo === "varios") {
        var r = H.adicionarVarios(emp, form.elements.lista.value);
        salvar(); fecharModal(); toast(r.criados + " funcionário(s) cadastrado(s)" + (r.repetidos.length ? "; " + r.repetidos.length + " já existia(m)" : "") + "."); render(); return;
      }
      if (tipo === "regras") {
        var rg = R.completarRegras(emp.regras);
        rg.toleranciaDia = Math.max(0, Number(val(form, "toleranciaDia")) || 0);
        rg.compensarAtrasos = form.elements.compensarAtrasos.checked;
        R.TIPOS.forEach(function (t) {
          var ate = R.paraMin(val(form, "ate-" + t.id) || "0");
          if (ate === null) ate = 0;
          if (isNaN(ate)) throw new Error(t.nome + ": horas da 1ª faixa no formato 02:00.");
          rg.he[t.id] = { ate: ate, pct1: Number(val(form, "pct1-" + t.id)) || 0, pct2: Number(val(form, "pct2-" + t.id)) || 0 };
        });
        rg.noturno = { inicio: lerHora(form, "noturnoInicio", "Início do noturno"), fim: lerHora(form, "noturnoFim", "Fim do noturno"),
          pct: Number(val(form, "noturnoPct")) || 0, reduzida: form.elements.noturnoReduzida.checked };
        rg.intervaloMinimo = Math.max(0, Number(val(form, "intervaloMinimo")) || 0);
        rg.limiteExtraDia = lerHora(form, "limiteExtraDia", "Hora extra máxima");
        rg.interjornada = lerHora(form, "interjornada", "Descanso entre jornadas");
        emp.regras = rg; salvar(); toast("Regras salvas. Os meses abertos já foram recalculados."); render(); return;
      }
      if (tipo === "feriado") {
        var data = val(form, "data"), nome = val(form, "nome");
        if (!data || !nome) throw new Error("Informe a data e o nome.");
        emp.feriados = emp.feriados.filter(function (f) { return f.data !== data; }).concat([{ data: data, nome: nome }]);
        salvar(); toast("Feriado adicionado."); render(); return;
      }
    } catch (err) { erroForm(form, err.message); }
  }

  // ---------------------------------------------------------------- gerar, importar, exportar

  /** Antes de gerar: quantas abas em branco (o cliente escreve o nome). Sem cadastro, a planilha sai só com abas em branco. */
  function modalGerar() {
    var emp = empresa(), n = H.ativos(emp).length;
    abrirModal('<h3>Gerar planilha para o cliente</h3><form data-form="gerar">' +
      '<p class="muted small" style="margin:0">' + R.rotuloMes(mes).replace(/^./, function (c) { return c.toUpperCase(); }) + ' · ' + esc(emp.nome) + '</p>' +
      (n ? '<p style="margin:0">Vai uma aba com o nome de cada funcionário cadastrado (<b>' + n + '</b>).</p>'
         : '<p style="margin:0">Não precisa cadastrar os funcionários: o cliente escreve o nome em cada aba e, quando a planilha voltar, o sistema cadastra sozinho quem ele preencheu.</p>') +
      '<div class="field"><label for="g-branco">' + (n ? "Abas em branco a mais (para funcionário novo)" : "Quantas abas (uma por funcionário do cliente)") + '</label>' +
      '<input id="g-branco" name="branco" type="number" min="' + (n ? 0 : 1) + '" max="300" value="' + (n ? 2 : 10) + '"></div>' +
      '<p class="muted small" style="margin:0">Na dúvida, mande algumas a mais: aba que sobrar em branco é ignorada na importação. Se faltar, o cliente copia uma aba (está explicado na planilha).</p>' +
      '<p class="error-msg" data-erro></p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="submit" class="btn btn-primary">Gerar e baixar</button></div></form>');
  }

  function gerarPlanilha(emBranco) {
    var emp = empresa(), funcs = H.ativos(emp);
    toast("Gerando a planilha…");
    carregarScript(EXCELJS_URL, "ExcelJS").then(function (ExcelJS) {
      var wb = P.gerar(ExcelJS, emp, funcs, mes, { emBranco: emBranco });
      return wb.xlsx.writeBuffer();
    }).then(function (buf) {
      baixar("Folha_de_presenca_" + nomeArquivo(emp.nome) + "_" + mes + ".xlsx", new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      toast("Planilha gerada com " + (funcs.length + emBranco) + " aba(s) de funcionário. Envie ao cliente.");
    }).catch(function (e) { alert(e.message); });
  }

  function importar(arquivo) {
    var emp = empresa();
    toast("Lendo a planilha…");
    Promise.all([carregarScript(XLSX_URL, "XLSX"), arquivo.arrayBuffer()]).then(function (r) {
      var XLSX = r[0], lido = P.ler(XLSX, XLSX.read(r[1], { type: "array" }));
      if (!lido.folhas.length) { alert(lido.avisos.join("\n") || "Nenhuma folha encontrada."); return; }
      if (!lido.folhas.some(function (f) { return Object.keys(f.dias || {}).length; })) { alert("As folhas desta planilha estão em branco: nenhum horário ou ocorrência preenchido. Confira se é o arquivo que o cliente devolveu."); return; }
      if (lido.empresa && R.normalizarNome(lido.empresa) !== R.normalizarNome(emp.nome) &&
        !confirm("A planilha é da empresa \"" + lido.empresa + "\", mas você está em \"" + emp.nome + "\". Importar mesmo assim?")) return;
      var m = H.mesDe(estado, emp.id, mes, false), jaTem = lido.folhas.filter(function (f) {
        var fn = (f.id && H.porId(emp.funcionarios, f.id)) || emp.funcionarios.filter(function (x) { return R.normalizarNome(x.nome) === R.normalizarNome(f.nome); })[0];
        return fn && m && m.folhas[fn.id] && Object.keys(f.dias || {}).length;
      }).length;
      if (jaTem && !confirm(jaTem + " funcionário(s) já têm folha em " + R.rotuloMes(mes) + ". A importação substitui essas folhas. Continuar?")) return;
      var res = H.aplicarImportacao(estado, emp.id, mes, lido, { arquivo: arquivo.name, quem: eu ? eu.nome : "" });
      salvar(); folhaAberta = null; aba = "mes"; render();
      var msg = res.importadas + " folha(s) importada(s)." + (res.criados.length ? " Funcionário(s) novo(s) cadastrado(s) com a carga padrão: " + res.criados.join(", ") + " — confira a carga." : "") +
        (res.ignoradas.length ? " Abas ignoradas (sem nome): " + res.ignoradas.join(", ") + "." : "") +
        (res.emBranco.length ? " Em branco (não mexi): " + res.emBranco.join(", ") + "." : "");
      var avisos = res.avisos;
      if (res.criados.length || avisos.length) alert(msg + (avisos.length ? "\n\nAvisos:\n• " + avisos.join("\n• ") : ""));
      else toast(msg);
    }).catch(function (e) { alert("Não consegui ler a planilha: " + e.message); });
  }

  function exportarResumo() {
    var emp = empresa(), r = H.resumoMes(estado, emp.id, mes);
    toast("Gerando o resumo…");
    carregarScript(EXCELJS_URL, "ExcelJS").then(function (ExcelJS) {
      var wb = new ExcelJS.Workbook(), azul = "FF2445B0";
      var cab = function (ws, cols) {
        ws.columns = cols.map(function (c) { return { header: c[0], key: c[1], width: c[2] }; });
        ws.getRow(1).eachCell(function (c) { c.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azul } }; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
        ws.getRow(1).height = 30; ws.views = [{ state: "frozen", ySplit: 1 }];
      };
      var t = function (min) { return min ? min / 1440 : null; };
      var ws = wb.addWorksheet("Resumo");
      var cols = [["Funcionário", "nome", 32], ["Função", "funcao", 18], ["Situação", "sit", 12], ["Dias trabalhados", "dias", 11], ["Horas trabalhadas", "trab", 12]];
      r.pcts.forEach(function (p) { cols.push(["Hora extra " + p + "%", "he" + p, 12]); });
      cols.push(["Adicional noturno", "not", 12], ["Atrasos", "atr", 10], ["Faltas", "fal", 8], ["Atestados", "ates", 9], ["Alertas", "ale", 8]);
      cab(ws, cols);
      r.linhas.filter(function (l) { return l.folha; }).forEach(function (l) {
        var x = l.calc.totais, row = { nome: l.func.nome, funcao: l.func.funcao || "", sit: l.status === "revisada" ? "Revisada" : "A conferir", dias: x.diasTrabalhados,
          trab: t(x.trabalhado), not: t(x.noturnoReduzido), atr: t(x.atraso), fal: x.faltas || null, ates: x.atestados || null, ale: x.alertas || null };
        r.pcts.forEach(function (p) { row["he" + p] = t(x.extras[p]); });
        ws.addRow(row);
      });
      ws.eachRow(function (row, n) {
        if (n === 1) return;
        row.eachCell({ includeEmpty: true }, function (c, col) {
          c.font = { name: "Arial", size: 10 };
          var k = cols[col - 1][1];
          if (k === "trab" || k === "not" || k === "atr" || /^he/.test(k)) { c.numFmt = "[h]:mm"; c.alignment = { horizontal: "center" }; }
        });
      });
      ws.addRow([]);
      var info = ws.addRow(["Empresa: " + emp.nome + " · " + R.rotuloMes(mes) + (r.registro && r.registro.status === "fechado" ? " · mês fechado" : " · mês aberto") +
        " · tolerância " + r.regras.toleranciaDia + " min · noturno " + (r.regras.noturno.reduzida ? "em horas reduzidas" : "em horas de relógio")]);
      info.getCell(1).font = { name: "Arial", size: 9, italic: true, color: { argb: "FF5F6A7D" } };
      var wd = wb.addWorksheet("Dia a dia");
      var dcols = [["Funcionário", "nome", 28], ["Data", "data", 11], ["Dia", "sem", 6], ["Entrada", "e1", 9], ["Saída int.", "s1", 9], ["Volta int.", "e2", 9], ["Saída", "s2", 9],
        ["Ocorrência", "oc", 12], ["Observação", "obs", 26], ["Trabalhado", "trab", 11], ["Hora extra", "he", 10], ["%", "pct", 8], ["Atraso", "atr", 9], ["Noturno", "not", 9], ["Alertas", "ale", 40]];
      cab(wd, dcols);
      r.linhas.filter(function (l) { return l.folha; }).forEach(function (l) {
        l.calc.dias.forEach(function (d) {
          var e = d.entrada || {};
          if (!d.trabalhado && !e.oc && !d.alertas.length && !e.obs) return;
          var hm = function (v) { return v === null || v === undefined ? "" : R.fmtHora(v); };
          wd.addRow({ nome: l.func.nome, data: new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, d.dia)), sem: d.semana,
            e1: hm(e.e1), s1: hm(e.s1), e2: hm(e.e2), s2: hm(e.s2), oc: e.oc || (d.feriado ? "Feriado: " + d.feriado : ""), obs: e.obs || "",
            trab: t(d.trabalhado), he: t(d.extra), pct: Object.keys(d.extras).join(" / "), atr: t(d.atraso), not: t(d.noturnoReduzido), ale: d.alertas.join("; ") });
        });
      });
      wd.eachRow(function (row, n) {
        if (n === 1) return;
        row.eachCell({ includeEmpty: true }, function (c, col) {
          c.font = { name: "Arial", size: 10 };
          var k = dcols[col - 1][1];
          if (k === "data") c.numFmt = "dd/mm/yyyy";
          if (k === "trab" || k === "he" || k === "atr" || k === "not") c.numFmt = "[h]:mm";
        });
      });
      return wb.xlsx.writeBuffer();
    }).then(function (buf) {
      baixar("Horas_" + nomeArquivo(emp.nome) + "_" + mes + ".xlsx", new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      toast("Resumo exportado.");
    }).catch(function (e) { alert(e.message); });
  }

  // ---------------------------------------------------------------- edição na folha

  var editando = false;
  function editarCampo(el) {
    if (editando) return true;
    var emp = empresa(), dia = Number(el.dataset.dia), campo = el.dataset.campo, valor;
    if (campo === "oc" || campo === "obs") valor = el.value.trim();
    else {
      valor = R.paraMin(el.value);
      if (typeof valor === "number" && isNaN(valor)) { el.classList.add("invalido"); toast("Horário não reconhecido: " + el.value + ". Use 09:00 ou 0900."); return false; }
      el.classList.remove("invalido");
    }
    var campos = {}; campos[campo] = valor;
    try {
      H.atualizarDia(estado, emp.id, mes, folhaAberta, dia, campos);
      salvar();
      var foco = document.activeElement && document.activeElement.dataset ? { dia: document.activeElement.dataset.dia, campo: document.activeElement.dataset.campo } : null;
      // ao redesenhar, o campo com foco sai da tela e o navegador dispara "change" nele de novo: ignora
      editando = true;
      try { render(); } finally { editando = false; }
      if (foco && foco.dia) { var alvo = document.querySelector('[data-dia="' + foco.dia + '"][data-campo="' + foco.campo + '"]'); if (alvo) { alvo.focus(); if (alvo.select) alvo.select(); } }
    } catch (err) { alert(err.message); render(); }
    return true;
  }

  // ---------------------------------------------------------------- eventos

  document.addEventListener("submit", function (ev) { var f = ev.target.closest("form[data-form]"); if (!f) return; ev.preventDefault(); enviar(f); });

  document.addEventListener("click", function (ev) {
    if (ev.target.closest("[data-fechar]") || ev.target.id === "modal") { fecharModal(); return; }
    var ab = ev.target.closest("[data-aba]");
    if (ab) { aba = ab.dataset.aba; folhaAberta = null; render(); window.scrollTo(0, 0); return; }
    var el = ev.target.closest("[data-acao]");
    if (!el || el.tagName === "SELECT" || el.tagName === "INPUT") return;
    if (el.disabled) return;
    var a = el.dataset.acao, emp = empresa();
    if (a === "mes-anterior" || a === "mes-seguinte") { mes = R.somarMes(mes, a === "mes-anterior" ? -1 : 1); guardar("horas:mes", mes); render(); return; }
    if (a === "empresa-nova") { modalEmpresaNova(); return; }
    if (a === "exemplo") {
      var r = H.exemplo(estado); empId = r.empresa.id; mes = r.mes; guardar("horas:empresa", empId); guardar("horas:mes", mes); aba = "mes"; folhaAberta = null;
      salvar(); toast("Exemplo carregado: empresa e funcionários fictícios."); render(); return;
    }
    if (!emp) return;
    if (a === "abrir-folha") { folhaAberta = el.dataset.func; render(); window.scrollTo(0, 0); return; }
    if (a === "voltar") { folhaAberta = null; render(); return; }
    if (a === "revisada") {
      try { H.marcarRevisada(estado, emp.id, mes, folhaAberta, el.dataset.sim === "1"); salvar(); } catch (err) { alert(err.message); }
      if (el.dataset.sim === "1") {
        var lista = H.resumoMes(estado, emp.id, mes).linhas.filter(function (l) { return l.status === "importada"; });
        if (lista.length) { folhaAberta = lista[0].func.id; toast("Revisada. Próxima folha a conferir."); } else { folhaAberta = null; toast("Revisada. Todas as folhas recebidas foram conferidas."); }
      }
      render(); window.scrollTo(0, 0); return;
    }
    if (a === "gerar") { modalGerar(); return; }
    if (a === "importar") { $("arquivo").value = ""; $("arquivo").click(); return; }
    if (a === "exportar") { exportarResumo(); return; }
    if (a === "imprimir") { window.print(); return; }
    if (a === "fechar") {
      var g = H.resumoMes(estado, emp.id, mes).geral;
      var falta = g.comFolha - g.revisadas;
      if (!confirm("Fechar " + R.rotuloMes(mes) + " de " + emp.nome + "?" + (falta ? "\n\nAtenção: " + falta + " folha(s) ainda não revisada(s)." : "") +
        "\n\nO mês fechado não aceita mudanças e guarda as regras de hoje.")) return;
      H.fecharMes(estado, emp.id, mes, eu ? eu.nome : ""); salvar(); toast("Mês fechado."); render(); return;
    }
    if (a === "reabrir") { if (!confirm("Reabrir o mês? O cálculo volta a usar as regras atuais da empresa.")) return; H.reabrirMes(estado, emp.id, mes); salvar(); toast("Mês reaberto."); render(); return; }
    if (a === "func-novo") { modalFuncionario(emp); return; }
    if (a === "func-editar") { modalFuncionario(emp, el.dataset.id); return; }
    if (a === "func-varios") {
      abrirModal('<h3>Adicionar vários funcionários</h3><form data-form="varios"><p class="muted small">Um por linha. Para incluir a função, use ponto e vírgula: <code>Maria da Silva; Vendedora</code>. Dá para colar uma coluna do Excel.</p>' +
        '<textarea name="lista" aria-label="Lista de funcionários"></textarea><p class="muted small">Entram com a carga padrão da empresa (' + esc(resumoCarga(emp.cargaPadrao)) + '). Ajuste depois quem for diferente.</p>' +
        '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="submit" class="btn btn-primary">Adicionar</button></div></form>');
      return;
    }
    if (a === "regras-padrao") { if (!confirm("Voltar todas as regras desta empresa ao padrão?")) return; emp.regras = R.regrasPadrao(); salvar(); toast("Regras no padrão."); render(); return; }
    if (a === "feriados-nacionais") {
      var ano = Number(el.dataset.ano), novos = R.feriadosNacionais(ano).filter(function (f) { return !emp.feriados.some(function (x) { return x.data === f.data; }); });
      emp.feriados = emp.feriados.concat(novos); salvar(); toast(novos.length ? novos.length + " feriado(s) nacional(is) adicionado(s)." : "Os feriados nacionais já estavam na lista."); render(); return;
    }
    if (a === "feriado-remover") { emp.feriados = emp.feriados.filter(function (f) { return f.data !== el.dataset.data; }); salvar(); render(); return; }
    if (a === "remover-exemplo") {
      if (!confirm("Remover a empresa de exemplo com os funcionários e folhas fictícios?\n\nAs empresas que você cadastrou não são mexidas.")) return;
      H.removerExemplo(estado); empId = ""; aba = "mes"; folhaAberta = null; salvar(); toast("Exemplo removido."); render(); return;
    }
    if (a === "limpar-tudo") {
      var n = estado.empresas.length;
      if (!confirm("Apagar TUDO do Controle de horas: " + n + " empresa(s), funcionários, folhas e meses fechados?\n\nNão dá para desfazer. Dica: baixe antes um backup no Master.")) return;
      if (n && prompt("Para confirmar, digite APAGAR") !== "APAGAR") { toast("Nada foi apagado."); return; }
      H.limparTudo(estado); empId = ""; aba = "mes"; folhaAberta = null; salvar(); toast("Controle de horas zerado."); render(); return;
    }
    if (a === "empresa-excluir") {
      if (!confirm("Excluir " + emp.nome + " com todos os funcionários e folhas? Não dá para desfazer.\n\nDica: baixe antes um backup no Master.")) return;
      H.excluirEmpresa(estado, emp.id); empId = ""; aba = "mes"; salvar(); toast("Empresa excluída."); render(); return;
    }
    if (a === "apagar-tudo") {
      if (!confirm("Apagar TODOS os dados do Controle de horas neste navegador? Não dá para desfazer.")) return;
      estado = H.estadoVazio(); empId = ""; salvar(); render(); return;
    }
  });

  function modalEmpresaNova() {
    abrirModal('<h3>Nova empresa</h3><form data-form="empresa-nova"><div class="field"><label for="n-nome">Nome (razão social)</label><input id="n-nome" name="nome" required></div>' +
      '<div class="field"><label for="n-cnpj">CNPJ</label><input id="n-cnpj" name="cnpj"></div>' +
      '<p class="muted small">Ela começa com as regras padrão (tolerância de 10 min, extra a 50% em dia útil e 100% em domingo e feriado, noturno das 22h às 5h com hora reduzida) e os feriados nacionais do ano. Ajuste em <b>Regras de cálculo</b>.</p>' +
      '<p class="error-msg" data-erro></p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="submit" class="btn btn-primary">Cadastrar</button></div></form>');
  }

  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (el.id === "sel-empresa") {
      if (el.value === "__nova") { el.value = empId; modalEmpresaNova(); return; }
      empId = el.value; guardar("horas:empresa", empId); folhaAberta = null; render(); return;
    }
    if (el.id === "arquivo") { if (el.files && el.files[0]) importar(el.files[0]); return; }
    if (el.dataset.acaoChange === "inativos") { mostrarInativos = el.checked; render(); return; }
    if (el.dataset.campo && folhaAberta) { editarCampo(el); return; }
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && $("modal").style.display === "flex") { fecharModal(); return; }
    var el = ev.target;
    if (ev.key === "Enter" && el.dataset && el.dataset.campo && el.tagName === "INPUT") {
      ev.preventDefault();
      var dia = Number(el.dataset.dia), campo = el.dataset.campo;
      var proximo = function () { var n = document.querySelector('[data-dia="' + (dia + 1) + '"][data-campo="' + campo + '"]'); if (n) { n.focus(); n.select(); } };
      var mudou = el.value !== el.defaultValue;
      if (mudou) { if (editarCampo(el) !== false) proximo(); } else proximo();
    }
  });

  // ---------------------------------------------------------------- início

  if (!eu) {
    document.querySelector(".hr-app").innerHTML = '<div class="panel" style="margin-top:40px"><div class="hr-vazio"><strong>Abra o Controle de horas pelo sistema</strong>Entre na Gestão Financeira e escolha <b>Controle de horas</b> no menu.</div></div>';
    return;
  }
  render();
})();
