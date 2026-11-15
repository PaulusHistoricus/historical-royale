import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARDS } from '../src/sim/config.js';
import { levelInfo, CARD_TYPES, DEFAULT_DECK, UPGRADE_COST, MAX_CARD_LEVEL, cardLevelMultiplier } from '../src/progression.js';
import { createBattle, addUnit, step } from '../src/sim/battle.js';

const php = readFileSync(new URL('../public/api/_game.php', import.meta.url), 'utf8');
const phpList = name => [...php.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`))[1].matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]);

test('kaartsoorten, standaarddeck en upgradekosten gelijk in spel, simulatie en server', () => {
  assert.deepEqual(CARD_TYPES, CARDS.map(c => c.type));
  assert.deepEqual(phpList('CARD_TYPES'), CARD_TYPES);
  assert.deepEqual(phpList('DEFAULT_DECK'), DEFAULT_DECK);
  for (const [lvl, [f, c]] of Object.entries(UPGRADE_COST)) assert.match(php, new RegExp(`${lvl} => \\[${f}, ${c}\\]`));
  assert.match(php, new RegExp(`const MAX_CARD_LEVEL = ${MAX_CARD_LEVEL};`));
  assert.match(php, /function xpForNext\(int \$level\): int \{ return 100 \+ 50 \* \(\$level - 1\); \}/);
});

test('niveaus uit XP', () => {
  assert.deepEqual(levelInfo(0), { level: 1, xpInLevel: 0, xpForNext: 100 });
  assert.deepEqual(levelInfo(150), { level: 2, xpInLevel: 50, xpForNext: 150 });
  assert.deepEqual(levelInfo(100 + 150 + 200), { level: 4, xpInLevel: 0, xpForNext: 250 });
  assert.equal(levelInfo(10 ** 9).level, 50);
});

test('kaartniveau maakt eenheden sterker, alleen voor die kant', () => {
  const s = createBattle({ ai: false, cardLevels: { blue: { melee: 3 }, red: {} } });
  const b = addUnit(s, 'blue', 0, 0, 400), r = addUnit(s, 'red', 0, 0, 600);
  assert.equal(b.max, Math.round(CARDS[0].hp * cardLevelMultiplier(3)));
  assert.equal(b.card.damage, Math.round(CARDS[0].damage * 1.2));
  assert.equal(r.card, CARDS[0], 'niveau 1 = ongewijzigde kaart');
  let s2 = createBattle({ ai: false, cardLevels: { blue: { melee: 6 }, red: {} } });
  const strong = addUnit(s2, 'blue', 0, 0, 400); addUnit(s2, 'red', 0, 0, 600);
  for (let i = 0; i < 60 * 30 && s2.units.length > 1; i++) step(s2, 1 / 60);
  assert.ok(s2.units.includes(strong), 'niveau 6 wint van niveau 1');
});
