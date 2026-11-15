// Gedeelde regels voor niveaus en kaartniveaus. Moet gelijk blijven aan public/api/_game.php
// (tests/progression.test.js controleert dat).
export const MAX_LEVEL = 50;
export const MAX_CARD_LEVEL = 6;
export const DECK_SIZE = 8;
export const CARD_TYPES = ['melee', 'archer', 'cannon', 'cavalry', 'berserker', 'horse_archer', 'musket',
  'healer', 'samurai', 'spy', 'firethrower', 'p51', 'spartan', 'plague', 'banner', 'flamegi', 'lancer', 'assassin'];
export const DEFAULT_DECK = ['melee', 'archer', 'cannon', 'cavalry', 'berserker', 'horse_archer', 'musket', 'healer'];
export const UPGRADE_COST = { 2: [4, 50], 3: [10, 150], 4: [20, 400], 5: [40, 1000], 6: [80, 2500] };
export const AVATAR_KEYS = Array.from({ length: 20 }, (_, i) => 'a' + String(i + 1).padStart(2, '0'));

export const xpForNext = level => 100 + 50 * (level - 1);
export function levelInfo(xp) {
  let level = 1, rest = xp;
  while (level < MAX_LEVEL && rest >= xpForNext(level)) { rest -= xpForNext(level); level++; }
  return { level, xpInLevel: rest, xpForNext: level >= MAX_LEVEL ? 0 : xpForNext(level) };
}
/** Kracht per kaartniveau: +10% levenspunten en schade per niveau boven 1. */
export const cardLevelMultiplier = level => 1 + 0.1 * (Math.max(1, level) - 1);
