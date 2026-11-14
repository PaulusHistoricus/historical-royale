import test from 'node:test';
import assert from 'node:assert/strict';
import { createHand, playFromHand, nextCard, HAND_SIZE } from '../src/sim/hand.js';

test('speler krijgt vier verschillende kaarten uit zeven', () => {
  const hand = createHand(7, () => 0.3);
  assert.equal(hand.slots.length, HAND_SIZE);
  assert.equal(new Set(hand.slots).size, HAND_SIZE);
  assert.deepEqual([...hand.slots, ...hand.drawPile].sort(), [0, 1, 2, 3, 4, 5, 6]);
});

test('na spelen wordt alleen het gespeelde vak met de volgende kaart gevuld', () => {
  const hand = createHand(7, () => 0.2);
  const initial = [...hand.slots], nextCard = hand.drawPile[0];
  const result = playFromHand(hand, 1);
  assert.equal(result.used, initial[1]);
  assert.equal(result.next, nextCard);
  assert.equal(hand.slots[1], nextCard);
  for (const slot of [0, 2, 3]) assert.equal(hand.slots[slot], initial[slot]);
});

test('alle zeven kaarten komen langs vóór reshuffle; geen lege vakken', () => {
  const hand = createHand(7, () => 0.42);
  const seen = new Set([...hand.slots]);
  for (let i = 0; i < 3; i++) {
    const result = playFromHand(hand, i);
    seen.add(result.next);
  }
  assert.equal(seen.size, 7);
  // de stapel is meteen opnieuw geschud uit de drie gespeelde kaarten
  assert.equal(hand.drawPile.length, 3);
  assert.equal(hand.discard.length, 0);
  const result = playFromHand(hand, 3);
  assert.ok(result.next >= 0 && result.next < 7);
  assert.equal(hand.slots.length, 4);
});

test('de volgende kaart is altijd bekend en komt als eerste in de hand', () => {
  const hand = createHand(7, () => 0.7);
  for (let i = 0; i < 30; i++) {
    const expected = nextCard(hand);
    assert.ok(Number.isInteger(expected), `beurt ${i}: volgende kaart bekend`);
    assert.equal(playFromHand(hand, i % 4).next, expected);
    assert.equal(new Set(hand.slots).size, 4, 'geen dubbele kaarten in de hand');
    assert.ok(!hand.slots.includes(nextCard(hand)), 'volgende kaart zit niet al in de hand');
  }
});

test('ongeldig vak verandert de hand niet', () => {
  const hand = createHand(7);
  const before = JSON.stringify([hand.slots, hand.drawPile, hand.discard]);
  assert.equal(playFromHand(hand, -1), null);
  assert.equal(playFromHand(hand, 4), null);
  assert.equal(JSON.stringify([hand.slots, hand.drawPile, hand.discard]), before);
});
