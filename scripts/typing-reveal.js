// Reveal a plain-text passage once, in order across its original elements.
// Opacity is visual only: complete text and measured layout remain available.
export function createTypingReveal(element, { duration, feather }) {
  let started = false, originals = [], animations = [];
  function finish() {
    for (const animation of animations) animation.cancel();
    animations = [];
    for (const { target, nodes } of originals) target.replaceChildren(...nodes);
    originals = [];
  }
  return {
    start() {
      if (started) return;
      started = true;
      if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(feather) || feather <= 0) return;
      const targets = (Array.isArray(element) ? element : [element])
        .filter(target => target && !target.children.length && target.animate);
      const spans = targets.flatMap((target, group) => {
        const characters = typeof Intl.Segmenter === 'function'
          ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(target.textContent), part => part.segment)
          : Array.from(target.textContent);
        originals.push({ target, nodes: Array.from(target.childNodes) });
        const line = characters.map(character => {
          const span = document.createElement('span'); span.textContent = character; return span;
        });
        target.replaceChildren(...line);
        return line.map(span => ({ span, group }));
      });
      animations = spans.map(({ span, group }, index) => span.animate([{ opacity: 0 }, { opacity: 1 }], {
        delay: duration * index / Math.max(1, spans.length - 1) + group * feather,
        duration: feather, fill: 'both',
      }));
      Promise.all(animations.map(animation => animation.finished)).then(finish, () => {});
    },
    finish() { started = true; finish(); },
    destroy: finish,
  };
}
