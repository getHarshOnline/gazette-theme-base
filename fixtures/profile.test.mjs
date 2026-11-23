import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { profileArguments, requestSummary, failedCapture } from './profile.mjs';

test('profile arguments require explicit targets and bounded measurement conditions', () => {
  const args = ['--out', '/tmp/loading.json', 'http://localhost:1234/'];
  assert.equal(profileArguments(args).network.cpu, 4);
  assert.equal(profileArguments([...args, '--profile', 'unthrottled']).network.cpu, 1);
  for (const extra of [['--repeat', '0'], ['--width', 'NaN'], ['--timeout-ms', '999999'],
    ['--mode', 'system'], ['--profile', 'unknown'], ['--out', '/tmp/other.json'], ['--unknown']])
    assert.throws(() => profileArguments([...args, ...extra]));
  assert.throws(() => profileArguments(['--out', '/tmp/a', 'file:///tmp/page.html']), /HTTP/);
  assert.throws(() => profileArguments(['--out', '/tmp/a', 'https://name:secret@example.test/']), /credentials/);
  assert.throws(() => profileArguments(args.slice(0, 2)), /at least one URL/);
  assert.throws(() => profileArguments([...args, '--timeout-ms', '1000']), /settle interval/);
  const runner = fileURLToPath(new URL('./profile.mjs', import.meta.url));
  assert.match(execFileSync(process.execPath, [runner, '--help'], { encoding: 'utf8' }), /No assets or responses are changed/);
});

test('request totals distinguish pending, cancellation, failure and partial transfer', () => {
  const summary = requestSummary([
    { state: 'completed', bytes: 500, bodyBytes: 400, status: 200 },
    { state: 'completed', bytes: 100, status: 404 },
    { state: 'redirected', bytes: 50, status: 302 },
    { state: 'cancelled', bodyBytes: 20 }, { state: 'pending', bodyBytes: 30 },
    { state: 'failed', bodyBytes: 10 },
  ]);
  assert.deepEqual(summary, { completed: 2, redirected: 1, pending: 1, cancelled: 1, failed: 1,
    httpErrors: 1, completedBytes: 650, partialBodyBytes: 60, assets: [{type:'unknown',mime:'unknown',requests:6,completedBytes:650,partialBodyBytes:60}] });
  const row = { settled: true, summary: { ...summary, failed: 0, httpErrors: 0 }, pageErrors: [] };
  assert.equal(failedCapture(row), false);
  assert.ok(failedCapture({ ...row, settled: false }));
  assert.ok(failedCapture({ ...row, truncated: true }));
  assert.ok(failedCapture({ ...row, summary }));
});
