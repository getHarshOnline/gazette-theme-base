import { clamp } from './clamp.js';
// Monotone cubic interpolation preserves authored rests without overshoot.
// Landmarks and reveal windows are supplied by the composing owner.
export { clamp };
export const filmRange = (value, start, end) => end === start ? Number(value >= end) : clamp((value - start) / (end - start));
export const filmLetterVisibility = (progress, index, count, [start, spread, duration]) =>
  filmRange(progress, start + index / Math.max(1, count) * spread, start + index / Math.max(1, count) * spread + duration);
export const filmIntroProgress = (elapsed, duration, share, exponent) =>
  share * (1 - (1 - clamp(elapsed / duration)) ** exponent);
// The token build emits uniformly sampled linear() source curves. Interpolate
// their values rather than reproducing easing parameters or defaults here.
export function filmNavigationCurve(css) {
  const match = typeof css==='string'&&/^linear\(([^()]*)\)$/.exec(css.trim());
  if(!match)return null;
  const samples = match[1].split(',').map(value => value.trim());
  if(samples.some(value=>!value))return null;
  const values = samples.map(Number);
  if (values.length < 2 || values.some((value, i) =>
    !Number.isFinite(value) || value < 0 || value > 1 || (i && value < values[i - 1])) ||
    values[0] !== 0 || values.at(-1) !== 1) return null;
  return progress => {
    const index = clamp(progress) * (values.length - 1), left = Math.floor(index);
    return values[left] + ((values[left + 1] ?? values[left]) - values[left]) * (index - left);
  };
}
export function createFilmTimeline(beats) {
  if (!Array.isArray(beats) || beats.length < 2 || beats.some((b, i) =>
    !Array.isArray(b) || b.length !== 2 || !b.every(Number.isFinite) || (i && (b[0] <= beats[i - 1][0] || b[1] < beats[i - 1][1])))) {
    throw new RangeError('Film landmarks must increase in position and never reverse time');
  }
  const x = beats.map(b => b[0]), y = beats.map(b => b[1]);
  const d = x.slice(1).map((v, i) => (y[i + 1] - y[i]) / (v - x[i]));
  const m = [d[0], ...d.slice(1).map((v, i) => d[i] * v <= 0 ? 0 : (d[i] + v) / 2), d.at(-1)];
  for (let i = 0; i < d.length; i++) {
    if (!d[i]) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], square = a * a + b * b;
    if (square > 9) { const t = 3 / Math.sqrt(square); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return value => {
    const u = clamp(value, x[0], x.at(-1));
    let i = 0; while (i < x.length - 2 && u > x[i + 1]) i++;
    const h = x[i + 1] - x[i], t = (u - x[i]) / h, t2 = t * t, t3 = t2 * t;
    return clamp((2*t3-3*t2+1)*y[i] + (t3-2*t2+t)*h*m[i] + (-2*t3+3*t2)*y[i+1] + (t3-t2)*h*m[i+1], y[i], y[i+1]);
  };
}
// A painted frame represents a half-frame time bin, not one exact instant.
// Inverting both edges preserves every scroll position inside an authored hold.
export function filmPaintedProgressWindow(at, frame, fps, intro = 0) {
  if(typeof at!=='function'||!Number.isInteger(frame)||frame< -1||!Number.isFinite(fps)||fps<=0||!Number.isFinite(intro)||intro<0)
    throw new RangeError('Invalid painted film clock');
  if(frame<0)return [0,0];
  const time=position=>Math.max(at(position),intro);
  const bound=(target,upper)=>{
    if(target<time(0))return 0;
    if(target>time(1))return 1;
    let lo=0,hi=1;
    for(let i=0;i<40;i++){
      const mid=(lo+hi)/2,value=time(mid);
      if(upper?value<=target:value<target)lo=mid;else hi=mid;
    }
    return upper?lo:hi;
  };
  return [bound((frame-.5)/fps,false),bound((frame+.5)/fps,true)];
}
export function filmVisibility(time, [start, arrived, leaving = Infinity, gone = Infinity]) {
  const range = (t, a, b) => a === b ? Number(t >= b) : clamp((t - a) / (b - a));
  return time < leaving ? (start < 0 ? 1 : range(time, start, arrived)) : 1 - range(time, leaving, gone);
}
export function filmLineVisibility(visibility, index, gain, stagger) {
  const t = clamp(visibility * gain - index * stagger);
  return t * t * (3 - 2 * t);
}
export function advanceFilm(head, target, elapsed, { minimumRate, catchupRate, stepLimit, response = 'rate', damping, snapTolerance }) {
  const difference = target - head;
  if (response === 'exponential') {
    if (Math.abs(difference) <= snapTolerance) return target;
    const dt = Math.min(stepLimit, Math.max(0, elapsed));
    const next = head + difference * -Math.expm1(-damping * dt);
    return Math.abs(target - next) <= snapTolerance ? target : next;
  }
  const step = Math.max(minimumRate, Math.abs(difference) * catchupRate) * Math.min(stepLimit, Math.max(0, elapsed));
  return Math.abs(difference) <= step ? target : head + Math.sign(difference) * step;
}
// Every index remains addressable; decoding residency is a bounded window with a warmed seek destination.
export function filmFrameWindow(count, center, capacity, target = center) {
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(center) || !Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError('Invalid decoded frame window');
  }
  const start=clamp(Math.round(center),0,count-1), order=[start], limit=Math.min(count,capacity);
  // Keep the selected destination warm during a fast scrub, without growing the cache.
  const destination=clamp(Math.round(target),0,count-1);
  if(Number.isFinite(destination)&&destination!==start&&limit>1)order.push(destination);
  for(let delta=1;order.length<limit;delta++) {
    const direction=Math.sign(destination-start)||1;
    for(const index of [start+delta*direction,start-delta*direction])
      if(order.length<limit&&index>=0&&index<count&&!order.includes(index))order.push(index);
  }
  return order;
}

// One reversible view-progress definition for unpinned artwork and document sections.
export function filmPassageProgress(top, height, viewport) {
  return clamp((viewport-top)/Math.max(1,viewport+height));
}
