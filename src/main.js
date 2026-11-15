import Phaser from 'phaser';
import './style.css';
import { W, LANES, FIELD_BOTTOM, CARDS, DEPLOY_ZONE, MATCH_SECONDS, ENERGY_MAX } from './sim/config.js';
import * as sim from './sim/battle.js';
import { createHand, playFromHand, HAND_SIZE } from './sim/hand.js';
import UNIT_ART from './art/units.json';
import WORLD_ART from './art/world.json';
import CARD_ART from './art/cards.json';
import BAR_ART from './art/cardbar.json';
import FX_ART from './art/effects.json';
import SCREEN_ART from './art/screens.json';
import { VERSION_LABEL, BUILD, ensureLatestBuild } from './version.js';
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
// Art staat in public/ en heeft geen hash in de bestandsnaam. Het ?v=<build>-achtervoegsel
// dwingt browsers na elke update de nieuwe versie op te halen (anders: verschoven kaarten e.d.).
const art = file => ART + file + '?v=' + BUILD;
const SIM_STEP = 1 / 60;            // vaste simulatiestap, onafhankelijk van de framerate
const TEAM = { blue: 0x4f9be8, red: 0xe0513f };
const ZONE = DEPLOY_ZONE.blue;
const FONT = 'Georgia, "Times New Roman", serif';
const DEBUG = new URLSearchParams(location.search).has('debug');
const COUNTDOWN = 5;                // seconden kijktijd voordat het gevecht begint
const BAR_OVERLAP = 266;            // bovenrand kaartenbalk; banen en kastelen eindigen erboven
const PORTRAIT_TOP = 120;           // kopstrook in portret
const BAR_MAX_LANDSCAPE = 0.33;     // balkschaal liggend/desktop: balk ≈ 30% van de hoogte, veld ≈ 70%
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Geluid aan/uit wordt onthouden. Er is nog geen geluid, maar elk toekomstig geluid via
// Phaser (this.sound) volgt deze instelling automatisch.
const soundOn = () => { try { return localStorage.getItem('lr-sound') !== 'off'; } catch { return true; } };
const setSoundOn = (game, on) => { try { localStorage.setItem('lr-sound', on ? 'on' : 'off'); } catch {} game.sound.mute = !on; };

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


