#!/usr/bin/env node
/** Measure cold page loading through the selected server, without rewriting its output. */
import { open, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { httpURL, integers, readOptions } from './lib/args.mjs';
import { launch } from './lib/browser.mjs';

export const profiles = {
  'slow-mobile': { latency: 562.5, downloadKbps: 1474.56, uploadKbps: 675, cpu: 4 },
  unthrottled: { latency: 0, downloadKbps: null, uploadKbps: null, cpu: 1 },
};
const help = `npm run profile -- --out FILE [options] URL [URL ...]

Measure each HTTP(S) page in a fresh headless Chromium context, one at a time.
Start the preview or hosting server separately. No assets or responses are changed.
Install the pinned browser first: npm ci && npx playwright install chromium.

  --profile NAME    slow-mobile (default) or unthrottled
  --width PIXELS    viewport width, default 390
  --height PIXELS   viewport height, default 844
  --mode MODE       light (default) or dark
  --repeat COUNT    cold navigations per URL, 1–10; default 1
  --timeout-ms MS   page capture limit, 1000–120000; default 60000
  --settle-ms MS    stable largest-paint interval, 500–10000; default 3500

Slow mobile applies 562.5 ms request latency, 1474.56 Kibit/s download, 675 Kibit/s
upload and fourfold CPU slowdown. Viewport density is 1; touch/mobile emulation
is enabled. Metrics are observed during navigation, not Lighthouse simulation.
The JSON keeps requests, paint candidates and incomplete captures. Existing output
is never overwritten. A failed or incomplete capture returns a nonzero exit code.
See docs/performance.md for scope, interpretation and visual checks.
`;

export function profileArguments(args) {
  const urls = [];
  const options = { profile: 'slow-mobile', width: 390, height: 844, mode: 'light', repeat: 1,
    timeoutMs: 60000, settleMs: 3500, urls, ...readOptions(args, { '--out': 'out', '--profile': 'profile',
      '--width': 'width', '--height': 'height', '--mode': 'mode', '--repeat': 'repeat',
      '--timeout-ms': 'timeoutMs', '--settle-ms': 'settleMs' }, { operand: value => {
      if (value.startsWith('-')) throw new Error(`unknown option ${value}`);
      urls.push(httpURL(value, undefined, 'use HTTP(S) URLs without embedded credentials'));
    } }) };
  if (!options.out || !options.urls.length) throw new Error('pass --out FILE and at least one URL');
  if (options.urls.length > 100) throw new Error('use at most 100 URLs per run');
  if (!Object.hasOwn(profiles, options.profile)) throw new Error('use --profile slow-mobile or unthrottled');
  if (!['light', 'dark'].includes(options.mode)) throw new Error('use --mode light or dark');
  integers(options, [['width', 240, 7680], ['height', 240, 7680], ['repeat', 1, 10],
    ['timeoutMs', 1000, 120000], ['settleMs', 500, 10000]],
  (name, min, max) => `${name} must be an integer from ${min} to ${max}`);
  if (options.settleMs >= options.timeoutMs) throw new Error('settle interval must be shorter than capture limit');
  return { ...options, out: resolve(options.out), network: profiles[options.profile] };
}

function observeLoading() {
  const result = { candidates: [], cls: 0, shifts: 0, shiftSources: [], longTasks: { count: 0, totalMs: 0, longestMs: 0 }, truncated: false, interactions: [] };
  window.__gazetteLoadingProfile = result;
  performance.setResourceTimingBufferSize(1000);
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (result.candidates.length === 128) { result.truncated = true; result.candidates.shift(); }
      result.candidates.push({ timeMs: entry.startTime, loadMs: entry.loadTime, renderMs: entry.renderTime,
        size: entry.size, url: entry.url, tag: entry.element?.tagName, id: entry.element?.id });
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  let first = 0, previous = 0, score = 0;
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      if (!result.shifts || entry.startTime - previous >= 1000 || entry.startTime - first >= 5000) {
        first = entry.startTime; score = 0;
      }
      previous = entry.startTime; score += entry.value; result.shifts++;
      if(result.shiftSources.length<128) result.shiftSources.push({timeMs:entry.startTime,value:entry.value,
        sources:(entry.sources??[]).map(source=>({tag:source.node?.tagName,id:source.node?.id,
          before:source.previousRect.toJSON(),after:source.currentRect.toJSON()}))});
      else result.truncated=true;
      result.cls = Math.max(result.cls, score);
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      result.longTasks.count++; result.longTasks.totalMs += entry.duration;
      result.longTasks.longestMs = Math.max(result.longTasks.longestMs, entry.duration);
    }
  }).observe({ type: 'longtask', buffered: true });
  function recordInteractions(list) {
    for (const entry of list.getEntries()) {
      if (!entry.interactionId) continue;
      const existing = result.interactions.find(item => item.id === entry.interactionId);
      if (existing) existing.durationMs = Math.max(existing.durationMs, entry.duration);
      else if (result.interactions.length < 128) result.interactions.push({
        id: entry.interactionId, name: entry.name, timeMs: entry.startTime, durationMs: entry.duration,
      });
      else result.truncated = true;
    }
  }
  if (PerformanceObserver.supportedEntryTypes.includes('event')) {
    const interactions = new PerformanceObserver(recordInteractions);
    interactions.observe({ type: 'event', durationThreshold: 16, buffered: true });
    const firstInput = new PerformanceObserver(recordInteractions);
    firstInput.observe({ type: 'first-input', buffered: true });
  }
}

