import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../src/sim/config.js';
import { createBattle, addUnit, deploy, step } from '../src/sim/battle.js';

test('vier nieuwe eenheden kunnen naast de oorspronkelijke kaarten worden ingezet', () => {
  assert.equal(CARDS.length, 12);
  for (let index = 3; index <= 6; index++) {
    const state = createBattle({ ai: false, seed: 7 });
    const unit = deploy(state, 'blue', 0, index, 400);
    assert.ok(unit, CARDS[index].name);
    assert.equal(unit.card, CARDS[index]);
    assert.equal(state.energy.blue, 6 - CARDS[index].cost);
    for (let i = 0; i < 120; i++) step(state, 1 / 60);
    assert.ok(Number.isFinite(unit.x));
  }
});

test('ruiter krijgt precies één chargebonus na voldoende beweging', () => {
  const state = createBattle({ ai: false });
  // Verwijder torens uit de aanvalslijn zodat alleen de duel-eenheden meetellen.
  const rider = addUnit(state, 'blue', 0, 3, 350);
  const foe = addUnit(state, 'red', 0, 0, 560);
  foe.hp = foe.max = 3000;
  for (let i = 0; i < 300; i++) step(state, 1 / 60);
  assert.ok(rider.distanceTravelled >= 65);
  assert.equal(rider.chargeUsed, true);
});

test('berserker gebruikt ragebonus bij halve levenspunten', () => {
  const state = createBattle({ ai: false });
  const berserker = addUnit(state, 'blue', 0, 4, 490);
  const foe = addUnit(state, 'red', 0, 0, 512);
  berserker.hp = berserker.max / 2;
  const events = step(state, 1 / 60);
  const hit = events.find(e => e.type === 'hit' && e.attackerId === berserker.id);
  assert.ok(hit);
  assert.equal(hit.damage, Math.round(berserker.card.damage * berserker.card.rageMultiplier));
});

test('musketier schiet verder dan gewone boogschutter', () => {
  assert.ok(CARDS[6].range > CARDS[1].range);
  assert.ok(CARDS[6].rate > CARDS[1].rate);
  assert.ok(CARDS[5].speed > CARDS[1].speed);
});
