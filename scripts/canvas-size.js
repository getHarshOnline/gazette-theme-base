// Convert a CSS-space size to backing pixels. Each renderer keeps its density
// cap, rounding rule, minimum size and decision about resetting the context.
export function canvasSize(width, height, ratio = 1, round = Math.round) {
  return { width: round(width * ratio), height: round(height * ratio) };
}
