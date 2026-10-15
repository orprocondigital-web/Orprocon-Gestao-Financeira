// Login e usuários (fase só front). Senhas de teste são fictícias.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
if (!globalThis.crypto) globalThis.crypto = require("node:crypto").webcrypto;   // Node 18
const A = require("../js/auth.js");

function ambiente(inicio = "2026-10-09T09:00:00Z", modoTeste = false, dados = {}) {
  const ls = {};
  let t = Date.parse(inicio);
  const auth = A.criarAuthLocal(
    { get: (k) => dados[k], set: (k, v) => { dados[k] = JSON.parse(JSON.stringify(v)); } },
    { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
    { agora: () => new Date(t), modoTeste });
  return { auth, dados, ls, avancar: (ms) => { t += ms; } };
}
const SENHA_ADMIN = "TesteAdmin123";

describe("senhas", () => {
  test("regras", () => {
    assert.match(A.problemaSenha("curta1"), /8 caracteres/);
    assert.match(A.problemaSenha("somenteletras"), /letras e números/);
    assert.equal(A.problemaSenha("Exemplo2026senha"), "");
  });
  test("hash com sal: a mesma senha gera hashes diferentes e confere", async () => {
    const h1 = await A.gerarHash("Segredo123"), h2 = await A.gerarHash("Segredo123");
    assert.notEqual(h1.hash, h2.hash);
    assert.equal(h1.alg, "PBKDF2-SHA256");
    assert.ok(!JSON.stringify(h1).includes("Segredo123"));
    assert.equal(await A.conferirHash("Segredo123", h1), true);
    assert.equal(await A.conferirHash("segredo123", h1), false);
  });
  test("senha provisória no formato Xxxx-0000-xxxx e válida", () => {
    const s = A.senhaProvisoria();
    assert.match(s, /^[A-Z][a-z]{3}-\d{4}-[a-z]{4}$/);
    assert.equal(A.problemaSenha(s), "");
  });
});

describe("primeiro acesso e login", () => {
  test("cria o admin principal uma única vez, sem guardar a senha em texto", async () => {
    const { auth, dados } = ambiente();
    assert.equal(await auth.precisaConfigurar(), true);
    await assert.rejects(auth.configurarAdmin("Mauricio", "fraca"), /8 caracteres/);
    const u = await auth.configurarAdmin("Mauricio", SENHA_ADMIN);
    assert.deepEqual([u.email, u.perfil, u.areas.length], [A.ADMIN_EMAIL, "admin", A.AREAS.length]);
    assert.ok(!JSON.stringify(dados).includes(SENHA_ADMIN));
    assert.equal(await auth.precisaConfigurar(), false);
    await assert.rejects(auth.configurarAdmin("Outro", "OutraSenha1"), /já foi criado/);
  });
  test("entrar, sessão de 12 horas, sair", async () => {
    const { auth, ls, avancar } = ambiente();
    await auth.configurarAdmin("Mauricio", SENHA_ADMIN);
    await assert.rejects(auth.entrar(A.ADMIN_EMAIL, "errada123"), /incorretos/);
    const u = await auth.entrar("  ORPROCONDIGITAL@gmail.com ", SENHA_ADMIN);
    assert.equal(u.nome, "Mauricio");
    assert.ok(A.temSessao({ getItem: (k) => ls[k] }, Date.parse("2026-10-09T10:00:00Z")));
    assert.equal((await auth.usuarioAtual()).email, A.ADMIN_EMAIL);
    avancar(13 * 3600000);
    assert.equal(await auth.usuarioAtual(), null);
    await auth.entrar(A.ADMIN_EMAIL, SENHA_ADMIN);
    await auth.sair();
    assert.equal(await auth.usuarioAtual(), null);
  });
  test("5 tentativas erradas bloqueiam por 30 segundos", async () => {
    const { auth, avancar } = ambiente();
    await auth.configurarAdmin("Mauricio", SENHA_ADMIN);
    for (let i = 0; i < 5; i++) await assert.rejects(auth.entrar(A.ADMIN_EMAIL, "errada123"), /incorretos/);
    await assert.rejects(auth.entrar(A.ADMIN_EMAIL, SENHA_ADMIN), /Aguarde 30 segundos/);
    avancar(31000);
    assert.equal((await auth.entrar(A.ADMIN_EMAIL, SENHA_ADMIN)).perfil, "admin");
  });
});

describe("administração", () => {
  async function comAdmin() {
    const amb = ambiente();
    await amb.auth.configurarAdmin("Mauricio", SENHA_ADMIN);
    await amb.auth.entrar(A.ADMIN_EMAIL, SENHA_ADMIN);
    return amb;
  }
  test("cria usuário com senha provisória e áreas; ele troca a senha no primeiro acesso", async () => {
    const { auth } = await comAdmin();
    await assert.rejects(auth.criarUsuario({ nome: "Ana", email: "ana@orprocon", perfil: "usuario", areas: ["conciliacao"] }), /E-mail inválido/);
    await assert.rejects(auth.criarUsuario({ nome: "Ana", email: "ana@orprocon.com.br", perfil: "usuario", areas: [] }), /pelo menos uma área/);
    const r = await auth.criarUsuario({ nome: "Ana", email: "Ana@Orprocon.com.br", perfil: "usuario", areas: ["conciliacao", "mod-icms", "inventada"] });
    assert.deepEqual([r.usuario.email, r.usuario.areas, r.usuario.trocarSenha], ["ana@orprocon.com.br", ["conciliacao", "mod-icms"], true]);
    await assert.rejects(auth.criarUsuario({ nome: "Ana 2", email: "ana@orprocon.com.br", perfil: "usuario", areas: ["conciliacao"] }), /Já existe/);
    await auth.sair();
    const ana = await auth.entrar("ana@orprocon.com.br", r.senhaProvisoria);
    assert.equal(ana.trocarSenha, true);
    assert.ok(A.podeAcessar(ana, "mod-icms") && !A.podeAcessar(ana, "integracao"));
    await assert.rejects(auth.listarUsuarios(), /Só o administrador/);
    await assert.rejects(auth.trocarSenha(r.senhaProvisoria, r.senhaProvisoria), /diferente/);
    const depois = await auth.trocarSenha(r.senhaProvisoria, "NovaSenha2026");
    assert.equal(depois.trocarSenha, false);
  });
  test("desativar, redefinir senha, excluir; o último admin é protegido", async () => {
    const { auth } = await comAdmin();
    const eu = (await auth.usuarioAtual()).id;
    const { usuario: b } = await auth.criarUsuario({ nome: "Bruno", email: "bruno@orprocon.com.br", perfil: "usuario", areas: ["mod-vencimentos"] });
    await auth.atualizarUsuario(b.id, { ativo: false });
    const { senhaProvisoria } = await auth.redefinirSenha(b.id);
    await auth.sair();
    await assert.rejects(auth.entrar("bruno@orprocon.com.br", senhaProvisoria), /desativado/);
    await auth.entrar(A.ADMIN_EMAIL, SENHA_ADMIN);
    await assert.rejects(auth.atualizarUsuario(eu, { perfil: "usuario", areas: ["conciliacao"] }), /próprio acesso/);
    await assert.rejects(auth.excluirUsuario(eu), /próprio acesso/);
    await assert.rejects(auth.atualizarUsuario(eu, { email: "outro@orprocon.com.br" }), /não pode ser alterado/);
    await auth.excluirUsuario(b.id);
    assert.deepEqual((await auth.listarUsuarios()).map((u) => u.nome), ["Mauricio"]);
  });
  test("acessos vão para outro computador pelo arquivo (sem senha em texto)", async () => {
    const { auth } = await comAdmin();
    const { senhaProvisoria } = await auth.criarUsuario({ nome: "Carla", email: "carla@orprocon.com.br", perfil: "usuario", areas: ["integracao"] });
    const arquivo = JSON.parse(JSON.stringify(await auth.exportarAcessos()));
    assert.ok(!JSON.stringify(arquivo).includes(senhaProvisoria) && !JSON.stringify(arquivo).includes(SENHA_ADMIN));
    const outro = ambiente();                                   // computador da Carla: nenhum usuário ainda
    await assert.rejects(outro.auth.importarAcessos({ app: "x" }), /não é um arquivo de acessos/);
    assert.deepEqual(await outro.auth.importarAcessos(arquivo), { novos: 2, atualizados: 0 });
    assert.equal((await outro.auth.entrar("carla@orprocon.com.br", senhaProvisoria)).nome, "Carla");
    await assert.rejects(outro.auth.importarAcessos(arquivo), /Só o administrador/);   // já tem contas: só o admin importa
  });
});

describe("modo de teste", () => {
  test("entra sem senha; não impede o primeiro acesso do admin; não vai no arquivo de acessos", async () => {
    const { auth, dados } = ambiente(undefined, true);
    const t = await auth.entrarTeste();
    assert.deepEqual([t.teste, t.perfil, t.email], [true, "admin", A.TESTE_EMAIL]);
    assert.equal(await auth.precisaConfigurar(), true);              // a conta de teste não conta
    await assert.rejects(auth.entrar(A.TESTE_EMAIL, ""), /incorretos/);  // sem senha pelo formulário normal
    await auth.configurarAdmin("Mauricio", SENHA_ADMIN);
    await auth.entrar(A.ADMIN_EMAIL, SENHA_ADMIN);
    const arq = await auth.exportarAcessos();
    assert.deepEqual(arq.usuarios.map((u) => u.email), [A.ADMIN_EMAIL]);
    // fim dos testes: com o modo desligado a conta de teste some
    const depois = A.criarAuthLocal({ get: (k) => dados[k], set: (k, v) => { dados[k] = v; } },
      { getItem: () => null, setItem() {}, removeItem() {} }, { modoTeste: false });
    await assert.rejects(depois.entrarTeste(), /desligado/);
  });
  test("conta de teste também não conta como último admin", async () => {
    const { auth } = ambiente(undefined, true);
    await auth.configurarAdmin("Mauricio", SENHA_ADMIN);
    await auth.entrarTeste();
    const admin = (await auth.listarUsuarios()).find((u) => u.principal);
    await assert.rejects(auth.atualizarUsuario(admin.id, { ativo: false }), /administrador principal/);
  });
});

describe("gestores e gerentes como administradores", () => {
  test("outro admin gerencia usuários, mas não mexe no admin principal", async () => {
    const { auth } = ambiente();
    await auth.configurarAdmin("Mauricio", SENHA_ADMIN);
    await auth.entrar(A.ADMIN_EMAIL, SENHA_ADMIN);
    const { usuario: gerente, senhaProvisoria } = await auth.criarUsuario({ nome: "Gerente", email: "gerente@orprocon.com.br", perfil: "admin" });
    assert.deepEqual([gerente.perfil, gerente.principal, gerente.areas.length], ["admin", false, A.AREAS.length]);
    await auth.sair();
    await auth.entrar("gerente@orprocon.com.br", senhaProvisoria);
    const lista = await auth.listarUsuarios();
    const principal = lista.find((u) => u.principal);
    assert.equal(principal.email, A.ADMIN_EMAIL);
    for (const tentativa of [auth.atualizarUsuario(principal.id, { ativo: false }), auth.redefinirSenha(principal.id), auth.excluirUsuario(principal.id)]) {
      await assert.rejects(tentativa, /Só o administrador principal/);
    }
    const { usuario: ana } = await auth.criarUsuario({ nome: "Ana", email: "ana@orprocon.com.br", perfil: "usuario", areas: ["conciliacao"] });
    assert.equal((await auth.atualizarUsuario(ana.id, { areas: ["conciliacao", "mod-icms"] })).areas.length, 2);
  });
});
