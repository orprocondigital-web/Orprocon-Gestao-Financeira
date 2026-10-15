/* =========================================
   acoes.js — formulários e ações do usuário
   (cliente, documento, renovação, ficha, mensagem,
    configurações, notificações, relatório PDF, modo TV)
   ========================================= */

// ---------- Erros de formulário ----------
function mostrarErro(campoId, mensagem) {
  $(campoId).classList.add('invalido');
  const p = $('erro-' + campoId);
  if (p) p.textContent = mensagem;
}
function limparErros(form) {
  form.querySelectorAll('.erro').forEach(p => (p.textContent = ''));
  form.querySelectorAll('.invalido').forEach(c => c.classList.remove('invalido'));
}
function limparErroCampo(id) {
  $(id).classList.remove('invalido');
  const p = $('erro-' + id);
  if (p) p.textContent = '';
}
function temErro(form) {
  const campo = form.querySelector('.invalido');
  if (campo) campo.focus();
  return !!campo;
}

// =========================================================
// Cliente
// =========================================================
let clienteEditando = null;
let voltarParaDocumento = false;

function abrirCliente(id = null, { doDocumento = false } = {}) {
  const c = id ? estado.clientes.find(x => x.id === id) : null;
  if (id && !c) return;
  clienteEditando = id;
  voltarParaDocumento = doDocumento;

  $('tituloCliente').textContent = c ? 'Editar cliente' : 'Novo cliente';
  $('cliNome').value = c?.nome || '';
  $('cliDoc').value = c?.documento || '';
  $('cliRegime').value = REGIMES.includes(c?.regime) ? c.regime : '';
  $('cliContato').value = c?.contato || '';
  $('cliEmail').value = c?.email || '';
  $('cliTelefone').value = c?.telefone || '';
  limparErros($('formCliente'));
  $('dlgCliente').showModal();
  $('cliNome').focus();
}

function salvarCliente(e) {
  e.preventDefault();
  const form = $('formCliente');
  limparErros(form);

  const dados = {
    nome: $('cliNome').value.trim().replace(/\s+/g, ' '),
    documento: formatarDocumento($('cliDoc').value),
    regime: $('cliRegime').value,
    contato: $('cliContato').value.trim(),
    email: $('cliEmail').value.trim(),
    telefone: formatarTelefone($('cliTelefone').value),
  };
  const dig = soDigitos(dados.documento);

  if (!dados.nome) mostrarErro('cliNome', 'Informe o nome ou razão social.');
  if (!dig) mostrarErro('cliDoc', 'Informe o CNPJ ou CPF.');
  else if (!validarDocumento(dig)) mostrarErro('cliDoc', dig.length === 11 ? 'CPF inválido.' : dig.length === 14 ? 'CNPJ inválido.' : 'Digite 11 (CPF) ou 14 (CNPJ) números.');
  else if (estado.clientes.some(c => c.id !== clienteEditando && soDigitos(c.documento) === dig)) mostrarErro('cliDoc', 'Já existe um cliente com esse documento.');
  if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) mostrarErro('cliEmail', 'E-mail inválido.');
  if (temErro(form)) return;

  let id = clienteEditando;
  if (id) {
    Object.assign(estado.clientes.find(c => c.id === id), dados);
    toast('Cliente atualizado.');
  } else {
    id = gerarId();
    estado.clientes.push({ id, ...dados });
    toast('Cliente cadastrado.');
  }
  salvarEAtualizar();
  $('dlgCliente').close();

  if (voltarParaDocumento) {
    preencherSelectClientes();
    $('docCliente').value = id;
    limparErroCampo('docCliente');
  }
}

function excluirCliente(id) {
  const c = estado.clientes.find(x => x.id === id);
  if (!c) return;
  const qtd = estado.documentos.filter(d => d.clienteId === id).length;
  const msg = qtd
    ? `Excluir "${c.nome}" e ${qtd === 1 ? 'o documento vinculado' : `os ${qtd} documentos vinculados`}?`
    : `Excluir "${c.nome}"?`;
  if (!confirm(msg)) return;
  if ($('dlgFicha').open && fichaClienteId === id) $('dlgFicha').close();
  comDesfazer('Cliente excluído.', () => {
    estado.clientes = estado.clientes.filter(x => x.id !== id);
    estado.documentos = estado.documentos.filter(d => d.clienteId !== id);
  });
}

