import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../scripts/media-viewer.js',import.meta.url),'utf8').replace('export function','function');

function fixture({scene=false,cinematic=false,blockBoundary=false,standalone=true,externalDrawing=false,inspection=false,paneWidth=360,paneHeight=500,controlsHeight=80,marginBlock=0,loaded=true,decorative=false,listed=true,linked=false,hidden=false,replacement=false,replacementRef='article:one#image-1',duplicates=false,url='https://publication.test/images/chart.svg',rendered,variants,width,responsive,intrinsic,systemDark=false,world='light dark',mode,scrollHeight=500,clientHeight=500,tabindex}={}){
 class Element{
  constructor(tag='div'){this.tag=tag;this.attrs={};this.children=[];this.events={};this.parentNode=null;this.hidden=false;this._text='';this.style={getPropertyValue(name){return this[name]||'';},setProperty(name,value){this[name]=String(value);},removeProperty(name){delete this[name];}};}
  get textContent(){return this.tag==='#text'?this._text:this.children.map(node=>node.textContent).join('');}
  set textContent(value){this.children.forEach(node=>node.parentNode=null);this.children=[];if(this.tag==='#text')this._text=String(value);else if(value){const text=new Element('#text');text._text=String(value);this.append(text);}}
  get childNodes(){return this.children;}
  get attributes(){return Object.entries(this.attrs).map(([name,value])=>({name,value}));}
  cloneNode(deep){const copy=new Element(this.tag);copy.attrs={...this.attrs};copy._text=this._text;if(deep)for(const child of this.children)copy.append(child.cloneNode(true));return copy;}
  replaceChildren(...nodes){this.textContent='';for(const node of nodes)this.append(node);}
  append(node){node.remove();node.parentNode=this;this.children.push(node);}
  insertBefore(node,next){node.remove();node.parentNode=this;this.children.splice(this.children.indexOf(next),0,node);}
  remove(){if(this.parentNode){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}}
  after(node){node.remove();const siblings=this.parentNode.children;node.parentNode=this.parentNode;siblings.splice(siblings.indexOf(this)+1,0,node);}
  get nextElementSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null;}
  before(node){this.parentNode.insertBefore(node,this);}
  replaceWith(node){this.before(node);this.remove();}
  getAttribute(name){return this.attrs[name]??null;}
  setAttribute(name,value){this.attrs[name]=String(value);}
  removeAttribute(name){delete this.attrs[name];}
  querySelector(selector){return this.selectors?.[selector]||null;}
  querySelectorAll(selector){return selector==='.publication-body img,.reading-notes__body img'?[original]:selector===':scope > svg'?this.children.filter(n=>n.tag==='svg'):selector==='*'?this.children.filter(n=>n.tag!=='#text').flatMap(n=>[n,...n.querySelectorAll('*')]):[];}
  closest(selector){if(selector==='[data-media-inspection="off"]' && this.attrs['data-media-inspection']==='off')return this;if(selector==='[data-gazette-image-block]' && this.attrs['data-gazette-image-block']!==undefined)return this;if(this.tag===selector || selector==='[hidden],[inert],[aria-hidden="true"]' && (this.hidden || this.attrs.inert!==undefined || this.attrs['aria-hidden']==='true') || selector[0]==='.' && this.className===selector.slice(1))return this;return this.parentNode?.closest(selector)||null;}
  contains(node){return this===node || this.children.some(child=>child.contains(node));}
  getClientRects(){return this.closest('[hidden],[inert],[aria-hidden="true"]') || this.noLayout ? [] : [{}];}
  getBoundingClientRect(){return this.bounds || {width:400,height:515};}
  focus(){document.activeElement=this;}
  addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
  fire(type){for(const fn of this.events[type]||[])fn({});}
 }
 const article=new Element(),figure=new Element(standalone?'figure':'p'),original=new Element('img'),originalCaption=new Element('figcaption'),anchor=new Element('a');
 if(scene)figure.setAttribute('data-media-inspection','off');
 const nativeURL=url;original.hidden=hidden;original.clientWidth=rendered;original.currentSrc=nativeURL;original.src=nativeURL;original.complete=loaded;original.naturalWidth=loaded?640:0;original.naturalHeight=1126;
 original.setAttribute('alt',decorative?'':'A supplied chart');original.setAttribute('data-gazette-image','article:one#image-1');originalCaption.textContent='The supplied figure caption.';figure.selectors={':scope > figcaption':originalCaption};
 const boundary=new Element();if(blockBoundary){boundary.setAttribute('data-gazette-image-block','');article.append(boundary);boundary.append(figure);}else article.append(figure);if(linked){figure.append(anchor);anchor.append(original);}else figure.append(original);figure.append(originalCaption);
 if(cinematic){const still=new Element();still.className='cinematic-still';still.append(blockBoundary?boundary:figure);article.append(still);}
 const drawing=new Element(),drawingControl=new Element('button');drawing.className='figure-drawing';drawing.setAttribute('data-gazette-image-ref',replacementRef);drawing.append(drawingControl);
 const addDrawing=()=>{original.hidden=true;if(externalDrawing)figure.before(drawing);else original.before(drawing);};
 if(replacement)addDrawing();
 if(duplicates){const other=new Element();other.setAttribute('data-gazette-image-ref',replacementRef);figure.append(other);}
 const tenant=new Element(),viewer=new Element('figure'),caption=new Element('figcaption'),configuration=new Element('script');
 const viewport=new Element(),enlarge=new Element('button'),fit=new Element('button'),vector=new Element('svg');
 viewport.clientWidth=paneWidth;viewport.clientHeight=paneHeight;viewport.scrollWidth=paneWidth;viewport.scrollHeight=paneHeight;
 vector.viewBox={baseVal:{width:400,height:704}};vector.bounds={width:400,height:704};
 if(inspection){viewer.append(viewport);drawing.append(vector);drawing.getBoundingClientRect=()=>({width:viewport.clientWidth,height:vector.bounds.height+controlsHeight});}
 viewer.append(caption);
 tenant.clientHeight=clientHeight;tenant.scrollHeight=scrollHeight;tenant.setAttribute('data-tenant-title','Image');if(tabindex!==undefined)tenant.setAttribute('tabindex',tabindex);
 configuration.textContent=JSON.stringify([{address:listed?'article:one#image-1':'article:other#image-1',destination:nativeURL,alt:decorative?'':'A supplied chart',variants,width,responsive,intrinsic}]);tenant.selectors={'.media-viewer':viewer,'figcaption':caption,'[data-media-images]':configuration};tenant.setAttribute('data-media-expand','Expand image');
 if(inspection)Object.assign(tenant.selectors,{'.media-viewer__viewport':viewport,'[data-media-size]':enlarge,'[data-media-fit]':fit});
 const root=new Element(),scheme=new Element(),print=new Element();scheme.matches=systemDark;print.matches=false;if(mode)root.setAttribute('data-mode',mode);
 const observers=[];class MutationObserver{constructor(fn){this.fn=fn;observers.push(this);}observe(target){this.target=target;}}
 const mutate=(target,type='attributes')=>{for(const observer of observers)if(observer.target===target || observer.target.contains(target))observer.fn([{target,type}]);};
 const walk=node=>[node,...node.children.flatMap(walk)];
 let image;const document={documentElement:root,activeElement:null,querySelector:()=>article,querySelectorAll:()=>[...walk(article),...walk(viewer)].filter(node=>node.getAttribute('data-gazette-image-ref')!==null),createElement:tag=>{const node=new Element(tag);if(tag==='img')image=node;return node;}},window=new Element();window.matchMedia=query=>query==='print'?print:scheme;let opened=null,titleFocused=0,controller;
 const context=vm.createContext({document,window,MutationObserver,getComputedStyle:node=>({colorScheme:root.getAttribute('data-mode')==='system'?'light dark':world,visibility:node.visibility||'visible',marginBlockStart:node===drawing?`${marginBlock}px`:'0px',marginBlockEnd:node===drawing?`${marginBlock}px`:'0px',marginInlineStart:node.marginInlineStart||'0px',marginInlineEnd:node.marginInlineEnd||'0px'})});vm.runInContext(source,context);controller=context.mountMediaViewer(tenant,button=>{opened=button;controller.activate();},()=>titleFocused++);
 const load=()=>{original.currentSrc=original.src;original.complete=true;original.naturalWidth=640;original.fire('load');};
 return{boundary,viewport,enlarge,fit,vector,article,figure,original,anchor,originalCaption,tenant,viewer,root,scheme,print,load,mutate,document,drawing,drawingControl,addDrawing,setMode(value){root.setAttribute('data-mode',value);mutate(root);},get image(){return image;},caption,window,controller,get opened(){return opened;},get titleFocused(){return titleFocused;},buttons:()=>[...figure.children,...article.children].filter(node=>node.tag==='button')};
}

