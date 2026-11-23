import test from 'node:test';
import assert from 'node:assert/strict';
import { poseWeights, samplePose } from '../scripts/portrait-poses.js';

const buffer = (width, height, pixel) => ({ width, height, data: Uint8ClampedArray.from(
  Array.from({ length: width * height }, (_, index) => pixel(index % width, Math.floor(index / width))).flat()),
});
const rectangle = (width, height) => ({
  points: { front: [[0, 0], [width, 0], [width, height], [0, height]] },
  triangles: [[0, 1, 2], [0, 2, 3]],
});
const pixel = (image, x, y = 0) => [...image.data.slice((y * image.width + x) * 4, (y * image.width + x + 1) * 4)];

test('cardinal weights form a continuous normalized L1 envelope with at most three sources', () => {
  assert.deepEqual(poseWeights(), [{ pose: 'front', weight: 1 }]);
  assert.deepEqual(poseWeights(-.25, -.25), [
    { pose: 'front', weight: .5 }, { pose: 'left', weight: .25 }, { pose: 'up', weight: .25 },
  ]);
  assert.deepEqual(poseWeights(1, 1), [{ pose: 'right', weight: .5 }, { pose: 'down', weight: .5 }]);
  assert.deepEqual(poseWeights(2, 0), [{ pose: 'right', weight: 1 }]);
  assert.deepEqual(poseWeights(NaN, 0), [{ pose: 'front', weight: 1 }]);
  for (let x = -2; x <= 2; x += .125) for (let y = -2; y <= 2; y += .125) {
    const weights = poseWeights(x, y);
    assert.ok(weights.length <= 3 && weights.every(entry => entry.weight > 0));
    assert.ok(Math.abs(weights.reduce((sum, entry) => sum + entry.weight, 0) - 1) < 1e-12);
  }
});

test('identity registration preserves pixel centres and has no diagonal triangle seam', () => {
  const front = buffer(3, 2, (x, y) => [x * 70, y * 120, 20, 255]);
  const image = samplePose(rectangle(3, 2), { front }, { width: 3, height: 2 });
  assert.deepEqual(image.data, front.data);
  const reversed = rectangle(3, 2); reversed.triangles.forEach(triangle => triangle.reverse());
  assert.deepEqual(samplePose(reversed, { front }, { width: 3, height: 2 }).data, front.data);
});

test('three cardinal sources mix in one registered geometry and clamp at diagonal limits', () => {
  const model = rectangle(2, 2); model.points.right = model.points.front; model.points.down = model.points.front;
  const sources = {
    front: buffer(2, 2, () => [0, 0, 255, 255]),
    right: buffer(2, 2, () => [255, 0, 0, 255]),
    down: buffer(2, 2, () => [0, 255, 0, 255]),
  };
  assert.deepEqual(pixel(samplePose(model, sources, { x: .25, y: .25, width: 2, height: 2 }), 0), [64, 64, 128, 255]);
  assert.deepEqual(pixel(samplePose(model, sources, { x: .75, y: .75, width: 2, height: 2 }), 0), [128, 128, 0, 255]);
});

test('shifted source features meet at one interpolated landmark instead of ghosting', () => {
  const model = {
    points: {
      front: [[0, 0], [1.5, 0], [5, 0], [0, 3], [1.5, 3], [5, 3]],
      right: [[0, 0], [3.5, 0], [5, 0], [0, 3], [3.5, 3], [5, 3]],
    }, triangles: [[0, 1, 4], [0, 4, 3], [1, 2, 5], [1, 5, 4]],
  };
  const front = buffer(5, 3, x => [x === 1 ? 255 : 0, 0, 0, 255]);
  const right = buffer(5, 3, x => [x === 3 ? 255 : 0, 0, 0, 255]);
  const image = samplePose(model, { front, right }, { x: .5, width: 5, height: 3 });
  assert.deepEqual(pixel(image, 2, 1), [255, 0, 0, 255]);
  assert.ok(pixel(image, 1, 1)[0] < 128 && pixel(image, 3, 1)[0] < 128);
  assert.deepEqual(pixel(samplePose(model, { front, right }, { x: 1, width: 5, height: 3 }), 3, 1), [255, 0, 0, 255]);
});

