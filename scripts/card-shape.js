// A tangent pair of arcs shared by the folder edge and bookmark silhouette.
// Coordinates are supplied by each measured, token-resolved card geometry.
export function stepEdge(x, fromY, toY, { rtl = false } = {}) {
  const delta = toY - fromY, radius = Math.abs(delta) / 2;
  if (!radius) return `H${x}`;
  const direction = rtl ? -1 : 1, midpoint = fromY + delta / 2;
  const down = delta > 0 ? 1 : 0;
  return `H${x-direction*radius}A${radius} ${radius} 0 0 ${rtl?1-down:down} ${x} ${midpoint}A${radius} ${radius} 0 0 ${rtl?down:1-down} ${x+direction*radius} ${toY}`;
}

export function shapeMask(path, width, height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><path d="${path}" fill="black"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
