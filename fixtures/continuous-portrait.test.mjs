import { canvasSize } from '../scripts/canvas-size.js';
import { createFrameLoop } from '../scripts/frame-loop.js';
import { observeInView } from '../scripts/in-view.js';
import { mountPortraitCopy } from '../scripts/portrait-copy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { timeToken } from '../scripts/css-time.js';
import { motionPreference } from '../scripts/motion-preference.js';
import { ContinuousGaze, gazeFrame, gazeLoadOrder } from '../scripts/continuous-gaze.js';

const source = readFileSync(new URL('../scripts/continuous-portrait.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export function ', 'function ');

function fixture({ stillPicture = false, stillSrcset = false, invalidToken = false, gpuAvailable = false, modeSources = false, darkMode = false, introTyping = false, reducedMotion = false, resourceSources = false, delayedStill = false, sharedReveal = false } = {}) {
  const observers = [], canvases = [], requests = [], bitmaps = [], poseSamples = [], pending = new Map(), frames = new Map(), timers = new Map();
  let active = 0, peak = 0, frameId = 0, resets = 0, leaves = 0, pulses = 0;
  const gpuCalls = { draws: 0, resets: 0, destroys: 0 };
  const typingCalls = { starts: 0, finishes: 0, destroys: 0 };
  class Surface extends EventTarget {
    constructor() {
      super(); this.children = []; this.classes = new Set(); this.attributes = {};
      this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
      this.style = { removeProperty() {} };
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(child) { this.children.push(child); child.parent = this; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
    getBoundingClientRect() { return { left: 0, top: 0, bottom: 600, right: 480, width: 480, height: 600 }; }
  }
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {} disconnect() { this.disconnected = true; }
  }
  class Intersection extends Observer {}
  const wrapper = new Surface(), stage = new Surface(), copy = new Surface(), still = { src: 'https://example.test/rest.png', alt: 'Portrait' };
  if (stillPicture) still.closest = selector => selector === 'picture' ? { querySelector: query => query.includes('source[data-gazette-image-mode]') ? {} : null } : null;
  if (stillSrcset) {
    const attributes = new Map([['src', 'https://example.test/rest.png'], ['srcset', '/rest-small.png 320w, /rest.png 640w']]);
    Object.assign(still, { dataset: {}, hasAttribute: name => attributes.has(name), getAttribute: name => attributes.get(name) ?? null, setAttribute: (name, value) => attributes.set(name, value) });
  }
  copy.querySelector = () => ({}); copy.style.setProperty = () => {};
  copy.contains = () => false;
  let releaseStill;
  if (delayedStill) still.decode = () => new Promise(resolve => { releaseStill = resolve; });
  wrapper.querySelector = selector => selector === '.portrait-stage' ? stage : selector === '.encounter-copy' ? copy : null;
  wrapper.querySelectorAll = () => [still]; stage.querySelector = () => still; stage.closest = () => wrapper;
  const document = new Surface(); document.documentElement = { dataset: darkMode ? { mode: 'dark' } : {} }; document.hidden = false;
  document.querySelector = () => null;
  copy.ownerDocument = document;
  document.createElement = () => {
    const canvas = new Surface();
    canvas.getContext = () => ({
      setTransform() {}, clearRect() {}, drawImage() {}, fillRect() {},
      getImageData: () => ({ width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(canvas.width * canvas.height * 4) }),
    });
    canvases.push(canvas); return canvas;
  };
  const window = new Surface();
  const preferences = [];
  const createImageBitmap = ({ path }) => new Promise(resolve => {
    pending.set(path, () => {
      const bitmap = { width: 4, height: 4, closed: 0, close() { this.closed++; } };
      bitmaps.push(bitmap); active--; resolve(bitmap);
    });
  });
  Object.assign(window, { createImageBitmap, IntersectionObserver: Intersection, ResizeObserver: Observer });
  const model = {
    width: 4, height: 4, curve: [.5], inverseWeight: 0, glyphs: true, decodeConcurrency: 2, introTyping,
    geometry: { noseX: 2 }, variants: [{ width: 4, frames: ['/front.png'] }],
    stills: [{ light: '/rest.png', dark: '/rest-dark.png' }],
    poses: { frames: { front: '/front.png', left: '/left.png', right: '/right.png', up: '/up.png', down: '/down.png' } },
    reveal: { world: sharedReveal ? '/front.png' : '/world.png', character: '/character.png' },
  };
  if (modeSources) {
    model.variants[0].frames = [{ light: '/front.png', dark: '/front-dark.png' }];
    model.poses.frames = Object.fromEntries(Object.entries(model.poses.frames).map(([key, light]) => [key, { light, dark: `/${key}-dark.png` }]));
  }
  const resources = [];
  if (resourceSources) {
    for (const path of [...Object.values(model.poses.frames), ...Object.values(model.stills[0])]
      .flatMap(value => typeof value === 'string' ? [value] : Object.values(value))) {
      const output = `/derived${path}.webp`;
      resources.push({ rendition_of: `https://example.test${path}`, output, url: `https://preview.example.test${output}` });
    }
  }
  const environment = {
    document, window, URL, AbortController, EventTarget, ContinuousGaze, gazeFrame, gazeLoadOrder, timeToken, motionPreference, observeInView, canvasSize, createFrameLoop, mountPortraitCopy,
    gazeLayout: () => ({ scale: 1, x: 0, y: 0, portrait: false }),
    createPortraitGPU: () => gpuAvailable ? {
      draw(_context, poses) { gpuCalls.draws++; return Boolean(poses.front); },
      reset() { gpuCalls.resets++; }, destroy() { gpuCalls.destroys++; },
    } : null,
    createPortraitGlyphs: () => ({ draw() {}, drawSample: () => true }),
    createTypingReveal: () => ({ start() { typingCalls.starts++; }, finish() { typingCalls.finishes++; }, destroy() { typingCalls.destroys++; } }),
    createPortraitReveal: () => ({ draw() {}, applyPortraitMask() {}, reset() { resets++; }, point() {}, pulse() { pulses++; }, obscures() { return 0; }, leave() { leaves++; } }),
    samplePose: (_model, buffers) => { poseSamples.push(Object.keys(buffers)); return null; }, createImageBitmap,
    location: { href: 'https://example.test/' }, innerHeight: 900, devicePixelRatio: 1,
    performance: { now: () => 1000 },
    setTimeout(callback, duration) { const id = Symbol(); timers.set(id, { callback, duration }); return id; },
    clearTimeout(id) { timers.delete(id); },
    getComputedStyle: () => ({ getPropertyValue: name => invalidToken && name === '--gaze-tracking-rate' ? '' : '2' }),
    MutationObserver: Observer, ResizeObserver: Observer, IntersectionObserver: Intersection,
    matchMedia: query => { const preference = new Surface(); preference.matches = reducedMotion && query.includes('reduced-motion'); preferences.push(preference); return preference; },
    addEventListener: window.addEventListener.bind(window),
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    fetch: async (path, { signal }) => {
      requests.push({ path, signal }); active++; peak = Math.max(peak, active);
      return { ok: true, blob: async () => ({ path }) };
    },
  };
  document.defaultView = environment.window; environment.window.matchMedia = environment.matchMedia;
  Object.assign(window, { requestAnimationFrame: environment.requestAnimationFrame, cancelAnimationFrame: environment.cancelAnimationFrame });
  const context = vm.createContext(environment); vm.runInContext(source, context);
  const dispose = context.mountContinuousPortrait(wrapper, model, resources);
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const start = async () => { observers.find(observer => observer instanceof Intersection)?.callback([{ isIntersecting: true }]); await settle(); };
  const complete = async path => { const resolve = pending.get(path); assert.ok(resolve, `pending decode ${path}`); pending.delete(path); resolve(); await settle(); };
  return { wrapper, stage, still, observers, canvases, requests, bitmaps, poseSamples, pending, frames, timers, preferences, dispose, start, complete, settle,
    releaseStill: () => releaseStill?.(),
    point: () => wrapper.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 200, clientY: 200 })),
    peak: () => peak, resets: () => resets, leaves: () => leaves, pulses: () => pulses, document, window, gpuCalls, typingCalls };
}

