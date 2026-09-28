// Rady: houbařské desatero, jak fotit, co dělat při otravě, o appce

import { html, ic, toast, plural } from '../ui.js';
import { loadData, SPECIES, METRICS } from '../data.js';
import { setKV, getKV } from '../db.js';
import { isModelDownloaded, downloadForOffline, MODEL_MB } from '../engine.js';

const DESATERO = [
  html`<b>Sbírej jen houby, které bezpečně znáš.</b> Houbeles je pomocník na učení, ne náhrada houbaře.`,
  html`<b>Vždycky vyhrab celou houbu i se spodkem třeně.</b> Hlíza nebo pochva u báze prozradí muchomůrku.`,
  html`<b>Bílé lupeny + prsten + hlíza = ruce pryč.</b> Tak vypadají nejjedovatější muchomůrky.`,
  html`<b>Nesbírej moc mladé „vajíčkové“ plodnice ani staré, nasáklé a plesnivé houby.</b>`,
  html`<b>Neznámé houby nedávej do košíku k jedlým.</b> Úlomky se snadno pomíchají.`,
  html`<b>Houby nos v košíku, ne v igelitu.</b> V sáčku se zapaří a zkazí.`,
  html`<b>Houby zpracuj ještě ten den</b> a většinu důkladně tepelně uprav (aspoň 20 minut).`,
  html`<b>Pozor na staré rady.</b> Některé dřív „jedlé“ houby (čechratka, čirůvka zelánka) jsou dnes známé jako jedovaté.`,
  html`<b>Děti, těhotné a nemocní by měli houby jíst jen střídmě</b> a jen ty nejznámější.`,
  html`<b>Při podezření na otravu nečekej.</b> Hned volej a schovej zbytky hub i jídla pro určení.`,
];

const FOTIT = [
  ['photo', 'Celou houbu z boku, i se spodkem třeně (vyhrab ji).'],
  ['zoom-in', 'Spodek klobouku zblízka: lupeny, rourky nebo ostny.'],
  ['sun', 'Za denního světla, ostře. Houba ať vyplní rámeček.'],
  ['photo-plus', 'Více fotek jedné houby výrazně zvýší přesnost.'],
];

export async function render(root) {
  await loadData();
  const ready = await isModelDownloaded();
  const nSpecies = SPECIES.filter((s) => !s.neg).length;
  root.innerHTML = html`<div class="page">
    <h1 class="page-title">Rady houbaři</h1>

    <div class="card sos">
      <h2 style="font-size:22px;display:flex;gap:8px;align-items:center">${ic('first-aid-kit')}Podezření na otravu?</h2>
      <p style="margin:6px 0 4px">Toxikologické informační středisko radí nonstop. Při vážných potížích (zvracení, průjem, zmatenost) volej rovnou záchranku.</p>
      <a class="btn primary block" href="tel:+420224919293">${ic('phone-call')}Toxikologické středisko 224 919 293</a>
      <a class="btn block" href="tel:155">${ic('ambulance')}Záchranka 155</a>
      <p class="muted" style="font-size:13px;margin:8px 0 0">Příznaky u nejjedovatějších hub (muchomůrka zelená, pavučinec plyšový) přicházejí až po 6 hodinách i dnech. Nečekej, až se ti udělá zle.</p>
    </div>

    <h2 class="section-title">${ic('camera')}Jak fotit, aby určení sedělo</h2>
    <div class="card pad stack">${FOTIT.map(([i, t]) => html`<div class="row" style="font-weight:700">${ic(i)}<span>${t}</span></div>`)}</div>

    <h2 class="section-title">${ic('shield-check')}Houbařské desatero</h2>
    <ol class="tips" style="padding:0;margin:0;list-style:none">${DESATERO.map((t) => html`<li class="card tip">${t}</li>`)}</ol>
    <div id="endTips"></div>

    <h2 class="section-title">${ic('wifi-off')}Offline v lese</h2>
    <div class="card pad" id="off">${ready
      ? html`<b>Houbeles je stažený v telefonu</b> a poznává houby i bez signálu.`
      : html`<b>Zatím potřebuje internet.</b> Stáhni si ho (asi ${MODEL_MB} MB), ať funguje i v lese.<div class="progress" hidden style="margin-top:10px"><i></i></div>
        <button class="btn green block" id="dl" type="button" style="margin-top:10px">${ic('download')}Stáhnout pro offline</button>`}
      <p class="muted" style="font-size:13px;margin:8px 0 0">Na iPhonu přidej Houbeles na plochu (Sdílet → Přidat na plochu), na Androidu „Nainstalovat aplikaci“ v menu prohlížeče.</p>
    </div>

    <h2 class="section-title">${ic('info-circle')}O appce</h2>
    <div class="card pad about">
      <p>Houbeles pozná ${plural(nSpecies, 'druh', 'druhy', 'druhů')} hub z českých lesů. Počítá přímo v telefonu, fotky ani poloha nikam neodcházejí.</p>
      ${METRICS ? html`<p><b>Jak přesně?</b> V testu na fotkách, které nikdy neviděl, dal správný druh na první místo v ${Math.round(METRICS.top1 * 100)} % případů a mezi pět tipů v ${Math.round(METRICS.top5 * 100)} %. Když hlásí jistotu nad 90 %, měl pravdu v ${Math.round(METRICS.conf90 * 100)} % případů. Z jedné fotky shora jsou některé skupiny těžké (holubinky, pavučince, drobné lupenaté houby), fotka zespodu hodně pomůže.</p>` : ''}
      <p><b>Z čeho se učil:</b> fotky z <a href="https://www.inaturalist.org" target="_blank" rel="noopener">iNaturalistu</a> (licence CC, autoři u fotek v atlasu), rozpoznávací model BioCLIP (Imageomics, MIT), jedlost a znaky z Wikidat, popisy z české Wikipedie (CC BY-SA), ikonky Tabler (MIT), písma Baloo 2 a Nunito (OFL).</p>
    </div>
  </div>`;

  // odznáček „Houbařské desatero“: stačí dojet na konec rad
  if (!(await getKV('tipsRead'))) {
    const io = new IntersectionObserver(async ([e]) => {
      if (e.isIntersecting) { io.disconnect(); await setKV('tipsRead', true); toast('Desatero přečteno. Mrkni do Nálezů na nový odznáček!', { kind: 'ok' }); }
    });
    io.observe(root.querySelector('#endTips'));
  }
  const dl = root.querySelector('#dl');
  if (dl) {
    dl.onclick = async () => {
      const bar = root.querySelector('#off .progress');
      bar.hidden = false;
      dl.disabled = true;
      try {
        await downloadForOffline((p) => { bar.firstElementChild.style.width = `${Math.round(p * 100)}%`; });
        toast('Hotovo! Houbeles funguje i bez signálu.', { kind: 'ok' });
        render(root);
      } catch { dl.disabled = false; toast('Stažení se nepovedlo, zkus to znovu.'); }
    };
  }
}
