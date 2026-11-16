// The Conquest: missieregels in de simulatie, sterren, vrijspelen en de gegevens van Rise of Rome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, battleRules, deploy, step, mulberry32 } from '../src/sim/battle.js';
import { CARDS, MATCH_SECONDS, OVERTIME_AT, ENERGY_START, ENERGY_MAX, LANES, DEPLOY_ZONE } from '../src/sim/config.js';
import { CARD_TYPES } from '../src/progression.js';
import { ROME } from '../src/campaign/rome.js';
import { WORLDS, allMissions, missionById, requirement, isUnlocked, missionStatus, currentMission, totalStars,
  missionRules, enemyLevels, conditionMet, starsFor, withResult, sanitizeProgress, conditionText, GOAL_TEXT, arenaFor } from '../src/campaign/campaign.js';
import MAP from '../src/art/conquest.json' with { type: 'json' };
import ARENAS from '../src/art/arenas.json' with { type: 'json' };
import { TICK } from './helpers.js';

const idx = type => CARDS.findIndex(c => c.type === type);
const structure = (s, id) => s.structures.find(x => x.id === id);
const tick = (s, seconds) => { for (let t = 0; t < seconds && !s.ended; t += TICK) step(s, TICK); };

test('zonder regels is een gevecht precies het gewone gevecht', () => {
  const r = battleRules();
  assert.deepEqual(r, { timeLimit: MATCH_SECONDS, overtimeAt: OVERTIME_AT, goal: 'castle',
    energyStart: { blue: ENERGY_START, red: ENERGY_START }, energyRate: { blue: 1, red: 1 }, aiDeck: null, aiTempo: 1 });
  // zelfde seed met en zonder leeg regels-object: identiek verloop
  const a = createBattle({ seed: 7 }), b = createBattle({ seed: 7, rules: {} });
  tick(a, 40); tick(b, 40);
  assert.deepEqual(a.units.map(u => [u.card.type, u.lane, u.x, u.hp]), b.units.map(u => [u.card.type, u.lane, u.x, u.hp]));
  assert.ok(a.units.length > 0);
});

test('onbekend doel of onbekende kaart in het vijandelijke deck wordt geweigerd', () => {
  assert.throws(() => battleRules({ goal: 'capture' }), RangeError);
  assert.throws(() => battleRules({ aiDeck: ['dragon'] }), RangeError);
  assert.throws(() => battleRules({ aiDeck: [] }), RangeError);
});

test('de computer speelt alleen kaarten uit zijn missiedeck', () => {
  const s = createBattle({ seed: 3, rules: { aiDeck: ['archer', 'cavalry'] } });
  const seen = new Set();
  for (let t = 0; t < 90 && !s.ended; t += TICK) { step(s, TICK); for (const u of s.units) if (u.side === 'red') seen.add(u.card.type); }
  assert.deepEqual([...seen].sort(), ['archer', 'cavalry']);
});

test('aiTempo: een trage computer zet minder eenheden in dan een snelle', () => {
  const count = tempo => {
    const s = createBattle({ seed: 11, rules: { aiDeck: ['melee'], aiTempo: tempo } });
    let n = 0, last = 0;
    for (let t = 0; t < 60; t += TICK) { step(s, TICK); if (s.nextId > last) { n = s.nextId - 1; last = s.nextId; } }
    return n;
  };
  assert.ok(count(0.5) < count(1), 'tempo 0.5 moet minder inzetten dan tempo 1');
});

test('startenergie en energieaanvoer per kant', () => {
  const s = createBattle({ seed: 1, ai: false, rules: { energyStart: { red: 10 }, energyRate: { blue: 0.5 } } });
  assert.equal(s.energy.red, 10);
  assert.equal(s.energy.blue, ENERGY_START);
  s.energy.blue = 0; s.energy.red = 0;
  tick(s, 4);
  assert.ok(Math.abs(s.energy.blue * 2 - s.energy.red) < 0.01, 'blauw krijgt half zoveel energie');
  assert.equal(createBattle({ rules: { energyStart: { red: 99 } } }).energy.red, ENERGY_MAX);
});

