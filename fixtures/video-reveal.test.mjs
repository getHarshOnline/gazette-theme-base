import test from 'node:test';
import assert from 'node:assert/strict';
import { mountVideoReveal, videoRevealFrame, toneFilmPixels } from '../scripts/video-reveal.js';

function fixture({ failDraw = false, treatment, width = 400, height = 300 } = {}) {
  const saved = new Map(), frames = new Map(), timers = new Map(), videos = [], canvases = [], animations = [];
  const install = (name, value) => { saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, {value, writable:true, configurable:true}); };
  class Element extends EventTarget {
    children = []; attrs = new Map();
    append(node) { this.children.push(node); }
    setAttribute(key,value) { this.attrs.set(key,value); }
    removeAttribute(key) { this.attrs.delete(key); if(key==='src') this.src=''; }
    remove() { this.removed=true; }
    closest() { return null; }
  }
  const wrapper = new Element(), element = new Element(), signal = new AbortController().signal;
  wrapper.getBoundingClientRect = () => ({left:20,top:30,width,height});
  const values = {'--layout-portrait-reveal-radius':195,'--motion-portrait-reveal-life':1800,'--material-portrait-reveal-feather':.62,'--material-portrait-reveal-deformation':.12,'--motion-portrait-reveal-cycle':5400,'--layout-portrait-cell':3,'--motion-typing-reveal-duration':'1500ms','--duration-feedback':110};
  values['--color-paper']='rgb(240 235 220)'; values['--color-ink']='rgb(30 40 35)';
  let serial=0, menu=false, compact=false;
  install('getComputedStyle',()=>({getPropertyValue:key=>String(values[key])}));
  install('window',new EventTarget());
  install('requestAnimationFrame',callback=>{frames.set(++serial,callback);return serial;});
  install('cancelAnimationFrame',id=>frames.delete(id));
  Object.assign(window, { requestAnimationFrame, cancelAnimationFrame });
  install('setTimeout',(callback,delay)=>{timers.set(++serial,{callback,delay});return serial;});
  install('clearTimeout',id=>timers.delete(id));
  install('document',{
    baseURI:'https://example.test/', querySelector:selector=>menu && (!selector.includes('[data-navigation-mode="compact"]') || compact)?{}:null,
    createElement(tag) {
      const node=new Element();
      if(tag==='video') {
        Object.assign(node,{videoWidth:1280,videoHeight:720,loads:0,plays:0,pauses:0,src:'',
          load(){this.loads++;},play(){this.plays++;return Promise.resolve();},pause(){this.pauses++;}});
        videos.push(node);
      } else if(tag==='canvas') {
        const context={draws:[],clears:0,globalCompositeOperation:'source-over',clearRect(){this.clears++;},
          fillRect(){},getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w===1&&h===1
            ? [...this.fillStyle.match(/\d+/g).map(Number),255] : [0,0,0,255,128,128,128,255,255,255,255,255])};},
          putImageData(pixels){this.pixels=[...pixels.data];},save(){},restore(){this.globalCompositeOperation='source-over';},
          drawImage(...args){if(failDraw)throw Error('lost context');this.draws.push(args);}};
        node.getContext=()=>context; node.context=context; canvases.push(node);
      } else if(tag==='span') {
        node.animate=()=>{const animation={finished:new Promise(()=>{}),cancel(){this.cancelled=true;}};animations.push(animation);return animation;};
      }
      return node;
    },
  });
  const original={textContent:'A complete heading'};
  const title={children:[],childNodes:[original],textContent:original.textContent,animate(){},replaceChildren(...nodes){this.childNodes=nodes;}};
  const controller=mountVideoReveal({element,wrapper,signal,source:{href:'https://example.test/under.mp4'},titles:[title],treatment});
  const event=(type,pointerType='mouse',interactive=false)=>{
    const e=new Event(type);Object.assign(e,{clientX:200,clientY:150,pointerType});
    wrapper.closest=()=>interactive?{}:null;wrapper.dispatchEvent(e);
  };
  return {controller, videos,canvases,animations,title,original,frames,event,values,
    update:(state={})=>controller.update({motion:true,active:true,animate:true,unload:false,...state}),
    tick(){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(1000));},
    expire(){const callbacks=[...timers.values()];timers.clear();callbacks.forEach(timer=>timer.callback());},
    menu(isCompact=true){menu=true;compact=isCompact;},
    restore(){controller.destroy();for(const [name,descriptor] of saved)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];},
  };
}

