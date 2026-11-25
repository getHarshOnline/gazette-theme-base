import test from 'node:test';
import assert from 'node:assert/strict';
import {createFilmTimeline, filmVisibility, filmLineVisibility, advanceFilm, filmNavigationCurve, filmIntroProgress, filmLetterVisibility, filmPaintedProgressWindow, filmPassageProgress} from '../scripts/film-timeline.js';
const beats = [[0,0],[.06,0],[.32,4.65],[.44,5.3],[.66,10],[.72,10],[.95,15],[1,15]];

test('generated scene navigation curves clamp and interpolate; invalid projections decline travel',()=>{
 const curve=filmNavigationCurve('linear(0, 0.8, 1)');
 assert.equal(curve(-1),0);assert.equal(curve(.25),.4);assert.equal(curve(.75),.9);assert.equal(curve(2),1);
 for(const invalid of [undefined,'','ease-out','linear(0, 1 100%)','linear(0, , 1)','linear(, 1)','linear(0, 1,)','linear(0, NaN, 1)','linear(0, 1.2, 1)','linear(0, .8, .2, 1)','linear(.1, 1)','linear(0, .9)'])assert.equal(filmNavigationCurve(invalid),null,invalid);
});

test('film rests are exact and travel never overshoots or reverses', () => {
  const at = createFilmTimeline(beats);
  for (const [x,y] of beats) assert.equal(at(x),y);
  for (const [a,b,y] of [[0,.06,0],[.66,.72,10],[.95,1,15]]) {
    for (let i=0;i<=20;i++) assert.ok(Math.abs(at(a+(b-a)*i/20)-y)<1e-12);
  }
  let last=0;
  for(let i=0;i<=10000;i++){const value=at(i/10000);assert.ok(value>=last-1e-12&&value>=0&&value<=15);last=value;}
  assert.ok(Math.abs(at(.15)-((.15-.06)/(.32-.06)*4.65))>.1,'travel is eased, not piecewise linear');
  assert.equal(at(-1),0); assert.equal(at(2),15);
});
test('card arrivals overlap the core hold and precede final copy', () => {
  assert.equal(filmVisibility(9,[9.1,9.9]),0);
  assert.equal(filmVisibility(10,[9.1,9.9]),1);
  assert.ok(filmVisibility(10,[9.45,10.25])>0&&filmVisibility(10,[9.45,10.25])<1);
  assert.equal(filmVisibility(10,[10.9,12.1]),0);
  assert.equal(filmVisibility(12.1,[10.9,12.1]),1);
  assert.equal(filmVisibility(1.25,[-1,-1,.35,1.25]),0);
  assert.ok(filmLineVisibility(.5,0,1.25,.12)>filmLineVisibility(.5,1,1.25,.12));
});
test('playhead reversal retargets in place and bounded elapsed time prevents a jump after suspension',()=>{
  const physics={minimumRate:1.25,catchupRate:3.2,stepLimit:.05};
  const forward=advanceFilm(5,10,.016,physics);
  assert.ok(forward>5&&forward<10);
  const reverse=advanceFilm(forward,0,.016,physics);
  assert.ok(reverse<forward&&reverse>0);
  assert.equal(advanceFilm(5,10,100,physics),advanceFilm(5,10,.05,physics));
  assert.equal(advanceFilm(5,5,.016,physics),5);
});
test('invalid authored edits are rejected',()=>{
  assert.throws(()=>createFilmTimeline([[0,0],[0,2]]));
  assert.throws(()=>createFilmTimeline([[0,2],[1,1]]));
});

import {filmFrameWindow} from '../scripts/film-timeline.js';
import {mountCinematicFilm} from '../scripts/cinematic-film.js';

test('bounded decode windows preserve all source indexes through forward and reverse travel',()=>{
  const visited=new Set();
  for(const center of [...Array(361).keys(),...Array(361).keys()].reverse()){
    const window=filmFrameWindow(361,center,7);
    assert.equal(window[0],center);assert.equal(window.length,7);assert.equal(new Set(window).size,7);
    window.forEach(i=>{assert.ok(i>=0&&i<361);visited.add(i);});
  }
  assert.equal(visited.size,361);
  assert.deepEqual(filmFrameWindow(1,0,10),[0]);
  for(const invalid of [0,-1,1.5,NaN])assert.throws(()=>filmFrameWindow(invalid,0,7));
  assert.throws(()=>createFilmTimeline([null,[1,2]]));
});

test('in-flow progress gives the same view from either direction and clamps offscreen',()=>{
  assert.equal(filmPassageProgress(600,400,600),0);
  assert.equal(filmPassageProgress(100,400,600),.5);
  assert.equal(filmPassageProgress(-400,400,600),1);
  assert.equal(filmPassageProgress(-900,400,600),1);
  assert.equal(filmPassageProgress(900,400,600),0);
  assert.equal(filmPassageProgress(0,600,600),.5);
});

test('a distant scroll target stays resident without losing the current frame or exceeding budget',()=>{
  assert.deepEqual(filmFrameWindow(192,40,6,170),[40,170,41,39,42,38]);
  assert.deepEqual(filmFrameWindow(192,170,4,40),[170,40,169,171]);
  assert.deepEqual(filmFrameWindow(192,40,1,170),[40]);
});

// A neutral DOM/lifecycle harness exercises the actual module, not a second controller.
// It deliberately does not claim browser geometry or visual validation.
function environment({hash='',defer=false,overflow=false,authoredTitle=false,tokens={},imageSize=[10,10],frameCount=3,portraitFrames=frameCount}={}) {
  const originals=new Map(), rafs=new Map(), bitmaps=[], requests=[], deferred=[],drawnURLs=[],paintOperations=[],contextOptions=[],resizeObservers=[];
  let serial=0, closes=0, draws=0;
  const install=(key,value)=>{originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
  const listeners=new Set();
  class TrackedTarget extends EventTarget {
    removeEventListener(type,fn,options){super.removeEventListener(type,fn,options);for(const entry of listeners)if(entry.target===this&&entry.type===type&&entry.callback===fn)listeners.delete(entry);}
    addEventListener(type,callback,options){
      super.addEventListener(type,callback,options);
      const entry={target:this,type,callback};listeners.add(entry);
      options?.signal?.addEventListener('abort',()=>listeners.delete(entry),{once:true});
    }
  }
  class Node extends TrackedTarget {
    constructor(id=''){super();this.nodeType=1;this.tagName='DIV';this.id=id;this.attrs=new Map();this.children=[];this.inert=false;this.scrollHeight=100;this.style={setProperty(k,v){this[k]=v;},getPropertyValue(k){return this[k]??'';},removeProperty(k){delete this[k];}};}
    setAttribute(k,v){this.attrs.set(k,String(v));}getAttribute(k){return this.attrs.has(k)?this.attrs.get(k):null;}
    removeAttribute(k){this.attrs.delete(k);}hasAttribute(k){return this.attrs.has(k);}
    append(node){if(node.parent)node.parent.children=node.parent.children.filter(child=>child!==node);this.children.push(node);node.parent=this;}
    get childNodes(){return this.children;}
    insertBefore(node,before){const i=this.children.indexOf(before);this.children.splice(i,0,node);node.parent=this;}
    replaceWith(node){const parent=this.parent;if(node.parent)node.parent.children=node.parent.children.filter(child=>child!==node);const i=parent.children.indexOf(this);parent.children.splice(i,1,node);node.parent=parent;}
    remove(){this.removed=true;}
    contains(node){return this===node||this.children.some(child=>child===node||child.contains?.(node));}
    closest(){return wrapper;}
    querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
    querySelectorAll(selector){return this.queries?.[selector]??[];}
    getBoundingClientRect(){return {top:0,bottom:100,left:0,right:800,width:800,height:100};}
    scrollIntoView(){window.scrollTo({top:Math.max(0,beats.findIndex(b=>b.contains(this)))*600});}
    focus(){document.activeElement=this;}
  }
  const wrapper=new Node(), story=new Node(), stage=new Node(), copyStage=new Node(), masthead=new Node(), main=new Node('main');main.tagName='MAIN';
  wrapper.setAttribute('data-gazette-component-address','content:neutral-home#component-1');
  wrapper.dataset={};wrapper.queries={'.cinematic-story':[story]};wrapper.append(story);wrapper.append(stage);
  wrapper.getBoundingClientRect=()=>({top:-scrollY,bottom:(['drawn','preparing'].includes(wrapper.dataset.islandState)?2400:1800)-scrollY,left:0,right:800,width:800,height:2400});
  stage.getBoundingClientRect=()=>({top:0,bottom:600,left:0,right:800,width:800,height:600});
  copyStage.getBoundingClientRect=()=>({top:Math.min(0,1800-scrollY),bottom:Math.min(0,1800-scrollY)+600});
  masthead.getBoundingClientRect=()=>({top:0,bottom:60});
  const beats=Array.from({length:3},(_,i)=>new Node(`beat-${i}`));
  const lines=beats.map(beat=>{const line=new Node();beat.append(line);return line;});
  lines.forEach(line=>{line.getBoundingClientRect=()=>({top:400,bottom:500,left:0,right:800,width:800,height:100});});
  const cards=[new Node('card-a'),new Node('card-b')];
  cards.forEach((card,i)=>{card.getBoundingClientRect=()=>({top:100+i*150,bottom:200+i*150,left:0,right:300,width:300,height:100});});cards.forEach(card=>beats[2].append(card));
  beats.forEach((beat,i)=>{story.append(beat);beat.queries={'[data-film-line]':[lines[i]],'.cinematic-title, .cinematic-premise, .cinematic-card':[lines[i],...(i===2?cards:[])]};});
  let heading=null,titleText=null,titleEm=null;
  if(authoredTitle){
    heading=new Node('authored-heading');heading.tagName='H1';titleText={nodeType:3,textContent:'An open question, '};titleEm=new Node();titleEm.tagName='EM';titleEm.setAttribute('data-film-line','authored');
    heading.append(titleText);heading.append(titleEm);beats[0].append(heading);
    Object.defineProperty(beats[0].queries,'[data-film-line]',{get:()=>heading.children.filter(node=>node.hasAttribute?.('data-film-line'))});
  }
  if(overflow){lines[2].scrollHeight=900;lines[2].overflowY='hidden';}
  const still=new Node();
  story.queries={'.cinematic-still img':[still],'.cinematic-stage':[copyStage],'.cinematic-beat':beats,'.cinematic-card':cards,'.cinematic-title h1, .cinematic-title h2':heading?[heading]:[]};
  for(const variant of ['landscape','portrait']){
    if(variant==='portrait'&&portraitFrames===null)continue;
    const frameData = Array.from(
      {length: variant === 'portrait' ? portraitFrames : frameCount},
      (_, i) => `https://example.test/${variant}/${i}`,
    );
    story.queries[`script[data-cinematic-frames="${variant}"]`] = [
      {textContent: JSON.stringify(frameData)},
    ];
  }
  const doc=new TrackedTarget();doc.documentElement={dataset:{motion:'allow'}};doc.body=new Node();doc.activeElement=null;doc.hidden=false;
  doc.querySelector=selector=>selector==='.frame__header'?masthead:null;
  doc.getElementById=id=>[main,heading,...beats,...cards].filter(Boolean).find(e=>e.id===id)??null;
  doc.createElement=tag=>{const node=new Node();node.tagName=tag.toUpperCase();if(tag==='canvas')node.getContext=(_kind,options)=>{contextOptions.push(options);return{
    clearRect(...rect){paintOperations.push({kind:'clear',rect});},
    drawImage(image,...rect){draws++;drawnURLs.push(image.url);paintOperations.push({kind:'draw',url:image.url,rect,alpha:this.globalAlpha});}
  };};return node;};
  const win=new TrackedTarget();win.scrollTo=({top})=>{globalThis.scrollY=top;};
  const media=new TrackedTarget();media.matches=false;
  install('window',win);install('document',doc);install('innerWidth',800);install('innerHeight',600);install('scrollY',0);install('devicePixelRatio',1);
  install('location',{origin:'https://example.test',pathname:'/',search:'',hash});install('history',{state:null,replaceState(state){this.state=state;},pushState(state,_title,value){this.state=state;location.hash=value;}});
  install('matchMedia',()=>media);
  install('getComputedStyle',node=>({overflowY:node.overflowY??'visible',overflowX:'visible',getPropertyValue(name){return ({'--film-minimum-rate':1,'--film-catchup-rate':3,'--film-step-limit':'50ms','--film-line-gain':1.25,'--film-line-stagger':.12,'--film-line-blur':14,'--film-line-lift':18,'--film-persistence':.28,'--film-navigation-duration':'1000ms','--film-navigation-easing':'linear(0, 0.5, 1)',...tokens})[name];}}));
  install('requestAnimationFrame',fn=>{rafs.set(++serial,fn);return serial;});install('cancelAnimationFrame',id=>rafs.delete(id));
  Object.assign(window, { requestAnimationFrame, cancelAnimationFrame });
  install('ResizeObserver',class{constructor(callback){this.callback=callback;resizeObservers.push(this);}observe(){}disconnect(){this.disconnected=true;}});
  install('fetch',async url=>{requests.push(url);return{ok:true,blob:async()=>url};});
  install('createImageBitmap',async url=>{
    const bitmap={width:imageSize[0],height:imageSize[1],url,close(){if(this.closed)throw new Error('double close');this.closed=true;closes++;}};bitmaps.push(bitmap);
    if(defer)await new Promise(resolve=>deferred.push({url,resolve}));return bitmap;
  });
  const film={edit:[[0,0],[1,frameCount-1]],windows:[[-1,-1,.1,.2],[.3,.4,1.1,1.2],[1.5,1.8]],cards:[[.7,.8],[.9,1]],rests:[0,.5,1],frames:frameCount,fps:1,variants:{landscape:{},portrait:{}},focus:[.5,.5],viewportSpan:4,pixelRatio:1,concurrency:2,decodedByteLimit:800};
  const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
  return {wrapper,stage,story,still,beats,cards,lines,heading,titleText,titleEm,film,requests,bitmaps,rafs,media,drain,main,drawnURLs,paintOperations,contextOptions,
    resizeObserved(){resizeObservers.filter(observer=>!observer.disconnected).forEach(observer=>observer.callback());},
    get listenerCount(){return listeners.size;},get closes(){return closes;},get draws(){return draws;},
    resolveLast(url){const i=deferred.findLastIndex(item=>item.url===url);if(i>=0)deferred.splice(i,1)[0].resolve();},
    resolveFirst(url){const i=deferred.findIndex(item=>item.url===url);if(i>=0)deferred.splice(i,1)[0].resolve();},
    resolve(url){for(let i=deferred.length-1;i>=0;i--)if(url===undefined||deferred[i].url===url)deferred.splice(i,1)[0].resolve();},
    tick(now){const pending=[...rafs.values()];rafs.clear();pending.forEach(fn=>fn(now));},
    restore(){for(const [key,descriptor]of originals)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}
  };
}

test('cold fragment survives enhancement; nested cards remain accessible before final headline',async()=>{
  const env=environment({hash:'#beat-1'});
  try{
    const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
    assert.equal(env.wrapper.dataset.islandState,'drawn');assert.equal(scrollY,900);
    assert.equal(env.lines[2].style.visibility,'hidden');
    assert.equal(env.beats[2].inert,false);assert.equal(env.cards[0].inert,false);
    assert.ok(env.draws>0);assert.ok(env.bitmaps.filter(b=>!b.closed).length<=2);
    location.hash='#card-a';window.dispatchEvent(new Event('hashchange'));env.tick(10);await env.drain();
    assert.ok(Math.abs(scrollY-720)<1e-8);assert.equal(document.activeElement,null,'history does not steal focus');
    const before=scrollY;location.hash='#%E0%A4%A';window.dispatchEvent(new Event('popstate'));env.tick(20);assert.equal(scrollY,before);
    dispose();assert.equal(env.rafs.size,0);assert.equal(env.listenerCount,0);assert.ok(env.stage.children[0].removed);
    assert.equal(env.beats[2].getAttribute('aria-hidden'),null);assert.equal(env.beats[2].inert,false);
    const count=env.requests.length;window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('pageshow'));await env.drain();assert.equal(env.requests.length,count);
  }finally{env.restore();}
});

