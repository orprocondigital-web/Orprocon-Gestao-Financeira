/* Geração dos dados de exemplo (fictícios) */
"use strict";

function gerarExemplo(){
  let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return (seed-1)/2147483646; };
  const pick=a=>a[Math.floor(rnd()*a.length)];
  const EMP={doc:"11222333000181",nome:"Comercial Exemplo Ltda",uf:"SC",crt:"3"};
  const CLI=[{doc:"44555666000177",nome:"Mercado Bom Preço Ltda",uf:"SC"},{doc:"48111222000190",nome:"Distribuidora Serra Azul Ltda",uf:"SC"},{doc:"77888999000155",nome:"Atacado Paranaense S.A.",uf:"PR"}];
  const FOR={sc:{doc:"22333444000110",nome:"Indústria Catarinense de Alimentos S.A.",uf:"SC",crt:"3"},sp:{doc:"33444555000120",nome:"Paulista Embalagens Ltda",uf:"SP",crt:"3"},sn:{doc:"55666777000130",nome:"Fábrica Pequena ME",uf:"SC",crt:"1"},st:{doc:"66777888000140",nome:"Bebidas do Sul S.A.",uf:"SC",crt:"3"},uc:{doc:"39888777000160",nome:"Papelaria Central Ltda",uf:"SC",crt:"3"}};
  let num=1000, numEnt=500; const out=[];
  const chave=(emit,mod,n)=>("42"+"2609"+emit.doc+mod+"001"+String(n).padStart(9,"0")+"1"+String(Math.floor(rnd()*1e8)).padStart(8,"0")+"0");
  function nfe({emit,dest,tpNF,mod="55",n,dia,natOp,itens}){
    const ch=chave(emit,mod,n);
    const dh=`2026-09-${String(dia).padStart(2,"0")}T${String(8+Math.floor(rnd()*9)).padStart(2,"0")}:15:00-03:00`;
    let tBC=0,tICMS=0,tProd=0;
    const dets=itens.map((it,i)=>{
      tProd+=it.v; let icms="";
      if(it.csosn){ const cr=r2(it.v*it.pCredSN/100); icms=`<ICMSSN101><orig>0</orig><CSOSN>101</CSOSN><pCredSN>${it.pCredSN.toFixed(2)}</pCredSN><vCredICMSSN>${cr.toFixed(2)}</vCredICMSSN></ICMSSN101>`; }
      else if(it.st){ icms=`<ICMS60><orig>0</orig><CST>60</CST></ICMS60>`; }
      else { const v=r2(it.v*it.aliq/100); tBC+=it.v; tICMS+=v; icms=`<ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${it.v.toFixed(2)}</vBC><pICMS>${it.aliq.toFixed(2)}</pICMS><vICMS>${v.toFixed(2)}</vICMS></ICMS00>`; }
      return `<det nItem="${i+1}"><prod><cProd>${i+1}</cProd><xProd>${it.x}</xProd><CFOP>${it.cfop}</CFOP><qCom>1</qCom><vProd>${it.v.toFixed(2)}</vProd></prod><imposto><ICMS>${icms}</ICMS></imposto></det>`;
    }).join("");
    const destXml = dest ? `<dest><CNPJ>${dest.doc}</CNPJ><xNome>${dest.nome}</xNome></dest>` : "";
    out.push(`<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${ch}" versao="4.00"><ide><cUF>42</cUF><natOp>${natOp}</natOp><mod>${mod}</mod><serie>1</serie><nNF>${n}</nNF><dhEmi>${dh}</dhEmi><tpNF>${tpNF}</tpNF></ide><emit><CNPJ>${emit.doc}</CNPJ><xNome>${emit.nome}</xNome><enderEmit><UF>${emit.uf}</UF></enderEmit><CRT>${emit.crt||"3"}</CRT></emit>${destXml}${dets}<total><ICMSTot><vBC>${tBC.toFixed(2)}</vBC><vICMS>${tICMS.toFixed(2)}</vICMS><vProd>${tProd.toFixed(2)}</vProd><vNF>${tProd.toFixed(2)}</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><chNFe>${ch}</chNFe><cStat>100</cStat></infProt></protNFe></nfeProc>`);
    return ch;
  }
  const val=(a,b)=>r2(a+rnd()*(b-a));
  let cancelar=null;
  for(let dia=1; dia<=28; dia++){
    const dow=new Date(2026,8,dia).getDay(); if(dow===0) continue;
    // vendas internas e interestaduais
    const nv = 1+Math.floor(rnd()*3);
    for(let k=0;k<nv;k++){
      const c=pick(CLI), inter=c.uf!=="SC";
      const ch=nfe({emit:EMP,dest:c,tpNF:"1",n:num++,dia,natOp:"Venda de mercadoria",itens:[
        {x:"Arroz tipo 1 5kg",cfop:inter?"6102":"5102",v:val(800,4200),aliq:inter?12:17},
        {x:"Refrigerante 2L",cfop:inter?"6403":"5405",v:val(200,900),st:true}
      ]});
      if(dia===9 && k===0) cancelar=ch;
    }
    // NFC-e no varejo
    if(dow!==6){ nfe({emit:EMP,dest:null,tpNF:"1",mod:"65",n:num++,dia,natOp:"Venda ao consumidor",itens:[{x:"Vendas do dia",cfop:"5102",v:val(600,1800),aliq:17}]}); }
    // compras
    if(dia%3===1) nfe({emit:FOR.sc,dest:EMP,tpNF:"1",n:numEnt++,dia,natOp:"Venda",itens:[{x:"Arroz tipo 1 5kg (fardo)",cfop:"5102",v:val(3000,9000),aliq:17}]});
    if(dia%5===2) nfe({emit:FOR.sp,dest:EMP,tpNF:"1",n:numEnt++,dia,natOp:"Venda",itens:[{x:"Caixas de papelão",cfop:"6102",v:val(1500,4000),aliq:12}]});
    if(dia%7===3) nfe({emit:FOR.sn,dest:EMP,tpNF:"1",n:numEnt++,dia,natOp:"Venda",itens:[{x:"Biscoito artesanal",cfop:"5101",v:val(700,2000),csosn:"101",pCredSN:2.56}]});
    if(dia%6===4) nfe({emit:FOR.st,dest:EMP,tpNF:"1",n:numEnt++,dia,natOp:"Venda com ST",itens:[{x:"Refrigerante 2L (fardo)",cfop:"5405",v:val(1200,3000),st:true}]});
  }
  nfe({emit:FOR.uc,dest:EMP,tpNF:"1",n:numEnt++,dia:10,natOp:"Venda",itens:[{x:"Material de escritório",cfop:"5102",v:640,aliq:17}]});
  nfe({emit:EMP,dest:CLI[0],tpNF:"1",n:num++,dia:15,natOp:"Devolução de compra",itens:[{x:"Arroz tipo 1 5kg (avariado)",cfop:"5202",v:480,aliq:17}]});
  nfe({emit:EMP,dest:CLI[1],tpNF:"0",n:num++,dia:18,natOp:"Devolução de venda",itens:[{x:"Arroz tipo 1 5kg",cfop:"1202",v:920,aliq:17}]});
  nfe({emit:EMP,dest:CLI[0],tpNF:"1",n:num++,dia:21,natOp:"Lançamento de operação em cupom",itens:[{x:"Vendas do cupom fiscal",cfop:"5929",v:1150,aliq:17}]});
  if(cancelar) out.push(`<?xml version="1.0" encoding="UTF-8"?><procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento><infEvento><chNFe>${cancelar}</chNFe><tpEvento>110111</tpEvento><detEvento><descEvento>Cancelamento</descEvento></detEvento></infEvento></evento></procEventoNFe>`);
  return out;
}
function carregarExemplo(){
  state.notas.clear(); state.cancel.clear(); state.ignored={resumos:0,invalidos:0,outros:0}; state.empresa="";
  const files=gerarExemplo().map((t,i)=>({name:`exemplo-${i}.xml`, text:async()=>t}));
  readFiles(files);
}
