import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = ['reading-position','reading-navigation'].map(name => readFileSync(new URL(`../scripts/${name}.js`, import.meta.url), 'utf8').replace('export function', 'function')).join('\n');

function fixture({flow=true,initialHash='',initialRow=false,focusFallback=false}={}) {
  let document, window, controller, menuClosed=0;
  const frames=[], observed=[];
  class Element {
    constructor(name,top=0,height=0) { this.name=name;this.top=top;this.height=height;this.children=[];this.parentNode=null;this.attrs={};this.events=new Map();this.selectors=new Map();this.hidden=false;this.scrollTop=0;this.textContent='';this.style={}; }
    append(child){this.insertBefore(child,null);}
    insertBefore(child,next){const focused=child.contains(document?.activeElement);child.remove();if(focused)document.activeElement=document.body;const index=next===null?this.children.length:this.children.indexOf(next);assert.notEqual(index,-1);this.children.splice(index,0,child);child.parentNode=this;}
    remove(){if(this.parentNode){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}}
    get nextSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null;}
    get isConnected(){return this===root||!!this.parentNode?.isConnected;}
    contains(other){return this===other||this.children.some(child=>child.contains(other));}
    addEventListener(type,fn,options){const handlers=this.events.get(type)||[];handlers.push({fn,options});this.events.set(type,handlers);}
    fire(type,props={}){const event={target:this,button:0,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...props};for(const h of [...this.events.get(type)||[]]){h.fn(event);if(h.options?.once)this.events.set(type,this.events.get(type).filter(item=>item!==h));}return event;}
    setAttribute(key,value){this.attrs[key]=String(value);}
    getAttribute(key){return this.attrs[key]??null;}
    removeAttribute(key){delete this.attrs[key];}
    querySelector(selector){return this.selectors.get(selector)||null;}
    querySelectorAll(selector){return this.selectors.get(selector)||[];}
    closest(selector){if(selector==='a[href]'&&this.href)return this;if(selector==='.reading-outline'&&this===outline)return this;if(selector==='.reading-section-control'&&this===disclosure)return this;if(selector==='.reading-navigation'&&this===pane)return this;return this.parentNode?.closest(selector)||null;}
    matches(selector){return selector==='h2,h3'&&this.name.startsWith('heading');}
    getClientRects(){return this.hidden?[]:[{}];}
    getBoundingClientRect(){return {top:this.top-window.scrollY,bottom:this.top+this.height-window.scrollY,height:this.hidden?0:this.height};}
    focus(options){document.activeElement=this;this.focusOptions=options;}
  }
  const root=new Element('root'), header=new Element('header'), main=new Element('main'), home=new Element('home'), outline=new Element('outline',100,100), nav=new Element('nav',100,100), sentinel=new Element('after outline');
  const disclosure=new Element('disclosure'), summary=new Element('summary'), current=new Element('current');
  const layout=new Element('layout'),pane=new Element('pane');
  const body=new Element('publication-body',220,1780);
  root.append(header);root.append(main);main.append(layout);layout.append(pane);pane.append(home);home.append(outline);outline.append(disclosure);disclosure.append(summary);summary.append(current);disclosure.append(nav);outline.append(sentinel);layout.append(body);
  const headings=[new Element('heading one',300,30),new Element('heading two',900,30)], links=[new Element('link one'),new Element('link two')];
  headings.forEach((heading,i)=>{heading.id='section-'+i;body.append(heading);links[i].href='https://example.test/article/#section-'+i;links[i].textContent='Chapter '+i;nav.append(links[i]);});
  nav.selectors.set('a[href]',links);disclosure.selectors.set(':scope > summary',summary);summary.selectors.set('.reading-section-current',current);
  const properties=new Map([['--frame-chrome','60px']]);
  root.style={getPropertyValue:key=>properties.get(key)||'',setProperty:(key,value)=>properties.set(key,value)};root.scrollHeight=2200;
  document=new Element('document');document.documentElement=root;document.body=root;document.activeElement=null;
  const row=initialRow?new Element('native reading row'):null, fallback=initialRow?new Element('native outline link'):null;
  if(row){header.append(row);row.append(fallback);fallback.setAttribute('href','#gazette-reading-outline');header.selectors.set(':scope > .reading-header-row[data-reading-initial]',row);row.selectors.set('.reading-header-fallback',fallback);if(focusFallback)document.activeElement=fallback;}
  document.selectors.set('.publication-body',body);document.selectors.set('.reading-sections',nav);
  document.getElementById=id=>headings.find(heading=>heading.id===id)||null;document.createElement=name=>new Element(name);
  window=new Element('window');window.scrollY=0;window.scrollX=0;window.innerHeight=600;
  const location={hash:initialHash};window.location=location;
  const computed=element=>({visibility:'visible',lineHeight:'20px',marginBlockStart:'0',marginBlockEnd:'0',getPropertyValue:key=>(element===outline||element===pane)&&key==='--reading-placement'?(flow?'flow':'beside'):element===root?properties.get(key)||'':''});
  const context=vm.createContext({document,window,location,URL,getComputedStyle:computed,requestAnimationFrame:fn=>frames.push(fn),queueMicrotask:fn=>frames.push(fn),ResizeObserver:class{constructor(fn){this.fn=fn;}observe(element){observed.push(element);}}});
  vm.runInContext(source,context);
  const position=context.mountReadingPosition();
  controller=context.mountReadingNavigation({position,header,closeMenu:()=>menuClosed++});
  const flush=()=>{let budget=100;while(frames.length){assert.ok(--budget,'orientation must settle without geometry feedback');frames.shift()();}};
  flush();
  return {document,window,location,position,controller,header,disclosure,summary,current,nav,outline,home: outline,sentinel,links,headings,observed,properties,flush,row,fallback,
    get menuClosed(){return menuClosed;},
    scroll(y){window.scrollY=y;window.fire('scroll');flush();},
    resize(nextFlow){flow=nextFlow;window.fire('resize');flush();},
    open(){summary.fire('click');disclosure.open=true;disclosure.fire('toggle');flush();},
    close(){controller.close();flush();}
  };
}

