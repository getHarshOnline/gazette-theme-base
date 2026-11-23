import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/browser.mjs';
import { serve, open, seed, measure, frameProbe } from './pond-capture.mjs';

// Base's pond host in a real browser, on a page holding only Base's field styles
// and its neutral tokens. Base ships no fish engine; a stand-in engine shows the
// host's lifecycle, and the absent engine shows the search page without a pond.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const world = { name: 'base', css: join(root, 'tokens/base.css') };
const fixture = join(root, 'fixtures/pond-engine-fixture.mjs');

async function session(t, engine) {
  const server = await serve([world], engine);
  const browser = await launch();
  t.after(async () => { await browser.close(); await server.close(); });
  return { browser, options: { base: server.origin } };
}

async function mount(browser, options, { mode = 'light', motion = 'allow', viewport = 'desktop' } = {}) {
  const opened = await open(browser, options, world, mode, motion, viewport);
  await opened.page.addInitScript(seed);
  await opened.page.addInitScript(frameProbe);
  await opened.page.addInitScript(`window.__measure = (${measure});`);
  await opened.page.goto(opened.url);
  await opened.page.waitForFunction(() => window.__ready === true);
  return opened;
}

const frames = page => page.evaluate(() => window.__frames.length);
const settle = (page, ms) => page.waitForTimeout(ms);

test('without an engine the field stays empty and schedules nothing', { timeout: 30000 }, async t => {
  const { browser, options } = await session(t, null);
  const { context, page, requests } = await mount(browser, options);
  t.after(() => context.close());
  await settle(page, 400);
  assert.equal(await page.evaluate(() => window.__pond), null);
  assert.equal(await page.evaluate(() => document.querySelector('.search-page__field canvas')), null);
  assert.equal(await frames(page), 0);
  assert.deepEqual(requests.filter(url => !url.startsWith(options.base)), []);
});

test('the host runs one loop and stops it when paused, unseen or destroyed', { timeout: 60000 }, async t => {
  const { browser, options } = await session(t, fixture);
  const { context, page, requests } = await mount(browser, options);
  t.after(() => context.close());
  await page.waitForFunction(() => window.__measure()?.inked > 0.05);
  assert.deepEqual(requests.filter(url => !url.startsWith(options.base)), []);
  const running = await frames(page); await settle(page, 300);
  const perSecond = (await frames(page) - running) / 0.3;
  assert.ok(perSecond > 20 && perSecond < 260, `${perSecond} callbacks a second`);

  await page.evaluate(() => window.__pond.setPaused(true)); await settle(page, 100);
  let held = await frames(page); await settle(page, 300);
  assert.equal(await frames(page), held, 'a paused pond schedules no frames');
  await page.evaluate(() => window.__pond.setPaused(false)); await settle(page, 200);
  assert.ok(await frames(page) > held);

  await page.evaluate(() => { document.body.style.paddingBlockEnd = '4000px'; window.scrollTo(0, 3000); });
  await settle(page, 300); held = await frames(page); await settle(page, 300);
  assert.equal(await frames(page), held, 'an unseen pond schedules no frames');
  await page.evaluate(() => window.scrollTo(0, 0)); await settle(page, 300);
  assert.ok(await frames(page) > held);

  // The engine receives the backing size, capped at twice the CSS size.
  const sized = await page.evaluate(() => { const c = document.querySelector('.search-page__field canvas'); return [c.width, c.height]; });
  assert.deepEqual(sized, [1328 * 2, 820 * 2]);

  await page.evaluate(() => window.__pond.destroy()); await settle(page, 100);
  held = await frames(page); await settle(page, 300);
  assert.equal(await frames(page), held, 'a destroyed pond schedules no frames');
  assert.equal(await page.evaluate(() => document.querySelector('.search-page__field canvas')), null);
});

test('reduced motion paints one still, slows the pace and ignores scatter and nudge', { timeout: 30000 }, async t => {
  const { browser, options } = await session(t, fixture);
  const { context, page } = await mount(browser, options, { motion: 'reduce' });
  t.after(() => context.close());
  await settle(page, 300);
  await page.evaluate(() => { window.__pond.scatter(); window.__pond.nudge(); });
  await settle(page, 300);
  const state = await page.evaluate(() => ({ frames: window.__frames.length, ...window.__engine, ...window.__measure() }));
  assert.equal(state.frames, 0);
  assert.equal(state.steps, 0);
  assert.ok(state.renders >= 1);
  assert.equal(state.scatters + state.nudges, 0);
  assert.ok(state.inked > 0.05, 'the still is drawn');
});

test('dark mode reaches the engine', { timeout: 30000 }, async t => {
  const { browser, options } = await session(t, fixture);
  const { context, page } = await mount(browser, options, { mode: 'dark' });
  t.after(() => context.close());
  await settle(page, 200);
  assert.equal(await page.evaluate(() => window.__engine.theme), 'dark');
});
