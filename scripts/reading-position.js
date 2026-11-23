// Location within the document, never a record of what the visitor has read.
export function mountReadingPosition() {
  const body = document.querySelector('.publication-body');
  const navigation = document.querySelector('.reading-sections');
  if (!body || !navigation) return;
  const links = [...navigation.querySelectorAll('a[href]')];
  const targets = links.flatMap(link => {
    let id;
    try { id = decodeURIComponent(new URL(link.href).hash.slice(1)); } catch { return []; }
    const heading = document.getElementById(id);
    return heading && body.contains(heading) && heading.matches('h2,h3') ? [{ link, heading }] : [];
  });
  if (!targets.length) return;
  const outline = navigation.closest('.reading-navigation') || navigation.closest('.reading-outline');
  const subscribers = new Set();
  let state = null;
  let positions = [], bottom = 0, pageBottom = 0, obstruction = 0, leading = 0, flow = false;
  let current = null, pending = false, dirty = true;
  let requestedFragment = location.hash, clampedTarget = null;
  const measure = () => {
    const scroll = window.scrollY;
    positions = targets.filter(({ heading }) => heading.getClientRects().length && getComputedStyle(heading).visibility !== 'hidden')
      .map(({ link, heading }) => {
        let previous = heading.previousElementSibling;
        while (previous && (!previous.getClientRects().length || getComputedStyle(previous).visibility === 'hidden')) previous = previous.previousElementSibling;
        return {
          link, top: heading.getBoundingClientRect().top + scroll,
          precedingBottom: previous ? previous.getBoundingClientRect().bottom + scroll : null,
        };
      });
    bottom = body.getBoundingClientRect().bottom + scroll;
    flow = !!outline && getComputedStyle(outline).getPropertyValue('--reading-placement').trim() === 'flow';
    pageBottom = document.documentElement.scrollHeight;
    obstruction = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--frame-chrome')) || 0;
    leading = parseFloat(getComputedStyle(body).lineHeight) || 0;
    dirty = false;
  };
  const update = () => {
    pending = false;
    if (dirty) measure();
    const line = window.scrollY + obstruction + leading;
    const atEnd = Math.ceil(window.scrollY + window.innerHeight) >= pageBottom;
    const visible = item => item && item.top >= window.scrollY + obstruction && item.top < window.scrollY + window.innerHeight;
    if (requestedFragment) {
      const requested = positions.find(item => new URL(item.link.href).hash === requestedFragment);
      clampedTarget = atEnd && visible(requested) ? { link: requested.link, scroll: window.scrollY } : null;
      requestedFragment = null;
    }
    const held = clampedTarget && positions.find(item => item.link === clampedTarget.link);
    if (clampedTarget && (!atEnd || clampedTarget.scroll !== window.scrollY || !visible(held))) clampedTarget = null;
    let next = null;
    if (line < bottom) {
      for (const item of positions) {
        // Heading whitespace belongs to the arriving section once prior content has left.
        if (item.top <= line || (visible(item) && item.precedingBottom !== null && item.precedingBottom <= line)) next = item.link;
      }
      // A short final section may never reach the reading line at the page end.
      if (next && atEnd) {
        const last = positions[positions.length - 1];
        if (last.top < window.scrollY + window.innerHeight) next = last.link;
      }
      if (clampedTarget) next = clampedTarget.link;
    }
    if (next !== current) {
      current?.removeAttribute('aria-current');
      current = next;
      current?.setAttribute('aria-current', 'location');
    }
    const nextState = {
      link: current,
      flow
    };
    if (!state || Object.keys(nextState).some(key => nextState[key] !== state[key])) {
      state = nextState;
      for (const subscriber of subscribers) subscriber(state);
    }
  };
  const schedule = () => {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  };
  const refresh = () => { dirty = true; schedule(); };
  const followFragment = () => { requestedFragment = location.hash; refresh(); };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', refresh, { passive: true });
  window.addEventListener('pageshow', followFragment);
  window.addEventListener('hashchange', followFragment);
  navigation.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (links.includes(link) && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      requestedFragment = new URL(link.href).hash;
      refresh();
    }
  });
  document.addEventListener('load', refresh, true);
  document.addEventListener('toggle', refresh, true);
  document.addEventListener('change', refresh);
  const observer = new ResizeObserver(refresh);
  for (const element of [body, body.closest('main'), document.querySelector('.frame__header')]) {
    if (element) observer.observe(element);
  }
  document.fonts?.ready.then(refresh);
  refresh();
  return {
    navigation,
    refresh,
    subscribe(subscriber) {
      subscribers.add(subscriber);
      if (state) subscriber(state);
      return () => subscribers.delete(subscriber);
    }
  };
}
