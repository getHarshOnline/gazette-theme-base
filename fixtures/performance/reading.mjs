/** Exercise a reading page and measure the browser callbacks during each scroll. */

function begin(label) {
  const started = performance.mark(label + ': start').startTime;
  const intervals = [];
  let prior;
  let handle;
  function sample(time) {
    if (prior !== undefined) intervals.push(time - prior);
    prior = time;
    handle = requestAnimationFrame(sample);
  }
  handle = requestAnimationFrame(sample);
  window.__gazetteScroll = () => {
    cancelAnimationFrame(handle);
    const ended = performance.mark(label + ': end').startTime;
    performance.measure(label, label + ': start', label + ': end');
    return { label, started, ended, intervals };
  };
}

async function phase(page, label, operation) {
  const from = await page.evaluate(() => scrollY);
  await page.evaluate(begin, label);
  await operation();
  const result = await page.evaluate(() => ({
    ...window.__gazetteScroll(),
    to: scrollY,
  }));
  const intervals = result.intervals.toSorted((a, b) => a - b);
  if (intervals.length === 0) throw new Error(`No animation-frame callbacks during ${label}`);
  return {
    label,
    startMs: result.started,
    endMs: result.ended,
    movedPx: result.to - from,
    frameSamples: intervals.length,
    p95FrameGapMs: intervals[Math.ceil(intervals.length * 0.95) - 1],
    longestFrameGapMs: intervals.at(-1),
  };
}

async function gesture(page, cdp, options, direction) {
  const x = Math.floor(options.width / 2);
  const y = Math.floor(options.height / 2);
  // Each action crosses a little under one viewport and leaves the scroll reversible.
  await cdp.send('Input.synthesizeScrollGesture', {
    x, y, yDistance: -direction * Math.round(options.height * 0.8),
    speed: options.height * 2, preventFling: true,
    gestureSourceType: options.touch ? 'touch' : 'mouse',
  });
  // Sample the presentation after the gesture is delivered.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function search(page, scenario, timeout) {
  const form = page.locator('.search-page form[role="search"]');
  await form.waitFor({ state: 'visible', timeout });
  const before = await page.evaluateHandle(() => document.querySelector('.search-page__results li'));
  await page.evaluate(() => performance.mark('Search: start'));
  await form.locator('input[type="search"]').fill(scenario.query, { timeout });
  await form.locator('button[type="submit"]').click({ timeout });
  await page.waitForFunction(({ query, route, before }) => {
    const list = document.querySelector('.search-page__results');
    return new URL(location.href).searchParams.get('q') === query
      && !before?.isConnected && list && !list.hidden
      && [...list.querySelectorAll('a[href]')].some(link => new URL(link.href).pathname === route);
  }, { ...scenario, before }, { timeout });
  return page.evaluate(() => {
    const end = performance.mark('Search: result').startTime;
    const start = performance.getEntriesByName('Search: start', 'mark')[0].startTime;
    performance.measure('Search result', 'Search: start', 'Search: result');
    return { label: 'Search result', startMs: start, endMs: end };
  });
}

export async function readPage(page, cdp, options, target) {
  const { probe } = target;
  const phases = [];
  const reading = await page.evaluate(() => {
    const before = performance.mark('Reading page ready').startTime;
    return { before, scrollable: document.documentElement.scrollHeight > innerHeight + 16 };
  });
  const regions = [];
  for (const selector of probe?.regions ?? []) {
    for (const region of await page.locator(selector).all()) {
      if (await region.isVisible()) regions.push(region);
    }
  }
  if (probe && regions.length < probe.minimumRegions) {
    throw new Error(`${probe.label}: expected at least ${probe.minimumRegions} visible regions, found ${regions.length}`);
  }
  if (reading.scrollable) {
    for (const [index, region] of (regions.length ? regions : [null]).entries()) {
      let title = 'Reading';
      if (region) {
        const name = await region.evaluate((node, attribute) => {
          // Earlier scenes may have expanded by this point. Read the live position.
          const max = document.documentElement.scrollHeight - innerHeight;
          const position = Math.min(node.getBoundingClientRect().top + scrollY, max - innerHeight / 2);
          scrollTo({ top: position, behavior: 'instant' });
          return attribute ? node.querySelector(`[${attribute}]`)?.getAttribute(attribute) : null;
        }, probe.labelAttribute);
        title = `${probe.label} ${name || index + 1}`;
      }
      phases.push(await phase(page, title + ' · scroll down', () => gesture(page, cdp, options, 1)));
      phases.push(await phase(page, title + ' · scroll back', () => gesture(page, cdp, options, -1)));
    }
  }
  const action = target.search ? await search(page, target.search, options.timeoutMs) : null;
  // This isolated interaction can produce Event Timing. Scroll itself is not an INP interaction.
  await page.evaluate(() => performance.mark('Keyboard navigation: start'));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => performance.mark('Keyboard navigation: end'));
  const scrollPassed = !reading.scrollable || phases.every((step, index) =>
    index % 2 === 0 ? step.movedPx > 0 : step.movedPx < 0);
  return { readyMs: reading.before, scrollable: reading.scrollable, regions: regions.length, phases, action,
    scrollPassed: scrollPassed && (!probe || reading.scrollable) };
}
