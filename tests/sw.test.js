// O modo sem internet só funciona para o que estiver na lista do sw.js: confere que nada ficou de fora.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const raiz = path.join(__dirname, "..");
const sw = fs.readFileSync(path.join(raiz, "sw.js"), "utf8");
const versaoSw = /var VERSAO = "\?v=([\d.]+)"/.exec(sw)[1];

function arquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

test("scripts e estilo do index.html estão no sw.js, com a mesma versão", () => {
  const html = fs.readFileSync(path.join(raiz, "index.html"), "utf8");
  const locais = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)\?v=([\d.]+)"/g)];
  assert.ok(locais.length > 5);
  for (const [, arq, v] of locais) {
    assert.equal(v, versaoSw, `${arq} está com ?v=${v} e o sw.js com ${versaoSw}`);
    assert.ok(sw.includes(`"${arq}" + VERSAO`), `${arq} falta no sw.js`);
  }
});

test("todos os arquivos dos módulos estão no sw.js", () => {
  const faltando = arquivos(path.join(raiz, "modulos"))
    .map((f) => path.relative(raiz, f).split(path.sep).join("/"))
    .filter((f) => !/README\.md$|\.gitignore$/.test(f))
    .map((f) => f.replace(/index\.html$/, ""))
    .filter((f) => !sw.includes(`"${f}"`));
  assert.deepEqual(faltando, []);
});

test("cada módulo do menu tem a pasta e a página", () => {
  const M = require("../js/modulos.js");
  for (const m of M.LISTA) assert.ok(fs.existsSync(path.join(raiz, m.pasta, "index.html")), m.pasta);
});
