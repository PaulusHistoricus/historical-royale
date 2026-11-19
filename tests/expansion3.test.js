// Unit expansion 3: Modern Sniper, Mark IV Tank (armored), Bazooka Trooper, Combat Medic,
// Artillery Barrage, Field Hospital.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, ARMOR } from '../src/sim/config.js';
import { createBattle, addUnit, deploy, step, deployZone } from '../src/sim/battle.js';

const idx = type => CARDS.findIndex(c => c.type === type);
const card = type => CARDS[idx(type)];
const arena = () => createBattle({ seed: 5, ai: false });
const run = (s, seconds) => { const ev = []; for (let i = 0; i < seconds * 60 && !s.ended; i++) ev.push(...step(s, 1 / 60)); return ev; };
const still = u => { u.card = { ...u.card, speed: 0, damage: 0 }; return u; };
const NEW = ['sniper', 'tank', 'bazooka', 'medic', 'barrage', 'hospital'];

test('kosten en plaatsen kost energie (ook voor barrage en hospitaal)', () => {
  const want = { sniper: 5, tank: 7, bazooka: 4, medic: 3, barrage: 6, hospital: 4 };
  for (const t of NEW) {
    assert.equal(card(t).cost, want[t], t);
    const s = arena(); s.energy.blue = 10;
    assert.ok(deploy(s, 'blue', 0, idx(t), 400), t);
    assert.equal(s.energy.blue, 10 - want[t]);
    s.energy.blue = want[t] - 0.5;
    assert.equal(deploy(s, 'blue', 0, idx(t), 400), null);
  }
});

test('sniper: één zwaar schot en dan lang herladen', () => {
  const s = arena();
  const sn = addUnit(s, 'blue', 0, idx('sniper'), 400); sn.card = { ...sn.card, speed: 0 };
  const t = still(addUnit(s, 'red', 0, idx('berserker'), 520)); t.hp = t.max = 5000;
  const hits = run(s, 5).filter(e => e.type === 'hit' && e.attackerId === sn.id);
  assert.equal(hits.length, 2);                       // t≈0 en t≈4
  assert.equal(hits[0].damage, card('sniper').damage);
});

test('tank is gepantserd: gewone aanvallen 30 %, gebouwen 50 %, kanon vol, bazooka x4', () => {
  const dmgFrom = (type, armorPct) => {
    const s = arena();
    const tank = still(addUnit(s, 'red', 0, idx('tank'), 520)); tank.hp = tank.max = 99999;
    const a = addUnit(s, 'blue', 0, idx(type), 400); a.card = { ...a.card, speed: 0, range: 200 };
    const h = run(s, 4).find(e => e.type === 'hit' && e.attackerId === a.id);
    assert.ok(h, type);
    assert.ok(Math.abs(h.damage - card(type).damage * armorPct) < 1e-9, `${type}: ${h.damage}`);
  };
  dmgFrom('musket', ARMOR.normal);
  dmgFrom('archer', ARMOR.normal);
  dmgFrom('cannon', 1);
  dmgFrom('bazooka', card('bazooka').antiArmor);
  const s = arena();
  const tank = still(addUnit(s, 'blue', 0, idx('tank'), 700)); tank.hp = tank.max = 99999;
  const tw = run(s, 2).find(e => e.type === 'hit' && e.attackerId === 'tower-red-0');
  assert.equal(tw.damage, 32 * ARMOR.structure);
});

test('bazooka doet normale schade tegen niet-gepantserde eenheden; P-51 raakt de tank gewoon', () => {
  const s = arena();
  const b = addUnit(s, 'blue', 0, idx('bazooka'), 400); b.card = { ...b.card, speed: 0 };
  const t = still(addUnit(s, 'red', 0, idx('melee'), 500)); t.hp = t.max = 5000;
  const h = run(s, 1).find(e => e.type === 'hit' && e.attackerId === b.id);
  assert.equal(h.damage, card('bazooka').damage);
  const s2 = arena();
  const tank = still(addUnit(s2, 'red', 0, idx('tank'), 520));
  deploy(s2, 'blue', 0, idx('p51'), 400); run(s2, 2);
  assert.ok(tank.hp <= tank.max * 0.5 + 1);
});

test('medic rent naar de gewondste bondgenoot, geneest doorlopend, valt niet aan, wacht bij niemand gewond', () => {
  const s = arena();
  const medic = addUnit(s, 'blue', 0, idx('medic'), 300);
  const hurt = still(addUnit(s, 'blue', 0, idx('melee'), 400)); hurt.hp = 100;
  const other = still(addUnit(s, 'blue', 1, idx('melee'), 310)); other.hp = 50;   // andere baan: niet
  const ev = run(s, 4);
  assert.ok(hurt.hp > 100, 'genezen');
  assert.equal(other.hp, 50);
  assert.ok(!ev.some(e => e.type === 'hit' && e.attackerId === medic.id));
  const perSec = ev.filter(e => e.type === 'heal' && e.attackerId === medic.id).length / 4;
  assert.ok(perSec >= 1 && perSec <= 2.1);
  // zwakker dan de Priestess bij dezelfde patiënt
  const p = createBattle({ seed: 5, ai: false });
  addUnit(p, 'blue', 0, idx('healer'), 380);
  const h2 = still(addUnit(p, 'blue', 0, idx('melee'), 400)); h2.hp = 100;
  run(p, 4);
  assert.ok(hurt.hp < h2.hp + 20, `medic ${hurt.hp} vs priestess ${h2.hp}`);
  // niemand gewond: blijft achter de voorste bondgenoot
  hurt.hp = hurt.max; run(s, 3);
  assert.ok(Math.abs(medic.x - (hurt.x - card('medic').followGap)) < 2);
  assert.equal(medic.state, 'idle');
});

