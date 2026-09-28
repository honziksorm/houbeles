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

export const MASCOT = `<svg class="mascot" viewBox="0 0 120 120" aria-hidden="true"><path d="M42 60 Q39 101 47 105 Q60 111 73 105 Q81 101 78 60Z" fill="#fff6e3" stroke="#1f2d23" stroke-width="5" stroke-linejoin="round"/><path d="M8 64 C8 28 34 10 60 10 C86 10 112 28 112 64 C112 71 106 73 97 73 L23 73 C14 73 8 71 8 64Z" fill="#e5484d" stroke="#1f2d23" stroke-width="5" stroke-linejoin="round"/><g fill="#fff"><circle cx="38" cy="34" r="7"/><circle cx="64" cy="24" r="6"/><circle cx="87" cy="40" r="8"/><circle cx="58" cy="50" r="5"/><circle cx="24" cy="56" r="4.5"/><circle cx="98" cy="60" r="4"/></g><circle cx="52" cy="85" r="4.5" fill="#1f2d23"/><circle cx="68" cy="85" r="4.5" fill="#1f2d23"/><circle cx="53.5" cy="83.5" r="1.4" fill="#fff"/><circle cx="69.5" cy="83.5" r="1.4" fill="#fff"/><path d="M55 93 Q60 98 65 93" fill="none" stroke="#1f2d23" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="45" cy="93" rx="4.5" ry="2.8" fill="#ff9aa2"/><ellipse cx="75" cy="93" rx="4.5" ry="2.8" fill="#ff9aa2"/></svg>`;