test('a fixed registration plane removes authored translation at every gaze weight', () => {
  const model = rectangle(5, 3);
  model.points.right = model.points.front.map(([x,y])=>[x+2,y]);
  model.target = model.points.front;
  const front = buffer(5,3,x=>[x===1?255:0,0,0,255]);
  const right = buffer(5,3,x=>[x===3?255:0,0,0,255]);
  for(const x of [0,.25,.5,.75,1]) {
    const image=samplePose(model,{front,right},{x,width:5,height:3});
    assert.deepEqual(pixel(image,1,1),[255,0,0,255]);
    assert.deepEqual(pixel(image,3,1),[0,0,0,255]);
  }
});

test('pose and bilinear interpolation both premultiply alpha before mixing colours', () => {
  const model = rectangle(1, 1); model.points.right = model.points.front;
  const front = buffer(1, 1, () => [255, 0, 0, 255]);
  const right = buffer(1, 1, () => [0, 0, 255, 0]);
  assert.deepEqual(pixel(samplePose(model, { front, right }, { x: .5, width: 1, height: 1 }), 0), [255, 0, 0, 128]);
  const source = buffer(2, 1, x => x ? [0, 0, 255, 0] : [255, 0, 0, 255]);
  assert.deepEqual(pixel(samplePose(rectangle(2, 1), { front: source }, { width: 1, height: 1 }), 0), [255, 0, 0, 128]);
});

test('uncovered pixels retain front while covered pixels use the registered pose', () => {
  const model = { points: { front: [[0, 0], [2, 0], [0, 2]], right: [[0, 0], [2, 0], [0, 2]] }, triangles: [[0, 1, 2]] };
  const front = buffer(4, 2, () => [255, 0, 0, 255]), right = buffer(4, 2, () => [0, 0, 255, 255]);
  const image = samplePose(model, { front, right }, { x: 1, width: 4, height: 2 });
  assert.deepEqual(pixel(image, 0), [0, 0, 255, 255]);
  assert.deepEqual(pixel(image, 3, 1), [255, 0, 0, 255]);
});

test('invalid topology, missing buffers and collapsing interpolated triangles fail safely', () => {
  const front = buffer(2, 2, () => [80, 90, 100, 255]), valid = rectangle(2, 2);
  const mutations = [
    model => { model.points.right = [[0, 0]]; },
    model => { model.triangles[0][0] = 9; },
    model => { model.triangles[0] = [0, 0, 2]; },
    model => { model.points.front[0][0] = NaN; },
    model => { model.points.right = [[0, 0], [0, 2], [2, 2], [2, 0]]; },
  ];
  for (const mutate of mutations) {
    const model = structuredClone(valid); mutate(model);
    assert.equal(samplePose(model, { front }, { width: 2, height: 2 }), null);
  }
  assert.equal(samplePose(valid, { front }, { x: 1, width: 2, height: 2 }), null);
  assert.equal(samplePose(valid, { front }, { width: 0, height: 2 }), null);
  const collapse = { points: { front: [[0, 0], [2, 0], [0, 2]], right: [[2, 2], [0, 2], [2, 0]] }, triangles: [[0, 1, 2]] };
  assert.equal(samplePose(collapse, { front, right: front }, { x: .5, width: 2, height: 2 }), null);
});

test('sampling is deterministic and does not mutate model or source pixels', () => {
  const model = rectangle(3, 2), original = structuredClone(model);
  const front = buffer(3, 2, (x, y) => [x * 80, y * 90, 10, 255]), bytes = front.data.slice();
  const first = samplePose(model, { front }, { width: 5, height: 4 });
  const second = samplePose(model, { front }, { width: 5, height: 4 });
  assert.deepEqual(first, second); assert.deepEqual(model, original); assert.deepEqual(front.data, bytes);
});