// =========================================================
// Documento
// =========================================================
let docEditando = null;

function preencherSelectClientes() {
  const sel = $('docCliente');
  const atual = sel.value;
  const ordenados = [...estado.clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  sel.innerHTML = `<option value="">${ordenados.length ? 'Selecione o cliente...' : 'Nenhum cliente — cadastre um primeiro'}</option>` +
    ordenados.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}${c.documento ? ' — ' + esc(c.documento) : ''}</option>`).join('');
  sel.value = atual;
}

function preencherResponsaveis() {
  const nomes = new Set(['Fiscal', 'DP', 'Legal', 'Contábil']);
  estado.documentos.forEach(d => d.responsavel && nomes.add(d.responsavel));
  $('listaResponsaveis').innerHTML = [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map(n => `<option value="${esc(n)}"></option>`).join('');
}

function htmlPrevia(iso) {
  if (!isoValido(iso)) return '';
  const dias = diasAte(iso);
  const st = classificar(dias);
  return `<span class="flex items-center gap-2 text-sm">${seloStatus(st)}<span class="texto-suave">${esc(textoPrazo(iso).replace(/ \(.*\)$/, ''))}</span></span>`;
}

// Sugere o vencimento com base na emissão + validade padrão do tipo
function atualizarSugestaoDocumento() {
  $('docPrevia').innerHTML = htmlPrevia($('docVencimento').value);
  const tipo = $('docTipo').value;
  const btn = $('docSugestao');
  if (!tipo) { btn.classList.add('hidden'); return; }
  const base = isoValido($('docEmissao').value) ? $('docEmissao').value : hojeISO();
  const sugestao = somarDias(base, config.validades[tipo]);
  if (sugestao === $('docVencimento').value) { btn.classList.add('hidden'); return; }
  btn.dataset.valor = sugestao;
  btn.textContent = `Usar validade padrão: ${formatarData(sugestao)} (${config.validades[tipo]} dias ${isoValido($('docEmissao').value) ? 'após a emissão' : 'a partir de hoje'})`;
  btn.classList.remove('hidden');
}

function abrirDocumento(id = null, clienteId = '') {
  const d = id ? estado.documentos.find(x => x.id === id) : null;
  if (id && !d) return;
  docEditando = id;

  preencherSelectClientes();
  preencherResponsaveis();
  $('tituloDocumento').textContent = d ? 'Editar documento' : 'Novo documento';
  $('docCliente').value = d?.clienteId || clienteId || '';
  $('docTipo').value = d?.tipo || '';
  $('docNumero').value = d?.numero || '';
  $('docEmissao').value = d?.emissao || '';
  $('docVencimento').value = d?.vencimento || '';
  $('docResponsavel').value = d?.responsavel || '';
  $('docAndamento').value = d?.andamento || 'pendente';
  $('docLink').value = d?.link || '';
  $('docObs').value = d?.observacoes || '';
  limparErros($('formDocumento'));
  atualizarSugestaoDocumento();
  $('dlgDocumento').showModal();
  ($('docCliente').value ? $('docTipo') : $('docCliente')).focus();
}

function salvarDocumento(e) {
  e.preventDefault();
  const form = $('formDocumento');
  limparErros(form);

  const dados = {
    clienteId: $('docCliente').value,
    tipo: $('docTipo').value,
    numero: $('docNumero').value.trim(),
    emissao: $('docEmissao').value,
    vencimento: $('docVencimento').value,
    responsavel: $('docResponsavel').value.trim(),
    andamento: $('docAndamento').value,
    link: $('docLink').value.trim(),
    observacoes: $('docObs').value.trim(),
  };

  if (!dados.clienteId) mostrarErro('docCliente', 'Selecione o cliente.');
  if (!dados.tipo) mostrarErro('docTipo', 'Selecione o tipo.');
  if (!isoValido(dados.vencimento)) mostrarErro('docVencimento', 'Informe a data de vencimento.');
  if (dados.emissao && !isoValido(dados.emissao)) mostrarErro('docEmissao', 'Data inválida.');
  if (isoValido(dados.emissao) && isoValido(dados.vencimento) && dados.emissao > dados.vencimento) {
    mostrarErro('docEmissao', 'A emissão não pode ser depois do vencimento.');
  }
  if (dados.link && !linkSeguro(dados.link)) mostrarErro('docLink', 'Use um link completo, começando com https://');
  if (!form.querySelector('.invalido') && estado.documentos.some(d =>
      d.id !== docEditando && d.clienteId === dados.clienteId && d.tipo === dados.tipo && d.vencimento === dados.vencimento)) {
    mostrarErro('docVencimento', 'Esse cliente já tem esse documento com essa data.');
  }
  if (temErro(form)) return;

  if (docEditando) {
    Object.assign(estado.documentos.find(d => d.id === docEditando), dados);
    toast('Documento atualizado.');
  } else {
    estado.documentos.push(normalizarDocumento({ id: gerarId(), ...dados, criadoEm: hojeISO(), historico: [] }));
    toast('Documento cadastrado.');
  }
  salvarEAtualizar();
  $('dlgDocumento').close();
}

function excluirDocumento(id) {
  const d = estado.documentos.find(x => x.id === id);
  if (!d) return;
  const c = estado.clientes.find(x => x.id === d.clienteId);
  if (!confirm(`Excluir "${d.tipo}" de ${c ? c.nome : 'cliente desconhecido'} (vence ${formatarData(d.vencimento)})?`)) return;
  comDesfazer('Documento excluído.', () => {
    estado.documentos = estado.documentos.filter(x => x.id !== id);
  });
}

function mudarAndamento(id, valor) {
  const d = estado.documentos.find(x => x.id === id);
  if (!d || !ANDAMENTOS[valor]) return;
  d.andamento = valor;
  salvarEAtualizar();
  toast(`Andamento: ${ANDAMENTOS[valor].rotulo}.`);
}

// =========================================================
// Renovação
// =========================================================
let docRenovando = null;
let vencimentoManual = false;

function sugerirVencimentoRenovacao() {
  const d = estado.documentos.find(x => x.id === docRenovando);
  if (!d) return;
  const emissao = isoValido($('renEmissao').value) ? $('renEmissao').value : hojeISO();
  if (!vencimentoManual) $('renVencimento').value = somarDias(emissao, config.validades[d.tipo] || 365);
  $('renDica').innerHTML = `Validade padrão de <strong>${esc(d.tipo)}</strong>: ${config.validades[d.tipo]} dias (ajuste em Configurações). ` +
    (isoValido($('renVencimento').value) ? `Novo status: ${seloStatus(classificar(diasAte($('renVencimento').value)))}` : '');
}

function abrirRenovar(id) {
  const d = estado.documentos.find(x => x.id === id);
  if (!d) return;
  const c = estado.clientes.find(x => x.id === d.clienteId);
  docRenovando = id;
  vencimentoManual = false;
  $('renInfo').textContent = `${d.tipo} · ${c?.nome || ''} · venc. atual ${formatarData(d.vencimento)}`;
  $('renEmissao').value = hojeISO();
  $('renNumero').value = d.numero;
  $('renObs').value = '';
  limparErros($('formRenovar'));
  sugerirVencimentoRenovacao();
  $('dlgRenovar').showModal();
  $('renVencimento').focus();
}

function confirmarRenovacao(e) {
  e.preventDefault();
  const form = $('formRenovar');
  limparErros(form);
  const d = estado.documentos.find(x => x.id === docRenovando);
  if (!d) return;

  const emissao = $('renEmissao').value;
  const novo = $('renVencimento').value;
  if (emissao && !isoValido(emissao)) mostrarErro('renEmissao', 'Data inválida.');
  if (!isoValido(novo)) mostrarErro('renVencimento', 'Informe o novo vencimento.');
  else if (novo <= d.vencimento) mostrarErro('renVencimento', `Deve ser depois do vencimento atual (${formatarData(d.vencimento)}).`);
  else if (isoValido(emissao) && emissao > novo) mostrarErro('renEmissao', 'A emissão não pode ser depois do vencimento.');
  if (temErro(form)) return;

  $('dlgRenovar').close();
  comDesfazer(`${d.tipo} renovado até ${formatarData(novo)}.`, () => {
    const alvo = estado.documentos.find(x => x.id === docRenovando);
    alvo.historico = alvo.historico || [];
    alvo.historico.push({
      data: hojeISO(),
      vencimentoAnterior: alvo.vencimento,
      novoVencimento: novo,
      emissaoAnterior: alvo.emissao,
      numeroAnterior: alvo.numero,
      obs: $('renObs').value.trim(),
    });
    alvo.vencimento = novo;
    alvo.emissao = isoValido(emissao) ? emissao : '';
    alvo.numero = $('renNumero').value.trim();
    alvo.andamento = 'pendente';
  });
}

// =========================================================
// Ficha do cliente (dados, documentos e histórico)
// =========================================================
let fichaClienteId = null;

function abrirFicha(id) {
  if (!estado.clientes.some(c => c.id === id)) return;
  fichaClienteId = id;
  renderFicha();
  if (!$('dlgFicha').open) $('dlgFicha').showModal();
}

function renderFicha() {
  const c = estado.clientes.find(x => x.id === fichaClienteId);
  if (!c) { $('dlgFicha').close(); return; }
  const seus = docs.filter(d => d.clienteId === c.id).sort((a, b) => a.dias - b.dias);

  $('fichaCabecalho').innerHTML = `
    ${avatarHTML(c.nome, 'avatar-grande')}
    <div class="min-w-0">
      <h2 class="text-lg font-bold leading-tight truncate">${esc(c.nome)}</h2>
      <p class="texto-suave text-sm">${esc(c.documento) || 'Sem documento'}${c.regime ? ' · ' + esc(c.regime) : ''}</p>
    </div>`;

  // Linha do tempo: cadastro e renovações de todos os documentos
  const eventos = [];
  estado.documentos.filter(d => d.clienteId === c.id).forEach(d => {
    (d.historico || []).forEach(h => eventos.push({
      data: h.data, tipo: 'renovacao',
      texto: `<strong>${esc(d.tipo)}</strong> renovado: ${formatarData(h.vencimentoAnterior)} → ${formatarData(h.novoVencimento)}`,
      obs: h.obs,
    }));
    if (d.criadoEm) eventos.push({ data: d.criadoEm, tipo: 'cadastro', texto: `<strong>${esc(d.tipo)}</strong> cadastrado (venc. ${formatarData((d.historico?.[0]?.vencimentoAnterior) || d.vencimento)})` });
  });
  eventos.sort((a, b) => b.data.localeCompare(a.data));

  const contato = [
    c.contato && `<div><span class="rotulo">Contato</span>${esc(c.contato)}</div>`,
    c.email && `<div><span class="rotulo">E-mail</span><a class="link" href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>`,
    c.telefone && `<div><span class="rotulo">Telefone</span>${esc(c.telefone)}</div>`,
  ].filter(Boolean).join('');

  $('fichaCorpo').innerHTML = `
    <div class="flex flex-wrap gap-2 mb-5">
      <button class="btn btn-primario" data-acao="avisar-cli" data-id="${esc(c.id)}">${ICONES.mensagem} Avisar cliente</button>
      <button class="btn btn-secundario" data-acao="novo-doc-cli" data-id="${esc(c.id)}">${ICONES.mais} Documento</button>
      <button class="btn btn-secundario" data-acao="editar-cli" data-id="${esc(c.id)}">${ICONES.editar} Editar cliente</button>
    </div>

    ${contato ? `<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mb-6">${contato}</div>` : ''}

    <h3 class="font-semibold mb-2">Documentos (${seus.length})</h3>
    ${seus.length ? `<div class="space-y-2 mb-6">${seus.map(d => `
      <div class="agenda-item">
        <div class="min-w-0">
          <p class="flex items-center gap-2 text-sm font-semibold">${pontoTipo(d.tipo)}${esc(d.tipo)}
            ${d.link ? `<a class="acao acao-mini" href="${esc(d.link)}" target="_blank" rel="noopener noreferrer" title="Abrir arquivo">${ICONES.link}</a>` : ''}</p>
          <p class="text-xs texto-suave">Vence ${formatarData(d.vencimento)}${d.numero ? ' · Nº ' + esc(d.numero) : ''}${d.responsavel ? ' · ' + esc(d.responsavel) : ''}</p>
          ${d.observacoes ? `<p class="text-xs texto-suave italic mt-0.5">${esc(d.observacoes)}</p>` : ''}
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <span class="andamento andamento-${d.andamento} hidden sm:inline-flex">${ANDAMENTOS[d.andamento].rotulo}</span>
          ${seloStatus(d.status)}
          <button class="acao acao-mini acao-sucesso" data-acao="renovar-doc" data-id="${esc(d.id)}" title="Registrar renovação" aria-label="Renovar">${ICONES.renovar}</button>
          <button class="acao acao-mini" data-acao="editar-doc" data-id="${esc(d.id)}" title="Editar" aria-label="Editar">${ICONES.editar}</button>
        </div>
      </div>`).join('')}</div>` : '<p class="texto-suave text-sm mb-6">Nenhum documento cadastrado.</p>'}

    <h3 class="font-semibold mb-2">Histórico</h3>
    ${eventos.length ? `<ol class="linha-tempo">${eventos.map(ev => `
      <li class="evento evento-${ev.tipo}">
        <span class="evento-data">${formatarData(ev.data)}</span>
        <span class="text-sm">${ev.texto}</span>
        ${ev.obs ? `<span class="block text-xs texto-suave">${esc(ev.obs)}</span>` : ''}
      </li>`).join('')}</ol>` : '<p class="texto-suave text-sm">Sem registros ainda. As renovações aparecem aqui.</p>'}
  `;
}

// =========================================================
// Mensagem ao cliente (WhatsApp / e-mail)
// =========================================================
let mensagemDocs = [];
let mensagemCliente = null;

function montarMensagem(cliente, lista) {
  const itens = lista
    .sort((a, b) => a.dias - b.dias)
    .map(d => `• ${d.tipo}${d.numero ? ' (nº ' + d.numero + ')' : ''}: ${textoPrazo(d.vencimento)}`)
    .join('\n');
  const vars = {
    saudacao: cliente.contato ? `Olá, ${cliente.contato}! Tudo bem?` : 'Olá! Tudo bem?',
    contato: cliente.contato || '',
    cliente: cliente.nome,
    itens,
    escritorio: config.escritorio || '',
  };
  return config.mensagem
    .replace(/\{(\w+)\}/g, (m, chave) => (chave in vars ? vars[chave] : m))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function abrirMensagem(clienteId, docIds) {
  const cliente = estado.clientes.find(c => c.id === clienteId);
  if (!cliente) return;
  const lista = docs.filter(d => docIds.includes(d.id));
  if (!lista.length) { toast('Nenhum documento vencido ou vencendo nos próximos 30 dias para esse cliente.', 'aviso'); return; }
  mensagemCliente = cliente;
  mensagemDocs = lista.map(d => d.id);

  const tel = soDigitos(cliente.telefone);
  $('msgPara').textContent = `${cliente.nome}${cliente.contato ? ' · ' + cliente.contato : ''} — ${plural(lista.length, 'documento', 'documentos')}`;
  $('msgTexto').value = montarMensagem(cliente, lista);
  $('msgWhatsapp').disabled = tel.length < 10;
  $('msgEmail').disabled = !cliente.email;
  const faltam = [tel.length < 10 && 'telefone', !cliente.email && 'e-mail'].filter(Boolean);
  $('msgAviso').textContent = faltam.length
    ? `Cliente sem ${faltam.join(' e ')} cadastrado. Você ainda pode copiar a mensagem.`
    : '';
  $('dlgMensagem').showModal();
}

// Avisar sobre todos os documentos do cliente que pedem atenção
function avisarCliente(clienteId) {
  const ids = docs.filter(d => d.clienteId === clienteId && d.status !== 'ok').map(d => d.id);
  abrirMensagem(clienteId, ids);
}

function aposEnviarMensagem() {
  if ($('msgMarcar').checked && mensagemDocs.length) {
    estado.documentos.forEach(d => { if (mensagemDocs.includes(d.id)) d.andamento = 'aguardando'; });
    salvarEAtualizar();
  }
}

function enviarWhatsapp() {
  let tel = soDigitos(mensagemCliente.telefone);
  if (tel.length <= 11) tel = '55' + tel; // adiciona o código do Brasil
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent($('msgTexto').value)}`, '_blank', 'noopener');
  aposEnviarMensagem();
  $('dlgMensagem').close();
}

