// Gevechten en botsingen — de acceptatiecriteria uit GitHub issue #1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gap, inRange, step } from '../src/sim/battle.js';
import { CARDS } from '../src/sim/config.js';
import { arena, place, run, hitsBy, hitsOn, TICK, LEGIONAIR, BOOGSCHUTTER, KANON, BLUE_TOWER, RED_TOWER } from './helpers.js';

const tower = (s, side, lane) => s.structures.find(x => x.id === `tower-${side}-${lane}`);

test('frontaal: twee legionairs stoppen, kijken elkaar aan en delen schade uit', () => {
  const s = arena();
  const blue = place(s, 'blue', 1, LEGIONAIR, 400);
  const red = place(s, 'red', 1, LEGIONAIR, 600);
  const log = run(s, 4);

  assert.equal(blue.state, 'attack');
  assert.equal(red.state, 'attack');
  assert.equal(blue.facing, 1);
  assert.equal(red.facing, -1);
  assert.ok(inRange(blue, red) && inRange(red, blue));
  assert.ok(gap(blue, red) >= 0, 'lichamen lopen niet door elkaar heen');
  assert.ok(blue.hp < blue.max && red.hp < red.max, 'beide verliezen HP');
  assert.ok(hitsBy(log, blue).length >= 2 && hitsBy(log, red).length >= 2);
  assert.ok(log.hits.every(h => h.kind === 'melee'), 'zwaardslagen worden als melee-event gemeld');
});

test('frontaal: het gevecht eindigt en dode eenheden verdwijnen', () => {
  const s = arena();
  const blue = place(s, 'blue', 1, LEGIONAIR, 400);
  const red = place(s, 'red', 1, LEGIONAIR, 600);
  red.hp = 100; // rood begint gewond, dus blauw wint
  const log = run(s, 4.5);

  assert.ok(!s.units.includes(red), 'verslagen legionair is verwijderd');
  assert.ok(s.units.includes(blue));
  assert.deepEqual(log.deaths.map(d => d.id), [red.id]);
  assert.equal(blue.state, 'move', 'winnaar marcheert weer verder');
});

test('gelijke legionairs slaan gelijktijdig: uitkomst hangt niet af van de volgorde in de lijst', () => {
  const s = arena();
  const red = place(s, 'red', 0, LEGIONAIR, 600);
  const blue = place(s, 'blue', 0, LEGIONAIR, 400);
  run(s, 3, () => assert.equal(blue.hp, red.hp));
});

test('verschillende decoratieve hoogte (y) verhindert het gevecht niet', () => {
  const s = arena();
  const a = place(s, 'blue', 1, LEGIONAIR, 400);
  const b = place(s, 'red', 1, LEGIONAIR, 600);
  a.y -= 30; b.y += 30;
  const log = run(s, 5);
  assert.ok(hitsBy(log, a).length && hitsBy(log, b).length);
});

test('rug-aan-rug: legionairs die elkaar al gepasseerd zijn draaien om en vechten', () => {
  const s = arena();
  const blue = place(s, 'blue', 1, LEGIONAIR, 520); // blauw kijkt naar rechts
  const red = place(s, 'red', 1, LEGIONAIR, 470);   // rood staat achter hem en kijkt naar links
  const log = run(s, 3);
  assert.equal(blue.facing, -1, 'blauw heeft zich omgedraaid');
  assert.equal(red.facing, 1, 'rood heeft zich omgedraaid');
  assert.ok(hitsBy(log, blue).length && hitsBy(log, red).length);
});

test('eenheden op exact dezelfde plek vechten gewoon (geen deling door nul, geen vastloper)', () => {
  const s = arena();
  const blue = place(s, 'blue', 0, LEGIONAIR, 500);
  const red = place(s, 'red', 0, LEGIONAIR, 500);
  const log = run(s, 2);
  assert.ok(hitsBy(log, blue).length && hitsBy(log, red).length);
});

