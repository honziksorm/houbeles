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

// ---------- Jemné animace (jen jako odezva na akci) ----------

// „Omezit pohyb“ v telefonu: bez animací
export const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Spustí CSS animaci znovu (třída pryč a zpátky)
export function replay(el, cls = 'go', ms = 1500) {
  if (!el) return;
  el.classList.remove(cls);
  void el.getBoundingClientRect();
  el.classList.add(cls);
  // uklidit až po všech animacích (i vnořených, třeba mrknutí + poskočení maskota)
  clearTimeout(el._replayT);
  el._replayT = setTimeout(() => el.classList.remove(cls), ms);
}

// Číslo „naběhne“ (jistota ve výsledku)
export function countUp(el, from, to, ms = 700) {
  if (!el) return;
  if (calm() || from === to) { el.textContent = `${to} %`; return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = `${Math.round(from + (to - from) * (1 - (1 - k) ** 3))} %`;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Fotka „skočí“ z tlačítka do košíku v dolní liště
export function flyToBasket(photo, from) {
  const tab = document.querySelector('#tabbar [data-tab="finds"]');
  if (!tab) return;
  if (!calm() && photo && from) {
    const src = URL.createObjectURL(photo); // vlastní adresa: po přechodu na nález se adresy obrazovky ruší
    const to = tab.querySelector('.ic').getBoundingClientRect();
    const img = document.createElement('img');
    img.className = 'fly';
    img.src = src;
    const s = 56;
    Object.assign(img.style, { width: `${s}px`, height: `${s}px`, left: `${from.left + from.width / 2 - s / 2}px`, top: `${from.top - s / 2}px` });
    document.body.append(img);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - from.top;
    img.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 70}px) scale(.8)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(.25)`, opacity: 0.2 },
    ], { duration: 650, easing: 'ease-in' }).finished.then(() => { img.remove(); URL.revokeObjectURL(src); replay(tab, 'bump'); });
  } else replay(tab, 'bump');
}

// Výtrusy (malé barevné kuličky) při novém odznáčku, pak zmizí
export function spores(x, y, n = 24) {
  if (calm()) return;
  const colors = ['#72b04f', '#f5b638', '#e5484d', '#fff6e3', '#a894ff', '#9a5b2e'];
  for (let k = 0; k < n; k++) {
    const s = document.createElement('i');
    s.className = 'spore';
    const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 90;
    Object.assign(s.style, { left: `${x}px`, top: `${y}px`, background: colors[k % colors.length], animationDelay: `${Math.random() * 0.15}s` });
    s.style.setProperty('--x', `${Math.cos(a) * r}px`);
    s.style.setProperty('--y', `${Math.sin(a) * r - 30}px`);
    document.body.append(s);
    setTimeout(() => s.remove(), 1400);
  }
}

// Hledání bez ohledu na diakritiku a velikost písmen
export const fold = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
