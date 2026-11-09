import { createAnalyticsScene } from './scene.js?v=4';

// Render the dashboard at the display's pixel density; there is no video matte.
const hero = document.querySelector('.data-hero');
const mount = hero?.querySelector('.data-hero-viewport');
if (hero && mount) {
  const button = hero.querySelector('[data-data-motion]');
  const label = button?.querySelector('[data-data-motion-label]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let scene, paused = false, visible = true, failed = false;
  let frame = 0, elapsed = 0, last = 0;
  const shouldPlay = () => scene && !failed && !paused && !reduced.matches && visible && !document.hidden;

  function stop() { cancelAnimationFrame(frame); frame = 0; last = 0; }
  function draw(now) {
    frame = 0;
    if (!shouldPlay()) return;
    if (last) elapsed += Math.min((now - last) / 1000, .1);
    last = now;
    scene.render(elapsed);
    frame = requestAnimationFrame(draw);
  }
  function synchronize() {
    if (failed || !scene) return;
    const playing = shouldPlay();
    hero.dataset.dataSceneMotion = reduced.matches ? 'static' : playing ? 'playing' : 'paused';
    button.hidden = reduced.matches;
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', paused ? 'Resume analytics animation' : 'Pause analytics animation');
    label.textContent = paused ? 'Resume animation' : 'Pause animation';
    if (playing && !frame) frame = requestAnimationFrame(draw);
    else if (!playing) { stop(); if (reduced.matches) scene.render(0); }
  }
  function fallback() {
    failed = true; stop();
    hero.classList.remove('data-scene-ready');
    hero.classList.add('data-scene-fallback');
    hero.dataset.dataSceneState = 'fallback';
    hero.dataset.dataSceneMotion = 'fallback';
    button.hidden = true;
  }
  button?.addEventListener('click', () => { paused = !paused; synchronize(); });
  reduced.addEventListener('change', synchronize);
  document.addEventListener('visibilitychange', synchronize);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', synchronize);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; synchronize(); }, { rootMargin: '80px' }).observe(mount);

  document.fonts.ready.then(() => {
    try {
      scene = createAnalyticsScene(mount);
      scene.canvas.setAttribute('aria-hidden', 'true');
      scene.canvas.setAttribute('tabindex', '-1');
      scene.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fallback(); });
      new ResizeObserver(() => { if (!failed) { scene.resize(); scene.render(reduced.matches ? 0 : elapsed); } }).observe(mount);
      scene.resize(); scene.render(0);
      hero.classList.add('data-scene-ready');
      hero.dataset.dataSceneState = 'ready';
      synchronize();
    } catch (error) { console.error('Analytics scene unavailable', error); fallback(); }
  }).catch(fallback);
}
