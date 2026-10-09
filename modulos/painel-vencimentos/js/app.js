/* =========================================
   app.js — inicialização e eventos da página
   ========================================= */

// ---------- Menu "Dados" ----------
function fecharMenu() {
  $('menuDados').classList.add('hidden');
  $('btnMenu').setAttribute('aria-expanded', 'false');
}

function executarMenu(acao) {
  fecharMenu();
  switch (acao) {
    case 'relatorio-excel': relatorioExcel(); break;
    case 'relatorio-pdf':   imprimirRelatorio(); break;
    case 'importar':        $('inputPlanilha').click(); break;
    case 'modelo':          baixarModelo(); break;
    case 'exportar':        exportarBackup(); break;
    case 'restaurar':       $('inputBackup').click(); break;
    case 'tv':              entrarModoTV(); break;
    case 'exemplos':        carregarExemplos(); break;
    case 'limpar':          limparTudo(); break;
    case 'novo-cliente':    abrirCliente(); break;
  }
}

// ---------- Ações nas linhas, cards, agenda e ficha ----------
function executarAcao(acao, id) {
  const doc = () => estado.documentos.find(d => d.id === id);
  switch (acao) {
    case 'editar-doc':   abrirDocumento(id); break;
    case 'excluir-doc':  excluirDocumento(id); break;
    case 'renovar-doc':  abrirRenovar(id); break;
    case 'avisar-doc':   { const d = doc(); if (d) abrirMensagem(d.clienteId, [d.id]); break; }
    case 'editar-cli':   abrirCliente(id); break;
    case 'excluir-cli':  excluirCliente(id); break;
    case 'novo-doc-cli': abrirDocumento(null, id); break;
    case 'avisar-cli':   avisarCliente(id); break;
    case 'ficha-cli':    abrirFicha(id); break;
  }
}

