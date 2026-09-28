// Učení z nálezů: opravené a potvrzené nálezy zvýhodní svůj druh u hodně podobných fotek.
// Porovnávají se otisky (512 čísel z modelu, normované), jsou jen v telefonu.

import { allFinds, updateFind } from './db.js';
import { embedBlob, modelVersion } from './engine.js';

// Změřeno na otiscích z kola 1: stejný druh z jiného pozorování má medián podobnosti 0,70,
// jiný druh téhož rodu 0,60 a nad 0,88 je jen 4 % takových dvojic. Pomáhají tedy jen hodně podobné fotky.
const SIM_FROM = 0.88;  // od jaké podobnosti otisků (kosinus) nález pomáhá
const SIM_FULL = 0.96;  // od jaké pomáhá naplno
const MAX_BOOST = 1.0;  // druh nálezu nejvýš ×2,7 (e^1), víc ne: nález může být i špatně opravený

// Věříme jen nálezům, u kterých druh někdo ručně opravil nebo potvrdil
const trusted = (f) => f.fixed && f.cls != null;

function dot(a, b) {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += a[k] * b[k];
  return s;
}

// Přidá váhu druhům z podobných nálezů. Vrací nové pravděpodobnosti a nejpodobnější nález.
export async function applyFinds(probs, embs) {
  if (!embs.length) return { probs, match: null };
  const ver = await modelVersion();
  const finds = (await allFinds()).filter((f) => trusted(f) && f.embV === ver && f.emb?.length);
  const boost = new Map();
  let match = null;
  for (const f of finds) {
    let s = -1;
    for (const a of embs) for (const b of f.emb) s = Math.max(s, dot(a, b));
    if (s < SIM_FROM) continue;
    const w = MAX_BOOST * Math.min(1, (s - SIM_FROM) / (SIM_FULL - SIM_FROM));
    if (w > (boost.get(f.cls) || 0)) boost.set(f.cls, w);
    if (!match || s > match.sim) match = { find: f, sim: s };
  }
  if (!boost.size) return { probs, match: null };
  const out = Float32Array.from(probs);
  for (const [c, w] of boost) out[c] *= Math.exp(w);
  const z = out.reduce((a, b) => a + b, 0);
  for (let i = 0; i < out.length; i++) out[i] /= z;
  return { probs: out, match };
}

// Dopočítá otisky nálezům, které je nemají (starší nálezy nebo nový model). Běží na pozadí.
// Zapisuje jen otisky, a jen když je nález pořád potvrzený jako stejný druh (mezitím ho šlo opravit nebo smazat).
let running, again = false;
export function refreshFindEmbeddings() {
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      const ver = await modelVersion();
      for (const f of await allFinds()) {
        if (!trusted(f) || f.embV === ver) continue;
        const emb = [];
        for (const b of f.photos) emb.push(await embedBlob(b));
        await updateFind(f.id, { emb, embV: ver }, (rec) => rec.fixed && rec.sid === f.sid);
      }
    } while (again);
  })().catch((e) => console.warn('otisky nálezů:', e)).finally(() => { running = null; });
  return running;
}
