// Tela Início: junta as pendências dos módulos sem calcular diferente deles.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const I = require("../js/inicio.js");
const ED = require("../modulos/em-dia/js/dados.js");

const HOJE = "2026-10-16";
const EU = { id: "u1", nome: "Mauricio Teste", email: "m@exemplo.com" };
const ctx = (extra) => Object.assign({ hoje: HOJE, usuario: EU, competencia: "2026-09", agora: new Date("2026-10-16T09:00:00") }, extra || {});

function exemplos() {
  const st = {};
  const ler = (k) => (st[k] ? JSON.parse(JSON.stringify(st[k])) : null);
  const gravar = (k, v) => { st[k] = JSON.parse(JSON.stringify(v)); };
  const feitos = I.carregarExemplos(ler, gravar, EU, HOJE);
  return { st, feitos, fontes: { emDia: st["emDia:v1"], iss: st["iss:v1"], horas: st["horas:v1"], venc: st["painelVencimentos:v1"] } };
}

describe("Início", () => {
  test("sem nada cadastrado, não há pendências e a tela sabe que está vazia", () => {
    const r = I.resumir({}, ctx());
    assert.equal(r.pendencias.length, 0);
    assert.equal(r.vazio, true);
    assert.equal(r.numeros.find((n) => n.id === "fechamento").valor, "—");
    assert.match(I.html(r), /Nada pendente/);
  });

  test("carrega exemplo só nos módulos vazios", () => {
    const { st, feitos } = exemplos();
    assert.deepEqual(feitos, ["Em Dia", "ISS Tubarão", "Controle de horas", "Painel de vencimentos"]);
    const ler = (k) => st[k] || null;
    assert.deepEqual(I.carregarExemplos(ler, () => { throw new Error("não devia gravar"); }, EU, HOJE), []);
  });

  test("junta pendências de todos os módulos, das mais urgentes para as outras", () => {
    const { fontes } = exemplos();
    fontes.contas = [{ id: "b1", nome: "Banco Exemplo 1", lancamentos: 0 }, { id: "b2", nome: "Banco Exemplo 2", lancamentos: 3 }];
    const r = I.resumir(fontes, ctx());
    const origens = new Set(r.pendencias.map((p) => p.origem));
    for (const o of ["Em Dia", "Vencimentos", "ISS", "Controle de horas", "Contábil"]) assert.ok(origens.has(o), o);
    const pesos = { alta: 0, media: 1, baixa: 2, info: 3 };
    for (let i = 1; i < r.pendencias.length; i++) assert.ok(pesos[r.pendencias[i - 1].nivel] <= pesos[r.pendencias[i].nivel]);
    assert.equal(r.pendencias[0].origem, "Vencimentos", "documento vencido vem primeiro");
    const contas = r.pendencias.find((p) => p.origem === "Contábil");
    assert.match(contas.titulo, /1 conta sem extrato em setembro\/2026/);
    assert.equal(contas.detalhe, "Banco Exemplo 1");
    assert.ok(r.pendencias.every((p) => p.acao && (p.acao.tab || p.acao.acaoApp)));
  });

  test("os números batem com as regras do Em Dia", () => {
    const { fontes } = exemplos();
    const r = I.resumir(fontes, ctx());
    const res = ED.resumoMes(ED.normalizar(fontes.emDia), "2026-09", HOJE);
    const fech = r.numeros.find((n) => n.id === "fechamento");
    assert.equal(fech.valor, res.geral.pct + "%");
    assert.equal(fech.sub, res.geral.feitas + " de " + res.geral.total + " etapas feitas");
    assert.deepEqual(r.setores.map((s) => s.id), ["contabil", "fiscal", "pessoal"]);
    const venc = r.numeros.find((n) => n.id === "vencer");
    assert.equal(venc.valor, "4");          // vencido ontem + em 2, 4 e 7 dias
    assert.equal(venc.sub, "1 já vencido");
    assert.equal(r.vencimentos.length, 6);  // até 30 dias
  });

  test("Minhas: só as tarefas da pessoa no Em Dia e os documentos com o nome dela", () => {
    const { fontes } = exemplos();
    fontes.venc.documentos[0].responsavel = "Mauricio";
    const todas = I.resumir(fontes, ctx());
    const minhas = I.resumir(fontes, ctx(), { minhas: true });
    assert.ok(minhas.pendencias.length > 0 && minhas.pendencias.length < todas.pendencias.length);
    assert.ok(minhas.pendencias.every((p) => p.origem === "Em Dia" || p.origem === "Vencimentos"));
    assert.ok(minhas.pendencias.some((p) => p.origem === "Vencimentos"));
    assert.deepEqual(minhas.numeros, todas.numeros, "os números do topo são sempre de todos");
  });

  test("respeita o acesso: sem o módulo, nada dele aparece", () => {
    const { fontes } = exemplos();
    const r = I.resumir(fontes, ctx({ pode: (a) => a === "mod-vencimentos" }));
    assert.ok(r.pendencias.length > 0);
    assert.ok(r.pendencias.every((p) => p.origem === "Vencimentos"));
    assert.equal(r.setores.length, 0);
  });

  test("mês do Controle de horas fechado não gera pendência", () => {
    const { fontes } = exemplos();
    const emp = fontes.horas.empresas[0];
    assert.ok(I.resumir(fontes, ctx()).pendencias.some((p) => p.origem === "Controle de horas"));
    fontes.horas.meses[emp.id]["2026-09"].status = "fechado";
    assert.ok(!I.resumir(fontes, ctx()).pendencias.some((p) => p.origem === "Controle de horas"));
  });

  test("ISS conferido sai da lista", () => {
    const { fontes } = exemplos();
    const mes = Object.keys(fontes.iss.meses)[0];
    Object.values(fontes.iss.meses[mes]).forEach((r) => { r.conferida = true; });
    assert.ok(!I.resumir(fontes, ctx()).pendencias.some((p) => p.origem === "ISS"));
  });

  test("ausência com tarefas abertas pede a passagem de bastão", () => {
    const { fontes } = exemplos();
    const p = I.resumir(fontes, ctx()).pendencias.find((x) => /ausente/.test(x.titulo));
    assert.ok(p);
    assert.equal(p.acao.prefs["emDia:aba"], "equipe");
  });

  test("tarefas recebidas na passagem de bastão aparecem para quem recebeu", () => {
    const { fontes } = exemplos();
    const e = ED.normalizar(fontes.emDia);
    const t = ED.tarefasDoMes(e, "2026-09").filter((x) => ED.aberta(x) && x.responsavel === "exemplo-1").slice(0, 2);
    ED.passarBastao(e, "2026-09", "exemplo-1", "u1", t, "exemplo-1", new Date("2026-10-15T10:00:00"));
    fontes.emDia = e;
    const p = I.resumir(fontes, ctx(), { minhas: true }).pendencias.find((x) => x.id === "emdia-bastao");
    assert.ok(p);
    assert.match(p.titulo, /2 tarefas vieram para você/);
  });

  test("o HTML escapa texto vindo dos dados e só leva chaves de módulo nas preferências", () => {
    const { fontes } = exemplos();
    fontes.venc.clientes[0].nome = '<img src=x onerror="alert(1)">';
    const r = I.resumir(fontes, ctx());
    const h = I.html(r, { podeEmDia: true });
    assert.ok(!h.includes("<img src=x"));
    assert.match(h, /&lt;img src=x/);
    const M = require("../js/modulos.js");
    for (const m of h.matchAll(/data-prefs='([^']*)'/g)) {
      const prefs = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      for (const k of Object.keys(prefs)) assert.ok(M.ehDadoDeModulo(k), k);
    }
  });

  test("lista longa mostra 8 e o botão de mostrar mais", () => {
    const { fontes } = exemplos();
    const r = I.resumir(fontes, ctx());
    assert.ok(r.pendencias.length > 8);
    const h = I.htmlPendencias(r);
    assert.equal((h.match(/in-extra/g) || []).length, r.pendencias.length - 8);
    assert.match(h, new RegExp("Mostrar mais " + (r.pendencias.length - 8)));
  });

  test("nome do responsável no painel: nome completo, primeiro nome ou e-mail", () => {
    assert.ok(I.ehMeuNome("mauricio", EU));
    assert.ok(I.ehMeuNome("Maurício Teste", EU));
    assert.ok(I.ehMeuNome("m@exemplo.com", EU));
    assert.ok(!I.ehMeuNome("Carla", EU));
    assert.ok(!I.ehMeuNome("", EU));
  });

  test("capa: só as ferramentas que a pessoa pode abrir, por setor", () => {
    const r = I.resumir({}, ctx());
    const tudo = I.capa(r);
    assert.equal((tudo.match(/class="capa-card"/g) || []).length, 8);
    assert.match(tudo, /Departamento Pessoal/);
    assert.match(tudo, /Integração contábil/);
    assert.ok(!/capa-minis/.test(tudo), "sem dados, sem mini cards");
    const fiscal = I.capa(r, { pode: (a) => ["mod-icms", "mod-iss"].includes(a) });
    assert.equal((fiscal.match(/class="capa-card"/g) || []).length, 2);
    assert.ok(!/Contábil<\/h3>/.test(fiscal) && /Fiscal<\/h3>/.test(fiscal));
    assert.match(fiscal, /<strong>2<\/strong><span>ferramentas/);
  });

  test("capa: mini cards levam ao módulo certo", () => {
    const { fontes } = exemplos();
    const r = I.resumir(fontes, ctx());
    const h = I.capa(r);
    assert.equal((h.match(/class="capa-mini[ "]/g) || []).length, 4);
    assert.match(h, /data-ir="mod-em-dia" data-prefs='[^']*emDia:aba&quot;:&quot;hoje/);
    assert.match(h, /data-ir="mod-em-dia" data-prefs='[^']*fechamento/);
    assert.match(h, /data-ir="mod-iss"/);
    assert.match(h, /data-ir="mod-vencimentos"/);
    for (const s of I.SETORES_CAPA) for (const f of s.ferramentas) assert.equal(f.itens.length, 3, f.nome);
  });

  test("data por extenso", () => {
    assert.equal(I.dataPorExtenso("2026-10-16"), "Sexta-feira, 16 de outubro");
  });
});
