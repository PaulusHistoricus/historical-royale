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
    airstrikes: [],
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
    hidden: card.type === 'samurai', channelTargetId: null, channelProgress: 0,
    burnRemaining: 0, burnDps: 0,
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
  if (card.type === 'p51') {
    const strike = { id: state.nextId++, side, lane, time: 0, duration: card.duration, hitIds: [] };
    state.airstrikes.push(strike);
    // deploy() kan ook buiten een step worden aangeroepen; dit event is visueel optioneel.
    return strike;
  }
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
  const enemies = state.units.filter(e => e.side !== unit.side && e.hp > 0 && !e.hidden &&
    canFight(state, unit, e) && (unit.card.type !== 'spy' ||
      (e.card.material === 'bio' && e.card.cost <= unit.card.maxStealCost && e.card.type !== 'spy')));
  const current = enemies.find(e => e.id === unit.targetId);
  if (current && inRange(unit, current)) return current;

  const forward = unit.side === 'blue' ? 1 : -1;
  let best = null;
  for (const e of enemies) {
    const dx = e.x - unit.x;
    const behind = dx * forward < 0;
    if (!behind && Math.abs(dx) > DETECTION_RANGE && unit.card.type !== 'spy') continue;
    if (!best || Math.abs(dx) < Math.abs(best.x - unit.x) ||
        (Math.abs(dx) === Math.abs(best.x - unit.x) && e.id < best.id)) best = e;
  }
  // A spy can only charm eligible biological units, never structures.
  if (unit.card.type === 'spy') return best;
  return best ?? objectiveFor(state, unit);
}

