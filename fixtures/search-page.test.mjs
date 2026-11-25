import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { registerHooks } from 'node:module';
// Mirror the declared browser alias without creating a second SDK implementation.
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === '@base/search-sdk' ? new URL('../scripts/vendor/gazette-search/index.mjs', import.meta.url).href : specifier, context);
} });
const { readSearchState, searchStateURL, browseSearch, mountSearchPage, describeSearchSelection } = await import('../scripts/search-page.js');
import { createIndex } from '../scripts/vendor/gazette-search/index.mjs';
import { rememberBrowseReturn } from '../scripts/return-focus.js';
const bounds={profile:'lexical',maxDocuments:100,maxBytes:100000,maxQueryBytes:1024,maxResults:15};
const record=i=>({content:{id:`page:${i}`,site:'site:one',title:`Question ${i}`,description:'An authored description.',structure:{kind:'page',family:{kind:'article'}},published:'2026-10-28'},route:{url:`https://example.test/${i}/`,canonical_url:`https://example.test/${i}/`},body:'Question answer',projects:[{project:{id:i===34?'project:last':'project:common',name:i===34?'Last project':'Common project'},relationship:{relation:'about'}}],attributions:[]});

test('shareable state uses exact native IDs and keeps unrelated URL values without hardcoded route construction',()=>{
 const state=readSearchState('https://example.test/custom/find/?q=two+words&sort=oldest&page=3&project=project%3Alast');
 assert.deepEqual(state,{query:'two words',sort:'oldest',page:3,filters:{project:'project:last'}},15);
 const url=new URL(searchStateURL('https://example.test/custom/find/?keep=yes#old',state));
 assert.equal(url.pathname,'/custom/find/');assert.equal(url.searchParams.get('keep'),'yes');assert.equal(url.hash,'');
 assert.deepEqual(readSearchState(url.href),state);
 assert.equal(readSearchState('https://example.test/?sort=unknown&page=-5').page,1);
 assert.deepEqual(readSearchState('https://example.test/?classification=not-json').filters,{});
 assert.deepEqual(readSearchState('https://example.test/?classification='+encodeURIComponent(JSON.stringify({taxonomy:'taxonomy:one',term:'term:two',extra:true}))).filters,{});
 const classification=JSON.stringify({taxonomy:'taxonomy:one',term:'term:two'});
 assert.equal(readSearchState('https://example.test/?classification='+encodeURIComponent(classification)).filters.classification,classification);
});
test('full-page filters apply before fifteen-entry pagination and report complete counts',()=>{
 const index=createIndex(Array.from({length:35},(_,i)=>record(i)),bounds);
 const all=browseSearch(index,{query:'Question',sort:'relevance',page:1,filters:{}},15);
 assert.equal(all.total,35);assert.equal(all.hits.length,15);
 const tail=browseSearch(index,{query:'Question',sort:'relevance',page:1,filters:{project:'project:last'}},15);
 assert.equal(tail.total,1);assert.equal(tail.hits[0].record.content.id,'page:34');
 const page3=browseSearch(index,{query:'Question',sort:'relevance',page:3,filters:{}},15);
 assert.equal(page3.total,35);assert.equal(page3.hits.length,5);
});
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.attrs={};this.maps=new Map();this.events={};this.hidden=false;this.value='';this.textContent='';this.properties={};this.style={setProperty:(key,value)=>{this.properties[key]=value;},removeProperty:key=>delete this.properties[key]};this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};}
 append(child){this.children.push(child);child.parentElement=this;}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);}
 replaceChildren(...children){this.children=[];for(const child of children)this.append(child);}
 querySelector(selector){return this.maps.get(selector)||null;}
 querySelectorAll(selector){return this.maps.get(selector)||(selector==='a[href]'?this.children.flatMap(child=>[...(child.tag==='a'&&child.href?[child]:[]),...child.querySelectorAll(selector)]):[]);}
 getAttribute(key){return this.attrs[key]??null;}
 setAttribute(key,value){this.attrs[key]=String(value);}
 removeAttribute(key){delete this.attrs[key];}
 toggleAttribute(key,on){if(on)this.setAttribute(key,'');else this.removeAttribute(key);}
 addEventListener(name,fn,{signal}={}){(this.events[name]??=[]).push(signal?event=>{if(!signal.aborted)fn(event);}:fn);}
 fire(name,extra={}){const e={target:this,button:0,preventDefault(){this.prevented=true;},...extra};for(const fn of this.events[name]||[])fn(e);return e;}
 closest(selector){return selector==='a[href]'&&this.tag==='a'?this:null;}
 requestSubmit(){this.fire('submit');}
 setCustomValidity(value){this.validity=value;}
 reportValidity(){this.reported=true;}
 focus(options){this.focusOptions=options;this.focusCount=(this.focusCount||0)+1;}
 scrollIntoView(options){this.scrollOptions=options;}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
 get offsetLeft(){return Math.max(0,this.parentElement?.children.indexOf(this)||0)*300;}
 get offsetWidth(){return 300;}
 getBoundingClientRect(){return{left:0,top:120,width:300,height:200};}
 scrollTo({left}){this.scrollLeft=left;}
}
function page(){
 const root=new Element(),form=new Element('form'),input=new Element('input'),status=new Element('p'),list=new Element('ul'),field=new Element(),fallback=new Element(),pagers=[];
 form.action='https://example.test/custom/find/';form.hidden=true;list.hidden=true;
 form.maps.set('[name="q"]',input);
 const fields={};for(const key of ['kind','author','project','keyword','classification','sort']){const label=new Element('label'),select=new Element('select');label.append(select);fields[key]=select;form.maps.set(`[name="${key}"]`,select);}
 const nav=new Element('nav');nav.maps.set('p',new Element('p'));nav.maps.set('.search-page__previous',new Element('a'));nav.maps.set('.search-page__next',new Element('a'));for(const boundary of ['previous','next'])nav.maps.set(`.search-page__${boundary}-unavailable`,new Element('span'));pagers.push(nav);
 for(const [key,value] of Object.entries({'form':form,'[role="status"]':status,'.search-page__results':list,'.search-page__field':field,'.search-page__fallback':fallback,'.search-page__pagination':pagers}))root.maps.set(key,value);
 for(const [key,value] of Object.entries({'data-search-page-size':'15','data-source-site':'site:one','data-search-any':'All','data-search-count':'{count} results','data-search-pagination':'Page {page} of {pages}','data-search-context':'More context','data-search-view-page':'View page','data-search-kind':'Type','data-search-kind-article':'Article','data-search-published':'Published','data-search-query-limit':'Shorten the search'}))root.setAttribute(key,value);
 for(const [key,value] of Object.entries({'data-status-loading':'Loading','data-status-unavailable':'Unavailable','data-status-empty':'No results'}))status.setAttribute(key,value);
 const events={},history=[],writes=[],frames=new Map();let frameId=0;
 const window={location:{href:form.action},addEventListener:(key,fn)=>events[key]=fn,
  requestAnimationFrame(fn){frames.set(++frameId,fn);return frameId;},cancelAnimationFrame(id){frames.delete(id);},
  history:{pushState(_state,_title,url){history.push(url);writes.push({mode:'push',url});window.location.href=url;},replaceState(_state,_title,url){if(history.length)history[history.length-1]=url;writes.push({mode:'replace',url});window.location.href=url;}}};
 const flushFrames=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());};
 return{root,form,input,fields,status,list,field,fallback,pagers,window,events,history,writes,frames,flushFrames};
}
async function server(body,status=200){let calls=0;const instance=createServer((_q,r)=>{calls++;r.writeHead(status,{'content-type':'application/json'});r.end(JSON.stringify(body));});await new Promise(resolve=>instance.listen(0,'127.0.0.1',resolve));return{url:`http://127.0.0.1:${instance.address().port}/search.json`,get calls(){return calls;},close:()=>new Promise(resolve=>instance.close(resolve))};}
const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('page did not settle');};

