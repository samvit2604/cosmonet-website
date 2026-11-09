import { createAutomationScene } from './scene.js?v=5';

const hero = document.querySelector('.automation-hero');
const mount = hero?.querySelector('.automation-hero-viewport');

if (hero && mount) {
  const button = hero.querySelector('[data-automation-motion]');
  const label = button.querySelector('[data-automation-motion-label]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let scene, paused = false, visible = true, failed = false;
  let frame = 0, elapsed = 0, last = 0;
  const shouldPlay = () => scene && !failed && !paused && !reduced.matches && visible && !document.hidden;

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  }

  function fallback() {
    failed = true;
    stop();
    hero.classList.remove('automation-scene-ready');
    hero.classList.add('automation-scene-fallback');
    hero.dataset.automationSceneState = 'fallback';
    hero.dataset.automationSceneMotion = 'fallback';
    button.hidden = true;
  }

  function draw(now) {
    frame = 0;
    if (!shouldPlay()) return;
    if (last) elapsed += Math.min((now - last) / 1000, .1);
    last = now;
    try { scene.render(elapsed); }
    catch { fallback(); return; }
    frame = requestAnimationFrame(draw);
  }

  function synchronize() {
    if (failed || !scene) return;
    const playing = shouldPlay();
    hero.dataset.automationSceneMotion = reduced.matches ? 'static' : playing ? 'playing' : 'paused';
    button.hidden = reduced.matches;
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', paused ? 'Resume automation animation' : 'Pause automation animation');
    label.textContent = paused ? 'Resume animation' : 'Pause animation';
    if (playing && !frame) frame = requestAnimationFrame(draw);
    else if (!playing) {
      stop();
      if (reduced.matches) scene.render(0);
    }
  }

  button.addEventListener('click', () => { paused = !paused; synchronize(); });
  reduced.addEventListener('change', synchronize);
  document.addEventListener('visibilitychange', synchronize);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', synchronize);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    synchronize();
  }, { rootMargin: '80px' });
  intersection.observe(mount);

  try {
    scene = createAutomationScene(mount);
    scene.canvas.setAttribute('aria-hidden', 'true');
    scene.canvas.setAttribute('tabindex', '-1');
    scene.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fallback(); });
    const resize = new ResizeObserver(() => {
      if (!failed) {
        scene.resize();
        scene.render(reduced.matches ? 0 : elapsed);
      }
    });
    resize.observe(mount);
    scene.resize();
    scene.render(0);
    hero.classList.add('automation-scene-ready');
    hero.dataset.automationSceneState = 'ready';
    synchronize();
    window.addEventListener('pagehide', event => {
      if (!event.persisted) {
        resize.disconnect();
        intersection.disconnect();
        scene.dispose?.();
      }
    });
  } catch (error) {
    console.error('Automation scene unavailable', error);
    fallback();
  }
}
