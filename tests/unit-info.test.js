// Elke kaart heeft een soort (Bio / Mechanical, eventueel Special) en een korte vaardigheidstekst.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../src/sim/config.js';
import { ABILITY, unitKinds, combatLine, ARMOR_NAME, ATTACK_NAME, ATTACK_HINT } from '../src/unit-info.js';

test('elke kaart heeft een soort en een vaardigheid', () => {
  for (const c of CARDS) {
    const kinds = unitKinds(c.type);
    assert.ok(['Bio', 'Mechanical'].includes(kinds[0]), c.type);
    assert.equal(kinds.includes('Special'), c.role === 'special', c.type);
    assert.ok(ABILITY[c.type]?.length > 10 && ABILITY[c.type].length <= 80, `${c.type}: vaardigheid ontbreekt of is te lang`);
    assert.ok(!/["<>]/.test(ABILITY[c.type]), `${c.type}: geen aanhalingstekens of HTML in de tekst`);
  }
  assert.deepEqual(Object.keys(ABILITY).sort(), CARDS.map(c => c.type).sort());
  assert.deepEqual(unitKinds('p51'), ['Mechanical', 'Special']);
  assert.deepEqual(unitKinds('cannon'), ['Mechanical']);
  assert.deepEqual(unitKinds('healer'), ['Bio', 'Special']);
});

test('elke pantserklasse en elk aanvalstype heeft een naam in het spel', () => {
  for (const c of CARDS) { assert.ok(ARMOR_NAME[c.armor], c.type); assert.ok(ATTACK_NAME[c.attack] && ATTACK_HINT[c.attack], c.type); }
  assert.equal(combatLine('spartan'), 'Heavy armor · Melee');
  assert.equal(combatLine('cannon'), 'Mechanical · Siege');
});
