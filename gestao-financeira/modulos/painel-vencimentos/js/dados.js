/* =========================================
   dados.js — estado, armazenamento, configurações,
   exemplos, backup, importação/exportação de planilhas
   ========================================= */

// ---------- Chaves no localStorage ----------
const CHAVE = 'painelVencimentos:v1';
const CHAVE_CONFIG = 'painelVencimentos:config';
const CHAVE_NOTIFICACAO = 'painelVencimentos:ultimaNotificacao';

// ---------- Configurações ----------
// Validade padrão (em dias) usada para sugerir o próximo vencimento.
// Varia por estado/município — o usuário pode ajustar em Configurações.
const VALIDADES_PADRAO = {
  'Certificado A1': 365,
  'CND Federal':    180,
  'CND Estadual':   90,
  'CND Municipal':  90,
  'CRF FGTS':       30,
  'Alvará':         365,
  'Procuração':     365,
  'Licença':        365,
};

const MENSAGEM_PADRAO =
`{saudacao}

Passando para avisar sobre os vencimentos da {cliente}:
{itens}

Podemos providenciar a renovação? Qualquer dúvida, estamos à disposição.

{escritorio}`;

const CONFIG_PADRAO = {
  escritorio: '',
  porPagina: 25,
  validades: { ...VALIDADES_PADRAO },
  mensagem: MENSAGEM_PADRAO,
  notificacoes: false,
};

let config = normalizarConfig({});

function normalizarConfig(c) {
  c = c && typeof c === 'object' ? c : {};
  const validades = {};
  TIPOS.forEach(t => {
    const v = Number(c.validades?.[t]);
    validades[t] = Number.isInteger(v) && v > 0 && v <= 3650 ? v : VALIDADES_PADRAO[t];
  });
  return {
    escritorio: String(c.escritorio ?? '').slice(0, 80),
    porPagina: [10, 25, 50, 100].includes(Number(c.porPagina)) ? Number(c.porPagina) : CONFIG_PADRAO.porPagina,
    validades,
    mensagem: typeof c.mensagem === 'string' && c.mensagem.trim() ? c.mensagem.slice(0, 2000) : MENSAGEM_PADRAO,
    notificacoes: c.notificacoes === true,
  };
}

function carregarConfig() {
  try {
    const bruto = localStorage.getItem(CHAVE_CONFIG);
    if (bruto) config = normalizarConfig(JSON.parse(bruto));
  } catch (e) {
    console.warn('Configurações inválidas, usando o padrão.', e);
  }
}
function salvarConfig() {
  try { localStorage.setItem(CHAVE_CONFIG, JSON.stringify(config)); } catch (e) {
    toast('Não foi possível salvar as configurações.', 'erro');
  }
}

// ---------- Estado ----------
let estado = { clientes: [], documentos: [] };
let docs = []; // documentos "enriquecidos": cliente, dias, status

const txt = v => (v == null ? '' : String(v));

function normalizarCliente(c) {
  return {
    id: txt(c.id),
    nome: txt(c.nome).slice(0, 150),
    documento: txt(c.documento),
    regime: txt(c.regime),
    contato: txt(c.contato),
    email: txt(c.email),
    telefone: txt(c.telefone),
  };
}

function normalizarDocumento(d) {
  const historico = Array.isArray(d.historico) ? d.historico : [];
  return {
    id: txt(d.id),
    clienteId: txt(d.clienteId),
    tipo: txt(d.tipo),
    numero: txt(d.numero),
    emissao: isoValido(d.emissao) ? d.emissao : '',
    vencimento: d.vencimento,
    responsavel: txt(d.responsavel),
    observacoes: txt(d.observacoes),
    link: linkSeguro(d.link),
    andamento: ANDAMENTOS[d.andamento] ? d.andamento : 'pendente',
    criadoEm: isoValido(d.criadoEm) ? d.criadoEm : '',
    historico: historico
      .filter(h => h && isoValido(h.data) && isoValido(h.vencimentoAnterior))
      .map(h => ({
        data: h.data,
        vencimentoAnterior: h.vencimentoAnterior,
        novoVencimento: isoValido(h.novoVencimento) ? h.novoVencimento : '',
        emissaoAnterior: isoValido(h.emissaoAnterior) ? h.emissaoAnterior : '',
        numeroAnterior: txt(h.numeroAnterior),
        obs: txt(h.obs),
      })),
  };
}

