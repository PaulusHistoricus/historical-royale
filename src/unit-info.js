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

// Schademodel (DAMAGE_TABLE in sim/config.js) in spelerstaal.
export const ARMOR_NAME = { light: 'Light armor', medium: 'Medium armor', heavy: 'Heavy armor', mechanical: 'Mechanical' };
export const ATTACK_NAME = { melee: 'Melee', pierce: 'Pierce', siege: 'Siege', fire: 'Fire', poison: 'Poison', magic: 'Magic' };
export const ATTACK_HINT = {
  melee: 'Steady against everything; weaker against heavy armor and machines.',
  pierce: 'Strong against light armor; weak against heavy armor, machines and buildings.',
  siege: 'Double damage to buildings, extra against machines; weak against light units.',
  fire: 'Strong against light armor; barely hurts buildings.',
  poison: 'Same against all living units; weak against machines and buildings.',
  magic: 'Same against everything except buildings.',
};
/** "Medium armor · Melee" */
export function combatLine(type) {
  const c = CARDS.find(x => x.type === type);
  return c ? `${ARMOR_NAME[c.armor] ?? c.armor} · ${ATTACK_NAME[c.attack] ?? c.attack}` : '';
}
