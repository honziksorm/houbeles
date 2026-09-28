// Dourčení otázkou: když si model váhá, zeptá se na znak, který nejlíp rozliší nejpravděpodobnější druhy.
// Znaky druhů jsou v druhy.json (pole q), připravuje je scripts/znaky.py.

import { SPECIES, isDangerous } from './data.js';

export const QUESTIONS = {
  spodek: {
    q: 'Co má pod kloboukem?', hint: 'Otoč houbu a podívej se zespodu.',
    opts: { lupeny: 'Lupeny', rourky: 'Rourky nebo póry', ostny: 'Ostny', listy: 'Tupé lišty nebo žilky', jine: 'Nic z toho (koule, pohárek, korál, kůrka…)' },
  },
  roste: { q: 'Na čem roste?', opts: { drevo: 'Na dřevě (pařez, kmen, větev)', zem: 'Na zemi' } },
  pochva: {
    q: 'Má třeň dole blanitou pochvu?', hint: 'Opatrně vyhrab celou nohu. Pochva vypadá jako kalíšek, ze kterého třeň vyrůstá.',
    opts: { ano: 'Ano, má pochvu', ne: 'Ne, nemá' },
  },
  prsten: { q: 'Má třeň prsten (límeček)?', opts: { ano: 'Ano', ne: 'Ne' } },
  mleko: { q: 'Roní po nalomení mléko?', hint: 'Nalom okraj klobouku nebo lupeny.', opts: { ano: 'Ano, roní', ne: 'Ne' } },
  modra: { q: 'Zmodrá po rozříznutí nebo zmáčknutí?', hint: 'Rozřízni třeň nebo zmáčkni rourky a chvilku počkej.', opts: { ano: 'Ano, modrá', ne: 'Ne' } },
};

const MISS = 0.1;         // odpověď k druhu nesedí: je 10× méně pravděpodobný
const MISS_DANGER = 0.5;  // u jedovatých jen mírně, odpověď je nesmí schovat
const MAX_QUESTIONS = 3;
const MIN_GAIN = 0.25;    // bitů: ptát se jen, když odpověď opravdu pomůže

const given = (answers) => Object.entries(answers || {}).filter(([, v]) => v && v !== 'nevim');

// Přepočítá pravděpodobnosti podle odpovědí
export function applyAnswers(probs, answers) {
  const list = given(answers);
  if (!list.length) return probs;
  const out = new Float32Array(probs.length);
  let z = 0;
  for (let i = 0; i < probs.length; i++) {
    const sp = SPECIES[i];
    let w = probs[i];
    for (const [k, v] of list) {
      const vals = sp.q?.[k];
      if (vals && !vals.includes(v)) w *= isDangerous(sp) ? MISS_DANGER : MISS;
    }
    out[i] = w;
    z += w;
  }
  for (let i = 0; i < out.length; i++) out[i] /= z;
  return out;
}

function entropy(ps) {
  const z = ps.reduce((a, b) => a + b, 0);
  let h = 0;
  for (const p of ps) if (p > 0) h -= (p / z) * Math.log2(p / z);
  return h;
}

// Vybere otázku s největším ziskem informace mezi nejpravděpodobnějšími houbami (nebo null)
export function pickQuestion(probs, answers = {}) {
  if (Object.keys(answers).length >= MAX_QUESTIONS) return null;
  const cand = [...probs.keys()].filter((i) => !SPECIES[i].neg && probs[i] >= 0.01)
    .sort((a, b) => probs[b] - probs[a]).slice(0, 15);
  if (cand.length < 2) return null;
  const top = cand[0];
  const danger = cand.some((i) => i !== top && probs[i] >= 0.03 && isDangerous(SPECIES[i]));
  if (probs[top] >= 0.9 && !danger) return null;

  const p = cand.map((i) => probs[i]);
  const h0 = entropy(p);
  let best = null;
  for (const [k, def] of Object.entries(QUESTIONS)) {
    if (k in answers) continue;
    if (!SPECIES[top].q?.[k]) continue; // ptáme se jen na to, co víme o nejpravděpodobnějším druhu
    const opts = Object.keys(def.opts);
    let known = 0;
    // P(odpověď | druh): známé hodnoty rovným dílem, neznámý druh = kterákoli odpověď
    const lik = cand.map((i) => {
      const vals = SPECIES[i].q?.[k];
      if (vals) known += probs[i];
      return opts.map((o) => (vals ? (vals.includes(o) ? 1 / vals.length : 0) : 1 / opts.length));
    });
    if (known < 0.6 * p.reduce((a, b) => a + b, 0)) continue;
    let eh = 0;
    let used = 0;
    opts.forEach((_, j) => {
      const post = p.map((pi, n) => pi * lik[n][j]);
      const pa = post.reduce((a, b) => a + b, 0);
      if (pa > 0) { eh += pa * entropy(post); used++; }
    });
    if (used < 2) continue; // všechny odpovědi by dopadly stejně
    const gain = h0 - eh / p.reduce((a, b) => a + b, 0);
    if (gain >= MIN_GAIN && (!best || gain > best.gain)) best = { key: k, ...def, gain };
  }
  return best;
}

// Krátký popis odpovědí pro výsledek a nález: „lupeny · na zemi · bez pochvy“
const SAID = {
  spodek: { lupeny: 'lupeny', rourky: 'rourky', ostny: 'ostny', listy: 'lišty', jine: 'bez lupenů i rourek' },
  roste: { drevo: 'na dřevě', zem: 'na zemi' },
  pochva: { ano: 'má pochvu', ne: 'bez pochvy' },
  prsten: { ano: 's prstenem', ne: 'bez prstenu' },
  mleko: { ano: 'roní mléko', ne: 'neroní mléko' },
  modra: { ano: 'modrá', ne: 'nemodrá' },
};
export function answersText(answers) {
  return given(answers).map(([k, v]) => SAID[k]?.[v]).filter(Boolean).join(' · ');
}
