// Botão de suporte: a mensagem já leva a tela, o usuário e a versão.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/suporte.js");

test("mensagem com assunto, texto e contexto", () => {
  const m = S.mensagem({ tipo: "problema", texto: "  O extrato não importa.  ", tela: "Contábil › Conciliação",
    usuario: { nome: "Ana Exemplo", email: "ana@exemplo.com" }, versao: "0.19.1", atendente: "Mauricio" });
  assert.equal(m, "Olá, Mauricio! Encontrei um problema no Gestão Financeira.\n\nO extrato não importa.\n\n" +
    "Tela: Contábil › Conciliação\nUsuário: Ana Exemplo · ana@exemplo.com\nVersão: 0.19.1");
});

test("sem texto e sem usuário (tela de login), vira uma dúvida", () => {
  const m = S.mensagem({ tela: "Tela de login" });
  assert.match(m, /^Olá! Tenho uma dúvida no Gestão Financeira\./);
  assert.ok(!/Usuário:/.test(m));
});

test("link do WhatsApp com o texto codificado", () => {
  assert.equal(S.linkWhatsApp("+55 (48) 99178-1362", "a b&c"), "https://wa.me/5548991781362?text=a%20b%26c");
  assert.equal(S.linkWhatsApp("", "x"), "");
});

test("número legível", () => {
  assert.equal(S.numeroLegivel("5548991781362"), "(48) 99178-1362");
  assert.equal(S.numeroLegivel("4832221234"), "(48) 3222-1234");
});

test("o número configurado é válido", () => {
  global.location = { search: "" };
  global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const fs = require("node:fs"), vm = require("node:vm");
  const ctx = { location: global.location, localStorage: global.localStorage, URLSearchParams };
  vm.runInNewContext(fs.readFileSync(require("node:path").join(__dirname, "..", "js", "config.js"), "utf8") + ";this.CONFIG=CONFIG;", ctx);
  assert.match(ctx.CONFIG.suporte.whatsapp, /^55\d{10,11}$/);
});
