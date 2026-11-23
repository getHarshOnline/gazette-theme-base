import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, mountTemplateFocusReveals } from '../scripts/focus-reveal.js';

// Native layout and scheduling are controlled separately: the tests supply
// changed word boxes, then assert the frame follows them and time never catches up.
function fixture({ sentence = 'Find the useful question', manual = false, focusMode = 'auto', mode,
  systemReduced = false, missingControl = false, invalidTokens = false,
  richHeading = false, failObserve = false, hash = '', withAction = false } = {}) {
  const originals = new Map(), observers = { intersection: [], resize: [], mutation: [] };
  const timers = new Map(), callbacks = [], created = [];
  let now = 100, serial = 0, fontSize = 40;
  const install = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true });
  };
  class Text {
    constructor(value) { this.textContent = value; this.nodeType = 3; }
  }
  class Element extends EventTarget {
    constructor(tag = 'div') {
      super(); this.tagName = tag.toUpperCase(); this.nodeType = 1; this.childNodes = [];
      this.dataset = {}; this.attrs = new Map(); this.style = {}; this.classes = new Set();
      this.hidden = false; this.offsetLeft = 12; this.offsetTop = 8; this.offsetWidth = 60; this.offsetHeight = 48;
      this.classList = {
        add: (...names) => names.forEach(n => this.classes.add(n)),
        remove: (...names) => names.forEach(n => this.classes.delete(n)),
        contains: name => this.classes.has(name),
        toggle: (name, value) => { if (value ?? !this.classes.has(name)) this.classes.add(name); else this.classes.delete(name); }
      };
    }
    get children() { return this.childNodes.filter(n => n.nodeType === 1); }
    get firstElementChild() { return this.children[0]; }
    get className() { return [...this.classes].join(' '); }
    set className(value) { this.classes = new Set(value.split(/\s+/)); }
    get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
    set textContent(value) { this.replaceChildren(new Text(value)); }
    append(...nodes) { nodes.forEach(n => { n.parentElement = this; this.childNodes.push(n); }); }
    replaceChildren(...nodes) { this.childNodes.forEach(n => { n.parentElement = null; }); this.childNodes = []; this.append(...nodes); }
    setAttribute(key, value) { this.attrs.set(key, String(value)); }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    removeAttribute(key) { this.attrs.delete(key); if (key === 'data-focus-state') delete this.dataset.focusState; }
    matches(selector) { return selector.split(',').includes(this.tagName.toLowerCase()); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    querySelector() { return null; }
    focus() { document.activeElement = this; this.dispatchEvent(new Event('focus')); }
  }
  const root = new Element('section'), content = new Element(), heading = new Element('h2'), control = new Element('button');
  const textNodes = [new Text(sentence.slice(0, 5)), new Text(sentence.slice(5))];
  heading.setAttribute('id', 'a-useful-question'); heading.classList.add('authored-heading'); heading.append(...textNodes);
  if (richHeading) heading.append(new Element('em'));
  content.append(heading);
  const action = new Element('a'); action.textContent = 'Learn more'; action.setAttribute('href', '/services/');
  if (withAction) content.append(action);
  root.append(content, control); root.dataset.focusMode = manual ? 'manual' : focusMode;
  control.textContent = 'Pause focus'; control.dataset.resume = 'Resume focus'; control.hidden = true;
  root.querySelector = s => s === '.focus-reveal__content' ? content : s === '.focus-reveal__pause' && !missingControl ? control : null;
  const doc = new Element(), win = new Element(), preference = new Element(), dialog = new Element('dialog');
  doc.documentElement = { dataset: mode ? { motion: mode } : {} }; doc.hidden = false; doc.activeElement = null;
  doc.querySelector = () => dialog.open ? dialog : null; doc.querySelectorAll = () => [dialog];
  doc.getElementById = id => id === 'a-useful-question' ? heading : id === 'elsewhere' ? dialog : null;
  doc.createElement = tag => { const el = new Element(tag); created.push(el); return el; };
  preference.matches = systemReduced;
  let resolveFonts, rejectFonts;
  doc.fonts = { ready: new Promise((resolve, reject) => { resolveFonts = resolve; rejectFonts = reject; }) };
  const tokens = { '--layout-focus-reveal-pad-inline': invalidTokens ? '' : '.2',
    '--layout-focus-reveal-pad-block': '.15', '--motion-focus-reveal-travel': '500ms', '--motion-focus-reveal-dwell': '1s', '--motion-focus-reveal-once-budget': '4500ms' };
  for (const [name, kind] of [['IntersectionObserver', 'intersection'], ['ResizeObserver', 'resize'], ['MutationObserver', 'mutation']]) {
    const Observer = class {
      constructor(fn) { this.fn = fn; observers[kind].push(this); }
      observe() { if (failObserve && kind === 'resize') throw new Error('observer unavailable'); }
      disconnect() { this.disconnected = true; }
    };
    install(name, Observer); win[name] = Observer;
  }
  const location = { hash };
  install('window', win); install('document', doc); install('location', location); install('matchMedia', () => preference);
  install('getComputedStyle', () => ({ fontSize: `${fontSize}px`, getPropertyValue: name => tokens[name] ?? '' }));
  install('performance', { now: () => now });
  install('setTimeout', (fn, delay) => { const id = ++serial; timers.set(id, { fn, at: now + delay }); callbacks.push(fn); return id; });
  install('clearTimeout', id => timers.delete(id));
  return { root, content, heading, control, action, doc, win, preference, dialog, location, textNodes, observers, timers, callbacks, created,
    element: { closest: () => ({ querySelector: () => root }) },
    words: () => heading.children.filter(e => e.classList.contains('focus-reveal__word')),
    frame: () => heading.children.find(e => e.classList.contains('focus-reveal__frame')),
    active: () => heading.children.filter(e => e.classList.contains('focus-reveal__word')).findIndex(e => e.classList.contains('focus-reveal__word--active')),
    show(value = true) { observers.intersection[0].fn([{ isIntersecting: value }]); },
    resize() { observers.resize[0].fn(); },
    overlay(value) { dialog.open = value; observers.mutation[0].fn(); },
    font(value) { fontSize = value; }, resolveFonts, rejectFonts,
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = end;
    },
    restore() { for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]; }
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('authored whitespace, NBSP, heading identity and original text nodes survive enhancement and disposal', () => {
  const sentence = '  Find\t the\n useful\u00a0question  ', f = fixture({ sentence }), dispose = mount(f);
  try {
    assert.equal(f.heading.textContent, sentence);
    assert.deepEqual(f.words().map(w => w.textContent), ['Find', 'the', 'useful\u00a0question']);
    assert.equal(f.heading.tagName, 'H2'); assert.equal(f.heading.getAttribute('id'), 'a-useful-question');
    assert.equal(f.frame().getAttribute('aria-hidden'), 'true');
    assert.equal(f.words().some(w => w.tabIndex === 0), false, 'automatic words introduce no keyboard stops');
    dispose(); assert.deepEqual(f.heading.childNodes, f.textNodes);
    assert.equal(f.heading.textContent, sentence); assert.ok(f.heading.classList.contains('authored-heading'));
    assert.equal(f.heading.classList.contains('focus-reveal__heading'), false);
  } finally { dispose(); f.restore(); }
});

