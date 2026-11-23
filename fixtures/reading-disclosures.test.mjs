import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../scripts/reading-disclosures.js', import.meta.url), 'utf8').replaceAll('export function', 'function');
function fixture({ placement='beside',position='static',focused=false }={}) {
  const observers=[],events={},summary={addEventListener(type,fn){this[type]=fn;}};
  const control={}; const disclosure={open:false,contains(node){return node===control;},querySelector(){return summary;}};
  const outline={querySelectorAll(){return [disclosure];}};
  const document={documentElement:{},activeElement:focused?control:null,querySelectorAll(selector){return selector==='.reading-outline,.reading-corpus'?[outline]:[];}};
  const window={addEventListener(type,fn){events[type]=fn;}};
  vm.runInNewContext(source+'\nmountReadingDisclosures();',{document,window,getComputedStyle(){return{position,getPropertyValue(){return placement;}};},ResizeObserver:class{constructor(fn){observers.push(fn);}observe(){}}});
  return{disclosure,summary,document,control,events,resize(next){placement=next;for(const fn of observers)fn();}};
}
test('wrapper-owned beside composition opens a static outline; CSS position is not the contract',()=>{
  const f=fixture();assert.equal(f.disclosure.open,true);f.resize('flow');assert.equal(f.disclosure.open,false);f.resize('beside');assert.equal(f.disclosure.open,true);
  assert.equal(fixture({placement:'flow',position:'sticky'}).disclosure.open,false);
});
test('an explicit reader choice survives every composition change',()=>{
  const f=fixture();f.summary.click();f.disclosure.open=false;f.resize('flow');f.resize('beside');assert.equal(f.disclosure.open,false);
});
test('recomposition never closes a disclosure containing focus',()=>{
  const f=fixture();f.document.activeElement=f.control;f.resize('flow');assert.equal(f.disclosure.open,true);
});
test('print recomposition does not overwrite the reading disclosure state',()=>{
  const f=fixture();f.events.beforeprint();f.resize('flow');assert.equal(f.disclosure.open,true);
  f.events.afterprint();f.resize('beside');assert.equal(f.disclosure.open,true);
  f.resize('flow');assert.equal(f.disclosure.open,false);
});

function railFixture({ height=500, corpusHeight=300, outlineHeight=280, focus=null }={}) {
  const observers=[],listeners={};
  let placement='beside';
  const document={documentElement:{},activeElement:focus};
  const panel=(name,fullHeight)=>{
    const handlers={};
    const disclosure={name,open:true,height:fullHeight,summaryHeight:48,inRail:true,
      querySelector(){return summary;},
      contains(node){return node===disclosure.control;},
      closest(selector){return selector==='.reading-outline'&&name==='outline'?{}:null;}};
    disclosure.control={};
    const summary={addEventListener(type,fn){handlers[type]=fn;},click(){handlers.click?.();disclosure.open=!disclosure.open;}};
    return{disclosure,summary};
  };
  const corpus=panel('corpus',corpusHeight),outline=panel('outline',outlineHeight),items=[corpus.disclosure,outline.disclosure];
  const rail={ownerDocument:document,querySelectorAll(){return items;},contains(node){return node.inRail;},
    get scrollHeight(){return items.filter(item=>item.inRail).reduce((sum,item)=>sum+(item.open?item.height:item.summaryHeight),24);},
    get clientHeight(){return Math.min(height,this.scrollHeight);}};
  const context={document,window:{addEventListener(type,fn){(listeners[type]??=[]).push(fn);}},
    getComputedStyle(){return{getPropertyValue(){return placement;}};},
    ResizeObserver:class{constructor(fn){observers.push(fn);}observe(){}}};
  vm.runInNewContext(source+'\nglobalThis.controller=mountReadingRail(rail);',{...context,rail});
  return{rail,corpus,outline,document,resize(nextHeight){height=nextHeight;observers.forEach(fn=>fn());},
    setPlacement(next){placement=next;observers.forEach(fn=>fn());},
    event(type){for(const fn of listeners[type]||[])fn();}};
}
test('overflowing paired navigation initially collapses corpus while keeping local outline available',()=>{
 const f=railFixture();
 assert.equal(f.corpus.disclosure.open,false);assert.equal(f.outline.disclosure.open,true);
 const roomy=railFixture({height:900});
 assert.equal(roomy.corpus.disclosure.open,true);assert.equal(roomy.outline.disclosure.open,true);
});
test('opening either constrained group closes its peer and survives a resize',()=>{
 const f=railFixture();
 f.corpus.summary.click();assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,false);
 f.resize(480);assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,false);
 f.outline.summary.click();assert.equal(f.corpus.disclosure.open,false);assert.equal(f.outline.disclosure.open,true);
 f.outline.summary.click();f.resize(470);assert.equal(f.corpus.disclosure.open,false);assert.equal(f.outline.disclosure.open,false);
});
test('viewport and changed content metrics govern the default rather than item counts',()=>{
 const f=railFixture({height:900});
 f.corpus.disclosure.height=650;f.resize(900);
 assert.equal(f.corpus.disclosure.open,false);assert.equal(f.outline.disclosure.open,true);
 f.resize(1100);assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,true);
});
test('reflow does not collapse focused navigation and compact relocation does not create a false pair',()=>{
 const f=railFixture({height:900});f.document.activeElement=f.corpus.disclosure.control;f.resize(400);
 assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,false);
 f.outline.disclosure.inRail=false;f.corpus.disclosure.open=true;f.setPlacement('flow');
 assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,false);
});
test('paired navigation prints complete content and restores the reader selection afterward',()=>{
 const f=railFixture();f.corpus.summary.click();
 f.event('beforeprint');assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,true);
 f.resize(300);assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,true);
 f.event('afterprint');assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,false);
});

test('duplicate print events keep the original paired-navigation disclosure choices',()=>{
 const f=railFixture();f.corpus.summary.click();
 assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,false);
 f.event('beforeprint');f.event('beforeprint');
 assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,true);
 f.event('afterprint');
 assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,false);
 f.event('afterprint');f.resize(480);
 assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,false);
});


test('long collection and local TOC use available height, leaving the selected long group scrollable',()=>{
 const f=railFixture({height:700,corpusHeight:1360,outlineHeight:420});
 assert.equal(f.corpus.disclosure.open,false);assert.equal(f.outline.disclosure.open,true);
 f.corpus.summary.click();
 assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,false);
 assert.ok(f.rail.scrollHeight>f.rail.clientHeight,'one long native group remains available through the rail scrollport');
 assert.equal(f.corpus.disclosure.inRail,true);assert.equal(f.outline.disclosure.inRail,true,'collapsing does not remove or reparent the other group');
 f.resize(2100);
 assert.equal(f.corpus.disclosure.open,true);assert.equal(f.outline.disclosure.open,false,'more room does not overwrite explicit reader selection');
 const roomy=railFixture({height:1900,corpusHeight:1360,outlineHeight:420});
 assert.equal(roomy.corpus.disclosure.open,true);assert.equal(roomy.outline.disclosure.open,true,'the same long content can open together when it actually fits');
 roomy.resize(700);
 assert.equal(roomy.corpus.disclosure.open,false);assert.equal(roomy.outline.disclosure.open,true,'actual viewport pressure collapses the default peer');
});
