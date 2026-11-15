import Phaser from 'phaser';
import './style.css';
import { W, LANES, FIELD_BOTTOM, CARDS, DEPLOY_ZONE, MATCH_SECONDS, ENERGY_MAX } from './sim/config.js';
import * as sim from './sim/battle.js';
import { createHand, playFromHand, HAND_SIZE } from './sim/hand.js';
import UNIT_ART from './art/units.json';
import WORLD_ART from './art/world.json';
import CARD_ART from './art/cards.json';
import BAR_ART from './art/cardbar.json';
import { VERSION_LABEL, ensureLatestBuild } from './version.js';
const { createBattle, deploy, step, findById, gap } = sim;

// Dit bestand bevat ALLEEN weergave en invoer. Alle spelregels (lopen, doelwit
// kiezen, aanvallen, schade, AI, energie, kaartenhand) staan in src/sim/ en
// worden getest in tests/. Art wordt gemaakt met tools/art/build.py.
//
// SCHERMINDELING — zie layout(). Alles staat in wereldcoördinaten (960 breed):
//   * speelveld: y = 0 .. FIELD_BOTTOM (310), altijd volledig zichtbaar;
//   * kaartenbalk: begint bij BAR_OVERLAP (onder banen en kastelen, over de
//     decoratieve onderrand van het veld) en schaalt mee met het scherm;
//   * in portret een kopstrook boven het veld (negatieve y) voor tijd en tekst.
// De camera zoomt dat geheel zo groot mogelijk in het canvas. Het canvas heeft
// de grootte van het scherm x devicePixelRatio, dus alles blijft scherp.

const TEX = 2;                      // textures zijn gemaakt op 2x wereldresolutie
const ART = import.meta.env.BASE_URL + 'assets/art/';
const SIM_STEP = 1 / 60;            // vaste simulatiestap, onafhankelijk van de framerate
const TEAM = { blue: 0x4f9be8, red: 0xe0513f };
const ZONE = DEPLOY_ZONE.blue;
const FONT = 'Georgia, "Times New Roman", serif';
const DEBUG = new URLSearchParams(location.search).has('debug');
const BAR_OVERLAP = 266;            // bovenrand kaartenbalk; banen en kastelen eindigen erboven
const PORTRAIT_TOP = 120;           // kopstrook in portret
const BAR_MAX_LANDSCAPE = 0.33;     // balkschaal liggend/desktop: balk ≈ 30% van de hoogte, veld ≈ 70%
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Waar voeten en gebouwen in de arena-art staan (wereldpixels).
const footY = u => LANES[u.lane] + 8 + (u.y - LANES[u.lane]) * 0.6;
const STRUCTURE_FOOT = { tower: lane => LANES[lane] + 20, castle: () => 246 };
const UNIT_HEIGHT = { melee: 56, archer: 58, cannon: 54, cavalry: 70, berserker: 56, horse_archer: 72, musket: 58, healer: 58, samurai: 60, spy: 54, firethrower: 57 };   // voor de levensbalk
const MOUNTED = new Set(['cavalry', 'horse_archer']);
const MELEE_KINDS = new Set(['melee', 'cavalry', 'berserker', 'samurai', 'spy']);
const CARD_LABEL = { melee: 'Legionary', archer: 'Archer', cannon: 'Cannon', cavalry: 'Cavalry',
  berserker: 'Berserker', horse_archer: 'Horse Archer', musket: 'Musketeer',
  healer: 'Healer', samurai: 'Samurai', spy: 'Spy', firethrower: 'Fire Thrower', p51: 'P-51 Mustang' };

const unitTexture = (type, side) => {
  const list = UNIT_ART[type].textures;
  return list.find(t => t.endsWith('-' + side)) ?? list[0];
};
const textStyle = (size, color, extra) => ({ fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold', color,
  stroke: '#2a1d10', strokeThickness: Math.max(2, size / 5), resolution: 2, ...extra });

class Battle extends Phaser.Scene {
  constructor() { super('battle'); }

  text(x, y, str, size, color = '#fff4d6', extra = {}) {
    const t = this.add.text(x, y, str, textStyle(size, color, extra));
    t.baseSize = size;
    this.texts.push(t);
    return t;
  }

