/* Standalone entry page: no CV underneath, no modal, no mandatory loading delay. */
(() => {
  'use strict';
  const page = document.querySelector('[data-entry-page]');
  if (!page) return;
  const stage = page.querySelector('[data-entry-stage]');
  const reveal = page.querySelector('[data-entry-reveal]');
  const status = page.querySelector('[data-entry-status]');
  const choices = [...page.querySelectorAll('[data-entry-mode]')];
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const words = {
    ru: { name:'Алексей Саава', eyebrow:'Ваша задача. Ваш выбор.', title:'Как решим вашу задачу?', instruction:'Выберите таблетку на ладони', personal:'Мой опыт', personalNote:'Кейсы и работа со мной', team:'Решения команды', teamNote:'Команда под ваш проект', note:'Формат можно сменить в любой момент.', credit:'Портрет по моему фото', skip:'Открыть мой опыт ↗', opening:'Открываю', portrait:'Алексей в образе Морфиуса: очки, кожаный плащ и две таблетки на ладонях', pageTitle:'Выберите формат работы — Алексей Саава', tools:'Параметры входа' },
    en: { name:'Alexey Saava', eyebrow:'Your task. Your choice.', title:'How shall we solve your task?', instruction:'Choose a pill in my palm', personal:'My experience', personalNote:'Projects and working with me', team:'Team solutions', teamNote:'A team for your project', note:'You can change the format at any time.', credit:'Portrait based on my photo', skip:'Open my experience ↗', opening:'Opening', portrait:'Alexey as Morpheus: sunglasses, a leather coat and two pills in his palms', pageTitle:'Choose how we work — Alexey Saava', tools:'Entry settings' }
  };
  words.ru.compare = 'Сравнить с первым вариантом ↗';
  words.en.compare = 'Compare with the first version ↗';
  // A review variant carries its own copy; navigation and rendering stay shared.
  const copyConfiguration = document.querySelector('[data-entry-copy]');
  if (copyConfiguration) {
    try {
      const copy = JSON.parse(copyConfiguration.textContent);
      for (const locale of ['ru','en']) {
        for (const key of Object.keys(words[locale])) {
          if (typeof copy?.[locale]?.[key] === 'string') words[locale][key] = copy[locale][key];
        }
      }
    } catch (_) { /* A missing or invalid optional override preserves default copy. */ }
  }
  const currentUrl = new URL(window.location.href);
  let language = currentUrl.searchParams.get('lang') === 'en' || currentUrl.hash.startsWith('#en') ? 'en' : 'ru';
  const initialMode = currentUrl.searchParams.get('view') === 'team' ? 'team' : 'personal';
  let phase = 'ready';
  let chosenMode = null;
  let navigating = false;
  let revealTimer = 0;
  let navigationTimer = 0;
  let frame = 0;
  let lastFrame = 0;
  let width = 0;
  let height = 0;
  let streams = [];
  const contexts = [page.querySelector('[data-entry-code]'), page.querySelector('[data-reveal-code]')].map(canvas => ({canvas, context:canvas?.getContext('2d') ?? null}));
  const alphabet = 'アイウエオカキクケコサシスセソタチツテト01';

  function destination(mode) {
    const target = new URL(window.location.protocol === 'file:' ? './cv-alexey.html' : './', window.location.href);
    if (mode === 'team') target.searchParams.set('view','team');
    else target.searchParams.set('cv','1');
    target.hash = language + (mode === 'team' ? '-team-cv' : '');
    return target.href;
  }

  function palette(mode) {
    page.dataset.scenario = mode;
    const theme = document.querySelector('[data-entry-theme]');
    if (theme) theme.content = mode === 'team' ? '#ffffff' : '#121116';
  }

  function localize() {
    const copy = words[language];
    document.documentElement.lang = language;
    document.title = copy.pageTitle;
    page.querySelectorAll('[data-copy]').forEach(node => { node.textContent = copy[node.dataset.copy]; });
    page.querySelectorAll('[data-copy-alt]').forEach(node => { node.alt = copy[node.dataset.copyAlt]; });
    const toggle = page.querySelector('[data-entry-language]');
    toggle.textContent = language === 'ru' ? 'EN' : 'RU';
    toggle.setAttribute('aria-label', language === 'ru' ? 'Switch to English' : 'Переключить на русский');
    page.querySelector('[data-entry-tools]').setAttribute('aria-label',copy.tools);
    const compare = page.querySelector('[data-entry-compare]');
    if (compare) {
      const comparison = new URL('./enter.html', window.location.href);
      comparison.searchParams.set('lang',language);
      if (initialMode === 'team') comparison.searchParams.set('view','team');
      compare.href = comparison.href;
    }
    page.querySelectorAll('[data-entry-skip]').forEach(node => {
      node.href = destination('personal');
      node.setAttribute('aria-label',copy.skip.replace(' ↗',''));
    });
    page.querySelectorAll('[data-choice-form]').forEach(form => {
      const mode = form.dataset.choiceForm;
      const target = new URL(destination(mode));
      form.action = target.pathname + target.hash;
    });
    page.querySelector('[data-entry-reveal-name]').textContent = copy[chosenMode || initialMode];
    sizeStage();
  }

  function storeChoice() {
    try { sessionStorage.setItem('cv-matrix-choice-v1','chosen'); } catch (_) { /* Storage is optional. */ }
  }

  function stopCode() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }

  function clearNavigationTimers() {
    window.clearTimeout(revealTimer);
    window.clearTimeout(navigationTimer);
    revealTimer = 0;
    navigationTimer = 0;
  }

  function navigate(mode) {
    if (navigating) return;
    navigating = true;
    clearNavigationTimers();
    stopCode();
    storeChoice();
    window.location.replace(destination(mode));
  }

  function choose(mode, {instant = false, point = null} = {}) {
    if (phase !== 'ready' || !['personal','team'].includes(mode)) return;
    phase = 'choosing';
    chosenMode = mode;
    stage.dataset.scenePhase = phase;
    stage.dataset.choice = mode;
    page.classList.add('is-selecting');
    page.setAttribute('aria-busy','true');
    reveal.dataset.scenario = mode;
    page.querySelector('[data-entry-reveal-name]').textContent = words[language][mode];
    status.textContent = words[language].opening + ' ' + words[language][mode];
    choices.forEach(button => {
      button.disabled = true;
      button.closest('[data-choice-form]').classList.toggle('is-selected', button.dataset.entryMode === mode);
    });
    page.querySelector('[data-entry-language]').disabled = true;
    if (instant || motion.matches || document.hidden) { navigate(mode); return; }
    const source = point || choices.find(button => button.dataset.entryMode === mode).querySelector('[data-choice-point]');
    const rect = source.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x,window.innerWidth-x),Math.max(y,window.innerHeight-y)) + 20;
    reveal.style.setProperty('--origin-x',x + 'px');
    reveal.style.setProperty('--origin-y',y + 'px');
    reveal.style.setProperty('--reveal-radius',radius + 'px');
    revealTimer = window.setTimeout(() => {
      phase = 'revealing';
      stage.dataset.scenePhase = phase;
      page.classList.add('is-revealing');
    }, 220);
    navigationTimer = window.setTimeout(() => navigate(mode), 1060);
  }

  function sizeStage() {
    const bounds = page.querySelector('.entry-stage-region').getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const labelReserve = Math.max(0,Number(stage.dataset.labelReserve) || 0);
    const stageWidth = Math.min(bounds.width,Math.max(0,bounds.height - labelReserve) * .75,570);
    stage.style.width = stageWidth + 'px';
    stage.style.height = stageWidth / .75 + 'px';
  }

  function sizeCode() {
    const ratio = Math.min(window.devicePixelRatio || 1,1.5);
    width = window.innerWidth;
    height = Math.max(window.innerHeight,page.clientHeight);
    contexts.forEach(({canvas,context}) => {
      if (!canvas || !context) return;
      canvas.width = Math.ceil(width * ratio);
      canvas.height = Math.ceil(height * ratio);
      context.setTransform(ratio,0,0,ratio,0,0);
      context.font = '11px ui-monospace, Consolas, monospace';
    });
    streams = Array.from({length:Math.ceil(width / 34)},(_,index) => ({x:index*34+9,y:-height+Math.random()*height*2,speed:1+Math.random()*1.6,seed:index%alphabet.length}));
  }

  function drawCode(timestamp) {
    frame = 0;
    if (motion.matches || document.hidden || navigating) return;
    if (timestamp - lastFrame >= 50) {
      lastFrame = timestamp;
      contexts.forEach(({context},contextIndex) => {
        if (!context || (contextIndex === 1 && phase !== 'revealing')) return;
        const styles = window.getComputedStyle(contextIndex === 1 ? reveal : page);
        const accent = styles.getPropertyValue('--entry-accent').trim();
        context.clearRect(0,0,width,height);
        context.fillStyle = accent;
        streams.forEach(stream => {
          for (let tail = 0;tail < 8;tail++) {
            context.globalAlpha = (1-tail/9) * (contextIndex === 1 ? .6 : .32);
            context.fillText(alphabet[(stream.seed+tail+Math.floor(stream.y/50)) % alphabet.length] || '1',stream.x,stream.y-tail*15);
          }
        });
        context.globalAlpha = 1;
      });
      streams.forEach(stream => { stream.y += stream.speed * (phase === 'revealing' ? 12 : 1.5); if (stream.y > height+160) stream.y = -10; });
    }
    frame = window.requestAnimationFrame(drawCode);
  }

  function startCode() {
    stopCode();
    if (motion.matches || document.hidden || !contexts.some(item => item.context)) return;
    frame = window.requestAnimationFrame(drawCode);
  }

  page.querySelectorAll('[data-choice-form]').forEach(form => {
    form.addEventListener('submit',event => {
      event.preventDefault();
      choose(form.dataset.choiceForm);
    });
  });
  choices.forEach(button => {
    button.addEventListener('pointerenter',event => { if (phase === 'ready' && event.pointerType !== 'touch') palette(button.dataset.entryMode); });
    button.addEventListener('pointerleave',() => { if (phase === 'ready' && document.activeElement !== button) palette(initialMode); });
    button.addEventListener('focus',() => { if (phase === 'ready') palette(button.dataset.entryMode); });
    button.addEventListener('blur',() => { if (phase === 'ready') palette(initialMode); });
  });
  page.querySelector('[data-entry-language]').addEventListener('click',() => {
    if (phase !== 'ready') return;
    language = language === 'ru' ? 'en' : 'ru';
    const url = new URL(window.location.href);
    url.searchParams.set('lang',language);
    window.history.replaceState(null,'',url.href);
    localize();
  });
  page.querySelectorAll('[data-entry-skip]').forEach(link => link.addEventListener('click',event => {
    event.preventDefault();
    if (phase === 'ready') choose('personal',{instant:true});
    else navigate(chosenMode);
  }));
  document.addEventListener('keydown',event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (phase === 'ready') choose('personal',{instant:true});
    else navigate(chosenMode);
  });
  document.addEventListener('visibilitychange',() => {
    if (document.hidden) {
      stopCode();
      if (chosenMode) navigate(chosenMode);
    } else startCode();
  });
  motion.addEventListener('change',() => {
    if (motion.matches && chosenMode) navigate(chosenMode);
    if (motion.matches) stopCode(); else startCode();
  });
  window.addEventListener('resize',() => {
    if (chosenMode) { navigate(chosenMode); return; }
    sizeStage();
    sizeCode();
  });
  window.addEventListener('pagehide',() => {
    clearNavigationTimers();
    stopCode();
  });
  window.addEventListener('pageshow',event => {
    if (!event.persisted) return;
    clearNavigationTimers();
    navigating = false;
    chosenMode = null;
    phase = 'ready';
    stage.dataset.scenePhase = phase;
    delete stage.dataset.choice;
    page.classList.remove('is-selecting','is-revealing');
    page.removeAttribute('aria-busy');
    choices.forEach(button => { button.disabled = false; button.closest('[data-choice-form]').classList.remove('is-selected'); });
    page.querySelector('[data-entry-language]').disabled = false;
    status.textContent = '';
    palette(initialMode);
    localize();
    startCode();
  });
  palette(initialMode);
  localize();
  sizeCode();
  startCode();
})();
