// De gidsen: rondleiding en uitleg met zes personages, naar het voorbeeld van Relic Slide (gids.js).
// Een personage legt in een tekstballon iets uit; de rest van het scherm wordt donkerder en het
// onderdeel waar het over gaat krijgt een gouden lijst. Twee soorten uitleg:
//   1. De rondleiding (TOUR): langs het menu, de moduskeuze en de campagnekaart. Nieuwe spelers
//      krijgen hem één keer aangeboden; opnieuw via "? Tour" (lr:open met detail 'tour').
//   2. Uitleg in het gevecht (BATTLE): bij het eerste gevecht; het gevecht wacht zolang de uitleg open is.
// Gezien = localStorage 'lr-guide' ({ tour, battle }). Teksten: **woord** wordt vet; houd ze kort.
//
// Een stap: { who, text, target?, before?, after? }
//   who     sleutel uit CAST, of 'all' voor het slotplaatje met alle gidsen
//   target  CSS-selector(s) van een DOM-onderdeel, of 'canvas:<sleutel>' voor iets dat Phaser tekent
//           (src/main.js geeft daarvan de plek via window.lrCanvasRect). Weglaten = alleen de ballon.
import './guide.css';
import { shieldFromGame } from './screens.js';
import { conquestScreens } from './conquest.js';
import { BUILD } from './version.js';

const BASE = import.meta.env.BASE_URL;
const img = who => `${BASE}assets/art/guide-${who}.webp?v=${BUILD}`;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = name => window.dispatchEvent(new CustomEvent('lr:open', { detail: name }));

// ---------- de zes gidsen ----------
// Eigen (verzonnen) namen, de eenheid als ondertitel. Geen namen van bekende historische personen.
const CAST = {
  banner: { name: 'Aurélie', role: 'Banner Maiden' },        // leidt de rondleiding, warm en vastberaden
  centurion: { name: 'Marcus', role: 'Centurion' },          // luid, kort, militair
  samurai: { name: 'Kenji', role: 'Shadow Samurai' },        // kalm, weinig woorden
  assassin: { name: 'Parisa', role: 'Persian Assassin' },    // snel, een tikje spottend
  priestess: { name: 'Meret', role: 'Priestess' },           // rustig, zorgzaam
  pilot: { name: 'James', role: 'P-51 Pilot' },              // opgewekt, luchtmachtjargon
};
const WHO = Object.keys(CAST);

// Geluid als een gids in beeld komt: een kus bij Aurélie, mes bij Parisa, genezing bij Meret, iets stoers bij de mannen. Bestaande effecten
// uit public/assets/audio. [bestand, volume, maximaal aantal seconden]. Volgt de geluidsknop ('lr-sound').
const VOICE = {
  banner: ['kiss', 0.55], assassin: ['knife', 0.6], priestess: ['heal', 0.45, 1.2],   // kus alleen bij Aurélie
  centurion: ['sword-1', 0.6], samurai: ['sword-3', 0.6], pilot: ['machine-gun', 0.4, 0.7],
  all: ['choir', 0.4],
};
let voice = null, lastVoice = null;
function playVoice(who) {
  if (who === lastVoice) return;                 // dezelfde gids twee stappen achter elkaar: één keer
  lastVoice = who;
  try { if (localStorage.getItem('lr-sound') === 'off') return; } catch {}
  const v = VOICE[who];
  if (!v) return;
  try {
    voice?.pause();
    const a = new Audio(`${BASE}assets/audio/${v[0]}.mp3?v=${BUILD}`);
    a.volume = v[1];
    if (v[2]) a.addEventListener('timeupdate', () => { if (a.currentTime > v[2]) a.pause(); });
    a.play().catch(() => {});                    // zonder eerdere tik mag een browser geluid weigeren
    voice = a;
  } catch {}
}

