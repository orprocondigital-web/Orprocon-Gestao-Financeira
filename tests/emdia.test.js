// Em Dia (acompanhamento do fechamento): regras em modulos/em-dia/js/dados.js. Nomes fictícios.
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const D = require("../modulos/em-dia/js/dados.js");

function base() {
  const e = D.estadoVazio();
  D.registrarMembro(e, { id: "u1", nome: "Ana", email: "ana@exemplo.com", perfil: "admin" });
  D.registrarMembro(e, { id: "u2", nome: "Bruno", email: "bruno@exemplo.com", perfil: "usuario" });
  e.clientes.push({ id: "c1", nome: "Alfa Ltda", regime: "Lucro Presumido", responsaveis: { contabil: "u1", fiscal: "u2", pessoal: "" }, etapas: null, ativo: true });
  e.clientes.push({ id: "c2", nome: "Beta ME", regime: "Simples Nacional", responsaveis: { contabil: "u2" }, etapas: null, ativo: true });
  return e;
}
const etapa = (e, nome) => e.etapas.find((x) => x.nome === nome);

describe("datas e prazos", () => {
  test("prazo é no mês seguinte à competência, sem passar do fim do mês", () => {
    assert.equal(D.prazoEtapa("2026-10", { prazoDia: 15 }), "2026-11-15");
    assert.equal(D.prazoEtapa("2026-12", { prazoDia: 10 }), "2027-01-10");
    assert.equal(D.prazoEtapa("2027-01", { prazoDia: 31 }), "2027-02-28");
    assert.equal(D.somarMes("2026-01", -1), "2025-12");
    assert.equal(D.rotuloMes("2026-03"), "março/2026");
  });
});

describe("etapas por cliente", () => {
  test("pelo regime: Simples tem DAS e não tem ICMS; Presumido o contrário", () => {
    const e = base();
    const alfa = D.etapasDoCliente(e, e.clientes[0]).map((x) => x.nome);
    const beta = D.etapasDoCliente(e, e.clientes[1]).map((x) => x.nome);
    assert.ok(alfa.includes("Apuração de ICMS") && !alfa.includes("DAS do Simples Nacional"));
    assert.ok(beta.includes("DAS do Simples Nacional") && !beta.includes("Apuração de ICMS"));
    assert.ok(alfa.includes("Conciliação bancária") && beta.includes("Conciliação bancária"));
  });
  test("etapas escolhidas no cadastro valem mais que o regime; etapa desativada some", () => {
    const e = base();
    e.clientes[0].etapas = [etapa(e, "Folha de pagamento").id, etapa(e, "Conciliação bancária").id];
    assert.deepEqual(D.etapasDoCliente(e, e.clientes[0]).map((x) => x.nome), ["Folha de pagamento", "Conciliação bancária"]);
    etapa(e, "Folha de pagamento").ativa = false;
    assert.deepEqual(D.etapasDoCliente(e, e.clientes[0]).map((x) => x.nome), ["Conciliação bancária"]);
  });
  test("responsável vem da área da etapa", () => {
    const e = base();
    const icms = D.tarefa(e, "2026-10", e.clientes[0], etapa(e, "Apuração de ICMS"));
    const conc = D.tarefa(e, "2026-10", e.clientes[0], etapa(e, "Conciliação bancária"));
    assert.equal(icms.responsavel, "u2");
    assert.equal(conc.responsavel, "u1");
    assert.equal(icms.status, "a-fazer");
    assert.equal(icms.prazo, "2026-11-10");
  });
});

