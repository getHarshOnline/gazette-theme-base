import { setCarouselArrows } from './carousel-controls.js';
import { timeToken } from './css-time.js';
import { motionPreference } from './motion-preference.js';
import { carouselCompactWidth, carouselLoops, wrapDistance, createDecorativeClone, mountCarouselPlayback } from './carousel-playback.js';
export { wrapDistance } from './carousel-playback.js';

// Geometry follows the supplied fan: every channel remains continuous during drag.
export function placeCard(distance, p) {
  const a = Math.abs(distance), near = Math.min(1, a);
  return {
    x: distance * p.step, y: Math.min(a, 2) * p.drop,
    rotate: Math.sign(distance) * near * p.tilt,
    scale: a <= 1 ? 1 - (1 - p.sideScale) * a : p.sideScale * p.falloff ** (a - 1),
    opacity: a <= 1 ? 1 - (1 - p.sideOpacity) * a : Math.max(p.farOpacity, p.sideOpacity - (p.sideOpacity - p.farOpacity) * (a - 1)),
    z: 100 - Math.round(a * 10),
  };
}
export const releaseShift = (offset, threshold) => Math.abs(offset) < threshold ? 0 : Math.sign(offset) * Math.max(1, Math.round(Math.abs(offset)));

// Decorative ring slots never become additional testimony. The nearest slot for
// each account owns its original node, preserving links, emphasis and focus.
export function mount({ element }) {
  const root = element.matches?.('.quote-deck') ? element : element.closest('[data-gazette-component]')?.querySelector('.quote-deck');
  const stage = root?.querySelector('.quote-deck__stage');
  const cards = [...(stage?.querySelectorAll(':scope > .quote-deck__card') || [])];
  const controls = root?.querySelector('.quote-deck__controls');
  const position = root?.querySelector('.quote-deck__position');
  const arrows = root?.querySelector('.quote-deck__arrows');
  const previous = root?.querySelector('[data-quote-previous]');
  const next = root?.querySelector('[data-quote-next]');
  const playback = root?.querySelector('[data-quote-playback]');
  if (cards.length < 2 || !controls || !position || !arrows || !previous || !next || typeof ResizeObserver !== 'function') return;
  const css = getComputedStyle(root);
  const read = name => parseFloat(css.getPropertyValue(name));
  const p = {
    step: read('--layout-quote-step'), drop: read('--layout-quote-drop'),
    tilt: read('--layout-quote-tilt'), sideScale: read('--layout-quote-neighbour-scale'),
    falloff: read('--layout-quote-falloff'), sideOpacity: read('--material-quote-deck-side-opacity'),
    farOpacity: read('--material-quote-deck-far-opacity'),
  };
  const visible = read('--layout-quote-visible-distance');
  const threshold = read('--layout-quote-release-threshold');
  const intent = read('--layout-quote-drag-threshold');
  const compactWidth = carouselCompactWidth(root);
  if (![...Object.values(p), visible, threshold, intent, compactWidth].every(Number.isFinite) || p.step <= 0) return;
  const count = cards.length, looping = carouselLoops(count);
  const total = looping ? count * Math.ceil((Math.floor(visible) * 2 + 1) / count) : count;
  const slotDistance = (value, focus) => looping ? wrapDistance(value - focus, total) : value - focus;
  const contained = root.dataset.deckField === 'container';
  const centeredFinite = () => !contained && !looping && root.getBoundingClientRect().width > compactWidth;
  const mod = value => (value % count + count) % count;
  const preference = motionPreference(document);
  const originals = cards.map(card => ({ style: card.getAttribute('style'), hidden: card.getAttribute('aria-hidden'), inert: card.inert, active: card.getAttribute('data-active') }));
  const originalArrows = arrows.hidden;
  const originalDisabled = [previous.disabled, next.disabled];
  const originalControls = controls.hidden, originalPosition = position.textContent;
  const originalScrollLeft = stage.scrollLeft;
  const originalClearance = root.style.getPropertyValue('--quote-clearance');
  const fieldProperties = ['--quote-field-width', '--quote-field-offset'];
  const originalField = fieldProperties.map(name => root.style.getPropertyValue(name));
  const originalReduced = root.getAttribute('data-reduced');
  const cleanups = [], clones = [], slots = cards.map((node, number) => ({ node, number, last: null }));
  // A finite inset overview opens with neighbours on both sides; reading-order
  // decks and looping showcases retain their first authored entry.
  const focusedCard = cards.findIndex(card => card.contains(document.activeElement));
  let index = focusedCard >= 0 ? focusedCard : contained && !looping ? Math.floor((count - 1) / 2) : 0;
  let drag = null, suppressPointerClick = false, disposed = false, printing = false, observer;
  const wheelDelay = timeToken(css, '--delay-quote-wheel-lock');
  const wheeled = root.dataset.wheel === 'true' && Number.isFinite(wheelDelay) && wheelDelay > 0;
  const originalRole = root.getAttribute('aria-roledescription');
  let wheelUntil = 0;
  const choices = document.createElement('div'); choices.className = 'carousel-controls__choices quote-deck__choices';
  const buttons = [];
  function listen(target, type, callback, options) {
    target.addEventListener(type, callback, options); cleanups.push(() => target.removeEventListener(type, callback, options));
  }
  const reduced = preference.reduced;
  const playbackControl = mountCarouselPlayback({ root, position, playback, advance: () => select(index + 1), isBusy: () => Boolean(drag), enabled: looping && root.dataset.autoplay === 'true' });
  const schedule = playbackControl.schedule;
  function detachDrag() {
    const held = drag; drag = null; delete root.dataset.dragging;
    if (held?.held && stage.hasPointerCapture(held.id)) stage.releasePointerCapture(held.id);
    return held;
  }
  function snap(node, apply) {
    node.style.transition = 'none'; apply(); void node.offsetWidth; node.style.removeProperty('transition');
  }
  function exchange(a, b) {
    const properties = ['transform', 'opacity', 'zIndex', 'visibility'];
    const first = getComputedStyle(a.node), second = getComputedStyle(b.node);
    const left = Object.fromEntries(properties.map(key => [key, first[key]]));
    const right = Object.fromEntries(properties.map(key => [key, second[key]]));
    snap(a.node, () => Object.assign(a.node.style, right));
    snap(b.node, () => Object.assign(b.node.style, left));
    [a.node, b.node] = [b.node, a.node];
  }
  function layout(focus = index, instant = false) {
    if (disposed) return;
    root.dataset.reduced = String(reduced());
    if (!looping) focus = Math.max(0, Math.min(count - 1, focus));
    // Only a viewport field bleeds. An inset deck keeps its neighbours within
    // its owning column, without covering adjacent questions or controls.
    const viewportWidth = document.documentElement.clientWidth;
    const bounds = root.getBoundingClientRect();
    root.style.setProperty('--quote-field-width', `${contained ? bounds.width : viewportWidth}px`);
    root.style.setProperty('--quote-field-offset', `${contained ? 0 : viewportWidth / 2 - bounds.left - bounds.width / 2}px`);
    cards.forEach((card, account) => {
      const owned = slots.find(slot => slot.node === card);
      const nearest = slots.filter(slot => slot.number % count === account)
        .reduce((best, slot) => Math.abs(slotDistance(slot.number, focus)) < Math.abs(slotDistance(best.number, focus)) ? slot : best);
      if (owned !== nearest) exchange(owned, nearest);
    });
    const width = cards[0].offsetWidth;
    let lowerClearance = 0;
    if (contained) for (const card of cards) for (const distance of [1, 2]) {
      const value = placeCard(distance, p), height = card.offsetHeight, angle = Math.abs(value.rotate) * Math.PI / 180;
      const halfExtent = value.scale * (height * Math.cos(angle) + width * Math.sin(angle)) / 2;
      lowerClearance = Math.max(lowerClearance, value.y * width + halfExtent - height / 2);
    }
    // Rotated corners and the width-based drop need room even with long copy.
    if (!contained) root.style.setProperty('--quote-clearance', `${width * (Math.sin(Math.abs(p.tilt) * Math.PI / 180) / 2 + 2 * p.drop)}px`);
    const active = mod(index);
    slots.forEach(slot => {
      const distance = slotDistance(slot.number, focus), value = placeCard(distance, p);
      // A short set keeps its own balanced positions on a wide field. Selecting
      // another item changes emphasis without sliding the whole group aside.
      const pose = centeredFinite() ? placeCard(slot.number - (count - 1) / 2, p) : value;
      const canonical = cards.indexOf(slot.node), selected = canonical === active;
      const apply = () => {
        slot.node.style.transform = `translateX(${pose.x * 100}%) translateY(${pose.y * width}px) rotate(${pose.rotate}deg) scale(${value.scale})`;
        slot.node.style.opacity = String(value.opacity);
        slot.node.style.zIndex = String(value.z);
        slot.node.style.visibility = Math.abs(distance) > visible ? 'hidden' : 'visible';
      };
      // Only a ring seam jumps; a deliberate multi-card selection still travels.
      if (instant || (looping && slot.last !== null && Math.abs(distance - slot.last) > total / 2)) snap(slot.node, apply); else apply();
      slot.last = distance;
      slot.node.dataset.active = String(selected);
      slot.node.inert = canonical < 0 || (!printing && !selected);
      slot.node.setAttribute('aria-hidden', String(canonical < 0 || (!printing && !selected)));
    });
    // Keep the lower allowance stable through selection/drag, so observing the
    // stage cannot cancel a gesture or move its controls as neighbours change.
    if (contained) root.style.setProperty('--quote-clearance', `${Math.max(0, lowerClearance)}px`);
  }
  function select(value, initiator, instant = false) {
    if (!looping) value = Math.max(0, Math.min(count - 1, value));
    const nextAccount = mod(value);
    const leaving = cards.some((card, i) => i !== nextAccount && card.contains(document.activeElement));
    const fromCard = Boolean(initiator && cards.some(card => card.contains(initiator)));
    if (leaving && !fromCard) (initiator || buttons[nextAccount]).focus();
    detachDrag(); index = value; layout(index, instant);
    // A key pressed on a card link follows the selection to the new card's link once layout makes it live.
    if (leaving && fromCard) (cards[nextAccount].querySelector('a') || buttons[nextAccount]).focus();
    position.textContent = `${nextAccount + 1} / ${count}`;
    setCarouselArrows(previous, next, !looping && nextAccount === 0, !looping && nextAccount === count - 1);
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === nextAccount)));
    // Keep the selected choice in this owned strip, never scroll the page.
    const selected = buttons[nextAccount];
    schedule();
    if (selected && choices.clientWidth > 0) {
      const strip = choices.getBoundingClientRect(), choice = selected.getBoundingClientRect();
      const current = choices.scrollLeft || 0;
      const left = choice.left - strip.left + current, right = left + choice.width;
      const destination = left < current ? left : right > current + choices.clientWidth ? right - choices.clientWidth : current;
      if (destination !== current) choices.scrollLeft = Math.max(0, Math.min(destination, choices.scrollWidth - choices.clientWidth));
    }
  }
  function restore() { detachDrag(); layout(index, true); schedule(); }
  function dispose() {
    if (disposed) return;
    detachDrag(); disposed = true; playbackControl.dispose(); observer?.disconnect(); cleanups.splice(0).forEach(cleanup => cleanup());
    if (originalRole === null) root.removeAttribute('aria-roledescription'); else root.setAttribute('aria-roledescription', originalRole);
    clones.forEach(clone => clone.remove()); choices.remove();
    cards.forEach((card, i) => {
      const old = originals[i];
      for (const [name, value] of [['style', old.style], ['aria-hidden', old.hidden], ['data-active', old.active]]) {
        if (value === null) card.removeAttribute(name); else card.setAttribute(name, value);
      }
      card.inert = old.inert;
    });
    root.classList.remove('quote-deck--ready');
    stage.scrollLeft = originalScrollLeft;
    if (originalReduced === null) root.removeAttribute('data-reduced'); else root.setAttribute('data-reduced', originalReduced);
    if (originalClearance) root.style.setProperty('--quote-clearance', originalClearance); else root.style.removeProperty('--quote-clearance');
    fieldProperties.forEach((name, i) => { if (originalField[i]) root.style.setProperty(name, originalField[i]); else root.style.removeProperty(name); });
    arrows.hidden = originalArrows; controls.hidden = originalControls; position.textContent = originalPosition;
    [previous.disabled, next.disabled] = originalDisabled;
  }
  try {
    for (let number = count; number < total; number++) {
      const clone = createDecorativeClone(cards[number % count]);
      clone.dataset.quoteClone = 'true';
      stage.append(clone); clones.push(clone); slots.push({ node: clone, number, last: null });
    }
    cards.forEach((card, i) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'control';
      button.setAttribute('aria-label', card.getAttribute('data-deck-label') || card.querySelector('h2,h3,h4')?.textContent.trim() || [...(card.querySelector('figcaption')?.children || [])]
        .map(part => part.textContent.trim()).filter(Boolean).join(', ') || String(i + 1));
      listen(button, 'click', () => select(looping ? index + wrapDistance(i - mod(index), count) : i, button));
      choices.append(button); buttons.push(button);
    });
    controls.append(choices);
    listen(previous, 'click', () => select(index - 1, previous));
    listen(next, 'click', () => select(index + 1, next));
    // The shared carousel key contract: card links answer arrows too, as in the catalogue.
    listen(root, 'keydown', event => {
      if (event.target.closest('input,textarea,select,[contenteditable]') || event.altKey || event.ctrlKey || event.metaKey) return;
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      const edge = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : null;
      event.preventDefault();
      select(edge === null ? index + (event.key === 'ArrowRight' ? 1 : -1) : looping ? index + wrapDistance(edge - mod(index), count) : edge, event.target);
    });
    listen(stage, 'pointerdown', event => {
      suppressPointerClick = false;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.target.closest('button,input,textarea,select,[contenteditable]') || window.getSelection()?.toString()) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, offset: 0, held: false };
      schedule();
    });
    listen(stage, 'pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (window.getSelection()?.toString()) { suppressPointerClick = false; restore(); return; }
      if (event.pointerType === 'mouse' && event.buttons === 0) { restore(); return; }
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.held) {
        if (Math.abs(dy) > intent && Math.abs(dy) > Math.abs(dx)) { restore(); return; }
        if (Math.abs(dx) < intent || Math.abs(dx) <= Math.abs(dy)) return;
        drag.held = true; stage.setPointerCapture(event.pointerId); root.dataset.dragging = 'true';
      }
      event.preventDefault();
      drag.offset = -dx / (cards[0].offsetWidth * p.step);
      if (!reduced()) layout(index + drag.offset, true);
    });
    listen(stage, 'pointerup', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const shift = drag.held ? releaseShift(drag.offset, threshold) : 0;
      suppressPointerClick = drag.held;
      select(index + shift);
    });
    listen(stage, 'pointercancel', event => { if (drag?.id === event.pointerId) { suppressPointerClick = false; restore(); } });
    listen(stage, 'click', event => {
      if (!suppressPointerClick || !event.detail || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      suppressPointerClick = false; event.preventDefault(); event.stopPropagation();
    });
    listen(stage, 'dragstart', event => { if (drag && event.target.closest('a')) event.preventDefault(); });
    listen(stage, 'lostpointercapture', event => { if (event.target === stage && drag?.id === event.pointerId) restore(); });
    listen(stage, 'pointerleave', () => { if (drag && !drag.held) restore(); });
    if (wheeled) listen(stage,'wheel',event=>{
      if (event.ctrlKey || event.metaKey) return;
      const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
      if (Math.abs(delta)<intent) return;
      const nextIndex=index+Math.sign(delta);
      if (!looping && (nextIndex<0 || nextIndex>=count)) return;
      event.preventDefault();
      const now=performance.now(); if(now<wheelUntil)return;
      wheelUntil=now+wheelDelay;select(nextIndex);
    },{passive:false});
    cleanups.push(preference.onMotionChange(restore));
    listen(window, 'resize', restore);
    listen(document, 'visibilitychange', restore);
    listen(window, 'beforeprint', () => { printing = true; restore(); });
    listen(window, 'afterprint', () => { printing = false; restore(); });
    observer = new ResizeObserver(restore); observer.observe(stage); observer.observe(root); observer.observe(document.documentElement);
    document.fonts?.ready.then(() => { if (!disposed) restore(); }).catch(() => {});
    stage.scrollLeft = 0;
    root.classList.add('quote-deck--ready'); root.setAttribute('aria-roledescription','carousel'); arrows.hidden = false; controls.hidden = false; select(index, undefined, true);
  } catch (error) { dispose(); throw error; }
  return dispose;
}

// Compiler-rendered collection cards and authored testimony share the same controller.
export function mountContentDecks(container = document) {
  const cleanups = [...container.querySelectorAll('[data-content-deck]')]
    .map(element => mount({ element })).filter(dispose => typeof dispose === 'function');
  return () => cleanups.forEach(dispose => dispose());
}
