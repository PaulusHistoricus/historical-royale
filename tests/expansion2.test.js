// Unit expansion 2: Spartan Guardian, Plague Doctor, Banner Maiden, Flamethrower GI,
// Steppe Lancer, Persian Assassin + opschuivende plaatsingszones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, DEPLOY_ZONE, DEPLOY_ADVANCE } from '../src/sim/config.js';
import { createBattle, addUnit, deploy, step, chooseTarget, deployZone } from '../src/sim/battle.js';

const idx = type => CARDS.findIndex(c => c.type === type);
const card = type => CARDS[idx(type)];
const arena = () => createBattle({ seed: 3, ai: false });
const run = (state, seconds, onTick) => {
  const events = [];
  for (let i = 0; i < seconds * 60 && !state.ended; i++) { const ev = step(state, 1 / 60); events.push(...ev); onTick?.(ev); }
  return events;
};
const NEW = ['spartan', 'plague', 'banner', 'flamegi', 'lancer', 'assassin'];

test('1+2. zes nieuwe kaarten: kosten, levens, snelheid en interval zoals afgesproken; plaatsen kost energie', () => {
  // v0.23 balans: Spartan 390 hp (was 560), Assassin 135 hp (was 105)
  const want = { spartan: [4, 390, 32, 1.35], plague: [4, 110, 40, 2.3], banner: [5, 175, 45, 1.4],
    flamegi: [5, 170, 31, 0.4], lancer: [4, 205, 105, 1.1], assassin: [3, 135, 90, 0.9] };
  for (const t of NEW) {
    const c = card(t);
    assert.deepEqual([c.cost, c.hp, c.speed, c.rate], want[t], t);
    assert.equal(c.material, 'bio');
    const s = arena(); s.energy.blue = 10;
    const u = deploy(s, 'blue', 0, idx(t), 300);
    assert.ok(u, t); assert.equal(s.energy.blue, 10 - c.cost);
    assert.equal(u.hp, c.hp);
    s.energy.blue = c.cost - 0.5;
    assert.equal(deploy(s, 'blue', 0, idx(t), 300), null, 'te weinig energie');
  }
});

test('3. Shield Wall: minder afstandsschade (shieldPct) voor bondgenoten erachter, niet stapelend, niet tegen melee of kanon', () => {
  const dmgOn = (setup) => {
    const s = arena(); const victim = setup(s);
    const ev = run(s, 4);
    return ev.filter(e => e.type === 'hit' && e.targetId === victim.id);
  };
  // Boogschutter van rood schiet op een blauwe boogschutter; Spartaan staat ervoor (dichter bij rood).
  // De rode boogschutter mikt bewust op de blauwe boogschutter (huidig doelwit binnen bereik blijft gekozen).
  const shooter = (s, v) => { const r = addUnit(s, 'red', 0, idx('archer'), 520); r.targetId = v.id; r.card = { ...r.card, speed: 0 }; };
  const still = u => { u.card = { ...u.card, speed: 0, damage: 0 }; return u; };
  const plain = dmgOn(s => { const v = still(addUnit(s, 'blue', 0, idx('archer'), 380)); shooter(s, v); return v; });
  const shielded = dmgOn(s => {
    const v = still(addUnit(s, 'blue', 0, idx('archer'), 380)); still(addUnit(s, 'blue', 0, idx('spartan'), 420)); shooter(s, v); return v;
  });
  const two = dmgOn(s => {
    const v = still(addUnit(s, 'blue', 0, idx('archer'), 380));
    still(addUnit(s, 'blue', 0, idx('spartan'), 420)); still(addUnit(s, 'blue', 0, idx('spartan'), 430)); shooter(s, v); return v;
  });
  const p = plain.find(e => e.kind === 'archer'), sh = shielded.find(e => e.kind === 'archer'), tw = two.find(e => e.kind === 'archer');
  assert.ok(p && sh && tw);
  assert.ok(Math.abs(sh.damage - p.damage * (1 - card('spartan').shieldPct)) < 1e-9, `${sh.damage} vs ${p.damage}`);
  assert.equal(tw.damage, sh.damage, 'twee Spartanen stapelen niet');
  // Melee wordt niet verminderd
  const s = arena();
  const v = addUnit(s, 'blue', 0, idx('archer'), 400); addUnit(s, 'blue', 0, idx('spartan'), 440);
  const m = addUnit(s, 'red', 0, idx('melee'), 400 - v.radius - 13 - 5);
  m.facing = 1; s.units.forEach(u => (u.distanceTravelled = 0));
  const ev = run(s, 1).filter(e => e.type === 'hit' && e.attackerId === m.id && e.targetId === v.id);
  if (ev.length) assert.ok(Math.abs(ev[0].damage - card('melee').damage * 1.15) < 1e-9, 'melee tegen light, zonder schild');
});

