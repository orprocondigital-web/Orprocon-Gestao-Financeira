/*
 * auth.js — login, usuários e permissões.
 *
 * FASE ATUAL (só front, para testes): as contas ficam no navegador (IndexedDB, chave
 * "auth:usuarios") e as senhas são guardadas como hash PBKDF2-SHA256 com sal, nunca em texto.
 * Isso organiza as telas e o fluxo, mas NÃO é segurança de verdade: quem tem acesso ao
 * computador consegue contornar. A proteção real vem com o backend.
 *
 * PRÓXIMA FASE (backend Java/Spring): troque criarAuthLocal por um adaptador que chame a API
 * descrita no README (seção "Login e usuários"). As telas usam só os métodos do objeto
 * devolvido (todos devolvem Promise), então não precisam mudar.
 *
 * Testado em tests/auth.test.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AuthCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ADMIN_EMAIL = "orprocondigital@gmail.com";
  var CHAVE_USUARIOS = "auth:usuarios";
  var CHAVE_SESSAO = "gf.sessao";
  var ITERACOES = 150000;
  var HORAS_SESSAO = 12;
  var MAX_TENTATIVAS = 5, ESPERA_MS = 30000;

  /** Áreas do sistema que um usuário pode acessar (o admin acessa todas). */
  var AREAS = [
    { id: "integracao", nome: "Integração contábil", detalhe: "Master, bancos, unidades, movimentos e cadastros" },
    { id: "conciliacao", nome: "Conciliação", detalhe: "Extrato × sistema e extrato × planilha" },
    { id: "mod-icms", nome: "Apuração de ICMS", detalhe: "" },
    { id: "mod-ibs-cbs", nome: "Auditor IBS/CBS", detalhe: "" },
    { id: "mod-vencimentos", nome: "Painel de vencimentos", detalhe: "" }
  ];
  var IDS_AREAS = AREAS.map(function (a) { return a.id; });

  function erro(codigo, mensagem) { var e = new Error(mensagem); e.codigo = codigo; return e; }
  function normEmail(s) { return String(s || "").trim().toLowerCase(); }
  function emailValido(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail(s)); }

  /** Senha: 8+ caracteres, com letra e número. Devolve a mensagem do problema, ou "". */
  function problemaSenha(s) {
    s = String(s || "");
    if (s.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
    if (!/[A-Za-zÀ-ú]/.test(s) || !/\d/.test(s)) return "A senha precisa ter letras e números.";
    return "";
  }

  /** Senha provisória fácil de ditar: Xxxx-0000-xxxx (sem letras que se confundem). */
  function senhaProvisoria(aleatorio) {
    var L = "abcdefghjkmnpqrstuvwxyz", N = "23456789";
    var r = aleatorio || function (n) { var a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0] % n; };
    var p = function (conj, n) { var s = ""; for (var i = 0; i < n; i++) s += conj[r(conj.length)]; return s; };
    var a = p(L, 4);
    return a.charAt(0).toUpperCase() + a.slice(1) + "-" + p(N, 4) + "-" + p(L, 4);
  }

  // ---------------------------------------------------------------- hash

  function b64(buf) {
    var bytes = new Uint8Array(buf), s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64");
  }
  function deB64(t) {
    var s = typeof atob === "function" ? atob(t) : Buffer.from(t, "base64").toString("binary");
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function cripto() {
    var c = globalThis.crypto;
    if (!c || !c.subtle) throw erro("sem-cripto", "Este navegador não permite o login aqui. Abra o sistema pelo link (https), não pelo arquivo do computador.");
    return c;
  }

  function derivar(senha, sal, iteracoes) {
    var c = cripto();
    return c.subtle.importKey("raw", new TextEncoder().encode(String(senha)), "PBKDF2", false, ["deriveBits"])
      .then(function (chave) {
        return c.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteracoes }, chave, 256);
      });
  }

  function gerarHash(senha) {
    var sal = new Uint8Array(16);
    cripto().getRandomValues(sal);
    return derivar(senha, sal, ITERACOES).then(function (bits) {
      return { alg: "PBKDF2-SHA256", iter: ITERACOES, sal: b64(sal), hash: b64(bits) };
    });
  }

  function conferirHash(senha, h) {
    if (!h || !h.sal || !h.hash) return Promise.resolve(false);
    return derivar(senha, deB64(h.sal), h.iter || ITERACOES).then(function (bits) {
      var a = b64(bits), b = h.hash, dif = a.length ^ b.length;
      for (var i = 0; i < Math.min(a.length, b.length); i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
      return dif === 0;
    });
  }

  // ---------------------------------------------------------------- usuários

  /** Usuário sem os dados de senha (o que as telas recebem). */
  function publico(u) {
    if (!u) return null;
    return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, areas: u.perfil === "admin" ? IDS_AREAS.slice() : (u.areas || []).slice(),
      ativo: u.ativo !== false, trocarSenha: !!u.trocarSenha, criadoEm: u.criadoEm, atualizadoEm: u.atualizadoEm, ultimoAcesso: u.ultimoAcesso || "" };
  }

  function podeAcessar(usuario, area) {
    if (!usuario) return false;
    if (usuario.perfil === "admin") return true;
    return (usuario.areas || []).indexOf(area) > -1;
  }

  /**
   * Adaptador local. armazenamento: { get(chave), set(chave, valor) } (o Store do sistema).
   * sessao: { getItem, setItem, removeItem } (localStorage). agora: função de data (para testes).
   */
  function criarAuthLocal(armazenamento, sessao, opcoes) {
    opcoes = opcoes || {};
    var agora = opcoes.agora || function () { return new Date(); };
    var tentativas = {};

    function lista() { return (armazenamento.get(CHAVE_USUARIOS) || []).slice(); }
    function gravar(l) { return Promise.resolve(armazenamento.set(CHAVE_USUARIOS, l)); }
    function porEmail(l, email) { var e = normEmail(email); return l.filter(function (u) { return u.email === e; })[0]; }
    function porId(l, id) { return l.filter(function (u) { return u.id === id; })[0]; }
    function iso() { return agora().toISOString(); }
    function novoId() { return "u" + agora().getTime().toString(36) + Math.random().toString(36).slice(2, 7); }
    function adminsAtivos(l) { return l.filter(function (u) { return u.perfil === "admin" && u.ativo !== false; }); }

    function lerSessao() {
      try {
        var s = JSON.parse(sessao.getItem(CHAVE_SESSAO) || "null");
        if (!s || !s.usuarioId || Date.parse(s.expira) <= agora().getTime()) return null;
        return s;
      } catch (e) { return null; }
    }
    function gravarSessao(u) {
      var expira = new Date(agora().getTime() + HORAS_SESSAO * 3600000).toISOString();
      var s = { usuarioId: u.id, nome: u.nome, email: u.email, perfil: u.perfil, areas: publico(u).areas, expira: expira };
      sessao.setItem(CHAVE_SESSAO, JSON.stringify(s));
      return s;
    }

    function exigirAdmin() {
      var s = lerSessao(), u = s && porId(lista(), s.usuarioId);
      if (!u || u.ativo === false || u.perfil !== "admin") return Promise.reject(erro("sem-permissao", "Só o administrador pode fazer isso."));
      return Promise.resolve(u);
    }

    var api = {
      modo: "local",
      ADMIN_EMAIL: ADMIN_EMAIL,

      /** Ainda não há nenhuma conta neste navegador: mostrar o primeiro acesso. */
      precisaConfigurar: function () { return Promise.resolve(lista().length === 0); },

      /** Primeiro acesso: cria o administrador principal (só quando não existe nenhuma conta). */
      configurarAdmin: function (nome, senha) {
        if (lista().length) return Promise.reject(erro("ja-configurado", "O administrador já foi criado."));
        var p = problemaSenha(senha);
        if (p) return Promise.reject(erro("senha-fraca", p));
        return gerarHash(senha).then(function (h) {
          var u = { id: novoId(), nome: String(nome || "").trim() || "Administrador", email: ADMIN_EMAIL, perfil: "admin", areas: [],
            ativo: true, trocarSenha: false, senha: h, criadoEm: iso(), atualizadoEm: iso() };
          return gravar([u]).then(function () { return publico(u); });
        });
      },

      entrar: function (email, senha) {
        var e = normEmail(email), t = tentativas[e];
        if (t && t.n >= MAX_TENTATIVAS && agora().getTime() - t.ultima < ESPERA_MS) {
          var seg = Math.ceil((ESPERA_MS - (agora().getTime() - t.ultima)) / 1000);
          return Promise.reject(erro("bloqueado", "Muitas tentativas. Aguarde " + seg + " segundos e tente de novo."));
        }
        var l = lista(), u = porEmail(l, e);
        var falhou = function () {
          tentativas[e] = { n: (t && agora().getTime() - t.ultima < ESPERA_MS ? t.n : 0) + 1, ultima: agora().getTime() };
          return Promise.reject(erro("credenciais", "E-mail ou senha incorretos."));
        };
        if (!u) return falhou();
        return conferirHash(senha, u.senha).then(function (ok) {
          if (!ok) return falhou();
          if (u.ativo === false) return Promise.reject(erro("inativo", "Este acesso está desativado. Fale com o administrador."));
          delete tentativas[e];
          u.ultimoAcesso = iso();
          return gravar(l).then(function () { gravarSessao(u); return publico(u); });
        });
      },

      sair: function () { sessao.removeItem(CHAVE_SESSAO); return Promise.resolve(); },

      /** Usuário logado (confere se a conta ainda existe e está ativa); null se não houver. */
      usuarioAtual: function () {
        var s = lerSessao();
        if (!s) return Promise.resolve(null);
        var u = porId(lista(), s.usuarioId);
        if (!u || u.ativo === false) { sessao.removeItem(CHAVE_SESSAO); return Promise.resolve(null); }
        gravarSessao(u);   // renova a validade e as permissões
        return Promise.resolve(publico(u));
      },

      trocarSenha: function (senhaAtual, novaSenha) {
        var s = lerSessao(), l = lista(), u = s && porId(l, s.usuarioId);
        if (!u) return Promise.reject(erro("sem-sessao", "Entre de novo para trocar a senha."));
        var p = problemaSenha(novaSenha);
        if (p) return Promise.reject(erro("senha-fraca", p));
        return conferirHash(senhaAtual, u.senha).then(function (ok) {
          if (!ok) return Promise.reject(erro("credenciais", "A senha atual não confere."));
          if (senhaAtual === novaSenha) return Promise.reject(erro("senha-igual", "A nova senha precisa ser diferente da atual."));
          return gerarHash(novaSenha).then(function (h) {
            u.senha = h; u.trocarSenha = false; u.atualizadoEm = iso();
            return gravar(l).then(function () { return publico(u); });
          });
        });
      },

      // ------------------------------------------------ administração

      listarUsuarios: function () {
        return exigirAdmin().then(function () {
          return lista().map(publico).sort(function (a, b) { return (b.perfil === "admin") - (a.perfil === "admin") || a.nome.localeCompare(b.nome); });
        });
      },

      /** Cria o usuário com senha provisória (devolvida uma única vez, para mandar à pessoa). */
      criarUsuario: function (dados) {
        return exigirAdmin().then(function () {
          var l = lista(), email = normEmail(dados.email), nome = String(dados.nome || "").trim();
          if (!nome) throw erro("dados", "Informe o nome.");
          if (!emailValido(email)) throw erro("dados", "E-mail inválido.");
          if (porEmail(l, email)) throw erro("duplicado", "Já existe um usuário com este e-mail.");
          var perfil = dados.perfil === "admin" ? "admin" : "usuario";
          var areas = (dados.areas || []).filter(function (a) { return IDS_AREAS.indexOf(a) > -1; });
          if (perfil === "usuario" && !areas.length) throw erro("dados", "Marque pelo menos uma área que a pessoa pode acessar.");
          var provisoria = dados.senhaProvisoria || senhaProvisoria();
          return gerarHash(provisoria).then(function (h) {
            var u = { id: novoId(), nome: nome, email: email, perfil: perfil, areas: areas, ativo: true, trocarSenha: true,
              senha: h, criadoEm: iso(), atualizadoEm: iso() };
            l.push(u);
            return gravar(l).then(function () { return { usuario: publico(u), senhaProvisoria: provisoria }; });
          });
        });
      },

      atualizarUsuario: function (id, dados) {
        return exigirAdmin().then(function (eu) {
          var l = lista(), u = porId(l, id);
          if (!u) throw erro("nao-encontrado", "Usuário não encontrado.");
          var perfil = dados.perfil === "admin" ? "admin" : (dados.perfil === "usuario" ? "usuario" : u.perfil);
          var ativo = dados.ativo === undefined ? u.ativo !== false : !!dados.ativo;
          var areas = dados.areas ? dados.areas.filter(function (a) { return IDS_AREAS.indexOf(a) > -1; }) : (u.areas || []);
          if (u.id === eu.id && (perfil !== "admin" || !ativo)) throw erro("proprio", "Você não pode tirar o seu próprio acesso de administrador.");
          if (u.perfil === "admin" && (perfil !== "admin" || !ativo) && adminsAtivos(l).length <= 1) throw erro("ultimo-admin", "Precisa existir pelo menos um administrador ativo.");
          if (perfil === "usuario" && !areas.length) throw erro("dados", "Marque pelo menos uma área que a pessoa pode acessar.");
          if (dados.nome !== undefined) { var n = String(dados.nome).trim(); if (!n) throw erro("dados", "Informe o nome."); u.nome = n; }
          if (dados.email !== undefined && normEmail(dados.email) !== u.email) {
            if (u.email === ADMIN_EMAIL) throw erro("dados", "O e-mail do administrador principal não pode ser alterado.");
            if (!emailValido(dados.email)) throw erro("dados", "E-mail inválido.");
            if (porEmail(l, dados.email)) throw erro("duplicado", "Já existe um usuário com este e-mail.");
            u.email = normEmail(dados.email);
          }
          u.perfil = perfil; u.areas = areas; u.ativo = ativo; u.atualizadoEm = iso();
          return gravar(l).then(function () { return publico(u); });
        });
      },

      /** Nova senha provisória (a pessoa troca no próximo acesso). */
      redefinirSenha: function (id) {
        return exigirAdmin().then(function () {
          var l = lista(), u = porId(l, id);
          if (!u) throw erro("nao-encontrado", "Usuário não encontrado.");
          var provisoria = senhaProvisoria();
          return gerarHash(provisoria).then(function (h) {
            u.senha = h; u.trocarSenha = true; u.atualizadoEm = iso();
            return gravar(l).then(function () { return { usuario: publico(u), senhaProvisoria: provisoria }; });
          });
        });
      },

      excluirUsuario: function (id) {
        return exigirAdmin().then(function (eu) {
          var l = lista(), u = porId(l, id);
          if (!u) throw erro("nao-encontrado", "Usuário não encontrado.");
          if (u.id === eu.id) throw erro("proprio", "Você não pode excluir o seu próprio acesso.");
          if (u.perfil === "admin" && adminsAtivos(l).length <= 1 && u.ativo !== false) throw erro("ultimo-admin", "Precisa existir pelo menos um administrador ativo.");
          return gravar(l.filter(function (x) { return x.id !== id; }));
        });
      },

      // ------------------------------------------------ só nesta fase (sem backend)

      /** Arquivo com as contas (senhas em hash) para levar a outro computador. */
      exportarAcessos: function () {
        return exigirAdmin().then(function () {
          return { app: "gestao-financeira", tipo: "acessos", geradoEm: iso(), usuarios: lista() };
        });
      },

      /**
       * Junta as contas do arquivo às deste navegador (pelo e-mail; a mais recente vale).
       * Sem nenhuma conta aqui, qualquer um pode importar (é o primeiro acesso); com contas, só o admin.
       */
      importarAcessos: function (arquivo) {
        var vazio = lista().length === 0;
        var permitido = vazio ? Promise.resolve() : exigirAdmin();
        return permitido.then(function () {
          if (!arquivo || arquivo.app !== "gestao-financeira" || arquivo.tipo !== "acessos" || !Array.isArray(arquivo.usuarios)) {
            throw erro("arquivo", "Este não é um arquivo de acessos do sistema.");
          }
          var l = lista(), novos = 0, atualizados = 0;
          arquivo.usuarios.forEach(function (v) {
            if (!v || !v.id || !emailValido(v.email) || !v.senha || !v.senha.hash) return;
            var atual = porEmail(l, v.email);
            if (!atual) { l.push(v); novos++; }
            else if (String(v.atualizadoEm || "") > String(atual.atualizadoEm || "")) { l[l.indexOf(atual)] = v; atualizados++; }
          });
          if (!adminsAtivos(l).length) throw erro("arquivo", "O arquivo não tem nenhum administrador ativo.");
          return gravar(l).then(function () { return { novos: novos, atualizados: atualizados }; });
        });
      }
    };
    return api;
  }

  /** Sessão válida no localStorage? (usado antes de desenhar a página, sem esperar o IndexedDB) */
  function temSessao(ls, agoraMs) {
    try {
      var s = JSON.parse(ls.getItem(CHAVE_SESSAO) || "null");
      return !!(s && s.usuarioId && Date.parse(s.expira) > (agoraMs || Date.now()));
    } catch (e) { return false; }
  }

  return {
    ADMIN_EMAIL: ADMIN_EMAIL, AREAS: AREAS, CHAVE_USUARIOS: CHAVE_USUARIOS, CHAVE_SESSAO: CHAVE_SESSAO,
    problemaSenha: problemaSenha, senhaProvisoria: senhaProvisoria, gerarHash: gerarHash, conferirHash: conferirHash,
    podeAcessar: podeAcessar, criarAuthLocal: criarAuthLocal, temSessao: temSessao, emailValido: emailValido
  };
});
