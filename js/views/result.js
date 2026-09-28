// Výsledek určení

import { html, ic, pct, toast } from '../ui.js';
import { loadData, SPECIES, EDIBILITY, topK, ladder, thumb, isDangerous, traitLabel } from '../data.js';
import { combine } from '../engine.js';
import { session } from '../state.js';
import { addFind, allFinds, getKV, blobUrl } from '../db.js';
import { evaluate } from '../badges.js';
import { showBadgeModal } from './finds.js';

export function edTag(sp, short = false) {
  if (sp.neg) return html`<span class="tag neg">Není houba</span>`;
  const e = EDIBILITY[sp.ed];
  if (!e) return html`<span class="tag unknown">Jedlost neuvádím</span>`;
  return html`<span class="tag ${e.cls}">${e.icon ? ic(e.icon) : ''}${short ? e.short : e.label}</span>`;
}

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
  const probs = combine(r.photos.map((p) => p.logp), month, 'sum');
  const top = topK(probs, 8);
  const lad = ladder(probs);
  const best = top[0];
  const fungiTop = top.filter((t) => !t.sp.neg);
  const notFungus = best.sp.neg && lad[0].mass < 0.5;
  const sp = notFungus ? fungiTop[0].sp : best.sp;
  const p = probs[sp.i];
  const genus = lad[3];
  const confCls = p >= 0.8 ? '' : p >= 0.5 ? 'mid' : 'low';
  const others = fungiTop.filter((t) => t.sp !== sp && t.p >= 0.01).slice(0, 4);
  const dangers = fungiTop.filter((t) => t.sp !== sp && t.p >= 0.03 && isDangerous(t.sp)).slice(0, 2);
  const urls = r.photos.map((ph) => blobUrl(ph.blob));

  let headline, sub;
  if (notFungus) {
    headline = 'Tohle asi není houba';
    sub = html`Vypadá to na: <b>${best.sp.cz.toLowerCase()}</b> (${pct(best.p)}). Kdyby to přece jen byla houba, nejspíš:`;
  } else if (p >= 0.5) {
    headline = sp.cz;
  } else if (genus.mass >= 0.7) {
    headline = `Nejspíš ${genus.name.toLowerCase()}`;
    sub = html`Rod sedí s jistotou ${pct(genus.mass)}, druh je zatím nejistý. Přidej fotku zespodu nebo třeně.`;
  } else {
    headline = 'Tohle s jistotou neurčím';
    sub = html`Zkus houbu vyfotit zblízka, ostře a z více stran. Nejbližší tipy:`;
  }

  root.innerHTML = html`<div>
    <div class="res-photos">
      <img class="main" src="${urls[urls.length - 1]}" alt="">
      <a class="round back" href="#/" aria-label="Zpět">${ic('arrow-left')}</a>
      ${urls.length > 1 ? html`<div class="strip">${urls.map((u) => html`<img src="${u}" alt="">`)}</div>` : ''}
      ${notFungus ? '' : html`<div class="conf ${confCls}"><div><b>${Math.min(99, Math.round(p * 100))}&nbsp;%</b><small>jistota</small></div></div>`}
    </div>
    <div class="res-body">
      ${notFungus ? html`<span class="tag neg">Není houba</span>` : edTag(sp)}
      <h1 class="res-name">${headline}</h1>
      ${!notFungus && p >= 0.5 ? html`<div class="latin">${sp.latin}</div>` : ''}
      ${sub ? html`<p style="margin:8px 0 0">${sub}</p>` : ''}
      ${!notFungus && p >= 0.5 ? html`
        ${sp.edNote ? html`<div class="card alert info">${ic('info-circle')}<div>${sp.edNote}</div></div>` : ''}
        ${traitChips(sp)}` : ''}
      ${dangers.map((d) => html`<div class="card alert danger">${ic('skull')}<div><b>Pozor: mezi možnostmi je i ${d.sp.cz.toLowerCase()}</b> (${EDIBILITY[d.sp.ed].label.toLowerCase()}, ${pct(d.p)}). Bez stoprocentní jistoty nesbírat.</div></div>`)}
      ${!notFungus && p >= 0.5 ? lookalikeAlerts(sp) : ''}

      ${!notFungus && p >= 0.5 ? html`<h2 class="section-title">Takhle vypadá ${sp.cz.toLowerCase()}</h2>
        <div class="refs">${(sp.img || []).map((_, n) => html`<a href="#/druh/${sp.id}"><img loading="lazy" src="${thumb(sp, n)}" alt=""></a>`)}</div>` : ''}

      ${(p < 0.5 || notFungus) ? html`<div class="stack" style="margin-top:6px">${[sp, ...others.map((o) => o.sp)].slice(0, 5).map((s) => altRow(s, probs[s.i]))}</div>`
        : others.length ? html`<h2 class="section-title">Další možnosti</h2>${others.map((o) => altRow(o.sp, o.p))}` : ''}

      <div class="res-actions">
        ${r.photos.length < 3 ? html`<a class="btn green block" href="#/hledat?pridat=1">${ic('photo-plus')}${r.photos.length === 1 ? 'Přidat fotku zespodu nebo třeně' : 'Přidat ještě jednu fotku'}</a>` : ''}
        <button class="btn primary block" id="save" type="button">${ic('basket')}Uložit do nálezů</button>
        <a class="btn block" href="#/hledat">${ic('camera')}Určit jinou houbu</a>
      </div>
      <p class="disc">Houbeles je pomocník, ne houbař. Nikdy nejez houbu jen podle fotky: při sebemenší pochybnosti ji ukaž zkušenému houbaři nebo v houbařské poradně.</p>
    </div>
  </div>`;

  root.querySelector('#save').onclick = async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    const before = evaluate(await allFinds(), { tipsRead: await getKV('tipsRead') });
    const find = {
      date: r.date,
      cls: sp.i,
      top: top.slice(0, 5).map((t) => [t.sp.i, +t.p.toFixed(4)]),
      photos: r.photos.map((ph) => ph.blob),
    };
    if ((await getKV('geo', true)) && navigator.geolocation) {
      const pos = await new Promise((res) => navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 8000, maximumAge: 120000, enableHighAccuracy: true }));
      if (pos) Object.assign(find, { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) });
    }
    const id = await addFind(find);
    session.result = null;
    toast('Uloženo do nálezů', { kind: 'ok' });
    const after = evaluate(await allFinds(), { tipsRead: await getKV('tipsRead') });
    const fresh = after.filter((b, k) => b.done && !before[k].done);
    location.hash = `#/nalez/${id}`;
    for (const b of fresh) await showBadgeModal(b, true);
  };
}

export function altRow(sp, p) {
  return html`<a class="card alt" href="#/druh/${sp.id}"><img loading="lazy" src="${thumb(sp)}" alt="">
    <div class="t"><strong>${sp.cz}</strong><span class="latin">${sp.latin}</span><div style="margin-top:4px">${edTag(sp, true)}</div></div>
    ${p == null ? ic('chevron-right') : html`<span class="pct">${pct(p)}</span>`}</a>`;
}