describe("tarefas e situação", () => {
  test("atualizar e calcular atraso", () => {
    const e = base();
    const conc = etapa(e, "Conciliação bancária");
    let t = D.atualizarTarefa(e, "2026-10", "c1", conc.id, { status: "andamento", nota: "faltam 2 contas" }, "u1");
    assert.equal(t.status, "andamento");
    assert.equal(D.situacao(t, "2026-11-20"), "atrasada");
    assert.equal(D.situacao(t, "2026-11-15"), "hoje");
    assert.equal(D.situacao(t, "2026-11-13"), "logo");
    assert.equal(D.situacao(t, "2026-11-01"), "");
    t = D.atualizarTarefa(e, "2026-10", "c1", conc.id, { status: "feito" }, "u1");
    assert.equal(D.situacao(t, "2026-12-30"), "", "feito nunca está atrasado");
    assert.throws(() => D.atualizarTarefa(e, "2026-10", "c1", conc.id, { status: "xyz" }, "u1"), /Situação inválida/);
  });
  test("progresso ignora o que não se aplica", () => {
    const p = D.progresso([{ status: "feito", prazo: "2026-11-10" }, { status: "na", prazo: "2026-11-10" }, { status: "a-fazer", prazo: "2026-11-01" }], "2026-11-05");
    assert.deepEqual([p.total, p.feitas, p.atrasadas, p.pct], [2, 1, 1, 50]);
  });
});

describe("diário e passagem de bastão", () => {
  test("registrar atividade com 'onde parei' e status", () => {
    const e = base();
    const conc = etapa(e, "Conciliação bancária");
    const d = D.registrarDiario(e, { autor: "u1", mes: "2026-10", clienteId: "c1", etapaId: conc.id, feito: "Conciliei Sicredi", ondeParei: "Falta Banrisul", status: "andamento", minutos: "45" }, new Date("2026-11-04T14:00:00"));
    assert.equal(d.minutos, 45);
    assert.equal(D.tarefa(e, "2026-10", e.clientes[0], conc).status, "andamento");
    assert.equal(D.ultimoOndeParei(e, "2026-10", "c1", conc.id).ondeParei, "Falta Banrisul");
    assert.throws(() => D.registrarDiario(e, { autor: "u1", clienteId: "c1", feito: " " }), /Conte o que foi feito/);
    assert.throws(() => D.registrarDiario(e, { autor: "u1", feito: "x" }), /cliente/);
  });
  test("passar o bastão troca o responsável e anota no diário", () => {
    const e = base();
    const abertas = D.abertasDe(e, "2026-10", "u2");
    assert.ok(abertas.length > 3);
    const n = D.passarBastao(e, "2026-10", "u2", "u1", abertas.map((t) => ({ clienteId: t.clienteId, etapaId: t.etapaId })), "u1");
    assert.equal(n, abertas.length);
    assert.equal(D.abertasDe(e, "2026-10", "u2").length, 0);
    assert.ok(e.diario.some((d) => d.tipo === "bastao" && /de Bruno para Ana/.test(d.feito)));
    assert.throws(() => D.passarBastao(e, "2026-10", "u1", "u1", [], "u1"), /outra pessoa/);
  });
  test("filtro do diário e CSV", () => {
    const e = base();
    D.registrarDiario(e, { autor: "u1", clienteId: "c1", feito: "A; com ponto e vírgula", data: "2026-11-03", hora: "09:00" });
    D.registrarDiario(e, { autor: "u2", clienteId: "c2", feito: "B", data: "2026-11-04", hora: "10:00" });
    assert.deepEqual(D.filtrarDiario(e, {}).map((d) => d.feito), ["B", "A; com ponto e vírgula"]);
    assert.equal(D.filtrarDiario(e, { pessoa: "u1" }).length, 1);
    assert.equal(D.filtrarDiario(e, { de: "2026-11-04" }).length, 1);
    assert.equal(D.filtrarDiario(e, { texto: "vírgula" }).length, 1);
    const csv = D.csvDiario(e, D.filtrarDiario(e, {}));
    assert.match(csv, /"A; com ponto e vírgula"/);
    assert.match(csv, /04\/11\/2026;10:00;;Bruno;Beta ME/);
  });
});

