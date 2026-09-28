// Živý hledáček (jako v Seeku) a výřez fotky z galerie

import { html, ic, pct, toast } from '../ui.js';
import { loadData, ladder, SPECIES, LEVELS, LEVEL_NAME } from '../data.js';
import { toPixels, classifyPixels, combine, startEngine, isBusy } from '../engine.js';
import { startResult, addPhoto, session } from '../state.js';

const LOCK_P = 0.8;        // jistota druhu pro „Zaměřeno“
const LEVEL_P = 0.7;       // jistota skupiny pro rozsvícení stupně v žebříčku
const MIN_GAP_MS = 300;    // nejkratší pauza mezi výpočty
const SHARP_OK = 55;       // hranice ostrosti (rozptyl Laplaceova filtru na 96 px)
const MOTION_BAD = 16;     // průměrný rozdíl mezi snímky, nad ním „drž v klidu“

const circ = 2 * Math.PI * 39;

export async function render(root, params) {
  const addMode = params.get('pridat') === '1' && session.result;
  document.body.classList.add('fullscreen');
  await loadData();
  startEngine().catch(() => {});
  const fs = Math.round(Math.min(window.innerWidth * 0.78, window.innerHeight * 0.42, 420));

  root.innerHTML = html`<div class="live" style="--fs:${fs}px">
    <video playsinline muted autoplay></video><div class="vignette"></div>
    <div class="live-top">
      <a class="round" href="${addMode ? '#/vysledek' : '#/'}" aria-label="Zavřít">${ic('x')}</a>
      <button class="round" id="torch" type="button" hidden aria-label="Svítilna">${ic('bolt')}</button>
    </div>
    ${addMode
      ? html`<div class="add-badge"><span class="status">${ic('photo-plus')}Fotka ${session.result.photos.length + 1}: vyfoť spodek klobouku nebo třeň</span></div>`
      : html`<div class="ladder" id="ladder"><div class="steps">${LEVELS.map(() => html`<i><b style="width:0"></b></i>`)}</div>
        <div class="step-names">${LEVELS.map((l) => html`<span>${LEVEL_NAME[l]}</span>`)}</div></div>`}
    <div class="finder" id="finder"><i></i><i></i><i></i><i></i><span class="lock">${ic('check')}Zaměřeno</span></div>
    <div class="live-msg" id="msg"></div>
    <div class="live-bottom">
      <div class="hints" id="hints"></div>
      <div class="guess" id="guess"></div>
      <div class="shutter-row">
        <button class="round" id="gal" type="button" aria-label="Vybrat z galerie">${ic('photo')}</button>
        <button class="shutter" id="shot" type="button" aria-label="Vyfotit"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="39" fill="none" stroke="#8fe06a" stroke-width="6" stroke-linecap="round" stroke-dasharray="0 ${circ}"/></svg><div class="core"></div></button>
        <button class="round" id="flip" type="button" aria-label="Otočit kameru">${ic('refresh')}</button>
      </div>
    </div>
    <div class="flash" id="flash"></div>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const video = $('video');
  const finder = $('#finder');
  const guess = $('#guess');
  const hints = $('#hints');
  const ring = $('.shutter circle');
  let stream = null, facing = 'environment', torchOn = false, raf = 0, alive = true;
  const history = [];       // poslední výsledky z hledáčku { logp, t }
  let lastRun = 0, lastTop = -1, locked = false;
  const small = document.createElement('canvas');
  small.width = small.height = 96;
  const sg = small.getContext('2d', { willReadFrequently: true });
  let prevGray = null;

  async function startCamera() {
    stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false,
      });
    } catch (e) {
      showMsg(html`<div class="card"><b>Kamera není dostupná.</b><br>Povol appce přístup ke kameře v nastavení prohlížeče, nebo vyber fotku z galerie.<br><br><button class="btn primary block" id="msgGal" type="button">${ic('photo')}Vybrat z galerie</button></div>`);
      $('#msgGal').onclick = () => openGallery({ add: !!addMode });
      return;
    }
    if (!alive) return stop();
    video.srcObject = stream;
    await video.play().catch(() => {});
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    $('#torch').hidden = !caps.torch;
    loop();
  }

  function stop() {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function showMsg(content) {
    $('#msg').innerHTML = content ? String(content) : '';
  }

  // Oblast rámečku v souřadnicích videa
  function finderRect() {
    const vw = video.videoWidth, vh = video.videoHeight;
    const W = video.clientWidth, H = video.clientHeight;
    const s = Math.max(W / vw, H / vh);
    const ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
    const r = finder.getBoundingClientRect();
    const vr = video.getBoundingClientRect();
    return { sx: (r.left - vr.left - ox) / s, sy: (r.top - vr.top - oy) / s, ss: r.width / s };
  }

  // Rychlá kontrola záběru: jas, ostrost, pohyb
  function quality(rect) {
    sg.drawImage(video, rect.sx, rect.sy, rect.ss, rect.ss, 0, 0, 96, 96);
    const d = sg.getImageData(0, 0, 96, 96).data;
    const g = new Float32Array(96 * 96);
    let sum = 0;
    for (let i = 0; i < g.length; i++) { g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; sum += g[i]; }
    const bright = sum / g.length;
    let lsum = 0, lsq = 0, n = 0;
    for (let y = 1; y < 95; y++) for (let x = 1; x < 95; x++) {
      const i = y * 96 + x;
      const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - 96] - g[i + 96];
      lsum += l; lsq += l * l; n++;
    }
    const sharp = lsq / n - (lsum / n) ** 2;
    let motion = 0;
    if (prevGray) { for (let i = 0; i < g.length; i += 4) motion += Math.abs(g[i] - prevGray[i]); motion /= g.length / 4; }
    prevGray = g;
    return { bright, sharp, motion };
  }

  function showHints(q) {
    const out = [];
    if (q.bright < 45) out.push(html`<span class="bad">${ic('bulb')}Málo světla</span>`);
    else if (q.bright > 230) out.push(html`<span class="bad">${ic('sun')}Moc světla</span>`);
    else out.push(html`<span class="ok">${ic('sun')}Světlo</span>`);
    if (q.motion > MOTION_BAD) out.push(html`<span class="bad">${ic('hand-finger')}Drž telefon v klidu</span>`);
    else if (q.sharp < SHARP_OK) out.push(html`<span class="bad">${ic('focus-2')}Rozmazané, ťukni na houbu</span>`);
    else out.push(html`<span class="ok">${ic('check')}Ostré</span>`);
    hints.innerHTML = String(html`${out}`);
  }

  function updateLadder(probs) {
    const lad = ladder(probs);
    const box = $('#ladder');
    const topSp = SPECIES[probs.indexOf(Math.max(...probs))];
    if (box) {
      const bars = box.querySelectorAll('.steps b');
      const names = box.querySelectorAll('.step-names span');
      let reached = true;
      lad.forEach((l, k) => {
        const on = reached && l.mass >= LEVEL_P;
        bars[k].style.width = `${Math.round((reached ? Math.min(1, l.mass / LEVEL_P) : 0) * 100)}%`;
        names[k].classList.toggle('on', on);
        names[k].textContent = on ? l.name : LEVEL_NAME[l.level];
        reached = on;
      });
    }
    // text odhadu
    if (topSp.neg && lad[0].mass < 0.5) {
      guess.innerHTML = String(html`Tohle asi není houba<small>vypadá to na: ${topSp.cz.toLowerCase()}</small>`);
      return 0;
    }
    const sp = lad[4];
    if (sp.mass >= 0.5) {
      guess.innerHTML = String(html`${sp.name}<small><i>${sp.latin}</i> · ${pct(sp.mass)}</small>`);
    } else {
      const deep = [...lad].reverse().find((l) => l.level !== 'species' && l.mass >= LEVEL_P);
      guess.innerHTML = String(deep
        ? html`${deep.level === 'fungi' ? 'Houba' : deep.name}<small>${deep.level === 'fungi' ? 'hledám druh, přibliž se' : `${LEVEL_NAME[deep.level].toLowerCase()} · hledám druh`}</small>`
        : html`Hledám…<small>namiř rámeček na houbu</small>`);
    }
    return sp.mass;
  }

  async function evaluate(rect) {
    const logp = (await classifyPixels(toPixels(video, rect.sx, rect.sy, rect.ss))).logp;
    const now = performance.now();
    history.push({ logp, t: now });
    while (history.length > 3 || (history.length && now - history[0].t > 4000)) history.shift();
    const probs = combine(history.map((h) => h.logp), new Date().getMonth(), 'avg');
    const p = addMode ? Math.max(...probs) : updateLadder(probs);
    if (addMode) {
      const top = SPECIES[probs.indexOf(Math.max(...probs))];
      guess.innerHTML = String(html`${top.cz}<small>${pct(p)}</small>`);
    }
    const top = probs.indexOf(Math.max(...probs));
    const isLock = p >= LOCK_P && top === lastTop && !SPECIES[top].neg;
    lastTop = top;
    ring.setAttribute('stroke-dasharray', `${(Math.min(1, p) * circ).toFixed(1)} ${circ}`);
    finder.classList.toggle('ok', isLock);
    if (isLock && !locked) navigator.vibrate?.(35);
    locked = isLock;
  }

  let qTick = 0;
  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (!video.videoWidth || document.hidden) return;
    const now = performance.now();
    if (now - qTick < 120) return;
    qTick = now;
    const rect = finderRect();
    const q = quality(rect);
    showHints(q);
    if (!isBusy() && now - lastRun > MIN_GAP_MS && q.motion <= MOTION_BAD * 1.5) {
      lastRun = now;
      evaluate(rect).catch((e) => {
        console.error(e);
        showMsg(html`<div class="card"><div class="spinner"></div><b>Připravuji rozpoznávání…</b><br><span class="muted">${e.message}</span></div>`);
      });
    }
  }

  // Vyfocení: výřez z rámečku (trochu větší) + finální výpočet
  $('#shot').onclick = async () => {
    if (!video.videoWidth) return;
    const flash = $('#flash');
    flash.classList.add('go');
    requestAnimationFrame(() => flash.classList.remove('go'));
    navigator.vibrate?.(20);
    const r = finderRect();
    const grow = r.ss * 0.12;
    const sx = Math.max(0, r.sx - grow), sy = Math.max(0, r.sy - grow);
    const ss = Math.min(r.ss + 2 * grow, video.videoWidth - sx, video.videoHeight - sy);
    const c = document.createElement('canvas');
    c.width = c.height = Math.min(1200, Math.round(ss));
    c.getContext('2d').drawImage(video, sx, sy, ss, ss, 0, 0, c.width, c.height);
    stop();
    showMsg(html`<div class="card"><div class="spinner"></div><b>Poznávám…</b></div>`);
    try {
      const final = (await classifyPixels(toPixels(c, (c.width - c.width / 1.24) / 2, (c.height - c.height / 1.24) / 2, c.width / 1.24))).logp;
      // spojíme s posledními snímky z hledáčku (stabilnější výsledek)
      const recent = history.slice(-2).map((h) => h.logp);
      const logp = averageLogp([final, final, ...recent]);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
      const photo = { blob, logp };
      if (addMode) addPhoto(photo); else startResult(photo);
      location.hash = '#/vysledek';
    } catch (e) {
      showMsg('');
      toast('Rozpoznání se nepovedlo: ' + e.message);
      startCamera();
    }
  };

  $('#gal').onclick = () => openGallery({ add: !!addMode });
  $('#flip').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; startCamera(); };
  $('#torch').onclick = async () => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    torchOn = !torchOn;
    try { await track.applyConstraints({ advanced: [{ torch: torchOn }] }); } catch { torchOn = false; }
    $('#torch').classList.toggle('on', torchOn);
  };
  // ťuknutí = zaostřit (kde to prohlížeč umí)
  video.onclick = async () => {
    const track = stream?.getVideoTracks()[0];
    try { await track?.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] }); } catch { /* neumí */ }
  };
  const onVis = () => { if (!document.hidden && alive && !stream) startCamera(); };
  document.addEventListener('visibilitychange', onVis);

  if (!navigator.mediaDevices?.getUserMedia) {
    showMsg(html`<div class="card"><b>Tenhle prohlížeč nepustí appku ke kameře.</b><br>Vyber fotku z galerie.<br><br><button class="btn primary block" id="msgGal" type="button">${ic('photo')}Vybrat z galerie</button></div>`);
    $('#msgGal').onclick = () => openGallery({ add: !!addMode });
  } else {
    startCamera();
  }

  return () => {
    alive = false;
    stop();
    document.removeEventListener('visibilitychange', onVis);
  };
}

function averageLogp(list) {
  const C = list[0].length;
  const out = new Float32Array(C);
  for (const lp of list) for (let c = 0; c < C; c++) out[c] += lp[c] / list.length;
  return out;
}

// ---------- Fotka z galerie: výběr výřezu ----------

export function openGallery({ add = false } = {}) {
  const input = document.getElementById('galleryInput');
  input.value = '';
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (file) openCrop(file, add);
  };
  input.click();
}

async function openCrop(file, add) {
  await loadData();
  startEngine().catch(() => {});
  const url = URL.createObjectURL(file);
  const el = document.createElement('div');
  el.className = 'crop';
  el.innerHTML = String(html`<div class="crop-top">Zarámuj houbu<small>Posuň a přibliž fotku, ať houba vyplní rámeček</small></div>
    <div class="crop-area"><img alt=""><div class="crop-box"></div></div>
    <div class="crop-bottom">
      <input type="range" min="1" max="4" step="0.01" value="1" aria-label="Přiblížení">
      <button class="btn primary block" id="go" type="button">${ic('search')}Poznat houbu</button>
      <button class="btn ghost block" id="cancel" type="button" style="color:#fff">Zrušit</button>
    </div>`);
  document.body.append(el);
  document.body.classList.add('fullscreen');
  const img = el.querySelector('img');
  const area = el.querySelector('.crop-area');
  const box = el.querySelector('.crop-box');
  const zoom = el.querySelector('input');
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; }).catch(() => {
    toast('Tuhle fotku se nepodařilo otevřít.');
  });
  if (!img.naturalWidth) { close(); return; }

  let base = 1, scale = 1, tx = 0, ty = 0, B = 0;
  function layout() {
    const W = area.clientWidth, H = area.clientHeight;
    B = Math.round(Math.min(W, H) * 0.86);
    box.style.width = box.style.height = `${B}px`;
    base = B / Math.min(img.naturalWidth, img.naturalHeight);
    scale = base * +zoom.value;
    tx = (W - img.naturalWidth * scale) / 2;
    ty = (H - img.naturalHeight * scale) / 2;
    apply();
  }
  function clamp() {
    const W = area.clientWidth, H = area.clientHeight;
    const bl = (W - B) / 2, bt = (H - B) / 2;
    tx = Math.min(bl, Math.max(bl + B - img.naturalWidth * scale, tx));
    ty = Math.min(bt, Math.max(bt + B - img.naturalHeight * scale, ty));
  }
  function apply() { clamp(); img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; }
  function setScale(ns, cx, cy) {
    ns = Math.max(base, Math.min(base * 4, ns));
    tx = cx - (cx - tx) * (ns / scale);
    ty = cy - (cy - ty) * (ns / scale);
    scale = ns;
    zoom.value = String(scale / base);
    apply();
  }
  layout();
  zoom.oninput = () => setScale(base * +zoom.value, area.clientWidth / 2, area.clientHeight / 2);

  // posun a přiblížení prsty
  const pts = new Map();
  let lastDist = 0;
  area.onpointerdown = (e) => { area.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); lastDist = 0; };
  area.onpointermove = (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) { tx += e.clientX - prev[0]; ty += e.clientY - prev[1]; apply(); return; }
    const [a, b] = [...pts.values()];
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const r = area.getBoundingClientRect();
    if (lastDist) setScale(scale * (dist / lastDist), (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
    lastDist = dist;
  };
  area.onpointerup = area.onpointercancel = (e) => { pts.delete(e.pointerId); lastDist = 0; };
  area.onwheel = (e) => { e.preventDefault(); const r = area.getBoundingClientRect(); setScale(scale * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX - r.left, e.clientY - r.top); };
  window.addEventListener('resize', layout);

  function close() {
    window.removeEventListener('resize', layout);
    URL.revokeObjectURL(url);
    el.remove();
    if (!location.hash.startsWith('#/hledat')) document.body.classList.remove('fullscreen');
  }
  el.querySelector('#cancel').onclick = close;
  el.querySelector('#go').onclick = async () => {
    const go = el.querySelector('#go');
    go.disabled = true;
    go.innerHTML = '<span class="spinner" style="width:22px;height:22px;border-width:3px;margin:0"></span> Poznávám…';
    const W = area.clientWidth, H = area.clientHeight;
    const sx = ((W - B) / 2 - tx) / scale, sy = ((H - B) / 2 - ty) / scale, ss = B / scale;
    try {
      const { logp } = await classifyPixels(toPixels(img, sx, sy, ss));
      const c = document.createElement('canvas');
      const grow = ss * 0.1;
      const gx = Math.max(0, sx - grow), gy = Math.max(0, sy - grow);
      const gs = Math.min(ss + 2 * grow, img.naturalWidth - gx, img.naturalHeight - gy);
      c.width = c.height = Math.min(1200, Math.round(gs));
      c.getContext('2d').drawImage(img, gx, gy, gs, gs, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
      const photo = { blob, logp };
      if (add && session.result) addPhoto(photo); else startResult(photo, file.lastModified || Date.now());
      close();
      if (location.hash === '#/vysledek') window.dispatchEvent(new HashChangeEvent('hashchange'));
      else location.hash = '#/vysledek';
    } catch (e) {
      go.disabled = false;
      go.textContent = 'Zkusit znovu';
      toast('Rozpoznání se nepovedlo: ' + e.message);
    }
  };
}
