import test from 'node:test';
import assert from 'node:assert/strict';
import {mountFilmSurface} from '../scripts/film-surface.js';
import {launch} from './lib/browser.mjs';

// Neutral event/lifecycle coverage. Browser hit testing, texture rendering and visual
// fidelity remain separate checks; this harness does not simulate those outcomes.
function environment() {
  const originals=new Map(), frames=new Map();let serial=0;
  const install=(key,value)=>{originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
  class Node extends EventTarget {
    constructor(){super();this.dataset={};this.style={};this.attrs=new Map();this.children=[];}
    append(node){this.children.push(node);}
    setAttribute(key,value){this.attrs.set(key,value);}
    contains(node){return this===node||this.children.some(child=>child.contains(node));}
    closest(selector){return selector==='[data-gazette-component]'?wrapper:this.link?this:null;}
    remove(){this.removed=true;}
  }
  const wrapper=new Node(),grain=new Node(),stage=new Node(),content=new Node(),outside=new Node();
  wrapper.append(content);wrapper.querySelector=()=>grain;
  let rect={top:0,bottom:1200};wrapper.getBoundingClientRect=()=>rect;
  const win=new EventTarget(),doc=new EventTarget(),fine=new EventTarget(),reduced=new EventTarget();
  doc.documentElement=new Node();doc.hidden=false;doc.createElement=()=>new Node();fine.matches=true;reduced.matches=false;
  install('window',win);install('document',doc);install('innerHeight',600);install('devicePixelRatio',2);
  install('matchMedia',query=>query.includes('pointer: fine')?fine:reduced);
  install('getComputedStyle',()=>({getPropertyValue:name=>({'--film-pointer-rate':14,'--film-pointer-hover-scale':1.9,'--film-step-limit':'50ms'})[name]}));
  install('requestAnimationFrame',fn=>{frames.set(++serial,fn);return serial;});install('cancelAnimationFrame',id=>frames.delete(id));
  Object.assign(window, { requestAnimationFrame, cancelAnimationFrame });
  return {wrapper,grain,stage,content,outside,fine,reduced,frames,
    rect(value){rect=value;},
    move(target=content,pointerType='mouse',x=100,y=100){const e=new Event('pointermove',{cancelable:true});Object.defineProperties(e,{target:{value:target},pointerType:{value:pointerType},clientX:{value:x},clientY:{value:y}});win.dispatchEvent(e);return e;},
    tick(now){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));},
    restore(){for(const [key,descriptor]of originals)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}
  };
}

test('fine mouse decoration tracks, settles without a perpetual frame loop, and does not cancel input',()=>{
  const env=environment();try{
    const dispose=mountFilmSurface({element:env.stage}),ring=env.wrapper.children.at(-1);
    assert.equal(ring.attrs.get('aria-hidden'),'true');
    assert.equal(env.move().defaultPrevented,false);env.tick(16);assert.equal(env.frames.size,0);
    env.content.link=true;env.move(env.content,'mouse',400,300);
    assert.equal(ring.children[0].style.opacity,'0');assert.match(ring.style.transform,/scale\(1\.9\)/);
    for(let i=1;i<180&&env.frames.size;i++)env.tick(i*16);
    assert.equal(env.frames.size,0);assert.match(ring.style.transform,/400px,300px/);
    dispose();
  }finally{env.restore();}
});

test('coarse pointers, touch, and targets outside the film never show the decoration',()=>{
  const env=environment();try{
    const dispose=mountFilmSurface({element:env.stage}),ring=env.wrapper.children.at(-1);
    env.fine.matches=false;env.move();assert.equal(ring.style.opacity,'0');assert.equal(env.frames.size,0);
    env.fine.matches=true;env.move(env.content,'touch');assert.equal(ring.style.opacity,'0');
    env.move(env.outside);assert.equal(ring.style.opacity,'0');assert.equal(env.frames.size,0);dispose();
  }finally{env.restore();}
});

test('offscreen, hidden, reduced, printing and pagehide suspend texture and pointer work',()=>{
  for(const condition of ['offscreen','hidden','reduced','print','pagehide']){
    const env=environment();try{
      const dispose=mountFilmSurface({element:env.stage}),ring=env.wrapper.children.at(-1);
      env.move();env.move(env.content,'mouse',400,300);assert.ok(env.frames.size);
      if(condition==='offscreen'){env.rect({top:-1400,bottom:-200});window.dispatchEvent(new Event('scroll'));}
      if(condition==='hidden'){document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));}
      if(condition==='reduced'){document.documentElement.dataset.motion='reduce';document.dispatchEvent(new Event('motion-preference'));}
      if(condition==='print')window.dispatchEvent(new Event('beforeprint'));
      if(condition==='pagehide')window.dispatchEvent(new Event('pagehide'));
      assert.equal(env.grain.dataset.filmRunning,'false',condition);assert.equal(env.frames.size,0,condition);assert.equal(ring.style.opacity,'0',condition);
      env.move();assert.equal(env.frames.size,0,condition);dispose();
    }finally{env.restore();}
  }
});

