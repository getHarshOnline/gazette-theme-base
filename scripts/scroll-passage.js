import { motionPreference } from './motion-preference.js';
import { filmPassageProgress, filmVisibility, filmLineVisibility } from './film-timeline.js';

// Authored text follows the artwork's reversible view progress, without a one-way entered flag.
export function mountScrollPassage(root, { reveal, window: visibility } = {}) {
  if (!root || !reveal || !Array.isArray(visibility) || visibility.length !== 4 ||
      visibility.some((value,i)=>!Number.isFinite(value)||value<0||value>1||(i&&value<visibility[i-1]))) return;
  const nodes=[...root.querySelectorAll(reveal)];
  const saved=new Map(nodes.map(node=>[node,{opacity:node.style.opacity,filter:node.style.filter}]));
  const lifecycle=new AbortController(), preference=motionPreference(document);
  const reduced=preference.reduced;
  let raf=0, disposed=false, printing=false;
  const restore=()=>saved.forEach((value,node)=>{node.style.opacity=value.opacity;node.style.filter=value.filter;});
  function paint() {
    raf=0;if(disposed)return;
    if(reduced()||printing){restore();return;}
    for(const node of nodes){
      const box=node.getBoundingClientRect();
      const progress=filmPassageProgress(box.top,box.height,innerHeight);
      const focused=node===document.activeElement||node.contains(document.activeElement);
      const value=focused?1:filmLineVisibility(filmVisibility(progress,visibility),0,1,0);
      const blur=Number.parseFloat(getComputedStyle(node).getPropertyValue('--scene-entry-blur'));
      node.style.opacity=String(value);
      node.style.filter=value===1||!Number.isFinite(blur)?'none':`blur(${(1-value)*blur}px)`;
    }
  }
  const schedule=()=>{if(!raf&&!disposed)raf=requestAnimationFrame(paint);};
  const on=(target,type,callback)=>target.addEventListener(type,callback,{passive:true,signal:lifecycle.signal});
  on(window,'scroll',schedule);on(window,'resize',schedule);
  preference.onMotionChange(schedule,{signal:lifecycle.signal});
  on(root,'focusin',schedule);on(root,'focusout',schedule);
  on(window,'beforeprint',()=>{printing=true;restore();});
  on(window,'afterprint',()=>{printing=false;schedule();});
  on(window,'pageshow',schedule);on(document,'visibilitychange',schedule);
  schedule();
  return()=>{disposed=true;cancelAnimationFrame(raf);lifecycle.abort();restore();};
}
