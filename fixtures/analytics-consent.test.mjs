import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/analytics-consent.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export function mountAnalyticsConsent', 'function mountAnalyticsConsent');
const key = 'gazette:analytics:G-EXAMPLE';
class Element {
  constructor() { this.listeners = new Map(); this.hidden = true; this.textContent = ''; }
  addEventListener(name, action) { const group = this.listeners.get(name) || new Set(); group.add(action); this.listeners.set(name, group); }
  removeEventListener(name, action) { this.listeners.get(name)?.delete(action); }
  emit(type, detail = {}) { for (const action of this.listeners.get(type) || []) action({ type, target: this, ...detail }); }
}
function fixture({ saved, blocked = false, absent = false, invalid = false, bootstrap = false, usable = true, visibleTracking = false } = {}) {
  const storage = new Map(saved === undefined ? [] : [[key, saved]]);
  const browser = new Element(), status = new Element(), warning = new Element(), reload = new Element();
  let inaccessible = blocked, reloads = 0, creates = 0, grants = 0, withdrawals = 0;
  const localStorage = {
    getItem(name) { if (inaccessible) throw new Error('storage blocked'); return storage.get(name) ?? null; },
    setItem(name, value) { if (inaccessible) throw new Error('storage blocked'); storage.set(name, value); }
  };
  Object.defineProperty(browser, 'localStorage', { get() { if (inaccessible) throw new Error('storage blocked'); return localStorage; } });
  browser.location = { reload() { reloads++; } };
  const inputs = ['allow', 'decline'].map(value => Object.assign(new Element(), { value, checked: false }));
  const field = new Element();
  const binding = { textContent: JSON.stringify({ binding: { contract: invalid ? 'wrong' : 'publication-analytics-v1', measurement_id: 'G-EXAMPLE' }, publicPageUrl: 'https://example.test/article/', coordinates: { site: 'site:example', content: 'article:example' } }) };
  const children = { '[data-analytics-status]': status, '[data-analytics-storage]': warning, '[data-analytics-reload]': reload, '[data-analytics-binding]': binding };
  field.querySelector = selector => children[selector] || null;
  field.querySelectorAll = () => inputs;
  field.getAttribute = name => name.replace('data-status-', '');
  const tenant = { ownerDocument: { defaultView: browser }, querySelector: () => absent ? null : field };
  let state = { consent: 'withheld', tag: 'not-requested' }, settle, fail, pending;
  const events = [], submissions = [];
  const sdk = {
    status: () => ({ ...state }),
    event(name, coordinates) {
      assert.ok(['content_view', 'cta_click', 'intake_start', 'cross_site_navigate', 'cta_view'].includes(name));
      assert.equal(coordinates.site, 'site:example'); assert.equal(coordinates.content, 'article:example');
      assert.deepEqual(Object.keys(coordinates).sort(), (name === 'content_view' ? ['content', 'site'] : ['button', 'content', 'site']));
      if (state.consent === 'granted' && state.tag === 'loaded') { events.push(name); submissions.push({ name, coordinates: JSON.parse(JSON.stringify(coordinates)) }); }
    },
    grant() {
      grants++;
      assert.notEqual(state.consent, 'withdrawn', 'the UI must never regrant a withdrawn document');
      state.consent = 'granted';
      if (!pending) {
        state.tag = 'loading';
        pending = new Promise((resolve, reject) => {
          settle = () => { state.tag = 'loaded'; resolve(sdk.status()); };
          fail = () => { state.tag = 'failed'; reject(new Error('load failed')); };
        });
      }
      return pending;
    },
    withdraw() { withdrawals++; state.consent = 'withdrawn'; return sdk.status(); }
  };
  const document = new Element();
  document.readyState = 'loading';
  document.defaultView = browser;
  document.visibilityState = 'visible';
  tenant.ownerDocument = document;
  const anchors = [], observers = [];
  document.querySelectorAll = () => anchors;
  if (visibleTracking) {
    browser.IntersectionObserverEntry = class {};
    browser.IntersectionObserverEntry.prototype.isVisible = false;
    browser.IntersectionObserver = class {
      constructor(callback, options) { this.callback = callback; this.options = options; this.observed = new Set(); observers.push(this); }
      observe(anchor) { this.observed.add(anchor); }
      unobserve(anchor) { this.observed.delete(anchor); }
      disconnect() { this.observed.clear(); }
    };
  }
  let settingsReady = !bootstrap;
  document.querySelector = () => ({ querySelector: selector => ({
    'dialog': { showModal() {} },
    '[data-command-trigger="settings"]': { hidden: !usable || !settingsReady },
    '[data-tenant="settings"]': tenant
  })[selector] });
  const context = vm.createContext({ ...(bootstrap ? { document } : {}), createAnalytics(configuration, window) {
    creates++; assert.equal(window, browser);
    assert.deepEqual(JSON.parse(JSON.stringify(configuration)), { measurementId: 'G-EXAMPLE', publicPageUrl: 'https://example.test/article/' });
    return sdk;
  } });
  vm.runInContext(source, context);
  const controller = bootstrap ? null : context.mountAnalyticsConsent(tenant);
  return {
    browser, document, field, status, warning, reload, storage, controller, events, submissions, observers,
    openSettings() { settingsReady = true; document.emit('publication-shell-ready'); },
    anchor(button, kind = 'internal-native', { href = true, anchor = true } = {}) {
      const attributes = { 'data-enquiry-button': button, 'data-gazette-destination-kind': kind };
      const link = { hasAttribute: name => name === 'href' && href,
        getAttribute: name => { assert.notEqual(name, 'href', 'addresses must never be read for event data'); return attributes[name] ?? null; },
        closest: selector => { assert.equal(selector, 'a[data-enquiry-button]'); return anchor ? link : null; } };
      Object.defineProperty(link, 'textContent', { get() { assert.fail('link copy must not be read for event data'); } });
      anchors.push(link); return link;
    },
    click(anchor, detail = {}) { document.emit('click', { target: anchor, button: 0, defaultPrevented: false, ...detail }); },
    visibility(anchor, detail = {}) { observers.at(-1).callback([{ target: anchor, isIntersecting: true, intersectionRatio: 1, isVisible: true, ...detail }]); },
    get grants() { return grants; }, get creates() { return creates; }, get withdrawals() { return withdrawals; }, get reloads() { return reloads; },
    get selected() { return inputs.find(input => input.checked)?.value; },
    choose(value) { inputs.forEach(input => { input.checked = input.value === value; }); inputs.find(input => input.value === value).emit('change'); },
    async loaded() { settle(); await new Promise(resolve => setImmediate(resolve)); }, async failed() { fail(); await new Promise(resolve => setImmediate(resolve)); },
    block() { inaccessible = true; },
    storageEvent(detail = {}) { browser.emit('storage', { key, storageArea: localStorage, ...detail }); }
  };
}