// ---------- Inicialização ----------
function iniciar() {
  $('dataHoje').textContent = dataExtenso(HOJE);

  // Celular: filtros extras recolhidos (só a busca aparece)
  const atualizarBotaoFiltros = () => {
    const ativos = [elTipo, elPeriodo, elResp, elAndamento].filter(el => el.value).length;
    const aberto = !$('filtros').classList.contains('recolhido');
    $('btnMaisFiltros').textContent = aberto ? 'Menos filtros' : `Mais filtros${ativos ? ` (${ativos} ativo${ativos > 1 ? 's' : ''})` : ''}`;
  };
  $('btnMaisFiltros').addEventListener('click', () => { $('filtros').classList.toggle('recolhido'); atualizarBotaoFiltros(); });
  [elTipo, elPeriodo, elResp, elAndamento].forEach(el => el.addEventListener('change', atualizarBotaoFiltros));
  $('limparFiltros').addEventListener('click', () => setTimeout(atualizarBotaoFiltros));

  // Selects fixos
  TIPOS.forEach(t => {
    elTipo.insertAdjacentHTML('beforeend', `<option value="${t}">${t}</option>`);
    $('docTipo').insertAdjacentHTML('beforeend', `<option value="${t}">${t}</option>`);
  });
  REGIMES.forEach(r => $('cliRegime').insertAdjacentHTML('beforeend', `<option value="${r}">${r}</option>`));
  Object.entries(ANDAMENTOS).forEach(([v, a]) => {
    elAndamento.insertAdjacentHTML('beforeend', `<option value="${v}">${a.rotulo}</option>`);
    $('docAndamento').insertAdjacentHTML('beforeend', `<option value="${v}">${a.rotulo}</option>`);
  });

  // Cabeçalho
  $('btnTema').addEventListener('click', alternarTema);
  $('btnConfig').addEventListener('click', abrirConfig);
  $('btnNovoCliente').addEventListener('click', () => abrirCliente());
  $('btnNovoDocumento').addEventListener('click', () => abrirDocumento());
  $('btnMenu').addEventListener('click', e => {
    e.stopPropagation();
    const menu = $('menuDados');
    menu.classList.toggle('hidden');
    $('btnMenu').setAttribute('aria-expanded', String(!menu.classList.contains('hidden')));
  });
  document.querySelectorAll('[data-menu]').forEach(b => b.addEventListener('click', () => executarMenu(b.dataset.menu)));
  document.addEventListener('click', e => { if (!e.target.closest('#menuDados')) fecharMenu(); });

  // Arquivos
  $('inputPlanilha').addEventListener('change', e => { const f = e.target.files[0]; if (f) lerPlanilha(f); e.target.value = ''; });
  $('inputBackup').addEventListener('change', e => { const f = e.target.files[0]; if (f) restaurarBackup(f); e.target.value = ''; });
  $('btnConfirmarImport').addEventListener('click', confirmarImportacao);
  $('dlgImportar').addEventListener('close', () => { importPendente = null; });

  // Formulário de cliente
  $('formCliente').addEventListener('submit', salvarCliente);
  $('cliDoc').addEventListener('input', e => { e.target.value = formatarDocumento(e.target.value); limparErroCampo('cliDoc'); });
  $('cliTelefone').addEventListener('input', e => { e.target.value = formatarTelefone(e.target.value); });
  ['cliNome', 'cliEmail'].forEach(id => $(id).addEventListener('input', () => limparErroCampo(id)));

  // Formulário de documento
  $('formDocumento').addEventListener('submit', salvarDocumento);
  ['docTipo', 'docEmissao', 'docVencimento'].forEach(id => $(id).addEventListener('input', () => { limparErroCampo(id); atualizarSugestaoDocumento(); }));
  ['docCliente', 'docLink'].forEach(id => $(id).addEventListener('input', () => limparErroCampo(id)));
  $('docSugestao').addEventListener('click', e => {
    $('docVencimento').value = e.currentTarget.dataset.valor;
    limparErroCampo('docVencimento');
    atualizarSugestaoDocumento();
  });
  $('btnClienteRapido').addEventListener('click', () => abrirCliente(null, { doDocumento: true }));

  // Renovação
  $('formRenovar').addEventListener('submit', confirmarRenovacao);
  $('renEmissao').addEventListener('input', () => { limparErroCampo('renEmissao'); sugerirVencimentoRenovacao(); });
  $('renVencimento').addEventListener('input', () => { vencimentoManual = true; limparErroCampo('renVencimento'); sugerirVencimentoRenovacao(); });

  // Mensagem
  $('msgWhatsapp').addEventListener('click', enviarWhatsapp);
  $('msgEmail').addEventListener('click', enviarEmail);
  $('msgCopiar').addEventListener('click', copiarMensagem);

  // Configurações
  $('formConfig').addEventListener('submit', salvarConfiguracoes);
  $('cfgMensagemPadrao').addEventListener('click', () => { $('cfgMensagem').value = MENSAGEM_PADRAO; });

  // Fechar modais: botões "Cancelar/X" e clique fora
  document.querySelectorAll('dialog').forEach(dlg => {
    dlg.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  });

  // Ações (delegação de eventos: tabela, cards, agenda e ficha)
  document.body.addEventListener('click', e => {
    const alvo = e.target.closest('[data-acao]');
    if (alvo) { executarAcao(alvo.dataset.acao, alvo.dataset.id); return; }

    const ord = e.target.closest('.ordenar');
    if (ord) { mudarOrdem(ord.dataset.ordem); return; }

    const pag = e.target.closest('[data-pagina]');
    if (pag && !pag.disabled) { pagina = Number(pag.dataset.pagina); atualizar(); $('painelDocumentos').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }

    const dia = e.target.closest('[data-dia]');
    if (dia) { calDia = calDia === dia.dataset.dia ? null : dia.dataset.dia; atualizar(); }
  });
  document.body.addEventListener('change', e => {
    if (e.target.classList.contains('sel-andamento')) mudarAndamento(e.target.dataset.id, e.target.value);
  });

  // Calendário
  $('calAnterior').addEventListener('click', () => { calMes = new Date(calMes.getFullYear(), calMes.getMonth() - 1, 1); calDia = null; atualizar(); });
  $('calProximo').addEventListener('click', () => { calMes = new Date(calMes.getFullYear(), calMes.getMonth() + 1, 1); calDia = null; atualizar(); });
  $('calHoje').addEventListener('click', () => { calMes = new Date(HOJE.getFullYear(), HOJE.getMonth(), 1); calDia = null; atualizar(); });
  $('agendaVoltar').addEventListener('click', () => { calDia = null; atualizar(); });

  // Filtros
  const aoFiltrar = () => { pagina = 1; atualizar(); };
  elBusca.addEventListener('input', aoFiltrar);
  [elTipo, elPeriodo, elResp, elAndamento].forEach(el => el.addEventListener('change', aoFiltrar));
  document.querySelectorAll('.card-resumo').forEach(card => {
    card.addEventListener('click', () => {
      elPeriodo.value = elPeriodo.value === card.dataset.periodo ? '' : card.dataset.periodo;
      pagina = 1;
      if (abaAtual === 'cadastro') trocarAba('documentos'); else atualizar();
    });
  });
  $('limparFiltros').addEventListener('click', () => { limparFiltros(); atualizar(); });

  // Abas
  document.querySelectorAll('.aba').forEach(aba => aba.addEventListener('click', () => trocarAba(aba.dataset.aba)));

  // Modo TV
  $('btnSairTV').addEventListener('click', sairModoTV);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && modoTV) sairModoTV(); });

  // Atalhos de teclado
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { fecharMenu(); if (modoTV) sairModoTV(); }
    const digitando = e.target.closest('input, textarea, select, [contenteditable]');
    if (digitando || document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey || modoTV) return;
    const tecla = e.key.toLowerCase();
    if (e.key === '/') { e.preventDefault(); elBusca.focus(); }
    else if (tecla === 'n') { e.preventDefault(); abrirDocumento(); }
    else if (tecla === 'c') { e.preventDefault(); abrirCliente(); }
  });

  // Vira o dia com o painel aberto: recalcula prazos
  setInterval(() => { if (atualizarHoje()) atualizar(); }, 60 * 1000);

  // Dados salvos
  carregarConfig();
  carregarDados();
  let abaSalva = null;
  try { abaSalva = localStorage.getItem('painelVencimentos:aba'); } catch (e) {}
  trocarAba(['documentos', 'clientes', 'cadastro', 'calendario', 'indicadores'].includes(abaSalva) ? abaSalva : 'documentos');
  verificarNotificacoes();

  // App instalável / offline: feitos pelo sistema principal (Gestão Financeira), que guarda os arquivos deste módulo
}

document.addEventListener('DOMContentLoaded', iniciar);
