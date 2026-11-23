// Preference resolution is shared; each surface still owns eligibility,
// suspension and teardown. An explicit choice overrides the system in both directions.
export function motionReduced(choice, systemReduced) {
  return choice === 'reduce' || (choice !== 'allow' && Boolean(systemReduced));
}

// Read the current choice at use time. Subscription starts only when the surface
// is ready to listen; its disposer or abort signal releases both event sources.
export function motionPreference(doc) {
  const win = doc.defaultView ?? globalThis;
  const media = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  return {
    reduced: () => motionReduced(doc.documentElement.dataset.motion, media?.matches),
    onMotionChange(callback, { signal } = {}) {
      if (signal?.aborted) return () => {};
      // Keep the original event: some callers use a truthy argument to preserve
      // the reading position while their enhancement changes state.
      const changed = event => callback(event);
      const disconnect = () => {
        doc.removeEventListener('motion-preference', changed);
        media?.removeEventListener('change', changed);
        signal?.removeEventListener('abort', disconnect);
      };
      doc.addEventListener('motion-preference', changed);
      media?.addEventListener('change', changed);
      signal?.addEventListener('abort', disconnect, { once: true });
      return disconnect;
    },
  };
}
