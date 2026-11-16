// Moduskeuze, The Conquest (campagnekaart + missiepaneel) en de Trophy Road-vooruitblik.
// DOM-schermen boven het Phaser-menu, net als src/screens.js. Regels en gegevens: src/campaign/.
//
// Openen:  window.dispatchEvent(new CustomEvent('lr:open', { detail: 'modes' | 'conquest' | 'trophy' }))
// Starten: dit bestand stuurt 'lr:start' met { mission } (of { mission: null } voor een los gevecht);
//          src/main.js start daarop het gevecht.
import './conquest.css';
import { shieldFromGame, cardPortrait, CARD_NAMES } from './screens.js';
import ART from './art/conquest.json';
import { BUILD } from './version.js';
import { account } from './account.js';
import { ABILITY, unitKinds } from './unit-info.js';
import { ROME } from './campaign/rome.js';
import { missionById, missionStatus, currentMission, totalStars, starsOf, withResult, sanitizeProgress,
  requirement, GOAL_TEXT, conditionText, MAX_STARS } from './campaign/campaign.js';

const BASE = import.meta.env.BASE_URL;
const art = name => `${BASE}assets/art/${name}.webp?v=${BUILD}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Voortgang ----------
// Ingelogd: de server (public/api/campaign.php, tabel campaign_progress) is de bron; hier staat een kopie.
// Gast: alleen op dit toestel (localStorage). Bij inloggen gaat wat je als gast speelde mee naar je account
// (sterren gaan alleen omhoog, zonder munten). Lukt de server niet, dan valt het terug op dit toestel.
const STORE = 'lr-conquest-v1';
let serverProgress = null;        // { missieId: sterren } van de server, of null (gast / nog niet geladen)
function localProgress() {
  try { return sanitizeProgress(JSON.parse(localStorage.getItem(STORE))); } catch { return {}; }
}
function saveLocal(p) { try { localStorage.setItem(STORE, JSON.stringify(p)); } catch {} }
const onServer = () => account.signedIn && serverProgress !== null;
function loadProgress() { return onServer() ? serverProgress : localProgress(); }

async function syncWithServer() {
  if (!account.signedIn) { serverProgress = null; refresh(); return; }
  try {
    const local = localProgress();
    let r = await account.api('GET', 'campaign.php');
    if (Object.entries(local).some(([id, s]) => (r.progress?.[id] ?? 0) < s)) r = await account.api('POST', 'campaign.php', { import: local });
    serverProgress = sanitizeProgress(r.progress);
  } catch (e) { console.warn('campaign progress', e); serverProgress = null; }
  refresh();
}
export const conquest = {
  progress: loadProgress,
  /** Legt de uitslag van een missie vast (direct zichtbaar). Ingelogd bevestigt de server het met `confirm`.
   *  Geeft { stars, best, firstClear, next } terug. */
  record(missionId, stars) {
    const before = loadProgress(), after = withResult(before, missionId, stars);
    if (onServer()) serverProgress = after; else saveLocal(after);
    const mission = missionById(missionId);
    const main = ROME.missions.filter(x => !x.bonus), i = main.indexOf(mission);
    const next = stars > 0 && i >= 0 && i < main.length - 1 ? main[i + 1].id : null;
    return { stars, best: starsOf(after, missionId), firstClear: starsOf(before, missionId) === 0 && stars > 0, next };
  },
  /** Antwoord van match-finish.php: { id, best } is wat de server heeft opgeslagen. */
  confirm(result) {
    if (!result?.id || !onServer()) return;
    serverProgress = withResult(serverProgress, result.id, result.best);
  },
};

// ---------- Schermopbouw ----------
const root = document.createElement('div');
root.id = 'lr-conquest';
document.body.append(root);
shieldFromGame(root);

let current = null;
let listeners = null;             // window-luisteraars van het huidige scherm (opruimen bij wisselen)
let lastMissionId = null;          // om na een gevecht op dezelfde plek op de kaart terug te komen
function show(name, html, onMount) {
  listeners?.abort(); listeners = new AbortController();
  current = name;
  root.innerHTML = `<div class="cq-screen" data-screen="${name}">${html}</div>`;
  root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  onMount?.(root.firstElementChild);
}
function close() { listeners?.abort(); listeners = null; current = null; root.innerHTML = ''; }
function go(where) { ({ menu: close, modes: showModes, conquest: showConquest, trophy: showTrophy })[where]?.(); }
function toast(msg) {
  const t = document.createElement('div'); t.className = 'lr-toast'; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.classList.add('out'), 2200); setTimeout(() => t.remove(), 2700);
}
const backButton = (to, label = 'Back') => `<button class="cq-back" data-go="${to}">‹ ${label}</button>`;
const starRow = (n, cls = '') => `<span class="cq-stars ${cls}">${Array.from({ length: MAX_STARS }, (_, i) =>
  `<img src="${art(i < n ? 'star-full' : 'star-empty')}" alt="">`).join('')}</span>`;
const plateStyle = p => `left:${p.left}%;top:${p.top}%;width:${p.width}%;height:${p.height}%`;

// ---------- Choose Your Mode ----------
function showModes() {
  const progress = loadProgress(), cur = currentMission(progress);
  const total = ROME.missions.length * MAX_STARS;
  const card = (key, mode, title, sub, extra = '') => `
    <button class="cq-mode ${mode}" data-mode="${mode}" style="aspect-ratio:${ART[key].width}/${ART[key].height}">
      <img src="${art(key)}" alt="">
      <span class="cq-plate" style="${plateStyle(ART[key].plate)}"><b>${title}</b></span>
      <span class="cq-sub">${sub}</span>${extra}
    </button>`;
  show('modes', `
    <div class="cq-bg" style="background-image:url(${art('menu-bg')})"></div>
    <header class="cq-title"><img src="${art('scroll')}" alt=""><h1>CHOOSE YOUR MODE</h1></header>
    <div class="cq-modes">
      ${card('mode-conquest', 'conquest', 'THE CONQUEST', 'Single-Player Campaign',
        `<span class="cq-tag">${cur ? `Mission ${cur.n} · ` : 'Completed · '}★ ${totalStars(progress)}/${total}</span>`)}
      ${card('mode-trophy', 'trophy', 'TROPHY ROAD', 'Multiplayer Progression', '<span class="cq-tag soon">Preview · PvP coming soon</span>')}
    </div>
    <div class="cq-modes-low">
      ${card('mode-ranked', 'ranked', 'SEASONAL RANKED', 'Coming soon')}
      <button class="cq-quick" data-mode="quick"><b>⚔ Quick Battle</b><small>One battle against the computer</small></button>
    </div>
    ${backButton('menu', 'Menu')}<button class="cq-tour" data-tour>? Tour</button>`, el => {
    el.querySelector('[data-tour]').addEventListener('click', () => window.dispatchEvent(new CustomEvent('lr:open', { detail: 'tour' })));
    el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      const m = b.dataset.mode;
      if (m === 'conquest') showConquest();
      else if (m === 'trophy') showTrophy();
      else if (m === 'quick') start(null);
      else toast('Seasonal Ranked arrives after online battles.');
    }));
  });
}

// ---------- The Conquest: kaart ----------
const MAP = ART.map;
const nodeX = m => 100 * ((m.seg - 1) * MAP.segmentStep + m.x) / MAP.width;
const nodeY = m => 100 * m.y / MAP.height;
function nodeArt(mission, status, isCurrent) {
  if (status === 'locked') return 'node-locked';
  if (mission.boss) return 'node-boss';
  if (mission.bonus) return 'node-bonus';
  if (status === 'done') return 'node-done';
  return isCurrent ? 'node-current' : 'node-open';
}

function showConquest(focusId = lastMissionId) {
  const progress = loadProgress(), cur = currentMission(progress);
  const total = ROME.missions.length * MAX_STARS;
  const nodes = ROME.missions.map(m => {
    const status = missionStatus(progress, m), isCur = cur?.id === m.id, stars = starsOf(progress, m.id);
    return `<button class="cq-node ${status}${isCur ? ' current' : ''}${m.boss ? ' boss' : ''}${m.bonus ? ' bonus' : ''}"
      data-id="${m.id}" style="left:${nodeX(m).toFixed(3)}%;top:${nodeY(m).toFixed(2)}%" aria-label="Mission ${m.n}: ${esc(m.title)}">
      <img src="${art(nodeArt(m, status, isCur))}" alt="" draggable="false">
      <span class="cq-num">${m.n}</span>${status === 'done' ? starRow(stars) : ''}</button>`;
  }).join('');
  // Stippellijn van het hoofdpad naar een bonusmissie.
  const links = ROME.missions.filter(m => m.bonus).map(m => {
    const from = missionById(requirement(m));
    const gx = x => (x.seg - 1) * MAP.segmentStep + x.x;
    return `<line x1="${gx(from)}" y1="${from.y}" x2="${gx(m)}" y2="${m.y}" class="${missionStatus(progress, m)}"/>`;
  }).join('');
  show('conquest', `
    <div class="cq-scroll"><div class="cq-map" style="aspect-ratio:${MAP.width}/${MAP.height}">
      ${Array.from({ length: MAP.tiles }, (_, i) => `<img class="cq-tile" src="${art('conquest-map-' + (i + 1))}" alt="" draggable="false"
        style="left:${100 * i / MAP.tiles}%;width:${100 / MAP.tiles + 0.02}%">`).join('')}
      <svg class="cq-links" viewBox="0 0 ${MAP.width} ${MAP.height}" preserveAspectRatio="none">${links}</svg>
      ${ROME.regions.map((r, i) => `<span class="cq-region" style="left:${100 * (i * MAP.segmentStep + MAP.segmentWidth / 2) / MAP.width}%">${esc(r)}</span>`).join('')}
      ${nodes}
    </div></div>
    <header class="cq-mapbar"><b>THE CONQUEST</b><span>${esc(ROME.title)}</span>
      <em><img src="${art('star-full')}" alt=""> ${totalStars(progress)} / ${total}</em></header>
    ${backButton('modes')}`, el => {
    const scroller = el.querySelector('.cq-scroll');
    const centre = id => {
      const node = id && el.querySelector(`[data-id="${id}"]`);
      if (node) scroller.scrollLeft = node.offsetLeft - scroller.clientWidth / 2;
    };
    // Een nog niet gehaalde missie die je net speelde blijft in beeld; anders de huidige missie.
    const retry = focusId && starsOf(progress, focusId) === 0 ? focusId : null;
    requestAnimationFrame(() => centre(retry ?? cur?.id ?? focusId ?? ROME.missions.filter(m => !m.bonus).at(-1).id));
    // Muis: slepen en scrollwiel verschuiven de kaart (aanraken schuift vanzelf).
    let drag = null, dragged = false;
    scroller.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') { drag = { x: e.clientX, left: scroller.scrollLeft }; dragged = false; } });
    window.addEventListener('pointermove', e => {
      if (!drag) return;
      if (Math.abs(e.clientX - drag.x) > 6) dragged = true;
      if (dragged) scroller.scrollLeft = drag.left - (e.clientX - drag.x);
    }, { signal: listeners.signal });
    window.addEventListener('pointerup', () => { drag = null; }, { signal: listeners.signal });
    scroller.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { scroller.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    el.querySelectorAll('.cq-node').forEach(b => b.addEventListener('click', () => {
      if (dragged) { dragged = false; return; }
      const mission = missionById(b.dataset.id);
      if (missionStatus(loadProgress(), mission) === 'locked') {
        const need = missionById(requirement(mission));
        toast(`Locked — complete mission ${need.n} “${need.title}” first.`);
        return;
      }
      showMission(mission);
    }));
  });
}

// ---------- Missiepaneel ----------
function showMission(mission) {
  const best = starsOf(loadProgress(), mission.id);
  const panel = document.createElement('div');
  panel.className = 'cq-modal';
  panel.innerHTML = `
    <div class="cq-panel" style="aspect-ratio:${ART['mission-panel'].width}/${ART['mission-panel'].height};background-image:url(${art('mission-panel')})">
      <div class="cq-panel-in">
        <p class="cq-kicker">${mission.bonus ? 'Bonus mission' : mission.boss ? `Mission ${mission.n} · Boss` : `Mission ${mission.n}`} · ${esc(ROME.regions[mission.seg - 1])}</p>
        <h2>${esc(mission.title)}</h2>
        <p class="cq-brief">${esc(mission.brief)}</p>
        <div class="cq-cols">
          <div><h3>Objective</h3><p class="cq-goal">${esc(GOAL_TEXT[mission.goal](mission))}</p>
            <ul class="cq-conds">${mission.stars.map((c, i) => `<li class="${i < best ? 'got' : ''}"><img src="${art(i < best ? 'star-full' : 'star-empty')}" alt="">${esc(conditionText(c))}</li>`).join('')}</ul>
          </div>
          <div><h3>Enemy · Level ${mission.enemy.level}</h3>
            <div class="cq-enemy${mission.enemy.deck.length > 6 ? ' many' : ''}">${mission.enemy.deck.map(t => `<span title="${esc(`${CARD_NAMES[t]} · ${unitKinds(t).join(' · ')} — ${ABILITY[t] ?? ''}`)}">${cardPortrait(t)}<em class="cq-kind ${unitKinds(t)[0].toLowerCase()}${unitKinds(t).includes('Special') ? ' special' : ''}">${unitKinds(t).map(k => k[0]).join('')}</em></span>`).join('')}</div>
            ${mission.player?.rate < 1 ? '<p class="cq-warn">Your energy returns more slowly here.</p>' : ''}
            ${mission.enemy.start > 6 ? '<p class="cq-warn">The enemy starts with extra energy.</p>' : ''}
          </div>
        </div>
        <button class="cq-start"><img src="${art('result-button')}" alt=""><span>${best ? 'PLAY AGAIN' : 'START'}</span></button>
      </div>
      <button class="cq-x" aria-label="Close">✕</button>
    </div>`;
  root.querySelector('.cq-screen').append(panel);
  const shut = () => panel.remove();
  panel.addEventListener('pointerdown', e => { if (e.target === panel) shut(); });
  panel.querySelector('.cq-x').onclick = shut;
  panel.querySelector('.cq-start').onclick = () => start(mission);
}

function start(mission) {
  lastMissionId = mission?.id ?? null;
  window.dispatchEvent(new CustomEvent('lr:start', { detail: { mission } }));
}

// ---------- Trophy Road (vooruitblik; echte PvP bestaat nog niet) ----------
// Drempels zijn voorbeelden uit het ontwerp, geen vastgestelde balans.
const ARENAS = [['Recruit Arena', 0], ['Legion Arena', 1000], ['Centurion Arena', 2000], ['Gladiator Arena', 4000], ['Imperial Arena', 6000]];
function showTrophy() {
  const road = ART['trophy-road'];
  show('trophy', `
    <div class="cq-bg" style="background-image:url(${art('menu-bg')})"></div>
    <div class="cq-road-scroll"><div class="cq-road" style="aspect-ratio:${road.width}/${road.height}">
      <img src="${art('trophy-road')}" alt="" draggable="false">
      ${ARENAS.map(([name, at], i) => `<div class="cq-arena ${i % 2 ? 'right' : 'left'}" style="top:${90 - i * 19.5}%">
        <img src="${art('arena-' + (i + 1))}" alt=""><span><b>${name}</b><small><img src="${art('trophy')}" alt=""> ${at.toLocaleString('en-US')}</small></span></div>`).join('')}
    </div></div>
    <aside class="cq-road-info">
      <h1>TROPHY ROAD</h1>
      <p class="cq-trophies"><img src="${art('trophy')}" alt=""><b>0</b><small>Trophies</small></p>
      <p>Win online battles to earn trophies, climb through five arenas and open reward chests along the way.</p>
      <div class="cq-chests">${['wood', 'silver', 'gold'].map(c => `<img src="${art('chest-' + c)}" alt="">`).join('')}</div>
      <button class="cq-start" disabled><img src="${art('result-button')}" alt=""><span>BATTLE</span></button>
      <p class="cq-note">Online battles are not available yet. This is a preview: arenas, trophy amounts and rewards can still change.</p>
    </aside>
    ${backButton('modes')}`, el => {
    const s = el.querySelector('.cq-road-scroll');
    requestAnimationFrame(() => { s.scrollTop = s.scrollHeight; });      // onderaan beginnen: daar start de weg
  });
}

// Opnieuw tekenen als de voortgang van de server binnenkomt terwijl een scherm open is (niet tijdens een missiepaneel).
function refresh() {
  if (root.querySelector('.cq-modal')) return;
  if (current === 'modes') showModes(); else if (current === 'conquest') showConquest();
}
// 'lr:session' komt bij elke profielwijziging; alleen ophalen als er een andere speler (of gast) is.
let syncedFor;
window.addEventListener('lr:session', () => {
  const who = account.signedIn ? account.session?.player?.id ?? 'signed-in' : null;
  if (who === syncedFor) return;
  syncedFor = who;
  syncWithServer();
});
window.addEventListener('lr:open', e => { if (['modes', 'conquest', 'trophy'].includes(e.detail)) go(e.detail); });
window.addEventListener('lr:battle', close);
export const conquestScreens = { isOpen: () => current !== null, close };
