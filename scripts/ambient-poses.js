import { createFrameLoop } from './frame-loop.js';
import { observeInView } from './in-view.js';
import { clamp } from './clamp.js';
import { timeToken } from './css-time.js';
import { motionPreference } from './motion-preference.js';
import { createFrameSource } from './frames.js';

import { similarityPoses, opticalPoses } from './portrait-poses.js';
import { createPortraitGPU } from './portrait-gpu.js';

const names = ['front', 'left', 'right', 'up', 'down'];

export function poseFrames(wrapper, model) {
  if (!Array.isArray(model?.anchor) || model.anchor.length !== 2 ||
      !model.anchor.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return null;
  if (!Array.isArray(model.aperture) || model.aperture.length !== 2 ||
      !model.aperture.every(value => Number.isFinite(value) && value > 0 && value < 1) || model.aperture[0] >= model.aperture[1]) return null;
  if (!similarityPoses(model.landmarks, 100, 100) || !similarityPoses(model.pupils, 100, 100)) return null;
  const links = [...wrapper.querySelectorAll('.ambient-poses a[href]')];
  const frames = names.map(name => {
    const size = model.frames?.[name], link = links.find(link => link.textContent.trim().toLowerCase() === name);
    if (!link || !Array.isArray(size) || size.length !== 2 ||
        !size.every(value => Number.isInteger(value) && value > 0 && value <= 8192)) return null;
    try {
      const url = new URL(link.href, wrapper.ownerDocument.baseURI);
      return ['http:', 'https:'].includes(url.protocol) ? { src: url.href, width: size[0], height: size[1] } : null;
    } catch { return null; }
  });
  return frames.every(Boolean) ? frames : null;
}

// The authored anchor follows object-fit, including the crop on wide screens.
export function pointerTarget(pointer, bounds, frame, anchor, fit = 'cover') {
  if (!pointer || !bounds.width || !bounds.height) return [0, 0];
  const scale = Math[fit === 'contain' ? 'min' : 'max'](bounds.width / frame.width, bounds.height / frame.height);
  const width = frame.width * scale, height = frame.height * scale;
  const left = bounds.left + (bounds.width - width) / 2, top = bounds.top + (bounds.height - height) / 2;
  return [clamp((pointer.x - left - width * anchor[0]) / (bounds.width / 2), -1, 1),
    clamp((pointer.y - top - height * anchor[1]) / (bounds.height / 2), -1, 1)];
}

export function mountAmbientPoses({ wrapper, model }) {
  const frames = poseFrames(wrapper, model), element = wrapper.querySelector('.ambient-hero');
  if (!frames || !element || !window.createImageBitmap || !window.IntersectionObserver) return;
  const css = getComputedStyle(wrapper), rate = parseFloat(css.getPropertyValue('--gaze-tracking-rate'));
  const step = timeToken(css, '--gaze-step-limit') / 1000;
  if (![rate, step].every(value => Number.isFinite(value) && value > 0)) return;
  const canvas = document.createElement('canvas'), body = document.createElement('canvas');
  const head = document.createElement('canvas'), mask = document.createElement('canvas'), staging = document.createElement('canvas');
  const context = canvas.getContext('2d'), base = body.getContext('2d'), current = head.getContext('2d');
  const matte = mask.getContext('2d'), pixels = staging.getContext('2d', { willReadFrequently: true });
  if (!context || !base || !current || !matte || !pixels) return;
  for (const surface of [canvas, body, head, mask, staging]) { surface.width = frames[0].width; surface.height = frames[0].height; }
  const registrations = [0,1].map(eye=>opticalPoses(model.landmarks, model.pupils, canvas.width, canvas.height, eye));
  const opticalMasks = [document.createElement('canvas'),document.createElement('canvas')];
  for(const surface of opticalMasks){surface.width=canvas.width;surface.height=canvas.height;}
  // Keep the authored silhouette and lens housings intact. Only the
  // registered optical interiors participate in the directional dissolve.
  const centres = model.landmarks.front.map(([x, y]) => [x * canvas.width, y * canvas.height]);
  const separation = Math.hypot(centres[1][0] - centres[0][0], centres[1][1] - centres[0][1]);
  for (const [eye, [x, y]] of centres.entries()) {
    const aperture = matte.createRadialGradient(x, y, separation * model.aperture[0], x, y, separation * model.aperture[1]);
    aperture.addColorStop(0, '#fff'); aperture.addColorStop(1, 'transparent');
    matte.fillStyle = aperture; matte.fillRect(0, 0, canvas.width, canvas.height);
    const optical=opticalMasks[eye].getContext('2d');
    optical.fillStyle=aperture;optical.fillRect(0,0,canvas.width,canvas.height);
  }
  canvas.className = 'ambient-video ambient-hero__poses';
  const description = wrapper.querySelector('.ambient-still img')?.alt;
  if (description) { canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', description); }
  else canvas.setAttribute('aria-hidden', 'true');
  element.append(canvas);
  const lifecycle = new AbortController(), signal = lifecycle.signal;
  const fine = matchMedia('(hover: hover) and (pointer: fine)'), preference = motionPreference(document);
  const originalReady = wrapper.getAttribute('data-ambient-ready');
  let visible = false, printing = false, away = false, active = false, disposed = false, failed = false;
  let source, renderer, sources = {}, last = null, pointer = null, x = 0, y = 0, ready = false;
  const animation = createFrameLoop(draw, { window, eligible: () => active && ready });
  const schedule = animation.request;
  function draw(now) {
    if (!active || !ready) return;
    const dt = last === null ? 0 : Math.min(step, (now - last) / 1000); last = now;
    const [targetX, targetY] = pointerTarget(pointer, canvas.getBoundingClientRect(), frames[0], model.anchor, getComputedStyle(canvas).objectFit);
    const fraction = -Math.expm1(-rate * dt); x += (targetX - x) * fraction; y += (targetY - y) * fraction;
    const settled = Math.abs(targetX - x) + Math.abs(targetY - y) < .001;
    if (settled) { x = targetX; y = targetY; }
    context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(body, 0, 0);
    const material = {sourceColor:true, cell:1, ratio:1, fill:0, ink:0, bottomFade:0, dark:false};
    for(let eye=0;eye<2;eye++){
      current.clearRect(0, 0, canvas.width, canvas.height);
      if (!renderer.draw(current, sources, {x:0,y:0,width:canvas.width,height:canvas.height}, material, x, y, 0, registrations[eye])) {
        failed = true; stop(); return;
      }
      current.globalCompositeOperation = 'destination-in'; current.drawImage(opticalMasks[eye], 0, 0); current.globalCompositeOperation = 'source-over';
      context.globalCompositeOperation = 'lighter'; context.drawImage(head, 0, 0); context.globalCompositeOperation = 'source-over';
    }
    wrapper.setAttribute('data-ambient-ready', 'true');
    if (settled) last = null;
    return !settled;
  }
  function stop() {
    active = false; animation.cancel(); last = null;
    source?.dispose(); source = null; renderer?.destroy(); renderer = null;
    sources = {}; ready = false; pointer = null; x = y = 0;
    wrapper.removeAttribute('data-ambient-ready');
  }
  function state() {
    const motion = !preference.reduced();
    const eligible = !disposed && !failed && !printing && !away && visible && !document.hidden && fine.matches && motion;
    if (eligible === active) return;
    if (!eligible) { stop(); return; }
    renderer = createPortraitGPU(registrations[0]);
    if (!renderer) { failed = true; return; }
    active = true;
    source = createFrameSource({ frames, budgetBytes: frames.reduce((sum, frame) => sum + frame.width * frame.height * 4, 0), concurrency: 1, mode: 'coalesced',
      onFrame({ bitmap, index }) {
        // Normalize once on decode. No image reads, allocations or texture
        // uploads occur during pointer movement; all five poses are prepared.
        pixels.clearRect(0, 0, staging.width, staging.height); pixels.drawImage(bitmap, 0, 0, staging.width, staging.height);
        sources[names[index]] = pixels.getImageData(0, 0, staging.width, staging.height);
        if (index === 0) {
          base.clearRect(0, 0, canvas.width, canvas.height); base.drawImage(staging, 0, 0);
          base.globalCompositeOperation = 'destination-out'; base.drawImage(mask, 0, 0); base.globalCompositeOperation = 'source-over';
        }
        if (index < frames.length - 1) source.setFrame(index + 1);
        else if (renderer.prepare(sources)) {
          source.dispose(); source = null;
          ready = true; schedule();
        }
        else { failed = true; stop(); }
      }, onError() { failed = true; stop(); },
    });
    source.setFrame(0); source.setActive(true);
  }
  wrapper.addEventListener('pointermove', event => {
    if (!active || event.pointerType !== 'mouse') return;
    pointer = { x: event.clientX, y: event.clientY }; schedule();
  }, { passive: true, signal });
  wrapper.addEventListener('pointerleave', () => { pointer = null; schedule(); }, { signal });
  const stopInView = observeInView(wrapper, value => { visible = value; state(); }, { window, firstEntry: true });
  document.addEventListener('visibilitychange', state, { signal });
  fine.addEventListener('change', state, { signal });
  preference.onMotionChange(state, { signal });
  window.addEventListener('beforeprint', () => { printing = true; state(); }, { signal });
  window.addEventListener('afterprint', () => { printing = false; state(); }, { signal });
  window.addEventListener('pagehide', () => { away = true; state(); }, { signal });
  window.addEventListener('pageshow', () => { away = false; state(); }, { signal });
  window.addEventListener('resize', schedule, { passive: true, signal });
  return () => {
    disposed = true; stop(); animation.dispose(); stopInView(); lifecycle.abort(); canvas.remove();
    if (originalReady !== null) wrapper.setAttribute('data-ambient-ready', originalReady);
  };
}
