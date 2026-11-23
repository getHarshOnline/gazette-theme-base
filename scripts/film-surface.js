import { createFrameLoop } from './frame-loop.js';
import { timeToken } from './css-time.js';
import { motionPreference } from './motion-preference.js';
// Optional optical detail: decoration never replaces the native pointer or owns navigation.
export function mountFilmSurface({element}) {
  const wrapper=element?.closest('[data-gazette-component]');
  const grain=wrapper?.querySelector('.cinematic-grain');
  if(!wrapper||!grain)return;
  const style=getComputedStyle(wrapper);
  const rate=Number.parseFloat(style.getPropertyValue('--film-pointer-rate'));
  const scale=Number.parseFloat(style.getPropertyValue('--film-pointer-hover-scale'));
  const step=timeToken(style, '--film-step-limit') / 1000;
  if(![rate,scale,step].every(value=>Number.isFinite(value)&&value>0))return;
  const ring=document.createElement('div'),dot=document.createElement('div');
  ring.className='cinematic-pointer';dot.className='cinematic-pointer__dot';
  ring.setAttribute('aria-hidden','true');ring.append(dot);wrapper.append(ring);
  const lifecycle=new AbortController();
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  const motionSetting=motionPreference(document);
  let disposed=false,printing=false,pageHidden=false,shown=false,hovering=false,last=0;
  let x=0,y=0,targetX=0,targetY=0;
  const motion=()=>!motionSetting.reduced();
  const inView=()=>{const box=wrapper.getBoundingClientRect();return box.top<innerHeight&&box.bottom>0;};
  const active=()=>!disposed&&!printing&&!pageHidden&&!document.hidden&&motion()&&inView();
  const animation=createFrameLoop(tick,{window});
  function hide(){shown=false;ring.style.opacity='0';animation.cancel();last=0;}
  function draw(){ring.style.transform=`translate3d(${x}px,${y}px,0) translate(-50%,-50%) scale(${hovering?scale:1})`;dot.style.opacity=hovering?'0':'1';}
  function tick(now){
    if(!shown||!active()||!fine.matches){hide();return;}
    const dt=last?Math.min(step,(now-last)/1000):0;last=now;
    const gain=1-Math.exp(-dt*rate);x+=(targetX-x)*gain;y+=(targetY-y)*gain;
    // Stop below a physical pixel, rather than running a perpetual rendering loop at rest.
    if(Math.hypot(targetX-x,targetY-y)<1/(devicePixelRatio||1)){x=targetX;y=targetY;draw();last=0;return;}
    draw();return true;
  }
  function state(){grain.dataset.filmRunning=String(active());if(!active()||!fine.matches)hide();}
  const on=(node,type,callback,options={})=>node.addEventListener(type,callback,{...options,signal:lifecycle.signal});
  on(window,'pointermove',event=>{
    if(!active()||!fine.matches||event.pointerType!=='mouse'||!wrapper.contains(event.target)){hide();return;}
    targetX=event.clientX;targetY=event.clientY;hovering=Boolean(event.target.closest('a[href],button,summary'));
    if(!shown){shown=true;x=targetX;y=targetY;ring.style.opacity='1';}
    draw();animation.request();
  },{passive:true});
  on(document.documentElement,'pointerleave',hide);
  on(window,'blur',hide);on(window,'keydown',hide);
  on(window,'scroll',()=>{state();if(shown){const box=wrapper.getBoundingClientRect();if(y<box.top||y>box.bottom)hide();}},{passive:true});
  on(window,'resize',state,{passive:true});on(document,'visibilitychange',state);
  motionSetting.onMotionChange(state,{signal:lifecycle.signal});on(fine,'change',state);
  on(window,'beforeprint',()=>{printing=true;state();});on(window,'afterprint',()=>{printing=false;state();});
  on(window,'pagehide',()=>{pageHidden=true;state();});on(window,'pageshow',()=>{pageHidden=false;state();});
  state();
  return ()=>{disposed=true;hide();animation.dispose();lifecycle.abort();delete grain.dataset.filmRunning;ring.remove();};
}
