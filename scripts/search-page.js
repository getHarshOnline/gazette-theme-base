import { mountSearchExplorer } from './search-explorer.js';
import { mountSearchPond } from './search-pond.js';
import { SEARCH_LIMITS } from './search-limits.js';
import { SEARCH_MATCHING } from './search-matching.js';
import { searchOptions, startSearchWorker } from './search-worker-client.js';
import { applyDestination } from './crossings.js';
import { describeResultContext, readResultContextLabels, renderResultContext } from './result-context.js';
import { rememberBrowseReturn, takeBrowseReturn } from './return-focus.js';

const dimensions = ['kind', 'author', 'project', 'keyword', 'classification'];
const sorts = ['relevance', 'latest', 'oldest'];

// The native fallback has a synchronous index. A worker result uses the same
// projection once its message arrives.
const whenReady = (value, use) => value instanceof Promise ? value.then(use) : use(value);
export function readSearchState(url) {
  const parameters = new URL(url).searchParams;
  const page = Number(parameters.get('page') || '1');
  const filters = {};
  for (const key of dimensions) {
    const value = parameters.get(key);
    if (!value) continue;
    if (key === 'classification') {
      try {
        const selected = JSON.parse(value);
        if (!selected || typeof selected !== 'object' || Array.isArray(selected)
          || Object.keys(selected).length !== 2 || !['taxonomy', 'term'].every(name =>
            typeof selected[name] === 'string' && selected[name].length > 0 && selected[name].length <= 512)) continue;
        filters[key] = JSON.stringify({ taxonomy: selected.taxonomy, term: selected.term });
      } catch { /* Invalid shared URL filters do not disable the HTML catalogue. */ }
    } else if (value.length <= 512) filters[key] = value;
  }
  return { query: parameters.get('q') || '', sort: sorts.includes(parameters.get('sort')) ? parameters.get('sort') : 'relevance',
    page: Number.isSafeInteger(page) && page > 0 && page <= SEARCH_LIMITS.maxDocuments ? page : 1,
    filters };
}

export function searchStateURL(url, state) {
  const destination = new URL(url);
  for (const key of ['q', 'sort', 'page', ...dimensions]) destination.searchParams.delete(key);
  if (state.query) destination.searchParams.set('q', state.query);
  if (state.sort !== 'relevance') destination.searchParams.set('sort', state.sort);
  if (state.page > 1) destination.searchParams.set('page', String(state.page));
  for (const key of dimensions) if (state.filters[key]) destination.searchParams.set(key, state.filters[key]);
  destination.hash = '';
  return destination.href;
}

export function browseSearch(index, state, pageSize) {
  const filters = Object.fromEntries(Object.entries(state.filters).map(([key, value]) => [key,
    [key === 'classification' ? JSON.parse(value) : value]]));
  return index.browse(state.query, { limit: pageSize, offset: Math.min((state.page - 1) * pageSize, SEARCH_LIMITS.maxDocuments),
    sort: state.sort, filters, ...SEARCH_MATCHING });
}

// A keyword is an authored phrase, not a free-text query or a taxonomy slug.
// Display the exact selected identity; labels for other facets come from the corpus.
export function describeSearchSelection(state, facets, labels = {}) {
  for (const key of ['keyword', 'classification', 'project', 'author', 'kind']) {
    const selected = state.filters[key];
    if (!selected) continue;
    const match = (facets[key] || []).find(facet => (key === 'classification'
      ? JSON.stringify({ taxonomy: facet.taxonomy, term: facet.term }) : facet.value) === selected);
    const title = key === 'keyword' ? selected : key === 'classification'
      ? match?.term_label : key === 'kind' ? labels.kinds?.[selected] : match?.label;
    if (title) return { title, label: key === 'classification' ? match.taxonomy_label : labels[key] || '' };
  }
  return null;
}

