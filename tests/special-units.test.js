import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../src/sim/config.js';
import { createBattle, addUnit, deploy, step, chooseTarget } from '../src/sim/battle.js';

const idx = type => CARDS.findIndex(c => c.type === type);
const run = (state, seconds) => {
  const events = [];
  for (let i = 0; i < seconds * 60; i++) events.push(...step(state, 1 / 60));
  return events;
};

test('All cards have English names and an explicit role/material', () => {
  assert.equal(CARDS.length, 12);
  for (const card of CARDS) {
    assert.ok(['melee', 'ranged', 'siege', 'special'].includes(card.role), card.name);
    assert.ok(['bio', 'mechanical'].includes(card.material), card.name);
  }
});

test('P-51 strafe removes 50–75% of full HP and exactly 10% of first lane tower', () => {
  const s = createBattle({ ai: false, seed: 27 });
  const victim = addUnit(s, 'red', 0, idx('melee'), 520);
  const laneTower = s.structures.find(t => t.kind === 'tower' && t.side === 'red' && t.lane === 0);
  const otherTower = s.structures.find(t => t.kind === 'tower' && t.side === 'red' && t.lane === 1);
  const redCastle = s.structures.find(t => t.kind === 'castle' && t.side === 'red');
  const strike = deploy(s, 'blue', 0, idx('p51'), 400);
  assert.ok(strike);
  const events = run(s, 2);
  const hits = events.filter(e => e.type === 'hit' && e.kind === 'p51');
  const unitHit = hits.find(e => e.targetId === victim.id);
  const towerHit = hits.find(e => e.targetId === laneTower.id);
  assert.ok(unitHit);
  assert.ok(unitHit.damage >= victim.max * 0.5 && unitHit.damage <= victim.max * 0.75);
  assert.equal(towerHit.damage, laneTower.max * 0.1);
  assert.equal(otherTower.hp, otherTower.max);
  assert.equal(redCastle.hp, redCastle.max);
  assert.equal(s.airstrikes.length, 0);
});

test('Healer heals biological allies but not mechanical units', () => {
  const s = createBattle({ ai: false });
  const healer = addUnit(s, 'blue', 0, idx('healer'), 400);
  const bio = addUnit(s, 'blue', 0, idx('melee'), 408);
  const cannon = addUnit(s, 'blue', 0, idx('cannon'), 410);
  bio.hp = 100; cannon.hp = 100;
  const events = step(s, 1 / 60);
  assert.ok(events.some(e => e.type === 'heal' && e.attackerId === healer.id && e.targetId === bio.id));
  assert.ok(bio.hp > 100);
  assert.equal(cannon.hp, 100);
});

test('Spy converts an eligible biological unit after 2 seconds and disappears', () => {
  const s = createBattle({ ai: false });
  const spy = addUnit(s, 'blue', 0, idx('spy'), 490);
  const foe = addUnit(s, 'red', 0, idx('melee'), 507);
  spy.hp = 500; spy.max = 500;
  const events = run(s, 2.15);
  assert.equal(foe.side, 'blue');
  assert.ok(events.some(e => e.type === 'possess' && e.targetId === foe.id));
  assert.ok(!s.units.includes(spy));
});

test('Hidden samurai cannot be targeted before first attack', () => {
  const s = createBattle({ ai: false });
  const samurai = addUnit(s, 'blue', 0, idx('samurai'), 390);
  const foe = addUnit(s, 'red', 0, idx('melee'), 460);
  assert.equal(chooseTarget(s, foe).kind, 'tower');
  const events = run(s, 2);
  assert.ok(events.some(e => e.type === 'hit' && e.attackerId === samurai.id));
  assert.equal(samurai.hidden, false);
});

test('Fire thrower applies damage-over-time to nearby enemies', () => {
  const s = createBattle({ ai: false });
  const fire = addUnit(s, 'blue', 0, idx('firethrower'), 450);
  const foe = addUnit(s, 'red', 0, idx('melee'), 490);
  const adjacent = addUnit(s, 'red', 0, idx('archer'), 495);
  const events = step(s, 1 / 60);
  assert.ok(events.some(e => e.type === 'hit' && e.attackerId === fire.id));
  assert.ok(foe.burnRemaining > 0);
  assert.ok(adjacent.burnRemaining > 0);
});
