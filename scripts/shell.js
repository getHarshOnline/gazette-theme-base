import { mountSettings } from '@base/settings';
import { mountDeferredSearch } from './deferred-search.js';
import { mountReadingPosition } from './reading-position.js';
import { mountReadingNavigation } from './reading-navigation.js';
import { mountReadingFocus } from './reading-focus.js';
import { mountMediaViewer } from './media-viewer.js';
import { mountReadingDisclosures } from './reading-disclosures.js';
import { mountSelectionAssistance } from './selection-assistance.js';
import { mountReadingOverflow } from './reading-overflow.js';
import { mountTemplateFocusReveals } from './focus-reveal.js';
import { mountContentDecks } from './quote-deck.js';
import { mountFolderCards } from './folder-card.js';
import { mountDiscoveryExplorers } from './discovery-explorer.js';
import { mountArticleListings } from './article-listing.js';
import { mountCrossings } from './crossings.js';
import { mountReturnFocus, rememberSearchReturn } from './return-focus.js';

mountCrossings();
let restoreSearchFromHistory = null;
mountReturnFocus({ restoreSearch: (snapshot, context) => restoreSearchFromHistory?.(snapshot, context) });
mountReadingOverflow();
mountTemplateFocusReveals();
mountContentDecks();
mountFolderCards();
mountDiscoveryExplorers();
mountArticleListings();
mountSelectionAssistance();
document.querySelectorAll('[data-search-shortcut]').forEach(hint => {
  hint.textContent = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || '') ? '⌘ K' : 'Ctrl K';
  const trigger = hint.parentNode;
  const label = trigger?.getAttribute('data-search-label');
  if (label) trigger.setAttribute('aria-label', `${label}, ${hint.textContent}`);
});
const fullSearchPage = document.querySelector('.search-page');
if (fullSearchPage) {
  void import('@base/search').then(({ mountSearchPage }) => {
    mountSearchPage(fullSearchPage, JSON.parse(document.getElementById('search-corpus')?.textContent || 'null'));
  }).catch(() => { /* The HTML catalogue remains usable when enhancement cannot load. */ });
}

// The same navigation remains usable without scripts. CSS decides when its
// disclosure is needed; the module does not duplicate a layout breakpoint.
const header = document.querySelector('.frame__header');
// World mastheads may occupy more than one row. Reading anchors use the actual
// sticky obstruction. Without the navigation controller, the header stays in
// document flow and CSS leaves no sticky obstruction to reserve.
if (header) {
  const measureChrome = () => {
    const height = header.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--frame-header-height', `${height}px`);
    const obstruction = ['fixed', 'sticky'].includes(getComputedStyle(header).position) ? height : 0;
    document.documentElement.style.setProperty('--frame-chrome', `${obstruction}px`);
  };
  new ResizeObserver(measureChrome).observe(header);
  window.addEventListener('resize', measureChrome, { passive: true });
  window.addEventListener('pageshow', () => requestAnimationFrame(() => {
    measureChrome();
    let target;
    try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (_) { return; }
    if (!target) return;
    const top = target.getBoundingClientRect().top;
    const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--frame-chrome')) || 0;
    if (top >= 0 && top < chrome) window.scrollBy({ top: top - chrome, behavior: 'instant' });
  }));
  measureChrome();
}

const menu = header?.querySelector('.frame__menu');
const navigation = header?.querySelector('.frame__nav');
let closeMenu = () => {};
let closeReadingNavigation = () => {};
if (menu && navigation) {
  let expanded = false;
  let compactScroll = null;
  const restoreCompactScroll = () => {
    if (compactScroll && (window.scrollX !== compactScroll.left || window.scrollY !== compactScroll.top)) {
      window.scrollTo({ ...compactScroll, behavior: 'instant' });
    }
  };
  const compact = () => getComputedStyle(menu).display !== 'none';
  const sync = () => {
    const isCompact = compact();
    // Describe the CSS-selected form so every page can use its world's directory.
    // This attribute must never control the Menu button's own visibility.
    header.setAttribute('data-navigation-mode', isCompact ? 'compact' : 'direct');
    const visible = !isCompact || expanded || navigation.contains(document.activeElement);
    const overlay = isCompact && visible;
    if (overlay && !compactScroll) compactScroll = { left: window.scrollX, top: window.scrollY };
    menu.setAttribute('aria-expanded', String(visible));
    navigation.setAttribute('data-collapsed', String(!visible));
    if (!overlay && compactScroll) {
      restoreCompactScroll();
      compactScroll = null;
    }
  };
  closeMenu = () => { expanded = false; sync(); };
  menu.hidden = false;
  menu.addEventListener('click', () => {
    closeReadingNavigation();
    expanded = menu.getAttribute('aria-expanded') !== 'true';
    sync();
  });
  header.addEventListener('keydown', event => {
    if (event.target.closest('dialog')) return;
    if (event.key === 'Escape' && compact() && menu.getAttribute('aria-expanded') === 'true') {
      expanded = false;
      menu.focus();
      sync();
      event.preventDefault();
    }
  });
  document.addEventListener('click', event => {
    if (!header.contains(event.target) && expanded) {
      expanded = false;
      sync();
    }
  });
  header.addEventListener('focusout', event => queueMicrotask(() => {
    if (event.relatedTarget && !header.contains(event.relatedTarget) && expanded && !header.querySelector('dialog[open]') && !header.contains(document.activeElement)) {
      expanded = false;
      sync();
    }
  }));
  new ResizeObserver(sync).observe(header);
  // Focus can scroll the root even with overflow hidden. Keep that movement
  // inside the open directory, then return to the reader's original position.
  window.addEventListener('scroll', restoreCompactScroll, { passive: true });
  window.addEventListener('pageshow', sync);
  sync();
}

