import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launch } from './lib/browser.mjs';

const template = await readFile(new URL('../templates/social-card.html', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('../styles/social-card.scss', import.meta.url), 'utf8');
const tokens = await readFile(new URL('../tokens/base.css', import.meta.url), 'utf8');

test('the card keeps one inert source and loads only its selected media module', () => {
  for (const attribute of ['data-social-card-source', 'data-social-card-media', 'data-social-card-title']) {
    assert.equal(template.split(attribute).length - 1, 1, attribute);
  }
  assert.ok(template.includes('<template data-social-card-source>{{ body_html | safe }}</template>'));
  assert.ok(template.includes('{% block social_card_fonts %}'));
  assert.equal((template.match(/<script type="module"/g) || []).length, 1);
  assert.equal((template.match(/resource.id == "module:social-card-media"/g) || []).length, 1);
  assert.ok(!template.includes('partials/resources.html'));
  assert.ok(template.indexOf('{% block social_card_fonts %}') < template.lastIndexOf('stylesheet:social-card'));
});

// Exercise the composition with prepared title/media inputs. Native Gazette
// checks must also cover Tera binding, local asset admission and extraction.
test('neutral cards fill the canvas with the image and keep the title hidden', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    for (const mode of ['light', 'dark']) {
      for (const [width, height] of [[900, 480], [480, 900]]) {
        const title = 'The assumptions behind a useful result';
        const source = '<h1>The assumptions behind a useful result</h1><script>window.sourceRan = true</script><img src="https://unused.example.test/never-load.svg">';
        const body = template.slice(template.indexOf('<body'), template.indexOf('</body>') + 7)
          .replace('{{ card.width }}', '1200').replace('{{ card.height }}', '630')
          .replace('{{ body_html | safe }}', source).replace('{{ content.title }}', title)
          .replace(/{% for resource[\s\S]*?{% endfor %}/g, '');
        await page.setContent(`<html data-mode="${mode}"><head><style>${tokens}\n${stylesheet}</style></head>${body}</html>`);
        await page.locator('[data-social-card-media]').evaluate((target, size) => {
          const image = document.createElement('img');
          image.alt = 'Two regions connected by one line';
          image.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}"><rect x="1" y="1" width="${size.width - 2}" height="${size.height - 2}" fill="silver" stroke="black"/></svg>`)}`;
          target.append(image);
        }, { width, height });
        await page.locator('[data-social-card-media] img').evaluate(image => image.decode());
        const geometry = await page.evaluate(() => {
          const card = document.body, title = card.querySelector('[data-social-card-title]');
          const media = card.querySelector('[data-social-card-media]'), image = media.querySelector('img');
          const rect = element => { const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height }; };
          return { card: rect(card), titleHidden: getComputedStyle(title).display === 'none', media: rect(media), image: rect(image),
            overflow: card.scrollWidth > card.clientWidth || card.scrollHeight > card.clientHeight,
            fit: getComputedStyle(image).objectFit, titleText: title.textContent,
            paper: getComputedStyle(card).backgroundColor,
            ink: getComputedStyle(card).color, sourceRan: window.sourceRan === true };
        });
        assert.deepEqual(geometry.card, { x: 0, y: 0, width: 1200, height: 630 });
        assert.equal(geometry.overflow, false, JSON.stringify(geometry));
        assert.deepEqual(geometry.media, geometry.card);
        assert.deepEqual(geometry.image, geometry.card);
        assert.equal(geometry.titleHidden, true);
        assert.equal(geometry.fit, 'cover');
        assert.equal(geometry.titleText, title);
        assert.notEqual(geometry.paper, geometry.ink);
        assert.equal(geometry.sourceRan, false);
      }
    }
    assert.ok(!requests.some(url => url.includes('unused.example.test')));
  } finally {
    await browser.close();
  }
});