// ---------- de rondleiding ----------
const TOUR = [
  { who: 'banner',
    text: 'Welcome, commander! I am **Aurélie**, the Banner Maiden. In Legion Royale you lead warriors from every age into battle. My companions and I will show you around.' },
  { who: 'centurion', target: 'canvas:play',
    text: 'Ave! I am **Marcus**, centurion of the legion. Every campaign starts here: **Play** opens the mode selection.' },
  { who: 'centurion', target: '.cq-mode.conquest', before: () => open('modes'),
    text: '**The Conquest** is your campaign: 25 missions and two hidden bonus missions on the road to Rome. March with me!' },
  { who: 'samurai', target: '.cq-mode.trophy',
    text: 'I am **Kenji**. On **Trophy Road** you will face other players. Those battles are still being forged; for now you can study the road ahead.' },
  { who: 'assassin', target: '.cq-quick',
    text: '**Parisa**, at your service. No time for a campaign? **Quick Battle** is one fight against the computer. The crossed swords in the menu do the same.' },
  { who: 'centurion', target: ['.cq-node.current', '.cq-node:not(.locked)', '.cq-map'], before: () => open('conquest'),
    text: 'The campaign map. Tap the **glowing medal** for your next mission: its objective, the enemy cards and how to earn **three stars**. Drag the map to look ahead.' },
  { who: 'priestess', target: 'canvas:decks', before: () => conquestScreens.close(),
    text: 'I am **Meret**. Here you build your **deck**: eight cards, four in your hand. Each card shows if it is **Bio**, **Mechanical** or **Special**: poison, healing and spies only work on Bio. Fragments and coins **upgrade** your cards.' },
  { who: 'pilot', target: 'canvas:trophy',
    text: '**James** here, roger that! Your **achievements** and **profile** are here: level, XP and your battle record.' },
  { who: 'assassin', target: 'canvas:bell',
    text: '**Friends**. Share your friend code and add allies. A red dot on the bell means someone sent you a request.' },
  { who: 'priestess', target: '#lr-profile',
    text: '**Sign in** to keep your level, cards and coins safe. You can also keep playing as a guest.' },
  { who: 'samurai',
    text: 'In battle: **choose a card**, then tap one of your **blue lanes**. Every card costs **energy**, and energy returns with time. Patience wins.' },
  { who: 'pilot',
    text: 'Knock out a **tower** and your deployment zone moves forward. Take the **enemy castle** to win, or hold more buildings when time runs out.' },
  { who: 'all',
    text: 'That is all, commander! Lost your way? **? Tour** in the menu brings us back. To battle!' },
];

// ---------- uitleg in het gevecht ----------
const BATTLE = [
  { who: 'banner', target: 'canvas:cards',
    text: 'Your **hand**: four cards from your deck. The purple gem is the price in **energy**. Tap a card to choose it.' },
  { who: 'banner', target: 'canvas:lanes',
    text: 'Then tap a **blue lane** to send that warrior in. Units march, find a target and fight on their own.' },
  { who: 'banner', target: 'canvas:energy',
    text: 'This is your **energy**. It refills by itself, and faster in the last minute. A large army slows it down a little.' },
  { who: 'banner', target: 'canvas:pause',
    text: '**Pause** here to change the sound, restart or surrender. Now break their towers and take the castle. For glory!' },
];

// ---------- opslaan ----------
const STORE = 'lr-guide';
const seen = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } })();
const mark = key => { seen[key] = true; try { localStorage.setItem(STORE, JSON.stringify(seen)); } catch {} };

