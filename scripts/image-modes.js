// Gazette emits an image's dark rendition as a picture source whose media
// matches the Theme's starting colour mode, so the browser chooses before any
// script runs. An explicit reader choice replaces that condition: dark always
// applies, light never does, and System follows the operating system. With no
// choice the source keeps the media Gazette emitted. A printed page is light, so
// printing uses the default image.
const followSystem = '(prefers-color-scheme: dark)';
let printing = false;
let watching = false;

export function syncImageModes(scope = document) {
  const mode = document.documentElement.getAttribute('data-mode');
  for (const source of scope.querySelectorAll('source[data-gazette-image-mode="dark"]')) {
    if (!source.hasAttribute('data-gazette-image-media')) source.setAttribute('data-gazette-image-media', source.getAttribute('media') || 'all');
    const media = printing || mode === 'light' ? 'not all'
      : mode === 'dark' ? 'all'
        : mode === 'system' ? followSystem
          : source.getAttribute('data-gazette-image-media');
    if (source.getAttribute('media') !== media) source.setAttribute('media', media);
  }
}

export function watchImageModes() {
  syncImageModes();
  if (watching) return;
  watching = true;
  window.addEventListener('beforeprint', () => { printing = true; syncImageModes(); });
  window.addEventListener('afterprint', () => { printing = false; syncImageModes(); });
}
