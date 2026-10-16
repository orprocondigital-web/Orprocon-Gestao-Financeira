/*
 * suporte.js — botão flutuante "Suporte": a pessoa descreve a dúvida e chama o suporte no WhatsApp,
 * já com a tela em que estava, o usuário e a versão do sistema (assim ninguém precisa explicar onde está).
 *
 * Quem atende e o número ficam em js/config.js (CONFIG.suporte). Sem número, o botão não aparece.
 * mensagem() e linkWhatsApp() não mexem na página: são testadas em tests/suporte.test.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Suporte = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TIPOS = [
    { id: "duvida", nome: "Dúvida", frase: "Tenho uma dúvida" },
    { id: "problema", nome: "Problema", frase: "Encontrei um problema" },
    { id: "sugestao", nome: "Sugestão", frase: "Tenho uma sugestão" }
  ];

  function soNumeros(s) { return String(s || "").replace(/\D/g, ""); }

  /** Texto que vai para o WhatsApp. dados: { tipo, texto, tela, usuario:{nome,email}, versao, sistema, atendente } */
  function mensagem(d) {
    d = d || {};
    var tipo = TIPOS.filter(function (t) { return t.id === d.tipo; })[0] || TIPOS[0];
    var linhas = ["Olá" + (d.atendente ? ", " + d.atendente : "") + "! " + tipo.frase + " no " + (d.sistema || "Gestão Financeira") + "."];
    var texto = String(d.texto || "").trim();
    if (texto) linhas.push("", texto.slice(0, 1500));
    linhas.push("");
    if (d.tela) linhas.push("Tela: " + d.tela);
    if (d.usuario && (d.usuario.nome || d.usuario.email)) linhas.push("Usuário: " + [d.usuario.nome, d.usuario.email].filter(Boolean).join(" · "));
    if (d.versao) linhas.push("Versão: " + d.versao);
    return linhas.join("\n");
  }

  function linkWhatsApp(numero, texto) {
    var n = soNumeros(numero);
    if (!n) return "";
    return "https://wa.me/" + n + (texto ? "?text=" + encodeURIComponent(texto) : "");
  }

  /** (48) 99178-1362 a partir de 5548991781362 */
  function numeroLegivel(numero) {
    var n = soNumeros(numero);
    if (n.length >= 12 && n.indexOf("55") === 0) n = n.slice(2);
    if (n.length === 11) return "(" + n.slice(0, 2) + ") " + n.slice(2, 7) + "-" + n.slice(7);
    if (n.length === 10) return "(" + n.slice(0, 2) + ") " + n.slice(2, 6) + "-" + n.slice(6);
    return n;
  }

  // ---------------------------------------------------------------- tela

  var ICONE_CHAT = '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>';
  var ICONE_FECHAR = '<path d="M6 6l12 12M18 6L6 18"/>';
  var ICONE_ZAP = '<path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L4 20l1.1-3.3A8.5 8.5 0 1 1 20 11.5z"/><path d="M9 8.5c0 3.5 2.5 6.5 6 7l1.2-1.6-2-1-1 .9c-1-.4-2.1-1.5-2.5-2.5l.9-1-1-2z"/>';
  function svg(p, cls) { return '<svg class="ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" aria-hidden="true">' + p + "</svg>"; }
  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /**
   * Põe o botão e o painel na página.
   * opcoes: { config: CONFIG.suporte, contexto: function () { return { tela, usuario, versao } }, toast: function (msg) }
   */
  function iniciar(opcoes) {
    opcoes = opcoes || {};
    var cfg = opcoes.config || {};
    if (!soNumeros(cfg.whatsapp) || typeof document === "undefined" || document.getElementById("suporte-botao")) return null;
    var tipo = "duvida";

    var botao = document.createElement("button");
    botao.type = "button";
    botao.id = "suporte-botao";
    botao.className = "suporte-botao";
    botao.setAttribute("aria-haspopup", "dialog");
    botao.setAttribute("aria-expanded", "false");
    botao.setAttribute("aria-controls", "suporte-painel");
    botao.title = "Suporte: tire uma dúvida ou avise um problema";
    botao.innerHTML = svg(ICONE_CHAT) + '<span class="suporte-botao-texto">Suporte</span>';

    var painel = document.createElement("div");
    painel.id = "suporte-painel";
    painel.className = "suporte-painel";
    painel.setAttribute("role", "dialog");
    painel.setAttribute("aria-labelledby", "suporte-titulo");
    painel.hidden = true;
    painel.innerHTML =
      '<div class="suporte-cab"><div><h2 id="suporte-titulo">Suporte do sistema</h2>' +
      "<p>" + esc(cfg.nome || "Suporte") + (cfg.papel ? " · " + esc(cfg.papel) : "") + "</p></div>" +
      '<button type="button" class="suporte-fechar" aria-label="Fechar">' + svg(ICONE_FECHAR) + "</button></div>" +
      '<p class="suporte-intro">Ficou com dúvida, algo não funcionou ou tem uma ideia? Conte aqui e chame no WhatsApp. ' +
      "A tela em que você está e o seu usuário já vão junto na mensagem.</p>" +
      '<div class="suporte-tipos" role="radiogroup" aria-label="Assunto">' + TIPOS.map(function (t) {
        return '<button type="button" role="radio" data-tipo="' + t.id + '" aria-checked="' + (t.id === tipo) + '">' + t.nome + "</button>";
      }).join("") + "</div>" +
      '<label class="suporte-rotulo" for="suporte-texto">O que aconteceu? <span>(opcional)</span></label>' +
      '<textarea id="suporte-texto" rows="4" maxlength="1500" placeholder="Ex.: ao importar o extrato do Sicoob de setembro aparece a mensagem…"></textarea>' +
      '<button type="button" class="btn suporte-zap" id="suporte-enviar">' + svg(ICONE_ZAP) + "Chamar no WhatsApp</button>" +
      '<div class="suporte-rodape"><span>' + esc(numeroLegivel(cfg.whatsapp)) + '</span>' +
      '<button type="button" class="link-btn" id="suporte-copiar">Copiar a mensagem</button></div>';

    document.body.appendChild(painel);
    document.body.appendChild(botao);
    var texto = painel.querySelector("#suporte-texto");

    function dados() {
      var c = {};
      try { c = (opcoes.contexto && opcoes.contexto()) || {}; } catch (e) {}
      return { tipo: tipo, texto: texto.value, tela: c.tela, usuario: c.usuario, versao: c.versao, sistema: c.sistema, atendente: cfg.nome };
    }
    function abrir(sim) {
      painel.hidden = !sim;
      botao.setAttribute("aria-expanded", sim ? "true" : "false");
      botao.classList.toggle("aberto", sim);
      if (sim) setTimeout(function () { texto.focus(); }, 30);
      else botao.focus();
    }
    botao.addEventListener("click", function () { abrir(painel.hidden); });
    painel.querySelector(".suporte-fechar").addEventListener("click", function () { abrir(false); });
    painel.addEventListener("keydown", function (ev) { if (ev.key === "Escape") abrir(false); });
    document.addEventListener("click", function (ev) {
      if (!painel.hidden && !painel.contains(ev.target) && !botao.contains(ev.target)) abrir(false);
    });
    painel.querySelector(".suporte-tipos").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-tipo]");
      if (!b) return;
      tipo = b.dataset.tipo;
      painel.querySelectorAll("[data-tipo]").forEach(function (x) { x.setAttribute("aria-checked", x === b ? "true" : "false"); });
    });
    painel.querySelector("#suporte-enviar").addEventListener("click", function () {
      // link de verdade (nova aba, sem acesso a esta página): window.open com "noopener" sempre
      // devolve null, e não dá para saber se foi bloqueado
      var a = document.createElement("a");
      a.href = linkWhatsApp(cfg.whatsapp, mensagem(dados()));
      a.target = "_blank"; a.rel = "noopener noreferrer";
      document.body.appendChild(a); a.click(); a.remove();
      texto.value = "";
      abrir(false);
    });
    painel.querySelector("#suporte-copiar").addEventListener("click", function () {
      var m = mensagem(dados());
      var ok = function () { if (opcoes.toast) opcoes.toast("Mensagem copiada. Cole no WhatsApp ou no e-mail."); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m).then(ok, function () { window.prompt("Copie a mensagem:", m); });
      else window.prompt("Copie a mensagem:", m);
    });
    return { abrir: abrir };
  }

  return { TIPOS: TIPOS, mensagem: mensagem, linkWhatsApp: linkWhatsApp, numeroLegivel: numeroLegivel, iniciar: iniciar };
});
