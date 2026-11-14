// Doelwitselectie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTarget, objectiveFor, step } from '../src/sim/battle.js';
import { DETECTION_RANGE } from '../src/sim/config.js';
import { arena, place, run, TICK, LEGIONAIR, BOOGSCHUTTER, BLUE_TOWER, BLUE_CASTLE } from './helpers.js';

test('zonder vijanden in de buurt is het doelwit de toren van de eigen baan', () => {
  const s = arena();
  assert.equal(chooseTarget(s, place(s, 'blue', 0, LEGIONAIR, 300)).id, 'tower-red-0');
  assert.equal(chooseTarget(s, place(s, 'blue', 1, LEGIONAIR, 300)).id, 'tower-red-1');
  assert.equal(chooseTarget(s, place(s, 'red', 1, LEGIONAIR, 600)).id, 'tower-blue-1');
});

test('is de toren gesloopt, dan is het kasteel het doelwit', () => {
  const s = arena();
  s.structures.find(x => x.id === 'tower-red-0').hp = 0;
  const u = place(s, 'blue', 0, LEGIONAIR, 300);
  assert.equal(objectiveFor(s, u).id, 'castle-red');
});

test('vijandelijke eenheid binnen detectiebereik gaat vóór een gebouw', () => {
  const s = arena();
  const u = place(s, 'blue', 0, LEGIONAIR, 300);
  const near = place(s, 'red', 0, LEGIONAIR, 300 + DETECTION_RANGE - 1);
  assert.equal(chooseTarget(s, u), near);
});

test('vijand vóór de eenheid maar buiten detectiebereik wordt nog niet gekozen', () => {
  const s = arena();
  const u = place(s, 'blue', 0, LEGIONAIR, 300);
  place(s, 'red', 0, LEGIONAIR, 300 + DETECTION_RANGE + 1);
  assert.equal(chooseTarget(s, u).id, 'tower-red-0');
});

test('vijand áchter de eenheid wordt altijd gekozen, hoe ver ook', () => {
  const s = arena();
  const blue = place(s, 'blue', 0, LEGIONAIR, 445);
  const behindBlue = place(s, 'red', 0, LEGIONAIR, 190);
  assert.equal(chooseTarget(s, blue), behindBlue);

  const red = place(s, 'red', 1, LEGIONAIR, 540);
  const behindRed = place(s, 'blue', 1, BOOGSCHUTTER, 790);
  assert.equal(chooseTarget(s, red), behindRed);
});

test('de dichtstbijzijnde vijand wordt gekozen, ook als die achter staat', () => {
  const s = arena();
  const u = place(s, 'blue', 0, LEGIONAIR, 400);
  place(s, 'red', 0, LEGIONAIR, 500);
  const closeBehind = place(s, 'red', 0, LEGIONAIR, 340);
  assert.equal(chooseTarget(s, u), closeBehind);
});

test('een eenheid maakt het gevecht af waarin hij staat (doelwit blijft vast binnen bereik)', () => {
  const s = arena();
  const u = place(s, 'blue', 0, LEGIONAIR, 400);
  const first = place(s, 'red', 0, LEGIONAIR, 436);
  first.hp = first.max = 5000;
  step(s, TICK);
  assert.equal(u.targetId, first.id);
  const closer = place(s, 'red', 0, BOOGSCHUTTER, 410);
  step(s, TICK);
  assert.equal(u.targetId, first.id, 'wisselt niet midden in het gevecht');
  first.hp = 0;
  s.units = s.units.filter(x => x.hp > 0);
  step(s, TICK);
  assert.equal(u.targetId, closer.id, 'kiest daarna de volgende vijand');
});

test('een doelwit buiten bereik wordt losgelaten voor een vijand die dichterbij komt', () => {
  const s = arena();
  const u = place(s, 'blue', 0, LEGIONAIR, 300);
  const far = place(s, 'red', 0, BOOGSCHUTTER, 480);
  step(s, TICK);
  assert.equal(u.targetId, far.id);
  const near = place(s, 'red', 0, LEGIONAIR, 360);
  step(s, TICK);
  assert.equal(u.targetId, near.id);
});

test('bij het kasteel vechten doorgebroken eenheden uit beide banen met elkaar', () => {
  const s = arena();
  for (const id of ['tower-red-0', 'tower-blue-1']) s.structures.find(x => x.id === id).hp = 0;
  const attacker = place(s, 'blue', 0, LEGIONAIR, 800); // door baan 0 gebroken
  const flanker = place(s, 'red', 1, LEGIONAIR, 830);   // door baan 1 gebroken
  assert.equal(chooseTarget(s, attacker), flanker);
  assert.equal(chooseTarget(s, flanker), attacker);

  const holdout = place(s, 'red', 0, LEGIONAIR, 700);   // zelfde baan: altijd bereikbaar
  assert.equal(chooseTarget(s, holdout), attacker);
});

test('torens schieten op de dichtstbijzijnde vijand in hun eigen baan; het kasteel in elke baan', () => {
  const s = arena();
  const near = place(s, 'red', 0, LEGIONAIR, BLUE_TOWER + 45);
  const far = place(s, 'red', 0, LEGIONAIR, BLUE_TOWER + 105);
  const otherLane = place(s, 'red', 1, LEGIONAIR, BLUE_TOWER + 45);
  near.hp = far.hp = otherLane.hp = 100000;
  let log = run(s, 0.5);
  assert.deepEqual([...new Set(log.hits.filter(h => h.attackerId === 'tower-blue-0').map(h => h.targetId))], [near.id]);
  assert.ok(log.hits.some(h => h.attackerId === 'tower-blue-1' && h.targetId === otherLane.id));

  const t = arena();
  t.structures.find(x => x.id === 'tower-blue-1').hp = 0;
  const siege = place(t, 'red', 1, LEGIONAIR, BLUE_CASTLE + 80);
  siege.hp = 100000;
  log = run(t, 3);
  assert.ok(log.hits.some(h => h.attackerId === 'castle-blue' && h.targetId === siege.id));
  assert.ok(log.hits.some(h => h.attackerId === siege.id && h.targetId === 'castle-blue'));
});