// Supply geometry and browser events while mounting the real Search carousel.
function carouselPage(){
 const f=page(),controls=new Element('nav'),previous=new Element('button'),next=new Element('button'),matches=new Element();
 for(const [selector,node] of [['[data-search-depth-previous]',previous],['[data-search-depth-next]',next],['output',new Element('output')]])controls.maps.set(selector,node);
 f.root.maps.set('.search-depth__controls',controls);f.root.maps.set('.search-page__matches',matches);
 f.list.clientWidth=300;f.list.scrollLeft=0;
 const doc={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null,
  documentElement:{clientWidth:900,dataset:{motion:'allow'}},defaultView:f.window,addEventListener(){},removeEventListener(){}};
 f.window.history={state:null,pushState(state,_title,url){this.state=state;if(url)f.window.location.href=url;},replaceState(state,_title,url){this.state=state;if(url)f.window.location.href=url;}};
 f.window.scrollBy=(x,y)=>{f.window.returnScroll={x,y};};
 const globals={window:f.window,document:doc,ResizeObserver:class{observe(){}disconnect(){}},
  getComputedStyle:()=>({getPropertyValue:key=>({'--layout-search-depth-yaw':35,'--layout-search-depth-yaw-max':75,'--layout-search-depth-retreat':.28,'--layout-search-depth-scale-falloff':.08})[key]}),
  requestAnimationFrame:f.window.requestAnimationFrame,cancelAnimationFrame:f.window.cancelAnimationFrame};
 const originals=Object.fromEntries(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.assign(globalThis,globals);
 return{...f,previous,next,matches,restore(){for(const [key,descriptor]of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}};
}

test('a reader below Search keeps the native catalogue until returning to the top', async () => {
 const s = await server([record(0)]), f = page();
 const oldWindow = globalThis.window, oldDocument = globalThis.document;
 globalThis.window = f.window;
 globalThis.document = { createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag), getElementById: () => null };
 try {
  f.window.scrollY = 500;
  mountSearchPage(f.root, { url: s.url, profile: 'lexical' });
  await until(() => !f.form.hidden);
  assert.equal(f.fallback.hidden, false);
  assert.equal(f.list.hidden, true);
  f.window.scrollY = 0;
  f.events.scroll();
  assert.equal(f.fallback.hidden, true);
  assert.equal(f.list.hidden, false);
 } finally {
  globalThis.window = oldWindow;
  globalThis.document = oldDocument;
  await s.close();
 }
});

test('delayed Search keeps the catalogue and ignores an older worker result', async () => {
 const f = page(), requests = new Map();
 const index = createIndex([record(0), record(1)], bounds);
 const ready = Promise.withResolvers();
 const preparation = {
  ready: ready.promise,
  browse(query, options) {
   const reply = Promise.withResolvers();
   requests.set(query, () => reply.resolve(index.browse(query, options)));
   return reply.promise;
  },
 };
 const oldWindow = globalThis.window, oldDocument = globalThis.document;
 globalThis.window = f.window;
 globalThis.document = { createElement: tag => new Element(tag), getElementById: () => null };
 try {
  mountSearchPage(f.root, { url: 'https://example.test/search.json', profile: 'lexical' }, { preparation });
  assert.equal(f.form.hidden, false);
  f.input.value = 'Question 0';
  f.input.fire('input');
  assert.equal(f.fallback.hidden, false);
  ready.resolve();
  await until(() => requests.has('Question 0'));
  f.input.value = 'Question 1';
  f.input.fire('input');
  f.flushFrames();
  requests.get('Question 1')();
  await until(() => f.fallback.hidden);
  requests.get('Question 0')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.input.value, 'Question 1');
  assert.equal(new URL(f.window.location.href).searchParams.get('q'), 'Question 1');
  assert.equal(f.list.children[0].children[0].children.find(node => node.tag === 'h2').children[0].textContent, 'Question 1');
 } finally {
  globalThis.window = oldWindow;
  globalThis.document = oldDocument;
 }
});

