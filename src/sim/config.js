// Alle spelregels en balanswaarden op één plek. Geen Phaser, geen DOM.
//
// AFSTANDEN: gevechten zijn 1-dimensionaal langs de baan (x-as). Elke eenheid
// en elk gebouw heeft een `radius` (halve lichaamsbreedte). Bereik (`range`)
// wordt ALTIJD gemeten van rand tot rand ("gap"), nooit van middelpunt tot
// middelpunt. Er bestaat bewust géén aparte botsings- of contactafstand: een
// eenheid stopt precies wanneer zijn doelwit binnen bereik is. Daardoor kan
// "gestopt maar niet binnen aanvalsbereik" (de bug uit issue #1) niet bestaan.

// Wereld = 960 x 432. Het speelveld (0..FIELD_BOTTOM) volgt de arena-art in
// public/assets/art/arena.jpg; banen, torens en kastelen staan waar ze in de
// art geschilderd zijn. Daaronder zit de kaartenbalk.
export const W = 960;
export const H = 432;
export const LANES = [123, 221];
export const FIELD_BOTTOM = 310;

export const DEPLOY_ZONE = {
  blue: { min: 268, max: 465 },
  red: { min: 495, max: 692 },
};
// Valt een toren, dan schuift in die baan de zone van de aanvaller zoveel op richting de
// tegenstander, en wordt de zone van de verdediger even veel kleiner (zie deployZone()).
export const DEPLOY_ADVANCE = 125;

export const MATCH_SECONDS = 240;
export const OVERTIME_AT = 180;          // daarna vult energie sneller aan
export const ENERGY_START = 6;
export const ENERGY_MAX = 10;
export const ENERGY_SECONDS = 1.35;      // seconden per energiepunt
export const ENERGY_SECONDS_OVERTIME = 0.8;

export const DETECTION_RANGE = 205;      // hoe ver een eenheid vijanden vóór zich opmerkt

export const CARDS = [
  { name: 'Legionary',    type: 'melee', armor: 'medium', attack: 'melee',  role: 'melee', material: 'bio', cost: 3, hp: 190, damage: 29, range: 12,  speed: 56, rate: 0.9, radius: 13 },
  { name: 'Archer', type: 'archer', armor: 'light', attack: 'pierce', role: 'ranged', material: 'bio', cost: 3, hp: 130, damage: 34, range: 120, speed: 46, rate: 1.2, radius: 13 },
  { name: 'Cannon',        type: 'cannon', armor: 'mechanical', attack: 'siege', role: 'siege', material: 'mechanical', cost: 6, hp: 300, damage: 48, range: 106, speed: 22, rate: 3.2, radius: 22 },
  // Tijdperken zijn vrij te combineren: geen beschavingsgebonden legers of bonussen.
  { name: 'Roman Cavalry', type: 'cavalry', armor: 'medium', attack: 'melee', role: 'melee', material: 'bio', cost: 4, hp: 215, damage: 37, range: 15, speed: 110, rate: 1.0, radius: 18, chargeBonus: 39, chargeDistance: 65 },
  { name: 'Viking Berserker', type: 'berserker', armor: 'medium', attack: 'melee', role: 'melee', material: 'bio', cost: 4, hp: 190, damage: 45, range: 14, speed: 66, rate: 0.85, radius: 14, rageMultiplier: 1.45 },
  { name: 'Mongol Horse Archer', type: 'horse_archer', armor: 'light', attack: 'pierce', role: 'ranged', material: 'bio', cost: 5, hp: 155, damage: 29, range: 125, speed: 88, rate: 0.9, radius: 17 },
  { name: 'Musketeer', type: 'musket', armor: 'light', attack: 'pierce', role: 'ranged', material: 'bio', cost: 4, hp: 140, damage: 90, range: 124, speed: 39, rate: 2.8, radius: 13 },
  // Vijf nieuwe kaarten. Speciale P-51 is een eenmalige baan-aanval, geen permanente eenheid.
  { name: 'Priestess', type: 'healer', armor: 'light', attack: 'magic', role: 'special', material: 'bio', cost: 2,
    hp: 95, damage: 9, range: 105, speed: 43, rate: 1.5, radius: 12, healPct: 0.12, healRange: 115 },
  { name: 'Shadow Samurai', type: 'samurai', armor: 'medium', attack: 'melee', role: 'melee', material: 'bio', cost: 4,
    hp: 170, damage: 50, range: 14, speed: 75, rate: 1.0, radius: 13, stealthBonus: 1.5, recloakTime: 2.5 },
  { name: 'Spy', type: 'spy', armor: 'light', attack: 'melee', role: 'special', material: 'bio', cost: 5,
    hp: 100, damage: 0, range: 24, speed: 59, rate: 2.0, radius: 12, channelTime: 3.0, maxStealCost: 5 },
  { name: 'Fire Thrower', type: 'firethrower', armor: 'light', attack: 'fire', role: 'ranged', material: 'bio', cost: 4,
    hp: 115, damage: 28, range: 94, speed: 40, rate: 2.4, radius: 13, splashRadius: 42, burnDps: 17, burnSeconds: 3 },
  { name: 'P-51 Mustang', type: 'p51', armor: 'mechanical', attack: 'pierce', role: 'special', material: 'mechanical', cost: 6,
    minUnitDamagePct: 0.50, maxUnitDamagePct: 0.75, towerDamagePct: 0.10, duration: 1.7 },
  // Unit expansion 2 (zie docs/unit-expansion-2.md). Achteraan, zodat bestaande kaartindexen gelijk blijven.
  { name: 'Spartan Guardian', type: 'spartan', armor: 'heavy', attack: 'melee', role: 'melee', material: 'bio', cost: 4,
    hp: 390, damage: 20, range: 26, speed: 32, rate: 1.35, radius: 17, shieldPct: 0.3, shieldRange: 65 },   // tank (was 340)
  { name: 'Plague Doctor', type: 'plague', armor: 'light', attack: 'poison', role: 'ranged', material: 'bio', cost: 4, support: true,
    hp: 110, damage: 15, range: 105, speed: 40, rate: 2.3, radius: 12, poisonDps: 15, poisonSeconds: 4, spreadRange: 35 },
  { name: 'Banner Maiden', type: 'banner', armor: 'medium', attack: 'melee', role: 'melee', material: 'bio', cost: 5, support: true,
    hp: 175, damage: 22, range: 18, speed: 45, rate: 1.4, radius: 13, auraRange: 95, auraSpeed: 0.25, auraAttack: 0.25 },
  { name: 'Flamethrower GI', type: 'flamegi', armor: 'medium', attack: 'fire', role: 'ranged', material: 'bio', cost: 5,
    hp: 170, damage: 14, range: 75, speed: 31, rate: 0.4, radius: 14, burnDps: 6, burnSeconds: 2 },
  { name: 'Steppe Lancer', type: 'lancer', armor: 'medium', attack: 'melee', role: 'melee', material: 'bio', cost: 4,
    hp: 205, damage: 41, range: 22, speed: 105, rate: 1.1, radius: 19, chargeBonus: 20, chargeDistance: 65, knockback: 30 },
  { name: 'Persian Assassin', type: 'assassin', armor: 'light', attack: 'melee', role: 'melee', material: 'bio', cost: 3,
    hp: 135, damage: 45, range: 12, speed: 90, rate: 0.9, radius: 11, backstabBonus: 0.75, supportDetect: 160 },

];

