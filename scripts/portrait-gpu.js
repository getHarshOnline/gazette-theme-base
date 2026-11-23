import { canvasSize } from './canvas-size.js';
import { poseWeights } from './portrait-poses.js';

const vertex = `
attribute vec2 aPosition;
attribute vec2 aUv0;
attribute vec2 aUv1;
attribute vec2 aUv2;
varying vec2 vUv0;
varying vec2 vUv1;
varying vec2 vUv2;
void main(){
  gl_Position=vec4(aPosition,0.,1.);
  vUv0=aUv0;vUv1=aUv1;vUv2=aUv2;
}`;
const registered = `
precision highp float;
uniform sampler2D uSource0;
uniform sampler2D uSource1;
uniform sampler2D uSource2;
uniform vec2 uSourceSize;
uniform vec3 uWeights;
uniform float uDither;
varying vec2 vUv0;
varying vec2 vUv1;
varying vec2 vUv2;
vec4 premultiply(vec4 c){return vec4(c.rgb*c.a,c.a);}
vec4 sampleSource(sampler2D source,vec2 uv){
  vec2 p=clamp(uv*uSourceSize-.5,vec2(0.),uSourceSize-1.);
  vec2 a=floor(p),b=min(a+1.,uSourceSize-1.),f=fract(p);
  vec4 top=mix(premultiply(texture2D(source,(a+.5)/uSourceSize)),premultiply(texture2D(source,(vec2(b.x,a.y)+.5)/uSourceSize)),f.x);
  vec4 bottom=mix(premultiply(texture2D(source,(vec2(a.x,b.y)+.5)/uSourceSize)),premultiply(texture2D(source,(b+.5)/uSourceSize)),f.x);
  return mix(top,bottom,f.y);
}
void main(){
  vec4 a=sampleSource(uSource0,vUv0),b=sampleSource(uSource1,vUv1),c=sampleSource(uSource2,vUv2);
  vec4 blended=a*uWeights.x+b*uWeights.y+c*uWeights.z;
  if(uDither>.5){
    // A stationary coverage dissolve selects whole premultiplied samples,
    // including transparent ones, instead of stacking translucent silhouettes.
    float threshold=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))));
    gl_FragColor=threshold<uWeights.x?a:(threshold<uWeights.x+uWeights.y?b:c);
  }else gl_FragColor=blended;
}`;
const glyphVertex = `
attribute vec2 aPosition;
varying vec2 vUv;
void main(){gl_Position=vec4(aPosition,0.,1.);vUv=aPosition*.5+.5;}`;
const glyphFragment = `
precision highp float;
uniform sampler2D uSamples;
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform vec2 uNatural;
uniform vec4 uFrame;
uniform vec4 uInk;
uniform vec3 uMaterial;
uniform float uDark;
uniform float uPhase;
uniform float uColorSource;
varying vec2 vUv;
void main(){
  if(uColorSource>.5){gl_FragColor=texture2D(uSamples,vUv);return;}
  vec2 p=vec2(vUv.x,1.-vUv.y)*uGrid,cell=min(floor(p),uGrid-1.);
  vec2 centre=(cell+.5)/uGrid;
  vec4 sampled=texture2D(uSamples,vec2(centre.x,1.-centre.y));
  if(sampled.a<.08){gl_FragColor=vec4(0.);return;}
  vec3 color=sampled.rgb/sampled.a;
  float luminance=dot(color,vec3(.2126,.7152,.0722));
  float density=mix(1.-luminance,luminance,uDark);
  vec2 uv=(centre*uNatural-uFrame.xy)/uFrame.zw;
  float fade=1.;
  if(uMaterial.z>0.)fade=clamp(min(uv.x,1.-uv.x)/uMaterial.z,0.,1.)*clamp((1.-uv.y)/uMaterial.z,0.,1.);
  float localPhase=mod(floor((uPhase+mod(cell.x*17.+cell.y*31.,4.))/4.),4.);
  float variation=mod(cell.x*17.+cell.y*31.+localPhase*(mod(cell.x,3.)+1.),5.)-2.;
  float level=clamp(floor(density*8.)+variation,0.,7.);
  vec2 local=(fract(p)+.5)/2.;
  float glyph=level<.5?0.:texture2D(uAtlas,vec2((level+local.x)/8.,local.y)).a;
  float fill=sampled.a*fade*uMaterial.x*density;
  float ink=sampled.a*fade*uMaterial.y*density*glyph;
  float alpha=(ink+fill*(1.-ink))*uInk.a;
  gl_FragColor=vec4(uInk.rgb*alpha,alpha);
}`;

