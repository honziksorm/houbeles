// Moje nálezy, odznáčky a detail nálezu

import { html, ic, raw, plural, fmtDate, toast, spores } from '../ui.js';
import { loadData, SPECIES, search, thumb, isUnsure, isDangerous } from '../data.js';
import { isIOS } from '../state.js';
import { allFinds, getFind, updateFind, deleteFind, getKV, setKV, blobUrl } from '../db.js';
import { evaluate, badgeSvg } from '../badges.js';
import { backup, restore } from '../zaloha.js';
import { shareFind, savePhotos } from '../sdileni.js';
import { answersText } from '../dourceni.js';
import { refreshFindEmbeddings } from '../uceni.js';
import { warnTag, unsureTag, eatWarning } from './result.js';

// Štítky nálezu: nejistý má „Nejisté určení“, jedovatý druh vždy i své varování. Jedlost ne (ta je jen v atlasu)
const findTags = (f, sp, short = false) => (!sp ? ''
  : isUnsure(f) ? html`${unsureTag()} ${isDangerous(sp) ? warnTag(sp, short) : ''}` : warnTag(sp, short));

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
    if (fresh) {
      navigator.vibrate?.([30, 60, 30]);
      const a = el.querySelector('.art').getBoundingClientRect();
      spores(a.left + a.width / 2, a.top + a.height / 2);
    }
    const close = () => { el.remove(); resolve(); };
    el.onclick = (e) => { if (e.target === el || e.target.closest('button')) close(); };
  });
}

