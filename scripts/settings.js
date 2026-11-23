import { syncImageModes, watchImageModes } from './image-modes.js';

const contracts = {
  'color-mode': { attribute: 'data-mode', values: ['light', 'dark', 'system'] },
  'motion-preference': { attribute: 'data-motion', values: ['reduce', 'allow'] }
};

export function mountSettings(tenant) {
  const root = document.documentElement;
  // The head script may already have restored an explicit colour mode.
  watchImageModes();
  for (const [key, contract] of Object.entries(contracts)) {
    const group = tenant.querySelector(`[data-setting="${key}"]`);
    if (!group) continue;
    const defaultMode = key === 'color-mode' && getComputedStyle(root).colorScheme === 'dark'
      ? 'dark' : 'system';
    const selected = root.getAttribute(contract.attribute) || defaultMode;
    for (const input of group.querySelectorAll('input[type="radio"]')) {
      input.checked = input.value === selected;
      const applyChoice = () => {
        if (!input.checked) return;
        const value = contract.values.includes(input.value) ? input.value : null;
        if (value) root.setAttribute(contract.attribute, value);
        else root.removeAttribute(contract.attribute);
        if (key === 'color-mode') syncImageModes();
        const status = tenant.querySelector('[data-settings-status]');
        try {
          if (value) window.localStorage.setItem(key, value);
          else window.localStorage.removeItem(key);
          if (status) status.textContent = '';
        } catch (_) {
          if (status) status.textContent = status.getAttribute('data-storage-unavailable') || '';
        }
        if (key === 'motion-preference') {
          document.dispatchEvent(new CustomEvent('motion-preference', { detail: { motion: value } }));
        }
      };
      input.addEventListener('change', applyChoice);
      input.addEventListener('click', () => {
        if (key === 'color-mode' && !root.hasAttribute(contract.attribute)) applyChoice();
      });
    }
  }
}
