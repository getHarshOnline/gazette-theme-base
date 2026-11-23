import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Base's pinned Playwright entry, resolved from this package wherever npm was invoked. */
export const playwrightModule = () => fileURLToPath(import.meta.resolve('playwright'));

/** Launch the pinned headless Chromium. Playwright loads only when a browser is needed. */
export async function launch() {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true, timeout: 15000 });
}

/**
 * Run Pale's capture tool with Base's Playwright. Resolves with the child's exit
 * code and signal; a spawn failure rejects. `timeoutMs` stops a capture that overruns.
 */
export function runPale({ tool, profile, out, urls, extra = [], timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tool, '--profile', profile, '--out', out, ...extra, ...urls], {
      stdio: 'inherit',
      env: { ...process.env, PLAYWRIGHT_MODULE: playwrightModule() },
    });
    const timer = timeoutMs && setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    timer?.unref();
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
}

/**
 * Wait in the page until an image loads or fails, or `ms` passes. A pending image
 * is recorded by the caller as it stands rather than waited on indefinitely.
 */
export const imageSettled = (image, ms) =>
  image.evaluate((element, ms) => element.complete ? null : Promise.race([
    new Promise(resolve => {
      element.addEventListener('load', resolve, { once: true });
      element.addEventListener('error', resolve, { once: true });
    }),
    new Promise(resolve => setTimeout(resolve, ms)),
  ]), ms);
