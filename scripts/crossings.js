// The compiler owns destination identity. This only adds a description and the
// optional accessibility enhancement to compiler-rendered text; CSS draws the
// destination mark from compiler-supplied attributes with or without this module.
function describeDestination(link, root) {
    const kind = link.getAttribute('data-gazette-destination-kind');
    if (kind === 'external') {
      const rels = new Set((link.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
      rels.add('external');
      link.setAttribute('rel', [...rels].join(' '));
    }
    const description = root.getElementById?.(kind === 'cross-site' ? 'crossing-description' : 'external-description');
    if (!description?.textContent.trim()) return;
    const ids = new Set((link.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    ids.add(description.id);
    link.setAttribute('aria-describedby', [...ids].join(' '));
}

// Links created in the browser carry the same compiler-supplied facts as the template macro.
// The caller supplies source/target identities; URLs are never inspected here.
export function applyDestination(link, destination, sourceSite = '', root = document) {
  const site = typeof destination?.site === 'string' ? destination.site : '';
  const kind = destination?.kind || (site && sourceSite ? (site === sourceSite ? 'internal-native' : 'cross-site') : '');
  if (!['internal-native','cross-site','external','resource'].includes(kind)) return;
  link.setAttribute('data-gazette-destination-kind', kind);
  link.setAttribute('data-relationship', kind === 'cross-site' ? 'crossing' : kind === 'external' ? 'external' : 'native');
  if (site) link.setAttribute('data-gazette-destination-site', site);
  if (typeof destination.content === 'string') link.setAttribute('data-gazette-destination-content', destination.content);
  if (Array.isArray(destination.relationships) && destination.relationships.length) link.setAttribute('data-gazette-destination-relationships', destination.relationships.join(' '));
  if (typeof destination.presentation?.theme === 'string') link.setAttribute('data-gazette-destination-theme', destination.presentation.theme);
  if (typeof destination.presentation?.palette === 'string') link.setAttribute('data-gazette-destination-palette', destination.presentation.palette);
  if (kind === 'cross-site' || kind === 'external') describeDestination(link, root);
}

export function mountCrossings(root = document) {
  for (const link of root.querySelectorAll('a[data-gazette-destination-kind="cross-site"], a[data-gazette-destination-kind="external"]')) {
    describeDestination(link, root);
  }
}