test('artillerie: granaten na de vertraging op de gekozen plek, raken vijanden en gebouwen, niet eigen eenheden', () => {
  const s = arena();
  const foe = still(addUnit(s, 'red', 0, idx('melee'), 700)); foe.hp = foe.max = 9999;
  const friend = still(addUnit(s, 'blue', 0, idx('melee'), 700)); friend.hp = friend.max = 9999;
  const tower = s.structures.find(t => t.id === 'tower-red-0');
  s.energy.blue = 10;
  deploy(s, 'blue', 0, idx('barrage'), 715);
  let ev = run(s, 1.4);
  assert.equal(ev.filter(e => e.type === 'shell').length, 0, 'nog niets voor de vertraging');
  ev = run(s, 2);
  assert.equal(ev.filter(e => e.type === 'shell').length, card('barrage').shells);
  assert.ok(foe.hp < foe.max);
  assert.ok(!ev.some(e => e.kind === 'barrage' && e.targetId === friend.id), 'eigen eenheid niet geraakt');
  assert.ok(tower.hp < tower.max && tower.hp >= tower.max - card('barrage').shells * card('barrage').structureDamage);
  assert.equal(s.barrages.length, 0);
});

test('veldhospitaal geneest biologische bondgenoten in de buurt en verdwijnt na zijn levensduur', () => {
  const s = arena();
  const h = deploy(s, 'blue', 0, idx('hospital'), 400);
  const a = still(addUnit(s, 'blue', 0, idx('melee'), 430)); a.hp = 50;
  const far = still(addUnit(s, 'blue', 0, idx('melee'), 300)); far.hp = 50;
  const cannon = still(addUnit(s, 'blue', 0, idx('cannon'), 410)); cannon.hp = 50;
  run(s, 3);
  assert.ok(a.hp > 50); assert.equal(far.hp, 50); assert.equal(cannon.hp, 50);
  assert.equal(h.x, 400);
  const ev = run(s, card('hospital').lifetime);
  assert.ok(ev.some(e => e.type === 'death' && e.id === h.id));
  assert.ok(!s.units.includes(h));
});

test('assassin jaagt ook op de medic', () => {
  const s = arena();
  const as = addUnit(s, 'blue', 0, idx('assassin'), 400);
  addUnit(s, 'red', 0, idx('melee'), 440);
  const m = addUnit(s, 'red', 0, idx('medic'), 520);
  run(s, 1 / 60);
  assert.equal(as.targetId, m.id);
});

test('AI zet de nieuwe kaarten in; barrage mikt op blauw', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 60 && NEW.some(t => !seen.has(t)); seed++) {
    const s = createBattle({ seed });
    const known = new Set();
    for (let i = 0; i < 60 * 120 && !s.ended; i++) {
      if (i % 600 === 0) { s.energy.blue = 10; deploy(s, 'blue', i % 1200 ? 1 : 0, idx('melee'), 400); }
      const before = s.barrages.length;
      step(s, 1 / 60);
      if (s.barrages.length > before) {
        const b = s.barrages.at(-1);
        if (b.side === 'red') {
          seen.add('barrage');
          const target = s.units.some(u => u.side === 'blue' && u.lane === b.lane && Math.abs(u.x - b.x) < 1) ||
            s.structures.some(t => t.side === 'blue' && Math.abs(t.x - b.x) < 1);
          assert.ok(target, `barrage op ${b.x} mikt niet op blauw`);
        }
      }
      for (const u of s.units) {
        if (known.has(u.id)) continue;
        known.add(u.id);                  // ook blauwe: een betoverde blauwe eenheid telt niet als rode inzet
        if (u.side !== 'red') continue;
        seen.add(u.card.type);
        const z = deployZone(s, 'red', u.lane);
        assert.ok(u.x >= z.min - 1e-9 && u.x <= z.max + 1e-9);
      }
    }
  }
  for (const t of NEW) assert.ok(seen.has(t), `AI zette ${t} nooit in`);
});

test('twee bazooka\'s (8 energie) verslaan een tank (7)', () => {
  const s = arena();
  const tank = addUnit(s, 'red', 0, idx('tank'), 560);
  const b1 = addUnit(s, 'blue', 0, idx('bazooka'), 420), b2 = addUnit(s, 'blue', 0, idx('bazooka'), 400);
  run(s, 10);
  assert.ok(tank.hp <= 0 && (b1.hp > 0 || b2.hp > 0));
});
