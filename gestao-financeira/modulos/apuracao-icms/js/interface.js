/* Carga das notas e renderização da tela (saldo, gráfico, tabelas) */
"use strict";

function afterLoad(){
  const emps=detectEmpresas();
  const sel=$("#selEmpresa");
  if(!emps.length){ sel.innerHTML='<option value="">Carregue as notas primeiro</option>'; render(); return; }
  if(!state.empresa || !emps.find(e=>e.doc===state.empresa)) state.empresa=emps[0].doc;
  sel.innerHTML=emps.slice(0,30).map(e=>`<option value="${e.doc}" ${e.doc===state.empresa?"selected":""}>${esc((e.nome||"Sem nome").slice(0,38))} (${fmtDoc(e.doc)})</option>`).join("");
  setDefaultPeriod();
  loadAjustes();
  render();
}
function setDefaultPeriod(){
  const datas=[...state.notas.values()].filter(n=>classify(n)).map(n=>n.data).filter(Boolean).sort();
  if(!datas.length) return;
  const last=datas[datas.length-1], mes=last.slice(0,7);
  state.de=mes+"-01";
  state.ate=datas.filter(d=>d.startsWith(mes)).pop();
  $("#dtDe").value=state.de; $("#dtAte").value=state.ate;
}

function render(){
  const has=state.notas.size>0;
  $("#btnLimparTopo").classList.toggle("hidden",!has);
  $("#emptyState").classList.toggle("hidden",has);
  $("#results").classList.toggle("hidden",!has);
  const info=$("#loadinfo");
  if(!has){ info.textContent=""; return; }
  const ig=state.ignored;
  const extras=[];
  if(state.cancel.size) extras.push(`${state.cancel.size} cancelamento(s)`);
  if(ig.resumos) extras.push(`${ig.resumos} resumo(s) sem itens ignorado(s)`);
  if(ig.invalidos) extras.push(`${ig.invalidos} arquivo(s) inválido(s)`);
  info.innerHTML=`<strong>${state.notas.size}</strong> nota(s) carregada(s)${extras.length?" · "+extras.join(" · "):""}.`;

  const R=compute();
  renderHero(R); renderChart(R); renderCfop(R); renderNotas(R);
}

function renderHero(R){
  const recolher=R.saldo>=0;
  $("#saldoLabel").textContent = recolher ? "ICMS a recolher até agora" : "Saldo credor até agora";
  const sv=$("#saldoValor"); sv.textContent=money(Math.abs(R.saldo)); sv.className="saldo-valor "+(recolher?"recolher":"credor");
  $("#periodoTag").textContent = state.de&&state.ate ? `De ${fmtDate(state.de)} a ${fmtDate(state.ate)}` : "";
  const max=Math.max(R.debTot,R.credTot,0.01);
  const pct=v=>(v/max*100).toFixed(3)+"%";
  $("#barDeb").innerHTML=`<div class="seg deb" style="width:${pct(R.deb)}"></div><div class="seg deb aj" style="width:${pct(R.aj.outDeb)}"></div>`;
  $("#barCred").innerHTML=`<div class="seg cred" style="width:${pct(R.cred)}"></div><div class="seg cred aj" style="width:${pct(R.aj.outCred+R.aj.saldoAnt)}"></div>`;
  $("#valDeb").textContent=money(R.debTot); $("#valCred").textContent=money(R.credTot);
  const cards=[
    ["Débitos das NF-e",money(R.deb)],["Créditos das NF-e",money(R.cred)],
    ["Ajustes (créditos)",money(R.aj.outCred+R.aj.saldoAnt)],["Ajustes (débitos)",money(R.aj.outDeb)],
    ["Notas de saída",R.nS],["Notas de entrada",R.nE],["Canceladas",R.nX]
  ];
  if(R.fora) cards.push(["De outras empresas",R.fora]);
  $("#cards").innerHTML=cards.map(([a,b])=>`<div><span>${a}</span><b>${b}</b></div>`).join("");
}

