// Kaartenrotatie voor de speler, zonder Phaser of DOM.
// Iedere kaart verschijnt eenmaal per geschudde cyclus; een gespeelde kaart
// komt pas terug zodra de resterende kaarten zijn getrokken.
export const HAND_SIZE = 4;

function shuffle(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createHand(cards, rng = Math.random, size = HAND_SIZE) {
  // cards: aantal kaarten (0..n-1) of een lijst kaartindexen (het deck).
  const pool = Array.isArray(cards) ? [...cards] : Array.from({ length: cards }, (_, i) => i);
  if (!pool.every(Number.isInteger) || pool.length < size || size < 1) {
    throw new RangeError('Hand requires at least as many cards as slots');
  }
  const deck = shuffle(pool, rng);
  return { slots: deck.splice(0, size), drawPile: deck, discard: [], rng };
}

// Speelt de kaart in het gekozen vak en vult dat vak met de bovenste kaart van
// de trekstapel. Raakt de trekstapel daardoor leeg, dan wordt de aflegstapel
// (inclusief de net gespeelde kaart) meteen geschud, zodat `nextCard` altijd
// een kaart kan tonen.
export function playFromHand(hand, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= hand.slots.length) return null;
  const used = hand.slots[slot];
  hand.discard.push(used);
  const next = hand.drawPile.shift();
  hand.slots[slot] = next;
  if (hand.drawPile.length === 0) {
    hand.drawPile = shuffle(hand.discard, hand.rng);
    hand.discard = [];
  }
  return { used, next };
}

/** De kaart die na de volgende gespeelde kaart in de hand komt. */
export function nextCard(hand) {
  return hand.drawPile[0];
}
