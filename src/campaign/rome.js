// The Conquest — wereld 1: RISE OF ROME. Alleen gegevens; de regels staan in campaign.js.
//
// Vaste id's (rome_001 … rome_025, rome_bonus_01/02): nooit hernummeren, opgeslagen voortgang
// hangt eraan. Een nieuwe wereld is een nieuw bestand naast dit bestand, geregistreerd in campaign.js.
//
// Per missie:
//   seg, x, y   plek op de kaart, in bronpixels van kaartsegment 1..3 (art/source/conquest-rome-N.png)
//   goal        'castle' | 'towers' | 'survive'   (zie battleRules in src/sim/battle.js)
//   time        tijdslimiet in seconden
//   enemy       { deck: kaarttypes, level: kaartniveau 1..6, tempo, start?, rate? }
//   player      { rate? }  beperking voor de speler (optioneel)
//   stars       drie voorwaarden: 'win', 'towers2' (beide eigen torens staan), 'tower1' (minstens één),
//               'time:N' (gewonnen binnen N seconden), 'castle:N' (eigen kasteel ≥ N % levenspunten)
//   after       id van de missie die eerst gehaald moet zijn (standaard: de vorige in de lijst)
const m = (n, title, seg, x, y, goal, time, enemy, stars, brief, extra = {}) =>
  ({ id: 'rome_' + String(n).padStart(3, '0'), n, title, seg, x, y, goal, time, enemy, stars, brief, ...extra });