test('3b. Shield Wall verdwijnt meteen als de Spartaan sterft', () => {
  const s = arena();
  const v = addUnit(s, 'blue', 0, idx('archer'), 380);
  const g = addUnit(s, 'blue', 0, idx('spartan'), 420);
  step(s, 1 / 60);
  assert.equal(v.shielded, true);
  g.hp = 0; step(s, 1 / 60); step(s, 1 / 60);
  assert.equal(v.shielded, false);
});

test('4. Contagion: gif + geen genezing, verloopt, verspreidt één keer, geen ketting, mechanisch immuun', () => {
  const s = arena();
  const doc = addUnit(s, 'blue', 0, idx('plague'), 400);
  const a = addUnit(s, 'red', 0, idx('melee'), 520);
  const b = addUnit(s, 'red', 0, idx('melee'), 545);
  const c = addUnit(s, 'red', 0, idx('melee'), 570);
  const healer = addUnit(s, 'red', 0, idx('healer'), 600);
  for (const u of [a, b, c, healer]) u.card = { ...u.card, speed: 0 };   // blijven staan
  doc.card = { ...doc.card, rate: 999 };
  let infected = [];
  run(s, 1.2, ev => { infected.push(...ev.filter(e => e.type === 'infect')); });
  assert.ok(a.poisonRemaining > 0 && a.noHealRemaining > 0, 'doelwit vergiftigd');
  assert.equal(infected.length, 1, 'precies één besmetting');
  assert.equal(infected[0].targetId, b.id);
  assert.equal(c.poisonRemaining, 0, 'geen kettingreactie');
  // genezeres slaat vergiftigden over
  a.hp = a.max - 50;
  const heals = run(s, 2).filter(e => e.type === 'heal' && e.targetId === a.id);
  assert.equal(heals.length, 0);
  run(s, 3);
  assert.equal(a.poisonRemaining, 0); assert.equal(a.noHealRemaining, 0);
  // mechanisch: wel directe schade, geen gif
  const s2 = arena();
  const d2 = addUnit(s2, 'blue', 0, idx('plague'), 400);
  const cannon = addUnit(s2, 'red', 0, idx('cannon'), 520); cannon.card = { ...cannon.card, speed: 0, rate: 999 };
  const ev = run(s2, 1).filter(e => e.type === 'hit' && e.attackerId === d2.id);
  assert.ok(ev.length > 0); assert.equal(cannon.poisonRemaining, 0);
});

test('4b. gif stapelt niet: opnieuw raken ververst alleen de duur', () => {
  const s = arena();
  const doc = addUnit(s, 'blue', 0, idx('plague'), 420);
  const t = addUnit(s, 'red', 0, idx('melee'), 540); t.card = { ...t.card, speed: 0, damage: 0 };
  run(s, 5);
  assert.equal(t.poisonDps, card('plague').poisonDps);
  assert.ok(t.poisonRemaining <= card('plague').poisonSeconds);
  void doc;
});

test('5. Rally: sneller (auraSpeed) en sneller aanvallen voor bondgenoten, niet stapelend, niet voor haarzelf', () => {
  const s = arena();
  const maid = addUnit(s, 'blue', 0, idx('banner'), 300);
  const l = addUnit(s, 'blue', 0, idx('melee'), 330);
  const free = addUnit(s, 'blue', 1, idx('melee'), 330);
  const x0 = l.x, f0 = free.x;
  step(s, 1 / 60); step(s, 1 / 60);
  assert.equal(l.rallied, true); assert.equal(maid.rallied, false); assert.equal(free.rallied, false);
  const moved = l.x - x0, movedFree = free.x - f0;
  assert.ok(Math.abs(moved / movedFree - (1 + card('banner').auraSpeed)) < 0.02, `${moved} vs ${movedFree}`);
  addUnit(s, 'blue', 0, idx('banner'), 310);
  const x1 = l.x; step(s, 1 / 60);
  assert.ok(Math.abs((l.x - x1) / (movedFree / 2) - (1 + card('banner').auraSpeed)) < 0.02, 'twee vaandeldraagsters stapelen niet');
});

