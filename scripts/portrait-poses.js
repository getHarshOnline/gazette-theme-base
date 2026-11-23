// Source landmarks own registration. Blend samples only after every contributing
// pose has been mapped into the same destination triangles.
export function poseWeights(x = 0, y = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [{ pose: 'front', weight: 1 }];
  const distance = Math.abs(x) + Math.abs(y);
  if (!Number.isFinite(distance)) return [{ pose: 'front', weight: 1 }];
  const divisor = Math.max(1, distance);
  const weights = [];
  if (distance < 1) weights.push({ pose: 'front', weight: 1 - distance });
  if (x) weights.push({ pose: x < 0 ? 'left' : 'right', weight: Math.abs(x) / divisor });
  if (y) weights.push({ pose: y < 0 ? 'up' : 'down', weight: Math.abs(y) / divisor });
  return weights;
}

// A rigid plane registered by two source landmarks. Unlike a facial mesh this
// can only translate, rotate and scale uniformly: circular features stay round.
// Landmarks are normalized so differently sized authored sources share a frame.
export function similarityPoses(landmarks, width, height) {
  const names = ['front', 'left', 'right', 'up', 'down'];
  if (![width,height].every(v=>Number.isFinite(v)&&v>0) || names.some(name=>
    !Array.isArray(landmarks?.[name]) || landmarks[name].length!==2 ||
    landmarks[name].some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1)))) return null;
  const pairs=Object.fromEntries(names.map(name=>[name,landmarks[name].map(([x,y])=>[x*width,y*height])]));
  if(Object.values(pairs).some(([a,b])=>Math.hypot(b[0]-a[0],b[1]-a[1])<1))return null;
  const [a,b]=pairs.front,dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  const corners=[[0,0],[width,0],[width,height],[0,height]];
  const points=Object.fromEntries(names.map(name=>{
    const [p,q]=pairs[name],ex=q[0]-p[0],ey=q[1]-p[1];
    const c=(ex*dx+ey*dy)/length,s=(ey*dx-ex*dy)/length;
    return [name,corners.map(([x,y])=>[p[0]+c*(x-a[0])-s*(y-a[1]),p[1]+s*(x-a[0])+c*(y-a[1])])];
  }));
  return {points,target:corners,triangles:[[0,1,2],[0,2,3]]};
}

// Register one optical plane on its pupil as well as the camera landmarks.
// Every destination is a translation of the same rectangle, so interpolation
// moves one pupil continuously without stretching the optics or doubling it.
export function opticalPoses(landmarks, pupils, width, height, eye) {
  const base=similarityPoses(landmarks,width,height), tracked=similarityPoses(pupils,width,height);
  if(!base||!tracked||![0,1].includes(eye))return null;
  const [a,b]=landmarks.front.map(([x,y])=>[x*width,y*height]);
  const anchor=pupils.front[eye].map((v,i)=>v*[width,height][i]);
  const points={},targets={};
  for(const name of Object.keys(base.points)){
    const [p,q]=landmarks[name].map(([x,y])=>[x*width,y*height]);
    const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
    const c=((q[0]-p[0])*dx+(q[1]-p[1])*dy)/length;
    const s=((q[1]-p[1])*dx-(q[0]-p[0])*dy)/length;
    const pupil=pupils[name][eye].map((v,i)=>v*[width,height][i]);
    const ux=pupil[0]-p[0],uy=pupil[1]-p[1],scale=c*c+s*s;
    const shift=[a[0]+(c*ux+s*uy)/scale-anchor[0],a[1]+(-s*ux+c*uy)/scale-anchor[1]];
    targets[name]=base.target.map(([x,y])=>[x+shift[0],y+shift[1]]);
    points[name]=targets[name].map(([x,y])=>[p[0]+c*(x-a[0])-s*(y-a[1]),p[1]+s*(x-a[0])+c*(y-a[1])]);
  }
  return {points,targets,triangles:base.triangles};
}

const area = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const epsilon = 1e-8;
const validBuffer = buffer => buffer && Number.isInteger(buffer.width) && buffer.width > 0 &&
  Number.isInteger(buffer.height) && buffer.height > 0 &&
  (buffer.data instanceof Uint8Array || buffer.data instanceof Uint8ClampedArray) &&
  buffer.data.length === buffer.width * buffer.height * 4;

// Landmarks use image-edge coordinates: pixel (0,0) has centre (.5,.5).
// Accumulate premultiplied channels through both bilinear and pose interpolation.
function accumulate(buffer, x, y, weight, sum) {
  x = Math.max(0, Math.min(buffer.width - 1, x - .5));
  y = Math.max(0, Math.min(buffer.height - 1, y - .5));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  for (let row = 0; row < 2; row++) for (let column = 0; column < 2; column++) {
    const index = (Math.min(buffer.height - 1, y0 + row) * buffer.width + Math.min(buffer.width - 1, x0 + column)) * 4;
    const share = weight * (column ? fx : 1 - fx) * (row ? fy : 1 - fy) * buffer.data[index + 3] / 255;
    sum[0] += buffer.data[index] * share;
    sum[1] += buffer.data[index + 1] * share;
    sum[2] += buffer.data[index + 2] * share;
    sum[3] += share;
  }
}

