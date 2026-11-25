import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { listen } from './lib/serve.mjs';

test('a neutral page records named scrolls, vitals, and a Chrome trace', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'gazette-browser-performance-'));
  const server = await listen((request, response) => {
    if (request.url === '/waiting-image') {
      response.writeHead(200, { 'Content-Type': 'image/webp' });
      response.flushHeaders();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' });
    const search = request.url === '/search' ? `
      <section class="search-page">
        <form role="search"><input type="search" name="q"><button type="submit">Search</button></form>
        <ul class="search-page__results"></ul>
      </section>
      <script>
        document.querySelector('form').addEventListener('submit', event => {
          event.preventDefault();
          history.replaceState(null, '', '?q=' + encodeURIComponent(event.target.q.value));
          document.querySelector('ul').innerHTML = '<li><a href="/example/">New result</a></li>';
        });
      </script>` : '';
    response.end(`<!doctype html><meta name="viewport" content="width=device-width">
      <a href="#main">Skip to content</a><header><a href="#sample">Example</a></header>
      <main id="main" style="min-height:250vh"><h1>Example reading page</h1>
        <p id="sample">A long page provides a repeatable scroll edge.</p>
        ${request.url === '/late-media' ? '<img src="/waiting-image" width="120" height="120">' : ''}
        ${search}</main>`);
  });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const out = join(directory, 'report');
  const manifest = join(directory, 'plan.json');
  await writeFile(manifest, JSON.stringify({
    version: 2, timeoutMs: 2200, settleMs: 500, colorScheme: 'light',
    allowedOrigins: [server.origin],
    targets: [{ url: server.origin + '/', domain: 'sample.local', publication: 'sample',
      route: '/', kind: 'article' },
    { url: server.origin + '/late-media', domain: 'sample.local', publication: 'sample',
      route: '/late-media', kind: 'article' },
    { url: server.origin + '/search', domain: 'sample.local', publication: 'sample',
      route: '/search', kind: 'search', search: { query: 'Example', route: '/example/' } },
    { url: server.origin + '/search', domain: 'sample.local', publication: 'sample',
      route: '/missing-interaction', kind: 'search', search: { query: 'Example', route: '/missing/' } }],
    presentations: [{ id: 'mobile', width: 390, height: 844, mobile: true, touch: true, deviceScaleFactor: 1 }],
    networks: [{ id: 'unthrottled', cpu: 1, latency: 0, downloadKbps: null, uploadKbps: null }],
  }));
  await assert.rejects(promisify(execFile)(process.execPath, [
    new URL('./performance.mjs', import.meta.url).pathname, '--manifest', manifest, '--out', out, '--raw-trace',
  ]), { code: 1 });
  const { measurements: [row, late, searched, noSearch] } = JSON.parse(await readFile(join(out, 'measurements.json')));
  assert.ok(row.lcpMs > 0);
  assert.equal(row.cls, 0);
  assert.equal(row.capturePassed, true);
  assert.ok(row.encodedBytes > 0);
  assert.deepEqual(row.phases.map(item => item.label), ['Reading · scroll down', 'Reading · scroll back']);
  assert.ok(row.phases[0].movedPx > 0 && row.phases[1].movedPx < 0);
  assert.equal(late.capturePassed, false);
  assert.match(late.error, /Loading did not settle/);
  assert.ok(late.lcpMs > 0 && late.phases.length === 2);
  assert.equal(searched.capturePassed, true);
  assert.equal(searched.action.label, 'Search result');
  assert.equal(noSearch.capturePassed, false);
  assert.equal(noSearch.action, null);
  const compact = JSON.parse(await readFile(join(out, 'timeline.json')));
  assert.ok(compact.traceEvents.some(item => item.name === 'Largest contentful paint'));
  assert.ok(compact.traceEvents.some(item => item.name === 'Search result'));
  const saved = join(directory, 'regenerated.json');
  await promisify(execFile)(process.execPath, [
    new URL('./performance.mjs', import.meta.url).pathname,
    '--benchmark', join(out, 'measurements.json'), '--out', saved,
  ]);
  assert.equal(await readFile(saved, 'utf8'), await readFile(join(out, 'timeline.json'), 'utf8'));
  const raw = JSON.parse(gunzipSync(await readFile(join(out, row.trace))));
  assert.ok(raw.traceEvents.some(item => item.name === 'Reading · scroll back'));
});
