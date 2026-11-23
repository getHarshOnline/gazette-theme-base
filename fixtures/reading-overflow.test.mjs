import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../scripts/reading-overflow.js', import.meta.url), 'utf8')
  .replace('export function', 'function');

function fixture({ width = 300, content = 650, authored = null, kind = 'table', label = '', describedBy = '', comparison = false } = {}) {
  const attrs = new Map(authored === null ? [] : [['tabindex', authored]]);
  if (describedBy) attrs.set('aria-describedby', describedBy);
  const hints = [];
  const body = {};
  const table = {
    tagName: 'TABLE' === kind.toUpperCase() ? 'TABLE' : kind.toUpperCase(),
    clientWidth: width, scrollWidth: content,
    hasAttribute: name => attrs.has(name),
    getAttribute: name => attrs.get(name) ?? null,
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: name => attrs.delete(name),
    querySelectorAll: () => [body],
    after: element => hints.push(element)
  };
  const boundary = { clientWidth: width, scrollWidth: content, hasAttribute: name => name === 'data-gazette-table' || attrs.has(name), getAttribute: name => attrs.get(name) ?? null, setAttribute: (name,value) => attrs.set(name,value), removeAttribute: name => attrs.delete(name), before: element => { element.placement = 'before'; hints.push(element); }, after: element => hints.push(element) };
  if (kind === 'table') table.parentElement = boundary;
  const comparisonRoot = { children: [table], matches: selector => selector === '.reading-comparison', after: element => hints.push(element) };
  if (comparison) {
    boundary.parentElement = comparisonRoot;
    comparisonRoot.children = [boundary];
  }
  let resize;
  const observed = [];
  const context = vm.createContext({
    document: {
      getElementById: id => id === 'reading-overflow-label' ? { textContent: label } : hints.find(hint => hint.id === id),
      createElement: tag => { assert.equal(tag, 'p'); return {}; },
      querySelectorAll: selector => {
      assert.match(selector, /\.publication-body/); assert.match(selector, /\.reading-notes__body/);
      assert.ok(selector.includes(kind === 'math' ? 'p:has(> math[display="block"])' : kind));
      return [table];
    } },
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe(element) { observed.push(element); }
    }
  });
  vm.runInContext(source, context);
  context.mountReadingOverflow();
  return { table: kind === 'table' ? boundary : table, nativeTable: table, attrs, observed, body, hints, comparisonRoot, resize: () => resize?.() };
}

test('overflow becomes keyboard reachable, without replacing the table', () => {
  const f = fixture();
  assert.equal(f.attrs.get('tabindex'), '0');
  assert.deepEqual(f.observed, [f.table, f.nativeTable, f.body]);
});

test('a fitting or hidden table adds no tab stop; reopening recalculates', () => {
  const f = fixture({ width: 0 });
  assert.equal(f.attrs.has('tabindex'), false);
  f.table.clientWidth = 300; f.resize();
  assert.equal(f.attrs.get('tabindex'), '0');
  f.table.clientWidth = 650; f.resize();
  assert.equal(f.attrs.has('tabindex'), false);
  f.table.scrollWidth = 900; f.resize();
  assert.equal(f.attrs.get('tabindex'), '0');
});

test('author-supplied focus decisions are retained, including exclusion', () => {
  for (const authored of ['-1', '0']) {
    const f = fixture({ authored });
    assert.equal(f.attrs.get('tabindex'), authored);
    assert.equal(f.observed.length, 0);
    f.table.clientWidth = 900; f.resize();
    assert.equal(f.attrs.get('tabindex'), authored);
  }
});