function enviarEmail() {
  const assunto = `Vencimento de documentos — ${mensagemCliente.nome}`;
  window.location.href = `mailto:${encodeURIComponent(mensagemCliente.email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent($('msgTexto').value)}`;
  aposEnviarMensagem();
  $('dlgMensagem').close();
}

async function copiarMensagem() {
  const texto = $('msgTexto').value;
  try {
    await navigator.clipboard.writeText(texto);
  } catch (e) {
    $('msgTexto').select();
    document.execCommand('copy');
  }
  toast('Mensagem copiada.');
  aposEnviarMensagem();
  $('dlgMensagem').close();
}

// =========================================================
// Configurações
// =========================================================
function statusNotificacao() {
  if (!('Notification' in window)) return 'Este navegador não suporta notificações.';
  if (Notification.permission === 'denied') return 'As notificações estão bloqueadas para este site nas configurações do navegador.';
  if (Notification.permission === 'granted') return 'Permissão concedida.';
  return 'Ao salvar, o navegador vai pedir permissão.';
}

function abrirConfig() {
  $('cfgEscritorio').value = config.escritorio;
  $('cfgPorPagina').value = String(config.porPagina);
  $('cfgMensagem').value = config.mensagem;
  $('cfgNotificacoes').checked = config.notificacoes;
  $('cfgNotifStatus').textContent = statusNotificacao();
  $('cfgValidades').innerHTML = TIPOS.map((t, i) => `
    <div>
      <label for="cfgVal${i}" class="rotulo flex items-center gap-1.5">${pontoTipo(t)}${esc(t)}</label>
      <input id="cfgVal${i}" type="number" min="1" max="3650" class="campo" value="${config.validades[t]}" data-tipo="${esc(t)}" />
    </div>`).join('');
  $('dlgConfig').showModal();
}

