/* =========================================
   telas.js — filtros, ordenação e desenho das abas
   (Vencimentos, Por cliente, Clientes, Calendário, Indicadores)
   ========================================= */

// ---------- Estado da tela ----------
let abaAtual = 'documentos';
let ordem = { campo: 'vencimento', dir: 1 };
let pagina = 1;
let modoTV = false;
let calMes = new Date(HOJE.getFullYear(), HOJE.getMonth(), 1);
let calDia = null;

const elBusca = $('busca');
const elTipo = $('filtroTipo');
const elPeriodo = $('filtroPeriodo');
const elResp = $('filtroResponsavel');
const elAndamento = $('filtroAndamento');

// ---------- Filtros ----------
function limparFiltros() {
  elBusca.value = '';
  elTipo.value = '';
  elPeriodo.value = '';
  elResp.value = '';
  elAndamento.value = '';
  pagina = 1;
}

function clienteCombina(cliente, termo) {
  if (!termo) return true;
  const t = semAcento(termo).toLowerCase();
  const tDig = soDigitos(termo);
  return semAcento(cliente.nome).toLowerCase().includes(t) ||
         (tDig.length > 0 && soDigitos(cliente.documento).includes(tDig));
}

function filtrar() {
  const termo = elBusca.value.trim();
  const tipo = elTipo.value;
  const periodo = elPeriodo.value;
  const resp = elResp.value;
  const andamento = elAndamento.value;
  return docs.filter(d =>
    clienteCombina(d.cliente, termo) &&
    (!tipo || d.tipo === tipo) &&
    (!periodo || d.status === periodo) &&
    (!resp || (resp === '__sem' ? !d.responsavel : d.responsavel === resp)) &&
    (!andamento || d.andamento === andamento) &&
    (!modoTV || d.status !== 'ok')
  );
}

function descreverFiltros() {
  const partes = [];
  if (elBusca.value.trim()) partes.push(`busca "${elBusca.value.trim()}"`);
  if (elTipo.value) partes.push(`tipo: ${elTipo.value}`);
  if (elPeriodo.value) partes.push(`período: ${STATUS[elPeriodo.value].rotulo}`);
  if (elResp.value) partes.push(`responsável: ${elResp.value === '__sem' ? '(sem responsável)' : elResp.value}`);
  if (elAndamento.value) partes.push(`andamento: ${ANDAMENTOS[elAndamento.value].rotulo}`);
  return partes.join(' · ');
}