test('1 tegen 2: beide rode legionairs slaan, blauw sneuvelt, rood marcheert door', () => {
  const s = arena();
  const blue = place(s, 'blue', 1, LEGIONAIR, 400);
  const red1 = place(s, 'red', 1, LEGIONAIR, 600);
  const red2 = place(s, 'red', 1, LEGIONAIR, 650);
  const log = run(s, 7);

  assert.ok(hitsBy(log, red1).length >= 2, 'voorste rode legionair slaat');
  assert.ok(hitsBy(log, red2).length >= 2, 'achterste rode legionair slaat óók');
  assert.ok(hitsBy(log, blue).length >= 2, 'blauw slaat terug');
  assert.ok(!s.units.includes(blue), 'blauw verliest 1 tegen 2');
  assert.equal(s.units.length, 2);
  assert.ok(s.units.every(u => u.state === 'move' || u.targetId === 'tower-blue-1'), 'rood gaat verder naar de toren');
});

test('drie of meer eenheden op een kluitje lopen niet vast', () => {
  const s = arena();
  const units = [
    place(s, 'blue', 1, LEGIONAIR, 400), place(s, 'blue', 1, LEGIONAIR, 402), place(s, 'blue', 1, LEGIONAIR, 404),
    place(s, 'red', 1, LEGIONAIR, 600), place(s, 'red', 1, LEGIONAIR, 601),
  ];
  const log = run(s, 20);
  for (const u of units) assert.ok(hitsBy(log, u).length > 0, `eenheid ${u.id} heeft gevochten`);
  assert.ok(s.units.every(u => u.side === 'blue'), 'drie verslaan twee');
  assert.equal(log.deaths.filter(d => d.side === 'red').length, 2);
});

test('gemengde kluwen (legionairs, boogschutters, kanon) wordt altijd uitgevochten', () => {
  const s = arena();
  for (const [side, card, x] of [
    ['blue', LEGIONAIR, 430], ['blue', BOOGSCHUTTER, 380], ['blue', KANON, 330], ['blue', LEGIONAIR, 300],
    ['red', LEGIONAIR, 560], ['red', LEGIONAIR, 600], ['red', BOOGSCHUTTER, 640], ['red', KANON, 700],
  ]) place(s, side, 0, card, x);
  run(s, 60);
  const sides = new Set(s.units.map(u => u.side));
  assert.ok(sides.size <= 1, 'na een minuut staat er nog maar één partij in deze baan');
});

test('torenverdediging: legionair keert om voor een vijand achter hem die de toren aanvalt', () => {
  const s = arena();
  const raider = place(s, 'red', 1, LEGIONAIR, BLUE_TOWER + 50);
  run(s, 1);
  assert.equal(raider.targetId, 'tower-blue-1', 'rood staat de blauwe toren te slopen');

  const defender = place(s, 'blue', 1, LEGIONAIR, BLUE_TOWER + 230); // vijand in de rug
  const log = run(s, 8);
  assert.ok(hitsBy(log, defender).some(h => h.targetId === raider.id), 'verdediger valt de aanvaller aan');
  assert.ok(hitsOn(log, raider).some(h => h.kind === 'tower'), 'toren schiet zelf ook');
  assert.ok(!s.units.includes(raider), 'aanvaller is verslagen');
  assert.equal(defender.facing, 1, 'verdediger marcheert daarna weer vooruit');
});

test('torenverdediging: aanvaller draait zich om naar de verdediger die hem in de rug aanvalt', () => {
  const s = arena();
  const raider = place(s, 'red', 0, LEGIONAIR, BLUE_TOWER + 50);
  const defender = place(s, 'blue', 0, LEGIONAIR, BLUE_TOWER + 150);
  const log = run(s, 4);
  assert.ok(hitsBy(log, raider).some(h => h.targetId === defender.id));
  assert.equal(raider.facing, 1);
});

test('legionair sloopt een toren en loopt daarna door naar het kasteel', () => {
  const s = arena();
  const t = tower(s, 'red', 0);
  t.hp = 60;
  const blue = place(s, 'blue', 0, LEGIONAIR, RED_TOWER - 40);
  blue.hp = blue.max = 5000; // overleeft het torenvuur in deze test
  const log = run(s, 6);
  assert.equal(t.hp, 0);
  assert.ok(log.events.some(e => e.type === 'destroyed' && e.id === 'tower-red-0'));
  assert.equal(blue.targetId, 'castle-red');
});

