import test from 'node:test';
import assert from 'node:assert/strict';
import { observeInView } from '../scripts/in-view.js';

function fixture(options = {}) {
  const element = {}, received = [], instances = [];
  const win = { IntersectionObserver: class {
    constructor(callback, settings) { this.callback = callback; this.settings = settings; this.disconnects = 0; instances.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnects++; }
  } };
  const stop = observeInView(element, value => received.push(value), { window: win, ...options });
  return { element, received, observer: instances[0], stop };
}

test('observing keeps the supplied window and options and synthesizes no initial state', () => {
  const f = fixture({ threshold: 0.4, rootMargin: '20px' });
  assert.equal(f.observer.target, f.element);
  assert.deepEqual(f.observer.settings, { threshold: 0.4, rootMargin: '20px' });
  assert.deepEqual(f.received, []);
  f.observer.callback([{ isIntersecting: true }]);
  f.observer.callback([{ isIntersecting: false }]);
  assert.deepEqual(f.received, [true, false]);
  f.stop();
});

test('each consumer retains its first-entry or any-entry batch interpretation', () => {
  const batch = [{ isIntersecting: false }, { isIntersecting: true }];
  const any = fixture(), first = fixture({ firstEntry: true });
  any.observer.callback(batch); first.observer.callback(batch);
  assert.deepEqual(any.received, [true]);
  assert.deepEqual(first.received, [false]);
  any.stop(); first.stop();
});

test('unsupported observation requires the consumer capability guard and invents no visible state', () => {
  let visible = true;
  assert.throws(() => observeInView({}, value => { visible = value; }, { window: {} }), TypeError);
  assert.equal(visible, true);
});

test('disposal disconnects once and ignores already queued delivery', () => {
  const f = fixture();
  f.stop(); f.stop();
  f.observer.callback([{ isIntersecting: true }]);
  assert.equal(f.observer.disconnects, 1);
  assert.deepEqual(f.received, []);
});

test('disposing one surface leaves another observer active', () => {
  const first = fixture(), second = fixture();
  first.stop();
  second.observer.callback([{ isIntersecting: true }]);
  assert.deepEqual(second.received, [true]);
  assert.equal(second.observer.disconnects, 0);
  second.stop();
});