test('the first frame reuses an exact native still when its browser request is available', async () => {
  const opening = 'https://example.test/landscape/0';
  for (const variant of ['matching', 'unselected', 'responsive', 'picture', 'different', 'broken', 'lazy']) {
    const env = environment();
    try {
      let decoded = 0;
      const unselected = ['unselected', 'responsive', 'picture'].includes(variant);
      const reusesStill = variant === 'matching' || variant === 'unselected';
      Object.assign(env.still, {
        currentSrc: unselected ? '' : variant === 'different' ? 'https://example.test/portrait/0' : opening,
        src: opening,
        srcset: variant === 'responsive' ? 'other.webp 2x' : '',
        parentElement: { localName: variant === 'picture' ? 'picture' : 'p' },
        loading: variant === 'lazy' ? 'lazy' : 'eager',
        complete: false,
        async decode() {
          decoded++;
          if (variant === 'broken') throw new Error('The native image failed to decode');
          this.currentSrc = opening;
        },
      });
      const decodeBitmap = createImageBitmap;
      globalThis.createImageBitmap = input => decodeBitmap(input.currentSrc ?? input);
      const dispose = mountCinematicFilm({ element: env.stage, film: env.film });
      await env.drain();
      assert.equal(env.wrapper.dataset.islandState, 'drawn', variant);
      assert.equal(env.drawnURLs[0], opening, variant);
      assert.equal(decoded, Number(reusesStill || variant === 'broken'), variant);
      assert.equal(env.requests.includes(opening), !reusesStill, variant);
      dispose();
    } finally { env.restore(); }
  }
});

test('default cover keeps opaque canvas and original focal crop without clearing',async()=>{
 const env=environment({imageSize:[10,20]});
 try{
  env.film.decodedByteLimit=1600;env.film.focus=[.25,.75];
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  assert.deepEqual(env.contextOptions,[{alpha:false}]);
  assert.ok(env.paintOperations.every(operation=>operation.kind==='draw'));
  assert.deepEqual(env.paintOperations[0].rect,[0,-750,800,1600]);
  dispose();
 }finally{env.restore();}
});

test('reduced motion, printing and pagehide release pixels; returning can acquire again',async()=>{
  const env=environment();
  try{
    const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
    document.documentElement.dataset.motion='reduce';document.dispatchEvent(new Event('motion-preference'));await env.drain();
    assert.equal(env.wrapper.dataset.islandState,'still');assert.ok(env.bitmaps.every(b=>b.closed));assert.equal(env.rafs.size,0);
    const stopped=env.requests.length;window.dispatchEvent(new Event('resize'));await env.drain();assert.equal(env.requests.length,stopped);
    document.documentElement.dataset.motion='allow';document.dispatchEvent(new Event('motion-preference'));await env.drain();assert.equal(env.wrapper.dataset.islandState,'drawn');
    window.dispatchEvent(new Event('beforeprint'));assert.equal(env.wrapper.dataset.islandState,'still');assert.ok(env.bitmaps.every(b=>b.closed));
    window.dispatchEvent(new Event('afterprint'));await env.drain();assert.equal(env.wrapper.dataset.islandState,'drawn');
    window.dispatchEvent(new Event('pagehide'));assert.ok(env.bitmaps.every(b=>b.closed));
    window.dispatchEvent(new Event('pageshow'));await env.drain();assert.ok(env.bitmaps.some(b=>!b.closed));
    dispose();assert.ok(env.bitmaps.every(b=>b.closed));
  }finally{env.restore();}
});

test('late decode after disposal closes its pixels and never enhances the native page',async()=>{
  const env=environment({defer:true});
  try{
    const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();dispose();env.resolve();await env.drain();
    assert.equal(env.draws,0);assert.ok(env.bitmaps.every(b=>b.closed));assert.notEqual(env.wrapper.dataset.islandState,'drawn');assert.equal(env.rafs.size,0);
  }finally{env.restore();}
});

test('oversized text keeps native storyboard rather than clipping the enhanced stage',async()=>{
  const env=environment({overflow:true});
  try{
    const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
    assert.equal(env.wrapper.dataset.islandState,'still');assert.equal(env.beats[2].inert,false);assert.ok(env.bitmaps.every(b=>b.closed));dispose();
  }finally{env.restore();}
});

test('orientation swap releases old variant and preserves occupied progress without pulling back from the footer',async()=>{
  const env=environment({hash:'#beat-1'});
  try{
    const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
    const first=[...env.bitmaps];innerWidth=400;innerHeight=800;window.dispatchEvent(new Event('resize'));env.tick(20);await env.drain();
    assert.equal(scrollY,1200);assert.ok(first.every(bitmap=>bitmap.closed));assert.ok(env.requests.some(url=>url.includes('/portrait/')));
    scrollY=2600;window.dispatchEvent(new Event('scroll'));innerHeight=700;window.dispatchEvent(new Event('resize'));env.tick(40);await env.drain();
    assert.equal(scrollY,2600);dispose();
  }finally{env.restore();}
});

test('all missing frames and a single over-budget frame leave complete native content',async()=>{
  for(const condition of ['missing','oversized']){
    const env=environment();
    try{
      if(condition==='missing')globalThis.fetch=async()=>({ok:false});else env.film.decodedByteLimit=399;
      const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
      assert.notEqual(env.wrapper.dataset.islandState,'drawn');assert.equal(env.rafs.size,0);
      assert.ok(env.beats.every(beat=>!beat.inert));assert.ok(env.bitmaps.every(bitmap=>bitmap.closed));dispose();
    }finally{env.restore();}
  }
});


