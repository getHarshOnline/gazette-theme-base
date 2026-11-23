import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, previewContour } from '../scripts/preview-tabs.js';

function fixture({ count = 3, invalid = false, geometry = false, missingImage = false, brokenImage = false, nested = false, nestedImage = false } = {}) {
  const globals = new Map();
  const install = (name, value) => { globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { value, writable: true, configurable: true }); };
  class Node extends EventTarget {
    attrs = new Map(); classes = new Set(); children = [];
    props=new Map();
    style = { setProperty: (name, value) => {this.props.set(name,value);this.attrs.set('style', `${this.attrs.get('style') || ''}${name}:${value};`);},getPropertyValue:name=>this.props.get(name)||'',removeProperty:name=>this.props.delete(name) };
    classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name), contains: name => this.classes.has(name) };
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    removeAttribute(name) { this.attrs.delete(name); }
    get id() { return this.getAttribute('id') || ''; }
    set id(value) { this.setAttribute('id', value); }
    get inert() { return this.attrs.has('inert'); }
    set inert(value) { value ? this.setAttribute('inert', '') : this.removeAttribute('inert'); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    matches(selector) { return selector === ':focus-visible' && !!this.focusVisible; }
  }
  const set = new Node(), wrapper = new Node(), element = new Node(), win = new EventTarget();
  const radios = [], choices = [], panels = [], premises = [], views = [], images = [];
  for (let i = 0; i < count; i++) {
    const view = new Node(), choice = new Node(), radio = new Node(), panel = new Node(), premise = new Node();
    const image=new Node();image.complete=true;image.naturalWidth=brokenImage&&i===0?0:10;images.push(image);
    const borrowedImage = new Node(); borrowedImage.complete = true; borrowedImage.naturalWidth = 10;
    panel.querySelector=selector=>missingImage&&i===0?(nestedImage&&selector==='img'?borrowedImage:null):image;
    let checked = i === 0;
    Object.defineProperty(radio, 'checked', { get: () => checked, set: value => { if (value) radios.filter(other => other !== radio).forEach(other => other.checked = false); checked = value; } });
    radio.name = invalid && i === 1 ? 'other' : 'choices';
    radio.querySelector = () => null;
    choice.children = [radio, premise]; view.children = [choice, panel];
    choice.querySelector = selector => selector.endsWith('input[type="radio"]') ? radio : premise;
    view.querySelector = selector => selector.includes('choice') ? choice : panel;
    radios.push(radio); choices.push(choice); panels.push(panel); premises.push(premise); views.push(view);
  }
  const nestedView = new Node(), nestedChoice = new Node(), nestedRadio = new Node(), nestedPanel = new Node(), nestedPremise = new Node();
  nestedRadio.name = 'nested-choices'; nestedRadio.checked = true;
  nestedChoice.querySelector = selector => selector.endsWith('input[type="radio"]') ? nestedRadio : nestedPremise;
  nestedPanel.querySelector = () => images[0];
  nestedView.querySelector = selector => selector.includes('choice') ? nestedChoice : nestedPanel;
  nestedView.children = [nestedChoice, nestedPanel];
  set.children = views;
  if (nested) panels[0].children.push(nestedView);
  set.querySelectorAll = selector => nested && !selector.startsWith(':scope >') ? [...views,nestedView] : views;
  wrapper.querySelector = () => set; element.closest = () => wrapper;
  const rail=new Node(),backplate=new Node(),contour=new Node(),path=new Node();
  const origin={left:0,top:0,right:1000,bottom:600,width:1000,height:600};
  const premiseHeights=choices.map((_,i)=>i===1?140:20);
  const titles=choices.map(()=>({getBoundingClientRect:()=>({height:24})}));
  premises.forEach((p,i)=>p.querySelector=()=>({getBoundingClientRect:()=>({height:premiseHeights[i]})}));
  choices.forEach((c,i)=>c.querySelector=selector=>selector.endsWith('input[type="radio"]')?radios[i]:selector==='.view__title'?titles[i]:premises[i]);
  const choiceRects=choices.map((_,i)=>({left:0,right:250,top:60+i*100,bottom:120+i*100}));
  rail.getBoundingClientRect=()=>origin;
  choices.forEach((node,i)=>node.getBoundingClientRect=()=>choiceRects[i]);
  panels.forEach(node=>node.getBoundingClientRect=()=>({...origin,left:250,width:750}));
  contour.querySelector=()=>path;
  set.querySelector=selector=>!geometry?null:({':scope > .view-set__views':rail,'.view-set__views':rail,'.preview-backplate':backplate,'.preview-contour':contour})[selector]??null;
  rail.querySelector=selector=>({':scope > .preview-backplate':backplate,':scope > .preview-contour':contour})[selector]??null;
  let resized,disconnected=false;const observed=new Set();
  install('ResizeObserver',class{constructor(fn){resized=fn;}observe(node){observed.add(node);}disconnect(){disconnected=true;}});
  install('getComputedStyle',()=>({getPropertyValue:()=> '18px',paddingBlockStart:'16px',paddingBlockEnd:'16px',marginBlockStart:'0px',marginBlockEnd:'0px',borderBlockStartWidth:'0px',borderBlockEndWidth:'0px',rowGap:'0px'}));
  install('CSS',{supports:()=>true});
  const doc = { activeElement: new Node() }, pointer = { matches: true };
  const frames = new Map(); let nextFrame = 0;
  install('requestAnimationFrame', fn => { frames.set(++nextFrame, fn); return nextFrame; });
  install('cancelAnimationFrame', id => frames.delete(id));
  install('document', doc); install('window', win); install('matchMedia', () => pointer);
  const enter = (i, type = 'mouse') => { const event = new Event('pointermove'); Object.defineProperty(event, 'pointerType', { value: type }); choices[i].dispatchEvent(event); };
  return { element, set, radios, panels, premises, views, images, nestedView, nestedPanel, nestedRadio, doc, win, pointer, enter, backplate, path, premiseHeights, choiceRects, choices, observed, resize:()=>resized?.(), pending:()=>frames.size, disconnected:()=>disconnected, flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); },
    restore() { for (const [name, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]; } };
}

