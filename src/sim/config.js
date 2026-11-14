// Alle spelregels en balanswaarden op één plek. Geen Phaser, geen DOM.
//
// AFSTANDEN: gevechten zijn 1-dimensionaal langs de baan (x-as). Elke eenheid
// en elk gebouw heeft een `radius` (halve lichaamsbreedte). Bereik (`range`)
// wordt ALTIJD gemeten van rand tot rand ("gap"), nooit van middelpunt tot
// middelpunt. Er bestaat bewust géén aparte botsings- of contactafstand: een
// eenheid stopt precies wanneer zijn doelwit binnen bereik is. Daardoor kan
// "gestopt maar niet binnen aanvalsbereik" (de bug uit issue #1) niet bestaan.

export const W = 960;
export const H = 600;
export const LANES = [155, 355];
export const FIELD_BOTTOM = 485;

export const DEPLOY_ZONE = {
  blue: { min: 205, max: 445 },
  red: { min: 540, max: 755 },
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
];

export const STRUCTURES = {
  tower:  { hp: 850,  radius: 22, damage: 32, range: 125, rate: 1.05 },
  castle: { hp: 2400, radius: 34, damage: 32, range: 125, rate: 1.05 },
};

export const STRUCTURE_POSITIONS = {
  blue: { towerX: 150, castleX: 55 },
  red: { towerX: 810, castleX: 905 },
  castleY: 255,
};

export const AI = {
  firstMove: 2,
  minDelay: 2.8,
  maxDelay: 4.8,
  spawnMin: 580,
  spawnMax: 735,
};
