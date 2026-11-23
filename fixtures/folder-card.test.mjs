import test from 'node:test';
import assert from 'node:assert/strict';
import { folderGeometry } from '../scripts/folder-card.js';

const tokens = { tab: .62, notch: .1, closed: .2, open: .54 };

test('folder has a continuous two-arc step at responsive sizes', () => {
  for (const width of [240, 360, 520]) {
    const height = width / .75;
    const shape = folderGeometry(width, height, 100, tokens);
    const r = width * .05, x = width * .62;
    assert.equal(shape.edge, `M0 0H${x-r}A${r} ${r} 0 0 1 ${x} ${r}A${r} ${r} 0 0 0 ${x+r} ${width*.1}H${width}`);
    assert.equal(shape.face, `${shape.edge}V${height}H0Z`);
  }
});

test('opening never exposes artwork beneath long copy', () => {
  for (const copyHeight of [80, 260, 480, 600]) {
    const shape = folderGeometry(360, 480, copyHeight, tokens);
    assert.ok(shape.open >= shape.closed);
    assert.ok(shape.open <= tokens.open);
    assert.ok(shape.open * 480 + 36 <= Math.max(36, 480-copyHeight));
  }
});

test('hidden or invalid geometry does not emit a broken mask', () => {
  for (const [w,h] of [[0,480],[360,0],[NaN,480],[360,Infinity]]) {
    assert.equal(folderGeometry(w,h,100,tokens), null);
  }
  assert.equal(folderGeometry(360,480,100,{...tokens,tab:1}),null);
  assert.equal(folderGeometry(360,480,100,{...tokens,open:.1}),null);
});
