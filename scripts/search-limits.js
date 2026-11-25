import { MAX_SEARCH_BYTES } from './vendor/gazette-search/corpus.mjs';

// The complete corpus can take longer to transfer on a slow connection.
// A stalled response still reaches the retry control after ten seconds.
export const SEARCH_LIMITS = Object.freeze({ maxDocuments: 10000, maxBytes: MAX_SEARCH_BYTES,
  maxQueryBytes: 1024, maxResponseBytes: MAX_SEARCH_BYTES, timeoutMs: 20000, idleTimeoutMs: 10000 });
