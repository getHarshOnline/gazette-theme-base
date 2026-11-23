import { SEARCH_LIMITS } from './search-limits.js';
import { SEARCH_MATCHING } from './search-matching.js';

const MAX_RESULTS = 20;
const LIMITS = Object.freeze({ maxInputBytes: SEARCH_LIMITS.maxQueryBytes + 256,
  maxOutputBytes: SEARCH_LIMITS.maxBytes, maxResults: MAX_RESULTS,
  maxNodes: 100000, maxDepth: 32, maxConcurrent: 2, timeoutMs: SEARCH_LIMITS.timeoutMs });
const report = error => {
  if (error?.code !== 'webmcp_unsupported') console.warn('Reader tools could not start.');
};

export function mountWebMcp(document, data) {
  if (typeof document?.modelContext?.registerTool !== 'function') return null;
  const { binding, currentPage, search } = data || {};
  if (binding?.contract !== 'publication-webmcp-v1' || !Array.isArray(binding.tools)
      || !binding.tools.length || new Set(binding.tools).size !== binding.tools.length
      || binding.tools.some(tool => !['current_page', 'search'].includes(tool))
      || !currentPage?.content?.id || !currentPage.content.site
      || !currentPage.route?.canonical_url || typeof currentPage.body_text !== 'string') return null;
  if (binding.tools.includes('search') && (!search?.url || !['lexical', 'english'].includes(search.profile))) return null;
  const browser = document.defaultView;
  let wanted = true, disposed = false, generation = 0;
  let registration = null, connecting = null, index = null, acquisition = null;
  const check = (signal, expected) => {
    signal.throwIfAborted();
    if (disposed || !wanted || expected !== generation) throw new DOMException('Reader tools are closed.', 'AbortError');
  };
  const configuration = expected => {
    const selected = { tools: binding.tools, limits: LIMITS };
    if (binding.tools.includes('current_page')) {
      selected.currentPage = ({ signal }) => { check(signal, expected); return currentPage; };
    }
    if (binding.tools.includes('search')) {
      selected.search = async (query, { limit, signal }) => {
        check(signal, expected);
        if (!index) {
          const { loadIndex } = await import('@base/search-sdk');
          check(signal, expected);
          acquisition ??= loadIndex(search.url, { ...SEARCH_LIMITS, maxResults: MAX_RESULTS,
            profile: search.profile, allowNetwork: true }).then(value => { index = value; })
            .finally(() => { acquisition = null; });
          // The SDK bounds acquisition itself. Cancellation prevents using its result;
          // it does not promise to interrupt an in-progress fetch or synchronous ranking.
          await acquisition;
        }
        check(signal, expected);
        const results = index.search(query, { limit, ...SEARCH_MATCHING });
        check(signal, expected);
        return results;
      };
    }
    return selected;
  };
  const connect = () => {
    if (connecting) return connecting;
    connecting = (async () => {
      while (wanted && !disposed && !registration) {
        const expected = generation;
        const { registerReadOnlyTools } = await import('@base/webmcp');
        if (disposed || !wanted || expected !== generation) continue;
        const next = await registerReadOnlyTools(document, configuration(expected));
        if (disposed || !wanted || expected !== generation) next.close();
        else registration = next;
      }
    })().finally(() => { connecting = null; });
    return connecting;
  };
  const hide = () => {
    wanted = false;
    generation++;
    registration?.close();
    registration = null;
  };
  const show = event => {
    if (!event.persisted || disposed) return;
    wanted = true;
    void connect().catch(report);
  };
  browser.addEventListener('pagehide', hide);
  browser.addEventListener('pageshow', show);
  return {
    ready: connect(),
    close() {
      disposed = true;
      hide();
      browser.removeEventListener('pagehide', hide);
      browser.removeEventListener('pageshow', show);
    }
  };
}

if (typeof document !== 'undefined' && typeof document.modelContext?.registerTool === 'function') {
  const binding = document.getElementById('webmcp-binding');
  if (binding) {
    try { mountWebMcp(document, JSON.parse(binding.textContent))?.ready.catch(report); }
    catch (error) { report(error); }
  }
}
