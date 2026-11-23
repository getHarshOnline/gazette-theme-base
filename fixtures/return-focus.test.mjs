import test from 'node:test';
import assert from 'node:assert/strict';
import { mountReturnFocus, rememberSearchReturn, rememberBrowseReturn, takeBrowseReturn, catalogueReturn, rememberCatalogueReturn } from '../scripts/return-focus.js';

function fixture({ state = null, navigation = 'back_forward' } = {}) {
  const original = new Map(), handlers = new Map(), frames = new Map();
  const install = (key,value) => { original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true}); };
  let serial = 0, replacements = 0;
  const document = { body:{}, documentElement:{}, links:[], activeElement:null,
    querySelector:()=>null, querySelectorAll:()=>document.links };
  document.activeElement=document.body;
  const link={id:'',href:'https://example.test/product/',attrs:{'data-gazette-link':'content:directory#link-2'},isConnected:true,visible:true,blocked:false,
    getAttribute(key){return this.attrs[key]??null;},hasAttribute(key){return Object.hasOwn(this.attrs,key);},
    closest(selector){return selector==='a[href]'?this:this.blocked?this:null;},
    getClientRects(){return this.visible?[{}]:[];},focus(options){this.focusOptions=options;document.activeElement=this;}};
  document.links=[link];
  const window={addEventListener(type,fn,options){
    const entry={fn,active:true};if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(entry);
    options?.signal?.addEventListener('abort',()=>entry.active=false,{once:true});
  }};
  const history={state,replaceState(value){this.state=value;replacements++;}};
  install('document',document);install('window',window);install('history',history);
  install('location',{href:'https://example.test/directory/'});
  install('performance',{getEntriesByType:()=>[{type:navigation}]});
  install('getComputedStyle',()=>({visibility:'visible',display:'inline'}));
  install('requestAnimationFrame',fn=>{frames.set(++serial,fn);return serial;});
  install('cancelAnimationFrame',id=>frames.delete(id));
  const fire=(type,extra={})=>{const event={isTrusted:true,button:0,target:link,...extra};for(const h of handlers.get(type)||[])if(h.active)h.fn(event);};
  return {document,link,history,fire,frames,get replacements(){return replacements;},
    flush(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());},
    restore(){for(const [key,descriptor] of original)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}};
}

test('history traversal restores the exact link after exposure without replacing scroll or native navigation',()=>{
 const f=fixture({state:{existing:'retained'}});const dispose=mountReturnFocus();
 try{
  f.fire('click');assert.equal(f.replacements,1);assert.equal(f.history.state.existing,'retained');
  f.fire('pageshow');f.flush();assert.equal(f.document.activeElement,f.document.body);
  f.flush();assert.equal(f.document.activeElement,f.link);assert.deepEqual(f.link.focusOptions,{preventScroll:true});
 }finally{dispose();f.restore();}
});

test('reload and new visits do not restore; BFCache preserves an existing native focus target',()=>{
 for(const navigation of ['reload','navigate']){
  const f=fixture({navigation});const dispose=mountReturnFocus();
  try{f.fire('click');f.fire('pageshow');f.flush();f.flush();assert.equal(f.document.activeElement,f.document.body);
   const native={};f.document.activeElement=native;f.fire('pageshow',{persisted:true});f.flush();f.flush();assert.equal(f.document.activeElement,native);
  }finally{dispose();f.restore();}
 }
});

test('new trusted input, page exit and disposal cancel pending return work',()=>{
 for(const action of ['keydown','pointerdown','wheel','touchstart','pagehide','dispose']){
  const f=fixture();const dispose=mountReturnFocus();
  try{f.fire('click');f.fire('pageshow');f.flush();if(action==='dispose')dispose();else f.fire(action);f.flush();assert.equal(f.document.activeElement,f.document.body);assert.equal(f.frames.size,0);}
  finally{dispose();f.restore();}
 }
});

test('ambiguous, changed, removed, hidden and inert occurrences are never forced visible',()=>{
 for(const action of ['duplicate','changed','removed','hidden','inert']){
  const f=fixture();const dispose=mountReturnFocus();
  try{f.fire('click');
   if(action==='duplicate')f.document.links.push({...f.link});
   if(action==='changed')f.link.href='https://example.test/other/';
   if(action==='removed')f.document.links=[];
   if(action==='hidden')f.link.visible=false;
   if(action==='inert')f.link.blocked=true;
   f.fire('pageshow');f.flush();f.flush();assert.equal(f.document.activeElement,f.document.body,action);
  }finally{dispose();f.restore();}
 }
});

test('a carousel ring clone of the followed link leaves the live link the one return target',()=>{
 const f=fixture();const dispose=mountReturnFocus();
 try{f.fire('click');
  // A decorative clone keeps the key and address but sits inside an inert, aria-hidden card.
  const clone={...f.link,blocked:true,focus(){throw new Error('a decorative clone is never focused');}};f.document.links.push(clone);
  f.fire('pageshow');f.flush();f.flush();assert.equal(f.document.activeElement,f.link);
 }finally{dispose();f.restore();}
});

