/* =========================================
   util.js — funções de apoio usadas pelo painel todo
   (tema, textos, datas, CNPJ/CPF, constantes, notificações)
   ========================================= */

// ---------- Tema claro / escuro ----------
function aplicarTema(tema) {
  const escuro = tema === 'escuro' || tema === 'dark';
  document.documentElement.classList.toggle('dark', escuro);
  // grava no formato da Gestão Financeira, que compartilha a chave "tema"
  try { localStorage.setItem('tema', escuro ? 'dark' : 'light'); } catch (e) {}
}
function alternarTema() {
  aplicarTema(document.documentElement.classList.contains('dark') ? 'claro' : 'escuro');
}

// ---------- Utilidades gerais ----------
const $ = id => document.getElementById(id);

// Escapa texto antes de inserir no HTML (proteção contra conteúdo malicioso em planilhas/backup)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const soDigitos = s => String(s ?? '').replace(/\D/g, '');
const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const gerarId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const maiuscula = s => s.charAt(0).toUpperCase() + s.slice(1); // "quinta-feira, 08 de outubro" → "Quinta-feira, ..."
const dataExtenso = d => maiuscula(d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }));

// Aceita só links http(s) — evita "javascript:" e similares
function linkSeguro(url) {
  const s = String(url ?? '').trim();
  return /^https?:\/\/\S+$/i.test(s) ? s : '';
}

// ---------- Datas (guardadas como texto "AAAA-MM-DD") ----------
function hojeZerado() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
let HOJE = hojeZerado();

// Atualiza HOJE quando vira o dia (painel aberto a noite toda / modo TV)
function atualizarHoje() {
  const h = hojeZerado();
  if (h.getTime() === HOJE.getTime()) return false;
  HOJE = h;
  return true;
}

function paraISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function deISO(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}
const hojeISO = () => paraISO(HOJE);
function somarDias(iso, n) {
  const d = deISO(iso);
  d.setDate(d.getDate() + n);
  return paraISO(d);
}
const isoValido = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(deISO(s));
const formatarData = iso => isoValido(iso) ? deISO(iso).toLocaleDateString('pt-BR') : '—';
const diasAte = iso => Math.round((deISO(iso) - HOJE) / 86400000);

function textoDias(dias) {
  if (dias < 0) return `${Math.abs(dias)}d atrás`;
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  return `${dias} dias`;
}
// Frase completa: "vence em 5 dias (13/10/2026)"
function textoPrazo(iso) {
  const dias = diasAte(iso);
  const data = formatarData(iso);
  if (dias < 0) return `venceu há ${plural(Math.abs(dias), 'dia', 'dias')} (${data})`;
  if (dias === 0) return `vence hoje (${data})`;
  if (dias === 1) return `vence amanhã (${data})`;
  return `vence em ${dias} dias (${data})`;
}

