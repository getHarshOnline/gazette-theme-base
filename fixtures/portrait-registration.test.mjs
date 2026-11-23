import {test} from 'node:test';
import assert from 'node:assert/strict';
import { registeredFigure, createPortraitReveal } from '../scripts/portrait-reveal.js';
import { featheredCoverage, revealBoundary } from '../scripts/surface-reveal.js';
import { gazeLayout } from '../scripts/continuous-gaze.js';
import { rippleEnergy } from '../scripts/surface-ripples.js';
test('front and back anchors remain coincident at wide, tablet and narrow sizes',()=>{
 const model={width:1153,height:1364,geometry:{fit:'contain'}};
 const reg={portraitAnchor:{x:.5,y:.27,span:.55},characterAnchor:{x:.585,y:.1,span:.235}};
 for(const [width,height] of [[1440,900],[940,600],[390,390],[240,240]]){
  const layout=gazeLayout(width,height,model);
  const rect={x:layout.x,y:layout.y,width:model.width*layout.scale,height:model.height*layout.scale};
  assert.ok(rect.x>=-.001&&rect.y>=-.001);assert.ok(rect.x+rect.width<=width+.001);assert.ok(rect.y+rect.height<=height+.001);
  const figure=registeredFigure(rect,{width:1024,height:1536},reg);
  assert.ok(Math.abs(figure.x+figure.width*reg.characterAnchor.x-(rect.x+rect.width*reg.portraitAnchor.x))<.001);
  assert.ok(Math.abs(figure.y+figure.height*reg.characterAnchor.y-(rect.y+rect.height*reg.portraitAnchor.y))<.001);
 }
});
test('shared pond wave is bounded and expires rather than leaving a permanent reveal',()=>{
 const waves=[{x:0,y:0,born:0,life:2,speed:.2,strength:1}];
 assert.equal(rippleEnergy(waves,.2,0,1),.5);
 assert.equal(rippleEnergy(waves,.8,0,1),0);
 assert.equal(rippleEnergy(waves,.4,0,2),0);
});


function revealFixture() {
 const canvases=[];
 class Context {
  constructor(){this.globalCompositeOperation='source-over';this.globalAlpha=1;this.draws=[];this.fills=[];this.clears=0;this.matrix=[1,0,0,1,0,0];this.saved=[];}
  save(){this.saved.push({op:this.globalCompositeOperation,alpha:this.globalAlpha,matrix:[...this.matrix],fill:this.fillStyle,alpha:this.globalAlpha});}
  restore(){const s=this.saved.pop();this.globalCompositeOperation=s.op;this.globalAlpha=s.alpha;this.matrix=s.matrix;this.fillStyle=s.fill;}
  setTransform(...matrix){this.matrix=matrix;}
  clearRect(){this.clears++;this.fills=[];}
  fillText(){}
  fillRect(x,y,width,height){this.fills.push({x,y,width,height,fill:this.fillStyle,alpha:this.globalAlpha});}
  drawImage(image,...rect){this.draws.push({image,rect,op:this.globalCompositeOperation,alpha:this.globalAlpha,matrix:[...this.matrix]});}
 }
 const prior=globalThis.document;
 globalThis.document={createElement(tag){assert.equal(tag,'canvas');const context=new Context();const canvas={width:0,height:0,context,getContext(){return context;}};canvases.push(canvas);return canvas;}};
 const values={'--layout-portrait-reveal-radius':100,'--motion-portrait-reveal-life':2000,'--material-portrait-reveal-feather':.4,'--layout-portrait-cell':3,'--material-portrait-reveal-deformation':.12,'--motion-portrait-reveal-cycle':5400};
 const model={reveal:{portraitAnchor:{x:.5,y:.27,span:.55},characterAnchor:{x:.585,y:.1,span:.235}}};
 const reveal=createPortraitReveal(model,{getPropertyValue(name){return String(values[name]);}});
 return{reveal,model,canvases,context:()=>new Context(),restore(){globalThis.document=prior;}};
}
function maskAlpha(canvas,x,y){
 return canvas.context.fills.find(rect=>x>=rect.x&&x<rect.x+rect.width&&y>=rect.y&&y<rect.y+rect.height)?.alpha ?? 0;
}

