/*
 * app.js — telas do Em Dia. As regras ficam em dados.js (EmDiaDados).
 *
 * Quem está usando vem do login da Gestão Financeira (localStorage "gf.sessao"): o mesmo usuário,
 * sem novo login. Administrador = gestor (vê o painel e cadastra clientes, etapas e equipe).
 *
 * Cada setor (Contábil, Fiscal, Pessoal/DP) tem o seu diário, na aba "Diários dos setores".
 *
 * FASE ATUAL (só front): os dados ficam neste navegador, na chave "emDia:v1" (vão no backup do sistema).
 * Com o servidor, a equipe passa a ver os mesmos dados em todos os computadores.
 */
(function () {
  "use strict";
  var D = EmDiaDados;
  var CHAVE = "emDia:v1", CHAVE_MES = "emDia:mes", CHAVE_ABA = "emDia:aba";
  var $ = function (id) { return document.getElementById(id); };

  // ---------------------------------------------------------------- utilidades

  function esc(s) {
    return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._h); toast._h = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }
  function iniciais(nome) {
    var p = String(nome || "?").trim().split(/\s+/);
    return ((p[0] || "?").charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : "")).toUpperCase();
  }
  function opcoes(lista, valor, vazio) {
    return (vazio !== undefined ? '<option value="">' + esc(vazio) + "</option>" : "") + lista.map(function (o) {
      return '<option value="' + esc(o.id) + '"' + (o.id === valor ? " selected" : "") + ">" + esc(o.nome) + "</option>";
    }).join("");
  }
  function lerJSON(chave, padrao) { try { var v = JSON.parse(localStorage.getItem(chave)); return v === null ? padrao : v; } catch (e) { return padrao; } }
  function hoje() { return D.hojeIso(); }
  function diaLongo(iso) {
    var d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  }
  function quandoCurto(isoDataHora) {
    if (!isoDataHora) return "";
    var d = new Date(isoDataHora);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  // ---------------------------------------------------------------- estado

  var estado = D.normalizar(lerJSON(CHAVE, null));
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); }
    catch (e) { alert("Não consegui guardar os dados neste navegador (espaço cheio?)."); }
  }
  // outra aba/janela mexeu: recarrega
  window.addEventListener("storage", function (ev) {
    if (ev.key === CHAVE) { estado = D.normalizar(lerJSON(CHAVE, null)); render(); }
  });

  var sessao = lerJSON("gf.sessao", null);
  var eu = sessao && sessao.usuarioId ? { id: sessao.usuarioId, nome: sessao.nome, email: sessao.email, perfil: sessao.perfil } : null;
  var gestor = !!eu && eu.perfil === "admin";
  var mes = localStorage.getItem(CHAVE_MES) || D.somarMes(D.mesDe(hoje()), -1);
  var aba = localStorage.getItem(CHAVE_ABA) || "hoje";
  var filtros = { busca: "", pessoa: "", setor: "", pendentes: false, modo: "quadro", status: "",
    diario: { setor: null, pessoa: "", clienteId: "", de: "", ate: "", texto: "" }, bastaoPessoa: "", clientesBusca: "" };

  var ABAS = [
    { id: "hoje", nome: "Meu dia" },
    { id: "fechamento", nome: "Fechamento do mês" },
    { id: "diario", nome: "Diários dos setores" },
    { id: "bastao", nome: "Passagem de bastão" },
    { id: "painel", nome: "Painel do gestor", gestor: true },
    { id: "clientes", nome: "Clientes", gestor: true },
    { id: "etapas", nome: "Etapas", gestor: true },
    { id: "equipe", nome: "Equipe", gestor: true }
  ];

  function nomePessoa(id) { var p = D.porId(estado.equipe, id); return p ? p.nome : (id ? "?" : "Sem responsável"); }
  function nomeCliente(id) { var c = D.porId(estado.clientes, id); return c ? c.nome : "?"; }
  function nomeEtapa(id) { var e = D.porId(estado.etapas, id); return e ? e.nome : ""; }
  function pessoasOpcoes() { return D.equipeAtiva(estado).slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); }); }
  function clientesOpcoes() { return D.clientesAtivos(estado).slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); }); }
  function pillStatus(st) { return '<span class="pill st-' + esc(st) + '">' + esc(D.NOME_STATUS[st] || st) + "</span>"; }
  function tagSituacao(t) {
    var s = D.situacao(t, hoje());
    if (!s) return "";
    var txt = s === "atrasada" ? "atrasada " + Math.abs(D.diasEntre(hoje(), t.prazo)) + "d" : s === "hoje" ? "vence hoje" : "vence em " + D.diasEntre(hoje(), t.prazo) + "d";
    return '<span class="tag-sit ' + s + '">' + txt + "</span>";
  }
  function simbolo(st) { return { feito: "✓", andamento: "◐", travado: "!", na: "–", "a-fazer": "" }[st] || ""; }
  function meuSetor() { var p = eu && D.porId(estado.equipe, eu.id); return (p && p.setor) || ""; }
  function nomeSetor(id) { return id === "sem" ? "Sem setor" : D.NOME_AREA[id] || ""; }
  function chipSetor(id) { return id ? '<span class="ed-setor s-' + esc(id) + '">' + esc(nomeSetor(id)) + "</span>" : ""; }
  function avatar(id, peq) { return '<span class="ed-avatar' + (peq ? " p" : "") + '" aria-hidden="true">' + esc(iniciais(nomePessoa(id))) + "</span>"; }

  // ---------------------------------------------------------------- moldura

  function render() {
    $("mes-rotulo").textContent = D.rotuloMes(mes);
    $("eu").innerHTML = eu ? avatar(eu.id) + "<div><strong>" + esc(eu.nome) + '</strong><div class="muted small">' +
      esc([gestor ? "Gestor" : "", nomeSetor(meuSetor())].filter(Boolean).join(" · ") || "Contador") + "</div></div>" : "";
    var abas = ABAS.filter(function (a) { return !a.gestor || gestor; });
    if (!abas.some(function (a) { return a.id === aba; })) aba = "hoje";
    var minhasAtrasadas = eu ? D.abertasDe(estado, mes, eu.id).filter(function (t) { return D.situacao(t, hoje()) === "atrasada"; }).length : 0;
    $("abas").innerHTML = abas.map(function (a) {
      var extra = a.id === "hoje" && minhasAtrasadas ? '<span class="conta" title="Minhas tarefas atrasadas">' + minhasAtrasadas + "</span>" : "";
      return '<button type="button" data-aba="' + a.id + '" class="' + (a.id === aba ? "ativo" : "") + '"' + (a.id === aba ? ' aria-current="page"' : "") + ">" + esc(a.nome) + extra + "</button>";
    }).join("");
    var tela = { hoje: telaHoje, fechamento: telaFechamento, diario: telaDiario, bastao: telaBastao, painel: telaPainel,
      clientes: telaClientes, etapas: telaEtapas, equipe: telaEquipe }[aba];
    $("tela").innerHTML = tela();
  }

  function semClientes() {
    return '<div class="panel"><div class="ed-vazio"><strong>Nenhum cliente cadastrado ainda</strong>' +
      (gestor ? 'Cadastre os clientes em <b>Clientes</b>, ou veja como fica com uma demonstração.<br>' +
        '<button type="button" class="btn btn-primary" data-acao="exemplo">Carregar dados de exemplo</button>'
        : "Peça ao gestor para cadastrar os clientes e as etapas do fechamento.") + "</div></div>";
  }

  // ---------------------------------------------------------------- Meu dia

  function telaHoje() {
    if (!estado.clientes.length) return semClientes();
    var minhas = D.abertasDe(estado, mes, eu.id).sort(function (a, b) { return a.prazo.localeCompare(b.prazo); });
    var grupos = { atrasada: [], logo: [], andamento: [], resto: [] };
    minhas.forEach(function (t) {
      var s = D.situacao(t, hoje());
      if (s === "atrasada") grupos.atrasada.push(t);
      else if (s === "hoje" || s === "logo") grupos.logo.push(t);
      else if (t.status === "andamento" || t.status === "travado") grupos.andamento.push(t);
      else grupos.resto.push(t);
    });
    var ausencia = D.ausenciaAtual(D.porId(estado.equipe, eu.id), hoje());
    var lista = function (titulo, ts, classe, limite) {
      if (!ts.length) return "";
      var mais = limite && ts.length > limite ? '<li class="ed-tarefa"><span class="muted small">e mais ' + (ts.length - limite) + " — veja em Fechamento do mês</span></li>" : "";
      return '<div class="ed-grupo ' + (classe || "") + '">' + titulo + " (" + ts.length + ")</div><ul class=\"ed-tarefas\">" +
        ts.slice(0, limite || ts.length).map(itemTarefa).join("") + mais + "</ul>";
    };
    var meuDia = D.filtrarDiario(estado, { pessoa: eu.id, de: hoje(), ate: hoje() });
    var avisoSetor = meuSetor() ? "" : '<div class="ed-aviso ed-aviso-setor"><span>Em qual setor você trabalha? Seus registros vão para o diário dele.</span>' +
      '<select data-acao-change="meu-setor" aria-label="Meu setor">' + opcoes(D.SETORES, "", "Escolha…") + "</select></div>";
    return avisoSetor + (ausencia ? '<div class="ed-aviso">Você está marcado como ausente (' + esc(ausencia.motivo || "ausência") + ") até " + D.dataBr(ausencia.fim) + ".</div>" : "") +
      '<div class="ed-duas">' +
      '<section class="panel"><div class="panel-head row"><div><h2>Minhas tarefas · ' + esc(D.rotuloMes(mes)) + '</h2><p class="muted small">' +
        (minhas.length ? minhas.length + " em aberto, do prazo mais próximo ao mais distante." : "Nada em aberto com você neste mês.") + "</p></div></div>" +
        (minhas.length ? lista("Atrasadas", grupos.atrasada, "vermelho") + lista("Vencem nos próximos dias", grupos.logo) +
          lista("Em andamento ou travadas", grupos.andamento) + lista("Próximas", grupos.resto, "", 8)
          : '<div class="ed-vazio"><strong>Tudo em dia 🎉</strong>Registre abaixo o que fizer de outros clientes.</div>') +
      "</section>" +
      '<div class="ed-col">' + painelRegistrar() +
      '<section class="panel"><div class="panel-head"><h2>O que registrei hoje</h2><p class="muted small">' + esc(diaLongo(hoje())) + "</p></div>" +
        (meuDia.length ? meuDia.map(function (d) { return itemDiario(d); }).join("") : '<div class="ed-vazio">Nada registrado ainda hoje.</div>') + "</section>" +
      "</div></div>";
  }

  function itemTarefa(t) {
    var p = D.ultimoOndeParei(estado, t.mes, t.clienteId, t.etapaId);
    return '<li class="ed-tarefa"><div><div class="titulo">' + esc(t.cliente) + ' <span class="muted">· ' + esc(t.etapa) + "</span></div>" +
      '<div class="meta">' + pillStatus(t.status) + " <span>Prazo " + D.dataBr(t.prazo) + "</span>" + tagSituacao(t) + (t.nota ? "<span>" + esc(t.nota) + "</span>" : "") + "</div></div>" +
      '<div class="acoes"><button type="button" class="btn btn-soft btn-sm" data-acao="registrar" data-cliente="' + esc(t.clienteId) + '" data-etapa="' + esc(t.etapaId) + '">Registrar</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-acao="tarefa" data-cliente="' + esc(t.clienteId) + '" data-etapa="' + esc(t.etapaId) + '" aria-label="Detalhes">Abrir</button></div>' +
      (p ? '<div class="ed-parei"><b>Onde parou</b> (' + esc(nomePessoa(p.autor)) + ", " + D.dataBr(p.data) + "): " + esc(p.ondeParei) + "</div>" : "") + "</li>";
  }

  function formRegistro(pre) {
    pre = pre || {};
    var cliente = pre.clienteId ? D.porId(estado.clientes, pre.clienteId) : null;
    var etapas = cliente ? D.etapasDoCliente(estado, cliente) : [];
    var etapa = pre.etapaId ? D.porId(estado.etapas, pre.etapaId) : null;
    var setor = pre.setor || (etapa && D.ehSetor(etapa.area) ? etapa.area : "") || meuSetor();
    return '<form class="ed-form" data-form="registro">' +
      '<div class="field"><span class="ed-rotulo">Diário do setor</span><div class="segmentado ed-seg-setor" role="radiogroup" aria-label="Diário do setor">' +
        D.SETORES.map(function (x) {
          return '<label class="s-' + x.id + (x.id === setor ? " ativo" : "") + '"><input type="radio" name="setor" value="' + x.id + '"' + (x.id === setor ? " checked" : "") + ">" + esc(x.nome) + "</label>";
        }).join("") + "</div></div>" +
      '<div class="linha"><div class="field"><label for="r-cliente">Cliente</label><select id="r-cliente" name="clienteId" required>' + opcoes(clientesOpcoes(), pre.clienteId, "Escolha…") + "</select></div>" +
      '<div class="field"><label for="r-etapa">Etapa do fechamento</label><select id="r-etapa" name="etapaId">' + opcoes(etapas, pre.etapaId, "Outra atividade / geral") + "</select></div></div>" +
      '<div class="field"><label for="r-feito">O que foi feito</label><textarea id="r-feito" name="feito" required placeholder="Ex.: conciliei o Sicredi e o Banrisul de setembro"></textarea></div>' +
      '<div class="field ed-destaque-campo"><label for="r-parei">Onde parei / próximo passo</label><textarea id="r-parei" name="ondeParei" placeholder="Ex.: falta a Caixa; o extrato chega amanhã pelo cliente"></textarea>' +
        '<span class="ed-dica">É o que alguém precisa saber para continuar se você faltar.</span></div>' +
      '<div class="linha"><div class="field"><label for="r-status">Situação da etapa</label><select id="r-status" name="status">' +
        '<option value="">Não mudar</option>' + D.STATUS.map(function (s) { return '<option value="' + s.id + '"' + (pre.status === s.id ? " selected" : "") + ">" + s.nome + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="r-min">Tempo gasto (minutos, opcional)</label><input id="r-min" name="minutos" type="number" min="0" step="5" inputmode="numeric"></div></div>' +
      '<p class="error-msg" data-erro></p>' +
      '<div class="form-actions" style="margin-top:0"><button type="submit" class="btn btn-primary">Registrar atividade</button>' + (pre.modal ? '<button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>' : "") + "</div></form>";
  }
  function painelRegistrar() {
    return '<section class="panel"><div class="panel-head"><h2>Registrar atividade</h2><p class="muted small">Leva 30 segundos: o que fez e onde parou.</p></div><div class="panel-body">' + formRegistro() + "</div></section>";
  }

  // ---------------------------------------------------------------- Fechamento do mês

  function telaFechamento() {
    if (!estado.clientes.length) return semClientes();
    var r = D.resumoMes(estado, mes, hoje());
    var etapas = D.etapasAtivas(estado).filter(function (e) { return !filtros.setor || e.area === filtros.setor; });
    var busca = filtros.busca.trim().toLowerCase();
    var linhas = r.porCliente.filter(function (p) {
      if (busca && p.cliente.nome.toLowerCase().indexOf(busca) < 0) return false;
      if (filtros.pendentes && p.total && p.feitas === p.total) return false;
      return true;
    }).sort(function (a, b) { return b.atrasadas - a.atrasadas || a.pct - b.pct || a.cliente.nome.localeCompare(b.cliente.nome); });
    var topo = '<div class="stats ed-stats">' +
      stat("Fechamento de " + D.rotuloMes(mes), r.geral.pct + "%", r.geral.feitas + " de " + r.geral.total + " etapas feitas", true) +
      stat("Clientes concluídos", r.geral.clientesConcluidos + " de " + r.geral.clientes, "") +
      stat("Atrasadas", r.geral.atrasadas, "prazo já passou", false, r.geral.atrasadas > 0) +
      stat("Travadas", r.geral.travadas, "esperando algo", false, false) + "</div>";
    var ferramentas = '<div class="ed-filtros">' +
      '<div class="field"><label>Visão</label><div class="segmentado"><button type="button" data-acao="modo" data-modo="quadro" class="' + (filtros.modo === "quadro" ? "ativo" : "") + '">Quadro</button>' +
        '<button type="button" data-acao="modo" data-modo="lista" class="' + (filtros.modo === "lista" ? "ativo" : "") + '">Lista</button></div></div>' +
      '<div class="field larga"><label for="f-busca">Cliente</label><input id="f-busca" data-filtro="busca" type="search" placeholder="Buscar cliente…" value="' + esc(filtros.busca) + '"></div>' +
      '<div class="field"><label for="f-setor">Setor</label><select id="f-setor" data-filtro="setor">' + opcoes(D.SETORES, filtros.setor, "Todos") + "</select></div>" +
      '<div class="field"><label for="f-pessoa">Responsável</label><select id="f-pessoa" data-filtro="pessoa">' + opcoes(pessoasOpcoes(), filtros.pessoa, "Todos") + "</select></div>" +
      (filtros.modo === "lista" ? '<div class="field"><label for="f-status">Situação</label><select id="f-status" data-filtro="status"><option value="">Em aberto</option><option value="todas"' + (filtros.status === "todas" ? " selected" : "") + ">Todas</option>" +
        D.STATUS.map(function (s) { return '<option value="' + s.id + '"' + (filtros.status === s.id ? " selected" : "") + ">" + s.nome + "</option>"; }).join("") + "</select></div>" : "") +
      '<label class="ed-check" style="margin-bottom:8px"><input type="checkbox" data-filtro="pendentes"' + (filtros.pendentes ? " checked" : "") + "> Só clientes com pendências</label></div>";
    var corpo = filtros.modo === "lista" ? listaTarefas(r.tarefas, linhas) : quadro(linhas, etapas);
    return topo + '<section class="panel">' + ferramentas + corpo + "</section>";
  }

  function stat(rotulo, valor, sub, principal, alerta) {
    return '<div class="stat' + (principal ? " primary" : "") + (alerta ? " alerta" : "") + '"><div class="label">' + esc(rotulo) + '</div><div class="value">' + esc(valor) + "</div>" + (sub ? '<div class="sub">' + esc(sub) + "</div>" : "") + "</div>";
  }

  function quadro(linhas, etapas) {
    if (!linhas.length) return '<div class="ed-vazio">Nenhum cliente com esse filtro.</div>';
    var cab = '<tr><th class="col-cliente">Cliente</th><th class="col-prog">Progresso</th>' + etapas.map(function (e) {
      return '<th class="area-' + esc(e.area) + '" title="' + esc(e.nome + " · " + D.NOME_AREA[e.area] + " · prazo dia " + e.prazoDia) + '">' + esc(e.curto || e.nome) + "</th>";
    }).join("") + "</tr>";
    var corpo = linhas.map(function (p) {
      var c = p.cliente, validas = {};
      D.etapasDoCliente(estado, c).forEach(function (e) { validas[e.id] = e; });
      return '<tr><td class="col-cliente"><strong title="' + esc(c.nome) + '">' + esc(c.nome) + '</strong><span class="cell-sub">' + esc(c.regime || "") + "</span></td>" +
        '<td class="col-prog"><span class="pct-bar"><i style="width:' + p.pct + '%"></i></span>' + p.feitas + "/" + p.total +
          (p.atrasadas ? ' <span class="tag-sit atrasada">' + p.atrasadas + "</span>" : "") + "</td>" +
        etapas.map(function (e) {
          if (!validas[e.id]) return '<td class="vazio" title="Não se aplica a este cliente">·</td>';
          var t = D.tarefa(estado, mes, c, e), s = D.situacao(t, hoje());
          var apagada = filtros.pessoa && t.responsavel !== filtros.pessoa;
          return '<td><button type="button" class="ed-cel st-' + t.status + (s === "atrasada" ? " atrasada" : "") + (apagada ? " esmaecida" : "") + '" data-acao="tarefa" data-cliente="' + esc(c.id) + '" data-etapa="' + esc(e.id) + '" title="' +
            esc(e.nome + " — " + D.NOME_STATUS[t.status] + " · " + nomePessoa(t.responsavel) + " · prazo " + D.dataBr(t.prazo) + (s === "atrasada" ? " (atrasada)" : "")) + '">' + simbolo(t.status) + "</button></td>";
        }).join("") + "</tr>";
    }).join("");
    return '<div class="ed-matriz-wrap"><table class="ed-matriz"><thead>' + cab + "</thead><tbody>" + corpo + "</tbody></table></div>" +
      '<div class="ed-legenda"><span><span class="ed-cel"></span>A fazer</span><span><span class="ed-cel st-andamento">◐</span>Em andamento</span>' +
      '<span><span class="ed-cel st-travado">!</span>Travado</span><span><span class="ed-cel st-feito">✓</span>Feito</span>' +
      '<span><span class="ed-cel atrasada"></span>Atrasada</span><span>Clique numa etapa para ver o histórico e mudar a situação.</span></div>';
  }

  function listaTarefas(tarefas, linhas) {
    var clientesVisiveis = {};
    linhas.forEach(function (p) { clientesVisiveis[p.cliente.id] = true; });
    var ts = tarefas.filter(function (t) {
      if (!clientesVisiveis[t.clienteId]) return false;
      if (filtros.pessoa && t.responsavel !== filtros.pessoa) return false;
      if (filtros.setor && t.area !== filtros.setor) return false;
      if (!filtros.status) return D.aberta(t);
      if (filtros.status === "todas") return true;
      return t.status === filtros.status;
    }).sort(function (a, b) { return a.prazo.localeCompare(b.prazo) || a.cliente.localeCompare(b.cliente); });
    if (!ts.length) return '<div class="ed-vazio">Nenhuma tarefa com esse filtro.</div>';
    return '<div class="table-wrap"><table class="ledger"><thead><tr><th>Cliente</th><th>Etapa</th><th>Responsável</th><th>Prazo</th><th>Situação</th><th>Onde parou</th></tr></thead><tbody>' +
      ts.map(function (t) {
        var p = D.ultimoOndeParei(estado, mes, t.clienteId, t.etapaId);
        return '<tr data-acao="tarefa" data-cliente="' + esc(t.clienteId) + '" data-etapa="' + esc(t.etapaId) + '" style="cursor:pointer"><td><strong>' + esc(t.cliente) + "</strong></td><td>" + esc(t.etapa) +
          '<span class="cell-sub">' + esc(D.NOME_AREA[t.area]) + "</span></td><td>" + esc(nomePessoa(t.responsavel)) + "</td><td>" + D.dataBr(t.prazo) + " " + tagSituacao(t) + "</td><td>" + pillStatus(t.status) +
          "</td><td class=\"small\">" + esc(p ? p.ondeParei : t.nota) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  // ---------------------------------------------------------------- Diário

  var DESCR_SETOR = {
    contabil: "Conciliações, lançamentos, balancetes e o que mais o contábil fez no dia.",
    fiscal: "Notas, apurações, guias e obrigações: o dia a dia do fiscal.",
    pessoal: "Folha, admissões, férias, rescisões e eSocial: o dia a dia do DP."
  };

  function telaDiario() {
    if (!estado.clientes.length) return semClientes();
    var f = filtros.diario;
    if (f.setor === null) f.setor = meuSetor();   // abre no diário do meu setor
    var setor = f.setor;
    var lista = D.filtrarDiario(estado, f);
    var porDia = [], atual = null;
    lista.slice(0, 300).forEach(function (d) {
      if (!atual || atual.data !== d.data) { atual = { data: d.data, itens: [] }; porDia.push(atual); }
      atual.itens.push(d);
    });
    var resumo = D.resumoSetores(estado, mes, hoje());
    var semSetor = D.filtrarDiario(estado, { setor: "sem" }).length;
    var seletor = '<div class="ed-setores" role="tablist" aria-label="Diário do setor">' +
      '<button type="button" role="tab" data-acao="diario-setor" data-setor="" class="ed-setor-btn' + (!setor ? " ativo" : "") + '" aria-selected="' + !setor + '"><strong>Todos</strong><span>' +
        estado.diario.filter(function (d) { return d.data === hoje(); }).length + " hoje</span></button>" +
      resumo.map(function (r) {
        var at = setor === r.setor.id;
        return '<button type="button" role="tab" data-acao="diario-setor" data-setor="' + r.setor.id + '" class="ed-setor-btn s-' + r.setor.id + (at ? " ativo" : "") + '" aria-selected="' + at + '">' +
          "<strong>" + esc(r.setor.nome) + "</strong><span>" + r.registrosHoje + " hoje" + (r.atrasadas ? ' · <b class="val-d">' + r.atrasadas + " atrasada(s)</b>" : "") + "</span></button>";
      }).join("") +
      (semSetor ? '<button type="button" role="tab" data-acao="diario-setor" data-setor="sem" class="ed-setor-btn' + (setor === "sem" ? " ativo" : "") + '"><strong>Sem setor</strong><span>' + semSetor + " registro(s)</span></button>" : "") +
      "</div>";
    var r = D.ehSetor(setor) ? resumo.filter(function (x) { return x.setor.id === setor; })[0] : null;
    var titulo = r ? "Diário " + r.setor.nome : setor === "sem" ? "Registros sem setor" : "Diários de todos os setores";
    var sub = r ? DESCR_SETOR[setor] || "" : setor === "sem" ? "Registros feitos sem etapa e por quem ainda não escolheu o setor." : "Tudo o que a equipe registrou, de todos os setores.";
    var numeros = r ? '<div class="ed-setor-resumo">' +
        "<div><span>Registros hoje</span><strong>" + r.registrosHoje + "</strong></div>" +
        "<div><span>Pessoas que registraram hoje</span><strong>" + r.pessoasHoje + "</strong></div>" +
        "<div><span>Horas registradas hoje</span><strong>" + (r.minutosHoje ? (r.minutosHoje / 60).toFixed(1).replace(".", ",") + " h" : "—") + "</strong></div>" +
        "<div><span>Etapas do setor em " + esc(D.rotuloMes(mes)) + "</span><strong>" + r.feitas + "/" + r.total + "</strong>" + (r.atrasadas ? ' <b class="val-d small">' + r.atrasadas + " atrasada(s)</b>" : "") + "</div>" +
        '<div class="ed-setor-equipe"><span>Equipe do setor</span>' + (r.equipe.length ? r.equipe.map(function (p) {
          var aus = D.ausenciaAtual(p, hoje());
          return '<span class="ed-pessoa-chip' + (aus ? " ausente" : "") + '" title="' + esc(aus ? "Ausente: " + (aus.motivo || "") : "Disponível") + '">' + avatar(p.id, true) + esc(p.nome.split(" ")[0]) + (aus ? " (ausente)" : "") + "</span>";
        }).join("") : '<span class="muted small">Ninguém neste setor ainda' + (gestor ? " — defina em Equipe." : ".") + "</span>") + "</div>" +
      "</div>" : "";
    return seletor + '<section class="panel ed-diario' + (r ? " s-" + setor : "") + '"><div class="panel-head row"><div><h2>' + esc(titulo) + '</h2><p class="muted small">' + esc(sub) + "</p></div>" +
      '<div class="panel-actions"><button type="button" class="btn btn-outline btn-sm" data-acao="csv">Exportar CSV</button><button type="button" class="btn btn-primary btn-sm" data-acao="registrar" data-setor="' + esc(r ? setor : "") + '">Registrar' + (r ? " no " + esc(r.setor.nome) : " atividade") + "</button></div></div>" +
      numeros +
      '<div class="ed-filtros">' +
        '<div class="field"><label for="d-pessoa">Pessoa</label><select id="d-pessoa" data-filtro-diario="pessoa">' + opcoes(pessoasOpcoes(), f.pessoa, "Todas") + "</select></div>" +
        '<div class="field"><label for="d-cliente">Cliente</label><select id="d-cliente" data-filtro-diario="clienteId">' + opcoes(clientesOpcoes(), f.clienteId, "Todos") + "</select></div>" +
        '<div class="field"><label for="d-de">De</label><input id="d-de" type="date" data-filtro-diario="de" value="' + esc(f.de) + '"></div>' +
        '<div class="field"><label for="d-ate">Até</label><input id="d-ate" type="date" data-filtro-diario="ate" value="' + esc(f.ate) + '"></div>' +
        '<div class="field larga"><label for="d-texto">Texto</label><input id="d-texto" type="search" data-filtro-diario="texto" placeholder="Procurar no que foi feito…" value="' + esc(f.texto) + '"></div>' +
      "</div>" +
      (porDia.length ? porDia.map(function (g) {
        return '<div class="ed-dia">' + esc(diaLongo(g.data)) + " · " + D.dataBr(g.data) + "</div>" + g.itens.map(function (d) { return itemDiario(d, !!r); }).join("");
      }).join("") + (lista.length > 300 ? '<div class="ed-vazio">Mostrando as 300 mais recentes. Use os filtros para ver as anteriores.</div>' : "")
        : '<div class="ed-vazio"><strong>Nada registrado ' + (r ? "no diário " + esc(r.setor.nome) : "com esse filtro") + "</strong>As atividades aparecem aqui quando alguém registra em “Meu dia” ou no botão Registrar.</div>") +
      "</section>";
  }

  function itemDiario(d, semChip) {
    var etapa = nomeEtapa(d.etapaId);
    return '<div class="ed-entrada' + (d.tipo === "bastao" ? " bastao" : "") + '"><span class="hora">' + esc(d.hora) + "</span>" + avatar(d.autor, true) +
      '<div class="corpo"><div class="quem"><strong>' + esc(nomePessoa(d.autor)) + "</strong> · " + esc(nomeCliente(d.clienteId)) + (etapa ? " · " + esc(etapa) : "") +
        (d.minutos ? " · " + d.minutos + " min" : "") + (d.status ? " · " + pillStatus(d.status) : "") + (semChip ? "" : " " + chipSetor(D.setorDe(estado, d))) + "</div>" +
        '<p class="texto">' + esc(d.feito) + "</p>" +
        (d.ondeParei ? '<div class="ed-parei"><b>Onde parei:</b> ' + esc(d.ondeParei) + "</div>" : "") + "</div></div>";
  }

  // ---------------------------------------------------------------- Passagem de bastão

  function telaBastao() {
    if (!estado.clientes.length) return semClientes();
    var pessoas = pessoasOpcoes();
    if (!filtros.bastaoPessoa) {
      var ausente = pessoas.filter(function (p) { return D.ausenciaAtual(p, hoje()); })[0];
      filtros.bastaoPessoa = (ausente || D.porId(estado.equipe, eu.id) || pessoas[0] || {}).id || "";
    }
    var pessoa = D.porId(estado.equipe, filtros.bastaoPessoa);
    var abertas = pessoa ? D.abertasDe(estado, mes, pessoa.id).sort(function (a, b) { return a.prazo.localeCompare(b.prazo); }) : [];
    var aus = pessoa ? D.ausenciaAtual(pessoa, hoje()) : null;
    var outras = pessoas.filter(function (p) { return !pessoa || p.id !== pessoa.id; });
    return '<section class="panel"><div class="panel-head row"><div><h2>Passagem de bastão</h2><p class="muted small">Tudo o que está em aberto com uma pessoa, com o último “onde parei” de cada tarefa, para outra pessoa continuar.</p></div>' +
      '<div class="panel-actions no-print"><button type="button" class="btn btn-outline btn-sm" data-acao="imprimir">Imprimir resumo</button></div></div>' +
      '<div class="ed-filtros"><div class="field"><label for="b-pessoa">Pessoa</label><select id="b-pessoa" data-acao-change="bastao-pessoa">' + opcoes(pessoas, filtros.bastaoPessoa) + "</select></div>" +
        '<div class="ed-dica" style="margin-bottom:10px">' + abertas.length + " tarefa(s) em aberto em " + esc(D.rotuloMes(mes)) + "</div></div>" +
      (pessoa ? (aus ? '<div class="ed-ausente" style="margin-top:16px"><span><strong>' + esc(pessoa.nome) + " está ausente</strong> — " + esc(aus.motivo || "ausência") + ", de " + D.dataBr(aus.inicio) + " até " + (aus.fim ? D.dataBr(aus.fim) : "sem data") + ".</span>" +
          (gestor ? '<button type="button" class="btn btn-ghost btn-sm" data-acao="fim-ausencia" data-pessoa="' + esc(pessoa.id) + '" data-ausencia="' + esc(aus.id) + '">Encerrar ausência</button>' : "") + "</div>"
          : (gestor ? '<div style="padding:12px 20px 0" class="no-print"><button type="button" class="btn btn-soft btn-sm" data-acao="ausencia" data-pessoa="' + esc(pessoa.id) + '">Registrar ausência (doença, férias…)</button></div>' : "")) : "") +
      (abertas.length ? '<div class="table-wrap" style="margin-top:12px"><table class="ledger"><thead><tr>' + (gestor ? '<th class="no-print"><input type="checkbox" data-acao="marcar-todas" aria-label="Marcar todas"></th>' : "") +
          "<th>Cliente · etapa</th><th>Prazo</th><th>Situação</th><th>Onde parou (último registro)</th></tr></thead><tbody>" +
          abertas.map(function (t) {
            var p = D.ultimoOndeParei(estado, mes, t.clienteId, t.etapaId);
            return "<tr>" + (gestor ? '<td class="no-print"><input type="checkbox" data-bastao value="' + esc(t.clienteId + "|" + t.etapaId) + '" aria-label="Selecionar"></td>' : "") +
              '<td><strong>' + esc(t.cliente) + '</strong><span class="cell-sub">' + esc(t.etapa) + "</span></td><td>" + D.dataBr(t.prazo) + "<br>" + tagSituacao(t) + "</td><td>" + pillStatus(t.status) +
              (t.nota ? '<span class="cell-sub">' + esc(t.nota) + "</span>" : "") + "</td><td>" + (p ? esc(p.ondeParei) + '<span class="cell-sub">' + esc(nomePessoa(p.autor)) + ", " + D.dataBr(p.data) + " " + esc(p.hora) + "</span>" : '<span class="muted">Sem registro</span>') + "</td></tr>";
          }).join("") + "</tbody></table></div>" +
          (gestor ? '<div class="ed-rodape-acao"><span class="small">Passar as marcadas para</span><select id="b-para">' + opcoes(outras, "", "Escolha a pessoa…") + '</select><button type="button" class="btn btn-primary btn-sm" data-acao="passar">Passar o bastão</button></div>' : "")
        : '<div class="ed-vazio"><strong>Nada em aberto com ' + esc(pessoa ? pessoa.nome : "esta pessoa") + "</strong>Escolha outra pessoa ou outro mês.</div>") +
      "</section>";
  }

  // ---------------------------------------------------------------- Painel do gestor

  function telaPainel() {
    if (!estado.clientes.length) return semClientes();
    var r = D.resumoMes(estado, mes, hoje());
    var atencao = r.porCliente.filter(function (p) { return p.atrasadas || p.travadas; })
      .sort(function (a, b) { return (b.atrasadas * 2 + b.travadas) - (a.atrasadas * 2 + a.travadas); }).slice(0, 8);
    var ultimas = D.filtrarDiario(estado, {}).slice(0, 12);
    return '<div class="stats ed-stats">' +
      stat("Fechamento de " + D.rotuloMes(mes), r.geral.pct + "%", r.geral.feitas + " de " + r.geral.total + " etapas", true) +
      stat("Clientes concluídos", r.geral.clientesConcluidos + " de " + r.geral.clientes, "") +
      stat("Atrasadas", r.geral.atrasadas, r.geral.travadas + " travadas", false, r.geral.atrasadas > 0) +
      stat("Sem responsável", r.geral.semDono, "etapas em aberto sem dono", false, r.geral.semDono > 0) + "</div>" +
      '<div class="ed-duas"><div class="ed-col">' +
      '<section class="panel"><div class="panel-head row"><div><h2>Por pessoa</h2><p class="muted small">Carga de cada um neste mês.</p></div></div><div class="table-wrap"><table class="ledger"><thead><tr><th>Pessoa</th><th class="num">Em aberto</th><th class="num">Atrasadas</th><th class="num">Feitas</th><th>Última atividade</th></tr></thead><tbody>' +
        r.porPessoa.map(function (p) {
          return '<tr><td><div class="ed-pessoa">' + avatar(p.pessoa.id, true) + "<div><strong>" + esc(p.pessoa.nome) + "</strong>" + (p.ausencia ? ' <span class="pill st-travado">Ausente</span>' : "") +
            '<span class="cell-sub">' + esc(p.pessoa.funcao || "") + "</span></div></div></td><td class=\"num\">" + p.abertas + '</td><td class="num">' + (p.atrasadas ? '<span class="val-d">' + p.atrasadas + "</span>" : "0") +
            '</td><td class="num">' + p.feitas + '</td><td class="small">' + (p.ultima ? esc(D.dataBr(p.ultima.data) + " " + p.ultima.hora + " · " + nomeCliente(p.ultima.clienteId)) : '<span class="muted">—</span>') + "</td></tr>";
        }).join("") + "</tbody></table></div></section>" +
      '<section class="panel"><div class="panel-head"><h2>Clientes que pedem atenção</h2></div>' + (atencao.length ? '<div class="table-wrap"><table class="ledger"><thead><tr><th>Cliente</th><th>Progresso</th><th class="num">Atrasadas</th><th class="num">Travadas</th></tr></thead><tbody>' +
        atencao.map(function (p) { return "<tr><td><strong>" + esc(p.cliente.nome) + '</strong></td><td><span class="pct-bar"><i style="width:' + p.pct + '%"></i></span>' + p.pct + '%</td><td class="num"><span class="val-d">' + p.atrasadas + '</span></td><td class="num">' + p.travadas + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : '<div class="ed-vazio">Nenhum cliente com atraso ou travado. 👏</div>') + "</section>" +
      "</div><div class=\"ed-col\">" +
      '<section class="panel"><div class="panel-head"><h2>Por setor</h2><p class="muted small">Etapas do mês feitas e o diário de hoje de cada setor.</p></div><div style="padding:8px 0 12px">' + D.resumoSetores(estado, mes, hoje()).map(function (a) {
        return '<div class="ed-barra-linha"><span>' + chipSetor(a.setor.id) + '</span><div class="ed-barra"><i style="width:' + a.pct + '%"></i></div><span class="num">' + a.feitas + "/" + a.total + "</span></div>" +
          '<div class="ed-barra-sub"><button type="button" class="link-btn" data-acao="abrir-diario" data-setor="' + a.setor.id + '">' + a.registrosHoje + " registro(s) hoje" + (a.pessoasHoje ? ", por " + a.pessoasHoje + " pessoa(s)" : "") + "</button>" +
          (a.atrasadas ? ' · <span class="val-d">' + a.atrasadas + " atrasada(s)</span>" : "") + "</div>";
      }).join("") + "</div></section>" +
      '<section class="panel"><div class="panel-head"><h2>Últimas atividades</h2></div>' + (ultimas.length ? '<ul class="ed-feed">' + ultimas.map(function (d) {
        return "<li><strong>" + esc(nomePessoa(d.autor)) + "</strong> · " + esc(nomeCliente(d.clienteId)) + (d.etapaId ? " · " + esc(nomeEtapa(d.etapaId)) : "") + "<br>" + esc(d.feito) +
          '<div class="quando">' + D.dataBr(d.data) + " " + esc(d.hora) + "</div></li>";
      }).join("") + "</ul>" : '<div class="ed-vazio">Ninguém registrou nada ainda.</div>') + "</section>" +
      "</div></div>";
  }

  // ---------------------------------------------------------------- Clientes

  function telaClientes() {
    var busca = filtros.clientesBusca.trim().toLowerCase();
    var lista = estado.clientes.slice().filter(function (c) { return !busca || c.nome.toLowerCase().indexOf(busca) > -1 || String(c.cnpj || "").indexOf(busca) > -1; })
      .sort(function (a, b) { return (b.ativo !== false) - (a.ativo !== false) || a.nome.localeCompare(b.nome); });
    var r = D.resumoMes(estado, mes, hoje()), prog = {};
    r.porCliente.forEach(function (p) { prog[p.cliente.id] = p; });
    return '<section class="panel"><div class="panel-head row"><div><h2>Clientes</h2><p class="muted small">Quem é responsável por cada área e quais etapas do fechamento valem para o cliente.</p></div>' +
      '<div class="panel-actions">' + (estado.clientes.length ? "" : '<button type="button" class="btn btn-outline btn-sm" data-acao="exemplo">Dados de exemplo</button>') +
        '<button type="button" class="btn btn-primary btn-sm" data-acao="cliente">Novo cliente</button></div></div>' +
      '<div class="ed-filtros"><div class="field larga"><label for="c-busca">Buscar</label><input id="c-busca" type="search" data-filtro="clientesBusca" placeholder="Nome ou CNPJ…" value="' + esc(filtros.clientesBusca) + '"></div></div>' +
      (lista.length ? '<div class="table-wrap"><table class="ledger"><thead><tr><th>Cliente</th><th>Regime</th><th>Contábil</th><th>Fiscal</th><th>Pessoal (DP)</th><th>' + esc(D.rotuloMes(mes)) + '</th><th class="col-actions"></th></tr></thead><tbody>' +
        lista.map(function (c) {
          var p = prog[c.id], rs = c.responsaveis || {};
          return '<tr' + (c.ativo === false ? ' style="opacity:.55"' : "") + "><td><strong>" + esc(c.nome) + '</strong><span class="cell-sub">' + esc(c.cnpj || "") + (c.ativo === false ? " · desativado" : "") + "</span></td><td>" + esc(c.regime || "—") +
            "</td><td>" + esc(rs.contabil ? nomePessoa(rs.contabil) : "—") + "</td><td>" + esc(rs.fiscal ? nomePessoa(rs.fiscal) : "—") + "</td><td>" + esc(rs.pessoal ? nomePessoa(rs.pessoal) : "—") + "</td><td>" +
            (p ? '<span class="pct-bar"><i style="width:' + p.pct + '%"></i></span>' + p.pct + "%" : "—") + '</td><td class="row-actions"><button type="button" data-acao="cliente" data-id="' + esc(c.id) + '">Editar</button></td></tr>';
        }).join("") + "</tbody></table></div>" : '<div class="ed-vazio"><strong>Nenhum cliente</strong>Cadastre o primeiro em “Novo cliente”.</div>') + "</section>";
  }

  // ---------------------------------------------------------------- Etapas

  function telaEtapas() {
    return '<section class="panel"><div class="panel-head row"><div><h2>Etapas do fechamento</h2><p class="muted small">A lista que cada cliente percorre todo mês. O prazo é o dia do mês seguinte à competência. Os prazos que vêm prontos são de exemplo: ajuste para a rotina do escritório.</p></div>' +
      '<div class="panel-actions"><button type="button" class="btn btn-ghost btn-sm" data-acao="etapas-padrao">Restaurar padrão</button><button type="button" class="btn btn-primary btn-sm" data-acao="etapa">Nova etapa</button></div></div>' +
      '<div class="table-wrap"><table class="ledger"><thead><tr><th>Ordem</th><th>Etapa</th><th>Área</th><th class="num">Prazo (dia)</th><th>Vale para</th><th>Situação</th><th class="col-actions"></th></tr></thead><tbody>' +
      estado.etapas.map(function (e, i) {
        return "<tr" + (e.ativa === false ? ' style="opacity:.55"' : "") + '><td style="white-space:nowrap"><button type="button" class="btn btn-ghost btn-sm" data-acao="subir" data-i="' + i + '" aria-label="Subir"' + (i ? "" : " disabled") + '>↑</button><button type="button" class="btn btn-ghost btn-sm" data-acao="descer" data-i="' + i + '" aria-label="Descer"' + (i < estado.etapas.length - 1 ? "" : " disabled") + ">↓</button></td>" +
          "<td><strong>" + esc(e.nome) + '</strong><span class="cell-sub">No quadro: ' + esc(e.curto || e.nome) + "</span></td><td>" + esc(D.NOME_AREA[e.area] || e.area) + '</td><td class="num">' + esc(e.prazoDia) + "</td><td class=\"small\">" +
          esc(e.regimes && e.regimes.length ? e.regimes.join(", ") : "Todos os regimes") + "</td><td>" + (e.ativa === false ? '<span class="pill inativo">Desativada</span>' : '<span class="pill ativo">Ativa</span>') +
          '</td><td class="row-actions"><button type="button" data-acao="etapa" data-id="' + esc(e.id) + '">Editar</button></td></tr>';
      }).join("") + "</tbody></table></div></section>";
  }

  // ---------------------------------------------------------------- Equipe

  function telaEquipe() {
    var r = D.resumoMes(estado, mes, hoje()), carga = {};
    r.porPessoa.forEach(function (p) { carga[p.pessoa.id] = p; });
    return '<section class="panel"><div class="panel-head row"><div><h2>Equipe</h2><p class="muted small">Quem entra no sistema aparece aqui sozinho. Para distribuir tarefas a quem ainda não entrou, adicione a pessoa.</p></div>' +
      '<div class="panel-actions"><button type="button" class="btn btn-primary btn-sm" data-acao="membro">Adicionar pessoa</button></div></div>' +
      '<div class="table-wrap"><table class="ledger"><thead><tr><th>Pessoa</th><th>Setor</th><th>Função</th><th>Situação</th><th class="num">Em aberto</th><th class="col-actions"></th></tr></thead><tbody>' +
      estado.equipe.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); }).map(function (p) {
        var aus = D.ausenciaAtual(p, hoje()), c = carga[p.id];
        return '<tr' + (p.ativo === false ? ' style="opacity:.55"' : "") + '><td><div class="ed-pessoa">' + avatar(p.id, true) + "<div><strong>" + esc(p.nome) + (p.id === eu.id ? ' <span class="muted small">(você)</span>' : "") +
          '</strong><span class="cell-sub">' + esc(p.email || "") + "</span></div></div></td><td>" + (p.setor ? chipSetor(p.setor) : '<span class="muted">—</span>') + "</td><td>" + esc(p.funcao || "—") + "</td><td>" +
          (p.ativo === false ? '<span class="pill inativo">Fora da equipe</span>' : aus ? '<span class="pill st-travado">Ausente até ' + D.dataBr(aus.fim) + "</span>" : '<span class="pill ativo">Disponível</span>') +
          '</td><td class="num">' + (c ? c.abertas : 0) + '</td><td class="row-actions"><button type="button" data-acao="membro" data-id="' + esc(p.id) + '">Editar</button>' +
          '<button type="button" data-acao="ausencia" data-pessoa="' + esc(p.id) + '">Ausência</button></td></tr>';
      }).join("") + "</tbody></table></div>" +
      '<div class="panel-foot" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><span class="muted small">Os dados do Em Dia ficam neste navegador e vão junto no backup do sistema (Master → Baixar backup).</span>' +
      '<button type="button" class="btn btn-danger-ghost btn-sm" data-acao="apagar-tudo">Apagar dados do Em Dia</button></div></section>';
  }

  // ---------------------------------------------------------------- modais

  function abrirModal(html, estreito) {
    var card = $("modal-card");
    card.className = "modal-card ed-modal" + (estreito ? " estreito" : "");
    card.innerHTML = html;
    $("modal").style.display = "flex";
    var foco = card.querySelector("[autofocus], input:not([type=hidden]), select, textarea");
    if (foco) setTimeout(function () { foco.focus(); }, 30);
  }
  function fecharModal() { $("modal").style.display = "none"; $("modal-card").innerHTML = ""; }

  function modalTarefa(clienteId, etapaId) {
    var c = D.porId(estado.clientes, clienteId), e = D.porId(estado.etapas, etapaId);
    if (!c || !e) return;
    var t = D.tarefa(estado, mes, c, e);
    var hist = estado.diario.filter(function (d) { return D.registroDaTarefa(estado, d, mes, clienteId, etapaId); })
      .sort(function (a, b) { return b.criadoEm.localeCompare(a.criadoEm); });
    abrirModal('<h3>' + esc(c.nome) + '</h3><p class="muted">' + esc(e.nome) + " · " + esc(D.NOME_AREA[e.area]) + " · " + esc(D.rotuloMes(mes)) + " " + tagSituacao(t) + "</p>" +
      '<form class="ed-form" data-form="tarefa" data-cliente="' + esc(c.id) + '" data-etapa="' + esc(e.id) + '">' +
      '<div class="linha-3"><div class="field"><label for="t-status">Situação</label><select id="t-status" name="status">' + D.STATUS.map(function (s) { return '<option value="' + s.id + '"' + (s.id === t.status ? " selected" : "") + ">" + s.nome + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="t-resp">Responsável</label><select id="t-resp" name="responsavel">' + opcoes(pessoasOpcoes(), t.responsavel, "Sem responsável") + "</select></div>" +
      '<div class="field"><label for="t-prazo">Prazo</label><input id="t-prazo" name="prazo" type="date" value="' + esc(t.prazo) + '"></div></div>' +
      '<div class="field"><label for="t-nota">Observação da tarefa</label><textarea id="t-nota" name="nota" placeholder="Ex.: aguardando extrato da Caixa">' + esc(t.nota) + "</textarea></div>" +
      '<div class="ed-subtitulo">Histórico deste mês</div>' +
      (hist.length ? '<ul class="ed-historico">' + hist.map(function (d) {
        return "<li><strong>" + esc(nomePessoa(d.autor)) + "</strong> · " + D.dataBr(d.data) + " " + esc(d.hora) + (d.status ? " · " + pillStatus(d.status) : "") + "<br>" + esc(d.feito) +
          (d.ondeParei ? '<div class="ed-parei" style="margin-top:4px"><b>Onde parei:</b> ' + esc(d.ondeParei) + "</div>" : "") + "</li>";
      }).join("") + "</ul>" : '<p class="muted small" style="margin:0">Nenhuma atividade registrada ainda.</p>') +
      (t.atualizadoEm ? '<p class="muted small" style="margin:0">Última alteração: ' + esc(nomePessoa(t.atualizadoPor)) + ", " + esc(quandoCurto(t.atualizadoEm)) + "</p>" : "") +
      '<div class="modal-actions"><button type="button" class="btn btn-soft" data-acao="registrar" data-cliente="' + esc(c.id) + '" data-etapa="' + esc(e.id) + '">Registrar atividade</button>' +
      '<span style="flex:1"></span><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div></form>');
  }

  function modalRegistrar(clienteId, etapaId, setor) {
    abrirModal("<h3>Registrar atividade</h3>" + formRegistro({ clienteId: clienteId, etapaId: etapaId, setor: setor, modal: true }));
  }

  function modalCliente(id) {
    var c = id ? D.porId(estado.clientes, id) : null;
    var rs = (c && c.responsaveis) || {};
    var pessoas = pessoasOpcoes();
    var personalizadas = !!(c && Array.isArray(c.etapas) && c.etapas.length);
    var escolhidas = personalizadas ? c.etapas : (c ? D.etapasDoCliente(estado, c).map(function (e) { return e.id; }) : []);
    abrirModal("<h3>" + (c ? "Editar cliente" : "Novo cliente") + "</h3>" +
      '<form class="ed-form" data-form="cliente" data-id="' + esc(id || "") + '">' +
      '<div class="field"><label for="c-nome">Nome (razão social)</label><input id="c-nome" name="nome" required value="' + esc(c ? c.nome : "") + '"></div>' +
      '<div class="linha"><div class="field"><label for="c-cnpj">CNPJ / CPF</label><input id="c-cnpj" name="cnpj" value="' + esc(c ? c.cnpj : "") + '"></div>' +
      '<div class="field"><label for="c-regime">Regime tributário</label><select id="c-regime" name="regime" data-acao-change="regime">' + opcoes(D.REGIMES.map(function (r) { return { id: r, nome: r }; }), c ? c.regime : "Simples Nacional") + "</select></div></div>" +
      '<div class="linha-3"><div class="field"><label for="c-contabil">Responsável contábil</label><select id="c-contabil" name="contabil">' + opcoes(pessoas, rs.contabil, "—") + "</select></div>" +
      '<div class="field"><label for="c-fiscal">Responsável fiscal</label><select id="c-fiscal" name="fiscal">' + opcoes(pessoas, rs.fiscal, "—") + "</select></div>" +
      '<div class="field"><label for="c-pessoal">Responsável pessoal (DP)</label><select id="c-pessoal" name="pessoal">' + opcoes(pessoas, rs.pessoal, "—") + "</select></div></div>" +
      '<label class="ed-check"><input type="checkbox" name="personalizar" data-acao-change="personalizar"' + (personalizadas ? " checked" : "") + "> Escolher as etapas deste cliente (senão, valem as do regime)</label>" +
      '<div class="ed-etapas-escolha" id="c-etapas" aria-disabled="' + (personalizadas ? "false" : "true") + '">' + D.etapasAtivas(estado).map(function (e) {
        return '<label class="ed-check"><input type="checkbox" name="etapa" value="' + esc(e.id) + '"' + (escolhidas.indexOf(e.id) > -1 || (!c && regimeAceita(e, "Simples Nacional")) ? " checked" : "") + "> " + esc(e.nome) + "</label>";
      }).join("") + "</div>" +
      '<div class="linha"><div class="field"><label for="c-contato">Contato</label><input id="c-contato" name="contato" placeholder="Nome, telefone ou e-mail" value="' + esc(c ? c.contato : "") + '"></div>' +
      '<div class="field"><label for="c-situacao">Situação</label><select id="c-situacao" name="ativo"><option value="1">Ativo</option><option value="0"' + (c && c.ativo === false ? " selected" : "") + ">Desativado (não aparece no fechamento)</option></select></div></div>" +
      '<div class="field"><label for="c-obs">Observações</label><textarea id="c-obs" name="obs">' + esc(c ? c.obs : "") + "</textarea></div>" +
      '<p class="error-msg" data-erro></p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="submit" class="btn btn-primary">' + (c ? "Salvar" : "Cadastrar") + "</button></div></form>");
  }
  function regimeAceita(e, regime) { return !e.regimes || !e.regimes.length || e.regimes.indexOf(regime) > -1; }

  function modalEtapa(id) {
    var e = id ? D.porId(estado.etapas, id) : null;
    abrirModal("<h3>" + (e ? "Editar etapa" : "Nova etapa") + "</h3>" +
      '<form class="ed-form" data-form="etapa" data-id="' + esc(id || "") + '">' +
      '<div class="field"><label for="e-nome">Nome</label><input id="e-nome" name="nome" required value="' + esc(e ? e.nome : "") + '"></div>' +
      '<div class="linha-3"><div class="field"><label for="e-curto">Nome curto (quadro)</label><input id="e-curto" name="curto" maxlength="10" value="' + esc(e ? e.curto : "") + '"></div>' +
      '<div class="field"><label for="e-area">Área</label><select id="e-area" name="area">' + opcoes(D.AREAS, e ? e.area : "contabil") + "</select></div>" +
      '<div class="field"><label for="e-prazo">Prazo: dia do mês seguinte</label><input id="e-prazo" name="prazoDia" type="number" min="1" max="31" required value="' + esc(e ? e.prazoDia : 10) + '"></div></div>' +
      '<div class="ed-subtitulo">Vale para (nenhum marcado = todos)</div><div class="ed-etapas-escolha">' + D.REGIMES.map(function (r) {
        return '<label class="ed-check"><input type="checkbox" name="regime" value="' + esc(r) + '"' + (e && e.regimes && e.regimes.indexOf(r) > -1 ? " checked" : "") + "> " + esc(r) + "</label>";
      }).join("") + "</div>" +
      '<label class="ed-check"><input type="checkbox" name="ativa"' + (!e || e.ativa !== false ? " checked" : "") + "> Etapa ativa</label>" +
      '<p class="error-msg" data-erro></p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div></form>', true);
  }

  function modalMembro(id) {
    var p = id ? D.porId(estado.equipe, id) : null;
    abrirModal("<h3>" + (p ? "Editar pessoa" : "Adicionar pessoa") + "</h3>" +
      '<form class="ed-form" data-form="membro" data-id="' + esc(id || "") + '">' +
      '<div class="field"><label for="m-nome">Nome</label><input id="m-nome" name="nome" required value="' + esc(p ? p.nome : "") + '"' + (p && p.id.indexOf("m") !== 0 && p.id.indexOf("exemplo") !== 0 ? " readonly" : "") + "></div>" +
      '<div class="field"><label for="m-email">E-mail</label><input id="m-email" name="email" type="email" value="' + esc(p ? p.email : "") + '"></div>' +
      '<div class="linha"><div class="field"><label for="m-setor">Setor (diário)</label><select id="m-setor" name="setor">' + opcoes(D.SETORES, p ? p.setor : "", "Nenhum (gestão / geral)") + "</select></div>" +
      '<div class="field"><label for="m-funcao">Função</label><input id="m-funcao" name="funcao" placeholder="Ex.: Analista fiscal, Gerente" value="' + esc(p ? p.funcao : "") + '"></div></div>' +
      (p ? '<label class="ed-check"><input type="checkbox" name="ativo"' + (p.ativo !== false ? " checked" : "") + "> Faz parte da equipe</label>" : "") +
      '<p class="ed-dica">O nome de quem já entrou no sistema vem do login.</p>' +
      '<p class="error-msg" data-erro></p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div></form>', true);
  }

  function modalAusencia(pessoaId) {
    var p = D.porId(estado.equipe, pessoaId);
    if (!p) return;
    var lista = (p.ausencias || []).slice().sort(function (a, b) { return b.inicio.localeCompare(a.inicio); });
    abrirModal("<h3>Ausência · " + esc(p.nome) + "</h3>" +
      '<form class="ed-form" data-form="ausencia" data-pessoa="' + esc(p.id) + '">' +
      '<div class="field"><label for="a-motivo">Motivo</label><select id="a-motivo" name="motivo"><option>Atestado médico</option><option>Férias</option><option>Licença</option><option>Folga</option><option>Outro</option></select></div>' +
      '<div class="linha"><div class="field"><label for="a-inicio">De</label><input id="a-inicio" name="inicio" type="date" required value="' + hoje() + '"></div>' +
      '<div class="field"><label for="a-fim">Até</label><input id="a-fim" name="fim" type="date" required value="' + hoje() + '"></div></div>' +
      (lista.length ? '<div class="ed-subtitulo">Ausências registradas</div><ul class="ed-historico">' + lista.map(function (a) {
        return "<li>" + esc(a.motivo) + " · " + D.dataBr(a.inicio) + " a " + D.dataBr(a.fim) + ' <button type="button" class="link-btn" data-acao="remover-ausencia" data-pessoa="' + esc(p.id) + '" data-ausencia="' + esc(a.id) + '">remover</button></li>';
      }).join("") + "</ul>" : "") +
      '<p class="error-msg" data-erro></p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-fechar>Fechar</button><button type="submit" class="btn btn-primary">Registrar ausência</button></div></form>', true);
  }

  // ---------------------------------------------------------------- formulários

  function erroForm(form, msg) { var e = form.querySelector("[data-erro]"); if (e) { e.textContent = msg; e.style.display = msg ? "block" : "none"; } }
  function val(form, nome) { var el = form.elements[nome]; return el ? String(el.value || "").trim() : ""; }

  function enviar(form) {
    var tipo = form.dataset.form;
    try {
      if (tipo === "registro") {
        var setorEl = form.querySelector("input[name=setor]:checked");
        if (!setorEl) throw new Error("Escolha o setor: Contábil, Fiscal ou Pessoal.");
        D.registrarDiario(estado, { autor: eu.id, setor: setorEl.value, mes: mes, clienteId: val(form, "clienteId"), etapaId: val(form, "etapaId"), feito: val(form, "feito"),
          ondeParei: val(form, "ondeParei"), status: val(form, "status"), minutos: val(form, "minutos") });
        salvar(); fecharModal(); toast("Registrado no diário " + nomeSetor(setorEl.value) + "."); render(); return;
      }
      if (tipo === "tarefa") {
        D.atualizarTarefa(estado, mes, form.dataset.cliente, form.dataset.etapa,
          { status: val(form, "status"), responsavel: val(form, "responsavel"), prazo: val(form, "prazo"), nota: val(form, "nota") }, eu.id);
        salvar(); fecharModal(); toast("Tarefa atualizada."); render(); return;
      }
      if (tipo === "cliente") {
        var nome = val(form, "nome");
        if (!nome) throw new Error("Informe o nome do cliente.");
        var c = form.dataset.id ? D.porId(estado.clientes, form.dataset.id) : null;
        var repetido = estado.clientes.some(function (x) { return x !== c && x.nome.toLowerCase() === nome.toLowerCase(); });
        if (repetido) throw new Error("Já existe um cliente com esse nome.");
        if (!c) { c = { id: D.uid("c"), criadoEm: new Date().toISOString() }; estado.clientes.push(c); }
        c.nome = nome; c.cnpj = val(form, "cnpj"); c.regime = val(form, "regime");
        c.responsaveis = { contabil: val(form, "contabil"), fiscal: val(form, "fiscal"), pessoal: val(form, "pessoal") };
        c.etapas = form.elements.personalizar.checked
          ? Array.prototype.map.call(form.querySelectorAll("input[name=etapa]:checked"), function (i) { return i.value; }) : null;
        c.contato = val(form, "contato"); c.obs = val(form, "obs"); c.ativo = val(form, "ativo") === "1";
        salvar(); fecharModal(); toast("Cliente salvo."); render(); return;
      }
      if (tipo === "etapa") {
        var en = val(form, "nome"), dia = Number(val(form, "prazoDia"));
        if (!en) throw new Error("Informe o nome da etapa.");
        if (!(dia >= 1 && dia <= 31)) throw new Error("O prazo é um dia entre 1 e 31.");
        var e = form.dataset.id ? D.porId(estado.etapas, form.dataset.id) : null;
        if (!e) { e = { id: D.uid("e") }; estado.etapas.push(e); }
        e.nome = en; e.curto = val(form, "curto") || en.slice(0, 10); e.area = val(form, "area"); e.prazoDia = dia;
        e.regimes = Array.prototype.map.call(form.querySelectorAll("input[name=regime]:checked"), function (i) { return i.value; });
        e.ativa = form.elements.ativa.checked;
        salvar(); fecharModal(); toast("Etapa salva."); render(); return;
      }
      if (tipo === "membro") {
        var mn = val(form, "nome");
        if (!mn) throw new Error("Informe o nome.");
        var p = form.dataset.id ? D.porId(estado.equipe, form.dataset.id) : null;
        if (!p) { p = { id: D.uid("m"), perfil: "usuario", ativo: true, ausencias: [] }; estado.equipe.push(p); }
        p.nome = mn; p.email = val(form, "email"); p.funcao = val(form, "funcao"); p.setor = val(form, "setor");
        if (form.elements.ativo) p.ativo = form.elements.ativo.checked;
        salvar(); fecharModal(); toast("Equipe atualizada."); render(); return;
      }
      if (tipo === "ausencia") {
        var pa = D.porId(estado.equipe, form.dataset.pessoa), ini = val(form, "inicio"), fim = val(form, "fim");
        if (!ini || !fim || fim < ini) throw new Error("Confira as datas: o fim não pode ser antes do início.");
        pa.ausencias = pa.ausencias || [];
        pa.ausencias.push({ id: D.uid("a"), inicio: ini, fim: fim, motivo: val(form, "motivo") });
        salvar(); fecharModal(); toast("Ausência registrada. Use a Passagem de bastão para redistribuir as tarefas."); render(); return;
      }
    } catch (err) { erroForm(form, err.message); }
  }

  // ---------------------------------------------------------------- eventos

  document.addEventListener("submit", function (ev) {
    var form = ev.target.closest("form[data-form]");
    if (!form) return;
    ev.preventDefault();
    enviar(form);
  });

  document.addEventListener("click", function (ev) {
    if (ev.target.closest("[data-fechar]") || ev.target.id === "modal") { fecharModal(); return; }
    var abaBtn = ev.target.closest("[data-aba]");
    if (abaBtn) { aba = abaBtn.dataset.aba; try { localStorage.setItem(CHAVE_ABA, aba); } catch (e) {} render(); window.scrollTo(0, 0); return; }
    var el = ev.target.closest("[data-acao]");
    if (!el || el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type !== "checkbox" && el.type !== "button")) return;
    var a = el.dataset.acao;
    if (a === "mes-anterior" || a === "mes-seguinte") {
      mes = D.somarMes(mes, a === "mes-anterior" ? -1 : 1);
      try { localStorage.setItem(CHAVE_MES, mes); } catch (e) {}
      render(); return;
    }
    if (a === "tarefa") { modalTarefa(el.dataset.cliente, el.dataset.etapa); return; }
    if (a === "registrar") { modalRegistrar(el.dataset.cliente || "", el.dataset.etapa || "", el.dataset.setor || ""); return; }
    if (a === "diario-setor") { filtros.diario.setor = el.dataset.setor; render(); return; }
    if (a === "abrir-diario") { filtros.diario.setor = el.dataset.setor; aba = "diario"; try { localStorage.setItem(CHAVE_ABA, aba); } catch (e) {} render(); window.scrollTo(0, 0); return; }
    if (a === "modo") { filtros.modo = el.dataset.modo; render(); return; }
    if (a === "cliente") { modalCliente(el.dataset.id); return; }
    if (a === "etapa") { modalEtapa(el.dataset.id); return; }
    if (a === "membro") { modalMembro(el.dataset.id); return; }
    if (a === "ausencia") { modalAusencia(el.dataset.pessoa); return; }
    if (a === "csv") {
      var blob = new Blob([D.csvDiario(estado, D.filtrarDiario(estado, filtros.diario))], { type: "text/csv;charset=utf-8" });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob); link.download = "diario-" + (D.ehSetor(filtros.diario.setor) ? filtros.diario.setor + "-" : "") + hoje() + ".csv";
      document.body.appendChild(link); link.click(); link.remove();
      return;
    }
    if (a === "imprimir") { window.print(); return; }
    if (a === "marcar-todas") {
      Array.prototype.forEach.call(document.querySelectorAll("input[data-bastao]"), function (c) { c.checked = el.checked; });
      return;
    }
    if (a === "passar") {
      var para = $("b-para").value;
      var itens = Array.prototype.map.call(document.querySelectorAll("input[data-bastao]:checked"), function (c) {
        var p = c.value.split("|"); return { clienteId: p[0], etapaId: p[1] };
      });
      if (!itens.length) { alert("Marque as tarefas que vão passar para outra pessoa."); return; }
      try {
        D.passarBastao(estado, mes, filtros.bastaoPessoa, para, itens, eu.id);
        salvar(); toast(itens.length + " tarefa(s) passada(s) para " + nomePessoa(para) + "."); render();
      } catch (err) { alert(err.message); }
      return;
    }
    if (a === "fim-ausencia" || a === "remover-ausencia") {
      var pe = D.porId(estado.equipe, el.dataset.pessoa);
      if (!pe) return;
      if (a === "fim-ausencia") {
        var au = D.porId(pe.ausencias || [], el.dataset.ausencia);
        if (au) au.fim = D.somarMes(hoje().slice(0, 7), 0) + hoje().slice(7) > au.inicio ? new Date(Date.now() - 86400000).toISOString().slice(0, 10) : au.inicio;
        if (au && au.fim < au.inicio) au.fim = au.inicio;
      } else {
        pe.ausencias = (pe.ausencias || []).filter(function (x) { return x.id !== el.dataset.ausencia; });
        fecharModal();
      }
      salvar(); render(); return;
    }
    if (a === "subir" || a === "descer") {
      var i = Number(el.dataset.i), j = a === "subir" ? i - 1 : i + 1;
      var tmp = estado.etapas[i]; estado.etapas[i] = estado.etapas[j]; estado.etapas[j] = tmp;
      salvar(); render(); return;
    }
    if (a === "etapas-padrao") {
      if (!confirm("Voltar às etapas padrão? As etapas que você criou ou mudou serão substituídas (o que já foi marcado nas tarefas continua guardado).")) return;
      estado.etapas = D.etapasPadrao(); salvar(); render(); return;
    }
    if (a === "exemplo") {
      var r = D.exemplo(estado, eu, hoje());
      mes = r.mes; try { localStorage.setItem(CHAVE_MES, mes); } catch (e) {}
      salvar(); toast("Dados de exemplo carregados (" + r.clientes + " clientes fictícios)."); render(); return;
    }
    if (a === "apagar-tudo") {
      if (!confirm("Apagar TODOS os dados do Em Dia neste navegador (clientes, etapas, equipe, diário)? Não dá para desfazer.\n\nDica: baixe antes um backup no Master.")) return;
      estado = D.estadoVazio(); D.registrarMembro(estado, eu); salvar(); toast("Dados do Em Dia apagados."); render(); return;
    }
  });

  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (el.dataset.filtro) {
      filtros[el.dataset.filtro] = el.type === "checkbox" ? el.checked : el.value;
      if (el.type !== "search") render();
      return;
    }
    if (el.dataset.filtroDiario) { filtros.diario[el.dataset.filtroDiario] = el.value; if (el.type !== "search") render(); return; }
    if (el.dataset.acaoChange === "bastao-pessoa") { filtros.bastaoPessoa = el.value; render(); return; }
    if (el.dataset.acaoChange === "meu-setor") {
      var eu2 = D.porId(estado.equipe, eu.id);
      if (eu2 && el.value) { eu2.setor = el.value; filtros.diario.setor = null; salvar(); toast("Seu setor: " + nomeSetor(el.value) + "."); render(); }
      return;
    }
    if (el.name === "setor" && el.type === "radio") { marcarSetor(el.form, el.value); return; }
    if (el.id === "r-etapa") {   // etapa de outro setor (ex.: ICMS) leva o registro para o diário dela
      var et = D.porId(estado.etapas, el.value);
      if (et && D.ehSetor(et.area)) marcarSetor(el.form, et.area);
      return;
    }
    if (el.dataset.acaoChange === "personalizar") {
      $("c-etapas").setAttribute("aria-disabled", el.checked ? "false" : "true");
      return;
    }
    if (el.dataset.acaoChange === "regime") {
      var form = el.form;
      if (!form.elements.personalizar.checked) {
        Array.prototype.forEach.call(form.querySelectorAll("input[name=etapa]"), function (i) {
          i.checked = regimeAceita(D.porId(estado.etapas, i.value), el.value);
        });
      }
      return;
    }
    if (el.id === "r-cliente") {   // trocou o cliente no registro: atualiza as etapas
      var c = D.porId(estado.clientes, el.value), sel = el.form.elements.etapaId;
      sel.innerHTML = opcoes(c ? D.etapasDoCliente(estado, c) : [], "", "Outra atividade / geral");
    }
  });

  function marcarSetor(form, setor) {
    Array.prototype.forEach.call(form.querySelectorAll("input[name=setor]"), function (i) {
      i.checked = i.value === setor;
      i.parentNode.classList.toggle("ativo", i.checked);
    });
  }

  // busca enquanto digita (sem perder o foco)
  var atraso = null;
  document.addEventListener("input", function (ev) {
    var el = ev.target;
    if (el.type !== "search" || !(el.dataset.filtro || el.dataset.filtroDiario)) return;
    clearTimeout(atraso);
    atraso = setTimeout(function () {
      if (el.dataset.filtro) filtros[el.dataset.filtro] = el.value; else filtros.diario[el.dataset.filtroDiario] = el.value;
      var id = el.id, pos = el.selectionStart;
      render();
      var novo = $(id); if (novo) { novo.focus(); try { novo.setSelectionRange(pos, pos); } catch (e) {} }
    }, 200);
  });

  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && $("modal").style.display === "flex") fecharModal(); });

  // ---------------------------------------------------------------- início

  if (!eu) {
    document.querySelector(".ed").innerHTML = '<div class="panel" style="margin-top:40px"><div class="ed-vazio"><strong>Abra o Em Dia pelo sistema</strong>Entre na Gestão Financeira e escolha <b>Em Dia</b> no menu Módulos.</div></div>';
    return;
  }
  D.registrarMembro(estado, eu);
  salvar();
  render();
})();
