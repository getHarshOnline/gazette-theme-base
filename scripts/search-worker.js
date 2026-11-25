// Keep the full-page corpus and ranking providers outside the reader's UI thread.
import { loadIndex } from './vendor/gazette-search/index.mjs';

let index;

self.addEventListener('message', async ({ data }) => {
  const { id, operation, args } = data;
  try {
    if (operation === 'load') {
      index = await loadIndex(...args);
      self.postMessage({ id });
      return;
    }
    if (operation !== 'browse' || !index) throw new Error('Search is unavailable.');
    const { hits, total, facets } = index.browse(...args);
    self.postMessage({ id, value: { total, facets, hits: hits.map(({ score, record }) => {
      const { content, route, destination, attributions, projects, classifications } = record;
      return { score, record: { content, route, destination, attributions, projects, classifications } };
    }) } });
  } catch (error) {
    self.postMessage({ id, error: error.code || 'search_unavailable' });
  }
});
