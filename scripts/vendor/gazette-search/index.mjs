// SPDX-License-Identifier: Apache-2.0
// Browser-only ranking over the existing discovery-safe corpus; never a publication resolver.
import elasticlunr from './vendor/elasticlunr.mjs';
import { bytes, corpus, fail, integer, keys, options, rankingFields } from './corpus.mjs';
import { acquire } from './load.mjs';
import { browse as browseResults } from './browse.mjs';

export { MAX_SEARCH_BYTES, SearchError } from './corpus.mjs';
const fields = rankingFields;
const titleKey = text => text.trim().toLowerCase().replace(/\s+/gu, ' ');

/** Capture the complete corpus before constructing the selected lexical/English index. */
export function createIndex(records, configuration) {
  const selected = options(configuration);
  const documents = corpus(records, selected);
  const makeProvider = (literal = false) => {
    const provider = elasticlunr(function () {
      this.setRef('ref');
      for (const field of fields) this.addField(field);
      this.saveDocument(false);
      if (selected.profile === 'lexical') this.pipeline.reset();
      else if (literal) this.pipeline.remove(elasticlunr.stemmer);
    });
    for (const document of documents) {
      const { record: _record, ...ranking } = document;
      provider.addDoc(ranking);
    }
    return provider;
  };
  let provider, literalProvider;
  try {
    provider = makeProvider();
  } catch { fail('search_provider'); }
  const retained = new Map(documents.map(document => [document.ref, document.record]));
  const titles = new Map(documents.map(document => [document.ref, titleKey(document.title)]));
  const rank = (query, queryOptions, allowEmpty = false) => {
    keys(queryOptions, ['limit', 'fields', 'expand', 'bool'], ['limit']);
    const limit = integer(queryOptions.limit, selected.maxResults);
    bytes(query, selected.maxQueryBytes);
    if (queryOptions.expand !== undefined && typeof queryOptions.expand !== 'boolean') fail('search_options');
    if (queryOptions.bool !== undefined && !['AND', 'OR'].includes(queryOptions.bool)) fail('search_options');
    const boosts = queryOptions.fields === undefined
      ? Object.fromEntries(fields.map(field => [field, 1])) : queryOptions.fields;
    keys(boosts, fields, []);
    if (Object.keys(boosts).length === 0) fail('search_options');
    const configuration = Object.create(null);
    for (const [field, boost] of Object.entries(boosts)) {
      if (typeof boost !== 'number' || !Number.isFinite(boost) || boost <= 0 || boost > 100) {
        fail('search_options');
      }
      configuration[field] = { boost };
    }
    if (query.trim() === '' || documents.length === 0) return {
      limit, ranked: allowEmpty ? documents.map(document => ({ record: document.record, score: 0 }))
        .sort((a, b) => a.record.route.url < b.record.route.url ? -1 : a.record.route.url > b.record.route.url ? 1 : 0) : []
    };
    let found;
    try {
      const matching = {
        fields: configuration,
        bool: 'OR',
        expand: queryOptions.expand ?? false,
      };
      // A stem can be shorter than a partially typed word. Preserve literal
      // prefixes alongside English matches, over the same selected corpus.
      if (matching.expand && selected.profile === 'english') literalProvider ??= makeProvider(true);
      const search = value => {
        const hits = provider.search(value, matching);
        if (!matching.expand || !literalProvider) return hits;
        const merged = new Map(hits.map(hit => [hit.ref, hit]));
        for (const hit of literalProvider.search(value, matching)) {
          if (!retained.has(hit.ref) || !Number.isFinite(hit.score)) fail('search_provider');
          const previous = merged.get(hit.ref);
          if (!previous || hit.score > previous.score) merged.set(hit.ref, hit);
        }
        return [...merged.values()];
      };
      found = search(query);
      if ((queryOptions.bool ?? 'AND') === 'AND') {
        // The provider intersects inside each field. Intersect its per-term
        // results across all selected fields so title + body can satisfy AND.
        const terms = new Map();
        for (const term of new Set(elasticlunr.tokenizer(query))) {
          const processed = provider.pipeline.run([term]);
          if (processed.length) {
            const literal = matching.expand && literalProvider
              ? literalProvider.pipeline.run([term]) : [];
            terms.set(JSON.stringify([processed, literal]), term);
          }
        }
        if (terms.size > 1) {
          for (const term of terms.values()) {
            const matches = new Set(search(term).map(hit => hit.ref));
            found = found.filter(hit => matches.has(hit.ref));
            if (found.length === 0) break;
          }
        }
      }
    } catch { fail('search_provider'); }
    if (!Array.isArray(found) || found.length > documents.length) fail('search_provider');
    const seen = new Set();
    const ranked = found.map(hit => {
      if (!retained.has(hit.ref) || seen.has(hit.ref) || !Number.isFinite(hit.score)) fail('search_provider');
      seen.add(hit.ref);
      return { record: retained.get(hit.ref), score: hit.score };
    });
    const queryTitle = titleKey(query);
    const exactTitle = record => Object.hasOwn(configuration, 'title')
      && titles.get(record.route.url) === queryTitle;
    ranked.sort((left, right) => Number(exactTitle(right.record)) - Number(exactTitle(left.record))
      || right.score - left.score
      || (left.record.route.url < right.record.route.url ? -1
        : left.record.route.url > right.record.route.url ? 1 : 0));
    return { ranked, limit };
  };
  return Object.freeze({
    size: documents.length,
    profile: selected.profile,
    search(query, queryOptions) {
      const { ranked, limit } = rank(query, queryOptions);
      return Object.freeze(ranked.slice(0, limit).map(Object.freeze));
    },
    browse(query, queryOptions) {
      keys(queryOptions, ['limit', 'offset', 'filters', 'sort', 'fields', 'expand', 'bool'], ['limit']);
      const ranking = { limit: queryOptions.limit };
      for (const key of ['fields', 'expand', 'bool']) if (queryOptions[key] !== undefined) ranking[key] = queryOptions[key];
      const { ranked } = rank(query, ranking, true);
      return browseResults(ranked, queryOptions, selected);
    },
  });
}

/** Fetch once from an explicit URL; redirects, credentials, stale fallback and partial datasets refuse. */
export async function loadIndex(exactUrl, configuration) {
  const { records, selected } = await acquire(exactUrl, configuration);
  return createIndex(records, selected);
}