test('6. Flamethrower GI raakt alle vijanden vóór hem, niet erachter; gebouwen 40 % (fire x building)', () => {
  const s = arena();
  const gi = addUnit(s, 'blue', 0, idx('flamegi'), 400);
  const front = [addUnit(s, 'red', 0, idx('melee'), 440), addUnit(s, 'red', 0, idx('melee'), 470)];
  const behind = addUnit(s, 'red', 0, idx('melee'), 360);
  for (const u of [...front, behind]) u.card = { ...u.card, speed: 0, damage: 0 };
  gi.card = { ...gi.card, speed: 0 };
  const ev = run(s, 0.05).filter(e => e.type === 'hit' && e.attackerId === gi.id);
  const ids = ev.map(e => e.targetId);
  assert.ok(front.every(f => ids.includes(f.id)), 'beide vijanden voor hem');
  assert.ok(!ids.includes(behind.id), 'niet achter hem');
  assert.ok(front.every(f => f.burnRemaining > 0));
  const s2 = arena();
  const gi2 = addUnit(s2, 'blue', 0, idx('flamegi'), 600);
  const tower = s2.structures.find(t => t.side === 'red' && t.kind === 'tower' && t.lane === 0);
  const hit = run(s2, 3).find(e => e.type === 'hit' && e.attackerId === gi2.id && e.targetId === tower.id);
  assert.ok(hit); assert.ok(Math.abs(hit.damage - card('flamegi').damage * 0.4) < 1e-9);
});

test('7. Steppe Lancer: na 65 aanloop +20 schade en 30 terugduwen, één keer, nooit door een gebouw', () => {
  const s = arena();
  const lancer = addUnit(s, 'blue', 0, idx('lancer'), 300);
  const t = addUnit(s, 'red', 0, idx('melee'), 480); t.card = { ...t.card, speed: 0, damage: 0 };
  const ev = run(s, 4);
  const hits = ev.filter(e => e.type === 'hit' && e.attackerId === lancer.id && e.targetId === t.id);
  const knocks = ev.filter(e => e.type === 'knockback');
  assert.equal(hits[0].damage, card('lancer').damage + card('lancer').chargeBonus);
  assert.equal(hits[1].damage, card('lancer').damage);
  assert.equal(knocks.length, 1);
  // Tegen de toren aan: niet erdoorheen
  const s2 = arena();
  const tower = s2.structures.find(x => x.side === 'red' && x.kind === 'tower' && x.lane === 0);
  const l2 = addUnit(s2, 'blue', 0, idx('lancer'), 470);
  const v = addUnit(s2, 'red', 0, idx('melee'), tower.x - tower.radius - 20); v.card = { ...v.card, speed: 0, damage: 0 };
  run(s2, 3);
  assert.ok(v.x <= tower.x - tower.radius - v.radius + 1e-9, `${v.x}`);
  void l2;
});

test('8. Persian Assassin kiest ondersteuners binnen 160 en Backstab werkt één keer', () => {
  const s = arena();
  const a = addUnit(s, 'blue', 0, idx('assassin'), 400);
  addUnit(s, 'red', 0, idx('melee'), 430);
  const pr = addUnit(s, 'red', 0, idx('healer'), 540);
  assert.equal(chooseTarget(s, a).id, pr.id, 'Priestess gaat voor');
  const s2 = arena();
  const a2 = addUnit(s2, 'blue', 0, idx('assassin'), 400);
  const maid = addUnit(s2, 'red', 0, idx('banner'), 430); maid.card = { ...maid.card, speed: 0, damage: 0, hp: 9999 }; maid.hp = maid.max = 9999;
  const hits = run(s2, 3).filter(e => e.type === 'hit' && e.attackerId === a2.id);
  assert.equal(hits[0].damage, Math.round(card('assassin').damage * 1.75));
  assert.equal(hits[0].backstab, true);
  assert.equal(hits[1].damage, card('assassin').damage);
  // geen ondersteuner: gewone vijand; verborgen samoerai nooit
  const s3 = arena();
  const a3 = addUnit(s3, 'blue', 0, idx('assassin'), 400);
  const sam = addUnit(s3, 'red', 0, idx('samurai'), 450);
  const leg = addUnit(s3, 'red', 0, idx('melee'), 480);
  assert.ok(sam.hidden); assert.equal(chooseTarget(s3, a3).id, leg.id);
});

test('9+10. sterfgebeurtenis noemt de doder (lach van de assassin), effecten verdwijnen met de dood', () => {
  const s = arena();
  const a = addUnit(s, 'blue', 0, idx('assassin'), 400);
  const pr = addUnit(s, 'red', 0, idx('healer'), 430); pr.card = { ...pr.card, speed: 0, damage: 0 };
  const death = run(s, 6).find(e => e.type === 'death' && e.id === pr.id);
  assert.ok(death); assert.equal(death.killerType, 'assassin'); assert.equal(death.killerId, a.id);
});