// Recebe dados de qualquer origem (localStorage, backup) e devolve só o que é válido
function normalizarEstado(dados) {
  const clientes = (Array.isArray(dados?.clientes) ? dados.clientes : [])
    .filter(c => c && c.id && c.nome)
    .map(normalizarCliente);
  const ids = new Set(clientes.map(c => c.id));
  const documentos = (Array.isArray(dados?.documentos) ? dados.documentos : [])
    .filter(d => d && d.id && ids.has(String(d.clienteId)) && d.tipo && isoValido(d.vencimento))
    .map(normalizarDocumento);
  return { clientes, documentos };
}

function carregarDados() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) estado = normalizarEstado(JSON.parse(bruto));
  } catch (e) {
    console.warn('Não foi possível ler os dados salvos.', e);
  }
}

function salvarDados() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
    return true;
  } catch (e) {
    toast('Não foi possível salvar no navegador (espaço cheio?). Exporte um backup.', 'erro');
    return false;
  }
}

function salvarEAtualizar() {
  salvarDados();
  atualizar();
}

function montarDocs() {
  const mapa = new Map(estado.clientes.map(c => [c.id, c]));
  docs = estado.documentos
    .filter(d => mapa.has(d.clienteId) && isoValido(d.vencimento))
    .map(d => {
      const dias = diasAte(d.vencimento);
      return { ...d, cliente: mapa.get(d.clienteId), dias, status: classificar(dias) };
    });
}

// ---------- Desfazer ----------
// Guarda uma cópia do estado antes de uma ação e oferece "Desfazer" no aviso
function comDesfazer(mensagem, acao) {
  const antes = JSON.stringify(estado);
  acao();
  salvarEAtualizar();
  toast(mensagem, 'ok', {
    rotulo: 'Desfazer',
    fn: () => {
      estado = JSON.parse(antes);
      salvarEAtualizar();
      toast('Ação desfeita.');
    },
  });
}

