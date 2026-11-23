// Move the one HTML outline; reading-position.js still supplies the current heading.
export function mountReadingNavigation({ position, header, closeMenu = () => {} }) {
  const navigation = position?.navigation;
  const disclosure = navigation?.closest('.reading-section-control');
  const summary = disclosure?.querySelector(':scope > summary');
  const current = summary?.querySelector('.reading-section-current');
  if (!navigation || !disclosure || !summary || !current || !header) return null;
  const home = disclosure.parentNode, next = disclosure.nextSibling;
  const siteNavigation = header.querySelector('.frame__nav');
  const initialRow = header.querySelector(':scope > .reading-header-row[data-reading-initial]');
  const row = initialRow || document.createElement('div');
  row.className = 'reading-header-row';
  const fallback = row.querySelector('.reading-header-fallback');
  const focusedControl = () => disclosure.contains(document.activeElement) ? document.activeElement : null;
  const retainFocus = focus => { if (focus?.isConnected && document.activeElement !== focus) focus.focus({ preventScroll: true }); };
  let flow = false, printing = false, state = null, focusVersion = 0, printFocus = null, tabDeparture = false;
  const restore = () => {
    const focus = focusedControl();
    if (disclosure.parentNode !== home) home.insertBefore(disclosure, next?.parentNode === home ? next : null);
    if (fallback) fallback.hidden = false;
    if (!initialRow) row.remove();
    retainFocus(focus);
  };
  const recompose = () => {
    if (printing) return;
    const focus = focusedControl();
    flow = !!state?.flow;
    if (flow) {
      const fallbackFocused = fallback && document.activeElement === fallback;
      if (row.parentNode !== header) header.append(row);
      if (disclosure.parentNode !== row) row.append(disclosure);
      if (fallback) fallback.hidden = true;
      if (fallbackFocused) summary.focus({ preventScroll: true });
      if (disclosure.open) coordinateMenu();
    } else restore();
    // Moving the outline to another parent must preserve its focus.
    retainFocus(focus);
  };
  const close = (returnFocus = false) => {
    disclosure.open = false;
    if (returnFocus && summary.isConnected) summary.focus({ preventScroll: true });
  };
  const coordinateMenu = () => {
    if (siteNavigation?.contains(document.activeElement)) close();
    else closeMenu();
  };
  position.subscribe(value => {
    state = value;
    current.textContent = value.link?.textContent || ''; current.hidden = !current.textContent;
    recompose();
  });
  summary.addEventListener('click', () => { if (flow && !disclosure.open) coordinateMenu(); });
  disclosure.addEventListener('toggle', () => { if (flow && disclosure.open) coordinateMenu(); });
  disclosure.addEventListener('keydown', event => {
    if (flow && disclosure.open && event.key === 'Escape') { close(true); event.preventDefault(); event.stopPropagation(); }
  });
  document.addEventListener('click', event => { if (flow && disclosure.open && !disclosure.contains(event.target)) close(); });
  disclosure.addEventListener('focusout', event => {
    const tabbed = tabDeparture;
    tabDeparture = false;
    // Pointer activation can move focus to the body before the anchor's click.
    // Only Tab departure dismisses here; outside clicks have their own handler.
    // Focus is still moving during focusout, so the destination is relatedTarget.
    queueMicrotask(() => {
      if (flow && tabbed && event.relatedTarget && !disclosure.contains(event.relatedTarget)) close();
    });
  });
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    document.addEventListener(type, event => {
      if (!event.isTrusted) return;
      focusVersion++;
      tabDeparture = type === 'keydown' && event.key === 'Tab';
    }, { capture: true, passive: true });
  }
  navigation.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!flow || !link || !navigation.contains(link) || event.defaultPrevented || event.button > 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    let target;
    try { target = document.getElementById(decodeURIComponent(new URL(link.href).hash.slice(1))); } catch { return; }
    if (!target) return;
    const version = focusVersion, previousFocus = document.activeElement;
    // Closing a details element during click dispatch can cancel its anchor's
    // default activation. Let that exact fragment navigate before hiding the link.
    requestAnimationFrame(() => {
      if (version !== focusVersion || printing) return;
      close();
      const focus = document.activeElement;
      const nativeFocus = !focus || focus === document.body || focus === document.documentElement
        || focus === previousFocus || focus === target;
      if (version !== focusVersion || !target.isConnected || !nativeFocus) return;
      const previous = target.getAttribute('tabindex');
      if (previous === null) {
        target.setAttribute('tabindex', '-1');
        target.addEventListener('blur', () => {
          if (target.getAttribute('tabindex') === '-1') target.removeAttribute('tabindex');
        }, { once: true });
      }
      target.focus({ preventScroll: true });
      position.refresh();
    });
  });
  window.addEventListener('pagehide', () => { focusVersion++; if (flow) close(); restore(); });
  window.addEventListener('pageshow', recompose);
  window.addEventListener('beforeprint', () => {
    if (printing) return;
    printing = true; focusVersion++;
    printFocus = { element: focusedControl(), version: focusVersion };
    restore();
  });
  window.addEventListener('afterprint', () => {
    if (!printing) return;
    printing = false; recompose();
    if (printFocus?.version === focusVersion && printFocus.element?.isConnected) printFocus.element.focus({ preventScroll: true });
    printFocus = null;
  });
  return { headerRow: row, close() { if (flow) close(); } };
}
