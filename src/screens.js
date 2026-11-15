// Profiel, decks & kaarten, vrienden en het beloningsscherm na een gevecht (DOM-overlays boven Phaser).
// Openen: window.dispatchEvent(new CustomEvent('lr:open', { detail: 'profile' | 'deck' | 'friends' })).
import './screens.css';
import { account } from './account.js';
import { CARDS } from './sim/config.js';
import CARD_ART from './art/cards.json';
import { CARD_TYPES, DECK_SIZE, MAX_CARD_LEVEL, UPGRADE_COST, AVATAR_KEYS } from './progression.js';
import { BUILD } from './version.js';

const BASE = import.meta.env.BASE_URL;
const avatarUrl = key => `${BASE}assets/avatars/${key}.webp?v=${BUILD}`;
const cardOf = type => CARDS.find(c => c.type === type);
const NAMES = { melee: 'Legionary', archer: 'Archer', cannon: 'Cannon', cavalry: 'Cavalry', berserker: 'Berserker',
  horse_archer: 'Horse Archer', musket: 'Musketeer', healer: 'Priestess', samurai: 'Samurai', spy: 'Spy',
  firethrower: 'Fire Thrower', p51: 'P-51 Mustang' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const root = document.createElement('div');
root.id = 'lr-screens';
document.body.append(root);
// Phaser luistert op window ook naar tikken búíten het canvas. Zonder dit tikt een knop in
// deze schermen 'door' naar het spel eronder (bv. Menu -> meteen de Spelen-knop).
export function shieldFromGame(el) {
  for (const t of ['touchstart', 'touchend', 'touchcancel', 'mousedown', 'mouseup'])
    el.addEventListener(t, e => e.stopPropagation());
}
shieldFromGame(root);

/** Kaartplaatje uit cards.png (zelfde sprite als de kaartenbalk). */
function cardImg(type, h = 120) {
  const art = CARD_ART.cards[type], k = h / CARD_ART.frameHeight;
  const w = Math.round(CARD_ART.frameWidth * k);
  return `<span class="lr-card-img" style="width:${Math.round(art.width * k)}px;height:${h}px">
    <span style="width:${w}px;height:${h}px;margin-left:${-Math.round((w - art.width * k) / 2)}px;
      background:url(${BASE}assets/art/cards.png?v=${BUILD}) ${-art.frame * w}px 0 / ${w * Object.keys(CARD_ART.cards).length}px ${h}px"></span></span>`;
}

let current = null;
let openedAt = 0;
function open(name, html, onMount) {
  current = name; openedAt = performance.now();
  root.innerHTML = `<div class="lr-screen" data-screen="${name}" role="dialog" aria-modal="true">
    <div class="lr-sheet">${html}<button class="lr-close" aria-label="Close">✕</button></div></div>`;
  root.querySelector('.lr-close').onclick = close;
  // Naast het paneel tikken sluit, behalve bij de uitslag (daar tik je vaak nog door van het gevecht).
  if (name !== 'result') root.querySelector('.lr-screen').addEventListener('pointerdown', e => { if (e.target.classList.contains('lr-screen')) close(); });
  onMount?.(root.querySelector('.lr-sheet'));
}
function close() { current = null; root.innerHTML = ''; window.dispatchEvent(new Event('lr:screen-closed')); }
function toast(msg, ms = 2600) {
  const t = document.createElement('div'); t.className = 'lr-toast'; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.classList.add('out'), ms); setTimeout(() => t.remove(), ms + 500);
}
function signInFirst() {
  open('signin', `<h2>Sign in first</h2><p class="lr-muted">Sign in to save your level, cards, achievements and friends.</p>
    <button class="lr-btn gold" id="lr-go-signin">Sign in</button>`, el => {
    el.querySelector('#lr-go-signin').onclick = () => { close(); document.getElementById('lr-profile-button')?.click(); };
  });
}
const busy = async (button, fn) => {
  button.disabled = true;
  try { await fn(); } catch (e) { toast(e.message); } finally { button.disabled = false; }
};

