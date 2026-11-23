import { canvasSize } from './canvas-size.js';
import { createFrameLoop } from './frame-loop.js';
import { observeInView } from './in-view.js';
import { timeToken } from './css-time.js';
import { motionPreference } from './motion-preference.js';
import { mountRevealRail } from './reveal-rail.js';
import { ContinuousGaze, gazeFrame, gazeLayout, gazeLoadOrder } from './continuous-gaze.js';
import { createPortraitGlyphs } from './portrait-glyphs.js';
import { createPortraitReveal } from './portrait-reveal.js';
import { samplePose } from './portrait-poses.js';
import { createPortraitGPU } from './portrait-gpu.js';
import { createTypingReveal } from './typing-reveal.js';
import { mountPortraitCopy } from './portrait-copy.js';

export function mountContinuousPortrait(wrapper, model, resources = []) {
  const stage = wrapper.querySelector('.portrait-stage');
  const sceneElement = stage?.closest('[data-portrait-scene]') ?? wrapper;
  const still = stage?.querySelector('img');
  const copy = wrapper.querySelector('.encounter-copy');
  const releaseCopy = mountPortraitCopy(copy, sceneElement);
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const lifecycle = new AbortController();
  const dark = () => document.documentElement.dataset.mode === 'dark'
    || (document.documentElement.dataset.mode !== 'light' && scheme.matches);
  const resourceUrls = new Map(resources.filter(resource => resource.rendition_of)
    .map(resource => [new URL(resource.rendition_of, location.href).href, resource.url]));
  const sourcePath = (source, mode = dark() ? 'dark' : 'light') => {
    if (typeof source === 'string') return source && (resourceUrls.get(new URL(source, location.href).href) ?? source);
    return sourcePath(source?.[mode] ?? source?.light ?? '', mode);
  };
  function updateStills() {
    const mode = dark() ? 'dark' : 'light';
    for (const image of wrapper.querySelectorAll('img')) {
      // Gazette's dark source already follows the reader's mode. Changing this
      // image would only compete with the browser's choice of that source.
      if (image.closest?.('picture')?.querySelector(':scope > source[data-gazette-image-mode]')) continue;
      const url = new URL(image.src, location.href).href;
      const binding = model.stills?.find(item => [item.light, item.dark].some(source => {
        return [source, sourcePath(source)].some(candidate => typeof candidate === 'string'
          && candidate && new URL(candidate, location.href).href === url);
      }));
      const next = binding && sourcePath(binding, mode);
      if (!next) continue;
      // A source set outranks src, so the swap replaces both. The original
      // candidates return with the original rendition.
      if (image.hasAttribute?.('srcset')) {
        image.dataset.portraitSrcset ??= image.getAttribute('srcset');
        image.dataset.portraitSrc ??= image.getAttribute('src');
        const original = new URL(image.dataset.portraitSrc, location.href).href === new URL(next, location.href).href;
        image.setAttribute('srcset', original ? image.dataset.portraitSrcset : next);
      }
      image.src = next;
    }
  }
  let repaint = () => {};
  const appearance = new MutationObserver(() => { updateStills(); repaint(); });
  appearance.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
  scheme.addEventListener('change', () => { updateStills(); repaint(); }, { signal: lifecycle.signal });
  const releaseAppearance = () => { appearance.disconnect(); lifecycle.abort(); releaseCopy(); };
  updateStills();
  if (!still || !window.createImageBitmap || !window.IntersectionObserver || !window.ResizeObserver) return releaseAppearance;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: Boolean(model.glyphs) });
  if (!context) return releaseAppearance;
  canvas.className = 'portrait-canvas';
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', still.alt);
  stage.append(canvas);
  const style = getComputedStyle(wrapper);
  const glyphs = model.glyphs ? createPortraitGlyphs() : null;
  const reveal = createPortraitReveal(model, style);
  const revealCanvas = reveal ? document.createElement('canvas') : null;
  const revealContext = revealCanvas?.getContext('2d');
  if (revealCanvas) {
    revealCanvas.className = 'portrait-reveal-canvas';
    revealCanvas.setAttribute('aria-hidden', 'true');
    sceneElement.append(revealCanvas);
  }
  const material = () => ({
    cell: Number.parseFloat(style.getPropertyValue('--layout-portrait-cell')),
    fill: Number.parseFloat(style.getPropertyValue('--material-portrait-cell-fill-share')),
    ink: Number.parseFloat(style.getPropertyValue('--material-portrait-ink-share')),
    bottomFade: Number.parseFloat(style.getPropertyValue('--material-portrait-bottom-fade')),
    font: style.getPropertyValue('--type-family-system').trim(),
    color: style.getPropertyValue('--color-ink').trim(),
    dark: dark(),
    ratio: pixelRatio,
    frame: model.sourceFrame,
  });
  const physics = {};
  const durationKeys = new Set(['idle-after', 'idle-ramp', 'look-travel-first', 'look-hold-first',
    'look-travel-second', 'look-hold-second', 'look-return']);
  for (const key of ['tracking-rate', 'idle-rate', 'script-rate', 'parallax-rate', 'idle-after',
    'idle-ramp', 'idle-major-amplitude', 'idle-minor-amplitude', 'idle-major-frequency',
    'idle-minor-frequency', 'idle-phase', 'pointer-margin', 'head-clamp', 'step-limit',
    'parallax-x', 'parallax-y', 'overscan', 'look-travel-first', 'look-hold-first',
    'look-travel-second', 'look-hold-second', 'look-return']) {
    const token = `--gaze-${key}`;
    const value = key === 'step-limit' ? timeToken(style, token) / 1000
      : durationKeys.has(key) ? timeToken(style, token)
        : Number.parseFloat(style.getPropertyValue(token));
    if (!Number.isFinite(value)) { canvas.remove(); revealCanvas?.remove(); return releaseAppearance; }
    physics[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  const engine = new ContinuousGaze(physics);
  const gpu = model.glyphs && model.poses ? createPortraitGPU(model.poses) : null;
  const typing = model.introTyping ? createTypingReveal(copy?.querySelector('p'), {
    duration: timeToken(style, '--motion-typing-reveal-duration'),
    feather: timeToken(style, '--duration-feedback'),
  }) : null;
  const preference = motionPreference(document);
  let inView = false, printing = false, disposed = false, active = false;
  let session = null, layout = null, size = null, lastFrame = null, pixelRatio = 1, phase = 0;
  let poseKey = '', posedSample = null;
  let touchReleased = false, releaseTimer = null;
  const cycle = timeToken(style, '--motion-portrait-glyph-cycle');
  const animation = createFrameLoop(loop, { window, eligible: () => active });

  function clearRelease() {
    clearTimeout(releaseTimer); releaseTimer = null; touchReleased = false;
  }
  function pulse(x, y) {
    reveal?.pulse(x, y, performance.now());
    if (touchReleased) releaseTimer = setTimeout(leave, timeToken(style, '--motion-portrait-reveal-life'));
  }

  function clearSession() {
    clearRelease();
    session?.controller.abort();
    if (session) for (const image of session.bitmaps) image.close();
    reveal?.reset();
    copy?.style.removeProperty('--portrait-copy-opacity');
    gpu?.reset();
    poseKey = ''; posedSample = null;
    session = null;
  }
  function nearest(index) {
    const images = session?.images;
    if (!images) return null;
    for (let distance = 0; distance < images.length; distance++) {
      if (images[index - distance]) return images[index - distance];
      if (images[index + distance]) return images[index + distance];
    }
    return null;
  }
  function draw(force = false) {
    if (!active || !session || !layout || !size) return;
    const frame = gazeFrame(engine.value, model.curve, model.inverseWeight);
    if (!glyphs && !force && frame === lastFrame) return;
    const lower = Math.floor(frame), fraction = frame - lower;
    const first = nearest(lower);
    if (!first) return;
    lastFrame = frame;
    const w = model.width * layout.scale, h = model.height * layout.scale;
    // Gaze changes registered facial geometry; parallax only positions the pair.
    const rect = { x: layout.x - engine.parallax.x * physics.parallaxX,
      y: layout.y - engine.parallax.y * physics.parallaxY, width: w, height: h };
    context.globalAlpha = 1;
    const second = nearest(Math.min(lower + 1, model.curve.length - 1));
    if (glyphs) {
      context.clearRect(0, 0, size.width, size.height);
      const paint = material();
      const x = engine.value * 2 - 1, y = engine.softY * 2 - 1;
      const rendered = gpu?.draw(context, session.poses, rect, paint, x, y, phase);
      if (!rendered) {
        if (model.poses && session.poses.front) {
          const width = Math.max(1, Math.ceil(w / paint.cell));
          const height = Math.max(1, Math.ceil(h / paint.cell));
          const sampledX = Math.round(x * 48) / 48, sampledY = Math.round(y * 48) / 48;
          const key = `${sampledX}:${sampledY}:${width}:${height}:${session.poseRevision}`;
          if (poseKey !== key) {
            posedSample = samplePose(model.poses, session.poses, { x: sampledX, y: sampledY, width, height });
            poseKey = key;
          }
        }
        if (!posedSample || !glyphs.drawSample(context, posedSample, rect, paint, phase)) {
          glyphs.draw(context, first, rect, paint, engine.value, phase);
        }
      }
      if (revealContext) {
        const scene = sceneElement.getBoundingClientRect(), image = stage.getBoundingClientRect();
        const registered = { ...rect, x: rect.x + image.left - scene.left, y: rect.y + image.top - scene.top };
        const bounds = { width: scene.width, height: scene.height }, now = performance.now();
        reveal.draw(revealContext, session.reveal, registered, bounds, now);
        if (copy) {
          const text = copy.getBoundingClientRect();
          const overlap = session.reveal.world && session.reveal.character ? reveal.obscures({
            x: text.left - scene.left, y: text.top - scene.top, width: text.width, height: text.height,
          }, now) : 0;
          copy.style.setProperty('--portrait-copy-opacity', String(1 - overlap));
        }
        if (session.reveal.world && session.reveal.character) {
          reveal.applyPortraitMask(context, rect, bounds, now, registered);
        }
      }
    } else {
      context.fillStyle = model.edgeColor;
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(first, layout.x, layout.y, w, h);
    }
    if (!glyphs && second && second !== first && fraction > 0) {
      context.globalAlpha = fraction;
      context.drawImage(second, layout.x, layout.y, w, h);
      context.globalAlpha = 1;
    }
    if (!glyphs && layout.portrait && layout.y > 0) {
      const fade = context.createLinearGradient(0, layout.y, 0, layout.y + h * model.geometry.edgeFade);
      fade.addColorStop(0, model.edgeColor); fade.addColorStop(1, `${model.edgeColor}00`);
      context.fillStyle = fade;
      context.fillRect(0, layout.y, size.width, h * model.geometry.edgeFade);
    }
    wrapper.classList.add('portrait-ready');
  }
  function resize() {
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    // Pointer coordinates belong to the previous scene dimensions.
    clearRelease();
    reveal?.reset();
    if (session) session.pendingPulse = null;
    copy?.style.removeProperty('--portrait-copy-opacity');
    size = { width: bounds.width, height: bounds.height };
    const copyBottom = copy ? Math.max(0, copy.getBoundingClientRect().bottom - bounds.top) : 0;
    layout = gazeLayout(size.width, size.height, model, copyBottom);
    const ratio = pixelRatio = Math.min(devicePixelRatio || 1, glyphs ? Infinity : 1 / layout.scale,
      Number.parseFloat(style.getPropertyValue('--island-pixel-ratio-max')));
    const pixels = canvasSize(size.width, size.height, ratio);
    canvas.width = pixels.width; canvas.height = pixels.height;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    if (revealCanvas && revealContext) {
      const scene = sceneElement.getBoundingClientRect();
      const pixels = canvasSize(scene.width, scene.height, ratio);
      revealCanvas.width = pixels.width; revealCanvas.height = pixels.height;
      revealContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    draw(true);
  }
  function loop(now) {
    if (!active) return;
    phase = Number.isFinite(cycle) && cycle > 0 ? now / cycle : 0;
    engine.tick(now); draw();
    return true;
  }
  async function load(current) {
    const mode = dark() ? 'dark' : 'light';
    // Let the complete resting portrait arrive before decorative decodes compete
    // for the connection. A failed still must not disable the enhancement.
    try { await still.decode?.(); } catch { /* The canvas can still recover. */ }
    if (current !== session || current.controller.signal.aborted) return;
    const need = model.width * layout.scale * Math.min(devicePixelRatio || 1,
      Number.parseFloat(style.getPropertyValue('--island-pixel-ratio-max')));
    const variant = model.variants.find(item => item.width >= need) ?? model.variants.at(-1);
    // One queue bounds fetch/decode work across frames, poses and reveal art.
    // Shared source paths (notably the front pose) are decoded once.
    const sources = new Map();
    const request = (path, receive) => {
      if (!path) return;
      if (!sources.has(path)) sources.set(path, []);
      sources.get(path).push(receive);
    };
    let loaded = 0;
    for (const index of gazeLoadOrder(model.curve.length)) {
      request(sourcePath(variant.frames[index], mode), bitmap => { current.images[index] = bitmap; loaded++; });
    }
    for (const [key, path] of Object.entries(model.poses?.frames ?? {})) {
      request(sourcePath(path, mode), bitmap => {
        const source = document.createElement('canvas');
        source.width = model.width; source.height = model.height;
        const pixels = source.getContext('2d', { willReadFrequently: true });
        if (!pixels) return;
        pixels.drawImage(bitmap, 0, 0, source.width, source.height);
        current.poses[key] = pixels.getImageData(0, 0, source.width, source.height);
        current.poseRevision++;
      });
    }
    await decodeSources(current, sources);
    if (current === session && !loaded) stop();
  }
  async function decodeSources(current, sources) {
    const jobs = [...sources];
    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length && !current.controller.signal.aborted) {
        const [path, receivers] = jobs[cursor++];
        try {
          const cached = current.decoded.get(path);
          if (cached) {
            for (const receive of receivers) receive(cached);
            draw(true);
            continue;
          }
          const response = await fetch(path, { signal: current.controller.signal });
          if (!response.ok) continue;
          const bitmap = await createImageBitmap(await response.blob());
          if (current !== session || current.controller.signal.aborted) { bitmap.close(); return; }
          current.bitmaps.add(bitmap);
          current.decoded.set(path, bitmap);
          for (const receive of receivers) receive(bitmap);
          draw(true);
        } catch { /* Retain the still when an optional source cannot be decoded. */ }
      }
    };
    await Promise.all(Array.from({ length: model.decodeConcurrency }, worker));
  }
  async function loadReveal(current) {
    // Reveal art is only used after attention enters the scene. Keep it behind
    // the portrait queue, with the same cancellation and decode ceiling.
    await current.loaded;
    if (current !== session || current.controller.signal.aborted) return;
    const sources = new Map();
    for (const key of ['world', 'character']) {
      const path = sourcePath(model.reveal?.[key]);
      if (!path) continue;
      if (!sources.has(path)) sources.set(path, []);
      sources.get(path).push(bitmap => { current.reveal[key] = bitmap; });
    }
    await decodeSources(current, sources);
    if (current === session && current.pendingPulse && current.reveal.world && current.reveal.character) {
      pulse(current.pendingPulse.x, current.pendingPulse.y);
      current.pendingPulse = null;
    }
  }
  function stop() {
    active = false; animation.cancel();
    typing?.finish();
    clearSession(); engine.reset(); lastFrame = null;
    wrapper.classList.remove('portrait-ready');
    revealContext?.clearRect(0, 0, revealCanvas.width, revealCanvas.height);
    canvas.style.removeProperty('transform');
  }
  function state() {
    const motion = !preference.reduced();
    const next = !disposed && !printing && inView && !document.hidden && motion;
    if (next === active) return;
    if (!next) { stop(); return; }
    active = true; resize(); typing?.start();
    session = { controller: new AbortController(), images: new Array(model.curve.length), reveal: {}, poses: {}, poseRevision: 0, bitmaps: new Set(), decoded: new Map() };
    session.loaded = load(session); animation.request();
  }
  const stopInView = observeInView(wrapper, value => { inView = value; state(); }, { window, firstEntry: true });
  const sizing = new ResizeObserver(resize); sizing.observe(wrapper); sizing.observe(stage); if (copy) sizing.observe(copy);
  repaint = () => {
    // A mode may select different source pixels on the same registered geometry.
    // Retire the entire prior decode session so late images cannot cross modes.
    if (active) { stop(); state(); }
  };
  const point = (event, releasedTouch = false) => {
    if (!active || !layout) return;
    clearRelease(); touchReleased = releasedTouch;
    const bounds = stage.getBoundingClientRect(), scene = sceneElement.getBoundingClientRect();
    if (event.clientX < scene.left || event.clientX > scene.right || event.clientY < scene.top || event.clientY > scene.bottom) {
      leave(); return;
    }
    if (!copy?.contains(document.activeElement) && !event.target.closest?.('a,button,input,summary,nav,.frame__header')) {
      if (session && !session.revealLoading) {
        session.revealLoading = true;
        void loadReveal(session);
      }
      const x = event.clientX - scene.left, y = event.clientY - scene.top;
      if (event.type === 'pointerdown' || releasedTouch) {
        if (session?.reveal.world && session?.reveal.character) pulse(x, y);
        else if (session) session.pendingPulse = { x, y };
      } else {
        if (session) session.pendingPulse = null;
        reveal?.point(x, y);
      }
    }
    else leave();
    engine.point((event.clientX - bounds.left) / bounds.width,
      (event.clientY - bounds.top) / bounds.height,
      (layout.x + model.geometry.noseX * layout.scale) / bounds.width, performance.now());
  };
  const rail = sceneElement.querySelector?.('[data-reveal-rail]');
  if (rail) mountRevealRail(rail, { signal: lifecycle.signal, motionAllowed: () => active });
  addEventListener('pointermove', point, { passive: true, signal: lifecycle.signal });
  sceneElement.addEventListener('pointerdown', point, { passive: true, signal: lifecycle.signal });
  sceneElement.addEventListener('pointerup', event => {
    if (event.pointerType === 'touch') point(event, true);
  }, { passive: true, signal: lifecycle.signal });
  function leave() {
    clearRelease();
    if (session) session.pendingPulse = null;
    reveal?.leave();
  }
  const pointerLeave = event => {
    // A completed tap leaves the hover surface immediately. Keep its wave until
    // the existing lifetime expires, including when pixels are still loading.
    if (event.pointerType !== 'touch' || !touchReleased) leave();
  };
  sceneElement.addEventListener('pointerleave', pointerLeave, { signal: lifecycle.signal });
  document.addEventListener('pointerleave', pointerLeave, { signal: lifecycle.signal });
  document.addEventListener('focusin', leave, { signal: lifecycle.signal });
  addEventListener('scroll', leave, { passive: true, signal: lifecycle.signal });
  addEventListener('pointercancel', leave, { signal: lifecycle.signal });
  addEventListener('blur', leave, { signal: lifecycle.signal });
  document.addEventListener('visibilitychange', state, { signal: lifecycle.signal });
  preference.onMotionChange(state, { signal: lifecycle.signal });
  addEventListener('beforeprint', () => { printing = true; state(); }, { signal: lifecycle.signal });
  addEventListener('afterprint', () => { printing = false; state(); }, { signal: lifecycle.signal });
  addEventListener('pagehide', () => { inView = false; state(); }, { signal: lifecycle.signal });
  addEventListener('pageshow', () => {
    const bounds = wrapper.getBoundingClientRect(); inView = bounds.bottom > 0 && bounds.top < innerHeight; state();
  }, { signal: lifecycle.signal });
  return () => { disposed = true; stop(); animation.dispose(); typing?.destroy(); gpu?.destroy(); releaseAppearance(); stopInView(); sizing.disconnect(); canvas.remove(); revealCanvas?.remove(); };
}
