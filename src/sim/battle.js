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

import { cardLevelMultiplier } from '../progression.js';
import {
  CARDS, STRUCTURES, STRUCTURE_POSITIONS, LANES, DEPLOY_ZONE, DETECTION_RANGE,
  MATCH_SECONDS, OVERTIME_AT, ENERGY_START, ENERGY_MAX, ENERGY_SECONDS,
  ENERGY_SECONDS_OVERTIME, AI, DEPLOY_ADVANCE, SUPPORT_TYPES,
} from './config.js';

const EPS = 1e-6;
const BANNER = CARDS.find(c => c.type === 'banner');
const RALLY = { speed: BANNER.auraSpeed, attack: BANNER.auraAttack };          // Banner Maiden
const SHIELD_PCT = CARDS.find(c => c.type === 'spartan').shieldPct;             // Spartan Guardian
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

export function createBattle({ seed = Date.now(), ai = true, cardLevels = null } = {}) {
  const state = {
    // Kaartniveaus per kant: { blue: { melee: 3, ... }, red: { ... } }. Ontbreekt = niveau 1.
    cardLevels: cardLevels ?? { blue: {}, red: {} },
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
/** Kaart met de sterkte van het niveau van die kant (niveau 1 = de kaart zelf). */
export function leveledCard(state, side, card) {
  const level = state.cardLevels?.[side]?.[card.type] ?? 1;
  if (level <= 1) return card;
  const k = cardLevelMultiplier(level);
  const scaled = { ...card, level, hp: Math.round(card.hp * k), damage: Math.round(card.damage * k) };
  if (card.burnDps) scaled.burnDps = Math.round(card.burnDps * k);
  if (card.poisonDps) scaled.poisonDps = Math.round(card.poisonDps * k);
  return scaled;
}

export function addUnit(state, side, lane, cardIndex, x) {
  const card = leveledCard(state, side, CARDS[cardIndex]);
  const id = state.nextId++;
  const unit = {
    id, side, lane, x,
    y: LANES[lane] + ((id - 1) % 3 - 1) * 10, // alleen decoratief, telt niet mee in gevechten
    hp: card.hp, max: card.hp, radius: card.radius, card,
    cd: 0, state: 'move', targetId: null,
    distanceTravelled: 0, chargeUsed: false,
    hidden: card.type === 'samurai', channelTargetId: null, channelProgress: 0,
    burnRemaining: 0, burnDps: 0,
    poisonRemaining: 0, poisonDps: 0, noHealRemaining: 0, canSpread: false,
    rallied: false, shielded: false, backstabUsed: false, lastHitBy: null,
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
  const zone = deployZone(state, side, lane);
  return addUnit(state, side, lane, cardIndex, clamp(x, zone.min, zone.max));
}

/**
 * Plaatsingszone van een kant in een baan. Is de vijandelijke toren in die baan gevallen,
 * dan schuift de zone DEPLOY_ADVANCE op richting de vijand; is je eigen toren gevallen,
 * dan wordt je zone aan de voorkant even veel kleiner.
 */
export function deployZone(state, side, lane) {
  const base = DEPLOY_ZONE[side], dir = side === 'blue' ? 1 : -1;
  const enemyTowerDown = !laneTower(state, other(side), lane);
  const ownTowerDown = !laneTower(state, side, lane);
  let { min, max } = base;
  if (side === 'blue') { if (enemyTowerDown) max += DEPLOY_ADVANCE; if (ownTowerDown) max -= DEPLOY_ADVANCE; }
  else { if (enemyTowerDown) min -= DEPLOY_ADVANCE; if (ownTowerDown) min += DEPLOY_ADVANCE; }
  void dir;
  return { min, max };
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


/**
 * Eenheden uit verschillende banen vechten alleen samen in een kasteelgebied: beide staan
 * voorbij de torenlijn van dezelfde kant, en die kant heeft in (minstens) één van de twee
 * banen haar toren verloren. Op het middenveld blijven de banen altijd gescheiden
 * (ook voor de Priestess en de vlammenkegel).
 */
function behindTowers(unit, side) {
  const towerX = STRUCTURE_POSITIONS[side].towerX;
  return side === 'blue' ? unit.x <= towerX : unit.x >= towerX;
}
function canFight(state, a, b) {
  if (a.lane === b.lane) return true;
  return ['blue', 'red'].some(side => behindTowers(a, side) && behindTowers(b, side) &&
    (!laneTower(state, side, a.lane) || !laneTower(state, side, b.lane)));
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
  // Een eenheid die betoverd wordt door een spion is 'gereserveerd': die kant valt haar niet aan.
  const enemies = state.units.filter(e => e.side !== unit.side && e.hp > 0 && !e.hidden && (!e.charmedBy || e.charmedBy === unit.id) &&
    canFight(state, unit, e) && (unit.card.type !== 'spy' ||
      (e.card.material === 'bio' && e.card.cost <= unit.card.maxStealCost && e.card.type !== 'spy')));
  const current = enemies.find(e => e.id === unit.targetId);
  if (current && inRange(unit, current)) return current;

  // Perzische sluipmoordenares: ondersteuners (Priestess, Banner Maiden, Plague Doctor) eerst.
  if (unit.card.type === 'assassin') {
    let prey = null;
    for (const e of enemies) {
      if (!SUPPORT_TYPES.includes(e.card.type) || Math.abs(e.x - unit.x) > unit.card.supportDetect) continue;
      if (!prey || Math.abs(e.x - unit.x) < Math.abs(prey.x - unit.x) ||
          (Math.abs(e.x - unit.x) === Math.abs(prey.x - unit.x) && e.id < prey.id)) prey = e;
    }
    if (prey) return prey;
  }

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
    // Achterste ~77 % van de eigen zone (met de standaardzone precies AI.spawnMin..spawnMax).
    const zone = deployZone(state, 'red', lane);
    const lo = zone.min + (AI.spawnMin - DEPLOY_ZONE.red.min) / (DEPLOY_ZONE.red.max - DEPLOY_ZONE.red.min) * (zone.max - zone.min);
    const x = lo + state.rng() * (zone.max - lo);
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

  // Brandwonden en gif werken door ongeacht de huidige actie van de eenheid.
  for (const u of state.units) {
    if (u.burnRemaining > 0 && u.hp > 0) {
      const burnDt = Math.min(dt, u.burnRemaining);
      u.hp = Math.max(0, u.hp - u.burnDps * burnDt);
      u.burnRemaining = Math.max(0, u.burnRemaining - dt);
    }
    if (u.poisonRemaining > 0 && u.hp > 0) {
      const poisonDt = Math.min(dt, u.poisonRemaining);
      u.hp = Math.max(0, u.hp - u.poisonDps * poisonDt);
      u.poisonRemaining = Math.max(0, u.poisonRemaining - dt);
    }
    u.noHealRemaining = Math.max(0, u.noHealRemaining - dt);
  }
  // Besmetting: een direct vergiftigde eenheid steekt één keer één biologische bondgenoot aan
  // (binnen spreadRange, zelfde baan). Die kan zelf niet verder besmetten: geen kettingreactie.
  for (const u of state.units) {
    if (!u.canSpread || u.hp <= 0 || u.poisonRemaining <= 0) continue;
    let next = null;
    for (const o of state.units) {
      if (o === u || o.side !== u.side || o.hp <= 0 || o.lane !== u.lane || o.card.material !== 'bio' ||
          o.poisonRemaining > 0 || Math.abs(o.x - u.x) > u.spreadRange) continue;
      if (!next || Math.abs(o.x - u.x) < Math.abs(next.x - u.x) || (Math.abs(o.x - u.x) === Math.abs(next.x - u.x) && o.id < next.id)) next = o;
    }
    if (!next) continue;
    u.canSpread = false;
    next.poisonRemaining = u.poisonSeconds; next.poisonDps = u.poisonDps;
    next.noHealRemaining = Math.max(next.noHealRemaining, u.poisonSeconds);
    state.events.push({ type: 'infect', fromId: u.id, targetId: next.id, side: next.side });
  }

  // Auras en schildmuur worden elke tick opnieuw bepaald uit de levende eenheden:
  // sterft de bron, dan is het effect meteen weg. Meerdere bronnen stapelen niet (ja/nee).
  for (const u of state.units) {
    u.rallied = u.hp > 0 && u.card.material === 'bio' && state.units.some(b => b !== u && b.hp > 0 &&
      b.card.type === 'banner' && b.side === u.side && b.lane === u.lane && Math.abs(b.x - u.x) <= b.card.auraRange);
    u.shielded = u.hp > 0 && u.card.material === 'bio' && state.units.some(g => g !== u && g.hp > 0 &&
      g.card.type === 'spartan' && g.side === u.side && g.lane === u.lane &&
      (u.x - g.x) * (u.side === 'blue' ? 1 : -1) < 0 && Math.abs(u.x - g.x) <= g.card.shieldRange);
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
        a.card.material === 'bio' && a.hp < a.max && !(a.noHealRemaining > 0) && canFight(state, u, a) && gap(u, a) <= u.card.healRange);
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
          if (u.card.type === 'flamegi') {
            // Vlammenkegel: alle vijandelijke eenheden vóór de GI binnen bereik, plus het doelwit
            // als dat een gebouw is (30 % schade). Niets achter hem.
            for (const e of state.units) {
              if (e.side === u.side || e.hp <= 0 || e.hidden || e.charmedBy || !canFight(state, u, e)) continue;
              if ((e.x - u.x) * u.facing < 0 || !inRange(u, e)) continue;
              hits.push({ attacker: u, target: e, flame: true });
            }
            if (target.kind) hits.push({ attacker: u, target, flame: true });
          } else {
            hits.push({ attacker: u, target });
          }
          if (u.hidden) u.hidden = false; // schaduwsamoerai wordt zichtbaar bij aanval
          if (u.card.type === 'samurai') u.cloakTimer = u.card.recloakTime;
          u.cd = u.rallied ? u.card.rate / (1 + RALLY.attack) : u.card.rate;
        }
      }
    } else {
      u.channelTargetId = null;
      u.channelProgress = 0;
      u.state = 'move';
      // Nooit verder lopen dan tot precies op aanvalsbereik.
      const speed = u.card.speed * (u.rallied ? 1 + RALLY.speed : 1);
      const distance = Math.min(speed * dt, gap(u, target) - u.card.range);
      moves.push({ unit: u, dx: u.facing * distance });
    }
  }
  for (const s of state.structures) {
    if (s.hp <= 0) continue;
    s.cd = Math.max(0, s.cd - dt);
    if (s.cd > 0) continue;
    let nearest = null;
    for (const u of state.units) {
      if (u.side === s.side || u.hp <= 0 || u.hidden || u.charmedBy) continue;
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
  for (const { attacker, target, flame } of hits) {
    let damage = attacker.card ? attacker.card.damage : STRUCTURES[attacker.kind].damage;
    let knockback = 0, backstab = false;
    if ((attacker.card?.type === 'cavalry' || attacker.card?.type === 'lancer') && !attacker.chargeUsed &&
        attacker.distanceTravelled >= attacker.card.chargeDistance) {
      damage += attacker.card.chargeBonus;
      attacker.chargeUsed = true;
      if (attacker.card.knockback && !target.kind) knockback = attacker.card.knockback;
    }
    if (attacker.card?.type === 'assassin' && !attacker.backstabUsed && target.card && SUPPORT_TYPES.includes(target.card.type)) {
      damage = Math.round(damage * (1 + attacker.card.backstabBonus));
      attacker.backstabUsed = true; backstab = true;
    }
    if (flame && target.kind) damage = damage * attacker.card.structurePct;
    // Schildmuur: biologische bondgenoten achter een Spartaan krijgen 40 % minder schade van
    // projectielen van afstandseenheden (geen artillerie, gebouwen, vlammen of P-51).
    if (target.shielded && attacker.card?.role === 'ranged' && attacker.card.type !== 'flamegi') {
      damage = damage * (1 - SHIELD_PCT);
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
    if (!target.kind) target.lastHitBy = attacker.id;
    if (knockback) {   // Steppe Lancer: Breakthrough duwt het doelwit 30 terug, nooit door gebouwen of van het veld
      const dir = attacker.facing;
      let nx = target.x + dir * knockback;
      for (const s of state.structures) {
        if (s.hp <= 0 || s.side !== target.side || (s.kind === 'tower' && s.lane !== target.lane)) continue;
        if ((s.x - target.x) * dir > 0) nx = dir > 0 ? Math.min(nx, s.x - s.radius - target.radius) : Math.max(nx, s.x + s.radius + target.radius);
      }
      target.x = clamp(nx, 20, 940);
      state.events.push({ type: 'knockback', id: target.id, x: target.x, attackerId: attacker.id });
    }
    if (target.card && attacker.card?.type === 'plague') {
      // Contagion: gif (niet stapelend, wel verversen) en geen genezing; alleen biologisch.
      if (target.card.material === 'bio') {
        if (target.poisonRemaining <= 0) target.canSpread = true;
        target.poisonRemaining = attacker.card.poisonSeconds;
        target.poisonDps = Math.max(target.poisonDps, attacker.card.poisonDps);
        target.noHealRemaining = attacker.card.poisonSeconds;
        target.poisonSeconds = attacker.card.poisonSeconds; target.spreadRange = attacker.card.spreadRange;
      }
    }
    if (flame && target.card) {
      target.burnRemaining = Math.max(target.burnRemaining, attacker.card.burnSeconds);
      target.burnDps = Math.max(target.burnDps, attacker.card.burnDps);
    }
    state.events.push({
      type: 'hit', backstab,
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
  for (const u of state.units) {
    if (u.hp > 0) continue;
    const killer = state.units.find(k => k.id === u.lastHitBy);
    state.events.push({ type: 'death', id: u.id, side: u.side, x: u.x, y: u.y, killerId: u.lastHitBy, killerType: killer?.card.type ?? null, killerSide: killer?.side ?? null });
  }
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
