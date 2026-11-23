// The complete authored entries remain in place. Enhancement joins their choices
// to one stacked picture frame; ordinary view-set radios keep their own behavior.
const mounted = new WeakMap();
let serial = 0;

// One outline carries the selected tab and stable picture frame. In compact flow
// they remain separate rounded regions; the painted outline leaves their layout intact.
export function previewContour(choice, frame, radius, frameRadius) {
  const values=[choice.left,choice.top,choice.right,choice.bottom,frame.left,frame.top,frame.right,frame.bottom,radius,frameRadius];
  if(values.some(v=>!Number.isFinite(v))||radius<0||frameRadius<0||choice.right<=choice.left||choice.bottom<=choice.top||frame.right<=frame.left||frame.bottom<=frame.top)return null;
  const n=v=>Number(v.toFixed(3));
  const rect=(b,r)=>`M${n(b.left+r)},${n(b.top)}H${n(b.right-r)}Q${n(b.right)},${n(b.top)} ${n(b.right)},${n(b.top+r)}V${n(b.bottom-r)}Q${n(b.right)},${n(b.bottom)} ${n(b.right-r)},${n(b.bottom)}H${n(b.left+r)}Q${n(b.left)},${n(b.bottom)} ${n(b.left)},${n(b.bottom-r)}V${n(b.top+r)}Q${n(b.left)},${n(b.top)} ${n(b.left+r)},${n(b.top)}Z`;
  const rt=Math.min(radius,(choice.right-choice.left)/2,(choice.bottom-choice.top)/2);
  const rf=Math.min(frameRadius,(frame.right-frame.left)/2,(frame.bottom-frame.top)/2);
  if(Math.abs(choice.right-frame.left)>1||choice.top<frame.top||choice.bottom>frame.bottom)return rect(choice,rt)+rect(frame,rf);
  const x=frame.left, a=choice.top, b=choice.bottom, l=choice.left;
  const jt=Math.min(radius,Math.max(0,a-frame.top-rf)),jb=Math.min(radius,Math.max(0,frame.bottom-rf-b));
  return `M${n(x+rf)},${n(frame.top)}H${n(frame.right-rf)}Q${n(frame.right)},${n(frame.top)} ${n(frame.right)},${n(frame.top+rf)}V${n(frame.bottom-rf)}Q${n(frame.right)},${n(frame.bottom)} ${n(frame.right-rf)},${n(frame.bottom)}H${n(x+rf)}Q${n(x)},${n(frame.bottom)} ${n(x)},${n(frame.bottom-rf)}V${n(b+jb)}Q${n(x)},${n(b)} ${n(x-jb)},${n(b)}H${n(l+rt)}Q${n(l)},${n(b)} ${n(l)},${n(b-rt)}V${n(a+rt)}Q${n(l)},${n(a)} ${n(l+rt)},${n(a)}H${n(x-jt)}Q${n(x)},${n(a)} ${n(x)},${n(a-jt)}V${n(frame.top+rf)}Q${n(x)},${n(frame.top)} ${n(x+rf)},${n(frame.top)}Z`;
}

