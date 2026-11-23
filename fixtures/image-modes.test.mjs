import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../scripts/image-modes.js', import.meta.url), 'utf8')
  .replace(/^export /gm, '');

function element(attributes) {
  const values = new Map(Object.entries(attributes));
  return {
    writes: 0,
    getAttribute: key => values.get(key) ?? null,
    hasAttribute: key => values.has(key),
    setAttribute(key, value) { this.writes++; values.set(key, String(value)); },
  };
}

function fixture(media) {
  const root = element({});
  const sources = [element({ 'data-gazette-image-mode': 'dark', media })];
  const listeners = {};
  const context = vm.createContext({
    document: { documentElement: root, querySelectorAll: selector => selector.includes('data-gazette-image-mode="dark"') ? sources : [] },
    window: { addEventListener: (type, handler) => { (listeners[type] ??= []).push(handler); } },
  });
  vm.runInContext(source, context);
  return { root, source: sources[0], listeners, context };
}

test('without a reader choice the emitted media stays, and is remembered once', () => {
  for (const media of ['(prefers-color-scheme: dark)', 'all', 'not all']) {
    const f = fixture(media);
    f.context.syncImageModes();
    assert.equal(f.source.getAttribute('media'), media);
    assert.equal(f.source.getAttribute('data-gazette-image-media'), media);
    assert.equal(f.source.writes, 1, 'only the original media is recorded; an unchanged media is not rewritten');
  }
});

test('an explicit choice overrides the starting mode, and System follows the operating system', () => {
  const f = fixture('all');
  for (const [mode, media] of [['light', 'not all'], ['dark', 'all'], ['system', '(prefers-color-scheme: dark)']]) {
    f.root.setAttribute('data-mode', mode);
    f.context.syncImageModes();
    assert.equal(f.source.getAttribute('media'), media, mode);
  }
  assert.equal(f.source.getAttribute('data-gazette-image-media'), 'all');
});

test('printing selects the default image and restores the dark source afterwards', () => {
  const f = fixture('(prefers-color-scheme: dark)');
  f.root.setAttribute('data-mode', 'dark');
  f.context.watchImageModes();
  f.context.watchImageModes();
  assert.equal(f.listeners.beforeprint.length, 1, 'watching twice installs one listener');
  assert.equal(f.source.getAttribute('media'), 'all');
  f.listeners.beforeprint[0]();
  assert.equal(f.source.getAttribute('media'), 'not all');
  f.listeners.afterprint[0]();
  assert.equal(f.source.getAttribute('media'), 'all');
});