function stepEnergy(state, dt) {
  const seconds = state.time > OVERTIME_AT ? ENERGY_SECONDS_OVERTIME : ENERGY_SECONDS;
  for (const side of ['blue', 'red']) {
    // Grote legers kosten logistiek. Nooit meer dan 30% energiestraf.
    const count = state.units.filter(u => u.side === side && u.hp > 0).length;
    const multiplier = count <= 4 ? 1 : count <= 7 ? 0.9 : count <= 10 ? 0.8 : 0.7;
    state.energy[side] = clamp(state.energy[side] + dt * multiplier / seconds, 0, ENERGY_MAX);
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

  // Brandwonden werken door ongeacht de huidige actie van de eenheid.
  for (const u of state.units) {
    if (u.burnRemaining > 0 && u.hp > 0) {
      const burnDt = Math.min(dt, u.burnRemaining);
      u.hp = Math.max(0, u.hp - u.burnDps * burnDt);
      u.burnRemaining = Math.max(0, u.burnRemaining - dt);
    }
  }

  // De P-51 is een onraakbare, eenmalige strafe over precies één baan.
  // Elk doelwit in de baan wordt hoogstens één keer geraakt bij het passeren.
  for (const strike of state.airstrikes) {
    const previous = strike.time / strike.duration;
    strike.time = Math.min(strike.duration, strike.time + dt);
    const progress = strike.time / strike.duration;
    const start = strike.side === 'blue' ? 245 : 715;
    const end = strike.side === 'blue' ? 765 : 195;
    const x0 = start + (end - start) * previous, x1 = start + (end - start) * progress;
    const candidates = [
      ...state.units.filter(u => u.hp > 0 && u.side !== strike.side && u.lane === strike.lane),
      ...state.structures.filter(t => t.hp > 0 && t.side !== strike.side && t.kind === 'tower' && t.lane === strike.lane),
    ];
    for (const target of candidates) {
      // Marge: eenheden lopen het vliegtuig tegemoet en zouden anders tussen
      // twee ticks door het strookje kunnen glippen.
      const margin = target.radius + 8;
      if (strike.hitIds.includes(target.id) || target.x < Math.min(x0, x1) - margin ||
          target.x > Math.max(x0, x1) + margin) continue;
      const aircraft = CARDS.find(c => c.type === 'p51');
      const pct = target.kind ? 0 : aircraft.minUnitDamagePct +
        state.rng() * (aircraft.maxUnitDamagePct - aircraft.minUnitDamagePct);
      const damage = target.kind
        ? target.max * aircraft.towerDamagePct
        : target.max * pct;
      const before = target.hp;
      target.hp = Math.max(0, target.hp - damage);
      strike.hitIds.push(target.id);
      state.events.push({ type: 'hit', kind: 'p51', side: strike.side, attackerId: strike.id,
        targetId: target.id, from: { x: target.x, y: LANES[strike.lane] - 55 },
        to: { x: target.x, y: target.y }, damage: before - target.hp });
    }
    if (strike.time >= strike.duration) {
      state.events.push({ type: 'airstrike_done', id: strike.id, side: strike.side, lane: strike.lane });
    }
  }
  state.airstrikes = state.airstrikes.filter(a => a.time < a.duration);

  // 1. BESLISSEN
  for (const u of state.units) {
    if (u.hp <= 0) continue;
    // Betoverd door een spion: bevroren tot de overname, of tot de spion gedood is (gered).
    if (u.charmedBy) {
      const spy = state.units.find(x => x.id === u.charmedBy && x.hp > 0 && x.channelTargetId === u.id);
      if (spy) { u.state = 'charmed'; u.targetId = null; continue; }
      u.charmedBy = null;
    }
    u.cd = Math.max(0, u.cd - dt);
    // Schaduwsamoerai: na recloakTime zonder aanval weer onzichtbaar, met nieuwe hinderlaagbonus.
    if (u.card.type === 'samurai' && !u.hidden) {
      u.cloakTimer = (u.cloakTimer ?? u.card.recloakTime) - dt;
      if (u.cloakTimer <= 0) {
        u.hidden = true;
        u.firstStrikeDone = false;
        u.cloakTimer = u.card.recloakTime;
        state.events.push({ type: 'cloak', id: u.id, side: u.side });
      }
    }
    // Genezeres geneest alleen biologische bondgenoten, nooit zichzelf.
    if (u.card.type === 'healer' && u.cd <= 0) {
      const allies = state.units.filter(a => a.id !== u.id && a.side === u.side && a.hp > 0 &&
        a.card.material === 'bio' && a.hp < a.max && gap(u, a) <= u.card.healRange);
      allies.sort((a, b) => a.hp / a.max - b.hp / b.max || a.id - b.id);
      if (allies.length) {
        const ally = allies[0];
        const amount = Math.min(ally.max - ally.hp, ally.max * u.card.healPct);
        ally.hp += amount;
        if (ally.x !== u.x) u.facing = ally.x > u.x ? 1 : -1;
        u.cd = u.card.rate;
        u.state = 'attack';
        u.targetId = ally.id;
        state.events.push({ type: 'heal', attackerId: u.id, targetId: ally.id, amount,
          from: { x: u.x, y: u.y }, to: { x: ally.x, y: ally.y } });
        continue;
      }
    }
    const target = chooseTarget(state, u);
    u.targetId = target ? target.id : null;
    if (!target) { u.state = 'idle'; continue; }
    if (target.x !== u.x) u.facing = target.x > u.x ? 1 : -1;

    if (inRange(u, target)) {
      if (u.card.type === 'spy') {
        u.state = 'attack';
        if (u.channelTargetId !== target.id) { u.channelTargetId = target.id; u.channelProgress = 0; }
        target.charmedBy = u.id;
        u.channelProgress += dt;
        if (u.channelProgress >= u.card.channelTime) {
          const formerSide = target.side;
          target.side = u.side;
          target.facing = u.side === 'blue' ? 1 : -1;
          target.targetId = null;
          target.channelTargetId = null;
          target.channelProgress = 0;
          target.charmedBy = null;
          u.hp = 0;
          state.events.push({ type: 'possess', spyId: u.id, targetId: target.id,
            fromSide: formerSide, toSide: u.side, x: target.x, y: target.y });
        }
      } else {
        u.state = 'attack';
        if (u.cd <= 0) {
          hits.push({ attacker: u, target });
          if (u.hidden) u.hidden = false; // schaduwsamoerai wordt zichtbaar bij aanval
          if (u.card.type === 'samurai') u.cloakTimer = u.card.recloakTime;
          u.cd = u.card.rate;
        }
      }
    } else {
      u.channelTargetId = null;
      u.channelProgress = 0;
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
      if (u.side === s.side || u.hp <= 0 || u.hidden) continue;
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
    if (attacker.card?.type === 'samurai' && !attacker.firstStrikeDone) {
      damage = Math.round(damage * attacker.card.stealthBonus);
      attacker.firstStrikeDone = true;
    }
    // Pantser beschermt mechanische eenheden tegen gewone aanvallen, niet tegen kanonnen.
    if (target.card?.material === 'mechanical') {
      damage = Math.round(damage * (attacker.card?.role === 'siege' ? 1.25 : 0.85));
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
    if (attacker.card?.type === 'firethrower') {
      // Vuurpotten zetten alle vijanden in een kleine cluster in brand.
      for (const victim of state.units) {
        if (victim.side === attacker.side || victim.hp <= 0 || victim.lane !== attacker.lane ||
            Math.abs(victim.x - target.x) > attacker.card.splashRadius) continue;
        victim.burnRemaining = Math.max(victim.burnRemaining, attacker.card.burnSeconds);
        victim.burnDps = Math.max(victim.burnDps, attacker.card.burnDps);
        if (victim !== target) {
          victim.hp = Math.max(0, victim.hp - attacker.card.damage * 0.5);
          state.events.push({ type: 'hit', kind: 'firethrower', side: attacker.side,
            attackerId: attacker.id, targetId: victim.id, from: { x: attacker.x, y: attacker.y },
            to: { x: victim.x, y: victim.y }, damage: attacker.card.damage * 0.5 });
        }
      }
    }
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