describe("diário por setor (Contábil, Fiscal, Pessoal)", () => {
  test("o setor vem da etapa, do que foi escolhido ou da pessoa", () => {
    const e = base();
    D.porId(e.equipe, "u2").setor = "fiscal";
    const icms = D.registrarDiario(e, { autor: "u1", clienteId: "c1", etapaId: etapa(e, "Apuração de ICMS").id, feito: "x" });
    const folha = D.registrarDiario(e, { autor: "u1", clienteId: "c1", etapaId: etapa(e, "Folha de pagamento").id, feito: "x" });
    const escolhido = D.registrarDiario(e, { autor: "u2", setor: "pessoal", clienteId: "c1", feito: "admissão" });
    const daPessoa = D.registrarDiario(e, { autor: "u2", clienteId: "c1", etapaId: etapa(e, "Documentos do cliente recebidos").id, feito: "x" });
    const semSetor = D.registrarDiario(e, { autor: "u1", clienteId: "c1", feito: "x" });
    assert.deepEqual([icms.setor, folha.setor, escolhido.setor, daPessoa.setor, semSetor.setor], ["fiscal", "pessoal", "pessoal", "fiscal", ""]);
  });
  test("cada setor vê o seu diário; registros antigos sem setor são deduzidos", () => {
    const e = base();
    D.registrarDiario(e, { autor: "u1", clienteId: "c1", etapaId: etapa(e, "Conciliação bancária").id, feito: "contábil" });
    D.registrarDiario(e, { autor: "u2", clienteId: "c1", setor: "fiscal", feito: "fiscal" });
    e.diario.push({ id: "velho", data: "2026-11-01", hora: "08:00", autor: "u1", clienteId: "c1", etapaId: etapa(e, "eSocial e FGTS Digital").id, feito: "antigo", ondeParei: "", criadoEm: "2026-11-01T08:00:00Z" });
    D.registrarDiario(e, { autor: "u1", clienteId: "c1", feito: "sem setor" });
    assert.deepEqual(D.filtrarDiario(e, { setor: "contabil" }).map((d) => d.feito), ["contábil"]);
    assert.deepEqual(D.filtrarDiario(e, { setor: "fiscal" }).map((d) => d.feito), ["fiscal"]);
    assert.deepEqual(D.filtrarDiario(e, { setor: "pessoal" }).map((d) => d.feito), ["antigo"]);
    assert.deepEqual(D.filtrarDiario(e, { setor: "sem" }).map((d) => d.feito), ["sem setor"]);
    assert.match(D.csvDiario(e, D.filtrarDiario(e, { setor: "pessoal" })), /01\/11\/2026;08:00;Pessoal \(DP\);Ana/);
  });
  test("'onde parei' avulso de outro setor não aparece na tarefa", () => {
    const e = base();
    const conc = etapa(e, "Conciliação bancária");
    D.registrarDiario(e, { autor: "u2", setor: "pessoal", mes: "2026-10", clienteId: "c1", feito: "admissão", ondeParei: "falta exame" });
    assert.equal(D.ultimoOndeParei(e, "2026-10", "c1", conc.id), null);
    D.registrarDiario(e, { autor: "u1", setor: "contabil", mes: "2026-10", clienteId: "c1", feito: "liguei", ondeParei: "extrato chega amanhã" });
    assert.equal(D.ultimoOndeParei(e, "2026-10", "c1", conc.id).ondeParei, "extrato chega amanhã");
  });
  test("passar o bastão anota no diário do setor de cada etapa", () => {
    const e = base();
    const itens = [etapa(e, "Apuração de ICMS"), etapa(e, "Conciliação bancária")].map((x) => ({ clienteId: "c1", etapaId: x.id }));
    D.passarBastao(e, "2026-10", "u2", "u1", itens, "u1");
    const b = e.diario.filter((d) => d.tipo === "bastao").map((d) => d.setor).sort();
    assert.deepEqual(b, ["contabil", "fiscal"]);
  });
  test("resumo por setor e estado antigo com 'folha' vira 'pessoal'", () => {
    const e = base();
    D.porId(e.equipe, "u2").setor = "fiscal";
    D.registrarDiario(e, { autor: "u2", clienteId: "c1", setor: "fiscal", feito: "x", minutos: 30, data: "2026-11-05" });
    const r = D.resumoSetores(e, "2026-10", "2026-11-05");
    assert.deepEqual(r.map((x) => x.setor.id), ["contabil", "fiscal", "pessoal"]);
    const f = r.find((x) => x.setor.id === "fiscal");
    assert.deepEqual([f.registrosHoje, f.pessoasHoje, f.minutosHoje, f.equipe.length], [1, 1, 30, 1]);
    assert.ok(f.abertas > 0);
    const velho = D.normalizar({ equipe: [{ id: "p", nome: "P", funcao: "Folha" }], clientes: [{ id: "c", responsaveis: { folha: "p" } }], etapas: [{ id: "x", nome: "F", area: "folha" }] });
    assert.equal(velho.equipe[0].setor, "pessoal");
    assert.equal(velho.clientes[0].responsaveis.pessoal, "p");
    assert.equal(velho.etapas[0].area, "pessoal");
  });
});

