// The Conquest — wereld 2: AGE OF KNIGHTS. Alleen gegevens; de regels staan in campaign.js.
// Zelfde opzet als rome.js (zie daar de velden). Vrij te spelen na de laatste missie van Rise of Rome.
//
// Vaste id's (knights_001 … knights_025, knights_bonus_01/02): nooit hernummeren.
// Kaart: art/source/knights-map-1..3.png. De meeste missies staan op een geschilderde rondje.
// Bazen (`bossId` -> portret public/assets/art/boss-<id>.webp): nu nog een sterkere computer;
// de eigen regel per baas (zie het ontwerpdocument) komt met hun spritesheets.
const m = (n, title, seg, x, y, goal, time, enemy, stars, brief, extra = {}) =>
  ({ id: 'knights_' + String(n).padStart(3, '0'), n, title, seg, x, y, goal, time, enemy, stars, brief, ...extra });

export const KNIGHTS = {
  id: 'knights',
  title: 'AGE OF KNIGHTS',
  regions: ['The Borderlands', 'The High Keep', 'The Frozen Ruins'],
  arenas: ['arena-meadow', 'arena-winter', 'arena-ruins'],
  card: 'world-knights',                 // wereldkaart op het keuzescherm (src/art/conquest.json)
  missions: [
    // --- Segment 1: The Borderlands ---
    m(1, 'The Border Road', 1, 162, 540, 'castle', 240, { deck: ['melee', 'archer', 'cavalry', 'lancer'], level: 3, tempo: 0.7 },
      ['win', 'towers2', 'time:160'], 'A new age, a new enemy. Knights guard the road into their lands.', { after: 'rome_025' }),
    m(2, 'Village Militia', 1, 305, 505, 'castle', 240, { deck: ['melee', 'archer', 'healer', 'banner'], level: 3, tempo: 1.1 },
      ['win', 'towers2', 'time:160'], 'Farmers with spears and a war banner. Do not let them rally.'),
    m(3, 'The Windmill', 1, 450, 485, 'survive', 150, { deck: ['cavalry', 'lancer', 'archer', 'berserker'], level: 3, tempo: 1 },
      ['win', 'tower1', 'towers2'], 'Raiders want the grain. Hold the windmill until the harvest is in.'),
    m(4, 'Lances at Dawn', 1, 630, 545, 'towers', 210, { deck: ['lancer', 'cavalry', 'banner', 'spartan'], level: 3, tempo: 1.1 },
      ['win', 'towers2', 'time:150'], 'Mounted knights charge at first light. Break their towers.'),
    m(5, 'The River Crossing', 1, 815, 530, 'castle', 240, { deck: ['archer', 'musket', 'cannon', 'spartan'], level: 3, tempo: 0.6 },
      ['win', 'towers2', 'time:170'], 'Crossbows and guns cover the ford. Get your men across.'),
    m(6, 'The Old Bridge', 1, 1010, 465, 'castle', 240, { deck: ['spartan', 'melee', 'healer', 'archer', 'banner'], level: 3, tempo: 0.9 },
      ['win', 'towers2', 'time:180'], 'A shield wall on the bridge, priests behind it. Find the gap.'),
    m(7, 'Fields of Fire', 1, 1375, 358, 'castle', 240, { deck: ['firethrower', 'flamegi', 'melee', 'cavalry'], level: 3, tempo: 1.2 },
      ['win', 'towers2', 'time:170'], 'They burn the fields as they come. Spread your troops.'),
    m(8, 'Gate of the Borderlands', 1, 1720, 340, 'castle', 240, { deck: ['lancer', 'cavalry', 'spartan', 'banner', 'cannon', 'healer'], level: 4, tempo: 0.7, start: 8 },
      ['win', 'towers2', 'time:190'], 'The border fort is ready for you. They start the battle prepared.'),
    // --- Segment 2: The High Keep ---
    m(9, 'Market Day', 2, 90, 378, 'castle', 240, { deck: ['assassin', 'spy', 'melee', 'archer'], level: 3, tempo: 1.2 },
      ['win', 'towers2', 'time:180'], 'Cutpurses and turncoats in the crowd. Guard your healers.'),
    m(10, 'The Black Knight', 2, 265, 447, 'castle', 240, { deck: ['spartan', 'lancer', 'melee', 'banner', 'cannon'], level: 4, tempo: 0.8, start: 10, rate: 1.1 },
      ['win', 'tower1', 'towers2'], 'A knight in black armour blocks the way. No one has ever passed him.', { boss: true, bossId: 'black-knight' }),
    m(11, 'The Pilgrims’ Path', 2, 540, 440, 'survive', 160, { deck: ['samurai', 'assassin', 'cavalry', 'berserker'], level: 4, tempo: 0.7 },
      ['win', 'tower1', 'towers2'], 'Bandits stalk the mountain path. Keep the castle standing.'),
    m(12, 'Tournament of Steel', 2, 728, 372, 'castle', 240, { deck: ['lancer', 'cavalry', 'horse_archer', 'banner', 'healer'], level: 4, tempo: 0.9 },
      ['win', 'towers2', 'time:180'], 'The finest riders of the realm. Lances everywhere.'),
    m(13, 'The Gatehouse', 2, 1062, 357, 'towers', 210, { deck: ['archer', 'musket', 'cannon', 'spartan', 'healer'], level: 4, tempo: 0.7 },
      ['win', 'towers2', 'time:160'], 'Archers on the walls. Bring down both gate towers.'),
    m(14, 'Falls of Ardenne', 2, 1200, 313, 'castle', 240, { deck: ['plague', 'healer', 'melee', 'archer', 'banner'], level: 4, tempo: 1.2 },
      ['win', 'towers2', 'time:190'], 'Sickness spreads through the camp by the falls. Stay apart.'),
    m(15, 'Siege of the High Keep', 2, 1355, 322, 'towers', 220, { deck: ['cannon', 'spartan', 'archer', 'musket', 'banner'], level: 5, tempo: 0.8 },
      ['win', 'towers2', 'time:170'], 'The keep itself. Its towers have never fallen.'),
    m(16, 'Knights of the Lily', 2, 1485, 383, 'castle', 240, { deck: ['spartan', 'lancer', 'banner', 'healer', 'cavalry'], level: 5, tempo: 0.7 },
      ['win', 'towers2', 'time:190'], 'The order of the lily rides out in full armour.'),
    m(17, 'Night Raid', 2, 1640, 440, 'survive', 180, { deck: ['assassin', 'samurai', 'spy', 'berserker', 'flamegi'], level: 4, tempo: 0.8 },
      ['win', 'tower1', 'towers2'], 'Fire and knives in the dark. Hold out until dawn.'),
    m(18, 'The Northern Pass', 2, 1790, 410, 'castle', 240, { deck: ['berserker', 'lancer', 'cannon', 'horse_archer', 'healer'], level: 5, tempo: 0.6 },
      ['win', 'towers2', 'time:200'], 'The road north climbs into the snow. Something waits in the ruins.'),
    // --- Segment 3: The Frozen Ruins ---
    m(19, 'Snowbound', 3, 135, 415, 'castle', 240, { deck: ['spartan', 'musket', 'healer', 'banner', 'archer'], level: 5, tempo: 0.8 },
      ['win', 'towers2', 'time:200'], 'Frozen soldiers who will not retreat. Keep pushing.'),
    m(20, 'Malvrac the Plague Lord', 3, 690, 488, 'castle', 240, { deck: ['plague', 'healer', 'berserker', 'flamegi', 'melee', 'spy'], level: 5, tempo: 0.9, start: 10, rate: 1.15 },
      ['win', 'tower1', 'towers2'], 'A masked lord spreads plague through the ruins. Do not let it reach your lines.', { boss: true, bossId: 'plague-lord' }),
    m(21, 'The Falls', 3, 825, 488, 'towers', 220, { deck: ['archer', 'horse_archer', 'cannon', 'lancer', 'spartan'], level: 5, tempo: 0.6 },
      ['win', 'towers2', 'time:170'], 'Towers above the falls command the only path.'),
    m(22, 'Cliffs of the Crown', 3, 1140, 440, 'castle', 240, { deck: ['lancer', 'cavalry', 'banner', 'cannon', 'musket', 'healer'], level: 4, tempo: 0.9 },
      ['win', 'towers2', 'time:200'], 'The king’s cavalry guards the cliffs.'),
    m(23, 'The Burning Chapel', 3, 1357, 428, 'castle', 240, { deck: ['firethrower', 'flamegi', 'plague', 'spartan', 'healer'], level: 5, tempo: 0.8 },
      ['win', 'towers2', 'time:200'], 'Fire and plague at the old chapel. Use the gaps between the flames.'),
    m(24, 'Last Stand in the Snow', 3, 1530, 350, 'survive', 200, { deck: ['berserker', 'samurai', 'lancer', 'flamegi', 'cannon', 'assassin'], level: 4, tempo: 0.7, rate: 1.1 },
      ['win', 'tower1', 'towers2'], 'The king sends everything he has. Survive.'),
    m(25, 'King Aldric', 3, 1715, 298, 'castle', 240,
      { deck: ['spartan', 'banner', 'healer', 'cannon', 'lancer', 'cavalry', 'musket', 'plague', 'flamegi', 'p51'], level: 5, tempo: 1.2, start: 10, rate: 1.2 },
      ['win', 'tower1', 'towers2'], 'The Iron King waits in the ruins of his fathers. End his reign.', { boss: true, bossId: 'iron-king' }),
    // --- Bonusmissies (zijpaden) ---
    { id: 'knights_bonus_01', n: 'B1', bonus: true, title: 'The Miller’s Secret', seg: 1, x: 520, y: 360, goal: 'castle', time: 200,
      enemy: { deck: ['spy', 'assassin', 'healer', 'archer'], level: 4, tempo: 1.3 }, player: { rate: 0.8 },
      stars: ['win', 'towers2', 'time:160'], brief: 'Spies meet in the old mill. Your energy returns more slowly here.', after: 'knights_005' },
    { id: 'knights_bonus_02', n: 'B2', bonus: true, title: 'The Royal Treasury', seg: 2, x: 330, y: 600, goal: 'towers', time: 180,
      enemy: { deck: ['spartan', 'cannon', 'musket', 'banner', 'lancer'], level: 5, tempo: 1, start: 8 },
      stars: ['win', 'towers2', 'time:130'], brief: 'Raid the treasury before the guard turns out. Three minutes, two towers.', after: 'knights_015' },
  ],
};
