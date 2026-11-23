import { observeInView } from './in-view.js';
import { motionPreference } from './motion-preference.js';
// The authored text carries the meaning; media and optional treatments share one playback lifecycle.
export function mountAmbientVideo({ element, source, poster, toggle, enhance }) {
  const src = typeof source === 'string' ? source : source?.href;
  if (!src || !poster) return;
  let url;
  try { url = new URL(src, document.baseURI); } catch { return; }
  if (!['https:', 'http:'].includes(url.protocol)) return;
  return mountAmbient({ element, url, toggle, enhance });
}

// A still HTML surface can host a reveal without loading a foreground film.
export function mountAmbientSurface({ element, enhance }) {
  return mountAmbient({ element, enhance });
}

function mountAmbient({ element, url, toggle, enhance }) {
  const wrapper = element.closest('[data-gazette-component]');
  if (!wrapper || !window.IntersectionObserver) return;
  if (url) toggle ??= wrapper.querySelector('[data-ambient-toggle]');
  const pauseLabel = toggle?.querySelector('[data-ambient-pause]');
  const playLabel = toggle?.querySelector('[data-ambient-play]');
  const original = new Map(['data-ambient-state', 'data-ambient-ready', 'data-ambient-visible', 'data-ambient-position'].map(name => [name, wrapper.getAttribute(name)]));
  const toggleHidden = toggle?.hidden, pauseHidden = pauseLabel?.hidden, playHidden = playLabel?.hidden;
  const video = url ? document.createElement('video') : null;
  if (video) {
    video.className = 'ambient-video';
    video.setAttribute('aria-hidden', 'true');
    video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true;
    video.preload = 'none'; video.tabIndex = -1;
    element.append(video);
  }
  const lifecycle = new AbortController();
  // Optional media treatments share this controller's eligibility and teardown.
  // A failed enhancement leaves the existing HTML surface or film usable.
  let enhancement;
  try { enhancement = enhance?.({ element, wrapper, signal: lifecycle.signal }); } catch { /* retain the film */ }
  function releaseEnhancement() {
    try { enhancement?.destroy(); } catch { /* retain the film */ }
    enhancement = null;
  }
  const preference = motionPreference(document);
  let visible = false, printing = false, away = false, disposed = false, failed = false;
  let userPaused = false, blocked = false, ready = !video, loaded = false, playing = false;
  let intent = 0, attempt = null, resumeTime = 0, positionFrame = null;
  function updatePosition() {
    positionFrame = null;
    if (disposed) return;
    if (printing) {
      const value = original.get('data-ambient-position');
      value === null ? wrapper.removeAttribute('data-ambient-position') : wrapper.setAttribute('data-ambient-position', value);
      return;
    }
    const bounds = wrapper.getBoundingClientRect();
    const position = bounds.bottom <= 0 ? 'after' : bounds.top >= innerHeight ? 'before' :
      bounds.top > 0 ? 'entering' : bounds.top < 0 ? 'leaving' : 'within';
    if (wrapper.getAttribute('data-ambient-position') !== position) wrapper.setAttribute('data-ambient-position', position);
  }
  function schedulePosition() {
    if (!disposed && positionFrame === null) positionFrame = requestAnimationFrame(updatePosition);
  }
  const motion = () => !preference.reduced();
  const eligible = () => !disposed && !failed && !printing && !away && !document.hidden && visible && motion();
  function present() {
    wrapper.setAttribute('data-ambient-visible', String(visible));
    const still = printing || !motion() || failed || !ready;
    wrapper.setAttribute('data-ambient-ready', String(!still));
    wrapper.setAttribute('data-ambient-state', failed ? 'error' : still && !blocked ? 'still' : !video ? 'ready' : playing ? 'playing' : 'paused');
    if (toggle) toggle.hidden = !motion() || printing || failed || (!ready && !blocked);
    if (pauseLabel) pauseLabel.hidden = !playing;
    if (playLabel) playLabel.hidden = playing;
    try {
      enhancement?.update({
        active: eligible() && !userPaused && !blocked && ready && (!video || playing),
        animate: visible && motion() && !printing && !away && !document.hidden,
        motion: motion() && !printing,
        unload: printing || !motion() || failed || away,
      });
    } catch { releaseEnhancement(); }
  }
  function stop(unload = false) {
    intent++; attempt = null; playing = false; video?.pause();
    if (unload && loaded) {
      if (Number.isFinite(video.currentTime)) resumeTime = video.currentTime;
      loaded = false; ready = false;
      video.removeAttribute('src'); video.load();
    }
  }
  function reconcile() {
    if (disposed) return;
    schedulePosition();
    if (!eligible() || userPaused || blocked) {
      stop(printing || !motion() || failed || away);
      present(); return;
    }
    if (!video) { present(); return; }
    if (!loaded) {
      loaded = true; video.src = url.href;
      // muted is set before any media source or playback request, including an audio-bearing clip.
      video.load();
    }
    if (!playing && attempt === null) {
      const current = ++intent;
      attempt = current;
      try {
        Promise.resolve(video.play()).then(() => {
          if (disposed || current !== intent) return;
          attempt = null;
          if (!eligible() || userPaused) { stop(); present(); }
        }, () => {
          if (disposed || current !== intent) return;
          attempt = null; blocked = true; stop(); present();
        });
      } catch {
        attempt = null; blocked = true; stop();
      }
    }
    present();
  }
  video?.addEventListener('loadedmetadata', () => {
    if (loaded && resumeTime > 0 && Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.min(resumeTime, video.duration); resumeTime = 0;
    }
  }, { signal: lifecycle.signal });
  video?.addEventListener('playing', () => {
    if (!eligible() || userPaused || blocked) { stop(); present(); return; }
    ready = true; playing = true; present();
  }, { signal: lifecycle.signal });
  video?.addEventListener('error', () => {
    if (!loaded || disposed) return;
    failed = true; stop(true); present();
  }, { signal: lifecycle.signal });
  toggle?.addEventListener('click', () => {
    if (!motion() || failed || printing) return;
    userPaused = playing; blocked = false; reconcile();
  }, { signal: lifecycle.signal });
  const stopInView = observeInView(wrapper, value => {
    visible = value; reconcile();
  }, { window, firstEntry: true });
  document.addEventListener('visibilitychange', reconcile, { signal: lifecycle.signal });
  preference.onMotionChange(reconcile, { signal: lifecycle.signal });
  window.addEventListener('scroll', schedulePosition, { passive: true, signal: lifecycle.signal });
  window.addEventListener('resize', schedulePosition, { passive: true, signal: lifecycle.signal });
  window.addEventListener('beforeprint', () => { printing = true; cancelAnimationFrame(positionFrame); updatePosition(); reconcile(); }, { signal: lifecycle.signal });
  window.addEventListener('afterprint', () => { printing = false; reconcile(); }, { signal: lifecycle.signal });
  window.addEventListener('pagehide', () => { away = true; reconcile(); }, { signal: lifecycle.signal });
  window.addEventListener('pageshow', () => { away = false; reconcile(); }, { signal: lifecycle.signal });
  updatePosition(); present();
  return () => {
    disposed = true; cancelAnimationFrame(positionFrame); positionFrame = null; stop(true); lifecycle.abort(); releaseEnhancement(); stopInView(); video?.remove();
    for (const [name, value] of original) value === null ? wrapper.removeAttribute(name) : wrapper.setAttribute(name, value);
    if (toggle) toggle.hidden = toggleHidden;
    if (pauseLabel) pauseLabel.hidden = pauseHidden;
    if (playLabel) playLabel.hidden = playHidden;
  };
}
