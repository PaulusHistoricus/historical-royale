// Schademodel: aanvalstype x pantserklasse (DAMAGE_TABLE in src/sim/config.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, DAMAGE_TABLE, ARMOR_CLASSES, STRUCTURES } from '../src/sim/config.js';
import { damageFactor, step } from '../src/sim/battle.js';
import { arena, place, TICK } from './helpers.js';

const idx = t => CARDS.findIndex(c => c.type === t);
const struck = (s, id) => s.structures.find(x => x.id === id);

test('elke kaart heeft een bekende pantserklasse en een bekend aanvalstype; de tabel is compleet', () => {
  for (const c of CARDS) {
    assert.ok(ARMOR_CLASSES.includes(c.armor) && c.armor !== 'building', `${c.type}: armor`);
    assert.ok(DAMAGE_TABLE[c.attack], `${c.type}: attack`);
    if (c.material === 'mechanical') assert.equal(c.armor, 'mechanical', c.type);
  }
  for (const [attack, row] of Object.entries(DAMAGE_TABLE)) {
    assert.deepEqual(Object.keys(row).sort(), [...ARMOR_CLASSES].sort(), attack);
    for (const v of Object.values(row)) assert.ok(v >= 0 && v <= 2, attack);
  }
});

test('factor per combinatie: schutters sterk tegen light, zwak tegen heavy; kanon sloopt gebouwen', () => {
  const s = arena();
  const archer = place(s, 'blue', 0, idx('archer'), 300), spartan = place(s, 'red', 0, idx('spartan'), 600);
  const assassin = place(s, 'red', 0, idx('assassin'), 620), cannon = place(s, 'blue', 0, idx('cannon'), 280);
  assert.equal(damageFactor(archer, assassin), 1.25);
  assert.equal(damageFactor(archer, spartan), 0.7);
  assert.equal(damageFactor(cannon, struck(s, 'tower-red-0')), 2);
  assert.equal(damageFactor(archer, struck(s, 'tower-red-0')), 0.6);
  assert.equal(damageFactor(struck(s, 'tower-red-0'), spartan), 0.7, 'torens schieten pierce');
  assert.equal(damageFactor(struck(s, 'tower-red-0'), cannon), 0.5);
});

test('de factor wordt echt toegepast op een treffer', () => {
  const s = arena();
  const archer = place(s, 'blue', 0, idx('archer'), 480);
  const dummy = place(s, 'red', 0, idx('spartan'), 480 + 13 + 17 + 100);
  dummy.hp = dummy.max = 100000;
  dummy.card = { ...dummy.card, damage: 0, speed: 0 };
  for (let t = 0; t < 0.5; t += TICK) step(s, TICK);
  assert.ok(Math.abs((dummy.max - dummy.hp) - CARDS[idx('archer')].damage * 0.7) < 1e-6, `${dummy.max - dummy.hp}`);
});

test('vlammen doen weinig tegen gebouwen (fire x building = 0,4), kanon dubbel', () => {
  for (const [type, factor] of [['flamegi', 0.4], ['cannon', 2], ['melee', 1], ['archer', 0.6]]) {
    const s = arena();
    const tower = struck(s, 'tower-red-0');
    const u = place(s, 'blue', 0, idx(type), tower.x - 200);
    let hit = null;
    for (let t = 0; t < 20 && !hit; t += TICK) hit = step(s, TICK).find(e => e.type === 'hit' && e.attackerId === u.id && e.targetId === tower.id);
    assert.ok(hit, type);
    assert.ok(Math.abs(hit.damage - CARDS[idx(type)].damage * factor) < 1e-6, `${type}: ${hit.damage}`);
  }
});