const area = (a, b, c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const epsilon = 1e-8;

// Clip-space target positions and three independent source UVs. Interpolating
// geometry must never average source UVs before their textures are sampled.
export function registeredVertices(poses,weights,width,height,out=new Float32Array(poses.triangles.length*24)) {
  const points=poses.points;
  const target=poses.target??points.front.map((_,i)=>weights.reduce((p,w)=>[
    p[0]+(poses.targets?.[w.pose]??points[w.pose])[i][0]*w.weight,p[1]+(poses.targets?.[w.pose]??points[w.pose])[i][1]*w.weight,
  ],[0,0]));
  if(poses.triangles.some(t=>area(...t.map(i=>target[i]))*Math.sign(area(...t.map(i=>points.front[i])))<=epsilon))return null;
  let cursor=0;
  for(const triangle of poses.triangles)for(const i of triangle){
    out[cursor++]=target[i][0]/width*2-1;out[cursor++]=1-target[i][1]/height*2;
    for(let j=0;j<3;j++){
      const source=points[(weights[j]??weights[0]).pose][i];
      out[cursor++]=source[0]/width;out[cursor++]=source[1]/height;
    }
  }
  return out;
}

// A GPU surface for the existing 2D compositor. The first pass registers sources
// at the glyph sampling resolution; the second draws atlas glyphs at full DPR.
// Sources are immutable pixel buffers or ImageBitmaps; bitmap conversion and
// texture upload happen once per source, outside the per-pixel animation work.
export function createPortraitGPU(model) {
  const poses=model.poses??model,points=poses?.points,triangles=poses?.triangles;
  if(!points?.front?.length||!triangles?.length)return null;
  const count=points.front.length;
  if(poses.targets && Object.keys(points).some(name=>!Array.isArray(poses.targets[name])||poses.targets[name].length!==count||poses.targets[name].some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))))return null;
  if(poses.target!=null&&(!Array.isArray(poses.target)||poses.target.length!==count||poses.target.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))))return null;
  if(Object.values(points).some(p=>!Array.isArray(p)||p.length!==count||p.some(v=>!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite))))return null;
  if(triangles.some(t=>!Array.isArray(t)||t.length!==3||t.some(i=>!Number.isInteger(i)||i<0||i>=count)||
    Math.abs(area(...t.map(i=>points.front[i])))<=epsilon||Object.values(points).some(p=>area(...t.map(i=>p[i]))*Math.sign(area(...t.map(i=>points.front[i])))<=epsilon)))return null;
  const canvas=document.createElement('canvas');
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false});
  if(!gl)return null;
  const maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const shaders=[],programs=[],buffers=[],textures=new Map();
  let sampleTexture,atlasTexture,framebuffer,meshBuffer,quadBuffer,meshProgram,glyphProgram;
  let disposed=false,lost=false,failed=false,gridKey='',meshKey='',atlasKey='',colorKey='',ink=[0,0,0,1];
  let serial=0,uniforms,lastGeometry=null;
  const vertices=new Float32Array(triangles.length*3*8);
  let staging=null,stagingContext=null;
  const atlas=document.createElement('canvas'),atlasContext=atlas.getContext('2d');
  const swatch=document.createElement('canvas'),swatchContext=swatch.getContext('2d',{willReadFrequently:true});
  swatch.width=swatch.height=1;
  if(!atlasContext||!swatchContext)return null;
  const compile=(type,text)=>{
    const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,text);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Portrait shader unavailable');return shader;
  };
  const program=(v,f,names)=>{
    const p=gl.createProgram();programs.push(p);gl.attachShader(p,compile(gl.VERTEX_SHADER,v));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,f));
    names.forEach((name,index)=>gl.bindAttribLocation(p,index,name));gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('Portrait program unavailable');return p;
  };
  const texture=()=>{
    const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;
  };
  const bindTexture=(unit,t)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);};
  const reset=()=>{
    for(const entry of textures.values())gl.deleteTexture(entry.texture);
    textures.clear();meshKey='';atlasKey='';colorKey='';failed=false;
  };
  const onLost=event=>{event.preventDefault();lost=true;};
  const destroy=()=>{
    if(disposed)return;disposed=true;reset();canvas.removeEventListener('webglcontextlost',onLost);
    shaders.forEach(s=>gl.deleteShader(s));programs.forEach(p=>gl.deleteProgram(p));buffers.forEach(b=>gl.deleteBuffer(b));
    if(sampleTexture)gl.deleteTexture(sampleTexture);if(atlasTexture)gl.deleteTexture(atlasTexture);if(framebuffer)gl.deleteFramebuffer(framebuffer);
  };
  try {
    meshProgram=program(vertex,registered,['aPosition','aUv0','aUv1','aUv2']);
    glyphProgram=program(glyphVertex,glyphFragment,['aPosition']);
    meshBuffer=gl.createBuffer();quadBuffer=gl.createBuffer();buffers.push(meshBuffer,quadBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER,quadBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    sampleTexture=texture();atlasTexture=texture();framebuffer=gl.createFramebuffer();
    // The colour path does not need glyphs, but every active sampler must still
    // have a complete texture under WebGL's draw validation rules.
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
    uniforms=Object.fromEntries(['uSource0','uSource1','uSource2','uSourceSize','uWeights','uDither'].map(name=>[name,gl.getUniformLocation(meshProgram,name)]));
    for(const name of ['uSamples','uAtlas','uGrid','uNatural','uFrame','uInk','uMaterial','uDark','uPhase','uColorSource'])uniforms[name]=gl.getUniformLocation(glyphProgram,name);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    canvas.addEventListener('webglcontextlost',onLost);
  } catch {destroy();return null;}
  function sourceTexture(pose,source) {
    if(!source||!Number.isInteger(source.width)||!Number.isInteger(source.height)||source.width<1||source.height<1||
      source.width>maxTextureSize||source.height>maxTextureSize||source.data&&source.data.length!==source.width*source.height*4)return null;
    let entry=textures.get(pose);
    if(entry?.source===source)return entry;
    if(entry)gl.deleteTexture(entry.texture);
    let data=source.data;
    if(!data){
      staging??=document.createElement('canvas');stagingContext??=staging.getContext('2d',{willReadFrequently:true});
      if(!stagingContext)return null;
      staging.width=source.width;staging.height=source.height;
      stagingContext.drawImage(source,0,0);data=stagingContext.getImageData(0,0,source.width,source.height).data;
    }
    const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
    const t=texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,source.width,source.height,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    entry={source,texture:t,id:++serial};textures.set(pose,entry);return entry;
  }
  function draw(context,sources,rect,material,x=0,y=0,phase=0,geometry=poses) {
    if(disposed||lost||failed||!sources.front)return false;
    if(![rect.width,rect.height,material.cell,material.ratio].every(v=>Number.isFinite(v)&&v>0))return false;
    const weights=poseWeights(x,y),front=sources.front;
    if(weights.some(w=>!points[w.pose]||!sources[w.pose]||sources[w.pose].width!==front.width||sources[w.pose].height!==front.height))return false;
    const selected=weights.map(w=>({...w,entry:sourceTexture(w.pose,sources[w.pose])}));
    if(selected.some(s=>!s.entry))return false;
    const fallback=sourceTexture('front',front);if(!fallback)return false;
    const {width,height}=canvasSize(rect.width,rect.height,material.ratio,Math.ceil);
    const colorSource=material.sourceColor===true;
    const gw=colorSource?width:Math.ceil(rect.width/material.cell),gh=colorSource?height:Math.ceil(rect.height/material.cell);
    if(Math.max(width,height,front.width,front.height,gw,gh)>maxTextureSize)return false;
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    const nextGrid=`${gw}:${gh}`;
    if(nextGrid!==gridKey){
      bindTexture(0,sampleTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gw,gh,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,sampleTexture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)return false;
      gridKey=nextGrid;meshKey='';
    }
    const nextMesh=JSON.stringify([x,y,gw,gh,colorSource,selected.map(s=>s.entry.id),fallback.id]);
    if(nextMesh!==meshKey||geometry!==lastGeometry){
      if(geometry.triangles?.length!==triangles.length||weights.some(w=>geometry.points?.[w.pose]?.length!==count||geometry.targets&&geometry.targets[w.pose]?.length!==count)||!registeredVertices(geometry,weights,front.width,front.height,vertices))return false;
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(0,0,gw,gh);gl.disable(gl.BLEND);gl.useProgram(meshProgram);
      gl.uniform2f(uniforms.uSourceSize,front.width,front.height);
      gl.uniform1f(uniforms.uDither,colorSource?1:0);
      for(let i=0;i<3;i++)gl.uniform1i(uniforms[`uSource${i}`],i);
      // Outside supplied triangles retain front, matching the pure CPU sampler.
      const corners=[[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]],base=new Float32Array(48);
      corners.forEach(([u,v],i)=>base.set([u*2-1,1-v*2,u,v,u,v,u,v],i*8));
      gl.bindBuffer(gl.ARRAY_BUFFER,meshBuffer);gl.bufferData(gl.ARRAY_BUFFER,base,gl.DYNAMIC_DRAW);
      for(let i=0;i<4;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,2,gl.FLOAT,false,32,i*8);}
      for(let i=0;i<3;i++)bindTexture(i,fallback.texture);
      gl.uniform3f(uniforms.uWeights,1,0,0);gl.drawArrays(gl.TRIANGLES,0,6);
      gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);
      for(let i=0;i<3;i++)bindTexture(i,(selected[i]??selected[0]).entry.texture);
      gl.uniform3f(uniforms.uWeights,selected[0].weight,selected[1]?.weight??0,selected[2]?.weight??0);
      gl.drawArrays(gl.TRIANGLES,0,triangles.length*3);meshKey=nextMesh;lastGeometry=geometry;
    }
    if(!colorSource&&atlasKey!==material.font){
      atlas.width=128*8;atlas.height=128;atlasContext.clearRect(0,0,atlas.width,atlas.height);
      atlasContext.font=`64px ${material.font}`;atlasContext.textAlign='center';atlasContext.textBaseline='middle';atlasContext.fillStyle='#fff';
      const alphabet=' .:oS%#@';for(let i=1;i<8;i++)atlasContext.fillText(alphabet[i],(i+.5)*128,64);
      bindTexture(1,atlasTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);atlasKey=material.font;
    }
    if(!colorSource&&colorKey!==material.color){
      swatchContext.clearRect(0,0,1,1);swatchContext.fillStyle=material.color;swatchContext.fillRect(0,0,1,1);
      ink=Array.from(swatchContext.getImageData(0,0,1,1).data,v=>v/255);colorKey=material.color;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height);gl.disable(gl.BLEND);gl.useProgram(glyphProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER,quadBuffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    for(let i=1;i<4;i++)gl.disableVertexAttribArray(i);
    bindTexture(0,sampleTexture);bindTexture(1,atlasTexture);gl.uniform1i(uniforms.uSamples,0);gl.uniform1i(uniforms.uAtlas,1);
    gl.uniform1f(uniforms.uColorSource,colorSource?1:0);
    gl.uniform2f(uniforms.uGrid,gw,gh);gl.uniform2f(uniforms.uNatural,front.width,front.height);
    const frame=material.frame??{x:0,y:0,imageWidth:front.width,imageHeight:front.height};
    gl.uniform4f(uniforms.uFrame,frame.x,frame.y,frame.imageWidth,frame.imageHeight);gl.uniform4fv(uniforms.uInk,ink);
    gl.uniform3f(uniforms.uMaterial,material.fill,material.ink,material.bottomFade);gl.uniform1f(uniforms.uDark,material.dark?1:0);
    gl.uniform1f(uniforms.uPhase,Number.isFinite(phase)?((Math.floor(phase*4)%16)+16)%16:0);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    context.save();context.drawImage(canvas,rect.x,rect.y,rect.width,rect.height);context.restore();return true;
  }
  return {
    draw(...args){try{return draw(...args);}catch{failed=true;return false;}},
    prepare(sources){
      if(disposed||lost||failed)return false;
      try {for(const [pose,source] of Object.entries(sources))if(points[pose]&&!sourceTexture(pose,source))return false;return true;}
      catch{failed=true;return false;}
    },
    reset,destroy,
  };
}