test('resizing clears scene-relative reveal coordinates before drawing the new frame', async () => {
  const f = fixture();
  try {
    await f.start();
    const before = f.resets();
    f.observers[2].callback();
    assert.ok(f.resets() > before);
  } finally { f.dispose(); }
});

test('optional typing starts with motion and finishes on mode change, but never starts in reduced motion', async () => {
  for (const reducedMotion of [false, true]) {
    const f = fixture({ introTyping: true, reducedMotion });
    try {
      await f.start();
      assert.equal(f.typingCalls.starts, reducedMotion ? 0 : 1);
      f.document.documentElement.dataset.mode = 'dark';
      f.observers[0].callback();
      if (!reducedMotion) assert.equal(f.typingCalls.finishes, 1);
      else assert.equal(f.requests.length, 0);
    } finally { f.dispose(); }
    assert.equal(f.typingCalls.destroys, 1);
  }
});

test('mode variants are selected once for a decode session and refreshed on appearance changes', async () => {
  const f = fixture({ modeSources: true, darkMode: true });
  try {
    await f.start();
    while (f.pending.size) await f.complete(f.pending.keys().next().value);
    assert.ok(f.requests.some(request => request.path === '/front-dark.png'));
    assert.ok(!f.requests.some(request => request.path === '/front.png'));
    const before = f.requests.length;
    f.document.documentElement.dataset.mode = 'light';
    f.observers[0].callback(); await f.settle();
    while (f.pending.size) await f.complete(f.pending.keys().next().value);
    assert.ok(f.requests.slice(before).some(request => request.path === '/front.png'));
    assert.ok(f.requests.slice(0, before).every(request => request.signal.aborted));
  } finally { f.dispose(); }
});