test('scene images retain their description and renditions without an enlargement action',()=>{
 const variants={light:'https://publication.test/images/light.svg',dark:'https://publication.test/images/dark.svg'};
 const f=fixture({scene:true,variants,mode:'light'});
 assert.equal(f.buttons().length,0);
 assert.equal(f.original.getAttribute('alt'),'A supplied chart');
 f.setMode('dark');f.load();
 assert.equal(f.original.src,variants.dark);
 assert.equal(f.buttons().length,0);
});

test('native cinematic stills never offer inspection through loading, appearance and print changes',()=>{
 const variants={light:'https://publication.test/images/light.svg',dark:'https://publication.test/images/dark.svg'};
 const f=fixture({cinematic:true,blockBoundary:true,standalone:false,loaded:false,variants,mode:'light'});
 assert.equal(f.buttons().length,0);
 f.load();f.window.fire('resize');
 assert.equal(f.buttons().length,0);
 f.setMode('dark');f.load();
 assert.equal(f.original.src,variants.dark);
 assert.equal(f.original.getAttribute('alt'),'A supplied chart');
 f.window.fire('beforeprint');f.window.fire('afterprint');
 assert.equal(f.original.src,variants.dark);
 assert.equal(f.buttons().length,0);
 const article=fixture({blockBoundary:true,standalone:false,variants});
 assert.equal(article.buttons().length,1);
});