// ---------- Dados de exemplo ----------
function dadosExemplo() {
  const h = n => somarDias(hojeISO(), n);
  const cli = (n, nome, base, regime, contato, email, telefone) => ({
    id: 'ex-c' + n, nome, documento: formatarDocumento(completarCNPJ(base)), regime, contato, email, telefone,
  });
  const clientes = [
    cli(1, 'Alfa Comércio Ltda',         '123456780001', 'Simples Nacional', 'Ana',   'contato@alfacomercio.com.br', '(48) 99911-2233'),
    cli(2, 'Beta Indústria Metalúrgica', '234567890001', 'Lucro Presumido',  'Bruno', 'fiscal@betametal.com.br',     '(48) 3622-1100'),
    cli(3, 'Gama Serviços Médicos',      '345678900001', 'Lucro Presumido',  'Carla', 'adm@gamasaude.com.br',        '(48) 99822-3344'),
    cli(4, 'Delta Imóveis',              '456789010001', 'Lucro Real',       'Diego', 'financeiro@deltaimoveis.com', '(48) 3626-4455'),
    cli(5, 'Épsilon Transportes',        '567890120001', 'Simples Nacional', 'Elisa', 'elisa@epsilonlog.com.br',     '(48) 99733-5566'),
    cli(6, 'Zeta Alimentos ME',          '678901230001', 'MEI',              'Fábio', 'zetaalimentos@gmail.com',     '(48) 99644-6677'),
  ];
  const doc = (n, c, tipo, dias, responsavel, extra = {}) => ({
    id: 'ex-d' + n, clienteId: 'ex-c' + c, tipo, numero: '', emissao: '', vencimento: h(dias),
    responsavel, observacoes: '', link: '', andamento: 'pendente', criadoEm: h(-200), historico: [], ...extra,
  });
  const documentos = [
    doc(1, 1, 'Certificado A1', 5, 'Mauricio', { andamento: 'renovacao', emissao: h(-360) }),
    doc(2, 1, 'CND Federal', 22, 'Fiscal', {
      emissao: h(-158),
      historico: [{ data: h(-158), vencimentoAnterior: h(-160), novoVencimento: h(22), emissaoAnterior: h(-340), numeroAnterior: '', obs: 'Emitida no e-CAC' }],
    }),
    doc(3, 1, 'CRF FGTS', 12, 'DP'),
    doc(4, 2, 'Certificado A1', -3, 'Mauricio', { andamento: 'aguardando', observacoes: 'Cliente vai agendar a validação' }),
    doc(5, 2, 'CND Estadual', 28, 'Fiscal'),
    doc(6, 2, 'Licença', 90, 'Legal', { numero: 'LAO 1234/2025' }),
    doc(7, 3, 'Alvará', 14, 'Legal'),
    doc(8, 3, 'CND Municipal', 45, 'Fiscal'),
    doc(9, 3, 'Procuração', 7, 'Legal'),
    doc(10, 4, 'Certificado A1', 120, 'Mauricio', {
      emissao: h(-245),
      historico: [{ data: h(-245), vencimentoAnterior: h(-240), novoVencimento: h(120), emissaoAnterior: h(-605), numeroAnterior: '', obs: '' }],
    }),
    doc(11, 4, 'CND Federal', 60, 'Fiscal'),
    doc(12, 5, 'CRF FGTS', 2, 'DP'),
    doc(13, 5, 'Alvará', -10, 'Legal', { andamento: 'renovacao' }),
    doc(14, 5, 'Licença', 19, 'Legal'),
    doc(15, 6, 'CND Estadual', 9, 'Fiscal'),
    doc(16, 6, 'Procuração', 200, 'Legal'),
  ];
  return { clientes, documentos };
}

function carregarExemplos() {
  if (estado.clientes.length && !confirm('Isso vai substituir os dados atuais pelos exemplos. Continuar?')) return;
  estado = normalizarEstado(dadosExemplo());
  limparFiltros();
  salvarEAtualizar();
  toast('Exemplos carregados.');
}

function limparTudo() {
  if (!estado.clientes.length && !estado.documentos.length) { toast('O painel já está vazio.', 'aviso'); return; }
  if (!confirm('Remover TODOS os clientes e documentos?')) return;
  limparFiltros();
  comDesfazer('Todos os dados foram removidos.', () => { estado = { clientes: [], documentos: [] }; });
}

// ---------- Backup em JSON ----------
function exportarBackup() {
  if (!estado.clientes.length) { toast('Não há dados para exportar.', 'aviso'); return; }
  const backup = { app: 'painel-vencimentos', versao: 2, exportadoEm: new Date().toISOString(), config, ...estado };
  baixarArquivo(JSON.stringify(backup, null, 2), `backup-vencimentos-${hojeISO()}.json`, 'application/json');
  toast('Backup exportado.');
}

async function restaurarBackup(arquivo) {
  let dados;
  try {
    dados = JSON.parse(await arquivo.text());
  } catch (e) {
    toast('Arquivo de backup inválido.', 'erro');
    return;
  }
  if (!dados || !Array.isArray(dados.clientes) || !Array.isArray(dados.documentos)) {
    toast('Esse arquivo não é um backup do painel.', 'erro');
    return;
  }
  const novo = normalizarEstado(dados);
  const resumo = `${plural(novo.clientes.length, 'cliente', 'clientes')} e ${plural(novo.documentos.length, 'documento', 'documentos')}`;
  if (estado.clientes.length && !confirm(`Substituir os dados atuais por ${resumo} do backup?`)) return;

  if (dados.config) { config = normalizarConfig(dados.config); salvarConfig(); }
  limparFiltros();
  comDesfazer(`Backup restaurado: ${resumo}.`, () => { estado = novo; });
}