test('page exit, cancellation and window blur release the reveal and dispose their listeners', () => {
  const f = fixture();
  const leave = () => {
    f.document.dispatchEvent(new Event('pointerleave'));
    f.window.dispatchEvent(new Event('pointercancel'));
    f.window.dispatchEvent(new Event('blur'));
  };
  leave(); assert.equal(f.leaves(), 3);
  f.dispose(); leave(); assert.equal(f.leaves(), 3);
});

test('frame and pose share one decode, with all optional assets inside the same concurrency bound', async () => {
  const f = fixture();
  try {
    await f.start();
    assert.equal(f.requests.length, 2);
    let completed = 0;
    while (f.pending.size) { assert.ok(completed++ < 10); await f.complete(f.pending.keys().next().value); }
    assert.equal(f.requests.length, 5, 'hidden reveal art does not compete with the resting scene');
    f.point(); await f.settle();
    while (f.pending.size) await f.complete(f.pending.keys().next().value);
    assert.equal(f.requests.length, 7, 'front, four directions and two reveal sources');
    assert.equal(f.requests.filter(request => request.path === '/front.png').length, 1);
    assert.equal(f.bitmaps.length, 7);
    assert.equal(f.peak(), 2, 'fetch and pending bitmap decode share the configured ceiling');
    assert.ok(f.wrapper.classes.has('portrait-ready'));
    assert.deepEqual([...f.poseSamples.at(-1)].sort(), ['down', 'front', 'left', 'right', 'up'], 'the shared source reaches pose sampling as well as the frame renderer');
    f.dispose();
    assert.ok(f.bitmaps.every(bitmap => bitmap.closed === 1), 'the shared front bitmap closes only once');
  } finally { f.dispose(); }
});

test('decorative loading waits for the still and resolves native resource URLs', async () => {
  const f = fixture({ delayedStill: true, resourceSources: true });
  try {
    await f.start();
    assert.equal(f.requests.length, 0);
    f.releaseStill(); await f.settle();
    while (f.pending.size) await f.complete(f.pending.keys().next().value);
    assert.equal(f.requests.length, 5);
    assert.ok(f.requests.every(request => request.path.startsWith('https://preview.example.test/derived')));
    assert.equal(f.requests.filter(request => request.path.endsWith('/front.png.webp')).length, 1);
  } finally { f.dispose(); }
});

test('original and derived stills retain mode selection, and reveal reuses decoded portrait sources', async () => {
  const f = fixture({ resourceSources: true, darkMode: true, sharedReveal: true });
  try {
    assert.equal(f.still.src, 'https://preview.example.test/derived/rest-dark.png.webp');
    await f.start();
    while (f.pending.size) await f.complete(f.pending.keys().next().value);
    f.point(); await f.settle();
    while (f.pending.size) await f.complete(f.pending.keys().next().value);
    assert.equal(f.requests.filter(request => request.path.endsWith('/front.png.webp')).length, 1);
    f.document.documentElement.dataset.mode = 'light';
    f.observers[0].callback(); await f.settle();
    assert.equal(f.still.src, 'https://preview.example.test/derived/rest.png.webp');
  } finally { f.dispose(); }
  assert.ok(f.bitmaps.every(bitmap => bitmap.closed === 1));
});

test('first touch waits for reveal pixels, and leaving cancels that pending pulse', async () => {
  for (const leave of [false, true]) {
    const f = fixture();
    try {
      await f.start();
      f.point(); await f.settle();
      assert.equal(f.pulses(), 0);
      if (leave) f.wrapper.dispatchEvent(new Event('pointerleave'));
      while (f.pending.size) await f.complete(f.pending.keys().next().value);
      assert.equal(f.pulses(), leave ? 0 : 1);
    } finally { f.dispose(); }
  }
});

