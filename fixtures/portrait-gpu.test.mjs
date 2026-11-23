import test from 'node:test';
import assert from 'node:assert/strict';
import { registeredVertices } from '../scripts/portrait-gpu.js';
import { poseWeights } from '../scripts/portrait-poses.js';

const square={points:{front:[[0,0],[4,0],[4,4],[0,4]]},triangles:[[0,1,2],[0,2,3]]};

test('registered GPU positions flip clip-space Y while source UVs retain image-top origin',()=>{
  const vertices=registeredVertices(square,poseWeights(0,0),4,4);
  assert.deepEqual([...vertices.slice(0,8)],[-1,1,0,0,0,0,0,0]);
  assert.deepEqual([...vertices.slice(16,24)],[1,-1,1,1,1,1,1,1]);
});

test('a shared intermediate mesh retains independent source coordinates for aligned texture blending',()=>{
  const poses=structuredClone(square);
  poses.points.right=poses.points.front.map(([x,y])=>[x+1,y]);
  const out=new Float32Array(48);
  const vertices=registeredVertices(poses,poseWeights(.5,0),4,4,out);
  assert.equal(vertices,out,'the caller reuses one packed vertex buffer');
  assert.deepEqual([...vertices.slice(0,8)],[-.75,1,0,0,.25,0,0,0]);
  assert.deepEqual([...vertices.slice(8,16)],[1.25,1,1,0,1.25,0,1,0]);
});

test('GPU mesh packing declines an interpolated fold rather than drawing inverted geometry',()=>{
  const poses=structuredClone(square);
  poses.points.right=poses.points.front.map(([x,y])=>[4-x,4-y]);
  assert.equal(registeredVertices(poses,poseWeights(.5,0),4,4),null);
});


test('fixed registration keeps destination vertices stable while source UVs follow the authored pose',()=>{
  const poses=structuredClone(square);
  poses.points.right=poses.points.front.map(([x,y])=>[x+1,y]);
  poses.target=poses.points.front;
  const vertices=registeredVertices(poses,poseWeights(.5,0),4,4);
  assert.deepEqual([...vertices.slice(0,8)],[-1,1,0,0,.25,0,0,0]);
  assert.deepEqual([...vertices.slice(8,16)],[1,1,1,0,1.25,0,1,0]);
});

test('optical registration keeps donor pupils coincident throughout diagonal blends without shear',async()=>{
  const {opticalPoses}=await import('../scripts/portrait-poses.js');
  const names=['front','left','right','up','down'];
  const landmarks=Object.fromEntries(names.map(name=>[name,[[.3,.3],[.7,.3]]]));
  const pupils={front:[[.3,.3],[.7,.3]],left:[[.24,.31],[.64,.31]],right:[[.34,.32],[.74,.32]],up:[[.3,.24],[.7,.24]],down:[[.3,.35],[.7,.35]]};
  for(const eye of [0,1]){
    const mesh=opticalPoses(landmarks,pupils,100,100,eye);
    for(const [x,y] of [[0,0],[.5,0],[-.45,.35],[.4,-.6],[1,1]]){
      const weights=poseWeights(x,y),vertices=registeredVertices(mesh,weights,100,100);
      assert.ok(vertices);
      const target=weights.reduce((p,w)=>p.map((v,i)=>v+pupils[w.pose][eye][i]*100*w.weight),[0,0]);
      for(const w of weights){
        const sourceOrigin=mesh.points[w.pose][0],targetOrigin=weights.reduce((p,k)=>p.map((v,i)=>v+mesh.targets[k.pose][0][i]*k.weight),[0,0]);
        const mapped=pupils[w.pose][eye].map((v,i)=>v*100-sourceOrigin[i]+targetOrigin[i]);
        mapped.forEach((v,i)=>assert.ok(Math.abs(v-target[i])<1e-9,'each donor has one identical interpolated pupil position'));
      }
      for(const points of Object.values(mesh.targets)){
        assert.equal(points[1][0]-points[0][0],100);assert.equal(points[1][1]-points[0][1],0);
        assert.equal(points[3][0]-points[0][0],0);assert.equal(points[3][1]-points[0][1],100);
      }
    }
  }
});