// ---------- Profiel ----------
async function showProfile(tab = 'stats') {
  if (!account.signedIn) return signInFirst();
  open('profile', `<p class="lr-loading">Loading…</p>`);
  let p;
  try { p = await account.loadProfile(); } catch (e) { open('profile', `<p class="lr-error">${esc(e.message)}</p>`); return; }
  const pl = p.player, s = p.stats;
  const xpPct = pl.xpForNext ? Math.round(100 * pl.xpInLevel / pl.xpForNext) : 100;
  const unlocked = p.achievements.filter(a => a.unlocked).length;
  open('profile', `
    <header class="lr-prof-head">
      <button class="lr-avatar-big" id="lr-pick-avatar" title="Change avatar">
        ${pl.avatarKey ? `<img src="${avatarUrl(pl.avatarKey)}" alt="">` : pl.avatar ? `<img src="${esc(pl.avatar)}" alt="">` : '<span>?</span>'}
        <i>✎</i></button>
      <div class="lr-prof-id">
        <div class="lr-name-row"><h2 id="lr-name">${esc(pl.name)}</h2><button class="lr-icon-btn" id="lr-edit-name" title="Change name">✎</button></div>
        <div class="lr-level"><b>Level ${pl.level}</b><span class="lr-xpbar"><i style="width:${xpPct}%"></i></span>
          <small>${pl.xpForNext ? `${pl.xpInLevel} / ${pl.xpForNext} XP` : 'Max level'}</small></div>
        <div class="lr-muted">🪙 ${pl.coins} coins · Friend code <b class="lr-code">${esc(p.friendCode)}</b></div>
      </div>
    </header>
    <nav class="lr-tabs">
      <button data-tab="stats">Stats</button><button data-tab="achievements">Achievements ${unlocked}/${p.achievements.length}</button><button data-tab="account">Account</button>
    </nav>
    <section data-panel="stats" class="lr-stats">
      ${[['Battles', s.matches_played], ['Wins', s.wins], ['Losses', s.losses],
         ['Win rate', s.matches_played ? Math.round(100 * s.wins / s.matches_played) + '%' : '–'],
         ['Towers destroyed', s.towers_destroyed], ['Units deployed', s.units_deployed],
         ['Win streak', s.current_streak], ['Best streak', s.best_streak]]
        .map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}
    </section>
    <section data-panel="achievements" class="lr-ach">
      ${p.achievements.map(a => `<div class="${a.unlocked ? 'done' : ''}"><span class="lr-ach-icon">${a.unlocked ? '🏆' : '🔒'}</span>
        <div><b>${esc(a.title)}</b><small>${esc(a.description)}</small>
        ${a.unlocked ? '' : `<span class="lr-xpbar small"><i style="width:${Math.round(100 * a.progress / a.target)}%"></i></span><small>${a.progress} / ${a.target}</small>`}</div></div>`).join('')}
    </section>
    <section data-panel="account" class="lr-account">
      <label>Email address</label>
      <p class="lr-muted">${p.email ? esc(p.email) : 'No email address linked yet.'}${p.google ? ' · Google linked' : ''}</p>
      <form id="lr-email-change"><input type="email" required maxlength="254" placeholder="New email address" autocomplete="email">
        <button class="lr-btn gold">Send confirmation link</button></form>
      <p class="lr-muted small">We send a link to the new address. Your address changes after you open that link.</p>
      <div class="lr-account-actions"><button class="lr-btn" id="lr-signout">Sign out</button>
        <button class="lr-btn danger" id="lr-delete">Delete account</button></div>
    </section>`, el => {
    const setTab = t => {
      el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
      el.querySelectorAll('[data-panel]').forEach(x => x.hidden = x.dataset.panel !== t);
    };
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
    setTab(tab);
    el.querySelector('#lr-pick-avatar').onclick = () => showAvatarPicker(pl.avatarKey);
    el.querySelector('#lr-edit-name').onclick = () => {
      const row = el.querySelector('.lr-name-row');
      row.innerHTML = `<form class="lr-inline"><input maxlength="20" value="${esc(pl.name)}" aria-label="Name"><button class="lr-btn gold">Save</button></form>`;
      const input = row.querySelector('input'); input.focus(); input.select();
      row.querySelector('form').onsubmit = ev => { ev.preventDefault();
        busy(row.querySelector('button'), async () => { await account.api('POST', 'profile-update.php', { name: input.value }); showProfile('stats'); toast('Name changed'); }); };
    };
    el.querySelector('#lr-email-change').onsubmit = ev => { ev.preventDefault();
      const f = ev.target;
      busy(f.querySelector('button'), async () => { const r = await account.api('POST', 'email-change-request.php', { email: f.querySelector('input').value }); toast(r.message, 5000); f.reset(); }); };
    el.querySelector('#lr-signout').onclick = async () => { await window.lrSignOut?.(); close(); };
    el.querySelector('#lr-delete').onclick = () => {
      if (!confirm('Delete your account, level, cards and friends permanently? This cannot be undone.')) return;
      busy(el.querySelector('#lr-delete'), async () => { await account.api('POST', 'delete-account.php', {}); location.reload(); });
    };
  });
}