test("doel 'towers': blauw wint zodra beide rode torens gevallen zijn", () => {
  const s = createBattle({ seed: 1, ai: false, rules: { goal: 'towers', timeLimit: 100 } });
  structure(s, 'tower-red-0').hp = 0;
  tick(s, 1);
  assert.equal(s.ended, false, 'één toren is niet genoeg');
  structure(s, 'tower-red-1').hp = 0;
  const events = step(s, TICK);
  assert.equal(s.winner, 'blue');
  assert.deepEqual(events.at(-1), { type: 'end', winner: 'blue' });
});

test("doel 'towers': tijd op zonder beide torens is verlies, ook met een betere stand", () => {
  const s = createBattle({ seed: 1, ai: false, rules: { goal: 'towers', timeLimit: 5 } });
  structure(s, 'tower-red-0').hp = 0;
  tick(s, 6);
  assert.equal(s.ended, true);
  assert.equal(s.winner, 'red');
});

test("doel 'survive': tijd uitzitten wint, kasteel kwijt verliest", () => {
  const a = createBattle({ seed: 1, ai: false, rules: { goal: 'survive', timeLimit: 5 } });
  structure(a, 'tower-blue-0').hp = 0; structure(a, 'tower-blue-1').hp = 0;   // slechtere stand, maar het kasteel staat
  tick(a, 6);
  assert.equal(a.winner, 'blue');
  assert.ok(Math.abs(a.time - 5) < 2 * TICK);
  const b = createBattle({ seed: 1, ai: false, rules: { goal: 'survive', timeLimit: 60 } });
  structure(b, 'castle-blue').hp = 0;
  tick(b, 1);
  assert.equal(b.winner, 'red');
});

test('tijdslimiet van een missie vervangt de vier minuten; overtime schuift mee', () => {
  const r = battleRules({ timeLimit: 120 });
  assert.equal(r.overtimeAt, 120 - (MATCH_SECONDS - OVERTIME_AT));
  const s = createBattle({ seed: 1, ai: false, rules: { timeLimit: 3 } });
  tick(s, 10);
  assert.ok(s.ended && s.time < 3.1);
});

test('ongeldige inzet kost ook met missieregels geen energie', () => {
  const s = createBattle({ seed: 1, ai: false, rules: missionRules(ROME.missions[0]) });
  const before = s.energy.blue;
  assert.equal(deploy(s, 'blue', 9, idx('melee'), 300), null);
  assert.equal(s.energy.blue, before);
  assert.equal(deploy(s, 'blue', 0, idx('melee'), 0).x, DEPLOY_ZONE.blue.min);
});

// ---------- gegevens van Rise of Rome ----------
test('Rise of Rome: 25 hoofdmissies + 2 bonusmissies met vaste, unieke id\'s', () => {
  const main = ROME.missions.filter(x => !x.bonus), bonus = ROME.missions.filter(x => x.bonus);
  assert.equal(main.length, 25);
  assert.equal(bonus.length, 2);
  main.forEach((x, i) => { assert.equal(x.id, 'rome_' + String(i + 1).padStart(3, '0')); assert.equal(x.n, i + 1); });
  assert.deepEqual(bonus.map(x => x.id), ['rome_bonus_01', 'rome_bonus_02']);
  assert.equal(new Set(allMissions().map(x => x.id)).size, allMissions().length);
  assert.equal(main.at(-1).boss, true);
  assert.equal(missionById('rome_025').title, 'The Dark Fortress');
  assert.equal(missionById('nope'), null);
});