test('authored heading retains its identity and original text nodes through mount and disposal',async()=>{
  const env=environment({authoredTitle:true});
  try{
    const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
    assert.equal(env.heading.tagName,'H1');assert.equal(env.heading.id,'authored-heading');
    assert.equal(env.heading.children[0].tagName,'SPAN');assert.equal(env.heading.children[0].children[0],env.titleText);
    assert.equal(env.heading.children[0].getAttribute('data-film-line'),'');assert.equal(env.titleEm.getAttribute('data-film-line'),'');
    dispose();assert.deepEqual(env.heading.children,[env.titleText,env.titleEm]);assert.equal(env.titleEm.getAttribute('data-film-line'),'authored');
  }finally{env.restore();}
});

test('fit guard allows visible font ink but rejects off-stage text and colliding card regions',async()=>{
  for(const kind of ['ink','outside','overlap']){
    const env=environment();
    try{
      env.lines[2].scrollHeight=106;
      document.createRange=()=>({selectNodeContents(node){this.node=node;},getClientRects(){
        const box=this.node.getBoundingClientRect();
        return [{...box,bottom:box.bottom+(this.node===env.lines[2]?(kind==='outside'?200:6):0)}];
      }});
      if(kind==='overlap')env.cards[1].getBoundingClientRect=()=>({top:450,bottom:550,left:0,right:300,width:300,height:100});
      const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
      assert.equal(env.wrapper.dataset.islandState,kind==='ink'?'drawn':'still');dispose();
    }finally{env.restore();}
  }
});


test('fragment-focused scene containers fade on later scroll while focused controls stay visible',async()=>{
  const env=environment();
  try{
    const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
    env.beats[0].focus();scrollY=900;window.dispatchEvent(new Event('scroll'));
    for(let i=1;i<=60;i++){env.tick(i*50);await env.drain();}
    assert.equal(env.lines[0].style.visibility,'hidden','focusing the scene must not pin its old title');
    env.lines[0].matches=()=>true;env.lines[0].focus();env.wrapper.dispatchEvent(new Event('focusin'));
    assert.equal(env.lines[0].style.visibility,'visible','an actual focused control retains visibility');
    assert.equal(env.beats[0].inert,false);dispose();
  }finally{env.restore();}
});


test('three source line groups settle fully including the combined premise and action',()=>{
  const settled=[0,1,2].map(index=>filmLineVisibility(1,index,1.25,.12));
  assert.deepEqual(settled,[1,1,1]);
  assert.ok(filmLineVisibility(1,3,1.25,.12)<1,'a fourth independently staggered CTA would remain faded');
});

test('late font metrics restore readable fallback without waiting for viewport resize',async()=>{
 const env=environment();
 try {
  document.fonts=new EventTarget();
  const dispose=mountCinematicFilm({element:env.stage,film:env.film}); await env.drain();
  assert.equal(env.wrapper.dataset.islandState,'drawn');
  env.lines[2].getBoundingClientRect=()=>({top:400,bottom:750,left:0,right:800,width:800,height:350});
  document.fonts.dispatchEvent(new Event('loadingdone')); await env.drain(); env.tick(50);
  assert.equal(env.wrapper.dataset.islandState,'still','late font extent must not leave off-stage text clipped');
  window.dispatchEvent(new Event('resize')); await env.drain();
  assert.equal(env.wrapper.dataset.islandState,'still','same extent is rejected when actual fit check runs');
  dispose();
 } finally {env.restore();}
});

test('print completion restores occupied continuous progress',async()=>{
 const env=environment();
 try {
  const dispose=mountCinematicFilm({element:env.stage,film:env.film}); await env.drain();
  scrollY=630;window.dispatchEvent(new Event('scroll'));
  for(let i=1;i<=80;i++){env.tick(i*50);await env.drain();}
  const before=scrollY;
  window.dispatchEvent(new Event('beforeprint'));window.dispatchEvent(new Event('afterprint'));await env.drain();
  assert.equal(before,630);assert.equal(scrollY,before);
  dispose();
 }finally{env.restore();}
});

test('resolved fonts promise after disposal cannot restart enhancement',async()=>{
 const env=environment();let ready;
 try{
  document.fonts=new EventTarget();document.fonts.ready=new Promise(resolve=>ready=resolve);
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();dispose();
  const count=env.requests.length,position=scrollY;ready();document.fonts.dispatchEvent(new Event('loadingdone'));await env.drain();
  assert.equal(env.requests.length,count);assert.equal(scrollY,position);assert.equal(env.rafs.size,0);
 }finally{env.restore();}
});

test('newer native navigation supersedes pending print restoration',async()=>{
 const env=environment();const pending=[];
 try{
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  scrollY=630;window.dispatchEvent(new Event('scroll'));
  for(let i=1;i<=80;i++){env.tick(i*50);await env.drain();}
  window.dispatchEvent(new Event('beforeprint'));
  const decode=createImageBitmap;
  globalThis.createImageBitmap=async url=>{await new Promise(resolve=>pending.push(resolve));return decode(url);};
  window.dispatchEvent(new Event('afterprint'));await env.drain();
  location.hash='#beat-2';window.dispatchEvent(new Event('hashchange'));env.tick(5000);await env.drain();
  assert.equal(scrollY,1200,'native storyboard moved to requested beat');
  pending.splice(0).forEach(resolve=>resolve());await env.drain();
  assert.equal(location.hash,'#beat-2');assert.equal(scrollY,1800,'new destination owns the enhanced position');
  dispose();pending.splice(0).forEach(resolve=>resolve());await env.drain();
 }finally{env.restore();}
});


test('stage position exposes departure at the sticky boundary and reverses without changing scroll',async()=>{
  const env=environment();
  try{
    const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
    assert.equal(env.wrapper.getAttribute('data-film-position'),'pinned');
    for(const [position,expected] of [[-50,'before'],[1800,'pinned'],[1801,'leaving'],[2399,'leaving'],[2400,'after'],[1800,'pinned'],[0,'pinned']]){
      scrollY=position;window.dispatchEvent(new Event('scroll'));await env.drain();
      assert.equal(env.wrapper.getAttribute('data-film-position'),expected);assert.equal(scrollY,position);
    }
    dispose();assert.equal(env.wrapper.getAttribute('data-film-position'),null);
    scrollY=1900;window.dispatchEvent(new Event('scroll'));assert.equal(env.wrapper.getAttribute('data-film-position'),null);
  }finally{env.restore();}
});

test('departure hook follows actual sticky height and native viewport, clears for print and restores on cleanup',async()=>{
  const env=environment();
  try{
    env.wrapper.setAttribute('data-film-position','owner-state');
    const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
    env.stage.getBoundingClientRect=()=>({top:0,bottom:550,left:0,right:800,width:800,height:550});
    scrollY=1801;window.dispatchEvent(new Event('scroll'));assert.equal(env.wrapper.getAttribute('data-film-position'),'pinned');
    scrollY=1851;window.dispatchEvent(new Event('scroll'));assert.equal(env.wrapper.getAttribute('data-film-position'),'leaving');
    window.dispatchEvent(new Event('beforeprint'));assert.equal(env.wrapper.getAttribute('data-film-position'),'owner-state');
    window.dispatchEvent(new Event('afterprint'));await env.drain();assert.equal(env.wrapper.getAttribute('data-film-position'),'after','offscreen native flow exposes departure without claiming a pinned stage');
    window.dispatchEvent(new Event('wheel'));scrollY=600;window.dispatchEvent(new Event('scroll'));await env.drain();assert.equal(env.wrapper.getAttribute('data-film-position'),'pinned');
    document.documentElement.dataset.motion='reduce';document.dispatchEvent(new Event('motion-preference'));
    assert.equal(env.wrapper.getAttribute('data-film-position'),'pinned');
    dispose();assert.equal(env.wrapper.getAttribute('data-film-position'),'owner-state');
  }finally{env.restore();}
});


test('exponential film response matches source 60Hz lerp and is frame-rate independent',()=>{
 const physics={response:'exponential',damping:-60*Math.log(.88),snapTolerance:.0003,stepLimit:.05};
 assert.ok(Math.abs(advanceFilm(0,10,1/60,physics)-1.2)<1e-12);
 const run=hz=>{let head=0;for(let i=0;i<hz/2;i++)head=advanceFilm(head,10,1/hz,physics);return head;};
 assert.ok(Math.abs(run(60)-run(120))<1e-12);
 for(const [head,target] of [[0,10],[10,0],[4,4],[9.9998,10],[.0002,0]]){
  const next=advanceFilm(head,target,1/60,physics);assert.ok(next>=Math.min(head,target)&&next<=Math.max(head,target));
 }
 assert.equal(advanceFilm(9.9998,10,1/60,physics),10);
 assert.equal(advanceFilm(.0002,0,1/60,physics),0);
 assert.equal(advanceFilm(4,10,-1,physics),4);
 assert.equal(advanceFilm(4,10,100,physics),advanceFilm(4,10,.05,physics));
});

test('scroll copy clock reveals and reverses immediately while the film head remains damped',async()=>{
 for(const clock of ['scroll','head']){
  const env=environment({tokens:{'--film-scrub-damping':-60*Math.log(.88),'--film-minimum-rate':undefined,'--film-catchup-rate':undefined}});
  try{
   Object.assign(env.film,{response:'exponential',snapTolerance:.0003,copyClock:clock});
   const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
   scrollY=1800;window.dispatchEvent(new Event('scroll'));env.tick(1000);await env.drain();
   assert.equal(env.lines[2].style.visibility,clock==='scroll'?'visible':'hidden');
   assert.ok(env.drawnURLs.at(-1).endsWith('/0'),'first tick still paints the old playhead');
   for(let i=1;i<=70;i++){env.tick(1000+i*50);await env.drain();}
   assert.equal(env.lines[2].style.visibility,'visible');
   scrollY=0;window.dispatchEvent(new Event('scroll'));env.tick(4510);await env.drain();
   assert.equal(env.lines[0].style.visibility,clock==='scroll'?'visible':'hidden');
   dispose();
  }finally{env.restore();}
 }
});

test('response and copy options validate before enhancement; unused damping is not required',async()=>{
 for(const invalid of [{response:'spring'},{copyClock:'wall'},{entryBeat:-1},{entryBeat:3},{entryBeat:1.5},{response:'exponential',snapTolerance:.0003},{response:'exponential',snapTolerance:0}]){
  const env=environment();try{Object.assign(env.film,invalid);const result=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();assert.equal(result,undefined);assert.equal(env.requests.length,0);}finally{env.restore();}
 }
 const env=environment({tokens:{'--film-scrub-damping':'invalid'}});
 try{const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();assert.equal(env.wrapper.dataset.islandState,'drawn');dispose();}finally{env.restore();}
});