  preload() {
    this.load.image('arena', ART + 'arena.jpg');
    for (const def of Object.values(UNIT_ART)) {
      for (const key of def.textures) {
        this.load.spritesheet(key, ART + key + '.png', { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
      }
    }
    this.load.image('cardbar', ART + 'cardbar.webp');
    this.load.spritesheet('cards', ART + 'cards.png', { frameWidth: CARD_ART.frameWidth, frameHeight: CARD_ART.frameHeight });
    for (const kind of ['tower', 'castle']) {
      for (const side of ['blue', 'red']) {
        const def = WORLD_ART[kind];
        this.load.spritesheet(`${kind}-${side}`, ART + `${kind}-${side}.png`, { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
      }
    }
  }

  createAnimations() {
    for (const [type, def] of Object.entries(UNIT_ART)) {
      const card = CARDS.find(c => c.type === type);
      for (const tex of def.textures) {
        for (const [name, frames] of Object.entries(def.anims)) {
          const key = `${tex}:${name}`;
          if (this.anims.exists(key)) continue;
          // Aanvalsanimatie past altijd binnen de aanvalssnelheid.
          const duration = name === 'attack' ? Math.min(card.rate * 0.85, 0.75) : null;
          const frameRate = duration ? frames.length / duration : { idle: 5, walk: 10, hit: 12, death: 9 }[name];
          this.anims.create({ key, frames: frames.map(frame => ({ key: tex, frame })), frameRate,
            repeat: name === 'idle' || name === 'walk' ? -1 : 0 });
        }
      }
    }
  }

  create() {
    this.texts = [];
    this.createAnimations();
    this.state = createBattle();
    this.accumulator = 0;
    this.selected = null;          // gekozen vak in de hand (0..3), of null
    this.hand = createHand(CARDS.length, this.state.rng);
    this.views = new Map();        // eenheid-id -> { sprite, type, lockUntil, flashUntil }
    this.projectiles = [];         // puur visueel
    this.sparks = [];
    this.extraUnits = this.add.graphics().setDepth(500);
    if (DEBUG) window.__HR__ = { scene: this, state: this.state, sim };

    this.backdrop = this.add.graphics().setDepth(-20);   // vult de ruimte rond veld en balk
    this.add.image(0, 0, 'arena').setOrigin(0, 0).setScale(W / WORLD_ART.arena.width).setDepth(-10);
    this.drawDeployZones();
    this.structureViews = this.state.structures.map(s => {
      const def = WORLD_ART[s.kind];
      const foot = STRUCTURE_FOOT[s.kind](s.lane);
      const sprite = this.add.sprite(s.x, foot, `${s.kind}-${s.side}`, 0)
        .setOrigin(0.5, (def.frameHeight - 2) / def.frameHeight).setScale(1 / TEX).setDepth(foot);
      return { sprite, foot, top: foot - def.frameHeight / TEX + 6, flashUntil: 0 };
    });

    this.ground = this.add.graphics().setDepth(1);      // teamcirkels onder eenheden
    this.fx = this.add.graphics().setDepth(1000);       // projectielen, vonken
    this.bars = this.add.graphics().setDepth(1010);     // levensbalken
    this.hud = this.add.graphics().setDepth(1150);      // energie, selectie, kaartoverlays
    this.cardOverlay = this.add.graphics().setDepth(1165);
    this.barImage = this.add.image(0, 0, 'cardbar').setOrigin(0, 0).setDepth(1140);

    this.header = this.text(W / 2, 13, '', 13).setOrigin(0.5).setDepth(1200);
    this.message = this.text(W / 2, 32, 'Choose a card, then select a blue lane', 10).setOrigin(0.5).setDepth(1200);
    this.hint = this.text(W / 2, 0, 'Rotate your device for a larger battlefield', 18, '#e6d2a6').setOrigin(0.5).setDepth(1200);
    this.energyText = this.text(0, 0, '', 16).setOrigin(0.5).setDepth(1200);
    this.debugText = this.add.text(6, 46, '', { fontFamily: 'monospace', fontSize: '7px', color: '#fff', backgroundColor: '#000000aa', resolution: 2 })
      .setDepth(2000).setVisible(DEBUG);
    this.createCards();
    this.createFullscreenButton();

    this.input.on('pointerdown', (p, over) => {
      if (over.length || this.state.ended) return;   // tik op een kaart of knop
      this.tryDeploy(p.worldX, p.worldY);
    });
    this.input.keyboard?.on('keydown-R', () => this.scene.restart());
    this.input.keyboard?.on('keydown', e => {
      const slot = Number(e.key) - 1;                  // toetsen 1-4 kiezen een kaart
      if (slot >= 0 && slot < HAND_SIZE) this.selectSlot(slot);
    });
    ensureLatestBuild().then(status => {
      if (status === 'stale') this.message.setText('New version available — refresh the page');
    });

    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    this.layout();
  }

  tryDeploy(x, y) {
    if (y >= FIELD_BOTTOM || y < 40 || x < ZONE.min || x > ZONE.max) return;
    const lane = Math.abs(y - LANES[0]) <= Math.abs(y - LANES[1]) ? 0 : 1;
    if (Math.abs(y - LANES[lane]) > 48) return;
    if (this.selected === null) {
      this.message.setText('Select a card first');
      return;
    }
    const slot = this.selected;
    if (!deploy(this.state, 'blue', lane, this.hand.slots[slot], x)) {
      this.message.setText('Not enough energy');
      return;
    }
    playFromHand(this.hand, slot);
    this.selected = null;                               // na spelen niets meer geselecteerd
    this.cards[slot].enter = 0;                         // nieuwe kaart schuift het vak in
    this.refreshCardSlot(slot);
    this.message.setText('Card played — choose your next card');
  }

  selectSlot(slot) {
    if (this.state.ended) return;
    this.selected = this.selected === slot ? null : slot;   // nogmaals tikken = deselecteren
    this.message.setText(this.selected === null ? 'Choose a card'
      : CARDS[this.hand.slots[slot]].name + ' selected — tap a blue lane');
  }

  drawDeployZones() {
    const g = this.add.graphics().setDepth(0);
    for (const y of LANES) {
      g.fillStyle(0x6fc2ff, 0.13).fillRoundedRect(ZONE.min, y - 22, ZONE.max - ZONE.min, 46, 6);
      g.lineStyle(1.5, 0x9fdcff, 0.55).strokeRoundedRect(ZONE.min, y - 22, ZONE.max - ZONE.min, 46, 6);
    }
  }

  // Vier kaartvakken in de geschilderde balk. Posities worden in layout() gezet.
  createCards() {
    this.cards = Array.from({ length: HAND_SIZE }, (_, slot) => {
      const image = this.add.image(0, 0, 'cards', 0).setDepth(1160);
      const zone = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true }).setDepth(1300);
      zone.on('pointerdown', () => this.selectSlot(slot));
      const cost = this.text(0, 0, '', 14).setOrigin(0.5).setDepth(1170);
      const label = this.text(0, 0, '', 8).setOrigin(0.5).setDepth(1170);
      return { image, zone, cost, label, enter: 1, x: 0, y: 0, h: 0, k: 0 };
    });
    this.cards.forEach((_, slot) => this.refreshCardSlot(slot));
  }

  refreshCardSlot(slot) {
    const view = this.cards[slot];
    const card = CARDS[this.hand.slots[slot]];
    // Temporary portrait until the five new illustrated cards are delivered.
    view.art = CARD_ART.cards[card.type] ?? CARD_ART.cards[card.type === 'p51' ? 'cannon' : 'archer'];
    view.image.setFrame(view.art.frame);
    view.cost.setText(String(card.cost));
    view.label.setText(CARD_LABEL[card.type] ?? card.name);
  }

  createFullscreenButton() {
    this.fsButton = this.add.zone(0, 0, 26, 26).setInteractive({ useHandCursor: true }).setDepth(1300);
    this.fsButton.on('pointerdown', () => {
      if (this.scale.isFullscreen) { this.scale.stopFullscreen(); return; }
      this.scale.startFullscreen();
      screen.orientation?.lock?.('landscape').catch(() => {});   // Android: liggend vastzetten
    });
    this.fsIcon = this.add.graphics().setDepth(1200);
    const available = this.scale.fullscreen.available;
    this.fsButton.setVisible(available).input.enabled = available;
    this.fsIcon.setVisible(available);
  }

  // Eén centrale plek voor alle schermindeling. Wordt aangeroepen bij start,
  // bij elke resize en bij draaien van het scherm.
  layout() {
    const cam = this.cameras.main;
    const cw = this.scale.width, ch = this.scale.height;
    const aspect = cw / ch, portrait = aspect < 1.1;
    const topH = portrait ? PORTRAIT_TOP : 0;
    // Balkschaal (wereld per textuurpixel): zo kiezen dat veld + balk de
    // schermverhouding vullen. Breed scherm = kleinere balk, smal = grotere.
    const span = BAR_ART.bottom - BAR_ART.mainTop;
    const wanted = W / aspect - topH;
    const maxSc = portrait ? W / BAR_ART.width : BAR_MAX_LANDSCAPE;
    const sc = clamp((wanted - BAR_OVERLAP) / span, 440 / BAR_ART.width, maxSc);
    const bar = { sc, w: BAR_ART.width * sc, x: W / 2 - BAR_ART.width * sc / 2, y: BAR_OVERLAP - BAR_ART.mainTop * sc };
    const bottom = Math.max(FIELD_BOTTOM, bar.y + BAR_ART.bottom * sc);
    const top = -topH;
    const zoom = Math.min(cw / W, ch / (bottom - top));
    const viewW = cw / zoom, viewH = ch / zoom;
    const cy = (top + bottom) / 2;   // inhoud gecentreerd; overgebleven ruimte boven en onder
    cam.setZoom(zoom).centerOn(W / 2, cy);
    this.view = { left: W / 2 - viewW / 2, right: W / 2 + viewW / 2, top: cy - viewH / 2, bottom: cy + viewH / 2, portrait, zoom };
    this.bar = bar;

    this.barImage.setPosition(bar.x, bar.y).setScale(sc);
    BAR_ART.slots.forEach((s, i) => {
      const c = this.cards[i];
      c.x = bar.x + (s.x + s.w / 2) * sc;
      c.y = bar.y + (s.y + s.h / 2) * sc;
      c.h = s.h * sc * 0.97;
      c.k = c.h / CARD_ART.frameHeight;          // wereld per kaarttextuurpixel
      c.zone.setPosition(c.x, c.y).setSize(s.w * sc, s.h * sc);
      c.cost.setFontSize(Math.round(c.h * 0.16)).setStroke('#2a1d10', Math.max(2, c.h * 0.03));
      c.label.setFontSize(Math.round(c.h * 0.085)).setStroke('#2a1d10', Math.max(2, c.h * 0.02));
    });
    this.energyText.setFontSize(Math.round(BAR_ART.plaque.h * sc * 0.62));

    // Teksten: in portret groter en in de kopstrook, anders over de lucht.
    const k = portrait ? 2.1 : 1;
    this.header.setPosition(W / 2, portrait ? -70 : 13).setFontSize(Math.round(13 * k));
    this.message.setPosition(W / 2, portrait ? -32 : 32).setFontSize(Math.round(10 * k));
    this.hint.setPosition(W / 2, Math.max(this.view.top + 26, -112)).setVisible(portrait);
    // Scherpe tekst: textuurresolutie volgt de werkelijke zoom.
    const res = clamp(Math.ceil(zoom), 1, 4);
    for (const t of this.texts) t.setResolution(res);

    const fx = W - 16, fy = portrait ? -100 : 14;
    this.fsButton.setPosition(fx, fy);
    this.fsIcon.setPosition(fx, fy);
    this.drawBackdrop();
  }

  drawBackdrop() {
    const g = this.backdrop, v = this.view;
    g.clear();
    g.fillStyle(0x15100a).fillRect(v.left - 2, v.top - 2, v.right - v.left + 4, v.bottom - v.top + 4);
    // aarde onder het veld, over de hele schermbreedte
    g.fillGradientStyle(0x3a2a1a, 0x3a2a1a, 0x17110a, 0x17110a, 1).fillRect(v.left - 2, FIELD_BOTTOM - 2, v.right - v.left + 4, v.bottom - FIELD_BOTTOM + 4);
    const fs = this.fsIcon;
    fs.clear().lineStyle(2, 0xf1dcae, 0.9);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      fs.lineBetween(sx * 8, sy * 8, sx * 3, sy * 8).lineBetween(sx * 8, sy * 8, sx * 8, sy * 3);
    }
  }

  // Vertaalt gebeurtenissen uit de simulatie naar animaties en effecten.
  handleEvents(events) {
    const now = this.time.now;
    for (const e of events) {
      if (e.type === 'heal') {
        this.sparks.push({ x: e.to.x, y: e.to.y - 30, t: 0, dur: 0.45, color: 0x74efaa });
      } else if (e.type === 'possess') {
        this.sparks.push({ x: e.x, y: e.y - 28, t: 0, dur: 0.6, color: 0xc18bff, big: true });
      } else if (e.type === 'hit') {
        const attacker = this.views.get(e.attackerId);
        if (attacker?.sprite) {
          attacker.sprite.anims.play(`${attacker.sprite.texture.key}:attack`);
          attacker.lockUntil = now + attacker.sprite.anims.currentAnim.duration;
        }
        const target = this.views.get(e.targetId);
        if (target) {
          target.flashUntil = now + 110;
          if (target.sprite && now >= target.lockUntil && UNIT_ART[target.type]?.anims.hit.length > 1) {
            target.sprite.anims.play(`${target.sprite.texture.key}:hit`);
            target.lockUntil = now + 170;
          }
        } else {
          const sv = this.structureViews.find((_, i) => this.state.structures[i].id === e.targetId);
          if (sv) sv.flashUntil = now + 110;
        }
        this.spawnEffect(e);
      } else if (e.type === 'death') {
        const view = this.views.get(e.id);
        if (view) {
          this.views.delete(e.id);
          if (view.sprite) {
            view.sprite.clearTint().anims.play(`${view.sprite.texture.key}:death`);
            this.tweens.add({ targets: view.sprite, alpha: 0, delay: 1300, duration: 700, onComplete: () => view.sprite.destroy() });
          }
        }
      } else if (e.type === 'end') {
        this.showResult(e.winner);
      }
    }
  }

  spawnEffect(e) {
    const dir = e.to.x >= e.from.x ? 1 : -1;
    const targetUnit = this.state.units.find(u => u.id === e.targetId);
    const targetY = targetUnit ? footY(targetUnit) - 26 : this.structureTop(e.targetId) + 30;
    if (MELEE_KINDS.has(e.kind) || e.kind === 'p51') {
      this.sparks.push({ x: e.to.x - dir * 6, y: targetY, t: 0, dur: 0.22, color: 0xfff1b8 });
      return;
    }
    let x0, y0;
    const attacker = this.state.units.find(u => u.id === e.attackerId);
    if (attacker) {
      x0 = attacker.x + dir * (e.kind === 'musket' ? 30 : 22);
      y0 = footY(attacker) - ({ cannon: 26, horse_archer: 50, musket: 38 }[e.kind] ?? 34);
      if (e.kind === 'musket') this.sparks.push({ x: x0, y: y0, t: 0, dur: 0.12, color: 0xffc04a });
    }
    else { x0 = e.from.x; y0 = this.structureTop(e.attackerId) + 10; }
    const dist = Math.abs(e.to.x - x0);
    this.projectiles.push({ kind: e.kind === 'cannon' ? 'ball' : e.kind === 'musket' ? 'bullet' : 'arrow', x0, y0, x1: e.to.x, y1: targetY,
      t: 0, dur: Math.max(e.kind === 'musket' ? 0.06 : 0.12, dist / ({ cannon: 520, musket: 1600 }[e.kind] ?? 760)),
      arc: { cannon: 26, musket: 0 }[e.kind] ?? 10 });
  }

  structureTop(id) {
    const i = this.state.structures.findIndex(s => s.id === id);
    return i >= 0 ? this.structureViews[i].top : 100;
  }

  showResult(winner) {
    const g = this.add.graphics().setDepth(3000);
    g.fillStyle(0x1b130b, 0.9).fillRoundedRect(W / 2 - 220, 72, 440, 120, 14);
    g.lineStyle(3, 0xd9b26a).strokeRoundedRect(W / 2 - 220, 72, 440, 120, 14);
    this.text(W / 2, 112, winner === 'blue' ? 'OVERWINNING!' : 'VERLOREN!', 34, winner === 'blue' ? '#c4f3c0' : '#ffc0b5').setOrigin(0.5).setDepth(3001);
    this.text(W / 2, 160, 'Tik om opnieuw te spelen', 15).setOrigin(0.5).setDepth(3001);
    for (const t of this.texts) t.setResolution(clamp(Math.ceil(this.view.zoom), 1, 4));
    this.selected = null;
    this.time.delayedCall(400, () => this.input.once('pointerdown', () => this.scene.restart()));
  }

  update(_time, delta) {
    const dt = Math.min(delta / 1000, 0.1);
    this.accumulator += dt;
    while (this.accumulator >= SIM_STEP) {
      this.accumulator -= SIM_STEP;
      this.syncUnitViews();        // nieuwe eenheden krijgen een sprite vóór hun eerste klap
      this.handleEvents(step(this.state, SIM_STEP));
    }
    this.syncUnitViews();
    this.drawUnits();
    this.drawStructures();
    this.drawEffects(dt);
    this.drawAirstrikes();
    this.drawHud(dt);
    if (DEBUG) this.drawDebug();
  }

  syncUnitViews() {
    for (const u of this.state.units) {
      if (this.views.has(u.id)) continue;
      const def = UNIT_ART[u.card.type];
      const sprite = def
        ? this.add.sprite(u.x, footY(u), unitTexture(u.card.type, u.side), def.anims.idle[0])
          .setOrigin(def.originX, def.originY).setScale(1 / TEX)
        : null;
      this.views.set(u.id, { sprite, type: u.card.type, lockUntil: 0, flashUntil: 0 });
    }
  }

  drawUnits() {
    const now = this.time.now, g = this.ground, b = this.bars;
    g.clear(); b.clear();
    this.extraUnits.clear();
    for (const u of this.state.units) {
      const v = this.views.get(u.id);
      const fy = footY(u);
      if (v.sprite) {
        v.sprite.setPosition(u.x, fy).setFlipX(u.facing < 0).setDepth(fy)
          .setAlpha(u.hidden ? (u.side === 'blue' ? 0.3 : 0) : 1);
        if (now >= v.lockUntil) v.sprite.anims.play(`${v.sprite.texture.key}:${u.state === 'move' ? 'walk' : 'idle'}`, true);
        if (now < v.flashUntil) v.sprite.setTint(0xff9a8a); else v.sprite.clearTint();
      } else if (!u.hidden || u.side === 'blue') {
        const g = this.extraUnits, alpha = u.hidden ? 0.25 : 1;
        g.fillStyle(TEAM[u.side], alpha).fillRoundedRect(u.x - 9, fy - 37, 18, 29, 4);
        g.fillStyle(0xf2d4a0, alpha).fillCircle(u.x, fy - 41, 7);
        g.lineStyle(3, 0xe8d8b5, alpha).lineBetween(u.x, fy - 30, u.x + u.facing * 20, fy - 39);
        if (u.card.type === 'healer') g.fillStyle(0x80ffc2, alpha).fillCircle(u.x + 1, fy - 29, 4);
        if (u.card.type === 'firethrower') g.fillStyle(0xffa142, alpha).fillCircle(u.x + u.facing * 19, fy - 40, 4);
        if (u.card.type === 'spy') g.fillStyle(0xc28cff, alpha).fillCircle(u.x, fy - 28, 3);
      }

      const w = u.card.type === 'cannon' || MOUNTED.has(u.card.type) ? 42 : 26;
      if (!u.hidden || u.side === 'blue') {
        g.fillStyle(TEAM[u.side], u.hidden ? 0.15 : 0.45).fillEllipse(u.x, fy - 1, w, 7);
        const by = fy - (UNIT_HEIGHT[u.card.type] ?? 56);
        b.fillStyle(0x1d1a16, 0.85).fillRect(u.x - 15, by, 30, 4);
        b.fillStyle(TEAM[u.side], u.hidden ? 0.3 : 1).fillRect(u.x - 15, by, 30 * u.hp / u.max, 4);
      }
    }
  }

  drawStructures() {
    const now = this.time.now, b = this.bars;
    this.state.structures.forEach((s, i) => {
      const v = this.structureViews[i];
      const ratio = s.hp / s.max;
      const stage = ratio <= 0 ? 4 : ratio > 0.75 ? 0 : ratio > 0.5 ? 1 : ratio > 0.25 ? 2 : 3;
      v.sprite.setFrame(stage);
      if (now < v.flashUntil) v.sprite.setTint(0xffb3a8); else v.sprite.clearTint();
      if (s.hp <= 0) return;
      const w = s.kind === 'castle' ? 76 : 46, y = v.top - 8;
      b.fillStyle(0x1d1a16, 0.85).fillRect(s.x - w / 2 - 1, y - 1, w + 2, 7);
      b.fillStyle(TEAM[s.side]).fillRect(s.x - w / 2, y, w * ratio, 5);
    });
  }

  drawEffects(dt) {
    const g = this.fx;
    g.clear();
    this.projectiles = this.projectiles.filter(p => {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const x = p.x0 + (p.x1 - p.x0) * k;
      const y = p.y0 + (p.y1 - p.y0) * k - Math.sin(k * Math.PI) * p.arc;
      if (p.kind === 'bullet') {
        g.lineStyle(1.4, 0xffe6a0, 0.8).lineBetween(x - Math.sign(p.x1 - p.x0) * 10, y, x, y);
        g.fillStyle(0x3a3530).fillCircle(x, y, 1.6);
      } else if (p.kind === 'arrow') {
        const k2 = Math.max(0, k - 0.06);
        const px = p.x0 + (p.x1 - p.x0) * k2, py = p.y0 + (p.y1 - p.y0) * k2 - Math.sin(k2 * Math.PI) * p.arc;
        const ang = Math.atan2(y - py, x - px), len = 13;
        const tx = x - Math.cos(ang) * len, ty = y - Math.sin(ang) * len;
        g.lineStyle(1.6, 0x6b4a26).lineBetween(tx, ty, x, y);
        g.fillStyle(0xd9d9d9).fillTriangle(x + Math.cos(ang) * 3, y + Math.sin(ang) * 3,
          x + Math.cos(ang + 2.5) * 3, y + Math.sin(ang + 2.5) * 3, x + Math.cos(ang - 2.5) * 3, y + Math.sin(ang - 2.5) * 3);
        g.lineStyle(1.6, 0xefe6d0).lineBetween(tx, ty, tx - Math.cos(ang - 0.5) * 3, ty - Math.sin(ang - 0.5) * 3);
      } else {
        g.fillStyle(0x24221f).fillCircle(x, y, 3.6);
        g.fillStyle(0x8a8580).fillCircle(x - 1, y - 1, 1.2);
      }
      if (k >= 1) {
        this.sparks.push(p.kind === 'ball'
          ? { x: p.x1, y: p.y1 + 8, t: 0, dur: 0.38, color: 0xffa040, big: true }
          : { x: p.x1, y: p.y1, t: 0, dur: 0.14, color: 0xfff1b8 });
        return false;
      }
      return true;
    });
    this.sparks = this.sparks.filter(s => {
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) return false;
      const r = (s.big ? 16 : 7) * (0.4 + k);
      g.fillStyle(s.color, (1 - k) * 0.7).fillCircle(s.x, s.y, r);
      if (s.big) g.fillStyle(0x6b6560, (1 - k) * 0.5).fillCircle(s.x + 4, s.y - 8 - k * 10, r * 0.8);
      else for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.6;
        g.lineStyle(1.4, s.color, 1 - k).lineBetween(s.x + Math.cos(a) * r * 0.5, s.y + Math.sin(a) * r * 0.5, s.x + Math.cos(a) * r * 1.3, s.y + Math.sin(a) * r * 1.3);
      }
      return true;
    });
  }

  drawAirstrikes() {
    // Temporary P-51 silhouette. Will be replaced by painted aircraft sprite.
    const g = this.extraUnits;
    for (const strike of this.state.airstrikes) {
      const fraction = strike.time / strike.duration;
      const x = (strike.side === 'blue' ? 245 : 715) + (strike.side === 'blue' ? 520 : -520) * fraction;
      const y = LANES[strike.lane] - 58;
      const dir = strike.side === 'blue' ? 1 : -1;
      g.fillStyle(0xd6d8cb, 0.95).fillTriangle(x + dir * 25, y, x - dir * 20, y - 8, x - dir * 20, y + 8);
      g.fillStyle(0x67735d, 0.95).fillTriangle(x + dir * 3, y, x - dir * 12, y - 17, x - dir * 12, y + 17);
      g.lineStyle(2, 0xffe39c, 0.7).lineBetween(x - dir * 28, y + 5, x - dir * 45, y + 11);
    }
  }

  drawHud(dt) {
    const ui = this.hud, o = this.cardOverlay, s = this.state, bar = this.bar, sc = bar.sc;
    ui.clear(); o.clear();

    // Energie: vulling in het plaatje (10 vakjes) + ring om het medaillon tot het volgende punt.
    const p = BAR_ART.plaque, m = BAR_ART.medal;
    const px = bar.x + p.x * sc, py = bar.y + p.y * sc, pw = p.w * sc, ph = p.h * sc;
    const energy = s.energy.blue, whole = Math.floor(energy);
    const segW = pw / ENERGY_MAX;
    for (let i = 0; i < ENERGY_MAX; i++) {
      const fill = clamp(energy - i, 0, 1);
      if (fill <= 0) continue;
      ui.fillStyle(i < whole ? 0xa05ae6 : 0x6e3aa6, 0.95).fillRect(px + i * segW + 0.6, py + 2, segW * fill - 1.2, ph - 4);
    }
    for (let i = 1; i < ENERGY_MAX; i++) ui.lineStyle(1, 0x1b120a, 0.7).lineBetween(px + i * segW, py + 2, px + i * segW, py + ph - 2);
    this.energyText.setPosition(px + pw / 2, py + ph / 2).setText(String(whole));
    const mx = bar.x + m.x * sc, my = bar.y + m.y * sc, mr = m.r * sc;
    if (whole < ENERGY_MAX) {
      ui.lineStyle(Math.max(2, mr * 0.12), 0xd7a8ff, 0.9)
        .beginPath().arc(mx, my, mr * 1.03, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (energy - whole), false).strokePath();
    } else {
      ui.lineStyle(Math.max(2, mr * 0.12), 0xffe08a, 0.6 + 0.3 * Math.sin(s.time * 6)).strokeCircle(mx, my, mr * 1.03);
    }

    // Kaarten: gekozen kaart komt omhoog met goud; te duur = gedimd.
    this.cards.forEach((c, i) => {
      c.enter = Math.min(1, c.enter + dt / 0.28);
      const card = CARDS[this.hand.slots[i]];
      const sel = i === this.selected, affordable = energy >= card.cost;
      const ease = 1 - Math.pow(1 - c.enter, 3);
      const lift = sel ? -c.h * 0.08 : 0;
      const y = c.y + lift + (1 - ease) * c.h * 0.9;
      const w = CARD_ART.frameWidth * c.k, h = CARD_ART.frameHeight * c.k;
      c.image.setPosition(c.x, y).setScale(c.k).setAlpha(0.3 + 0.7 * ease)
        .setTint(affordable ? 0xffffff : 0x5c5c5c);
      const cardW = c.art.width * c.k;
      if (sel) {
        ui.fillStyle(0xffd76a, 0.45).fillRoundedRect(c.x - cardW / 2 - 4, y - h / 2 - 4, cardW + 8, h + 8, 8);
        o.lineStyle(Math.max(2, c.h * 0.03), 0xffe9a0).strokeRoundedRect(c.x - cardW / 2 - 2, y - h / 2 - 2, cardW + 4, h + 4, 7);
      }
      const left = c.x - w / 2, topY = y - h / 2;
      // naamstrook
      const sh = h * 0.13;
      o.fillStyle(0x1b120a, 0.8).fillRoundedRect(c.x - cardW / 2 + h * 0.04, topY + h - sh - h * 0.03, cardW - h * 0.08, sh, 4);
      c.label.setPosition(c.x, topY + h - sh / 2 - h * 0.03).setAlpha(affordable ? 1 : 0.6);
      // energiejuweel met de echte kosten
      const gx = left + c.art.gemX * c.k, gy = topY + c.art.gemY * c.k, gr = c.art.gemR * c.k + 1.5;
      o.fillStyle(affordable ? 0x7a2fc2 : 0x4a4452).fillCircle(gx, gy, gr);
      o.fillStyle(affordable ? 0xb27af0 : 0x6c6672, 0.9).fillCircle(gx - gr * 0.25, gy - gr * 0.3, gr * 0.5);
      o.lineStyle(Math.max(1.5, gr * 0.12), 0xe8c574).strokeCircle(gx, gy, gr);
      c.cost.setPosition(gx, gy);
    });

    const left = Math.max(0, MATCH_SECONDS - s.time);
    this.header.setText(`LEGION ROYALE   ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}   ${VERSION_LABEL}`);
  }

  drawDebug() {
    const s = this.state;
    this.debugText.setText(s.units.map(u => {
      const t = findById(s, u.targetId);
      return `#${u.id} ${u.side[0]} ${u.card.name.slice(0, 4)} baan${u.lane} x=${u.x.toFixed(0)} hp=${u.hp} ${u.state} -> ${u.targetId ?? '-'} gap=${t ? gap(u, t).toFixed(0) : '-'} cd=${u.cd.toFixed(2)}`;
    }).join('\n'));
  }
}

// Canvas = schermgrootte x pixelratio (begrensd), weergegeven op schermgrootte.
// Bij elke resize/draai wordt het canvas aangepast; de scène herschikt via layout().
const stage = document.getElementById('stage');
function stageSize() {
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2.5, 3200 / w, 3200 / h));
  return { w: Math.round(w * ratio), h: Math.round(h * ratio), ratio };
}
const initial = stageSize();
const game = new Phaser.Game({
  type: Phaser.AUTO, parent: stage, width: initial.w, height: initial.h,
  backgroundColor: '#15100a',
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / initial.ratio },
  render: { antialias: true, roundPixels: false },
  scene: [Battle],
});
let resizeTimer = null;
function resizeGame() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const size = stageSize();
    if (size.w === game.scale.width && size.h === game.scale.height) return;
    game.scale.resize(size.w, size.h);
    game.scale.setZoom(1 / size.ratio);   // ná resize: zet ook de CSS-maat van het canvas
  }, 50);
}
window.addEventListener('resize', resizeGame);
window.addEventListener('orientationchange', resizeGame);
window.visualViewport?.addEventListener('resize', resizeGame);
document.addEventListener('fullscreenchange', resizeGame);
