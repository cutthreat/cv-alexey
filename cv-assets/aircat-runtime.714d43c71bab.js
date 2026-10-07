(() => {
 'use strict';
 const {Game,LEVELS}=AircatCore,{Renderer}=AircatRenderer;
 const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
 const params=new URL(location.href).searchParams,lang=params.get('lang')==='en'?'en':'ru';document.documentElement.lang=lang;
 const words=lang==='en'?{
  title:'Déjà vu',back:'Back to my experience',level:'Level',of:'of',rules:'How to play',retry:'Try again',restart:'Restart',load:'Loading…',ready:'Play',running:'Pause',paused:'Resume',hurt:'Continue',lost:'Try again',won:'Next level',complete:'Play again',ball:'Spheres',boost:'Speed ×3',dogShort:'Dog on revealed territory',goal:'Revealed area',lives:'Lives',up:'Up',down:'Down',left:'Left',right:'Right',select:'Choose a level',photoError:'The level image could not be loaded.',gpuError:'3D is unavailable in this browser.',gpuLost:'3D was paused. Restore the scene to continue.',reload:'Reload',roundLost:'Round over',levelWon:'Level complete',allWon:'All ten levels complete',hurtCopy:'Line broken',pausedCopy:'Paused',help:'Hold a direction to fly. Leave the revealed area, draw a line and return to it to capture a section. Avoid spheres and your own unfinished line. You have three lives per level.',hard:'On every level, two mature spheres of the same colour can become four. Multiplication starts after 12 seconds, newborns mature for 12 seconds, and only one pair can split every 8 seconds. Different colours bounce. At 40 spheres, multiplication stops and play continues. Level 1 has one sphere; colour pairs appear from level 2.',dog:'From level 7 a dog wanders on revealed territory without hurting the cat. Yellow marks give ×3 speed there for 2.5 seconds; entering unrevealed territory restores normal speed. Marks last 12 seconds. Poop blocks one cell for 10 seconds without closing the perimeter or cutting off a passage. All timers stop while paused.'
 }:{
  title:'Дежавю',back:'Вернуться в мой опыт',level:'Уровень',of:'из',rules:'Правила',retry:'Повторить',restart:'Заново',load:'Загрузка…',ready:'Играть',running:'Пауза',paused:'Продолжить',hurt:'Продолжить',lost:'Ещё раз',won:'Следующий уровень',complete:'Пройти заново',ball:'Шары',boost:'Скорость ×3',dogShort:'Пёс на открытой территории',goal:'Открытая площадь',lives:'Жизни',up:'Вверх',down:'Вниз',left:'Влево',right:'Вправо',select:'Выбрать уровень',photoError:'Не удалось загрузить изображение уровня.',gpuError:'3D недоступно в этом браузере.',gpuLost:'3D приостановлено. Восстановите сцену, чтобы продолжить.',reload:'Перезагрузить',roundLost:'Раунд завершён',levelWon:'Уровень пройден',allWon:'Все десять уровней пройдены',hurtCopy:'Линия прервана',pausedCopy:'Пауза',help:'Удерживайте направление, чтобы лететь. Выйдите с открытого участка, проведите линию и вернитесь на него — так вы захватите территорию. Избегайте шаров и собственной незавершённой линии. На каждом уровне три жизни.',hard:'На всех уровнях два созревших шара одного цвета могут превратиться в четыре. Размножение начинается через 12 секунд, новые шары созревают 12 секунд, а деление одной пары возможно не чаще раза в 8 секунд. Разноцветные шары отскакивают. При 40 шарах размножение прекращается, игра продолжается. На первом уровне один шар; цветовые пары появляются со второго.',dog:'С седьмого уровня пёс гуляет по открытой территории и не отнимает жизни у кота. Жёлтая метка даёт там скорость ×3 на 2,5 секунды; при выходе на закрытый участок скорость становится обычной. Метки исчезают через 12 секунд. Какашка перекрывает одну клетку на 10 секунд, сохраняя свободный периметр и проходы. На паузе все таймеры останавливаются.'
 };
 const icons={play:'<path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none"/>',pause:'<path d="M9 5v14M15 5v14" stroke="currentColor" stroke-width="3"/>',next:'<path d="M9 5l7 7-7 7"/>',retry:'<path d="M20 7v5h-5M19 12a7 7 0 1 1-2-5"/>'};
 const canvas=$('[data-aircat-board]'),action=$('[data-aircat-action]'),stage=$('[data-aircat-stage]'),levelDetails=$('[data-aircat-levels]'),error=$('[data-aircat-error]');
 $('[data-aircat-title]').textContent=words.title;document.title=words.title+' · '+(lang==='en'?'Alexey Savostyuk':'Алексей Савостюк');
 $('[data-aircat-rules]').textContent=words.rules;$('[data-aircat-help]').textContent=words.help;
 $('[data-aircat-pacing-help]').textContent=words.hard;$('[data-aircat-dog-help]').textContent=words.dog;
 $('[data-aircat-restart-label]').textContent=words.restart;$('[data-aircat-restart]').setAttribute('aria-label',words.restart);
 $('[data-aircat-retry]').textContent=words.retry;levelDetails.setAttribute('aria-label',words.select);
 const back=$('[data-aircat-back]'),returnHash=params.get('return')||'#'+lang;
 const localCV=document.body.dataset.aircatReturnFile==='cv-alexey.html'?'cv-alexey.html':'index.html';
 const backUrl=new URL(new URL(location.href).protocol==='file:'?localCV:'./',location.href);backUrl.searchParams.set('cv','1');backUrl.hash=/^#(?:ru|en)(?:-[a-z0-9-]+)?$/.test(returnHash)?returnHash:'#'+lang;back.href=backUrl.href;back.setAttribute('aria-label',words.back);
 $$('[data-dir]').forEach(b=>b.setAttribute('aria-label',words[b.dataset.dir]));
 let saved={level:1,passed:[]};
 try{const s=JSON.parse(localStorage.getItem('cv-aircat-progress-v1')||'null');if(s&&Number.isInteger(s.level)&&s.level>=1&&s.level<=10&&Array.isArray(s.passed))saved={level:s.level,passed:s.passed.filter(n=>Number.isInteger(n)&&n>=1&&n<=10)};}catch{}
 let game=new Game({level:saved.level}),renderer=null,frame=0,lastTime=0,lag=0,loading=false,loadEpoch=0,errorKind='',hudKey='',pointerId=null,heldKeys=[],pointerDirection=null;
 const pad=$('[data-aircat-pad]'),keyDirs={ArrowUp:'up',ArrowRight:'right',ArrowDown:'down',ArrowLeft:'left',w:'up',d:'right',s:'down',a:'left',W:'up',D:'right',S:'down',A:'left'};
 function storeProgress(){try{localStorage.setItem('cv-aircat-progress-v1',JSON.stringify(saved));}catch{}}
 function clearInput(){pointerDirection=null;pointerId=null;heldKeys=[];game.setDirection(null);$$('[data-dir]').forEach(b=>b.dataset.pressed='false');}
 function applyDirection(immediate=false){
  const direction=pointerDirection||(heldKeys.length?keyDirs[heldKeys[heldKeys.length-1]]:null);
  game.setDirection(direction,immediate);$$('[data-dir]').forEach(b=>b.dataset.pressed=String(b.dataset.dir===direction&&game.status==='running'));
 }
 function draw(){if(renderer)renderer.draw(game);}
 function stop(){if(frame)cancelAnimationFrame(frame);frame=0;lastTime=0;lag=0;}
 function sync(){
  const boosted=game.catSpeed()>12;
  const key=[game.level,game.status,game.lives,Math.floor(game.progress),game.balls.length,boosted,loading,errorKind].join(':');
  if(key===hudKey)return;hudKey=key;
  const status=loading?'loading':game.status,percent=Math.floor(game.progress);
  $('[data-aircat-level]').textContent=`${words.level} ${game.level} · 10`;
  $('[data-aircat-progress]').value=percent;$('[data-aircat-progress]').setAttribute('aria-label',words.goal);
  $('[data-aircat-percent]').textContent=`${percent}% / ${game.config.goal}%`;
  $('[data-aircat-lives]').setAttribute('aria-label',`${words.lives}: ${game.lives}`);$$('[data-aircat-life]').forEach((b,i)=>b.dataset.lost=String(i>=game.lives));
  const caption={ready:'',running:'',paused:words.pausedCopy,hurt:words.hurtCopy,lost:words.roundLost,won:game.level===10?words.allWon:words.levelWon}[game.status]||'';
  $('[data-aircat-result]').textContent=caption||`${words.ball}: ${game.balls.length}${boosted?' · '+words.boost:''}`;
  const actionWord=loading?words.load:game.status==='won'&&game.level===10?words.complete:words[game.status];
  action.setAttribute('aria-label',actionWord||words.ready);action.title=actionWord||words.ready;
  $('[data-aircat-state]').textContent=actionWord||words.ready;
  action.disabled=loading||!!errorKind;$$('[data-dir]').forEach(b=>b.disabled=loading||!!errorKind||game.status!=='running');
  const icon=game.status==='running'?'pause':game.status==='won'?'next':game.status==='lost'?'retry':'play';
  action.querySelector('svg').innerHTML=icons[icon];
  $$('[data-level]').forEach(b=>{b.setAttribute('aria-current',String(Number(b.dataset.level)===game.level));b.dataset.passed=String(saved.passed.includes(Number(b.dataset.level)));b.setAttribute('aria-label',`${words.level} ${b.dataset.level}${Number(b.dataset.level)>=7?' · '+words.dogShort:''}`);});
  canvas.setAttribute('aria-label',`${words.title}. ${words.level} ${game.level}. ${words.goal}: ${percent}%. ${words.ball}: ${game.balls.length}.`);
 }
 let announced='';
 function announceState(){const key=game.status+':'+game.lives+':'+game.level;if(key===announced)return;announced=key;$('[data-aircat-announcement]').textContent=`${words.level} ${game.level}. ${$('[data-aircat-result]').textContent}. ${words.lives}: ${game.lives}.`;}
 function finishFrame(){
  if(game.status==='won'&&!saved.passed.includes(game.level)){saved.passed.push(game.level);storeProgress();}
  if(game.status!=='running'){clearInput();stop();}
  sync();announceState();draw();
 }
 function tick(now){
  frame=0;if(game.status!=='running'||loading||errorKind)return;
  if(!lastTime)lastTime=now;lag+=Math.min((now-lastTime)/1000,.05);lastTime=now;
  for(let steps=0;lag>=1/120&&steps<8;steps++){game.update(1/120);lag-=1/120;if(game.status!=='running')break;}
  finishFrame();if(game.status==='running')frame=requestAnimationFrame(tick);
 }
 function run(){stop();sync();announceState();draw();if(game.status==='running'&&!document.hidden)frame=requestAnimationFrame(tick);}
 function pause(){if(game.pause()){clearInput();stop();sync();announceState();draw();}}
 function showError(kind){errorKind=kind;error.hidden=false;$('[data-aircat-error-copy]').textContent=kind==='photo'?words.photoError:kind==='lost'?words.gpuLost:words.gpuError;loading=false;pause();sync();}
 async function loadLevel(level,{start=false,focus=false}={}){
  const epoch=++loadEpoch;stop();clearInput();loading=true;errorKind='';error.hidden=true;
  game=new Game({level});saved.level=game.level;storeProgress();sync();draw();
  if(!renderer){showError('gpu');return;}
  try{
   const loaded=await renderer.loadImage(game.config.image);if(epoch!==loadEpoch||!loaded)return;
   loading=false;if(start&&!document.hidden)game.start();sync();announceState();draw();if(focus&&!document.hidden)action.focus({preventScroll:true});if(game.status==='running')run();
  }catch(_){if(epoch===loadEpoch)showError('photo');}
 }
 function act(){
  if(loading||errorKind)return;
  if(game.status==='running')pause();
  else if(game.status==='won')loadLevel(game.level===10?1:game.level+1,{focus:true});
  else if(game.status==='lost')loadLevel(game.level,{start:true,focus:true});
  else{if(game.status==='hurt')game.resumeLife();else game.start();clearInput();run();}
 }
 action.addEventListener('click',act);
 $('[data-aircat-restart]').addEventListener('click',()=>loadLevel(game.level,{focus:true}));
 $('[data-aircat-retry]').addEventListener('click',()=>{if(errorKind==='photo')loadLevel(game.level);else location.reload();});
 $$('[data-level]').forEach(b=>b.addEventListener('click',()=>{levelDetails.open=false;loadLevel(Number(b.dataset.level),{focus:true});}));
 levelDetails.addEventListener('toggle',()=>{if(levelDetails.open)pause();});
 $('[data-aircat-help-details]').addEventListener('toggle',e=>{if(e.target.open)pause();});
 pad.addEventListener('pointerdown',e=>{
  const button=e.target.closest('[data-dir]');if(!button||game.status!=='running'||pointerId!==null||e.button!==0)return;
  e.preventDefault();pointerId=e.pointerId;pointerDirection=button.dataset.dir;
  try{pad.setPointerCapture(e.pointerId);}catch{}
  applyDirection(true);finishFrame();
 });
 pad.addEventListener('pointermove',e=>{
  if(e.pointerId!==pointerId||game.status!=='running')return;e.preventDefault();
  const r=pad.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2;
  const direction=Math.hypot(dx,dy)<18?null:Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
  if(direction!==pointerDirection){pointerDirection=direction;applyDirection(false);}
 });
 for(const name of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(name,e=>{
  if(e.pointerId!==pointerId)return;pointerId=null;pointerDirection=null;applyDirection(false);
 });
 $$('[data-dir]').forEach(b=>b.addEventListener('click',e=>{if(e.detail===0&&game.status==='running'){game.moveCat(b.dataset.dir);finishFrame();}}));
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){levelDetails.open=false;pause();return;}
  if(e.key===' '&&(e.target===document.body||e.target===canvas)){e.preventDefault();if(!e.repeat)act();return;}
  if(!keyDirs[e.key]||game.status!=='running'||levelDetails.open||e.ctrlKey||e.altKey||e.metaKey)return;
  e.preventDefault();if(!heldKeys.includes(e.key)){heldKeys.push(e.key);applyDirection(true);finishFrame();}
 });
 document.addEventListener('keyup',e=>{if(keyDirs[e.key]){heldKeys=heldKeys.filter(k=>k!==e.key);applyDirection(false);}});
 window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('beforeprint',pause);
 window.addEventListener('pagehide',e=>{pause();stop();if(!e.persisted&&renderer)renderer.dispose();});window.addEventListener('pageshow',()=>{sync();draw();});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();loadEpoch++;stop();clearInput();game.pause();showError('lost');});
  canvas.addEventListener('webglcontextrestored',()=>{
   if(renderer)renderer.dispose();renderer=null;
   const epoch=++loadEpoch;
   try{renderer=new Renderer(canvas,{onImage:draw});errorKind='';error.hidden=true;loading=true;sync();renderer.loadImage(game.config.image).then(loaded=>{if(epoch!==loadEpoch||!loaded)return;loading=false;sync();draw();}).catch(()=>{if(epoch===loadEpoch)showError('photo');});}catch(_){showError('gpu');}
 });
 const resize=()=>{clearInput();if(renderer){renderer.resize();draw();}};
 window.addEventListener('resize',resize);
 if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(resize);observer.observe(stage);}
 try{renderer=new Renderer(canvas,{onImage:draw});loadLevel(saved.level);}catch(_){showError('gpu');}
})();
