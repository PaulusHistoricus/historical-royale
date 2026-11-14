import Phaser from 'phaser';
import './style.css';

// Prototype 0.2: two side-view lanes that converge at each enemy castle.
const W = 960, H = 600;
const LANES = [155, 355], FIELD_BOTTOM = 485;
const BLUE = 0x438dcc, RED = 0xc9594a;
const CARDS = [
  {name:'Legionair',cost:3,hp:240,damage:36,range:35,speed:56,rate:.9,type:'melee'},
  {name:'Boogschutter',cost:4,hp:130,damage:29,range:155,speed:46,rate:1.2,type:'archer'},
  {name:'Kanon',cost:6,hp:300,damage:48,range:150,speed:22,rate:3.2,type:'cannon'}
];
const clamp = (n,a,b) => Math.max(a, Math.min(b,n));
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const DETECTION_RANGE = 205;
const CONTACT_RANGE = 27;
const DEPLOY_MAX_X = 445;

class Battle extends Phaser.Scene {
  constructor(){super('battle');}

  create(){
    this.add.rectangle(W/2,H/2,W,H,0x496e46);
    this.backdrop=this.add.graphics().setDepth(0);
    this.structures=[];this.units=[];this.effects=[];
    this.visuals=this.add.graphics().setDepth(2);
    this.ui=this.add.graphics().setDepth(4);
    this.energy={blue:6,red:6};this.selected=0;this.elapsed=0;this.enemyClock=2;
    this.ended=false;this.unitId=0;
    for(const side of ['blue','red']){
      for(let lane=0;lane<2;lane++){
        this.structures.push({kind:'tower',side,lane,x:side==='blue'?150:810,y:LANES[lane],hp:850,max:850,cd:0});
      }
      this.structures.push({kind:'castle',side,lane:-1,x:side==='blue'?55:905,y:255,hp:2400,max:2400,cd:0});
    }
    this.drawArena();
    this.header=this.add.text(W/2,65,'',{fontFamily:'system-ui',fontSize:'19px',fontStyle:'bold',color:'#fdf1d1',stroke:'#2c241b',strokeThickness:4}).setOrigin(.5).setDepth(7);
    this.message=this.add.text(W/2,464,'Kies een kaart en klik op de bovenste of onderste baan',{fontFamily:'system-ui',fontSize:'14px',color:'#fff1cb'}).setOrigin(.5).setDepth(7);
    this.buttons=CARDS.map((card,i)=>{
      const x=178+i*302;
      const zone=this.add.zone(x,551,277,81).setInteractive({useHandCursor:true}).setDepth(9);
      zone.on('pointerdown',()=>{if(!this.ended)this.selected=i;});
      this.add.text(x,552,card.name.toUpperCase()+'  •  '+card.cost+' energie',{fontFamily:'system-ui',fontSize:'19px',fontStyle:'bold',color:'#fff8e0',align:'center'}).setOrigin(.5).setDepth(8);
      return {x,zone};
    });
    this.input.on('pointerdown',p=>{
      if(this.ended || p.y >= FIELD_BOTTOM || p.y<75 || p.x>DEPLOY_MAX_X || p.x<205)return;
      const lane=Math.abs(p.y-LANES[0])<=Math.abs(p.y-LANES[1])?0:1;
      if(Math.abs(p.y-LANES[lane])>70)return;
      if(!this.spawn('blue',lane,this.selected,clamp(p.x,205,DEPLOY_MAX_X))){
        this.message.setText('Niet genoeg energie voor deze kaart');
      } else {
        this.message.setText('Boven en onder verdedigen, daarna samen naar het kasteel!');
      }
    });
    this.input.keyboard?.on('keydown-R',()=>this.scene.restart());
  }

