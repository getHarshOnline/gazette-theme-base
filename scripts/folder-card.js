import { stepEdge, shapeMask } from './card-shape.js';

// The two tangent arcs form one folder step. Coordinates come from the card's
// measured box and shared shape tokens; text and the real link are never masked.
export function folderGeometry(width, height, copyHeight, { tab, notch, closed, open }) {
  if (![width,height,copyHeight,tab,notch,closed,open].every(Number.isFinite) || width <= 0 || height <= 0 || tab <= 0 || tab >= 1 || notch <= 0 || closed < 0 || open < closed) return null;
  const drop = Math.min(width * notch, height), x = width * tab;
  const edge = `M0 0${stepEdge(x,0,drop)}H${width}`;
  const room = Math.max(0,(height-copyHeight-drop)/height);
  return { edge, face: `${edge}V${height}H0Z`, closed: Math.min(closed,room), open: Math.min(open,room) };
}

export function mountFolderCards(container=document, selector='[data-folder-card]:not([data-catalogue-clone])') {
  const cards=[...container.querySelectorAll(selector)];
  if (!cards.length || typeof ResizeObserver!=='function') return;
  const measure=card=>{
    const inner=card.querySelector('.folder-card__inner'), copy=card.querySelector('.folder-card__copy'), face=card.querySelector('.folder-card__face'), edge=card.querySelector('.folder-card__edge');
    if (!inner || !copy || !face || !edge) return;
    const css=getComputedStyle(card), read=name=>parseFloat(css.getPropertyValue(name));
    const width=inner.clientWidth,height=inner.clientHeight;
    const role=(name,fallback)=>Number.isFinite(read(name))?read(name):read(fallback);
    const geometry=folderGeometry(width,height,copy.offsetHeight,{tab:read('--layout-folder-tab'),notch:read('--layout-folder-notch'),closed:role('--folder-closed-share','--layout-folder-closed'),open:role('--folder-open-share','--layout-folder-open')});
    if (!geometry) return;
    face.style.clipPath=`path("${geometry.face}")`;
    if (!face.style.clipPath) {
      face.style.maskImage=shapeMask(geometry.face,width,height);
      face.style.webkitMaskImage=face.style.maskImage;
    }
    edge.setAttribute('viewBox',`0 0 ${width} ${height}`);
    edge.querySelector('path').setAttribute('d',geometry.edge);
    card.style.setProperty('--folder-closed',`${geometry.closed*100}%`);
    card.style.setProperty('--folder-open',`${geometry.open*100}%`);
    card.dataset.folderReady='true';
  };
  const observer=new ResizeObserver(entries=>{
    for(const entry of entries) {
      const card=entry.target.closest('[data-folder-card]');
      if(card)measure(card);
    }
  });
  for(const card of cards) {
    measure(card);
    for(const node of card.querySelectorAll('.folder-card__inner,.folder-card__copy'))observer.observe(node);
  }
  document.fonts?.ready.then(()=>cards.forEach(measure)).catch(()=>{});
  return ()=>observer.disconnect();
}
