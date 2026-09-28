// Rozpoznávání: stažení modelu pro offline, předzpracování fotky a výpočet ve workeru

import { SPECIES, SEASON, loadData } from './data.js';

const MODEL_INFO = 'model/model.json';
const DATA_CACHE = 'houbeles-data-v1';
export const MODEL_MB = 105; // model 92 MB + náhledové fotky
const MEAN = [0.48145466, 0.4578275, 0.40821073];
const STD = [0.26862954, 0.26130258, 0.27577711];
const SEASON_WEIGHT = 0.7;

let worker, ready, seq = 0;
const pending = new Map();

function call(msg, transfer = []) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id }, transfer);
  });
}

let infoP;
const modelInfo = () => (infoP ||= fetch(MODEL_INFO).then((r) => r.json()));
const partUrl = (p) => new URL(`model/${p}`, location.href).href;
export const modelCacheName = (info) => `houbeles-model-${info.version}`;

export async function isModelDownloaded() {
  if (!('caches' in window)) return false;
  try {
    const info = await modelInfo();
    const c = await caches.open(modelCacheName(info));
    for (const p of info.parts) if (!(await c.match(partUrl(p)))) return false;
    return true;
  } catch {
    return false;
  }
}

// Stáhne model po dílech (s průběhem) a všechny náhledové fotky do mezipaměti
export async function downloadForOffline(onProgress) {
  const info = await modelInfo();
  const cache = await caches.open(modelCacheName(info));
  let got = 0;
  const PART = 20 * 1024 * 1024;
  for (const [k, p] of info.parts.entries()) {
    const url = partUrl(p);
    if (await cache.match(url)) {
      got += k < info.parts.length - 1 ? PART : info.size - PART * k;
      continue;
    }
    const r = await fetch(url);
    if (!r.ok || !r.body) throw new Error('Stažení se nepovedlo');
    const reader = r.body.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress?.(0.9 * got / info.size, 'model');
    }
    await cache.put(url, new Response(new Blob(chunks), { headers: { 'content-type': 'application/octet-stream' } }));
  }
  // starší verze modelu už nejsou potřeba
  for (const k of await caches.keys()) if (k.startsWith('houbeles-model-') && k !== modelCacheName(info)) await caches.delete(k);
  // náhledy pro atlas a výsledky
  await loadData();
  const dc = await caches.open(DATA_CACHE);
  const files = SPECIES.flatMap((s) => (s.img || []).map((i) => `data/nahledy/${i.f}`));
  let n = 0;
  for (let i = 0; i < files.length; i += 24) {
    await Promise.all(files.slice(i, i + 24).map(async (f) => {
      const u = new URL(f, location.href).href;
      if (!(await dc.match(u))) {
        try { const r = await fetch(u); if (r.ok) await dc.put(u, r); } catch { /* zkusí se příště */ }
      }
      n++;
    }));
    onProgress?.(0.9 + 0.1 * n / files.length, 'fotky');
  }
  try { await navigator.storage?.persist?.(); } catch { /* nevadí */ }
  onProgress?.(1, 'hotovo');
}

export function startEngine() {
  ready ||= (async () => {
    const { head } = await loadData();
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      data.ok ? p.resolve(data.result) : p.reject(new Error(data.error));
    };
    const info = await modelInfo();
    return call({ type: 'init', classes: head.classes.length, dim: head.dim, model: info, cache: modelCacheName(info) });
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

// Vyřízne čtverec (sx, sy, size) ze zdroje a připraví vstup pro model
export function toPixels(src, sx, sy, size) {
  const c = document.createElement('canvas');
  c.width = c.height = 224;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  // zmenšování po krocích dává ostřejší a věrnější výsledek (blíž tomu, na čem se model učil)
  let from = src, fx = sx, fy = sy, fs = size;
  while (fs > 448) {
    const half = Math.round(fs / 2);
    const t = document.createElement('canvas');
    t.width = t.height = half;
    const tg = t.getContext('2d');
    tg.imageSmoothingQuality = 'high';
    tg.drawImage(from, fx, fy, fs, fs, 0, 0, half, half);
    from = t; fx = 0; fy = 0; fs = half;
  }
  g.drawImage(from, fx, fy, fs, fs, 0, 0, 224, 224);
  const d = g.getImageData(0, 0, 224, 224).data;
  const x = new Float32Array(3 * 224 * 224);
  const P = 224 * 224;
  for (let i = 0; i < P; i++) {
    x[i] = (d[i * 4] / 255 - MEAN[0]) / STD[0];
    x[P + i] = (d[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    x[2 * P + i] = (d[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }
  return x;
}

let busy = false;
export const isBusy = () => busy;

// Vrací log-pravděpodobnosti druhů pro jeden výřez (bez sezóny)
export async function classifyPixels(pixels) {
  await startEngine();
  busy = true;
  try {
    return await call({ type: 'run', pixels }, [pixels.buffer]);
  } finally {
    busy = false;
  }
}

// Spojí výsledky více fotek + sezóna → pravděpodobnosti.
// 'sum' = různé fotky téže houby (shora, zespodu), 'avg' = po sobě jdoucí snímky z hledáčku
export function combine(logps, month = new Date().getMonth(), mode = 'sum') {
  const C = logps[0].length;
  const s = new Float64Array(C);
  for (const lp of logps) for (let c = 0; c < C; c++) s[c] += lp[c];
  // u více fotek součet „ztlumíme“, ať appka není přehnaně sebejistá
  const k = mode === 'avg' ? 1 / logps.length : 1 / Math.sqrt(logps.length);
  let m = -Infinity;
  for (let c = 0; c < C; c++) {
    const prior = SEASON[c] ? Math.log(SEASON[c][month] * 12) : 0;
    s[c] = s[c] * k + SEASON_WEIGHT * prior;
    if (s[c] > m) m = s[c];
  }
  let z = 0;
  const p = new Float32Array(C);
  for (let c = 0; c < C; c++) { p[c] = Math.exp(s[c] - m); z += p[c]; }
  for (let c = 0; c < C; c++) p[c] /= z;
  return p;
}
