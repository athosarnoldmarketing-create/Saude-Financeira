// store.js — estado, persistência local e sincronização opcional na nuvem
import { nowISO, todayISO, uid } from './util.js';
import { generateRecurrenceTx } from './finance.js';

const CHAVE = 'sf.estado.v1';
const CHAVE_SYNC = 'sf.sync.v1';

export const COLECOES = ['transactions', 'recurrences', 'categories', 'cards', 'goals', 'invoices'];

const CORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const PALETA = CORES;

function categoriasPadrao() {
  const base = [
    ['Mercado', '🛒', 'saida', 0],
    ['Moradia', '🏠', 'saida', 1],
    ['Contas de casa', '💡', 'saida', 3],
    ['Transporte', '🚗', 'saida', 4],
    ['Saúde', '🩺', 'saida', 2],
    ['Educação', '📚', 'saida', 6],
    ['Alimentação fora', '🍽️', 'saida', 5],
    ['Lazer', '🎬', 'saida', 7],
    ['Vestuário', '👕', 'saida', 4],
    ['Filho(a)', '🧸', 'saida', 5],
    ['Assinaturas', '🔁', 'saida', 6],
    ['Impostos e taxas', '🧾', 'saida', 1],
    ['Dívidas e empréstimos', '🏦', 'saida', 7],
    ['Outros gastos', '📦', 'saida', 3],
    ['Salário', '💼', 'entrada', 2],
    ['Renda extra', '✨', 'entrada', 0],
    ['Benefícios', '🎁', 'entrada', 5],
    ['Investimentos', '📈', 'entrada', 6],
    ['Outras entradas', '➕', 'entrada', 3],
  ];
  return base.map(([nome, icone, tipo, cor]) => ({
    id: uid(), kind: 'cat', nome, icone, tipo, cor: CORES[cor], orcamento: 0,
    updatedAt: nowISO(), deleted: false,
  }));
}

export function estadoInicial() {
  return {
    versao: 1,
    transactions: [],
    recurrences: [],
    categories: categoriasPadrao(),
    cards: [],
    goals: [],
    invoices: [],
    settings: {
      lar: 'Nossa casa',
      pessoas: ['Eu', 'Esposa'],
      saldoInicial: 0,
      saldoInicialData: todayISO(),
      reservaAlvoMeses: 6,
      tema: 'auto',
      horizonteMeses: 3,
      updatedAt: nowISO(),
    },
  };
}

/* ------------------------------------------------------------ persistência */

let estado = null;
const ouvintes = new Set();

export function carregar() {
  try {
    const cru = localStorage.getItem(CHAVE);
    estado = cru ? migrar(JSON.parse(cru)) : estadoInicial();
  } catch (e) {
    console.warn('Falha ao ler dados locais, iniciando do zero.', e);
    estado = estadoInicial();
  }
  return estado;
}

function migrar(s) {
  const base = estadoInicial();
  for (const c of COLECOES) if (!Array.isArray(s[c])) s[c] = [];
  s.settings = { ...base.settings, ...(s.settings || {}) };
  if (!s.categories.length) s.categories = base.categories;
  return s;
}

export const get = () => estado || carregar();

let gravacaoPendente = null;
export function salvar({ imediato = false } = {}) {
  const grava = () => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch (e) {
      console.error('Não foi possível salvar localmente', e);
    }
    gravacaoPendente = null;
  };
  if (imediato) {
    clearTimeout(gravacaoPendente);
    grava();
  } else {
    clearTimeout(gravacaoPendente);
    gravacaoPendente = setTimeout(grava, 200);
  }
}

export function assinar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export function notificar(motivo = 'mudanca') {
  for (const fn of ouvintes) {
    try { fn(estado, motivo); } catch (e) { console.error(e); }
  }
}

/* ------------------------------------------------------------------- CRUD */

function colecaoDe(kind) {
  return { tx: 'transactions', rec: 'recurrences', cat: 'categories', card: 'cards', goal: 'goals', fatura: 'invoices' }[kind];
}