// ---------- Planilhas (SheetJS) ----------
function bibliotecaPlanilhaOk() {
  if (typeof XLSX !== 'undefined') return true;
  toast('A biblioteca de planilhas não carregou. Verifique a conexão com a internet.', 'erro');
  return false;
}

// Nomes de coluna aceitos na importação (sem acento, minúsculos)
const COLUNAS = {
  cliente:     ['cliente', 'nome', 'razao social', 'empresa', 'nome do cliente'],
  documento:   ['cnpj/cpf', 'cpf/cnpj', 'cnpj', 'cpf', 'cnpj ou cpf', 'documento do cliente'],
  tipo:        ['tipo', 'tipo de documento', 'documento'],
  vencimento:  ['vencimento', 'validade', 'data de vencimento', 'vence em', 'data vencimento'],
  numero:      ['numero', 'n', 'no', 'n.', 'n°', 'nº', 'identificacao'],
  emissao:     ['emissao', 'data de emissao', 'data emissao'],
  responsavel: ['responsavel'],
  observacoes: ['observacoes', 'observacao', 'obs'],
  link:        ['link', 'arquivo', 'url', 'anexo'],
  regime:      ['regime', 'regime tributario'],
  email:       ['email', 'e-mail'],
  telefone:    ['telefone', 'fone', 'celular', 'whatsapp'],
  contato:     ['contato', 'pessoa de contato'],
};

const normalizarCabecalho = h => semAcento(h).toLowerCase().trim().replace(/\s+/g, ' ');

function normalizarTipo(valor) {
  const t = semAcento(valor).toLowerCase();
  if (!t.trim()) return null;
  if (/certific|\ba1\b|e-?cnpj|e-?cpf/.test(t)) return 'Certificado A1';
  if (/fgts|\bcrf\b/.test(t)) return 'CRF FGTS';
  if (/federal|receita|pgfn/.test(t)) return 'CND Federal';
  if (/estadual|sefaz|\bsef\b/.test(t)) return 'CND Estadual';
  if (/municipal|prefeitura/.test(t)) return 'CND Municipal';
  if (/alvara/.test(t)) return 'Alvará';
  if (/procura/.test(t)) return 'Procuração';
  if (/licen/.test(t)) return 'Licença';
  return null;
}

function normalizarRegime(valor) {
  const t = semAcento(valor).toLowerCase().trim();
  if (!t) return '';
  return REGIMES.find(r => semAcento(r).toLowerCase() === t) ||
    (/simples/.test(t) ? 'Simples Nacional' : /presumido/.test(t) ? 'Lucro Presumido' : /real/.test(t) ? 'Lucro Real' : /\bmei\b/.test(t) ? 'MEI' : 'Outro');
}

function dataDeAMD(a, m, d) {
  const dt = new Date(a, m - 1, d);
  if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return paraISO(dt);
}

// Retorna "AAAA-MM-DD", "" (vazio) ou null (inválida)
function lerData(valor) {
  if (valor === '' || valor == null) return '';
  if (typeof valor === 'number') {
    const p = XLSX.SSF.parse_date_code(valor);
    return p ? dataDeAMD(p.y, p.m, p.d) : null;
  }
  if (valor instanceof Date) return paraISO(valor);
  const s = String(valor).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return dataDeAMD(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/))) {
    let ano = +m[3];
    if (ano < 100) ano += 2000;
    return dataDeAMD(ano, +m[2], +m[1]);
  }
  return null;
}

let importPendente = null;

