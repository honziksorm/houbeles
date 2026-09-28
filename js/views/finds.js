// Moje nálezy, odznáčky a detail nálezu

import { html, ic, raw, plural, fmtDate, pct, toast } from '../ui.js';
import { loadData, SPECIES, search, thumb } from '../data.js';
import { allFinds, getFind, putFind, deleteFind, getKV, setKV, blobUrl } from '../db.js';
import { evaluate, badgeSvg } from '../badges.js';
import { edTag } from './result.js';

// Obrázek odznáčku: vygenerovaný (img/odznaky/<id>.png), jinak zástupný
function badgeArt(b) {
  return html`<span class="art" data-badge="${b.id}">${raw(badgeSvg(b))}</span>`;
}
// Vygenerované obrázky nahradí zástupné. Seznam hotových je v img/odznaky/seznam.json
// (vytvoří ho scripts/odznaky.py, když do složky přidáš obrázky).
let available;
function upgradeArt(root) {
  available ||= fetch('img/odznaky/seznam.json').then((r) => (r.ok ? r.json() : [])).catch(() => []);
  available.then((list) => {
    for (const el of root.querySelectorAll('[data-badge]')) {
      if (!list.includes(el.dataset.badge)) continue;
      const img = new Image();
      img.alt = '';
      img.onload = () => { el.innerHTML = ''; el.append(img); };
      img.src = `img/odznaky/${el.dataset.badge}.png`;
    }
  });
}

export function showBadgeModal(b, fresh = false) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = String(html`<div class="card ${fresh ? 'pop' : ''}">
      ${fresh ? html`<div><span class="status" style="margin-bottom:8px">${ic('sparkles')}Nový odznáček!</span></div>` : ''}
      ${badgeArt(b)}
      <h2>${b.name}</h2>
      <p>${b.desc}</p>
      ${!b.done ? html`<div class="progress" style="margin:0 20px 14px"><i style="width:${Math.round(b.progress * 100)}%"></i></div><p class="muted" style="margin-top:-8px">${b.n} z ${b.goal}</p>` : ''}
      <button class="btn dark block" type="button">${fresh ? 'Paráda!' : 'Zavřít'}</button></div>`);
    if (!b.done) el.querySelector('.art').style.filter = 'grayscale(1)';
    upgradeArt(el);
    document.body.append(el);
    if (fresh) navigator.vibrate?.([30, 60, 30]);
    const close = () => { el.remove(); resolve(); };
    el.onclick = (e) => { if (e.target === el || e.target.closest('button')) close(); };
  });
}

export async function render(root) {
  await loadData();
  const finds = await allFinds();
  const kv = { tipsRead: await getKV('tipsRead') };
  const badges = evaluate(finds, kv);
  const real = finds.filter((f) => SPECIES[f.cls] && !SPECIES[f.cls].neg);
  const nSpecies = new Set(real.map((f) => f.cls)).size;
  const done = badges.filter((b) => b.done).length;
  const next = badges.filter((b) => !b.done && b.progress > 0).sort((a, b) => b.progress - a.progress)[0]
    || badges.find((b) => !b.done);
  const geo = await getKV('geo', true);

  root.innerHTML = html`<div class="page">
    <h1 class="page-title">Moje nálezy</h1>
    <div class="stats">
      <div class="card stat"><b>${nSpecies}</b><span>${plural(nSpecies, 'druh', 'druhy', 'druhů').replace(/^[\d\s ]+/, '')}</span></div>
      <div class="card stat"><b>${finds.length}</b><span>${plural(finds.length, 'nález', 'nálezy', 'nálezů').replace(/^[\d\s ]+/, '')}</span></div>
      <div class="card stat"><b>${done}</b><span>z ${badges.length} odznáčků</span></div>
    </div>
    ${next ? html`<button class="card next" type="button" data-b="${next.id}" style="width:100%;margin-top:14px;text-align:left">${badgeArt(next)}
      <div><b>Další odznáček: ${next.name}</b><br>${next.desc}<div class="progress" style="margin-top:6px"><i style="width:${Math.round(next.progress * 100)}%"></i></div></div></button>` : ''}
    <h2 class="section-title">${ic('trophy')}Odznáčky</h2>
    <div class="badges">${badges.map((b) => html`<button class="badge ${b.done ? '' : 'locked'}" type="button" data-b="${b.id}">${badgeArt(b)}${b.name}
      ${!b.done && b.progress > 0 ? html`<div class="prog"><i style="width:${Math.round(b.progress * 100)}%"></i></div>` : ''}</button>`)}</div>
    <h2 class="section-title">${ic('basket')}Všechny nálezy</h2>
    ${finds.length ? html`<div class="find-list">${finds.map((f) => {
      const sp = SPECIES[f.cls];
      return html`<a class="card find-row" href="#/nalez/${f.id}"><img src="${blobUrl(f.photos[0])}" alt="">
        <div class="t"><strong>${sp?.cz || 'Neurčeno'}</strong>${fmtDate(f.date)}${f.lat != null ? ' · s polohou' : ''}<div style="margin-top:4px">${sp ? edTag(sp, true) : ''}</div></div>${ic('chevron-right')}</a>`;
    })}</div>` : html`<div class="card empty">Zatím tu nic není. Uložené houby se objeví tady.</div>`}
    <label class="card pad row" style="margin-top:18px;font-weight:800;font-size:14px">
      <input type="checkbox" id="geo" ${geo ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--moss)">
      Ukládat k nálezům polohu (zůstává jen v tomhle telefonu)
    </label>
  </div>`;
  upgradeArt(root);
  root.querySelector('#geo').onchange = (e) => setKV('geo', e.target.checked);
  root.onclick = (e) => {
    const b = e.target.closest('[data-b]');
    if (b) showBadgeModal(badges.find((x) => x.id === b.dataset.b));
  };
  return () => { root.onclick = null; };
}