// Laadt alle art, toont de voortgang op het laadscherm (index.html) en maakt de animaties.
class Boot extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    this.load.on('progress', p => window.__splash?.progress(p));
    this.load.image('arena', art('arena.jpg'));
    for (const def of Object.values(UNIT_ART)) {
      for (const key of def.textures) {
        this.load.spritesheet(key, art(key + '.png'), { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
      }
    }
    this.load.image('cardbar', art('cardbar.webp'));
    this.load.spritesheet('cards', art('cards.png'), { frameWidth: CARD_ART.frameWidth, frameHeight: CARD_ART.frameHeight });
    for (const kind of ['tower', 'castle']) {
      for (const side of ['blue', 'red']) {
        const def = WORLD_ART[kind];
        this.load.spritesheet(`${kind}-${side}`, art(`${kind}-${side}.png`), { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
      }
    }
    this.load.spritesheet('fx-fire', art('fx-fire.jpg'), { frameWidth: FX_ART.fire.frameWidth, frameHeight: FX_ART.fire.frameHeight });
    for (const side of ['blue', 'red']) {
      this.load.spritesheet(`p51-${side}`, art(`p51-${side}.png`), { frameWidth: FX_ART.p51.frameWidth, frameHeight: FX_ART.p51.frameHeight });
    }
    this.load.image('menu-bg', art('menu-bg.webp'));
    for (const key of Object.keys(SCREEN_ART)) this.load.image(key, art(key + '.webp'));
  }

  create() {
    for (const [type, def] of Object.entries(UNIT_ART)) {
      const card = CARDS.find(c => c.type === type);
      for (const tex of def.textures) {
        for (const [name, frames] of Object.entries(def.anims)) {
          const key = `${tex}:${name}`;
          if (this.anims.exists(key)) continue;
          // Aanvalsanimatie past altijd binnen de aanvalssnelheid.
          const duration = name === 'attack' ? Math.min(card.rate * 0.85, 0.75) : null;
          const frameRate = duration ? frames.length / duration
            : { idle: 5, walk: 10, hit: 12, death: 9, heal: 10, charm: 8, cloak: 10, reveal: 12 }[name] ?? 10;
          this.anims.create({ key, frames: frames.map(frame => ({ key: tex, frame })), frameRate,
            repeat: ['idle', 'walk', 'charm'].includes(name) ? -1 : 0 });
        }
      }
    }
    this.anims.create({ key: 'fx-fire:burst', frames: this.anims.generateFrameNumbers('fx-fire'), frameRate: 14 });
    this.anims.create({ key: 'fx-fire:burn', frames: this.anims.generateFrameNumbers('fx-fire', { frames: [2, 3, 4, 3] }), frameRate: 10, repeat: -1 });
    this.sound.mute = !soundOn();
    window.__splash?.done();
    this.scene.start(new URLSearchParams(location.search).has('play') ? 'battle' : 'menu');
  }
}

// Hoofdmenu, opgebouwd uit losse elementen zodat het op elk scherm past.
// Alleen Spelen werkt; de rest toont "binnenkort".
class Menu extends Phaser.Scene {
  constructor() { super('menu'); }

  create() {
    this.bg = this.add.image(0, 0, 'menu-bg');
    this.chars = ['menu-healer', 'menu-legionary', 'menu-samurai', 'menu-pilot'].map(k => this.add.image(0, 0, k).setOrigin(0.5, 1));
    this.titlePlate = this.add.image(0, 0, 'menu-title');
    this.title = this.add.text(0, 0, 'LEGION ROYALE', { fontFamily: FONT, fontStyle: 'bold', color: '#ffd978',
      stroke: '#3a1d05', align: 'center' }).setOrigin(0.5);
    this.title.setShadow(0, 3, '#000000', 6, true, true);
    this.buttons = ['menu-play', 'menu-battle', 'menu-team', 'menu-settings'].map((key, i) => {
      const img = this.add.image(0, 0, key).setInteractive({ useHandCursor: true });
      img.on('pointerover', () => img.setTint(0xfff0c8));
      img.on('pointerout', () => img.clearTint());
      img.on('pointerdown', () => this.press(img, i === 0 ? () => this.play() : i === 3 ? () => this.toggleSound() : null));
      return img;
    });
    this.icons = ['menu-trophy', 'menu-gift', 'menu-bell'].map(key => {
      const img = this.add.image(0, 0, key).setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => this.press(img, null));
      return img;
    });
    this.toast = this.add.text(0, 0, '', { fontFamily: FONT, fontStyle: 'bold', color: '#fff4d6', stroke: '#2a1d10',
      backgroundColor: '#1b130bcc', padding: { x: 14, y: 8 } }).setOrigin(0.5).setDepth(10).setAlpha(0);
    this.version = this.add.text(0, 0, VERSION_LABEL, { fontFamily: FONT, color: '#f5e6c4', stroke: '#000', strokeThickness: 3 }).setOrigin(1, 1);
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    this.layout();
  }

  update(time) {
    // Spelen-knop 'ademt' zacht; schaal = layout-schaal x puls.
    const b = this.buttons[0];
    if (b.baseScale) b.setScale(b.baseScale * (b.pressed ? 0.94 : 1 + 0.025 * Math.sin(time / 300)));
  }

  press(img, action) {
    img.pressed = true; img.setScale(img.baseScale * 0.94);
    this.time.delayedCall(120, () => { img.pressed = false; img.setScale(img.baseScale); });
    if (action) { this.time.delayedCall(140, action); return; }
    this.toast.setText('Coming soon').setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1100, duration: 400 });
  }

  toggleSound() {
    setSoundOn(this.game, !soundOn());
    this.toast.setText(soundOn() ? 'Sound on' : 'Sound off').setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1100, duration: 400 });
  }

  play() {
    // Op telefoons: schermvullend en liggend, de fijnste manier om te spelen.
    if (this.sys.game.device.input.touch && this.scale.fullscreen.available && !this.scale.isFullscreen) {
      try { this.scale.startFullscreen(); screen.orientation?.lock?.('landscape').catch(() => {}); } catch {}
    }
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('battle'));
  }

  layout() {
    const w = this.scale.width, h = this.scale.height, portrait = w / h < 1.1;
    this.cameras.main.setViewport(0, 0, w, h);
    const bgs = Math.max(w / this.bg.width, h / this.bg.height);
    this.bg.setPosition(w / 2, h / 2).setScale(bgs);
    // Middenkolom: titelbord + 4 knoppen, past altijd in breedte en hoogte.
    const colW = Math.min(w * (portrait ? 0.86 : 0.36), 640);
    const tS = colW * 1.18 / SCREEN_ART['menu-title'].width;
    const bS = colW / SCREEN_ART['menu-play'].width;
    const titleH = SCREEN_ART['menu-title'].height * tS, btnH = SCREEN_ART['menu-play'].height * bS;
    const gap = btnH * 0.1, total = titleH + btnH * 0.35 + 4 * btnH + 3 * gap;
    const k = Math.min(1, (h * 0.9) / total);              // lage schermen: alles iets kleiner
    let y = h / 2 - total * k / 2;
    this.titlePlate.setScale(tS * k).setPosition(w / 2, y + titleH * k / 2);
    this.title.setPosition(w / 2, y + titleH * k * 0.56).setFontSize(Math.round(titleH * k * 0.27))
      .setStroke('#3a1d05', Math.max(3, titleH * k * 0.025));
    y += titleH * k + btnH * 0.35 * k;
    this.buttons.forEach(b => { b.baseScale = bS * k; b.setScale(bS * k).setPosition(w / 2, y + btnH * k / 2); y += (btnH + gap) * k; });
    // Iconen rechtsboven
    const iS = Math.min(h, w) * 0.12 / SCREEN_ART['menu-trophy'].width, iW = SCREEN_ART['menu-trophy'].width * iS;
    this.icons.forEach((ic, i) => (ic.baseScale = iS, ic).setScale(iS).setPosition(w - iW * (2.6 - i) * 1.08 - iW * 0.3, iW * 0.7));
    // Personages aan de zijkanten, alleen als er ruimte is
    const side = (w - colW) / 2, show = !portrait && side > w * 0.18;
    const ch = h * 0.62;
    const place = [[0.16, 0], [0.33, 1], [0.67, 2], [0.86, 3]];
    for (const [fx, idx] of place) {
      const c = this.chars[idx];
      c.setVisible(show).setScale(ch / c.height).setPosition(w * fx, h + 2).setFlipX(false);
    }
    this.toast.setPosition(w / 2, h * 0.92).setFontSize(Math.max(16, Math.round(h * 0.03)));
    this.version.setPosition(w - 10, h - 8).setFontSize(Math.max(11, Math.round(h * 0.018)));
    for (const t of [this.title, this.toast, this.version]) t.setResolution(1);
  }
}