async function lerPlanilha(arquivo) {
  if (!bibliotecaPlanilhaOk()) return;
  try {
    const conteudo = await arquivo.arrayBuffer();
    // raw: true evita que o CSV interprete "10/12" como data americana
    const pasta = XLSX.read(conteudo, { type: 'array', raw: true });
    const aba = pasta.Sheets[pasta.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(aba, { raw: true, defval: '' });
    importPendente = analisarLinhas(linhas);
    mostrarResumoImportacao(importPendente, arquivo.name);
  } catch (e) {
    console.error(e);
    toast('Não foi possível ler o arquivo. Use .xlsx, .xls ou .csv.', 'erro');
  }
}

function analisarLinhas(linhas) {
  const res = { novosClientes: [], novosDocs: [], erros: [], duplicados: 0, linhasLidas: 0, faltaColuna: null };
  if (!linhas.length) { res.faltaColuna = 'A planilha está vazia.'; return res; }

  const cabecalhos = Object.keys(linhas[0]);
  const mapa = {};
  for (const [campo, apelidos] of Object.entries(COLUNAS)) {
    const h = cabecalhos.find(h => apelidos.includes(normalizarCabecalho(h)));
    if (h) mapa[campo] = h;
  }
  if (!mapa.cliente && !mapa.documento) { res.faltaColuna = 'Não encontrei a coluna "Cliente" nem "CNPJ/CPF".'; return res; }
  if (!mapa.tipo) { res.faltaColuna = 'Não encontrei a coluna "Tipo".'; return res; }
  if (!mapa.vencimento) { res.faltaColuna = 'Não encontrei a coluna "Vencimento".'; return res; }

  const chaveNome = n => semAcento(n).toLowerCase().trim().replace(/\s+/g, ' ');
  const porDocumento = new Map(estado.clientes.filter(c => soDigitos(c.documento)).map(c => [soDigitos(c.documento), c]));
  const porNome = new Map(estado.clientes.map(c => [chaveNome(c.nome), c]));
  const existentes = new Set(estado.documentos.map(d => `${d.clienteId}|${d.tipo}|${d.vencimento}`));

  linhas.forEach((linha, i) => {
    const numLinha = i + 2;
    if (Object.values(linha).every(v => String(v).trim() === '')) return;
    res.linhasLidas++;

    const texto = campo => mapa[campo] ? String(linha[mapa[campo]] ?? '').trim() : '';
    const bruto = campo => mapa[campo] ? linha[mapa[campo]] : '';

    const nome = texto('cliente').replace(/\s+/g, ' ');
    const dig = soDigitos(texto('documento'));
    const tipo = normalizarTipo(texto('tipo'));
    const vencimento = lerData(bruto('vencimento'));
    const emissao = lerData(bruto('emissao'));

    const falhas = [];
    if (!nome && !dig) falhas.push('cliente não informado');
    if (dig && !validarDocumento(dig)) falhas.push(`CNPJ/CPF "${texto('documento')}" inválido`);
    if (!tipo) falhas.push(`tipo "${texto('tipo') || 'vazio'}" não reconhecido`);
    if (!vencimento) falhas.push(vencimento === '' ? 'vencimento vazio' : `vencimento "${texto('vencimento')}" inválido`);
    if (emissao === null) falhas.push(`emissão "${texto('emissao')}" inválida`);
    if (falhas.length) { res.erros.push({ linha: numLinha, msg: falhas.join('; ') }); return; }

    let cliente = (dig && porDocumento.get(dig)) || (nome && porNome.get(chaveNome(nome)));
    if (!cliente) {
      if (!nome) { res.erros.push({ linha: numLinha, msg: 'cliente não cadastrado e sem nome na planilha' }); return; }
      cliente = {
        id: gerarId(), nome,
        documento: dig ? formatarDocumento(dig) : '',
        regime: normalizarRegime(texto('regime')),
        contato: texto('contato'),
        email: texto('email'),
        telefone: formatarTelefone(texto('telefone')),
      };
      res.novosClientes.push(cliente);
      if (dig) porDocumento.set(dig, cliente);
      porNome.set(chaveNome(nome), cliente);
    }

    const chave = `${cliente.id}|${tipo}|${vencimento}`;
    if (existentes.has(chave)) { res.duplicados++; return; }
    existentes.add(chave);

    res.novosDocs.push(normalizarDocumento({
      id: gerarId(), clienteId: cliente.id, tipo,
      numero: texto('numero'), emissao: emissao || '', vencimento,
      responsavel: texto('responsavel'), observacoes: texto('observacoes'), link: texto('link'),
      andamento: 'pendente', criadoEm: hojeISO(), historico: [],
    }));
  });

  return res;
}

function mostrarResumoImportacao(res, nomeArquivo) {
  const caixa = $('importResumo');
  const btn = $('btnConfirmarImport');

  if (res.faltaColuna) {
    caixa.innerHTML = `
      <p class="mb-3"><strong>${esc(nomeArquivo)}</strong></p>
      <div class="aviso-caixa aviso-erro">${esc(res.faltaColuna)}</div>
      <p class="texto-suave text-sm mt-3">Baixe o modelo em <strong>Dados → Baixar modelo de planilha</strong> para ver as colunas esperadas.</p>`;
    btn.disabled = true;
    btn.textContent = 'Importar';
    $('dlgImportar').showModal();
    return;
  }

  const listaErros = res.erros.slice(0, 50).map(e => `<li><strong>Linha ${e.linha}:</strong> ${esc(e.msg)}</li>`).join('');
  caixa.innerHTML = `
    <p class="mb-4"><strong>${esc(nomeArquivo)}</strong> <span class="texto-suave">— ${plural(res.linhasLidas, 'linha lida', 'linhas lidas')}</span></p>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <div class="mini-card"><span class="mini-num txt-ok">${res.novosDocs.length}</span><span class="mini-rot">documentos novos</span></div>
      <div class="mini-card"><span class="mini-num" style="color:var(--primaria)">${res.novosClientes.length}</span><span class="mini-rot">clientes novos</span></div>
      <div class="mini-card"><span class="mini-num texto-suave">${res.duplicados}</span><span class="mini-rot">já existiam</span></div>
      <div class="mini-card"><span class="mini-num txt-vencido">${res.erros.length}</span><span class="mini-rot">com erro</span></div>
    </div>
    ${res.erros.length ? `
      <div class="aviso-caixa aviso-erro">
        <p class="font-semibold mb-2">Linhas ignoradas</p>
        <ul class="lista-erros">${listaErros}</ul>
        ${res.erros.length > 50 ? `<p class="text-xs mt-2">...e mais ${res.erros.length - 50}.</p>` : ''}
      </div>` : ''}
    ${!res.novosDocs.length ? '<p class="texto-suave text-sm mt-3">Nada novo para importar.</p>' : ''}`;
  btn.disabled = !res.novosDocs.length;
  btn.textContent = res.novosDocs.length ? `Importar ${plural(res.novosDocs.length, 'documento', 'documentos')}` : 'Importar';
  $('dlgImportar').showModal();
}

function confirmarImportacao() {
  if (!importPendente || !importPendente.novosDocs.length) return;
  const pendente = importPendente;
  const usados = new Set(pendente.novosDocs.map(d => d.clienteId));
  importPendente = null;
  $('dlgImportar').close();
  limparFiltros();
  comDesfazer(`${plural(pendente.novosDocs.length, 'documento importado', 'documentos importados')}.`, () => {
    estado.clientes.push(...pendente.novosClientes.filter(c => usados.has(c.id)));
    estado.documentos.push(...pendente.novosDocs);
  });
}

function baixarModelo() {
  if (!bibliotecaPlanilhaOk()) return;
  const cnpj = formatarDocumento(completarCNPJ('112223330001'));
  const cabecalho = ['Cliente', 'CNPJ/CPF', 'Tipo', 'Vencimento', 'Número', 'Emissão', 'Responsável', 'Observações', 'Link', 'Regime', 'E-mail', 'Telefone', 'Contato'];
  const exemplo1 = ['Empresa Exemplo Ltda', cnpj, 'Certificado A1', '31/12/2026', '', '01/01/2026', 'Mauricio', 'Renovar com antecedência', '', 'Simples Nacional', 'contato@exemplo.com.br', '(48) 99999-0000', 'Fulano'];
  const exemplo2 = ['Empresa Exemplo Ltda', cnpj, 'CND Federal', '15/11/2026', '', '', 'Fiscal', '', '', '', '', '', ''];

  const aba = XLSX.utils.aoa_to_sheet([cabecalho, exemplo1, exemplo2]);
  aba['!cols'] = [28, 22, 18, 13, 14, 13, 14, 28, 30, 18, 26, 17, 14].map(wch => ({ wch }));

  const instrucoes = XLSX.utils.aoa_to_sheet([
    ['Como preencher'],
    ['• Uma linha por documento. O mesmo cliente pode aparecer em várias linhas.'],
    ['• Obrigatórios: Cliente (ou CNPJ/CPF), Tipo e Vencimento.'],
    ['• Datas no formato dd/mm/aaaa.'],
    ['• Clientes que ainda não existem no painel são criados automaticamente.'],
    ['• Documentos repetidos (mesmo cliente, tipo e vencimento) são ignorados.'],
    [],
    ['Tipos aceitos'],
    ...TIPOS.map(t => [t]),
    [],
    ['Regimes aceitos'],
    ...REGIMES.map(r => [r]),
  ]);
  instrucoes['!cols'] = [{ wch: 80 }];

  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, aba, 'Vencimentos');
  XLSX.utils.book_append_sheet(pasta, instrucoes, 'Instruções');
  XLSX.writeFile(pasta, 'modelo-vencimentos.xlsx');
}

