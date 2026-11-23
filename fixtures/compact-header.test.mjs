import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './lib/browser.mjs';

// Supply Sass and the selected world's existing font files (paths or URLs).
// GAZETTE_HEADER_TOKENS may select its captured tokens; neutral Base is the default.
const configured = process.env.GAZETTE_SASS_MODULE && process.env.GAZETTE_HEADER_DISPLAY_FONT && process.env.GAZETTE_HEADER_READING_FONT;
const bytes = async location => {
  if (!/^https?:/.test(location)) return readFile(location);
  const response = await fetch(location);
  assert.ok(response.ok, `Font request failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

test('compact capsule headers keep complete brand text clear of Search and preserve touch targets', {skip: !configured}, async () => {
  const module = await import(pathToFileURL(process.env.GAZETTE_SASS_MODULE));
  const sass = module.default || module;
  const styles = fileURLToPath(new URL('../styles/', import.meta.url));
  const options = {loadPaths: [styles], logger: {warn() {}}};
  const physics = sass.compile(fileURLToPath(new URL('../styles/physics.scss', import.meta.url)), options).css;
  const capsule = sass.compileString("@use 'navigation'; @layer world { @include navigation.capsule; .frame__header { padding-inline: var(--space-5); } }", options).css;
  const tokens = await readFile(process.env.GAZETTE_HEADER_TOKENS || new URL('../tokens/base.css', import.meta.url), 'utf8');
  const [display, reading] = await Promise.all([process.env.GAZETTE_HEADER_DISPLAY_FONT, process.env.GAZETTE_HEADER_READING_FONT].map(bytes));
  const fonts = `@font-face {font-family: 'Fixture Display'; font-weight: 100 900; src:url(data:font/woff2;base64,${display.toString('base64')}) format('woff2')} @font-face {font-family: 'Fixture Reading'; font-weight: 100 900; src:url(data:font/woff2;base64,${reading.toString('base64')}) format('woff2')} :root {--world-type-display-family:'Fixture Display'; --type-family-reading:'Fixture Reading'}`;
  const browser = await launch();
  try {
    for (const width of [390, 320]) {
      const page = await browser.newPage({viewport: {width, height: 844}});
      for (const brand of ['Field', 'NewThoughts', 'ExtraordinaryObservatory']) {
        await page.setContent(`<html data-mode="light" data-page-mode="home"><head><style>${tokens}\n${physics}\n${capsule}\n${fonts}</style></head><body><header class="frame__header" data-navigation-mode="compact"><a class="frame__brand" href="#home">${brand}</a><a class="shell__trigger shell__search-trigger" href="#search" aria-label="Search"><span class="shell__icon shell__icon--search" aria-hidden="true"></span></a><button class="frame__menu" aria-expanded="false">Menu</button><div class="frame__directory"><nav class="frame__nav" data-collapsed="true"><ul><li><a href="#home">Home</a></li></ul></nav></div></header><main id="home"><h1>A complete account</h1></main></body></html>`);
        await page.evaluate(async () => {
          await Promise.all([document.fonts.load('24px "Fixture Display"'), document.fonts.load('13px "Fixture Reading"')]);
          await document.fonts.ready;
        });
        const geometry = await page.evaluate(() => {
          const header = document.querySelector('.frame__header');
          const brand = header.querySelector('.frame__brand');
          const search = header.querySelector('.shell__search-trigger');
          const menu = header.querySelector('.frame__menu');
          const range = document.createRange();
          range.selectNodeContents(brand);
          const rect = element => {const {left, right, top, bottom, width, height} = element.getBoundingClientRect(); return {left, right, top, bottom, width, height};};
          const plate = getComputedStyle(search, '::before');
          return {
            brand: rect(brand), search: rect(search), menu: rect(menu), header: rect(header),
            text: [...range.getClientRects()].map(({left, right, top, bottom}) => ({left, right, top, bottom})),
            searchPlateLeft: search.getBoundingClientRect().left + parseFloat(plate.left),
            target: parseFloat(getComputedStyle(header).getPropertyValue('--target-project')),
            textContent: brand.textContent,
            overflow: document.documentElement.scrollWidth > innerWidth,
            fonts: [...document.fonts].map(face => ({family: face.family.replaceAll('\"', ''), status: face.status})).filter(face => face.family.startsWith('Fixture')),
          };
        });
        const label = `${brand} at ${width}px`;
        assert.equal(geometry.fonts.length, 2, label);
        assert.ok(geometry.fonts.every(face => face.status === 'loaded'), label);
        assert.equal(geometry.textContent, brand);
        assert.equal(geometry.overflow, false, label);
        assert.ok(geometry.text.length > 0, label);
        for (const fragment of geometry.text) {
          assert.ok(fragment.left >= geometry.brand.left - 1 && fragment.right <= geometry.searchPlateLeft, `${label}: text enters the Search plate`);
          assert.ok(fragment.top >= geometry.header.top && fragment.bottom <= geometry.header.bottom, `${label}: text leaves the header`);
        }
        for (const control of [geometry.search, geometry.menu]) {
          assert.ok(control.width >= geometry.target && control.height >= geometry.target, `${label}: touch target shrank`);
          assert.ok(control.left >= 0 && control.right <= width, `${label}: control leaves the viewport`);
        }
        assert.ok(geometry.search.right <= geometry.menu.left, `${label}: controls overlap`);
        if (brand === 'Field') assert.equal(geometry.text.length, 1, `${label}: a fitting name needlessly wraps`);
        if (brand === 'ExtraordinaryObservatory') assert.ok(geometry.text.length > 1, `${label}: the long unbroken name must wrap`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});
