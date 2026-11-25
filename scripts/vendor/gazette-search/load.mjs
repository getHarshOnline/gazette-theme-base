// SPDX-License-Identifier: Apache-2.0
// Acquisition is explicit and separate from the pure captured index and query operations.
import { MAX_SEARCH_BYTES, SearchError, address, fail, integer, keys, optionKeys, options } from './corpus.mjs';

export async function acquire(exactUrl, configuration) {
  const required = [...optionKeys, 'allowNetwork', 'maxResponseBytes', 'timeoutMs'];
  keys(configuration, [...required, 'idleTimeoutMs'], required);
  const selected = options(Object.fromEntries(optionKeys.map(key => [key, configuration[key]])));
  if (configuration.allowNetwork !== true) fail('search_permission');
  const maximum = integer(configuration.maxResponseBytes, MAX_SEARCH_BYTES);
  const timeout = integer(configuration.timeoutMs, 300_000);
  const idleTimeout = configuration.idleTimeoutMs === undefined
    ? undefined : integer(configuration.idleTimeoutMs, timeout);
  const url = address(exactUrl);
  if (url.search) fail('search_url');
  const controller = new AbortController();
  let expired = false;
  const expire = () => { expired = true; controller.abort(); };
  const timer = setTimeout(expire, timeout);
  let idleTimer;
  function progress() {
    if (idleTimeout === undefined) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(expire, idleTimeout);
  }
  let reader;
  try {
    progress();
    const response = await fetch(exactUrl, {
      method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-cache',
      referrerPolicy: 'no-referrer', signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (response.status !== 200 || response.redirected || response.url !== url.href
        || response.type === 'opaque' || response.body === null) fail('search_response');
    const mime = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (mime !== 'application/json') fail('search_response');
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) fail('search_limit');
    progress();
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) fail('search_limit');
      if (value.byteLength) progress();
      chunks.push(value);
    }
    const payload = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { payload.set(chunk, offset); offset += chunk.byteLength; }
    let records;
    try { records = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload)); }
    catch { fail('search_data'); }
    return { records, selected };
  } catch (error) {
    if (expired) fail('search_timeout');
    if (error instanceof SearchError) throw error;
    fail('search_network');
  } finally {
    clearTimeout(timer);
    clearTimeout(idleTimer);
    controller.abort();
    if (reader) {
      try { await reader.cancel(); } catch { /* Preserve the original acquisition result. */ }
      reader.releaseLock();
    }
  }
}