test('frame follows a wrapped word and font replacement in all four measured dimensions', async () => {
  const f = fixture({ manual: true }), dispose = mount(f);
  try {
    const word = f.words()[2]; Object.assign(word, { offsetLeft: 18, offsetTop: 92, offsetWidth: 107, offsetHeight: 48 });
    word.focus();
    assert.equal(f.frame().style.transform, 'translate3d(10px,86px,0)');
    assert.equal(f.frame().style.width, '123px'); assert.equal(f.frame().style.height, '60px');
    f.font(60); Object.assign(word, { offsetLeft: 7, offsetTop: 164, offsetWidth: 153, offsetHeight: 72 });
    f.resize(); assert.equal(f.frame().style.transform, 'translate3d(-5px,155px,0)');
    assert.equal(f.frame().style.width, '177px'); assert.equal(f.frame().style.height, '90px');
    word.offsetWidth = 181; f.resolveFonts(); await flush(); assert.equal(f.frame().style.width, '205px');
    assert.equal(f.active(), 2, 'remeasure must not restart the selected word');
  } finally { dispose(); f.restore(); }
});

test('resize and font reflow flush new frame geometry without travel; word selection still travels', async () => {
  const f = fixture({ manual: true }), dispose = mount(f);
  try {
    const frame = f.frame(), flushes = [];
    Object.defineProperty(frame, 'offsetWidth', { get() {
      flushes.push({ transition: frame.style.transitionProperty, width: frame.style.width, transform: frame.style.transform });
      return 100;
    } });
    const word = f.words()[3]; word.focus(); assert.equal(flushes.length, 0, 'intentional word selection retains CSS travel');
    Object.assign(word, { offsetLeft: 16, offsetTop: 100, offsetWidth: 150, offsetHeight: 48 });
    f.resize();
    assert.deepEqual(flushes, [{ transition: 'none', width: '166px', transform: 'translate3d(8px,94px,0)' }]);
    assert.equal(frame.style.transitionProperty, '', 'word-to-word travel is restored after layout has settled');
    word.offsetWidth = 175; f.resolveFonts(); await flush();
    assert.equal(flushes.length, 2); assert.equal(flushes[1].transition, 'none'); assert.equal(flushes[1].width, '191px');
    f.words()[0].focus(); assert.equal(flushes.length, 2); assert.equal(frame.style.transitionProperty, '');
  } finally { dispose(); f.restore(); }
});

