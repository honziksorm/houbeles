// Nálezy a nastavení v IndexedDB (zůstávají jen v telefonu)

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

export const addFind = (find) => tx('finds', 'readwrite', (s) => s.add(find));
export const putFind = (find) => tx('finds', 'readwrite', (s) => s.put(find));
export const getFind = (id) => tx('finds', 'readonly', (s) => s.get(id));
export const deleteFind = (id) => tx('finds', 'readwrite', (s) => s.delete(id));
export const allFinds = () => tx('finds', 'readonly', (s) => s.getAll())
  .then((list) => list.sort((a, b) => b.date - a.date));

export const getKV = (key, fallback = null) => tx('kv', 'readonly', (s) => s.get(key)).then((v) => v ?? fallback);
export const setKV = (key, val) => tx('kv', 'readwrite', (s) => s.put(val, key));

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