test('only loaded nondecorative native image occurrences get an explicit inspection control',()=>{
 for(const options of [{decorative:true},{listed:false},{loaded:false,standalone:false}]){const f=fixture(options);assert.equal(f.buttons().length,0);}
 const f=fixture({loaded:false});f.original.complete=true;f.original.naturalWidth=640;f.original.fire('load');f.original.fire('load');assert.equal(f.buttons().length,1);
});

test('inspection preserves the original image/link and copies only its supplied image description and caption',()=>{
 const f=fixture({linked:true});const button=f.buttons()[0];assert.ok(button);assert.equal(button.parentNode,f.figure);assert.equal(f.anchor.children[0],f.original);assert.equal(button.getAttribute('aria-haspopup'),'dialog');assert.equal(button.getAttribute('aria-label'),'Expand image: A supplied chart');
 assert.equal(f.viewer.children.some(node=>node.tag==='img'),false);
 button.fire('click');assert.equal(f.opened,button);assert.equal(f.image.src,f.original.currentSrc);assert.equal(f.image.alt,'A supplied chart');assert.equal(f.caption.textContent,'The supplied figure caption.');assert.equal(f.caption.hidden,false);assert.equal(f.titleFocused,1);
 f.controller.deactivate();assert.equal(f.image.getAttribute('src'),null);assert.equal(f.viewer.children.some(node=>node.tag==='img'),false);assert.equal(f.caption.textContent,'');assert.equal(f.caption.hidden,true);assert.equal(f.original.parentNode,f.anchor);
});

test('print never opens a second surface and preserves the active viewer until the shell closes it',()=>{
 const f=fixture();const button=f.buttons()[0];button.fire('click');const source=f.image.src;f.window.fire('beforeprint');button.fire('click');assert.equal(f.titleFocused,1);assert.equal(f.image.src,source);f.window.fire('afterprint');button.fire('click');assert.equal(f.titleFocused,2);
});

test('a changed source is checked against its native image occurrence again before opening',()=>{
 const f=fixture();f.original.currentSrc='https://outside.test/not-selected.svg';f.original.fire('load');assert.equal(f.buttons()[0].hidden,true);f.buttons()[0].fire('click');assert.equal(f.opened,null);assert.equal(f.image.src,undefined);
});

test('a hidden fallback offers no enlargement and regains one when restored',()=>{
 const f=fixture({hidden:true});assert.equal(f.buttons().length,0);
 f.original.hidden=false;f.mutate(f.original);assert.equal(f.buttons().length,1);
 const button=f.buttons()[0];f.original.hidden=true;f.mutate(f.original);assert.equal(button.hidden,true);
 button.fire('click');assert.equal(f.opened,null,'a stale activation cannot open the hidden original');
 f.original.hidden=false;f.mutate(f.original);assert.equal(button.hidden,false);assert.equal(f.buttons().length,1);
 button.fire('click');assert.equal(f.image.src,f.original.currentSrc);assert.equal(f.caption.textContent,'The supplied figure caption.');
});

test('ancestor and CSS visibility changes retire stale controls without changing the figure',()=>{
 for(const hide of ['hidden','inert','aria-hidden','visibility','layout']){
  const f=fixture(),button=f.buttons()[0];
  if(hide==='hidden')f.figure.hidden=true;
  else if(hide==='visibility')f.original.visibility='hidden';
  else if(hide==='layout')f.original.noLayout=true;
  else f.figure.setAttribute(hide,hide==='aria-hidden'?'true':'');
  f.mutate(f.figure);assert.equal(button.hidden,true,hide);button.fire('click');assert.equal(f.opened,null);
  f.figure.hidden=false;f.figure.removeAttribute('inert');f.figure.removeAttribute('aria-hidden');f.original.visibility='visible';f.original.noLayout=false;
  f.mutate(f.figure);assert.equal(button.hidden,false,`${hide} restored`);assert.equal(f.original.parentNode,f.figure);
 }
});

