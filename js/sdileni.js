// Sdílení souborů (záloha, obrázek nálezu): nabídka sdílení v telefonu, jinak stažení

import { html, ic, fold } from './ui.js';
import { ICONS } from './icons.js';
import { SPECIES, isUnsure } from './data.js';
import { isIOS } from './state.js';

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Po delší přípravě prohlížeč sdílení nepovolí a chce nové ťuknutí
function tapAgain(label) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = String(html`<div class="card"><h2>Hotovo</h2><p>Soubor je připravený.</p>
      <div class="stack"><button class="btn green block" type="button" data-ok>${ic('share')}${label}</button>
      <button class="btn block" type="button">Zrušit</button></div></div>`);
    document.body.append(el);
    el.onclick = (e) => {
      if (e.target !== el && !e.target.closest('button')) return;
      el.remove();
      resolve(!!e.target.closest('[data-ok]'));
    };
  });
}

function download(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// Nabídne sdílení (Disk, zprávy…), jinak soubor stáhne.
// Vrací 'share', 'download', nebo null, když to člověk zrušil.
export async function shareFile(file, { title, text, label = 'Sdílet' } = {}) {
  if (navigator.canShare?.({ files: [file] })) {
    const share = () => navigator.share({ files: [file], title, text }).then(() => 'share', (e) => e.name);
    let r = await share();
    if (r === 'NotAllowedError') r = (await tapAgain(label)) ? await share() : 'AbortError';
    if (r === 'share') return r;
    if (r === 'AbortError') return null; // zrušené sdílení nevadí
    if (isIOS()) return null; // na iPhonu by stažení otevřelo soubor přes celou appku bez cesty zpět
  }
  download(file);
  return 'download';
}

// Celé snímky z fotoaparátu do telefonu (jako Seek). Webová appka nesmí zapisovat do galerie
// potichu: iPhone je uloží přes nabídku sdílení (Uložit obrázky), Android do Stažených souborů,
// které Fotky Google i Galerie ukazují. Vrací jako shareFile.
// `max`: po uložení nálezu jen jedna fotka, víc stažení bez klepnutí by Chrome zablokoval dotazem
export async function savePhotos(f, max = Infinity) {
  const blobs = (f.full || []).filter((b) => b instanceof Blob).slice(0, max);
  if (!blobs.length) return null;
  const d = new Date(f.date);
  const base = `houbeles-${slug(SPECIES[f.cls]?.cz || 'houba')}-${isoDay(d)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const files = blobs.map((b, k) => new File([b], `${base}${blobs.length > 1 ? `-${k + 1}` : ''}.jpg`, { type: 'image/jpeg' }));
  if (isIOS() && navigator.canShare?.({ files })) {
    const share = () => navigator.share({ files }).then(() => 'share', (e) => e.name);
    let r = await share();
    if (r === 'NotAllowedError') r = (await tapAgain('Uložit fotky')) ? await share() : 'AbortError';
    return r === 'share' ? r : null;
  }
  for (const [k, file] of files.entries()) {
    if (k) await new Promise((res) => setTimeout(res, 400));
    download(file);
  }
  return 'download';
}

// ---------- Obrázek nálezu ----------

const DISCLAIMER = 'Určeno appkou, bez záruky. Jedlost vždy ověř u houbaře.';

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Ikona Tabler z icons.js (jen obrysové cesty)
function drawIcon(ctx, name, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = 2;
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const [, d] of ICONS[name].matchAll(/d="([^"]+)"/g)) ctx.stroke(new Path2D(d));
  ctx.restore();
}

// Text zmenší, aby se vešel, a když ani tak, zkrátí ho
function fitText(ctx, text, maxW, font, size, min) {
  for (; size > min; size -= 4) {
    ctx.font = font(size);
    if (ctx.measureText(text).width <= maxW) return text;
  }
  ctx.font = font(min);
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(`${text}…`).width > maxW) text = text.slice(0, -1);
  return `${text.trimEnd()}…`;
}

// Karta 1080 × 1350: fotka, jméno, datum a značka Houbeles.
// Schválně bez polohy, poznámky a jedlosti (soukromí a bezpečnost).
export async function findCard(f) {
  const sp = SPECIES[f.cls];
  const name = sp?.cz || 'Neurčeno';
  const unsure = sp && isUnsure(f);
  const latin = sp?.latin && sp.latin !== name ? sp.latin : ''; // bez českého jména je cz = latin
  const d = new Date(f.date);
  const day = d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
  const css = getComputedStyle(document.documentElement);
  const v = (k) => css.getPropertyValue(k).trim();
  const [ink, muted, paper, display, body] = ['--ink', '--muted', '--paper', '--display', '--text'].map(v);

  const logo = new Image();
  logo.src = 'img/ikona-192.png';
  const [photo] = await Promise.all([
    createImageBitmap(f.photos[0]),
    logo.decode().catch(() => {}),
    document.fonts.load(`800 96px ${display}`, `${name}Houbeles`),
    document.fonts.load(`700 40px ${body}`, `${latin}${day}${DISCLAIMER}`),
  ]);
  await document.fonts.ready;

  const W = 1080, H = 1350, M = 60, PW = W - 2 * M, PH = 900;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = v('--bg');
  ctx.fillRect(0, 0, W, H);

  // fotka jako karta appky: tvrdý stín, výřez na střed, tlustý obrys
  ctx.fillStyle = ink;
  rrect(ctx, M + 14, M + 14, PW, PH, 48);
  ctx.fill();
  ctx.save();
  rrect(ctx, M, M, PW, PH, 48);
  ctx.clip();
  const s = Math.max(PW / photo.width, PH / photo.height);
  ctx.drawImage(photo, (photo.width - PW / s) / 2, (photo.height - PH / s) / 2, PW / s, PH / s, M, M, PW, PH);
  ctx.restore();
  ctx.lineWidth = 7;
  ctx.strokeStyle = ink;
  rrect(ctx, M, M, PW, PH, 48);
  ctx.stroke();
  photo.close?.();

  // datum jako štítek v rohu fotky
  ctx.font = `800 34px ${body}`;
  const pillW = 30 + 36 + 12 + ctx.measureText(day).width + 30;
  const px = M + 26, py = M + PH - 26 - 68;
  ctx.fillStyle = paper;
  rrect(ctx, px, py, pillW, 68, 34);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.stroke();
  drawIcon(ctx, 'calendar', px + 30, py + 16, 36);
  ctx.fillStyle = ink;
  ctx.fillText(day, px + 30 + 36 + 12, py + 46);

  // nejisté určení musí být vidět i na obrázku, který se pošle dál
  if (unsure) {
    const label = 'Nejisté určení';
    const uw = 30 + 36 + 12 + ctx.measureText(label).width + 30;
    ctx.fillStyle = v('--amber');
    rrect(ctx, px, M + 26, uw, 68, 34);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = ink;
    drawIcon(ctx, 'alert-triangle', px + 30, M + 26 + 16, 36);
    ctx.fillStyle = ink;
    ctx.fillText(label, px + 30 + 36 + 12, M + 26 + 46);
  }

  // jméno a latinský název
  ctx.fillText(fitText(ctx, name, PW, (n) => `800 ${n}px ${display}`, 100, 60), M, M + PH + 118);
  if (latin) {
    ctx.fillStyle = muted;
    ctx.fillText(fitText(ctx, latin, PW, (n) => `italic 700 ${n}px ${body}`, 42, 30), M, M + PH + 176);
  }

  // značka a pod ní upozornění
  const by = H - M - 84;
  if (logo.naturalWidth) ctx.drawImage(logo, M, by, 84, 84);
  ctx.fillStyle = ink;
  ctx.font = `800 50px ${display}`;
  ctx.fillText('Houbeles', M + 104, by + 44);
  ctx.fillStyle = muted;
  ctx.fillText(fitText(ctx, DISCLAIMER, PW - 104, (n) => `700 ${n}px ${body}`, 27, 20), M + 104, by + 80);

  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return {
    file: new File([blob], `houbeles-${slug(name)}-${isoDay(d)}.png`, { type: 'image/png' }),
    text: `${unsure ? 'Můj nález (nejisté určení, tip appky)' : 'Můj nález'}: ${name}${latin ? ` (${latin})` : ''}, ${day}`,
  };
}

export async function shareFind(f) {
  const { file, text } = await findCard(f);
  return shareFile(file, { text, label: 'Sdílet obrázek' });
}
