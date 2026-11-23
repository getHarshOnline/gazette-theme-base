import test from 'node:test';
import assert from 'node:assert/strict';
import * as deck from '../scripts/quote-deck.js';

// The DOM fixture preserves authored node identity and content independently of
// visual slots. Geometry expectations below come from the retained source.
function fixture({ count = 5, mode, systemReduced = false, width = 1000, destinationCards = false, autoplay = false, wheel = false, intersection = false } = {}) {
  const originals = new Map(), observers = [], intersections = [], rafs = new Map();
  let serial = 0;
  const install = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true });
  };
  class Element extends EventTarget {
    constructor(tag = 'div') {
      super(); this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = [];
      this.dataset = {}; this.attrs = new Map(); this.classes = new Set(); this.hidden = false; this.inert = false;
      this.style = { setProperty(k, v) { this[k] = String(v); }, getPropertyValue(k) { return this[k] ?? ''; },
        removeProperty(k) { const v = this[k]; delete this[k]; return v; } };
      this.classList = { add: (...xs) => xs.forEach(x => this.classes.add(x)),
        remove: (...xs) => xs.forEach(x => this.classes.delete(x)), contains: x => this.classes.has(x),
        toggle: (x, force) => { const add = force ?? !this.classes.has(x); add ? this.classes.add(x) : this.classes.delete(x); return add; } };
      this._text = ''; this.clientWidth = width; this.offsetWidth = width; this.offsetHeight = 440;
    }
    get className() { return [...this.classes].join(' '); }
    set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.children = []; }
    get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
    get childNodes() { return this.children; }
    setAttribute(name, value) {
      this.attrs.set(name, String(value));
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      if (name === 'class') this.className = value;
    }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    hasAttribute(name) { return this.attrs.has(name); }
    removeAttribute(name) {
      this.attrs.delete(name);
      if (name.startsWith('data-')) delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
      if (name === 'style') for (const k of Object.keys(this.style)) if (typeof this.style[k] !== 'function') delete this.style[k];
    }
    append(...nodes) { for (const n of nodes) { n.remove(); n.parentElement = this; this.children.push(n); } }
    appendChild(n) { this.append(n); return n; }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(n => n !== this); this.parentElement = null; }
    contains(n) { return n === this || this.children.some(c => c.contains(n)); }
    matches(selector) {
      return selector.split(',').some(part => {
        const s = part.trim();
        if (s === '*') return true;
        if (s.startsWith('.')) return this.classes.has(s.slice(1));
        const attr = /^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/.exec(s);
        if (attr) return this.hasAttribute(attr[1]) && (attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]);
        return s.toUpperCase() === this.tagName;
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
    querySelectorAll(selector) {
      if (selector.startsWith(':scope > ')) return this.children.filter(c => c.matches(selector.slice(9)));
      return this.children.flatMap(c => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    cloneNode(deep) {
      const c = new Element(this.tagName); c._text = this._text; c.className = this.className;
      for (const [k, v] of this.attrs) c.setAttribute(k, v);
      Object.assign(c.dataset, this.dataset); c.hidden = this.hidden; c.inert = this.inert;
      if (deep) c.append(...this.children.map(n => n.cloneNode(true)));
      return c;
    }
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: this.clientWidth, height: this.offsetHeight,
      right: this.clientWidth, bottom: this.offsetHeight }; }
    get disabled() { return this._disabled; }
    set disabled(value) {
      this._disabled = value;
      if (value && document.activeElement === this) document.activeElement = document.body;
    }
    focus(options) { if (!this.disabled) { document.activeElement = this; this.focusOptions = options; } }
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture(id) { if (this.capture === id) this.capture = null; }
  }
  const timers = new Map();
  install('setTimeout', callback => { const id=++serial;timers.set(id,callback);return id; });
  install('clearTimeout', id => timers.delete(id));
  const root = new Element('section'), stage = new Element(), controls = new Element(), position = new Element('output');
  root.className = 'quote-deck'; root.dataset.autoplay=String(autoplay);root.dataset.wheel=String(wheel); stage.className = 'quote-deck__stage'; controls.className = 'quote-deck__controls';
  position.className = 'quote-deck__position'; controls.hidden = true;
  const header = new Element('header'), arrows = new Element(); arrows.className = 'quote-deck__arrows'; arrows.hidden = true; header.append(arrows);
  const previous = new Element('button'), next = new Element('button');
  previous.setAttribute('data-quote-previous', ''); next.setAttribute('data-quote-next', ''); arrows.append(previous, next); controls.append(position);
  const playback = new Element('button');playback.setAttribute('data-quote-playback','');playback.dataset.pauseLabel='Pause testimonials';playback.dataset.resumeLabel='Play testimonials';playback.textContent='Pause testimonials';controls.append(playback);
  const cards = Array.from({ length: count }, (_, i) => {
    const card = new Element('figure'), quote = new Element('blockquote'), emphasis = new Element('em'), link = new Element('a');
    const caption = new Element('figcaption'), name = new Element('strong'), detail = new Element('span');
    card.className = 'quote-deck__card'; card.clientWidth = 360; card.offsetWidth = 360; card.setAttribute('id', `account-${i}`);
    for (const key of ['aria-describedby', 'aria-labelledby', 'aria-controls', 'aria-owns', 'aria-details', 'aria-errormessage']) quote.setAttribute(key, `account-${i}`); quote.textContent = `Evidence ${i}: `;
    emphasis.textContent = 'unaltered emphasis'; link.textContent = 'Read the source'; link.setAttribute('href', `/source-${i}/`);
    name.textContent = `Contributor ${i}`; detail.textContent = `Role ${i}`; caption.append(name, detail); quote.append(emphasis, link);
    if (destinationCards) {
      card.setAttribute('data-deck-label', `Collection entry ${i}`);
      card.append(link); link.textContent = `Collection entry ${i}`;
    } else card.append(quote, caption);
    return card;
  });
  stage.append(...cards); root.append(header, stage, controls);
  const wrapper = new Element(); wrapper.setAttribute('data-gazette-component', 'quote-deck'); wrapper.append(root);
  const doc = new Element(), win = new Element(), preference = new Element();
  doc.documentElement = { dataset: mode ? { motion: mode } : {}, clientWidth: width }; doc.activeElement = null; doc.hidden = false;
  doc.createElement = tag => new Element(tag); preference.matches = systemReduced; win.getSelection = () => ({ toString: () => '' });
  let resolveFonts, rejectFonts; doc.fonts = { ready: new Promise((resolve, reject) => { resolveFonts = resolve; rejectFonts = reject; }) };
  const tokens = {
    '--space-3': '8px', '--layout-quote-compact-width': '768px', '--layout-quote-step': '.83', '--layout-quote-drop': '.039', '--layout-quote-tilt': '7deg',
    '--layout-quote-neighbour-scale': '.86', '--layout-quote-falloff': '.94', '--layout-quote-side-opacity': '.7',
    '--layout-quote-far-opacity': '.385', '--layout-quote-drag-threshold': '6px', '--layout-quote-release-threshold': '.18', '--layout-quote-visible-distance': '3.2', '--layout-quote-card-width': '.36', '--delay-quote-autoplay':'5000ms','--delay-quote-wheel-lock':'450ms', '--material-quote-deck-side-opacity': '.7', '--material-quote-deck-far-opacity': '.385'
  };
  class Resize { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  install('window', win); install('document', doc); install('matchMedia', () => preference); install('ResizeObserver', Resize); win.ResizeObserver = Resize;
  if(intersection){
    win.IntersectionObserver=class {constructor(fn){this.fn=fn;intersections.push(this);}observe(){}disconnect(){this.disconnected=true;}};
    install('IntersectionObserver',win.IntersectionObserver);
  }
  install('getComputedStyle', node => ({ ...node.style, getPropertyValue: name => tokens[name] ?? '' }));
  install('requestAnimationFrame', fn => { const id = ++serial; rafs.set(id, fn); return id; });
  install('cancelAnimationFrame', id => rafs.delete(id));
  return { root, stage, controls, arrows, position, previous, next, playback, cards, doc, win, preference, observers, intersections, rafs, tokens, timers,
    tickAuto() { const pending=[...timers.values()];timers.clear();pending.forEach(callback=>callback()); },
    element: root, resolveFonts, rejectFonts,
    choices: () => controls.querySelector('.quote-deck__choices')?.children ?? [],
    visual: () => stage.querySelectorAll(':scope > .quote-deck__card'),
    active: () => cards.findIndex(c => c.dataset.active === 'true'),
    resize(value) { stage.clientWidth = value; stage.offsetWidth = value; for (const o of observers) o.fn(); },
    flush() { const batch = [...rafs.values()]; rafs.clear(); batch.forEach(fn => fn(16)); },
    fire(target, type, fields = {}) { const e = new Event(type, { cancelable: true }); for (const [k, v] of Object.entries(fields)) Object.defineProperty(e, k, { value: v }); target.dispatchEvent(e); return e; },
    restore() { for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]; }
  };
}

