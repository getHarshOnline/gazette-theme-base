import { canvasSize } from './canvas-size.js';
import { observeInView } from './in-view.js';
import { motionPreference } from './motion-preference.js';
import { rippleEnergy, rippleGlyph } from './surface-ripples.js';
import { createPond } from '../shared/pond-engine.mjs';

// The pond is a decorative rendering, never a second search implementation.
// Its pixels use the same world tokens and motion preference as the search form.
// Base hosts it; the fish engine is supplied by the workspace in
// shared/pond-engine.mjs, and without one the search page has no pond.
export function readPondAppearance(field, doc = field.ownerDocument) {
  const style = getComputedStyle(field);
  const token = name => style.getPropertyValue(name).trim();
  const cell = parseFloat(token('--layout-search-pond-cell'));
  const pace = parseFloat(token('--motion-search-pond-pace'));
  const reducedPace = parseFloat(token('--motion-reduced-search-pond-pace'));
  const gridOpacity = parseFloat(token('--world-material-raster-opacity'));
  const font = token('--type-family-system');
  const weight = token('--type-weight-system') || token('--type-weight-reading');
  const source = {
    paper: token('--color-paper'), sheet: token('--color-sheet'),
    ink: token('--color-ink'), muted: token('--color-muted'), accent: token('--color-accent'),
    line: token('--color-line'),
  };
  if (![cell, pace, reducedPace, gridOpacity].every(Number.isFinite) || cell <= 0 || !font || !weight || Object.values(source).some(value => !value)) return null;
  const swatch = doc.createElement('canvas'); swatch.width = swatch.height = 1;
  const context = swatch.getContext?.('2d', { willReadFrequently: true });
  if (!context) return null;
  const rgb = value => {
    context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const hex = value => '#' + rgb(value).map(channel => channel.toString(16).padStart(2, '0')).join('');
  const colours = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, hex(value)]));
  return {
    cell, pace, reducedPace, gridOpacity, font, weight, colours,
    water: rgb(source.paper), accent: colours.accent, shadow: source.line,
    ink: { grid: source.line, dash: rgb(source.muted), square: rgb(source.accent), ripple: rgb(source.accent), trail: rgb(source.muted) },
  };
}

// Advance and draw the engine once per animation frame, at most 50 ms a step.
function frames(win, engine) {
  let request = 0, last = 0;
  const loop = now => {
    const dt = last ? Math.min(0.05, (now - last) / 1e3) : 1 / 60;
    last = now;
    engine.step(dt);
    engine.render(dt);
    request = win.requestAnimationFrame(loop);
  };
  return {
    start() { if (!request) request = win.requestAnimationFrame(loop); },
    stop() { win.cancelAnimationFrame(request); request = 0; last = 0; },
  };
}

