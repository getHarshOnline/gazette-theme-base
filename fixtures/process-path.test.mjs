import test from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '../scripts/process-path.js';

function fixture({ count = 3, media = false, autoplay = false, reduced = false, collapsible = false, intersection = true } = {}) {
  const saved = new Map(), timers = new Map(), observers = [];
  let serial = 0;
  const install = (key, value) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis,key)); Object.defineProperty(globalThis,key,{value,configurable:true,writable:true}); };
  class Node extends EventTarget {
    constructor(tag = 'div', text = '') { super(); this.tagName=tag.toUpperCase();this.nodeType=tag==='#text'?3:tag==='#comment'?8:1;this._text=text;this.childNodes=[];this.dataset={};this.attrs=new Map();this.ownerDocument=doc;this.hidden=false;this.props=new Map(); const classes=new Set();this.classList={add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),contains:n=>classes.has(n),toggle:(n,on)=>on?classes.add(n):classes.delete(n)}; }
    set className(value){this.classList.add(...value.split(' '));}
    get children(){return this.childNodes.filter(node=>node.nodeType===1);}
    get textContent(){return this._text+this.childNodes.map(n=>n.textContent).join('');}
    set textContent(value){this.childNodes=[];this._text=value;}
    append(...nodes){for(const n of nodes){n.remove();n.parentNode=this;this.childNodes.push(n);}}
    before(node){const at=this.parentNode.childNodes.indexOf(this);node.remove();node.parentNode=this.parentNode;this.parentNode.childNodes.splice(at,0,node);}
    replaceChildren(...nodes){this.childNodes.forEach(n=>n.parentNode=null);this.childNodes=[];this._text='';this.append(...nodes);}
    remove(){if(this.parentNode){this.parentNode.childNodes=this.parentNode.childNodes.filter(n=>n!==this);this.parentNode=null;}}
    setAttribute(k,v){this.attrs.set(k,String(v));}
    getAttribute(k){return this.attrs.get(k);}
    removeAttribute(k){this.attrs.delete(k);}
    toggleAttribute(k,v){v?this.attrs.set(k,''):this.attrs.delete(k);}
    matches(selector){return selector.split(',').some(s=>s.startsWith('.')?this.classList.contains(s.slice(1)):s.toUpperCase()===this.tagName);}
    querySelector(selector){for(const n of this.children){if(n.matches(selector))return n;const found=n.querySelector(selector);if(found)return found;}return null;}
    contains(node){return node===this||this.childNodes.some(n=>n.contains(node));}
    getBoundingClientRect(){return {width:900,height:this.tagName==='H3'?44:180,left:0,top:0};}
    focus(){doc.activeElement=this;}
    get scrollHeight(){return 150;}
    style={setProperty:(k,v)=>this.props.set(k,v),removeProperty:k=>this.props.delete(k)};
  }
  let doc;
  doc=new EventTarget();doc.documentElement={dataset:{}};doc.hidden=false;doc.createElement=tag=>new Node(tag);doc.createComment=text=>new Node('#comment',text);doc.getElementById=()=>null;
  const preference=new EventTarget();preference.matches=reduced;
  const win=new EventTarget();win.location={hash:''};win.matchMedia=()=>preference;win.setTimeout=fn=>{timers.set(++serial,fn);return serial;};win.clearTimeout=id=>timers.delete(id);
  win.ResizeObserver=class {constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
  if(intersection)win.IntersectionObserver=class {constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
  doc.defaultView=win;
  const root=new Node();root.classList.add('process-path');root.dataset.processAutoplay=String(autoplay);root.dataset.processCollapsible=String(collapsible);
  const layout=new Node();layout.classList.add('process-path__layout');const list=new Node('ol');list.classList.add('process-path__steps');root.append(layout);layout.append(list);
  const copies=[],heads=[],paragraphs=[],figures=[];
  for(let i=0;i<count;i++){
    const stage=new Node('li'),copy=new Node(),heading=new Node('h3'),em=new Node('em','stage '+i),paragraph=new Node('p','complete text '+i);
    copy.classList.add('process-path__copy');heading.append(em);copy.append(heading,paragraph);stage.append(copy);list.append(stage);copies.push(copy);heads.push(heading);paragraphs.push(paragraph);
    if(media){const figure=new Node('figure'),image=new Node('img');figure.append(image);copy.append(figure);figures.push(figure);}
  }
  const control=new Node('button','Pause sequence');control.classList.add('process-path__pause');control.dataset.resume='Resume sequence';root.append(control);
  let stacked=false;
  install('document',doc);install('window',win);install('getComputedStyle',()=>({getPropertyValue:key=>key==='--delay-process-step'?'6s':key==='--process-stacked'?(stacked?'1':'0'):'',rowGap:'12px'}));
  return {root,list,heads,copies,paragraphs,figures,control,timers,observers,doc,win,preference,setStacked(value){stacked=value;observers[0].fn();},restore(){for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}};
}
const key = (node,value)=>{const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value});node.dispatchEvent(event);return event;};