test('elke missie is geldig: bestaande kaarten, speelbare regels, plek op de kaart', () => {
  const seg = MAP.map.segmentWidth;
  for (const x of allMissions()) {
    const rules = battleRules(missionRules(x));                       // gooit bij een onbekende kaart of doel
    assert.ok(x.enemy.deck.every(t => CARD_TYPES.includes(t)), x.id);
    assert.ok(new Set(x.enemy.deck).size === x.enemy.deck.length, `${x.id}: dubbele kaart`);
    assert.ok(x.enemy.level >= 1 && x.enemy.level <= 6, x.id);
    assert.ok(rules.timeLimit >= 60 && rules.timeLimit <= MATCH_SECONDS, x.id);
    assert.ok(rules.aiTempo >= 0.5 && rules.aiTempo <= 1.5 && rules.energyRate.red <= 1.25 && rules.energyRate.blue >= 0.75, x.id);
    assert.ok(rules.aiDeck.some(i => CARDS[i].cost <= ENERGY_START), `${x.id}: computer kan nooit iets betalen`);
    assert.equal(x.stars.length, 3, x.id);
    assert.equal(x.stars[0], 'win', x.id);
    assert.equal(new Set(x.stars).size, 3, `${x.id}: drie verschillende voorwaarden`);
    for (const c of x.stars) {
      assert.ok(conditionText(c), `${x.id}: ${c}`);
      if (c.startsWith('time:')) assert.ok(Number(c.slice(5)) < x.time && x.goal !== 'survive', `${x.id}: ${c} moet sneller zijn dan de limiet`);
    }
    assert.ok(GOAL_TEXT[x.goal](x).length > 10);
    assert.ok([1, 2, 3].includes(x.seg) && x.x >= 40 && x.x <= seg - 40 && x.y >= 120 && x.y <= MAP.map.height - 60, `${x.id}: buiten de kaart`);
    assert.ok(x.title && x.brief, x.id);
    assert.equal(Object.keys(enemyLevels(x)).length, CARDS.length);
  }
});

test('missies staan niet op elkaar en lopen van links naar rechts over de kaart', () => {
  const gx = x => (x.seg - 1) * MAP.map.segmentStep + x.x;
  const all = allMissions();
  for (const a of all) for (const b of all) {
    if (a === b) continue;
    assert.ok(Math.hypot(gx(a) - gx(b), a.y - b.y) >= 120, `${a.id} en ${b.id} staan te dicht op elkaar`);
  }
  const main = ROME.missions.filter(x => !x.bonus);
  for (let i = 1; i < main.length - 1; i++) assert.ok(gx(main[i]) > gx(main[i - 1]), main[i].id);
  assert.ok(gx(main.at(-1)) <= MAP.map.width - 40);
});

// ---------- vrijspelen en sterren ----------
test('vrijspelen: de volgende missie opent na één ster; bonusmissies via hun eigen voorwaarde', () => {
  const [m1, m2, m3] = ROME.missions;
  assert.equal(requirement(m1), null);
  assert.equal(requirement(m2), 'rome_001');
  assert.equal(missionStatus({}, m1), 'open');
  assert.equal(missionStatus({}, m2), 'locked');
  assert.equal(currentMission({}).id, 'rome_001');
  const p = withResult({}, 'rome_001', 2);
  assert.equal(missionStatus(p, m1), 'done');
  assert.equal(missionStatus(p, m2), 'open');
  assert.equal(isUnlocked(p, m3), false);
  assert.equal(currentMission(p).id, 'rome_002');
  const b1 = missionById('rome_bonus_01');
  assert.equal(requirement(b1), 'rome_005');
  assert.equal(isUnlocked(p, b1), false);
  assert.equal(isUnlocked({ rome_005: 1 }, b1), true);
  // een bonusmissie houdt het hoofdpad nooit tegen
  assert.equal(requirement(missionById('rome_006')), 'rome_005');
  const everything = Object.fromEntries(ROME.missions.map(x => [x.id, 3]));
  assert.equal(currentMission(everything), null);
  assert.equal(totalStars(everything), 27 * 3);
});

test('sterren gaan alleen omhoog en een verloren gevecht verandert niets', () => {
  let p = withResult({}, 'rome_001', 3);
  p = withResult(p, 'rome_001', 1);
  assert.equal(p.rome_001, 3);
  assert.deepEqual(withResult({}, 'rome_001', 0), {});
  assert.equal(withResult({}, 'rome_001', 9).rome_001, 3);
  assert.equal(totalStars({ rome_001: 3, rome_002: 2 }), 5);
});

