/* Cálculo da apuração (débitos, créditos, saldo) e ajustes manuais */
"use strict";

function compute(){
  const aj = getAjustes();
  const byCfop=new Map(), notas=[], daily=new Map();
  let deb=0, cred=0, nS=0, nE=0, nX=0, fora=0;
  for(const n of state.notas.values()){
    const cls=classify(n);
    if(!cls){ fora++; continue; }
    if(state.de && n.data<state.de) continue;
    if(state.ate && n.data>state.ate) continue;
    const cancelada = state.cancel.has(n.chave) || n.cStat==="101";
    let apur=0; const cfops=new Set();
    for(const it of n.itens){
      const cf=itemCfop(it,cls); cfops.add(cf);
      if(cancelada) continue;
      const key=cls.dir+":"+cf;
      let g=byCfop.get(key);
      if(!g){ g={dir:cls.dir,cfop:cf,origens:new Set(),notas:new Set(),vc:0,bc:0,icms:0,credSN:0}; byCfop.set(key,g); }
      if(cls.terceiros && cls.dir==="E") g.origens.add(it.cfop);
      g.notas.add(n.chave); g.vc+=it.vc; g.bc+=it.bc;
      const v=itemIcms(it,cls); g.icms+=v; if(cls.dir==="E" && !(it.icms>0) && it.credSN>0) g.credSN+=it.credSN;
      if(ruleOf(cls.dir,cf)) apur+=v;
    }
    if(cancelada){ nX++; }
    else {
      if(cls.dir==="S"){ deb+=apur; nS++; } else { cred+=apur; nE++; }
      const d=daily.get(n.data)||{deb:0,cred:0}; if(cls.dir==="S") d.deb+=apur; else d.cred+=apur; daily.set(n.data,d);
    }
    notas.push({n,cls,cancelada,apur:r2(apur),cfops:[...cfops]});
  }
  deb=r2(deb); cred=r2(cred);
  const debTot=r2(deb+aj.outDeb), credTot=r2(cred+aj.outCred+aj.saldoAnt);
  return {byCfop:[...byCfop.values()], notas, daily, deb, cred, debTot, credTot, saldo:r2(debTot-credTot), aj, nS, nE, nX, fora};
}

function ajKey(){ return "icms.aj."+state.empresa+"."+(state.de||"").slice(0,7); }
function getAjustes(){ return {saldoAnt:parseMoney($("#ajSaldoAnt").value), outCred:parseMoney($("#ajOutCred").value), outDeb:parseMoney($("#ajOutDeb").value)}; }
function loadAjustes(){
  const a=store.get(ajKey(),null)||{};
  $("#ajSaldoAnt").value=a.saldoAnt?fmtN.format(a.saldoAnt):"";
  $("#ajOutCred").value=a.outCred?fmtN.format(a.outCred):"";
  $("#ajOutDeb").value=a.outDeb?fmtN.format(a.outDeb):"";
}
function saveAjustes(){ if(state.empresa) store.set(ajKey(),getAjustes()); }
