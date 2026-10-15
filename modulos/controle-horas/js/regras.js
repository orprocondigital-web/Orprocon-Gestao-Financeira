/*
 * regras.js — cálculo do Controle de horas (sem tela). Testado em tests/horas.test.js.
 *
 * Unidades: tudo em MINUTOS (inteiros). Um dia da folha: {e1, s1, e2, s2, oc, obs}
 *   e1 = entrada, s1 = saída para o intervalo, e2 = volta do intervalo, s2 = saída (minutos desde 00:00 ou null)
 *   oc = ocorrência ("Falta", "Atestado", "Folga", "Feriado", "Férias", "Suspensão" ou "")
 * Funcionário: {id, nome, funcao, quadro, carga: [dom, seg, ter, qua, qui, sex, sab] em minutos, ativo}
 * Regras da empresa (todas configuráveis na tela Regras; o padrão está em regrasPadrao()).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HorasRegras = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  var TIPOS = [   // linhas da tabela de hora extra, na ordem da tela
    { id: "1", nome: "Segunda" }, { id: "2", nome: "Terça" }, { id: "3", nome: "Quarta" }, { id: "4", nome: "Quinta" },
    { id: "5", nome: "Sexta" }, { id: "6", nome: "Sábado" }, { id: "0", nome: "Domingo" }, { id: "F", nome: "Feriado" }
  ];
  var OCORRENCIAS = ["Falta", "Atestado", "Folga", "Feriado", "Férias", "Suspensão"];
  var ABONADAS = { "Atestado": 1, "Folga": 1, "Feriado": 1, "Férias": 1 };

  /** Regras de partida de uma empresa nova (o DP muda o que for diferente). */
  function regrasPadrao() {
    var he = {};
    ["1", "2", "3", "4", "5", "6"].forEach(function (t) { he[t] = { ate: 120, pct1: 50, pct2: 50 }; });
    he["0"] = { ate: 0, pct1: 100, pct2: 100 };
    he.F = { ate: 0, pct1: 100, pct2: 100 };
    return {
      toleranciaDia: 10,          // CLT art. 58 §1º: até 10 min por dia não contam (0 = sem tolerância)
      he: he,
      noturno: { inicio: 22 * 60, fim: 5 * 60, pct: 20, reduzida: true },
      compensarAtrasos: false,    // true = atrasos do mês são descontados das horas extras
      intervaloMinimo: 60,        // alerta: jornada acima de 6h com intervalo menor que isto
      limiteExtraDia: 120,        // alerta: mais do que isto de hora extra num dia
      interjornada: 11 * 60       // alerta: descanso menor que isto entre um dia e outro
    };
  }

  function completarRegras(r) {
    var p = regrasPadrao();
    r = r && typeof r === "object" ? r : {};
    var out = {};
    Object.keys(p).forEach(function (k) { out[k] = r[k] !== undefined && r[k] !== null ? r[k] : p[k]; });
    out.he = {};
    TIPOS.forEach(function (t) { out.he[t.id] = Object.assign({}, p.he[t.id], (r.he || {})[t.id] || {}); });
    out.noturno = Object.assign({}, p.noturno, r.noturno || {});
    return out;
  }

  // ---------------------------------------------------------------- horários

  /**
   * Lê um horário em qualquer formato comum: "09:00", "9:00", "0900", "900", "9h", "9h30", 9.5 (não),
   * fração do Excel (0.375 = 09:00), Date. Devolve minutos (0–1439), null se vazio, NaN se inválido.
   */
  function paraMin(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return isNaN(v) ? NaN : v.getHours() * 60 + v.getMinutes();
    if (typeof v === "number") {
      if (!isFinite(v)) return NaN;
      if (v >= 0 && v < 1) return Math.round(v * 1440) % 1440;           // fração do Excel
      if (v >= 1 && v < 2 && Math.abs(v - 1) < 1e-9) return 0;          // 24:00
      if (Number.isInteger(v) && v >= 0 && v <= 2400) return paraMin(String(v));
      return NaN;
    }
    var s = String(v).trim().toLowerCase().replace(/\s+/g, "");
    if (!s || s === "-" || s === "—" || s === "–") return null;
    var m = s.match(/^(\d{1,2})(?:[:h.,](\d{1,2})?)?(?:min|m)?$/) || s.match(/^(\d{1,2})(\d{2})$/);
    if (!m) return NaN;
    var h = Number(m[1]), mi = m[2] ? Number(m[2]) : 0;
    if (m[2] && m[2].length === 1) mi = mi * 10;   // "9:3" → 09:30
    if (h === 24 && mi === 0) return 0;
    if (h > 23 || mi > 59) return NaN;
    return h * 60 + mi;
  }

  function fmt(min, semZero) {
    if (min === null || min === undefined || isNaN(min)) return "";
    if (semZero && !min) return "";
    var neg = min < 0; min = Math.abs(Math.round(min));
    return (neg ? "-" : "") + Math.floor(min / 60) + ":" + String(min % 60).padStart(2, "0");
  }
  function fmtHora(min) { return min === null || min === undefined || isNaN(min) ? "" : String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); }
  function decimal(min) { return Math.round(min / 60 * 100) / 100; }

  function duracao(a, b) { return ((b - a) % 1440 + 1440) % 1440; }

  // ---------------------------------------------------------------- datas e feriados

  function doisDig(n) { return String(n).padStart(2, "0"); }
  function diasNoMes(mes) { return new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate(); }
  function dataIso(mes, dia) { return mes + "-" + doisDig(dia); }
  function diaSemana(iso) { return new Date(iso + "T12:00:00Z").getUTCDay(); }
  function somarMes(mes, n) {
    var a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7)) - 1 + n;
    a += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return a + "-" + doisDig(m + 1);
  }
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function rotuloMes(mes) { return MESES[Number(mes.slice(5, 7)) - 1] + "/" + mes.slice(0, 4); }

  function pascoa(ano) {   // algoritmo de Meeus/Jones/Butcher
    var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(ano, mes - 1, dia));
  }
  function mais(d, n) { var x = new Date(d.getTime() + n * 86400000); return x.toISOString().slice(0, 10); }

  /** Feriados nacionais do ano (Paixão de Cristo e Corpus Christi incluídos; municipais o DP acrescenta). */
  function feriadosNacionais(ano) {
    var p = pascoa(ano);
    return [
      { data: ano + "-01-01", nome: "Confraternização Universal" },
      { data: mais(p, -2), nome: "Paixão de Cristo" },
      { data: ano + "-04-21", nome: "Tiradentes" },
      { data: ano + "-05-01", nome: "Dia do Trabalho" },
      { data: mais(p, 60), nome: "Corpus Christi" },
      { data: ano + "-09-07", nome: "Independência do Brasil" },
      { data: ano + "-10-12", nome: "Nossa Senhora Aparecida" },
      { data: ano + "-11-02", nome: "Finados" },
      { data: ano + "-11-15", nome: "Proclamação da República" },
      { data: ano + "-11-20", nome: "Dia Nacional de Zumbi e da Consciência Negra" },
      { data: ano + "-12-25", nome: "Natal" }
    ].sort(function (a, b) { return a.data.localeCompare(b.data); });
  }

  // ---------------------------------------------------------------- cálculo de um dia

  function periodos(d) {
    var e1 = d.e1, s1 = d.s1, e2 = d.e2, s2 = d.s2, out = [], incompleto = false;
    var tem = function (x) { return x !== null && x !== undefined && !isNaN(x); };
    if (!tem(s1) && !tem(e2)) {            // um período só (ex.: sábado de manhã)
      if (tem(e1) && tem(s2)) out.push([e1, s2]);
      else if (tem(e1) || tem(s2)) incompleto = true;
    } else {
      if (tem(e1) && tem(s1)) out.push([e1, s1]); else if (tem(e1) || tem(s1)) incompleto = true;
      if (tem(e2) && tem(s2)) out.push([e2, s2]); else if (tem(e2) || tem(s2)) incompleto = true;
    }
    return { lista: out, incompleto: incompleto, invalido: [e1, s1, e2, s2].some(function (x) { return typeof x === "number" && isNaN(x); }) };
  }

  /** Minutos do período [a, b) que caem na janela noturna [ini, fim) (a janela pode virar a meia-noite). */
  function noturnoNoPeriodo(a, b, ini, fim) {
    var dur = duracao(a, b), n = 0;
    for (var i = 0; i < dur; i++) {
      var t = (a + i) % 1440;
      if (ini <= fim ? (t >= ini && t < fim) : (t >= ini || t < fim)) n++;
    }
    return n;
  }

  /**
   * Calcula um dia. Devolve {tipo, carga, trabalhado, extra, extras:{pct:min}, atraso, noturno, falta, abonado, alertas[]}.
   * tipo = "0".."6" (dia da semana) ou "F" (feriado).
   */
  function calcularDia(d, cargaDia, ehFeriado, diaSem, regras) {
    regras = completarRegras(regras);
    d = d || {};
    var oc = d.oc || "";
    var tipo = ehFeriado || oc === "Feriado" ? "F" : String(diaSem);
    var carga = tipo === "F" ? 0 : (cargaDia || 0);
    var p = periodos(d);
    var r = { tipo: tipo, carga: carga, trabalhado: 0, extra: 0, extras: {}, atraso: 0, noturno: 0, noturnoReduzido: 0,
      falta: 0, suspensao: 0, abonado: !!ABONADAS[oc], ocorrencia: oc, alertas: [], intervalo: null, inicio: null, fim: null };
    if (p.invalido) r.alertas.push("Horário inválido");
    if (p.incompleto) r.alertas.push("Marcação incompleta");
    p.lista.forEach(function (x) {
      r.trabalhado += duracao(x[0], x[1]);
      r.noturno += noturnoNoPeriodo(x[0], x[1], regras.noturno.inicio, regras.noturno.fim);
    });
    if (p.lista.length) { r.inicio = p.lista[0][0]; r.fim = p.lista[p.lista.length - 1][1]; }
    if (p.lista.length === 2) r.intervalo = duracao(p.lista[0][1], p.lista[1][0]);
    r.noturnoReduzido = regras.noturno.reduzida ? Math.round(r.noturno * 60 / 52.5) : r.noturno;

    var temHorario = p.lista.length > 0;
    if (oc === "Falta" || oc === "Suspensão") {
      if (carga > 0) { if (oc === "Falta") r.falta = 1; else r.suspensao = 1; }
      if (temHorario) r.alertas.push(oc + " com horário preenchido");
      return r;
    }
    if (!temHorario) {
      if (carga > 0 && !r.abonado && !p.incompleto) r.alertas.push("Sem registro");
      return r;
    }
    var dif = r.trabalhado - (r.abonado && oc !== "Feriado" ? r.trabalhado : carga);
    if (Math.abs(dif) <= (regras.toleranciaDia || 0)) dif = 0;
    if (dif > 0) {
      r.extra = dif;
      var f = regras.he[tipo] || { ate: 0, pct1: 50, pct2: 50 };
      var ate = Math.max(0, Number(f.ate) || 0);
      var e1 = Math.min(dif, ate), e2 = dif - e1;
      if (e1) r.extras[f.pct1] = (r.extras[f.pct1] || 0) + e1;
      if (e2) r.extras[f.pct2] = (r.extras[f.pct2] || 0) + e2;
      if (regras.limiteExtraDia && dif > regras.limiteExtraDia) r.alertas.push("Mais de " + fmt(regras.limiteExtraDia) + "h extras no dia");
    } else if (dif < 0) r.atraso = -dif;
    if (r.trabalhado > 360 && regras.intervaloMinimo) {
      if (r.intervalo === null) r.alertas.push("Jornada acima de 6h sem intervalo");
      else if (r.intervalo < regras.intervaloMinimo) r.alertas.push("Intervalo de " + fmt(r.intervalo) + " (menos de " + fmt(regras.intervaloMinimo) + ")");
    }
    return r;
  }

  // ---------------------------------------------------------------- cálculo do mês

  /** Folha do mês de um funcionário: {dias: {1: {...}, 2: {...}}}. Devolve {dias:[...], totais}. */
  function calcularMes(folha, func, mes, feriados, regras) {
    regras = completarRegras(regras);
    var set = {};
    (feriados || []).forEach(function (f) { set[f.data] = f.nome || "Feriado"; });
    var n = diasNoMes(mes), out = [], anterior = null;
    var tot = { carga: 0, trabalhado: 0, extra: 0, extras: {}, atraso: 0, noturno: 0, noturnoReduzido: 0, faltas: 0, suspensoes: 0,
      atestados: 0, ferias: 0, alertas: 0, diasTrabalhados: 0, semRegistro: 0 };
    var cargas = (func && func.carga) || [0, 0, 0, 0, 0, 0, 0];
    for (var dia = 1; dia <= n; dia++) {
      var iso = dataIso(mes, dia), ds = diaSemana(iso), d = ((folha && folha.dias) || {})[dia] || {};
      var r = calcularDia(d, cargas[ds] || 0, !!set[iso], ds, regras);
      r.dia = dia; r.data = iso; r.semana = DIAS[ds]; r.feriado = set[iso] || ""; r.entrada = d;
      // descanso entre jornadas (fim do dia anterior → início deste)
      if (r.inicio !== null && anterior && anterior.fim !== null && regras.interjornada) {
        var fimAbs = (anterior.dia - 1) * 1440 + anterior.inicio + duracaoTotal(anterior);
        var iniAbs = (dia - 1) * 1440 + r.inicio;
        var descanso = iniAbs - fimAbs;
        if (descanso >= 0 && descanso < regras.interjornada) r.alertas.push("Descanso de " + fmt(descanso) + " desde o dia anterior");
      }
      anterior = r.inicio !== null ? r : null;
      out.push(r);
      tot.carga += r.carga; tot.trabalhado += r.trabalhado; tot.extra += r.extra; tot.atraso += r.atraso;
      tot.noturno += r.noturno; tot.noturnoReduzido += r.noturnoReduzido; tot.faltas += r.falta; tot.suspensoes += r.suspensao;
      Object.keys(r.extras).forEach(function (k) { tot.extras[k] = (tot.extras[k] || 0) + r.extras[k]; });
      if (r.ocorrencia === "Atestado") tot.atestados++;
      if (r.ocorrencia === "Férias") tot.ferias++;
      if (r.trabalhado > 0) tot.diasTrabalhados++;
      if (r.alertas.indexOf("Sem registro") > -1) tot.semRegistro++;
      tot.alertas += r.alertas.length;
    }
    if (regras.compensarAtrasos && tot.atraso > 0) {
      var resta = tot.atraso;
      Object.keys(tot.extras).map(Number).sort(function (a, b) { return a - b; }).forEach(function (pct) {
        var tira = Math.min(resta, tot.extras[pct]); tot.extras[pct] -= tira; resta -= tira;
        if (!tot.extras[pct]) delete tot.extras[pct];
      });
      tot.atrasoCompensado = tot.atraso - resta;
      tot.extra -= tot.atrasoCompensado;
      tot.atraso = resta;
    }
    return { dias: out, totais: tot };
  }
  function duracaoTotal(r) {   // do início do primeiro período ao fim do último, contando a virada do dia
    var span = duracao(r.inicio, r.fim);
    return span === 0 && r.trabalhado > 0 ? 1440 : span;
  }

  // ---------------------------------------------------------------- cadastro

  /** "08:00" por dia → [dom..sab] em minutos. Aceita lista de 7 textos na ordem Seg..Dom (como na tela). */
  function cargaDeTextos(segADom) {
    var c = [0, 0, 0, 0, 0, 0, 0];
    segADom.forEach(function (t, i) { var m = paraMin(t); c[(i + 1) % 7] = m && !isNaN(m) ? m : 0; });
    return c;
  }
  function textosDeCarga(c) { return [1, 2, 3, 4, 5, 6, 0].map(function (i) { return fmtHora((c || [])[i] || 0); }); }

  function normalizarNome(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  }

  return {
    DIAS: DIAS, TIPOS: TIPOS, OCORRENCIAS: OCORRENCIAS, MESES: MESES,
    regrasPadrao: regrasPadrao, completarRegras: completarRegras,
    paraMin: paraMin, fmt: fmt, fmtHora: fmtHora, decimal: decimal, duracao: duracao,
    diasNoMes: diasNoMes, dataIso: dataIso, diaSemana: diaSemana, somarMes: somarMes, rotuloMes: rotuloMes,
    pascoa: pascoa, feriadosNacionais: feriadosNacionais,
    periodos: periodos, noturnoNoPeriodo: noturnoNoPeriodo, calcularDia: calcularDia, calcularMes: calcularMes,
    cargaDeTextos: cargaDeTextos, textosDeCarga: textosDeCarga, normalizarNome: normalizarNome
  };
});
