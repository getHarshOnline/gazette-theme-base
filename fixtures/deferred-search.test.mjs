import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/deferred-search.js', import.meta.url), 'utf8')
  .replace('export function', 'function').replace("import('@base/search')", 'loadModule()');
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const requests = [], activations = [], handlers = new Map();
  let focuses = 0, mounts = 0, deactivations = 0;
  const input = { focus() { focuses++; } };
  const status = { textContent: '', getAttribute: name => name };
  const retry = { hidden: true, addEventListener: (name, handler) => handlers.set(name, handler), removeEventListener: name => handlers.delete(name) };
  const tenant = { querySelector: selector => selector === 'input' ? input : selector === '[role="status"]' ? status : retry };
  const context = vm.createContext({ loadModule() { return new Promise((resolve, reject) => requests.push({
    reject, finish() { resolve({ mountSearch() { mounts++; return { activate: context => activations.push(context), deactivate() { deactivations++; } }; } }); }
  })); } });
  vm.runInContext(source, context);
  return { controller: context.mountDeferredSearch(tenant, {profile:'lexical'}, () => {}, () => {}), requests, activations, status, retry,
    retryLoad: () => handlers.get('click')?.(), get focuses() { return focuses; }, get mounts() { return mounts; }, get deactivations() { return deactivations; } };
}
test('opening focuses immediately and shares one deferred module acquisition', async () => {
  const f = fixture(); assert.equal(f.requests.length, 0);
  f.controller.activate({ restore: 'first' }); f.controller.activate({ restore: 'latest' });
  assert.equal(f.focuses, 2); assert.equal(f.requests.length, 1); assert.equal(f.status.textContent, 'data-status-loading');
  f.requests[0].finish(); await tick();
  assert.equal(f.mounts, 1); assert.deepEqual(f.activations, [{restore:'latest'}]);
});
test('closing or superseding history restoration cannot steal focus after loading', async () => {
  const f = fixture(); f.controller.activate(); f.controller.deactivate(); f.requests[0].finish(); await tick();
  assert.equal(f.activations.length, 0);
  f.controller.activate({restore:'return'}); assert.equal(f.activations.length, 1);
  f.controller.deactivate(); assert.equal(f.deactivations, 1);
  const g = fixture(); g.controller.activate({isCurrent:()=>false}); g.requests[0].finish(); await tick();
  assert.equal(g.activations.length, 0);
});
test('failure reports unavailability and the same Retry control starts a fresh attempt', async () => {
  const f = fixture(); f.controller.activate(); f.requests[0].reject(new Error('offline')); await tick();
  assert.equal(f.status.textContent, 'data-status-unavailable'); assert.equal(f.retry.hidden, false);
  f.retryLoad(); assert.equal(f.requests.length, 2); f.requests[1].finish(); await tick();
  assert.equal(f.mounts, 1); assert.equal(f.activations.length, 1);
});
