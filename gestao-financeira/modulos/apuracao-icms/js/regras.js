/* Regras de CFOP e classificação das notas (entrada/saída) */
"use strict";

// CFOPs de entrada que, mesmo com ICMS destacado, normalmente não dão crédito direto
const EXCL_E = new Set(["1551","2551","3551","1556","2556","3556","1403","2403","1405","2405","1406","2406","1407","2407","1653","2653"]);
// CFOPs de saída que não geram débito próprio (ex.: 5929 duplicaria o que já saiu por cupom/NFC-e)
const EXCL_S = new Set(["5929","6929"]);
// Equivalência de CFOP do fornecedor -> CFOP de entrada
const EQUIV = {"5401":"1403","5402":"1403","5403":"1403","5405":"1403","6401":"2403","6402":"2403","6403":"2403","6404":"2403"};
function cfopEntradaEquivalente(c){
  if(EQUIV[c]) return EQUIV[c];
  const d={"5":"1","6":"2","7":"3"}[c[0]];
  return d ? d+c.slice(1) : c;
}
function defaultRule(dir,cfop){ return dir==="S" ? !EXCL_S.has(cfop) : !EXCL_E.has(cfop); }
function ruleOf(dir,cfop){ const k=dir+":"+cfop; return k in state.rules ? state.rules[k] : defaultRule(dir,cfop); }

function detectEmpresas(){
  const cnt=new Map();
  const add=(doc,nome)=>{ if(!doc||doc.length!==14) return; const c=cnt.get(doc)||{doc,nome,n:0}; c.n++; if(!c.nome&&nome) c.nome=nome; cnt.set(doc,c); };
  for(const n of state.notas.values()){ add(n.emit.doc,n.emit.nome); add(n.dest.doc,n.dest.nome); }
  return [...cnt.values()].sort((a,b)=>b.n-a.n);
}
function classify(n){
  const e=state.empresa;
  if(!e) return null;
  if(n.emit.doc===e) return {dir: n.tpNF==="0"?"E":"S", terceiros:false};
  if(n.dest.doc===e) return {dir: n.tpNF==="1"?"E":"S", terceiros:true};
  return null;
}
function itemCfop(it,cls){ return (cls.dir==="E" && cls.terceiros) ? cfopEntradaEquivalente(it.cfop) : it.cfop; }
function itemIcms(it,cls){ return cls.dir==="E" ? (it.icms>0 ? it.icms : it.credSN) : it.icms; }
