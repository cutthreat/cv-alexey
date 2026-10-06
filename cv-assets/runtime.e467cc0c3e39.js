'use strict';
// Local word matching. The vocabulary comes from the work described in each case.
const SEARCH_STOP_WORDS = new Set([
  'а','и','или','в','во','на','по','с','со','к','ко','из','от','для','о','об','у','за','при',
  'не','это','как','почему','чтобы','мне','меня','мой','моя','мои','нас','наш','наша','наши',
  'нужно','нужен','нужна','нужны','надо','хочу','хотим','помогите','сделать','пожалуйста',
  'a','an','the','and','or','in','on','of','to','for','with','my','our','i','we','need','want','please',
]);
const SEARCH_ALIASES = Object.freeze({
  'битрикс':'bitrix','битрикс24':'bitrix24','б24':'bitrix24',
  'модх':'modx','модкс':'modx','срм':'crm','б2б':'b2b',
  'ии':'ai','телеграм':'telegram','гугл':'google','catalog':'catalogue',
});
function normaliseSearch(value){
  return String(value).normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е')
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
function searchWords(value){
  return normaliseSearch(value).split(/\s+/).filter(Boolean).map(word=>SEARCH_ALIASES[word]||word);
}
function searchWordKey(word){
  // Common noun/adjective endings, rather than arbitrary character truncation.
  if(/^[а-я]{5,}$/.test(word)){
    const stem=word.replace(/(?:иями|ями|ами|ого|его|ому|ему|ыми|ими|ая|яя|ое|ее|ые|ие|ой|ый|ий|ую|юю|ых|их|ом|ем|ам|ям|ов|ев|ах|ях|[аяыуюеиоь])$/,'');
    if(stem.length>=3)return stem;
  }
  if(/^[a-z]{5,}s$/.test(word)&&!/(?:ss|us|is)$/.test(word))return word.slice(0,-1);
  return word;
}
function buildSearchIndex(value){
  return [...new Set(searchWords(value))].map(word=>({word,key:searchWordKey(word)}));
}
function searchQuery(value){
  const words=searchWords(value);
  const meaningful=words.filter(word=>!SEARCH_STOP_WORDS.has(word));
  return [...new Set(meaningful.length?meaningful:words)].map(word=>({word,key:searchWordKey(word)}));
}
function matchesSearch(index,query){
  return query.every(term=>index.some(entry=>
    entry.word===term.word||entry.key===term.key||
    (term.word.length>=4&&entry.word.startsWith(term.word))||
    (term.key.length>=4&&entry.key.startsWith(term.key))
  ));
}

'use strict';
function presentationMode(){return document.documentElement.dataset.presentation||'personal';}
function positionKey(lang){return lang+':'+presentationMode();}
function syncPresentation(requested,target,lang){
  const url=new URL(location.href);
  let mode=url.searchParams.get('view')==='team'?'team':'personal';
  const sectionMode=requested?.closest('.personal-presentation,.team-presentation')?.dataset.presentation;
  if(sectionMode)mode=sectionMode;
  if(mode==='team')url.searchParams.set('view','team');else url.searchParams.delete('view');
  if(url.href!==location.href)history.replaceState(null,'',url);
  document.documentElement.dataset.presentation=mode;
  for(const root of roots)for(const panel of root.querySelectorAll('[data-presentation]'))panel.hidden=panel.dataset.presentation!==mode;
  const control=document.querySelector('[data-mode-switch]');
  control.setAttribute('aria-checked',String(mode==='team'));
  control.setAttribute('aria-label',lang==='ru'?'Решения команды':'Team solutions');
  control.querySelector('[data-mode-personal]').textContent=lang==='ru'?'Мой опыт':'My experience';
  control.querySelector('[data-mode-team]').textContent=lang==='ru'?'Решения команды':'Team solutions';
  return mode;
}
function teamNavigation(lang){
  return lang==='ru'?
    [['team-catalogue','Решения'],['ai-audit','ИИ на сайте'],['team-members','Команда'],['team-process','Как внедряем']]:
    [['team-catalogue','Solutions'],['ai-audit','Website AI'],['team-members','Team'],['team-process','Delivery']];
}
document.querySelector('[data-mode-switch]').addEventListener('click',()=>{
  const lang=document.documentElement.lang||'ru';
  const next=presentationMode()==='personal'?'team':'personal';
  requestPresentation(next);
});
window.addEventListener('popstate',()=>showView());

'use strict';
const DEFAULT_LANGUAGE = 'ru';
let activeFilter = 'all';
let activeQuery = '';
let currentView = null;
const returnPositions = new Map();
const roots = ['ru','en'].map(lang => document.getElementById(lang));
const text = {
  ru:{name:'Алексей Саава',title:'Алексей Саава | B2B-проекты, сайты и CRM',description:'Руководитель B2B-проектов. Сайты, CRM и автоматизация: портфолио, компетенции и формат работы.',nav:['Портфолио','Компетенции','Как работаю'],print:'Печать / PDF',skip:'Перейти к содержанию',cases:'кейсов',automations:'автоматизаций',found:'Найдено материалов: ',solutions:'решений'},
  en:{name:'Alexey Saava',title:'Alexey Saava | B2B Projects, Websites & CRM',description:'B2B Project Lead. Websites, CRM and automation: projects, skills and ways of working.',nav:['Portfolio','Skills','How I work'],print:'Print / PDF',skip:'Skip to content',cases:'project cases',automations:'automations',found:'Materials found: ',solutions:'solutions'}
};
const searchableText = new WeakMap();
roots.forEach(root => root.querySelectorAll('[data-route]').forEach(card => searchableText.set(card,buildSearchIndex(card.textContent + ' ' + card.dataset.tags + ' ' + card.dataset.searchTerms))));

function applyFilter({openMatches=false}={}){
  const query = searchQuery(activeQuery);
  const hasQuery = query.length > 0;
  for(const root of roots){
    const lang=root.lang;
    const cards=Array.from(root.querySelectorAll('[data-route]'));
    let total=0,automationCount=0;
    for(const card of cards){
      const matchesTag=activeFilter==='all'||card.dataset.tags.split(' ').includes(activeFilter);
      const matchesQuery=matchesSearch(searchableText.get(card),query);
      card.hidden=!(matchesTag&&matchesQuery);
      if(!card.hidden){total++;if(card.classList.contains('implementation-card'))automationCount++;}
    }
    for(const group of root.querySelectorAll('[data-filter-group]'))group.hidden=!Array.from(group.querySelectorAll('[data-route]')).some(card=>!card.hidden);
    for(const button of root.querySelectorAll('[data-filter]')){
      const filter=button.dataset.filter;
      const count=cards.filter(card=>(filter==='all'||card.dataset.tags.split(' ').includes(filter))&&matchesSearch(searchableText.get(card),query)).length;
      button.setAttribute('aria-pressed',String(filter===activeFilter));
      button.querySelector('.filter-count').textContent=count;
      button.setAttribute('aria-label',button.querySelector('span').textContent+' · '+count);
    }
    const countLabel=root.querySelector('[data-result-count]');
    countLabel.textContent=(activeFilter==='all'&&!hasQuery)?`${total-automationCount} ${text[lang].cases} · ${automationCount} ${text[lang].automations}`:text[lang].found+total;
    root.querySelector('[data-empty]').hidden=total!==0;
    root.querySelector('[data-automation-count]').textContent=automationCount+' '+text[lang].solutions;
    const catalogue=root.querySelector('.automation-panel');
    if(openMatches&&(activeFilter!=='all'||hasQuery)&&automationCount)catalogue.open=true;
    root.querySelector('[data-search]').value=activeQuery;
    for(const button of root.querySelectorAll('[data-query]')){
      button.setAttribute('aria-pressed',String(normaliseSearch(button.dataset.query)===normaliseSearch(activeQuery)));
    }
  }
  if(document.documentElement.dataset.mobileReady)syncMobileSearch();
}

function matchingCards(lang){
  if(presentationMode()==='team')return Array.from(document.getElementById(lang).querySelectorAll('[data-route]'));
  const query=searchQuery(activeQuery);
  return Array.from(document.getElementById(lang).querySelectorAll('[data-route]')).filter(card=>(activeFilter==='all'||card.dataset.tags.split(' ').includes(activeFilter))&&matchesSearch(searchableText.get(card),query));
}

function updateCaseNavigation(target){
  if(!target.classList.contains('detail'))return;
  const cards=matchingCards(target.lang);
  const index=cards.findIndex(card=>card.dataset.route===target.id);
  const neighbours=[index>0?cards[index-1]:null,index>=0?cards[index+1]:null];
  [target.querySelector('[data-case-previous]'),target.querySelector('[data-case-next]')].forEach((link,i)=>{
    const card=neighbours[i];
    if(card){
      link.href='#'+card.dataset.route;link.hidden=false;link.removeAttribute('aria-disabled');link.removeAttribute('tabindex');
      const name=card.querySelector('h4').textContent;
      link.querySelector('strong').textContent=name;
      link.setAttribute('aria-label',(i===0?(target.lang==='ru'?'Предыдущий проект: ':'Previous project: '):(target.lang==='ru'?'Следующий проект: ':'Next project: '))+name);
    }else{link.hidden=true;link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.setAttribute('tabindex','-1');}
  });
}

function ensureCaseView(key){
  if(!/^(ru|en)-case-\d+$/.test(key)||document.getElementById(key))return;
  const source=document.querySelector(`[data-case-template="${key}"]`);
  if(source)source.before(source.content.firstElementChild.cloneNode(true));
}

function showView({initial=false,keepModeFocus=false}={}){
  const oldMode=presentationMode();
  let key;
  try{key=decodeURIComponent(location.hash.slice(1))||DEFAULT_LANGUAGE;}catch{key=DEFAULT_LANGUAGE;history.replaceState(null,'','#'+key);}
  key=key.replace(/^(ru|en)-(?:personal-projects|solutions(?:-group)?)$/,'$1-results').replace(/^(ru|en)-(?:case-(?:35|36)|practical)$/,'$1-skills');
  ensureCaseView(key);
  let requested=document.getElementById(key);
  let target=requested?.classList.contains('view')?requested:requested?.closest('main.view');
  if(!target){key=DEFAULT_LANGUAGE;target=document.getElementById(key);requested=target;history.replaceState(null,'','#'+key);}
  const lang=target.lang;
  const mode=syncPresentation(requested,target,lang);
  const presentationChanged=oldMode!==mode;
  const oldView=currentView;
  const languageChanged=oldView&&oldView.lang!==lang;
  if(languageChanged){activeQuery='';}
  document.querySelectorAll('.view').forEach(view=>view.hidden=view!==target);
  document.documentElement.lang=lang;
  document.title=mode==='team'?(lang==='ru'?'Stacklevel | Команда для сайтов, продуктов и ИИ':'Stacklevel | Websites, products and AI team'):text[lang].title;
  document.querySelector('meta[name="description"]').content=mode==='team'?(lang==='ru'?'Stacklevel: разработка сайтов, цифровых продуктов, интеграций и ИИ. Команда под задачи проекта, от требований до внедрения.':'Stacklevel: websites, digital products, integrations and AI. Project-specific expertise from requirements to delivery.'):text[lang].description;
  const brand=document.querySelector('.brand');brand.href='#'+lang+(mode==='team'?'-team-cv':'');brand.setAttribute('aria-label',(mode==='team'?'Stacklevel':text[lang].name)+(lang==='ru'?' — главная':' — home'));
  document.querySelector('[data-brand-name]').textContent=text[lang].name;
  document.querySelector('[data-brand-name]').hidden=mode==='team';
  document.querySelector('[data-team-logo]').toggleAttribute('hidden',mode!=='team');
  document.querySelector('.brand-mark').hidden=mode==='team';
  document.querySelector('.brand-mark').textContent=lang==='ru'?'АС':'AS';
  document.querySelector('.page-nav').setAttribute('aria-label',lang==='ru'?'Разделы резюме':'CV sections');
  const navigation=mode==='team'?teamNavigation(lang):[['results',text[lang].nav[0]],['skills',text[lang].nav[1]],['working',text[lang].nav[2]]];
  document.querySelectorAll('[data-nav]').forEach((link,i)=>{
    const item=navigation[i];link.hidden=!item;
    link.removeAttribute('aria-current');
    if(!item)return;
    link.href='#'+lang+'-'+item[0];link.textContent=item[1];
    if(key===lang+'-'+item[0]||(target.classList.contains('detail')&&i===0))link.setAttribute('aria-current','location');
  });
  document.querySelectorAll('[data-language]').forEach(link=>{
    const nextLang=link.dataset.language;
    const suffix=target.classList.contains('detail')?target.id.slice(2):key.startsWith(lang+'-')?key.slice(2):'';
    link.href='#'+nextLang+suffix;
    if(nextLang===lang)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');
  });
  document.querySelector('[data-print]').textContent=mode==='team'?(lang==='ru'?'Печать':'Print'):text[lang].print;
  const skip=document.querySelector('[data-skip]');skip.href='#'+target.id;skip.textContent=text[lang].skip;
  document.querySelectorAll('[data-contact-lang]').forEach(link=>link.hidden=link.dataset.contactLang!==lang);
  document.querySelectorAll('[data-contact-mode]').forEach(block=>block.hidden=block.dataset.contactMode!==mode||(block.dataset.teamContactLang&&block.dataset.teamContactLang!==lang));
  applyFilter({openMatches:activeFilter!=='all'||Boolean(activeQuery)});
  updateCaseNavigation(target);
  if(target.classList.contains('detail'))target.querySelector('.back-list').textContent=mode==='team'?(lang==='ru'?'← Вернуться к решениям':'← Back to solutions'):(lang==='ru'?'← Вернуться к портфолио':'← Back to portfolio');
  currentView=target;
  if(document.documentElement.dataset.mobileReady)syncMobilePresentation(requested);
  const changed=oldView!==target;
  requestAnimationFrame(()=>{
    if(requested!==target){
      if(key.endsWith('-skills'))target.querySelector('.competency-dropdown').open=true;
      requested.scrollIntoView({block:'start',behavior:'instant'});
      requested.setAttribute('tabindex','-1');
      const focusTarget=requested.classList.contains('team-presentation')?requested.querySelector('h1'):requested.querySelector('h2')||requested;
      focusTarget.setAttribute('tabindex','-1');if(!keepModeFocus)focusTarget.focus({preventScroll:true});
    }else if(changed||initial||presentationChanged){
      const returning=!presentationChanged&&oldView?.classList.contains('detail')&&!target.classList.contains('detail')&&!languageChanged;
      window.scrollTo({top:returning?(returnPositions.get(positionKey(lang))??document.getElementById(lang+(mode==='team'?'-team-catalogue':'-results')).offsetTop):0,behavior:'instant'});
      if(!initial&&!keepModeFocus){
        const focusTarget=returning?target.querySelector(mode==='team'?`[data-solution-case][href="#${oldView.id}"]`:`[data-route="${oldView.id}"]`):target.querySelector(mode==='team'?'.team-presentation h1':'.personal-presentation h1');
        focusTarget?.focus({preventScroll:true});
      }
    }
  });
}

document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{activeFilter=button.dataset.filter;applyFilter({openMatches:true});}));
document.querySelectorAll('[data-search]').forEach(input=>input.addEventListener('input',()=>{activeQuery=input.value;applyFilter({openMatches:true});}));
document.querySelectorAll('[data-query]').forEach(button=>button.addEventListener('click',()=>{
  activeQuery=normaliseSearch(activeQuery)===normaliseSearch(button.dataset.query)?'':button.dataset.query;
  activeFilter='all';
  applyFilter({openMatches:true});
}));
document.querySelectorAll('[data-reset]').forEach(button=>button.addEventListener('click',()=>{activeFilter='all';activeQuery='';applyFilter();button.closest('main').querySelector('[data-search]').focus();}));
document.addEventListener('click',event=>{
  const link=event.target.closest('a[href^="#"]');
  if((link?.dataset.route||link?.hasAttribute('data-solution-case'))&&currentView&&!currentView.classList.contains('detail'))returnPositions.set(positionKey(currentView.lang),window.scrollY);
  if(link?.classList.contains('back-list')||(link?.closest('.breadcrumbs')&&link.hash.endsWith('-results'))){
    event.preventDefault();location.hash=currentView.lang;
  }
  if(link?.hasAttribute('data-skip')){event.preventDefault();currentView.focus({preventScroll:false});}
});
window.addEventListener('hashchange',()=>showView());
document.querySelector('[data-print]').addEventListener('click',()=>window.print());
let printState=[];
let printGroupState=[];
let printLinkState=[];
window.addEventListener('beforeprint',()=>{
  printState=Array.from(document.querySelectorAll('.competency-dropdown')).map(panel=>({panel,open:panel.open}));
  printState.forEach(({panel})=>panel.open=true);
  printGroupState=Array.from(document.querySelectorAll('main.view:not(.detail) [data-filter-group]')).map(group=>({group,hidden:group.hidden}));
  printGroupState.forEach(({group})=>group.hidden=false);
  // The condensed CV includes its key examples even after using portfolio filters.
  document.querySelectorAll('main.view:not(.detail) [data-route][data-print-highlight="true"]').forEach(card=>card.dataset.filteredBeforePrint=String(card.hidden));
  document.querySelectorAll('main.view:not(.detail) [data-route][data-print-highlight="true"]').forEach(card=>card.hidden=false);
  // Hash routes open HTML views and have no corresponding pages in the condensed PDF.
  printLinkState=Array.from(document.querySelectorAll('main.view:not(.detail) [data-route]')).map(card=>({card,href:card.getAttribute('href')}));
  printLinkState.forEach(({card})=>card.removeAttribute('href'));
});
window.addEventListener('afterprint',()=>{printState.forEach(({panel,open})=>panel.open=open);printState=[];printGroupState.forEach(({group,hidden})=>group.hidden=hidden);printGroupState=[];document.querySelectorAll('[data-filtered-before-print]').forEach(card=>{card.hidden=card.dataset.filteredBeforePrint==='true';delete card.dataset.filteredBeforePrint;});printLinkState.forEach(({card,href})=>{if(href!==null)card.setAttribute('href',href);});printLinkState=[];});
showView({initial:true});

