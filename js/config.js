/*
 * config.js — ajustes do sistema que mudam de uma fase para outra.
 *
 * modoTeste: true  → a tela de login mostra "Entrar no modo de teste" (sem e-mail e sem senha),
 *                    para quem recebe o link conhecer o sistema.
 *            false → fim dos testes: só entra quem tem acesso (arquivo de acessos ou admin principal).
 *                    A conta de teste some sozinha. Ao mudar, aumente a versão (?v= e sw.js) e publique.
 *
 * apiUrl:  ""      → sem servidor: usuários e dados ficam neste navegador (fase de testes).
 *          "https://..." → o login e os usuários passam a ser do servidor (API Java). O modo de teste
 *                    deixa de existir nesse caso.
 *
 * suporte: quem atende os chamados do sistema (botão flutuante "Suporte" e link na tela de login).
 *
 * Para TESTAR com a API rodando no seu computador, sem mudar o site publicado, abra uma vez:
 *     login.html?api=http://localhost:8080
 * O navegador lembra. Para voltar ao modo sem servidor: login.html?api=sair
 * (Só endereços do próprio computador são aceitos por aqui, para ninguém mandar um link que
 *  desvie o login para outro servidor.)
 */
var CONFIG = {
  modoTeste: true,
  apiUrl: "",
  // Botão "Suporte" (canto da tela e tela de login): quem atende e o WhatsApp com DDI e DDD, só números.
  // Deixe whatsapp vazio para esconder o botão.
  suporte: { nome: "Mauricio", papel: "TI · desenvolvimento do sistema", whatsapp: "5548991781362" }
};

(function () {
  var local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
  try {
    var pedido = new URLSearchParams(location.search).get("api");
    if (pedido === "sair") localStorage.removeItem("gf.apiUrl");
    else if (pedido && local.test(pedido)) localStorage.setItem("gf.apiUrl", pedido);
    var guardado = localStorage.getItem("gf.apiUrl");
    if (guardado && local.test(guardado)) CONFIG.apiUrl = guardado;
  } catch (e) { /* sem localStorage: fica o que está acima */ }
})();
