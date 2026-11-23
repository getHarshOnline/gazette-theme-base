import test from 'node:test';
import assert from 'node:assert/strict';
import { createTypingReveal } from '../scripts/typing-reveal.js';

function sentence(text) {
  const calls = [], original = { textContent: text };
  const element = {
    children: [], childNodes: [original], textContent: text, animate() {},
    replaceChildren(...nodes) { this.childNodes = nodes; },
  };
  globalThis.document = { createElement: () => ({
    textContent: '', animate(frames, options) {
      const animation = { frames, options, finished: new Promise(() => {}), cancelled: false,
        cancel() { this.cancelled = true; } };
      calls.push(animation); return animation;
    },
  }) };
  return { element, calls, original };
}

test('typing keeps graphemes intact and restores the exact original node on interruption', () => {
  const f = sentence('A 👩‍💻 question.');
  const typing = createTypingReveal(f.element, { duration: 1500, feather: 110 });
  typing.start();
  assert.equal(f.element.childNodes.map(node => node.textContent).join(''), f.element.textContent);
  assert.ok(f.element.childNodes.some(node => node.textContent === '👩‍💻'));
  assert.equal(f.calls[0].options.delay, 0);
  assert.equal(f.calls.at(-1).options.delay, 1500);
  typing.finish();
  assert.deepEqual(f.element.childNodes, [f.original]);
  assert.ok(f.calls.every(animation => animation.cancelled));
  const count = f.calls.length; typing.start(); assert.equal(f.calls.length, count);
});

test('reduced motion leaves a complete sentence without constructing an animation', () => {
  const f = sentence('A complete sentence.');
  const typing = createTypingReveal(f.element, { duration: 1500, feather: 110 });
  typing.finish(); typing.start();
  assert.deepEqual(f.element.childNodes, [f.original]);
  assert.equal(f.calls.length, 0);
});

test('multiple lines share one ordered timeline while retaining their original elements', () => {
  const first = sentence('When a new question arrives');
  const second = sentence('What comes next?');
  // Both targets use the same document factory; calls remain in reading order.
  const typing = createTypingReveal([first.element, second.element], { duration: 1500, feather: 110 });
  typing.start();
  const calls = second.calls, boundary = first.element.childNodes.length;
  assert.equal(calls.length, boundary + second.element.childNodes.length);
  assert.equal(calls[0].options.delay, 0);
  assert.ok(calls[boundary].options.delay >= calls[boundary - 1].options.delay + calls[boundary - 1].options.duration);
  assert.equal(calls.at(-1).options.delay, 1610);
  typing.finish();
  assert.deepEqual(first.element.childNodes, [first.original]);
  assert.deepEqual(second.element.childNodes, [second.original]);
});

test('rich text and unsupported animation retain their native content', () => {
  for (const rich of [false, true]) {
    const f = sentence('A complete sentence.');
    if (rich) f.element.children = [{}]; else delete f.element.animate;
    createTypingReveal(f.element, { duration: 1500, feather: 110 }).start();
    assert.deepEqual(f.element.childNodes, [f.original]);
    assert.equal(f.calls.length, 0);
  }
});
