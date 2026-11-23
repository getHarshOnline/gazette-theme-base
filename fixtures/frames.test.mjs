import assert from "node:assert/strict";
import { test } from "node:test";
import { createFrameSource } from "../scripts/frames.js";

const settle = () => new Promise(resolve => setImmediate(resolve));
const frames = ["arrival", "turn", "exit"].map(src => ({ src, width: 2, height: 2 }));
function rig(options = {}) {
  const requests = [], shown = [], errors = [], bitmaps = [];
  const source = createFrameSource({
    frames, budgetBytes: 32, concurrency: 2,
    onFrame: ({ bitmap, index, src }) => {
      assert.equal(bitmap.closed, false);
      shown.push({ index, src });
    },
    onError: result => errors.push(result),
    decode: (frame, signal) => new Promise((resolve, reject) => {
      requests.push({ frame, signal, reject, finish(width = frame.width) {
        const bitmap = { width, height: frame.height, closed: false, close() {
          assert.equal(this.closed, false, "a bitmap must be closed once");
          this.closed = true;
        } };
        bitmaps.push(bitmap);
        resolve(bitmap);
        return bitmap;
      } });
    }), ...options,
  });
  return { source, requests, shown, errors, bitmaps };
}

test("inactive sources do no work; exact identity is delivered once", async () => {
  const r = rig();
  r.source.setFrame(1);
  await settle();
  assert.equal(r.requests.length, 0);
  r.source.setActive(true);
  await settle();
  r.requests[0].finish();
  await settle();
  r.source.setFrame(1);
  assert.deepEqual(r.shown, [{ index: 1, src: "turn" }]);
  r.source.dispose();
  assert.ok(r.bitmaps.every(b => b.closed));
});

test("out-of-order completion cannot replace the requested moment", async () => {
  const r = rig();
  r.source.setActive(true);
  r.source.setFrame(0);
  await settle();
  r.source.setFrame(2);
  await settle();
  assert.ok(r.requests[0].signal.aborted);
  r.requests[1].finish();
  await settle();
  const stale = r.requests[0].finish();
  await settle();
  assert.ok(stale.closed);
  assert.deepEqual(r.shown, [{ index: 2, src: "exit" }]);
  r.source.dispose();
});

test("cancelled decodes still reserve memory; newest request wins after reversal", async () => {
  const r = rig({ budgetBytes: 16 });
  r.source.setActive(true);
  r.source.setFrame(0);
  await settle();
  r.source.setFrame(2);
  r.source.setFrame(1);
  await settle();
  assert.equal(r.requests.length, 1);
  r.requests[0].finish();
  await settle();
  assert.equal(r.requests.length, 2);
  assert.equal(r.requests[1].frame.src, "turn");
  r.requests[1].finish();
  await settle();
  assert.deepEqual(r.shown, [{ index: 1, src: "turn" }]);
  r.source.dispose();
});

test("concurrency remains bounded when cancelled decoders ignore abort", async () => {
  const r = rig({ budgetBytes: 48, concurrency: 1 });
  r.source.setActive(true);
  r.source.setFrame(0);
  await settle();
  r.source.setFrame(1);
  await settle();
  assert.equal(r.requests.length, 1);
  r.requests[0].finish();
  await settle();
  assert.equal(r.requests.length, 2);
  r.source.dispose();
  r.requests[1].finish();
  await settle();
  assert.ok(r.bitmaps.every(b => b.closed));
  assert.deepEqual(r.shown, []);
});

test("reversal uses cached frames; eviction releases the oldest pixels", async () => {
  const r = rig();
  r.source.setActive(true);
  for (const index of [0, 1]) {
    r.source.setFrame(index);
    await settle();
    r.requests[index].finish();
    await settle();
  }
  r.source.setFrame(0);
  assert.equal(r.requests.length, 2);
  r.source.setFrame(2);
  await settle();
  assert.equal(r.bitmaps[0].closed, false);
  assert.equal(r.bitmaps[1].closed, true);
  r.requests[2].finish();
  await settle();
  assert.deepEqual(r.shown.map(f => f.index), [0, 1, 0, 2]);
  r.source.dispose();
  assert.ok(r.bitmaps.every(b => b.closed));
});

test("suspension releases cached and late frames; resume requests exact frame", async () => {
  const r = rig();
  r.source.setActive(true);
  r.source.setFrame(0);
  await settle();
  const first = r.requests[0].finish();
  await settle();
  r.source.setFrame(1);
  await settle();
  r.source.setActive(false);
  assert.ok(first.closed);
  const late = r.requests[1].finish();
  await settle();
  assert.ok(late.closed);
  r.source.setActive(true);
  await settle();
  assert.equal(r.requests[2].frame.src, "turn");
  r.requests[2].finish();
  await settle();
  assert.deepEqual(r.shown.map(f => f.index), [0, 1]);
  r.source.dispose();
});

