#!/usr/bin/env node
/** Capture the Search pond on its own, per world, for side-by-side review and timing. */
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './lib/browser.mjs';
import { listen } from './lib/serve.mjs';

const help = `node fixtures/pond-capture.mjs --out DIR [--world NAME=TOKENS.css[,FONT.woff2]]... [--only stills,video,perf] [--viewports desktop,phone] [--entry scripts/search-pond.js] [--engine FILE]

Mounts scripts/search-pond.js on a page holding only Base's field styles and one world's
token stylesheet, in light and dark, full and reduced motion. Base ships no fish engine, so
pass --engine with the workspace's engine module to serve it in place of shared/pond-engine.mjs.
Stills run under Playwright's fake clock, paused before the page loads, with seeded randomness,
so two runs of the same engine give the same frames.
Videos run in real time. The timing pass reports module import and mount time, time to the
first painted pond, and animation-frame callback cost, unthrottled on desktop and with 4x
CPU throttling on the phone. Without --world, Base's neutral tokens/base.css is used.
Pass the system face (for example Martian Mono) when the world names one, so glyphs match
the published page. Install the browser first: npx playwright install chromium.
`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const viewports = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, surface: [1328, 820] },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, surface: [358, 700], isMobile: true, hasTouch: true },
};

export function pondArguments(args) {
  const options = { worlds: [], only: ['stills', 'video', 'perf'], viewports: Object.keys(viewports) };
  for (let i = 0; i < args.length; i++) {
    const key = args[i], value = args[i + 1];
    if (key === '--help') return { help: true };
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${key}`);
    i++;
    if (key === '--out') options.out = resolve(value);
    else if (key === '--world') {
      const [name, files] = value.split('=');
      if (!/^[a-z][a-z0-9-]*$/.test(name || '') || !files) throw new Error('--world needs NAME=TOKENS.css[,FONT.woff2]');
      const [css, font] = files.split(',').map(path => resolve(path));
      options.worlds.push({ name, css, font });
    } else if (key === '--only') options.only = value.split(',');
    else if (key === '--viewports') options.viewports = value.split(',');
    else if (key === '--entry') options.entry = value;
    else if (key === '--engine') options.engine = resolve(value);
    else throw new Error(`unknown option ${key}`);
  }
  if (!options.out) throw new Error('pass --out');
  if (!options.worlds.length) options.worlds.push({ name: 'base', css: join(root, 'tokens/base.css') });
  for (const name of options.viewports) if (!viewports[name]) throw new Error(`unknown viewport ${name}`);
  return options;
}

export function harness({ world, mode, motion, entry = 'scripts/search-pond.js', surface: [width, height] }) {
  return `<!doctype html><html lang="en" data-mode="${mode}" data-motion="${motion}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/world/${world}.css">
<style>
@font-face { font-family: "Martian Mono"; src: url("/world/${world}.woff2") format("woff2"); font-display: block; }
html, body { margin: 0; background: var(--color-paper); }
.surface { position: relative; isolation: isolate; inline-size: ${width}px; block-size: ${height}px; margin: 16px; }
.search-page__field { position: absolute; z-index: -1; inset: 0; overflow: hidden; pointer-events: none;
  mask-image: linear-gradient(to right,transparent,black var(--space-5),black calc(100% - var(--space-5)),transparent),linear-gradient(to bottom,transparent,black var(--space-5),black calc(100% - var(--space-5)),transparent);
  mask-composite: intersect; }
.search-page__field canvas { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; display: block; opacity: var(--material-discovery-field-opacity); }
</style></head><body><div class="surface"><div class="search-page__field" aria-hidden="true"></div></div>
<script type="module">
const field = document.querySelector('.search-page__field');
await document.fonts.load('400 13px "Martian Mono"').catch(() => {});
const started = performance.now();
const { mountSearchPond } = await import('/repo/${entry}');
const imported = performance.now();
window.__pond = mountSearchPond({ field, form: null });
window.__timing = { importMs: imported - started, mountMs: performance.now() - imported, mountedAt: performance.now() };
window.__ready = true;
</script></body></html>`;
}

const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.html': 'text/html' };
export function serve(worlds, engine = null) {
  const byName = new Map(worlds.map(world => [world.name, world]));
  return listen((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let file;
    if (url.pathname === '/') {
      const params = Object.fromEntries(url.searchParams);
      response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      response.end(harness({ ...params, surface: params.surface.split('x').map(Number) }));
      return;
    }
    const match = url.pathname.match(/^\/world\/([a-z0-9-]+)\.(css|woff2)$/);
    if (match) file = match[2] === 'css' ? byName.get(match[1])?.css : byName.get(match[1])?.font;
    else if (engine && url.pathname === '/repo/shared/pond-engine.mjs') file = engine;
    else if (url.pathname.startsWith('/repo/')) {
      file = resolve(root, '.' + decodeURIComponent(url.pathname.slice(5)));
      if (!file.startsWith(root + sep)) file = null;
    }
    if (!file || !existsSync(file)) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  });
}

// Seeded so a run of one engine repeats exactly; a different engine still differs.
export const seed = `(() => { let a = 0x2f6b1d; Math.random = () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;

// Summarise the canvas: share of inked pixels, of accent-coloured pixels, and the
// coarse ink density per tenth of width and height, for tuning without frame identity.
export const measure = () => {
  const canvas = document.querySelector('.search-page__field canvas');
  if (!canvas || canvas.hidden || !canvas.width) return null;
  const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const style = getComputedStyle(document.documentElement);
  const swatch = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgb = value => { swatch.clearRect(0, 0, 1, 1); swatch.fillStyle = value; swatch.fillRect(0, 0, 1, 1); return swatch.getImageData(0, 0, 1, 1).data; };
  const water = rgb(style.getPropertyValue('--color-paper')), accent = rgb(style.getPropertyValue('--color-accent'));
  const grid = Array.from({ length: 100 }, () => 0);
  let inked = 0, accented = 0, total = 0;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    const i = (y * width + x) * 4; total++;
    const d = Math.abs(data[i] - water[0]) + Math.abs(data[i + 1] - water[1]) + Math.abs(data[i + 2] - water[2]);
    if (data[i + 3] > 8 && d > 24) {
      inked++; grid[Math.min(9, Math.floor(y / height * 10)) * 10 + Math.min(9, Math.floor(x / width * 10))]++;
      if (Math.abs(data[i] - accent[0]) + Math.abs(data[i + 1] - accent[1]) + Math.abs(data[i + 2] - accent[2]) < 60) accented++;
    }
  }
  return { inked: inked / total, accent: accented / total, density: grid.map(value => Math.round(value / total * 1e4)) };
};

export async function open(browser, options, world, mode, motion, name, extra = {}) {
  const spec = viewports[name];
  const context = await browser.newContext({ viewport: spec.viewport, deviceScaleFactor: spec.deviceScaleFactor, isMobile: spec.isMobile, hasTouch: spec.hasTouch, reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference', colorScheme: mode, ...extra });
  const page = await context.newPage();
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  return { context, page, requests, spec, url: `${options.base}/?world=${world.name}&mode=${mode}&motion=${motion}&surface=${spec.surface.join('x')}${options.entry ? `&entry=${encodeURIComponent(options.entry)}` : ''}` };
}

async function stills(browser, options, world, mode, motion, name, records) {
  const { context, page, requests, spec, url } = await open(browser, options, world, mode, motion, name);
  await page.addInitScript(seed);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  // Paused before the page loads, so the frames depend on the steps alone and never on wall time.
  await page.clock.pauseAt(new Date('2026-01-01T00:00:00Z'));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { polling: 50 });
  const dir = join(options.out, 'stills', world.name, `${name}-${mode}-${motion}`);
  mkdirSync(dir, { recursive: true });
  const surface = page.locator('.surface');
  const [w, h] = spec.surface, left = 16, top = 16;
  const shot = async label => {
    await surface.screenshot({ path: join(dir, `${label}.png`), animations: 'allow' });
    records.push({ world: world.name, viewport: name, mode, motion, label, file: join(dir, `${label}.png`), metrics: await page.evaluate(measure) });
  };
  const run = ms => page.clock.runFor(ms);
  await shot('00-mount');
  await run(1000); await shot('01-1s');
  await run(2000); await shot('02-3s');
  await run(5000); await shot('03-8s');
  // A slow pointer arc across the left half, then a hold.
  for (let step = 0; step <= 30; step++) {
    const t = step / 30;
    await page.mouse.move(left + w * (0.15 + 0.35 * t), top + h * (0.5 + 0.25 * Math.sin(t * Math.PI * 2)));
    await run(50);
  }
  await shot('04-pointer-sweep');
  await run(1500); await shot('05-pointer-hold');
  await page.mouse.move(left + w / 2, top + h + 8); await run(1000); await shot('06-pointer-left');
  await page.mouse.click(left + w * 0.62, top + h * 0.45);
  await run(150); await shot('07-tap-150ms');
  await run(450); await shot('08-tap-600ms');
  await run(900); await shot('09-tap-1500ms');
  await run(2500); await shot('10-tap-4s');
  await page.evaluate(() => window.__pond?.scatter());
  await run(200); await shot('11-scatter-200ms');
  await run(800); await shot('12-scatter-1s');
  await page.evaluate(() => window.__pond?.nudge());
  await run(500); await shot('13-nudge-500ms');
  const external = requests.filter(request => !request.startsWith(options.base));
  if (external.length) records.push({ world: world.name, viewport: name, mode, motion, external });
  await context.close();
}

async function video(browser, options, world, mode, name, records) {
  const dir = join(options.out, 'video', world.name);
  mkdirSync(dir, { recursive: true });
  const spec = viewports[name];
  const { context, page, url } = await open(browser, options, world, mode, 'allow', name, { recordVideo: { dir, size: { width: spec.viewport.width, height: Math.min(spec.viewport.height, spec.surface[1] + 32) } } });
  await page.addInitScript(seed);
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true);
  const [w, h] = spec.surface, left = 16, top = 16;
  await page.waitForTimeout(2500);
  for (let step = 0; step <= 40; step++) {
    const t = step / 40;
    await page.mouse.move(left + w * (0.15 + 0.5 * t), top + h * (0.5 + 0.25 * Math.sin(t * Math.PI * 2)));
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(1200);
  await page.mouse.move(left + w / 2, top + h + 8);
  await page.mouse.click(left + w * 0.62, top + h * 0.45, { delay: 30 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__pond?.scatter());
  await page.waitForTimeout(2000);
  const file = await page.video().path();
  await context.close();
  const target = join(dir, `${name}-${mode}.webm`);
  renameSync(file, target);
  records.push({ world: world.name, viewport: name, mode, video: target });
}

// Frame cost: wrap requestAnimationFrame so each callback's own duration is recorded.
export const frameProbe = `(() => { const raf = window.requestAnimationFrame.bind(window); window.__frames = [];
  window.requestAnimationFrame = callback => raf(time => { const start = performance.now(); try { callback(time); } finally { window.__frames.push(performance.now() - start); } }); })();`;

async function perf(browser, options, world, mode, name, records) {
  const { context, page, url } = await open(browser, options, world, mode, 'allow', name);
  await page.addInitScript(seed);
  await page.addInitScript(frameProbe);
  await page.addInitScript(`window.__measure = (${measure});`);
  const throttle = name === 'phone' ? 4 : 1;
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true);
  const firstInk = await page.evaluate(() => new Promise(done => {
    const check = () => { const m = window.__measure(); if (m && m.inked > 0) done(performance.now() - window.__timing.mountedAt); else requestAnimationFrame(check); };
    check();
  })).catch(() => null);
  await page.evaluate(() => { window.__frames.length = 0; });
  await page.waitForTimeout(5000);
  const result = await page.evaluate(() => {
    const frames = [...window.__frames].sort((a, b) => a - b);
    const at = q => frames[Math.min(frames.length - 1, Math.floor(q * frames.length))] ?? null;
    // A loop that draws alternate frames returns at once from the others; report drawn frames apart.
    const drawn = frames.filter(cost => cost >= 0.3), on = q => drawn[Math.min(drawn.length - 1, Math.floor(q * drawn.length))] ?? null;
    return { timing: window.__timing, frames: frames.length, median: at(0.5), p95: at(0.95), max: frames.at(-1) ?? null,
      drawn: drawn.length, drawnMedian: on(0.5), drawnP95: on(0.95), heap: performance.memory?.usedJSHeapSize ?? null };
  });
  await context.close();
  records.push({ world: world.name, viewport: name, mode, throttle, firstInkMs: firstInk, ...result });
}

export async function main(args) {
  const options = pondArguments(args);
  if (options.help) { process.stdout.write(help); return; }
  const server = await serve(options.worlds, options.engine);
  options.base = server.origin;
  const browser = await launch();
  const records = [];
  try {
    for (const world of options.worlds) for (const name of options.viewports) for (const mode of ['light', 'dark']) {
      if (options.only.includes('stills')) for (const motion of ['allow', 'reduce']) await stills(browser, options, world, mode, motion, name, records);
      if (options.only.includes('video')) await video(browser, options, world, mode, name, records);
      if (options.only.includes('perf') && mode === 'light') await perf(browser, options, world, mode, name, records);
      process.stderr.write(`${world.name} ${name} ${mode}\n`);
    }
  } finally { await browser.close(); await server.close(); }
  mkdirSync(options.out, { recursive: true });
  writeFileSync(join(options.out, 'records.json'), JSON.stringify(records, null, 1));
  return records;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exit(1); });
