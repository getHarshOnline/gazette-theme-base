import { canvasSize } from '../scripts/canvas-size.js';
import { observeInView } from '../scripts/in-view.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { clamp } from '../scripts/clamp.js';
import { motionPreference } from '../scripts/motion-preference.js';

const source = readFileSync(new URL('../scripts/portrait-frames.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replaceAll('export function ', 'function ');
function fixture({ reduced = false, fine = true, width = 500, height = 500, density = 1, cap = 2 } = {}) {
  const timers = new Map(), events = {}, pointerEvents = {}, classes = new Set(), draws = [], sources = [];
  let timerId = 0, intersect, onResize, fail = false;
  const preferences = { matches: reduced, addEventListener() {}, removeEventListener() {} };
  const pointer = { matches: fine, addEventListener() {} };
  const transforms = [];
  const context2d = { setTransform(...values) { transforms.push(values); }, fillRect() {}, drawImage() {} };
  const canvas = { setAttribute() {}, getContext: () => context2d, remove() {} };
  const stage = { querySelector: () => ({}), append() {}, getBoundingClientRect: () => ({ width, height }) };
  const wrapper = { querySelector: () => stage,
    classList: { add: n => classes.add(n), remove: n => classes.delete(n) },
    getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 500, width: 1000 }),
    addEventListener: (name, fn) => { pointerEvents[name] = fn; } };
  const document = { documentElement: { dataset: {} }, hidden: false,
    createElement: () => canvas, addEventListener: (name, fn) => { events[name] = fn; }, removeEventListener: (name, fn) => { if (events[name] === fn) delete events[name]; } };
  class IntersectionObserver { constructor(fn) { intersect = fn; } observe() {} disconnect() {} }
  class ResizeObserver { constructor(fn) { onResize = fn; } observe() {} disconnect() {} }
  const environment = {
    clamp, motionPreference, observeInView, canvasSize, document, window: { createImageBitmap() {}, IntersectionObserver, ResizeObserver },
    IntersectionObserver, ResizeObserver, AbortController, innerHeight: 900, devicePixelRatio: density,
    getComputedStyle: () => ({ getPropertyValue: () => String(cap) }),
    matchMedia: query => query.includes('reduced') ? preferences : pointer,
    addEventListener: (name, fn) => { events[name] = fn; },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    createFrameSource({ onFrame, onError }) {
      let active = false, wanted, disposed = false;
      function deliver() {
        if (!active || disposed || wanted === undefined) return;
        if (fail) { onError({}); return; }
        draws.push(wanted); onFrame({ index: wanted, bitmap: {} });
      }
      const source = { setFrame(i) { wanted = i; deliver(); }, setActive(v) { active = v; deliver(); },
        dispose() { disposed = true; }, get disposed() { return disposed; } };
      sources.push(source); return source;
    },
  };
  document.defaultView = environment.window; environment.window.matchMedia = environment.matchMedia;
  const context = vm.createContext(environment); vm.runInContext(source, context);
  const cleanup = context.mountPortrait(wrapper, { rest: 2, holds: [[0, 3], [7, 10]], enterLeft: .44,
    enterRight: .56, holdFps: 150, transitionFps: 20, width: 1000, height: 500, cacheFrames: 4,
    figure: { centerX: 500, width: 500, height: 500 }, edgeColor: '#fff', frames: [] });
  intersect([{ isIntersecting: true }]);
  return {
    draws, sources, classes, timers, cleanup, canvas, transforms,
    move(x) { pointerEvents.pointermove({ clientX: x * 1000, pointerType: 'mouse' }); },
    event(name) { events[name](); },
    hidden(value) { document.hidden = value; events.visibilitychange(); },
    motion(value) { document.documentElement.dataset.motion = value; events['motion-preference'](); },
    resize() { onResize(); }, failNext() { fail = true; },
    tick() { const first = timers.entries().next().value; if (!first) return false; timers.delete(first[0]); first[1](); return true; },
    drain() { let i = 0; while (this.tick()) assert.ok(++i < 100, 'animation must settle'); },
  };
}

test('continuous pointer input does not postpone the first frame, and crosses every transition frame', () => {
  const f = fixture();
  for (let i = 0; i < 200; i++) f.move(.9);
  assert.equal(f.timers.size, 1);
  assert.ok(f.tick()); assert.equal(f.draws.at(-1), 3);
  f.drain(); assert.deepEqual(f.draws, [2,3,4,5,6,7,8,9]);
  assert.equal(f.timers.size, 0, 'no autonomous loop at rest');
});

test('mid-transition reversal reaches an open resting pose without queued travel', () => {
  const f = fixture(); f.move(.9); f.tick(); f.tick();
  f.move(.1); f.drain();
  assert.deepEqual(f.draws, [2,3,4,3,2,1]);
});

test('reduced motion and coarse pointer never acquire animated frames', () => {
  for (const opts of [{ reduced: true }, { fine: false }]) {
    const f = fixture(opts); f.move(.9); f.drain();
    assert.equal(f.sources.length, 0); assert.equal(f.classes.size, 0);
  }
});

test('hidden, print and preference suspension restore the durable image and dispose decoding', () => {
  const f = fixture(); f.move(.9); f.tick(); f.hidden(true);
  assert.equal(f.classes.size, 0); assert.equal(f.timers.size, 0); assert.ok(f.sources.at(-1).disposed);
  f.hidden(false); assert.equal(f.draws.at(-1), 2);
  f.event('beforeprint'); assert.equal(f.classes.size, 0); assert.ok(f.sources.at(-1).disposed);
  f.event('afterprint'); f.motion('reduce'); assert.equal(f.classes.size, 0);
  f.cleanup(); assert.equal(f.timers.size, 0);
});

test('a failed requested frame leaves the static portrait usable without retrying forever', () => {
  const f = fixture(); f.move(.9); f.failNext(); f.tick();
  assert.equal(f.classes.size, 0); assert.ok(f.sources.at(-1).disposed);
  f.move(.8); f.drain(); assert.equal(f.timers.size, 0);
});


test('geometry-only resize preserves the occupied pose and pointer target', () => {
  const f = fixture(); f.move(.9); f.tick(); f.tick();
  assert.equal(f.draws.at(-1), 4); f.resize();
  assert.equal(f.draws.at(-1), 4); f.drain();
  assert.equal(f.draws.at(-1), 9);
});


test('fractional portrait sizes retain nearest-pixel rounding, density cap and CSS-space transform', () => {
  for (const [density, cap, ratio, expected] of [[3,2,2,[251,162]], [1.25,2,1.25,[157,101]], [0,0,1,[125,81]]]) {
    const f = fixture({ width:125.25, height:80.75, density, cap });
    try {
      assert.deepEqual([f.canvas.width,f.canvas.height], expected);
      assert.deepEqual(f.transforms.at(-1), [ratio,0,0,ratio,0,0]);
      f.resize(); assert.deepEqual([f.canvas.width,f.canvas.height], expected);
    } finally { f.cleanup(); }
  }
});