test('mouse, native change and focus expose exactly the selected entry without changing ancestry', () => {
  const f = fixture(); const dispose = mount(f);
  try {
    assert.equal(f.set.classList.contains('preview-set--ready'), true);
    assert.deepEqual(f.panels.map(p => p.inert), [false, true, true]);
    f.enter(1);
    assert.deepEqual(f.radios.map(r => r.checked), [false, true, false]);
    assert.deepEqual(f.panels.map(p => p.inert), [true, false, true]);
    f.radios[2].dispatchEvent(new Event('focus'));
    assert.deepEqual(f.panels.map(p => p.inert), [true, true, false]);
    f.radios[0].checked = true; f.radios[0].dispatchEvent(new Event('change'));
    assert.deepEqual(f.panels.map(p => p.inert), [false, true, true]);
    assert.equal(f.views[1].children[1], f.panels[1]);
    assert.equal(f.radios[1].getAttribute('aria-describedby'), f.premises[1].id);
  } finally { dispose(); f.restore(); }
});

test('pointer cannot displace keyboard focus, focused panel links or touch selection', () => {
  const f = fixture(); const dispose = mount(f);
  try {
    f.doc.activeElement = f.radios[0]; f.radios[0].focusVisible = true;
    f.enter(1); assert.equal(f.radios[0].checked, true);
    f.doc.activeElement = f.panels[0]; f.enter(1); assert.equal(f.radios[0].checked, true);
    f.doc.activeElement = { matches: () => false }; f.enter(1, 'touch'); assert.equal(f.radios[0].checked, true);
    f.pointer.matches = false; f.enter(1); assert.equal(f.radios[0].checked, true);
  } finally { dispose(); f.restore(); }
});

test('print temporarily exposes all entries and returns to the prior selection', () => {
  const f = fixture({ count: 6 }); const dispose = mount(f);
  try {
    f.enter(5); f.win.dispatchEvent(new Event('beforeprint'));
    assert.ok(f.panels.every(p => !p.inert && p.getAttribute('aria-hidden') === 'false'));
    assert.ok(f.premises.every(p => p.getAttribute('aria-hidden') === 'false'));
    f.enter(2); assert.equal(f.radios[5].checked, true);
    f.win.dispatchEvent(new Event('afterprint'));
    assert.deepEqual(f.panels.map(p => p.inert), [true, true, true, true, true, false]);
  } finally { dispose(); f.restore(); }
});

test('teardown restores attributes, removes listeners and permits a fresh mount', () => {
  const f = fixture();
  f.set.setAttribute('style', 'color:inherit'); f.premises[0].id = 'authored-premise';
  const dispose = mount(f);
  try {
    assert.equal(mount(f), undefined);
    f.enter(1); dispose();
    assert.equal(f.set.getAttribute('style'), 'color:inherit');
    assert.equal(f.set.classList.contains('preview-set--ready'), false);
    assert.equal(f.premises[0].id, 'authored-premise');
    assert.equal(f.premises[1].id, '');
    assert.ok(f.panels.every(p => !p.inert && p.getAttribute('aria-hidden') === null));
    assert.ok(f.radios.every(r => r.getAttribute('aria-describedby') === null));
    f.enter(2); assert.equal(f.radios[1].checked, true);
    const again = mount(f); assert.equal(typeof again, 'function'); again();
  } finally { f.restore(); }
});

test('invalid or singleton groups remain complete native entries without enhancement', () => {
  for (const options of [{ invalid: true }, { count: 1 }]) {
    const f = fixture(options);
    try { assert.equal(mount(f), undefined); assert.equal(f.set.classList.contains('preview-set--ready'), false); assert.ok(f.panels.every(p => !p.inert)); }
    finally { f.restore(); }
  }
});

