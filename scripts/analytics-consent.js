import { createAnalytics } from '@base/analytics';

// The compiler supplies public coordinates; the SDK owns transport and its event vocabulary.
export function mountAnalyticsConsent(tenant) {
  const field = tenant.querySelector('[data-analytics-consent]');
  if (!field) return null;
  const document = tenant.ownerDocument;
  const browser = document.defaultView;
  const status = field.querySelector('[data-analytics-status]');
  const warning = field.querySelector('[data-analytics-storage]');
  const reload = field.querySelector('[data-analytics-reload]');
  const choices = [...field.querySelectorAll('input[type="radio"]')];
  if (!status || !warning || !reload || choices.length !== 2) return null;
  let analytics, coordinates, storageKey;
  try {
    const data = JSON.parse(field.querySelector('[data-analytics-binding]').textContent);
    if (data.binding.contract !== 'publication-analytics-v1') return null;
    coordinates = data.coordinates;
    analytics = createAnalytics({ measurementId: data.binding.measurement_id, publicPageUrl: data.publicPageUrl }, browser);
    // Validate before activating the controls. Withheld events are neither sent nor queued.
    analytics.event('content_view', coordinates);
    storageKey = `gazette:analytics:${data.binding.measurement_id}`;
  } catch { return null; }

  let choice = 'decline', viewed = false, disposed = false;
  const buttons = new Set(['services-footer', 'services-invitation', 'services-link', 'enquiry-email']);
  const seen = new Set();
  let observer = null;
  const active = () => !disposed && choice === 'allow'
    && analytics.status().consent === 'granted' && analytics.status().tag === 'loaded';
  const marker = anchor => anchor?.hasAttribute('href')
    && buttons.has(anchor.getAttribute('data-enquiry-button')) ? anchor.getAttribute('data-enquiry-button') : null;
  const submit = (name, button) => {
    if (!active()) return;
    try { analytics.event(name, { site: coordinates.site, content: coordinates.content, button }); }
    catch { /* A refused observation must not interfere with ordinary navigation. */ }
  };
  const click = event => {
    if (!active() || event.defaultPrevented || (event.button !== undefined && event.button !== 0)) return;
    const target = event.target?.closest ? event.target : event.target?.parentElement;
    const anchor = target?.closest('a[data-enquiry-button]');
    const button = marker(anchor);
    if (!button) return;
    submit(button === 'enquiry-email' ? 'intake_start' : 'cta_click', button);
    if (button !== 'enquiry-email' && anchor.getAttribute('data-gazette-destination-kind') === 'cross-site') {
      submit('cross_site_navigate', button);
    }
  };
  const observeViews = () => {
    observer?.disconnect();
    if (!active() || document.visibilityState !== 'visible'
        || typeof browser.IntersectionObserver !== 'function'
        || !browser.IntersectionObserverEntry?.prototype
        || !('isVisible' in browser.IntersectionObserverEntry.prototype)) return;
    try { observer ??= new browser.IntersectionObserver(entries => {
      if (!active() || document.visibilityState !== 'visible') return;
      for (const entry of entries) {
        const button = marker(entry.target);
        if (!button || seen.has(button) || !entry.isIntersecting || entry.intersectionRatio < 0.5 || entry.isVisible !== true) continue;
        submit('cta_view', button);
        seen.add(button);
        observer.unobserve(entry.target);
      }
    }, { trackVisibility: true, delay: 100, threshold: 0.5 }); }
    catch { observer = null; return; }
    for (const anchor of document.querySelectorAll('a[data-enquiry-button]')) {
      const button = marker(anchor);
      if (button && !seen.has(button)) observer.observe(anchor);
    }
  };
  const stopObserving = () => {
    observer?.disconnect();
    observer = null;
    document.removeEventListener('click', click);
    document.removeEventListener('visibilitychange', observeViews);
  };
  const say = key => { status.textContent = field.getAttribute(`data-status-${key}`) || ''; };
  const select = value => {
    choice = value;
    choices.forEach(input => { input.checked = input.value === value; });
  };
  const savedChoice = () => {
    try { return browser.localStorage.getItem(storageKey); }
    catch { return null; }
  };
  const save = value => {
    try {
      browser.localStorage.setItem(storageKey, value);
      if (browser.localStorage.getItem(storageKey) !== value) throw new Error('unsaved');
      warning.hidden = true;
      return true;
    } catch {
      warning.hidden = false;
      return false;
    }
  };
  const stop = () => {
    stopObserving();
    if (analytics.status().consent === 'granted') analytics.withdraw();
    reload.hidden = true;
    say('off');
  };
  const start = async () => {
    if (analytics.status().consent === 'withdrawn') {
      reload.hidden = false;
      say('reload');
      return;
    }
    say('loading');
    try {
      const result = await analytics.grant();
      if (disposed || choice !== 'allow' || result.consent !== 'granted' || analytics.status().consent !== 'granted') return;
      if (result.tag !== 'loaded') { say('failed'); return; }
      if (!viewed) {
        analytics.event('content_view', coordinates);
        viewed = true;
      }
      document.addEventListener('click', click);
      document.addEventListener('visibilitychange', observeViews);
      observeViews();
      say('on');
    } catch {
      if (!disposed && choice === 'allow') { reload.hidden = false; say('failed'); }
    }
  };
  const change = event => {
    if (disposed || !event.target.checked) return;
    const value = event.target.value;
    if (value !== 'allow' && value !== 'decline') return;
    // Withdrawal takes effect even when a browser can no longer save preferences.
    if (value === 'decline') { select(value); stop(); save(value); return; }
    if (!save(value)) { select('decline'); stop(); return; }
    select(value);
    void start();
  };
  const reconcile = event => {
    if (disposed) return;
    if (event.type === 'storage') {
      if (event.key !== null && event.key !== storageKey) return;
      try { if (event.storageArea && event.storageArea !== browser.localStorage) return; }
      catch { /* Inaccessible storage also withholds analytics. */ }
    }
    // A grant in another tab applies on the next document; a withdrawal applies now.
    if (savedChoice() !== 'allow') { select('decline'); stop(); }
  };
  const refresh = () => {
    if (!disposed && choice === 'allow' && save('allow')) browser.location.reload();
  };
  choices.forEach(input => input.addEventListener('change', change));
  reload.addEventListener('click', refresh);
  browser.addEventListener('storage', reconcile);
  browser.addEventListener('pageshow', reconcile);
  field.hidden = false;
  select('decline');
  say('off');
  if (savedChoice() === 'allow') { select('allow'); void start(); }
  return {
    status: () => analytics.status(),
    dispose() {
      disposed = true;
      stop();
      choices.forEach(input => input.removeEventListener('change', change));
      reload.removeEventListener('click', refresh);
      browser.removeEventListener('storage', reconcile);
      browser.removeEventListener('pageshow', reconcile);
      field.hidden = true;
    }
  };
}

// Wait for deferred modules: a saved choice needs working withdrawal controls.
if (typeof document !== 'undefined') {
  const mount = () => {
    const shell = document.querySelector('[data-shell]');
    const dialog = shell?.querySelector('dialog');
    const trigger = shell?.querySelector('[data-command-trigger="settings"]');
    const tenant = shell?.querySelector('[data-tenant="settings"]');
    if (tenant && dialog && typeof dialog.showModal === 'function' && trigger && !trigger.hidden) {
      mountAnalyticsConsent(tenant);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}
