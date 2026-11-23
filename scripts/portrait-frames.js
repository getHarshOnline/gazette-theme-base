import { canvasSize } from './canvas-size.js';
import { observeInView } from './in-view.js';
import { clamp } from './clamp.js';
import { motionPreference } from './motion-preference.js';
import { createFrameSource } from './frames.js';

// Pose ranges describe the supplied film, rather than a world's interaction style.
export function poseTarget(x, side, model) {
  const next = x > model.enterRight ? 1 : x < model.enterLeft ? 0 : side;
  const range = model.holds[next];
  const fraction = next ? (x - model.enterLeft) / (1 - model.enterLeft) : x / model.enterRight;
  return { side: next, frame: Math.round(range[0] + clamp(fraction, 0, 1) * (range[1] - range[0])) };
}

// Visit every transition frame; a slow decode must never skip a blink or queue old targets.
export function nextPortraitFrame(current, target) {
  return current + Math.sign(target - current);
}

export function mountPortrait(wrapper, model) {
  const stage = wrapper.querySelector('.portrait-stage');
  const still = stage?.querySelector('img');
  if (!still || !window.createImageBitmap || !window.IntersectionObserver || !window.ResizeObserver) return;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.className = 'portrait-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  stage.append(canvas);
  const preference = motionPreference(document);
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  const lifecycle = new AbortController();
  let inView = false, active = false, failed = false, printing = false, disposed = false;
  let current = model.rest, target = model.rest, side = model.rest < model.holds[1][0] ? 0 : 1;
  let timer = null, source = null, requesting = false;

  function cancel() { clearTimeout(timer); timer = null; }
  function hide() { wrapper.classList.remove('portrait-ready'); }
  function draw(bitmap) {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return false;
    const cap = Number.parseFloat(getComputedStyle(wrapper).getPropertyValue('--island-pixel-ratio-max')) || 1;
    const ratio = Math.min(devicePixelRatio || 1, cap);
    const pixels = canvasSize(width, height, ratio);
    canvas.width = pixels.width; canvas.height = pixels.height;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = model.edgeColor;
    context.fillRect(0, 0, width, height);
    // Match the durable img's cover/center-bottom framing exactly. The world
    // supplies a field whose aspect preserves the authored figure in both forms.
    const scale = Math.max(width / model.width, height / model.height);
    context.drawImage(bitmap, (width - model.width * scale) / 2, height - model.height * scale,
      model.width * scale, model.height * scale);
    return true;
  }
  function schedule() {
    if (!active || current === target) { cancel(); return; }
    if (requesting || timer !== null) return;
    const transition = current >= model.holds[0][1] && current <= model.holds[1][0];
    const delay = 1000 / (transition ? model.transitionFps : model.holdFps);
    timer = setTimeout(() => {
      timer = null;
      if (!active) return;
      requesting = true;
      source.setFrame(nextPortraitFrame(current, target));
    }, delay);
  }
  function makeSource() {
    return createFrameSource({
      frames: model.frames, budgetBytes: model.width * model.height * 4 * model.cacheFrames,
      concurrency: 1,
      onFrame({ bitmap, index }) {
        requesting = false;
        current = index;
        if (active && draw(bitmap)) wrapper.classList.add('portrait-ready');
        schedule();
      },
      onError() { failed = true; state(); },
    });
  }
  function state() {
    const motion = !preference.reduced();
    const next = !disposed && !failed && !printing && inView && !document.hidden && pointer.matches && motion;
    if (next === active) return;
    active = next;
    cancel();
    requesting = false;
    // A fresh source prevents late decodes from a suspended pose entering the new session.
    source?.dispose();
    source = null;
    hide();
    current = target = model.rest;
    side = model.rest < model.holds[1][0] ? 0 : 1;
    if (active) {
      source = makeSource();
      requesting = true;
      source.setFrame(current);
      source.setActive(true);
    }
  }
  const stopInView = observeInView(wrapper, value => { inView = value; state(); }, { window, firstEntry: true });
  const resize = new ResizeObserver(() => {
    if (!active || !source) return;
    // Redraw the same pose without changing the pointer's target or gaze side.
    cancel(); source.dispose(); hide();
    source = makeSource(); requesting = true;
    source.setFrame(current); source.setActive(true);
  });
  resize.observe(stage);
  wrapper.addEventListener('pointermove', event => {
    if (!active || event.pointerType !== 'mouse') return;
    const bounds = wrapper.getBoundingClientRect();
    const pose = poseTarget((event.clientX - bounds.left) / bounds.width, side, model);
    side = pose.side; target = pose.frame;
    schedule();
  }, { passive: true, signal: lifecycle.signal });
  wrapper.addEventListener('pointerleave', () => { if (active) { target = model.rest; schedule(); } }, { signal: lifecycle.signal });
  document.addEventListener('visibilitychange', state, { signal: lifecycle.signal });
  preference.onMotionChange(state, { signal: lifecycle.signal });
  pointer.addEventListener('change', state, { signal: lifecycle.signal });
  addEventListener('beforeprint', () => { printing = true; state(); }, { signal: lifecycle.signal });
  addEventListener('afterprint', () => { printing = false; state(); }, { signal: lifecycle.signal });
  addEventListener('pagehide', () => { inView = false; state(); }, { signal: lifecycle.signal });
  addEventListener('pageshow', () => {
    const bounds = wrapper.getBoundingClientRect();
    inView = bounds.bottom > 0 && bounds.top < innerHeight; state();
  }, { signal: lifecycle.signal });
  return () => {
    disposed = true; state(); cancel(); source?.dispose(); lifecycle.abort();
    stopInView(); resize.disconnect(); canvas.remove(); hide();
  };
}