export function mountSearchPond({ field, form }, engine = createPond) {
  const doc = field?.ownerDocument;
  const win = doc?.defaultView;
  if (typeof engine !== 'function') return null;
  if (!doc || !win || typeof win.ResizeObserver !== 'function' || typeof win.MutationObserver !== 'function' || typeof win.matchMedia !== 'function') return null;
  const canvas = doc.createElement('canvas');
  if (!canvas.getContext?.('2d')) return null;
  canvas.className = 'search-pond'; canvas.setAttribute('aria-hidden', 'true');
  field.append(canvas);
  const cleanups = [];
  const on = (target, type, callback, options) => {
    target.addEventListener(type, callback, options);
    cleanups.push(() => target.removeEventListener(type, callback, options));
  };
  const motionSetting = motionPreference(doc);
  const mediaColor = win.matchMedia('(prefers-color-scheme: dark)');
  let pond = null, loop = null, appearance = null, size = '', inView = false, paused = false, printing = false, pageHidden = false, disposed = false;
  const reduced = motionSetting.reduced;
  const mode = () => doc.documentElement.dataset.mode || (mediaColor.matches ? 'dark' : 'light');
  function synchronize() {
    if (!pond || disposed) return;
    pond.setTheme(mode() === 'dark' ? 'dark' : 'light');
    const still = paused || printing || pageHidden || doc.hidden || !inView || reduced();
    pond.setPace(reduced() ? appearance.reducedPace : appearance.pace);
    if (still) { loop.stop(); pond.render(0); } else loop.start();
  }
  function rebuild(force = false) {
    if (disposed) return;
    const rect = field.getBoundingClientRect();
    if (!rect.width || !rect.height) { loop?.stop(); return; }
    // Limit backing resolution without affecting the CSS-space character grid.
    const dpr = Math.min(2, win.devicePixelRatio || 1);
    const next = `${rect.width}:${rect.height}:${dpr}`;
    if (!force && size === next) { synchronize(); return; }
    const values = readPondAppearance(field, doc);
    if (!values) { loop?.stop(); return; }
    loop?.stop();
    appearance = values; size = next;
    try {
      pond = engine({ canvas, stage: rect.width / rect.height, appearance: values, ripples: { energy: rippleEnergy, glyph: rippleGlyph } });
      loop = frames(win, pond);
      pond.setTheme(mode() === 'dark' ? 'dark' : 'light');
      const pixels = canvasSize(rect.width, rect.height, dpr);
      pond.resize(rect.width, rect.height, pixels.width, pixels.height);
      canvas.hidden = false;
      synchronize();
    } catch { loop?.stop(); pond = null; canvas.hidden = true; }
  }
  const resize = new win.ResizeObserver(() => rebuild()); resize.observe(field);
  let stopInView;
  if (typeof win.IntersectionObserver === 'function') {
    stopInView = observeInView(field, value => { inView = value; rebuild(); }, { window: win });
  } else inView = true;
  const mutation = new win.MutationObserver(() => rebuild(true));
  mutation.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-mode', 'data-motion'] });
  on(doc, 'visibilitychange', synchronize);
  cleanups.push(motionSetting.onMotionChange(synchronize));
  on(mediaColor, 'change', () => rebuild(true));
  on(win, 'beforeprint', () => { printing = true; synchronize(); });
  on(win, 'afterprint', () => { printing = false; synchronize(); });
  on(win, 'pagehide', () => { pageHidden = true; synchronize(); });
  on(win, 'pageshow', () => { pageHidden = false; rebuild(); });
  // The decorative field deliberately ignores pointer hit testing. Observe the
  // surrounding discovery surface while retaining the pond's own coordinate space.
  const interaction = field.parentElement || field;
  const pointer = event => {
    const rect = field.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.height, (event.clientY - rect.top) / rect.height];
  };
  const isControl = event => event.target.closest?.('a,button,input,textarea,select,summary,.search-page__matches,.search-page__pagination') || form?.contains(event.target);
  on(interaction, 'pointermove', event => {
    if (!pond || reduced() || paused || isControl(event)) { pond?.clearPointer(); return; }
    pond.setPointer(...pointer(event));
  }, { passive: true });
  on(interaction, 'pointerleave', () => pond?.clearPointer(), { passive: true });
  on(interaction, 'click', event => {
    if (!pond || reduced() || paused || isControl(event)) return;
    pond.drop(...pointer(event));
  });
  on(canvas, 'contextlost', () => { loop?.stop(); pond = null; });
  on(canvas, 'contextrestored', () => { canvas.hidden = false; rebuild(true); });
  rebuild();
  return {
    nudge() { if (!reduced() && !paused) pond?.nudge(); },
    scatter() { if (!reduced() && !paused) pond?.scatter(); },
    setPaused(value) { paused = Boolean(value); synchronize(); },
    destroy() {
      disposed = true; loop?.stop(); pond = null; resize.disconnect(); stopInView?.(); mutation.disconnect();
      cleanups.forEach(cleanup => cleanup()); canvas.remove();
    },
  };
}