test('fit checks resting line extents then restores the current entrance transforms',async()=>{
 const env=environment();
 try{
  document.fonts=new EventTarget();let base=550;
  env.lines[2].getBoundingClientRect=()=>{
   const transform=env.lines[2].style.transform??'';
   const shift=transform==='none'?0:Number(/translate3d\(0,([^p]+)px/.exec(transform)?.[1]??0);
   return{top:base+shift,bottom:base+40+shift,left:0,right:800,width:800,height:40};
  };
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  const transform=env.lines[2].style.transform;assert.match(transform,/18px/);
  document.fonts.dispatchEvent(new Event('loadingdone'));await env.drain();
  assert.equal(env.wrapper.dataset.islandState,'drawn');assert.equal(env.lines[2].style.transform,transform);
  base=620;document.fonts.dispatchEvent(new Event('loadingdone'));await env.drain();
  assert.equal(env.wrapper.dataset.islandState,'still','real resting overflow still selects complete native flow');dispose();
 }finally{env.restore();}
});

test('optional entry beat routes cold main fragment and native skip focus to readable content',async()=>{
 for(const hash of ['','#main']){
  const env=environment({hash});
  try{
   env.film.entryBeat=2;const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
   if(hash)assert.equal(scrollY,1800);
   else{env.main.focus();env.main.dispatchEvent(new Event('focus'));env.tick(20);await env.drain();assert.equal(scrollY,1800);assert.equal(document.activeElement,env.main);}
   assert.equal(env.lines[2].style.visibility,'visible');assert.equal(env.beats[2].inert,false);
   scrollY=100;env.lines[0].focus();env.main.dispatchEvent(new Event('focus'));env.tick(40);assert.equal(scrollY,100,'descendant controls cannot be redirected');
   dispose();
  }finally{env.restore();}
 }
});

test('later scene controllers do not compete for the opening scene’s main entry',async()=>{
 for(const hash of ['','#main']){
  const env=environment({hash});
  try{
   env.film.entryBeat=2;
   const first=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
   const Node=env.stage.constructor,wrapper=new Node(),story=new Node(),stage=new Node(),beat=new Node('later-beat');
   wrapper.dataset={};wrapper.queries={'.cinematic-story':[story]};wrapper.append(story);wrapper.append(stage);
   stage.closest=()=>wrapper;stage.getBoundingClientRect=()=>({top:0,bottom:600,left:0,right:800,width:800,height:600});
   wrapper.getBoundingClientRect=()=>({top:3000-scrollY,bottom:5400-scrollY,left:0,right:800,width:800,height:2400});
   beat.scrollIntoView=()=>window.scrollTo({top:3000});
   story.queries={'.cinematic-beat':[beat],'.cinematic-card':[],'.cinematic-frames--landscape a[href]':
    Array.from({length:3},(_,i)=>({href:`https://example.test/later/${i}`}))};
   story.queries['.cinematic-frames--portrait a[href]']=story.queries['.cinematic-frames--landscape a[href]'];story.append(beat);
   const later=mountCinematicFilm({element:stage,film:{...env.film,entryBeat:undefined,windows:[[-1,-1]],cards:[],rests:[0]}});
   await env.drain();
   env.main.focus();env.main.dispatchEvent(new Event('focus'));env.tick(20);await env.drain();
   assert.equal(scrollY,1800);assert.equal(document.activeElement,env.main);
   assert.ok(!env.requests.some(url=>url.includes('/later/')),'offscreen scene stays inactive after main focus');
   later();first();assert.equal(env.listenerCount,0);
  }finally{env.restore();}
 }
});


test('native fallback preserves the selected copy clock while the film head lags',async()=>{
 for(const copyClock of ['scroll','head']){
  const env=environment({tokens:{'--film-scrub-damping':-60*Math.log(.88)}});
  try{
   Object.assign(env.film,{response:'exponential',snapTolerance:.0003,copyClock});
   const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
   scrollY=1800;window.dispatchEvent(new Event('scroll'));env.tick(1000);await env.drain();
   assert.equal(env.lines[2].style.visibility,copyClock==='scroll'?'visible':'hidden');
   document.documentElement.dataset.motion='reduce';document.dispatchEvent(new Event('motion-preference'));await env.drain();
   assert.equal(env.wrapper.dataset.islandState,'still');
   assert.equal(scrollY,copyClock==='scroll'?1200:0,'native flow preserves the copy being shown, not a different clock');
   assert.ok(env.bitmaps.every(bitmap=>bitmap.closed));dispose();
  }finally{env.restore();}
 }
});


test('cold reduced flow exposes departure and reversal with a hidden mount and no acquisition',async()=>{
 const env=environment();
 try{
  document.documentElement.dataset.motion='reduce';
  env.stage.getBoundingClientRect=()=>({top:0,bottom:0,left:0,right:0,width:0,height:0});
  env.wrapper.setAttribute('data-film-position','owner-state');
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  for(const [position,expected]of [[0,'pinned'],[1200,'pinned'],[1201,'leaving'],[1799,'leaving'],[1800,'after'],[1200,'pinned'],[-10,'before']]){
   scrollY=position;window.dispatchEvent(new Event('scroll'));await env.drain();
   assert.equal(env.wrapper.getAttribute('data-film-position'),expected);assert.equal(scrollY,position);
  }
  assert.equal(env.requests.length,0);assert.equal(env.rafs.size,0);
  window.dispatchEvent(new Event('beforeprint'));assert.equal(env.wrapper.getAttribute('data-film-position'),'owner-state');
  scrollY=1800;window.dispatchEvent(new Event('scroll'));assert.equal(env.wrapper.getAttribute('data-film-position'),'owner-state');
  window.dispatchEvent(new Event('afterprint'));await env.drain();assert.equal(env.wrapper.getAttribute('data-film-position'),'after');
  dispose();assert.equal(env.wrapper.getAttribute('data-film-position'),'owner-state');
  scrollY=0;window.dispatchEvent(new Event('scroll'));assert.equal(env.wrapper.getAttribute('data-film-position'),'owner-state');assert.equal(env.requests.length,0);
 }finally{env.restore();}
});

test('cold explicit entry survives an initial viewport-fit fallback',async()=>{
 for(const hash of ['#main','#beat-2']){
  const env=environment({hash,overflow:true});
  try{
   Object.assign(env.film,{entryBeat:2,copyClock:'scroll'});
   const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
   assert.equal(env.wrapper.dataset.islandState,'still');
   assert.equal(scrollY,1200,'requested arrival remains the native destination when enhancement cannot fit');
   assert.equal(env.beats[2].inert,false);assert.equal(env.beats[2].getAttribute('aria-hidden'),null);
   assert.ok(env.bitmaps.every(bitmap=>bitmap.closed));assert.equal(env.rafs.size,0);dispose();
  }finally{env.restore();}
 }
});


test('activated native heading retains focus until blur and restores its authored tabindex',async()=>{
 for(const authored of [null,'0']){
  const env=environment({authoredTitle:true});
  try{
   if(authored!==null)env.heading.setAttribute('tabindex',authored);
   env.heading.matches=()=>true;
   const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
   const link={href:'https://example.test/#authored-heading',target:'',hasAttribute:()=>false,closest(){return this;}};
   const event=new Event('click',{cancelable:true});Object.defineProperties(event,{target:{value:link},button:{value:0}});
   env.wrapper.dispatchEvent(event);
   assert.ok(event.defaultPrevented);assert.equal(location.hash,'#authored-heading');
   assert.equal(document.activeElement,env.heading);assert.equal(env.heading.getAttribute('tabindex'),'-1');
   scrollY=900;window.dispatchEvent(new Event('scroll'));
   for(let i=1;i<=60;i++){env.tick(i*50);await env.drain();}
   assert.equal(env.heading.children[0].style.visibility,'hidden','a navigation-focused heading must not pin the old scene');
   env.heading.dispatchEvent(new Event('blur'));assert.equal(env.heading.getAttribute('tabindex'),authored);
   const again=new Event('click',{cancelable:true});Object.defineProperties(again,{target:{value:link},button:{value:0}});
   env.wrapper.dispatchEvent(again);assert.equal(env.heading.getAttribute('tabindex'),'-1');
   dispose();assert.equal(env.heading.getAttribute('tabindex'),authored);
  }finally{env.restore();}
 }
});


test('departing copy clears the actual masthead without changing the film position or clock',async()=>{
 const env=environment();try{
  env.wrapper.style.setProperty('--film-copy-clip','owner-value');
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-clip'),'0px');
  scrollY=1950;window.dispatchEvent(new Event('scroll'));
  assert.equal(env.wrapper.getAttribute('data-film-position'),'leaving');
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-clip'),'210px');
  assert.equal(scrollY,1950,'measuring departure must not move the reader');
  scrollY=1800;window.dispatchEvent(new Event('scroll'));
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-clip'),'0px','reversal restores the uncut pinned composition');
  window.dispatchEvent(new Event('beforeprint'));
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-clip'),'');
  dispose();assert.equal(env.wrapper.style.getPropertyValue('--film-copy-clip'),'owner-value');
 }finally{env.restore();}
});

test('newly reached clipped action returns to its own rest; existing focus cannot trap departure',async()=>{
 const env=environment();try{
  env.film.copyClock='scroll';
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  const action=env.cards[0];action.matches=selector=>selector.includes('a[href]');
  action.getBoundingClientRect=()=>({top:100+Math.min(0,1800-scrollY),bottom:200+Math.min(0,1800-scrollY)});
  scrollY=1950;window.dispatchEvent(new Event('scroll'));env.tick(20);await env.drain();
  assert.equal(action.style.opacity,'0','partly departing invitation leaves as a whole');
  assert.equal(action.inert,false,'outgoing native link remains keyboard reachable');
  assert.equal(action.style.pointerEvents,'none','invisible card cannot intercept the masthead');
  action.focus();
  const focus=new Event('focusin');Object.defineProperty(focus,'target',{value:action});env.wrapper.dispatchEvent(focus);
  assert.equal(document.activeElement,action,'keep the native action focused');
  assert.equal(action.style.opacity,'1','the own rest restores the complete invitation');
  assert.ok(Math.abs(scrollY-720)<1,'return to this card’s first fully revealed rest');
  scrollY=1950;window.dispatchEvent(new Event('scroll'));env.tick(50);await env.drain();
  assert.equal(scrollY,1950,'deliberate departure remains free while the same link is focused');
  dispose();
 }finally{env.restore();}
});


test('native focus restores a hidden whole card even when its padded link itself clears the masthead',async()=>{
 const env=environment();try{
  env.film.copyClock='scroll';
  const card=env.cards[0];
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  card.getBoundingClientRect=()=>({top:100+Math.min(0,1800-scrollY),bottom:200+Math.min(0,1800-scrollY)});
  const action={matches:()=>true,getBoundingClientRect:()=>({top:120+Math.min(0,1800-scrollY),bottom:145+Math.min(0,1800-scrollY)})};
  card.append(action);document.activeElement=action;
  scrollY=1850;window.dispatchEvent(new Event('scroll'));env.tick(20);await env.drain();
  assert.equal(action.getBoundingClientRect().top,70);assert.equal(card.style.opacity,'0');
  const focus=new Event('focusin');Object.defineProperty(focus,'target',{value:action});env.wrapper.dispatchEvent(focus);
  assert.equal(document.activeElement,action);assert.ok(Math.abs(scrollY-720)<1);assert.equal(card.style.opacity,'1');
  dispose();
 }finally{env.restore();}
});


function activateFilmLink(env, id, detail=1) {
 const link={href:`https://example.test/#${id}`,target:'',hasAttribute:()=>false,closest(){return this;}};
 document.activeElement=link;
 const event=new Event('click',{cancelable:true});
 Object.defineProperties(event,{target:{value:link},button:{value:0},detail:{value:detail}});
 env.wrapper.dispatchEvent(event);return {event,link};
}

test('pointer scene action travels through the edit, commits its address at once and focuses only at arrival',async()=>{
 const env=environment();try{
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  const {event,link}=activateFilmLink(env,'beat-1');
  assert.ok(event.defaultPrevented);assert.equal(location.hash,'#beat-1');assert.equal(scrollY,0);assert.equal(document.activeElement,link);
  env.tick(1000);env.tick(1500);await env.drain();
  assert.equal(scrollY,450,'intermediate action position remains between the rests');
  assert.notEqual(document.activeElement,env.beats[1],'do not focus an inert destination during travel');
  for(let i=0;i<100;i++){env.tick(2000+i*50);await env.drain();}
  assert.equal(scrollY,900);assert.equal(document.activeElement,env.beats[1]);assert.equal(env.lines[1].style.visibility,'visible');
  assert.equal(env.rafs.size,0,'the settled edit stops work');dispose();
 }finally{env.restore();}
});

test('a later action reverses from the current position without jumping or queuing',async()=>{
 const env=environment();try{
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  activateFilmLink(env,'beat-2');env.tick(1000);env.tick(1400);await env.drain();
  const from=scrollY;assert.ok(from>0&&from<1800);
  activateFilmLink(env,'beat-0');assert.equal(scrollY,from);env.tick(1500);env.tick(1750);await env.drain();
  assert.ok(scrollY<from&&scrollY>0,'reversal advances from the current position');
  for(let i=0;i<100;i++){env.tick(2500+i*50);await env.drain();}
  assert.equal(scrollY,0);assert.equal(location.hash,'#beat-0');assert.equal(document.activeElement,env.beats[0]);assert.equal(env.rafs.size,0);dispose();
 }finally{env.restore();}
});

test('native user input and changed focus cancel action travel without pulling the reader back',async()=>{
 for(const input of ['wheel','touchstart','pointerdown','keydown','focusin']){
  const env=environment();try{
   const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
   activateFilmLink(env,'beat-2');env.tick(1000);env.tick(1250);await env.drain();
   const event=new Event(input);if(input==='keydown')Object.defineProperty(event,'key',{value:'PageUp'});
   if(input==='focusin'){const elsewhere={};document.activeElement=elsewhere;Object.defineProperty(event,'target',{value:elsewhere});document.dispatchEvent(event);}else window.dispatchEvent(event);
   scrollY=200;window.dispatchEvent(new Event('scroll'));
   for(let i=0;i<100;i++){env.tick(2000+i*50);await env.drain();}
   assert.equal(scrollY,200,input);assert.notEqual(document.activeElement,env.beats[2]);assert.equal(env.rafs.size,0);dispose();
  }finally{env.restore();}
 }
});

test('keyboard, native hash recovery and reduced flow keep immediate arrivals',async()=>{
 for(const mode of ['keyboard','hash','reduced','missing-token']){
  const env=environment({tokens:mode==='missing-token'?{'--film-navigation-duration':''}:{}});try{
   if(mode==='reduced')document.documentElement.dataset.motion='reduce';
   const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
   if(mode==='hash'){activateFilmLink(env,'beat-1');env.tick(1000);env.tick(1200);location.hash='#beat-2';window.dispatchEvent(new Event('hashchange'));env.tick(1300);await env.drain();}
   else activateFilmLink(env,'beat-2',mode==='keyboard'?0:1);
   assert.equal(scrollY,mode==='reduced'?1200:1800,mode);
   if(mode!=='hash')assert.equal(document.activeElement,env.beats[2]);
   for(let i=0;i<100;i++){env.tick(2000+i*50);await env.drain();}
   assert.equal(scrollY,mode==='reduced'?1200:1800);dispose();
  }finally{env.restore();}
 }
});


test('layout, visibility and preference changes never resume a superseded action trip',async()=>{
 for(const mode of ['resize','hidden','reduced','dispose']){
  const env=environment();try{
   const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
   activateFilmLink(env,'beat-2');env.tick(1000);env.tick(1250);await env.drain();
   if(mode==='resize')window.dispatchEvent(new Event('resize'));
   if(mode==='hidden'){document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));}
   if(mode==='reduced'){document.documentElement.dataset.motion='reduce';document.dispatchEvent(new Event('motion-preference'));assert.equal(scrollY,1200,'reduced form arrives at the requested native still');assert.equal(document.activeElement,env.beats[2],'unmoved focus follows the complete reduced arrival');}
   if(mode==='dispose')dispose();
   const stopped=scrollY;
   for(let i=0;i<100;i++){env.tick(2000+i*50);await env.drain();}
   assert.equal(scrollY,stopped,mode);assert.equal(env.rafs.size,0);
   if(mode==='hidden'){document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await env.drain();}
   if(mode==='reduced'){document.documentElement.dataset.motion='allow';document.dispatchEvent(new Event('motion-preference'));await env.drain();assert.equal(scrollY,1800);}
   if(mode!=='dispose')dispose();
  }finally{env.restore();}
 }
});


