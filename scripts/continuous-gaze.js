import { clamp } from './clamp.js';
const smooth = value => value * value * (3 - 2 * value);

// The curve is measured source geometry; its inverse removes the film's baked easing.
export function gazeFrame(value, curve, inverseWeight) {
  const v = clamp(value);
  let lo = 0, hi = curve.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (curve[mid] <= v) lo = mid; else hi = mid;
  }
  const inverse = lo + clamp((v - curve[lo]) / (curve[hi] - curve[lo] || 1));
  return inverse * inverseWeight + v * (curve.length - 1) * (1 - inverseWeight);
}

export function gazeLayout(width, height, model, copyBottom = 0) {
  const m = model.geometry;
  if (m.fit === 'contain') {
    const scale = Math.min(width / model.width, height / model.height);
    return { scale, x: (width - model.width * scale) / 2, y: (height - model.height * scale) / 2, portrait: width < height };
  }
  if (width / height >= m.landscapeAspect) {
    const scale = Math.max(width / model.width, height / model.height);
    return { scale, x: (width - model.width * scale) / 2,
      y: (height - model.height * scale) * m.cropY, portrait: false };
  }
  const available = Math.max(0, height - copyBottom);
  const scale = Math.min(width / m.headSpan, height * m.portraitShare / model.height,
    available / m.headHeight);
  return { scale, x: width / 2 - m.noseX * scale,
    y: height - model.height * scale * m.bottomAnchor, portrait: true };
}

export function gazeLoadOrder(count) {
  const order = [...new Set([Math.floor((count - 1) / 2), 0, count - 1])];
  const seen = new Set(order);
  for (let step = (count - 1) / 2; step >= 1;) {
    step /= 2;
    for (let x = step; x < count; x += step) {
      const i = Math.round(x);
      if (i < count && !seen.has(i)) { seen.add(i); order.push(i); }
    }
  }
  for (let i = 0; i < count; i++) if (!seen.has(i)) order.push(i);
  return order;
}

export class ContinuousGaze {
  constructor(physics) { this.p = physics; this.reset(); }
  reset() {
    this.value = this.target = .5;
    this.y = this.softY = .5;
    this.parallax = { x: 0, y: 0 };
    this.lastInput = null; this.last = null; this.script = null; this.idleFrom = null;
  }
  point(x, y, nose, now) {
    const p = this.p;
    const centre = Math.min(1 - p.headClamp, Math.max(p.headClamp, nose));
    this.script = null; // Direct input always interrupts a demonstration.
    this.target = x < centre ? .5 * clamp((x - p.pointerMargin) / (centre - p.pointerMargin))
      : .5 + .5 * clamp((x - centre) / (1 - p.pointerMargin - centre));
    this.y = clamp(y); this.lastInput = now; this.idleFrom = null;
  }
  lookAround(now) {
    const p = this.p;
    this.script = { start: now, keys: [[0, this.value], [p.lookTravelFirst, 0],
      [p.lookHoldFirst, 0], [p.lookTravelSecond, 1], [p.lookHoldSecond, 1], [p.lookReturn, .5]] };
    this.idleFrom = null;
  }
  tick(now) {
    const p = this.p;
    const dt = Math.min((now - (this.last ?? now)) / 1000, p.stepLimit);
    this.last = now;
    this.lastInput ??= now;
    let rate = p.trackingRate;
    if (this.script) {
      const time = now - this.script.start, keys = this.script.keys;
      if (time >= keys.at(-1)[0]) {
        this.target = keys.at(-1)[1]; this.script = null; this.lastInput = now;
      } else {
        let i = 0;
        while (time > keys[i + 1][0]) i++;
        const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
        this.target = v0 + (v1 - v0) * smooth((time - t0) / (t1 - t0));
        rate = p.scriptRate;
      }
    } else if (now - this.lastInput > p.idleAfter) {
      this.idleFrom ??= { time: now, value: this.target };
      const s = (now - this.idleFrom.time) / 1000;
      const sway = .5 + p.idleMajorAmplitude * Math.sin(s * p.idleMajorFrequency + p.idlePhase)
        + p.idleMinorAmplitude * Math.sin(s * p.idleMinorFrequency);
      this.target = this.idleFrom.value + (clamp(sway) - this.idleFrom.value)
        * smooth(clamp((now - this.idleFrom.time) / p.idleRamp));
      rate = p.idleRate;
    }
    this.value += (this.target - this.value) * (1 - Math.exp(-dt * rate));
    const fraction = 1 - Math.exp(-dt * p.parallaxRate);
    this.softY += (this.y - this.softY) * fraction;
    this.parallax.x += ((this.value - .5) * 2 - this.parallax.x) * fraction;
    this.parallax.y += ((this.softY - .5) * 2 - this.parallax.y) * fraction;
  }
}
