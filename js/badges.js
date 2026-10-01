// Odznáčky (achievementy): podmínky a postup

import { SPECIES } from './data.js';
import { ICONS } from './icons.js';

const genusOf = (sp) => sp.latin.split(' ')[0];
const family = (sp) => sp.tax?.family?.[1];
const order = (sp) => sp.tax?.order?.[1];
const month = (f) => new Date(f.date).getMonth();
const dayKey = (f) => new Date(f.date).toDateString();

function kmBetween(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Počet různých druhů splňujících podmínku → postup vůči cíli
const countSpecies = (goal, test) => (c) => {
  const n = c.species.filter(test).length;
  return { n, goal };
};

const BRICHATKY = ['Lycoperdon', 'Apioperdon', 'Bovista', 'Calvatia', 'Scleroderma', 'Geastrum', 'Tulostoma', 'Lycoperdaceae'];
const PODIVNE = ['Phallus impudicus', 'Clathrus archeri', 'Sparassis crispa', 'Auricularia auricula-judae'];
const BAREVNE = [['Laccaria amethystina'], ['Cantharellus cibarius'], ['Amanita muscaria'], ['Russula virescens', 'Russula aeruginea', 'Russula cyanoxantha'], ['Aleuria aurantia']];

export const BADGES = [
  { id: 'prvni-ulovek', name: 'První úlovek', desc: 'Ulož první nález.', icon: 'mushroom', color: '#9a5b2e', check: (c) => ({ n: c.finds.length, goal: 1 }) },
  { id: 'desitka', name: 'Desítka', desc: 'Najdi 10 různých druhů.', icon: 'basket', color: '#72b04f', check: countSpecies(10, () => true) },
  { id: 'zkuseny-houbar', name: 'Zkušený houbař', desc: 'Najdi 50 různých druhů.', icon: 'trees', color: '#f5b638', check: countSpecies(50, () => true) },
  { id: 'mykolog', name: 'Mykolog', desc: 'Najdi 100 různých druhů.', icon: 'book-2', color: '#6cb6f0', check: countSpecies(100, () => true) },
  { id: 'legenda-lesa', name: 'Legenda lesa', desc: 'Najdi 200 různých druhů.', icon: 'star', color: '#a894ff', check: countSpecies(200, () => true) },

  { id: 'hribkovy-kral', name: 'Hříbkový král', desc: 'Najdi 5 druhů hřibovitých hub.', icon: 'trees', color: '#f5b638', check: countSpecies(5, (s) => family(s) === 'Boletaceae') },
  { id: 'lisci-stopa', name: 'Liščí stopa', desc: 'Najdi lišku obecnou a další 2 druhy lišek, stročků nebo lišáků.', icon: 'leaf', color: '#f5b638',
    check: (c) => {
      const g = c.species.filter((s) => ['Cantharellus', 'Craterellus', 'Hydnum'].includes(genusOf(s)));
      const hasLiska = g.some((s) => s.latin === 'Cantharellus cibarius');
      return { n: (hasLiska ? 1 : 0) + Math.min(2, g.length - (hasLiska ? 1 : 0)), goal: 3 };
    } },
  { id: 'lovec-muchomurek', name: 'Lovec muchomůrek', desc: 'Vyfoť 4 druhy muchomůrek. Jen fotit, nesbírat!', icon: 'camera', color: '#e5484d', check: countSpecies(4, (s) => genusOf(s) === 'Amanita') },
  { id: 'stromovy-detektiv', name: 'Stromový detektiv', desc: 'Najdi 5 druhů chorošů a dřevokazných hub.', icon: 'trees', color: '#8d6e4a', check: countSpecies(5, (s) => ['Polyporales', 'Hymenochaetales'].includes(order(s))) },
  { id: 'puf', name: 'Puf!', desc: 'Najdi 3 břichatky: pýchavky, pestřce, hvězdovky.', icon: 'circle-check', color: '#c9b79c', check: countSpecies(3, (s) => BRICHATKY.includes(genusOf(s)) || family(s) === 'Lycoperdaceae' || family(s) === 'Geastraceae') },
  { id: 'podivny-les', name: 'Podivný les', desc: 'Najdi 3 podivné houby: hadovku, květnatec, kotrč, ucho Jidášovo nebo hvězdovku.', icon: 'eye', color: '#a894ff', check: countSpecies(3, (s) => PODIVNE.includes(s.latin) || genusOf(s) === 'Geastrum') },
  { id: 'barevny-kosik', name: 'Barevný košík', desc: 'Vyfoť fialovou lakovku, žlutou lišku, červenou muchomůrku, zelenou holubinku a oranžovou mísenku.', icon: 'basket', color: '#ff9aa2',
    check: (c) => ({ n: BAREVNE.filter((opts) => c.species.some((s) => opts.includes(s.latin))).length, goal: 5 }) },

  { id: 'jarni-smrzovnik', name: 'Jarní smržovník', desc: 'Najdi smrž nebo kačenku od března do května.', icon: 'sun', color: '#72b04f',
    check: (c) => ({ n: c.finds.some((f) => ['Morchella', 'Verpa'].includes(genusOf(SPECIES[f.cls])) && [2, 3, 4].includes(month(f))) ? 1 : 0, goal: 1 }) },
  { id: 'zimni-houbar', name: 'Zimní houbař', desc: 'Ulož nález od prosince do února.', icon: 'calendar', color: '#6cb6f0', check: (c) => ({ n: c.finds.some((f) => [11, 0, 1].includes(month(f))) ? 1 : 0, goal: 1 }) },
  { id: 'cely-rok', name: 'Celý rok v lese', desc: 'Měj nález v každém ročním období.', icon: 'calendar', color: '#a894ff',
    check: (c) => ({ n: new Set(c.finds.map((f) => Math.floor(((month(f) + 1) % 12) / 3))).size, goal: 4 }) },
  { id: 'ranni-ptace', name: 'Ranní ptáče', desc: 'Ulož nález před sedmou ráno.', icon: 'sun', color: '#f5b638', check: (c) => ({ n: c.finds.some((f) => new Date(f.date).getHours() < 7) ? 1 : 0, goal: 1 }) },

  { id: 'respekt', name: 'Respekt!', desc: 'Vyfoť prudce jedovatou houbu. Jen vyfotit, nikdy nesbírat!', icon: 'skull', color: '#1f2d23', check: countSpecies(1, (s) => s.ed === 'prudce') },
  { id: 'dvojnik-odhalen', name: 'Dvojník odhalen', desc: 'Najdi oba druhy z nebezpečné dvojice (třeba bedlu a muchomůrku zelenou).', icon: 'zoom-in', color: '#e5484d',
    check: (c) => {
      const have = new Set(c.species.map((s) => s.i));
      const ok = c.species.some((s) => (s.look || []).some((l) => l.note && l.i != null && have.has(l.i)));
      return { n: ok ? 1 : 0, goal: 1 };
    } },
  { id: 'detektiv', name: 'Detektiv', desc: 'Přidej k 10 nálezům i druhou fotku (zespodu nebo třeň).', icon: 'zoom-in', color: '#6cb6f0', check: (c) => ({ n: c.finds.filter((f) => (f.photos || []).length >= 2).length, goal: 10 }) },
  { id: 'desatero', name: 'Houbařské desatero', desc: 'Přečti si všechny rady v appce.', icon: 'shield-check', color: '#72b04f', check: (c) => ({ n: c.kv.tipsRead ? 1 : 0, goal: 1 }) },
  { id: 'bystre-oko', name: 'Bystré oko', desc: 'Dej v kvízu 10 z 10.', icon: 'trophy', color: '#f5b638',
    check: (c) => ({ n: Object.values(c.kv.kvizBest || {}).some((n) => n >= 10) ? 1 : 0, goal: 1 }) },

  { id: 'urodny-den', name: 'Úrodný den', desc: 'Ulož 10 nálezů za jeden den.', icon: 'basket', color: '#f5b638',
    check: (c) => {
      const per = {};
      for (const f of c.finds) per[dayKey(f)] = (per[dayKey(f)] || 0) + 1;
      return { n: Math.max(0, ...Object.values(per)), goal: 10 };
    } },
  { id: 'staly-les', name: 'Můj les', desc: 'Vrať se 5× na stejné místo (různé dny, do 1 km).', icon: 'map-pin', color: '#72b04f',
    check: (c) => {
      const pts = c.finds.filter((f) => f.lat != null).slice(0, 400);
      let best = 0;
      for (const a of pts) {
        const days = new Set(pts.filter((b) => kmBetween(a, b) <= 1).map(dayKey));
        best = Math.max(best, days.size);
      }
      return { n: best, goal: 5 };
    } },
  { id: 'cestovatel', name: 'Cestovatel', desc: 'Najdi houby na 3 místech, která jsou od sebe aspoň 50 km.', icon: 'map-pin', color: '#6cb6f0',
    check: (c) => {
      const far = [];
      for (const f of c.finds.filter((x) => x.lat != null)) {
        if (far.every((g) => kmBetween(f, g) >= 50)) far.push(f);
        if (far.length >= 3) break;
      }
      return { n: far.length, goal: 3 };
    } },
];

export function evaluate(finds, kv = {}) {
  const real = finds.filter((f) => SPECIES[f.cls] && !SPECIES[f.cls].neg);
  const species = [...new Set(real.map((f) => f.cls))].map((i) => SPECIES[i]);
  const ctx = { finds: real, species, kv };
  return BADGES.map((b) => {
    const { n, goal } = b.check(ctx);
    return { ...b, n: Math.min(n, goal), goal, done: n >= goal, progress: Math.min(1, n / goal) };
  });
}

// Zástupný obrázek odznáčku (dokud nejsou vygenerované obrázky v img/odznaky/)
export function badgeSvg(b) {
  const ic = ICONS[b.icon] || ICONS.star;
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 4 l9 7 11-2 5 10 10 5-2 11 7 9-7 9 2 11-10 5-5 10-11-2-9 7-9-7-11 2-5-10-10-5 2-11-7-9 7-9-2-11 10-5 5-10 11 2z" fill="${b.color}" stroke="#1f2d23" stroke-width="3.5" stroke-linejoin="round"/><circle cx="50" cy="50" r="31" fill="#fffdf6" stroke="#1f2d23" stroke-width="3"/><g transform="translate(27 27) scale(1.9)" fill="none" stroke="#1f2d23" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ic}</g></svg>`;
}
