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

  // ---------- usuário logado (o login é feito em login.html; ver js/auth.js) ----------
  var Auth = null;   // criado depois do Store.init
  var usuarioLogado = (function(){ try { return JSON.parse(localStorage.getItem(AuthCore.CHAVE_SESSAO) || "null"); } catch(e) { return null; } })();
  function pode(area){ return AuthCore.podeAcessar(usuarioLogado, area); }
  function ehAdmin(){ return !!usuarioLogado && usuarioLogado.perfil === "admin"; }
  var SECOES_INTEGRACAO = { "Bancos": 1, "Unidades": 1, "Outras movimentações": 1, "Cadastros": 1 };

  function montarMenu(){
    MENU_SECTIONS = [
      { title: "Visão geral", items: [
        { id: "master", label: "Master", type: "master" },
        { id: "conciliacao", label: "Conciliação", type: "conciliacao" }
      ]},
      { title: "Módulos", items: Modulos.LISTA.map(function(m){ return { id: m.id, label: m.label, type: "modulo", descricao: m.descricao }; }) },
      { title: "Bancos", items: bancos },
      { title: "Unidades", items: unidades },
      { title: "Outras movimentações", items: MOVIMENTOS },
      { title: "Cadastros", items: CADASTROS }
    ];
    if (ehAdmin()) MENU_SECTIONS.push({ title: "Administração", items: [{ id: "usuarios", label: "Usuários", type: "usuarios" }] });
    // só o que a pessoa pode acessar
    MENU_SECTIONS = MENU_SECTIONS.map(function(sec){
      if (SECOES_INTEGRACAO[sec.title] && !pode("integracao")) return null;
      var items = sec.items.filter(function(item){
        if (item.type === "master") return pode("integracao");
        if (item.type === "conciliacao") return pode("conciliacao");
        if (item.type === "modulo") return pode(item.id);
        return true;
      });
      if (!items.length && !SECOES_INTEGRACAO[sec.title]) return null;
      return { title: sec.title, items: items };
    }).filter(Boolean);
    itemIndex = {};
    MENU_SECTIONS.forEach(function(sec){
      sec.items.forEach(function(item){ item.section = sec.title; itemIndex[item.id] = item; });
    });
  }
  montarMenu();

  var currentTab = null;
  var editingId = null;

  // ---------- dados (IndexedDB via js/storage.js) ----------
  // Cada mês (competência) tem os seus lançamentos; os cadastros valem para todos os meses.
  function mesAtual(){ var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  var competencia = localStorage.getItem("competencia") || mesAtual();
  function storageKey(id){
    return id.indexOf("cad-") === 0 ? "cadastro:" + id : "lancamentos:" + competencia + ":" + id;
  }
  function loadEntries(id){ return Store.get(storageKey(id)) || []; }
  function saveEntries(id, entries){
    Store.set(storageKey(id), entries).then(function(ok){
      if (!ok) toast("Não foi possível gravar no navegador. Verifique o espaço em disco.");
    });
    return true;
  }
  function cabecalhoCadastro(id){ return Store.get("cabecalho:" + id) || []; }

  /** Versões até 0.4 guardavam tudo em "lancamentos:agosto:*", sem mês. Move para a competência certa, uma vez. */
  function migrarParaCompetencias(){
    var antigas = Store.keys().filter(function(k){ return k.indexOf("lancamentos:agosto:") === 0; });
    if (!antigas.length) return Promise.resolve(null);
    var datas = [];
    antigas.forEach(function(k){
      var id = k.slice("lancamentos:agosto:".length);
      if (id.indexOf("cad-") !== 0 && id.indexOf("unid-") !== 0) datas = datas.concat(Store.get(k) || []);
    });
    var mes = Importacao.competenciaDominante(datas) || mesAtual();
    return Promise.all(antigas.map(function(k){
      var id = k.slice("lancamentos:agosto:".length);
      var nova = id.indexOf("cad-") === 0 ? "cadastro:" + id : "lancamentos:" + mes + ":" + id;
      var valor = Store.get(k);
      return (Store.get(nova) ? Promise.resolve() : Store.set(nova, valor)).then(function(){ return Store.remove(k); });
    })).then(function(){ return mes; });
  }

  function competenciasComDados(){
    var meses = {};
    Store.keys().forEach(function(k){
      var m = /^lancamentos:(\d{4}-\d{2}):/.exec(k);
      if (m && (Store.get(k) || []).length) meses[m[1]] = true;
    });
    return meses;
  }

  function preencherCompetencias(){
    var sel = $("competencia");
    var meses = competenciasComDados();
    meses[competencia] = true;
    meses[mesAtual()] = true;
    var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    meses[d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")] = true;
    var lista = Object.keys(meses).sort().reverse();
    var comDados = competenciasComDados();
    sel.innerHTML = lista.map(function(m){
      return '<option value="' + m + '"' + (m === competencia ? " selected" : "") + ">" +
        Importacao.nomeCompetencia(m) + (comDados[m] ? "" : " (vazio)") + "</option>";
    }).join("") + '<option value="outro">Outro mês…</option>';
  }

  function trocarCompetencia(nova){
    if (!/^\d{4}-\d{2}$/.test(nova)) return;
    competencia = nova;
    localStorage.setItem("competencia", nova);
    ultimaConc = null;
    $("conc-results-panel").style.display = "none";
    preencherCompetencias();
    refreshCounts();
    selectTab(currentTab || "master");
    toast("Competência: " + Importacao.nomeCompetencia(nova));
  }

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
    usuarios: '<path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1.5a4 4 0 0 0-3-3.87M15.5 4.13a3.5 3.5 0 0 1 0 6.75"/>',
    conciliacao: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    banco: '<path d="M3 10l9-6 9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18"/>',
    unidade: '<path d="M4 20V8l8-4 8 4v12M9 20v-6h6v6"/>',
    mov: '<path d="M4 7h16M4 12h10M4 17h7"/>',
    cadastro: '<path d="M8 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8zM4 8h4M4 12h4M4 16h4"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    menos: '<path d="M5 12h14"/>',
    lixeira: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>'
  };
  var EMPTY_SECTION = { "Bancos": "Nenhuma conta cadastrada", "Unidades": "Criadas ao distribuir por unidade" };

  function iconFor(item){
    if (item.type === "master") return ICONS.master;
    if (item.type === "conciliacao") return ICONS.conciliacao;
    if (item.type === "modulo") return Modulos.porId(item.id).icone;
    if (item.type === "usuarios") return ICONS.usuarios;
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
        var botoes = document.createElement("span");
        botoes.className = "nav-title-acoes";
        if (sec.title === "Unidades" && sec.items.length) {
          var zerar = document.createElement("button");
          zerar.className = "nav-add nav-danger";
          zerar.type = "button";
          zerar.title = "Excluir todas as unidades";
          zerar.setAttribute("aria-label", zerar.title);
          zerar.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + ICONS.lixeira + '</svg>';
          zerar.addEventListener("click", zerarUnidades);
          botoes.appendChild(zerar);
        }
        botoes.appendChild(add);
        secTitle.appendChild(botoes);
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
          if (sec.title === "Unidades") {
            var linha = document.createElement("div");
            linha.className = "nav-item";
            linha.appendChild(btn);
            var rem = document.createElement("button");
            rem.className = "nav-remove";
            rem.type = "button";
            rem.title = "Excluir a unidade " + item.label;
            rem.setAttribute("aria-label", rem.title);
            rem.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + ICONS.menos + '</svg>';
            rem.addEventListener("click", function(ev){ ev.stopPropagation(); excluirUnidade(item.id); });
            linha.appendChild(rem);
            group.appendChild(linha);
          } else {
            group.appendChild(btn);
          }
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
      if (!el) return;
      if (itemIndex[id].type === "modulo") {
        el.textContent = Modulos.contador(id);
        el.classList.add("alerta");
        el.title = el.textContent ? el.textContent + " documento(s) vencido(s) ou vencendo em até 7 dias" : "";
        return;
      }
      el.textContent = loadEntries(id).length || "";
    });
  }

  // ---------- navegação ----------
  function selectTab(id){
    if (!itemIndex[id]) id = itemIndex.master ? "master" : Object.keys(itemIndex)[0];
    if (!id) return;
    currentTab = id;
    editingId = null;
    var item = itemIndex[id];

    document.querySelectorAll(".acct-btn").forEach(function(b){ b.classList.remove("active"); });
    var btn = $("btn-" + id);
    if (btn) btn.classList.add("active");

    $("view-title").textContent = item.section === "Bancos" ? nomeDaFonte(item) : item.label;
    $("view-sub").textContent = item.section + (item.section === "Bancos" && item.bank ? " / " + item.bank : "");

    ["view-ledger","view-cadastro","view-master","view-conciliacao","view-modulo","view-usuarios"].forEach(function(v){ $(v).style.display = "none"; });
    var ehModulo = item.type === "modulo";
    $("content").classList.toggle("modo-modulo", ehModulo);
    document.querySelector(".comp-select").hidden = ehModulo || item.type === "usuarios";
    if (btn) btn.title = ehModulo ? item.descricao : btn.title;

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
      $("btn-extrato-conta").style.display = item.section === "Bancos" ? "" : "none";
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
    else if (ehModulo) {
      $("view-modulo").style.display = "block";
      Modulos.abrir(id, $("modulo-area"));
    }
    else if (item.type === "usuarios") {
      $("view-usuarios").style.display = "block";
      renderUsuarios();
    }
    try { history.replaceState(null, "", "#" + id); } catch (e) {}
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
    if (e.valorInvalido) return "<span class='pill conc-diff' title='Valor digitado fora do padrão. Corrija para não ir errado ao Único.'>" + escapeHtml(e.valorOriginal || "inválido") + "</span>";
    return '<span class="' + (e.sign === "D" ? "val-d" : "val-c") + '">' + formatBRNumber(e.valorNum) + (e.sign || "") + '</span>' +
      (e.bloqueado ? "<span class='cell-sub'>bloqueado</span>" : "");
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
          case "categoria": return "<td>" + (pendente ? "<span class='pill pendente'>Pendente</span>" : escapeHtml(e.categoria) +
              (e.sugerido ? "<span class='pill sugerida' title='Classificação sugerida pelo histórico: confira e confirme'>sugerida</span>" : "")) + "</td>";
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

    var nSug = entries.filter(function(e){ return e.sugerido; }).length;
    $("btn-confirmar-sugestoes").hidden = derivada || !nSug;
    $("btn-confirmar-sugestoes").textContent = "Confirmar " + nSug + " sugestão(ões)";
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
      dados.valorInvalido = false; dados.valorOriginal = "";   // valor redigitado no formulário
      dados.sugerido = false;                                  // quem editou conferiu
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
      // v28: sem conta definida, usa a conta do Caixa da Tabela de bancos (padrão 5)
      fontes.push({ id: m.id, nome: m.sheetName, contaBanco: m.contaContabil || I.contaCaixa(loadEntries("cad-bancos")), lancamentos: loadEntries(m.id) });
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

  function chaveNome(s){
    return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  }

  function idUnidade(nome){
    var achou = unidades.filter(function(u){ return chaveNome(u.label) === chaveNome(nome); })[0];
    return achou ? achou.id : null;
  }

  function renderMaster() {
    $("master-mes").textContent = Importacao.nomeCompetencia(competencia);
    var fontes = fontesIntegracao();
    var st = I.estatisticasMaster(fontes, nomesUnidades());

    var tot = 0, cls = 0, sug = 0;
    st.bancos.forEach(function(b){ tot += b.total; cls += b.classificados; });
    fontes.forEach(function(f){ f.lancamentos.forEach(function(e){ if (e.sugerido) sug++; }); });
    var pct = tot ? Math.round(cls / tot * 100) : 0;
    $("master-resumo").innerHTML = tot
      ? '<div class="conc-headline"><h2>' + cls.toLocaleString("pt-BR") + ' de ' + tot.toLocaleString("pt-BR") + ' lançamentos classificados</h2>' +
        '<div class="diff">' + (sug ? 'Sugeridas para conferir<strong class="val-d">' + sug.toLocaleString("pt-BR") + '</strong> · ' : '') +
        'Pendentes<strong class="' + (tot - cls ? "val-d" : "val-c") + '">' + (tot - cls).toLocaleString("pt-BR") + '</strong></div></div>' +
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

  function statusMaster(msg, aviso){
    var el = $("master-status");
    el.textContent = msg;
    el.classList.toggle("aviso", !!aviso);
    if (aviso) toast(msg.length > 90 ? msg.slice(0, 87) + "…" : msg);
  }

  function distribuirPorUnidade(silencioso){
    var tx = I.coletarTransacoes(fontesIntegracao());
    if (!tx.length) {
      if (!silencioso) statusMaster("Nenhum lançamento classificado. Preencha categoria e unidade nas contas bancárias.", true);
      return null;
    }
    var dist = I.distribuirPorUnidade(tx);
    var criadas = 0;

    // unidades digitadas duas vezes com grafias diferentes ("chapeco" e "Chapecó") viram uma só
    var vistas = {}, duplicadas = [];
    unidades = unidades.filter(function(u){
      var k = chaveNome(u.label);
      if (vistas[k]) { duplicadas.push(u); return false; }
      vistas[k] = true; return true;
    });
    duplicadas.forEach(function(u){ Store.remove(storageKey(u.id)); });
    var renomeadas = false;
    dist.forEach(function(d){
      var id = idUnidade(d.unidade);
      var existente = id && unidades.filter(function(u){ return u.id === id; })[0];
      if (existente && existente.label !== d.unidade) { existente.label = d.unidade; existente.sheetName = d.unidade; renomeadas = true; }
      if (!id) {
        id = "unid-" + Date.now() + "-" + criadas;
        unidades.push({ id: id, label: d.unidade, type: "ledger", bank: "Unidade", sheetName: d.unidade, hasDataMov: false });
        criadas++;
      }
      saveEntries(id, d.linhas.map(function(l, i){ return Object.assign({ id: id + "-" + i }, l); }));
    });
    // unidades sem lançamento nesta rodada ficam vazias (igual à planilha)
    unidades.forEach(function(u){
      if (!dist.some(function(d){ return chaveNome(d.unidade) === chaveNome(u.label); })) saveEntries(u.id, []);
    });
    if (criadas || renomeadas || duplicadas.length) { gravarLista("system_units", unidades); montarMenu(); buildSidebar(); populateConcSelect(); }
    refreshCounts();

    var semConta = 0;
    dist.forEach(function(d){ semConta += I.semConta(d.linhas).length; });
    var msg = tx.length.toLocaleString("pt-BR") + " lançamentos distribuídos para " + dist.length + " unidade(s), ordenados por Despesa, Pagamento e Recebimento.";
    if (semConta) msg += " Atenção: " + semConta + " com pendência (sem conta de débito/crédito ou valor fora do padrão).";
    if (!silencioso) { statusMaster(msg, false); toast("Distribuição concluída."); }
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
    if (!r) { statusMaster("Nenhum lançamento classificado para gerar TXT.", true); return; }
    var tabela = tabelaUnidades();
    if (!tabela.length) {
      statusMaster("Falta a Tabela de unidades: abra Cadastros > Tabela de unidades e importe a planilha. Ela traz o CNPJ e o código SCI de cada unidade, que vão no TXT.", true);
      return;
    }
    var nSug = 0;
    fontesIntegracao().forEach(function(f){ f.lancamentos.forEach(function(e){ if (e.sugerido) nSug++; }); });
    if (nSug && !confirm(nSug + " lançamento(s) estão com classificação sugerida pelo histórico e ainda não foram conferidos.\n\nOK = gerar assim mesmo.\nCancelar = conferir antes.")) return;
    if (r.semConta && !confirm(
      r.semConta + " lançamento(s) estão sem conta de débito/crédito ou com valor fora do padrão e seriam recusados ou gravados errado no Único.\n\n" +
      "OK = gerar os TXTs só com os lançamentos completos e baixar a lista de pendências para corrigir.\n" +
      "Cancelar = não gerar agora.")) return;

    var opcoes = { ignorarSemConta: true };
    var arquivos = formato === "unico"
      ? I.gerarTxtsUnico(r.dist, tabela, loadEntries("cad-custos"), opcoes)
      : I.gerarTxts(r.dist, tabela, opcoes);
    if (!arquivos.length) { statusMaster("Nenhuma unidade da Tabela de unidades tem lançamentos completos.", true); return; }
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
    statusMaster(msg, false);
    renderMaster();
  }

  // ---------- excluir unidades ----------
  function excluirUnidade(id){
    var u = unidades.filter(function(x){ return x.id === id; })[0];
    if (!u) return;
    if (!confirm("Excluir a unidade \"" + u.label + "\"?\n\nOs lançamentos das contas bancárias não são apagados. Se ainda houver lançamentos classificados com essa unidade, ela volta ao distribuir de novo.")) return;
    Store.remove(storageKey(id));
    unidades = unidades.filter(function(x){ return x.id !== id; });
    gravarLista("system_units", unidades);
    montarMenu(); buildSidebar(); populateConcSelect();
    if (currentTab === id) selectTab("master"); else if (currentTab === "master") renderMaster();
    toast("Unidade excluída.");
  }

  function zerarUnidades(){
    if (!unidades.length) { toast("Não há unidades para excluir."); return; }
    if (!confirm("Excluir todas as " + unidades.length + " unidades?\n\nOs lançamentos das contas bancárias não são apagados. Depois use Distribuir por unidade: as unidades são criadas de novo com os nomes certos da planilha.")) return;
    unidades.forEach(function(u){ Store.remove(storageKey(u.id)); });
    unidades = [];
    gravarLista("system_units", unidades);
    montarMenu(); buildSidebar(); populateConcSelect();
    selectTab("master");
    toast("Unidades excluídas.");
  }

  // ---------- importação da planilha completa ----------
  var planoImportacao = null;

  function abrirImportacao(){
    planoImportacao = null;
    $("file-planilha").value = "";
    $("imp-arquivo-nome").textContent = "nenhum arquivo escolhido";
    $("imp-status").textContent = "";
    $("imp-resumo").hidden = true;
    $("imp-opcoes").hidden = true;
    $("imp-confirmar").disabled = true;
    $("modal-importar").style.display = "flex";
  }

  function analisarArquivoPlanilha(file){
    $("imp-arquivo-nome").textContent = file.name;
    if (typeof XLSX === "undefined") { $("imp-status").textContent = "O leitor de planilhas não carregou. Verifique a internet e recarregue a página."; return; }
    $("imp-status").textContent = "Lendo a planilha… pode levar alguns segundos.";
    $("imp-resumo").hidden = true; $("imp-opcoes").hidden = true; $("imp-confirmar").disabled = true;
    var reader = new FileReader();
    reader.onload = function(ev){
      setTimeout(function(){   // deixa a mensagem aparecer antes do trabalho pesado
        try {
          var wb = XLSX.read(new Uint8Array(ev.target.result), { type: "array", cellDates: true });
          var abas = wb.SheetNames.map(function(n){
            return { nome: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }) };
          });
          planoImportacao = Importacao.analisarPlanilha(abas);
          mostrarPlano(planoImportacao);
        } catch(err) {
          console.error(err);
          $("imp-status").textContent = "Não consegui ler a planilha: " + (err.message || "erro desconhecido");
        }
      }, 30);
    };
    reader.onerror = function(){ $("imp-status").textContent = "Falha ao ler o arquivo."; };
    reader.readAsArrayBuffer(file);
  }

  function bancoExistente(b){
    return bancos.filter(function(x){ return x.contaContabil === b.contabil; })[0] ||
           bancos.filter(function(x){ return chaveNome(x.sheetName) === chaveNome(b.nomeAba); })[0] || null;
  }

  function mostrarPlano(p){
    if (!p.bancos.length && !p.movimentos.length) {
      $("imp-status").textContent = "Não encontrei abas de banco (nome terminando em \"Conta <número>\") nesta planilha.";
      return;
    }
    $("imp-status").textContent = "";
    var n = function(x){ return Number(x).toLocaleString("pt-BR"); };
    var linhas = p.bancos.map(function(b){
      return "<tr><td>" + escapeHtml(b.nomeAba) + (bancoExistente(b) ? "" : "<span class='tag-nova'>nova conta</span>") +
        "</td><td>" + n(b.lancamentos.length) + " lançamentos</td></tr>";
    });
    p.movimentos.forEach(function(m){
      linhas.push("<tr><td>" + escapeHtml(itemIndex[m.id].label) + "</td><td>" + n(m.lancamentos.length) + " lançamentos</td></tr>");
    });
    Object.keys(p.cadastros).forEach(function(id){
      linhas.push("<tr><td>Cadastro: " + escapeHtml(itemIndex[id].label) + "</td><td>" + n(p.cadastros[id].itens.length) + " itens</td></tr>");
    });
    $("imp-resumo").innerHTML = "<table class='imp-tabela'>" + linhas.join("") + "</table>" +
      (p.avisos.length ? "<ul class='imp-avisos'>" + p.avisos.map(function(a){ return "<li><strong>Atenção:</strong> " + escapeHtml(a) + "</li>"; }).join("") + "</ul>" : "") +
      (p.ignoradas.length ? "<p class='muted small'>Abas ignoradas: " + escapeHtml(p.ignoradas.map(function(i){ return i.nome.trim(); }).join(", ")) + ".</p>" : "");
    $("imp-competencia").value = p.competencia || competencia;
    $("imp-resumo").hidden = false;
    $("imp-opcoes").hidden = false;
    $("imp-confirmar").disabled = false;
  }

  function confirmarImportacao(){
    var p = planoImportacao;
    if (!p) return;
    var mes = $("imp-competencia").value;
    if (!/^\d{4}-\d{2}$/.test(mes)) { alert("Escolha a competência (mês)."); return; }
    var jaTem = Object.keys(competenciasComDados()).indexOf(mes) > -1;
    if (jaTem && !confirm(Importacao.nomeCompetencia(mes) + " já tem lançamentos neste navegador.\n\nOK = substituir pelos da planilha.\nCancelar = voltar.")) return;

    competencia = mes;
    localStorage.setItem("competencia", mes);

    // contas bancárias: cria as que faltam e deixa na mesma ordem das abas da planilha
    // (a ordem decide o desempate dentro do mesmo dia no TXT, como na macro)
    var ordem = [], novas = 0;
    p.bancos.forEach(function(b){
      var conta = bancoExistente(b);
      if (!conta) {
        conta = { id: "banco-" + Date.now() + "-" + novas, type: "ledger", bank: b.banco,
          label: (b.numero ? b.numero + " " : "") + "Conta " + b.contabil, sheetName: b.nomeAba,
          agencia: "", conta: b.numero, contaContabil: b.contabil, hasDataMov: true };
        novas++;
      } else if (!conta.contaContabil) conta.contaContabil = b.contabil;
      ordem.push(conta);
      saveEntries(conta.id, b.lancamentos);
    });
    bancos = ordem.concat(bancos.filter(function(x){ return ordem.indexOf(x) < 0; }));
    gravarLista("system_banks", bancos);

    p.movimentos.forEach(function(m){ saveEntries(m.id, m.lancamentos); });

    if ($("imp-cadastros").checked) {
      Object.keys(p.cadastros).forEach(function(id){
        saveEntries(id, p.cadastros[id].itens);
        Store.set("cabecalho:" + id, p.cadastros[id].cabecalho);
      });
    }

    // abas de unidade deste mês: refeitas a partir dos lançamentos importados
    unidades.forEach(function(u){ saveEntries(u.id, []); });
    montarMenu(); buildSidebar(); populateConcSelect(); preencherCompetencias(); refreshFormOptions();
    distribuirPorUnidade(true);

    $("modal-importar").style.display = "none";
    selectTab("master");
    statusMaster("Planilha importada em " + Importacao.nomeCompetencia(mes) + ": " + p.totalLancamentos.toLocaleString("pt-BR") +
      " lançamentos de " + p.bancos.length + " contas" + (novas ? " (" + novas + " novas)" : "") +
      ", já distribuídos por unidade. Confira as pendências e gere os TXTs." +
      (p.avisos.length ? " Atenção: " + p.avisos.join(" ") : ""), p.avisos.length > 0);
    planoImportacao = null;
  }

  // ---------- importar extratos do banco (PDF, OFX, TXT, CSV, planilha) ----------
  var PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  var PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  var extratosLidos = [];

  function carregarPdfJs(){
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise(function(ok, erro){
      var sc = document.createElement("script");
      sc.src = PDFJS_URL;
      sc.onload = function(){ window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; ok(window.pdfjsLib); };
      sc.onerror = function(){ erro(new Error("o leitor de PDF não carregou (verifique a internet)")); };
      document.head.appendChild(sc);
    });
  }

  function itensDoPdf(buffer){
    return carregarPdfJs().then(function(pdfjs){
      return pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    }).then(function(doc){
      var paginas = [];
      var proxima = function(n){
        if (n > doc.numPages) return Promise.resolve(paginas);
        return doc.getPage(n).then(function(pg){ return pg.getTextContent(); }).then(function(tc){
          paginas.push(tc.items.filter(function(i){ return i.str && i.str.trim(); }).map(function(i){
            return { s: i.str, x: i.transform[4], y: i.transform[5], w: i.width };
          }));
          return proxima(n + 1);
        });
      };
      return proxima(1);
    });
  }

  function lerBuffer(file){
    return new Promise(function(ok, erro){
      var r = new FileReader();
      r.onload = function(ev){ ok(ev.target.result); };
      r.onerror = function(){ erro(new Error("falha ao ler o arquivo")); };
      r.readAsArrayBuffer(file);
    });
  }

  /** Arquivo → { arquivo, formato, banco, numeroConta, itens, conferencia, erro }. */
  function lerArquivoExtrato(file){
    var nome = file.name, ext = (nome.split(".").pop() || "").toLowerCase();
    return lerBuffer(file).then(function(buf){
      if (ext === "pdf") {
        return itensDoPdf(buf).then(function(paginas){
          var r = PdfExtrato.lerExtratoPdf(paginas);
          if (r.semTexto) return { arquivo: nome, erro: "Este PDF é uma imagem (digitalizado ou foto): não tem texto para ler. Peça ao banco o extrato em OFX, ou um PDF gerado direto pelo internet banking." };
          return { arquivo: nome, formato: "PDF " + r.banco.nome, banco: r.banco.nome, numeroConta: r.numeroConta, itens: r.itens, conferencia: r.conferencia };
        });
      }
      if (ext === "xlsx" || ext === "xls") {
        if (typeof XLSX === "undefined") throw new Error("o leitor de planilhas não carregou");
        var wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
        var r = Core.parseExtratoRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" }));
        if (!r.ok) return { arquivo: nome, erro: r.erro };
        var conf = r.itens.some(function(i){ return i.saldoLinha !== undefined; })
          ? PdfExtrato.conferirSaldos(r.itens, r.saldoInicial !== undefined ? [{ tipo: "inicio", saldo: r.saldoInicial }] : [])
          : null;
        return { arquivo: nome, formato: "Planilha", numeroConta: r.numeroConta || "", itens: r.itens, conferencia: conf };
      }
      var e = Extratos.lerExtrato(Core.decodeText(new Uint8Array(buf)));
      if (e.ok === false) return { arquivo: nome, erro: e.erro || "Formato não reconhecido." };
      return { arquivo: nome, formato: e.formato === "genérico" ? "CSV/TXT" : e.formato, numeroConta: e.numeroConta || "", itens: e.itens || [] };
    }).catch(function(err){ return { arquivo: nome, erro: "Não consegui ler: " + (err.message || err) }; });
  }

  function abrirExtratos(contaPreSelecionada){
    extratosLidos = [];
    abrirExtratos.conta = contaPreSelecionada || "";
    $("file-extratos").value = "";
    $("ext-status").textContent = "";
    $("ext-lista").innerHTML = "";
    $("ext-confirmar").disabled = true;
    $("modal-extratos").style.display = "flex";
  }

  function analisarExtratos(files){
    $("ext-status").textContent = "Lendo " + files.length + " arquivo(s)…";
    $("ext-confirmar").disabled = true;
    Promise.all(Array.prototype.map.call(files, lerArquivoExtrato)).then(function(lidos){
      lidos.forEach(function(l){
        if (l.erro) return;
        var cand = Extratos.contasCandidatas(l.numeroConta, bancos);
        l.contaId = abrirExtratos.conta || (cand.length === 1 ? cand[0].id : "");
        l.candidatas = cand;
      });
      extratosLidos = lidos;
      $("ext-status").textContent = "";
      mostrarExtratos();
    });
  }

  function lancamentosDoMes(mes, id){ return Store.get("lancamentos:" + mes + ":" + id) || []; }

  function previaExtrato(l){
    var novos = 0, repetidos = 0, porMes = {};
    l.itens.forEach(function(i){ var m = String(i.data).slice(0, 7); (porMes[m] = porMes[m] || []).push(i); });
    Object.keys(porMes).forEach(function(m){
      var r = Extratos.mesclar(l.contaId ? lancamentosDoMes(m, l.contaId) : [], porMes[m]);
      novos += r.adicionados.length; repetidos += r.repetidos;
    });
    return { novos: novos, repetidos: repetidos, meses: Object.keys(porMes).sort() };
  }

  function mostrarExtratos(){
    var n = function(x){ return Number(x).toLocaleString("pt-BR"); };
    $("ext-lista").innerHTML = extratosLidos.map(function(l, i){
      if (l.erro) return "<div class='ext-item'><div class='ext-topo'><strong>" + escapeHtml(l.arquivo) + "</strong></div><div class='ext-erro'>" + escapeHtml(l.erro) + "</div></div>";
      var p = previaExtrato(l);
      var datas = l.itens.map(function(x){ return x.data; }).sort();
      var conf = l.conferencia && l.conferencia.total
        ? (l.conferencia.conferidos === l.conferencia.total
            ? "<span class='val-c'>✓ saldos conferidos em " + l.conferencia.total + " dia(s)</span>"
            : "<span class='val-d'>⚠ saldo não fecha em " + (l.conferencia.total - l.conferencia.conferidos) + " de " + l.conferencia.total + " dia(s): confira o extrato</span>")
        : "";
      var opcoes = '<option value="">Escolha a conta…</option>' + bancos.map(function(b){
        var marca = l.candidatas.indexOf(b) > -1 ? " (número bate)" : "";
        return '<option value="' + b.id + '"' + (b.id === l.contaId ? " selected" : "") + ">" + escapeHtml(nomeDaFonte(b)) + marca + "</option>";
      }).join("");
      return "<div class='ext-item'>" +
        "<div class='ext-topo'><strong>" + escapeHtml(l.arquivo) + "</strong><span class='muted small'>" + escapeHtml(l.formato || "") +
          (l.numeroConta ? " · conta " + escapeHtml(l.numeroConta) : "") + "</span></div>" +
        "<div class='ext-info'><span>" + n(l.itens.length) + " lançamentos</span>" +
          (datas.length ? "<span>" + brDate(datas[0]) + " a " + brDate(datas[datas.length - 1]) + "</span>" : "") +
          (l.contaId ? "<span><strong>" + n(p.novos) + "</strong> novos" + (p.repetidos ? ", " + n(p.repetidos) + " já importados" : "") + "</span>" : "") +
          conf + "</div>" +
        "<label class='ext-conta'>Conta no sistema <select data-ext='" + i + "'>" + opcoes + "</select></label>" +
        (l.candidatas.length > 1 ? "<span class='muted small'>Mais de uma conta tem esse número: escolha a certa.</span>" : "") +
        (!l.candidatas.length && l.numeroConta ? "<span class='muted small'>Nenhuma conta cadastrada com o número " + escapeHtml(l.numeroConta) + ". Escolha a conta ou cadastre-a antes.</span>" : "") +
      "</div>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("[data-ext]"), function(sel){
      sel.addEventListener("change", function(){ extratosLidos[+sel.dataset.ext].contaId = sel.value; mostrarExtratos(); });
    });
    $("ext-confirmar").disabled = !extratosLidos.some(function(l){ return !l.erro && l.contaId && l.itens.length; });
  }

  /** Tudo o que uma pessoa já classificou, em todos os meses: base das sugestões. */
  function indiceDeSugestoes(){
    var todos = [];
    Store.keys().forEach(function(k){
      var m = /^lancamentos:\d{4}-\d{2}:(.+)$/.exec(k);
      if (m && m[1].indexOf("unid-") !== 0) todos = todos.concat(Store.get(k) || []);
    });
    return Extratos.criarIndice(todos);
  }

  function confirmarExtratos(){
    var idx = indiceDeSugestoes();
    var total = 0, repetidos = 0, sugeridos = 0, meses = {}, contas = {};
    var stamp = Date.now();
    extratosLidos.forEach(function(l, n){
      if (l.erro || !l.contaId) return;
      var porMes = {};
      l.itens.forEach(function(i){ var m = String(i.data).slice(0, 7); (porMes[m] = porMes[m] || []).push(i); });
      Object.keys(porMes).forEach(function(m){
        var atuais = lancamentosDoMes(m, l.contaId);
        var r = Extratos.mesclar(atuais, porMes[m]);
        repetidos += r.repetidos;
        var novos = r.adicionados.map(function(i, k){
          var e = { id: "x" + stamp + "-" + n + "-" + m + "-" + k, data: i.data, dataMov: "", desc: i.desc || "", doc: i.doc || "",
            modelo: "", valorNum: i.valorNum, sign: i.sign, nome: i.nome || "", cpf: i.cpf || "",
            categoria: "", unidade: "", natureza: "", conta: "", origem: "extrato" };
          if (i.fitid) e.fitid = i.fitid;
          if (i.bloqueado) e.bloqueado = true;
          var sug = Extratos.sugerir(e, idx);
          if (sug) { Object.assign(e, sug); e.sugerido = true; sugeridos++; }
          return e;
        });
        contas[l.contaId] = true;
        if (novos.length) { Store.set("lancamentos:" + m + ":" + l.contaId, atuais.concat(novos)); meses[m] = (meses[m] || 0) + novos.length; }
        total += novos.length;
      });
    });
    $("modal-extratos").style.display = "none";
    var mesPrincipal = Object.keys(meses).sort(function(a, b){ return meses[b] - meses[a]; })[0];
    if (mesPrincipal && mesPrincipal !== competencia) { competencia = mesPrincipal; localStorage.setItem("competencia", mesPrincipal); }
    preencherCompetencias(); refreshCounts();
    var unicaConta = Object.keys(contas).length === 1 ? Object.keys(contas)[0] : null;
    selectTab(unicaConta || "master");
    var msg = total.toLocaleString("pt-BR") + " lançamento(s) novos importados" +
      (repetidos ? ", " + repetidos.toLocaleString("pt-BR") + " já existiam e não foram duplicados" : "") +
      (sugeridos ? ". " + sugeridos.toLocaleString("pt-BR") + " vieram com classificação sugerida pelo histórico: confira e confirme" : "") + ".";
    toast(msg.length > 110 ? msg.slice(0, 107) + "…" : msg);
    if (!unicaConta) statusMaster(msg, false);
    else $("import-status-ledger").textContent = msg;
    extratosLidos = [];
  }

  // ---------- zerar ----------
  function zerarMes(){
    var nome = Importacao.nomeCompetencia(competencia);
    var chaves = Store.keys().filter(function(k){ return k.indexOf("lancamentos:" + competencia + ":") === 0; });
    var qtd = 0;
    chaves.forEach(function(k){ qtd += (Store.get(k) || []).length; });
    if (!qtd) { toast(nome + " já está vazio."); return; }
    if (!confirm("Apagar os " + qtd.toLocaleString("pt-BR") + " lançamentos de " + nome + "?\n\n" +
      "Vale para todas as contas, movimentos e unidades deste mês. Contas bancárias, cadastros e os outros meses continuam.\n\n" +
      "Dica: se quiser guardar como está, clique em Cancelar e baixe o backup antes.")) return;
    Promise.all(chaves.map(function(k){ return Store.remove(k); })).then(function(){
      ultimaConc = null;
      $("conc-results-panel").style.display = "none";
      preencherCompetencias(); refreshCounts();
      selectTab("master");
      statusMaster(nome + " foi zerado. Pode importar outra planilha ou os extratos do mês.", false);
    });
  }

  function apagarTudo(){
    var r = prompt("Isto apaga todos os dados da Gestão Financeira neste navegador: meses, contas, unidades, cadastros e conciliações.\n" +
      "Os módulos (ICMS, IBS/CBS, vencimentos) não são apagados: cada um tem a sua opção de limpar.\n" +
      "Baixe o backup antes se quiser guardar.\n\nPara confirmar, digite APAGAR:");
    if (r === null) return;
    if (r.trim().toUpperCase() !== "APAGAR") { alert("Nada foi apagado."); return; }
    // os usuários continuam (para apagar um acesso, use a tela Usuários)
    Promise.all(Store.keys().filter(function(k){ return k.indexOf("auth:") !== 0; }).map(function(k){ return Store.remove(k); })).then(function(){
      ["system_banks", "system_units", "system_mov_contas", "competencia"].forEach(function(k){ localStorage.removeItem(k); });
      alert("Tudo apagado. A página vai recarregar.");
      location.reload();
    });
  }

  // ---------- backup ----------
  var CHAVES_CONFIG = ["system_banks", "system_units", "system_mov_contas", "competencia", "tema"];

  function baixarBackup(){
    var dados = {};
    // as contas de usuário não vão no backup de dados (vão pelo "Exportar acessos", só o admin)
    Store.keys().forEach(function(k){ if (k.indexOf("auth:") !== 0) dados[k] = Store.get(k); });
    var config = {};
    CHAVES_CONFIG.forEach(function(k){ var v = localStorage.getItem(k); if (v !== null) config[k] = v; });
    var backup = { app: "gestao-financeira", formato: 1, geradoEm: new Date().toISOString(), config: config, dados: dados,
      modulos: Modulos.dadosParaBackup() };
    var hoje = new Date().toISOString().slice(0, 10);
    baixarArquivos([{ nome: "backup-gestao-financeira-" + hoje + ".json", conteudo: JSON.stringify(backup) }]);
    toast("Backup baixado. Guarde o arquivo numa pasta da rede ou no Drive.");
  }

  function restaurarBackup(file){
    var reader = new FileReader();
    reader.onload = function(ev){
      var b;
      try { b = JSON.parse(ev.target.result); } catch(e) { alert("Este arquivo não é um backup válido."); return; }
      if (!b || b.app !== "gestao-financeira" || !b.dados) { alert("Este arquivo não é um backup deste sistema."); return; }
      var quando = b.geradoEm ? new Date(b.geradoEm).toLocaleString("pt-BR") : "data desconhecida";
      if (!confirm("Restaurar o backup de " + quando + "?\n\nTodos os dados deste navegador serão substituídos pelos do backup.")) return;
      // as contas de usuário deste navegador ficam como estão
      Promise.all(Store.keys().filter(function(k){ return k.indexOf("auth:") !== 0; }).map(function(k){ return Store.remove(k); })).then(function(){
        return Promise.all(Object.keys(b.dados).filter(function(k){ return k.indexOf("auth:") !== 0; }).map(function(k){ return Store.set(k, b.dados[k]); }));
      }).then(function(){
        CHAVES_CONFIG.forEach(function(k){ localStorage.removeItem(k); });
        Object.keys(b.config || {}).forEach(function(k){ localStorage.setItem(k, b.config[k]); });
        // backups antigos não têm os módulos: nesse caso os dados dos módulos ficam como estão
        if (b.modulos) Modulos.restaurarDados(b.modulos);
        alert("Backup restaurado. A página vai recarregar.");
        location.reload();
      });
    };
    reader.readAsText(file);
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
              valorNum: v.valorNum, sign: v.sign, bloqueado: !!v.bloqueado,
              valorInvalido: !!v.invalido, valorOriginal: v.invalido ? String(row[col.valor]).trim() : "",
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

        if (isLedger) {
          // cada lançamento vai para o mês da sua data (como na importação de extratos)
          var porMes = {};
          imported.forEach(function(e){ var m = String(e.data).slice(0, 7); (porMes[m] = porMes[m] || []).push(e); });
          var meses = Object.keys(porMes).sort();
          var jaTem = 0;
          meses.forEach(function(m){ jaTem += lancamentosDoMes(m, tab).length; });
          var somar = jaTem === 0 || confirm(
            "Encontrei " + imported.length + " lançamento(s) na aba \"" + foundSheet + "\" (" + meses.map(Importacao.nomeCompetencia).join(", ") + ").\n\n" +
            "OK = adicionar aos " + jaTem + " que já existem nesse(s) mês(es).\n" +
            "Cancelar = substituir os existentes por estes.");
          meses.forEach(function(m){
            Store.set("lancamentos:" + m + ":" + tab, (somar ? lancamentosDoMes(m, tab) : []).concat(porMes[m]));
          });
          var principal = meses.slice().sort(function(a, b){ return porMes[b].length - porMes[a].length; })[0];
          var trocou = principal && principal !== competencia;
          if (trocou) { competencia = principal; localStorage.setItem("competencia", principal); preencherCompetencias(); }
          renderLedger();
          var msgL = imported.length.toLocaleString("pt-BR") + " lançamento(s) importado(s) da aba \"" + foundSheet + "\", em " +
            meses.map(Importacao.nomeCompetencia).join(", ") + "." + (trocou ? " A competência mudou para " + Importacao.nomeCompetencia(principal) + "." : "");
          if (ignoradas) msgL += " " + ignoradas + " linha(s) classificadas ficaram de fora por não terem data. A planilha também não as envia ao Único.";
          statusEl.textContent = msgL;
          toast("Importação concluída.");
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
    manual:         { classe: "conc-manual", texto: "À mão", barra: "b-man" },
    justificado:    { classe: "conc-just",  texto: "Conferido", barra: "b-just" },
    data_diferente: { classe: "conc-warn",  texto: "Data diferente", barra: "b-warn" },
    so_extrato:     { classe: "conc-diff",  texto: "Só no banco", barra: "b-diff" },
    so_sistema:     { classe: "conc-miss",  texto: "Só no sistema", barra: "b-miss" }
  };

  /** Lê o extrato (PDF, OFX, TXT, CSV ou planilha) com o mesmo leitor da importação e cruza com os lançamentos. */
  function runConciliacao(file) {
    var statusEl = $("import-status-conc");
    $("import-filename-conc").textContent = file.name;
    statusEl.textContent = "Lendo " + file.name + "…";
    $("file-import-conc").value = "";

    lerArquivoExtrato(file).then(function(l){
      if (l.erro) { statusEl.textContent = l.erro; return; }
      if (!l.itens.length) { statusEl.textContent = "Nenhuma movimentação reconhecida no arquivo."; return; }

      var sel = $("conc-acct"), avisos = [];
      var candidatas = Extratos.contasCandidatas(l.numeroConta, bancos);
      if (!sel.value && candidatas.length === 1) sel.value = candidatas[0].id;
      if (!sel.value) {
        statusEl.textContent = (l.numeroConta ? "O extrato é da conta " + l.numeroConta + ", que não está cadastrada" + (candidatas.length > 1 ? " de forma única" : "") + ". " : "") +
          "Escolha a conta na lista e importe o arquivo de novo.";
        return;
      }
      if (l.numeroConta && candidatas.length && candidatas.indexOf(itemIndex[sel.value]) < 0) {
        avisos.push("Atenção: o extrato é da conta " + l.numeroConta + ", e a conta escolhida é outra.");
      }

      l.itens.forEach(function(i){ i.texto = [i.desc, i.nome, i.cpf || i.cpfCnpj, i.doc].concat(i.detalhes || []).join(" "); });
      ultimaConc = { acctId: sel.value, extrato: l.itens, formato: l.formato, arquivo: file.name };
      renderConciliacao();

      var conf = l.conferencia && l.conferencia.total
        ? (l.conferencia.conferidos === l.conferencia.total ? " Saldos do extrato conferidos em " + l.conferencia.total + " dia(s)."
                                                             : " Atenção: o saldo do extrato não fecha em " + (l.conferencia.total - l.conferencia.conferidos) + " dia(s).")
        : "";
      statusEl.textContent = l.itens.length + " movimentação(ões) lidas (" + l.formato + (l.numeroConta ? ", conta " + l.numeroConta : "") + ")." + conf +
        (avisos.length ? " " + avisos.join(" ") : "");
    });
  }

  /** Lançamentos da conta nos meses que o extrato cobre (não só o mês selecionado no topo). */
  function lancamentosParaConciliar(){
    var meses = {};
    ultimaConc.extrato.forEach(function(e){ meses[String(e.data).slice(0, 7)] = true; });
    var lista = [];
    Object.keys(meses).forEach(function(m){ lista = lista.concat(lancamentosDoMes(m, ultimaConc.acctId)); });
    return lista;
  }

  // ---------- conciliação: modos, avulsa, exportar e limpar ----------
  var concModo = "conta";
  var avulsa = { extrato: null, rows: null, titulos: null, colunas: null };
  var ultimoResultado = null;

  function trocarModoConc(modo){
    concModo = modo;
    limparSelecao();
    $("conc-modo-conta").classList.toggle("ativo", modo === "conta");
    $("conc-modo-avulso").classList.toggle("ativo", modo === "avulso");
    $("conc-modo-conta").setAttribute("aria-pressed", modo === "conta");
    $("conc-modo-avulso").setAttribute("aria-pressed", modo === "avulso");
    $("conc-bloco-conta").hidden = modo !== "conta";
    $("conc-bloco-avulso").hidden = modo !== "avulso";
    $("conc-col-sistema").textContent = modo === "avulso" ? "Planilha" : "Lançado no sistema";
    $("conc-col-desc").textContent = modo === "avulso" ? "Fornecedor / documento" : "Descrição";
    atualizarBotaoSalvar();
    if (modo === "avulso") { preencherSalvas(); if (avulsa.extrato || avulsa.rows) statusAvulsa(); }
    $("import-status-conc").textContent = "";
    var tem = modo === "avulso" ? (avulsa.extrato && (avulsa.titulos || avulsa.balancete)) : ultimaConc;
    esconderResultados();
    if (tem) renderConciliacao();
  }

  function lerPlanilhaComoLinhas(file){
    return lerBuffer(file).then(function(buf){
      if (/\.csv$/i.test(file.name)) return Core.textToRows(Core.decodeText(new Uint8Array(buf)));
      if (typeof XLSX === "undefined") throw new Error("o leitor de planilhas não carregou");
      var wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
    });
  }

  function esconderResultados(){
    $("conc-results-panel").style.display = "none";
    $("conc-forn-panel").style.display = "none";
  }

  function statusAvulsa(){
    var partes = [];
    if (avulsa.salvaNome) partes.push("Conciliação: " + avulsa.salvaNome + (trabalhoNaoSalvo() ? " (com alterações não salvas)" : " (salva)") + ".");
    if (avulsa.extrato) partes.push("Extrato: " + avulsa.extrato.length + " movimentação(ões) (" + avulsa.formato + ")" + avulsa.conferencia + ".");
    if (avulsa.balancete) {
      var per = avulsa.balancete.periodo;
      partes.push("Planilha: balancete de fornecedores, " + avulsa.balancete.fornecedores.length.toLocaleString("pt-BR") + " contas" +
        (per ? ", de " + brDate(per.inicio) + " a " + brDate(per.fim) : "") + ". A conferência é pelo total pago a cada fornecedor.");
    }
    if (avulsa.nfeInfo && avulsa.titulos) {
      var ni = avulsa.nfeInfo, receb = $("av-tipo").value === "recebimentos";
      partes.push("XMLs: " + ni.notas + " nota(s); empresa " + (ni.empresa.nome || "") + " (" + Nfe.cnpjFormatado(ni.empresa.doc) + "); " +
        avulsa.titulos.length + " título(s) a " + (receb ? "receber" : "pagar") + " pelas parcelas e vencimentos." +
        (ni.canceladas ? " " + ni.canceladas + " nota(s) cancelada(s) fora da conta." : "") +
        (ni.fora ? " " + ni.fora + " nota(s) de " + (receb ? "compra" : "venda") + " não entram nesta conciliação." : "") +
        (ni.resumos ? " Atenção: " + ni.resumos + " arquivo(s) são só o resumo da nota (sem valores e parcelas); baixe o XML completo." : ""));
    } else if (avulsa.titulos) {
      var c = avulsa.colunas, nomes = { data: "data", valor: "valor", doc: "documento", nome: "fornecedor/cliente", cpf: "CNPJ" };
      partes.push("Planilha: " + avulsa.titulos.length + " título(s). Colunas usadas: " +
        Object.keys(nomes).filter(function(k){ return c[k]; }).map(function(k){ return nomes[k] + " = \"" + c[k] + "\""; }).join(", ") + ".");
    }
    if (avulsa.extrato && !avulsa.titulos && !avulsa.balancete) partes.push("Agora escolha a planilha.");
    if (!avulsa.extrato && (avulsa.titulos || avulsa.balancete)) partes.push("Agora escolha o extrato.");
    $("import-status-conc").textContent = partes.join(" ");
  }

  function carregarExtratoAvulso(files){
    files = Array.prototype.slice.call(files);
    $("av-extrato-nome").textContent = files.map(function(f){ return f.name; }).join(", ");
    $("import-status-conc").textContent = "Lendo " + files.length + " arquivo(s)…";
    $("file-av-extrato").value = "";
    Promise.all(files.map(lerArquivoExtrato)).then(function(lidos){
      var erros = lidos.filter(function(l){ return l.erro; });
      var ok = lidos.filter(function(l){ return !l.erro; });
      if (!ok.length) { $("import-status-conc").textContent = erros.map(function(l){ return l.arquivo + ": " + l.erro; }).join(" "); return; }
      var itens = [], confs = [];
      ok.forEach(function(l){
        l.itens.forEach(function(i){ i.texto = [i.desc, i.nome, i.cpf || i.cpfCnpj, i.doc].concat(i.detalhes || []).join(" "); i.origem = l.arquivo; });
        itens = itens.concat(l.itens);
        if (l.conferencia && l.conferencia.total) confs.push(l.conferencia.conferidos === l.conferencia.total);
      });
      avulsa.extrato = itens;
      avulsa.formato = ok.length === 1 ? ok[0].formato : ok.length + " arquivos";
      avulsa.conferencia = confs.length ? (confs.every(Boolean) ? ", saldos conferidos" : ", atenção: saldo de algum extrato não fecha") : "";
      if (erros.length) avulsa.conferencia += ". Não li: " + erros.map(function(l){ return l.arquivo; }).join(", ");
      statusAvulsa(); autosaveAvulsa();
      if (avulsa.titulos || avulsa.balancete) renderConciliacao();
    });
  }

  function aplicarPlanilhaAvulsa(){
    if (Conciliacao.ehBalancete(avulsa.rows)) {
      var b = Conciliacao.lerBalanceteFornecedores(avulsa.rows);
      if (!b.ok) { avulsa.balancete = null; $("import-status-conc").textContent = b.erro; esconderResultados(); return; }
      avulsa.balancete = b; avulsa.titulos = null; avulsa.colunas = null;
      $("av-tipo").value = "pagamentos"; $("av-tipo").disabled = true;
      statusAvulsa(); autosaveAvulsa();
      if (avulsa.extrato) renderConciliacao();
      return;
    }
    avulsa.balancete = null; avulsa.nfeInfo = null; $("av-tipo").disabled = false;
    var r = Conciliacao.lerPlanilhaTitulos(avulsa.rows, $("av-tipo").value);
    if (!r.ok) { avulsa.titulos = null; $("import-status-conc").textContent = r.erro; esconderResultados(); return; }
    avulsa.titulos = r.itens;
    avulsa.colunas = r.colunas;
    statusAvulsa(); autosaveAvulsa();
    if (avulsa.extrato) renderConciliacao();
  }

  var JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
  function carregarJsZip(){
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise(function(ok, erro){
      var sc = document.createElement("script");
      sc.src = JSZIP_URL;
      sc.onload = function(){ ok(window.JSZip); };
      sc.onerror = function(){ erro(new Error("o leitor de .zip não carregou (verifique a internet)")); };
      document.head.appendChild(sc);
    });
  }

  /** XMLs soltos e .zip → textos dos XMLs. */
  function textosDosXmls(files){
    return Promise.all(files.map(function(f){
      if (/\.zip$/i.test(f.name)) {
        return carregarJsZip().then(function(JSZip){ return JSZip.loadAsync(f); }).then(function(zip){
          var xs = Object.keys(zip.files).filter(function(n){ return !zip.files[n].dir && /\.xml$/i.test(n); });
          return Promise.all(xs.map(function(n){ return zip.files[n].async("string"); }));
        });
      }
      return f.text().then(function(t){ return [t]; });
    })).then(function(listas){ return [].concat.apply([], listas); });
  }

  function aplicarNfeAvulsa(){
    var lidos = avulsa.nfe, tipo = $("av-tipo").value;
    var emp = Nfe.empresaProvavel(lidos.notas);
    if (!emp) { avulsa.titulos = null; $("import-status-conc").textContent = "Nenhuma NF-e com CNPJ encontrada nos arquivos."; esconderResultados(); return; }
    var r = Nfe.titulosDasNotas(lidos, emp.doc, tipo);
    avulsa.titulos = r.titulos; avulsa.colunas = null; avulsa.balancete = null;
    avulsa.nfeInfo = { empresa: emp, notas: lidos.notas.length, canceladas: r.canceladas, fora: r.fora, resumos: lidos.resumos };
    $("av-tipo").disabled = false;
    statusAvulsa(); autosaveAvulsa();
    if (!r.titulos.length) { esconderResultados(); return; }
    if (avulsa.extrato) renderConciliacao();
  }

  function carregarPlanilhaAvulsa(files){
    files = Array.prototype.slice.call(files);
    $("av-planilha-nome").textContent = files.map(function(f){ return f.name; }).join(", ");
    $("file-av-planilha").value = "";
    var ehXml = files.some(function(f){ return /\.(xml|zip)$/i.test(f.name); });
    if (ehXml) {
      $("import-status-conc").textContent = "Lendo os XMLs…";
      textosDosXmls(files.filter(function(f){ return /\.(xml|zip)$/i.test(f.name); })).then(function(textos){
        avulsa.nfe = Nfe.lerVarios(textos); avulsa.rows = null;
        aplicarNfeAvulsa();
      }).catch(function(err){ $("import-status-conc").textContent = "Não consegui ler os XMLs: " + (err.message || err); });
      return;
    }
    avulsa.nfe = null; avulsa.nfeInfo = null;
    lerPlanilhaComoLinhas(files[0]).then(function(rows){ avulsa.rows = rows; aplicarPlanilhaAvulsa(); })
      .catch(function(err){ $("import-status-conc").textContent = "Não consegui ler a planilha: " + (err.message || err); });
  }

  // ---------- conciliação externa: salvamento automático e conciliações salvas ----------
  var CHAVE_AV_ATUAL = "conciliacao-avulsa:atual", PREFIXO_AV_SALVA = "conciliacao-salva:";

  function estadoAvulsa(){
    if (!avulsa.extrato && !avulsa.rows && !avulsa.nfe) return null;
    return {
      extrato: avulsa.extrato, formato: avulsa.formato, conferencia: avulsa.conferencia, extratoNome: $("av-extrato-nome").textContent,
      rows: avulsa.rows, nfe: avulsa.nfe || null, planilhaNome: $("av-planilha-nome").textContent, tipo: $("av-tipo").value,
      tolerancia: $("conc-tolerancia").value, manuais: avulsa.manuais || [],
      salvaId: avulsa.salvaId || null, salvaNome: avulsa.salvaNome || "", em: new Date().toISOString()
    };
  }

  function autosaveAvulsa(){
    var e = estadoAvulsa();
    if (e) Store.set(CHAVE_AV_ATUAL, e); else Store.remove(CHAVE_AV_ATUAL);
  }

  function restaurarAvulsa(e){
    avulsa = { extrato: e.extrato || null, formato: e.formato || "", conferencia: e.conferencia || "", rows: e.rows || null, nfe: e.nfe || null,
      titulos: null, colunas: null, manuais: e.manuais || [], salvaId: e.salvaId || null, salvaNome: e.salvaNome || "" };
    $("av-tipo").value = e.tipo || "pagamentos";
    if (e.tolerancia !== undefined) $("conc-tolerancia").value = e.tolerancia;
    $("av-extrato-nome").textContent = e.extratoNome || (e.extrato ? "extrato" : "nenhum arquivo escolhido");
    $("av-planilha-nome").textContent = e.planilhaNome || (e.rows ? "planilha" : "nenhum arquivo escolhido");
    limparSelecao();
    if (avulsa.nfe) aplicarNfeAvulsa(); else if (avulsa.rows) aplicarPlanilhaAvulsa(); else statusAvulsa();
    atualizarBotaoSalvar();
  }

  function listarSalvas(){
    return Store.keys().filter(function(k){ return k.indexOf(PREFIXO_AV_SALVA) === 0; }).map(function(k){
      var v = Store.get(k) || {};
      return { id: k.slice(PREFIXO_AV_SALVA.length), nome: v.salvaNome || "(sem nome)", em: v.salvoEm || v.em || "" };
    }).sort(function(a, b){ return String(b.em).localeCompare(String(a.em)); });
  }

  function preencherSalvas(){
    var lista = listarSalvas();
    $("av-salvas-bloco").hidden = !lista.length;
    $("av-salvas").innerHTML = lista.map(function(s){
      var quando = s.em ? new Date(s.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
      return '<option value="' + escapeHtml(s.id) + '"' + (s.id === avulsa.salvaId ? " selected" : "") + ">" + escapeHtml(s.nome) + (quando ? " — salva em " + quando : "") + "</option>";
    }).join("");
  }

  function atualizarBotaoSalvar(){
    $("av-salvar").hidden = concModo !== "avulso";
    $("av-salvar").textContent = avulsa.salvaId ? "Salvar alterações" : "Salvar conciliação";
  }

  function trabalhoNaoSalvo(){
    if (!avulsa.manuais || !avulsa.manuais.length) return false;
    if (!avulsa.salvaId) return true;
    var salva = Store.get(PREFIXO_AV_SALVA + avulsa.salvaId);
    return !salva || JSON.stringify(salva.manuais || []) !== JSON.stringify(avulsa.manuais);
  }

  function salvarConciliacaoAvulsa(){
    if (!(avulsa.extrato && (avulsa.titulos || avulsa.balancete))) { toast("Escolha o extrato e a planilha antes de salvar."); return; }
    var meses = {};
    avulsa.extrato.forEach(function(x){ meses[String(x.data).slice(0, 7)] = (meses[String(x.data).slice(0, 7)] || 0) + 1; });
    var mes = Object.keys(meses).sort(function(a, b){ return meses[b] - meses[a]; })[0];
    var sugestao = avulsa.salvaNome || (($("av-planilha-nome").textContent || "Conciliação").replace(/\.[^.]+$/, "") + " – " + Importacao.nomeCompetencia(mes));
    var nome = prompt("Nome desta conciliação (ex.: Fan Metal – Julho de 2026):", sugestao);
    if (nome === null) return;
    nome = nome.trim() || sugestao;
    var id = avulsa.salvaId && nome === avulsa.salvaNome ? avulsa.salvaId : "av" + Date.now();
    avulsa.salvaId = id; avulsa.salvaNome = nome;
    var e = estadoAvulsa(); e.salvoEm = new Date().toISOString();
    Store.set(PREFIXO_AV_SALVA + id, e);
    autosaveAvulsa(); preencherSalvas(); atualizarBotaoSalvar(); statusAvulsa();
    toast("Conciliação salva: " + nome + ". Ela entra no backup do Master.");
  }

  function abrirSalva(){
    var id = $("av-salvas").value;
    var e = id && Store.get(PREFIXO_AV_SALVA + id);
    if (!e) return;
    if (trabalhoNaoSalvo() && avulsa.salvaId !== id &&
        !confirm("A conciliação aberta agora tem itens feitos à mão que não foram salvos. Abrir outra mesmo assim?")) return;
    restaurarAvulsa(e); autosaveAvulsa(); preencherSalvas();
    toast("Aberta: " + (e.salvaNome || "conciliação"));
  }

  function excluirSalva(){
    var id = $("av-salvas").value, e = id && Store.get(PREFIXO_AV_SALVA + id);
    if (!e || !confirm("Excluir a conciliação salva \"" + (e.salvaNome || "") + "\"? Não dá para desfazer.")) return;
    Store.remove(PREFIXO_AV_SALVA + id);
    if (avulsa.salvaId === id) { avulsa.salvaId = null; avulsa.salvaNome = ""; autosaveAvulsa(); atualizarBotaoSalvar(); statusAvulsa(); }
    preencherSalvas();
    toast("Conciliação excluída.");
  }

  function limparConciliacao(){
    if (concModo === "avulso" && trabalhoNaoSalvo() &&
        !confirm("Há itens conciliados à mão que não foram salvos. Limpar mesmo assim?\n\nDica: Cancelar e usar \"Salvar conciliação\".")) return;
    limparSelecao();
    if (concModo === "avulso") {
      avulsa = { extrato: null, rows: null, nfe: null, nfeInfo: null, titulos: null, colunas: null, balancete: null, manuais: [] };
      fornAbertos = {};
      Store.remove(CHAVE_AV_ATUAL);
      atualizarBotaoSalvar(); preencherSalvas();
      $("av-extrato-nome").textContent = "nenhum arquivo escolhido";
      $("av-planilha-nome").textContent = "nenhum arquivo escolhido";
    } else {
      ultimaConc = null;
      $("import-filename-conc").textContent = "nenhum arquivo escolhido";
    }
    ultimoResultado = null;
    $("conc-filter").value = "";
    $("import-status-conc").textContent = "";
    $("av-tipo").disabled = false;
    esconderResultados();
    toast("Conciliação limpa. Pode começar outra.");
  }

  function exportarConciliacao(){
    if (!ultimoResultado) return;
    var hoje = new Date().toISOString().slice(0, 10);
    baixarArquivos([{ nome: "conciliacao-" + hoje + ".csv",
      conteudo: Conciliacao.csvResultado(ultimoResultado, concModo === "avulso" ? "Planilha" : "Sistema") }]);
  }

  // ---------- conciliação por fornecedor (balancete do Único) ----------
  var CHAVE_VINCULOS = "vinculos-fornecedores";
  var fornAbertos = {}, ultimoResFornecedor = null;
  function vinculos(){ return Store.get(CHAVE_VINCULOS) || {}; }
  function salvarVinculo(item, valor){
    var v = Object.assign({}, vinculos());
    v[Conciliacao.chaveVinculo(item)] = valor;
    Store.set(CHAVE_VINCULOS, v);
  }

  function renderPorFornecedor(){
    var b = avulsa.balancete;
    var res = Conciliacao.conciliarPorFornecedor(avulsa.extrato, b, vinculos());
    ultimoResFornecedor = res;
    var r = res.resumo, f2 = function(c){ return formatBRNumber(c / 100); };
    var filtro = ($("forn-filtro").value || "").toLowerCase().trim();
    var mostrar = $("forn-mostrar").value;
    var ordem = { diferenca: 0, so_banco: 1, so_balancete: 2, bate: 3 };
    var linhas = res.linhas.filter(function(l){
      if (mostrar === "pendentes" && l.status === "bate") return false;
      if (mostrar === "bate" && l.status !== "bate") return false;
      if (!filtro) return true;
      return (l.fornecedor.nome + " " + l.fornecedor.classif + " " + l.pagos.map(function(p){ return p.cpf || ""; }).join(" ")).toLowerCase().indexOf(filtro) > -1;
    }).sort(function(a, b){ return ordem[a.status] - ordem[b.status] || Math.abs(b.diferencaCents) - Math.abs(a.diferencaCents); });

    var CL = { bate: ["bate", "Bate"], diferenca: ["dif", "Diferença"], so_banco: ["sobanco", "Só no banco"], so_balancete: ["sobal", "Só no balancete"] };
    var LIMITE = 300;
    $("forn-body").innerHTML = linhas.slice(0, LIMITE).map(function(l){
      var f = l.fornecedor, aberto = fornAbertos[f.classif];
      var linha = "<tr class='clicavel' data-classif='" + escapeHtml(f.classif) + "'>" +
        "<td>" + escapeHtml(f.nome) + "<span class='cell-sub'>" + escapeHtml(f.classif) + (l.pagos.length ? " · " + l.pagos.length + " pagamento(s) " + (aberto ? "▴" : "▾") : "") + "</span></td>" +
        "<td class='num'>" + (l.totalBancoCents ? f2(l.totalBancoCents) : "<span class='muted'>—</span>") + "</td>" +
        "<td class='num'>" + (l.debitoCents ? f2(l.debitoCents) : "<span class='muted'>—</span>") + "</td>" +
        "<td class='num'>" + (l.status === "bate" ? "<span class='val-c'>0,00</span>" : "<span class='val-d'>" + f2(l.diferencaCents) + "</span>") + "</td>" +
        "<td><span class='pill " + CL[l.status][0] + "'>" + CL[l.status][1] + "</span></td></tr>";
      if (aberto && l.pagos.length) {
        linha += "<tr class='forn-pagos'><td colspan='5'><ul>" + l.pagos.map(function(p){
          return "<li>" + brDate(p.data) + " · " + formatBRNumber(p.valorNum) + " · " + escapeHtml(p.desc) + "</li>";
        }).join("") + "</ul></td></tr>";
      }
      return linha;
    }).join("") + (linhas.length > LIMITE ? "<tr><td colspan='5' class='empty'>Mostrando " + LIMITE + " de " + linhas.length + ". Use o filtro para achar um fornecedor.</td></tr>" : "") +
      (!linhas.length ? "<tr><td colspan='5' class='empty'>Nenhum fornecedor nesta seleção.</td></tr>" : "");
    Array.prototype.forEach.call($("forn-body").querySelectorAll("tr[data-classif]"), function(tr){
      tr.addEventListener("click", function(){ var k = tr.dataset.classif; fornAbertos[k] = !fornAbertos[k]; renderPorFornecedor(); });
    });

    // pagamentos sem fornecedor: escolher ou marcar como "não é fornecedor"
    if (!$("dl-forn").dataset.preenchido || $("dl-forn").dataset.preenchido !== String(b.fornecedores.length)) {
      $("dl-forn").innerHTML = b.fornecedores.map(function(f){ return '<option value="' + escapeHtml(f.nome + " · " + f.classif) + '">'; }).join("");
      $("dl-forn").dataset.preenchido = String(b.fornecedores.length);
    }
    $("sem-forn-titulo").textContent = "Pagamentos sem fornecedor identificado (" + r.semFornecedor + ", " + f2(r.semFornecedorCents) + ")";
    $("sem-forn-body").innerHTML = res.semFornecedor.slice(0, 200).map(function(sf, i){
      var e = sf.item;
      var sug = sf.candidatos.length ? "Pode ser: " + sf.candidatos.slice(0, 2).map(function(c){ return c.nome; }).join(" ou ") : "Digite o nome do fornecedor";
      return "<tr><td>" + brDate(e.data) + "</td><td>" + escapeHtml(e.desc) + "</td><td class='num'><span class='val-d'>" + formatBRNumber(e.valorNum) + "</span></td>" +
        "<td><input class='vinc-input' list='dl-forn' data-i='" + i + "' placeholder='" + escapeHtml(sug) + "'></td>" +
        "<td class='row-actions'><button type='button' data-vinc='" + i + "'>Vincular</button><button type='button' data-ign='" + i + "'>Não é fornecedor</button></td></tr>";
    }).join("") + (res.semFornecedor.length > 200 ? "<tr><td colspan='5' class='empty'>Mostrando 200 de " + res.semFornecedor.length + ".</td></tr>" : "") +
      (!res.semFornecedor.length ? "<tr><td colspan='5' class='empty'>Todos os pagamentos foram ligados a um fornecedor (ou marcados como não sendo de fornecedor).</td></tr>" : "");
    var porClassif = {};
    b.fornecedores.forEach(function(f){ porClassif[f.nome + " · " + f.classif] = f.classif; });
    Array.prototype.forEach.call($("sem-forn-body").querySelectorAll("[data-vinc]"), function(bt){
      bt.addEventListener("click", function(){
        var i = +bt.dataset.vinc, inp = $("sem-forn-body").querySelector("input[data-i='" + i + "']");
        var classif = porClassif[inp.value];
        if (!classif) { toast("Escolha um fornecedor da lista."); inp.focus(); return; }
        salvarVinculo(res.semFornecedor[i].item, { classif: classif });
        toast("Vinculado. Pagamentos com o mesmo CNPJ passam a ir para esse fornecedor.");
        renderPorFornecedor();
      });
    });
    Array.prototype.forEach.call($("sem-forn-body").querySelectorAll("[data-ign]"), function(bt){
      bt.addEventListener("click", function(){
        salvarVinculo(res.semFornecedor[+bt.dataset.ign].item, { ignorar: true });
        renderPorFornecedor();
      });
    });

    // resumo e aviso de período
    var mesesExt = {};
    avulsa.extrato.forEach(function(e){ mesesExt[String(e.data).slice(0, 7)] = true; });
    var per = b.periodo, aviso = "";
    if (per) {
      var ini = Object.keys(mesesExt).sort()[0] + "-01", fimM = Object.keys(mesesExt).sort().slice(-1)[0];
      var fimD = new Date(Date.UTC(+fimM.slice(0, 4), +fimM.slice(5, 7), 0)).toISOString().slice(0, 10);
      if (per.inicio !== ini || per.fim !== fimD) {
        aviso = "<p class='aviso-periodo'><strong>Atenção ao período:</strong> o balancete é de " + brDate(per.inicio) + " a " + brDate(per.fim) +
          " e o extrato vai de " + brDate(ini) + " a " + brDate(fimD) + ". O Débito do balancete inclui pagamentos de fora do extrato, então as diferenças são esperadas. " +
          "Para fechar, emita o balancete de " + brDate(ini) + " a " + brDate(fimD) + " e traga os extratos de todas as contas que pagam fornecedores.</p>";
      }
    }
    var total = r.bate + r.diferenca + r.so_banco + r.so_balancete || 1;
    var barra = [["bate", "b-ok"], ["diferenca", "b-diff"], ["so_banco", "b-miss"], ["so_balancete", "b-warn"]].filter(function(x){ return r[x[0]]; })
      .map(function(x){ return '<span class="' + x[1] + '" style="flex:' + r[x[0]] + '"></span>'; }).join("");
    $("forn-resumo").innerHTML =
      '<div class="conc-headline"><h2>' + r.bate + ' de ' + total + ' fornecedores batendo</h2>' +
      '<div class="diff">Pagamentos sem fornecedor<strong class="' + (r.semFornecedor ? "val-d" : "val-c") + '">' + r.semFornecedor + '</strong></div></div>' +
      '<div class="conc-bar">' + barra + '</div>' +
      '<div class="conc-legend"><span><i class="b-ok"></i>Bate <strong>' + r.bate + '</strong></span><span><i class="b-diff"></i>Diferença <strong>' + r.diferenca +
      '</strong></span><span><i class="b-miss"></i>Só no banco <strong>' + r.so_banco + '</strong></span><span><i class="b-warn"></i>Só no balancete <strong>' + r.so_balancete +
      '</strong></span>' + (r.ignorados ? '<span>Não são fornecedor <strong>' + r.ignorados + '</strong></span>' : '') + '</div>' + aviso;
    $("conc-forn-panel").style.display = "block";
  }

  // ---------- conciliação manual ----------
  var selecao = { ext: {}, sis: {} };   // chave → item
  function chaveGrupos(){ return "conciliacao-manual:" + ultimaConc.acctId; }
  function gruposManuais(){
    if (concModo === "avulso") return avulsa.manuais || (avulsa.manuais = []);
    return ultimaConc ? (Store.get(chaveGrupos()) || []) : [];
  }
  function salvarGrupos(g){
    if (concModo === "avulso") { avulsa.manuais = g; autosaveAvulsa(); statusAvulsa(); }
    else Store.set(chaveGrupos(), g);
  }
  function limparSelecao(){ selecao = { ext: {}, sis: {} }; }

  function somaSel(lado){
    var t = 0;
    Object.keys(selecao[lado]).forEach(function(k){ var x = selecao[lado][k]; t += (x.sign === "D" ? -1 : 1) * Math.round(x.valorNum * 100); });
    return t;
  }

  function atualizarBarraSelecao(){
    var nE = Object.keys(selecao.ext).length, nS = Object.keys(selecao.sis).length;
    var bar = $("conc-selecao");
    if (!nE && !nS) { bar.hidden = true; return; }
    var rs = concModo === "avulso" ? "da planilha" : "do sistema";
    var dif = somaSel("ext") - somaSel("sis");
    bar.hidden = false;
    $("conc-sel-texto").innerHTML = "Selecionados: <strong>" + nE + "</strong> do banco (" + formatBRNumber(Math.abs(somaSel("ext")) / 100) + ")" +
      " e <strong>" + nS + "</strong> " + rs + " (" + formatBRNumber(Math.abs(somaSel("sis")) / 100) + ")" +
      (nE && nS ? " · diferença <strong class='" + (dif === 0 ? "val-c" : "val-d") + "'>" + formatBRNumber(dif / 100) + "</strong>" : "");
    $("conc-sel-juntar").disabled = !(nE && nS);
  }

  function conciliarSelecionados(){
    var ext = Object.keys(selecao.ext), sis = Object.keys(selecao.sis);
    if (!ext.length || !sis.length) return;
    var dif = somaSel("ext") - somaSel("sis"), obs = "";
    if (dif !== 0) {
      obs = prompt("Os valores não batem: diferença de " + formatBRNumber(dif / 100) + ".\n" +
        "Se estiver certo (juros, desconto, tarifa embutida…), escreva o motivo e confirme:", "");
      if (obs === null) return;
    }
    var g = gruposManuais().slice();
    g.push({ ext: ext, sis: sis, tipo: "manual", obs: obs || "", em: new Date().toISOString() });
    salvarGrupos(g); limparSelecao(); renderConciliacao();
    toast("Conciliado à mão.");
  }

  function marcarConferido(){
    var ext = Object.keys(selecao.ext), sis = Object.keys(selecao.sis);
    if (!ext.length && !sis.length) return;
    var obs = prompt("Marcar " + (ext.length + sis.length) + " item(ns) como conferido(s), sem par.\nObservação (opcional), ex.: tarifa bancária, transferência entre contas:", "");
    if (obs === null) return;
    var g = gruposManuais().slice();
    ext.forEach(function(k){ g.push({ ext: [k], sis: [], tipo: "justificado", obs: obs, em: new Date().toISOString() }); });
    sis.forEach(function(k){ g.push({ ext: [], sis: [k], tipo: "justificado", obs: obs, em: new Date().toISOString() }); });
    salvarGrupos(g); limparSelecao(); renderConciliacao();
    toast("Marcado como conferido.");
  }

  function desfazerGrupo(idx){
    var g = gruposManuais().slice();
    g.splice(idx, 1);
    salvarGrupos(g); renderConciliacao();
    toast("Desfeito: os itens voltaram para a conciliação.");
  }

  function renderConciliacao() {
    var avulso = concModo === "avulso";
    if (avulso && avulsa.extrato && avulsa.balancete) { $("conc-results-panel").style.display = "none"; renderPorFornecedor(); return; }
    $("conc-forn-panel").style.display = "none";
    if (avulso ? !(avulsa.extrato && avulsa.titulos) : !ultimaConc) return;
    var filtro = ($("conc-filter").value || "").toLowerCase().trim();
    var tolerancia = parseInt($("conc-tolerancia").value, 10);
    if (isNaN(tolerancia) || tolerancia < 0) tolerancia = 0;

    // conciliações manuais saem antes da automática; chaves calculadas na lista inteira (estáveis com filtro)
    var extratoTodo = avulso ? avulsa.extrato : ultimaConc.extrato;
    var sistemaTodo = avulso ? avulsa.titulos : lancamentosParaConciliar();
    // títulos que vencem depois do extrato (parcelas futuras da NF-e) ainda não são pendência
    var aVencer = [];
    if (avulso && extratoTodo.length) {
      var fimExt = extratoTodo.reduce(function(m, e){ return e.data > m ? e.data : m; }, "");
      var lim = new Date(Date.parse(fimExt + "T00:00:00Z") + tolerancia * 86400000).toISOString().slice(0, 10);
      aVencer = sistemaTodo.filter(function(t){ return t.data > lim; });
      if (aVencer.length) sistemaTodo = sistemaTodo.filter(function(t){ return t.data <= lim; });
    }
    var kE = Conciliacao.chavesUnicas(extratoTodo, Conciliacao.chaveExtrato);
    var kS = Conciliacao.chavesUnicas(sistemaTodo, Conciliacao.chaveSistema);
    var chaveDe = new Map();
    extratoTodo.forEach(function(e, i){ chaveDe.set(e, kE[i]); });
    sistemaTodo.forEach(function(s, i){ chaveDe.set(s, kS[i]); });
    var sep = Conciliacao.separarManuais(extratoTodo, sistemaTodo, gruposManuais(), kE, kS);

    var bate = function(x, lado){
      if (!filtro) return true;
      var t = lado === "ext" ? String(x.texto || x.desc) : [x.desc, x.nome, x.cpf, x.doc].join(" ");
      return t.toLowerCase().indexOf(filtro) > -1;
    };
    var extrato = sep.extrato.filter(function(e){ return bate(e, "ext"); });
    var sistema = sep.sistema.filter(function(s){ return bate(s, "sis"); });
    var manuais = sep.linhas.filter(function(l){
      return l.extratos.some(function(e){ return bate(e, "ext"); }) || l.sistemas.some(function(s){ return bate(s, "sis"); });
    });

    var res = avulso ? Conciliacao.conciliarAvulso(extrato, sistema, { toleranciaDias: tolerancia })
                     : Core.conciliar(extrato, sistema, { toleranciaDias: tolerancia });
    var ordem = { so_extrato: 0, so_sistema: 1, data_diferente: 2, manual: 3, justificado: 4, ok: 5 };
    var dataDe = function(l){ var x = l.extrato || l.sistema || (l.extratos && l.extratos[0]) || (l.sistemas && l.sistemas[0]); return x ? x.data : ""; };
    var linhas = res.linhas.concat(manuais).sort(function(a, b){ return ordem[a.status] - ordem[b.status] || dataDe(a).localeCompare(dataDe(b)); });
    ultimoResultado = linhas;

    // a seleção só guarda o que ainda está pendente
    ["ext", "sis"].forEach(function(lado){
      Object.keys(selecao[lado]).forEach(function(k){
        var vivo = linhas.some(function(l){ var x = lado === "ext" ? l.extrato : l.sistema; return x && (l.status === "so_extrato" || l.status === "so_sistema") && chaveDe.get(x) === k; });
        if (!vivo) delete selecao[lado][k];
      });
    });

    var rotulo = function(k){ return k === "so_sistema" && avulso ? "Só na planilha" : STATUS_CONC[k].texto; };
    var valor = function(l){ return l ? '<span class="' + (l.sign === "D" ? "val-d" : "val-c") + '">' + formatBRNumber(l.valorNum) + l.sign + "</span>" : '<span class="muted">—</span>'; };
    var descBancoDe = function(e){
      var cpfE = e.cpfCnpj || e.cpf;
      return escapeHtml(e.desc) + (e.nome || cpfE ? "<span class='cell-sub'>" + escapeHtml([e.nome, cpfE].filter(Boolean).join(", ")) + "</span>" : "");
    };
    var descSisDe = function(s, confere){
      return avulso ? escapeHtml(s.nome || "—") + (confere ? "<span class='nome-ok' title='O nome ou o CNPJ do fornecedor aparece no histórico do banco'>✓ no histórico</span>" : "") +
                      "<span class='cell-sub'>" + escapeHtml((s.origem === "NF-e"
                        ? [s.doc, s.cpf, "emitida " + brDate(s.emissao), "vence " + brDate(s.data)]
                        : ["Doc " + (s.doc || "—"), s.cpf, "linha " + s.linha]).filter(Boolean).join(" · ")) + "</span>"
                    : escapeHtml(s.desc);
    };
    var empilha = function(lista, fn){ return lista.map(fn).join("<hr class='sep-item'>"); };

    $("conc-body").innerHTML = linhas.map(function(l){
      var st = STATUS_CONC[l.status];
      if (l.extratos) {   // conciliação manual
        var nota = [l.obs, l.diferencaCents ? "diferença " + formatBRNumber(l.diferencaCents / 100) : ""].filter(Boolean).join(" · ");
        return "<tr class='linha-manual'>" +
          "<td>" + empilha(l.extratos, function(e){ return brDate(e.data); }) + "</td>" +
          "<td>" + empilha(l.extratos, descBancoDe) + "</td>" +
          "<td class='num'>" + (l.extratos.length ? empilha(l.extratos, valor) : '<span class="muted">—</span>') + "</td>" +
          "<td><span class='pill " + st.classe + "'>" + st.texto + "</span>" +
            "<button type='button' class='link-acao' data-desfazer='" + l.grupo + "'>Desfazer</button></td>" +
          "<td>" + empilha(l.sistemas, function(s){ return brDate(s.data); }) + "</td>" +
          "<td class='num'>" + (l.sistemas.length ? empilha(l.sistemas, valor) : '<span class="muted">—</span>') + "</td>" +
          "<td>" + (l.sistemas.length ? empilha(l.sistemas, function(s){ return descSisDe(s, false); }) : "") +
            (nota ? "<span class='cell-sub obs'>" + escapeHtml(nota) + "</span>" : "") + "</td>" +
        "</tr>";
      }
      var e = l.extrato, s = l.sistema;
      var pendente = l.status === "so_extrato" || l.status === "so_sistema";
      var lado = l.status === "so_extrato" ? "ext" : "sis";
      var k = pendente ? chaveDe.get(lado === "ext" ? e : s) : "";
      var marcado = pendente && selecao[lado][k];
      var caixa = pendente ? "<label class='sel-item' title='Selecionar para conciliar à mão'><input type='checkbox' data-lado='" + lado + "' data-k='" + escapeHtml(k) + "'" + (marcado ? " checked" : "") + "></label>" : "";
      return "<tr" + (marcado ? " class='selecionada'" : "") + ">" +
        "<td>" + (e ? brDate(e.data) : "") + "</td>" +
        "<td>" + (e ? descBancoDe(e) : "") + "</td>" +
        "<td class='num'>" + valor(e) + "</td>" +
        "<td>" + caixa + "<span class='pill " + st.classe + "'>" + rotulo(l.status) + "</span></td>" +
        "<td>" + (s ? brDate(s.data) : "") + "</td>" +
        "<td class='num'>" + valor(s) + "</td>" +
        "<td>" + (s ? descSisDe(s, l.nomeConfere) : "<span class='muted'>" + (avulso ? "Não está na planilha" : "Não lançado") + "</span>") + "</td>" +
      "</tr>";
    }).join("");

    // mapa chave → item para a seleção
    var itemDe = {};
    extratoTodo.forEach(function(x, i){ itemDe["ext|" + kE[i]] = x; });
    sistemaTodo.forEach(function(x, i){ itemDe["sis|" + kS[i]] = x; });
    Array.prototype.forEach.call($("conc-body").querySelectorAll("input[data-k]"), function(cb){
      cb.addEventListener("change", function(){
        var ladoCb = cb.dataset.lado, kk = cb.dataset.k;
        if (cb.checked) selecao[ladoCb][kk] = itemDe[ladoCb + "|" + kk]; else delete selecao[ladoCb][kk];
        cb.closest("tr").classList.toggle("selecionada", cb.checked);
        atualizarBarraSelecao();
      });
    });
    Array.prototype.forEach.call($("conc-body").querySelectorAll("[data-desfazer]"), function(bt){
      bt.addEventListener("click", function(){ desfazerGrupo(+bt.dataset.desfazer); });
    });
    atualizarBarraSelecao();

    var r = res.resumo;
    r.manual = manuais.filter(function(l){ return l.status === "manual"; }).length;
    r.justificado = manuais.filter(function(l){ return l.status === "justificado"; }).length;
    var difMan = 0;
    manuais.forEach(function(l){
      l.extratos.forEach(function(x){ difMan += (x.sign === "D" ? -1 : 1) * Math.round(x.valorNum * 100) * (avulso ? (x.sign === "D" ? -1 : 1) : 1); });
      l.sistemas.forEach(function(x){ difMan -= (x.sign === "D" ? -1 : 1) * Math.round(x.valorNum * 100) * (avulso ? (x.sign === "D" ? -1 : 1) : 1); });
    });
    var dif = (r.diferencaCents + difMan) / 100;
    var total = linhas.length || 1;
    var partes = ["ok", "data_diferente", "manual", "justificado", "so_extrato", "so_sistema"];
    var barra = partes.filter(function(k){ return r[k] > 0; }).map(function(k){
      return '<span class="' + STATUS_CONC[k].barra + '" style="flex:' + r[k] + '" title="' + rotulo(k) + ': ' + r[k] + '"></span>';
    }).join("");
    var legenda = partes.filter(function(k){ return r[k] > 0 || ["ok", "data_diferente", "so_extrato", "so_sistema"].indexOf(k) > -1; }).map(function(k){
      return '<span><i class="' + STATUS_CONC[k].barra + '"></i>' + rotulo(k) + ' <strong>' + r[k] + '</strong></span>';
    }).join("");
    var pendentes = r.so_extrato + r.so_sistema;
    var pct = Math.round((total - pendentes) / total * 100);
    var titulo = !pendentes ? "Conciliação fechada" :
      pendentes + (pendentes === 1 ? " pendência" : " pendências") + ", " + pct + "% conciliado";
    var nota = avulso && r.ignorados ? '<p class="muted small">' + r.ignorados + " " + ($("av-tipo").value === "recebimentos" ? "saída(s)" : "entrada(s)") +
      " do extrato ficaram fora, porque a planilha é de " + ($("av-tipo").value === "recebimentos" ? "recebimentos" : "pagamentos") + ".</p>" : "";
    if (aVencer.length) {
      var somaAV = aVencer.reduce(function(t, x){ return t + x.valorNum; }, 0);
      nota += '<p class="muted small">' + aVencer.length + " título(s) vencem depois do extrato (" + formatBRNumber(somaAV) + ") e ficaram fora: ainda não são pendência.</p>";
    }
    var dica = pendentes ? '<p class="muted small">Pendente que está certo? Marque as caixinhas e use <strong>Conciliar selecionados</strong> (ex.: um débito que pagou vários boletos) ou <strong>Marcar como conferido</strong> (ex.: tarifa, sem par).</p>' : "";
    $("conc-totals").innerHTML =
      '<div class="conc-headline"><h2>' + titulo + '</h2>' +
      '<div class="diff">Diferença, banco menos ' + (avulso ? "planilha" : "sistema") + '<strong class="' + (dif === 0 ? "val-c" : "val-d") + '">' + formatBRNumber(dif) + '</strong></div></div>' +
      '<div class="conc-bar" role="img" aria-label="' + pct + '% conciliado">' + barra + '</div>' +
      '<div class="conc-legend">' + legenda + '</div>' + nota + dica;
    $("conc-results-panel").style.display = "block";
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
  $("conc-modo-conta").addEventListener("click", function(){ trocarModoConc("conta"); });
  $("conc-modo-avulso").addEventListener("click", function(){ trocarModoConc("avulso"); });
  $("file-av-extrato").addEventListener("change", function(ev){ if (ev.target.files && ev.target.files.length) carregarExtratoAvulso(ev.target.files); });
  $("file-av-planilha").addEventListener("change", function(ev){ if (ev.target.files && ev.target.files.length) carregarPlanilhaAvulsa(ev.target.files); });
  $("av-tipo").addEventListener("change", function(){ if (avulsa.nfe) aplicarNfeAvulsa(); else if (avulsa.rows) aplicarPlanilhaAvulsa(); });
  $("conc-limpar").addEventListener("click", limparConciliacao);
  $("forn-limpar").addEventListener("click", limparConciliacao);
  $("forn-filtro").addEventListener("input", function(){ if (avulsa.balancete) renderPorFornecedor(); });
  $("forn-mostrar").addEventListener("change", function(){ if (avulsa.balancete) renderPorFornecedor(); });
  $("forn-exportar").addEventListener("click", function(){
    if (!ultimoResFornecedor) return;
    baixarArquivos([{ nome: "conciliacao-fornecedores-" + new Date().toISOString().slice(0, 10) + ".csv", conteudo: Conciliacao.csvPorFornecedor(ultimoResFornecedor) }]);
  });
  $("av-salvar").addEventListener("click", salvarConciliacaoAvulsa);
  $("av-abrir").addEventListener("click", abrirSalva);
  $("av-excluir").addEventListener("click", excluirSalva);
  $("conc-tolerancia").addEventListener("change", function(){ if (concModo === "avulso") autosaveAvulsa(); });
  $("conc-sel-juntar").addEventListener("click", conciliarSelecionados);
  $("conc-sel-conferido").addEventListener("click", marcarConferido);
  $("conc-sel-cancelar").addEventListener("click", function(){ limparSelecao(); renderConciliacao(); });
  $("conc-exportar").addEventListener("click", exportarConciliacao);
  $("conc-tolerancia").addEventListener("input", renderConciliacao);
  $("conc-acct").addEventListener("change", function(){
    if (ultimaConc && concModo === "conta") { ultimaConc.acctId = this.value; renderConciliacao(); }
  });
  $("export-csv").addEventListener("click", exportarCSV);
  $("export-clip").addEventListener("click", copiarParaExcel);

  $("competencia").addEventListener("change", function(){
    if (this.value === "outro") {
      var r = prompt("Qual mês? (MM/AAAA)", "");
      var m = r && /^\s*(\d{1,2})\/(\d{4})\s*$/.exec(r);
      if (m && +m[1] >= 1 && +m[1] <= 12) trocarCompetencia(m[2] + "-" + String(+m[1]).padStart(2, "0"));
      else { if (r) alert("Use o formato MM/AAAA, por exemplo 08/2026."); preencherCompetencias(); }
      return;
    }
    trocarCompetencia(this.value);
  });
  $("btn-importar-planilha").addEventListener("click", abrirImportacao);
  $("btn-importar-extratos").addEventListener("click", function(){ abrirExtratos(""); });
  $("btn-extrato-conta").addEventListener("click", function(){ abrirExtratos(itemIndex[currentTab] && itemIndex[currentTab].section === "Bancos" ? currentTab : ""); });
  $("file-extratos").addEventListener("change", function(ev){ if (ev.target.files && ev.target.files.length) analisarExtratos(ev.target.files); });
  $("ext-cancelar").addEventListener("click", function(){ $("modal-extratos").style.display = "none"; extratosLidos = []; });
  $("ext-confirmar").addEventListener("click", confirmarExtratos);
  $("btn-confirmar-sugestoes").addEventListener("click", function(){
    var entries = loadEntries(currentTab), n = 0;
    entries.forEach(function(e){ if (e.sugerido) { delete e.sugerido; n++; } });
    saveEntries(currentTab, entries);
    renderLedger();
    toast(n + " classificação(ões) confirmada(s).");
  });
  $("file-planilha").addEventListener("change", function(ev){ if (ev.target.files && ev.target.files[0]) analisarArquivoPlanilha(ev.target.files[0]); });
  $("imp-cancelar").addEventListener("click", function(){ $("modal-importar").style.display = "none"; planoImportacao = null; });
  $("imp-confirmar").addEventListener("click", confirmarImportacao);
  $("btn-backup").addEventListener("click", baixarBackup);
  $("btn-zerar-mes").addEventListener("click", zerarMes);
  $("btn-apagar-tudo").addEventListener("click", apagarTudo);
  $("file-restaurar").addEventListener("change", function(ev){ if (ev.target.files && ev.target.files[0]) restaurarBackup(ev.target.files[0]); this.value = ""; });

  $("btn-master-distribuir").addEventListener("click", function(){
    if (distribuirPorUnidade(false)) renderMaster();
  });
  $("btn-excluir-unidade").addEventListener("click", function(){ excluirUnidade(currentTab); });
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
    Modulos.definirTema(temaAtual());
  }
  $("theme-toggle").addEventListener("click", function(){
    var novo = temaAtual() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", novo);
    try { localStorage.setItem("tema", novo); } catch(e) {}
    atualizarBotaoTema();
  });
  if (mqEscuro.addEventListener) mqEscuro.addEventListener("change", atualizarBotaoTema);
  atualizarBotaoTema();

  // ---------- usuário logado: caixa no menu, sair, trocar senha ----------
  function iniciais(nome){
    var p = String(nome || "").trim().split(/\s+/).filter(Boolean);
    return ((p[0] || "?").charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : "")).toUpperCase();
  }
  function mostrarUsuario(){
    var u = usuarioLogado || {};
    $("usuario-nome").textContent = u.nome || "";
    $("usuario-email").textContent = u.email || "";
    $("usuario-avatar").textContent = iniciais(u.nome);
    $("usuario-box").title = (u.nome || "") + (u.perfil === "admin" ? " · administrador" : "");
    document.body.classList.toggle("eh-admin", ehAdmin());
    $("selo-teste").hidden = !u.teste && u.email !== AuthCore.TESTE_EMAIL;
  }
  function sair(){ (Auth ? Auth.sair() : Promise.resolve()).then(function(){ location.replace("login.html?sair=1"); }); }
  function irParaLogin(motivo){ location.replace("login.html" + (motivo ? "?" + motivo + "=1" : "")); }

  $("btn-sair").addEventListener("click", sair);
  $("btn-trocar-senha").addEventListener("click", function(){
    ["senha-atual", "senha-nova", "senha-nova2"].forEach(function(id){ $(id).value = ""; });
    $("senha-erro").textContent = "";
    $("modal-senha").style.display = "flex";
    setTimeout(function(){ $("senha-atual").focus(); }, 30);
  });
  $("senha-cancelar").addEventListener("click", function(){ $("modal-senha").style.display = "none"; });
  $("senha-salvar").addEventListener("click", function(){
    var n1 = $("senha-nova").value, n2 = $("senha-nova2").value, p = AuthCore.problemaSenha(n1);
    if (p) { $("senha-erro").textContent = p; return; }
    if (n1 !== n2) { $("senha-erro").textContent = "As duas senhas não são iguais."; return; }
    var b = this; b.disabled = true;
    Auth.trocarSenha($("senha-atual").value, n1).then(function(){
      $("modal-senha").style.display = "none";
      toast("Senha alterada.");
    }).catch(function(e){ $("senha-erro").textContent = e.message; })
      .then(function(){ b.disabled = false; });
  });

  // ---------- administração de usuários (só o admin) ----------
  var usuarioEditando = null, perfilEscolhido = "usuario";
  var NOME_AREA = {};
  AuthCore.AREAS.forEach(function(a){ NOME_AREA[a.id] = a.nome; });

  function dataHora(iso){
    if (!iso) return "—";
    var d = new Date(iso);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function renderUsuarios(){
    if (!Auth || !ehAdmin()) return;
    Auth.listarUsuarios().then(function(lista){
      $("usuarios-body").innerHTML = lista.map(function(u){
        var eu = u.id === usuarioLogado.usuarioId || u.id === usuarioLogado.id;
        var souPrincipal = usuarioLogado.email === AuthCore.ADMIN_EMAIL;
        var bloqueado = u.principal && !souPrincipal;   // só o principal mexe na conta dele
        var areas = u.perfil === "admin" ? "<span class='tag-area'>Tudo, inclusive usuários</span>"
          : u.areas.map(function(a){ return "<span class='tag-area'>" + escapeHtml(NOME_AREA[a] || a) + "</span>"; }).join("");
        var situacao = !u.ativo ? "<span class='pill inativo'>Desativado</span>"
          : u.trocarSenha ? "<span class='pill provisoria' title='Ainda não criou a própria senha'>Senha provisória</span>"
          : "<span class='pill ativo'>Ativo</span>";
        return "<tr" + (u.ativo ? "" : " class='inativo'") + ">" +
          "<td><strong>" + escapeHtml(u.nome) + (eu ? " <span class='muted small'>(você)</span>" : "") + "</strong><span class='cell-sub'>" + escapeHtml(u.email) + "</span></td>" +
          "<td>" + (u.teste ? "<span class='pill provisoria'>Conta de teste</span>"
                    : u.principal ? "<span class='pill admin'>Administrador principal</span>"
                    : u.perfil === "admin" ? "<span class='pill admin'>Administrador</span>" : "Usuário") + "</td>" +
          "<td><div class='areas-lista'>" + areas + "</div></td>" +
          "<td>" + situacao + "</td>" +
          "<td class='muted small'>" + dataHora(u.ultimoAcesso) + "</td>" +
          "<td class='row-actions'>" + (bloqueado || u.teste ? "" :
            "<button type='button' data-editar='" + u.id + "'>Editar</button>" +
            "<button type='button' data-senha='" + u.id + "'>Nova senha</button>" +
            (eu ? "" : "<button type='button' data-ativo='" + u.id + "'>" + (u.ativo ? "Desativar" : "Ativar") + "</button>" +
                       "<button type='button' class='danger' data-excluir='" + u.id + "'>Excluir</button>")) +
          "</td></tr>";
      }).join("");
      var porId = {};
      lista.forEach(function(u){ porId[u.id] = u; });
      var acao = function(attr, fn){
        Array.prototype.forEach.call($("usuarios-body").querySelectorAll("[" + attr + "]"), function(b){
          b.addEventListener("click", function(){ fn(porId[b.getAttribute(attr)]); });
        });
      };
      acao("data-editar", abrirUsuario);
      acao("data-senha", function(u){
        if (!confirm("Gerar uma nova senha provisória para " + u.nome + "?\n\nA senha atual deixa de funcionar e a pessoa cria uma nova no próximo acesso.")) return;
        Auth.redefinirSenha(u.id).then(function(r){ renderUsuarios(); mostrarAcesso(r.usuario, r.senhaProvisoria, "Nova senha provisória"); })
          .catch(function(e){ alert(e.message); });
      });
      acao("data-ativo", function(u){
        if (u.ativo && !confirm("Desativar o acesso de " + u.nome + "? A pessoa não consegue mais entrar até ser ativada de novo.")) return;
        Auth.atualizarUsuario(u.id, { ativo: !u.ativo }).then(function(){ toast(u.ativo ? "Acesso desativado." : "Acesso ativado."); renderUsuarios(); })
          .catch(function(e){ alert(e.message); });
      });
      acao("data-excluir", function(u){
        if (!confirm("Excluir o usuário " + u.nome + " (" + u.email + ")? Não dá para desfazer.\n\nSe for só por um tempo, prefira Desativar.")) return;
        Auth.excluirUsuario(u.id).then(function(){ toast("Usuário excluído."); renderUsuarios(); }).catch(function(e){ alert(e.message); });
      });
    }).catch(function(e){ toast(e.message); });
  }

  function marcarPerfil(perfil){
    perfilEscolhido = perfil;
    Array.prototype.forEach.call(document.querySelectorAll("#modal-usuario [data-perfil]"), function(b){
      var sim = b.dataset.perfil === perfil;
      b.classList.toggle("ativo", sim); b.setAttribute("aria-checked", sim);
    });
    $("usr-areas").disabled = perfil === "admin";
    $("usr-perfil-ajuda").textContent = perfil === "admin"
      ? "Para gestores e gerentes: acessa tudo e cadastra, altera e desativa usuários (menos o administrador principal)."
      : "Usuário acessa só as áreas marcadas abaixo.";
  }

  function abrirUsuario(u){
    usuarioEditando = u || null;
    $("modal-usuario-titulo").textContent = u ? "Editar usuário" : "Novo usuário";
    $("usr-salvar").textContent = u ? "Salvar" : "Criar usuário";
    $("usr-nome").value = u ? u.nome : "";
    $("usr-email").value = u ? u.email : "";
    $("usr-email").readOnly = !!u && u.email === AuthCore.ADMIN_EMAIL;
    $("usr-ativo-wrap").hidden = !u;
    $("usr-ativo").checked = u ? u.ativo : true;
    $("usr-erro").textContent = "";
    $("usr-areas").innerHTML = '<legend class="field-label">Pode acessar</legend>' + AuthCore.AREAS.map(function(a){
      var marcado = u ? (u.perfil === "admin" || u.areas.indexOf(a.id) > -1) : false;
      return '<label class="area-opcao"><input type="checkbox" value="' + a.id + '"' + (marcado ? " checked" : "") + '><span><strong>' +
        escapeHtml(a.nome) + '</strong>' + (a.detalhe ? '<span>' + escapeHtml(a.detalhe) + '</span>' : '') + '</span></label>';
    }).join("");
    marcarPerfil(u ? u.perfil : "usuario");
    $("modal-usuario").style.display = "flex";
    setTimeout(function(){ $("usr-nome").focus(); }, 30);
  }

  Array.prototype.forEach.call(document.querySelectorAll("#modal-usuario [data-perfil]"), function(b){
    b.addEventListener("click", function(){ marcarPerfil(b.dataset.perfil); });
  });
  $("btn-novo-usuario").addEventListener("click", function(){ abrirUsuario(null); });
  $("usr-cancelar").addEventListener("click", function(){ $("modal-usuario").style.display = "none"; });
  $("usr-salvar").addEventListener("click", function(){
    var areas = Array.prototype.map.call($("usr-areas").querySelectorAll("input:checked"), function(i){ return i.value; });
    var dados = { nome: $("usr-nome").value, email: $("usr-email").value, perfil: perfilEscolhido, areas: areas };
    var b = this; b.disabled = true; $("usr-erro").textContent = "";
    var feito = usuarioEditando
      ? Auth.atualizarUsuario(usuarioEditando.id, Object.assign(dados, { ativo: $("usr-ativo").checked })).then(function(){
          $("modal-usuario").style.display = "none"; toast("Usuário atualizado.");
          if (usuarioEditando.id === usuarioLogado.usuarioId) return Auth.usuarioAtual().then(function(u){ if (u) { usuarioLogado = u; usuarioLogado.usuarioId = u.id; mostrarUsuario(); } });
        })
      : Auth.criarUsuario(dados).then(function(r){
          $("modal-usuario").style.display = "none";
          mostrarAcesso(r.usuario, r.senhaProvisoria, "Acesso criado");
        });
    feito.then(renderUsuarios).catch(function(e){ $("usr-erro").textContent = e.message; }).then(function(){ b.disabled = false; });
  });

  function linkDoSistema(){ return location.origin + location.pathname.replace(/index\.html$/, ""); }

  function mostrarAcesso(u, senha, titulo){
    $("modal-acesso-titulo").textContent = titulo;
    var primeiroNome = u.nome.split(" ")[0];
    var texto = "Olá, " + primeiroNome + "! Segue o seu acesso à Gestão Financeira da Orprocon:\n\n" +
      "Link: " + linkDoSistema() + "\n" +
      "E-mail: " + u.email + "\n" +
      "Senha provisória: " + senha + "\n\n" +
      "No primeiro acesso o sistema pede para você criar a sua própria senha.\n" +
      "Nesta fase de testes, na primeira vez neste computador, escolha \"Importar o arquivo de acessos\" e use o arquivo que vou te enviar junto.";
    $("acesso-mensagem").value = texto;
    $("acesso-whatsapp").href = "https://wa.me/?text=" + encodeURIComponent(texto);
    $("acesso-email").href = "mailto:" + encodeURIComponent(u.email) + "?subject=" + encodeURIComponent("Acesso à Gestão Financeira — Orprocon") + "&body=" + encodeURIComponent(texto);
    $("modal-acesso").style.display = "flex";
  }
  $("acesso-fechar").addEventListener("click", function(){ $("modal-acesso").style.display = "none"; $("acesso-mensagem").value = ""; });
  $("acesso-copiar").addEventListener("click", function(){
    var t = $("acesso-mensagem");
    (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(function(){ toast("Mensagem copiada."); })
      .catch(function(){ t.select(); document.execCommand("copy"); toast("Mensagem copiada."); });
  });

  $("btn-exportar-acessos").addEventListener("click", function(){
    Auth.exportarAcessos().then(function(arq){
      baixarArquivos([{ nome: "acessos-gestao-financeira-" + new Date().toISOString().slice(0, 10) + ".json", conteudo: JSON.stringify(arq) }]);
      toast("Arquivo de acessos baixado. Envie junto com a mensagem de acesso.");
    }).catch(function(e){ alert(e.message); });
  });
  $("file-importar-acessos").addEventListener("change", function(ev){
    var f = ev.target.files && ev.target.files[0];
    this.value = "";
    if (!f) return;
    f.text().then(function(t){ return Auth.importarAcessos(JSON.parse(t)); })
      .then(function(r){ toast(r.novos + " novo(s) e " + r.atualizados + " atualizado(s)."); renderUsuarios(); })
      .catch(function(e){ alert(e instanceof SyntaxError ? "Este não é um arquivo de acessos do sistema." : e.message); });
  });

  // sessão: ao voltar para a aba, confere se ainda vale (12 horas sem usar encerram a sessão)
  document.addEventListener("visibilitychange", function(){
    if (document.visibilityState !== "visible" || !Auth) return;
    Auth.usuarioAtual().then(function(u){ if (!u || u.trocarSenha) irParaLogin("expirou"); });
  });

  // ---------- módulos ----------
  window.addEventListener("resize", function(){ if (itemIndex[currentTab] && itemIndex[currentTab].type === "modulo") Modulos.ajustarAltura($("modulo-area")); });
  // o Painel de vencimentos grava os dados dele; o número no menu acompanha
  window.addEventListener("storage", function(ev){ if (ev.key && Modulos.ehDadoDeModulo(ev.key)) refreshCounts(); });

  // ---------- início ----------
  mostrarUsuario();
  var LOGIN_PENDENTE = {};
  Store.init().then(function(ok){
    if (!ok) toast("Este navegador não permite gravar dados. Nada será salvo.");
    Auth = AuthCore.criarAuthLocal(Store, localStorage, { modoTeste: !!(window.CONFIG && CONFIG.modoTeste) });
    return Auth.usuarioAtual().then(function(u){
      if (!u || u.trocarSenha) { irParaLogin(u ? "" : "expirou"); throw LOGIN_PENDENTE; }
      usuarioLogado = u;
      usuarioLogado.usuarioId = u.id;
      montarMenu();
      mostrarUsuario();
    }).then(function(){ return migrarParaCompetencias(); }).then(function(mesMigrado){
      if (mesMigrado && !localStorage.getItem("competencia")) { competencia = mesMigrado; localStorage.setItem("competencia", mesMigrado); }
      return ok;
    });
  }).then(function(ok){
    preencherCompetencias();
    var emAndamentoInicio = Store.get(CHAVE_AV_ATUAL);
    if (emAndamentoInicio) { restaurarAvulsa(emAndamentoInicio); trocarModoConc("avulso"); }
    refreshFormOptions();
    buildSidebar();
    populateConcSelect();
    var pedido = decodeURIComponent((location.hash || "").slice(1));
    selectTab(itemIndex[pedido] ? pedido : (bancos.length && itemIndex[bancos[0].id] ? bancos[0].id : "master"));
    $("content").setAttribute("aria-busy", "false");
  }).catch(function(e){ if (e !== LOGIN_PENDENTE) console.error(e); });

  window.addEventListener("beforeunload", function(e){
    if (Store.gravando()) { e.preventDefault(); e.returnValue = ""; }
  });

})();