test('an image load failure hides its old control until a declared image loads again',()=>{
 const f=fixture(),button=f.buttons()[0];f.original.naturalWidth=0;f.original.fire('error');assert.equal(button.hidden,true);
 f.load();assert.equal(button.hidden,false);assert.equal(f.buttons().length,1);
});

test('an explicitly bound live drawing moves intact and restores its exact place',()=>{
 const f=fixture({replacement:true,variants});const button=f.buttons()[0];assert.ok(button);
 let clicks=0;f.drawingControl.addEventListener('click',()=>clicks++);
 const before=[...f.figure.children];button.fire('click');
 assert.equal(f.drawing.parentNode,f.viewer);assert.equal(f.original.parentNode,f.figure);assert.equal(f.original.hidden,true);
 const placeholder=f.figure.children[0];assert.equal(placeholder.className,'media-viewer-placeholder');assert.equal(placeholder.style.width,'400px');assert.equal(placeholder.style.height,'515px');
 assert.equal(f.drawing.getAttribute('data-media-expanded'),'');assert.equal(f.viewer.children.includes(f.image),false);
 assert.equal(f.caption.textContent,'The supplied figure caption.');f.drawingControl.fire('click');assert.equal(clicks,1);
 f.setMode('dark');assert.equal(f.drawing.parentNode,f.viewer);assert.equal(f.image.src,undefined,'a live drawing keeps its world styling instead of loading the hidden fallback');
 f.controller.deactivate();assert.deepEqual(f.figure.children,before);assert.equal(f.drawing.getAttribute('data-media-expanded'),null);
 f.drawingControl.fire('click');assert.equal(clicks,2,'the same control and listeners survive');
});

test('a late enhancement replaces the old offer without a second control',()=>{
 const f=fixture(),button=f.buttons()[0];f.addDrawing();f.mutate(f.figure,'childList');assert.equal(f.buttons().length,1);assert.equal(button.hidden,false);
 button.fire('click');assert.equal(f.drawing.parentNode,f.viewer);f.controller.deactivate();
 f.drawing.remove();f.original.hidden=false;f.mutate(f.figure,'childList');button.fire('click');
 assert.equal(f.image.src,f.original.src);assert.equal(f.drawing.parentNode,null,'retiring an enhancement restores the original image path');
});

test('unknown, duplicate and fallback-containing replacement bindings never substitute a drawing',()=>{
 for(const options of [{replacement:true,replacementRef:'article:other#image-1'},{replacement:true,replacementRef:''},{replacement:true,duplicates:true}]){
  const f=fixture(options);assert.equal(f.buttons().length,0);
 }
 const f=fixture({replacement:true}),button=f.buttons()[0];f.drawing.append(f.original);f.mutate(f.drawing,'childList');assert.equal(button.hidden,true);button.fire('click');assert.equal(f.opened,null);
});

test('print returns a live drawing to its Notes body and resumes only the same active viewer',()=>{
 for(const leaveDuringPrint of [false,true]){
  const f=fixture({replacement:true});f.figure.className='reading-notes__body';const button=f.buttons()[0];button.fire('click');f.drawingControl.focus();
  f.window.fire('beforeprint');assert.equal(f.drawing.parentNode,f.figure);assert.equal(f.drawing.getAttribute('data-media-expanded'),null);
  f.window.fire('beforeprint');assert.equal(f.figure.children.filter(node=>node===f.drawing).length,1);
  if(leaveDuringPrint)f.controller.deactivate();
  f.window.fire('afterprint');assert.equal(f.drawing.parentNode,leaveDuringPrint?f.figure:f.viewer);
  if(!leaveDuringPrint)assert.equal(f.document.activeElement,f.drawingControl);
  f.controller.deactivate();assert.equal(f.drawing.parentNode,f.figure);assert.equal(f.figure.children.some(node=>node.className==='media-viewer-placeholder'),false);
 }
});

test('print media changes restore the drawing even before the print event',()=>{
 const f=fixture({replacement:true});f.buttons()[0].fire('click');f.print.matches=true;f.print.fire('change');assert.equal(f.drawing.parentNode,f.figure);
 f.window.fire('beforeprint');f.window.fire('afterprint');assert.equal(f.drawing.parentNode,f.figure,'the print rendition lasts until the print medium ends');
 f.print.matches=false;f.print.fire('change');assert.equal(f.drawing.parentNode,f.viewer);f.controller.deactivate();assert.equal(f.drawing.parentNode,f.figure);
});

