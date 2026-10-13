/*
 * api.js — conversa com o servidor (API Java). Um lugar só para:
 *   - montar o endereço (CONFIG.apiUrl + caminho);
 *   - mandar o token de login no cabeçalho Authorization;
 *   - transformar a resposta de erro da API ({erro, mensagem}) num Error com .codigo e .status;
 *   - avisar quando a sessão acabou (401) e quando não deu para falar com o servidor.
 *
 * Testado em tests/api.test.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ApiCliente = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MENSAGEM_PADRAO = {
    400: "Os dados enviados não foram aceitos.",
    401: "A sessão terminou. Entre de novo.",
    403: "Você não tem permissão para isso.",
    404: "Não encontrado.",
    409: "Já existe um registro com esses dados.",
    423: "Acesso bloqueado por alguns segundos. Tente de novo.",
    500: "Erro no servidor. Tente de novo; se continuar, avise o suporte."
  };

  function erro(codigo, mensagem, status) {
    var e = new Error(mensagem);
    e.codigo = codigo;
    e.status = status || 0;
    return e;
  }

  /** Endereço da API válido para usar no navegador (https, ou http só no próprio computador). */
  function enderecoValido(url) {
    return /^https:\/\/[^\s/]+(\/[^\s]*)?$/i.test(url || "") ||
           /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(url || "");
  }

  /**
   * base: endereço da API (ex.: "https://api.exemplo.com.br").
   * opcoes.token(): devolve o token da sessão (ou vazio).
   * opcoes.semSessao(): chamado quando a API responde 401 a um pedido que levou token.
   * opcoes.fetch: para os testes.
   */
  function criar(base, opcoes) {
    opcoes = opcoes || {};
    var raiz = String(base || "").replace(/\/+$/, "");
    var buscar = opcoes.fetch || function (u, i) { return fetch(u, i); };

    function chamar(metodo, caminho, corpo) {
      var cabecalhos = { "Accept": "application/json" };
      var token = opcoes.token ? opcoes.token() : "";
      if (token) cabecalhos.Authorization = "Bearer " + token;
      var init = { method: metodo, headers: cabecalhos };
      if (corpo !== undefined) {
        cabecalhos["Content-Type"] = "application/json";
        init.body = JSON.stringify(corpo);
      }
      return Promise.resolve()
        .then(function () { return buscar(raiz + caminho, init); })
        .catch(function () {
          throw erro("sem-conexao", "Não consegui falar com o servidor. Confira a internet ou se o servidor está no ar.");
        })
        .then(function (r) {
          return r.text().then(function (texto) {
            var dado = null;
            try { dado = texto ? JSON.parse(texto) : null; } catch (e) { dado = null; }
            if (r.ok) return dado;
            if (r.status === 401 && token && opcoes.semSessao) opcoes.semSessao();
            var codigo = (dado && dado.erro) || "http-" + r.status;
            var mensagem = (dado && dado.mensagem) || MENSAGEM_PADRAO[r.status] || MENSAGEM_PADRAO[500];
            throw erro(codigo, mensagem, r.status);
          });
        });
    }

    return {
      base: raiz,
      get: function (caminho) { return chamar("GET", caminho); },
      post: function (caminho, corpo) { return chamar("POST", caminho, corpo); },
      put: function (caminho, corpo) { return chamar("PUT", caminho, corpo); },
      del: function (caminho) { return chamar("DELETE", caminho); }
    };
  }

  return { criar: criar, erro: erro, enderecoValido: enderecoValido };
});
