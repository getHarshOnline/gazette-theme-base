// Temporarily quiet the reading tools while preserving document layout and element identities.
export function mountReadingFocus({ position, navigation } = {}) {
  const article = document.querySelector('.reading-document');
  const button = article?.querySelector('.reading-focus-toggle');
  const enterLabel = button?.getAttribute('data-reader-focus-enter');
  const exitLabel = button?.getAttribute('data-reader-focus-exit');
  if (!article || !button || !enterLabel || !exitLabel) return null;
  const home = button.parentNode, next = button.nextSibling;
  const candidates = [...article.querySelectorAll('.reading-corpus,.reading-metadata,.reading-resources,.reading-apparatus,.reading-notes-trigger,.reading-outline .reading-citation')];
  const closing = article.nextElementSibling;
  if (closing?.matches('.services-closing')) candidates.push(closing);
  let active = false, printing = false, placement = null;
  const muted = new Map();
  const restore = () => {
    for (const [element, previous] of muted) {
      element.inert = previous.inert;
      if (previous.ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', previous.ariaHidden);
      if (!previous.classPresent) element.classList.remove('reading-focus-muted');
    }
    muted.clear();
  };
  const present = () => {
    restore();
    if (!active || printing) return;
    if (candidates.some(element => element.contains(document.activeElement))) button.focus({ preventScroll: true });
    for (const element of candidates) {
      if (element.contains(button)) continue;
      muted.set(element, { inert: element.inert, ariaHidden: element.getAttribute('aria-hidden'), classPresent: element.classList.contains('reading-focus-muted') });
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
      element.classList.add('reading-focus-muted');
    }
  };
  const setActive = value => {
    active = value;
    // The swapped label carries the state, as every Base toggle that names its next action does.
    button.textContent = active ? exitLabel : enterLabel;
    present();
  };
  const recompose = () => {
    const focus = document.activeElement === button;
    const target = !printing && placement?.flow && navigation?.headerRow?.isConnected ? navigation.headerRow : home;
    if (button.parentNode !== target) target.insertBefore(button, target === home && next?.parentNode === home ? next : null);
    if (focus && document.activeElement !== button) button.focus({ preventScroll: true });
  };
  position?.subscribe(value => { placement = value; recompose(); });
  button.addEventListener('click', () => setActive(!active));
  document.addEventListener('keydown', event => {
    if (!active || event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
    setActive(false); button.focus({ preventScroll: true }); event.preventDefault();
  });
  window.addEventListener('beforeprint', () => { printing = true; restore(); recompose(); });
  window.addEventListener('afterprint', () => { printing = false; recompose(); present(); });
  window.addEventListener('pagehide', () => { setActive(false); printing = true; recompose(); });
  window.addEventListener('pageshow', () => { printing = false; recompose(); });
  button.hidden = false;
  setActive(false);
  return { exit: () => setActive(false) };
}