test('full page replaces the native catalogue only after complete load; paging and Back keep one index',async()=>{
 const s=await server(Array.from({length:35},(_,i)=>record(i))),f=page();const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{
  mountSearchPage(f.root,{url:s.url,profile:'lexical'});assert.equal(f.fallback.hidden,false);assert.equal(f.form.hidden,true);
  await until(()=>!f.form.hidden);assert.equal(f.fallback.hidden,true);assert.equal(f.list.children.length,15);assert.equal(f.status.textContent,'35 results');
  const next=f.pagers[0].querySelector('.search-page__next');f.pagers[0].fire('click',{target:next});assert.equal(f.history.length,1);assert.equal(new URL(f.history[0]).searchParams.get('page'),'2');
  assert.equal(f.pagers[0].querySelector('p').textContent,'Page 2 of 3');
  f.pagers[0].fire('click',{target:next});assert.equal(f.list.children.length,5);assert.equal(next.hidden,true);
  assert.equal(f.pagers[0].querySelector('.search-page__next-unavailable').hidden,false,'an unavailable boundary keeps its text, as listing pagination does');
  assert.equal(f.pagers[0].querySelector('.search-page__previous-unavailable').hidden,true);
  assert.equal(f.pagers[0].querySelector('p').textContent,'Page 3 of 3');
  assert.equal(new URL(f.history.at(-1)).searchParams.get('page'),'3');
  const previous=f.pagers[0].querySelector('.search-page__previous');f.pagers[0].fire('click',{target:previous});
  assert.equal(f.list.children.length,15);assert.equal(next.hidden,false);assert.equal(f.pagers[0].querySelector('p').textContent,'Page 2 of 3');
  f.window.location.href=f.form.action;f.events.popstate();assert.equal(f.list.children.length,15);assert.equal(f.history.length,3);
  f.input.value='unmatched';f.form.fire('submit');assert.equal(f.status.textContent,'No results');assert.equal(f.list.children.length,0);assert.equal(s.calls,1);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});

test('explicit pagination focuses the new result count when its invoking boundary link disappears',async()=>{
 const s=await server(Array.from({length:16},(_,i)=>record(i))),f=page();const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{
  mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);
  assert.equal(f.status.focusCount,undefined);
  const next=f.pagers[0].querySelector('.search-page__next');f.pagers[0].fire('click',{target:next});
  assert.equal(next.hidden,true);assert.equal(f.status.getAttribute('tabindex'),'-1');
  assert.deepEqual(f.status.focusOptions,{preventScroll:true});assert.deepEqual(f.status.scrollOptions,{block:'start',behavior:'instant'});
  const focusCount=f.status.focusCount;f.input.value='Question';f.form.fire('submit');
  f.window.location.href=f.form.action;f.events.popstate();assert.equal(f.status.focusCount,focusCount);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});
test('failed index acquisition retains complete native catalogue and exposes no fake empty search',async()=>{
 const s=await server([],500),f=page();const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag)};
 try{mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>f.status.textContent==='Unavailable');assert.equal(f.fallback.hidden,false);assert.equal(f.form.hidden,true);assert.equal(f.list.hidden,true);}
 finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});