test('auto cadence includes travel plus dwell, wraps and preserves remaining time across every suspension', () => {
  const f = fixture(), dispose = mount(f);
  try {
    assert.equal(f.timers.size, 0); f.show(); f.advance(1499); assert.equal(f.active(), 0);
    f.advance(1); assert.equal(f.active(), 1); f.advance(4500); assert.equal(f.active(), 0);
    const blockers = [v => f.show(!v), v => { f.doc.hidden = v; f.doc.dispatchEvent(new Event('visibilitychange')); }, v => f.overlay(v)];
    for (const block of blockers) {
      const current = f.active(); f.advance(400); block(true); assert.equal(f.timers.size, 0);
      f.advance(9000); assert.equal(f.active(), current); block(false);
      f.advance(1099); assert.equal(f.active(), current); f.advance(1);
      assert.equal(f.active(), (current + 1) % 4, 'resume consumes remaining dwell, not a full restart or elapsed catch-up');
    }
  } finally { dispose(); f.restore(); }
});

test('Pause exposes the static complete heading and preserves its selection and remaining dwell', () => {
  const f = fixture(), dispose = mount(f);
  try {
    f.show(); f.advance(1900); f.control.dispatchEvent(new Event('click'));
    assert.equal(f.root.dataset.focusState, 'paused'); assert.equal(f.control.textContent, 'Resume focus');
    assert.equal(f.heading.textContent, 'Find the useful question'); assert.equal(f.timers.size, 0);
    f.advance(10000); assert.equal(f.active(), 1); f.control.dispatchEvent(new Event('click'));
    assert.equal(f.root.dataset.focusState, 'active'); assert.equal(f.control.textContent, 'Pause focus');
    f.advance(1099); assert.equal(f.active(), 1); f.advance(1); assert.equal(f.active(), 2);
  } finally { dispose(); f.restore(); }
});

test('cold and later native heading hashes pause complete text; unrelated or malformed hashes do not', () => {
  const cold = fixture({ hash: '#a-useful%2Dquestion' }), stop = mount(cold);
  try {
    cold.show(); assert.equal(cold.root.dataset.focusState, 'paused'); assert.equal(cold.timers.size, 0);
    assert.equal(cold.control.textContent, 'Resume focus'); assert.equal(cold.control.hidden, false);
    assert.equal(cold.heading.textContent, 'Find the useful question');
    cold.advance(9000); assert.equal(cold.active(), 0);
    cold.control.dispatchEvent(new Event('click')); cold.advance(1500); assert.equal(cold.active(), 1);
  } finally { stop(); cold.restore(); }
  const f = fixture(), dispose = mount(f);
  try {
    f.show(); f.advance(400);
    for (const hash of ['#elsewhere', '#missing', '#%E0%A4%A']) {
      f.location.hash = hash; f.win.dispatchEvent(new Event('hashchange'));
      assert.equal(f.root.dataset.focusState, 'active'); assert.equal(f.timers.size, 1);
    }
    f.location.hash = '#a-useful-question'; f.win.dispatchEvent(new Event('hashchange'));
    assert.equal(f.root.dataset.focusState, 'paused'); assert.equal(f.timers.size, 0);
    assert.equal(f.heading.textContent, 'Find the useful question');
    dispose(); f.win.dispatchEvent(new Event('hashchange'));
    assert.equal(f.root.dataset.focusState, undefined); assert.equal(f.control.hidden, true);
  } finally { dispose(); f.restore(); }
});