function loadingState() {
  const pendingImages = [...document.images].filter(image => {
    const box = image.getBoundingClientRect(), style = getComputedStyle(image);
    return box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0 &&
      box.left < innerWidth && box.right > 0 && style.visibility !== 'hidden' && style.display !== 'none' &&
      !(image.complete && image.naturalWidth > 0);
  }).map(image => image.currentSrc || image.src);
  return { nowMs: performance.now(), ready: document.readyState, fonts: document.fonts.status,
    lastPaintMs: window.__gazetteLoadingProfile?.candidates.at(-1)?.timeMs ?? 0, pendingImages };
}

function readObservation(page) {
  return page.evaluate(() => ({ ...window.__gazetteLoadingProfile,
    paints: performance.getEntriesByType('paint').map(entry => entry.toJSON()),
    navigation: performance.getEntriesByType('navigation')[0]?.toJSON(),
    resources: performance.getEntriesByType('resource').map(entry => entry.toJSON()) }));
}

/** Keep every recorded outcome separate: cancellation is not a completed download. */
export function requestSummary(requests) {
  const counts = { completed: 0, redirected: 0, pending: 0, cancelled: 0, failed: 0, httpErrors: 0 };
  let completedBytes = 0, partialBodyBytes = 0;
  const assets = new Map();
  for (const request of requests) {
    counts[request.state]++;
    const key=JSON.stringify([request.type??'unknown',request.mime??'unknown']);
    if(!assets.has(key)) assets.set(key,{type:request.type??'unknown',mime:request.mime??'unknown',requests:0,completedBytes:0,partialBodyBytes:0});
    const group=assets.get(key);group.requests++;
    if(['completed','redirected'].includes(request.state))group.completedBytes+=request.bytes??0;
    else group.partialBodyBytes+=request.bodyBytes??0;
    if (request.status >= 400) counts.httpErrors++;
    if (request.state === 'completed' || request.state === 'redirected') completedBytes += request.bytes ?? 0;
    else partialBodyBytes += request.bodyBytes ?? 0;
  }
  return { ...counts, completedBytes, partialBodyBytes, assets: [...assets.values()].sort((a,b)=>b.completedBytes+b.partialBodyBytes-a.completedBytes-a.partialBodyBytes) };
}

