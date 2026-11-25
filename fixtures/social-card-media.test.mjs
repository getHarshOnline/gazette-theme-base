import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const stylesheet = await readFile(new URL('../styles/social-card.scss', import.meta.url), 'utf8');

async function card(run) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://card.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (/^\/modules\/[a-z-]+\.js$/.test(path)) {
        await route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL(`../scripts/${path.split('/').at(-1)}`, import.meta.url), 'utf8') });
      } else if (path === '/') {
        await route.fulfill({ contentType: 'text/html', body: `<html><head><style>
          :root{--color-paper:rgb(240,235,220);--color-ink:rgb(30,40,35);--layout-portrait-cell:3px}
          body{margin:0;width:600px;height:300px}[data-social-card-media]{width:300px;height:150px}
          ${stylesheet}
          </style><script type="importmap">{"imports":{"@base/video-reveal":"/modules/video-reveal.js"}}</script></head>
          <body><div class="social-card__media" data-social-card-media></div></body></html>` });
      } else await route.abort();
    });
    await page.goto('http://card.test/');
    await run(page);
  } finally { await browser.close(); }
}

async function prepare(page, { video = false, treatment = 'natural' } = {}) {
  await page.evaluate(async ({ video, treatment }) => {
    const slot = document.querySelector('[data-social-card-media]');
    const media = document.createElement(video ? 'video' : 'img');
    media.setAttribute('data-treatment', treatment);
    if (video) {
      const source = document.createElement('canvas'); source.width = 300; source.height = 120;
      const context = source.getContext('2d');
      context.fillStyle = 'black'; context.fillRect(0, 0, 100, source.height);
      context.fillStyle = 'rgb(128 128 128)'; context.fillRect(100, 0, 100, source.height);
      context.fillStyle = 'white'; context.fillRect(200, 0, 100, source.height);
      media.muted = true; media.srcObject = source.captureStream();
      const firstFrame = new Promise(resolve => media.requestVideoFrameCallback(resolve));
      await media.play();
      await firstFrame;
      media.pause();
      window.stopSource = () => media.srcObject.getTracks().forEach(track => track.stop());
    } else {
      media.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="15"><rect width="30" height="15" fill="silver"/></svg>');
      await media.decode();
    }
    slot.append(media);
    window.original = media;
    await import('/modules/social-card-media.js');
    window.finish = () => {
      let result;
      slot.addEventListener('gazette:social-card-media-complete', event => { result = event.detail; }, { once: true });
      slot.dispatchEvent(new Event('gazette:social-card-media-ready'));
      return result;
    };
  }, { video, treatment });
}

test('natural media completes without replacing or hiding its decoded original', async () => card(async page => {
  await prepare(page);
  assert.deepEqual(await page.evaluate(() => finish()), { status: 'complete' });
  assert.deepEqual(await page.evaluate(() => ({ same: original === document.querySelector('[data-social-card-media]').firstElementChild, hidden: original.hidden, canvases: document.querySelectorAll('canvas').length })), { same: true, hidden: false, canvases: 0 });
}));

test('monochrome video fills the frame, keeps photographic light and completes only once', async () => {
  for (const dark of [false, true]) await card(async page => {
    await prepare(page, { video: true, treatment: 'monochrome' });
    if (dark) await page.evaluate(() => {
      document.documentElement.style.setProperty('--color-paper', 'rgb(30 40 35)');
      document.documentElement.style.setProperty('--color-ink', 'rgb(240 235 220)');
    });
    assert.deepEqual(await page.evaluate(() => finish()), { status: 'complete' });
    const pixels = await page.evaluate(() => {
      const canvas = document.querySelector('[data-social-card-media] canvas'), context = canvas.getContext('2d');
      return { dark: [...context.getImageData(50, 2, 1, 1).data], light: [...context.getImageData(250, 147, 1, 1).data], hidden: original.hidden, display: getComputedStyle(original).display };
    });
    assert.deepEqual(pixels, { dark: [30, 40, 35, 255], light: [240, 235, 220, 255], hidden: true, display: 'none' });
    assert.equal(await page.evaluate(() => finish()), undefined);
    assert.equal(await page.locator('[data-social-card-media] canvas').count(), 1);
    await page.evaluate(() => stopSource());
  });
});

test('unsupported treatment and invalid geometry report failure without hiding the original', async () => {
  for (const kind of ['treatment', 'geometry', 'palette']) await card(async page => {
    await prepare(page, { video: kind !== 'treatment', treatment: kind === 'treatment' ? 'unknown' : 'monochrome' });
    if (kind === 'geometry') await page.evaluate(() => document.documentElement.style.setProperty('--layout-portrait-cell', '.001px'));
    if (kind === 'palette') await page.evaluate(() => document.documentElement.style.setProperty('--color-paper', 'invalid'));
    const reason = { treatment: 'unsupported-treatment', geometry: 'invalid-geometry', palette: 'invalid-palette' }[kind];
    assert.deepEqual(await page.evaluate(() => finish()), { status: 'failed', reason });
    assert.equal(await page.evaluate(() => original.hidden), false);
    assert.equal(await page.locator('[data-social-card-media] canvas').count(), 0);
    await page.evaluate(() => window.stopSource?.());
  });
});
