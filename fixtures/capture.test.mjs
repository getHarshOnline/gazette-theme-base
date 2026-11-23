import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { captureArguments, comparison } from './capture.mjs';

const runner = fileURLToPath(new URL('./capture.mjs', import.meta.url));
const row = { url: 'http://localhost:1234/reading/', width: 390, state: 'light',
  ctx: 'web', route: 'system', js: true, capture: '/reference/one.png', problems: [] };

test('comparison pairs exact conditions and discloses absent reference and current cells', () => {
  const other = { ...row, state: 'dark', capture: '/current/two.png' };
  const result = comparison([row], [other], '/reference/cells.json', '/current/cells.json', '/current');
  assert.match(result, /No reference cell for these conditions/);
  assert.match(result, /Reference cells absent from this run/);
  for (const changed of [{ captureScope: 'viewport' }, { env: { viewport: [390, 844] } }]) {
    const unmatched = comparison([row], [{ ...row, ...changed }], '/a', '/b', '/c');
    assert.match(unmatched, /No reference cell/);
  }
  const paired = comparison([row], [{ ...row, capture: '/current/one.png', problems: ['<failure>'] }],
    '/reference/cells.json', '/current/cells.json', '/current');
  assert.match(paired, /src="..\/reference\/one.png"/);
  assert.match(paired, /&lt;failure&gt;/);
  const absent = comparison([{ ...row, capture: undefined, problems: ['Reference failed'] }], [row], '/a', '/b', '/c');
  assert.match(absent, /reference run did not capture an image/);
  assert.match(absent, /Reference failed/);
  const unknownViewport = comparison([{ ...row, capture: undefined, problems: ['Original measurement failed'] }],
    [{ ...row, env: { viewport: [390, 244] } }], '/a', '/b', '/c');
  assert.match(unknownViewport, /Reference findings: Original measurement failed/);
  assert.throws(() => comparison([row, row], [], '/a', '/b', '/c'), /duplicate baseline/);
});

test('capture uses this package browser and retained URLs, preserves failure and refuses stale output', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'base-capture-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const baseline = join(dir, 'baseline.json'), profile = join(dir, 'profile.json');
  const tool = join(dir, 'tool.mjs'), output = join(dir, 'run');
  writeFileSync(baseline, JSON.stringify([row]));
  writeFileSync(profile, '{}');
  writeFileSync(tool, `import {writeFileSync} from 'node:fs';
    import {join} from 'node:path';
    const args=process.argv.slice(2), out=args[args.indexOf('--out')+1];
    writeFileSync(join(out,'invocation.json'), JSON.stringify({args,browser:process.env.PLAYWRIGHT_MODULE}));
    writeFileSync(join(out,'cells.json'), ${JSON.stringify(JSON.stringify([{ ...row, problems: ['known defect'] }]))});
    process.exitCode=1;`);
  const args = [runner, '--tool', tool, '--profile', profile, '--baseline', baseline, '--out', output];
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: tmpdir(), env: { ...process.env, PLAYWRIGHT_MODULE: '/wrong/browser' } });
  assert.equal(run.status, 1);
  const invocation = JSON.parse(readFileSync(join(output, 'invocation.json')));
  assert.equal(invocation.browser, fileURLToPath(import.meta.resolve('playwright')));
  assert.equal(typeof (await import(pathToFileURL(invocation.browser).href)).chromium.launch, 'function');
  assert.equal(invocation.args.at(-1), row.url);
  assert.match(readFileSync(join(output, 'comparison.html'), 'utf8'), /known defect/);
  const repeat = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(repeat.status, 1);
  assert.match(repeat.stderr, /fresh capture directory/);
});

test('missing required values fail before launching a browser', () => {
  assert.throws(() => captureArguments(['--tool']), /missing value/);
  assert.throws(() => captureArguments(['--tool', '/a']), /pass --profile/);
  assert.match(execFileSync(process.execPath, [runner, '--help'], { encoding: 'utf8' }), /Native animation stays enabled/);
});
