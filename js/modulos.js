/*
 * modulos.js — ferramentas independentes que abrem dentro da Gestão Financeira.
 *
 * Cada módulo continua sendo um site próprio em modulos/<pasta>/ e abre num quadro
 * (iframe) na área principal. Assim um não interfere no código, no visual nem nos
 * dados do outro. O sistema principal cuida de:
 *   - abrir o módulo (uma vez; ao trocar de tela ele fica como estava);
 *   - aplicar o tema claro/escuro (e esconder o botão de tema do módulo);
 *   - mostrar no menu os vencimentos que pedem atenção (Painel de vencimentos);
 *   - incluir os dados dos módulos no backup (chaves listadas em PREFIXOS_DADOS).
 *
 * Para incluir um módulo novo: copie a pasta para modulos/, acrescente em LISTA,
 * em PREFIXOS_DADOS (se ele guardar dados) e os arquivos dele no sw.js.
 */
(function (root) {
  "use strict";

  var LISTA = [
    { id: "mod-icms", label: "Apuração de ICMS", pasta: "modulos/apuracao-icms/",
      descricao: "Prévia da apuração a partir dos XMLs de NF-e e NFC-e",
      icone: '<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/>',
      botaoTema: "#btnTema", tema: "data-theme", chaveTema: "icms.tema" },
    { id: "mod-ibs-cbs", label: "Auditor IBS/CBS", pasta: "modulos/auditor-ibs-cbs/",
      descricao: "Conferência de CST, base e alíquotas de IBS/CBS (LC 214/2025)",
      icone: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4"/>',
      botaoTema: "#btnTheme", tema: "classe" },
    { id: "mod-vencimentos", label: "Painel de vencimentos", pasta: "modulos/painel-vencimentos/",
      descricao: "Certificados, certidões, alvarás, procurações e licenças dos clientes",
      icone: '<path d="M7 3v3M17 3v3M4 8h16M5 5h14v15H5zM12 12v3l2 1"/>',
      botaoTema: "#btnTema", tema: "classe", chaveDados: "painelVencimentos:v1" }
  ];

  /** Chaves do localStorage que pertencem aos módulos (vão no backup do sistema). */
  var PREFIXOS_DADOS = ["icms.", "painelVencimentos:"];

  function porId(id) { return LISTA.filter(function (m) { return m.id === id; })[0] || null; }
  function ehDadoDeModulo(chave) { return PREFIXOS_DADOS.some(function (p) { return chave.indexOf(p) === 0; }); }

  /** Documentos do painel vencidos ou que vencem em até `dias` dias (para o número no menu). */
  function vencimentosUrgentes(estado, hojeIso, dias) {
    if (!estado || !Array.isArray(estado.documentos)) return 0;
    var hoje = Date.parse(hojeIso + "T00:00:00Z"), lim = hoje + (dias || 7) * 86400000;
    return estado.documentos.filter(function (d) {
      var v = Date.parse(String(d && d.vencimento || "") + "T00:00:00Z");
      return !isNaN(v) && v <= lim;
    }).length;
  }

  // ---------------------------------------------------------------- navegador

  var quadros = {};          // id → iframe
  var temaAtual = "light";

  function hojeIso() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  function aplicarTemaNoQuadro(m, f) {
    var doc;
    try { doc = f.contentDocument; } catch (e) { return; }
    if (!doc || !doc.documentElement) return;
    var escuro = temaAtual === "dark";
    if (m.tema === "data-theme") doc.documentElement.setAttribute("data-theme", escuro ? "dark" : "light");
    else doc.documentElement.classList.toggle("dark", escuro);
    if (m.chaveTema) { try { localStorage.setItem(m.chaveTema, JSON.stringify(escuro ? "dark" : "light")); } catch (e) {} }
  }

  function prepararQuadro(m, f) {
    var doc;
    try { doc = f.contentDocument; } catch (e) { return; }
    if (!doc || !doc.head) return;
    // o tema é do sistema principal: esconde o botão de tema do módulo
    if (!doc.getElementById("gf-embutido")) {
      var st = doc.createElement("style");
      st.id = "gf-embutido";
      st.textContent = m.botaoTema + "{display:none!important}";
      doc.head.appendChild(st);
    }
    aplicarTemaNoQuadro(m, f);
  }

  /** Mostra o módulo dentro de `area` (cria o quadro na primeira vez). */
  function abrir(id, area) {
    var m = porId(id);
    if (!m) return;
    Object.keys(quadros).forEach(function (k) { quadros[k].hidden = k !== id; });
    if (!quadros[id]) {
      var f = document.createElement("iframe");
      f.className = "modulo-frame";
      f.title = m.label;
      f.src = m.pasta;
      f.setAttribute("allow", "fullscreen; clipboard-read; clipboard-write");
      f.addEventListener("load", function () { prepararQuadro(m, f); });
      area.appendChild(f);
      quadros[id] = f;
    }
    ajustarAltura(area);
  }

  function ajustarAltura(area) {
    var topo = document.querySelector(".topbar");
    var h = window.innerHeight - (topo ? topo.offsetHeight : 0);
    area.style.height = Math.max(h, 320) + "px";
  }

  function definirTema(t) {
    temaAtual = t === "dark" ? "dark" : "light";
    LISTA.forEach(function (m) { if (quadros[m.id]) aplicarTemaNoQuadro(m, quadros[m.id]); });
  }

  /** Número que aparece ao lado do módulo no menu (só o Painel de vencimentos tem). */
  function contador(id) {
    var m = porId(id);
    if (!m || !m.chaveDados) return "";
    try {
      var n = vencimentosUrgentes(JSON.parse(localStorage.getItem(m.chaveDados) || "null"), hojeIso(), 7);
      return n || "";
    } catch (e) { return ""; }
  }

  /** Dados dos módulos guardados no navegador (para o backup). */
  function dadosParaBackup() {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (ehDadoDeModulo(k)) out[k] = localStorage.getItem(k);
    }
    return out;
  }

  /** Restaura os dados dos módulos de um backup (substitui os que existem). */
  function restaurarDados(dados) {
    var apagar = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (ehDadoDeModulo(k)) apagar.push(k); }
    apagar.forEach(function (k) { localStorage.removeItem(k); });
    Object.keys(dados || {}).forEach(function (k) { if (ehDadoDeModulo(k)) localStorage.setItem(k, dados[k]); });
  }

  root.Modulos = {
    LISTA: LISTA, PREFIXOS_DADOS: PREFIXOS_DADOS, porId: porId, ehDadoDeModulo: ehDadoDeModulo,
    vencimentosUrgentes: vencimentosUrgentes, abrir: abrir, ajustarAltura: ajustarAltura, definirTema: definirTema,
    contador: contador, dadosParaBackup: dadosParaBackup, restaurarDados: restaurarDados
  };
  if (typeof module === "object" && module.exports) module.exports = root.Modulos;
})(typeof self !== "undefined" ? self : this);