'use strict';
const matrixMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const matrixMobile=window.matchMedia('(max-width:767.98px)');
const matrixOverlay=document.querySelector('[data-matrix-overlay]');
let matrixBusy=false,matrixFrame=0,matrixTimers=[],matrixCommit=null,matrixFinish=null;
const matrixWords={
 ru:{personal:'Мой опыт',team:'Решения команды',entry:'Выбрать формат',cat:'Дежавю — открыть мини-игру'},
 en:{personal:'My experience',team:'Team solutions',entry:'Choose a format',cat:'Déjà vu — open the mini-game'}
};
function matrixLanguage(){return document.documentElement.lang==='en'?'en':'ru';}
function matrixRemember(){try{sessionStorage.setItem('cv-matrix-choice-v1','chosen');}catch{}}
function matrixGameUrl(){
 const target=new URL('dejavu.html',location.href);
 target.searchParams.set('lang',matrixLanguage());
 target.searchParams.set('mode',presentationMode());
 target.searchParams.set('return',new URL(location.href).hash||'#'+matrixLanguage());
 return target.href;
}
function syncMatrixWords(){
 const w=matrixWords[matrixLanguage()];
 const entryLink=document.querySelector('[data-entry-open]');
 entryLink.setAttribute('aria-label',w.entry);entryLink.href='enter.html?lang='+matrixLanguage();
 document.querySelectorAll('[data-matrix-cat]').forEach(link=>{link.setAttribute('aria-label',w.cat);link.href=matrixGameUrl();});
}
function matrixRain(){
 const canvas=document.querySelector('[data-matrix-rain]');
 const context=canvas.getContext('2d');if(!context)return;
 const width=window.innerWidth,height=window.innerHeight,ratio=Math.min(window.devicePixelRatio||1,1.5);
 canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);context.scale(ratio,ratio);
 const theme=window.getComputedStyle(matrixOverlay);
 const palette={background:theme.getPropertyValue('--bg').trim(),code:theme.getPropertyValue('--accent').trim(),head:theme.getPropertyValue('--text').trim()};
 context.globalAlpha=1;context.fillStyle=palette.background;context.fillRect(0,0,width,height);
 const size=18,columns=Math.min(90,Math.ceil(width/size)),spacing=width/columns;
 const drops=Array.from({length:columns},()=>Math.random()*height/size),glyphs='01アイウエカキクサシスセソタチツナニハヒフミムメモラリル';
 context.font='14px ui-monospace,monospace';let last=0;
 function draw(time){
  if(!matrixBusy||document.hidden||matrixMotion.matches)return;
  if(time-last>34){
   last=time;context.globalAlpha=.16;context.fillStyle=palette.background;context.fillRect(0,0,width,height);context.globalAlpha=1;
   drops.forEach((drop,i)=>{context.fillStyle=i%5===0?palette.head:palette.code;context.fillText(glyphs[Math.floor(Math.random()*glyphs.length)],i*spacing,drop*size);drops[i]=drop*size>height?0:drop+.7;});
  }
  matrixFrame=requestAnimationFrame(draw);
 }
 matrixFrame=requestAnimationFrame(draw);
}
function matrixCleanup(){
 matrixTimers.forEach(clearTimeout);matrixTimers=[];cancelAnimationFrame(matrixFrame);matrixFrame=0;
 document.documentElement.classList.remove('matrix-shifting');matrixOverlay.classList.remove('is-running','is-dejavu');matrixOverlay.hidden=true;
 document.querySelector('[data-mode-switch]').removeAttribute('aria-busy');matrixBusy=false;matrixCommit=null;matrixFinish=null;
}
function matrixTransition(commit,{mode=presentationMode(),dejavu=false,onFinish=()=>{}}={}){
 if(matrixBusy)return false;
 if(matrixMotion.matches||document.hidden){commit();onFinish();return true;}
 matrixBusy=true;matrixFinish=onFinish;let committed=false;
 matrixCommit=()=>{if(!committed){committed=true;commit();}};
 const w=matrixWords[matrixLanguage()];
 document.querySelector('[data-matrix-label]').textContent=dejavu?'DÉJÀ VU':w[mode];
 document.querySelector('[data-matrix-command]').textContent=dejavu?'// MATRIX REWRITE':'// CONTEXT SWITCH';
 matrixOverlay.dataset.matrixMode=mode==='team'?'team':'personal';
 matrixOverlay.hidden=false;matrixOverlay.classList.toggle('is-dejavu',dejavu);matrixOverlay.classList.add('is-running');
 document.documentElement.classList.add('matrix-shifting');document.querySelector('[data-mode-switch]').setAttribute('aria-busy','true');
 matrixRain();
 matrixTimers.push(setTimeout(()=>matrixCommit?.(),390));
 matrixTimers.push(setTimeout(()=>{matrixCommit?.();matrixCleanup();onFinish();},940));
 return true;
}
function requestPresentation(next,{animate=true}={}){
 if(matrixBusy)return;
 const lang=matrixLanguage();
 const apply=()=>{
  const url=new URL(location.href);
  if(next==='team')url.searchParams.set('view','team');else url.searchParams.delete('view');
  url.hash=lang+(next==='team'?'-team-cv':'');
  if(url.href!==location.href)history.pushState(null,'',url);
  matrixRemember();showView({keepModeFocus:true});syncMatrixWords();
 };
 const finish=()=>{
  const target=document.querySelector(matrixMobile.matches?'[data-mobile-menu-open]':'[data-mode-switch]');
  target?.focus({preventScroll:true});
  document.querySelector('[data-matrix-live]').textContent=matrixWords[lang][next];
 };
 if(animate)matrixTransition(apply,{mode:next,onFinish:finish});else{apply();finish();}
}
document.querySelectorAll('[data-matrix-cat]').forEach(link=>link.addEventListener('click',event=>{
 if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||(event.button!==undefined&&event.button!==0))return;
 finishMatrixEarly();
 link.href=matrixGameUrl();
}));
function finishMatrixEarly(){if(matrixBusy){const finish=matrixFinish;matrixCommit?.();matrixCleanup();finish?.();}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)finishMatrixEarly();});
matrixMotion.addEventListener('change',()=>{if(matrixMotion.matches)finishMatrixEarly();});
window.addEventListener('popstate',()=>{if(matrixBusy)matrixCleanup();syncMatrixWords();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&matrixBusy){event.preventDefault();finishMatrixEarly();}});
window.addEventListener('hashchange',syncMatrixWords);
window.addEventListener('resize',()=>{if(matrixBusy){cancelAnimationFrame(matrixFrame);matrixRain();}});
window.addEventListener('beforeprint',finishMatrixEarly);
syncMatrixWords();

