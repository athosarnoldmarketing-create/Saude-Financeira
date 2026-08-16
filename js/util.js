// util.js — helpers de data, moeda e identificadores
// Todos os valores monetários circulam como INTEIROS EM CENTAVOS.

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));

export const nowISO = () => new Date().toISOString();

/* ---------------------------------------------------------------- moeda */

export function toCents(input) {
  if (typeof input === 'number') return Math.round(input * 100);
  if (input == null) return 0;
  let s = String(input).trim().replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  const neg = /^-/.test(s);
  s = s.replace(/-/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > -1 && lastComma > -1) {
    s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) * (neg ? -1 : 1);
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlPlain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (cents) => brl.format((cents || 0) / 100);
export const moneyPlain = (cents) => brlPlain.format((cents || 0) / 100);

export function moneyShort(cents) {
  const v = Math.abs(cents || 0) / 100;
  const sign = cents < 0 ? '-' : '';
  if (v >= 1000000) return sign + 'R$ ' + (v / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (v >= 1000) return sign + 'R$ ' + (v / 1000).toFixed(1).replace('.', ',') + 'k';
  return sign + 'R$ ' + v.toFixed(0);
}

/* ----------------------------------------------------------------- data */
// Datas de negócio são strings 'YYYY-MM-DD' (sem fuso, sem surpresa).

export function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const fmtISO = (date) => todayISO(date);

export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return fmtISO(d);
}

export function addMonths(iso, n) {
  const d = parseDate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth() + 1)));
  return fmtISO(d);
}

export const daysInMonth = (year, month1) => new Date(year, month1, 0).getDate();

export const monthKey = (iso) => String(iso).slice(0, 7); // 'YYYY-MM'

export function monthAdd(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(mk) {
  const [y, m] = mk.split('-').map(Number);
  return { start: `${mk}-01`, end: `${mk}-${String(daysInMonth(y, m)).padStart(2, '0')}` };
}

/** Data de um dia do mês, com clamp para meses curtos (31 -> 28/30). */
export function dayOfMonth(mk, day) {
  const [y, m] = mk.split('-').map(Number);
  const d = Math.min(Math.max(1, day || 1), daysInMonth(y, m));
  return `${mk}-${String(d).padStart(2, '0')}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const DIAS_ABR = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export const monthName = (mk) => MESES[Number(mk.split('-')[1]) - 1];
export const monthLabel = (mk) => `${MESES_ABR[Number(mk.split('-')[1]) - 1]}/${mk.slice(2, 4)}`;
export const monthLabelLong = (mk) => `${MESES[Number(mk.split('-')[1]) - 1]} de ${mk.slice(0, 4)}`;
export const weekdayName = (iso) => DIAS[parseDate(iso).getDay()];
export const weekdayAbbr = (iso) => DIAS_ABR[parseDate(iso).getDay()];

export function dateLabel(iso) {
  const d = parseDate(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${MESES_ABR[d.getMonth()]}`;
}

export function dateLabelFull(iso) {
  const d = parseDate(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Rótulo relativo amigável: Hoje, Ontem, Amanhã ou 'ter, 12 ago'. */
export function relDateLabel(iso, ref = todayISO()) {
  if (iso === ref) return 'Hoje';
  if (iso === addDays(ref, -1)) return 'Ontem';
  if (iso === addDays(ref, 1)) return 'Amanhã';
  return `${weekdayAbbr(iso)}, ${dateLabel(iso)}`;
}

/** Segunda-feira da semana da data informada. */
export function weekStart(iso) {
  const d = parseDate(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dow);
  return fmtISO(d);
}

export const weekEnd = (iso) => addDays(weekStart(iso), 6);

export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

/* --------------------------------------------------------------- textos */

export function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const escapeHTML = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const sum = (arr, pick = (x) => x) => arr.reduce((a, b) => a + (pick(b) || 0), 0);

export function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}
