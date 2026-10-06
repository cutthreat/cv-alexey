/* Standalone Déjà vu game. The CV does not load this script. */
(() => {
  'use strict';
  const COLS = 20, ROWS = 24;
  const DIRECTIONS = Object.freeze({up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]});
  const OPPOSITE = Object.freeze({up:'down',right:'left',down:'up',left:'right'});
  const BEST_KEY = 'cv-dejavu-best-v1';

  function seededRandom(seed) {
    let value = Number(seed) >>> 0;
    return () => { value = (Math.imul(value,1664525) + 1013904223) >>> 0; return value / 4294967296; };
  }
  function spawnFood(state) {
    const occupied = new Set(state.body.map(p => p.y * state.cols + p.x));
    const free = [];
    for (let y=0;y<state.rows;y++) for (let x=0;x<state.cols;x++) {
      if (!occupied.has(y * state.cols + x)) free.push({x,y});
    }
    if (!free.length) return null;
    let random = Number(state.rng());
    if (!Number.isFinite(random)) random = .5;
    random = Math.max(0,Math.min(1 - Number.EPSILON,random));
    return free[Math.floor(random * free.length)];
  }
  function createState(options={}) {
    if (typeof options === 'function') options = {rng:options};
    if (typeof options === 'number') options = {seed:options};
    const rng = typeof options.rng === 'function' ? options.rng
      : options.seed !== undefined ? seededRandom(options.seed) : Math.random;
    const state = {cols:COLS,rows:ROWS,body:[{x:10,y:12},{x:9,y:12},{x:8,y:12}],dir:'right',queue:[],food:null,score:0,status:'ready',ticks:0,reason:null,rng};
    state.food = spawnFood(state);
    return state;
  }
  function turn(state,direction) {
    if (!DIRECTIONS[direction] || !['ready','running'].includes(state.status) || state.queue.length >= 2) return false;
    const previous = state.queue.at(-1) || state.dir;
    if (direction === previous || direction === OPPOSITE[previous]) return false;
    state.queue.push(direction);
    return true;
  }
  function start(state) { if (state.status !== 'ready') return false;state.status='running';return true; }
  function pause(state) { if (state.status !== 'running') return false;state.status='paused';state.queue.length=0;return true; }
  function resume(state) { if (state.status !== 'paused') return false;state.status='running';return true; }
  function restart(state) { return createState({rng:state.rng}); }
  function snapshot(state) {
    return {cols:state.cols,rows:state.rows,body:state.body.map(p=>({...p})),dir:state.dir,queue:[...state.queue],food:state.food?{...state.food}:null,score:state.score,status:state.status,ticks:state.ticks,reason:state.reason};
  }
  function step(state) {
    const event = {status:state.status,moved:false,ate:false,reason:state.reason};
    if (state.status !== 'running') return event;
    const direction = state.queue.shift() || state.dir;
    state.dir = direction;
    state.ticks++;
    const vector = DIRECTIONS[direction];
    const next = {x:state.body[0].x + vector[0],y:state.body[0].y + vector[1]};
    const ate = Boolean(state.food && next.x === state.food.x && next.y === state.food.y);
    const wall = next.x<0 || next.y<0 || next.x>=state.cols || next.y>=state.rows;
    // The old tail vacates its cell on a normal move, so it is not a collision.
    const trail = state.body.slice(0,ate?state.body.length:state.body.length-1).some(p=>p.x===next.x && p.y===next.y);
    if (wall || trail) {
      state.status='over';state.reason=wall?'wall':'trail';state.queue.length=0;
      return {status:state.status,moved:false,ate:false,reason:state.reason};
    }
    state.body.unshift(next);
    if (ate) {
      state.score++;
      state.food = spawnFood(state);
      if (!state.food) {state.status='won';state.reason='complete';state.queue.length=0;}
    } else state.body.pop();
    return {status:state.status,moved:true,ate,reason:state.reason};
  }
  const core = Object.freeze({createState,turn,step,start,pause,resume,restart,snapshot,spawnFood});

  const words = {
    ru:{title:'Дежавю',score:'Мыши',best:'Рекорд',start:'Начать',restart:'Играть снова',resume:'Продолжить',pause:'Пауза',back:'Вернуться в CV',over:'Раунд завершён',won:'Все мыши пойманы',board:'Игровое поле: кот, мышь и след из кода',controls:'Управление котом',up:'Вверх',right:'Вправо',down:'Вниз',left:'Влево',unavailable:'Игра недоступна'},
    en:{title:'Déjà vu',score:'Mice',best:'Best',start:'Start',restart:'Play again',resume:'Resume',pause:'Pause',back:'Back to CV',over:'Round over',won:'All mice caught',board:'Game board: a cat, a mouse and a code trail',controls:'Cat controls',up:'Up',right:'Right',down:'Down',left:'Left',unavailable:'Game unavailable'}
  };
  const palettes = {
    personal:{bg:'#121116',grid:'rgba(211,177,245,.075)',accent:'#d3b1f5',mouse:'#f6f3fa',eyes:'#121116'},
    team:{bg:'#ffffff',grid:'rgba(33,101,217,.08)',accent:'#2165d9',mouse:'#162238',eyes:'#ffffff'}
  };
  let elements=null, context=null, state=null, opened=false, lang='ru', mode='personal', best=0;
  let frameId=0, lastTime=null, accumulator=0, resizeObserver=null;
  let pointer=null, padPointer=null, width=0, height=0;

  function interval() { return Math.max(110,220 - Math.floor(state.score/3)*5); }
  function stopLoop() {
    if(frameId)window.cancelAnimationFrame(frameId);
    frameId=0;lastTime=null;accumulator=0;
  }
  function releasePointer() {
    if(pointer && elements){const id=pointer.id;pointer=null;try{if(elements.board.hasPointerCapture?.(id))elements.board.releasePointerCapture(id);}catch(_){}}
    pointer=null;
  }
  function releasePad() {
    if(!padPointer)return;
    const {id,button}=padPointer;padPointer=null;delete button.dataset.pressed;
    try{if(button.hasPointerCapture?.(id))button.releasePointerCapture(id);}catch(_){}
  }
  function updateBest() {
    if(state.score<=best)return;
    best=state.score;
    try{window.sessionStorage.setItem(BEST_KEY,String(best));}catch(_){}
  }
  function updateControls() {
    for(const button of elements.directions){
      const current=button.dataset.gameDirection===state.dir;
      button.dataset.current=String(current);
      button.setAttribute('aria-pressed',String(current));
      button.disabled=!context || !['ready','running'].includes(state.status);
    }
  }
  function updateUI() {
    if(!elements || !state)return;
    const copy=words[lang],status=state.status;
    elements.title.textContent=copy.title;document.title=copy.title+' · '+(mode==='team'?'Stacklevel':lang==='en'?'Alexey Saava':'Алексей Саава');
    elements.score.textContent=copy.score+' '+state.score;elements.best.textContent=copy.best+' '+best;
    elements.card.hidden=status==='running';
    elements.result.textContent=!context?copy.unavailable:status==='paused'?copy.pause:status==='over'?copy.over:status==='won'?copy.won:'';
    const label=status==='paused'?copy.resume:['over','won'].includes(status)?copy.restart:copy.start;
    elements.start.setAttribute('aria-label',label);elements.start.title=label;elements.start.disabled=!context;
    elements.pause.disabled=!context || !['running','paused'].includes(status);
    elements.pause.dataset.state=status;
    elements.pause.setAttribute('aria-label',status==='paused'?copy.resume:copy.pause);
    elements.pause.title=status==='paused'?copy.resume:copy.pause;
    elements.back.setAttribute('aria-label',copy.back);elements.back.title=copy.back;
    elements.pad.setAttribute('aria-label',copy.controls);
    for(const button of elements.directions){button.setAttribute('aria-label',copy[button.dataset.gameDirection]);button.title=copy[button.dataset.gameDirection];}
    elements.board.setAttribute('aria-label',copy.board+'. '+copy.score+': '+state.score+'.');
    elements.status.textContent=status==='running'?'':status==='ready'?copy.title:elements.result.textContent+'. '+copy.score+' '+state.score;
    elements.surface.dataset.status=status;updateControls();
  }
  function fitBoard() {
    if(!opened || !context || document.hidden)return;
    const rect=elements.board.getBoundingClientRect();
    if(!rect.width || !rect.height)return;
    width=rect.width;height=rect.height;
    const ratio=Math.min(window.devicePixelRatio || 1,1.5);
    elements.board.width=Math.max(1,Math.round(width*ratio));elements.board.height=Math.max(1,Math.round(height*ratio));
    context.setTransform(ratio,0,0,ratio,0,0);draw();
  }
  function sprite(pattern,x,y,size,color) {
    const pixel=size/pattern[0].length;context.fillStyle=color;
    for(let row=0;row<pattern.length;row++)for(let col=0;col<pattern[row].length;col++){
      if(pattern[row][col]==='1')context.fillRect(x+col*pixel,y+row*pixel,pixel+.2,pixel+.2);
    }
  }
  function draw() {
    if(!opened || !context || !width || !height)return;
    const colors=palettes[mode],cell=Math.min(width/COLS,height/ROWS);
    const offsetX=(width-cell*COLS)/2,offsetY=(height-cell*ROWS)/2;
    context.globalAlpha=1;context.fillStyle=colors.bg;context.fillRect(0,0,width,height);
    context.strokeStyle=colors.grid;context.lineWidth=.5;context.beginPath();
    for(let x=0;x<=COLS;x++){context.moveTo(offsetX+x*cell,offsetY);context.lineTo(offsetX+x*cell,offsetY+ROWS*cell);}
    for(let y=0;y<=ROWS;y++){context.moveTo(offsetX,offsetY+y*cell);context.lineTo(offsetX+COLS*cell,offsetY+y*cell);}
    context.stroke();context.font=Math.max(8,Math.floor(cell*.7))+'px ui-monospace,Consolas,monospace';
    context.textAlign='center';context.textBaseline='middle';context.fillStyle=colors.accent;
    const code='01アイスムシネ';
    state.body.slice(1).forEach((point,index)=>{
      context.globalAlpha=Math.max(.4,.82-index*.018);
      context.fillText(code[(index+state.ticks)%code.length],offsetX+(point.x+.5)*cell,offsetY+(point.y+.5)*cell);
    });
    context.globalAlpha=1;
    const head=state.body[0],sx=offsetX+head.x*cell+cell*.025,sy=offsetY+head.y*cell+cell*.025;
    sprite(['01000010','11100111','11111111','11111111','11011011','11111111','01111110','00111100'],sx,sy,cell*.95,colors.accent);
    context.fillStyle=colors.eyes;context.fillRect(sx+cell*.2375,sy+cell*.4156,cell*.11875,cell*.11875);
    context.fillRect(sx+cell*.59375,sy+cell*.4156,cell*.11875,cell*.11875);
    if(state.food){const mouse=state.food;sprite(['00101000','01111100','01111100','00111000','00011000','00001111','00000001','00000000'],offsetX+mouse.x*cell+cell*.04,offsetY+mouse.y*cell+cell*.04,cell*.92,colors.mouse);}
  }
  function endRound(){stopLoop();releasePointer();releasePad();updateBest();updateUI();draw();elements.start.focus({preventScroll:true});}
  function frame(now) {
    frameId=0;
    if(!opened || state.status!=='running')return;
    if(document.hidden){pauseRound();return;}
    if(lastTime===null)lastTime=now;
    accumulator+=Math.min(400,Math.max(0,now-lastTime));lastTime=now;
    let ticks=0,changed=false;
    while(accumulator>=interval() && ticks<3 && state.status==='running'){
      const duration=interval(),event=step(state);accumulator-=duration;ticks++;changed=changed||event.moved;
      if(event.ate){updateBest();updateUI();}
    }
    if(state.status!=='running'){endRound();return;}
    if(ticks===3 && accumulator>=interval())accumulator%=interval();
    if(changed){draw();updateControls();}
    frameId=window.requestAnimationFrame(frame);
  }
  function runLoop(){stopLoop();if(opened && state.status==='running'){if(document.hidden)pauseRound();else frameId=window.requestAnimationFrame(frame);}}
  function play() {
    if(!opened || !context)return;
    if(['over','won'].includes(state.status))state=restart(state);
    const changed=state.status==='paused'?resume(state):start(state);if(!changed)return;
    updateUI();draw();
    if(document.activeElement===elements.start)elements.board.focus({preventScroll:true});
    runLoop();
  }
  function pauseRound(){if(!opened)return;pause(state);stopLoop();releasePointer();releasePad();updateUI();draw();}
  function togglePause(){if(!opened)return;if(state.status==='running')pauseRound();else play();}
  function steer(direction) {
    if(!opened || !context || !DIRECTIONS[direction])return false;
    if(state.status==='ready'){
      // First direction defines the starting heading; every D-pad button works.
      const [dx,dy]=DIRECTIONS[direction],head=state.body[0];state.dir=direction;state.queue.length=0;
      state.body=state.body.map((_,index)=>({x:head.x-dx*index,y:head.y-dy*index}));
      if(state.food && state.body.some(p=>p.x===state.food.x && p.y===state.food.y))state.food=spawnFood(state);
      play();return true;
    }
    // Resume is explicit on the play/pause control, never an accidental direction.
    if(state.status!=='running')return false;
    return turn(state,direction);
  }
  function pointerDown(event) {
    if(!opened || pointer || event.isPrimary===false || (event.button!==undefined && event.button!==0))return;
    if(!['ready','running'].includes(state.status))return;
    event.preventDefault();pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
    try{elements.board.setPointerCapture(event.pointerId);}catch(_){}
  }
  function pointerMove(event) {
    if(!pointer || pointer.id!==event.pointerId || !['ready','running'].includes(state.status))return;
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;if(Math.max(Math.abs(dx),Math.abs(dy))<12)return;
    event.preventDefault();steer(Math.abs(dx)>=Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));
    pointer.x=event.clientX;pointer.y=event.clientY;
  }
  function pointerUp(event){if(pointer?.id!==event.pointerId)return;pointerMove(event);releasePointer();}
  function pointerCancel(event){if(pointer?.id===event.pointerId)releasePointer();if(padPointer?.id===event.pointerId)releasePad();}
  function padDown(event) {
    if(!opened || padPointer || event.isPrimary===false || (event.button!==undefined && event.button!==0))return;
    const button=event.currentTarget;if(button.disabled)return;
    event.preventDefault();padPointer={id:event.pointerId,button};button.dataset.pressed='true';
    try{button.setPointerCapture(event.pointerId);}catch(_){}
    steer(button.dataset.gameDirection);
  }
  function padUp(event){if(padPointer?.id===event.pointerId)releasePad();}
  function padClick(event){if(event.detail===0)steer(event.currentTarget.dataset.gameDirection);}
  function keydown(event) {
    if(!opened || event.ctrlKey || event.metaKey || event.altKey)return;
    if(event.key==='Escape'){event.preventDefault();pauseRound();return;}
    if(event.key===' ' || event.code==='Space'){
      if(event.target?.closest?.('button,a'))return;
      event.preventDefault();if(!event.repeat)togglePause();return;
    }
    const key=String(event.key || ''),direction={ArrowUp:'up',ArrowRight:'right',ArrowDown:'down',ArrowLeft:'left',w:'up',d:'right',s:'down',a:'left'}[key] || {w:'up',d:'right',s:'down',a:'left'}[key.toLowerCase()];
    if(!direction)return;
    event.preventDefault();if(!event.repeat)steer(direction);
  }
  function returnURL(hash) {
    const url=new URL(window.location.protocol==='file:'?'./cv-alexey.html':'./',window.location.href);
    url.searchParams.set('cv','1');if(mode==='team')url.searchParams.set('view','team');
    url.hash=typeof hash==='string' && /^#(?:ru|en)(?:-[a-z0-9-]+)?$/.test(hash)?hash:'#'+lang+(mode==='team'?'-team-cv':'');
    return url.href;
  }
  function lazyInit() {
    if(elements)return true;
    const surface=document.querySelector('main[data-dejavu-game]');if(!surface)return false;
    const select=attribute=>surface.querySelector('['+attribute+']');
    const found={surface,title:select('data-game-title'),score:select('data-game-score'),best:select('data-game-best'),board:select('data-game-board'),status:select('data-game-status'),start:select('data-game-start'),pause:select('data-game-pause'),back:select('data-game-back'),card:select('data-game-card'),result:select('data-game-result'),pad:select('data-game-pad')};
    if(Object.values(found).some(node=>!node))return false;
    elements={...found,directions:[...surface.querySelectorAll('[data-game-direction]')]};if(elements.directions.length!==4){elements=null;return false;}
    try{context=elements.board.getContext('2d');}catch(_){context=null;}
    state=createState();try{best=Math.max(0,Math.min(COLS*ROWS-3,Math.floor(Number(window.sessionStorage.getItem(BEST_KEY)) || 0)));}catch(_){best=0;}
    elements.start.addEventListener('click',play);elements.pause.addEventListener('click',togglePause);
    // Leave a resumable paused page for browser Back/BFCache; no running loop.
    elements.back.addEventListener('click',event=>{if(!event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && (event.button===undefined || event.button===0))pauseRound();});
    for(const button of elements.directions){
      button.addEventListener('pointerdown',padDown);button.addEventListener('pointerup',padUp);button.addEventListener('pointercancel',pointerCancel);
      button.addEventListener('lostpointercapture',event=>{if(padPointer?.id===event.pointerId)releasePad();});button.addEventListener('click',padClick);
      button.addEventListener('keydown',event=>{if(event.key===' ' || event.key==='Enter')button.dataset.pressed='true';});
      button.addEventListener('keyup',()=>{delete button.dataset.pressed;});button.addEventListener('blur',()=>{delete button.dataset.pressed;});
    }
    elements.board.addEventListener('pointerdown',pointerDown);elements.board.addEventListener('pointermove',pointerMove);
    elements.board.addEventListener('pointerup',pointerUp);elements.board.addEventListener('pointercancel',pointerCancel);
    elements.board.addEventListener('lostpointercapture',event=>{if(pointer?.id===event.pointerId)pointer=null;});
    document.addEventListener('keydown',keydown);
    window.addEventListener('pointerup',event=>{pointerUp(event);padUp(event);});window.addEventListener('pointercancel',pointerCancel);
    window.addEventListener('resize',fitBoard);window.addEventListener('pagehide',()=>{if(opened){pauseRound();resizeObserver?.disconnect();}});
    window.addEventListener('beforeprint',()=>{if(opened)pauseRound();});
    window.addEventListener('pageshow',()=>{if(opened){if(context)resizeObserver?.observe(elements.board);fitBoard();}});
    document.addEventListener('visibilitychange',()=>{if(!opened)return;if(document.hidden)pauseRound();else fitBoard();});
    if(typeof window.ResizeObserver==='function')resizeObserver=new window.ResizeObserver(fitBoard);
    return true;
  }
  function open(trigger,options={}) {
    if(!lazyInit())return false;
    lang=options.lang==='en'?'en':'ru';mode=options.mode==='team'?'team':'personal';
    document.documentElement.lang=lang;document.documentElement.dataset.mode=mode;elements.surface.dataset.mode=mode;
    elements.back.href=returnURL(options.returnHash);
    if(opened){updateUI();draw();return true;}
    opened=true;updateUI();
    if(context){resizeObserver?.observe(elements.board);fitBoard();}
    (context?elements.start:elements.back).focus({preventScroll:true});
    return true;
  }
  function close() {
    if(!opened || !elements)return false;
    opened=false;pause(state);stopLoop();releasePointer();releasePad();resizeObserver?.disconnect();updateUI();return true;
  }
  window.CVDejavuGame=Object.freeze({open,close,core});
  function boot(){const params=new URL(window.location.href).searchParams;open(null,{lang:params.get('lang'),mode:params.get('mode'),returnHash:params.get('return')});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

