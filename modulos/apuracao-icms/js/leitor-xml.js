/* Leitura dos XMLs de NF-e/NFC-e, eventos de cancelamento e arquivos .zip */
"use strict";

const NS="*";
const q = (el,name) => el ? el.getElementsByTagNameNS(NS,name)[0] : undefined;
const qa = (el,name) => el ? Array.from(el.getElementsByTagNameNS(NS,name)) : [];
const tx = (el,name) => { const n=q(el,name); return n ? n.textContent.trim() : ""; };
const num = (el,name) => { const v=parseFloat(tx(el,name)); return isNaN(v)?0:v; };
const childTx = (el,name) => { if(!el) return ""; for(const c of el.children){ if(c.localName===name) return c.textContent.trim(); } return ""; };

function parseXml(text){
  const doc = new DOMParser().parseFromString(text,"application/xml");
  if(doc.getElementsByTagName("parsererror").length) return {kind:"invalid"};
  // eventos de cancelamento
  const evs = qa(doc,"infEvento");
  if(evs.length && !q(doc,"infNFe")){
    const out=[];
    for(const ev of evs){ if(tx(ev,"tpEvento")==="110111"){ const ch=tx(ev,"chNFe"); if(ch) out.push(ch); } }
    return out.length ? {kind:"cancel",chaves:out} : {kind:"other"};
  }
  if(q(doc,"resNFe") && !q(doc,"infNFe")) return {kind:"resumo"};
  const inf = q(doc,"infNFe");
  if(!inf) return {kind:"other"};
  const ide=q(inf,"ide"), emit=q(inf,"emit"), dest=q(inf,"dest"), tot=q(inf,"ICMSTot"), prot=q(doc,"infProt");
  const chave = (inf.getAttribute("Id")||"").replace(/^NFe/,"") || tx(prot,"chNFe");
  const dh = tx(ide,"dhEmi") || tx(ide,"dEmi");
  const itens = qa(inf,"det").map(det=>{
    const prod=q(det,"prod"), imp=q(det,"imposto");
    const icmsGroup=q(imp,"ICMS");
    const icms = icmsGroup ? icmsGroup.firstElementChild : null;
    const vProd=num(prod,"vProd"), vFrete=num(prod,"vFrete"), vSeg=num(prod,"vSeg"), vOutro=num(prod,"vOutro"), vDesc=num(prod,"vDesc");
    const vIPI = num(q(imp,"IPITrib"),"vIPI");
    const vST = icms ? num(icms,"vICMSST") : 0;
    return {
      cfop: tx(prod,"CFOP"),
      xProd: tx(prod,"xProd"),
      vc: r2(vProd+vFrete+vSeg+vOutro-vDesc+vIPI+vST),
      cst: icms ? (childTx(icms,"CST") ? childTx(icms,"orig")+childTx(icms,"CST") : childTx(icms,"CSOSN")) : "",
      bc: icms ? num(icms,"vBC") : 0,
      aliq: icms ? num(icms,"pICMS") : 0,
      icms: icms ? num(icms,"vICMS") : 0,
      credSN: icms ? num(icms,"vCredICMSSN") : 0
    };
  });
  return {kind:"nfe", nota:{
    chave, mod:tx(ide,"mod"), serie:tx(ide,"serie"), nNF:tx(ide,"nNF"),
    data: dh.slice(0,10), tpNF: tx(ide,"tpNF"), natOp: tx(ide,"natOp"),
    emit:{doc:childTx(emit,"CNPJ")||childTx(emit,"CPF"), nome:childTx(emit,"xNome"), crt:childTx(emit,"CRT")},
    dest:{doc:childTx(dest,"CNPJ")||childTx(dest,"CPF"), nome:childTx(dest,"xNome")},
    vNF: num(tot,"vNF"), cStat: tx(prot,"cStat"), itens
  }};
}

async function readFiles(files){
  let lidas=0, canc=0;
  const handleText = (text) => {
    const r=parseXml(text);
    if(r.kind==="nfe"){ if(r.nota.chave){ state.notas.set(r.nota.chave,r.nota); lidas++; } else state.ignored.invalidos++; }
    else if(r.kind==="cancel"){ r.chaves.forEach(c=>state.cancel.add(c)); canc+=r.chaves.length; }
    else if(r.kind==="resumo") state.ignored.resumos++;
    else if(r.kind==="invalid") state.ignored.invalidos++;
    else state.ignored.outros++;
  };
  for(const f of files){
    const name=(f.name||"").toLowerCase();
    try{
      if(name.endsWith(".zip")){
        if(typeof JSZip==="undefined"){ toast("Não foi possível abrir .zip agora. Extraia os XMLs e carregue-os direto."); continue; }
        const zip=await JSZip.loadAsync(f);
        const entries=Object.values(zip.files).filter(e=>!e.dir && e.name.toLowerCase().endsWith(".xml"));
        for(const e of entries) handleText(await e.async("string"));
      } else if(name.endsWith(".xml")){
        handleText(await f.text());
      } else state.ignored.outros++;
    }catch(err){ state.ignored.invalidos++; }
  }
  afterLoad();
  toast(`${lidas} nota(s) lida(s)`+(canc?`, ${canc} cancelamento(s)`:""));
}
