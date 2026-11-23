// SPDX-License-Identifier: Apache-2.0
// Discovery over the complete captured corpus. No metadata or taxonomy is inferred.
import { fail, integer, keys } from './corpus.mjs';

const dimensions = ['site', 'kind', 'author', 'project', 'classification', 'keyword'];
const named = value => typeof value === 'string' && value.length > 0;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function identities(record) {
  const structure = record.content.structure;
  const kind = record.content.documentation === true ? 'documentation'
    : structure?.kind === 'page' ? structure.family?.kind : structure?.kind;
  const fact = (value, label) => ({ value, ...(named(label) ? { label } : {}) });
  const siteName = record.site?.id === record.content.site ? record.site.metadata?.brand?.name : undefined;
  return {
    site: named(record.content.site) ? [fact(record.content.site, siteName)] : [],
    kind: named(kind) ? [fact(kind)] : [],
    author: (Array.isArray(record.attributions) ? record.attributions : [])
      .filter(item => item?.role === 'author' && named(item.principal?.id)).map(item => fact(item.principal.id, item.principal.name)),
    project: record.projects.filter(item => named(item.project?.id)).map(item => fact(item.project.id, item.project.name)),
    // A keyword is the original authored phrase, not a token or a taxonomy term.
    keyword: (record.content.keywords ?? []).map(value => fact(value, value)),
    classification: (Array.isArray(record.classifications) ? record.classifications : [])
      .filter(item => named(item?.taxonomy?.id) && named(item.term?.id))
      .map(item => ({ value: JSON.stringify([item.taxonomy.id, item.term.id]),
        ...(named(item.taxonomy.label) ? { taxonomy_label: item.taxonomy.label } : {}),
        ...(named(item.term.label) ? { term_label: item.term.label } : {}) })),
  };
}

function selectedValues(value, classification) {
  if (!Array.isArray(value)) fail('search_options');
  integer(value.length, 32);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail('search_options');
  const values = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('search_options');
    const item = descriptor.value;
    const check = text => {
      if (!named(text) || text.length > 512) fail('search_options');
      return text;
    };
    if (classification) {
      keys(item, ['taxonomy', 'term']);
      values.push(JSON.stringify([check(item.taxonomy), check(item.term)]));
    } else values.push(check(item));
  }
  if (new Set(values).size !== values.length) fail('search_options');
  return values;
}

const date = record => {
  const value = record.content.published;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/i.test(value)) return null;
  const calendar = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(calendar) || new Date(calendar).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  if (!/T/i.test(value)) return { day: calendar / 86400000, precision: 'date' };
  const fraction = value.match(/\.(\d+)(?:Z|[+-])/i)?.[1] || '';
  const parsed = Date.parse(value.replace(/\.\d+(?=Z|[+-])/i, ''));
  return Number.isFinite(parsed) ? { day: Math.floor(parsed / 86400000), instant: parsed, fraction, precision: 'instant' } : null;
};

function chronology(a, b) {
  if (a.instant !== b.instant) return a.instant - b.instant;
  // Date.parse discards submillisecond precision. Compare the supplied fraction
  // digit by digit, with implicit trailing zeroes and without allocating padding.
  for (let index = 0; index < Math.max(a.fraction.length, b.fraction.length); index++) {
    const difference = compare(a.fraction[index] || '0', b.fraction[index] || '0');
    if (difference) return difference;
  }
  return 0;
}

export function browse(ranked, queryOptions, bounds) {
  keys(queryOptions, ['limit', 'offset', 'filters', 'sort', 'fields', 'expand', 'bool'], ['limit']);
  if (['offset', 'filters', 'sort'].some(key => queryOptions[key] === null)) fail('search_options');
  const limit = integer(queryOptions.limit, bounds.maxResults);
  const offset = integer(queryOptions.offset ?? 0, bounds.maxDocuments, 0);
  const sort = queryOptions.sort ?? 'relevance';
  if (!['relevance', 'latest', 'oldest'].includes(sort)) fail('search_options');
  const filters = queryOptions.filters ?? {};
  keys(filters, dimensions, []);
  const selected = Object.entries(filters).map(([key, values]) => [key, selectedValues(values, key === 'classification')]);
  const counts = Object.fromEntries(dimensions.map(key => [key, new Map()]));
  const eligible = ranked.filter(hit => {
    const values = identities(hit.record);
    if (!selected.every(([key, wanted]) => wanted.some(value => values[key].some(fact => fact.value === value)))) return false;
    for (const key of dimensions) {
      const seen = new Set();
      for (const fact of values[key]) {
        if (!counts[key].has(fact.value)) counts[key].set(fact.value, { count: 0, labels: {} });
        const entry = counts[key].get(fact.value);
        if (!seen.has(fact.value)) entry.count++;
        seen.add(fact.value);
        for (const label of ['label', 'taxonomy_label', 'term_label']) if (fact[label]) {
          entry.labels[label] ??= new Set();
          entry.labels[label].add(fact[label]);
        }
      }
    }
    return true;
  });
  const dates = sort === 'relevance' ? null : new Map(eligible.map(hit => [hit.record, date(hit.record)]));
  if (dates) eligible.sort((left, right) => {
    const a = dates.get(left.record), b = dates.get(right.record);
    if (a === null || b === null) return a === b ? compare(left.record.route.url, right.record.route.url) : a === null ? 1 : -1;
    const direction = sort === 'latest' ? -1 : 1;
    const day = direction * compare(a.day, b.day);
    if (day) return day;
    // Match native reading indexes: known instants precede unknown times within
    // each day in either direction, without assigning a time to a calendar date.
    if (a.precision !== b.precision) return a.precision === 'instant' ? -1 : 1;
    return (a.precision === 'instant' ? direction * chronology(a, b) : 0)
      || compare(left.record.route.url, right.record.route.url);
  });
  const facets = Object.fromEntries(dimensions.map(key => [key, Object.freeze([...counts[key]]
    .sort(([a], [b]) => compare(a, b)).map(([value, entry]) => {
      const labels = Object.fromEntries(Object.entries(entry.labels).filter(([, values]) => values.size === 1)
        .map(([name, values]) => [name, [...values][0]]));
      return Object.freeze(key === 'classification'
        ? { taxonomy: JSON.parse(value)[0], term: JSON.parse(value)[1], count: entry.count, ...labels }
        : { value, count: entry.count, ...labels });
    }))]));
  return Object.freeze({ total: eligible.length, offset, limit,
    hits: Object.freeze(eligible.slice(offset, offset + limit).map(Object.freeze)), facets: Object.freeze(facets) });
}
