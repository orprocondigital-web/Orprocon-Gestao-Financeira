/*
 * dados.js — regras do Em Dia (sem tela, sem armazenamento). Testado em tests/emdia.test.js.
 *
 * Estado (guardado no navegador na chave "emDia:v1"):
 *   equipe   [{id, nome, email, funcao, setor, perfil, ativo, ausencias:[{id, inicio, fim, motivo}]}]
 *   clientes [{id, nome, cnpj, regime, responsaveis:{contabil, fiscal, pessoal}, etapas:null|[ids],
 *              contato, obs, ativo, criadoEm}]
 *   etapas   [{id, nome, curto, area, prazoDia, regimes:[...], ativa}]
 *   meses    {"2026-10": {clienteId: {etapaId: {status, responsavel, prazo, nota, atualizadoEm, atualizadoPor}}}}
 *   diario   [{id, data, hora, autor, setor, mes, clienteId, etapaId, feito, ondeParei, minutos, status, tipo, criadoEm}]
 *
 * Setores: cada setor (Contábil, Fiscal, Pessoal/DP) tem o seu diário. O setor de um registro vem da
 * etapa (ICMS → Fiscal), ou do que a pessoa escolheu, ou do setor da pessoa.
 *
 * Uma "tarefa" é uma etapa de um cliente num mês (competência). O prazo vem da etapa: dia N do mês
 * seguinte à competência (o fechamento de outubro é feito em novembro).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EmDiaDados = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSAO = 1;

  var STATUS = [
    { id: "a-fazer", nome: "A fazer" },
    { id: "andamento", nome: "Em andamento" },
    { id: "travado", nome: "Travado" },
    { id: "feito", nome: "Feito" },
    { id: "na", nome: "Não se aplica" }
  ];
  var NOME_STATUS = {};
  STATUS.forEach(function (s) { NOME_STATUS[s.id] = s.nome; });

  var AREAS = [
    { id: "geral", nome: "Geral" },
    { id: "contabil", nome: "Contábil" },
    { id: "fiscal", nome: "Fiscal" },
    { id: "pessoal", nome: "Pessoal (DP)" }
  ];
  var NOME_AREA = {};
  AREAS.forEach(function (a) { NOME_AREA[a.id] = a.nome; });
  /** Setores com diário próprio (todas as áreas menos "geral"). */
  var SETORES = AREAS.filter(function (a) { return a.id !== "geral"; });
  function ehSetor(id) { return !!id && id !== "geral" && !!NOME_AREA[id]; }

  var REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"];
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  /** Etapas de exemplo de um fechamento mensal. Prazos de exemplo: o escritório ajusta em Etapas. */
  function etapasPadrao() {
    var lista = [
      ["Documentos do cliente recebidos", "Docs", "geral", 5, []],
      ["Extratos bancários recebidos", "Extratos", "contabil", 5, []],
      ["Folha de pagamento", "Folha", "pessoal", 5, ["Simples Nacional", "Lucro Presumido", "Lucro Real"]],
      ["eSocial e FGTS Digital", "eSocial", "pessoal", 15, ["Simples Nacional", "Lucro Presumido", "Lucro Real"]],
      ["Notas fiscais (XML) conferidas", "Notas", "fiscal", 8, []],
      ["Apuração de ICMS", "ICMS", "fiscal", 10, ["Lucro Presumido", "Lucro Real"]],
      ["Apuração de PIS/COFINS", "PIS/COF", "fiscal", 12, ["Lucro Presumido", "Lucro Real"]],
      ["DAS do Simples Nacional", "DAS", "fiscal", 15, ["Simples Nacional", "MEI"]],
      ["Obrigações acessórias entregues", "Obrig.", "fiscal", 20, ["Simples Nacional", "Lucro Presumido", "Lucro Real"]],
      ["Conciliação bancária", "Concil.", "contabil", 15, []],
      ["Lançamentos contábeis", "Lançam.", "contabil", 18, ["Simples Nacional", "Lucro Presumido", "Lucro Real"]],
      ["Integração com o Único", "Único", "contabil", 20, ["Simples Nacional", "Lucro Presumido", "Lucro Real"]],
      ["Balancete conferido", "Balanc.", "contabil", 25, ["Lucro Presumido", "Lucro Real"]],
      ["Fechamento enviado ao cliente", "Envio", "geral", 28, []]
    ];
    return lista.map(function (e, i) {
      return { id: "e" + String(i + 1).padStart(2, "0"), nome: e[0], curto: e[1], area: e[2], prazoDia: e[3], regimes: e[4], ativa: true };
    });
  }

  function estadoVazio() {
    return { versao: VERSAO, equipe: [], clientes: [], etapas: etapasPadrao(), meses: {}, diario: [] };
  }

  /** Completa o que faltar (estado antigo ou corrompido) sem perder nada. "folha" virou "pessoal". */
  function normalizar(e) {
    e = e && typeof e === "object" ? e : {};
    var v = estadoVazio();
    (Array.isArray(e.etapas) ? e.etapas : []).forEach(function (x) { if (x && x.area === "folha") x.area = "pessoal"; });
    (Array.isArray(e.clientes) ? e.clientes : []).forEach(function (c) {
      var r = c && c.responsaveis;
      if (r && r.folha !== undefined) { if (!r.pessoal) r.pessoal = r.folha; delete r.folha; }
    });
    (Array.isArray(e.equipe) ? e.equipe : []).forEach(function (p) { if (p && p.setor === undefined) p.setor = setorPorFuncao(p.funcao); });
    return {
      versao: VERSAO,
      equipe: Array.isArray(e.equipe) ? e.equipe : v.equipe,
      clientes: Array.isArray(e.clientes) ? e.clientes : v.clientes,
      etapas: Array.isArray(e.etapas) && e.etapas.length ? e.etapas : v.etapas,
      meses: e.meses && typeof e.meses === "object" ? e.meses : {},
      diario: Array.isArray(e.diario) ? e.diario : []
    };
  }

  /** Palpite de setor pelo texto da função ("Fiscal", "Folha", "DP"...). */
  function setorPorFuncao(funcao) {
    var f = String(funcao || "").toLowerCase();
    if (/fiscal|tribut/.test(f)) return "fiscal";
    if (/folha|pessoal|\bdp\b|rh/.test(f)) return "pessoal";
    if (/cont[aá]bil|contador/.test(f)) return "contabil";
    return "";
  }

  var seq = 0;
  function uid(prefixo) { seq++; return (prefixo || "x") + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6); }

  // ---------------------------------------------------------------- datas

  function doisDig(n) { return String(n).padStart(2, "0"); }
  function hojeIso(d) { d = d || new Date(); return d.getFullYear() + "-" + doisDig(d.getMonth() + 1) + "-" + doisDig(d.getDate()); }
  function horaDe(d) { d = d || new Date(); return doisDig(d.getHours()) + ":" + doisDig(d.getMinutes()); }
  function mesDe(iso) { return String(iso || "").slice(0, 7); }
  function somarMes(mes, n) {
    var a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7)) - 1 + n;
    a += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return a + "-" + doisDig(m + 1);
  }
  function rotuloMes(mes) { return MESES[Number(mes.slice(5, 7)) - 1] + "/" + mes.slice(0, 4); }
  function dataBr(iso) { return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : ""; }
  function diasEntre(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }
  function ultimoDia(mes) { return new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate(); }

  /** Prazo de uma etapa: dia N do mês seguinte à competência (sem passar do último dia do mês). */
  function prazoEtapa(mes, etapa) {
    var seguinte = somarMes(mes, 1);
    var dia = Math.min(Math.max(1, Number(etapa.prazoDia) || 1), ultimoDia(seguinte));
    return seguinte + "-" + doisDig(dia);
  }

  // ---------------------------------------------------------------- consultas básicas

  function porId(lista, id) { for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i]; return null; }
  function etapasAtivas(e) { return e.etapas.filter(function (x) { return x.ativa !== false; }); }
  function clientesAtivos(e) { return e.clientes.filter(function (c) { return c.ativo !== false; }); }

  /** Etapas que valem para o cliente: as escolhidas no cadastro, ou as do regime dele. */
  function etapasDoCliente(e, cliente) {
    var ativas = etapasAtivas(e);
    if (Array.isArray(cliente.etapas) && cliente.etapas.length) {
      return ativas.filter(function (x) { return cliente.etapas.indexOf(x.id) > -1; });
    }
    return ativas.filter(function (x) { return !x.regimes || !x.regimes.length || x.regimes.indexOf(cliente.regime) > -1; });
  }

  /** Responsável padrão: o da área da etapa no cliente; senão o contábil; senão nenhum. */
  function responsavelPadrao(cliente, etapa) {
    var r = cliente.responsaveis || {};
    return r[etapa.area] || r.contabil || r.fiscal || r.pessoal || "";
  }

  function registroTarefa(e, mes, clienteId, etapaId) {
    var m = e.meses[mes], c = m && m[clienteId];
    return (c && c[etapaId]) || null;
  }

  function tarefa(e, mes, cliente, etapa) {
    var r = registroTarefa(e, mes, cliente.id, etapa.id) || {};
    return {
      mes: mes, clienteId: cliente.id, etapaId: etapa.id,
      cliente: cliente.nome, etapa: etapa.nome, area: etapa.area,
      status: r.status || "a-fazer",
      responsavel: r.responsavel !== undefined && r.responsavel !== null && r.responsavel !== "" ? r.responsavel : responsavelPadrao(cliente, etapa),
      prazo: r.prazo || prazoEtapa(mes, etapa),
      nota: r.nota || "",
      atualizadoEm: r.atualizadoEm || "", atualizadoPor: r.atualizadoPor || ""
    };
  }

  function tarefasDoMes(e, mes) {
    var out = [];
    clientesAtivos(e).forEach(function (c) {
      etapasDoCliente(e, c).forEach(function (et) { out.push(tarefa(e, mes, c, et)); });
    });
    return out;
  }

  function aberta(t) { return t.status !== "feito" && t.status !== "na"; }

  /** "atrasada" | "hoje" | "logo" (até 3 dias) | "" */
  function situacao(t, hoje) {
    if (!aberta(t)) return "";
    var d = diasEntre(hoje, t.prazo);
    if (d < 0) return "atrasada";
    if (d === 0) return "hoje";
    if (d <= 3) return "logo";
    return "";
  }

  // ---------------------------------------------------------------- alterações

  /** Altera uma tarefa (status, responsavel, prazo, nota). Devolve a tarefa como fica. */
  function atualizarTarefa(e, mes, clienteId, etapaId, campos, quem, agora) {
    var cliente = porId(e.clientes, clienteId), etapa = porId(e.etapas, etapaId);
    if (!cliente || !etapa) throw new Error("Cliente ou etapa não encontrado.");
    if (campos.status && !NOME_STATUS[campos.status]) throw new Error("Situação inválida.");
    e.meses[mes] = e.meses[mes] || {};
    e.meses[mes][clienteId] = e.meses[mes][clienteId] || {};
    var r = e.meses[mes][clienteId][etapaId] = e.meses[mes][clienteId][etapaId] || {};
    ["status", "responsavel", "prazo", "nota"].forEach(function (k) { if (campos[k] !== undefined) r[k] = campos[k]; });
    r.atualizadoEm = (agora || new Date()).toISOString();
    r.atualizadoPor = quem || "";
    return tarefa(e, mes, cliente, etapa);
  }

  /** Registra o que a pessoa fez. Se vier status e etapa, atualiza a tarefa também. */
  function registrarDiario(e, entrada, agora) {
    agora = agora || new Date();
    var feito = String(entrada.feito || "").trim();
    if (!entrada.autor) throw new Error("Quem fez a atividade?");
    if (!entrada.clienteId) throw new Error("Escolha o cliente.");
    if (!feito) throw new Error("Conte o que foi feito.");
    var d = {
      id: uid("d"), data: entrada.data || hojeIso(agora), hora: entrada.hora || horaDe(agora),
      autor: entrada.autor, setor: setorDoRegistro(e, entrada), mes: entrada.mes || mesDe(entrada.data || hojeIso(agora)),
      clienteId: entrada.clienteId, etapaId: entrada.etapaId || "",
      feito: feito, ondeParei: String(entrada.ondeParei || "").trim(),
      minutos: Number(entrada.minutos) > 0 ? Math.round(Number(entrada.minutos)) : 0,
      status: entrada.status || "", tipo: entrada.tipo || "atividade", criadoEm: agora.toISOString()
    };
    if (d.etapaId && d.status) atualizarTarefa(e, d.mes, d.clienteId, d.etapaId, { status: d.status }, d.autor, agora);
    e.diario.push(d);
    return d;
  }

  /** Setor de um registro: o escolhido; senão o da etapa; senão o da pessoa; senão "" (sem setor). */
  function setorDoRegistro(e, d) {
    if (ehSetor(d.setor)) return d.setor;
    var et = d.etapaId ? porId(e.etapas, d.etapaId) : null;
    if (et && ehSetor(et.area)) return et.area;
    var p = d.autor ? porId(e.equipe, d.autor) : null;
    return p && ehSetor(p.setor) ? p.setor : "";
  }

  /** O registro do diário fala desta tarefa? O da própria etapa, ou um avulso (sem etapa) do mesmo setor. */
  function registroDaTarefa(e, d, mes, clienteId, etapaId) {
    if (d.clienteId !== clienteId || d.mes !== mes) return false;
    if (!etapaId) return true;
    if (d.etapaId) return d.etapaId === etapaId;
    var et = porId(e.etapas, etapaId), s = setorDe(e, d);
    return !s || !et || !ehSetor(et.area) || s === et.area;
  }

  /** Último "onde parei" daquela tarefa (de qualquer pessoa), para quem for continuar. */
  function ultimoOndeParei(e, mes, clienteId, etapaId) {
    var achado = null;
    e.diario.forEach(function (d) {
      if (!d.ondeParei || !registroDaTarefa(e, d, mes, clienteId, etapaId)) return;
      if (!achado || d.criadoEm > achado.criadoEm) achado = d;
    });
    return achado;
  }

  function abertasDe(e, mes, pessoaId) {
    return tarefasDoMes(e, mes).filter(function (t) { return aberta(t) && t.responsavel === pessoaId; });
  }

  /** Passa tarefas de uma pessoa para outra e anota no diário de cada cliente. */
  function passarBastao(e, mes, de, para, itens, quem, agora) {
    if (!para) throw new Error("Escolha para quem passar.");
    if (de === para) throw new Error("Escolha outra pessoa.");
    agora = agora || new Date();
    var nomeDe = (porId(e.equipe, de) || {}).nome || "?", nomePara = (porId(e.equipe, para) || {}).nome || "?";
    var grupos = {}, ordem = [];   // um registro por cliente e setor, para cair no diário certo
    itens.forEach(function (it) {
      atualizarTarefa(e, mes, it.clienteId, it.etapaId, { responsavel: para }, quem, agora);
      var et = porId(e.etapas, it.etapaId) || {};
      var setor = ehSetor(et.area) ? et.area : setorDoRegistro(e, { autor: de });
      var k = it.clienteId + "|" + setor;
      if (!grupos[k]) { grupos[k] = { clienteId: it.clienteId, setor: setor, nomes: [] }; ordem.push(k); }
      grupos[k].nomes.push(et.nome);
    });
    ordem.forEach(function (k) {
      var g = grupos[k];
      e.diario.push({ id: uid("d"), data: hojeIso(agora), hora: horaDe(agora), autor: quem, setor: g.setor, mes: mes, clienteId: g.clienteId, etapaId: "",
        feito: "Tarefas passadas de " + nomeDe + " para " + nomePara + ": " + g.nomes.join(", ") + ".",
        ondeParei: "", minutos: 0, status: "", tipo: "bastao", criadoEm: agora.toISOString() });
    });
    return itens.length;
  }

  // ---------------------------------------------------------------- equipe

  /** Garante que a pessoa logada está na equipe (atualiza nome e e-mail). */
  function registrarMembro(e, u) {
    if (!u || !u.id) return null;
    var m = porId(e.equipe, u.id);
    if (!m) { m = { id: u.id, nome: u.nome || u.email || "Sem nome", email: u.email || "", funcao: "", setor: ehSetor(u.setor) ? u.setor : "", perfil: u.perfil || "usuario", ativo: true, ausencias: [] }; e.equipe.push(m); }
    else { if (u.nome) m.nome = u.nome; if (u.email) m.email = u.email; if (u.perfil) m.perfil = u.perfil; }
    return m;
  }

  function ausenciaAtual(pessoa, hoje) {
    var a = (pessoa && pessoa.ausencias) || [];
    for (var i = 0; i < a.length; i++) if (a[i].inicio <= hoje && (!a[i].fim || a[i].fim >= hoje)) return a[i];
    return null;
  }

  function equipeAtiva(e) { return e.equipe.filter(function (p) { return p.ativo !== false; }); }

  // ---------------------------------------------------------------- resumos

  function progresso(tarefas, hoje) {
    var r = { total: 0, feitas: 0, abertas: 0, atrasadas: 0, travadas: 0, andamento: 0, pct: 0 };
    tarefas.forEach(function (t) {
      if (t.status === "na") return;
      r.total++;
      if (t.status === "feito") r.feitas++; else r.abertas++;
      if (t.status === "travado") r.travadas++;
      if (t.status === "andamento") r.andamento++;
      if (situacao(t, hoje) === "atrasada") r.atrasadas++;
    });
    r.pct = r.total ? Math.round(r.feitas * 100 / r.total) : 0;
    return r;
  }

  function resumoMes(e, mes, hoje) {
    var ts = tarefasDoMes(e, mes);
    var porCliente = clientesAtivos(e).map(function (c) {
      var p = progresso(ts.filter(function (t) { return t.clienteId === c.id; }), hoje);
      p.cliente = c; return p;
    });
    var porPessoa = equipeAtiva(e).map(function (p) {
      var minhas = ts.filter(function (t) { return t.responsavel === p.id; });
      var r = progresso(minhas, hoje);
      var ultima = null;
      e.diario.forEach(function (d) { if (d.autor === p.id && (!ultima || d.criadoEm > ultima.criadoEm)) ultima = d; });
      r.pessoa = p; r.ultima = ultima; r.ausencia = ausenciaAtual(p, hoje);
      return r;
    });
    var porArea = AREAS.map(function (a) {
      var r = progresso(ts.filter(function (t) { return t.area === a.id; }), hoje); r.area = a; return r;
    }).filter(function (r) { return r.total; });
    var semDono = ts.filter(function (t) { return aberta(t) && !t.responsavel; }).length;
    var geral = progresso(ts, hoje);
    geral.clientes = porCliente.length;
    geral.clientesConcluidos = porCliente.filter(function (p) { return p.total && p.feitas === p.total; }).length;
    geral.semDono = semDono;
    return { geral: geral, porCliente: porCliente, porPessoa: porPessoa, porArea: porArea, tarefas: ts };
  }

  /** Setor de um registro já gravado (os antigos, sem setor, são deduzidos). */
  function setorDe(e, d) { return ehSetor(d.setor) ? d.setor : setorDoRegistro(e, { etapaId: d.etapaId, autor: d.autor }); }

  /** Diário com filtros: {setor, pessoa, clienteId, de, ate, texto}. Mais recente primeiro.
   *  setor "sem" = registros sem setor. */
  function filtrarDiario(e, f) {
    f = f || {};
    var txt = String(f.texto || "").trim().toLowerCase();
    return e.diario.filter(function (d) {
      if (f.setor && (setorDe(e, d) || "sem") !== f.setor) return false;
      if (f.pessoa && d.autor !== f.pessoa) return false;
      if (f.clienteId && d.clienteId !== f.clienteId) return false;
      if (f.de && d.data < f.de) return false;
      if (f.ate && d.data > f.ate) return false;
      if (txt && (d.feito + " " + d.ondeParei).toLowerCase().indexOf(txt) < 0) return false;
      return true;
    }).sort(function (a, b) { return (b.data + b.hora + b.criadoEm).localeCompare(a.data + a.hora + a.criadoEm); });
  }

  function csvDiario(e, lista) {
    var q = function (s) { s = String(s === undefined || s === null ? "" : s); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var linhas = [["Data", "Hora", "Setor", "Pessoa", "Cliente", "Etapa", "O que foi feito", "Onde parei / próximo passo", "Minutos", "Situação"].join(";")];
    lista.forEach(function (d) {
      linhas.push([dataBr(d.data), d.hora, NOME_AREA[setorDe(e, d)] || "", (porId(e.equipe, d.autor) || {}).nome, (porId(e.clientes, d.clienteId) || {}).nome,
        (porId(e.etapas, d.etapaId) || {}).nome, d.feito, d.ondeParei, d.minutos || "", NOME_STATUS[d.status] || ""].map(q).join(";"));
    });
    return "﻿" + linhas.join("\r\n");
  }

  /** Números do diário de cada setor: registros no dia, pessoas que registraram, minutos,
   *  e as tarefas do mês daquele setor (abertas, atrasadas). */
  function resumoSetores(e, mes, hoje) {
    var ts = tarefasDoMes(e, mes);
    return SETORES.map(function (s) {
      var doDia = e.diario.filter(function (d) { return d.data === hoje && setorDe(e, d) === s.id; });
      var pessoas = {};
      doDia.forEach(function (d) { pessoas[d.autor] = true; });
      var p = progresso(ts.filter(function (t) { return t.area === s.id; }), hoje);
      return { setor: s, registrosHoje: doDia.length, pessoasHoje: Object.keys(pessoas).length,
        minutosHoje: doDia.reduce(function (a, d) { return a + (d.minutos || 0); }, 0),
        equipe: equipeAtiva(e).filter(function (x) { return x.setor === s.id; }),
        abertas: p.abertas, atrasadas: p.atrasadas, feitas: p.feitas, total: p.total, pct: p.pct };
    });
  }

  // ---------------------------------------------------------------- dados de exemplo

  /** Monta uma demonstração com nomes inventados (nada de cliente real). */
  function exemplo(e, eu, hoje) {
    hoje = hoje || hojeIso();
    var mes = somarMes(mesDe(hoje), -1);   // o fechamento em andamento é o do mês anterior
    var euM = registrarMembro(e, eu);
    if (euM && !euM.setor) euM.setor = "contabil";
    var pessoas = [eu.id];
    [["Carla Exemplo", "Analista contábil", "contabil"], ["Diego Exemplo", "Analista fiscal", "fiscal"], ["Fernanda Exemplo", "Departamento pessoal", "pessoal"]].forEach(function (p, i) {
      var id = "exemplo-" + (i + 1);
      if (!porId(e.equipe, id)) e.equipe.push({ id: id, nome: p[0], email: p[0].split(" ")[0].toLowerCase() + "@exemplo.com", funcao: p[1], setor: p[2], perfil: "usuario", ativo: true, ausencias: [] });
      pessoas.push(id);
    });
    var nomes = [["Alfa Comércio Ltda", "Lucro Presumido"], ["Beta Serviços ME", "Simples Nacional"], ["Gama Indústria S.A.", "Lucro Real"],
      ["Delta Transportes Ltda", "Lucro Presumido"], ["Épsilon Clínica Ltda", "Simples Nacional"], ["Zeta Tecnologia Ltda", "Simples Nacional"],
      ["Eta Construções Ltda", "Lucro Real"], ["Teta Artesanato MEI", "MEI"]];
    var criados = [];
    nomes.forEach(function (n, i) {
      if (e.clientes.some(function (c) { return c.nome === n[0]; })) return;
      var c = { id: uid("c"), nome: n[0], cnpj: "", regime: n[1],
        responsaveis: { contabil: i % 2 ? pessoas[0] : pessoas[1], fiscal: pessoas[2], pessoal: pessoas[3] },
        etapas: null, contato: "", obs: "Cliente fictício para demonstração.", ativo: true, exemplo: true, criadoEm: new Date().toISOString() };
      if (i === 0) c.responsaveis.contabil = eu.id;
      e.clientes.push(c); criados.push(c);
    });
    // situação variada: quanto mais cedo o prazo, mais chance de já estar feito
    var agora = new Date();
    var ontem = new Date(Date.parse(hoje + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
    var diaDe = function (autor) { return autor === "exemplo-3" ? ontem : hoje; };   // Fernanda está de atestado hoje
    criados.forEach(function (c, ci) {
      etapasDoCliente(e, c).forEach(function (et, ei) {
        var t = tarefa(e, mes, c, et), d = diasEntre(hoje, t.prazo), r = (ci * 7 + ei * 3) % 10;
        var st = d < -3 ? (r < 8 ? "feito" : "andamento") : d < 2 ? (r < 4 ? "feito" : r < 7 ? "andamento" : r < 8 ? "travado" : "a-fazer") : (r < 2 ? "andamento" : "a-fazer");
        if (st !== "a-fazer") atualizarTarefa(e, mes, c.id, et.id, { status: st, nota: st === "travado" ? "Aguardando documento do cliente." : "" }, t.responsavel, agora);
        if (st === "andamento" || (st === "feito" && r === 1)) {
          registrarDiario(e, { autor: t.responsavel || eu.id, mes: mes, clienteId: c.id, etapaId: et.id, data: diaDe(t.responsavel), hora: doisDig(8 + (ei % 9)) + ":" + doisDig((ci * 11) % 60),
            feito: st === "feito" ? et.nome + " concluída." : "Comecei " + et.nome.toLowerCase() + ".",
            ondeParei: st === "andamento" ? "Falta conferir os últimos lançamentos de " + rotuloMes(mes) + "." : "", minutos: 30 + (ei * 5) % 60 }, agora);
        }
      });
    });
    // atividades que não são etapa do fechamento: cada setor tem o seu dia a dia
    var avulsas = [
      [1, "contabil", 0, "Atendi o cliente por telefone sobre a distribuição de lucros.", "Mandar o informe por e-mail amanhã.", 20],
      [0, "contabil", 2, "Revisei a depreciação do imobilizado.", "", 40],
      [2, "fiscal", 0, "Conferi CFOPs das notas de entrada com o cliente.", "Duas notas com CFOP errado: pedir carta de correção.", 35],
      [2, "fiscal", 3, "Parcelamento de ICMS: emiti a guia da parcela.", "", 15],
      [3, "pessoal", 1, "Admissão de funcionário: cadastro e contrato.", "Falta o exame admissional (cliente envia até sexta).", 50],
      [3, "pessoal", 4, "Cálculo de férias de 2 funcionários.", "Conferir média de horas extras antes de enviar.", 45]
    ];
    if (criados.length) avulsas.forEach(function (a, k) {
      var c = criados[a[2] % criados.length];
      registrarDiario(e, { autor: pessoas[a[0]], setor: a[1], mes: mes, clienteId: c.id, data: diaDe(pessoas[a[0]]), hora: doisDig(9 + k) + ":" + doisDig((k * 17) % 60),
        feito: a[3], ondeParei: a[4], minutos: a[5] }, agora);
    });
    var fer = porId(e.equipe, "exemplo-3");
    if (fer && !ausenciaAtual(fer, hoje)) fer.ausencias.push({ id: uid("a"), inicio: hoje, fim: somarMes(mesDe(hoje), 0) + "-" + doisDig(Math.min(ultimoDia(mesDe(hoje)), Number(hoje.slice(8)) + 3)), motivo: "Atestado médico" });
    return { mes: mes, clientes: criados.length };
  }

  /** Tira só o que veio de "Carregar dados de exemplo": clientes, pessoas fictícias, tarefas e diário deles. */
  function removerExemplo(e) {
    var ehEx = function (c) { return c.exemplo === true || c.obs === "Cliente fictício para demonstração."; };
    var clientes = {}, pessoas = {};
    e.clientes.forEach(function (c) { if (ehEx(c)) clientes[c.id] = true; });
    e.equipe.forEach(function (p) { if (String(p.id).indexOf("exemplo-") === 0) pessoas[p.id] = true; });
    var antes = { clientes: e.clientes.length, equipe: e.equipe.length, diario: e.diario.length };
    e.clientes = e.clientes.filter(function (c) { return !clientes[c.id]; });
    e.equipe = e.equipe.filter(function (p) { return !pessoas[p.id]; });
    e.diario = e.diario.filter(function (x) { return !clientes[x.clienteId] && !pessoas[x.autor]; });
    Object.keys(e.meses).forEach(function (m) {
      Object.keys(e.meses[m]).forEach(function (cid) { if (clientes[cid]) delete e.meses[m][cid]; });
      Object.keys(e.meses[m]).forEach(function (cid) {
        Object.keys(e.meses[m][cid]).forEach(function (et) {
          var r = e.meses[m][cid][et];
          if (pessoas[r.responsavel]) r.responsavel = "";
        });
      });
    });
    e.clientes.forEach(function (c) {
      var r = c.responsaveis || {};
      Object.keys(r).forEach(function (k) { if (pessoas[r[k]]) r[k] = ""; });
    });
    return { clientes: antes.clientes - e.clientes.length, equipe: antes.equipe - e.equipe.length, diario: antes.diario - e.diario.length };
  }

  /** Tem algo de exemplo? (para mostrar o botão certo) */
  function temExemplo(e) {
    return e.clientes.some(function (c) { return c.exemplo === true || c.obs === "Cliente fictício para demonstração."; }) ||
      e.equipe.some(function (p) { return String(p.id).indexOf("exemplo-") === 0; });
  }

  return {
    removerExemplo: removerExemplo, temExemplo: temExemplo,
    VERSAO: VERSAO, STATUS: STATUS, NOME_STATUS: NOME_STATUS, AREAS: AREAS, NOME_AREA: NOME_AREA, REGIMES: REGIMES,
    SETORES: SETORES, ehSetor: ehSetor, setorPorFuncao: setorPorFuncao, setorDoRegistro: setorDoRegistro, setorDe: setorDe, resumoSetores: resumoSetores,
    etapasPadrao: etapasPadrao, estadoVazio: estadoVazio, normalizar: normalizar, uid: uid,
    hojeIso: hojeIso, horaDe: horaDe, mesDe: mesDe, somarMes: somarMes, rotuloMes: rotuloMes, dataBr: dataBr, diasEntre: diasEntre,
    prazoEtapa: prazoEtapa, porId: porId, etapasAtivas: etapasAtivas, clientesAtivos: clientesAtivos, etapasDoCliente: etapasDoCliente,
    responsavelPadrao: responsavelPadrao, tarefa: tarefa, tarefasDoMes: tarefasDoMes, aberta: aberta, situacao: situacao,
    atualizarTarefa: atualizarTarefa, registrarDiario: registrarDiario, ultimoOndeParei: ultimoOndeParei, registroDaTarefa: registroDaTarefa, abertasDe: abertasDe,
    passarBastao: passarBastao, registrarMembro: registrarMembro, ausenciaAtual: ausenciaAtual, equipeAtiva: equipeAtiva,
    progresso: progresso, resumoMes: resumoMes, filtrarDiario: filtrarDiario, csvDiario: csvDiario, exemplo: exemplo
  };
});
