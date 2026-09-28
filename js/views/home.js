// Domovská obrazovka

import { html, raw, plural, monthIn, fmtDate, toast } from '../ui.js';
import { icon } from '../icons.js';
import { loadData, inSeason, thumb, SPECIES } from '../data.js';
import { allFinds, blobUrl } from '../db.js';
import { isModelDownloaded, downloadForOffline, MODEL_MB } from '../engine.js';
import { MASCOT } from '../state.js';
import { openGallery } from './live.js';

let downloading = null;

export async function render(root) {
  await loadData();
  const [ready, finds] = await Promise.all([isModelDownloaded(), allFinds()]);
  const month = new Date().getMonth();
  const season = inSeason(month, 8);
  const nSpecies = SPECIES.filter((s) => !s.neg).length;
  const recent = finds.slice(0, 4);

  root.innerHTML = html`<div class="page">
    <div class="brand-row">${raw(MASCOT)}<div>
      <div class="brand">Houbeles</div>
      ${ready
        ? html`<span class="status"><span class="dot"></span>Funguje offline · ${plural(nSpecies, 'druh', 'druhy', 'druhů')}</span>`
        : html`<span class="status warn"><span class="dot"></span>Zatím jen s internetem</span>`}
    </div></div>
    <h1 class="hello">Co dneska roste v&nbsp;lese?</h1>
    <div class="home-actions">
      <a class="cta" href="#/hledat">${raw(icon('camera'))}Najít houbu</a>
      <button class="btn block" id="gal" type="button">${raw(icon('photo'))}Vybrat fotku z galerie</button>
    </div>
    ${ready ? '' : html`<div class="card offline-card" id="offline">
      <b>Stáhni si Houbeles do telefonu</b>
      <span>Pak bude poznávat houby i v lese bez signálu. Stahuje se jen jednou, asi ${MODEL_MB} MB, ideálně přes Wi-Fi.</span>
      <div class="progress" hidden><i></i></div>
      <button class="btn green block" id="dl" type="button">${raw(icon('download'))}Stáhnout pro offline</button>
    </div>`}
    <h2 class="section-title">${raw(icon('calendar'))}Teď ${monthIn(month)} roste</h2>
    <div class="minis">${season.map((s) => html`<a class="mini" href="#/druh/${s.id}"><img loading="lazy" src="${thumb(s)}" alt="">${s.cz}</a>`)}</div>
    <h2 class="section-title">${raw(icon('basket'))}Poslední nálezy</h2>
    ${recent.length
      ? html`<div class="find-grid">${recent.map((f) => html`<a class="card find-card" href="#/nalez/${f.id}">
          <img src="${blobUrl(f.photos[0])}" alt=""><div><strong>${SPECIES[f.cls]?.cz || 'Neurčeno'}</strong>${fmtDate(f.date)}</div></a>`)}</div>`
      : html`<div class="card empty">${raw(MASCOT)}Zatím žádné nálezy. Vyraz do lesa a vyfoť první houbu!</div>`}
  </div>`;

  root.querySelector('#gal').onclick = () => openGallery();
  // po aktualizaci appky si potichu doplní fotky nových druhů pro offline
  if (ready && navigator.onLine && !downloading) {
    const bg = () => downloadForOffline().catch(() => {});
    if (window.requestIdleCallback) requestIdleCallback(bg, { timeout: 5000 });
    else setTimeout(bg, 3000);
  }
  const dl = root.querySelector('#dl');
  if (dl) {
    const bar = root.querySelector('.progress');
    const setP = (p) => { bar.hidden = false; bar.firstElementChild.style.width = `${Math.round(p * 100)}%`; };
    if (downloading) { dl.disabled = true; dl.textContent = 'Stahuji…'; downloading.onP = setP; }
    dl.onclick = async () => {
      dl.disabled = true;
      dl.textContent = 'Stahuji…';
      downloading = { onP: setP };
      try {
        await downloadForOffline((p) => downloading?.onP?.(p));
        toast('Hotovo! Houbeles teď funguje i bez signálu.', { kind: 'ok' });
        downloading = null;
        if (location.hash === '' || location.hash === '#/') render(root);
      } catch (e) {
        downloading = null;
        dl.disabled = false;
        dl.textContent = 'Zkusit znovu';
        toast('Stažení se nepovedlo. Zkontroluj připojení a zkus to znovu.');
      }
    };
  }
}
