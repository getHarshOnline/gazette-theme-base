import test from 'node:test';
import assert from 'node:assert/strict';
import { createPond } from '../shared/pond-engine.mjs';
import { readPondAppearance, mountSearchPond } from '../scripts/search-pond.js';

test('Base supplies no engine, so the search page has no pond', () => {
  assert.equal(createPond, null);
  let appended = false;
  const field = { ownerDocument: { defaultView: {} }, append() { appended = true; } };
  assert.equal(mountSearchPond({ field }), null);
  assert.equal(appended, false);
});

test('absence of canvas capabilities preserves native search without adding a surface', () => {
  let appended = false;
  const field = { ownerDocument: { defaultView: {} }, append() { appended = true; } };
  assert.equal(mountSearchPond({ field }, () => ({})), null);
  assert.equal(appended, false);
});

test('visibility, reduced motion and disposal own the single animation loop', () => {
  const calls = { pointer: [], drops: [], steps: 0, renders: 0, scatters: 0, nudges: 0, themes: [], paces: [], sizes: [], created: [] };
  const engine = options => {
    calls.created.push(options);
    return {
      resize: (...size) => calls.sizes.push(size),
      setTheme: theme => calls.themes.push(theme),
      setPace: pace => calls.paces.push(pace),
      step: () => calls.steps++,
      render: () => calls.renders++,
      setPointer: (...point) => calls.pointer.push(point),
      clearPointer() {},
      drop: (...point) => calls.drops.push(point),
      scatter: () => calls.scatters++,
      nudge: () => calls.nudges++,
    };
  };
  const old = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  const frames = new Map(); let frame = 0, removed = false, width = 0;
  const events = () => ({ listeners: new Map(), addEventListener(key, fn) { this.listeners.set(key, fn); }, removeEventListener(key) { this.listeners.delete(key); } });
  const media = Object.assign(events(), { matches: false });
  const resize = [], intersections = [], mutations = [];
  const observer = array => class { constructor(fn) { this.fn = fn; array.push(this); } observe() {} disconnect() { this.disconnected = true; } };
  const ctx = new Proxy({ getImageData(_x, _y, w, h) { const data = new Uint8ClampedArray(w * h * 4); if (w === 1 && h === 1) data.set([100, 120, 140, 255]); return { data }; } }, { get: (target, key) => key in target ? target[key] : () => {} });
  const makeCanvas = () => Object.assign(events(), { width: 0, height: 0, setAttribute() {}, getContext: () => ctx, remove() { removed = true; } });
  const win = Object.assign(events(), {
    ResizeObserver: observer(resize), IntersectionObserver: observer(intersections), MutationObserver: observer(mutations), matchMedia: () => media, devicePixelRatio: 3,
    requestAnimationFrame: fn => { frames.set(++frame, fn); return frame; }, cancelAnimationFrame: id => frames.delete(id),
  });
  const root = { dataset: {} };
  const doc = Object.assign(events(), { defaultView: win, documentElement: root, createElement: () => makeCanvas(), hidden: false });
  const surface = events();
  const field = Object.assign(events(), { parentElement: surface, ownerDocument: doc, append() {}, getBoundingClientRect: () => ({ width, height: 130, left: 0, top: 0 }) });
  const values = { '--layout-search-pond-cell': '13px', '--motion-search-pond-pace': '1', '--motion-reduced-search-pond-pace': '0', '--world-material-raster-opacity': '.04', '--type-family-system': 'monospace', '--type-weight-system': '400' };
  for (const name of ['paper', 'sheet', 'ink', 'muted', 'accent', 'line']) values[`--color-${name}`] = '#64788c';
  globalThis.document = doc;
  globalThis.getComputedStyle = () => ({ getPropertyValue: key => values[key] || '' });
  try {
    const appearance = readPondAppearance(field);
    assert.deepEqual(Object.keys(appearance.colours).sort(), ['accent', 'ink', 'line', 'muted', 'paper', 'sheet']);
    assert.equal(appearance.colours.accent, '#64788c');

    const pond = mountSearchPond({ field }, engine); assert.ok(pond); assert.equal(frames.size, 0);
    width = 260; resize[0].fn(); assert.equal(frames.size, 0);
    assert.equal(calls.created.length, 1);
    assert.equal(calls.created[0].stage, 2);
    assert.equal(typeof calls.created[0].ripples.energy, 'function');
    // The backing size is capped at twice the CSS size.
    assert.deepEqual(calls.sizes.at(-1), [260, 130, 520, 260]);
    intersections[0].fn([{ isIntersecting: true }]); assert.equal(frames.size, 1);
    const [id, callback] = [...frames][0]; frames.delete(id); callback(16); assert.equal(calls.steps, 1); assert.equal(frames.size, 1); assert.equal(calls.renders > 0, true);
    assert.equal(field.listeners.size, 0);
    const event = { clientX: 65, clientY: 65, target: { closest: () => null } };
    surface.listeners.get('pointermove')(event); surface.listeners.get('click')(event);
    assert.deepEqual(calls.pointer, [[.5, .5]]); assert.deepEqual(calls.drops, [[.5, .5]]);
    surface.listeners.get('click')({ ...event, target: { closest: () => ({}) } }); assert.equal(calls.drops.length, 1);
    root.dataset.motion = 'reduce'; mutations[0].fn(); assert.equal(frames.size, 0);
    assert.equal(calls.paces.at(-1), 0);
    pond.nudge(); pond.scatter(); assert.equal(frames.size, 0); assert.equal(calls.nudges + calls.scatters, 0);
    root.dataset.motion = 'allow'; mutations[0].fn(); assert.equal(frames.size, 1);
    root.dataset.mode = 'dark'; mutations[0].fn(); assert.equal(calls.themes.at(-1), 'dark');
    pond.setPaused(true); assert.equal(frames.size, 0);
    pond.setPaused(false); assert.equal(frames.size, 1);
    doc.hidden = true; doc.listeners.get('visibilitychange')(); assert.equal(frames.size, 0);
    doc.hidden = false; doc.listeners.get('visibilitychange')(); assert.equal(frames.size, 1);
    win.listeners.get('pagehide')(); assert.equal(frames.size, 0);
    win.listeners.get('pageshow')(); assert.equal(frames.size, 1);
    intersections[0].fn([{ isIntersecting: false }]); assert.equal(frames.size, 0);
    pond.destroy(); assert.equal(frames.size, 0); assert.ok(removed);
    assert.ok([...resize, ...intersections, ...mutations].every(item => item.disconnected));
    assert.equal(field.listeners.size, 0); assert.equal(surface.listeners.size, 0); assert.equal(doc.listeners.size, 0);
  } finally { Object.assign(globalThis, old); }
});

