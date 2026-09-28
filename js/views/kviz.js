// Poznávací kvíz: 10 fotek, 4 možnosti, trénink nebezpečných dvojníků

import { html, ic, plural } from '../ui.js';
import { loadData, SPECIES, EDIBILITY, thumb, isDangerous, seasonScore } from '../data.js';
import { getKV, setKV } from '../db.js';
import { BADGES } from '../badges.js';
import { edTag, lookalikeAlerts, altRow } from './result.js';
import { showBadgeModal } from './finds.js';

const ROUND = 10;
const MODES = {
  bezne: { name: 'Běžné houby', desc: 'Houby, které teď rostou v lese.', icon: 'mushroom' },
  dvojnici: { name: 'Dvojníci', desc: 'Dvojice, které se snadno spletou, a jak je rozlišit.', icon: 'eye' },
};
const DISC = 'Kvíz je jen na učení. Nikdy nejez houbu jen podle fotky: i jedlé houby mají jedovaté dvojníky.';

let game = null; // rozehrané kolo, přežije odskok do atlasu a zpět

const genus = (sp) => sp.latin.split(' ')[0];
const family = (sp) => sp.tax?.family?.[1];
const usable = (sp) => sp && !sp.neg && sp.cz && sp.cz !== sp.latin; // jen druhy s českým jménem
const edible = (sp) => ['vyborna', 'jedla', 'podminene'].includes(sp.ed);
const noteOf = (a, b) => (a.look || []).find((l) => l.i === b.i && l.note)?.note;
const pairNote = (a, b) => noteOf(a, b) || noteOf(b, a);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Náhodný výběr n prvků bez opakování, podle vah
function pickWeighted(items, weight, n = items.length) {
  const left = items.map((x) => ({ x, w: weight(x) }));
  const out = [];
  while (out.length < n && left.length) {
    let r = Math.random() * left.reduce((s, o) => s + o.w, 0);
    let k = 0;
    while (k < left.length - 1 && (r -= left[k].w) > 0) k++;
    out.push(left.splice(k, 1)[0].x);
  }
  return out;
}

// Běžnější druhy dřív, ale s trochou náhody
const common = (list) => list.map((s) => [s, Math.log(1 + (s.cnt || 0)) + Math.random() * 2]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);

// Špatné odpovědi: nejdřív ověření dvojníci, pak s kým si ho plete model, stejný rod, čeleď a nakonec cokoli běžného
function wrongOptions(sp, forced, pool) {
  const out = [...forced];
  const seen = new Set([sp.i, ...forced.map((s) => s.i)]);
  const add = (list) => {
    for (const s of list) {
      if (out.length >= 3) return;
      if (!usable(s) || seen.has(s.i)) continue;
      seen.add(s.i);
      out.push(s);
    }
  };
  const look = (sp.look || []).filter((l) => l.i != null);
  const back = SPECIES.filter((s) => s.look?.some((l) => l.i === sp.i)); // druhy, které ho mají mezi dvojníky
  add(shuffle([...look.filter((l) => l.note).map((l) => SPECIES[l.i]), ...back.filter((s) => noteOf(s, sp))]));
  add(shuffle(look.map((l) => SPECIES[l.i]))); // s těmi si ho plete model
  add(common(SPECIES.filter((s) => genus(s) === genus(sp))));
  add(shuffle(back));
  if (family(sp)) add(common(SPECIES.filter((s) => family(s) === family(sp))));
  add(shuffle([...pool]));
  return out;
}

// Ručně ověřené dvojice (dvojník s poznámkou, jak je rozlišit)
function pairs() {
  const map = new Map();
  for (const a of SPECIES) {
    for (const l of a.look || []) {
      const b = l.note && l.i != null ? SPECIES[l.i] : null;
      if (!b || !usable(a) || !usable(b) || !a.img?.length || !b.img?.length) continue;
      const key = a.i < b.i ? `${a.i}-${b.i}` : `${b.i}-${a.i}`;
      if (!map.has(key)) map.set(key, [a, b]);
    }
  }
  return [...map.values()];
}

function newRound(mode) {
  const month = new Date().getMonth();
  const season = (s) => seasonScore(s.i, month);
  // běžné druhy s fotkou, ty v sezóně mají větší šanci
  const pool = SPECIES.filter((s) => usable(s) && s.img?.length).sort((a, b) => b.cnt - a.cnt).slice(0, 120);
  const weight = (s) => Math.log(1 + s.cnt) ** 2 * (season(s) > 0.55 ? 3 : 0.3 + season(s));
  const qs = [];
  const used = new Set();
  const add = (sp, forced = []) => {
    used.add(sp.i);
    const opts = shuffle([sp, ...wrongOptions(sp, forced, pool)]);
    qs.push({ sp, n: Math.floor(Math.random() * sp.img.length), opts, pair: forced[0] || null, chosen: null });
  };
  if (mode === 'dvojnici') {
    for (const pair of pickWeighted(pairs(), ([a, b]) => 0.3 + Math.max(season(a), season(b)))) {
      if (qs.length >= ROUND) break;
      const sp = shuffle([...pair]).find((s) => !used.has(s.i)); // ptáme se na kteréhokoli z dvojice
      if (sp) add(sp, [pair.find((s) => s !== sp)]);
    }
  }
  for (const sp of pickWeighted(pool.filter((s) => !used.has(s.i)), weight, ROUND - qs.length)) add(sp);
  for (const q of qs) new Image().src = thumb(q.sp, q.n); // fotky dopředu, ať kvíz nečeká
  return { mode, qs, k: 0, done: false, prev: null };
}

