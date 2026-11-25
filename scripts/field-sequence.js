import { createFrameLoop } from './frame-loop.js';
import { timeToken } from './css-time.js';
import { motionPreference } from './motion-preference.js';
import { clampField as clamp, smoothField, dampField as damp, fieldPosition, fieldClosing } from './field-timeline.js';

// A living field enhances a complete document. Its renderer owns no input,
// scroll writer or clock; all motion, focus and lifecycle stay here.
export function mountFieldSequence({ element, field, pixelRatio, createRenderer, lighting }) {
  const wrapper = element?.closest('[data-gazette-component]');
  const story = wrapper?.querySelector('.relation-sequence');
  const sections = [...(story?.querySelectorAll('.relation-passage') ?? [])];
  if (!sections.length || sections.length !== field.presets.length) return;
  const style = getComputedStyle(wrapper);
  const token = name => {
    const key = '--field-' + name;
    const value = ['intro-duration', 'step-limit'].includes(name) ? timeToken(style, key) / 1000
      : /^(line|note)-(duration|stagger|delay)$/.test(name)
        ? timeToken(style, key) : parseFloat(style.getPropertyValue(key));
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid field token: ' + name);
    return value;
  };
  let values;
  try { values = Object.fromEntries(['pointer-rate','camera-rate','energy-decay','stream-rate','step-limit',
    'camera-x','camera-y','stream-x','stream-y','energy-divisor','intro-duration','line-duration',
    'line-stagger','line-offset','note-duration','note-stagger','note-delay','panel-lift','note-lift','close-lift'].map(k=>[k,token(k)])); }
  catch { return; }
  const motionSetting = motionPreference(document);
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const life = new AbortController(), originalState = wrapper.getAttribute('data-island-state');
  const originalPosition = wrapper.getAttribute('data-field-position');
  const originalDistance = wrapper.style.getPropertyValue('--field-distance');
  const copies = sections.map(section=>section.querySelector('.relation-copy'));
  const titles = [], restoreHeadings = [];
  for (const section of sections) {
    const heading = section.querySelector('.relation-title :is(h1,h2)');
    const lines = [];
    if (heading) {
      const nodes = [...heading.childNodes];
      const authored=heading.textContent.trim();
      const breaks=(heading.parentElement?.getAttribute('data-line-breaks')??'').split(',').filter(Boolean).map(Number);
      const words=authored.split(/\s+/);let start=0;
      const texts=breaks.length?[...breaks,words.length].map(end=>{const text=words.slice(start,end).join(' ');start=end;return text;}).filter(Boolean):authored.split(/\n+/).filter(Boolean);
      heading.replaceChildren();
      for (const text of texts) {
        const mask=document.createElement('span'),line=document.createElement('span');
        mask.className='relation-line';line.className='relation-line__ink';line.textContent=text;
        mask.append(line);if(lines.length)heading.append(document.createTextNode('\n'));heading.append(mask);lines.push(line);
      }
      restoreHeadings.push(()=>heading.replaceChildren(...nodes));
    }
    titles.push(lines);
  }
  const notes=sections.map(section=>[...section.querySelectorAll('.relation-note > *, .relation-action')]);
  const closing=[...sections.at(-1).querySelectorAll('.relation-closing > p')];
  const saved=new Map([...sections,...copies,...titles.flat(),...notes.flat(),...closing].filter(Boolean).map(node=>[node,{
    style:node.getAttribute('style'),inert:node.inert,aria:node.getAttribute('aria-hidden')
  }]));
  const restore=(node,name,value)=>value===null?node.removeAttribute(name):node.setAttribute(name,value);
  const reset=()=>saved.forEach((v,n)=>{restore(n,'style',v.style);n.inert=v.inert;restore(n,'aria-hidden',v.aria);});
  let renderer=null, navigationFrame=0, disposed=false, failed=false, lost=false;
  let drawn=false, active=false, printing=false, hidden=false, tooSmall=false;
  let distance=1, height=1, width=1, time=0, last=0, entered=0, current=-1, lastScroll=scrollY;
  let pointerX=0,pointerY=0,smoothX=0,smoothY=0,velocity=0;
  let cameraX=0,cameraY=0,cameraZ=field.presets[0].camZ,streamOpacity=field.presets[0].stream;
  let printReturn=null, pendingTarget=null, hasDrawn=false;
  const preference=()=>!motionSetting.reduced();
  const visible=()=>{const r=wrapper.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;};
  const raw=()=>Math.max(0,Math.min(sections.length,-wrapper.getBoundingClientRect().top/distance));
  const sectionIndex=target=>sections.findIndex(s=>s===target||s.contains(target));
  const fragment=()=>{try{return location.hash?document.getElementById(decodeURIComponent(location.hash.slice(1))):null;}catch{return null;}};
  const on=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal:life.signal});
  function position() {
    const b=wrapper.getBoundingClientRect();
    const value=b.bottom<=0?'after':b.top>0?'before':b.bottom<height?'leaving':'pinned';
    if(wrapper.dataset.fieldPosition!==value)wrapper.dataset.fieldPosition=value;
  }
  function reveal(state, immediate=false) {
    if(current!==state.index){current=state.index;entered=time;}
    const age=immediate?Infinity:(time-entered)*1000;
    sections.forEach((section,i)=>{
      const selected=i===state.index;
      const visibility=selected?state.visibility:0;
      section.inert=!selected||visibility===0;section.setAttribute('aria-hidden',String(section.inert));
      copies[i].style.opacity=String(visibility);
      copies[i].style.visibility=visibility>0?'visible':'hidden';
      copies[i].style.transform=`translateY(${(1-visibility)*values['panel-lift']}px)`;
      titles[i].forEach((line,k)=>{
        const t=clamp((age-k*values['line-stagger'])/values['line-duration']);
        const ease=t===1?1:1-Math.pow(2,-10*t);
        line.style.transform=`translateY(${(1-ease)*values['line-offset']}%)`;
      });
      notes[i].forEach((note,k)=>{
        const t=clamp((age-values['note-delay']-k*values['note-stagger'])/values['note-duration']);
        const ease=1-Math.pow(1-t,4);
        note.style.opacity=String(ease);note.style.transform=`translateY(${(1-ease)*values['note-lift']}px)`;
      });
    });
    if(state.index===sections.length-1){
      closing.forEach((line,i)=>{const v=fieldClosing(state.local,i,closing.length,field.closeSpan);
        line.style.opacity=String(v);line.style.transform=`translateY(${(1-v)*values['close-lift']}px)`;});
      const action=sections.at(-1).querySelector('.relation-action');
      if(action){const v=smoothField((closing.length-1)/closing.length,(closing.length-.5)/closing.length,state.local);
        action.style.opacity=String(v);action.style.transform='none';action.inert=v<1;}
    }
  }
  function frame(now, immediate=false) {
    const elapsed=last?Math.max(0,(now-last)/1000):0;
    const dt=Math.min(values['step-limit'],elapsed);
    const nextTime=time+elapsed;
    const state=fieldPosition(raw(),sections.length,field);
    const a=field.presets[state.index],b=field.presets[Math.min(state.index+1,sections.length-1)];
    const mix=(x,y)=>x+(y-x)*state.blend;
    const pointerCameraZ=cameraZ;
    smoothX=damp(smoothX,pointerX,values['pointer-rate'],dt);smoothY=damp(smoothY,pointerY,values['pointer-rate'],dt);
    velocity=damp(velocity,0,values['energy-decay'],dt);
    cameraX=damp(cameraX,smoothX*values['camera-x'],values['camera-rate'],dt);
    cameraY=damp(cameraY,smoothY*values['camera-y'],values['camera-rate'],dt);
    cameraZ=damp(cameraZ,mix(a.camZ,b.camZ),values['camera-rate'],dt);
    streamOpacity=damp(streamOpacity,mix(a.stream,b.stream),values['stream-rate'],dt);
    const ratio=pixelRatio(devicePixelRatio||1);
    const rendered=renderer.render({time:nextTime,index:state.index,blend:state.blend,intro:1-Math.pow(1-clamp(nextTime/values['intro-duration']),3),
      pointerX:smoothX,pointerY:smoothY,velocity,cameraX,cameraY,cameraZ,pointerCameraZ,streamOpacity,
      parallaxX:smoothX*values['stream-x'],parallaxY:smoothY*values['stream-y'],pointerEnabled:fine.matches,
      size:{width,height,pixelRatio:ratio}});
    if(rendered===false)throw new Error('Field did not draw');
    if(rendered===null)return false;
    last=now;time=nextTime;
    if(drawn)reveal(state,immediate);
    return true;
  }
  function tick(now){
    if(!active||disposed)return;
    if(!drawn){state();return;}
    try{frame(now);}catch{failed=true;state();return;}
    return true;
  }
  const animation=createFrameLoop(tick,{window,eligible:()=>active&&!disposed});
  const schedule=animation.request;
  function stop(){animation.cancel();last=0;}
  function fits(){
    const top=element.getBoundingClientRect().top,header=document.querySelector('.frame__header')?.getBoundingClientRect();
    const moving=[...copies,...notes.flat(),...closing].filter(Boolean);
    const transforms=moving.map(node=>node.style.transform);
    moving.forEach(node=>node.style.transform='none');
    let fitsAll;
    try { fitsAll=sections.every(section=>{
      const boxes=[...section.querySelectorAll('.relation-title,.relation-note,.relation-closing,.relation-action')].map(node=>node.getBoundingClientRect());
      return boxes.every(b=>b.width>0&&b.left>=-1&&b.right<=width+1&&b.top>=top+(header?.height??0)-1&&b.bottom<=top+height+1)&&
        boxes.every((a,i)=>boxes.slice(i+1).every(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1));
    }); } finally { moving.forEach((node,i)=>node.style.transform=transforms[i]??''); }
    return fitsAll;
  }
  function acquire(){
    if(renderer||failed||lost)return;
    try{
      renderer=createRenderer({lighting,onLost(){lost=true;state();},onRestored(){lost=false;failed=false;state();},onError(){failed=true;state();}});
      renderer.canvas.setAttribute('aria-hidden','true');element.append(renderer.canvas);
    }catch{renderer?.dispose();renderer=null;failed=true;}
  }
  function seek(target,focus=false){
    const index=sectionIndex(target);if(index<0||disposed)return;
    printReturn=null;pendingTarget=target;
    if(drawn){
      const local=index===sections.length-1?(closing.length-.5)/closing.length:0.05;
      window.scrollTo({top:scrollY+wrapper.getBoundingClientRect().top+(index+local)*distance,behavior:'instant'});
      current=index;entered=-Infinity;last=0;frame(performance.now(),true);pendingTarget=null;
    }else target.scrollIntoView({block:'start',behavior:'instant'});
    if(focus){const previous=target.getAttribute('tabindex');target.tabIndex=-1;target.focus({preventScroll:true});restore(target,'tabindex',previous);}
  }
  function state(){
    if(disposed)return;
    const allowed=preference()&&!printing&&!failed&&!lost&&!tooSmall;
    active=allowed&&!hidden&&!document.hidden&&visible();
    if(!active)stop();
    if(!allowed&&drawn){
      const occupied=visible(),target=sections[Math.max(0,current)];
      drawn=false;wrapper.dataset.islandState='still';reset();
      if(occupied&&!printing){pendingTarget=null;target.scrollIntoView({block:'start',behavior:'instant'});}
    }
    if(active&&!drawn){
      const target=pendingTarget || (hasDrawn && !printReturn ? sections.find(section=>{
        const b=section.getBoundingClientRect();return b.bottom>height*.5&&b.top<height;
      }) : null);
      acquire();if(failed||lost||!renderer)return;
      try{
        if(!frame(performance.now(),true)){position();schedule();return;}
      }catch{failed=true;stop();return;}
      drawn=true;hasDrawn=true;wrapper.dataset.islandState='drawn';
      if(!fits()){tooSmall=true;state();return;}
      if(printReturn){
        const r=printReturn;printReturn=null;
        window.scrollTo({top:scrollY+wrapper.getBoundingClientRect().top+r*distance,behavior:'instant'});
        frame(performance.now(),true);
      }
      else if(target)seek(target,false);
      else reveal(fieldPosition(raw(),sections.length,field));
    }
    position();schedule();
  }
  function resize(){
    if(disposed)return;
    const old=raw(),bounds=wrapper.getBoundingClientRect();
    width=wrapper.clientWidth||innerWidth;height=innerHeight;distance=height*field.sceneSpan;
    wrapper.style.setProperty('--field-distance',`${distance*sections.length}px`);
    if(drawn&&bounds.top<=0&&bounds.bottom>height)window.scrollTo({top:scrollY+bounds.top+old*distance,behavior:'instant'});
    tooSmall=false;if(drawn&&!fits())tooSmall=true;state();
  }
  function reconcile(){
    printReturn=null;cancelAnimationFrame(navigationFrame);
    navigationFrame=requestAnimationFrame(()=>{navigationFrame=0;const target=fragment();if(target&&sectionIndex(target)>=0){seek(target);state();}});
  }
  on(wrapper,'click',event=>{
    const link=event.target.closest?.('a[href]');if(!link||event.defaultPrevented||event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
    const url=new URL(link.href);if(url.origin!==location.origin||url.pathname!==location.pathname||url.search!==location.search||!url.hash)return;
    let target;try{target=document.getElementById(decodeURIComponent(url.hash.slice(1)));}catch{return;}
    if(!target||sectionIndex(target)<0)return;event.preventDefault();if(location.hash!==url.hash)history.pushState(null,'',url.hash);seek(target,true);state();
  });
  on(window,'pointermove',event=>{if(!fine.matches)return;const r=element.getBoundingClientRect();pointerX=clamp((event.clientX-r.left)/width)*2-1;pointerY=1-clamp((event.clientY-r.top)/height)*2;},{passive:true});
  on(window,'blur',()=>{pointerX=pointerY=0;});
  on(window,'scroll',()=>{velocity=Math.max(velocity,clamp(Math.abs(scrollY-lastScroll)/values['energy-divisor']));lastScroll=scrollY;state();},{passive:true});
  on(window,'resize',resize,{passive:true});
  on(document,'visibilitychange',state);motionSetting.onMotionChange(state,{signal:life.signal});
  on(window,'beforeprint',()=>{printReturn=drawn&&visible()?raw():null;printing=true;state();});
  on(window,'afterprint',()=>{printing=false;resize();});
  on(window,'pageshow',()=>{hidden=false;resize();reconcile();});
  on(window,'pagehide',event=>{hidden=true;state();if(!event.persisted)dispose();});
  on(window,'popstate',reconcile);on(window,'hashchange',reconcile);
  const observer=globalThis.ResizeObserver?new ResizeObserver(resize):null;observer?.observe(wrapper);
  if(document.fonts){on(document.fonts,'loadingdone',resize);document.fonts.ready?.then(()=>{if(!disposed)resize();});}
  wrapper.classList.add('relation-island');
  const target=fragment();if(target&&sectionIndex(target)>=0)pendingTarget=target;
  resize();
  function dispose(){
    if(disposed)return;disposed=true;active=false;stop();animation.dispose();cancelAnimationFrame(navigationFrame);life.abort();observer?.disconnect();
    reset();restoreHeadings.forEach(fn=>fn());renderer?.dispose();renderer?.canvas.remove();renderer=null;
    restore(wrapper,'data-island-state',originalState);restore(wrapper,'data-field-position',originalPosition);
    wrapper.classList.remove('relation-island');if(originalDistance)wrapper.style.setProperty('--field-distance',originalDistance);else wrapper.style.removeProperty('--field-distance');
  }
  return dispose;
}
