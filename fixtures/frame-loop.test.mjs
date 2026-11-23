import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameLoop } from '../scripts/frame-loop.js';

function clock() {
  const frames = new Map(), cancelled = [];
  let serial = 0;
  return { frames, cancelled,
    requestAnimationFrame(callback) { const id = serial++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { cancelled.push(id); frames.delete(id); },
    tick(now) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(now)); },
  };
}

test('requests coalesce, including frame zero, and keep the browser timestamp', () => {
  const win = clock(), times = [];
  const loop = createFrameLoop(now => times.push(now), { window: win });
  loop.request(); loop.request();
  assert.equal(win.frames.size, 1);
  win.tick(123.5);
  assert.deepEqual(times, [123.5]); assert.equal(win.frames.size, 0);
  loop.dispose();
});

test('the player requests continuation and retains its visibility cleanup', () => {
  const win = clock(); let visible = false, draws = 0, resets = 0;
  const loop = createFrameLoop(() => {
    if (!visible) { resets++; return; }
    draws++; return true;
  }, { window: win, eligible: () => visible });
  loop.request(); assert.equal(win.frames.size, 0);
  visible = true; loop.request(); win.tick(10);
  assert.equal(draws, 1); assert.equal(win.frames.size, 1);
  visible = false; win.tick(20);
  assert.equal(resets, 1); assert.equal(draws, 1); assert.equal(win.frames.size, 0);
  visible = true; loop.request(); win.tick(30); assert.equal(draws, 2);
  loop.dispose();
});

test('a cancelled delivery cannot draw or erase a newly requested frame', () => {
  const win = clock(); let draws = 0;
  const loop = createFrameLoop(() => { draws++; return true; }, { window: win });
  loop.request(); const late = [...win.frames.values()][0];
  loop.cancel(); assert.deepEqual(win.cancelled, [0]);
  loop.request(); late(10);
  assert.equal(draws, 0); assert.equal(win.frames.size, 1);
  win.tick(20); assert.equal(draws, 1); assert.equal(win.frames.size, 1);
  loop.dispose();
});

test('cancelling during a draw prevents continuation but permits a later restart', () => {
  const win = clock(); let draws = 0;
  const loop = createFrameLoop(() => { draws++; loop.cancel(); return true; }, { window: win });
  loop.request(); win.tick(10); assert.equal(win.frames.size, 0);
  loop.request(); win.tick(20); assert.equal(draws, 2); assert.equal(win.frames.size, 0);
  loop.dispose();
});

test('disposal during a draw is final, including a queued delivery and later requests', () => {
  const win = clock(); let draws = 0;
  const loop = createFrameLoop(() => { draws++; loop.dispose(); return true; }, { window: win });
  loop.request(); const late = [...win.frames.values()][0]; win.tick(10);
  loop.request(); late(20); loop.dispose();
  assert.equal(draws, 1); assert.equal(win.frames.size, 0);
});

test('a draw failure propagates without leaving a pending or automatic frame', () => {
  const win = clock(); let fail = true;
  const loop = createFrameLoop(() => { if (fail) throw Error('draw failed'); }, { window: win });
  loop.request(); assert.throws(() => win.tick(10), /draw failed/);
  assert.equal(win.frames.size, 0);
  fail = false; loop.request(); assert.equal(win.frames.size, 1); win.tick(20);
  loop.dispose();
});

test('cancelling one player leaves another player on its own clock', () => {
  const win = clock(), draws = [];
  const first = createFrameLoop(() => draws.push('first'), { window: win });
  const second = createFrameLoop(() => draws.push('second'), { window: win });
  first.request(); second.request(); first.cancel(); win.tick(10);
  assert.deepEqual(draws, ['second']); first.dispose(); second.dispose();
});
