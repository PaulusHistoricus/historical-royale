import Phaser from 'phaser';
import './style.css';

const W = 540, H = 850, LANES = [100, 270, 440];
const TOP = 78, BOTTOM = 674, MID = 370;
const CARDS = [
  { name: 'Legionair', cost: 3, hp: 190, damage: 30, range: 31, speed: 45, rate: 0.85, color: 0xb6cad4, kind: 'melee' },
  { name: 'Boogschutter', cost: 4, hp: 95, damage: 26, range: 120, speed: 37, rate: 1.0, color: 0xd9b46a, kind: 'ranged' },
  { name: 'Kanon', cost: 6, hp: 240, damage: 88, range: 155, speed: 18, rate: 2.2, color: 0x847d73, kind: 'cannon' },
];
const opposing = side => side === 'blue' ? 'red' : 'blue';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

class Battle extends Phaser.Scene {
  constructor() { super('battle'); }

  create() {
    this.units = []; this.effects = []; this.structures = []; this.energy = {blue: 6, red: 6};
    this.selected = 0; this.elapsed = 0; this.enemyClock = 2; this.ended = false;
    this.add.rectangle(W/2, H/2, W, H, 0x304b34);
    this.arena = this.add.graphics().setDepth(0);
    this.actors = this.add.graphics().setDepth(2);
    this.hud = this.add.graphics().setDepth(4);
    this.labels = this.add.container(0, 0).setDepth(5);
    this.drawArena();
    for (let lane = 0; lane < 3; lane++) {
      this.structures.push({ side: 'red', lane, y: 175, hp: 800, max: 800, kind: 'tower' });
      this.structures.push({ side: 'blue', lane, y: 565, hp: 800, max: 800, kind: 'tower' });
    }
    this.structures.push({side: 'red', lane: 1, y: 89, hp: 2000, max: 2000, kind: 'nexus'});
    this.structures.push({side: 'blue', lane: 1, y: 647, hp: 2000, max: 2000, kind: 'nexus'});
    this.statusText = this.add.text(W/2, 24, '', { fontFamily: 'system-ui', fontSize: '16px', color: '#fff1cf', fontStyle: 'bold' }).setOrigin(.5).setDepth(8);
    this.helpText = this.add.text(W/2, 696, 'Kies een kaart en klik op je helft van een baan', {fontFamily:'system-ui',fontSize:'12px',color:'#efe8d0'}).setOrigin(.5).setDepth(6);
    this.cardButtons = CARDS.map((c,i) => {
      const x = 95 + i*174;
      const zone = this.add.zone(x, 778, 154, 100).setInteractive({useHandCursor:true}).setDepth(9);
      zone.on('pointerdown', () => { if (!this.ended) this.selected = i; });
      const t = this.add.text(x, 791, c.name + '\n' + c.cost + ' energie', {fontFamily:'system-ui',fontSize:'14px',color:'#fff8dc',align:'center',fontStyle:'bold'}).setOrigin(.5).setDepth(9);
      return {x, zone, text:t};
    });
    this.input.on('pointerdown', p => {
      if (this.ended || p.y >= 724 || p.y < MID + 23 || p.y > 624) return;
      const lane = LANES.reduce((best, x, i) => Math.abs(x-p.x) < Math.abs(LANES[best]-p.x) ? i : best, 0);
      this.spawn('blue', lane, this.selected, clamp(p.y, MID+38, 620));
    });
    this.input.keyboard?.on('keydown-R', () => this.scene.restart());
  }

  drawArena() {
    const g = this.arena;
    for(let i=0;i<34;i++){
      const x=(i*137+21)%W, y=(i*211+69)%690;
      g.fillStyle(i%2 ? 0x466e45:0x527948,.55).fillCircle(x,y,7+i%5);
    }
    for(const x of LANES) {
      g.fillStyle(0xbba584).fillRoundedRect(x-48,TOP,96,BOTTOM-TOP,15);
      g.lineStyle(1,0x99866c,.35);
      for(let y=TOP+12;y<BOTTOM;y+=25) {
        g.lineBetween(x-44,y,x+44,y);
        g.lineBetween(x-22+(y%3)*9,y,x-22+(y%3)*9,y+23);
      }
    }
    g.fillStyle(0x287b99).fillRect(0,MID-19,W,38);
    for(let i=0;i<15;i++) {g.lineStyle(2,0x8fc2d3,.24);g.lineBetween((i*71)%W,MID-11,(i*71)%W+25,MID-11);}
    for(const x of LANES){
      g.fillStyle(0xcfb98d).fillRoundedRect(x-49,MID-24,98,48,4);
      g.lineStyle(2,0x867354,.6); g.strokeRoundedRect(x-49,MID-24,98,48,4);
      for(let dx=-30;dx<=30;dx+=15)g.lineBetween(x+dx,MID-22,x+dx,MID+22);
    }
    g.lineStyle(2,0x91cae7,.6).lineBetween(0,MID+28,W,MID+28);
    g.lineStyle(3,0x1c3022,.8).strokeRect(3,55,W-6,627);
    this.add.text(17,94,'VIJAND', {color:'#ffe0db',fontFamily:'system-ui',fontSize:'12px',fontStyle:'bold'}).setDepth(1);
    this.add.text(17,650,'JIJ', {color:'#c4ebff',fontFamily:'system-ui',fontSize:'12px',fontStyle:'bold'}).setDepth(1);
  }

