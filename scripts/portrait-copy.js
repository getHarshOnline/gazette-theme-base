export function portraitCopyVisibility(copyTop, sceneTop, headerBottom) {
  const clearance = copyTop - sceneTop - headerBottom;
  if (![copyTop, sceneTop, headerBottom, clearance].every(Number.isFinite) || clearance <= 0) return 1;
  return Math.max(0, Math.min(1, (copyTop - headerBottom) / clearance));
}

// Copy clearance belongs to the page, even when its optional portrait cannot run.
export function mountPortraitCopy(copy, scene) {
  if (!copy) return () => {};
  const doc = copy.ownerDocument, win = doc.defaultView;
  const header = doc.querySelector('.frame__header');
  if (!header) return () => {};
  const lifecycle = new win.AbortController();
  const property = '--portrait-scroll-opacity';
  const previous = copy.style.getPropertyValue(property);
  const priority = copy.style.getPropertyPriority(property);
  let printing = false;
  function geometry() {
    const text = copy.getBoundingClientRect(), field = scene.getBoundingClientRect();
    const chrome = header.getBoundingClientRect();
    const fixed = win.getComputedStyle(header).position === 'fixed' && chrome.height > 0;
    return { text, field, chrome, fixed };
  }
  function update() {
    const { text, field, chrome, fixed } = geometry();
    const opacity = printing || !fixed ? 1 : portraitCopyVisibility(text.top, field.top, chrome.bottom);
    copy.style.setProperty(property, String(opacity));
  }
  function focus() {
    const { text, field, chrome, fixed } = geometry();
    if (fixed && portraitCopyVisibility(text.top, field.top, chrome.bottom) < 1) {
      // Restore the group's clear resting position before showing a focused link.
      const clearance = text.top - field.top - chrome.bottom;
      win.scrollBy({ top: text.top - chrome.bottom - clearance, behavior: 'instant' });
    }
    update();
  }
  const options = { passive: true, signal: lifecycle.signal };
  win.addEventListener('scroll', update, options);
  win.addEventListener('resize', update, options);
  win.addEventListener('pageshow', update, options);
  win.addEventListener('beforeprint', () => { printing = true; update(); }, options);
  win.addEventListener('afterprint', () => { printing = false; update(); }, options);
  copy.addEventListener('focusin', focus, options);
  const sizing = win.ResizeObserver ? new win.ResizeObserver(update) : null;
  for (const element of [copy, scene, header]) sizing?.observe(element);
  const navigation = win.MutationObserver ? new win.MutationObserver(update) : null;
  navigation?.observe(header, { attributes: true, attributeFilter: ['data-navigation-mode'] });
  update();
  return () => {
    lifecycle.abort(); sizing?.disconnect(); navigation?.disconnect();
    if (previous) copy.style.setProperty(property, previous, priority);
    else copy.style.removeProperty(property);
  };
}