test('explicit Full and Reduced override system preference; changes settle without losing text', () => {
  for (const [mode, systemReduced, runs] of [['allow', true, true], ['reduce', false, false], [undefined, true, false], [undefined, false, true]]) {
    const f = fixture({ mode, systemReduced }), dispose = mount(f);
    try {
      f.show(); assert.equal(f.timers.size, runs ? 1 : 0); assert.equal(f.control.hidden, !runs);
      f.doc.documentElement.dataset.motion = 'reduce'; f.doc.dispatchEvent(new Event('motion-preference'));
      assert.equal(f.root.dataset.focusState, 'static'); assert.equal(f.timers.size, 0); assert.equal(f.control.hidden, true);
      assert.equal(f.heading.textContent, 'Find the useful question');
      delete f.doc.documentElement.dataset.motion; f.preference.matches = false; f.preference.dispatchEvent(new Event('change'));
      assert.equal(f.timers.size, 1); assert.equal(f.control.hidden, false);
    } finally { dispose(); f.restore(); }
  }
});

test('manual keyboard focus owns selection against pointer arrival until focus leaves words', () => {
  const f = fixture({ manual: true }), dispose = mount(f);
  try {
    f.show(); assert.equal(f.timers.size, 0); assert.ok(f.words().every(w => w.tabIndex === 0));
    f.words()[1].dispatchEvent(new Event('pointerenter')); assert.equal(f.active(), 1);
    f.words()[2].focus(); f.words()[0].dispatchEvent(new Event('pointerenter'));
    f.words()[0].dispatchEvent(new Event('pointerdown')); assert.equal(f.active(), 2);
    f.doc.activeElement = f.control; f.words()[3].dispatchEvent(new Event('pointerdown')); assert.equal(f.active(), 3);
  } finally { dispose(); f.restore(); }
});

test('print suspends and restores cadence without losing complete native copy', () => {
  const f = fixture(), dispose = mount(f);
  try {
    f.show(); f.advance(750); f.win.dispatchEvent(new Event('beforeprint'));
    assert.equal(f.root.dataset.focusState, 'static'); assert.equal(f.timers.size, 0);
    assert.equal(f.heading.textContent, 'Find the useful question'); f.advance(9000);
    f.win.dispatchEvent(new Event('afterprint')); f.advance(749); assert.equal(f.active(), 0);
    f.advance(1); assert.equal(f.active(), 1);
  } finally { dispose(); f.restore(); }
});

test('dispose before fonts settle cancels timers and tolerates queued callbacks without remounting', async () => {
  const f = fixture(), dispose = mount(f);
  try {
    f.show(); const frame = f.frame(), geometry = { ...frame.style }, callbacks = [...f.callbacks];
    dispose(); dispose(); f.font(80); f.resolveFonts(); await flush();
    f.show(); f.resize(); f.overlay(true); callbacks.forEach(fn => fn());
    f.control.dispatchEvent(new Event('click')); f.doc.dispatchEvent(new Event('motion-preference'));
    assert.equal(f.timers.size, 0); assert.deepEqual(f.heading.childNodes, f.textNodes);
    assert.deepEqual(frame.style, geometry); assert.equal(f.root.dataset.focusState, undefined);
    assert.equal(f.control.hidden, true); assert.equal(f.control.textContent, 'Pause focus');
    assert.ok(Object.values(f.observers).flat().every(o => o.disconnected));
  } finally { dispose(); f.restore(); }
});

test('unsupported native headings or invalid prerequisites remain untouched; failed setup restores them', async () => {
  for (const options of [{ missingControl: true }, { invalidTokens: true }, { richHeading: true }, { sentence: 'One' }]) {
    const f = fixture(options), nodes = [...f.heading.childNodes];
    try { assert.equal(mount(f), undefined); assert.deepEqual(f.heading.childNodes, nodes); assert.equal(f.control.hidden, true); assert.equal(f.timers.size, 0); }
    finally { f.restore(); }
  }
  const f = fixture({ failObserve: true });
  try {
    assert.throws(() => mount(f), /observer unavailable/); assert.deepEqual(f.heading.childNodes, f.textNodes);
    assert.equal(f.root.dataset.focusState, undefined); assert.equal(f.control.hidden, true);
    assert.ok(Object.values(f.observers).flat().every(o => o.disconnected));
    f.resolveFonts(); await flush();
  } finally { f.restore(); }
});

test('a rejected font load leaves a working measured heading and no rejected promise leak', async () => {
  const f = fixture(), dispose = mount(f);
  try { f.rejectFonts(new Error('font unavailable')); await flush(); f.show(); f.advance(1500); assert.equal(f.active(), 1); }
  finally { dispose(); f.restore(); }
});


