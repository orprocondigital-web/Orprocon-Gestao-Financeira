/*
 * pwa.js — instalar o sistema como aplicativo e avisar quando há versão nova.
 * Independente do resto do sistema: só mexe no botão "Instalar app" e no aviso de atualização.
 */
(function () {
  "use strict";
  var botao = document.getElementById("btn-instalar");
  var pedidoInstalacao = null;

  // botão "Instalar app": só aparece quando o navegador oferece a instalação (Chrome/Edge no PC)
  window.addEventListener("beforeinstallprompt", function (ev) {
    ev.preventDefault();
    pedidoInstalacao = ev;
    if (botao) botao.hidden = false;
  });
  if (botao) botao.addEventListener("click", function () {
    if (!pedidoInstalacao) return;
    pedidoInstalacao.prompt();
    pedidoInstalacao.userChoice.then(function () { pedidoInstalacao = null; botao.hidden = true; });
  });
  window.addEventListener("appinstalled", function () {
    if (botao) botao.hidden = true;
    pedidoInstalacao = null;
  });

  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;

  function avisoEl() { return document.getElementById("aviso-atualizacao"); }

  function mostrarAviso(worker) {
    var aviso = avisoEl();
    if (!aviso) return;
    aviso.hidden = false;
    document.getElementById("btn-atualizar").onclick = function () {
      this.disabled = true; this.textContent = "Atualizando…";
      worker.postMessage("atualizar");
    };
  }

  var recarregando = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (recarregando) return;
    recarregando = true;
    // só recarrega se a pessoa pediu (havia um app aberto controlado por outra versão)
    var aviso = avisoEl();
    if (aviso && !aviso.hidden) location.reload();
  });

  function acompanhar(reg) {
    if (acompanhar.feito) return;
    acompanhar.feito = true;
    function observar(novo) {
      if (!novo) return;
      novo.addEventListener("statechange", function () {
        // instalado e já havia uma versão em uso: avisa (na primeira instalação, não)
        if (novo.state === "installed" && navigator.serviceWorker.controller) mostrarAviso(novo);
      });
    }
    if (reg.waiting && navigator.serviceWorker.controller) mostrarAviso(reg.waiting);
    observar(reg.installing);
    reg.addEventListener("updatefound", function () { observar(reg.installing); });
    // app aberto o dia todo: procura versão nova a cada hora e quando a internet volta
    setInterval(function () { reg.update().catch(function () {}); }, 60 * 60 * 1000);
    window.addEventListener("online", function () { reg.update().catch(function () {}); });
  }

  window.addEventListener("load", function () {
    // sem internet o registro falha, mas o app já instalado continua valendo: acompanha pelo "ready"
    navigator.serviceWorker.register("sw.js").then(acompanhar)
      .catch(function (e) { console.warn("Não foi possível procurar versão nova agora:", e && e.message); });
    navigator.serviceWorker.ready.then(acompanhar);
  });
})();
