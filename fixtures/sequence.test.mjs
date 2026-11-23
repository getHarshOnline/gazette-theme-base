import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { clamp } from '../scripts/clamp.js';
import { motionPreference } from '../scripts/motion-preference.js';

const source = readFileSync(new URL('../scripts/sequence.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export function createSequence', 'function createSequence');
function fixture(bounds, ready = true, hash = '', chrome = 0, { nativeScroll = false } = {}) {
  const listeners = {}, sections = [];
  let sectionBounds = bounds.map(value => ({ ...value }));
  let moved, drawn, canPresent = true, throwOnDraw = false;
  const visible = new Set();
  const activity = [], moves = [];
  let wrapperBounds = { top: 0, bottom: 1600 };
  const wrapper = { dataset: {}, style: { setProperty() {} },
    getBoundingClientRect: () => wrapperBounds, addEventListener() {} };
  for (let i = 0; i < 4; i++) sections.push({
    contains: () => false, getBoundingClientRect: () => sectionBounds[i], classList: { toggle(name, on) { if (on) visible.add(i); else visible.delete(i); } },
    scrollIntoView() { moved = i; }, focus() {},
  });
  const document = { documentElement: { dataset: { motion: 'reduce' } }, activeElement: null,
    hidden: false, querySelector: () => chrome ? { getBoundingClientRect: () => ({height:chrome}) } : null, getElementById: id => /^section-[0-3]$/.test(id) ? sections[Number(id.slice(-1))] : null,
    addEventListener(type, handler) { listeners[type] = handler; } };
  const context = vm.createContext({ clamp, motionPreference, document, window: { scrollX: 0, scrollTo({ top }) {
    moved = top; moves.push(top);
    if (nativeScroll) {
      // An instant native scroll updates both scrollY and viewport-relative
      // geometry before the next frame reconciles the fragment's reading hold.
      const delta = top - context.scrollY;
      context.scrollY = top;
      wrapperBounds = { top: wrapperBounds.top - delta, bottom: wrapperBounds.bottom - delta };
      sectionBounds = sectionBounds.map(value => ({ top: value.top - delta, bottom: value.bottom - delta }));
    }
  } },
    getComputedStyle: () => ({position:'sticky'}),
    matchMedia: () => ({ matches: false, addEventListener() {} }), innerHeight: 900, scrollY: 0,
    requestAnimationFrame: fn => fn(), addEventListener(type, handler) { listeners[type] = handler; }, location: { hash } });
  document.defaultView = context.window; context.window.matchMedia = context.matchMedia;
  vm.runInContext(source, context);
  const sequence = context.createSequence({ wrapper, sections, rests: [0, .35, .67, .95],
    holds: [[0,.1],[.3,.4],[.6,.7],[.9,1]], distance: 1000, draw: value => { drawn = value; if (throwOnDraw) throw new Error('drawing failed'); return canPresent; }, size() {}, activity: value => activity.push(value) });
  if (ready) sequence.ready();
  return { sequence, wrapper, activity, visible, moves,
    print() { listeners.beforeprint(); },
    finishPrint() { listeners.afterprint(); },
    position(value) { context.scrollY = value; },
    failNextDraw() { throwOnDraw = true; },
    present(value) { canPresent = value; sequence.schedule(); },
    hidden(value) { document.hidden = value; listeners.visibilitychange(); },
    bounds(value) { wrapperBounds = value; listeners.scroll(); },
    resize(value) { wrapperBounds = value; listeners.resize(); },
    show(persisted = false) { listeners.pageshow({persisted}); },
    get scrollY() { return context.scrollY; },
    get moved() { return moved; }, get drawn() { return drawn; },
    motion(value) { document.documentElement.dataset.motion = value; listeners['motion-preference'](); } };
}

test('Reduced to Full follows the visible section rather than a stale enhanced index', () => {
  const f = fixture([{top:-900,bottom:-600},{top:-600,bottom:-300},{top:0,bottom:650},{top:650,bottom:1300}]);
  f.motion('allow');
  assert.equal(f.moved, 670);
  assert.equal(f.drawn, .67);
});

test('a sliver of the preceding section does not displace the final static rest', () => {
  const f = fixture([{top:-1980,bottom:-1285},{top:-1285,bottom:-591},
    {top:-591,bottom:104},{top:104,bottom:798}]);
  f.motion('allow');
  assert.equal(f.moved, 950);
  assert.equal(f.drawn, .95);
});

test('a late graphics failure restores the corresponding complete static section', () => {
  const f = fixture([{top:-900,bottom:-600},{top:-600,bottom:-300},{top:0,bottom:650},{top:650,bottom:1300}]);
  f.motion('allow');
  f.sequence.unavailable();
  assert.equal(f.wrapper.dataset.islandState, 'still');
  assert.equal(f.moved, 0);
  f.motion('reduce'); f.motion('allow');
  assert.equal(f.wrapper.dataset.islandState, 'still');
});


test('acquisition starts before readiness and suspends with visibility and preference', () => {
  const f = fixture(Array.from({length:4}, () => ({top:0,bottom:900})), false);
  f.sequence.schedule();
  assert.deepEqual(f.activity, []);
  f.motion('allow');
  assert.deepEqual(f.activity, [true]);
  assert.equal(f.drawn, undefined);
  f.hidden(true); f.hidden(false);
  f.bounds({top:1000,bottom:2600});
  f.bounds({top:0,bottom:1600});
  f.motion('reduce');
  assert.deepEqual(f.activity, [true,false,true,false,true,false]);
  f.motion('allow'); f.sequence.unavailable(); f.sequence.schedule();
  assert.deepEqual(f.activity.slice(-2), [true,false]);
});


test('a reading hold waits for its matching asynchronous view', () => {
  const f = fixture(Array.from({length:4}, () => ({top:0,bottom:900})));
  f.motion('allow');
  assert.deepEqual([...f.visible], [0]);
  f.present(false);
  assert.deepEqual([...f.visible], []);
  f.present(true);
  assert.deepEqual([...f.visible], [0]);
});


test('a failure while entering another hold restores that target section', () => {
  const f = fixture([{top:0,bottom:400},{top:400,bottom:800},{top:800,bottom:1200},{top:1200,bottom:1600}]);
  f.motion('allow');
  f.failNextDraw();
  f.bounds({top:-950,bottom:650});
  assert.equal(f.wrapper.dataset.islandState, 'still');
  assert.equal(f.moved, 1200, 'restore the fourth fallback section, not the first');
});

test('printing suspends the passage without navigating and cancellation restores the screen position', () => {
  const f = fixture(Array.from({length:4}, () => ({top:0,bottom:900})));
  f.motion('allow');
  f.position(950); f.bounds({top:-950,bottom:650});
  const moves = f.moves.length;
  f.print();
  assert.equal(f.wrapper.dataset.islandState, 'still');
  assert.equal(f.moves.length, moves, 'opening print must not navigate');
  assert.equal(f.activity.at(-1), false, 'resource acquisition stops');
  f.position(0); f.print(); // duplicate event must not replace the screen snapshot
  f.sequence.schedule();
  f.finishPrint();
  assert.equal(f.wrapper.dataset.islandState, 'drawn');
  assert.equal(f.moved, 950);
  assert.equal(f.activity.at(-1), true);
  const restored = f.moves.length;
  f.finishPrint();
  assert.equal(f.moves.length, restored, 'a repeated close has no effect');
});

test('print return preserves an ending below the passage instead of choosing a visible beat', () => {
  const f = fixture(Array.from({length:4}, () => ({top:0,bottom:900})));
  f.motion('allow'); f.position(2200); f.bounds({top:-2200,bottom:-600});
  f.print(); f.position(900); f.finishPrint();
  assert.equal(f.moved, 2200);
  assert.equal(f.activity.at(-1), false);
});

test('printing never enables reduced or failed scenes and honours a changed preference', () => {
  const bounds = Array.from({length:4}, () => ({top:0,bottom:900}));
  const reduced = fixture(bounds);
  reduced.print(); reduced.finishPrint();
  assert.equal(reduced.wrapper.dataset.islandState, undefined);
  assert.equal(reduced.drawn, undefined);
  const failed = fixture(bounds);
  failed.motion('allow'); failed.sequence.unavailable();
  failed.print(); failed.finishPrint();
  assert.equal(failed.wrapper.dataset.islandState, 'still');
  const changed = fixture(bounds);
  changed.motion('allow'); changed.print(); changed.motion('reduce'); changed.finishPrint();
  assert.equal(changed.wrapper.dataset.islandState, 'still');
});

test('a layout shift preserves an occupied reading hold but does not snap travel', () => {
  const f = fixture(Array.from({length:4}, () => ({top:0,bottom:900})));
  f.motion('allow');
  f.bounds({top:-950,bottom:650});
  f.resize({top:-800,bottom:800});
  assert.equal(f.moved,150,'the shifted origin is included in the same authored rest');
  f.bounds({top:-500,bottom:1100});
  f.resize({top:-450,bottom:1150});
  assert.equal(f.moved,150,'a resize during travel must not invent a reading stop');
});

test('a fresh page reconciles its fragment after native restoration, but bfcache keeps its position', () => {
  const f = fixture(Array.from({length:4}, () => ({top:0,bottom:900})), true, '#section-2', 0, { nativeScroll: true });
  f.motion('allow');
  assert.equal(f.moved,0);
  f.show();
  assert.equal(f.moved,670);
  assert.equal(f.scrollY,670);
  assert.equal(f.wrapper.getBoundingClientRect().top,-670);
  assert.deepEqual([...f.visible],[2]);
  f.motion('reduce');f.motion('allow');
  assert.equal(f.moved,0);
  f.show(true);
  assert.equal(f.moved,0);
});

test('Full to Reduced keeps the heading below the sticky header', () => {
  const f = fixture([{top:-900,bottom:-600},{top:-600,bottom:-300},{top:128,bottom:778},{top:778,bottom:1428}], true, '', 128);
  f.motion('allow');
  f.motion('reduce');
  assert.equal(f.wrapper.dataset.islandState, 'still');
  assert.equal(f.moved, 0, 'align the selected section to the header bottom, not the viewport edge');
});

test('initial Reduced fragment measures sticky chrome before restoring its section', () => {
  const f = fixture([{top:-900,bottom:-600},{top:-600,bottom:-300},{top:128,bottom:778},{top:778,bottom:1428}], true, '#section-2', 128);
  assert.equal(f.moved, 0);
});


test('readiness and header resize do not scroll away a still-visible entrance header', () => {
  const f = fixture(Array.from({length:4}, () => ({top:62,bottom:906})), false);
  f.bounds({top:62,bottom:4106});
  f.motion('allow'); f.sequence.ready();
  assert.equal(f.moves.length, 0, 'initial enhancement preserves the reader position');
  f.resize({top:62,bottom:4106});
  assert.equal(f.moves.length, 0, 'a header observer must not consume the header');
  assert.deepEqual([...f.visible], [0]);
});
