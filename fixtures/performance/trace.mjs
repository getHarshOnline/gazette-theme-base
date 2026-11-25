import { writeFile } from 'node:fs/promises';
/** Save a browser trace on demand, and export a compact timeline for reviewed benchmarks. */

import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';

export async function startTrace(browser, path) {
  const session = await browser.newBrowserCDPSession();
  try {
    await session.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      traceConfig: { includedCategories: [
        'blink.user_timing', 'devtools.timeline', 'disabled-by-default-devtools.timeline',
        'loading', 'cc', 'benchmark',
      ] },
    });
  } catch (error) {
    await session.detach();
    throw error;
  }
  return async () => {
    const ended = once(session, 'Tracing.tracingComplete');
    try {
      await session.send('Tracing.end');
      const [{ stream }] = await ended;
      async function* chunks() {
        try {
          while (true) {
            const part = await session.send('IO.read', { handle: stream });
            yield Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8');
            if (part.eof) return;
          }
        } finally {
          await session.send('IO.close', { handle: stream });
        }
      }
      await pipeline(Readable.from(chunks()), createGzip(), createWriteStream(path, { flags: 'wx' }));
    } finally {
      await session.detach();
    }
  };
}

const microseconds = value => Math.round(value * 1000);

function traceEvents(result, thread) {
  const event = (cat, name, time, args = {}, duration) => ({
    name, cat, ph: duration === undefined ? 'i' : 'X',
    ...(duration === undefined ? { s: 't' } : { dur: microseconds(duration) }),
    pid: 1, tid: thread, ts: microseconds(time), args,
  });
  const events = [event('load', 'Navigation', 0, { route: result.route })];
  if (result.lcpMs !== null) events.push(event('vitals', 'Largest contentful paint', result.lcpMs));
  if (result.fcpMs !== null) events.push(event('vitals', 'First contentful paint', result.fcpMs));
  if (result.readyMs !== null) events.push(event('load', 'Reading page ready', result.readyMs));
  for (const phase of result.phases) {
    const { label, startMs, endMs, ...metrics } = phase;
    events.push(event('scroll', label, startMs, metrics, endMs - startMs));
  }
  if (result.action) {
    const { label, startMs, endMs } = result.action;
    events.push(event('interaction', label, startMs, {}, endMs - startMs));
  }
  for (const interaction of result.interactions) {
    events.push(event('interaction', interaction.name, interaction.timeMs, {}, interaction.durationMs));
  }
  events.push(event('summary', 'Delivery and stability', result.phases.at(-1)?.endMs ?? result.readyMs ?? 0, {
    encodedBytes: result.encodedBytes,
    frameRequests: result.frameRequests,
    cancelledFrames: result.cancelledFrames,
    cls: result.cls,
    longestTaskMs: result.longestTaskMs,
  }));
  return events;
}

export async function writeTimeline(path, measurements) {
  const trace = measurements.flatMap((row, index) => [
    { name: 'thread_name', ph: 'M', pid: 1, tid: index + 1,
      args: { name: `${row.domain}${row.route} · ${row.kind} · ${row.presentation} · ${row.network}` } },
    ...traceEvents(row, index + 1),
  ]);
  await writeFile(path, JSON.stringify({ traceEvents: trace }), { flag: 'wx' });
}
