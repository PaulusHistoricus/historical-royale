import Phaser from 'phaser';
import './style.css';
import { W, H, LANES, FIELD_BOTTOM, CARDS, DEPLOY_ZONE, MATCH_SECONDS, ENERGY_MAX } from './sim/config.js';
import * as sim from './sim/battle.js';
import UNIT_ART from './art/units.json';
import WORLD_ART from './art/world.json';
import { VERSION_LABEL, ensureLatestBuild } from './version.js';
const { createBattle, deploy, step, findById, gap } = sim;

// Dit bestand bevat ALLEEN weergave en invoer. Alle spelregels (lopen, doelwit
// kiezen, aanvallen, schade, AI, energie) staan in src/sim/ en worden getest in
// tests/. Art wordt gemaakt met tools/art/build.py; zie art/README.md.

const ZOOM = 2;                    // canvas = 2x wereld, zodat art en tekst scherp blijven op telefoons
const ART = import.meta.env.BASE_URL + 'assets/art/';
const SIM_STEP = 1 / 60;           // vaste simulatiestap, onafhankelijk van de framerate
const TEAM = { blue: 0x4f9be8, red: 0xe0513f };
const ZONE = DEPLOY_ZONE.blue;
const FONT = 'Georgia, "Times New Roman", serif';
const DEBUG = new URLSearchParams(location.search).has('debug');

// Waar voeten en gebouwen in de arena-art staan (wereldpixels).
const footY = u => LANES[u.lane] + 8 + (u.y - LANES[u.lane]) * 0.6;
const STRUCTURE_FOOT = { tower: lane => LANES[lane] + 20, castle: () => 246 };
const UNIT_HEIGHT = { melee: 56, archer: 58, cannon: 54, cavalry: 63, berserker: 56, horse_archer: 62, musket: 56 };   // voor de levensbalk

const unitTexture = (type, side) => {
  const list = UNIT_ART[type].textures;
  return list.find(t => t.endsWith('-' + side)) ?? list[0];
};
const text = (scene, x, y, str, size, color = '#fff4d6', extra = {}) =>
  scene.add.text(x, y, str, { fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold', color,
    stroke: '#2a1d10', strokeThickness: Math.max(2, size / 5), resolution: ZOOM, ...extra });

class Battle extends Phaser.Scene {
  constructor() { super('battle'); }