test('OS reduced motion stays static unless the reader explicitly enables motion',()=>{
  const env=environment();try{
    env.reduced.matches=true;const dispose=mountFilmSurface({element:env.stage});
    assert.equal(env.grain.dataset.filmRunning,'false');env.move();assert.equal(env.frames.size,0);
    document.documentElement.dataset.motion='allow';document.dispatchEvent(new Event('motion-preference'));
    assert.equal(env.grain.dataset.filmRunning,'true');env.move();assert.equal(env.frames.size,1);dispose();
  }finally{env.restore();}
});

test('disposal cancels pending motion, removes decoration and leaves texture at static default',()=>{
  const env=environment();try{
    const dispose=mountFilmSurface({element:env.stage}),ring=env.wrapper.children.at(-1);
    env.move();env.move(env.content,'mouse',400,300);dispose();
    assert.equal(env.frames.size,0);assert.equal(ring.removed,true);assert.equal(env.grain.dataset.filmRunning,undefined);
    for(const event of ['scroll','resize','afterprint','pageshow'])window.dispatchEvent(new Event(event));
    env.move();env.fine.dispatchEvent(new Event('change'));document.dispatchEvent(new Event('motion-preference'));
    assert.equal(env.frames.size,0);assert.equal(env.grain.dataset.filmRunning,undefined);
  }finally{env.restore();}
});

// Supply the two compiled stylesheets to exercise the native fallback in a browser.
test('native image wrappers select one cinematic still, fill its beat and print the first complete view', {
  skip: !process.env.GAZETTE_FILM_STYLESHEET || !process.env.GAZETTE_BASE_STYLESHEET,
}, async () => {
  const {readFile} = await import('node:fs/promises');
  const styles = (await Promise.all([
    process.env.GAZETTE_BASE_STYLESHEET,
    process.env.GAZETTE_FILM_STYLESHEET,
  ].map(path => readFile(path, 'utf8')))).join('\n');
  const browser = await launch();
  try {
    for (const viewport of [{width: 960, height: 600}, {width: 390, height: 844}]) {
      for (const paired of [true, false]) {
        const page = await browser.newPage({viewport, javaScriptEnabled: false});
        const image = (name, width, height) => `<div data-gazette-image-block><p><img alt="${name}" src="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="gray"/></svg>`)}"></p></div>`;
        await page.setContent(`<style>@layer world { .cinematic-beat { min-block-size: 300px; } .cinematic-still { position: relative; inset: auto; block-size: 100svh; inline-size: 100%; } }</style><main><div class="publication-body"><div data-gazette-component="cinematic-film"><div data-gazette-fallback><section class="cinematic-story"><div class="cinematic-stage"><article class="cinematic-beat"><div class="cinematic-still">${image('Landscape', 400, 200)}${paired ? image('Portrait', 200, 400) : ''}</div><div class="cinematic-premise"><h1>A readable heading</h1><p>The complete account stays with its image.</p></div></article></div></section></div></div></div></main>`);
        await page.evaluate(css => {
          const style = document.createElement('style');
          style.textContent = css;
          document.head.append(style);
        }, styles);
        await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
        for (const mode of ['screen', 'reduced', 'print']) {
          await page.emulateMedia({media: mode === 'print' ? 'print' : 'screen', reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference'});
          const actual = await page.evaluate(() => {
            const still = document.querySelector('.cinematic-still');
            const visible = [...still.querySelectorAll('img')].filter(image => image.getBoundingClientRect().height > 0);
            const heading = document.querySelector('h1');
            const copy = document.querySelector('.cinematic-premise > p');
            return {
              still: [still.clientWidth, still.clientHeight],
              images: visible.map(image => ({alt: image.alt, width: image.clientWidth, height: image.clientHeight})),
              heading: heading.innerText,
              copy: copy.innerText,
              readable: heading.getBoundingClientRect().height > 0 && copy.getBoundingClientRect().height > 0,
              copyAfterImage: heading.getBoundingClientRect().top >= visible[0].getBoundingClientRect().bottom,
            };
          });
          assert.equal(actual.images.length, 1, `${viewport.width}/${paired}/${mode}`);
          assert.equal(actual.images[0].alt, paired && viewport.width < viewport.height && mode !== 'print' ? 'Portrait' : 'Landscape');
          if (mode === 'print') {
            assert.equal(actual.images[0].width / actual.images[0].height, 2);
            assert.equal(actual.copyAfterImage, true, 'the printed account follows the complete still');
          }
          else assert.deepEqual([actual.images[0].width, actual.images[0].height], actual.still);
          assert.equal(actual.heading, 'A readable heading');
          assert.equal(actual.copy, 'The complete account stays with its image.');
          assert.equal(actual.readable, true);
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});
