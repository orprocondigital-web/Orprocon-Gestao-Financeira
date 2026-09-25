(function(){
  "use strict";

  var DEFAULT_CATEGORIAS = ["Aplicações","Crédito Bloqueado","Despesa","Pagamento","Pendente","Recebimento","Resgate","Saldo do dia"];
  var DEFAULT_UNIDADES = ["Matriz","Tubarão","Chapecó","Criciúma","Florianópolis","Passo Fundo"];

  var savedBanks = JSON.parse(localStorage.getItem("system_banks"));
  if (!savedBanks) {
    savedBanks = [];
    localStorage.setItem("system_banks", JSON.stringify(savedBanks));
  }

  var savedUnits = JSON.parse(localStorage.getItem("system_units"));
  if (!savedUnits) {
    savedUnits = [];
    localStorage.setItem("system_units", JSON.stringify(savedUnits));
  }

  var MENU_SECTIONS = [
    {
      title: "Visão Geral & Fechamento",
      items: [
        { id: "master", label: "Master", type: "master" },
        { id: "conciliacao", label: "Conciliação", type: "conciliacao" }
      ]
    },
    {
      title: "Bancos",
      items: savedBanks
    },
    {
      title: "Unidades",
      items: savedUnits
    },
    {
      title: "Outras Movimentações",
      items: [
        { id: "mov-dinheiro", label: "Pagamentos em Dinheiro", type: "ledger", bank: "Movimento", sheetName: "pagamentos em dinheiro" },
        { id: "mov-juros", label: "Juros Recebidos", type: "ledger", bank: "Movimento", sheetName: "juros recebidos" },
        { id: "mov-compras", label: "Digitação Compras", type: "ledger", bank: "Movimento", sheetName: "digitação compras" }
      ]
    },
    {
      title: "Cadastros Base",
      items: [
        { id: "cad-clientes", label: "Clientes", type: "cadastro", sheetName: "clientes" },
        { id: "cad-fornecedores", label: "Fornecedores", type: "cadastro", sheetName: "fornecedores" },
        { id: "cad-plano", label: "Plano de Contas", type: "cadastro", sheetName: "plano de contas" },
        { id: "cad-custos", label: "Central de Custos", type: "cadastro", sheetName: "central de custos" },
        { id: "cad-bancos", label: "Tabela de Bancos", type: "cadastro", sheetName: "tabela de bancos" },
        { id: "cad-unidades", label: "Tabela de Unidades", type: "cadastro", sheetName: "tabela de unidades" }
      ]
    }
  ];

  var itemIndex = {};
  MENU_SECTIONS.forEach(function(sec){
    sec.items.forEach(function(item){
      item.section = sec.title;
      itemIndex[item.id] = item;
    });
  });


  var currentTab = null;
  var editingId = null;

  // ---------- storage ----------
  function storageKey(id){ return "lancamentos:agosto:" + id; }

  function loadEntries(id){
    try {
      var raw = localStorage.getItem(storageKey(id));
      return raw ? JSON.parse(raw) : [];
    } catch(e){ return []; }
  }

  function saveEntries(id, entries){
    try {
      localStorage.setItem(storageKey(id), JSON.stringify(entries));
      return true;
    } catch(e){ return false; }
  }

  // ---------- helpers (regras em js/core.js) ----------
  var brDate = Core.brDate;
  var parseValorInput = Core.parseValor;
  var formatBRNumber = Core.formatBR;

  function toast(msg){
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._h);
    toast._h = setTimeout(function(){ t.classList.remove("show"); }, 2200);
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(m){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m];
    });
  }

  // ---------- sidebar ----------
  function buildSidebar(){
    var wrap = document.getElementById("sidebar-menu");
    wrap.innerHTML = "";
    MENU_SECTIONS.forEach(function(sec){
      var secTitle = document.createElement("div");
      secTitle.style.marginTop = "22px";
      secTitle.style.marginBottom = "6px";
      secTitle.style.padding = "0 10px";
      secTitle.style.fontSize = "11px";
      secTitle.style.color = "#C9C2AD";
      secTitle.style.fontWeight = "700";
      secTitle.style.textTransform = "uppercase";
      secTitle.style.letterSpacing = "0.05em";
      secTitle.textContent = sec.title;
      wrap.appendChild(secTitle);

      var subGroups = {};
      sec.items.forEach(function(item){
        var key = item.bank || ""; 
        if(!subGroups[key]) subGroups[key] = [];
        subGroups[key].push(item);
      });

      Object.keys(subGroups).forEach(function(key){
        var group = document.createElement("div");
        group.className = "bank-group";
        group.style.marginTop = "4px";
        
        if (key && key !== "Unidade" && key !== "Movimento") {
           var title = document.createElement("div");
           title.className = "bank-name";
           title.textContent = key;
           group.appendChild(title);
        }
        
        subGroups[key].forEach(function(item){
          var btn = document.createElement("button");
          btn.className = "acct-btn";
          btn.id = "btn-" + item.id;
          btn.innerHTML = item.label + '<span class="acct-count" id="count-' + item.id + '"></span>';
          btn.addEventListener("click", function(){ selectTab(item.id); });
          group.appendChild(btn);
        });
        wrap.appendChild(group);
      });
    });
    refreshCounts();
  }

  function refreshCounts(){
    Object.keys(itemIndex).forEach(function(id){
      var el = document.getElementById("count-" + id);
      if(el) {
        var count = loadEntries(id).length;
        el.textContent = count || "";
      }
    });
  }

  // ---------- Navigation ----------
  function selectTab(id){
    currentTab = id;
    editingId = null;
    var item = itemIndex[id];
    
    // UI states
    document.querySelectorAll(".acct-btn").forEach(function(b){ b.classList.remove("active"); });
    document.getElementById("btn-" + id).classList.add("active");
    
    var title = item.bank ? (item.bank + " — " + item.label) : item.label;
    document.getElementById("view-title").textContent = title;
    document.getElementById("view-sub").textContent = item.section.toUpperCase();

    // Hide all views
    document.getElementById("view-ledger").style.display = "none";
    document.getElementById("view-cadastro").style.display = "none";
    document.getElementById("view-master").style.display = "none";
    document.getElementById("view-conciliacao").style.display = "none";

    // Show correct view based on type
    if (item.type === "ledger") {
      document.getElementById("view-ledger").style.display = "block";
      document.getElementById("f-datamov-wrap").style.display = item.hasDataMov ? "block" : "none";
      document.getElementById("cancel-edit").style.display = "none";
      document.getElementById("submit-btn").textContent = "Adicionar lançamento";
      document.getElementById("import-status-ledger").textContent = "";
      document.getElementById("import-filename-ledger").textContent = "nenhum arquivo escolhido";
      document.getElementById("file-import-ledger").value = "";
      
      var delBtn = document.getElementById("delete-acct");
      if (delBtn) delBtn.style.display = ((item.section === "Bancos" || item.section === "Unidades") ? "inline-block" : "none");
      
      resetForm();
      renderLedger();
    } 
    else if (item.type === "cadastro") {
      document.getElementById("view-cadastro").style.display = "block";
      document.getElementById("import-status-cadastro").textContent = "";
      document.getElementById("import-filename-cadastro").textContent = "nenhum arquivo escolhido";
      document.getElementById("file-import-cadastro").value = "";
      renderCadastro();
    }
    else if (item.type === "master") {
      document.getElementById("view-master").style.display = "block";
      renderMaster();
    }
    else if (item.type === "conciliacao") {
      document.getElementById("view-conciliacao").style.display = "block";
    }
  }

  // ---------- Ledger (Bancos, Unidades, Movimentações) ----------
  function resetForm(){
    document.getElementById("entry-form").reset();
    setValorSign("C");
    document.getElementById("form-error").style.display = "none";
  }

  function setValorSign(sign){
    document.getElementById("btn-c").classList.toggle("active", sign === "C");
    document.getElementById("btn-d").classList.toggle("active", sign === "D");
    document.getElementById("entry-form").dataset.sign = sign;
  }

  function formatValorField(){
    var input = document.getElementById("f-valor");
    var n = parseValorInput(input.value);
    if(!isNaN(n)) input.value = formatBRNumber(n);
  }

  function columnsFor(item){
    var cols = [{ key: "data", label: "Data" }];
    if(item.hasDataMov) cols.push({ key: "dataMov", label: "Data Movimento" });
    cols.push(
      { key: "desc", label: "Descrição/Histórico" },
      { key: "doc", label: "Doc." },
      { key: "valor", label: "Valor" },
      { key: "categoria", label: "Categoria" },
      { key: "unidade", label: "Unidade" },
      { key: "nome", label: "Fornecedor/Cliente" },
      { key: "cpf", label: "CPF/CNPJ" },
      { key: "", label: "" }
    );
    return cols;
  }

  function renderLedger(){
    if(!currentTab) return;
    var item = itemIndex[currentTab];
    var entries = loadEntries(currentTab);
    var cols = columnsFor(item);

    var head = document.getElementById("ledger-head");
    head.innerHTML = cols.map(function(c){ return "<th>" + c.label + "</th>"; }).join("");

    var body = document.getElementById("ledger-body");
    var empty = document.getElementById("ledger-empty");
    body.innerHTML = "";

    if(entries.length === 0){
      empty.style.display = "block";
    } else {
      empty.style.display = "none";
      entries.slice().sort(function(a,b){ return (a.data||"").localeCompare(b.data||""); }).forEach(function(e){
        var tr = document.createElement("tr");
        var cells = [];
        cells.push(brDate(e.data));
        if(item.hasDataMov) cells.push(brDate(e.dataMov));
        cells.push(escapeHtml(e.desc));
        cells.push(escapeHtml(e.doc||""));
        var valClass = e.sign === "D" ? "val-d" : "val-c";
        cells.push('<span class="' + valClass + '">' + formatBRNumber(e.valorNum) + e.sign + '</span>');
        cells.push(escapeHtml(e.categoria));
        cells.push(escapeHtml(e.unidade));
        cells.push(escapeHtml(e.nome||""));
        cells.push(escapeHtml(e.cpf||""));
        tr.innerHTML = cells.map(function(c){ return "<td>" + c + "</td>"; }).join("");
        
        var actionsTd = document.createElement("td");
        actionsTd.className = "row-actions";
        var editBtn = document.createElement("button"); editBtn.textContent = "editar";
        editBtn.addEventListener("click", function(){ startEdit(e.id); });
        var delBtn = document.createElement("button"); delBtn.textContent = "excluir";
        delBtn.addEventListener("click", function(){ deleteEntry(e.id); });
        actionsTd.appendChild(editBtn); actionsTd.appendChild(delBtn);
        
        tr.appendChild(actionsTd);
        body.appendChild(tr);
      });
    }

    var totC = 0, totD = 0;
    entries.forEach(function(e){ if(e.sign === "D") totD += e.valorNum; else totC += e.valorNum; });
    document.getElementById("totals").innerHTML =
      '<span>créditos: </span><strong class="val-c">' + formatBRNumber(totC) + 'C</strong>' +
      '<span>débitos: </span><strong class="val-d">' + formatBRNumber(totD) + 'D</strong>' +
      '<span>' + entries.length + ' lançamento(s)</span>';

    refreshCounts();
  }

  function startEdit(id){
    var entries = loadEntries(currentTab);
    var e = entries.find(function(x){ return x.id === id; });
    if(!e) return;
    editingId = id;
    document.getElementById("f-data").value = e.data || "";
    if(document.getElementById("f-datamov")) document.getElementById("f-datamov").value = e.dataMov || "";
    document.getElementById("f-desc").value = e.desc || "";
    document.getElementById("f-doc").value = e.doc || "";
    document.getElementById("f-valor").value = formatBRNumber(e.valorNum);
    setValorSign(e.sign);
    document.getElementById("f-categoria").value = e.categoria || "";
    document.getElementById("f-unidade").value = e.unidade || "";
    document.getElementById("f-nome").value = e.nome || "";
    document.getElementById("f-cpf").value = e.cpf || "";
    document.getElementById("submit-btn").textContent = "Salvar edição";
    document.getElementById("cancel-edit").style.display = "inline-block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteEntry(id){
    var entries = loadEntries(currentTab).filter(function(x){ return x.id !== id; });
    saveEntries(currentTab, entries);
    renderLedger();
    toast("Lançamento excluído.");
  }

  function submitForm(ev){
    ev.preventDefault();
    var item = itemIndex[currentTab];
    var data = document.getElementById("f-data").value;
    var dataMov = item.hasDataMov ? document.getElementById("f-datamov").value : "";
    var desc = document.getElementById("f-desc").value.trim();
    var doc = document.getElementById("f-doc").value.trim();
    var valorRaw = document.getElementById("f-valor").value;
    var valorNum = parseValorInput(valorRaw);
    var sign = document.getElementById("entry-form").dataset.sign || "C";
    var categoria = document.getElementById("f-categoria").value;
    var unidade = document.getElementById("f-unidade").value;
    var nome = document.getElementById("f-nome").value.trim();
    var cpf = document.getElementById("f-cpf").value.trim();

    if(!data || !desc || isNaN(valorNum) || !categoria || !unidade){
      document.getElementById("form-error").style.display = "block";
      return;
    }
    document.getElementById("form-error").style.display = "none";

    var entries = loadEntries(currentTab);
    if(editingId){
      var idx = entries.findIndex(function(x){ return x.id === editingId; });
      if(idx > -1){
        entries[idx] = Object.assign({}, entries[idx], { data:data, dataMov:dataMov, desc:desc, doc:doc, valorNum:valorNum, sign:sign, categoria:categoria, unidade:unidade, nome:nome, cpf:cpf });
      }
      editingId = null;
      document.getElementById("cancel-edit").style.display = "none";
      document.getElementById("submit-btn").textContent = "Adicionar lançamento";
      toast("Lançamento atualizado.");
    } else {
      entries.push({
        id: "e" + Date.now() + Math.random().toString(36).slice(2,7),
        data: data, dataMov: dataMov, desc: desc, doc: doc,
        valorNum: valorNum, sign: sign, categoria: categoria, unidade: unidade,
        nome: nome, cpf: cpf
      });
      toast("Lançamento adicionado.");
    }
    var ok = saveEntries(currentTab, entries);
    if(!ok) toast("Não foi possível salvar — armazenamento indisponível.");
    resetForm();
    renderLedger();
  }

  // ---------- Cadastro View ----------
  function renderCadastro() {
    if(!currentTab) return;
    var entries = loadEntries(currentTab);
    var body = document.getElementById("cadastro-body");
    body.innerHTML = "";

    if(entries.length === 0){
      var tr = document.createElement("tr");
      tr.innerHTML = "<td colspan='2' class='empty'>Nenhum cadastro encontrado. Importe da planilha para preencher.</td>";
      body.appendChild(tr);
    } else {
      entries.forEach(function(e) {
        var tr = document.createElement("tr");
        var nameCell = document.createElement("td");
        nameCell.textContent = e.nome || e.desc || e.categoria || "Sem nome";
        
        var actionsTd = document.createElement("td");
        actionsTd.className = "row-actions";
        var delBtn = document.createElement("button"); delBtn.textContent = "excluir";
        delBtn.addEventListener("click", function(){
           var updated = loadEntries(currentTab).filter(function(x){ return x.id !== e.id; });
           saveEntries(currentTab, updated);
           renderCadastro();
        });
        actionsTd.appendChild(delBtn);
        
        tr.appendChild(nameCell);
        tr.appendChild(actionsTd);
        body.appendChild(tr);
      });
    }
    refreshCounts();
  }

  // ---------- Master View ----------
  function renderMaster() {
    var totCredit = 0;
    var totDebit = 0;
    var accountStats = [];

    // Iterar apenas pelas abas do tipo "ledger"
    Object.keys(itemIndex).forEach(function(id) {
      var item = itemIndex[id];
      if (item.type !== "ledger") return;
      
      var entries = loadEntries(id);
      var c = 0, d = 0;
      entries.forEach(function(e) {
        if(e.sign === "D") d += e.valorNum;
        else c += e.valorNum;
      });

      if (c > 0 || d > 0) {
        totCredit += c;
        totDebit += d;
        accountStats.push({ 
          label: (item.bank ? item.bank + " - " : "") + item.label, 
          c: c, d: d, bal: c - d 
        });
      }
    });

    var cardsHtml = 
      '<div class="card"><div class="label">Total Entradas (Créditos)</div><div class="value val-c">' + formatBRNumber(totCredit) + 'C</div></div>' +
      '<div class="card"><div class="label">Total Saídas (Débitos)</div><div class="value val-d">' + formatBRNumber(totDebit) + 'D</div></div>' +
      '<div class="card"><div class="label">Saldo Geral</div><div class="value ' + ((totCredit - totDebit) >= 0 ? 'val-c' : 'val-d') + '">' + formatBRNumber(totCredit - totDebit) + '</div></div>';
    
    document.getElementById("master-cards").innerHTML = cardsHtml;

    var tbody = document.getElementById("master-body");
    tbody.innerHTML = "";
    if (accountStats.length === 0) {
      tbody.innerHTML = "<tr><td colspan='4' class='empty'>Nenhuma movimentação encontrada nas contas.</td></tr>";
    } else {
      accountStats.forEach(function(st) {
        var tr = document.createElement("tr");
        tr.innerHTML = 
          '<td>' + escapeHtml(st.label) + '</td>' +
          '<td class="val-c">' + formatBRNumber(st.c) + 'C</td>' +
          '<td class="val-d">' + formatBRNumber(st.d) + 'D</td>' +
          '<td class="' + (st.bal >= 0 ? 'val-c' : 'val-d') + '">' + formatBRNumber(st.bal) + (st.bal >= 0 ? 'C' : 'D') + '</td>';
        tbody.appendChild(tr);
      });
    }
  }

  // ---------- Imports ----------
  function importFile(file, isLedger){
    var statusEl = document.getElementById(isLedger ? "import-status-ledger" : "import-status-cadastro");
    document.getElementById(isLedger ? "import-filename-ledger" : "import-filename-cadastro").textContent = file.name;
    statusEl.textContent = "Lendo arquivo…";

    var reader = new FileReader();
    reader.onload = function(ev){
      try {
        var data = new Uint8Array(ev.target.result);
        var wb = XLSX.read(data, { type: "array", cellDates: true });
        var item = itemIndex[currentTab];
        var sheetName = item.sheetName;

        var foundSheet = Core.findSheet(wb.SheetNames, item);
        if(!foundSheet){
          statusEl.textContent = "Não encontrei a aba \"" + sheetName + "\" neste arquivo. Abas disponíveis: " + wb.SheetNames.join(", ");
          return;
        }

        var ws = wb.Sheets[foundSheet];
        var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
        var headerIdx = Core.detectHeaderRow(rows);
        var colMap = Core.buildColumnMap(rows[headerIdx]);

        var imported = [];
        for(var r = headerIdx + 1; r < rows.length; r++){
          var row = rows[r];
          if(!row || row.every(function(c){ return c === "" || c === null || c === undefined; })) continue;

          if (isLedger) {
            var isoDate = Core.toIsoDate(colMap.data !== undefined ? row[colMap.data] : "");
            var valorCell = colMap.valor !== undefined ? row[colMap.valor] : "";
            var parsedValor = Core.parseValorCell(valorCell);
            var desc = colMap.desc !== undefined ? String(row[colMap.desc] || "").trim() : "";
            if(!isoDate || !parsedValor || !desc) continue;

            imported.push({
              id: "e" + Date.now() + Math.random().toString(36).slice(2,7) + r,
              data: isoDate,
              dataMov: item.hasDataMov && colMap.dataMov !== undefined ? Core.toIsoDate(row[colMap.dataMov]) : "",
              desc: desc,
              doc: colMap.doc !== undefined ? String(row[colMap.doc] || "").trim() : "",
              valorNum: parsedValor.valorNum,
              sign: parsedValor.sign,
              categoria: colMap.categoria !== undefined ? String(row[colMap.categoria] || "").trim() : "",
              unidade: colMap.unidade !== undefined ? String(row[colMap.unidade] || "").trim() : "",
              nome: colMap.nome !== undefined ? String(row[colMap.nome] || "").trim() : "",
              cpf: colMap.cpf !== undefined ? String(row[colMap.cpf] || "").trim() : ""
            });
          } else {
            // Importando Cadastro (apenas pega nome ou descrição dependendo do que achar)
            var cadName = "";
            if (colMap.nome !== undefined && row[colMap.nome]) cadName = row[colMap.nome];
            else if (colMap.desc !== undefined && row[colMap.desc]) cadName = row[colMap.desc];
            else if (row[0]) cadName = row[0]; // fallback to first column
            
            if(!String(cadName).trim()) continue;
            
            imported.push({
              id: "c" + Date.now() + Math.random().toString(36).slice(2,7) + r,
              nome: String(cadName).trim()
            });
          }
        }

        if(imported.length === 0){
          statusEl.textContent = "Nenhum dado reconhecido nessa aba.";
          return;
        }

        var existing = loadEntries(currentTab);
        var append = existing.length === 0 || confirm(
          "Encontrei " + imported.length + " item(ns) na aba \"" + foundSheet + "\".\n\n" +
          "OK = adicionar aos " + existing.length + " já existentes.\n" +
          "Cancelar = substituir os existentes por estes."
        );
        var finalEntries = append ? existing.concat(imported) : imported;
        
        // Remove duplicates for Cadastros
        if(!isLedger) {
           var unique = [];
           var seen = {};
           finalEntries.forEach(function(c) {
              if(!seen[c.nome]) { seen[c.nome] = true; unique.push(c); }
           });
           finalEntries = unique;
        }

        saveEntries(currentTab, finalEntries);
        
        if (isLedger) renderLedger();
        else renderCadastro();
        
        statusEl.textContent = imported.length + " item(ns) importado(s).";
        toast("Importação concluída.");
      } catch(err){
        statusEl.textContent = "Erro ao ler arquivo: " + (err.message || "desconhecido");
      }
    };
    reader.onerror = function(){ statusEl.textContent = "Falha ao ler o arquivo."; };
    reader.readAsArrayBuffer(file);
  }

  // ---------- Conciliação ----------
  function populateConcSelect() {
    var sel = document.getElementById("conc-acct");
    sel.innerHTML = '<option value="" disabled selected>Escolha uma conta…</option>';
    Object.keys(itemIndex).forEach(function(id){
      var item = itemIndex[id];
      if (item.type === "ledger") {
        var opt = document.createElement("option");
        opt.value = id;
        opt.textContent = (item.bank ? item.bank + " - " : "") + item.label;
        sel.appendChild(opt);
      }
    });
  }

  var ultimaConc = null; // { acctId, extrato, formato, arquivo } — permite refiltrar sem reimportar

  var STATUS_CONC = {
    ok:             { classe: "conc-match", texto: "✓ OK" },
    data_diferente: { classe: "conc-warn",  texto: "≈ DATA DIFERENTE" },
    so_extrato:     { classe: "conc-diff",  texto: "✗ SÓ NO BANCO" },
    so_sistema:     { classe: "conc-miss",  texto: "! SÓ NO SISTEMA" }
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

    var valor = function(l){ return l ? '<span class="' + (l.sign === "D" ? "val-d" : "val-c") + '">' + formatBRNumber(l.valorNum) + l.sign + "</span>" : "-"; };
    document.getElementById("conc-body").innerHTML = linhas.map(function(l){
      var st = STATUS_CONC[l.status];
      var e = l.extrato, s = l.sistema;
      var descBanco = e ? escapeHtml(e.desc) + (e.nome ? "<br><span class='hint'>" + escapeHtml(e.nome) + (e.cpfCnpj ? " · " + escapeHtml(e.cpfCnpj) : "") + "</span>" : "") : "";
      return "<tr>" +
        "<td>" + (e ? brDate(e.data) : "") + "</td>" +
        "<td>" + descBanco + "</td>" +
        "<td style='border-right:1px solid var(--paper-line);'>" + valor(e) + "</td>" +
        "<td class='" + st.classe + "'>" + st.texto + "</td>" +
        "<td>" + (s ? brDate(s.data) : "") + "</td>" +
        "<td>" + valor(s) + "</td>" +
        "<td>" + (s ? escapeHtml(s.desc) : "<span class='hint'>não lançado</span>") + "</td>" +
      "</tr>";
    }).join("");

    var r = res.resumo;
    var dif = r.diferencaCents / 100;
    document.getElementById("conc-totals").innerHTML =
      "<span class='val-c'>OK: <strong>" + r.ok + "</strong></span>" +
      "<span>Data diferente: <strong>" + r.data_diferente + "</strong></span>" +
      "<span class='val-d'>Só no banco: <strong>" + r.so_extrato + "</strong></span>" +
      "<span>Só no sistema: <strong>" + r.so_sistema + "</strong></span>" +
      "<span>Diferença de saldo (banco − sistema): <strong class='" + (dif === 0 ? "val-c" : "val-d") + "'>" + formatBRNumber(dif) + "</strong></span>" +
      "<span><strong>" + (r.fechado ? "✓ Conciliação fechada" : "Conciliação em aberto") + "</strong></span>";
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

  // ---------- Events & Init ----------
  document.getElementById("btn-c").addEventListener("click", function(){ setValorSign("C"); });
  document.getElementById("btn-d").addEventListener("click", function(){ setValorSign("D"); });
  document.getElementById("f-valor").addEventListener("blur", formatValorField);
  document.getElementById("entry-form").addEventListener("submit", submitForm);

  document.getElementById("cancel-edit").addEventListener("click", function(){
    editingId = null;
    resetForm();
    document.getElementById("cancel-edit").style.display = "none";
    document.getElementById("submit-btn").textContent = "Adicionar lançamento";
  });

  document.getElementById("file-import-ledger").addEventListener("change", function(ev){
    if(ev.target.files && ev.target.files[0]) importFile(ev.target.files[0], true);
  });
  document.getElementById("file-import-cadastro").addEventListener("change", function(ev){
    if(ev.target.files && ev.target.files[0]) importFile(ev.target.files[0], false);
  });

  document.getElementById("file-import-conc").addEventListener("change", function(ev){
    if(ev.target.files && ev.target.files[0]) runConciliacao(ev.target.files[0]);
  });
  document.getElementById("conc-filter").addEventListener("input", renderConciliacao);
  document.getElementById("conc-tolerancia").addEventListener("input", renderConciliacao);
  document.getElementById("conc-acct").addEventListener("change", function(){
    if (ultimaConc) { ultimaConc.acctId = this.value; renderConciliacao(); }
  });
  document.getElementById("export-csv").addEventListener("click", exportarCSV);
  document.getElementById("export-clip").addEventListener("click", copiarParaExcel);

  // Export and Clear bindings
  function clearCurrentTab() {
    if(!currentTab) return;
    if(confirm("Excluir tudo salvo nesta aba neste navegador?")){
      saveEntries(currentTab, []);
      if (itemIndex[currentTab] && itemIndex[currentTab].type === "ledger") {
        renderLedger();
      } else {
        renderCadastro();
      }
      toast("Limpado com sucesso.");
    }
  }
  document.getElementById("clear-acct").addEventListener("click", clearCurrentTab);
  document.getElementById("clear-acct-top").addEventListener("click", clearCurrentTab);
  document.getElementById("clear-cadastro").addEventListener("click", clearCurrentTab);

  document.getElementById("delete-acct").addEventListener("click", function() {
    if(!currentTab || !itemIndex[currentTab]) return;
    var section = itemIndex[currentTab].section;
    
    if(confirm("ATENÇÃO: Você tem certeza que deseja EXCLUIR esta conta inteira e todos os seus lançamentos? Essa ação não pode ser desfeita!")) {
      saveEntries(currentTab, []); // clear entries
      
      if (section === "Bancos") {
        var savedBanks = JSON.parse(localStorage.getItem("system_banks")) || [];
        savedBanks = savedBanks.filter(function(b) { return b.id !== currentTab; });
        localStorage.setItem("system_banks", JSON.stringify(savedBanks));
        MENU_SECTIONS[1].items = savedBanks;
      } else if (section === "Unidades") {
        var savedUnits = JSON.parse(localStorage.getItem("system_units")) || [];
        savedUnits = savedUnits.filter(function(b) { return b.id !== currentTab; });
        localStorage.setItem("system_units", JSON.stringify(savedUnits));
        MENU_SECTIONS[2].items = savedUnits;
      }
      
      delete itemIndex[currentTab];
      
      buildSidebar();
      if (MENU_SECTIONS[1].items.length > 0) selectTab(MENU_SECTIONS[1].items[0].id);
      else selectTab("master");
      
      populateConcSelect();
      toast("Conta/Unidade excluída com sucesso.");
    }
  });

  document.getElementById("btn-add-account").addEventListener("click", function() {
    document.getElementById("modal-bank-ag").value = "";
    document.getElementById("modal-bank-cc").value = "";
    document.getElementById("modal-add-account").style.display = "flex";
    document.getElementById("modal-bank-select").focus();
  });

  document.getElementById("modal-bank-cancel").addEventListener("click", function() {
    document.getElementById("modal-add-account").style.display = "none";
  });

  document.getElementById("modal-bank-save").addEventListener("click", function() {
    var bankSel = document.getElementById("modal-bank-select").value;
    var ag = document.getElementById("modal-bank-ag").value.trim();
    var cc = document.getElementById("modal-bank-cc").value.trim();
    
    if (!ag || !cc) {
      alert("Por favor, preencha a agência e a conta.");
      return;
    }
    
    // Label follows format: "Ag 1234 Conta 5678-9"
    var acctName = "Ag " + ag + " Conta " + cc;
    
    var id = "banco-" + Date.now();
    var newBank = { 
      id: id, 
      label: acctName, 
      type: "ledger", 
      bank: bankSel, 
      sheetName: bankSel + " " + acctName,
      agencia: ag,
      conta: cc,
      hasDataMov: true
    };
    var savedBanks = JSON.parse(localStorage.getItem("system_banks")) || [];
    savedBanks.push(newBank);
    localStorage.setItem("system_banks", JSON.stringify(savedBanks));
    
    // Update MENU_SECTIONS in memory
    MENU_SECTIONS[1].items = savedBanks;
    
    // Update itemIndex so selectTab works properly for the new tab
    newBank.section = MENU_SECTIONS[1].title;
    itemIndex[id] = newBank;
    
    buildSidebar();
    selectTab(id);
    populateConcSelect();
    
    document.getElementById("modal-add-account").style.display = "none";
  });

  document.getElementById("btn-add-unit").addEventListener("click", function() {
    document.getElementById("modal-unit-name").value = "";
    document.getElementById("modal-add-unit").style.display = "flex";
    document.getElementById("modal-unit-name").focus();
  });

  document.getElementById("modal-unit-cancel").addEventListener("click", function() {
    document.getElementById("modal-add-unit").style.display = "none";
  });

  document.getElementById("modal-unit-save").addEventListener("click", function() {
    var unitName = document.getElementById("modal-unit-name").value.trim();
    if (!unitName) {
      alert("Por favor, digite o nome da unidade.");
      return;
    }
    
    var id = "unid-" + Date.now();
    var newUnit = { 
      id: id, 
      label: unitName, 
      type: "ledger", 
      bank: "Unidade", 
      sheetName: unitName,
      hasDataMov: false
    };
    
    var savedUnits = JSON.parse(localStorage.getItem("system_units")) || [];
    savedUnits.push(newUnit);
    localStorage.setItem("system_units", JSON.stringify(savedUnits));
    
    MENU_SECTIONS[2].items = savedUnits;
    newUnit.section = MENU_SECTIONS[2].title;
    itemIndex[id] = newUnit;
    
    buildSidebar();
    selectTab(id);
    populateConcSelect();
    
    document.getElementById("modal-add-unit").style.display = "none";
  });

  // Init
  function fillSelect(sel, options){
    sel.innerHTML = '<option value="" disabled selected>selecionar…</option>' +
      options.map(function(o){ return '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>'; }).join("");
  }

  function refreshFormOptions() {
    // 1. Categorias (Plano de Contas)
    var planos = loadEntries("cad-plano").map(function(e){ return e.nome; }).filter(Boolean);
    if(planos.length === 0) planos = DEFAULT_CATEGORIAS;
    fillSelect(document.getElementById("f-categoria"), planos);

    // 2. Unidades (Central de Custos / Tabela de Unidades)
    var unidades = loadEntries("cad-unidades").map(function(e){ return e.nome; }).filter(Boolean);
    if(unidades.length === 0) unidades = loadEntries("cad-custos").map(function(e){ return e.nome; }).filter(Boolean);
    if(unidades.length === 0) unidades = DEFAULT_UNIDADES;
    fillSelect(document.getElementById("f-unidade"), unidades);

    // 3. Fornecedores/Clientes (Datalist)
    var f = loadEntries("cad-fornecedores").map(function(e){ return e.nome; });
    var c = loadEntries("cad-clientes").map(function(e){ return e.nome; });
    var nomes = f.concat(c).filter(Boolean);
    var uniqueNomes = nomes.filter(function(v, i, a){ return a.indexOf(v) === i; }).sort();
    
    var dl = document.getElementById("dl-nomes");
    dl.innerHTML = uniqueNomes.map(function(n){ return '<option value="' + escapeHtml(n) + '">'; }).join("");
  }

  // Hook into renderCadastro to refresh options when cadastros change
  var origRenderCadastro = renderCadastro;
  renderCadastro = function() {
    origRenderCadastro();
    refreshFormOptions();
  };

  refreshFormOptions();
  buildSidebar();
  populateConcSelect();
  if (MENU_SECTIONS[1].items && MENU_SECTIONS[1].items.length > 0) {
    selectTab(MENU_SECTIONS[1].items[0].id);
  } else {
    selectTab("master");
  }

})();