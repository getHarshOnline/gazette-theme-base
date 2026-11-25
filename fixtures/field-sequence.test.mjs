import test from 'node:test';
import assert from 'node:assert/strict';
import { mountFieldSequence } from '../scripts/field-sequence.js';
import { fieldPosition, fieldClosing, dampField } from '../scripts/field-timeline.js';
import { setMaxListeners } from 'node:events';

// Neutral lifecycle/geometry harness: exercises the actual controller. It does not
// establish browser layout, WebGL fidelity, continuous visual motion or approval.
function environment({ hash='', overflow=false, reduced=false, top=0 }={}) {
  const originals=new Map(), rafs=new Map(), draws=[], disposals=[], listeners=new Set();
  let serial=0, clock=0, callbacks=null, badFit=overflow, fontsResolve;
  const install=(name,value)=>{originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});};
  class Target extends EventTarget {
    removeEventListener(type,fn,options){super.removeEventListener(type,fn,options);for(const entry of listeners)if(entry.target===this&&entry.type===type&&entry.fn===fn)listeners.delete(entry);}
    addEventListener(type,fn,options){super.addEventListener(type,fn,options);const entry={target:this,type,fn};listeners.add(entry);options?.signal?.addEventListener('abort',()=>listeners.delete(entry),{once:true});}
  }
  class Node extends Target {
    constructor(id='',text=''){super();this.id=id;this.children=[];this.attrs=new Map();this.inert=false;this._text=text;this.dataset=new Proxy({}, {set:(o,k,v)=>{o[k]=v;this.attrs.set('data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),v);return true;}});this.style={setProperty(k,v){this[k]=v;},getPropertyValue(k){return this[k]??'';},removeProperty(k){delete this[k];}};this.classes=new Set();this.classList={add:n=>this.classes.add(n),remove:n=>this.classes.delete(n)};}
    get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}set textContent(v){this._text=v;this.children=[];}
    get childNodes(){return this.children;}
    append(n){this.children.push(n);n.parent=this;}
    replaceChildren(...nodes){this.children=[];this._text='';for(const n of nodes)this.append(n);}
    setAttribute(k,v){this.attrs.set(k,String(v));}getAttribute(k){return this.attrs.has(k)?this.attrs.get(k):null;}removeAttribute(k){this.attrs.delete(k);if(k==='style')for(const p of Object.keys(this.style))if(typeof this.style[p]!=='function')delete this.style[p];if(k.startsWith('data-'))delete this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];}hasAttribute(k){return this.attrs.has(k);}
    contains(n){return n===this||this.children.some(c=>c.contains?.(n));}
    closest(selector){return selector==='a[href]'?(this.href?this:null):wrapper;}
    querySelectorAll(s){return this.queries?.[s]??[];}querySelector(s){return this.querySelectorAll(s)[0]??null;}
    getBoundingClientRect(){return this.box??{top:100,bottom:180,left:20,right:400,width:380,height:80};}
    scrollIntoView(){window.scrollTo({top:top+Math.max(0,sections.findIndex(s=>s.contains(this)))*600});}
    focus(){document.activeElement=this;}
    remove(){this.removed=true;}
  }
  const wrapper=new Node(),story=new Node(),stage=new Node(),header=new Node();
  wrapper.clientWidth=800;wrapper.append(story);wrapper.append(stage);wrapper.queries={'.relation-sequence':[story]};
  wrapper.getBoundingClientRect=()=>({top:top-scrollY,bottom:top+(wrapper.dataset.islandState==='drawn'?7*600*1.85:7*600)-scrollY,left:0,right:800,width:800,height:wrapper.dataset.islandState==='drawn'?7*600*1.85:7*600});
  stage.box={top:0,bottom:600,left:0,right:800,width:800,height:600};header.box={top:0,bottom:60,left:0,right:800,width:800,height:60};
  const headings=[], copies=[], notes=[], sections=Array.from({length:7},(_,i)=>{
    const section=new Node(`part-${i}`),copy=new Node(),title=new Node(),note=new Node();section.getBoundingClientRect=()=>({top:top+i*600-scrollY,bottom:top+(i+1)*600-scrollY,left:0,right:800,width:800,height:600});copy.append(title);copy.append(note);section.append(copy);story.append(section);copies.push(copy);notes.push(note);
    title.getBoundingClientRect=()=>({top:100,bottom:badFit?750:230,left:20,right:500,width:480,height:130});
    note.box={top:300,bottom:400,left:20,right:600,width:580,height:100};
    if(i<6){const heading=new Node();heading.append(new Node('',`A question ${i}\nAnother line\nFinal line`));title.append(heading);headings.push(heading);section.queries={'.relation-copy':[copy],'.relation-title :is(h1,h2)':[heading],'.relation-note > *, .relation-action':[note],'.relation-title,.relation-note,.relation-closing,.relation-action':[title,note]};}
    else section.queries={'.relation-copy':[copy],'.relation-title,.relation-note,.relation-closing,.relation-action':[]};
    return section;
  });
  const closing=Array.from({length:3},()=>new Node()),action=new Node('research');action.href='https://example.test/research/';action.box={top:400,bottom:450,left:20,right:400,width:380,height:50};
  closing.forEach(p=>copies[6].append(p));copies[6].append(action);
  sections[6].queries['.relation-closing > p']=closing;sections[6].queries['.relation-action']=[action];sections[6].queries['.relation-note > *, .relation-action']=[action];sections[6].queries['.relation-title,.relation-note,.relation-closing,.relation-action']=[action];
  story.queries={'.relation-passage':sections};
  const doc=new Target();doc.documentElement={dataset:{motion:reduced?'reduce':'allow'}};doc.hidden=false;doc.getElementById=id=>[...sections,action].find(n=>n.id===id)??null;doc.querySelector=s=>s==='.frame__header'?header:null;doc.createElement=()=>new Node();doc.createTextNode=t=>new Node('',t);doc.fonts=new Target();doc.fonts.ready=new Promise(r=>fontsResolve=r);
  const win=new Target();win.scrollTo=({top})=>{globalThis.scrollY=top;};
  const media=new Target();media.matches=false;const fine=new Target();fine.matches=true;
  install('window',win);install('document',doc);install('innerWidth',800);install('innerHeight',600);install('scrollY',0);install('devicePixelRatio',1);install('performance',{now:()=>clock});
  install('location',{origin:'https://example.test',pathname:'/',search:'',hash});install('history',{pushState(_s,_t,hash){location.hash=hash;}});install('matchMedia',q=>q.includes('reduced')?media:fine);
  const tokens={'pointer-rate':6,'camera-rate':2,'energy-decay':4,'stream-rate':3,'step-limit':'50ms','camera-x':.4,'camera-y':.2,'stream-x':.3,'stream-y':.15,'energy-divisor':45,'intro-duration':'1400ms','line-duration':1050,'line-offset':108,'line-stagger':75,'note-duration':900,'note-stagger':80,'note-delay':220,'panel-lift':22,'note-lift':12,'close-lift':10};
  install('getComputedStyle',()=>({getPropertyValue:name=>tokens[name.replace('--field-','')]??''}));
  install('requestAnimationFrame',fn=>{rafs.set(++serial,fn);return serial;});install('cancelAnimationFrame',id=>rafs.delete(id));let observer;
  Object.assign(window, { requestAnimationFrame, cancelAnimationFrame });
  install('ResizeObserver',class{constructor(fn){this.fn=fn;observer=this;}observe(){}disconnect(){this.disconnected=true;}});
  const field={presets:Array.from({length:7},(_,i)=>({camZ:8+i,stream:.2+i*.1})),sceneSpan:1.85,blendStart:.5,blendEnd:.95,fadeStart:.7,fadeEnd:1,closeSpan:.85,pixelRatio:1.5,pixelRatioHigh:1.2};
  const createRenderer=opts=>{callbacks=opts;const renderer={canvas:new Node(),render(frame){draws.push(frame);if(env.failDraw)throw new Error('render unavailable');return env.pending?null:!env.noDraw;},dispose(){disposals.push(renderer);}};return renderer;};
  const env={wrapper,story,stage,sections,headings,copies,notes,closing,action,draws,rafs,media,fine,tokens,field,createRenderer,disposals,Node,
    get callbacks(){return callbacks;},get observer(){return observer;},get listenerCount(){return listeners.size;},
    mount(){return mountFieldSequence({element:stage,field,pixelRatio:r=>Math.min(r,1.5),createRenderer,lighting:{}});},
    tick(now=clock+16){clock=now;const pending=[...rafs.values()];rafs.clear();pending.forEach(fn=>fn(now));},
    fit(v){badFit=!v;},fontsReady(){fontsResolve();},
    click(target){const event=new Event('click',{cancelable:true});Object.defineProperty(event,'target',{value:target});wrapper.dispatchEvent(event);return event;},
    restore(){for(const[name,d]of originals)d?Object.defineProperty(globalThis,name,d):delete globalThis[name];}
  };
  return env;
}
// The controller intentionally installs many abort-scoped native event listeners.
setMaxListeners(0);

test('field edit clamps its ends, retains source holds and never reverses a blend',()=>{
  const edit={blendStart:.5,blendEnd:.95,fadeStart:.7,fadeEnd:1};
  assert.equal(fieldPosition(-10,7,edit).index,0);assert.equal(fieldPosition(10,7,edit).index,6);
  let blend=0;for(let i=0;i<=100;i++){const s=fieldPosition(2+i/100,7,edit);if(i<100){assert.ok(s.blend>=blend);blend=s.blend;assert.ok(s.visibility>=0&&s.visibility<=1);}}
  assert.equal(fieldPosition(2.4,7,edit).blend,0);assert.equal(fieldPosition(2.95,7,edit).blend,1);assert.equal(fieldPosition(6.99,7,edit).visibility,1);
  assert.equal(fieldClosing(1,2,3,.85),1);assert.equal(fieldClosing(0,2,3,.85),0);
  assert.ok(dampField(0,1,4,.1)>0&&dampField(0,1,4,.1)<1);
});

test('cold fragment selects its own native section; history does not steal focus and cleanup restores headings',()=>{
  const e=environment({hash:'#part-3'});try{const original=e.headings[0].childNodes[0];const dispose=e.mount();
    assert.equal(e.wrapper.dataset.islandState,'drawn');assert.equal(scrollY,3.05*600*1.85);assert.equal(e.sections[3].inert,false);assert.equal(e.sections[2].inert,true);
    location.hash='#part-5';window.dispatchEvent(new Event('hashchange'));e.tick();assert.equal(scrollY,5.05*600*1.85);assert.equal(document.activeElement,undefined);
    location.hash='#%E0%A4%A';window.dispatchEvent(new Event('popstate'));const before=scrollY;e.tick();assert.equal(scrollY,before);
    dispose();assert.equal(e.rafs.size,0);assert.equal(e.listenerCount,0);assert.equal(e.disposals.length,1);assert.equal(e.headings[0].childNodes[0],original);assert.ok(e.sections.every(s=>!s.inert));assert.equal(e.observer.disconnected,true);
  }finally{e.restore();}
});

test('native heading text remains separated while line masks are active',()=>{
  const e=environment();try{const dispose=e.mount();assert.match(e.headings[0].textContent,/question 0\s+Another line\s+Final line/);dispose();}finally{e.restore();}
});

test('reduced motion keeps every passage readable and allocates no renderer',()=>{
  const e=environment({reduced:true});try{const dispose=e.mount();assert.equal(e.draws.length,0);assert.equal(e.rafs.size,0);assert.ok(e.sections.every(s=>!s.inert));
    document.documentElement.dataset.motion='allow';document.dispatchEvent(new Event('motion-preference'));assert.equal(e.wrapper.dataset.islandState,'drawn');
    document.documentElement.dataset.motion='reduce';document.dispatchEvent(new Event('motion-preference'));assert.equal(e.wrapper.dataset.islandState,'still');assert.equal(e.rafs.size,0);assert.ok(e.sections.every(s=>!s.inert));dispose();
  }finally{e.restore();}
});

test('static reading retains footer-boundary state without creating a renderer',()=>{
  const e=environment({reduced:true});try{const dispose=e.mount();
    assert.equal(e.wrapper.dataset.fieldPosition,'pinned');
    scrollY=3900;window.dispatchEvent(new Event('scroll'));assert.equal(e.wrapper.dataset.fieldPosition,'leaving');
    scrollY=4300;window.dispatchEvent(new Event('scroll'));assert.equal(e.wrapper.dataset.fieldPosition,'after');
    assert.equal(e.draws.length,0);assert.equal(e.rafs.size,0);
    dispose();assert.equal(e.wrapper.getAttribute('data-field-position'),null);
  }finally{e.restore();}
});

test('hidden/offstage/BFCache pauses the clock, final pagehide disposes and late fonts cannot restart',async()=>{
  const e=environment();try{const dispose=e.mount();e.tick(100);e.tick(200);const before=e.draws.at(-1).time;
    document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(e.rafs.size,0);e.tick(5000);assert.equal(e.draws.at(-1).time,before);
    document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));e.tick(6000);assert.equal(e.draws.at(-1).time,before);
    const persisted=new Event('pagehide');Object.defineProperty(persisted,'persisted',{value:true});window.dispatchEvent(persisted);assert.equal(e.rafs.size,0);assert.equal(e.disposals.length,0);
    window.dispatchEvent(new Event('pageshow'));e.tick();assert.ok(e.rafs.size>0);
    scrollY=9000;window.dispatchEvent(new Event('scroll'));assert.equal(e.rafs.size,0);
    window.dispatchEvent(new Event('pagehide'));assert.equal(e.disposals.length,1);e.fontsReady();await Promise.resolve();assert.equal(e.rafs.size,0);dispose();
  }finally{e.restore();}
});

