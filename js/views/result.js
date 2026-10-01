// Výsledek určení

import { html, ic, toast, fmtDate, flyToBasket } from '../ui.js';
import { loadData, SPECIES, EDIBILITY, topK, ladder, thumb, isDangerous, isEdible, hasWarning, isGilled, traitLabel, SURE, sureWord } from '../data.js';
import { savePhotos } from '../sdileni.js';
import { combine, modelVersion } from '../engine.js';
import { applyFinds, refreshFindEmbeddings } from '../uceni.js';
import { session, isIOS } from '../state.js';
import { addFind, allFinds, getKV, blobUrl } from '../db.js';
import { evaluate } from '../badges.js';
import { applyAnswers, pickQuestion, answersText } from '../dourceni.js';
import { showBadgeModal } from './finds.js';

export function edTag(sp, short = false) {
  if (sp.neg) return html`<span class="tag neg">Není houba</span>`;
  const e = EDIBILITY[sp.ed];
  if (!e) return html`<span class="tag unknown">Jedlost neuvádím</span>`;
  return html`<span class="tag ${e.cls}">${e.icon ? ic(e.icon) : ''}${short ? e.short : e.label}</span>`;
}

// U určení a nálezů jen varovné štítky (jedovatá, opatrně, není houba). Jedlost je jen v atlasu:
// appka nesmí nikoho navádět, aby houbu snědl podle fotky (jako Seek a iNaturalist).
export const warnTag = (sp, short = false) => (sp.neg || hasWarning(sp) ? edTag(sp, short) : '');

export const unsureTag = () => html`<span class="tag unsure">${ic('alert-triangle')}Nejisté určení</span>`;

// Pevné varování u každého určení a nálezu
export const eatWarning = () => html`<div class="card alert eat">${ic('alert-triangle')}<div><b>Nejez houbu jen podle appky.</b> Může se splést. Před jídlem ji ukaž zkušenému houbaři nebo v <a href="#/rady?k=poradny">houbařské poradně</a>.</div></div>`;

export const gilledWarning = (sp) => (isGilled(sp) && !isDangerous(sp)
  ? html`<div class="card alert">${ic('alert-triangle')}<div><b>Lupenatá houba.</b> Mezi lupenatými jsou ty nejjedovatější (muchomůrky, pavučince, čechratky). Bez zkušeného houbaře je nesbírej.</div></div>` : '');

export function traitChips(sp) {
  if (!sp.traits) return '';
  return html`<div class="traits">${Object.entries(sp.traits).map(([k, v]) => html`<span><b>${traitLabel(k)}:</b> ${v.join(', ')}</span>`)}</div>`;
}

export function lookalikeAlerts(sp, max = 3) {
  const list = (sp.look || []).filter((l) => l.note).slice(0, max);
  return list.map((l) => {
    const other = l.i != null ? SPECIES[l.i] : null;
    const danger = other ? isDangerous(other) : true;
    const name = other ? other.cz : l.genus === 'Cortinarius' ? 'pavučinci' : l.genus;
    return html`<div class="card alert ${danger ? 'danger' : ''}">${ic('alert-triangle')}<div><b>Pozor na záměnu: ${other ? html`<a href="#/druh/${other.id}">${name}</a>` : name}.</b> ${l.note}</div></div>`;
  });
}