const scoreOf = (g) => g.qs.filter((q) => q.chosen === q.sp).length;

function optsHtml(q) {
  return html`<div class="kviz-opts ${q.chosen ? 'done' : ''}" id="opts">${q.opts.map((s, k) => {
    const cls = !q.chosen ? '' : s === q.sp ? 'ok' : s === q.chosen ? 'bad' : 'off';
    return html`<button class="btn block ${cls}" type="button" data-opt="${k}"><span>${s.cz}</span>${cls === 'ok' ? ic('check') : cls === 'bad' ? ic('x') : ''}</button>`;
  })}</div>`;
}

// Po odpovědi: správné jméno, jedlost, varování a jak dvojníky rozlišit
function afterHtml(q, last) {
  if (!q.chosen) return '';
  const { sp, chosen: ch } = q;
  const ok = ch === sp;
  const label = (s) => EDIBILITY[s.ed].label.toLowerCase();
  const danger = [];
  if (isDangerous(sp)) danger.push(html`<b>${sp.cz}: ${label(sp)} houba.</b> ${!ok && !isDangerous(ch) ? 'Tahle záměna by v lese mohla skončit otravou.' : 'Jen fotit, nikdy nesbírat.'}`);
  if (!ok && isDangerous(ch)) danger.push(html`<b>Tvůj tip ${ch.cz.toLowerCase()}: ${label(ch)} houba.</b> Dobře si zapamatuj rozdíl.`);
  // poznámky k dvojníkům: nejdřív k tipu, pak k druhu z dvojice, pak k ostatním možnostem
  const order = [...new Set([ok ? null : ch, q.pair, ...q.opts])].filter((s) => s && s !== sp);
  const notes = order.map((o) => ({ o, note: pairNote(sp, o) }))
    .filter((x, k, all) => x.note && all.findIndex((y) => y.note === x.note) === k).slice(0, 2);
  return html`<div class="kviz-fb" id="fb">
    <div class="card pad kviz-ans ${ok ? 'ok' : 'bad'}">
      <div class="verdict">${ic(ok ? 'circle-check' : 'x')}${ok ? 'Správně!' : 'Vedle! Správně je:'}</div>
      <h2 class="kviz-name">${sp.cz}</h2>
      <div class="latin">${sp.latin}</div>
      <div style="margin-top:8px">${edTag(sp)}</div>
      ${ok ? '' : html`<div class="kviz-tip">Tvůj tip: <b>${ch.cz}</b>${edTag(ch, true)}</div>`}
    </div>
    ${danger.map((d) => html`<div class="card alert danger">${ic('skull')}<div>${d}</div></div>`)}
    ${notes.map(({ o, note }) => html`<div class="card alert ${isDangerous(o) ? 'danger' : ''}">${ic('bulb')}<div><b>${sp.cz} × ${o.cz.toLowerCase()}.</b> Jak je rozlišit: ${note}</div></div>`)}
    ${!notes.length && edible(sp) ? lookalikeAlerts(sp, 1) : ''}
  </div>
  <button class="btn primary block kviz-next" id="next" type="button">${last ? 'Výsledek' : 'Další'}${ic('chevron-right')}</button>`;
}