test('opgeslagen voortgang wordt opgeschoond', () => {
  assert.deepEqual(sanitizeProgress({ rome_001: 2, rome_002: 7, rome_003: -1, rome_004: 'x', hacked: 3, rome_005: 1.9 }),
    { rome_001: 2, rome_002: 3, rome_005: 1 });
  assert.deepEqual(sanitizeProgress(null), {});
  assert.deepEqual(sanitizeProgress('[]'), {});
});

test('sterren uit de eindstand: winst, eigen torens, tijd en kasteel', () => {
  const mission = { stars: ['win', 'towers2', 'time:150'] };
  const end = (time, patch = {}) => {
    const s = createBattle({ seed: 1, ai: false });
    s.ended = true; s.winner = 'blue'; s.time = time;
    for (const [id, hp] of Object.entries(patch)) structure(s, id).hp = hp;
    return s;
  };
  assert.equal(starsFor(mission, end(100)), 3);
  assert.equal(starsFor(mission, end(151)), 2);
  assert.equal(starsFor(mission, end(100, { 'tower-blue-1': 0 })), 2);
  assert.equal(starsFor(mission, end(200, { 'tower-blue-0': 0 })), 1);
  const lost = end(100); lost.winner = 'red';
  assert.equal(starsFor(mission, lost), 0);
  const running = end(100); running.ended = false;
  assert.equal(starsFor(mission, running), 0);
  assert.equal(conditionMet('tower1', end(10, { 'tower-blue-0': 0 })), true);
  assert.equal(conditionMet('tower1', end(10, { 'tower-blue-0': 0, 'tower-blue-1': 0 })), false);
  assert.equal(conditionMet('castle:70', end(10, { 'castle-blue': 1700 })), true);
  assert.equal(conditionMet('castle:70', end(10, { 'castle-blue': 1600 })), false);
  assert.throws(() => conditionMet('magic', end(10)), RangeError);
});

// ---------- volledige missies ----------
test('alle 27 missies lopen tot een einde zonder vastlopers (willekeurige speler)', () => {
  for (const mission of allMissions()) {
    const s = createBattle({ seed: 42, rules: missionRules(mission), cardLevels: { blue: {}, red: enemyLevels(mission) } });
    const rng = mulberry32(99);
    let next = 1;
    for (let t = 0; t < mission.time + 5 && !s.ended; t += TICK) {
      if (s.time >= next) {
        next = s.time + 1 + rng() * 2;
        deploy(s, 'blue', Math.floor(rng() * LANES.length), Math.floor(rng() * 8), 300 + rng() * 150);
      }
      step(s, TICK);
      for (const u of s.units) assert.ok(Number.isFinite(u.x) && Number.isFinite(u.hp), mission.id);
    }
    assert.ok(s.ended, `${mission.id} eindigt niet`);
    assert.ok(s.time <= mission.time + 2 * TICK, `${mission.id} loopt over de tijd`);
    assert.ok(['blue', 'red'].includes(s.winner), mission.id);
    assert.ok(starsFor(mission, s) >= (s.winner === 'blue' ? 1 : 0));
  }
  assert.equal(WORLDS.length, 1);
});

test('elke missie speelt in een bestaande arena; elk gebied heeft er een', () => {
  const known = new Set(['arena', ...Object.keys(ARENAS)]);
  assert.equal(ROME.arenas.length, ROME.regions.length);
  for (const x of allMissions()) assert.ok(known.has(arenaFor(x)), `${x.id}: onbekende arena ${arenaFor(x)}`);
  assert.equal(arenaFor(missionById('rome_001')), 'arena');
  assert.equal(arenaFor(missionById('rome_012')), 'arena-sunset');
  assert.equal(arenaFor(missionById('rome_025')), 'arena-rome');
  assert.equal(arenaFor({ ...missionById('rome_001'), arena: 'arena-rome' }), 'arena-rome');
  for (const a of Object.values(ARENAS)) assert.deepEqual(a, { width: 1920, height: 620 }, 'zelfde maat als arena.jpg');
});