test('typing starts on visibility independently of media; cold setup neither downloads nor consumes its once-only reveal',()=>{
  const f=fixture();try{
    f.update({active:false,animate:false});assert.equal(f.animations.length,0);assert.equal(f.videos[0].loads,0);
    f.update();assert.ok(f.animations.length>0);assert.equal(f.videos[0].loads,0);
    const count=f.animations.length;f.update();assert.equal(f.animations.length,count);
    f.update({motion:false,animate:false,unload:true});assert.deepEqual(f.title.childNodes,[f.original]);
  }finally{f.restore();}
});
test('muted underlay loads only on pointing and draws through the shared aperture; exit stops all drawing',()=>{
  const f=fixture();try{
    f.update();f.event('pointermove');const video=f.videos[0];
    assert.equal(video.src,'https://example.test/under.mp4');assert.equal(video.muted,true);assert.equal(video.defaultMuted,true);assert.equal(video.playsInline,true);
    video.dispatchEvent(new Event('playing'));f.tick();
    const output=f.canvases.at(-1).context;assert.equal(output.draws[0][0],video);assert.equal(output.draws[1][0],f.canvases[0]);
    f.event('pointerleave');assert.equal(f.frames.size,0);assert.ok(video.pauses>0);
  }finally{f.restore();}
});
test('touch release gives the underlay time to play, then expires; menu and suspension clear it',()=>{
  const f=fixture();try{
    f.update();f.event('pointerdown','touch');f.event('pointerup','touch');
    f.event('pointerleave','touch');
    f.videos[0].dispatchEvent(new Event('playing'));f.tick();assert.ok(f.frames.size>0);
    f.expire();assert.equal(f.frames.size,0);
    const count=f.videos[0].plays;f.event('pointerdown','mouse',true);assert.equal(f.videos[0].plays,count);
    f.event('pointermove');f.videos[0].dispatchEvent(new Event('playing'));f.menu();f.tick();assert.equal(f.frames.size,0);
    f.update({active:false,animate:false,unload:true});assert.equal(f.videos[0].src,'');
  }finally{f.restore();}
});
test('monochrome treatment samples live frames at the shared cell pitch without changing registration',()=>{
  const f=fixture({treatment:'monochrome'});try{
    f.update();f.event('pointermove');f.videos[0].dispatchEvent(new Event('playing'));f.tick();
    const raster=f.canvases[2],output=f.canvases[1];
    assert.equal(raster.width,Math.ceil(400/3));assert.equal(raster.height,Math.ceil(300/3));
    assert.equal(raster.context.filter,'grayscale(1)');
    assert.deepEqual(raster.context.pixels.slice(0,4),[30,40,35,255]);
    assert.deepEqual(raster.context.pixels.slice(-4),[240,235,220,255]);
    assert.equal(raster.context.draws[0][0],f.videos[0]);
    assert.equal(output.context.draws[0][0],raster);assert.equal(output.context.imageSmoothingEnabled,false);
    const first=raster.context.draws[0];f.tick();assert.deepEqual(raster.context.draws[1],first);
    f.values['--color-paper']='rgb(25 32 28)';f.values['--color-ink']='rgb(225 231 219)';f.tick();
    assert.deepEqual(raster.context.pixels.slice(0,4),[25,32,28,255]);
    assert.deepEqual(raster.context.pixels.slice(-4),[225,231,219,255]);
    assert.equal(output.context.draws[1][0],f.canvases[0]);
    f.controller.destroy();assert.equal(raster.width,0);assert.equal(raster.height,0);
  }finally{f.restore();}
});
test('moving onto a link or scrolling clears an existing aperture',()=>{
  const f=fixture();try{
    f.update();f.event('pointermove');f.videos[0].dispatchEvent(new Event('playing'));f.tick();
    f.event('pointermove','mouse',true);assert.equal(f.frames.size,0);
    f.event('pointermove');f.videos[0].dispatchEvent(new Event('playing'));f.tick();
    window.dispatchEvent(new Event('scroll'));assert.equal(f.frames.size,0);
  }finally{f.restore();}
});
test('expanded desktop navigation allows the reveal; an open compact menu blocks it',()=>{
  const f=fixture();try{
    f.update();f.menu(false);f.event('pointermove');
    assert.equal(f.videos[0].plays,1);
    f.videos[0].dispatchEvent(new Event('playing'));f.tick();
    assert.ok(f.canvases.at(-1).context.draws.length>0);
    f.menu();f.tick();assert.equal(f.frames.size,0);
    f.event('pointermove');assert.equal(f.videos[0].plays,1);
  }finally{f.restore();}
});
test('registered film keeps its supplied subject on the responsive anchor without revealing blank edges',()=>{
  const width=1280,height=720,sourceX=.46,sourceY=.79;
  for(const [w,h,y] of [[1440,900,690],[940,900,620],[390,844,500],[320,568,250]]){
    const bounds={width:w,height:h},targetX=w/2;
    const frame=videoRevealFrame(width,height,bounds,{sourceX,sourceY,targetX,targetY:y});
    assert.ok(Math.abs(frame.x+frame.width*sourceX-targetX)<1e-9);
    assert.ok(Math.abs(frame.y+frame.height*sourceY-y)<1e-9);
    assert.ok(frame.x<=1e-9&&frame.y<=1e-9);
    assert.ok(frame.x+frame.width>=w-1e-9&&frame.y+frame.height>=h-1e-9);
  }
  assert.deepEqual(videoRevealFrame(width,height,{width:400,height:300}),
    videoRevealFrame(width,height,{width:400,height:300},{sourceX:NaN}));
});
test('decode and drawing failures leave a clear overlay and never retry on pointer motion',()=>{
  for(const draw of [false,true]){
    const f=fixture({failDraw:draw});try{
      f.update();f.event('pointermove');
      f.videos[0].dispatchEvent(new Event(draw?'playing':'error'));f.tick();
      const count=f.videos[0].plays;f.event('pointermove');assert.equal(f.videos[0].plays,count);assert.equal(f.frames.size,0);
    }finally{f.restore();}
  }
});

test('film tone mapping preserves alpha and the ordered monochrome range',()=>{
  const pixels=new Uint8ClampedArray([0,0,0,20,128,128,128,127,255,255,255,255]);
  toneFilmPixels(pixels,[20,30,40],[220,230,240]);
  assert.deepEqual([...pixels],[20,30,40,20,120,130,140,127,220,230,240,255]);
});


test('fractional video reveal bounds round upward without changing the media placement', () => {
  const f = fixture({ width:400.2, height:300.1 });
  try {
    f.update(); f.event('pointermove'); const video = f.videos[0];
    video.dispatchEvent(new Event('playing')); f.tick();
    const output = f.canvases.find(canvas => canvas.context.draws.some(draw => draw[0] === video));
    assert.deepEqual([output.width,output.height], [401,301]);
    const expected = videoRevealFrame(video.videoWidth,video.videoHeight,{width:400.2,height:300.1});
    assert.deepEqual(output.context.draws[0].slice(1), [expected.x,expected.y,expected.width,expected.height]);
  } finally { f.restore(); }
});
