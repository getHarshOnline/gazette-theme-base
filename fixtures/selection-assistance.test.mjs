import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../scripts/selection-assistance.js', import.meta.url), 'utf8').replaceAll('export function', 'function');
const configuration = {
  label: 'Ask about this passage', selection_limit: 4096, context_limit: 1024,
  prompt_template: 'Explain {selection}\nArticle: {article_title} {article_url}\nPublication: {site_name} {site_url}\nSection: {section_title}\nContext: {context}',
  providers: [
    { id: 'assistant:first', label: 'Ask First', endpoint: 'https://first.example/new', query_parameter: 'q' },
    { id: 'assistant:second', label: 'Ask Second', endpoint: 'https://second.example/', query_parameter: 'prompt' },
    { id: 'assistant:third', label: 'Ask Third', endpoint: 'https://third.example/app', query_parameter: 'q' }
  ]
};
const page = { selection: 'A & B? # C = D', article_title: 'An article', article_url: 'http://127.0.0.1:9000/article/', site_name: 'A publication', site_url: 'http://127.0.0.1:9000/', section_title: 'A question', context: 'A neighbouring sentence.' };
const helpers = vm.runInNewContext(source + '\n({selectionConfiguration,selectionRequest,selectionDestination})', { URL });

test('one substitution preserves selected braces and encodes a complete contextual request once', () => {
  const prompt = helpers.selectionRequest(configuration, { ...page, selection: 'Keep {article_url} literally. A & B? # C = D' });
  assert.ok(prompt.includes('Keep {article_url} literally. A & B? # C = D'));
  assert.ok(prompt.includes(page.article_url));
  for (const provider of configuration.providers) {
    const url = new URL(helpers.selectionDestination(provider, prompt));
    assert.equal(url.searchParams.get(provider.query_parameter), prompt);
    assert.equal(url.hash, '');
    assert.equal(url.searchParams.size, 1);
  }
});

test('caps count Unicode characters, allow no nearby context, and preserve exact native URLs', () => {
  const prompt = helpers.selectionRequest({ ...configuration, selection_limit: 4, context_limit: 0 }, { ...page, selection: '😀😀😀😀😀', context: 'omit this' });
  assert.ok(prompt.includes('😀😀😀…'));
  assert.ok(!prompt.includes('omit this'));
  assert.ok(prompt.endsWith('Context: '));
  assert.ok(prompt.includes(page.article_url));
  const bounded = helpers.selectionRequest(configuration, { ...page, selection: '😀'.repeat(10000), context: 'a'.repeat(10000) });
  assert.ok(Array.from(bounded).length <= 12000);
});

test('malformed optional bindings fail closed without changing reading', () => {
  assert.equal(helpers.selectionConfiguration(configuration), configuration);
  for (const altered of [
    { ...configuration, prompt_template: '{selection} {site_name} {site_url} {article_url} {unknown}' },
    { ...configuration, prompt_template: '{selection} {site_name} {site_url} {article_url} {' },
    { ...configuration, selection_limit: 0 },
    { ...configuration, providers: [{ ...configuration.providers[0], endpoint: 'javascript:alert(1)' }] },
    { ...configuration, providers: [{ ...configuration.providers[0], endpoint: 'https://first.example/?q=existing' }] },
    { ...configuration, providers: [configuration.providers[0], configuration.providers[0]] }
  ]) assert.equal(helpers.selectionConfiguration(altered), null);
});

test('repeated slots remain bounded and oversized fixed canonical context fails without URL truncation', () => {
  const repeated = { ...configuration, prompt_template: '{site_name} {site_url} {article_url} ' + '{selection} {context} '.repeat(80) };
  const prompt = helpers.selectionRequest(repeated, { ...page, selection: 'a'.repeat(4096), context: 'b'.repeat(1024) });
  assert.ok(prompt !== null && Array.from(prompt).length <= 12000);
  assert.ok(prompt.includes(page.article_url));
  assert.equal(helpers.selectionRequest(configuration, { ...page, article_url: 'https://example.test/' + 'path/'.repeat(3000) }), null);
});