export function mountSearchPage(root, binding, { preparation = null, workerURL } = {}) {
  const form = root.querySelector('form');
  const status = root.querySelector('[role="status"]');
  const list = root.querySelector('.search-page__results');
  const field = root.querySelector('.search-page__field');
  const fallback = root.querySelector('.search-page__fallback') || document.querySelector('.search-page__fallback');
  const pageSize = Number(root.getAttribute('data-search-page-size'));
  if (!form || !status || !list || !fallback || !binding || !['english', 'lexical'].includes(binding.profile)
      || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) return null;
  const input = form.querySelector('[name="q"]');
  const selects = Object.fromEntries([...dimensions, 'sort'].map(key => [key, form.querySelector(`[name="${key}"]`)]));
  const pagers = [...root.querySelectorAll('.search-page__pagination')];
  const context = root.querySelector('.search-page__context');
  const queryMessage = root.querySelector('.search-page__query-message');
  const retry = root.querySelector('[data-search-retry]');
  const labels = readResultContextLabels(root);
  let index = null;
  let initialResultsPending = false;
  let facetQuery, queryFacets;
  let composing = false, pendingFrame = null, inputRevision = 0, renderRevision = 0, liveHistory = false;
  let waitingForIndex = false, pendingSubmit = false;
  let openContext = null, selectedContext = null;
  let contexts = [], cards = [], resultIds = [];
  let explorer = null;
  const pond = field ? mountSearchPond({ field, form }) : null;
  let returnActivity = 0;
  let state = readSearchState(window.location.href);
  const parameters = new URL(window.location.href).searchParams;
  const nativePage = Number(root.getAttribute('data-search-initial-page'));
  if (!['q', 'sort', 'page', ...dimensions].some(key => parameters.has(key))
      && Number.isSafeInteger(nativePage) && nativePage > 0) state.page = nativePage;
  const base = form.action;
  input.value = state.query; selects.sort.value = state.sort;
  const filtersFor = () => Object.fromEntries(dimensions.filter(key => selects[key].value).map(key => [key, selects[key].value]));
  const option = (value, label) => {
    const item = document.createElement('option'); item.value = value; item.textContent = label; return item;
  };
  const setFacets = facets => {
    for (const key of dimensions) {
      const select = selects[key];
      const values = facets[key].flatMap(facet => {
        const value = key === 'classification' ? JSON.stringify({ taxonomy: facet.taxonomy, term: facet.term }) : facet.value;
        const label = key === 'keyword' ? facet.value : key === 'kind' ? labels.kinds[facet.value]
          : key === 'classification' ? facet.taxonomy_label && facet.term_label && `${facet.taxonomy_label}: ${facet.term_label}` : facet.label;
        return label ? [option(value, `${label} (${facet.count})`)] : [];
      });
      // Preserve the selected identity even when a further query has no matches.
      const selected = state.filters[key];
      if (selected && !values.some(item => item.value === selected)) values.push(option(selected, selected));
      select.replaceChildren(option('', root.getAttribute('data-search-any') || ''), ...values);
      select.value = selected || '';
      select.parentElement.hidden = values.length <= 1 && !state.filters[key];
    }
  };
  const renderContext = facets => {
    const selection = describeSearchSelection(state, facets, { ...labels, keyword: root.getAttribute('data-search-keyword'),
      project: labels.about, classification: '' });
    if (context) {
      context.hidden = !selection;
      if (selection) {
        let heading = context.querySelector('h2');
        if (!heading) { heading = document.createElement('h2'); context.insertBefore(heading, context.querySelector('.search-page__reset')); }
        heading.textContent = selection.title;
        context.querySelector('.search-page__context-label').textContent = selection.label;
        context.querySelector('.search-page__reset').href = searchStateURL(base, { query: '', sort: 'relevance', page: 1, filters: {} });
      } else context.querySelector('h2')?.remove();
    }
  };
  const renderMetadata = entries => renderResultContext(entries, document, (value, role) => {
    if (role === 'keyword') {
      const anchor = document.createElement('a');
      anchor.href = searchStateURL(base, { query: '', sort: 'relevance', page: 1, filters: { keyword: value.text } });
      const site = root.getAttribute('data-source-site') || '';
      const page = binding.page?.content;
      applyDestination(anchor, { site: page?.site || site, content: page?.id, presentation: page?.presentation }, site);
      return anchor;
    }
    const target = value.destination || value.website;
    if (!target?.url || !target.destination) return null;
    let address;
    try { address = new URL(target.url); } catch { return null; }
    if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password) return null;
    const anchor = document.createElement('a'); anchor.href = address.href;
    if (role === 'author') anchor.setAttribute('rel', 'author');
    applyDestination(anchor, target.destination, root.getAttribute('data-source-site') || '');
    return anchor;
  });
  const selectContext = (index, reveal = false) => {
    const details = contexts[index];
    if (!details) return;
    const changed = openContext !== details || !details.open;
    if (openContext && openContext !== details) openContext.open = false;
    selectedContext = openContext = details; details.open = true;
    explorer?.select(index, { scroll: reveal && changed });
  };
  const resultNode = (hit, index) => {
    const record = hit.record;
    const entry = document.createElement('li'), card = document.createElement('article');
    resultIds.push(record.content.id);
    card.className = 'reading-card search-result card-surface card-surface--moving';
    const destinationLink = text => {
      const link = document.createElement('a'); link.href = record.route.url; link.textContent = text;
      applyDestination(link, record.destination ?? { site: record.content.site, content: record.content.id, presentation: record.content.presentation }, root.getAttribute('data-source-site') || '');
      return link;
    };
    const metadata = describeResultContext(record, labels);
    const brief = renderMetadata(metadata.filter(item => ['kind','published'].includes(item.key)));
    if (brief) card.append(brief);
    const title = document.createElement('h2');
    title.append(destinationLink(record.content.title)); card.append(title);
    const details = document.createElement('details'), summary = document.createElement('summary');
    details.id = `search-result-context-${index}`;
    details.className = 'prose-flow';
    const summaryLabel = document.createElement('span');
    summaryLabel.textContent = root.getAttribute('data-search-context') || '';
    summary.append(summaryLabel);
    details.append(summary);
    if (typeof record.content.description === 'string' && record.content.description.trim()) {
      const description = document.createElement('p'); description.className = 'search-result__description'; description.textContent = record.content.description; card.append(description);
    }
    const extra = renderMetadata(metadata.filter(item => ['author','about','mentions','classification','keyword'].includes(item.key)));
    if (extra) details.append(extra);
    const action = document.createElement('p');
    const view = destinationLink(root.getAttribute('data-search-view-page') || '');
    view.className = 'control control--primary control--compact';
    action.append(view); details.append(action);
    details.addEventListener('toggle', () => {
      if (contexts[index] !== details) return;
      // A reader who opens a neighbour's context chooses that card: it becomes the
      // carousel's destination, so a scroll ending elsewhere cannot replace it.
      // Toggle fires after the click, so the travel never moves a pressed target.
      if (details.open) selectContext(index, true);
      else if (openContext === details) {
        openContext = null;
        explorer?.select(index, { scroll: false });
      }
    });
    card.append(details);
    contexts.push(details); cards.push(card);
    entry.append(card); return entry;
  };
  const renderField = hits => {
    if (!field) return;
    explorer?.destroy();
    field.hidden = !hits.length;
    explorer = mountSearchExplorer({ root, list, cards,
      // Scroll completion can report the same card after its context was closed.
      // Only choosing another card opens context automatically.
      onSelect: index => { if (contexts[index] !== selectedContext) selectContext(index); },
    });
    if (explorer) selectContext(0);
  };
  const render = (history = null) => {
    initialResultsPending = false;
    const revision = ++renderRevision;
    const current = () => revision === renderRevision;
    let selected = state;
    const apply = result => {
      if (!current()) return false;
      const pages = Math.max(1, Math.ceil(result.total / pageSize));
      const show = (matches, availableFacets) => {
        if (!current()) return false;
        state = selected;
        facetQuery = state.query;
        queryFacets = availableFacets;
        return commit(matches, pages);
      };
      const withFacets = matches => {
        if (!current()) return false;
        if (!Object.keys(selected.filters).length) return show(matches, matches.facets);
        if (facetQuery === selected.query && queryFacets) return show(matches, queryFacets);
        const all = index.browse(selected.query, { limit: pageSize, ...SEARCH_MATCHING });
        return whenReady(all, unfiltered => show(matches, unfiltered.facets));
      };
      if (selected.page <= pages) return withFacets(result);
      selected = { ...selected, page: pages };
      return whenReady(browseSearch(index, selected, pageSize), withFacets);
    };
    const fail = error => {
      if (!current()) return false;
      list.hidden = true; fallback.hidden = false;
      explorer?.destroy(); explorer = null;
      if (field) field.hidden = true;
      for (const pager of pagers) pager.hidden = true;
      status.textContent = error?.code === 'search_limit' ? root.getAttribute('data-search-query-limit') : status.getAttribute('data-status-unavailable');
      if (error?.code === 'search_worker') {
        index = null;
        if (retry) retry.hidden = false;
      }
      return false;
    };
    const commit = (result, pages) => {
      selectedContext = openContext = null; contexts = []; cards = []; resultIds = [];
      const entries = result.hits.map(resultNode);
      // Only a complete usable result replaces the original HTML catalogue.
      list.replaceChildren(...entries); list.hidden = false; fallback.hidden = true;
      renderField(result.hits);
      input.value = state.query; selects.sort.value = state.sort;
      setFacets(queryFacets);
      renderContext(queryFacets);
      const countLabel = result.total === 1 ? root.getAttribute('data-search-count-one') : root.getAttribute('data-search-count');
      status.textContent = result.total ? (countLabel || root.getAttribute('data-search-count') || '').replace('{count}', String(result.total)) : status.getAttribute('data-status-empty');
      for (const pager of pagers) {
        pager.hidden = pages <= 1;
        pager.querySelector('p').textContent = (root.getAttribute('data-search-pagination') || '').replace('{page}', String(state.page)).replace('{pages}', String(pages));
        for (const [selector, target] of [['.search-page__previous', state.page - 1], ['.search-page__next', state.page + 1]]) {
          const anchor = pager.querySelector(selector); anchor.hidden = target < 1 || target > pages;
          anchor.href = searchStateURL(base, { ...state, page: target });
          pager.querySelector(`${selector}-unavailable`).hidden = !anchor.hidden;
        }
      }
      const destination = searchStateURL(base, state);
      if (history && destination !== window.location.href) {
        window.history[history === 'replace' ? 'replaceState' : 'pushState'](window.history.state, '', destination);
      }
      return true;
    };
    try {
      const result = whenReady(browseSearch(index, selected, pageSize), apply);
      return result instanceof Promise ? result.catch(fail) : result;
    } catch (error) { return fail(error); }
  };
  const cancelInput = () => {
    inputRevision++;
    renderRevision++;
    if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  };
  // The field that failed carries its own error: an invalid state and the
  // message beside it. The status row still announces it while the reader types.
  const markQuery = message => {
    input.setCustomValidity(message);
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    if (!queryMessage) return;
    queryMessage.textContent = message; queryMessage.hidden = !message;
    if (message) input.setAttribute('aria-describedby', queryMessage.id); else input.removeAttribute('aria-describedby');
  };
  const validQuery = (report = false) => {
    if (new TextEncoder().encode(input.value).length > SEARCH_LIMITS.maxQueryBytes) {
      const message = root.getAttribute('data-search-query-limit') || '';
      markQuery(message); status.textContent = message;
      if (report) input.reportValidity();
      return false;
    }
    markQuery('');
    return true;
  };
  const applyInput = history => {
    state = { query: input.value, sort: selects.sort.value, page: 1, filters: filtersFor() };
    return render(history);
  };
  const queueInput = () => {
    if (!index || composing || pendingFrame !== null) return;
    const revision = inputRevision;
    pendingFrame = window.requestAnimationFrame(() => {
      if (revision !== inputRevision) return;
      pendingFrame = null;
      if (composing || !validQuery()) return;
      const previousURL = window.location.href;
      whenReady(applyInput(liveHistory ? 'replace' : 'push'), applied => {
        if (applied && window.location.href !== previousURL) liveHistory = true;
      });
    });
  };
  input.addEventListener('input', event => {
    renderRevision++;
    markQuery('');
    pond?.nudge();
    if (event.isComposing) cancelInput();
    else queueInput();
  });
  input.addEventListener('compositionstart', () => { composing = true; cancelInput(); });
  input.addEventListener('compositionend', () => { composing = false; queueInput(); });
  form.addEventListener('submit', event => {
    event.preventDefault(); cancelInput();
    if (composing || event.isComposing) return;
    liveHistory = false;
    if (index && validQuery(true)) { pond?.scatter(); applyInput('push'); }
    else if (waitingForIndex && validQuery(true)) pendingSubmit = true;
  });
  form.addEventListener('change', event => { if (event.target !== input) form.requestSubmit(); });
  for (const pager of pagers) pager.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); cancelInput(); liveHistory = false;
    state = readSearchState(link.href);
    whenReady(render('push'), applied => {
      if (!applied) return;
      // The next/previous link may disappear at the new boundary. Move to the
      // updated result count only after an explicit page action, not on refinement.
      status.setAttribute('tabindex', '-1');
      status.focus({ preventScroll: true });
      status.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  });
  window.addEventListener('popstate', () => {
    cancelInput(); liveHistory = false; composing = false;
    if (index) { state = readSearchState(window.location.href); render(); }
  });
  window.addEventListener('scroll', () => {
    if (initialResultsPending && window.scrollY <= 0) render();
  }, { passive: true });
  window.addEventListener('pagehide', cancelInput);
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(type, event => {
    if (event.isTrusted) returnActivity++;
  }, { passive: true });
  list.addEventListener('click', event => {
    if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target && link.target !== '_self') return;
    const at = cards.findIndex(card => card.contains(link));
    if (at < 0) return;
    rememberBrowseReturn(window.history, { source: window.location.href, id: resultIds[at], href: link.href,
      offset: cards[at].getBoundingClientRect().top, open: contexts[at].open,
      refine: Boolean(form.querySelector('details')?.open) });
  });
  const restoreReturn = () => {
    const saved = takeBrowseReturn(window.history, window.location.href);
    if (!saved || returnActivity) return;
    const at = resultIds.indexOf(saved.id);
    if (at < 0) return;
    const refine = form.querySelector('details');
    if (refine) refine.open = saved.refine;
    selectContext(at);
    if (!saved.open) { contexts[at].open = false; openContext = null; }
    explorer?.select(at, { instant: true });
    window.requestAnimationFrame(() => {
      if (returnActivity) return;
      const link = [...cards[at].querySelectorAll('a[href]')].find(link => link.href === saved.href);
      link?.focus({ preventScroll: true });
      window.scrollBy(0, cards[at].getBoundingClientRect().top - saved.offset);
    });
  };
  window.addEventListener('pageshow', event => { if (event.persisted && index) { returnActivity = 0; restoreReturn(); } });
  // An unavailable index keeps the native catalogue and offers one retry, as the
  // command Search tenant does. A retry the reader started keeps their focus
  // nearby: on the status while loading, then the field or Retry again.
  const load = () => {
    const recovering = document.activeElement === status;
    status.textContent = status.getAttribute('data-status-loading');
    const worker = preparation || startSearchWorker(workerURL, binding, pageSize);
    preparation = null;
    const localIndex = () => import('@base/search-sdk').then(({ loadIndex }) =>
      loadIndex(binding.url, searchOptions(binding.profile, pageSize)));
    waitingForIndex = Boolean(worker);
    if (worker) form.hidden = false;
    const acquire = worker ? worker.ready.then(() => worker).catch(error => {
      worker.close();
      if (error.code === 'search_worker') return localIndex();
      throw error;
    }) : localIndex();
    acquire.then(value => {
      index = value;
      waitingForIndex = false;
      const returning = window.performance?.getEntriesByType('navigation')[0]?.type === 'back_forward';
      const queryChanged = input.value !== state.query;
      const submitted = pendingSubmit;
      pendingSubmit = false;
      let applied;
      if (submitted || queryChanged && !composing && validQuery()) {
        applied = applyInput('push');
      }
      // Keep the document under a reader who scrolled into the native catalogue.
      // A query or a return to the top can switch to the shorter search surface.
      else if (!parameters.size && !returning && window.scrollY > 0 || composing) {
        initialResultsPending = true;
        status.textContent = '';
      } else applied = render();
      whenReady(applied, () => {
        form.hidden = false;
        if (recovering && document.activeElement === status) input.focus({ preventScroll: true });
        if (returning) restoreReturn();
      });
    }, () => {
      waitingForIndex = false;
      status.textContent = status.getAttribute('data-status-unavailable');
      if (!retry) return;
      retry.hidden = false;
      if (recovering && document.activeElement === status) retry.focus({ preventScroll: true });
    });
  };
  retry?.addEventListener('click', () => {
    status.setAttribute('tabindex', '-1');
    status.focus({ preventScroll: true });
    retry.hidden = true;
    load();
  });
  load();
  return { refresh: () => index && render() };
}
