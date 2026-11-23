import { clamp } from './clamp.js';
import { motionPreference } from './motion-preference.js';
// Scroll/focus/preference physics for an authored sequence. The caller owns its
// cameras, drawing, stills and composition. No timer or wheel interception.
export function createSequence({ wrapper, sections, rests, holds, distance, draw, size, activity = () => {} }) {
  const preference = motionPreference(document);
  let ready = false, failed = false, enabled = false, pending = false, current = 0;
  let chrome = 0;
  let active = false;
  let printPosition = null;
  const header = document.querySelector('.frame__header');
  const progress = () => clamp((chrome - wrapper.getBoundingClientRect().top) / distance);
  const sectionFor = target => sections.findIndex(section => section === target || section.contains(target));
  const allowed = () => {
    return !printPosition && !failed && !preference.reduced();
  };
  function updateActivity() {
    const bounds = wrapper.getBoundingClientRect();
    const next = allowed() && !document.hidden && bounds.top < innerHeight && bounds.bottom > chrome;
    if (next !== active) { active = next; activity(active); }
  }
  function currentSection() {
    return sections[current < 0 ? rests.reduce((a, rest, i) => rest <= progress() ? i : a, 0) : current];
  }
  function visibleSection() {
    const visible = sections.map(section => {
      const bounds = section.getBoundingClientRect();
      return Math.max(0, Math.min(bounds.bottom, innerHeight) - Math.max(bounds.top, chrome));
    });
    return sections[visible.reduce((best, height, index) => height > visible[best] ? index : best, 0)];
  }
  function render(value = progress()) {
    if (!enabled || document.hidden) return;
    const bounds = wrapper.getBoundingClientRect();
    if (bounds.bottom < chrome || bounds.top > innerHeight) return;
    let index = holds.findIndex(([start, end]) => value >= start && value <= end);
    const focused = sectionFor(document.activeElement);
    if (focused >= 0 && document.activeElement !== sections[focused]) index = focused;
    // An asynchronous renderer can withhold a hold until its matching view is
    // painted. Do not place new words over the preceding view during decoding.
    try { if (draw(value) === false) index = -1; } catch (_) { current = index; unavailable(); return; }
    sections.forEach((section, i) => section.classList.toggle('is-current', i === index));
    current = index;
  }
  function schedule() {
    // Acquisition can start before readiness, but follows the same motion and
    // visibility policy as drawing. Hidden/reduced/offscreen work suspends.
    updateActivity();
    if (pending || !enabled || document.hidden) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; render(); });
  }
  function resize(preserveHold = false) {
    const bounds = wrapper.getBoundingClientRect();
    const held = preserveHold && enabled && current >= 0 && progress() < 1 && bounds.top <= chrome && bounds.bottom > chrome ? sections[current] : null;
    chrome = header && ['fixed', 'sticky'].includes(getComputedStyle(header).position) ? header.getBoundingClientRect().height : 0;
    wrapper.style.setProperty('--passage-chrome', `${chrome}px`);
    wrapper.style.setProperty('--passage-distance', `${distance}px`);
    size();
    // A responsive header or font layout can move the sequence's document origin.
    // Keep an occupied reading hold at its authored rest rather than losing its copy.
    if (held) visit(held, false);
    schedule();
  }
  function visit(target, focus = true) {
    const index = sectionFor(target);
    if (index < 0) return;
    const focused = sectionFor(document.activeElement);
    if (focused >= 0 && focused !== index) document.activeElement.blur();
    if (enabled) {
      window.scrollTo({ top: scrollY + wrapper.getBoundingClientRect().top - chrome + rests[index] * distance, behavior: 'instant' });
      render(rests[index]);
    } else window.scrollTo({ top: scrollY + target.getBoundingClientRect().top - chrome, behavior: 'instant' });
    if (focus) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
  }
  function state(preservePosition = true) {
    updateActivity();
    const next = ready && allowed();
    if (next === enabled) return;
    const target = enabled ? currentSection() : visibleSection();
    const bounds = wrapper.getBoundingClientRect();
    const inView = bounds.top < innerHeight && bounds.bottom > chrome;
    enabled = next;
    wrapper.dataset.islandState = enabled ? 'drawn' : 'still';
    resize();
    // Do not consume the preceding header when enhancement becomes ready.
    if (inView && bounds.top <= chrome && preservePosition) visit(target, false);
  }
  function unavailable() { failed = true; state(); }
  function hashTarget() {
    try { return document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (_) { return null; }
  }
  wrapper.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!enabled || !link || event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const destination = new URL(link.href);
    if (destination.origin !== location.origin || destination.pathname !== location.pathname || !destination.hash) return;
    let target;
    try { target = document.getElementById(decodeURIComponent(destination.hash.slice(1))); } catch (_) { return; }
    if (!target || sectionFor(target) < 0) return;
    event.preventDefault();
    history.pushState(null, '', destination.hash);
    visit(target);
  });
  wrapper.addEventListener('focusin', event => {
    const index = sectionFor(event.target);
    if (enabled && index >= 0 && current !== index) visit(sections[index], false);
  });
  addEventListener('popstate', () => {
    // The browser restores its historical scroll position after popstate.
    // Reconcile an authored hold after that restoration, without taking over
    // history restoration for destinations outside this sequence.
    requestAnimationFrame(() => {
      const target = hashTarget();
      if (target && sectionFor(target) >= 0) visit(target);
    });
  });
  // Native fragment restoration can run after image readiness on a fresh load.
  // Reconcile that fragment once the first displayed layout has settled.
  addEventListener('pageshow', event => {
    if (event.persisted) return;
    requestAnimationFrame(() => {
      const target = hashTarget();
      // A historical enhanced position can lie beyond the shorter fallback.
      // Reconcile its own fragment before readiness too, so a visible target
      // can acquire its first frame without activating unrelated offscreen work.
      if (target && sectionFor(target) >= 0) { visit(target, false); schedule(); }
    });
  });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', () => resize(true), { passive: true });
  // Printing uses the complete document, never a frozen canvas or one clipped
  // reading hold. Preserve screen position, not the print layout's visible beat.
  addEventListener('beforeprint', () => {
    if (printPosition) return;
    printPosition = { top: scrollY, left: window.scrollX };
    state(false);
  });
  addEventListener('afterprint', () => {
    if (!printPosition) return;
    const position = printPosition;
    printPosition = null;
    state(false);
    window.scrollTo({ ...position, behavior: 'instant' });
    schedule();
  });
  document.addEventListener('visibilitychange', schedule);
  preference.onMotionChange(state);
  if (header && window.ResizeObserver) new ResizeObserver(() => resize(true)).observe(header);
  return {
    ready() { ready = true; resize(); state(); const target = hashTarget(); if (target && sectionFor(target) >= 0) visit(target, false); },
    unavailable, schedule,
  };
}
