// Turn the compiler's recommendation list into a browsable relationship preview.
// Selection changes presentation only. The engine retains ownership of membership,
// order, titles, destinations and the evidence establishing each relationship.
export const wrapChoice = (index, count) => ((index % count) + count) % count;
export function constellation(count) {
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / count;
    return { x: .5 + .36 * Math.cos(angle), y: .5 + .36 * Math.sin(angle) };
  });
}

export function mountDiscoveryExplorer(root) {
  const list = root.querySelector(':scope > ul');
  const cards = [...(list?.children || [])];
  const titles = cards.map(card => card.querySelector('.reading-related__title'));
  const previousLabel = root.getAttribute('data-discovery-previous');
  const nextLabel = root.getAttribute('data-discovery-next');
  if (cards.length < 2 || titles.some(title => !title) || !previousLabel || !nextLabel) return null;
  const doc = root.ownerDocument;
  const svgNS = 'http://www.w3.org/2000/svg';
  const map = doc.createElement('div'); map.className = 'discovery-map';
  const lines = doc.createElementNS(svgNS, 'svg');
  lines.setAttribute('viewBox', '0 0 100 100'); lines.setAttribute('aria-hidden', 'true');
  map.append(lines);
  const origin = doc.createElement('span'); origin.className = 'discovery-map__origin';
  origin.textContent = root.getAttribute('data-discovery-origin') || '';
  map.append(origin);
  const choices = [];
  constellation(cards.length).forEach((point, index) => {
    const line = doc.createElementNS(svgNS, 'line');
    for (const [key, value] of Object.entries({ x1: 50, y1: 50, x2: point.x * 100, y2: point.y * 100 })) line.setAttribute(key, String(value));
    lines.append(line);
    const button = doc.createElement('button'); button.type = 'button';
    button.className = 'discovery-map__choice';
    button.style.setProperty('--discovery-x', `${point.x * 100}%`);
    button.style.setProperty('--discovery-y', `${point.y * 100}%`);
    button.setAttribute('aria-label', titles[index].textContent.trim());
    button.title = titles[index].textContent.trim();
    map.append(button); choices.push(button);
  });
  const controls = doc.createElement('div'); controls.className = 'discovery-controls';
  const arrow = (label, text) => {
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'control control--secondary control--navigation';
    button.setAttribute('aria-label', label);
    const glyph = doc.createElement('span'); glyph.setAttribute('aria-hidden', 'true'); glyph.textContent = text;
    button.append(glyph); return button;
  };
  const previous = arrow(previousLabel, '←'), next = arrow(nextLabel, '→');
  const position = doc.createElement('output'); position.setAttribute('aria-live', 'polite'); position.setAttribute('aria-atomic', 'true');
  controls.append(previous, position, next);
  const originals = cards.map(card => ({ hidden: card.hidden }));
  const cleanups = [];
  let selected = 0, printing = false, drag = null;
  const listen = (node, type, callback, options) => {
    node.addEventListener(type, callback, options);
    cleanups.push(() => node.removeEventListener(type, callback, options));
  };
  function select(index, { preview = false } = {}) {
    // Hover must never hide a focused destination or interrupt text selection.
    if (preview && cards.some(card => card.contains(doc.activeElement))) return;
    selected = wrapChoice(index, cards.length);
    cards.forEach((card, i) => { card.hidden = !printing && i !== selected; });
    choices.forEach((choice, i) => choice.setAttribute('aria-pressed', String(i === selected)));
    position.textContent = `${selected + 1} / ${cards.length}`;
  }
  choices.forEach((choice, index) => {
    listen(choice, 'click', () => select(index));
    listen(choice, 'focus', () => select(index));
    listen(choice, 'pointerenter', event => { if (event.pointerType !== 'touch') select(index, { preview: true }); });
  });
  listen(previous, 'click', () => select(selected - 1));
  listen(next, 'click', () => select(selected + 1));
  listen(controls, 'keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); select(selected + (event.key === 'ArrowRight' ? 1 : -1));
  });
  listen(map, 'keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : wrapChoice(selected + (event.key === 'ArrowRight' ? 1 : -1), cards.length);
    choices[index].focus();
  });
  // A deliberate horizontal gesture over card whitespace selects a neighbour.
  // Links, selection and vertical page scrolling keep their native behaviours.
  listen(list, 'pointerdown', event => {
    if (event.button !== 0 || event.target.closest('a,button,input,select,textarea') || doc.getSelection()?.toString()) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  listen(list, 'pointerup', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y; drag = null;
    const threshold = parseFloat(getComputedStyle(root).getPropertyValue('--target-project'));
    if (Number.isFinite(threshold) && Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 2) select(selected + (dx < 0 ? 1 : -1));
  });
  listen(list, 'pointercancel', () => { drag = null; });
  listen(window, 'beforeprint', () => { printing = true; select(selected); });
  listen(window, 'afterprint', () => { printing = false; select(selected); });
  root.prepend(map); root.append(controls); root.classList.add('discovery-explorer--ready'); select(0);
  return () => {
    cleanups.forEach(cleanup => cleanup()); map.remove(); controls.remove();
    root.classList.remove('discovery-explorer--ready');
    cards.forEach((card, index) => { card.hidden = originals[index].hidden; });
  };
}

export function mountDiscoveryExplorers() {
  return [...document.querySelectorAll('.discovery-explorer')].map(mountDiscoveryExplorer).filter(Boolean);
}
