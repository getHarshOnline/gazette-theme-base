// The browser navigates and restores page scroll. On Back or Forward, Base can
// restore focus to the exact followed link, identified by data-gazette-link or id,
// or reopen Search with its query, result and scroll. This module also stores the
// catalogue's selected entry and pause choice, and the full-page result context.
// Search snapshots are size-limited; catalogue and discovery fields have bounds.
const stateKey = 'gazette:return-focus';
const browseKey = 'gazette:browse-return';
const catalogueKey = 'gazette:catalogue-return';
const recordState = value => value === null || (typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)));

const catalogueIdentity = value => typeof value === 'string' && value.length > 0 && value.length <= 4096;

export function rememberCatalogueReturn(history, address, destination, paused) {
  if (!recordState(history.state) || !catalogueIdentity(address) || !catalogueIdentity(destination)) return;
  const saved = history.state?.[catalogueKey] ?? null;
  if (!recordState(saved)) return;
  try {
    history.replaceState({ ...history.state, [catalogueKey]: { ...saved, [address]: { destination, paused } } }, '');
  } catch { /* A restricted history keeps its native navigation. */ }
}

export function catalogueReturn(history, address, navigationType) {
  if (navigationType !== 'back_forward' || !catalogueIdentity(address) || !recordState(history.state)) return null;
  const entries = history.state?.[catalogueKey] ?? null;
  const saved = recordState(entries) && entries && Object.hasOwn(entries, address) ? entries[address] : null;
  return catalogueIdentity(saved?.destination) && typeof saved.paused === 'boolean' ? saved : null;
}

// Full-page discovery has its own nonmodal return context. Browser history owns
// the URL; only the exact result and its viewport offset are retained here.
const browseState = value => value && ['source', 'id', 'href'].every(key =>
  typeof value[key] === 'string' && value[key].length > 0 && value[key].length <= 4096)
  && Number.isFinite(value.offset) && Math.abs(value.offset) <= 100000
  && typeof value.open === 'boolean' && typeof value.refine === 'boolean';

export function rememberBrowseReturn(history, value) {
  if (!recordState(history.state) || !browseState(value)) return false;
  try { history.replaceState({ ...history.state, [browseKey]: value }, ''); return true; }
  catch { return false; }
}

export function takeBrowseReturn(history, source) {
  if (!recordState(history.state)) return null;
  const value = history.state?.[browseKey];
  if (!browseState(value) || value.source !== source) return null;
  try {
    const next = { ...history.state }; delete next[browseKey]; history.replaceState(next, '');
    return value;
  } catch { return null; }
}
const searchState = value => {
  if (value?.kind !== 'search' || !['query', 'id', 'url'].every(key => typeof value[key] === 'string') || !value.id || !value.url) return false;
  if (value.scrollTop !== undefined && (!Number.isFinite(value.scrollTop) || value.scrollTop < 0 || value.scrollTop > 1_000_000)) return false;
  try { return new TextEncoder().encode(JSON.stringify(value)).length <= 16 * 1024; }
  catch { return false; }
};

const identity = element => {
  const key = element?.getAttribute?.('data-gazette-link');
  if (key && element.href) return { kind: 'occurrence', key, href: element.href };
  if (element?.id) return { kind: 'id', key: element.id };
  const command = element?.getAttribute?.('data-command-trigger');
  return command ? { kind: 'command', key: command } : null;
};
// A carousel ring repeats its cards as inert, aria-hidden decorative clones
// that keep the link key and address. They are never a focus target, so they
// must not make the live link look ambiguous.
const decorative = element => Boolean(element.closest('[inert],[aria-hidden="true"]'));
const resolveIdentity = saved => {
  if (!saved || typeof saved.key !== 'string') return null;
  const candidates = saved.kind === 'command'
    ? [...document.querySelectorAll('[data-command-trigger]')].filter(element => element.getAttribute('data-command-trigger') === saved.key)
    : [...document.querySelectorAll('a[href],[id]')].filter(element =>
      saved.kind === 'id' ? element.id === saved.key : saved.kind === 'occurrence' &&
      element.getAttribute('data-gazette-link') === saved.key && element.href === saved.href);
  const live = candidates.filter(element => !decorative(element));
  return live.length === 1 ? live[0] : null;
};

