// Gevechtssimulatie van Historical Royale — puur JavaScript, geen Phaser.
//
// De renderer (src/main.js) roept alleen `createBattle`, `deploy` en `step`
// aan en tekent daarna `state`. Alles wat het verloop van een gevecht bepaalt
// staat in dit bestand en wordt getest in tests/.
//
// Eén tick (`step`) verloopt in vaste fasen:
//   1. BESLISSEN  – elke eenheid kiest een doelwit en dan óf aanvallen óf lopen
//   2. BEWEGEN    – alle bewegingen tegelijk toepassen
//   3. SCHADE     – alle klappen tegelijk toepassen (volgorde-onafhankelijk)
//   4. OPRUIMEN   – doden verwijderen, winnaar bepalen
//
// Toestanden van een eenheid (`unit.state`):
//   'move'   – doelwit buiten bereik, loopt ernaartoe
//   'attack' – doelwit binnen bereik, staat stil en slaat/schiet op cooldown
//   'idle'   – geen doelwit (komt alleen voor als de wedstrijd voorbij is)

import {
  CARDS, STRUCTURES, STRUCTURE_POSITIONS, LANES, DEPLOY_ZONE, DETECTION_RANGE,
  MATCH_SECONDS, OVERTIME_AT, ENERGY_START, ENERGY_MAX, ENERGY_SECONDS,
  ENERGY_SECONDS_OVERTIME, AI,
} from './config.js';

const EPS = 1e-6;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const other = side => (side === 'blue' ? 'red' : 'blue');

/** Kleine deterministische RNG zodat tests en replays reproduceerbaar zijn. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBattle({ seed = Date.now(), ai = true } = {}) {
  const state = {
    time: 0,
    ended: false,
    winner: null,
    energy: { blue: ENERGY_START, red: ENERGY_START },
    units: [],
    structures: [],
    events: [],
    nextId: 1,
    rng: mulberry32(seed),
    ai: { enabled: ai, clock: AI.firstMove },
  };
  for (const side of ['blue', 'red']) {
    const pos = STRUCTURE_POSITIONS[side];
    LANES.forEach((y, lane) => state.structures.push(makeStructure('tower', side, lane, pos.towerX, y)));
    state.structures.push(makeStructure('castle', side, -1, pos.castleX, STRUCTURE_POSITIONS.castleY));
  }
  return state;
}

function makeStructure(kind, side, lane, x, y) {
  const def = STRUCTURES[kind];
  return {
    id: `${kind}-${side}${lane >= 0 ? '-' + lane : ''}`,
    kind, side, lane, x, y,
    hp: def.hp, max: def.hp, radius: def.radius, cd: 0,
  };
}

/** Plaatst een eenheid zonder energie af te schrijven (ook handig in tests). */
export function addUnit(state, side, lane, cardIndex, x) {
  const card = CARDS[cardIndex];
  const id = state.nextId++;
  const unit = {
    id, side, lane, x,
    y: LANES[lane] + ((id - 1) % 3 - 1) * 10, // alleen decoratief, telt niet mee in gevechten
    hp: card.hp, max: card.hp, radius: card.radius, card,
    cd: 0, state: 'move', targetId: null,
    distanceTravelled: 0, chargeUsed: false,
    facing: side === 'blue' ? 1 : -1,
  };
  state.units.push(unit);
  return unit;
}

/** Speelt een kaart: controleert energie en plaatsingszone. Geeft de eenheid of null. */
export function deploy(state, side, lane, cardIndex, x) {
  const card = CARDS[cardIndex];
  if (state.ended || !card || !(lane in LANES)) return null;
  if (state.energy[side] + 0.001 < card.cost) return null;
  state.energy[side] -= card.cost;
  const zone = DEPLOY_ZONE[side];
  return addUnit(state, side, lane, cardIndex, clamp(x, zone.min, zone.max));
}

/** Afstand van rand tot rand langs de baan. Negatief = lichamen overlappen. */
export function gap(a, b) {
  return Math.abs(a.x - b.x) - a.radius - b.radius;
}

export function inRange(attacker, target) {
  const range = attacker.card ? attacker.card.range : STRUCTURES[attacker.kind].range;
  return gap(attacker, target) <= range + EPS;
}

export function findById(state, id) {
  return state.units.find(u => u.id === id) ?? state.structures.find(s => s.id === id) ?? null;
}

function laneTower(state, side, lane) {
  return state.structures.find(s => s.kind === 'tower' && s.side === side && s.lane === lane && s.hp > 0);
}

/** Het gebouw waar deze eenheid naartoe marcheert: toren van de baan, anders het kasteel. */
export function objectiveFor(state, unit) {
  const enemy = other(unit.side);
  return laneTower(state, enemy, unit.lane)
    ?? state.structures.find(s => s.kind === 'castle' && s.side === enemy && s.hp > 0)
    ?? null;
}

/** Na het slopen van de vijandelijke toren vechten beide banen samen bij het kasteel. */
function hasBrokenThrough(state, unit) {
  return !laneTower(state, other(unit.side), unit.lane);
}

function canFight(state, a, b) {
  return a.lane === b.lane || (hasBrokenThrough(state, a) && hasBrokenThrough(state, b));
}

/**
 * Doelwitselectie. Vaste volgorde:
 *   1. Het huidige doelwit, zolang het leeft en binnen bereik is (gevecht afmaken).
 *   2. De dichtstbijzijnde vijandelijke eenheid die opgemerkt wordt: binnen
 *      DETECTION_RANGE, óf achter de eenheid (die bedreigt de eigen basis),
 *      ongeacht de afstand.
 *   3. Het vijandelijke gebouw van deze baan.
 */
