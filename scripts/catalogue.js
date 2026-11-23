import { setCarouselArrows } from './carousel-controls.js';
import { observeInView } from './in-view.js';
import { timeToken } from './css-time.js';
import { motionPreference } from './motion-preference.js';
import { mountFolderCards } from './folder-card.js';
import { carouselCompactWidth, carouselLoops, wrapDistance, createDecorativeClone, mountCarouselPlayback } from './carousel-playback.js';
import { catalogueReturn, rememberCatalogueReturn } from './return-focus.js';

// The engine supplies each entry's link, artwork and copy. This island
// owns only their position and selection; the folder material is shared.
// A bounded fan opens at the focus and packs progressively toward its edges.
// Solve clearance from actual rotated card bounds, rather than site-specific offsets.
export function arcFocusAngle({ spacing, edgeAngle, radius, reach, activeScale, neighbourScale }, width, height, gap) {
  const limit = edgeAngle;
  const a = radius - neighbourScale * height / 2, b = neighbourScale * width / 2;
  const clearance = Math.asin(Math.min(1, (activeScale * width / 2 + gap) / Math.hypot(a,b))) + Math.atan2(b,a);
  const required=clearance*180/Math.PI;
  return Math.min(Math.max(required,(required+spacing)/2),limit*reach/(reach+1));
}
export function arcPlacement(distance, { spacing, focusAngle = spacing, edgeAngle, radius, lift, activeScale, neighbourScale, opacity, reach }) {
  const f = Math.max(0, 1 - Math.abs(distance)), focus = f * f * (3 - 2 * f);
  const limit = edgeAngle;
  const edge = Math.min(1,Math.max(0,(Math.abs(distance)-1)/Math.max(1,reach-1)));
  const visibility = 1-edge*edge*(3-2*edge);
  const angle = limit * Math.tanh(Math.atanh(focusAngle / limit) * distance);
  return { angle, radius: radius + focus * lift,
    scale: neighbourScale + (activeScale - neighbourScale) * focus,
    opacity: (opacity + (1 - opacity) * focus) * visibility,
    z: 100 - Math.round(Math.abs(distance) * 10) };
}

// Finite groups stand upright. Selection changes emphasis, not the row's angle.
export function uprightPlacement(distance, position, geometry, step) {
  const emphasis=arcPlacement(distance,geometry);
  return {angle:0,x:position*step,radius:geometry.radius,
    scale:(emphasis.scale+geometry.neighbourScale)/2,
    opacity:emphasis.opacity,z:emphasis.z};
}

export function arcLowerEdge(pose, width, height, origin) {
  const theta=Math.abs(pose.angle)*Math.PI/180;
  return origin-pose.radius*Math.cos(theta)+(width*Math.sin(theta)+height*Math.cos(theta))*pose.scale/2;
}

