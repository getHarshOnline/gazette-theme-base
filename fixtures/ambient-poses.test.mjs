import test from 'node:test';
import assert from 'node:assert/strict';
import { pointerTarget, poseFrames, mountAmbientPoses } from '../scripts/ambient-poses.js';
import { poseWeights, similarityPoses } from '../scripts/portrait-poses.js';
import { registeredVertices } from '../scripts/portrait-gpu.js';

const names = ['front','left','right','up','down'];
const model = () => ({anchor:[.5,.25],aperture:[.31,.38],pupils:Object.fromEntries(names.map(name=>[name,[[.1,.2],[.9,.2]]])),landmarks:Object.fromEntries(names.map(name=>[name,[[.1,.2],[.9,.2]]])),frames:Object.fromEntries(names.map(name=>[name,[2,2]]))});
const links = () => names.map(name=>({textContent:name,href:`https://example.test/${name}.png`}));
const settle = async () => { for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve)); };

test('rigid registration preserves round features through intermediate diagonal gaze',()=>{
  const landmarks={front:[[.3,.3],[.6,.3]],left:[[.2,.35],[.5,.4]],right:[[.45,.3],[.75,.25]],up:[[.3,.2],[.6,.2]],down:[[.3,.4],[.6,.4]]};
  const mesh=similarityPoses(landmarks,100,100);
  for(const [x,y] of [[0,0],[.01,0],[.49,.2],[.51,.2],[-.8,.5],[1,1]]){
    const weights=poseWeights(x,y), packed=registeredVertices(mesh,weights,100,100);
    assert.ok(packed);assert.ok(Math.abs(weights.reduce((s,w)=>s+w.weight,0)-1)<1e-12);
    const targets=mesh.target;
    assert.deepEqual([...packed.filter((_,i)=>i%8<2)],[-1,1,1,1,1,-1,-1,1,1,-1,-1,-1],'authored camera drift never moves the destination head plane');
    const u=targets[1].map((v,i)=>v-targets[0][i]),v=targets[3].map((n,i)=>n-targets[0][i]);
    assert.ok(Math.abs(Math.hypot(...u)-Math.hypot(...v))<1e-10,'no nonuniform scaling');
    assert.ok(Math.abs(u[0]*v[0]+u[1]*v[1])<1e-10,'no skew');
  }
  assert.ok(Math.abs(poseWeights(.501,0)[1].weight-poseWeights(.499,0)[1].weight)<.003,'no sector discontinuity');
  assert.equal(similarityPoses({...landmarks,down:[[.5,.5],[.5,.5]]},100,100),null);
});

test('pointer targets follow the source anchor after responsive cover cropping',()=>{
  const frame={width:200,height:100}, bounds={left:10,top:20,width:100,height:100};
  assert.deepEqual(pointerTarget({x:60,y:45},bounds,frame,[.5,.25]),[0,0]);
  assert.deepEqual(pointerTarget({x:110,y:45},bounds,frame,[.5,.25]),[1,0]);
  assert.deepEqual(pointerTarget({x:10,y:45},bounds,frame,[.5,.25]),[-1,0]);
  assert.deepEqual(pointerTarget({x:-100,y:-100},bounds,frame,[.5,.25]),[-1,-1]);
  assert.deepEqual(pointerTarget({x:1000,y:1000},bounds,frame,[.5,.25]),[1,1]);
  assert.deepEqual(pointerTarget({x:60,y:57.5},bounds,frame,[.5,.25],'contain'),[0,0]);
  assert.deepEqual(pointerTarget(null,bounds,frame,[.5,.25]),[0,0]);
});

test('pose metadata consumes resolved content links and rejects incomplete or unsafe frames',()=>{
  const wrapper={ownerDocument:{baseURI:'https://example.test/'},querySelectorAll:()=>links()};
  assert.equal(poseFrames(wrapper,model()).length,5);
  for(const mutate of [m=>delete m.landmarks,m=>m.anchor=[2,0],m=>m.aperture=[.5,.3],m=>delete m.frames.up,m=>m.frames.front=[0,2],m=>m.frames.down=[2,NaN]]){
    const m=model();mutate(m);assert.equal(poseFrames(wrapper,m),null);
  }
  for(const href of ['javascript:alert(1)','data:image/png;base64,AA','http://[']){
    const list=links();list[0].href=href;assert.equal(poseFrames({...wrapper,querySelectorAll:()=>list},model()),null);
  }
});

