// The Conquest — regels van de campagne. Puur JavaScript (geen Phaser, geen DOM), getest in
// tests/campaign.test.js. De gegevens per wereld staan in aparte bestanden (rome.js).
//
// Voortgang is één object { missieId: sterren (1..3) }. Waar het bewaard wordt (nu: localStorage,
// later de server) regelt src/conquest.js; deze functies werken alleen op dat object.
import { CARDS } from '../sim/config.js';
import { ROME } from './rome.js';

export const WORLDS = [ROME];
export const MAX_STARS = 3;

export const allMissions = () => WORLDS.flatMap(w => w.missions);
export const missionById = id => allMissions().find(x => x.id === id) ?? null;

/** De missie die eerst gehaald moet zijn (null = meteen speelbaar). */
export function requirement(mission) {
  if (mission.after !== undefined) return mission.after;
  const world = WORLDS.find(w => w.missions.includes(mission));
  const main = world.missions.filter(x => !x.bonus);
  const i = main.indexOf(mission);
  return i > 0 ? main[i - 1].id : null;
}

export const starsOf = (progress, id) => Math.max(0, Math.min(MAX_STARS, Math.floor(progress?.[id] ?? 0)));
export const isUnlocked = (progress, mission) => {
  const need = requirement(mission);
  return need === null || starsOf(progress, need) > 0;
};
/** 'locked' | 'open' | 'done'; de eerste nog niet gehaalde hoofdmissie krijgt extra `current`. */
export function missionStatus(progress, mission) {
  if (starsOf(progress, mission.id) > 0) return 'done';
  return isUnlocked(progress, mission) ? 'open' : 'locked';
}
export function currentMission(progress, world = ROME) {
  return world.missions.find(x => !x.bonus && missionStatus(progress, x) === 'open') ?? null;
}
export function totalStars(progress, world = ROME) {
  return world.missions.reduce((sum, x) => sum + starsOf(progress, x.id), 0);
}

/** Missie -> regels voor createBattle({ rules }). */
export function missionRules(mission) {
  const e = mission.enemy, p = mission.player ?? {};
  return {
    timeLimit: mission.time,
    goal: mission.goal,
    aiDeck: e.deck,
    aiTempo: e.tempo ?? 1,
    energyStart: { red: e.start },
    energyRate: { red: e.rate ?? 1, blue: p.rate ?? 1 },
  };
}
/** Kaartniveaus van de computer in deze missie. */
export const enemyLevels = mission => Object.fromEntries(CARDS.map(c => [c.type, mission.enemy.level ?? 1]));

const ownTowers = state => state.structures.filter(s => s.kind === 'tower' && s.side === 'blue' && s.hp > 0).length;
const ownCastlePct = state => {
  const c = state.structures.find(s => s.kind === 'castle' && s.side === 'blue');
  return c ? 100 * Math.max(0, c.hp) / c.max : 0;
};
/** Eén stervoorwaarde tegen de eindstand van het gevecht. */
export function conditionMet(condition, state) {
  if (state.winner !== 'blue') return false;
  const [key, arg] = condition.split(':');
  if (key === 'win') return true;
  if (key === 'towers2') return ownTowers(state) >= 2;
  if (key === 'tower1') return ownTowers(state) >= 1;
  if (key === 'time') return state.time <= Number(arg) + 1e-6;
  if (key === 'castle') return ownCastlePct(state) >= Number(arg);
  throw new RangeError('Unknown star condition: ' + condition);
}
/** Aantal sterren (0..3) voor een afgelopen gevecht. Verloren = 0. */
export function starsFor(mission, state) {
  if (!state.ended || state.winner !== 'blue') return 0;
  return mission.stars.filter(c => conditionMet(c, state)).length;
}
/** Nieuwe voortgang na een gevecht: sterren gaan alleen omhoog. */
export function withResult(progress, missionId, stars) {
  const best = Math.max(starsOf(progress, missionId), Math.max(0, Math.min(MAX_STARS, stars)));
  return best > 0 ? { ...progress, [missionId]: best } : { ...progress };
}
/** Voortgang uit opslag opschonen: alleen bekende missies, hele sterren 1..3. */
export function sanitizeProgress(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const x of allMissions()) { const s = starsOf(raw, x.id); if (s > 0) out[x.id] = s; }
  return out;
}

const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const GOAL_TEXT = {
  castle: mission => `Destroy the enemy castle within ${mmss(mission.time)}.`,
  towers: mission => `Destroy both enemy towers within ${mmss(mission.time)}.`,
  survive: mission => `Keep your castle standing for ${mmss(mission.time)}.`,
};
export function conditionText(condition) {
  const [key, arg] = condition.split(':');
  return { win: 'Win the battle', towers2: 'Keep both your towers', tower1: 'Keep at least one tower',
    time: `Win within ${mmss(Number(arg))}`, castle: `Keep your castle above ${arg}%` }[key];
}
