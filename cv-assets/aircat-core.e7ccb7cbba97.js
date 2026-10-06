/* Pure simulation. Grid coordinates are shared by the 3D scene and controls. */
(() => {
 'use strict';
 const WIDTH=40,HEIGHT=30,MAX_BALLS=128;
 const LEVELS=Object.freeze(Array.from({length:10},(_,i)=>Object.freeze({
  number:i+1,balls:i+1,speed:3.2+i*.36,goal:i===9?80:75,split:i===9,
  image:`cv-assets/aircat/cat-${String(i+1).padStart(2,'0')}.webp`
 })));
 const DIRECTIONS={up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 class Game {
  constructor({random=Math.random,level=1}={}){this.random=random;this.reset(level);}
  reset(level=this.level){
   this.level=clamp(Math.floor(Number(level)||1),1,10);this.config=LEVELS[this.level-1];
   this.grid=new Uint8Array(WIDTH*HEIGHT);this.trail=[];this.trailSet=new Set();
   for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)if(x===0||y===0||x===WIDTH-1||y===HEIGHT-1)this.grid[y*WIDTH+x]=1;
   this.cat={x:WIDTH>>1,y:0,fromX:WIDTH>>1,fromY:0,moveT:1,direction:'down'};
   this.lastSafe={x:this.cat.x,y:this.cat.y};this.lives=3;this.status='ready';this.reason='';
   this.time=0;this.accumulator=0;this.direction=null;this.revision=0;this.nextId=1;this.splits=0;this.flash=0;
   this.balls=[];this.contacts=new Set();
   for(let i=0;i<this.config.balls;i++){
    let x=0,y=0;
    for(let t=0;t<160;t++){
     x=3+this.random()*(WIDTH-6);y=4+this.random()*(HEIGHT-8);
     if(this.balls.every(b=>(b.x-x)**2+(b.y-y)**2>4))break;
    }
    const angle=this.random()*Math.PI*2;
    this.balls.push(this.ball(x,y,angle,this.config.speed));
   }
   this.progress=0;return this;
  }
  ball(x,y,angle,speed){return {id:this.nextId++,x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:.52,phase:this.random()*Math.PI*2,frequency:2.3+this.random()*.9};}
  height(ball){return ball.r+.04+Math.abs(Math.sin(this.time*ball.frequency+ball.phase))*1.65;}
  start(){if(this.status==='ready'||this.status==='paused'){this.status='running';this.direction=null;this.accumulator=0;return true;}return false;}
  pause(){if(this.status==='running'){this.status='paused';this.direction=null;this.accumulator=0;return true;}return false;}
  setDirection(name,immediate=false){
   if(this.status!=='running')return false;
   this.direction=DIRECTIONS[name]?name:null;
   if(immediate&&this.direction){this.moveCat(this.direction);this.accumulator=0;}
   return true;
  }
  cell(x,y){if(x<0||x>=WIDTH||y<0||y>=HEIGHT)return 1;return this.grid[y*WIDTH+x];}
  moveCat(name){
   if(this.status!=='running')return;
   const [dx,dy]=DIRECTIONS[name]||[0,0],x=this.cat.x+dx,y=this.cat.y+dy;
   if(x<0||x>=WIDTH||y<0||y>=HEIGHT)return;
   const i=y*WIDTH+x,value=this.grid[i];
   if(value===2){this.loseLife('trail');return;}
   this.cat.fromX=this.cat.x;this.cat.fromY=this.cat.y;this.cat.moveT=0;this.cat.x=x;this.cat.y=y;this.cat.direction=name;
   if(value===0){
    this.grid[i]=2;this.trail.push(i);this.trailSet.add(i);this.revision++;
    if(this.balls.some(b=>this.hitsCell(b,x,y))){this.loseLife('ball');return;}
   }else{
    this.lastSafe={x,y};
    if(this.trail.length)this.capture();
   }
  }
  hitsCell(ball,x,y){
   const nearX=clamp(ball.x,x,x+1),nearY=clamp(ball.y,y,y+1);
   return (ball.x-nearX)**2+(ball.y-nearY)**2<ball.r**2;
  }
  capture(){
   // A ball crossing any part of the closing line always breaks it, including
   // the first flight after a lost life. Never silently seal a ball into a wall.
   if(this.balls.some(b=>this.touchesTrail(b))){this.loseLife('ball');return;}
   // A closing line becomes a wall; only components containing balls stay open.
   for(const i of this.trail)this.grid[i]=1;
   this.trail=[];this.trailSet.clear();
   const seen=new Uint8Array(this.grid.length),queue=new Int32Array(this.grid.length);let head=0,tail=0;
   for(const ball of this.balls){
    const x=clamp(Math.floor(ball.x),1,WIDTH-2),y=clamp(Math.floor(ball.y),1,HEIGHT-2),i=y*WIDTH+x;
    if(this.grid[i]===0&&!seen[i]){seen[i]=1;queue[tail++]=i;}
   }
   while(head<tail){
    const i=queue[head++],x=i%WIDTH,y=Math.floor(i/WIDTH);
    for(const n of [x>0?i-1:-1,x<WIDTH-1?i+1:-1,y>0?i-WIDTH:-1,y<HEIGHT-1?i+WIDTH:-1]){
     if(n>=0&&this.grid[n]===0&&!seen[n]){seen[n]=1;queue[tail++]=n;}
    }
   }
   let captured=0;
   for(let y=1;y<HEIGHT-1;y++)for(let x=1;x<WIDTH-1;x++){
    const i=y*WIDTH+x;if(this.grid[i]===0&&!seen[i])this.grid[i]=1;if(this.grid[i]===1)captured++;
   }
   this.progress=captured/((WIDTH-2)*(HEIGHT-2))*100;this.revision++;this.flash=.3;
   if(this.progress>=this.config.goal){this.status='won';this.direction=null;this.reason='';}
  }
  loseLife(reason){
   if(this.status!=='running')return;
   for(const i of this.trail)this.grid[i]=0;this.trail=[];this.trailSet.clear();this.revision++;
   this.lives--;this.direction=null;this.accumulator=0;this.reason=reason;this.flash=.5;
   this.cat={...this.cat,x:this.lastSafe.x,y:this.lastSafe.y,fromX:this.lastSafe.x,fromY:this.lastSafe.y,moveT:1};
   this.status=this.lives>0?'hurt':'lost';
  }
  resumeLife(){if(this.status==='hurt'){this.status='running';this.direction=null;this.reason='';return true;}return false;}
  wallAt(x,y,r){
   for(let iy=Math.floor(y-r);iy<=Math.floor(y+r);iy++)for(let ix=Math.floor(x-r);ix<=Math.floor(x+r);ix++){
    if(this.cell(ix,iy)===1&&this.hitsCell({x,y,r},ix,iy))return true;
   }
   return false;
  }
  touchesTrail(ball){
   if(!this.trail.length)return false;
   for(let y=Math.floor(ball.y-ball.r);y<=Math.floor(ball.y+ball.r);y++)for(let x=Math.floor(ball.x-ball.r);x<=Math.floor(ball.x+ball.r);x++){
    if(this.cell(x,y)===2&&this.hitsCell(ball,x,y))return true;
   }
   return false;
  }
  splitPair(a,b){
   const children=[];
   // Each parent creates two children; overlapping birth contacts are registered below.
   for(const parent of [a,b])for(const sign of [-1,1]){
    const base=Math.atan2(parent.vy,parent.vx),angle=base+sign*.68;
    const offset=.18*sign,px=parent.x+Math.cos(base+Math.PI/2)*offset,py=parent.y+Math.sin(base+Math.PI/2)*offset,radius=Math.max(.26,parent.r*.92),blocked=this.wallAt(px,py,radius);
    const child=this.ball(blocked?parent.x:px,blocked?parent.y:py,angle,Math.min(8.5,Math.hypot(parent.vx,parent.vy)*1.025));
    child.r=radius;child.phase=parent.phase+sign*.16;child.frequency=parent.frequency;
    children.push(child);
   }
   this.splits++;return children;
  }
  updateBalls(dt){
   for(const b of this.balls){
    const nx=b.x+b.vx*dt;
    if(this.wallAt(nx,b.y,b.r))b.vx=-b.vx;else b.x=nx;
    const ny=b.y+b.vy*dt;
    if(this.wallAt(b.x,ny,b.r))b.vy=-b.vy;else b.y=ny;
    if(this.touchesTrail(b)){this.loseLife('ball');return;}
   }
   const removed=new Set(),children=[],touching=new Set(),columns=Math.ceil(WIDTH/2),rows=Math.ceil(HEIGHT/2),buckets=new Array(columns*rows);
   // Broad phase: contacts can only occur in the same or neighbouring 2-cell bin.
   for(let i=0;i<this.balls.length;i++){
    const b=this.balls[i],key=Math.floor(b.y/2)*columns+Math.floor(b.x/2);
    (buckets[key]||(buckets[key]=[])).push(i);
   }
   pairs:for(let i=0;i<this.balls.length;i++){
    const a=this.balls[i];if(removed.has(a.id))continue;
    const col=Math.floor(a.x/2),row=Math.floor(a.y/2),candidates=[];
    for(let by=Math.max(0,row-1);by<=Math.min(rows-1,row+1);by++)for(let bx=Math.max(0,col-1);bx<=Math.min(columns-1,col+1);bx++){
     const bucket=buckets[by*columns+bx];if(bucket)candidates.push(...bucket);
    }
    for(const j of candidates){
     if(j<=i)continue;
     const b=this.balls[j];if(removed.has(b.id))continue;
     const dx=b.x-a.x,dy=b.y-a.y,dh=this.height(b)-this.height(a),r=a.r+b.r;
     const dist2=dx*dx+dy*dy+dh*dh;
     if(dist2>=r*r)continue;
     const contact=a.id<b.id?a.id+':'+b.id:b.id+':'+a.id;touching.add(contact);
     if(this.config.split&&!this.contacts.has(contact)){
      removed.add(a.id);removed.add(b.id);children.push(...this.splitPair(a,b));
      if(this.balls.length-removed.size+children.length>=MAX_BALLS)break pairs;
      break;
     }
     // Equal-mass elastic reflection only while approaching, never once per frame.
     const dist=Math.hypot(dx,dy)||.001,nx=dx/dist,ny=dy/dist,relative=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
     if(relative>0){a.vx-=relative*nx;a.vy-=relative*ny;b.vx+=relative*nx;b.vy+=relative*ny;}
    }
   }
   this.contacts=touching;
   if(removed.size){
    this.balls=this.balls.filter(b=>!removed.has(b.id)).concat(children);this.flash=.12;
    // A finite overload loss keeps exponential difficulty without freezing a phone.
    if(this.balls.length>=MAX_BALLS){this.balls=this.balls.slice(0,MAX_BALLS);this.status='lost';this.reason='overload';this.direction=null;return;}
    // Being born in contact is not a new collision. Re-arm after separation.
    for(const a of children)for(const b of this.balls){
     if(a.id===b.id)continue;
     if((a.x-b.x)**2+(a.y-b.y)**2+(this.height(a)-this.height(b))**2<(a.r+b.r)**2)this.contacts.add(a.id<b.id?a.id+':'+b.id:b.id+':'+a.id);
    }
   }
  }
  update(dt){
   if(this.status!=='running')return;
   dt=clamp(Number(dt)||0,0,1/30);this.time+=dt;this.flash=Math.max(0,this.flash-dt);this.cat.moveT=Math.min(1,this.cat.moveT+dt*12);
   this.updateBalls(dt);if(this.status!=='running')return;
   this.accumulator+=dt;
   while(this.accumulator>=1/12&&this.status==='running'){
    this.accumulator-=1/12;if(this.direction)this.moveCat(this.direction);
   }
  }
 }
 globalThis.AircatCore=Object.freeze({Game,LEVELS,WIDTH,HEIGHT,MAX_BALLS,DIRECTIONS});
})();