function rig({finePointer=true,decodeFailure=false,noGPU=false}={}){
  const originals=new Map();
  const install=(key,value)=>{originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
  class Node extends EventTarget {
    children=[];attrs=new Map();ownerDocument={baseURI:'https://example.test/'};
    setAttribute(k,v){this.attrs.set(k,v);}getAttribute(k){return this.attrs.get(k)??null;}removeAttribute(k){this.attrs.delete(k);}
    append(n){this.children.push(n);}remove(){this.removed=true;}
    getBoundingClientRect(){return {left:0,top:0,width:200,height:200};}
  }
  const doc=new Node(), win=new Node(), wrapper=new Node(), hero=new Node();
  const draws=[],bitmaps=[],requests=[],surfaces=[],uniforms=[],apertures=[];let observer,serial=0,now=0;
  const pending=new Map(),fine=new Node(),preference=new Node();fine.matches=finePointer;preference.matches=false;
  wrapper.querySelectorAll=()=>links();wrapper.querySelector=selector=>selector==='.ambient-still img'?{alt:'A mechanical observer'}:hero;
  doc.documentElement={dataset:{}};doc.hidden=false;
  doc.createElement=name=>{
    assert.equal(name,'canvas');const canvas=new Node();
    canvas.getContext=kind=>kind==='webgl'?(noGPU?null:new Proxy({MAX_TEXTURE_SIZE:1,FRAMEBUFFER_COMPLETE:2,getParameter:()=>8192,getShaderParameter:()=>true,getProgramParameter:()=>true,checkFramebufferStatus:()=>2,getUniformLocation:(_,name)=>name,uniform1f:(name,value)=>uniforms.push([name,value])},{get:(target,key)=>key in target?target[key]:()=>({})})):({getImageData(){return {width:2,height:2,data:new Uint8ClampedArray(16)};},save(){},restore(){},createRadialGradient(...args){apertures.push(args);return {addColorStop(){}};},fillRect(){},clearRect(){},drawImage(source,...args){draws.push({source,args,target:canvas});}});surfaces.push(canvas);return canvas;
  };
  win.createImageBitmap=true;
  win.IntersectionObserver=class{constructor(fn){observer=this;this.fn=fn;}observe(){}disconnect(){this.disconnected=true;}};
  install('window',win);install('document',doc);install('IntersectionObserver',win.IntersectionObserver);
  install('matchMedia',query=>query.includes('pointer')?fine:preference);
  install('getComputedStyle',()=>({objectFit:'cover',getPropertyValue(name){return {'--gaze-tracking-rate':'6.5','--gaze-step-limit':'50ms'}[name];}}));
  install('requestAnimationFrame',fn=>{pending.set(++serial,fn);return serial;});install('cancelAnimationFrame',id=>pending.delete(id));
  Object.assign(window, { requestAnimationFrame, cancelAnimationFrame });
  install('performance',{now:()=>now});
  install('fetch',async url=>{requests.push(url);if(decodeFailure===true||typeof decodeFailure==='string'&&url.endsWith('/'+decodeFailure+'.png'))throw Error('missing');return {ok:true,blob:async()=>({url})};});
  install('createImageBitmap',async blob=>{const bitmap={width:2,height:2,url:blob.url,closed:false,close(){this.closed=true;}};bitmaps.push(bitmap);return bitmap;});
  const destroy=mountAmbientPoses({wrapper,model:model()});
  return {wrapper,hero,doc,win,fine,preference,draws,bitmaps,requests,pending,surfaces,uniforms,apertures,
    visibility(value){observer.fn([{isIntersecting:value}]);},
    pointer(x,y){const event=new Event('pointermove');Object.assign(event,{pointerType:'mouse',clientX:x,clientY:y});wrapper.dispatchEvent(event);},
    tick(){now+=16;const work=[...pending.values()];pending.clear();work.forEach(fn=>fn(now));},
    close(){destroy?.();for(const[key,value]of originals)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];},
    get disconnected(){return observer.disconnected;},destroy};
}