async function salvarConfiguracoes(e) {
  e.preventDefault();
  const validades = {};
  let invalido = false;
  $('cfgValidades').querySelectorAll('input').forEach(inp => {
    const v = Number(inp.value);
    const ok = Number.isInteger(v) && v >= 1 && v <= 3650;
    inp.classList.toggle('invalido', !ok);
    if (!ok) invalido = true;
    validades[inp.dataset.tipo] = v;
  });
  if (invalido) { toast('Validades devem ser números inteiros entre 1 e 3650.', 'erro'); return; }

  let notificacoes = $('cfgNotificacoes').checked;
  if (notificacoes && 'Notification' in window && Notification.permission === 'default') {
    notificacoes = (await Notification.requestPermission()) === 'granted';
  }
  if (notificacoes && (!('Notification' in window) || Notification.permission !== 'granted')) {
    notificacoes = false;
    toast('Notificações não permitidas pelo navegador.', 'aviso');
  }

  config = normalizarConfig({
    escritorio: $('cfgEscritorio').value.trim(),
    porPagina: $('cfgPorPagina').value,
    validades,
    mensagem: $('cfgMensagem').value,
    notificacoes,
  });
  salvarConfig();
  $('dlgConfig').close();
  atualizar();
  toast('Configurações salvas.');
  if (notificacoes) verificarNotificacoes(true);
}