const source = { step: .83, drop: .039, tilt: 7, sideScale: .86, falloff: .94, sideOpacity: .7, farOpacity: .385 };
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} != ${expected}`);
test('source geometry preserves intermediate, near, far and hidden-edge poses without card-height dependence', () => {
  const cases = [
    [0, 0, 0, 0, 1, 1, 100],
    [.5, .415, .0195, 3.5, .93, .85, 95],
    [1, .83, .039, 7, .86, .7, 90],
    [2, 1.66, .078, 7, .8084, .385, 80],
    [3.2, 2.656, .078, 7, .7505501725976804, .385, 68]
  ];
  for (const [distance, x, y, rotate, scale, opacity, z] of cases) {
    const actual = deck.placeCard(distance, source);
    for (const [key, expected] of Object.entries({ x, y, rotate, scale, opacity, z })) close(actual[key], expected, `${distance} ${key}`);
    const mirror = deck.placeCard(-distance, source);
    close(mirror.x, -x, 'signed horizontal pose'); close(mirror.rotate, -rotate, 'signed tilt');
    close(mirror.y, y, 'same drop on both sides'); close(mirror.scale, scale, 'symmetric scale');
  }
});

test('ring wrapping takes the shortest path across seams and arbitrarily many turns', () => {
  assert.equal(deck.wrapDistance(4, 5), -1); assert.equal(deck.wrapDistance(-4, 5), 1);
  assert.equal(deck.wrapDistance(26, 5), 1); assert.equal(deck.wrapDistance(-26, 5), -1);
  assert.equal(deck.wrapDistance(5, 10), -5); assert.equal(deck.wrapDistance(-5, 10), -5);
  close(deck.wrapDistance(9.8, 10), -.2, 'fractional reverse seam');
});

test('release threshold is inclusive and preserves multi-card throws in either direction', () => {
  for (const n of [0, .179999, -.179999]) assert.equal(deck.releaseShift(n, .18), 0);
  for (const [offset, expected] of [[.18, 1], [-.18, -1], [.49, 1], [-.49, -1], [1.49, 1], [1.5, 2], [-1.5, -2], [3.2, 3]]) {
    assert.equal(deck.releaseShift(offset, .18), expected);
  }
});

const mounted = (options, run) => {
  const f = fixture(options); let dispose;
  try { dispose = deck.mount(f); return run(f, dispose); }
  finally { dispose?.(); f.restore(); }
};

test('the fan uses the visible viewport across gutters and off-center containers, then restores its layout', () => {
  const f = fixture({ width: 1000 }); let dispose;
  f.doc.documentElement.clientWidth = 1260; // A 1280px window with a reserved scrollbar.
  f.root.getBoundingClientRect = () => ({ left: 40, width: 1000 });
  f.root.style.setProperty('--quote-field-width', '700px');
  try {
    dispose = deck.mount(f);
    assert.equal(f.root.style.getPropertyValue('--quote-field-width'), '1260px');
    assert.equal(f.root.style.getPropertyValue('--quote-field-offset'), '90px');
    assert.equal(f.cards[0].offsetWidth, 360, 'the field does not set the canonical card width');
    f.doc.documentElement.clientWidth = 940;
    f.fire(f.win, 'resize');
    assert.equal(f.root.style.getPropertyValue('--quote-field-width'), '940px');
    assert.equal(f.root.style.getPropertyValue('--quote-field-offset'), '-70px');
    dispose();
    assert.equal(f.root.style.getPropertyValue('--quote-field-width'), '700px');
    assert.equal(f.root.style.getPropertyValue('--quote-field-offset'), '');
  } finally { dispose?.(); f.restore(); }
});

test('an inset destination deck stays in its column and centres each finite selection', () => {
  const f = fixture({ count: 3, width: 1000, destinationCards: true }); let dispose;
  f.root.dataset.deckField = 'container';
  const heading = f.doc.createElement('h3'); heading.textContent = 'A useful comparison'; f.cards[0].removeAttribute('data-deck-label'); f.cards[0].append(heading);
  f.doc.documentElement.clientWidth = 1600;
  f.root.getBoundingClientRect = () => ({ left: 550, width: 850 });
  try {
    dispose = deck.mount(f);
    assert.equal(f.root.style.getPropertyValue('--quote-field-width'), '850px');
    assert.equal(f.choices()[0].getAttribute('aria-label'), 'A useful comparison');
    assert.equal(f.root.style.getPropertyValue('--quote-field-offset'), '0px');
    assert.equal(f.active(), 1, 'the middle destination opens with one neighbour on each side');
    assert.equal(f.position.textContent, '2 / 3');
    assert.equal(f.cards[1].style.transform, 'translateX(0%) translateY(0px) rotate(0deg) scale(1)');
    assert.match(f.cards[0].style.transform, /translateX\(-/);
    assert.match(f.cards[2].style.transform, /translateX\(83/);
    assert.equal(f.previous.disabled, false);
    assert.equal(f.next.disabled, false);
    f.fire(f.next, 'click');
    assert.equal(f.active(), 2);
    assert.equal(f.next.disabled, true);
    f.fire(f.previous, 'click');
    assert.equal(f.active(), 1);
    assert.equal(f.cards[1].style.transform, 'translateX(0%) translateY(0px) rotate(0deg) scale(1)');
    assert.equal(f.visual().length, 3, 'a short inset set never duplicates destinations');
    assert.equal(f.timers.size, 0);
    dispose();
    assert.equal(f.root.style.getPropertyValue('--quote-field-width'), '');
  } finally { dispose?.(); f.restore(); }
});

test('an inset deck preserves a native link focused before enhancement', () => {
  const f = fixture({ count: 3, destinationCards: true }); let dispose;
  f.root.dataset.deckField = 'container';
  const link = f.cards[0].querySelector('a');
  link.focus();
  try {
    dispose = deck.mount(f);
    assert.equal(f.active(), 0);
    assert.equal(f.doc.activeElement, link);
    assert.equal(f.cards[0].inert, false);
  } finally { dispose?.(); f.restore(); }
});

test('compact destination clearance protects descending corners without a showcase-sized top gap', () => {
  const f = fixture({ count: 3, destinationCards: true }); let dispose;
  f.root.dataset.deckField = 'container';
  f.cards.forEach(card => { card.offsetWidth = 350; card.offsetHeight = 200; });
  try {
    dispose = deck.mount(f);
    const clearance = () => parseFloat(f.root.style.getPropertyValue('--quote-clearance'));
    assert.ok(clearance() > 24 && clearance() < 25, 'outer tilted corner receives its actual lower allowance');
    const settled = clearance();
    f.fire(f.next, 'click');
    assert.equal(clearance(), settled, 'selection keeps the stage and controls stationary');
    f.cards[1].offsetHeight = 400; f.fire(f.win, 'resize');
    assert.equal(clearance(), settled, 'a taller sibling does not add its height difference below a shorter, bottom-aligned card');
  } finally { dispose?.(); f.restore(); }
});

test('five canonical accounts provide ten inert visual slots but only five choices and unchanged source nodes', () => mounted({}, (f, dispose) => {
  assert.equal(f.visual().length, 10); assert.equal(f.choices().length, 5); assert.equal(f.position.textContent, '1 / 5');
  assert.equal(f.active(), 0); assert.equal(f.cards[0].inert, false);
  const clones = f.visual().filter(c => !f.cards.includes(c)); assert.equal(clones.length, 5);
  for (const clone of clones) {
    assert.equal(clone.inert, true); assert.equal(clone.getAttribute('aria-hidden'), 'true');
    for (const node of [clone, ...clone.querySelectorAll('*')]) {
      for (const key of ['id', 'aria-describedby', 'aria-labelledby', 'aria-controls', 'aria-owns', 'aria-details', 'aria-errormessage']) assert.equal(node.hasAttribute(key), false);
    }
  }
  for (const [i, card] of f.cards.entries()) {
    assert.equal(card.getAttribute('id'), `account-${i}`);
    assert.equal(card.querySelector('a').getAttribute('href'), `/source-${i}/`);
    assert.equal(card.querySelector('em').textContent, 'unaltered emphasis');
    assert.equal(card.querySelector('blockquote').getAttribute('aria-describedby'), `account-${i}`);
  }
  dispose(); assert.deepEqual(f.visual(), f.cards); assert.equal(f.controls.hidden, true); assert.equal(f.arrows.hidden, true); assert.equal(f.choices().length, 0);
}));

test('canonical account remains the interactive centre after complete visual-slot turns; selection never steals focus', () => mounted({}, f => {
  f.next.focus();
  for (let i = 1; i <= 13; i++) {
    f.fire(f.next, 'click'); assert.equal(f.active(), i % 5); assert.equal(f.position.textContent, `${i % 5 + 1} / 5`);
    assert.equal(f.doc.activeElement, f.next);
    assert.equal(f.cards.filter(c => !c.inert).length, 1);
    assert.equal(f.cards[i % 5].inert, false);
    assert.equal(f.cards[i % 5].style.transform, 'translateX(0%) translateY(0px) rotate(0deg) scale(1)', 'the original account, never a clone, occupies the centre');
    for (const clone of f.visual().filter(c => !f.cards.includes(c))) assert.equal(clone.inert, true);
  }
  f.fire(f.choices()[0], 'click'); assert.equal(f.active(), 0);
}));

const down = (f, x = 500, y = 100) => f.fire(f.stage, 'pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse', buttons: 1, clientX: x, clientY: y });
const move = (f, x, y = 100, buttons = 1) => f.fire(f.stage, 'pointermove', { pointerId: 1, pointerType: 'mouse', buttons, clientX: x, clientY: y });
const up = (f, type = 'pointerup') => f.fire(f.stage, type, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 });

test('drag uses source step distance, accepts a multi-card throw and restores selection on cancellation or vertical intent', () => mounted({}, f => {
  down(f); move(f, 500 - 2.2 * 360 * .83); up(f); assert.equal(f.active(), 2, '2.2 source steps select two unique accounts');
  for (const cancel of ['pointercancel', 'lostpointercapture']) {
    down(f); move(f, 100); up(f, cancel); assert.equal(f.active(), 2); assert.notEqual(f.root.dataset.dragging, 'true');
  }
  down(f); move(f, 490, 160); move(f, 100, 160); up(f); assert.equal(f.active(), 2, 'vertical scroll intent must not become horizontal selection');
  down(f); move(f, 100, 100, 0); up(f); assert.equal(f.active(), 2, 'lost mouse press must not select');
}));

test('touch capture transfer from a card child does not cancel the drag', () => mounted({}, f => {
  const child = f.cards[0].querySelector('a');
  const touch = { pointerId: 9, pointerType: 'touch', clientY: 100 };
  f.fire(f.stage, 'pointerdown', { ...touch, target: child, button: 0, clientX: 500 });
  f.fire(f.stage, 'pointermove', { ...touch, target: child, clientX: 460 });
  assert.equal(f.root.dataset.dragging, 'true');
  f.fire(f.stage, 'lostpointercapture', { ...touch, target: child });
  assert.equal(f.root.dataset.dragging, 'true', 'the stage now owns the pointer');
  f.fire(f.stage, 'pointermove', { ...touch, clientX: 180 });
  f.fire(f.stage, 'pointerup', touch);
  assert.equal(f.active(), 1);
  assert.notEqual(f.root.dataset.dragging, 'true');
}));

test('resize and preference changes discard a partial drag while preserving the settled canonical account', () => mounted({}, f => {
  f.fire(f.next, 'click'); down(f); move(f, 280); f.resize(620);
  assert.equal(f.active(), 1); assert.notEqual(f.root.dataset.dragging, 'true'); up(f); assert.equal(f.active(), 1);
  down(f); move(f, 250); f.doc.documentElement.dataset.motion = 'reduce'; f.doc.dispatchEvent(new Event('motion-preference'));
  assert.equal(f.root.dataset.reduced, 'true'); up(f); assert.equal(f.active(), 1);
  f.preference.matches = true; f.doc.documentElement.dataset.motion = 'allow'; f.preference.dispatchEvent(new Event('change'));
  assert.equal(f.root.dataset.reduced, 'false', 'explicit full overrides system reduced');
  f.preference.matches = false; f.doc.documentElement.dataset.motion = 'reduce'; f.preference.dispatchEvent(new Event('change'));
  assert.equal(f.root.dataset.reduced, 'true', 'explicit reduced overrides system full');
}));

test('print exposes every real account exactly once and afterwards restores the same selection', () => mounted({}, f => {
  f.fire(f.choices()[3], 'click'); f.win.dispatchEvent(new Event('beforeprint'));
  for (const card of f.cards) { assert.equal(card.inert, false); assert.notEqual(card.getAttribute('aria-hidden'), 'true'); }
  for (const clone of f.visual().filter(c => !f.cards.includes(c))) { assert.equal(clone.inert, true); assert.equal(clone.getAttribute('aria-hidden'), 'true'); }
  f.win.dispatchEvent(new Event('afterprint')); assert.equal(f.active(), 3); assert.equal(f.cards.filter(c => !c.inert).length, 1);
}));

for (const count of [0, 1]) test(`${count} entries remain static with no invented controls or duplicate slots`, () => mounted({ count }, f => {
  assert.equal(f.visual().length, count); assert.equal(f.controls.hidden, true); assert.ok(f.cards.every(card => card.inert === false)); assert.equal(f.choices().length, 0);
}));

test('late enhancement keeps the focused native card and clears only its scroll offset', () => {
  const f = fixture({ count: 3, destinationCards: true });
  f.stage.scrollLeft = 280;
  const link = f.cards[2].querySelector('a'); link.focus();
  const dispose = deck.mount(f);
  try {
    assert.equal(f.active(), 2);
    assert.equal(f.doc.activeElement, link);
    assert.equal(f.stage.scrollLeft, 0);
    dispose();
    assert.equal(f.stage.scrollLeft, 280);
    assert.ok(f.cards.every(card => !card.inert));
  } finally { dispose?.(); f.restore(); }
});

test('disposal before fonts settle restores native content and makes late events harmless', async () => {
  const f = fixture(); const dispose = deck.mount(f);
  try {
    f.fire(f.next, 'click'); down(f); move(f, 100); dispose(); dispose();
    assert.deepEqual(f.visual(), f.cards); assert.equal(f.controls.hidden, true); assert.equal(f.root.classList.contains('quote-deck--ready'), false);
    for (const c of f.cards) { assert.equal(c.inert, false); assert.notEqual(c.getAttribute('aria-hidden'), 'true'); }
    const state = f.root.textContent; f.resolveFonts(); await new Promise(resolve => setImmediate(resolve));
    f.fire(f.next, 'click'); f.resize(400); f.doc.dispatchEvent(new Event('motion-preference')); f.win.dispatchEvent(new Event('beforeprint')); f.flush();
    assert.equal(f.root.textContent, state); assert.deepEqual(f.visual(), f.cards); assert.ok(f.observers.every(o => o.disconnected));
  } finally { dispose?.(); f.restore(); }
});

test('keyboard answers card links and relocates focus only when its old account becomes inert', () => mounted({}, f => {
  const link = f.cards[0].querySelector('a'); link.focus();
  assert.equal(f.fire(f.root, 'keydown', { key: 'ArrowRight', target: link, altKey: true }).defaultPrevented, false, 'modified keys stay with the browser');
  const event = f.fire(f.root, 'keydown', { key: 'ArrowRight', target: link });
  assert.equal(event.defaultPrevented, true); assert.equal(f.active(), 1); assert.equal(f.doc.activeElement, f.cards[1].querySelector('a'), 'focus follows the selection to the new card');
  f.fire(f.root, 'keydown', { key: 'End', target: f.next }); assert.equal(f.active(), f.cards.length - 1);
  f.fire(f.root, 'keydown', { key: 'Home', target: f.next }); assert.equal(f.active(), 0);
  f.fire(f.next, 'click'); assert.equal(f.active(), 1); assert.equal(f.doc.activeElement, f.next);
  assert.equal(f.cards[0].inert, true, 'focus leaves a canonical account before it becomes inert');
  f.fire(f.root, 'keydown', { key: 'ArrowLeft', target: f.previous });
  assert.equal(f.active(), 0); assert.equal(f.doc.activeElement, f.next, 'selection must not steal existing control focus');
}));

test('invalid geometry tokens leave the complete static native deck untouched', () => {
  const f = fixture(); f.tokens['--layout-quote-step'] = ''; let dispose;
  try {
    dispose = deck.mount(f); assert.equal(dispose, undefined); assert.deepEqual(f.visual(), f.cards);
    assert.equal(f.controls.hidden, true); assert.equal(f.root.classList.contains('quote-deck--ready'), false);
    assert.ok(f.cards.every(c => !c.inert && c.getAttribute('aria-hidden') === null));
  } finally { dispose?.(); f.restore(); }
});

test('a rejected font-ready promise leaves the settled native account operable', async () => {
  const f = fixture(), dispose = deck.mount(f);
  try {
    f.rejectFonts(new Error('font unavailable')); await new Promise(resolve => setImmediate(resolve));
    f.fire(f.next, 'click'); assert.equal(f.active(), 1); assert.equal(f.position.textContent, '2 / 5');
    assert.equal(f.cards[1].inert, false);
  } finally { dispose(); f.restore(); }
});


test('template-owned destination cards preserve native links, title-based choices and complete disposal', () => {
  const f = fixture({ count: 3, destinationCards: true });
  f.root.setAttribute('data-content-deck', '');
  const originalLinks = f.cards.map(card => card.querySelector('a'));
  const dispose = deck.mountContentDecks({ querySelectorAll: selector => {
    assert.equal(selector, '[data-content-deck]'); return [f.root];
  } });
  try {
    assert.deepEqual(f.choices().map(button => button.getAttribute('aria-label')), ['Collection entry 0', 'Collection entry 1', 'Collection entry 2']);
    f.fire(f.choices()[1], 'click');
    assert.equal(f.active(), 1);
    assert.deepEqual(f.cards.map(card => card.querySelector('a')), originalLinks);
    assert.equal(originalLinks[1].getAttribute('href'), '/source-1/');
    f.win.dispatchEvent(new Event('beforeprint'));
    assert.ok(f.cards.every(card => !card.inert && card.getAttribute('aria-hidden') === 'false'));
    dispose(); assert.deepEqual(f.visual(), f.cards);
    assert.deepEqual(f.cards.map(card => card.querySelector('a')), originalLinks);
  } finally { dispose(); f.restore(); }
});

test('whole-card links keep clicks and modifier activation but a horizontal drag suppresses its ensuing pointer click', () => mounted({ destinationCards: true }, f => {
  const link = f.cards[0].querySelector('a');
  const start = extra => f.fire(f.stage, 'pointerdown', { target: link, button: 0, pointerId: 1, pointerType: 'mouse', buttons: 1, clientX: 500, clientY: 100, ...extra });
  start(); up(f);
  assert.equal(f.fire(f.stage, 'click', { target: link, detail: 1 }).defaultPrevented, false);
  start({ metaKey: true }); move(f, 100); up(f);
  assert.equal(f.active(), 0);
  assert.equal(f.fire(f.stage, 'click', { target: link, detail: 1, metaKey: true }).defaultPrevented, false);
  start(); move(f, 100); up(f);
  assert.notEqual(f.active(), 0);
  assert.equal(f.fire(f.stage, 'click', { target: link, detail: 1 }).defaultPrevented, true);
  assert.equal(f.fire(f.stage, 'click', { target: link, detail: 0 }).defaultPrevented, false, 'keyboard navigation remains native');
  start(); move(f, 495, 180); up(f);
  assert.equal(f.fire(f.stage, 'click', { target: link, detail: 1 }).defaultPrevented, false, 'vertical reading does not suppress navigation');
}));

test('active selector scrolling stays inside its own strip', () => mounted({ count: 20, destinationCards: true }, f => {
  const choices = f.controls.querySelector('.quote-deck__choices');
  choices.clientWidth = 100; choices.scrollWidth = 1000; choices.scrollLeft = 0;
  choices.getBoundingClientRect = () => ({ left: 0, width: 100 });
  f.choices().forEach((button, index) => { button.getBoundingClientRect = () => ({ left: index * 50 - choices.scrollLeft, width: 40 }); });
  f.fire(f.choices()[10], 'click');
  assert.equal(choices.scrollLeft, 440);
  f.fire(f.choices()[0], 'click');
  assert.equal(choices.scrollLeft, 0);
}));


test('text selection before or during a gesture retains priority over deck dragging', () => mounted({ destinationCards: true }, f => {
  let selection = 'Selected passage';
  f.win.getSelection = () => ({ toString: () => selection });
  down(f); move(f, 100); up(f); assert.equal(f.active(), 0);
  selection = ''; down(f); selection = 'New selection'; move(f, 100); up(f);
  assert.equal(f.active(), 0);
  assert.equal(f.fire(f.stage, 'click', { detail: 1, target: f.cards[0].querySelector('a') }).defaultPrevented, false);
}));


test('observed carousel playback waits for visibility, preserves pause and disconnects', () => mounted({ autoplay: true, intersection: true }, (f, dispose) => {
  assert.equal(f.timers.size,0,'carousel starts out of view until the first observation');
  const observer=f.intersections[0];
  observer.fn([{isIntersecting:false},{isIntersecting:true}]);assert.equal(f.timers.size,1);
  observer.fn([{isIntersecting:false}]);assert.equal(f.timers.size,0);
  observer.fn([{isIntersecting:true}]);f.fire(f.playback,'click');assert.equal(f.timers.size,0);
  observer.fn([{isIntersecting:false}]);observer.fn([{isIntersecting:true}]);assert.equal(f.timers.size,0,'visibility does not undo reader pause');
  dispose();assert.equal(observer.disconnected,true);observer.fn([{isIntersecting:true}]);assert.equal(f.timers.size,0);
}));

test('testimonial autoplay pauses for hover, focus, drag, hidden documents and the explicit toggle', () => mounted({ autoplay: true }, f => {
  assert.equal(f.timers.size,1); f.tickAuto();assert.equal(f.active(),1);
  f.fire(f.root,'pointerenter');assert.equal(f.timers.size,0);
  f.fire(f.root,'pointerleave');assert.equal(f.timers.size,1);
  f.fire(f.root,'focusin');assert.equal(f.timers.size,0);
  f.fire(f.root,'focusout',{relatedTarget:null});assert.equal(f.timers.size,1);
  down(f);assert.equal(f.timers.size,0);up(f);assert.equal(f.timers.size,1);
  f.doc.hidden=true;f.fire(f.doc,'visibilitychange');assert.equal(f.timers.size,0);
  f.doc.hidden=false;f.fire(f.doc,'visibilitychange');assert.equal(f.timers.size,1);
  f.fire(f.playback,'click');assert.equal(f.timers.size,0);assert.equal(f.playback.textContent,'Play testimonials');
  f.fire(f.playback,'click');assert.equal(f.timers.size,1);assert.equal(f.playback.textContent,'Pause testimonials');
  f.doc.documentElement.dataset.motion='reduce';f.fire(f.doc,'motion-preference');assert.equal(f.timers.size,0);
  assert.equal(f.playback.hidden,true,'reduced motion offers no playback it cannot perform');
  f.doc.documentElement.dataset.motion='allow';f.fire(f.doc,'motion-preference');
  assert.equal(f.playback.hidden,false);assert.equal(f.playback.textContent,'Pause testimonials');assert.equal(f.timers.size,1);
}));

test('testimonial wheel locks a gesture to one step and does not intercept browser zoom', () => mounted({ wheel: true }, f => {
  const event=f.fire(f.stage,'wheel',{deltaX:0,deltaY:100});assert.equal(event.defaultPrevented,true);assert.equal(f.active(),1);
  f.fire(f.stage,'wheel',{deltaX:0,deltaY:80});assert.equal(f.active(),1);
  const zoom=f.fire(f.stage,'wheel',{deltaX:0,deltaY:100,ctrlKey:true});assert.equal(zoom.defaultPrevented,false);assert.equal(f.active(),1);
}));

test('collection decks never acquire autoplay or wheel interception by default', () => mounted({ destinationCards: true }, f => {
  assert.equal(f.timers.size,0);assert.equal(f.playback.hidden,true);
  assert.equal(f.fire(f.stage,'wheel',{deltaX:100,deltaY:0}).defaultPrevented,false);assert.equal(f.active(),0);
}));

for (const count of [2, 3]) test(`${count} finite entries release outward wheel input to page scrolling, including during the gesture lock`, () => mounted({ count, wheel: true }, f => {
  const wheel = deltaY => f.fire(f.stage, 'wheel', { deltaX: 0, deltaY });
  assert.equal(wheel(-100).defaultPrevented, false, 'the first card must not trap upward reading');
  assert.equal(f.active(), 0);
  assert.equal(wheel(100).defaultPrevented, true, 'an available next card still receives the gesture');
  assert.equal(f.active(), 1);
  f.fire(f.choices()[count - 1], 'click');
  assert.equal(wheel(100).defaultPrevented, false, 'the final card releases downward input before the lock expires');
  assert.equal(f.active(), count - 1);
  f.fire(f.choices()[0], 'click');
  assert.equal(wheel(-100).defaultPrevented, false, 'reverse page traversal remains possible inside the same lock');
  assert.equal(f.active(), 0);
}));

test('a looping deck still consumes a wheel step across its end', () => mounted({ count: 4, wheel: true }, f => {
  f.fire(f.previous, 'click');
  assert.equal(f.active(), 3);
  const event = f.fire(f.stage, 'wheel', { deltaX: 0, deltaY: 100 });
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.active(), 0);
}));

for (const count of [2, 3]) test(`${count} entries remain finite, reader-paced and free of duplicate slots`, () => mounted({ count, autoplay: true, destinationCards: true }, (f, dispose) => {
  assert.deepEqual(f.visual(), f.cards, 'each native card appears exactly once');
  assert.equal(f.timers.size, 0); assert.equal(f.playback.hidden, true);
  assert.equal(f.active(), 0, 'authored reading order starts at the first item');
  f.fire(f.choices()[0], 'click');
  assert.equal(f.previous.disabled, true); assert.equal(f.next.disabled, false);
  f.fire(f.previous, 'click'); assert.equal(f.active(), 0);
  f.fire(f.choices()[count - 1], 'click'); assert.equal(f.active(), count - 1);
  assert.equal(f.previous.disabled, false); assert.equal(f.next.disabled, true);
  f.fire(f.next, 'click'); assert.equal(f.active(), count - 1, 'last item never wraps to first');
  down(f); move(f, 500 - 4 * 360 * .83); up(f); assert.equal(f.active(), count - 1, 'throw stays at finite end');
  f.fire(f.root, 'keydown', { key: 'ArrowLeft', target: f.previous }); assert.equal(f.active(), count - 2);
  f.fire(f.choices()[0], 'click'); assert.equal(f.active(), 0);
  assert.deepEqual(f.visual(), f.cards); assert.equal(f.timers.size, 0);
  dispose(); assert.equal(f.previous.disabled, undefined); assert.equal(f.next.disabled, undefined);
}));

test('four entries retain the continuous ring and pausable playback', () => mounted({ count: 4, autoplay: true }, f => {
  assert.equal(f.visual().length, 8); assert.equal(f.playback.hidden, false); assert.equal(f.timers.size, 1);
  f.fire(f.previous, 'click'); assert.equal(f.active(), 3);
  assert.equal(f.previous.disabled, false); assert.equal(f.next.disabled, false);
  f.fire(f.next, 'click'); assert.equal(f.active(), 0);
}));

for (const count of [2, 3]) test(`${count} entries keep balanced wide positions while selection only changes emphasis`, () => mounted({ count }, f => {
  const expected = f.cards.map((_, i) => deck.placeCard(i - (count - 1) / 2, source));
  const poses = () => f.cards.map(card => card.style.transform.split(' scale(')[0]);
  assert.deepEqual(poses(), expected.map(p => `translateX(${p.x * 100}%) translateY(${p.y * 360}px) rotate(${p.rotate}deg)`));
  const initial = poses();
  f.fire(f.choices()[count - 1], 'click');
  assert.deepEqual(poses(), initial, 'manual selection leaves the short group centered');
  assert.ok(f.cards[count - 1].style.transform.endsWith('scale(1)'));
  f.root.getBoundingClientRect = () => ({ left: 0, width: 600 });
  f.fire(f.win, 'resize');
  assert.equal(f.cards[count - 1].style.transform, 'translateX(0%) translateY(0px) rotate(0deg) scale(1)', 'compact field focuses the selected card');
  f.root.getBoundingClientRect = () => ({ left: 0, width: 1000 });
  f.fire(f.win, 'resize'); assert.deepEqual(poses(), initial);
}));

for (const count of [2, 3]) test(`${count}-card deck keeps arrow focus usable at finite boundaries`, () => mounted({ count, destinationCards: true }, f => {
  f.next.focus();
  for (let i = 1; i < count; i++) f.fire(f.next, 'click');
  assert.equal(f.active(), count - 1);
  assert.equal(f.next.disabled, true);
  assert.equal(f.doc.activeElement, f.previous, 'reverse arrow receives focus before Next disables');
  assert.deepEqual(f.previous.focusOptions, { preventScroll: true });
  for (let i = 1; i < count; i++) f.fire(f.root, 'keydown', { key: 'ArrowLeft', target: f.doc.activeElement });
  assert.equal(f.active(), 0);
  assert.equal(f.previous.disabled, true);
  assert.equal(f.doc.activeElement, f.next, 'the original reverse keyboard journey remains usable');
  for (const key of ['End', 'Home', 'ArrowRight', 'Home']) {
    f.fire(f.root, 'keydown', { key, target: f.doc.activeElement });
    assert.ok(f.doc.activeElement === f.previous || f.doc.activeElement === f.next);
    assert.equal(f.doc.activeElement.disabled, false, `${key} leaves an enabled arrow focused`);
  }
  const choice = f.choices()[count - 1]; choice.focus();
  f.fire(choice, 'click');
  assert.equal(f.doc.activeElement, choice, 'a selected choice keeps its own focus');
}));

test('looping deck arrows retain focus across their last and first accounts', () => mounted({ count: 4 }, f => {
  f.next.focus();
  for (const key of ['End', 'ArrowRight', 'Home', 'ArrowLeft']) {
    f.fire(f.root, 'keydown', { key, target: f.next });
    assert.equal(f.doc.activeElement, f.next);
    assert.equal(f.next.disabled, false);
    assert.equal(f.previous.disabled, false);
  }
}));