// Schademodel: aanvalstype (wie slaat) x pantserklasse (wie geraakt wordt) -> factor op de schade.
// Pantser per kaart: `armor`; aanval per kaart: `attack`. Gebouwen zijn 'building' en schieten 'pierce'.
// Light = snel en kwetsbaar, Heavy = zwaar gepantserd. Een P-51-aanval en gif-over-tijd vallen erbuiten.
export const ARMOR_CLASSES = ['light', 'medium', 'heavy', 'mechanical', 'building'];
export const DAMAGE_TABLE = {
  melee:  { light: 1.15, medium: 1, heavy: 0.8,  mechanical: 0.75, building: 1 },
  pierce: { light: 1.25, medium: 1, heavy: 0.7,  mechanical: 0.5,  building: 0.6 },
  siege:  { light: 0.75, medium: 1, heavy: 1.25, mechanical: 1.5,  building: 2 },
  fire:   { light: 1.25, medium: 1, heavy: 0.8,  mechanical: 0.75, building: 0.4 },
  poison: { light: 1,    medium: 1, heavy: 1,    mechanical: 0.5,  building: 0.5 },
  magic:  { light: 1,    medium: 1, heavy: 1,    mechanical: 1,    building: 0.5 },
};
export const STRUCTURE_ATTACK = 'pierce';

export const STRUCTURES = {
  tower:  { hp: 850,  radius: 28, damage: 32, range: 125, rate: 1.05 },
  castle: { hp: 2400, radius: 58, damage: 32, range: 125, rate: 1.05 },
};

export const STRUCTURE_POSITIONS = {
  blue: { towerX: 234, castleX: 86 },
  red: { towerX: 726, castleX: 874 },
  castleY: 172,
};

export const AI = {
  firstMove: 2,
  minDelay: 2.8,
  maxDelay: 4.8,
  spawnMin: 540,
  spawnMax: 692,
};

// Ondersteuners: de Perzische sluipmoordenares zoekt deze eerst op.
export const SUPPORT_TYPES = ['healer', 'banner', 'plague'];
