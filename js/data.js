// Data o houbách: seznam druhů, jedlost, sezóna, žebříček skupin

import { fold } from './ui.js';

export let SPECIES = [];          // podle indexu třídy modelu
export let BY_ID = new Map();     // podle iNaturalist ID
export let SEASON = [];           // [třída][měsíc] pravděpodobnost výskytu
export let METRICS = null;        // naměřená přesnost modelu

export const EDIBILITY = {
  vyborna: { label: 'Jedlá', short: 'Jedlá', cls: 'ok' }, // „výborná“ by k jídlu lákala
  jedla: { label: 'Jedlá', short: 'Jedlá', cls: 'ok' },
  podminene: { label: 'Jedlá jen tepelně upravená', short: 'Podmíněně', cls: 'cond' },
  opatrne: { label: 'Opatrně, sporná', short: 'Opatrně', cls: 'bad', icon: 'alert-triangle' },
  nejedla: { label: 'Nejedlá', short: 'Nejedlá', cls: 'no' },
  psycho: { label: 'Jedovatá, psychoaktivní', short: 'Jedovatá', cls: 'bad', icon: 'alert-triangle' },
  jedovata: { label: 'Jedovatá', short: 'Jedovatá', cls: 'bad', icon: 'alert-triangle' },
  prudce: { label: 'Prudce jedovatá', short: 'Prudce jedovatá', cls: 'dead', icon: 'skull' },
};
export const isDangerous = (sp) => sp && ['prudce', 'jedovata', 'psycho'].includes(sp.ed);
export const isDeadly = (sp) => sp && sp.ed === 'prudce';
export const isEdible = (sp) => sp && ['vyborna', 'jedla', 'podminene'].includes(sp.ed);
// Štítek se ukazuje i u výsledku určení: varuje, nikdy neslibuje jedlost
export const hasWarning = (sp) => sp && ['prudce', 'jedovata', 'psycho', 'opatrne'].includes(sp.ed);

// Lupenaté houby: mezi nimi jsou ty nejjedovatější (muchomůrky, pavučince, čechratky, závojenky)
const GILLED = new Set(['Amanita', 'Lepiota', 'Macrolepiota', 'Chlorophyllum', 'Agaricus', 'Russula', 'Lactarius', 'Lactifluus',
  'Cortinarius', 'Tricholoma', 'Clitocybe', 'Infundibulicybe', 'Lepista', 'Entoloma', 'Inocybe', 'Inosperma', 'Galerina',
  'Armillaria', 'Pleurotus', 'Paxillus', 'Hypholoma', 'Pholiota', 'Kuehneromyces', 'Gymnopilus', 'Psilocybe', 'Stropharia',
  'Hygrophorus', 'Hygrocybe', 'Cuphophyllus', 'Calocybe', 'Collybia', 'Gymnopus', 'Rhodocollybia', 'Marasmius', 'Mycena',
  'Laccaria', 'Coprinus', 'Coprinopsis', 'Coprinellus', 'Panaeolus', 'Gomphidius', 'Chroogomphus', 'Hygrophoropsis', 'Megacollybia']);
export const isGilled = (sp) => !!sp && !sp.neg && ((sp.traits?.hymenium || []).some((v) => v.startsWith('lupen'))
  || GILLED.has(sp.latin.split(' ')[0]));

// Kdy je určení „nejspíš“: při ≥ 90 % měl model v testu pravdu v 97 % případů, pod tím výrazně méně
export const SURE = 0.9;
// Jistota slovy: procenta by působila přesněji, než model doopravdy je
export const sureWord = (p) => (p >= SURE ? 'Nejspíš' : p >= 0.5 ? 'Možná' : 'Nejisté');
export const findConf = (f) => f.top?.find(([i]) => i === f.cls)?.[1] ?? null;
// Nález je nejistý, dokud druh někdo nepotvrdí nebo neopraví a appka si nebyla jistá
export const isUnsure = (f) => !f.fixed && (findConf(f) ?? 0) < SURE;