test('an unavailable index offers one retry that reloads it and returns focus to the field',async()=>{
 let failing=true;const instance=createServer((_q,r)=>{r.writeHead(failing?500:200,{'content-type':'application/json'});r.end(JSON.stringify(failing?[]:[record(0)]));});
 await new Promise(resolve=>instance.listen(0,'127.0.0.1',resolve));
 const f=page(),retry=new Element('button');retry.hidden=true;f.root.maps.set('[data-search-retry]',retry);
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 const document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null,activeElement:null};
 for(const node of [f.status,f.input,retry]){const focus=node.focus.bind(node);node.focus=options=>{focus(options);document.activeElement=node;};}
 globalThis.window=f.window;globalThis.document=document;
 try{mountSearchPage(f.root,{url:`http://127.0.0.1:${instance.address().port}/search.json`,profile:'lexical'});
  await until(()=>f.status.textContent==='Unavailable');assert.equal(retry.hidden,false);assert.equal(f.fallback.hidden,false);
  // A second failure brings the reader back to Retry rather than leaving focus on a hidden control.
  retry.fire('click');assert.equal(retry.hidden,true);assert.equal(document.activeElement,f.status);assert.equal(f.status.textContent,'Loading');
  await until(()=>!retry.hidden);assert.equal(document.activeElement,retry);
  failing=false;retry.fire('click');await until(()=>!f.form.hidden);
  assert.equal(retry.hidden,true);assert.equal(f.list.children.length,1);assert.equal(document.activeElement,f.input);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await new Promise(resolve=>instance.close(resolve));}
});

test('native facet labels show complete counts and hide single-value controls without losing selected identity',async()=>{
 const records=Array.from({length:35},(_,i)=>record(i));
 for(const value of records){
  const second=value.content.id==='page:34';
  value.attributions=[{role:'author',principal:{id:second?'person:two':'person:one',name:second?'Writer Two':'Writer One'}}];
  value.classifications=[{taxonomy:{id:'taxonomy:subject',label:'Subject'},term:{id:second?'term:second':'term:first',label:second?'Second':'First'}}];
 }
 const s=await server(records),f=page();const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{
  mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);
  assert.equal(f.fields.kind.parentElement.hidden,true);
  assert.deepEqual(f.fields.author.children.map(node=>node.textContent),['All','Writer One (34)','Writer Two (1)']);
  assert.deepEqual(f.fields.classification.children.map(node=>node.textContent),['All','Subject: First (34)','Subject: Second (1)']);
  f.fields.author.value='person:two';f.form.fire('submit');
  assert.equal(f.status.textContent,'1 results');assert.equal(f.list.children.length,1);
  assert.equal(f.fields.author.value,'person:two');assert.equal(f.fields.author.parentElement.hidden,false);
  assert.equal(new URL(f.history.at(-1)).searchParams.get('author'),'person:two');
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});

test('provider documentation retains its supplied external link without a native page identity',async()=>{
 const value=record(0);value.route.url='https://docs.example.test/reference/';value.destination={kind:'external'};
 const s=await server([value]),f=page();const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{
  mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);
  const card=f.list.children[0].children[0],link=card.children.find(node=>node.tag==='h2').children[0];
  assert.equal(link.href,value.route.url);
  assert.equal(link.getAttribute('data-gazette-destination-kind'),'external');
  assert.equal(link.getAttribute('data-gazette-destination-content'),null);
  assert.equal(link.getAttribute('data-gazette-destination-site'),null);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});

