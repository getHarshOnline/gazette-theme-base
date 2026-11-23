import test from 'node:test';
import assert from 'node:assert/strict';
import { milliseconds, timeToken } from '../scripts/css-time.js';
import { motionReduced } from '../scripts/motion-preference.js';
import { revealSettings } from '../scripts/surface-reveal.js';

test('explicit motion choices override either operating-system preference', () => {
  for (const system of [false, true]) {
    assert.equal(motionReduced('allow', system), false);
    assert.equal(motionReduced('reduce', system), true);
  }
});

test('system, absent and unrecognised motion choices follow the operating system', () => {
  for (const choice of ['system', undefined, null, '', 'unknown']) {
    assert.equal(motionReduced(choice, false), false);
    assert.equal(motionReduced(choice, true), true);
  }
});

test('CSS seconds and milliseconds retain the same duration at the browser boundary', () => {
  for (const [ms, seconds] of [['1500ms', '1.5s'], ['110ms', '.11s'], ['0ms', '0s'], ['-200ms', '-.2s']]) {
    assert.equal(milliseconds(ms), milliseconds(seconds));
  }
  assert.equal(milliseconds(' 1.5s '), 1500);
  assert.equal(milliseconds('2.6e3ms'), 2600);
});

test('unitless millisecond inputs used by native adapters remain supported', () => {
  assert.equal(milliseconds(350), 350);
  assert.equal(milliseconds('350'), 350);
});

test('missing, malformed and unrelated units cannot silently become animation times', () => {
  for (const value of ['', undefined, null, 'auto', 'NaN', 'Infinity', '2px', '1.5s junk', '1,5s']) {
    assert.ok(Number.isNaN(milliseconds(value)), String(value));
  }
});

test('token reads use the supplied computed style rather than a captured world or value', () => {
  let value = '1.5s';
  const style = { getPropertyValue(name) { assert.equal(name, '--duration'); return value; } };
  assert.equal(timeToken(style, '--duration'), 1500);
  value = '200ms';
  assert.equal(timeToken(style, '--duration'), 200);
});

test('portrait and video reveal physics are identical with either CSS duration unit', () => {
  const tokens = {
    '--layout-portrait-reveal-radius': '100', '--material-portrait-reveal-feather': '.4',
    '--material-portrait-reveal-deformation': '.12', '--layout-portrait-cell': '3',
    '--motion-portrait-reveal-life': '2000ms', '--motion-portrait-reveal-cycle': '5400ms',
  };
  const style = { getPropertyValue: name => tokens[name] };
  const expected = revealSettings(style);
  assert.equal(expected.life, 2);
  assert.equal(expected.cycle, 5.4);
  tokens['--motion-portrait-reveal-life'] = '2s';
  tokens['--motion-portrait-reveal-cycle'] = '5.4s';
  assert.deepEqual(revealSettings(style), expected);
  tokens['--motion-portrait-reveal-life'] = 'bad';
  assert.equal(revealSettings(style), null);
});
