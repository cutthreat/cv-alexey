/* A complete page scene after the final win. No modal and no background loop. */
(() => {
 'use strict';
 const SOURCE='https://beinecke.library.yale.edu/beinecke/collections/beinecke-cipher-voynich-manuscript';
 const COPY={
  ru:{win:'Десятый уровень пройден',reboot:'Матрица перезагружена',tag:'НЕ РАСШИФРОВАНО',title:'Что скрывает\nрукопись Войнича?',body:'Неизвестный автор. Неизвестная письменность. Текст этой рукописи до сих пор не расшифрован.',source:'Рукопись в библиотеке Йеля ↗',skip:'Пропустить',replay:'Повторить эффект',restart:'Пройти заново',field:'К игровому полю',back:'Вернуться в мой опыт'},
  en:{win:'Level ten complete',reboot:'Matrix reloaded',tag:'UNDECIPHERED',title:'What does the\nVoynich manuscript conceal?',body:'An unknown author. An unidentified script. The text of this manuscript remains undeciphered.',source:'The manuscript at Yale Library ↗',skip:'Skip',replay:'Replay the effect',restart:'Play again',field:'Back to the field',back:'Back to my experience'}
 };
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
 const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
 const phaseAt=t=>t<1.1?'fracture':t<3.3?'collapse':t<4.6?'reboot':t<7.8?'decode':'resolved';
 function decoded(text,progress,salt=0){
  const chars=Array.from(text),count=Math.floor(clamp(progress)*chars.length);
  return chars.map((c,i)=>/\s/.test(c)||i<count?c:String((i*7+salt*3)%10)).join('');
 }
 class Scene{
  constructor(root,{lang='ru',board,backURL,onReturn=()=>{},onRestart=()=>{}}={}){
   this.root=root;this.board=board;this.words=COPY[lang]||COPY.ru;
   this.onReturn=onReturn;this.onRestart=onRestart;this.active=false;this.suspended=false;this.elapsed=0;this.last=null;this.frame=0;this.snapshot=null;this.particles=[];this.lastTextFrame=-1;this.completed=false;
   const $=s=>root.querySelector(s);
   this.canvas=$('[data-finale-canvas]');try{this.ctx=this.canvas.getContext('2d',{alpha:false});}catch{this.ctx=null;}
   this.title=$('[data-finale-title-code]');this.copy=$('[data-finale-copy-code]');this.reboot=$('[data-finale-reboot-code]');this.skip=$('[data-finale-skip]');this.returnButton=$('[data-finale-return]');
   this.motion=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion:reduce)'):null;
   this.root.setAttribute('aria-label',this.words.win);
   $('[data-finale-win]').textContent=this.words.win;
   $('[data-finale-tag]').textContent=this.words.tag;
   $('[data-finale-title-readable]').textContent=this.words.title;
   $('[data-finale-copy]').textContent=this.words.body;
   $('[data-finale-reboot]').textContent=this.words.reboot;
   const source=$('[data-finale-source]');source.href=SOURCE;source.textContent=this.words.source;
   const back=$('[data-finale-back]');back.href=backURL;back.setAttribute('aria-label',this.words.back);
   for(const [selector,key] of [['[data-finale-skip]','skip'],['[data-finale-replay]','replay'],['[data-finale-restart]','restart'],['[data-finale-return]','field']])$(selector).textContent=this.words[key];
   this.skip.addEventListener('click',()=>this.finish());
   $('[data-finale-replay]').addEventListener('click',()=>this.start({capture:false}));
   this.returnButton.addEventListener('click',()=>{this.close();this.onReturn();});
   $('[data-finale-restart]').addEventListener('click',()=>{this.close();this.onRestart();});
   root.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.active){e.preventDefault();if(!this.completed)this.finish();else{this.close();this.onReturn();}}});
   this.onVisibility=()=>document.hidden?this.suspend():this.resume();
   this.onBlur=()=>this.suspend();this.onFocus=()=>{if(!document.hidden)this.resume();};
   this.onHide=()=>this.suspend();this.onShow=()=>{if(!document.hidden)this.resume();};
   this.onResize=()=>{if(this.active){this.resize();this.draw();}};
   this.onMotion=()=>{if(this.active&&this.motion.matches)this.finish();};
   document.addEventListener('visibilitychange',this.onVisibility);
   window.addEventListener('blur',this.onBlur);window.addEventListener('focus',this.onFocus);
   window.addEventListener('pagehide',this.onHide);window.addEventListener('pageshow',this.onShow);
   window.addEventListener('resize',this.onResize);
   if(this.motion&&this.motion.addEventListener)this.motion.addEventListener('change',this.onMotion);
  }
  capture(){
   this.particles=[];this.snapshot=null;
   if(!this.ctx||!this.board)return;
   try{
    const full=document.createElement('canvas');full.width=Math.min(1024,this.board.width||800);full.height=Math.round(full.width*(this.board.height||600)/(this.board.width||800));
    const context=full.getContext('2d');context.drawImage(this.board,0,0,full.width,full.height);this.snapshot=full;
    const sample=document.createElement('canvas');sample.width=192;sample.height=144;const s=sample.getContext('2d');s.drawImage(full,0,0,192,144);const data=s.getImageData(0,0,192,144).data;
    for(let y=0;y<144;y+=6)for(let x=0;x<192;x+=6){const i=(y*192+x)*4,light=(data[i]+data[i+1]+data[i+2])/765;if(light<.075)continue;this.particles.push({u:x/192,v:y/144,light,seed:((x*13+y*19)%101)/101});}
   }catch{this.snapshot=null;this.particles=[];}
  }
  resize(){
   const rect=this.root.getBoundingClientRect();this.w=Math.max(280,rect.width||window.innerWidth||390);this.h=Math.max(360,rect.height||window.innerHeight||844);
   const ratio=Math.min(1.5,globalThis.devicePixelRatio||1);this.canvas.width=Math.round(this.w*ratio);this.canvas.height=Math.round(this.h*ratio);
   if(this.ctx)this.ctx.setTransform(ratio,0,0,ratio,0,0);
  }
  start({capture=true}={}){
   this.cancel();if(capture)this.capture();this.active=true;this.completed=false;this.elapsed=0;this.last=null;this.lastTextFrame=-1;this.root.hidden=false;this.root.dataset.phase='fracture';this.skip.hidden=false;
   document.body.dataset.aircatFinale='true';
   this.root.querySelector('[data-finale-mystery]').inert=true;
   this.root.querySelector('[data-finale-actions]').inert=true;
   this.root.querySelector('[data-finale-announcement]').textContent='';
   this.resize();this.paintText();this.draw();
   this.skip.focus({preventScroll:true});
   this.suspended=document.hidden;
   if(!this.ctx||(this.motion&&this.motion.matches)){this.finish();return;}
   if(!this.suspended)this.schedule();
  }
  schedule(){if(this.active&&!this.completed&&!this.suspended&&!this.frame)this.frame=requestAnimationFrame(now=>this.tick(now));}
  tick(now){
   this.frame=0;if(!this.active||this.completed||this.suspended)return;
   if(this.last!==null)this.elapsed+=clamp((now-this.last)/1000,0,.06);this.last=now;
   if(this.elapsed>=7.8){this.finish();return;}
   this.root.dataset.phase=phaseAt(this.elapsed);this.draw();this.paintText();this.schedule();
  }
  paintText(){
   const frame=Math.floor(this.elapsed*18);if(frame===this.lastTextFrame)return;this.lastTextFrame=frame;
   this.reboot.textContent=decoded(this.words.reboot,(this.elapsed-3.3)/.9,frame);
   this.title.textContent=decoded(this.words.title,(this.elapsed-4.6)/1.4,frame);
   this.copy.textContent=decoded(this.words.body,(this.elapsed-5.7)/1.9,frame);
  }
  finish(){
   if(!this.active||this.completed)return;this.cancel();this.elapsed=7.8;this.completed=true;this.root.dataset.phase='resolved';this.skip.hidden=true;
   this.root.querySelector('[data-finale-mystery]').inert=false;this.root.querySelector('[data-finale-actions]').inert=false;
   this.title.textContent=this.words.title;this.copy.textContent=this.words.body;this.reboot.textContent=this.words.reboot;this.draw();
   this.root.querySelector('[data-finale-announcement]').textContent=this.words.win+'. '+this.words.title.replace('\n',' ');
   this.root.querySelector('[data-finale-title]').focus({preventScroll:true});
  }
  suspend(){if(!this.active)return;this.suspended=true;this.cancel();}
  resume(){if(!this.active||document.hidden)return;this.suspended=false;this.last=null;this.schedule();}
  cancel(){if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;this.last=null;}
  close(){this.cancel();this.active=false;this.suspended=false;this.root.hidden=true;delete document.body.dataset.aircatFinale;}
  dispose(){
   this.close();document.removeEventListener('visibilitychange',this.onVisibility);window.removeEventListener('blur',this.onBlur);window.removeEventListener('focus',this.onFocus);window.removeEventListener('pagehide',this.onHide);window.removeEventListener('pageshow',this.onShow);window.removeEventListener('resize',this.onResize);if(this.motion&&this.motion.removeEventListener)this.motion.removeEventListener('change',this.onMotion);
  }
  draw(){
   const c=this.ctx;if(!c)return;const w=this.w,h=this.h,t=this.elapsed,cx=w/2,cy=h*.46;
   c.globalAlpha=1;c.fillStyle='#100e16';c.fillRect(0,0,w,h);
   const halo=c.createRadialGradient(cx,cy,0,cx,cy,Math.max(w,h)*.65);halo.addColorStop(0,'#31213e');halo.addColorStop(.5,'#17121f');halo.addColorStop(1,'#100e16');c.fillStyle=halo;c.fillRect(0,0,w,h);
   // Numeric columns form a calm frame around the readable final question.
   c.font='12px ui-monospace, monospace';c.textAlign='center';
   const columns=Math.ceil(w/23),settled=t>=7.8;
   for(let i=0;i<columns;i++){
    const x=i*23+11,seed=(i*47%103)/103,head=((seed*h+t*(38+seed*44))%(h+200))-100;
    for(let k=0;k<13;k++){const y=head-k*17;if(y<0||y>h)continue;const distance=Math.abs(x-cx)/Math.max(1,w*.5),veil=settled?.075+distance*.11:.13+distance*.22;c.globalAlpha=veil*(1-k/14);c.fillStyle=k===0?'#f5eaff':'#d3b1f5';c.fillText(String((i*7+k*3+Math.floor(t*7))%10),x,y);}
   }
   const bw=Math.min(w*.86,h*.76*4/3),bh=bw*.75,bx=(w-bw)/2,by=(h-bh)/2;
   if(t<1.5&&this.snapshot){c.globalAlpha=1-smooth((t-.4)/1.1);c.drawImage(this.snapshot,bx,by,bw,bh);}
   const expansion=smooth((t-.55)/2.05);
   if(t<3.4){
    c.font='13px ui-monospace, monospace';
    const particles=this.particles.length?this.particles:Array.from({length:260},(_,i)=>({u:(i*37%251)/251,v:(i*73%257)/257,light:.5,seed:(i%97)/97}));
    for(const p of particles){
     const ox=bx+p.u*bw,oy=by+p.v*bh,dx=ox-cx,dy=oy-cy,angle=p.seed*6.283;
     const x=ox+dx*expansion*2.8+Math.sin(angle+t*1.8)*expansion*80,y=oy+dy*expansion*2.8+Math.cos(angle+t*1.8)*expansion*70;
     c.globalAlpha=clamp((t-.2)/.5)*(1-smooth((t-2.1)/1.2))*(.35+p.light*.65);c.fillStyle=p.light>.55?'#f5eaff':'#d3b1f5';c.fillText(String((Math.floor(p.seed*100)+Math.floor(t*20))%10),x,y);
    }
   }
   // Rings and radial code suggest a reconstruction, without flashes or whiteouts.
   if(t>1.6&&t<4.6){
    const warp=smooth((t-1.6)/.8)*(1-smooth((t-3.6)/1));c.globalAlpha=warp*.45;c.strokeStyle='#d3b1f5';c.lineWidth=1;
    for(let i=0;i<8;i++){const r=((i/8+(t-1.6)*.43)%1)*Math.max(w,h)*.72;c.beginPath();c.ellipse(cx,cy,r,r*.68,0,0,Math.PI*2);c.stroke();}
    for(let i=0;i<38;i++){const a=i/38*Math.PI*2,r=65+((i*71+t*230)%Math.max(w,h));c.globalAlpha=warp*(.18+(i%4)*.06);c.fillText(String((i+Math.floor(t*18))%10),cx+Math.cos(a)*r,cy+Math.sin(a)*r*.68);}
   }
   if(t>=4.6){
    // A code medallion, not a fabricated transcription of the manuscript.
    const x=w*.5,y=h*.22,r=Math.min(68,w*.12),alpha=smooth((t-4.6)/1.1);c.globalAlpha=alpha*.4;c.strokeStyle='#d3b1f5';c.lineWidth=1;
    for(let ring=0;ring<3;ring++){c.beginPath();c.arc(x,y,r*(1-ring*.24),0,Math.PI*2);c.stroke();}
    c.font='10px ui-monospace, monospace';
    for(let i=0;i<24;i++){const a=i/24*Math.PI*2;c.globalAlpha=alpha*(i%3===0?.65:.25);c.fillStyle='#e3c8ff';c.fillText(String((i*3)%10),x+Math.cos(a)*(r+12),y+Math.sin(a)*(r+12)+3);}
    c.globalAlpha=alpha*.75;c.fillText('MS · 408',x,y+4);
   }
   // Keep the centre opaque enough that moving code never competes with copy.
   const veil=c.createRadialGradient(cx,h*.55,0,cx,h*.55,Math.min(w*.65,h*.65));veil.addColorStop(0,'#100e16e8');veil.addColorStop(.55,'#100e16b0');veil.addColorStop(1,'#100e1600');c.globalAlpha=smooth((t-4.3)/.8);c.fillStyle=veil;c.fillRect(0,0,w,h);c.globalAlpha=1;
  }
 }
 globalThis.AircatFinale={Scene,COPY,SOURCE,phaseAt,decoded};
})();