test('a completed touch survives its automatic pointerleave and expires after the decoded wave', async () => {
  for (const alreadyLoaded of [false, true]) {
    const f = fixture();
    const touch = type => f.wrapper.dispatchEvent(Object.assign(new Event(type), { pointerType: 'touch', clientX: 200, clientY: 200 }));
    try {
      await f.start();
      if (alreadyLoaded) {
        f.point(); await f.settle();
        while (f.pending.size) await f.complete(f.pending.keys().next().value);
      }
      touch('pointerdown'); touch('pointerup'); touch('pointerleave');
      f.document.dispatchEvent(Object.assign(new Event('pointerleave'), { pointerType: 'touch' }));
      await f.settle();
      const before = f.leaves();
      while (f.pending.size) await f.complete(f.pending.keys().next().value);
      assert.ok(f.pulses() > 0);
      assert.equal(f.leaves(), before);
      assert.equal(f.timers.size, 1);
      const previousTimer = [...f.timers.keys()][0];
      touch('pointerdown'); touch('pointerup'); touch('pointerleave');
      assert.equal(f.timers.has(previousTimer), false, 'a second tap replaces the previous expiry');
      assert.equal(f.timers.size, 1);
      const timer = [...f.timers.values()][0];
      assert.equal(timer.duration, 2, 'wave lifetime comes from the fixture token');
      timer.callback();
      assert.equal(f.leaves(), before + 1);
      assert.equal(f.timers.size, 0);
    } finally { f.dispose(); }
  }
});

test('scroll, cancellation and disposal cancel pending and already-visible released touches', async () => {
  for (const alreadyLoaded of [false, true]) for (const action of ['scroll', 'pointercancel', 'dispose']) {
    const f = fixture();
    try {
      await f.start();
      if (alreadyLoaded) {
        f.point(); await f.settle();
        while (f.pending.size) await f.complete(f.pending.keys().next().value);
      }
      f.point();
      f.wrapper.dispatchEvent(Object.assign(new Event('pointerup'), { pointerType: 'touch', clientX: 200, clientY: 200 }));
      const before = f.pulses();
      assert.equal(f.timers.size, alreadyLoaded ? 1 : 0);
      if (action === 'dispose') f.dispose();
      else f.window.dispatchEvent(new Event(action));
      await f.settle();
      while (f.pending.size) await f.complete(f.pending.keys().next().value);
      assert.equal(f.pulses(), before);
      assert.equal(f.timers.size, 0);
    } finally { f.dispose(); }
  }
});

test('disposal aborts pending work, closes late decoded pixels and removes both mounted canvases', async () => {
  const f = fixture();
  await f.start(); await f.complete('/front.png');
  assert.equal(f.bitmaps[0].closed, 0);
  const started = f.requests.length;
  f.dispose();
  assert.ok(f.requests.every(request => request.signal.aborted));
  assert.equal(f.bitmaps[0].closed, 1);
  assert.equal(f.frames.size, 0);
  assert.equal(f.stage.children.length + f.wrapper.children.length, 0);
  assert.ok(f.observers.every(observer => observer.disconnected));
  while (f.pending.size) await f.complete(f.pending.keys().next().value);
  assert.equal(f.requests.length, started, 'aborted workers never advance to another asset');
  assert.ok(f.bitmaps.every(bitmap => bitmap.closed === 1), 'a decoder finishing after disposal releases its bitmap');
  assert.ok(f.resets() > 0);
});

test('an invalid gaze token removes the reveal canvas as well as the portrait before returning', () => {
  const f = fixture({ invalidToken: true });
  assert.equal(f.canvases.length, 2, 'the failure occurs after both canvases were created');
  assert.equal(f.stage.children.length + f.wrapper.children.length, 0);
  assert.equal(f.requests.length, 0);
  assert.equal(f.frames.size, 0);
  f.dispose();
  assert.ok(f.observers.every(observer => observer.disconnected));
});


test('registered GPU renderer bypasses CPU sampling and releases its resources on disposal', async () => {
  const f = fixture({ gpuAvailable: true });
  await f.start();
  while (f.pending.size) await f.complete(f.pending.keys().next().value);
  assert.ok(f.gpuCalls.draws > 0);
  assert.equal(f.poseSamples.length, 0);
  f.dispose();
  assert.ok(f.gpuCalls.resets > 0);
  assert.equal(f.gpuCalls.destroys, 1);
});

test('a still inside Gazette\'s mode picture is left to its dark source', async () => {
  const f = fixture({ stillPicture: true, darkMode: true });
  try {
    assert.equal(f.still.src, 'https://example.test/rest.png');
    f.document.documentElement.dataset.mode = 'light';
    f.observers[0].callback(); await f.settle();
    assert.equal(f.still.src, 'https://example.test/rest.png');
  } finally { f.dispose(); }
});

test('a still swap outside a picture replaces its source set and restores it', async () => {
  const f = fixture({ stillSrcset: true, darkMode: true });
  try {
    assert.equal(f.still.src, '/rest-dark.png');
    assert.equal(f.still.getAttribute('srcset'), '/rest-dark.png');
    f.document.documentElement.dataset.mode = 'light';
    f.observers[0].callback(); await f.settle();
    assert.equal(f.still.src, '/rest.png');
    assert.equal(f.still.getAttribute('srcset'), '/rest-small.png 320w, /rest.png 640w');
  } finally { f.dispose(); }
});