function renderChart(R){
  const el=$("#chart");
  if(!state.de||!state.ate||state.ate<state.de){ el.innerHTML='<p class="hint">Defina o período.</p>'; return; }
  const days=[]; let d=new Date(state.de+"T12:00:00"); const end=new Date(state.ate+"T12:00:00");
  while(d<=end && days.length<400){ days.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); }
  let cd=0, cc=0; const pts=days.map(day=>{ const v=R.daily.get(day); if(v){cd+=v.deb;cc+=v.cred;} return {day,deb:cd,cred:cc}; });
  const W=760,H=240,pl=78,pr=16,pt=14,pb=28;
  const maxV=Math.max(1,...pts.map(p=>Math.max(p.deb,p.cred)));
  const nice=Math.pow(10,Math.floor(Math.log10(maxV))); const top=Math.ceil(maxV/nice)*nice;
  const x=i=>pl+(pts.length<=1?0:i*(W-pl-pr)/(pts.length-1));
  const y=v=>pt+(H-pt-pb)*(1-v/top);
  const path=k=>pts.map((p,i)=>(i?"L":"M")+x(i).toFixed(1)+" "+y(p[k]).toFixed(1)).join(" ");
  let grid=""; for(let i=0;i<=4;i++){ const v=top*i/4; grid+=`<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}"/>`; }
  let axis=""; for(let i=0;i<=4;i++){ const v=top*i/4; axis+=`<text x="${pl-8}" y="${y(v)+4}" text-anchor="end">${fmtN.format(v).replace(/,00$/,"")}</text>`; }
  const step=Math.max(1,Math.ceil(pts.length/8));
  pts.forEach((p,i)=>{ if(i%step===0||i===pts.length-1) axis+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle">${p.day.slice(8,10)}/${p.day.slice(5,7)}</text>`; });
  const last=pts[pts.length-1];
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Débitos e créditos acumulados por dia">
    <g class="grid">${grid}</g><g class="axis">${axis}</g>
    <path d="${path("deb")}" fill="none" stroke="var(--debito)" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${path("cred")}" fill="none" stroke="var(--credito)" stroke-width="2.5" stroke-linejoin="round"/>
    ${last?`<circle cx="${x(pts.length-1)}" cy="${y(last.deb)}" r="4" fill="var(--debito)"/><circle cx="${x(pts.length-1)}" cy="${y(last.cred)}" r="4" fill="var(--credito)"/>`:""}
  </svg>
  <div class="legend"><span><i style="background:var(--debito)"></i>Débitos acumulados das NF-e</span><span><i style="background:var(--credito)"></i>Créditos acumulados das NF-e</span></div>`;
}

function renderCfop(R){
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===state.tab)));
  const dir=state.tab;
  const rows=R.byCfop.filter(g=>g.dir===dir).sort((a,b)=>a.cfop.localeCompare(b.cfop));
  const lbl=dir==="S"?"Débito":"Crédito";
  let tv=0,tb=0,ti=0,ta=0,tn=new Set();
  const body=rows.map(g=>{
    const on=ruleOf(dir,g.cfop);
    tv+=g.vc; tb+=g.bc; ti+=g.icms; if(on) ta+=g.icms; g.notas.forEach(c=>tn.add(c));
    const orig=g.origens.size?`<small>do fornecedor: ${[...g.origens].sort().join(", ")}</small>`:"";
    const sn=g.credSN>0?`<small>inclui ${money(g.credSN)} de crédito do Simples</small>`:"";
    const changed=(dir+":"+g.cfop) in state.rules && state.rules[dir+":"+g.cfop]!==defaultRule(dir,g.cfop);
    return `<tr class="${on?"":"off"}">
      <td class="cf"><b>${g.cfop}</b>${orig}${sn}</td>
      <td class="n">${g.notas.size}</td>
      <td class="n">${money(g.vc)}</td>
      <td class="n">${money(g.bc)}</td>
      <td class="n">${money(g.icms)}</td>
      <td><label class="switch"><input type="checkbox" data-rule="${dir}:${g.cfop}" ${on?"checked":""}> ${on?"Entra":"Não entra"}${changed?" (alterado)":""}</label></td>
    </tr>`;
  }).join("");
  $("#tblCfop").innerHTML=`<thead><tr><th>CFOP</th><th class="n">Notas</th><th class="n">Valor contábil</th><th class="n">Base ICMS</th><th class="n">ICMS</th><th>Entra no ${lbl.toLowerCase()}?</th></tr></thead>
    <tbody>${body||`<tr><td colspan="6">Nenhuma nota de ${dir==="S"?"saída":"entrada"} no período.</td></tr>`}</tbody>
    ${rows.length?`<tfoot><tr><td>Total</td><td class="n">${tn.size}</td><td class="n">${money(tv)}</td><td class="n">${money(tb)}</td><td class="n">${money(ti)}</td><td>${lbl}: ${money(ta)}</td></tr></tfoot>`:""}`;
  $("#tblCfop").querySelectorAll("input[data-rule]").forEach(cb=>cb.onchange=()=>{ state.rules[cb.dataset.rule]=cb.checked; store.set("icms.rules",state.rules); render(); });
  $("#cfopHint").textContent = dir==="E"
    ? "Nas notas de fornecedores o CFOP mostrado é o de entrada equivalente. Desmarque o que for uso e consumo, ativo ou não gerar crédito. As regras valem para todas as empresas neste navegador."
    : "5929/6929 vêm desmarcados porque repetem vendas já registradas em cupom ou NFC-e. As regras valem para todas as empresas neste navegador.";
}

function renderNotas(R){
  const tipo=$("#fltTipo").value, busca=$("#fltBusca").value.trim().toLowerCase();
  let list=R.notas.filter(x=>{
    if(tipo==="X") return x.cancelada;
    if(tipo && x.cls.dir!==tipo) return false;
    if(busca){
      const part=x.cls.terceiros?x.n.emit:x.n.dest;
      const other=x.cls.dir==="S"?x.n.dest:(x.cls.terceiros?x.n.emit:x.n.dest);
      const hay=[x.n.nNF,(other.nome||""),other.doc,x.cfops.join(" "),x.n.chave,part.nome].join(" ").toLowerCase();
      if(!hay.includes(busca)) return false;
    }
    return true;
  }).sort((a,b)=>a.n.data.localeCompare(b.n.data)||(+a.n.nNF)-(+b.n.nNF));
  const total=list.length; list=list.slice(0,state.shown);
  const rows=list.map(x=>{
    const n=x.n, part = x.cls.terceiros ? n.emit : n.dest;
    const chip = x.cancelada ? '<span class="chip x">Cancelada</span>' : x.cls.dir==="S" ? '<span class="chip s">Saída</span>' : '<span class="chip e">Entrada</span>';
    return `<tr><td>${fmtDate(n.data)}</td><td>${esc(n.nNF)}${n.mod==="65"?" <small>NFC-e</small>":""}</td><td>${chip}</td>
      <td title="${esc(fmtDoc(part.doc||""))}">${esc((part.nome||(part.doc?fmtDoc(part.doc):"Consumidor final")).slice(0,40))}</td>
      <td>${x.cfops.join(", ")}</td><td class="n">${money(n.vNF)}</td><td class="n">${x.cancelada?"—":money(x.apur)}</td></tr>`;
  }).join("");
  $("#tblNotas").innerHTML=`<thead><tr><th>Emissão</th><th>Nº</th><th>Tipo</th><th>Participante</th><th>CFOP</th><th class="n">Valor da nota</th><th class="n">ICMS apurado</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="7">Nenhuma nota com esse filtro.</td></tr>'}</tbody>`;
  const more=$("#btnMais"); more.classList.toggle("hidden",total<=state.shown); more.textContent=`Mostrar mais (${total-state.shown} restantes)`;
}
