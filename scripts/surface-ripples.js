// Radial wave energy shared by the decorative pond and registered image reveal.
// Coordinates are normalized to the surface height, independent of DPR.
export function rippleEnergy(ripples, x, y, time) {
  let energy = 0;
  for (const ripple of ripples) {
    const age = time - ripple.born;
    if (age < 0 || age >= ripple.life) continue;
    const band = .018 + age * .012;
    const distance = Math.abs(Math.hypot(x - ripple.x, y - ripple.y) - age * ripple.speed);
    if (distance < band) energy += (1 - distance / band) * (1 - age / ripple.life) * ripple.strength;
  }
  return energy;
}

// Shared digital wave alphabet for pond and portrait surfaces.
export function rippleGlyph(energy) {
  return ["·", "°", "o", "O"][Math.max(0, Math.min(3, Math.floor(energy * 3)))];
}