  drawArena(){
    const g=this.backdrop;
    // Flat side-on lanes separated by scenery, with a shared endpoint at each castle.
    g.fillStyle(0x6e965a).fillRect(0,48,W,FIELD_BOTTOM-48);
    for(let i=0;i<65;i++){
      const x=(i*149+47)%W,y=62+(i*193)%(FIELD_BOTTOM-68);
      g.fillStyle(i%2?0x527944:0x83a45d,.4).fillCircle(x,y,3+i%6);
    }
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
      g.fillStyle(0x4d9ee5,.14).fillRoundedRect(205,y-35,DEPLOY_MAX_X-205,70,8);
      g.lineStyle(2,0x6bd1ff,.75).strokeRoundedRect(205,y-35,DEPLOY_MAX_X-205,70,8);
    }
    g.lineStyle(3,0x8cddff,.85).lineBetween(DEPLOY_MAX_X,106,DEPLOY_MAX_X,396);
    // The two roads visually join near the castles.
    g.lineStyle(24,0xb79c72,.9);
    g.beginPath();g.moveTo(115,LANES[0]);g.lineTo(75,255);g.lineTo(115,LANES[1]);g.strokePath();
    g.beginPath();g.moveTo(845,LANES[0]);g.lineTo(885,255);g.lineTo(845,LANES[1]);g.strokePath();
    g.lineStyle(16,0xd6b88a,.8);
    g.beginPath();g.moveTo(115,LANES[0]);g.lineTo(75,255);g.lineTo(115,LANES[1]);g.strokePath();
    g.beginPath();g.moveTo(845,LANES[0]);g.lineTo(885,255);g.lineTo(845,LANES[1]);g.strokePath();
    // Ruins, trees and distant walls, painted with simple shapes for now.
    for(const [x,y] of [[280,70],[365,72],[576,69],[665,74],[312,283],[635,274]]){
      g.fillStyle(0x567b4a).fillEllipse(x,y+13,60,18);
      g.fillStyle(0x31583c).fillCircle(x,y-10,18);
      g.fillStyle(0x729957).fillCircle(x-8,y-19,15);
    }
    g.lineStyle(4,0x283f30).strokeRoundedRect(5,49,950,436,9);
    this.add.text(270,110,'BOVENSTE FRONT',{color:'#f6e6c4',fontFamily:'system-ui',fontSize:'12px',fontStyle:'bold'}).setDepth(1);
    this.add.text(270,310,'ONDERSTE FRONT',{color:'#f6e6c4',fontFamily:'system-ui',fontSize:'12px',fontStyle:'bold'}).setDepth(1);
    this.add.text(23,423,'JOUW KASTEEL',{color:'#d0edff',fontFamily:'system-ui',fontSize:'12px',fontStyle:'bold'}).setDepth(1);
    this.add.text(833,423,'VIJAND',{color:'#ffe1d4',fontFamily:'system-ui',fontSize:'12px',fontStyle:'bold'}).setDepth(1);
  }

  spawn(side,lane,index,x){
    const card=CARDS[index];
    if(this.ended || this.energy[side]+.001<card.cost)return false;
    this.energy[side]-=card.cost;
    const pos=side==='blue'?clamp(x,205,DEPLOY_MAX_X):clamp(x,540,755);
    const offset=(this.unitId++%3-1)*10;
    this.units.push({id:this.unitId,side,lane,x:pos,y:LANES[lane]+offset,hp:card.hp,max:card.hp,card,cd:0,flash:0,merged:false,facing:side==='blue'?1:-1});
    return true;
  }

  getEnemyStructure(u){
    const tower=this.structures.find(s=>s.side!==u.side&&s.kind==='tower'&&s.lane===u.lane&&s.hp>0);
    return tower ?? this.structures.find(s=>s.side!==u.side&&s.kind==='castle');
  }

  targetFor(u){
    // Threats are detected in BOTH directions, even behind a defender.
    // Prioritize enemies attacking nearby friendly structures.
    const candidates=this.units.filter(e=>
      e!==u && e.side!==u.side && e.hp>0 &&
      (e.lane===u.lane || (u.merged && e.merged)) &&
      Math.abs(u.x-e.x)<DETECTION_RANGE
    ).sort((a,b)=>{
      const defend=enemy=>this.structures.some(s=>s.side===u.side&&s.hp>0&&
        (s.kind==='castle'||s.lane===u.lane)&&distance(s,enemy)<175);
      return Number(defend(b))-Number(defend(a)) || distance(u,a)-distance(u,b);
    });
    const locked=candidates.find(e=>e.id===u.targetId);
    const selected=locked??candidates[0];
    u.targetId=selected?.id??null;
    return selected??this.getEnemyStructure(u);
  }

  moveToward(u,target,dt){
    const dx=target.x-u.x,dy=target.y-u.y;
    const len=Math.hypot(dx,dy);
    if(len<1)return;
    const step=Math.min(len,u.card.speed*dt);
    const nextX=u.x+(dx/len)*step;
    const nextY=u.y+(dy/len)*step;
    // Do not phase through an enemy: stop at contact and let targeting engage.
    const blocker=this.units.find(e=>e!==u&&e.side!==u.side&&e.hp>0&&
      (e.lane===u.lane||(u.merged&&e.merged))&&
      Math.abs(nextX-e.x)<CONTACT_RANGE && Math.abs(nextY-e.y)<48);
    if(blocker && target!==blocker){u.targetId=blocker.id;u.facing=blocker.x>=u.x?1:-1;return;}
    u.x=nextX;u.y=nextY;
  }

  hit(attacker,target){
    if(target.hp<=0)return;
    target.hp=Math.max(0,target.hp-attacker.card.damage);
    attacker.flash=.16;
    if(attacker.card.type!=='melee'){
      this.effects.push({x:attacker.x,y:attacker.y-15,tx:target.x,ty:target.y-10,life:.23,max:.23,color:attacker.card.type==='cannon'?0xffa85e:0xffeea3});
    }
    if(target.kind==='castle'&&target.hp===0)this.finish(attacker.side);
  }

  finish(winner){
    if(this.ended)return;
    this.ended=true;
    this.add.rectangle(W/2,251,540,150,0x162720,.95).setStrokeStyle(3,0xe8c683).setDepth(20);
    this.add.text(W/2,225,winner==='blue'?'OVERWINNING!':'VERLOREN!',{fontFamily:'system-ui',fontSize:'38px',fontStyle:'bold',color:winner==='blue'?'#b8efbd':'#ffbeb6'}).setOrigin(.5).setDepth(21);
    const again=this.add.text(W/2,281,'Klik om opnieuw te spelen',{fontFamily:'system-ui',fontSize:'19px',color:'#fff0cf'}).setOrigin(.5).setDepth(21).setInteractive({useHandCursor:true});
    again.on('pointerdown',()=>this.scene.restart());
  }

  update(_time,delta){
    const dt=Math.min(delta/1000,.05);
    if(!this.ended){
      this.elapsed+=dt;
      const regeneration=this.elapsed>180?0.8:1.35;
      for(const side of ['blue','red'])this.energy[side]=clamp(this.energy[side]+dt/regeneration,0,10);
      this.enemyClock-=dt;
      if(this.enemyClock<=0){
        const affordable=CARDS.map((card,i)=>({card,i})).filter(c=>c.card.cost<=this.energy.red);
        if(affordable.length){
          const item=Phaser.Utils.Array.GetRandom(affordable);
          this.spawn('red',Phaser.Math.Between(0,1),item.i,Phaser.Math.Between(580,735));
        }
        this.enemyClock=Phaser.Math.FloatBetween(2.8,4.8);
      }
      for(const u of this.units){
        if(u.hp<=0)continue;
        u.cd-=dt;u.flash=Math.max(0,u.flash-dt);
        const target=this.targetFor(u);if(!target)continue;
        if(target.kind==='castle'&&this.getEnemyStructure(u)?.kind==='castle')u.merged=true;
        u.facing=target.x>=u.x?1:-1;
        const d=target.kind ? distance(u,target) : Math.abs(u.x-target.x);
        const effectiveRange=u.card.type==='melee'?Math.max(48,u.card.range):u.card.range;
        if(d>effectiveRange)this.moveToward(u,target,dt);
        else if(u.cd<=0){this.hit(u,target);u.cd=u.card.rate;}
      }
      for(const s of this.structures){
        if(s.hp<=0)continue;
        s.cd-=dt;
        const enemies=this.units.filter(u=>u.side!==s.side&&u.hp>0&&
          (s.kind==='castle'||s.lane===u.lane)&&distance(s,u)<160)
          .sort((a,b)=>distance(a,s)-distance(b,s));
        if(enemies.length&&s.cd<=0){
          enemies[0].hp=Math.max(0,enemies[0].hp-32);
          this.effects.push({x:s.x,y:s.y-30,tx:enemies[0].x,ty:enemies[0].y-10,life:.18,max:.18,color:s.side==='blue'?0x89daff:0xffa197});
          s.cd=1.05;
        }
      }
      this.units=this.units.filter(u=>u.hp>0);
      if(this.elapsed>=240){
        const score=side=>this.structures.filter(s=>s.side===side).reduce((a,s)=>a+s.hp/s.max,0);
        this.finish(score('blue')>=score('red')?'blue':'red');
      }
    }
    this.effects=this.effects.filter(e=>(e.life-=dt)>0);
    this.drawGame();
  }

  drawGame(){
    const g=this.visuals;g.clear();
    for(const s of this.structures){
      const col=s.side==='blue'?BLUE:RED;
      const w=s.kind==='castle'?68:43,h=s.kind==='castle'?106:66;
      g.fillStyle(0x283527,.35).fillEllipse(s.x+3,s.y+25,w+14,20);
      if(s.hp>0){
        g.fillStyle(0xa9a18c).fillRoundedRect(s.x-w/2,s.y-h/2,w,h,5);
        g.lineStyle(4,0xf3e0b6).strokeRoundedRect(s.x-w/2,s.y-h/2,w,h,5);
        g.fillStyle(col).fillRoundedRect(s.x-w/2+5,s.y-h/2+7,w-10,24,3);
        g.fillStyle(0x4e4539).fillRoundedRect(s.x-9,s.y+7,18,h/2-15,8);
        g.fillStyle(0xe1b768).fillCircle(s.x,s.y-8,7);
        if(s.kind==='castle'){
          for(let i=-1;i<=1;i++){
            g.fillStyle(0xb9aa8a).fillRect(s.x+i*21-9,s.y-h/2-12,17,15);
          }
        }
      } else {
        g.fillStyle(0x6e6254).fillEllipse(s.x,s.y+15,w,26);
      }
      g.fillStyle(0x262724).fillRect(s.x-25,s.y-h/2-25,50,7);
      g.fillStyle(col).fillRect(s.x-25,s.y-h/2-25,50*Math.max(0,s.hp/s.max),7);
    }
    const units=[...this.units].sort((a,b)=>a.y-b.y);
    for(const u of units){
      const c=u.card,dir=u.facing;
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
          g.fillStyle(0xb6a577).fillRoundedRect(u.x+dir*14-8,u.y-19,12,26,3);
          g.lineStyle(4,0xe4dfc9).lineBetween(u.x-dir*11,u.y-14,u.x-dir*22,u.y-30);
        }else{
          g.lineStyle(3,0xb99154);
          g.beginPath();g.arc(u.x+dir*16,u.y-13,15,-1.2,1.2,false);g.strokePath();
        }
      }
      if(u.flash>0){g.lineStyle(3,0xffd37c).strokeCircle(u.x+dir*16,u.y-18,17);}
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
    ui.fillStyle(0xc58bed).fillRoundedRect(18,493,924*this.energy.blue/10,13,5);
    this.message.setColor('#fff1cb');
    for(let i=0;i<CARDS.length;i++){
      const x=this.buttons[i].x;
      ui.fillStyle(i===this.selected?0x786344:0x3a4844).fillRoundedRect(x-138,513,276,79,10);
      ui.lineStyle(i===this.selected?4:2,i===this.selected?0xffdf91:0x7b886f).strokeRoundedRect(x-138,513,276,79,10);
      if(this.energy.blue<CARDS[i].cost)ui.fillStyle(0x000000,.38).fillRoundedRect(x-138,513,276,79,10);
    }
    const remaining=Math.max(0,240-this.elapsed);
    this.header.setText('HISTORICAL ROYALE v0.4   •   '+Math.floor(remaining/60)+':'+String(Math.floor(remaining%60)).padStart(2,'0')+'   •   Energie '+Math.floor(this.energy.blue)+'/10');
  }
}

new Phaser.Game({
  type:Phaser.AUTO,parent:'game',width:W,height:H,
  backgroundColor:'#355b42',
  scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},
  render:{pixelArt:true,antialias:false},
  scene:[Battle]
});
