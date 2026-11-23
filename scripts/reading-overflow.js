// Keep each table's rows and columns. Only the separate, actually overflowing
// boundary receives an extra keyboard stop; authored focus remains untouched.
const mounted = new WeakSet();
export function mountReadingOverflow() {
  const label = document.getElementById?.('reading-overflow-label')?.textContent?.trim();
  let ordinal = 0;
  const selector = '.publication-body :is(table,pre,p:has(> math[display="block"])),.reading-notes__body :is(table,pre,p:has(> math[display="block"]))';
  for (const content of document.querySelectorAll(selector)) {
    let region = content;
    if (content.tagName === 'TABLE') {
      if (content.parentElement?.hasAttribute('data-gazette-table')) region = content.parentElement;
      else {
        region = document.createElement('div');
        region.setAttribute('data-gazette-table', '');
        content.before(region);
        region.append(content);
      }
    }
    if (mounted.has(region)) continue;
    mounted.add(region);
    if (content.hasAttribute('tabindex') || region.hasAttribute('tabindex')) continue;
    const describedBy = region.getAttribute?.('aria-describedby');
    const hint = label ? document.createElement('p') : null;
    if (hint) {
      do { hint.id = `reading-overflow-hint-${++ordinal}`; } while (document.getElementById(hint.id));
      hint.className = 'reading-overflow__hint';
      hint.textContent = label;
      hint.hidden = true;
      if (content.tagName === 'TABLE') region.before(hint);
      else region.after(hint);
    }
    const sync = () => {
      const overflowing = region.clientWidth > 0 && region.scrollWidth > region.clientWidth;
      if (overflowing) region.setAttribute('tabindex', '0');
      else region.removeAttribute('tabindex');
      if (hint) {
        hint.hidden = !overflowing;
        if (overflowing) region.setAttribute('aria-describedby', [describedBy, hint.id].filter(Boolean).join(' '));
        else if (describedBy) region.setAttribute('aria-describedby', describedBy);
        else region.removeAttribute('aria-describedby');
      }
    };
    const observer = new ResizeObserver(sync);
    observer.observe(region);
    if (content !== region) observer.observe(content);
    for (const section of content.querySelectorAll('thead,tbody,tfoot,code,math')) observer.observe(section);
    document.fonts?.ready.then(sync);
    sync();
  }
}
