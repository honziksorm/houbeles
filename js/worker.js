// Výpočet modelu v samostatném vlákně (aby se nesekal obraz kamery)
import * as ort from '../vendor/ort/ort.wasm.bundle.min.mjs';

const HEAD_URL = new URL('../data/hlava.bin', import.meta.url).href;

let session, W, b, C, D;

// Složí model z dílů: z mezipaměti (offline), jinak ze sítě
async function modelBytes(info, cacheName) {
  const cache = await caches.open(cacheName);
  const out = new Uint8Array(info.size);
  let off = 0;
  for (const p of info.parts) {
    const url = new URL(`../model/${p}`, import.meta.url).href;
    let r = await cache.match(url);
    if (!r) {
      r = await fetch(url);
      if (!r.ok) throw new Error('Model se nepodařilo stáhnout');
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    out.set(buf, off);
    off += buf.length;
  }
  return out;
}

async function init({ classes, dim, model, cache }) {
  ort.env.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
  const threads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  const bytes = await modelBytes(model, cache);
  try {
    ort.env.wasm.numThreads = threads;
    session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  } catch (e) {
    // některé prohlížeče neumí vlákna ve workeru, zkusíme jedno vlákno
    ort.env.wasm.numThreads = 1;
    session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  }
  const head = new Float32Array(await (await fetch(HEAD_URL)).arrayBuffer());
  C = classes; D = dim;
  W = head.subarray(0, C * D);
  b = head.subarray(C * D, C * D + C);
  return { threads: ort.env.wasm.numThreads };
}

async function run(pixels) {
  const t0 = performance.now();
  const out = await session.run({ pixels: new ort.Tensor('float32', pixels, [1, 3, 224, 224]) });
  const e = out.embedding.data;
  const logits = new Float32Array(C);
  for (let c = 0; c < C; c++) {
    let s = b[c];
    const o = c * D;
    for (let k = 0; k < D; k++) s += W[o + k] * e[k];
    logits[c] = s;
  }
  // log-softmax, ať jdou výsledky z více fotek sčítat
  let m = -Infinity;
  for (let c = 0; c < C; c++) if (logits[c] > m) m = logits[c];
  let z = 0;
  for (let c = 0; c < C; c++) z += Math.exp(logits[c] - m);
  const lz = m + Math.log(z);
  for (let c = 0; c < C; c++) logits[c] -= lz;
  return { logp: logits, embedding: new Float32Array(e), ms: performance.now() - t0 };
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'init') {
      self.postMessage({ id, ok: true, result: await init(data) });
    } else if (type === 'run') {
      const r = await run(data.pixels);
      self.postMessage({ id, ok: true, result: r }, [r.logp.buffer, r.embedding.buffer]);
    }
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e && e.message || e) });
  }
};