class Battle extends Phaser.Scene {
  constructor() { super('battle'); }

  text(x, y, str, size, color = '#fff4d6', extra = {}) {
    const t = this.add.text(x, y, str, textStyle(size, color, extra));
    t.baseSize = size;
    this.texts.push(t);
    return t;
  }

  create() {
    this.texts = [];
    this.state = createBattle();
    this.accumulator = 0;
    this.selected = null;          // gekozen vak in de hand (0..3), of null
    this.hand = createHand(CARDS.length, this.state.rng);
    this.views = new Map();        // eenheid-id -> { sprite, type, lockUntil, flashUntil }
    this.projectiles = [];         // puur visueel
    this.sparks = [];
    this.planes = new Map();       // P-51 overvluchten: strike-id -> sprite
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
    this.createPauseMenu();

    this.input.on('pointerdown', (p, over) => {
      if (over.length || this.state.ended) return;   // tik op een kaart of knop
      this.tryDeploy(p.worldX, p.worldY);
    });
    this.input.keyboard?.on('keydown-R', () => this.scene.restart());
    this.input.keyboard?.on('keydown', e => {
      const slot = Number(e.key) - 1;                  // toetsen 1-4 kiezen een kaart
      if (slot >= 0 && slot < HAND_SIZE) this.selectSlot(slot);
    });
    // Aftelling: het veld is zichtbaar, maar de simulatie (energie, AI, eenheden) staat stil.
    this.countdown = DEBUG && new URLSearchParams(location.search).has('nowait') ? 0 : COUNTDOWN;
    if (this.countdown > 0) this.message.setText('Look at the battlefield…');
    this.countText = this.add.text(W / 2, FIELD_BOTTOM / 2 - 20, '', textStyle(64, '#ffe08a', { strokeThickness: 10 }))
      .setOrigin(0.5).setDepth(2500);
    this.texts.push(this.countText);
    this.countSub = this.text(W / 2, FIELD_BOTTOM / 2 + 30, 'Battle starts in', 14, '#f5e6c4').setOrigin(0.5).setDepth(2500)
      .setVisible(this.countdown > 0);
    ensureLatestBuild().then(status => {
      if (status === 'stale') this.message.setText('New version available — refresh the page');
    });

    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    this.layout();
  }