describe("equipe e resumo", () => {
  test("ausência atual", () => {
    const p = { ausencias: [{ inicio: "2026-11-03", fim: "2026-11-07", motivo: "Atestado" }] };
    assert.equal(D.ausenciaAtual(p, "2026-11-05").motivo, "Atestado");
    assert.equal(D.ausenciaAtual(p, "2026-11-08"), null);
  });
  test("registrarMembro não duplica e atualiza o nome", () => {
    const e = base();
    D.registrarMembro(e, { id: "u1", nome: "Ana Paula" });
    assert.equal(e.equipe.length, 2);
    assert.equal(e.equipe[0].nome, "Ana Paula");
  });
  test("resumo do mês por pessoa e por cliente", () => {
    const e = base();
    assert.equal(D.resumoMes(e, "2026-10", "2026-11-05").geral.atrasadas, 0, "no dia 5 os prazos do dia 5 vencem hoje");
    const r = D.resumoMes(e, "2026-10", "2026-11-06");
    assert.equal(r.porCliente.length, 2);
    assert.equal(r.geral.feitas, 0);
    assert.ok(r.geral.atrasadas > 0, "no dia 6, documentos, extratos e folha (dia 5) estão atrasados");
    assert.equal(r.porPessoa.find((p) => p.pessoa.id === "u1").pessoa.nome, "Ana");
  });
  test("exemplo monta uma demonstração sem nomes reais", () => {
    const e = D.estadoVazio();
    const r = D.exemplo(e, { id: "u1", nome: "Ana", email: "ana@exemplo.com", perfil: "admin" }, "2026-11-05");
    assert.equal(r.mes, "2026-10");
    assert.equal(r.clientes, 8);
    assert.equal(e.equipe.length, 4);
    assert.ok(e.clientes.every((c) => /Exemplo|Ltda|ME|S\.A\.|MEI/.test(c.nome)));
    const res = D.resumoMes(e, "2026-10", "2026-11-05");
    assert.ok(res.geral.feitas > 0 && res.geral.abertas > 0);
    assert.ok(D.ausenciaAtual(D.porId(e.equipe, "exemplo-3"), "2026-11-05"));
    D.exemplo(e, { id: "u1", nome: "Ana" }, "2026-11-05");
    assert.equal(e.clientes.length, 8, "rodar de novo não duplica");
    for (const s of ["contabil", "fiscal", "pessoal"]) assert.ok(D.filtrarDiario(e, { setor: s }).length > 0, "exemplo tem diário no setor " + s);
  });
  test("tirar só os dados de exemplo mantém o que foi cadastrado", () => {
    const e = D.estadoVazio();
    D.exemplo(e, { id: "u1", nome: "Ana", perfil: "admin" }, "2026-11-05");
    e.clientes.push({ id: "real", nome: "Cliente Real Ltda", regime: "Simples Nacional", responsaveis: { contabil: "exemplo-1", fiscal: "u1" }, etapas: null, ativo: true });
    D.registrarDiario(e, { autor: "u1", clienteId: "real", setor: "fiscal", feito: "registro real" });
    assert.ok(D.temExemplo(e));
    const r = D.removerExemplo(e);
    assert.deepEqual([r.clientes, r.equipe], [8, 3]);
    assert.deepEqual(e.clientes.map((c) => c.id), ["real"]);
    assert.deepEqual(e.equipe.map((p) => p.id), ["u1"]);
    assert.deepEqual(e.diario.map((d) => d.feito), ["registro real"]);
    assert.equal(e.clientes[0].responsaveis.contabil, "", "responsável fictício sai do cliente real");
    assert.ok(!D.temExemplo(e));
  });
  test("normalizar recupera estado vazio ou antigo", () => {
    const e = D.normalizar(null);
    assert.ok(e.etapas.length > 10 && Array.isArray(e.diario));
    assert.equal(D.normalizar({ clientes: [{ id: "x" }] }).clientes.length, 1);
  });
});
