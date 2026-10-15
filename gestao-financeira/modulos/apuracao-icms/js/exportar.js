/* Exportação da planilha Excel formatada (ExcelJS) */
"use strict";

let downloads=null;
async function initDownloads(){
  try{ if(window.claude && typeof window.claude.use==="function") downloads=await window.claude.use("downloads"); }catch(e){ downloads=null; }
  // fora do claude.ai: download normal do navegador
}
async function exportXlsx(){
  if(typeof ExcelJS==="undefined"){ toast("Biblioteca de planilha não carregou. Recarregue a página."); return; }
  const R=compute();
  const emp=detectEmpresas().find(e=>e.doc===state.empresa)||{nome:"",doc:state.empresa};
  const C={navy:"FF17284A",blue:"FF2F5BD3",blueSoft:"FFE7EDFC",red:"FFC0352F",redSoft:"FFFBE7E5",green:"FF15845F",greenSoft:"FFDDF3EA",grey:"FF5F6B82",greySoft:"FFF3F5F9",line:"FFD9DFE8",white:"FFFFFFFF"};
  const MOEDA='"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const fill=c=>({type:"pattern",pattern:"solid",fgColor:{argb:c}});
  const thin={style:"thin",color:{argb:C.line}};
  const box={top:thin,left:thin,bottom:thin,right:thin};
  const toDate=iso=>{ if(!iso) return null; const [y,m,d]=iso.split("-").map(Number); return new Date(Date.UTC(y,m-1,d)); };
  const font=(o={})=>Object.assign({name:"Calibri",size:11,color:{argb:"FF16233F"}},o);

  const wb=new ExcelJS.Workbook();
  wb.creator="Orprocon"; wb.created=new Date();

  /* ---- Resumo ---- */
  const s1=wb.addWorksheet("Resumo",{views:[{showGridLines:false}],properties:{tabColor:{argb:C.navy}}});
  s1.columns=[{width:3},{width:38},{width:22},{width:3}];
  s1.mergeCells("B2:C2");
  const t=s1.getCell("B2"); t.value="Apuração parcial de ICMS"; t.font=font({size:18,bold:true,color:{argb:C.white}}); t.fill=fill(C.navy); t.alignment={vertical:"middle",indent:1};
  s1.getRow(2).height=34;
  s1.mergeCells("B3:C3");
  const st=s1.getCell("B3"); st.value="Prévia a partir das NF-e. A apuração oficial é a do Único."; st.font=font({size:10,italic:true,color:{argb:"FFAEBBD6"}}); st.fill=fill(C.navy); st.alignment={indent:1};
  const info=[["Empresa",emp.nome||""],["CNPJ",fmtDoc(emp.doc)],["Período",fmtDate(state.de)+" a "+fmtDate(state.ate)],["Gerado em",new Date().toLocaleString("pt-BR")]];
  let r=5;
  info.forEach(([a,b])=>{ const c1=s1.getCell(r,2), c2=s1.getCell(r,3); c1.value=a; c2.value=b; c1.font=font({color:{argb:C.grey},bold:true,size:10}); c2.font=font({bold:true}); c2.alignment={horizontal:"right"}; r++; });
  r++;
  function bloco(titulo,cor,corSoft,linhas,totalLbl,total){
    s1.mergeCells(r,2,r,3); const h=s1.getCell(r,2); h.value=titulo; h.font=font({bold:true,color:{argb:C.white}}); h.fill=fill(cor); h.alignment={indent:1}; s1.getRow(r).height=20; r++;
    linhas.forEach(([a,v])=>{ const c1=s1.getCell(r,2), c2=s1.getCell(r,3); c1.value=a; c2.value=r2(v); c2.numFmt=MOEDA; c1.alignment={indent:1}; [c1,c2].forEach(c=>{c.border={bottom:thin}; c.font=font();}); r++; });
    const c1=s1.getCell(r,2), c2=s1.getCell(r,3); c1.value=totalLbl; c2.value=r2(total); c2.numFmt=MOEDA;
    [c1,c2].forEach(c=>{ c.font=font({bold:true,color:{argb:cor}}); c.fill=fill(corSoft); }); c1.alignment={indent:1};
    r+=2;
  }
  bloco("DÉBITOS",C.red,C.redSoft,[["Débitos das NF-e de saída",R.deb],["Outros débitos e estornos de crédito",R.aj.outDeb]],"Total de débitos",R.debTot);
  bloco("CRÉDITOS",C.green,C.greenSoft,[["Créditos das NF-e de entrada",R.cred],["Outros créditos (CIAP, CT-e, presumido)",R.aj.outCred],["Saldo credor do mês anterior",R.aj.saldoAnt]],"Total de créditos",R.credTot);
  const rec=R.saldo>=0;
  const f1=s1.getCell(r,2), f2=s1.getCell(r,3);
  f1.value=rec?"ICMS A RECOLHER":"SALDO CREDOR"; f2.value=Math.abs(R.saldo); f2.numFmt=MOEDA;
  [f1,f2].forEach(c=>{ c.font=font({bold:true,size:14,color:{argb:C.white}}); c.fill=fill(rec?C.red:C.green); c.alignment={vertical:"middle"}; });
  f1.alignment={vertical:"middle",indent:1}; s1.getRow(r).height=30;
  r+=2;
  s1.mergeCells(r,2,r,3);
  const nb=s1.getCell(r,2); nb.value=`${R.nS} nota(s) de saída · ${R.nE} nota(s) de entrada · ${R.nX} cancelada(s) fora da conta`; nb.font=font({size:9,color:{argb:C.grey}});
  s1.pageSetup={orientation:"portrait",fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.5,right:.5,top:.6,bottom:.6,header:.3,footer:.3}};

  /* ---- helpers de tabela ---- */
  function cabecalho(ws,cols){
    ws.columns=cols.map(c=>({header:c.h,key:c.k,width:c.w}));
    const h=ws.getRow(1); h.height=32;
    h.eachCell(c=>{ c.font=font({bold:true,color:{argb:C.white}}); c.fill=fill(C.navy); c.alignment={vertical:"middle",horizontal:"center",wrapText:true}; c.border=box; });
    ws.views=[{state:"frozen",ySplit:1,showGridLines:false}];
    ws.autoFilter={from:{row:1,column:1},to:{row:1,column:cols.length}};
    cols.forEach((c,i)=>{ if(c.fmt) ws.getColumn(i+1).numFmt=c.fmt; if(c.al) ws.getColumn(i+1).alignment={horizontal:c.al}; });
  }
  function estiloLinha(row,zebra){ row.eachCell({includeEmpty:true},c=>{ c.border=box; if(zebra) c.fill=fill(C.greySoft); if(!c.font||!c.font.bold) c.font=Object.assign(font(),c.font&&c.font.color?{color:c.font.color}:{}); }); }

  /* ---- Por CFOP ---- */
  const s2=wb.addWorksheet("Por CFOP",{properties:{tabColor:{argb:C.blue}}});
  cabecalho(s2,[
    {h:"Tipo",k:"tipo",w:10,al:"center"},{h:"CFOP",k:"cfop",w:9,al:"center"},{h:"CFOPs do fornecedor",k:"orig",w:20},
    {h:"Notas",k:"notas",w:9,al:"center"},{h:"Valor contábil",k:"vc",w:17,fmt:MOEDA},{h:"Base de cálculo",k:"bc",w:17,fmt:MOEDA},
    {h:"ICMS",k:"icms",w:15,fmt:MOEDA},{h:"Entra na apuração",k:"entra",w:14,al:"center"},{h:"ICMS apurado",k:"apur",w:16,fmt:MOEDA}
  ]);
  const grupos=[...R.byCfop].sort((a,b)=>(a.dir===b.dir?0:a.dir==="S"?-1:1)||a.cfop.localeCompare(b.cfop));
  let zebra=false;
  ["S","E"].forEach(dir=>{
    const gs=grupos.filter(g=>g.dir===dir); if(!gs.length) return;
    const ini=s2.rowCount+1;
    gs.forEach(g=>{
      const on=ruleOf(g.dir,g.cfop);
      const row=s2.addRow({tipo:dir==="S"?"Saída":"Entrada",cfop:g.cfop,orig:[...g.origens].sort().join(", "),notas:g.notas.size,vc:r2(g.vc),bc:r2(g.bc),icms:r2(g.icms),entra:on?"Sim":"Não",apur:on?r2(g.icms):0});
      estiloLinha(row,zebra); zebra=!zebra;
      row.getCell("tipo").font=font({bold:true,color:{argb:dir==="S"?C.red:C.green}});
      row.getCell("entra").font=font({bold:true,color:{argb:on?C.green:C.grey}});
      if(!on) ["cfop","orig","notas","vc","bc","icms","apur"].forEach(k=>row.getCell(k).font=font({color:{argb:C.grey},italic:true}));
    });
    const fim=s2.rowCount;
    const tot=s2.addRow({tipo:dir==="S"?"Total saídas":"Total entradas"});
    ["vc","bc","icms","apur"].forEach(k=>{ const col=s2.getColumn(k).letter; tot.getCell(k).value={formula:`SUM(${col}${ini}:${col}${fim})`,result:gs.reduce((s,g)=>s+(k==="apur"?(ruleOf(g.dir,g.cfop)?g.icms:0):g[k]),0)}; });
    tot.eachCell({includeEmpty:true},c=>{ c.font=font({bold:true,color:{argb:dir==="S"?C.red:C.green}}); c.fill=fill(dir==="S"?C.redSoft:C.greenSoft); c.border=box; });
    s2.mergeCells(tot.number,1,tot.number,4); tot.getCell(1).alignment={horizontal:"left",indent:1};
    s2.addRow([]); zebra=false;
  });
  s2.autoFilter=undefined;
  s2.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0};

  /* ---- Notas ---- */
  const s3=wb.addWorksheet("Notas",{properties:{tabColor:{argb:C.green}}});
  cabecalho(s3,[
    {h:"Emissão",k:"data",w:12,fmt:"dd/mm/yyyy",al:"center"},{h:"Modelo",k:"mod",w:9,al:"center"},{h:"Série",k:"serie",w:7,al:"center"},{h:"Número",k:"nnf",w:11,al:"center"},
    {h:"Tipo",k:"tipo",w:10,al:"center"},{h:"Participante",k:"part",w:40},{h:"CNPJ/CPF",k:"doc",w:21},{h:"CFOPs",k:"cfops",w:14},
    {h:"Valor da nota",k:"vnf",w:16,fmt:MOEDA},{h:"ICMS apurado",k:"apur",w:16,fmt:MOEDA},{h:"Situação",k:"sit",w:12,al:"center"},{h:"Chave de acesso",k:"chave",w:48}
  ]);
  const ordem=[...R.notas].sort((a,b)=>a.n.data.localeCompare(b.n.data)||(+a.n.nNF)-(+b.n.nNF));
  ordem.forEach((x,i)=>{
    const p=x.cls.terceiros?x.n.emit:x.n.dest;
    const row=s3.addRow({data:toDate(x.n.data),mod:x.n.mod==="65"?"NFC-e":"NF-e",serie:x.n.serie,nnf:Number(x.n.nNF)||x.n.nNF,tipo:x.cls.dir==="S"?"Saída":"Entrada",
      part:p.nome||(p.doc?"":"Consumidor final"),doc:fmtDoc(p.doc||""),cfops:x.cfops.join(", "),vnf:x.n.vNF,apur:x.cancelada?0:x.apur,sit:x.cancelada?"Cancelada":"Autorizada",chave:x.n.chave});
    estiloLinha(row,i%2===1);
    row.getCell("tipo").font=font({bold:true,color:{argb:x.cls.dir==="S"?C.red:C.green}});
    row.getCell("chave").font=font({size:9,color:{argb:C.grey}});
    if(x.cancelada) row.eachCell({includeEmpty:true},c=>{ c.font=font({strike:true,italic:true,color:{argb:C.grey}}); });
  });
  if(ordem.length){
    const last=s3.rowCount;
    const tot=s3.addRow({part:"Total (autorizadas)"});
    tot.getCell("vnf").value={formula:`SUMIFS(I2:I${last},K2:K${last},"Autorizada")`};
    tot.getCell("apur").value={formula:`SUM(J2:J${last})`};
    tot.eachCell({includeEmpty:true},c=>{ c.font=font({bold:true,color:{argb:C.white}}); c.fill=fill(C.navy); c.border=box; });
    s3.autoFilter={from:{row:1,column:1},to:{row:last,column:12}};
  }
  s3.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0};

  const buf=await wb.xlsx.writeBuffer();
  const nome=`apuracao-icms-${state.empresa}-${(state.ate||"").replace(/-/g,"")}.xlsx`;
  const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  if(!downloads){
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000); toast("Planilha baixada"); return;
  }
  try{ await downloads.save({filename:nome,data:blob}); toast("Planilha salva"); }
  catch(e){ if(e&&e.code==="declined") return; if(e&&e.code==="rate_limited"){ toast("Já existe um download aguardando confirmação."); return; } toast("Não foi possível salvar a planilha aqui."); }
}