test('absent or invalid bindings create no active analytics controls', () => {
  for (const options of [{ absent: true }, { invalid: true }]) {
    const f = fixture(options);
    assert.equal(f.controller, null); assert.equal(f.creates, 0); assert.equal(f.field.hidden, true);
    assert.equal(f.browser.listeners.size, 0);
  }
});
test('unknown, corrupt, declined and inaccessible storage withhold analytics', () => {
  for (const options of [{}, { saved: 'garbage' }, { saved: 'decline' }, { saved: 'allow', blocked: true }]) {
    const f = fixture(options);
    assert.equal(f.grants, 0); assert.equal(f.selected, 'decline'); assert.equal(f.status.textContent, 'off');
    assert.equal(f.field.hidden, false); assert.equal(f.events.length, 0);
  }
});
test('Allow saves its scoped choice and sends one content view only after loading', async () => {
  const f = fixture(); f.choose('allow'); f.choose('allow');
  assert.equal(f.storage.get(key), 'allow'); assert.equal(f.status.textContent, 'loading'); assert.equal(f.events.length, 0);
  await f.loaded(); assert.equal(f.events.length, 1); assert.equal(f.status.textContent, 'on');
  f.browser.emit('pageshow'); assert.equal(f.events.length, 1);
});
test('a saved grant works on a fresh document', async () => {
  const f = fixture({ saved: 'allow' }); assert.equal(f.grants, 1); await f.loaded(); assert.equal(f.events.length, 1);
});
test('Decline before any grant can be changed without reloading', async () => {
  const f = fixture(); f.choose('decline'); assert.equal(f.withdrawals, 0);
  f.choose('allow'); await f.loaded(); assert.equal(f.status.textContent, 'on');
});
test('withdrawing during loading prevents a late content view', async () => {
  const f = fixture(); f.choose('allow'); f.choose('decline'); await f.loaded();
  assert.equal(f.withdrawals, 1); assert.equal(f.events.length, 0); assert.equal(f.status.textContent, 'off');
  assert.equal(f.storage.get(key), 'decline');
});
test('regrant after withdrawal requires an explicit fresh-document action', async () => {
  const f = fixture(); f.choose('allow'); await f.loaded(); f.choose('decline'); f.choose('allow');
  assert.equal(f.grants, 1); assert.equal(f.reload.hidden, false); assert.equal(f.status.textContent, 'reload');
  assert.equal(f.reloads, 0); f.reload.emit('click'); assert.equal(f.reloads, 1);
  assert.equal(f.storage.get(key), 'allow');
});
test('unavailable storage cannot grant; withdrawing still works after storage fails', async () => {
  const f = fixture({ blocked: true }); f.choose('allow');
  assert.equal(f.grants, 0); assert.equal(f.warning.hidden, false); assert.equal(f.selected, 'decline');
  const active = fixture(); active.choose('allow'); await active.loaded(); active.block(); active.choose('decline');
  assert.equal(active.withdrawals, 1); assert.equal(active.status.textContent, 'off'); assert.equal(active.warning.hidden, false);
});
test('same-origin storage withdrawal, deletion and clearing stop active documents', async () => {
  for (const value of ['decline', undefined]) {
    const f = fixture({ saved: 'allow' }); await f.loaded();
    value ? f.storage.set(key, value) : f.storage.clear();
    f.storageEvent({ key: value ? key : null });
    assert.equal(f.withdrawals, 1); assert.equal(f.selected, 'decline'); assert.equal(f.status.textContent, 'off');
  }
});
test('unrelated storage events are ignored; returning from page cache rechecks consent', async () => {
  const f = fixture({ saved: 'allow' }); await f.loaded(); f.storage.clear();
  f.storageEvent({ key: 'other-setting' }); f.storageEvent({ storageArea: {} }); assert.equal(f.withdrawals, 0);
  f.browser.emit('pageshow'); assert.equal(f.withdrawals, 1);
});
test('tag failure reports that analytics stays off', async () => {
  const f = fixture(); f.choose('allow'); await f.failed();
  assert.equal(f.events.length, 0); assert.equal(f.status.textContent, 'failed');
});
test('disposing removes controls and listeners and stops an active controller', async () => {
  const f = fixture({ saved: 'allow' }); await f.loaded(); f.controller.dispose();
  assert.equal(f.withdrawals, 1); assert.equal(f.field.hidden, true);
  assert.equal([...f.browser.listeners.values()].reduce((count, group) => count + group.size, 0), 0);
  f.choose('allow'); assert.equal(f.grants, 1);
});


