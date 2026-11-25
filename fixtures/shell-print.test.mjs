import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Run the actual shell lifecycle; only unrelated imported controllers are stubbed.
const disclosureSource = readFileSync(new URL('../scripts/reading-disclosures.js', import.meta.url), 'utf8').replaceAll('export function', 'function');
const source = readFileSync(new URL('../scripts/shell.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replaceAll('mountDeferredSearch(', 'mountSearch(')
  .replaceAll("import('@base/search')", 'Promise.resolve({ mountSearchPage() {} })');

function fixture({ nativeOpen = false, searchReturn = false, mediaView = false, searchPage = false, platform = 'MacIntel', searchLabel = 'Search' } = {}) {
  let document;
  class Element {
    constructor(name) {
      this.name = name; this.attrs = {}; this.handlers = new Map(); this.children = [];
      this.parentNode = null; this.hidden = false; this.open = false; this.scrollTop = 0;
      this.tabIndex = 0; this.selectors = new Map();
    }
    addEventListener(type, handler) {
      const handlers = this.handlers.get(type) || []; handlers.push(handler); this.handlers.set(type, handlers);
    }
    fire(type, props = {}) {
      const event = { target: this, preventDefault() { this.prevented = true; }, ...props };
      for (const handler of this.handlers.get(type) || []) handler(event);
      return event;
    }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name] ?? null; }
    querySelector(selector) { return this.selectors.get(selector) ?? null; }
    querySelectorAll(selector) { return this.selectors.get(selector) ?? []; }
    closest() { return null; }
    append(child) { this.insertBefore(child, null); }
    insertBefore(child, next) {
      if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
      const index = next === null ? this.children.length : this.children.indexOf(next);
      assert.notEqual(index, -1, 'restoration retains the original sibling');
      this.children.splice(index, 0, child); child.parentNode = this;
    }
    get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] ?? null; }
    get isConnected() { return this === root || Boolean(this.parentNode?.isConnected); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    focus(options) { this.focusOptions = options; document.activeElement = this; }
    getClientRects() { return this.isConnected && !this.hidden && this.rendered !== false ? [{}] : []; }
    getBoundingClientRect() { return { top: 0, bottom: 60, height: 60 }; }
    showModal() { this.open = true; }
    close() { this.open = false; this.fire('close'); }
  }
  const root = new Element('document'), shell = new Element('shell'), dialog = new Element('dialog');
  const title = new Element('title'), close = new Element('close');
  const notes = new Element('notes'), settings = new Element('settings'), input = new Element('setting');
  const disclosure = new Element('disclosure'), body = new Element('notes body'), sentinel = new Element('after notes');
  const noteLink = new Element('note link'), article = new Element('article link');
  const resources = new Element('reading citation'),tools=new Element('reading tools'),keywords=new Element('reading keywords'); root.append(tools);tools.append(resources);root.append(keywords);
  const notesTrigger = new Element('notes trigger'), settingsTrigger = new Element('settings trigger');
  root.append(disclosure); root.append(shell); root.append(article); root.append(notesTrigger); root.append(settingsTrigger);
  disclosure.append(body); disclosure.append(sentinel); body.append(noteLink);
  shell.append(dialog); dialog.append(title); dialog.append(close); dialog.append(notes); dialog.append(settings); settings.append(input);
  disclosure.open = nativeOpen;
  notes.setAttribute('data-tenant-title', 'Notes'); settings.setAttribute('data-tenant-title', 'Settings');
  notesTrigger.setAttribute('data-command-trigger', 'notes'); settingsTrigger.setAttribute('data-command-trigger', 'settings');
  shell.selectors = new Map([['dialog', dialog], ['.shell__title', title], ['.shell__close', close],
    ['[data-tenant="notes"]', notes], ['[data-tenant="settings"]', settings], ['[data-tenant]', [notes, settings]]]);
  disclosure.selectors.set('.reading-notes__body', body);
  settings.selectors.set('input:checked', input);
  document = new Element('document events');
  document.activeElement = article;
  document.documentElement = { dataset: { colorMode: 'dark', motion: 'reduce' }, style: { setProperty() {} } };
  document.selectors = new Map([['[data-shell]', shell], ['.reading-notes', disclosure],
    ['.reading-outline', []], ['details.reading-citation,details.reading-tools,details.reading-keywords', [resources,tools,keywords]], ['[data-command-trigger]', [notesTrigger, settingsTrigger]]]);
  const shortcutTrigger = new Element('shortcut trigger'), shortcutHint = new Element('shortcut hint');
  shortcutTrigger.setAttribute('data-search-label', searchLabel);
  shortcutTrigger.append(shortcutHint);
  document.selectors.set('[data-search-shortcut]', [shortcutHint]);
  let header = null, menu = null, search = null, searchInput = null, searchTrigger = null;
  if (searchReturn) {
    header = new Element('header'); menu = new Element('menu');
    const navigation = new Element('navigation');
    search = new Element('search'); searchInput = new Element('search input'); searchTrigger = new Element('search trigger');
    root.append(header); header.append(menu); header.append(navigation); header.append(shell);
    shell.append(searchTrigger); dialog.append(search); search.append(searchInput);
    header.selectors.set('.frame__menu', menu); header.selectors.set('.frame__nav', navigation);
    search.setAttribute('data-tenant-title', 'Search'); searchTrigger.setAttribute('data-command-trigger', 'search');
    shell.selectors.set('[data-tenant="search"]', search);
    document.selectors.set('[data-command-trigger="search"]', searchTrigger);
    shell.selectors.set('[data-tenant]', [notes, settings, search]);
    document.selectors.set('.frame__header', header);
    document.selectors.set('[data-command-trigger]', [notesTrigger, settingsTrigger, searchTrigger]);
  }
  const fullPage = searchPage ? new Element('full search page') : null;
  const pageQuery = searchPage ? new Element('page query') : null;
  const pageLink = searchPage ? new Element('header search link') : null;
  if (searchPage) {
    root.append(fullPage); fullPage.append(pageQuery); root.append(pageLink);
    pageLink.href = 'https://example.test/find/';
    fullPage.selectors.set('input[name="q"]', pageQuery);
    document.selectors.set('.search-page', fullPage);
    document.selectors.set('.shell__search-page', pageLink);
  }
  document.getElementById = id => id === 'search-corpus' && searchReturn
    ? { textContent: '{"url":"https://example.test/search.json","profile":"english"}' } : null;
  const window = new Element('window events');
  window.location = { hash: '', assign() { assert.fail('already on search: focus the query rather than navigating'); } }; window.scrollX = 12; window.scrollY = 720;
  const scrolls = [];
  window.scrollTo = ({ left = window.scrollX, top = window.scrollY }) => {
    window.scrollX = left; window.scrollY = top; scrolls.push({ left, top });
  };
  let settingsMounts = 0, restoreSearch = null, rememberResult = null;
  let openMedia = null, mediaActivations = 0, mediaClears = 0;
  const mediaInvoker = new Element('media expand'), media = new Element('media');
  if (mediaView) {
    root.append(mediaInvoker); dialog.append(media);
    media.setAttribute('data-tenant-title', 'Image');
    shell.selectors.set('[data-tenant="media"]', media);
    shell.selectors.set('[data-tenant]', [notes, settings, media]);
  }
  const searchActivations = [], searchSaves = [];
  document.dispatchEvent = event => document.fire(event.type, event);
  const context = vm.createContext({ document, window, Event, navigator: { platform }, location: window.location, URL,
    get scrollY() { return window.scrollY; }, get scrollX() { return window.scrollX; },
    requestAnimationFrame: callback => callback(), queueMicrotask: callback => callback(),
    getComputedStyle: element => ({ display: element === menu ? 'inline-flex' : 'block', position: element === header ? 'sticky' : 'static' }),
    ResizeObserver: class { observe() {} },
    mountSettings() { settingsMounts++; },
    mountSearch(tenant, binding, dismiss, remember) {
      if (!searchReturn) return null;
      rememberResult = remember;
      return { activate(restoration) { searchActivations.push(restoration); searchInput.focus(); }, deactivate() {} };
    },
    rememberSearchReturn(snapshot, invoker) { searchSaves.push({ snapshot, invoker }); },
    mountMediaViewer(tenant, open, focusTitle) { openMedia = open; return { activate() { mediaActivations++; focusTitle(); }, deactivate() { mediaClears++; } }; },
    mountReadingPosition() {}, mountReadingNavigation() {}, mountReadingFocus() {}, mountReadingOverflow() {}, mountTemplateFocusReveals() {}, mountContentDecks() {}, mountFolderCards() {}, mountCrossings() {}, mountSelectionAssistance() {}, mountDiscoveryExplorers() {}, mountArticleListings() {},
    mountReturnFocus(options) { restoreSearch = options?.restoreSearch; },
    localStorage: { setItem() { assert.fail('printing must not write preferences'); }, removeItem() { assert.fail('printing must not remove preferences'); } } });
  vm.runInContext(disclosureSource, context);
  vm.runInContext(source, context);
  const bodyCount = node => (node === body ? 1 : 0) + node.children.reduce((sum, child) => sum + bodyCount(child), 0);
  return { window, document, shortcutTrigger, shortcutHint, dialog, shell, title, notes, settings, input, disclosure, body, sentinel, noteLink, article, resources, tools, keywords,
    notesTrigger, settingsTrigger, close, scrolls, menu, search, searchInput, searchTrigger, searchActivations, searchSaves, pageQuery, pageLink,
    mediaInvoker, openMedia() { openMedia(mediaInvoker); }, get mediaActivations() { return mediaActivations; }, get mediaClears() { return mediaClears; },
    restoreSearch(snapshot, context) { restoreSearch(snapshot, context); },
    rememberResult(snapshot) { rememberResult(snapshot); },
    print() { window.fire('beforeprint'); }, cancel() { window.fire('afterprint'); },
    checkIdentity() { assert.equal(bodyCount(root), 1); assert.equal(body.children[0], noteLink); },
    checkPreferences() { assert.equal(settingsMounts, 1); assert.deepEqual(document.documentElement.dataset, { colorMode: 'dark', motion: 'reduce' }); }
  };
}

test('printing an open, scrolled Notes panel restores its same body, focus and two scroll positions', () => {
  const f = fixture();
  f.notesTrigger.fire('click'); f.notes.scrollTop = 375; f.noteLink.focus();
  f.print();
  assert.equal(f.body.parentNode, f.disclosure); assert.equal(f.body.nextSibling, f.sentinel);
  assert.equal(f.disclosure.open, true); assert.equal(f.dialog.open, true);
  f.checkIdentity();
  // Native print pagination can disturb both positions and active focus.
  f.window.scrollY = 0; f.window.scrollX = 0; f.notes.scrollTop = 0; f.article.focus();
  f.cancel();
  assert.equal(f.body.parentNode, f.notes); assert.equal(f.disclosure.open, false);
  assert.equal(f.dialog.open, true); assert.equal(f.document.activeElement, f.noteLink);
  assert.equal(f.notes.scrollTop, 375); assert.equal(f.window.scrollY, 720); assert.equal(f.window.scrollX, 12);
  f.checkIdentity(); f.checkPreferences();
  f.close.fire('click');
  assert.equal(f.body.parentNode, f.disclosure); assert.equal(f.document.activeElement, f.notesTrigger);
});

test('media uses the same dialog, stable page and close/focus-return lifecycle', () => {
  const f=fixture({mediaView:true});f.openMedia();
  assert.equal(f.dialog.open,true);assert.equal(f.document.activeElement,f.title);assert.equal(f.title.textContent,'Image');assert.equal(f.mediaActivations,1);assert.equal(f.window.scrollY,720);
  f.print();f.cancel();assert.equal(f.dialog.open,true);assert.equal(f.mediaActivations,1);assert.equal(f.mediaClears,0);
  f.close.fire('click');assert.equal(f.dialog.open,false);assert.equal(f.mediaClears,1);assert.equal(f.document.activeElement,f.mediaInvoker);assert.equal(f.window.scrollY,720);
  f.openMedia();f.dialog.fire('click',{clientY:200});assert.equal(f.dialog.open,false);assert.equal(f.document.activeElement,f.mediaInvoker);
  f.openMedia();f.dialog.close();assert.equal(f.dialog.open,false);assert.equal(f.document.activeElement,f.mediaInvoker);
});

test('media opened from Notes returns to its exact control inside the same dialog', () => {
  for(const closeWith of ['button','escape','backdrop']) {
    const f=fixture({mediaView:true});f.body.append(f.mediaInvoker);
    f.notesTrigger.fire('click');f.notes.scrollTop=240;f.openMedia();
    assert.equal(f.title.textContent,'Image');assert.equal(f.body.parentNode,f.disclosure);
    if(closeWith==='button')f.close.fire('click');
    else if(closeWith==='escape')assert.equal(f.dialog.fire('cancel').prevented,true);
    else f.dialog.fire('click',{clientY:200});
    assert.equal(f.dialog.open,true);assert.equal(f.title.textContent,'Notes');assert.equal(f.body.parentNode,f.notes);assert.equal(f.notes.scrollTop,240);assert.equal(f.document.activeElement,f.mediaInvoker);
    f.close.fire('click');assert.equal(f.dialog.open,false);assert.equal(f.document.activeElement,f.notesTrigger);
  }
});

for (const nativeOpen of [false, true]) test(`native Notes disclosure restores its ${nativeOpen ? 'open' : 'closed'} state without opening a panel`, () => {
  const f = fixture({ nativeOpen });
  f.print(); f.print();
  assert.equal(f.disclosure.open, true); assert.equal(f.body.parentNode, f.disclosure);
  f.cancel(); f.cancel();
  assert.equal(f.disclosure.open, nativeOpen); assert.equal(f.dialog.open, false);
  assert.equal(f.document.activeElement, f.article);
  f.checkIdentity(); f.checkPreferences();
});

test('duplicate print events do not overwrite the occupied Notes snapshot', () => {
  const f = fixture();
  f.notesTrigger.fire('click'); f.notes.scrollTop = 215; f.noteLink.focus();
  f.print(); f.window.scrollY = 0; f.notes.scrollTop = 0; f.article.focus(); f.print();
  f.cancel(); f.cancel();
  assert.equal(f.body.parentNode, f.notes); assert.equal(f.disclosure.open, false);
  assert.equal(f.document.activeElement, f.noteLink); assert.equal(f.notes.scrollTop, 215);
  assert.equal(f.window.scrollY, 720); f.checkIdentity();
  f.print(); f.cancel();
  assert.equal(f.body.parentNode, f.notes); assert.equal(f.document.activeElement, f.noteLink);
  assert.equal(f.notes.scrollTop, 215); f.checkPreferences();
});

test('printing another tenant neither dismisses it nor moves Notes into it', () => {
  const f = fixture();
  f.settingsTrigger.fire('click');
  assert.equal(f.document.activeElement, f.input);
  f.print(); f.cancel();
  assert.equal(f.dialog.open, true); assert.equal(f.settings.hidden, false); assert.equal(f.notes.hidden, true);
  assert.equal(f.document.activeElement, f.input); assert.equal(f.body.parentNode, f.disclosure);
  assert.equal(f.disclosure.open, false); f.checkIdentity(); f.checkPreferences();
});

for (const action of ['close', 'switch']) test(`print cancellation does not resurrect Notes after a deliberate ${action}`, () => {
  const f = fixture();
  f.notesTrigger.fire('click'); f.notes.scrollTop = 115; f.noteLink.focus(); f.print();
  if (action === 'close') f.close.fire('click');
  else f.settingsTrigger.fire('click');
  f.cancel();
  assert.equal(f.body.parentNode, f.disclosure); assert.equal(f.disclosure.open, false);
  assert.equal(f.dialog.open, action === 'switch');
  assert.equal(f.document.activeElement, action === 'switch' ? f.input : f.notesTrigger);
  f.checkIdentity(); f.checkPreferences();
});

for (const initiallyOpen of [false, true]) {
  test(`printing exposes supplied citation and restores their ${initiallyOpen ? 'open' : 'closed'} state`, () => {
    const f = fixture(); f.resources.open = initiallyOpen;f.tools.open=initiallyOpen;f.keywords.open=initiallyOpen;
    f.print(); assert.equal(f.resources.open, true);assert.equal(f.tools.open,true);assert.equal(f.keywords.open,true);
    f.print(); f.cancel(); assert.equal(f.resources.open, initiallyOpen);assert.equal(f.tools.open,initiallyOpen);assert.equal(f.keywords.open,initiallyOpen);
    f.cancel(); assert.equal(f.resources.open, initiallyOpen);assert.equal(f.tools.open,initiallyOpen);assert.equal(f.keywords.open,initiallyOpen);
    f.checkIdentity(); f.checkPreferences();
  });
}

const searchSnapshot = { kind: 'search', query: '  answer ', id: 'content:answer', url: 'https://example.test/answer/' };

test('compact directory contains focus-induced page movement and releases the reader on close', () => {
  const f = fixture({ searchReturn: true });
  f.menu.fire('click');
  assert.equal(f.menu.getAttribute('aria-expanded'), 'true');
  f.window.scrollY = 1024; f.window.scrollX = 0; f.window.fire('scroll');
  assert.equal(f.window.scrollY, 720); assert.equal(f.window.scrollX, 12);
  f.window.scrollY = 900; f.menu.fire('click');
  assert.equal(f.menu.getAttribute('aria-expanded'), 'false');
  assert.equal(f.window.scrollY, 720);
  f.window.scrollY = 960; f.window.fire('scroll');
  assert.equal(f.window.scrollY, 960, 'closed navigation must not lock ordinary reading');
});

test('history Search restoration uses the existing tenant and returns focus to its visible invocation', () => {
  const f = fixture({ searchReturn: true });
  f.restoreSearch(searchSnapshot, { invoker: f.searchTrigger, isCurrent: () => true });
  assert.equal(f.dialog.open, true); assert.equal(f.search.hidden, false); assert.equal(f.settings.hidden, true);
  assert.equal(f.document.activeElement, f.searchInput);
  assert.equal(f.searchActivations.length, 1); assert.equal(f.searchActivations[0].restore, searchSnapshot);
  f.rememberResult(searchSnapshot);
  assert.equal(f.searchSaves[0].snapshot, searchSnapshot); assert.equal(f.searchSaves[0].invoker, f.searchTrigger);
  f.close.fire('click');
  assert.equal(f.document.activeElement, f.searchTrigger);
  assert.equal(f.searchTrigger.focusOptions.preventScroll, true);
  assert.equal(f.window.scrollY, 720); assert.equal(f.scrolls.length, 0);
});

test('history Search uses the visible compact Menu when its original command has no rendered box', () => {
  const f = fixture({ searchReturn: true });
  f.searchTrigger.rendered = false;
  f.restoreSearch(searchSnapshot, { invoker: f.searchTrigger, isCurrent: () => true });
  assert.equal(f.dialog.open, true); assert.equal(f.document.activeElement, f.searchInput);
  assert.equal(f.menu.getAttribute('aria-expanded'), 'false', 'restoring Search must not expand the directory');
  f.rememberResult(searchSnapshot);
  assert.equal(f.searchSaves[0].invoker, f.menu, 'a later result preserves the visible fallback origin');
  f.close.fire('click');
  assert.equal(f.document.activeElement, f.menu); assert.equal(f.menu.focusOptions.preventScroll, true);
  assert.equal(f.window.scrollY, 720); assert.equal(f.scrolls.length, 0);
});

test('cancelled Search restoration and an intervening tenant never surrender reader control', () => {
  for (const action of ['activity', 'settings']) {
    const f = fixture({ searchReturn: true });
    if (action === 'settings') f.settingsTrigger.fire('click');
    f.restoreSearch(searchSnapshot, { invoker: f.searchTrigger, isCurrent: () => action !== 'activity' });
    assert.equal(f.searchActivations.length, 0, action);
    assert.equal(f.dialog.open, action === 'settings');
    assert.equal(f.document.activeElement, action === 'settings' ? f.input : f.article);
  }
});


test('the shared shortcut focuses the actual Search page field with either primary modifier', () => {
  for (const modifier of ['metaKey', 'ctrlKey']) {
    const f = fixture({ searchPage: true });
    const event = f.document.fire('keydown', { key: 'k', [modifier]: true });
    assert.equal(event.prevented, true);
    assert.equal(f.document.activeElement, f.pageQuery);
    assert.equal(f.dialog.open, false);
  }
});

test('search shortcuts do not pull focus out of an already open Settings dialog', () => {
  const f = fixture({ searchPage: true });
  f.settingsTrigger.fire('click');
  const event = f.document.fire('keydown', { key: 'k', metaKey: true });
  assert.equal(event.prevented, undefined);
  assert.equal(f.document.activeElement, f.input);
  assert.equal(f.dialog.open, true);
});

test('header search stays native and named while its icon and shortcut are decorative', () => {
  const header = readFileSync(new URL('../templates/partials/header.html', import.meta.url), 'utf8');
  const trigger = readFileSync(new URL('../templates/partials/search-trigger.html', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../templates/partials/shell.html', import.meta.url), 'utf8');
  assert.ok(header.indexOf('base/partials/search-trigger.html') > header.indexOf('class="frame__brand"'));
  assert.ok(header.indexOf('base/partials/search-trigger.html') < header.indexOf('class="frame__directory"'));
  assert.match(trigger, /aria-keyshortcuts="Meta\+K Control\+K"/);
  assert.match(trigger, /aria-label="{{ copy.search.trigger_label }}, ⌘ K"/);
  assert.match(trigger, /<a[^>]+href="{{ fallback.route.url }}"/);
  assert.match(trigger, /<kbd data-search-shortcut aria-hidden="true">/);
  assert.ok(!shell.includes('shell__search-page'), 'no duplicate Search entry in the directory');
  assert.match(shell, /shell__settings-trigger[^>]+aria-label="{{ copy.settings.trigger_label }}"/);
});


test('Search names retain the localized action and match the visible platform shortcut', () => {
  for (const [platform, shortcut] of [['MacIntel', '⌘ K'], ['Win32', 'Ctrl K'], ['Linux x86_64', 'Ctrl K']]) {
    const f = fixture({ platform, searchLabel: 'Rechercher' });
    assert.equal(f.shortcutHint.textContent, shortcut);
    assert.equal(f.shortcutTrigger.getAttribute('aria-label'), `Rechercher, ${shortcut}`);
    assert.equal(f.shortcutTrigger.getAttribute('data-search-label'), 'Rechercher');
  }
});

test('the Search entry focuses the current page, preserving modifier-click navigation', () => {
  const f = fixture({ searchPage: true });
  assert.equal(f.pageLink.fire('click', { button: 0, metaKey: true }).prevented, undefined);
  assert.notEqual(f.document.activeElement, f.pageQuery);
  assert.equal(f.pageLink.fire('click', { button: 0 }).prevented, true);
  assert.equal(f.document.activeElement, f.pageQuery);
});

test('the prepaint header uses its actual final navigation height before the shell arrives', () => {
  const template = readFileSync(new URL('../templates/partials/header.html', import.meta.url), 'utf8');
  const script = template.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const mode of ['compact', 'direct', 'no-navigation']) {
    for (const position of ['static', 'sticky', 'fixed']) {
      const properties = new Map(), attributes = new Map();
      const menu = { hidden: true, setAttribute(name, value) { this[name] = value; } };
      const nav = { setAttribute(name, value) { this[name] = value; } };
      const header = {
        querySelector(selector) { return mode === 'no-navigation' ? null : selector === '.frame__menu' ? menu : nav; },
        setAttribute(name, value) { attributes.set(name, value); },
        getBoundingClientRect() {
          if (mode !== 'no-navigation') {
            assert.equal(attributes.get('data-navigation-mode'), mode, 'measure after the initial navigation layout');
            assert.equal(menu.hidden, false);
          }
          return { height: 83.5 };
        }
      };
      const document = { currentScript: { previousElementSibling: header }, documentElement: { style: { setProperty(name, value) { properties.set(name, value); } } } };
      vm.runInNewContext(script, { document, getComputedStyle: node => node === menu ? { display: mode === 'compact' ? 'inline-flex' : 'none' } : { position } });
      assert.equal(properties.get('--frame-header-height'), '83.5px');
      assert.equal(properties.get('--frame-chrome'), position === 'static' ? '0px' : '83.5px');
      if (mode === 'no-navigation') assert.equal(attributes.has('data-navigation-mode'), false);
      else {
        assert.equal(menu['aria-expanded'], String(mode === 'direct'));
        assert.equal(nav['data-collapsed'], String(mode === 'compact'));
      }
    }
  }
  assert.doesNotThrow(() => vm.runInNewContext(script, { document: { currentScript: { previousElementSibling: null } } }));
});
