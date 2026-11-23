import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { motionPreference } from '../scripts/motion-preference.js';

function fixture({ system = false, mediaAvailable = true } = {}) {
  const doc = new EventTarget(), media = new EventTarget();
  doc.documentElement = { dataset: {} }; media.matches = system;
  doc.defaultView = mediaAvailable ? { matchMedia(query) {
    assert.equal(this, doc.defaultView);
    assert.equal(query, '(prefers-reduced-motion: reduce)');
    return media;
  } } : {};
  return { doc, media, preference: motionPreference(doc) };
}

// Native event targets exercise both event sources and actual listener cleanup.
test('current reads honour explicit choices in both directions before subscribing', () => {
  const { doc, media, preference } = fixture();
  assert.equal(preference.reduced(), false);
  media.matches = true; assert.equal(preference.reduced(), true);
  doc.documentElement.dataset.motion = 'allow'; assert.equal(preference.reduced(), false);
  media.matches = false; doc.documentElement.dataset.motion = 'reduce'; assert.equal(preference.reduced(), true);
  doc.documentElement.dataset.motion = 'unknown'; assert.equal(preference.reduced(), false);
  assert.equal(getEventListeners(doc, 'motion-preference').length, 0);
  assert.equal(getEventListeners(media, 'change').length, 0);
});

test('settings and system changes keep event identity and do not synthesize an initial change', () => {
  const { doc, media, preference } = fixture();
  const received = [];
  const stop = preference.onMotionChange(event => received.push([event, preference.reduced()]));
  assert.deepEqual(received, []);
  const system = new Event('change'), explicit = new Event('motion-preference');
  media.matches = true; media.dispatchEvent(system);
  doc.documentElement.dataset.motion = 'allow'; doc.dispatchEvent(explicit);
  media.dispatchEvent(new Event('change'));
  assert.equal(received[0][0], system); assert.equal(received[1][0], explicit);
  assert.deepEqual(received.map(([, reduced]) => reduced), [true, false, false]);
  stop(); stop();
  doc.dispatchEvent(explicit); media.dispatchEvent(system);
  assert.equal(received.length, 3);
  assert.equal(getEventListeners(doc, 'motion-preference').length, 0);
  assert.equal(getEventListeners(media, 'change').length, 0);
});

test('disposal and abort remove only their own subscriptions and release the abort listener', () => {
  const { doc, media, preference } = fixture();
  const controller = new AbortController(), seen = [];
  const callback = () => seen.push(preference.reduced());
  const stop = preference.onMotionChange(callback, { signal: controller.signal });
  const other = preference.onMotionChange(callback);
  stop();
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  doc.dispatchEvent(new Event('motion-preference'));
  assert.equal(seen.length, 1);
  preference.onMotionChange(callback, { signal: controller.signal });
  controller.abort();
  media.dispatchEvent(new Event('change'));
  assert.equal(seen.length, 2);
  other();
  assert.equal(getEventListeners(doc, 'motion-preference').length, 0);
  assert.equal(getEventListeners(media, 'change').length, 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('an already aborted surface installs no listeners', () => {
  const { doc, media, preference } = fixture();
  const controller = new AbortController(); controller.abort();
  const stop = preference.onMotionChange(() => assert.fail('disposed listener ran'), { signal: controller.signal });
  doc.dispatchEvent(new Event('motion-preference')); media.dispatchEvent(new Event('change')); stop();
  assert.equal(getEventListeners(doc, 'motion-preference').length, 0);
  assert.equal(getEventListeners(media, 'change').length, 0);
});

test('a document without a media-query API still follows explicit settings', () => {
  const { doc, preference } = fixture({ mediaAvailable: false });
  let seen;
  assert.equal(preference.reduced(), false);
  const stop = preference.onMotionChange(() => { seen = preference.reduced(); });
  doc.documentElement.dataset.motion = 'reduce'; doc.dispatchEvent(new Event('motion-preference'));
  assert.equal(seen, true); stop();
});