  tryDeploy(x, y) {
    if (this.paused) return;
    if (this.countdown > 0) { this.message.setText('Wait for the battle to start'); return; }
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

  // Pauzeknop linksboven: hervatten, geluid, opnieuw beginnen, opgeven (Esc werkt ook).
  createPauseMenu() {
    this.paused = false;
    this.pauseIcon = this.add.graphics().setDepth(1200);
    this.pauseButton = this.add.zone(0, 0, 30, 30).setInteractive({ useHandCursor: true }).setDepth(1300);
    this.pauseButton.on('pointerdown', () => this.setPaused(true));
    this.input.keyboard?.on('keydown-ESC', () => this.setPaused(!this.paused));

    const cx = W / 2, cy = FIELD_BOTTOM / 2;
    const shade = this.add.rectangle(cx, cy, W * 6, 2000, 0x000000, 0.55).setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(0x1b130b, 0.96).fillRoundedRect(cx - 150, cy - 128, 300, 256, 14);
    panel.lineStyle(3, 0xd9b26a).strokeRoundedRect(cx - 150, cy - 128, 300, 256, 14);
    const title = this.text(cx, cy - 102, 'PAUSED', 24, '#ffd978').setOrigin(0.5);
    const button = (y, label, action, color = '#fff4d6') => {
      const t = this.text(cx, y, label, 16, color, { backgroundColor: '#3b2a18', padding: { x: 16, y: 7 }, fixedWidth: 220, align: 'center' })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setBackgroundColor('#5a4128'));
      t.on('pointerout', () => t.setBackgroundColor('#3b2a18'));
      t.on('pointerdown', action);
      return t;
    };
    const resume = button(cy - 58, 'RESUME', () => this.setPaused(false));
    this.soundButton = button(cy - 14, '', () => { setSoundOn(this.game, !soundOn()); this.refreshSoundLabel(); });
    const restart = button(cy + 30, 'RESTART', () => { this.setPaused(false); this.scene.restart(); });
    const surrender = button(cy + 74, 'SURRENDER', () => {
      this.setPaused(false);
      if (!this.state.ended) { this.state.ended = true; this.state.winner = 'red'; this.showResult('red'); }
    }, '#ffc0b5');
    this.pauseLayer = this.add.container(0, 0, [shade, panel, title, resume, this.soundButton, restart, surrender])
      .setDepth(4000).setVisible(false);
    this.refreshSoundLabel();
  }

  refreshSoundLabel() { this.soundButton.setText(soundOn() ? 'SOUND: ON' : 'SOUND: OFF'); }

