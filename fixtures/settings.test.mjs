import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const imageModesSource = readFileSync(new URL('../scripts/image-modes.js', import.meta.url), 'utf8')
  .replace(/^export /gm, '');
const settingsSource = imageModesSource + readFileSync(new URL('../scripts/settings.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export function mountSettings', 'function mountSettings');
const restoreSource = readFileSync(new URL('../templates/partials/preferences.html', import.meta.url), 'utf8')
  .replace(/<\/?script>/g, '');

function fixture({ scheme = 'light dark', stored = {}, blocked = false, media = '(prefers-color-scheme: dark)' } = {}) {
  const attributes = new Map();
  const storage = new Map(Object.entries(stored));
  const events = [];
  const root = {
    getAttribute: key => attributes.get(key) ?? null,
    hasAttribute: key => attributes.has(key),
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key)
  };
  const localStorage = Object.fromEntries(['getItem', 'setItem', 'removeItem'].map(method => [method, (key, value) => {
    if (blocked) throw new Error('Storage unavailable');
    if (method === 'getItem') return storage.get(key) ?? null;
    if (method === 'setItem') storage.set(key, value);
    else if (method === 'removeItem') storage.delete(key);
  }]));
  const groups = Object.fromEntries(Object.entries({
    'color-mode': ['system', 'light', 'dark'], 'motion-preference': ['system', 'reduce', 'allow']
  }).map(([key, values]) => [key, values.map(value => ({
    value, checked: false, handlers: {},
    addEventListener(type, handler) { this.handlers[type] = handler; }
  }))]));
  const status={textContent:'',getAttribute(){return 'Applies here; could not save.';}};
  const sourceAttributes = new Map([['data-gazette-image-mode', 'dark'], ['media', media]]);
  const source = {
    getAttribute: key => sourceAttributes.get(key) ?? null,
    hasAttribute: key => sourceAttributes.has(key),
    setAttribute: (key, value) => sourceAttributes.set(key, String(value))
  };
  const tenant = { querySelector(selector) {
    if(selector==='[data-settings-status]')return status;
    const key = selector.match(/data-setting="([^"]+)"/)?.[1];
    return key ? { querySelectorAll: () => groups[key] } : null;
  } };
  const context = vm.createContext({
    document: { documentElement: root, dispatchEvent: event => events.push(event), querySelectorAll: () => [source] },
    window: { localStorage, addEventListener() {} }, getComputedStyle: () => ({ colorScheme: scheme }),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  });
  vm.runInContext(restoreSource, context);
  vm.runInContext(settingsSource, context);
  context.mountSettings(tenant);
  return {
    root, storage, events, status, media: () => source.getAttribute('media'),
    selected: key => groups[key].find(input => input.checked)?.value,
    activate(key, value, type = 'change') {
      for (const input of groups[key]) input.checked = input.value === value;
      groups[key].find(input => input.value === value).handlers[type]();
    }
  };
}

test('opening a dark-first world reflects Dark without saving a choice', () => {
  const f = fixture({ scheme: 'dark' });
  assert.equal(f.selected('color-mode'), 'dark');
  assert.equal(f.root.getAttribute('data-mode'), null);
  assert.equal(f.storage.has('color-mode'), false);
  f.activate('color-mode', 'dark', 'click');
  assert.equal(f.storage.get('color-mode'), 'dark');
});

test('System persists as System across navigation, regardless of current scheme', () => {
  const f = fixture({ scheme: 'dark' });
  f.activate('color-mode', 'system');
  assert.equal(f.root.getAttribute('data-mode'), 'system');
  const next = fixture({ stored: Object.fromEntries(f.storage), scheme: 'light dark' });
  assert.equal(next.root.getAttribute('data-mode'), 'system');
  assert.equal(next.selected('color-mode'), 'system');
  assert.equal(next.events.length, 0);
});

test('light-first worlds remain unsaved System until a deliberate choice', () => {
  const f = fixture();
  assert.equal(f.selected('color-mode'), 'system');
  assert.equal(f.storage.size, 0);
  f.activate('color-mode', 'system', 'click');
  assert.equal(f.storage.get('color-mode'), 'system');
});

test('explicit modes restore, invalid modes do not; blocked storage keeps a local choice', () => {
  for (const mode of ['light', 'dark', 'system']) {
    const f = fixture({ stored: { 'color-mode': mode } });
    assert.equal(f.root.getAttribute('data-mode'), mode);
    assert.equal(f.selected('color-mode'), mode);
  }
  assert.equal(fixture({ stored: { 'color-mode': 'invalid' } }).root.getAttribute('data-mode'), null);
  const blocked = fixture({ blocked: true });
  blocked.activate('color-mode', 'light');
  assert.equal(blocked.root.getAttribute('data-mode'), 'light');
  assert.equal(blocked.storage.size, 0);
  assert.equal(blocked.status.textContent,'Applies here; could not save.');
});

test('motion retains its remove-on-System contract and emits only on change', () => {
  const f = fixture({ stored: { 'motion-preference': 'reduce' } });
  assert.equal(f.selected('motion-preference'), 'reduce');
  assert.equal(f.events.length, 0);
  f.activate('motion-preference', 'system');
  assert.equal(f.root.getAttribute('data-motion'), null);
  assert.equal(f.storage.has('motion-preference'), false);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].type, 'motion-preference');
  assert.equal(f.events[0].detail.motion, null);
});

test('a restored or changed colour mode moves image dark sources with it', () => {
  const restored = fixture({ stored: { 'color-mode': 'light' } });
  assert.equal(restored.media(), 'not all');
  restored.activate('color-mode', 'dark');
  assert.equal(restored.media(), 'all');
  restored.activate('color-mode', 'system');
  assert.equal(restored.media(), '(prefers-color-scheme: dark)');
  const pinned = fixture({ scheme: 'dark', media: 'all' });
  assert.equal(pinned.media(), 'all');
  pinned.activate('color-mode', 'system');
  assert.equal(pinned.media(), '(prefers-color-scheme: dark)', 'System follows the operating system, not the world starting mode');
});
