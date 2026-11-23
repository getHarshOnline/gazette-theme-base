// The dialog opens immediately; its search code loads only when summoned.
export function mountDeferredSearch(tenant, binding, dismiss, rememberResult) {
  if (!binding || !['lexical', 'english'].includes(binding.profile)) return null;
  const input = tenant.querySelector('input');
  const status = tenant.querySelector('[role="status"]');
  const retry = tenant.querySelector('[data-search-retry]');
  if (!input || !status) return null;
  let controller = null, pending = null, active = false, generation = 0;
  let restoration;
  const state = name => {
    status.textContent = status.getAttribute(`data-status-${name}`) || '';
    if (retry) retry.hidden = name !== 'unavailable';
  };
  const prepare = () => {
    if (controller) return Promise.resolve(controller);
    pending ??= import('@base/search').then(({ mountSearch }) => {
      controller = mountSearch(tenant, binding, dismiss, rememberResult);
      if (!controller) throw new Error('Search binding is unavailable.');
      retry?.removeEventListener('click', retryLoad);
      return controller;
    }).finally(() => { pending = null; });
    return pending;
  };
  const activate = async context => {
    active = true;
    restoration = context;
    const expected = ++generation;
    if (controller) { controller.activate(context); return; }
    input.focus({ preventScroll: true });
    state('loading');
    try {
      const ready = await prepare();
      if (active && generation === expected && (!context?.isCurrent || context.isCurrent())) ready.activate(context);
    } catch {
      if (active && generation === expected) state('unavailable');
    }
  };
  const retryLoad = () => { if (!controller) void activate(restoration); };
  retry?.addEventListener('click', retryLoad);
  return {
    activate(context) { void activate(context); },
    deactivate() { active = false; generation++; controller?.deactivate?.(); }
  };
}