test('one native outline/control moves into the header in flow and back to its exact aside slot beside',()=>{
  const f=fixture();assert.equal(f.disclosure.parentNode.parentNode,f.header);assert.equal(f.nav.parentNode,f.disclosure);
  assert.equal(f.home.children.length,1);assert.equal(f.home.children[0],f.sentinel);
  f.resize(false);assert.equal(f.disclosure.parentNode,f.home);assert.equal(f.disclosure.nextSibling,f.sentinel);assert.equal(f.header.children.length,0);
  f.resize(true);assert.equal(f.header.children.length,1);assert.equal(f.nav.parentNode,f.disclosure);
});

test('enhancement reuses the native header row and restores its working link on traversal',()=>{
  const f=fixture({initialRow:true});
  assert.equal(f.controller.headerRow,f.row);assert.equal(f.header.children.length,1);
  assert.equal(f.disclosure.parentNode,f.row);assert.equal(f.fallback.hidden,true);
  assert.equal(f.fallback.getAttribute('href'),'#gazette-reading-outline');
  f.resize(false);assert.equal(f.disclosure.parentNode,f.home);assert.equal(f.fallback.hidden,false);
  f.resize(true);assert.equal(f.disclosure.parentNode,f.row);assert.equal(f.fallback.hidden,true);
  f.window.fire('pagehide');assert.equal(f.disclosure.parentNode,f.home);assert.equal(f.fallback.hidden,false);
  f.window.fire('pageshow');assert.equal(f.disclosure.parentNode,f.row);assert.equal(f.fallback.hidden,true);
});

test('a reader already on the native header link keeps keyboard focus during enhancement',()=>{
  const f=fixture({initialRow:true,focusFallback:true});
  assert.equal(f.document.activeElement,f.summary);assert.equal(f.summary.focusOptions.preventScroll,true);
});

test('one tracker marks the native link and summary label without changing fragments',()=>{
  const f=fixture();f.scroll(400);assert.equal(f.links[0].getAttribute('aria-current'),'location');assert.equal(f.current.textContent,'Chapter 0');
  f.scroll(950);assert.equal(f.links[0].getAttribute('aria-current'),null);assert.equal(f.links[1].getAttribute('aria-current'),'location');assert.equal(f.current.textContent,'Chapter 1');assert.equal(f.location.hash,'');
});

test('opening the native outline closes Menu and Escape closes only that disclosure with summary focus',()=>{
  const f=fixture();f.open();assert.equal(f.disclosure.open,true);assert.ok(f.menuClosed>0);
  const event=f.disclosure.fire('keydown',{key:'Escape',stopPropagation(){this.stopped=true;}});
  assert.equal(f.disclosure.open,false);assert.equal(f.document.activeElement,f.summary);assert.equal(event.prevented,true);
});

test('outside activation closes the header outline; beside outline keeps its reader choice',()=>{
  const f=fixture();f.open();f.document.fire('click',{target:f.headings[0]});assert.equal(f.disclosure.open,false);
  f.resize(false);f.disclosure.open=true;f.document.fire('click',{target:f.headings[0]});assert.equal(f.disclosure.open,true);
});

test('native chapter links close flow disclosure and focus the exact target, while modifiers stay ordinary',()=>{
  const f=fixture();f.scroll(400);f.open();
  assert.equal(f.nav.fire('click',{target:f.links[1],ctrlKey:true}).prevented,undefined);assert.equal(f.disclosure.open,true);
  const click=f.nav.fire('click',{target:f.links[1]});assert.equal(click.prevented,undefined);
  assert.equal(f.disclosure.open,true,'native anchor remains rendered through default activation');
  f.document.activeElement=f.document.body;f.location.hash='#section-1';f.window.fire('hashchange');f.flush();assert.equal(f.disclosure.open,false);
  assert.equal(f.document.activeElement,f.headings[1]);assert.equal(f.headings[1].getAttribute('tabindex'),'-1');assert.equal(f.headings[1].focusOptions.preventScroll,true);
  f.headings[1].fire('blur');assert.equal(f.headings[1].getAttribute('tabindex'),null);
});

