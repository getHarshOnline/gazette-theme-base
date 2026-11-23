import { createRevealMask, revealSettings } from './surface-reveal.js';

export function registeredFigure(rect, image, registration) {
  const a = registration.portraitAnchor, b = registration.characterAnchor;
  const scale = rect.width * a.span / (image.width * b.span);
  return { x: rect.x + rect.width * a.x - image.width * b.x * scale,
    y: rect.y + rect.height * a.y - image.height * b.y * scale,
    width: image.width * scale, height: image.height * scale };
}

// Portrait registration is independent of the shared scene-space aperture.
export function createPortraitReveal(model, style) {
  if (!model.reveal) return null;
  const settings = revealSettings(style);
  if (!settings) return null;
  const under = document.createElement('canvas');
  const u = under.getContext('2d');
  if (!u) return null;
  const reveal = createRevealMask(settings);
  if (!reveal) return null;
  return {
    ...reveal,
    // rect is in the foreground canvas; reg is the same portrait rectangle in
    // scene coordinates. The caller retains its CSS-pixel/pixel-ratio transform.
    applyPortraitMask(context, rect, bounds, now, reg = rect) {
      if (!context || ![rect.x, rect.y, rect.width, rect.height, reg.x, reg.y, reg.width, reg.height].every(Number.isFinite)
          || rect.width <= 0 || rect.height <= 0 || reg.width <= 0 || reg.height <= 0) return false;
      const image = reveal.aperture(bounds, now);
      if (!image) return false;
      const scaleX = rect.width / reg.width, scaleY = rect.height / reg.height;
      context.save();
      context.globalCompositeOperation = 'destination-out';
      context.globalAlpha = 1;
      context.drawImage(image, rect.x - reg.x * scaleX, rect.y - reg.y * scaleY,
        image.width * scaleX, image.height * scaleY);
      context.restore();
      return true;
    },
    draw(context, assets, rect, bounds, now) {
      if (!assets.world || !assets.character) return;
      context.clearRect(0, 0, bounds.width, bounds.height);
      const image = reveal.aperture(bounds, now);
      if (!image) return;
      if (under.width !== image.width) under.width = image.width;
      if (under.height !== image.height) under.height = image.height;
      u.clearRect(0, 0, under.width, under.height);
      const worldScale = Math.max(bounds.width / assets.world.width, bounds.height / assets.world.height);
      u.drawImage(assets.world, (bounds.width - assets.world.width * worldScale) / 2,
        (bounds.height - assets.world.height * worldScale) / 2,
        assets.world.width * worldScale, assets.world.height * worldScale);
      const figure = registeredFigure(rect, assets.character, model.reveal);
      u.drawImage(assets.character, figure.x, figure.y, figure.width, figure.height);
      u.save(); u.globalCompositeOperation = 'destination-in'; u.drawImage(image, 0, 0); u.restore();
      context.drawImage(under, 0, 0);
    },
  };
}