function atualizarOpcoesResponsavel() {
  const atual = elResp.value;
  const nomes = [...new Set(estado.documentos.map(d => d.responsavel).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const temSem = estado.documentos.some(d => !d.responsavel);
  elResp.innerHTML = '<option value="">Todos</option>' +
    nomes.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') +
    (temSem ? '<option value="__sem">(sem responsável)</option>' : '');
  elResp.value = [...elResp.options].some(o => o.value === atual) ? atual : '';
}

// ---------- Ordenação ----------
const ORDEM_ANDAMENTO = Object.keys(ANDAMENTOS);
const COMPARADORES = {
  cliente:     (a, b) => a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR'),
  tipo:        (a, b) => TIPOS.indexOf(a.tipo) - TIPOS.indexOf(b.tipo),
  vencimento:  (a, b) => a.dias - b.dias,
  status:      (a, b) => STATUS[b.status].peso - STATUS[a.status].peso,
  andamento:   (a, b) => ORDEM_ANDAMENTO.indexOf(a.andamento) - ORDEM_ANDAMENTO.indexOf(b.andamento),
  responsavel: (a, b) => (a.responsavel || '￿').localeCompare(b.responsavel || '￿', 'pt-BR'),
};

function ordenar(lista) {
  const cmp = COMPARADORES[ordem.campo];
  return [...lista].sort((a, b) =>
    (cmp(a, b) * ordem.dir) || (a.dias - b.dias) || a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR'));
}

// Lista filtrada e ordenada (usada pela tela e pelos relatórios)
const listaAtual = () => ordenar(filtrar());

function mudarOrdem(campo) {
  ordem = ordem.campo === campo ? { campo, dir: -ordem.dir } : { campo, dir: 1 };
  pagina = 1;
  atualizar();
}

// ---------- Destaque + cards de resumo ----------
function renderResumo() {
  const cont = contarStatus(docs);
  const total = docs.length || 1;

  const sufixos = { vencido: 'Vencido', '7': '7', '15': '15', '30': '30', ok: 'Ok' };
  Object.entries(sufixos).forEach(([st, suf]) => {
    $('qtd' + suf).textContent = cont[st];
    $('bar' + suf).style.width = (cont[st] / total * 100) + '%';
  });
  document.querySelectorAll('.card-resumo').forEach(card =>
    card.classList.toggle('ativo', card.dataset.periodo === elPeriodo.value));

  const vazio = !estado.clientes.length;
  document.querySelector('.destaque').classList.toggle('alerta', cont.vencido + cont['7'] > 0);
  $('acoesVazio').classList.toggle('hidden', !vazio);

  let titulo, texto;
  if (vazio) {
    titulo = 'Comece cadastrando seus clientes';
    texto = 'Cadastre manualmente, importe uma planilha ou carregue os exemplos para testar.';
  } else if (!docs.length) {
    titulo = 'Nenhum documento cadastrado';
    texto = 'Clique em "Documento" para registrar o primeiro vencimento.';
  } else if (cont.vencido > 0) {
    titulo = plural(cont.vencido, 'documento vencido', 'documentos vencidos');
    texto = `E mais ${cont['7']} vencendo nos próximos 7 dias. Priorize a renovação.`;
  } else if (cont['7'] > 0) {
    titulo = `${cont['7']} vencendo esta semana`;
    texto = 'Nenhum vencido, mas há documentos que precisam de atenção imediata.';
  } else {
    titulo = 'Tudo sob controle';
    texto = 'Nenhum documento vencido ou vencendo nos próximos 7 dias.';
  }
  $('tituloDestaque').textContent = titulo;
  $('textoDestaque').textContent = texto;
  $('totalClientes').textContent = estado.clientes.length;
  $('totalDocs').textContent = docs.length;
  $('subtitulo').textContent = config.escritorio || 'Certificados, certidões, alvarás, procurações e licenças';
}

function mensagemVazia(filtrado) {
  if (!estado.clientes.length) return 'Nenhum dado ainda. Cadastre um cliente, importe uma planilha ou carregue os exemplos.';
  if (!docs.length) return 'Nenhum documento cadastrado ainda.';
  return filtrado;
}

// ---------- Aba: Vencimentos ----------
function celulaAndamento(d) {
  if (modoTV) return `<span class="andamento andamento-${d.andamento}">${ANDAMENTOS[d.andamento].rotulo}</span>`;
  return `<select class="sel-andamento andamento-${d.andamento}" data-id="${esc(d.id)}" aria-label="Andamento">
    ${ORDEM_ANDAMENTO.map(a => `<option value="${a}" ${a === d.andamento ? 'selected' : ''}>${ANDAMENTOS[a].rotulo}</option>`).join('')}
  </select>`;
}

function renderTabela(lista) {
  const porPag = modoTV ? 60 : config.porPagina;
  const totalPag = Math.max(1, Math.ceil(lista.length / porPag));
  if (pagina > totalPag) pagina = totalPag;
  const inicio = (pagina - 1) * porPag;
  const visiveis = lista.slice(inicio, inicio + porPag);

  $('tabelaDocumentos').innerHTML = visiveis.map((d, i) => `
    <tr class="${d.status === 'vencido' ? 'linha-vencida' : ''}" style="animation-delay:${Math.min(i, 15) * 20}ms">
      <td class="td">
        <button class="link-cliente" data-acao="ficha-cli" data-id="${esc(d.clienteId)}" title="Abrir ficha do cliente">
          ${avatarHTML(d.cliente.nome)}
          <span class="text-left">
            <span class="block font-semibold">${esc(d.cliente.nome)}</span>
            <span class="block text-xs texto-suave">${esc(d.cliente.documento) || '—'}</span>
          </span>
        </button>
      </td>
      <td class="td">
        <div class="flex items-center gap-1.5">
          <span class="chip" ${d.observacoes ? `title="${esc(d.observacoes)}"` : ''}>${pontoTipo(d.tipo)}${esc(d.tipo)}</span>
          ${d.link ? `<a class="acao acao-mini" href="${esc(d.link)}" target="_blank" rel="noopener noreferrer" title="Abrir arquivo">${ICONES.link}</a>` : ''}
        </div>
        ${d.numero ? `<div class="text-xs texto-suave mt-1">Nº ${esc(d.numero)}</div>` : ''}
      </td>
      <td class="td texto-suave">${formatarData(d.vencimento)}</td>
      <td class="td">
        <div class="prazo">
          <div class="prazo-barra"><span class="bg-st-${d.status}" style="width:${urgencia(d.dias)}%"></span></div>
          <span class="prazo-texto txt-${d.status}">${textoDias(d.dias)}</span>
        </div>
      </td>
      <td class="td">${seloStatus(d.status)}</td>
      <td class="td">${celulaAndamento(d)}</td>
      <td class="td texto-suave">${esc(d.responsavel) || '—'}</td>
      <td class="td col-acoes">
        <div class="flex justify-end gap-0.5">
          <button class="acao acao-sucesso" data-acao="renovar-doc" data-id="${esc(d.id)}" title="Registrar renovação" aria-label="Renovar">${ICONES.renovar}</button>
          <button class="acao" data-acao="avisar-doc" data-id="${esc(d.id)}" title="Avisar cliente" aria-label="Avisar cliente">${ICONES.mensagem}</button>
          <button class="acao" data-acao="editar-doc" data-id="${esc(d.id)}" title="Editar" aria-label="Editar">${ICONES.editar}</button>
          <button class="acao acao-perigo" data-acao="excluir-doc" data-id="${esc(d.id)}" title="Excluir" aria-label="Excluir">${ICONES.excluir}</button>
        </div>
      </td>
    </tr>
  `).join('');

  $('semResultados').classList.toggle('hidden', lista.length > 0);
  $('textoVazio').textContent = mensagemVazia(modoTV
    ? 'Nenhum documento vencido ou vencendo nos próximos 30 dias.'
    : 'Nenhum documento encontrado com esses filtros.');

  // Setas de ordenação
  document.querySelectorAll('.ordenar').forEach(b => {
    const ativo = b.dataset.ordem === ordem.campo;
    b.classList.toggle('ord-ativa', ativo);
    b.classList.toggle('ord-desc', ativo && ordem.dir === -1);
    b.closest('th').setAttribute('aria-sort', ativo ? (ordem.dir === 1 ? 'ascending' : 'descending') : 'none');
  });

  renderPaginacao(lista.length, porPag, totalPag, inicio);
}

function renderPaginacao(total, porPag, totalPag, inicio) {
  const el = $('paginacao');
  if (total <= porPag || modoTV) { el.innerHTML = ''; el.classList.add('hidden'); return; }
  el.classList.remove('hidden');

  // Páginas exibidas: primeira, última e vizinhas da atual
  const paginas = [];
  for (let p = 1; p <= totalPag; p++) {
    if (p === 1 || p === totalPag || Math.abs(p - pagina) <= 1) paginas.push(p);
    else if (paginas[paginas.length - 1] !== '…') paginas.push('…');
  }
  el.innerHTML = `
    <span class="texto-suave text-sm">Mostrando ${inicio + 1}–${Math.min(inicio + porPag, total)} de ${total}</span>
    <div class="flex items-center gap-1">
      <button class="pag-btn" data-pagina="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
      ${paginas.map(p => p === '…'
        ? '<span class="px-1 texto-suave">…</span>'
        : `<button class="pag-btn ${p === pagina ? 'pag-atual' : ''}" data-pagina="${p}">${p}</button>`).join('')}
      <button class="pag-btn" data-pagina="${pagina + 1}" ${pagina === totalPag ? 'disabled' : ''} aria-label="Próxima página">›</button>
    </div>`;
}

// ---------- Aba: Por cliente ----------
function renderCards(lista) {
  const porCliente = new Map();
  lista.forEach(d => {
    if (!porCliente.has(d.clienteId)) porCliente.set(d.clienteId, []);
    porCliente.get(d.clienteId).push(d);
  });

  const cards = [...porCliente.values()].map(itens => ({
    itens: itens.sort((a, b) => a.dias - b.dias),
    pior: piorStatus(itens),
    cliente: itens[0].cliente,
  })).sort((a, b) => STATUS[b.pior].peso - STATUS[a.pior].peso || a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR'));

  if (!cards.length) {
    $('painelClientes').innerHTML = `<div class="painel vazio col-span-full">${mensagemVazia('Nenhum cliente com documentos para esses filtros.')}</div>`;
    return;
  }

  $('painelClientes').innerHTML = cards.map(({ itens, pior, cliente }, i) => `
    <article class="card-cliente st-${pior}" style="animation-delay:${Math.min(i, 12) * 40}ms">
      <div class="flex items-start justify-between gap-2 mb-4">
        <button class="link-cliente min-w-0" data-acao="ficha-cli" data-id="${esc(cliente.id)}" title="Abrir ficha">
          ${avatarHTML(cliente.nome)}
          <span class="min-w-0 text-left">
            <span class="block font-semibold leading-tight truncate">${esc(cliente.nome)}</span>
            <span class="block text-xs texto-suave">${esc(cliente.documento) || '—'}</span>
          </span>
        </button>
        ${seloStatus(pior)}
      </div>
      <ul class="space-y-2">
        ${itens.map(d => `
          <li class="item-doc item-clicavel" data-acao="editar-doc" data-id="${esc(d.id)}" title="Editar documento">
            <span class="flex items-center gap-2 min-w-0">${pontoTipo(d.tipo)}<span class="truncate">${esc(d.tipo)}</span></span>
            <span class="flex items-center gap-1.5 shrink-0">
              <span class="selo selo-${d.status}">${textoDias(d.dias)}</span>
              <button class="acao acao-mini acao-sucesso" data-acao="renovar-doc" data-id="${esc(d.id)}" title="Registrar renovação" aria-label="Renovar">${ICONES.renovar}</button>
            </span>
          </li>`).join('')}
      </ul>
      <div class="flex items-center justify-between mt-3">
        <button class="link text-xs" data-acao="novo-doc-cli" data-id="${esc(cliente.id)}">+ Adicionar documento</button>
        <button class="link text-xs flex items-center gap-1" data-acao="avisar-cli" data-id="${esc(cliente.id)}">${ICONES.mensagem} Avisar cliente</button>
      </div>
    </article>
  `).join('');
}

// ---------- Aba: Clientes (cadastro) ----------
function renderCadastro() {
  const termo = elBusca.value.trim();
  const lista = estado.clientes
    .filter(c => clienteCombina(c, termo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  $('tabelaCadastro').innerHTML = lista.map((c, i) => {
    const seus = docs.filter(d => d.clienteId === c.id);
    const contato = [c.contato, c.email, c.telefone].filter(Boolean);
    return `
      <tr style="animation-delay:${Math.min(i, 15) * 20}ms">
        <td class="td">
          <button class="link-cliente" data-acao="ficha-cli" data-id="${esc(c.id)}" title="Abrir ficha">
            ${avatarHTML(c.nome)}
            <span class="text-left">
              <span class="block font-semibold">${esc(c.nome)}</span>
              <span class="block text-xs texto-suave">${esc(c.documento) || 'Sem documento'}</span>
            </span>
          </button>
        </td>
        <td class="td texto-suave">${esc(c.regime) || '—'}</td>
        <td class="td texto-suave text-xs leading-relaxed">${contato.length ? contato.map(esc).join('<br>') : '—'}</td>
        <td class="td">
          <div class="flex items-center gap-2">
            <span class="font-semibold">${seus.length}</span>
            ${seus.length ? seloStatus(piorStatus(seus)) : '<span class="texto-suave text-xs">nenhum</span>'}
          </div>
        </td>
        <td class="td">
          <div class="flex justify-end gap-0.5">
            <button class="acao" data-acao="avisar-cli" data-id="${esc(c.id)}" title="Avisar cliente" aria-label="Avisar cliente">${ICONES.mensagem}</button>
            <button class="acao" data-acao="novo-doc-cli" data-id="${esc(c.id)}" title="Adicionar documento" aria-label="Adicionar documento">${ICONES.mais}</button>
            <button class="acao" data-acao="editar-cli" data-id="${esc(c.id)}" title="Editar cliente" aria-label="Editar">${ICONES.editar}</button>
            <button class="acao acao-perigo" data-acao="excluir-cli" data-id="${esc(c.id)}" title="Excluir cliente" aria-label="Excluir">${ICONES.excluir}</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  const vazio = $('cadastroVazio');
  vazio.classList.toggle('hidden', lista.length > 0);
  vazio.textContent = estado.clientes.length
    ? 'Nenhum cliente encontrado com essa busca.'
    : 'Nenhum cliente cadastrado ainda. Clique em "Cliente" no topo para começar.';
  return lista.length;
}

// ---------- Aba: Calendário + agenda ----------
function itemAgenda(d) {
  return `
    <div class="agenda-item item-clicavel" data-acao="editar-doc" data-id="${esc(d.id)}" title="Editar documento">
      <div class="min-w-0">
        <p class="flex items-center gap-2 text-sm font-semibold">${pontoTipo(d.tipo)}<span class="truncate">${esc(d.tipo)}</span></p>
        <p class="text-xs texto-suave truncate">${esc(d.cliente.nome)}</p>
        ${d.andamento !== 'pendente' ? `<span class="andamento andamento-${d.andamento} mt-1">${ANDAMENTOS[d.andamento].rotulo}</span>` : ''}
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <span class="selo selo-${d.status}">${textoDias(d.dias)}</span>
        <button class="acao acao-mini acao-sucesso" data-acao="renovar-doc" data-id="${esc(d.id)}" title="Registrar renovação" aria-label="Renovar">${ICONES.renovar}</button>
      </div>
    </div>`;
}

function renderCalendario(lista) {
  const ano = calMes.getFullYear();
  const mes = calMes.getMonth();
  $('calTitulo').textContent = maiuscula(calMes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));

  const porDia = new Map();
  lista.forEach(d => {
    if (!porDia.has(d.vencimento)) porDia.set(d.vencimento, []);
    porDia.get(d.vencimento).push(d);
  });

  const primeiro = new Date(ano, mes, 1);
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const celulas = Math.ceil((primeiro.getDay() + diasNoMes) / 7) * 7;
  const inicio = new Date(ano, mes, 1 - primeiro.getDay());
  const hoje = hojeISO();

  let html = '';
  for (let i = 0; i < celulas; i++) {
    const dia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    const iso = paraISO(dia);
    const itens = (porDia.get(iso) || []).sort((a, b) => STATUS[b.status].peso - STATUS[a.status].peso);
    const classes = ['cal-dia',
      dia.getMonth() !== mes && 'fora-mes',
      iso === hoje && 'hoje',
      iso === calDia && 'selecionado',
      itens.length && 'tem-itens'].filter(Boolean).join(' ');
    const rotulo = `${dia.toLocaleDateString('pt-BR')}: ${itens.length ? plural(itens.length, 'vencimento', 'vencimentos') : 'nenhum vencimento'}`;
    html += `
      <button class="${classes}" data-dia="${iso}" aria-label="${rotulo}">
        <span class="cal-num">${dia.getDate()}</span>
        <span class="cal-itens">
          ${itens.slice(0, 3).map(d => `<span class="cal-chip selo-${d.status}" title="${esc(d.tipo)} — ${esc(d.cliente.nome)}"><span class="cal-chip-txt">${esc(d.tipo)}</span></span>`).join('')}
          ${itens.length > 3 ? `<span class="cal-mais">+${itens.length - 3}</span>` : ''}
        </span>
      </button>`;
  }
  $('calGrade').innerHTML = html;

  // Agenda lateral
  const agenda = $('agendaLista');
  $('agendaVoltar').classList.toggle('hidden', !calDia);
  if (calDia) {
    $('agendaTitulo').textContent = `Vencimentos em ${formatarData(calDia)}`;
    const itens = porDia.get(calDia) || [];
    agenda.innerHTML = itens.length
      ? `<div class="space-y-2">${itens.map(itemAgenda).join('')}</div>`
      : '<p class="texto-suave text-sm">Nenhum vencimento neste dia.</p>';
    return;
  }

  $('agendaTitulo').textContent = 'Agenda da semana';
  const grupos = [];
  const vencidos = lista.filter(d => d.dias < 0).sort((a, b) => a.dias - b.dias);
  if (vencidos.length) grupos.push({ titulo: 'Vencidos', itens: vencidos, alerta: true });
  for (let n = 0; n <= 7; n++) {
    const iso = somarDias(hoje, n);
    const itens = porDia.get(iso) || [];
    if (!itens.length) continue;
    const titulo = n === 0 ? 'Hoje' : n === 1 ? 'Amanhã'
      : maiuscula(deISO(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }));
    grupos.push({ titulo, itens });
  }
  agenda.innerHTML = grupos.length
    ? grupos.map(g => `
        <div>
          <p class="agenda-grupo ${g.alerta ? 'txt-vencido' : ''}">${esc(g.titulo)} <span class="texto-suave font-normal">(${g.itens.length})</span></p>
          <div class="space-y-2">${g.itens.map(itemAgenda).join('')}</div>
        </div>`).join('')
    : `<p class="texto-suave text-sm">${mensagemVazia('Nada vencido nem vencendo nos próximos 7 dias.')}</p>`;
}

// ---------- Aba: Indicadores ----------
function barraHorizontal(rotuloHTML, valor, max, cor, detalhe = '', dica = '') {
  const pct = max ? Math.max(2, (valor / max) * 100) : 0;
  return `
    <div class="barra-h" title="${esc(dica)}">
      <div class="barra-h-rotulo">${rotuloHTML}</div>
      <div class="barra-h-trilho"><span style="width:${pct}%;background:${cor}"></span></div>
      <div class="barra-h-valor">${valor}${detalhe ? `<span class="texto-suave font-normal"> ${detalhe}</span>` : ''}</div>
    </div>`;
}

function renderIndicadores(lista) {
  const vazio = `<p class="texto-suave text-sm">${mensagemVazia('Nenhum documento para os filtros atuais.')}</p>`;

  // Andamento dos documentos que pedem atenção (vencidos ou até 30 dias)
  const atencao = lista.filter(d => d.status !== 'ok');
  $('indAndamento').innerHTML = ORDEM_ANDAMENTO.map(a => {
    const n = atencao.filter(d => d.andamento === a).length;
    return `
      <div class="painel p-4">
        <span class="andamento andamento-${a}">${ANDAMENTOS[a].rotulo}</span>
        <p class="text-3xl font-extrabold mt-2">${n}</p>
        <p class="texto-suave text-xs">dos ${atencao.length} que vencem em até 30 dias ou já venceram</p>
      </div>`;
  }).join('');

  // Vencimentos por mês (vencidos + próximos 12 meses)
  const colunas = [{ rotulo: 'Vencidos', dica: 'Já vencidos', n: lista.filter(d => d.dias < 0).length, cor: 'var(--vencido)' }];
  for (let i = 0; i < 12; i++) {
    const ref = new Date(HOJE.getFullYear(), HOJE.getMonth() + i, 1);
    const chave = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
    const n = lista.filter(d => d.dias >= 0 && d.vencimento.startsWith(chave)).length;
    colunas.push({
      rotulo: ref.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      sub: i === 0 || ref.getMonth() === 0 ? String(ref.getFullYear()) : '',
      dica: ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      n, cor: 'var(--primaria)',
    });
  }
  const maxMes = Math.max(...colunas.map(c => c.n));
  $('graficoMeses').innerHTML = lista.length ? colunas.map(c => `
    <div class="coluna" title="${esc(c.dica)}: ${plural(c.n, 'documento', 'documentos')}">
      <span class="coluna-valor">${c.n || ''}</span>
      <div class="coluna-trilho"><span style="height:${maxMes ? (c.n / maxMes) * 100 : 0}%;background:${c.cor}"></span></div>
      <span class="coluna-rotulo">${esc(c.rotulo)}</span>
      <span class="coluna-sub">${c.sub || '&nbsp;'}</span>
    </div>`).join('') : vazio;

  // Por tipo
  const porTipo = TIPOS.map(t => ({ t, n: lista.filter(d => d.tipo === t).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  const maxTipo = Math.max(0, ...porTipo.map(x => x.n));
  $('graficoTipos').innerHTML = porTipo.length
    ? porTipo.map(x => barraHorizontal(`${pontoTipo(x.t)}${esc(x.t)}`, x.n, maxTipo, corTipo(x.t), '', `${x.t}: ${x.n}`)).join('')
    : vazio;

  // Por responsável
  const mapaResp = new Map();
  lista.forEach(d => {
    const nome = d.responsavel || '(sem responsável)';
    if (!mapaResp.has(nome)) mapaResp.set(nome, { total: 0, urgentes: 0 });
    const r = mapaResp.get(nome);
    r.total++;
    if (d.status === 'vencido' || d.status === '7') r.urgentes++;
  });
  const porResp = [...mapaResp.entries()].sort((a, b) => b[1].urgentes - a[1].urgentes || b[1].total - a[1].total);
  const maxResp = Math.max(0, ...porResp.map(([, r]) => r.total));
  $('graficoResponsaveis').innerHTML = porResp.length
    ? porResp.map(([nome, r]) => barraHorizontal(
        esc(nome), r.total, maxResp, 'var(--primaria)',
        r.urgentes ? `· <span class="txt-vencido font-semibold">${r.urgentes} urgente${r.urgentes > 1 ? 's' : ''}</span>` : '',
        `${nome}: ${r.total} documentos, ${r.urgentes} urgentes`)).join('')
    : vazio;
}

// ---------- Atualizar tudo ----------
function atualizar() {
  atualizarHoje();
  montarDocs();
  atualizarOpcoesResponsavel();
  const lista = listaAtual();
  renderResumo();

  if (abaAtual === 'documentos') renderTabela(lista);
  else if (abaAtual === 'clientes') renderCards(lista);
  else if (abaAtual === 'calendario') renderCalendario(lista);
  else if (abaAtual === 'indicadores') renderIndicadores(lista);

  if (abaAtual === 'cadastro') {
    const n = renderCadastro();
    $('contador').textContent = estado.clientes.length ? `${n} de ${plural(estado.clientes.length, 'cliente', 'clientes')}` : '';
  } else {
    $('contador').textContent = docs.length ? `${lista.length} de ${plural(docs.length, 'documento', 'documentos')}` : '';
  }

  if ($('dlgFicha').open) renderFicha();
}

function trocarAba(nome) {
  abaAtual = nome;
  document.querySelectorAll('.aba').forEach(a => a.classList.toggle('aba-ativa', a.dataset.aba === nome));
  const paineis = { documentos: 'painelDocumentos', clientes: 'painelClientes', cadastro: 'painelCadastro', calendario: 'painelCalendario', indicadores: 'painelIndicadores' };
  Object.entries(paineis).forEach(([aba, id]) => $(id).classList.toggle('hidden', aba !== nome));
  try { localStorage.setItem('painelVencimentos:aba', nome); } catch (e) {}
  atualizar();
}
