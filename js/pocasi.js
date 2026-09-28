// Rostou houby? Odhad podle počasí z Open-Meteo (posílá se jen přibližné místo, ±10 km)

import { getKV, setKV } from './db.js';

const API = 'https://api.open-meteo.com/v1/forecast';
const FRESH = 3 * 3600e3;    // po 3 h se počasí načte znovu
const MAX_AGE = 48 * 3600e3; // starší uložené počasí už neukazujeme

// Souřadnice na 1 desetinné místo (asi 10 km), přesnější poloha telefon neopustí
const round1 = (x) => Math.round(x * 10) / 10;
const okPlace = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

// Místo pro počasí: jen poloha, kterou k tomu někdo klepnutím sdílel. Polohy nálezů telefon neopouštějí.
export async function weatherPlace() {
  const p = await getKV('pocasiPoloha');
  return okPlace(p) ? { lat: round1(p.lat), lon: round1(p.lon) } : null;
}

// Zeptá se na polohu (jen po klepnutí) a uloží ji rovnou zaokrouhlenou
export function sharePlace() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition((pos) => {
      const p = { lat: round1(pos.coords.latitude), lon: round1(pos.coords.longitude) };
      setKV('pocasiPoloha', p).then(() => resolve(p), reject);
    }, reject, { timeout: 15000, maximumAge: 3600e3 });
  });
}

async function download(p) {
  const url = `${API}?latitude=${p.lat.toFixed(1)}&longitude=${p.lon.toFixed(1)}`
    + '&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&past_days=21&forecast_days=1&timezone=Europe%2FPrague';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ctl.signal, referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    const { daily } = await r.json();
    if (!(daily?.time?.length >= 15)) throw new Error('Neúplná data o počasí');
    return daily;
  } finally {
    clearTimeout(timer);
  }
}

// Verdikt pro místo: uložený do 3 h, jinak ze sítě; bez sítě starší uložený (do 2 dnů) s jeho stářím
export async function forecast(p) {
  const saved = await getKV('pocasi');
  const age = saved ? Date.now() - saved.t : Infinity;
  if (saved && saved.lat === p.lat && saved.lon === p.lon && age >= 0 && age < FRESH) return { ...verdict(saved.daily), age: 0 };
  if (navigator.onLine) {
    try {
      const daily = await download(p);
      const v = verdict(daily);
      await setKV('pocasi', { t: Date.now(), lat: p.lat, lon: p.lon, daily });
      return { ...v, age: 0 };
    } catch { /* offline nebo chyba služby, zkusíme uložené */ }
  }
  return saved && age >= 0 && age < MAX_AGE ? { ...verdict(saved.daily), age } : null;
}

const deg = (x) => String(Math.round(x)).replace('-', '−');
// rozsah teplot, který se nerozdělí na dva řádky
const range = (a, b) => (Math.round(a) === Math.round(b) ? `${deg(b)} °C`
  : Math.round(a) < 0 ? `${deg(a)} až ${deg(b)} °C` : `${deg(a)}⁠–⁠${deg(b)} °C`);

// Hrubé pravidlo pro české lesy (ne předpověď):
// - hlavní je déšť za posledních 14 dní; plodnice rostou asi týden po dešti,
//   takže déšť z posledních 2 dnů se počítá jen napůl
// - aspoň 25 mm = houby rostou, 10–25 mm = možná, pod 10 mm = spíš ne
// - průměrná teplota dne za poslední týden ideálně 8–20 °C, mimo to (nebo slabý mráz) nanejvýš „možná“
// - spíš ne: mráz −3 °C a víc, průměr pod 3 °C, nebo horko (průměr nad 20 °C) bez vydatného deště
// - v prosinci až únoru rostou hlavně houby na dřevě (penízovka sametonohá, hlíva)
export function verdict(daily, month = new Date().getMonth()) {
  const n = daily.time.length;
  const day = (arr, k) => arr[n - 1 - k]; // k dní zpátky, 0 = dnes
  const P = daily.precipitation_sum, TX = daily.temperature_2m_max, TN = daily.temperature_2m_min;
  let rain = 0, fresh = 0;
  for (let k = 1; k <= 14; k++) {
    const r = day(P, k) || 0;
    rain += r;
    if (k <= 2) fresh += r;
  }
  const eff = rain - fresh / 2;
  const week = [0, 1, 2, 3, 4, 5, 6].filter((k) => day(TX, k) != null && day(TN, k) != null);
  if (!week.length) throw new Error('Chybí teploty');
  const tMean = week.reduce((s, k) => s + (day(TX, k) + day(TN, k)) / 2, 0) / week.length;
  const hiLo = Math.min(...week.map((k) => day(TX, k)));
  const hiHi = Math.max(...week.map((k) => day(TX, k)));
  const frost = Math.min(...week.map((k) => day(TN, k)));
  const temps = range(hiLo, hiHi);

  if (month === 11 || month <= 1) {
    return { lvl: 'zima', icon: 'trees', title: 'Rostou hlavně houby na dřevě',
      reason: tMean < 0 ? `Mrzne (přes den ${temps}). Penízovka sametonohá a hlíva vyrazí při oblevě.`
        : `Přes den ${temps}, na pařezech a kmenech hledej penízovku sametonohou a hlívu.` };
  }

  let lvl = eff >= 25 ? 2 : eff >= 10 ? 1 : 0;
  const mm = Math.round(rain);
  const rained = rain < 1 ? 'Za 2 týdny skoro nepršelo' : `Za 2 týdny napršelo ${lvl ? '' : 'jen '}${mm} mm`;
  let icon = 'mushroom', reason = `${rained}, přes den ${temps}.`;
  if (frost <= -3 || tMean < 3) {
    lvl = 0;
    icon = 'snowflake';
    reason = frost <= -3 ? `${rained}, ale v noci mrzlo (až ${deg(frost)} °C).` : `${rained}, ale je chladno (přes den ${temps}).`;
  } else if (tMean > 20 && eff < 25) {
    lvl = 0;
    icon = 'sun';
    reason = `${rained} a je horko (přes den až ${deg(hiHi)} °C).`;
  } else {
    if (tMean < 8 || tMean > 20 || frost < 0) lvl = Math.min(lvl, 1);
    if (lvl < 2 && fresh >= 15 && fresh > rain - fresh) {
      icon = 'cloud-rain';
      reason = `Za 2 týdny napršelo ${mm} mm, hlavně až teď. Houby vyrazí asi za týden.`;
    } else if (!lvl) icon = 'sun';
  }
  return { lvl: ['ne', 'mozna', 'ano'][lvl], icon, title: ['Spíš nerostou', 'Možná něco najdeš', 'Houby rostou'][lvl], reason };
}
