import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { SEARCH_LIMITS } from '../scripts/search-limits.js';
import { SEARCH_MATCHING } from '../scripts/search-matching.js';
import { createIndex, loadIndex } from '../scripts/vendor/gazette-search/index.mjs';

test('shared acquisition retains and searches a complete corpus beyond eight MiB', async t => {
  const document = {
    content: { id: 'page:large-reference', title: 'Complete reference' },
    route: { url: 'https://example.test/reference/', canonical_url: 'https://example.test/reference/' },
    body: 'Retained reference' + ' '.repeat(9 * 1024 * 1024), projects: [],
    indexed: { title: 'Complete reference', body: 'Reference acquisition' },
  };
  const payload = JSON.stringify([document]);
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
    response.end(payload);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const index = await loadIndex(`http://127.0.0.1:${server.address().port}/search.json`, {
    ...SEARCH_LIMITS, profile: 'english', maxResults: 15, allowNetwork: true,
  });
  assert.equal(requests, 1);
  assert.equal(index.size, 1);
  const hits = index.search('acquisition', { limit: 1 });
  assert.equal(hits[0].record.body, document.body);
  assert.equal(hits[0].record.route.url, document.route.url);
});

const { describeResultContext, readResultContextLabels, renderResultContext, formatResultDate } = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../scripts/result-context.js', import.meta.url))).toString('base64'));