// =========================================================
// Notificação do navegador (1x por dia)
// =========================================================
function verificarNotificacoes(forcar = false) {
  if (!config.notificacoes || !('Notification' in window) || Notification.permission !== 'granted') return;
  let ultima = null;
  try { ultima = localStorage.getItem(CHAVE_NOTIFICACAO); } catch (e) {}
  if (!forcar && ultima === hojeISO()) return;

  const cont = contarStatus(docs);
  if (!cont.vencido && !cont['7']) return;
  const partes = [];
  if (cont.vencido) partes.push(plural(cont.vencido, 'documento vencido', 'documentos vencidos'));
  if (cont['7']) partes.push(`${cont['7']} vencendo em até 7 dias`);
  try {
    new Notification('Painel de Vencimentos', { body: partes.join(' e ') + '.', icon: 'icons/icon-192.png', tag: 'vencimentos' });
    localStorage.setItem(CHAVE_NOTIFICACAO, hojeISO());
  } catch (e) {
    console.warn('Notificação não exibida.', e);
  }
}

// =========================================================
// Relatório para impressão / PDF
// =========================================================
function imprimirRelatorio() {
  const lista = listaAtual();
  if (!lista.length) { toast('Nenhum documento para os filtros atuais.', 'aviso'); return; }
  const cont = contarStatus(lista);
  const filtros = descreverFiltros();

  $('relatorio').innerHTML = `
    <header class="rel-cabecalho">
      <div>
        <h1>Relatório de vencimentos</h1>
        <p>${esc(config.escritorio || 'Painel de Vencimentos')}</p>
      </div>
      <div class="rel-meta">
        <p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
        <p>${filtros ? 'Filtros: ' + esc(filtros) : 'Sem filtros'}</p>
      </div>
    </header>
    <div class="rel-resumo">
      ${ORDEM_STATUS.map(st => `<div><strong>${cont[st]}</strong><span>${STATUS[st].rotulo}</span></div>`).join('')}
      <div><strong>${lista.length}</strong><span>Total</span></div>
    </div>
    <table class="rel-tabela">
      <thead><tr><th>Cliente</th><th>CNPJ/CPF</th><th>Documento</th><th>Vencimento</th><th>Prazo</th><th>Status</th><th>Andamento</th><th>Responsável</th></tr></thead>
      <tbody>
        ${lista.map(d => `
          <tr class="rel-${d.status}">
            <td>${esc(d.cliente.nome)}</td>
            <td>${esc(d.cliente.documento)}</td>
            <td>${esc(d.tipo)}${d.numero ? '<br><small>Nº ' + esc(d.numero) + '</small>' : ''}</td>
            <td>${formatarData(d.vencimento)}</td>
            <td>${textoDias(d.dias)}</td>
            <td>${STATUS[d.status].rotulo}</td>
            <td>${ANDAMENTOS[d.andamento].rotulo}</td>
            <td>${esc(d.responsavel)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  fecharMenu();
  setTimeout(() => window.print(), 50);
}

// =========================================================
// Modo TV (tela cheia, só o que vence em até 30 dias)
// =========================================================
let relogioTV = null;

function atualizarRelogioTV() {
  const agora = new Date();
  $('tvRelogio').textContent = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('tvData').textContent = dataExtenso(agora);
  $('tvTitulo').textContent = config.escritorio ? `Vencimentos — ${config.escritorio}` : 'Painel de Vencimentos';
}

function entrarModoTV() {
  modoTV = true;
  document.body.classList.add('modo-tv');
  ordem = { campo: 'vencimento', dir: 1 };
  trocarAba('documentos');
  atualizarRelogioTV();
  relogioTV = setInterval(() => { atualizarRelogioTV(); atualizar(); }, 60 * 1000);
  document.documentElement.requestFullscreen?.().catch(() => {});
}

function sairModoTV() {
  if (!modoTV) return;
  modoTV = false;
  document.body.classList.remove('modo-tv');
  clearInterval(relogioTV);
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  atualizar();
}
