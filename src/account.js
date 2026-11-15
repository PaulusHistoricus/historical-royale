// Brug tussen het spel en de accountserver (public/api). Gasten krijgen lokale standaardwaarden.
import { CARDS } from './sim/config.js';
import { DEFAULT_DECK, DECK_SIZE, CARD_TYPES } from './progression.js';

const typeIndex = type => CARDS.findIndex(c => c.type === type);
const LOCAL_DECK = 'lr-deck';

export const account = {
  profile: null,                       // volledig profiel (alleen ingelogd)
  get session() { return window.lrSession ?? null; },
  get signedIn() { return !!window.lrSession?.authenticated; },

  async api(method, endpoint, body) {
    const res = await fetch('/api/' + endpoint, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.session?.csrfToken ?? '' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    if (data.player && this.session) { this.session.player = data.player; window.dispatchEvent(new Event('lr:player')); }
    return data;
  },

  async loadProfile() {
    if (!this.signedIn) { this.profile = null; return null; }
    this.profile = await this.api('GET', 'profile.php');
    if (this.profile.csrfToken && this.session) this.session.csrfToken = this.profile.csrfToken;
    return this.profile;
  },

  /** Deck als kaarttypes. */
  deckTypes() {
    if (this.profile?.deck) return this.profile.deck;
    try {
      const d = JSON.parse(localStorage.getItem(LOCAL_DECK));
      if (Array.isArray(d) && d.length === DECK_SIZE && new Set(d).size === DECK_SIZE && d.every(t => CARD_TYPES.includes(t))) return d;
    } catch {}
    return DEFAULT_DECK;
  },
  deckIndices() { return this.deckTypes().map(typeIndex); },
  async saveDeck(deck) {
    try { localStorage.setItem(LOCAL_DECK, JSON.stringify(deck)); } catch {}
    if (this.signedIn) { await this.api('POST', 'deck-save.php', { deck }); this.profile.deck = deck; }
  },
  /** { type: niveau } */
  cardLevels() {
    const out = {};
    for (const t of CARD_TYPES) out[t] = this.profile?.cards?.[t]?.level ?? 1;
    return out;
  },
};
window.lrAccount = account;   // handig in de console