test('hashless traversal snaps copy to native restored geometry without replacing history or scroll',async()=>{
 const env=environment();try{
  const other={'gazette:return-focus':{kind:'search',query:'a query'},foreign:{untouched:true}};
  history.state=other;history.replaceState=()=>assert.fail('film must not replace history state');
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  activateFilmLink(env,'beat-2',0);assert.equal(env.lines[0].style.visibility,'hidden');
  for(let pass=0;pass<2;pass++){
   // The browser restores its own entry and geometry; the film observes both.
   location.hash='';history.state=other;scrollY=0;document.activeElement=document.body;
   let scrollWrites=0;const scroll=window.scrollTo;window.scrollTo=()=>{scrollWrites++;};
   window.dispatchEvent(new Event('popstate'));window.dispatchEvent(new Event('hashchange'));env.tick(1000+pass*100);await env.drain();
   assert.equal(scrollY,0);assert.equal(scrollWrites,0);assert.equal(env.lines[0].style.visibility,'visible');assert.equal(env.lines[2].style.visibility,'hidden');
   assert.deepEqual(history.state,other,'unrelated state remains native and untouched');
   window.scrollTo=scroll;location.hash='#beat-2';window.dispatchEvent(new Event('popstate'));env.tick(1050+pass*100);assert.equal(scrollY,1800,'Forward retains immediate fragment recovery');
  }
  dispose();
 }finally{env.restore();}
});

test('action travel creates only its native fragment entry and never a predecessor pose field',async()=>{
 const env=environment();try{
  const source={'gazette:return-focus':{query:'keep me'},foreign:'keep'};history.state=source;
  history.replaceState=()=>assert.fail('no custom predecessor state');
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  activateFilmLink(env,'beat-2');assert.equal(history.state,null);assert.deepEqual(source,{'gazette:return-focus':{query:'keep me'},foreign:'keep'});
  env.tick(1000);env.tick(1500);assert.equal(scrollY,900,'pointer travel remains active');dispose();
 }finally{env.restore();}
});

test('fresh input or control focus supersedes a queued traversal snap; neutral body focus does not',async()=>{
 for(const input of ['body','control','wheel']){
  const env=environment();try{
   const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();activateFilmLink(env,'beat-2',0);
   location.hash='';scrollY=0;window.dispatchEvent(new Event('popstate'));
   const focus=input==='control'?{control:true}:document.body;document.activeElement=focus;
   if(input==='wheel')window.dispatchEvent(new Event('wheel'));
   else{const event=new Event('focusin');Object.defineProperty(event,'target',{value:focus});document.dispatchEvent(event);}
   env.tick(1000);await env.drain();assert.equal(scrollY,0);assert.equal(document.activeElement,focus);
   assert.equal(env.lines[0].style.visibility,input==='body'?'visible':'hidden','only an untouched traversal snaps the visual edit');dispose();
  }finally{env.restore();}
 }
});

test('BFCache traversal reconciles native pose but ordinary pageshow does not claim a traversal',async()=>{
 for(const persisted of [false,true]){
  const env=environment();try{
   const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();activateFilmLink(env,'beat-2',0);
   location.hash='';scrollY=0;document.activeElement=document.body;
   const event=new Event('pageshow');Object.defineProperty(event,'persisted',{value:persisted});window.dispatchEvent(event);env.tick(1000);await env.drain();
   assert.equal(scrollY,0);assert.equal(env.lines[0].style.visibility,persisted?'visible':'hidden');dispose();
  }finally{env.restore();}
 }
});


test('transparent cover repaints empty pixels on entry and reversal without frame persistence',async()=>{
 const env=environment({imageSize:[10,20]});
 try{
  env.film.transparent=true;env.film.decodedByteLimit=1600;
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  assert.deepEqual(env.contextOptions,[{alpha:true}]);
  for(const fragment of ['#beat-2','#beat-0']){
   location.hash=fragment;window.dispatchEvent(new Event('hashchange'));env.tick(20);await env.drain();
  }
  assert.deepEqual(env.paintOperations[1].rect,[0,-500,800,1600],'cover retains its crop');
  env.paintOperations.forEach((operation,index)=>{if(operation.kind==='draw'){
   assert.equal(operation.alpha,1);assert.equal(env.paintOperations[index-1].kind,'clear');
  }});
  dispose();assert.ok(env.bitmaps.every(bitmap=>bitmap.closed));
 }finally{env.restore();}
});

test('initial gesture is bounded and ordered letters reverse with scroll, preserving whole-line timing',()=>{
 assert.equal(filmIntroProgress(0,2600,.12,3),0);
 assert.equal(filmIntroProgress(2600,2600,.12,3),.12);
 assert.equal(filmIntroProgress(9000,2600,.12,3),.12);
 assert.ok(filmIntroProgress(1300,2600,.12,3)>.06);
 const window=[.76,.1,.06];
 assert.equal(filmLetterVisibility(.76,0,20,window),0);
 assert.ok(filmLetterVisibility(.8,0,20,window)>0);
 assert.equal(filmLetterVisibility(.8,19,20,window),0);
 assert.equal(filmLetterVisibility(.95,19,20,window),1);
 assert.equal(filmLetterVisibility(.7,19,20,window),0);
});


