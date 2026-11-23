#!/usr/bin/env node
/** Capture a workspace's accepted pages with Pale's browser checks and Base's pinned browser. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runPale } from './lib/browser.mjs';

const help = `npm run capture -- --tool PATH --profile PATH --baseline PATH --out DIR [capture options]

Read target URLs from the accepted capture's cells.json. The workspace owns that
reference and the profile; Base keeps no publication names or local addresses.
Pale captures every profile width in light/dark and full/reduced motion, with web
and compact touch contexts. Native animation stays enabled. Remaining options go
to Pale's capture command. Install the browser first: npx playwright install chromium.

comparison.html pairs matching captures for visual review and identifies missing
reference cells. It does not grant design acceptance. A failed or skipped capture
keeps its nonzero exit status. Use --help with the selected Pale tool for its options.
`;

export function captureArguments(args) {
  const options = { extra: [] };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (['--tool', '--profile', '--baseline', '--out'].includes(key)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`missing value for ${key}`);
      if (options[key.slice(2)]) throw new Error(`repeated option ${key}`);
      options[key.slice(2)] = resolve(args[++i]);
    } else options.extra.push(key);
  }
  for (const key of ['tool', 'profile', 'baseline', 'out'])
    if (!options[key]) throw new Error(`pass --${key}`);
  return options;
}

export function referenceCells(path) {
  const cells = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(cells) || !cells.length) throw new Error('baseline must contain capture cells');
  for (const cell of cells) {
    const url = new URL(cell.url);
    if (!['http:', 'https:'].includes(url.protocol) ||
        !cell.state || !cell.ctx || !Number.isSafeInteger(cell.width))
      throw new Error('each baseline cell needs an HTTP(S) URL, state, context and width');
  }
  return cells;
}

const key = cell => JSON.stringify([cell.url, cell.width, cell.state, cell.ctx,
  cell.route ?? 'system', cell.js ?? true, cell.forced ?? false,
  cell.captureScope ?? 'full-page', cell.env?.viewport?.[1] ?? null, cell.env?.devicePixelRatio ?? null]);
const html = value => String(value).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const imagePath = (capture, manifest, output) => {
  const absolute = resolve(dirname(manifest), capture);
  return relative(output, absolute).split('/').map(encodeURIComponent).join('/');
};

export function comparison(reference, current, baseline, manifest, output) {
  const accepted = new Map();
  for (const row of reference) {
    if (accepted.has(key(row))) throw new Error(`duplicate baseline cell: ${row.url} ${row.state} ${row.width} ${row.ctx}`);
    accepted.set(key(row), row);
  }
  const visited = new Set();
  const sections = current.map(row => {
    const before = accepted.get(key(row));
    visited.add(key(row));
    const oldImage = before?.capture ? `<a href="${html(imagePath(before.capture, baseline, output))}"><img loading="lazy" alt="Reference capture" src="${html(imagePath(before.capture, baseline, output))}"></a>`
      : `<p>${before ? 'The reference run did not capture an image.' : 'No reference cell for these conditions; appearance remains unreviewed.'}</p>`;
    const newImage = row.capture ? `<a href="${html(imagePath(row.capture, manifest, output))}"><img loading="lazy" alt="Current capture" src="${html(imagePath(row.capture, manifest, output))}"></a>`
      : '<p>No current image was captured.</p>';
    const problems = (row.problems ?? []).map(value => `<li>${html(value)}</li>`).join('');
    const referenceProblems = (before?.problems ?? []).map(value => `<li>${html(value)}</li>`).join('');
    return `<section><h2>${html(row.url)}</h2><p>${html(`${row.env?.viewport?.join("×") ?? row.width}px · ${row.state} · ${row.ctx} · ${row.route} · ${row.captureScope ?? "full-page"}`)}</p>
      <div class="pair"><div><h3>Reference</h3><ul>${referenceProblems}</ul>${oldImage}</div><div><h3>Current</h3><ul>${problems}</ul>${newImage}</div></div></section>`;
  });
  const missing = reference.filter(row => !visited.has(key(row))).map(row =>
    `<li>${html(`${row.url} · ${row.width}px · ${row.state} · ${row.ctx}`)}${row.problems?.length ? `<p>Reference findings: ${html(row.problems.join("; "))}</p>` : ""}</li>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Capture comparison</title>
    <style>body{font:16px system-ui;margin:2rem}section{border-top:1px solid;padding:1rem 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:1rem}img{max-width:100%;height:auto}h2{overflow-wrap:anywhere}</style>
    <h1>Capture comparison</h1><p>Inspect each pair at native scale. Images capture moments in running animation; differences need review. This report does not establish motion quality or design acceptance.</p>
    <p>Reference: ${html(baseline)}<br>Current: ${html(manifest)}</p>
    ${missing ? `<details><summary>Reference cells absent from this run</summary><ul>${missing}</ul></details>` : ''}${sections.join('\n')}</html>\n`;
}

export async function main(args) {
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return 0; }
  const options = captureArguments(args);
  const baseline = referenceCells(options.baseline);
  const urls = [...new Set(baseline.map(row => row.url))];
  const manifest = resolve(options.out, 'cells.json');
  if (existsSync(manifest)) throw new Error('output already contains cells.json; choose a fresh capture directory');
  mkdirSync(options.out, { recursive: true });
  const run = await runPale({ ...options, urls });
  if (run.signal) throw new Error(`capture interrupted by ${run.signal}`);
  if (run.code !== 2) {
    const current = JSON.parse(readFileSync(manifest, 'utf8'));
    writeFileSync(resolve(options.out, 'comparison.html'), comparison(baseline, current,
      options.baseline, manifest, options.out));
    console.log(`Review ${resolve(options.out, 'comparison.html')}`);
  }
  return run.code ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (error) { console.error(`FAIL: ${error.message}`); process.exitCode = 1; }
}