test('the supplied hint describes only real overflow and preserves authored descriptions', () => {
  const label = 'More columns remain available by horizontal scrolling.';
  const f = fixture({ label, describedBy: 'table-context' });
  assert.equal(f.hints.length, 1);
  assert.equal(f.hints[0].textContent, label);
  assert.equal(f.hints[0].placement, 'before', 'the scrolling cue precedes a long table');
  assert.equal(f.hints[0].hidden, false);
  assert.equal(f.attrs.get('aria-describedby'), `table-context ${f.hints[0].id}`);
  f.table.clientWidth = 650; f.resize();
  assert.equal(f.hints[0].hidden, true);
  assert.equal(f.attrs.get('aria-describedby'), 'table-context');
  f.table.clientWidth = 300; f.resize();
  assert.equal(f.hints[0].hidden, false);
  assert.equal(f.hints.length, 1, 'resizing does not duplicate the hint');
});

test('no supplied label means no invented interface wording', () => {
  const f = fixture();
  assert.equal(f.hints.length, 0);
  assert.equal(f.attrs.has('aria-describedby'), false);
});

for (const kind of ['pre', 'math']) test(`${kind} overflow enters the same keyboard path and leaves when fitting`, () => {
  const f = fixture({kind});
  assert.equal(f.attrs.get('tabindex'), '0');
  assert.deepEqual(f.observed, [f.table, f.body]);
  f.table.clientWidth = 650; f.resize();
  assert.equal(f.attrs.has('tabindex'), false);
  f.table.clientWidth = 0; f.resize();
  assert.equal(f.attrs.has('tabindex'), false);
  f.table.clientWidth = 300; f.resize();
  assert.equal(f.attrs.get('tabindex'), '0');
});


test('an overflow hint does not alter the owned comparison table before enhancement', () => {
  const f = fixture({ comparison: true, label: 'Scroll to see more columns.' });
  assert.deepEqual(f.comparisonRoot.children, [f.table]);
  assert.equal(f.hints.length, 1);
  assert.equal(f.attrs.get('aria-describedby'), f.hints[0].id);
  f.table.clientWidth = 650; f.resize();
  assert.deepEqual(f.comparisonRoot.children, [f.table]);
  assert.equal(f.hints[0].hidden, true);
});

// Model parent ownership separately: the scroll boundary and native table must
// never share attributes or replace the cells to gain full-width scrolling.
test('legacy tables gain exactly one boundary and retain native content and authored focus', () => {
  class Element {
    constructor(tag) { this.tagName=tag.toUpperCase();this.attrs=new Map();this.children=[];this.clientWidth=300;this.scrollWidth=650; }
    hasAttribute(name){return this.attrs.has(name);}
    getAttribute(name){return this.attrs.get(name)??null;}
    setAttribute(name,value){this.attrs.set(name,value);}
    removeAttribute(name){this.attrs.delete(name);}
    append(child){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(x=>x!==child);this.children.push(child);child.parentElement=this;}
    before(sibling){const parent=this.parentElement;parent.children.splice(parent.children.indexOf(this),0,sibling);sibling.parentElement=parent;}
    after(sibling){const parent=this.parentElement;parent.children.splice(parent.children.indexOf(this)+1,0,sibling);sibling.parentElement=parent;}
    querySelectorAll(){return this.children;}
  }
  const parent=new Element('section'),table=new Element('table'),caption=new Element('caption'),head=new Element('thead'),body=new Element('tbody');
  table.append(caption);table.append(head);table.append(body);parent.append(table);
  const observed=[];
  const context=vm.createContext({document:{getElementById:()=>null,querySelectorAll:()=>[table],createElement:tag=>new Element(tag)},ResizeObserver:class{constructor(fn){this.fn=fn;}observe(node){observed.push(node);}}});
  vm.runInContext(source,context);context.mountReadingOverflow();context.mountReadingOverflow();
  assert.equal(parent.children.length,1);
  const boundary=parent.children[0];assert.equal(boundary.tagName,'DIV');assert.ok(boundary.hasAttribute('data-gazette-table'));
  assert.deepEqual(boundary.children,[table]);assert.deepEqual(table.children,[caption,head,body]);
  assert.equal(boundary.getAttribute('tabindex'),'0');assert.equal(table.getAttribute('tabindex'),null);
  assert.deepEqual(observed,[boundary,table,caption,head,body]);
});
