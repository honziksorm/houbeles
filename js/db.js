// Nálezy a nastavení v IndexedDB (zůstávají jen v telefonu)

import { loadData, BY_ID, SPECIES } from './data.js';

const DB_NAME = 'houbeles';
let dbp;

function open() {
  dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      const f = db.createObjectStore('finds', { keyPath: 'id', autoIncrement: true });
      f.createIndex('date', 'date');
      db.createObjectStore('kv');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const res = fn(t.objectStore(store));
    t.oncomplete = () => resolve(res && 'result' in res ? res.result : res);
    t.onerror = () => reject(t.error);
  }));
}

// Nálezy se ukládají s ID druhu (sid, topS), appka pracuje s číslem třídy aktuálního modelu (cls, top).
// Nový model má jiné pořadí tříd, proto se čísla převádějí při čtení a zápisu.
// Nálezy z první verze mají jen čísla tříd, k nim patří pořadí v data/tridy-v1.json.
let v1;
const legacyClasses = () => (v1 ||= fetch('data/tridy-v1.json').then((r) => r.json()));

const pairs = (a) => (Array.isArray(a) ? a.filter((x) => Array.isArray(x) && x.length === 2) : []);

// starý záznam (jen čísla tříd první verze) → ID druhu
function upgradeLegacy(f, old) {
  if (f.sid != null) return;
  f.sid = old[f.cls];
  f.topS = pairs(f.top).map(([i, p]) => [old[i], p]);
  delete f.cls;
  delete f.top;
}

async function fromStore(f) {
  if (!f) return f;
  if (f.sid == null) upgradeLegacy(f, await legacyClasses());
  f.cls = BY_ID.get(f.sid)?.i; // druh, který v modelu už není, zůstane neurčený
  f.top = pairs(f.topS).filter(([s]) => BY_ID.has(s)).map(([s, p]) => [BY_ID.get(s).i, p]);
  if (!Array.isArray(f.photos)) f.photos = [];
  return f;
}

function toStore(f) {
  const { cls, top, ...rec } = f;
  if (cls != null && SPECIES[cls]) rec.sid = SPECIES[cls].id;
  if (top) rec.topS = top.map(([i, p]) => [SPECIES[i].id, p]);
  return rec;
}

export const addFind = async (find) => { await loadData(); return tx('finds', 'readwrite', (s) => s.add(toStore(find))); };
export const putFind = async (find) => { await loadData(); return tx('finds', 'readwrite', (s) => s.put(toStore(find))); };
export const getFind = async (id) => { await loadData(); return fromStore(await tx('finds', 'readonly', (s) => s.get(id))); };
export const deleteFind = (id) => tx('finds', 'readwrite', (s) => s.delete(id));

// Změní jen vybraná pole nálezu, čtení i zápis v jedné transakci: starší kopie nálezu
// (třeba z výpočtu na pozadí) tak nepřepíše opravu druhu ani poznámku. `cls` se převede na ID druhu.
// `guard(záznam)` může změnu odmítnout (nález se mezitím změnil). Vrací, jestli se zapsalo.
export async function updateFind(id, patch, guard) {
  await loadData();
  const old = await legacyClasses();
  const p = { ...patch };
  if ('cls' in p) {
    if (SPECIES[p.cls]) p.sid = SPECIES[p.cls].id;
    delete p.cls;
  }
  if ('top' in p) {
    p.topS = pairs(p.top).map(([i, v]) => [SPECIES[i].id, v]);
    delete p.top;
  }
  return tx('finds', 'readwrite', (s) => {
    const res = { result: false };
    const g = s.get(id);
    g.onsuccess = () => {
      const rec = g.result;
      if (!rec) return; // mezitím smazaný nález se nevrací
      upgradeLegacy(rec, old);
      if (guard && !guard(rec)) return;
      s.put(Object.assign(rec, p));
      res.result = true;
    };
    return res;
  });
}
export async function allFinds() {
  await loadData();
  const list = await tx('finds', 'readonly', (s) => s.getAll());
  await Promise.all(list.map(fromStore));
  return list.sort((a, b) => b.date - a.date);
}

export const getKV = (key, fallback = null) => tx('kv', 'readonly', (s) => s.get(key)).then((v) => v ?? fallback);
export const setKV = (key, val) => tx('kv', 'readwrite', (s) => s.put(val, key));

// Záloha: surové záznamy přímo z úložiště, bez převodu sid ⇄ cls
export async function exportAll() {
  const finds = await tx('finds', 'readonly', (s) => s.getAll());
  const [keys, vals] = await tx('kv', 'readonly', (s) => [s.getAllKeys(), s.getAll()]);
  return { finds, kv: keys.result.map((k, i) => [k, vals.result[i]]) };
}

// Obnova: přidá surové záznamy, které tu ještě nejsou (stejný čas nálezu a velikost první fotky,
// i když se mezitím opravil druh). Vrátí jejich počet. Bez původního id, ať ho přidělí databáze.
export async function importFinds(records) {
  const key = (f) => `${f.date}|${f.photos?.[0]?.size ?? ''}`;
  const out = await tx('finds', 'readwrite', (s) => {
    const res = { n: 0 };
    const all = s.getAll();
    all.onsuccess = () => {
      const have = new Set(all.result.map(key));
      for (const { id, ...f } of records) {
        if (have.has(key(f))) continue;
        have.add(key(f));
        s.add(f);
        res.n++;
      }
    };
    return res;
  });
  return out.n;
}

// Zmenší fotku na rozumnou velikost pro uložení
export async function shrink(blobOrCanvas, max = 1400, quality = 0.84) {
  const src = blobOrCanvas instanceof Blob ? await createImageBitmap(blobOrCanvas) : blobOrCanvas;
  const s = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * s);
  c.height = Math.round(src.height * s);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
}

// Object URL pro Blob, uklizené při další navigaci
const urls = new Set();
export function blobUrl(blob) {
  const u = URL.createObjectURL(blob);
  urls.add(u);
  return u;
}
export function revokeUrls() {
  for (const u of urls) URL.revokeObjectURL(u);
  urls.clear();
}
