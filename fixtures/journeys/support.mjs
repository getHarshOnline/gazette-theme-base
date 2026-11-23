export const must = (value, message) => {
  if (!value) throw new Error(message);
};
export const normal = (value) => value.replace(/\s+/g, " ").trim();

/** Event Timing reports measured input, not a field INP score. */
export function observeInteractions() {
  const supported = PerformanceObserver.supportedEntryTypes.includes("event");
  const rows = new Map();
  let omitted = 0;
  if (supported)
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.interactionId) continue;
        if (!rows.has(entry.interactionId) && rows.size >= 128) {
          omitted++;
          continue;
        }
        if ((rows.get(entry.interactionId)?.durationMs ?? 0) >= entry.duration)
          continue;
        rows.set(entry.interactionId, {
          id: entry.interactionId,
          event: entry.name,
          durationMs: entry.duration,
          inputDelayMs: entry.processingStart - entry.startTime,
          processingMs: entry.processingEnd - entry.processingStart,
          presentationDelayMs: Math.max(
            0,
            entry.startTime + entry.duration - entry.processingEnd,
          ),
        });
      }
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  window.__journeyTiming = () => ({
    supported,
    documentId: performance.timeOrigin,
    url: location.href,
    omitted,
    observations: [...rows.values()],
    scope:
      "Observed input events of at least 16 ms; no observation is not zero latency. Not field INP.",
  });
  addEventListener("pagehide", () => {
    void window
      .__recordJourneyTiming?.(window.__journeyTiming())
      .catch(() => {});
  });
}
