import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortraitGlyphs } from '../scripts/portrait-glyphs.js';

function fixture(run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const canvases = [];
  class Context {
    constructor() { this.text = []; this.draws = []; this.clears = 0; }
    setTransform() {} save() {} restore() {}
    fillText(...args) { this.text.push(args); }
    fillRect() {}
    clearRect() { this.clears++; this.draws = []; }
    drawImage(...args) { this.draws.push(args); }
  }
  globalThis.document = { createElement() {
    const context = new Context();
    const canvas = { width: 0, height: 0, getContext: () => context, context };
    canvases.push(canvas); return canvas;
  } };
  const renderer = createPortraitGlyphs(), output = new Context();
  const sample = { width: 4, height: 4, data: new Uint8ClampedArray(64) };
  for (let index = 0; index < sample.data.length; index += 4) sample.data.set([80, 80, 80, 255], index);
  const material = { cell: 3, ratio: 1, font: 'monospace', color: '#222222',
    fill: .72, ink: .88, bottomFade: .16, dark: false };
  const rect = { x: 10, y: 20, width: 12, height: 12 };
  try { run({ renderer, output, sample, material, rect, canvases }); }
  finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  }
}

test('stationary pose reuses its plate within a phase and changes only a staggered glyph subset as time advances', () => {
  fixture(({ renderer, output, sample, material, rect }) => {
    assert.equal(renderer.drawSample(output, sample, rect, material, 0), true);
    const plate = output.draws.at(-1)[0], atlas = plate.context.draws[0][0];
    const glyphs = plate.context.draws.map(draw => draw[1]);
    assert.equal(plate.context.clears, 1);
    renderer.drawSample(output, sample, rect, material, .1);
    assert.equal(plate.context.clears, 1, 'unchanged sample and phase bucket do not rebuild');
    renderer.drawSample(output, sample, rect, material, .3);
    assert.equal(plate.context.clears, 2, 'phase advances even while the sample object stays unchanged');
    const changed = plate.context.draws.filter((draw, index) => draw[1] !== glyphs[index]).length;
    assert.ok(changed > 0 && changed < glyphs.length, 'a subset of cells changes rather than the whole field flashing');
    assert.equal(atlas.context.text.length, 7, 'glyphs are drawn into the atlas once');
    assert.equal(plate.context.text.length, 0, 'plate updates use atlas stamps instead of per-cell fillText');
  });
});

test('placement reuses the plate, while a new sample or material invalidates bounded caches', () => {
  fixture(({ renderer, output, sample, material, rect, canvases }) => {
    renderer.drawSample(output, sample, rect, material, 0);
    const plate = output.draws.at(-1)[0], atlas = plate.context.draws[0][0], count = canvases.length;
    renderer.drawSample(output, sample, { ...rect, x: 30 }, material, 0);
    assert.equal(plate.context.clears, 1, 'moving a registered pair does not regenerate glyphs');
    assert.equal(output.draws.at(-1)[1], 30);
    renderer.drawSample(output, { ...sample }, rect, material, 0);
    assert.equal(plate.context.clears, 2, 'a new immutable pose snapshot is sampled');
    renderer.drawSample(output, sample, rect, { ...material, color: '#eeeeee', dark: true }, 0);
    assert.equal(plate.context.clears, 3);
    assert.equal(atlas.context.text.length, 14, 'changed material refreshes the existing atlas');
    assert.equal(canvases.length, count, 'updates retain one atlas and one sampled plate');
  });
});
