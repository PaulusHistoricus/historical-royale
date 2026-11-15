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

test('Spy converts an eligible biological unit after the channel time and disappears', () => {
  const s = createBattle({ ai: false });
  const spy = addUnit(s, 'blue', 0, idx('spy'), 490);
  const foe = addUnit(s, 'red', 0, idx('melee'), 507);
  spy.hp = 500; spy.max = 500;
  const events = run(s, spy.card.channelTime + 0.15);
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

test('Samurai cloaks again after it stops fighting, and the next ambush gets the bonus again', () => {
  const s = createBattle({ ai: false });
  const samurai = addUnit(s, 'blue', 0, idx('samurai'), 390);
  const foe = addUnit(s, 'red', 0, idx('archer'), 440);
  foe.hp = 40;                              // eerste hinderlaag doodt hem direct
  let events = run(s, 0.5);
  const first = events.find(e => e.type === 'hit' && e.attackerId === samurai.id);
  assert.equal(first.damage, 40);
  assert.equal(samurai.hidden, false, 'zichtbaar na de aanval');
  // even niet vechten -> weer in de schaduw
  events = run(s, samurai.card.recloakTime + 0.2);
  assert.ok(events.some(e => e.type === 'cloak' && e.id === samurai.id));
  assert.equal(samurai.hidden, true);
  // volgende vijand: weer hinderlaagbonus
  const next = addUnit(s, 'red', 0, idx('melee'), samurai.x + 40);
  next.hp = next.max = 5000;
  events = run(s, 1);
  const ambush = events.find(e => e.type === 'hit' && e.attackerId === samurai.id && e.targetId === next.id);
  assert.equal(ambush.damage, Math.round(samurai.card.damage * samurai.card.stealthBonus));
});

test('Samurai stays visible while it keeps fighting', () => {
  const s = createBattle({ ai: false });
  const samurai = addUnit(s, 'blue', 0, idx('samurai'), 390);
  const foe = addUnit(s, 'red', 0, idx('melee'), 430);
  foe.hp = foe.max = 5000;
  run(s, 0.5);
  for (let i = 0; i < 6 * 60; i++) { step(s, 1 / 60); assert.equal(samurai.hidden, false); }
});

test('P-51 hits every enemy unit in its lane, also units walking towards it', () => {
  let missed = 0;
  for (let k = 0; k < 40; k++) {
    const s = createBattle({ ai: false, seed: k });
    const units = [];
    for (let i = 0; i < 5; i++) {
      const u = addUnit(s, 'red', 0, idx(i % 2 ? 'cavalry' : 'melee'), 330 + i * 80 + k * 1.3);
      u.hp = u.max = 99999; units.push(u);
    }
    s.energy.blue = 10; deploy(s, 'blue', 0, idx('p51'), 400);
    const hit = new Set(run(s, 2.5).filter(e => e.kind === 'p51').map(e => e.targetId));
    missed += units.filter(u => !hit.has(u.id)).length;
  }
  assert.equal(missed, 0);
});

test('Charmed unit is frozen while the spy channels', () => {
  const s = createBattle({ ai: false });
  const spy = addUnit(s, 'blue', 0, idx('spy'), 470);
  const foe = addUnit(s, 'red', 0, idx('melee'), 500);
  spy.hp = spy.max = 5000;
  run(s, 0.3);
  assert.equal(foe.charmedBy, spy.id);
  const x = foe.x;
  const events = run(s, spy.card.channelTime - 0.6);
  assert.equal(foe.state, 'charmed');
  assert.equal(foe.x, x, 'staat stil');
  assert.ok(!events.some(e => e.type === 'hit' && e.attackerId === foe.id), 'valt niet aan');
});

test('Killing the spy in time rescues the charmed unit', () => {
  const s = createBattle({ ai: false });
  const spy = addUnit(s, 'blue', 0, idx('spy'), 470);
  const foe = addUnit(s, 'red', 0, idx('melee'), 500);
  run(s, 0.5);
  assert.equal(foe.state, 'charmed');
  spy.hp = 0;                                   // gered: een bondgenoot doodt de spion
  run(s, 0.5);
  assert.equal(foe.side, 'red');
  assert.equal(foe.charmedBy ?? null, null);
  assert.notEqual(foe.state, 'charmed');
});

test('Healer only heals own units and turns towards the ally she heals', () => {
  const s = createBattle({ ai: false });
  const healer = addUnit(s, 'red', 0, idx('healer'), 600);
  const enemy = addUnit(s, 'blue', 0, idx('melee'), 560); enemy.hp = enemy.max = 99999; enemy.hp = 5000;
  const ally = addUnit(s, 'red', 0, idx('melee'), 660); ally.hp = 100;
  const heals = run(s, 3).filter(e => e.type === 'heal');
  assert.ok(heals.length >= 1);
  assert.ok(heals.every(e => e.targetId === ally.id));
});