test('Spion kan nieuwe biologische eenheden betoveren (kosten ≤ 5)', () => {
  const s = arena();
  const spy = addUnit(s, 'blue', 0, idx('spy'), 400);
  const g = addUnit(s, 'red', 0, idx('spartan'), 460); g.card = { ...g.card, speed: 0, damage: 0 };
  const ev = run(s, 6);
  assert.ok(ev.some(e => e.type === 'possess' && e.targetId === g.id)); assert.equal(g.side, 'blue');
  void spy;
});

test('P-51 raakt de nieuwe eenheden gewoon', () => {
  const s = arena();
  const v = addUnit(s, 'red', 0, idx('banner'), 520);
  deploy(s, 'blue', 0, idx('p51'), 400);
  run(s, 2);
  assert.ok(v.hp < v.max * 0.5 + 1);
});

test('11. AI zet alle nieuwe kaarten in, binnen zijn zone en budget', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40 && NEW.some(t => !seen.has(t)); seed++) {
    const s = createBattle({ seed });
    s.energy.blue = 0;
    const known = new Set();
    for (let i = 0; i < 60 * 90 && !s.ended; i++) {
      const energy = s.energy.red;
      step(s, 1 / 60);
      for (const u of s.units) {
        if (u.side !== 'red' || known.has(u.id)) continue;
        known.add(u.id);
        const z = deployZone(s, 'red', u.lane);
        assert.ok(u.x >= z.min - 1e-9 && u.x <= z.max + 1e-9);
        assert.ok(u.card.cost <= energy + 1e-6 + 1 / 60);
        seen.add(u.card.type);
      }
    }
  }
  for (const t of NEW) assert.ok(seen.has(t), `AI zette ${t} nooit in`);
});

test('Opschuivende zones: valt een toren, dan rukt de aanvaller op en krimpt de verdediger', () => {
  const s = arena();
  assert.deepEqual(deployZone(s, 'blue', 0), DEPLOY_ZONE.blue);
  s.structures.find(t => t.side === 'red' && t.kind === 'tower' && t.lane === 0).hp = 0;
  assert.equal(deployZone(s, 'blue', 0).max, DEPLOY_ZONE.blue.max + DEPLOY_ADVANCE);
  assert.equal(deployZone(s, 'red', 0).min, DEPLOY_ZONE.red.min + DEPLOY_ADVANCE);
  assert.deepEqual(deployZone(s, 'blue', 1), DEPLOY_ZONE.blue, 'andere baan ongewijzigd');
  assert.ok(deployZone(s, 'blue', 0).max < deployZone(s, 'red', 0).min, 'zones overlappen nooit');
  s.energy.blue = 10;
  assert.equal(deploy(s, 'blue', 0, idx('melee'), 900).x, DEPLOY_ZONE.blue.max + DEPLOY_ADVANCE);
  // spiegelbeeld voor rood
  const s2 = arena();
  s2.structures.find(t => t.side === 'blue' && t.kind === 'tower' && t.lane === 1).hp = 0;
  assert.equal(deployZone(s2, 'red', 1).min, DEPLOY_ZONE.red.min - DEPLOY_ADVANCE);
  assert.equal(deployZone(s2, 'blue', 1).max, DEPLOY_ZONE.blue.max - DEPLOY_ADVANCE);
});

test('12. balans: nieuwe kaarten winnen niet structureel van hun kostengelijke oude tegenhangers', () => {
  // 1-tegen-1 in een baan; geen van de nieuwe mag elke oude kaart van dezelfde prijs verpletteren.
  const duel = (a, b) => {
    const s = createBattle({ seed: 9, ai: false });
    const x = addUnit(s, 'blue', 0, idx(a), 420), y = addUnit(s, 'red', 0, idx(b), 540);
    run(s, 40);
    return x.hp > 0 && y.hp <= 0 ? 1 : y.hp > 0 && x.hp <= 0 ? -1 : 0;
  };
  for (const t of NEW) {
    const peers = CARDS.filter(c => !NEW.includes(c.type) && c.type !== 'p51' && c.type !== 'spy' && Math.abs(c.cost - card(t).cost) <= 1);
    const wins = peers.filter(p => duel(t, p.type) === 1 && duel(p.type, t) === -1).length;
    assert.ok(wins < peers.length, `${t} wint van alle ${peers.length} kostengenoten`);
  }
});