export function mount({ element }) {
  const wrapper = element.closest('[data-gazette-component]');
  const set = wrapper?.querySelector('.preview-set');
  if (!set || mounted.has(set)) return;
  const views = [...set.querySelectorAll(':scope > .view-set__views > .view')];
  const choices = views.map(view => view.querySelector(':scope > .view__choice'));
  const radios = choices.map(choice => choice?.querySelector(':scope > input[type="radio"]'));
  const panels = views.map(view => view.querySelector(':scope > .view__panel'));
  const premises = choices.map(choice => choice?.querySelector(':scope > .view__more'));
  if (views.length < 2 || radios.some(radio => !radio) || panels.some(panel => !panel)) return;
  if (new Set(radios.map(radio => radio.name)).size !== 1 || !radios[0].name) return;
  const images=panels.map(panel=>panel.querySelector(':scope > p:first-child img'));
  if(images.some(image=>!image))return;

  const lifecycle = new AbortController();
  const saved = [];
  const remember = (node, names) => names.forEach(name => saved.push([node, name, node.getAttribute(name)]));
  remember(set, ['style']);
  set.style.setProperty('--preview-count', String(views.length));
  views.forEach((view, index) => {
    remember(view, ['style']);
    view.style.setProperty('--preview-row', String(index + 1));
    remember(panels[index], ['inert', 'aria-hidden']);
    if (premises[index]) {
      remember(premises[index], ['id', 'aria-hidden']);
      remember(radios[index], ['aria-describedby']);
      if (!premises[index].id) premises[index].id = `preview-premise-${++serial}`;
      radios[index].setAttribute('aria-describedby', premises[index].id);
    }
  });
  if (!radios.some(radio => radio.checked)) radios[0].checked = true;
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  let printing = false;
  let restoreFrame = null, geometryFrame = null;
  const rail=set.querySelector?.(':scope > .view-set__views');
  const backplate=rail?.querySelector(':scope > .preview-backplate');
  const contour=rail?.querySelector(':scope > .preview-contour');
  const contourPath=contour?.querySelector('path');
  function measureContour(){
    geometryFrame=null;
    if(lifecycle.signal.aborted||printing||!sizing||!rail||!backplate||!contourPath||!globalThis.CSS?.supports?.('clip-path','path("M0,0H1V1Z")'))return;
    const index=radios.findIndex(radio=>radio.checked);if(index<0)return;
    const style=getComputedStyle(set);
    const firstChoice=choices[0].getBoundingClientRect(),firstFrame=panels[0].getBoundingClientRect();
    const wide=Math.abs(firstChoice.right-firstFrame.left)<1&&firstFrame.left>firstChoice.left;
    const pixels=value=>Number.parseFloat(value)||0;
    let capacity=0;
    if(wide){
      const closed=choices.map(choice=>{
        const css=getComputedStyle(choice),title=choice.querySelector('.view__title');
        return (title?.getBoundingClientRect().height??0)+['paddingBlockStart','paddingBlockEnd','borderBlockStartWidth','borderBlockEndWidth','marginBlockStart','marginBlockEnd'].reduce((sum,key)=>sum+pixels(css[key]),0);
      });
      const expanded=choices.map((choice,i)=>{
        const inner=premises[i]?.querySelector(':scope > span');
        return inner?(inner.getBoundingClientRect().height+pixels(getComputedStyle(choice).rowGap)):0;
      });
      capacity=closed.reduce((a,b)=>a+b,0)+Math.max(0,...expanded)+pixels(style.getPropertyValue('--radius-preview-join'))+pixels(getComputedStyle(rail).rowGap)*views.length;
    }
    const reserve=wide?`${capacity}px`:'';
    // Capacity is selection-invariant. Only a real width/font/content change writes layout;
    // resolve that bounded change before reading the decorative contour's new boxes.
    if(set.style.getPropertyValue('--preview-content-min')!==reserve){
      if(wide)set.style.setProperty('--preview-content-min',reserve);else set.style.removeProperty('--preview-content-min');
    }
    const origin=rail.getBoundingClientRect();
    const local=node=>{const r=node.getBoundingClientRect();return{left:r.left-origin.left,top:r.top-origin.top,right:r.right-origin.left,bottom:r.bottom-origin.top};};
    const path=previewContour(local(choices[index]),local(panels[index]),Number.parseFloat(style.getPropertyValue('--radius-preview-join')),Number.parseFloat(style.getPropertyValue('--radius-preview-frame')));
    if(!path){set.classList.remove('preview-set--outlined');return;}
    backplate.style.clipPath=`path("${path}")`;
    contour.setAttribute('viewBox',`0 0 ${origin.width} ${origin.height}`);
    contourPath.setAttribute('d',path);set.classList.add('preview-set--outlined');
  }
  function scheduleContour(){
    if(lifecycle.signal.aborted||geometryFrame!==null)return;
    geometryFrame=requestAnimationFrame(measureContour);
  }
  // A preceding choice can keep moving the selected one after its own height settles.
  // Observe every row and frame; batch all reads before the single decorative write.
  const sizing=rail&&backplate&&contourPath&&globalThis.ResizeObserver?new ResizeObserver(scheduleContour):null;
  if(sizing)[rail,...choices,...panels].forEach(node=>sizing.observe(node));
  window.addEventListener('resize',scheduleContour,{signal:lifecycle.signal});
  document.fonts?.addEventListener('loadingdone',scheduleContour,{signal:lifecycle.signal});

  const expose = () => {
    panels.forEach((panel, index) => {
      const active = printing || radios[index].checked;
      panel.inert = !active;
      panel.setAttribute('aria-hidden', String(!active));
      premises[index]?.setAttribute('aria-hidden', String(!active));
    });
    scheduleContour();
  };
  const choose = index => {
    if (printing || radios[index].checked) return;
    radios[index].checked = true;
    expose();
  };
  choices.forEach((choice, index) => {
    choice.addEventListener('pointermove', event => {
      // Movement, rather than a layout-generated boundary event, owns hover.
      const focus = document.activeElement;
      // A passing pointer must not hide the keyboard reader's selection or link.
      const ownsFocus = set.contains(focus) &&
        (focus.matches(':focus-visible') || panels.some(panel => panel.contains(focus)));
      if (event.pointerType === 'mouse' && pointer.matches && !ownsFocus) choose(index);
    }, { signal: lifecycle.signal });
    radios[index].addEventListener('focus', () => choose(index), { signal: lifecycle.signal });
    radios[index].addEventListener('change', expose, { signal: lifecycle.signal });
  });
  window.addEventListener('beforeprint', () => { printing = true; expose(); }, { signal: lifecycle.signal });
  window.addEventListener('afterprint', () => { printing = false; expose(); }, { signal: lifecycle.signal });
  // Browsers can restore native radio values after mount without a change event.
  const restoreSelection = () => {
    if (restoreFrame !== null) cancelAnimationFrame(restoreFrame);
    restoreFrame = requestAnimationFrame(() => { restoreFrame = null; expose(); });
  };
  window.addEventListener('pageshow', restoreSelection, { signal: lifecycle.signal });
  const dispose = () => {
    lifecycle.abort();sizing?.disconnect();
    if(geometryFrame!==null)cancelAnimationFrame(geometryFrame);
    set.classList.remove('preview-set--outlined');
    if(backplate)backplate.style.clipPath='';
    contourPath?.removeAttribute('d');contour?.removeAttribute('viewBox');
    if (restoreFrame !== null) cancelAnimationFrame(restoreFrame);
    set.classList.remove('preview-set--ready');
    saved.forEach(([node, name, value]) => value === null ? node.removeAttribute(name) : node.setAttribute(name, value));
    mounted.delete(set);
  };
  mounted.set(set, dispose);
  expose();
  restoreSelection();
  set.classList.add('preview-set--ready');
  scheduleContour();
  // A picture is part of this relationship. A failed resource returns the entire
  // authored sequence, rather than retaining an empty enhanced frame.
  images.forEach(image=>image.addEventListener('error',dispose,{signal:lifecycle.signal}));
  if(images.some(image=>image.complete&&image.naturalWidth===0))dispose();
  return dispose;
}
