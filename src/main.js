import Phaser from 'phaser';
import './style.css';
import { W, H, LANES, FIELD_BOTTOM, CARDS, DEPLOY_ZONE, MATCH_SECONDS, ENERGY_MAX } from './sim/config.js';
import * as sim from './sim/battle.js';
const { createBattle, deploy, step, findById, gap } = sim;
import { VERSION_LABEL, ensureLatestBuild } from './version.js';

// Dit bestand bevat ALLEEN weergave en invoer. Alle spelregels (lopen, doelwit
// kiezen, aanvallen, schade, AI, energie) staan in src/sim/ en worden getest in
// tests/. Zie AGENTS.md voordat je gevechtsgedrag aanpast.
const BLUE = 0x438dcc, RED = 0xc9594a;
const ZONE = DEPLOY_ZONE.blue;
const SIM_STEP = 1 / 60;          // vaste simulatiestap, onafhankelijk van de framerate
const SWING_TIME = .32, FLASH_TIME = .22;
const DEBUG = new URLSearchParams(location.search).has('debug');

class Battle extends Phaser.Scene {
  constructor(){super('battle');}

  preload(){
    this.load.svg('roman-landscape',import.meta.env.BASE_URL+'assets/roman-landscape.svg',{width:960,height:440});
    this.load.svg('roman-tower',import.meta.env.BASE_URL+'assets/roman-tower.svg',{width:76,height:104});
    this.load.svg('roman-castle',import.meta.env.BASE_URL+'assets/roman-castle.svg',{width:112,height:142});
  }

  create(){
    this.add.rectangle(W/2,H/2,W,H,0x496e46);
    this.add.image(0,48,'roman-landscape').setOrigin(0,0).setDepth(-1);
    this.backdrop=this.add.graphics().setDepth(0);
    this.state=createBattle();
    // Artwork is purely presentational and never participates in collision or combat.
    this.structureArt=this.state.structures.map(s=>{
      const castle=s.kind==='castle';
      const art=this.add.image(s.x,s.y-9,castle?'roman-castle':'roman-tower').setDepth(1.8);
      art.setDisplaySize(castle?89:55,castle?119:83);
      if(s.side==='red')art.setTint(0xffb5a6);
      return art;
    });
    this.effects=[];              // projectielen en slagen, puur visueel
    this.anim=new Map();          // per eenheid-id: {swing, flash}, puur visueel
    this.accumulator=0;
    this.visuals=this.add.graphics().setDepth(2);
    this.ui=this.add.graphics().setDepth(4);
    this.selected=0;
    if(DEBUG)window.__HR__={scene:this,state:this.state,sim}; // ?debug: inspecteer in de console
    this.drawArena();
    this.header=this.add.text(W/2,65,'',{fontFamily:'system-ui',fontSize:'19px',fontStyle:'bold',color:'#fdf1d1',stroke:'#2c241b',strokeThickness:4}).setOrigin(.5).setDepth(7);
    this.message=this.add.text(W/2,464,'Kies een kaart en klik op de bovenste of onderste baan',{fontFamily:'system-ui',fontSize:'14px',color:'#fff1cb'}).setOrigin(.5).setDepth(7);
    this.debugText=this.add.text(8,84,'',{fontFamily:'monospace',fontSize:'10px',color:'#ffffff',backgroundColor:'#000000aa'}).setDepth(30).setVisible(DEBUG);
    this.buttons=CARDS.map((card,i)=>{
      const x=178+i*302;
      const zone=this.add.zone(x,551,277,81).setInteractive({useHandCursor:true}).setDepth(9);
      zone.on('pointerdown',()=>{if(!this.state.ended)this.selected=i;});
      this.add.text(x,552,card.name.toUpperCase()+'  •  '+card.cost+' energie',{fontFamily:'system-ui',fontSize:'19px',fontStyle:'bold',color:'#fff8e0',align:'center'}).setOrigin(.5).setDepth(8);
      return {x,zone};
    });
    this.input.on('pointerdown',p=>{
      if(this.state.ended || p.y >= FIELD_BOTTOM || p.y<75 || p.x>ZONE.max || p.x<ZONE.min)return;
      const lane=Math.abs(p.y-LANES[0])<=Math.abs(p.y-LANES[1])?0:1;
      if(Math.abs(p.y-LANES[lane])>70)return;
      if(!deploy(this.state,'blue',lane,this.selected,p.x)){
        this.message.setText('Niet genoeg energie voor deze kaart');
      } else {
        this.message.setText('Boven en onder verdedigen, daarna samen naar het kasteel!');
      }
    });
    this.input.keyboard?.on('keydown-R',()=>this.scene.restart());
    ensureLatestBuild().then(status=>{
      if(status==='stale')this.message.setText('Er staat een nieuwere versie online — herlaad de pagina');
    });
  }

