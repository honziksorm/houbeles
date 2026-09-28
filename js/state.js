// Stav rozpracovaného určování (mezi hledáčkem a výsledkem)

export const session = {
  // { date, photos: [{ blob, logp }] }
  result: null,
};

// Instalace na plochu: Android pošle událost beforeinstallprompt, iPhone jen návod
export const install = { prompt: null };
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function startResult(photo, date = Date.now()) {
  session.result = { date, photos: [photo] };
}

export function addPhoto(photo) {
  if (!session.result) startResult(photo);
  else session.result.photos.push(photo);
}

// Maskot: hříbek (stejný jako ikona appky). Na klepnutí mrkne a poskočí (css .mascot.go)
export const MASCOT = `<svg class="mascot" viewBox="8 12 112 104" aria-hidden="true"><path d="M46 70 Q36 102 50 110 Q64 116 78 110 Q92 102 82 70Z" fill="#f4e4c4" stroke="#1f2d23" stroke-width="5" stroke-linejoin="round"/><path d="M24 76 Q64 90 104 76 L100 70 L28 70Z" fill="#ecd592" stroke="#1f2d23" stroke-width="4" stroke-linejoin="round"/><path d="M14 70 C14 36 38 16 64 16 C90 16 114 36 114 70 C114 77 108 79 100 79 L28 79 C20 79 14 77 14 70Z" fill="#9a5b2e" stroke="#1f2d23" stroke-width="5.5" stroke-linejoin="round"/><path d="M32 44 Q42 30 58 26" fill="none" stroke="#c98a55" stroke-width="6" stroke-linecap="round"/><g class="eyes"><circle cx="57" cy="94" r="3.6" fill="#1f2d23"/><circle cx="71" cy="94" r="3.6" fill="#1f2d23"/><circle cx="58.2" cy="92.8" r="1.1" fill="#fff"/><circle cx="72.2" cy="92.8" r="1.1" fill="#fff"/></g><path d="M60 101 Q64 104.5 68 101" fill="none" stroke="#1f2d23" stroke-width="2.8" stroke-linecap="round"/><ellipse cx="51.5" cy="100" rx="3.6" ry="2.2" fill="#ff9aa2"/><ellipse cx="76.5" cy="100" rx="3.6" ry="2.2" fill="#ff9aa2"/></svg>`;
