/* Estado da aplicação (notas carregadas, empresa, período, regras) */
"use strict";

const state = {
  notas: new Map(),      // chave -> nota
  cancel: new Set(),     // chaves canceladas
  ignored: {resumos:0, invalidos:0, outros:0},
  empresa: "",
  de: "", ate: "",
  tab: "S",
  rules: store.get("icms.rules", {}),
  shown: 100
};