export function mount({ element }) {
  const root = element.matches?.('.catalogue') ? element : element.closest('[data-gazette-component]')?.querySelector('.catalogue');
  const stage = root?.querySelector('.catalogue__stage');
  const cards = [...(stage?.querySelectorAll('.catalogue-entry') || [])];
  const controls = root?.querySelector('.catalogue__controls');
  const previous = controls?.querySelector('[data-catalogue-previous]');
  const next = controls?.querySelector('[data-catalogue-next]');
  const position = controls?.querySelector('output');
  const playback = controls?.querySelector('[data-catalogue-playback]');
  if (!cards.length || !controls || !previous || !next || !position || typeof ResizeObserver !== 'function') return;
  const css = getComputedStyle(root), read = name => parseFloat(css.getPropertyValue(name));
  const p = { spacing: read('--layout-arc-spacing'), edgeAngle: read('--layout-arc-edge-angle'), radius: read('--layout-arc-radius'), lift: read('--layout-arc-lift'), activeScale: read('--layout-arc-active-scale'), neighbourScale: read('--layout-arc-neighbour-scale'), opacity: read('--layout-arc-neighbour-opacity'), reach: read('--layout-arc-reach') };
  const viewportShare = read('--layout-arc-viewport-share');
  const intent = read('--layout-quote-drag-threshold');
  if (![...Object.values(p), viewportShare, intent].every(Number.isFinite)) return;
  const preference = motionPreference(document);
  const original = cards.map(card => ({ style: card.getAttribute('style'), hidden: card.getAttribute('aria-hidden'), links: [...card.querySelectorAll('a')].map(link => [link, link.getAttribute('tabindex')]) }));
  const properties = ['--catalogue-field-width','--catalogue-field-offset','--catalogue-card-width','--catalogue-stage-height','--catalogue-origin','--catalogue-copy-overlap'];
  const oldProperties = properties.map(name => root.style.getPropertyValue(name));
  const cleanups = [], oldControls = controls.hidden;
  // Keep each authored description once: in the card without script, in the
  // centred reading area when the arc is enhanced. Never clone content/links.
  const details = document.createElement('div'); details.className='catalogue__details';
  const panels = cards.map(card=>{
    const copy=card.querySelector('.folder-card__copy'), panel=document.createElement('div');
    panel.className='catalogue__detail';
    const moved=[...copy.children].filter(node=>!/^H[1-6]$/.test(node.tagName)).map(node=>{
      const marker=document.createComment('catalogue copy');copy.insertBefore(marker,node);panel.append(node);return {marker,node};
    });
    details.append(panel);return {panel,moved};
  });
  const reading=document.createElement('div');reading.className='catalogue__reading';
  root.insertBefore(reading,controls);reading.append(details,controls);
  const count=cards.length, looping=carouselLoops(count), mod=value=>(value%count+count)%count;
  const address = root.closest('[data-gazette-component-address]')?.dataset.gazetteComponentAddress;
  const destinations = cards.map(card => {
    const link = card.querySelector('.folder-card__copy :is(h2,h3) a[href]');
    return link?.dataset.gazetteDestinationContent || link?.href;
  });
  const saved = catalogueReturn(history, address, performance.getEntriesByType('navigation')[0]?.type);
  const matches = destinations.flatMap((value, i) => value === saved?.destination && value ? [i] : []);
  const total=looping?count*(Math.floor((p.reach*2+1)/count)+1):count;
  const distanceTo=(number,focus)=>looping?wrapDistance(number-focus,total):number-focus;
  const destination=number=>looping?index+wrapDistance(number-mod(index),count):number;
  const slots=cards.map((node,number)=>({node,number})), clones=[];
  for(let number=count;number<total;number++){
    const clone=createDecorativeClone(cards[number%count]);
    clone.dataset.catalogueClone='true';stage.append(clone);clones.push(clone);slots.push({node:clone,number});
  }
  const choices=document.createElement('div');choices.className='carousel-controls__choices catalogue__choices';
  const buttons=cards.map((card,i)=>{
    const button=document.createElement('button');button.type='button';button.className='control';
    button.setAttribute('aria-label',card.querySelector('h2,h3')?.textContent.trim() || String(i+1));
    choices.append(button);return button;
  });
  controls.append(choices);
  const disposeCloneShapes=mountFolderCards(stage,'[data-catalogue-clone]');
  let printing = false;
  let index = matches.length === 1 ? matches[0] : Math.floor((cards.length-1)/2);
  let visual = index, drag = null, suppressClick = false, frame = 0, disposed = false;
  let travel = null, travelFrame = 0, focusAngle = p.spacing, balanced = false, measuredCard = null;
  let playbackController;
  const listen = (target, type, handler, options) => { target.addEventListener(type, handler, options); cleanups.push(() => target.removeEventListener(type, handler, options)); };
  const reduced = preference.reduced;
  function place(value = visual) {
    visual = value;
    const width = stage.clientWidth, radius = width * p.radius;
    cards.forEach((card,account)=>{
      const owned=slots.find(slot=>slot.node===card);
      const nearest=slots.filter(slot=>slot.number%count===account).reduce((a,b)=>
        Math.abs(distanceTo(a.number,value))<=Math.abs(distanceTo(b.number,value))?a:b);
      if(owned!==nearest)[owned.node,nearest.node]=[nearest.node,owned.node];
    });
    const front=slots.reduce((a,b)=>Math.abs(distanceTo(a.number,value))<=Math.abs(distanceTo(b.number,value))?a:b);
    let lowerEdge=0;
    slots.forEach(slot => {
      const card=slot.node, distance=distanceTo(slot.number,value);
      const geometry={...p,focusAngle,radius,lift:width*p.lift};
      const v=!looping?uprightPlacement(distance,balanced?slot.number-(count-1)/2:distance,geometry,measuredCard.step):arcPlacement(distance,geometry);
      if(!looping&&measuredCard&&v.opacity){
        const theta=v.angle*Math.PI/180,centre=width/2+(v.x??v.radius*Math.sin(theta));
        const half=(measuredCard.width*Math.abs(Math.cos(theta))+measuredCard.height*Math.abs(Math.sin(theta)))*v.scale/2;
        if(centre+half>0&&centre-half<width)lowerEdge=Math.max(lowerEdge,arcLowerEdge(v,measuredCard.width,measuredCard.height,measuredCard.origin));
      }
      card.style.transform = `translate(-50%,-50%) translateX(${v.x??0}px) rotate(${v.angle}deg) translateY(${-v.radius}px) scale(${v.scale})`;
      card.style.opacity = String(v.opacity); card.style.zIndex = String(slot===front ? 100 : Math.min(98,v.z));
      card.style.visibility = v.opacity ? 'visible' : 'hidden';
    });
    // Finite rows have no unseen lower ring. Let their caption follow the
    // actual visible envelope on the same clock as the selected card.
    if(!looping&&measuredCard){
      const spare=measuredCard.captionHeight-measuredCard.captionHeights[mod(index)];
      root.style.setProperty('--catalogue-copy-overlap',`${Math.max(0,measuredCard.stageHeight-lowerEdge+spare-read('--space-6'))}px`);
    }
  }
  function reflectSelection() {
    const account=mod(index);
    cards.forEach((card,i)=>{
      card.dataset.active = String(i === account);
      panels[i].panel.dataset.active=String(i===account);
      panels[i].panel.inert=!printing&&i!==account;
      panels[i].panel.setAttribute('aria-hidden',String(!printing&&i!==account));
      card.setAttribute('aria-hidden', String(!printing && i !== account));
      original[i].links.forEach(([link, tab]) => { if (!printing && i !== account) link.tabIndex = -1; else if (tab === null) link.removeAttribute('tabindex'); else link.setAttribute('tabindex',tab); });
    });
  }
  function measure() {
    if (disposed) return;
    const width = document.documentElement.clientWidth, bounds = root.getBoundingClientRect();
    root.style.setProperty('--catalogue-field-width',`${width}px`);
    root.style.setProperty('--catalogue-field-offset',`${width/2-bounds.left-bounds.width/2}px`);
    // Reading size is bounded by both viewport axes; long copy may grow its card.
    const cardShare=parseFloat(getComputedStyle(stage).getPropertyValue('--catalogue-share'));
    const pad=read('--space-6');
    const chrome=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--frame-chrome')) || read('--layout-sticky-chrome');
    const room=innerHeight-Math.max(chrome,bounds.top+scrollY)-read('--space-3');
    // Protect complete words and a spacing step of breathing room before
    // height fitting, using the delivered face and actual component insets.
    const headings=cards.map(card=>card.querySelector('.folder-card__copy > :is(h2,h3)'));
    const titleWidths=headings.map(heading=>heading.style.inlineSize);
    headings.forEach(heading=>{heading.style.inlineSize='min-content';});
    const titleFloor=Math.max(...headings.map(heading=>{
      const inset=getComputedStyle(heading.parentElement);
      return Math.ceil(parseFloat(getComputedStyle(heading).width))+parseFloat(inset.paddingInlineStart)+parseFloat(inset.paddingInlineEnd)+read('--space-4');
    }));
    headings.forEach((heading,i)=>{heading.style.inlineSize=titleWidths[i];});
    const minimum=Math.min(titleFloor,(width-read('--space-4')*2)/p.activeScale);
    const groupScale=(p.activeScale+p.neighbourScale)/2;
    balanced=!looping&&root.clientWidth>carouselCompactWidth(root);
    const rowLimit=balanced?(width-pad*2-read('--space-4')*(count-1))/(count*groupScale):Infinity;
    const limit=Math.min(rowLimit,Math.max(minimum,Math.min(width*cardShare,innerHeight*viewportShare*read('--layout-folder-aspect')/p.activeScale,read('--layout-folder-max-width'))));
    const budget=room;
    const radius=width*p.radius,lift=width*p.lift;
    const fit=candidate=>{
      root.style.setProperty('--catalogue-card-width',`${candidate}px`);
      const height=Math.max(...cards.map(card=>card.offsetHeight));
      if(!looping){
        const origin=height*groupScale/2+pad+radius;
        const frameHeight=height*groupScale+pad*2;
        return {height:frameHeight,cardHeight:height,origin,angle:0,
          total:frameHeight+details.offsetHeight+controls.offsetHeight,overlap:0};
      }
      const angle=arcFocusAngle({...p,radius},candidate,height,read('--space-4'));
      const origin=height*p.activeScale/2+pad+lift+radius;
      let bottom=0,restBottom=0,contentBottom=0;
      const halfMeasure=details.clientWidth/2;
      for(let distance=0;distance<=p.reach;distance+=.5){
        const v=arcPlacement(distance,{...p,radius,lift,focusAngle:angle}),theta=v.angle*Math.PI/180;
        if(!v.opacity)continue;
        const edgeY=arcLowerEdge(v,candidate,height,origin);
        bottom=Math.max(bottom,edgeY);
        const left=v.radius*Math.sin(theta)-(candidate*Math.cos(theta)+height*Math.sin(theta))*v.scale/2;
        const resting=Number.isInteger(distance);
        if(resting&&left<width/2)restBottom=Math.max(restBottom,edgeY);
        if(left<halfMeasure&&distance<=1)contentBottom=Math.max(contentBottom,edgeY);
      }
      const heightNeeded=bottom+pad,readingHeight=details.offsetHeight+controls.offsetHeight;
      // Align the visible controls with the resting arc, excluding the control
      // row's padding. Compact layouts retain clearance for readable copy.
      const controlInset=parseFloat(getComputedStyle(controls).paddingBottom);
      const readingEnd=Math.max(restBottom+controlInset,contentBottom+pad+readingHeight);
      return {height:heightNeeded,cardHeight:height,origin,angle,total:Math.max(heightNeeded,readingEnd),overlap:Math.max(0,heightNeeded+readingHeight-readingEnd)};
    };
    let low=limit, high=limit, best=fit(limit);
    // Text wrapping makes the envelope non-monotone at very narrow sizes.
    // Find a feasible interval first, then choose its largest fitting card.
    if(best.total>budget){
      for(let step=1;step<=12;step++){
        const candidate=limit-(limit-Math.min(minimum,limit))*step/12, measured=fit(candidate);
        if(measured.total<best.total){best=measured;low=candidate;}
        if(measured.total<=budget){low=candidate;break;}
        high=candidate;
      }
      if(best.total<=budget)for(let iteration=0;iteration<12;iteration++){
        const candidate=(low+high)/2;
        if(fit(candidate).total>budget)high=candidate;else low=candidate;
      }
    }
    const fitted=fit(low);focusAngle=fitted.angle;
    const captionHeights=panels.map(({panel})=>panel.offsetHeight);
    const step=low*groupScale+read('--space-4');
    const dragStep=looping?radius*Math.sin(focusAngle*Math.PI/180):step;
    measuredCard={width:low,height:fitted.cardHeight,origin:fitted.origin,stageHeight:fitted.height,captionHeights,captionHeight:Math.max(...captionHeights),step,dragStep};
    root.style.setProperty('--catalogue-origin',`${fitted.origin}px`);
    root.style.setProperty('--catalogue-stage-height',`${fitted.height}px`);
    root.style.setProperty('--catalogue-copy-overlap',`${fitted.overlap}px`);
    place();
  }
  function release() {
    const held = drag; drag = null; delete root.dataset.dragging;
    if (held?.captured && stage.hasPointerCapture(held.id)) stage.releasePointerCapture(held.id);
    return held;
  }
  function stopTravel() {
    cancelAnimationFrame(travelFrame); travelFrame=0;
    travel?.cancel(); travel=null;
  }
  function settle() { stopTravel(); place(index); }
  // One Web Animations clock drives the whole fan. Retargeting and dragging
  // start at its current picture, never at the last integer selection.
  function moveToSelection() {
    stopTravel();
    if (reduced() || document.hidden || visual===index) { place(index); return; }
    const from=visual, target=index;
    travel=root.animate([], {duration:timeToken(css, '--duration-bookmark'),easing:css.getPropertyValue('--easing-move').trim(),fill:'both'});
    const tick=()=>{
      if (!travel || disposed) return;
      const timing=travel.effect.getComputedTiming();
      place(from+(target-from)*(timing.progress ?? 0));
      if (travel.playState==='finished') settle();
      else travelFrame=requestAnimationFrame(tick);
    };
    travelFrame=requestAnimationFrame(tick);
  }
  function select(value, focusControl) {
    const rounded=Math.round(value),target=looping?rounded:Math.max(0,Math.min(count-1,rounded)),account=mod(target);
    const restoreFocus=cards.some((card,i) => i!==account && (card.contains(document.activeElement)||panels[i].panel.contains(document.activeElement)));
    release(); index=target; reflectSelection(); moveToSelection();
    if(restoreFocus)(cards[account].querySelector('a') || focusControl || next).focus();
    setCarouselArrows(previous, next, !looping && account === 0, !looping && account === count - 1);
    position.textContent = `${account+1} / ${count}`;
    buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===account)));
    playbackController?.schedule();
  }
  buttons.forEach((button,i)=>listen(button,'click',()=>select(destination(i),button)));
  listen(previous,'click',()=>select(index-1,previous));
  listen(next,'click',()=>select(index+1,next));
  listen(root,'keydown',event=>{
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); select(event.key==='Home'?destination(0):event.key==='End'?destination(count-1):index+(event.key==='ArrowLeft'?-1:1),event.target);
  });
  listen(stage,'click',event=>{
    if(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
    if (suppressClick && event.detail) { suppressClick=false; event.preventDefault(); event.stopPropagation(); return; }
    const card=event.target.closest('.catalogue-entry'), slot=slots.find(slot=>slot.node===card), number=slot?slot.number%count:-1;
    if (number>=0 && number!==mod(index)) { event.preventDefault(); select(destination(number),next); }
  },true);
  listen(stage,'dragstart',event=>event.preventDefault());
  listen(stage,'pointerdown',event=>{
    if (event.button!==0 || !event.isPrimary) return;
    suppressClick=false;
    // The active card is one link; a captured drag suppresses its click instead.
    if (cards.length<2) return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,start:visual,value:visual,captured:false};
    playbackController?.schedule();
  });
  function cancelDrag() {
    const held=release();
    if(held?.captured)moveToSelection();
    playbackController?.schedule();
  }
  listen(stage,'pointermove',event=>{
    if (!drag || event.pointerId!==drag.id) return;
    const x=event.clientX-drag.x,y=event.clientY-drag.y;
    if (!drag.captured) {
      if (Math.abs(y)>Math.abs(x) && Math.abs(y)>intent) { cancelDrag(); return; }
      if (Math.abs(x)<intent) return;
      stopTravel();
      drag.start=visual;
      stage.setPointerCapture(event.pointerId); drag.captured=true; root.dataset.dragging='true';
    }
    event.preventDefault();
    const value=drag.start-x/measuredCard.dragStep;
    drag.value=looping?value:Math.max(0,Math.min(count-1,value));
    if (!frame) frame=requestAnimationFrame(()=>{frame=0;if(drag)place(drag.value);});
  });
  listen(stage,'pointerup',event=>{
    if(drag?.id!==event.pointerId)return;
    const held=release();
    if(held.captured){
      suppressClick=true;
      place(held.value);
      select(held.value,next);
    }else playbackController?.schedule();
  });
  listen(stage,'pointercancel',event=>{if(drag?.id===event.pointerId)cancelDrag();});
  // Touch first captures on the hit child. Only a loss from the stage ends our drag.
  listen(stage,'lostpointercapture',event=>{if(event.target===stage && drag?.id===event.pointerId)cancelDrag();});
  // Vertical scrolling remains the page's. Horizontal trackpad gestures select
  // one entry around the ring without trapping vertical scroll.
  let wheelUntil=0;
  listen(stage,'wheel',event=>{
    if (Math.abs(event.deltaX)<=Math.abs(event.deltaY) || !event.deltaX) return;
    const value=index+Math.sign(event.deltaX);
    if(count<2)return;
    event.preventDefault();
    if(performance.now()<wheelUntil)return;
    wheelUntil=performance.now()+timeToken(css, '--duration-feedback');select(value,next);
  },{passive:false});
  cleanups.push(preference.onMotionChange(settle));
  listen(document,'visibilitychange',()=>{if(document.hidden)settle();});
  const stopInView=observeInView(root,visible=>{if(!visible)settle();},{window,firstEntry:true});
  listen(window,'beforeprint',()=>{printing=true;release();settle();panels.forEach(({moved})=>moved.forEach(({marker,node})=>marker.after(node)));details.hidden=true;reflectSelection();place();});
  listen(window,'afterprint',()=>{printing=false;panels.forEach(({panel,moved})=>moved.forEach(({node})=>panel.append(node)));details.hidden=false;reflectSelection();measure();});
  const observer=new ResizeObserver(()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;measure();});});
  root.classList.add('catalogue--ready');
  observer.observe(root);cards.forEach(card=>observer.observe(card));
  listen(window,'resize',measure);
  playbackController=mountCarouselPlayback({root,position,playback,advance:()=>select(index+1),isBusy:()=>Boolean(drag)||printing,enabled:looping&&root.dataset.autoplay==='true',initiallyPaused:saved?.paused});
  listen(window,'pagehide',()=>rememberCatalogueReturn(history,address,destinations[mod(index)],playbackController.paused));
  controls.hidden=count<2;measure();select(index);
  Promise.resolve(document.fonts?.ready).then(()=>{if(!disposed)measure();});
  return ()=>{
    disposed=true;release();stopTravel();playbackController.dispose();disposeCloneShapes?.();clones.forEach(clone=>clone.remove());choices.remove();cancelAnimationFrame(frame);observer.disconnect();stopInView();cleanups.forEach(clean=>clean());
    root.classList.remove('catalogue--ready');
    controls.hidden=oldControls;position.textContent='';
    panels.forEach(({moved})=>moved.forEach(({marker,node})=>marker.replaceWith(node)));root.insertBefore(controls,reading);reading.remove();
    properties.forEach((name,i)=>oldProperties[i]?root.style.setProperty(name,oldProperties[i]):root.style.removeProperty(name));
    cards.forEach((card,i)=>{for(const [key,value] of [['style',original[i].style],['aria-hidden',original[i].hidden]])value===null?card.removeAttribute(key):card.setAttribute(key,value);delete card.dataset.active;original[i].links.forEach(([link,tab])=>tab===null?link.removeAttribute('tabindex'):link.setAttribute('tabindex',tab));});
  };
}
