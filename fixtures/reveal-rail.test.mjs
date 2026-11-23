import test from 'node:test';
import assert from 'node:assert/strict';
import { railRevealOffset, mountRevealRail } from '../scripts/reveal-rail.js';
const rail={scrollLeft:0,scrollWidth:1080,clientWidth:880,getBoundingClientRect:()=>({left:350,right:1230})};
const card=(left,right)=>({parentElement:rail,getBoundingClientRect:()=>({left,right})});
test('reveals only the clipped portion and clamps at either rail boundary',()=>{
 assert.equal(railRevealOffset(rail,card(1070,1410),12),192);
 assert.equal(railRevealOffset({...rail,scrollLeft:200},card(162,502),12),0);
 assert.equal(railRevealOffset(rail,card(370,710),12),0);
 assert.equal(railRevealOffset(rail,card(1200,1540),12),200);
});
test('hover and keyboard entry reveal the same card without repeated scrolling while crossing its children',()=>{
 const listeners={},calls=[];rail.addEventListener=(name,fn)=>listeners[name]=fn;rail.scrollTo=args=>calls.push(args);
 const original=globalThis.getComputedStyle;globalThis.getComputedStyle=()=>({paddingInlineStart:'12px'});
 try{
  const controller=new AbortController();let motion=true;
  mountRevealRail(rail,{signal:controller.signal,motionAllowed:()=>motion});
  const right=card(1070,1410),event={type:'pointerover',target:{closest:()=>right}};
  listeners.pointerover(event);listeners.pointerover(event);
  assert.deepEqual(calls,[{left:192,behavior:'smooth'}]);
  listeners.pointerleave();motion=false;listeners.focusin({...event,type:'focusin'});
  assert.deepEqual(calls.at(-1),{left:192,behavior:'instant'});
 }finally{globalThis.getComputedStyle=original;}
});