function write(data, offset, sum) {
  const alpha = sum[3];
  data[offset] = alpha > 0 ? sum[0] / alpha : 0;
  data[offset + 1] = alpha > 0 ? sum[1] / alpha : 0;
  data[offset + 2] = alpha > 0 ? sum[2] / alpha : 0;
  data[offset + 3] = alpha * 255;
}

// Returns null on invalid/missing registration so the caller can retain its
// still image. Uncovered pixels deliberately sample front, never another pose.
export function samplePose(model, buffers, { x = 0, y = 0, width, height } = {}) {
  const front = buffers?.front, points = model?.points, triangles = model?.triangles;
  if (!validBuffer(front) || !Number.isSafeInteger(width) || width < 1 ||
      !Number.isSafeInteger(height) || height < 1 || !Number.isSafeInteger(width * height * 4) ||
      !Array.isArray(points?.front) || points.front.length < 3 ||
      !Array.isArray(triangles) || !triangles.length) return null;
  const count = points.front.length;
  if (model.target != null && (!Array.isArray(model.target) || model.target.length !== count || model.target.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)))) return null;
  const poses = Object.values(points);
  if(model.targets && Object.values(model.targets).some(p=>!Array.isArray(p)||p.length!==count||p.some(v=>!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite))))return null;
  if (poses.some(pose => !Array.isArray(pose) || pose.length !== count ||
      pose.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)))) return null;
  for (const triangle of triangles) {
    if (!Array.isArray(triangle) || triangle.length !== 3 ||
        triangle.some(index => !Number.isInteger(index) || index < 0 || index >= count)) return null;
    const [a, b, c] = triangle, direction = area(points.front[a], points.front[b], points.front[c]);
    if (Math.abs(direction) <= epsilon || poses.some(pose => area(pose[a], pose[b], pose[c]) * Math.sign(direction) <= epsilon)) return null;
  }
  const sources = poseWeights(x, y).map(({ pose, weight }) => ({ points: points[pose], target: model.targets?.[pose]??points[pose], buffer: buffers[pose], weight }));
  if (sources.some(source => !source.points || !validBuffer(source.buffer) ||
      source.buffer.width !== front.width || source.buffer.height !== front.height)) return null;
  const target = points.front.map((_, index) => model.target != null ? [model.target[index][0] * width / front.width, model.target[index][1] * height / front.height] : [
    sources.reduce((sum, source) => sum + source.target[index][0] * source.weight, 0) * width / front.width,
    sources.reduce((sum, source) => sum + source.target[index][1] * source.weight, 0) * height / front.height,
  ]);
  // Valid endpoint meshes can still collapse while interpolating (e.g. a half turn).
  if (triangles.some(([a, b, c]) => area(target[a], target[b], target[c]) *
      Math.sign(area(points.front[a], points.front[b], points.front[c])) <= epsilon)) return null;
  let data;
  try { data = new Uint8ClampedArray(width * height * 4); } catch { return null; }
  const sum = new Float64Array(4);
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    sum.fill(0);
    accumulate(front, (column + .5) * front.width / width, (row + .5) * front.height / height, 1, sum);
    write(data, (row * width + column) * 4, sum);
  }
  for (const triangle of triangles) {
    const [ia, ib, ic] = triangle, a = target[ia], b = target[ib], c = target[ic];
    const denominator = area(a, b, c);
    const minX = Math.max(0, Math.ceil(Math.min(a[0], b[0], c[0]) - .5));
    const maxX = Math.min(width - 1, Math.floor(Math.max(a[0], b[0], c[0]) - .5));
    const minY = Math.max(0, Math.ceil(Math.min(a[1], b[1], c[1]) - .5));
    const maxY = Math.min(height - 1, Math.floor(Math.max(a[1], b[1], c[1]) - .5));
    for (let row = minY; row <= maxY; row++) for (let column = minX; column <= maxX; column++) {
      const px = column + .5, py = row + .5;
      const wa = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / denominator;
      const wb = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / denominator;
      const wc = 1 - wa - wb;
      if (wa < -epsilon || wb < -epsilon || wc < -epsilon) continue;
      sum.fill(0);
      for (const source of sources) {
        const sa = source.points[ia], sb = source.points[ib], sc = source.points[ic];
        accumulate(source.buffer, wa * sa[0] + wb * sb[0] + wc * sc[0],
          wa * sa[1] + wb * sb[1] + wc * sc[1], source.weight, sum);
      }
      write(data, (row * width + column) * 4, sum);
    }
  }
  return { width, height, data };
}
