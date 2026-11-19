import assert from 'node:assert/strict';
import { createBattle, addUnit, step, findById, gap } from '../src/sim/battle.js';

import { STRUCTURE_POSITIONS } from '../src/sim/config.js';

export const TICK = 1 / 60;
// Posities van gebouwen, zodat tests niet breken als de arena verschuift.
export const BLUE_TOWER = STRUCTURE_POSITIONS.blue.towerX;
export const RED_TOWER = STRUCTURE_POSITIONS.red.towerX;
export const BLUE_CASTLE = STRUCTURE_POSITIONS.blue.castleX;
export const LEGIONAIR = 0, BOOGSCHUTTER = 1, KANON = 2;

/** Leeg slagveld zonder computertegenstander, zodat een test alles zelf bepaalt. */
export function arena() {
  return createBattle({ seed: 1, ai: false });
}

export const place = addUnit;

/**
 * Draait de simulatie en bewaakt bij ELKE tick de kerninvariant van issue #1:
 * een eenheid staat nooit stil zonder aan te vallen.
 *   - state 'move'   => de eenheid is deze tick echt verplaatst
 *   - state 'attack' => het doelwit is binnen bereik en er valt minstens één
 *                       klap per aanvalsinterval
 */
export function run(state, seconds, onTick) {
  const log = { hits: [], deaths: [], events: [] };
  const sinceHit = new Map();
  for (let t = 0; t < seconds && !state.ended; t += TICK) {
    const before = new Map(state.units.map(u => [u.id, u.x]));
    const events = step(state, TICK);
    for (const e of events) {
      log.events.push(e);
      if (e.type === 'hit') { log.hits.push({ ...e, time: state.time }); sinceHit.set(e.attackerId, 0); }
      if (e.type === 'heal') sinceHit.set(e.attackerId, 0);
      if (e.type === 'death') log.deaths.push({ ...e, time: state.time });
    }
    for (const u of state.units) {
      assert.ok(Number.isFinite(u.x) && Number.isFinite(u.hp), `eenheid ${u.id} heeft ongeldige waarden`);
      if (!before.has(u.id)) continue; // deze tick geplaatst
      if (u.state === 'move') {
        assert.notEqual(u.x, before.get(u.id), `eenheid ${u.id} (${u.card.name}) staat stil in state 'move' op t=${state.time.toFixed(2)}`);
        sinceHit.delete(u.id);
      } else if (u.state === 'attack') {
        const target = findById(state, u.targetId);
        // Het doelwit mag ná de beslissing nog één stap zijn weggelopen.
        // Uitzondering: een doelwit dat deze tick door een Steppe Lancer is teruggeduwd.
        const pushed = events.some(e => e.type === 'knockback' && (e.id === u.targetId || e.id === u.id));
        if (target && !pushed) assert.ok(gap(u, target) <= (target.side === u.side ? u.card.healRange : u.card.range) + 2, `eenheid ${u.id} valt aan buiten bereik`);
        const waited = (sinceHit.get(u.id) ?? 0) + TICK;
        sinceHit.set(u.id, waited);
        assert.ok(u.card.type === 'spy' || waited <= u.card.rate + 2 * TICK, `eenheid ${u.id} (${u.card.name}) staat ${waited.toFixed(2)}s in 'attack' zonder te slaan`);
      } else if (u.state === 'charmed') {
        assert.equal(u.x, before.get(u.id), `betoverde eenheid ${u.id} hoort stil te staan`);
        sinceHit.delete(u.id);
      } else if (u.state === 'idle' && ['spy', 'medic', 'hospital'].includes(u.card.type)) {
        // Spy awaits an eligible biological target.
      } else {
        assert.fail(`eenheid ${u.id} heeft onverwachte state '${u.state}'`);
      }
    }
    onTick?.(state, events);
  }
  return log;
}

export const hitsBy = (log, unit) => log.hits.filter(h => h.attackerId === unit.id);
export const hitsOn = (log, target) => log.hits.filter(h => h.targetId === target.id);
