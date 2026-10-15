/*
 * config.js — ajustes do sistema que mudam de uma fase para outra.
 *
 * modoTeste: true  → a tela de login mostra "Entrar no modo de teste" (sem e-mail e sem senha),
 *                    para quem recebe o link conhecer o sistema.
 *            false → fim dos testes: só entra quem tem acesso (arquivo de acessos ou admin principal).
 *                    A conta de teste some sozinha. Ao mudar, aumente a versão (?v= e sw.js) e publique.
 */
var CONFIG = {
  modoTeste: true
};