test('native history restoration reconciles the restored radio after pageshow', () => {
  const f = fixture(); const dispose = mount(f);
  try {
    f.flush();
    f.win.dispatchEvent(new Event('pageshow'));
    // Native restoration may follow pageshow and does not dispatch change.
    f.radios[2].checked = true;
    f.flush();
    assert.deepEqual(f.panels.map(p => p.inert), [true, true, false]);
    assert.equal(f.premises[2].getAttribute('aria-hidden'), 'false');
    f.win.dispatchEvent(new Event('pageshow')); dispose(); f.flush();
    assert.ok(f.panels.every(p => p.getAttribute('aria-hidden') === null));
  } finally { f.restore(); }
});


test('one contour tracks preceding-row reflow, batches observations and stops after cleanup',()=>{
 const f=fixture({geometry:true,count:6});const dispose=mount(f);
 try{
  f.flush();assert.ok(f.set.classList.contains('preview-set--outlined'));
  assert.equal(f.observed.size,13,'rail and every choice/frame are observed');
  f.enter(3);f.flush();const original=f.path.getAttribute('d');
  assert.equal((original.match(/M/g)||[]).length,1,'wide selection has one silhouette');
  f.choiceRects[3]={...f.choiceRects[3],top:220,bottom:280};
  f.resize();f.resize();assert.equal(f.pending(),1,'row changes batch into one geometry read/write');
  f.flush();assert.notEqual(f.path.getAttribute('d'),original);assert.equal(f.pending(),0,'no permanent frame loop');
  assert.ok(f.backplate.style.clipPath.includes('path('));
  dispose();assert.equal(f.disconnected(),true);assert.equal(f.backplate.style.clipPath,'');
  f.resize();f.flush();assert.equal(f.set.classList.contains('preview-set--outlined'),false);assert.equal(f.pending(),0);
 }finally{dispose();f.restore();}
});

test('compact geometry preserves the real gap and invalid geometry declines enhancement',()=>{
 const choice={left:0,top:30,right:300,bottom:100},frame={left:0,top:140,right:300,bottom:440};
 const path=previewContour(choice,frame,18,18);
 assert.equal((path.match(/M/g)||[]).length,2);assert.equal((path.match(/Z/g)||[]).length,2);
 assert.equal(previewContour({...choice,right:NaN},frame,18,18),null);
 assert.equal(previewContour(choice,{...frame,right:0},18,18),null);
});


test('missing, initially broken and later failed pictures retain the complete native account',()=>{
 for(const mode of ['missing','broken','later']){
  const f=fixture({geometry:true,missingImage:mode==='missing',brokenImage:mode==='broken'});const dispose=mount(f);
  try{
   if(mode==='later'){f.flush();f.enter(2);f.images[1].dispatchEvent(new Event('error'));}
   assert.equal(f.set.classList.contains('preview-set--ready'),false,mode);
   assert.equal(f.set.classList.contains('preview-set--outlined'),false,mode);
   assert.ok(f.panels.every(p=>!p.inert&&p.getAttribute('aria-hidden')===null),mode);
   assert.ok(f.premises.every(p=>p.getAttribute('aria-hidden')===null),mode);
   f.resize();f.flush();assert.equal(f.pending(),0,mode);
   if(mode!=='missing')assert.equal(f.disconnected(),true,mode);
  }finally{dispose?.();f.restore();}
 }
});


test('one capacity includes the longest unselected premise and survives selection until real wrapping changes',()=>{
 const f=fixture({geometry:true,count:6});const dispose=mount(f);
 try{
  f.flush();assert.equal(f.set.props.get('--preview-content-min'),'494px');
  f.enter(5);f.flush();assert.equal(f.set.props.get('--preview-content-min'),'494px');
  f.premiseHeights[2]=200;f.resize();f.flush();assert.equal(f.set.props.get('--preview-content-min'),'554px');
  assert.equal(f.pending(),0);
 }finally{dispose();f.restore();}
});


test('nested view groups retain independent ownership during enhancement, selection and print', () => {
  const f = fixture({ nested: true, geometry: true }); const dispose = mount(f);
  try {
    assert.equal(typeof dispose, 'function', 'only direct owned views form the enhancement group');
    assert.equal(f.set.classList.contains('preview-set--ready'), true);
    assert.equal(f.nestedRadio.checked, true);
    assert.equal(f.nestedPanel.getAttribute('aria-hidden'), null);
    f.enter(1);
    assert.deepEqual(f.radios.map(r => r.checked), [false, true, false]);
    assert.equal(f.nestedRadio.checked, true);
    f.win.dispatchEvent(new Event('beforeprint'));
    assert.ok(f.panels.every(p => !p.inert));
    assert.equal(f.nestedPanel.getAttribute('aria-hidden'), null);
  } finally { dispose?.(); f.restore(); }
});

test('a nested picture cannot supply a missing owned preview image', () => {
  const f = fixture({ missingImage: true, nestedImage: true });
  try {
    assert.equal(mount(f), undefined);
    assert.equal(f.set.classList.contains('preview-set--ready'), false);
    assert.ok(f.panels.every(p => !p.inert));
  } finally { f.restore(); }
});
