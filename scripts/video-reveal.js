import { canvasSize } from './canvas-size.js';
import { createFrameLoop } from './frame-loop.js';
import { timeToken } from './css-time.js';
import { createRevealMask, revealSettings } from './surface-reveal.js';
import { createTypingReveal } from './typing-reveal.js';

export function videoRevealFrame(width, height, bounds, registration) {
  let scale = Math.max(bounds.width / width, bounds.height / height);
  let x = (bounds.width - width * scale) / 2, y = (bounds.height - height * scale) / 2;
  if (registration) {
    const { sourceX, sourceY, targetX, targetY } = registration;
    if ([sourceX, sourceY, targetX, targetY].every(Number.isFinite)
        && sourceX > 0 && sourceX < 1 && sourceY > 0 && sourceY < 1
        && targetX >= 0 && targetX <= bounds.width && targetY >= 0 && targetY <= bounds.height) {
      // Keep the supplied subject on its layout anchor while covering every edge.
      // Unlike object-position, this also holds when the aspect ratio changes.
      scale = Math.max(targetX / (width * sourceX), (bounds.width - targetX) / (width * (1 - sourceX)),
        targetY / (height * sourceY), (bounds.height - targetY) / (height * (1 - sourceY)));
      x = targetX - width * sourceX * scale;
      y = targetY - height * sourceY * scale;
    }
  }
  return { x, y, width: width * scale, height: height * scale };
}

