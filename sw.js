/*
 * sw.js — deixa o sistema instalável e abrindo sem internet.
 *
 * Guarda os arquivos do sistema (não os dados: esses ficam no IndexedDB do navegador).
 * VERSAO usa o mesmo "?v=" do index.html: ao publicar, troque o número em todos os arquivos.
 * Os módulos (pasta modulos/) não usam "?v=": mudou um arquivo de módulo, aumente VERSAO
 * mesmo assim, senão quem já instalou continua com o arquivo antigo.
 * Arquivo novo em módulo: inclua em MODULOS (o teste tests/sw.test.js confere).
 * Versão nova: o navegador baixa este arquivo, instala em segundo plano e o sistema
 * mostra "Nova versão disponível". Ao clicar em Atualizar (ou ao reabrir o app), ela entra.
 */
var VERSAO = "?v=0.12.0";
var CACHE = "gestao-financeira-" + VERSAO.slice(3);
var CACHE_EXTERNO = "gestao-financeira-externo";

var ARQUIVOS = [
  "./",
  "css/style.css" + VERSAO,
  "js/storage.js" + VERSAO, "js/core.js" + VERSAO, "js/integracao.js" + VERSAO, "js/importacao.js" + VERSAO,
  "js/extratos.js" + VERSAO, "js/pdfextrato.js" + VERSAO, "js/conciliacao.js" + VERSAO, "js/nfe.js" + VERSAO,
  "js/modulos.js" + VERSAO, "js/app.js" + VERSAO, "js/pwa.js" + VERSAO,
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/favicon-32.png", "icons/apple-touch-icon.png"
];

// módulos: sem "?v=", guardados pelo nome
var MODULOS = [
  "modulos/apuracao-icms/", "modulos/apuracao-icms/css/style.css",
  "modulos/apuracao-icms/js/tema.js", "modulos/apuracao-icms/js/utils.js", "modulos/apuracao-icms/js/estado.js",
  "modulos/apuracao-icms/js/regras.js", "modulos/apuracao-icms/js/leitor-xml.js", "modulos/apuracao-icms/js/apuracao.js",
  "modulos/apuracao-icms/js/interface.js", "modulos/apuracao-icms/js/exportar.js", "modulos/apuracao-icms/js/exemplo.js",
  "modulos/apuracao-icms/js/app.js",
  "modulos/auditor-ibs-cbs/",
  "modulos/painel-vencimentos/", "modulos/painel-vencimentos/css/style.css",
  "modulos/painel-vencimentos/js/util.js", "modulos/painel-vencimentos/js/dados.js", "modulos/painel-vencimentos/js/telas.js",
  "modulos/painel-vencimentos/js/acoes.js", "modulos/painel-vencimentos/js/app.js",
  "modulos/painel-vencimentos/icons/icon.svg", "modulos/painel-vencimentos/icons/icon-192.png", "modulos/painel-vencimentos/icons/icon-512.png"
];
ARQUIVOS = ARQUIVOS.concat(MODULOS);

// bibliotecas de fora (planilhas, PDF, .zip, fonte): guardadas na primeira vez que forem usadas
var EXTERNOS = ["https://cdnjs.cloudflare.com/", "https://fonts.googleapis.com/", "https://fonts.gstatic.com/",
  "https://cdn.jsdelivr.net/", "https://cdn.tailwindcss.com"];

self.addEventListener("install", function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) {
    // cache: "reload" ignora o cache HTTP, para não guardar arquivo velho
    return Promise.all(ARQUIVOS.map(function (u) {
      return fetch(new Request(u, { cache: "reload" })).then(function (r) {
        if (!r.ok) throw new Error(u + ": " + r.status);
        return c.put(u, r);
      });
    }));
  }));
});

self.addEventListener("activate", function (ev) {
  ev.waitUntil(caches.keys().then(function (nomes) {
    return Promise.all(nomes.filter(function (n) { return n.indexOf("gestao-financeira-") === 0 && n !== CACHE && n !== CACHE_EXTERNO; })
      .map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("message", function (ev) {
  if (ev.data === "atualizar") self.skipWaiting();
  if (ev.data === "versao" && ev.source) ev.source.postMessage({ versao: VERSAO.slice(3) });
});

self.addEventListener("fetch", function (ev) {
  var req = ev.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // páginas (o sistema e cada módulo, que abre num quadro): a versão guardada daquela página;
  // sem ela, a da rede. Nunca devolve a página principal no lugar de outra.
  if (req.mode === "navigate" && url.origin === location.origin) {
    ev.respondWith(caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then(function (r) {
      if (r) return r;
      return fetch(req).catch(function () {
        var raiz = new URL("./", self.registration.scope).pathname;
        if (url.pathname === raiz || url.pathname === raiz + "index.html") return caches.match("./", { cacheName: CACHE });
        throw new Error("sem internet e página não guardada: " + url.pathname);
      });
    }));
    return;
  }

  if (url.origin === location.origin) {
    ev.respondWith(caches.match(req, { cacheName: CACHE }).then(function (r) { return r || fetch(req); }));
    return;
  }

  if (EXTERNOS.some(function (p) { return req.url.indexOf(p) === 0; })) {
    ev.respondWith(caches.open(CACHE_EXTERNO).then(function (c) {
      return c.match(req).then(function (r) {
        return r || fetch(req).then(function (resp) {
          if (resp.ok || resp.type === "opaque") c.put(req, resp.clone());
          return resp;
        });
      });
    }));
  }
});