export function upsert(kind, registro, { silencioso = false } = {}) {
  const col = colecaoDe(kind);
  const lista = estado[col];
  const item = { ...registro, kind, updatedAt: nowISO() };
  if (!item.id) item.id = uid();
  if (item.deleted === undefined) item.deleted = false;
  const i = lista.findIndex((x) => x.id === item.id);
  if (i >= 0) lista[i] = { ...lista[i], ...item };
  else lista.push(item);
  salvar();
  if (!silencioso) { notificar(kind); agendarSync(); }
  return item;
}

export function remover(kind, id) {
  const lista = estado[colecaoDe(kind)];
  const i = lista.findIndex((x) => x.id === id);
  if (i >= 0) lista[i] = { ...lista[i], deleted: true, updatedAt: nowISO() };
  salvar();
  notificar(kind);
  agendarSync();
}

export function atualizarSettings(patch) {
  estado.settings = { ...estado.settings, ...patch, updatedAt: nowISO() };
  salvar();
  notificar('settings');
  agendarSync();
}

export function substituirEstado(novo) {
  estado = migrar(novo);
  salvar({ imediato: true });
  notificar('recarga');
}

/** Cria os lançamentos previstos das recorrências dentro do horizonte. */
export function materializarRecorrencias() {
  const novos = generateRecurrenceTx(estado, { meses: estado.settings.horizonteMeses || 3 });
  if (!novos.length) return 0;
  const carimbo = nowISO();
  estado.transactions.push(...novos.map((t) => ({ ...t, updatedAt: carimbo })));
  salvar();
  notificar('tx');
  agendarSync();
  return novos.length;
}

/* ------------------------------------------------------- sincronização */
// Uma tabela única no Supabase guarda todos os registros como JSON.
// Conflito resolvido por "quem gravou por último vence" (updatedAt).

export const sync = {
  config: null,
  cliente: null,
  estadoAtual: 'desligado', // desligado | conectando | ok | erro
  mensagem: '',
  ultima: null,
};

export function lerConfigSync() {
  try {
    sync.config = JSON.parse(localStorage.getItem(CHAVE_SYNC) || 'null');
  } catch { sync.config = null; }
  return sync.config;
}

export function gravarConfigSync(cfg) {
  sync.config = cfg;
  localStorage.setItem(CHAVE_SYNC, JSON.stringify(cfg || null));
}

async function carregarSDK() {
  const mod = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
  return mod.createClient;
}

export async function conectarSync({ url, chave, email, senha }) {
  sync.estadoAtual = 'conectando';
  notificar('sync');
  try {
    const createClient = await carregarSDK();
    const cliente = createClient(url, chave, { auth: { persistSession: true, storageKey: 'sf.auth' } });
    let { data, error } = await cliente.auth.signInWithPassword({ email, password: senha });
    if (error && /invalid login/i.test(error.message)) {
      const criado = await cliente.auth.signUp({ email, password: senha });
      if (criado.error) throw criado.error;
      data = criado.data;
      if (!criado.data.session) {
        throw new Error('Conta criada. Confirme o e-mail (ou desative a confirmação no Supabase) e conecte de novo.');
      }
    } else if (error) {
      throw error;
    }
    sync.cliente = cliente;
    sync.config = { url, chave, email, senha };
    gravarConfigSync(sync.config);
    sync.estadoAtual = 'ok';
    sync.mensagem = 'Conectado como ' + (data?.user?.email || email);
    notificar('sync');
    await sincronizar({ forcarTudo: true });
    return true;
  } catch (e) {
    sync.estadoAtual = 'erro';
    sync.mensagem = e.message || String(e);
    notificar('sync');
    return false;
  }
}

export async function desconectarSync() {
  try { await sync.cliente?.auth?.signOut(); } catch {}
  sync.cliente = null;
  sync.estadoAtual = 'desligado';
  sync.mensagem = '';
  gravarConfigSync(null);
  notificar('sync');
}

export async function iniciarSyncSalvo() {
  const cfg = lerConfigSync();
  if (!cfg || !cfg.url) return false;
  return conectarSync(cfg);
}

function todosRegistros() {
  const out = [];
  for (const col of COLECOES) for (const r of estado[col]) out.push(r);
  out.push({ ...estado.settings, id: 'settings', kind: 'settings', deleted: false });
  return out;
}