export async function profilePage(browser, url, options) {
  const context = await browser.newContext({ viewport: { width: options.width, height: options.height },
    deviceScaleFactor: options.deviceScaleFactor ?? 1, isMobile: options.mobile ?? true,
    hasTouch: options.touch ?? true, colorScheme: options.mode, serviceWorkers: 'block' });
  const records = [], current = new Map(), errors = [];
  let state = null, observed = null, error = null, settled = false, truncated = false, cdp, exercised = null, finishTrace;
  // Closing this isolated context also interrupts an unresponsive evaluation.
  const watchdog = setTimeout(() => { void context.close().catch(() => {}); }, options.timeoutMs + (options.exercise ? 20000 : 5000));
  watchdog.unref();
  try {
    if(options.delayMs || options.allowedOrigins) await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(options.allowedOrigins && ['http:','https:'].includes(url.protocol) &&
        (!options.allowedOrigins.includes(url.origin)||!['GET','HEAD'].includes(request.method())))return route.abort('blockedbyclient');
      if(options.delayMs && (options.delayKinds??['font','image']).includes(request.resourceType())) await new Promise(resolve=>setTimeout(resolve,options.delayMs));
      try { await route.continue(); } catch { /* The capture deadline can close this isolated context. */ }
    });
    const page = await context.newPage();
    cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: options.disableCache ?? true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: options.network.latency,
      downloadThroughput: options.network.downloadKbps === null ? -1 : options.network.downloadKbps * 1024 / 8,
      uploadThroughput: options.network.uploadKbps === null ? -1 : options.network.uploadKbps * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: options.network.cpu });
    cdp.on('Network.requestWillBeSent', event => {
      const prior = current.get(event.requestId);
      if (prior && event.redirectResponse) Object.assign(prior, { state: 'redirected', end: event.timestamp,
        status: event.redirectResponse.status, bytes: event.redirectResponse.encodedDataLength });
      if (records.length >= 1000) { truncated = true; current.delete(event.requestId); return; }
      const request = { url: event.request.url, type: event.type, start: event.timestamp,
        initiator: event.initiator.type, state: 'pending', bodyBytes: 0 };
      records.push(request); current.set(event.requestId, request);
    });
    cdp.on('Network.responseReceived', event => {
      const request = current.get(event.requestId);
      if (request) Object.assign(request, { status: event.response.status, mime: event.response.mimeType,
        response: event.timestamp, protocol: event.response.protocol,
        encoding: Object.entries(event.response.headers).find(([name]) => name.toLowerCase() === 'content-encoding')?.[1] ?? null });
    });
    cdp.on('Network.dataReceived', event => {
      const request = current.get(event.requestId);
      if (request) request.bodyBytes += event.encodedDataLength;
    });
    cdp.on('Network.loadingFinished', event => {
      const request = current.get(event.requestId);
      if (request) Object.assign(request, { state: 'completed', end: event.timestamp, bytes: event.encodedDataLength });
    });
    cdp.on('Network.loadingFailed', event => {
      const request = current.get(event.requestId);
      if (request) Object.assign(request, { state: event.canceled ? 'cancelled' : 'failed',
        end: event.timestamp, error: event.errorText });
    });
    page.on('pageerror', failure => { if (errors.length < 100) errors.push(failure.message); else truncated = true; });
    await page.addInitScript(observeLoading);
    finishTrace = await options.startTrace?.();
    const deadline = Date.now() + options.timeoutMs;
    await page.goto(url, { waitUntil: 'commit', timeout: Math.min(15000, options.timeoutMs) });
    if (options.kind === 'alias') {
      await page.waitForURL(address => address.href !== url, {
        waitUntil: 'commit', timeout: Math.max(1, deadline - Date.now()),
      });
    }
    do {
      await page.waitForTimeout(100);
      state = await page.evaluate(loadingState);
      settled = state.ready === 'complete' && state.fonts === 'loaded' && state.lastPaintMs > 0 &&
        state.nowMs - state.lastPaintMs >= options.settleMs && !state.pendingImages.length;
    } while (!settled && !truncated && Date.now() < deadline);
    observed = await readObservation(page);
    // A late asset can leave loading incomplete after the reading surface is usable.
    const readyToExercise = state.ready !== 'loading' && state.lastPaintMs > 0;
    if (options.exercise && readyToExercise) {
      exercised = await options.exercise(page, cdp);
      observed = await readObservation(page);
    }
  } catch (failure) { error = failure.message; }
  finally {
    clearTimeout(watchdog);
    // Browser teardown must not relabel requests pending at the capture boundary.
    cdp?.removeAllListeners();
    try { await finishTrace?.(); } finally { await context.close(); }
  }
  const start = records[0]?.start ?? 0;
  const requests = records.map(({ start: begin, response, end, ...request }) => ({ ...request,
    startMs: (begin - start) * 1000, responseMs: response === undefined ? null : (response - start) * 1000,
    endMs: end === undefined ? null : (end - start) * 1000 }));
  const summary = requestSummary(requests);
  return { url, settled, error, truncated: truncated || observed?.truncated || false, capture: state,
    lcp: observed?.candidates.at(-1) ?? null,
    fcpMs: observed?.paints.find(entry => entry.name === 'first-contentful-paint')?.startTime ?? null,
    observed, requests, summary, pageErrors: errors, ...(options.exercise ? { exercised } : {}) };
}

export const failedCapture = row => !row.settled || row.error || row.truncated ||
  row.summary.failed > 0 || row.summary.httpErrors > 0 || row.pageErrors.length > 0;

export async function main(args) {
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return 0; }
  const options = profileArguments(args);
  await mkdir(dirname(options.out), { recursive: true });
  const output = await open(options.out, 'wx');
  const report = { version: 1, startedAt: new Date().toISOString(), conditions: options,
    scope: 'Cold stationary page loading; observed browser timings, not build time, field Web Vitals or interaction UAT.', runs: [] };
  let browser;
  try {
    browser = await launch();
    report.browser = browser.version();
    for (const url of options.urls) for (let repeat = 1; repeat <= options.repeat; repeat++) {
      const row = { ...await profilePage(browser, url, options), repeat };
      report.runs.push(row);
      console.log(`${failedCapture(row) ? 'INCOMPLETE' : 'CAPTURED'} ${url} · LCP ${row.lcp?.timeMs ?? 'unavailable'} ms · ${row.summary.pending} pending · ${row.summary.cancelled} cancelled`);
    }
  } catch (error) { report.error = error.message; }
  finally {
    try { await browser?.close(); }
    finally { await output.writeFile(JSON.stringify(report, null, 2) + '\n'); await output.close(); }
  }
  if (report.error) console.error(report.error);
  console.log(`Read ${options.out}`);
  return report.error || report.runs.some(failedCapture) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (error) { console.error(`FAIL: ${error.message}`); process.exitCode = 1; }
}