mountReadingDisclosures();

const readingPosition = mountReadingPosition();
const readingNavigation = mountReadingNavigation({ position: readingPosition, header, closeMenu });
closeReadingNavigation = () => readingNavigation?.close();
mountReadingFocus({ position: readingPosition, navigation: readingNavigation });

const shell = document.querySelector('[data-shell]');
let dismissForNavigation = null;
if (shell) {
  const dialog = shell.querySelector('dialog');
  const title = shell.querySelector('.shell__title');
  const settings = shell.querySelector('[data-tenant="settings"]');
  const search = shell.querySelector('[data-tenant="search"]');
  const searchPageLink = document.querySelector('.shell__search-page');
  // On the full Search page this entry focuses its field. Away from it,
  // the same anchor remains ordinary navigation, including modifier clicks.
  searchPageLink?.addEventListener('click', event => {
    const query = fullSearchPage?.querySelector('input[name="q"]');
    if (!query || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); closeMenu(); query.focus();
  });
  let origin = null;
  let searchController = null;
  if (dialog && typeof dialog.showModal === 'function') {
    const controllers = new Map();
    let activeController = null;
    let mediaReturn = null;
    let restoreFocus = true;
    if (settings) {
      mountSettings(settings);
      controllers.set('settings', { tenant: settings, activate() { settings.querySelector('input:checked')?.focus(); } });
    }
    if (search) {
      try {
        searchController = mountDeferredSearch(search, JSON.parse(document.getElementById('search-corpus')?.textContent || 'null'), () => dialog.close(), snapshot => rememberSearchReturn(snapshot, origin));
        if (searchController) controllers.set('search', { tenant: search, ...searchController });
      } catch { /* Invalid search binding: keep its trigger hidden; Settings still works. */ }
    }
    const media = shell.querySelector('[data-tenant="media"]');
    if (media) {
      const mediaController = mountMediaViewer(media, invoker => summon('media', invoker), () => title.focus({ preventScroll: true }));
      if (mediaController) controllers.set('media', { tenant: media, ...mediaController });
    }
    const notes = shell.querySelector('[data-tenant="notes"]');
    const disclosure = document.querySelector('.reading-notes');
    const notesBody = disclosure?.querySelector('.reading-notes__body');
    if (notes && notesBody) {
      const home = notesBody.parentNode, next = notesBody.nextSibling;
      let position = 0;
      controllers.set('notes', {
        tenant: notes,
        activate() {
          notes.append(notesBody);
          notes.scrollTop = position;
          title.focus({ preventScroll: true });
        },
        deactivate() {
          if (notesBody.parentNode !== notes) return;
          position = notes.scrollTop;
          home.insertBefore(notesBody, next);
        }
      });
      let printState = null;
      window.addEventListener('beforeprint', () => {
        if (printState) return;
        printState = {
          open: disclosure.open,
          controller: dialog.open && activeController === controllers.get('notes') ? activeController : null,
          focus: document.activeElement,
          top: window.scrollY,
          left: window.scrollX
        };
        // Keep the shell's state intact. Only the one Notes body moves into
        // the printable document; the dialog and backdrop are print-hidden.
        printState.controller?.deactivate();
        disclosure.open = true;
      });
      window.addEventListener('afterprint', () => {
        if (!printState) return;
        const previous = printState;
        printState = null;
        disclosure.open = previous.open;
        if (previous.controller && dialog.open && activeController === previous.controller) {
          previous.controller.activate();
          if (previous.focus?.isConnected) previous.focus.focus({ preventScroll: true });
        }
        window.scrollTo({ top: previous.top, left: previous.left, behavior: 'instant' });
      });
    }
    shell.setAttribute('data-shell-state', 'closed');
    const summon = (name, invoker, restoration) => {
      const controller = controllers.get(name);
      if (!controller) return;
      closeReadingNavigation();
      // Notes already opened in the page stay there until the reader closes them.
      if (name === 'notes' && disclosure.open) return;
      mediaReturn = name === 'media' && activeController === controllers.get('notes')
        ? { controller: activeController, invoker } : null;
      if (!dialog.open) origin = invoker;
      restoreFocus = true;
      activeController?.deactivate?.();
      activeController = controller;
      for (const tenant of shell.querySelectorAll('[data-tenant]')) tenant.hidden = tenant !== controller.tenant;
      title.textContent = controller.tenant.getAttribute('data-tenant-title');
      if (!dialog.open) dialog.showModal();
      shell.setAttribute('data-shell-state', 'open');
      controller.activate(restoration);
    };
    const returnFromMedia = () => {
      if (!mediaReturn || activeController !== controllers.get('media')) return false;
      const previous = mediaReturn; mediaReturn = null;
      activeController.deactivate?.();
      activeController = previous.controller;
      for (const tenant of shell.querySelectorAll('[data-tenant]')) tenant.hidden = tenant !== activeController.tenant;
      title.textContent = activeController.tenant.getAttribute('data-tenant-title');
      activeController.activate();
      if (previous.invoker?.isConnected && previous.invoker.getClientRects().length) previous.invoker.focus({ preventScroll: true });
      return true;
    };
    restoreSearchFromHistory = (snapshot, context) => {
      if (!context.isCurrent() || dialog.open || !controllers.has('search')) return;
      const available = element => element?.isConnected && element.getClientRects().length;
      const trigger = document.querySelector('[data-command-trigger="search"]');
      const invoker = available(context.invoker) ? context.invoker : available(menu) ? menu : trigger;
      summon('search', invoker, { restore: snapshot, isCurrent: context.isCurrent });
    };
    dismissForNavigation = () => {
      if (!dialog.open) return;
      restoreFocus = false;
      activeController?.deactivate?.();
      activeController = null;
      dialog.close();
    };
    for (const trigger of document.querySelectorAll('[data-command-trigger]')) {
      const name = trigger.getAttribute('data-command-trigger');
      if (!controllers.has(name)) continue;
      trigger.hidden = false;
      trigger.addEventListener('click', event => {
        if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        summon(name, trigger);
      });
    }
    document.addEventListener('keydown', event => {
      if (event.isComposing || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      if (dialog.open) return;
      if (searchPageLink) {
        event.preventDefault();
        const query = fullSearchPage?.querySelector('input[name="q"]');
        if (query) query.focus(); else window.location.assign(searchPageLink.href);
        return;
      }
      if (!controllers.has('search')) return;
      event.preventDefault(); summon('search', document.activeElement);
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || event.isComposing) return;
      const controls = [...dialog.querySelectorAll('button, input, a[href], [tabindex]')]
        .filter(control => !control.disabled && control.tabIndex >= 0 && control.getClientRects().length)
        .filter(control => control.type !== 'radio' || control.checked
          || ![...dialog.querySelectorAll('input[type="radio"]')].some(radio => radio.name === control.name && radio.checked));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    });
    shell.querySelector('.shell__close').addEventListener('click', () => { if (!returnFromMedia()) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (returnFromMedia()) event.preventDefault(); });
    dialog.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (link && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        const destination = new URL(link.href, location.href);
        if (destination.origin === location.origin && destination.pathname === location.pathname && destination.search === location.search && destination.hash) {
          dismissForNavigation();
          // Also reconcile a link to the fragment already in the address bar.
          requestAnimationFrame(revealFragment);
        }
      }
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
        if (!returnFromMedia()) dialog.close();
      }
    });
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      activeController?.deactivate?.();
      activeController = null;
      mediaReturn = null;
      shell.setAttribute('data-shell-state', 'closed');
      if (!restoreFocus) return;
      const returnTo = origin?.isConnected && origin.getClientRects().length ? origin : menu;
      returnTo?.focus({ preventScroll: true });
    });
  }
}

// Notes stay outside the main argument. A fragment pointing into Notes opens that disclosure.
function revealFragment() {
  let id;
  try { id = decodeURIComponent(window.location.hash.slice(1)); } catch (_) { return; }
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  dismissForNavigation?.();
  const notes = target.closest('.reading-notes');
  if (!notes) return;
  notes.open = true;
  target.scrollIntoView();
  const focus = target === notes ? notes.querySelector('summary') : target;
  focus.setAttribute('tabindex', '-1');
  focus.focus({ preventScroll: true });
}
window.addEventListener('hashchange', revealFragment);
window.addEventListener('pageshow', revealFragment);
document.addEventListener('beforematch', event => {
  const notes = event.target.closest('.reading-notes');
  if (notes) notes.open = true;
});
revealFragment();
