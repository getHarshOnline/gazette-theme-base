import test from 'node:test';
import assert from 'node:assert/strict';
import { mountScrollPassage } from '../scripts/scroll-passage.js';

test('passage copy reverses by position, stays readable under focus/reduction and restores on disposal',()=>{
 const keys=['window','document','innerHeight','matchMedia','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'];
 const original=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const install=(key,value)=>Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 const frames=new Map();let id=0,top=600;
 const node={style:{opacity:'author',filter:'author'},contains:element=>element===node,
   getBoundingClientRect:()=>({top,height:100})};
 const root=new EventTarget();root.querySelectorAll=()=>[node];
 const doc=new EventTarget();doc.documentElement={dataset:{motion:'allow'}};
 const media=new EventTarget();media.matches=false;
 const frame=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};
 try{
  install('window',new EventTarget());install('document',doc);install('innerHeight',600);
  install('matchMedia',()=>media);install('getComputedStyle',()=>({getPropertyValue:()=>4}));
  install('requestAnimationFrame',fn=>{frames.set(++id,fn);return id;});install('cancelAnimationFrame',key=>frames.delete(key));
  const dispose=mountScrollPassage(root,{reveal:'p',window:[0,.2,.8,1]});frame();
  assert.equal(node.style.opacity,'0');
  top=250;window.dispatchEvent(new Event('scroll'));frame();assert.equal(node.style.opacity,'1');
  top=600;window.dispatchEvent(new Event('scroll'));frame();assert.equal(node.style.opacity,'0');
  top=250;window.dispatchEvent(new Event('scroll'));frame();assert.equal(node.style.opacity,'1');
  top=-100;window.dispatchEvent(new Event('scroll'));frame();assert.equal(node.style.opacity,'0');
  doc.activeElement=node;root.dispatchEvent(new Event('focusin'));frame();assert.equal(node.style.opacity,'1');
  doc.activeElement=null;doc.documentElement.dataset.motion='reduce';doc.dispatchEvent(new Event('motion-preference'));frame();
  assert.equal(node.style.opacity,'author');assert.equal(node.style.filter,'author');
  window.dispatchEvent(new Event('beforeprint'));assert.equal(node.style.opacity,'author');
  dispose();window.dispatchEvent(new Event('scroll'));assert.equal(frames.size,0);assert.equal(node.style.opacity,'author');
 }finally{for(const [key,value]of original)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];}
});

test('malformed passage windows never alter native content',()=>{
 const root={querySelectorAll(){throw new Error('native content was queried');}};
 for(const window of [undefined,[],[0,.8,.2,1],[-1,.2,.8,1],[0,.2,1,Infinity]])
   assert.equal(mountScrollPassage(root,{reveal:'p',window}),undefined);
});
