/*
 * storage.js — onde os dados ficam no navegador.
 *
 * Usa IndexedDB (centenas de MB) em vez de localStorage (5 MB), porque só o
 * cadastro de clientes passa de 18 MB. Tudo é carregado para a memória na
 * abertura, então a leitura é imediata; a gravação vai para o disco em segundo plano.
 *
 * Migra automaticamente, uma única vez:
 *   - localStorage "lancamentos:*" (versões até 0.2);
 *   - o banco "localforage" usado na versão de testes do Heliton.
 */
var Store = (function () {
  "use strict";
  var DB_NOME = "gestao-financeira", OBJ = "kv";
  var db = null, cache = {}, pendentes = 0, falhou = false;

  function abrir(nome, versao, upgrade) {
    return new Promise(function (ok, erro) {
      var req = versao ? indexedDB.open(nome, versao) : indexedDB.open(nome);
      if (upgrade) req.onupgradeneeded = function () { upgrade(req.result); };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { erro(req.error); };
    });
  }

  /** Lê o banco inteiro (ou só as chaves que começam com `prefixo`) de uma vez. */
  function lerTudo(banco, store, prefixo) {
    return new Promise(function (ok, erro) {
      var os = banco.transaction(store, "readonly").objectStore(store);
      var faixa = prefixo ? IDBKeyRange.bound(prefixo, prefixo + "\uffff") : undefined;
      if (os.getAll && os.getAllKeys) {
        // getAll/getAllKeys: duas leituras em bloco, bem mais rápido que percorrer item a item
        var chaves = null, valores = null;
        var pronto = function () {
          if (!chaves || !valores) return;
          var dados = {};
          for (var i = 0; i < chaves.length; i++) dados[chaves[i]] = valores[i];
          ok(dados);
        };
        var rk = os.getAllKeys(faixa), rv = os.getAll(faixa);
        rk.onsuccess = function () { chaves = rk.result; pronto(); };
        rv.onsuccess = function () { valores = rv.result; pronto(); };
        rk.onerror = rv.onerror = function (e) { erro(e.target.error); };
        return;
      }
      var dados = {};
      var req = os.openCursor(faixa);
      req.onsuccess = function (e) {
        var c = e.target.result;
        if (c) { dados[c.key] = c.value; c.continue(); } else ok(dados);
      };
      req.onerror = function () { erro(req.error); };
    });
  }

  function gravar(chave, valor) {
    if (!db) return Promise.resolve(false);
    pendentes++;
    return new Promise(function (ok) {
      var tx = db.transaction(OBJ, "readwrite");
      if (valor === undefined) tx.objectStore(OBJ).delete(chave);
      else tx.objectStore(OBJ).put(valor, chave);
      tx.oncomplete = function () { pendentes--; ok(true); };
      tx.onerror = tx.onabort = function () {
        pendentes--; falhou = true;
        console.error("Falha ao gravar", chave, tx.error);
        ok(false);
      };
    });
  }

  function migrarLocalStorage() {
    var chaves = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf("lancamentos:") === 0) chaves.push(k);
    }
    return Promise.all(chaves.map(function (k) {
      if (cache[k] !== undefined) { localStorage.removeItem(k); return null; }
      var bruto = localStorage.getItem(k);
      if (!bruto || bruto.charAt(0) !== "[") return null; // formato comprimido não é mais suportado
      try {
        cache[k] = JSON.parse(bruto);
        return gravar(k, cache[k]).then(function (ok) { if (ok) localStorage.removeItem(k); });
      } catch (e) { return null; }
    }));
  }

  function migrarLocalforage() {
    if (!indexedDB.databases) return Promise.resolve();
    return indexedDB.databases().then(function (lista) {
      if (!lista.some(function (d) { return d.name === "localforage"; })) return;
      return abrir("localforage").then(function (lf) {
        if (!lf.objectStoreNames.contains("keyvaluepairs")) { lf.close(); return; }
        return lerTudo(lf, "keyvaluepairs").then(function (dados) {
          lf.close();
          return Promise.all(Object.keys(dados).map(function (k) {
            if (k.indexOf("lancamentos:") !== 0 || cache[k] !== undefined) return null;
            cache[k] = dados[k];
            return gravar(k, dados[k]);
          }));
        });
      });
    }).catch(function (e) { console.warn("Migração localforage ignorada:", e); });
  }

  /**
   * Abre o banco e carrega os dados para a memória.
   * opcoes.prefixo: carrega só essas chaves (a tela de login só precisa de "auth:",
   * não dos lançamentos de todos os meses).
   */
  function init(opcoes) {
    var prefixo = opcoes && opcoes.prefixo;
    if (!window.indexedDB) return Promise.resolve(false);
    return abrir(DB_NOME, 1, function (b) { b.createObjectStore(OBJ); })
      .then(function (b) { db = b; return lerTudo(db, OBJ, prefixo); })
      .then(function (dados) {
        cache = dados;
        if (prefixo) return;
        return migrarLocalStorage().then(migrarLocalforage);
      })
      .then(function () {
        if (!prefixo && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
        return true;
      })
      .catch(function (e) { console.error("IndexedDB indisponível:", e); db = null; return false; });
  }

  return {
    init: init,
    get: function (k) { return cache[k]; },
    set: function (k, v) { cache[k] = v; return gravar(k, v); },
    remove: function (k) { delete cache[k]; return gravar(k, undefined); },
    keys: function () { return Object.keys(cache); },
    disponivel: function () { return !!db; },
    teveFalha: function () { return falhou; },
    gravando: function () { return pendentes > 0; }
  };
})();
