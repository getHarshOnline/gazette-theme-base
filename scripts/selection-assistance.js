const slots = new Set(['selection', 'article_title', 'article_url', 'site_name', 'site_url', 'section_title', 'context']);
const excluded = 'input,textarea,select,button,[contenteditable]:not([contenteditable="false"])';
const characters = value => Array.from(String(value || ''));
const shorten = (value, limit) => {
  if (limit <= 0) return '';
  const text = characters(value);
  return text.length > limit ? text.slice(0, Math.max(0, limit - 1)).join('') + '…' : text.join('');
};

// The compiler validates the binding; this boundary also keeps malformed page
// data from turning an optional enhancement into a broken reading surface.
export function selectionConfiguration(value) {
  if (!value || typeof value.prompt_template !== 'string' || !value.label || !Array.isArray(value.providers) || !value.providers.length) return null;
  if (!Number.isInteger(value.selection_limit) || value.selection_limit < 1 || value.selection_limit > 4096
      || !Number.isInteger(value.context_limit) || value.context_limit < 0 || value.context_limit > 1024) return null;
  const found = [...value.prompt_template.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]);
  if (found.some(slot => !slots.has(slot)) || ['selection', 'article_url', 'site_name', 'site_url'].some(slot => !found.includes(slot))) return null;
  if (/[{}]/.test(value.prompt_template.replace(/\{[^{}]+\}/g, ''))) return null;
  const identities = new Set();
  for (const provider of value.providers) {
    let endpoint;
    try { endpoint = new URL(provider.endpoint); } catch { return null; }
    if (!provider.id || identities.has(provider.id) || !provider.label || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash
        || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(provider.query_parameter) || endpoint.searchParams.has(provider.query_parameter)) return null;
    identities.add(provider.id);
  }
  return value;
}

export function selectionRequest(configuration, context) {
  const values = {
    selection: shorten(context.selection, configuration.selection_limit),
    context: shorten(context.context, configuration.context_limit),
    article_title: shorten(context.article_title, 256), article_url: String(context.article_url || ''),
    site_name: shorten(context.site_name, 128), site_url: String(context.site_url || ''),
    section_title: shorten(context.section_title, 256)
  };
  // Substitute once: braces in quoted publication text are source material,
  // never another round of template instructions.
  const render = () => configuration.prompt_template.replace(/\{([^{}]+)\}/g, (_, key) => values[key]);
  let prompt = render();
  for (const key of ['context', 'selection']) {
    const excess = characters(prompt).length - 12000;
    if (excess <= 0) break;
    const repetitions = [...configuration.prompt_template.matchAll(/\{([^{}]+)\}/g)].filter(match => match[1] === key).length;
    if (!repetitions) continue;
    values[key] = shorten(values[key], Math.max(key === 'selection' ? 1 : 0, characters(values[key]).length - Math.ceil(excess / repetitions)));
    prompt = render();
  }
  // A path or fixed template can itself exceed the bound. Preserve supplied URLs
  // exactly and omit this optional handoff rather than manufacture a shorter URL.
  return characters(prompt).length <= 12000 ? prompt : null;
}

export function selectionDestination(provider, prompt) {
  const destination = new URL(provider.endpoint);
  destination.searchParams.set(provider.query_parameter, prompt);
  return destination.href;
}

function equalSelection(first, second) {
  return first && second && ['text', 'start', 'startOffset', 'end', 'endOffset'].every(key => first[key] === second[key]);
}