test('native modified, cancelled, new-context, download, mail and same-document activations do not write history',()=>{
 for(const action of ['modified','cancelled','new-context','download','mail','fragment','synthetic']){
  const f=fixture();const dispose=mountReturnFocus();
  try{const event={};
   if(action==='modified')event.ctrlKey=true;
   if(action==='cancelled')event.defaultPrevented=true;
   if(action==='new-context')f.link.attrs.target='_blank';
   if(action==='download')f.link.attrs.download='';
   if(action==='mail')f.link.href='mailto:test@example.test';
   if(action==='fragment')f.link.href='https://example.test/directory/#part';
   if(action==='synthetic')event.isTrusted=false;
   f.fire('click',event);assert.equal(f.replacements,0,action);
  }finally{dispose();f.restore();}
 }
});

test('unknown state shapes and unidentifiable links remain native',()=>{
 for(const state of [1,'native',[],new Date()]){
  const f=fixture({state});const dispose=mountReturnFocus();
  try{f.fire('click');assert.equal(f.replacements,0);assert.equal(f.history.state,state);}
  finally{dispose();f.restore();}
 }
 const f=fixture();const dispose=mountReturnFocus();
 try{delete f.link.attrs['data-gazette-link'];f.fire('click');assert.equal(f.replacements,0);}
 finally{dispose();f.restore();}
});

test('Search return consumes only its own marker, restores exact native context and retains other history owners',()=>{
 const f=fixture({state:{existing:'retained'}});let restored;
 const dispose=mountReturnFocus({restoreSearch:(saved,context)=>restored={saved,context}});
 try{
  assert.equal(rememberSearchReturn({query:'  answer ',id:'content:answer',url:f.link.href},f.link),true);
  f.fire('pageshow');assert.equal(f.history.state.existing,'retained');
  assert.equal(f.history.state['gazette:return-focus'],undefined);
  f.flush();f.flush();
  assert.equal(restored.saved.query,'  answer ');assert.equal(restored.saved.id,'content:answer');
  assert.equal(restored.context.invoker,f.link);assert.equal(restored.context.isCurrent(),true);
  f.fire('keydown');assert.equal(restored.context.isCurrent(),false);
 }finally{dispose();f.restore();}
});

test('Search never reopens for a new visit, new input, native recovered focus or later unrelated traversal',()=>{
 for(const action of ['navigate','input','native-focus','dismissed']){
  const f=fixture({navigation:action==='navigate'?'navigate':'back_forward'});let restores=0;
  const dispose=mountReturnFocus({restoreSearch:()=>restores++});
  try{
   rememberSearchReturn({query:'answer',id:'content:answer',url:f.link.href},f.link);
   f.fire('pageshow');
   if(action==='input')f.fire('pointerdown');
   if(action==='native-focus')f.document.activeElement=f.link;
   f.flush();f.flush();
   if(action==='dismissed'){
    assert.equal(restores,1);f.fire('pageshow');f.flush();f.flush();assert.equal(restores,1);
   }else assert.equal(restores,0,action);
  }finally{dispose();f.restore();}
 }
});

test('Search history accepts only bounded context and leaves unknown native state untouched',()=>{
 const f=fixture({state:{other:'kept'}});const dispose=mountReturnFocus();
 try{
  for(const value of [null,{}, {query:'x',id:'',url:f.link.href},{query:'x'.repeat(17000),id:'content:a',url:f.link.href},{query:'x',id:'content:a',url:f.link.href,scrollTop:Infinity},{query:'x',id:'content:a',url:f.link.href,scrollTop:-1}]){
   assert.equal(rememberSearchReturn(value,f.link),false);assert.equal(f.replacements,0);
  }
  f.history.state=[];assert.equal(rememberSearchReturn({query:'x',id:'content:a',url:f.link.href},f.link),false);
 }finally{dispose();f.restore();}
});

test('full-page Search return preserves exact result context without overwriting another history owner',()=>{
 const history={state:{other:'retained'},replaceState(next){this.state=next;}};
 const saved={source:'https://example.test/search/?keyword=access&page=2',id:'article:one',href:'https://example.test/article/',offset:215,open:true,refine:false};
 assert.equal(rememberBrowseReturn(history,saved),true);assert.equal(history.state.other,'retained');
 assert.equal(takeBrowseReturn(history,'https://example.test/search/'),null,'a different query cannot consume the return');
 assert.deepEqual(takeBrowseReturn(history,saved.source),saved);assert.deepEqual(history.state,{other:'retained'});
 assert.equal(takeBrowseReturn(history,saved.source),null,'a restored state is consumed once');
 assert.equal(rememberBrowseReturn(history,{...saved,offset:Infinity}),false);
 assert.equal(rememberBrowseReturn(history,{...saved,id:''}),false);
});

test('catalogue return is scoped to a source entry and component address', () => {
 const history = { state: { other: 'retained' }, replaceState(next) { this.state = next; } };
 const first = 'content:directory#component-1', second = 'content:directory#component-2';
 rememberCatalogueReturn(history, first, 'content:research', true);
 rememberCatalogueReturn(history, second, 'https://example.test/product/', false);
 assert.equal(history.state.other, 'retained');
 assert.deepEqual(catalogueReturn(history, first, 'back_forward'), { destination: 'content:research', paused: true });
 assert.deepEqual(catalogueReturn(history, second, 'back_forward'), { destination: 'https://example.test/product/', paused: false });
 assert.equal(catalogueReturn(history, first, 'navigate'), null);
 assert.equal(catalogueReturn(history, first, 'reload'), null);
 assert.equal(catalogueReturn(history, 'content:directory#component-3', 'back_forward'), null);
 rememberCatalogueReturn(history, first, '', false);
 assert.equal(catalogueReturn(history, first, 'back_forward').destination, 'content:research');
});
