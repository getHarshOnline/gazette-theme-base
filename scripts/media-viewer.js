// Offer a larger view only for an image Gazette's Markdown renderer listed for
// this page, once it has loaded from that destination and has supplied alt text,
// and only when the view can be larger: a scalable drawing fills the wide media
// shell, while a raster image has more pixels than its inline rendering shows.
const scalable = url => /\.svg(?:[?#]|$)/i.test(url);
export function mountMediaViewer(tenant, open, focusTitle) {
  const figure = tenant?.querySelector('.media-viewer');
  const caption = tenant?.querySelector('figcaption');
  const viewport = tenant?.querySelector('.media-viewer__viewport');
  const enlarge = tenant?.querySelector('[data-media-size]');
  const fit = tenant?.querySelector('[data-media-fit]');
  const label = tenant?.getAttribute('data-media-expand');
  const article = document.querySelector('main');
  if (!figure || !caption || !label || !article) return null;
  let images;
  try { images = JSON.parse(tenant.querySelector('[data-media-images]')?.textContent || 'null'); } catch { return null; }
  if (!Array.isArray(images) || images.length > 10000) return null;
  const allowed = new Map();
  for (const image of images) {
    if (typeof image.address !== 'string' || typeof image.destination !== 'string' || typeof image.alt !== 'string') return null;
    if (allowed.has(image.address)) return null;
    allowed.set(image.address, image);
  }
  const image = document.createElement('img'); image.className = 'media-viewer__image';
  let selected = null, printing = false, active = false, moved = null, printFocus = null;
  let zoom = 0, fitWidth = 0, intrinsicWidth = 0, maxWidth = 0;
  const surface = viewport || figure;
  const sizingEnabled = Boolean(viewport && enlarge && fit);
  const originalSize = sizingEnabled ? ['--media-width', '--media-fit-height'].map(name => [name, surface.style.getPropertyValue(name)]) : [];
  const setSize = (name, value) => {
    if (surface.style.getPropertyValue(name) !== value) surface.style.setProperty(name, value);
  };
  const clearSize = () => {
    for (const [name, value] of originalSize) { if (value) setSize(name, value); else surface.style.removeProperty(name); }
  };
  const root = document.documentElement;
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  const print = window.matchMedia('print');
  const mode = () => {
    if (printing || print.matches) return 'default';
    const explicit = root.getAttribute('data-mode');
    if (explicit === 'light' || explicit === 'dark') return explicit;
    if (explicit === 'system') return scheme.matches ? 'dark' : 'light';
    // A world can start in one mode until the reader chooses System.
    const resolved = getComputedStyle(root).colorScheme.split(/\s+/);
    if (resolved.includes('dark') && !resolved.includes('light')) return 'dark';
    if (resolved.includes('light') && !resolved.includes('dark')) return 'light';
    return scheme.matches ? 'dark' : 'light';
  };
  const destination = proof => proof.variants?.[mode()] || proof.destination;
  const candidates = proof => proof.responsive?.[mode()] || proof.responsive?.default || [];
  const admitted = (proof, url) => [proof.destination, proof.variants?.light, proof.variants?.dark].includes(url);
  const sources = [];
  const authoredTabindex = tenant.getAttribute('tabindex');
  const nameScrollport = !tenant.getAttribute('aria-label') && !tenant.getAttribute('aria-labelledby');
  const scrollAccess = () => {
    if (authoredTabindex !== null) return;
    const overflows = active && tenant.clientHeight > 0 && tenant.scrollHeight > tenant.clientHeight + 1;
    if (overflows) {
      tenant.setAttribute('tabindex', '0');
      if (nameScrollport) tenant.setAttribute('aria-label', tenant.getAttribute('data-tenant-title') || label);
    } else {
      tenant.removeAttribute('tabindex');
      if (nameScrollport) tenant.removeAttribute('aria-label');
    }
  };
  const sizeView = () => {
    if (!sizingEnabled || !active || !selected || printing || print.matches) return;
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!(width > 0 && height > 0)) return;
    const scrollLeft = viewport.scrollLeft, scrollTop = viewport.scrollTop;
    const drawing = selected.drawing;
    const vectors = drawing ? [...drawing.querySelectorAll(':scope > svg')] : [];
    const vector = vectors.length === 1 ? vectors[0] : null;
    const viewBox = vector?.viewBox?.baseVal;
    const naturalWidth = viewBox?.width || image.naturalWidth || selected.width;
    const naturalHeight = viewBox?.height || image.naturalHeight || selected.height;
    const ratio = naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 0;
    const raster = !drawing && !scalable(destination(selected.proof));
    const outerStyle = getComputedStyle(drawing || image);
    const length = name => parseFloat(outerStyle[name]) || 0;
    const margins = length('marginBlockStart') + length('marginBlockEnd');
    // Image auto margins come from its current width, including negative
    // overflow after zoom. Only a live drawing can reserve authored margins.
    const inlineMargins = drawing ? Math.max(0, length('marginInlineStart')) + Math.max(0, length('marginInlineEnd')) : 0;
    const availableWidth = Math.max(1, width - inlineMargins);
    setSize('--media-width', raster && naturalWidth ? `${Math.min(availableWidth, naturalWidth)}px` : availableWidth === width ? '100%' : `${availableWidth}px`);
    setSize('--media-fit-height', 'none');
    // Other live content keeps its normal font and control sizes. Only the
    // drawing uses the space left after those controls have wrapped.
    const extra = vector ? Math.max(0, drawing.getBoundingClientRect().height - vector.getBoundingClientRect().height) : 0;
    const room = Math.max(1, height - extra - margins);
    fitWidth = ratio ? Math.min(availableWidth, room * ratio, raster ? naturalWidth : Infinity) : availableWidth;
    intrinsicWidth = naturalWidth || fitWidth;
    maxWidth = raster ? intrinsicWidth : Math.max(width, intrinsicWidth) * 8;
    if (!zoom) setSize('--media-fit-height', `${room}px`);
    else {
      const detail = Math.min(maxWidth, Math.max(intrinsicWidth, fitWidth * 2 ** zoom));
      setSize('--media-width', `${detail}px`);
    }
    const currentWidth = zoom ? Math.min(maxWidth, Math.max(intrinsicWidth, fitWidth * 2 ** zoom)) : fitWidth;
    enlarge.setAttribute('aria-disabled', String(currentWidth >= maxWidth));
    fit.setAttribute('aria-pressed', String(zoom === 0));
    if (zoom) { viewport.scrollLeft = scrollLeft; viewport.scrollTop = scrollTop; }
    const overflow = viewport.scrollWidth > width + 1 || viewport.scrollHeight > height + 1;
    if (overflow) {
      viewport.setAttribute('tabindex', '0');
      viewport.setAttribute('aria-label', tenant.getAttribute('data-tenant-title') || label);
    } else {
      viewport.removeAttribute('tabindex'); viewport.removeAttribute('aria-label');
    }
    scrollAccess();
  };
  image.addEventListener('load', () => { sizeView(); scrollAccess(); });
  let sizing;
  if (typeof ResizeObserver === 'function') {
    sizing = new ResizeObserver(() => { sizeView(); scrollAccess(); });
    sizing.observe(tenant); sizing.observe(figure);
    if (viewport) sizing.observe(viewport);
    sizing.observe(caption);
  }
  if (sizingEnabled) {
    enlarge.addEventListener('click', () => {
      if (!active || enlarge.getAttribute('aria-disabled') === 'true') return;
      zoom++; sizeView();
    });
    fit.addEventListener('click', () => {
      if (!active) return;
      zoom = 0; sizeView(); viewport.scrollLeft = 0; viewport.scrollTop = 0;
    });
  }
  const restoreDrawing = () => {
    if (!moved) return;
    const { node, placeholder, expanded } = moved;
    if (active && (printing || print.matches) && node.contains(document.activeElement)) printFocus = document.activeElement;
    sizing?.unobserve(node);
    placeholder.replaceWith(node);
    if (expanded === null) node.removeAttribute('data-media-expanded');
    else node.setAttribute('data-media-expanded', expanded);
    moved = null;
  };
  const showSelected = () => {
    if (selected.drawing) {
      if (printing || print.matches) { restoreDrawing(); clearSize(); return; }
      if (!moved) {
        const node = selected.drawing;
        const bounds = node.getBoundingClientRect(), style = getComputedStyle(node);
        const placeholder = document.createElement('span');
        placeholder.className = 'media-viewer-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.style.display = 'block';
        placeholder.style.width = `${bounds.width}px`;
        placeholder.style.height = `${bounds.height}px`;
        placeholder.style.marginBlockStart = style.marginBlockStart;
        placeholder.style.marginBlockEnd = style.marginBlockEnd;
        placeholder.style.marginInlineStart = style.marginInlineStart;
        placeholder.style.marginInlineEnd = style.marginInlineEnd;
        node.before(placeholder);
        moved = { node, placeholder, expanded: node.getAttribute('data-media-expanded') };
        node.setAttribute('data-media-expanded', '');
        if (viewport) viewport.append(node); else figure.insertBefore(node, caption);
        sizing?.observe(node);
        if (printFocus && node.contains(printFocus)) printFocus.focus({ preventScroll: true });
        printFocus = null;
      }
      return;
    }
    const url = destination(selected.proof);
    image.src = url; image.alt = selected.alt;
    if (scalable(url)) image.setAttribute('data-scalable', ''); else image.removeAttribute('data-scalable');
  };
  const sync = () => {
    for (const { source, proof } of sources) {
      if (admitted(proof, source.src)) {
        const next = destination(proof);
        if (proof.responsive) {
          const srcset = candidates(proof).map(({ url, width }) => `${url} ${width}w`).join(', ');
          if (source.getAttribute('sizes') !== proof.responsive.sizes) source.setAttribute('sizes', proof.responsive.sizes);
          if (source.getAttribute('srcset') !== srcset) source.setAttribute('srcset', srcset);
        }
        if (source.src !== next) source.src = next;
      }
    }
    if (active && selected) {
      showSelected();
      if (printing || print.matches) clearSize(); else sizeView();
    }
  };
  const visible = source => {
    const style = getComputedStyle(source);
    return !source.closest('[hidden],[inert],[aria-hidden="true"]') && source.getClientRects().length > 0 &&
      style.visibility !== 'hidden' && style.visibility !== 'collapse';
  };
  const showCaption = () => {
    // Reuse Gazette's rendered prose and MathML. Flattening semantics also
    // reads its hidden TeX annotation, duplicating the visible equation.
    const copy = selected.caption?.cloneNode(true);
    if (copy) {
      for (const node of copy.querySelectorAll('script,style,template,iframe,object,embed,form,button,input,select,textarea,details,summary,audio,video,canvas,svg')) node.remove();
      for (const node of [copy, ...copy.querySelectorAll('*')]) {
        for (const name of ['id', 'for', 'headers', 'list', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-details', 'aria-errormessage', 'autofocus', 'tabindex', 'contenteditable']) node.removeAttribute(name);
        for (const attribute of [...node.attributes]) if (attribute.name.toLowerCase().startsWith('on')) node.removeAttribute(attribute.name);
      }
    }
    if (copy?.textContent.trim()) caption.replaceChildren(...copy.childNodes);
    else caption.textContent = selected.proof.title || '';
    caption.hidden = !caption.textContent.trim();
  };
  const describe = source => {
    const proof = allowed.get(source.getAttribute('data-gazette-image'));
    if (!proof || !proof.alt.trim()) return null;
    const suppliedCaption = source.closest('figure')?.querySelector(':scope > figcaption');
    // An enhancement names the exact compiled occurrence it replaces. Its
    // complete wrapper travels intact, preserving drawing state and controls.
    const replacements = [...document.querySelectorAll('[data-gazette-image-ref]')]
      .filter(node => node.getAttribute('data-gazette-image-ref') === proof.address);
    if (replacements.length > 1) return null;
    const drawing = replacements[0];
    if (drawing) {
      if (drawing.contains(source) || (!article.contains(drawing) && !drawing.closest('.reading-notes__body') && moved?.node !== drawing)) return null;
      if (!visible(drawing)) return null;
      return { proof, drawing, alt: proof.alt, caption: suppliedCaption };
    }
    // A drawing may replace its static fallback after this module mounts. Its
    // hidden image must not leave an action that opens a different picture.
    if (!visible(source)) return null;
    const url = source.currentSrc || source.src;
    const current = proof.responsive
      ? url === destination(proof) || candidates(proof).some(candidate => candidate.url === url)
      : admitted(proof, url) && url === source.src;
    if (!current || !admitted(proof, source.src) || !source.complete || source.naturalWidth < 1) return null;
    const vector = scalable(url);
    const width = proof.intrinsic?.width || source.naturalWidth;
    const height = proof.intrinsic?.height || source.naturalHeight;
    if (!vector && width <= Math.ceil(source.clientWidth || 0)) return null;
    return { url, proof, vector, width, height, alt: proof.alt, caption: suppliedCaption };
  };
  const offers = [];
  for (const source of article.querySelectorAll('.publication-body img,.reading-notes__body img')) {
    const proof = allowed.get(source.getAttribute('data-gazette-image'));
    if (proof && admitted(proof, source.src)) {
      sources.push({ source, proof });
      if (Number.isSafeInteger(proof.width) && proof.width > 0) source.setAttribute('width', proof.width);
    }
    if (source.closest('[data-media-inspection="off"]') || source.closest('.cinematic-still')) continue;
    let control = null;
    const offer = () => {
      const media = describe(source);
      const original = source.closest('a') || source.closest('picture') || source;
      const owningFigure = source.closest('figure');
      const standalone = source.closest('[data-gazette-image-block]') || (original.parentNode === owningFigure ? owningFigure : null);
      // Reserve the action while a described standalone image loads, rather
      // than moving the following paragraph when its load event arrives.
      const pending = !media && standalone && proof?.alt.trim() && admitted(proof, source.src) && !source.complete && visible(source);
      if (!control && !media && !pending) return;
      if (!control) {
        control = document.createElement('button');
        control.type = 'button'; control.className = 'control control--quiet media-inspection-control';
        control.textContent = label;
        control.setAttribute('aria-haspopup', 'dialog');
        control.addEventListener('click', () => {
          if (printing) return;
          selected = describe(source);
          if (selected) open(control);
          else control.hidden = true;
        });
      }
      const unavailable = !media && !pending;
      if (control.hidden !== unavailable) control.hidden = unavailable;
      control.setAttribute('aria-label', `${label}: ${media?.alt || proof.alt}`);
      if (pending) {
        control.setAttribute('data-media-pending', '');
        control.setAttribute('aria-hidden', 'true'); control.setAttribute('tabindex', '-1');
      } else {
        control.removeAttribute('data-media-pending');
        control.removeAttribute('aria-hidden'); control.removeAttribute('tabindex');
      }
      if (standalone) control.setAttribute('data-media-standalone', '');
      // Keep an enhancement's action beneath its complete wrapper, even when
      // that wrapper sits outside the original fallback's paragraph.
      const drawing = standalone && media?.drawing;
      if (drawing && drawing.getAttribute('data-media-standalone') === null) drawing.setAttribute('data-media-standalone', '');
      const rendered = drawing ? moved?.node === drawing ? moved.placeholder : drawing : source;
      const anchor = rendered.closest('a') || rendered.closest('picture') || rendered;
      if (anchor.nextElementSibling !== control) anchor.after(control);
    };
    offers.push({ source, offer });
    offer();
    source.addEventListener('load', offer);
    source.addEventListener('error', offer);
    // The inline rendering changes with the layout, so the comparison does too.
    if (typeof ResizeObserver === 'function') new ResizeObserver(offer).observe(source);
  }
  // Visibility can change through an ancestor without resizing the image.
  // Watch those changes, including a restored fallback, rather than retaining
  // the state in which the image happened to load.
  const visibility = new MutationObserver(records => {
    for (const { source, offer } of offers) {
      if (records.some(({ type, target }) => type === 'childList' || target === source || target.contains(source) || target.getAttribute('data-gazette-image-ref') !== null)) offer();
    }
  });
  visibility.observe(article, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden', 'open', 'class', 'style', 'src', 'srcset', 'data-gazette-image-ref'] });
  window.addEventListener('resize', () => { offers.forEach(({ offer }) => offer()); sizeView(); });
  const appearance = new MutationObserver(sync);
  appearance.observe(root, { attributes: true, attributeFilter: ['data-mode'] });
  scheme.addEventListener('change', sync);
  print.addEventListener('change', sync);
  window.addEventListener('beforeprint', () => {
    if (!printing && selected?.drawing?.contains(document.activeElement)) printFocus = document.activeElement;
    printing = true; sync();
  });
  window.addEventListener('afterprint', () => { printing = false; sync(); });
  sync();
  return {
    activate() {
      if (!selected) return;
      active = true; zoom = 0;
      showSelected();
      if (!selected.drawing) { if (viewport) viewport.append(image); else figure.insertBefore(image, caption); }
      showCaption();
      if (sizingEnabled) { enlarge.hidden = false; fit.hidden = false; viewport.scrollLeft = 0; viewport.scrollTop = 0; }
      sizeView(); scrollAccess();
      focusTitle();
    },
    deactivate() {
      active = false;
      printFocus = null;
      restoreDrawing();
      if (sizingEnabled) { clearSize(); viewport.removeAttribute('tabindex'); viewport.removeAttribute('aria-label'); enlarge.hidden = true; fit.hidden = true; }
      scrollAccess();
      image.removeAttribute('src'); image.removeAttribute('data-scalable'); image.alt = '';
      image.remove();
      caption.textContent = ''; caption.hidden = true;
    }
  };
}