function aplicarRemoto(reg) {
  if (reg.kind === 'settings') {
    if ((reg.payload.updatedAt || '') > (estado.settings.updatedAt || '')) {
      estado.settings = { ...estado.settings, ...reg.payload };
    }
    return;
  }
  const col = colecaoDe(reg.kind);
  if (!col) return;
  const lista = estado[col];
  const i = lista.findIndex((x) => x.id === reg.id);
  if (i < 0) lista.push(reg.payload);
  else if ((reg.payload.updatedAt || '') > (lista[i].updatedAt || '')) lista[i] = reg.payload;
}

let syncPendente = null;
export function agendarSync() {
  if (sync.estadoAtual !== 'ok') return;
  clearTimeout(syncPendente);
  syncPendente = setTimeout(() => sincronizar(), 1200);
}

let sincronizando = false;
export async function sincronizar({ forcarTudo = false } = {}) {
  if (!sync.cliente || sync.estadoAtual === 'conectando') return;
  if (sincronizando) return;
  sincronizando = true;
  try {
    const desde = forcarTudo ? '1970-01-01T00:00:00Z' : (sync.ultima || '1970-01-01T00:00:00Z');

    // 1) baixa o que mudou na nuvem
    const { data: remotos, error } = await sync.cliente
      .from('sf_registros').select('*').gt('atualizado_em', desde);
    if (error) throw error;
    for (const r of remotos || []) {
      aplicarRemoto({ id: r.id, kind: r.tipo, payload: r.dados });
    }

    // 2) sobe o que é local e está mais novo
    const remotoPorId = new Map((remotos || []).map((r) => [r.id, r]));
    const paraSubir = todosRegistros()
      .filter((r) => {
        if (forcarTudo) return true;
        const rem = remotoPorId.get(r.id);
        return !rem || (r.updatedAt || '') > (rem.dados?.updatedAt || '');
      })
      .map((r) => ({ id: r.id, tipo: r.kind, dados: r, atualizado_em: r.updatedAt || nowISO() }));

    for (let i = 0; i < paraSubir.length; i += 200) {
      const lote = paraSubir.slice(i, i + 200);
      const { error: e2 } = await sync.cliente.from('sf_registros').upsert(lote, { onConflict: 'id' });
      if (e2) throw e2;
    }

    sync.ultima = nowISO();
    sync.mensagem = 'Sincronizado ' + new Date().toLocaleTimeString('pt-BR');
    sync.estadoAtual = 'ok';
    salvar({ imediato: true });
    notificar('sync-dados');
  } catch (e) {
    sync.estadoAtual = 'erro';
    sync.mensagem = e.message || String(e);
    notificar('sync');
  } finally {
    sincronizando = false;
  }
}

/* ---------------------------------------------------------- backup local */

export function exportarJSON() {
  return JSON.stringify(estado, null, 2);
}

export function importarJSON(texto) {
  const novo = JSON.parse(texto);
  if (!novo || typeof novo !== 'object') throw new Error('Arquivo inválido.');
  substituirEstado(novo);
}

export function exportarCSV() {
  const cat = new Map(estado.categories.map((c) => [c.id, c.nome]));
  const card = new Map(estado.cards.map((c) => [c.id, c.nome]));
  const linhas = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Método', 'Cartão', 'Pessoa', 'Status', 'Parcela', 'Observação']];
  for (const t of estado.transactions.filter((x) => !x.deleted).sort((a, b) => a.data.localeCompare(b.data))) {
    linhas.push([
      t.data,
      t.tipo === 'entrada' ? 'Entrada' : 'Saída',
      t.descricao || '',
      cat.get(t.categoriaId) || '',
      (t.valor / 100).toFixed(2).replace('.', ','),
      t.metodo || '',
      card.get(t.cartaoId) || '',
      t.pessoa || '',
      t.pago ? 'Efetivado' : 'Previsto',
      t.parcela ? `${t.parcela.n}/${t.parcela.total}` : '',
      (t.obs || '').replace(/[\r\n]+/g, ' '),
    ]);
  }
  return '﻿' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
