import test from 'node:test';
import assert from 'node:assert/strict';
import { mountAmbientVideo, mountAmbientSurface } from '../scripts/ambient-video.js';

function fixture({ reduce = false, reject = false, withToggle = true, initial = null, initialPosition = null, enhance, surface = false } = {}) {
  const originals = new Map();
  const install = (key, value) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); };
  class Node extends EventTarget {
    attrs = new Map(); hidden = false; children = [];
    setAttribute(key, value) { this.attrs.set(key, String(value)); }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    removeAttribute(key) { this.attrs.delete(key); if (key === 'src') this.src = ''; }
    append(node) { this.children.push(node); }
    remove() { this.removed = true; }
  }
  const wrapper = new Node(), element = new Node(), poster = new Node(), toggle = new Node(), pause = new Node(), play = new Node();
  toggle.hidden = true; play.hidden = true;
  toggle.querySelector = selector => selector === '[data-ambient-pause]' ? pause : play;
  wrapper.querySelector = () => withToggle ? toggle : null; element.closest = () => wrapper;
  if (initial !== null) wrapper.setAttribute('data-ambient-state', initial);
  if (initialPosition !== null) wrapper.setAttribute('data-ambient-position', initialPosition);
  let bounds = { top: 0, bottom: 700 }, measurements = 0, serial = 0;
  const frames = new Map();
  wrapper.getBoundingClientRect = () => { measurements++; return bounds; };
  install('innerHeight', 700);
  install('requestAnimationFrame', callback => { frames.set(++serial, callback); return serial; });
  install('cancelAnimationFrame', id => frames.delete(id));
  const win = new EventTarget(), doc = new EventTarget(), preference = new EventTarget();
  let created = 0, intersection, rejectPlay = reject, playCalls = 0, loadCalls = 0, pauseCalls = 0;
  const video = new Node(); video.currentTime = 0; video.duration = 10; video.src = '';
  video.load = () => { loadCalls++; if (video.src) { assert.equal(video.muted, true); assert.equal(video.defaultMuted, true); } };
  video.pause = () => { pauseCalls++; };
  video.play = () => { playCalls++; return rejectPlay ? Promise.reject(new Error('blocked')) : Promise.resolve(); };
  doc.createElement = name => { created++; assert.equal(name, 'video'); return video; };
  doc.documentElement = { dataset: {} }; doc.baseURI = 'https://example.test/prefix/'; doc.hidden = false;
  preference.matches = reduce;
  class IO { constructor(callback) { intersection = callback; } observe() {} disconnect() { this.disconnected = true; } }
  win.IntersectionObserver = IO;
  install('window', win); install('document', doc); install('IntersectionObserver', IO); install('matchMedia', () => preference);
  const dispose = (surface ? mountAmbientSurface : mountAmbientVideo)({ element, source: { href: 'https://example.test/prefix/media/film.mp4' }, poster, enhance });
  return { wrapper, video, element, created: () => created, toggle, pause, play, doc, preference, win, frames,
    bounds(value) { bounds = value; },
    measurements() { return measurements; },
    flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
    visible(value = true) { intersection([{ isIntersecting: value }]); },
    playing() { video.dispatchEvent(new Event('playing')); },
    click() { toggle.dispatchEvent(new Event('click')); },
    reject(value) { rejectPlay = value; },
    motion(value) { doc.documentElement.dataset.motion = value; doc.dispatchEvent(new Event('motion-preference')); },
    stats() { return { playCalls, loadCalls, pauseCalls }; },
    state() { return wrapper.getAttribute('data-ambient-state'); },
    dispose,
    restore() { dispose?.(); for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; },
  };
}

const settled = () => new Promise(resolve => queueMicrotask(resolve));

test('optional companion shares lifecycle and cannot break ambient playback on update or teardown',async()=>{
  let released=0, updates=0;
  const f=fixture({enhance:()=>({update(){updates++;throw Error('enhancement failed');},destroy(){released++;throw Error('teardown failed');}})});
  try{f.visible();await settled();f.playing();assert.equal(f.state(),'playing');assert.equal(updates,1);assert.equal(released,1);}
  finally{f.restore();}
});

test('source is attached only on eligible visibility; actual playing reveals the video', async () => {
  const f = fixture(); try {
    assert.equal(f.video.src, ''); assert.equal(f.stats().loadCalls, 0); assert.equal(f.state(), 'still');
    f.visible(); await settled();
    assert.equal(f.video.src, 'https://example.test/prefix/media/film.mp4');
    assert.equal(f.video.loop, true); assert.equal(f.video.playsInline, true); assert.equal(f.video.preload, 'none');
    assert.equal(f.wrapper.getAttribute('data-ambient-ready'), 'false');
    f.playing(); assert.equal(f.state(), 'playing'); assert.equal(f.toggle.hidden, false);
    assert.equal(f.pause.hidden, false); assert.equal(f.play.hidden, true);
  } finally { f.restore(); }
});

