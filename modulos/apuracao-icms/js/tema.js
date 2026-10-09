/* Tema claro/escuro. Carregado no <head> para aplicar o tema antes da tela aparecer. */
"use strict";

const TEMA_CHAVE="icms.tema";
const temaSistema=window.matchMedia("(prefers-color-scheme: dark)");

function temaSalvo(){
  try{ const v=JSON.parse(localStorage.getItem(TEMA_CHAVE)); return v==="dark"||v==="light"?v:null; }catch(e){ return null; }
}
function aplicarTema(){
  document.documentElement.setAttribute("data-theme", temaSalvo() || (temaSistema.matches?"dark":"light"));
}
function temaAtual(){ return document.documentElement.getAttribute("data-theme"); }
function definirTema(t){
  try{ localStorage.setItem(TEMA_CHAVE,JSON.stringify(t)); }catch(e){}
  aplicarTema();
}

aplicarTema();
// Sem escolha salva, acompanha a mudança de tema do sistema
temaSistema.addEventListener("change",()=>{ if(!temaSalvo()) aplicarTema(); });
