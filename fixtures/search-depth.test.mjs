import test from 'node:test';
import assert from 'node:assert/strict';
import { depthPose, mountSearchExplorer } from '../scripts/search-explorer.js';
import { mountArticleListings } from '../scripts/article-listing.js';
const recipe = { yaw: 35, maxYaw: 75, retreat: .28, falloff: .08 };
test('depth resolves continuously and symmetrically around the selected result', () => {
  assert.deepEqual(depthPose(0, recipe), { turn: -0, depth: -0, scale: 1 });
  const left = depthPose(-1, recipe), right = depthPose(1, recipe);
  assert.equal(left.turn, -right.turn);
  assert.equal(left.depth, right.depth);
  assert.equal(left.scale, right.scale);
  assert.ok(depthPose(.5, recipe).scale > right.scale);
  assert.equal(Math.abs(depthPose(50, recipe).turn), 75);
  assert.ok(depthPose(50, recipe).scale > 0);
});

class Surface {
  constructor() {
    this.children = []; this.style = { setProperty(name,value) { this[name] = value; }, removeProperty(name) { delete this[name]; } }; this.attributes = new Set(); this.listeners = new Map();
    this.classes = new Set(); this.captures = new Set(); this.selectors = new Map();
    this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name), contains: name => this.classes.has(name) };
  }
  querySelector(selector) { return this.selectors.get(selector) || null; }
  querySelectorAll(selector) { return this.selectors.get(selector) || []; }
  getBoundingClientRect() { return { left: this.left || 0 }; }
  closest() { return null; }
  get disabled() { return this._disabled; }
  set disabled(value) {
    this._disabled = value;
    if (value && document.activeElement === this) document.activeElement = document.body;
  }
  focus(options) { if (!this.disabled) { document.activeElement = this; this.focusOptions = options; } }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  toggleAttribute(name, enabled) { if (enabled) this.attributes.add(name); else this.attributes.delete(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, callback, options = {}) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
    options.signal?.addEventListener('abort', () => this.listeners.get(type)?.delete(callback), { once: true });
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  fire(type, supplied = {}) {
    const event = { target: this, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...supplied };
    for (const callback of this.listeners.get(type) || []) callback(event);
    return event;
  }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
}