test('the larger view is offered only where it can be larger, and a drawing fills the media shell',()=>{
 const drawing=fixture({rendered:640});assert.equal(drawing.buttons().length,1,'a scalable drawing fills the wider shell');
 drawing.buttons()[0].fire('click');assert.equal(drawing.image.getAttribute('data-scalable'),'');
 drawing.controller.deactivate();assert.equal(drawing.image.getAttribute('data-scalable'),null);
 assert.equal(fixture({url:'https://publication.test/images/chart.png',rendered:640}).buttons().length,0,'a raster shown at its own size has no larger view');
 const reduced=fixture({url:'https://publication.test/images/chart.png',rendered:320});assert.equal(reduced.buttons().length,1);
 reduced.buttons()[0].fire('click');assert.equal(reduced.image.getAttribute('data-scalable'),null);
});

const variants={light:'https://publication.test/images/light.svg',dark:'https://publication.test/images/dark.svg'};
test('declared width and renditions follow the existing preference, including an open viewer',()=>{
 const f=fixture({variants,width:480,systemDark:true});assert.equal(f.original.src,variants.dark);assert.equal(f.original.getAttribute('width'),'480');f.load();f.buttons()[0].fire('click');assert.equal(f.image.src,variants.dark);
 f.setMode('light');assert.equal(f.original.src,variants.light);assert.equal(f.image.src,variants.light);
 f.scheme.matches=false;f.scheme.fire('change');assert.equal(f.image.src,variants.light);
 f.setMode('system');f.scheme.matches=true;f.scheme.fire('change');assert.equal(f.original.src,variants.dark);assert.equal(f.image.src,variants.dark);
 f.controller.deactivate();f.setMode('light');assert.equal(f.image.getAttribute('src'),null);
});

test('world default yields to System and a missing rendition uses the declared default',()=>{
 const f=fixture({variants,world:'dark'});assert.equal(f.original.src,variants.dark);f.setMode('system');assert.equal(f.original.src,variants.light);
 const partial=fixture({variants:{light:variants.light},systemDark:true});assert.equal(partial.original.src,'https://publication.test/images/chart.svg');partial.setMode('light');assert.equal(partial.original.src,variants.light);partial.setMode('dark');assert.equal(partial.original.src,'https://publication.test/images/chart.svg');
 const ordinary=fixture({systemDark:true});assert.equal(ordinary.original.src,'https://publication.test/images/chart.svg');assert.equal(ordinary.original.getAttribute('width'),null);
});

test('print selects the default and restores the current preference without opening a surface',()=>{
 const f=fixture({variants,systemDark:true});f.load();f.buttons()[0].fire('click');f.window.fire('beforeprint');assert.equal(f.original.src,'https://publication.test/images/chart.svg');assert.equal(f.image.src,f.original.src);
 f.setMode('light');assert.equal(f.original.src,'https://publication.test/images/chart.svg');f.window.fire('afterprint');assert.equal(f.original.src,variants.light);assert.equal(f.image.src,variants.light);assert.equal(f.titleFocused,1);
 f.print.matches=true;f.print.fire('change');assert.equal(f.original.src,'https://publication.test/images/chart.svg');f.print.matches=false;f.print.fire('change');assert.equal(f.original.src,variants.light);
});

test('only an overflowing active viewer adds a named keyboard scroll stop and authored focus survives',()=>{
 const f=fixture({scrollHeight:900,clientHeight:800});assert.equal(f.tenant.getAttribute('tabindex'),null);f.buttons()[0].fire('click');assert.equal(f.tenant.getAttribute('tabindex'),'0');assert.equal(f.tenant.getAttribute('aria-label'),'Image');
 f.tenant.clientHeight=1000;f.image.fire('load');assert.equal(f.tenant.getAttribute('tabindex'),null);f.tenant.clientHeight=800;f.image.fire('load');assert.equal(f.tenant.getAttribute('tabindex'),'0');f.controller.deactivate();assert.equal(f.tenant.getAttribute('tabindex'),null);assert.equal(f.tenant.getAttribute('aria-label'),null);
 const authored=fixture({scrollHeight:900,clientHeight:800,tabindex:-1});authored.buttons()[0].fire('click');authored.controller.deactivate();assert.equal(authored.tenant.getAttribute('tabindex'),'-1');
});

test('fit reserves the actual pane for a complete tall SVG and leaves live controls unscaled',()=>{
 const f=fixture({inspection:true,replacement:true,paneWidth:360,paneHeight:500,controlsHeight:80});
 f.buttons()[0].fire('click');
 assert.equal(f.drawing.parentNode,f.viewport);
 assert.equal(f.viewport.style.getPropertyValue('--media-width'),'100%');
 assert.equal(f.viewport.style.getPropertyValue('--media-fit-height'),'420px');
 assert.equal(f.fit.getAttribute('aria-pressed'),'true');
 assert.equal(f.drawingControl.parentNode,f.drawing);
 assert.equal(f.drawing.style.transform,undefined,'controls are not scaled with the drawing');
 assert.equal(f.caption.textContent,'The supplied figure caption.');
 // A 400 × 704 drawing fits in 360 × 420 at its original aspect ratio.
 assert.ok(420*400/704<=360);
 assert.equal(f.enlarge.hidden,false);assert.equal(f.fit.hidden,false);
});