test('overflow and a late font fit change fall back to the complete document',()=>{
  const e=environment();try{const dispose=e.mount();e.fit(false);document.fonts.dispatchEvent(new Event('loadingdone'));assert.equal(e.wrapper.dataset.islandState,'still');assert.ok(e.sections.every(s=>!s.inert));assert.equal(e.rafs.size,0);
    e.fit(true);window.dispatchEvent(new Event('resize'));assert.equal(e.wrapper.dataset.islandState,'drawn');dispose();
  }finally{e.restore();}
});

test('context loss and drawing failure restore native content rather than leave hidden passages',()=>{
  const e=environment();try{const dispose=e.mount();e.callbacks.onLost();assert.equal(e.wrapper.dataset.islandState,'still');assert.ok(e.sections.every(s=>!s.inert));assert.equal(e.rafs.size,0);
    e.callbacks.onRestored();assert.equal(e.wrapper.dataset.islandState,'drawn');e.failDraw=true;e.tick();assert.equal(e.wrapper.dataset.islandState,'still');assert.ok(e.sections.every(s=>!s.inert));assert.equal(e.rafs.size,0);dispose();
  }finally{e.restore();}
});

test('print round trip restores occupied progress; a new native hash takes precedence',()=>{
  const e=environment({hash:'#part-4'});try{const dispose=e.mount();const original=scrollY;window.dispatchEvent(new Event('beforeprint'));assert.equal(e.wrapper.dataset.islandState,'still');assert.ok(e.sections.every(s=>!s.inert));window.dispatchEvent(new Event('afterprint'));assert.equal(scrollY,original);
    window.dispatchEvent(new Event('beforeprint'));location.hash='#part-2';window.dispatchEvent(new Event('hashchange'));e.tick();window.dispatchEvent(new Event('afterprint'));assert.equal(scrollY,2.05*600*1.85);dispose();
  }finally{e.restore();}
});

