/* Funções utilitárias: formatação, armazenamento local e avisos */
"use strict";

const $ = s => document.querySelector(s);
const fmt = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const fmtN = new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const money = v => fmt.format(v||0);
const r2 = v => Math.round((v||0)*100)/100;
const onlyDigits = s => (s||"").replace(/\D/g,"");
const fmtDoc = d => d.length===14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5") : d.length===11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,"$1.$2.$3-$4") : d;
const fmtDate = iso => iso ? iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4) : "";
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const parseMoney = s => { s=String(s||"").trim(); if(!s) return 0; s=s.replace(/[R$\s]/g,""); if(s.includes(",")) s=s.replace(/\./g,"").replace(",","."); const v=parseFloat(s); return isNaN(v)?0:v; };
const store = {
  get(k,def){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):def; }catch(e){ return def; } },
  set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
};
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.add("hidden"),3200); }
