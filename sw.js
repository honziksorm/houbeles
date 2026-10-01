// Service worker: offline chod appky + hlavičky pro vícevláknový výpočet modelu
const VERSION = 'fc21842f7b'; // při sestavení balíčku (scripts/10_balicek.py) se nahradí otiskem obsahu
const SHELL = `houbeles-shell-${VERSION}`;
const DATA = 'houbeles-data-v1';

const SHELL_FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/verze.js', 'js/ui.js', 'js/icons.js', 'js/data.js', 'js/db.js', 'js/engine.js', 'js/worker.js', 'js/state.js', 'js/badges.js', 'js/dourceni.js', 'js/uceni.js', 'js/pocasi.js',
  'js/views/home.js', 'js/views/live.js', 'js/views/result.js', 'js/views/atlas.js', 'js/views/finds.js', 'js/views/tips.js', 'js/views/kviz.js',
  'js/zaloha.js', 'js/sdileni.js', 'soukromi.html', 'podminky.html',
  'vendor/ort/ort.wasm.bundle.min.mjs', 'vendor/ort/ort-wasm-simd-threaded.mjs', 'vendor/ort/ort-wasm-simd-threaded.wasm',
  'vendor/fonts/baloo-2-latin-wght-normal.woff2', 'vendor/fonts/baloo-2-latin-ext-wght-normal.woff2',
  'vendor/fonts/nunito-latin-wght-normal.woff2', 'vendor/fonts/nunito-latin-ext-wght-normal.woff2',
  'data/druhy.json', 'data/hlava.json', 'data/hlava.bin', 'data/tridy-v1.json', 'model/model.json',
  'img/ikona.svg', 'img/ikona-180.png', 'img/ikona-192.png', 'img/ikona-512.png', 'img/bez-fotky.svg',
  'img/odznaky/seznam.json',
];
const DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

self.addEventListener('install', (e) => {
  // cache: 'reload' = vždy čerstvé soubory ze serveru, ne starší z mezipaměti prohlížeče;
  // ?v= obejde i starší kopie na CDN hned po nahrání (hledá se s ignoreSearch)
  e.waitUntil(caches.open(SHELL)
    .then((c) => c.addAll(SHELL_FILES.map((f) => new Request(`${f}${f.includes('?') ? '&' : '?'}v=${VERSION}`, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('houbeles-shell-') && k !== SHELL) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

// Přidá hlavičky, díky kterým může model počítat ve více vláknech
function isolate(resp) {
  if (!resp || resp.status === 0 || resp.type === 'opaque') return resp;
  const h = new Headers(resp.headers);
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
}

async function fromCaches(req) {
  // hledá ve všech mezipamětech (appka, data, model v aktuální verzi)
  return (await caches.match(req, { ignoreSearch: true })) || null;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    // appka je jedna stránka (index.html); jiné stránky (zásady soukromí) se načtou samy za sebe
    const isNav = req.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname);
    const isThumb = url.pathname.includes('/data/nahledy/');
    // při vývoji: nejdřív síť (ať jsou vidět změny), jinak nejdřív mezipaměť
    if (DEV && !isThumb && !url.pathname.endsWith('.onnx')) {
      try { return isolate(await fetch(req)); } catch { /* offline, zkusíme mezipaměť */ }
    }
    let hit = await fromCaches(isNav ? new Request('index.html') : req);
    if (hit) return isolate(hit);
    try {
      const resp = await fetch(req);
      if (resp.ok && isThumb) (await caches.open(DATA)).put(req, resp.clone());
      return isolate(resp);
    } catch (err) {
      hit = isNav ? await fromCaches(new Request('index.html')) : null;
      if (hit) return isolate(hit);
      throw err;
    }
  })());
});
