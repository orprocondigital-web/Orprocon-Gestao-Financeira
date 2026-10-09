/*
 * login.js — tela de login: entrar, primeiro acesso do admin, importar acessos e
 * trocar a senha provisória. Depois de entrar, vai para o sistema (index.html).
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var auth = null;
  var senhaDigitada = "";

  function toast(msg) {
    var t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._h); toast._h = setTimeout(function () { t.classList.remove("show"); }, 3200);
  }

  function mostrar(id) {
    ["carregando", "form-entrar", "form-configurar", "form-trocar"].forEach(function (f) { $(f).hidden = f !== id; });
    var foco = { "form-entrar": "entrar-email", "form-configurar": "cfg-nome", "form-trocar": "trocar-senha" }[id];
    if (foco) setTimeout(function () { var el = $(foco); if (el && !el.value) el.focus(); else if (id === "form-entrar") $("entrar-senha").focus(); }, 30);
  }

  function erro(id, msg) { $(id).textContent = msg || ""; }
  function ocupado(form, sim) {
    var b = form.querySelector("button[type=submit]");
    b.disabled = sim;
    if (sim) { b.dataset.texto = b.textContent; b.textContent = "Aguarde…"; }
    else if (b.dataset.texto) b.textContent = b.dataset.texto;
  }

  function irParaSistema() {
    var volta = new URLSearchParams(location.search).get("volta");
    location.replace(volta && /^[a-z0-9-]*$/i.test(volta) ? "index.html#" + volta : "index.html");
  }

  function depoisDeEntrar(u) {
    if (u.trocarSenha) { mostrar("form-trocar"); return; }
    irParaSistema();
  }

  // ---------------------------------------------------------------- ações

  $("form-entrar").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = this; erro("entrar-erro", "");
    var email = $("entrar-email").value, senha = $("entrar-senha").value;
    if (!email || !senha) { erro("entrar-erro", "Informe o e-mail e a senha."); return; }
    ocupado(f, true);
    auth.entrar(email, senha).then(function (u) {
      senhaDigitada = senha;
      try { localStorage.setItem("gf.ultimoEmail", email.trim().toLowerCase()); } catch (e) {}
      depoisDeEntrar(u);
    }).catch(function (e) {
      erro("entrar-erro", e.message);
      $("entrar-senha").select();
    }).then(function () { ocupado(f, false); });
  });

  $("form-configurar").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = this; erro("cfg-erro", "");
    var nome = $("cfg-nome").value.trim(), s1 = $("cfg-senha").value, s2 = $("cfg-senha2").value;
    if (!nome) { erro("cfg-erro", "Informe o seu nome."); return; }
    var p = AuthCore.problemaSenha(s1);
    if (p) { erro("cfg-erro", p); return; }
    if (s1 !== s2) { erro("cfg-erro", "As duas senhas não são iguais."); return; }
    ocupado(f, true);
    auth.configurarAdmin(nome, s1).then(function () { return auth.entrar(AuthCore.ADMIN_EMAIL, s1); })
      .then(depoisDeEntrar)
      .catch(function (e) { erro("cfg-erro", e.message); })
      .then(function () { ocupado(f, false); });
  });

  $("form-trocar").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = this; erro("trocar-erro", "");
    var s1 = $("trocar-senha").value, s2 = $("trocar-senha2").value;
    var p = AuthCore.problemaSenha(s1);
    if (p) { erro("trocar-erro", p); return; }
    if (s1 !== s2) { erro("trocar-erro", "As duas senhas não são iguais."); return; }
    if (!senhaDigitada) { auth.sair().then(function () { mostrar("form-entrar"); erro("entrar-erro", "Entre de novo com a senha provisória para criar a sua."); }); return; }
    ocupado(f, true);
    auth.trocarSenha(senhaDigitada, s1).then(function () {
      senhaDigitada = "";
      toast("Senha criada.");
      irParaSistema();
    }).catch(function (e) { erro("trocar-erro", e.message); })
      .then(function () { ocupado(f, false); });
  });

  // importar o arquivo de acessos (fase sem servidor)
  Array.prototype.forEach.call(document.querySelectorAll("[data-importar]"), function (b) {
    b.addEventListener("click", function () { $("file-acessos").click(); });
  });
  $("file-acessos").addEventListener("change", function (ev) {
    var file = ev.target.files && ev.target.files[0];
    this.value = "";
    if (!file) return;
    file.text().then(function (t) {
      var dados;
      try { dados = JSON.parse(t); } catch (e) { throw new Error("Este arquivo não é um arquivo de acessos do sistema."); }
      return auth.importarAcessos(dados);
    }).then(function (r) {
      toast("Acessos importados (" + (r.novos + r.atualizados) + "). Agora entre com o seu e-mail e senha.");
      mostrar("form-entrar");
    }).catch(function (e) {
      var alvo = $("form-configurar").hidden ? "entrar-erro" : "cfg-erro";
      erro(alvo, e.message);
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll(".ver-senha"), function (b) {
    b.addEventListener("click", function () {
      var inp = $(b.dataset.alvo), ver = inp.type === "password";
      inp.type = ver ? "text" : "password";
      b.textContent = ver ? "Ocultar" : "Mostrar";
      b.setAttribute("aria-label", ver ? "Ocultar senha" : "Mostrar senha");
    });
  });

  // ---------------------------------------------------------------- início

  if (!(window.crypto && window.crypto.subtle)) {
    $("carregando").hidden = true;
    var eg = $("erro-geral");
    eg.hidden = false;
    eg.textContent = "O login precisa que o sistema seja aberto pelo link (https), não pelo arquivo do computador.";
    return;
  }

  Store.init().then(function (ok) {
    if (!ok) throw new Error("Este navegador não permite guardar dados. Verifique se não está numa janela anônima.");
    auth = AuthCore.criarAuthLocal(Store, localStorage);
    $("cfg-email").value = AuthCore.ADMIN_EMAIL;
    try { $("entrar-email").value = localStorage.getItem("gf.ultimoEmail") || ""; } catch (e) {}
    var params = new URLSearchParams(location.search);
    var saiu = params.has("sair") ? auth.sair() : Promise.resolve();
    return saiu.then(function () { return auth.precisaConfigurar(); }).then(function (vazio) {
      if (vazio) { mostrar("form-configurar"); return; }
      return auth.usuarioAtual().then(function (u) {
        if (u && !u.trocarSenha) { irParaSistema(); return; }
        if (u && u.trocarSenha) auth.sair();
        mostrar("form-entrar");
        if (params.has("sair")) toast("Você saiu do sistema.");
        if (params.has("expirou")) erro("entrar-erro", "A sessão terminou. Entre de novo.");
      });
    });
  }).catch(function (e) {
    $("carregando").hidden = true;
    var eg = $("erro-geral"); eg.hidden = false; eg.textContent = e.message;
  });
})();