  spawn(side, lane, cardIndex, y) {
    const card = CARDS[cardIndex];
    if(this.ended || this.energy[side]<card.cost) return false;
    this.energy[side]-=card.cost;
    this.units.push({side,lane,y,card, hp:card.hp,max:card.hp,cd:0,flash:0});
    return true;
  }

  targetFor(unit) {
    const enemies = this.units.filter(e => e.side !== unit.side && e.lane === unit.lane && e.hp>0);
    enemies.sort((a,b)=>Math.abs(a.y-unit.y)-Math.abs(b.y-unit.y));
    const enemy = enemies[0];
    if(enemy && Math.abs(enemy.y-unit.y) < 145) return enemy;
    const tower=this.structures.find(s=>s.kind==='tower' && s.side!==unit.side && s.lane===unit.lane && s.hp>0);
    return tower ?? this.structures.find(s=>s.kind==='nexus'&&s.side!==unit.side);
  }

  hit(target, amount, attacker) {
    if(!target || target.hp<=0)return;
    target.hp=Math.max(0,target.hp-amount);
    if(attacker.card.kind!=='melee') this.effects.push({x:LANES[attacker.lane],y:attacker.y,tx:LANES[attacker.lane],ty:target.y,life:.22,color:attacker.card.kind==='cannon'?0xffa445:0xffe2a1});
    if(target.hp<=0 && target.kind==='nexus')this.finish(attacker.side);
  }

  finish(side) {
    if(this.ended)return;
    this.ended=true;
    this.add.rectangle(W/2,360,465,140,0x152b24,.94).setStrokeStyle(3,0xf6dc97).setDepth(12);
    this.add.text(W/2,342,side==='blue'?'OVERWINNING!':'VERLOREN!',{fontFamily:'system-ui',fontSize:'33px',fontStyle:'bold',color:side==='blue'?'#b4edbc':'#ffb7ac'}).setOrigin(.5).setDepth(13);
    const restart=this.add.text(W/2,392,'Klik hier om opnieuw te spelen',{fontFamily:'system-ui',fontSize:'16px',color:'#fff1ce'}).setOrigin(.5).setDepth(13).setInteractive({useHandCursor:true});
    restart.on('pointerdown',()=>this.scene.restart());
  }

  update(_time, delta) {
    const dt=Math.min(delta/1000,.05);
    if(!this.ended){
      this.elapsed+=dt;
      this.energy.blue=clamp(this.energy.blue+dt/2.5,0,10);
      this.energy.red=clamp(this.energy.red+dt/2.5,0,10);
      this.enemyClock-=dt;
      if(this.enemyClock<=0){
        const playable=CARDS.map((c,i)=>({c,i})).filter(x=>x.c.cost<=this.energy.red);
        if(playable.length){
          const pick=Phaser.Utils.Array.GetRandom(playable);
          this.spawn('red',Phaser.Math.Between(0,2),pick.i,Phaser.Math.Between(102,312));
        }
        this.enemyClock=Phaser.Math.FloatBetween(2.6,4.5);
      }
      for(const u of this.units){
        if(u.hp<=0)continue;
        u.cd-=dt;u.flash=Math.max(0,u.flash-dt);
        const t=this.targetFor(u);
        if(!t)continue;
        const dist=Math.abs(u.y-t.y);
        if(dist>u.card.range){
          const direction=u.side==='blue'?-1:1;
          const ahead=(t.y-u.y)*direction>0;
          if(ahead)u.y+=direction*Math.min(u.card.speed*dt,dist-u.card.range);
        }else if(u.cd<=0){
          this.hit(t,u.card.damage,u);u.cd=u.card.rate;u.flash=.16;
        }
      }
      for(const s of this.structures){
        if(s.hp<=0)continue;
        const targets=this.units.filter(u=>u.side!==s.side && u.hp>0 && (s.kind==='nexus'||u.lane===s.lane) && Math.abs(u.y-s.y)<145);
        const target=targets.sort((a,b)=>Math.abs(a.y-s.y)-Math.abs(b.y-s.y))[0];
        s.cd=(s.cd??0)-dt;
        if(target&&s.cd<=0){target.hp=Math.max(0,target.hp-32);s.cd=1.1;this.effects.push({x:LANES[s.lane],y:s.y,tx:LANES[target.lane],ty:target.y,life:.18,color:s.side==='blue'?0x87d8ff:0xff897c});}
      }
      this.units=this.units.filter(u=>u.hp>0);
      if(this.elapsed>=240){
        const blue=this.structures.filter(s=>s.side==='blue').reduce((n,s)=>n+s.hp/s.max,0);
        const red=this.structures.filter(s=>s.side==='red').reduce((n,s)=>n+s.hp/s.max,0);
        this.finish(blue>=red?'blue':'red');
      }
    }
    this.effects=this.effects.filter(e=>(e.life-=dt)>0);
    this.drawActors();
    this.drawHud();
  }

