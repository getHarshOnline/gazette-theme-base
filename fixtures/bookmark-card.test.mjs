import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bookmarkGeometry, mount } from '../scripts/bookmark-card.js';
import { stepEdge } from '../scripts/card-shape.js';

const tokens = { tab: .26, tail: .685, top: .12, bottom: 28/300, radius: .088 };
const commands = path => [...path.matchAll(/([MAHVZ])([^MAHVZ]*)/g)].map(([,kind,values]) => ({kind,values:values.trim().split(/\s+/).filter(Boolean).map(Number)}));
const pathFromMask = mask => decodeURIComponent(mask).match(/<path d="([^"]+)"/)[1];

test('bookmark retains its upper-left cutout and curved lower-right bite', () => {
  for (const [width,height] of [[260,240],[400,350],[800,260],[320,900]]) {
    const path = bookmarkGeometry(width,height,tokens);
    assert.ok(path.startsWith('M0 ')); assert.ok(path.endsWith('Z'));
    assert.ok(!/NaN|Infinity/.test(path));
    const rise = Math.min(width*tokens.top,height/4), bite = Math.min(width*tokens.bottom,height/4);
    assert.equal(commands(path)[1].values.at(-1),rise,'the left corner remains below the raised right area');
    assert.ok(path.includes(stepEdge(width*tokens.tab,rise,0)));
    assert.ok(path.includes(stepEdge(width*tokens.tail,height-bite,height,{rtl:true})));
  }
});

test('invalid or unmeasured geometry leaves the unmasked fallback intact', () => {
  for (const pair of [[0,200],[300,0],[NaN,200],[300,Infinity]]) assert.equal(bookmarkGeometry(...pair,tokens),null);
  for (const values of [{...tokens,tab:1},{...tokens,tail:0},{...tokens,top:-1}]) assert.equal(bookmarkGeometry(300,200,values),null);
});

test('native empty island slot enhances its semantic fallback siblings, tracks text height and disposes cleanly', async () => {
  const saved = { observer:globalThis.ResizeObserver, style:globalThis.getComputedStyle };
  let callback, disconnected = false;
  let titleHeight = 28;
  const surface = { style:{} }, copy = { textContent:'Complete authored benefit and native action' };
  const title = {tagName:'DT',textContent:'A useful title that can wrap',dataset:{},getBoundingClientRect:()=>({height:titleHeight})};
  const properties = new Map();
  const card = {clientWidth:300,clientHeight:260,dataset:{},style:{getPropertyValue:key=>properties.get(key)||'',setProperty:(key,value)=>properties.set(key,value)},querySelector:selector=>selector==='.bookmark-card__surface'?surface:selector===':scope > :is(h1,h2,h3,h4,h5,h6,dt)'?title:null};
  const document = {fonts:{ready:Promise.resolve()}};
  const owner = {ownerDocument:document,querySelectorAll:selector=>selector==='[data-bookmark-card]'?[card]:[]};
  // This is Gazette's real mount anatomy: the empty mount slot and semantic
  // fallback card are siblings inside one data-gazette-component owner.
  const element = {ownerDocument:document,querySelectorAll:()=>[],closest:selector=>selector==='[data-gazette-component]'?owner:null};
  globalThis.ResizeObserver = class {constructor(fn){callback=fn;}observe(){}disconnect(){disconnected=true;}};
  const values = Object.fromEntries(Object.entries(tokens).map(([key,value])=>[`--layout-bookmark-${{top:'top-notch',bottom:'bottom-notch'}[key]||key}`,String(value)]));
  globalThis.getComputedStyle=element=>element===title?{marginBlockEnd:'24px'}:{paddingInlineStart:'24px',paddingInlineEnd:'24px',paddingBlockStart:'24px',getPropertyValue:key=>values[key]||''};
  try {
    const dispose = mount({element}); assert.equal(typeof dispose,'function');
    const first = surface.style.maskImage;
    assert.equal(pathFromMask(first),bookmarkGeometry(300,260,tokens));
    titleHeight=84; callback([{target:card}]);
    assert.equal(surface.style.maskImage,first,'title wrapping does not reshape the card');
    titleHeight=84; card.clientHeight=520; callback([{target:card}]);
    assert.notEqual(surface.style.maskImage,first);
    assert.equal(pathFromMask(surface.style.maskImage),bookmarkGeometry(300,520,tokens));
    assert.equal(title.tagName,'DT'); assert.equal(title.textContent,'A useful title that can wrap');
    assert.equal(title.dataset.bookmarkTitle,'true');
    assert.equal(copy.textContent,'Complete authored benefit and native action');
    assert.equal(card.dataset.bookmarkReady,'true');
    dispose(); assert.equal(disconnected,true);
    const final = surface.style.maskImage;
    card.clientHeight=600; callback([{target:card}]); await Promise.resolve();
    assert.equal(surface.style.maskImage,final);
  } finally {globalThis.ResizeObserver=saved.observer;globalThis.getComputedStyle=saved.style;}
});

test('the same decorative partial serves About and valid definition-list Service content', () => {
  const read = path => readFileSync(new URL(path,import.meta.url),'utf8');
  const about = read('../templates/components/about-choice.html');
  const service = read('../templates/components/service-example.html');
  const material = read('../templates/partials/bookmark-material.html');
  assert.ok(about.includes('data-bookmark-card')); assert.ok(service.includes('data-bookmark-card'));
  for (const content of [about,service]) assert.ok(content.includes('base/partials/bookmark-material.html'));
  assert.match(service, /<dl[\s\S]+<div[^>]+data-bookmark-card><dt>[\s\S]+<\/dt><dd>[\s\S]+<\/dd><\/div>/);
  assert.ok(material.includes('aria-hidden="true"'));
  assert.ok(!/tabindex|role="button"/.test(about+service), 'informational benefits do not acquire fake interactive semantics');
});
