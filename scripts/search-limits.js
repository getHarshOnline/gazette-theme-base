import { MAX_SEARCH_BYTES } from './vendor/gazette-search/corpus.mjs';

// Use the SDK's complete-corpus byte ceiling for acquisition and capture.
// Each presentation supplies its own
// result count: the command view's limit or the full page's configured page size.
export const SEARCH_LIMITS = Object.freeze({ maxDocuments: 10000, maxBytes: MAX_SEARCH_BYTES,
  maxQueryBytes: 1024, maxResponseBytes: MAX_SEARCH_BYTES, timeoutMs: 10000 });