test('cold reduced preference acquires nothing and explicit allow uses the original clip', async () => {
  const f = fixture({ reduce: true }); try {
    f.visible(); assert.equal(f.video.src, ''); assert.equal(f.stats().playCalls, 0);
    assert.equal(f.wrapper.getAttribute('data-ambient-visible'), 'true');
    f.visible(false); assert.equal(f.wrapper.getAttribute('data-ambient-visible'), 'false'); f.visible();
    f.motion('allow'); await settled(); f.playing(); assert.equal(f.state(), 'playing');
    f.motion('reduce'); assert.equal(f.video.src, ''); assert.equal(f.state(), 'still'); assert.equal(f.toggle.hidden, true);
  } finally { f.restore(); }
});

test('offscreen and hidden pause; neither resumes an explicit reader pause', async () => {
  const f = fixture(); try {
    f.visible(); await settled(); f.playing(); f.click(); assert.equal(f.state(), 'paused');
    const calls = f.stats().playCalls;
    f.visible(false); f.visible(); f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange'));
    f.doc.hidden = false; f.doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(f.stats().playCalls, calls);
    f.click(); await settled(); f.playing(); assert.equal(f.state(), 'playing');
    f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(f.state(), 'paused');
    f.doc.hidden = false; f.doc.dispatchEvent(new Event('visibilitychange')); await settled(); f.playing(); assert.equal(f.state(), 'playing');
  } finally { f.restore(); }
});

test('autoplay rejection retains poster and provides supplied manual play control', async () => {
  const f = fixture({ reject: true }); try {
    f.visible(); await settled(); assert.equal(f.state(), 'paused');
    assert.equal(f.wrapper.getAttribute('data-ambient-ready'), 'false');
    assert.equal(f.toggle.hidden, false); assert.equal(f.play.hidden, false);
    const calls = f.stats().playCalls; f.visible(false); f.visible(); assert.equal(f.stats().playCalls, calls);
    f.reject(false); f.click(); await settled(); f.playing(); assert.equal(f.state(), 'playing');
  } finally { f.restore(); }
});

test('ambient playback needs no local control and keeps its poster when autoplay is rejected', async () => {
  for (const reject of [false, true]) {
    const f = fixture({ reject, withToggle: false }); try {
      f.visible(); await settled();
      if (reject) {
        assert.equal(f.wrapper.getAttribute('data-ambient-ready'), 'false');
        const calls = f.stats().playCalls;
        f.visible(false); f.visible();
        f.win.dispatchEvent(new Event('pageshow'));
        assert.equal(f.stats().playCalls, calls);
      } else {
        f.playing(); assert.equal(f.state(), 'playing');
        f.motion('reduce');
        assert.equal(f.video.src, '');
        assert.equal(f.wrapper.getAttribute('data-ambient-ready'), 'false');
        f.motion('allow'); await settled(); f.playing();
        assert.equal(f.state(), 'playing');
      }
    } finally { f.restore(); }
  }
});

test('print and bfcache suspension release media and restore its clock without starting in print', async () => {
  for (const [start, end] of [['beforeprint', 'afterprint'], ['pagehide', 'pageshow']]) {
    const f = fixture(); try {
      f.visible(); await settled(); f.playing(); f.video.currentTime = 4.25;
      f.win.dispatchEvent(new Event(start)); assert.equal(f.video.src, '');
      assert.equal(f.wrapper.getAttribute('data-ambient-ready'), 'false');
      const calls = f.stats().playCalls; f.visible(); assert.equal(f.stats().playCalls, calls);
      f.win.dispatchEvent(new Event(end)); await settled(); f.video.currentTime = 0;
      f.video.dispatchEvent(new Event('loadedmetadata')); assert.equal(f.video.currentTime, 4.25);
      f.playing(); assert.equal(f.state(), 'playing');
    } finally { f.restore(); }
  }
});

test('decode failure restores poster and never retries on unrelated lifecycle events', async () => {
  const f = fixture(); try {
    f.visible(); await settled(); f.playing(); f.video.dispatchEvent(new Event('error'));
    assert.equal(f.state(), 'error'); assert.equal(f.video.src, ''); assert.equal(f.toggle.hidden, true);
    const calls = f.stats().playCalls; f.visible(); f.win.dispatchEvent(new Event('pageshow'));
    assert.equal(f.stats().playCalls, calls);
  } finally { f.restore(); }
});

test('late playback while suspended cannot reveal or restart; disposal restores authored state', async () => {
  const f = fixture({ initial: 'native' }); try {
    f.visible(); f.motion('reduce'); await settled(); f.playing();
    assert.equal(f.state(), 'still'); assert.equal(f.wrapper.getAttribute('data-ambient-ready'), 'false');
    f.dispose(); const calls = f.stats().playCalls;
    f.motion('allow'); f.win.dispatchEvent(new Event('pageshow')); f.click(); await settled();
    assert.equal(f.stats().playCalls, calls); assert.equal(f.video.removed, true);
    assert.equal(f.state(), 'native'); assert.equal(f.wrapper.getAttribute('data-ambient-ready'), null);
    assert.equal(f.wrapper.getAttribute('data-ambient-visible'), null);
    assert.equal(f.toggle.hidden, true); assert.equal(f.play.hidden, true);
  } finally { f.restore(); }
});


