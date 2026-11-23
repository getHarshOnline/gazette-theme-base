export { mountSearchPage } from './search-page.js';
import { SEARCH_LIMITS } from './search-limits.js';
import { SEARCH_MATCHING } from './search-matching.js';
import { loadIndex } from '@base/search-sdk';
import { applyDestination } from './crossings.js';
import { describeResultContext, readResultContextLabels, renderResultContext } from './result-context.js';

// Work bounds: 10,000 documents / 8 MiB keep synchronous indexing finite;
// 1 KiB queries and 20 results bound ranking and DOM work; 10 s caps acquisition.
const LIMITS = Object.freeze({ ...SEARCH_LIMITS, maxResults: 20 });

// This tenant reads the compiler's search binding and immutable SDK result records.
// It never constructs an endpoint, metadata, or a replacement search corpus.
export function mountSearch(tenant, binding, dismiss, rememberResult) {
  const input = tenant.querySelector('input');
  const list = tenant.querySelector('[role="listbox"]');
  const status = tenant.querySelector('[role="status"]');
  const retry = tenant.querySelector('[data-search-retry]');
  if (!input || !list || !status || !binding || !['lexical', 'english'].includes(binding.profile)) return null;
  let url;
  try {
    url = new URL(binding.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  } catch { return null; }
  let index = null;
  let pending = null;
  let active = -1;
  let options = [];
  let open = false;
  let failed = false;
  let composing = false;
  let recovery = null;
  const enter = position => {
    const option = options[position];
    if (!option) return;
    choose(position);
    try { rememberResult?.({ query: input.value, id: option.id, url: option.url, scrollTop: list.scrollTop }); }
    catch { /* Restricted history must not block navigation to the supplied destination. */ }
    window.location.assign(option.url);
  };
  const contextLabels = readResultContextLabels(tenant);
  const labels = { loading: status.getAttribute('data-status-loading'), empty: status.getAttribute('data-status-empty'), unavailable: status.getAttribute('data-status-unavailable'), idle: status.getAttribute('data-status-idle') };
  const message = state => {
    status.textContent = labels[state] || '';
    if (retry) retry.hidden = state !== 'unavailable';
  };
  const collapse = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    for (const option of options) option.node.setAttribute('aria-selected', 'false');
    active = -1;
  };
  const clear = () => { collapse(); list.replaceChildren(); options = []; };
  const choose = position => {
    if (!options.length) return;
    active = (position + options.length) % options.length;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    for (let i = 0; i < options.length; i++) options[i].node.setAttribute('aria-selected', String(i === active));
    input.setAttribute('aria-activedescendant', options[active].node.id);
    options[active].node.scrollIntoView({ block: 'nearest' });
  };
  const render = () => {
    clear();
    if (!open) return;
    if (failed) { message('unavailable'); return; }
    if (!index) { message(pending ? 'loading' : null); return; }
    const query = input.value.trim();
    if (!query) { message('idle'); return; }
    try {
      const hits = index.search(query, { limit: LIMITS.maxResults, ...SEARCH_MATCHING });
      // Build the complete result set before inserting anything. A malformed
      // destination rejects this view, rather than exposing a partially safe list.
      const next = hits.map((hit, position) => {
        const record = hit.record;
        const destination = new URL(record.route.url);
        if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password
            || typeof record.content.title !== 'string' || !record.content.title.trim()
            || typeof record.content.id !== 'string' || !record.content.id) throw new Error('search_data');
        const container = document.createElement('li');
        container.setAttribute('role', 'presentation');
        const node = document.createElement('a');
        node.href = destination.href;
        node.tabIndex = -1;
        node.id = `${list.id}-${position}`;
        node.setAttribute('role', 'option');
        node.setAttribute('aria-selected', 'false');
        const title = document.createElement('span');
        title.className = 'shell__result-title';
        title.textContent = record.content.title;
        applyDestination(node, record.destination ?? {
          site: record.content.site, content: record.content.id,
          presentation: record.content.presentation
        }, tenant.getAttribute?.('data-source-site') || '');
        node.append(title);
        if (typeof record.content.description === 'string' && record.content.description.trim()) {
          const description = document.createElement('p');
          description.className = 'shell__result-description';
          description.textContent = record.content.description;
          node.append(description);
        }
        const metadata = renderResultContext(describeResultContext(record, contextLabels), document);
        if (metadata) node.append(metadata);
        node.addEventListener('pointerdown', event => event.preventDefault());
        node.addEventListener('pointermove', () => choose(position));
        node.addEventListener('click', event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
          event.preventDefault();
          enter(position);
        });
        container.append(node);
        return { node, container, id: record.content.id, url: destination.href };
      });
      options = next;
      list.replaceChildren(...options.map(option => option.container));
      list.hidden = !options.length;
      input.setAttribute('aria-expanded', String(options.length > 0));
      message(options.length ? null : 'empty');
      if (options.length) status.textContent = (status.getAttribute('data-status-results') || '').replace('{count}', String(options.length));
      if (recovery) {
        const saved = recovery;
        recovery = null;
        if (saved.isCurrent() && input.value === saved.query) {
          const matches = options.map((option, position) => ({ option, position }))
            .filter(({ option }) => option.id === saved.id && option.url === saved.url);
          if (matches.length === 1) {
            choose(matches[0].position);
            if (saved.isCurrent() && input.value === saved.query && Number.isFinite(saved.scrollTop) && saved.scrollTop >= 0) {
              list.scrollTop = saved.scrollTop;
            }
          }
        }
      }
    } catch { clear(); message('unavailable'); }
  };
  const acquire = () => {
    if (index || pending) { render(); return; }
    failed = false;
    message('loading');
    pending = loadIndex(binding.url, {
      ...LIMITS, profile: binding.profile, allowNetwork: true
    }).then(value => { index = value; }, () => { failed = true; }).finally(() => {
      pending = null;
      render();
    });
  };
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; render(); });
  input.addEventListener('input', () => { recovery = null; if (!composing) render(); });
  input.addEventListener('keydown', event => {
    if (composing || event.isComposing) return;
    if (event.key === 'Escape' && input.getAttribute('aria-expanded') === 'true') {
      collapse(); event.preventDefault(); event.stopPropagation();
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); dismiss();
    } else if (['ArrowDown', 'ArrowUp'].includes(event.key) && options.length) {
      choose(active < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : active + (event.key === 'ArrowDown' ? 1 : -1));
      event.preventDefault();
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault(); enter(active);
    } else if (event.key === 'Tab') collapse();
  });
  if (retry) retry.addEventListener('click', () => { input.focus(); acquire(); });
  collapse();
  return {
    activate({ restore, isCurrent = () => true } = {}) {
      recovery = restore ? { ...restore, isCurrent } : null;
      if (restore) input.value = restore.query;
      open = true; input.focus(); acquire();
    },
    deactivate() { recovery = null; open = false; collapse(); }
  };
}
