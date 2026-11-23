import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { SEARCH_LIMITS } from '../scripts/search-limits.js';
import { SEARCH_MATCHING } from '../scripts/search-matching.js';

const source = readFileSync(new URL('../scripts/webmcp.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export function mountWebMcp', 'function mountWebMcp')
  .replaceAll("import('@base/webmcp')", 'Promise.resolve({ registerReadOnlyTools: globalThis.registerReadOnlyTools })')
  .replaceAll("import('@base/search-sdk')", 'Promise.resolve({ loadIndex: globalThis.loadIndex })');
const tick = () => new Promise(resolve => setImmediate(resolve));
const page = { content: { id: 'page:one', site: 'site:one', title: 'Public page' },
  route: { canonical_url: 'https://example.test/page/', url: 'https://example.test/page/' }, body_text: 'The authored explanation.' };
const data = tools => ({ binding: { contract: 'publication-webmcp-v1', tools }, currentPage: page,
  search: { url: 'https://example.test/retained-corpus.json', profile: 'english' } });

function fixture({ supported = true, deferRegistration = false, failRegistration = false } = {}) {
  const listeners = new Map(), registrations = [], loads = [], queries = [], warnings = [];
  const browser = {
    addEventListener(type, callback) { (listeners.get(type) || listeners.set(type, new Set()).get(type)).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    emit(type, detail = {}) { for (const callback of listeners.get(type) || []) callback({ type, ...detail }); }
  };
  const document = { defaultView: browser, ...(supported ? { modelContext: { registerTool() {} } } : {}) };
  const context = vm.createContext({ DOMException, SEARCH_LIMITS, SEARCH_MATCHING, console: { warn(message) { warnings.push(message); } },
    registerReadOnlyTools(actualDocument, configuration) {
      assert.equal(actualDocument, document);
      if (failRegistration) return Promise.reject(Object.assign(new Error('registration failed'), { code: 'webmcp_registration' }));
      const registration = { configuration, closed: false, close() { this.closed = true; } };
      registrations.push(registration);
      if (deferRegistration) return new Promise(resolve => { registration.finish = () => resolve(registration); });
      return Promise.resolve(registration);
    },
    loadIndex(url, configuration) {
      const load = { url, configuration };
      loads.push(load);
      return new Promise((resolve, reject) => {
        load.fail = () => reject(new Error('corpus unavailable'));
        load.finish = () => resolve({ search(query, options) { queries.push({ query, options }); return [{ record: page, score: 1 }]; } });
      });
    }
  });
  vm.runInContext(source, context);
  return { browser, registrations, loads, queries, listeners, warnings,
    mount: configuration => context.mountWebMcp(document, configuration),
    signal: () => new AbortController().signal };
}

test('without native document.modelContext the enhancement does nothing', () => {
  const f = fixture({ supported: false });
  assert.equal(f.mount(data(['current_page', 'search'])), null);
  assert.equal(f.loads.length, 0); assert.equal(f.registrations.length, 0); assert.equal(f.listeners.size, 0);
});
test('missing projection, wrong binding and invalid tool choices register nothing', () => {
  for (const configuration of [null, { ...data(['current_page']), currentPage: null },
    { ...data(['current_page']), binding: { contract: 'wrong', tools: ['current_page'] } },
    data([]), data(['subscribe']), data(['search', 'search']), { ...data(['search']), search: null }]) {
    const f = fixture(); assert.equal(f.mount(configuration), null); assert.equal(f.registrations.length, 0);
  }
});
test('only the selected current-page tool is offered and its native projection passes unchanged', async () => {
  const f = fixture(), controller = f.mount(data(['current_page'])); await controller.ready;
  const configuration = f.registrations[0].configuration;
  assert.deepEqual(Array.from(configuration.tools), ['current_page']); assert.equal(configuration.search, undefined);
  assert.equal(configuration.currentPage({ signal: f.signal() }), page); assert.equal(f.loads.length, 0);
  assert.equal(configuration.limits.maxConcurrent, 2); assert.equal(configuration.limits.maxResults, 20);
});
test('search registers without fetching, then uses the exact corpus URL/profile and existing SDK', async () => {
  const f = fixture(), controller = f.mount(data(['search'])); await controller.ready;
  const configuration = f.registrations[0].configuration;
  assert.equal(configuration.currentPage, undefined); assert.equal(f.loads.length, 0);
  const result = configuration.search('retained explanation', { limit: 3, signal: f.signal() });
  await tick(); assert.equal(f.loads.length, 1); assert.equal(f.loads[0].url, 'https://example.test/retained-corpus.json');
  assert.equal(f.loads[0].configuration.profile, 'english'); assert.equal(f.loads[0].configuration.allowNetwork, true);
  assert.equal(f.loads[0].configuration.maxBytes, SEARCH_LIMITS.maxBytes);
  f.loads[0].finish(); assert.deepEqual(await result, [{ record: page, score: 1 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.queries[0])), { query: 'retained explanation', options: { limit: 3, bool: 'AND', expand: true } });
});
test('concurrent calls share one acquisition and later calls reuse its captured index', async () => {
  const f = fixture(), controller = f.mount(data(['search'])); await controller.ready;
  const search = f.registrations[0].configuration.search;
  const first = search('one', { limit: 1, signal: f.signal() }), second = search('two', { limit: 2, signal: f.signal() });
  await tick(); assert.equal(f.loads.length, 1); f.loads[0].finish(); await Promise.all([first, second]);
  await search('three', { limit: 1, signal: f.signal() }); await tick(); assert.equal(f.loads.length, 1); assert.equal(f.queries.length, 3);
});
test('cancelled input starts no acquisition', async () => {
  const f = fixture(), controller = f.mount(data(['search'])); await controller.ready;
  const cancellation = new AbortController(); cancellation.abort();
  await assert.rejects(f.registrations[0].configuration.search('one', { limit: 1, signal: cancellation.signal }), { name: 'AbortError' });
  assert.equal(f.loads.length, 0);
});
test('cancellation during acquisition prevents ranking or returning a late result', async () => {
  const f = fixture(), controller = f.mount(data(['search'])); await controller.ready;
  const cancellation = new AbortController();
  const result = f.registrations[0].configuration.search('one', { limit: 1, signal: cancellation.signal });
  await tick(); cancellation.abort(); f.loads[0].finish(); await assert.rejects(result, { name: 'AbortError' }); assert.equal(f.queries.length, 0);
});
test('failed corpus acquisition is reported to the call and a later call may retry', async () => {
  const f = fixture(), controller = f.mount(data(['search'])); await controller.ready;
  const search = f.registrations[0].configuration.search;
  const first = search('one', { limit: 1, signal: f.signal() }); await tick(); f.loads[0].fail(); await assert.rejects(first, /unavailable/);
  const second = search('one', { limit: 1, signal: f.signal() }); await tick(); assert.equal(f.loads.length, 2); f.loads[1].finish(); await second;
});
test('pagehide closes registration; bfcache return registers once and keeps old callbacks closed', async () => {
  const f = fixture(), controller = f.mount(data(['current_page'])); await controller.ready;
  const first = f.registrations[0]; f.browser.emit('pagehide'); assert.equal(first.closed, true);
  assert.throws(() => first.configuration.currentPage({ signal: f.signal() }), { name: 'AbortError' });
  f.browser.emit('pageshow', { persisted: false }); assert.equal(f.registrations.length, 1);
  f.browser.emit('pageshow', { persisted: true }); f.browser.emit('pageshow', { persisted: true }); await tick();
  assert.equal(f.registrations.length, 2); assert.equal(f.registrations[1].closed, false);
  assert.equal(f.registrations[1].configuration.currentPage({ signal: f.signal() }), page);
});
test('late registration after leaving closes before a bfcache reentry registers again', async () => {
  const f = fixture({ deferRegistration: true }), controller = f.mount(data(['current_page']));
  await tick(); f.browser.emit('pagehide'); f.browser.emit('pageshow', { persisted: true });
  f.registrations[0].finish(); await tick(); assert.equal(f.registrations[0].closed, true); assert.equal(f.registrations.length, 2);
  f.registrations[1].finish(); await controller.ready; assert.equal(f.registrations[1].closed, false);
});
test('closing during acquisition prevents the result and removes lifecycle listeners', async () => {
  const f = fixture(), controller = f.mount(data(['search'])); await controller.ready;
  const result = f.registrations[0].configuration.search('one', { limit: 1, signal: f.signal() });
  await tick(); controller.close(); f.loads[0].finish(); await assert.rejects(result, { name: 'AbortError' });
  assert.equal(f.registrations[0].closed, true); assert.equal([...f.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
  f.browser.emit('pageshow', { persisted: true }); assert.equal(f.registrations.length, 1);
});
test('closing before registration settles closes its eventual handle', async () => {
  const f = fixture({ deferRegistration: true }), controller = f.mount(data(['current_page']));
  await tick(); controller.close(); f.registrations[0].finish(); await controller.ready; assert.equal(f.registrations[0].closed, true);
});
test('registration failure remains a failure rather than being called unsupported', async () => {
  const f = fixture({ failRegistration: true }), controller = f.mount(data(['current_page']));
  await assert.rejects(controller.ready, { code: 'webmcp_registration' }); controller.close();
});