export function chooseTarget(state, unit) {
  const enemies = state.units.filter(e => e.side !== unit.side && e.hp > 0 && canFight(state, unit, e));
  const current = enemies.find(e => e.id === unit.targetId);
  if (current && inRange(unit, current)) return current;

  const forward = unit.side === 'blue' ? 1 : -1;
  let best = null;
  for (const e of enemies) {
    const dx = e.x - unit.x;
    const behind = dx * forward < 0;
    if (!behind && Math.abs(dx) > DETECTION_RANGE) continue;
    if (!best || Math.abs(dx) < Math.abs(best.x - unit.x) ||
        (Math.abs(dx) === Math.abs(best.x - unit.x) && e.id < best.id)) best = e;
  }
  return best ?? objectiveFor(state, unit);
}

function stepEnergy(state, dt) {
  const seconds = state.time > OVERTIME_AT ? ENERGY_SECONDS_OVERTIME : ENERGY_SECONDS;
  for (const side of ['blue', 'red']) {
    state.energy[side] = clamp(state.energy[side] + dt / seconds, 0, ENERGY_MAX);
  }
}

function stepAI(state, dt) {
  state.ai.clock -= dt;
  if (state.ai.clock > 0) return;
  const affordable = CARDS.map((card, i) => i).filter(i => CARDS[i].cost <= state.energy.red);
  if (affordable.length) {
    const index = affordable[Math.floor(state.rng() * affordable.length)];
    const lane = Math.floor(state.rng() * LANES.length);
    const x = AI.spawnMin + state.rng() * (AI.spawnMax - AI.spawnMin);
    deploy(state, 'red', lane, index, x);
  }
  state.ai.clock = AI.minDelay + state.rng() * (AI.maxDelay - AI.minDelay);
}

function structureScore(state, side) {
  return state.structures.filter(s => s.side === side).reduce((sum, s) => sum + s.hp / s.max, 0);
}

function finish(state, winner) {
  if (state.ended) return;
  state.ended = true;
  state.winner = winner;
  state.events.push({ type: 'end', winner });
}

/** Zet de simulatie `dt` seconden vooruit en geeft de gebeurtenissen van deze tick terug. */
export function step(state, dt) {
  state.events = [];
  if (state.ended) return state.events;

  state.time += dt;
  stepEnergy(state, dt);
  if (state.ai.enabled) stepAI(state, dt);

  const moves = [];
  const hits = [];

  // 1. BESLISSEN
  for (const u of state.units) {
    u.cd = Math.max(0, u.cd - dt);
    const target = chooseTarget(state, u);
    u.targetId = target ? target.id : null;
    if (!target) { u.state = 'idle'; continue; }
    if (target.x !== u.x) u.facing = target.x > u.x ? 1 : -1;

    if (inRange(u, target)) {
      u.state = 'attack';
      if (u.cd <= 0) { hits.push({ attacker: u, target }); u.cd = u.card.rate; }
    } else {
      u.state = 'move';
      // Nooit verder lopen dan tot precies op aanvalsbereik.
      const distance = Math.min(u.card.speed * dt, gap(u, target) - u.card.range);
      moves.push({ unit: u, dx: u.facing * distance });
    }
  }
  for (const s of state.structures) {
    if (s.hp <= 0) continue;
    s.cd = Math.max(0, s.cd - dt);
    if (s.cd > 0) continue;
    let nearest = null;
    for (const u of state.units) {
      if (u.side === s.side || u.hp <= 0) continue;
      if (s.kind !== 'castle' && u.lane !== s.lane) continue;
      if (!inRange(s, u)) continue;
      if (!nearest || gap(s, u) < gap(s, nearest)) nearest = u;
    }
    if (nearest) { hits.push({ attacker: s, target: nearest }); s.cd = STRUCTURES[s.kind].rate; }
  }

  // 2. BEWEGEN
  for (const m of moves) {
    m.unit.x += m.dx;
    m.unit.distanceTravelled += Math.abs(m.dx);
  }

  // 3. SCHADE
  for (const { attacker, target } of hits) {
    let damage = attacker.card ? attacker.card.damage : STRUCTURES[attacker.kind].damage;
    if (attacker.card?.type === 'cavalry' && !attacker.chargeUsed &&
        attacker.distanceTravelled >= attacker.card.chargeDistance) {
      damage += attacker.card.chargeBonus;
      attacker.chargeUsed = true;
    }
    if (attacker.card?.type === 'berserker' && attacker.hp <= attacker.max / 2) {
      damage = Math.round(damage * attacker.card.rageMultiplier);
    }
    const before = target.hp;
    target.hp = Math.max(0, target.hp - damage);
    state.events.push({
      type: 'hit',
      kind: attacker.card ? attacker.card.type : attacker.kind, // melee | archer | cannon | tower | castle
      side: attacker.side,
      attackerId: attacker.id,
      targetId: target.id,
      from: { x: attacker.x, y: attacker.y },
      to: { x: target.x, y: target.y },
      damage: before - target.hp,
    });
  }

  // 4. OPRUIMEN
  for (const u of state.units) if (u.hp <= 0) state.events.push({ type: 'death', id: u.id, side: u.side, x: u.x, y: u.y });
  state.units = state.units.filter(u => u.hp > 0);
  for (const { target } of hits) {
    if (target.kind && target.hp <= 0 && !target.destroyed) {
      target.destroyed = true;
      state.events.push({ type: 'destroyed', id: target.id, kind: target.kind, side: target.side });
    }
  }

  const fallen = state.structures.filter(s => s.kind === 'castle' && s.hp <= 0);
  if (fallen.length === 1) finish(state, other(fallen[0].side));
  else if (fallen.length === 2 || state.time >= MATCH_SECONDS) {
    finish(state, structureScore(state, 'blue') >= structureScore(state, 'red') ? 'blue' : 'red');
  }
  return state.events;
}
