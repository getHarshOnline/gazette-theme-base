// SPDX-License-Identifier: Apache-2.0
// Bounded JSON capture and a ranking-only projection of Gazette's emitted search corpus.

const encoder = new TextEncoder();
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
/** Existing ceiling shared by complete JSON capture and HTTP response acquisition. */
export const MAX_SEARCH_BYTES = 64 * 1024 * 1024;
export const rankingFields = Object.freeze(['title', 'description', 'keywords', 'route', 'body', 'notes', 'summary', 'projects']);

export class SearchError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SearchError';
    this.code = code;
  }
}

export function fail(code) { throw new SearchError(code); }

export function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

export function keys(value, allowed, required = allowed) {
  if (!object(value)) fail('search_options');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string'
      || !allowed.includes(key) || !own(descriptors[key], 'value'))
      || required.some(key => !own(descriptors, key))) fail('search_options');
}

export function integer(value, maximum, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail('search_limit');
  return value;
}

export const optionKeys = ['profile', 'maxDocuments', 'maxBytes', 'maxQueryBytes', 'maxResults'];

export function options(value) {
  keys(value, optionKeys);
  if (!['lexical', 'english'].includes(value.profile)) fail('search_profile');
  return Object.freeze({
    profile: value.profile,
    maxDocuments: integer(value.maxDocuments, 100_000),
    maxBytes: integer(value.maxBytes, MAX_SEARCH_BYTES),
    maxQueryBytes: integer(value.maxQueryBytes, 65_536),
    maxResults: integer(value.maxResults, 1_000),
  });
}

export function bytes(text, maximum) {
  if (typeof text !== 'string') fail('search_data');
  if (text.length > maximum || encoder.encode(text).byteLength > maximum) fail('search_limit');
  return text;
}

// Absolute explicit HTTP(S), with neither credentials nor URL-parser repair.
export function address(value, code = 'search_url') {
  if (typeof value !== 'string' || value.length > 8192
      || !/^https?:\/\/[^/]+(?:\/|$)/.test(value)
      || /[\s\\\u0000-\u001f\u007f]/u.test(value)
      || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)) fail(code);
  let url;
  try { url = new URL(value); } catch { fail(code); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname
      || url.username || url.password || url.hash) fail(code);
  return url;
}

function text(value, required = true) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || (required && value.length === 0)) fail('search_data');
  return value;
}

// Capture only JSON data, without invoking getters/toJSON or retaining caller aliases.
// The budget includes JSON framing; final serialization verifies its exact byte ceiling.
function capture(value, budget, ancestors = new Set(), depth = 0) {
  if (depth > 64 || --budget.nodes < 0) fail('search_limit');
  if (value === null || typeof value === 'boolean') {
    budget.bytes -= value === null || value === true ? 4 : 5;
    if (budget.bytes < 0) fail('search_limit');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('search_data');
    budget.bytes -= String(value).length;
    if (budget.bytes < 0) fail('search_limit');
    return value;
  }
  if (typeof value === 'string') {
    bytes(value, budget.bytes);
    budget.bytes -= encoder.encode(JSON.stringify(value)).byteLength;
    if (budget.bytes < 0) fail('search_limit');
    return value;
  }
  if ((!Array.isArray(value) && !object(value)) || ancestors.has(value)) fail('search_data');
  ancestors.add(value);
  const array = Array.isArray(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Reflect.ownKeys(descriptors).filter(key => !(array && key === 'length'));
  if (names.some(key => typeof key !== 'string' || !own(descriptors[key], 'value')
      || !descriptors[key].enumerable)) fail('search_data');
  if (array && (names.length !== value.length || names.some((key, i) => key !== String(i)))) {
    fail('search_data');
  }
  budget.bytes -= 2 + Math.max(0, names.length - 1);
  if (budget.bytes < 0) fail('search_limit');
  const result = array ? [] : Object.create(null);
  for (const name of names) {
    if (!array) {
      bytes(name, budget.bytes);
      budget.bytes -= encoder.encode(JSON.stringify(name)).byteLength + 1;
      if (budget.bytes < 0) fail('search_limit');
    }
    const child = capture(descriptors[name].value, budget, ancestors, depth + 1);
    Object.defineProperty(result, name, { value: child, enumerable: true });
  }
  ancestors.delete(value);
  return Object.freeze(result);
}

export function corpus(records, selected) {
  if (!Array.isArray(records)) fail('search_data');
  integer(records.length, selected.maxDocuments, 0);
  const retained = capture(records, { bytes: selected.maxBytes, nodes: selected.maxBytes });
  bytes(JSON.stringify(retained), selected.maxBytes);
  const identities = new Set();
  const urls = new Set();
  const documents = retained.map(record => {
    if (!object(record) || !object(record.content) || !object(record.route)
        || !Array.isArray(record.projects) || typeof record.body !== 'string') fail('search_data');
    const identity = text(record.content.id);
    const title = text(record.content.title);
    const url = address(record.route.url);
    address(record.route.canonical_url);
    if (identities.has(identity) || urls.has(url.href)) fail('search_duplicate');
    identities.add(identity);
    urls.add(url.href);
    const projects = record.projects.map(link => {
      if (!object(link) || !object(link.project)) fail('search_data');
      return `${text(link.project.id)} ${text(link.project.name, false)}`;
    }).join(' ');
    const phrases = record.content.keywords;
    if (phrases !== undefined && !Array.isArray(phrases)) fail('search_data');
    const keywords = (phrases ?? []).map(value => text(value)).join(' ');
    // Complete result metadata remains intact. An emitted selection governs only
    // ranking values, so unselected title/body/notes cannot accidentally be searched.
    let ranking;
    if (record.indexed !== undefined) {
      if (!object(record.indexed) || Object.keys(record.indexed).length === 0
          || Object.keys(record.indexed).some(key => !rankingFields.includes(key))) fail('search_data');
      ranking = Object.fromEntries(rankingFields.map(field => {
        const value = record.indexed[field];
        if (value === undefined) return [field, ''];
        if (['keywords', 'projects'].includes(field)) {
          if (!Array.isArray(value)) fail('search_data');
          return [field, value.map(value => text(value)).join(' ')];
        }
        return [field, text(value, false)];
      }));
    } else {
      // Direct SDK callers can index the existing complete native corpus without
      // a publication selector. This is the same useful concise profile operation.
      ranking = {
        title, body: text(record.body, false),
        summary: text(record.summary, false), projects, keywords,
        description: '', route: '', notes: '',
      };
    }
    return Object.freeze({
      ref: record.route.url,
      ...ranking,
      record,
    });
  });
  return Object.freeze(documents);
}
