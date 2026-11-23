import { observeInView } from './in-view.js';
import { timeToken } from './css-time.js';
import { motionPreference } from './motion-preference.js';
// Shared lifecycle for timed carousels. Geometry and selection remain with the
// consuming component; no timer can outrun reader intent or motion preference.
export const carouselLoops = count => count > 3;
export function carouselCompactWidth(root) {
  const value=getComputedStyle(root).getPropertyValue('--layout-quote-compact-width').trim();
  return parseFloat(value)*(value.endsWith('rem')?parseFloat(getComputedStyle(document.documentElement).fontSize):1);
}

export const wrapDistance = (value, length) => (((value + length / 2) % length + length) % length) - length / 2;

// A ring may repeat a visual slot, never an identity or an interactive target.
export function createDecorativeClone(card) {
  const clone = card.cloneNode(true);
  for (const node of [clone, ...clone.querySelectorAll('*')]) {
    for (const name of ['id', 'for', 'headers', 'list', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-details', 'aria-errormessage', 'autofocus']) node.removeAttribute(name);
    if (node.getAttribute('href')?.startsWith('#')) node.removeAttribute('href');
    if (node.matches('a,button,input,select,textarea,[tabindex],[contenteditable]')) node.setAttribute('tabindex', '-1');
  }
  clone.inert = true;
  clone.setAttribute('aria-hidden', 'true');
  return clone;
}

export function mountCarouselPlayback({ root, position, playback, advance, isBusy = () => false, enabled = false, initiallyPaused = false }) {
  const delay = timeToken(getComputedStyle(root), '--delay-quote-autoplay');
  const available = Boolean(enabled && playback && Number.isFinite(delay) && delay > 0);
  const original = playback ? { text: playback.textContent, hidden: playback.hidden } : null;
  const originalLive = position.getAttribute('aria-live');
  const preference = motionPreference(document);
  const cleanups = [];
  let timer, hovered = false, focused = false, paused = false, printing = false, disposed = false;
  let inView = typeof IntersectionObserver !== 'function', stopInView;
  const reduced = preference.reduced;
  function listen(target, type, callback) {
    target.addEventListener(type, callback);
    cleanups.push(() => target.removeEventListener(type, callback));
  }
  function schedule() {
    clearTimeout(timer);
    if (disposed) return;
    const running = available && !paused && !hovered && !focused && !printing && !isBusy() && !document.hidden && inView && !reduced();
    // Reduced motion never plays, so it offers no playback control, as the process path does.
    if (available) playback.hidden = reduced();
    position.setAttribute('aria-live', running ? 'off' : 'polite');
    if (running) timer = setTimeout(() => { advance(); schedule(); }, delay);
  }
  if (available) {
    // The label names the next action, as the ambient playback toggle does, so
    // it carries no pressed state: a pressed 'Play' would contradict it.
    const setPaused = value => {
      paused = value;
      playback.textContent = paused ? playback.dataset.resumeLabel : playback.dataset.pauseLabel;
      schedule();
    };
    if (initiallyPaused) setPaused(true);
    listen(playback, 'click', () => setPaused(!paused));
    listen(root, 'pointerenter', () => { hovered = true; schedule(); });
    listen(root, 'pointerleave', () => { hovered = false; schedule(); });
    listen(root, 'focusin', () => { focused = true; schedule(); });
    listen(root, 'focusout', event => { focused = root.contains(event.relatedTarget); schedule(); });
    cleanups.push(preference.onMotionChange(schedule));
    listen(document, 'visibilitychange', schedule);
    listen(window, 'beforeprint', () => { printing = true; schedule(); });
    listen(window, 'afterprint', () => { printing = false; schedule(); });
    if (typeof IntersectionObserver === 'function') {
      stopInView = observeInView(root, value => { inView = value; schedule(); }, { window });
    }
  } else if (playback) playback.hidden = true;
  schedule();
  return {
    get paused() { return paused; },
    schedule,
    dispose() {
      if (disposed) return;
      disposed = true; clearTimeout(timer); stopInView?.(); cleanups.forEach(cleanup => cleanup());
      if (originalLive === null) position.removeAttribute('aria-live'); else position.setAttribute('aria-live', originalLive);
      if (playback) {
        playback.textContent = original.text; playback.hidden = original.hidden;
      }
    },
  };
}
