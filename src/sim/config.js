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

export const MATCH_SECONDS = 240;
export const OVERTIME_AT = 180;          // daarna vult energie sneller aan
export const ENERGY_START = 6;
export const ENERGY_MAX = 10;
export const ENERGY_SECONDS = 1.35;      // seconden per energiepunt
export const ENERGY_SECONDS_OVERTIME = 0.8;

export const DETECTION_RANGE = 205;      // hoe ver een eenheid vijanden vóór zich opmerkt

export const CARDS = [
  { name: 'Legionair',    type: 'melee',  cost: 3, hp: 240, damage: 36, range: 12,  speed: 56, rate: 0.9, radius: 13 },
  { name: 'Boogschutter', type: 'archer', cost: 4, hp: 130, damage: 29, range: 120, speed: 46, rate: 1.2, radius: 13 },
  { name: 'Kanon',        type: 'cannon', cost: 6, hp: 300, damage: 48, range: 106, speed: 22, rate: 3.2, radius: 22 },
  // Tijdperken zijn vrij te combineren: geen beschavingsgebonden legers of bonussen.
  { name: 'Romeinse ruiter', type: 'cavalry', cost: 4, hp: 215, damage: 37, range: 15, speed: 110, rate: 1.0, radius: 18, chargeBonus: 39, chargeDistance: 65 },
  { name: 'Viking berserker', type: 'berserker', cost: 4, hp: 190, damage: 49, range: 14, speed: 66, rate: 0.85, radius: 14, rageMultiplier: 1.6 },
  { name: 'Mongoolse ruiterboogschutter', type: 'horse_archer', cost: 5, hp: 155, damage: 24, range: 125, speed: 88, rate: 0.9, radius: 17 },
  { name: 'Musketier', type: 'musket', cost: 4, hp: 140, damage: 90, range: 124, speed: 39, rate: 2.8, radius: 13 },
];

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
