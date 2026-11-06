import { createCodeToken } from '/software-code-token.js?v=6';

// Play the supplied reference animation, with its token face edited to code.
// The recorded geometry, camera, materials and lighting remain intact.
const hero = document.querySelector('.software-hero');
const mount = hero?.querySelector('[data-software-scene]');
const video = mount?.querySelector('[data-software-video]');

if (hero && mount && video) {
  const button = hero.querySelector('[data-software-motion]');
  const label = button?.querySelector('[data-software-motion-label]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  let visible = true;
  let ready = false;
  let failed = false;
  let playRequest = 0;
  let tracking = null;
  let drawing = 0;
  let lastMediaTime = 0;
  let tokenRenderer;
  try { tokenRenderer = createCodeToken(mount, video); tokenRenderer.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fallback(); }); } catch { fallback(); }
  function drawStamp(time = lastMediaTime) {
    if (!failed) tokenRenderer?.draw(time, tracking);
  }

  function stopDrawing() {
    if (!drawing) return;
    if ('cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(drawing);
    else cancelAnimationFrame(drawing);
    drawing = 0;
  }
  function startDrawing() {
    if (drawing || failed || video.paused || paused || reducedMotion.matches || !visible || document.hidden) return;
    if ('requestVideoFrameCallback' in video) {
      drawing = video.requestVideoFrameCallback((_, frame) => {
        drawing = 0; if (video.paused || video.seeking) return; lastMediaTime = frame.mediaTime; drawStamp(frame.mediaTime);
        if (!video.paused && !failed) startDrawing();
      });
    } else {
      drawing = requestAnimationFrame(() => {
        drawing = 0; drawStamp();
        if (!video.paused && !failed) startDrawing();
      });
    }
  }
  fetch('/assets/software-token-track.json?v=3').then(response => {
    if (!response.ok) throw Error('Token tracking unavailable');
    return response.json();
  }).then(data => { tracking = data; showFrame(); }).catch(fallback);
  video.addEventListener('playing', startDrawing);
  video.addEventListener('seeked', () => { lastMediaTime = video.currentTime; drawStamp(); });
  new ResizeObserver(() => drawStamp()).observe(mount);

  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.defaultPlaybackRate = 0.7;
  video.playbackRate = 0.7;

  function fallback() {
    failed = true;
    stopDrawing();
    video.pause();
    hero.classList.remove('software-scene-ready');
    hero.classList.add('software-scene-fallback');
    hero.dataset.softwareSceneState = 'fallback';
    hero.dataset.softwareSceneMotion = 'fallback';
    if (button) button.hidden = true;
  }

  function synchronize() {
    if (failed) return;
    const animate = ready && !paused && !reducedMotion.matches && visible && !document.hidden;
    if (button) {
      button.hidden = !ready || reducedMotion.matches;
      button.setAttribute('aria-pressed', String(paused));
      button.setAttribute('aria-label', paused ? 'Resume software animation' : 'Pause software animation');
      if (label) label.textContent = paused ? 'Resume animation' : 'Pause animation';
    }
    hero.dataset.softwareSceneMotion = reducedMotion.matches ? 'static' : animate ? 'playing' : 'paused';
    if (animate) {
      startDrawing();
      const request = ++playRequest;
      video.play()?.catch(() => {
        if (request !== playRequest || !visible || document.hidden || reducedMotion.matches) return;
        paused = true;
        synchronize();
      });
    } else {
      playRequest++;
      stopDrawing();
      video.pause();
      drawStamp();
    }
  }

  function showFrame() {
    if (failed || !tracking || video.readyState < 2) return;
    ready = true;
    drawStamp();
    hero.classList.remove('software-scene-fallback');
    hero.classList.add('software-scene-ready');
    hero.dataset.softwareSceneState = 'ready';
    synchronize();
  }

  video.addEventListener('loadeddata', showFrame);
  video.addEventListener('canplay', () => { if (!ready) showFrame(); });
  video.addEventListener('error', fallback);
  video.querySelector('source')?.addEventListener('error', fallback);
  button?.addEventListener('click', () => { paused = !paused; synchronize(); });
  reducedMotion.addEventListener('change', synchronize);
  document.addEventListener('visibilitychange', synchronize);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    synchronize();
  }, { rootMargin: '70px' }).observe(mount);

  if (!video.canPlayType('video/mp4')) fallback();
  else if (video.readyState >= 2) showFrame();
  else video.load();
}