export async function render(root) {
  await loadData();
  const r = session.result;
  if (!r) { location.hash = '#/'; return; }
  const month = new Date(r.date).getMonth();
  r.answers ||= {};
  const probs0 = combine(r.photos.map((p) => p.logp), month, 'sum');
  const embs = r.photos.map((ph) => ph.embedding).filter(Boolean);
  // tvoje potvrzené nálezy; jen bonus, chyba v něm nesmí zastavit určení
  const { probs: probsP, match } = await applyFinds(probs0, embs).catch(() => ({ probs: probs0, match: null }));
  // mezitím se odešlo jinam (překreslení po odpovědi je asynchronní): nic nepřepisovat
  if (session.result !== r || !location.hash.startsWith('#/vysledek')) return;
  // Bonus z tvých nálezů jen mění pořadí tipů. Jistota a všechna varování se počítají bez něj
  // a jedovatý druh z prvního místa nikdy nesesadí (nález mohl být potvrzený omylem).
  const probsA = applyAnswers(probs0, r.answers);
  const first = (pr) => pr.reduce((b, v, i) => (v > pr[b] ? i : b), 0);
  let probs = applyAnswers(probsP, r.answers);
  if (isDangerous(SPECIES[first(probsA)]) && first(probs) !== first(probsA)) probs = probsA;
  const top = topK(probs, 8);
  const lad = ladder(probs);
  const best = top[0];
  const fungiTop = top.filter((t) => !t.sp.neg);
  const notFungus = best.sp.neg && lad[0].mass < 0.5;
  const sp = notFungus ? fungiTop[0].sp : best.sp;
  const p = Math.min(probs[sp.i], probsA[sp.i]);
  const genus = lad[3];
  const confCls = p >= SURE ? '' : p >= 0.5 ? 'mid' : 'low';
  const others = fungiTop.filter((t) => t.sp !== sp && t.p >= 0.01).slice(0, 4);
  // jedovaté druhy hlídáme i podle určení před odpověďmi a bonusem: nic je nesmí schovat.
  // Pod 50 % se varuje i před prvním tipem (nahoře pak není jeho štítek).
  const dangers = [...new Set([...topK(probs0, 8), ...top].map((t) => t.sp))]
    .filter((s) => (s !== sp || p < 0.5) && !s.neg && isDangerous(s))
    .map((s) => ({ sp: s, p: Math.max(probs0[s.i], probs[s.i], probsA[s.i]) }))
    .filter((d) => d.p >= 0.03).sort((a, b) => b.p - a.p).slice(0, 2);
  const ask = notFungus ? null : pickQuestion(probs, r.answers);
  const answered = answersText(r.answers);
  const urls = r.photos.map((ph) => blobUrl(ph.blob));

  let headline, sub;
  if (notFungus) {
    headline = 'Tohle asi není houba';
    sub = html`Vypadá to na: <b>${best.sp.cz.toLowerCase()}</b>. Kdyby to přece jen byla houba, nejbližší tipy:`;
  } else if (p >= 0.5) {
    headline = sp.cz;
  } else if (genus.mass >= 0.7) {
    headline = `Nejspíš ${genus.name.toLowerCase()}`;
    sub = html`Rod nejspíš sedí, druh je zatím nejistý. Přidej fotku zespodu nebo třeně.`;
  } else {
    headline = 'Tohle s jistotou neurčím';
    sub = html`Zkus houbu vyfotit zblízka, ostře a z více stran. Nejbližší tipy:`;
  }

  root.innerHTML = html`<div>
    <div class="res-photos">
      <img class="main" src="${urls[urls.length - 1]}" alt="">
      <a class="round back" href="#/" aria-label="Zpět">${ic('arrow-left')}</a>
      ${urls.length > 1 ? html`<div class="strip">${urls.map((u) => html`<img src="${u}" alt="">`)}</div>` : ''}
      ${notFungus ? '' : html`<div class="conf ${confCls}"><div><b>${sureWord(p)}</b><small>tip appky</small></div></div>`}
    </div>
    <div class="res-body">
      ${notFungus ? html`<span class="tag neg">Není houba</span>` : p >= 0.5 || isDangerous(sp) ? warnTag(sp) : ''}
      <h1 class="res-name">${headline}</h1>
      ${!notFungus && p >= 0.5 ? html`<div class="latin">${sp.latin}</div>` : ''}
      ${sub ? html`<p style="margin:8px 0 0">${sub}</p>` : ''}
      ${notFungus ? '' : p < 0.5
        ? html`<div class="card alert danger">${ic('alert-triangle')}<div><b>Nejisté určení, nesbírej ji k jídlu.</b> Podle ${r.photos.length > 1 ? 'těchhle fotek' : 'téhle fotky'} nejde houbu spolehlivě poznat.</div></div>`
        : p < SURE ? html`<div class="card alert">${ic('alert-triangle')}<div><b>Appka si není jistá.</b> Ověř znaky: ${r.photos.length < 3 ? 'přidej fotku zespodu nebo třeně, ' : ''}${ask ? 'odpověz na otázku níž, ' : ''}porovnej ji s dvojníky. Při pochybnosti ji ukaž houbaři.</div></div>` : ''}
      ${notFungus ? '' : eatWarning()}
      ${!notFungus && p >= 0.5 ? html`
        ${sp.edNote && !isEdible(sp) ? html`<div class="card alert info">${ic('info-circle')}<div>${sp.edNote}</div></div>` : ''}
        ${traitChips(sp)}` : ''}
      ${dangers.map((d) => html`<div class="card alert danger">${ic('skull')}<div><b>Pozor: mezi možnostmi je i ${d.sp.cz.toLowerCase()}</b> (${EDIBILITY[d.sp.ed].label.toLowerCase()}). Bez jistoty od houbaře nesbírat.</div></div>`)}
      ${ask ? html`<div class="card ask">
        <div class="ask-head">${ic('bulb')}Pomoz mi to dourčit</div>
        <p class="ask-q">${ask.q}</p>
        ${ask.hint ? html`<p class="ask-hint">${ask.hint}</p>` : ''}
        <div class="ask-opts">${Object.entries(ask.opts).map(([v, label]) => html`<button class="btn block" type="button" data-ans="${ask.key}:${v}">${label}</button>`)}
          <button class="btn small ghost" type="button" data-ans="${ask.key}:nevim">Nevím, přeskočit</button></div>
      </div>` : ''}
      ${answered ? html`<p class="ask-done">${ic('check')}<span>Podle tvých odpovědí: <b>${answered}</b></span><button class="btn small ghost" type="button" id="resetAns">Změnit</button></p>` : ''}
      ${match && match.find.cls === sp.i ? html`<p class="ask-done">${ic('heart')}<span>Podobá se tvému nálezu z ${fmtDate(match.find.date)}.</span><a class="btn small ghost" href="#/nalez/${match.find.id}">Ukázat</a></p>` : ''}
      ${!notFungus && p >= 0.5 ? html`${lookalikeAlerts(sp)}${gilledWarning(sp)}` : ''}

      ${!notFungus && p >= 0.5 ? html`<h2 class="section-title">Takhle vypadá ${sp.cz.toLowerCase()}</h2>
        <div class="refs">${(sp.img || []).map((_, n) => html`<a href="#/druh/${sp.id}"><img loading="lazy" src="${thumb(sp, n)}" alt=""></a>`)}</div>` : ''}

      ${(p < 0.5 || notFungus) ? html`<div class="stack" style="margin-top:6px">${[sp, ...others.map((o) => o.sp)].slice(0, 5).map((s) => altRow(s))}</div>`
        : others.length ? html`<h2 class="section-title">Další možnosti</h2>${others.map((o) => altRow(o.sp))}` : ''}

      <div class="res-actions">
        ${r.photos.length < 3 ? html`<a class="btn green block" href="#/hledat?pridat=1">${ic('photo-plus')}${r.photos.length === 1 ? 'Přidat fotku zespodu nebo třeně' : 'Přidat ještě jednu fotku'}</a>` : ''}
        <button class="btn primary block" id="save" type="button">${ic('basket')}Uložit do nálezů</button>
        <a class="btn block" href="#/hledat">${ic('camera')}Určit jinou houbu</a>
      </div>
      <p class="disc">Houbeles je pomůcka na učení, ne houbař. Určení z fotky může být chybné.</p>
    </div>
  </div>`;

  root.querySelector('#save').onclick = async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    try {
      await saveFind(btn);
    } catch (e) {
      console.error(e);
      // nález už se uložil a selhalo až něco potom: neukládat podruhé, rovnou ho ukázat
      if (btn.dataset.saved) { location.hash = `#/nalez/${btn.dataset.saved}`; return; }
      btn.disabled = false;
      toast('Uložení se nepovedlo. Zkus to znovu.');
    }
  };
  const saveFind = async (btn) => {
    const kv = { tipsRead: await getKV('tipsRead'), kvizBest: await getKV('kvizBest') };
    const before = evaluate(await allFinds(), kv);
    const find = {
      date: r.date,
      cls: sp.i,
      // uložená jistota bez bonusu z nálezů (podle ní se nález značí jako nejistý)
      top: top.slice(0, 5).map((t) => [t.sp.i, +Math.min(t.p, probsA[t.sp.i]).toFixed(4)]),
      photos: r.photos.map((ph) => ph.blob),
    };
    if (answered) find.answers = r.answers;
    if (r.photos.some((ph) => ph.full)) find.full = r.photos.map((ph) => ph.full || null); // celé snímky z fotoaparátu
    if (embs.length === r.photos.length) {
      const embV = await modelVersion().catch(() => null);
      if (embV) Object.assign(find, { emb: embs, embV });
    }
    if ((await getKV('geo', true)) && navigator.geolocation) {
      const pos = await new Promise((res) => navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 8000, maximumAge: 120000, enableHighAccuracy: true }));
      if (pos) Object.assign(find, { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) });
    }
    const id = await addFind(find);
    btn.dataset.saved = id;
    session.result = null;
    flyToBasket(find.photos[find.photos.length - 1], btn.getBoundingClientRect());
    // fotky z fotoaparátu i do telefonu (jako Seek), vybrané z galerie tam už jsou
    // na iPhonu by to pokaždé otevřelo nabídku sdílení, proto tam jen na přání
    const saved = find.full && (await getKV('galerie', !isIOS())) ? await savePhotos(find, 1).catch(() => null) : null;
    toast(saved ? 'Uloženo do nálezů i do telefonu' : 'Uloženo do nálezů', { kind: 'ok' });
    const after = evaluate(await allFinds(), kv);
    const fresh = after.filter((b, k) => b.done && !before[k].done);
    location.hash = `#/nalez/${id}`;
    for (const b of fresh) await showBadgeModal(b, true);
  };
  refreshFindEmbeddings(); // starším opraveným nálezům dopočítá otisky na pozadí
  root.onclick = (e) => {
    const b = e.target.closest('[data-ans]');
    if (b) {
      const [k, v] = b.dataset.ans.split(':');
      r.answers[k] = v;
      render(root);
    } else if (e.target.closest('#resetAns')) {
      r.answers = {};
      render(root);
    }
  };
  return () => { root.onclick = null; };
}

export function altRow(sp) {
  const tag = warnTag(sp, true);
  return html`<a class="card alt" href="#/druh/${sp.id}"><img loading="lazy" src="${thumb(sp)}" alt="">
    <div class="t"><strong>${sp.cz}</strong><span class="latin">${sp.latin}</span>${tag ? html`<div style="margin-top:4px">${tag}</div>` : ''}</div>
    ${ic('chevron-right')}</a>`;
}