// ---------- Relatório em Excel (respeita filtros e ordenação) ----------
function relatorioExcel() {
  if (!bibliotecaPlanilhaOk()) return;
  const lista = listaAtual();
  if (!lista.length) { toast('Nenhum documento para os filtros atuais.', 'aviso'); return; }

  const linhas = lista.map(d => ({
    'Cliente': d.cliente.nome,
    'CNPJ/CPF': d.cliente.documento,
    'Tipo': d.tipo,
    'Número': d.numero,
    'Emissão': d.emissao ? formatarData(d.emissao) : '',
    'Vencimento': formatarData(d.vencimento),
    'Dias': d.dias,
    'Status': STATUS[d.status].rotulo,
    'Andamento': ANDAMENTOS[d.andamento].rotulo,
    'Responsável': d.responsavel,
    'Contato': d.cliente.contato,
    'E-mail': d.cliente.email,
    'Telefone': d.cliente.telefone,
    'Observações': d.observacoes,
    'Link': d.link,
  }));
  const aba = XLSX.utils.json_to_sheet(linhas);
  aba['!cols'] = [30, 20, 16, 14, 11, 11, 6, 13, 18, 14, 14, 26, 16, 30, 30].map(wch => ({ wch }));
  aba['!autofilter'] = { ref: aba['!ref'] };

  const cont = contarStatus(lista);
  const resumo = XLSX.utils.aoa_to_sheet([
    ['Relatório de vencimentos'],
    ['Escritório', config.escritorio || '—'],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    ['Filtros', descreverFiltros() || 'nenhum'],
    [],
    ['Status', 'Quantidade'],
    ...ORDEM_STATUS.map(st => [STATUS[st].rotulo, cont[st]]),
    ['Total', lista.length],
  ]);
  resumo['!cols'] = [{ wch: 18 }, { wch: 50 }];

  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, aba, 'Vencimentos');
  XLSX.utils.book_append_sheet(pasta, resumo, 'Resumo');
  XLSX.writeFile(pasta, `relatorio-vencimentos-${hojeISO()}.xlsx`);
  toast('Relatório em Excel gerado.');
}

function contarStatus(lista) {
  const cont = { vencido: 0, '7': 0, '15': 0, '30': 0, ok: 0 };
  lista.forEach(d => cont[d.status]++);
  return cont;
}
