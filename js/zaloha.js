// Záloha nálezů do souboru a obnova z něj (nálezy jsou jen v IndexedDB v telefonu)

import { exportAll, importFinds, getKV, setKV } from './db.js';
import { shareFile } from './sdileni.js';

const toDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

function toBlob(url) {
  const [head, b64] = url.split(',');
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return new Blob([bytes], { type: head.slice(5).split(';')[0] });
}

// Všechny nálezy (fotky jako base64) a nastavení v jednom JSON souboru
export async function makeBackup(now = Date.now()) {
  const { finds, kv } = await exportAll();
  const skip = new Set(['lastBackup', 'pocasi']); // počasí je jen mezipaměť
  const head = { app: 'houbeles', v: 1, date: now, kv: [...kv.filter(([k]) => !skip.has(k)), ['lastBackup', now]] };
  // skládá se po částech, ať se velká záloha nemusí držet v jednom řetězci
  const parts = [JSON.stringify(head).slice(0, -1), ',"finds":['];
  for (const [i, f] of finds.entries()) {
    // bez celých snímků (jsou v galerii telefonu, záloha by byla obří) a bez otisků (appka si je dopočítá)
    const { full, emb, embV, ...rest } = f;
    const photos = await Promise.all((f.photos || []).map(toDataUrl));
    parts.push(i ? ',' : '', JSON.stringify({ ...rest, photos }));
  }
  parts.push(']}');
  const d = new Date(now);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const json = new File(parts, `houbeles-zaloha-${day}.json`, { type: 'application/json' });
  // Chrome na Androidu nesdílí .json, jen text: jako .txt jde záloha poslat na Disk nebo sobě
  if (navigator.canShare && !navigator.canShare({ files: [json] })) {
    const txt = new File([json], `houbeles-zaloha-${day}.txt`, { type: 'text/plain' });
    if (navigator.canShare({ files: [txt] })) return txt;
  }
  return json;
}

// Vytvoří zálohu a nabídne ji ke sdílení nebo stažení. Vrací jako shareFile.
export async function backup() {
  const now = Date.now();
  const how = await shareFile(await makeBackup(now), { title: 'Záloha nálezů z Houbelesu', label: 'Uložit zálohu' });
  if (how) await setKV('lastBackup', now);
  return how;
}

// Nález ze zálohy: jen známá pole se správnými typy (poškozený nebo cizí soubor nesmí rozbít appku)
const num = Number.isFinite;
const pairList = (a) => Array.isArray(a) && a.every((x) => Array.isArray(x) && x.length === 2 && num(x[0]) && num(x[1]));
function clean(f) {
  const isPhoto = (p) => typeof p === 'string' && /^data:image\/[a-z+]+;base64,/.test(p);
  if (!f || !num(f.date) || !Array.isArray(f.photos) || !f.photos.length || !f.photos.every(isPhoto)) return null;
  const out = { date: f.date, photos: f.photos.map(toBlob) };
  if (num(f.sid)) {
    out.sid = f.sid;
    out.topS = pairList(f.topS) ? f.topS : [];
  } else if (num(f.cls)) { // nález ze staré verze
    out.cls = f.cls;
    out.top = pairList(f.top) ? f.top : [];
  } else return null;
  if (num(f.lat) && num(f.lon)) Object.assign(out, { lat: f.lat, lon: f.lon, acc: num(f.acc) ? f.acc : null });
  if (typeof f.note === 'string') out.note = f.note.slice(0, 5000);
  if (f.fixed === true) out.fixed = true;
  if (f.answers && typeof f.answers === 'object' && Object.values(f.answers).every((v) => typeof v === 'string')) out.answers = { ...f.answers };
  return out;
}

// Přidá nálezy ze zálohy, které tu ještě nejsou, a chybějící nastavení.
// Vrátí počet přidaných nálezů, nebo null, když soubor není záloha z Houbelesu.
export async function restore(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return null; }
  if (data?.app !== 'houbeles' || data.v !== 1 || !Array.isArray(data.finds)) return null;
  const finds = data.finds.map(clean).filter(Boolean);
  const n = await importFinds(finds);
  for (const [k, val] of (Array.isArray(data.kv) ? data.kv : []).filter(Array.isArray)) {
    if ((await getKV(k)) == null) await setKV(k, val);
  }
  return n;
}
