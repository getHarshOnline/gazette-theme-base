import { clamp as clampField } from './clamp.js';
// The edit selects neighbouring fields without re-seeding their population.
export { clampField };
export const smoothField = (a, b, value) => {
  const t = clampField((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const dampField = (value, target, rate, dt) => target + (value - target) * Math.exp(-rate * dt);
export function fieldPosition(raw, count, edit) {
  const index = Math.max(0, Math.min(count - 1, Math.floor(raw)));
  const local = clampField(raw - index);
  return { index, local, blend: index === count - 1 ? 0 : smoothField(edit.blendStart, edit.blendEnd, local),
    visibility: index === count - 1 ? 1 : 1 - smoothField(edit.fadeStart, edit.fadeEnd, local) };
}
export function fieldClosing(local, index, count, span) {
  const centre = (index + 0.5) / count;
  // The last sentence remains available through the scene's release.
  if (index === count - 1 && local >= centre) return 1;
  const value = Math.max(0, 1 - Math.abs(local - centre) / (span / count));
  return value * value * (3 - 2 * value);
}