// ---------- hulpjes ----------
const visible = el => {
  if (!el || !el.getClientRects().length) return false;
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none';
};
/** Plek van het onderdeel in schermpixels ({ left, top, width, height }), of null. */
function rectOf(step) {
  for (const q of [].concat(step.target ?? [])) {
    if (q.startsWith('canvas:')) {
      let r = null;
      try { r = window.lrCanvasRect?.(q.slice(7)) ?? null; } catch { r = null; }
      if (r && r.width > 4 && r.height > 4) return r;
      continue;
    }
    const el = document.querySelector(q);
    if (visible(el)) return el.getBoundingClientRect();
  }
  return null;
}
/** Het onderdeel in beeld schuiven als het in een schuifbaar vlak staat (de campagnekaart). */
function bring(step) {
  for (const q of [].concat(step.target ?? [])) {
    if (q.startsWith('canvas:')) continue;
    const el = document.querySelector(q);
    if (visible(el) && el.closest('.cq-scroll')) { el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' }); return; }
  }
}
// Staat er iets anders open (laadscherm, inloggen, profiel, uitslag)? Dan wacht de gids.
const busy = () => !!document.getElementById('splash') || visible(document.getElementById('lr-auth-dialog')) ||
  !!document.querySelector('#lr-screens .lr-screen') || conquestScreens.isOpen();
async function whenFree(max = 240) { for (let n = 0; n < max && busy(); n++) await sleep(500); return !busy(); }
// tekst met **vet**
function rich(box, text) {
  box.replaceChildren();
  String(text).split(/\*\*/).forEach((part, k) => {
    if (!part) return;
    if (k % 2) { const b = document.createElement('b'); b.textContent = part; box.append(b); } else box.append(part);
  });
}

// ---------- weergave ----------
let ui = null, run = null, raf = 0;
function makeUi() {
  if (ui) return ui;
  const root = document.createElement('div');
  root.className = 'gids'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Guide');
  root.innerHTML = `<div class="gids-dim"></div><div class="gids-ring"></div><div class="gids-all" hidden></div>
    <div class="gids-panel"><div class="gids-who"></div><div class="gids-bubble" aria-live="polite">
      <button type="button" class="gids-skip"></button><p class="gids-name"><span></span><small></small></p><p class="gids-text"></p>
      <div class="gids-row"><span class="gids-steps"></span><button type="button" class="gids-btn gids-prev"></button><button type="button" class="gids-btn gids-next"></button></div>
    </div></div>`;
  document.body.append(root);
  shieldFromGame(root);                      // tikken op de gids gaan niet door naar het spel eronder
  const $ = s => root.querySelector(s);
  ui = { root, ring: $('.gids-ring'), all: $('.gids-all'), panel: $('.gids-panel'), who: $('.gids-who'), name: $('.gids-name span'),
    role: $('.gids-name small'), text: $('.gids-text'), steps: $('.gids-steps'), prev: $('.gids-prev'), next: $('.gids-next'), skip: $('.gids-skip') };
  ui.next.addEventListener('click', () => run?.onNext());
  ui.prev.addEventListener('click', () => run?.onPrev());
  ui.skip.addEventListener('click', () => run?.onSkip());
  return ui;
}
document.addEventListener('keydown', e => {
  if (!run || !ui) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); run.onSkip(); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); run.onNext(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); run.onPrev(); }
  else if (/^[1-4rR]$/.test(e.key)) e.stopImmediatePropagation();      // geen kaart kiezen of herstarten tijdens de uitleg
}, true);
// De gouden lijst volgt het onderdeel (schuiven, draaien, schermgrootte).
function track() {
  cancelAnimationFrame(raf);
  const loop = () => {
    if (!run || !ui) return;
    const r = run.step ? rectOf(run.step) : null;
    if (r) {
      const pad = 6, vw = innerWidth, vh = innerHeight;
      const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
      const w = Math.min(vw - 4, r.left + r.width + pad) - x, h = Math.min(vh - 4, r.top + r.height + pad) - y;
      Object.assign(ui.ring.style, { left: x + 'px', top: y + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, h) + 'px' });
      ui.root.classList.add('has-target');
    } else ui.root.classList.remove('has-target');
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
function show(step, o) {
  const u = makeUi();
  u.root.classList.add('on');
  const all = step.who === 'all', who = all ? 'banner' : (CAST[step.who] ? step.who : 'banner');
  u.who.replaceChildren(); u.all.replaceChildren(); u.all.hidden = !all; u.who.hidden = all;
  if (all) WHO.forEach(n => { const i = new Image(); i.src = img(n); i.alt = ''; u.all.append(i); });
  else { const i = new Image(); i.src = img(who); i.alt = CAST[who].name; i.className = 'wave'; u.who.append(i); }
  playVoice(all ? 'all' : who);
  u.name.textContent = all ? 'To battle!' : CAST[who].name;
  u.role.textContent = all ? WHO.map(n => CAST[n].name).join(' · ') : CAST[who].role;
  rich(u.text, step.text);
  u.steps.textContent = o.count || '';
  u.prev.hidden = !o.prev; u.prev.textContent = o.prev || '';
  u.next.textContent = o.next;
  u.skip.hidden = !o.skip; u.skip.textContent = o.skip || '';
  // plaats: de ballon niet over het onderdeel heen
  const r = rectOf(step);
  u.panel.classList.toggle('top', !!(r && r.top + r.height / 2 > innerHeight * 0.52));
  // het personage staat aan de kant waar het onderdeel níet is; zonder onderdeel om en om
  const right = r ? r.left + r.width / 2 < innerWidth / 2 : o.side === 'right';
  u.panel.classList.toggle('right', !all && right);
  u.panel.classList.toggle('aside', !!r);
  u.panel.classList.toggle('solo', all);
  track();
}
function close() {
  cancelAnimationFrame(raf);
  lastVoice = null;
  run = null;
  ui?.root.remove(); ui = null;
  window.lrGuideOpen = false;
}

// ---------- een reeks stappen afspelen ----------
// opts: { start, labels: { next, last }, onDone(completed) }
async function play(steps, opts = {}) {
  if (run) close();
  let i = 0;
  const r = { step: null };
  run = r;
  window.lrGuideOpen = true;                 // het gevecht (src/main.js) wacht zolang dit waar is
  const go = async n => {
    if (run !== r) return;
    if (n < 0) n = 0;
    if (n >= steps.length) { finish(true); return; }
    const s = steps[n];
    i = n;
    if (s.before) { try { await s.before(); } catch {} await sleep(reduce ? 60 : 260); }
    if (run !== r) return;
    bring(s);
    r.step = s;
    const last = n === steps.length - 1;
    show(s, { count: steps.length > 1 ? `${n + 1} / ${steps.length}` : '', prev: n > 0 ? 'Back' : '',
      next: last ? (opts.labels?.last ?? 'Got it!') : (n === 0 && opts.labels?.first) || 'Next',
      skip: steps.length > 1 && !last ? 'Skip' : '', side: n % 2 ? 'right' : 'left' });
  };
  const finish = completed => { if (run !== r) return; close(); opts.onDone?.(completed); };
  r.onNext = () => go(i + 1);
  r.onPrev = () => {                          // terug: schermen die een latere stap opende weer sluiten
    const target = Math.max(0, i - 1);
    const reopen = steps.slice(0, target + 1).reverse().find(s => s.before);
    conquestScreens.close();
    if (reopen && reopen !== steps[target]) { try { reopen.before(); } catch {} }
    go(target);
  };
  r.onSkip = () => finish(false);
  await go(opts.start ?? 0);
}

// ---------- de soorten uitleg ----------
function startTour() {
  conquestScreens.close();
  return play(TOUR, { labels: { first: 'Show me around', last: 'To battle!' },
    onDone: () => { mark('tour'); conquestScreens.close(); } });
}
/** Eerste bezoek: de rondleiding één keer aanbieden zodra het menu vrij is. */
async function offer() {
  if (seen.tour || run) return;
  if (!(await whenFree())) return;
  if (seen.tour || run) return;
  await startTour();
  if (!ui || !run) return;
  const no = document.createElement('button');
  no.type = 'button'; no.className = 'gids-btn gids-prev gids-no'; no.textContent = 'No, thanks';
  no.addEventListener('click', () => run?.onSkip());
  ui.next.before(no);
  const next = run.onNext;
  run.onNext = () => { no.remove(); run.onNext = next; next(); };
}
function battleGuide() {
  if (seen.battle || run) return;
  mark('battle');
  // even wachten tot het slagveld getekend is, anders heeft de gouden lijst nog geen plek
  setTimeout(() => { if (!run && typeof window.lrCanvasRect === 'function') play(BATTLE, { labels: { last: 'For glory!' } }); }, 700);
}

window.addEventListener('lr:menu', () => { if (!seen.tour) offer(); });
window.addEventListener('lr:battle', () => { if (run) close(); battleGuide(); });
window.addEventListener('lr:open', e => { if (e.detail === 'tour') startTour(); });
export const guide = { start: startTour, isOpen: () => run !== null, cast: CAST };
window.lrGuide = guide;     // handig in de console: lrGuide.start()