test('same-page fragment clicked while printing supersedes the old print return',()=>{
  const e=environment({hash:'#part-4'});try{const dispose=e.mount();window.dispatchEvent(new Event('beforeprint'));const link=new e.Node();link.href='https://example.test/#part-1';const event=e.click(link);assert.equal(event.defaultPrevented,true);window.dispatchEvent(new Event('afterprint'));assert.equal(scrollY,1.05*600*1.85);dispose();
  }finally{e.restore();}
});

test('first title entrance never jumps from fully revealed back behind its mask',()=>{
  const e=environment();try{const dispose=e.mount();const line=e.headings[0].children[0].children[0];const offset=()=>parseFloat(line.style.transform.match(/\(([^%]+)/)[1]);const first=offset();e.tick(16);assert.ok(offset()<=first,'the first RAF must not conceal already exposed title ink');dispose();}finally{e.restore();}
});

test('native final action cannot receive focus while it is visually absent',()=>{
  const e=environment();try{const dispose=e.mount();scrollY=6.05*600*1.85;window.dispatchEvent(new Event('scroll'));e.tick();assert.equal(e.action.inert,true);assert.equal(e.action.style.opacity,'0');
    scrollY=(6+5/6)*600*1.85;window.dispatchEvent(new Event('scroll'));e.tick();assert.equal(e.action.inert,false);assert.equal(e.action.style.opacity,'1');dispose();
  }finally{e.restore();}
});

test('resize preserves an occupied section without pulling the reader back from the footer',()=>{
  const e=environment({hash:'#part-2'});try{const dispose=e.mount();innerHeight=800;window.dispatchEvent(new Event('resize'));assert.equal(scrollY,2.05*800*1.85);
    scrollY=20000;window.dispatchEvent(new Event('scroll'));innerHeight=700;window.dispatchEvent(new Event('resize'));assert.equal(scrollY,20000);dispose();
  }finally{e.restore();}
});

test('turning motion back on respects navigation performed in the static document',()=>{
  const e=environment({hash:'#part-4'});try{const dispose=e.mount();document.documentElement.dataset.motion='reduce';document.dispatchEvent(new Event('motion-preference'));
    e.sections[1].scrollIntoView();window.dispatchEvent(new Event('scroll'));document.documentElement.dataset.motion='allow';document.dispatchEvent(new Event('motion-preference'));
    assert.equal(e.sections[1].inert,false,'the section reached while reading the static document must remain the current passage');assert.equal(e.sections[4].inert,true);dispose();
  }finally{e.restore();}
});

test('a renderer that cannot draw never hides the native document',()=>{
  const e=environment();try{e.noDraw=true;const dispose=e.mount();assert.notEqual(e.wrapper.dataset.islandState,'drawn');assert.ok(e.sections.every(s=>!s.inert));assert.equal(e.rafs.size,0);dispose();}finally{e.restore();}
});

test('pending shader work keeps the native sections open and starts the field clock at its first draw',()=>{
  const e=environment();
  try{
    e.pending=true;
    const dispose=e.mount();
    e.tick(100);e.tick(200);
    assert.notEqual(e.wrapper.dataset.islandState,'drawn');
    assert.ok(e.sections.every(section=>!section.inert));
    assert.ok(e.draws.every(frame=>frame.time===0));
    e.pending=false;e.tick(300);
    assert.equal(e.wrapper.dataset.islandState,'drawn');
    assert.equal(e.draws.at(-1).intro,0);
    e.tick(400);
    assert.ok(e.draws.at(-1).time>0);
    dispose();
  }finally{e.restore();}
});

test('fit checks use resting composition instead of rejecting inactive exit transforms',()=>{
  const e=environment();try{
    e.notes.slice(0,6).forEach((node,i)=>{node.getBoundingClientRect=()=>{const offset=parseFloat(e.copies[i].style.transform?.match(/\(([^p]+)/)?.[1]??'0');return {top:480+offset,bottom:590+offset,left:20,right:600,width:580,height:110};};});
    const dispose=e.mount();assert.equal(e.wrapper.dataset.islandState,'drawn');window.dispatchEvent(new Event('resize'));assert.equal(e.wrapper.dataset.islandState,'drawn','an inactive panel shifted down during its exit must not trigger the static fallback');dispose();
  }finally{e.restore();}
});
