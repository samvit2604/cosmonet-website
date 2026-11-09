const hero = document.querySelector('.recruitment-hero');
const mount = hero?.querySelector('.recruitment-hero-viewport');

if (hero && mount) {
  const button = hero.querySelector('[data-recruitment-motion]');
  const label = button?.querySelector('[data-recruitment-motion-label]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let scene, paused = false, visible = true, failed = false, disposed = false;
  let frame = 0, elapsed = 0, last = 0;
  const shouldPlay = () => scene && !failed && !disposed && !paused && !reduced.matches && visible && !document.hidden;

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  }
  function fallback() {
    failed = true;
    stop();
    hero.classList.remove('recruitment-scene-ready');
    hero.classList.add('recruitment-scene-fallback');
    hero.dataset.recruitmentSceneState = 'fallback';
    hero.dataset.recruitmentSceneMotion = 'fallback';
    if (button) button.hidden = true;
  }
  function draw(now) {
    frame = 0;
    if (!shouldPlay()) return;
    if (last) elapsed += Math.min((now - last) / 1000, .1);
    last = now;
    try { scene.render(elapsed); } catch { fallback(); return; }
    frame = requestAnimationFrame(draw);
  }
  function synchronize() {
    if (failed || disposed || !scene) return;
    const playing = shouldPlay();
    hero.dataset.recruitmentSceneMotion = reduced.matches ? 'static' : playing ? 'playing' : 'paused';
    if (button) {
      button.hidden = reduced.matches;
      button.setAttribute('aria-pressed', String(paused));
      button.setAttribute('aria-label', paused ? 'Resume recruitment animation' : 'Pause recruitment animation');
    }
    if (label) label.textContent = paused ? 'Resume animation' : 'Pause animation';
    if (playing && !frame) frame = requestAnimationFrame(draw);
    else if (!playing) {
      stop();
      if (reduced.matches) {
        try { scene.render(0); } catch { fallback(); }
      }
    }
  }
  button?.addEventListener('click', () => { paused = !paused; synchronize(); });
  reduced.addEventListener('change', synchronize);
  document.addEventListener('visibilitychange', synchronize);
  window.addEventListener('pagehide', event => {
    stop();
    if (!event.persisted) {
      disposed = true;
      scene?.dispose?.();
    }
  });
  window.addEventListener('pageshow', synchronize);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    synchronize();
  }, { rootMargin: '80px' });
  visibilityObserver.observe(mount);

  Promise.all([document.fonts.ready, import('./scene.js?v=3')]).then(([, module]) => {
    if (disposed) return;
    try {
      scene = module.createRecruitmentScene(mount);
      scene.canvas.dataset.recruitmentCanvas = '';
      scene.canvas.setAttribute('aria-hidden', 'true');
      scene.canvas.setAttribute('tabindex', '-1');
      scene.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fallback(); });
      new ResizeObserver(() => {
        if (failed || disposed) return;
        try { scene.resize(); scene.render(reduced.matches ? 0 : elapsed); } catch { fallback(); }
      }).observe(mount);
      scene.resize();
      scene.render(0);
      hero.classList.add('recruitment-scene-ready');
      hero.dataset.recruitmentSceneState = 'ready';
      synchronize();
    } catch (error) {
      console.error('Recruitment scene unavailable', error);
      fallback();
    }
  }).catch(fallback);
}