test('scene departure and reverse scrolling report geometry without controlling playback', () => {
  const f = fixture(); try {
    assert.equal(f.wrapper.getAttribute('data-ambient-position'), 'within');
    for (const [top, bottom, expected] of [[800,1500,'before'],[700,1400,'before'],[1,701,'entering'],[0,700,'within'],[-1,699,'leaving'],[-700,0,'after'],[-100,600,'leaving'],[0,700,'within']]) {
      f.bounds({top,bottom}); f.win.dispatchEvent(new Event('scroll')); f.flush();
      assert.equal(f.wrapper.getAttribute('data-ambient-position'), expected);
    }
    assert.equal(f.stats().playCalls, 0, 'geometry does not bypass observed visibility');
    assert.equal(f.video.src, '');
    assert.equal(f.frames.size, 0, 'there is no continuing animation loop');
  } finally { f.restore(); }
});

test('reduced native geometry coalesces scroll/resize, survives print and restores on disposal', () => {
  const f = fixture({ reduce: true, initialPosition: 'authored' }); try {
    f.visible(); f.flush(); const reads = f.measurements();
    f.bounds({top:650,bottom:1350});
    for (let i=0;i<5;i++) f.win.dispatchEvent(new Event('scroll'));
    f.win.dispatchEvent(new Event('resize')); assert.equal(f.frames.size, 1);
    assert.equal(f.measurements(), reads);
    globalThis.innerHeight = 600; f.flush();
    assert.equal(f.wrapper.getAttribute('data-ambient-position'), 'before');
    assert.equal(f.measurements(), reads+1);
    globalThis.innerHeight = 800; f.win.dispatchEvent(new Event('resize')); f.flush();
    assert.equal(f.wrapper.getAttribute('data-ambient-position'), 'entering');
    assert.equal(f.stats().playCalls, 0); assert.equal(f.video.src, '');
    f.win.dispatchEvent(new Event('beforeprint')); f.flush();
    assert.equal(f.wrapper.getAttribute('data-ambient-position'), 'authored');
    f.bounds({top:-40,bottom:660}); f.win.dispatchEvent(new Event('afterprint')); f.flush();
    assert.equal(f.wrapper.getAttribute('data-ambient-position'), 'leaving');
    f.win.dispatchEvent(new Event('scroll')); assert.equal(f.frames.size, 1);
    f.dispose(); assert.equal(f.frames.size, 0);
    assert.equal(f.wrapper.getAttribute('data-ambient-position'), 'authored');
    f.win.dispatchEvent(new Event('resize')); f.flush();
    assert.equal(f.wrapper.getAttribute('data-ambient-position'), 'authored');
  } finally { f.restore(); }
});


test('quiet surface activates its companion without creating or acquiring foreground media', () => {
  const updates = [];
  let destroyed = 0, signal;
  const f = fixture({surface: true, enhance: context => {
    signal = context.signal;
    return {update: state => updates.push(state), destroy: () => destroyed++};
  }});
  try {
    assert.equal(f.created(), 0);
    assert.equal(f.element.children.length, 0);
    assert.equal(updates.at(-1).active, false);
    f.visible();
    assert.equal(f.state(), 'ready');
    assert.equal(f.wrapper.getAttribute('data-ambient-ready'), 'true');
    assert.equal(updates.at(-1).active, true);
    assert.deepEqual(f.stats(), {playCalls: 0, loadCalls: 0, pauseCalls: 0});
    f.visible(false); assert.equal(updates.at(-1).active, false);
    f.visible(); assert.equal(updates.at(-1).active, true);
    f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(updates.at(-1).active, false);
    f.doc.hidden = false; f.doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(updates.at(-1).active, true);
    for (const [stop, start] of [['beforeprint','afterprint'], ['pagehide','pageshow']]) {
      f.win.dispatchEvent(new Event(stop));
      assert.equal(updates.at(-1).active, false);
      assert.equal(updates.at(-1).unload, true);
      f.win.dispatchEvent(new Event(start)); assert.equal(updates.at(-1).active, true);
    }
    f.motion('reduce');
    assert.equal(f.wrapper.getAttribute('data-ambient-ready'), 'false');
    assert.equal(updates.at(-1).unload, true);
    f.motion('allow'); assert.equal(updates.at(-1).active, true);
    f.dispose();
    assert.equal(signal.aborted, true); assert.equal(destroyed, 1);
    assert.equal(f.wrapper.getAttribute('data-ambient-ready'), null);
    const count = updates.length;
    f.win.dispatchEvent(new Event('pageshow')); f.motion('reduce');
    assert.equal(updates.length, count);
  } finally { f.restore(); }
});

test('quiet surface respects cold reduced motion and survives unavailable enhancement', () => {
  const f = fixture({surface: true, reduce: true, enhance: () => {throw Error('unavailable');}});
  try {
    f.visible(); assert.equal(f.state(), 'still'); assert.equal(f.created(), 0);
    f.motion('allow'); assert.equal(f.state(), 'ready'); assert.equal(f.created(), 0);
  } finally { f.restore(); }
});