test('prepared stages reserve geometry before decode and keep pre-entry work bounded without scrolling',async()=>{
 const env=environment({defer:true,tokens:{'--layout-scroll-scene-preload':1.2}});
 try{
  env.film.prepare=true;
  let offset=1000;
  env.wrapper.getBoundingClientRect=()=>({top:offset-scrollY,bottom:offset+2400-scrollY,left:0,right:800,width:800,height:2400});
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  assert.equal(env.wrapper.dataset.islandState,'preparing');assert.equal(env.wrapper.style.getPropertyValue('--film-distance'),'1800px');
  assert.equal(env.requests.length,1,'only first decode establishes exact capacity');assert.equal(scrollY,0);assert.equal(env.rafs.size,0);
  env.resolve();await env.drain();
  assert.equal(env.wrapper.dataset.islandState,'drawn');assert.equal(scrollY,0,'preparation never seeks a beat');assert.equal(env.rafs.size,0,'offscreen frames do not animate');
  assert.ok(env.requests.length<=2,'nearby decoded frames remain within budget');
  scrollY=1100;window.dispatchEvent(new Event('scroll'));env.tick(100);env.resolve();await env.drain();
  assert.equal(scrollY,1100,'first entry preserves the reader scroll position');
  scrollY=5000;window.dispatchEvent(new Event('scroll'));env.resolve();await env.drain();
  assert.ok(env.bitmaps.every(bitmap=>bitmap.closed),'outside preparation margin releases decoded images');
  dispose();
 }finally{env.restore();}
});

test('prepared stages retain complete native fallback for reduction, fit failure and failed decode',async()=>{
 for(const reason of ['reduce','fit','decode']){
  const env=environment({overflow:reason==='fit',tokens:{'--layout-scroll-scene-preload':1.2}});
  try{
   env.film.prepare=true;
   if(reason==='reduce')document.documentElement.dataset.motion='reduce';
   if(reason==='decode')globalThis.fetch=async()=>({ok:false});
   const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
   assert.notEqual(env.wrapper.dataset.islandState,'preparing');assert.notEqual(env.wrapper.dataset.islandState,'drawn');
   assert.equal(env.beats[2].inert,false);assert.equal(env.lines[2].getAttribute('style'),null);assert.equal(env.rafs.size,0);
   dispose();
  }finally{env.restore();}
 }
});

const choreographyTokens={
 '--scene-intro-duration':2600,'--scene-intro-share':.12,'--scene-intro-exponent':3,
 '--scene-title-lift':.06,'--scene-caption-lift':24,'--scene-caption-blur':6,
 '--scene-letter-blur':8,'--scene-ghost-travel':.14,
 '--material-scroll-scene-veil-start':.25,'--material-scroll-scene-veil-gain':.6,
 '--material-scroll-scene-ghost-opacity':.1
};

test('the automatic opening finishes its current decode before pursuing the latest frame',async()=>{
 const env=environment({tokens:{...choreographyTokens,'--scene-intro-share':.9},defer:true,frameCount:31});
 try{
  env.film.intro=true;
  env.film.windows=env.film.windows.map(()=>[-1,-1]);
  const requests=[];
  globalThis.fetch=async (url,{signal})=>{
   requests.push({url,signal});
   return {ok:true,blob:async()=>url};
  };
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});
  const first='https://example.test/landscape/0';
  await env.drain();env.resolve(first);await env.drain();
  let now=100;
  while(requests.length<2&&now<1000){env.tick(now+=16);await env.drain();}
  assert.equal(requests.length,2);
  const next=requests[1];
  while(now<2500){env.tick(now+=32);await env.drain();}
  assert.equal(next.signal.aborted,false);
  assert.equal(requests.length,2);
  env.resolve(next.url);await env.drain();
  assert.equal(env.drawnURLs.at(-1),next.url);
  assert.equal(requests.length,3);
  assert.ok(Number(requests[2].url.split('/').at(-1))>Number(next.url.split('/').at(-1)));
  dispose();env.resolve();await env.drain();
 }finally{env.restore();}
});

test('optional copy departure follows forward and reverse scroll, protects focus and restores author state',async()=>{
 const env=environment({tokens:choreographyTokens});
 try{
  env.film.choreography={departure:[.35,.55]};
  env.film.windows=env.film.windows.map(()=>[-1,-1]);
  env.wrapper.querySelector('.cinematic-story').queries['.cinematic-copy']=[env.beats[0]];
  env.wrapper.style.setProperty('--film-copy-opacity','.82');
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  let now=0;
  for(const [position,opacity] of [[0,1],[.45,.5],[.6,0],[.45,.5],[.2,1],[.6,0]]){
   scrollY=position*1800;window.dispatchEvent(new Event('scroll'));env.tick(now+=16);await env.drain();
   assert.ok(Math.abs(Number(env.wrapper.style.getPropertyValue('--film-copy-opacity'))-opacity)<1e-10);
  }
  env.lines[0].matches=()=>true;env.lines[0].focus();env.wrapper.dispatchEvent(new Event('focusin'));
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'1','focused native controls remain visible');
  document.activeElement=null;env.wrapper.dispatchEvent(new Event('focusout'));env.tick(now+=16);
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'0');
  dispose();assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'.82');
  assert.equal(env.rafs.size,0);assert.equal(env.listenerCount,0);
 }finally{env.restore();}
});

test('copy departure leaves complete native presentation in reduced motion, print and disposal',async()=>{
 for(const mode of ['cold-reduce','reduce','print','dispose']){
  const env=environment({tokens:choreographyTokens});
  try{
   env.film.choreography={departure:[.35,.55]};
   if(mode==='cold-reduce')document.documentElement.dataset.motion='reduce';
   const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
   if(mode==='cold-reduce')assert.equal(env.requests.length,0);
   else{
    scrollY=1080;window.dispatchEvent(new Event('scroll'));env.tick(16);await env.drain();
    assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'0');
    if(mode==='reduce'){document.documentElement.dataset.motion='reduce';document.dispatchEvent(new Event('motion-preference'));}
    if(mode==='print')window.dispatchEvent(new Event('beforeprint'));
    if(mode==='dispose')dispose();
   }
   assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'','native style defaults to complete copy');
   assert.ok(env.beats.every(beat=>!beat.inert));
   dispose();assert.equal(env.rafs.size,0);
  }finally{env.restore();}
 }
});

test('departure rejects malformed windows and remains absent for callers that do not opt in',async()=>{
 for(const window of [[0,0],[.7,.2],[-.1,.4],[.2,1.1],[.2]]){
  const env=environment({tokens:choreographyTokens});
  try{
   env.film.choreography={departure:window};
   assert.equal(mountCinematicFilm({element:env.stage,film:env.film}),undefined);
   assert.equal(env.requests.length,0);
  }finally{env.restore();}
 }
 const env=environment({tokens:choreographyTokens});
 try{
  env.film.choreography={release:[.8,1]};
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  scrollY=1620;window.dispatchEvent(new Event('scroll'));env.tick(16);
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'');
  dispose();
 }finally{env.restore();}
});

test('obsolete decode cannot evict the current frame or backstep a completed forward seek',async()=>{
 const env=environment({defer:true,frameCount:9});
 const url=index=>`https://example.test/landscape/${index}`;
 let dispose;
 try{
  dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  env.resolve(url(0));await env.drain();
  assert.ok(env.requests.includes(url(1)),'old neighbour is still decoding');
  location.hash='#beat-2';window.dispatchEvent(new Event('hashchange'));env.tick(10);await env.drain();
  env.resolve(url(8));await env.drain();env.resolve(url(7));await env.drain();
  assert.equal(env.drawnURLs.at(-1),url(8));
  const before=env.drawnURLs.length;
  env.resolve(url(1));await env.drain();
  assert.ok(env.drawnURLs.slice(before).every(value=>value===url(8)),'late old decode must not repaint frame7');
  assert.ok(env.bitmaps.find(bitmap=>bitmap.url===url(8)&&!bitmap.closed),'current frame remains resident');
  assert.equal(env.bitmaps.filter(bitmap=>!bitmap.closed).length,2);
  location.hash='#beat-0';window.dispatchEvent(new Event('hashchange'));env.tick(20);await env.drain();
  env.resolve(url(1));await env.drain();env.resolve(url(0));await env.drain();
  assert.equal(env.drawnURLs.at(-1),url(0),'reverse seek still reaches its exact frame');
 }finally{dispose?.();env.resolve();await env.drain();assert.ok(env.bitmaps.every(bitmap=>bitmap.closed));env.restore();}
});

test('out-of-order adjacent decode cannot overshoot a requested frame then step backward',async()=>{
 const env=environment({defer:true,frameCount:9});
 const url=index=>`https://example.test/landscape/${index}`;
 let dispose;
 try{
  dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  env.resolve(url(0));await env.drain();env.resolve(url(1));await env.drain();
  location.hash='#beat-1';window.dispatchEvent(new Event('hashchange'));env.tick(10);await env.drain();
  const before=env.drawnURLs.length;
  env.resolve(url(5));await env.drain();
  assert.ok(!env.drawnURLs.slice(before).includes(url(5)),'a future neighbour must not replace the retained canvas while frame4 is pending');
  env.resolve(url(4));await env.drain();assert.equal(env.drawnURLs.at(-1),url(4));
  location.hash='#beat-2';window.dispatchEvent(new Event('hashchange'));env.tick(20);await env.drain();
  env.resolve(url(8));await env.drain();env.resolve(url(7));await env.drain();
  location.hash='#beat-1';window.dispatchEvent(new Event('hashchange'));env.tick(30);await env.drain();
  const reverse=env.drawnURLs.length;
  env.resolve(url(5));await env.drain();env.resolve(url(4));await env.drain();
  assert.deepEqual(env.drawnURLs.slice(reverse).map(value=>Number(value.split('/').at(-1))),[5,4],'the same neighbour is a valid intermediate during reverse travel');
 }finally{dispose?.();env.resolve();await env.drain();assert.ok(env.bitmaps.every(bitmap=>bitmap.closed));env.restore();}
});

test('a failed requested frame wakes nearest-frame fallback after a future neighbour was held',async()=>{
 const env=environment({defer:true,frameCount:9,tokens:choreographyTokens});
 const url=index=>`https://example.test/landscape/${index}`;
 const originalFetch=globalThis.fetch;
 let dispose,fail;
 try{
  env.film.copyClock='painted';env.film.choreography={departure:[0,1]};
  globalThis.fetch=async address=>address===url(4)?new Promise(resolve=>{fail=()=>resolve({ok:false});}):originalFetch(address);
  dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  env.resolve(url(0));await env.drain();env.resolve(url(1));await env.drain();
  location.hash='#beat-1';window.dispatchEvent(new Event('hashchange'));env.tick(10);await env.drain();
  env.resolve(url(5));await env.drain();assert.notEqual(env.drawnURLs.at(-1),url(5));
  fail();await env.drain();env.tick(20);await env.drain();
  assert.equal(env.drawnURLs.at(-1),url(5),'a confirmed missing target permits nearest fallback without another gesture');
  assert.ok(Math.abs(Number(env.wrapper.style.getPropertyValue('--film-copy-opacity'))-.4375)<1e-8,'copy follows the displayed fallback bin, not the failed target');
 }finally{dispose?.();env.resolve();await env.drain();assert.ok(env.bitmaps.every(bitmap=>bitmap.closed));env.restore();}
});