export async function renderFind(root, params, id) {
  await loadData();
  const f = await getFind(+id);
  if (!f) { location.hash = '#/nalezy'; return; }
  const sp = SPECIES[f.cls];
  const urls = f.photos.map((b) => blobUrl(b));
  const map = f.lat != null ? `https://mapy.cz/zakladni?source=coor&id=${f.lon.toFixed(6)}%2C${f.lat.toFixed(6)}&x=${f.lon.toFixed(6)}&y=${f.lat.toFixed(6)}&z=16` : null;

  root.innerHTML = html`<div class="page">
    <a class="btn small" href="#/nalezy" style="margin-bottom:12px">${ic('arrow-left')}Nálezy</a>
    <div class="card"><img src="${urls[0]}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover"></div>
    ${urls.length > 1 ? html`<div class="refs">${urls.slice(1).map((u) => html`<img src="${u}" alt="">`)}</div>` : ''}
    <div style="margin-top:14px">${sp ? edTag(sp) : ''}</div>
    <h1 class="res-name" style="padding:0">${sp?.cz || 'Neurčeno'}</h1>
    <div class="latin">${sp?.latin || ''}</div>
    <p style="margin:8px 0 0;font-weight:700">${ic('calendar')} ${new Date(f.date).toLocaleString('cs-CZ', { dateStyle: 'long', timeStyle: 'short' })}</p>
    ${map ? html`<p style="margin:6px 0 0;font-weight:700">${ic('map-pin')} <a href="${map}" target="_blank" rel="noopener">Otevřít místo v Mapy.cz</a> <span class="muted">(±${f.acc || '?'} m)</span></p>` : ''}
    <a class="btn block" href="#/druh/${sp?.id}" style="margin-top:14px">${ic('book-2')}O tomhle druhu v atlasu</a>

    <h2 class="section-title">${ic('pencil')}Poznámka</h2>
    <textarea class="card pad" id="note" rows="3" style="width:100%;resize:vertical;font-weight:600" placeholder="Kde přesně rostla, pod jakým stromem…">${f.note || ''}</textarea>

    <h2 class="section-title">${ic('refresh')}Je to jinak?</h2>
    <p class="muted" style="margin:-4px 0 8px;font-size:14px">Tipy appky při určení. Když víš, co to je, oprav to.</p>
    <div class="stack">${(f.top || []).map(([i, p]) => html`<button class="card alt" type="button" data-set="${i}" style="width:100%;text-align:left;${i === f.cls ? 'background:var(--moss-soft)' : ''}">
      <img src="${thumb(SPECIES[i])}" alt=""><div class="t"><strong>${SPECIES[i].cz}</strong><span class="latin">${SPECIES[i].latin}</span></div><span class="pct">${pct(p)}</span></button>`)}</div>
    <label class="search" style="margin-top:12px">${ic('search')}<input type="search" id="fix" placeholder="Najít jiný druh…" autocomplete="off"></label>
    <div class="stack" id="fixList" style="margin-top:8px"></div>

    <button class="btn block" id="del" type="button" style="margin-top:22px;color:var(--red);border-color:var(--red)">${ic('trash')}Smazat nález</button>
  </div>`;

  const save = async (patch) => { Object.assign(f, patch); await putFind(f); };
  let t;
  root.querySelector('#note').oninput = (e) => { clearTimeout(t); t = setTimeout(() => save({ note: e.target.value }), 400); };
  root.onclick = async (e) => {
    const b = e.target.closest('[data-set]');
    if (!b) return;
    await save({ cls: +b.dataset.set, fixed: true });
    toast(`Změněno na: ${SPECIES[f.cls].cz}`, { kind: 'ok' });
    renderFind(root, params, id);
  };
  const fixList = root.querySelector('#fixList');
  root.querySelector('#fix').oninput = (e) => {
    const q = e.target.value.trim();
    fixList.innerHTML = q.length < 2 ? '' : String(html`${search(q).slice(0, 6).map((s) => html`<button class="card alt" type="button" data-set="${s.i}" style="width:100%;text-align:left">
      <img src="${thumb(s)}" alt=""><div class="t"><strong>${s.cz}</strong><span class="latin">${s.latin}</span></div></button>`)}`);
  };
  root.querySelector('#del').onclick = async () => {
    if (!confirm('Opravdu smazat tenhle nález?')) return;
    await deleteFind(f.id);
    toast('Nález smazán');
    location.hash = '#/nalezy';
  };
  return () => { root.onclick = null; };
}
