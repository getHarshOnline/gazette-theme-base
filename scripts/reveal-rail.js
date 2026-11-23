// Keep a clipped card reachable without moving its surrounding page. Native
// scrolling retains trackpad/touch behavior and lets new input interrupt motion.
export function railRevealOffset(rail, card, inset = 0) {
  const bounds = rail.getBoundingClientRect(), item = card.getBoundingClientRect();
  let delta = 0;
  if (item.right > bounds.right - inset) delta = item.right - bounds.right + inset;
  else if (item.left < bounds.left + inset) delta = item.left - bounds.left - inset;
  return Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, rail.scrollLeft + delta));
}

export function mountRevealRail(rail, { signal, motionAllowed }) {
  let hovered = null;
  const reveal = event => {
    const card = event.target.closest?.('article');
    if (!card || card.parentElement !== rail || event.type === 'pointerover' && hovered === card) return;
    hovered = card;
    const inset = Number.parseFloat(getComputedStyle(rail).paddingInlineStart) || 0;
    const left = railRevealOffset(rail, card, inset);
    if (Math.abs(left - rail.scrollLeft) > 1) rail.scrollTo({ left, behavior: motionAllowed() ? 'smooth' : 'instant' });
  };
  rail.addEventListener('pointerover', reveal, { signal });
  rail.addEventListener('focusin', reveal, { signal });
  rail.addEventListener('pointerleave', () => { hovered = null; }, { signal });
}