test('an engine that throws leaves the canvas hidden and the page usable', () => {
  const old = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  const events = () => ({ listeners: new Map(), addEventListener(key, fn) { this.listeners.set(key, fn); }, removeEventListener(key) { this.listeners.delete(key); } });
  const ctx = new Proxy({ getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }) }, { get: (target, key) => key in target ? target[key] : () => {} });
  const canvas = Object.assign(events(), { hidden: false, setAttribute() {}, getContext: () => ctx, remove() {} });
  const observer = class { constructor() {} observe() {} disconnect() {} };
  const win = Object.assign(events(), { ResizeObserver: observer, MutationObserver: observer, matchMedia: () => Object.assign(events(), { matches: false }), devicePixelRatio: 1, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
  const doc = Object.assign(events(), { defaultView: win, documentElement: { dataset: {} }, createElement: () => canvas, hidden: false });
  const field = Object.assign(events(), { parentElement: null, ownerDocument: doc, append() {}, getBoundingClientRect: () => ({ width: 100, height: 100, left: 0, top: 0 }) });
  const values = { '--layout-search-pond-cell': '13px', '--motion-search-pond-pace': '1', '--motion-reduced-search-pond-pace': '0', '--world-material-raster-opacity': '.04', '--type-family-system': 'monospace', '--type-weight-system': '400' };
  for (const name of ['paper', 'sheet', 'ink', 'muted', 'accent', 'line']) values[`--color-${name}`] = '#64788c';
  globalThis.document = doc;
  globalThis.getComputedStyle = () => ({ getPropertyValue: key => values[key] || '' });
  try {
    const pond = mountSearchPond({ field }, () => { throw new Error('broken engine'); });
    assert.ok(pond);
    assert.equal(canvas.hidden, true);
    pond.destroy();
  } finally { Object.assign(globalThis, old); }
});
