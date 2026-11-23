import { setCarouselArrows } from './carousel-controls.js';
import { motionPreference } from './motion-preference.js';
// Keep the original result list. Browser scroll position adds a
// depth presentation; it never clones a result or changes its destination.
export const depthPose = (distance, { yaw, maxYaw, retreat, falloff }) => ({
  turn: -Math.sign(distance) * Math.min(maxYaw, Math.abs(distance) * yaw),
  depth: -Math.abs(distance) * retreat,
  scale: 1 / (1 + Math.abs(distance) * falloff),
});

export function mountDepthCarousel({ root, list, cards, controls, keyboardTarget = root,
  onSelect = () => {}, enhancedClass = 'depth-carousel--ready', activeAttribute = 'data-depth-active',
  previousSelector = '[data-depth-previous]', nextSelector = '[data-depth-next]' }) {
  if (!cards.length || typeof ResizeObserver !== 'function') return null;
  const previous = controls?.querySelector(previousSelector);
  const next = controls?.querySelector(nextSelector);
  const position = controls?.querySelector('output');
  if (!previous || !next || !position) return null;
  const entries = [...list.children];
  const lifecycle = new AbortController();
  const listen = (node, type, handler, options = {}) => node.addEventListener(type, handler, { ...options, signal: lifecycle.signal });
  const preference = motionPreference(document);
  const reduced = preference.reduced;
  const style = getComputedStyle(root);
  const parameters = {
    yaw: parseFloat(style.getPropertyValue('--layout-search-depth-yaw')),
    maxYaw: parseFloat(style.getPropertyValue('--layout-search-depth-yaw-max')),
    retreat: parseFloat(style.getPropertyValue('--layout-search-depth-retreat')),
    falloff: parseFloat(style.getPropertyValue('--layout-search-depth-scale-falloff')),
  };
  if (Object.values(parameters).some(value => !Number.isFinite(value))) return null;
  const focused = cards.findIndex(card => card.contains(document.activeElement));
  let selected = Math.max(0, focused), target = null, retries = 0, frame = 0, dragging = null, suppressClick = false, fieldGeometry = '';
  root.classList.add(enhancedClass);
  controls.hidden = cards.length < 2;
  function center(index) {
    const entry = entries[index];
    return entry.offsetLeft + entry.offsetWidth / 2 - list.clientWidth / 2;
  }
  function updateControls() {
    // Buttons step from the requested destination while the cards catch up.
    const controlIndex = target ?? selected;
    setCarouselArrows(previous, next, controlIndex === 0, controlIndex === cards.length - 1);
  }
  function clearTarget() {
    target = null;
    updateControls();
  }
  function mark(index) {
    selected = Math.max(0, Math.min(cards.length - 1, index));
    cards.forEach((card, at) => {
      card.toggleAttribute(activeAttribute, at === selected);
    });
    updateControls();
    position.textContent = `${selected + 1} / ${cards.length}`;
  }
  function paint() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    let nearest = selected, gap = Infinity;
    entries.forEach((entry, index) => {
      const delta = center(index) - list.scrollLeft;
      const distance = delta / Math.max(1, entry.offsetWidth);
      const pose = depthPose(distance, parameters);
      cards[index].style.setProperty('--depth-distance', String(Math.abs(distance)));
      cards[index].style.transform = reduced() ? '' :
        `translateZ(${pose.depth * entry.offsetWidth}px) rotateY(${pose.turn}deg) scale(${pose.scale})`;
      entry.style.zIndex = String(cards.length - Math.min(cards.length - 1, Math.round(Math.abs(distance))));
      if (Math.abs(delta) < gap) { gap = Math.abs(delta); nearest = index; }
    });
    mark(nearest);
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
  // Only the carousel stage leaves the reading grid. Measure the visible page
  // width (excluding its scrollbar), so nested search and listing shells share
  // the same edge without widening the document or moving their controls.
  function measure() {
    const bounds = root.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const geometry = `${width}:${bounds.left}:${bounds.width}`;
    if (geometry === fieldGeometry) { schedule(); return; }
    fieldGeometry = geometry;
    list.style.setProperty('--depth-field-width', `${width}px`);
    list.style.setProperty('--depth-field-offset', `${-bounds.left}px`);
    select(selected, { instant: true });
  }
  function select(index, { scroll = true, instant = false } = {}) {
    // Context-only updates acknowledge selection without replacing pending travel.
    if (scroll) {
      const destination = Math.max(0, Math.min(cards.length - 1, index));
      if (destination !== target) retries = 0;
      target = destination;
    }
    mark(index);
    if (scroll) {
      list.scrollTo({ left: center(selected), behavior: instant || reduced() ? 'instant' : 'smooth' });
      // Travel that has already arrived leaves nothing pending for a later scroll to honour.
      if (Math.abs(list.scrollLeft - center(selected)) <= 1) clearTarget();
    }
    schedule();
  }
  function activate(index) { select(index); onSelect(selected); }
  listen(previous, 'click', () => activate((target ?? selected) - 1));
  listen(next, 'click', () => activate((target ?? selected) + 1));
  listen(list, 'scroll', schedule, { passive: true });
  listen(list, 'scrollend', () => {
    // A pending destination outlives an unrelated scroll's end, such as the
    // browser bringing a newly focused card into view, which can also cut the
    // renewed travel short. Renew it a bounded number of times (an edge may
    // prevent exact centring), then settle on it rather than the nearest card.
    if (target !== null) {
      const destination = target;
      if (retries < 2 && Math.abs(list.scrollLeft - center(destination)) > 1) {
        retries++; select(destination); return;
      }
      paint(); mark(destination); clearTarget(); onSelect(destination);
      return;
    }
    paint(); onSelect(selected);
  });
  listen(list, 'wheel', clearTarget, { passive: true });
  listen(list, 'touchstart', clearTarget, { passive: true });
  listen(list, 'focusin', event => {
    const index = cards.findIndex(card => card.contains(event.target));
    // A pointer press must not move its link between down and up. Keyboard
    // focus can bring its card into view without stealing the click target,
    // and selects that card at once so its context is ready before travel ends.
    if (index >= 0 && event.target.matches?.(':focus-visible')) activate(index);
  });
  listen(list, 'click', event => {
    if (suppressClick && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); suppressClick = false; return; }
    if (event.target.closest('a,button,summary,input,select,textarea')) return;
    const index = cards.findIndex(card => card.contains(event.target));
    if (index >= 0) activate(index);
  }, { capture: true });
  // A consumer may name several key targets, such as its list and its controls.
  for (const node of [keyboardTarget].flat()) listen(node, 'keydown', event => {
    if (event.target.closest('input,select,textarea') || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    activate(event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : (target ?? selected) + (event.key === 'ArrowRight' ? 1 : -1));
  });
  // Native touch/trackpad scrolling keeps momentum and vertical page scrolling.
  // Mouse drag starts only on unused card space, preserving links and text selection.
  listen(list, 'pointerdown', event => {
    suppressClick = false;
    if (event.pointerType !== 'mouse' || event.button || event.target.closest('a,button,summary,p,h2,dt,dd,input,select,textarea')) return;
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, left: list.scrollLeft, moved: false };
  });
  listen(list, 'pointermove', event => {
    if (!dragging || dragging.id !== event.pointerId) return;
    const dx = event.clientX - dragging.x, dy = event.clientY - dragging.y;
    if (!dragging.moved) {
      const threshold = parseFloat(style.getPropertyValue('--space-2'));
      if (Math.abs(dx) <= threshold || Math.abs(dx) <= Math.abs(dy)) return;
      dragging.moved = true;
      clearTarget();
      list.setPointerCapture(event.pointerId);
      list.classList.add('is-dragging');
    }
    list.scrollLeft = dragging.left - dx;
  });
  const finish = event => {
    if (!dragging || dragging.id !== event.pointerId) return;
    suppressClick = dragging.moved;
    dragging = null; list.classList.remove('is-dragging');
    if (list.hasPointerCapture(event.pointerId)) list.releasePointerCapture(event.pointerId);
    // Re-enable snapping only after release, then settle at the nearest real result.
    paint(); select(selected);
  };
  listen(list, 'pointerup', finish);
  listen(list, 'pointercancel', finish);
  preference.onMotionChange(schedule, { signal: lifecycle.signal });
  const resize = new ResizeObserver(measure); resize.observe(root);
  listen(window, 'resize', measure);
  listen(window, 'beforeprint', () => {
    root.classList.remove(enhancedClass);
    cards.forEach(card => { card.style.transform = ''; });
  });
  listen(window, 'afterprint', () => { root.classList.add(enhancedClass); schedule(); });
  mark(selected); measure();
  return { select, destroy() {
    lifecycle.abort(); resize.disconnect(); cancelAnimationFrame(frame);
    if (dragging && list.hasPointerCapture(dragging.id)) list.releasePointerCapture(dragging.id);
    list.classList.remove('is-dragging');
    root.classList.remove(enhancedClass); controls.hidden = true;
    cards.forEach(card => { card.style.transform = ''; card.style.removeProperty('--depth-distance'); card.removeAttribute(activeAttribute); });
    entries.forEach(entry => { entry.style.zIndex = ''; });
    list.style.removeProperty('--depth-field-width');
    list.style.removeProperty('--depth-field-offset');
  } };
}