test('once without a control settles completely within its budget and never restarts', async () => {
  const f = fixture({ sentence: 'Find the question', focusMode: 'once', missingControl: true }), dispose = mount(f);
  try {
    assert.equal(typeof dispose, 'function'); f.show();
    assert.equal(f.root.dataset.focusState, 'active');
    assert.equal(f.words().some(word => word.tabIndex === 0), false);
    f.advance(1500); assert.equal(f.active(), 1);
    f.overlay(true); f.advance(9000); assert.equal(f.active(), 1);
    f.overlay(false); f.advance(3000);
    assert.equal(f.root.dataset.focusState, 'complete');
    assert.equal(f.timers.size, 0); assert.equal(f.heading.textContent, 'Find the question');
    f.show(false); f.show(true); f.resize(); f.resolveFonts(); await flush();
    f.win.dispatchEvent(new Event('beforeprint')); f.win.dispatchEvent(new Event('afterprint'));
    f.doc.documentElement.dataset.motion = 'reduce'; f.doc.dispatchEvent(new Event('motion-preference'));
    f.doc.documentElement.dataset.motion = 'allow'; f.doc.dispatchEvent(new Event('motion-preference'));
    f.advance(90000);
    assert.equal(f.root.dataset.focusState, 'complete'); assert.equal(f.timers.size, 0);
    assert.equal(f.heading.textContent, 'Find the question');
  } finally { dispose(); f.restore(); }
});

test('once preserves a complete static heading when readable cadence exceeds the budget', () => {
  const f = fixture({ focusMode: 'once', missingControl: true }), nodes = [...f.heading.childNodes];
  try {
    assert.equal(mount(f), undefined); assert.deepEqual(f.heading.childNodes, nodes);
    assert.equal(f.heading.textContent, 'Find the useful question'); assert.equal(f.timers.size, 0);
  } finally { f.restore(); }
});

test('reduced motion, printing and direct heading arrival finish a once-only pass permanently', () => {
  for (const finish of [
    f => { f.doc.documentElement.dataset.motion = 'reduce'; f.doc.dispatchEvent(new Event('motion-preference')); },
    f => f.win.dispatchEvent(new Event('beforeprint')),
    f => { f.location.hash = '#a-useful-question'; f.win.dispatchEvent(new Event('hashchange')); }
  ]) {
    const f = fixture({ sentence: 'Find the question', focusMode: 'once', missingControl: true }), dispose = mount(f);
    try {
      f.show(); f.advance(400); finish(f);
      assert.equal(f.root.dataset.focusState, 'complete'); assert.equal(f.timers.size, 0);
      f.doc.documentElement.dataset.motion = 'allow'; f.doc.dispatchEvent(new Event('motion-preference'));
      f.win.dispatchEvent(new Event('afterprint')); f.show(false); f.show(true); f.advance(9000);
      assert.equal(f.root.dataset.focusState, 'complete'); assert.equal(f.timers.size, 0);
      assert.equal(f.heading.textContent, 'Find the question');
    } finally { dispose(); f.restore(); }
  }
});

test('template invitation shares the once-only lifecycle without changing its action', () => {
  const f = fixture({ sentence: 'Engage our services', focusMode: 'once', missingControl: true, withAction: true });
  const action = f.action;
  f.root.matches = selector => selector === '.focus-reveal';
  const container = { querySelectorAll: selector => {
    assert.equal(selector, '[data-focus-reveal]'); return [f.root];
  } };
  const dispose = mountTemplateFocusReveals(container);
  try {
    assert.equal(f.heading.textContent, 'Engage our services');
    assert.equal(f.content.children[1], action);
    assert.equal(action.getAttribute('href'), '/services/');
    assert.equal(action.textContent, 'Learn more');
    f.show(); assert.equal(f.root.dataset.focusState, 'active');
    f.advance(4500); assert.equal(f.root.dataset.focusState, 'complete');
    assert.equal(f.timers.size, 0);
    dispose(); assert.deepEqual(f.heading.childNodes, f.textNodes);
  } finally { dispose(); f.restore(); }
});

test('template invitation remains complete and static with reduced motion', () => {
  const f = fixture({ sentence: 'Engage our services', focusMode: 'once', missingControl: true, systemReduced: true });
  f.root.matches = selector => selector === '.focus-reveal';
  const dispose = mountTemplateFocusReveals({ querySelectorAll: () => [f.root] });
  try {
    f.show(); assert.equal(f.root.dataset.focusState, 'complete');
    assert.equal(f.heading.textContent, 'Engage our services');
    // The pass never runs, so the heading keeps its authored text nodes and natural word spaces.
    assert.deepEqual(f.heading.childNodes, f.textNodes);
    assert.equal(f.timers.size, 0);
  } finally { dispose(); f.restore(); }
});
