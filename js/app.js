// Houbeles: přepínání obrazovek a spuštění appky

import { icon } from './icons.js';
import { revokeUrls } from './db.js';
import { install } from './state.js';
import { toast, replay, html } from './ui.js';
import * as home from './views/home.js';
import * as live from './views/live.js';
import * as result from './views/result.js';
import * as atlas from './views/atlas.js';
import * as finds from './views/finds.js';
import * as tips from './views/tips.js';
import * as kviz from './views/kviz.js';

const ROUTES = [
  [/^\/?$/, home.render, 'home'],
  [/^\/hledat$/, live.render, null],
  [/^\/vysledek$/, result.render, 'home'],
  [/^\/atlas$/, atlas.render, 'atlas'],
  [/^\/druh\/(\d+)$/, atlas.renderSpecies, 'atlas'],
  [/^\/kviz$/, kviz.render, 'atlas'],
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
    const newPage = path !== lastPath;
    if (newPage) window.scrollTo(0, 0);
    lastPath = path;
    try {
      cleanup = await fn(view, params, ...m.slice(1));
      if (newPage) replay(view, 'enter'); // jemný přechod na novou obrazovku
      for (const img of view.querySelectorAll('img')) if (img.complete) img.classList.add('in');
    } catch (e) {
      console.error(e);
      view.innerHTML = html`<div class="page"><div class="card pad"><b>Něco se pokazilo.</b><br><span class="muted">${String(e.message || e)}</span></div></div>`;
    }
    return;
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', route);
route();

// fotky se po načtení jemně objeví (i ty, které se nenačetly, ať není prázdné místo)
const shown = (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('in'); };
document.addEventListener('load', shown, true);
document.addEventListener('error', shown, true);
// maskot na klepnutí mrkne a poskočí
document.addEventListener('click', (e) => replay(e.target.closest?.('.mascot')));

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

// Service worker: offline chod, aktualizace a vícevláknový výpočet modelu
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  // nový service worker převzal řízení → přenačíst, ať běží nová verze
  // (a po první instalaci taky, aby šel model počítat ve více vláknech)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const last = +sessionStorage.getItem('swReloadAt') || 0;
    if (Date.now() - last < 15000) return; // pojistka proti opakovanému přenačítání
    sessionStorage.setItem('swReloadAt', String(Date.now()));
    if (location.hash.startsWith('#/hledat')) return;
    if (hadController) toast('Nová verze Houbelesu, načítám…', { kind: 'ok' });
    setTimeout(() => location.reload(), hadController ? 700 : 0);
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    // ať je vidět, že se nová verze stahuje (trvá to chvilku, pak se appka sama načte znovu)
    reg.addEventListener('updatefound', () => {
      if (navigator.serviceWorker.controller) toast('Stahuji novou verzi Houbelesu…', { ms: 6000 });
    });
    // při návratu do appky zkontrolovat, jestli není nová verze
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch((e) => console.warn('SW:', e));
}