  setPaused(on) {
    if (this.state.ended && on) return;
    this.paused = on;
    this.pauseLayer.setVisible(on);
    if (on) { this.anims.pauseAll(); this.tweens.pauseAll(); this.selected = null; }
    else { this.anims.resumeAll(); this.tweens.resumeAll(); }
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
    this.pauseButton.setPosition(18, fy + 2);
    this.pauseIcon.clear().fillStyle(0x1b130b, 0.75).fillRoundedRect(4, fy - 12, 28, 28, 6)
      .lineStyle(2, 0xd9b26a).strokeRoundedRect(4, fy - 12, 28, 28, 6)
      .fillStyle(0xf1dcae).fillRect(12, fy - 5, 4, 14).fillRect(20, fy - 5, 4, 14);
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
        const healer = this.views.get(e.attackerId);
        if (healer) {
          healer.sprite.anims.play(`${healer.sprite.texture.key}:heal`);
          healer.lockUntil = now + healer.sprite.anims.currentAnim.duration;
        }
        const ally = this.state.units.find(u => u.id === e.targetId);
        this.sparks.push({ x: e.to.x, y: (ally ? footY(ally) : e.to.y) - 30, t: 0, dur: 0.55, color: 0xffe27a, heal: true });
      } else if (e.type === 'cloak') {
        const v = this.views.get(e.id);
        if (v) {
          v.revealed = false;                       // volgende klap = reveal strike
          v.sprite.setAlpha(1).anims.play(`${v.sprite.texture.key}:cloak`);
          v.lockUntil = now + v.sprite.anims.currentAnim.duration;
          v.cloaking = v.lockUntil;
        }
      } else if (e.type === 'possess') {
        const target = this.state.units.find(u => u.id === e.targetId);
        this.sparks.push({ x: e.x, y: (target ? footY(target) : e.y) - 30, t: 0, dur: 0.7, color: 0xff7ad9, heal: true });
      } else if (e.type === 'hit') {
        const attacker = this.views.get(e.attackerId);
        if (attacker?.sprite && now >= (attacker.sameTick ?? 0)) {
          // Samoerai: eerste klap uit de schaduw is de 'reveal strike'.
          const anim = attacker.type === 'samurai' && !attacker.revealed ? 'reveal' : 'attack';
          if (attacker.type === 'samurai') attacker.revealed = true;
          attacker.sprite.anims.play(`${attacker.sprite.texture.key}:${anim}`);
          attacker.lockUntil = now + attacker.sprite.anims.currentAnim.duration;
          attacker.sameTick = now + 1;   // vuurpot raakt meerdere: animatie maar één keer
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
          view.burn?.destroy();
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
    if (MELEE_KINDS.has(e.kind)) {
      this.sparks.push({ x: e.to.x - dir * 6, y: targetY, t: 0, dur: 0.22, color: 0xfff1b8 });
      return;
    }
    if (e.kind === 'p51') {   // kogelregen uit het vliegtuig
      const lane = this.state.units.find(u => u.id === e.targetId)?.lane ?? 0;
      for (let i = 0; i < 3; i++) this.projectiles.push({ kind: 'bullet', x0: e.to.x - dir * (30 + i * 8), y0: LANES[lane] - 62,
        x1: e.to.x + (i - 1) * 6, y1: targetY + 10, t: -i * 0.04, dur: 0.12, arc: 0 });
      this.sparks.push({ x: e.to.x, y: targetY + 8, t: 0, dur: 0.3, color: 0xffc04a, big: true });
      return;
    }
    if (e.kind === 'firethrower') {   // één vuurpot per worp, ook al raakt hij meerdere vijanden
      const key = e.attackerId + ':' + Math.round(this.state.time * 10);
      if (this.lastPot === key) return;
      this.lastPot = key;
    }
    let x0, y0;
    const attacker = this.state.units.find(u => u.id === e.attackerId);
    if (attacker) {
      x0 = attacker.x + dir * ({ musket: 30, healer: 34 }[e.kind] ?? 22);
      y0 = footY(attacker) - ({ cannon: 26, horse_archer: 50, musket: 38, healer: 40, firethrower: 44 }[e.kind] ?? 34);
      if (e.kind === 'musket') this.sparks.push({ x: x0, y: y0, t: 0, dur: 0.12, color: 0xffc04a });
    }
    else { x0 = e.from.x; y0 = this.structureTop(e.attackerId) + 10; }
    const dist = Math.abs(e.to.x - x0);
    const kind = { cannon: 'ball', musket: 'bullet', healer: 'bolt', firethrower: 'pot' }[e.kind] ?? 'arrow';
    this.projectiles.push({ kind, x0, y0, x1: e.to.x, y1: targetY,
      t: 0, dur: Math.max(e.kind === 'musket' ? 0.06 : 0.12, dist / ({ cannon: 520, musket: 1600, healer: 900, firethrower: 420 }[e.kind] ?? 760)),
      arc: { cannon: 26, musket: 0, healer: 0, firethrower: 34 }[e.kind] ?? 10 });
  }

  structureTop(id) {
    const i = this.state.structures.findIndex(s => s.id === id);
    return i >= 0 ? this.structureViews[i].top : 100;
  }

  showResult(winner) {
    const g = this.add.graphics().setDepth(3000);
    g.fillStyle(0x1b130b, 0.9).fillRoundedRect(W / 2 - 220, 72, 440, 120, 14);
    g.lineStyle(3, 0xd9b26a).strokeRoundedRect(W / 2 - 220, 72, 440, 120, 14);
    this.text(W / 2, 112, winner === 'blue' ? 'VICTORY!' : 'DEFEAT!', 34, winner === 'blue' ? '#c4f3c0' : '#ffc0b5').setOrigin(0.5).setDepth(3001);
    const again = this.text(W / 2 - 90, 162, 'PLAY AGAIN', 15).setOrigin(0.5).setDepth(3001);
    const menu = this.text(W / 2 + 90, 162, 'MENU', 15, '#e6d2a6').setOrigin(0.5).setDepth(3001);
    for (const t of this.texts) t.setResolution(clamp(Math.ceil(this.view.zoom), 1, 4));
    this.selected = null;
    this.time.delayedCall(400, () => {
      again.setInteractive({ useHandCursor: true }).once('pointerdown', () => this.scene.restart());
      menu.setInteractive({ useHandCursor: true }).once('pointerdown', () => this.scene.start('menu'));
    });
  }

  update(_time, delta) {
    const dt = Math.min(delta / 1000, 0.1);
    if (this.paused) return;
    if (this.countdown > 0) {
      const before = Math.ceil(this.countdown);
      this.countdown = Math.max(0, this.countdown - dt);
      const n = Math.ceil(this.countdown);
      if (n > 0) {
        this.countText.setText(String(n));
        if (n !== before || !this.countText.scaleBase) { this.countText.scaleBase = 1; this.tweens.add({ targets: this.countText, scale: { from: 1.5, to: 1 }, duration: 300, ease: 'Back.easeOut' }); }
      } else {
        this.countSub.setVisible(false);
        this.countText.setText('FIGHT!').setScale(1.4);
        this.tweens.add({ targets: this.countText, scale: 1, alpha: 0, delay: 500, duration: 500 });
        this.message.setText('Choose a card, then select a blue lane');
      }
    } else {
      this.accumulator += dt;
    }
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
      const sprite = this.add.sprite(u.x, footY(u), unitTexture(u.card.type, u.side), def.anims.idle[0])
        .setOrigin(def.originX, def.originY).setScale(1 / TEX);
      this.views.set(u.id, { sprite, type: u.card.type, side: u.side, lockUntil: 0, flashUntil: 0, burn: null, revealed: false });
    }
  }

