// Plain metadata shared by command results and fuller discovery surfaces.
// Display supplied result facts. The engine resolves identity; the search SDK ranks results.
const text = value => typeof value === 'string' && value.trim() ? value : '';
const fieldAttributes = Object.freeze({
  'kind': 'data-search-kind',
  'author': 'data-search-author',
  'rights-holder': 'data-search-rights-holder',
  'published': 'data-search-published',
  'written': 'data-search-written',
  'modified': 'data-search-modified',
  'language': 'data-search-language',
  'about': 'data-search-about',
  'mentions': 'data-search-mentions',
  'keyword': 'data-search-keyword'
});
const kindAttributes = Object.freeze({
  'article': 'data-search-kind-article',
  'documentation': 'data-search-kind-documentation',
  'project': 'data-search-kind-project',
  'index': 'data-search-kind-index',
  'utility': 'data-search-kind-utility',
  'extension': 'data-search-kind-extension',
  'collection': 'data-search-kind-collection',
  'journey': 'data-search-kind-journey'
});
const kinds = Object.freeze(Object.keys(kindAttributes));

export function readResultContextLabels(element) {
  const read = attributes => Object.fromEntries(Object.entries(attributes).map(([key, attribute]) => [key, element.getAttribute(attribute) || '']));
  const months = name => {
    const value = element.getAttribute(name) || '';
    return value.length <= 1024 ? value.split('|') : [];
  };
  return { ...read(fieldAttributes), kinds: read(kindAttributes),
    dateFormat: element.getAttribute('data-search-date-format') || '',
    dateMonths: months('data-search-date-months'),
    dateMonthsShort: months('data-search-date-months-short') };
}

// Match Gazette's editorial date forms without converting their authored day to
// the browser's timezone. Unsupported display directives retain the exact value.
export function formatResultDate(value, labels = {}) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 35) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match || match[0] !== value) return '';
  const [, year, month, day, hour, minute, second, offset] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!y || m < 1 || m > 12 || d < 1 || d > days[m - 1]) return '';
  if (hour !== undefined) {
    if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || offset === '-00:00') return '';
    if (offset !== 'Z') {
      const hours = Number(offset.slice(1, 3)), minutes = Number(offset.slice(4));
      if (minutes > 59 || hours * 60 + minutes > 14 * 60) return '';
    }
  }
  const format = text(labels.dateFormat);
  if (!format || format.length > 256) return value;
  const monthName = names => Array.isArray(names) && names.length === 12
    && names.every(name => typeof name === 'string' && name.trim() && name.length <= 80 && !/[\u0000-\u001f\u007f]/.test(name))
    ? names[m - 1] : undefined;
  // Calendar-only Chrono directives: time, offset and locale composites stay
  // explicit source text until a consumer supports their complete meaning.
  const parts = { Y: year, y: year.slice(-2), m: month, '-m': String(m),
    d: day, '-d': String(d), e: String(d).padStart(2, ' '),
    B: monthName(labels.dateMonths), b: monthName(labels.dateMonthsShort),
    F: value.slice(0, 10), '%': '%' };
  let unsupported = false;
  const formatted = format.replace(/%(-?.)?/g, (_, directive) => {
    if (!Object.hasOwn(parts, directive) || typeof parts[directive] !== 'string') {
      unsupported = true;
      return '';
    }
    return parts[directive];
  });
  return unsupported ? value : formatted;
}

// The descriptor is independent of DOM and command-menu interaction. Each value
// carries only facts supplied by its result record; missing display names stay absent.
export function describeResultContext(record, labels = {}) {
  const entries = [];
  const add = (key, values, labelKey = key) => {
    const label = text(labels[labelKey]);
    if (label && values.length) entries.push({ key, label, values });
  };
  const content = record.content || {};
  const structure = content.structure;
  const kind = content.documentation === true ? 'documentation'
    : structure?.kind === 'page' ? structure.family?.kind : structure?.kind;
  if (kinds.includes(kind) && text(labels.kinds?.[kind])) add('kind', [{ text: labels.kinds[kind] }]);
  for (const attribution of record.attributions || []) {
    const name = text(attribution.principal?.name);
    // Role order is meaningful: do not group, sort or substitute the publisher.
    if (name) add(attribution.role, [{ text: name, ...(attribution.website ? { website: attribution.website } : {}) }]);
  }
  for (const key of ['published', 'modified']) {
    const value = text(content[key]), display = formatResultDate(value, labels);
    const labelKey = key === 'published' && content.lifecycle === 'draft' ? 'written' : key;
    if (display) add(key, [{ text: display, datetime: value }], labelKey);
  }
  const language = text(content.language);
  if (language) add('language', [{ text: language }]);
  for (const relation of ['about', 'mentions']) {
    const values = (record.projects || [])
      .filter(member => member.relationship?.relation === relation && text(member.project?.name))
      .map(member => ({ text: member.project.name, ...(member.landing ? { destination: member.landing } : {}) }));
    add(relation, values);
  }
  add('keyword', (content.keywords || []).filter(text).map(value => ({ text: value })));
  // Curated classifications remain distinct from free-form keywords and
  // project relations. Their labels and optional links are already resolved.
  const taxonomies = new Map();
  for (const classification of record.classifications || []) {
    const taxonomy = classification.taxonomy;
    const name = text(taxonomy?.label), term = text(classification.term?.label);
    if (!text(taxonomy?.id) || !name || !term) continue;
    let entry = taxonomies.get(taxonomy.id);
    if (!entry) {
      entry = { key: 'classification', label: name, values: [],
        ...(taxonomy.destination ? { destination: taxonomy.destination } : {}) };
      taxonomies.set(taxonomy.id, entry);
      entries.push(entry);
    }
    entry.values.push({ text: term,
      ...(classification.destination ? { destination: classification.destination } : {}) });
  }
  return entries;
}

// The default stays noninteractive for command options. A full-page consumer can
// render a supplied destination as a link without changing the descriptor.
export function renderResultContext(entries, document, renderValue = () => null) {
  if (!entries.length) return null;
  const list = document.createElement('dl');
  list.className = 'result-context';
  for (const entry of entries) {
    const group = document.createElement('div');
    const label = document.createElement('dt');
    const labelLink = entry.destination && renderValue({ text: entry.label, destination: entry.destination }, entry.key);
    if (labelLink) { labelLink.textContent = entry.label; label.append(labelLink); }
    else label.textContent = entry.label;
    group.append(label);
    for (const value of entry.values) {
      const detail = document.createElement('dd');
      const node = renderValue(value, entry.key) || document.createElement(value.datetime ? 'time' : 'span');
      node.textContent = value.text;
      if (value.datetime) node.setAttribute('datetime', value.datetime);
      detail.append(node);
      group.append(detail);
    }
    list.append(group);
  }
  return list;
}