test('explicit zoom grows the same drawing, enables native scrolling and Fit keeps control focus',()=>{
 const f=fixture({inspection:true,replacement:true});f.buttons()[0].fire('click');
 f.enlarge.focus();f.viewport.scrollWidth=800;f.viewport.scrollHeight=1000;
 f.enlarge.fire('click');
 const first=parseFloat(f.viewport.style.getPropertyValue('--media-width'));
 assert.ok(first>=400);assert.equal(f.viewport.style.getPropertyValue('--media-fit-height'),'none');
 assert.equal(f.document.activeElement,f.enlarge);assert.equal(f.viewport.getAttribute('tabindex'),'0');
 assert.equal(f.viewport.getAttribute('aria-label'),'Image');
 f.enlarge.fire('click');assert.equal(parseFloat(f.viewport.style.getPropertyValue('--media-width')),first*2);
 assert.equal(f.drawing.parentNode,f.viewport);assert.equal(f.drawingControl.parentNode,f.drawing);
 f.viewport.scrollLeft=100;f.viewport.scrollTop=200;f.fit.focus();f.viewport.scrollWidth=360;f.viewport.scrollHeight=500;f.fit.fire('click');
 assert.equal(f.document.activeElement,f.fit);assert.equal(f.viewport.scrollLeft,0);assert.equal(f.viewport.scrollTop,0);
 assert.equal(f.viewport.getAttribute('tabindex'),null);assert.equal(f.viewport.style.getPropertyValue('--media-fit-height'),'420px');
});

test('fit and zoom respond to resized panes and wrapped controls without viewport-height guesses',()=>{
 const f=fixture({inspection:true,replacement:true});f.buttons()[0].fire('click');
 f.viewport.clientWidth=280;f.viewport.clientHeight=300;f.window.fire('resize');
 assert.equal(f.viewport.style.getPropertyValue('--media-fit-height'),'220px');
 f.enlarge.fire('click');assert.equal(f.viewport.style.getPropertyValue('--media-fit-height'),'none');
 f.viewport.clientWidth=1000;f.viewport.clientHeight=800;f.window.fire('resize');
 assert.ok(parseFloat(f.viewport.style.getPropertyValue('--media-width'))>=400);
 f.fit.fire('click');assert.equal(f.viewport.style.getPropertyValue('--media-fit-height'),'720px');
});

test('Fit ignores the auto margins computed from a static image’s zoomed width',()=>{
 for(const margin of ['-360px','180px']){
  const f=fixture({inspection:true});f.buttons()[0].fire('click');
  f.enlarge.fire('click');assert.ok(parseFloat(f.viewport.style.getPropertyValue('--media-width'))>f.viewport.clientWidth);
  f.image.marginInlineEnd=margin;f.fit.fire('click');
  assert.equal(f.viewport.style.getPropertyValue('--media-width'),'100%');
  assert.equal(f.fit.getAttribute('aria-pressed'),'true');
  assert.equal(f.viewport.scrollLeft,0);assert.equal(f.viewport.scrollTop,0);
 }
});

test('raster detail respects real pixels and repeated zoom remains bounded without losing focus',()=>{
 const f=fixture({inspection:true,url:'https://publication.test/images/chart.png',rendered:200});f.buttons()[0].fire('click');
 assert.equal(f.image.parentNode,f.viewport);f.enlarge.focus();
 for(let i=0;i<20;i++)f.enlarge.fire('click');
 assert.equal(f.viewport.style.getPropertyValue('--media-width'),'640px');
 assert.equal(f.enlarge.getAttribute('aria-disabled'),'true');assert.equal(f.document.activeElement,f.enlarge);
 f.fit.fire('click');assert.equal(f.enlarge.getAttribute('aria-disabled'),'false');
 const svg=fixture({inspection:true,replacement:true});svg.buttons()[0].fire('click');
 for(let i=0;i<20;i++)svg.enlarge.fire('click');
 assert.equal(svg.viewport.style.getPropertyValue('--media-width'),'3200px');
 assert.equal(svg.enlarge.getAttribute('aria-disabled'),'true');
});