test('all poses prepare before continuous rendering; gaze settles and releases every resource',async()=>{
  const f=rig();try{
    await settle();assert.equal(f.requests.length,0);
    f.visibility(true);await settle();f.tick();assert.equal(f.wrapper.getAttribute('data-ambient-ready'),'true');
    assert.equal(f.surfaces[0].getAttribute('role'),'img');
    assert.equal(f.apertures.length,2,'only the two optical interiors may change');
    for (const [x,y,inner,outerX,outerY,outer] of f.apertures) {
      assert.equal(x,outerX); assert.equal(y,outerY);
      assert.ok(inner > 0 && outer > inner && outer < .8,'feather stays inside each lens; outer silhouette is fixed');
    }
    assert.equal(f.surfaces[0].getAttribute('aria-label'),'A mechanical observer');
    f.pointer(200,50);
    for(let i=0;i<40;i++){f.tick();await settle();}
    assert.ok(f.requests.some(url=>url.endsWith('/right.png')));
    const bodyPaints=f.draws.filter(({source,target})=>target===f.surfaces[1]&&source===f.surfaces[4]);
    assert.equal(bodyPaints.length,1,'the source body is copied once, never shifted by gaze');
    assert.equal(f.requests.length,5,'bounded complete pose set loads once');
    assert.ok(f.uniforms.some(([name,value])=>name==='uDither'&&value===1));
    assert.ok(f.draws.every(({args})=>args.length===2||args.length===4),'only whole-frame drawImage calls');
    f.wrapper.dispatchEvent(new Event('pointerleave'));
    for(let i=0;i<100;i++){f.tick();await settle();}
    assert.equal(f.pending.size,0);
    assert.ok(f.draws.some(({source})=>source.url?.endsWith('/front.png')));
    f.visibility(false);assert.ok(f.bitmaps.every(bitmap=>bitmap.closed));assert.equal(f.pending.size,0);
    assert.equal(f.wrapper.getAttribute('data-ambient-ready'),null);
    f.visibility(true);await settle();f.destroy();assert.ok(f.disconnected);assert.equal(f.pending.size,0);
  }finally{f.close();}
});

test('coarse pointers, reduced motion, background and decode failure preserve native still',async()=>{
  for(const options of [{finePointer:false},{decodeFailure:true},{}]){
    const f=rig(options);try{
      f.visibility(true);
      if(options.decodeFailure){f.pointer(200,50);for(let i=0;i<40;i++)f.tick();}
      await settle();
      if(options.decodeFailure)assert.deepEqual(f.requests,['https://example.test/front.png'],'a missing front cannot expose a head without its body');
      if(options.finePointer===false||options.decodeFailure){assert.equal(f.wrapper.getAttribute('data-ambient-ready'),null);}
      else{
        f.doc.documentElement.dataset.motion='reduce';f.doc.dispatchEvent(new Event('motion-preference'));
        assert.equal(f.wrapper.getAttribute('data-ambient-ready'),null);assert.equal(f.pending.size,0);
        f.doc.documentElement.dataset.motion='allow';f.doc.dispatchEvent(new Event('motion-preference'));await settle();
        f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(f.pending.size,0);
        assert.ok(f.bitmaps.every(bitmap=>bitmap.closed));
      }
    }finally{f.close();}
  }
});


test('unavailable GPU or a missing late pose never exposes partial artwork',async()=>{
  for(const options of [{noGPU:true},{decodeFailure:'down'}]){
    const f=rig(options);try{
      f.visibility(true);await settle();f.tick();
      assert.equal(f.wrapper.getAttribute('data-ambient-ready'),null);
      assert.equal(f.pending.size,0);
      assert.ok(f.bitmaps.every(bitmap=>bitmap.closed));
      assert.equal(f.requests.length,options.noGPU?0:5);
    }finally{f.close();}
  }
});
