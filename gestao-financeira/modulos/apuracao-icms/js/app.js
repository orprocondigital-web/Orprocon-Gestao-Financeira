/* Ligação dos botões e campos da tela; inicialização */
"use strict";

$("#btnPick").onclick=()=>$("#fileIn").click();
$("#fileIn").onchange=e=>{ readFiles([...e.target.files]); e.target.value=""; };
$("#btnDemo").onclick=carregarExemplo; $("#btnDemo2").onclick=carregarExemplo;
const drop=$("#drop");
["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("over");}));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("over");}));
drop.addEventListener("drop",e=>readFiles([...e.dataTransfer.files]));
document.addEventListener("dragover",e=>e.preventDefault());
document.addEventListener("drop",e=>{ if(!drop.contains(e.target)){ e.preventDefault(); if(e.dataTransfer.files.length) readFiles([...e.dataTransfer.files]); } });
$("#selEmpresa").onchange=e=>{ state.empresa=e.target.value; setDefaultPeriod(); loadAjustes(); state.shown=100; render(); };
$("#dtDe").onchange=e=>{ state.de=e.target.value; loadAjustes(); render(); };
$("#dtAte").onchange=e=>{ state.ate=e.target.value; render(); };
["#ajSaldoAnt","#ajOutCred","#ajOutDeb"].forEach(s=>{
  $(s).addEventListener("input",()=>{ saveAjustes(); if(state.notas.size) render(); });
  $(s).addEventListener("blur",()=>{ const v=parseMoney($(s).value); $(s).value=v?fmtN.format(v):""; });
});
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{ state.tab=b.dataset.tab; render(); });
$("#btnResetRules").onclick=()=>{ state.rules={}; store.set("icms.rules",{}); render(); toast("Regras padrão restauradas"); };
$("#fltTipo").onchange=()=>{ state.shown=100; render(); };
$("#fltBusca").addEventListener("input",()=>{ state.shown=100; render(); });
$("#btnMais").onclick=()=>{ state.shown+=100; render(); };
$("#btnXlsx").onclick=exportXlsx;
function rotuloTema(){
  const t=temaAtual()==="dark"?"Mudar para tema claro":"Mudar para tema escuro";
  $("#btnTema").title=t; $("#btnTema").setAttribute("aria-label",t);
}
rotuloTema();
$("#btnTema").onclick=()=>{ definirTema(temaAtual()==="dark"?"light":"dark"); rotuloTema(); };
$("#btnLimparTopo").onclick=()=>{
  if(!confirm("Limpar todas as notas carregadas?\n\nAs regras de CFOP e os ajustes manuais continuam salvos.")) return;
  state.notas.clear(); state.cancel.clear(); state.ignored={resumos:0,invalidos:0,outros:0}; state.empresa=""; state.de=""; state.ate="";
  $("#selEmpresa").innerHTML='<option value="">Carregue as notas primeiro</option>';
  $("#dtDe").value=""; $("#dtAte").value=""; $("#fltBusca").value=""; $("#fltTipo").value=""; state.shown=100;
  ["#ajSaldoAnt","#ajOutCred","#ajOutDeb"].forEach(x=>$(x).value="");
  render(); window.scrollTo({top:0,behavior:"smooth"}); toast("Notas removidas da tela");
};

render();
initDownloads();
