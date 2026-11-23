import { canvasSize } from './canvas-size.js';
// A single registered surface keeps facial contours coherent through a turn.
// Cache the tonal field and four character phases; animation only projects them.
export function createPortraitGlyphs() {
  const sample = document.createElement('canvas');
  const sampling = sample.getContext('2d', { willReadFrequently: true });
  const ink = document.createElement('canvas');
  const inkContext = ink.getContext('2d');
  let cache = new WeakMap(), signature = '';
  const alphabet = ' .:oS%#@';
  let sampledPlate = null, sampledContext = null, lastSample = null, sampleKey = '', sampleBucket = -1;
  let atlas = null, atlasKey = '', atlasTile = 0;
  function glyphAtlas(material) {
    const key = JSON.stringify([material.color, material.font, material.cell, material.ratio]);
    if (atlas && key === atlasKey) return true;
    atlas ??= document.createElement('canvas');
    atlasTile = Math.ceil(material.cell * material.ratio * 2);
    atlas.width = atlasTile * alphabet.length; atlas.height = atlasTile;
    const context = atlas.getContext('2d');
    if (!context) return false;
    context.font = `${material.cell * material.ratio}px ${material.font}`;
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = material.color;
    for (let index = 1; index < alphabet.length; index++) {
      context.fillText(alphabet[index], (index + .5) * atlasTile, atlasTile / 2);
    }
    atlasKey = key;
    return true;
  }
  // Samples are immutable snapshots. Only the last pose/phase plate is retained;
  // staggered cell groups change glyphs without changing the underlying tone.
  function drawSample(context, source, rect, material, phase = 0) {
    if (!source || !Number.isInteger(source.width) || source.width < 1 ||
        !Number.isInteger(source.height) || source.height < 1 ||
        source.data?.length !== source.width * source.height * 4 ||
        ![rect.width, rect.height, material.cell, material.ratio].every(value => Number.isFinite(value) && value > 0) ||
        !glyphAtlas(material)) return false;
    const bucket = Number.isFinite(phase) ? ((Math.floor(phase * 4) % 16) + 16) % 16 : 0;
    const key = JSON.stringify([rect.width, rect.height, material]);
    if (source !== lastSample || key !== sampleKey || bucket !== sampleBucket) {
      if (!sampledPlate) {
        sampledPlate = document.createElement('canvas'); sampledContext = sampledPlate.getContext('2d');
        if (!sampledContext) { sampledPlate = null; return false; }
      }
      const { width, height } = canvasSize(rect.width, rect.height, material.ratio, Math.ceil);
      if (sampledPlate.width !== width) sampledPlate.width = width;
      if (sampledPlate.height !== height) sampledPlate.height = height;
      sampledContext.setTransform(1, 0, 0, 1, 0, 0);
      sampledContext.clearRect(0, 0, width, height);
      sampledContext.setTransform(material.ratio, 0, 0, material.ratio, 0, 0);
      sampledContext.fillStyle = material.color;
      const frame = material.frame ?? { width: source.width, height: source.height, x: 0, y: 0,
        imageWidth: source.width, imageHeight: source.height };
      const cw = rect.width / source.width, ch = rect.height / source.height;
      const tile = atlasTile / material.ratio;
      for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
        const index = (y * source.width + x) * 4, alpha = source.data[index + 3] / 255;
        if (alpha < .08) continue;
        const luminance = (.2126 * source.data[index] + .7152 * source.data[index + 1] + .0722 * source.data[index + 2]) / 255;
        const density = material.dark ? luminance : 1 - luminance;
        const u = ((x + .5) / source.width * frame.width - frame.x) / frame.imageWidth;
        const v = ((y + .5) / source.height * frame.height - frame.y) / frame.imageHeight;
        const edge = Math.max(0, Math.min(1, u / material.bottomFade, (1 - u) / material.bottomFade));
        const fade = Math.max(0, Math.min(1, (1 - v) / material.bottomFade)) * edge;
        sampledContext.globalAlpha = alpha * fade * material.fill * density;
        sampledContext.fillRect(x * cw, y * ch, cw, ch);
        const localPhase = Math.floor((bucket + (x * 17 + y * 31) % 4) / 4) % 4;
        const variation = ((x * 17 + y * 31 + localPhase * (x % 3 + 1)) % 5) - 2;
        const level = Math.max(0, Math.min(alphabet.length - 1, Math.floor(density * alphabet.length) + variation));
        if (!level) continue;
        sampledContext.globalAlpha = alpha * fade * material.ink * density;
        sampledContext.drawImage(atlas, level * atlasTile, 0, atlasTile, atlasTile,
          (x + .5) * cw - tile / 2, (y + .5) * ch - tile / 2, tile, tile);
      }
      lastSample = source; sampleKey = key; sampleBucket = bucket;
    }
    context.save(); project(context, sampledPlate, rect); context.restore();
    return true;
  }
  function raster(image, width, height, material) {
    if (cache.has(image)) return cache.get(image);
    const columns = Math.max(1, Math.ceil(width / material.cell));
    const rows = Math.max(1, Math.ceil(height / material.cell));
    sample.width = columns; sample.height = rows;
    const frame = material.frame ?? { width: image.width, height: image.height, x: 0, y: 0, imageWidth: image.width, imageHeight: image.height };
    sampling.drawImage(image, frame.x / frame.width * columns, frame.y / frame.height * rows,
      frame.imageWidth / frame.width * columns, frame.imageHeight / frame.height * rows);
    const data = sampling.getImageData(0, 0, columns, rows).data;
    const plates = Array.from({ length: 5 }, () => {
      const canvas = document.createElement('canvas');
      const pixels = canvasSize(width, height, material.ratio, Math.ceil);
      canvas.width = pixels.width; canvas.height = pixels.height;
      const context = canvas.getContext('2d');
      context.scale(material.ratio, material.ratio);
      context.font = `${material.cell}px ${material.font}`;
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillStyle = material.color;
      return { canvas, context };
    });
    const cw = width / columns, ch = height / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const i = (y * columns + x) * 4, alpha = data[i + 3] / 255;
      if (alpha < .08) continue;
      const luminance = (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) / 255;
      const density = material.dark ? luminance : 1 - luminance;
      const u = ((x + .5) / columns * frame.width - frame.x) / frame.imageWidth;
      const v = ((y + .5) / rows * frame.height - frame.y) / frame.imageHeight;
      const edge = Math.max(0, Math.min(1, u / material.bottomFade, (1 - u) / material.bottomFade));
      const fade = Math.max(0, Math.min(1, (1 - v) / material.bottomFade)) * edge;
      plates[0].context.globalAlpha = alpha * fade * material.fill * density;
      plates[0].context.fillRect(x * cw, y * ch, cw, ch);
      for (let phase = 0; phase < 4; phase++) {
        const context = plates[phase + 1].context;
        const variation = ((x * 17 + y * 31 + phase * (x % 3 + 1)) % 5) - 2;
        const level = Math.max(0, Math.min(alphabet.length - 1, Math.floor(density * alphabet.length) + variation));
        context.globalAlpha = alpha * fade * material.ink * density;
        context.fillText(alphabet[level], (x + .5) * cw, (y + .5) * ch);
      }
    }
    const result = plates.map(plate => plate.canvas);
    cache.set(image, result);
    return result;
  }
  function project(context, plate, rect) {
    context.drawImage(plate, rect.x, rect.y, rect.width, rect.height);
  }
  return {
    drawSample,
    draw(context, image, rect, material, position = .5, phase = 0) {
      const key = JSON.stringify([rect.width, rect.height, material]);
      if (key !== signature) {
        signature = key; cache = new WeakMap();
        ink.width = Math.ceil(rect.width * material.ratio);
        ink.height = Math.ceil(rect.height * material.ratio);
      }
      const plates = raster(image, rect.width, rect.height, material);
      const index = Math.floor(phase) % 4, fraction = phase - Math.floor(phase);
      context.save();
      project(context, plates[0], rect);
      // Character phases share exactly the same silhouette and projection.
      // Mix premultiplied ink in isolation: matching pixels keep their opacity.
      inkContext.clearRect(0, 0, ink.width, ink.height);
      inkContext.globalCompositeOperation = 'source-over';
      inkContext.globalAlpha = 1 - fraction;
      inkContext.drawImage(plates[1 + index], 0, 0);
      inkContext.globalCompositeOperation = 'lighter';
      inkContext.globalAlpha = fraction;
      inkContext.drawImage(plates[1 + (index + 1) % 4], 0, 0);
      project(context, ink, rect);
      context.restore();
    },
  };
}