export async function render(root, params) {
  await loadData();
  let alive = true;
  if (params.has('novy')) {
    if (game?.done) game = null; // z atlasu: dohrané kolo začne znovu, rozehrané pokračuje
    history.replaceState(null, '', '#/kviz');
  }

  async function drawStart() {
    const best = await getKV('kvizBest', {});
    const kola = await getKV('kvizKola', 0);
    if (!alive) return;
    root.innerHTML = html`<div class="page">
      <a class="btn small" href="#/atlas" style="margin-bottom:12px">${ic('arrow-left')}Atlas</a>
      <h1 class="page-title">Poznávací kvíz</h1>
      <p class="kviz-intro">${ROUND} fotek, vždy 4 možnosti. Nauč se poznávat běžné houby a nesplést si je s jedovatými dvojníky.</p>
      <div class="stack">${Object.entries(MODES).map(([k, m]) => html`<button class="card kviz-mode ${k}" type="button" data-mode="${k}">
        <span class="kviz-znak">${ic(m.icon)}</span>
        <span class="t"><b>${m.name}</b><span>${m.desc}</span><small>${best[k] != null ? `Tvůj rekord: ${best[k]} z ${ROUND}` : 'Zatím nehráno'}</small></span>
        ${ic('chevron-right')}
      </button>`)}</div>
      ${kola ? html`<p class="count-line">Máš za sebou ${plural(kola, 'kolo', 'kola', 'kol')}.</p>` : ''}
      <p class="disc">${DISC}</p>
    </div>`;
  }

  function drawQuestion() {
    const q = game.qs[game.k];
    const last = game.k === ROUND - 1;
    root.innerHTML = html`<div class="page">
      <div class="kviz-top">
        <button class="btn small ghost" id="quit" type="button" aria-label="Ukončit kvíz">${ic('x')}</button>
        <div class="progress"><i style="width:${((game.k + (q.chosen ? 1 : 0)) / ROUND) * 100}%"></i></div>
        <span class="n">${game.k + 1}/${ROUND}</span>
      </div>
      <div class="card kviz-photo"><img src="${thumb(q.sp, q.n)}" alt="Fotka houby"></div>
      <h1 class="kviz-q">Co je to za houbu?</h1>
      ${game.mode === 'dvojnici' ? html`<p class="kviz-hint">Mezi možnostmi je i dvojník.</p>` : ''}
      ${optsHtml(q)}
      <div id="after">${afterHtml(q, last)}</div>
      <p class="disc">${DISC}</p>
    </div>`;
  }

  function drawEnd() {
    const score = scoreOf(game);
    const missed = game.qs.filter((q) => q.chosen !== q.sp);
    const line = score === ROUND ? 'Bez jediné chyby. Klobouk dolů!'
      : score >= 8 ? 'Skvělé, houby ti jdou.'
      : score >= 5 ? 'Dobrý základ. Další kolo bude ještě lepší.'
      : 'Houby umí pěkně mást. Zkus to znovu, každé kolo pomůže.';
    root.innerHTML = html`<div class="page">
      <div class="card kviz-score ${score === ROUND ? 'perfect' : ''}">
        <span class="kviz-znak pop">${ic(score === ROUND ? 'trophy' : score >= 5 ? 'star' : 'mushroom')}</span>
        <small>${MODES[game.mode].name}</small>
        <b>${score} z ${ROUND}</b>
        <p>${line}</p>
        ${game.prev != null && score > game.prev ? html`<span class="tag ok">${ic('sparkles')}Nový rekord!</span>`
          : game.prev != null ? html`<span class="muted">Tvůj rekord: ${game.prev} z ${ROUND}</span>` : ''}
      </div>
      ${missed.length ? html`<h2 class="section-title">${ic('book-2')}Tyhle houby ti utekly</h2>
        ${missed.map((q) => altRow(q.sp, null))}` : ''}
      <div class="res-actions">
        <button class="btn primary block" id="again" type="button">${ic('refresh')}Hrát znovu</button>
        <a class="btn block" href="#/atlas">${ic('arrow-left')}Zpět do atlasu</a>
        <button class="btn small ghost" id="modes" type="button">Změnit režim</button>
      </div>
      <p class="disc">${DISC}</p>
    </div>`;
  }

  const draw = () => (!game ? drawStart() : game.done ? drawEnd() : drawQuestion());

  function answer(k) {
    const q = game.qs[game.k];
    if (q.chosen) return;
    q.chosen = q.opts[k];
    root.querySelector('#opts').outerHTML = String(optsHtml(q));
    root.querySelector('.kviz-top .progress i').style.width = `${((game.k + 1) / ROUND) * 100}%`;
    const after = root.querySelector('#after');
    after.innerHTML = String(afterHtml(q, game.k === ROUND - 1));
    after.querySelector('#fb').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function next() {
    if (game.done) return;
    if (game.k < ROUND - 1) {
      game.k++;
      drawQuestion();
      window.scrollTo(0, 0);
      return;
    }
    // konec kola: rekord a počet kol do úložiště
    game.done = true;
    const g = game;
    const score = scoreOf(g);
    const best = await getKV('kvizBest', {});
    g.prev = best[g.mode] ?? null;
    if (g.prev == null || score > g.prev) await setKV('kvizBest', { ...best, [g.mode]: score });
    await setKV('kvizKola', (await getKV('kvizKola', 0)) + 1);
    if (!alive || game !== g) return;
    drawEnd();
    window.scrollTo(0, 0);
    // první 10 z 10 = nový odznáček
    if (score >= ROUND && !Object.values(best).some((n) => n >= ROUND)) {
      const b = BADGES.find((x) => x.id === 'bystre-oko');
      if (b) showBadgeModal({ ...b, done: true, progress: 1, n: 1, goal: 1 }, true);
    }
  }

  root.onclick = (e) => {
    const b = e.target.closest('[data-mode], [data-opt], #next, #quit, #again, #modes');
    if (!b) return;
    if (b.dataset.mode) game = newRound(b.dataset.mode);
    else if (b.dataset.opt != null) return answer(+b.dataset.opt);
    else if (b.id === 'next') return next();
    else if (b.id === 'again') game = newRound(game.mode);
    else game = null; // ukončit kvíz nebo změnit režim
    draw();
    window.scrollTo(0, 0);
  };
  await draw();
  return () => { alive = false; root.onclick = null; };
}