const source = readFileSync(new URL('../scripts/search.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export \{.*\} from .*;\n/gm, '').replace('export function mountSearch', 'function mountSearch')
  .replace("import('@base/search-sdk')", 'Promise.resolve({ loadIndex })');
const linkSource = readFileSync(new URL('../scripts/crossings.js', import.meta.url), 'utf8').replaceAll('export function', 'function');
class Element {
  constructor(tag = '') { this.tag = tag; this.attrs = {}; this.handlers = {}; this.children = []; this.value = ''; this.hidden = false; this.textContent = ''; this.scrollTop = 0; }
  setAttribute(key, value) { this.attrs[key] = value; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  append(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
  focus() { this.focused = true; }
  scrollIntoView() {}
  fire(type, event = {}) { const e = { preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...event }; this.handlers[type]?.(e); return e; }
}
const record = (title, url = 'https://example.test/mount/answer/') => ({
  content: { id: 'page:'+title, title, description: 'A complete description.',site:'site:target',presentation:{theme:'theme:other'} },
  route: { url, canonical_url: 'https://canonical.test/answer/' }, body: 'A bounded answer.', projects: []
});
function fixture(loadIndex, rememberResult, metadataLabels = {}) {
  const input = new Element('input'), list = new Element('ul'), status = new Element('p'), retry = new Element('button');
  list.id = 'results';
  for (const [attribute, value] of Object.entries({ 'data-status-loading': 'loading', 'data-status-empty': 'empty', 'data-status-unavailable': 'unavailable', 'data-status-idle': 'idle' })) status.setAttribute(attribute, value);
  status.setAttribute('data-status-results', 'Shown: {count}');
  const elements = { input, '[role="listbox"]': list, '[role="status"]': status, '[data-search-retry]': retry };
  const tenant = { querySelector: selector => elements[selector],getAttribute: name => name === 'data-source-site' ? 'site:source' : metadataLabels[name] || null };
  const destinations = [];
  let dismissed = 0;
  const context = vm.createContext({ URL, loadIndex, SEARCH_LIMITS, SEARCH_MATCHING, describeResultContext, readResultContextLabels, renderResultContext, document: { createElement: tag => new Element(tag),getElementById: id=>({id,textContent:'A destination description'}) }, window: { location: { assign: url => destinations.push(url) } } });
  vm.runInContext(linkSource, context);
  vm.runInContext(source, context);
  const controller = context.mountSearch(tenant, { url: 'https://example.test/mount/search.json', profile: 'english' }, () => { dismissed++; }, rememberResult);
  return { get dismissed() { return dismissed; }, controller, input, list, status, retry, destinations, type(value) { input.value = value; input.fire('input'); } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const resultOption = (fixture, index = 0) => fixture.list.children[index].children[0];

test('provider documentation keeps its supplied external destination', async () => {
  const value = record('Provider reference', 'https://docs.example.test/reference/');
  value.destination = { kind: 'external' };
  const f = fixture(() => Promise.resolve({ search: () => [{ record: value }] }));
  f.controller.activate(); await flush(); f.type('reference');
  const link = resultOption(f);
  assert.equal(link.href, value.route.url);
  assert.equal(link.getAttribute('data-gazette-destination-kind'), 'external');
  assert.equal(link.getAttribute('data-gazette-destination-content'), null);
  assert.equal(link.getAttribute('data-gazette-destination-site'), null);
  assert.equal(link.getAttribute('aria-describedby'), 'external-description');
});

test('lazy single acquisition retains latest query; closed tenant does not reopen on completion', async () => {
  let done, calls = 0;
  const f = fixture(() => { calls++; return new Promise(resolve => { done = resolve; }); });
  assert.equal(calls, 0);
  f.controller.activate(); f.type('old'); f.type('latest'); f.controller.deactivate();
  await flush();
  done({ search(query) { assert.equal(query, 'latest'); return [{ record: record('Latest') }]; } });
  await flush();
  assert.equal(f.list.hidden, true);
  f.controller.activate();
  assert.equal(calls, 1); assert.equal(resultOption(f).children[0].textContent, 'Latest');
});

test('failure is truthful and retry reacquires without leaking a rejection', async () => {
  let calls = 0;
  const f = fixture(() => ++calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ search: () => [] }));
  f.controller.activate(); await flush();
  assert.equal(f.status.textContent, 'unavailable'); assert.equal(f.retry.hidden, false);
  f.type('anything'); f.retry.fire('click'); await flush();
  assert.equal(calls, 2); assert.equal(f.status.textContent, 'empty'); assert.equal(f.retry.hidden, true);
});

test('literal text, serving URL, arrow wrapping, IME, two-stage Escape and modifier links', async () => {
  const f = fixture(() => Promise.resolve({ search: () => [{ record: record('<img onerror=bad>') }] }));
  f.controller.activate(); await flush(); f.type('answer');
  const option = resultOption(f);
  assert.equal(option.tag, 'a');
  assert.equal(option.getAttribute('data-gazette-destination-theme'),'theme:other');
  assert.equal(option.getAttribute('data-gazette-destination-kind'),'cross-site');
  assert.equal(option.getAttribute('aria-describedby'),'crossing-description');
  assert.equal(option.children[0].textContent, '<img onerror=bad>');
  assert.equal(option.children[1].textContent, 'A complete description.');
  assert.equal(f.status.textContent, 'Shown: 1');
  assert.equal(option.fire('click', { ctrlKey: true }).prevented, undefined);
  assert.equal(f.destinations.length, 0);
  f.input.fire('keydown', { key: 'ArrowUp', isComposing: true });
  assert.equal(f.input.getAttribute('aria-activedescendant'), null);
  f.input.fire('keydown', { key: 'ArrowUp' });
  assert.equal(f.input.getAttribute('aria-activedescendant'), 'results-0');
  f.input.fire('keydown', { key: 'Enter' });
  assert.equal(f.destinations[0], 'https://example.test/mount/answer/');
  assert.equal(f.input.fire('keydown', { key: 'Escape' }).prevented, true);
  assert.equal(f.input.fire('keydown', { key: 'Escape' }).prevented, true);
  assert.equal(f.dismissed, 1);
  assert.equal(f.input.value, 'answer');
});

test('unsafe destinations fail closed without partial results', async () => {
  const f = fixture(() => Promise.resolve({ search: () => [{ record: record('Safe') }, { record: record('Unsafe', 'javascript:alert(1)') }] }));
  f.controller.activate(); await flush(); f.type('answer');
  assert.equal(f.list.children.length, 0); assert.equal(f.status.textContent, 'unavailable');
});

test('retained SDK ranks selected native fields and returns immutable original serving identity', () => {
  const value = { ...record('Stable answer'), indexed: { title: 'Stable answer' } };
  const index = createIndex([value], { profile: 'english', maxDocuments: 10, maxBytes: 10000, maxQueryBytes: 100, maxResults: 5 });
  assert.equal(index.search('bounded', { limit: 5 }).length, 0);
  const hit = index.search('stable', { limit: 5 })[0];
  assert.equal(hit.record.route.url, value.route.url); assert.ok(Object.isFrozen(hit.record));
});


test('pointer and Enter preserve the same exact query and native result before navigation', async () => {
  const saved=[];
  const f=fixture(()=>Promise.resolve({search:()=>[{record:record('Answer')}]}),value=>saved.push(value));
  f.controller.activate(); await flush(); f.type('  answer  ');
  resultOption(f).fire('click');
  f.input.fire('keydown',{key:'ArrowDown'}); f.input.fire('keydown',{key:'Enter'});
  assert.equal(saved.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(saved[0])),{query:'  answer  ',id:'page:Answer',url:'https://example.test/mount/answer/',scrollTop:0});
  assert.deepEqual(saved[0],saved[1]); assert.equal(f.destinations.length,2);
  resultOption(f).fire('click',{ctrlKey:true}); assert.equal(saved.length,2);
});

test('return waits for the native index and restores the exact identity rather than a ranking position', async () => {
  let done;
  const f=fixture(()=>new Promise(resolve=>done=resolve));
  f.controller.activate({restore:{query:'  answer ',id:'page:Answer',url:'https://example.test/mount/answer/'},isCurrent:()=>true});
  assert.equal(f.input.value,'  answer ');
  assert.equal(f.status.textContent,'loading');
  await flush();
  done({search:()=>[{record:record('Other','https://example.test/other/')},{record:record('Answer')}]}); await flush();
  assert.equal(f.input.getAttribute('aria-activedescendant'),'results-1');
  assert.equal(f.input.focused,true); assert.equal(resultOption(f,1).getAttribute('aria-selected'),'true');
});

test('a direct pointer choice retains the clicked result even when native history keeps the live tenant', async () => {
  const f=fixture(()=>Promise.resolve({search:()=>[{record:record('First','https://example.test/first/')},{record:record('Second','https://example.test/second/')}]}));
  f.controller.activate();await flush();f.type('answer');
  f.input.fire('keydown',{key:'ArrowDown'});
  resultOption(f,1).fire('click');
  assert.equal(f.input.getAttribute('aria-activedescendant'),'results-1');
  assert.equal(resultOption(f,1).getAttribute('aria-selected'),'true');
  assert.equal(f.destinations[0],'https://example.test/second/');
});

test('input, dismissal and intervening activity never surrender control to a pending restoration', async () => {
  for(const action of ['input','dismiss','activity']){
    let done,current=true;
    const f=fixture(()=>new Promise(resolve=>done=resolve));
    f.controller.activate({restore:{query:'answer',id:'page:Answer',url:'https://example.test/mount/answer/'},isCurrent:()=>current});
    if(action==='input')f.type('new query');
    if(action==='dismiss')f.controller.deactivate();
    if(action==='activity')current=false;
    await flush();
    done({search:()=>[{record:record('Answer')}]}); await flush();
    assert.equal(f.input.getAttribute('aria-activedescendant'),null,action);
    if(action==='input')assert.equal(f.input.value,'new query');
    if(action==='dismiss')assert.equal(f.list.hidden,true);
  }
});

test('result acquisition and query use one result bound; returned count describes only shown hits',async()=>{
  let bound;
  const f=fixture((url,options)=>{bound=options.maxResults;return Promise.resolve({search(q,options){assert.equal(options.limit,bound);return Array.from({length:bound},(_,i)=>({record:record('Answer'+i)}));}});});
  f.controller.activate();await flush();f.type('answer');assert.equal(f.list.children.length,bound);assert.equal(f.status.textContent,'Shown: '+bound);
});
test('restoration selects the native result then restores only the owned result scrollport',async()=>{
  const f=fixture(()=>Promise.resolve({search:()=>[{record:record('Answer')}]}));
  f.controller.activate({restore:{query:'answer',id:'page:Answer',url:'https://example.test/mount/answer/',scrollTop:280},isCurrent:()=>true});await flush();
  assert.equal(f.input.getAttribute('aria-activedescendant'),'results-0');assert.equal(f.list.scrollTop,280);
  f.type('new input');assert.equal(f.input.value,'new input');
});

const dateMonths = 'January|February|March|April|May|June|July|August|September|October|November|December'.split('|');
const dateMonthsShort = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'.split('|');
const metadataCopy = Object.freeze({
  kind: 'Type', author: 'By', 'rights-holder': 'Rights holder', published: 'Published', written: 'Written',
  dateFormat: '%-d %B %Y', dateMonths, dateMonthsShort,
  modified: 'Updated', language: 'Language', about: 'About', mentions: 'Also discussed',
  kinds: { article: 'Article', documentation: 'Guide', project: 'Project', collection: 'Collection', journey: 'Sequence' }
});
const richRecord = () => ({
  ...record('Question'),
  content: { ...record('Question').content, language: 'fr', published: '2026-09-10', modified: '2026-09-12T18:30:00.125+05:30', structure: { kind: 'page', family: { kind: 'documentation' } } },
  attributions: [
    { role: 'author', principal: { id: 'person:two', name: 'Second named first' } },
    { role: 'rights-holder', principal: { id: 'organization:one', name: 'Rights organization' } },
    { role: 'author', principal: { id: 'person:one', name: '<First> named second' } },
    { role: 'author', principal: { id: 'person:unnamed' } }
  ],
  projects: [
    { relationship: { relation: 'about' }, project: { name: 'Primary subject' } },
    { relationship: { relation: 'mentions' }, project: { name: 'Referenced subject' } },
    { relationship: { relation: 'context' }, project: { name: 'Context is not a direct subject' } }
  ]
});

test('result metadata preserves resolved attribution roles/order, exact native kind, dates, language and project relation', () => {
  const value = richRecord(), before = JSON.stringify(value);
  const entries = describeResultContext(value, metadataCopy);
  assert.deepEqual(entries.map(entry => entry.key), ['kind','author','rights-holder','author','published','modified','language','about','mentions']);
  assert.equal(entries[0].values[0].text, 'Guide');
  assert.deepEqual(entries.filter(entry => entry.key === 'author').map(entry => entry.values[0].text), ['Second named first', '<First> named second']);
  assert.deepEqual(entries.find(entry => entry.key === 'modified').values[0], { text: '12 September 2026', datetime: '2026-09-12T18:30:00.125+05:30' });
  assert.equal(entries.find(entry => entry.key === 'language').values[0].text, 'fr');
  assert.equal(entries.find(entry => entry.key === 'about').values[0].text, 'Primary subject');
  assert.equal(entries.find(entry => entry.key === 'mentions').values[0].text, 'Referenced subject');
  assert.equal(JSON.stringify(value), before);
});

test('manual containers and contained examples use the native documentation label', () => {
  for (const structure of [{ kind: 'collection' }, { kind: 'journey' }, { kind: 'page', family: { kind: 'article' } }]) {
    const value = record('Retained manual');
    value.content = { ...value.content, structure, documentation: true };
    assert.equal(describeResultContext(value, metadataCopy)[0].values[0].text, 'Guide');
    delete value.content.documentation;
    assert.notEqual(describeResultContext(value, metadataCopy)[0].values[0].text, 'Guide');
  }
});

test('metadata never derives authors, dates, language, taxonomy or family from a route, publisher or project name', () => {
  const value = record('Article-looking title', 'https://example.test/blog/2026/01/02/');
  value.site = { publisher: { name: 'Not an author' }, default_author: { name: 'Not a byline' } };
  value.content.keywords = ['Not a taxonomy'];
  value.content.attributions = [{ principal: 'person:unresolved', role: 'author' }];
  value.projects = [{ project: { name: 'Unqualified project' } }];
  assert.deepEqual(describeResultContext(value, metadataCopy), []);
  assert.equal(renderResultContext([], { createElement() { throw new Error('no empty metadata container'); } }), null);
});

test('structure uses configured exact collection/journey and page-family labels without classifying unknown extensions', () => {
  const value = record('Answer');
  for (const [structure, expected] of [[{kind:'collection'},'Collection'],[{kind:'journey'},'Sequence'],[{kind:'page',family:{kind:'article'}},'Article']]) {
    value.content.structure = structure;
    assert.equal(describeResultContext(value, metadataCopy)[0].values[0].text, expected);
  }
  value.content.structure = { kind: 'page', family: { kind: 'unconfigured' } };
  assert.deepEqual(describeResultContext(value, metadataCopy), []);
});

test('metadata absent labels stay absent; unknown roles are never relabelled as authors', () => {
  const value = richRecord();
  assert.deepEqual(describeResultContext(value), []);
  value.attributions.unshift({ role: 'unconfigured-role', principal: { name: 'Not an author' } });
  assert.equal(describeResultContext(value, metadataCopy).some(entry => entry.values.some(value => value.text === 'Not an author')), false);
  const labels = readResultContextLabels({getAttribute: key => key === 'data-search-kind-documentation' ? 'Manual' : key === 'data-search-kind' ? 'Format' : null});
  assert.deepEqual(describeResultContext(value, labels), [{ key: 'kind', label: 'Format', values: [{ text: 'Manual' }] }]);
});

test('metadata render inserts safe text with one noninteractive anatomy and preserves datetime precision', () => {
  const node = renderResultContext(describeResultContext(richRecord(), metadataCopy), { createElement: tag => new Element(tag) });
  const all = node => [node, ...node.children.flatMap(all)];
  assert.equal(node.tag, 'dl');
  assert.equal(node.className, 'result-context');
  assert.equal(all(node).some(node => ['a','button','input','select'].includes(node.tag)), false);
  assert.equal(all(node).some(node => node.textContent === '<First> named second'), true);
  assert.equal(all(node).find(node => node.tag === 'time' && node.getAttribute('datetime').includes('T')).getAttribute('datetime'), '2026-09-12T18:30:00.125+05:30');
});

test('rich command options keep one destination and continuous keyboard navigation', async () => {
  const attributes = { 'data-search-kind': 'Type', 'data-search-kind-documentation': 'Guide', 'data-search-author': 'By', 'data-search-published': 'Published', 'data-search-about': 'About' };
  const f = fixture(() => Promise.resolve({search: () => [{record:richRecord()},{record:record('Other','https://example.test/other/')}]}), undefined, attributes);
  f.controller.activate(); await flush(); f.type('question');
  const option = resultOption(f);
  assert.equal(f.list.children[0].tag,'li');
  assert.equal(f.list.children[0].getAttribute('role'),'presentation');
  assert.equal(option.getAttribute('role'),'option');
  assert.equal(option.tabIndex,-1);
  assert.equal(option.children[2].tag, 'dl');
  const all = node => [node, ...node.children.flatMap(all)];
  assert.equal(all(option).filter(node => node.tag === 'a').length, 1);
  assert.equal(all(option).some(node => ['button','input','select'].includes(node.tag)), false);
  f.input.fire('keydown',{key:'ArrowDown'}); f.input.fire('keydown',{key:'ArrowDown'});
  assert.equal(f.input.getAttribute('aria-activedescendant'),'results-1');
  f.input.fire('keydown',{key:'Enter'});
  assert.equal(f.destinations[0], 'https://example.test/other/');
});


test('native author websites remain noninteractive in command metadata and allow explicit full-page link rendering',()=>{
  const value=richRecord();value.attributions[0].website={url:'https://writer.example.test/',destination:{kind:'external'}};
  const entries=describeResultContext(value,metadataCopy);
  const all=node=>[node,...node.children.flatMap(all)];
  const plain=renderResultContext(entries,{createElement:tag=>new Element(tag)});
  assert.equal(all(plain).some(node=>node.tag==='a'),false);
  const linked=renderResultContext(entries,{createElement:tag=>new Element(tag)},value=>{if(!value.website)return null;const a=new Element('a');a.href=value.website.url;return a;});
  assert.equal(all(linked).find(node=>node.tag==='a').href,'https://writer.example.test/');
});

test('native project and curated classification destinations remain separate from keywords and command links', () => {
  const destination = { url:'https://other.test/exact/project/', destination:{kind:'cross-site',content:'page:landing',site:'site:other'} };
  const taxonomy = { url:'https://example.test/taxonomy/', destination:{kind:'internal-native',content:'page:taxonomy',site:'site:source'} };
  const term = { url:'https://example.test/selected-term/', destination:{kind:'internal-native',content:'page:term',site:'site:source'} };
  const value = richRecord();
  value.projects[0].landing = destination;
  value.content.keywords = ['Not a curated taxonomy'];
  value.classifications = [
    {taxonomy:{id:'taxonomy:subject',label:'Subject',destination:taxonomy},term:{id:'term:one',label:'One'},destination:term},
    {taxonomy:{id:'taxonomy:subject',label:'Subject',destination:taxonomy},term:{id:'term:two',label:'Two'}},
    {taxonomy:{id:'taxonomy:other',label:'Other classification'},term:{id:'term:three',label:'Three'}},
  ];
  const before = JSON.stringify(value), entries = describeResultContext(value,metadataCopy);
  assert.equal(entries.find(entry=>entry.key==='about').values[0].destination,destination);
  assert.equal(entries.find(entry=>entry.key==='mentions').values[0].destination,undefined);
  const groups = entries.filter(entry=>entry.key==='classification');
  assert.deepEqual(groups.map(entry=>entry.label),['Subject','Other classification']);
  assert.equal(groups[0].destination,taxonomy);assert.equal(groups[0].values[0].destination,term);
  assert.equal(groups[0].values[1].destination,undefined);
  assert.deepEqual(groups[0].values.map(item=>item.text),['One','Two']);
  const rendered = renderResultContext(entries,{createElement:tag=>new Element(tag)});
  const descendants = node=>[node,...node.children.flatMap(descendants)];
  assert.equal(descendants(rendered).some(node=>node.tag==='a'),false,'command metadata stays noninteractive');
  assert.equal(JSON.stringify(value),before);
});


test('packaged SDK filters and result labels share the native documentation category', () => {
  const guide = record('Guide');
  guide.content.structure = { kind: 'collection', purpose: 'documentation' };
  guide.content.documentation = true;
  const editorial = record('Editorial', 'https://example.test/mount/editorial/');
  editorial.content.structure = { kind: 'collection' };
  const index = createIndex([guide, editorial], { profile: 'english', maxDocuments: 10, maxBytes: 10000, maxQueryBytes: 100, maxResults: 5 });
  const result = index.browse('', { limit: 5, filters: { kind: ['documentation'] } });
  assert.equal(result.total, 1);
  assert.equal(result.hits[0].record.content.id, guide.content.id);
  assert.deepEqual(result.facets.kind.map(item => [item.value, item.count]), [['documentation', 1]]);
  assert.deepEqual(index.browse('', {limit: 5}).facets.kind.map(item => [item.value, item.count]), [['collection', 1], ['documentation', 1]]);
});


test('command search matches partial words with the full-page policy', async () => {
  const index = createIndex([record('Question')], { profile: 'lexical', maxDocuments: 10, maxBytes: 10000, maxQueryBytes: 100, maxResults: 20 });
  // The fixture runs the consumer in a VM; transfer options into the SDK’s realm.
  const f = fixture(() => Promise.resolve({ search: (query, options) => index.search(query, JSON.parse(JSON.stringify(options))) }));
  f.controller.activate(); await flush(); f.type('Quest ans');
  assert.equal(resultOption(f).children[0].textContent, 'Question');
  f.type('Quest absent'); assert.equal(f.list.children.length, 0);
  f.type('uestion'); assert.equal(f.list.children.length, 0);
});

test('editorial result dates keep the authored calendar day, including leap days and offsets', () => {
  for (const [value, expected] of [
    ['2000-02-29', '29 February 2000'], ['2024-02-29', '29 February 2024'],
    ['2400-02-29', '29 February 2400'], ['0001-01-01', '1 January 0001'],
    ['2024-03-01T00:15:00.123456789+14:00', '1 March 2024'],
    ['2024-02-29T23:45:00.120-12:00', '29 February 2024'],
    ['2024-02-29T00:00:00Z', '29 February 2024'],
    ['2024-02-29T00:00:00+00:00', '29 February 2024'],
  ]) assert.equal(formatResultDate(value, metadataCopy), expected, value);
});

test('invalid or missing editorial chronology contributes no invented date', () => {
  for (const value of [undefined, null, 20240229, '', ' ', '0000-01-01', '10000-01-01',
    '1900-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00',
    '2024-2-29', '2024-02-29 ', '2024-02-29\n', '2024-02-29\r', '2024-02-29\u2028',
    '2024-02-29T12:00:00Z\n', '2024-02-29T12:00:00+05:30\r\n',
    '2024-02-29T24:00:00Z', '2024-02-29T12:60:00Z',
    '2024-02-29T12:00:60Z', '2024-02-29T12:00:00', '2024-02-29t12:00:00Z',
    '2024-02-29T12:00:00-00:00', '2024-02-29T12:00:00+14:01',
    '2024-02-29T12:00:00-14:01', '2024-02-29T12:00:00+01:60',
    '2024-02-29T12:00:00.1234567890Z']) {
    assert.equal(formatResultDate(value, metadataCopy), '', String(value));
    assert.deepEqual(describeResultContext({content: {published: value}}, metadataCopy), []);
  }
});

test('supplied calendar formats and month names are used without browser locale inference', () => {
  const copy = {...metadataCopy, dateMonths: Array.from({length: 12}, (_, i) => `Month ${i + 1}`),
    dateMonthsShort: Array.from({length: 12}, (_, i) => `M${i + 1}`),
    dateFormat: '%d/%m/%Y (%y); %-d/%-m; %e; %b; %B; %F; %%'};
  assert.equal(formatResultDate('2024-02-09T23:30:00-12:00', copy), '09/02/2024 (24); 9/2;  9; M2; Month 2; 2024-02-09; %');
  assert.equal(formatResultDate('2024-02-09', {dateFormat: '%Y/%m/%d'}), '2024/02/09');
});

test('unsupported date formats or unavailable month labels retain the exact source value', () => {
  const value = '2024-02-29T23:30:00.123456789-12:00';
  for (const dateFormat of ['', '%A, %d %B %Y', '%Y-%m-%d %H:%M', '%Z', '%', '%-d %B %Y%', 'x'.repeat(257)]) {
    assert.equal(formatResultDate(value, {...metadataCopy, dateFormat}), value, dateFormat);
  }
  for (const dateMonths of [undefined, [], metadataCopy.dateMonths.slice(1), [...metadataCopy.dateMonths.slice(0, 11), '']]) {
    assert.equal(formatResultDate(value, {...metadataCopy, dateMonths}), value);
  }
  assert.equal(formatResultDate(value), value);
  assert.equal(formatResultDate(value, {dateFormat: '%b', dateMonthsShort: []}), value);
});

test('draft dates use Written while preserving the publication field and exact time value', () => {
  const datetime = '2024-03-01T00:15:00.123456789+14:00';
  const value = {content: {lifecycle: 'draft', published: datetime, modified: '2024-03-02'}};
  const before = JSON.stringify(value), copy = {...metadataCopy, written: 'Composed', published: 'Released', modified: 'Revised'};
  const entries = describeResultContext(value, copy);
  assert.deepEqual(entries, [
    {key: 'published', label: 'Composed', values: [{text: '1 March 2024', datetime}]},
    {key: 'modified', label: 'Revised', values: [{text: '2 March 2024', datetime: '2024-03-02'}]},
  ]);
  assert.equal(JSON.stringify(value), before);
  const node = renderResultContext(entries, {createElement: tag => new Element(tag)});
  const time = node.children[0].children[1].children[0];
  assert.equal(time.tag, 'time'); assert.equal(time.textContent, '1 March 2024');
  assert.equal(time.getAttribute('datetime'), datetime);
  assert.equal(describeResultContext({...value, content: {...value.content, lifecycle: 'published'}}, copy)[0].label, 'Released');
  assert.deepEqual(describeResultContext(value, {...copy, written: ''}).map(entry => entry.key), ['modified']);
});

test('command results read the shared date labels and native month lists from attributes', async () => {
  const attributes = {
    'data-search-written': 'Composed', 'data-search-published': 'Released',
    'data-search-date-format': '%-d %b %Y',
    'data-search-date-months': dateMonths.join('|'),
    'data-search-date-months-short': dateMonthsShort.join('|'),
  };
  const labels = readResultContextLabels({getAttribute: key => attributes[key] ?? null});
  assert.equal(labels.dateFormat, '%-d %b %Y');
  assert.deepEqual(labels.dateMonths, dateMonths); assert.deepEqual(labels.dateMonthsShort, dateMonthsShort);
  const value = record('A dated account');
  value.content = {...value.content, lifecycle: 'draft', published: '2024-02-29T23:30:00-12:00'};
  const f = fixture(() => Promise.resolve({search: () => [{record: value}]}), undefined, attributes);
  f.controller.activate(); await flush(); f.type('dated');
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const rendered = descendants(resultOption(f));
  assert.equal(rendered.find(node => node.tag === 'dt').textContent, 'Composed');
  const time = rendered.find(node => node.tag === 'time');
  assert.equal(time.textContent, '29 Feb 2024');
  assert.equal(time.getAttribute('datetime'), value.content.published);
});