function fixture({ eligible = true } = {}) {
  let document;
  class Element {
    constructor(parent = null) { this.parentElement = parent; this.nodeType = 1; this.handlers = {}; this.hidden = false; this.dataset = {}; this.textContent = ''; this.style = {}; }
    contains(node) { return node === this || Boolean(node?.parentElement && this.contains(node.parentElement)); }
    closest(selector) { if (selector.startsWith('input,')) return this.editable ? this : null; if(selector==='main')return this.main||this.parentElement?.closest(selector)||null; return this.paragraph || null; }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    fire(type, options = {}) { const event = { target: this, preventDefault() { this.prevented = true; }, ...options }; for (const handler of this.handlers[type] || []) handler(event); return event; }
    focus(options) { this.focusOptions = options; document.activeElement = this; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 450, height: 50, bottom: 50 }; }
  }
  const main=new Element(),header=new Element(main),title=new Element(header),titleStart=new Element(title),titleEnd=new Element(title),metadata=new Element(main),navigation=new Element(header);
  const article = new Element(main), paragraph = new Element(article), start = new Element(paragraph), end = new Element(paragraph), outside = new Element();
  article.main=main;
  main.querySelector=selector=>selector==='.publication-body'?article:selector==='.reading-page-header > h1, .title-group > h1'?title:null;
  title.textContent=page.article_title;
  paragraph.textContent = 'A beginning. Selected words. An ending.';
  start.paragraph = paragraph;
  const popup = new Element(); popup.hidden = true;
  popup.dataset = { articleTitle: page.article_title, articleUrl: page.article_url, siteName: page.site_name, siteUrl: page.site_url };
  const actions = configuration.providers.map(provider => { const action = new Element(popup); action.dataset.selectionProvider = provider.id; return action; });
  popup.querySelector = () => ({ textContent: JSON.stringify(configuration) });
  popup.querySelectorAll = () => actions;
  article.querySelectorAll = () => [];
  document = new Element(); document.activeElement = article; document.documentElement = new Element();
  document.querySelector = selector => selector === '[data-selection-assistance]' ? popup : selector === 'main[data-selection-scope]' && eligible ? main : null;
  const window = new Element(); Object.assign(window, { innerWidth: 1280, innerHeight: 720 });
  const range = { startContainer: start, endContainer: end, startOffset: 0, endOffset: 15, getBoundingClientRect() { return { left: 100, top: 200, width: 300, height: 30, bottom: 230 }; } };
  const selection = { isCollapsed: false, rangeCount: 1, text: 'Selected words.', getRangeAt() { return range; }, toString() { return this.text; } };
  window.getSelection = () => selection;
  vm.runInNewContext(source + '\nmountSelectionAssistance();', { document, window, URL, requestAnimationFrame(callback) { callback(); }, getComputedStyle(element) { return { getPropertyValue() { return element === popup ? '8px' : '60px'; } }; } });
  return { document, window, popup, article, title, titleStart, titleEnd, metadata, navigation, actions, selection, range, start, outside, update() { document.fire('selectionchange'); } };
}

test('genuine body selection reveals three native links without moving focus; keyboard can enter and dismiss', () => {
  const f = fixture(); f.update();
  assert.equal(f.popup.hidden, false);
  assert.equal(f.document.activeElement, f.article);
  for (const action of f.actions) assert.ok(new URL(action.href).searchParams.size === 1);
  assert.equal(f.document.fire('keydown', { key: 'Tab' }).prevented, true);
  assert.equal(f.document.activeElement, f.actions[0]);
  assert.equal(f.actions[0].focusOptions.preventScroll, true);
  assert.equal(f.document.fire('keydown', { key: 'Escape' }).prevented, true);
  assert.equal(f.popup.hidden, true);
  assert.equal(f.document.activeElement, f.article);
  f.update(); assert.equal(f.popup.hidden, true, 'Escape does not immediately reopen the same passage');
});

test('the template-owned reading scope admits collection prose without route or family checks', () => {
  const f = fixture(); f.update();
  assert.equal(f.popup.hidden, false);
  const unmarked = fixture({ eligible: false }); unmarked.update();
  assert.equal(unmarked.popup.hidden, true, 'unmarked navigation and landing surfaces do not mount assistance');
});

test('outside press and scrolling dismiss; a changed passage may reopen; mouse activation preserves selection', () => {
  const f = fixture(); f.update();
  assert.equal(f.popup.fire('mousedown', { button: 0 }).prevented, true);
  f.document.fire('pointerdown', { target: f.outside });
  f.document.fire('pointerup', { target: f.outside });
  assert.equal(f.popup.hidden, true);
  f.selection.text = 'Another passage'; f.update(); assert.equal(f.popup.hidden, false);
  f.window.fire('scroll'); assert.equal(f.popup.hidden, true);
  f.update(); assert.equal(f.popup.hidden, true);
});

test('selection outside the canonical body or in an editable control never reveals actions', () => {
  const f = fixture(); f.range.endContainer = f.outside; f.update(); assert.equal(f.popup.hidden, true);
  f.range.endContainer = f.start; f.start.editable = true; f.update(); assert.equal(f.popup.hidden, true);
});

test('the native opening H1 remains selectable without admitting header navigation or metadata',()=>{
  const f=fixture();f.range.startContainer=f.titleStart;f.range.endContainer=f.titleEnd;f.selection.text=page.article_title;f.update();
  assert.equal(f.popup.hidden,false);
  const prompt=new URL(f.actions[0].href).searchParams.get('q');
  assert.ok(prompt.includes('Section: '+page.article_title));assert.ok(prompt.endsWith('Context: '));
  for(const node of [f.metadata,f.navigation]){f.range.startContainer=node;f.range.endContainer=node;f.update();assert.equal(f.popup.hidden,true);}
  f.range.startContainer=f.titleStart;f.range.endContainer=f.start;f.update();assert.equal(f.popup.hidden,true,'a cross-region selection could include navigation and stays excluded');
});

test('a live pointer selection finishes before the action group appears', () => {
  const f = fixture();
  f.document.fire('pointerdown', { target: f.start });
  f.update(); assert.equal(f.popup.hidden, true);
  f.document.fire('pointerup', { target: f.start });
  assert.equal(f.popup.hidden, false);
  f.document.fire('keydown', { key: 'Escape' });
  f.document.fire('pointerdown', { target: f.start });
  f.update(); f.document.fire('pointerup', { target: f.start });
  assert.equal(f.popup.hidden, false, 'a fresh deliberate gesture may select the same words again');
});
