import { mountDepthCarousel } from './depth-carousel.js';
export { depthPose } from './depth-carousel.js';

// Search and authored article listings share one carousel with browser scrolling.
export function mountSearchExplorer({ root, list, cards, onSelect }) {
  return mountDepthCarousel({ root, list, cards, onSelect,
    controls: root.querySelector('.search-depth__controls'),
    keyboardTarget: root.querySelector('.search-page__matches'),
    enhancedClass: 'search-page--depth', activeAttribute: 'data-search-active',
    previousSelector: '[data-search-depth-previous]', nextSelector: '[data-search-depth-next]',
  });
}