// The ambient film supplies eligibility and teardown; this adds no observer or
// competing playback policy.
export function mountVideoReveal({ element, wrapper, signal, source, titles = [], registration, treatment = 'natural' }) {
  const style = getComputedStyle(wrapper);
  const typing = createTypingReveal(Array.from(titles), {
    duration: timeToken(style, '--motion-typing-reveal-duration'),
    feather: timeToken(style, '--duration-feedback'),
  });
  let url;
  try { url = new URL(typeof source === 'string' ? source : source?.href, document.baseURI); } catch { /* no reveal media */ }
  const settings = revealSettings(style);
  const mask = url && ['http:', 'https:'].includes(url.protocol) && source
    ? createRevealMask(settings) : null;
  const canvas = mask ? document.createElement('canvas') : null;
  const context = canvas?.getContext('2d');
  // Sample live frames on the same fine grid as the aperture, then enlarge the
  // cells without interpolation. The source remains a video, not a still plate.
  const raster = context && treatment === 'monochrome' ? document.createElement('canvas') : null;
  const sampling = raster?.getContext('2d', { willReadFrequently: true });
  const paletteStyle = sampling ? getComputedStyle(document.documentElement) : null;
  let paletteKey = '', tones = null;
  function filmTones() {
    const colors = ['--color-paper', '--color-ink'].map(name => paletteStyle.getPropertyValue(name).trim());
    const key = colors.join('|');
    if (key !== paletteKey) {
      sampling.filter = 'none';
      tones = colors.map(color => {
        sampling.clearRect(0, 0, 1, 1);
        sampling.fillStyle = color; sampling.fillRect(0, 0, 1, 1);
        return [...sampling.getImageData(0, 0, 1, 1).data].slice(0, 3);
      }).sort((a, b) => luminance(a) - luminance(b));
      paletteKey = key;
    }
    return tones;
  }
  const video = context ? document.createElement('video') : null;
  let active = false, loaded = false, ready = false, failed = false, disposed = false;
  let point = null, bounds = null, attempt = null, revision = 0;
  let releaseTimer = null;
  // Direct navigation is always expanded. Only the compact directory overlays
  // the scene and suspends pointer interaction.
  const menuOpen = () => document.querySelector('.frame__header[data-navigation-mode="compact"] .frame__menu[aria-expanded="true"]');
  if (video) {
    video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true;
    video.preload = 'none';
    canvas.className = 'ambient-reveal'; canvas.setAttribute('aria-hidden', 'true');
    element.append(canvas);
  }
  const animation = createFrameLoop(draw, { window, eligible: () => active && ready && point });
  const cancelFrame = animation.cancel;
  function clear() {
    clearTimeout(releaseTimer); releaseTimer = null;
    point = null; mask?.reset(); cancelFrame();
    if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    revision++; attempt = null; ready = false; video?.pause();
  }
  function unload() {
    clear();
    if (loaded) { loaded = false; video.removeAttribute('src'); video.load(); }
  }
  function draw(now) {
    if (!active || !ready || !point || disposed) return;
    if (menuOpen()) { clear(); return; }
    const pixels = canvasSize(bounds.width, bounds.height, 1, Math.ceil);
    if (canvas.width !== pixels.width || canvas.height !== pixels.height) {
      canvas.width = pixels.width; canvas.height = pixels.height;
    }
    const aperture = mask.aperture(bounds, now);
    if (aperture && video.videoWidth && video.videoHeight) {
      try {
        const placement = videoRevealFrame(video.videoWidth, video.videoHeight, bounds, registration?.(bounds));
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (sampling) {
          const width = Math.ceil(bounds.width / settings.cell), height = Math.ceil(bounds.height / settings.cell);
          if (raster.width !== width || raster.height !== height) { raster.width = width; raster.height = height; }
          const [shadow, highlight] = filmTones();
          sampling.clearRect(0, 0, width, height);
          sampling.filter = 'grayscale(1)';
          sampling.drawImage(video, placement.x * width / bounds.width, placement.y * height / bounds.height,
            placement.width * width / bounds.width, placement.height * height / bounds.height);
          const pixels = sampling.getImageData(0, 0, width, height);
          toneFilmPixels(pixels.data, shadow, highlight);
          sampling.putImageData(pixels, 0, 0);
          context.imageSmoothingEnabled = false;
          context.drawImage(raster, 0, 0, canvas.width, canvas.height);
        } else context.drawImage(video, placement.x, placement.y, placement.width, placement.height);
        context.save(); context.globalCompositeOperation = 'destination-in';
        context.drawImage(aperture, 0, 0); context.restore();
      } catch { failed = true; unload(); return; }
    }
    return true;
  }
  const schedule = animation.request;
  function play() {
    if (!video || failed || !active || disposed) return;
    if (!loaded) { loaded = true; video.src = url.href; video.load(); }
    if (ready) { schedule(); return; }
    if (attempt !== null) return;
    const current = ++revision; attempt = current;
    try {
      Promise.resolve(video.play()).catch(() => {
        if (disposed || current !== revision) return;
        failed = true; unload();
      });
    } catch { failed = true; unload(); }
  }
  function pointAt(event, pulse = false) {
    if (!active || !video || failed) return;
    if (event.target.closest('a,button,input,select,textarea,summary,[role="button"]')) { clear(); return; }
    if (menuOpen()) { clear(); return; }
    bounds = wrapper.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    clearTimeout(releaseTimer); releaseTimer = null;
    if (pulse) mask.pulse(point.x, point.y, performance.now());
    else mask.point(point.x, point.y);
    play();
  }
  if (video) {
    video.addEventListener('playing', () => {
      if (!active || !point || disposed) { clear(); return; }
      attempt = null; ready = true; schedule();
    }, { signal });
    video.addEventListener('error', () => { failed = true; unload(); }, { signal });
    wrapper.addEventListener('pointermove', event => {
      if (event.pointerType !== 'touch') pointAt(event);
    }, { signal, passive: true });
    wrapper.addEventListener('pointerdown', event => pointAt(event, true), { signal, passive: true });
    wrapper.addEventListener('pointerup', event => {
      if (event.pointerType !== 'mouse' && point) {
        // Let a tap's wave be visible after release, bounded by the same wave life.
        mask.pulse(point.x, point.y, performance.now());
        releaseTimer = setTimeout(clear, settings.life * 1000);
      }
    }, { signal });
    wrapper.addEventListener('pointerleave', event => {
      if (event.pointerType !== 'touch' || releaseTimer === null) clear();
    }, { signal });
    wrapper.addEventListener('pointercancel', clear, { signal });
    window.addEventListener('resize', clear, { signal });
    window.addEventListener('scroll', clear, { signal, passive: true });
  }
  return {
    update(state) {
      if (disposed) return;
      // Readable text is never dependent on the optional film or a play promise.
      if (!state.motion) typing.finish();
      else if (state.animate) typing.start();
      active = state.active;
      if (state.unload) unload();
      else if (!active) clear();
    },
    destroy() {
      disposed = true; unload(); animation.dispose(); typing.destroy(); canvas?.remove();
      if (raster) { raster.width = 0; raster.height = 0; }
    },
  };
}

const luminance = rgb => rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;

// Map the sampled monochrome frame to the world's tonal range. Sorting the
// endpoints preserves photographic light in both modes instead of inverting it.
export function toneFilmPixels(data, shadow, highlight) {
  for (let i = 0; i < data.length; i += 4) {
    const light = data[i] / 255;
    for (let channel = 0; channel < 3; channel++) {
      data[i + channel] = shadow[channel] + (highlight[channel] - shadow[channel]) * light;
    }
  }
}
