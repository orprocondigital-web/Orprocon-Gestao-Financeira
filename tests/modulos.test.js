const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../js/modulos.js");

test("vencimentos urgentes: vencidos e até 7 dias", () => {
  const estado = { documentos: [
    { vencimento: "2026-10-01" }, { vencimento: "2026-10-09" }, { vencimento: "2026-10-16" },
    { vencimento: "2026-10-17" }, { vencimento: "" }, {}
  ] };
  assert.equal(M.vencimentosUrgentes(estado, "2026-10-09", 7), 3);
  assert.equal(M.vencimentosUrgentes(null, "2026-10-09", 7), 0);
});

test("dados dos módulos vão no backup; os do sistema não", () => {
  assert.ok(M.ehDadoDeModulo("icms.rules"));
  assert.ok(M.ehDadoDeModulo("painelVencimentos:v1"));
  assert.ok(!M.ehDadoDeModulo("system_banks"));
  assert.ok(!M.ehDadoDeModulo("tema"));
});