function fixture(run, { count = 5, resizeAvailable = true, validTokens = true, articleListing = false, focusedCard = -1 } = {}) {
  const names = ['document', 'window', 'ResizeObserver', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const saved = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const frames = new Map(), observers = []; let clock = 0;
  const root = new Surface(), list = new Surface(), matches = new Surface(), controls = new Surface();
  const previous = new Surface(), next = new Surface(), output = new Surface();
  root.selectors.set('.search-depth__controls', controls); root.selectors.set('.search-page__matches', matches);
  controls.selectors.set('[data-search-depth-previous]', previous); controls.selectors.set('[data-search-depth-next]', next); controls.selectors.set('output', output);
  list.clientWidth = 600; list.scrollLeft = 900; list.scrollRequests = [];
  list.scrollTo = request => { list.scrollRequests.push(request); if (request.behavior === 'instant') list.scrollLeft = request.left; };
  const cards = Array.from({ length: count }, (_, at) => {
    const card = new Surface(), entry = new Surface();
    entry.offsetLeft = 200 + at * 240; entry.offsetWidth = 200; entry.children.push(card); list.children.push(entry);
    return card;
  });
  const doc = new Surface(); doc.documentElement = { dataset: {}, clientWidth: 1200 };
  if (focusedCard >= 0) doc.activeElement = cards[focusedCard];
  const win = new Surface(), preference = new Surface(); preference.matches = false;
  const tokens = {
    '--layout-search-depth-yaw': '35', '--layout-search-depth-yaw-max': '75',
    '--layout-search-depth-retreat': '.28', '--layout-search-depth-scale-falloff': '.08', '--space-2': '8px',
  };
  Object.assign(globalThis, {
    document: doc, window: win,
    ResizeObserver: resizeAvailable ? class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } } : undefined,
    matchMedia: () => preference,
    getComputedStyle: () => ({ getPropertyValue: key => validTokens ? tokens[key] : '' }),
    requestAnimationFrame: callback => { frames.set(++clock, callback); return clock; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  const selections = [];
  if (articleListing) {
    root.selectors.set('[data-article-listing]', [root]);
    root.selectors.set('.reading-list', list); root.selectors.set('.article-listing__controls', controls);
    list.selectors.set('.reading-list__entry', cards);
    controls.selectors.set('[data-depth-previous]', previous); controls.selectors.set('[data-depth-next]', next);
  }
  const view = articleListing ? mountArticleListings(root)[0] :
    mountSearchExplorer({ root, list, cards, onSelect: index => selections.push(index) });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  try { run({ root, list, cards, controls, previous, next, output, matches, view, selections, frames, observers, flush, doc, win }); }
  finally {
    view?.destroy();
    for (const name of names) { if (saved[name]) Object.defineProperty(globalThis, name, saved[name]); else delete globalThis[name]; }
  }
}

test('a newly mounted result set starts at its first result rather than the old horizontal offset', () => {
  fixture(({ list, cards, output, flush }) => {
    assert.equal(list.scrollLeft, 0);
    flush();
    assert.equal(output.textContent, '1 / 5');
    assert.equal(cards[0].attributes.has('data-search-active'), true);
    assert.equal(cards[4].attributes.has('data-search-active'), false);
  });
});

for (const articleListing of [false, true]) {
  test(`late enhancement retains the focused ${articleListing ? 'article' : 'search result'}`, () => {
    fixture(({ list, cards, output, doc, flush }) => {
      flush();
      assert.equal(doc.activeElement, cards[3]);
      assert.equal(output.textContent, '4 / 5');
      assert.equal(list.scrollLeft, 720);
      assert.equal(cards[3].attributes.has(articleListing ? 'data-depth-active' : 'data-search-active'), true);
    }, { articleListing, focusedCard: 3 });
  });
}

test('rapid Next presses keep the pending destination while a smooth scroll is still in flight', () => {
  fixture(({ list, next, output, selections, flush }) => {
    flush(); next.fire('click'); flush(); next.fire('click'); flush(); next.fire('click');
    assert.deepEqual(selections, [1, 2, 3]);
    assert.deepEqual(list.scrollRequests.slice(-3).map(request => request.left), [240, 480, 720]);
    assert.equal(list.scrollLeft, 0, 'the simulated smooth animation has not reached its destination');
    list.scrollLeft = list.scrollRequests.at(-1).left; list.fire('scrollend');
    assert.equal(output.textContent, '4 / 5');
  });
});

for (const articleListing of [false, true]) {
  const surface = articleListing ? 'article listing' : 'search results';
  test(`direction controls reverse early travel from either edge of ${surface}`, () => {
    fixture(({ list, previous, next, output, flush }) => {
      flush();
      next.fire('click');
      list.scrollLeft = 35; list.fire('scroll'); flush();
      assert.equal(output.textContent, '1 / 2');
      assert.equal(previous.disabled, false, 'Previous reverses the pending move away from the first card');
      assert.equal(next.disabled, true, 'the pending destination is the last card');
      previous.fire('click');
      assert.equal(list.scrollRequests.at(-1).left, 0);
      list.scrollLeft = 0; list.fire('scrollend');
      assert.equal(previous.disabled, true);
      assert.equal(next.disabled, false);

      next.fire('click');
      list.scrollLeft = 240; list.fire('scrollend');
      previous.fire('click');
      list.scrollLeft = 205; list.fire('scroll'); flush();
      assert.equal(output.textContent, '2 / 2');
      assert.equal(next.disabled, false, 'Next reverses the pending move away from the last card');
      assert.equal(previous.disabled, true, 'the pending destination is the first card');
      next.fire('click');
      assert.equal(list.scrollRequests.at(-1).left, 240);
      list.scrollLeft = 240; list.fire('scrollend');
      assert.equal(next.disabled, true);
    }, { count: 2, articleListing });
  });
}

test('a direct gesture returns the controls to the nearest card', () => {
  for (const eventType of ['wheel', 'touchstart']) {
    fixture(({ list, previous, next, flush }) => {
      flush(); next.fire('click');
      list.scrollLeft = 35; list.fire('scroll'); flush();
      assert.equal(previous.disabled, false);
      list.fire(eventType);
      assert.equal(previous.disabled, true);
      assert.equal(next.disabled, false);
    });
  }
});

for (const articleListing of [false, true]) {
  const surface = articleListing ? 'article listing' : 'search results';
  test(`keyboard focus replaces the pending destination in ${surface}`, () => {
    fixture(({ list, cards, previous, next, flush }) => {
      flush(); next.fire('click');
      list.scrollLeft = 35; list.fire('scroll'); flush();
      const link = new Surface(); link.matches = () => true; cards[0].children.push(link);
      list.fire('focusin', { target: link }); flush();
      assert.equal(list.scrollRequests.at(-1).left, 0);
      assert.equal(previous.disabled, true, 'focus requested the first card, even without a scrollend');
      assert.equal(next.disabled, false);
    }, { count: 2, articleListing });
  });
  test(`a focus scroll that ends on a neighbour cannot replace the focused card in ${surface}`, () => {
    fixture(({ list, cards, output, selections, flush }) => {
      flush();
      // The browser's own focus scroll lands on card 1 before focusin asks for card 2.
      list.scrollLeft = 240;
      const link = new Surface(); link.matches = () => true; cards[2].children.push(link);
      list.fire('focusin', { target: link }); flush();
      const before = selections.length;
      list.fire('scrollend'); flush();
      assert.equal(selections.length, before, 'the neighbour is never announced as selected');
      assert.equal(list.scrollRequests.at(-1).left, 480, 'travel to the focused card is requested again');
      list.scrollLeft = 480; list.fire('scrollend'); flush();
      assert.equal(output.textContent, '3 / 5');
      assert.equal(cards[2].attributes.has(articleListing ? 'data-depth-active' : 'data-search-active'), true);
      if (!articleListing) assert.equal(selections.at(-1), 2);
    }, { articleListing });
  });
  test(`mouse drag releases an older button destination in ${surface}`, () => {
    fixture(({ list, previous, next, flush }) => {
      flush(); next.fire('click');
      list.scrollLeft = 35; list.fire('scroll'); flush();
      list.fire('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 100, clientY: 20 });
      list.fire('pointermove', { pointerId: 1, clientX: 130, clientY: 20 });
      list.fire('scroll'); flush();
      assert.equal(previous.disabled, true, 'the recognized drag now owns the position');
      assert.equal(next.disabled, false);
      list.fire('pointerup', { pointerId: 1 }); flush();
      assert.equal(list.scrollRequests.at(-1).left, 0);
      assert.equal(previous.disabled, true, 'release cannot revive the old destination without a scrollend');
      assert.equal(next.disabled, false);
    }, { count: 2, articleListing });
  });
}

test('a context update without scrolling preserves the pending destination', () => {
  fixture(({ list, view, previous, next, flush }) => {
    flush(); next.fire('click');
    // Search acknowledges onSelect by updating its open context without travel.
    view.select(1, { scroll: false });
    list.scrollLeft = 35; list.fire('scroll'); flush();
    assert.equal(previous.disabled, false); assert.equal(next.disabled, true);
    previous.fire('click'); assert.equal(list.scrollRequests.at(-1).left, 0);
  }, { count: 2 });
});

test('rapid arrow keys keep the pending destination across paints during a smooth scroll', () => {
  fixture(({ matches, list, output, selections, flush }) => {
    flush();
    for (let step = 0; step < 3; step++) {
      matches.fire('keydown', { key: 'ArrowRight' });
      flush();
    }
    assert.deepEqual(selections, [1, 2, 3]);
    assert.deepEqual(list.scrollRequests.slice(-3).map(request => request.left), [240, 480, 720]);
    assert.equal(list.scrollLeft, 0, 'the simulated smooth animation has not reached its destination');
    matches.fire('keydown', { key: 'ArrowLeft' });
    flush();
    assert.equal(selections.at(-1), 2);
    list.scrollLeft = list.scrollRequests.at(-1).left; list.fire('scrollend');
    assert.equal(output.textContent, '3 / 5');
  });
});

test('End reaches the final result and disables forward travel without wrapping or intercepting inputs', () => {
  fixture(({ matches, list, next, previous, output, selections, flush }) => {
    flush();
    const input = { closest: () => ({}) };
    assert.equal(matches.fire('keydown', { key: 'End', target: input }).prevented, undefined);
    assert.deepEqual(selections, []);
    assert.equal(matches.fire('keydown', { key: 'End' }).prevented, true);
    list.scrollLeft = list.scrollRequests.at(-1).left; list.fire('scrollend');
    assert.equal(output.textContent, '5 / 5'); assert.equal(next.disabled, true); assert.equal(previous.disabled, false);
    next.fire('click'); assert.equal(selections.at(-1), 4);
  });
});

test('disposing during a captured drag releases capture, animation and every event listener', () => {
  fixture(({ root, list, cards, view, frames, observers, doc, next }) => {
    list.fire('pointerdown', { pointerType: 'mouse', pointerId: 7, button: 0, clientX: 100, clientY: 30 });
    list.fire('pointermove', { pointerId: 7, clientX: 60, clientY: 30 });
    assert.equal(list.hasPointerCapture(7), true); assert.equal(list.classList.contains('is-dragging'), true);
    view.destroy();
    assert.equal(list.hasPointerCapture(7), false); assert.equal(list.classList.contains('is-dragging'), false);
    assert.equal(root.classList.contains('search-page--depth'), false); assert.equal(frames.size, 0);
    assert.equal(observers.every(observer => observer.disconnected), true);
    assert.equal(cards.every(card => !card.attributes.has('data-search-active') && card.style.transform === ''), true);
    for (const surface of [list, doc, next]) assert.equal([...surface.listeners.values()].every(set => set.size === 0), true);
  });
});

test('a scrollend paint cannot leave a queued callback alive after disposal', () => {
  fixture(({ list, view, frames, cards, flush }) => {
    flush();
    list.fire('scroll');
    assert.equal(frames.size, 1);
    list.fire('scrollend');
    view.destroy();
    assert.equal(frames.size, 0);
    flush();
    assert.equal(cards.some(card => card.attributes.has('data-search-active')), false);
  });
});

test('missing enhancement capability or tokens leaves the native list and its offset untouched', () => {
  for (const options of [{ resizeAvailable: false }, { validTokens: false }, { count: 0 }]) {
    fixture(({ root, list, view, frames }) => {
      assert.equal(view, null); assert.equal(root.classList.contains('search-page--depth'), false);
      assert.equal(list.scrollLeft, 900); assert.equal(frames.size, 0);
    }, options);
  }
});


test('authored article lists use the same finite controller without search selectors or query state', () => {
  fixture(({ root, list, cards, previous, next, output, view, flush }) => {
    flush();
    assert.equal(root.classList.contains('article-listing--depth'), true);
    assert.equal(root.classList.contains('search-page--depth'), false);
    next.fire('click'); next.fire('click');
    list.scrollLeft = list.scrollRequests.at(-1).left; list.fire('scrollend');
    assert.equal(output.textContent, '3 / 3'); assert.equal(next.disabled, true);
    assert.equal(cards[2].attributes.has('data-depth-active'), true);
    previous.fire('click');
    assert.equal(list.scrollRequests.at(-1).left, 240);
    view.destroy();
    assert.equal(root.classList.contains('article-listing--depth'), false);
    assert.equal(cards.some(card => card.attributes.has('data-depth-active')), false);
  }, { count: 3, articleListing: true });
});

test('one article stays a single centered item without unused carousel controls', () => {
  fixture(({ controls, output, cards, flush }) => {
    flush(); assert.equal(controls.hidden, true); assert.equal(output.textContent, '1 / 1');
    assert.equal(cards[0].attributes.has('data-depth-active'), true);
  }, { count: 1, articleListing: true });
});

for (const articleListing of [true, false]) test(`viewport stage stays edge-to-edge on resize: ${articleListing ? 'blog' : 'search'}`, () => {
  fixture(({root,list,doc,win,view,flush}) => {
    root.left = 160; doc.documentElement.clientWidth = 1440; win.fire('resize'); flush();
    assert.equal(list.style['--depth-field-width'], '1440px');
    assert.equal(list.style['--depth-field-offset'], '-160px');
    root.left = 24; doc.documentElement.clientWidth = 390; win.fire('resize'); flush();
    assert.equal(list.style['--depth-field-width'], '390px');
    assert.equal(list.style['--depth-field-offset'], '-24px');
    view.destroy();
    assert.equal(list.style['--depth-field-width'], undefined);
    assert.equal(list.style['--depth-field-offset'], undefined);
  }, {articleListing});
});

test('a later link press is not cancelled by an earlier drag', () => {
  fixture(({list,view,flush}) => {
    flush();
    list.fire('pointerdown', {pointerType:'mouse',button:0,pointerId:1,clientX:100,clientY:20});
    list.fire('pointermove', {pointerId:1,clientX:140,clientY:20});
    list.fire('pointerup', {pointerId:1});
    const link={closest:()=>({})};
    list.fire('pointerdown', {target:link,pointerType:'mouse',button:0,pointerId:2});
    assert.notEqual(list.fire('click',{target:link,detail:1}).prevented,true);
    view.destroy();
  });
});
test('pointer focus does not move a link before its click, while keyboard focus follows its card', () => {
  fixture(({list,cards,flush}) => {
    flush();
    const link=new Surface(); link.matches=()=>false; cards[2].children.push(link);
    const before=list.scrollRequests.length;
    list.fire('focusin',{target:link});
    assert.equal(list.scrollRequests.length,before);
    link.matches=()=>true;
    list.fire('focusin',{target:link});
    assert.equal(list.scrollRequests.at(-1).left,480);
  });
});
test('opening card details does not reset an in-flight horizontal scroll', () => {
  fixture(({list,observers,flush}) => {
    flush(); const before=list.scrollRequests.length;
    observers[0].callback(); flush();
    assert.equal(list.scrollRequests.length,before);
  });
});


test('depth distance follows scroll continuously and is removed on disposal', () => {
  fixture(({list,cards,view,flush}) => {
    flush();
    assert.equal(Number(cards[0].style['--depth-distance']), 0);
    assert.ok(Number(cards[2].style['--depth-distance']) > Number(cards[1].style['--depth-distance']));
    list.scrollLeft = 120; list.fire('scroll'); flush();
    assert.equal(Number(cards[0].style['--depth-distance']), Number(cards[1].style['--depth-distance']));
    view.destroy();
    assert.ok(cards.every(card => card.style['--depth-distance'] === undefined));
  });
});

for (const articleListing of [false, true]) test(`finite arrows retain usable focus in ${articleListing ? 'article listings' : 'search results'}`, () => {
  fixture(({ controls, matches, previous, next, doc, list, output }) => {
    const keys = articleListing ? controls : matches;
    next.focus(); next.fire('click');
    assert.equal(next.disabled, true);
    assert.equal(doc.activeElement, previous, 'focus reverses before the pending last destination disables Next');
    assert.deepEqual(previous.focusOptions, { preventScroll: true });
    keys.fire('keydown', { key: 'ArrowLeft', target: previous });
    assert.equal(output.textContent, '1 / 2');
    assert.equal(previous.disabled, true);
    assert.equal(doc.activeElement, next);
    for (const key of ['End', 'Home', 'ArrowRight', 'ArrowLeft']) {
      keys.fire('keydown', { key, target: doc.activeElement });
      assert.equal(doc.activeElement.disabled, false, `${key} keeps an enabled arrow focused`);
      list.scrollLeft = list.scrollRequests.at(-1).left; list.fire('scrollend');
      assert.equal(doc.activeElement.disabled, false, 'settling travel does not lose control focus');
    }
    const elsewhere = new Surface(); elsewhere.focus();
    next.fire('click');
    assert.equal(doc.activeElement, elsewhere, 'selection does not steal focus from outside the arrows');
  }, { count: 2, articleListing });
});
