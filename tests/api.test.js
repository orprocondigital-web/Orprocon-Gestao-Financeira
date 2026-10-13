// Login pelo servidor (criarAuthApi + api.js), com um servidor falso que segue o contrato do README.
// Senhas de teste são fictícias.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const ApiCliente = require("../js/api.js");
const A = require("../js/auth.js");

const ADMIN = "orprocondigital@gmail.com";
const SENHA = "TesteAdmin123";

/** Servidor falso: guarda usuários e sessões em memória e responde como a API Java. */
function servidorFalso() {
  const usuarios = [], sessoes = {}, chamadas = [];
  let seq = 0;
  const publico = (u) => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil,
    areas: u.perfil === "admin" ? A.AREAS.map((a) => a.id) : u.areas, ativo: u.ativo, trocarSenha: u.trocarSenha,
    criadoEm: "2026-10-13T12:00:00Z", atualizadoEm: "2026-10-13T12:00:00Z", ultimoAcesso: "", principal: u.email === ADMIN });
  const resp = (status, corpo) => ({ ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(corpo === undefined ? "" : JSON.stringify(corpo)) });
  const falha = (status, erro, mensagem) => resp(status, { erro, mensagem });

  async function fetch(url, init) {
    const caminho = url.replace("http://api.teste", "");
    const corpo = init.body ? JSON.parse(init.body) : undefined;
    chamadas.push({ metodo: init.method, caminho, auth: init.headers.Authorization || "" });
    const token = (init.headers.Authorization || "").replace("Bearer ", "");
    const eu = sessoes[token] && usuarios.find((u) => u.id === sessoes[token]);

    if (caminho === "/api/setup" && init.method === "GET") return resp(200, { precisaConfigurar: usuarios.length === 0 });
    if (caminho === "/api/setup") {
      if (usuarios.length) return falha(409, "ja-configurado", "O administrador já foi criado.");
      const u = { id: "u" + ++seq, nome: corpo.nome, email: ADMIN, perfil: "admin", areas: [], ativo: true, trocarSenha: false, senha: corpo.senha };
      usuarios.push(u);
      return resp(201, publico(u));
    }
    if (caminho === "/api/auth/login") {
      const u = usuarios.find((x) => x.email === corpo.email);
      if (!u || u.senha !== corpo.senha) return falha(401, "credenciais", "E-mail ou senha incorretos.");
      if (!u.ativo) return falha(403, "inativo", "Este acesso está desativado. Fale com o administrador.");
      const t = "tok" + ++seq;
      sessoes[t] = u.id;
      return resp(200, { token: t, usuario: publico(u) });
    }
    if (!eu) return falha(401, "sem-sessao", "Entre de novo.");
    if (caminho === "/api/auth/me") return resp(200, publico(eu));
    if (caminho === "/api/auth/logout") { delete sessoes[token]; return resp(204); }
    if (caminho === "/api/auth/senha") {
      if (corpo.senhaAtual !== eu.senha) return falha(400, "credenciais", "A senha atual não confere.");
      eu.senha = corpo.novaSenha; eu.trocarSenha = false;
      return resp(200, publico(eu));
    }
    if (eu.trocarSenha) return falha(403, "sem-permissao", "Você não tem permissão para isso.");
    if (caminho === "/api/usuarios" && init.method === "GET") return resp(200, usuarios.map(publico));
    if (caminho === "/api/usuarios") {
      if (usuarios.some((x) => x.email === corpo.email)) return falha(409, "duplicado", "Já existe um usuário com este e-mail.");
      const u = { id: "u" + ++seq, nome: corpo.nome, email: corpo.email, perfil: corpo.perfil, areas: corpo.areas, ativo: true, trocarSenha: true, senha: "Prov-2345-abcd" };
      usuarios.push(u);
      return resp(201, { usuario: publico(u), senhaProvisoria: u.senha });
    }
    const m = caminho.match(/^\/api\/usuarios\/([^/]+)(\/redefinir-senha)?$/);
    if (m) {
      const u = usuarios.find((x) => x.id === decodeURIComponent(m[1]));
      if (!u) return falha(404, "nao-encontrado", "Usuário não encontrado.");
      if (m[2]) { u.senha = "Nova-3456-efgh"; u.trocarSenha = true; return resp(200, { usuario: publico(u), senhaProvisoria: u.senha }); }
      if (init.method === "PUT") { Object.assign(u, corpo); return resp(200, publico(u)); }
      if (init.method === "DELETE") { usuarios.splice(usuarios.indexOf(u), 1); return resp(204); }
    }
    return falha(404, "http-404", "Não encontrado.");
  }
  return { fetch, usuarios, sessoes, chamadas };
}

