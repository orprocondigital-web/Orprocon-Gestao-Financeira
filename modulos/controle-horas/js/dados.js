/*
 * dados.js — cadastro, meses e importação do Controle de horas (sem tela). Testado em tests/horas.test.js.
 *
 * Estado (no navegador, chave "horas:v1"; vai no backup do sistema):
 *   empresas [{id, nome, cnpj, regras, feriados:[{data, nome}], cargaPadrao:[dom..sab], funcionarios:[...], criadoEm}]
 *     funcionário {id, nome, funcao, quadro, carga:[dom..sab] em minutos, ativo}
 *   meses {empresaId: {"2026-09": {status:"aberto"|"fechado", fechadoEm, regras?, feriados?,
 *          folhas:{funcionarioId: {dias:{1:{e1,s1,e2,s2,oc,obs}}, origem, revisada, atualizadoEm, avisos}}, importacoes:[...]}}}
 * Mês fechado guarda as regras e os feriados que usou: mudar as regras depois não muda o cálculo dele.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./regras.js"));
  else root.HorasDados = factory(root.HorasRegras);
})(typeof self !== "undefined" ? self : this, function (R) {
  "use strict";

  var seq = 0;
  function uid(p) { seq++; return (p || "x") + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function porId(lista, id) { for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i]; return null; }
  var CARGA_PADRAO = [0, 480, 480, 480, 480, 480, 240];   // dom..sab: 8h seg–sex, 4h sáb

  function estadoVazio() { return { versao: 1, empresas: [], meses: {} }; }
  function normalizar(e) {
    e = e && typeof e === "object" ? e : {};
    var out = { versao: 1, empresas: Array.isArray(e.empresas) ? e.empresas : [], meses: e.meses && typeof e.meses === "object" ? e.meses : {} };
    out.empresas.forEach(function (emp) {
      emp.regras = R.completarRegras(emp.regras);
      emp.feriados = Array.isArray(emp.feriados) ? emp.feriados : [];
      emp.funcionarios = Array.isArray(emp.funcionarios) ? emp.funcionarios : [];
      emp.cargaPadrao = Array.isArray(emp.cargaPadrao) && emp.cargaPadrao.length === 7 ? emp.cargaPadrao : CARGA_PADRAO.slice();
    });
    return out;
  }

  // ---------------------------------------------------------------- empresas e funcionários

  function salvarEmpresa(e, dados, ano) {
    var nome = String(dados.nome || "").trim();
    if (!nome) throw new Error("Informe o nome da empresa.");
    var emp = dados.id ? porId(e.empresas, dados.id) : null;
    var repetida = e.empresas.some(function (x) { return x !== emp && R.normalizarNome(x.nome) === R.normalizarNome(nome); });
    if (repetida) throw new Error("Já existe uma empresa com esse nome.");
    if (!emp) {
      emp = { id: uid("e"), regras: R.regrasPadrao(), feriados: R.feriadosNacionais(ano || new Date().getFullYear()),
        cargaPadrao: CARGA_PADRAO.slice(), funcionarios: [], criadoEm: new Date().toISOString() };
      e.empresas.push(emp);
    }
    emp.nome = nome; emp.cnpj = String(dados.cnpj || "").trim();
    if (dados.cargaPadrao) emp.cargaPadrao = dados.cargaPadrao;
    return emp;
  }

  function excluirEmpresa(e, id) {
    e.empresas = e.empresas.filter(function (x) { return x.id !== id; });
    delete e.meses[id];
  }

  function salvarFuncionario(emp, dados) {
    var nome = String(dados.nome || "").trim();
    if (!nome) throw new Error("Informe o nome do funcionário.");
    var f = dados.id ? porId(emp.funcionarios, dados.id) : null;
    var repetido = emp.funcionarios.some(function (x) { return x !== f && x.ativo !== false && R.normalizarNome(x.nome) === R.normalizarNome(nome); });
    if (repetido) throw new Error("Já existe um funcionário com esse nome nesta empresa.");
    if (!f) { f = { id: uid("f"), ativo: true, carga: (emp.cargaPadrao || CARGA_PADRAO).slice() }; emp.funcionarios.push(f); }
    f.nome = nome;
    ["funcao", "quadro"].forEach(function (k) { if (dados[k] !== undefined) f[k] = String(dados[k] || "").trim(); });
    if (Array.isArray(dados.carga) && dados.carga.length === 7) f.carga = dados.carga.slice();
    if (dados.ativo !== undefined) f.ativo = !!dados.ativo;
    return f;
  }

  /** Vários de uma vez: uma linha por nome ("Nome" ou "Nome; Função"). Devolve quantos entraram e os repetidos. */
  function adicionarVarios(emp, texto) {
    var criados = 0, repetidos = [];
    String(texto || "").split(/\r?\n/).forEach(function (linha) {
      var p = linha.split(/[;\t]/), nome = (p[0] || "").trim();
      if (!nome) return;
      try { salvarFuncionario(emp, { nome: nome, funcao: (p[1] || "").trim() }); criados++; }
      catch (err) { repetidos.push(nome); }
    });
    return { criados: criados, repetidos: repetidos };
  }

  function ativos(emp) {
    return emp.funcionarios.filter(function (f) { return f.ativo !== false; }).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
  }

  // ---------------------------------------------------------------- meses

  function mesDe(e, empId, mes, criar) {
    var m = (e.meses[empId] || {})[mes];
    if (!m && criar) {
      e.meses[empId] = e.meses[empId] || {};
      m = e.meses[empId][mes] = { status: "aberto", folhas: {}, importacoes: [] };
    }
    return m || null;
  }
  function exigirAberto(m) { if (m && m.status === "fechado") throw new Error("Este mês está fechado. Reabra para alterar."); }

  /** Regras e feriados que valem para o mês: os guardados no fechamento, ou os atuais da empresa. */
  function regrasDoMes(emp, m) { return m && m.status === "fechado" && m.regras ? m.regras : emp.regras; }
  function feriadosDoMes(emp, m) { return m && m.status === "fechado" && m.feriados ? m.feriados : emp.feriados; }

  function folhaDe(e, empId, mes, funcId, criar) {
    var m = mesDe(e, empId, mes, criar);
    if (!m) return null;
    if (!m.folhas[funcId] && criar) m.folhas[funcId] = { dias: {}, origem: "digitado", revisada: false, atualizadoEm: "", avisos: [] };
    return m.folhas[funcId] || null;
  }

  /** Muda um dia (campos e1/s1/e2/s2 em minutos ou null, oc, obs). A folha volta a "não revisada". */
  function atualizarDia(e, empId, mes, funcId, dia, campos) {
    exigirAberto(mesDe(e, empId, mes, false));
    var f = folhaDe(e, empId, mes, funcId, true);
    var d = f.dias[dia] = Object.assign({ e1: null, s1: null, e2: null, s2: null, oc: "", obs: "" }, f.dias[dia] || {}, campos);
    var vazio = d.e1 === null && d.s1 === null && d.e2 === null && d.s2 === null && !d.oc && !d.obs;
    if (vazio) delete f.dias[dia];
    f.revisada = false; f.atualizadoEm = new Date().toISOString();
    return d;
  }

  function marcarRevisada(e, empId, mes, funcId, sim) {
    exigirAberto(mesDe(e, empId, mes, false));
    var f = folhaDe(e, empId, mes, funcId, true);
    f.revisada = sim !== false;
    return f;
  }

  function fecharMes(e, empId, mes, quem) {
    var emp = porId(e.empresas, empId), m = mesDe(e, empId, mes, true);
    m.status = "fechado"; m.fechadoEm = new Date().toISOString(); m.fechadoPor = quem || "";
    m.regras = copia(emp.regras); m.feriados = copia(emp.feriados);
    return m;
  }
  function reabrirMes(e, empId, mes) {
    var m = mesDe(e, empId, mes, false);
    if (m) { m.status = "aberto"; delete m.regras; delete m.feriados; delete m.fechadoEm; delete m.fechadoPor; }
    return m;
  }

  // ---------------------------------------------------------------- importação

  /**
   * Leva para o mês o que veio da planilha (HorasPlanilha.ler). Cada folha é ligada ao funcionário pelo id
   * escondido na aba (planilha gerada pelo sistema) ou pelo nome. Quem não existir é cadastrado (criarNovos)
   * com a carga padrão da empresa. Folhas importadas substituem as anteriores do mesmo funcionário.
   */
  function aplicarImportacao(e, empId, mes, lido, opcoes) {
    opcoes = opcoes || {};
    var emp = porId(e.empresas, empId);
    if (!emp) throw new Error("Empresa não encontrada.");
    exigirAberto(mesDe(e, empId, mes, false));
    var m = mesDe(e, empId, mes, true);
    var res = { importadas: 0, criados: [], ignoradas: [], emBranco: [], avisos: (lido.avisos || []).slice() };
    if (lido.mes && lido.mes !== mes) res.avisos.unshift("A planilha é de " + R.rotuloMes(lido.mes) + ", mas foi importada em " + R.rotuloMes(mes) + ".");
    (lido.folhas || []).forEach(function (fl) {
      // aba sem nenhum dia preenchido: o cliente não mandou essa folha; não apaga o que já existe
      if (!Object.keys(fl.dias || {}).length) { res.emBranco.push(fl.nome || fl.aba); return; }
      var f = (fl.id && porId(emp.funcionarios, fl.id)) ||
        emp.funcionarios.filter(function (x) { return R.normalizarNome(x.nome) === R.normalizarNome(fl.nome); })[0] || null;
      if (!f) {
        if (!fl.nome || opcoes.criarNovos === false) { res.ignoradas.push(fl.aba); return; }
        f = salvarFuncionario(emp, { nome: fl.nome, funcao: fl.funcao, quadro: fl.quadro });
        res.criados.push(f.nome);
      } else if (f.ativo === false) f.ativo = true;
      if (fl.quadro && !f.quadro) f.quadro = fl.quadro;
      m.folhas[f.id] = { dias: copia(fl.dias), origem: "importado", revisada: false, atualizadoEm: new Date().toISOString(),
        avisos: (fl.avisos || []).slice(), aba: fl.aba };
      res.importadas++;
    });
    m.importacoes = m.importacoes || [];
    m.importacoes.push({ em: new Date().toISOString(), arquivo: opcoes.arquivo || "", folhas: res.importadas, por: opcoes.quem || "" });
    return res;
  }

  // ---------------------------------------------------------------- resumo

  /** Uma linha por funcionário ativo (ou com folha no mês), com os totais calculados. */
  function resumoMes(e, empId, mes) {
    var emp = porId(e.empresas, empId), m = mesDe(e, empId, mes, false);
    var regras = regrasDoMes(emp, m), fer = feriadosDoMes(emp, m), pcts = {};
    var lista = emp.funcionarios.filter(function (f) { return f.ativo !== false || (m && m.folhas[f.id]); })
      .sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    var linhas = lista.map(function (f) {
      var folha = m && m.folhas[f.id];
      var calc = R.calcularMes(folha || { dias: {} }, f, mes, fer, regras);
      Object.keys(calc.totais.extras).forEach(function (p) { pcts[p] = 1; });
      return { func: f, folha: folha || null, status: !folha ? "sem" : folha.revisada ? "revisada" : "importada", calc: calc };
    });
    var geral = { funcionarios: linhas.length, comFolha: 0, revisadas: 0, alertas: 0, extra: 0, extras: {}, noturno: 0, atraso: 0, faltas: 0 };
    linhas.forEach(function (l) {
      if (l.folha) geral.comFolha++;
      if (l.status === "revisada") geral.revisadas++;
      if (l.folha) geral.alertas += l.calc.totais.alertas;
      var t = l.calc.totais;
      if (l.folha) {
        geral.extra += t.extra; geral.noturno += t.noturnoReduzido; geral.atraso += t.atraso; geral.faltas += t.faltas;
        Object.keys(t.extras).forEach(function (p) { geral.extras[p] = (geral.extras[p] || 0) + t.extras[p]; });
      }
    });
    return { empresa: emp, mes: mes, registro: m, regras: regras, feriados: fer, linhas: linhas, geral: geral,
      pcts: Object.keys(pcts).map(Number).sort(function (a, b) { return a - b; }) };
  }

  // ---------------------------------------------------------------- exemplo (nomes fictícios)

  function exemplo(e, hoje) {
    hoje = hoje || new Date();
    var mes = R.somarMes(hoje.getFullYear() + "-" + String(hoje.getMonth() + 1).padStart(2, "0"), -1);
    var emp = e.empresas.filter(function (x) { return x.nome === "Comércio Exemplo Ltda"; })[0];
    if (!emp) {
      emp = salvarEmpresa(e, { nome: "Comércio Exemplo Ltda", cnpj: "00.000.000/0001-00" }, Number(mes.slice(0, 4)));
      emp.exemplo = true;
      [["Ana Exemplo", "Vendedora"], ["Bruno Exemplo", "Estoquista"], ["Carla Exemplo", "Caixa"], ["Diego Exemplo", "Vigia noturno"]].forEach(function (p) {
        salvarFuncionario(emp, { nome: p[0], funcao: p[1], quadro: p[0] === "Diego Exemplo" ? "Seg a sex 22:00-02:00 e 03:00-06:00" : "Seg a sex 09:00-12:30 e 13:30-18:00; sáb 08:30-12:30" });
      });
      var diego = emp.funcionarios[3]; diego.carga = [0, 420, 420, 420, 420, 420, 0];
    }
    var m = mesDe(e, emp.id, mes, true);
    var set = {}; emp.feriados.forEach(function (f) { set[f.data] = 1; });
    emp.funcionarios.forEach(function (f, fi) {
      var dias = {};
      for (var d = 1; d <= R.diasNoMes(mes); d++) {
        var iso = R.dataIso(mes, d), ds = R.diaSemana(iso), v = (d * 7 + fi * 3) % 11;
        if (set[iso]) { dias[d] = { e1: null, s1: null, e2: null, s2: null, oc: "Feriado", obs: "" }; continue; }
        if (!f.carga[ds]) continue;
        if (f.nome === "Diego Exemplo") { dias[d] = { e1: 1320, s1: 120, e2: 180, s2: v === 3 ? 400 : 360, oc: "", obs: "" }; continue; }
        if (ds === 6) { dias[d] = { e1: 510, s1: null, e2: null, s2: v === 2 ? 810 : 750, oc: "", obs: v === 2 ? "Inventário" : "" }; continue; }
        if (fi === 1 && d === 12) { dias[d] = { e1: null, s1: null, e2: null, s2: null, oc: "Atestado", obs: "Atestado de 1 dia" }; continue; }
        if (fi === 2 && d === 19) { dias[d] = { e1: null, s1: null, e2: null, s2: null, oc: "Falta", obs: "" }; continue; }
        var saida = v === 0 ? 1170 : v === 5 ? 1090 : v === 8 ? 1230 : 1080;     // 19:30, 18:10, 20:30, 18:00
        var entrada = v === 4 ? 560 : 540;                                         // 09:20 (atraso) ou 09:00
        dias[d] = { e1: entrada, s1: 750, e2: v === 6 ? 780 : 810, s2: saida, oc: "", obs: "" };
      }
      if (fi === 0) dias[R.diasNoMes(mes)] && (dias[R.diasNoMes(mes)].s2 = null);   // uma marcação esquecida
      m.folhas[f.id] = { dias: dias, origem: "importado", revisada: fi === 1, atualizadoEm: new Date().toISOString(), avisos: [] };
    });
    return { empresa: emp, mes: mes };
  }

  return {
    CARGA_PADRAO: CARGA_PADRAO, uid: uid, porId: porId, estadoVazio: estadoVazio, normalizar: normalizar,
    salvarEmpresa: salvarEmpresa, excluirEmpresa: excluirEmpresa, salvarFuncionario: salvarFuncionario, adicionarVarios: adicionarVarios, ativos: ativos,
    mesDe: mesDe, regrasDoMes: regrasDoMes, feriadosDoMes: feriadosDoMes, folhaDe: folhaDe, atualizarDia: atualizarDia, marcarRevisada: marcarRevisada,
    fecharMes: fecharMes, reabrirMes: reabrirMes, aplicarImportacao: aplicarImportacao, resumoMes: resumoMes, exemplo: exemplo
  };
});