test('a result keeps its direct title link separate from optional context disclosure',async()=>{
 const value=record(0);value.content.keywords=['API discovery'];value.content.language='fr';value.content.modified='2026-10-28T12:00:00Z';
 const s=await server([value]),f=page();const oldWindow=globalThis.window,oldDocument=globalThis.document;
 f.root.setAttribute('data-search-keyword','Keywords');f.root.setAttribute('data-search-language','Language');f.root.setAttribute('data-search-modified','Updated');
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{
  mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);
  const card=f.list.children[0].children[0],title=card.children.find(node=>node.tag==='h2'),details=card.children.find(node=>node.tag==='details');
  assert.equal(title.children[0].href,value.route.url);
  assert.equal(details.children[0].tag,'summary');assert.equal(details.children[0].children[0].textContent,'More context');
  const descendants=node=>[node,...node.children.flatMap(descendants)];
  assert.equal(descendants(details.children[0]).some(node=>node.tag==='a'||node.tag==='button'),false);
  assert.equal(card.children.find(node=>node.className==='search-result__description').textContent,value.content.description,'the preview stays readable without expanding metadata');
  const action=descendants(details).find(node=>node.tag==='a'&&node.textContent==='View page');assert.equal(action.textContent,'View page');assert.equal(action.href,value.route.url);
  assert.equal(action.className,'control control--primary control--compact','result actions use the shared primary response at compact size');
  assert.equal(title.children[0].className,undefined,'the directly readable title remains an ordinary link');
  assert.equal(action.getAttribute('data-gazette-destination-kind'),'internal-native');
  assert.equal(action.getAttribute('role'),null,'native destination links keep link semantics');
  const keyword=descendants(details).find(node=>node.tag==='a'&&node.textContent==='API discovery');
  assert.equal(new URL(keyword.href).searchParams.get('keyword'),'API discovery');
  assert.equal(keyword.getAttribute('data-gazette-destination-kind'),'internal-native');
  assert.equal(descendants(details).some(node=>node.tag==='time'),false,'secondary metadata does not repeat dates');
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});

test('only one result context opens at a time without navigating or changing query history',async()=>{
 const s=await server([record(0),record(1)]),f=page();const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{
  mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);
  const [first,second]=f.list.children.map(entry=>entry.children[0].children.find(node=>node.tag==='details'));
  first.open=true;first.fire('toggle');second.open=true;second.fire('toggle');
  assert.equal(first.open,false);assert.equal(second.open,true);assert.equal(f.history.length,0);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});

test('carousel settlement preserves native close while different-card selection opens its context',async()=>{
 const s=await server([record(0),record(1),record(2)]),f=carouselPage();
 try{
  const mounted=mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);
  assert.equal(f.root.classes.has('search-page--depth'),true,'exercise the real carousel callbacks');
  const cards=f.list.children.map(entry=>entry.children[0]),details=cards.map(card=>card.children.find(node=>node.tag==='details'));
  const assertOpen=index=>assert.deepEqual(details.map(node=>Boolean(node.open)),details.map((_,at)=>at===index));
  assertOpen(0);
  details[0].open=false;f.list.fire('scrollend');assertOpen(-1);
  details[0].fire('toggle');f.list.fire('scrollend');assertOpen(-1);
  const link=cards[0].querySelectorAll('a[href]')[0];link.matches=selector=>selector===':focus-visible';
  f.list.fire('focusin',{target:link});f.list.fire('scrollend');assertOpen(-1);
  f.next.fire('click');f.list.fire('scrollend');assertOpen(1);
  details[1].open=false;details[1].fire('toggle');f.list.fire('scrollend');assertOpen(-1);
  f.matches.fire('keydown',{key:'End'});f.list.fire('scrollend');assertOpen(2);
  f.list.fire('wheel');f.list.scrollLeft=0;f.list.fire('scrollend');assertOpen(0);
  details[1].open=true;details[1].fire('toggle');f.list.fire('scrollend');assertOpen(1);
  assert.equal(cards[1].getAttribute('data-search-active'),'','native opening selects its neighbour');
  f.previous.fire('click');f.list.fire('scrollend');assertOpen(0);
  details[0].open=false;details[0].fire('toggle');f.list.fire('scrollend');assertOpen(-1);
  assert.equal(f.window.location.href,f.form.action,'context interactions do not change the query URL');
  mounted.refresh();f.flushFrames();f.list.fire('scrollend');
  assert.equal(f.list.children[0].children[0].children.find(node=>node.tag==='details').open,true,'a new result list starts with its own selection');
 }finally{f.restore();await s.close();}
});

test('Back restores the selected result with its saved open or closed context through scroll completion',async()=>{
 const s=await server([record(0),record(1),record(2)]);
 try{for(const open of [false,true]){
  const f=carouselPage(),refine=new Element('details');f.form.maps.set('details',refine);
  f.window.performance={getEntriesByType:()=>[{type:'back_forward'}]};
  rememberBrowseReturn(f.window.history,{source:f.form.action,id:'page:1',href:record(1).route.url,offset:80,open,refine:true});
  try{
   mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);f.flushFrames();f.list.fire('scrollend');
   const cards=f.list.children.map(entry=>entry.children[0]),details=cards.map(card=>card.children.find(node=>node.tag==='details'));
   assert.equal(cards[1].getAttribute('data-search-active'),'');assert.equal(details[0].open,false);assert.equal(details[1].open,open);
   assert.equal(refine.open,true);assert.deepEqual(cards[1].querySelectorAll('a[href]')[0].focusOptions,{preventScroll:true});
   assert.deepEqual(f.window.returnScroll,{x:0,y:40});assert.deepEqual(f.window.history.state,{});
   details[1].fire('toggle');f.list.fire('scrollend');assert.equal(details[1].open,open);
  }finally{f.restore();}
 }}finally{await s.close();}
});

