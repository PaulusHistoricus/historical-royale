// Soort en vaardigheid per kaart, voor het deckscherm en het missiepaneel (Engelse spelerstekst).
// Soort volgt uit config.js: material 'bio' | 'mechanical', role 'special' = Special.
// Gif, genezing, het Spartaanse schild, de Banner-aura en de Spy werken alleen op Bio.
import { CARDS } from './sim/config.js';

export const ABILITY = {
  melee: 'Sturdy infantry. No tricks, just shield and sword.',
  archer: 'Shoots from range.',
  cannon: 'Siege: heavy shots from far away, slow to reload.',
  cavalry: 'Charge: extra damage after a run-up.',
  berserker: 'Rage: hits much harder when wounded.',
  horse_archer: 'Fast archer on horseback.',
  musket: 'One heavy shot, slow to reload.',
  healer: 'Heals Bio allies nearby.',
  samurai: 'Invisible until he strikes; first hit is stronger.',
  spy: 'Takes over an enemy Bio unit (cost 5 or less).',
  firethrower: 'Fire that splashes and burns.',
  p51: 'Strafes one lane: heavy damage to units, a little to buildings.',
  spartan: 'Tank. Shield wall: Bio allies behind him take 40% less ranged damage.',
  plague: 'Poison that stops healing and spreads once.',
  banner: 'Rally aura: Bio allies nearby move and attack faster.',
  flamegi: 'Burns every enemy in front of him.',
  lancer: 'Charge that knocks the target back.',
  assassin: 'Hunts healers and supports; first stab +75%.',
};

/** ['Bio'|'Mechanical'] plus 'Special' voor special-kaarten. */
export function unitKinds(type) {
  const c = CARDS.find(x => x.type === type);
  if (!c) return [];
  const kinds = [c.material === 'mechanical' ? 'Mechanical' : 'Bio'];
  if (c.role === 'special') kinds.push('Special');
  return kinds;
}
export const kindChips = type => unitKinds(type).map(k => `<span class="lr-kind ${k.toLowerCase()}">${k}</span>`).join('');