function showAvatarPicker(currentKey) {
  open('avatars', `<h2>Choose your avatar</h2><div class="lr-avatar-grid">
    ${AVATAR_KEYS.map(k => `<button data-k="${k}" class="${k === currentKey ? 'on' : ''}"><img src="${avatarUrl(k)}" alt=""></button>`).join('')}</div>`, el => {
    el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => busy(b, async () => {
      await account.api('POST', 'profile-update.php', { avatarKey: b.dataset.k }); showProfile('stats');
    }));
  });
}

// ---------- Deck & kaarten ----------
async function showDeck() {
  if (account.signedIn) { try { await account.loadProfile(); } catch (e) { toast(e.message); } }
  let deck = [...account.deckTypes()];
  let selected = null;              // gekozen positie in het deck
  const render = () => {
    const cards = account.profile?.cards ?? Object.fromEntries(CARD_TYPES.map(t => [t, { level: 1, fragments: 0 }]));
    const coins = account.session?.player?.coins ?? 0;
    const cardTile = (type, where, i) => {
      const c = cards[type], next = c.level + 1, cost = UPGRADE_COST[next];
      const frag = cost ? `<span class="lr-frag"><i style="width:${Math.min(100, 100 * c.fragments / cost[0])}%"></i><em>${c.fragments}/${cost[0]}</em></span>` : '<span class="lr-frag max"><em>MAX</em></span>';
      const can = account.signedIn && cost && c.fragments >= cost[0] && coins >= cost[1];
      return `<div class="lr-tile ${where === 'deck' && selected === i ? 'sel' : ''} ${where === 'pool' && selected !== null ? 'pick' : ''}"
        data-where="${where}" data-i="${i}" data-type="${type}">
        ${cardImg(type, 112)}<span class="lr-lvl">Lv ${c.level}</span><span class="lr-cost">${cardOf(type).cost}</span>
        <b>${NAMES[type]}</b>${frag}
        ${where === 'pool' || where === 'deck' ? (cost ? `<button class="lr-up ${can ? '' : 'off'}" data-up="${type}" title="Upgrade">▲ ${cost[1]} 🪙</button>` : '') : ''}
      </div>`;
    };
    const pool = CARD_TYPES.filter(t => !deck.includes(t));
    open('deck', `
      <h2>Your deck</h2>
      <p class="lr-muted">${selected === null ? `Tap a card in your deck to swap it. ${DECK_SIZE} cards: 4 in your hand, 4 waiting.` : 'Now tap a card below to put it in your deck.'}
        ${account.signedIn ? ` · 🪙 ${coins}` : ' · <b>Sign in</b> to collect fragments and upgrade cards.'}</p>
      <div class="lr-deck">${deck.map((t, i) => cardTile(t, 'deck', i)).join('')}</div>
      <h3>Collection</h3>
      <div class="lr-pool">${pool.map((t, i) => cardTile(t, 'pool', i)).join('')}</div>
      <p class="lr-muted small">Every level adds +10% health and damage. Win battles to earn fragments and coins.</p>`, el => {
      el.querySelectorAll('.lr-tile').forEach(tile => tile.addEventListener('click', ev => {
        if (ev.target.closest('[data-up]')) return;
        const where = tile.dataset.where, i = +tile.dataset.i;
        if (where === 'deck') { selected = selected === i ? null : i; render(); return; }
        if (selected === null) { toast('First tap the card in your deck you want to replace'); return; }
        deck[selected] = tile.dataset.type; selected = null;
        account.saveDeck([...deck]).catch(e => toast(e.message));
        render();
      }));
      el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
        if (!account.signedIn) return signInFirst();
        if (b.classList.contains('off')) { toast('Not enough fragments or coins yet'); return; }
        busy(b, async () => {
          const r = await account.api('POST', 'card-upgrade.php', { card: b.dataset.up });
          account.profile.cards = r.cards;
          toast(`${NAMES[b.dataset.up]} upgraded to level ${r.cards[b.dataset.up].level}!`);
          for (const a of r.achievements ?? []) toast(`🏆 ${a.title}`, 3500);
          render();
        });
      });
    });
  };
  render();
}