test('decorative search surface never replaces native result identities or empty state',async()=>{
 const records=[record(0),record(1),record(2)];
 const s=await server(records),f=page();const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),getElementById:()=>null};
 try{
  mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);
  assert.equal(f.list.children.length,3);
  assert.equal(f.field.children.length,0,'unsupported canvas leaves no substitute navigation');
  f.input.value='Question 2';f.form.fire('submit');assert.equal(f.list.children.length,1);
  f.input.value='no match';f.form.fire('submit');assert.equal(f.field.hidden,true);assert.equal(f.list.children.length,0);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});

test('native static continuation ordinal is retained without parsing its URL path',async()=>{
 const s=await server(Array.from({length:35},(_,i)=>record(i))),f=page();f.root.setAttribute('data-search-initial-page','2');
 f.window.location.href='https://example.test/any/native/continuation/';
 const oldWindow=globalThis.window,oldDocument=globalThis.document;globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);assert.equal(f.pagers[0].querySelector('p').textContent,'Page 2 of 3');assert.equal(f.history.length,0);}
 finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});

test('a shared page beyond the corpus clamps to its last page instead of disabling search',async()=>{
 const s=await server(Array.from({length:35},(_,i)=>record(i))),f=page();f.window.location.href=f.form.action+'?page=9999';
 const oldWindow=globalThis.window,oldDocument=globalThis.document;globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);assert.equal(f.pagers[0].querySelector('p').textContent,'Page 3 of 3');assert.equal(f.fallback.hidden,true);assert.equal(f.list.children.length,5);}
 finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});

test('full Search links exact native project and classification destinations while absent targets stay plain',async()=>{
 const value=record(0);
 value.projects=[
  {project:{id:'project:one',name:'Exact subject'},relationship:{relation:'about'},landing:{url:'https://other.test/the/declared/landing/',destination:{kind:'cross-site',site:'site:other',content:'page:subject',presentation:{theme:'theme:other'}}}},
  {project:{id:'project:two',name:'Plain mention'},relationship:{relation:'mentions'}},
 ];
 value.classifications=[
  {taxonomy:{id:'taxonomy:topic',label:'Curated topic',destination:{url:'https://example.test/curated/',destination:{kind:'internal-native',site:'site:one',content:'page:taxonomy'}}},term:{id:'term:one',label:'Linked term'},destination:{url:'https://other.test/exact/term/',destination:{kind:'cross-site',site:'site:other',content:'page:term'}}},
  {taxonomy:{id:'taxonomy:topic',label:'Curated topic'},term:{id:'term:two',label:'Plain term'}},
 ];
 const s=await server([value]),f=page();const oldWindow=globalThis.window,oldDocument=globalThis.document;
 f.root.setAttribute('data-search-about','About');f.root.setAttribute('data-search-mentions','Mentions');
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{
  mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);
  const descendants=node=>[node,...node.children.flatMap(descendants)];
  const all=descendants(f.list),links=all.filter(node=>node.tag==='a');
  const subject=links.find(node=>node.textContent==='Exact subject');
  assert.equal(subject.href,'https://other.test/the/declared/landing/');
  assert.equal(subject.getAttribute('data-gazette-destination-kind'),'cross-site');
  assert.equal(subject.getAttribute('data-gazette-destination-theme'),'theme:other');
  assert.equal(subject.getAttribute('rel'),null);
  assert.equal(links.find(node=>node.textContent==='Curated topic').href,'https://example.test/curated/');
  assert.equal(links.find(node=>node.textContent==='Linked term').href,'https://other.test/exact/term/');
  assert.equal(links.some(node=>['Plain mention','Plain term'].includes(node.textContent)),false);
  assert.ok(all.some(node=>node.tag==='span'&&node.textContent==='Plain mention'));
  assert.ok(all.some(node=>node.tag==='span'&&node.textContent==='Plain term'));
  assert.equal(links.filter(node=>node.textContent==='Question 0').length,1,'direct reading action remains separate');
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});