// ---------- CNPJ / CPF / Telefone ----------
function digitoCNPJ(nums) {
  const pesos = nums.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = nums.split('').reduce((a, n, i) => a + Number(n) * pesos[i], 0);
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}
function completarCNPJ(base12) {
  const b = base12 + digitoCNPJ(base12);
  return b + digitoCNPJ(b);
}
function validarCNPJ(v) {
  const c = soDigitos(v);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  return completarCNPJ(c.slice(0, 12)) === c;
}
function validarCPF(v) {
  const c = soDigitos(v);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = n => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
function validarDocumento(v) {
  const d = soDigitos(v);
  if (d.length === 11) return validarCPF(d);
  if (d.length === 14) return validarCNPJ(d);
  return false;
}
function formatarDocumento(v) {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2')
          .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
          .replace(/\.(\d{3})(\d)/, '.$1/$2')
          .replace(/(\d{4})(\d)/, '$1-$2');
}
function formatarTelefone(v) {
  const d = soDigitos(v).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ---------- Tabelas fixas ----------
// A ordem define a cor de cada tipo (variáveis --tipo-1 a --tipo-8 no CSS,
// paleta validada para daltonismo).
const TIPOS = ['Certificado A1', 'CND Federal', 'CND Estadual', 'CND Municipal', 'CRF FGTS', 'Alvará', 'Procuração', 'Licença'];
const corTipo = tipo => {
  const i = TIPOS.indexOf(tipo);
  return i < 0 ? 'var(--suave)' : `var(--tipo-${i + 1})`;
};

const REGIMES = ['Simples Nacional', 'MEI', 'Lucro Presumido', 'Lucro Real', 'Pessoa Física', 'Imune/Isenta', 'Outro'];

const STATUS = {
  vencido: { rotulo: 'Vencido',      peso: 4 },
  '7':     { rotulo: 'Até 7 dias',   peso: 3 },
  '15':    { rotulo: '8 a 15 dias',  peso: 2 },
  '30':    { rotulo: '16 a 30 dias', peso: 1 },
  ok:      { rotulo: 'Em dia',       peso: 0 },
};
// Ordem fixa de exibição (Object.keys colocaria "7", "15", "30" antes de "vencido")
const ORDEM_STATUS = ['vencido', '7', '15', '30', 'ok'];

// Andamento: em que pé está a renovação
const ANDAMENTOS = {
  pendente:   { rotulo: 'Pendente' },
  renovacao:  { rotulo: 'Em renovação' },
  aguardando: { rotulo: 'Aguardando cliente' },
};

function classificar(dias) {
  if (dias < 0)   return 'vencido';
  if (dias <= 7)  return '7';
  if (dias <= 15) return '15';
  if (dias <= 30) return '30';
  return 'ok';
}
const piorStatus = lista => lista.reduce((pior, d) => STATUS[d.status].peso > STATUS[pior].peso ? d.status : pior, 'ok');

// Quanto mais perto do vencimento, mais cheia a barra (janela de 30 dias)
function urgencia(dias) {
  if (dias < 0) return 100;
  return Math.max(4, Math.min(100, ((30 - dias) / 30) * 100));
}

// ---------- Visual ----------
const CORES_AVATAR = ['#2563eb', '#7c3aed', '#db2777', '#0891b2', '#059669', '#d97706', '#4f46e5'];

function iniciais(nome) {
  const partes = String(nome).split(/\s+/).filter(p => p.length > 2);
  return (partes.length ? partes : [String(nome)]).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}
function corAvatar(nome) {
  let h = 0;
  for (const c of String(nome)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES_AVATAR[h % CORES_AVATAR.length];
}
const avatarHTML = (nome, extra = '') =>
  `<span class="avatar ${extra}" style="background:${corAvatar(nome)}">${esc(iniciais(nome))}</span>`;

const seloStatus = st => `<span class="selo selo-${st}">${STATUS[st].rotulo}</span>`;
const pontoTipo = tipo => `<span class="ponto-tipo" style="background:${corTipo(tipo)}"></span>`;

const ICONES = {
  editar:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  excluir:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  mais:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="w-4 h-4"><path d="M12 5v14M5 12h14"/></svg>',
  renovar:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/><path d="m9 12 2 2 4-4"/></svg>',
  mensagem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  link:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  ficha:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 9h3M15 13h3M6 16a3 3 0 0 1 6 0"/></svg>',
};

// ---------- Notificações (toasts) ----------
// acao (opcional): { rotulo: 'Desfazer', fn: () => {...} }
function toast(mensagem, tipo = 'ok', acao = null) {
  const caixa = $('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  const texto = document.createElement('span');
  texto.textContent = mensagem;
  el.appendChild(texto);

  let tempo = 3200;
  if (acao) {
    tempo = 7000;
    const btn = document.createElement('button');
    btn.className = 'toast-acao';
    btn.textContent = acao.rotulo;
    btn.addEventListener('click', () => { el.remove(); acao.fn(); });
    el.appendChild(btn);
  }
  caixa.appendChild(el);
  while (caixa.children.length > 3) caixa.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('saindo');
    setTimeout(() => el.remove(), 300);
  }, tempo);
}

// ---------- Download de arquivo gerado no navegador ----------
function baixarArquivo(conteudo, nome, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