'use strict';
const mobileCVMedia=matchMedia('(max-width:767.98px)');
const mobileMenu=document.getElementById('mobile-menu');
const mobileMenuTrigger=document.querySelector('[data-mobile-menu-open]');
const mobileFoldPanels=Array.from(document.querySelectorAll('[data-mobile-fold]'));
let mobileHeaderVisible=true;
const mobileCopy={
 ru:{menu:'Меню',close:'Закрыть меню',personal:'Мой опыт',team:'Решения команды',home:'К началу',contact:'Написать Алексею в Telegram',company:'Написать в Stacklevel',continue:'Продолжить с Алексеем в Telegram',contextPersonal:'Кейсы и работа с Алексеем',contextTeam:'Stacklevel · команда под ваш проект',language:'Язык',sections:'Разделы',format:'Формат работы'},
 en:{menu:'Menu',close:'Close menu',personal:'My experience',team:'Team solutions',home:'Back to top',contact:'Message Alexey on Telegram',company:'Contact Stacklevel',continue:'Continue with Alexey on Telegram',contextPersonal:'Cases and delivery with Alexey',contextTeam:'Stacklevel · your project team',language:'Language',sections:'Sections',format:'Delivery format'}
};
function mobileLang(){return document.documentElement.lang==='en'?'en':'ru';}
function mobileReveal(target){
 if(!mobileCVMedia.matches||!target)return;
 for(let node=target.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
 const own=target.matches('details')?target:target.querySelector(':scope > [data-mobile-fold], :scope > .competency-dropdown');
 if(own)own.open=true;
}
function syncMobileSearch(){
 if(!document.documentElement.dataset.mobileReady||!mobileCVMedia.matches)return;
 const root=document.getElementById(mobileLang());
 const matching=activeFilter!=='all'||searchQuery(activeQuery).length>0;
 if(matching){
  mobileReveal(root.querySelector('[id$="-results"]'));
  root.querySelectorAll('[data-filter-group]:not([hidden]) [data-mobile-fold]').forEach(panel=>panel.open=true);
 }
}
function closeMobileMenu({restoreFocus=true}={}){
 if(!mobileMenu.open)return;
 mobileMenu.close();mobileMenuTrigger.setAttribute('aria-expanded','false');
 document.documentElement.classList.remove('mobile-menu-visible');
 if(restoreFocus)mobileMenuTrigger.focus({preventScroll:true});
}
function mobileLink(href,label){const link=document.createElement('a');link.href=href;link.textContent=label;return link;}
function syncMobilePresentation(requested){
 if(!document.documentElement.dataset.mobileReady)return;
 const lang=mobileLang(),mode=presentationMode(),words=mobileCopy[lang];
 mobileMenuTrigger.setAttribute('aria-label',words.menu+' · '+words[mode]);
 document.getElementById('mobile-menu-title').textContent=words.menu;
 mobileMenu.querySelector('[data-mobile-menu-close]').setAttribute('aria-label',words.close);
 mobileMenu.querySelector('[data-mobile-menu-context]').textContent=mode==='team'?words.contextTeam:words.contextPersonal;
 mobileMenu.querySelector('.mobile-mode-options').setAttribute('aria-label',words.format);
 mobileMenu.querySelectorAll('[data-mobile-mode]').forEach(button=>{button.textContent=words[button.dataset.mobileMode];button.setAttribute('aria-pressed',String(button.dataset.mobileMode===mode));});
 const links=mobileMenu.querySelector('[data-mobile-menu-links]');links.replaceChildren();links.setAttribute('aria-label',words.sections);
 links.append(mobileLink('#'+lang+(mode==='team'?'-team-cv':''),words.home));
 const items=mode==='team'?teamNavigation(lang):[['results',lang==='ru'?'Проекты и решения':'Projects and solutions'],['skills',lang==='ru'?'Компетенции':'Skills'],['working',lang==='ru'?'Формат работы':'Delivery'],['team',lang==='ru'?'Продуктовая экспертиза':'Product expertise']];
 for(const [key,label] of items)links.append(mobileLink('#'+lang+'-'+key,label));
 const contacts=mobileMenu.querySelector('[data-mobile-menu-contacts]');contacts.replaceChildren();
 if(mode==='team')contacts.append(mobileLink('https://stacklevel.group/ru/contact',words.company));
 contacts.append(mobileLink('https://t.me/top1_finance',mode==='team'?words.continue:words.contact));
 contacts.querySelectorAll('a').forEach(link=>{link.target='_blank';link.rel='noopener noreferrer';});
 const languages=mobileMenu.querySelector('[data-mobile-menu-languages]');languages.replaceChildren();languages.setAttribute('aria-label',words.language);
 for(const source of document.querySelectorAll('.header-tools [data-language]')){const link=mobileLink(source.getAttribute('href'),source.textContent);link.lang=source.lang;if(source.dataset.language===lang)link.setAttribute('aria-current','true');languages.append(link);}
 // Direct links reveal the destination and its ancestors before showView scrolls.
 if(requested&&requested!==currentView)mobileReveal(requested);
}
function setMobileFoldLayout(){
 for(const panel of mobileFoldPanels){
  // Desktop unfolds only the mobile layout wrappers; real catalogues stay closed.
  panel.open=!mobileCVMedia.matches;
 }
 if(!mobileCVMedia.matches){closeMobileMenu({restoreFocus:false});document.documentElement.classList.remove('mobile-scrolled');}
 else{
  document.documentElement.classList.toggle('mobile-scrolled',!mobileHeaderVisible);
  const key=decodeURIComponent(location.hash.slice(1));
  if(key&&!['ru','en'].includes(key))mobileReveal(document.getElementById(key));
 }
}
mobileMenuTrigger.addEventListener('click',()=>{
 if(!mobileCVMedia.matches)return;
 syncMobilePresentation();mobileMenu.showModal();mobileMenuTrigger.setAttribute('aria-expanded','true');
 document.documentElement.classList.add('mobile-menu-visible');
 mobileMenu.querySelector('[data-mobile-menu-close]').focus({preventScroll:true});
});
mobileMenu.querySelector('[data-mobile-menu-close]').addEventListener('click',()=>closeMobileMenu());
mobileMenu.addEventListener('cancel',event=>{event.preventDefault();closeMobileMenu();});
mobileMenu.addEventListener('click',event=>{
 const link=event.target.closest('a');
 if(link){
  closeMobileMenu({restoreFocus:false});
  if(link.hash&&link.hash===location.hash){
   event.preventDefault();
   const target=document.getElementById(decodeURIComponent(link.hash.slice(1)));
   if(target){
    mobileReveal(target);target.scrollIntoView({block:'start',behavior:'instant'});
    const heading=target.querySelector('h1,h2')||target;
    heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});
   }
  }
 }
 const button=event.target.closest('[data-mobile-mode]');
 if(button){closeMobileMenu({restoreFocus:false});requestPresentation(button.dataset.mobileMode);}
});
window.addEventListener('hashchange',()=>closeMobileMenu({restoreFocus:false}));
window.addEventListener('popstate',()=>closeMobileMenu({restoreFocus:false}));
mobileCVMedia.addEventListener('change',setMobileFoldLayout);
document.querySelectorAll('[data-mobile-filter]').forEach(link=>link.addEventListener('click',()=>{
 if(!mobileCVMedia.matches)return;
 activeFilter=link.dataset.mobileFilter;activeQuery='';applyFilter({openMatches:true});
 mobileReveal(document.getElementById(mobileLang()+'-results'));
}));
// Observe once; no per-scroll layout read and no sticky bar over the content.
if('IntersectionObserver' in window){
 const headerObserver=new IntersectionObserver(entries=>{
  mobileHeaderVisible=entries[0].isIntersecting;
  document.documentElement.classList.toggle('mobile-scrolled',mobileCVMedia.matches&&!mobileHeaderVisible);
 },{threshold:0});headerObserver.observe(document.querySelector('.site-header'));
}else{
 let mobileScrollScheduled=false;
 window.addEventListener('scroll',()=>{if(mobileScrollScheduled||!mobileCVMedia.matches)return;mobileScrollScheduled=true;requestAnimationFrame(()=>{document.documentElement.classList.toggle('mobile-scrolled',window.scrollY>160);mobileScrollScheduled=false;});},{passive:true});
}
let mobilePrintState=[];
window.addEventListener('beforeprint',()=>{closeMobileMenu({restoreFocus:false});mobilePrintState=mobileFoldPanels.map(panel=>({panel,open:panel.open}));mobileFoldPanels.forEach(panel=>panel.open=true);});
window.addEventListener('afterprint',()=>{mobilePrintState.forEach(({panel,open})=>panel.open=open);mobilePrintState=[];});
document.documentElement.dataset.mobileReady='true';
mobileMenuTrigger.setAttribute('aria-expanded','false');
setMobileFoldLayout();syncMobilePresentation();