export const ROME = {
  id: 'rome',
  title: 'RISE OF ROME',
  regions: ['Latium', 'The Frontier', 'Rome'],
  // Arena per gebied (textuursleutels: 'arena' = de klassieke arena, de rest uit src/art/arenas.json).
  // Een missie kan dit overschrijven met `arena: '<sleutel>'`.
  arenas: ['arena', 'arena-sunset', 'arena-rome'],
  missions: [
    // --- Segment 1: Latium ---
    m(1, 'First Steps', 1, 110, 395, 'castle', 240, { deck: ['melee'], level: 1, tempo: 0.5 },
      ['win', 'towers2', 'time:150'], 'A band of raiders blocks the road. Break through their castle.'),
    m(2, 'Arrows over Latium', 1, 330, 535, 'castle', 240, { deck: ['melee', 'archer'], level: 1, tempo: 0.8 },
      ['win', 'towers2', 'time:150'], 'Enemy archers cover their infantry. Close the distance.'),
    m(3, 'Hold the Farm', 1, 560, 480, 'survive', 120, { deck: ['melee', 'archer', 'cavalry'], level: 1, tempo: 0.6 },
      ['win', 'tower1', 'towers2'], 'Protect the harvest until reinforcements arrive.'),
    m(4, 'The Old Road', 1, 790, 385, 'towers', 200, { deck: ['melee', 'archer', 'berserker'], level: 1, tempo: 0.7 },
      ['win', 'towers2', 'time:140'], 'Two watchtowers guard the road. Bring both down.'),
    m(5, 'Cavalry Raid', 1, 1010, 435, 'castle', 240, { deck: ['cavalry', 'lancer', 'horse_archer'], level: 1, tempo: 1 },
      ['win', 'towers2', 'time:160'], 'Fast riders strike before you can react. Be ready.'),
    m(6, 'The Stone Bridge', 1, 1230, 385, 'castle', 240, { deck: ['melee', 'archer', 'cannon', 'spartan'], level: 1, tempo: 0.7 },
      ['win', 'towers2', 'time:170'], 'A shield wall holds the bridge. Find a way through.'),
    m(7, 'Siege Engines', 1, 1480, 385, 'towers', 210, { deck: ['cannon', 'melee', 'musket'], level: 1, tempo: 0.8 },
      ['win', 'towers2', 'time:150'], 'Their cannons outrange you. Take the towers quickly.'),
    m(8, 'Gate of Latium', 1, 1730, 315, 'castle', 240, { deck: ['melee', 'archer', 'cavalry', 'cannon', 'healer'], level: 1, tempo: 1, start: 8 },
      ['win', 'towers2', 'time:180'], 'The last garrison of Latium. They start the battle prepared.'),
    // --- Segment 2: The Frontier ---
    m(9, 'Under the Aqueduct', 2, 90, 368, 'castle', 240, { deck: ['archer', 'musket', 'spartan', 'healer'], level: 1, tempo: 0.7 },
      ['win', 'towers2', 'time:180'], 'Marksmen behind a Spartan line, healed from the rear.'),
    m(10, 'Warlord of the Hills', 2, 290, 440, 'castle', 240, { deck: ['berserker', 'cavalry', 'cannon', 'banner', 'melee'], level: 2, tempo: 0.7, start: 10, rate: 1.1 },
      ['win', 'tower1', 'towers2'], 'A warlord rallies the hill tribes. Expect a furious assault.', { boss: true }),
    m(11, 'Night Watch', 2, 490, 432, 'survive', 150, { deck: ['samurai', 'assassin', 'cavalry', 'berserker'], level: 2, tempo: 0.9 },
      ['win', 'tower1', 'towers2'], 'Shadows move in the dark. Keep your castle standing until dawn.'),
    m(12, 'Plague in the Vineyards', 2, 690, 362, 'castle', 240, { deck: ['plague', 'healer', 'melee', 'archer'], level: 2, tempo: 1 },
      ['win', 'towers2', 'time:180'], 'Poison spreads through tight formations. Spread out.'),
    m(13, 'The Lancers', 2, 890, 378, 'towers', 210, { deck: ['lancer', 'horse_archer', 'cavalry', 'banner'], level: 2, tempo: 1.3 },
      ['win', 'towers2', 'time:150'], 'A cavalry host under a war banner. Take their towers.'),
    m(14, 'Fire on the Road', 2, 1090, 430, 'castle', 240, { deck: ['firethrower', 'flamegi', 'melee', 'spartan'], level: 1, tempo: 0.8 },
      ['win', 'towers2', 'time:180'], 'Everything burns. Do not march in clusters.'),
    m(15, 'Forest Ambush', 2, 1290, 396, 'castle', 240, { deck: ['samurai', 'assassin', 'spy', 'archer'], level: 2, tempo: 1.3 },
      ['win', 'towers2', 'time:180'], 'Hidden blades and turncoats wait among the trees.'),
    m(16, 'The Legion Camp', 2, 1490, 335, 'castle', 240, { deck: ['melee', 'spartan', 'banner', 'archer', 'cannon', 'healer'], level: 3, tempo: 0.7 },
      ['win', 'towers2', 'time:190'], 'A disciplined legion, drilled and well supplied.'),
    m(17, 'Supply Lines', 2, 1700, 325, 'survive', 180, { deck: ['cavalry', 'lancer', 'horse_archer', 'berserker', 'flamegi'], level: 3, tempo: 0.7 },
      ['win', 'tower1', 'towers2'], 'Raiders hunt your wagons. Hold out for three minutes.'),
    // --- Segment 3: Rome ---
    m(18, 'The Mountain Pass', 3, 130, 372, 'castle', 240, { deck: ['spartan', 'musket', 'cannon', 'healer'], level: 3, tempo: 0.6 },
      ['win', 'towers2', 'time:190'], 'A narrow pass, held by guns behind heavy shields.'),
    m(19, 'Walls of Rome', 3, 340, 482, 'towers', 220, { deck: ['archer', 'musket', 'cannon', 'spartan', 'plague'], level: 3, tempo: 1.1 },
      ['win', 'towers2', 'time:160'], 'The outer walls are lined with towers. Tear them down.'),
    m(20, 'Champion of the Arena', 3, 560, 448, 'castle', 240, { deck: ['berserker', 'samurai', 'spartan', 'banner', 'healer', 'lancer'], level: 4, tempo: 0.6, start: 10, rate: 1.15 },
      ['win', 'tower1', 'towers2'], 'The champion of the Colosseum and his finest fighters.', { boss: true }),
    m(21, 'Streets of the City', 3, 790, 478, 'castle', 240, { deck: ['assassin', 'spy', 'firethrower', 'melee', 'archer'], level: 3, tempo: 0.9 },
      ['win', 'towers2', 'time:190'], 'Every alley hides a knife. Watch your support units.'),
    m(22, "The Senate's Guard", 3, 1010, 498, 'castle', 240, { deck: ['spartan', 'banner', 'healer', 'musket', 'cavalry'], level: 4, tempo: 0.7 },
      ['win', 'towers2', 'time:200'], 'The elite guard of the Senate does not break easily.'),
    m(23, 'The Great Bridge', 3, 1260, 428, 'towers', 220, { deck: ['cannon', 'flamegi', 'archer', 'lancer', 'plague'], level: 4, tempo: 1.1 },
      ['win', 'towers2', 'time:170'], 'One bridge leads to the fortress. Take both towers to cross.'),
    m(24, 'Storm the Cliffs', 3, 1600, 365, 'survive', 200, { deck: ['berserker', 'samurai', 'lancer', 'flamegi', 'cannon', 'assassin'], level: 3, tempo: 0.7, rate: 1.1 },
      ['win', 'tower1', 'towers2'], 'The fortress empties its barracks. Survive the counter-attack.'),
    m(25, 'The Dark Fortress', 3, 1650, 205, 'castle', 240,
      { deck: ['spartan', 'banner', 'healer', 'cannon', 'musket', 'lancer', 'samurai', 'plague', 'flamegi', 'p51'], level: 4, tempo: 0.8, start: 10, rate: 1.2 },
      ['win', 'tower1', 'towers2'], 'The tyrant waits behind burning walls. End this war.', { boss: true }),
    // --- Bonusmissies (zijpaden) ---
    { id: 'rome_bonus_01', n: 'B1', bonus: true, title: 'The Hidden Temple', seg: 1, x: 640, y: 265, goal: 'castle', time: 200,
      enemy: { deck: ['healer', 'samurai', 'spartan', 'archer'], level: 2, tempo: 0.6 }, player: { rate: 0.8 },
      stars: ['win', 'towers2', 'time:160'], brief: 'Temple guards drain your strength: your energy returns more slowly.', after: 'rome_005' },
    { id: 'rome_bonus_02', n: 'B2', bonus: true, title: 'Raid on the War Camp', seg: 2, x: 1420, y: 570, goal: 'towers', time: 180,
      enemy: { deck: ['spartan', 'cannon', 'musket', 'banner', 'cavalry'], level: 4, tempo: 0.7, start: 8 },
      stars: ['win', 'towers2', 'time:130'], brief: 'Strike the camp before the alarm is raised. Three minutes, two towers.', after: 'rome_015' },
  ],
};