  drawArena(){
    const g=this.backdrop;
    // Flat side-on lanes separated by scenery, with a shared endpoint at each castle.
    for(const y of LANES){
      g.fillStyle(0x9c8769).fillRoundedRect(100,y-42,760,88,19);
      g.fillStyle(0xc4ab82).fillRoundedRect(100,y-37,760,77,17);
      g.lineStyle(2,0xe0c59a,.6).lineBetween(100,y+31,860,y+31);
      for(let x=120;x<855;x+=38){
        g.lineStyle(1,0x907d61,.25).lineBetween(x,y-36,x,y+38);
      }
    }
    // Blue deployment zones and a visible frontline limit.
    for(const y of LANES){
      g.fillStyle(0x4d9ee5,.14).fillRoundedRect(ZONE.min,y-35,ZONE.max-ZONE.min,70,8);
      g.lineStyle(2,0x6bd1ff,.75).strokeRoundedRect(ZONE.min,y-35,ZONE.max-ZONE.min,70,8);
    }
    g.lineStyle(3,0x8cddff,.85).lineBetween(ZONE.max,106,ZONE.max,396);
    // The two roads visually join near the castles.
    g.lineStyle(24,0xb79c72,.9);
    g.beginPath();g.moveTo(115,LANES[0]);g.lineTo(75,255);g.lineTo(115,LANES[1]);g.strokePath();
    g.beginPath();g.moveTo(845,LANES[0]);g.lineTo(885,255);g.lineTo(845,LANES[1]);g.strokePath();
    g.lineStyle(16,0xd6b88a,.8);
    g.beginPath();g.moveTo(115,LANES[0]);g.lineTo(75,255);g.lineTo(115,LANES[1]);g.strokePath();
    g.beginPath();g.moveTo(845,LANES[0]);g.lineTo(885,255);g.lineTo(845,LANES[1]);g.strokePath();
    g.lineStyle(4,0x283f30).strokeRoundedRect(5,49,950,436,9);
    this.add.text(270,110,'BOVENSTE FRONT',{color:'#f6e6c4',fontFamily:'system-ui',fontSize:'12px',fontStyle:'bold'}).setDepth(1);
    this.add.text(270,310,'ONDERSTE FRONT',{color:'#f6e6c4',fontFamily:'system-ui',fontSize:'12px',fontStyle:'bold'}).setDepth(1);
    this.add.text(23,423,'JOUW KASTEEL',{color:'#d0edff',fontFamily:'system-ui',fontSize:'12px',fontStyle:'bold'}).setDepth(1);
    this.add.text(833,423,'VIJAND',{color:'#ffe1d4',fontFamily:'system-ui',fontSize:'12px',fontStyle:'bold'}).setDepth(1);
  }

  // Vertaalt gebeurtenissen uit de simulatie naar animaties. Nieuwe graphics
  // (sprites, geluid, deeltjes) horen hier aan te haken, niet in src/sim/.
  handleEvents(events){
    for(const e of events){
      if(e.type==='hit'){
        const a=this.anim.get(e.attackerId)??{swing:0,flash:0};
        a.flash=FLASH_TIME;
        if(e.kind==='melee'){
          a.swing=SWING_TIME;
          const dir=e.to.x>=e.from.x?1:-1;
          this.effects.push({x:e.from.x+dir*12,y:e.from.y-23,tx:e.to.x,ty:e.to.y-23,life:.32,max:.32,color:0xffe7a3});
        }else if(e.kind==='tower'||e.kind==='castle'){
          this.effects.push({x:e.from.x,y:e.from.y-30,tx:e.to.x,ty:e.to.y-10,life:.18,max:.18,color:e.side==='blue'?0x89daff:0xffa197});
        }else{
          this.effects.push({x:e.from.x,y:e.from.y-15,tx:e.to.x,ty:e.to.y-10,life:.23,max:.23,color:e.kind==='cannon'?0xffa85e:0xffeea3});
        }
        this.anim.set(e.attackerId,a);
      }else if(e.type==='death'){
        this.anim.delete(e.id);
      }else if(e.type==='end'){
        this.showResult(e.winner);
      }
    }
  }

  showResult(winner){
    this.add.rectangle(W/2,251,540,150,0x162720,.95).setStrokeStyle(3,0xe8c683).setDepth(20);
    this.add.text(W/2,225,winner==='blue'?'OVERWINNING!':'VERLOREN!',{fontFamily:'system-ui',fontSize:'38px',fontStyle:'bold',color:winner==='blue'?'#b8efbd':'#ffbeb6'}).setOrigin(.5).setDepth(21);
    const again=this.add.text(W/2,281,'Klik om opnieuw te spelen',{fontFamily:'system-ui',fontSize:'19px',color:'#fff0cf'}).setOrigin(.5).setDepth(21).setInteractive({useHandCursor:true});
    again.on('pointerdown',()=>this.scene.restart());
  }

