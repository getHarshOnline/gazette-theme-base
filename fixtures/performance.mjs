#!/usr/bin/env node
/** Measure configured pages and retain labelled loading and scroll evidence. */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { parseArgs } from 'node:util';
import { launch } from './lib/browser.mjs';
import { failedCapture, profilePage, requestSummary } from './profile.mjs';
import { readPage } from './performance/reading.mjs';
import { startTrace, writeTimeline } from './performance/trace.mjs';

function blockedPreviewTransport(request, target) {
  if (target.previewRuntime !== 'mintlify-dev'
      || request.state !== 'failed' || !request.error?.startsWith('net::ERR_BLOCKED_BY_CLIENT')) return false;
  const url = new URL(request.url);
  return url.pathname === '/socket.io/' && url.searchParams.get('EIO') === '4'
    && url.searchParams.get('transport') === 'polling';
}

function measurement(row, target, presentation, network, trace) {
  const { exercised, observed, requests } = row;
  const firstParty = requests.filter(request => new URL(request.url).origin === new URL(target.url).origin);
  const checked = firstParty.filter(request => !blockedPreviewTransport(request, target));
  const networkError = checked.find(request => request.status >= 400 || request.state === 'failed');
  const framePattern = target.probe?.framePattern && new RegExp(target.probe.framePattern);
  const frames = framePattern
    ? firstParty.filter(request => framePattern.test(new URL(request.url).pathname)) : [];
  const metrics = {
    lcpMs: row.lcp?.timeMs ?? null,
    fcpMs: row.fcpMs,
    cls: observed?.cls ?? null,
    interactionMs: observed?.interactions.length
      ? Math.max(...observed.interactions.map(item => item.durationMs)) : null,
    longestTaskMs: observed?.longTasks.longestMs ?? null,
    p95ScrollFrameGapMs: exercised?.phases.length
      ? Math.max(...exercised.phases.map(phase => phase.p95FrameGapMs)) : null,
    encodedBytes: row.summary.completedBytes + row.summary.partialBodyBytes,
    frameRequests: framePattern ? frames.length : null,
    cancelledFrames: framePattern ? requestSummary(frames).cancelled : null,
  };
  return {
    publication: target.publication, domain: target.domain, route: target.route, kind: target.kind,
    presentation: presentation.id, network: network.id, ...metrics,
    readyMs: exercised?.readyMs ?? null, interactions: observed?.interactions ?? [],
    phases: exercised?.phases ?? [], regions: exercised?.regions ?? null,
    scrollable: exercised?.scrollable ?? null, action: exercised?.action ?? null, trace,
    ...(checked.length !== firstParty.length ? { blockedPreviewPolling: firstParty.length - checked.length } : {}),
    error: row.error ?? (!row.settled
      ? `Loading did not settle (${row.capture?.ready ?? 'no document'}, ${row.capture?.pendingImages.length ?? 0} visible images pending)`
      : row.pageErrors[0] ?? (exercised && !exercised.scrollPassed ? 'A reading phase did not move in its expected direction'
        : networkError ? `${networkError.status ?? networkError.error} ${new URL(networkError.url).pathname}` : null)),
    capturePassed: Boolean(exercised?.scrollPassed)
      && !failedCapture({ ...row, summary: requestSummary(checked) }),
  };
}

async function run({ manifest, out, benchmark, 'raw-trace': rawTrace }) {
  if (benchmark) {
    if (!out || manifest || rawTrace) throw new Error('Pass --benchmark and --out for a saved timeline');
    await writeTimeline(out, JSON.parse(await readFile(benchmark, 'utf8')).measurements);
    return 0;
  }
  if (!manifest || !out) throw new Error('Pass --manifest and a fresh --out directory');
  const plan = JSON.parse(await readFile(manifest, 'utf8'));
  if (plan.version !== 2 || !plan.targets.length) throw new Error('Expected a nonempty performance plan');
  await mkdir(out);
  const browser = await launch();
  const measurements = [];
  try {
    for (const target of plan.targets) {
      for (const presentation of plan.presentations) {
        for (const network of plan.networks) {
          const trace = rawTrace ? `browser-${measurements.length + 1}.json.gz` : null;
          const options = {
            ...presentation, network, timeoutMs: plan.timeoutMs, settleMs: plan.settleMs,
            mode: plan.colorScheme, allowedOrigins: plan.allowedOrigins,
            exercise: (page, cdp) => readPage(page, cdp, options, target),
            startTrace: trace ? () => startTrace(browser, join(out, trace)) : undefined,
          };
          const row = await profilePage(browser, target.url, options);
          const result = measurement(row, target, presentation, network, trace);
          measurements.push(result);
          const paint = result.lcpMs === null ? 'LCP unavailable' : `${result.lcpMs.toFixed(0)} ms LCP`;
          console.log(`${target.domain}${target.route} ${presentation.id}/${network.id}: ${paint}`
            + (result.capturePassed ? '' : ` · ${result.error ?? 'incomplete capture'}`));
        }
      }
    }
    const environment = { platform: process.platform, architecture: process.arch,
      cpu: cpus()[0]?.model ?? 'unknown', chromium: browser.version() };
    await writeFile(join(out, 'measurements.json'), JSON.stringify({ environment, measurements }, null, 2) + '\n', { flag: 'wx' });
    await writeTimeline(join(out, 'timeline.json'), measurements);
    return measurements.every(row => row.capturePassed) ? 0 : 1;
  } finally {
    await browser.close();
  }
}

try {
  const { values } = parseArgs({ options: {
    manifest: { type: 'string' }, benchmark: { type: 'string' }, out: { type: 'string' }, 'raw-trace': { type: 'boolean' },
  } });
  process.exitCode = await run(values);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
