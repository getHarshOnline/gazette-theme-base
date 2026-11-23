import test from 'node:test';
import assert from 'node:assert/strict';
import { arcPlacement, arcFocusAngle, uprightPlacement, arcLowerEdge } from '../scripts/catalogue.js';

const geometry={spacing:26,edgeAngle:60,radius:620,lift:20,activeScale:1.34,neighbourScale:.76,opacity:.92,reach:4};
test('arc places the current item upright and neighbours tangent to opposite sides',()=>{
  const centre=arcPlacement(0,geometry),left=arcPlacement(-1,geometry),right=arcPlacement(1,geometry);
  assert.equal(centre.angle,0);assert.equal(centre.radius,640);assert.equal(centre.scale,1.34);
  assert.equal(left.angle,-right.angle);assert.equal(left.scale,right.scale);assert.equal(left.radius,right.radius);
  assert.ok(centre.z>left.z);assert.equal(arcPlacement(5,geometry).opacity,0);
});
test('drag geometry stays continuous between cards',()=>{
  const halfway=arcPlacement(.5,geometry);
  assert.ok(halfway.angle>0&&halfway.angle<geometry.spacing);assert.ok(halfway.scale>.76&&halfway.scale<1.34);
});

test('finite sets preserve balanced positions but transfer visual focus continuously',()=>{
  for(const position of [-1,-.5,0,.5,1]){
    const resting=uprightPlacement(1,position,geometry,300);
    const halfway=uprightPlacement(.5,position,geometry,300);
    const selected=uprightPlacement(0,position,geometry,300);
    for(const pose of [halfway,selected]){
      assert.equal(pose.angle,0);
      assert.equal(pose.x,position*300);
      assert.equal(pose.radius,resting.radius);
    }
    assert.ok(resting.scale<halfway.scale&&halfway.scale<selected.scale);
    assert.ok(resting.opacity<halfway.opacity&&halfway.opacity<selected.opacity);
    assert.ok(resting.z<halfway.z&&halfway.z<selected.z);
  }
});

test('upright small groups are evenly distributed for one, two and three cards',()=>{
  for(const count of [1,2,3]){
    const positions=Array.from({length:count},(_,i)=>uprightPlacement(i,i-(count-1)/2,geometry,300));
    assert.equal(positions.reduce((sum,p)=>sum+p.x,0),0);
    assert.ok(positions.every(p=>p.angle===0&&p.radius===geometry.radius));
    for(let i=1;i<count;i++)assert.equal(positions[i].x-positions[i-1].x,300);
  }
  const left=uprightPlacement(-.5,-.5,geometry,300),right=uprightPlacement(.5,.5,geometry,300);
  assert.equal(left.scale,right.scale);assert.equal(left.opacity,right.opacity);
});

test('nearest neighbour clears the enlarged focus while distant intervals compress',()=>{
  const width=310,height=420,gap=16;
  const bounds={...geometry,radius:794};
  const focusAngle=arcFocusAngle(bounds,width,height,gap),p={...bounds,focusAngle};
  const first=arcPlacement(1,p),second=arcPlacement(2,p),third=arcPlacement(3,p);
  const theta=first.angle*Math.PI/180;
  const clearance=bounds.radius*Math.sin(theta)-geometry.neighbourScale*(width*Math.cos(theta)+height*Math.sin(theta))/2-geometry.activeScale*width/2;
  assert.ok(clearance>=gap-1e-8);
  assert.ok(second.angle-first.angle<first.angle);
  assert.ok(third.angle-second.angle<second.angle-first.angle);
  for(const w of [320,390,720,940,1440]){
    const angle=arcFocusAngle({...geometry,radius:w*.62},w*.26,w*.35,gap);
    assert.ok(Number.isFinite(angle)&&angle>0&&angle<geometry.edgeAngle);
  }
});
test('scale and radial lift join continuously at focus and neighbouring rests',()=>{
  const epsilon=1e-5;
  for(const point of [-1,0,1]){
    const left=arcPlacement(point-epsilon,geometry),right=arcPlacement(point+epsilon,geometry);
    assert.ok(Math.abs(left.scale-right.scale)<epsilon);
    assert.ok(Math.abs(left.radius-right.radius)<epsilon);
  }
});

// Native disabled controls blur in a browser; the shared arrow state must move
// focus before that happens, including when the reverse arrow was disabled.
import { setCarouselArrows } from '../scripts/carousel-controls.js';
test('shared catalogue arrows preserve native bounds without losing or stealing focus', () => {
  const doc = { body: {}, activeElement: null };
  const button = () => ({
    ownerDocument: doc, value: false,
    get disabled() { return this.value; },
    set disabled(value) { this.value = value; if (value && doc.activeElement === this) doc.activeElement = doc.body; },
    focus(options) { if (!this.disabled) { doc.activeElement = this; this.options = options; } },
  });
  const previous = button(), next = button();
  setCarouselArrows(previous, next, true, false);
  next.focus();
  setCarouselArrows(previous, next, false, true);
  assert.equal(doc.activeElement, previous);
  assert.deepEqual(previous.options, { preventScroll: true });
  assert.equal(next.disabled, true);
  setCarouselArrows(previous, next, true, false);
  assert.equal(doc.activeElement, next);
  assert.equal(previous.disabled, true);
  setCarouselArrows(previous, next, false, false);
  assert.equal(doc.activeElement, next, 'looping leaves focus and both arrows available');
  const other = {}; doc.activeElement = other;
  setCarouselArrows(previous, next, false, true);
  assert.equal(doc.activeElement, other, 'card, choice and outside focus remain untouched');
});
