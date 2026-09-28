// Drobné pomocníky pro skládání HTML a UI

import { icon } from './icons.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(s);
export const ic = (name, cls) => new Raw(icon(name, cls));

// html`...` escapuje vložené hodnoty; pole se spojí, raw() a vnořené html`` projdou beze změny
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return new Raw(out);
}
function render(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return escape(v);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, { kind = '', ms = 3200 } = {}) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = String(msg instanceof Raw ? msg : escape(msg));
  box.append(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

export const pct = (p) => `${Math.min(99, Math.round(p * 100))} %`;

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const MONTHS_IN = ['v lednu', 'v únoru', 'v březnu', 'v dubnu', 'v květnu', 'v červnu', 'v červenci', 'v srpnu', 'v září', 'v říjnu', 'v listopadu', 'v prosinci'];
export const monthName = (m) => MONTHS[m];
export const monthIn = (m) => MONTHS_IN[m];
export const MONTH_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];

export function fmtDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return `dnes ${d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`;
  if (same(d, y)) return 'včera';
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

// České tvary: plural(5, 'druh', 'druhy', 'druhů')
export function plural(n, one, few, many) {
  const w = n === 1 ? one : n >= 2 && n <= 4 ? few : many;
  return `${n.toLocaleString('cs-CZ')} ${w}`;
}

// Hledání bez ohledu na diakritiku a velikost písmen
export const fold = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