test('underlay and foreground use one scene mask with registered CSS-pixel coordinates at every viewport',()=>{
 for(const [width,height,ratio] of [[1440,900,1],[940,600,2],[390,700,3]]){
  const f=revealFixture();
  try{
   const bounds={width,height};
   const rect={x:20,y:30,width:width/2,height:height*.8};
   const registered={...rect,x:rect.x+32,y:rect.y+70};
   const point={x:registered.x+registered.width/2,y:registered.y+registered.height/3};
   const under=f.context(),front=f.context();front.setTransform(ratio,0,0,ratio,0,0);
   front.globalAlpha=.6;front.globalCompositeOperation='source-atop';
   f.reveal.point(point.x,point.y,1000);
   f.reveal.draw(under,{world:{width:2048,height:1365},character:{width:1024,height:1536}},registered,bounds,1000,'#fff');
   assert.equal(f.reveal.applyPortraitMask(front,rect,bounds,1000,registered),true);
   const maskUse=f.canvases[0].context.draws.find(draw=>draw.op==='destination-in');
   const erased=front.draws.at(-1);
   assert.equal(erased.image,maskUse.image,'both layers use the identical aperture canvas');
   assert.equal(erased.op,'destination-out');assert.equal(erased.alpha,1);
   assert.deepEqual(erased.rect,[-32,-70,Math.ceil(width),Math.ceil(height)]);
   assert.deepEqual(erased.matrix,[ratio,0,0,ratio,0,0],'caller pixel-ratio transform remains in force');
   assert.equal(front.globalAlpha,.6);assert.equal(front.globalCompositeOperation,'source-atop');
   assert.deepEqual(front.matrix,[ratio,0,0,ratio,0,0]);
   assert.equal(maskAlpha(erased.image,(point.x-32)-erased.rect[0],(point.y-70)-erased.rect[1]),1,'active local foreground is erased at the same scene point');
   assert.equal(maskAlpha(erased.image,-1000,-1000),0,'foreground outside the aperture is untouched');
   assert.equal(erased.image.context.clears,1,'the mask is built once for both layers in the same frame');
  }finally{f.restore();}
 }
});

test('foreground masking expires and reset invalidates the shared mask even within the same timestamp',()=>{
 const f=revealFixture();
 try{
  const rect={x:0,y:0,width:300,height:300},bounds={width:400,height:400},front=f.context();
  assert.equal(f.reveal.applyPortraitMask(front,rect,bounds,0),false);
  f.reveal.point(150,150,1000);
  assert.equal(f.reveal.applyPortraitMask(front,rect,bounds,1000),true);
  const mask=front.draws.at(-1).image;assert.equal(mask.context.clears,1);
  f.reveal.pulse(150,150,1200);
  f.reveal.leave();assert.equal(f.reveal.applyPortraitMask(front,rect,bounds,2000),false,'leaving also removes click waves');
  const count=front.draws.length;
  assert.equal(f.reveal.applyPortraitMask(front,rect,bounds,3000),false);assert.equal(front.draws.length,count);
  f.reveal.point(80,80,4000);assert.equal(f.reveal.applyPortraitMask(front,rect,bounds,4000),true);
  f.reveal.reset();assert.equal(f.reveal.applyPortraitMask(front,rect,bounds,4000),false,'reset cannot reuse an earlier active frame');
 }finally{f.restore();}
});

test('invalid reveal metrics decline enhancement and mask application leaves invalid geometry untouched',()=>{
 const f=revealFixture();
 try{
  const bad=createPortraitReveal(f.model,{getPropertyValue(name){return name==='--layout-portrait-cell'?'0':'1';}});
  assert.equal(bad,null,'a zero sampling step must never enter an endless drawing loop');
  f.reveal.point(80,80,1000);const front=f.context();
  assert.equal(f.reveal.applyPortraitMask(front,{x:0,y:0,width:0,height:20},{width:100,height:100},1000),false);
  assert.equal(front.draws.length,0);
 }finally{f.restore();}
});