// ---------- Vrienden ----------
let friendsCache = null;
async function showFriends() {
  if (!account.signedIn) return signInFirst();
  open('friends', `<p class="lr-loading">Loading…</p>`);
  const render = f => {
    friendsCache = f;
    window.dispatchEvent(new CustomEvent('lr:friends', { detail: f }));
    const row = (x, actions) => `<div class="lr-friend">
      <span class="lr-fav">${x.avatarKey ? `<img src="${avatarUrl(x.avatarKey)}" alt="">` : x.avatar ? `<img src="${esc(x.avatar)}" alt="">` : ''}<i class="${x.online ? 'on' : ''}"></i></span>
      <div><b>${esc(x.name)}</b><small>Level ${x.level} · ${x.online ? 'Online' : 'Offline'}</small></div>${actions(x)}</div>`;
    open('friends', `
      <h2>Friends</h2>
      <div class="lr-mycode">Your friend code <b class="lr-code" id="lr-mycode">${esc(f.friendCode)}</b><button class="lr-icon-btn" id="lr-copy" title="Copy">⧉</button></div>
      <form id="lr-add" class="lr-inline"><input maxlength="8" placeholder="Friend code" autocapitalize="characters" aria-label="Friend code"><button class="lr-btn gold">Add friend</button></form>
      ${f.incoming.length ? `<h3>Requests</h3>${f.incoming.map(x => row(x, x => `<span class="lr-acts"><button class="lr-btn gold" data-acc="${x.id}">Accept</button><button class="lr-btn" data-del="${x.id}">Decline</button></span>`)).join('')}` : ''}
      <h3>Friends (${f.friends.length})</h3>
      ${f.friends.length ? f.friends.map(x => row(x, x => `<span class="lr-acts"><button class="lr-btn" disabled title="Online battles are coming soon">⚔ Challenge</button><button class="lr-icon-btn" data-del="${x.id}" title="Remove">✕</button></span>`)).join('')
        : '<p class="lr-muted">No friends yet. Share your friend code!</p>'}
      ${f.outgoing.length ? `<h3>Sent</h3>${f.outgoing.map(x => row(x, x => `<span class="lr-acts"><small class="lr-muted">Waiting…</small><button class="lr-icon-btn" data-del="${x.id}" title="Cancel">✕</button></span>`)).join('')}` : ''}
      <p class="lr-muted small">Challenging friends to a live battle comes with online PvP.</p>`, el => {
      el.querySelector('#lr-copy').onclick = () => navigator.clipboard?.writeText(f.friendCode).then(() => toast('Friend code copied'));
      el.querySelector('#lr-add').onsubmit = ev => { ev.preventDefault();
        const input = ev.target.querySelector('input');
        busy(ev.target.querySelector('button'), async () => { render(await account.api('POST', 'friend-request.php', { code: input.value })); toast('Request sent'); }); };
      el.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => busy(b, async () => render(await account.api('POST', 'friend-respond.php', { id: b.dataset.acc, accept: true }))));
      el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => busy(b, async () => render(await account.api('POST', 'friend-respond.php', { id: b.dataset.del, accept: false }))));
    });
  };
  try { render(await account.api('GET', 'friends.php')); } catch (e) { open('friends', `<p class="lr-error">${esc(e.message)}</p>`); }
}

/** Heartbeat + verzoekenteller (voor het belletje in het menu). */
async function pollFriends() {
  if (!account.signedIn) return;
  try {
    const f = await account.api('GET', 'friends.php');
    friendsCache = f;
    window.dispatchEvent(new CustomEvent('lr:friends', { detail: f }));
    if (current === 'friends') { /* lijst open: niet storen tijdens typen */ }
  } catch {}
}
setInterval(pollFriends, 60000);
window.addEventListener('lr:session', () => {
  if (!account.signedIn) { account.profile = null; return; }
  if (!account.profile) account.loadProfile().catch(() => {});   // kaartniveaus en deck voor het volgende gevecht
  if (!friendsCache) pollFriends();
});