function ambiente(srv = servidorFalso()) {
  const ls = {};
  const sessao = { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } };
  const auth = A.criar(null, sessao, { apiUrl: "http://api.teste/", fetch: srv.fetch });
  return { auth, srv, ls, sessao };
}

describe("api.js", () => {
  test("endereços aceitos: https em qualquer lugar, http só no próprio computador", () => {
    assert.ok(ApiCliente.enderecoValido("https://api.orprocon.com.br"));
    assert.ok(ApiCliente.enderecoValido("http://localhost:8080"));
    assert.ok(ApiCliente.enderecoValido("http://127.0.0.1:8080/"));
    assert.ok(!ApiCliente.enderecoValido("http://192.168.0.10:8080"));
    assert.ok(!ApiCliente.enderecoValido("http://api.orprocon.com.br"));
    assert.ok(!ApiCliente.enderecoValido(""));
  });

  test("erro da API vira Error com código, mensagem e status", async () => {
    const api = ApiCliente.criar("http://x", { fetch: async () => ({ ok: false, status: 409, text: async () => '{"erro":"duplicado","mensagem":"Já existe."}' }) });
    await assert.rejects(api.post("/a", {}), (e) => e.codigo === "duplicado" && e.message === "Já existe." && e.status === 409);
  });

  test("sem resposta do servidor: mensagem clara", async () => {
    const api = ApiCliente.criar("http://x", { fetch: async () => { throw new TypeError("Failed to fetch"); } });
    await assert.rejects(api.get("/a"), (e) => e.codigo === "sem-conexao" && /servidor/.test(e.message));
  });

  test("erro sem corpo JSON usa a mensagem padrão do status", async () => {
    const api = ApiCliente.criar("http://x", { fetch: async () => ({ ok: false, status: 500, text: async () => "<html>" }) });
    await assert.rejects(api.get("/a"), (e) => e.codigo === "http-500" && /servidor/.test(e.message));
  });

  test("401 com token avisa que a sessão acabou; 401 sem token (login errado) não", async () => {
    let avisos = 0;
    const r401 = async () => ({ ok: false, status: 401, text: async () => "" });
    const comToken = ApiCliente.criar("http://x", { token: () => "abc", semSessao: () => avisos++, fetch: r401 });
    const semToken = ApiCliente.criar("http://x", { token: () => "", semSessao: () => avisos++, fetch: r401 });
    await assert.rejects(comToken.get("/a"));
    await assert.rejects(semToken.post("/login", {}));
    assert.equal(avisos, 1);
  });
});