test('pointer reversal leaves no aperture at previous positions and the feather uses fine partial coverage',()=>{
 const f=revealFixture();try{
  const front=f.context(),rect={x:0,y:0,width:900,height:600},bounds={width:900,height:600};
  for(const x of [100,200,300,400,500,400]) f.reveal.point(x,300);
  f.reveal.applyPortraitMask(front,rect,bounds,1000);
  const mask=front.draws.at(-1).image, fills=mask.context.fills;
  assert.equal(maskAlpha(mask,100,300),0,'old pointer positions cannot accumulate into a tail');
  assert.equal(maskAlpha(mask,400,300),1,'centre remains continuously revealed');
  assert.equal(maskAlpha(mask,520,300),0,'outside the live aperture is untouched');
  assert.ok(fills.some(r=>r.alpha>0&&r.alpha<1),'the edge stays soft instead of binary');
  assert.ok(fills.every(r=>r.width===3&&r.height===3&&r.x%3===0&&r.y%3===0));
 }finally{f.restore();}
});

test('edge modulation cannot change the solid interior or open detached pixels',()=>{
 for(const threshold of [.03,.3,.7,.97]) for(const energy of [0,.5,1]){
  assert.equal(featheredCoverage(0,threshold,energy),0);
  assert.equal(featheredCoverage(1,threshold,energy),1);
  assert.ok(featheredCoverage(.5,threshold,energy)>0&&featheredCoverage(.5,threshold,energy)<1);
 }
});

test('the reveal boundary changes smoothly around the pointer and closes its time and angular seams',()=>{
 for(const phase of [0,.3,2,5]) for(const angle of [0,.4,2,4,6]){
  const edge=revealBoundary(angle,phase,.12);
  assert.ok(edge>=.88&&edge<=1.12);
  assert.ok(Math.abs(edge-revealBoundary(angle+2*Math.PI,phase,.12))<1e-12);
  assert.ok(Math.abs(edge-revealBoundary(angle,phase+2*Math.PI,.12))<1e-12);
  assert.ok(Math.abs(edge-revealBoundary(angle,phase+.001,.12))<.001);
 }
 assert.notEqual(revealBoundary(0,1,.12),revealBoundary(Math.PI/2,1,.12));
 assert.equal(revealBoundary(0,1,0),1,'zero deformation is a stable circle');
});

test('a stationary reveal evolves; clicking expands it and settles back without a second aperture',()=>{
 const f=revealFixture();try{
  const front=f.context(),rect={x:0,y:0,width:600,height:600},bounds={width:600,height:600};
  const snapshot=now=>{
   f.reveal.applyPortraitMask(front,rect,bounds,now);
   return structuredClone(front.draws.at(-1).image.context.fills);
  };
  f.reveal.point(300,300);
  const initial=snapshot(0), evolved=snapshot(1000);
  assert.notDeepEqual(initial,evolved,'time changes the edge even without pointer motion');
  f.reveal.pulse(300,300,0);
  const expanded=snapshot(1000);
  const coverage=fills=>fills.reduce((sum,cell)=>sum+cell.alpha,0);
  assert.ok(coverage(expanded)>coverage(evolved)*1.3,'click produces an observable expansion');
  const expired=snapshot(2000);
  f.reveal.reset();f.reveal.point(300,300);
  assert.deepEqual(expired,snapshot(2000),'the click leaves no permanent change');
  f.reveal.pulse(100,100,2100);f.reveal.point(450,450);
  snapshot(2200);
  assert.equal(maskAlpha(front.draws.at(-1).image,100,100),0,'moving away cannot leave a wave aperture behind');
 }finally{f.restore();}
});

test('copy overlap follows the live aperture and restores on leave or reset',()=>{
 const f=revealFixture();try{
  const text={x:100,y:100,width:100,height:100};
  assert.equal(f.reveal.obscures(text),0);
  f.reveal.point(150,150);assert.equal(f.reveal.obscures(text),1);
  f.reveal.point(280,150);assert.ok(f.reveal.obscures(text)>0&&f.reveal.obscures(text)<1);
  f.reveal.point(400,150);assert.equal(f.reveal.obscures(text),0);
  f.reveal.pulse(150,150,1000);f.reveal.leave();assert.equal(f.reveal.obscures(text),0);
  f.reveal.point(150,150);f.reveal.reset();assert.equal(f.reveal.obscures(text),0);
 }finally{f.restore();}
});