  drawActors(){
    const g=this.actors;g.clear();
    for(const s of this.structures){
      const x=LANES[s.lane], color=s.side==='blue'?0x397db1:0xb24f4b;
      g.fillStyle(s.hp>0?0x182e31:0x494037,.45).fillEllipse(x+3,s.y+13,s.kind==='nexus'?72:47,21);
      if(s.hp>0){
        const size=s.kind==='nexus'?53:37;
        g.fillStyle(0xbaa784).fillRoundedRect(x-size/2,s.y-size/2,size,size,6);
        g.lineStyle(4,color).strokeRoundedRect(x-size/2,s.y-size/2,size,size,6);
        g.fillStyle(color).fillCircle(x,s.y,size*.3);
        g.fillStyle(0xf3dd9a).fillCircle(x,s.y,6);
      }else{g.fillStyle(0x67645b).fillCircle(x,s.y,17);}
      g.fillStyle(0x201c1a).fillRect(x-25,s.y-39,50,6);
      g.fillStyle(s.side==='blue'?0x6ad4fa:0xf26f6b).fillRect(x-25,s.y-39,50*s.hp/s.max,6);
    }
    for(const u of this.units){
      const x=LANES[u.lane],y=u.y,blue=u.side==='blue',c=u.card;
      g.fillStyle(0x15221b,.5).fillEllipse(x+3,y+10,27,10);
      g.fillStyle(u.flash>0?0xfff5b1:(blue?0x5daee1:0xe7775c)).fillCircle(x,y,15);
      g.lineStyle(2,0x1a2730).strokeCircle(x,y,15);
      if(c.kind==='melee'){
        g.fillStyle(0xc9d2d5).fillCircle(x,y-5,8);
        g.fillStyle(blue?0x2e6cae:0xa94339).fillRoundedRect(x-15,y-1,12,15,3);
        g.lineStyle(3,0xd9d9d2).lineBetween(x+9,y,x+18,y+(blue?-12:12));
      } else if(c.kind==='ranged'){
        g.fillStyle(0xbca57b).fillCircle(x,y-5,7);
        g.lineStyle(3,0xd9aa67); g.arc(x+10,y,9,-1.2,1.2,false);g.strokePath();
      } else {
        g.fillStyle(0x4e5154).fillRoundedRect(x-13,y-8,26,20,4);
        g.lineStyle(8,0xa68a53).lineBetween(x,y,x,y+(blue?-24:24));
        g.fillStyle(0x22232c).fillCircle(x-12,y+8,6).fillCircle(x+12,y+8,6);
      }
      g.fillStyle(0x1b201b).fillRect(x-17,y-29,34,4);
      g.fillStyle(blue?0x59d4f2:0xf67b74).fillRect(x-17,y-29,34*u.hp/u.max,4);
    }
    for(const e of this.effects){
      g.lineStyle(e.life>0.1?3:2,e.color,Math.min(1,e.life*4));
      g.lineBetween(e.x,e.y,e.tx,e.ty);
      g.fillStyle(e.color).fillCircle(e.tx,e.ty,5);
    }
  }

  drawHud(){
    const g=this.hud;g.clear();
    g.fillStyle(0x16251f).fillRect(0,0,W,55).fillRect(0,684,W,166);
    g.lineStyle(3,0xbfa36b).lineBetween(0,684,W,684);
    g.fillStyle(0xb39ee4).fillRoundedRect(16,711,Math.round(this.energy.blue/10*508),15,5);
    g.lineStyle(2,0xd0b8fa).strokeRoundedRect(16,711,508,15,5);
    for(let i=0;i<3;i++){
      const x=18+i*174;
      g.fillStyle(i===this.selected?0x716044:0x37433b).fillRoundedRect(x,737,155,101,9);
      g.lineStyle(i===this.selected?4:2,i===this.selected?0xf2d28c:0x6a7564).strokeRoundedRect(x,737,155,101,9);
      if(this.energy.blue<CARDS[i].cost)g.fillStyle(0x090b0b,.45).fillRoundedRect(x,737,155,101,9);
    }
    const t=Math.max(0,240-this.elapsed);
    this.statusText.setText('HISTORICAL ROYALE   •   '+Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0')+'   •   Energie '+Math.floor(this.energy.blue)+'/10');
  }
}

new Phaser.Game({
  type:Phaser.AUTO, parent:'game', width:W,height:H,
  backgroundColor:'#304b34',
  scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},
  render:{pixelArt:true,antialias:false},
  scene:[Battle]
});