test('painted time bins retain flat reading holds, intro floor, reversal bounds and first-paint state',()=>{
 const end=191/24,at=createFilmTimeline([[0,0],[.65,end*.85],[.88,end*.85],[1,end]]);
 const hold=filmPaintedProgressWindow(at,162,24);
 for(const p of [.65,.68,.75,.84,.88])assert.equal(Math.max(hold[0],Math.min(hold[1],p)),p,'the complete held-picture interval remains available to text');
 assert.ok(filmPaintedProgressWindow(at,100,24)[1]<.65,'forward travel cannot reveal held-picture text early');
 assert.ok(filmPaintedProgressWindow(at,180,24)[0]>.88,'reverse travel retains the later picture until earlier frames arrive');
 const intro=filmPaintedProgressWindow(at,23,24,end*.12);
 assert.equal(intro[0],0,'automatic film intro does not advance a scroll cue');assert.ok(intro[1]>.05);
 assert.deepEqual(filmPaintedProgressWindow(at,-1,24),[0,0]);
 assert.equal(filmPaintedProgressWindow(at,191,24)[1],1);
 for(const [frame,fps] of [[-2,24],[1.5,24],[0,0],[0,NaN]])assert.throws(()=>filmPaintedProgressWindow(at,frame,fps));
});

test('painted copy waits for first and sought frames, then reverses with the actual picture',async()=>{
 const env=environment({defer:true,frameCount:9,tokens:{...choreographyTokens,'--layout-scroll-scene-preload':1.2}});
 const url=index=>`https://example.test/landscape/${index}`;
 let dispose;
 try{
  Object.assign(env.film,{prepare:true,copyClock:'painted',choreography:{departure:[.25,.75]}});
  dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'1');assert.equal(env.draws,0);
  env.resolve(url(0));await env.drain();env.resolve(url(1));await env.drain();
  location.hash='#beat-2';window.dispatchEvent(new Event('hashchange'));env.tick(10);await env.drain();
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'1','decode-ahead head cannot remove copy over the old picture');
  assert.equal(env.lines[2].style.visibility,'hidden');
  env.resolve(url(8));await env.drain();
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'0');assert.equal(env.lines[2].style.visibility,'visible');
  location.hash='#beat-0';window.dispatchEvent(new Event('hashchange'));env.tick(20);await env.drain();
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'0','reverse input waits for the reverse picture');
  env.resolve(url(0));await env.drain();
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'1');assert.equal(env.lines[0].style.visibility,'visible');
 }finally{dispose?.();env.resolve();await env.drain();env.restore();}
});

test('painted choreography continues through a flat edit hold and restores native reduced presentation',async()=>{
 const env=environment({defer:true,frameCount:192,tokens:{...choreographyTokens,'--layout-scroll-scene-preload':1.2}});
 let dispose;
 try{
  const end=191/24;
  Object.assign(env.film,{fps:24,prepare:true,copyClock:'painted',edit:[[0,0],[.65,end*.85],[.88,end*.85],[1,end]],choreography:{departure:[.65,.88]}});
  scrollY=.75*1800;
  dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  env.resolve('https://example.test/landscape/162');await env.drain();
  const before=Number(env.wrapper.style.getPropertyValue('--film-copy-opacity'));
  scrollY=.8*1800;window.dispatchEvent(new Event('scroll'));env.tick(20);await env.drain();
  assert.equal(env.drawnURLs.at(-1),'https://example.test/landscape/162');
  assert.ok(Number(env.wrapper.style.getPropertyValue('--film-copy-opacity'))<before,'text advances while the displayed frame remains held');
  document.documentElement.dataset.motion='reduce';document.dispatchEvent(new Event('motion-preference'));await env.drain();
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'');assert.ok(env.beats.every(beat=>!beat.inert));
  assert.equal(env.rafs.size,0);
 }finally{dispose?.();env.resolve();await env.drain();env.restore();}
});

test('existing head and scroll copy callers retain raw-scroll choreography while a decode is pending',async()=>{
 for(const clock of ['head','scroll']){
  const env=environment({defer:true,frameCount:9,tokens:choreographyTokens});let dispose;
  try{
   env.film.copyClock=clock;env.film.choreography={departure:[.25,.75]};
   dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
   env.resolve('https://example.test/landscape/0');await env.drain();
   location.hash='#beat-2';window.dispatchEvent(new Event('hashchange'));env.tick(10);await env.drain();
   assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'0',clock);
  }finally{dispose?.();env.resolve();await env.drain();env.restore();}
 }
});

test('owned scroll distance stays stable when viewport height changes',async()=>{
 const env=environment();
 try{
  env.film.scrollDistance={landscape:1440,portrait:1200};delete env.film.viewportSpan;
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  assert.equal(env.wrapper.style.getPropertyValue('--film-distance'),'1440px');
  globalThis.innerHeight=680;window.dispatchEvent(new Event('resize'));await env.drain();
  assert.equal(env.wrapper.style.getPropertyValue('--film-distance'),'1440px');
  dispose();
 }finally{env.restore();}
});

test('in-flow film preserves document travel and has no synthetic pin distance',async()=>{
 const env=environment();
 try{
  env.film.layout='flow';delete env.film.viewportSpan;
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  assert.equal(env.wrapper.getAttribute('data-film-layout'),'flow');
  assert.equal(env.wrapper.style.getPropertyValue('--film-distance'),'0px');
  globalThis.scrollY=500;window.dispatchEvent(new Event('scroll'));env.tick(1000);await env.drain();
  assert.equal(scrollY,500);assert.ok(env.draws>0);
  dispose();assert.equal(env.wrapper.getAttribute('data-film-layout'),null);
 }finally{env.restore();}
});

test('native media box contains a portrait without cropping its payload',async()=>{
 const env=environment({imageSize:[10,20]});
 try{
  env.film.nativeFrame=true;env.film.fit='contain';env.film.decodedByteLimit=1600;
  env.story.queries['.cinematic-still']=[env.still];
  env.still.getBoundingClientRect=()=>({left:20,top:80,width:760,height:400,right:780,bottom:480});
  const dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  const draw=env.paintOperations.filter(op=>op.kind==='draw').at(-1);
  assert.deepEqual(draw.rect,[280,0,200,400]);
  dispose();
 }finally{env.restore();}
});

test('cancelled decoding cannot replace its newer same-index bitmap',async()=>{
 const env=environment({defer:true,frameCount:9});
 const url=index=>`https://example.test/landscape/${index}`;
 let dispose;
 try {
  dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  env.resolve(url(0));await env.drain();
  const obsolete=env.bitmaps.find(bitmap=>bitmap.url===url(1));
  assert.ok(obsolete);
  location.hash='#beat-2';window.dispatchEvent(new Event('hashchange'));env.tick(10);await env.drain();
  env.resolve(url(8));await env.drain();env.resolve(url(7));await env.drain();
  location.hash='#beat-0';window.dispatchEvent(new Event('hashchange'));env.tick(20);await env.drain();
  const current=env.bitmaps.findLast(bitmap=>bitmap.url===url(1));
  assert.notEqual(current,obsolete);
  env.resolveLast(url(1));await env.drain();
  assert.ok(!current.closed);
  env.resolveFirst(url(1));await env.drain();
  assert.equal(obsolete.closed,true,'aborted decode must be closed even when its index is desired again');
  assert.equal(current.closed,undefined,'newer admitted bitmap remains resident');
  assert.ok(env.bitmaps.filter(bitmap=>!bitmap.closed).length<=2);
 } finally {dispose?.();env.resolve();await env.drain();assert.ok(env.bitmaps.every(bitmap=>bitmap.closed));env.restore();}
});

test('approaching film can emerge before pinning while destinations keep one scroll map',async()=>{
 const env=environment();let dispose;
 try{
  Object.assign(env.film,{approach:.5,scrollDistance:{landscape:1200,portrait:1000}});
  scrollY=-150;
  dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  assert.ok(env.draws>0,'the partly visible scene can be painted before its top reaches the viewport');
  location.hash='#beat-1';window.dispatchEvent(new Event('hashchange'));env.tick(50);await env.drain();
  assert.equal(scrollY,450,'halfway destination includes the same 300px approach used by the progress map');
 }finally{dispose?.();env.restore();}
});

test('settled caption departs with its scene and reverses without a stranded label',async()=>{
 const env=environment({tokens:choreographyTokens});let dispose;
 try{
  env.film.choreography={settle:[.1,.2],departure:[.6,.8]};
  env.film.windows=env.film.windows.map(()=>[-1,-1]);
  env.story.queries['.cinematic-copy']=[env.beats[0]];
  dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  for(const [p,expected] of [[.3,1],[.7,.5],[.9,0],[.3,1]]){
   scrollY=p*1800;window.dispatchEvent(new Event('scroll'));env.tick(100);await env.drain();
   assert.ok(Math.abs(Number(env.beats[0].style.opacity)-expected)<1e-10);
  }
 }finally{dispose?.();env.restore();}
});

test('authored departure aligns with unpin and uses a matching measured inverse',async()=>{
 const env=environment({frameCount:21});let dispose;
 try{
  const stageHeight=600, distance=1200, lead=300, total=distance+stageHeight;
  env.film.departureAt=.8;env.film.scrollDistance={landscape:distance,portrait:distance};env.film.approach=.5;
  env.film.decodedByteLimit=21*400;
  env.wrapper.getBoundingClientRect=()=>({top:-scrollY,bottom:total-scrollY,height:total,left:0,right:800,width:800});
  dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  let now=0;
  for(const [position,frame] of [[-300,0],[0,3],[1200,16],[1500,18],[1700,19],[1800,20],[1200,16],[0,3]]){
   scrollY=position;window.dispatchEvent(new Event('scroll'));
   for(let n=0;n<65;n++){env.tick(now+=50);await env.drain();}
   if(position<1800)assert.ok(env.drawnURLs.at(-1).endsWith('/'+frame),`${position}: ${env.drawnURLs.at(-1)}`);
   assert.equal(scrollY,position,'rendering must not move native scroll');
  }
  globalThis.innerHeight=680;env.film.approach=0;env.film.rests[1]=.9;
  location.hash='#beat-1';window.dispatchEvent(new Event('hashchange'));env.tick(now+=50);await env.drain();
  assert.equal(scrollY,1500,'departure uses measured trailing box even when dynamic viewport differs');
  dispose();assert.ok(env.bitmaps.every(bitmap=>bitmap.closed));
 }finally{env.restore();}
});