test("bad dimensions and failed fetch report identity without retry loops", async () => {
  const r = rig();
  r.source.setActive(true);
  r.source.setFrame(0);
  await settle();
  const wrong = r.requests[0].finish(3);
  await settle();
  assert.ok(wrong.closed);
  assert.equal(r.errors[0].index, 0);
  r.source.setFrame(0);
  await settle();
  assert.equal(r.requests.length, 1);
  r.source.setFrame(1);
  await settle();
  r.requests[1].reject(new Error("unavailable"));
  await settle();
  assert.equal(r.errors[1].src, "turn");
  assert.deepEqual(r.shown, []);
  r.source.dispose();
});

test("disposing inside delivery keeps the borrowed frame alive until return", async () => {
  let borrowed;
  const r = rig({ onFrame({ bitmap }) {
    borrowed = bitmap;
    r.source.dispose();
    assert.equal(bitmap.closed, false);
  } });
  r.source.setFrame(0);
  r.source.setActive(true);
  await settle();
  r.requests[0].finish();
  await settle();
  assert.ok(borrowed.closed);
  r.source.setActive(true);
  r.source.setFrame(1);
  await settle();
  assert.equal(r.requests.length, 1);
});

test("invalid or oversized dimensions fail before requesting bytes", () => {
  for (const dimensions of [{ width: 0, height: 2 }, { width: 3, height: 3 }, { width: 1.5, height: 2 }]) {
    assert.throws(() => rig({ frames: [{ src: "frame", ...dimensions }], budgetBytes: 32 }), RangeError);
  }
  assert.throws(() => rig({ concurrency: 0 }), RangeError);
  const r = rig();
  assert.throws(() => r.source.setFrame(3), RangeError);
  r.source.dispose();
});

test("a callback can select the next frame under a one-frame budget", async () => {
  const order = [];
  const r = rig({ budgetBytes: 16, onFrame({ bitmap, index }) {
    order.push(index);
    if (index === 0) r.source.setFrame(1);
    else r.source.setActive(false);
    assert.equal(bitmap.closed, false);
  } });
  r.source.setFrame(0);
  r.source.setActive(true);
  await settle();
  r.requests[0].finish();
  await settle();
  assert.ok(r.bitmaps[0].closed);
  assert.equal(r.requests[1].frame.src, "turn");
  r.requests[1].finish();
  await settle();
  assert.deepEqual(order, [0, 1]);
  assert.ok(r.bitmaps.every(b => b.closed));
  r.source.dispose();
});

test("the browser decoder checks cancellation again after receiving the blob", async () => {
  const originalFetch = globalThis.fetch;
  const originalBitmap = globalThis.createImageBitmap;
  let finishBody, decodes = 0;
  globalThis.fetch = async () => ({ ok: true, blob: () => new Promise(resolve => { finishBody = resolve; }) });
  globalThis.createImageBitmap = () => { decodes++; throw new Error("must not decode"); };
  const errors = [];
  const source = createFrameSource({ frames, budgetBytes: 16, concurrency: 1,
    onFrame: () => assert.fail("cancelled frame delivered"), onError: e => errors.push(e) });
  try {
    source.setFrame(0);
    source.setActive(true);
    await settle();
    source.setActive(false);
    finishBody({});
    await settle();
    assert.equal(decodes, 0);
    assert.deepEqual(errors, []);
  } finally {
    source.dispose();
    globalThis.fetch = originalFetch;
    if (originalBitmap === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = originalBitmap;
  }
});

test("continuous coalesced input finishes work and then decodes the latest position", async () => {
  const r = rig({ mode: "coalesced" });
  r.source.setActive(true);
  r.source.setFrame(0);
  await settle();
  for (const index of [1, 2, 1, 2]) r.source.setFrame(index);
  await settle();
  assert.equal(r.requests.length, 1);
  assert.equal(r.requests[0].signal.aborted, false);
  r.requests[0].finish();
  await settle();
  assert.deepEqual(r.shown.map(f => f.index), [0]);
  assert.equal(r.requests[1].frame.src, "exit");
  r.requests[1].finish();
  await settle();
  assert.deepEqual(r.shown.map(f => f.index), [0, 2]);
  r.source.dispose();
  assert.ok(r.bitmaps.every(b => b.closed));
});

test("coalesced reversal cannot let pending work overwrite a cached final position", async () => {
  const r = rig({ mode: "coalesced" });
  r.source.setActive(true);
  r.source.setFrame(0);
  await settle();
  r.requests[0].finish();
  await settle();
  r.source.setFrame(2);
  await settle();
  r.source.setFrame(0);
  r.requests[1].finish();
  await settle();
  assert.deepEqual(r.shown.map(f => f.index), [0, 2, 0]);
  assert.equal(r.requests.length, 2);
  r.source.setFrame(1);
  await settle();
  r.source.setActive(false);
  assert.ok(r.requests[2].signal.aborted);
  r.requests[2].finish();
  await settle();
  r.source.setActive(true);
  await settle();
  assert.equal(r.requests[3].frame.src, "turn");
  r.requests[3].finish();
  await settle();
  assert.equal(r.shown.at(-1).index, 1);
  r.source.dispose();
  assert.ok(r.bitmaps.every(b => b.closed));
});