test('the standalone module waits for deferred Settings setup before restoring consent', async () => {
  const f = fixture({ saved: 'allow', bootstrap: true });
  assert.equal(f.creates, 0); f.openSettings();
  assert.equal(f.grants, 1); await f.loaded(); assert.equal(f.events.length, 1);
});
test('an unavailable Settings trigger prevents restoring a saved grant', () => {
  const f = fixture({ saved: 'allow', bootstrap: true, usable: false });
  f.openSettings(); assert.equal(f.creates, 0); assert.equal(f.field.hidden, true);
});

test('marked links emit nothing before consent or while loading, and never replay those clicks', async () => {
  const f = fixture(), link = f.anchor('services-link', 'cross-site');
  f.click(link); f.choose('allow'); f.click(link); assert.equal(f.events.length, 0);
  await f.loaded(); assert.deepEqual(f.events, ['content_view']);
  f.click(link);
  assert.deepEqual(f.events, ['content_view', 'cta_click', 'cross_site_navigate']);
  assert.deepEqual(f.submissions.slice(1), ['cta_click', 'cross_site_navigate'].map(name => ({ name,
    coordinates: { site: 'site:example', content: 'article:example', button: 'services-link' } })));
});
test('nested and keyboard clicks keep native navigation and send only fixed marker coordinates', async () => {
  const f = fixture(); f.choose('allow'); await f.loaded();
  const link = f.anchor('services-footer');
  f.click({ closest: selector => link.closest(selector) }, { detail: 0 });
  f.click({ parentElement: link });
  assert.deepEqual(f.events, ['content_view', 'cta_click', 'cta_click']);
  assert.deepEqual(f.submissions[1].coordinates, { site: 'site:example', content: 'article:example', button: 'services-footer' });
});
test('the marked email action emits intake_start without an address or cross-site event', async () => {
  const f = fixture(); f.choose('allow'); await f.loaded(); f.click(f.anchor('enquiry-email', 'cross-site'));
  assert.deepEqual(f.events, ['content_view', 'intake_start']);
  assert.equal(f.submissions[1].coordinates.button, 'enquiry-email');
});
test('prevented, nonprimary, unmarked, unknown and non-anchor interactions are ignored', async () => {
  const f = fixture(); f.choose('allow'); await f.loaded();
  const link = f.anchor('services-invitation');
  f.click(link, { defaultPrevented: true }); f.click(link, { button: 1 }); f.click(link, { button: 2 });
  f.click(f.anchor(undefined)); f.click(f.anchor('private-secret')); f.click(f.anchor('services-link', 'internal-native', { href: false }));
  f.click(f.anchor('services-link', 'internal-native', { anchor: false }));
  assert.deepEqual(f.events, ['content_view']);
});
test('tag failure, withdrawal and disposal prevent every marked-link submission', async () => {
  const failed = fixture(); failed.choose('allow'); await failed.failed(); failed.click(failed.anchor('services-link'));
  assert.deepEqual(failed.events, []);
  for (const stop of [f => f.choose('decline'), f => f.controller.dispose(), f => { f.storage.set(key, 'decline'); f.storageEvent(); }]) {
    const f = fixture(); f.choose('allow'); await f.loaded(); stop(f); f.click(f.anchor('services-link', 'cross-site'));
    assert.deepEqual(f.events, ['content_view']); assert.equal(f.document.listeners.get('click')?.size ?? 0, 0);
  }
});
test('views require native visibility tracking; ordinary IntersectionObserver support is insufficient', async () => {
  const f = fixture(); f.anchor('services-footer'); f.choose('allow'); await f.loaded();
  assert.equal(f.observers.length, 0); assert.deepEqual(f.events, ['content_view']);
});
test('views start after consent and require an actually visible intersecting link', async () => {
  const f = fixture({ visibleTracking: true }), link = f.anchor('services-invitation');
  assert.equal(f.observers.length, 0); f.choose('allow'); assert.equal(f.observers.length, 0); await f.loaded();
  assert.equal(f.observers.length, 1); assert.equal(f.observers[0].options.trackVisibility, true);
  assert.equal(f.observers[0].options.threshold, 0.5); assert.equal(f.observers[0].options.delay, 100);
  f.visibility(link, { isVisible: false }); f.visibility(link, { isIntersecting: false }); f.visibility(link, { intersectionRatio: 0.49 });
  f.document.visibilityState = 'hidden'; f.visibility(link); assert.deepEqual(f.events, ['content_view']);
  f.document.visibilityState = 'visible'; f.document.emit('visibilitychange'); f.visibility(link);
  assert.deepEqual(f.events, ['content_view', 'cta_view']); assert.equal(f.submissions[1].coordinates.button, 'services-invitation');
});
test('each marker receives at most one view per page, including duplicate links and tab return', async () => {
  const f = fixture({ visibleTracking: true }), first = f.anchor('services-link'), second = f.anchor('services-link');
  f.choose('allow'); await f.loaded(); f.visibility(first); f.visibility(second); f.visibility(first);
  f.browser.emit('pageshow'); f.document.emit('visibilitychange'); f.visibility(first);
  assert.deepEqual(f.events, ['content_view', 'cta_view']); assert.equal(f.observers[0].observed.size, 0);
});
test('withdrawal disconnects visibility observation and ignores already queued observations', async () => {
  const f = fixture({ visibleTracking: true }), link = f.anchor('services-footer');
  f.choose('allow'); await f.loaded(); const observer = f.observers[0]; f.choose('decline');
  assert.equal(observer.observed.size, 0); assert.equal(f.document.listeners.get('visibilitychange').size, 0);
  observer.callback([{ target: link, isIntersecting: true, intersectionRatio: 1, isVisible: true }]);
  assert.deepEqual(f.events, ['content_view']);
});
test('a browser refusing visibility tracking still keeps the consent state and clicks working', async () => {
  const f = fixture({ visibleTracking: true }); f.browser.IntersectionObserver = class { constructor() { throw new Error('not supported'); } };
  f.choose('allow'); await f.loaded(); f.click(f.anchor('services-link'));
  assert.equal(f.status.textContent, 'on'); assert.deepEqual(f.events, ['content_view', 'cta_click']);
});
