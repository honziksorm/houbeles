// Houbeles: přepínání obrazovek a spuštění appky

import { icon } from './icons.js';
import { revokeUrls } from './db.js';
import { install } from './state.js';
import { toast } from './ui.js';
import * as home from './views/home.js';
import * as live from './views/live.js';
import * as result from './views/result.js';
import * as atlas from './views/atlas.js';
import * as finds from './views/finds.js';
import * as tips from './views/tips.js';

const ROUTES = [
  [/^\/?$/, home.render, 'home'],
  [/^\/hledat$/, live.render, null],
  [/^\/vysledek$/, result.render, 'home'],
  [/^\/atlas$/, atlas.render, 'atlas'],
  [/^\/druh\/(\d+)$/, atlas.renderSpecies, 'atlas'],
  [/^\/nalezy$/, finds.render, 'finds'],
  [/^\/nalez\/(\d+)$/, finds.renderFind, 'finds'],
  [/^\/rady$/, tips.render, 'tips'],
];

const TABS = [
  ['home', '#/', 'camera', 'Hledat'],
  ['atlas', '#/atlas', 'book-2', 'Atlas'],
  ['finds', '#/nalezy', 'basket', 'Nálezy'],
  ['tips', '#/rady', 'shield-check', 'Rady'],
];

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
tabbar.innerHTML = TABS.map(([k, href, ic, label]) => `<a href="${href}" data-tab="${k}">${icon(ic)}<span>${label}</span></a>`).join('');

let cleanup = null;
let lastPath = null;

async function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = hash.split('?');
  const params = new URLSearchParams(query);
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (e) { console.error(e); }
  }
  cleanup = null;
  revokeUrls();
  document.body.classList.remove('fullscreen');
  for (const [re, fn, tab] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    for (const a of tabbar.children) a.classList.toggle('on', a.dataset.tab === tab);
    if (path !== lastPath) window.scrollTo(0, 0);
    lastPath = path;
    try {
      cleanup = await fn(view, params, ...m.slice(1));
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="page"><div class="card pad"><b>Něco se pokazilo.</b><br><span class="muted">${String(e.message || e)}</span></div></div>`;
    }
    return;
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', route);
route();

// Android/Chrome nabídne instalaci: schováme si ji pro tlačítko na úvodní obrazovce
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  install.prompt = e;
  if (!location.hash || location.hash === '#/') route();
});
window.addEventListener('appinstalled', () => {
  install.prompt = null;
  toast('Houbeles je na ploše. Příště ho spouštěj odtamtud.', { kind: 'ok' });
  if (!location.hash || location.hash === '#/') route();
});

// Service worker: offline chod a vícevláknový výpočet modelu
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // po první instalaci se stránka jednou přenačte, aby ji řídil service worker (rychlejší model)
    if (!navigator.serviceWorker.controller && !sessionStorage.getItem('swReloaded')) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        sessionStorage.setItem('swReloaded', '1');
        if (!location.hash.startsWith('#/hledat')) location.reload();
      }, { once: true });
    }
    return reg;
  }).catch((e) => console.warn('SW:', e));
}