export function mountSelectionAssistance() {
  const popup = document.querySelector('[data-selection-assistance]');
  const scope = document.querySelector('main[data-selection-scope]');
  const article = scope?.querySelector('.publication-body');
  if (!popup || !article) return null;
  const title = scope.querySelector('.reading-page-header > h1, .title-group > h1');
  let configuration;
  try { configuration = selectionConfiguration(JSON.parse(popup.querySelector('[data-selection-configuration]')?.textContent || 'null')); } catch { return null; }
  if (!configuration) return null;
  const actions = [...popup.querySelectorAll('[data-selection-provider]')];
  if (actions.length !== configuration.providers.length || actions.some((action, index) => action.dataset.selectionProvider !== configuration.providers[index].id)) return null;
  const origin = { article_title: popup.dataset.articleTitle, article_url: popup.dataset.articleUrl, site_name: popup.dataset.siteName, site_url: popup.dataset.siteUrl };
  if (Object.values(origin).some(value => !value)) return null;
  let current = null, dismissed = null, previousFocus = null, scheduled = false, selecting = false, gestureChanged = false;

  const dismiss = (restoreFocus = false) => {
    dismissed = current;
    if (restoreFocus && popup.contains(document.activeElement)) {
      const returnTo = previousFocus && ![document.body, document.documentElement].includes(previousFocus) ? previousFocus : article.closest('main');
      returnTo?.focus?.({ preventScroll: true });
    }
    if (popup.hidePopover && !popup.hidden) popup.hidePopover();
    popup.hidden = true;
  };
  const position = rectangle => {
    const gap = parseFloat(getComputedStyle(popup).getPropertyValue('--selection-assistance-gap')) || 0;
    const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--frame-chrome')) || 0;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
    const box = popup.getBoundingClientRect();
    const x = Math.max(left + gap, Math.min(rectangle.left + rectangle.width / 2 - box.width / 2, left + width - box.width - gap));
    const above = rectangle.top - box.height - gap;
    const y = above >= top + chrome + gap ? above : Math.min(rectangle.bottom + gap, top + height - box.height - gap);
    popup.style.left = `${x}px`;
    popup.style.top = `${Math.max(top + gap, y)}px`;
  };
  const update = () => {
    scheduled = false;
    if (selecting) return;
    // Entering a popup link may collapse the browser's painted selection. The
    // captured passage remains stable until the reader leaves or dismisses it.
    if (popup.contains(document.activeElement)) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) { dismiss(); current = null; return; }
    const range = selection.getRangeAt(0);
    const start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const end = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
    const text = selection.toString().trim();
    const readingRegion = [article, title].find(region => region?.contains(start) && region.contains(end));
    if (!text || !readingRegion || start.closest(excluded) || end.closest(excluded)) { dismiss(); return; }
    const next = { text, start: range.startContainer, startOffset: range.startOffset, end: range.endContainer, endOffset: range.endOffset };
    if (equalSelection(next, dismissed)) return;
    const rectangle = range.getBoundingClientRect();
    if (!rectangle.width && !rectangle.height) return;
    if (!equalSelection(current, next)) {
      const paragraph = start.closest('p,li,blockquote,figcaption,td,dd,dt');
      const nearby = readingRegion === article && paragraph && article.contains(paragraph) ? paragraph.textContent.replace(text, '').trim() : '';
      let sectionTitle = title?.textContent.trim() || '';
      for (const heading of article.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
        if (heading === start || heading.contains(start) || heading.compareDocumentPosition(start) & 4) sectionTitle = heading.textContent.trim();
      }
      const prompt = selectionRequest(configuration, { ...origin, selection: text, context: nearby, section_title: sectionTitle });
      if (prompt === null) { dismiss(); return; }
      for (let index = 0; index < actions.length; index++) actions[index].href = selectionDestination(configuration.providers[index], prompt);
      previousFocus = document.activeElement;
      current = next;
      dismissed = null;
    }
    popup.hidden = false;
    if (popup.showPopover && !popup.matches(':popover-open')) popup.showPopover();
    position(rectangle);
  };
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } };
  document.addEventListener('selectionchange', () => { if (selecting) gestureChanged = true; schedule(); });
  const finishSelection = () => {
    if (gestureChanged) dismissed = null;
    selecting = false; gestureChanged = false; schedule();
  };
  document.addEventListener('pointerup', finishSelection);
  document.addEventListener('pointercancel', finishSelection);
  // Native links retain modifier-click, new-tab and context-menu behaviour.
  // Prevent only the mouse press from erasing the selected passage first.
  popup.addEventListener('mousedown', event => { if (event.button === 0) event.preventDefault(); });
  document.addEventListener('pointerdown', event => { if (!popup.contains(event.target)) { selecting = true; gestureChanged = false; dismiss(true); } });
  document.addEventListener('keydown', event => {
    if (event.isComposing || popup.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); dismiss(true); }
    else if (event.key === 'Tab' && !event.shiftKey && !popup.contains(document.activeElement) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault(); actions[0]?.focus({ preventScroll: true });
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') dismiss();
  });
  popup.addEventListener('focusout', event => { if (event.relatedTarget && !popup.contains(event.relatedTarget)) dismiss(); });
  window.addEventListener('scroll', () => dismiss(true), { passive: true, capture: true });
  window.addEventListener('resize', () => dismiss(true), { passive: true });
  window.addEventListener('blur', () => dismiss(true));
  window.addEventListener('pagehide', () => dismiss());
  window.visualViewport?.addEventListener('resize', () => dismiss(true), { passive: true });
  return { dismiss };
}
