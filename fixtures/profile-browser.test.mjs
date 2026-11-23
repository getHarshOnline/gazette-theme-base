import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { listen } from './lib/serve.mjs';
import { main } from './profile.mjs';

test('browser profile records compressed delivery, redirects, cancellations and incomplete loads', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'base-profile-'));
  const compressed = brotliCompressSync(Buffer.from('body { font-family: sans-serif; }'));
  const server = await listen((request, response) => {
    if (request.url === '/redirect') { response.writeHead(302, { Location: '/' }); response.end(); }
    else if (request.url === '/style.css') {
      response.writeHead(200, { 'Content-Type': 'text/css', 'Content-Encoding': 'br', 'Content-Length': compressed.length });
      response.end(compressed);
    } else if (request.url === '/pending' || request.url === '/cancel') {
      response.writeHead(200, { 'Content-Type': 'text/plain' }); response.write('Partial response');
    } else if (request.url === '/broken') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><h1>Reading specimen</h1><img width="200" height="100" src="/missing">');
    } else if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css">
        <h1>A neutral loading specimen</h1><p>The page is readable while an optional request continues.</p>
        <script>fetch('/pending').then(r=>r.text()).catch(()=>{});
        const controller=new AbortController();fetch('/cancel',{signal:controller.signal}).then(r=>r.text()).catch(()=>{});
        setTimeout(()=>controller.abort(),100);</script>`);
    } else { response.writeHead(404); response.end('Not found'); }
  });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const { origin } = server;
  const output = join(directory, 'loading.json');
  const args = ['--out', output, '--profile', 'unthrottled', '--timeout-ms', '4000', '--settle-ms', '500', origin + '/redirect', origin + '/broken'];
  assert.equal(await main(args), 1);
  const report = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(report.runs.length, 2);
  const [good, broken] = report.runs;
  assert.equal(good.settled, true);
  assert.ok(good.lcp.timeMs > 0);
  assert.equal(good.lcp.tag, 'H1');
  assert.equal(good.summary.redirected, 1);
  assert.equal(good.summary.cancelled, 1);
  assert.equal(good.summary.pending, 1);
  assert.equal(good.summary.failed, 0);
  assert.equal(good.requests.find(row => row.url.endsWith('/style.css')).encoding, 'br');
  assert.equal(broken.settled, false);
  assert.equal(broken.summary.httpErrors, 1);
  assert.ok(broken.capture.pendingImages.some(url => url.endsWith('/missing')));
  await assert.rejects(main(args), /EEXIST/);
});