// Search supplies the result's fixed identity; this module stores
// only its bounded return context on the source entry, never another URL entry.
export function rememberSearchReturn(snapshot, invoker) {
  const value = { kind: 'search', query: snapshot?.query, id: snapshot?.id, url: snapshot?.url, scrollTop: snapshot?.scrollTop ?? 0, invoker: identity(invoker) };
  if (!recordState(history.state) || !searchState(value)) return false;
  try { history.replaceState({ ...history.state, [stateKey]: value }, ''); return true; }
  catch { return false; }
}

export function mountReturnFocus({ restoreSearch } = {}) {
  const lifecycle = new AbortController();
  let pending = null, activity = 0;
  const cancel = () => {
    if (pending !== null) cancelAnimationFrame(pending);
    pending = null;
  };
  const userInput = event => {
    if (event.isTrusted) { activity++; cancel(); }
  };
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(type, userInput, { passive: true, signal: lifecycle.signal });
  }
  window.addEventListener('click', event => {
    if (!event.isTrusted || event.defaultPrevented || event.button || event.metaKey ||
      event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download')) return;
    const target = link.getAttribute('target') ?? document.querySelector('base[target]')?.getAttribute('target') ?? '';
    if (target && target.toLowerCase() !== '_self') return;
    let destination, current;
    try { destination = new URL(link.href); current = new URL(location.href); } catch { return; }
    if (!['http:', 'https:'].includes(destination.protocol)) return;
    if (destination.origin === current.origin && destination.pathname === current.pathname &&
      destination.search === current.search) return;
    const key = link.getAttribute('data-gazette-link');
    const id = link.id;
    if ((!key && !id) || !recordState(history.state)) return;
    try {
      history.replaceState({ ...history.state, [stateKey]: {
        kind: key ? 'occurrence' : 'id', key: key || id, href: link.href,
      } }, '');
    } catch { /* A restricted history keeps its native navigation. */ }
  }, { signal: lifecycle.signal });
  window.addEventListener('pageshow', event => {
    cancel();
    const traversal = event.persisted || performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
    if (!traversal || !recordState(history.state)) return;
    const saved = history.state?.[stateKey];
    const search = searchState(saved);
    if (!search && (!saved || !['occurrence', 'id'].includes(saved.kind) || typeof saved.key !== 'string' || typeof saved.href !== 'string')) return;
    if (search) {
      // Consume before waiting: dismissal, new input, browser-restored focus or an
      // unavailable tenant must never leave a stale automatic-reopen instruction.
      try { const next = { ...history.state }; delete next[stateKey]; history.replaceState(next, ''); }
      catch { return; }
      if (typeof restoreSearch !== 'function') return;
    }
    const version = activity;
    // Native radios and component exposure reconcile in their pageshow frame.
    // One following frame is enough; hidden or vanished targets are never forced open.
    pending = requestAnimationFrame(() => {
      pending = requestAnimationFrame(() => {
        pending = null;
        if (lifecycle.signal.aborted || activity !== version ||
          ![null, document.body, document.documentElement].includes(document.activeElement)) return;
        if (search) {
          if (document.querySelector('dialog[open]')) return;
          restoreSearch(saved, {
            invoker: resolveIdentity(saved.invoker),
            isCurrent: () => !lifecycle.signal.aborted && activity === version,
          });
          return;
        }
        const matches = [...document.querySelectorAll('a[href]')].filter(link => !decorative(link) &&
          (saved.kind === 'occurrence' ? link.getAttribute('data-gazette-link') : link.id) === saved.key && link.href === saved.href);
        if (matches.length !== 1) return;
        const link = matches[0], style = getComputedStyle(link);
        if (!link.isConnected || !link.getClientRects().length || style.visibility === 'hidden' || style.display === 'none' ||
          link.closest('[hidden],[inert],[aria-hidden="true"]')) return;
        link.focus({ preventScroll: true });
      });
    });
  }, { signal: lifecycle.signal });
  window.addEventListener('pagehide', cancel, { signal: lifecycle.signal });
  return () => { lifecycle.abort(); cancel(); };
}
