// Native playback preserves the reference camera, materials and network motion.
const hero = document.querySelector('.ai-hero');
const video = hero?.querySelector('[data-ai-video]');

if (hero && video) {
  const button = hero.querySelector('[data-ai-motion]');
  const label = button?.querySelector('[data-ai-motion-label]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let pausedByUser = false;
  let visible = true;
  let ready = false;
  let failed = false;
  let sourceLoaded = false;
  let playRequest = 0;

  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.defaultPlaybackRate = 1;
  video.playbackRate = 1;

  function showState(animate) {
    hero.classList.toggle('ai-scene-ready', ready && !failed && !reducedMotion.matches);
    hero.classList.toggle('ai-scene-fallback', failed);
    hero.dataset.aiSceneState = failed ? 'fallback' : ready ? 'ready' : 'poster';
    hero.dataset.aiSceneMotion = failed ? 'fallback' : reducedMotion.matches ? 'static' : animate && !video.paused ? 'playing' : 'paused';
    if (button) {
      button.hidden = failed || !ready || reducedMotion.matches;
      button.setAttribute('aria-pressed', String(pausedByUser));
      button.setAttribute('aria-label', pausedByUser ? 'Resume AI animation' : 'Pause AI animation');
      if (label) label.textContent = pausedByUser ? 'Resume animation' : 'Pause animation';
    }
  }

  function loadSource() {
    if (sourceLoaded || failed || reducedMotion.matches) return;
    sourceLoaded = true;
    video.preload = 'auto';
    video.querySelectorAll('source[data-src]').forEach(source => { source.src = source.dataset.src; });
    if (video.dataset.src) video.src = video.dataset.src;
    video.load();
  }

  function synchronize() {
    if (failed) return;
    if (!reducedMotion.matches && visible && !document.hidden) loadSource();
    const animate = ready && !pausedByUser && !reducedMotion.matches && visible && !document.hidden;
    showState(animate);
    if (!animate) {
      playRequest++;
      video.pause();
      return;
    }
    const request = ++playRequest;
    video.play()?.then(() => {
      if (request === playRequest) showState(true);
    }).catch(() => {
      if (request !== playRequest || !visible || document.hidden || reducedMotion.matches) return;
      pausedByUser = true;
      showState(false);
    });
  }

  function fallback() {
    failed = true;
    playRequest++;
    video.pause();
    showState(false);
  }

  function showFrame() {
    if (failed || video.readyState < 2) return;
    ready = true;
    synchronize();
  }

  video.addEventListener('loadeddata', showFrame);
  video.addEventListener('canplay', () => { if (!ready) showFrame(); });
  video.addEventListener('error', fallback);
  video.querySelectorAll('source').forEach(source => source.addEventListener('error', fallback));
  button?.addEventListener('click', () => { pausedByUser = !pausedByUser; synchronize(); });
  reducedMotion.addEventListener('change', synchronize);
  document.addEventListener('visibilitychange', synchronize);
  window.addEventListener('pagehide', () => { playRequest++; video.pause(); });
  window.addEventListener('pageshow', synchronize);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      synchronize();
    }, { rootMargin: '80px' }).observe(hero);
  }

  if (!video.canPlayType('video/mp4')) fallback();
  else {
    if (reducedMotion.matches) video.preload = 'none';
    if (video.readyState >= 2) showFrame();
    else synchronize();
  }
}