  preload() {
    this.load.image('arena', ART + 'arena.jpg');
    for (const def of Object.values(UNIT_ART)) {
      for (const key of def.textures) {
        this.load.spritesheet(key, ART + key + '.png', { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
      }
    }
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
    this.cameras.main.setZoom(ZOOM).centerOn(W / 2, H / 2);
    this.createAnimations();
    this.state = createBattle();
    this.accumulator = 0;
    this.selected = 0;
    this.views = new Map();        // eenheid-id -> { sprite, type, lockUntil, flashUntil }
    this.projectiles = [];         // puur visueel
    this.sparks = [];
    if (DEBUG) window.__HR__ = { scene: this, state: this.state, sim };

    this.add.image(0, 0, 'arena').setOrigin(0, 0).setScale(W / WORLD_ART.arena.width).setDepth(-10);
    this.drawDeployZones();
    this.structureViews = this.state.structures.map(s => {
      const def = WORLD_ART[s.kind];
      const foot = STRUCTURE_FOOT[s.kind](s.lane);
      const sprite = this.add.sprite(s.x, foot, `${s.kind}-${s.side}`, 0)
        .setOrigin(0.5, (def.frameHeight - 2) / def.frameHeight).setScale(1 / ZOOM).setDepth(foot);
      return { sprite, foot, top: foot - def.frameHeight / ZOOM + 6, flashUntil: 0 };
    });

    this.ground = this.add.graphics().setDepth(1);
    this.tempUnits = this.add.graphics().setDepth(600); // tijdelijke silhouetten tot echte art is gemaakt      // teamcirkels onder eenheden
    this.fx = this.add.graphics().setDepth(1000);       // projectielen, vonken
    this.bars = this.add.graphics().setDepth(1010);     // levensbalken
    this.hud = this.add.graphics().setDepth(1100);

    this.header = text(this, W / 2, 13, '', 13).setOrigin(0.5).setDepth(1200);
    this.message = text(this, W / 2, FIELD_BOTTOM - 11, 'Kies een kaart en tik op een baan in het blauwe vak', 10).setOrigin(0.5).setDepth(1200);
    this.debugText = this.add.text(6, 26, '', { fontFamily: 'monospace', fontSize: '7px', color: '#fff', backgroundColor: '#000000aa', resolution: ZOOM })
      .setDepth(2000).setVisible(DEBUG);
    this.createCards();

    this.input.on('pointerdown', p => {
      const x = p.worldX, y = p.worldY;
      if (this.state.ended || y >= FIELD_BOTTOM || y < 40 || x < ZONE.min || x > ZONE.max) return;
      const lane = Math.abs(y - LANES[0]) <= Math.abs(y - LANES[1]) ? 0 : 1;
      if (Math.abs(y - LANES[lane]) > 48) return;
      this.message.setText(deploy(this.state, 'blue', lane, this.selected, x)
        ? 'Verdedig beide banen en breek door naar het kasteel!'
        : 'Niet genoeg energie voor deze kaart');
    });
    this.input.keyboard?.on('keydown-R', () => this.scene.restart());
    ensureLatestBuild().then(status => {
      if (status === 'stale') this.message.setText('Er staat een nieuwere versie online — herlaad de pagina');
    });
  }

  drawDeployZones() {
    const g = this.add.graphics().setDepth(0);
    for (const y of LANES) {
      g.fillStyle(0x6fc2ff, 0.13).fillRoundedRect(ZONE.min, y - 22, ZONE.max - ZONE.min, 46, 6);
      g.lineStyle(1.5, 0x9fdcff, 0.55).strokeRoundedRect(ZONE.min, y - 22, ZONE.max - ZONE.min, 46, 6);
    }
  }

  // Tijdelijke compacte selectors. De definitieve geïllustreerde kaarten volgen als laatste stap.
  createCards() {
    const gap = 7, margin = 14, cardW = (W - 2 * margin - 6 * gap) / 7;
    const cardH = 82, top = FIELD_BOTTOM + 31;
    this.cards = CARDS.map((card, i) => {
      const x = margin + cardW / 2 + i * (cardW + gap);
      const zone = this.add.zone(x, top + cardH / 2, cardW, cardH).setInteractive({ useHandCursor: true }).setDepth(1300);
      zone.on('pointerdown', () => {
        if (this.state.ended) return;
        this.selected = i;
        this.message.setText(card.name + ' geselecteerd — tik op een blauwe baan');
      });
      let icon = null;
      if (UNIT_ART[card.type]) {
        const tex = unitTexture(card.type, 'blue');
        const def = UNIT_ART[card.type];
        icon = this.add.image(x, top + 48, tex, def.anims.idle[0])
          .setOrigin(def.originX, def.originY).setScale(0.35).setDepth(1150);
      } else {
        text(this, x, top + 43, { cavalry: '♞', berserker: '⚔', horse_archer: '➶', musket: '✦' }[card.type], 22)
          .setOrigin(0.5).setDepth(1150);
      }
      text(this, x, top + 8, card.name, 9, '#fff4d6', { wordWrap: { width: cardW - 8 }, align: 'center' })
        .setOrigin(0.5, 0).setDepth(1150);
      text(this, x, top + 70, String(card.cost) + ' energie', 10, '#f2d9ab').setOrigin(0.5).setDepth(1150);
      return { x, top, w: cardW, h: cardH, icon };
    });
  }

  // Vertaalt gebeurtenissen uit de simulatie naar animaties en effecten.
  handleEvents(events) {
    const now = this.time.now;
    for (const e of events) {
      if (e.type === 'hit') {
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
    if (['melee', 'cavalry', 'berserker'].includes(e.kind)) {
      this.sparks.push({ x: e.to.x - dir * 6, y: targetY, t: 0, dur: 0.22, color: 0xfff1b8 });
      return;
    }
    let x0, y0;
    const attacker = this.state.units.find(u => u.id === e.attackerId);
    if (attacker) { x0 = attacker.x + dir * 22; y0 = footY(attacker) - (e.kind === 'cannon' ? 26 : 34); }
    else { x0 = e.from.x; y0 = this.structureTop(e.attackerId) + 10; }
    const dist = Math.abs(e.to.x - x0);
    this.projectiles.push({ kind: e.kind === 'cannon' ? 'ball' : e.kind === 'musket' ? 'bullet' : 'arrow', x0, y0, x1: e.to.x, y1: targetY,
      t: 0, dur: Math.max(0.12, dist / (e.kind === 'cannon' ? 520 : 760)), arc: e.kind === 'cannon' ? 26 : 10 });
  }

  structureTop(id) {
    const i = this.state.structures.findIndex(s => s.id === id);
    return i >= 0 ? this.structureViews[i].top : 100;
  }

  showResult(winner) {
    const g = this.add.graphics().setDepth(3000);
    g.fillStyle(0x1b130b, 0.9).fillRoundedRect(W / 2 - 220, 92, 440, 120, 14);
    g.lineStyle(3, 0xd9b26a).strokeRoundedRect(W / 2 - 220, 92, 440, 120, 14);
    text(this, W / 2, 132, winner === 'blue' ? 'OVERWINNING!' : 'VERLOREN!', 34, winner === 'blue' ? '#c4f3c0' : '#ffc0b5').setOrigin(0.5).setDepth(3001);
    text(this, W / 2, 180, 'Tik om opnieuw te spelen', 15).setOrigin(0.5).setDepth(3001);
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
    this.drawHud();
    if (DEBUG) this.drawDebug();
  }

  syncUnitViews() {
    for (const u of this.state.units) {
      if (this.views.has(u.id)) continue;
      const def = UNIT_ART[u.card.type];
      const sprite = def
        ? this.add.sprite(u.x, footY(u), unitTexture(u.card.type, u.side), def.anims.idle[0])
          .setOrigin(def.originX, def.originY).setScale(1 / ZOOM)
        : null;
      this.views.set(u.id, { sprite, type: u.card.type, lockUntil: 0, flashUntil: 0 });
    }
  }

  drawUnits() {
    const now = this.time.now, g = this.ground, b = this.bars;
    g.clear(); b.clear(); this.tempUnits.clear();
    for (const u of this.state.units) {
      const v = this.views.get(u.id);
      const fy = footY(u);
      if (v.sprite) {
        v.sprite.setPosition(u.x, fy).setFlipX(u.facing < 0).setDepth(fy);
        if (now >= v.lockUntil) v.sprite.anims.play(`${v.sprite.texture.key}:${u.state === 'move' ? 'walk' : 'idle'}`, true);
        if (now < v.flashUntil) v.sprite.setTint(0xff9a8a); else v.sprite.clearTint();
      } else {
        const pg = this.tempUnits, color = now < v.flashUntil ? 0xffdddd : TEAM[u.side];
        const tall = u.card.type === 'cavalry' || u.card.type === 'horse_archer';
        pg.fillStyle(0x251b14, 0.9).fillEllipse(u.x, fy - 7, tall ? 37 : 20, 13);
        pg.fillStyle(color).fillRoundedRect(u.x - 7, fy - (tall ? 38 : 34), 14, 27, 4);
        pg.fillStyle(0xe4c69b).fillCircle(u.x, fy - (tall ? 42 : 38), 7);
        pg.lineStyle(3, 0xe6d7bd).lineBetween(u.x + u.facing * 4, fy - 26, u.x + u.facing * 18, fy - 34);
      }

      const w = u.card.type === 'cannon' ? 40 : 26;
      g.fillStyle(TEAM[u.side], 0.45).fillEllipse(u.x, fy - 1, w, 7);
      const by = fy - UNIT_HEIGHT[u.card.type];
      b.fillStyle(0x1d1a16, 0.85).fillRect(u.x - 15, by, 30, 4);
      b.fillStyle(TEAM[u.side]).fillRect(u.x - 15, by, 30 * u.hp / u.max, 4);
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
      if (p.kind === 'arrow') {
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

  drawHud() {
    const ui = this.hud, s = this.state;
    ui.clear();
    ui.fillGradientStyle(0x3b2a18, 0x3b2a18, 0x1f160c, 0x1f160c, 1).fillRect(0, FIELD_BOTTOM, W, H - FIELD_BOTTOM);
    ui.lineStyle(2, 0xc9a35e).lineBetween(0, FIELD_BOTTOM + 1, W, FIELD_BOTTOM + 1);
    // energiebalk met vakjes
    const ex = 24, ey = FIELD_BOTTOM + 9, ew = W - 48, eh = 12;
    ui.fillStyle(0x140d06).fillRoundedRect(ex - 2, ey - 2, ew + 4, eh + 4, 5);
    ui.fillStyle(0xb06ee8).fillRoundedRect(ex, ey, ew * s.energy.blue / ENERGY_MAX, eh, 4);
    for (let i = 1; i < ENERGY_MAX; i++) ui.lineStyle(1, 0x140d06, 0.8).lineBetween(ex + ew * i / ENERGY_MAX, ey, ex + ew * i / ENERGY_MAX, ey + eh);
    this.cards.forEach((c, i) => {
      const sel = i === this.selected, affordable = s.energy.blue >= CARDS[i].cost;
      ui.fillStyle(sel ? 0x6d5130 : 0x46351f).fillRoundedRect(c.x - c.w / 2, c.top, c.w, c.h, 10);
      ui.lineStyle(sel ? 3 : 1.5, sel ? 0xffd77a : 0x8c7048).strokeRoundedRect(c.x - c.w / 2, c.top, c.w, c.h, 10);
      // De definitieve energiejuwelen en portretten komen met de kaart-art.
      c.icon?.setAlpha(affordable ? 1 : 0.45);
      if (!affordable) ui.fillStyle(0x000000, 0.35).fillRoundedRect(c.x - c.w / 2, c.top, c.w, c.h, 10);
    });
    const left = Math.max(0, MATCH_SECONDS - s.time);
    this.header.setText(`HISTORICAL ROYALE   ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}   Energie ${Math.floor(s.energy.blue)}/${ENERGY_MAX}   ${VERSION_LABEL}`);
  }

  drawDebug() {
    const s = this.state;
    this.debugText.setText(s.units.map(u => {
      const t = findById(s, u.targetId);
      return `#${u.id} ${u.side[0]} ${u.card.name.slice(0, 4)} baan${u.lane} x=${u.x.toFixed(0)} hp=${u.hp} ${u.state} -> ${u.targetId ?? '-'} gap=${t ? gap(u, t).toFixed(0) : '-'} cd=${u.cd.toFixed(2)}`;
    }).join('\n'));
  }
}

new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: W * ZOOM, height: H * ZOOM,
  backgroundColor: '#1f160c',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false },
  scene: [Battle],
});
