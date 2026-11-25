import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { chromium } from 'playwright';

const worker = await readFile(new URL('../scripts/publication-worker.js', import.meta.url), 'utf8');
const client = await readFile(new URL('../scripts/page-cache-client.js', import.meta.url), 'utf8');
const digest = value => createHash('sha256').update(value).digest('hex');
const page = title => `<!doctype html><title>${title}</title><main>${title}</main>`;

test('the reading cache survives a fresh release and leaves live requests authoritative', { timeout: 45_000 }, async t => {
  const files = new Map([
    ['/first/', page('First')],
    ['/next/', page('Next')],
    ['/removed/', page('Old')],
    ['/reader/', '<!doctype html><main><a href="/next/">Next</a></main>'
      + '<span data-publication-worker="/service-worker.js"></span><script src="/cache-client.js"></script>'],
  ]);
  let mixed = false;
  let retired = false;
  let unavailable = false;
  let holdNext = false;
  const hits = [];
  const delivered = [];
  const server = createServer((request, reply) => {
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;
    hits.push(request.url);
    if (path === '/service-worker.js') {
      reply.setHeader('Content-Type', 'text/javascript');
      if (url.searchParams.has('denied')) {
        return reply.end(`Object.defineProperty(self, 'caches', {
          get() { throw new DOMException('Storage denied', 'SecurityError'); }
        });\n${worker}`);
      }
      return reply.end(worker);
    }
    if (path === '/cache-client.js') {
      reply.setHeader('Content-Type', 'text/javascript');
      return reply.end(client);
    }
    if (path === '/page-cache.json') {
      const pages = Object.fromEntries([...files].map(([route, body]) => [
        route, { bytes: Buffer.byteLength(body), sha256: digest(body) }
      ]));
      reply.setHeader('Content-Type', 'application/json');
      if (retired) return reply.end(JSON.stringify({ version: 1, retire: true }));
      return reply.end(JSON.stringify({
        version: 1, release: digest(JSON.stringify(pages)), pages,
        policy: { page_bytes: 1024, warm_bytes: 3072, storage_bytes: 4096, warm_pages: 3 },
      }));
    }
    reply.setHeader('Content-Type', 'text/html');
    if (holdNext && path === '/next/') return;
    if (unavailable && path === '/next/') {
      reply.statusCode = 503;
      reply.setHeader('Cache-Control', 'no-store');
      return reply.end(page('Unavailable'));
    }
    if (mixed && path === '/next/') return reply.end(page('Mixed edge'));
    if (files.has(path)) {
      const content = files.get(path);
      const etag = `"${digest(content)}"`;
      reply.setHeader('Cache-Control', 'public, max-age=60');
      reply.setHeader('ETag', etag);
      if (request.headers['if-none-match'] === etag) {
        delivered.push({ path, bytes: 0 });
        reply.statusCode = 304;
        return reply.end();
      }
      delivered.push({ path, bytes: Buffer.byteLength(content) });
      return reply.end(content);
    }
    reply.statusCode = 404;
    return reply.end(page('Not found'));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const transfer = async (label, visit) => {
    const start = delivered.length;
    await visit();
    const records = delivered.slice(start).filter(({ path }) => path === '/next/');
    const bytes = records.reduce((total, row) => total + row.bytes, 0);
    t.diagnostic(`${label}: ${records.length} origin request(s), ${bytes} HTML body bytes`);
    return bytes;
  };
  const reference = await browser.newContext({ serviceWorkers: 'block' });
  const standard = await reference.newPage();
  const openNext = (tab, title = 'Next') => async () => {
    await tab.goto(base + '/next/');
    assert.equal(await tab.title(), title);
  };
  const nextBytes = Buffer.byteLength(files.get('/next/'));
  assert.equal(await transfer('Worker off, cold', openNext(standard)), nextBytes);
  assert.equal(await transfer('Worker off, HTTP-warm', openNext(await reference.newPage())), 0);
  await reference.close();
  const register = async (context, script = '/service-worker.js') => {
    const tab = await context.newPage();
    await tab.goto(base + '/first/');
    await tab.evaluate(async url => {
      await navigator.serviceWorker.register(url);
      await navigator.serviceWorker.ready;
    }, script);
    await tab.waitForFunction(() => navigator.serviceWorker.controller);
    return tab;
  };
  const cold = await browser.newContext();
  await register(cold);
  assert.equal(await transfer('Worker on, cold', openNext(await cold.newPage())), nextBytes);
  await cold.close();

  const denied = await browser.newContext();
  const deniedPage = await register(denied, '/service-worker.js?denied');
  await openNext(deniedPage)();
  await denied.close();

  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  const nextCount = () => hits.filter(path => path === '/next/').length;
  const waitForNextCount = async count => {
    for (let attempt = 0; nextCount() < count && attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(nextCount(), count);
  };
  const initialCount = nextCount();
  holdNext = true;
  await reader.goto(base + '/reader/');
  await reader.waitForFunction(() => navigator.serviceWorker.controller);
  await waitForNextCount(initialCount + 1);
  await reader.evaluate(() => document.dispatchEvent(new Event('scroll')));
  holdNext = false;
  await waitForNextCount(initialCount + 2);
  await reader.waitForFunction(async () => {
    const entries = await (await caches.open('gazette-reading//')).keys();
    return entries.some(request => new URL(request.url).pathname === '/next/');
  });
  await readerContext.close();

  const context = await browser.newContext();
  const first = await register(context);
  const second = await context.newPage();
  const warm = () => first.evaluate(() => {
    navigator.serviceWorker.controller.postMessage({
      type: 'warm-reading-cache',
      candidates: [['/first/', 0], ['/next/', 1], ['/removed/', 3], ['/with-query/?q=one', 3]]
        .map(([url, priority]) => ({ url, priority })),
    });
  });
  const cached = () => first.evaluate(async () => {
    const cache = await caches.open('gazette-reading//');
    return (await cache.keys()).map(request => {
      const url = new URL(request.url);
      return [url.pathname, url.searchParams.get('gazette-content')];
    });
  });
  const until = async predicate => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail(JSON.stringify(await cached()));
  };
  const has = (route, hash) => until(async () =>
    (await cached()).some(([path, stored]) => path === route && stored === hash)
  );
  const warmStart = hits.length;
  await warm();
  await has('/next/', digest(files.get('/next/')));
  await has('/removed/', digest(files.get('/removed/')));
  const warmRequests = hits.slice(warmStart);
  assert.equal(warmRequests[0], '/page-cache.json');
  assert.ok(warmRequests.indexOf('/first/') < warmRequests.indexOf('/next/'), JSON.stringify(warmRequests));
  await has('/first/', digest(files.get('/first/')));
  assert.equal(hits.includes('/with-query/?q=one'), false);
  await first.goto(base + '/next/');
  await first.goBack({ waitUntil: 'commit' });
  assert.equal(await first.title(), 'First');
  await first.goForward({ waitUntil: 'commit' });
  assert.equal(await first.title(), 'Next');
  assert.equal(await transfer('Worker on, warm', openNext(second)), 0);
  await context.setOffline(true);
  await second.goto(base + '/next/');
  assert.equal(await second.title(), 'Next');
  await context.setOffline(false);

  // Wait out the descriptor's short foreground revalidation interval.
  await new Promise(resolve => setTimeout(resolve, 15_050));
  files.set('/next/', page('Next revision'));
  files.delete('/removed/');
  mixed = true;
  await second.goto(base + '/next/');
  assert.equal(await second.title(), 'Mixed edge');
  await until(async () => (await cached()).every(([path]) => path !== '/removed/'));
  assert.deepEqual((await cached()).filter(([path]) => path === '/next/'), []);
  assert.ok((await cached()).some(([path, hash]) => path === '/first/' && hash === digest(files.get('/first/'))));
  mixed = false;
  unavailable = true;
  assert.equal((await second.reload()).status(), 503);
  assert.equal(await second.title(), 'Unavailable');
  assert.deepEqual((await cached()).filter(([path]) => path === '/next/'), []);
  unavailable = false;
  await second.reload();
  assert.equal(await second.title(), 'Next revision');
  await has('/next/', digest(files.get('/next/')));
  const removed = await second.goto(base + '/removed/');
  assert.equal(removed.status(), 404);
  retired = true;
  await new Promise(resolve => setTimeout(resolve, 15_050));
  await second.goto(base + '/first/');
  await until(() => first.evaluate(async () => !(await navigator.serviceWorker.getRegistration())));
  assert.equal(await first.evaluate(async () => (await caches.keys()).includes('gazette-reading//')), false);
});
