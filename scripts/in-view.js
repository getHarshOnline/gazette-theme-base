// Observe one surface without choosing its initial state or unsupported-browser
// fallback. Each consumer keeps those choices and its own playback lifecycle.
export function observeInView(element, changed, { window: win = globalThis, firstEntry = false, ...options } = {}) {
  let disposed = false;
  const observer = new win.IntersectionObserver(entries => {
    if (disposed) return;
    // Preserve the consumer's existing first-entry or any-entry batch handling.
    changed(firstEntry ? Boolean(entries[0]?.isIntersecting) : entries.some(entry => entry.isIntersecting));
  }, options);
  observer.observe(element);
  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
  };
}
