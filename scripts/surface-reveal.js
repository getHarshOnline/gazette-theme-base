import { timeToken } from './css-time.js';
import { rippleEnergy } from './surface-ripples.js';

// Grain vanishes in the solid centre and outside the aperture. Its bounded
// contribution preserves a soft fade instead of cutting a checkerboard hole.
export function featheredCoverage(coverage, threshold, energy = 0) {
  const soft = coverage * coverage * (3 - 2 * coverage);
  const grain = (coverage > threshold ? 1 : 0) - coverage;
  return Math.max(0, Math.min(1, soft + (grain + energy) * soft * (1 - soft)));
}

// A continuous, periodic boundary around one aperture, never a trail of circles.
// The two spatial frequencies break circular symmetry without noisy cell motion.
export function revealBoundary(angle, phase, deformation, pulse = 0) {
  const drift = (Math.sin(2 * angle - phase) + .5 * Math.sin(3 * angle + phase)) / 1.5;
  return 1 + deformation * (drift + 2 * pulse);
}

// Existing captured physics remain the single value source for both portrait
// and film reveals. The renderer itself knows no page, medium or world.
export function revealSettings(style) {
  const number = name => Number.parseFloat(style.getPropertyValue(name));
  const radius = number('--layout-portrait-reveal-radius');
  const life = timeToken(style, '--motion-portrait-reveal-life') / 1000;
  const feather = number('--material-portrait-reveal-feather');
  const deformation = number('--material-portrait-reveal-deformation');
  const cycle = timeToken(style, '--motion-portrait-reveal-cycle') / 1000;
  const cell = number('--layout-portrait-cell');
  if (![radius, life, feather, deformation, cycle, cell].every(Number.isFinite)
      || radius <= 0 || life <= 0 || cycle <= 0 || cell <= 0 || feather < 0 || feather >= 1
      || deformation < 0 || deformation >= 1 / 3) return null;
  return { radius, life, feather, deformation, cycle, cell };
}

export function createRevealMask(settings) {
  if (!settings) return null;
  const { radius, life, feather, deformation, cycle, cell } = settings;
  const mask = document.createElement('canvas');
  const m = mask.getContext('2d');
  if (!m) return null;
  let point = null, wave = null, size = null, revision = 0, maskRevision = -1, maskTime = null;
  const extent = radius * (1 + 3 * deformation);
  const coverageAt = (x, y, time) => {
    const dx = x - point.x, dy = y - point.y;
    const age = wave ? (time - wave.born) / life : 0;
    const pulse = age > 0 && age < 1 ? Math.sin(Math.PI * age) : 0;
    const edge = radius * revealBoundary(Math.atan2(dy, dx), time / cycle * 2 * Math.PI, deformation, pulse);
    return Math.max(0, Math.min(1, (edge - Math.hypot(dx, dy)) / (edge * (1 - feather))));
  };
  // All reveal layers consume this one scene-space aperture. Reusing the same
  // canvas for a frame keeps the foreground and registered underlay coincident.
  const aperture = (bounds, now) => {
    if (![bounds.width, bounds.height, now].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) return null;
    const time = now / 1000;
    if (wave && time - wave.born >= life) wave = null;
    if (!point) return null;
    if (!size || size.width !== bounds.width || size.height !== bounds.height) {
      size = { width: bounds.width, height: bounds.height };
      mask.width = Math.ceil(bounds.width);
      mask.height = Math.ceil(bounds.height);
      maskRevision = -1;
    }
    if (maskRevision === revision && maskTime === now) return mask;
    m.clearRect(0, 0, mask.width, mask.height);
    const ripples = wave ? [{ ...wave, x: wave.x / bounds.height, y: wave.y / bounds.height,
      speed: 2 * radius / life / bounds.height }] : [];
    // Keep the soft aperture continuous. Fine ordered grain changes only its
    // feather; it cannot open a second aperture behind the moving pointer.
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    m.fillStyle = '#000';
    const left = Math.max(0, Math.floor((point.x - extent) / cell));
    const top = Math.max(0, Math.floor((point.y - extent) / cell));
    const right = Math.min(Math.ceil(bounds.width / cell), Math.ceil((point.x + extent) / cell));
    const bottom = Math.min(Math.ceil(bounds.height / cell), Math.ceil((point.y + extent) / cell));
    for (let row = top; row < bottom; row++) {
      for (let column = left; column < right; column++) {
        const x = column * cell, y = row * cell;
        const cx = x + cell / 2, cy = y + cell / 2;
        const coverage = coverageAt(cx, cy, time);
        if (!coverage) continue;
        const energy = rippleEnergy(ripples, cx / bounds.height, cy / bounds.height, time);
        const threshold = (bayer[(row % 4) * 4 + column % 4] + .5) / bayer.length;
        m.globalAlpha = featheredCoverage(coverage, threshold, energy);
        m.fillRect(x, y, cell, cell);
      }
    }
    m.globalAlpha = 1;
    maskRevision = revision; maskTime = now;
    return mask;
  };
  return {
    point(x, y) { point = { x, y }; revision++; },
    pulse(x, y, now) {
      point = { x, y };
      wave = { x, y, born: now / 1000, life, strength: 1 };
      revision++;
    },
    leave() { point = null; wave = null; revision++; },
    reset() { point = null; wave = null; revision++; },
    obscures(rect, now = 0) {
      if (!point) return 0;
      const x = Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
      const y = Math.max(rect.y, Math.min(point.y, rect.y + rect.height));
      const coverage = coverageAt(x, y, now / 1000);
      return coverage * coverage * (3 - 2 * coverage);
    },
    aperture,
  };
}
