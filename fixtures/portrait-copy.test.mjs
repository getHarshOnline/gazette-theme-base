import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPortraitCopy, portraitCopyVisibility } from '../scripts/portrait-copy.js';

function fixture({ fixed = true, scroll = 0, headerHeight = 78, copyOffset = 126 } = {}) {
  const win = new EventTarget(), copy = new EventTarget();
  const values = new Map(), priorities = new Map(), observers = [];
  const state = { fixed, scroll, headerHeight, copyOffset };
  const header = { getBoundingClientRect: () => ({ bottom: state.headerHeight, height: state.headerHeight }) };
  const scene = { getBoundingClientRect: () => ({ top: -state.scroll }) };
  copy.getBoundingClientRect = () => ({ top: state.copyOffset - state.scroll });
  copy.style = {
    getPropertyValue: key => values.get(key) ?? '',
    getPropertyPriority: key => priorities.get(key) ?? '',
    setProperty: (key, value, priority = '') => { values.set(key, value); priorities.set(key, priority); },
    removeProperty: key => { values.delete(key); priorities.delete(key); },
  };
  const doc = { defaultView: win, querySelector: () => header };
  copy.ownerDocument = doc;
  Object.assign(win, {
    AbortController,
    getComputedStyle: () => ({ position: state.fixed ? 'fixed' : 'relative' }),
    scrollBy: ({ top, behavior }) => { assert.equal(behavior, 'instant'); state.scroll += top; },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
  });
  win.MutationObserver = win.ResizeObserver;
  const dispatch = name => win.dispatchEvent(new Event(name));
  const opacity = () => copy.style.getPropertyValue('--portrait-scroll-opacity');
  return { win, copy, scene, state, dispatch, opacity, observers };
}

test('masthead clearance fades identically in both scroll directions and clamps fast jumps', () => {
  const samples = [0, 12, 24, 36, 48, 300, 48, 36, 24, 12, 0];
  assert.deepEqual(samples.map(y => portraitCopyVisibility(126 - y, -y, 78)),
    [1, .75, .5, .25, 0, 0, 0, .25, .5, .75, 1]);
  assert.equal(portraitCopyVisibility(72, -12, 60), .5);
  assert.equal(portraitCopyVisibility(200, 0, 78), 1);
  assert.equal(portraitCopyVisibility(NaN, 0, 78), 1);
});

test('scroll clearance works without portrait assets and leaves hover state independent', () => {
  const env = fixture();
  env.copy.style.setProperty('--portrait-copy-opacity', '.4');
  const dispose = mountPortraitCopy(env.copy, env.scene);
  assert.equal(env.opacity(), '1');
  env.state.scroll = 24; env.dispatch('scroll');
  assert.equal(env.opacity(), '0.5');
  assert.equal(env.copy.style.getPropertyValue('--portrait-copy-opacity'), '.4');
  env.state.scroll = 200; env.dispatch('scroll'); assert.equal(env.opacity(), '0');
  env.state.scroll = 0; env.dispatch('scroll'); assert.equal(env.opacity(), '1');
  dispose();
});

test('normal-flow navigation stays readable and a later fixed navigation is measured', () => {
  const env = fixture({ fixed: false, scroll: 100 });
  const dispose = mountPortraitCopy(env.copy, env.scene);
  assert.equal(env.opacity(), '1');
  env.state.fixed = true; env.observers[1].callback(); assert.equal(env.opacity(), '0');
  env.state.fixed = false; env.dispatch('resize'); assert.equal(env.opacity(), '1');
  dispose();
});

test('resize remeasures clearance; print restores all text and returns to scroll state', () => {
  const env = fixture({ scroll: 12 });
  const dispose = mountPortraitCopy(env.copy, env.scene);
  assert.equal(env.opacity(), '0.75');
  env.state.headerHeight = 60; env.state.copyOffset = 84; env.observers[0].callback();
  assert.equal(env.opacity(), '0.5');
  env.dispatch('beforeprint'); assert.equal(env.opacity(), '1');
  env.dispatch('afterprint'); assert.equal(env.opacity(), '0.5');
  dispose();
});

test('keyboard entry restores the copy to its clear position before exposing its link', () => {
  const env = fixture({ scroll: 240 });
  const dispose = mountPortraitCopy(env.copy, env.scene);
  assert.equal(env.opacity(), '0');
  env.copy.dispatchEvent(new Event('focusin'));
  assert.equal(env.state.scroll, 0); assert.equal(env.opacity(), '1');
  dispose();
});

test('disposal restores previous styling and removes listeners and observers', () => {
  const env = fixture();
  env.copy.style.setProperty('--portrait-scroll-opacity', '.8', 'important');
  const dispose = mountPortraitCopy(env.copy, env.scene);
  dispose();
  assert.equal(env.opacity(), '.8');
  assert.equal(env.copy.style.getPropertyPriority('--portrait-scroll-opacity'), 'important');
  assert.ok(env.observers.every(observer => observer.disconnected));
  env.state.scroll = 100; env.dispatch('scroll');
  assert.equal(env.opacity(), '.8');
  env.copy.dispatchEvent(new Event('focusin')); assert.equal(env.state.scroll, 100);
  const absent = fixture(); const clear = mountPortraitCopy(absent.copy, absent.scene); clear();
  assert.equal(absent.opacity(), '');
});