const TRAIT_LABEL = { hymenium: 'výtrusorodá vrstva', spore: 'výtrusný prach', stipe: 'třeň', ecology: 'výživa', cap: 'klobouk' };
export const traitLabel = (k) => TRAIT_LABEL[k] || k;

let loading;
export function loadData() {
  loading ||= Promise.all([
    fetch('data/druhy.json').then((r) => r.json()),
    fetch('data/hlava.json').then((r) => r.json()),
  ]).then(([sp, head]) => {
    SPECIES = sp;
    BY_ID = new Map(sp.map((s) => [s.id, s]));
    SEASON = head.season;
    METRICS = head.metrics || null;
    for (const s of sp) s._q = fold(`${s.cz} ${s.latin}`);
    return { species: sp, head };
  });
  return loading;
}

export const thumb = (sp, n = 0) => (sp.img && sp.img[n] ? `data/nahledy/${sp.img[n].f}` : 'img/bez-fotky.svg');

// Jak moc druh roste v daném měsíci (0–1, relativně k jeho nejlepšímu měsíci)
export function seasonScore(i, month) {
  const row = SEASON[i];
  if (!row) return 0;
  return row[month] / Math.max(...row);
}

// Co teď roste: běžné druhy, které jsou tento měsíc v sezóně
export function inSeason(month, n = 12) {
  return SPECIES.filter((s) => !s.neg && s.cnt > 20)
    .map((s) => ({ s, score: seasonScore(s.i, month) * Math.log(1 + s.cnt) }))
    .filter((x) => seasonScore(x.s.i, month) > 0.55)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.s);
}

export function search(q, filter = 'vse', month = new Date().getMonth()) {
  const f = fold(q.trim());
  return SPECIES.filter((s) => {
    if (s.neg) return false;
    if (f && !s._q.includes(f)) return false;
    if (filter === 'jedovate') return ['jedovata', 'psycho', 'prudce', 'opatrne'].includes(s.ed);
    if (filter === 'prudce') return s.ed === 'prudce';
    if (filter === 'sezona') return seasonScore(s.i, month) > 0.55;
    return true;
  }).sort((a, b) => b.cnt - a.cnt);
}

// Žebříček jako v Seeku: Houba → řád → čeleď → rod → druh
export const LEVELS = ['fungi', 'order', 'family', 'genus', 'species'];
export const LEVEL_NAME = { fungi: 'Houba', order: 'Řád', family: 'Čeleď', genus: 'Rod', species: 'Druh' };

function groupKey(sp, level) {
  if (level === 'fungi') return sp.neg ? `neg:${sp.i}` : 'fungi';
  if (level === 'species') return `s:${sp.i}`;
  const t = sp.tax && sp.tax[level];
  return t ? `${level}:${t[0]}` : `s:${sp.i}`;
}

export function groupName(sp, level) {
  if (level === 'fungi') return sp.neg ? sp.cz : 'Houby';
  if (level === 'species') return sp.cz;
  const t = sp.tax && sp.tax[level];
  if (!t) return sp.cz;
  const cz = t[2] ? t[2][0].toUpperCase() + t[2].slice(1) : null;
  return cz || t[1];
}

// Pro každou úroveň spočítá, jak jistě do ní fotka patří (sčítá pravděpodobnosti druhů ve skupině)
export function ladder(probs) {
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  const top = SPECIES[best];
  return LEVELS.map((level) => {
    const key = groupKey(top, level);
    let mass = 0;
    for (let i = 0; i < probs.length; i++) if (groupKey(SPECIES[i], level) === key) mass += probs[i];
    return { level, name: groupName(top, level), mass, latin: level === 'species' ? top.latin : top.tax?.[level]?.[1] };
  });
}

export function topK(probs, k = 5) {
  const idx = [...probs.keys()].sort((a, b) => probs[b] - probs[a]).slice(0, k);
  return idx.map((i) => ({ sp: SPECIES[i], p: probs[i] }));
}
