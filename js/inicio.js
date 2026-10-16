/*
 * inicio.js — tela Início: o que precisa de atenção em todos os módulos, num lugar só.
 *
 * A tela não guarda nada dela: só lê o que cada módulo já grava no navegador
 *   Em Dia               "emDia:v1"               tarefas do fechamento, equipe, ausências, passagem de bastão
 *   ISS Tubarão          "iss:v1"                 empresas importadas e ainda não conferidas
 *   Controle de horas    "horas:v1"               folhas de presença que faltam ou não foram revisadas
 *   Painel de vencimentos "painelVencimentos:v1"  documentos vencidos ou vencendo
 *   Conciliação/Master   lançamentos do mês        contas bancárias sem extrato na competência
 * e usa as regras dos próprios módulos (EmDiaDados, IssDados, HorasDados) para não calcular diferente deles.
 *
 * resumir() e html() não mexem na página nem no navegador: são testadas em tests/inicio.test.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../modulos/em-dia/js/dados.js"), require("../modulos/iss-tubarao/js/dados.js"), require("../modulos/controle-horas/js/dados.js"));
  } else root.Inicio = factory(root.EmDiaDados, root.IssDados, root.HorasDados);
})(typeof self !== "undefined" ? self : this, function (ED, ISS, HR) {
  "use strict";

  var CHAVES = { emDia: "emDia:v1", emDiaMes: "emDia:mes", iss: "iss:v1", issMes: "iss:mes", horas: "horas:v1", horasMes: "horas:mes", venc: "painelVencimentos:v1" };
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  var PESO = { alta: 0, media: 1, baixa: 2, info: 3 };

  // ---------------------------------------------------------------- utilidades

  function dd(n) { return String(n).padStart(2, "0"); }
  function hojeIso(d) { d = d || new Date(); return d.getFullYear() + "-" + dd(d.getMonth() + 1) + "-" + dd(d.getDate()); }
  function mesDe(iso) { return String(iso || "").slice(0, 7); }
  function somarMes(mes, n) { var y = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7)) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + "-" + dd(m + 1); }
  function nomeMes(mes) { return mes ? MESES[Number(mes.slice(5, 7)) - 1] : ""; }
  function rotuloMes(mes) { return mes ? nomeMes(mes) + "/" + mes.slice(0, 4) : ""; }
  function dataCurta(iso) { return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : ""; }
  function diasEntre(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }
  function plural(n, um, varios) { return n + " " + (n === 1 ? um : varios); }
  function normalizarTexto(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function lista(nomes, max) {
    max = max || 3;
    return nomes.length <= max ? nomes.join(", ") : nomes.slice(0, max).join(", ") + " e mais " + (nomes.length - max);
  }
  /** Saudação pela hora do dia. */
  function saudacao(d) { var h = (d || new Date()).getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; }
  function dataPorExtenso(iso) {
    var d = new Date(iso + "T12:00:00Z");
    var s = DIAS[d.getUTCDay()] + ", " + Number(iso.slice(8, 10)) + " de " + nomeMes(iso);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  /** A pessoa responsável pelo documento é a pessoa logada? (o painel guarda o nome em texto livre) */
  function ehMeuNome(texto, usuario) {
    var t = normalizarTexto(texto);
    if (!t || !usuario || !usuario.nome) return false;
    var n = normalizarTexto(usuario.nome);
    return t === n || t === n.split(/\s+/)[0] || (usuario.email && t === normalizarTexto(usuario.email));
  }

  // ---------------------------------------------------------------- leitura de cada módulo

  /** Em Dia: tarefas do fechamento do mês em andamento. */
  function lerEmDia(bruto, mes, ctx, so) {
    var out = { pendencias: [], tarefas: [], resumo: null, mes: mes, temDados: false };
    if (!ED || !bruto) return out;
    var e = ED.normalizar(bruto);
    if (!ED.clientesAtivos(e).length) return out;
    out.temDados = true;
    var hoje = ctx.hoje, eu = ctx.usuario && ctx.usuario.id;
    var res = ED.resumoMes(e, mes, hoje);
    out.resumo = res;
    var tarefas = res.tarefas.filter(ED.aberta);
    out.tarefas = tarefas;
    var nomePessoa = function (id) { var p = ED.porId(e.equipe, id); return p ? p.nome.split(/\s+/)[0] : ""; };
    var abrir = { rotulo: "Abrir", tab: "mod-em-dia", prefs: {} };
    abrir.prefs[CHAVES.emDiaMes] = mes;
    abrir.prefs["emDia:aba"] = "hoje";

    // atrasadas, vencendo hoje e travadas, agrupadas por cliente
    var grupos = {}, ordem = [], proximas = [];
    tarefas.forEach(function (t) {
      if (so.minhas && t.responsavel !== eu) return;
      var sit = ED.situacao(t, hoje);
      var tipo = t.status === "travado" ? "travada" : sit === "atrasada" ? "atrasada" : sit === "hoje" ? "hoje" : sit === "logo" ? "logo" : "";
      if (!tipo) return;
      var k = t.clienteId;
      if (!grupos[k]) { grupos[k] = { cliente: t.cliente, clienteId: t.clienteId, itens: [] }; ordem.push(k); }
      grupos[k].itens.push({ t: t, tipo: tipo });
    });
    ordem.forEach(function (k) {
      var g = grupos[k];
      var atrasadas = g.itens.filter(function (i) { return i.tipo === "atrasada"; });
      var travadas = g.itens.filter(function (i) { return i.tipo === "travada"; });
      var hojeL = g.itens.filter(function (i) { return i.tipo === "hoje"; });
      var logo = g.itens.filter(function (i) { return i.tipo === "logo"; });
      var nomes = function (l) { return l.map(function (i) { return i.t.etapa; }); };
      var quem = function (l) {
        var ids = {}; l.forEach(function (i) { if (i.t.responsavel) ids[i.t.responsavel] = 1; });
        var n = Object.keys(ids).map(nomePessoa).filter(Boolean);
        return n.length ? " · " + lista(n, 2) : "";
      };
      var setor = function (l) {
        var vistos = {}, nomes = [];
        l.forEach(function (i) { var n = i.t.area !== "geral" && ED.NOME_AREA[i.t.area]; if (n && !vistos[n]) { vistos[n] = 1; nomes.push(n); } });
        return nomes.join(", ");
      };
      if (atrasadas.length) {
        var maisAntigo = atrasadas.map(function (i) { return i.t.prazo; }).sort()[0];
        out.pendencias.push({ id: "emdia-atr-" + k, origem: "Em Dia", area: "mod-em-dia", nivel: "alta", ordem: maisAntigo,
          titulo: g.cliente + ": " + plural(atrasadas.length, "etapa atrasada", "etapas atrasadas"),
          detalhe: lista(nomes(atrasadas)) + quem(atrasadas) + (setor(atrasadas) ? " · " + setor(atrasadas) : ""),
          selo: "Prazo " + dataCurta(maisAntigo), acao: abrir, icone: "emdia" });
      }
      if (travadas.length) {
        var nota = travadas.map(function (i) { return i.t.nota; }).filter(Boolean)[0];
        out.pendencias.push({ id: "emdia-trav-" + k, origem: "Em Dia", area: "mod-em-dia", nivel: "alta", ordem: travadas[0].t.prazo, prio: 2,
          titulo: g.cliente + ": " + plural(travadas.length, "etapa travada", "etapas travadas"),
          detalhe: lista(nomes(travadas)) + (nota ? " · " + nota : quem(travadas)),
          selo: "Travada", acao: abrir, icone: "emdia" });
      }
      if (hojeL.length) {
        out.pendencias.push({ id: "emdia-hoje-" + k, origem: "Em Dia", area: "mod-em-dia", nivel: "media", ordem: hoje,
          titulo: g.cliente + ": " + plural(hojeL.length, "etapa vence hoje", "etapas vencem hoje"),
          detalhe: lista(nomes(hojeL)) + quem(hojeL) + (setor(hojeL) ? " · " + setor(hojeL) : ""), selo: "Hoje", acao: abrir, icone: "emdia" });
      }
      logo.forEach(function (i) { proximas.push(i.t); });
    });
    // as que vencem nos próximos 3 dias viram uma linha só (são muitas e ainda não estão atrasadas)
    if (proximas.length) {
      var ate = proximas.map(function (t) { return t.prazo; }).sort().pop();
      var clientesL = {}, etapasL = {};
      proximas.forEach(function (t) { clientesL[t.cliente] = 1; etapasL[t.etapa] = 1; });
      out.pendencias.push({ id: "emdia-logo", origem: "Em Dia", area: "mod-em-dia", nivel: "baixa", ordem: ate,
        titulo: plural(proximas.length, "etapa vence", "etapas vencem") + " nos próximos dias",
        detalhe: lista(Object.keys(etapasL), 2) + " · " + plural(Object.keys(clientesL).length, "cliente", "clientes"),
        selo: "Até " + dataCurta(ate), acao: abrir, icone: "emdia" });
    }

    if (!so.minhas) {
      // quem está ausente hoje e ainda tem tarefas abertas no nome
      ED.equipeAtiva(e).forEach(function (p) {
        var aus = ED.ausenciaAtual(p, hoje);
        if (!aus) return;
        var dela = tarefas.filter(function (t) { return t.responsavel === p.id; });
        if (!dela.length) return;
        var a = { rotulo: "Passar tarefas", tab: "mod-em-dia", prefs: {} };
        a.prefs[CHAVES.emDiaMes] = mes; a.prefs["emDia:aba"] = "equipe";
        out.pendencias.push({ id: "emdia-aus-" + p.id, origem: "Em Dia", area: "mod-em-dia", nivel: "media", ordem: hoje,
          titulo: p.nome.split(/\s+/)[0] + " está ausente com " + plural(dela.length, "tarefa aberta", "tarefas abertas"),
          detalhe: (aus.motivo || "Ausência") + (aus.fim ? " até " + dataCurta(aus.fim) : "") + " · faça a passagem de bastão", selo: "Ausente", acao: a, icone: "emdia" });
      });
      var semDono = tarefas.filter(function (t) { return !t.responsavel; });
      if (semDono.length) {
        out.pendencias.push({ id: "emdia-semdono", origem: "Em Dia", area: "mod-em-dia", nivel: "baixa", ordem: "9",
          titulo: plural(semDono.length, "tarefa sem responsável", "tarefas sem responsável"),
          detalhe: "Fechamento de " + rotuloMes(mes) + " · defina o responsável no cadastro do cliente", selo: "Sem dono", acao: abrir, icone: "emdia" });
      }
    }

    // tarefas que outra pessoa passou para mim nos últimos 7 dias
    if (eu && ctx.usuario.nome) {
      var meu = normalizarTexto(ctx.usuario.nome);
      var recebidas = e.diario.filter(function (d) {
        return d.tipo === "bastao" && d.autor !== eu && diasEntre(d.data, hoje) <= 7 && normalizarTexto(d.feito).indexOf(" para " + meu + ":") > -1;
      });
      if (recebidas.length) {
        var qtd = recebidas.reduce(function (s, d) { var m = /:\s(.*)\.$/.exec(d.feito); return s + (m ? m[1].split(", ").length : 1); }, 0);
        var de = /passadas de (.+?) para /i.exec(recebidas[0].feito);
        out.pendencias.push({ id: "emdia-bastao", origem: "Em Dia", area: "mod-em-dia", nivel: "info", ordem: recebidas[0].data, minha: true,
          titulo: "Passagem de bastão: " + plural(qtd, "tarefa veio", "tarefas vieram") + " para você",
          detalhe: (de ? "De " + de[1] + " · " : "") + "confira em Meu dia, no Em Dia", selo: "Novo", acao: { rotulo: "Ver", tab: "mod-em-dia", prefs: abrir.prefs }, icone: "emdia" });
      }
    }
    return out;
  }

  /** ISS Tubarão: empresas importadas no mês e ainda não conferidas. */
  function lerIss(bruto, mesPreferido) {
    var out = { pendencias: [], aConferir: 0, mes: "" };
    if (!ISS || !bruto) return out;
    var e = ISS.normalizar(bruto);
    var meses = ISS.mesesComDados(e);
    if (!meses.length) return out;
    var mes = mesPreferido && meses.indexOf(mesPreferido) > -1 ? mesPreferido : meses[0];
    var r = ISS.resumoMes(e, mes);
    var pend = r.linhas.filter(function (l) { return !l.registro.conferida; });
    out.mes = mes; out.aConferir = pend.length;
    if (!pend.length) return out;
    var alerta = pend.filter(function (l) { return l.t.alertas || l.avisos; }).length;
    var prefs = {}; prefs[CHAVES.issMes] = mes;
    out.pendencias.push({ id: "iss-" + mes, origem: "ISS", area: "mod-iss", nivel: alerta ? "media" : "baixa", ordem: mes,
      titulo: plural(pend.length, "empresa de ISS a conferir", "empresas de ISS a conferir"),
      detalhe: lista(pend.map(function (l) { return l.empresa.nome; }), 2) + (alerta ? " · " + alerta + " com alerta" : "") + " · " + rotuloMes(mes),
      selo: alerta ? "Com alerta" : "Conferir", acao: { rotulo: "Conferir", tab: "mod-iss", prefs: prefs }, icone: "iss" });
    return out;
  }

  /** Controle de horas: folhas de presença que faltam chegar ou revisar, nos meses ainda abertos. */
  function lerHoras(bruto, mes) {
    var out = { pendencias: [], aRevisar: 0, faltam: 0, mes: mes };
    if (!HR || !bruto) return out;
    var e = HR.normalizar(bruto);
    e.empresas.forEach(function (emp) {
      if (!HR.ativos(emp).length) return;
      var m = e.meses[emp.id] && e.meses[emp.id][mes];
      if (m && m.status === "fechado") return;
      var r = HR.resumoMes(e, emp.id, mes), g = r.geral;
      var faltam = g.funcionarios - g.comFolha, revisar = g.comFolha - g.revisadas;
      if (!faltam && !revisar) return;
      out.faltam += faltam; out.aRevisar += revisar;
      var prefs = {}; prefs["horas:empresa"] = emp.id; prefs[CHAVES.horasMes] = mes;
      var partes = [];
      if (revisar) partes.push(plural(revisar, "a revisar", "a revisar"));
      if (faltam) partes.push(plural(faltam, "não chegou", "não chegaram"));
      if (g.alertas) partes.push(plural(g.alertas, "alerta", "alertas"));
      out.pendencias.push({ id: "horas-" + emp.id, origem: "Controle de horas", area: "mod-horas", nivel: revisar ? "media" : "baixa", ordem: mes,
        titulo: emp.nome + ": " + plural(revisar + faltam, "folha de presença", "folhas de presença"),
        detalhe: partes.join(" · ") + " · " + rotuloMes(mes), selo: revisar ? "Revisar" : "Aguardando",
        acao: { rotulo: revisar ? "Revisar" : "Abrir", tab: "mod-horas", prefs: prefs }, icone: "horas" });
    });
    return out;
  }

  /** Painel de vencimentos: documentos vencidos ou vencendo. */
  function lerVencimentos(bruto, ctx, so) {
    var out = { pendencias: [], proximos: [], vencidos: 0, em7: 0 };
    if (!bruto || !Array.isArray(bruto.documentos)) return out;
    var clientes = {};
    (bruto.clientes || []).forEach(function (c) { if (c && c.id) clientes[c.id] = c.nome; });
    var docs = bruto.documentos.filter(function (d) { return d && clientes[d.clienteId] && /^\d{4}-\d{2}-\d{2}$/.test(d.vencimento || ""); })
      .map(function (d) {
        return { id: d.id, tipo: d.tipo, cliente: clientes[d.clienteId], vencimento: d.vencimento, dias: diasEntre(ctx.hoje, d.vencimento),
          andamento: d.andamento || "pendente", responsavel: d.responsavel || "" };
      }).sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0; });
    var ANDAMENTO = { renovacao: "em renovação", aguardando: "aguardando o cliente" };
    docs.forEach(function (d) {
      if (d.dias < 0) out.vencidos++;
      if (d.dias <= 7) out.em7++;
      if (d.dias > 7) return;
      if (so.minhas && !ehMeuNome(d.responsavel, ctx.usuario)) return;
      var selo = d.dias < -1 ? "Venceu há " + (-d.dias) + " dias" : d.dias === -1 ? "Venceu ontem" : d.dias === 0 ? "Vence hoje" : d.dias === 1 ? "Vence amanhã" : "Em " + d.dias + " dias";
      out.pendencias.push({ id: "venc-" + d.id, origem: "Vencimentos", area: "mod-vencimentos", nivel: d.dias < 0 ? "alta" : d.dias <= 2 ? "media" : "baixa", ordem: d.vencimento, prio: 1,
        titulo: d.tipo + (d.dias < 0 ? " vencido" : " vencendo"),
        detalhe: d.cliente + (ANDAMENTO[d.andamento] ? " · " + ANDAMENTO[d.andamento] : "") + (d.responsavel ? " · " + d.responsavel : ""),
        selo: selo, acao: { rotulo: d.andamento === "pendente" ? "Renovar" : "Ver", tab: "mod-vencimentos", prefs: {} }, icone: "venc" });
    });
    out.proximos = docs.filter(function (d) { return d.dias <= 30; }).slice(0, 6);
    return out;
  }

  /** Contas bancárias sem nenhum lançamento na competência (extrato ainda não importado). */
  function lerContas(contas, competencia) {
    var out = { pendencias: [], semExtrato: 0 };
    var sem = (contas || []).filter(function (c) { return !c.lancamentos; });
    out.semExtrato = sem.length;
    if (!sem.length) return out;
    out.pendencias.push({ id: "contas-" + competencia, origem: "Contábil", area: "integracao", nivel: "baixa", ordem: competencia,
      titulo: plural(sem.length, "conta sem extrato", "contas sem extrato") + " em " + rotuloMes(competencia),
      detalhe: lista(sem.map(function (c) { return c.nome; }), 3), selo: "Importar",
      acao: { rotulo: "Importar extrato", acaoApp: "extratos" }, icone: "banco" });
    return out;
  }

  // ---------------------------------------------------------------- resumo da tela

  /**
   * fontes: { emDia, emDiaMes, iss, issMes, horas, horasMes, venc, contas:[{id, nome, lancamentos}] }  (dados crus do navegador)
   * ctx:    { hoje:"AAAA-MM-DD", usuario:{id, nome, email}, competencia:"AAAA-MM", pode:function(area) }
   * so:     { minhas:true } mostra só o que é da pessoa (tarefas dela no Em Dia e documentos com o nome dela)
   */
  function resumir(fontes, ctx, so) {
    fontes = fontes || {}; so = so || {};
    var pode = ctx.pode || function () { return true; };
    var mesPadrao = somarMes(mesDe(ctx.hoje), -1);   // o fechamento em andamento é o do mês anterior
    var emDia = pode("mod-em-dia") ? lerEmDia(fontes.emDia, fontes.emDiaMes || mesPadrao, ctx, so) : lerEmDia(null);
    // ISS, folhas e extratos não têm responsável: entram nos números sempre, na lista só em "Todas"
    var iss = pode("mod-iss") ? lerIss(fontes.iss, fontes.issMes) : lerIss(null);
    var horas = pode("mod-horas") ? lerHoras(fontes.horas, fontes.horasMes || mesPadrao) : lerHoras(null, "");
    var venc = pode("mod-vencimentos") ? lerVencimentos(fontes.venc, ctx, so) : lerVencimentos(null, ctx, so);
    var contas = pode("integracao") ? lerContas(fontes.contas, ctx.competencia || mesDe(ctx.hoje)) : lerContas([], "");

    var semDono = so.minhas ? [] : [].concat(iss.pendencias, horas.pendencias, contas.pendencias);
    var pendencias = [].concat(emDia.pendencias, venc.pendencias, semDono)
      .sort(function (a, b) {
        return (PESO[a.nivel] - PESO[b.nivel]) || ((a.prio || 5) - (b.prio || 5)) || (a.ordem < b.ordem ? -1 : a.ordem > b.ordem ? 1 : 0);
      });

    // números do topo (sempre de todos, mesmo no filtro "Minhas")
    var todasTarefas = emDia.resumo ? emDia.resumo.tarefas.filter(ED.aberta) : [];
    var atrasadas = todasTarefas.filter(function (t) { return ED.situacao(t, ctx.hoje) === "atrasada"; }).length;
    var venceHoje = todasTarefas.filter(function (t) { return ED.situacao(t, ctx.hoje) === "hoje"; }).length;
    var geral = emDia.resumo ? emDia.resumo.geral : null;
    var conferir = [];
    if (iss.aConferir) conferir.push(plural(iss.aConferir, "ISS", "ISS"));
    if (horas.aRevisar + horas.faltam) conferir.push(plural(horas.aRevisar + horas.faltam, "folha", "folhas"));
    if (contas.semExtrato) conferir.push(plural(contas.semExtrato, "extrato", "extratos"));

    var numeros = [
      { id: "hoje", rotulo: "Para fazer hoje", valor: String(atrasadas + venceHoje + venc.vencidos),
        sub: atrasadas + venc.vencidos ? plural(atrasadas + venc.vencidos, "atrasada", "atrasadas") : "Nada atrasado", tom: atrasadas + venc.vencidos ? "alerta" : "" },
      { id: "fechamento", rotulo: "Fechamento de " + nomeMes(emDia.mes || mesPadrao), valor: geral && geral.total ? geral.pct + "%" : "—",
        sub: geral && geral.total ? geral.feitas + " de " + geral.total + " etapas feitas" : "Cadastre os clientes no Em Dia", tom: "marca", pct: geral && geral.total ? geral.pct : 0 },
      { id: "conferir", rotulo: "A conferir", valor: String(iss.aConferir + horas.aRevisar + horas.faltam + contas.semExtrato),
        sub: conferir.length ? conferir.join(", ") : "Tudo conferido", tom: "" },
      { id: "vencer", rotulo: "Vence em 7 dias", valor: String(venc.em7),
        sub: venc.vencidos ? plural(venc.vencidos, "já vencido", "já vencidos") : "Nenhum vencido", tom: venc.vencidos ? "perigo" : "" }
    ];

    var setores = emDia.resumo ? emDia.resumo.porArea.filter(function (a) { return a.area.id !== "geral"; }).map(function (a) {
      return { id: a.area.id, nome: a.area.nome, pct: a.pct, feitas: a.feitas, total: a.total, atrasadas: a.atrasadas };
    }) : [];

    return {
      hoje: ctx.hoje, saudacao: saudacao(ctx.agora), data: dataPorExtenso(ctx.hoje),
      nome: ctx.usuario && ctx.usuario.nome ? String(ctx.usuario.nome).split(/\s+/)[0] : "",
      numeros: numeros, pendencias: pendencias, setores: setores, mesFechamento: emDia.mes || mesPadrao,
      vencimentos: venc.proximos, temEmDia: emDia.temDados,
      vazio: !emDia.temDados && !iss.mes && !(fontes.horas && fontes.horas.empresas && fontes.horas.empresas.length) &&
        !(fontes.venc && fontes.venc.documentos && fontes.venc.documentos.length) && !(fontes.contas && fontes.contas.length)
    };
  }

  // ---------------------------------------------------------------- HTML

  var ICONES = {
    emdia: '<path d="M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M9 13l2 2 4-4"/>',
    iss: '<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>',
    horas: '<path d="M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/>',
    venc: '<path d="M7 3v3M17 3v3M4 8h16M5 5h14v15H5zM12 12v3l2 1"/>',
    banco: '<path d="M3 10l9-6 9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18"/>',
    seta: '<path d="M9 6l6 6-6 6"/>',
    ok: '<path d="M5 12l5 5 9-10"/>'
  };
  function ico(nome, cls) { return '<svg class="ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONES[nome] + "</svg>"; }

  function atributosAcao(a) {
    if (!a) return "";
    if (a.acaoApp) return ' data-acao-app="' + esc(a.acaoApp) + '"';
    return ' data-ir="' + esc(a.tab) + '"' + (a.prefs && Object.keys(a.prefs).length ? " data-prefs='" + esc(JSON.stringify(a.prefs)) + "'" : "");
  }

  /** Lista "O que precisa de você" (o filtro Todas/Minhas troca só esta parte). */
  function htmlPendencias(r, so) {
    if (!r.pendencias.length) {
      return '<div class="in-vazio">' + ico("ok", "in-vazio-ico") + "<strong>" + (so && so.minhas ? "Nada no seu nome agora." : "Nada pendente.") + "</strong>" +
        "<span>" + (so && so.minhas ? "As tarefas do Em Dia com você de responsável e os documentos com o seu nome aparecem aqui." : "Quando algo atrasar ou precisar de conferência em qualquer módulo, aparece aqui.") + "</span></div>";
    }
    var LIMITE = 8, resto = r.pendencias.length - LIMITE;
    return '<ul class="in-lista">' + r.pendencias.map(function (p, i) {
      return '<li class="in-item nivel-' + p.nivel + (i >= LIMITE ? " in-extra" : "") + '">' +
        '<span class="in-item-ico ico-' + p.icone + '">' + ico(p.icone) + "</span>" +
        '<span class="in-item-texto"><strong>' + esc(p.titulo) + "</strong><span>" + esc(p.detalhe) + " · " + esc(p.origem) + "</span></span>" +
        '<span class="in-selo nivel-' + p.nivel + '">' + esc(p.selo) + "</span>" +
        '<button type="button" class="btn btn-ghost btn-sm in-acao"' + atributosAcao(p.acao) + ">" + esc(p.acao.rotulo) + "</button>" +
        "</li>";
    }).join("") + "</ul>" +
      (resto > 0 ? '<button type="button" class="in-mais" data-acao-app="mais" aria-expanded="false">Mostrar mais ' + resto + "</button>" : "");
  }

  /**
   * Página inteira. opcoes: { minhas, podeExtrato, podeEmDia, podeVencimentos, mostrarExemplo }
   */
  function html(r, opcoes) {
    opcoes = opcoes || {};
    var n = r.numeros.map(function (x) {
      return '<div class="in-num' + (x.tom ? " tom-" + x.tom : "") + '"><span class="in-num-rotulo">' + esc(x.rotulo) + "</span>" +
        '<strong class="in-num-valor">' + esc(x.valor) + "</strong>" +
        (x.id === "fechamento" ? '<span class="in-barra" aria-hidden="true"><span style="width:' + (x.pct || 0) + '%"></span></span>' : "") +
        '<span class="in-num-sub">' + esc(x.sub) + "</span></div>";
    }).join("");

    var setores = r.setores.length ? r.setores.map(function (s) {
      return '<div class="in-setor setor-' + esc(s.id) + '"><div class="in-setor-topo"><strong>' + esc(s.nome) + "</strong><span>" + s.pct + "%</span></div>" +
        '<span class="in-barra" aria-hidden="true"><span style="width:' + s.pct + '%"></span></span>' +
        '<span class="in-setor-sub">' + s.feitas + " de " + s.total + " etapas" + (s.atrasadas ? " · " + plural(s.atrasadas, "atrasada", "atrasadas") : "") + "</span></div>";
    }).join("") : '<p class="muted small">O andamento por setor aparece quando houver clientes e etapas no Em Dia.</p>';

    var venc = r.vencimentos.length ? '<ul class="in-venc">' + r.vencimentos.map(function (d) {
      var tom = d.dias < 0 ? "perigo" : d.dias <= 7 ? "alerta" : "";
      var prazo = d.dias < 0 ? "Vencido" : d.dias === 0 ? "Hoje" : d.dias === 1 ? "Amanhã" : "Em " + d.dias + " dias";
      return '<li><span class="in-venc-data"><strong>' + d.vencimento.slice(8, 10) + "</strong>" + esc(nomeMes(d.vencimento).slice(0, 3)) + "</span>" +
        '<span class="in-venc-texto"><strong>' + esc(d.tipo) + "</strong><span>" + esc(d.cliente) + "</span></span>" +
        '<span class="in-venc-prazo' + (tom ? " tom-" + tom : "") + '">' + prazo + "</span></li>";
    }).join("") + "</ul>" : '<p class="muted small">Nenhum documento vencendo nos próximos 30 dias.</p>';

    var acoes = [];
    if (opcoes.podeExtrato) acoes.push('<button type="button" class="btn btn-outline btn-sm" data-acao-app="extratos">Importar extrato</button>');
    if (opcoes.podeEmDia) acoes.push('<button type="button" class="btn btn-primary btn-sm" data-ir="mod-em-dia" data-prefs=\'' + esc(JSON.stringify({ "emDia:aba": "hoje" })) + "'>Registrar atividade</button>");

    var exemplo = opcoes.mostrarExemplo ? '<div class="in-exemplo"><div><strong>Quer ver a tela funcionando?</strong>' +
      "<span>Carrega clientes, empresas e documentos fictícios nos módulos que ainda estão vazios. Os dados de exemplo saem pelo botão de remover exemplo de cada módulo.</span></div>" +
      '<button type="button" class="btn btn-outline btn-sm" data-acao-app="exemplos">Carregar dados de exemplo</button></div>' : "";

    return '<div class="inicio">' +
      '<div class="in-topo"><div><span class="in-data">' + esc(r.data) + "</span><h2>" + esc(r.saudacao) + (r.nome ? ", " + esc(r.nome) : "") + "</h2></div>" +
      '<div class="in-topo-acoes">' + acoes.join("") + "</div></div>" +
      exemplo +
      '<div class="in-numeros">' + n + "</div>" +
      '<section class="panel in-painel"><div class="in-painel-cab"><div><h3>O que precisa de você</h3><p class="muted small">Pendências de todos os módulos, das mais urgentes para as outras</p></div>' +
      '<div class="in-filtro" role="group" aria-label="Filtrar pendências">' +
      '<button type="button" data-filtro="todas" aria-pressed="' + (!opcoes.minhas) + '">Todas</button>' +
      '<button type="button" data-filtro="minhas" aria-pressed="' + (!!opcoes.minhas) + '">Minhas</button></div></div>' +
      '<div id="in-pendencias">' + htmlPendencias(r, { minhas: opcoes.minhas }) + "</div></section>" +
      '<div class="in-colunas">' +
      '<section class="panel in-painel"><div class="in-painel-cab"><div><h3>Fechamento de ' + esc(rotuloMes(r.mesFechamento)) + "</h3></div>" +
      (opcoes.podeEmDia ? '<button type="button" class="btn btn-ghost btn-sm" data-ir="mod-em-dia">Abrir Em Dia</button>' : "") + "</div>" +
      '<div class="in-setores">' + setores + "</div></section>" +
      '<section class="panel in-painel"><div class="in-painel-cab"><div><h3>Vencendo nos próximos dias</h3></div>' +
      (opcoes.podeVencimentos ? '<button type="button" class="btn btn-ghost btn-sm" data-ir="mod-vencimentos">Ver painel</button>' : "") + "</div>" + venc + "</section>" +
      "</div></div>";
  }

  // ---------------------------------------------------------------- dados de exemplo

  /** Documentos fictícios para o Painel de vencimentos (mesma estrutura do módulo; ids "ex-"). */
  function vencimentosExemplo(hoje) {
    var dia = function (n) { var d = new Date(Date.parse(hoje + "T12:00:00Z") + n * 86400000); return d.toISOString().slice(0, 10); };
    var clientes = [["ex-c1", "Alfa Comércio Ltda"], ["ex-c2", "Beta Serviços ME"], ["ex-c3", "Gama Indústria S.A."], ["ex-c4", "Delta Transportes Ltda"]]
      .map(function (c) { return { id: c[0], nome: c[1], documento: "", regime: "", contato: "", email: "", telefone: "" }; });
    var docs = [["ex-c2", "Certificado A1", -1, "pendente"], ["ex-c1", "Alvará", 2, "renovacao"], ["ex-c3", "CND Federal", 4, "pendente"],
      ["ex-c4", "Procuração", 7, "aguardando"], ["ex-c1", "CRF FGTS", 12, "pendente"], ["ex-c3", "Licença", 25, "pendente"], ["ex-c2", "CND Municipal", 80, "pendente"]];
    return { clientes: clientes, documentos: docs.map(function (d, i) {
      return { id: "ex-d" + (i + 1), clienteId: d[0], tipo: d[1], numero: "", emissao: "", vencimento: dia(d[2]), responsavel: "", observacoes: "Documento fictício.", link: "", andamento: d[3], historico: [] };
    }) };
  }

  /**
   * Carrega os exemplos de cada módulo que ainda está vazio (não mexe no que já tem dados).
   * ler(chave) → objeto ou null; gravar(chave, objeto). Devolve os nomes dos módulos que receberam exemplo.
   */
  function carregarExemplos(ler, gravar, eu, hoje, pode) {
    pode = pode || function () { return true; };
    var feitos = [], mes = somarMes(mesDe(hoje), -1);
    if (pode("mod-em-dia") && ED) {
      var e = ED.normalizar(ler(CHAVES.emDia));
      if (!ED.clientesAtivos(e).length && eu && eu.id) { ED.exemplo(e, eu, hoje); gravar(CHAVES.emDia, e); feitos.push("Em Dia"); }
    }
    if (pode("mod-iss") && ISS) {
      var i = ISS.normalizar(ler(CHAVES.iss));
      if (!ISS.mesesComDados(i).length) { ISS.exemplo(i, mes); gravar(CHAVES.iss, i); feitos.push("ISS Tubarão"); }
    }
    if (pode("mod-horas") && HR) {
      var h = HR.normalizar(ler(CHAVES.horas));
      if (!h.empresas.length) { HR.exemplo(h, new Date(hoje + "T12:00:00")); gravar(CHAVES.horas, h); feitos.push("Controle de horas"); }
    }
    if (pode("mod-vencimentos")) {
      var v = ler(CHAVES.venc);
      if (!v || !Array.isArray(v.documentos) || !v.documentos.length) { gravar(CHAVES.venc, vencimentosExemplo(hoje)); feitos.push("Painel de vencimentos"); }
    }
    return feitos;
  }

  return {
    CHAVES: CHAVES, resumir: resumir, html: html, htmlPendencias: htmlPendencias, carregarExemplos: carregarExemplos,
    vencimentosExemplo: vencimentosExemplo, hojeIso: hojeIso, somarMes: somarMes, rotuloMes: rotuloMes, dataPorExtenso: dataPorExtenso, ehMeuNome: ehMeuNome
  };
});