test('zoomed live state returns for print and close, and each new inspection begins fitted',()=>{
 const f=fixture({inspection:true,replacement:true});const button=f.buttons()[0];button.fire('click');f.enlarge.fire('click');
 const width=f.viewport.style.getPropertyValue('--media-width');f.drawingControl.focus();
 f.window.fire('beforeprint');assert.equal(f.drawing.parentNode,f.figure);assert.equal(f.viewport.style.getPropertyValue('--media-width'),'');
 f.window.fire('afterprint');assert.equal(f.drawing.parentNode,f.viewport);assert.equal(f.viewport.style.getPropertyValue('--media-width'),width);assert.equal(f.document.activeElement,f.drawingControl);
 f.controller.deactivate();assert.equal(f.drawing.parentNode,f.figure);assert.equal(f.viewport.style.getPropertyValue('--media-fit-height'),'');assert.equal(f.enlarge.hidden,true);
 button.fire('click');assert.equal(f.viewport.style.getPropertyValue('--media-width'),'100%');assert.equal(f.fit.getAttribute('aria-pressed'),'true');
});


test('authored outer margins count against the measured fit height',()=>{
 const f=fixture({inspection:true,replacement:true,marginBlock:32});f.buttons()[0].fire('click');
 assert.equal(f.viewport.style.getPropertyValue('--media-fit-height'),'356px');
 assert.equal(f.drawing.style.margin,undefined,'the source margins remain authored');
});


test('detail measurement preserves native scroll position across a layout update',()=>{
 const f=fixture({inspection:true,replacement:true});f.buttons()[0].fire('click');f.enlarge.fire('click');
 f.viewport.scrollLeft=120;f.viewport.scrollTop=150;f.window.fire('resize');
 assert.equal(f.viewport.scrollLeft,120);assert.equal(f.viewport.scrollTop,150);
});

test('a loading standalone image reserves one inaccessible action and reuses it after loading',()=>{
 const f=fixture({loaded:false}),button=f.buttons()[0];
 assert.ok(button);assert.equal(button.hidden,false);
 assert.equal(button.getAttribute('data-media-pending'),'');
 assert.equal(button.getAttribute('aria-hidden'),'true');assert.equal(button.getAttribute('tabindex'),'-1');
 f.load();assert.equal(f.buttons()[0],button);assert.equal(f.buttons().length,1);
 assert.equal(button.getAttribute('data-media-pending'),null);assert.equal(button.getAttribute('aria-hidden'),null);assert.equal(button.getAttribute('tabindex'),null);
});

test('standalone enhancement actions remain below the complete drawing through open, print and restore',()=>{
 const f=fixture({replacement:true,externalDrawing:true}),button=f.buttons()[0];
 assert.equal(f.drawing.nextElementSibling,button);assert.equal(button.getAttribute('data-media-standalone'),'');
 button.fire('click');f.mutate(f.article,'childList');
 assert.equal(button.parentNode,f.article);assert.equal(f.viewer.children.includes(button),false);
 assert.equal(f.article.children[0].nextElementSibling,button);
 f.window.fire('beforeprint');f.mutate(f.article,'childList');assert.equal(f.drawing.nextElementSibling,button);
 f.window.fire('afterprint');f.controller.deactivate();f.mutate(f.article,'childList');
 assert.equal(f.drawing.nextElementSibling,button);assert.equal(f.buttons().length,1);
 f.drawing.remove();f.original.hidden=false;f.mutate(f.article,'childList');
 assert.equal(f.original.nextElementSibling,button);assert.equal(button.parentNode,f.figure);
});

test('an image embedded in prose never gains standalone layout or moves its enclosing link',()=>{
 const f=fixture({standalone:false,linked:true}),button=f.buttons()[0];
 assert.equal(button.getAttribute('data-media-standalone'),null);
 assert.equal(f.anchor.nextElementSibling,button);assert.equal(f.original.parentNode,f.anchor);
 button.fire('click');f.controller.deactivate();assert.equal(f.anchor.nextElementSibling,button);
});

test('the engine boundary supplies standalone placement without changing its paragraph',()=>{
 const f=fixture({standalone:false,blockBoundary:true,linked:true,replacement:true}),button=f.buttons()[0];
 assert.equal(f.figure.tag,'p');assert.equal(f.figure.parentNode,f.boundary);
 assert.equal(button.getAttribute('data-media-standalone'),'');
 assert.equal(f.anchor.nextElementSibling,button);assert.equal(f.original.parentNode,f.anchor);
 button.fire('click');f.controller.deactivate();assert.equal(f.figure.parentNode,f.boundary);
});

