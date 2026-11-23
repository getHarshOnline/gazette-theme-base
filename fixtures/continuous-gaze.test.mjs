import test from 'node:test';
import assert from 'node:assert/strict';
import { ContinuousGaze, gazeFrame, gazeLayout, gazeLoadOrder } from '../scripts/continuous-gaze.js';

const p = { trackingRate: 6.5, idleRate: 3.5, scriptRate: 14, parallaxRate: 4,
  idleAfter: 4200, idleRamp: 2600, idleMajorAmplitude: .34, idleMinorAmplitude: .07,
  idleMajorFrequency: .55, idleMinorFrequency: 1.63, idlePhase: -.4,
  pointerMargin: .05, headClamp: .2, stepLimit: .05, lookTravelFirst: 900,
  lookHoldFirst: 1650, lookTravelSecond: 2900, lookHoldSecond: 3650, lookReturn: 4500 };

test('measured easing compensation preserves endpoints, continuity and direction', () => {
  const curve = [0, .01, .05, .2, .5, .8, .95, .99, 1];
  assert.equal(gazeFrame(-1, curve, .8), 0);
  assert.equal(gazeFrame(2, curve, .8), 8);
  assert.equal(gazeFrame(.5, curve, .8), 4);
  assert.ok(gazeFrame(.2, curve, .8) > .2 * 8, 'early turn compensates for the baked slow start');
  let previous = -1;
  for (let i = 0; i <= 1000; i++) {
    const value = gazeFrame(i / 1000, curve, .8);
    assert.ok(value >= previous && value - previous < 1.01);
    previous = value;
  }
});

test('progressive loading reaches every pose once, with a usable rest and extremes first', () => {
  const order = gazeLoadOrder(97);
  assert.deepEqual(order.slice(0, 3), [48, 0, 96]);
  assert.equal(order.length, 97);
  assert.equal(new Set(order).size, 97);
  assert.deepEqual([...order].sort((a,b) => a-b), Array.from({ length: 97 }, (_, i) => i));
});

test('direct input interrupts the look-around without resetting the occupied pose', () => {
  const gaze = new ContinuousGaze(p);
  gaze.lookAround(0); gaze.tick(0);
  for (let t = 16; t <= 1000; t += 16) gaze.tick(t);
  const before = gaze.value;
  assert.ok(before < .1);
  gaze.point(.95, .5, .5, 1000);
  assert.equal(gaze.script, null);
  assert.equal(gaze.value, before);
  gaze.tick(1016);
  assert.ok(gaze.value > before && gaze.value < 1);
  gaze.tick(100000);
  assert.ok(gaze.value < 1, 'a suspended frame cannot teleport to the target');
});

test('short phone and enlarged copy retain the whole measured head below the words', () => {
  const model = { width: 1920, height: 1080, geometry: {
    noseX: 940, headSpan: 1040, headHeight: 1080, landscapeAspect: 1.1,
    cropY: .28, portraitShare: .72, bottomAnchor: .94 } };
  for (const [width, height, copy] of [[390,700,300],[320,900,550],[430,932,400],[320,700,650]]) {
    const layout = gazeLayout(width,height,model,copy);
    assert.ok(layout.portrait);
    assert.ok(model.geometry.headSpan * layout.scale <= width);
    assert.ok(layout.y >= copy);
    assert.equal(layout.x + model.geometry.noseX * layout.scale, width / 2);
  }
});