test('through-scrolling retains complete native flow during reduction and print',async()=>{
 for(const mode of ['reduce','print']){
  const env=environment();let dispose;
  try{
   env.film.departureAt=.8;dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
   if(mode==='reduce'){document.documentElement.dataset.motion='reduce';document.dispatchEvent(new Event('motion-preference'));}
   else window.dispatchEvent(new Event('beforeprint'));
   assert.equal(env.wrapper.dataset.islandState,'still');
   assert.ok(env.beats.every(beat=>!beat.inert));
   assert.ok(env.bitmaps.every(bitmap=>bitmap.closed));
  }finally{dispose?.();env.restore();}
 }
});

test('late first prepared frame does not flash the opening after leaving',async()=>{
 const env=environment({defer:true,frameCount:9,tokens:{'--layout-scroll-scene-preload':1.2}});let dispose;
 try {
  env.film.prepare=true;env.film.departureAt=.8;
  dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  scrollY=2100;window.dispatchEvent(new Event('scroll'));env.tick(10);await env.drain();
  const before=env.drawnURLs.length;
  env.resolve('https://example.test/landscape/0');await env.drain();
  assert.ok(!env.drawnURLs.slice(before).includes('https://example.test/landscape/0'),'old opening must not flash in the final visible slice');
 } finally {dispose?.();env.resolve();await env.drain();env.restore();}
});

test('unpinning hides stale pixels immediately and follows native departure before decode',async()=>{
 const env=environment({defer:true,frameCount:101,tokens:{...choreographyTokens,'--layout-scroll-scene-preload':1.2}});let dispose;
 const url=index=>`https://example.test/landscape/${index}`;
 try{
  Object.assign(env.film,{prepare:true,departureAt:.8,copyClock:'painted',fps:20,edit:[[0,0],[1,5]],
    decodedByteLimit:1200,windows:[[-1,-1],[-1,-1],[-1,-1]],choreography:{departure:[.8,.9]}});
  dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  env.resolve(url(0));await env.drain();
  const canvas=env.stage.children[0],before=env.drawnURLs.length;
  scrollY=2250;window.dispatchEvent(new Event('scroll'));await env.drain();
  assert.equal(canvas.style.visibility,'hidden','old pinned pixels cannot follow the outgoing section');
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'0','outgoing copy follows native departure even before its image decodes');
  assert.ok(env.requests.includes(url(95)),'the native tail frame is requested without waiting for rate easing');
  assert.equal(env.drawnURLs.length,before);
  env.resolve(url(95));await env.drain();
  assert.equal(canvas.style.visibility,'visible');assert.equal(env.drawnURLs.at(-1),url(95));
  env.resolve(url(94));await env.drain();
  scrollY=2220;window.dispatchEvent(new Event('scroll'));await env.drain();
  assert.equal(env.drawnURLs.at(-1),url(94));
  assert.equal(env.paintOperations.at(-1).alpha,1,'opaque tail frames replace rather than blend with a stale pose');
  scrollY=2100;window.dispatchEvent(new Event('scroll'));await env.drain();
  assert.equal(canvas.style.visibility,'hidden','reverse travel cannot retain the later tail pose');
  env.resolve(url(90));await env.drain();assert.equal(env.drawnURLs.at(-1),url(90));
  scrollY=1700;window.dispatchEvent(new Event('scroll'));await env.drain();
  assert.equal(canvas.style.visibility,'hidden','re-entry waits for the matching pinned pose');
  env.resolve(url(76));await env.drain();assert.equal(env.drawnURLs.at(-1),url(76));
  assert.equal(canvas.style.visibility,'visible');
  assert.equal(scrollY,1700,'the guarded seek changes pixels, not page position');
 }finally{dispose?.();env.resolve();await env.drain();env.restore();}
});

test('cold departure cancels obsolete acquisition and restores focused/native content',async()=>{
 const env=environment({defer:true,frameCount:101,tokens:{...choreographyTokens,'--layout-scroll-scene-preload':1.2}});let dispose;
 const url=index=>`https://example.test/landscape/${index}`;
 try{
  Object.assign(env.film,{prepare:true,departureAt:.8,copyClock:'painted',fps:20,edit:[[0,0],[1,5]],
    windows:[[-1,-1],[-1,-1],[-1,-1]],choreography:{departure:[.8,.9]}});
  dispose=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  scrollY=2250;window.dispatchEvent(new Event('scroll'));await env.drain();
  assert.ok(env.requests.includes(url(95)),'cold acquisition follows the current native phase');
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'0');
  env.resolve(url(0));await env.drain();assert.equal(env.draws,0,'obsolete first decode never flashes');
  env.resolve(url(95));await env.drain();assert.equal(env.drawnURLs.at(-1),url(95));
  env.cards[0].tagName='A';env.cards[0].matches=selector=>selector.includes('a[href]');
  document.activeElement=env.cards[0];env.tick(20);await env.drain();
  assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'1','focused content stays readable');
  document.documentElement.dataset.motion='reduce';document.dispatchEvent(new Event('motion-preference'));await env.drain();
  assert.equal(env.wrapper.dataset.islandState,'still');assert.ok(env.beats.every(beat=>!beat.inert));
  env.resolve();await env.drain();
  assert.ok(env.bitmaps.every(bitmap=>bitmap.closed));assert.equal(env.wrapper.style.getPropertyValue('--film-copy-opacity'),'');
 }finally{dispose?.();env.resolve();await env.drain();env.restore();}
});

// Two independent scenes share normal document flow. Changing viewport height
// moves the later scene before either controller receives its resize event.
function laterScene(env) {
 const Node=env.stage.constructor,wrapper=new Node(),story=new Node(),stage=new Node(),beat=new Node('later-reading'),line=new Node();
 const distance=1200,origin=()=>distance+innerHeight*1.5;
 const box=(top,height)=>({top,bottom:top+height,left:0,right:400,width:400,height});
 wrapper.dataset={};wrapper.queries={'.cinematic-story':[story]};wrapper.append(story);wrapper.append(stage);
 wrapper.getBoundingClientRect=()=>box(origin()-scrollY,distance+innerHeight);
 stage.closest=()=>wrapper;stage.getBoundingClientRect=()=>box(0,innerHeight);
 line.getBoundingClientRect=()=>box(100,100);beat.append(line);story.append(beat);
 beat.queries={'[data-film-line]':[line],'.cinematic-title, .cinematic-premise, .cinematic-card':[line]};
 story.queries={'.cinematic-beat':[beat],'.cinematic-card':[],'.cinematic-frames--landscape a[href]':Array.from({length:3},(_,i)=>({href:`https://example.test/later/${i}`}))};
 story.queries['.cinematic-frames--portrait a[href]']=story.queries['.cinematic-frames--landscape a[href]'];
 return {wrapper,stage,line,origin,film:{...env.film,scrollDistance:{landscape:distance,portrait:distance},windows:[[-1,-1]],cards:[],rests:[.5]}};
}

test('a later reading hold survives viewport reflow once, then ordinary forward and reverse scroll remain native',async()=>{
 const env=environment();let first,second;
 try{
  innerWidth=400;innerHeight=800;
  env.film.scrollDistance={landscape:1200,portrait:1200};
  env.wrapper.getBoundingClientRect=()=>({top:-scrollY,bottom:1200+innerHeight-scrollY,height:1200+innerHeight,left:0,right:400,width:400});
  env.stage.getBoundingClientRect=()=>({top:0,bottom:innerHeight,height:innerHeight,left:0,right:400,width:400});
  env.lines.forEach(line=>{line.getBoundingClientRect=()=>({top:400,bottom:500,height:100,left:0,right:400,width:400});});
  scrollY=600;first=mountCinematicFilm({element:env.stage,film:env.film});await env.drain();
  assert.equal(env.wrapper.dataset.islandState,'drawn');
  const later=laterScene(env);scrollY=later.origin()+600;window.dispatchEvent(new Event('scroll'));
  second=mountCinematicFilm({element:later.stage,film:later.film});await env.drain();
  assert.equal(later.wrapper.dataset.islandState,'drawn');
  const writes=[],scroll=window.scrollTo;window.scrollTo=position=>{writes.push(position.top);scroll(position);};
  innerHeight=600;window.dispatchEvent(new Event('resize'));env.resizeObserved();env.tick(20);await env.drain();
  assert.equal(scrollY,later.origin()+600,'keep the pre-reflow half-way position, not the already-shifted DOM position');
  assert.deepEqual(writes,[2700],'one active scene restores the shared page position');
  env.resizeObserved();env.tick(40);await env.drain();assert.equal(writes.length,1,'settled observer notifications do not scroll again');
  for(const position of [2800,2600]){scrollY=position;window.dispatchEvent(new Event('scroll'));env.tick(60);await env.drain();assert.equal(scrollY,position);}
  assert.equal(writes.length,1);assert.equal(later.line.style.visibility,'visible');
 }finally{second?.();first?.();assert.equal(env.rafs.size,0);env.restore();}
});

test('new input and film teardown supersede a queued resize restoration',async()=>{
 for(const stop of ['wheel','touchmove','reduce','print','pagehide','dispose']){
  const env=environment();let dispose;
  try{
   innerWidth=400;innerHeight=800;const later=laterScene(env);scrollY=later.origin()+600;
   dispose=mountCinematicFilm({element:later.stage,film:later.film});await env.drain();
   innerHeight=600;window.dispatchEvent(new Event('resize'));
   if(stop==='wheel'||stop==='touchmove'){window.dispatchEvent(new Event(stop));scrollY=3100;window.dispatchEvent(new Event('scroll'));}
   if(stop==='reduce'){document.documentElement.dataset.motion='reduce';document.dispatchEvent(new Event('motion-preference'));}
   if(stop==='print')window.dispatchEvent(new Event('beforeprint'));
   if(stop==='pagehide')window.dispatchEvent(new Event('pagehide'));
   if(stop==='dispose'){dispose();dispose=null;}
   const position=scrollY;env.tick(20);await env.drain();assert.equal(scrollY,position,stop);
  }finally{dispose?.();env.restore();}
 }
});


test('history leaving a film wins over a resize before its reconciliation frame',async()=>{
 const env=environment();let dispose;
 try{
  innerWidth=400;innerHeight=800;const later=laterScene(env);scrollY=later.origin()+600;
  dispose=mountCinematicFilm({element:later.stage,film:later.film});await env.drain();
  location.hash='#outside-film';window.dispatchEvent(new Event('popstate'));
  innerHeight=600;window.dispatchEvent(new Event('resize'));
  scrollY=5000;window.dispatchEvent(new Event('scroll'));
  env.tick(20);await env.drain();assert.equal(scrollY,5000,'native history destination stays outside the former scene');
 }finally{dispose?.();env.restore();}
});