test('partial words use the native bounded prefix matcher and retain AND semantics',()=>{
 const index=createIndex([record(0),record(1)],bounds);
 assert.equal(browseSearch(index,{query:'Quest ans',sort:'relevance',page:1,filters:{}},15).total,2);
 assert.equal(browseSearch(index,{query:'Quest absent',sort:'relevance',page:1,filters:{}},15).total,0);
 assert.equal(browseSearch(index,{query:'uestion',sort:'relevance',page:1,filters:{}},15).total,0,'prefix expansion is not arbitrary substring matching');
});

test('live typing coalesces a frame, resets pagination, and replaces one live history entry',async()=>{
 const s=await server(Array.from({length:35},(_,i)=>record(i))),f=page();
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{
  mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);
  f.pagers[0].fire('click',{target:f.pagers[0].querySelector('.search-page__next')});
  assert.equal(new URL(f.window.location.href).searchParams.get('page'),'2');
  const original=f.list.children[0];
  for(const value of ['Q','Qu','Quest']){f.input.value=value;f.input.fire('input');}
  assert.equal(f.frames.size,1);assert.equal(f.list.children[0],original,'no rendering between keystrokes in the same frame');
  f.flushFrames();
  assert.equal(f.status.textContent,'35 results');assert.notEqual(f.list.children[0],original);
  assert.equal(new URL(f.window.location.href).searchParams.get('page'),null);assert.equal(f.pagers[0].querySelector('p').textContent,'Page 1 of 3');
  assert.equal(f.history.length,2);assert.equal(f.writes.at(-1).mode,'push');
  f.input.value='Quest ans';f.input.fire('input');f.flushFrames();
  assert.equal(f.status.textContent,'35 results');assert.equal(f.history.length,2);assert.equal(f.writes.at(-1).mode,'replace');
  assert.deepEqual(f.fields.project.children.map(node=>node.textContent),['All','Common project (34)','Last project (1)'],'prefix results and facets use the same matching policy');
  assert.equal(new URL(f.history.at(-1)).searchParams.get('q'),'Quest ans');
  const writes=f.writes.length;f.form.fire('submit');assert.equal(f.writes.length,writes,'submitting the same URL does not duplicate history');
  f.input.value='absent';f.input.fire('input');f.flushFrames();
  assert.equal(f.status.textContent,'No results');assert.equal(f.history.length,3,'an explicit submission ends the previous live editing session');
  assert.equal(s.calls,1,'live input reuses the loaded native corpus');
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});

test('IME composition keeps interim text and results until one final live update',async()=>{
 const s=await server([record(0)]),f=page();const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{
  mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);
  const original=f.list.children[0];
  f.input.value='old queued';f.input.fire('input');assert.equal(f.frames.size,1);
  f.input.fire('compositionstart');assert.equal(f.frames.size,0);
  f.input.value='\u9014\u4e2d';f.input.fire('input',{isComposing:true});f.form.fire('submit',{isComposing:true});
  f.flushFrames();assert.equal(f.input.value,'\u9014\u4e2d');assert.equal(f.list.children[0],original);assert.equal(f.writes.length,0);
  f.input.value='Quest';f.input.fire('compositionend');f.input.fire('input');assert.equal(f.frames.size,1);
  f.flushFrames();assert.equal(f.status.textContent,'1 results');assert.equal(f.input.value,'Quest');assert.equal(f.writes.length,1);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});

test('live queries enforce UTF-8 byte limits without replacing successful results or history',async()=>{
 const s=await server([record(0)]),f=page();const message=new Element('p');message.id='query-message';message.hidden=true;f.root.maps.set('.search-page__query-message',message);const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{
  mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);
  const original=f.list.children[0];
  f.input.value='\u754c'.repeat(342);f.input.fire('input');f.flushFrames();
  assert.equal(f.input.validity,'Shorten the search');assert.equal(f.input.reported,undefined);
  assert.equal(f.input.getAttribute('aria-invalid'),'true','the field that failed carries the error');
  assert.equal(f.input.getAttribute('aria-describedby'),'query-message');assert.equal(message.hidden,false);assert.equal(message.textContent,'Shorten the search');
  assert.equal(f.status.textContent,'Shorten the search');assert.equal(f.list.children[0],original);assert.equal(f.writes.length,0);
  f.form.fire('submit');assert.equal(f.input.reported,true);assert.equal(f.writes.length,0);
  f.input.value='a'.repeat(1024);f.input.fire('input');f.flushFrames();
  assert.equal(f.input.validity,'');assert.equal(f.input.getAttribute('aria-invalid'),null);assert.equal(f.input.getAttribute('aria-describedby'),null);assert.equal(message.hidden,true);assert.equal(f.status.textContent,'No results');assert.equal(f.writes.length,1,'exact native byte boundary is admitted');
  f.input.value='Quest';f.input.fire('input');f.flushFrames();assert.equal(f.status.textContent,'1 results');assert.equal(f.input.validity,'');
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});

