// Keep focus usable before a finite carousel disables its active arrow.
export function setCarouselArrows(previous, next, disablePrevious, disableNext) {
  const active = (previous.ownerDocument || document).activeElement;
  const replacement = active === previous && disablePrevious && !disableNext ? next :
    active === next && disableNext && !disablePrevious ? previous : null;
  if (!disablePrevious) previous.disabled = false;
  if (!disableNext) next.disabled = false;
  replacement?.focus({ preventScroll: true });
  previous.disabled = disablePrevious;
  next.disabled = disableNext;
}
