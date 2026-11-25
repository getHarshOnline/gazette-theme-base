import { canvasSize } from './canvas-size.js';
import { createFrameLoop } from './frame-loop.js';
import { timeToken } from './css-time.js';
import { motionPreference } from './motion-preference.js';
export { mountScrollPassage } from './scroll-passage.js';
import { clamp, createFilmTimeline, filmVisibility, filmLineVisibility, advanceFilm, filmFrameWindow, filmNavigationCurve, filmRange, filmLetterVisibility, filmIntroProgress, filmPaintedProgressWindow, filmPassageProgress } from './film-timeline.js';

// Several films can share one document. Only the scene being read restores its
// position after all resize listeners have updated the surrounding geometry.
const resizeReturns = new WeakMap();

function frameAddresses(story,variant) {
  const data=story.querySelector(`script[data-cinematic-frames="${variant}"]`);
  if(!data)return [...story.querySelectorAll(`.cinematic-frames--${variant} a[href]`)].map(link=>link.href);
  try {
    const urls=JSON.parse(data.textContent);
    return Array.isArray(urls)&&urls.every(url=>typeof url==='string'&&url.length)?urls:[];
  } catch {
    return [];
  }
}

// Animate a complete HTML storyboard when supported. Navigation works without decoding.
export function mountCinematicFilm({ element, film }) {
  function validWindow(value) {
    return Array.isArray(value) && (value.length === 2 || value.length === 4) &&
      value.every((v,i)=>typeof v==='number'&&!Number.isNaN(v)&&(Number.isFinite(v)||v===Infinity)&&(!i||v>=value[i-1]));
  }
  const wrapper = element?.closest('[data-gazette-component]');
  const story = wrapper?.querySelector('.cinematic-story');
  if (!story || !globalThis.createImageBitmap) return;
  const beats = [...story.querySelectorAll('.cinematic-beat')];
  const stills = [...story.querySelectorAll('.cinematic-still img')];
  const choreography = film.choreography;
  const caption = story.querySelector('.cinematic-copy');
  const cards = [...story.querySelectorAll('.cinematic-card')];
  const flow = film.layout === 'flow';
  const validDistances = film.scrollDistance && ['landscape','portrait'].every(key=>Number.isFinite(film.scrollDistance[key])&&film.scrollDistance[key]>0);
  let at, physics, gain, stagger, blur, lift, persistence, navigationDuration, navigationCurve, scenePhysics, preload=0;
  const focusRestorers = new Map();
  try {
    at = createFilmTimeline(film.edit);
    if (film.transparent !== undefined && typeof film.transparent !== 'boolean' ||
        film.intro !== undefined && typeof film.intro !== 'boolean' ||
        film.prepare !== undefined && typeof film.prepare !== 'boolean') return;
    if (choreography && (typeof choreography !== 'object' || Object.entries(choreography).some(([key, window]) =>
      !['veil','release','departure','cue','settle','letters','premise','ghost','seal'].includes(key) || !Array.isArray(window) ||
      window.length !== (key === 'letters' ? 3 : 2) || window.some(value => !Number.isFinite(value) || value < 0 || value > 1) ||
      (key === 'letters' ? window[2] <= 0 : window[1] <= window[0])))) return;
    if ((film.response !== undefined && !['rate','exponential'].includes(film.response)) ||
      (film.copyClock !== undefined && !['head','scroll','painted'].includes(film.copyClock)) ||
      (film.entryBeat !== undefined && (!Number.isInteger(film.entryBeat) || film.entryBeat < 0 || film.entryBeat >= beats.length))) return;
    if (!beats.length || beats.length !== film.windows.length || cards.length !== film.cards.length ||
      film.rests.length !== beats.length || film.rests.some(v => !Number.isFinite(v) || v < 0 || v > 1) ||
      !Number.isInteger(film.frames) || film.frames < 1 || (!Number.isFinite(film.fps) || !(film.fps > 0)) ||
      !Number.isInteger(film.concurrency) || film.concurrency < 1 ||
      !Number.isSafeInteger(film.decodedByteLimit) || film.decodedByteLimit < 1 ||
      (!flow&&!validDistances&&(!Number.isFinite(film.viewportSpan)||!(film.viewportSpan>1))) ||
      (film.layout!==undefined&&!['pinned','flow'].includes(film.layout)) ||
      (film.scrollDistance!==undefined&&!validDistances) ||
      (film.nativeFrame!==undefined&&typeof film.nativeFrame!=='boolean') ||
      (film.departureAt!==undefined&&(!Number.isFinite(film.departureAt)||film.departureAt<=0||film.departureAt>=1)) ||
      (film.approach!==undefined&&(!Number.isFinite(film.approach)||film.approach<0||film.approach>1)) ||
      (film.fit!==undefined&&(typeof film.fit==='string'?!['cover','contain'].includes(film.fit):
        !film.fit||!['landscape','portrait'].every(key=>['cover','contain'].includes(film.fit[key])))) ||
      !Number.isFinite(film.pixelRatio) || !(film.pixelRatio > 0) ||
      !Array.isArray(film.focus) || film.focus.length !== 2 || film.focus.some(v => !Number.isFinite(v) || v < 0 || v > 1)) return;
    const style = getComputedStyle(wrapper);
    const token = name => {
      const value = Number.parseFloat(style.getPropertyValue(name));
      if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid film token ${name}`);
      return value;
    };
    if(film.prepare)preload=token('--layout-scroll-scene-preload');
    physics = {response:film.response??'rate',stepLimit:timeToken(style, '--film-step-limit') / 1000};
    if (physics.response === 'exponential') {
      physics.damping=token('--film-scrub-damping');physics.snapTolerance=film.snapTolerance;
      if (!physics.damping || !Number.isFinite(physics.snapTolerance) || physics.snapTolerance <= 0) return;
    } else {
      physics.minimumRate=token('--film-minimum-rate');physics.catchupRate=token('--film-catchup-rate');
      if (!physics.minimumRate) return;
    }
    if (!physics.stepLimit || !film.windows.every(validWindow) || !film.cards.every(validWindow)) return;
    gain=token('--film-line-gain'); stagger=token('--film-line-stagger');
    blur=token('--film-line-blur'); lift=token('--film-line-lift'); persistence=token('--film-persistence');
    navigationDuration=timeToken(style, '--film-navigation-duration');
    navigationCurve=filmNavigationCurve(style.getPropertyValue('--film-navigation-easing'));
    if (persistence >= 1) return;
    if (film.intro || choreography) {
      scenePhysics = {};
      for (const name of ['intro-duration','intro-share','intro-exponent','title-lift','caption-lift','caption-blur','letter-blur','ghost-travel'])
        scenePhysics[name] = name === 'intro-duration' ? timeToken(style, `--scene-${name}`) : token(`--scene-${name}`);
      scenePhysics.veilStart = token('--material-scroll-scene-veil-start');
      scenePhysics.veilGain = token('--material-scroll-scene-veil-gain');
      scenePhysics.ghostOpacity = token('--material-scroll-scene-ghost-opacity');
      if (!Number.isFinite(scenePhysics['intro-duration']) || scenePhysics['intro-duration'] <= 0 || !scenePhysics['intro-exponent'] || scenePhysics['intro-share'] > 1) return;
    }
  } catch { return; }
  const urls = Object.fromEntries(['landscape','portrait'].map(key => [key,
    frameAddresses(story,key)]));
  if (Object.values(urls).some(list => list.length !== film.frames)) return;
  const canvas = document.createElement('canvas');
  const initialLayout = wrapper.getAttribute('data-film-layout');
  const initialTiming = wrapper.getAttribute('data-film-timing');
  const transparent = Boolean(film.transparent);
  const ctx = canvas.getContext('2d', {alpha:transparent});
  if (!ctx) return;
  wrapper.setAttribute('data-film-layout',flow?'flow':'pinned');
  if (!flow) wrapper.setAttribute('data-film-timing', `${film.approach ?? 0},${film.departureAt ?? 1}`);
  canvas.setAttribute('aria-hidden','true'); element.append(canvas);
  const lifecycle = new AbortController();
  const motionSetting = motionPreference(document);
  // Markdown owns the heading identity. Enhancement supplies line hooks without rebuilding it.
  const restoreTitleLines=[], letterGroups=[];
  if(choreography?.letters) for(const heading of story.querySelectorAll('.cinematic-title h1, .cinematic-title h2')) {
    // Leave headings with inline elements intact, preserving their markup and meaning.
    if(heading.children.length)continue;
    const original=[...heading.childNodes], label=heading.getAttribute('aria-label'), text=heading.textContent;
    // Keep words together, but expose the complete heading once to assistive technology.
    const letters=[];
    heading.replaceChildren();heading.setAttribute('aria-label',text);
    for(const word of text.split(/(\s+)/)) {
      const group=document.createElement('span');group.setAttribute('aria-hidden','true');
      group.style.whiteSpace='nowrap';group.style.display='inline-block';
      if(/^\s+$/.test(word))group.textContent='\u00a0';
      else for(const character of Array.from(word)) {
        const span=document.createElement('span');span.textContent=character;group.append(span);letters.push(span);
      }
      heading.append(group);
    }
    letterGroups.push({heading,letters});
    restoreTitleLines.push(()=>{heading.replaceChildren(...original);if(label===null)heading.removeAttribute('aria-label');else heading.setAttribute('aria-label',label);});
  }
  for(const heading of story.querySelectorAll('.cinematic-title h1, .cinematic-title h2')){
    if(letterGroups.some(group=>group.heading===heading))continue;
    for(const node of [...heading.childNodes]){
      if(node.nodeType===3&&node.textContent.trim()){
        const span=document.createElement('span');span.setAttribute('data-film-line','');
        heading.insertBefore(span,node);span.append(node);
        restoreTitleLines.push(()=>span.replaceWith(node));
      }else if(node.nodeType===1&&node.tagName==='EM'){
        const previous=node.getAttribute('data-film-line');node.setAttribute('data-film-line','');
        restoreTitleLines.push(()=>previous===null?node.removeAttribute('data-film-line'):node.setAttribute('data-film-line',previous));
      }
    }
  }
  const lines = beats.map(beat => [...beat.querySelectorAll('[data-film-line]')].filter(line => !cards.some(card => card.contains(line))));
  const allGroups = [...beats,...cards];
  const saved = new Map([...allGroups,...lines.flat(),...(choreography ? [caption,...story.querySelectorAll('.cinematic-premise')].filter(Boolean) : [])].map(node => [node, {
    style:node.getAttribute('style'), inert:node.inert, aria:node.getAttribute('aria-hidden'), tabindex:node.getAttribute('tabindex')
  }]));
  const initialState=wrapper.getAttribute('data-island-state');
  const initialPosition=wrapper.getAttribute('data-film-position');
  const initialDistance=wrapper.style.getPropertyValue('--film-distance');
  const initialCopyClip=wrapper.style.getPropertyValue('--film-copy-clip');
  const presentationProperties=choreography?['--film-veil-opacity','--film-title-shift','--film-copy-opacity','--film-cue-opacity','--film-ghost-opacity','--film-ghost-shift','--film-seal-opacity']:[];
  const initialPresentation=new Map(presentationProperties.map(name=>[name,wrapper.style.getPropertyValue(name)]));
  const masthead=document.querySelector('.frame__header');
  let session=null, navigationFrame=0, last=0, disposed=false, pageHidden=false;
  let active=false, drawn=false, prepared=false, failed=false, printing=false, tooSmall=false, variant='', head=0, painted=-1;
  let width=0,height=0,distance=0,dirty=true,pendingTarget=null,resumePosition=null;
  let navigation=null,activity=0,traversalPending=false,introStarted=null,departureSeeking=false;
  let openingInterrupted=false;
  let readingPosition=null;
  let presentationIndex=-2,presentationIntro=-1,presentationWindow=[0,0];
  const introProgress = now => film.intro ? filmIntroProgress(now-(introStarted??now),scenePhysics['intro-duration'],scenePhysics['intro-share'],scenePhysics['intro-exponent']) : 0;
  const cancelNavigation = () => { navigation=null; };
  const preference = () => !motionSetting.reduced();
  // Action and reading end at the authored departure frame when pinning ends.
  // Only departure uses the remaining measured box; document sections never overlap.
  const progress = () => {
    const returning=resizeReturns.get(window);
    if(returning?.owner===wrapper)return returning.position;
    const box=wrapper.getBoundingClientRect(), lead=(film.approach??0)*innerHeight;
    if(flow)return filmPassageProgress(box.top,box.height,innerHeight);
    if(!(distance>0))return 0;
    const pinned=clamp((lead-box.top)/(distance+lead));
    if(film.departureAt===undefined)return pinned;
    return box.top>=-distance?pinned*film.departureAt:
      film.departureAt+(1-film.departureAt)*clamp((-box.top-distance)/Math.max(1,box.height-distance));
  };
  const scrollOffset = position => {
    const lead=(film.approach??0)*innerHeight, height=wrapper.getBoundingClientRect().height;
    if(flow)return position*(innerHeight+height)-innerHeight;
    if(film.departureAt===undefined)return position*(distance+lead)-lead;
    return position<=film.departureAt?position/film.departureAt*(distance+lead)-lead:
      distance+(position-film.departureAt)/(1-film.departureAt)*Math.max(1,height-distance);
  };
  function rememberPosition(force=false) {
    if(resizeReturns.get(window)?.owner===wrapper)return;
    if(!force&&readingPosition&&(readingPosition.width!==innerWidth||readingPosition.height!==innerHeight))return;
    const box=wrapper.getBoundingClientRect();
    readingPosition={width:innerWidth,height:innerHeight,origin:scrollY+box.top,boxHeight:box.height,
      position:progress(),occupied:!flow&&drawn&&box.top<=0&&box.bottom>=innerHeight&&progress()<1};
  }
  function cancelResizeReturn() {
    const returning=resizeReturns.get(window);
    if(returning?.owner!==wrapper)return;
    cancelAnimationFrame(returning.frame);resizeReturns.delete(window);
  }
  function preserveReadingPosition() {
    const before=readingPosition,box=wrapper.getBoundingClientRect();
    if(!before?.occupied||!drawn||flow||resizeReturns.has(window))return;
    if(before.width===innerWidth&&before.height===innerHeight&&before.origin===scrollY+box.top&&before.boxHeight===box.height)return;
    const returning={owner:wrapper,position:before.position,frame:0};
    resizeReturns.set(window,returning);
    returning.frame=requestAnimationFrame(()=>{
      resizeReturns.delete(window);
      if(disposed||!drawn||printing||pageHidden||document.hidden||!preference()||tooSmall)return;
      window.scrollTo({top:scrollY+wrapper.getBoundingClientRect().top+scrollOffset(returning.position),behavior:'instant'});
      rememberPosition(true);updatePosition();
      if(active)try{pump();paint();copy();schedule();}catch{fail();}
    });
  }
  // Once the scene unpins into document flow, its geometry cannot wait for the smoothed playhead.
  // A reversal keeps this seek until a current frame can replace the tail pose.
  function synchronizeDeparture(position=progress()) {
    if(film.departureAt!==undefined&&position>=film.departureAt)departureSeeking=true;
    if(!departureSeeking)return false;
    head=at(position);return true;
  }
  const copyPosition = () => synchronizeDeparture()?head:film.copyClock==='scroll'?at(progress()):film.copyClock==='painted'?Math.max(0,painted)/film.fps:head;
  const choreographyPosition = () => {
    const raw=progress();
    if(synchronizeDeparture(raw))return raw;
    if(film.copyClock!=='painted')return raw;
    if(painted<0)return 0;
    const intro=introProgress(performance.now())*(film.frames-1)/film.fps;
    if(painted!==presentationIndex||intro!==presentationIntro){
      presentationWindow=filmPaintedProgressWindow(at,painted,film.fps,intro);
      presentationIndex=painted;presentationIntro=intro;
    }
    return clamp(raw,...presentationWindow);
  };
  const visible = (margin=0) => { const b=wrapper.getBoundingClientRect();return b.top<innerHeight*(1+margin)&&b.bottom> -innerHeight*margin; };
  const restoreAttribute = (node,name,value) => value===null ? node.removeAttribute(name) : node.setAttribute(name,value);
  const restorePresentation = () => initialPresentation.forEach((value,name)=>value?wrapper.style.setProperty(name,value):wrapper.style.removeProperty(name));
  // Presentation can protect persistent navigation as the film region yields to the next surface.
  // This observes geometry only: it never hides navigation or changes the authored film timing.
  function updatePosition() {
    if(disposed)return;
    if(printing){restoreAttribute(wrapper,'data-film-position',initialPosition);wrapper.style.removeProperty('--film-copy-clip');return;}
    const bounds=wrapper.getBoundingClientRect();
    // Before enhancement the mount is hidden; observe the storyboard's last viewport without pinning it.
    const stageHeight=drawn||prepared?(film.nativeFrame?story.querySelector('.cinematic-stage')?.getBoundingClientRect().height:element.getBoundingClientRect().height)||innerHeight:innerHeight;
    const position=bounds.bottom<=0?'after':bounds.top>0?'before':
      bounds.bottom<stageHeight?'leaving':'pinned';
    if(wrapper.getAttribute('data-film-position')!==position)wrapper.setAttribute('data-film-position',position);
    // Only copy yields beneath the persistent masthead. The film and its lighting continue.
    const copyStage=story.querySelector('.cinematic-stage');
    const clearance=(drawn||prepared)&&position==='leaving'&&masthead&&copyStage?
      Math.max(0,masthead.getBoundingClientRect().bottom-copyStage.getBoundingClientRect().top):0;
    wrapper.style.setProperty('--film-copy-clip',`${clearance}px`);
  }
  function resetCopy() {
    for(const {letters} of letterGroups)for(const letter of letters){letter.style.removeProperty('opacity');letter.style.removeProperty('filter');}
    saved.forEach((value,node)=>{
      restoreAttribute(node,'style',value.style);node.inert=value.inert;
      restoreAttribute(node,'aria-hidden',value.aria);restoreAttribute(node,'tabindex',value.tabindex);
    });
  }
  function setLine(line,value) {
    line.style.opacity=String(value);
    line.style.filter=value>=1?'none':`blur(${(1-value)*blur}px)`;
    line.style.transform=`translate3d(0,${(1-value)*lift}px,0)`;
    line.style.visibility=value<=0?'hidden':'visible';
  }
  function focusWithin(node) {
    const focus=document.activeElement;
    if(navigation?.invoker===focus)return false;
    if(focusRestorers.has(focus))return false;
    return Boolean(focus?.matches?.('a[href], button, input, select, textarea, summary, [contenteditable="true"], [tabindex]') && node.contains(focus));
  }
  function copy() {
    const copyTime=copyPosition();
    const cardValues=cards.map((card,i)=>card!==document.activeElement&&focusWithin(card)?1:filmVisibility(copyTime,film.cards[i]));
    beats.forEach((beat,i)=>{
      const focused=beat!==document.activeElement&&focusWithin(beat)&&!cards.some(card=>card.contains(document.activeElement));
      const v=focused?1:filmVisibility(copyTime,film.windows[i]);
      lines[i].forEach((line,k)=>setLine(line,focusWithin(line)?1:filmLineVisibility(v,k,gain,stagger)));
      const contentVisible=v>0||cards.some((card,k)=>beat.contains(card)&&cardValues[k]>0);
      beat.inert=!contentVisible;beat.setAttribute('aria-hidden',String(!contentVisible));
      beat.style.pointerEvents=contentVisible?'auto':'none';
    });
    if(choreography) {
      const p=choreographyPosition(), range=window=>filmRange(p,...window);
      if(choreography.veil) {
        const elapsed=Math.max(at(p)/Math.max(1,film.frames-1)*film.fps,introProgress(performance.now()));
        wrapper.style.setProperty('--film-veil-opacity',String(scenePhysics.veilStart+filmRange(elapsed,...choreography.veil)*scenePhysics.veilGain));
      }
      if(choreography.release)wrapper.style.setProperty('--film-title-shift',`${-range(choreography.release)*scenePhysics['title-lift']*innerHeight}px`);
      if(choreography.departure)wrapper.style.setProperty('--film-copy-opacity',String(focusWithin(caption??story)?1:1-range(choreography.departure)));
      if(choreography.ghost){wrapper.style.setProperty('--film-ghost-opacity',String(range(choreography.ghost)*scenePhysics.ghostOpacity));wrapper.style.setProperty('--film-ghost-shift',`${(.5-p)*scenePhysics['ghost-travel']*innerHeight}px`);}
      if(choreography.seal)wrapper.style.setProperty('--film-seal-opacity',String(range(choreography.seal)));
      if(choreography.cue)wrapper.style.setProperty('--film-cue-opacity',String(1-range(choreography.cue)));
      if(choreography.settle && caption) {
        const value=focusWithin(caption)?1:range(choreography.settle);
        const departure=choreography.departure&&!focusWithin(caption)?1-range(choreography.departure):1;
        caption.style.opacity=String(value*departure);caption.style.transform=`translate3d(0,${(1-value)*scenePhysics['caption-lift']}px,0)`;
        caption.style.filter=`blur(${(1-value)*scenePhysics['caption-blur']}px)`;
      }
      for(const {letters} of letterGroups)letters.forEach((letter,i)=>{
        const value=filmLetterVisibility(p,i,letters.length,choreography.letters);
        letter.style.opacity=String(value);letter.style.filter=value===1?'none':`blur(${(1-value)*scenePhysics['letter-blur']}px)`;
      });
      if(choreography.premise)for(const premise of story.querySelectorAll('.cinematic-premise'))
        premise.style.opacity=String(focusWithin(premise)?1:range(choreography.premise));
    }
    cards.forEach((card,i)=>{
      const v=cardValues[i];setLine(card,filmLineVisibility(v,0,1,0));
      // The invitation leaves as one unit, rather than a stranded glass rim or cropped line.
      // Hiding only the paint keeps the action keyboard-reachable; new focus seeks its reading rest.
      const departing=wrapper.getAttribute('data-film-position')==='leaving'&&masthead&&
        card.getBoundingClientRect().top<masthead.getBoundingClientRect().bottom;
      if(departing)card.style.opacity='0';
      card.inert=v<=0;card.setAttribute('aria-hidden',String(v<=0));card.style.pointerEvents=v>0&&!departing?'auto':'none';
    });
  }
  function paint() {
    const position=progress(),synchronous=synchronizeDeparture(position),pictures=session?.pictures;
    if(!pictures?.size){if(synchronous)canvas.style.visibility='hidden';return false;}
    const wanted=clamp(Math.round(head*film.fps),0,film.frames-1);
    const available=[...pictures.keys()];
    // During pinned travel a neighbour may decode before the requested frame. Retain the canvas
    // rather than overshoot the playhead and step back on its later arrival.
    // The interval reverses naturally when the reader reverses or seeks.
    const between=painted<0?available:available.filter(index=>index>=Math.min(painted,wanted)&&index<=Math.max(painted,wanted));
    const candidates=synchronous?available.filter(index=>Math.abs(index-wanted)<=1):
      between.length?between:session.missing.has(wanted)?available:[];
    if(!candidates.length){if(synchronous)canvas.style.visibility='hidden';return !synchronous;}
    const index=candidates.reduce((a,b)=>Math.abs(b-wanted)<Math.abs(a-wanted)?b:a);
    if(!dirty&&index===painted){canvas.style.visibility='visible';if(position<film.departureAt)departureSeeking=false;return true;}
    const image=pictures.get(index);
    const fit=typeof film.fit==='object'?film.fit[variant]:film.fit;
    const scale=(fit==='contain'?Math.min:Math.max)(width/image.width,height/image.height);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;dirty=true;}
    const w=image.width*scale,h=image.height*scale,jump=Math.abs(index-painted);
    // Authored transparent frames must erase former pixels on forward and reverse travel.
    if(transparent)ctx.clearRect(0,0,width,height);
    ctx.globalAlpha=!transparent&&!synchronous&&!dirty&&jump>=1&&jump<=2?1-persistence:1;
    ctx.drawImage(image,(width-w)*film.focus[0],(height-h)*film.focus[1],w,h);
    ctx.globalAlpha=1;painted=index;dirty=false;canvas.style.visibility='visible';
    if(position<film.departureAt)departureSeeking=false;
    return true;
  }
  function tick(now) {
    if(!active||!drawn||disposed||!visible()){last=0;return;}
    if(navigation){
      navigation.started??=now;
      const progress=clamp((now-navigation.started)/navigationDuration);
      navigation.arrived=progress===1;
      window.scrollTo({top:navigation.from+(navigation.to-navigation.from)*navigationCurve(progress),behavior:'instant'});
    }
    if(film.intro)introStarted??=now;
    const position=progress(),target=Math.max(at(position),introProgress(now)*(film.frames-1)/film.fps);
    head=synchronizeDeparture(position)?target:advanceFilm(head,target,last?(now-last)/1000:0,physics);last=now;
    try {pump();paint();copy();} catch {fail();return;}
    if(navigation?.arrived&&head===target){
      const arrival=navigation;cancelNavigation();
      // Pointer/touch keep their invoker while the scene travels. A reader who
      // moved focus meanwhile owns it; arrival must never steal it back.
      if(document.activeElement===arrival.invoker||document.activeElement===document.body)focusDestination(arrival.target);
    }
    return Boolean(navigation||head!==target||film.intro&&now-introStarted<scenePhysics['intro-duration']);
  }
  const animation=createFrameLoop(tick,{window,eligible:()=>active&&drawn&&visible()&&!disposed});
  const schedule=animation.request;
  function release() {
    cancelNavigation();
    session?.abort.abort();session?.pending.forEach(request=>request.abort());session?.pictures.forEach(p=>p.close());session=null;
    canvas.style.visibility='hidden';
    departureSeeking=false;
    animation.cancel();last=0;painted=-1;dirty=true;
  }
  function fail() {failed=true;state();}
  function acquire() {
    if(disposed||!active)return;
    session={abort:new AbortController(),pictures:new Map(),pending:new Map(),missing:new Set(),bytes:0,frameBytes:0};
    if(!drawn||film.prepare)head=resumePosition?.head??at(pendingTarget?restFor(pendingTarget):progress());
    pump();
  }
  function residentWindow(current) {
    synchronizeDeparture();
    const center=clamp(Math.round(head*film.fps),0,film.frames-1);
    const capacity=current.frameBytes?Math.max(1,Math.floor(film.decodedByteLimit/current.frameBytes)):1;
    const position=progress();
    if(position>0)openingInterrupted=true;
    const opening=film.intro&&!openingInterrupted;
    const target=clamp(Math.round(at(position)*film.fps),0,film.frames-1);
    const desired=filmFrameWindow(film.frames,center,capacity,target);
    return {center,capacity,desired,opening};
  }
  function pump() {
    const current=session;if(!active||!current||disposed)return;
    const {center,capacity,desired,opening}=residentWindow(current);
    // Let the opening finish one useful request at a time as its clock advances.
    for(const [index,request] of current.pending)if(!opening&&!desired.includes(index)&&(current.frameBytes||departureSeeking)){
      current.pending.delete(index);request.abort();
    }
    // Evict decoded pixels, never frame addresses. Reverse travel can request every original again.
    for(const [i,image] of current.pictures)if(opening?i!==painted:!desired.includes(i)){
      current.bytes-=image.width*image.height*4;image.close();current.pictures.delete(i);
    }
    let candidates;
    if(opening){
      let next=center;
      while(next>painted&&current.missing.has(next))next--;
      if(next<=painted&&!drawn){
        next=center+1;
        while(next<film.frames&&current.missing.has(next))next++;
      }
      candidates=next>painted&&next<film.frames?[next]:[];
    }else candidates=current.frameBytes?desired:filmFrameWindow(film.frames,center,film.frames);
    const limit=current.frameBytes&&!opening?Math.min(capacity,film.concurrency):1;
    for(const i of candidates){
      if(current.pending.size>=limit)break;
      if(current.pictures.has(i)||current.pending.has(i)||current.missing.has(i))continue;
      const request=new AbortController();current.pending.set(i,request);void load(current,i,request);
    }
    if(!current.pending.size&&!current.pictures.size){fail();}
  }
  async function load(current,index,request) {
    let bitmap=null;
    try {
      const url=urls[variant][index];
      const source=!current.frameBytes&&new URL(url,document.baseURI);
      const still=source&&source.origin===location.origin&&stills.find(image=>{
        if(image.loading==='lazy'&&!image.complete)return false;
        // An eager single-source image can be downloading before currentSrc is set.
        const selected=image.currentSrc||(!image.srcset&&image.parentElement?.localName!=='picture'&&image.src);
        return selected===source.href;
      });
      // The visible storyboard can already be loading the exact opening frame.
      if(still&&typeof still.decode==='function'){
        try{
          await still.decode();
          if(!request.signal.aborted&&still.currentSrc===source.href)bitmap=await createImageBitmap(still);
        }catch{}
      }
      if(!bitmap){
        if(request.signal.aborted)return;
        const response=await fetch(url,{signal:request.signal,credentials:'same-origin'});
        if(!response.ok)throw new Error('Film frame unavailable');
        bitmap=await createImageBitmap(await response.blob());
      }
      if(disposed||session!==current||!active||request.signal.aborted||current.pending.get(index)!==request){bitmap.close();return;}
      if(!drawn&&film.prepare)head=resumePosition?.head??at(pendingTarget?restFor(pendingTarget):progress());
      const bytes=bitmap.width*bitmap.height*4;
      if(!bytes||bytes>film.decodedByteLimit){bitmap.close();bitmap=null;fail();return;}
      current.frameBytes=Math.max(current.frameBytes,bytes);
      const {center,desired,opening}=residentWindow(current);
      // A completed opening picture can advance the screen even if the clock
      // has moved on. Scroll-driven requests must still belong to the live window.
      if(opening?index<=painted||drawn&&index>center:!desired.includes(index)){bitmap.close();bitmap=null;return;}
      // Exact byte accounting also protects mixed-dimension inputs.
      while(current.bytes+bytes>film.decodedByteLimit&&current.pictures.size){
        const farthest=[...current.pictures.keys()].reduce((a,b)=>Math.abs(b-center)>Math.abs(a-center)?b:a);
        const old=current.pictures.get(farthest);current.bytes-=old.width*old.height*4;old.close();current.pictures.delete(farthest);
      }
      current.pictures.set(index,bitmap);current.bytes+=bytes;bitmap=null;dirty=true;
      if(!drawn){
        // Prepared scenes already own their scroll geometry. Other films retain decode-first enhancement.
        drawn=true;wrapper.dataset.islandState='drawn';resize(false);
        if (!fitsViewport()) {tooSmall=true;state();return;}
        if(resumePosition){
          const restore=resumePosition;resumePosition=null;pendingTarget=null;head=restore.head;
          window.scrollTo({top:scrollY+wrapper.getBoundingClientRect().top+scrollOffset(restore.progress),behavior:'instant'});
        }else if(pendingTarget){const target=pendingTarget;pendingTarget=null;seek(target,false);}
        else head=at(progress());
      }
      rememberPosition();
      try {paint();copy();schedule();} catch {fail();}
    }catch{
      bitmap?.close();if(session===current&&!current.abort.signal.aborted&&!request.signal.aborted){current.missing.add(index);schedule();}
    }finally{
      if(current.pending.get(index)===request)current.pending.delete(index);
      if(session===current&&active&&!disposed)pump();
    }
  }
  function resize(preserve=true) {
    if(disposed)return;
    cancelNavigation();
    if(preserve)preserveReadingPosition();
    const next=innerHeight>innerWidth?'portrait':'landscape';
    distance=flow?0:validDistances?film.scrollDistance[next]:Math.max(1,innerHeight)*(film.viewportSpan-1);
    wrapper.style.setProperty('--film-distance',`${distance}px`);
    const stage=element.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,film.pixelRatio);
    const nativeFrame=film.nativeFrame?story.querySelector('.cinematic-still')?.getBoundingClientRect():null;
    const frame=flow?stage:nativeFrame?.width&&nativeFrame?.height?nativeFrame:stage;
    const cssWidth=frame.width||innerWidth,cssHeight=flow||nativeFrame?frame.height:stage.height||innerHeight;
    if(nativeFrame){
      canvas.style.position='absolute';canvas.style.left=`${frame.left-stage.left}px`;canvas.style.top=`${frame.top-stage.top}px`;
      canvas.style.width=`${cssWidth}px`;canvas.style.height=`${cssHeight}px`;
    }
    const pixels=canvasSize(cssWidth,cssHeight,ratio);
    width=Math.max(1,pixels.width);height=Math.max(1,pixels.height);dirty=true;
    if(next!==variant){variant=next;if(active){release();acquire();}}
    if(!preserve||resizeReturns.get(window)?.owner!==wrapper)rememberPosition(true);
    updatePosition();schedule();
  }
  function fitsViewport() {
    if(flow)return true;
    if (!drawn&&!prepared) return true;
    const stage=element.getBoundingClientRect();
    // Entrance translations belong to enhancement, not the fully revealed footprint.
    // Restore them synchronously before paint; text, line wrapping and focus stay intact.
    const moving=[...new Set([...lines.flat(),...cards])];
    const transforms=moving.map(node=>node.style.transform);
    moving.forEach(node=>node.style.transform='none');
    try { return beats.every(beat=>{
      const parts=[...beat.querySelectorAll('.cinematic-title, .cinematic-premise, .cinematic-card')];
      const occupied=[];
      for(const part of parts){
        const box=part.getBoundingClientRect(),style=getComputedStyle(part);
        const clips=value=>['hidden','clip','auto','scroll'].includes(value);
        // Font ink may exceed its line box legitimately; only reject scroll overflow when clipped.
        if((clips(style.overflowY)&&part.scrollHeight>(part.clientHeight??box.height)+1)||
          (clips(style.overflowX)&&part.scrollWidth>(part.clientWidth??box.width)+1))return false;
        const extent={top:box.top,bottom:box.bottom,left:box.left,right:box.right};
        // Native Range rectangles include authored text without changing line wrapping or styles.
        if(document.createRange){
          const range=document.createRange();range.selectNodeContents(part);
          for(const rect of range.getClientRects()){
            if(!rect.width||!rect.height)continue;
            extent.top=Math.min(extent.top,rect.top);extent.bottom=Math.max(extent.bottom,rect.bottom);
            extent.left=Math.min(extent.left,rect.left);extent.right=Math.max(extent.right,rect.right);
          }
        }
        if(!box.width||!box.height||extent.top<stage.top-1||extent.bottom>stage.top+innerHeight+1||
          extent.left<stage.left-1||extent.right>stage.right+1)return false;
        occupied.push(extent);
      }
      // These are independent copy/card regions; their fully revealed footprints must not collide.
      return occupied.every((a,i)=>occupied.slice(i+1).every(b=>
        Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1));
    }); } finally { moving.forEach((node,i)=>node.style.transform=transforms[i]??''); }
  }
  function state() {
    if(disposed)return;
    const allowed=!failed&&!printing&&!tooSmall&&preference();
    const copyTime=!allowed&&(drawn||prepared)?copyPosition():null;
    if(!allowed||pageHidden||document.hidden)cancelResizeReturn();
    const arrival=!allowed&&!printing?navigation:null;
    if(!allowed&&navigation){pendingTarget=navigation.target;cancelNavigation();}
    // Reserve a complete scroll stage before an approaching scene decodes. Its
    // final HTML still remains the fallback, never a poster flashed before frame zero.
    if(allowed&&film.prepare&&!prepared){
      prepared=true;wrapper.dataset.islandState=drawn?'drawn':'preparing';resize(false);
      if(!fitsViewport()){tooSmall=true;state();return;}
      head=at(progress());copy();
    }
    const next=allowed&&!pageHidden&&!document.hidden&&visible(film.prepare?preload:0);
    if(next!==active){
      active=next;
      if(active){
        if(!film.prepare&&!drawn&&!pendingTarget)pendingTarget=beats.reduce((a,b)=>Math.abs(b.getBoundingClientRect().top)<Math.abs(a.getBoundingClientRect().top)?b:a);
        acquire();
      }else release();
    }
    if(!allowed&&(drawn||prepared)){
      const focus=allGroups.find(group=>group.contains(document.activeElement));
      // Preserve the copy the reader has reached, even when its image is still catching up.
      // An explicit entry may still be waiting for the first decoded frame when fit fails.
      // Keep that destination; pre-enhancement scroll geometry does not identify its beat.
      const pending=pendingTarget&&restFor(pendingTarget)!==null?pendingTarget:null;
      const nearest=pending??focus??beats.reduce((a,b)=>Math.abs(at(film.rests[beats.indexOf(b)])-copyTime)<Math.abs(at(film.rests[beats.indexOf(a)])-copyTime)?b:a);
      const occupied=visible();if(occupied)pendingTarget=nearest;drawn=false;prepared=false;wrapper.dataset.islandState='still';resetCopy();restorePresentation();
      if(!printing&&occupied)nearest?.scrollIntoView({block:'start',behavior:'instant'});
    }
    updatePosition();schedule();
    if(arrival&&(document.activeElement===arrival.invoker||document.activeElement===document.body))focusDestination(arrival.target);
  }
  function restFor(target) {
    const card=cards.findIndex(node=>node===target||node.contains(target));
    if(card>=0){
      // Find the first fully revealed position without assuming a linear authored edit.
      let lo=0,hi=1;for(let i=0;i<52;i++){const mid=(lo+hi)/2;if(at(mid)<film.cards[card][1])lo=mid;else hi=mid;}return hi;
    }
    const i=beats.findIndex(beat=>beat===target||beat.contains(target));return i<0?null:film.rests[i];
  }
  function seek(target,focus=true) {
    const rest=restFor(target);if(rest===null||disposed)return false;
    if(rest>0)openingInterrupted=true;
    cancelNavigation();
    cancelResizeReturn();
    readingPosition=null;
    resumePosition=null;
    if(drawn){
      head=at(rest);last=0;
      window.scrollTo({top:scrollY+wrapper.getBoundingClientRect().top+scrollOffset(rest),behavior:'instant'});
      state();if(active){pump();paint();}if(drawn)copy();schedule();
    }else {pendingTarget=target;target.scrollIntoView({block:'start',behavior:'instant'});state();}
    if(focus)focusDestination(target);
    return true;
  }
  function focusDestination(target) {
      // WebKit drops focus when a temporary tabindex is removed synchronously.
      // Keep the destination element focusable until focus leaves it, then restore its authored value.
      if(!focusRestorers.has(target)){
        const previous=target.getAttribute('tabindex');
        const restore=()=>{restoreAttribute(target,'tabindex',previous);focusRestorers.delete(target);};
        focusRestorers.set(target,restore);
        target.addEventListener('blur',restore,{once:true,signal:lifecycle.signal});
      }
      target.setAttribute('tabindex','-1');target.focus({preventScroll:true});
  }
  function navigate(target,invoker) {
    const rest=restFor(target);
    if(rest===null)return;
    openingInterrupted=true;
    if(!drawn||!active||!preference()||!Number.isFinite(navigationDuration)||!(navigationDuration>0)||!navigationCurve){seek(target);return;}
    cancelResizeReturn();readingPosition=null;resumePosition=null;
    navigation={target,invoker,from:scrollY,to:scrollY+wrapper.getBoundingClientRect().top+scrollOffset(rest),started:null};
    schedule();
  }
  const entryAnchor=film.entryBeat===undefined?null:document.getElementById('main');
  function fragment(hash=location.hash){try{
    const target=hash?document.getElementById(decodeURIComponent(hash.slice(1))):null;
    return entryAnchor&&target===entryAnchor?beats[film.entryBeat]:target;
  }catch{return null;}}
  function reconcile(event) {
    cancelNavigation();
    cancelResizeReturn();
    readingPosition=null;
    // New navigation owns the destination even if the first post-print decode finishes
    // before the animation-frame callback that reconciles the browser's fragment scrolling.
    resumePosition=null;
    const destination=fragment();
    const traversal=event?.type==='popstate'||event?.type==='pageshow'&&
      (event.persisted||globalThis.performance?.getEntriesByType?.('navigation')?.[0]?.type==='back_forward');
    if(traversal)traversalPending=true;
    else if(event?.type!=='hashchange')traversalPending=false;
    const recover=traversalPending,version=activity;
    if(!drawn)pendingTarget=destination&&restFor(destination)!==null?destination:null;
    cancelAnimationFrame(navigationFrame);
    navigationFrame=requestAnimationFrame(()=>{
      navigationFrame=0;traversalPending=false;if(disposed)return;
      const target=fragment();
      if(target&&restFor(target)!==null){seek(target,false);return;}
      if(!recover||location.hash||activity!==version||!drawn)return;
      // Native history owns the restored scroll position. Only bring the visual
      // edit to that observed pose; stale copy must not damp through another scene.
      head=at(progress());last=0;
      state();if(active){pump();paint();}if(drawn)copy();schedule();
    });
  }
  const on=(node,type,callback,options={})=>node.addEventListener(type,callback,{...options,signal:lifecycle.signal});
  on(wrapper,'click',event=>{
    const link=event.target.closest?.('a[href]');
    if(!link||event.defaultPrevented||event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
    const url=new URL(link.href);
    if(url.origin!==location.origin||url.pathname!==location.pathname||url.search!==location.search||!url.hash)return;
    const target=fragment(url.hash);if(!target||restFor(target)===null)return;
    const travel=event.detail>0;
    event.preventDefault();if(location.hash!==url.hash)history.pushState(null,'',url.hash);
    // Keyboard/assistive activation and recovery arrive immediately rather than
    // focusing an inert scene while its visual edit is still travelling.
    if(travel)navigate(target,document.activeElement);else seek(target);
  });
  if(entryAnchor)on(entryAnchor,'focus',()=>{
    // Native skip-link focus stays on main; reconcile after the browser scrolls it.
    cancelAnimationFrame(navigationFrame);
    navigationFrame=requestAnimationFrame(()=>{navigationFrame=0;if(!disposed&&document.activeElement===entryAnchor)seek(beats[film.entryBeat],false);});
  });
  on(wrapper,'focusin',event=>{
    if(!drawn)return;
    // A newly focused action must be fully visible. Manual departure with existing
    // focus remains free: scrolling does not seek or repeatedly pull the reader backwards.
    const target=event.target;
    const card=cards.find(node=>node.contains(target));
    const clipped=card&&wrapper.getAttribute('data-film-position')==='leaving'?card:target;
    if(masthead&&target?.matches?.('a[href], button, input, select, textarea, summary')&&
      clipped.getBoundingClientRect().top<masthead.getBoundingClientRect().bottom)seek(target,false);
    copy();
  });
  on(wrapper,'focusout',()=>schedule());
  on(window,'scroll',()=>{
    rememberPosition();
    if(!drawn&&!active&&!printing)pendingTarget=null;
    state();
    if((drawn||prepared)&&synchronizeDeparture())try{pump();paint();copy();}catch{fail();}
    schedule();
  },{passive:true});
  function cancelPrintReturn(){if(resumePosition){resumePosition=null;pendingTarget=null;}}
  const userInput=()=>{activity++;traversalPending=false;cancelNavigation();cancelPrintReturn();cancelResizeReturn();rememberPosition(true);};
  on(window,'wheel',userInput,{passive:true});
  on(window,'pointerdown',userInput,{passive:true});
  on(window,'touchstart',userInput,{passive:true});
  on(window,'touchmove',userInput,{passive:true});
  on(window,'keydown',event=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' ','Tab','Escape'].includes(event.key))userInput();});
  on(document,'focusin',event=>{if(event.target!==document.body&&event.target!==navigation?.invoker)userInput();});
  function recheckLayout(){if(disposed)return;tooSmall=false;resize();if((drawn||prepared)&&!fitsViewport())tooSmall=true;state();}
  on(window,'resize',recheckLayout,{passive:true});
  if(document.fonts){on(document.fonts,'loadingdone',recheckLayout);document.fonts.ready?.then(recheckLayout);}
  on(document,'visibilitychange',state);motionSetting.onMotionChange(state,{signal:lifecycle.signal});
  on(window,'beforeprint',()=>{resumePosition=drawn&&visible()?{progress:progress(),head}:null;printing=true;state();});
  on(window,'afterprint',()=>{printing=false;if(!preference())resumePosition=null;resize(false);state();});
  on(window,'pagehide',()=>{pageHidden=true;state();});
  on(window,'pageshow',event=>{pageHidden=false;resize(false);reconcile(event);state();});
  on(window,'popstate',reconcile);on(window,'hashchange',reconcile);
  const sizing=globalThis.ResizeObserver?new ResizeObserver(()=>{resize();if((drawn||prepared)&&!fitsViewport())tooSmall=true;state();}):null;
  sizing?.observe(element);
  if(film.nativeFrame){const frame=story.querySelector('.cinematic-still');if(frame)sizing?.observe(frame);}
  resize(false);
  const target=fragment();if(target&&restFor(target)!==null){pendingTarget=target;seek(target,false);}else state();
  return ()=>{
    if(disposed)return;disposed=true;active=false;cancelResizeReturn();release();animation.dispose();cancelAnimationFrame(navigationFrame);
    lifecycle.abort();focusRestorers.forEach(restore=>restore());sizing?.disconnect();resetCopy();restoreTitleLines.forEach(restore=>restore());canvas.remove();
    restoreAttribute(wrapper,'data-island-state',initialState);
    restoreAttribute(wrapper,'data-film-position',initialPosition);
    restoreAttribute(wrapper,'data-film-layout',initialLayout);
    restoreAttribute(wrapper,'data-film-timing',initialTiming);
    if(initialDistance)wrapper.style.setProperty('--film-distance',initialDistance);else wrapper.style.removeProperty('--film-distance');
    if(initialCopyClip)wrapper.style.setProperty('--film-copy-clip',initialCopyClip);else wrapper.style.removeProperty('--film-copy-clip');
    restorePresentation();
  };
}
