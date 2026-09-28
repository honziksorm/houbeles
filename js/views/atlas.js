// Atlas hub a detail druhu

import { html, ic, plural, MONTH_SHORT, monthIn } from '../ui.js';
import { loadData, search, SPECIES, BY_ID, SEASON, thumb, LEVEL_NAME } from '../data.js';
import { allFinds } from '../db.js';
import { edTag, traitChips, lookalikeAlerts, altRow } from './result.js';

let lastQuery = '', lastFilter = 'vse';

const FILTERS = [
  ['vse', 'Vše', null], ['jedle', 'Jedlé', null], ['jedovate', 'Jedovaté', null],
  ['prudce', 'Prudce jedovaté', 'skull'], ['sezona', 'Teď roste', 'calendar'],
];

export async function render(root, params) {
  await loadData();
  const found = new Set((await allFinds()).map((f) => f.cls));
  if (params.has('f')) lastFilter = params.get('f');
  root.innerHTML = html`<div class="page">
    <h1 class="page-title">Atlas hub</h1>
    <label class="search">${ic('search')}<input type="search" id="q" placeholder="Hledej houbu česky i latinsky…" value="${lastQuery}" autocomplete="off"></label>
    <div class="chips" id="chips">${FILTERS.map(([k, label, i]) => html`<button class="chip ${k === lastFilter ? 'on' : ''}" data-f="${k}" type="button">${i ? ic(i) : ''}${label}</button>`)}</div>
    <div class="count-line" id="count"></div>
    <div class="sp-grid" id="grid"></div>
  </div>`;
  const q = root.querySelector('#q');
  const grid = root.querySelector('#grid');
  const count = root.querySelector('#count');
  function draw() {
    const list = search(q.value, lastFilter);
    const month = new Date().getMonth();
    count.textContent = `${plural(list.length, 'druh', 'druhy', 'druhů')}${lastFilter === 'sezona' ? ` roste ${monthIn(month)}` : ''} · máš nalezeno ${found.size}`;
    grid.innerHTML = String(html`${list.map((s) => html`<a class="card sp-card ${found.has(s.i) ? 'found' : ''}" href="#/druh/${s.id}">
      <img loading="lazy" src="${thumb(s)}" alt=""><div><strong>${s.cz}</strong><span class="latin">${s.latin}</span>${edTag(s, true)}</div></a>`)}`);
  }
  q.oninput = () => { lastQuery = q.value; draw(); };
  root.querySelector('#chips').onclick = (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    lastFilter = b.dataset.f;
    for (const c of root.querySelectorAll('.chip')) c.classList.toggle('on', c === b);
    draw();
  };
  draw();
}

export async function renderSpecies(root, params, id) {
  await loadData();
  const sp = BY_ID.get(+id);
  if (!sp) { location.hash = '#/atlas'; return; }
  const finds = (await allFinds()).filter((f) => f.cls === sp.i);
  const month = new Date().getMonth();
  const row = SEASON[sp.i] || [];
  const max = Math.max(...row, 1e-9);
  const similar = (sp.look || []).filter((l) => l.i != null && !l.note).map((l) => SPECIES[l.i]).slice(0, 3);
  const tax = [['order', 'Řád'], ['family', 'Čeleď'], ['genus', 'Rod']].filter(([k]) => sp.tax?.[k]);

  root.innerHTML = html`<div class="page">
    <a class="btn small" href="javascript:history.back()" style="margin-bottom:12px">${ic('arrow-left')}Zpět</a>
    <div class="sp-hero">
      <img src="${thumb(sp, 0)}" alt="">
      <div class="side">${[1, 2].map((n) => (sp.img?.[n] ? html`<img src="${thumb(sp, n)}" alt="">` : ''))}</div>
    </div>
    <div style="margin-top:14px">${edTag(sp)}</div>
    <h1 class="res-name" style="padding:0">${sp.cz}</h1>
    <div class="latin">${sp.latin}</div>
    ${sp.edNote ? html`<div class="card alert info">${ic('info-circle')}<div>${sp.edNote}</div></div>` : ''}
    ${traitChips(sp)}
    ${lookalikeAlerts(sp, 4)}
    ${finds.length ? html`<a class="card alert info" href="#/nalez/${finds[0].id}" style="text-decoration:none">${ic('basket')}<div><b>Máš ${plural(finds.length, 'nález', 'nálezy', 'nálezů')}</b> tohoto druhu. Naposledy ${new Date(finds[0].date).toLocaleDateString('cs-CZ')}.</div></a>` : ''}

    ${row.length ? html`<h2 class="section-title">${ic('calendar')}Kdy roste</h2>
      <div class="card pad"><div class="season">${row.map((v, m) => html`<i class="${m === month ? 'now' : ''}" style="height:${Math.max(6, Math.round((v / max) * 100))}%"></i>`)}</div>
      <div class="season-labels">${MONTH_SHORT.map((m) => html`<span>${m}</span>`)}</div>
      <div class="credit">Podle měsíců, kdy ho lidé v Evropě fotili. Červeně je tenhle měsíc.</div></div>` : ''}

    ${sp.text ? html`<h2 class="section-title">${ic('book-2')}Popis</h2>
      <div class="card pad text">${sp.text}<div class="credit">Zdroj: <a href="${sp.wiki}" target="_blank" rel="noopener">Wikipedie</a> (CC BY-SA)</div></div>` : ''}

    ${tax.length ? html`<h2 class="section-title">${ic('trees')}Zařazení</h2>
      <div class="card pad ladder-static">${tax.map(([k, label]) => html`<div><span>${label}</span><span>${sp.tax[k][2] ? `${sp.tax[k][2]} · ` : ''}<i>${sp.tax[k][1]}</i></span></div>`)}
      <div><span>Druh</span><span>${sp.cz} · <i>${sp.latin}</i></span></div></div>` : ''}

    ${similar.length ? html`<h2 class="section-title">${ic('eye')}Podobné druhy</h2>
      <p class="muted" style="margin:-4px 0 0;font-size:14px">S těmito si ho model nejčastěji plete.</p>
      ${similar.map((s) => altRow(s, null))}` : ''}

    <div class="credit" style="margin-top:18px">Fotky: ${(sp.img || []).map((i) => i.a).filter(Boolean).join(' · ')}. Zdroj iNaturalist, licence CC. ${LEVEL_NAME.species}: ${plural(sp.cnt || 0, 'pozorování', 'pozorování', 'pozorování')} v Česku.</div>
  </div>`;
}