  drawUnits() {
    const now = this.time.now, g = this.ground, b = this.bars;
    g.clear(); b.clear();
    for (const u of this.state.units) {
      const v = this.views.get(u.id);
      const fy = footY(u);
      // Overgenomen door een spion: andere teamkleur.
      if (v.side !== u.side) {
        v.side = u.side;
        v.sprite.setTexture(unitTexture(u.card.type, u.side));
        v.lockUntil = 0;
        v.charmUntil = now + 700;
      }
      // Schaduwsamoerai: eigen speler ziet een schim, de tegenstander niets.
      // tijdens de cloak-animatie nog zichtbaar, daarna schim (eigen) of onzichtbaar (vijand)
      const alpha = u.hidden && now >= (v.cloaking ?? 0) ? (u.side === 'blue' ? 0.35 : 0) : 1;
      // Gespiegeld (naar links) moet ook het ankerpunt (de voeten) mee spiegelen,
      // anders staat een brede sprite naast zijn eigen schaduw en levensbalk.
      const ud = UNIT_ART[u.card.type], flip = u.facing < 0;
      v.sprite.setPosition(u.x, fy).setFlipX(flip).setOrigin(flip ? 1 - ud.originX : ud.originX, ud.originY)
        .setDepth(fy).setAlpha(alpha);
      if (now >= v.lockUntil) {
        const anim = u.state === 'move' ? 'walk' : u.card.type === 'spy' && u.channelTargetId ? 'charm' : 'idle';
        v.sprite.anims.play(`${v.sprite.texture.key}:${anim}`, true);
      }
      if (now < v.flashUntil) v.sprite.setTint(0xff9a8a);
      else if (now < (v.charmUntil ?? 0)) v.sprite.setTint(0xffa6e8);
      else if (u.hidden) v.sprite.setTint(0xb48cff);
      else v.sprite.clearTint();
      // Brandende eenheden: vlammetjes (additief).
      if (u.burnRemaining > 0) {
        if (!v.burn) v.burn = this.add.sprite(u.x, fy, 'fx-fire').setOrigin(0.5, 1).setScale(0.22)
          .setBlendMode(Phaser.BlendModes.ADD).play('fx-fire:burn');
        v.burn.setPosition(u.x, fy - 6).setDepth(fy + 0.5).setAlpha(Math.min(1, u.burnRemaining));
      } else if (v.burn) { v.burn.destroy(); v.burn = null; }

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
      if (p.t < 0) return true;
      if (p.kind === 'bolt') {
        g.fillStyle(0x4fb4ff, 0.35).fillCircle(x, y, 6);
        g.fillStyle(0xbfe6ff).fillCircle(x, y, 2.6);
        g.lineStyle(2, 0x6fc6ff, 0.6).lineBetween(x - Math.sign(p.x1 - p.x0) * 14, y, x, y);
      } else if (p.kind === 'pot') {
        g.fillStyle(0xff9a2e, 0.45).fillCircle(x - Math.sign(p.x1 - p.x0) * 5, y - 2, 6);
        g.fillStyle(0x9a5428).fillCircle(x, y, 3.8);
        g.fillStyle(0xffd36b).fillCircle(x, y - 3, 2);
      } else if (p.kind === 'bullet') {
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
      if (k >= 1 && p.kind === 'pot') {
        this.add.sprite(p.x1, p.y1 + 30, 'fx-fire').setOrigin(0.5, 1).setScale(0.42).setDepth(p.y1 + 40)
          .setBlendMode(Phaser.BlendModes.ADD).play('fx-fire:burst').once('animationcomplete', (_a, _f, spr) => spr.destroy());
        return false;
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
      if (s.heal) {   // opstijgende gouden (genezen) of roze (betoverd) glinsters
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05 + s.x, rr = 8 + 6 * Math.sin(a * 3);
          g.fillStyle(s.color, (1 - k) * 0.9).fillCircle(s.x + Math.cos(a) * rr, s.y - k * 22 + Math.sin(a) * 5, 1.8);
        }
        g.fillStyle(s.color, (1 - k) * 0.25).fillCircle(s.x, s.y, 14 * (0.5 + k));
        return true;
      }
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
    const live = new Set();
    for (const strike of this.state.airstrikes) {
      live.add(strike.id);
      const fraction = strike.time / strike.duration;
      const x = (strike.side === 'blue' ? 245 : 715) + (strike.side === 'blue' ? 520 : -520) * fraction;
      const y = LANES[strike.lane] - 64 - Math.sin(fraction * Math.PI) * 10;
      let plane = this.planes.get(strike.id);
      if (!plane) {
        plane = this.add.sprite(x, y, `p51-${strike.side}`, 1).setScale(0.55).setDepth(900).setFlipX(strike.side === 'red');
        this.planes.set(strike.id, plane);
      }
      const firing = strike.hitIds.length && Math.floor(this.time.now / 70) % 2 === 0;
      plane.setPosition(x, y).setFrame(firing ? 2 : 1 + 2 * (Math.floor(this.time.now / 60) % 2))
        .setAngle(strike.side === 'blue' ? 4 : -4);
      this.ground.fillStyle(0x000000, 0.18).fillEllipse(x, LANES[strike.lane] + 10, 60, 8);
    }
    for (const [id, plane] of this.planes) {
      if (live.has(id)) continue;
      this.planes.delete(id);
      this.tweens.add({ targets: plane, x: plane.x + (plane.flipX ? -220 : 220), y: plane.y - 70, alpha: 0, duration: 600,
        onComplete: () => plane.destroy() });
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
  scene: [Boot, Menu, Battle],
});
if (DEBUG) window.__game = game;
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
