import { mountDepthCarousel } from './depth-carousel.js';

// The compiler owns membership, chronology, pagination and the Latest record.
// Add Search's finite carousel while keeping browser scrolling and the original list.
export function mountArticleListings(container = document) {
  return [...container.querySelectorAll('[data-article-listing]')].map(root => {
    const list = root.querySelector('.reading-list');
    const controls = root.querySelector('.article-listing__controls');
    if (!list || !controls) return null;
    return mountDepthCarousel({ root, list, controls, keyboardTarget: [list, controls],
      cards: [...list.querySelectorAll('.reading-list__entry')],
      enhancedClass: 'article-listing--depth',
    });
  }).filter(Boolean);
}