test('explicit submit, filters, pagination and Back invalidate queued typing without stale rewrites',async()=>{
 const s=await server(Array.from({length:35},(_,i)=>record(i))),f=page();const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{
  mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);
  const queue=()=>{f.input.value='stale';f.input.fire('input');return [...f.frames.values()][0];};
  let stale=queue();f.input.value='Quest';f.form.fire('submit');stale();f.flushFrames();
  assert.equal(f.input.value,'Quest');assert.equal(f.status.textContent,'35 results');assert.equal(f.writes.length,1);
  stale=queue();f.input.value='Quest';f.fields.project.value='project:last';f.form.fire('change',{target:f.fields.project});stale();f.flushFrames();
  assert.equal(f.status.textContent,'1 results');assert.equal(new URL(f.window.location.href).searchParams.get('project'),'project:last');assert.equal(f.writes.length,2);
  f.fields.project.value='';f.form.fire('change',{target:f.fields.project});
  stale=queue();f.pagers[0].fire('click',{target:f.pagers[0].querySelector('.search-page__next')});stale();f.flushFrames();
  assert.equal(f.input.value,'Quest');assert.equal(new URL(f.window.location.href).searchParams.get('page'),'2');
  const writes=f.writes.length;stale=queue();f.window.location.href=f.form.action;f.events.popstate();stale();f.flushFrames();
  assert.equal(f.input.value,'');assert.equal(f.status.textContent,'35 results');assert.equal(f.writes.length,writes);
  stale=queue();f.events.pagehide();stale();f.flushFrames();assert.equal(f.writes.length,writes);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});


test('a no-op input event does not consume the first live history push',async()=>{
 const s=await server([record(0)]),f=page();f.window.location.href=f.form.action+'?q=Quest';
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=f.window;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try{
  mountSearchPage(f.root,{url:s.url,profile:'lexical'});await until(()=>!f.form.hidden);
  f.input.fire('input');f.flushFrames();assert.equal(f.writes.length,0);
  f.input.value='Quest ans';f.input.fire('input');f.flushFrames();
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].mode,'push');
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;await s.close();}
});

test('keyword entry preserves exact authored phrase, filters before paging, and names its context',()=>{
 const phrase='Access / state \u2014 \u03bb';
 const records=Array.from({length:35},(_,i)=>({...record(i),content:{...record(i).content,keywords:i%2?[phrase]:['state']}}));
 const index=createIndex(records,bounds);
 const state=readSearchState('https://example.test/custom/find/?keyword='+encodeURIComponent(phrase));
 assert.equal(state.query,'');assert.equal(state.filters.keyword,phrase);
 const result=browseSearch(index,state,15);assert.equal(result.total,17);assert.equal(result.hits.length,15);
 const facets=index.browse('',{limit:15}).facets;
 assert.deepEqual(describeSearchSelection(state,facets,{keyword:'Keyword'}),{title:phrase,label:'Keyword'});
 assert.deepEqual(readSearchState(searchStateURL('https://example.test/custom/find/',state)),state);
 assert.equal(browseSearch(index,{...state,query:'unmatched'},15).total,0);
 assert.equal(describeSearchSelection(state,{keyword:[]},{keyword:'Keyword'}).title,phrase,'empty results retain selected context');
});


test('selected search context uses a subordinate heading and disappears when cleared', async () => {
 const s=await server([record(0)]), f=page();
 const oldWindow=globalThis.window, oldDocument=globalThis.document;
 const context=new Element('header'), label=new Element('p'), reset=new Element('a');
 context.append(label); context.append(reset);
 context.maps.set('.search-page__context-label',label); context.maps.set('.search-page__reset',reset);
 const originalQuery=context.querySelector.bind(context);
 context.querySelector=selector=>context.children.find(child=>child.tag===selector)||originalQuery(selector);
 context.insertBefore=(child,before)=>{context.children.splice(context.children.indexOf(before),0,child);child.parentElement=context;};
 f.root.maps.set('.search-page__context',context);
 f.window.location.href=f.form.action+'?project=project%3Acommon';
 globalThis.window=f.window; globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:()=>null};
 try {
  mountSearchPage(f.root,{url:s.url,profile:'lexical'}); await until(()=>!f.form.hidden);
  assert.equal(context.hidden,false);
  assert.equal(context.querySelector('h2').textContent,'Common project');
  assert.equal(context.querySelector('h1'),null,'the page retains its sole document heading');
  f.input.value='Question'; f.form.fire('submit');
  assert.equal(context.children.filter(child=>child.tag==='h2').length,1);
  f.fields.project.value=''; f.form.fire('submit');
  assert.equal(context.hidden,true); assert.equal(context.querySelector('h2'),null);
 } finally { globalThis.window=oldWindow; globalThis.document=oldDocument; await s.close(); }
});
