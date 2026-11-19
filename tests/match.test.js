// Kaarten spelen, balansinvarianten en volledige wedstrijden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, deploy, mulberry32 } from '../src/sim/battle.js';
import { CARDS, STRUCTURES, DEPLOY_ZONE, DETECTION_RANGE, MATCH_SECONDS, LANES } from '../src/sim/config.js';
import { arena, run, LEGIONAIR, KANON } from './helpers.js';

test('kaart spelen kost energie en mislukt bij te weinig energie', () => {
  const s = arena();
  assert.ok(deploy(s, 'blue', 0, KANON, 300));
  assert.equal(s.energy.blue, 0);
  assert.equal(deploy(s, 'blue', 0, LEGIONAIR, 300), null);
  assert.equal(s.units.length, 1);
});

test('plaatsing wordt binnen de eigen zone gehouden en ongeldige invoer geweigerd', () => {
  const s = arena();
  assert.equal(deploy(s, 'blue', 1, LEGIONAIR, 900).x, DEPLOY_ZONE.blue.max);
  assert.equal(deploy(s, 'red', 1, LEGIONAIR, 0).x, DEPLOY_ZONE.red.min);
  assert.equal(deploy(s, 'red', 5, LEGIONAIR, 600), null);
  assert.equal(deploy(s, 'red', 0, 99, 600), null);
});

test('balansinvarianten die vastlopers en onbeantwoorde aanvallen uitsluiten', () => {
  for (const card of CARDS) {
    if (card.type === 'p51') { assert.ok(card.duration > 0 && card.towerDamagePct === 0.1); continue; }
    if (card.type === 'barrage') { assert.ok(card.delay > 0 && card.shells > 0); continue; }
    if (card.static) { assert.ok(card.lifetime > 0 && card.speed === 0); continue; }   // veldhospitaal staat stil
    assert.ok(card.range >= 0 && card.speed > 0 && card.rate > 0 && card.radius > 0, card.name);
    assert.ok(card.range + 2 * card.radius < DETECTION_RANGE, `${card.name}: bereik moet binnen detectiebereik vallen`);
    for (const def of Object.values(STRUCTURES)) {
      assert.ok(def.range >= card.range, `${card.name} mag een gebouw niet ongestraft kunnen beschieten`);
    }
  }
});

function playMatch(seed) {
  const s = createBattle({ seed, ai: true });
  const rng = mulberry32(seed * 7919 + 1);
  let next = 1;
  const log = run(s, MATCH_SECONDS + 5, state => {
    if (state.time < next) return;
    next = state.time + 1.5 + rng() * 3;
    const affordable = CARDS.map((_, i) => i).filter(i => CARDS[i].cost <= state.energy.blue);
    if (affordable.length) {
      deploy(state, 'blue', Math.floor(rng() * LANES.length), affordable[Math.floor(rng() * affordable.length)], DEPLOY_ZONE.blue.min + rng() * (DEPLOY_ZONE.blue.max - DEPLOY_ZONE.blue.min));
    }
  });
  return { s, log };
}

test('25 volledige wedstrijden met willekeurige spelers: nooit een vastloper, altijd een winnaar', () => {
  const kinds = new Set();
  for (let seed = 1; seed <= 25; seed++) {
    const { s, log } = playMatch(seed); // run() controleert elke tick de stilstand-invariant
    assert.equal(s.ended, true, `wedstrijd ${seed} eindigt`);
    assert.ok(['blue', 'red'].includes(s.winner));
    assert.ok(s.time <= MATCH_SECONDS + 0.1);
    for (const h of log.hits) kinds.add(h.kind);
    assert.ok(log.deaths.length > 0);
  }
  for (const kind of ['melee', 'archer', 'cannon', 'tower', 'castle']) assert.ok(kinds.has(kind), `${kind} heeft aangevallen`);
});

test('de simulatie is deterministisch: zelfde seed, zelfde wedstrijd', () => {
  const a = playMatch(42), b = playMatch(42);
  assert.equal(a.s.winner, b.s.winner);
  assert.equal(a.log.hits.length, b.log.hits.length);
  assert.deepEqual(a.s.structures.map(x => x.hp), b.s.structures.map(x => x.hp));
});