  update(_time,delta){
    const dt=Math.min(delta/1000,.1);
    this.accumulator+=dt;
    while(this.accumulator>=SIM_STEP){
      this.accumulator-=SIM_STEP;
      this.handleEvents(step(this.state,SIM_STEP));
    }
    for(const a of this.anim.values()){a.swing=Math.max(0,a.swing-dt);a.flash=Math.max(0,a.flash-dt);}
    this.effects=this.effects.filter(e=>(e.life-=dt)>0);
    this.drawGame();
    if(DEBUG)this.drawDebug();
  }

  drawDebug(){
    const s=this.state;
    this.debugText.setText(s.units.map(u=>{
      const t=findById(s,u.targetId);
      return `#${u.id} ${u.side[0]} ${u.card.name.slice(0,4)} baan${u.lane} x=${u.x.toFixed(0)} hp=${u.hp} ${u.state} -> ${u.targetId??'-'} gap=${t?gap(u,t).toFixed(0):'-'} cd=${u.cd.toFixed(2)}`;
    }).join('\n'));
  }

  drawGame(){
    const g=this.visuals;g.clear();
    const state=this.state;
    for(const [structureIndex,s] of state.structures.entries()){
      this.structureArt[structureIndex].setVisible(s.hp>0);
      const col=s.side==='blue'?BLUE:RED;
      const w=s.kind==='castle'?68:43,h=s.kind==='castle'?106:66;
      g.fillStyle(0x283527,.35).fillEllipse(s.x+3,s.y+25,w+14,20);
      if(s.hp>0){
        // The illustrated SVG underneath replaces the old placeholder geometry.
        // Five visual damage stages based on actual structure HP.
        // These are purely decorative; combat stays in src/sim/.
        const health=Math.max(0,s.hp/s.max);
        const stage=health>.75?0:health>.5?1:health>.25?2:3;
        if(stage>=1){
          g.lineStyle(2,0x534b43,.85);
          g.beginPath();
          g.moveTo(s.x-w*.28,s.y-h*.22);
          g.lineTo(s.x-w*.11,s.y-h*.08);
          g.lineTo(s.x-w*.2,s.y+h*.08);
          g.lineTo(s.x-w*.05,s.y+h*.18);
          g.strokePath();
        }
        if(stage>=2){
          g.fillStyle(0x716b61).fillTriangle(s.x+w*.27,s.y-h*.5,s.x+w*.48,s.y-h*.5,s.x+w*.48,s.y-h*.27);
          g.fillStyle(0x847768).fillRect(s.x-w*.43,s.y+h*.37,13,8);
          g.fillStyle(0x595a55,.5).fillEllipse(s.x+w*.22,s.y-h*.54,18,12);
          g.fillStyle(0x76736e,.35).fillCircle(s.x+w*.15,s.y-h*.7,13);
        }
        if(stage>=3){
          const flicker=Math.sin(state.time*11+s.x)*3;
          g.fillStyle(0xc64c19).fillEllipse(s.x+w*.21,s.y-h*.35,17,27+flicker);
          g.fillStyle(0xffba32).fillEllipse(s.x+w*.22,s.y-h*.33,9,19+flicker);
          g.fillStyle(0x444641,.55).fillCircle(s.x+w*.22,s.y-h*.77,14);
          g.fillStyle(0x77736c,.35).fillCircle(s.x+w*.3,s.y-h*.95,19);
        }
      } else {
        // Destroyed: irregular rubble instead of an intact tower.
        g.fillStyle(0x514f47,.5).fillEllipse(s.x,s.y+18,w+14,24);
        for(let i=0;i<9;i++){
          const dx=((i*23)% (w+8))-(w+8)/2;
          const dy=7+(i*13)%20;
          const rw=8+(i*7)%13;
          g.fillStyle(i%2?0x988a74:0x6e6254);
          g.fillTriangle(s.x+dx,s.y+dy-rw*.65,s.x+dx-rw*.7,s.y+dy+5,s.x+dx+rw*.7,s.y+dy+5);
        }
        g.fillStyle(0x77736c,.25).fillCircle(s.x+8,s.y-11,17);
      }
      g.fillStyle(0x262724).fillRect(s.x-25,s.y-h/2-25,50,7);
      g.fillStyle(col).fillRect(s.x-25,s.y-h/2-25,50*Math.max(0,s.hp/s.max),7);
    }
    const units=[...state.units].sort((a,b)=>a.y-b.y);
    for(const u of units){
      const c=u.card,dir=u.facing;
      const swing=this.anim.get(u.id)?.swing??0,flash=this.anim.get(u.id)?.flash??0;
      const sideColor=u.side==='blue'?BLUE:RED;
      g.fillStyle(0x253827,.45).fillEllipse(u.x,u.y+14,c.type==='cannon'?47:34,10);
      if(c.type==='cannon'){
        g.fillStyle(0x6a6051).fillRoundedRect(u.x-21,u.y-8,44,20,4);
        g.fillStyle(0x2d3336).fillCircle(u.x-13,u.y+13,10).fillCircle(u.x+13,u.y+13,10);
        g.lineStyle(9,0xc5a056).lineBetween(u.x,u.y-3,u.x+dir*30,u.y-10);
        g.fillStyle(sideColor).fillCircle(u.x-dir*15,u.y-13,9);
      } else {
        // Temporary big side-view silhouettes, replace with pixel spritesheets later.
        g.fillStyle(sideColor).fillRoundedRect(u.x-13,u.y-18,26,30,8);
        g.fillStyle(0xdcc39a).fillCircle(u.x,u.y-27,12);
        g.fillStyle(c.type==='archer'?0x668b4d:0xc1c5cd).fillEllipse(u.x,u.y-34,26,13);
        g.lineStyle(5,0x544539).lineBetween(u.x-8,u.y+10,u.x-10,u.y+18);
        g.lineBetween(u.x+8,u.y+10,u.x+11,u.y+18);
        if(c.type==='melee'){
          if(swing>0){
            g.lineStyle(5,0xffe9a1,Math.min(1,swing/.16));
            g.beginPath();g.arc(u.x+dir*16,u.y-19,24,dir>0?-.9:2.1,dir>0?1.1:4.1,false);g.strokePath();
          }
          g.fillStyle(0xb6a577).fillRoundedRect(u.x+dir*14-8,u.y-19,12,26,3);
          g.lineStyle(4,0xe4dfc9).lineBetween(u.x-dir*11,u.y-14,u.x-dir*22,u.y-30);
        }else{
          g.lineStyle(3,0xb99154);
          g.beginPath();g.arc(u.x+dir*16,u.y-13,15,-1.2,1.2,false);g.strokePath();
        }
      }
      if(flash>0){g.lineStyle(3,0xffd37c).strokeCircle(u.x+dir*16,u.y-18,17);}
      g.fillStyle(0x292929).fillRect(u.x-19,u.y-51,38,6);
      g.fillStyle(sideColor).fillRect(u.x-19,u.y-51,38*(u.hp/u.max),6);
    }
    for(const e of this.effects){
      g.lineStyle(e.color===0xffa85e?6:3,e.color,Math.min(1,e.life/e.max));
      g.lineBetween(e.x,e.y,e.tx,e.ty);
      g.fillStyle(e.color).fillCircle(e.tx,e.ty,5);
    }
    const ui=this.ui;ui.clear();
    ui.fillStyle(0x1d2b2b).fillRect(0,FIELD_BOTTOM,W,H-FIELD_BOTTOM);
    ui.lineStyle(3,0xc9a96a).lineBetween(0,FIELD_BOTTOM,W,FIELD_BOTTOM);
    ui.fillStyle(0x4d3c61).fillRoundedRect(18,493,924,13,5);
    ui.fillStyle(0xc58bed).fillRoundedRect(18,493,924*state.energy.blue/ENERGY_MAX,13,5);
    this.message.setColor('#fff1cb');
    for(let i=0;i<CARDS.length;i++){
      const x=this.buttons[i].x;
      ui.fillStyle(i===this.selected?0x786344:0x3a4844).fillRoundedRect(x-138,513,276,79,10);
      ui.lineStyle(i===this.selected?4:2,i===this.selected?0xffdf91:0x7b886f).strokeRoundedRect(x-138,513,276,79,10);
      if(state.energy.blue<CARDS[i].cost)ui.fillStyle(0x000000,.38).fillRoundedRect(x-138,513,276,79,10);
    }
    const remaining=Math.max(0,MATCH_SECONDS-state.time);
    this.header.setText('HISTORICAL ROYALE '+VERSION_LABEL+'   •   '+Math.floor(remaining/60)+':'+String(Math.floor(remaining%60)).padStart(2,'0')+'   •   Energie '+Math.floor(state.energy.blue)+'/'+ENERGY_MAX);
  }
}

new Phaser.Game({
  type:Phaser.AUTO,parent:'game',width:W,height:H,
  backgroundColor:'#355b42',
  scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},
  render:{pixelArt:true,antialias:false},
  scene:[Battle]
});