test('a real browser keeps caption mathematics visible once, rich prose intact and the source unchanged',async()=>{
 const {chromium}=await import('playwright');
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.route('https://publication.test/chart.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="silver"/></svg>'}));
  const math=(presentation,tex)=>`<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics>${presentation}<annotation encoding="application/x-tex">${tex}</annotation></semantics></math>`;
  const captionHTML=`<em id="caption-emphasis">Transform</em> ${math('<mrow><mn>2</mn><mi>x</mi><mo>+</mo><mn>1</mn></mrow>','2x+1')} yields ${math('<mn>7</mn>','7')}; estimate ${math('<mn>8.2</mn>','8.2')}. <a id="caption-link" href="https://publication.test/context" data-gazette-destination-content="content:context">Read context</a>.<button id="caption-control">Unrelated control</button>`;
  await page.setContent(`<main><div class="publication-body"><figure id="source"><img width="80" src="https://publication.test/chart.svg" alt="A supplied chart" data-gazette-image="article:one#image-1"><figcaption>${captionHTML}</figcaption></figure></div></main><section id="tenant" data-media-expand="Expand image"><figure class="media-viewer"><figcaption></figcaption></figure><script type="application/json" data-media-images>${JSON.stringify([{address:'article:one#image-1',destination:'https://publication.test/chart.svg',alt:'A supplied chart',title:'Plain fallback title'}])}</script></section>`);
  await page.waitForFunction(()=>document.querySelector('#source img').complete&&document.querySelector('#source img').naturalWidth>0);
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{window.viewer=mountMediaViewer(document.querySelector('#tenant'),()=>window.viewer.activate(),()=>{});});
  const original=await page.locator('#source figcaption').innerHTML();
  await page.locator('.media-inspection-control').click();
  const expanded=page.locator('#tenant figcaption');
  const text=(await expanded.innerText()).normalize('NFKC').replace(/\s+/g,'');
  assert.equal(text,'Transform2x+1yields7;estimate8.2.Readcontext.');
  assert.equal(await expanded.locator('math').count(),3);
  assert.equal(await expanded.locator('annotation').count(),3,'retained TeX stays MathML metadata');
  assert.equal(await expanded.locator('em').innerText(),'Transform');
  assert.equal(await expanded.locator('a').getAttribute('href'),'https://publication.test/context');
  assert.equal(await expanded.locator('a').getAttribute('data-gazette-destination-content'),'content:context');
  assert.equal(await expanded.locator('[id],button').count(),0,'a second caption creates no duplicate identities or controls');
  await page.evaluate(()=>window.viewer.deactivate());
  assert.equal(await expanded.innerText(),'');
  assert.equal(await page.locator('#source figcaption').innerHTML(),original);
  assert.equal(await page.locator('#source img').count(),1);
  await page.locator('#source figcaption').evaluate(element=>{element.textContent='A plain supplied caption.';});
  await page.locator('.media-inspection-control').click();
  assert.equal(await expanded.innerText(),'A plain supplied caption.');
  await page.evaluate(()=>window.viewer.deactivate());
  await page.locator('#source figcaption').evaluate(element=>element.remove());
  await page.locator('.media-inspection-control').click();
  assert.equal(await expanded.innerText(),'Plain fallback title');
  await page.evaluate(()=>window.viewer.deactivate());
 }finally{await browser.close();}
});


test('responsive inline images expand the full active-mode image and retain mode-correct candidates',()=>{
 const url='https://publication.test/images/light.webp';
 const dark='https://publication.test/images/dark.webp';
 const small='https://publication.test/images/light-320.webp';
 const darkSmall='https://publication.test/images/dark-320.webp';
 const responsive={sizes:'(max-width: 600px) 100vw, 600px',default:[{url:small,width:320},{url,width:1200}],dark:[{url:darkSmall,width:320},{url:dark,width:1200}]};
 const f=fixture({url,variants:{light:url,dark},responsive,intrinsic:{width:1200,height:800},rendered:320,mode:'light'});
 f.original.currentSrc=small;f.original.naturalWidth=320;f.original.fire('load');
 const button=f.buttons()[0];assert.ok(button);assert.equal(button.hidden,false);
 assert.equal(f.original.getAttribute('srcset'),`${small} 320w, ${url} 1200w`);
 assert.equal(f.original.getAttribute('sizes'),responsive.sizes);
 button.fire('click');assert.equal(f.image.src,url,'expansion uses full fallback, not the downloaded thumbnail');
 f.setMode('dark');assert.equal(f.image.src,dark);assert.equal(f.original.src,dark);
 assert.equal(f.original.getAttribute('srcset'),`${darkSmall} 320w, ${dark} 1200w`);
 f.original.fire('load');assert.equal(button.hidden,true,'a stale light candidate cannot open as dark');
 f.original.currentSrc=darkSmall;f.original.fire('load');assert.equal(button.hidden,false);
 f.window.fire('beforeprint');assert.equal(f.original.src,url);assert.equal(f.image.src,url);
 assert.equal(f.original.getAttribute('srcset'),`${small} 320w, ${url} 1200w`);
 f.window.fire('afterprint');assert.equal(f.original.src,dark);
 f.original.currentSrc='https://outside.test/unlisted.webp';f.original.fire('load');assert.equal(button.hidden,true);
});