test('one native heading button controls each complete panel; keyboard navigation preserves heading content',()=>{
  const f=fixture(),dispose=mount({element:f.root});
  try{
    const buttons=f.heads.map(h=>h.querySelector('button'));
    assert.equal(buttons[0].getAttribute('aria-expanded'),'true');assert.equal(buttons[1].getAttribute('aria-expanded'),'false');
    assert.equal(f.copies[0].querySelector('.process-path__panel').inert,false);
    buttons[1].dispatchEvent(new Event('click'));
    assert.equal(buttons[0].getAttribute('aria-expanded'),'false');assert.equal(buttons[1].getAttribute('aria-expanded'),'true');
    assert.equal(f.copies[0].querySelector('.process-path__panel').inert,true);
    assert.equal(buttons[1].querySelector('em').textContent,'stage 1');
    assert.ok(key(buttons[1],'ArrowDown').defaultPrevented);assert.equal(f.doc.activeElement,buttons[2]);
    key(buttons[2],'Home');assert.equal(f.doc.activeElement,buttons[0]);
    buttons[1].dispatchEvent(new Event('click'));assert.equal(buttons[1].getAttribute('aria-expanded'),'true','one stays open by default');
    assert.equal(f.timers.size,0,'reader-controlled by default');
  }finally{dispose();f.restore();}
});

test('collapse is explicit, and teardown restores original content nodes and all observations',()=>{
  const f=fixture({collapsible:true}),original=f.copies.map(c=>[...c.childNodes]),dispose=mount({element:f.root});
  try{
    f.heads[0].querySelector('button').dispatchEvent(new Event('click'));
    assert.ok(f.copies.every(c=>c.querySelector('.process-path__panel').inert));
    dispose();
    f.copies.forEach((copy,i)=>assert.deepEqual(copy.childNodes,original[i]));
    assert.equal(f.control.hidden,true);assert.ok(f.observers.every(observer=>observer.disconnected));assert.equal(f.timers.size,0);
  }finally{dispose();f.restore();}
});

test('supplied figures move once between responsive placements and return on disposal',()=>{
  const f=fixture({media:true}),dispose=mount({element:f.root});
  try{
    const frame=f.root.querySelector('.process-path__frame');assert.equal(frame.children.length,3);
    assert.equal(f.figures[0].getAttribute('aria-hidden'),'false');assert.equal(f.figures[1].getAttribute('aria-hidden'),'true');
    f.setStacked(true);assert.equal(frame.children.length,0);assert.ok(f.copies.every(c=>c.contains(f.figures[f.copies.indexOf(c)])));
    f.setStacked(false);assert.equal(frame.children.length,3);
    dispose();assert.ok(f.copies.every((c,i)=>c.contains(f.figures[i])));assert.equal(f.root.querySelector('.process-path__media'),null);
  }finally{dispose();f.restore();}
});

test('explicit autoplay holds for attention, visibility, page lifecycle and reduced motion',()=>{
  const f=fixture({autoplay:true}),dispose=mount({element:f.root});
  try{
    assert.equal(f.timers.size,1);f.root.dispatchEvent(new Event('pointerenter'));assert.equal(f.timers.size,0);
    f.root.dispatchEvent(new Event('pointerleave'));assert.equal(f.timers.size,1);
    f.control.dispatchEvent(new Event('click'));assert.equal(f.timers.size,0);assert.equal(f.control.textContent,'Resume sequence');
    f.control.dispatchEvent(new Event('click'));assert.equal(f.timers.size,1);
    f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(f.timers.size,0);
    f.doc.hidden=false;f.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(f.timers.size,1);
    f.win.dispatchEvent(new Event('pagehide'));assert.equal(f.timers.size,0);f.win.dispatchEvent(new Event('pageshow'));assert.equal(f.timers.size,1);
    f.doc.documentElement.dataset.motion='reduce';f.doc.dispatchEvent(new Event('motion-preference'));assert.equal(f.timers.size,0);assert.equal(f.control.hidden,true);
  }finally{dispose();f.restore();}
});


test('autoplay retains initial availability, follows visibility and ignores delivery after disposal',()=>{
  const f=fixture({autoplay:true}),dispose=mount({element:f.root});
  try{
    assert.equal(f.timers.size,1,'existing initial state remains visible before observation');
    f.observers[1].fn([{isIntersecting:false}]);assert.equal(f.timers.size,0);
    f.observers[1].fn([{isIntersecting:false},{isIntersecting:true}]);assert.equal(f.timers.size,1);
    dispose();f.observers[1].fn([{isIntersecting:true}]);assert.equal(f.timers.size,0);
  }finally{dispose();f.restore();}
});

test('without visibility observation the existing process controls and autoplay remain available',()=>{
  const f=fixture({autoplay:true,intersection:false}),dispose=mount({element:f.root});
  try{
    assert.equal(f.timers.size,1);assert.equal(f.control.hidden,false);
    f.heads[1].querySelector('button').dispatchEvent(new Event('click'));
    assert.equal(f.heads[1].querySelector('button').getAttribute('aria-expanded'),'true');
  }finally{dispose();f.restore();}
});

test('title-only steps remain static headings rather than empty disclosures',()=>{
  const f=fixture();f.paragraphs[0].remove();const dispose=mount({element:f.root});
  try{assert.equal(f.heads[0].querySelector('button'),null);assert.equal(f.heads[1].querySelector('button').getAttribute('aria-expanded'),'true');}
  finally{dispose();f.restore();}
});