// ---------- Beloningen na een gevecht ----------
const artUrl = name => `${BASE}assets/art/${name}.webp?v=${BUILD}`;
// Beloningskaart: ons kaartportret in de goudlijst uit result-card.webp.
function rewardCard(type, text) {
  return `<div class="lr-rcard"><span class="lr-rcard-art">${cardImg(type, 150)}</span>
    <img src="${artUrl('result-card')}" alt=""><b>${esc(NAMES[type])}</b><i>${text}</i></div>`;
}
function showResult({ winner, reward, error, guest }) {
  const win = winner === 'blue';
  const frags = Object.entries(reward?.fragments ?? {});
  open('result', `
    <div class="lr-banner ${win ? 'win' : 'loss'}">${win ? `<img src="${artUrl('result-banner-victory')}" alt="Victory">`
      : `<img src="${artUrl('result-banner-blank')}" alt=""><span>DEFEAT</span>`}</div>
    ${reward ? `
      ${frags.length ? `<div class="lr-ribbon"><img src="${artUrl('result-ribbon')}" alt="Battle rewards"></div>
        <div class="lr-rcards">${frags.map(([t, n]) => rewardCard(t, `+${n}`)).join('')}</div>` : ''}
      <div class="lr-coinbox"><img src="${artUrl('result-coins')}" alt="">
        <div><small>COINS</small><b>+${reward.coinsGained}</b><small>+${reward.xpGained} XP</small></div></div>
      <div class="lr-level"><b>Level ${reward.level}</b><span class="lr-xpbar"><i style="width:${reward.xpForNext ? Math.round(100 * reward.xpInLevel / reward.xpForNext) : 100}%"></i></span>
        <small>${reward.xpForNext ? `${reward.xpInLevel} / ${reward.xpForNext} XP` : 'Max level'}</small></div>
      ${reward.level > reward.levelBefore ? `<p class="lr-levelup">⭐ Level up! You reached level ${reward.level} (+${100 * (reward.level - reward.levelBefore)} 🪙)</p>` : ''}
      ${(reward.achievements ?? []).map(a => `<p class="lr-ach-new">🏆 <b>${esc(a.title)}</b> — ${esc(a.description)}</p>`).join('')}`
    : `<p class="lr-muted lr-noreward">${guest ? 'Sign in to earn XP, coins and card fragments.' : esc(error || 'No rewards for this battle.')}</p>`}
    <div class="lr-result-actions">
      <button class="lr-bigbtn" id="lr-again"><img src="${artUrl('result-button')}" alt=""><span>${win ? 'Play again' : 'Try again'}</span></button>
      <button class="lr-bigbtn small" id="lr-menu"><img src="${artUrl('result-button')}" alt=""><span>Menu</span></button></div>`, el => {
    el.querySelector('.lr-close').remove();
    // Eerste halve seconde negeren: een tik die nog voor het gevecht bedoeld was, telt niet.
    const go = ev => () => { if (performance.now() - openedAt < 600) return; close(); window.dispatchEvent(new Event(ev)); };
    el.querySelector('#lr-again').onclick = go('lr:again');
    el.querySelector('#lr-menu').onclick = go('lr:to-menu');
  });
  root.querySelector('.lr-screen').style.setProperty('--result-bg', `url(${artUrl('result-bg')})`);
}

// ---------- E-mail-wijzigingslink (#email_change_token=...) ----------
const frag = new URLSearchParams(location.hash.slice(1));
const changeToken = frag.get('email_change_token');
if (changeToken) {
  history.replaceState(null, '', location.pathname + location.search);
  const confirmChange = async () => {
    try { const r = await account.api('POST', 'email-change-confirm.php', { token: changeToken }); toast(`Email changed to ${r.email}`, 5000); }
    catch (e) { toast(e.message, 5000); }
  };
  if (window.lrSession) confirmChange(); else window.addEventListener('lr:session', confirmChange, { once: true });
}

window.addEventListener('lr:open', e => ({ profile: () => showProfile(), achievements: () => showProfile('achievements'),
  deck: showDeck, friends: showFriends })[e.detail]?.());
window.addEventListener('lr:result', e => showResult(e.detail));
window.addEventListener('lr:battle', () => { if (current && current !== 'result') close(); });
export const screens = { toast, isOpen: () => current !== null };