export async function render(root) {
  await loadData();
  const finds = await allFinds();
  const kv = { tipsRead: await getKV('tipsRead'), kvizBest: await getKV('kvizBest') };
  const badges = evaluate(finds, kv);
  const real = finds.filter((f) => SPECIES[f.cls] && !SPECIES[f.cls].neg);
  const nSpecies = new Set(real.map((f) => f.cls)).size;
  const done = badges.filter((b) => b.done).length;
  const next = badges.filter((b) => !b.done && b.progress > 0).sort((a, b) => b.progress - a.progress)[0]
    || badges.find((b) => !b.done);
  const geo = await getKV('geo', true);
  const galerie = await getKV('galerie', !isIOS());
  const lastBackup = await getKV('lastBackup');
  const unsaved = finds.filter((f) => f.date > (lastBackup || 0)).length;

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
        <div class="t"><strong>${sp?.cz || 'Neurčeno'}</strong>${fmtDate(f.date)}${f.lat != null ? ' · s polohou' : ''}<div style="margin-top:4px">${findTags(f, sp, true)}</div></div>${ic('chevron-right')}</a>`;
    })}</div>` : html`<div class="card empty">Zatím tu nic není. Uložené houby se objeví tady.</div>`}
    <label class="card pad row" style="margin-top:18px;font-weight:800;font-size:14px">
      <input type="checkbox" id="geo" ${geo ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--moss)">
      Ukládat k nálezům polohu (zůstává jen v tomhle telefonu)
    </label>
    <label class="card pad row" style="margin-top:10px;font-weight:800;font-size:14px">
      <input type="checkbox" id="galerie" ${galerie ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--moss)">
      Ukládat fotky z fotoaparátu i do telefonu (${isIOS() ? 'Fotky' : 'Stažené soubory, uvidíš je i v Galerii'})
    </label>

    <h2 class="section-title">${ic('download')}Záloha nálezů</h2>
    ${unsaved >= 5 ? html`<div class="card alert backup-hint">${ic('info-circle')}<div>${lastBackup ? 'Od poslední zálohy přibylo' : 'Máš'} <b>${plural(unsaved, 'nález', 'nálezy', 'nálezů')}</b>${lastBackup ? '' : ' a zatím žádnou zálohu'}. Zálohuj je, ať o ně nepřijdeš.</div></div>` : ''}
    <div class="card pad backup">
      <p>Nálezy jsou jen v tomhle telefonu. Záloha je uloží do souboru, který si schováš třeba na Disk. Na jiném telefonu je pak obnovíš. Pozor, v záloze jsou i polohy nálezů, tak ji neposílej nikomu cizímu.</p>
      <p class="muted">${lastBackup ? html`Poslední záloha: <b>${fmtDate(lastBackup)}</b>` : 'Zatím žádná záloha'}</p>
      <div class="stack">
        <button class="btn green block" id="backup" type="button" ${finds.length ? '' : 'disabled'}>${ic('download')}Zálohovat nálezy</button>
        <button class="btn block" id="restore" type="button">${ic('refresh')}Obnovit ze zálohy</button>
      </div>
      <input type="file" id="restoreFile" accept=".json,.txt,application/json,text/plain" hidden>
    </div>
  </div>`;
  upgradeArt(root);
  root.querySelector('#geo').onchange = (e) => setKV('geo', e.target.checked);
  root.querySelector('#galerie').onchange = (e) => setKV('galerie', e.target.checked);
  const again = () => { if (location.hash === '#/nalezy') render(root); };
  root.querySelector('#backup').onclick = async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Připravuji zálohu…';
    try {
      const how = await backup();
      if (how === 'share') toast('Záloha je hotová', { kind: 'ok' });
      if (how === 'download') toast('Záloha se uložila do Stažených souborů', { kind: 'ok' });
    } catch (e) {
      console.error(e);
      toast('Zálohu se nepodařilo vytvořit.');
    }
    again();
  };
  const file = root.querySelector('#restoreFile');
  root.querySelector('#restore').onclick = () => file.click();
  file.onchange = async () => {
    const picked = file.files[0];
    if (!picked) return;
    file.value = '';
    try {
      const n = await restore(picked);
      if (n == null) toast('Tohle není záloha z Houbelesu.');
      else toast(n ? `Obnoveno: ${plural(n, 'nález', 'nálezy', 'nálezů')}` : 'Všechny nálezy ze zálohy už tu jsou', { kind: 'ok' });
    } catch (e) {
      console.error(e);
      toast('Obnova se nepovedla. Zkus to znovu.');
    }
    again();
  };
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
    <div style="margin-top:14px">${findTags(f, sp)}</div>
    <h1 class="res-name" style="padding:0">${sp?.cz || 'Neurčeno'}</h1>
    <div class="latin">${sp?.latin || ''}</div>
    ${sp && isUnsure(f) ? html`<div class="card alert">${ic('alert-triangle')}<div><b>Nejisté určení.</b> Appka si tímhle druhem nebyla jistá. Nejez ji, dokud ji neověří houbař. Až bude druh jistý, potvrď ho nebo oprav níž.</div></div>` : ''}
    ${sp ? eatWarning() : ''}
    <p style="margin:8px 0 0;font-weight:700">${ic('calendar')} ${new Date(f.date).toLocaleString('cs-CZ', { dateStyle: 'long', timeStyle: 'short' })}</p>
    ${map ? html`<p style="margin:6px 0 0;font-weight:700">${ic('map-pin')} <a href="${map}" target="_blank" rel="noopener">Otevřít místo v Mapy.cz</a> <span class="muted">(±${f.acc || '?'} m)</span></p>` : ''}
    <a class="btn block" href="#/druh/${sp?.id}" style="margin-top:14px">${ic('book-2')}O tomhle druhu v atlasu</a>
    <button class="btn green block" id="share" type="button" style="margin-top:10px">${ic('share')}Sdílet nález</button>
    ${(f.full || []).some(Boolean) ? html`<button class="btn block" id="savePh" type="button" style="margin-top:10px">${ic('download')}Uložit ${(f.full || []).filter(Boolean).length > 1 ? 'fotky' : 'fotku'} do telefonu</button>` : ''}

    <h2 class="section-title">${ic('pencil')}Poznámka</h2>
    <textarea class="card pad" id="note" rows="3" style="width:100%;resize:vertical;font-weight:600" placeholder="Kde přesně rostla, pod jakým stromem…">${f.note || ''}</textarea>

    <h2 class="section-title">${ic('refresh')}Sedí to?</h2>
    ${f.answers && answersText(f.answers) ? html`<p class="muted" style="margin:-4px 0 8px;font-size:14px">Při určení: ${answersText(f.answers)}</p>` : ''}
    ${f.fixed ? html`<p class="ask-done" style="margin:0 0 10px">${ic('circle-check')}<span>Druh je potvrzený. Appka se z tohohle nálezu učí poznávat podobné houby.</span></p>`
      : sp ? html`<button class="btn green block" type="button" data-set="${f.cls}" style="margin-bottom:10px">${ic('check')}Ano, je to ${sp.cz.toLowerCase()}</button>` : ''}
    <p class="muted" style="margin:0 0 8px;font-size:14px">Když víš, co to je, potvrď to nebo oprav. Appka se z toho naučí a podobné houby příště pozná líp. Tipy appky při určení:</p>
    <div class="stack">${(f.top || []).map(([i]) => html`<button class="card alt" type="button" data-set="${i}" style="width:100%;text-align:left;${i === f.cls ? 'background:var(--moss-soft)' : ''}">
      <img src="${thumb(SPECIES[i])}" alt=""><div class="t"><strong>${SPECIES[i].cz}</strong><span class="latin">${SPECIES[i].latin}</span></div></button>`)}</div>
    <label class="search" style="margin-top:12px">${ic('search')}<input type="search" id="fix" placeholder="Najít jiný druh…" autocomplete="off"></label>
    <div class="stack" id="fixList" style="margin-top:8px"></div>

    <button class="btn block" id="del" type="button" style="margin-top:22px;color:var(--red);border-color:var(--red)">${ic('trash')}Smazat nález</button>
  </div>`;

  // mění jen tahle pole (otisky nebo jiné změny z pozadí zůstanou)
  const save = async (patch) => { Object.assign(f, patch); await updateFind(f.id, patch); };
  let t;
  root.querySelector('#note').oninput = (e) => { clearTimeout(t); t = setTimeout(() => save({ note: e.target.value }), 400); };
  root.onclick = async (e) => {
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const same = +b.dataset.set === f.cls;
    await save({ cls: +b.dataset.set, fixed: true });
    toast(same ? 'Potvrzeno, díky!' : `Změněno na: ${SPECIES[f.cls].cz}`, { kind: 'ok' });
    refreshFindEmbeddings(); // starší nález ještě nemá otisk pro učení
    renderFind(root, params, id);
  };
  const fixList = root.querySelector('#fixList');
  root.querySelector('#fix').oninput = (e) => {
    const q = e.target.value.trim();
    fixList.innerHTML = q.length < 2 ? '' : String(html`${search(q).slice(0, 6).map((s) => html`<button class="card alt" type="button" data-set="${s.i}" style="width:100%;text-align:left">
      <img src="${thumb(s)}" alt=""><div class="t"><strong>${s.cz}</strong><span class="latin">${s.latin}</span></div></button>`)}`);
  };
  const savePh = root.querySelector('#savePh');
  if (savePh) {
    savePh.onclick = async () => {
      const how = await savePhotos(f).catch(() => null);
      if (how === 'download') toast('Uloženo do Stažených souborů', { kind: 'ok' });
      if (how === 'share') toast('Hotovo', { kind: 'ok' });
    };
  }
  // obrázek s fotkou a jménem, bez polohy a poznámky
  root.querySelector('#share').onclick = async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    try {
      if ((await shareFind(f)) === 'download') toast('Obrázek se uložil do Stažených souborů', { kind: 'ok' });
    } catch (e) {
      console.error(e);
      toast('Obrázek se nepodařilo vytvořit.');
    }
    btn.disabled = false;
  };
  root.querySelector('#del').onclick = async () => {
    if (!confirm('Opravdu smazat tenhle nález?')) return;
    await deleteFind(f.id);
    toast('Nález smazán');
    location.hash = '#/nalezy';
  };
  return () => { root.onclick = null; };
}