test('boogschutter blijft op afstand en beschadigt een naderende legionair', () => {
  const s = arena();
  const archer = place(s, 'blue', 0, BOOGSCHUTTER, 300);
  const legionair = place(s, 'red', 0, LEGIONAIR, 620);
  let firstShotGap = null;
  const log = run(s, 3, (_s, events) => {
    if (firstShotGap === null && events.some(e => e.type === 'hit' && e.attackerId === archer.id)) firstShotGap = gap(archer, legionair);
  });
  assert.ok(firstShotGap > CARDS[LEGIONAIR].range, 'eerste pijl valt vóór de legionair kan slaan');
  assert.ok(hitsBy(log, archer).every(h => h.kind === 'archer'));
  assert.ok(legionair.hp < legionair.max);
});

test('legionair haalt een boogschutter in en verslaat hem', () => {
  const s = arena();
  const legionair = place(s, 'blue', 0, LEGIONAIR, 300);
  const archer = place(s, 'red', 0, BOOGSCHUTTER, 560);
  const log = run(s, 15);
  assert.ok(hitsBy(log, legionair).some(h => h.targetId === archer.id));
  assert.ok(!s.units.includes(archer));
});

test('boogschutters onderling en kanon tegen legionair: afstandsgevechten werken', () => {
  const s = arena();
  const a = place(s, 'blue', 0, BOOGSCHUTTER, 300);
  const b = place(s, 'red', 0, BOOGSCHUTTER, 600);
  const cannon = place(s, 'blue', 1, KANON, 300);
  const target = place(s, 'red', 1, LEGIONAIR, 600);
  const log = run(s, 6);
  assert.ok(hitsBy(log, a).length && hitsBy(log, b).length);
  assert.ok(gap(a, b) > 50, 'boogschutters houden afstand');
  const shots = hitsBy(log, cannon);
  assert.ok(shots.length >= 1 && shots.every(h => h.kind === 'cannon' && h.damage === CARDS[KANON].damage));
  assert.ok(target.hp < target.max);
});

test('aanvalssnelheid klopt: een legionair slaat één keer per 0,9 s', () => {
  const s = arena();
  const blue = place(s, 'blue', 0, LEGIONAIR, 500);
  const dummy = place(s, 'red', 0, KANON, 500 + 13 + 22 + 5);
  dummy.hp = dummy.max = 100000;
  const log = run(s, 9.05);
  assert.equal(hitsBy(log, blue).length, 11); // t=0 en daarna elke 0,9 s
  assert.equal(Math.round(dummy.max - dummy.hp), Math.round(11 * CARDS[LEGIONAIR].damage * 0.75)); // melee tegen mechanical
});

test('eenheden in verschillende banen negeren elkaar', () => {
  const s = arena();
  const top = place(s, 'blue', 0, LEGIONAIR, 500);
  const bottom = place(s, 'red', 1, LEGIONAIR, 500);
  const log = run(s, 2);
  assert.equal(hitsBy(log, top).length + hitsBy(log, bottom).length, 0);
  assert.equal(top.targetId, 'tower-red-0');
  assert.equal(bottom.targetId, 'tower-blue-1');
});

test('na afloop van de wedstrijd verandert er niets meer', () => {
  const s = arena();
  s.structures.find(x => x.id === 'castle-red').hp = 1;
  s.structures.find(x => x.id === 'tower-red-0').hp = 0;
  const blue = place(s, 'blue', 0, LEGIONAIR, 850);
  blue.hp = blue.max = 5000;
  run(s, 3);
  assert.equal(s.ended, true);
  assert.equal(s.winner, 'blue');
  const snapshot = JSON.stringify(s.units);
  assert.deepEqual(step(s, TICK), []);
  assert.equal(JSON.stringify(s.units), snapshot);
});