test('pointer focus departure cannot hide a chapter before its native activation',()=>{
  const f=fixture();f.open();f.links[1].focus();
  f.document.fire('pointerdown',{isTrusted:true,target:f.links[1]});
  f.document.activeElement=f.document.body;
  f.disclosure.fire('focusout',{relatedTarget:f.document.body});f.flush();
  assert.equal(f.disclosure.open,true,'pointer focusout must not hide the pending anchor');
  const click=f.nav.fire('click',{target:f.links[1]});assert.equal(click.prevented,undefined);
  f.location.hash='#section-1';f.window.fire('hashchange');f.flush();
  assert.equal(f.disclosure.open,false);assert.equal(f.document.activeElement,f.headings[1]);
});

test('Tab departure dismisses the flow outline without returning focus',()=>{
  const f=fixture();f.open();f.links[1].focus();
  f.document.fire('keydown',{isTrusted:true,key:'Tab'});
  f.document.activeElement=f.headings[0];
  f.disclosure.fire('focusout',{relatedTarget:f.headings[0]});f.flush();
  assert.equal(f.disclosure.open,false);assert.equal(f.document.activeElement,f.headings[0]);
});

test('Tab into the open flow outline keeps it open',()=>{
  const f=fixture();f.open();f.summary.focus();
  f.document.fire('keydown',{isTrusted:true,key:'Tab'});
  // The check runs while focus is still in flight: the summary has lost it and the link has not received it.
  f.document.activeElement=f.document.body;
  f.disclosure.fire('focusout',{relatedTarget:f.links[0]});f.flush();
  assert.equal(f.disclosure.open,true,'Tab from the summary must reach the first section link');
});

test('new trusted input or newer control focus cancels delayed heading focus',()=>{
  for(const type of ['pointerdown','keydown','wheel','touchstart','control-focus']){
    const f=fixture();f.open();f.nav.fire('click',{target:f.links[1]});
    if(type==='control-focus')f.document.activeElement={isConnected:true};else f.document.fire(type,{isTrusted:true});
    f.flush();assert.notEqual(f.document.activeElement,f.headings[1]);assert.equal(f.headings[1].getAttribute('tabindex'),null);
  }
});

test('print returns the actual control/nav home and restores focus/placement without changing open choice',()=>{
  const f=fixture();f.open();f.links[1].focus();f.window.fire('beforeprint');f.flush();
  assert.equal(f.disclosure.parentNode,f.home);assert.equal(f.disclosure.open,true);
  f.window.fire('beforeprint');f.window.fire('afterprint');f.flush();
  assert.equal(f.disclosure.parentNode.parentNode,f.header);assert.equal(f.document.activeElement,f.links[1]);assert.equal(f.disclosure.open,true);
});

test('closing during print is not overwritten; traversal restores home then recomposes without reopening',()=>{
  const f=fixture();f.open();f.window.fire('beforeprint');f.close();f.window.fire('afterprint');f.flush();assert.equal(f.disclosure.open,false);
  f.open();f.window.fire('pagehide');f.flush();assert.equal(f.disclosure.parentNode,f.home);assert.equal(f.disclosure.open,false);
  f.window.fire('pageshow');f.flush();assert.equal(f.disclosure.parentNode.parentNode,f.header);assert.equal(f.disclosure.open,false);
});

test('resize preserves the same focused chapter and explicit open state',()=>{
  const f=fixture();f.open();f.links[1].focus();f.resize(false);assert.equal(f.disclosure.parentNode,f.home);assert.equal(f.document.activeElement,f.links[1]);assert.equal(f.disclosure.open,true);
  f.resize(true);assert.equal(f.disclosure.parentNode.parentNode,f.header);assert.equal(f.document.activeElement,f.links[1]);assert.equal(f.disclosure.open,true);
});

test('short final sections and later manual scrolling retain native fragment identity',()=>{
  const f=fixture({initialHash:'#section-1'});f.headings[1].top=1950;f.position.refresh();f.scroll(1600);f.window.fire('hashchange');f.flush();assert.equal(f.links[1].getAttribute('aria-current'),'location');
  f.scroll(400);assert.equal(f.links[0].getAttribute('aria-current'),'location');assert.equal(f.location.hash,'#section-1');
});


test('Menu/shell and page traversal preserve the beside rail open choice',()=>{
  const f=fixture({flow:false});f.disclosure.open=true;f.close();assert.equal(f.disclosure.open,true);
  f.window.fire('pagehide');f.flush();assert.equal(f.disclosure.open,true);assert.equal(f.disclosure.parentNode,f.home);
  f.window.fire('pageshow');f.flush();assert.equal(f.disclosure.open,true);
  f.resize(true);f.close();assert.equal(f.disclosure.open,false);
});
