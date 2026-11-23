// Opt-in frame delivery. The caller owns composition, timing, visibility and motion policy.
async function decodeFrame(frame, signal) {
  const response = await fetch(frame.src, { signal, credentials: "same-origin" });
  if (!response.ok) throw new Error(`Frame request failed (${response.status})`);
  const blob = await response.blob();
  signal.throwIfAborted();
  return createImageBitmap(blob);
}

/**
 * Exact mode delivers only the requested frame. Coalesced mode finishes one
 * in-flight frame before requesting the newest position, so continuous input
 * cannot starve decoding. It may show that earlier frame briefly. No prefetch.
 * onFrame receives {bitmap, index, src}. The bitmap is BORROWED for that synchronous
 * callback only: draw/upload it before returning; never retain or close it.
 * budgetBytes bounds declared RGBA pixels held or being decoded, not browser/network
 * overhead. Decoder dimensions must match the declaration. A custom decoder must
 * return a closable bitmap and may finish after abort; late results are closed here.
 */
export function createFrameSource({
  frames, budgetBytes, concurrency, onFrame, onError = () => {}, decode = decodeFrame,
  mode = "exact",
}) {
  if (!["exact", "coalesced"].includes(mode)) throw new RangeError("Unknown frame delivery mode");
  const coalesced = mode === "coalesced";
  if (!Array.isArray(frames) || !frames.length) throw new TypeError("Frames are required");
  if (!Number.isSafeInteger(budgetBytes) || budgetBytes <= 0 ||
      !Number.isSafeInteger(concurrency) || concurrency <= 0) {
    throw new RangeError("A positive byte budget and concurrency limit are required");
  }
  const sources = frames.map(({ src, width, height }) => {
    const bytes = width * height * 4;
    if (typeof src !== "string" || !src || !Number.isSafeInteger(width) || width <= 0 ||
        !Number.isSafeInteger(height) || height <= 0 || !Number.isSafeInteger(bytes) ||
        bytes > budgetBytes) throw new RangeError("Frame dimensions exceed the pixel budget");
    return { src, width, height, bytes };
  });
  if (typeof onFrame !== "function" || typeof onError !== "function" || typeof decode !== "function") {
    throw new TypeError("Frame callbacks and decoder must be functions");
  }
  const cache = new Map();
  const jobs = new Set();
  let active = false;
  let disposed = false;
  let wanted = null;
  let delivered = null;
  let failed = null;
  let occupied = 0;
  let borrowing = false;

  function clearCache() {
    // A callback may suspend/dispose its source; keep its borrowed bitmap valid.
    if (borrowing) return;
    for (const [index, bitmap] of cache) {
      bitmap.close();
      occupied -= sources[index].bytes;
    }
    cache.clear();
  }

  function cancelJobs() {
    for (const job of jobs) job.controller.abort();
    // Reservations remain until decode settles, including decoders ignoring abort.
  }

  function deliver(index, bitmap) {
    delivered = index;
    cache.delete(index);
    cache.set(index, bitmap);
    borrowing = true;
    try {
      onFrame({ bitmap, index, src: sources[index].src });
    } catch (error) {
      failed = index;
      onError({ error, index, src: sources[index].src });
    } finally {
      borrowing = false;
      if (!active || disposed) clearCache();
    }
  }

  function pump() {
    if (borrowing || disposed || !active || wanted === null || wanted === failed) return;
    // Finish the current request before either decoding or presenting a cached
    // successor. Otherwise a late frame could replace a newer cached position.
    if (coalesced && jobs.size) return;
    const index = wanted;
    if (cache.has(index)) {
      if (delivered !== index) deliver(index, cache.get(index));
      // A callback can request another frame without nesting borrowed callbacks.
      if (wanted !== index) pump();
      return;
    }
    if (jobs.size >= concurrency || [...jobs].some(job => job.index === index)) return;
    const frame = sources[index];
    for (const [oldIndex, bitmap] of cache) {
      if (occupied + frame.bytes <= budgetBytes) break;
      bitmap.close();
      cache.delete(oldIndex);
      occupied -= sources[oldIndex].bytes;
    }
    if (occupied + frame.bytes > budgetBytes) return;
    const job = { index, controller: new AbortController() };
    jobs.add(job);
    occupied += frame.bytes;
    Promise.resolve().then(() => {
      job.controller.signal.throwIfAborted();
      return decode(frame, job.controller.signal);
    }).then(bitmap => {
      if (job.controller.signal.aborted || disposed || !active || (!coalesced && wanted !== index)) {
        bitmap.close();
        return;
      }
      if (bitmap.width !== frame.width || bitmap.height !== frame.height) {
        bitmap.close();
        throw new Error("Decoded frame dimensions differ from their declaration");
      }
      cache.set(index, bitmap);
      occupied += frame.bytes;
      deliver(index, bitmap);
    }).catch(error => {
      if (!job.controller.signal.aborted && !disposed && active && wanted === index) {
        failed = index;
        onError({ error, index, src: frame.src });
      }
    }).finally(() => {
      occupied -= frame.bytes;
      jobs.delete(job);
      pump();
    });
  }

  return {
    setFrame(index) {
      if (disposed) return;
      if (!Number.isInteger(index) || index < 0 || index >= sources.length) {
        throw new RangeError("Requested frame is outside this sequence");
      }
      if (wanted !== index) {
        wanted = index;
        delivered = null;
        failed = null;
        if (!coalesced) cancelJobs();
      }
      pump();
    },
    setActive(value) {
      if (disposed || active === Boolean(value)) return;
      active = Boolean(value);
      delivered = null;
      failed = null;
      if (!active) {
        cancelJobs();
        clearCache();
      }
      pump();
    },
    dispose() {
      disposed = true;
      active = false;
      cancelJobs();
      clearCache();
    },
  };
}
