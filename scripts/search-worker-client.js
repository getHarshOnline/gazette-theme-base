import { SEARCH_LIMITS } from './search-limits.js';

export function searchOptions(profile, maxResults) {
  return { ...SEARCH_LIMITS, maxResults, profile, allowNetwork: true };
}

// Start acquisition as soon as the selected Search route and corpus are known.
// The SDK remains the owner of response validation and ranking in either context.
export function startSearchWorker(workerURL, binding, maxResults) {
  if (!workerURL || !binding || !['english', 'lexical'].includes(binding.profile)
      || !Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > 1000
      || typeof window.Worker !== 'function') return null;
  let worker;
  try {
    const url = new URL(workerURL, window.location.href);
    const corpus = new URL(binding.url);
    if (url.origin !== window.location.origin || corpus.origin !== url.origin
        || url.search || url.hash || url.username || url.password) return null;
    worker = new window.Worker(url, { type: 'module', name: 'publication-search' });
  } catch { return null; }

  const pending = new Map();
  let id = 0, closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('pagehide', onHide);
    worker.terminate();
    const error = Object.assign(new Error('Search worker is unavailable.'), { code: 'search_worker' });
    for (const task of pending.values()) task.reject(error);
    pending.clear();
  };
  worker.onmessage = ({ data }) => {
    const task = pending.get(data.id);
    if (!task) return;
    pending.delete(data.id);
    if (data.error) task.reject(Object.assign(new Error(data.error), { code: data.error }));
    else task.resolve(data.value);
  };
  worker.onerror = close;
  worker.onmessageerror = close;
  const command = (operation, ...args) => new Promise((resolve, reject) => {
    if (closed) throw Object.assign(new Error('Search worker is unavailable.'), { code: 'search_worker' });
    const next = ++id;
    pending.set(next, { resolve, reject });
    try {
      worker.postMessage({ id: next, operation, args });
    } catch (error) {
      pending.delete(next);
      reject(error);
    }
  });
  const onHide = event => { if (!event.persisted) close(); };
  window.addEventListener('pagehide', onHide);
  const deadline = setTimeout(close, SEARCH_LIMITS.timeoutMs + 10_000);
  const ready = command('load', binding.url, searchOptions(binding.profile, maxResults))
    .finally(() => clearTimeout(deadline));
  // The shell and this acquisition start together. The controller observes the
  // original failure even if it mounts after the worker has already responded.
  void ready.catch(() => {});
  return { ready, browse: (query, options) => command('browse', query, options), close };
}
