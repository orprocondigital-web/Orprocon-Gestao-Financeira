(function(){
  "use strict";

  var I = Integracao;
  var DEFAULT_UNIDADES = ["Matriz","Tubarão","Chapecó","Criciúma","Florianópolis","Passo Fundo"];
  var LIMITE_CADASTRO_TELA = 500;
  var LIMITE_SUGESTOES_NOME = 5000;

  // ---------- contas e unidades cadastradas (lista pequena, fica no localStorage) ----------
  function lerLista(chave){
    try { return JSON.parse(localStorage.getItem(chave)) || []; } catch(e){ return []; }
  }
  function gravarLista(chave, lista){ localStorage.setItem(chave, JSON.stringify(lista)); }

  var bancos = lerLista("system_banks");
  var unidades = lerLista("system_units");
  // contas criadas antes da conta contábil existir: tenta tirar do nome da aba
  bancos.forEach(function(b){
    if (b.contaContabil === undefined) b.contaContabil = I.contaDoNome(b.sheetName || "") || I.contaDoNome(b.label || "");
  });

  var MOVIMENTOS = [
    { id: "mov-dinheiro", label: "Pagamentos em dinheiro", type: "ledger", bank: "Movimento", sheetName: "Pagamento em dinheiro", entraNaIntegracao: true },
    { id: "mov-juros", label: "Juros recebidos", type: "ledger", bank: "Movimento", sheetName: "Juros Recebidos" },
    { id: "mov-compras", label: "Digitação de compras", type: "ledger", bank: "Movimento", sheetName: "Digitação Compras (Nova-teste)" }
  ];
  var CADASTROS = [
    { id: "cad-clientes", label: "Clientes", type: "cadastro", sheetName: "Clientes" },
    { id: "cad-fornecedores", label: "Fornecedores", type: "cadastro", sheetName: "Fornecedores" },
    { id: "cad-plano", label: "Plano de contas", type: "cadastro", sheetName: "Plano de Contas" },
    { id: "cad-custos", label: "Centro de custos", type: "cadastro", sheetName: "Centro de Custos" },
    { id: "cad-bancos", label: "Tabela de bancos", type: "cadastro", sheetName: "Tabela de Bancos" },
    { id: "cad-unidades", label: "Tabela de unidades", type: "cadastro", sheetName: "Tabela de Unidades" }
  ];

  var contasMov = (function(){ try { return JSON.parse(localStorage.getItem("system_mov_contas")) || {}; } catch(e){ return {}; } })();
  MOVIMENTOS.forEach(function(m){ if (m.entraNaIntegracao) m.contaContabil = contasMov[m.id] || ""; });

  var MENU_SECTIONS = [];
  var itemIndex = {};

  function montarMenu(){
    MENU_SECTIONS = [
      { title: "Visão geral", items: [
        { id: "master", label: "Master", type: "master" },
        { id: "conciliacao", label: "Conciliação", type: "conciliacao" }
      ]},
      { title: "Bancos", items: bancos },
      { title: "Unidades", items: unidades },
      { title: "Outras movimentações", items: MOVIMENTOS },
      { title: "Cadastros", items: CADASTROS }
    ];
    itemIndex = {};
    MENU_SECTIONS.forEach(function(sec){
      sec.items.forEach(function(item){ item.section = sec.title; itemIndex[item.id] = item; });
    });
  }
  montarMenu();

  var currentTab = null;
  var editingId = null;

  // ---------- dados (IndexedDB via js/storage.js) ----------
  function storageKey(id){ return "lancamentos:agosto:" + id; }
  function loadEntries(id){ return Store.get(storageKey(id)) || []; }
  function saveEntries(id, entries){
    Store.set(storageKey(id), entries).then(function(ok){
      if (!ok) toast("Não foi possível gravar no navegador. Verifique o espaço em disco.");
    });
    return true;
  }
  function cabecalhoCadastro(id){ return Store.get("cabecalho:" + id) || []; }

  // ---------- helpers ----------
  var brDate = Core.brDate;
  var parseValorInput = Core.parseValor;
  var formatBRNumber = Core.formatBR;
  function $(id){ return document.getElementById(id); }

  function toast(msg){
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._h);
    toast._h = setTimeout(function(){ t.classList.remove("show"); }, 2800);
  }

  function escapeHtml(s){
    return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function(m){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m];
    });
  }

  function limpaPlaceholder(v){ var s = String(v === undefined || v === null ? "" : v).trim(); return I.ehVazioOuPlaceholder(s) ? "" : s; }
  function ehUnidade(item){ return item && item.section === "Unidades"; }
  function nomeDaFonte(item){ return item.bank === "Movimento" ? item.sheetName : (item.sheetName || ((item.bank ? item.bank + " " : "") + item.label)); }

  // ---------- menu lateral ----------
  var ICONS = {
    master: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z"/>',
    conciliacao: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    banco: '<path d="M3 10l9-6 9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18"/>',
    unidade: '<path d="M4 20V8l8-4 8 4v12M9 20v-6h6v6"/>',
    mov: '<path d="M4 7h16M4 12h10M4 17h7"/>',
    cadastro: '<path d="M8 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8zM4 8h4M4 12h4M4 16h4"/>',
    mais: '<path d="M12 5v14M5 12h14"/>'
  };
  var EMPTY_SECTION = { "Bancos": "Nenhuma conta cadastrada", "Unidades": "Criadas ao distribuir por unidade" };

  function iconFor(item){
    if (item.type === "master") return ICONS.master;
    if (item.type === "conciliacao") return ICONS.conciliacao;
    if (item.type === "cadastro") return ICONS.cadastro;
    if (item.section === "Bancos") return ICONS.banco;
    if (item.section === "Unidades") return ICONS.unidade;
    return ICONS.mov;
  }

  function buildSidebar(){
    var wrap = $("sidebar-menu");
    wrap.innerHTML = "";
    MENU_SECTIONS.forEach(function(sec){
      var secEl = document.createElement("div");
      secEl.className = "nav-section";
      var secTitle = document.createElement("div");
      secTitle.className = "nav-title";
      secTitle.innerHTML = "<span>" + escapeHtml(sec.title) + "</span>";
      var acao = sec.title === "Bancos" ? abrirModalConta : (sec.title === "Unidades" ? abrirModalUnidade : null);
      if (acao) {
        var add = document.createElement("button");
        add.className = "nav-add";
        add.type = "button";
        add.title = sec.title === "Bancos" ? "Nova conta bancária" : "Nova unidade";
        add.setAttribute("aria-label", add.title);
        add.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + ICONS.mais + '</svg>';
        add.addEventListener("click", acao);
        secTitle.appendChild(add);
      }
      secEl.appendChild(secTitle);

      if (!sec.items.length && EMPTY_SECTION[sec.title]) {
        var vazio = document.createElement("div");
        vazio.className = "nav-empty";
        vazio.textContent = EMPTY_SECTION[sec.title];
        secEl.appendChild(vazio);
      }

      var subGroups = {}, ordem = [];
      sec.items.forEach(function(item){
        var key = sec.title === "Bancos" ? (item.bank || "") : "";
        if(!subGroups[key]) { subGroups[key] = []; ordem.push(key); }
        subGroups[key].push(item);
      });

      ordem.forEach(function(key){
        var group = document.createElement("div");
        group.className = "nav-group";
        if (key) {
          var title = document.createElement("div");
          title.className = "nav-subtitle";
          title.textContent = key;
          group.appendChild(title);
        }
        subGroups[key].forEach(function(item){
          var btn = document.createElement("button");
          btn.className = "acct-btn";
          btn.id = "btn-" + item.id;
          btn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + iconFor(item) + '</svg>' +
            '<span class="acct-label">' + escapeHtml(item.label) + '</span>' +
            '<span class="acct-count" id="count-' + item.id + '"></span>';
          btn.title = sec.title === "Bancos" ? nomeDaFonte(item) : item.label;
          btn.addEventListener("click", function(){ selectTab(item.id); });
          group.appendChild(btn);
        });
        secEl.appendChild(group);
      });
      wrap.appendChild(secEl);
    });
    refreshCounts();
  }

  function refreshCounts(){
    Object.keys(itemIndex).forEach(function(id){
      var el = $("count-" + id);
      if(el) el.textContent = loadEntries(id).length || "";
    });
  }

  // ---------- navegação ----------
  function selectTab(id){
    if (!itemIndex[id]) id = "master";
    currentTab = id;
    editingId = null;
    var item = itemIndex[id];

    document.querySelectorAll(".acct-btn").forEach(function(b){ b.classList.remove("active"); });
    var btn = $("btn-" + id);
    if (btn) btn.classList.add("active");

    $("view-title").textContent = item.section === "Bancos" ? nomeDaFonte(item) : item.label;
    $("view-sub").textContent = item.section + (item.section === "Bancos" && item.bank ? " / " + item.bank : "");

    ["view-ledger","view-cadastro","view-master","view-conciliacao"].forEach(function(v){ $(v).style.display = "none"; });

    if (item.type === "ledger") {
      $("view-ledger").style.display = "block";
      var derivada = ehUnidade(item);
      $("ledger-note").hidden = !derivada;
      $("ledger-toolbar").hidden = derivada;
      $("ledger-form-panel").hidden = derivada;
      $("f-datamov-wrap").style.display = item.hasDataMov ? "" : "none";
      $("cancel-edit").style.display = "none";
      $("submit-btn").textContent = "Adicionar lançamento";
      $("import-status-ledger").textContent = "";
      $("import-filename-ledger").textContent = "nenhum arquivo escolhido";
      $("file-import-ledger").value = "";
      $("delete-acct").style.display = item.section === "Bancos" ? "" : "none";
      var temContabil = item.section === "Bancos" || item.entraNaIntegracao;
      $("edit-contabil").style.display = temContabil ? "" : "none";
      $("edit-contabil").textContent = item.contaContabil ? "Conta contábil " + item.contaContabil : "Definir conta contábil";
      $("edit-contabil").classList.toggle("btn-danger-ghost", temContabil && !item.contaContabil);
      $("delete-acct").textContent = "Excluir conta";
      resetForm();
      renderLedger();
    }
    else if (item.type === "cadastro") {
      $("view-cadastro").style.display = "block";
      $("import-status-cadastro").textContent = "";
      $("import-filename-cadastro").textContent = "nenhum arquivo escolhido";
      $("file-import-cadastro").value = "";
      renderCadastro();
    }
    else if (item.type === "master") {
      $("view-master").style.display = "block";
      renderMaster();
    }
    else if (item.type === "conciliacao") {
      $("view-conciliacao").style.display = "block";
    }
  }

  // ---------- lançamentos ----------
  function resetForm(){
    $("entry-form").reset();
    setValorSign("C");
    $("form-error").style.display = "none";
  }

  function setValorSign(sign){
    $("btn-c").classList.toggle("active", sign === "C");
    $("btn-d").classList.toggle("active", sign === "D");
    $("entry-form").dataset.sign = sign;
  }

  function formatValorField(){
    var input = $("f-valor");
    var n = parseValorInput(input.value);
    if(!isNaN(n)) input.value = formatBRNumber(Math.abs(n));
  }

  function columnsFor(item){
    if (ehUnidade(item)) {
      return [
        { key: "data", label: "Data" }, { key: "banco", label: "Banco" }, { key: "doc", label: "Doc." },
        { key: "desc", label: "Descrição / fornecedor" }, { key: "categoria", label: "Categoria" },
        { key: "natureza", label: "Natureza" }, { key: "valor", label: "Valor", cls: "num" },
        { key: "contas", label: "Débito / crédito" }, { key: "hp", label: "HP" }
      ];
    }
    var cols = [{ key: "data", label: "Data" }];
    if(item.hasDataMov) cols.push({ key: "dataMov", label: "Data mov." });
    cols.push(
      { key: "desc", label: "Descrição / fornecedor" },
      { key: "doc", label: "Doc." },
      { key: "valor", label: "Valor", cls: "num" },
      { key: "categoria", label: "Categoria" },
      { key: "unidade", label: "Unidade" },
      { key: "natureza", label: "Natureza / conta" },
      { key: "", label: "", cls: "col-actions" }
    );
    return cols;
  }

  function celulaDesc(e){
    var sub = [e.nome, e.cpf || e.cnpj].filter(Boolean).join(", ");
    return escapeHtml(e.desc || e.nome || "") + (sub && sub !== e.desc ? "<span class='cell-sub'>" + escapeHtml(sub) + "</span>" : "");
  }
  function celulaValor(e){
    return '<span class="' + (e.sign === "D" ? "val-d" : "val-c") + '">' + formatBRNumber(e.valorNum) + (e.sign || "") + '</span>';
  }

  function renderLedger(){
    if(!currentTab) return;
    var item = itemIndex[currentTab];
    var entries = loadEntries(currentTab);
    var cols = columnsFor(item);
    var derivada = ehUnidade(item);

    $("ledger-head").innerHTML = cols.map(function(c){
      return "<th" + (c.cls ? ' class="' + c.cls + '"' : "") + ">" + c.label + "</th>";
    }).join("");

    var body = $("ledger-body");
    body.innerHTML = "";
    $("ledger-empty").style.display = entries.length ? "none" : "flex";
    $("ledger-empty").innerHTML = derivada
      ? "<strong>Nada distribuído para esta unidade</strong><span>Classifique os lançamentos nas contas bancárias e use Distribuir por unidade no Master.</span>"
      : "<strong>Nenhum lançamento nesta conta</strong><span>Adicione pelo formulário acima ou importe a aba da planilha.</span>";

    var lista = derivada ? entries : entries.slice().sort(function(a,b){ return (a.data||"").localeCompare(b.data||""); });
    var frag = document.createDocumentFragment();
    lista.forEach(function(e){
      var tr = document.createElement("tr");
      var pendente = !e.categoria;
      if (pendente && !derivada) tr.className = "linha-pendente";
      var html = cols.map(function(c){
        switch(c.key){
          case "data": return "<td>" + brDate(e.data) + "</td>";
          case "dataMov": return "<td>" + brDate(e.dataMov) + "</td>";
          case "banco": return "<td class='col-curta'>" + escapeHtml(e.banco) + "</td>";
          case "desc": return "<td class='col-desc'>" + celulaDesc(e) + "</td>";
          case "doc": return "<td>" + escapeHtml(e.doc || "") + (e.modelo ? "<span class='cell-sub'>" + escapeHtml(e.modelo) + "</span>" : "") + "</td>";
          case "valor": return "<td class='num'>" + celulaValor(e) + "</td>";
          case "categoria": return "<td>" + (pendente ? "<span class='pill pendente'>Pendente</span>" : escapeHtml(e.categoria)) + "</td>";
          case "unidade": return "<td>" + escapeHtml(e.unidade || "") + "</td>";
          case "natureza":
            return "<td class='col-curta'>" + escapeHtml(e.natureza || "") + (e.conta && !derivada ? "<span class='cell-sub'>conta " + escapeHtml(e.conta) + "</span>" : "") + "</td>";
          case "contas":
            var aviso = (!e.ctaDeb || !e.ctaCred) ? " <span class='pill conc-diff' title='Sem conta contábil: confira categoria e conta do banco'>faltando</span>" : "";
            return "<td class='contas'>" + escapeHtml(e.ctaDeb || "—") + " / " + escapeHtml(e.ctaCred || "—") + aviso + "</td>";
          case "hp": return "<td class='contas'>" + escapeHtml(e.hp || "") + "</td>";
          default: return "<td></td>";
        }
      }).join("");
      tr.innerHTML = html;
      if (!derivada) {
        var actionsTd = tr.lastChild;
        actionsTd.className = "row-actions";
        var editBtn = document.createElement("button"); editBtn.textContent = "Editar";
        editBtn.addEventListener("click", function(){ startEdit(e.id); });
        var delBtn = document.createElement("button"); delBtn.textContent = "Excluir";
        delBtn.addEventListener("click", function(){ deleteEntry(e.id); });
        actionsTd.appendChild(editBtn); actionsTd.appendChild(delBtn);
      }
      frag.appendChild(tr);
    });
    body.appendChild(frag);

    var totC = 0, totD = 0, pend = 0;
    entries.forEach(function(e){
      if(e.sign === "D") totD += e.valorNum; else totC += e.valorNum;
      if(!e.categoria) pend++;
    });
    var saldo = totC - totD;
    $("totals").innerHTML =
      '<span>' + entries.length + ' lançamento' + (entries.length === 1 ? '' : 's') + '</span>' +
      (derivada ? '' : '<span>Pendentes<strong class="' + (pend ? 'val-d' : 'val-c') + '">' + pend + '</strong></span>') +
      '<span>Créditos<strong class="val-c">' + formatBRNumber(totC) + 'C</strong></span>' +
      '<span>Débitos<strong class="val-d">' + formatBRNumber(totD) + 'D</strong></span>' +
      '<span>Saldo<strong class="' + (saldo >= 0 ? 'val-c' : 'val-d') + '">' + formatBRNumber(Math.abs(saldo)) + (saldo >= 0 ? 'C' : 'D') + '</strong></span>';

    refreshCounts();
  }

  function garantirOpcao(sel, valor){
    if (!valor) return;
    var existe = Array.prototype.some.call(sel.options, function(o){ return o.value === valor; });
    if (!existe) {
      var o = document.createElement("option");
      o.value = valor; o.textContent = valor;
      sel.appendChild(o);
    }
  }

  function startEdit(id){
    var e = loadEntries(currentTab).filter(function(x){ return x.id === id; })[0];
    if(!e) return;
    editingId = id;
    $("f-data").value = e.data || "";
    $("f-datamov").value = e.dataMov || "";
    $("f-desc").value = e.desc || "";
    $("f-doc").value = e.doc || "";
    garantirOpcao($("f-modelo"), e.modelo); $("f-modelo").value = e.modelo || "";
    $("f-valor").value = formatBRNumber(e.valorNum);
    setValorSign(e.sign);
    garantirOpcao($("f-categoria"), e.categoria); $("f-categoria").value = e.categoria || "";
    garantirOpcao($("f-unidade"), e.unidade); $("f-unidade").value = e.unidade || "";
    $("f-natureza").value = e.natureza || "";
    $("f-conta").value = e.conta || "";
    $("f-nome").value = e.nome || "";
    $("f-cpf").value = e.cpf || "";
    $("submit-btn").textContent = "Salvar edição";
    $("cancel-edit").style.display = "inline-flex";
    $("ledger-form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function deleteEntry(id){
    saveEntries(currentTab, loadEntries(currentTab).filter(function(x){ return x.id !== id; }));
    renderLedger();
    toast("Lançamento excluído.");
  }

  function submitForm(ev){
    ev.preventDefault();
    var item = itemIndex[currentTab];
    var valorNum = parseValorInput($("f-valor").value);
    var dados = {
      data: $("f-data").value,
      dataMov: item.hasDataMov ? $("f-datamov").value : "",
      desc: $("f-desc").value.trim(),
      doc: $("f-doc").value.trim(),
      modelo: $("f-modelo").value,
      valorNum: Math.abs(valorNum),
      sign: $("entry-form").dataset.sign || "C",
      categoria: $("f-categoria").value,
      unidade: $("f-unidade").value,
      natureza: $("f-natureza").value.trim(),
      conta: $("f-conta").value.trim(),
      nome: $("f-nome").value.trim(),
      cpf: $("f-cpf").value.trim()
    };

    if(!dados.data || !dados.desc || isNaN(valorNum)){
      $("form-error").style.display = "block";
      return;
    }
    $("form-error").style.display = "none";

    var entries = loadEntries(currentTab);
    if(editingId){
      entries = entries.map(function(x){ return x.id === editingId ? Object.assign({}, x, dados) : x; });
      editingId = null;
      $("cancel-edit").style.display = "none";
      $("submit-btn").textContent = "Adicionar lançamento";
      toast("Lançamento atualizado.");
    } else {
      dados.id = "e" + Date.now() + Math.random().toString(36).slice(2,7);
      entries.push(dados);
      toast("Lançamento adicionado.");
    }
    saveEntries(currentTab, entries);
    resetForm();
    renderLedger();
  }

  /** Ao escolher a natureza, preenche a conta contábil pelo plano de contas (se estiver vazia). */
  function preencherContaPelaNatureza(){
    var nat = $("f-natureza").value.trim().toLowerCase();
    if (!nat || $("f-conta").value.trim()) return;
    var achou = loadEntries("cad-plano").filter(function(p){ return String(p.nome).trim().toLowerCase() === nat; })[0];
    if (achou && achou.linha && achou.linha[1] !== undefined && achou.linha[1] !== "") $("f-conta").value = String(achou.linha[1]);
  }

  // ---------- cadastros ----------
  function renderCadastro() {
    if(!currentTab) return;
    var entries = loadEntries(currentTab);
    var cab = cabecalhoCadastro(currentTab);
    var nCols = Math.min(Math.max(cab.length, 1), 4);
    $("cadastro-head").innerHTML = (cab.length ? cab.slice(0, nCols) : ["Nome"]).map(function(h){ return "<th>" + escapeHtml(h) + "</th>"; }).join("") + "<th class='col-actions'></th>";

    var body = $("cadastro-body");
    body.innerHTML = "";
    if(entries.length === 0){
      body.innerHTML = "<tr><td colspan='" + (nCols + 1) + "' class='empty'><strong>Nenhum item cadastrado</strong><br>Importe a aba \"" + escapeHtml(itemIndex[currentTab].sheetName) + "\" da planilha.</td></tr>";
    } else {
      var frag = document.createDocumentFragment();
      entries.slice(0, LIMITE_CADASTRO_TELA).forEach(function(e) {
        var tr = document.createElement("tr");
        var celulas = e.linha ? e.linha.slice(0, nCols) : [e.nome];
        while (celulas.length < nCols) celulas.push("");
        tr.innerHTML = celulas.map(function(c){ return "<td>" + escapeHtml(c) + "</td>"; }).join("");
        var actionsTd = document.createElement("td");
        actionsTd.className = "row-actions";
        var delBtn = document.createElement("button"); delBtn.textContent = "Excluir";
        delBtn.addEventListener("click", function(){
          saveEntries(currentTab, loadEntries(currentTab).filter(function(x){ return x.id !== e.id; }));
          renderCadastro();
        });
        actionsTd.appendChild(delBtn);
        tr.appendChild(actionsTd);
        frag.appendChild(tr);
      });
      body.appendChild(frag);
      if (entries.length > LIMITE_CADASTRO_TELA) {
        var tr = document.createElement("tr");
        tr.innerHTML = "<td colspan='" + (nCols + 1) + "' class='empty'>Mostrando os primeiros " + LIMITE_CADASTRO_TELA +
          " de <strong>" + entries.length.toLocaleString("pt-BR") + "</strong> itens.</td>";
        body.appendChild(tr);
      }
    }
    refreshCounts();
    refreshFormOptions();
  }

  // ---------- integração contábil (Master) ----------
  function fontesIntegracao(){
    var fontes = bancos.map(function(b){
      return { id: b.id, nome: nomeDaFonte(b), contaBanco: b.contaContabil || "", lancamentos: loadEntries(b.id) };
    });
    MOVIMENTOS.filter(function(m){ return m.entraNaIntegracao; }).forEach(function(m){
      fontes.push({ id: m.id, nome: m.sheetName, contaBanco: m.contaContabil || "", lancamentos: loadEntries(m.id) });
    });
    return fontes;
  }

  function tabelaUnidades(){ return loadEntries("cad-unidades").filter(function(e){ return e.linha && String(e.linha[0]).trim(); }); }

  function nomesUnidades(){
    var t = tabelaUnidades().map(function(e){ return String(e.linha[0]).trim(); });
    if (t.length) return t;
    if (unidades.length) return unidades.map(function(u){ return u.label; });
    return DEFAULT_UNIDADES;
  }

  function idUnidade(nome){
    var achou = unidades.filter(function(u){ return u.label.toLowerCase() === nome.toLowerCase(); })[0];
    return achou ? achou.id : null;
  }

  function renderMaster() {
    var fontes = fontesIntegracao();
    var st = I.estatisticasMaster(fontes, nomesUnidades());

    var tot = 0, cls = 0;
    st.bancos.forEach(function(b){ tot += b.total; cls += b.classificados; });
    var pct = tot ? Math.round(cls / tot * 100) : 0;
    $("master-resumo").innerHTML = tot
      ? '<div class="conc-headline"><h2>' + cls.toLocaleString("pt-BR") + ' de ' + tot.toLocaleString("pt-BR") + ' lançamentos classificados</h2>' +
        '<div class="diff">Pendentes<strong class="' + (tot - cls ? "val-d" : "val-c") + '">' + (tot - cls).toLocaleString("pt-BR") + '</strong></div></div>' +
        '<div class="conc-bar" role="img" aria-label="' + pct + '% classificado"><span class="b-ok" style="flex:' + cls + '"></span>' +
        (tot - cls ? '<span class="b-miss" style="flex:' + (tot - cls) + '"></span>' : '') + '</div>'
      : '<div class="conc-headline"><h2>Nenhum lançamento ainda</h2></div><p class="muted small">Cadastre as contas bancárias, importe as abas da planilha e classifique categoria e unidade.</p>';

    var tbU = $("master-body-unidades");
    tbU.innerHTML = "";
    st.unidades.forEach(function(u){
      var tr = document.createElement("tr");
      var id = idUnidade(u.nome);
      if (id) { tr.className = "clicavel"; tr.addEventListener("click", function(){ selectTab(id); }); tr.title = "Abrir " + u.nome; }
      var pctTxt = u.pct === null ? "—" : u.pct.toFixed(1).replace(".", ",") + "%";
      tr.innerHTML = "<td>" + escapeHtml(u.nome) + (id ? "" : "<span class='cell-sub'>ainda não distribuída</span>") + "</td>" +
        "<td class='num val-c'>" + u.classificados + "</td>" +
        "<td class='num" + (u.pendentes ? " val-d" : "") + "'>" + u.pendentes + "</td>" +
        "<td class='num'><strong>" + u.total + "</strong></td>" +
        "<td class='num'>" + (u.pct === null ? "" : "<span class='pct-bar'><i style='width:" + u.pct + "%'></i></span>") + pctTxt + "</td>";
      tbU.appendChild(tr);
    });

    var tbB = $("master-body-bancos");
    tbB.innerHTML = "";
    if (!st.bancos.length) tbB.innerHTML = "<tr><td colspan='4' class='empty'>Nenhuma conta cadastrada.</td></tr>";
    st.bancos.forEach(function(b){
      var tr = document.createElement("tr");
      tr.className = "clicavel";
      tr.addEventListener("click", function(){ selectTab(b.id); });
      var item = itemIndex[b.id];
      var semConta = item && (item.section === "Bancos" || item.entraNaIntegracao) && !item.contaContabil && b.total > 0;
      tr.innerHTML = "<td>" + escapeHtml(b.nome) + (semConta ? "<span class='cell-sub val-d'>sem conta contábil</span>" : "") + "</td>" +
        "<td class='num val-c'>" + b.classificados + "</td>" +
        "<td class='num" + (b.pendentes ? " val-d" : "") + "'>" + b.pendentes + "</td>" +
        "<td class='num'><strong>" + b.total + "</strong></td>";
      tbB.appendChild(tr);
    });
  }

  function distribuirPorUnidade(silencioso){
    var tx = I.coletarTransacoes(fontesIntegracao());
    if (!tx.length) {
      if (!silencioso) $("master-status").textContent = "Nenhum lançamento classificado. Preencha categoria e unidade nas contas bancárias.";
      return null;
    }
    var dist = I.distribuirPorUnidade(tx);
    var criadas = 0;
    dist.forEach(function(d){
      var id = idUnidade(d.unidade);
      if (!id) {
        id = "unid-" + Date.now() + "-" + criadas;
        unidades.push({ id: id, label: d.unidade, type: "ledger", bank: "Unidade", sheetName: d.unidade, hasDataMov: false });
        criadas++;
      }
      saveEntries(id, d.linhas.map(function(l, i){ return Object.assign({ id: id + "-" + i }, l); }));
    });
    // unidades sem lançamento nesta rodada ficam vazias (igual à planilha)
    unidades.forEach(function(u){
      if (!dist.some(function(d){ return d.unidade.toLowerCase() === u.label.toLowerCase(); })) saveEntries(u.id, []);
    });
    if (criadas) { gravarLista("system_units", unidades); montarMenu(); buildSidebar(); populateConcSelect(); }
    refreshCounts();

    var semConta = 0;
    dist.forEach(function(d){ semConta += I.semConta(d.linhas).length; });
    var msg = tx.length.toLocaleString("pt-BR") + " lançamentos distribuídos para " + dist.length + " unidade(s), ordenados por Despesa, Pagamento e Recebimento.";
    if (semConta) msg += " Atenção: " + semConta + " sem conta de débito ou crédito (veja a coluna Débito / crédito).";
    if (!silencioso) { $("master-status").textContent = msg; toast("Distribuição concluída."); }
    return { dist: dist, semConta: semConta };
  }

  function baixarArquivos(arquivos){
    arquivos.forEach(function(a, i){
      setTimeout(function(){
        var blob = new Blob([a.conteudo], { type: "text/plain;charset=utf-8" }); // UTF-8 sem BOM
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = a.nome;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(function(){ URL.revokeObjectURL(link.href); }, 2000);
      }, i * 300);
    });
  }

  function gerarTxts(formato){
    var r = distribuirPorUnidade(true);
    if (!r) { $("master-status").textContent = "Nenhum lançamento classificado para gerar TXT."; return; }
    var tabela = tabelaUnidades();
    if (!tabela.length) {
      $("master-status").textContent = "Importe a Tabela de unidades (em Cadastros) antes: ela traz o CNPJ e o código SCI de cada unidade.";
      return;
    }
    if (r.semConta && !confirm(
      r.semConta + " lançamento(s) estão sem conta de débito ou crédito e seriam recusados pelo Único.\n\n" +
      "OK = gerar os TXTs só com os lançamentos completos e baixar a lista de pendências para corrigir.\n" +
      "Cancelar = não gerar agora.")) return;

    var opcoes = { ignorarSemConta: true };
    var arquivos = formato === "unico"
      ? I.gerarTxtsUnico(r.dist, tabela, loadEntries("cad-custos"), opcoes)
      : I.gerarTxts(r.dist, tabela, opcoes);
    if (!arquivos.length) { $("master-status").textContent = "Nenhuma unidade da Tabela de unidades tem lançamentos completos."; return; }
    if (r.semConta) arquivos.push({ nome: "PENDENCIAS_" + (formato === "unico" ? "UNICO" : "TXT") + ".csv", conteudo: I.pendenciasCSV(r.dist, nomesUnidades()) });
    baixarArquivos(arquivos);

    var foraDaTabela = r.dist.filter(function(d){ return !I.infoUnidade(tabela, d.unidade); }).map(function(d){ return d.unidade; });
    var destino = formato === "unico"
      ? arquivos.filter(function(a){ return /^UNICO_/.test(a.nome); }).map(function(a){
          var uni = r.dist.filter(function(d){ return a.nome === "UNICO_" + d.unidade.split(" ").join("_") + ".txt"; })[0];
          var info = uni && I.infoUnidade(tabela, uni.unidade);
          return a.nome + " → empresa " + (info ? info.codigo : "?");
        }).join("; ")
      : arquivos.map(function(a){ return a.nome; }).join(", ");
    var msg = "Arquivos gerados: " + destino + ".";
    if (formato === "unico") msg += " Importe cada arquivo no Único com a empresa indicada.";
    if (r.semConta) msg += " " + r.semConta + " lançamento(s) ficaram de fora: veja o arquivo de pendências.";
    if (foraDaTabela.length) msg += " Sem arquivo por não estarem na Tabela de unidades: " + foraDaTabela.join(", ") + ".";
    $("master-status").textContent = msg;
    renderMaster();
  }

  // ---------- importação de planilhas ----------
  function importFile(file, isLedger){
    var statusEl = $(isLedger ? "import-status-ledger" : "import-status-cadastro");
    $(isLedger ? "import-filename-ledger" : "import-filename-cadastro").textContent = file.name;
    if (typeof XLSX === "undefined") { statusEl.textContent = "O leitor de planilhas não carregou. Verifique a conexão com a internet e recarregue a página."; return; }
    statusEl.textContent = "Lendo arquivo…";
    var tab = currentTab;

    var reader = new FileReader();
    reader.onload = function(ev){
      try {
        var wb = XLSX.read(new Uint8Array(ev.target.result), { type: "array", cellDates: true });
        var item = itemIndex[tab];
        var foundSheet = Core.findSheet(wb.SheetNames, { sheetName: nomeDaFonte(item), label: item.label, conta: item.conta });
        if(!foundSheet){
          statusEl.textContent = "Não encontrei a aba \"" + nomeDaFonte(item) + "\" neste arquivo. Abas disponíveis: " + wb.SheetNames.join(", ");
          return;
        }

        var rows = XLSX.utils.sheet_to_json(wb.Sheets[foundSheet], { header: 1, raw: true, defval: "" });
        var headerIdx = Core.detectHeaderRow(rows);
        var col = Core.buildColumnMap(rows[headerIdx]);
        var get = function(row, k){ return col[k] !== undefined ? String(row[col[k]] === null || row[col[k]] === undefined ? "" : row[col[k]]).trim() : ""; };

        var imported = [], ignoradas = 0, stamp = Date.now();
        for(var r = headerIdx + 1; r < rows.length; r++){
          var row = rows[r];
          if(!row || row.every(function(c){ return c === "" || c === null || c === undefined; })) continue;

          if (isLedger) {
            var isoDate = Core.toIsoDate(col.data !== undefined ? row[col.data] : "");
            var v = Core.parseValorCell(col.valor !== undefined ? row[col.valor] : "");
            if(!isoDate || !v){
              if (v && limpaPlaceholder(get(row, "categoria"))) ignoradas++;   // classificada, mas sem data
              continue;
            }
            var desc = get(row, "desc") || get(row, "nome") || get(row, "natureza") || "SEM DESCRIÇÃO";
            imported.push({
              id: "e" + stamp + "-" + r,
              data: isoDate,
              dataMov: item.hasDataMov ? Core.toIsoDate(col.dataMov !== undefined ? row[col.dataMov] : "") : "",
              desc: desc, doc: get(row, "doc"), modelo: limpaPlaceholder(get(row, "modelo")),
              valorNum: v.valorNum, sign: v.sign,
              categoria: limpaPlaceholder(get(row, "categoria")), unidade: limpaPlaceholder(get(row, "unidade")),
              natureza: limpaPlaceholder(get(row, "natureza")), conta: get(row, "conta"),
              nome: get(row, "nome"), cpf: get(row, "cpf")
            });
          } else {
            var nome = get(row, "nome") || get(row, "desc");
            if (!nome) {
              for (var c = 0; c < row.length; c++) {
                var cel = String(row[c] === null || row[c] === undefined ? "" : row[c]).trim();
                if (cel.length > 1 && isNaN(Number(cel))) { nome = cel; break; }
              }
            }
            if (!nome) continue;
            imported.push({
              id: "c" + stamp + "-" + r,
              nome: nome,
              linha: row.map(function(x){ return x instanceof Date ? Core.brDate(Core.toIsoDate(x)) : (x === null || x === undefined ? "" : x); })
            });
          }
        }

        if(imported.length === 0){
          statusEl.textContent = "Nenhum dado reconhecido na aba \"" + foundSheet + "\".";
          return;
        }

        var existing = loadEntries(tab);
        var append = existing.length === 0 || confirm(
          "Encontrei " + imported.length + " item(ns) na aba \"" + foundSheet + "\".\n\n" +
          "OK = adicionar aos " + existing.length + " já existentes.\n" +
          "Cancelar = substituir os existentes por estes."
        );
        var finalEntries = append ? existing.concat(imported) : imported;
        if(!isLedger) {
          var seen = {};
          finalEntries = finalEntries.filter(function(c){ var k = String(c.nome); if (seen[k]) return false; seen[k] = true; return true; });
          Store.set("cabecalho:" + tab, (rows[headerIdx] || []).map(function(h){ return String(h || "").trim(); }));
        }
        saveEntries(tab, finalEntries);

        if (isLedger) renderLedger(); else renderCadastro();
        var msg = imported.length.toLocaleString("pt-BR") + " item(ns) importado(s) da aba \"" + foundSheet + "\".";
        if (ignoradas) msg += " " + ignoradas + " linha(s) classificadas ficaram de fora por não terem data. A planilha também não as envia ao Único.";
        statusEl.textContent = msg;
        toast("Importação concluída.");
      } catch(err){
        console.error(err);
        statusEl.textContent = "Erro ao ler arquivo: " + (err.message || "desconhecido");
      }
    };
    reader.onerror = function(){ statusEl.textContent = "Falha ao ler o arquivo."; };
    reader.readAsArrayBuffer(file);
  }

  // ---------- Conciliação ----------
  function populateConcSelect() {
    var sel = $("conc-acct");
    var atual = sel.value;
    sel.innerHTML = '<option value="" disabled selected>Escolha uma conta…</option>';
    bancos.concat(MOVIMENTOS).forEach(function(item){
      var opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.section === "Bancos" ? nomeDaFonte(item) : item.label;
      sel.appendChild(opt);
    });
    if (atual && itemIndex[atual]) sel.value = atual;
  }

  var ultimaConc = null; // { acctId, extrato, formato, arquivo } — permite refiltrar sem reimportar

  var STATUS_CONC = {
    ok:             { classe: "conc-match", texto: "Conciliado", barra: "b-ok" },
    data_diferente: { classe: "conc-warn",  texto: "Data diferente", barra: "b-warn" },
    so_extrato:     { classe: "conc-diff",  texto: "Só no banco", barra: "b-diff" },
    so_sistema:     { classe: "conc-miss",  texto: "Só no sistema", barra: "b-miss" }
  };

  function runConciliacao(file) {
    var acctId = document.getElementById("conc-acct").value;
    var statusEl = document.getElementById("import-status-conc");
    if (!acctId) {
      statusEl.textContent = "Por favor, selecione a conta antes de importar o arquivo.";
      document.getElementById("file-import-conc").value = "";
      return;
    }
    document.getElementById("import-filename-conc").textContent = file.name;
    statusEl.textContent = "Processando " + file.name + "...";

    var ehTexto = /\.(csv|txt|ofx)$/i.test(file.name);
    var reader = new FileReader();
    reader.onload = function(ev){
      try {
        var bytes = new Uint8Array(ev.target.result);
        var r;
        if (ehTexto) {
          r = Core.parseExtratoTexto(Core.decodeText(bytes));
        } else {
          var wb = XLSX.read(bytes, { type: "array", cellDates: true });
          r = Core.parseExtratoRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" }));
          r.formato = "planilha";
        }
        if (!r.ok) { statusEl.textContent = r.erro; return; }
        if (r.itens.length === 0) { statusEl.textContent = "Nenhuma movimentação reconhecida no arquivo."; return; }

        ultimaConc = { acctId: acctId, extrato: r.itens, formato: r.formato, arquivo: file.name };
        renderConciliacao();
        statusEl.textContent = r.itens.length + " movimentação(ões) lidas (formato " + r.formato + ").";
      } catch(e) {
        console.error(e);
        statusEl.textContent = "Erro ao processar o arquivo: " + e.message;
      } finally {
        document.getElementById("file-import-conc").value = "";
      }
    };
    reader.onerror = function(){ statusEl.textContent = "Falha ao ler o arquivo."; };
    reader.readAsArrayBuffer(file);
  }

  function renderConciliacao() {
    if (!ultimaConc) return;
    var filtro = (document.getElementById("conc-filter").value || "").toLowerCase().trim();
    var tolerancia = parseInt(document.getElementById("conc-tolerancia").value, 10);
    if (isNaN(tolerancia) || tolerancia < 0) tolerancia = 0;

    var extrato = ultimaConc.extrato;
    var sistema = loadEntries(ultimaConc.acctId);
    if (filtro) {
      extrato = extrato.filter(function(e){ return String(e.texto || e.desc).toLowerCase().indexOf(filtro) > -1; });
      sistema = sistema.filter(function(s){
        return [s.desc, s.nome, s.cpf, s.doc].join(" ").toLowerCase().indexOf(filtro) > -1;
      });
    }

    var res = Core.conciliar(extrato, sistema, { toleranciaDias: tolerancia });
    var ordem = { so_extrato: 0, so_sistema: 1, data_diferente: 2, ok: 3 };
    var linhas = res.linhas.slice().sort(function(a, b){
      var da = (a.extrato || a.sistema).data, db = (b.extrato || b.sistema).data;
      return ordem[a.status] - ordem[b.status] || da.localeCompare(db);
    });

    var valor = function(l){ return l ? '<span class="' + (l.sign === "D" ? "val-d" : "val-c") + '">' + formatBRNumber(l.valorNum) + l.sign + "</span>" : '<span class="muted">—</span>'; };
    document.getElementById("conc-body").innerHTML = linhas.map(function(l){
      var st = STATUS_CONC[l.status];
      var e = l.extrato, s = l.sistema;
      var descBanco = e ? escapeHtml(e.desc) + (e.nome || e.cpfCnpj ? "<span class='cell-sub'>" + escapeHtml([e.nome, e.cpfCnpj].filter(Boolean).join(", ")) + "</span>" : "") : "";
      return "<tr>" +
        "<td>" + (e ? brDate(e.data) : "") + "</td>" +
        "<td>" + descBanco + "</td>" +
        "<td class='num'>" + valor(e) + "</td>" +
        "<td><span class='pill " + st.classe + "'>" + st.texto + "</span></td>" +
        "<td>" + (s ? brDate(s.data) : "") + "</td>" +
        "<td class='num'>" + valor(s) + "</td>" +
        "<td>" + (s ? escapeHtml(s.desc) : "<span class='muted'>Não lançado</span>") + "</td>" +
      "</tr>";
    }).join("");

    var r = res.resumo;
    var dif = r.diferencaCents / 100;
    var total = res.linhas.length || 1;
    var partes = ["ok", "data_diferente", "so_extrato", "so_sistema"];
    var barra = partes.filter(function(k){ return r[k] > 0; }).map(function(k){
      return '<span class="' + STATUS_CONC[k].barra + '" style="flex:' + r[k] + '" title="' + STATUS_CONC[k].texto + ': ' + r[k] + '"></span>';
    }).join("");
    var legenda = partes.map(function(k){
      return '<span><i class="' + STATUS_CONC[k].barra + '"></i>' + STATUS_CONC[k].texto + ' <strong>' + r[k] + '</strong></span>';
    }).join("");
    var pendentes = r.so_extrato + r.so_sistema;
    var pct = Math.round((r.ok + r.data_diferente) / total * 100);
    var titulo = r.fechado ? "Conciliação fechada" :
      pendentes + (pendentes === 1 ? " pendência" : " pendências") + ", " + pct + "% conciliado";
    document.getElementById("conc-totals").innerHTML =
      '<div class="conc-headline"><h2>' + titulo + '</h2>' +
      '<div class="diff">Diferença de saldo, banco menos sistema<strong class="' + (dif === 0 ? "val-c" : "val-d") + '">' + formatBRNumber(dif) + '</strong></div></div>' +
      '<div class="conc-bar" role="img" aria-label="' + pct + '% conciliado">' + barra + '</div>' +
      '<div class="conc-legend">' + legenda + '</div>';
    document.getElementById("conc-results-panel").style.display = "block";
  }

  // ---------- Exportação ----------
  function lancamentosDaAba() {
    return loadEntries(currentTab).slice().sort(function(a,b){ return (a.data||"").localeCompare(b.data||""); });
  }

  function exportarCSV() {
    if (!currentTab) return;
    var item = itemIndex[currentTab];
    var entries = lancamentosDaAba();
    if (!entries.length) { toast("Nada para exportar nesta conta."); return; }
    var blob = new Blob([Core.toCSV(entries, item.hasDataMov)], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ((item.bank ? item.bank + " " : "") + item.label).replace(/[\\/:*?"<>|]/g, "_") + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  }

  function copiarParaExcel() {
    if (!currentTab) return;
    var entries = lancamentosDaAba();
    if (!entries.length) { toast("Nada para copiar nesta conta."); return; }
    var texto = Core.toTSV(entries, itemIndex[currentTab].hasDataMov);
    navigator.clipboard.writeText(texto).then(
      function(){ toast(entries.length + " lançamento(s) copiados. Cole no Excel."); },
      function(){ toast("O navegador bloqueou a cópia."); }
    );
  }

  // ---------- modais: nova conta e nova unidade ----------
  function abrirModalConta(){
    ["modal-bank-ag","modal-bank-cc","modal-bank-contabil"].forEach(function(id){ $(id).value = ""; });
    $("modal-add-account").style.display = "flex";
    $("modal-bank-select").focus();
  }
  function abrirModalUnidade(){
    $("modal-unit-name").value = "";
    $("modal-add-unit").style.display = "flex";
    $("modal-unit-name").focus();
  }

  $("modal-bank-cancel").addEventListener("click", function(){ $("modal-add-account").style.display = "none"; });
  $("modal-unit-cancel").addEventListener("click", function(){ $("modal-add-unit").style.display = "none"; });

  $("modal-bank-save").addEventListener("click", function() {
    var banco = $("modal-bank-select").value.toUpperCase();
    var cc = $("modal-bank-cc").value.trim().toUpperCase();
    var contabil = $("modal-bank-contabil").value.trim();
    var ag = $("modal-bank-ag").value.trim();
    if (!cc || !contabil) { alert("Preencha o número da conta e a conta contábil no Único."); return; }
    if (!/^\d+$/.test(contabil)) { alert("A conta contábil deve ter só números (ex.: 643)."); return; }

    // mesmo padrão dos nomes de aba da planilha: "SICOOB 24402-3 Conta 643"
    var id = "banco-" + Date.now();
    var nova = {
      id: id, type: "ledger", bank: banco,
      label: cc + " Conta " + contabil,
      sheetName: banco + " " + cc + " Conta " + contabil,
      agencia: ag, conta: cc, contaContabil: contabil, hasDataMov: true
    };
    bancos.push(nova);
    gravarLista("system_banks", bancos);
    montarMenu(); buildSidebar(); populateConcSelect();
    selectTab(id);
    $("modal-add-account").style.display = "none";
  });

  $("modal-unit-save").addEventListener("click", function() {
    var nome = $("modal-unit-name").value.trim();
    if (!nome) { alert("Digite o nome da unidade."); return; }
    if (idUnidade(nome)) { alert("Essa unidade já existe."); return; }
    var id = "unid-" + Date.now();
    unidades.push({ id: id, label: nome, type: "ledger", bank: "Unidade", sheetName: nome, hasDataMov: false });
    gravarLista("system_units", unidades);
    montarMenu(); buildSidebar(); populateConcSelect();
    selectTab(id);
    $("modal-add-unit").style.display = "none";
  });

  document.querySelectorAll(".modal").forEach(function(m){
    m.addEventListener("keydown", function(e){ if (e.key === "Escape") m.style.display = "none"; });
  });

  // ---------- eventos ----------
  $("btn-c").addEventListener("click", function(){ setValorSign("C"); });
  $("btn-d").addEventListener("click", function(){ setValorSign("D"); });
  $("f-valor").addEventListener("blur", formatValorField);
  $("f-natureza").addEventListener("change", preencherContaPelaNatureza);
  $("entry-form").addEventListener("submit", submitForm);
  $("cancel-edit").addEventListener("click", function(){
    editingId = null;
    resetForm();
    $("cancel-edit").style.display = "none";
    $("submit-btn").textContent = "Adicionar lançamento";
  });

  $("file-import-ledger").addEventListener("change", function(ev){
    if(ev.target.files && ev.target.files[0]) importFile(ev.target.files[0], true);
  });
  $("file-import-cadastro").addEventListener("change", function(ev){
    if(ev.target.files && ev.target.files[0]) importFile(ev.target.files[0], false);
  });
  $("file-import-conc").addEventListener("change", function(ev){
    if(ev.target.files && ev.target.files[0]) runConciliacao(ev.target.files[0]);
  });
  $("conc-filter").addEventListener("input", renderConciliacao);
  $("conc-tolerancia").addEventListener("input", renderConciliacao);
  $("conc-acct").addEventListener("change", function(){
    if (ultimaConc) { ultimaConc.acctId = this.value; renderConciliacao(); }
  });
  $("export-csv").addEventListener("click", exportarCSV);
  $("export-clip").addEventListener("click", copiarParaExcel);

  $("btn-master-distribuir").addEventListener("click", function(){
    if (distribuirPorUnidade(false)) renderMaster();
  });
  $("btn-redistribuir").addEventListener("click", function(){
    distribuirPorUnidade(false);
    renderLedger();
  });
  $("btn-master-txt-atual").addEventListener("click", function(){ gerarTxts("atual"); });
  $("btn-master-txt-unico").addEventListener("click", function(){ gerarTxts("unico"); });

  function clearCurrentTab() {
    if(!currentTab) return;
    if(confirm("Apagar tudo o que está salvo em \"" + itemIndex[currentTab].label + "\" neste navegador?")){
      saveEntries(currentTab, []);
      if (itemIndex[currentTab].type === "ledger") renderLedger(); else renderCadastro();
      toast("Apagado.");
    }
  }
  $("clear-acct").addEventListener("click", clearCurrentTab);
  $("clear-acct-top").addEventListener("click", clearCurrentTab);
  $("clear-cadastro").addEventListener("click", clearCurrentTab);

  $("edit-contabil").addEventListener("click", function(){
    var item = itemIndex[currentTab];
    if (!item || !(item.section === "Bancos" || item.entraNaIntegracao)) return;
    var dica = item.entraNaIntegracao ? " A Tabela de bancos da planilha lista o Caixa com a conta 5." : "";
    var novo = prompt("Conta contábil no Único (só números)." + dica, item.contaContabil || "");
    if (novo === null) return;
    novo = novo.trim();
    if (!/^\d+$/.test(novo)) { alert("Use só números."); return; }
    item.contaContabil = novo;
    if (item.entraNaIntegracao) { contasMov[item.id] = novo; localStorage.setItem("system_mov_contas", JSON.stringify(contasMov)); }
    else gravarLista("system_banks", bancos);
    selectTab(item.id);
    toast("Conta contábil atualizada.");
  });

  $("delete-acct").addEventListener("click", function() {
    var item = itemIndex[currentTab];
    if(!item || item.section !== "Bancos") return;
    if(!confirm("Excluir a conta \"" + nomeDaFonte(item) + "\" e todos os lançamentos dela? Não dá para desfazer.")) return;
    saveEntries(currentTab, []);
    bancos = bancos.filter(function(b){ return b.id !== currentTab; });
    gravarLista("system_banks", bancos);
    montarMenu(); buildSidebar(); populateConcSelect();
    selectTab(bancos.length ? bancos[0].id : "master");
    toast("Conta excluída.");
  });

  // ---------- opções do formulário ----------
  function fillSelect(sel, options, vazio){
    sel.innerHTML = '<option value="">' + escapeHtml(vazio) + '</option>' +
      options.map(function(o){ return '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>'; }).join("");
  }

  function refreshFormOptions() {
    fillSelect($("f-categoria"), I.CATEGORIAS, "Pendente (sem categoria)");
    fillSelect($("f-unidade"), nomesUnidades(), "Sem unidade");
    fillSelect($("f-modelo"), I.MODELOS_DOC, "—");

    $("dl-naturezas").innerHTML = loadEntries("cad-plano").map(function(e){
      return '<option value="' + escapeHtml(e.nome) + '">' + (e.linha && e.linha[1] ? "conta " + escapeHtml(e.linha[1]) : "") + '</option>';
    }).join("");

    var vistos = {}, nomes = [];
    loadEntries("cad-fornecedores").concat(loadEntries("cad-clientes")).some(function(e){
      if (e.nome && !vistos[e.nome]) { vistos[e.nome] = true; nomes.push(e.nome); }
      return nomes.length >= LIMITE_SUGESTOES_NOME;
    });
    $("dl-nomes").innerHTML = nomes.sort().map(function(n){ return '<option value="' + escapeHtml(n) + '">'; }).join("");
  }

  // ---------- tema claro/escuro ----------
  var mqEscuro = window.matchMedia("(prefers-color-scheme: dark)");
  function temaAtual(){
    var t = document.documentElement.getAttribute("data-theme");
    return t || (mqEscuro.matches ? "dark" : "light");
  }
  function atualizarBotaoTema(){
    var escuro = temaAtual() === "dark";
    document.documentElement.classList.toggle("escuro", escuro);
    var rotulo = escuro ? "Ativar tema claro" : "Ativar tema escuro";
    $("theme-toggle").setAttribute("aria-label", rotulo);
    $("theme-toggle").title = rotulo;
  }
  $("theme-toggle").addEventListener("click", function(){
    var novo = temaAtual() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", novo);
    try { localStorage.setItem("tema", novo); } catch(e) {}
    atualizarBotaoTema();
  });
  if (mqEscuro.addEventListener) mqEscuro.addEventListener("change", atualizarBotaoTema);
  atualizarBotaoTema();

  // ---------- início ----------
  Store.init().then(function(ok){
    if (!ok) toast("Este navegador não permite gravar dados. Nada será salvo.");
    refreshFormOptions();
    buildSidebar();
    populateConcSelect();
    selectTab(bancos.length ? bancos[0].id : "master");
    $("content").setAttribute("aria-busy", "false");
  });

  window.addEventListener("beforeunload", function(e){
    if (Store.gravando()) { e.preventDefault(); e.returnValue = ""; }
  });

})();