describe("login pelo servidor", () => {
  test("AuthCore.criar escolhe o adaptador pelo apiUrl", () => {
    const s = { getItem: () => null, setItem() {}, removeItem() {} };
    assert.equal(A.criar(null, s, { apiUrl: "https://api.x" }).modo, "api");
    assert.equal(A.criar({ get: () => [], set() {} }, s, {}).modo, "local");
    assert.equal(A.criar(null, s, { apiUrl: "https://api.x", modoTeste: true }).modoTeste, false);
  });

  test("primeiro acesso, login e sessão com token", async () => {
    const { auth, srv, ls } = ambiente();
    assert.equal(await auth.precisaConfigurar(), true);
    await auth.configurarAdmin("Mauricio", SENHA);
    assert.equal(await auth.precisaConfigurar(), false);
    const u = await auth.entrar("  OrproconDigital@gmail.com ", SENHA);
    assert.equal(u.principal, true);
    const s = JSON.parse(ls["gf.sessao"]);
    assert.ok(s.token && s.usuarioId === u.id && Date.parse(s.expira) > Date.now());
    assert.equal(A.temSessao({ getItem: (k) => ls[k] }), true);   // o guarda do index.html continua valendo
    await auth.listarUsuarios();
    assert.equal(srv.chamadas.at(-1).auth, "Bearer " + s.token);
  });

  test("senha errada mostra a mensagem do servidor e não cria sessão", async () => {
    const { auth, ls } = ambiente();
    await auth.configurarAdmin("Mauricio", SENHA);
    await assert.rejects(auth.entrar(ADMIN, "Errada123"), /E-mail ou senha incorretos/);
    assert.equal(ls["gf.sessao"], undefined);
  });

  test("senha fraca é recusada antes de ir ao servidor", async () => {
    const { auth, srv } = ambiente();
    await assert.rejects(auth.configurarAdmin("M", "curta"), /8 caracteres/);
    assert.equal(srv.chamadas.length, 0);
  });

  test("usuário novo: senha provisória, troca e uso normal", async () => {
    const { auth } = ambiente();
    await auth.configurarAdmin("Mauricio", SENHA);
    await auth.entrar(ADMIN, SENHA);
    const r = await auth.criarUsuario({ nome: "Ana Exemplo", email: "ana@exemplo.com", perfil: "usuario", areas: ["conciliacao"] });
    assert.equal(r.usuario.trocarSenha, true);
    assert.ok(r.senhaProvisoria);
    await auth.sair();
    const ana = await auth.entrar("ana@exemplo.com", r.senhaProvisoria);
    assert.equal(ana.trocarSenha, true);
    await assert.rejects(auth.listarUsuarios(), /permissão/);
    const depois = await auth.trocarSenha(r.senhaProvisoria, "AnaNova2026");
    assert.equal(depois.trocarSenha, false);
    assert.equal((await auth.usuarioAtual()).nome, "Ana Exemplo");
  });

  test("administração: editar, nova senha, excluir", async () => {
    const { auth } = ambiente();
    await auth.configurarAdmin("Mauricio", SENHA);
    await auth.entrar(ADMIN, SENHA);
    const { usuario } = await auth.criarUsuario({ nome: "Bruno", email: "bruno@exemplo.com", perfil: "usuario", areas: ["integracao"] });
    assert.equal((await auth.atualizarUsuario(usuario.id, { ativo: false })).ativo, false);
    assert.equal((await auth.redefinirSenha(usuario.id)).senhaProvisoria, "Nova-3456-efgh");
    await auth.excluirUsuario(usuario.id);
    assert.equal((await auth.listarUsuarios()).length, 1);
    await assert.rejects(auth.criarUsuario({ nome: "X", email: ADMIN, perfil: "admin" }), /Já existe/);
  });

  test("sessão encerrada no servidor: usuarioAtual devolve null e limpa a sessão local", async () => {
    const { auth, srv, ls } = ambiente();
    await auth.configurarAdmin("Mauricio", SENHA);
    await auth.entrar(ADMIN, SENHA);
    Object.keys(srv.sessoes).forEach((k) => delete srv.sessoes[k]);
    assert.equal(await auth.usuarioAtual(), null);
    assert.equal(ls["gf.sessao"], undefined);
  });

  test("sem internet: o sistema abre com o resumo guardado da sessão", async () => {
    const srv = servidorFalso();
    let online = true;
    const { auth } = ambiente({ ...srv, fetch: (u, i) => (online ? srv.fetch(u, i) : Promise.reject(new TypeError("offline"))) });
    await auth.configurarAdmin("Mauricio", SENHA);
    await auth.entrar(ADMIN, SENHA);
    online = false;
    const u = await auth.usuarioAtual();
    assert.equal(u.email, ADMIN);
    assert.equal(u.semConexao, true);
  });

  test("sair avisa o servidor e apaga a sessão local", async () => {
    const { auth, srv, ls } = ambiente();
    await auth.configurarAdmin("Mauricio", SENHA);
    await auth.entrar(ADMIN, SENHA);
    await auth.sair();
    assert.equal(ls["gf.sessao"], undefined);
    assert.equal(Object.keys(srv.sessoes).length, 0);
  });

  test("sessão do modo navegador (sem token) não vale no modo servidor", async () => {
    const ls = { "gf.sessao": JSON.stringify({ usuarioId: "u1", expira: "2999-01-01T00:00:00Z" }) };
    const s = { getItem: (k) => ls[k] ?? null, setItem: (k, v) => { ls[k] = v; }, removeItem: (k) => { delete ls[k]; } };
    const auth = A.criar(null, s, { apiUrl: "http://api.teste", fetch: servidorFalso().fetch });
    assert.equal(await auth.usuarioAtual(), null);
  });

  test("arquivo de acessos não existe com o servidor", async () => {
    const { auth } = ambiente();
    await assert.rejects(auth.exportarAcessos(), /não é preciso arquivo/);
    await assert.rejects(auth.importarAcessos({}), /não é preciso arquivo/);
    await assert.rejects(auth.entrarTeste(), /modo de teste/);
  });
});
